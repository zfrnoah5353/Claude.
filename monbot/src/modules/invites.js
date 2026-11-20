// Suivi des invitations (vraies / fausses / parties / bonus)
import { Events } from 'discord.js';
import { getConfig, updateMember, getMember, kvGet, kvSet } from '../db.js';
import { fill, memberVars, sendTo } from '../util.js';

const cache = new Map(); // guild -> Map(code -> uses)

export const totalInvites = (m) => m.invites.real - m.invites.left + m.invites.bonus;

async function snapshot(guild) {
  const inv = await guild.invites.fetch().catch(() => null);
  if (!inv) return;
  const map = new Map(inv.map(i => [i.code, { uses: i.uses, inviter: i.inviterId }]));
  if (guild.vanityURLCode) { const v = await guild.fetchVanityData().catch(() => null); if (v) map.set('vanity', { uses: v.uses, inviter: null }); }
  cache.set(guild.id, map);
}

async function applyRewards(guild, inviterId) {
  const cfg = getConfig(guild.id).invites;
  if (!cfg.rewards.length) return;
  const m = await guild.members.fetch(inviterId).catch(() => null); if (!m) return;
  const total = totalInvites(getMember(guild.id, inviterId));
  for (const r of cfg.rewards) if (r.role && total >= r.invites && !m.roles.cache.has(r.role)) await m.roles.add(r.role, 'Récompense d\'invitations').catch(() => {});
}

export function setup(client) {
  client.once(Events.ClientReady, async () => { for (const g of client.guilds.cache.values()) await snapshot(g); });
  client.on(Events.GuildCreate, snapshot);
  client.on(Events.InviteCreate, (i) => { if (i.guild) cache.get(i.guild.id)?.set(i.code, { uses: i.uses || 0, inviter: i.inviterId }); });
  client.on(Events.InviteDelete, (i) => { if (i.guild) cache.get(i.guild.id)?.delete(i.code); });

  client.on(Events.GuildMemberAdd, async (member) => {
    const g = member.guild; const cfg = getConfig(g.id).invites;
    const before = cache.get(g.id) || new Map();
    await snapshot(g);
    const after = cache.get(g.id) || new Map();
    let used = null;
    for (const [code, v] of after) if ((before.get(code)?.uses ?? 0) < v.uses) { used = { code, ...v }; break; }
    if (!cfg.enabled) return;
    const fake = cfg.fakeDays > 0 && Date.now() - member.user.createdTimestamp < cfg.fakeDays * 864e5;
    let inviterTag = 'inconnu', total = 0;
    if (used?.inviter) {
      const im = updateMember(g.id, used.inviter, (m) => { if (fake) m.invites.fake++; else m.invites.real++; });
      updateMember(g.id, member.id, (m) => { m.inviter = used.inviter; m.invitedFake = fake; });
      const hist = kvGet('invhist', g.id, []); hist.unshift({ inviter: used.inviter, user: member.id, at: Date.now(), fake, code: used.code }); kvSet('invhist', g.id, hist.slice(0, 1000));
      const u = await client.users.fetch(used.inviter).catch(() => null);
      inviterTag = u?.username || used.inviter; total = totalInvites(im);
      await applyRewards(g, used.inviter);
    } else if (used?.code === 'vanity') inviterTag = 'le lien personnalisé';
    if (cfg.channel) sendTo(g, cfg.channel, { content: fill(cfg.joinMessage, memberVars(member, { inviter: inviterTag, invites: total })) + (fake ? ' ⚠️ *(compte récent : fausse invitation)*' : ''), allowedMentions: { users: [member.id] } });
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    const g = member.guild; const cfg = getConfig(g.id).invites;
    if (!cfg.enabled) return;
    const me = getMember(g.id, member.id);
    let inviterTag = 'inconnu';
    if (me.inviter) {
      if (!me.invitedFake) updateMember(g.id, me.inviter, (m) => { m.invites.left++; });
      const u = await client.users.fetch(me.inviter).catch(() => null); inviterTag = u?.username || me.inviter;
    }
    if (cfg.channel) sendTo(g, cfg.channel, { content: fill(cfg.leaveMessage, memberVars(member, { inviter: inviterTag })), allowedMentions: { parse: [] } });
  });
}
