// 🛟 Surveillance : prévient quand MonBot s'arrête ou revient après une coupure.
//  - À l'arrêt (mise à jour, redémarrage, panne propre) : message privé à l'owner.
//  - Au retour après une vraie coupure (> 2 min 30) : MP à l'owner + message dans #annonces.
// Un « battement » est écrit toutes les minutes dans la base ; au démarrage, l'écart avec le
// dernier battement dit combien de temps le bot est resté coupé.
import { Events } from 'discord.js';
import { kvGet, kvSet } from '../db.js';

const API = 'https://discord.com/api/v10';
const OUTAGE = 150e3;             // au-delà de 2 min 30 sans battement : vraie coupure
const ANNONCE_COOLDOWN = 15 * 60e3; // pas plus d'un message #annonces par quart d'heure

async function dapi(path, init = {}) {
  const r = await fetch(API + path, { ...init, headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}`, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${init.method || 'GET'} ${path} : ${r.status}`);
  return r.status === 204 ? null : r.json();
}
const envoyer = (chanId, content) => dapi(`/channels/${chanId}/messages`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
});

async function premierServeur() {
  const [g] = await dapi('/users/@me/guilds');
  return g?.id || null;
}
async function mpOwner(content) {
  const gid = await premierServeur(); if (!gid) return;
  const guild = await dapi(`/guilds/${gid}`);
  const dm = await dapi('/users/@me/channels', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipient_id: guild.owner_id }) });
  await envoyer(dm.id, content);
}
async function annonce(content) {
  const gid = await premierServeur(); if (!gid) return;
  const ch = (await dapi(`/guilds/${gid}/channels`)).find(c => c.type === 0 && /annonce/i.test(c.name));
  if (ch) await envoyer(ch.id, content);
}

function duree(ms) {
  const m = Math.round(ms / 60e3);
  if (m < 60) return `${m} minute${m > 1 ? 's' : ''}`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} h${r ? ` ${r} min` : ''}`;
}

export function setup(client) {
  const battre = () => { try { kvSet('veille', 'beat', Date.now()); } catch {} };

  client.once(Events.ClientReady, async () => {
    const prev = kvGet('veille', 'beat', 0);
    battre();
    setInterval(battre, 60e3);
    const down = prev ? Date.now() - prev : 0;
    if (prev && down > OUTAGE) {
      await mpOwner(`✅ **MonBot est de retour en ligne.**\nIl est resté coupé environ **${duree(down)}**. Tout refonctionne normalement.`).catch(e => console.error('Veille MP :', e.message));
      const last = kvGet('veille', 'lastAnnonce', 0);
      if (Date.now() - last > ANNONCE_COOLDOWN) {
        await annonce(`✅ **MonBot est de retour en ligne !**\nPetite coupure d'environ **${duree(down)}**, tout remarche. Merci de votre patience 🙏`).catch(e => console.error('Veille annonce :', e.message));
        kvSet('veille', 'lastAnnonce', Date.now());
      }
    }
  });

}
