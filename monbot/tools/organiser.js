// Réorganise le serveur : nouveaux rôles, catégories, salons, réglages du bot.
// Garde les anciens salons (et leurs messages). Peut être relancé sans créer de doublons.
import { REST, Routes, PermissionFlagsBits as P, ChannelType } from 'discord.js';

const GID = process.argv[2];
if (!GID) { console.log('Usage : node --env-file=.env tools/organiser.js <id du serveur>'); process.exit(1); }
const rest = new REST().setToken(process.env.DISCORD_TOKEN);
const bits = (...l) => l.reduce((a, b) => a | b, 0n).toString();
const log = (...a) => console.log('•', ...a);

// ---------- 1. Rôles ----------
const ROLES = [
  { name: '👑 Owner', color: 0xE74C3C, hoist: true, perms: bits(P.Administrator), from: ['Owner'] },
  { name: '🛡️ Admin', color: 0xE67E22, hoist: true, perms: bits(P.Administrator), from: ['CHEF!'] },
  { name: '🔨 Modo', color: 0x2ECC71, hoist: true, from: ['Modo'],
    perms: bits(P.KickMembers, P.BanMembers, P.ModerateMembers, P.ManageMessages, P.ManageNicknames, P.ManageThreads,
      P.MuteMembers, P.DeafenMembers, P.MoveMembers, P.ViewAuditLog, P.MentionEveryone) },
  { name: '🎧 Support', color: 0x3498DB, hoist: true, perms: bits(P.ManageMessages, P.MoveMembers) },
  { name: '💎 Premium', color: 0xF1C40F, hoist: true, perms: bits(P.UseExternalStickers, P.ChangeNickname) },
  { name: '🤡 Honte', color: 0x8B5A2B, hoist: true, perms: '0' },
  { name: '💠 Niveau 50', color: 0x00D2FF, hoist: true, perms: '0' },
  { name: '🏆 Niveau 30', color: 0xE91E63, hoist: true, perms: '0' },
  { name: '🥇 Niveau 20', color: 0xFFD700, hoist: true, perms: '0' },
  { name: '🥈 Niveau 10', color: 0xC0C0C0, hoist: true, perms: '0' },
  { name: '🥉 Niveau 5', color: 0xCD7F32, hoist: false, perms: '0' },
  { name: '🎮 Membre', color: 0x95A5A6, hoist: true, perms: bits(P.ViewChannel), everyone: true }, // vérifié par le captcha : voit les salons
  { name: '🤖 Bots', color: 0x7289DA, hoist: false, perms: bits(P.ViewChannel), bots: true },
  { name: '💜 Soutien', color: 0xA855F7, hoist: false, perms: '0' },
  { name: '🔔 Annonces', color: 0, perms: '0', mentionable: true },
  { name: '🎉 Giveaways', color: 0, perms: '0', mentionable: true },
  { name: '🎣 Fisch', color: 0x1ABC9C, perms: '0', mentionable: true },
  { name: '🧠 SAB', color: 0x9B59B6, perms: '0', mentionable: true },
  { name: '📺 Lives', color: 0x9146FF, perms: '0', mentionable: true },
  { name: '🎯 Valorant', color: 0xFF4655, perms: '0', mentionable: true },
  { name: '⛏️ Minecraft', color: 0x62B47A, perms: '0', mentionable: true },
  { name: '🟥 Roblox', color: 0xE2231A, perms: '0', mentionable: true },
  { name: '🔫 Fortnite', color: 0x9D4DBB, perms: '0', mentionable: true },
  { name: '🎂 Anniversaire', color: 0xFF69B4, hoist: true, perms: '0' },
];
const OLD_ROLES = ['Modo', 'LES MAGREBINS', 'CHEF!', 'Owner', 'Ben Laden', 'Le CAVUUUUUUUUUU a KELLLLYYYYYYY'];

