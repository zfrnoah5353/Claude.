// Giveaways : bouton de participation, conditions, multi-gagnants, reroll
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { getConfig, kvGet, kvSet, kvList, addTimer, getMember, bumpStat } from '../db.js';
import { hexColor, ts, COLORS } from '../util.js';

export const getGw = (msgId) => kvGet('giveaway', msgId);
export const saveGw = (msgId, g) => kvSet('giveaway', msgId, g);
export const listGw = (gid) => kvList('giveaway').map(x => ({ id: x.key, ...x.value })).filter(x => x.guild === gid);

function render(gw, cfg) {
  const lines = [
    gw.description || '',
    `**Fin :** ${ts(gw.end)} (${ts(gw.end, 'f')})`,
    `**Gagnant(s) :** ${gw.winners}`,
    `**Organisé par :** <@${gw.host}>`,
    `**Participants :** ${gw.entries.length}`,
  ];
  if (gw.requiredRole) lines.push(`**Rôle requis :** <@&${gw.requiredRole}>`);
  if (gw.minLevel) lines.push(`**Niveau minimum :** ${gw.minLevel}`);
  if (gw.ended) lines.push(`\n🏆 **Gagnant(s) :** ${gw.winnerIds?.length ? gw.winnerIds.map(w => `<@${w}>`).join(', ') : 'personne'}`);
  return new EmbedBuilder().setColor(gw.ended ? 0x2b2d31 : hexColor(cfg.color)).setTitle(`🎁 ${gw.prize}`).setDescription(lines.filter(Boolean).join('\n')).setFooter({ text: gw.ended ? 'Giveaway terminé' : 'Clique sur le bouton pour participer' });
}
const row = (cfg, ended) => new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('gw:join').setEmoji(cfg.emoji || '🎉').setLabel(ended ? 'Terminé' : 'Participer').setStyle(ButtonStyle.Primary).setDisabled(!!ended));

export async function createGiveaway(channel, { prize, duration, winners = 1, host, description = '', requiredRole = null, minLevel = 0 }) {
  const cfg = getConfig(channel.guild.id).giveaway;
  const gw = { guild: channel.guild.id, channel: channel.id, prize, end: Date.now() + duration, winners, host, description, requiredRole, minLevel, entries: [], ended: false };
  const msg = await channel.send({ embeds: [render(gw, cfg)], components: [row(cfg)] });
  saveGw(msg.id, gw);
  addTimer('giveaway', channel.guild.id, gw.end, { msg: msg.id });
  bumpStat(channel.guild.id, 'giveaway');
  return msg;
}

function draw(entries, n, exclude = []) {
  const pool = entries.filter(e => !exclude.includes(e)); const out = [];
  while (pool.length && out.length < n) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  return out;
}

export async function endGiveaway(client, msgId, reroll = false) {
  const gw = getGw(msgId); if (!gw) return null;
  const g = client.guilds.cache.get(gw.guild); const ch = g?.channels.cache.get(gw.channel);
  const cfg = getConfig(gw.guild).giveaway;
  const winners = reroll ? draw(gw.entries, gw.winners, gw.winnerIds || []) : draw(gw.entries, gw.winners);
  gw.ended = true; gw.end = Math.min(gw.end, Date.now()); gw.winnerIds = winners; saveGw(msgId, gw);
  if (!ch) return gw;
  const msg = await ch.messages.fetch(msgId).catch(() => null);
  if (msg) await msg.edit({ embeds: [render(gw, cfg)], components: [row(cfg, true)] }).catch(() => {});
  await ch.send({ content: winners.length ? `🎉 Bravo ${winners.map(w => `<@${w}>`).join(', ')} ! ${reroll ? '(nouveau tirage) ' : ''}Vous gagnez **${gw.prize}** !` : `😢 Personne n'a participé au giveaway **${gw.prize}**.`, reply: msg ? { messageReference: msgId } : undefined }).catch(() => {});
  if (cfg.dmWinners) for (const w of winners) (await client.users.fetch(w).catch(() => null))?.send(`🎉 Tu as gagné **${gw.prize}** sur **${g.name}** ! ${msg?.url || ''}`).catch(() => {});
  return gw;
}

export function setup(client) {
  client.timerHandlers.set('giveaway', (t) => { const gw = getGw(t.data.msg); if (gw && !gw.ended) return endGiveaway(client, t.data.msg); });
  client.components.set('gw', async (i) => {
    const gw = getGw(i.message.id);
    if (!gw || gw.ended) return i.reply({ content: 'Ce giveaway est terminé.', flags: MessageFlags.Ephemeral });
    if (gw.entries.includes(i.user.id)) {
      gw.entries = gw.entries.filter(x => x !== i.user.id); saveGw(i.message.id, gw);
      await i.message.edit({ embeds: [render(gw, getConfig(i.guildId).giveaway)] }).catch(() => {});
      return i.reply({ content: '👋 Tu ne participes plus.', flags: MessageFlags.Ephemeral });
    }
    if (gw.requiredRole && !i.member.roles.cache.has(gw.requiredRole)) return i.reply({ content: `❌ Il faut le rôle <@&${gw.requiredRole}> pour participer.`, flags: MessageFlags.Ephemeral });
    if (gw.minLevel && getMember(i.guildId, i.user.id).level < gw.minLevel) return i.reply({ content: `❌ Il faut être niveau ${gw.minLevel} minimum.`, flags: MessageFlags.Ephemeral });
    gw.entries.push(i.user.id); saveGw(i.message.id, gw);
    await i.message.edit({ embeds: [render(gw, getConfig(i.guildId).giveaway)] }).catch(() => {});
    i.reply({ content: '✅ Tu participes ! Bonne chance 🍀 (reclique pour te retirer)', flags: MessageFlags.Ephemeral });
  });
  client.panelActions.set('giveaway.create', async (guild, body) => {
    const ch = guild.channels.cache.get(body.channel); if (!ch) throw new Error('Salon introuvable.');
    const { parseDuration } = await import('../util.js');
    const d = parseDuration(body.duration); if (!d) throw new Error('Durée invalide (ex : 1d, 2h).');
    await createGiveaway(ch, { prize: body.prize, duration: d, winners: Number(body.winners) || 1, host: client.user.id, description: body.description || '', requiredRole: body.requiredRole || null, minLevel: Number(body.minLevel) || 0 });
    return 'Giveaway lancé 🎉';
  });
}
export { COLORS };
