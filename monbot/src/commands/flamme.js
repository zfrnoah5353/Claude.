// Le jeu Flamme : un petit compagnon de feu à soigner, faire grandir et faire combattre
import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits as P } from 'discord.js';
import { getConfig, getMember, saveMember, allMembers, kvGet, kvSet, addTimer, patchModule } from '../db.js';
import { ok, err, rand, pick, ts } from '../util.js';

const ORANGE = 0xFF7A18;
const H = 3600e3;
const ITEMS = { bois: '🪵 Bois', charbon: '⚫ Charbon', herbe: '🌿 Herbe sèche', cristal: '💎 Cristal de braise', etoile: '⭐ Étoile filante' };
const STAGES = [[0, '🕯️ Étincelle'], [5, '🔥 Flammèche'], [15, '🔥 Flamme'], [30, '🌋 Brasier'], [50, '☀️ Soleil ardent']];
const WEATHER = [['☀️ Grand soleil', 1.3, 'Gains +30 %'], ['🌧️ Pluie', 0.7, 'Gains −30 %'], ['🌬️ Vent', 1.1, 'Gains +10 %'], ['🌙 Nuit calme', 1.0, 'Rien de spécial'], ['⚡ Orage', 1.5, 'Gains +50 % mais combats risqués'], ['❄️ Gel', 0.6, 'La faim baisse 2× plus vite']];

const xpFor = (lvl) => 50 + lvl * 25;
const stage = (lvl) => [...STAGES].reverse().find(([l]) => lvl >= l)[1];
export const weather = () => WEATHER[Math.floor(Date.now() / (6 * H)) % WEATHER.length];
const power = (f) => f.level * 10 + Math.round(f.joy / 5) + Math.round(f.energy / 5) + (f.items.cristal || 0) * 3;

function newFlamme(name) {
  return { name, born: Date.now(), level: 1, xp: 0, food: 80, joy: 80, energy: 100, embers: 50, items: { bois: 3, charbon: 1, herbe: 2 }, last: {}, wins: 0, losses: 0, tick: Date.now(), frozen: false, expedition: null, quests: null };
}
// La faim et la joie baissent avec le temps
function decay(f) {
  const hours = (Date.now() - f.tick) / H;
  if (hours < 0.25) return f;
  const w = weather();
  f.food = Math.max(0, f.food - hours * 3 * (w[0].includes('Gel') ? 2 : 1));
  f.joy = Math.max(0, f.joy - hours * 2);
  f.energy = Math.min(100, f.energy + hours * 4);
  if (f.food === 0 && !f.frozen) { f.zeroSince = f.zeroSince || Date.now(); if (Date.now() - f.zeroSince > 24 * H) f.frozen = true; }
  if (f.food > 0) f.zeroSince = null;
  f.tick = Date.now();
  return f;
}
function gainXp(f, n, gid) {
  const rate = getConfig(gid).flamme.rate / 100;
  f.xp += Math.round(n * rate * weather()[1]);
  let up = 0; while (f.xp >= xpFor(f.level)) { f.xp -= xpFor(f.level); f.level++; up++; }
  return up;
}
function quests(f) {
  const day = new Date().toISOString().slice(0, 10);
  if (f.quests?.day !== day) f.quests = { day, list: [{ id: 'nourrir', label: 'Nourrir ta flamme', goal: 2, n: 0 }, { id: 'jouer', label: 'Jouer avec ta flamme', goal: 3, n: 0 }, { id: 'cueillir', label: 'Cueillir', goal: 2, n: 0 }], claimed: false };
  return f.quests;
}
function progress(f, id) { const q = quests(f).list.find(x => x.id === id); if (q && q.n < q.goal) q.n++; }
function bar(v) { const n = Math.round(v / 10); return '🟧'.repeat(n) + '⬛'.repeat(10 - n); }
function log(gid, text) { const l = kvGet('flammelog', gid, []); l.unshift(`${new Date().toLocaleString('fr-FR')} · ${text}`); kvSet('flammelog', gid, l.slice(0, 100)); }
function cooldown(f, key, ms) { const left = (f.last[key] || 0) + ms - Date.now(); return left > 0 ? left : 0; }

