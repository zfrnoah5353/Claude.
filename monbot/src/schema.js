// Description de tous les modules et de leurs réglages.
// Le panel (.exe) lit ce schéma pour construire ses formulaires automatiquement.
// Types : toggle, text, textarea, number, color, channel, voice, category, role, roles, channels, list, select, objlist
// Variables dans les messages : {user} {mention} {server} {count} {level} {inviter} {invites}

const T = (key, label, def = false, help) => ({ key, label, type: 'toggle', default: def, help });
const txt = (key, label, def = '', help) => ({ key, label, type: 'text', default: def, help });
const area = (key, label, def = '', help) => ({ key, label, type: 'textarea', default: def, help });
const num = (key, label, def = 0, help, min, max) => ({ key, label, type: 'number', default: def, help, min, max });
const ch = (key, label, help) => ({ key, label, type: 'channel', default: '', help });
const vc = (key, label, help) => ({ key, label, type: 'voice', default: '', help });
const cat = (key, label, help) => ({ key, label, type: 'category', default: '', help });
const role = (key, label, help) => ({ key, label, type: 'role', default: '', help });
const roles = (key, label, help) => ({ key, label, type: 'roles', default: [], help });
const chans = (key, label, help) => ({ key, label, type: 'channels', default: [], help });
const list = (key, label, def = [], help) => ({ key, label, type: 'list', default: def, help });
const sel = (key, label, options, def, help) => ({ key, label, type: 'select', options, default: def ?? options[0][0], help });
const color = (key, label, def = '#5865F2') => ({ key, label, type: 'color', default: def });
const objs = (key, label, fields, help) => ({ key, label, type: 'objlist', fields, default: [], help });

