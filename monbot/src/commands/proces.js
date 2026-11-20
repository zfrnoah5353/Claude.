// ⚖️ Procès : l'owner crée un procès (accusé, accusateur, avocats, juge, date/heure),
// le bot crée un événement public + un salon texte et un vocal où seuls les participants parlent.
// Preuves numérotées, témoins, analyse par l'IA pour le juge, vote public, verdict.
import {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits as P, OverwriteType, GuildScheduledEventPrivacyLevel, GuildScheduledEventEntityType, GuildScheduledEventStatus,
} from 'discord.js';
import Anthropic from '@anthropic-ai/sdk';
import { getConfig, kvGet, kvSet, kvList, addTimer } from '../db.js';
import { err, ok, ts, COLORS } from '../util.js';
import { sanction as modSanction } from '../modules/moderation.js';

const GOLD = 0xC9A227;
const key = (gid, n) => `${gid}:${n}`;
const getP = (k) => kvGet('proces', k);
const saveP = (k, p) => kvSet('proces', k, p);
const byChannel = (cid) => kvList('proces').map(x => ({ k: x.key, ...x.value })).find(p => p.text === cid || p.voice === cid);
const isOwner = (i) => i.user.id === i.guild.ownerId || i.member.permissions.has(P.Administrator);
const people = (p) => [p.accuse, p.accusateur, p.juge, p.avocatDefense, p.avocatAccusation, ...(p.temoins || [])].filter(Boolean);
const ROLE_NAMES = { accuse: '🧑‍⚖️ Accusé', accusateur: '📣 Accusateur', avocatAccusation: '⚔️ Avocat de l\'accusation', avocatDefense: '🛡️ Avocat de la défense', juge: '⚖️ Juge' };

// --- Date « JJ/MM/AAAA » + « HH:MM » en heure de Paris -> timestamp
function parisTime(dateStr, timeStr) {
  const d = dateStr.trim().match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/); const t = timeStr.trim().match(/^(\d{1,2})[h:](\d{2})?$/i);
  if (!d || !t) return null;
  let y = d[3] ? Number(d[3]) : new Date().getFullYear(); if (y < 100) y += 2000;
  const guess = Date.UTC(y, Number(d[2]) - 1, Number(d[1]), Number(t[1]), Number(t[2] || 0));
  const inParis = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
  const inUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  return guess - (inParis - inUtc);
}

// --- IA : aide le juge, ne décide jamais à sa place.
// Sans clé : IA gratuite de Pollinations (sans compte). Avec ANTHROPIC_API_KEY dans .env : Claude.
let ai = null;
export async function askAI(system, content) {
  if (!process.env.ANTHROPIC_API_KEY) {
    const r = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(120e3),
      body: JSON.stringify({ model: 'openai', messages: [{ role: 'system', content: system }, { role: 'user', content }] }),
    }).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    const txt = j?.choices?.[0]?.message?.content?.trim();
    if (!txt) throw new Error('L\'IA gratuite ne répond pas pour l\'instant, réessaie dans une minute.');
    return txt;
  }
  ai ??= new Anthropic();
  const r = await ai.beta.messages.create({
    model: 'claude-opus-5-5', max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'medium' },
    system, messages: [{ role: 'user', content }],
  });
  if (r.stop_reason === 'refusal') throw new Error('L\'IA a refusé de répondre sur ce contenu.');
  return r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}
export const AI_SYSTEM = `Tu es le greffier assistant du juge dans un procès pour rire organisé sur un serveur Discord francophone (jeu de rôle entre amis).
Tu es neutre. Tu ne rends jamais le verdict : c'est le juge et le vote du public qui décident.
Réponds en français simple, avec des titres courts et des puces, en moins de 3500 caractères. Pas de tableau.`;

async function dossier(guild, p) {
  const ch = guild.channels.cache.get(p.text);
  const msgs = ch ? [...(await ch.messages.fetch({ limit: 100 }).catch(() => new Map())).values()].reverse() : [];
  const name = async (id) => id ? (await guild.members.fetch(id).catch(() => null))?.displayName || id : 'personne';
  const roleOf = (id) => Object.entries(ROLE_NAMES).find(([k]) => p[k] === id)?.[1] || ((p.temoins || []).includes(id) ? 'Témoin' : 'Public');
  const lines = [];
  for (const m of msgs) {
    if (m.author.bot) continue;
    const txt = [m.content, ...[...m.attachments.values()].map(a => `[pièce jointe : ${a.name}]`)].filter(Boolean).join(' ');
    if (txt) lines.push(`${await name(m.author.id)} (${roleOf(m.author.id)}) : ${txt}`);
  }
  return [
    `Procès n°${p.n} — motif : ${p.motif}`,
    `Accusé : ${await name(p.accuse)} · Accusateur : ${await name(p.accusateur)} · Avocat de l'accusation : ${await name(p.avocatAccusation)} · Avocat de la défense : ${await name(p.avocatDefense)} · Juge : ${await name(p.juge)}`,
    '', 'PREUVES :', ...(p.preuves.length ? p.preuves.map(x => `Preuve n°${x.n} (déposée par ${x.byName}) : ${x.texte}${x.fichier ? ` [fichier : ${x.fichierNom}]` : ''}`) : ['Aucune']),
    '', 'DÉBATS DANS LE SALON :', ...(lines.length ? lines.slice(-150) : ['Aucun message']),
    p.vote?.ended ? `\nVOTE DU PUBLIC : ${p.vote.result}` : '',
  ].join('\n');
}

