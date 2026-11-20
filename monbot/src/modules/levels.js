// Niveaux & XP (messages + vocal)
import { Events } from 'discord.js';
import { getConfig, getMember, saveMember, allMembers } from '../db.js';
import { fill, memberVars, sendTo, rand } from '../util.js';

export const xpNeeded = (lvl) => 5 * lvl * lvl + 50 * lvl + 100;

export async function addXp(guild, userId, amount, channel = null) {
  const cfg = getConfig(guild.id).levels;
  const m = getMember(guild.id, userId);
  m.xp += amount;
  const oldLevel = m.level;
  while (m.xp >= xpNeeded(m.level)) { m.xp -= xpNeeded(m.level); m.level++; }
  while (m.xp < 0 && m.level > 0) { m.level--; m.xp += xpNeeded(m.level); }
  if (m.xp < 0) m.xp = 0;
  saveMember(guild.id, userId, m);
  if (m.level !== oldLevel) await syncRewards(guild, userId, m.level);
  if (m.level > oldLevel) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (member) {
      const content = fill(cfg.message, memberVars(member, { level: m.level }));
      if (cfg.channel) await sendTo(guild, cfg.channel, { content });
      else if (channel) await channel.send({ content }).catch(() => {});
    }
  }
  return m;
}

export async function syncRewards(guild, userId, level) {
  const cfg = getConfig(guild.id).levels;
  if (!cfg.rewards.length) return;
  const member = await guild.members.fetch(userId).catch(() => null); if (!member) return;
  const earned = cfg.rewards.filter(r => r.role && level >= r.level).sort((a, b) => b.level - a.level);
  const keep = cfg.stackRewards ? earned.map(r => r.role) : earned.slice(0, 1).map(r => r.role);
  for (const r of cfg.rewards) {
    if (!r.role) continue;
    const should = keep.includes(r.role);
    if (should && !member.roles.cache.has(r.role)) await member.roles.add(r.role, 'Récompense de niveau').catch(() => {});
    if (!should && member.roles.cache.has(r.role)) await member.roles.remove(r.role, 'Récompense de niveau').catch(() => {});
  }
}

export function totalXp(m) { let t = m.xp; for (let l = 0; l < m.level; l++) t += xpNeeded(l); return t; }
export function leaderboard(gid) { return allMembers(gid).filter(m => m.level > 0 || m.xp > 0).sort((a, b) => totalXp(b) - totalXp(a)); }

function blocked(member, channelId, cfg) {
  return cfg.noXpChannels.includes(channelId) || cfg.noXpRoles.some(r => member.roles.cache.has(r));
}

export function setup(client) {
  client.on(Events.MessageCreate, async (msg) => {
    if (!msg.guild || msg.author.bot || !msg.member) return;
    const cfg = getConfig(msg.guild.id).levels;
    if (!cfg.enabled || blocked(msg.member, msg.channelId, cfg)) return;
    const m = getMember(msg.guild.id, msg.author.id);
    m.msgs++;
    const can = Date.now() - m.lastXp >= cfg.cooldown * 1000;
    if (can) m.lastXp = Date.now();
    saveMember(msg.guild.id, msg.author.id, m);
    if (can) await addXp(msg.guild, msg.author.id, rand(cfg.xpMin, Math.max(cfg.xpMin, cfg.xpMax)), msg.channel);
  });

  // XP vocal : chaque minute, pour les membres en vocal non muets et pas seuls
  setInterval(async () => {
    for (const g of client.guilds.cache.values()) {
      const cfg = getConfig(g.id).levels;
      if (!cfg.enabled || !cfg.voiceXp) continue;
      for (const vs of g.voiceStates.cache.values()) {
        if (!vs.channel || !vs.member || vs.member.user.bot || vs.selfDeaf || vs.serverDeaf || vs.channel.id === g.afkChannelId) continue;
        if (vs.channel.members.filter(x => !x.user.bot).size < 2) continue;
        if (blocked(vs.member, vs.channel.id, cfg)) continue;
        const m = getMember(g.id, vs.id); m.voiceMin++; saveMember(g.id, vs.id, m);
        await addXp(g, vs.id, cfg.voiceXpPerMin);
      }
    }
  }, 60e3);
}
