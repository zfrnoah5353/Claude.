// 🔔 Mur de la honte : l'IA écrit un message de honte drôle pour un membre (depuis le panel, avec /honte,
// ou tout seul quand le membre reçoit une sanction). Même IA que le tribunal : gratuite sans clé, Claude avec ANTHROPIC_API_KEY.
import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { getConfig, kvGet, kvSet } from '../db.js';
import { err, ok, sendTo } from '../util.js';
import { askAI } from './proces.js';

const PINK = 0xE91E63;
export const TONES = {
  taquin: 'gentil et taquin, comme un pote qui chambre',
  moqueur: 'moqueur et piquant, plein d\'ironie',
  theatral: 'théâtral et solennel, comme un crieur public du Moyen Âge qui annonce la honte sur la place du village',
  sanspitie: 'sans pitié : un vrai « roast » bien salé, mais toujours drôle',
};
const TYPES = { warn: 'un avertissement', mute: 'un mute', kick: 'une expulsion du serveur', ban: 'un ban', tempban: 'un ban temporaire' };

const SYSTEM = `Tu écris des « messages de honte » humoristiques pour un serveur Discord francophone entre amis (le « Mur de la honte »).
Le but est de faire rire tout le monde, y compris la personne visée.
Règles strictes :
- Jamais d'insulte grossière, de propos haineux ni de moquerie sur le physique, l'origine, la religion, le genre, la sexualité, un handicap ou la famille.
- On se moque seulement de ce qu'il a fait (la raison donnée).
- N'invente pas de faits graves.
- Français simple, 2 à 5 phrases, quelques emojis, moins de 700 caractères.
- Réponds UNIQUEMENT avec le message, sans titre, sans guillemets, sans explication.
- Écris le pseudo tel qu'on te le donne (pas de mention @).`;

export async function generateShame(guild, { user, reason, tone, extra }) {
  const cfg = getConfig(guild.id).honte;
  const member = await guild.members.fetch(user).catch(() => null);
  const name = member?.displayName || (await guild.client.users.fetch(user).catch(() => null))?.username || 'ce membre';
  const t = TONES[tone || cfg.tone] || TONES.moqueur;
  const prompt = [`Pseudo : ${name}`, `Ce qu'il a fait : ${reason || 'rien de précis, invente une petite bêtise sans gravité'}`, `Ton : ${t}`,
    (extra || cfg.instructions) ? `Consignes en plus : ${extra || cfg.instructions}` : '', `Serveur : ${guild.name}`].filter(Boolean).join('\n');
  // L'IA gratuite (sans clé) n'accepte qu'environ une demande toutes les 15 s : on réessaie jusqu'à 3 fois
  let txt;
  for (let k = 0; ; k++) {
    try { txt = await askAI(SYSTEM, prompt); break; } catch (e) { if (k >= 3) throw e; await new Promise(r => setTimeout(r, 16000)); }
  }
  return txt.replace(/^["«\s]+|["»\s]+$/g, '').replace(/@(everyone|here)/g, '$1').slice(0, 1500);
}

