// Sauvegarde / restauration du serveur (rôles, salons, permissions, réglages du bot)
import { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits as P } from 'discord.js';
import { getConfig, saveConfig, kvGet, kvSet, kvDel, kvList, addTimer, findTimers } from '../db.js';
import { ok, err, COLORS, ts } from '../util.js';

export async function createBackup(guild, auto = false) {
  await guild.channels.fetch(); await guild.roles.fetch();
  const roles = guild.roles.cache.filter(r => !r.managed && r.id !== guild.id).sort((a, b) => b.position - a.position)
    .map(r => ({ id: r.id, name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString() }));
  const ow = (c) => c.permissionOverwrites.cache.filter(o => o.type === 0).map(o => ({ role: o.id === guild.id ? '@everyone' : guild.roles.cache.get(o.id)?.name, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() })).filter(o => o.role);
  const channels = guild.channels.cache.filter(c => !c.isThread()).sort((a, b) => a.rawPosition - b.rawPosition)
    .map(c => ({ name: c.name, type: c.type, parent: c.parent?.name || null, topic: c.topic || null, nsfw: !!c.nsfw, rateLimit: c.rateLimitPerUser || 0, userLimit: c.userLimit || 0, bitrate: c.bitrate || null, overwrites: ow(c) }));
  const id = `${Date.now().toString(36)}`;
  const data = { id, guild: guild.id, name: guild.name, created: Date.now(), auto, everyonePerms: guild.roles.everyone.permissions.bitfield.toString(), roles, channels, config: getConfig(guild.id) };
  kvSet('backup', `${guild.id}:${id}`, data);
  // Ne garder que les X dernières
  const keep = getConfig(guild.id).backup.keep;
  const all = listBackups(guild.id);
  for (const b of all.slice(keep)) kvDel('backup', `${guild.id}:${b.id}`);
  return data;
}
export function listBackups(gid) { return kvList('backup').map(x => x.value).filter(b => b?.guild === gid).sort((a, b) => b.created - a.created); }

async function restore(guild, b, withConfig) {
  const roleMap = new Map([['@everyone', guild.id]]);
  await guild.roles.everyone.setPermissions(BigInt(b.everyonePerms)).catch(() => {});
  for (const r of [...b.roles].reverse()) {
    let role = guild.roles.cache.find(x => x.name === r.name && !x.managed);
    if (!role) role = await guild.roles.create({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: BigInt(r.permissions), reason: 'Restauration backup' }).catch(() => null);
    if (role) roleMap.set(r.name, role.id);
  }
  const ow = (list) => list.map(o => ({ id: roleMap.get(o.role), allow: BigInt(o.allow), deny: BigInt(o.deny) })).filter(o => o.id);
  const catMap = new Map();
  for (const c of b.channels.filter(x => x.type === ChannelType.GuildCategory)) {
    let cat = guild.channels.cache.find(x => x.type === ChannelType.GuildCategory && x.name === c.name);
    if (!cat) cat = await guild.channels.create({ name: c.name, type: ChannelType.GuildCategory, permissionOverwrites: ow(c.overwrites) }).catch(() => null);
    if (cat) catMap.set(c.name, cat.id);
  }
  let created = 0;
  for (const c of b.channels.filter(x => x.type !== ChannelType.GuildCategory)) {
    const parent = c.parent ? catMap.get(c.parent) : null;
    if (guild.channels.cache.find(x => x.name === c.name && x.type === c.type && (x.parentId || null) === (parent || null))) continue;
    if (![ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildForum].includes(c.type)) continue;
    const ok2 = await guild.channels.create({ name: c.name, type: c.type === ChannelType.GuildAnnouncement && !guild.features.includes('NEWS') ? ChannelType.GuildText : c.type, parent, topic: c.topic || undefined, nsfw: c.nsfw, rateLimitPerUser: c.rateLimit || undefined, userLimit: c.userLimit || undefined, permissionOverwrites: ow(c.overwrites) }).catch(() => null);
    if (ok2) created++;
  }
  if (withConfig && b.config) saveConfig(guild.id, b.config);
  return created;
}

export const commands = [
  {
    module: 'backup',
    data: new SlashCommandBuilder().setName('backup').setDescription('Gérer les sauvegardes du serveur (propriétaire uniquement).').setDefaultMemberPermissions(P.Administrator).setDMPermission(false)
      .addSubcommand(s => s.setName('create').setDescription('Créer une sauvegarde'))
      .addSubcommand(s => s.setName('delete').setDescription('Supprimer une sauvegarde').addStringOption(o => o.setName('id').setDescription('ID').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('list').setDescription('Liste des sauvegardes'))
      .addSubcommand(s => s.setName('restore').setDescription('Restaurer (recrée ce qui manque, ne supprime rien)').addStringOption(o => o.setName('id').setDescription('ID').setRequired(true).setAutocomplete(true)).addBooleanOption(o => o.setName('reglages_bot').setDescription('Restaurer aussi les réglages du bot'))),
    autocomplete: (i) => i.respond(listBackups(i.guildId).slice(0, 25).map(b => ({ name: `${b.id} · ${new Date(b.created).toLocaleString('fr-FR')}${b.auto ? ' (auto)' : ''}`, value: b.id }))),
    async run(i) {
      if (i.user.id !== i.guild.ownerId) return i.reply(err('Seul le propriétaire du serveur peut gérer les sauvegardes.'));
      const sub = i.options.getSubcommand();
      if (sub === 'list') return i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setTitle('💾 Sauvegardes').setDescription(listBackups(i.guildId).map(b => `\`${b.id}\` · ${ts(b.created)} · ${b.roles.length} rôles, ${b.channels.length} salons${b.auto ? ' · auto' : ''}`).join('\n') || 'Aucune.')], ephemeral: true });
      if (sub === 'create') { await i.deferReply({ ephemeral: true }); const b = await createBackup(i.guild); return i.editReply(ok(`Sauvegarde \`${b.id}\` créée (${b.roles.length} rôles, ${b.channels.length} salons).`)); }
      const id = i.options.getString('id'); const b = kvGet('backup', `${i.guildId}:${id}`);
      if (!b) return i.reply(err('Sauvegarde introuvable.'));
      if (sub === 'delete') { kvDel('backup', `${i.guildId}:${id}`); return i.reply({ ...ok('Sauvegarde supprimée.'), ephemeral: true }); }
      await i.deferReply({ ephemeral: true });
      const n = await restore(i.guild, b, i.options.getBoolean('reglages_bot'));
      i.editReply(ok(`Restauration terminée : ${n} salon(s) recréé(s), rôles vérifiés.`));
    },
  },
];

export function register(client) {
  client.panelActions.set('backup.createBackup', async (g) => { const b = await createBackup(g); return `Sauvegarde ${b.id} créée ✅`; });
  // Sauvegarde automatique : vérifiée toutes les heures
  setInterval(async () => {
    for (const g of client.guilds.cache.values()) {
      const cfg = getConfig(g.id).backup;
      if (!cfg.enabled || !cfg.autoDays) continue;
      const last = listBackups(g.id)[0];
      if (!last || Date.now() - last.created > cfg.autoDays * 864e5) await createBackup(g, true).catch(e => console.error('Backup auto :', e.message));
    }
  }, 3600e3);
}
export { addTimer, findTimers };
