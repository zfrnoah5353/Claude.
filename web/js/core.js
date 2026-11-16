// Données, sauvegarde, compatibilité, consommation, prix.

export const CATS = [
  { k: 'cpu', label: 'Processeur', icon: '▣' },
  { k: 'cooler', label: 'Refroidissement', icon: '❄' },
  { k: 'mobo', label: 'Carte mère', icon: '▦' },
  { k: 'ram', label: 'Mémoire', icon: '▥', multi: true },
  { k: 'gpu', label: 'Carte graphique', icon: '▬' },
  { k: 'storage', label: 'Stockage', icon: '◫', multi: true },
  { k: 'psu', label: 'Alimentation', icon: '⚡' },
  { k: 'case', label: 'Boîtier', icon: '▯' },
  { k: 'fan', label: 'Ventilateurs', icon: '✣', multi: true },
  { k: 'os', label: 'Système', icon: '⊞' },
  { k: 'monitor', label: 'Écran', icon: '▭', multi: true, setup: true },
  { k: 'keyboard', label: 'Clavier', icon: '⌨', setup: true },
  { k: 'mouse', label: 'Souris', icon: '◖', setup: true },
  { k: 'headset', label: 'Casque', icon: '◠', setup: true },
];
export const CAT = Object.fromEntries(CATS.map(c => [c.k, c]));

export const db = {};      // cat -> [pièces]
const index = {};          // cat -> Map(id -> pièce)
export let store = { builds: [], custom: [], current: null };
export let isServer = false;
const LS_KEY = 'setupforge-store';

export async function loadAll(onProgress) {
  let done = 0;
  await Promise.all(CATS.map(async c => {
    const r = await fetch(`data/${c.k}.json`);
    db[c.k] = await r.json();
    index[c.k] = new Map(db[c.k].map(p => [p.id, p]));
    onProgress && onProgress(++done / CATS.length);
  }));
  // Version .exe : sauvegarde dans un fichier via le serveur local. Version web / téléphone : dans le navigateur.
  try {
    const r = await fetch('api/store');
    if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw 0;
    store = Object.assign(store, await r.json()); isServer = true;
  } catch {
    try { store = Object.assign(store, JSON.parse(localStorage.getItem(LS_KEY) || '{}')); } catch { /* stockage indisponible */ }
  }
  store.builds ||= []; store.custom ||= [];
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (isServer) fetch('api/store', { method: 'PUT', body: JSON.stringify(store) }).catch(() => {});
    else try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch { /* stockage indisponible */ }
  }, 250);
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export function getPart(cat, id) {
  if (!id) return null;
  if (id.startsWith('c-')) return store.custom.find(p => p.id === id) || null;
  return index[cat]?.get(id) || null;
}
export function partsOf(cat) {
  return store.custom.filter(p => p.cat === cat).concat(db[cat] || []);
}

export function newBuild(name = 'Nouveau setup') {
  const b = { id: uid(), name, lines: [], created: Date.now() };
  store.builds.unshift(b); store.current = b.id; save();
  return b;
}
export function currentBuild() {
  return store.builds.find(b => b.id === store.current) || store.builds[0] || newBuild('Mon premier setup');
}

// Contexte résolu d'un setup : { cpu, mobo, ..., ram:[{p,qty}], ... }
export function context(build) {
  const ctx = { ram: [], storage: [], fan: [], monitor: [] };
  for (const l of build.lines) {
    const p = getPart(l.cat, l.pid);
    if (!p) continue;
    if (CAT[l.cat].multi) ctx[l.cat].push({ p, qty: l.qty || 1 });
    else ctx[l.cat] = p;
  }
  return ctx;
}

export const eur = v => v == null ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' €';

export function linePrice(l) {
  if (l.price != null) return l.price * (l.qty || 1);
  const p = getPart(l.cat, l.pid);
  if (p && p.p != null) return p.p * (l.qty || 1);
  if (l.reserved != null) return l.reserved;
  return null;
}
export function totals(build) {
  let sum = 0, unknown = 0, estimated = 0;
  for (const l of build.lines) {
    const v = linePrice(l);
    if (v == null) unknown++; else sum += v;
    if (l.price == null && v != null) estimated++;
  }
  return { sum, unknown, estimated };
}

// ------------------------------------------------------------------ consommation
export function power(ctx) {
  let w = 0;
  if (ctx.cpu) w += (ctx.cpu.tdp || 95) * 1.5;
  if (ctx.gpu) w += ctx.gpu.tdp || 150;
  if (ctx.mobo) w += 50;
  for (const r of ctx.ram) w += 4 * (r.p.qty || 1) * r.qty;
  for (const s of ctx.storage) w += (s.p.type === 'HDD' ? 9 : 5) * s.qty;
  for (const f of ctx.fan) w += 3 * (f.p.qty || 1) * f.qty;
  if (ctx.cooler) w += ctx.cooler.water ? 12 : 4;
  const draw = Math.round(w);
  const reco = Math.max(450, Math.ceil(draw * 1.4 / 50) * 50);
  return { draw, reco };
}