let roles = await rest.get(Routes.guildRoles(GID));
const me = await rest.get(Routes.user('@me'));
const botRole = roles.find(r => r.managed && r.tags?.bot_id === me.id);
const R = {};
for (const def of ROLES) {
  let r = roles.find(x => x.name === def.name);
  const body = { name: def.name, color: def.color, hoist: !!def.hoist, permissions: def.perms, mentionable: !!def.mentionable };
  if (r) r = await rest.patch(Routes.guildRole(GID, r.id), { body });
  else { r = await rest.post(Routes.guildRoles(GID), { body }); log('rôle créé :', def.name); }
  R[def.name] = r.id;
}
// Ordre : bot tout en haut, puis la liste dans l'ordre
const top = botRole.position;
await rest.patch(Routes.guildRoles(GID), { body: ROLES.map((d, i) => ({ id: R[d.name], position: top - 1 - i })) });
log('ordre des rôles réglé');

// @everyone : permissions de base sûres. Pas « voir les salons » : il faut passer le captcha (rôle 🎮 Membre)
await rest.patch(Routes.guildRole(GID, GID), { body: { permissions: bits(
  P.SendMessages, P.ReadMessageHistory, P.AddReactions, P.EmbedLinks, P.AttachFiles, P.UseExternalEmojis,
  P.UseApplicationCommands, P.CreatePublicThreads, P.SendMessagesInThreads, P.Connect, P.Speak, P.Stream, P.UseVAD,
  P.CreateInstantInvite, P.ChangeNickname, P.UseSoundboard, P.SendVoiceMessages) } });

// ---------- 2. Donner les rôles ----------
const oldIds = Object.fromEntries(roles.filter(r => OLD_ROLES.includes(r.name)).map(r => [r.name, r.id]));
const members = await rest.get(Routes.guildMembers(GID), { query: new URLSearchParams({ limit: '1000' }) });
let given = 0;
for (const m of members) {
  const want = [];
  if (m.user.bot) { if (m.user.id !== me.id) want.push(R['🤖 Bots']); }
  else want.push(R['🎮 Membre']);
  for (const def of ROLES) for (const old of def.from || []) if (oldIds[old] && m.roles.includes(oldIds[old])) want.push(R[def.name]);
  for (const id of want) if (!m.roles.includes(id)) { await rest.put(Routes.guildMemberRole(GID, m.user.id, id)); given++; }
}
log(`${given} rôles donnés à ${members.length} membres`);

// Supprimer les anciens rôles
for (const [name, id] of Object.entries(oldIds)) {
  try { await rest.delete(Routes.guildRole(GID, id)); log('ancien rôle supprimé :', name); }
  catch (e) { log('impossible de supprimer', name, ':', e.message); }
}

