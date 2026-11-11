// Logique commune de ReviseIA : tourne sur le PC (serveur) ET dans l'appli Android (hors ligne / 4G).
const { AI } = require('./ai');

const DEFAULT_SUBJECTS = [
  ['def-francais', 'Français', '📖', '#e74c3c'],
  ['def-math', 'Math', '📐', '#3498db'],
  ['def-latin', 'Latin', '🏛️', '#9b59b6'],
  ['def-anglais', 'Anglais', '🇬🇧', '#1abc9c'],
  ['def-ndls', 'NDLS', '🇳🇱', '#e67e22'],
  ['def-sciences', 'Sciences', '🔬', '#27ae60'],
  ['def-geo', 'Géo', '🌍', '#16a085'],
  ['def-histoire', 'Histoire', '📜', '#c0392b'],
];
const KINDS = ['cours', 'synthese', 'interro'];
const COLLECTIONS = ['subjects', 'docs', 'generated', 'results'];

function newId() {
  const a = new Uint8Array(8);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) globalThis.crypto.getRandomValues(a);
  else for (let i = 0; i < 8; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

const err = (message, status = 400) => Object.assign(new Error(message), { status });
const stamp = (o) => o.updatedAt || o.createdAt || 0;

function emptyDb() {
  const now = Date.now();
  return {
    settings: { provider: 'gemini', geminiKey: '', apiKey: '', pin: '', model: 'haiku', defaultsV: 3 },
    subjects: DEFAULT_SUBJECTS.map(([id, name, emoji, color]) => ({ id, name, emoji, color, createdAt: 0, updatedAt: 0 })),
    docs: [], generated: [], results: [], deleted: {}, version: 1, createdAt: now,
  };
}

function normalizeDb(db) {
  if (!db) db = emptyDb();
  db.settings = Object.assign({ provider: 'gemini', geminiKey: '', apiKey: '', pin: '', model: 'haiku' }, db.settings);
  // v2 : le mode Économique (Haiku) devient le mode par défaut, même pour une appli déjà installée
  if (!(db.settings.defaultsV >= 2)) { db.settings.model = 'haiku'; db.settings.modelSet = false; db.settings.defaultsV = 2; }
  // v3 : Gemini (gratuit) devient l'IA par défaut
  if (!(db.settings.defaultsV >= 3)) { db.settings.provider = 'gemini'; db.settings.providerSet = false; db.settings.defaultsV = 3; }
  for (const k of COLLECTIONS) db[k] = Array.isArray(db[k]) ? db[k] : [];
  db.deleted = db.deleted || {};
  return db;
}

// --- Synchronisation : fusion de deux copies (PC et téléphone) ---
const exportData = (db) => ({
  subjects: db.subjects, docs: db.docs, generated: db.generated, results: db.results, deleted: db.deleted,
});

function mergeData(a, b) {
  const deleted = Object.assign({}, a.deleted);
  for (const [k, t] of Object.entries(b.deleted || {})) deleted[k] = Math.max(deleted[k] || 0, t);
  const out = { deleted };
  for (const c of COLLECTIONS) {
    const map = new Map();
    for (const it of [...(a[c] || []), ...(b[c] || [])]) {
      if (!it || !it.id) continue;
      const cur = map.get(it.id);
      if (!cur || stamp(it) > stamp(cur)) map.set(it.id, it);
    }
    out[c] = [...map.values()].filter((it) => !(deleted[it.id] && deleted[it.id] >= stamp(it)));
  }
  // Même matière créée des deux côtés (ex : « Math ») -> on n'en garde qu'une
  const byName = new Map();
  const remap = {};
  for (const s of [...out.subjects].sort((x, y) => (x.id < y.id ? -1 : 1))) {
    const key = s.name.trim().toLowerCase();
    if (byName.has(key)) remap[s.id] = byName.get(key).id;
    else byName.set(key, s);
  }
  if (Object.keys(remap).length) {
    out.subjects = out.subjects.filter((s) => !remap[s.id]);
    for (const c of ['docs', 'generated', 'results']) {
      out[c] = out[c].map((it) => (remap[it.subjectId] ? { ...it, subjectId: remap[it.subjectId] } : it));
    }
  }
  out.results.sort((x, y) => x.at - y.at);
  out.results = out.results.slice(-1000);
  for (const c of ['docs', 'generated']) out[c].sort((x, y) => x.createdAt - y.createdAt);
  return out;
}

function applyData(db, data) {
  const m = mergeData(exportData(db), data);
  Object.assign(db, m);
}

// --- Les actions de l'appli ---
function createCore({ db, persist, saveImage, deleteImage }) {
  const ai = new AI(() => db.settings);
  const changed = () => { db.version = (db.version || 0) + 1; persist(); };

  const subjectOf = (sid) => {
    const s = db.subjects.find((x) => x.id === sid);
    if (!s) throw err('Matière introuvable', 404);
    return s;
  };
  const docsOf = (ids) => (ids || []).map((d) => db.docs.find((x) => x.id === d)).filter(Boolean);
  const tomb = (id) => { db.deleted[id] = Date.now(); };

  const state = () => ({
    version: db.version,
    subjects: db.subjects,
    docs: db.docs,
    generated: db.generated,
    results: db.results.slice(-300),
    settings: {
      provider: db.settings.provider === 'claude' ? 'claude' : 'gemini',
      hasKey: db.settings.provider === 'claude' ? !!db.settings.apiKey : !!db.settings.geminiKey,
      hasGeminiKey: !!db.settings.geminiKey,
      hasClaudeKey: !!db.settings.apiKey,
      hasPin: !!db.settings.pin,
      model: db.settings.model,
    },
  });

  async function handle(method, p, b = {}, ctx = { local: true }) {
    let m;
    if (p === '/api/state' && method === 'GET') return state();
    if (p === '/api/version' && method === 'GET') return { version: db.version };

    if (p === '/api/settings' && method === 'POST') {
      if (!ctx.local) throw err('Les réglages se changent sur le PC.', 403);
      if (typeof b.apiKey === 'string' && b.apiKey.trim()) db.settings.apiKey = b.apiKey.trim();
      if (typeof b.geminiKey === 'string' && b.geminiKey.trim()) db.settings.geminiKey = b.geminiKey.trim();
      if (b.provider === 'gemini' || b.provider === 'claude') { db.settings.provider = b.provider; db.settings.providerSet = true; }
      if (typeof b.pin === 'string' && b.pin.trim()) db.settings.pin = b.pin.trim();
      if (b.model === 'opus' || b.model === 'haiku') { db.settings.model = b.model; db.settings.modelSet = true; }
      changed();
      return state();
    }

    if (p === '/api/subjects' && method === 'POST') {
      if (!b.name) throw err('Nom manquant');
      const now = Date.now();
      const s = { id: newId(), name: String(b.name).slice(0, 40), emoji: b.emoji || '📚', color: b.color || '#7f8c8d', createdAt: now, updatedAt: now };
      db.subjects.push(s); changed();
      return s;
    }
    if ((m = /^\/api\/subjects\/([\w-]+)$/.exec(p)) && method === 'DELETE') {
      tomb(m[1]);
      for (const d of db.docs.filter((d) => d.subjectId === m[1])) { tomb(d.id); for (const im of d.images || []) await deleteImage(im); }
      for (const g of db.generated.filter((g) => g.subjectId === m[1])) tomb(g.id);
      db.subjects = db.subjects.filter((s) => s.id !== m[1]);
      db.docs = db.docs.filter((d) => d.subjectId !== m[1]);
      db.generated = db.generated.filter((g) => g.subjectId !== m[1]);
      changed();
      return { ok: true };
    }

    if (p === '/api/docs' && method === 'POST') {
      const subject = subjectOf(b.subjectId);
      const kind = KINDS.includes(b.kind) ? b.kind : 'cours';
      const images = Array.isArray(b.images) ? b.images.slice(0, 20) : [];
      let title = b.title || '';
      let text = b.text || '';
      if (images.length) {
        const t = await ai.transcribe({ images, subject: subject.name, kind });
        title = title || t.title;
        text = text ? text + '\n\n' + t.text : t.text;
      }
      if (!text) throw err('Ajoute au moins une photo ou du texte.');
      const names = [];
      for (const im of images) names.push(await saveImage(im));
      const now = Date.now();
      const doc = { id: newId(), subjectId: subject.id, kind, title: title || 'Document', text, images: names, createdAt: now, updatedAt: now };
      db.docs.push(doc); changed();
      return doc;
    }
    if ((m = /^\/api\/docs\/([\w-]+)$/.exec(p))) {
      const doc = db.docs.find((d) => d.id === m[1]);
      if (!doc) throw err('Document introuvable', 404);
      if (method === 'PUT') {
        if (typeof b.text === 'string') doc.text = b.text;
        if (typeof b.title === 'string') doc.title = b.title;
        if (KINDS.includes(b.kind)) doc.kind = b.kind;
        doc.updatedAt = Date.now();
        changed();
        return doc;
      }
      if (method === 'DELETE') {
        for (const im of doc.images || []) await deleteImage(im);
        tomb(doc.id);
        db.docs = db.docs.filter((d) => d.id !== doc.id); changed();
        return { ok: true };
      }
    }

    if (p === '/api/generate' && method === 'POST') {
      const subject = subjectOf(b.subjectId);
      const docs = docsOf(b.docIds);
      const o = b.options || {};
      const now = Date.now();
      let item = { id: newId(), subjectId: subject.id, docIds: docs.map((d) => d.id), type: b.type, createdAt: now, updatedAt: now };
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
        throw err('Type inconnu');
      }
      db.generated.push(item); changed();
      return item;
    }
    if ((m = /^\/api\/generated\/([\w-]+)$/.exec(p)) && method === 'DELETE') {
      tomb(m[1]);
      db.generated = db.generated.filter((g) => g.id !== m[1]); changed();
      return { ok: true };
    }

    if (p === '/api/recite' && method === 'POST') {
      const subject = subjectOf(b.subjectId);
      const docs = docsOf(b.docIds);
      if (!b.text || b.text.trim().length < 10) throw err('Récite un peu plus !');
      const r = await ai.reciteCheck({ subject: subject.name, docs, recitation: b.text });
      const now = Date.now();
      db.results.push({ id: newId(), type: 'recitation', subjectId: subject.id, docIds: b.docIds, score: +r.score || 0, max: 20, at: now, createdAt: now });
      changed();
      return r;
    }

    if (p === '/api/check-answer' && method === 'POST') {
      const subject = subjectOf(b.subjectId);
      return ai.checkAnswer({ subject: subject.name, question: b.question, expected: b.expected, answer: b.answer });
    }

    if (p === '/api/result' && method === 'POST') {
      const now = Date.now();
      db.results.push({ id: newId(), type: b.type, subjectId: b.subjectId, refId: b.refId, score: +b.score, max: +b.max, at: now, createdAt: now });
      changed();
      return { ok: true };
    }

    if (p === '/api/ask' && method === 'POST') {
      const subject = subjectOf(b.subjectId);
      return { answer: await ai.question({ subject: subject.name, docs: docsOf(b.docIds), question: b.question }) };
    }

    throw err('Route inconnue', 404);
  }

  return { handle, state, changed };
}

module.exports = { createCore, emptyDb, normalizeDb, mergeData, applyData, exportData, newId };
