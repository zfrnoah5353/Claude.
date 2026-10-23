// Pets Commun → Légendaire : 10 espèces mignonnes en facettes, décorées selon leur monde.
// Plus le pet est rare, plus il porte d'accessoires (thème, collier, objets en orbite, auréole).
import { Forge, V, euler, aim, shade } from '../forge.js';
import { leg, wing, floaters, spikeRow, shardTail, onEll } from '../parts.js';

const GOLD = 'E8B64A';

// gros yeux mignons : blanc, pupille, reflet
function cuteEyes(F, c, dx, s, pupil = '2A1F3D') {
  for (const sx of [-1, 1]) {
    const p = c.clone().add(V(dx * sx, 0, 0));
    F.ell(V(s, s * 1.15, s * 0.45), p, euler(0, -0.25 * sx, 0), 'FFFFFF', 'plastic', 1);
    F.ell(V(s * 0.68, s * 0.82, s * 0.3), p.clone().add(V(0, -s * 0.08, -s * 0.22)), euler(0, -0.25 * sx, 0), pupil, 'plastic', 1);
    F.ell(V(s * 0.22, s * 0.22, s * 0.1), p.clone().add(V(s * 0.25 * -sx, s * 0.3, -s * 0.48)), null, 'FFFFFF', 'neon', 0);
  }
}

