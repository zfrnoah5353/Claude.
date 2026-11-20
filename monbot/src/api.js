// API du panel : l'app .exe se connecte ici avec la clé PANEL_KEY (ou une clé de sous-utilisateur)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { MODULES, moduleOf } from './schema.js';
import { getConfig, patchModule, getStats, listSanctions, deleteSanction, kvGet, kvSet, kvList, allMembers } from './db.js';
import { listGw } from './modules/giveaways.js';
import { listBackups } from './commands/backup.js';
import { raidState } from './modules/moderation.js';

const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

function who(req) {
  const key = req.headers['x-panel-key'] || '';
  if (!key) return null;
  if (process.env.PANEL_KEY && safeEq(key, process.env.PANEL_KEY)) return { admin: true, name: 'Administrateur', modules: MODULES.map(m => m.id) };
  const users = kvGet('panel', 'users', {});
  for (const [k, u] of Object.entries(users)) if (safeEq(key, k)) return { admin: false, name: u.name, modules: u.modules || [], guilds: u.guilds || [] };
  return null;
}

function cleanValue(field, v) {
  switch (field.type) {
    case 'toggle': return !!v;
    case 'number': { let n = Number(v); if (Number.isNaN(n)) n = field.default; if (field.min != null) n = Math.max(field.min, n); if (field.max != null) n = Math.min(field.max, n); return n; }
    case 'roles': case 'channels': case 'list': return Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 200) : [];
    case 'objlist': return Array.isArray(v) ? v.slice(0, 100).map(o => Object.fromEntries(field.fields.map(f => [f.key, cleanValue(f, o?.[f.key] ?? f.default)]))) : [];
    case 'select': return field.options.some(([val]) => val === v) ? v : field.default;
    default: return String(v ?? '').slice(0, 4000);
  }
}

