import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits as P, MessageFlags } from 'discord.js';
import { getConfig, getMember, saveMember, allMembers, resetMembersField, ecoLog, ecoHistory, patchModule } from '../db.js';
import { ok, err, COLORS, money, rand, pick, ts, fmtDuration, isStaff } from '../util.js';

const M = 'economy';
function wallet(gid, uid) {
  const m = getMember(gid, uid);
  if (!m.ecoInit) { m.ecoInit = true; m.money += getConfig(gid).economy.startBalance; saveMember(gid, uid, m); }
  return m;
}
function addMoney(gid, uid, amount, reason) {
  const m = wallet(gid, uid); m.money = Math.max(0, m.money + amount); saveMember(gid, uid, m); ecoLog(gid, uid, amount, reason); return m;
}
function checkBet(i, bet) {
  const e = getConfig(i.guildId).economy;
  const m = wallet(i.guildId, i.user.id);
  if (bet <= 0) return 'La mise doit être positive.';
  if (e.maxBet > 0 && bet > e.maxBet) return `Mise max : ${money(i.guildId, e.maxBet)}.`;
  if (m.money < bet) return `Tu n'as que ${money(i.guildId, m.money)}.`;
  return null;
}
const E = (i, title, desc, color = COLORS.warn) => new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc).setFooter({ text: i.user.username, iconURL: i.user.displayAvatarURL() });
const betOpt = (o) => o.setName('mise').setDescription('Ta mise').setRequired(true).setMinValue(1);

// ---- Blackjack ----
const games = new Map();
const SUITS = ['♠', '♥', '♦', '♣']; const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const deck = () => { const d = []; for (const s of SUITS) for (const r of RANKS) d.push(r + s); return d.sort(() => Math.random() - 0.5); };
const val = (hand) => { let t = 0, a = 0; for (const c of hand) { const r = c.slice(0, -1); if (r === 'A') { a++; t += 11; } else t += ['J', 'Q', 'K'].includes(r) ? 10 : Number(r); } while (t > 21 && a--) t -= 10; return t; };
function bjEmbed(i, g, reveal, result) {
  return E(i, '🃏 Blackjack', `**Ta main :** ${g.player.join(' ')} (**${val(g.player)}**)\n**Croupier :** ${reveal ? `${g.dealer.join(' ')} (**${val(g.dealer)}**)` : `${g.dealer[0]} ❔`}\n**Mise :** ${money(i.guildId, g.bet)}${result ? `\n\n${result}` : ''}`, result ? (result.includes('gagnes') ? COLORS.ok : result.includes('Égalité') ? COLORS.info : COLORS.err) : COLORS.main);
}
const bjRow = (id, disabled = false) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`bj:hit:${id}`).setLabel('Tirer').setStyle(ButtonStyle.Primary).setDisabled(disabled),
  new ButtonBuilder().setCustomId(`bj:stand:${id}`).setLabel('Rester').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
);

// ---- Roulette ----
const RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