function card(p, guild) {
  const who = (id) => id ? `<@${id}>` : '—';
  return new EmbedBuilder().setColor(p.closed ? 0x2b2d31 : GOLD).setTitle(`⚖️ Procès n°${p.n} — ${p.motif}`)
    .setDescription([
      `**${ROLE_NAMES.accuse} :** ${who(p.accuse)}`,
      `**${ROLE_NAMES.accusateur} :** ${who(p.accusateur)}`,
      `**${ROLE_NAMES.avocatAccusation} :** ${who(p.avocatAccusation)}`,
      `**${ROLE_NAMES.avocatDefense} :** ${who(p.avocatDefense)}`,
      `**${ROLE_NAMES.juge} :** ${who(p.juge)}`,
      p.temoins?.length ? `**👁️ Témoins :** ${p.temoins.map(who).join(', ')}` : '',
      '', `📅 **Audience :** ${ts(p.start, 'F')} (${ts(p.start)})`,
      `🔊 **Vocal :** <#${p.voice}> · 💬 **Salon :** <#${p.text}>`,
      p.event ? `🎟️ [Voir l'événement](https://discord.com/events/${guild.id}/${p.event})` : '',
      '', p.closed ? `🔒 **Procès terminé** — verdict : **${p.verdict}**` : 'Seules les personnes désignées peuvent parler. Le public écoute, puis **vote** à la fin.',
    ].filter(x => x !== '').join('\n')).setFooter({ text: `Preuves : ${p.preuves.length}` });
}

// --- Permissions : tout le monde voit et écoute, seuls les participants parlent / écrivent
function perms(guild, p, locked = false) {
  const speak = [P.SendMessages, P.AttachFiles, P.EmbedLinks, P.Speak, P.Stream, P.UseVAD];
  const ow = [
    { id: guild.id, type: OverwriteType.Role, allow: [P.ViewChannel, P.ReadMessageHistory, P.Connect], deny: [P.SendMessages, P.CreatePublicThreads, P.CreatePrivateThreads, P.AddReactions, P.Speak, P.Stream, P.UseSoundboard] },
    { id: guild.client.user.id, type: OverwriteType.Member, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.Connect, P.ManageChannels, P.MuteMembers] },
  ];
  if (!locked) {
    for (const id of new Set(people(p))) ow.push({ id, type: OverwriteType.Member, allow: speak });
    ow.push({ id: p.juge, type: OverwriteType.Member, allow: [...speak, P.ManageMessages, P.MuteMembers, P.MoveMembers] });
  }
  return ow;
}
async function applyPerms(guild, p, locked = false) {
  for (const id of [p.text, p.voice]) { const c = guild.channels.cache.get(id); if (c) await c.permissionOverwrites.set(perms(guild, p, locked)).catch(() => {}); }
}

async function startHearing(guild, p, k) {
  if (p.started) return;
  p.started = true; saveP(k, p);
  const ev = p.event && await guild.scheduledEvents.fetch(p.event).catch(() => null);
  if (ev && ev.status === GuildScheduledEventStatus.Scheduled) await ev.setStatus(GuildScheduledEventStatus.Active).catch(() => {});
  const ch = guild.channels.cache.get(p.text);
  await ch?.send({ content: `🔔 ${people(p).map(id => `<@${id}>`).join(' ')}\n# ⚖️ L'audience est ouverte !\nRejoignez <#${p.voice}>. Le juge <@${p.juge}> mène les débats. Déposez vos preuves avec \`/proces preuve\`.`, allowedMentions: { users: people(p) } }).catch(() => {});
}

async function endVote(client, k) {
  const p = getP(k); if (!p?.vote || p.vote.ended) return;
  const guild = client.guilds.cache.get(p.guild); const ch = guild?.channels.cache.get(p.text);
  const vals = Object.values(p.vote.votes); const g = vals.filter(v => v === 'g').length; const n = vals.length - g;
  const pct = (x) => vals.length ? Math.round(x * 100 / vals.length) : 0;
  p.vote.ended = true; p.vote.result = `${g} coupable (${pct(g)} %) / ${n} non coupable (${pct(n)} %) sur ${vals.length} vote(s)`; saveP(k, p);
  const msg = ch && await ch.messages.fetch(p.vote.msg).catch(() => null);
  await msg?.edit({ components: [voteRow(k, true)] }).catch(() => {});
  await ch?.send({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🗳️ Résultat du vote du public')
    .setDescription(`🔴 **Coupable :** ${g} (${pct(g)} %)\n🟢 **Non coupable :** ${n} (${pct(n)} %)\n\nLe juge <@${p.juge}> va maintenant rendre son verdict avec \`/proces verdict\`.`)] }).catch(() => {});
}
const voteRow = (k, done) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`proces:vote:${k}:g`).setLabel('Coupable').setEmoji('🔴').setStyle(ButtonStyle.Danger).setDisabled(!!done),
  new ButtonBuilder().setCustomId(`proces:vote:${k}:i`).setLabel('Non coupable').setEmoji('🟢').setStyle(ButtonStyle.Success).setDisabled(!!done));

