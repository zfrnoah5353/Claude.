// Pièces réutilisables pour les créatures : fourrure en éclats, pattes, ailes, têtes, orbites.
import * as THREE from 'three';
import { V, aim, euler, shade } from './forge.js';

const STATES = ['idle', 'move', 'ability'];

// point sur un ellipsoïde (centre c, demi-axes s) + normale
export function onEll(c, s, th, ph) {
  const n = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
  const p = V(c.x + n.x * s.x, c.y + n.y * s.y, c.z + n.z * s.z);
  const nn = V(n.x / s.x, n.y / s.y, n.z / s.z).normalize();
  return { p, n: nn };
}

// corps en fourrure : ellipsoïde + éclats orientés vers l'extérieur et vers l'arrière/bas
export function furBody(F, c, s, color, colors, count, opts = {}) {
  F.ell(s, c, opts.quat || null, color, 'plastic', opts.detail ?? 2);
  const flow = opts.flow || V(0, -0.6, 0.5);
  for (let i = 0; i < count; i++) {
    const th = F.rand(0, Math.PI * 2), ph = Math.acos(F.rand(opts.minY ?? -0.6, 1));
    const { p, n } = onEll(c, s, th, ph);
    if (opts.skip && opts.skip(p, n)) continue;
    const dir = n.clone().multiplyScalar(0.55).add(flow).normalize();
    const len = (opts.len || 0.45) * F.rand(0.7, 1.3);
    F.shard(p.addScaledVector(n, -0.04), dir, len, len * (opts.w || 0.32), colors[Math.floor(F.rand(0, colors.length))], opts.mat || 'plastic', n);
  }
}

// rangée de piques le long d'une ligne
export function spikeRow(F, a, b, n, dirFn, lenFn, w, colors, mat) {
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : i / (n - 1);
    const p = a.clone().lerp(b, u);
    const len = lenFn(u);
    F.spike(p, dirFn(u), len, len * w, colors[i % colors.length], mat);
  }
}

// patte à 2 segments ; renvoie [haut, bas]. walk = phase de marche (rad)
export function leg(F, name, parent, hip, knee, foot, r, color, opts = {}) {
  const up = F.bone(name + 'Up', hip, parent);
  F.at(up);
  F.seg(hip, knee, r, r * 0.8, color, 'plastic', 6);
  F.ell(V(r, r, r).multiplyScalar(1.05), hip, null, color, 'plastic', 1);
  const lo = F.bone(name + 'Lo', knee, up);
  F.at(lo);
  F.ell(V(r, r, r).multiplyScalar(0.85), knee, null, color, 'plastic', 1);
  F.seg(knee, foot, r * 0.8, r * 0.65, color, 'plastic', 6);
  const pc = opts.paw || shade(color, -0.25);
  if (opts.hoof) {
    F.seg(foot.clone().add(V(0, -0.05, 0)), foot.clone().add(V(0, 0.18, 0)), r * 0.85, r * 0.75, pc, opts.pawMat || 'plastic', 6);
  } else {
    F.ell(V(r * 1.05, r * 0.55, r * 1.35), foot.clone().add(V(0, 0, -r * 0.35)), null, pc, 'plastic', 1);
    if (opts.claws) for (const dx of [-0.5, 0, 0.5]) F.spike(foot.clone().add(V(dx * r, -r * 0.1, -r * 1.3)), V(0, -0.3, -1), r * 0.7, r * 0.18, opts.claws, opts.clawMat || 'plastic', 3);
  }
  F.at(parent);
  const ph = opts.walk || 0;
  F.anim('idle', up, [1, 0, 0], 2, 0.5, ph);
  F.anim('move', up, [1, 0, 0], 24, 1, ph);
  F.anim('move', lo, [1, 0, 0], 16, 1, ph - 1.2, -8);
  F.anim('ability', up, [1, 0, 0], opts.abAmp ?? 10, 1, ph);
  return [up, lo];
}