// ---- objets de thème (un par monde) ----
const THEME = {
  candy: (F, p, s, i) => { const cols = ['FF5A8A', '7FD6FF', 'FFD23F', '7EE0B8']; F.seg(p.clone().add(V(0, -0.5 * s, 0)), p, 0.04 * s, 0.04 * s, 'FFFFFF', 'plastic', 5); F.seg(p.clone().add(V(0, 0, 0.05 * s)), p.clone().add(V(0, 0, -0.05 * s)), 0.3 * s, 0.3 * s, cols[i % 4], 'plastic', 12); F.ring(0.2 * s, 0.05 * s, p.clone().add(V(0, 0, -0.06 * s)), null, 'FFFFFF', 'plastic', 12, 3); },
  berry: (F, p, s) => { F.ell(V(0.22, 0.24, 0.22).multiplyScalar(s), p, null, 'D8344E', 'plastic', 1); for (let k = 0; k < 3; k++) F.shard(p.clone().add(V(0, 0.2 * s, 0)), V(Math.cos(k * 2.1), 0.6, Math.sin(k * 2.1)), 0.2 * s, 0.08 * s, '3DBE5C', 'plastic'); },
  choco: (F, p, s) => { F.box(V(0.4, 0.4, 0.12).multiplyScalar(s), p, euler(0.2, 0.5, 0.1), '5A3424'); for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) F.box(V(0.16, 0.16, 0.06).multiplyScalar(s), p.clone().add(V(x * 0.1 * s, y * 0.1 * s, -0.07 * s)), euler(0.2, 0.5, 0.1), '6E4430'); },
  mocha: (F, p, s) => { F.ell(V(0.18, 0.26, 0.14).multiplyScalar(s), p, euler(0, 0, 0.4), '6A3E22', 'plastic', 1); F.box(V(0.03, 0.4, 0.03).multiplyScalar(s), p.clone().add(V(0, 0, -0.13 * s)), euler(0, 0, 0.4), '3A2010'); },
  frost: (F, p, s) => { for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; F.spike(p, V(Math.cos(a), Math.sin(a), 0), 0.3 * s, 0.06 * s, k % 2 ? 'CFF3FF' : 'FFFFFF', 'plastic', 4); } },
  sundae: (F, p, s) => { F.ell(V(0.17, 0.17, 0.17).multiplyScalar(s), p, null, 'E8344E', 'plastic', 1); F.seg(p.clone().add(V(0, 0.12 * s, 0)), p.clone().add(V(0.08 * s, 0.4 * s, 0)), 0.02 * s, 0.015 * s, '3DBE5C', 'plastic', 4); },
  nebula: (F, p, s) => { F.ell(V(0.22, 0.22, 0.22).multiplyScalar(s), p, null, 'C04BD8', 'plastic', 1); F.ring(0.36 * s, 0.035 * s, p, euler(1.2, 0.3, 0), '7FD6FF', 'neon', 20, 3); },
  star: (F, p, s) => { for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + Math.PI / 2; F.spike(p, V(Math.cos(a), Math.sin(a), 0), 0.3 * s, 0.1 * s, 'FFD23F', 'neon', 4); } },
};
// petites décorations posées sur la tête, selon le monde
const HAT = {
  candy: (F, p, C) => { const cols = ['FF5A8A', '7FD6FF', 'FFD23F', '7EE0B8', 'FFFFFF']; for (let k = 0; k < 14; k++) { const th = F.rand(0, 6.28), ph = F.rand(0, 0.9); const n = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)); F.box(V(0.035, 0.12, 0.035), p.clone().addScaledVector(n, 0.02), aim(n, F.rand(0, 3)).multiply(euler(Math.PI / 2, 0, 0)), cols[k % 5]); } },
  berry: (F, p) => { for (const dx of [-0.12, 0.1]) THEME.berry(F, p.clone().add(V(dx, 0.08, 0.05)), 0.75); },
  choco: (F, p) => { F.ell(V(0.5, 0.14, 0.5), p.clone().add(V(0, 0.02, 0)), null, '5A3424', 'plastic', 1); for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28; F.ell(V(0.07, 0.16, 0.07), p.clone().add(V(Math.cos(a) * 0.42, -0.1, Math.sin(a) * 0.42)), null, '5A3424', 'plastic', 1); } },
  mocha: (F, p) => { F.seg(p, p.clone().add(V(0, 0.22, 0)), 0.18, 0.22, 'FFFFFF', 'plastic', 10); F.ell(V(0.2, 0.06, 0.2), p.clone().add(V(0, 0.22, 0)), null, '7A4E36', 'plastic', 1); F.ring(0.08, 0.025, p.clone().add(V(0.22, 0.11, 0)), euler(0, Math.PI / 2, 0), 'FFFFFF', 'plastic', 8, 3); },
  frost: (F, p) => { for (let k = 0; k < 5; k++) F.spike(p.clone().add(V((k - 2) * 0.12, 0, 0)), V((k - 2) * 0.2, 1, 0), 0.3 - Math.abs(k - 2) * 0.06, 0.06, k % 2 ? 'CFF3FF' : 'FFFFFF', 'plastic', 4); },
  sundae: (F, p) => { for (let k = 0; k < 3; k++) F.ell(V(0.32 - k * 0.09, 0.1, 0.32 - k * 0.09), p.clone().add(V(0, k * 0.1, 0)), euler(0, k, 0), 'FFFFFF', 'plastic', 1); THEME.sundae(F, p.clone().add(V(0, 0.36, 0)), 0.9); },
  nebula: (F, p) => { F.ring(0.48, 0.03, p.clone().add(V(0, 0.08, 0)), euler(Math.PI / 2 + 0.2, 0, 0.15), '7FD6FF', 'neon', 24, 3); THEME.star(F, p.clone().add(V(0.15, 0.25, 0)), 0.5); },
  star: (F, p) => { THEME.star(F, p.clone().add(V(0.12, 0.2, 0)), 0.7); },
};