export const commands = [
  {
    module: M, data: new SlashCommandBuilder().setName('balance').setDescription('Affiche ton solde (ou celui d\'un membre) et ton rang.').setDMPermission(false).addUserOption(o => o.setName('membre').setDescription('Membre')),
    run: (i) => {
      const u = i.options.getUser('membre') || i.user; const m = wallet(i.guildId, u.id);
      const rank = allMembers(i.guildId).sort((a, b) => b.money - a.money).findIndex(x => x.id === u.id) + 1;
      i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warn).setAuthor({ name: u.username, iconURL: u.displayAvatarURL() }).setDescription(`💰 **Solde :** ${money(i.guildId, m.money)}\n🏆 **Rang :** #${rank}\n🔥 **Série daily :** ${m.streak} jour(s)`)] });
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('daily').setDescription('Récupère ta récompense du jour et garde ta série.').setDMPermission(false),
    run: (i) => {
      const e = getConfig(i.guildId).economy; const m = wallet(i.guildId, i.user.id);
      const since = Date.now() - m.lastDaily;
      if (since < 22 * 3600e3) return i.reply(err(`Reviens ${ts(m.lastDaily + 22 * 3600e3)}.`));
      m.streak = since < 48 * 3600e3 ? m.streak + 1 : 1;
      const bonus = Math.min(m.streak - 1, 10) * Math.round(e.dailyAmount * 0.1);
      m.money += e.dailyAmount + bonus; m.lastDaily = Date.now(); saveMember(i.guildId, i.user.id, m); ecoLog(i.guildId, i.user.id, e.dailyAmount + bonus, 'daily');
      i.reply({ embeds: [E(i, '📅 Récompense du jour', `Tu gagnes **${money(i.guildId, e.dailyAmount)}**${bonus ? ` + **${money(i.guildId, bonus)}** de bonus de série` : ''} !\n🔥 Série : **${m.streak}** jour(s)`, COLORS.ok)] });
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('weekly').setDescription('Récupère ta récompense de la semaine.').setDMPermission(false),
    run: (i) => {
      const e = getConfig(i.guildId).economy; const m = wallet(i.guildId, i.user.id);
      if (Date.now() - m.lastWeekly < 7 * 864e5) return i.reply(err(`Reviens ${ts(m.lastWeekly + 7 * 864e5)}.`));
      m.money += e.weeklyAmount; m.lastWeekly = Date.now(); saveMember(i.guildId, i.user.id, m); ecoLog(i.guildId, i.user.id, e.weeklyAmount, 'weekly');
      i.reply({ embeds: [E(i, '🗓️ Récompense de la semaine', `Tu gagnes **${money(i.guildId, e.weeklyAmount)}** !`, COLORS.ok)] });
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('work').setDescription('Travaille pour gagner un peu d\'argent.').setDMPermission(false),
    run: (i) => {
      const e = getConfig(i.guildId).economy; const m = wallet(i.guildId, i.user.id);
      const cd = e.workCooldown * 60e3;
      if (Date.now() - m.lastWork < cd) return i.reply(err(`Tu es fatigué… reviens ${ts(m.lastWork + cd)}.`));
      const gain = rand(e.workMin, Math.max(e.workMin, e.workMax));
      const job = pick(['as livré des pizzas 🍕', 'as codé un site web 💻', 'as promené des chiens 🐕', 'as fait un stream 🎥', 'as réparé un vélo 🚲', 'as vendu des glaces 🍦', 'as aidé un voisin à déménager 📦', 'as monté une vidéo TikTok 🎬']);
      m.money += gain; m.lastWork = Date.now(); saveMember(i.guildId, i.user.id, m); ecoLog(i.guildId, i.user.id, gain, 'work');
      i.reply({ embeds: [E(i, '💼 Travail', `Tu ${job} et gagnes **${money(i.guildId, gain)}** !`, COLORS.ok)] });
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('pay').setDescription('Envoie de l\'argent à un membre.').setDMPermission(false).addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)),
    run: (i) => {
      const u = i.options.getUser('membre'); const n = i.options.getInteger('montant');
      if (u.bot || u.id === i.user.id) return i.reply(err('Destinataire invalide.'));
      const m = wallet(i.guildId, i.user.id); if (m.money < n) return i.reply(err(`Tu n'as que ${money(i.guildId, m.money)}.`));
      addMoney(i.guildId, i.user.id, -n, `pay → ${u.id}`); addMoney(i.guildId, u.id, n, `pay ← ${i.user.id}`);
      i.reply(ok(`Tu as envoyé **${money(i.guildId, n)}** à ${u}.`));
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('rob').setDescription('Tente de voler une partie du solde d\'un membre.').setDMPermission(false).addUserOption(o => o.setName('membre').setDescription('Victime').setRequired(true)),
    run: (i) => {
      const e = getConfig(i.guildId).economy; if (!e.robEnabled) return i.reply(err('/rob est désactivé ici.'));
      const u = i.options.getUser('membre'); if (u.bot || u.id === i.user.id) return i.reply(err('Cible invalide.'));
      const me = wallet(i.guildId, i.user.id); const v = wallet(i.guildId, u.id);
      if (Date.now() - me.lastRob < 2 * 3600e3) return i.reply(err(`La police te surveille… réessaie ${ts(me.lastRob + 2 * 3600e3)}.`));
      if (v.money < 50) return i.reply(err(`${u.username} est trop pauvre, ça ne vaut pas le coup.`));
      me.lastRob = Date.now(); saveMember(i.guildId, i.user.id, me);
      if (Math.random() * 100 < e.robChance) {
        const n = Math.max(1, Math.floor(v.money * (rand(10, 30) / 100)));
        addMoney(i.guildId, u.id, -n, `volé par ${i.user.id}`); addMoney(i.guildId, i.user.id, n, `vol ${u.id}`);
        return i.reply({ embeds: [E(i, '🦹 Vol réussi', `Tu as volé **${money(i.guildId, n)}** à ${u} !`, COLORS.ok)] });
      }
      const fine = Math.min(me.money, Math.floor(me.money * 0.15) + 25);
      addMoney(i.guildId, i.user.id, -fine, 'amende vol');
      i.reply({ embeds: [E(i, '🚓 Pris la main dans le sac', `Tu payes une amende de **${money(i.guildId, fine)}**.`, COLORS.err)] });
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('coinflip').setDescription('Pile ou face : double (presque) ta mise.').setDMPermission(false).addIntegerOption(betOpt).addStringOption(o => o.setName('choix').setDescription('Pile ou face').setRequired(true).addChoices({ name: 'Pile', value: 'pile' }, { name: 'Face', value: 'face' })),
    run: (i) => {
      const bet = i.options.getInteger('mise'); const pb = checkBet(i, bet); if (pb) return i.reply(err(pb));
      const res = Math.random() < 0.5 ? 'pile' : 'face'; const win = res === i.options.getString('choix');
      const gain = win ? Math.floor(bet * 0.95) : -bet;
      const m = addMoney(i.guildId, i.user.id, gain, 'coinflip');
      i.reply({ embeds: [E(i, '🪙 Pile ou face', `C'est **${res}** ! ${win ? `Tu gagnes **${money(i.guildId, gain)}** 🎉` : `Tu perds **${money(i.guildId, bet)}** 😢`}\nSolde : ${money(i.guildId, m.money)}`, win ? COLORS.ok : COLORS.err)] });
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('slots').setDescription('Machine à sous à trois rouleaux.').setDMPermission(false).addIntegerOption(betOpt),
    run: (i) => {
      const bet = i.options.getInteger('mise'); const pb = checkBet(i, bet); if (pb) return i.reply(err(pb));
      const sym = ['🍒', '🍋', '🍊', '🍇', '🔔', '⭐', '💎', '7️⃣']; const w = [30, 25, 20, 12, 6, 4, 2, 1];
      const spin = () => { let r = Math.random() * 100; for (let k = 0; k < sym.length; k++) { r -= w[k]; if (r <= 0) return sym[k]; } return sym[0]; };
      const reel = [spin(), spin(), spin()];
      const mult = { '🍒': 3, '🍋': 4, '🍊': 5, '🍇': 8, '🔔': 15, '⭐': 25, '💎': 50, '7️⃣': 100 };
      let gain = -bet;
      if (reel[0] === reel[1] && reel[1] === reel[2]) gain = bet * mult[reel[0]];
      else if (reel[0] === reel[1] || reel[1] === reel[2] || reel[0] === reel[2]) gain = Math.floor(bet * 0.5);
      const m = addMoney(i.guildId, i.user.id, gain, 'slots');
      i.reply({ embeds: [E(i, '🎰 Machine à sous', `**[ ${reel.join(' | ')} ]**\n\n${gain > 0 ? `Tu gagnes **${money(i.guildId, gain)}** 🎉` : `Tu perds **${money(i.guildId, bet)}**`}\nSolde : ${money(i.guildId, m.money)}`, gain > 0 ? COLORS.ok : COLORS.err)] });
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('roulette').setDescription('Roulette européenne : couleur, parité, moitié, douzaine ou numéro.').setDMPermission(false).addIntegerOption(betOpt)
      .addStringOption(o => o.setName('pari').setDescription('Ton pari').setRequired(true).addChoices(
        { name: 'Rouge (x2)', value: 'rouge' }, { name: 'Noir (x2)', value: 'noir' }, { name: 'Pair (x2)', value: 'pair' }, { name: 'Impair (x2)', value: 'impair' },
        { name: '1-18 (x2)', value: 'manque' }, { name: '19-36 (x2)', value: 'passe' }, { name: '1re douzaine (x3)', value: 'd1' }, { name: '2e douzaine (x3)', value: 'd2' }, { name: '3e douzaine (x3)', value: 'd3' }, { name: 'Numéro (x36)', value: 'numero' }))
      .addIntegerOption(o => o.setName('numero').setDescription('Numéro (0-36) si pari = Numéro').setMinValue(0).setMaxValue(36)),
    run: (i) => {
      const bet = i.options.getInteger('mise'); const pb = checkBet(i, bet); if (pb) return i.reply(err(pb));
      const p = i.options.getString('pari'); const num = i.options.getInteger('numero');
      if (p === 'numero' && num === null) return i.reply(err('Indique le numéro.'));
      const r = rand(0, 36); const red = RED.includes(r);
      const wins = { rouge: r && red, noir: r && !red, pair: r && r % 2 === 0, impair: r % 2 === 1, manque: r >= 1 && r <= 18, passe: r >= 19, d1: r >= 1 && r <= 12, d2: r >= 13 && r <= 24, d3: r >= 25, numero: r === num };
      const mult = p === 'numero' ? 35 : p.startsWith('d') ? 2 : 1;
      const gain = wins[p] ? bet * mult : -bet;
      const m = addMoney(i.guildId, i.user.id, gain, 'roulette');
      i.reply({ embeds: [E(i, '🎡 Roulette', `La bille tombe sur **${r}** ${r === 0 ? '🟢' : red ? '🔴' : '⚫'}\n\n${gain > 0 ? `Tu gagnes **${money(i.guildId, gain)}** 🎉` : `Tu perds **${money(i.guildId, bet)}**`}\nSolde : ${money(i.guildId, m.money)}`, gain > 0 ? COLORS.ok : COLORS.err)] });
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('blackjack').setDescription('Une partie de blackjack contre le croupier.').setDMPermission(false).addIntegerOption(betOpt),
    run: async (i) => {
      const bet = i.options.getInteger('mise'); const pb = checkBet(i, bet); if (pb) return i.reply(err(pb));
      addMoney(i.guildId, i.user.id, -bet, 'blackjack mise');
      const d = deck(); const g = { deck: d, player: [d.pop(), d.pop()], dealer: [d.pop(), d.pop()], bet, user: i.user.id, guild: i.guildId };
      const id = `${i.user.id}${Date.now()}`; games.set(id, g); setTimeout(() => games.delete(id), 10 * 60e3);
      if (val(g.player) === 21) { games.delete(id); const win = Math.floor(bet * 2.5); addMoney(i.guildId, i.user.id, win, 'blackjack'); return i.reply({ embeds: [bjEmbed(i, g, true, `🂡 **Blackjack !** Tu gagnes ${money(i.guildId, win - bet)}`)] }); }
      i.reply({ embeds: [bjEmbed(i, g, false)], components: [bjRow(id)] });
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('shop').setDescription('Boutique du serveur : parcourir ou acheter.').setDMPermission(false)
      .addSubcommand(s => s.setName('view').setDescription('Voir la boutique'))
      .addSubcommand(s => s.setName('buy').setDescription('Acheter un objet').addStringOption(o => o.setName('objet').setDescription('Objet').setRequired(true).setAutocomplete(true)).addIntegerOption(o => o.setName('quantite').setDescription('Quantité').setMinValue(1))),
    autocomplete: (i) => { const q = i.options.getFocused().toLowerCase(); i.respond(getConfig(i.guildId).economy.shop.filter(x => x.name?.toLowerCase().includes(q)).slice(0, 25).map(x => ({ name: `${x.name} (${x.price})`, value: x.name }))); },
    run: (i) => {
      const e = getConfig(i.guildId).economy;
      if (i.options.getSubcommand() === 'view') return i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warn).setTitle('🛒 Boutique').setDescription(e.shop.map(x => `**${x.name}** — ${money(i.guildId, x.price)}${x.stock >= 0 ? ` · stock ${x.stock}` : ''}${x.role ? ` · donne <@&${x.role}>` : ''}\n${x.description || ''}`).join('\n\n') || 'La boutique est vide (ajoute des objets dans le panel).')] });
      const name = i.options.getString('objet'); const q = i.options.getInteger('quantite') || 1;
      const idx = e.shop.findIndex(x => x.name?.toLowerCase() === name.toLowerCase()); const item = e.shop[idx];
      if (!item) return i.reply(err('Objet introuvable.'));
      if (item.stock >= 0 && item.stock < q) return i.reply(err('Plus assez de stock.'));
      const m = wallet(i.guildId, i.user.id); const cost = item.price * q;
      if (m.money < cost) return i.reply(err(`Il te faut ${money(i.guildId, cost)}.`));
      m.money -= cost; m.inv[item.name] = (m.inv[item.name] || 0) + q; saveMember(i.guildId, i.user.id, m); ecoLog(i.guildId, i.user.id, -cost, `achat ${item.name}`);
      if (item.stock >= 0) { e.shop[idx].stock -= q; patchModule(i.guildId, 'economy', { shop: e.shop }); }
      i.reply(ok(`Tu as acheté **${q}× ${item.name}** pour ${money(i.guildId, cost)}. Utilise-le avec \`/use\`.`));
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('inventory').setDescription('Affiche ton inventaire (ou celui d\'un membre).').setDMPermission(false).addUserOption(o => o.setName('membre').setDescription('Membre')),
    run: (i) => {
      const u = i.options.getUser('membre') || i.user; const m = wallet(i.guildId, u.id);
      const items = Object.entries(m.inv).filter(([, n]) => n > 0);
      i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warn).setTitle(`🎒 Inventaire de ${u.username}`).setDescription(items.map(([k, n]) => `**${n}×** ${k}`).join('\n') || 'Vide.')] });
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('use').setDescription('Utilise un objet de ton inventaire.').setDMPermission(false).addStringOption(o => o.setName('objet').setDescription('Objet').setRequired(true).setAutocomplete(true)),
    autocomplete: (i) => { const m = getMember(i.guildId, i.user.id); const q = i.options.getFocused().toLowerCase(); i.respond(Object.entries(m.inv).filter(([k, n]) => n > 0 && k.toLowerCase().includes(q)).slice(0, 25).map(([k, n]) => ({ name: `${k} (${n})`, value: k }))); },
    run: async (i) => {
      const name = i.options.getString('objet'); const m = wallet(i.guildId, i.user.id);
      const key = Object.keys(m.inv).find(k => k.toLowerCase() === name.toLowerCase());
      if (!key || m.inv[key] <= 0) return i.reply(err('Tu n\'as pas cet objet.'));
      const item = getConfig(i.guildId).economy.shop.find(x => x.name === key);
      m.inv[key]--; saveMember(i.guildId, i.user.id, m);
      if (item?.role) { await i.member.roles.add(item.role, 'Objet de la boutique').catch(() => {}); return i.reply(ok(`Tu as utilisé **${key}** et reçu le rôle <@&${item.role}> !`)); }
      i.reply(ok(`Tu as utilisé **${key}** !`));
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('leaderboard').setDescription('Classement des membres les plus riches du serveur.').setDMPermission(false).addIntegerOption(o => o.setName('page').setDescription('Page').setMinValue(1)),
    run: (i) => {
      const page = (i.options.getInteger('page') || 1) - 1;
      const lb = allMembers(i.guildId).filter(m => m.money > 0).sort((a, b) => b.money - a.money);
      const medals = ['🥇', '🥈', '🥉'];
      i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.warn).setTitle(`🏆 Les plus riches (page ${page + 1}/${Math.max(1, Math.ceil(lb.length / 10))})`).setDescription(lb.slice(page * 10, page * 10 + 10).map((m, k) => `${medals[page * 10 + k] || `**${page * 10 + k + 1}.**`} <@${m.id}> — ${money(i.guildId, m.money)}`).join('\n') || 'Personne.')] });
    },
  },
  {
    module: M, data: new SlashCommandBuilder().setName('eco').setDescription('Administration de l\'économie du serveur.').setDMPermission(false).setDefaultMemberPermissions(P.ManageGuild)
      .addSubcommand(s => s.setName('add').setDescription('Ajouter de l\'argent').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('remove').setDescription('Retirer de l\'argent').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(1)))
      .addSubcommand(s => s.setName('set').setDescription('Définir le solde').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addIntegerOption(o => o.setName('montant').setDescription('Montant').setRequired(true).setMinValue(0)))
      .addSubcommand(s => s.setName('reset').setDescription('Remettre à zéro un membre').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)))
      .addSubcommand(s => s.setName('reset-all').setDescription('Remettre à zéro TOUT le serveur'))
      .addSubcommand(s => s.setName('history').setDescription('Historique d\'un membre').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)))
      .addSubcommand(s => s.setName('give-item').setDescription('Donner un objet').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o => o.setName('objet').setDescription('Objet').setRequired(true)).addIntegerOption(o => o.setName('quantite').setDescription('Quantité').setMinValue(1))),
    run: async (i) => {
      if (!isStaff(i.member)) return i.reply(err('Réservé au staff.'));
      const sub = i.options.getSubcommand(); const u = i.options.getUser('membre'); const n = i.options.getInteger('montant');
      if (sub === 'add') { const m = addMoney(i.guildId, u.id, n, `admin +${i.user.id}`); return i.reply(ok(`${u} a maintenant ${money(i.guildId, m.money)}.`)); }
      if (sub === 'remove') { const m = addMoney(i.guildId, u.id, -n, `admin -${i.user.id}`); return i.reply(ok(`${u} a maintenant ${money(i.guildId, m.money)}.`)); }
      if (sub === 'set') { const m = wallet(i.guildId, u.id); ecoLog(i.guildId, u.id, n - m.money, 'admin set'); m.money = n; saveMember(i.guildId, u.id, m); return i.reply(ok(`${u} a maintenant ${money(i.guildId, n)}.`)); }
      if (sub === 'reset') { const m = getMember(i.guildId, u.id); Object.assign(m, { money: 0, inv: {}, streak: 0, lastDaily: 0, lastWeekly: 0, lastWork: 0, ecoInit: true }); saveMember(i.guildId, u.id, m); return i.reply(ok(`Économie de ${u} remise à zéro.`)); }
      if (sub === 'reset-all') {
        if (i.user.id !== i.guild.ownerId) return i.reply(err('Seul le propriétaire du serveur peut faire ça.'));
        resetMembersField(i.guildId, { money: 0, inv: {}, streak: 0, lastDaily: 0, lastWeekly: 0, lastWork: 0, ecoInit: true });
        return i.reply(ok('Toute l\'économie du serveur a été remise à zéro.'));
      }
      if (sub === 'history') { const h = ecoHistory(i.guildId, u.id); return i.reply({ embeds: [new EmbedBuilder().setColor(COLORS.info).setTitle(`📜 Historique de ${u.username}`).setDescription(h.map(x => `${x.amount >= 0 ? '🟢 +' : '🔴 '}${money(i.guildId, x.amount)} · ${x.reason} · ${ts(x.created)}`).join('\n') || 'Rien.')], flags: MessageFlags.Ephemeral }); }
      if (sub === 'give-item') { const name = i.options.getString('objet'); const q = i.options.getInteger('quantite') || 1; const m = wallet(i.guildId, u.id); m.inv[name] = (m.inv[name] || 0) + q; saveMember(i.guildId, u.id, m); return i.reply(ok(`${q}× **${name}** donné(s) à ${u}.`)); }
    },
  },
];

