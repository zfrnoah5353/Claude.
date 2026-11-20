// Journal de l'activité du serveur
import { Events, EmbedBuilder, AuditLogEvent } from 'discord.js';
import { getConfig, bumpStat } from '../db.js';
import { COLORS, sendTo, ts } from '../util.js';

function L(guild, kind) {
  const c = getConfig(guild.id).logs;
  return c.enabled && c.channel && c[kind] ? c : null;
}
const E = (color, title) => new EmbedBuilder().setColor(color).setTitle(title).setTimestamp();

export function setup(client) {
  client.on(Events.MessageCreate, (m) => { if (m.guild && !m.author.bot) bumpStat(m.guild.id, 'messages'); });

  client.on(Events.MessageDelete, async (m) => {
    if (!m.guild || m.author?.bot) return;
    const c = L(m.guild, 'messages'); if (!c || c.ignored.includes(m.channelId)) return;
    const e = E(COLORS.err, '🗑️ Message supprimé').setDescription(`**Salon :** ${m.channel}\n**Auteur :** ${m.author ?? 'inconnu'}\n\n${(m.content || '*(vide ou non chargé)*').slice(0, 3500)}`);
    if (m.attachments?.size) e.addFields({ name: 'Pièces jointes', value: m.attachments.map(a => a.name).join(', ').slice(0, 1000) });
    sendTo(m.guild, c.channel, { embeds: [e] });
  });
  client.on(Events.MessageBulkDelete, async (msgs, channel) => {
    const c = L(channel.guild, 'messages'); if (!c) return;
    sendTo(channel.guild, c.channel, { embeds: [E(COLORS.err, '🗑️ Suppression en masse').setDescription(`${msgs.size} messages supprimés dans ${channel}`)] });
  });
  client.on(Events.MessageUpdate, async (a, b) => {
    if (!b.guild || b.author?.bot || a.content === b.content || !a.content) return;
    const c = L(b.guild, 'messages'); if (!c || c.ignored.includes(b.channelId)) return;
    sendTo(b.guild, c.channel, { embeds: [E(COLORS.warn, '✏️ Message modifié').setDescription(`**Salon :** ${b.channel} · [Aller au message](${b.url})\n**Auteur :** ${b.author}`)
      .addFields({ name: 'Avant', value: a.content.slice(0, 1024) }, { name: 'Après', value: (b.content || '*vide*').slice(0, 1024) })] });
  });

  client.on(Events.GuildMemberAdd, (m) => {
    const c = L(m.guild, 'members'); if (!c) return;
    sendTo(m.guild, c.channel, { embeds: [E(COLORS.ok, '📥 Arrivée').setThumbnail(m.user.displayAvatarURL()).setDescription(`${m} (${m.user.tag})\nCompte créé ${ts(m.user.createdTimestamp)}`).setFooter({ text: `ID ${m.id}` })] });
  });
  client.on(Events.GuildMemberRemove, (m) => {
    const c = L(m.guild, 'members'); if (!c) return;
    sendTo(m.guild, c.channel, { embeds: [E(COLORS.err, '📤 Départ').setThumbnail(m.user.displayAvatarURL()).setDescription(`${m.user.tag}\nÉtait là depuis ${m.joinedTimestamp ? ts(m.joinedTimestamp) : '?'}\nRôles : ${m.roles?.cache.filter(r => r.id !== m.guild.id).map(r => r.name).join(', ') || 'aucun'}`).setFooter({ text: `ID ${m.id}` })] });
  });
  client.on(Events.GuildMemberUpdate, (a, b) => {
    if (a.nickname !== b.nickname) { const c = L(b.guild, 'members'); if (c) sendTo(b.guild, c.channel, { embeds: [E(COLORS.info, '🏷️ Pseudo modifié').setDescription(`${b}\n**Avant :** ${a.nickname || a.user.username}\n**Après :** ${b.nickname || b.user.username}`)] }); }
    const added = b.roles.cache.filter(r => !a.roles.cache.has(r.id)); const removed = a.roles.cache.filter(r => !b.roles.cache.has(r.id));
    if ((added.size || removed.size) && a.roles.cache.size) {
      const c = L(b.guild, 'roles'); if (!c) return;
      sendTo(b.guild, c.channel, { embeds: [E(COLORS.info, '🎭 Rôles modifiés').setDescription(`${b}\n${added.map(r => `➕ ${r}`).join('\n')}\n${removed.map(r => `➖ ${r}`).join('\n')}`)] });
    }
    if (!a.communicationDisabledUntilTimestamp && b.communicationDisabledUntilTimestamp) {
      const c = L(b.guild, 'moderation'); if (c) sendTo(b.guild, c.channel, { embeds: [E(COLORS.err, '🔇 Timeout').setDescription(`${b} jusqu'à ${ts(b.communicationDisabledUntilTimestamp, 'f')}`)] });
    }
  });

  client.on(Events.ChannelCreate, (ch) => { if (!ch.guild) return; const c = L(ch.guild, 'channels'); if (c) sendTo(ch.guild, c.channel, { embeds: [E(COLORS.ok, '➕ Salon créé').setDescription(`${ch} (\`${ch.name}\`)`)] }); });
  client.on(Events.ChannelDelete, (ch) => { if (!ch.guild) return; const c = L(ch.guild, 'channels'); if (c) sendTo(ch.guild, c.channel, { embeds: [E(COLORS.err, '➖ Salon supprimé').setDescription(`\`#${ch.name}\``)] }); });

  client.on(Events.VoiceStateUpdate, (a, b) => {
    const g = b.guild; const c = L(g, 'voice'); if (!c) return;
    const m = b.member;
    let d = null;
    if (!a.channelId && b.channelId) d = [COLORS.ok, `🔊 ${m} a rejoint <#${b.channelId}>`];
    else if (a.channelId && !b.channelId) d = [COLORS.err, `🔇 ${m} a quitté <#${a.channelId}>`];
    else if (a.channelId !== b.channelId) d = [COLORS.info, `🔁 ${m} : <#${a.channelId}> → <#${b.channelId}>`];
    if (d) sendTo(g, c.channel, { embeds: [new EmbedBuilder().setColor(d[0]).setDescription(d[1]).setTimestamp()] });
  });

  client.on(Events.GuildBanAdd, async (ban) => {
    const c = L(ban.guild, 'moderation'); if (!c) return;
    const log = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 }).catch(() => null);
    const entry = log?.entries.first();
    sendTo(ban.guild, c.channel, { embeds: [E(COLORS.err, '🔨 Membre banni').setDescription(`${ban.user.tag} (${ban.user.id})\n**Par :** ${entry?.target?.id === ban.user.id ? entry.executor : 'inconnu'}\n**Raison :** ${ban.reason || entry?.reason || 'aucune'}`)] });
  });
  client.on(Events.GuildBanRemove, (ban) => { const c = L(ban.guild, 'moderation'); if (c) sendTo(ban.guild, c.channel, { embeds: [E(COLORS.ok, '🔓 Membre débanni').setDescription(`${ban.user.tag} (${ban.user.id})`)] }); });
}
