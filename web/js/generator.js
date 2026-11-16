// Générateur de setup complet pour un budget donné.
// Les prix utilisés sont des estimations : le résultat est un point de départ à vérifier.
import { db, power } from './core.js';

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296;
}
const colorOk = (p, color) => !color || (p.col || []).includes(color);

// Choisit, parmi des candidats équivalents, celui qui colle le mieux aux préférences.
function prefer(list, opt, rand) {
  if (!list.length) return null;
  const score = p => (colorOk(p, opt.color) && opt.color ? 4 : 0) + (p.fr ? 2 : 0) + (p.az ? 1 : 0) + ((p.y || 0) >= 2023 ? 1 : 0);
  const best = Math.max(...list.map(score));
  const top = list.filter(p => score(p) === best);
  return top[Math.floor(rand() * top.length)];
}
// Meilleure pièce (selon quality) dont le prix ne dépasse pas le budget, sinon la moins chère.
function bestUnder(list, budget, quality, opt, rand) {
  const priced = list.filter(p => p.p != null);
  if (!priced.length) return null;
  const ok = priced.filter(p => p.p <= budget);
  if (!ok.length) {
    const min = Math.min(...priced.map(p => p.p));
    return prefer(priced.filter(p => p.p === min), opt, rand);
  }
  const q = Math.max(...ok.map(quality));
  return prefer(ok.filter(p => quality(p) >= q - 1e-9), opt, rand);
}
const cheapest = list => list.reduce((m, p) => (p.p != null && (m == null || p.p < m) ? p.p : m), null);

const TOWER = /Tower/;
const multi = c => c.s * 0.35 + (c.threads || c.cores || 4) * 4.5;

