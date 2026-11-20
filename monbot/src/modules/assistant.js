// 🤖 Assistant IA : répond
//  - en message privé à MonBot,
//  - dans le salon #🤖・parler-à-monbot (créé tout seul s'il n'existe pas),
//  - quand on mentionne @MonBot,
//  - dans les tickets, au membre qui l'a ouvert, jusqu'à ce que le staff prenne le relais.
// Sans clé : IA gratuite de Pollinations (sans compte). Avec ANTHROPIC_API_KEY : Claude Haiku.
import { Events, ChannelType } from 'discord.js';
import Anthropic from '@anthropic-ai/sdk';
import { getTicket, saveTicket, isTicketStaff } from './tickets.js';
import { kvGet, kvSet } from '../db.js';

export const SALON_IA = '🤖・parler-à-monbot';
const ANCIEN_SALON = '🤖・parler-à-claude';
const MODEL = 'claude-haiku-5-5';
const PAR_JOUR = 60;          // messages IA par membre et par jour (sauf le propriétaire du serveur)
const PAUSE_MS = 4000;         // délai minimum entre deux questions d'un même membre

let ai = null;
const derniers = new Map();    // userId -> horodatage de la dernière question

const SYSTEM = `Tu es MonBot, l'assistant du serveur Discord francophone « les100paspied » (jeux Roblox : Fisch, Steal a Brainrot ; trades, giveaways, mini-jeux).
Tu parles en français, de façon simple, sympa et directe, comme sur Discord. Réponses courtes : quelques phrases, des puces si utile, jamais plus de 1800 caractères. Pas de tableau.
Le bot a des commandes slash : /help liste tout. Tickets pour le support, /flamme (jeu de flamme), /jeu, /tupreferes, /sondage, giveaways, niveaux, économie.
Dans un ticket, tu fais le premier niveau de support : tu aides à décrire le problème et tu donnes les premières réponses ; pour une sanction, un remboursement, une arnaque ou une décision, tu dis qu'un membre du staff va prendre le relais.
Tu ne prétends jamais être un humain ni faire des actions que tu ne peux pas faire (bannir, donner des objets, modifier des rôles…).`;

function quota(userId, ownerId) {
  if (userId === ownerId) return true;
  const jour = new Date().toISOString().slice(0, 10);
  const q = kvGet('ia-quota', userId, { jour, n: 0 });
  if (q.jour !== jour) { q.jour = jour; q.n = 0; }
  if (q.n >= PAR_JOUR) return false;
  q.n++; kvSet('ia-quota', userId, q);
  return true;
}

// Les derniers messages du salon, pour que l'IA suive la conversation.
async function historique(m) {
  const msgs = [...(await m.channel.messages.fetch({ limit: 16, before: m.id }).catch(() => new Map())).values()].reverse();
  return msgs.filter(x => x.content || x.attachments.size).map(x => {
    const qui = x.author.id === m.client.user.id ? 'MonBot (toi)' : (x.member?.displayName || x.author.username);
    const pj = [...x.attachments.values()].map(a => ` [pièce jointe : ${a.name}]`).join('');
    return `${qui} : ${(x.content || '').slice(0, 800)}${pj}`;
  }).join('\n');
}

// IA gratuite, sans compte ni clé (Pollinations)
async function iaGratuite(texte) {
  const r = await fetch('https://text.pollinations.ai/openai', {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(90e3),
    body: JSON.stringify({ model: 'openai', messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: texte }] }),
  });
  if (!r.ok) throw new Error(`IA gratuite : ${r.status}`);
  return (await r.json())?.choices?.[0]?.message?.content?.trim();
}

const nettoie = (m) => m.content.replace(new RegExp(`<@!?${m.client.user.id}>`, 'g'), '@MonBot').trim();