// aile en éventail de plumes/éclats ; side = -1 gauche (x<0), 1 droite
export function wing(F, name, parent, root, side, span, colors, opts = {}) {
  const w = F.bone(name, root, parent);
  F.at(w);
  const tip = root.clone().add(V(side * span, span * 0.35, span * 0.15));
  const elbow = root.clone().add(V(side * span * 0.5, span * 0.32, -span * 0.05));
  const bc = opts.bone || colors[0];
  F.seg(root, elbow, span * 0.06, span * 0.045, bc, opts.boneMat || 'plastic', 5);
  F.seg(elbow, tip, span * 0.045, span * 0.02, bc, opts.boneMat || 'plastic', 5);
  const rows = opts.rows || 3, per = opts.per || 9;
  for (let r = 0; r < rows; r++) {
    for (let i = 0; i < per; i++) {
      const u = (i + 0.5) / per;
      const p = u < 0.5 ? root.clone().lerp(elbow, u * 2) : elbow.clone().lerp(tip, (u - 0.5) * 2);
      const len = span * (0.35 + 0.45 * Math.sin(u * Math.PI * 0.9 + 0.2)) * (1 - r * 0.28) * (opts.long || 1);
      const dir = V(side * (0.25 + u * 0.9), -0.55 - r * 0.1, 0.65 + u * 0.3).normalize();
      const col = colors[Math.min(colors.length - 1, r + (i % 2 && colors.length > 3 ? 1 : 0))];
      F.shard(p.clone().add(V(0, -r * span * 0.05, r * span * 0.03)), dir, len, len * (opts.fw || 0.22), col, opts.mat || 'plastic', V(0, 1, 0.2));
    }
  }
  F.at(parent);
  const ax = [0, 0, -side];
  F.anim('idle', w, ax, 10, 0.5, 0, 5);
  F.anim('move', w, ax, 32, 1, 0, 5);
  F.anim('ability', w, ax, 26, 1.5, 0, -10);
  return w;
}

// yeux lumineux en amande
export function eyes(F, c, dx, size, color, opts = {}) {
  for (const sx of [-1, 1]) {
    const p = c.clone().add(V(dx * sx, 0, 0));
    F.ell(V(size, size * (opts.h || 0.55), size * 0.4), p, euler(0, -0.3 * sx * (opts.turn ?? 1), -0.25 * sx * (opts.tilt ?? 1)), color, 'neon', 1);
    if (opts.pupil !== false) F.box(V(size * 0.18, size * 0.8, size * 0.2), p.clone().add(V(0, 0, -size * 0.32)), null, '120D16');
    if (opts.brow) F.box(V(size * 1.7, size * 0.35, size * 0.6), p.clone().add(V(-0.1 * size * sx, size * 0.6, 0)), euler(0.1, 0, -0.4 * sx), opts.brow);
  }
}

// rangée de dents (crocs) d'une mâchoire
export function teeth(F, a, b, n, down, len, color = 'FFFFFF') {
  for (let i = 0; i < n; i++) {
    const p = a.clone().lerp(b, n === 1 ? 0.5 : i / (n - 1));
    F.spike(p, down, len * (i % 2 ? 0.7 : 1), len * 0.28, color, 'plastic', 3);
  }
}

// objets en orbite : chaque objet a son propre os qui oscille (boucle de 2 s sans à-coup)
export function floaters(F, list, make, amp = 9) {
  list.forEach((pos, i) => {
    const b = F.bone('Float' + (i + 1), pos, 0);
    F.at(b);
    make(pos, i);
    F.at(0);
    for (const st of STATES) { F.anim(st, b, [1, 0, 0], amp, 0.5, i * 1.7); F.anim(st, b, [0, 0, 1], amp * 0.8, 0.5, i * 1.1 + 0.5); }
  });
}

// anneau orbital qui tourne (un tour par boucle)
export function spinner(F, name, pivot, axis, speed = 1) {
  const b = F.bone(name, pivot, 0);
  F.spin(b, axis, speed);
  return b;
}

