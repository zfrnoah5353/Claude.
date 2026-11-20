// Tunnel Cloudflare : rend le panel joignable depuis le téléphone (appli MonBot), de partout.
// Si bot/outils/cloudflared.exe (ou cloudflared sur Linux/Android) existe, le bot ouvre un tunnel gratuit
// et envoie l'adresse en message privé au propriétaire du serveur. Vérifié toutes les minutes.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const exe = [join(ici, '..', 'outils', 'cloudflared.exe'), join(ici, '..', 'outils', 'cloudflared')].find(existsSync);
let proc = null, address = null, starting = false;

async function announce(client, url) {
  const g = client.guilds.cache.first(); if (!g) return;
  const owner = await client.users.fetch(g.ownerId).catch(() => null);
  await owner?.send([
    '📱 **Connexion de l\'appli MonBot**',
    `**Adresse du bot :** ${url}`,
    `**Clé du panel :** ||${process.env.PANEL_KEY}||`,
    'Ouvre l\'appli MonBot, colle l\'adresse et la clé, puis « Se connecter ». Coche « Se souvenir de moi ».',
    '⚠️ L\'adresse change quand le bot redémarre : je t\'enverrai la nouvelle ici. Supprime ce message après t\'être connecté.',
  ].join('\n')).catch(e => console.error('MP tunnel :', e.message));
}

function start(client) {
  const bin = exe || [join(ici, '..', 'outils', 'cloudflared.exe'), join(ici, '..', 'outils', 'cloudflared')].find(existsSync);
  if (!bin || proc || starting) return;
  starting = true;
  try {
    proc = spawn(bin, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${process.env.API_PORT || 3000}`], { windowsHide: true });
  } catch (e) { console.error('Tunnel pas encore prêt :', e.code || e.message); proc = null; starting = false; return; }
  // Fichier occupé (antivirus, téléchargement en cours…) : on réessaie plus tard sans faire planter le bot
  proc.on('error', (e) => { console.error('Tunnel :', e.code || e.message); proc = null; starting = false; });
  const read = (buf) => {
    const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m && m[0] !== address) { address = m[0]; starting = false; console.log('🌐 Tunnel ouvert :', address); announce(client, address); }
  };
  proc.stdout.on('data', read); proc.stderr.on('data', read);
  proc.on('exit', () => { proc = null; starting = false; address = null; });
}

export function startTunnel(client) {
  start(client);
  setInterval(() => start(client), 60e3); // si cloudflared est ajouté plus tard, le tunnel s'ouvre tout seul
  process.on('exit', () => proc?.kill());
}
export const tunnelAddress = () => address;