const sub = (b, name, desc, fn) => b.addSubcommand(s => { s.setName(name).setDescription(desc); fn?.(s); return s; });
const data = new SlashCommandBuilder().setName('proces').setDescription('⚖️ Système de procès').setDMPermission(false);
sub(data, 'creer', 'Créer un procès (owner)', s => s
  .addUserOption(o => o.setName('accuse').setDescription('La personne accusée').setRequired(true))
  .addUserOption(o => o.setName('accusateur').setDescription('Celui qui accuse').setRequired(true))
  .addUserOption(o => o.setName('juge').setDescription('Le juge').setRequired(true))
  .addStringOption(o => o.setName('motif').setDescription('De quoi est-il accusé ?').setRequired(true).setMaxLength(200))
  .addStringOption(o => o.setName('date').setDescription('Date de l\'audience (JJ/MM/AAAA)').setRequired(true))
  .addStringOption(o => o.setName('heure').setDescription('Heure (HH:MM, heure de Paris)').setRequired(true))
  .addUserOption(o => o.setName('avocat_accusation').setDescription('Avocat de l\'accusation (attaque)'))
  .addUserOption(o => o.setName('avocat_defense').setDescription('Avocat de la défense')));
sub(data, 'preuve', 'Déposer une preuve (participants)', s => s
  .addStringOption(o => o.setName('texte').setDescription('Explique la preuve').setRequired(true).setMaxLength(1500))
  .addAttachmentOption(o => o.setName('fichier').setDescription('Capture, vidéo, image…')));
sub(data, 'temoin', 'Ajouter un témoin qui peut parler (juge / owner)', s => s.addUserOption(o => o.setName('membre').setDescription('Le témoin').setRequired(true)));
sub(data, 'ouvrir', 'Ouvrir l\'audience maintenant (juge)');
sub(data, 'ia', 'Analyse du dossier par l\'IA pour aider le juge', s => s.addBooleanOption(o => o.setName('public').setDescription('Montrer l\'analyse à tout le monde (sinon toi seul)')));
sub(data, 'vote', 'Lancer le vote du public (juge)', s => s.addIntegerOption(o => o.setName('minutes').setDescription('Durée du vote').setMinValue(1).setMaxValue(1440)));
sub(data, 'verdict', 'Rendre le verdict et clore le procès (juge)', s => s
  .addStringOption(o => o.setName('decision').setDescription('Décision').setRequired(true).addChoices({ name: 'Coupable', value: 'Coupable' }, { name: 'Non coupable', value: 'Non coupable' }))
  .addStringOption(o => o.setName('sanction').setDescription('Appliquée auto si coupable (ex : mute 30 minutes, honte 2 jours, ban 1 jour, kick, warn)').setMaxLength(300)));
sub(data, 'infos', 'Voir la fiche du procès de ce salon');
sub(data, 'annuler', 'Annuler ce procès (owner)');
sub(data, 'installer', 'Créer / réparer la catégorie Tribunal et le bouton de demande (owner)');

// --- Sanction du verdict : « mute 30 minutes », « ban 2 jours », « kick », « warn »… appliquée automatiquement
const UNITS = [[/^(s|sec|secondes?)$/, 1e3], [/^(m|mn|mins?|minutes?)$/, 60e3], [/^(h|hr|heures?)$/, 3600e3], [/^(j|d|jours?|days?)$/, 86400e3], [/^(sem|semaines?|w|weeks?)$/, 604800e3], [/^mois$/, 2592000e3]];
export function readSanction(text) {
  const t = text.toLowerCase();
  const type = /\bban/.test(t) ? 'ban' : /(kick|expuls|exclu)/.test(t) ? 'kick' : /(mute|muet|timeout|silence|tg\b)/.test(t) ? 'mute' : /(warn|avert)/.test(t) ? 'warn' : /(honte|clown|🤡)/.test(t) ? 'honte' : null;
  let ms = 0;
  for (const m of t.matchAll(/(\d+)\s*([a-zé]+)/g)) { const u = UNITS.find(([re]) => re.test(m[2])); if (u) ms += Number(m[1]) * u[1]; }
  return type ? { type, ms, honte: /(honte|clown|🤡)/.test(t) } : null;
}
async function applySanction(guild, p, text, useAI) {
  let s = readSanction(text);
  if (!s && useAI) {
    const out = await askAI('Tu transformes une sanction écrite en français en JSON. Réponds UNIQUEMENT avec du JSON : {"type":"mute|ban|kick|warn|honte|aucune","minutes":nombre}. minutes = 0 si pas de durée.', text).catch(() => '');
    const j = JSON.parse(out.match(/\{[\s\S]*\}/)?.[0] || 'null');
    if (j && ['mute', 'ban', 'kick', 'warn', 'honte'].includes(j.type)) s = { type: j.type, ms: (Number(j.minutes) || 0) * 60e3, honte: j.type === 'honte' };
  }
  if (!s) return '⚠️ Sanction non appliquée automatiquement (pas comprise) : à faire à la main.';
  const member = await guild.members.fetch(p.accuse).catch(() => null);
  const user = member?.user || await guild.client.users.fetch(p.accuse).catch(() => null);
  const reason = `Tribunal — procès n°${p.n} : ${p.motif}`.slice(0, 450);
  const me = guild.client.user; const { fmtDuration } = await import('../util.js');
  // Honte : rôle 🤡 Honte pour la durée de la peine (1 jour par défaut) + affichage sur le mur de la honte
  let shame = '';
  if (s.honte) shame = await applyShame(guild, p, member, user, s.type === 'honte' ? s.ms : 0, fmtDuration);
  if (s.type === 'honte') return shame;
  try {
    if (s.type === 'mute') {
      const ms = Math.min(s.ms || 30 * 60e3, 28 * 86400e3);
      if (!member?.moderatable) throw new Error('rôle trop haut');
      await member.timeout(ms, reason); await member.voice?.disconnect('Mute du tribunal').catch(() => {});
      await modSanction(guild, { type: 'mute', user, mod: me, reason, duration: ms });
      return `🔇 **Appliqué :** mute ${fmtDuration(ms)} — il ne peut plus écrire ni parler en vocal.${shame ? '\n' + shame : ''}`;
    }
    if (s.type === 'ban') {
      if (member && !member.bannable) throw new Error('rôle trop haut');
      await guild.members.ban(p.accuse, { reason });
      if (s.ms) addTimer('unban', guild.id, Date.now() + s.ms, { user: p.accuse });
      await modSanction(guild, { type: s.ms ? 'tempban' : 'ban', user, mod: me, reason, duration: s.ms || null });
      return `🔨 **Appliqué :** ban ${s.ms ? fmtDuration(s.ms) : 'définitif'}.${shame ? '\n' + shame : ''}`;
    }
    if (s.type === 'kick') {
      if (!member?.kickable) throw new Error('rôle trop haut ou pas sur le serveur');
      await member.kick(reason); await modSanction(guild, { type: 'kick', user, mod: me, reason });
      return '👢 **Appliqué :** expulsé du serveur.';
    }
    await modSanction(guild, { type: 'warn', user, mod: me, reason });
    return '⚠️ **Appliqué :** avertissement ajouté à son historique.' + (shame ? '\n' + shame : '');
  } catch (e) { return `⚠️ Sanction impossible à appliquer (${e.message}).`; }
}

