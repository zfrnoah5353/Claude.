// Test du panel sans Discord : lance la vraie API avec un faux client + sert les fichiers du panel sur le port 3999.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Collection, ChannelType } from 'discord.js';
process.env.DB_PATH = ':memory:'; process.env.PANEL_KEY = 'test123'; process.env.API_PORT = '3998'; process.env.BOT_NAME = 'MonBot';
const { startApi } = await import('../src/api.js');
const { bumpStat, addSanction } = await import('../src/db.js');

const ch = (id, name, type, parent = null, pos = 0) => ({ id, name, type, parentId: parent, rawPosition: pos, isThread: () => false, isVoiceBased: () => type === ChannelType.GuildVoice });
const channels = new Collection([
  ['c1', ch('c1', 'Général', ChannelType.GuildCategory, null, 0)], ['c2', ch('c2', 'bienvenue', ChannelType.GuildText, 'c1', 1)], ['c3', ch('c3', 'discussion', ChannelType.GuildText, 'c1', 2)],
  ['c4', ch('c4', 'logs', ChannelType.GuildText, 'c1', 3)], ['c5', ch('c5', 'Vocal 1', ChannelType.GuildVoice, 'c1', 4)], ['c6', ch('c6', 'Tickets', ChannelType.GuildCategory, null, 5)],
].map(([k, v]) => [k, v]));
const role = (id, name, color, position) => ({ id, name, hexColor: color, position, managed: false });
const roles = new Collection([['g1', role('g1', '@everyone', '#000000', 0)], ['r1', role('r1', 'Admin', '#e74c3c', 5)], ['r2', role('r2', 'Modo', '#3498db', 4)], ['r3', role('r3', 'Membre', '#2ecc71', 2)], ['r4', role('r4', 'VIP', '#f1c40f', 3)]]);
const guild = { id: 'g1', name: 'Serveur de Noah', memberCount: 128, ownerId: 'u1', premiumSubscriptionCount: 3, iconURL: () => null, channels: { cache: channels }, roles: { cache: roles }, members: { me: { roles: { highest: { position: 6 } }, permissions: { has: () => true } }, cache: new Collection() } };
const client = { user: { username: 'MonBot', tag: 'MonBot#0001', id: '123', displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png' }, guilds: { cache: new Collection([['g1', guild]]) }, ws: { ping: 42 }, commands: new Map(Array.from({ length: 68 }, (_, k) => [k, {}])), actions: new Map([['tickets.sendPanel', async () => 'Panel de tickets envoyé ✅']]), users: { cache: new Collection() }, startedAt: Date.now() - 3 * 3600e3 };
// Faux membres + faux envoi de messages (pour tester le Mur de la honte)
const fakeUser = (id, name) => ({ id, username: name, bot: false, displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/1.png' });
for (const [id, name] of [['u2', 'Kevin'], ['u3', 'Lucas']]) guild.members.cache.set(id, { id, displayName: name, user: fakeUser(id, name.toLowerCase()) });
guild.members.fetch = async (o) => typeof o === 'string' ? guild.members.cache.get(o) : guild.members.cache.filter(m => m.displayName.toLowerCase().includes(String(o?.query || '').toLowerCase()));
client.users.fetch = async (id) => guild.members.cache.get(id)?.user || null;
for (const c of channels.values()) if (c.type === ChannelType.GuildText) Object.assign(c, { isTextBased: () => true, send: async (p) => { console.log(`[faux Discord] #${c.name} :`, p.embeds?.[0]?.data?.description); return { react: async () => {} }; } });
guild.client = client; client.panelActions = new Map(); client.on = () => {};
(await import('../src/commands/honte.js')).register(client);
for (let k = 0; k < 40; k++) bumpStat('g1', k % 3 ? 'messages' : 'cmd:help');
bumpStat('g1', 'join'); addSanction('g1', 'u2', 'u1', 'warn', 'Spam dans #général'); addSanction('g1', 'u3', 'auto', 'mute', 'AutoMod : Mot interdit', Date.now() + 6e5);
startApi(client);

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'panel', 'src');
http.createServer((req, res) => {
  const p = join(root, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!p.startsWith(root) || !existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[extname(p)] || 'text/plain' });
  res.end(readFileSync(p));
}).listen(3999, () => console.log('Panel de test : http://localhost:3999 (adresse du bot http://localhost:3998, clé test123)'));
