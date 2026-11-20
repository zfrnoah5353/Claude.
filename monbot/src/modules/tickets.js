import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  EmbedBuilder, ChannelType, PermissionFlagsBits as P, AttachmentBuilder, Events, MessageFlags,
} from 'discord.js';
import { getConfig, kvGet, kvSet, kvDel, kvList, bumpStat } from '../db.js';
import { COLORS, fill, memberVars, sendTo, err, ok, hexColor } from '../util.js';

export const getTicket = (cid) => kvGet('ticket', cid);
export const saveTicket = (cid, t) => kvSet('ticket', cid, t);
export const ticketBans = (gid) => kvGet('ticketban', gid, []);
export const PRIORITIES = { low: '🟢 Basse', normal: '🟡 Normale', high: '🟠 Haute', urgent: '🔴 Urgente' };

export function isTicketStaff(member, t) {
  const cfg = getConfig(member.guild.id).tickets;
  if (member.permissions.has(P.ManageChannels)) return true;
  const type = cfg.types[t?.type] || {};
  return [...(cfg.supportRoles || []), ...(type.roles || [])].some(r => member.roles.cache.has(r));
}

export async function sendPanel(guild) {
  const cfg = getConfig(guild.id).tickets;
  if (!cfg.panelChannel) throw new Error('Choisis d\'abord le salon du panel.');
  const types = cfg.types.length ? cfg.types : [{ label: 'Support', emoji: '🛟', description: 'Ouvrir un ticket' }];
  const e = new EmbedBuilder().setColor(COLORS.main).setTitle(cfg.panelTitle).setDescription(cfg.panelDescription);
  let rows;
  if (cfg.style === 'menu') {
    rows = [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tk:menu').setPlaceholder('Choisis une catégorie…')
      .addOptions(types.slice(0, 25).map((t, idx) => ({ label: t.label || 'Ticket', value: String(idx), description: (t.description || '').slice(0, 100) || undefined, emoji: t.emoji || undefined }))))];
  } else {
    rows = [];
    types.slice(0, 25).forEach((t, idx) => {
      if (idx % 5 === 0) rows.push(new ActionRowBuilder());
      const btn = new ButtonBuilder().setCustomId(`tk:open:${idx}`).setLabel(t.label || 'Ticket').setStyle(ButtonStyle.Primary);
      if (t.emoji) btn.setEmoji(t.emoji);
      rows.at(-1).addComponents(btn);
    });
  }
  const msg = await sendTo(guild, cfg.panelChannel, { embeds: [e], components: rows });
  if (!msg) throw new Error('Impossible d\'envoyer le panel (vérifie mes permissions dans ce salon).');
  return 'Panel de tickets envoyé ✅';
}

async function openTicket(i, typeIdx, answer) {
  const cfg = getConfig(i.guildId).tickets;
  if (!cfg.enabled) return i.reply(err('Les tickets sont désactivés.'));
  if (ticketBans(i.guildId).includes(i.user.id)) return i.reply(err('Tu es banni des tickets.'));
  const open = kvList('ticket').filter(x => x.value?.guild === i.guildId && x.value.owner === i.user.id && !x.value.closed && i.guild.channels.cache.has(x.key));
  if (open.length >= cfg.maxOpen) return i.reply(err(`Tu as déjà un ticket ouvert : <#${open[0].key}>`));
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  const type = cfg.types[typeIdx] || { label: 'Support', roles: [] };
  const n = (kvGet('ticketCount', i.guildId, 0) || 0) + 1; kvSet('ticketCount', i.guildId, n);
  const staff = [...new Set([...(cfg.supportRoles || []), ...(type.roles || [])])].filter(r => i.guild.roles.cache.has(r));
  const ch = await i.guild.channels.create({
    name: `${(type.label || 'ticket').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${String(n).padStart(4, '0')}`,
    type: ChannelType.GuildText,
    parent: cfg.category && i.guild.channels.cache.has(cfg.category) ? cfg.category : null,
    topic: `Ticket #${n} de ${i.user.tag} (${i.user.id})`,
    permissionOverwrites: [
      { id: i.guild.roles.everyone, deny: [P.ViewChannel] },
      { id: i.user.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks] },
      { id: i.client.user.id, allow: [P.ViewChannel, P.SendMessages, P.ManageChannels, P.ReadMessageHistory, P.ManageMessages] },
      ...staff.map(r => ({ id: r, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.ManageMessages] })),
    ],
  });
  const t = { n, guild: i.guildId, owner: i.user.id, type: typeIdx, typeLabel: type.label, claimedBy: null, priority: 'normal', created: Date.now(), lastActivity: Date.now(), closed: false, autoclose: true };
  saveTicket(ch.id, t);
  const e = new EmbedBuilder().setColor(COLORS.main).setTitle(`${type.emoji || '🎫'} Ticket #${n} · ${type.label || 'Support'}`)
    .setDescription(fill(cfg.welcomeMessage, memberVars(i.member)))
    .addFields({ name: 'Priorité', value: PRIORITIES.normal, inline: true }, { name: 'Pris en charge par', value: 'Personne', inline: true });
  if (answer) e.addFields({ name: type.question.slice(0, 256), value: answer.slice(0, 1024) });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tk:claim').setLabel('Prendre en charge').setEmoji('🙋').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tk:close').setLabel('Fermer').setEmoji('🔒').setStyle(ButtonStyle.Danger),
  );
  await ch.send({ content: `${i.user} ${staff.map(r => `<@&${r}>`).join(' ')}`, embeds: [e], components: [row] });
  bumpStat(i.guildId, 'ticket:open');
  await sendTo(i.guild, cfg.logChannel, { embeds: [new EmbedBuilder().setColor(COLORS.ok).setDescription(`🎫 Ticket **#${n}** (${type.label}) ouvert par ${i.user} : ${ch}`).setTimestamp()] });
  i.editReply({ content: `✅ Ton ticket est ouvert : ${ch}` });
}