export async function postShame(guild, { user, text, reason, by }) {
  const cfg = getConfig(guild.id).honte;
  if (!cfg.channel) throw new Error('Choisis d\'abord le salon du Mur de la honte dans le panel (module Mur de la honte).');
  const u = await guild.client.users.fetch(user).catch(() => null);
  if (!u) throw new Error('Membre introuvable.');
  const counts = kvGet('honteCount', guild.id, {}) || {}; counts[user] = (counts[user] || 0) + 1; kvSet('honteCount', guild.id, counts);
  const e = new EmbedBuilder().setColor(PINK).setTitle(`🔔 ${cfg.title || 'MUR DE LA HONTE'}`)
    .setDescription(`${text}\n\n🔔 *Honte ! Honte ! Honte !*`.slice(0, 4000))
    .setThumbnail(u.displayAvatarURL({ size: 256 }))
    .setFooter({ text: `${u.username} · ${counts[user]} passage(s) sur le mur${by ? ` · demandé par ${by}` : ''}` }).setTimestamp();
  if (reason) e.addFields({ name: 'Motif', value: reason.slice(0, 1000) });
  const m = await sendTo(guild, cfg.channel, { content: cfg.ping ? `<@${user}>` : undefined, embeds: [e], allowedMentions: { users: cfg.ping ? [user] : [] } });
  if (!m) throw new Error('Impossible d\'écrire dans le salon du Mur de la honte (le bot a-t-il le droit d\'y écrire ?).');
  if (cfg.react) for (const em of ['🔔', '🍅', '😂']) await m.react(em).catch(() => {});
  const log = kvGet('honteLog', guild.id, []) || [];
  log.unshift({ user, name: u.username, reason: reason || '', text, by: by || 'Auto', at: Date.now() });
  kvSet('honteLog', guild.id, log.slice(0, 30));
  return `Message de honte envoyé pour ${u.username} 🔔`;
}

const data = new SlashCommandBuilder().setName('honte').setDescription('🔔 Mettre quelqu\'un sur le Mur de la honte (message écrit par l\'IA)').setDMPermission(false)
  .addUserOption(o => o.setName('membre').setDescription('Qui mérite la honte ?').setRequired(true))
  .addStringOption(o => o.setName('raison').setDescription('Qu\'est-ce qu\'il a fait ?').setRequired(true).setMaxLength(300))
  .addStringOption(o => o.setName('ton').setDescription('Le style du message').addChoices(
    { name: 'Taquin', value: 'taquin' }, { name: 'Moqueur', value: 'moqueur' }, { name: 'Théâtral', value: 'theatral' }, { name: 'Sans pitié', value: 'sanspitie' }));

export const commands = [{
  module: 'honte', data, staff: true,
  async run(i) {
    const u = i.options.getUser('membre');
    if (u.bot) return i.reply(err('On ne fait pas honte aux bots 🤖'));
    const reason = i.options.getString('raison');
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const text = await generateShame(i.guild, { user: u.id, reason, tone: i.options.getString('ton') });
      return i.editReply(ok(await postShame(i.guild, { user: u.id, text, reason, by: i.member.displayName })));
    } catch (e) { return i.editReply(err(e.message)); }
  },
}];

export function register(client) {
  // Depuis le panel : générer (aperçu), envoyer, historique
  client.panelActions.set('honte.generate', (g, b) => { if (!b.user) throw new Error('Choisis un membre.'); return generateShame(g, b); });
  client.panelActions.set('honte.send', (g, b) => {
    if (!b.user || !String(b.text || '').trim()) throw new Error('Il manque le membre ou le message.');
    return postShame(g, { user: b.user, text: String(b.text).slice(0, 1500), reason: String(b.reason || '').slice(0, 300), by: 'le panel' });
  });
  client.panelActions.set('honte.history', (g) => kvGet('honteLog', g.id, []) || []);

  // Automatique : quand un membre est sanctionné (événement envoyé par modules/moderation.js)
  client.on('sanctionAdded', async (guild, { type, user, mod, reason }) => {
    const cfg = getConfig(guild.id).honte;
    if (!cfg?.enabled || !cfg.autoOnSanction || !cfg.channel || !TYPES[type] || user.bot) return;
    if (!mod && !cfg.autoMod) return; // sanctions de l'AutoMod : seulement si l'option est cochée
    try {
      const text = await generateShame(guild, { user: user.id, reason: `Il vient de recevoir ${TYPES[type]}. Raison : ${reason || 'aucune'}` });
      await postShame(guild, { user: user.id, text, reason: `${TYPES[type]} — ${reason || 'aucune raison'}` });
    } catch (e) { console.error('Mur de la honte :', e.message); }
  });
}
