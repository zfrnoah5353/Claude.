import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } from 'discord.js';
import { evaluate } from 'mathjs';
import { getConfig, getMember, getUser, saveUser, updateMember, allMembers, kvGet, kvSet, kvList, addTimer, findTimers, removeTimer } from '../db.js';
import { ok, err, COLORS, pick, rand, ts, parseDuration, isStaff } from '../util.js';
import { totalInvites } from '../modules/invites.js';

const JOKES = {
  general: [
    ['Pourquoi les plongeurs plongent-ils toujours en arrière ?', 'Parce que sinon ils tombent dans le bateau.'],
    ['Que dit une imprimante dans l\'eau ?', 'J\'ai papier !'],
    ['Quel est le comble pour un électricien ?', 'De ne pas être au courant.'],
    ['Pourquoi les poissons détestent l\'ordinateur ?', 'À cause du net.'],
    ['Qu\'est-ce qu\'un canif ?', 'Un petit fien.'],
    ['Comment appelle-t-on un chat tombé dans un pot de peinture le jour de Noël ?', 'Un chat-peint de Noël.'],
    ['Que fait une fraise sur un cheval ?', 'Tagada tagada.'],
    ['Quel est le sport le plus fruité ?', 'La boxe : tu te prends une pêche, tu tombes dans les pommes et tu ne ramènes pas ta fraise.'],
  ],
  dev: [
    ['Pourquoi les développeurs confondent Halloween et Noël ?', 'Parce que OCT 31 = DEC 25.'],
    ['Combien de développeurs faut-il pour changer une ampoule ?', 'Aucun, c\'est un problème matériel.'],
    ['Pourquoi le JavaScript porte des lunettes ?', 'Parce qu\'il ne voit pas en C#.'],
  ],
  gaming: [
    ['Pourquoi les joueurs de Minecraft sont toujours calmes ?', 'Parce qu\'ils savent gérer les blocs.'],
    ['Que dit un joueur quand il perd au loto ?', 'C\'est le lag !'],
  ],
};
const WYR = {
  general: [['Pouvoir voler', 'Être invisible'], ['Ne plus jamais dormir', 'Ne plus jamais manger'], ['Vivre sans musique', 'Vivre sans films'], ['Avoir 10 frères', 'Être enfant unique'], ['Parler toutes les langues', 'Parler aux animaux'], ['Voyager dans le passé', 'Voyager dans le futur']],
  gaming: [['Jouer seulement à Minecraft', 'Jouer seulement à Fortnite'], ['Avoir un PC de ouf', 'Avoir toutes les consoles'], ['Ne jamais lag', 'Ne jamais perdre de connexion'], ['Être pro sur un seul jeu', 'Être moyen sur tous les jeux']],
  food: [['Pizza à vie', 'Burger à vie'], ['Plus jamais de chocolat', 'Plus jamais de fromage'], ['Manger toujours épicé', 'Manger toujours sucré']],
};

async function gif(type) {
  try { const r = await fetch(`https://nekos.best/api/v2/${type}`); const j = await r.json(); return j.results?.[0]?.url; } catch { return null; }
}
function actionCmd(name, verb, emoji) {
  return {
    module: 'games',
    data: new SlashCommandBuilder().setName(name).setDescription(`Envoie un GIF de ${name} aléatoire (à un utilisateur si mentionné).`).addUserOption(o => o.setName('user').setDescription('Membre')),
    run: async (i) => {
      await i.deferReply();
      const u = i.options.getUser('user');
      const e = new EmbedBuilder().setColor(COLORS.main).setDescription(u ? `${emoji} ${i.user} ${verb} ${u} !` : `${emoji} ${i.user} veut un ${name}…`);
      const url = await gif(name); if (url) e.setImage(url);
      i.editReply({ embeds: [e] });
    },
  };
}

