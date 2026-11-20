// Vérifie que toutes les commandes se construisent sans erreur (sans se connecter à Discord)
import { readdirSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
process.env.DB_PATH = ':memory:';
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'commands');
let n = 0; const names = new Set();
for (const f of readdirSync(dir)) {
  const mod = await import(pathToFileURL(join(dir, f)));
  for (const c of mod.commands) {
    const j = c.data.toJSON();
    if (names.has(j.name)) throw new Error('Doublon : ' + j.name);
    names.add(j.name); n++;
  }
}
const { MODULES, defaultConfig } = await import('../src/schema.js');
for (const f of readdirSync(join(dir, '..', 'modules'))) await import(pathToFileURL(join(dir, '..', 'modules', f)));
await import('../src/api.js'); await import('../src/images.js');
const { welcomeCard, rankCard, captchaImage } = await import('../src/images.js');
await captchaImage('AB12CD');
const fakeUser = { username: 'Test', displayAvatarURL: () => '' };
await rankCard(fakeUser, { level: 3, xp: 40, need: 200, rank: 1 });
await welcomeCard({ user: fakeUser, guild: { memberCount: 42 } }, {});
console.log(`OK : ${n} commandes, ${MODULES.length} modules, ${Object.keys(defaultConfig()).length} configs, images OK`);
console.log([...names].sort().join(', '));