// ---- corps de base des petites créatures ----
function critter(F, C, o) {
  const body = F.bone('Body', V(0, 0.9, 0));
  F.at(body);
  const bc = V(0, 0.95, 0.15), bs = V(0.72, 0.66, 0.82).multiplyScalar(o.bodyK || 1);
  F.ell(bs, bc, null, C.body, 'plastic', 2);
  F.ell(V(bs.x * 0.7, bs.y * 0.75, bs.z * 0.6), bc.clone().add(V(0, -0.08, -0.32)), null, C.belly, 'plastic', 1);
  if (o.fur) for (let i = 0; i < o.fur; i++) {
    const { p, n } = onEll(bc, bs, F.rand(0, 6.28), Math.acos(F.rand(-0.2, 1)));
    F.shard(p.addScaledVector(n, -0.03), n.clone().multiplyScalar(0.5).add(V(0, -0.4, 0.6)), 0.24, 0.09, i % 3 ? C.body : shade(C.body, -0.12), 'plastic', n);
  }
  const head = F.bone('Head', V(0, 1.45, -0.25), body);
  F.at(head);
  const hk = o.headK || 1;
  const hc = V(0, 1.95, -0.35), hs = V(0.74, 0.66, 0.66).multiplyScalar(hk);
  F.ell(hs, hc, null, C.body, 'plastic', 2);
  const face = hc.z - hs.z;
  F.ell(V(0.36, 0.24, 0.2).multiplyScalar(hk), V(0, 1.78, face + 0.08), null, C.belly, 'plastic', 1);
  F.ell(V(0.07, 0.055, 0.05), V(0, 1.86, face - 0.08), null, o.nose || '3A2A4A', 'plastic', 1);
  cuteEyes(F, V(0, 2.03, face + 0.06), 0.27 * hk, 0.13 * hk);
  for (const sx of [-1, 1]) F.ell(V(0.1, 0.055, 0.03), V(sx * 0.42 * hk, 1.82, face + 0.14), euler(0, -0.6 * sx, 0), 'FF9AB8', 'plastic', 0);
  F.at(body);
  const legs = [];
  [[-0.38, -0.3, 0], [0.38, -0.3, Math.PI], [-0.38, 0.55, Math.PI], [0.38, 0.55, 0]].forEach(([x, z, ph], i) => {
    legs.push(leg(F, `Leg${i + 1}`, body, V(x, 0.7, z), V(x, 0.42, z - 0.02), V(x, 0.14, z - 0.04), 0.17, C.body, { walk: ph, paw: C.belly, abAmp: 6 }));
  });
  F.at(0);
  return { body, head, hc, hs, face, top: V(0, hc.y + hs.y * 0.92, hc.z) };
}