// ---------- 3. Catégories et salons ----------
const STAFF = [R['👑 Owner'], R['🛡️ Admin'], R['🔨 Modo'], R['🎧 Support']];
const allow = (id, ...p) => ({ id, type: 0, allow: bits(...p), deny: '0' });
const deny = (id, ...p) => ({ id, type: 0, allow: '0', deny: bits(...p) });
const staffAllow = (...p) => STAFF.map(id => allow(id, ...p));
const OW = {
  readOnly: [deny(GID, P.SendMessages, P.CreatePublicThreads, P.AddReactions), ...staffAllow(P.SendMessages), allow(me.id, P.SendMessages, P.ViewChannel)],
  publicRead: [{ id: GID, type: 0, allow: bits(P.ViewChannel, P.ReadMessageHistory), deny: bits(P.SendMessages, P.CreatePublicThreads, P.AddReactions) }, ...staffAllow(P.SendMessages), allow(me.id, P.SendMessages, P.ViewChannel)],
  verif: [{ id: GID, type: 0, allow: bits(P.ViewChannel, P.ReadMessageHistory), deny: bits(P.SendMessages, P.CreatePublicThreads, P.AddReactions) }, deny(R['🎮 Membre'], P.ViewChannel), allow(me.id, P.SendMessages, P.ViewChannel, P.EmbedLinks)],
  readOnlyReact: [deny(GID, P.SendMessages, P.CreatePublicThreads), ...staffAllow(P.SendMessages), allow(me.id, P.SendMessages, P.ViewChannel)],
  premium: [deny(GID, P.ViewChannel), allow(R['💎 Premium'], P.ViewChannel), ...staffAllow(P.ViewChannel), allow(me.id, P.ViewChannel)],
  staff: [deny(GID, P.ViewChannel), ...staffAllow(P.ViewChannel), allow(me.id, P.ViewChannel)],
  staffNoSupport: [deny(GID, P.ViewChannel), ...[R['👑 Owner'], R['🛡️ Admin'], R['🔨 Modo']].map(id => allow(id, P.ViewChannel)), allow(me.id, P.ViewChannel)],
};
// T = texte, V = vocal. old = noms actuels à récupérer. ow = permissions (sinon on garde celles du salon)
const PLAN = [
  { cat: '📌 INFORMATIONS', ow: 'readOnly', ch: [
    { T: '✅・vérification', ow: 'verif' }, { T: '📜・règlement', ow: 'publicRead' }, { T: '📢・annonces' }, { T: '👋・arrivées', old: '👋・bienvenue' }, { T: '🚪・départs' }, { T: '🔨・sanctions' }, { T: '🎭・rôles' }, { T: '🔴・lives-twitch' }, { T: '📨・invitations' }, { T: '📚・commandes-du-bot' }] },
  { cat: '💬 GÉNÉRAL', old: 'Salons textuels', ch: [
    { T: '💬・général', old: 'général' }, { T: '📸・médias' }, { T: '😂・memes' }, { T: '🤖・commandes' }, { T: '💡・suggestions' }, { T: '🎂・anniversaires' }] },
  { cat: '🎣 FISCH', old: 'Fisch', ch: [
    { T: '🔄・trade-fisch', old: 'trade-fisch' }, { T: '❓・help-fisch', old: 'help-fish' }, { T: '🔎・leaks-fisch-sab', old: 'leak-sab-et-fish' }] },
  { cat: '🧠 STEAL A BRAINROT', ch: [
    { T: '🧠・sab', old: 'sab' }, { T: '🔄・trade-sab' }] },
  { cat: '🏆 ÉVÉNEMENTS', ch: [
    { T: '🎉・giveaways', old: 'giveway', ow: 'readOnlyReact' }, { T: '🏆・tournoi', old: 'tournoi' }, { T: '📅・tournoi-dimanche', old: 'tournoi-dimanche' }] },
  { cat: '🎮 JEUX & FUN', ch: [
    { T: '🎮・mini-jeux' }, { T: '🕹️・autres-jeux' }, { T: '🎵・musique' }, { T: '♾️・route-de-l-infini' }, { T: '🔥・flamme' }, { T: '💰・casino' }, { T: '📈・niveaux', ow: 'readOnly' }, { T: '⭐・starboard', ow: 'readOnly' }, { T: '📊・sondages', ow: 'readOnly' }] },
  { cat: '⚖️ TRIBUNAL', ch: [{ T: '🤡・mur-de-la-honte', ow: 'readOnlyReact' }] },
  { cat: '💎 PREMIUM', ow: 'premium', ch: [
    { T: '💎・chat-premium' }, { V: '💎 Premium' }] },
  { cat: '🎫 SUPPORT', ch: [
    { T: '🎫・ouvrir-un-ticket', ow: 'readOnly' }] },
  { cat: '🔊 VOCAUX', old: 'Salons vocaux', ch: [
    { V: '🔊 Général', old: 'Général' }, { V: '🎣 Fish', old: 'fish' }, { V: '🔊 Vocal 2', old: '2' }, { V: '🧠 Réflexion', old: 'voc-de-réflexion' },
    { V: 'tu-rej-t-ban-et-pd', old: 'tu-rej-t-ban-et-pd' }, { V: '➕ Crée ton salon', tempvoice: true }, { V: '💤 AFK', afk: true }] },
  { cat: '🛡️ STAFF', ow: 'staff', ch: [
    { T: '🛡️・staff-chat' }, { T: '📋・logs', ow: 'staffNoSupport' }, { V: '🛡️ Staff' }] },
];

