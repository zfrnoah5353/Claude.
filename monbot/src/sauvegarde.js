// Démarrage en ligne (Render, offre gratuite).
// - Le disque de Render est effacé à chaque redémarrage : la base data.db est donc sauvegardée
//   dans le salon caché #monbot-sauvegarde du serveur, et récupérée au démarrage.
// - L'offre gratuite endort le service après 15 min sans visite : le bot visite sa propre adresse.
import { readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';

const API = 'https://discord.com/api/v10';
const TOKEN = () => process.env.DISCORD_TOKEN;
const DB_PATH = process.env.DB_PATH || 'data.db';
const CHANNEL = 'monbot-sauvegarde';
const FILE = 'data.db';

async function discord(path, init = {}) {
  for (let essai = 0; essai < 5; essai++) {
    const res = await fetch(API + path, { ...init, headers: { Authorization: `Bot ${TOKEN()}`, ...(init.headers || {}) } });
    if (res.status === 429) { await new Promise(r => setTimeout(r, (Number(res.headers.get('retry-after')) || 2) * 1000)); continue; }
    if (!res.ok) throw new Error(`Discord ${init.method || 'GET'} ${path} : ${res.status} ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  }
  throw new Error('Discord : trop de limites de débit');
}

// MP à l'owner quand le bot s'arrête (appelé depuis cloud.js, qui attend la fin avant de quitter).
export async function prevenirArret(sig) {
  const [g] = await discord('/users/@me/guilds');
  if (!g) return;
  const guild = await discord(`/guilds/${g.id}`);
  const dm = await discord('/users/@me/channels', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipient_id: guild.owner_id }) });
  await discord(`/channels/${dm.id}/messages`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: `⚠️ **MonBot va se couper** (${sig}).\nC'est généralement une mise à jour ou un redémarrage. Je te préviens dès qu'il est de retour.` }),
  });
}

// Le salon de sauvegarde, caché à tout le monde sauf au bot (créé s'il n'existe pas).
let salon = null;
async function getSalon(create) {
  if (salon) return salon;
  const me = await discord('/users/@me');
  for (const g of await discord('/users/@me/guilds')) {
    const found = (await discord(`/guilds/${g.id}/channels`)).find(c => c.name === CHANNEL && c.type === 0);
    if (found) return (salon = { id: found.id, me: me.id });
  }
  if (!create) return null;
  const [g] = await discord('/users/@me/guilds');
  if (!g) return null;
  const c = await discord(`/guilds/${g.id}/channels`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: CHANNEL, type: 0, topic: 'Sauvegarde automatique de MonBot. Ne pas supprimer.',
      permission_overwrites: [
        { id: g.id, type: 0, deny: String(1n << 10n) },                       // @everyone : ne voit pas
        { id: me.id, type: 1, allow: String((1n << 10n) | (1n << 11n) | (1n << 15n) | (1n << 16n)) }, // le bot : voit, écrit, fichiers, historique
      ],
    }),
  });
  return (salon = { id: c.id, me: me.id });
}

async function derniereSauvegarde(s) {
  const msgs = await discord(`/channels/${s.id}/messages?limit=20`);
  return msgs.find(m => m.author?.id === s.me && m.attachments?.some(a => a.filename === FILE));
}

export async function restaurer() {
  const s = await getSalon(false);
  const m = s && await derniereSauvegarde(s);
  if (!m) { console.log('ℹ️ Aucune sauvegarde trouvée : base neuve.'); return; }
  const a = m.attachments.find(x => x.filename === FILE);
  const buf = Buffer.from(await (await fetch(a.url)).arrayBuffer());
  for (const ext of ['', '-wal', '-shm']) await rm(DB_PATH + ext, { force: true });
  await writeFile(DB_PATH, buf);
  dernierHash = empreinte(buf);
  console.log(`✅ Base restaurée depuis la sauvegarde du ${new Date(m.edited_timestamp || m.timestamp).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })} (${Math.round(buf.length / 1024)} Ko).`);
}

// Un seul message de sauvegarde, modifié à chaque fois (pas de nouveau message = pas de notification),
// et seulement si la base a changé depuis la dernière sauvegarde.
let dernierHash = null;
const empreinte = (buf) => createHash('sha256').update(buf).digest('hex');
export async function sauvegarder(db) {
  const snap = '/tmp/monbot-snap.db';
  await rm(snap, { force: true });
  db.exec(`VACUUM INTO '${snap}'`); // copie cohérente même pendant que le bot écrit
  const data = await readFile(snap);
  const h = empreinte(data);
  if (h === dernierHash) return false;
  const s = await getSalon(true);
  const avant = await derniereSauvegarde(s);
  const form = new FormData();
  form.append('payload_json', JSON.stringify({ content: `💾 Sauvegarde automatique · <t:${Math.floor(Date.now() / 1000)}:f>`, attachments: [{ id: 0, filename: FILE }] }));
  form.append('files[0]', new Blob([data]), FILE);
  if (avant) await discord(`/channels/${s.id}/messages/${avant.id}`, { method: 'PATCH', body: form });
  else await discord(`/channels/${s.id}/messages`, { method: 'POST', body: form });
  dernierHash = h;
  return true;
}