async function applyShame(guild, p, member, user, ms, fmtDuration) {
  const dur = ms || 86400e3;
  const role = guild.roles.cache.find(r => r.name === '🤡 Honte');
  if (!member) return '⚠️ Honte impossible : il n\'est plus sur le serveur.';
  if (role) {
    await member.roles.add(role, `Tribunal — procès n°${p.n}`).catch(() => {});
    addTimer('temprole', guild.id, Date.now() + dur, { user: member.id, role: role.id, action: 'add' });
  }
  const wall = guild.channels.cache.find(c => c.name === '🤡・mur-de-la-honte');
  await wall?.send({ content: `<@${member.id}>`, embeds: [new EmbedBuilder().setColor(0x8B5A2B).setTitle('🤡 Nouveau condamné à la honte !')
    .setThumbnail(user?.displayAvatarURL({ size: 256 }) || null)
    .setDescription(`**${member.displayName}** a été reconnu **coupable** par le Tribunal (procès n°${p.n}).\n**Motif :** ${p.motif}\n**Peine de honte :** ${fmtDuration(dur)} (fin ${ts(Date.now() + dur)})`)] }).catch(() => {});
  return `🤡 **Appliqué :** rôle 🤡 Honte pendant ${fmtDuration(dur)}${wall ? ` + affiché sur ${wall}` : ''}.`;
}
// --- Catégorie Tribunal permanente : salon public « demander un procès » + salon privé des demandes
const tribunalCat = (guild) => guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === '⚖️ TRIBUNAL');
async function getCat(guild) {
  return tribunalCat(guild) || guild.channels.create({ name: '⚖️ TRIBUNAL', type: ChannelType.GuildCategory });
}
const askRow = () => new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('proces:ask').setLabel('Demander un procès').setEmoji('⚖️').setStyle(ButtonStyle.Primary));
export async function setupTribunal(guild) {
  const cat = await getCat(guild); const me = guild.client.user.id;
  const find = (name) => guild.channels.cache.find(c => c.parentId === cat.id && c.name === name);
  let pub = find('📨・demander-un-procès');
  pub ??= await guild.channels.create({ name: '📨・demander-un-procès', type: ChannelType.GuildText, parent: cat.id, permissionOverwrites: [
    { id: guild.id, type: OverwriteType.Role, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions, P.CreatePublicThreads] },
    { id: me, type: OverwriteType.Member, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks] }] });
  let priv = find('📥・demandes-procès');
  priv ??= await guild.channels.create({ name: '📥・demandes-procès', type: ChannelType.GuildText, parent: cat.id, topic: 'Demandes de procès à accepter ou refuser (owner / admins)', permissionOverwrites: [
    { id: guild.id, type: OverwriteType.Role, deny: [P.ViewChannel] },
    { id: me, type: OverwriteType.Member, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks] },
    { id: guild.ownerId, type: OverwriteType.Member, allow: [P.ViewChannel, P.ReadMessageHistory] }] });
  const ev = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes('ÉVÉNEMENTS'));
  if (ev && cat.position !== ev.position + 1) await cat.setPosition(ev.position + 1).catch(() => {});
  const st = kvGet('tribunal', guild.id, {}) || {};
  const old = st.panel && await pub.messages.fetch(st.panel).catch(() => null);
  const e = new EmbedBuilder().setColor(GOLD).setTitle('⚖️ Le Tribunal de les100paspied'.replace('les100paspied', guild.name))
    .setDescription([
      'Quelqu\'un t\'a arnaqué, insulté, trahi en trade… ? **Demande un procès !**',
      '', '1️⃣ Clique sur **Demander un procès** et choisis la personne à accuser',
      '2️⃣ Explique ce qu\'il s\'est passé',
      '3️⃣ L\'owner **accepte ou refuse** ta demande',
      '4️⃣ Si c\'est accepté : un procès **public** est organisé avec un juge, des avocats, des preuves… et **le public vote** à la fin !',
      '', '🤖 Le juge est assisté par une IA qui analyse les preuves.',
      '⚠️ Les fausses accusations peuvent être sanctionnées.',
    ].join('\n'));
  if (old) await old.edit({ embeds: [e], components: [askRow()] }); else { const m = await pub.send({ embeds: [e], components: [askRow()] }); st.panel = m.id; }
  st.pub = pub.id; st.priv = priv.id; kvSet('tribunal', guild.id, st);
  return `Tribunal prêt : ${pub} (public) et ${priv} (demandes, visible par toi et les admins).`;
}