export const MODULES = [
  { id: 'moderation', name: 'Modération', icon: '🛡️', desc: 'Sanctions, historique, mode raid.', fields: [
    T('enabled', 'Activé', true),
    ch('logChannel', 'Salon des sanctions'),
    T('dmOnSanction', 'Prévenir le membre en MP quand il est sanctionné', true),
    roles('staffRoles', 'Rôles staff (accès aux commandes de modération)'),
    role('quarantineRole', 'Rôle de quarantaine (mode raid)'),
    T('autoRaid', 'Activer le mode raid automatiquement', true),
    num('raidJoins', 'Arrivées pour déclencher le mode raid', 8, 'Nombre de membres qui rejoignent…', 2, 100),
    num('raidSeconds', '…en combien de secondes', 10, '', 2, 600),
  ]},
  { id: 'welcome', name: 'Bienvenue & Au revoir', icon: '👋', desc: 'Messages et images d\'accueil, rôles automatiques.', fields: [
    T('enabled', 'Activé'),
    ch('channel', 'Salon de bienvenue'),
    area('message', 'Message de bienvenue', 'Bienvenue {mention} sur **{server}** ! Nous sommes maintenant **{count}** 🎉'),
    T('image', 'Image de bienvenue générée', true),
    txt('imageBg', 'Fond de l\'image (lien d\'une image, vide = dégradé)'),
    txt('imageTitle', 'Titre sur l\'image', 'BIENVENUE'),
    color('color', 'Couleur'),
    T('dm', 'Envoyer aussi un MP'),
    area('dmMessage', 'Message privé', 'Bienvenue sur {server} ! Lis bien le règlement 😉'),
    roles('autoroles', 'Rôles donnés à l\'arrivée'),
    roles('botRoles', 'Rôles donnés aux bots à l\'arrivée'),
    T('goodbyeEnabled', 'Message d\'au revoir'),
    ch('goodbyeChannel', 'Salon d\'au revoir'),
    area('goodbyeMessage', 'Message d\'au revoir', '**{user}** a quitté le serveur. Nous sommes **{count}**.'),
  ]},
  { id: 'tickets', name: 'Tickets', icon: '🎫', desc: 'Panels à boutons ou menu, formulaires, transcripts.', actions: [{ id: 'sendPanel', label: 'Envoyer le panel de tickets' }], fields: [
    T('enabled', 'Activé'),
    ch('panelChannel', 'Salon où envoyer le panel'),
    txt('panelTitle', 'Titre du panel', '🎫 Besoin d\'aide ?'),
    area('panelDescription', 'Texte du panel', 'Choisis une catégorie ci-dessous pour ouvrir un ticket.'),
    sel('style', 'Style', [['buttons', 'Boutons'], ['menu', 'Menu déroulant']]),
    objs('types', 'Catégories de tickets', [txt('label', 'Nom', 'Support'), txt('emoji', 'Emoji', '🛟'), txt('description', 'Description'), area('question', 'Question du formulaire (vide = pas de formulaire)'), roles('roles', 'Rôles staff de cette catégorie')]),
    cat('category', 'Catégorie Discord où créer les tickets'),
    roles('supportRoles', 'Rôles staff (tous les tickets)'),
    area('welcomeMessage', 'Message dans le ticket', 'Bonjour {mention}, un membre du staff va te répondre. Explique ton problème ici.'),
    num('maxOpen', 'Tickets ouverts max par membre', 1, '', 1, 10),
    ch('logChannel', 'Salon des logs de tickets'),
    ch('transcriptChannel', 'Salon des transcripts'),
    num('autoCloseHours', 'Fermeture auto après X heures sans message (0 = jamais)', 0, '', 0, 720),
    T('review', 'Demander un avis à la fermeture', true),
    T('dmTranscript', 'Envoyer le transcript en MP au membre', true),
  ]},
  { id: 'giveaway', name: 'Giveaways', icon: '🎁', desc: 'Conditions, multi-gagnants, reroll.', fields: [
    T('enabled', 'Activé', true),
    txt('emoji', 'Emoji du bouton', '🎉'),
    color('color', 'Couleur', '#F1C40F'),
    T('dmWinners', 'Prévenir les gagnants en MP', true),
  ]},
  { id: 'levels', name: 'Niveaux', icon: '📈', desc: 'XP messages et vocal, rôles récompenses, cartes de rang.', fields: [
    T('enabled', 'Activé'),
    ch('channel', 'Salon des annonces de niveau (vide = même salon)'),
    area('message', 'Message de passage de niveau', 'GG {mention}, tu passes au niveau **{level}** ! 🎉'),
    num('xpMin', 'XP min par message', 15, '', 0, 1000),
    num('xpMax', 'XP max par message', 25, '', 0, 1000),
    num('cooldown', 'Délai entre deux gains (secondes)', 60, '', 0, 3600),
    T('voiceXp', 'Gagner de l\'XP en vocal', true),
    num('voiceXpPerMin', 'XP par minute en vocal', 5, '', 0, 500),
    objs('rewards', 'Rôles récompenses', [num('level', 'Niveau', 5), role('role', 'Rôle')]),
    T('stackRewards', 'Garder les anciens rôles récompenses', true),
    chans('noXpChannels', 'Salons sans XP'),
    roles('noXpRoles', 'Rôles sans XP'),
    color('cardColor', 'Couleur de la carte de rang', '#5865F2'),
  ]},
  { id: 'logs', name: 'Logs', icon: '📜', desc: 'Journal détaillé de l\'activité du serveur.', fields: [
    T('enabled', 'Activé'),
    ch('channel', 'Salon des logs'),
    T('messages', 'Messages supprimés / modifiés', true),
    T('members', 'Arrivées / départs / pseudos', true),
    T('roles', 'Rôles des membres', true),
    T('channels', 'Salons créés / supprimés', true),
    T('voice', 'Vocal (entrées / sorties)', true),
    T('moderation', 'Bans / débans / timeouts', true),
    chans('ignored', 'Salons ignorés'),
  ]},
  { id: 'automod', name: 'AutoMod', icon: '🤖', desc: '10 détecteurs automatiques.', fields: [
    T('enabled', 'Activé'),
    T('antiSpam', 'Anti-spam', true), num('spamLimit', 'Messages max…', 5, '', 2, 50), num('spamSeconds', '…en X secondes', 5, '', 1, 60),
    T('antiFlood', 'Anti-flood (messages trop longs)', true), num('floodLines', 'Lignes max par message', 15, '', 3, 100),
    T('antiInvite', 'Anti-pub (invitations Discord)', true),
    T('antiLinks', 'Anti-liens'), list('linkWhitelist', 'Sites autorisés', ['youtube.com', 'youtu.be', 'tenor.com']),
    T('antiWords', 'Mots interdits', true), list('bannedWords', 'Liste des mots interdits'),
    T('antiCaps', 'Anti-MAJUSCULES', true), num('capsPercent', '% de majuscules max', 70, '', 30, 100),
    T('antiEmoji', 'Anti-spam d\'emojis', true), num('emojiLimit', 'Emojis max par message', 10, '', 2, 100),
    T('antiSpecial', 'Anti-caractères spéciaux (zalgo…)', true),
    T('ghostPing', 'Détection des ghost pings', true),
    T('antiMention', 'Anti-mentions de masse', true), num('mentionLimit', 'Mentions max par message', 5, '', 2, 50),
    sel('action', 'Sanction', [['delete', 'Supprimer le message'], ['warn', 'Supprimer + avertir'], ['mute', 'Supprimer + mute']], 'warn'),
    num('muteMinutes', 'Durée du mute (minutes)', 10, '', 1, 40320),
    ch('logChannel', 'Salon des alertes AutoMod'),
    roles('ignoredRoles', 'Rôles ignorés'),
    chans('ignoredChannels', 'Salons ignorés'),
  ]},
  { id: 'captcha', name: 'Captcha', icon: '🔐', desc: 'Vérification des nouveaux membres contre les bots et raids.', actions: [{ id: 'sendCaptcha', label: 'Envoyer le message de vérification' }], fields: [
    T('enabled', 'Activé'),
    ch('channel', 'Salon de vérification'),
    role('verifiedRole', 'Rôle donné après vérification'),
    role('unverifiedRole', 'Rôle « non vérifié » donné à l\'arrivée (optionnel)'),
    sel('mode', 'Type de captcha', [['code', 'Code à recopier'], ['button', 'Simple bouton']]),
    num('kickMinutes', 'Expulser si pas vérifié après X minutes (0 = jamais)', 10, '', 0, 1440),
    area('message', 'Message', 'Clique sur le bouton pour prouver que tu n\'es pas un robot 🤖'),
  ]},
  { id: 'games', name: 'Jeux', icon: '🎮', desc: 'Commandes fun et comptage infini.', fields: [
    T('enabled', 'Activé', true),
    ch('countingChannel', 'Salon de comptage infini'),
    T('countingReset', 'Recommencer à 1 en cas d\'erreur', true),
    T('countingSameUser', 'Interdire de compter deux fois de suite', true),
  ]},
  { id: 'roles', name: 'Vos Rôles', icon: '🎭', desc: 'Rôles par réaction, bouton ou menu.', actions: [{ id: 'sendRolePanels', label: 'Envoyer / mettre à jour les panels de rôles' }], fields: [
    T('enabled', 'Activé'),
    objs('panels', 'Panels de rôles', [ch('channel', 'Salon'), txt('title', 'Titre', 'Choisis tes rôles'), area('description', 'Description'), sel('style', 'Style', [['buttons', 'Boutons'], ['menu', 'Menu'], ['reactions', 'Réactions']]), roles('roles', 'Rôles'), list('emojis', 'Emojis (dans le même ordre que les rôles)'), T('unique', 'Un seul rôle à la fois'), txt('messageId', 'ID du message (rempli automatiquement)')]),
  ]},
  { id: 'invites', name: 'Invite Tracker', icon: '📨', desc: 'Qui a invité qui (vraies, fausses, parties).', fields: [
    T('enabled', 'Activé'),
    ch('channel', 'Salon des annonces d\'invitation'),
    area('joinMessage', 'Message d\'arrivée', '{mention} a été invité par **{inviter}** (qui a maintenant **{invites}** invitations).'),
    area('leaveMessage', 'Message de départ', '**{user}** est parti (invité par {inviter}).'),
    num('fakeDays', 'Compte de moins de X jours = fausse invitation', 7, '', 0, 365),
    objs('rewards', 'Rôles récompenses', [num('invites', 'Invitations', 5), role('role', 'Rôle')]),
  ]},
  { id: 'wordreact', name: 'Réaction de mots', icon: '💬', desc: 'Réagit ou répond automatiquement à des mots-clés.', fields: [
    T('enabled', 'Activé'),
    objs('rules', 'Règles', [list('words', 'Mots-clés'), txt('emoji', 'Réaction (emoji)'), area('reply', 'Réponse (optionnelle)'), T('exact', 'Mot exact seulement', true)]),
  ]},
  { id: 'music', name: 'Musique', icon: '🎵', desc: 'Lecture en vocal, file d\'attente, playlists, filtres.', fields: [
    T('enabled', 'Activé', true),
    role('djRole', 'Rôle DJ (vide = tout le monde)'),
    num('defaultVolume', 'Volume par défaut', 60, '', 1, 100),
    num('maxQueue', 'Musiques max dans la file', 200, '', 1, 1000),
    T('leaveOnEnd', 'Quitter le vocal à la fin de la file', true),
    objs('playlists', 'Playlists du serveur', [txt('name', 'Nom'), area('tracks', 'Musiques (une recherche ou un lien par ligne)')]),
  ]},
  { id: 'customcmds', name: 'Commandes personnalisées', icon: '⚙️', desc: 'Tes propres commandes avec /c.', fields: [
    T('enabled', 'Activé'),
    objs('commands', 'Commandes', [txt('tag', 'Nom (ex : regles)'), area('response', 'Réponse ({user} {mention} {args})'), T('embed', 'En encadré'), T('staffOnly', 'Staff seulement')]),
  ]},
  { id: 'tempvoice', name: 'Vocaux temporaires', icon: '🔊', desc: 'Un salon vocal perso pour chaque membre.', fields: [
    T('enabled', 'Activé'),
    vc('generator', 'Salon générateur (rejoindre pour créer)'),
    cat('category', 'Catégorie des salons créés'),
    txt('nameTemplate', 'Nom des salons', '🔊 Salon de {user}'),
    num('defaultLimit', 'Limite de membres par défaut (0 = aucune)', 0, '', 0, 99),
    ch('panelChannel', 'Salon de l\'interface de contrôle (optionnel)'),
  ]},
  { id: 'flamme', name: 'Flamme', icon: '🔥', desc: 'Le jeu de la flamme : soigne-la, joue, explore, combats.', fields: [
    T('enabled', 'Activé', true),
    ch('channel', 'Salon réservé au jeu (vide = partout)'),
    num('rate', 'Multiplicateur de gains (%)', 100, '', 10, 1000),
  ]},
  { id: 'economy', name: 'Économie', icon: '💰', desc: 'Monnaie, casino, boutique, inventaire.', fields: [
    T('enabled', 'Activé'),
    txt('currency', 'Symbole de la monnaie', '🪙'),
    txt('currencyName', 'Nom de la monnaie', 'pièces'),
    num('startBalance', 'Solde de départ', 100, '', 0),
    num('dailyAmount', 'Récompense du jour', 200, '', 0),
    num('weeklyAmount', 'Récompense de la semaine', 1500, '', 0),
    num('workMin', 'Gain min /work', 50, '', 0), num('workMax', 'Gain max /work', 250, '', 0),
    num('workCooldown', 'Délai /work (minutes)', 60, '', 0, 10080),
    T('robEnabled', '/rob activé', true), num('robChance', 'Chance de réussir /rob (%)', 40, '', 0, 100),
    num('maxBet', 'Mise max au casino (0 = illimitée)', 0, '', 0),
    objs('shop', 'Boutique', [txt('name', 'Nom de l\'objet'), num('price', 'Prix', 100), area('description', 'Description'), role('role', 'Rôle donné quand on l\'utilise (optionnel)'), num('stock', 'Stock (-1 = illimité)', -1)]),
  ]},
  { id: 'socials', name: 'Réseaux sociaux', icon: '📢', desc: 'Alertes YouTube et Twitch.', fields: [
    T('enabled', 'Activé'),
    ch('channel', 'Salon des alertes'),
    role('pingRole', 'Rôle à mentionner'),
    objs('youtube', 'Chaînes YouTube', [txt('channelId', 'ID de chaîne (UC…)'), area('message', 'Message', '📺 Nouvelle vidéo de **{name}** : {url}')]),
    objs('twitch', 'Chaînes Twitch', [txt('login', 'Pseudo Twitch'), area('message', 'Message', '🔴 **{name}** est en live : {title}\nhttps://twitch.tv/{login}')]),
  ]},
  { id: 'suggestions', name: 'Suggestions', icon: '💡', desc: 'Les membres proposent, votent, le staff valide.', fields: [
    T('enabled', 'Activé'),
    ch('channel', 'Salon des suggestions'),
    T('autoConvert', 'Transformer chaque message du salon en suggestion', true),
    T('thread', 'Créer un fil de discussion', true),
    roles('reviewRoles', 'Rôles qui peuvent accepter / refuser'),
  ]},
  { id: 'starboard', name: 'Starboard', icon: '⭐', desc: 'Les meilleurs messages mis en avant.', fields: [
    T('enabled', 'Activé'),
    ch('channel', 'Salon du starboard'),
    txt('emoji', 'Emoji', '⭐'),
    num('threshold', 'Réactions nécessaires', 3, '', 1, 100),
    T('selfStar', 'Compter sa propre réaction'),
  ]},
  { id: 'supportroles', name: 'Rôles de soutien', icon: '💜', desc: 'Un rôle pour ceux qui mettent le serveur dans leur statut.', fields: [
    T('enabled', 'Activé'),
    role('role', 'Rôle donné'),
    txt('text', 'Texte à avoir dans son statut (ex : discord.gg/monserv)'),
    ch('channel', 'Salon des remerciements (optionnel)'),
    area('message', 'Message', 'Merci {mention} de soutenir le serveur 💜'),
  ]},
  { id: 'announcements', name: 'Annonces', icon: '📣', desc: 'Envoie des annonces et des messages automatiques.', actions: [{ id: 'sendAnnouncement', label: 'Envoyer l\'annonce maintenant' }], fields: [
    T('enabled', 'Activé', true),
    ch('channel', 'Salon des annonces'),
    role('pingRole', 'Rôle à mentionner'),
    txt('title', 'Titre de l\'annonce'),
    area('content', 'Texte de l\'annonce'),
    txt('image', 'Image (lien, optionnel)'),
    color('color', 'Couleur', '#E67E22'),
    objs('scheduled', 'Messages automatiques', [ch('channel', 'Salon'), area('message', 'Message'), num('intervalHours', 'Toutes les X heures', 24)]),
  ]},
  { id: 'proces', name: 'Procès', icon: '⚖️', desc: 'Procès publics : demandes, accusé, avocats, juge assisté par l\'IA, preuves et vote.', actions: [{ id: 'setupTribunal', label: 'Installer / réparer la catégorie Tribunal' }], fields: [
    T('enabled', 'Activé', true),
    ch('announceChannel', 'Salon où annoncer les procès et les verdicts'),
    role('pingRole', 'Rôle à mentionner pour les annonces (optionnel)'),
    num('voteMinutes', 'Durée du vote du public (minutes)', 10, '', 1, 1440),
    T('aiEnabled', 'Juge assisté par l\'IA (analyse + motivation du verdict)', true, 'Gratuit sans clé. Avec ANTHROPIC_API_KEY dans .env, utilise Claude.'),
  ]},
  { id: 'honte', name: 'Mur de la honte', icon: '🔔', desc: 'L\'IA écrit un message de honte drôle pour un membre. À lancer d\'ici, avec /honte, ou tout seul après une sanction.', fields: [
    T('enabled', 'Activé', true),
    ch('channel', 'Salon du Mur de la honte'),
    txt('title', 'Titre du message', 'MUR DE LA HONTE'),
    sel('tone', 'Ton par défaut de l\'IA', [['taquin', 'Taquin (gentil)'], ['moqueur', 'Moqueur'], ['theatral', 'Théâtral (crieur public)'], ['sanspitie', 'Sans pitié (roast)']], 'moqueur'),
    area('instructions', 'Consignes en plus pour l\'IA (optionnel)', '', 'Ex : parle comme un pirate, ajoute une référence à Minecraft…'),
    T('autoOnSanction', 'Message de honte automatique quand un membre est sanctionné (warn, mute, kick, ban)', false),
    T('autoMod', 'Aussi pour les sanctions de l\'AutoMod', false),
    T('ping', 'Mentionner le membre dans le message', true),
    T('react', 'Ajouter les réactions 🔔 🍅 😂', true),
  ]},
  { id: 'birthdays', name: 'Anniversaires', icon: '🎂', desc: 'Souhaite les anniversaires automatiquement.', fields: [
    T('enabled', 'Activé'),
    ch('channel', 'Salon des anniversaires'),
    role('role', 'Rôle du jour (optionnel)'),
    area('message', 'Message', '🎂 Joyeux anniversaire {mention} ! 🎉'),
    num('hour', 'Heure de l\'annonce (0-23)', 9, '', 0, 23),
  ]},
  { id: 'polls', name: 'Sondages', icon: '📊', desc: 'Sondages à boutons avec résultats en direct.', fields: [
    T('enabled', 'Activé', true),
    ch('channel', 'Salon par défaut (vide = salon de la commande)'),
    role('pingRole', 'Rôle à mentionner'),
  ]},
  { id: 'gaming', name: 'Serveur Gaming', icon: '🕹️', desc: 'Statut en direct de tes serveurs Minecraft.', fields: [
    T('enabled', 'Activé'),
    ch('channel', 'Salon du statut'),
    objs('servers', 'Serveurs', [txt('name', 'Nom'), txt('address', 'Adresse (ex : play.monserv.fr)'), sel('edition', 'Édition', [['java', 'Java'], ['bedrock', 'Bedrock']])]),
    num('interval', 'Mise à jour toutes les X minutes', 5, '', 1, 60),
  ]},
  { id: 'backup', name: 'Backup', icon: '💾', desc: 'Sauvegarde et restauration du serveur.', actions: [{ id: 'createBackup', label: 'Créer une sauvegarde maintenant' }], fields: [
    T('enabled', 'Activé', true),
    num('autoDays', 'Sauvegarde auto tous les X jours (0 = jamais)', 7, '', 0, 90),
    num('keep', 'Nombre de sauvegardes gardées', 5, '', 1, 25),
  ]},
];

export function defaultConfig() {
  const out = {};
  for (const m of MODULES) {
    out[m.id] = {};
    for (const f of m.fields) out[m.id][f.key] = structuredClone(f.default);
  }
  return out;
}

export function moduleOf(id) { return MODULES.find(m => m.id === id); }
