import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, PermissionFlagsBits as P, version as djsVersion, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import QRCode from 'qrcode';
import { getConfig, getMember, kvGet, updateMember, allMembers } from '../db.js';
import { ok, err, COLORS, fill, memberVars, parseDuration, fmtDuration, isStaff, ts } from '../util.js';
import { xpNeeded, leaderboard, addXp } from '../modules/levels.js';
import { rankCard } from '../images.js';
import { totalInvites } from '../modules/invites.js';
import { createGiveaway, endGiveaway, listGw, getGw } from '../modules/giveaways.js';

const CATS = { 'Général': ['help', 'info', 'ping', 'qrcode', 'avis', 'support', 'c', 'invites', 'level', 'rank', 'voice'], 'Modération': ['ban', 'unban', 'editban', 'kick', 'mute', 'editmute', 'unmute', 'warn', 'delwarn', 'history', 'clear', 'lock', 'unlock', 'nuke', 'massrole', 'addrole', 'removerole', 'rolelist', 'raid', 'giveaway', 'ticket', 'transfer'], 'Économie': ['balance', 'daily', 'weekly', 'work', 'pay', 'rob', 'blackjack', 'coinflip', 'roulette', 'slots', 'shop', 'inventory', 'use', 'leaderboard', 'eco'], 'Fun': ['flamme', 'flamme-admin', 'jeu', 'hug', 'kiss', 'slap', 'joke', 'maths', 'tupreferes', 'profil', 'avatar', 'description', 'anniversaire-set', 'anniversaire-liste', 'sondage'], 'Musique': ['play', 'playlist', 'music'], 'Propriétaire': ['backup', 'tempvoice'] };

function helpEmbed(client, cat) {
  const e = new EmbedBuilder().setColor(COLORS.main).setThumbnail(client.user.displayAvatarURL());
  if (!cat || !CATS[cat]) {
    e.setTitle(`📖 Aide de ${process.env.BOT_NAME || client.user.username}`).setDescription(`**${client.commands.size} commandes** · tout se règle aussi depuis le panel.\nChoisis une catégorie dans le menu ci-dessous.`)
      .addFields(Object.entries(CATS).map(([k, v]) => ({ name: k, value: `${v.length} commandes`, inline: true })));
  } else {
    e.setTitle(`📖 ${cat}`).setDescription(CATS[cat].map(n => { const c = client.commands.get(n); return c ? `**/${n}** — ${c.data.description}` : null; }).filter(Boolean).join('\n'));
  }
  return e;
}
const helpMenu = () => new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('help').setPlaceholder('Catégorie…').addOptions(Object.keys(CATS).map(k => ({ label: k, value: k }))));

