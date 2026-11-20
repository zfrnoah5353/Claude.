// Prépare le bot pour le téléphone : crée monbot.tar.gz (code + panel web + réglages + données)
// puis l'envoie en message privé au propriétaire du serveur, avec le script d'installation.
// À lancer quand le bot du PC est arrêté (sinon deux bots tournent avec le même jeton).
// Utilisation : node --env-file=.env tools/export-telephone.js <id du serveur>
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { REST, Routes } from 'discord.js';

const GID = process.argv[2];
const out = 'monbot.tar.gz';
// Range le journal de la base dans data.db (pour n'avoir qu'un seul fichier à jour)
const db = new DatabaseSync(process.env.DB_PATH || 'data.db'); db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); db.close();
if (existsSync(out)) rmSync(out);
execFileSync('tar', ['-czf', out, 'src', 'web', 'tools', 'test', 'package.json', 'package-lock.json', '.env', 'data.db', '.env.example']);
const size = readFileSync(out).length;
console.log(`Archive : ${out} (${(size / 1048576).toFixed(1)} Mo)`);

if (process.argv.includes('--test')) { console.log('Test : rien envoyé'); rmSync(out); process.exit(0); }
const rest = new REST().setToken(process.env.DISCORD_TOKEN);
const guild = await rest.get(Routes.guild(GID));
const dm = await rest.post(Routes.userChannels(), { body: { recipient_id: guild.owner_id } });
await rest.post(Routes.channelMessages(dm.id), {
  body: { content: [
    '📱 **MonBot pour ton téléphone**',
    '1. Télécharge les **2 fichiers** ci-dessous (appui long → Enregistrer / Télécharger).',
    '2. Dans **Termux**, copie-colle :',
    '```bash\ntermux-setup-storage; bash ~/storage/downloads/installer-telephone.sh\n```',
    '⚠️ L\'archive contient le jeton du bot : supprime ce message une fois l\'installation finie.',
  ].join('\n') },
  files: [
    { name: 'monbot.tar.gz', data: readFileSync(out) },
    { name: 'installer-telephone.sh', data: readFileSync('tools/installer-telephone.sh') },
  ],
});
rmSync(out);
console.log('Envoyé en message privé au propriétaire du serveur.');