export function generate(opt, seed = 1) {
  const rand = rng(seed * 7919 + 13);
  const notes = [];
  const lines = [];
  const B = opt.budget;

  // --- hors tour : système, périphériques, écran
  let rest = B;
  let osItem = null;
  if (opt.os) {
    osItem = db.os.find(o => /windows 11 home/i.test(o.n) && o.p) || db.os.find(o => o.p);
    if (osItem) rest -= osItem.p;
  }
  const periph = opt.periph ? (B < 900 ? [35, 20, 30] : B < 1600 ? [60, 35, 50] : B < 2800 ? [100, 60, 90] : [160, 90, 150]) : null;
  if (periph) rest -= periph[0] + periph[1] + periph[2];
  const monBudget = opt.monitor ? Math.max(95, Math.min(1000, Math.round(B * 0.15))) : 0;
  rest -= monBudget;
  const core = rest;
  if (core < 380) return { error: 'Budget trop serré pour une tour complète avec ces options. Augmentez le budget ou décochez écran / périphériques / Windows.' };

  // --- candidats processeur / carte graphique
  const cpuSeen = new Set();
  const cpus = db.cpu.filter(c => c.p && c.s && !/OEM|Tray/.test(c.n) && (!opt.cpuBrand || c.m === opt.cpuBrand))
    .filter(c => !cpuSeen.has(c.n) && cpuSeen.add(c.n));
  const chip = new Map();
  for (const g of db.gpu) {
    if (!g.p || !g.s) continue;
    const brand = /GeForce/.test(g.chipset) ? 'NVIDIA' : /Radeon/.test(g.chipset) ? 'AMD' : 'Intel';
    if (opt.gpuBrand && brand !== opt.gpuBrand) continue;
    if (!chip.has(g.chipset)) chip.set(g.chipset, { chipset: g.chipset, s: g.s, p: g.p, tdp: g.tdp || 200, items: [] });
    chip.get(g.chipset).items.push(g);
  }
  const gpus = [...chip.values()];

  const ramCap = core < 650 ? 16 : core < 2300 ? 32 : 64;
  const ssdCap = core < 600 ? 500 : core < 1700 ? 1000 : 2000;
  const mobosFor = c => db.mobo.filter(m => m.p && m.socket === c.socket && (m.ff === 'ATX' || m.ff === 'Micro ATX') &&
    (c.socket === 'AM4' ? m.ramType === 'DDR4' : c.socket === 'LGA 1700' ? (core < 900 || m.ramType === 'DDR5') : m.ramType === 'DDR5'));
  const ramFor = type => db.ram.filter(r => r.p && r.type === type && !r.sodimm && r.qty === 2 && r.cap === ramCap);
  const ssds = db.storage.filter(s => s.p && s.type === 'SSD' && s.nvme && s.ff === 'M.2-2280' && s.cap >= ssdCap && s.cap <= ssdCap * 1.1);
  const psusFor = (need, gold) => db.psu.filter(p => p.p && p.ff === 'ATX' && p.w >= need && p.w <= need + 250 &&
    /Gold|Platinum|Titanium|Bronze|Silver/.test(p.eff || '') && (!gold || /Gold|Platinum|Titanium/.test(p.eff)));
  const coolerKind = c => (c.stock && (c.tdp || 65) <= 65 && core < 800) ? 'none' : ((c.tdp || 65) >= 120 && core > 1800) ? 'aio' : ((c.tdp || 65) >= 105 ? 'dual' : 'single');
  const coolersFor = (c, kind) => db.cooler.filter(k => k.p && (k.sockets || []).includes(c.socket) && (
    kind === 'aio' ? k.water && (k.rad === 240 || k.rad === 360) :
    kind === 'dual' ? !k.water && (k.fans || 1) >= 2 && (k.h || 160) <= 165 :
    !k.water && (k.fans || 1) === 1 && (k.h || 150) <= 160 && (k.h || 150) >= 120));
  const cases = db.case.filter(k => k.p && TOWER.test(k.ff || '') && !/Slim|Mini ITX/.test(k.ff));

  const memo = new Map();
  function platform(c) {
    if (memo.has(c.socket + coolerKind(c) + c.tdp)) return memo.get(c.socket + coolerKind(c) + c.tdp);
    const mobos = mobosFor(c);
    const mb = cheapest(mobos);
    let res = null;
    if (mb != null) {
      const type = mobos.find(m => m.p === mb).ramType;
      const ram = cheapest(ramFor(type)), ssd = cheapest(ssds);
      const kind = coolerKind(c);
      const cool = kind === 'none' ? 0 : cheapest(coolersFor(c, kind));
      if (ram != null && ssd != null && cool != null) res = { floor: mb + ram + ssd + cool + cheapest(cases), mb, ram, ssd, cool, kind };
    }
    memo.set(c.socket + coolerKind(c) + c.tdp, res);
    return res;
  }

  const wG = opt.usage === 'gaming' ? 0.72 : opt.usage === 'mixed' ? 0.55 : 0.3;
  // On garde une marge pour ne pas sacrifier carte mère, alimentation et boîtier sur les gros budgets.
  const reserve = Math.max(1, Math.min(1.6, 1 + (core - 700) / 2800));
  let best = null;
  const gpuOptions = gpus.concat([null]);
  for (const c of cpus) {
    const pf = platform(c);
    if (!pf) continue;
    const cScore = opt.usage === 'gaming' ? c.s : opt.usage === 'mixed' ? (c.s + multi(c)) / 2 : multi(c);
    for (const g of gpuOptions) {
      if (!g && !c.igpu) continue;
      const gs = g ? g.s : (/8[67]00G/.test(c.n) ? 34 : /8500G|5[67]00G/.test(c.n) ? 22 : 9);
      if (g && opt.usage !== 'work' && c.s < Math.min(125, g.s * 0.25 + 50)) continue; // évite un processeur qui bride la carte
      const need = Math.max(power({ cpu: c, gpu: g ? { tdp: g.tdp } : null, mobo: {}, ram: [], storage: [], fan: [], cooler: null }).reco, g ? 550 : 450);
      const psu = cheapest(psusFor(need, core > 1000));
      if (psu == null) continue;
      const cost = c.p + (g ? g.p : 0) + pf.floor + psu;
      if (c.p + (g ? g.p : 0) + (pf.floor + psu) * reserve > core) continue;
      const score = Math.pow(gs, wG) * Math.pow(cScore, 1 - wG);
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && cost < best.cost))
        best = { c, g, pf, psu, need, score, cost };
    }
  }
  if (!best) return { error: 'Aucune combinaison ne rentre dans ce budget avec ces préférences. Essayez un budget plus élevé ou « Indifférent » pour les marques.' };

  const { c, g, pf, need } = best;
  const cpuItem = prefer(db.cpu.filter(x => x.n === c.n), opt, rand) || c;
  const gpuItem = g ? prefer(g.items.filter(x => x.len), opt, rand) || prefer(g.items, opt, rand) : null;

  // --- répartition du reste entre les autres pièces : plancher + part du surplus
  const floors = { mobo: pf.mb, ram: pf.ram, ssd: pf.ssd, psu: best.psu, cool: pf.cool, cas: cheapest(cases) };
  const surplus = core - c.p - (g ? g.p : 0) - Object.values(floors).reduce((a, b) => a + b, 0);
  const W = { mobo: 0.27, ram: 0.12, ssd: 0.2, psu: 0.15, cool: pf.kind === 'none' ? 0 : 0.11, cas: 0.15 };
  const wSum = Object.values(W).reduce((a, b) => a + b, 0);
  const cap = { mobo: core * 0.14, ram: 1e9, ssd: core * 0.12, psu: core * 0.1, cool: core * 0.07, cas: core * 0.09 };
  const bud = k => Math.max(floors[k], Math.min(cap[k], floors[k] + surplus * W[k] / wSum));

  const mobo = bestUnder(mobosFor(c), bud('mobo'), m => m.p, opt, rand);
  const sweet = mobo.ramType === 'DDR5' ? 6000 : 3600;
  const ram = bestUnder(ramFor(mobo.ramType), bud('ram'), r => -Math.abs((r.speed || 0) - sweet) / 100 - (r.cl || 40) / 100, opt, rand);
  const ssd = bestUnder(ssds, bud('ssd'), s => (/4\.0/.test(s.itf) ? 2 : /5\.0/.test(s.itf) ? 3 : 1), opt, rand);
  const effRank = p => (/Titanium/.test(p.eff) ? 4 : /Platinum/.test(p.eff) ? 3 : /Gold/.test(p.eff) ? 2 : 1) + (p.mod === 'Full' ? 0.5 : 0);
  const psu = bestUnder(psusFor(need, core > 1000), bud('psu'), effRank, opt, rand);
  const cooler = pf.kind === 'none' ? null : bestUnder(coolersFor(c, pf.kind), bud('cool'), k => k.p, opt, rand);
  const caseOk = k => (k.mobos || []).some(f => f === mobo.ff) &&
    (!gpuItem || !gpuItem.len || !k.maxGpu || k.maxGpu >= gpuItem.len + 10) &&
    (!cooler || cooler.water || !cooler.h || !k.maxCooler || k.maxCooler >= cooler.h) &&
    (!cooler || !cooler.water || /Mid Tower|Full Tower/.test(k.ff));
  const pool = cases.filter(caseOk);
  const cas = bestUnder(pool.filter(k => k.dims && k.maxGpu), bud('cas'), k => k.p, opt, rand) || bestUnder(pool, bud('cas'), k => k.p, opt, rand);

  const add = (cat, p, extra) => p && lines.push({ cat, pid: p.id, qty: 1, ...extra });
  add('cpu', cpuItem); add('cooler', cooler); add('mobo', mobo); add('ram', ram); add('gpu', gpuItem);
  add('storage', ssd); add('psu', psu); add('case', cas); add('os', osItem);

  // --- écran adapté à la carte graphique
  const gs = g ? g.s : 20;
  if (opt.monitor) {
    const tiers = [];
    if (gs >= 200 && monBudget >= 450) tiers.push(m => m.rw === 3840 && m.rh === 2160 && m.hz >= 120);
    if (gs >= 110) tiers.push(m => m.rw === 2560 && m.rh === 1440 && m.hz >= 144);
    tiers.push(m => m.rw === 1920 && m.rh === 1080 && m.hz >= 120);
    tiers.push(m => m.rw === 1920 && m.rh === 1080);
    let mon = null;
    for (const t of tiers) {
      const list = db.monitor.filter(m => m.p && m.p <= monBudget && m.size >= 23 && m.size <= (m.rh <= 1080 ? 27.5 : 32.5) && t(m));
      if (list.length) { mon = bestUnder(list, monBudget, m => m.p + (m.hz || 0) / 10, {}, rand); break; }
    }
    if (mon) add('monitor', mon); else lines.push({ cat: 'monitor', reserved: monBudget, label: 'Écran à choisir' });
  }
  if (periph) {
    lines.push({ cat: 'keyboard', reserved: periph[0], label: 'Clavier à choisir' });
    lines.push({ cat: 'mouse', reserved: periph[1], label: 'Souris à choisir' });
    lines.push({ cat: 'headset', reserved: periph[2], label: 'Casque à choisir' });
  }

  const level = !g ? 'Bureautique, jeux légers en 1080p' : gs < 110 ? 'Jeu en 1080p' : gs < 160 ? 'Jeu en 1080p élevé / 1440p' : gs < 230 ? 'Jeu en 1440p' : gs < 300 ? 'Jeu en 1440p élevé / 4K' : 'Jeu en 4K';
  if (!g) notes.push('Pas de carte graphique dédiée à ce budget : le processeur s\'en charge. Vous pourrez en ajouter une plus tard.');
  if (pf.kind === 'none') notes.push('Le ventirad fourni avec le processeur est utilisé.');
  if (cooler && cooler.water) notes.push('Watercooling : vérifiez sur la fiche du boîtier l\'emplacement du radiateur.');
  notes.push('Les prix sont des estimations : vérifiez-les avec les liens marchands avant d\'acheter.');
  return { lines, notes, level, core, gpuScore: gs, cpuScore: c.s };
}