// bulles
export function bubbles(F, center, n, R, color = 'CFF6FF') {
  for (let i = 0; i < n; i++) {
    const a = F.rand(0, Math.PI * 2), r = F.rand(R * 0.6, R), y = F.rand(0.8, 4.5);
    const s = F.rand(0.07, 0.16);
    F.ring(s, s * 0.22, V(center.x + Math.cos(a) * r, y, center.z + Math.sin(a) * r), euler(F.rand(-0.4, 0.4), F.rand(0, 3), 0), color, 'glass', 10, 3);
  }
}

// colonne grecque dorée
export function pillar(F, pos, h, r, color, mat = 'gold', quat = null) {
  const q = quat || new THREE.Quaternion();
  const up = V(0, 1, 0).applyQuaternion(q);
  const top = pos.clone().addScaledVector(up, h);
  F.seg(pos, top, r, r, color, mat, 8);
  F.box(V(r * 2.8, r * 0.7, r * 2.8), pos, q, shade(color, -0.1), mat);
  F.box(V(r * 3.2, r * 0.8, r * 3.2), top, q, shade(color, -0.1), mat);
}

// tête de dragon / serpent tournée vers -Z. C = { body, dark, belly, horn, crest, fin, eye, gold }
export function dragonHead(F, name, parent, p, s, C, opts = {}) {
  const head = F.bone(name, p, parent);
  F.at(head);
  const P = (x, y, z) => p.clone().add(V(x * s, y * s, z * s));
  F.ell(V(0.55, 0.45, 0.62).multiplyScalar(s), P(0, 0, 0), null, C.body, 'plastic', 1);
  F.seg(P(0, -0.02, -0.35), P(0, -0.1, -1.25), 0.38 * s, 0.22 * s, C.body, 'plastic', 6, Math.PI / 6);
  F.box(V(0.5, 0.12, 0.7).multiplyScalar(s), P(0, 0.2, -0.75), euler(-0.12, 0, 0), C.dark);
  for (const sx of [-1, 1]) F.ell(V(0.06, 0.05, 0.05).multiplyScalar(s), P(sx * 0.12, 0.05, -1.25), null, '101010', 'plastic', 0);
  eyes(F, P(0, 0.2, -0.5), 0.3 * s, 0.13 * s, C.eye, { brow: C.dark });
  // cornes
  for (const sx of [-1, 1]) {
    let a = P(sx * 0.3, 0.3, 0.15);
    for (let i = 0; i < 4; i++) {
      const b = a.clone().add(V(sx * 0.12 * s, (0.28 - i * 0.05) * s, (0.3 + i * 0.05) * s));
      F.seg(a, b, (0.11 - i * 0.022) * s, (0.09 - i * 0.022) * s, i === 3 ? C.gold : C.horn, i === 3 ? 'gold' : 'plastic', 5);
      a = b;
    }
  }
  // crête
  for (let i = 0; i < (opts.crest ?? 6); i++) {
    const u = i / 5;
    const pos = P(0, 0.42 - u * 0.15, -0.35 + u * 0.9);
    const len = (0.55 - u * 0.25) * s;
    F.spike(pos, V(0, 1, 0.6), len, len * 0.22, C.crest, 'plastic', 4);
    F.spike(pos.clone().addScaledVector(V(0, 1, 0.6).normalize(), len * 0.92), V(0, 1, 0.6), len * 0.25, len * 0.08, C.gold, 'gold', 4);
  }
  // nageoires latérales en éventail
  if (opts.fins !== false) for (const sx of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const dir = V(sx * (0.8 + i * 0.05), 0.5 - i * 0.18, 0.5 + i * 0.12).normalize();
      F.shard(P(sx * 0.45, 0.05, 0.05), dir, (0.85 - Math.abs(i - 2) * 0.08) * s, 0.16 * s, i % 2 ? C.fin : shade(C.fin, 0.15), 'plastic', V(0, 0, 1));
      F.spike(P(sx * 0.45, 0.05, 0.05).addScaledVector(dir, (0.8 - Math.abs(i - 2) * 0.08) * s), dir, 0.18 * s, 0.03 * s, C.gold, 'gold', 3);
    }
  }
  teeth(F, P(-0.24, -0.22, -0.55), P(-0.14, -0.24, -1.2), 5, V(0, -1, 0), 0.2 * s);
  teeth(F, P(0.24, -0.22, -0.55), P(0.14, -0.24, -1.2), 5, V(0, -1, 0), 0.2 * s);
  if (opts.whiskers) for (const sx of [-1, 1]) {
    let a = P(sx * 0.2, -0.05, -1.15), d = V(sx * 0.8, -0.1, 0.1);
    for (let i = 0; i < 6; i++) { const b = a.clone().addScaledVector(d.normalize(), 0.25 * s); F.seg(a, b, 0.03 * s, 0.025 * s, opts.whiskers, 'gold', 4); a = b; d.add(V(0, -0.25, 0.25)); }
  }
  // mâchoire
  const jaw = F.bone(name + 'Jaw', P(0, -0.2, -0.2), head);
  F.at(jaw);
  F.seg(P(0, -0.3, -0.25), P(0, -0.36, -1.15), 0.28 * s, 0.17 * s, C.belly, 'plastic', 6, Math.PI / 6);
  F.box(V(0.3, 0.05, 0.75).multiplyScalar(s), P(0, -0.18, -0.7), null, 'B3263A');
  teeth(F, P(-0.2, -0.2, -0.55), P(-0.12, -0.22, -1.1), 4, V(0, 1, 0), 0.16 * s);
  teeth(F, P(0.2, -0.2, -0.55), P(0.12, -0.22, -1.1), 4, V(0, 1, 0), 0.16 * s);
  F.at(parent);
  return { head, jaw };
}

