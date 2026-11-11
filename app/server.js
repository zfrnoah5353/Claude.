// Serveur local de ReviseIA : sert l'appli (PC + téléphone sur le même Wi-Fi) et l'API.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { AI } = require('./ai');

const DEFAULT_SUBJECTS = [
  ['Français', '📖', '#e74c3c'],
  ['Math', '📐', '#3498db'],
  ['Latin', '🏛️', '#9b59b6'],
  ['Anglais', '🇬🇧', '#1abc9c'],
  ['NDLS', '🇳🇱', '#e67e22'],
  ['Sciences', '🔬', '#27ae60'],
  ['Géo', '🌍', '#16a085'],
  ['Histoire', '📜', '#c0392b'],
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

const id = () => crypto.randomBytes(8).toString('hex');

function startServer({ dataDir, port = 4777, publicDir = path.join(__dirname, 'public') } = {}) {
  fs.mkdirSync(path.join(dataDir, 'images'), { recursive: true });
  const dbFile = path.join(dataDir, 'data.json');

  let db;
  try { db = JSON.parse(fs.readFileSync(dbFile, 'utf8')); } catch { db = null; }
  if (!db) {
    db = {
      settings: { apiKey: process.env.ANTHROPIC_API_KEY || '', pin: '', model: 'opus' },
      subjects: DEFAULT_SUBJECTS.map(([name, emoji, color]) => ({ id: id(), name, emoji, color })),
      docs: [], generated: [], results: [], version: 1,
    };
  }
  db.settings = Object.assign({ apiKey: '', pin: '', model: 'opus' }, db.settings);
  ['docs', 'generated', 'results'].forEach((k) => (db[k] = db[k] || []));

  let saveTimer = null;
  const save = () => {
    db.version = (db.version || 0) + 1;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const tmp = dbFile + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, dbFile);
    }, 200);
  };
  save();

  const ai = new AI(() => db.settings);

  const isLocal = (req) => {
    const a = req.socket.remoteAddress || '';
    return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  };

  function lanUrls() {
    const urls = [];
    for (const list of Object.values(os.networkInterfaces())) {
      for (const n of list || []) {
        if (n.family === 'IPv4' && !n.internal) urls.push(`http://${n.address}:${port}`);
      }
    }
    // Les adresses 192.168.* d'abord (Wi-Fi maison habituel)
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
      if (size > 80 * 1024 * 1024) { reject(Object.assign(new Error('Fichier trop gros'), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('JSON invalide'), { status: 400 })); }
    });
    req.on('error', reject);
  });

  const subjectOf = (sid) => {
    const s = db.subjects.find((x) => x.id === sid);
    if (!s) throw Object.assign(new Error('Matière introuvable'), { status: 404 });
    return s;
  };
  const docsOf = (ids) => (ids || []).map((d) => db.docs.find((x) => x.id === d)).filter(Boolean);

  function publicState() {
    return {
      version: db.version,
      subjects: db.subjects,
      docs: db.docs,
      generated: db.generated,
      results: db.results.slice(-300),
      settings: { hasKey: !!db.settings.apiKey, hasPin: !!db.settings.pin, model: db.settings.model },
    };
  }

  function saveImage(dataUrl) {
    const m = /^data:image\/(jpeg|png|webp);base64,(.*)$/s.exec(dataUrl);
    if (!m) throw Object.assign(new Error('Image invalide'), { status: 400 });
    const name = id() + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
    fs.writeFileSync(path.join(dataDir, 'images', name), Buffer.from(m[2], 'base64'));
    return name;
  }

  async function api(req, res, url) {
    const p = url.pathname;
    const method = req.method;

    // Code PIN (pour que personne d'autre sur le Wi-Fi n'accède à tes cours)
    if (db.settings.pin && !isLocal(req) && req.headers['x-pin'] !== db.settings.pin && p !== '/api/ping') {
      return send(res, 401, { error: 'PIN', message: 'Code PIN requis' });
    }

    if (p === '/api/ping') return send(res, 200, { ok: true, pin: !!db.settings.pin });
    if (p === '/api/state' && method === 'GET') return send(res, 200, publicState());
    if (p === '/api/version' && method === 'GET') return send(res, 200, { version: db.version });

    if (p === '/api/connect' && method === 'GET') {
      const urls = lanUrls();
      const qr = urls[0] ? await QRCode.toDataURL(urls[0], { margin: 1, width: 320 }) : null;
      return send(res, 200, { urls, qr, pin: isLocal(req) ? db.settings.pin : undefined });
    }

    if (p === '/api/settings' && method === 'POST') {
      if (!isLocal(req)) return send(res, 403, { message: 'Les réglages se changent sur le PC.' });
      const b = await readBody(req);
      if (typeof b.apiKey === 'string' && b.apiKey.trim()) db.settings.apiKey = b.apiKey.trim();
      if (typeof b.pin === 'string') db.settings.pin = b.pin.trim();
      if (b.model === 'opus' || b.model === 'haiku') db.settings.model = b.model;
      save();
      return send(res, 200, publicState());
    }

    // --- Matières ---
    if (p === '/api/subjects' && method === 'POST') {
      const b = await readBody(req);
      if (!b.name) return send(res, 400, { message: 'Nom manquant' });
      const s = { id: id(), name: String(b.name).slice(0, 40), emoji: b.emoji || '📚', color: b.color || '#7f8c8d' };
      db.subjects.push(s); save();
      return send(res, 200, s);
    }
    let m;
    if ((m = /^\/api\/subjects\/(\w+)$/.exec(p)) && method === 'DELETE') {
      db.subjects = db.subjects.filter((s) => s.id !== m[1]);
      db.docs = db.docs.filter((d) => d.subjectId !== m[1]);
      db.generated = db.generated.filter((g) => g.subjectId !== m[1]);
      save();
      return send(res, 200, { ok: true });
    }

    // --- Documents (scans) ---
    if (p === '/api/docs' && method === 'POST') {
      const b = await readBody(req);
      const subject = subjectOf(b.subjectId);
      const kind = ['cours', 'synthese', 'interro'].includes(b.kind) ? b.kind : 'cours';
      const images = Array.isArray(b.images) ? b.images.slice(0, 20) : [];
      let title = b.title || '';
      let text = b.text || '';
      if (images.length) {
        const t = await ai.transcribe({ images, subject: subject.name, kind });
        title = title || t.title;
        text = text ? text + '\n\n' + t.text : t.text;
      }
      if (!text) return send(res, 400, { message: 'Ajoute au moins une photo ou du texte.' });
      const doc = {
        id: id(), subjectId: subject.id, kind, title: title || 'Document', text,
        images: images.map(saveImage), createdAt: Date.now(),
      };
      db.docs.push(doc); save();
      return send(res, 200, doc);
    }
    if ((m = /^\/api\/docs\/(\w+)$/.exec(p))) {
      const doc = db.docs.find((d) => d.id === m[1]);
      if (!doc) return send(res, 404, { message: 'Document introuvable' });
      if (method === 'PUT') {
        const b = await readBody(req);
        if (typeof b.text === 'string') doc.text = b.text;
        if (typeof b.title === 'string') doc.title = b.title;
        if (['cours', 'synthese', 'interro'].includes(b.kind)) doc.kind = b.kind;
        save();
        return send(res, 200, doc);
      }
      if (method === 'DELETE') {
        for (const img of doc.images || []) fs.rm(path.join(dataDir, 'images', img), () => {});
        db.docs = db.docs.filter((d) => d.id !== doc.id); save();
        return send(res, 200, { ok: true });
      }
    }

    // --- Génération IA ---
    if (p === '/api/generate' && method === 'POST') {
      const b = await readBody(req);
      const subject = subjectOf(b.subjectId);
      const docs = docsOf(b.docIds);
      const o = b.options || {};
      let item = { id: id(), subjectId: subject.id, docIds: docs.map((d) => d.id), type: b.type, createdAt: Date.now() };
      if (b.type === 'synthese') {
        const text = await ai.summary({ subject: subject.name, docs, style: o.style });
        const t = /^#+\s*(.+)$/m.exec(text);
        item = { ...item, title: (t ? t[1] : 'Synthèse').replace(/[*#]/g, '').trim().slice(0, 120), content: text };
      } else if (b.type === 'exercices') {
        const r = await ai.exercises({ subject: subject.name, docs, count: Math.min(+o.count || 10, 30), difficulty: o.difficulty || 'moyen' });
        item = { ...item, title: r.title, content: r.exercises };
      } else if (b.type === 'flashcards') {
        const r = await ai.flashcards({ subject: subject.name, docs, count: Math.min(+o.count || 20, 60) });
        item = { ...item, title: r.title, content: r.cards };
      } else {
        return send(res, 400, { message: 'Type inconnu' });
      }
      db.generated.push(item); save();
      return send(res, 200, item);
    }
    if ((m = /^\/api\/generated\/(\w+)$/.exec(p)) && method === 'DELETE') {
      db.generated = db.generated.filter((g) => g.id !== m[1]); save();
      return send(res, 200, { ok: true });
    }

    if (p === '/api/recite' && method === 'POST') {
      const b = await readBody(req);
      const subject = subjectOf(b.subjectId);
      const docs = docsOf(b.docIds);
      if (!b.text || b.text.trim().length < 10) return send(res, 400, { message: 'Récite un peu plus !' });
      const r = await ai.reciteCheck({ subject: subject.name, docs, recitation: b.text });
      db.results.push({ id: id(), type: 'recitation', subjectId: subject.id, docIds: b.docIds, score: r.score, max: 20, at: Date.now() });
      save();
      return send(res, 200, r);
    }

    if (p === '/api/check-answer' && method === 'POST') {
      const b = await readBody(req);
      const subject = subjectOf(b.subjectId);
      return send(res, 200, await ai.checkAnswer({ subject: subject.name, question: b.question, expected: b.expected, answer: b.answer }));
    }

    if (p === '/api/result' && method === 'POST') {
      const b = await readBody(req);
      db.results.push({ id: id(), type: b.type, subjectId: b.subjectId, refId: b.refId, score: +b.score, max: +b.max, at: Date.now() });
      save();
      return send(res, 200, { ok: true });
    }

    if (p === '/api/ask' && method === 'POST') {
      const b = await readBody(req);
      const subject = subjectOf(b.subjectId);
      return send(res, 200, { answer: await ai.question({ subject: subject.name, docs: docsOf(b.docIds), question: b.question }) });
    }

    send(res, 404, { message: 'Route inconnue' });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);

      if (url.pathname.startsWith('/images/')) {
        if (db.settings.pin && !isLocal(req) && url.searchParams.get('pin') !== db.settings.pin) { res.writeHead(401); return res.end(); }
        const f = path.join(dataDir, 'images', path.basename(url.pathname));
        if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=31536000' });
        return fs.createReadStream(f).pipe(res);
      }

      let f = path.normalize(path.join(publicDir, decodeURIComponent(url.pathname)));
      if (!f.startsWith(publicDir)) { res.writeHead(403); return res.end(); }
      if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(publicDir, 'index.html');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(f).pipe(res);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) send(res, err.status || 500, { message: err.message || 'Erreur' });
    }
  });
  server.requestTimeout = 0;
  server.headersTimeout = 0;

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '0.0.0.0', () => resolve({ server, port, lanUrls }));
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