async function repondre(m, contexte) {
  const now = Date.now();
  if (now - (derniers.get(m.author.id) || 0) < PAUSE_MS) return;
  derniers.set(m.author.id, now);
  const ownerId = m.guild?.ownerId ?? m.client.guilds.cache.first()?.ownerId;
  if (!quota(m.author.id, ownerId)) return m.reply(`🤖 Tu as atteint la limite de ${PAR_JOUR} messages à l'IA pour aujourd'hui. Reviens demain !`).catch(() => {});

  await m.channel.sendTyping().catch(() => {});
  const typing = setInterval(() => m.channel.sendTyping().catch(() => {}), 8000);
  try {
    const hist = await historique(m);
    const nom = m.member?.displayName || m.author.username;
    const texte = [
      `Où : ${contexte}.`,
      hist ? `Messages précédents :\n${hist}` : 'Pas de messages précédents.',
      `\nNouveau message de ${nom} (à qui tu réponds) :\n${nettoie(m) || '(message vide)'}`,
      ...[...m.attachments.values()].map(a => `[pièce jointe : ${a.name}]`),
    ].join('\n');

    let rep;
    if (process.env.ANTHROPIC_API_KEY) {
      ai ??= new Anthropic();
      const r = await ai.messages.create({
        model: MODEL, max_tokens: 2000,
        output_config: { effort: 'low' },
        system: SYSTEM,
        messages: [{ role: 'user', content: texte }],
      });
      if (r.stop_reason === 'refusal') return m.reply('🤖 Je ne peux pas répondre à ça, désolé.').catch(() => {});
      rep = r.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    } else {
      rep = await iaGratuite(texte);
    }
    rep ||= '🤖 …';
    // Discord : 2000 caractères max par message
    const morceaux = rep.match(/[\s\S]{1,1990}(?=\n|$)|[\s\S]{1,1990}/g) || [rep];
    let first = true;
    for (const part of morceaux) {
      if (first) await m.reply({ content: part, allowedMentions: { repliedUser: false, parse: [] } }); else await m.channel.send({ content: part, allowedMentions: { parse: [] } });
      first = false;
    }
  } catch (e) {
    const msg = e instanceof Anthropic.RateLimitError ? 'Trop de questions en même temps, réessaie dans une minute.'
      : e instanceof Anthropic.AuthenticationError ? 'La clé de l\'IA est invalide.'
      : e instanceof Anthropic.APIError ? 'L\'IA ne répond pas pour l\'instant, réessaie plus tard.'
      : 'L\'IA ne répond pas pour l\'instant, réessaie dans une minute.';
    console.error('Assistant IA :', e?.message || e);
    await m.reply(`🤖 ${msg}`).catch(() => {});
  } finally { clearInterval(typing); }
}

// Crée le salon de l'IA s'il n'existe pas (dans la même catégorie que #💬・général si possible).
async function salonIA(guild) {
  await guild.channels.fetch().catch(() => {});
  if (guild.channels.cache.some(c => c.name === SALON_IA)) return;
  const ancien = guild.channels.cache.find(c => c.name === ANCIEN_SALON);
  if (ancien) return ancien.edit({ name: SALON_IA, topic: 'Pose tes questions à MonBot : il te répond avec l\'IA. /help pour les commandes.' }).catch(e => console.error('Salon IA :', e.message));
  const general = guild.channels.cache.find(c => c.name === '💬・général');
  await guild.channels.create({
    name: SALON_IA, type: ChannelType.GuildText, parent: general?.parentId ?? null,
    topic: 'Pose tes questions à MonBot : il te répond avec l\'IA. /help pour les commandes.',
    rateLimitPerUser: 5, reason: 'Salon de l\'assistant IA',
  }).then(c => console.log(`✅ Salon ${c.name} créé.`)).catch(e => console.error('Salon IA :', e.message));
}

export function setup(client) {
  client.once(Events.ClientReady, async (c) => { for (const g of c.guilds.cache.values()) await salonIA(g); });

  client.on(Events.MessageCreate, async (m) => {
    if (m.author.bot || m.system) return;

    // Message privé
    if (!m.guild) return repondre(m, 'message privé avec MonBot');

    // Ticket : l'IA aide le membre tant que le staff n'a pas pris le relais
    const t = getTicket(m.channelId);
    if (t && !t.closed) {
      if (t.claimedBy || t.iaOff) return;
      if (m.member && isTicketStaff(m.member, t)) { t.iaOff = true; saveTicket(m.channelId, t); return; }
      if (m.author.id === t.owner) return repondre(m, `ticket de support #${m.channel.name}`);
      return;
    }

    // Salon de l'IA, ou mention de @MonBot ailleurs
    if (m.channel.name === SALON_IA) return repondre(m, `salon #${SALON_IA}`);
    if (m.mentions.users.has(client.user.id) && !m.mentions.everyone) return repondre(m, `salon #${m.channel.name}`);
  });
}