export function register(client) {
  client.components.set('bj', async (i, action, id) => {
    const g = games.get(id);
    if (!g) return i.reply({ content: 'Partie expirée.', flags: MessageFlags.Ephemeral });
    if (g.user !== i.user.id) return i.reply({ content: 'Ce n\'est pas ta partie !', flags: MessageFlags.Ephemeral });
    if (action === 'hit') {
      g.player.push(g.deck.pop());
      if (val(g.player) > 21) { games.delete(id); return i.update({ embeds: [bjEmbed(i, g, true, `💥 Tu dépasses 21, tu perds ${money(g.guild, g.bet)}.`)], components: [bjRow(id, true)] }); }
      if (val(g.player) === 21) action = 'stand'; else return i.update({ embeds: [bjEmbed(i, g, false)], components: [bjRow(id)] });
    }
    if (action === 'stand') {
      games.delete(id);
      while (val(g.dealer) < 17) g.dealer.push(g.deck.pop());
      const p = val(g.player), d = val(g.dealer);
      let res;
      if (d > 21 || p > d) { addMoney(g.guild, g.user, g.bet * 2, 'blackjack'); res = `🎉 Tu gagnes ${money(g.guild, g.bet)} !`; }
      else if (p === d) { addMoney(g.guild, g.user, g.bet, 'blackjack égalité'); res = '🤝 Égalité, tu récupères ta mise.'; }
      else res = `😢 Le croupier gagne, tu perds ${money(g.guild, g.bet)}.`;
      return i.update({ embeds: [bjEmbed(i, g, true, res)], components: [bjRow(id, true)] });
    }
  });
}
export { fmtDuration };