// ------------------------------------------------------------------ compatibilité
const FF_ALIAS = { 'Micro ATX': ['Micro ATX', 'MicroATX', 'mATX'], 'Mini-ITX': ['Mini-ITX', 'Mini ITX'], 'EATX': ['EATX', 'E-ATX'] };
const sameFF = (a, b) => a === b || (FF_ALIAS[a] || []).includes(b) || (FF_ALIAS[b] || []).includes(a);

export function check(ctx) {
  const out = [];
  const err = (msg, ...cats) => out.push({ level: 'err', msg, cats });
  const warn = (msg, ...cats) => out.push({ level: 'warn', msg, cats });
  const info = (msg, ...cats) => out.push({ level: 'info', msg, cats });
  const { cpu, mobo, gpu, psu, cooler } = ctx, cas = ctx.case;

  if (cpu && mobo && cpu.socket && mobo.socket && cpu.socket !== mobo.socket)
    err(`Le processeur (${cpu.socket}) ne se monte pas sur la carte mère (${mobo.socket}).`, 'cpu', 'mobo');

  const sticks = ctx.ram.reduce((n, r) => n + (r.p.qty || 1) * r.qty, 0);
  const ramGb = ctx.ram.reduce((n, r) => n + (r.p.cap || 0) * r.qty, 0);
  for (const r of ctx.ram) {
    if (mobo && r.p.type && mobo.ramType && r.p.type !== mobo.ramType)
      err(`Mémoire ${r.p.type} incompatible avec la carte mère (${mobo.ramType}).`, 'ram', 'mobo');
    else if (cpu && !mobo && r.p.type && cpu.mem && !cpu.mem.includes(r.p.type))
      err(`Le processeur ne gère pas la mémoire ${r.p.type}.`, 'ram', 'cpu');
    if (r.p.sodimm) err('Barrettes SO-DIMM (format portable) : elles ne rentrent pas sur une carte mère de bureau.', 'ram');
  }
  if (mobo && mobo.ramSlots && sticks > mobo.ramSlots)
    err(`${sticks} barrettes pour ${mobo.ramSlots} emplacements sur la carte mère.`, 'ram', 'mobo');
  if (mobo && mobo.ramMax && ramGb > mobo.ramMax)
    warn(`${ramGb} Go de mémoire : la carte mère est limitée à ${mobo.ramMax} Go.`, 'ram', 'mobo');
  if (ctx.ram.length > 1) info('Plusieurs kits mémoire différents : la stabilité à haute fréquence n\'est pas garantie.', 'ram');

  if (cooler && cpu && cooler.sockets && cpu.socket && !cooler.sockets.includes(cpu.socket))
    err(`Le refroidissement ne prend pas en charge le socket ${cpu.socket}.`, 'cooler', 'cpu');
  if (cooler && cas && !cooler.water && cooler.h && cas.maxCooler && cooler.h > cas.maxCooler)
    err(`Ventirad trop haut (${cooler.h} mm) pour le boîtier (max ${cas.maxCooler} mm).`, 'cooler', 'case');
  if (cpu && !cooler && !cpu.stock)
    warn('Ce processeur est vendu sans ventirad : ajoutez un refroidissement.', 'cooler', 'cpu');
  if (cooler && cooler.water && cas) info('Watercooling : vérifiez que le boîtier accepte un radiateur de ' + (cooler.rad || '?') + ' mm.', 'cooler', 'case');

  if (gpu && cas && gpu.len && cas.maxGpu && gpu.len > cas.maxGpu)
    err(`Carte graphique trop longue (${gpu.len} mm) pour le boîtier (max ${cas.maxGpu} mm).`, 'gpu', 'case');
  if (cpu && !gpu && !cpu.igpu)
    err('Aucune sortie vidéo : ce processeur n\'a pas de puce graphique, ajoutez une carte graphique.', 'gpu', 'cpu');

  if (mobo && cas && mobo.ff && cas.mobos && cas.mobos.length && !cas.mobos.some(f => sameFF(f, mobo.ff)))
    err(`Le boîtier n'accepte pas les cartes mères ${mobo.ff}.`, 'mobo', 'case');
  if (psu && cas && psu.ff && cas.psus && cas.psus.length && !cas.psus.some(f => sameFF(f, psu.ff)))
    err(`Le boîtier n'accepte pas les alimentations ${psu.ff}.`, 'psu', 'case');

  const pw = power(ctx);
  if (psu && psu.w && (cpu || gpu)) {
    if (psu.w < pw.draw) err(`Alimentation insuffisante : ${psu.w} W pour environ ${pw.draw} W consommés.`, 'psu');
    else if (psu.w < pw.draw * 1.2) warn(`Alimentation juste : ${psu.w} W pour ~${pw.draw} W. ${pw.reco} W conseillés.`, 'psu');
  }
  if (psu && gpu) {
    const need8 = (gpu.c8 || 0) + (gpu.c6 || 0);
    if (need8 && psu.c8 != null && need8 > psu.c8 && !(psu.c12 && gpu.c12))
      warn(`La carte graphique demande ${need8} connecteur(s) PCIe, l'alimentation en fournit ${psu.c8 || 0}.`, 'psu', 'gpu');
    if (gpu.c12 && !psu.c12) info('Connecteur 12VHPWR / 12V-2x6 : un adaptateur (souvent fourni avec la carte) sera nécessaire.', 'psu', 'gpu');
  }

  if (mobo) {
    const m2 = ctx.storage.reduce((n, s) => n + ((s.p.ff || '').startsWith('M.2') ? s.qty : 0), 0);
    const sata = ctx.storage.reduce((n, s) => n + (/SATA/.test(s.p.itf || '') && !(s.p.ff || '').startsWith('M.2') ? s.qty : 0), 0);
    if (m2 && mobo.m2 != null && m2 > mobo.m2) err(`${m2} SSD M.2 pour ${mobo.m2 || 0} emplacement(s) M.2.`, 'storage', 'mobo');
    if (sata && mobo.sata && sata > mobo.sata) err(`${sata} disques SATA pour ${mobo.sata} ports.`, 'storage', 'mobo');
  }
  if ((cpu || mobo) && !ctx.storage.length) info('Aucun stockage : il en faut au moins un pour installer le système.', 'storage');
  return out;
}

