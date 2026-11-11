// Moteur de l'appli Android : tout est stocké sur le téléphone, l'IA est appelée en direct (4G / Wi-Fi),
// et on se synchronise avec le PC quand on est sur le même Wi-Fi.
const { createCore, emptyDb, normalizeDb, applyData, exportData, newId } = require('./core');

// --- petit stockage IndexedDB ---
const idb = (() => {
  let dbp;
  const open = () => (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('reviseia', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction('kv', mode);
      const q = fn(t.objectStore('kv'));
      t.oncomplete = () => res(q && q.result);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    get: (k) => tx('readonly', (s) => s.get(k)),
    set: (k, v) => tx('readwrite', (s) => s.put(v, k)),
    del: (k) => tx('readwrite', (s) => s.delete(k)),
  };
})();

let db, core, pair, lastSync = 0, syncing = null;

let saveTimer = null;
const persist = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => idb.set('db', JSON.parse(JSON.stringify(db))).catch(console.error), 150);
};

const ready = (async () => {
  db = normalizeDb((await idb.get('db').catch(() => null)) || emptyDb());
  pair = (await idb.get('pair').catch(() => null)) || null;
  core = createCore({
    db,
    persist,
    saveImage: async (dataUrl) => {
      const ext = /^data:image\/(jpeg|png|webp)/.exec(dataUrl)?.[1] || 'jpeg';
      const name = newId() + '.' + (ext === 'jpeg' ? 'jpg' : ext);
      await idb.set('img:' + name, dataUrl);
      return name;
    },
    deleteImage: async (name) => idb.del('img:' + name),
  });
})();

async function handle(method, path, body) {
  await ready;
  const out = await core.handle(method, path, body || {}, { local: true });
  return JSON.parse(JSON.stringify(out));
}

// --- Synchro avec le PC ---
const base = () => `http://${pair.host.replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/\/.*$/, '')}:4777`;

async function fetchT(url, opts = {}, ms = 4000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: c.signal });
    if (r.status === 401) throw Object.assign(new Error('Code PIN incorrect'), { status: 401 });
    if (!r.ok) throw new Error('Erreur PC ' + r.status);
    return r;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('PC introuvable (pas sur le même Wi-Fi ?)');
    if (e instanceof TypeError) throw new Error('PC introuvable (pas sur le même Wi-Fi ?)');
    throw e;
  } finally { clearTimeout(t); }
}

async function doSync() {
  await ready;
  if (!pair) throw new Error("Pas encore relié au PC");
  const h = { 'Content-Type': 'application/json', 'x-pin': pair.pin };
  const ping = await (await fetchT(base() + '/api/ping')).json();
  if (ping.app !== 'ReviseIA') throw new Error("Ce n'est pas ReviseIA à cette adresse");
  const man = await (await fetchT(base() + '/api/sync/manifest', { headers: h })).json();
  const onPc = new Set(man.images || []);
  const images = {};
  for (const d of db.docs) for (const n of d.images || []) {
    if (!onPc.has(n)) { const v = await idb.get('img:' + n); if (v) images[n] = v; }
  }
  const res = await (await fetchT(base() + '/api/sync', { method: 'POST', headers: h, body: JSON.stringify({ data: exportData(db), images }) }, 120000)).json();
  const before = JSON.stringify(exportData(db));
  applyData(db, res.data);
  if (res.settings) {
    if (!db.settings.apiKey && res.settings.apiKey) db.settings.apiKey = res.settings.apiKey;
    if (!db.settings.modelSet && res.settings.model) db.settings.model = res.settings.model;
  }
  const changedLocal = before !== JSON.stringify(exportData(db));
  if (changedLocal) core.changed(); else persist();
  lastSync = Date.now();
  return { changed: changedLocal, at: lastSync };
}

function sync() {
  return (syncing ||= doSync().finally(() => { syncing = null; }));
}

async function setPair(host, pin) {
  await ready;
  const old = pair;
  pair = { host: String(host).trim(), pin: String(pin).trim() };
  try {
    await sync();
    await idb.set('pair', pair);
    return true;
  } catch (e) {
    pair = old;
    throw e;
  }
}

async function unpair() { pair = null; await idb.del('pair'); }

// Image : en local, sinon on la récupère sur le PC (si joignable) et on la garde
async function imageUrl(name) {
  const v = await idb.get('img:' + name);
  if (v) return v;
  if (!pair) return null;
  try {
    const r = await fetchT(`${base()}/images/${name}?pin=${encodeURIComponent(pair.pin)}`, {}, 15000);
    const blob = await r.blob();
    const dataUrl = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
    await idb.set('img:' + name, dataUrl);
    return dataUrl;
  } catch { return null; }
}

window.ReviseLocal = {
  ready, handle, sync, setPair, unpair, imageUrl,
  pairInfo: () => pair && { host: pair.host, pin: pair.pin },
  lastSync: () => lastSync,
};