// ---- Sondages ----
const pollEmbed = (p, closed = false) => {
  const total = p.options.reduce((a, o) => a + o.votes.length, 0);
  return new EmbedBuilder().setColor(closed ? 0x2b2d31 : COLORS.info).setTitle(`📊 ${p.question}`)
    .setDescription(p.options.map((o, k) => { const pct = total ? Math.round((o.votes.length / total) * 100) : 0; return `**${k + 1}. ${o.label}**\n${'█'.repeat(Math.round(pct / 10))}${'░'.repeat(10 - Math.round(pct / 10))} ${pct}% (${o.votes.length})`; }).join('\n\n'))
    .setFooter({ text: `${total} vote(s) · ${closed ? 'Sondage fermé' : p.multi ? 'Plusieurs choix possibles' : 'Un seul choix'}${p.end && !closed ? '' : ''}` })
    .addFields(p.end && !closed ? [{ name: 'Fin', value: ts(p.end) }] : []);
};
const pollRows = (id, p, closed = false) => {
  const rows = []; p.options.forEach((o, k) => { if (k % 5 === 0) rows.push(new ActionRowBuilder()); rows.at(-1).addComponents(new ButtonBuilder().setCustomId(`poll:${id}:${k}`).setLabel(`${k + 1}. ${o.label}`.slice(0, 80)).setStyle(ButtonStyle.Secondary).setDisabled(closed)); });
  return rows;
};
async function closePoll(client, msgId, cancel = false) {
  const p = kvGet('poll', msgId); if (!p || p.closed) return null;
  p.closed = true; kvSet('poll', msgId, p);
  const ch = client.channels.cache.get(p.channel); const msg = await ch?.messages.fetch(msgId).catch(() => null);
  if (msg) { if (cancel) await msg.delete().catch(() => {}); else await msg.edit({ embeds: [pollEmbed(p, true)], components: pollRows(msgId, p, true) }).catch(() => {}); }
  return p;
}