function card(user, f, extra = '') {
  return new EmbedBuilder().setColor(f.frozen ? 0x7FDBFF : ORANGE).setAuthor({ name: `${f.name} · flamme de ${user.username}`, iconURL: user.displayAvatarURL() })
    .setDescription(`${f.frozen ? '🧊 **Ta flamme est gelée !** Demande à un admin de la dégeler.\n' : ''}**${stage(f.level)}** · niveau **${f.level}** (${f.xp}/${xpFor(f.level)} XP)\n\n🍖 Faim ${bar(f.food)} ${Math.round(f.food)}%\n💛 Joie ${bar(f.joy)} ${Math.round(f.joy)}%\n⚡ Énergie ${bar(f.energy)} ${Math.round(f.energy)}%\n\n✨ **${f.embers}** braises${extra ? `\n\n${extra}` : ''}`)
    .setFooter({ text: `Météo : ${weather()[0]} — ${weather()[2]}` });
}

const subs = [
  ['voir', 'Voir ta flamme (ou en créer une)', (s) => s.addStringOption(o => o.setName('nom').setDescription('Nom de ta nouvelle flamme')).addUserOption(o => o.setName('membre').setDescription('Voir la flamme d\'un membre'))],
  ['stats', 'Statistiques détaillées'], ['nourrir', 'Nourrir ta flamme (utilise du bois)'], ['caresser', 'Caresser ta flamme'], ['jouer', 'Jouer avec ta flamme'],
  ['daily', 'Cadeau du jour'], ['coffre', 'Ouvrir un coffre (60 braises)'], ['cueillir', 'Cueillir des ressources'], ['souffle', 'Entraîner le souffle de ta flamme'],
  ['foyer', 'Faire reposer ta flamme au foyer'], ['meteo', 'Météo actuelle'], ['quetes', 'Quêtes du jour'], ['profil', 'Profil de combattant', (s) => s.addUserOption(o => o.setName('membre').setDescription('Membre'))],
  ['objets', 'Tes objets'], ['combat', 'Défier la flamme d\'un membre', (s) => s.addUserOption(o => o.setName('membre').setDescription('Adversaire').setRequired(true)).addIntegerOption(o => o.setName('mise').setDescription('Braises en jeu').setMinValue(0))],
  ['brasier', 'Sacrifier 5 charbons pour une grosse dose d\'XP'], ['expedition', 'Envoyer ta flamme en expédition (2 h)'], ['top', 'Classement des flammes'],
];

const builder = new SlashCommandBuilder().setName('flamme').setDescription('Le jeu Flamme : soigne ta flamme, joue, explore et affronte les autres.').setDMPermission(false);
for (const [n, d, extra] of subs) builder.addSubcommand(s => { s.setName(n).setDescription(d); if (extra) extra(s); return s; });