// écailles en anneau autour d'un segment de chaîne (style « tressé »)
export function scaleRing(F, f, n, colors, belly, opts = {}) {
  const mid = f.a.clone().lerp(f.b, 0.5);
  const len = f.a.distanceTo(f.b);
  const r = (f.r + f.r2) / 2;
  for (let k = 0; k < n; k++) {
    const a = (k + (opts.offset || 0)) / n * Math.PI * 2;
    const nrm = f.side.clone().multiplyScalar(Math.cos(a)).addScaledVector(f.top, Math.sin(a));
    const under = Math.sin(a) < -0.5;
    const pos = mid.clone().addScaledVector(nrm, r * 0.97);
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(nrm.clone().cross(f.t).normalize(), f.t, nrm));
    F.box(V(r * 2 * Math.PI / n * 0.9, len * 0.95, r * 0.1), pos, q, under ? belly : colors[(k + (opts.alt || 0)) % colors.length]);
  }
}

// tête de canidé / félin tournée vers -Z. C = { body, dark, belly, eye, ear, teeth }
export function beastHead(F, name, parent, p, s, C, opts = {}) {
  const head = F.bone(name, p, parent);
  F.at(head);
  const P = (x, y, z) => p.clone().add(V(x * s, y * s, z * s));
  F.ell(V(0.6, 0.56, 0.62).multiplyScalar(s), P(0, 0.1, 0), null, C.body, 'plastic', 1);
  const snout = opts.snout ?? 0.75;
  F.seg(P(0, -0.02, -0.3), P(0, -0.1, -0.3 - snout), 0.33 * s, 0.2 * s, opts.muzzle || C.body, 'plastic', 6, Math.PI / 6);
  F.ell(V(0.12, 0.09, 0.09).multiplyScalar(s), P(0, -0.06, -0.32 - snout), null, '1A1420', 'plastic', 1);
  eyes(F, P(0, 0.22, -0.48), 0.24 * s, 0.15 * s, C.eye, { brow: C.dark });
  const earH = opts.earH ?? 0.6;
  for (const sx of [-1, 1]) {
    F.spike(P(sx * 0.32, 0.5, -0.05), V(sx * 0.3, 1, 0.15), earH * s, 0.17 * s, C.body, 'plastic', 4);
    F.spike(P(sx * 0.32, 0.52, -0.1), V(sx * 0.3, 1, 0.1), earH * 0.7 * s, 0.09 * s, C.ear || C.dark, 'plastic', 3);
  }
  if (opts.fur) for (let i = 0; i < opts.fur; i++) {
    const th = F.rand(0, Math.PI * 2), ph = F.rand(0.3, 2.2);
    const n = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    if (n.z < -0.5) continue;
    F.shard(P(n.x * 0.55, 0.1 + n.y * 0.5, n.z * 0.55), n.clone().add(V(0, -0.2, 0.8)), 0.35 * s, 0.11 * s, opts.furColors[i % opts.furColors.length], 'plastic', n);
  }
  teeth(F, P(-0.2, -0.24, -0.35 - snout * 0.4), P(-0.12, -0.26, -0.3 - snout), 3, V(0, -1, 0), 0.15 * s, C.teeth || 'FFFFFF');
  teeth(F, P(0.2, -0.24, -0.35 - snout * 0.4), P(0.12, -0.26, -0.3 - snout), 3, V(0, -1, 0), 0.15 * s, C.teeth || 'FFFFFF');
  const jaw = F.bone(name + 'Jaw', P(0, -0.2, -0.25), head);
  F.at(jaw);
  F.seg(P(0, -0.3, -0.25), P(0, -0.32, -0.25 - snout * 0.9), 0.22 * s, 0.14 * s, C.belly || C.body, 'plastic', 6, Math.PI / 6);
  F.box(V(0.28, 0.04, snout * 0.75).multiplyScalar(s), P(0, -0.2, -0.3 - snout * 0.45), null, 'C2304A');
  F.at(parent);
  return { head, jaw };
}

