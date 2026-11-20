import { SlashCommandBuilder, PermissionFlagsBits as P, EmbedBuilder, ChannelType, MessageFlags } from 'discord.js';
import { ok, err, parseDuration, fmtDuration, canModerate, COLORS, ts, chunk } from '../util.js';
import { listSanctions, deleteSanction, clearSanctions, addTimer, findTimers, removeTimer, updateTimerAt, getConfig } from '../db.js';
import { sanction, raidState, setRaid, setupQuarantine } from '../modules/moderation.js';

const MAX_TIMEOUT = 28 * 864e5;
const b = (name, desc, perm) => new SlashCommandBuilder().setName(name).setDescription(desc).setDefaultMemberPermissions(perm).setDMPermission(false);
const userOpt = (o, req = true) => o.setName('user').setDescription('Le membre').setRequired(req);

export const commands = [
  {
    module: 'moderation',
    data: b('ban', 'Bannir un membre.', P.BanMembers)
      .addUserOption(o => userOpt(o))
      .addStringOption(o => o.setName('time').setDescription('Durée (ex : 1d, 12h). Vide = définitif'))
      .addStringOption(o => o.setName('reason').setDescription('Raison'))
      .addIntegerOption(o => o.setName('delete_message').setDescription('Supprimer ses messages des X derniers jours').setMinValue(0).setMaxValue(7)),
    async run(i) {
      const user = i.options.getUser('user');
      const member = await i.guild.members.fetch(user.id).catch(() => null);
      if (member) { const pb = canModerate(i.member, member); if (pb) return i.reply(err(pb)); if (!member.bannable) return i.reply(err('Je ne peux pas bannir ce membre.')); }
      const dur = parseDuration(i.options.getString('time'));
      const reason = i.options.getString('reason') || 'Aucune raison';
      await sanction(i.guild, { type: dur ? 'tempban' : 'ban', user, mod: i.user, reason, duration: dur });
      await i.guild.members.ban(user.id, { reason: `${i.user.tag}: ${reason}`, deleteMessageSeconds: (i.options.getInteger('delete_message') || 0) * 86400 });
      if (dur) addTimer('unban', i.guildId, Date.now() + dur, { user: user.id });
      i.reply(ok(`**${user.username}** a été banni${dur ? ` pour ${fmtDuration(dur)}` : ''}. Raison : ${reason}`));
    },
  },
  {
    module: 'moderation',
    data: b('unban', 'Débannir un membre.', P.BanMembers)
      .addStringOption(o => o.setName('user_id').setDescription('ID du membre').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Raison')),
    async run(i) {
      const id = i.options.getString('user_id').replace(/\D/g, '');
      const reason = i.options.getString('reason') || 'Aucune raison';
      const ban = await i.guild.bans.fetch(id).catch(() => null);
      if (!ban) return i.reply(err('Ce membre n\'est pas banni.'));
      await i.guild.members.unban(id, reason);
      for (const t of findTimers('unban', i.guildId)) if (t.data.user === id) removeTimer(t.id);
      await sanction(i.guild, { type: 'unban', user: ban.user, mod: i.user, reason, record: false });
      i.reply(ok(`**${ban.user.username}** a été débanni.`));
    },
  },
  {
    module: 'moderation',
    data: b('editban', 'Modifie la durée du ban actif d\'un utilisateur.', P.BanMembers)
      .addStringOption(o => o.setName('user_id').setDescription('ID du membre').setRequired(true))
      .addStringOption(o => o.setName('time').setDescription('Nouvelle durée à partir de maintenant (ex : 3d), "perm" = définitif').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Raison').setRequired(true)),
    async run(i) {
      const id = i.options.getString('user_id').replace(/\D/g, '');
      const ban = await i.guild.bans.fetch(id).catch(() => null);
      if (!ban) return i.reply(err('Ce membre n\'est pas banni.'));
      const t = i.options.getString('time');
      const dur = /perm|def/i.test(t) ? null : parseDuration(t);
      if (dur === null && !/perm|def/i.test(t)) return i.reply(err('Durée invalide.'));
      const timers = findTimers('unban', i.guildId).filter(x => x.data.user === id);
      timers.forEach(x => removeTimer(x.id));
      if (dur) addTimer('unban', i.guildId, Date.now() + dur, { user: id });
      await sanction(i.guild, { type: dur ? 'tempban' : 'ban', user: ban.user, mod: i.user, reason: `Ban modifié : ${i.options.getString('reason')}`, duration: dur });
      i.reply(ok(`Ban de **${ban.user.username}** modifié : ${dur ? `fin ${ts(Date.now() + dur)}` : 'définitif'}.`));
    },
  },
  {
    module: 'moderation',
    data: b('kick', 'Exclure un membre.', P.KickMembers).addUserOption(o => userOpt(o)).addStringOption(o => o.setName('reason').setDescription('Raison')),
    async run(i) {
      const member = i.options.getMember('user');
      const pb = canModerate(i.member, member); if (pb) return i.reply(err(pb));
      if (!member.kickable) return i.reply(err('Je ne peux pas expulser ce membre.'));
      const reason = i.options.getString('reason') || 'Aucune raison';
      await sanction(i.guild, { type: 'kick', user: member.user, mod: i.user, reason });
      await member.kick(`${i.user.tag}: ${reason}`);
      i.reply(ok(`**${member.user.username}** a été expulsé. Raison : ${reason}`));
    },
  },
  {
    module: 'moderation',
    data: b('mute', 'Mute un utilisateur.', P.ModerateMembers).addUserOption(o => userOpt(o))
      .addStringOption(o => o.setName('time').setDescription('Durée (ex : 10m, 2h, 7d — max 28j)').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Raison')),
    async run(i) {
      const member = i.options.getMember('user');
      const pb = canModerate(i.member, member); if (pb) return i.reply(err(pb));
      const dur = parseDuration(i.options.getString('time'));
      if (!dur) return i.reply(err('Durée invalide (ex : 10m, 2h, 1d).'));
      const d = Math.min(dur, MAX_TIMEOUT);
      const reason = i.options.getString('reason') || 'Aucune raison';
      await member.timeout(d, `${i.user.tag}: ${reason}`);
      await sanction(i.guild, { type: 'mute', user: member.user, mod: i.user, reason, duration: d });
      i.reply(ok(`**${member.user.username}** est mute pour ${fmtDuration(d)}. Raison : ${reason}`));
    },
  },
  {
    module: 'moderation',
    data: b('editmute', 'Modifie la durée du mute actif d\'un utilisateur.', P.ModerateMembers).addUserOption(o => userOpt(o))
      .addStringOption(o => o.setName('time').setDescription('Nouvelle durée à partir de maintenant').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Raison').setRequired(true)),
    async run(i) {
      const member = i.options.getMember('user');
      if (!member?.isCommunicationDisabled()) return i.reply(err('Ce membre n\'est pas mute.'));
      const dur = parseDuration(i.options.getString('time'));
      if (!dur) return i.reply(err('Durée invalide.'));
      const d = Math.min(dur, MAX_TIMEOUT);
      await member.timeout(d, i.options.getString('reason'));
      await sanction(i.guild, { type: 'mute', user: member.user, mod: i.user, reason: `Mute modifié : ${i.options.getString('reason')}`, duration: d });
      i.reply(ok(`Mute de **${member.user.username}** modifié : fin ${ts(Date.now() + d)}.`));
    },
  },
  {
    module: 'moderation',
    data: b('unmute', 'UnMute un utilisateur.', P.ModerateMembers).addUserOption(o => userOpt(o)).addStringOption(o => o.setName('reason').setDescription('Raison')),
    async run(i) {
      const member = i.options.getMember('user');
      if (!member?.isCommunicationDisabled()) return i.reply(err('Ce membre n\'est pas mute.'));
      const reason = i.options.getString('reason') || 'Aucune raison';
      await member.timeout(null, reason);
      await sanction(i.guild, { type: 'unmute', user: member.user, mod: i.user, reason, record: false });
      i.reply(ok(`**${member.user.username}** n'est plus mute.`));
    },
  },
  {
    module: 'moderation',
    data: b('warn', 'Avertir un membre.', P.ModerateMembers).addUserOption(o => userOpt(o)).addStringOption(o => o.setName('reason').setDescription('Raison').setRequired(true)),
    async run(i) {
      const member = i.options.getMember('user');
      const pb = canModerate(i.member, member); if (pb && !pb.startsWith('Mon rôle')) return i.reply(err(pb));
      const reason = i.options.getString('reason');
      const id = await sanction(i.guild, { type: 'warn', user: member.user, mod: i.user, reason });
      const n = listSanctions(i.guildId, member.id).filter(s => s.type === 'warn').length;
      i.reply(ok(`**${member.user.username}** a reçu un avertissement (#${id}, ${n} au total). Raison : ${reason}`));
    },
  },
  {
    module: 'moderation',
    data: b('delwarn', 'Supprime un avertissement précis d\'un utilisateur.', P.ModerateMembers).addUserOption(o => userOpt(o))
      .addIntegerOption(o => o.setName('id').setDescription('Numéro de la sanction (voir /history)').setRequired(true)),
    async run(i) {
      const user = i.options.getUser('user');
      const id = i.options.getInteger('id');
      const s = listSanctions(i.guildId, user.id).find(x => x.id === id);
      if (!s) return i.reply(err('Sanction introuvable pour ce membre.'));
      deleteSanction(i.guildId, id);
      i.reply(ok(`Sanction #${id} de **${user.username}** supprimée.`));
    },
  },
  {
    module: 'moderation',
    data: b('history', 'Historique des sanctions d\'un utilisateur.', P.ModerateMembers)
      .addSubcommand(s => s.setName('view').setDescription('Voir l\'historique').addUserOption(o => userOpt(o)))
      .addSubcommand(s => s.setName('clear').setDescription('Effacer l\'historique').addUserOption(o => userOpt(o))),
    async run(i) {
      const user = i.options.getUser('user');
      if (i.options.getSubcommand() === 'clear') { const n = clearSanctions(i.guildId, user.id); return i.reply(ok(`${n} sanction(s) de **${user.username}** effacée(s).`)); }
      const list = listSanctions(i.guildId, user.id, 25);
      const e = new EmbedBuilder().setColor(COLORS.info).setTitle(`Historique de ${user.username}`).setThumbnail(user.displayAvatarURL());
      e.setDescription(list.length ? list.map(s => `**#${s.id}** · ${s.type} · ${ts(s.created)} · par <@${s.mod_id}>\n> ${s.reason}${s.expires ? ` (jusqu'à ${ts(s.expires, 'f')})` : ''}`).join('\n').slice(0, 4000) : 'Aucune sanction 👼');
      i.reply({ embeds: [e] });
    },
  },
  {
    module: 'moderation',
    data: b('clear', 'Effacer des messages.', P.ManageMessages)
      .addIntegerOption(o => o.setName('amount').setDescription('Nombre (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
      .addUserOption(o => o.setName('user').setDescription('Seulement les messages de ce membre')),
    async run(i) {
      const n = i.options.getInteger('amount'); const u = i.options.getUser('user');
      let msgs = await i.channel.messages.fetch({ limit: 100 });
      if (u) msgs = msgs.filter(m => m.author.id === u.id);
      const del = await i.channel.bulkDelete([...msgs.values()].slice(0, n), true);
      i.reply({ ...ok(`${del.size} message(s) supprimé(s).`), flags: MessageFlags.Ephemeral });
    },
  },
  {
    module: 'moderation',
    data: b('lock', 'Verrouille un salon (textuel ou vocal).', P.ManageRoles)
      .addChannelOption(o => o.setName('channel').setDescription('Salon (vide = celui-ci)'))
      .addStringOption(o => o.setName('time').setDescription('Durée (ex : 30m)')),
    async run(i) {
      const c = i.options.getChannel('channel') || i.channel;
      await c.permissionOverwrites.edit(i.guild.roles.everyone, c.isVoiceBased() ? { Connect: false, Speak: false } : { SendMessages: false, SendMessagesInThreads: false, CreatePublicThreads: false });
      const dur = parseDuration(i.options.getString('time'));
      if (dur) addTimer('unlock', i.guildId, Date.now() + dur, { channel: c.id });
      i.reply(ok(`🔒 ${c} verrouillé${dur ? ` pour ${fmtDuration(dur)}` : ''}.`));
    },
  },
  {
    module: 'moderation',
    data: b('unlock', 'Déverrouille un salon (textuel ou vocal).', P.ManageRoles).addChannelOption(o => o.setName('channel').setDescription('Salon (vide = celui-ci)')),
    async run(i) {
      const c = i.options.getChannel('channel') || i.channel;
      await c.permissionOverwrites.edit(i.guild.roles.everyone, { SendMessages: null, SendMessagesInThreads: null, CreatePublicThreads: null, Connect: null, Speak: null });
      for (const t of findTimers('unlock', i.guildId)) if (t.data.channel === c.id) removeTimer(t.id);
      i.reply(ok(`🔓 ${c} déverrouillé.`));
    },
  },
  {
    module: 'moderation',
    data: b('nuke', 'Recrée un salon à l\'identique (clone + suppression).', P.Administrator).addChannelOption(o => o.setName('channel').setDescription('Salon (vide = celui-ci)').addChannelTypes(ChannelType.GuildText)),
    async run(i) {
      const c = i.options.getChannel('channel') || i.channel;
      const clone = await c.clone({ reason: `Nuke par ${i.user.tag}` });
      await clone.setPosition(c.position);
      await c.delete(`Nuke par ${i.user.tag}`);
      await clone.send({ embeds: [new EmbedBuilder().setColor(COLORS.err).setDescription(`💥 Salon recréé par ${i.user}.`).setImage('https://media.tenor.com/GaDLp1aKGzYAAAAC/nuke-explosion.gif')] });
      if (c.id !== i.channelId) i.reply(ok(`${clone} a été recréé.`));
    },
  },
  {
    module: 'moderation',
    data: b('massrole', 'Ajoute un rôle à tous les membres du serveur.', P.Administrator)
      .addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true))
      .addBooleanOption(o => o.setName('include_bots').setDescription('Inclure les bots')),
    async run(i) {
      const role = i.options.getRole('role');
      if (role.position >= i.guild.members.me.roles.highest.position) return i.reply(err('Ce rôle est au-dessus du mien.'));
      await i.deferReply();
      const all = await i.guild.members.fetch();
      const bots = i.options.getBoolean('include_bots');
      let n = 0;
      for (const m of all.values()) {
        if (m.user.bot && !bots) continue;
        if (m.roles.cache.has(role.id)) continue;
        if (await m.roles.add(role).then(() => true).catch(() => false)) n++;
      }
      i.editReply(ok(`Rôle ${role} ajouté à ${n} membre(s).`));
    },
  },
  {
    module: 'moderation',
    data: b('addrole', 'Attribue un rôle à un utilisateur (temporairement si une durée est fournie).', P.ManageRoles)
      .addUserOption(o => userOpt(o)).addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true))
      .addStringOption(o => o.setName('time').setDescription('Durée (ex : 7d)')),
    async run(i) {
      const m = i.options.getMember('user'); const role = i.options.getRole('role');
      if (role.position >= i.guild.members.me.roles.highest.position) return i.reply(err('Ce rôle est au-dessus du mien.'));
      if (i.user.id !== i.guild.ownerId && role.position >= i.member.roles.highest.position) return i.reply(err('Ce rôle est au-dessus du tien.'));
      await m.roles.add(role, `Par ${i.user.tag}`);
      const dur = parseDuration(i.options.getString('time'));
      if (dur) addTimer('temprole', i.guildId, Date.now() + dur, { user: m.id, role: role.id, action: 'add' });
      i.reply(ok(`${role} ajouté à ${m}${dur ? ` pour ${fmtDuration(dur)}` : ''}.`));
    },
  },
  {
    module: 'moderation',
    data: b('removerole', 'Retire un rôle d\'un utilisateur (temporairement si une durée est fournie).', P.ManageRoles)
      .addUserOption(o => userOpt(o)).addRoleOption(o => o.setName('role').setDescription('Rôle').setRequired(true))
      .addStringOption(o => o.setName('time').setDescription('Durée (ex : 1d)')),
    async run(i) {
      const m = i.options.getMember('user'); const role = i.options.getRole('role');
      if (role.position >= i.guild.members.me.roles.highest.position) return i.reply(err('Ce rôle est au-dessus du mien.'));
      if (i.user.id !== i.guild.ownerId && role.position >= i.member.roles.highest.position) return i.reply(err('Ce rôle est au-dessus du tien.'));
      await m.roles.remove(role, `Par ${i.user.tag}`);
      const dur = parseDuration(i.options.getString('time'));
      if (dur) addTimer('temprole', i.guildId, Date.now() + dur, { user: m.id, role: role.id, action: 'remove' });
      i.reply(ok(`${role} retiré à ${m}${dur ? ` pour ${fmtDuration(dur)}` : ''}.`));
    },
  },
  {
    module: 'moderation',
    data: b('rolelist', 'Affiche tous les rôles d\'un utilisateur.', P.ManageRoles).addUserOption(o => userOpt(o)),
    async run(i) {
      const m = i.options.getMember('user');
      const r = m.roles.cache.filter(x => x.id !== i.guildId).sort((a, b2) => b2.position - a.position);
      i.reply({ embeds: [new EmbedBuilder().setColor(m.displayColor || COLORS.info).setTitle(`Rôles de ${m.user.username} (${r.size})`).setDescription(r.map(x => `${x}`).join(' ') || 'Aucun rôle')] });
    },
  },
  {
    module: 'moderation',
    data: b('raid', 'Mode Raid : activer, désactiver, libérer ou purger la quarantaine.', P.ManageGuild)
      .addSubcommand(s => s.setName('on').setDescription('Activer le mode raid'))
      .addSubcommand(s => s.setName('off').setDescription('Désactiver le mode raid'))
      .addSubcommand(s => s.setName('status').setDescription('État du mode raid'))
      .addSubcommand(s => s.setName('setup').setDescription('Créer / configurer le rôle de quarantaine'))
      .addSubcommand(s => s.setName('release').setDescription('Libérer tous les membres en quarantaine'))
      .addSubcommand(s => s.setName('purge').setDescription('Expulser tous les membres en quarantaine')),
    async run(i) {
      const sub = i.options.getSubcommand();
      const st = raidState(i.guildId);
      const cfg = getConfig(i.guildId).moderation;
      if (sub === 'on') { st.on = true; st.since = Date.now(); setRaid(i.guildId, st); if (!cfg.quarantineRole) await setupQuarantine(i.guild); return i.reply(ok('🚨 Mode raid **activé** : les nouveaux membres seront mis en quarantaine.')); }
      if (sub === 'off') { st.on = false; setRaid(i.guildId, st); return i.reply(ok('Mode raid **désactivé**. Pense à `/raid release` ou `/raid purge`.')); }
      if (sub === 'status') return i.reply({ embeds: [new EmbedBuilder().setColor(st.on ? COLORS.err : COLORS.ok).setTitle('Mode raid').setDescription(`État : **${st.on ? 'ACTIVÉ' : 'désactivé'}**${st.on ? ` depuis ${ts(st.since)}` : ''}\nEn quarantaine : **${st.quarantined.length}**\nDétection auto : ${cfg.autoRaid ? `oui (${cfg.raidJoins} arrivées en ${cfg.raidSeconds}s)` : 'non'}`)] });
      await i.deferReply();
      if (sub === 'setup') { const r = await setupQuarantine(i.guild); return i.editReply(ok(`Rôle de quarantaine prêt : ${r}. Il ne voit plus aucun salon.`)); }
      let n = 0;
      for (const id of st.quarantined) {
        const m = await i.guild.members.fetch(id).catch(() => null); if (!m) continue;
        if (sub === 'release') { if (await m.roles.remove(cfg.quarantineRole).then(() => 1).catch(() => 0)) n++; }
        else if (await m.kick('Purge du raid').then(() => 1).catch(() => 0)) n++;
      }
      st.quarantined = []; setRaid(i.guildId, st);
      i.editReply(ok(sub === 'release' ? `${n} membre(s) libéré(s).` : `${n} membre(s) expulsé(s).`));
    },
  },
];

export { chunk, updateTimerAt };