// ---- espèces ----
const SPECIES = {
  bunny(F, C) {
    const r = critter(F, C, {});
    F.at(r.head);
    for (const sx of [-1, 1]) {
      const e = F.chain(sx < 0 ? 'EarL' : 'EarR', [V(sx * 0.25, 2.45, -0.3), V(sx * 0.32, 2.95, -0.25), V(sx * 0.36, 3.4, -0.15)], [0.13, 0.14, 0.09], C.body, { parent: r.head, segs: 6, joint: true,
        deco: (i, f) => F.seg(f.a.clone().add(V(0, 0, -0.06)), f.b.clone().add(V(0, 0, -0.06)), f.r * 0.55, f.r2 * 0.55, 'FFB8CF', 'plastic', 5) });
      e.forEach((b, i) => { F.anim('idle', b, [1, 0, 0], 6, 0.5, sx + i); F.anim('move', b, [1, 0, 0], 14, 1, i * 0.8, 10); F.anim('ability', b, [1, 0, 0], 10, 1, i); });
    }
    F.at(r.head);
    for (const sx of [-1, 1]) F.box(V(0.08, 0.1, 0.03), V(sx * 0.045, 1.66, r.face + 0.03), null, 'FFFFFF');
    F.at(r.body);
    F.ell(V(0.24, 0.24, 0.24), V(0, 1.05, 1.0), null, C.belly, 'plastic', 1);
    F.bob('move', 0.55, 1);
    return r;
  },
  cat(F, C) {
    const r = critter(F, C, { fur: 20 });
    F.at(r.head);
    for (const sx of [-1, 1]) {
      F.spike(V(sx * 0.42, 2.38, -0.35), V(sx * 0.4, 1, 0), 0.45, 0.2, C.body, 'plastic', 4);
      F.spike(V(sx * 0.42, 2.4, -0.4), V(sx * 0.4, 1, 0), 0.32, 0.1, 'FFB8CF', 'plastic', 3);
      for (const dy of [-0.04, 0.04]) F.seg(V(sx * 0.25, 1.8 + dy, r.face + 0.05), V(sx * 0.7, 1.82 + dy * 3, r.face + 0.2), 0.012, 0.008, 'FFFFFF', 'plastic', 3);
    }
    shardTail(F, 'Tail', r.body, [V(0, 1.0, 0.9), V(0, 1.35, 1.25), V(0, 1.85, 1.3), V(0.2, 2.15, 1.1)], [0.12, 0.11, 0.1, 0.09], C.body, [C.body], 2, 0.2);
    return r;
  },
  pup(F, C) {
    const r = critter(F, C, { fur: 14 });
    F.at(r.head);
    for (const sx of [-1, 1]) F.ell(V(0.17, 0.38, 0.12), V(sx * 0.66, 1.92, -0.3), euler(0, 0, sx * 0.35), C.dark || shade(C.body, -0.25), 'plastic', 1);
    F.ell(V(0.12, 0.05, 0.12), V(0, 1.66, r.face + 0.02), euler(0.6, 0, 0), 'FF6F91', 'plastic', 1);
    F.ell(V(0.2, 0.14, 0.04), V(0.25, 2.12, r.face + 0.1), null, C.dark || shade(C.body, -0.25), 'plastic', 1);
    const t = F.chain('Tail', [V(0, 1.15, 0.95), V(0, 1.45, 1.15), V(0, 1.7, 1.15)], [0.1, 0.09, 0.07], C.body, { parent: r.body, segs: 6, joint: true });
    t.forEach((b, i) => { F.anim('idle', b, [0, 0, 1], 20, 1, -i); F.anim('move', b, [0, 0, 1], 28, 1.5, -i); F.anim('ability', b, [0, 0, 1], 30, 1.5, -i); });
    return r;
  },
  fox(F, C) {
    const r = critter(F, C, { fur: 24 });
    F.at(r.head);
    for (const sx of [-1, 1]) {
      F.spike(V(sx * 0.38, 2.35, -0.35), V(sx * 0.3, 1, 0.05), 0.62, 0.22, C.body, 'plastic', 4);
      F.spike(V(sx * 0.38, 2.37, -0.41), V(sx * 0.3, 1, 0.05), 0.45, 0.1, C.belly, 'plastic', 3);
      F.spike(V(sx * 0.38, 2.35 + 0.55, -0.35 + 0.03), V(sx * 0.3, 1, 0.05), 0.12, 0.08, '3A2A2A', 'plastic', 4);
    }
    F.seg(V(0, 1.84, r.face + 0.2), V(0, 1.8, r.face - 0.1), 0.2, 0.08, C.belly, 'plastic', 6);
    // grande queue touffue, pointe blanche
    const pts = [V(0, 1.0, 0.95), V(0, 1.3, 1.45), V(0, 1.8, 1.7), V(0, 2.3, 1.6)];
    const t = F.chain('Tail', pts, [0.18, 0.32, 0.34, 0.2], C.body, { parent: r.body, segs: 7, joint: true,
      deco: (i, f) => { for (let k = 0; k < 10; k++) { const a = F.rand(0, 6.28); const n = f.side.clone().multiplyScalar(Math.cos(a)).addScaledVector(f.top, Math.sin(a)); F.shard(f.a.clone().lerp(f.b, F.rand(0, 1)).addScaledVector(n, f.r * 0.8), n.clone().multiplyScalar(0.5).add(f.t), 0.3, 0.1, i === 2 ? C.belly : C.body, 'plastic', n); } } });
    F.at(t[2]); F.ell(V(0.2, 0.22, 0.2), pts[3], null, C.belly, 'plastic', 1);
    t.forEach((b, i) => { F.anim('idle', b, [0, 1, 0], 10, 0.5, -i * 0.6); F.anim('move', b, [0, 1, 0], 16, 1, -i * 0.6); F.anim('ability', b, [1, 0, 0], 12, 1, -i * 0.5); });
    F.at(0);
    return r;
  },
  bear(F, C) {
    const r = critter(F, C, { bodyK: 1.12, fur: 18 });
    F.at(r.head);
    for (const sx of [-1, 1]) { F.ell(V(0.2, 0.2, 0.12), V(sx * 0.52, 2.45, -0.3), null, C.body, 'plastic', 1); F.ell(V(0.11, 0.11, 0.06), V(sx * 0.52, 2.45, -0.38), null, C.belly, 'plastic', 1); }
    F.at(r.body); F.ell(V(0.14, 0.14, 0.14), V(0, 0.95, 1.05), null, C.body, 'plastic', 1);
    return r;
  },
  dragon(F, C) {
    const r = critter(F, C, {});
    F.at(r.head);
    for (const sx of [-1, 1]) {
      F.seg(V(sx * 0.32, 2.4, -0.15), V(sx * 0.45, 2.8, 0.1), 0.09, 0.03, C.accent || GOLD, 'gold', 5);
      F.spike(V(sx * 0.62, 2.05, -0.2), V(sx, 0.3, 0.3), 0.3, 0.1, C.dark, 'plastic', 3);
    }
    for (const sx of [-1, 1]) F.ell(V(0.035, 0.03, 0.03), V(sx * 0.08, 1.86, r.face - 0.1), null, '3A2A4A', 'plastic', 0);
    spikeRow(F, V(0, 2.55, -0.25), V(0, 2.2, 0.25), 3, () => V(0, 1, 0.5), () => 0.22, 0.35, [C.dark], 'plastic');
    F.at(r.body);
    spikeRow(F, V(0, 1.6, -0.2), V(0, 1.45, 0.75), 4, () => V(0, 1, 0.4), () => 0.22, 0.35, [C.dark], 'plastic');
    for (let i = 0; i < 4; i++) F.box(V(0.5 - i * 0.05, 0.06, 0.14), V(0, 0.82 - i * 0.12, -0.55 + i * 0.03), euler(0.5, 0, 0), C.accent || GOLD, 'plastic');
    [-1, 1].forEach((sx) => wing(F, sx < 0 ? 'WingL' : 'WingR', r.body, V(sx * 0.45, 1.45, 0.1), sx, 1.1, [C.dark, shade(C.dark, 0.2), C.belly], { rows: 2, per: 5, fw: 0.45 }));
    const pts = [V(0, 0.9, 0.9), V(0, 0.75, 1.35), V(0, 0.75, 1.8), V(0, 0.95, 2.15)];
    const t = F.chain('Tail', pts, [0.2, 0.15, 0.1, 0.05], C.body, { parent: r.body, segs: 6, joint: true });
    F.at(t[2]); F.spike(pts[3], V(0, 0.6, 1), 0.3, 0.15, C.dark, 'plastic', 4);
    t.forEach((b, i) => { F.anim('idle', b, [0, 1, 0], 8, 0.5, -i * 0.6); F.anim('move', b, [0, 1, 0], 14, 1, -i * 0.6); F.anim('ability', b, [1, 0, 0], 14, 1, -i * 0.5, -6); });
    F.at(0);
    return r;
  },
  unicorn(F, C) {
    const r = critter(F, C, { headK: 0.95 });
    const MANE = ['FF9EC4', 'B69CFF', '7FD6FF', 'FFE27A', '7EE0B8'];
    F.at(r.head);
    F.seg(V(0, 2.45, -0.62), V(0, 3.05, -0.85), 0.11, 0.015, C.accent || GOLD, 'gold', 5);
    for (let k = 0; k < 3; k++) F.ring(0.1 - k * 0.025, 0.018, V(0, 2.52 + k * 0.15, -0.65 - k * 0.06), aim(V(0, 1, -0.4)).multiply(euler(Math.PI / 2, 0, 0)), 'FFFFFF', 'plastic', 8, 3);
    for (const sx of [-1, 1]) F.spike(V(sx * 0.32, 2.4, -0.25), V(sx * 0.3, 1, 0.1), 0.35, 0.12, C.body, 'plastic', 4);
    for (let k = 0; k < 12; k++) F.shard(V(F.rand(-0.12, 0.12), 2.55 - k * 0.08, -0.25 + k * 0.08), V(F.rand(-0.6, 0.6), 0.2, 1), 0.4, 0.13, MANE[k % 5], 'plastic', V(1, 0, 0));
    F.at(r.body);
    for (let k = 0; k < 8; k++) F.shard(V(0, 1.1, 0.9), V((k - 3.5) * 0.15, -0.5, 1), 0.7, 0.13, MANE[k % 5], 'plastic', V(0, 1, 0));
    F.at(0);
    return r;
  },
  cloud(F, C) {
    const body = F.bone('Body', V(0, 1.6, 0));
    F.at(body);
    const puffs = [[0, 1.6, 0, 0.75], [-0.6, 1.45, 0.1, 0.55], [0.62, 1.48, 0.05, 0.58], [-0.3, 2.05, 0.15, 0.5], [0.35, 2.05, 0.1, 0.48], [0, 1.25, 0.35, 0.5], [-0.95, 1.3, 0.2, 0.35], [0.98, 1.32, 0.2, 0.36]];
    puffs.forEach(([x, y, z, rr], i) => F.ell(V(rr, rr * 0.85, rr), V(x, y, z), null, i % 2 ? C.body : C.belly, 'plastic', 1));
    cuteEyes(F, V(0, 1.68, -0.68), 0.24, 0.12);
    for (const sx of [-1, 1]) F.ell(V(0.1, 0.05, 0.03), V(sx * 0.42, 1.48, -0.62), euler(0, -0.6 * sx, 0), 'FF9AB8', 'plastic', 0);
    F.ell(V(0.09, 0.05, 0.03), V(0, 1.45, -0.72), null, '3A2A4A', 'plastic', 0);
    // gouttes
    const rain = F.bone('Rain', V(0, 0.8, 0.1), body);
    F.at(rain);
    for (let k = 0; k < 5; k++) F.spike(V(-0.6 + k * 0.3, 0.55 + (k % 2) * 0.2, 0.1 + (k % 3 - 1) * 0.2), V(0, 1, 0), 0.22, 0.07, '7FD6FF', 'plastic', 4);
    F.at(0);
    F.anim('idle', rain, [0, 1, 0], 10, 0.5, 0); F.anim('move', rain, [1, 0, 0], 10, 1, 0); F.anim('ability', rain, [0, 0, 1], 14, 1, 0);
    F.anim('idle', body, [0, 0, 1], 4, 0.5, 0); F.anim('move', body, [1, 0, 0], 6, 1, 0, -5); F.anim('ability', body, [0, 1, 0], 14, 1, 0);
    F.bob('idle', 0.25, 0.5); F.bob('move', 0.35, 1); F.bob('ability', 0.45, 1);
    return { body, head: body, top: V(0, 2.5, 0.1), face: -0.7, cloud: true };
  },
  king(F, C) {
    const r = critter(F, C, { bodyK: 1.15, headK: 1.05 });
    F.at(r.head);
    for (const sx of [-1, 1]) { F.ell(V(0.2, 0.2, 0.12), V(sx * 0.52, 2.45, -0.3), null, C.body, 'plastic', 1); }
    // couronne
    const cy = 2.55, cz = -0.3;
    F.seg(V(0, cy - 0.05, cz), V(0, cy + 0.15, cz), 0.36, 0.38, GOLD, 'gold', 10);
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; F.spike(V(Math.cos(a) * 0.34, cy + 0.14, cz + Math.sin(a) * 0.34), V(0, 1, 0), 0.28, 0.08, GOLD, 'gold', 4); if (k % 2 === 0) F.ell(V(0.06, 0.06, 0.06), V(Math.cos(a) * 0.37, cy + 0.06, cz + Math.sin(a) * 0.37), null, ['E8344E', '7FD6FF', '3DBE8C', 'C04BD8'][k / 2], 'neon', 1); }
    F.at(r.body);
    // cape
    for (let k = 0; k < 9; k++) F.shard(V((k - 4) * 0.13, 1.5, 0.55), V((k - 4) * 0.08, -1, 0.35), 1.1, 0.16, k % 2 ? 'C8102A' : 'E8344E', 'plastic', V(0, 0, 1));
    F.ring(0.32, 0.06, V(0, 1.48, 0.0), euler(Math.PI / 2, 0, 0), 'FFFFFF', 'plastic', 12, 4);
    // sceptre
    F.seg(V(0.7, 0.2, -0.45), V(0.7, 1.6, -0.45), 0.04, 0.04, GOLD, 'gold', 5);
    F.ell(V(0.12, 0.12, 0.12), V(0.7, 1.68, -0.45), null, C.accent || 'FF5A8A', 'neon', 1);
    F.at(0);
    return r;
  },
  phantom(F, C) {
    const body = F.bone('Body', V(0, 1.4, 0));
    F.at(body);
    F.ell(V(0.75, 0.9, 0.7), V(0, 1.75, 0), null, C.body, 'plastic', 2);
    F.seg(V(0, 1.55, 0), V(0, 0.75, 0), 0.72, 0.62, C.body, 'plastic', 10);
    for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; F.spike(V(Math.cos(a) * 0.55, 0.8, Math.sin(a) * 0.55), V(Math.cos(a) * 0.4, -1, Math.sin(a) * 0.4), 0.35, 0.16, k % 2 ? C.body : C.belly, 'plastic', 4); }
    const G = C.glow || 'FFE27A';
    for (const sx of [-1, 1]) { F.ell(V(0.16, 0.22, 0.08), V(sx * 0.27, 1.95, -0.64), euler(0, -0.3 * sx, 0), G, 'neon', 1); F.ell(V(0.1, 0.12, 0.05), V(sx * 0.27, 1.92, -0.69), null, '1A1020', 'plastic', 0); }
    F.ell(V(0.18, 0.12, 0.06), V(0, 1.58, -0.66), null, '1A1020', 'plastic', 1);
    const arms = [-1, 1].map((sx) => { const a = F.bone(sx < 0 ? 'ArmL' : 'ArmR', V(sx * 0.65, 1.6, -0.05), body); F.at(a); F.seg(V(sx * 0.65, 1.6, -0.05), V(sx * 1.05, 1.25, -0.3), 0.16, 0.09, C.body, 'plastic', 6); F.at(body); return a; });
    // petite lanterne
    F.at(arms[1]);
    F.seg(V(1.05, 1.25, -0.3), V(1.05, 0.95, -0.3), 0.015, 0.015, '3A2A2A', 'plastic', 3);
    F.box(V(0.22, 0.28, 0.22), V(1.05, 0.8, -0.3), null, '3A2A2A');
    F.ell(V(0.09, 0.12, 0.09), V(1.05, 0.8, -0.3), null, G, 'neon', 1);
    F.at(0);
    arms.forEach((a, i) => { F.anim('idle', a, [0, 0, 1], 8, 0.5, i * Math.PI); F.anim('move', a, [1, 0, 0], 14, 1, i * Math.PI); F.anim('ability', a, [1, 0, 0], 20, 1, 0, 15); });
    F.anim('idle', body, [0, 0, 1], 5, 0.5, 0); F.anim('move', body, [1, 0, 0], 8, 1, 0, -8); F.anim('ability', body, [1, 0, 0], 10, 1, 0, -5);
    F.bob('idle', 0.3, 0.5); F.bob('move', 0.4, 1); F.bob('ability', 0.5, 1);
    return { body, head: body, top: V(0, 2.6, 0), face: -0.7, cloud: true };
  },
};