export const commands = [
  {
    data: new SlashCommandBuilder().setName('help').setDescription('Besoin d\'aide sur l\'utilisation du bot ?').addStringOption(o => o.setName('category').setDescription('Catégorie').addChoices(...Object.keys(CATS).map(k => ({ name: k, value: k })))),
    run: (i) => i.reply({ embeds: [helpEmbed(i.client, i.options.getString('category'))], components: [helpMenu()] }),
  },
  {
    data: new SlashCommandBuilder().setName('info').setDescription('Affiche les informations du bot.'),
    run: (i) => {
      const c = i.client;
      const members = c.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
      i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.main).setTitle(`🤖 ${process.env.BOT_NAME || c.user.username}`).setThumbnail(c.user.displayAvatarURL()).addFields(
        { name: 'Serveurs', value: `${c.guilds.cache.size}`, inline: true }, { name: 'Membres', value: members.toLocaleString('fr-FR'), inline: true }, { name: 'Commandes', value: `${c.commands.size}`, inline: true },
        { name: 'En ligne depuis', value: ts(c.startedAt), inline: true }, { name: 'Ping', value: `${c.ws.ping} ms`, inline: true }, { name: 'Version', value: `discord.js ${djsVersion} · Node ${process.version}`, inline: true },
        { name: 'Mémoire', value: `${Math.round(process.memoryUsage().rss / 1048576)} Mo`, inline: true })] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('ping').setDescription('Vérifier le ping du robot.'),
    run: async (i) => { const t = Date.now(); await i.reply('🏓 …'); i.editReply(`🏓 Pong ! Latence : **${Date.now() - t} ms** · API : **${i.client.ws.ping} ms**`); },
  },
  {
    data: new SlashCommandBuilder().setName('qrcode').setDescription('Génère un QR code pour une URL.').addStringOption(o => o.setName('url').setDescription('Lien ou texte').setRequired(true)),
    run: async (i) => {
      const buf = await QRCode.toBuffer(i.options.getString('url'), { width: 512, margin: 2 });
      i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.main).setTitle('QR code').setDescription(i.options.getString('url').slice(0, 500)).setImage('attachment://qrcode.png')], files: [new AttachmentBuilder(buf, { name: 'qrcode.png' })] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('support').setDescription('Affiche le liens discord du support du bot.'),
    run: (i) => i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.main).setDescription(process.env.SUPPORT_URL ? `🛟 Serveur de support : ${process.env.SUPPORT_URL}` : '🛟 Contacte le propriétaire du bot pour obtenir de l\'aide.')] }),
  },
  {
    module: 'customcmds',
    data: new SlashCommandBuilder().setName('c').setDescription('Exécute une commande personnalisée du serveur.').setDMPermission(false)
      .addStringOption(o => o.setName('tag').setDescription('Nom de la commande').setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName('args').setDescription('Texte en plus')),
    autocomplete: (i) => {
      const q = i.options.getFocused().toLowerCase();
      i.respond(getConfig(i.guildId).customcmds.commands.filter(c => c.tag?.toLowerCase().includes(q)).slice(0, 25).map(c => ({ name: c.tag, value: c.tag })));
    },
    run: (i) => {
      const tag = i.options.getString('tag').toLowerCase();
      const c = getConfig(i.guildId).customcmds.commands.find(x => x.tag?.toLowerCase() === tag);
      if (!c) return i.reply(err('Commande inconnue. Elles se créent dans le panel.'));
      if (c.staffOnly && !isStaff(i.member)) return i.reply(err('Commande réservée au staff.'));
      const text = fill(c.response, memberVars(i.member, { args: i.options.getString('args') || '' }));
      i.reply(c.embed ? { embeds: [new EmbedBuilder().setColor(COLORS.main).setDescription(text)] } : { content: text });
    },
  },
  {
    module: 'invites',
    data: new SlashCommandBuilder().setName('invites').setDescription('Affiche les statistiques d\'invitations.').setDMPermission(false)
      .addSubcommand(s => s.setName('me').setDescription('Mes invitations'))
      .addSubcommand(s => s.setName('user').setDescription('Invitations d\'un membre').addUserOption(o => o.setName('user').setDescription('Membre').setRequired(true)))
      .addSubcommand(s => s.setName('leaderboard').setDescription('Classement des invitations'))
      .addSubcommand(s => s.setName('history').setDescription('Dernières personnes invitées').addUserOption(o => o.setName('user').setDescription('Membre'))),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'leaderboard') {
        const top = allMembers(i.guildId).map(m => ({ id: m.id, t: totalInvites(m), m })).filter(x => x.t > 0).sort((a, b) => b.t - a.t).slice(0, 15);
        return i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.main).setTitle('📨 Classement des invitations').setDescription(top.map((x, k) => `**${k + 1}.** <@${x.id}> — **${x.t}** (${x.m.invites.real} vraies, ${x.m.invites.fake} fausses, ${x.m.invites.left} parties)`).join('\n') || 'Personne pour l\'instant.')] });
      }
      const u = i.options.getUser('user') || i.user;
      if (sub === 'history') {
        const h = kvGet('invhist', i.guildId, []).filter(x => x.inviter === u.id).slice(0, 15);
        return i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.main).setTitle(`📨 Invités par ${u.username}`).setDescription(h.map(x => `<@${x.user}> · ${ts(x.at)}${x.fake ? ' ⚠️' : ''}`).join('\n') || 'Aucun.')] });
      }
      const m = getMember(i.guildId, u.id);
      i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.main).setAuthor({ name: u.username, iconURL: u.displayAvatarURL() }).setDescription(`**${totalInvites(m)}** invitations\n✅ ${m.invites.real} vraies · ❌ ${m.invites.fake} fausses · 🚪 ${m.invites.left} parties · 🎁 ${m.invites.bonus} bonus`)] });
    },
  },
  {
    module: 'levels',
    data: new SlashCommandBuilder().setName('rank').setDescription('Affiche ton niveau et ta progression XP.').setDMPermission(false).addUserOption(o => o.setName('user').setDescription('Membre')),
    run: async (i) => {
      await i.deferReply();
      const u = i.options.getUser('user') || i.user;
      const m = getMember(i.guildId, u.id);
      const rank = leaderboard(i.guildId).findIndex(x => x.id === u.id) + 1 || '—';
      const file = await rankCard(u, { level: m.level, xp: m.xp, need: xpNeeded(m.level), rank, color: getConfig(i.guildId).levels.cardColor });
      i.editReply({ files: [file] });
    },
  },
  {
    module: 'levels',
    data: new SlashCommandBuilder().setName('level').setDescription('Niveaux : classement et gestion de l\'XP.').setDMPermission(false)
      .addSubcommand(s => s.setName('top').setDescription('Classement des niveaux').addIntegerOption(o => o.setName('page').setDescription('Page').setMinValue(1)))
      .addSubcommand(s => s.setName('add').setDescription('Ajouter de l\'XP (staff)').addUserOption(o => o.setName('user').setDescription('Membre').setRequired(true)).addIntegerOption(o => o.setName('xp').setDescription('XP').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('remove').setDescription('Retirer de l\'XP (staff)').addUserOption(o => o.setName('user').setDescription('Membre').setRequired(true)).addIntegerOption(o => o.setName('xp').setDescription('XP').setRequired(true).setMinValue(1))),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'top') {
        const page = (i.options.getInteger('page') || 1) - 1;
        const lb = leaderboard(i.guildId); const slice = lb.slice(page * 10, page * 10 + 10);
        return i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.main).setTitle(`📈 Classement des niveaux (page ${page + 1}/${Math.max(1, Math.ceil(lb.length / 10))})`).setDescription(slice.map((m, k) => `**${page * 10 + k + 1}.** <@${m.id}> — niveau **${m.level}** (${m.xp}/${xpNeeded(m.level)} XP)`).join('\n') || 'Personne pour l\'instant.')] });
      }
      if (!i.member.permissions.has(P.ManageGuild) && !isStaff(i.member)) return i.reply(err('Réservé au staff.'));
      const u = i.options.getUser('user'); const xp = i.options.getInteger('xp');
      const m = await addXp(i.guild, u.id, sub === 'add' ? xp : -xp);
      i.reply(ok(`${u} est maintenant niveau **${m.level}** (${m.xp} XP).`));
    },
  },
  {
    module: 'giveaway',
    data: new SlashCommandBuilder().setName('giveaway').setDescription('Gère les giveaways sur ce serveur.').setDefaultMemberPermissions(P.ManageGuild).setDMPermission(false)
      .addSubcommand(s => s.setName('create').setDescription('Lancer un giveaway')
        .addStringOption(o => o.setName('prize').setDescription('Lot').setRequired(true))
        .addStringOption(o => o.setName('duration').setDescription('Durée (ex : 1d, 2h)').setRequired(true))
        .addIntegerOption(o => o.setName('winners').setDescription('Nombre de gagnants').setMinValue(1).setMaxValue(50))
        .addChannelOption(o => o.setName('channel').setDescription('Salon'))
        .addRoleOption(o => o.setName('required_role').setDescription('Rôle requis'))
        .addIntegerOption(o => o.setName('min_level').setDescription('Niveau minimum').setMinValue(1))
        .addStringOption(o => o.setName('description').setDescription('Description')))
      .addSubcommand(s => s.setName('end').setDescription('Terminer un giveaway maintenant').addStringOption(o => o.setName('message_id').setDescription('ID du message du giveaway').setRequired(true)))
      .addSubcommand(s => s.setName('reroll').setDescription('Retirer de nouveaux gagnants').addStringOption(o => o.setName('message_id').setDescription('ID du message du giveaway').setRequired(true)))
      .addSubcommand(s => s.setName('list').setDescription('Giveaways en cours')),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'create') {
        const d = parseDuration(i.options.getString('duration')); if (!d) return i.reply(err('Durée invalide (ex : 1d, 2h, 30m).'));
        const ch = i.options.getChannel('channel') || i.channel;
        await createGiveaway(ch, { prize: i.options.getString('prize'), duration: d, winners: i.options.getInteger('winners') || 1, host: i.user.id, description: i.options.getString('description') || '', requiredRole: i.options.getRole('required_role')?.id, minLevel: i.options.getInteger('min_level') || 0 });
        return i.reply({ ...ok(`Giveaway lancé dans ${ch} pour ${fmtDuration(d)} !`), ephemeral: true });
      }
      if (sub === 'list') {
        const l = listGw(i.guildId).filter(g => !g.ended);
        return i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warn).setTitle('🎁 Giveaways en cours').setDescription(l.map(g => `**${g.prize}** · <#${g.channel}> · fin ${ts(g.end)} · ${g.entries.length} participants · \`${g.id}\``).join('\n') || 'Aucun.')] });
      }
      const id = i.options.getString('message_id');
      const gw = getGw(id); if (!gw || gw.guild !== i.guildId) return i.reply(err('Giveaway introuvable.'));
      if (sub === 'end' && gw.ended) return i.reply(err('Ce giveaway est déjà terminé.'));
      if (sub === 'reroll' && !gw.ended) return i.reply(err('Ce giveaway n\'est pas encore terminé.'));
      await endGiveaway(i.client, id, sub === 'reroll');
      i.reply({ ...ok(sub === 'end' ? 'Giveaway terminé.' : 'Nouveaux gagnants tirés.'), ephemeral: true });
    },
  },
];

export function register(client) {
  client.components.set('help', (i) => i.update({ embeds: [helpEmbed(i.client, i.values[0])], components: [helpMenu()] }));
}
export { updateMember };