// anim standard d'une tête + mâchoire
export function headAnims(F, head, jaw, k = 1, ph = 0) {
  F.anim('idle', head, [1, 0, 0], 3 * k, 0.5, ph);
  F.anim('idle', head, [0, 1, 0], 4 * k, 0.5, ph + 1);
  F.anim('move', head, [1, 0, 0], 5 * k, 1, ph);
  F.anim('ability', head, [1, 0, 0], 12 * k, 1, ph, 4);
  if (jaw) {
    F.anim('idle', jaw, [1, 0, 0], 3, 0.5, ph, -4);
    F.anim('move', jaw, [1, 0, 0], 5, 1, ph, -6);
    F.anim('ability', jaw, [1, 0, 0], 14, 1, ph + Math.PI, -16);
  }
}

// queue en chaîne couverte d'éclats
export function shardTail(F, name, parent, pts, rad, color, colors, n = 10, len = 0.4) {
  const bones = F.chain(name, pts, rad, color, {
    parent, segs: 6,
    deco: (i, f) => { for (let k = 0; k < n; k++) { const a = F.rand(0, 6.28); const nn = f.side.clone().multiplyScalar(Math.cos(a)).addScaledVector(f.top, Math.sin(a)); F.shard(f.a.clone().lerp(f.b, F.rand(0, 1)).addScaledVector(nn, f.r * 0.8), nn.clone().multiplyScalar(0.4).add(f.t), len * (0.6 + i * 0.15), len * 0.3, colors[k % colors.length], 'plastic', nn); } },
  });
  bones.forEach((b, i) => {
    F.anim('idle', b, [0, 1, 0], 8, 0.5, -i * 0.6);
    F.anim('move', b, [0, 1, 0], 15, 1, -i * 0.6);
    F.anim('ability', b, [1, 0, 0], 12, 1, -i * 0.5, -8);
  });
  return bones;
}
