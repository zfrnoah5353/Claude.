// Serveur local de ReviseIA (PC) : sert l'appli, l'API, et la synchro avec l'appli Android.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { createCore, emptyDb, normalizeDb, applyData, exportData } = require('./core');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};
const IMG_NAME = /^[a-f0-9]{16}\.(jpg|png|webp)$/;

function startServer({ dataDir, port = 4777, publicDir = path.join(__dirname, 'public') } = {}) {
  const imgDir = path.join(dataDir, 'images');
  fs.mkdirSync(imgDir, { recursive: true });
  const dbFile = path.join(dataDir, 'data.json');

  let db = null;
  try { db = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch {}
  db = normalizeDb(db || emptyDb());
  if (!db.settings.apiKey && process.env.ANTHROPIC_API_KEY) db.settings.apiKey = process.env.ANTHROPIC_API_KEY;
  if (!db.settings.geminiKey && process.env.GEMINI_API_KEY) db.settings.geminiKey = process.env.GEMINI_API_KEY;
  // Code de liaison du téléphone (créé automatiquement, modifiable dans les réglages)
  if (!db.settings.pin) db.settings.pin = String(crypto.randomInt(1000, 10000));

  let saveTimer = null;
  const persist = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const tmp = dbFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, dbFile);
    }, 200);
  };

  function writeImage(name, dataUrl) {
    const m = /^data:image\/(jpeg|png|webp);base64,(.*)$/s.exec(dataUrl || '');
    if (!m) throw Object.assign(new Error('Image invalide'), { status: 400 });
    fs.writeFileSync(path.join(imgDir, name), Buffer.from(m[2], 'base64'));
  }

  const core = createCore({
    db,
    persist,
    saveImage: async (dataUrl) => {
      const ext = /^data:image\/(jpeg|png|webp)/.exec(dataUrl)?.[1] || 'jpeg';
      const name = crypto.randomBytes(8).toString('hex') + '.' + (ext === 'jpeg' ? 'jpg' : ext);
      writeImage(name, dataUrl);
      return name;
    },
    deleteImage: async (name) => { if (IMG_NAME.test(name)) fs.rm(path.join(imgDir, name), () => {}); },
  });
  core.changed();

  const isLocal = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress || '');

  function lanUrls() {
    const urls = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const n of list || []) if (n.family === 'IPv4' && !n.internal) urls.push(`http://${n.address}:${port}`);
    }
    return urls.sort((a, b) => (b.includes('192.168.') ? 1 : 0) - (a.includes('192.168.') ? 1 : 0));
  }

  const send = (res, code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  };

  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 200 * 1024 * 1024) { reject(Object.assign(new Error('Trop gros'), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('JSON invalide'), { status: 400 })); }
    });
    req.on('error', reject);
  });

  async function api(req, res, url) {
    const p = url.pathname;
    const local = isLocal(req);
    if (p === '/api/ping') return send(res, 200, { ok: true, app: 'ReviseIA' });
    if (!local && req.headers['x-pin'] !== db.settings.pin) return send(res, 401, { error: 'PIN', message: 'Code PIN requis' });

    if (p === '/api/connect' && req.method === 'GET') {
      const urls = lanUrls();
      const link = urls[0] ? `${urls[0]}/?pin=${encodeURIComponent(db.settings.pin)}` : null;
      const qr = link ? await QRCode.toDataURL(link, { margin: 1, width: 320 }) : null;
      return send(res, 200, { urls, qr, pin: local ? db.settings.pin : undefined, host: urls[0]?.replace(/^http:\/\/|:\d+$/g, '') });
    }

    // --- Synchro avec l'appli Android ---
    if (p === '/api/sync/manifest' && req.method === 'GET') {
      return send(res, 200, { images: fs.readdirSync(imgDir).filter((n) => IMG_NAME.test(n)) });
    }
    if (p === '/api/sync' && req.method === 'POST') {
      const b = await readBody(req);
      for (const [name, dataUrl] of Object.entries(b.images || {})) {
        if (IMG_NAME.test(name) && !fs.existsSync(path.join(imgDir, name))) writeImage(name, dataUrl);
      }
      if (b.data) applyData(db, b.data);
      core.changed();
      const st = db.settings;
      return send(res, 200, { data: exportData(db), settings: { provider: st.provider, geminiKey: st.geminiKey, apiKey: st.apiKey, model: st.model }, version: db.version });
    }

    const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
    return send(res, 200, await core.handle(req.method, p, body, { local }));
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    // L'appli Android parle au PC depuis une autre origine
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-pin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);

      if (url.pathname.startsWith('/images/')) {
        if (!isLocal(req) && url.searchParams.get('pin') !== db.settings.pin) { res.writeHead(401); return res.end(); }
        const name = path.basename(url.pathname);
        const f = path.join(imgDir, name);
        if (!IMG_NAME.test(name) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=31536000' });
        return fs.createReadStream(f).pipe(res);
      }

      let f = path.normalize(path.join(publicDir, decodeURIComponent(url.pathname)));
      if (!f.startsWith(publicDir)) { res.writeHead(403); return res.end(); }
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(publicDir, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(f).pipe(res);
    } catch (e) {
      if (!e.status || e.status >= 500) console.error(e);
      if (!res.headersSent) send(res, e.status || 500, { message: e.message || 'Erreur' });
    }
  });
  server.requestTimeout = 0;
  server.headersTimeout = 0;

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve({ server, port, lanUrls, db }));
  });
}

module.exports = { startServer };

if (require.main === module) {
  const dir = process.env.REVISE_DATA || path.join(os.homedir(), '.reviseia');
  startServer({ dataDir: dir, port: +process.env.PORT || 4777 }).then(({ port, lanUrls }) => {
    console.log(`ReviseIA lancé : http://localhost:${port}`);
    lanUrls().forEach((u) => console.log('  Téléphone : ' + u));
  });
}