async function createTrial(guild, byId, o) {
  const cfg = getConfig(guild.id).proces;
  const n = (kvGet('procesCount', guild.id, 0) || 0) + 1; kvSet('procesCount', guild.id, n);
  const k = key(guild.id, n);
  const p = { n, guild: guild.id, motif: o.motif, start: o.start, by: byId, accuse: o.accuse, accusateur: o.accusateur, juge: o.juge,
    avocatAccusation: o.avocatAccusation || null, avocatDefense: o.avocatDefense || null, temoins: [], preuves: [], started: false, closed: false };
  const accused = await guild.members.fetch(p.accuse).catch(() => null);
  const accusedName = accused?.displayName || 'inconnu';
  const cat = await getCat(guild);
  const text = await guild.channels.create({ name: `⚖️・procès-${n}`, type: ChannelType.GuildText, parent: cat.id, topic: `Procès n°${n} : ${p.motif}`, permissionOverwrites: perms(guild, p) });
  const voice = await guild.channels.create({ name: `⚖️ Procès ${n} — ${accusedName}`.slice(0, 95), type: ChannelType.GuildVoice, parent: cat.id, permissionOverwrites: perms(guild, p) });
  p.text = text.id; p.voice = voice.id;
  const ev = await guild.scheduledEvents.create({
    name: `⚖️ Procès de ${accusedName}`.slice(0, 100), scheduledStartTime: new Date(p.start),
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly, entityType: GuildScheduledEventEntityType.Voice, channel: voice.id,
    description: `Motif : ${p.motif}\nAudience publique : venez écouter et votez à la fin !`.slice(0, 1000),
  }).catch(e => { console.error('Événement procès :', e.message); return null; });
  p.event = ev?.id || null;
  saveP(k, p);
  addTimer('proces.start', guild.id, p.start, { k });
  if (p.start - 30 * 60e3 > Date.now()) addTimer('proces.rappel', guild.id, p.start - 30 * 60e3, { k });
  const m = await text.send({ embeds: [card(p, guild)] }); await m.pin().catch(() => {});
  const ann = cfg.announceChannel && guild.channels.cache.get(cfg.announceChannel);
  if (ann) await ann.send({ content: `${cfg.pingRole ? `<@&${cfg.pingRole}> ` : ''}⚖️ **Un procès va avoir lieu !** Rendez-vous ${ts(p.start, 'F')}${p.event ? `\nhttps://discord.com/events/${guild.id}/${p.event}` : ''}`, embeds: [card(p, guild)], allowedMentions: { roles: cfg.pingRole ? [cfg.pingRole] : [] } }).catch(() => {});
  for (const id of new Set(people(p))) (await guild.client.users.fetch(id).catch(() => null))?.send(`⚖️ Tu participes au **procès n°${n}** sur **${guild.name}** (${p.motif}) le ${ts(p.start, 'F')}. Salon : ${text.url}`).catch(() => {});
  return `Procès n°${n} créé : ${text} · ${voice}${p.event ? ' · événement public créé 🎟️' : ' (⚠️ événement non créé)'}`;
}

// --- Demandes de procès (membres) -> acceptées / refusées par l'owner
const getReq = (id) => kvGet('procesDemande', id);
const saveReq = (id, r) => kvSet('procesDemande', id, r);
function reqEmbed(r) {
  const color = r.status === 'acceptée' ? COLORS.ok : r.status === 'refusée' ? COLORS.err : GOLD;
  return new EmbedBuilder().setColor(color).setTitle(`📨 Demande de procès — ${r.status}`)
    .setDescription([`**Accusateur :** <@${r.by}>`, `**Accusé :** <@${r.accuse}>`, `**Motif :** ${r.motif}`, '', r.details,
      r.reason ? `\n**Raison du refus :** ${r.reason}` : '', r.trial ? `\n✅ ${r.trial}` : ''].filter(Boolean).join('\n').slice(0, 4000))
    .setTimestamp(r.at);
}
const reqRow = (id, done) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`proces:acc:${id}`).setLabel('Accepter').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!!done),
  new ButtonBuilder().setCustomId(`proces:ref:${id}`).setLabel('Refuser').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(!!done));
