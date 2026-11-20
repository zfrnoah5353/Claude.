// Musique (discord-player) : lecture, file d'attente, playlists, filtres, boutons
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { Player, QueryType, QueueRepeatMode } from 'discord-player';
import { getConfig } from '../db.js';
import { ok, err, COLORS } from '../util.js';

let player = null;
const PINK = 0xEB459E;
const FILTERS = ['bassboost', 'nightcore', 'vaporwave', '8D', 'karaoke', 'tremolo', 'vibrato', 'reverse', 'normalizer'];
const ENGINES = { auto: QueryType.AUTO, soundcloud: QueryType.SOUNDCLOUD_SEARCH, spotify: QueryType.SPOTIFY_SEARCH, youtube: QueryType.YOUTUBE_SEARCH };

const controls = (paused = false) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('mu:toggle').setEmoji(paused ? '▶️' : '⏸️').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('mu:skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('mu:stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId('mu:loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('mu:shuffle').setEmoji('🔀').setStyle(ButtonStyle.Secondary),
);
const trackEmbed = (t, title = '🎵 En cours de lecture') => new EmbedBuilder().setColor(PINK).setTitle(title).setDescription(`**[${t.title}](${t.url})**\n${t.author} · ${t.duration}`).setThumbnail(t.thumbnail || null).setFooter({ text: `Demandé par ${t.requestedBy?.username || '?'}` });

function canControl(i) {
  const cfg = getConfig(i.guildId).music;
  if (cfg.djRole && !i.member.roles.cache.has(cfg.djRole) && !i.member.permissions.has('ManageGuild')) return 'Il faut le rôle DJ.';
  const q = player?.nodes.get(i.guildId);
  if (!q) return 'Aucune musique en cours.';
  if (i.member.voice.channelId !== q.channel?.id) return 'Rejoins le même salon vocal que moi.';
  return null;
}

async function playQuery(i, query, engine = 'auto') {
  const vc = i.member.voice.channel;
  if (!vc) return i.editReply(err('Rejoins d\'abord un salon vocal.'));
  const cfg = getConfig(i.guildId).music;
  const q = player.nodes.get(i.guildId);
  if (q && q.tracks.size >= cfg.maxQueue) return i.editReply(err('La file d\'attente est pleine.'));
  const { track } = await player.play(vc, query, {
    searchEngine: ENGINES[engine] || QueryType.AUTO, requestedBy: i.user,
    nodeOptions: { metadata: { channel: i.channel }, volume: cfg.defaultVolume, leaveOnEnd: cfg.leaveOnEnd, leaveOnEndCooldown: 60e3, leaveOnEmpty: true, leaveOnEmptyCooldown: 60e3, selfDeaf: true },
  });
  return track;
}

export const commands = [
  {
    module: 'music',
    data: new SlashCommandBuilder().setName('play').setDescription('Jouer une musique.').setDMPermission(false)
      .addStringOption(o => o.setName('query').setDescription('Titre ou lien').setRequired(true))
      .addStringOption(o => o.setName('plateforme').setDescription('Où chercher').addChoices({ name: 'Auto', value: 'auto' }, { name: 'SoundCloud', value: 'soundcloud' }, { name: 'Spotify', value: 'spotify' }, { name: 'YouTube', value: 'youtube' })),
    async run(i) {
      if (!player) return i.reply(err('La musique n\'est pas disponible (module audio non chargé).'));
      await i.deferReply();
      try {
        const t = await playQuery(i, i.options.getString('query'), i.options.getString('plateforme') || 'auto');
        if (t) i.editReply({ embeds: [trackEmbed(t, '➕ Ajouté à la file')] });
      } catch (e) { i.editReply(err(`Impossible de lire ça : ${e.message?.slice(0, 200) || e}`)); }
    },
  },
  {
    module: 'music',
    data: new SlashCommandBuilder().setName('playlist').setDescription('Joue et consulte les playlists du serveur.').setDMPermission(false)
      .addSubcommand(s => s.setName('play').setDescription('Jouer une playlist').addStringOption(o => o.setName('nom').setDescription('Playlist').setRequired(true).setAutocomplete(true)))
      .addSubcommand(s => s.setName('list').setDescription('Liste des playlists'))
      .addSubcommand(s => s.setName('info').setDescription('Contenu d\'une playlist').addStringOption(o => o.setName('nom').setDescription('Playlist').setRequired(true).setAutocomplete(true))),
    autocomplete: (i) => { const q = i.options.getFocused().toLowerCase(); i.respond(getConfig(i.guildId).music.playlists.filter(p => p.name?.toLowerCase().includes(q)).slice(0, 25).map(p => ({ name: p.name, value: p.name }))); },
    async run(i) {
      const lists = getConfig(i.guildId).music.playlists; const sub = i.options.getSubcommand();
      if (sub === 'list') return i.reply({ embeds: [new EmbedBuilder().setColor(PINK).setTitle('📀 Playlists du serveur').setDescription(lists.map(p => `**${p.name}** · ${(p.tracks || '').split('\n').filter(Boolean).length} titres`).join('\n') || 'Aucune (crée-les dans le panel).')] });
      const p = lists.find(x => x.name?.toLowerCase() === i.options.getString('nom').toLowerCase());
      if (!p) return i.reply(err('Playlist introuvable.'));
      const tracks = (p.tracks || '').split('\n').map(s => s.trim()).filter(Boolean);
      if (sub === 'info') return i.reply({ embeds: [new EmbedBuilder().setColor(PINK).setTitle(`📀 ${p.name}`).setDescription(tracks.map((t, k) => `${k + 1}. ${t}`).join('\n').slice(0, 4000) || 'Vide.')] });
      if (!player) return i.reply(err('La musique n\'est pas disponible.'));
      await i.deferReply(); let n = 0;
      for (const t of tracks) { try { await playQuery(i, t); n++; } catch {} }
      i.editReply(ok(`Playlist **${p.name}** : ${n}/${tracks.length} titres ajoutés.`));
    },
  },
  {
    module: 'music',
    data: new SlashCommandBuilder().setName('music').setDescription('Contrôles du lecteur musical.').setDMPermission(false)
      .addSubcommand(s => s.setName('pause').setDescription('Pause'))
      .addSubcommand(s => s.setName('resume').setDescription('Reprendre'))
      .addSubcommand(s => s.setName('skip').setDescription('Passer'))
      .addSubcommand(s => s.setName('stop').setDescription('Arrêter et quitter'))
      .addSubcommand(s => s.setName('queue').setDescription('File d\'attente'))
      .addSubcommand(s => s.setName('nowplaying').setDescription('Musique en cours'))
      .addSubcommand(s => s.setName('shuffle').setDescription('Mélanger'))
      .addSubcommand(s => s.setName('clear').setDescription('Vider la file'))
      .addSubcommand(s => s.setName('volume').setDescription('Volume').addIntegerOption(o => o.setName('niveau').setDescription('1-100').setRequired(true).setMinValue(1).setMaxValue(100)))
      .addSubcommand(s => s.setName('seek').setDescription('Aller à un moment').addStringOption(o => o.setName('temps').setDescription('Ex : 1:30').setRequired(true)))
      .addSubcommand(s => s.setName('remove').setDescription('Retirer un titre').addIntegerOption(o => o.setName('position').setDescription('Position dans la file').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('jump').setDescription('Sauter à un titre').addIntegerOption(o => o.setName('position').setDescription('Position dans la file').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('loop').setDescription('Mode répétition').addStringOption(o => o.setName('mode').setDescription('Mode').setRequired(true).addChoices({ name: 'Désactivé', value: 'off' }, { name: 'Titre', value: 'track' }, { name: 'File', value: 'queue' }, { name: 'Autoplay', value: 'autoplay' })))
      .addSubcommand(s => s.setName('filter').setDescription('Activer / désactiver un filtre audio').addStringOption(o => o.setName('filtre').setDescription('Filtre').setRequired(true).addChoices(...FILTERS.map(f => ({ name: f, value: f })), { name: 'Tout retirer', value: 'off' }))),
    async run(i) {
      const sub = i.options.getSubcommand();
      const q = player?.nodes.get(i.guildId);
      if (['queue', 'nowplaying'].includes(sub)) {
        if (!q?.currentTrack) return i.reply(err('Aucune musique en cours.'));
        if (sub === 'nowplaying') return i.reply({ embeds: [trackEmbed(q.currentTrack).addFields({ name: 'Progression', value: q.node.createProgressBar() || '—' })], components: [controls(q.node.isPaused())] });
        const list = q.tracks.toArray();
        return i.reply({ embeds: [new EmbedBuilder().setColor(PINK).setTitle(`📜 File d'attente (${list.length})`).setDescription(`**En cours :** ${q.currentTrack.title}\n\n${list.slice(0, 15).map((t, k) => `**${k + 1}.** ${t.title} · ${t.duration}`).join('\n')}${list.length > 15 ? `\n… et ${list.length - 15} autres` : ''}`)] });
      }
      const pb = canControl(i); if (pb) return i.reply(err(pb));
      switch (sub) {
        case 'pause': q.node.pause(); return i.reply(ok('⏸️ Pause.'));
        case 'resume': q.node.resume(); return i.reply(ok('▶️ Reprise.'));
        case 'skip': q.node.skip(); return i.reply(ok('⏭️ Titre passé.'));
        case 'stop': q.delete(); return i.reply(ok('⏹️ Musique arrêtée.'));
        case 'shuffle': q.tracks.shuffle(); return i.reply(ok('🔀 File mélangée.'));
        case 'clear': q.tracks.clear(); return i.reply(ok('🧹 File vidée.'));
        case 'volume': q.node.setVolume(i.options.getInteger('niveau')); return i.reply(ok(`🔊 Volume : ${i.options.getInteger('niveau')}%`));
        case 'seek': { const parts = i.options.getString('temps').split(':').map(Number).reverse(); const ms = ((parts[0] || 0) + (parts[1] || 0) * 60 + (parts[2] || 0) * 3600) * 1000; await q.node.seek(ms); return i.reply(ok(`⏩ Position : ${i.options.getString('temps')}`)); }
        case 'remove': { const t = q.tracks.toArray()[i.options.getInteger('position') - 1]; if (!t) return i.reply(err('Position invalide.')); q.node.remove(t); return i.reply(ok(`Retiré : **${t.title}**`)); }
        case 'jump': { const t = q.tracks.toArray()[i.options.getInteger('position') - 1]; if (!t) return i.reply(err('Position invalide.')); q.node.skipTo(t); return i.reply(ok(`⏭️ Saut vers **${t.title}**`)); }
        case 'loop': { const m = { off: QueueRepeatMode.OFF, track: QueueRepeatMode.TRACK, queue: QueueRepeatMode.QUEUE, autoplay: QueueRepeatMode.AUTOPLAY }[i.options.getString('mode')]; q.setRepeatMode(m); return i.reply(ok(`🔁 Répétition : ${i.options.getString('mode')}`)); }
        case 'filter': {
          const f = i.options.getString('filtre');
          if (f === 'off') { await q.filters.ffmpeg.setFilters(false); return i.reply(ok('Filtres retirés.')); }
          await q.filters.ffmpeg.toggle([f]); return i.reply(ok(`🎛️ Filtre **${f}** ${q.filters.ffmpeg.isEnabled(f) ? 'activé' : 'désactivé'}.`));
        }
      }
    },
  },
];

export async function register(client) {
  try {
    const { DefaultExtractors } = await import('@discord-player/extractor');
    player = new Player(client);
    await player.extractors.loadMulti(DefaultExtractors);
    player.events.on('playerStart', (queue, track) => { queue.metadata?.channel?.send({ embeds: [trackEmbed(track)], components: [controls()] }).catch(() => {}); });
    player.events.on('emptyQueue', (queue) => { queue.metadata?.channel?.send({ embeds: [new EmbedBuilder().setColor(PINK).setDescription('✅ File d\'attente terminée.')] }).catch(() => {}); });
    player.events.on('playerError', (queue, e) => { console.error('Musique :', e.message); queue.metadata?.channel?.send('❌ Erreur de lecture, je passe au titre suivant.').catch(() => {}); });
    player.events.on('error', (queue, e) => console.error('Musique (file) :', e.message));
    client.musicPlayer = player;
  } catch (e) { console.error('⚠️ Musique désactivée :', e.message); player = null; }

  client.components.set('mu', async (i, action) => {
    const pb = canControl(i); if (pb) return i.reply({ ...err(pb), flags: MessageFlags.Ephemeral });
    const q = player.nodes.get(i.guildId);
    if (action === 'toggle') { q.node.isPaused() ? q.node.resume() : q.node.pause(); return i.update({ components: [controls(q.node.isPaused())] }); }
    if (action === 'skip') { q.node.skip(); return i.reply({ content: `⏭️ Passé par ${i.user}.` }); }
    if (action === 'stop') { q.delete(); return i.update({ components: [] }); }
    if (action === 'loop') { const next = q.repeatMode === QueueRepeatMode.OFF ? QueueRepeatMode.TRACK : q.repeatMode === QueueRepeatMode.TRACK ? QueueRepeatMode.QUEUE : QueueRepeatMode.OFF; q.setRepeatMode(next); return i.reply({ content: `🔁 Répétition : ${['désactivée', 'titre', 'file', 'autoplay'][next]}`, flags: MessageFlags.Ephemeral }); }
    if (action === 'shuffle') { q.tracks.shuffle(); return i.reply({ content: '🔀 File mélangée.', flags: MessageFlags.Ephemeral }); }
  });
}
