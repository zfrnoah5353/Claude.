import { CATS, CAT, db, store, isServer, loadAll, save, uid, getPart, partsOf, newBuild, currentBuild, context, check, fits, power, totals, linePrice, eur, spec, links, exportText } from './core.js';
import { generate } from './generator.js';
import { View3D } from './view3d.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let view3d, build, ctx, issues;
let picker = null;                       // { cat, replace, q, compat, brand, sort, limit }
const gen = { budget: 1200, usage: 'gaming', os: false, monitor: false, periph: false, cpuBrand: '', gpuBrand: '', color: '', seed: 1, result: null };

// Confirmation en deux temps (les boîtes de dialogue du navigateur ne sont pas toujours disponibles).
function sure(el) {
  if (el.dataset.armed) return true;
  const old = el.textContent; el.dataset.armed = '1'; el.textContent = 'Sûr ?'; el.style.color = 'var(--err)'; el.style.opacity = 1;
  setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.textContent = old; el.style.color = ''; el.style.opacity = ''; } }, 3000);
  return false;
}
function copyText(text, field) {
  const fallback = () => { if (field) { field.select(); document.execCommand('copy'); } toast('Copié'); };
  try { navigator.clipboard.writeText(text).then(() => toast('Copié'), fallback); } catch { fallback(); }
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 2200); }

// ------------------------------------------------------------------ rendu principal
function refresh() {
  build = currentBuild();
  ctx = context(build);
  issues = check(ctx);
  ctx.issues = issues;
  renderBuilds(); renderParts(); renderSummary();
  if (view3d) { view3d.update(ctx); renderFlow(); }
}

function renderBuilds() {
  $('#builds').innerHTML = store.builds.map(b => `
    <div class="bitem ${b.id === build.id ? 'on' : ''}" data-act="open-build" data-id="${b.id}">
      <div class="nm">${esc(b.name)}<small>${eur(totals(b).sum)} · ${b.lines.length} élément(s)</small></div>
      <button class="ghost x" data-act="dup-build" data-id="${b.id}" title="Dupliquer">⧉</button>
      <button class="ghost x" data-act="del-build" data-id="${b.id}" title="Supprimer">✕</button>
    </div>`).join('');
}

function renderParts() {
  if (document.activeElement !== $('#bname')) $('#bname').value = build.name;
  const bad = new Set(issues.filter(i => i.level === 'err').flatMap(i => i.cats));
  const caution = new Set(issues.filter(i => i.level === 'warn').flatMap(i => i.cats));
  const slot = c => {
    const lines = build.lines.map((l, i) => [l, i]).filter(([l]) => l.cat === c.k);
    const canAdd = c.multi || !lines.length;
    return `<div class="slot ${bad.has(c.k) ? 'bad' : caution.has(c.k) ? 'caution' : ''}">
      <div class="slot-h"><span class="ic">${c.icon}</span><span class="lb">${c.label}</span>
        ${canAdd ? `<button data-act="pick" data-cat="${c.k}">${lines.length ? '＋ Ajouter' : 'Choisir'}</button>` : ''}</div>
      ${lines.map(([l, i]) => lineHtml(l, i, c)).join('')}</div>`;
  };
  $('#parts').innerHTML = `<div class="grp">La tour</div>${CATS.filter(c => !c.setup).map(slot).join('')}
    <div class="grp">Le bureau</div>${CATS.filter(c => c.setup).map(slot).join('')}`;
}

