// ReviseIA — interface (identique sur PC et téléphone)
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
let S = null;              // état venant du PC
let liveView = true;       // la vue peut être rafraîchie automatiquement
const IS_PC_APP = new URLSearchParams(location.search).get('app') === 'pc' || ['localhost', '127.0.0.1'].includes(location.hostname);
const KIND = { cours: ['📘', 'Cours'], synthese: ['🗂️', 'Synthèse'], interro: ['📝', 'Interro'] };
const GEN = { synthese: ['✨', 'Synthèse'], exercices: ['🏋️', 'Exercices'], flashcards: ['🃏', 'Flashcards'] };

// ---------- utilitaires ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pin = () => { try { return localStorage.getItem('pin') || ''; } catch { return ''; } };
const setPin = (v) => { try { localStorage.setItem('pin', v); } catch {} };

function toast(msg, err = false) {
  const t = $('#toast');
  t.textContent = msg; t.className = err ? 'err' : ''; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), err ? 6000 : 2500);
}
function loading(on, text) {
  $('#loading').hidden = !on;
  if (text) $('#loadingText').textContent = text;
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', 'x-pin': pin() },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (res.status === 401 && data.error === 'PIN') { askPin(); throw new Error('Code PIN requis'); }
  if (!res.ok) throw new Error(data.message || 'Erreur ' + res.status);
  return data;
}

async function ai(text, fn) {
  loading(true, text);
  try { return await fn(); }
  catch (e) { toast(e.message, true); throw e; }
  finally { loading(false); }
}

function askPin() {
  const v = prompt('Code PIN de ReviseIA (affiché sur le PC dans 📱) :');
  if (v != null) { setPin(v.trim()); refresh(true); }
}

async function refresh(render = false) {
  try {
    S = await api('/api/state');
    $('#sync').classList.remove('off');
    if (render) route();
  } catch (e) {
    $('#sync').classList.add('off');
    if (render) view.innerHTML = `<div class="card"><h2>Pas de connexion au PC 😕</h2><p>${esc(e.message)}</p><p class="muted">Vérifie que ReviseIA est ouvert sur le PC et que ton téléphone est sur le <b>même Wi-Fi</b>.</p><button class="btn" onclick="refresh(true)">Réessayer</button></div>`;
  }
}

// Synchronisation PC <-> téléphone : on regarde régulièrement si quelque chose a changé
setInterval(async () => {
  if (document.hidden) return;
  try {
    const v = await api('/api/version');
    $('#sync').classList.remove('off');
    if (S && v.version !== S.version) { await refresh(); if (liveView) route(); }
  } catch { $('#sync').classList.add('off'); }
}, 4000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(liveView); });