async function transcript(channel) {
  let all = [], before;
  for (let k = 0; k < 10; k++) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    all.push(...batch.values()); before = batch.last().id;
  }
  all = all.reverse();
  const lines = all.map(m => `[${new Date(m.createdTimestamp).toLocaleString('fr-FR')}] ${m.author.tag}: ${m.content}${m.embeds.length ? ' [embed: ' + (m.embeds[0].title || m.embeds[0].description || '').slice(0, 100) + ']' : ''}${m.attachments.size ? ' ' + m.attachments.map(a => a.url).join(' ') : ''}`);
  return new AttachmentBuilder(Buffer.from(`Transcript de #${channel.name}\n\n${lines.join('\n')}`, 'utf8'), { name: `transcript-${channel.name}.txt` });
}

export async function closeTicket(channel, closer, reason = 'Aucune raison') {
  const t = getTicket(channel.id);
  if (!t || t.closed) return false;
  t.closed = true; t.closedAt = Date.now(); t.closedBy = closer?.id; saveTicket(channel.id, t);
  const cfg = getConfig(channel.guild.id).tickets;
  const file = await transcript(channel);
  const info = new EmbedBuilder().setColor(COLORS.err).setTitle(`🔒 Ticket #${t.n} fermé`)
    .addFields({ name: 'Ouvert par', value: `<@${t.owner}>`, inline: true }, { name: 'Fermé par', value: closer ? `${closer}` : 'Automatique', inline: true }, { name: 'Pris en charge par', value: t.claimedBy ? `<@${t.claimedBy}>` : 'Personne', inline: true }, { name: 'Raison', value: reason })
    .setTimestamp();
  await sendTo(channel.guild, cfg.transcriptChannel || cfg.logChannel, { embeds: [info], files: [file] });
  const owner = await channel.client.users.fetch(t.owner).catch(() => null);
  if (owner) {
    const payload = { embeds: [EmbedBuilder.from(info).setTitle(`🔒 Ton ticket #${t.n} sur ${channel.guild.name} est fermé`)] };
    if (cfg.dmTranscript) payload.files = [await transcript(channel).catch(() => file)];
    if (cfg.review) payload.components = [new ActionRowBuilder().addComponents([1, 2, 3, 4, 5].map(s => new ButtonBuilder().setCustomId(`tk:rate:${channel.guild.id}:${t.n}:${s}`).setLabel('⭐'.repeat(s)).setStyle(ButtonStyle.Secondary)))];
    await owner.send(payload).catch(() => {});
  }
  await channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.err).setDescription('🔒 Ticket fermé. Suppression dans 5 secondes…')] }).catch(() => {});
  setTimeout(() => { channel.delete('Ticket fermé').catch(() => {}); kvDel('ticket', channel.id); }, 5000);
  return true;
}

export function addReview(gid, review) {
  const list = kvGet('reviews', gid, []);
  list.unshift({ ...review, at: Date.now() });
  kvSet('reviews', gid, list.slice(0, 500));
}

export function reviewModal(customId, title) {
  return new ModalBuilder().setCustomId(customId).setTitle(title).addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stars').setLabel('Note sur 5').setStyle(TextInputStyle.Short).setMaxLength(1).setRequired(true).setPlaceholder('5')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('comment').setLabel('Ton avis').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(false)),
  );
}