export function makeCommon(def) {
  const F = new Forge(def.name, def.id.split('').reduce((a, c) => a * 31 + c.charCodeAt(0) >>> 0, 7));
  const C = { body: def.body, belly: def.belly, dark: def.dark || shade(def.body, -0.3), accent: def.accent, glow: def.glow };
  const r = SPECIES[def.species](F, C);
  const R = def.rarity, theme = def.egg;
  // 2+ : décoration de tête du monde
  if (R >= 2 && HAT[theme]) { F.at(r.head); HAT[theme](F, r.top.clone(), C); F.at(0); }
  // 3+ : nœud / collier
  if (R >= 3 && !r.cloud) {
    F.at(r.body);
    const col = { candy: 'FF5A8A', berry: 'C86BD8', choco: 'FFD23F', mocha: 'E8B64A', frost: '7FD6FF', sundae: 'FF5A8A', nebula: 'C04BD8', star: 'FFD23F' }[theme] || 'FF5A8A';
    F.ring(0.42, 0.07, V(0, 1.42, -0.32), euler(Math.PI / 2 - 0.4, 0, 0), col, 'plastic', 14, 4);
    for (const sx of [-1, 1]) F.shard(V(0, 1.32, -0.72), V(sx, 0.2, 0), 0.28, 0.18, col, 'plastic', V(0, 0, 1));
    F.ell(V(0.08, 0.08, 0.06), V(0, 1.32, -0.74), null, GOLD, 'gold', 1);
    F.at(0);
  }
  // 4+ : objets du monde en orbite
  if (R >= 4) floaters(F, [V(-1.5, 1.9, -0.4), V(1.5, 2.1, -0.2), V(0, 3.1, 0.7)].concat(R >= 5 ? [V(-1.3, 0.8, 0.9), V(1.4, 0.9, 1.0)] : []), (p, i) => THEME[theme](F, p, 1, i), 8);
  // 5 : auréole dorée qui tourne + étincelles
  if (R >= 5) {
    const top = r.top.clone().add(V(0, 0.55, 0));
    const halo = F.bone('Halo', top, 0);
    F.spin(halo, [0, 1, 0], 0.25);
    F.at(halo);
    F.ring(0.42, 0.05, top, euler(Math.PI / 2, 0, 0), GOLD, 'gold', 24, 4);
    for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2; F.spike(top.clone().add(V(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42)), V(0, 1, 0), 0.16, 0.05, 'FFE27A', 'neon', 4); }
    F.at(0);
  }
  // animations communes
  if (!r.cloud) {
    F.anim('idle', r.body, [1, 0, 0], 1.5, 0.5, 0);
    F.anim('move', r.body, [1, 0, 0], 4, 1, 0, -3);
    F.anim('ability', r.body, [1, 0, 0], 6, 1, 0, -4);
    F.anim('idle', r.head, [0, 0, 1], 5, 0.5, 0);
    F.anim('idle', r.head, [1, 0, 0], 3, 0.5, 1);
    F.anim('move', r.head, [1, 0, 0], 5, 1, 0.5);
    F.anim('ability', r.head, [1, 0, 0], 12, 1, 0, 3);
    if (!F.bobs?.move) F.bob('move', 0.3, 1);
    F.bob('ability', 0.45, 1);
  }
  return F;
}

export const commons = await (await fetch(new URL('../commons.json', import.meta.url))).json();
