import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags } from 'discord.js';
import { getTicket, saveTicket, isTicketStaff, closeTicket, ticketBans, PRIORITIES, reviewModal, postReview } from '../modules/tickets.js';
import { kvSet, kvGet, kvList } from '../db.js';
import { ok, err, COLORS } from '../util.js';

function needTicket(i) {
  const t = getTicket(i.channelId);
  if (!t || t.closed) { i.reply(err('Cette commande s\'utilise dans un ticket.')); return null; }
  return t;
}

export const commands = [
  {
    module: 'tickets',
    data: new SlashCommandBuilder().setName('ticket').setDescription('Gérer le ticket actuel et ses membres.').setDMPermission(false)
      .addSubcommand(s => s.setName('add').setDescription('Ajouter un membre au ticket').addUserOption(o => o.setName('user').setDescription('Membre').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Retirer un membre du ticket').addUserOption(o => o.setName('user').setDescription('Membre').setRequired(true)))
      .addSubcommand(s => s.setName('rename').setDescription('Renommer le ticket').addStringOption(o => o.setName('name').setDescription('Nouveau nom').setRequired(true)))
      .addSubcommand(s => s.setName('priority').setDescription('Changer la priorité').addStringOption(o => o.setName('level').setDescription('Priorité').setRequired(true).addChoices(...Object.entries(PRIORITIES).map(([v, n]) => ({ name: n, value: v })))))
      .addSubcommand(s => s.setName('close').setDescription('Fermer le ticket (avec transcript)').addStringOption(o => o.setName('reason').setDescription('Raison')))
      .addSubcommand(s => s.setName('delete').setDescription('Supprimer le ticket sans transcript'))
      .addSubcommand(s => s.setName('transfer').setDescription('Transférer le ticket à une autre catégorie'))
      .addSubcommand(s => s.setName('ban').setDescription('Bannir / débannir un membre des tickets').addUserOption(o => o.setName('user').setDescription('Membre').setRequired(true)))
      .addSubcommand(s => s.setName('ping').setDescription('Relancer le membre du ticket'))
      .addSubcommand(s => s.setName('autoclose').setDescription('Activer / désactiver la fermeture auto de ce ticket'))
      .addSubcommand(s => s.setName('review').setDescription('Voir les derniers avis des tickets')),
    async run(i) {
      const sub = i.options.getSubcommand();
      if (sub === 'review') {
        const list = kvGet('reviews', i.guildId, []).slice(0, 10);
        const avg = list.length ? (list.reduce((a, r) => a + r.stars, 0) / list.length).toFixed(1) : '—';
        return i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warn).setTitle(`⭐ Avis (moyenne ${avg}/5)`).setDescription(list.map(r => `${'⭐'.repeat(r.stars)} <@${r.user}> · ${r.label}\n> ${r.comment || '…'}`).join('\n') || 'Aucun avis.')] });
      }
      if (sub === 'ban') {
        if (!isTicketStaff(i.member, null)) return i.reply(err('Réservé au staff.'));
        const u = i.options.getUser('user'); const bans = ticketBans(i.guildId);
        const has = bans.includes(u.id);
        kvSet('ticketban', i.guildId, has ? bans.filter(x => x !== u.id) : [...bans, u.id]);
        return i.reply(ok(has ? `${u} peut à nouveau ouvrir des tickets.` : `${u} ne peut plus ouvrir de tickets.`));
      }
      const t = needTicket(i); if (!t) return;
      const staff = isTicketStaff(i.member, t);
      if (!staff && sub !== 'close') return i.reply(err('Réservé au staff.'));
      if (sub === 'close' && !staff && t.owner !== i.user.id) return i.reply(err('Tu ne peux pas fermer ce ticket.'));
      switch (sub) {
        case 'add': { const u = i.options.getUser('user'); await i.channel.permissionOverwrites.edit(u.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }); return i.reply(ok(`${u} a été ajouté au ticket.`)); }
        case 'remove': { const u = i.options.getUser('user'); if (u.id === t.owner) return i.reply(err('Impossible de retirer le créateur.')); await i.channel.permissionOverwrites.delete(u.id); return i.reply(ok(`${u} a été retiré du ticket.`)); }
        case 'rename': { await i.channel.setName(i.options.getString('name')); return i.reply(ok('Ticket renommé.')); }
        case 'priority': {
          const lv = i.options.getString('level'); t.priority = lv; saveTicket(i.channelId, t);
          const icon = { low: '🟢', normal: '🟡', high: '🟠', urgent: '🔴' }[lv];
          await i.channel.setName(`${icon}${i.channel.name.replace(/^[🟢🟡🟠🔴]/u, '')}`).catch(() => {});
          return i.reply(ok(`Priorité : **${PRIORITIES[lv]}**`));
        }
        case 'close': await i.reply(ok('Fermeture du ticket…')); return closeTicket(i.channel, i.user, i.options.getString('reason') || 'Aucune raison');
        case 'delete': t.closed = true; saveTicket(i.channelId, t); await i.reply(ok('Suppression…')); return setTimeout(() => i.channel.delete().catch(() => {}), 2000);
        case 'transfer': {
          const { getConfig } = await import('../db.js');
          const types = getConfig(i.guildId).tickets.types;
          if (!types.length) return i.reply(err('Aucune catégorie de ticket configurée.'));
          return i.reply({ content: 'Vers quelle catégorie ?', flags: MessageFlags.Ephemeral, components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tkx:type').addOptions(types.slice(0, 25).map((x, idx) => ({ label: x.label || `Catégorie ${idx + 1}`, value: String(idx), emoji: x.emoji || undefined }))))] });
        }
        case 'ping': return i.reply({ content: `<@${t.owner}>`, embeds: [new EmbedBuilder().setColor(COLORS.warn).setDescription('🔔 Le staff attend ta réponse dans ce ticket !')] });
        case 'autoclose': t.autoclose = t.autoclose === false; saveTicket(i.channelId, t); return i.reply(ok(`Fermeture automatique ${t.autoclose ? 'activée' : 'désactivée'} pour ce ticket.`));
      }
    },
    setupComponents(client) {},
  },
  {
    module: 'tickets',
    data: new SlashCommandBuilder().setName('transfer').setDescription('Transférer la prise en charge (claim) du ticket actuel à un autre membre du staff.').setDMPermission(false)
      .addUserOption(o => o.setName('user').setDescription('Membre du staff').setRequired(true)),
    async run(i) {
      const t = needTicket(i); if (!t) return;
      if (!isTicketStaff(i.member, t)) return i.reply(err('Réservé au staff.'));
      const m = i.options.getMember('user');
      if (!m || !isTicketStaff(m, t)) return i.reply(err('Ce membre ne fait pas partie du staff des tickets.'));
      t.claimedBy = m.id; saveTicket(i.channelId, t);
      i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.ok).setDescription(`🔁 Ticket transféré à ${m} par ${i.user}.`)] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('avis').setDescription('Donne ton avis sur ton dernier ticket ou sur le serveur.').setDMPermission(false),
    async run(i) {
      i.showModal(reviewModal('avis:send', `Ton avis sur ${i.guild.name}`.slice(0, 45)));
    },
  },
];

// Composants propres à ces commandes
export function register(client) {
  client.components.set('avis', async (i) => {
    const stars = Math.max(1, Math.min(5, parseInt(i.fields.getTextInputValue('stars')) || 5));
    await postReview(i.client, i.guildId, i.user, stars, i.fields.getTextInputValue('comment'), 'serveur');
    i.reply({ content: '✅ Merci pour ton avis !', flags: MessageFlags.Ephemeral });
  });
  client.components.set('tkx', async (i) => {
    const t = getTicket(i.channelId); if (!t) return;
    const { getConfig } = await import('../db.js');
    const cfg = getConfig(i.guildId).tickets;
    const idx = Number(i.values[0]); const type = cfg.types[idx];
    for (const r of type.roles || []) await i.channel.permissionOverwrites.edit(r, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
    t.type = idx; t.typeLabel = type.label; t.claimedBy = null; saveTicket(i.channelId, t);
    await i.update({ content: '✅ Transféré.', components: [] });
    i.channel.send({ content: (type.roles || []).map(r => `<@&${r}>`).join(' ') || null, embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription(`🔁 Ticket transféré vers **${type.label}**.`)] });
  });
}
export { kvList };
