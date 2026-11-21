// Démarrage en ligne (Render, offre gratuite) : voir src/sauvegarde.js pour la sauvegarde de la base.
import { existsSync } from 'node:fs';
import { restaurer, sauvegarder, prevenirArret } from './sauvegarde.js';

const DB_PATH = process.env.DB_PATH || 'data.db';
// Render donne le port à utiliser dans PORT : le panel l'écoute.
if (process.env.PORT) process.env.API_PORT = process.env.PORT;

if (!process.env.DISCORD_TOKEN) { console.error('❌ Il manque DISCORD_TOKEN.'); process.exit(1); }

try { await restaurer(); } catch (e) {
  // Sans la sauvegarde on risquerait d'écraser les vraies données avec une base vide : on réessaie plus tard.
  console.error('❌ Restauration impossible :', e.message);
  if (!existsSync(DB_PATH)) { await new Promise(r => setTimeout(r, 30e3)); process.exit(1); }
}

await import('./index.js');
const { default: db } = await import('./db.js');

let enCours = false;
async function tick(raison) {
  if (enCours) return; enCours = true;
  try { if (await sauvegarder(db)) console.log(`💾 Sauvegarde (${raison}) envoyée.`); }
  catch (e) { console.error('Sauvegarde ratée :', e.message); }
  finally { enCours = false; }
}
setInterval(() => tick('auto'), 10 * 60e3);
setTimeout(() => tick('démarrage'), 2 * 60e3);

// Render prévient avant d'arrêter le service (mise à jour, redémarrage) : dernière sauvegarde.
for (const sig of ['SIGTERM', 'SIGINT']) process.once(sig, async () => {
  console.log('Arrêt demandé : MP + dernière sauvegarde…');
  const [mp] = await Promise.race([
    Promise.allSettled([prevenirArret(sig), tick('arrêt')]),
    new Promise(r => setTimeout(() => r([{ status: 'timeout' }]), 22e3)),
  ]);
  console.log('Arrêt : MP owner →', mp?.status === 'fulfilled' ? 'envoyé' : (mp?.reason?.message || mp?.status));
  process.exit(0);
});

// Anti-veille : une visite toutes les 10 minutes sur sa propre adresse publique.
const self = process.env.RENDER_EXTERNAL_URL;
if (self) setInterval(() => fetch(self + '/').catch(() => {}), 10 * 60e3);