function pickMessage(id, r) {
  const sel = (what, ph) => new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`proces:pick:${id}:${what}`).setPlaceholder(ph).setMinValues(0).setMaxValues(1)
    .setDefaultUsers(r.picks?.[what] ? [r.picks[what]] : []));
  return {
    content: `⚖️ **Organiser le procès de <@${r.accuse}>**\nChoisis le juge (obligatoire) et les avocats (optionnel), puis clique sur **Date et heure**.`,
    components: [sel('juge', '⚖️ Choisis le juge'), sel('avocatAccusation', '⚔️ Avocat de l\'accusation (optionnel)'), sel('avocatDefense', '🛡️ Avocat de la défense (optionnel)'),
      new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`proces:date:${id}`).setLabel('Date et heure').setEmoji('📅').setStyle(ButtonStyle.Primary))],
    flags: MessageFlags.Ephemeral,
  };
}
async function handleRequest(i, action, a, b) {
  const g = i.guild;
  if (action === 'ask') {
    return i.reply({ content: '👤 **Qui veux-tu accuser ?**', components: [new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder().setCustomId('proces:askuser').setPlaceholder('Choisis la personne').setMinValues(1).setMaxValues(1))], flags: MessageFlags.Ephemeral });
  }
  if (action === 'askuser') {
    const target = i.values[0];
    if (target === i.user.id) return i.reply({ content: '❌ Tu ne peux pas t\'accuser toi-même 😅', flags: MessageFlags.Ephemeral });
    if ((await g.members.fetch(target).catch(() => null))?.user.bot) return i.reply({ content: '❌ On ne fait pas de procès aux bots 🤖', flags: MessageFlags.Ephemeral });
    return i.showModal(new ModalBuilder().setCustomId(`proces:askmodal:${target}`).setTitle('Demande de procès').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motif').setLabel('De quoi l\'accuses-tu ? (court)').setStyle(TextInputStyle.Short).setMaxLength(150).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Explique ce qu\'il s\'est passé + tes preuves').setStyle(TextInputStyle.Paragraph).setMaxLength(1500).setRequired(true))));
  }
  if (action === 'askmodal') {
    const st = kvGet('tribunal', g.id, {}) || {};
    const priv = st.priv && g.channels.cache.get(st.priv);
    if (!priv) return i.reply({ content: '❌ Le tribunal n\'est pas installé (l\'owner doit faire `/proces installer`).', flags: MessageFlags.Ephemeral });
    const id = `${g.id}-${Date.now().toString(36)}`;
    const r = { guild: g.id, by: i.user.id, accuse: a, motif: i.fields.getTextInputValue('motif'), details: i.fields.getTextInputValue('details'), status: 'en attente', at: Date.now() };
    const m = await priv.send({ content: `<@${g.ownerId}> nouvelle demande de procès !`, embeds: [reqEmbed(r)], components: [reqRow(id)] });
    r.msg = m.id; saveReq(id, r);
    return i.reply({ content: '✅ Ta demande de procès a été envoyée à l\'owner. Tu recevras un message privé avec sa réponse.', flags: MessageFlags.Ephemeral });
  }
  // À partir d'ici : réservé à l'owner / admins
  const r = getReq(a);
  if (!r) return i.reply({ content: '❌ Demande introuvable.', flags: MessageFlags.Ephemeral });
  if (!isOwner(i)) return i.reply({ content: '❌ Seul l\'owner peut traiter les demandes.', flags: MessageFlags.Ephemeral });
  const updateMsg = async () => { const ch = g.channels.cache.get(kvGet('tribunal', g.id, {})?.priv); const m = ch && await ch.messages.fetch(r.msg).catch(() => null); await m?.edit({ embeds: [reqEmbed(r)], components: [reqRow(a, r.status !== 'en attente')] }).catch(() => {}); };
  if (r.status !== 'en attente') return i.reply({ content: `Cette demande est déjà ${r.status}.`, flags: MessageFlags.Ephemeral });
  if (action === 'ref') {
    return i.showModal(new ModalBuilder().setCustomId(`proces:refmodal:${a}`).setTitle('Refuser la demande').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reason').setLabel('Pourquoi ? (envoyé à l\'accusateur)').setStyle(TextInputStyle.Paragraph).setMaxLength(500).setRequired(false))));
  }
  if (action === 'refmodal') {
    r.status = 'refusée'; r.reason = i.fields.getTextInputValue('reason') || 'Aucune raison donnée.'; saveReq(a, r); await updateMsg();
    (await i.client.users.fetch(r.by).catch(() => null))?.send(`❌ Ta demande de procès contre <@${r.accuse}> sur **${g.name}** a été refusée.\nRaison : ${r.reason}`).catch(() => {});
    return i.reply({ content: '❌ Demande refusée, l\'accusateur est prévenu.', flags: MessageFlags.Ephemeral });
  }
  if (action === 'acc') return i.reply(pickMessage(a, r));
  if (action === 'pick') {
    r.picks = { ...(r.picks || {}), [b]: i.values[0] || null }; saveReq(a, r);
    return i.deferUpdate();
  }
  if (action === 'date') {
    if (!r.picks?.juge) return i.reply({ content: '❌ Choisis d\'abord le juge dans la liste.', flags: MessageFlags.Ephemeral });
    return i.showModal(new ModalBuilder().setCustomId(`proces:datemodal:${a}`).setTitle('Date de l\'audience').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setPlaceholder('15/11/2026').setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('heure').setLabel('Heure (HH:MM, heure de Paris)').setStyle(TextInputStyle.Short).setPlaceholder('21:00').setRequired(true))));
  }
  if (action === 'datemodal') {
    const start = parisTime(i.fields.getTextInputValue('date'), i.fields.getTextInputValue('heure'));
    if (!start || start < Date.now() + 60e3) return i.reply({ content: '❌ Date ou heure invalide, ou dans le passé. Exemple : `15/11/2026` et `21:00`.', flags: MessageFlags.Ephemeral });
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const res = await createTrial(g, i.user.id, { motif: r.motif, start, accuse: r.accuse, accusateur: r.by, juge: r.picks.juge, avocatAccusation: r.picks.avocatAccusation, avocatDefense: r.picks.avocatDefense });
    r.status = 'acceptée'; r.trial = res; saveReq(a, r); await updateMsg();
    const n = kvGet('procesCount', g.id); const p = getP(key(g.id, n));
    if (p) { const ch = g.channels.cache.get(p.text); await ch?.send({ embeds: [new EmbedBuilder().setColor(COLORS.info).setTitle('📨 Plainte de l\'accusateur').setDescription(`**${r.motif}**\n\n${r.details}`.slice(0, 4000))] }).catch(() => {}); }
    return i.editReply(ok(res));
  }
}

