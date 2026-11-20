import { EmbedBuilder, Events, PermissionFlagsBits, ChannelType } from 'discord.js';
import { getConfig, kvGet, kvSet, addSanction } from '../db.js';
import { COLORS, fmtDuration, sendTo } from '../util.js';

const LABELS = { ban: '🔨 Ban', tempban: '⏳ Ban temporaire', unban: '🔓 Déban', kick: '👢 Expulsion', mute: '🔇 Mute', unmute: '🔊 Unmute', warn: '⚠️ Avertissement', automod: '🤖 AutoMod' };

// Enregistre une sanction, prévient le membre et écrit dans le salon des sanctions
export async function sanction(guild, { type, user, mod, reason, duration = null, record = true }) {
  const cfg = getConfig(guild.id).moderation;
  const id = record ? addSanction(guild.id, user.id, mod?.id || 'auto', type, reason, duration ? Date.now() + duration : null) : null;
  const e = new EmbedBuilder()
    .setColor(['unban', 'unmute'].includes(type) ? COLORS.ok : COLORS.err)
    .setTitle(LABELS[type] || type)
    .addFields(
      { name: 'Membre', value: `${user} (${user.username ?? user.tag})`, inline: true },
      { name: 'Par', value: mod ? `${mod}` : 'Automatique', inline: true },
      { name: 'Raison', value: reason || 'Aucune raison' },
    )
    .setTimestamp();
  if (duration) e.addFields({ name: 'Durée', value: fmtDuration(duration), inline: true });
  if (id) e.setFooter({ text: `Sanction #${id}` });
  if (cfg.dmOnSanction && !['unban'].includes(type)) {
    const dm = EmbedBuilder.from(e).setTitle(`${LABELS[type] || type} sur ${guild.name}`);
    await user.send({ embeds: [dm] }).catch(() => {});
  }
  await sendTo(guild, cfg.logChannel, { embeds: [e] });
  if (record) guild.client.emit('sanctionAdded', guild, { type, user, mod, reason }); // pour le Mur de la honte
  return id;
}

export function raidState(gid) { return kvGet('raid', gid, { on: false, since: 0, quarantined: [] }); }
export function setRaid(gid, s) { kvSet('raid', gid, s); }

export async function setupQuarantine(guild) {
  const cfg = getConfig(guild.id).moderation;
  let role = cfg.quarantineRole && guild.roles.cache.get(cfg.quarantineRole);
  if (!role) role = await guild.roles.create({ name: 'Quarantaine', color: 0x555555, reason: 'Mode raid' });
  for (const c of guild.channels.cache.values()) {
    if ([ChannelType.GuildCategory, ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildForum, ChannelType.GuildAnnouncement].includes(c.type) && !c.parentId) {
      await c.permissionOverwrites.edit(role, { ViewChannel: false }).catch(() => {});
    } else if (c.permissionOverwrites && !c.permissionsLocked) {
      await c.permissionOverwrites.edit(role, { ViewChannel: false }).catch(() => {});
    }
  }
  const { patchModule } = await import('../db.js');
  patchModule(guild.id, 'moderation', { quarantineRole: role.id });
  return role;
}

const recentJoins = new Map();

export function setup(client) {
  // Fin des sanctions temporaires
  client.timerHandlers.set('unban', async (t) => {
    const g = client.guilds.cache.get(t.guild_id); if (!g) return;
    await g.members.unban(t.data.user, 'Fin du ban temporaire').catch(() => {});
    const user = await client.users.fetch(t.data.user).catch(() => null);
    if (user) await sanction(g, { type: 'unban', user, reason: 'Fin du ban temporaire', record: false });
  });
  client.timerHandlers.set('temprole', async (t) => {
    const g = client.guilds.cache.get(t.guild_id); if (!g) return;
    const m = await g.members.fetch(t.data.user).catch(() => null); if (!m) return;
    if (t.data.action === 'add') await m.roles.remove(t.data.role, 'Fin du rôle temporaire').catch(() => {});
    else await m.roles.add(t.data.role, 'Fin du retrait temporaire').catch(() => {});
  });
  client.timerHandlers.set('unlock', async (t) => {
    const g = client.guilds.cache.get(t.guild_id); if (!g) return;
    const c = g.channels.cache.get(t.data.channel); if (!c) return;
    await c.permissionOverwrites.edit(g.roles.everyone, { SendMessages: null, Connect: null, Speak: null }).catch(() => {});
    if (c.isTextBased()) c.send('🔓 Salon déverrouillé automatiquement.').catch(() => {});
  });

  // Mode raid automatique + quarantaine des nouveaux
  client.on(Events.GuildMemberAdd, async (member) => {
    const cfg = getConfig(member.guild.id).moderation;
    if (!cfg.enabled) return;
    const st = raidState(member.guild.id);
    if (!st.on && cfg.autoRaid) {
      const arr = (recentJoins.get(member.guild.id) || []).filter(x => Date.now() - x < cfg.raidSeconds * 1000);
      arr.push(Date.now()); recentJoins.set(member.guild.id, arr);
      if (arr.length >= cfg.raidJoins) {
        st.on = true; st.since = Date.now(); setRaid(member.guild.id, st);
        await sendTo(member.guild, cfg.logChannel, { embeds: [new EmbedBuilder().setColor(COLORS.err).setTitle('🚨 Mode raid activé automatiquement').setDescription(`${arr.length} arrivées en ${cfg.raidSeconds}s. Les nouveaux membres sont mis en quarantaine.\nUtilise \`/raid off\` puis \`/raid release\` ou \`/raid purge\`.`)] });
      }
    }
    if (st.on) {
      let roleId = cfg.quarantineRole;
      if (!roleId || !member.guild.roles.cache.has(roleId)) roleId = (await setupQuarantine(member.guild).catch(() => null))?.id;
      if (roleId) { await member.roles.add(roleId, 'Mode raid').catch(() => {}); st.quarantined.push(member.id); setRaid(member.guild.id, st); }
    }
  });
}

export const PERMS = PermissionFlagsBits;