function lineHtml(l, i, c) {
  const p = getPart(l.cat, l.pid);
  const est = l.price == null ? (p && p.p != null ? p.p : l.reserved ?? null) : null;
  const priceInput = `<input class="price ${l.price == null && est != null ? 'est' : ''}" type="number" min="0" step="1" data-price="${i}"
     value="${l.price ?? ''}" placeholder="${est != null ? '≈ ' + est : 'prix €'}" title="${l.price == null ? 'Prix estimé — saisissez le prix réel pour le remplacer' : 'Prix saisi'}">`;
  const rt = `<div class="rt">${c.multi && p ? `<div class="qty"><button data-act="qty" data-i="${i}" data-d="-1">−</button><span>${l.qty || 1}</span><button data-act="qty" data-i="${i}" data-d="1">+</button></div>` : ''}
     ${priceInput}<button class="ghost" data-act="remove" data-i="${i}" title="Retirer">✕</button></div>`;
  if (!p) return `<div class="line res"><span class="nm" data-act="replace" data-i="${i}">${esc(l.label || 'Pièce introuvable')} — cliquer pour choisir</span>${rt}<span class="sp">Budget réservé</span></div>`;
  return `<div class="line"><span class="nm" data-act="replace" data-i="${i}" title="Remplacer">${esc(p.n)}</span>${rt}
    <span class="sp">${esc(spec(l.cat, p))}</span>
    <span class="lk">Prix réel : ${links(p).map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>`).join('')}</span></div>`;
}

function renderSummary() {
  const t = totals(build), pw = power(ctx);
  const errs = issues.filter(i => i.level === 'err').length, warns = issues.filter(i => i.level === 'warn').length;
  const hasParts = build.lines.length > 0;
  const list = issues.length ? issues.map(i => `<div class="iss ${i.level}">${i.level === 'err' ? '⛔' : i.level === 'warn' ? '⚠️' : 'ℹ️'} <span>${esc(i.msg)}</span></div>`).join('')
    : `<div class="iss ok">${hasParts ? '✅ Aucune incompatibilité détectée.' : 'Commencez par choisir une pièce, ou générez un setup complet depuis « Setup par budget ».'}</div>`;
  $('#summary').innerHTML = `
    <div class="stat"><small>Total</small><b>${eur(t.sum)}</b><span>${t.estimated ? `dont ${t.estimated} prix estimé(s)` : 'prix saisis'}${t.unknown ? ` · ${t.unknown} sans prix` : ''}</span></div>
    <div class="stat"><small>Consommation</small><b>${hasParts ? '~' + pw.draw + ' W' : '—'}</b><span>${hasParts ? `alim. conseillée ${pw.reco} W` : ''}${errs ? ` · ${errs} erreur(s)` : warns ? ` · ${warns} alerte(s)` : ''}</span></div>
    <div class="issues">${list}</div>`;
}

function renderFlow() {
  const chip = $('#flowchip');
  chip.hidden = !view3d.opts.airflow;
  if (chip.hidden) return;
  const { intake, exhaust } = view3d.flow;
  const txt = !intake && !exhaust ? 'Aucun ventilateur de boîtier : flux d\'air passif. Ajoutez-en dans « Ventilateurs ».'
    : intake > exhaust ? 'Pression positive (plus d\'entrée que de sortie) : moins de poussière.'
    : intake < exhaust ? 'Pression négative (plus de sortie que d\'entrée) : bon refroidissement, plus de poussière.' : 'Flux équilibré.';
  chip.innerHTML = `💨 <b>${intake}</b> entrée(s) · <b>${exhaust}</b> sortie(s)<br><span style="color:var(--dim)">${txt} Schéma indicatif, pas une simulation thermique.</span>`;
}

// ------------------------------------------------------------------ sélecteur de pièces
function openPicker(cat, replace = null) {
  picker = { cat, replace, q: '', compat: true, brand: '', sort: 'pert', limit: 60 };
  $('#modal').hidden = false;
  $('#modal').innerHTML = `<div class="dlg" style="height:86vh">
    <div class="dlg-h"><h2>${CAT[cat].icon} ${CAT[cat].label}</h2><button data-act="new-custom" data-cat="${cat}">＋ Pièce perso</button><button class="ghost" data-act="close">✕</button></div>
    <div class="filters">
      <input type="search" id="pq" placeholder="Rechercher un modèle, une marque, une référence…" autofocus>
      <select id="pbrand"><option value="">Toutes les marques</option>${[...new Set(partsOf(cat).map(p => p.m).filter(Boolean))].sort((a, b) => a.localeCompare(b)).map(m => `<option>${esc(m)}</option>`).join('')}</select>
      <select id="psort"><option value="pert">Récents d'abord</option><option value="name">Nom</option><option value="up">Prix croissant</option><option value="down">Prix décroissant</option></select>
      <label><input type="checkbox" id="pcompat" checked> Compatibles uniquement</label>
    </div>
    <div class="count" id="pcount"></div><div class="plist" id="plist"></div></div>`;
  $('#pq').addEventListener('input', e => { picker.q = e.target.value; picker.limit = 60; renderPicker(); });
  $('#pbrand').addEventListener('change', e => { picker.brand = e.target.value; renderPicker(); });
  $('#psort').addEventListener('change', e => { picker.sort = e.target.value; renderPicker(); });
  $('#pcompat').addEventListener('change', e => { picker.compat = e.target.checked; renderPicker(); });
  renderPicker();
  setTimeout(() => $('#pq')?.focus(), 30);
}

function renderPicker() {
  const { cat } = picker;
  const words = picker.q.toLowerCase().split(/\s+/).filter(Boolean);
  // contexte sans la ligne qu'on remplace
  const tmp = { ...build, lines: build.lines.filter((l, i) => i !== picker.replace && (CAT[cat].multi ? true : l.cat !== cat)) };
  const base = context(tmp);
  if (CAT[cat].multi && picker.replace == null) { /* ajout : on teste la pièce seule face au reste */ }
  let list = partsOf(cat).filter(p => (!picker.brand || p.m === picker.brand) && words.every(w => (p.n + ' ' + (p.chipset || '') + ' ' + (p.socket || '')).toLowerCase().includes(w)));
  const total = list.length;
  const ok = new Map();
  const isOk = p => { if (!ok.has(p)) ok.set(p, fits(base, cat, p)); return ok.get(p); };
  if (picker.compat) list = list.filter(isOk);
  const pr = p => p.p ?? Infinity;
  if (picker.sort === 'name') list.sort((a, b) => a.n.localeCompare(b.n));
  else if (picker.sort === 'up') list.sort((a, b) => pr(a) - pr(b));
  else if (picker.sort === 'down') list.sort((a, b) => (b.p ?? -1) - (a.p ?? -1));
  else list.sort((a, b) => (b.id.startsWith('c-') - a.id.startsWith('c-')) || ((b.y || 0) - (a.y || 0)) || ((b.p != null) - (a.p != null)) || ((b.s || 0) - (a.s || 0)));
  $('#pcount').textContent = `${list.length.toLocaleString('fr-FR')} pièce(s)` + (picker.compat && list.length < total ? ` · ${(total - list.length).toLocaleString('fr-FR')} incompatible(s) masquée(s)` : '');
  $('#plist').innerHTML = list.slice(0, picker.limit).map(p => {
    const good = picker.compat || isOk(p);
    return `<div class="prow ${good ? '' : 'no'}"><div><div class="nm">${esc(p.n)}${p.id.startsWith('c-') ? '<span class="tag">perso</span>' : ''}${good ? '' : '<span class="tag bad">incompatible</span>'}</div><div class="sp">${esc(spec(cat, p))}</div></div>
      <div class="pp">${p.p != null ? '≈ ' + eur(p.p) : ''}</div><button class="primary" data-act="choose" data-pid="${esc(p.id)}">Choisir</button></div>`;
  }).join('') + (list.length > picker.limit ? `<div class="count"><button data-act="more">Afficher plus</button></div>` : '') + (list.length ? '' : '<div class="empty">Aucun résultat. Essayez de décocher « Compatibles uniquement » ou créez une pièce perso.</div>');
}

function choose(pid) {
  const { cat, replace } = picker;
  if (replace != null && build.lines[replace]) {
    const old = build.lines[replace];
    build.lines[replace] = { cat, pid, qty: old.pid ? (old.qty || 1) : 1 };
  } else {
    if (!CAT[cat].multi) build.lines = build.lines.filter(l => l.cat !== cat);
    build.lines.push({ cat, pid, qty: 1 });
  }
  build.lines.sort((a, b) => CATS.findIndex(c => c.k === a.cat) - CATS.findIndex(c => c.k === b.cat));
  closeModal(); save(); refresh();
}
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; picker = null; }

// ------------------------------------------------------------------ pièces perso
const F = (k, label, type = 'number', opts) => ({ k, label, type, opts });
const CUSTOM_FIELDS = {
  cpu: [F('socket', 'Socket (ex. AM5)', 'text'), F('tdp', 'TDP (W)'), F('cores', 'Cœurs'), F('threads', 'Threads'), F('igpu', 'Puce graphique intégrée', 'bool'), F('stock', 'Ventirad fourni', 'bool')],
  mobo: [F('socket', 'Socket', 'text'), F('ff', 'Format', 'select', ['ATX', 'Micro ATX', 'Mini-ITX', 'EATX']), F('ramType', 'Mémoire', 'select', ['DDR5', 'DDR4', 'DDR3']), F('ramSlots', 'Emplacements mémoire'), F('m2', 'Emplacements M.2')],
  ram: [F('type', 'Type', 'select', ['DDR5', 'DDR4', 'DDR3']), F('speed', 'Fréquence (MHz)'), F('qty', 'Nombre de barrettes'), F('per', 'Go par barrette'), F('rgb', 'RGB', 'bool')],
  gpu: [F('chipset', 'Puce (ex. GeForce RTX 5070)', 'text'), F('vram', 'Mémoire vidéo (Go)'), F('len', 'Longueur (mm)'), F('tdp', 'Consommation (W)')],
  storage: [F('cap', 'Capacité (Go)'), F('type', 'Type', 'select', ['SSD', 'HDD']), F('ff', 'Format', 'select', ['M.2-2280', '2.5"', '3.5"'])],
  psu: [F('w', 'Puissance (W)'), F('eff', 'Certification', 'select', ['80+ Gold', '80+ Bronze', '80+ Platinum', '80+ Titanium', '80+']), F('ff', 'Format', 'select', ['ATX', 'SFX'])],
  case: [F('ff', 'Type', 'select', ['ATX Mid Tower', 'ATX Full Tower', 'Micro ATX Mini Tower', 'Mini ITX Tower']), F('maxGpu', 'Longueur GPU max (mm)'), F('maxCooler', 'Hauteur ventirad max (mm)'), F('dims', 'Dimensions L×l×H (mm)', 'text'), F('glass', 'Panneau vitré', 'bool')],
  cooler: [F('water', 'Watercooling', 'bool'), F('h', 'Hauteur (mm)'), F('rad', 'Radiateur (mm)'), F('fans', 'Ventilateurs'), F('sockets', 'Sockets (séparés par des virgules)', 'text')],
  fan: [F('size', 'Taille (mm)'), F('qty', 'Quantité dans le pack'), F('rgb', 'RGB', 'bool')],
  monitor: [F('size', 'Diagonale (pouces)'), F('rw', 'Largeur (px)'), F('rh', 'Hauteur (px)'), F('hz', 'Fréquence (Hz)')],
};

function openCustom(cat, id = null) {
  const p = id ? store.custom.find(x => x.id === id) : null;
  cat = p ? p.cat : cat || 'cpu';
  const fields = CUSTOM_FIELDS[cat] || [];
  const val = k => p ? (Array.isArray(p[k]) ? p[k].join(k === 'dims' ? 'x' : ', ') : p[k] ?? '') : '';
  $('#modal').hidden = false;
  $('#modal').innerHTML = `<div class="dlg small"><div class="dlg-h"><h2>${p ? 'Modifier la' : 'Nouvelle'} pièce perso</h2><button class="ghost" data-act="close">✕</button></div>
    <form class="dlg-b" id="cform" data-id="${id || ''}"><div class="form2">
      <div class="field full"><label>Catégorie</label><select name="cat" ${p ? 'disabled' : ''}>${CATS.map(c => `<option value="${c.k}" ${c.k === cat ? 'selected' : ''}>${c.label}</option>`).join('')}</select></div>
      <div class="field full"><label>Nom</label><input name="n" required value="${esc(val('n'))}" placeholder="Marque et modèle"></div>
      <div class="field"><label>Prix (€)</label><input name="p" type="number" min="0" step="0.01" value="${esc(val('p'))}"></div>
      <div class="field"><label>Lien marchand</label><input name="url" type="url" value="${esc(val('url'))}" placeholder="https://…"></div>
      ${fields.map(f => `<div class="field"><label>${f.label}</label>${f.type === 'bool' ? `<select name="${f.k}"><option value="">Non</option><option value="1" ${val(f.k) ? 'selected' : ''}>Oui</option></select>`
        : f.type === 'select' ? `<select name="${f.k}">${f.opts.map(o => `<option ${val(f.k) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : `<input name="${f.k}" type="${f.type}" ${f.type === 'number' ? 'min="0" step="any"' : ''} value="${esc(val(f.k))}">`}</div>`).join('')}
    </div><p class="note">Seuls le nom et la catégorie sont obligatoires. Les caractéristiques servent aux contrôles de compatibilité et à la vue 3D.</p>
    <div class="actions"><button class="primary">Enregistrer</button><button type="button" data-act="close">Annuler</button></div></form></div>`;
  $('#cform').elements.cat.addEventListener('change', e => openCustom(e.target.value));
  $('#cform').addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target), c = p ? p.cat : fd.get('cat');
    const o = p || { id: 'c-' + uid(), cat: c, m: 'Perso' };
    o.n = fd.get('n').trim();
    for (const k of ['p']) { const v = fd.get(k); if (v === '') delete o[k]; else o[k] = +v; }
    const u = fd.get('url').trim(); if (/^https?:\/\//.test(u)) o.url = u; else delete o.url;
    for (const f of CUSTOM_FIELDS[c] || []) {
      const v = (fd.get(f.k) ?? '').toString().trim();
      if (v === '') { delete o[f.k]; continue; }
      if (f.type === 'bool') o[f.k] = true;
      else if (f.type === 'number') o[f.k] = +v;
      else if (f.k === 'sockets') o[f.k] = v.split(',').map(s => s.trim()).filter(Boolean);
      else if (f.k === 'dims') { const d = (v.match(/\d+(\.\d+)?/g) || []).map(Number); if (d.length === 3) o.dims = d; else delete o.dims; }
      else o[f.k] = v;
    }
    if (c === 'ram' && o.qty && o.per) o.cap = o.qty * o.per;
    if (c === 'case') o.mobos = /Full|Mid/.test(o.ff) ? ['ATX', 'Micro ATX', 'Mini-ITX'] : /Micro/.test(o.ff) ? ['Micro ATX', 'Mini-ITX'] : ['Mini-ITX'];
    if (c === 'storage') { o.nvme = o.ff === 'M.2-2280'; o.itf = o.nvme ? 'M.2 PCIe' : 'SATA 6.0 Gb/s'; }
    if (!p) store.custom.unshift(o);
    save(); closeModal(); toast('Pièce enregistrée'); renderCustom(); refresh();
  });
}

function renderCustom() {
  $('#v-custom').innerHTML = `<div class="page"><h1>Mes pièces perso</h1>
    <p>Une pièce manque dans la base, ou vous avez déjà du matériel ? Ajoutez-la ici : elle apparaît ensuite dans le sélecteur, avec les contrôles de compatibilité et la vue 3D.</p>
    <div class="actions" style="margin:0 0 16px"><button class="primary" data-act="new-custom">＋ Nouvelle pièce</button></div>
    <div class="card" style="max-width:900px;padding:0">${store.custom.length ? store.custom.map(p => `<div class="prow"><div><div class="nm">${esc(p.n)}<span class="tag">${CAT[p.cat].label}</span></div><div class="sp">${esc(spec(p.cat, p))}</div></div>
      <div class="pp">${p.p != null ? eur(p.p) : ''}</div><div><button data-act="edit-custom" data-id="${p.id}">Modifier</button> <button class="ghost" data-act="del-custom" data-id="${p.id}">✕</button></div></div>`).join('')
      : '<div class="empty">Aucune pièce perso pour le moment.</div>'}</div></div>`;
}

// ------------------------------------------------------------------ générateur
function renderGen() {
  const seg = (k, opts) => `<div class="seg">${opts.map(([v, t]) => `<button type="button" data-gen="${k}" data-v="${v}" class="${gen[k] === v ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const r = gen.result;
  let res = '<div class="card empty">Indiquez votre budget puis cliquez sur « Générer » : un setup complet, compatible et équilibré est proposé en une seconde.</div>';
  if (r && r.error) res = `<div class="card"><div class="iss err">⛔ <span>${esc(r.error)}</span></div></div>`;
  else if (r) {
    const fake = { name: '', lines: r.lines }, t = totals(fake), is = check(context(fake)).filter(i => i.level !== 'info');
    res = `<div class="card"><span class="badge">${esc(r.level)}</span>
      ${r.lines.map(l => { const p = getPart(l.cat, l.pid); return `<div class="res-row"><span class="c">${CAT[l.cat].label}</span><span>${esc(p ? p.n : l.label)}<span class="s">${p ? esc(spec(l.cat, p)) : 'Budget réservé — à choisir ensuite'}</span></span><span class="p">≈ ${eur(linePrice(l))}</span></div>`; }).join('')}
      <div class="res-total"><span>Total estimé <span style="color:var(--dim);font-size:13px">pour un budget de ${eur(gen.budget)}</span></span><b>${eur(t.sum)}</b></div>
      ${is.map(i => `<div class="iss ${i.level}">${i.level === 'err' ? '⛔' : '⚠️'} <span>${esc(i.msg)}</span></div>`).join('') || '<div class="iss ok">✅ Compatibilité vérifiée.</div>'}
      <div style="margin-top:10px">${r.notes.map(n => `<div class="note">${esc(n)}</div>`).join('')}</div>
      <div class="actions"><button class="primary" data-act="gen-use">Ouvrir ce setup en 3D</button><button data-act="gen-again">🎲 Autre proposition</button></div></div>`;
  }
  $('#v-gen').innerHTML = `<div class="page"><h1>Setup complet par budget</h1>
    <p>Donnez un budget : SetupForge répartit l'argent entre les pièces, choisit le meilleur duo processeur / carte graphique qui rentre, puis complète avec des pièces compatibles.</p>
    <div class="gen-grid"><div class="card">
      <div class="field"><label>Budget total</label><div class="budget"><input type="number" id="gbudget" min="400" max="10000" step="50" value="${gen.budget}"><span>€</span><input type="range" id="grange" min="400" max="6000" step="50" value="${Math.min(gen.budget, 6000)}"></div></div>
      <div class="field"><label>Usage</label>${seg('usage', [['gaming', '🎮 Jeu'], ['mixed', '⚖️ Polyvalent'], ['work', '🎬 Création / travail']])}</div>
      <div class="field"><label>À inclure dans le budget</label><div class="checks">
        <label><input type="checkbox" data-genc="monitor" ${gen.monitor ? 'checked' : ''}> Écran</label>
        <label><input type="checkbox" data-genc="periph" ${gen.periph ? 'checked' : ''}> Clavier, souris et casque</label>
        <label><input type="checkbox" data-genc="os" ${gen.os ? 'checked' : ''}> Licence Windows 11</label></div></div>
      <div class="field"><label>Processeur</label>${seg('cpuBrand', [['', 'Indifférent'], ['AMD', 'AMD'], ['Intel', 'Intel']])}</div>
      <div class="field"><label>Carte graphique</label>${seg('gpuBrand', [['', 'Indifférent'], ['NVIDIA', 'NVIDIA'], ['AMD', 'AMD'], ['Intel', 'Intel']])}</div>
      <div class="field"><label>Couleur</label>${seg('color', [['', 'Indifférent'], ['BLACK', 'Noir'], ['WHITE', 'Blanc']])}</div>
      <button class="primary" data-act="gen-run" style="width:100%;padding:11px">✨ Générer mon setup</button>
    </div><div>${res}</div></div></div>`;
  const nb = $('#gbudget'), rg = $('#grange');
  nb.addEventListener('input', () => { gen.budget = +nb.value || 0; rg.value = Math.min(gen.budget, 6000); });
  rg.addEventListener('input', () => { gen.budget = +rg.value; nb.value = gen.budget; });
}
function runGen() { gen.result = generate(gen, gen.seed); renderGen(); }

// ------------------------------------------------------------------ export
function openExport() {
  $('#modal').hidden = false;
  $('#modal').innerHTML = `<div class="dlg small"><div class="dlg-h"><h2>Exporter « ${esc(build.name)} »</h2><button class="ghost" data-act="close">✕</button></div>
    <div class="dlg-b"><div class="seg" style="margin-bottom:10px"><button data-exp="txt" class="on">Texte</button><button data-exp="md">Tableau Markdown (Reddit, Discord)</button></div>
    <textarea id="exptxt" readonly>${esc(exportText(build, false))}</textarea>
    <div class="actions"><button class="primary" data-act="copy">Copier</button><button data-act="dl-json">${isServer ? 'Enregistrer en fichier (.json)' : 'Copier la sauvegarde (.json)'}</button><button data-act="import">Importer un fichier…</button></div></div></div>`;
}
function download(name, text) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
function importFile() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    try {
      const d = JSON.parse(await inp.files[0].text());
      if (!d || !Array.isArray(d.lines)) throw 0;
      for (const c of d.custom || []) if (c && typeof c.id === 'string' && c.id.startsWith('c-') && CAT[c.cat] && !store.custom.some(x => x.id === c.id)) store.custom.push(c);
      const b = newBuild(String(d.name || 'Setup importé').slice(0, 80));
      b.lines = d.lines.filter(l => l && CAT[l.cat]).map(l => ({ cat: l.cat, pid: typeof l.pid === 'string' ? l.pid : undefined, qty: Math.max(1, Math.min(16, l.qty | 0 || 1)), ...(typeof l.price === 'number' ? { price: l.price } : {}), ...(typeof l.reserved === 'number' ? { reserved: l.reserved, label: String(l.label || '').slice(0, 60) } : {}) }));
      save(); closeModal(); showView('build'); refresh(); toast('Setup importé');
    } catch { toast('Fichier illisible'); }
  };
  inp.click();
}

function about() {
  $('#modal').hidden = false;
  $('#modal').innerHTML = `<div class="dlg small"><div class="dlg-h"><h2>À propos de SetupForge</h2><button class="ghost" data-act="close">✕</button></div><div class="dlg-b">
    <p>Configurateur de PC et de setup gratuit, sans compte, sans publicité. Tout fonctionne hors ligne ; vos setups sont enregistrés sur cet ordinateur.</p>
    <p><b>Données des pièces :</b> <a href="https://github.com/buildcores/buildcores-open-db" target="_blank" rel="noopener">BuildCores OpenDB</a>, sous licence <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.fr" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a> (usage non commercial). Modifications : champs réduits, prix estimés et scores ajoutés. SetupForge est un projet indépendant, non affilié à BuildCores.</p>
    <p><b>Prix :</b> la base ne contient pas de prix. Les montants précédés de « ≈ » sont des estimations indicatives calculées à partir des caractéristiques ; ils peuvent s'écarter nettement des prix du moment. Saisissez le prix réel dans la case pour le remplacer.</p>
    <p><b>3D :</b> <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> (licence MIT). La vue est schématique ; les dimensions viennent des fiches quand elles existent.</p></div></div>`;
}

// ------------------------------------------------------------------ navigation / événements
function showView(v) {
  for (const s of document.querySelectorAll('.view')) s.hidden = s.id !== 'v-' + v;
  for (const b of document.querySelectorAll('#side nav button')) b.classList.toggle('on', b.dataset.view === v);
  if (v === 'gen') renderGen();
  if (v === 'custom') renderCustom();
  if (v === 'build' && view3d) view3d.resize();
}

document.addEventListener('click', e => {
  const nav = e.target.closest('[data-view]'); if (nav) return showView(nav.dataset.view);
  const opt = e.target.closest('[data-opt]');
  if (opt) { const k = opt.dataset.opt, v = !view3d.opts[k]; opt.classList.toggle('on', v); view3d.setOption(k, v); renderFlow(); return; }
  const g = e.target.closest('[data-gen]'); if (g) { gen[g.dataset.gen] = g.dataset.v; return renderGen(); }
  const ex = e.target.closest('[data-exp]');
  if (ex) { for (const b of ex.parentNode.children) b.classList.toggle('on', b === ex); $('#exptxt').value = exportText(build, ex.dataset.exp === 'md'); return; }
  if (e.target.id === 'modal') return closeModal();
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, i = +el.dataset.i, id = el.dataset.id;
  if (a === 'about') e.preventDefault();
  switch (a) {
    case 'pick': return openPicker(el.dataset.cat);
    case 'replace': return openPicker(build.lines[i].cat, i);
    case 'remove': build.lines.splice(i, 1); save(); return refresh();
    case 'qty': { const l = build.lines[i]; l.qty = Math.max(1, Math.min(16, (l.qty || 1) + +el.dataset.d)); save(); return refresh(); }
    case 'choose': return choose(el.dataset.pid);
    case 'more': picker.limit += 120; return renderPicker();
    case 'close': return closeModal();
    case 'new-build': newBuild(); showView('build'); return refresh();
    case 'open-build': store.current = id; save(); showView('build'); view3d.ctx = null; return refresh();
    case 'dup-build': { const s = store.builds.find(b => b.id === id); const b = newBuild(s.name + ' (copie)'); b.lines = JSON.parse(JSON.stringify(s.lines)); save(); return refresh(); }
    case 'del-build': { if (!sure(el)) return; store.builds = store.builds.filter(b => b.id !== id); if (store.current === id) store.current = store.builds[0]?.id || null; save(); return refresh(); }
    case 'export': return openExport();
    case 'copy': return copyText($('#exptxt').value, $('#exptxt'));
    case 'dl-json': return (isServer ? t => download(build.name.replace(/[^\w\- ]+/g, '').trim() + '.json', t) : t => copyText(t))(JSON.stringify({ app: 'SetupForge', name: build.name, lines: build.lines, custom: store.custom.filter(c => build.lines.some(l => l.pid === c.id)) }, null, 1));
    case 'import': return importFile();
    case 'new-custom': return openCustom(el.dataset.cat);
    case 'edit-custom': return openCustom(null, id);
    case 'del-custom': if (!sure(el)) return; store.custom = store.custom.filter(p => p.id !== id); for (const b of store.builds) b.lines = b.lines.filter(l => l.pid !== id); save(); renderCustom(); return refresh();
    case 'gen-run': return runGen();
    case 'gen-again': gen.seed++; return runGen();
    case 'gen-use': { const b = newBuild(`Setup ${gen.budget} € — ${{ gaming: 'jeu', mixed: 'polyvalent', work: 'création' }[gen.usage]}`); b.lines = JSON.parse(JSON.stringify(gen.result.lines)); save(); showView('build'); view3d.ctx = null; return refresh(); }
    case 'about': return about();
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset.price != null) { const l = build.lines[+e.target.dataset.price]; const v = e.target.value; if (v === '') delete l.price; else l.price = Math.max(0, +v); save(); refresh(); }
  if (e.target.dataset.genc) gen[e.target.dataset.genc] = e.target.checked;
});
$('#bname').addEventListener('input', e => { build.name = e.target.value || 'Sans nom'; save(); renderBuilds(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });



(async function start() {
  await loadAll(f => { $('#loadbar').style.width = (f * 100) + '%'; });
  if (isServer) { fetch('api/ping').catch(() => {}); setInterval(() => fetch('api/ping').catch(() => {}), 5000); addEventListener('pagehide', () => navigator.sendBeacon('api/bye')); }
  if (matchMedia('(pointer: coarse)').matches) $('#hint3d').textContent = 'Touchez un emplacement pour choisir une pièce · glissez pour tourner · pincez pour zoomer';
  $('#loading').remove(); $('#app').hidden = false;
  try { view3d = new View3D($('#stage'), cat => openPicker(cat, CAT[cat].multi ? null : (i => i >= 0 ? i : null)(currentBuild().lines.findIndex(l => l.cat === cat)))); }
  catch (err) { $('#hint3d').textContent = 'La 3D n\'est pas disponible sur cet appareil (WebGL désactivé).'; console.error(err); }
  refresh();
})();
