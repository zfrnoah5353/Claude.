// Charge un pet : fichier dédié dans pets/<id>.js, sinon modèle générique (pets/common.js)
import { makeCommon, commons } from './pets/common.js';
const own = ['pegasus', 'cerberus', 'sphinx', 'anubis', 'fenrir', 'mammoth', 'griffin', 'longdragon', 'gummy_golem', 'hydra', 'ra_phoenix', 'kraken', 'leviathan'];
export async function loadPet(id) {
  if (own.includes(id)) return (await import(`./pets/${id}.js`)).default();
  const d = commons.find((p) => p.id === id);
  if (!d) throw new Error('pet inconnu : ' + id);
  return makeCommon(d);
}
export { commons };
