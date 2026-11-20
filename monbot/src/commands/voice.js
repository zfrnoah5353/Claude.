// Vocaux temporaires : un salon perso pour chaque membre + /voice pour le gérer
import { SlashCommandBuilder, ChannelType, EmbedBuilder, PermissionFlagsBits as P, Events } from 'discord.js';
import { getConfig, patchModule, kvGet, kvSet, kvDel, kvList } from '../db.js';
import { ok, err, COLORS, fill } from '../util.js';

const getTvc = (cid) => kvGet('tvc', cid);
const saveTvc = (cid, v) => kvSet('tvc', cid, v);

function owned(i) {
  const vc = i.member.voice.channel;
  const t = vc && getTvc(vc.id);
  if (!t) { i.reply(err('Tu dois être dans ton salon vocal temporaire.')); return null; }
  if (t.owner !== i.user.id && !['claim', 'info'].includes(i.options.getSubcommand())) { i.reply(err('Ce salon ne t\'appartient pas (utilise `/voice claim` si le propriétaire est parti).')); return null; }
  return { vc, t };
}

const userSub = (name, desc) => (s) => s.setName(name).setDescription(desc).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true));

export const commands = [
  {
    module: 'tempvoice',
    data: new SlashCommandBuilder().setName('tempvoice').setDescription('Vocaux temporaires : crée un salon générateur.').setDefaultMemberPermissions(P.ManageGuild).setDMPermission(false)
      .addSubcommand(s => s.setName('setup').setDescription('Créer la catégorie et le salon générateur')),
    async run(i) {
      await i.deferReply();
      const cat = await i.guild.channels.create({ name: '🔊 Vocaux temporaires', type: ChannelType.GuildCategory });
      const gen = await i.guild.channels.create({ name: '➕ Créer mon salon', type: ChannelType.GuildVoice, parent: cat.id });
      patchModule(i.guildId, 'tempvoice', { enabled: true, generator: gen.id, category: cat.id });
      i.editReply(ok(`C'est prêt ! Rejoins ${gen} pour créer ton salon vocal. Gère-le avec \`/voice\`.`));
    },
  },
  {
    module: 'tempvoice',
    data: new SlashCommandBuilder().setName('voice').setDescription('Gère ton salon vocal temporaire.').setDMPermission(false)
      .addSubcommand(s => s.setName('rename').setDescription('Renommer').addStringOption(o => o.setName('nom').setDescription('Nouveau nom').setRequired(true).setMaxLength(90)))
      .addSubcommand(s => s.setName('limit').setDescription('Limite de membres').addIntegerOption(o => o.setName('nombre').setDescription('0 = aucune').setRequired(true).setMinValue(0).setMaxValue(99)))
      .addSubcommand(s => s.setName('lock').setDescription('Verrouiller (personne ne peut rejoindre)'))
      .addSubcommand(s => s.setName('unlock').setDescription('Déverrouiller'))
      .addSubcommand(s => s.setName('hide').setDescription('Cacher le salon'))
      .addSubcommand(s => s.setName('unhide').setDescription('Rendre visible'))
      .addSubcommand(userSub('permit', 'Autoriser un membre'))
      .addSubcommand(userSub('reject', 'Refuser un membre (et l\'expulser)'))
      .addSubcommand(userSub('kick', 'Expulser un membre du salon'))
      .addSubcommand(userSub('ban', 'Bannir un membre de ton salon'))
      .addSubcommand(userSub('unban', 'Débannir un membre de ton salon'))
      .addSubcommand(userSub('transfer', 'Donner le salon à un membre'))
      .addSubcommand(s => s.setName('claim').setDescription('Récupérer le salon si le propriétaire est parti'))
      .addSubcommand(s => s.setName('bitrate').setDescription('Qualité audio').addIntegerOption(o => o.setName('kbps').setDescription('8-384').setRequired(true).setMinValue(8).setMaxValue(384)))
      .addSubcommand(s => s.setName('region').setDescription('Région vocale').addStringOption(o => o.setName('region').setDescription('Région').setRequired(true).addChoices({ name: 'Automatique', value: 'auto' }, { name: 'Rotterdam (Europe)', value: 'rotterdam' }, { name: 'US Est', value: 'us-east' }, { name: 'US Ouest', value: 'us-west' }, { name: 'Brésil', value: 'brazil' }, { name: 'Japon', value: 'japan' }, { name: 'Singapour', value: 'singapore' })))
      .addSubcommand(s => s.setName('nsfw').setDescription('Activer / désactiver le mode NSFW'))
      .addSubcommand(s => s.setName('invite').setDescription('Créer une invitation vers ton salon').addUserOption(o => o.setName('membre').setDescription('Envoyer l\'invitation en MP à ce membre')))
      .addSubcommand(s => s.setName('waiting').setDescription('Créer / retirer une salle d\'attente'))
      .addSubcommand(s => s.setName('save').setDescription('Sauvegarder les réglages de ton salon'))
      .addSubcommand(s => s.setName('reset').setDescription('Remettre les réglages par défaut'))
      .addSubcommand(s => s.setName('delete').setDescription('Supprimer ton salon'))
      .addSubcommand(s => s.setName('info').setDescription('Infos sur le salon')),
    async run(i) {
      const o = owned(i); if (!o) return;
      const { vc, t } = o; const sub = i.options.getSubcommand(); const ev = i.guild.roles.everyone;
      const target = i.options.getUser('membre');
      switch (sub) {
        case 'rename': await vc.setName(i.options.getString('nom')); return i.reply(ok('Salon renommé. (Discord limite à 2 renommages toutes les 10 min.)'));
        case 'limit': await vc.setUserLimit(i.options.getInteger('nombre')); return i.reply(ok(`Limite : ${i.options.getInteger('nombre') || 'aucune'}.`));
        case 'lock': await vc.permissionOverwrites.edit(ev, { Connect: false }); return i.reply(ok('🔒 Salon verrouillé.'));
        case 'unlock': await vc.permissionOverwrites.edit(ev, { Connect: null }); return i.reply(ok('🔓 Salon déverrouillé.'));
        case 'hide': await vc.permissionOverwrites.edit(ev, { ViewChannel: false }); return i.reply(ok('🙈 Salon caché.'));
        case 'unhide': await vc.permissionOverwrites.edit(ev, { ViewChannel: null }); return i.reply(ok('👀 Salon visible.'));
        case 'permit': await vc.permissionOverwrites.edit(target.id, { Connect: true, ViewChannel: true }); return i.reply(ok(`${target} peut rejoindre.`));
        case 'reject': case 'ban': {
          await vc.permissionOverwrites.edit(target.id, { Connect: false, ...(sub === 'ban' ? { ViewChannel: false } : {}) });
          const m = await i.guild.members.fetch(target.id).catch(() => null); if (m?.voice.channelId === vc.id) await m.voice.disconnect().catch(() => {});
          return i.reply(ok(`${target} ${sub === 'ban' ? 'est banni de' : 'ne peut plus rejoindre'} ton salon.`));
        }
        case 'unban': await vc.permissionOverwrites.delete(target.id); return i.reply(ok(`${target} est débanni.`));
        case 'kick': { const m = await i.guild.members.fetch(target.id).catch(() => null); if (m?.voice.channelId !== vc.id) return i.reply(err('Ce membre n\'est pas dans ton salon.')); await m.voice.disconnect(); return i.reply(ok(`${target} expulsé du salon.`)); }
        case 'transfer': { const m = vc.members.get(target.id); if (!m) return i.reply(err('Ce membre doit être dans ton salon.')); t.owner = target.id; saveTvc(vc.id, t); await vc.permissionOverwrites.edit(target.id, { ManageChannels: true, MoveMembers: true, Connect: true }); return i.reply(ok(`${target} est le nouveau propriétaire.`)); }
        case 'claim': {
          if (t.owner === i.user.id) return i.reply(err('Ce salon est déjà à toi.'));
          if (vc.members.has(t.owner)) return i.reply(err('Le propriétaire est encore là.'));
          t.owner = i.user.id; saveTvc(vc.id, t); await vc.permissionOverwrites.edit(i.user.id, { ManageChannels: true, MoveMembers: true, Connect: true }); return i.reply(ok('Tu es le nouveau propriétaire 👑'));
        }
        case 'bitrate': { const max = i.guild.maximumBitrate / 1000; const k = Math.min(i.options.getInteger('kbps'), max); await vc.setBitrate(k * 1000); return i.reply(ok(`Bitrate : ${k} kbps.`)); }
        case 'region': { const r = i.options.getString('region'); await vc.setRTCRegion(r === 'auto' ? null : r); return i.reply(ok(`Région : ${r}.`)); }
        case 'nsfw': await vc.setNSFW(!vc.nsfw); return i.reply(ok(`NSFW ${vc.nsfw ? 'activé' : 'désactivé'}.`));
        case 'invite': {
          const inv = await vc.createInvite({ maxAge: 3600, maxUses: 5 });
          if (target) { await target.send(`🔊 ${i.user.username} t'invite dans son salon vocal : ${inv.url}`).catch(() => {}); return i.reply(ok(`Invitation envoyée à ${target}.`)); }
          return i.reply(ok(`Invitation (1 h) : ${inv.url}`));
        }
        case 'waiting': {
          if (t.waiting) { await i.guild.channels.cache.get(t.waiting)?.delete().catch(() => {}); t.waiting = null; saveTvc(vc.id, t); await vc.permissionOverwrites.edit(ev, { Connect: null }); return i.reply(ok('Salle d\'attente retirée.')); }
          const w = await i.guild.channels.create({ name: `⏳ Attente · ${i.user.username}`, type: ChannelType.GuildVoice, parent: vc.parentId });
          await vc.permissionOverwrites.edit(ev, { Connect: false });
          t.waiting = w.id; saveTvc(vc.id, t);
          return i.reply(ok(`Salle d'attente créée : ${w}. Utilise \`/voice permit\` pour faire entrer quelqu'un, il pourra alors te rejoindre.`));
        }
        case 'save': kvSet('tvcsave', `${i.guildId}:${i.user.id}`, { name: vc.name, limit: vc.userLimit, bitrate: vc.bitrate, locked: vc.permissionOverwrites.cache.get(ev.id)?.deny.has(P.Connect) || false }); return i.reply(ok('Réglages sauvegardés : ils seront appliqués à ton prochain salon.'));
        case 'reset': kvDel('tvcsave', `${i.guildId}:${i.user.id}`); return i.reply(ok('Réglages remis par défaut.'));
        case 'delete': await i.reply(ok('Suppression…')); return vc.delete().catch(() => {});
        case 'info': return i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setTitle(`🔊 ${vc.name}`).setDescription(`Propriétaire : <@${t.owner}>\nMembres : ${vc.members.size}${vc.userLimit ? `/${vc.userLimit}` : ''}\nBitrate : ${vc.bitrate / 1000} kbps\nRégion : ${vc.rtcRegion || 'auto'}`)] });
      }
    },
  },
];