// ---------- mini Markdown ----------
function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<i>$2</i>')
    .replace(/__([^_]+)__/g, '<b>$1</b>');
}
function md(src) {
  const lines = esc(src || '').split(/\r?\n/);
  let out = '', list = null, para = [];
  const flushP = () => { if (para.length) { out += '<p>' + inline(para.join('<br>')) + '</p>'; para = []; } };
  const flushL = () => { if (list) { out += `</${list}>`; list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if (/^\s*$/.test(l)) { flushP(); flushL(); continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) { flushP(); flushL(); const n = Math.min(m[1].length + 1, 4); out += `<h${n}>${inline(m[2])}</h${n}>`; continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) { flushP(); flushL(); out += '<hr>'; continue; }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      flushP(); flushL();
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = (r) => r.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      let html = '<table>';
      rows.forEach((r, k) => {
        if (/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(r)) return;
        const tag = k === 0 ? 'th' : 'td';
        html += '<tr>' + cells(r).map((c) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
      });
      out += html + '</table>';
      continue;
    }
    if ((m = /^\s*&gt;\s?(.*)$/.exec(l))) { flushP(); flushL(); out += `<blockquote>${inline(m[1])}</blockquote>`; continue; }
    if ((m = /^\s*[-*•]\s+(.*)$/.exec(l))) { flushP(); if (list !== 'ul') { flushL(); out += '<ul>'; list = 'ul'; } out += `<li>${inline(m[1])}</li>`; continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { flushP(); if (list !== 'ol') { flushL(); out += '<ol>'; list = 'ol'; } out += `<li>${inline(m[1])}</li>`; continue; }
    flushL(); para.push(l);
  }
  flushP(); flushL();
  return out;
}
const plain = (s) => String(s || '').replace(/[#*_`|>]/g, ' ').replace(/\s+/g, ' ');

// ---------- voix : lecture et dictée ----------
function speak(text, lang) {
  if (!('speechSynthesis' in window)) return toast("La lecture à voix haute n'est pas dispo ici", true);
  speechSynthesis.cancel();
  const parts = plain(text).match(/[^.!?]{1,220}[.!?]?/g) || [];
  for (const p of parts) {
    const u = new SpeechSynthesisUtterance(p);
    u.lang = lang || 'fr-FR'; u.rate = 1;
    speechSynthesis.speak(u);
  }
}
const stopSpeak = () => window.speechSynthesis && speechSynthesis.cancel();
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const canDictate = !!SR && window.isSecureContext && !IS_PC_APP_ELECTRON();
function IS_PC_APP_ELECTRON() { return /Electron/i.test(navigator.userAgent); }
function langOf(subject) {
  const n = (subject?.name || '').toLowerCase();
  if (n.includes('anglais')) return 'en-GB';
  if (n.includes('ndls') || n.includes('néerl')) return 'nl-BE';
  return 'fr-FR';
}

// ---------- images ----------
function compress(file, max = 1800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible (essaie en JPG/PNG)')); };
    img.src = url;
  });
}

// ---------- routeur ----------
window.addEventListener('hashchange', route);
$('#backBtn').onclick = () => history.back();

function route() {
  if (!S) return;
  stopSpeak();
  const h = location.hash.replace(/^#/, '').split('?')[0] || '/';
  const [, a, b] = h.split('/');
  $('#backBtn').hidden = !a;
  liveView = true;
  window.scrollTo(0, 0);
  if (!S.settings.hasKey && a !== 'settings' && a !== 'connect') return viewWelcome();
  switch (a) {
    case undefined: case '': return viewHome();
    case 's': return viewSubject(b);
    case 'scan': liveView = false; return viewScan(b);
    case 'doc': return viewDoc(b);
    case 'gen': liveView = false; return viewGenerated(b);
    case 'new': liveView = false; return viewGenerate(b);
    case 'recite': liveView = false; return viewRecite(b);
    case 'ask': liveView = false; return viewAsk(b);
    case 'settings': liveView = false; return viewSettings();
    case 'connect': return viewConnect();
    default: return viewHome();
  }
}
const subj = (id) => S.subjects.find((s) => s.id === id);

// ---------- vues ----------
function viewWelcome() {
  view.innerHTML = `
  <div class="card">
    <h1>Bienvenue sur ReviseIA 👋</h1>
    <p>Scanne tes cours, synthèses et interros, et l'IA te prépare des <b>synthèses</b>, des <b>exercices</b>, des <b>flashcards</b>, et corrige quand tu <b>récites</b> ton cours.</p>
    ${IS_PC_APP
      ? `<p>Pour commencer, colle ta <b>clé API Claude</b> dans les réglages (une seule fois).</p><a class="btn big" href="#/settings">⚙️ Ouvrir les réglages</a>`
      : `<p>La clé API n'est pas encore réglée. Fais-le sur le <b>PC</b> dans ⚙️ Réglages, puis reviens ici.</p><button class="btn big" onclick="refresh(true)">🔄 C'est fait</button>`}
  </div>`;
}

function viewHome() {
  const last = (sid) => S.results.filter((r) => r.subjectId === sid).slice(-1)[0];
  view.innerHTML = `
  <h1>Mes matières</h1>
  <div class="grid">
    ${S.subjects.map((s) => {
      const n = S.docs.filter((d) => d.subjectId === s.id).length;
      const g = S.generated.filter((d) => d.subjectId === s.id).length;
      const r = last(s.id);
      return `<button class="subject" style="background:linear-gradient(135deg, ${s.color}, ${s.color}bb)" onclick="location.hash='#/s/${s.id}'">
        <span class="emo">${esc(s.emoji)}</span>
        <span><b>${esc(s.name)}</b><br><small>${n} doc${n > 1 ? 's' : ''} · ${g} révision${g > 1 ? 's' : ''}${r ? ` · ${Math.round((r.score / r.max) * 20)}/20` : ''}</small></span>
      </button>`;
    }).join('')}
    <button class="subject add" onclick="addSubject()">＋ Ajouter une matière</button>
  </div>
  ${S.generated.length ? `<h2 style="margin-top:24px">Récemment créé</h2><div class="list">${S.generated.slice(-5).reverse().map(genItem).join('')}</div>` : ''}`;
}

async function addSubject() {
  const name = prompt('Nom de la matière (ex : Religion, Espagnol, Éco…)');
  if (!name) return;
  const emoji = prompt('Un emoji pour la matière ? (facultatif)', '📚') || '📚';
  const colors = ['#8e44ad', '#2980b9', '#d35400', '#2c3e50', '#f39c12', '#e84393', '#00b894'];
  await api('/api/subjects', { body: { name, emoji, color: colors[Math.floor(Math.random() * colors.length)] } });
  await refresh(true);
}

function docItem(d) {
  const [ico, lab] = KIND[d.kind] || KIND.cours;
  return `<a class="item" href="#/doc/${d.id}"><span class="ico">${ico}</span><span class="grow"><b>${esc(d.title)}</b><span class="badge ${d.kind}">${lab}</span> <span class="muted small">${new Date(d.createdAt).toLocaleDateString('fr-BE')}</span></span>›</a>`;
}
function genItem(g) {
  const [ico, lab] = GEN[g.type] || ['✨', g.type];
  const s = subj(g.subjectId);
  return `<a class="item" href="#/gen/${g.id}"><span class="ico">${ico}</span><span class="grow"><b>${esc(g.title)}</b><span class="badge">${lab}</span> <span class="muted small">${s ? esc(s.name) + ' · ' : ''}${new Date(g.createdAt).toLocaleDateString('fr-BE')}</span></span>›</a>`;
}

let subjectTab = 'docs';
function viewSubject(id) {
  const s = subj(id);
  if (!s) return viewHome();
  const docs = S.docs.filter((d) => d.subjectId === id).reverse();
  const gens = S.generated.filter((d) => d.subjectId === id).reverse();
  const res = S.results.filter((r) => r.subjectId === id).slice(-8);
  view.innerHTML = `
  <h1>${esc(s.emoji)} ${esc(s.name)}</h1>
  <div class="actions">
    <a class="btn" href="#/scan/${id}"><span>📷</span>Scanner</a>
    <a class="btn alt" href="#/new/${id}?t=synthese"><span>✨</span>Synthèse</a>
    <a class="btn alt" href="#/new/${id}?t=exercices"><span>🏋️</span>Exercices</a>
    <a class="btn alt" href="#/new/${id}?t=flashcards"><span>🃏</span>Flashcards</a>
    <a class="btn alt" href="#/recite/${id}"><span>🎤</span>Réciter</a>
    <a class="btn alt" href="#/ask/${id}"><span>❓</span>Question</a>
  </div>
  ${res.length ? `<div class="card"><b>Mes derniers scores</b><div class="row small" style="margin-top:6px">${res.map((r) => `<span class="badge">${r.type === 'recitation' ? '🎤' : r.type === 'flashcards' ? '🃏' : '🏋️'} ${Math.round((r.score / r.max) * 20)}/20</span>`).join('')}</div></div>` : ''}
  <div class="tabs">
    <button class="tab ${subjectTab === 'docs' ? 'on' : ''}" onclick="subjectTab='docs';route()">📂 Mes documents (${docs.length})</button>
    <button class="tab ${subjectTab === 'gen' ? 'on' : ''}" onclick="subjectTab='gen';route()">✨ Révisions (${gens.length})</button>
  </div>
  <div class="list">
    ${subjectTab === 'docs'
      ? (docs.length ? docs.map(docItem).join('') : `<div class="card muted">Aucun document. Appuie sur <b>📷 Scanner</b> pour photographier ton cours, ta synthèse ou une interro.</div>`)
      : (gens.length ? gens.map(genItem).join('') : `<div class="card muted">Rien encore. Crée une synthèse, des exercices ou des flashcards avec les boutons au-dessus.</div>`)}
  </div>
  <hr><button class="btn alt small" onclick="delSubject('${id}')">🗑️ Supprimer la matière</button>`;
}

async function delSubject(id) {
  if (!confirm('Supprimer cette matière ET tous ses documents ?')) return;
  await api('/api/subjects/' + id, { method: 'DELETE' });
  location.hash = '#/';
  await refresh(true);
}

// --- Scanner ---
function viewScan(sid) {
  const s = subj(sid);
  if (!s) return viewHome();
  const st = { kind: 'cours', images: [] };
  view.innerHTML = `
  <h1>📷 Scanner — ${esc(s.name)}</h1>
  <div class="card">
    <label>C'est quoi ?</label>
    <div class="seg" id="kind">
      ${Object.entries(KIND).map(([k, [i, l]]) => `<button class="btn ${k === 'cours' ? '' : 'alt'}" data-k="${k}">${i} ${l}</button>`).join('')}
    </div>
    <label>Photos (une par page)</label>
    <div class="row">
      <label class="btn" style="margin:0">📸 Prendre une photo<input type="file" accept="image/*" capture="environment" hidden id="cam"></label>
      <label class="btn alt" style="margin:0">🖼️ Choisir des images<input type="file" accept="image/*" multiple hidden id="files"></label>
    </div>
    <div class="thumbs" id="thumbs"></div>
    <label>Titre (facultatif, l'IA en trouve un)</label>
    <input type="text" id="title" placeholder="ex : Chapitre 3 — La Révolution française">
    <details style="margin-top:12px"><summary class="muted">…ou coller / taper du texte à la place</summary><textarea id="text" placeholder="Colle ici le texte de ton cours"></textarea></details>
    <button class="btn big" id="go" style="margin-top:16px">✨ Lire avec l'IA et enregistrer</button>
  </div>`;
  const thumbs = $('#thumbs');
  const draw = () => {
    thumbs.innerHTML = st.images.map((src, i) => `<div class="th"><img src="${src}"><button class="x" data-i="${i}">×</button></div>`).join('');
  };
  thumbs.onclick = (e) => { if (e.target.dataset.i) { st.images.splice(+e.target.dataset.i, 1); draw(); } };
  $('#kind').onclick = (e) => {
    const k = e.target.closest('button')?.dataset.k; if (!k) return;
    st.kind = k;
    [...$('#kind').children].forEach((b) => b.classList.toggle('alt', b.dataset.k !== k));
  };
  const add = async (e) => {
    for (const f of e.target.files) {
      try { st.images.push(await compress(f)); } catch (err) { toast(err.message, true); }
    }
    e.target.value = ''; draw();
  };
  $('#cam').onchange = add; $('#files').onchange = add;
  $('#go').onclick = async () => {
    const text = $('#text').value.trim();
    if (!st.images.length && !text) return toast('Ajoute au moins une photo 📸', true);
    const doc = await ai(`L'IA lit tes ${st.images.length || ''} page(s)…`, () =>
      api('/api/docs', { body: { subjectId: sid, kind: st.kind, title: $('#title').value.trim(), images: st.images, text } }));
    await refresh();
    toast('Document enregistré ✅');
    location.hash = '#/doc/' + doc.id;
  };
}

// --- Document ---
function viewDoc(id) {
  const d = S.docs.find((x) => x.id === id);
  if (!d) return viewHome();
  const s = subj(d.subjectId);
  const [ico, lab] = KIND[d.kind] || KIND.cours;
  const p = pin() ? '?pin=' + encodeURIComponent(pin()) : '';
  view.innerHTML = `
  <h1>${ico} ${esc(d.title)}</h1>
  <p class="muted">${esc(s?.name)} · ${lab} · ${new Date(d.createdAt).toLocaleString('fr-BE')}</p>
  <div class="actions">
    <a class="btn" href="#/new/${d.subjectId}?t=synthese&d=${d.id}"><span>✨</span>Synthèse</a>
    <a class="btn alt" href="#/new/${d.subjectId}?t=exercices&d=${d.id}"><span>🏋️</span>Exercices</a>
    <a class="btn alt" href="#/new/${d.subjectId}?t=flashcards&d=${d.id}"><span>🃏</span>Flashcards</a>
    <a class="btn alt" href="#/recite/${d.subjectId}?d=${d.id}"><span>🎤</span>Réciter</a>
    <button class="btn alt" id="listen"><span>🔊</span>Écouter</button>
  </div>
  <div class="card md" id="content">${md(d.text)}</div>
  ${d.images?.length ? `<details class="card"><summary>📷 Photos originales (${d.images.length})</summary><div class="thumbs">${d.images.map((im) => `<a href="/images/${im}${p}" target="_blank"><img src="/images/${im}${p}"></a>`).join('')}</div></details>` : ''}
  <div class="row">
    <button class="btn alt" id="edit">✏️ Corriger le texte</button>
    <button class="btn alt" id="del">🗑️ Supprimer</button>
  </div>`;
  $('#listen').onclick = () => speak(d.text, langOf(s));
  $('#del').onclick = async () => {
    if (!confirm('Supprimer ce document ?')) return;
    await api('/api/docs/' + id, { method: 'DELETE' });
    await refresh(); location.hash = '#/s/' + d.subjectId;
  };
  $('#edit').onclick = () => {
    liveView = false;
    $('#content').outerHTML = `<div class="card"><label>Titre</label><input type="text" id="et" value="${esc(d.title)}"><label>Type</label><select id="ek">${Object.entries(KIND).map(([k, [, l]]) => `<option value="${k}" ${k === d.kind ? 'selected' : ''}>${l}</option>`).join('')}</select><label>Texte</label><textarea id="ex" style="min-height:50vh">${esc(d.text)}</textarea><div class="row end" style="margin-top:10px"><button class="btn" id="save">💾 Enregistrer</button></div></div>`;
    $('#edit').hidden = true;
    $('#save').onclick = async () => {
      await api('/api/docs/' + id, { method: 'PUT', body: { title: $('#et').value, kind: $('#ek').value, text: $('#ex').value } });
      await refresh(true); toast('Enregistré ✅');
    };
  };
}

// --- Sélection de documents (réutilisé) ---
function docPicker(sid, preselect) {
  const docs = S.docs.filter((d) => d.subjectId === sid).reverse();
  if (!docs.length) return `<div class="card">Aucun document dans cette matière. <a href="#/scan/${sid}">📷 Scanne d'abord un cours</a>.</div>`;
  return `<label>Sur quels documents ?</label><div id="picker">${docs.map((d) => {
    const [ico, lab] = KIND[d.kind] || KIND.cours;
    const on = preselect ? preselect === d.id : true;
    return `<label class="check"><input type="checkbox" value="${d.id}" ${on ? 'checked' : ''}> ${ico} ${esc(d.title)} <span class="badge ${d.kind}">${lab}</span></label>`;
  }).join('')}</div>`;
}
const picked = () => [...document.querySelectorAll('#picker input:checked')].map((i) => i.value);
const qs = () => new URLSearchParams(location.hash.split('?')[1] || '');

// --- Générer ---
function viewGenerate(sid) {
  const s = subj(sid);
  if (!s) return viewHome();
  const q = qs();
  let type = q.get('t') || 'synthese';
  const render = () => {
    view.innerHTML = `
    <h1>${GEN[type][0]} Créer : ${GEN[type][1]} — ${esc(s.name)}</h1>
    <div class="tabs">${Object.entries(GEN).map(([k, [i, l]]) => `<button class="tab ${k === type ? 'on' : ''}" data-t="${k}">${i} ${l}</button>`).join('')}</div>
    <div class="card">
      ${docPicker(sid, q.get('d'))}
      ${type === 'synthese' ? `<label>Style</label><select id="style"><option value="complete">Complète (pour étudier)</option><option value="courte">Fiche express (1 page)</option><option value="plan">Plan + à connaître par cœur</option></select>` : ''}
      ${type === 'exercices' ? `<div class="row"><div style="flex:1"><label>Nombre</label><input type="number" id="count" value="10" min="3" max="30"></div><div style="flex:1"><label>Difficulté</label><select id="diff"><option>facile</option><option selected>moyen</option><option>difficile</option><option>niveau interro</option></select></div></div>` : ''}
      ${type === 'flashcards' ? `<label>Nombre de cartes</label><input type="number" id="count" value="20" min="5" max="60">` : ''}
      <button class="btn big" id="go" style="margin-top:16px">✨ Créer avec l'IA</button>
    </div>`;
    view.querySelector('.tabs').onclick = (e) => { const t = e.target.dataset.t; if (t) { type = t; render(); } };
    const go = $('#go');
    if (go) go.onclick = async () => {
      const docIds = picked();
      if (!docIds.length) return toast('Coche au moins un document', true);
      const options = { style: $('#style')?.value, count: $('#count')?.value, difficulty: $('#diff')?.value };
      const g = await ai(`L'IA prépare tes ${GEN[type][1].toLowerCase()}…`, () => api('/api/generate', { body: { subjectId: sid, docIds, type, options } }));
      await refresh();
      location.hash = '#/gen/' + g.id;
    };
  };
  render();
}

// --- Contenu généré ---
function viewGenerated(id) {
  const g = S.generated.find((x) => x.id === id);
  if (!g) return viewHome();
  const s = subj(g.subjectId);
  const head = `<h1>${GEN[g.type]?.[0] || ''} ${esc(g.title)}</h1><p class="muted">${esc(s?.name)} · ${new Date(g.createdAt).toLocaleString('fr-BE')}</p>`;
  const foot = `<hr><div class="row"><a class="btn alt" href="#/s/${g.subjectId}">← ${esc(s?.name)}</a><button class="btn alt" id="delg">🗑️ Supprimer</button></div>`;
  if (g.type === 'synthese') {
    view.innerHTML = `${head}<div class="row"><button class="btn alt" id="listen">🔊 Écouter</button><button class="btn alt" id="stop">⏹️ Stop</button><button class="btn alt" onclick="window.print()">🖨️ Imprimer</button><a class="btn alt" href="#/recite/${g.subjectId}?d=${g.docIds.join(',')}">🎤 Réciter</a></div><div class="card md">${md(g.content)}</div>${foot}`;
    $('#listen').onclick = () => speak(g.content, langOf(s));
    $('#stop').onclick = stopSpeak;
  } else if (g.type === 'exercices') {
    view.innerHTML = head + '<div id="exs"></div>' + foot;
    runExercises(g, s);
  } else if (g.type === 'flashcards') {
    view.innerHTML = head + '<div id="fc"></div>' + foot;
    runFlashcards(g, s);
  }
  $('#delg').onclick = async () => {
    if (!confirm('Supprimer ?')) return;
    await api('/api/generated/' + id, { method: 'DELETE' });
    await refresh(); location.hash = '#/s/' + g.subjectId;
  };
}

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function runExercises(g, s) {
  const box = $('#exs');
  const results = new Array(g.content.length).fill(null);
  const update = () => {
    const done = results.filter((r) => r !== null).length;
    const good = results.filter((r) => r === true).length;
    $('#prog').innerHTML = `<div class="row small"><b>${done}/${results.length} faits</b><span class="muted">· ${good} juste${good > 1 ? 's' : ''}</span></div><div class="progress"><div style="width:${(done / results.length) * 100}%"></div></div>`;
    if (done === results.length && !update.sent) {
      update.sent = true;
      api('/api/result', { body: { type: 'exercices', subjectId: g.subjectId, refId: g.id, score: good, max: results.length } }).catch(() => {});
      $('#final').innerHTML = `<div class="card" style="text-align:center"><div class="score">${Math.round((good / results.length) * 20)}/20</div><p>${good === results.length ? 'Parfait 🏆' : good / results.length >= 0.7 ? 'Très bien 💪' : 'Continue, refais les erreurs 🔁'}</p><button class="btn" onclick="route()">🔁 Recommencer</button></div>`;
    }
  };
  const mark = (i, ok, card) => { results[i] = ok; card.classList.add(ok ? 'good' : 'bad'); update(); };
  box.innerHTML = '<div id="prog" class="card"></div>' + g.content.map((ex, i) => {
    const q = `<div class="q">${i + 1}. ${md(ex.question).replace(/^<p>|<\/p>$/g, '')}</div>`;
    let body = '';
    if (ex.type === 'qcm') body = `<div class="choices">${(ex.choices || []).map((c, k) => `<button class="choice" data-k="${k}">${esc(c)}</button>`).join('')}</div>`;
    else if (ex.type === 'vrai_faux') body = `<div class="choices" style="grid-template-columns:1fr 1fr"><button class="choice" data-v="true">✅ Vrai</button><button class="choice" data-v="false">❌ Faux</button></div>`;
    else if (ex.type === 'trou') body = `<div class="row"><input type="text" class="ans" placeholder="Ta réponse" style="flex:1"><button class="btn chk">Vérifier</button></div>`;
    else body = `<textarea class="ans" placeholder="Ta réponse (tu peux dicter avec le micro du clavier 🎤)"></textarea><div class="row end" style="margin-top:8px"><button class="btn alt show">Voir la réponse</button><button class="btn chk">✨ Corriger avec l'IA</button></div>`;
    return `<div class="card ex" data-i="${i}">${q}${body}<div class="fb"></div></div>`;
  }).join('') + '<div id="final"></div>';
  update();

  box.querySelectorAll('.ex').forEach((card) => {
    const i = +card.dataset.i;
    const ex = g.content[i];
    const fb = card.querySelector('.fb');
    const explain = (extra = '') => { fb.innerHTML = `<div class="expl md">${extra}${ex.explanation ? md(ex.explanation) : ''}</div>`; };
    card.querySelectorAll('.choice').forEach((b) => b.onclick = () => {
      if (results[i] !== null) return;
      let ok;
      if (ex.type === 'qcm') {
        const right = +ex.answer;
        ok = +b.dataset.k === right;
        card.querySelectorAll('.choice')[right]?.classList.add('right');
      } else {
        const right = ex.answer === true || String(ex.answer).toLowerCase() === 'true' || norm(ex.answer) === 'vrai';
        ok = (b.dataset.v === 'true') === right;
        card.querySelector(`[data-v="${right}"]`).classList.add('right');
      }
      if (!ok) b.classList.add('wrong');
      mark(i, ok, card); explain(ok ? '<b>✅ Juste !</b>' : '<b>❌ Raté.</b>');
    });
    const chk = card.querySelector('.chk');
    if (chk && ex.type === 'trou') chk.onclick = () => {
      if (results[i] !== null) return;
      const v = card.querySelector('.ans').value;
      const ok = norm(v) === norm(ex.answer) || (norm(v).length > 2 && norm(ex.answer).includes(norm(v)) && norm(v).length >= norm(ex.answer).length * 0.7);
      mark(i, ok, card);
      explain(ok ? '<b>✅ Juste !</b>' : `<b>❌ Réponse attendue : ${esc(ex.answer)}</b> <button class="btn alt small okbtn">J'avais juste</button>`);
      const okb = fb.querySelector('.okbtn');
      if (okb) okb.onclick = () => { results[i] = true; card.classList.replace('bad', 'good'); okb.remove(); update(); };
    };
    else if (chk) chk.onclick = async () => {
      const v = card.querySelector('.ans').value.trim();
      if (!v) return toast('Écris ou dicte ta réponse', true);
      const r = await ai("L'IA corrige ta réponse…", () => api('/api/check-answer', { body: { subjectId: g.subjectId, question: ex.question, expected: ex.answer, answer: v } }));
      if (results[i] === null) mark(i, !!r.correct, card);
      explain(`<p><b>${r.correct ? '✅' : '❌'} ${esc(r.note || '')}</b></p>${md(r.feedback)}<p><b>Réponse modèle :</b></p>${md(ex.answer)}<hr>`);
    };
    const show = card.querySelector('.show');
    if (show) show.onclick = () => explain(`<p><b>Réponse modèle :</b></p>${md(ex.answer)}<hr>`);
  });
}

function runFlashcards(g, s) {
  const box = $('#fc');
  let queue = g.content.map((c, i) => i);
  const known = new Set();
  let first = 0, tries = 0;
  const lang = langOf(s);
  const show = () => {
    if (!queue.length) {
      const score = Math.round((first / g.content.length) * 20);
      api('/api/result', { body: { type: 'flashcards', subjectId: g.subjectId, refId: g.id, score: first, max: g.content.length } }).catch(() => {});
      box.innerHTML = `<div class="card" style="text-align:center"><div class="score">${score}/20</div><p>${first}/${g.content.length} sues du premier coup.</p><button class="btn" onclick="route()">🔁 Recommencer</button></div>`;
      return;
    }
    const c = g.content[queue[0]];
    box.innerHTML = `
      <div class="row small"><b>${known.size}/${g.content.length} sues</b><span class="muted">· reste ${queue.length}</span></div>
      <div class="progress"><div style="width:${(known.size / g.content.length) * 100}%"></div></div>
      <div class="flash" id="card"><div class="inner"><div class="face front">${md(c.front)}</div><div class="face back">${md(c.back)}</div></div></div>
      <p class="muted small" style="text-align:center">Touche la carte pour la retourner</p>
      <div class="row" style="justify-content:center"><button class="btn ko" id="no">🔁 À revoir</button><button class="btn alt" id="say">🔊</button><button class="btn ok" id="yes">✅ Je savais</button></div>`;
    $('#card').onclick = () => $('#card').classList.toggle('flip');
    $('#say').onclick = () => speak($('#card').classList.contains('flip') ? c.back : c.front, lang);
    $('#yes').onclick = () => { const i = queue.shift(); if (!known.has(i) && !c._missed) first++; known.add(i); show(); };
    $('#no').onclick = () => { const i = queue.shift(); c._missed = true; queue.splice(Math.min(3, queue.length), 0, i); tries++; show(); };
  };
  g.content.forEach((c) => delete c._missed);
  show();
}

// --- Réciter ---
function viewRecite(sid) {
  const s = subj(sid);
  if (!s) return viewHome();
  const pre = qs().get('d');
  const preIds = pre ? pre.split(',') : null;
  view.innerHTML = `
  <h1>🎤 Réciter — ${esc(s.name)}</h1>
  <div class="card">
    ${docPicker(sid, null)}
    <p class="muted small">Cache ton cours et récite tout ce que tu sais. L'IA compare avec ton cours et te dit ce que tu as oublié.</p>
    <div style="text-align:center;margin:10px 0">
      ${canDictate
        ? `<button class="btn mic" id="mic" title="Parler">🎤</button><p class="muted small" id="micTxt">Appuie et parle</p>`
        : `<p class="small">🎙️ <b>Pour parler :</b> ${IS_PC_APP ? 'appuie sur <b>Windows + H</b> dans la zone de texte (dictée Windows).' : 'touche la zone de texte puis le <b>micro 🎤 de ton clavier</b>.'}</p>`}
    </div>
    <textarea id="txt" placeholder="Ta récitation apparaît ici (tu peux aussi écrire)…" style="min-height:220px"></textarea>
    <button class="btn big" id="go" style="margin-top:12px">✨ Corriger ma récitation</button>
  </div>
  <div id="res"></div>`;
  if (preIds) document.querySelectorAll('#picker input').forEach((i) => (i.checked = preIds.includes(i.value)));
  const txt = $('#txt');
  if (canDictate) {
    let rec = null, on = false;
    $('#mic').onclick = () => {
      if (on) { rec.stop(); return; }
      rec = new SR(); rec.lang = langOf(s); rec.continuous = true; rec.interimResults = true;
      const base = txt.value ? txt.value + ' ' : '';
      let finalTxt = '';
      rec.onresult = (e) => {
        let interim = '';
        for (let k = e.resultIndex; k < e.results.length; k++) {
          if (e.results[k].isFinal) finalTxt += e.results[k][0].transcript + ' ';
          else interim += e.results[k][0].transcript;
        }
        txt.value = base + finalTxt + interim;
      };
      rec.onend = () => { on = false; $('#mic').classList.remove('on'); $('#micTxt').textContent = 'Appuie et parle'; };
      rec.onerror = (e) => toast('Micro : ' + e.error, true);
      rec.start(); on = true; $('#mic').classList.add('on'); $('#micTxt').textContent = "J'écoute… (appuie pour arrêter)";
    };
  }
  $('#go').onclick = async () => {
    const docIds = picked();
    if (!docIds.length) return toast('Coche le cours à réciter', true);
    const r = await ai("L'IA écoute ta récitation…", () => api('/api/recite', { body: { subjectId: sid, docIds, text: txt.value } }));
    const li = (arr) => (arr || []).length ? '<ul>' + arr.map((x) => `<li>${inline(esc(x))}</li>`).join('') + '</ul>' : '<p class="muted">—</p>';
    $('#res').innerHTML = `<div class="card"><div class="score">${esc(r.score)}/20</div>
      <h3>✅ Ce que tu sais</h3>${li(r.acquis)}
      <h3>🕳️ Ce que tu as oublié</h3>${li(r.oublis)}
      <h3>❌ Erreurs</h3>${li(r.erreurs)}
      <h3>💡 Conseil</h3><p>${esc(r.conseil || '')}</p>
      <button class="btn alt" onclick="route()">🔁 Recommencer</button></div>`;
    $('#res').scrollIntoView({ behavior: 'smooth' });
    refresh();
  };
}

// --- Poser une question ---
function viewAsk(sid) {
  const s = subj(sid);
  if (!s) return viewHome();
  view.innerHTML = `
  <h1>❓ Question — ${esc(s.name)}</h1>
  <div class="card">
    ${docPicker(sid, null)}
    <label>Ta question</label>
    <textarea id="q" placeholder="ex : Je ne comprends pas l'ablatif absolu, tu peux m'expliquer ?"></textarea>
    <button class="btn big" id="go" style="margin-top:12px">Demander à l'IA</button>
  </div>
  <div id="ans"></div>`;
  $('#go').onclick = async () => {
    const q = $('#q').value.trim();
    if (!q) return;
    const r = await ai("L'IA réfléchit…", () => api('/api/ask', { body: { subjectId: sid, docIds: picked(), question: q } }));
    $('#ans').innerHTML = `<div class="card md">${md(r.answer)}</div>`;
  };
}

// --- Réglages ---
function viewSettings() {
  if (!IS_PC_APP) {
    view.innerHTML = `<div class="card"><h2>⚙️ Réglages</h2><p>Les réglages (clé API, code PIN) se font sur le <b>PC</b>.</p><label>Code PIN de ce téléphone</label><input type="text" id="pin" value="${esc(pin())}"><button class="btn" style="margin-top:10px" id="sp">Enregistrer</button></div>`;
    $('#sp').onclick = () => { setPin($('#pin').value.trim()); refresh(true); toast('OK ✅'); };
    return;
  }
  view.innerHTML = `
  <h1>⚙️ Réglages</h1>
  <div class="card">
    <h3>🔑 Clé API Claude ${S.settings.hasKey ? '<span class="badge" style="color:var(--ok)">✔ enregistrée</span>' : ''}</h3>
    <p class="small muted">C'est ce qui fait marcher l'IA. Crée-la sur <a href="https://console.anthropic.com/settings/keys" target="_blank">console.anthropic.com</a> → « Create Key », ajoute un peu de crédit, puis colle-la ici. Elle reste uniquement sur ton PC.</p>
    <input type="password" id="key" placeholder="${S.settings.hasKey ? '•••••••• (laisser vide pour garder)' : 'sk-ant-...'}">
    <h3 style="margin-top:20px">🧠 Qualité de l'IA</h3>
    <select id="model">
      <option value="opus" ${S.settings.model !== 'haiku' ? 'selected' : ''}>Meilleure qualité (Claude Opus 5.5) — recommandé</option>
      <option value="haiku" ${S.settings.model === 'haiku' ? 'selected' : ''}>Économique (Claude Haiku 5.5) — beaucoup moins cher</option>
    </select>
    <h3 style="margin-top:20px">🔒 Code PIN pour le téléphone</h3>
    <p class="small muted">Empêche les autres personnes du Wi-Fi de voir tes cours. Laisse vide pour ne pas en mettre.</p>
    <input type="text" id="pinset" inputmode="numeric" placeholder="ex : 1234">
    <button class="btn big" id="save" style="margin-top:16px">💾 Enregistrer</button>
  </div>`;
  api('/api/connect').then((c) => { if (c.pin) $('#pinset').value = c.pin; }).catch(() => {});
  $('#save').onclick = async () => {
    try {
      await api('/api/settings', { body: { apiKey: $('#key').value, pin: $('#pinset').value, model: $('#model').value } });
      await refresh(); toast('Réglages enregistrés ✅'); location.hash = '#/';
    } catch (e) { toast(e.message, true); }
  };
}

// --- Relier le téléphone ---
async function viewConnect() {
  if (!IS_PC_APP) {
    view.innerHTML = `<div class="card"><h2>📱 Tu es sur le téléphone ✅</h2><p>Ce téléphone est relié au PC. Tout ce que tu scannes ici apparaît sur le PC, et inversement.</p><p class="small muted">Astuce : menu du navigateur → <b>« Ajouter à l'écran d'accueil »</b> pour l'avoir comme une vraie appli.</p></div>`;
    return;
  }
  view.innerHTML = `<div class="card"><p>Chargement…</p></div>`;
  const c = await api('/api/connect');
  view.innerHTML = `
  <h1>📱 Relier mon téléphone</h1>
  <div class="card" style="text-align:center">
    <p>1. Mets ton téléphone sur le <b>même Wi-Fi</b> que ce PC.<br>2. Scanne ce QR code avec l'appareil photo :</p>
    ${c.qr ? `<img class="qr" src="${c.qr}" alt="QR code">` : '<p>⚠️ Aucun réseau Wi-Fi détecté sur ce PC.</p>'}
    ${c.urls[0] ? `<p class="muted small">ou tape cette adresse dans le navigateur du téléphone :</p><p class="big-url">${esc(c.urls[0])}</p>` : ''}
    ${c.urls.length > 1 ? `<p class="small muted">Autres adresses possibles : ${c.urls.slice(1).map(esc).join(' · ')}</p>` : ''}
    ${c.pin ? `<p>🔒 Code PIN à entrer sur le téléphone : <b>${esc(c.pin)}</b></p>` : ''}
    <p class="small">3. Sur le téléphone : menu ⋮ / partager → <b>« Ajouter à l'écran d'accueil »</b>. Tu as l'appli ReviseIA sur ton tel ! 🎉</p>
    <p class="small muted">Si Windows demande l'autorisation du pare-feu au 1er lancement, clique « Autoriser » (réseaux privés). Le PC doit être allumé avec ReviseIA ouvert.</p>
  </div>`;
}

// ---------- démarrage ----------
refresh(true);