let chans = await rest.get(Routes.guildChannels(GID));
const isCat = c => c.type === ChannelType.GuildCategory;
const find = (name, type) => chans.find(c => c.name === name && (type === undefined || c.type === type));
const C = {}; const positions = []; const fresh = new Set();
let catPos = 0;
for (const block of PLAN) {
  let cat = find(block.cat, 4) || (block.old && find(block.old, 4));
  const catOw = block.ow ? OW[block.ow] : undefined;
  if (cat) cat = await rest.patch(Routes.channel(cat.id), { body: { name: block.cat, ...(catOw && { permission_overwrites: catOw }) } });
  else { cat = await rest.post(Routes.guildChannels(GID), { body: { name: block.cat, type: 4, ...(catOw && { permission_overwrites: catOw }) } }); log('catégorie créée :', block.cat); }
  C[block.cat] = cat.id;
  positions.push({ id: cat.id, position: catPos++ });
  let pos = 0;
  for (const it of block.ch) {
    const name = it.T || it.V; const type = it.T ? 0 : 2;
    let c = find(name, type) || (it.old && find(it.old, type));
    const ow = it.ow ? OW[it.ow] : catOw;
    if (c) c = await rest.patch(Routes.channel(c.id), { body: { name, parent_id: cat.id, ...(ow && { permission_overwrites: ow }) } });
    else { c = await rest.post(Routes.guildChannels(GID), { body: { name, type, parent_id: cat.id, ...(ow && { permission_overwrites: ow }) } }); fresh.add(name); log('salon créé :', name); }
    C[name] = c.id;
    positions.push({ id: c.id, position: pos++ });
  }
}
await rest.patch(Routes.guildChannels(GID), { body: positions });
await rest.patch(Routes.guild(GID), { body: { afk_channel_id: C['💤 AFK'], afk_timeout: 900 } });
log('salons rangés');

// ---------- 4. Messages d'info ----------
const send = (name, body) => rest.post(Routes.channelMessages(C[name]), { body });
const empty = async name => (await rest.get(Routes.channelMessages(C[name]), { query: new URLSearchParams({ limit: '1' }) })).length === 0;
if (await empty('📜・règlement')) await send('📜・règlement', { embeds: [{ color: 0x5865F2, title: '📜 Règlement de les100paspied', description: [
  '**1.** Respecte tout le monde : pas d\'insultes, de racisme, d\'homophobie ni de harcèlement.',
  '**2.** Pas de spam, de flood ni de MAJUSCULES à répétition.',
  '**3.** Pas de pub (serveurs, chaînes…) sans l\'accord du staff.',
  '**4.** Pas de contenu choquant ou NSFW.',
  '**5.** Trades : pas d\'arnaque. Une arnaque prouvée = ban.',
  '**6.** Utilise le bon salon (Fisch, SAB, commandes…).',
  '**7.** Écoute le staff. Un souci ? Ouvre un ticket dans <#' + C['🎫・ouvrir-un-ticket'] + '>.',
  '',
  'En restant sur le serveur, tu acceptes ce règlement. Bon jeu ! 🎣🧠',
].join('\n') }] });
if (await empty('💎・chat-premium')) await send('💎・chat-premium', { content: '💎 Bienvenue dans l\'espace **Premium** ! Merci de soutenir le serveur.' });