export const commands = [
  {
    data: new SlashCommandBuilder().setName('avatar').setDescription('Affiche l\'avatar d\'un utilisateur.').addUserOption(o => o.setName('user').setDescription('Membre')),
    run: async (i) => {
      const u = i.options.getUser('user') || i.user; const mem = i.guild ? await i.guild.members.fetch(u.id).catch(() => null) : null;
      const e = new EmbedBuilder().setColor(COLORS.main).setTitle(`Avatar de ${u.username}`).setImage(u.displayAvatarURL({ size: 1024 }));
      if (mem?.avatar) e.setDescription(`[Avatar du serveur](${mem.displayAvatarURL({ size: 1024 })})`);
      i.reply({ embeds: [e] });
    },
  },
  {
    data: new SlashCommandBuilder().setName('description').setDescription('Définit la description affichée sur votre profil global.').addStringOption(o => o.setName('text').setDescription('Ta description').setRequired(true).setMaxLength(200)),
    run: (i) => { const u = getUser(i.user.id); u.description = i.options.getString('text'); saveUser(i.user.id, u); i.reply({ ...ok('Description mise à jour !'), flags: MessageFlags.Ephemeral }); },
  },
  {
    data: new SlashCommandBuilder().setName('profil').setDescription('Affiche le profil global d\'un utilisateur.').setDMPermission(false).addUserOption(o => o.setName('user').setDescription('Membre')),
    run: async (i) => {
      const u = i.options.getUser('user') || i.user; const g = getUser(u.id); const m = getMember(i.guildId, u.id);
      const mem = await i.guild.members.fetch(u.id).catch(() => null);
      const bday = kvGet('bday', `${i.guildId}:${u.id}`);
      i.reply({ embeds: [new EmbedBuilder().setColor(mem?.displayColor || COLORS.main).setAuthor({ name: u.username, iconURL: u.displayAvatarURL() }).setThumbnail(u.displayAvatarURL({ size: 256 }))
        .setDescription(g.description || '*Pas de description (utilise /description)*')
        .addFields(
          { name: '📈 Niveau', value: `${m.level}`, inline: true }, { name: '💬 Messages', value: `${m.msgs}`, inline: true }, { name: '🔊 Vocal', value: `${m.voiceMin} min`, inline: true },
          { name: '💰 Argent', value: `${m.money}`, inline: true }, { name: '📨 Invitations', value: `${totalInvites(m)}`, inline: true }, { name: '🎂 Anniversaire', value: bday ? `${String(bday.d).padStart(2, '0')}/${String(bday.m).padStart(2, '0')}` : '—', inline: true },
          { name: '📅 Compte créé', value: ts(u.createdTimestamp), inline: true }, { name: '📥 Arrivé', value: mem?.joinedTimestamp ? ts(mem.joinedTimestamp) : '—', inline: true },
        )] });
    },
  },
  {
    module: 'games',
    data: new SlashCommandBuilder().setName('jeu').setDescription('Mini-jeux : pierre-feuille-ciseaux, pile ou face, dés.')
      .addSubcommand(s => s.setName('pfc').setDescription('Pierre-feuille-ciseaux contre le bot').addStringOption(o => o.setName('choix').setDescription('Ton choix').setRequired(true).addChoices({ name: '🪨 Pierre', value: 'pierre' }, { name: '📄 Feuille', value: 'feuille' }, { name: '✂️ Ciseaux', value: 'ciseaux' })))
      .addSubcommand(s => s.setName('pileouface').setDescription('Lance une pièce'))
      .addSubcommand(s => s.setName('dés').setDescription('Lance des dés').addIntegerOption(o => o.setName('nombre').setDescription('Nombre de dés').setMinValue(1).setMaxValue(10)).addIntegerOption(o => o.setName('faces').setDescription('Faces').setMinValue(2).setMaxValue(100))),
    run: (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'pfc') {
        const me = i.options.getString('choix'); const bot = pick(['pierre', 'feuille', 'ciseaux']); const E = { pierre: '🪨', feuille: '📄', ciseaux: '✂️' };
        const res = me === bot ? 'Égalité 🤝' : ({ pierre: 'ciseaux', feuille: 'pierre', ciseaux: 'feuille' }[me] === bot ? 'Tu gagnes 🎉' : 'J\'ai gagné 😎');
        return i.reply(`${E[me]} contre ${E[bot]} → **${res}**`);
      }
      if (sub === 'pileouface') return i.reply(`🪙 C'est **${Math.random() < 0.5 ? 'pile' : 'face'}** !`);
      const n = i.options.getInteger('nombre') || 1, f = i.options.getInteger('faces') || 6;
      const r = Array.from({ length: n }, () => rand(1, f));
      i.reply(`🎲 ${r.join(' + ')}${n > 1 ? ` = **${r.reduce((a, b) => a + b, 0)}**` : ''}`);
    },
  },
  actionCmd('hug', 'fait un câlin à', '🤗'),
  actionCmd('kiss', 'fait un bisou à', '😘'),
  actionCmd('slap', 'met une claque à', '👋'),
  {
    module: 'games',
    data: new SlashCommandBuilder().setName('joke').setDescription('Raconte une blague.').addStringOption(o => o.setName('category').setDescription('Catégorie').addChoices({ name: 'Générale', value: 'general' }, { name: 'Développeurs', value: 'dev' }, { name: 'Gaming', value: 'gaming' })),
    run: (i) => { const [q, a] = pick(JOKES[i.options.getString('category') || pick(Object.keys(JOKES))]); i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warn).setTitle('😂 Blague').setDescription(`${q}\n\n||${a}||`)] }); },
  },
  {
    data: new SlashCommandBuilder().setName('maths').setDescription('Résout une expression mathématique.').addStringOption(o => o.setName('expression').setDescription('Ex : 2*(3+4)^2, sqrt(16), 10% de 50 → 0.1*50').setRequired(true)),
    run: (i) => {
      const ex = i.options.getString('expression');
      try { const r = evaluate(ex.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '.')); i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription(`🧮 \`${ex}\` = **${typeof r === 'number' ? +r.toFixed(10) : r.toString()}**`)] }); }
      catch { i.reply(err('Expression invalide.')); }
    },
  },
  {
    module: 'games',
    data: new SlashCommandBuilder().setName('tupreferes').setDescription('Joue à « Tu préfères » — choisis A ou B.').addStringOption(o => o.setName('category').setDescription('Catégorie').addChoices({ name: 'Général', value: 'general' }, { name: 'Gaming', value: 'gaming' }, { name: 'Nourriture', value: 'food' })),
    run: (i) => {
      const [a, b] = pick(WYR[i.options.getString('category') || pick(Object.keys(WYR))]);
      const id = `${Date.now()}`; kvSet('wyr', id, { a: [], b: [] });
      i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.main).setTitle('🤔 Tu préfères…').setDescription(`🅰️ **${a}**\n\nou\n\n🅱️ **${b}**`)],
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`wyr:${id}:a`).setLabel('A (0)').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`wyr:${id}:b`).setLabel('B (0)').setStyle(ButtonStyle.Danger))] });
    },
  },
  {
    module: 'birthdays',
    data: new SlashCommandBuilder().setName('anniversaire-set').setDescription('Enregistre, modifie ou supprime ta date d\'anniversaire sur ce serveur.').setDMPermission(false).addStringOption(o => o.setName('date').setDescription('JJ/MM (vide = supprimer)')),
    run: (i) => {
      const d = i.options.getString('date'); const key = `${i.guildId}:${i.user.id}`;
      if (!d) { kvSet('bday', key, null); return i.reply({ ...ok('Anniversaire supprimé.'), flags: MessageFlags.Ephemeral }); }
      const m = d.match(/^(\d{1,2})[/.-](\d{1,2})/); const day = Number(m?.[1]), mon = Number(m?.[2]);
      if (!m || mon < 1 || mon > 12 || day < 1 || day > 31) return i.reply(err('Format : JJ/MM (ex : 14/07).'));
      kvSet('bday', key, { d: day, m: mon, guild: i.guildId, user: i.user.id });
      i.reply({ ...ok(`Anniversaire enregistré : **${String(day).padStart(2, '0')}/${String(mon).padStart(2, '0')}** 🎂`), flags: MessageFlags.Ephemeral });
    },
  },
  {
    module: 'birthdays',
    data: new SlashCommandBuilder().setName('anniversaire-liste').setDescription('Affiche les prochains anniversaires du serveur.').setDMPermission(false),
    run: (i) => {
      const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const list = kvList('bday').map(x => x.value).filter(v => v && v.guild === i.guildId).map(v => {
        let next = new Date(now.getFullYear(), v.m - 1, v.d); if (next < today) next = new Date(now.getFullYear() + 1, v.m - 1, v.d);
        return { ...v, next };
      }).sort((a, b) => a.next - b.next).slice(0, 15);
      i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.main).setTitle('🎂 Prochains anniversaires').setDescription(list.map(v => `**${String(v.d).padStart(2, '0')}/${String(v.m).padStart(2, '0')}** · <@${v.user}> · ${ts(v.next.getTime())}`).join('\n') || 'Personne n\'a enregistré son anniversaire (`/anniversaire-set`).')] });
    },
  },
  {
    module: 'polls',
    data: new SlashCommandBuilder().setName('sondage').setDescription('Sondages : créer, fermer, annuler, lister.').setDMPermission(false)
      .addSubcommand(s => s.setName('créer').setDescription('Créer un sondage')
        .addStringOption(o => o.setName('question').setDescription('Question').setRequired(true))
        .addStringOption(o => o.setName('choix').setDescription('Choix séparés par | (ex : Oui | Non | Peut-être)').setRequired(true))
        .addStringOption(o => o.setName('durée').setDescription('Durée (ex : 1d). Vide = jusqu\'à fermeture'))
        .addBooleanOption(o => o.setName('multiple').setDescription('Plusieurs choix possibles')))
      .addSubcommand(s => s.setName('fermer').setDescription('Fermer un sondage').addStringOption(o => o.setName('message_id').setDescription('ID du message').setRequired(true)))
      .addSubcommand(s => s.setName('annuler').setDescription('Supprimer un sondage').addStringOption(o => o.setName('message_id').setDescription('ID du message').setRequired(true)))
      .addSubcommand(s => s.setName('liste').setDescription('Sondages ouverts')),
    run: async (i) => {
      const sub = i.options.getSubcommand();
      if (sub === 'créer') {
        const opts = i.options.getString('choix').split('|').map(s => s.trim()).filter(Boolean).slice(0, 10);
        if (opts.length < 2) return i.reply(err('Il faut au moins 2 choix séparés par |.'));
        const cfg = getConfig(i.guildId).polls;
        const ch = (cfg.channel && i.guild.channels.cache.get(cfg.channel)) || i.channel;
        const dur = parseDuration(i.options.getString('durée'));
        const p = { guild: i.guildId, channel: ch.id, author: i.user.id, question: i.options.getString('question'), options: opts.map(label => ({ label, votes: [] })), multi: !!i.options.getBoolean('multiple'), end: dur ? Date.now() + dur : null, closed: false };
        const msg = await ch.send({ content: cfg.pingRole ? `<@&${cfg.pingRole}>` : null, embeds: [pollEmbed(p)], components: pollRows('tmp', p) });
        kvSet('poll', msg.id, p); await msg.edit({ components: pollRows(msg.id, p) });
        if (dur) addTimer('poll', i.guildId, p.end, { msg: msg.id });
        return i.reply({ ...ok(`Sondage créé dans ${ch}.`), flags: MessageFlags.Ephemeral });
      }
      if (sub === 'liste') {
        const l = kvList('poll').filter(x => x.value?.guild === i.guildId && !x.value.closed);
        return i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setTitle('📊 Sondages ouverts').setDescription(l.map(x => `**${x.value.question}** · <#${x.value.channel}> · \`${x.key}\``).join('\n') || 'Aucun.')] });
      }
      const id = i.options.getString('message_id'); const p = kvGet('poll', id);
      if (!p || p.guild !== i.guildId) return i.reply(err('Sondage introuvable.'));
      if (p.author !== i.user.id && !isStaff(i.member)) return i.reply(err('Seul l\'auteur ou le staff peut faire ça.'));
      await closePoll(i.client, id, sub === 'annuler');
      for (const t of findTimers('poll', i.guildId)) if (t.data.msg === id) removeTimer(t.id);
      i.reply({ ...ok(sub === 'annuler' ? 'Sondage supprimé.' : 'Sondage fermé.'), flags: MessageFlags.Ephemeral });
    },
  },
];