export const commands = [
  {
    module: 'flamme', data: builder,
    async run(i) {
      const cfg = getConfig(i.guildId).flamme;
      if (cfg.channel && i.channelId !== cfg.channel) return i.reply(err(`Le jeu Flamme se joue dans <#${cfg.channel}>.`));
      const sub = i.options.getSubcommand();
      if (kvGet('flammeban', i.guildId, []).includes(i.user.id)) return i.reply(err('Tu es banni du jeu Flamme.'));
      if (sub === 'meteo') { const w = weather(); return i.reply({ embeds: [new EmbedBuilder().setColor(ORANGE).setTitle('🌦️ Météo des flammes').setDescription(`**${w[0]}**\n${w[2]}\n\nProchain changement ${ts((Math.floor(Date.now() / (6 * H)) + 1) * 6 * H)}`)] }); }
      if (sub === 'top') {
        const lb = allMembers(i.guildId).filter(m => m.flamme).sort((a, b) => (b.flamme.level - a.flamme.level) || (b.flamme.xp - a.flamme.xp)).slice(0, 10);
        return i.reply({ embeds: [new EmbedBuilder().setColor(ORANGE).setTitle('🏆 Les plus grandes flammes').setDescription(lb.map((m, k) => `**${k + 1}.** <@${m.id}> — ${m.flamme.name} · niv. **${m.flamme.level}** · ${m.flamme.wins}V/${m.flamme.losses}D`).join('\n') || 'Personne n\'a encore de flamme (`/flamme voir`).')] });
      }
      const target = (sub === 'voir' || sub === 'profil') ? i.options.getUser('membre') : null;
      if (target) {
        const tm = getMember(i.guildId, target.id); if (!tm.flamme) return i.reply(err(`${target.username} n'a pas de flamme.`));
        decay(tm.flamme); return i.reply({ embeds: [sub === 'profil' ? new EmbedBuilder().setColor(ORANGE).setTitle(`⚔️ ${tm.flamme.name}`).setDescription(`Puissance : **${power(tm.flamme)}**\nVictoires : **${tm.flamme.wins}** · Défaites : **${tm.flamme.losses}**\n${stage(tm.flamme.level)} niveau ${tm.flamme.level}`) : card(target, tm.flamme)] });
      }
      const m = getMember(i.guildId, i.user.id);
      if (!m.flamme) {
        if (sub !== 'voir') return i.reply(err('Tu n\'as pas encore de flamme ! Fais `/flamme voir` pour en adopter une.'));
        m.flamme = newFlamme(i.options.getString('nom') || pick(['Braisy', 'Cendrine', 'Pyro', 'Lumi', 'Tison', 'Ember', 'Fumi']));
        saveMember(i.guildId, i.user.id, m); log(i.guildId, `${i.user.username} adopte ${m.flamme.name}`);
        return i.reply({ embeds: [card(i.user, m.flamme, '🎉 **Tu viens d\'adopter ta flamme !** Prends-en soin : nourris-la, joue avec elle, et elle grandira.')] });
      }
      const f = decay(m.flamme);
      const save = () => saveMember(i.guildId, i.user.id, m);
      if (f.frozen && !['voir', 'stats', 'objets', 'quetes', 'profil'].includes(sub)) { save(); return i.reply(err('Ta flamme est gelée 🧊. Un admin doit la dégeler (`/flamme-admin degeler`).')); }
      if (f.expedition && f.expedition.end > Date.now() && !['voir', 'stats', 'objets', 'quetes', 'profil', 'expedition'].includes(sub)) return i.reply(err(`Ta flamme est en expédition jusqu'à ${ts(f.expedition.end)}.`));
      const reply = (extra) => { save(); return i.reply({ embeds: [card(i.user, f, extra)] }); };
      const cd = (key, ms) => { const l = cooldown(f, key, ms); if (l) { i.reply(err(`Attends encore ${ts(Date.now() + l)}.`)); return true; } f.last[key] = Date.now(); return false; };
      const lvlMsg = (up) => (up ? `\n\n⬆️ **Niveau ${f.level} !** ${stage(f.level)}` : '');

      switch (sub) {
        case 'voir': return reply();
        case 'stats': return reply(`🎂 Née ${ts(f.born)}\n⚔️ Puissance : **${power(f)}** · ${f.wins} victoires / ${f.losses} défaites`);
        case 'nourrir': {
          if (!f.items.bois && !f.items.herbe) return i.reply(err('Tu n\'as ni bois ni herbe sèche. Va `/flamme cueillir` !'));
          if (f.food >= 100) return i.reply(err('Ta flamme n\'a plus faim.'));
          const what = f.items.bois ? 'bois' : 'herbe'; f.items[what]--; f.food = Math.min(100, f.food + (what === 'bois' ? 30 : 15));
          progress(f, 'nourrir'); const up = gainXp(f, 8, i.guildId);
          return reply(`🍖 Tu donnes ${ITEMS[what]} à ${f.name}. Miam !${lvlMsg(up)}`);
        }
        case 'caresser': { if (cd('caresser', 0.5 * H)) return; f.joy = Math.min(100, f.joy + 15); const up = gainXp(f, 5, i.guildId); return reply(`💛 ${f.name} crépite de bonheur.${lvlMsg(up)}`); }
        case 'jouer': {
          if (f.energy < 15) return i.reply(err('Ta flamme est trop fatiguée. Fais-la reposer avec `/flamme foyer`.'));
          if (cd('jouer', 0.25 * H)) return;
          f.energy -= 15; f.joy = Math.min(100, f.joy + 20); progress(f, 'jouer');
          const up = gainXp(f, rand(12, 20), i.guildId); const emb = rand(2, 6); f.embers += emb;
          return reply(`🎾 ${pick(['Vous jouez à cache-cache dans la cheminée', 'Ta flamme danse sur une musique', 'Vous faites une course d\'étincelles', 'Ta flamme fait des ronds de fumée'])} ! (+${emb} braises)${lvlMsg(up)}`);
        }
        case 'daily': {
          if (cd('daily', 22 * H)) return;
          const emb = Math.round(rand(40, 80) * cfg.rate / 100); f.embers += emb; f.items.bois = (f.items.bois || 0) + 3; f.items.charbon = (f.items.charbon || 0) + 1;
          return reply(`🎁 Cadeau du jour : **${emb} braises**, 3 ${ITEMS.bois}, 1 ${ITEMS.charbon}.`);
        }
        case 'coffre': {
          if (f.embers < 60) return i.reply(err('Il faut 60 braises pour ouvrir un coffre.'));
          f.embers -= 60; const loot = [];
          for (let k = 0; k < 3; k++) { const r = Math.random(); const it = r < 0.02 ? 'etoile' : r < 0.12 ? 'cristal' : r < 0.4 ? 'charbon' : r < 0.7 ? 'bois' : 'herbe'; const n = it === 'etoile' || it === 'cristal' ? 1 : rand(1, 3); f.items[it] = (f.items[it] || 0) + n; loot.push(`${n}× ${ITEMS[it]}`); }
          return reply(`🧰 Le coffre contient : ${loot.join(', ')} !`);
        }
        case 'cueillir': {
          if (cd('cueillir', 1 * H)) return;
          const b = rand(1, 3), h = rand(0, 2), c = Math.random() < 0.3 ? 1 : 0;
          f.items.bois = (f.items.bois || 0) + b; f.items.herbe = (f.items.herbe || 0) + h; f.items.charbon = (f.items.charbon || 0) + c; progress(f, 'cueillir');
          return reply(`🧺 Tu ramasses ${b}× ${ITEMS.bois}${h ? `, ${h}× ${ITEMS.herbe}` : ''}${c ? `, 1× ${ITEMS.charbon}` : ''}.`);
        }
        case 'souffle': {
          if (f.energy < 25) return i.reply(err('Pas assez d\'énergie.')); if (cd('souffle', 1 * H)) return;
          f.energy -= 25; const up = gainXp(f, rand(25, 40), i.guildId);
          return reply(`🌬️ ${f.name} crache une gerbe de feu impressionnante !${lvlMsg(up)}`);
        }
        case 'foyer': { if (cd('foyer', 3 * H)) return; f.energy = 100; f.food = Math.min(100, f.food + 10); return reply(`🏠 ${f.name} se repose au foyer. Énergie au max !`); }
        case 'quetes': {
          const q = quests(f); const done = q.list.every(x => x.n >= x.goal);
          let extra = q.list.map(x => `${x.n >= x.goal ? '✅' : '⬜'} ${x.label} (${x.n}/${x.goal})`).join('\n');
          if (done && !q.claimed) { q.claimed = true; f.embers += 100; f.items.cristal = (f.items.cristal || 0) + 1; extra += `\n\n🎉 Quêtes terminées : **+100 braises** et 1 ${ITEMS.cristal} !`; }
          else if (q.claimed) extra += '\n\n✅ Récompense déjà récupérée aujourd\'hui.';
          return reply(`📜 **Quêtes du jour**\n${extra}`);
        }
        case 'profil': return reply(`⚔️ Puissance : **${power(f)}**\nVictoires : **${f.wins}** · Défaites : **${f.losses}**`);
        case 'objets': return reply(`🎒 **Objets**\n${Object.entries(f.items).filter(([, n]) => n > 0).map(([k, n]) => `${n}× ${ITEMS[k] || k}`).join('\n') || 'Rien.'}`);
        case 'brasier': {
          if ((f.items.charbon || 0) < 5) return i.reply(err('Il te faut 5 charbons.'));
          f.items.charbon -= 5; const up = gainXp(f, 150, i.guildId);
          return reply(`🌋 Tu jettes 5 charbons dans le brasier : ${f.name} s'embrase !${lvlMsg(up)}`);
        }
        case 'expedition': {
          if (f.expedition) {
            if (f.expedition.end > Date.now()) return i.reply(err(`Ta flamme revient ${ts(f.expedition.end)}.`));
            const emb = Math.round(rand(60, 140) * cfg.rate / 100); f.embers += emb; f.items.bois = (f.items.bois || 0) + rand(2, 5); const cr = Math.random() < 0.35 ? 1 : 0; f.items.cristal = (f.items.cristal || 0) + cr;
            const up = gainXp(f, 60, i.guildId); f.expedition = null;
            return reply(`🗺️ ${f.name} revient d'expédition avec **${emb} braises**, du bois${cr ? ` et un ${ITEMS.cristal}` : ''} !${lvlMsg(up)}`);
          }
          if (f.energy < 40) return i.reply(err('Il faut 40 d\'énergie pour partir en expédition.'));
          f.energy -= 40; f.expedition = { end: Date.now() + 2 * H };
          addTimer('flammeExpe', i.guildId, f.expedition.end, { user: i.user.id, channel: i.channelId });
          return reply(`🗺️ ${f.name} part explorer les volcans… Retour ${ts(f.expedition.end)}. Refais \`/flamme expedition\` à son retour pour récupérer le butin.`);
        }
        case 'combat': {
          const u = i.options.getUser('membre'); const bet = i.options.getInteger('mise') || 0;
          if (u.id === i.user.id || u.bot) return i.reply(err('Adversaire invalide.'));
          const om = getMember(i.guildId, u.id); if (!om.flamme) return i.reply(err(`${u.username} n'a pas de flamme.`));
          const o = decay(om.flamme); if (o.frozen) return i.reply(err('Sa flamme est gelée.'));
          if (f.energy < 20) return i.reply(err('Ta flamme est trop fatiguée pour combattre.'));
          if (bet > f.embers || bet > o.embers) return i.reply(err('Un des deux n\'a pas assez de braises pour cette mise.'));
          if (cd('combat', 0.5 * H)) return;
          const storm = weather()[0].includes('Orage') ? 30 : 15;
          const a = power(f) + rand(0, storm), b = power(o) + rand(0, storm);
          const win = a >= b; f.energy -= 20;
          if (win) { f.wins++; o.losses++; f.embers += bet; o.embers -= bet; } else { f.losses++; o.wins++; f.embers -= bet; o.embers += bet; }
          const up = gainXp(f, win ? 30 : 10, i.guildId);
          saveMember(i.guildId, u.id, om); log(i.guildId, `${i.user.username} ${win ? 'bat' : 'perd contre'} ${u.username} (${bet} braises)`);
          return reply(`⚔️ **${f.name}** (${a}) contre **${o.name}** (${b})\n${win ? `🏆 Victoire ! ${bet ? `+${bet} braises` : ''}` : `💀 Défaite… ${bet ? `−${bet} braises` : ''}`}${lvlMsg(up)}`);
        }
      }
    },
  },
  {
    module: 'flamme',
    data: new SlashCommandBuilder().setName('flamme-admin').setDescription('Outils du jeu Flamme pour les propriétaires du bot.').setDefaultMemberPermissions(P.Administrator).setDMPermission(false)
      .addSubcommand(s => s.setName('journal').setDescription('Dernières actions du jeu'))
      .addSubcommand(s => s.setName('pieces').setDescription('Donner / retirer des braises').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o => o.setName('montant').setDescription('Montant (négatif pour retirer)').setRequired(true)))
      .addSubcommand(s => s.setName('reset').setDescription('Supprimer la flamme d\'un membre').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)))
      .addSubcommand(s => s.setName('bannir').setDescription('Bannir un membre du jeu').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)))
      .addSubcommand(s => s.setName('debannir').setDescription('Débannir un membre du jeu').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)))
      .addSubcommand(s => s.setName('degeler').setDescription('Dégeler la flamme d\'un membre').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)))
      .addSubcommand(s => s.setName('taux').setDescription('Changer le multiplicateur de gains').addIntegerOption(o => o.setName('pourcent').setDescription('Ex : 150 = +50 %').setRequired(true).setMinValue(10).setMaxValue(1000))),
    async run(i) {
      const sub = i.options.getSubcommand(); const u = i.options.getUser('membre');
      if (sub === 'journal') return i.reply({ embeds: [new EmbedBuilder().setColor(ORANGE).setTitle('📜 Journal Flamme').setDescription(kvGet('flammelog', i.guildId, []).slice(0, 20).join('\n') || 'Vide.')], ephemeral: true });
      if (sub === 'taux') { patchModule(i.guildId, 'flamme', { rate: i.options.getInteger('pourcent') }); return i.reply(ok(`Multiplicateur réglé à ${i.options.getInteger('pourcent')} %.`)); }
      if (sub === 'bannir' || sub === 'debannir') { const l = kvGet('flammeban', i.guildId, []).filter(x => x !== u.id); if (sub === 'bannir') l.push(u.id); kvSet('flammeban', i.guildId, l); return i.reply(ok(`${u} ${sub === 'bannir' ? 'est banni du' : 'peut de nouveau jouer au'} jeu Flamme.`)); }
      const m = getMember(i.guildId, u.id);
      if (sub === 'reset') { m.flamme = null; saveMember(i.guildId, u.id, m); return i.reply(ok(`Flamme de ${u} supprimée.`)); }
      if (!m.flamme) return i.reply(err(`${u.username} n'a pas de flamme.`));
      if (sub === 'pieces') { m.flamme.embers = Math.max(0, m.flamme.embers + i.options.getInteger('montant')); saveMember(i.guildId, u.id, m); return i.reply(ok(`${u} a maintenant ${m.flamme.embers} braises.`)); }
      if (sub === 'degeler') { Object.assign(m.flamme, { frozen: false, zeroSince: null, food: 50, tick: Date.now() }); saveMember(i.guildId, u.id, m); return i.reply(ok(`La flamme de ${u} est dégelée 🔥`)); }
    },
  },
];

export function register(client) {
  client.timerHandlers.set('flammeExpe', async (t) => {
    const ch = client.channels.cache.get(t.data.channel);
    if (ch) ch.send({ content: `<@${t.data.user}> 🗺️ Ta flamme est revenue d'expédition ! Fais \`/flamme expedition\` pour récupérer le butin.` }).catch(() => {});
  });
}