export async function postReview(client, gid, user, stars, comment, label) {
  addReview(gid, { user: user.id, stars, comment, label });
  const g = client.guilds.cache.get(gid);
  const cfg = getConfig(gid).tickets;
  if (g) await sendTo(g, cfg.logChannel, { embeds: [new EmbedBuilder().setColor(COLORS.warn).setTitle(`⭐ Nouvel avis (${label})`).setDescription(`${'⭐'.repeat(stars)}${'☆'.repeat(5 - stars)}\n${comment || '*Pas de commentaire*'}`).setFooter({ text: user.tag, iconURL: user.displayAvatarURL() })] });
}

export function setup(client) {
  client.panelActions.set('tickets.sendPanel', (guild) => sendPanel(guild));

  client.components.set('tk', async (i, action, ...args) => {
    if (action === 'open' || action === 'menu') {
      const idx = action === 'menu' ? Number(i.values[0]) : Number(args[0]);
      const type = getConfig(i.guildId).tickets.types[idx];
      if (type?.question) {
        return i.showModal(new ModalBuilder().setCustomId(`tk:form:${idx}`).setTitle(`Ticket · ${type.label || 'Support'}`.slice(0, 45)).addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('answer').setLabel(type.question.slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000))));
      }
      return openTicket(i, idx);
    }
    if (action === 'form') return openTicket(i, Number(args[0]), i.fields.getTextInputValue('answer'));
    if (action === 'claim') {
      const t = getTicket(i.channelId); if (!t) return;
      if (!isTicketStaff(i.member, t)) return i.reply(err('Seul le staff peut prendre en charge un ticket.'));
      if (t.claimedBy) return i.reply(err(`Déjà pris en charge par <@${t.claimedBy}>.`));
      t.claimedBy = i.user.id; saveTicket(i.channelId, t);
      const e = EmbedBuilder.from(i.message.embeds[0]); const f = e.data.fields || [];
      const idx = f.findIndex(x => x.name === 'Pris en charge par'); if (idx >= 0) f[idx].value = `${i.user}`;
      await i.update({ embeds: [e.setFields(f)] });
      return i.channel.send({ embeds: [new EmbedBuilder().setColor(COLORS.ok).setDescription(`🙋 ${i.user} prend en charge ce ticket.`)] });
    }
    if (action === 'close') {
      const t = getTicket(i.channelId); if (!t) return;
      if (t.owner !== i.user.id && !isTicketStaff(i.member, t)) return i.reply(err('Tu ne peux pas fermer ce ticket.'));
      return i.reply({ content: 'Fermer ce ticket ?', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tk:closeyes').setLabel('Oui, fermer').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('tk:closeno').setLabel('Annuler').setStyle(ButtonStyle.Secondary))] });
    }
    if (action === 'closeyes') { await i.update({ content: '🔒 Fermeture…', components: [] }); return closeTicket(i.channel, i.user); }
    if (action === 'closeno') return i.update({ content: 'Fermeture annulée.', components: [] });
    if (action === 'rate') {
      const [gid, n, stars] = args;
      return i.showModal(reviewModal(`tk:review:${gid}:${n}:${stars}`, `Avis sur le ticket #${n}`).setComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('comment').setLabel(`Ta note : ${stars}/5. Un commentaire ?`).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000))));
    }
    if (action === 'review') {
      const [gid, n, stars] = args;
      await postReview(i.client, gid, i.user, Number(stars), i.fields.getTextInputValue('comment'), `ticket #${n}`);
      return i.reply({ content: '✅ Merci pour ton avis !', flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  });

  // Activité des tickets (pour la fermeture automatique)
  client.on(Events.MessageCreate, (m) => {
    if (!m.guild || m.author.bot) return;
    const t = getTicket(m.channelId);
    if (t && !t.closed) { t.lastActivity = Date.now(); saveTicket(m.channelId, t); }
  });
  setInterval(async () => {
    for (const { key, value: t } of kvList('ticket')) {
      if (!t || t.closed || t.autoclose === false) continue;
      const hours = getConfig(t.guild).tickets.autoCloseHours;
      if (!hours || Date.now() - t.lastActivity < hours * 3600e3) continue;
      const g = client.guilds.cache.get(t.guild); const c = g?.channels.cache.get(key);
      if (c) await closeTicket(c, null, `Aucune activité depuis ${hours}h`);
      else kvDel('ticket', key);
    }
  }, 10 * 60e3);
}

export { ok };
