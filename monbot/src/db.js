// Base de données locale (fichier data.db), intégrée à Node : rien à installer.
import { DatabaseSync } from 'node:sqlite';
import { defaultConfig } from './schema.js';

const db = new DatabaseSync(process.env.DB_PATH || 'data.db');
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS guild_config (guild_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS members (guild_id TEXT, user_id TEXT, data TEXT NOT NULL, PRIMARY KEY (guild_id, user_id));
CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sanctions (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, user_id TEXT, mod_id TEXT, type TEXT, reason TEXT, created INTEGER, expires INTEGER);
CREATE TABLE IF NOT EXISTS timers (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, guild_id TEXT, at INTEGER, data TEXT);
CREATE TABLE IF NOT EXISTS kv (scope TEXT, key TEXT, data TEXT, PRIMARY KEY (scope, key));
CREATE TABLE IF NOT EXISTS stats (day TEXT, guild_id TEXT, name TEXT, count INTEGER DEFAULT 0, PRIMARY KEY (day, guild_id, name));
CREATE TABLE IF NOT EXISTS eco_log (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT, user_id TEXT, amount INTEGER, reason TEXT, created INTEGER);
`);

const j = (s, d) => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

function deepMerge(base, over) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = k in base ? deepMerge(base[k], over[k]) : over[k];
  return out;
}

const cfgCache = new Map();
export function getConfig(guildId) {
  if (cfgCache.has(guildId)) return cfgCache.get(guildId);
  const row = db.prepare('SELECT data FROM guild_config WHERE guild_id = ?').get(guildId);
  const cfg = deepMerge(defaultConfig(), j(row?.data, {}));
  cfgCache.set(guildId, cfg);
  return cfg;
}
export function saveConfig(guildId, cfg) {
  cfgCache.set(guildId, cfg);
  db.prepare('INSERT INTO guild_config (guild_id, data) VALUES (?, ?) ON CONFLICT(guild_id) DO UPDATE SET data = excluded.data').run(guildId, JSON.stringify(cfg));
}
export function patchModule(guildId, mod, values) {
  const cfg = getConfig(guildId);
  cfg[mod] = { ...(cfg[mod] || {}), ...values };
  saveConfig(guildId, cfg);
  return cfg[mod];
}

const MEMBER_DEFAULT = () => ({ xp: 0, level: 0, voiceMin: 0, msgs: 0, money: 0, bank: 0, inv: {}, streak: 0, lastDaily: 0, lastWeekly: 0, lastWork: 0, lastRob: 0, lastXp: 0, invites: { real: 0, fake: 0, left: 0, bonus: 0 }, inviter: null, flamme: null });
export function getMember(g, u) {
  const row = db.prepare('SELECT data FROM members WHERE guild_id = ? AND user_id = ?').get(g, u);
  return deepMerge(MEMBER_DEFAULT(), j(row?.data, {}));
}
export function saveMember(g, u, data) {
  db.prepare('INSERT INTO members (guild_id, user_id, data) VALUES (?, ?, ?) ON CONFLICT(guild_id, user_id) DO UPDATE SET data = excluded.data').run(g, u, JSON.stringify(data));
}
export function updateMember(g, u, fn) { const m = getMember(g, u); fn(m); saveMember(g, u, m); return m; }
export function allMembers(g) {
  return db.prepare('SELECT user_id, data FROM members WHERE guild_id = ?').all(g).map(r => ({ id: r.user_id, ...deepMerge(MEMBER_DEFAULT(), j(r.data, {})) }));
}
export function resetMembersField(g, fields) {
  for (const m of allMembers(g)) { const { id, ...d } = m; for (const [k, v] of Object.entries(fields)) d[k] = structuredClone(v); saveMember(g, id, d); }
}

export function getUser(u) { return j(db.prepare('SELECT data FROM users WHERE user_id = ?').get(u)?.data, { description: '' }); }
export function saveUser(u, d) { db.prepare('INSERT INTO users (user_id, data) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data').run(u, JSON.stringify(d)); }

export function addSanction(g, u, mod, type, reason, expires = null) {
  return Number(db.prepare('INSERT INTO sanctions (guild_id, user_id, mod_id, type, reason, created, expires) VALUES (?,?,?,?,?,?,?)').run(g, u, mod, type, reason || 'Aucune raison', Date.now(), expires).lastInsertRowid);
}
export function listSanctions(g, u = null, limit = 200) {
  return u ? db.prepare('SELECT * FROM sanctions WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT ?').all(g, u, limit)
           : db.prepare('SELECT * FROM sanctions WHERE guild_id = ? ORDER BY id DESC LIMIT ?').all(g, limit);
}
export function deleteSanction(g, id) { return db.prepare('DELETE FROM sanctions WHERE guild_id = ? AND id = ?').run(g, id).changes; }
export function clearSanctions(g, u) { return db.prepare('DELETE FROM sanctions WHERE guild_id = ? AND user_id = ?').run(g, u).changes; }

export function addTimer(type, g, at, data) { return Number(db.prepare('INSERT INTO timers (type, guild_id, at, data) VALUES (?,?,?,?)').run(type, g, at, JSON.stringify(data)).lastInsertRowid); }
export function dueTimers() { return db.prepare('SELECT * FROM timers WHERE at <= ?').all(Date.now()).map(t => ({ ...t, data: j(t.data, {}) })); }
export function removeTimer(id) { db.prepare('DELETE FROM timers WHERE id = ?').run(id); }
export function findTimers(type, g) { return db.prepare('SELECT * FROM timers WHERE type = ? AND guild_id = ?').all(type, g).map(t => ({ ...t, data: j(t.data, {}) })); }
export function updateTimerAt(id, at) { db.prepare('UPDATE timers SET at = ? WHERE id = ?').run(at, id); }

export function kvGet(scope, key, d = null) { return j(db.prepare('SELECT data FROM kv WHERE scope = ? AND key = ?').get(scope, key)?.data, d); }
export function kvSet(scope, key, v) { db.prepare('INSERT INTO kv (scope, key, data) VALUES (?,?,?) ON CONFLICT(scope, key) DO UPDATE SET data = excluded.data').run(scope, key, JSON.stringify(v)); }
export function kvDel(scope, key) { db.prepare('DELETE FROM kv WHERE scope = ? AND key = ?').run(scope, key); }
export function kvList(scope) { return db.prepare('SELECT key, data FROM kv WHERE scope = ?').all(scope).map(r => ({ key: r.key, value: j(r.data, null) })); }

export function bumpStat(g, name) {
  const day = new Date().toISOString().slice(0, 10);
  db.prepare('INSERT INTO stats (day, guild_id, name, count) VALUES (?,?,?,1) ON CONFLICT(day, guild_id, name) DO UPDATE SET count = count + 1').run(day, g, name);
}
export function getStats(g, days = 14) {
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 10);
  return db.prepare('SELECT day, name, count FROM stats WHERE guild_id = ? AND day >= ? ORDER BY day').all(g, since);
}
export function ecoLog(g, u, amount, reason) { db.prepare('INSERT INTO eco_log (guild_id, user_id, amount, reason, created) VALUES (?,?,?,?,?)').run(g, u, amount, reason, Date.now()); }
export function ecoHistory(g, u) { return db.prepare('SELECT * FROM eco_log WHERE guild_id = ? AND user_id = ? ORDER BY id DESC LIMIT 15').all(g, u); }

export default db;