export function register(client) {
  client.timerHandlers.set('poll', (t) => closePoll(client, t.data.msg));
  client.components.set('poll', async (i, id, k) => {
    const p = kvGet('poll', id); if (!p || p.closed) return i.reply({ content: 'Sondage fermé.', flags: MessageFlags.Ephemeral });
    const opt = p.options[Number(k)]; const had = opt.votes.includes(i.user.id);
    if (!p.multi) p.options.forEach(o => { o.votes = o.votes.filter(v => v !== i.user.id); });
    if (had) opt.votes = opt.votes.filter(v => v !== i.user.id); else opt.votes.push(i.user.id);
    kvSet('poll', id, p);
    await i.update({ embeds: [pollEmbed(p)], components: pollRows(id, p) });
  });
  client.components.set('wyr', async (i, id, side) => {
    const v = kvGet('wyr', id, { a: [], b: [] });
    v.a = v.a.filter(x => x !== i.user.id); v.b = v.b.filter(x => x !== i.user.id); v[side].push(i.user.id); kvSet('wyr', id, v);
    await i.update({ components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`wyr:${id}:a`).setLabel(`A (${v.a.length})`).setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`wyr:${id}:b`).setLabel(`B (${v.b.length})`).setStyle(ButtonStyle.Danger))] });
  });
}
export { updateMember, allMembers };