// La pièce p (catégorie cat) est-elle compatible avec le reste du setup ?
export function fits(ctx, cat, p) {
  const c = { ...ctx };
  if (CAT[cat].multi) c[cat] = [{ p, qty: 1 }]; else c[cat] = p;
  return !check(c).some(i => i.level === 'err' && i.cats.includes(cat));
}

// ------------------------------------------------------------------ descriptions
const j = a => a.filter(Boolean).join(' · ');
export function spec(cat, p) {
  switch (cat) {
    case 'cpu': return j([p.socket, p.cores && `${p.cores} cœurs / ${p.threads} threads`, p.boost && `${p.boost} GHz`, p.tdp && `${p.tdp} W`, p.igpu && 'puce graphique']);
    case 'mobo': return j([p.socket, p.ff, p.chipset, p.ramType, p.m2 && `${p.m2}× M.2`]);
    case 'ram': return j([p.type && `${p.type}-${p.speed || '?'}`, p.qty && `${p.qty}×${p.per} Go`, p.cl && `CL${p.cl}`, p.rgb && 'RGB']);
    case 'gpu': return j([p.chipset, p.vram && `${p.vram} Go`, p.len && `${p.len} mm`, p.tdp && `${p.tdp} W`]);
    case 'storage': return j([p.cap && (p.cap >= 1000 ? `${+(p.cap / 1000).toFixed(1)} To` : `${p.cap} Go`), p.type, p.ff, p.itf]);
    case 'psu': return j([p.w && `${p.w} W`, p.eff, p.mod === 'Full' ? 'modulaire' : p.mod === 'Semi-Modular' ? 'semi-modulaire' : '', p.ff]);
    case 'case': return j([p.ff, p.maxGpu && `GPU ≤ ${p.maxGpu} mm`, p.maxCooler && `ventirad ≤ ${p.maxCooler} mm`, p.glass && 'vitré']);
    case 'cooler': return j([p.water ? `Watercooling ${p.rad || ''} mm` : 'Ventirad', !p.water && p.h && `${p.h} mm`, p.fans && `${p.fans} ventilateur(s)`]);
    case 'fan': return j([p.size && `${p.size} mm`, p.qty > 1 && `pack de ${p.qty}`, p.cfm && `${p.cfm} CFM`, p.rgb && 'RGB']);
    case 'monitor': return j([p.size && `${p.size}"`, p.rw && `${p.rw}×${p.rh}`, p.hz && `${p.hz} Hz`, p.panel]);
    default: return p.m || '';
  }
}

export function links(p) {
  const q = encodeURIComponent(p.n);
  const out = [];
  if (p.url) out.push(['Lien', p.url]);
  if (p.az && p.fr) out.push(['Amazon', `https://www.amazon.fr/dp/${p.az}`]);
  else out.push(['Amazon', `https://www.amazon.fr/s?k=${q}`]);
  out.push(['idealo', `https://www.idealo.fr/prechcat.html?q=${q}`]);
  out.push(['LDLC', `https://www.ldlc.com/recherche/${q}/`]);
  return out;
}

export function exportText(build, md) {
  const rows = build.lines.map(l => {
    const p = getPart(l.cat, l.pid);
    const name = p ? p.n : (l.label || 'Budget réservé');
    return [CAT[l.cat].label, (l.qty > 1 ? `${l.qty}× ` : '') + name, eur(linePrice(l)) + (l.price == null && linePrice(l) != null ? ' (est.)' : '')];
  });
  const t = totals(build);
  if (md) return `**${build.name}**\n\n| Composant | Modèle | Prix |\n|:--|:--|--:|\n` +
    rows.map(r => `| ${r.join(' | ')} |`).join('\n') + `\n| | **Total** | **${eur(t.sum)}** |\n`;
  return `${build.name}\n${'='.repeat(build.name.length)}\n` + rows.map(r => `${r[0].padEnd(17)} ${r[1]}  —  ${r[2]}`).join('\n') + `\n\nTotal : ${eur(t.sum)}\n`;
}