// Le panel en version site web (pour le téléphone ou un navigateur) : fichiers du dossier bot/web
const WEB = join(dirname(fileURLToPath(import.meta.url)), '..', 'web');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const failures = new Map(); // essais de clé ratés par adresse (anti-devinette)
async function serveWeb(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = normalize(join(WEB, rel));
  if (!file.startsWith(WEB)) { res.writeHead(403); return res.end(); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  } catch { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Introuvable'); }
}

export function startApi(client) {
  const port = Number(process.env.API_PORT || 3000);
  if (!process.env.PANEL_KEY) console.warn('⚠️ PANEL_KEY est vide dans .env : le panel ne pourra pas se connecter.');

  const server = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-panel-key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    const send = (code, data) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, 'http://x'); const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] !== 'api') return serveWeb(url.pathname, res);
      // En ligne (Render), toutes les visites passent par leur proxy : la vraie adresse est dans x-forwarded-for.
      const ip = (process.env.RENDER && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || '?';
      const fails = failures.get(ip);
      if (fails && fails.n >= 10 && Date.now() - fails.t < 10 * 60e3) return send(429, { error: 'Trop d\'essais ratés : réessaie dans 10 minutes.' });
      const u = who(req);
      if (!u) { failures.set(ip, { n: (fails && Date.now() - fails.t < 10 * 60e3 ? fails.n : 0) + 1, t: Date.now() }); return send(401, { error: 'Clé du panel incorrecte.' }); }
      failures.delete(ip);
      let body = {};
      if (['POST', 'PUT'].includes(req.method)) {
        let raw = ''; for await (const c of req) { raw += c; if (raw.length > 2e6) throw new Error('Trop gros'); }
        body = raw ? JSON.parse(raw) : {};
      }
      const [, a, gid, b, c] = parts;

      if (a === 'info') {
        return send(200, {
          name: process.env.BOT_NAME || client.user.username, tag: client.user.tag, avatar: client.user.displayAvatarURL({ size: 128 }), id: client.user.id,
          guilds: client.guilds.cache.size, members: client.guilds.cache.reduce((s, g) => s + g.memberCount, 0), commands: client.commands.size,
          uptime: Date.now() - client.startedAt, ping: client.ws.ping, me: u,
          invite: `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`,
        });
      }
      if (a === 'schema') return send(200, MODULES.filter(m => u.modules.includes(m.id)));
      if (a === 'users') {
        if (!u.admin) return send(403, { error: 'Réservé à l\'administrateur.' });
        const users = kvGet('panel', 'users', {});
        if (req.method === 'GET') return send(200, Object.entries(users).map(([k, v]) => ({ id: k.slice(0, 6), name: v.name, modules: v.modules, guilds: v.guilds || [] })));
        if (req.method === 'POST') { const key = randomBytes(18).toString('base64url'); users[key] = { name: String(body.name || 'Sans nom').slice(0, 50), modules: (body.modules || []).filter(m => moduleOf(m)), guilds: body.guilds || [] }; kvSet('panel', 'users', users); return send(200, { key }); }
        if (req.method === 'DELETE') { for (const k of Object.keys(users)) if (k.startsWith(gid)) delete users[k]; kvSet('panel', 'users', users); return send(200, { ok: true }); }
      }
      if (a === 'guilds' && !gid) {
        return send(200, client.guilds.cache.filter(g => u.admin || !u.guilds.length || u.guilds.includes(g.id)).map(g => ({ id: g.id, name: g.name, icon: g.iconURL({ size: 64 }), members: g.memberCount })));
      }
      const guild = client.guilds.cache.get(gid);
      if (a === 'guilds' && !guild) return send(404, { error: 'Serveur introuvable (le bot n\'y est pas).' });
      if (a === 'guilds' && !u.admin && u.guilds.length && !u.guilds.includes(gid)) return send(403, { error: 'Pas accès à ce serveur.' });

      if (a === 'guilds' && !b) {
        const cfg = getConfig(gid); const allowed = Object.fromEntries(Object.entries(cfg).filter(([k]) => u.modules.includes(k)));
        const me = guild.members.me;
        return send(200, {
          id: guild.id, name: guild.name, icon: guild.iconURL({ size: 128 }), members: guild.memberCount, owner: guild.ownerId,
          channels: guild.channels.cache.filter(ch => !ch.isThread()).sort((x, y) => x.rawPosition - y.rawPosition).map(ch => ({ id: ch.id, name: ch.name, type: ch.type === ChannelType.GuildCategory ? 'category' : ch.isVoiceBased() ? 'voice' : 'text', parent: ch.parentId })),
          roles: guild.roles.cache.filter(r => !r.managed).sort((x, y) => y.position - x.position).map(r => ({ id: r.id, name: r.id === guild.id ? '@everyone' : r.name, color: r.hexColor, manageable: r.position < (me?.roles.highest.position ?? 0) })),
          botAdmin: me?.permissions.has(PermissionFlagsBits.Administrator) || false,
          config: allowed,
        });
      }
      if (b === 'modules' && req.method === 'PUT') {
        if (!u.modules.includes(c)) return send(403, { error: 'Pas accès à ce module.' });
        const mod = moduleOf(c); if (!mod) return send(404, { error: 'Module inconnu.' });
        const values = {};
        for (const f of mod.fields) if (f.key in body) values[f.key] = cleanValue(f, body[f.key]);
        return send(200, patchModule(gid, c, values));
      }
      if (b === 'actions' && req.method === 'POST') {
        const [modId] = c.split('.');
        if (!u.modules.includes(modId)) return send(403, { error: 'Pas accès à ce module.' });
        const fn = client.panelActions.get(c); if (!fn) return send(404, { error: 'Action inconnue.' });
        return send(200, { message: await fn(guild, body) });
      }
      if (b === 'stats') {
        const days = getStats(gid, 14);
        const members = allMembers(gid);
        let online = 0; for (const m of guild.members.cache.values()) if (m.presence && m.presence.status !== 'offline') online++;
        const tickets = kvList('ticket').filter(x => x.value?.guild === gid && !x.value.closed).length;
        const reviews = kvGet('reviews', gid, []);
        return send(200, {
          days, members: guild.memberCount, online, channels: guild.channels.cache.size, roles: guild.roles.cache.size, boosts: guild.premiumSubscriptionCount || 0,
          tracked: members.length, openTickets: tickets, giveaways: listGw(gid).filter(x => !x.ended).length, raid: raidState(gid).on,
          avgReview: reviews.length ? +(reviews.reduce((s, r) => s + r.stars, 0) / reviews.length).toFixed(2) : null,
          topLevels: members.filter(m => m.level > 0).sort((x, y) => y.level - x.level || y.xp - x.xp).slice(0, 5).map(m => ({ id: m.id, name: guild.members.cache.get(m.id)?.displayName || m.id, level: m.level })),
          topMoney: members.filter(m => m.money > 0).sort((x, y) => y.money - x.money).slice(0, 5).map(m => ({ id: m.id, name: guild.members.cache.get(m.id)?.displayName || m.id, money: m.money })),
        });
      }
      if (b === 'sanctions') {
        if (!u.modules.includes('moderation')) return send(403, { error: 'Pas accès.' });
        if (req.method === 'DELETE') { deleteSanction(gid, Number(c)); return send(200, { ok: true }); }
        return send(200, listSanctions(gid, null, 300).map(s => ({ ...s, userName: client.users.cache.get(s.user_id)?.username || s.user_id, modName: s.mod_id === 'auto' ? 'AutoMod' : client.users.cache.get(s.mod_id)?.username || s.mod_id })));
      }
      if (b === 'members') {
        // Recherche de membres (pour choisir quelqu'un dans le panel)
        const q = (url.searchParams.get('q') || '').trim();
        const found = q ? await guild.members.fetch({ query: q, limit: 25 }).catch(() => new Map()) : guild.members.cache;
        return send(200, [...found.values()].filter(m => !m.user.bot).slice(0, 25).map(m => ({ id: m.id, name: m.displayName, user: m.user.username, avatar: m.user.displayAvatarURL({ size: 64 }) })));
      }
      if (b === 'giveaways') return send(200, listGw(gid).sort((x, y) => y.end - x.end).slice(0, 50).map(g2 => ({ ...g2, entries: g2.entries.length, channelName: guild.channels.cache.get(g2.channel)?.name })));
      if (b === 'tickets') return send(200, { open: kvList('ticket').filter(x => x.value?.guild === gid && !x.value.closed).map(x => ({ channel: x.key, channelName: guild.channels.cache.get(x.key)?.name, ...x.value, ownerName: client.users.cache.get(x.value.owner)?.username })), reviews: kvGet('reviews', gid, []).slice(0, 50).map(r => ({ ...r, userName: client.users.cache.get(r.user)?.username || r.user })) });
      if (b === 'backups') return send(200, listBackups(gid).map(x => ({ id: x.id, created: x.created, auto: x.auto, roles: x.roles.length, channels: x.channels.length })));
      return send(404, { error: 'Route inconnue.' });
    } catch (e) {
      console.error('API :', e);
      send(500, { error: e.message || 'Erreur' });
    }
  });
  server.listen(port, '0.0.0.0', () => console.log(`✅ Panel API prête sur le port ${port}.`));
  server.on('error', (e) => console.error('API : impossible d\'ouvrir le port', port, e.message));
}