export const commands = [{
  module: 'proces', data,
  async run(i) {
    const s = i.options.getSubcommand(); const cfg = getConfig(i.guildId).proces;

    if (s === 'creer') {
      if (!isOwner(i)) return i.reply(err('Seul l\'owner peut créer un procès.'));
      const start = parisTime(i.options.getString('date'), i.options.getString('heure'));
      if (!start) return i.reply(err('Date ou heure invalide. Exemple : date `15/11/2026`, heure `21:00`.'));
      if (start < Date.now() + 60e3) return i.reply(err('La date doit être dans le futur.'));
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      const r = await createTrial(i.guild, i.user.id, { motif: i.options.getString('motif'), start,
        accuse: i.options.getUser('accuse').id, accusateur: i.options.getUser('accusateur').id, juge: i.options.getUser('juge').id,
        avocatAccusation: i.options.getUser('avocat_accusation')?.id || null, avocatDefense: i.options.getUser('avocat_defense')?.id || null });
      return i.editReply(ok(r));
    }
    if (s === 'installer') {
      if (!isOwner(i)) return i.reply(err('Réservé à l\'owner.'));
      await i.deferReply({ flags: MessageFlags.Ephemeral });
      return i.editReply(ok(await setupTribunal(i.guild)));
    }

    const p = byChannel(i.channelId);
    if (!p) return i.reply(err('Utilise cette commande dans le salon du procès (catégorie ⚖️ TRIBUNAL).'));
    const k = key(p.guild, p.n);
    const isJudge = i.user.id === p.juge || isOwner(i);
    if (s === 'infos') return i.reply({ embeds: [card(p, i.guild)], flags: MessageFlags.Ephemeral });
    if (p.closed) return i.reply(err('Ce procès est terminé.'));

    if (s === 'preuve') {
      if (!people(p).includes(i.user.id)) return i.reply(err('Seules les personnes du procès peuvent déposer une preuve.'));
      const f = i.options.getAttachment('fichier');
      const pr = { n: p.preuves.length + 1, by: i.user.id, byName: i.member.displayName, texte: i.options.getString('texte'), fichier: f?.url || null, fichierNom: f?.name || null, at: Date.now() };
      p.preuves.push(pr); saveP(k, p);
      const e = new EmbedBuilder().setColor(COLORS.info).setTitle(`📎 Preuve n°${pr.n}`).setDescription(pr.texte).setFooter({ text: `Déposée par ${pr.byName}` }).setTimestamp();
      if (f?.contentType?.startsWith('image/')) e.setImage(f.url); else if (f) e.addFields({ name: 'Fichier', value: `[${f.name}](${f.url})` });
      return i.reply({ embeds: [e] });
    }
    if (s === 'temoin') {
      if (!isJudge) return i.reply(err('Seul le juge ou l\'owner peut ajouter un témoin.'));
      const u = i.options.getUser('membre'); if (!p.temoins.includes(u.id)) p.temoins.push(u.id); saveP(k, p);
      await applyPerms(i.guild, p);
      return i.reply(ok(`👁️ ${u} est appelé à la barre comme témoin : il peut maintenant parler.`));
    }
    if (s === 'ouvrir') {
      if (!isJudge) return i.reply(err('Seul le juge peut ouvrir l\'audience.'));
      await i.reply(ok('Audience ouverte.')); return startHearing(i.guild, p, k);
    }
    if (s === 'ia') {
      if (!isJudge) return i.reply(err('L\'analyse IA est réservée au juge.'));
      if (!cfg.aiEnabled) return i.reply(err('L\'IA est désactivée dans le panel (module Procès).'));
      const pub = i.options.getBoolean('public');
      await i.deferReply(pub ? {} : { flags: MessageFlags.Ephemeral });
      try {
        const txt = await askAI(AI_SYSTEM, `Voici le dossier.\n\n${await dossier(i.guild, p)}\n\nFais pour le juge : 1) un résumé de l'accusation, 2) un résumé de la défense, 3) l'analyse de chaque preuve (solide ou faible, et pourquoi), 4) les contradictions repérées, 5) 3 questions que le juge devrait poser. Ne donne pas de verdict.`);
        return i.editReply({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle(`🤖 Analyse du greffier IA — procès n°${p.n}`).setDescription(txt.slice(0, 4000)).setFooter({ text: 'L\'IA aide le juge mais ne décide pas.' })] });
      } catch (e) { return i.editReply(err(e.message)); }
    }
    if (s === 'vote') {
      if (!isJudge) return i.reply(err('Seul le juge peut lancer le vote.'));
      if (p.vote && !p.vote.ended) return i.reply(err('Un vote est déjà en cours.'));
      const min = i.options.getInteger('minutes') || cfg.voteMinutes || 10; const end = Date.now() + min * 60e3;
      await i.reply({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🗳️ Le public vote !')
        .setDescription(`Après avoir écouté les débats et vu les **${p.preuves.length} preuve(s)**, l'accusé <@${p.accuse}> est-il coupable ?\n\nFin du vote ${ts(end)}. Un seul vote par personne (tu peux changer d'avis).\n*Les personnes du procès ne votent pas.*`)], components: [voteRow(k)] });
      const msg = await i.fetchReply();
      p.vote = { msg: msg.id, end, votes: {}, ended: false }; saveP(k, p);
      addTimer('proces.vote', i.guildId, end, { k });
      return;
    }
    if (s === 'verdict') {
      if (!isJudge) return i.reply(err('Seul le juge rend le verdict.'));
      if (p.vote && !p.vote.ended) await endVote(i.client, k);
      await i.deferReply();
      const q = getP(k); const decision = i.options.getString('decision');
      let sanction = i.options.getString('sanction');
      // Coupable + sanction citée -> le bot l'applique tout seul (l'IA aide à la comprendre si besoin)
      if (decision === 'Coupable' && sanction) {
        const res = await applySanction(i.guild, q, sanction, cfg.aiEnabled);
        sanction = `${sanction}\n${res}`;
      }
      let motivation = '';
      if (cfg.aiEnabled) {
        motivation = await askAI(AI_SYSTEM, `Voici le dossier.\n\n${await dossier(i.guild, q)}\n\nLe juge a décidé : ${decision}${sanction ? `, sanction : ${sanction}` : ''}. Rédige la motivation officielle du jugement, solennelle et un peu drôle, en 8 lignes maximum, qui s'appuie sur les preuves et le vote du public. N'invente aucun fait.`).catch(() => '');
      }
      q.closed = true; q.verdict = decision + (sanction ? ` — ${sanction}` : ''); saveP(k, q);
      const e = new EmbedBuilder().setColor(decision === 'Coupable' ? COLORS.err : COLORS.ok).setTitle(`🔨 VERDICT — procès n°${q.n}`)
        .setDescription([`L'accusé <@${q.accuse}> est déclaré **${decision.toUpperCase()}**.`, sanction ? `**Sanction :** ${sanction}` : '', q.vote?.result ? `🗳️ Vote du public : ${q.vote.result}` : '', motivation ? `\n**Motivation :**\n${motivation}` : ''].filter(Boolean).join('\n').slice(0, 4000))
        .setFooter({ text: `Rendu par le juge ${i.member.displayName}` }).setTimestamp();
      await i.editReply({ content: `${[q.accuse, q.accusateur].map(id => `<@${id}>`).join(' ')}`, embeds: [e] });
      const ann = cfg.announceChannel && i.guild.channels.cache.get(cfg.announceChannel);
      if (ann && ann.id !== i.channelId) await ann.send({ embeds: [e] }).catch(() => {});
      await applyPerms(i.guild, q, true);
      const ev = q.event && await i.guild.scheduledEvents.fetch(q.event).catch(() => null);
      if (ev?.status === GuildScheduledEventStatus.Active) await ev.setStatus(GuildScheduledEventStatus.Completed).catch(() => {});
      else if (ev) await ev.delete().catch(() => {});
      return;
    }
    if (s === 'annuler') {
      if (!isOwner(i)) return i.reply(err('Seul l\'owner peut annuler un procès.'));
      p.closed = true; p.verdict = 'Annulé'; saveP(k, p);
      const ev = p.event && await i.guild.scheduledEvents.fetch(p.event).catch(() => null);
      if (ev) await (ev.status === GuildScheduledEventStatus.Active ? ev.setStatus(GuildScheduledEventStatus.Completed) : ev.delete()).catch(() => {});
      await applyPerms(i.guild, p, true);
      return i.reply(ok('Procès annulé. Les salons sont verrouillés (tu peux les supprimer à la main).'));
    }
  },
}];