// ---------- 5. Réglages du bot (via l'API du panel) ----------
const api = async (method, path, body) => {
  const r = await fetch(`http://localhost:${process.env.API_PORT || 3000}/api/guilds/${GID}/${path}`, {
    method, headers: { 'x-panel-key': process.env.PANEL_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) log('⚠️', path, j.error || r.status); return j;
};
const before = await (await fetch(`http://localhost:${process.env.API_PORT || 3000}/api/guilds/${GID}`, { headers: { 'x-panel-key': process.env.PANEL_KEY } })).json();
const staff3 = [R['👑 Owner'], R['🛡️ Admin'], R['🔨 Modo']];
await api('PUT', 'modules/moderation', { logChannel: C['🔨・sanctions'], staffRoles: staff3 });
await api('PUT', 'modules/welcome', { enabled: true, channel: C['👋・arrivées'], autoroles: [], botRoles: [R['🤖 Bots']],
  message: 'Bienvenue {mention} sur **{server}** ! Nous sommes maintenant **{count}** 🎉\nLis le <#' + C['📜・règlement'] + '> et prends tes rôles dans <#' + C['🎭・rôles'] + '> !',
  goodbyeEnabled: true, goodbyeChannel: C['🚪・départs'] });
await api('PUT', 'modules/logs', { enabled: true, channel: C['📋・logs'] });
await api('PUT', 'modules/tickets', { enabled: true, panelChannel: C['🎫・ouvrir-un-ticket'], category: C['🎫 SUPPORT'], supportRoles: STAFF,
  logChannel: C['📋・logs'], transcriptChannel: C['📋・logs'],
  types: [{ label: 'Aide', emoji: '🛟', description: 'Une question, un souci' }, { label: 'Signaler', emoji: '🚨', description: 'Signaler un membre ou une arnaque' }, { label: 'Partenariat', emoji: '🤝', description: 'Proposer un partenariat' }] });
await api('PUT', 'modules/tempvoice', { enabled: true, generator: C['➕ Crée ton salon'], category: C['🔊 VOCAUX'] });
await api('PUT', 'modules/suggestions', { enabled: true, channel: C['💡・suggestions'], reviewRoles: staff3 });
await api('PUT', 'modules/automod', { enabled: true, logChannel: C['📋・logs'], ignoredRoles: staff3 });
await api('PUT', 'modules/roles', { enabled: true, panels: [{ channel: C['🎭・rôles'], title: '🎭 Choisis tes rôles',
  description: 'Clique sur les boutons pour recevoir (ou enlever) les notifications qui t\'intéressent.', style: 'buttons',
  roles: [R['🔔 Annonces'], R['🎉 Giveaways'], R['🎣 Fisch'], R['🧠 SAB'], R['📺 Lives']], emojis: ['🔔', '🎉', '🎣', '🧠', '📺'], unique: false,
  messageId: before.config?.roles?.panels?.[0]?.messageId || '' },
  { channel: C['🎭・rôles'], title: '🎮 Tes jeux', description: 'À quoi tu joues ? Prends tes jeux pour trouver des coéquipiers (et être mentionné quand on cherche du monde).', style: 'buttons',
    roles: [R['🟥 Roblox'], R['🎯 Valorant'], R['⛏️ Minecraft'], R['🔫 Fortnite']], emojis: ['🟥', '🎯', '⛏️', '🔫'], unique: false,
    messageId: before.config?.roles?.panels?.[1]?.messageId || '' }] });
const cfg = await (await fetch(`http://localhost:${process.env.API_PORT || 3000}/api/guilds/${GID}`, { headers: { 'x-panel-key': process.env.PANEL_KEY } })).json();
await api('PUT', 'modules/games', { enabled: true, countingChannel: C['♾️・route-de-l-infini'] });
await api('PUT', 'modules/birthdays', { enabled: true, channel: C['🎂・anniversaires'], role: R['🎂 Anniversaire'], hour: 9,
  message: '🎂 Joyeux anniversaire {mention} ! Toute l\'équipe de **{server}** te souhaite une super journée 🎉🥳' });
await api('PUT', 'modules/socials', { enabled: true, channel: C['🔴・lives-twitch'], pingRole: R['📺 Lives'],
  twitch: (before.config?.socials?.twitch || []) });
if (await empty('♾️・route-de-l-infini')) await send('♾️・route-de-l-infini', { embeds: [{ color: 0x5865F2, title: '♾️ La route de l\'infini',
  description: 'On compte ensemble jusqu\'à l\'infini ! Écris juste le nombre suivant.\n\n• Commence à **1**\n• Pas deux fois de suite la même personne\n• Une erreur = on recommence à 1 😈' }] });
if (await empty('🎂・anniversaires')) await send('🎂・anniversaires', { embeds: [{ color: 0xFF69B4, title: '🎂 Anniversaires',
  description: 'Enregistre ton anniversaire avec `/anniversaire-set` et le bot te le souhaitera ici le jour J (+ un rôle 🎂 pour la journée) !\nVoir la liste : `/anniversaire-liste`' }] });
if (await empty('🔴・lives-twitch')) await send('🔴・lives-twitch', { embeds: [{ color: 0x9146FF, title: '🔴 Lives Twitch',
  description: 'Ici, le bot prévient quand nos streamers lancent un live.\nPrends le rôle 📺 Lives dans <#' + C['🎭・rôles'] + '> pour être notifié !' }] });
log('panel de rôles :', (await api('POST', 'actions/roles.sendRolePanels', {})).message);
const tk = (await rest.get(Routes.channelMessages(C['🎫・ouvrir-un-ticket']), { query: new URLSearchParams({ limit: '5' }) })).length;
if (!tk) log('panel de tickets :', (await api('POST', 'actions/tickets.sendPanel', {})).message);
// ---------- 6. Jeux, niveaux, économie, etc. ----------
await api('PUT', 'modules/levels', { enabled: true, channel: C['📈・niveaux'], noXpChannels: [C['♾️・route-de-l-infini'], C['🤖・commandes']],
  message: '🎉 GG {mention}, tu passes au **niveau {level}** !',
  rewards: [[5, '🥉 Niveau 5'], [10, '🥈 Niveau 10'], [20, '🥇 Niveau 20'], [30, '🏆 Niveau 30'], [50, '💠 Niveau 50']].map(([level, r]) => ({ level, role: R[r] })), stackRewards: false });
await api('PUT', 'modules/economy', { enabled: true, currency: '🪙', currencyName: 'pièces', shop: [
  { name: '💎 Rôle Premium', price: 250000, description: 'Accès au salon et au vocal Premium, pour toujours !', role: R['💎 Premium'], stock: -1 },
  { name: '🍀 Trèfle porte-bonheur', price: 2500, description: 'Un objet de collection pour frimer dans ton inventaire.', role: '', stock: -1 },
  { name: '🎣 Canne à pêche dorée', price: 15000, description: 'Objet de collection Fisch, ultra stylé.', role: '', stock: -1 }] });
await api('PUT', 'modules/flamme', { enabled: true, channel: C['🔥・flamme'] });
await api('PUT', 'modules/starboard', { enabled: true, channel: C['⭐・starboard'], emoji: '⭐', threshold: 3 });
await api('PUT', 'modules/invites', { enabled: true, channel: C['📨・invitations'] });
await api('PUT', 'modules/polls', { enabled: true, channel: C['📊・sondages'] });
await api('PUT', 'modules/customcmds', { enabled: true, commands: [
  { tag: 'regles', response: 'Le règlement est ici : <#' + C['📜・règlement'] + '> 📜 Lis-le bien !', embed: true, staffOnly: false },
  { tag: 'tribunal', response: 'Un problème avec quelqu\'un ? Demande un procès dans le Tribunal ⚖️ (catégorie ⚖️ TRIBUNAL).', embed: true, staffOnly: false },
  { tag: 'lives', response: 'Nos streamers : **thekingt13** et **lemultigamertiktok** 🔴\nPrends le rôle 📺 Lives dans <#' + C['🎭・rôles'] + '> pour être prévenu !', embed: true, staffOnly: false },
  { tag: 'aide', response: 'Toutes les commandes du bot : <#' + C['📚・commandes-du-bot'] + '> ou tape `/help` 🤖', embed: true, staffOnly: false }] });
const intro = {
  '🤡・mur-de-la-honte': ['🤡 Le mur de la honte', 'Ici sont affichés les condamnés du Tribunal à qui le juge a donné la sanction **« honte »**.\nIls portent le rôle **🤡 Honte** pendant toute la durée de leur peine. Vous pouvez réagir… 😏'],
  '😂・memes': ['😂 Memes', 'Vos meilleurs memes, clips drôles et images. Les plus likés (3 ⭐) finissent dans le starboard !'],
  '🕹️・autres-jeux': ['🕹️ Autres jeux', 'Valorant, Minecraft, Fortnite, Roblox… Cherchez des coéquipiers ici ! Prends tes jeux dans <#' + C['🎭・rôles'] + '> pour être mentionné.'],
  '🎵・musique': ['🎵 Musique', 'Rejoins un vocal puis tape `/play` + le nom d\'une musique ou un lien.\n`/music` pour la file d\'attente, pause, skip, volume, filtres… `/playlist` pour les playlists du serveur.'],
  '🎮・mini-jeux': ['🎮 Mini-jeux', '`/jeu` (pierre-feuille-ciseaux, pile ou face, dés), `/tupreferes`, `/joke`, `/maths`, `/hug`, `/kiss`, `/slap`… Amusez-vous ! 🎲'],
  '🔥・flamme': ['🔥 Le jeu Flamme', 'Adopte ta flamme avec `/flamme` : nourris-la, joue avec elle, explore et combats les autres ! 🔥'],
  '💰・casino': ['💰 Casino & économie', '`/daily` et `/weekly` pour tes pièces gratuites, `/work` pour travailler, puis tente ta chance : `/blackjack`, `/slots`, `/roulette`, `/coinflip` 🎰\nBoutique : `/shop` (le rôle 💎 Premium y est !) · Classement : `/leaderboard`'],
  '📈・niveaux': ['📈 Niveaux', 'Tu gagnes de l\'XP en parlant et en vocal. Le bot annonce ici quand tu montes de niveau.\nRécompenses : 🥉 niv. 5 · 🥈 niv. 10 · 🥇 niv. 20 · 🏆 niv. 30 · 💠 niv. 50\nTa carte : `/rank` · Classement : `/level`'],
  '⭐・starboard': ['⭐ Starboard', 'Un message reçoit **3 ⭐** ? Il est affiché ici pour toujours !'],
  '📊・sondages': ['📊 Sondages', 'Crée un sondage avec `/sondage` : il sera posté ici et tout le monde pourra voter avec les boutons.'],
  '📨・invitations': ['📨 Invitations', 'Le bot dit ici qui a invité qui. Ton nombre d\'invitations : `/invites` 💌'] };
for (const [name, [title, description]] of Object.entries(intro)) if (await empty(name)) await send(name, { embeds: [{ color: 0x5865F2, title, description }] });
if (await empty('📚・commandes-du-bot')) {
  const sections = [
    ['🌟 Général', '`/help` toutes les commandes · `/info` le bot · `/ping` · `/rank` ta carte de niveau · `/level` classement · `/invites` tes invitations · `/profil` · `/avatar` · `/c regles` `/c lives` `/c tribunal` `/c aide`'],
    ['🎮 Fun & jeux', '`/jeu` · `/tupreferes` · `/joke` · `/maths` · `/hug` `/kiss` `/slap` · `/sondage` · `/flamme` (le jeu de la flamme 🔥) · ♾️ compter dans <#' + C['♾️・route-de-l-infini'] + '>'],
    ['💰 Économie & casino', '`/balance` · `/daily` · `/weekly` · `/work` · `/pay` · `/rob` · `/blackjack` · `/slots` · `/roulette` · `/coinflip` · `/shop` · `/inventory` · `/use` · `/leaderboard`'],
    ['🎂 Anniversaires', '`/anniversaire-set` enregistre ta date · `/anniversaire-liste` les prochains anniversaires'],
    ['🔊 Ton vocal perso', 'Rejoins <#' + C['➕ Crée ton salon'] + '>, puis gère ton salon avec `/voice` (nom, limite, verrouiller, inviter, expulser…)'],
    ['🎫 Aide', 'Un problème ? Ouvre un ticket dans <#' + C['🎫・ouvrir-un-ticket'] + '> · `/avis` pour noter le support'],
    ['⚖️ Tribunal', 'Demande un procès avec le bouton dans le Tribunal. Pendant un procès : `/proces preuve` (participants) · `/proces infos`'],
    ['🛡️ Staff', '`/ban` `/kick` `/mute` `/warn` (+ temporaires) · `/unban` `/unmute` `/delwarn` · `/history` · `/clear` · `/lock` `/unlock` · `/raid` · `/giveaway` · `/ticket` · `/proces` (juge/owner)'],
  ];
  await send('📚・commandes-du-bot', { embeds: [{ color: 0x5865F2, title: '📚 Toutes les commandes de MonBot', description: 'Tape `/` dans un salon pour voir les commandes. Les plus utiles :', fields: sections.map(([name, value]) => ({ name, value })) }] });
}
// ---------- 7. Captcha, réactions de mots, rôles de soutien, mur de la honte ----------
await api('PUT', 'modules/captcha', { enabled: true, channel: C['✅・vérification'], verifiedRole: R['🎮 Membre'], unverifiedRole: '', mode: 'button', kickMinutes: 0,
  message: '👋 Bienvenue ! Clique sur le bouton pour prouver que tu n\'es pas un robot 🤖 et débloquer tout le serveur.\nLis aussi le <#' + C['📜・règlement'] + '> 📜' });
if (await empty('✅・vérification')) log('captcha :', (await api('POST', 'actions/captcha.sendCaptcha', {})).message);
await api('PUT', 'modules/wordreact', { enabled: true, rules: [
  { words: ['quoi'], emoji: '', reply: 'feur 😂', exact: true },
  { words: ['gg', 'bien joué', 'bien joue'], emoji: '🎉', reply: '', exact: true },
  { words: ['bonne nuit'], emoji: '😴', reply: '', exact: false },
  { words: ['bonjour', 'salut', 'wesh', 'yo'], emoji: '👋', reply: '', exact: true },
  { words: ['fisch'], emoji: '🎣', reply: '', exact: true },
  { words: ['brainrot', 'sab'], emoji: '🧠', reply: '', exact: true }] });
const invites = await rest.get(Routes.guildInvites(GID)).catch(() => []);
let inv = invites.find(x => x.inviter?.id === me.id && !x.max_age && !x.max_uses);
inv ??= await rest.post(Routes.channelInvites(C['📜・règlement']), { body: { max_age: 0, max_uses: 0, unique: true } });
await api('PUT', 'modules/supportroles', { enabled: true, role: R['💜 Soutien'], text: `discord.gg/${inv.code}`, channel: C['💬・général'],
  message: 'Merci {mention} de mettre le serveur dans ton statut 💜 Tu as gagné le rôle **💜 Soutien** !' });
log('invitation permanente : discord.gg/' + inv.code);
if (C['🤡・mur-de-la-honte']) await api('PUT', 'modules/honte', { enabled: true, channel: C['🤡・mur-de-la-honte'] });log('TERMINÉ');