export function register(client) {
  client.on(Events.VoiceStateUpdate, async (oldS, newS) => {
    const g = newS.guild; const cfg = getConfig(g.id).tempvoice;
    // Création
    if (cfg.enabled && cfg.generator && newS.channelId === cfg.generator && newS.member) {
      const saved = kvGet('tvcsave', `${g.id}:${newS.id}`);
      const parent = cfg.category && g.channels.cache.has(cfg.category) ? cfg.category : newS.channel.parentId;
      const vc = await g.channels.create({
        name: saved?.name || fill(cfg.nameTemplate, { user: newS.member.displayName }), type: ChannelType.GuildVoice, parent,
        userLimit: saved?.limit ?? cfg.defaultLimit, bitrate: Math.min(saved?.bitrate || 64000, g.maximumBitrate),
        permissionOverwrites: [{ id: newS.id, allow: [P.ManageChannels, P.MoveMembers, P.Connect, P.ViewChannel] }, ...(saved?.locked ? [{ id: g.roles.everyone.id, deny: [P.Connect] }] : [])],
      }).catch(e => { console.error('Vocal temporaire :', e.message); return null; });
      if (vc) { saveTvc(vc.id, { owner: newS.id, guild: g.id, waiting: null }); await newS.setChannel(vc).catch(() => {}); }
    }
    // Suppression des salons vides
    if (oldS.channelId && oldS.channelId !== newS.channelId) {
      const t = getTvc(oldS.channelId);
      if (t && oldS.channel && oldS.channel.members.size === 0) {
        if (t.waiting) await g.channels.cache.get(t.waiting)?.delete().catch(() => {});
        await oldS.channel.delete('Salon temporaire vide').catch(() => {});
        kvDel('tvc', oldS.channelId);
      }
    }
  });
  // Nettoyage au démarrage
  client.once(Events.ClientReady, () => {
    for (const { key, value } of kvList('tvc')) {
      const c = client.channels.cache.get(key);
      if (!c) kvDel('tvc', key); else if (c.members?.size === 0) { c.delete().catch(() => {}); kvDel('tvc', key); }
    }
  });
}