export function register(client) {
  client.timerHandlers.set('proces.start', async (t) => {
    const p = getP(t.data.k); if (!p || p.closed) return;
    const g = client.guilds.cache.get(p.guild); if (g) await startHearing(g, p, t.data.k);
  });
  client.timerHandlers.set('proces.rappel', async (t) => {
    const p = getP(t.data.k); if (!p || p.closed || p.started) return;
    const ch = client.guilds.cache.get(p.guild)?.channels.cache.get(p.text);
    await ch?.send({ content: `⏰ ${people(p).map(id => `<@${id}>`).join(' ')} l'audience commence ${ts(p.start)} ! Préparez vos preuves.`, allowedMentions: { users: people(p) } }).catch(() => {});
  });
  client.timerHandlers.set('proces.vote', (t) => endVote(client, t.data.k));
  client.panelActions.set('proces.setupTribunal', (g) => setupTribunal(g));
  client.components.set('proces', async (i, action, gid, n, choice) => {
    if (action !== 'vote') return handleRequest(i, action, gid, n);
    const k = key(gid, n); const p = getP(k);
    if (!p?.vote || p.vote.ended || p.vote.msg !== i.message.id) return i.reply({ content: 'Ce vote est terminé.', flags: MessageFlags.Ephemeral });
    if (people(p).includes(i.user.id)) return i.reply({ content: '❌ Les personnes du procès ne votent pas.', flags: MessageFlags.Ephemeral });
    p.vote.votes[i.user.id] = choice; saveP(k, p);
    i.reply({ content: `🗳️ Vote enregistré : **${choice === 'g' ? 'Coupable' : 'Non coupable'}** (reclique sur l'autre bouton pour changer).`, flags: MessageFlags.Ephemeral });
  });
}
