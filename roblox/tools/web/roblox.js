// Conversion d'un modèle Forge en pièces Roblox (Block, Ball/ellipsoïde, Cylinder, WedgePart).
// Les pièces trop petites sont abandonnées pour tenir dans un budget par rareté.
import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const MAT = { plastic: 'plastic', gold: 'metal', neon: 'neon', glass: 'glass' };

// matrice 3x3 (ligne par ligne, comme CFrame.new(x, y, z, r00 … r22)) à partir de 3 axes
function rot(X, Y, Z) { return [X.x, Y.x, Z.x, X.y, Y.y, Z.y, X.z, Y.z, Z.z]; }
function fromQuat(q) {
  const X = V(1, 0, 0).applyQuaternion(q), Y = V(0, 1, 0).applyQuaternion(q), Z = V(0, 0, 1).applyQuaternion(q);
  return rot(X, Y, Z);
}
function perp(d) {
  const a = Math.abs(d.y) < 0.9 ? V(0, 1, 0) : V(1, 0, 0);
  return a.clone().cross(d).normalize();
}

// triangle plat (base centrée en B, demi-largeur w le long de side, sommet B + dir*len), épaisseur th :
// deux WedgePart dos à dos. Le coin droit d'un WedgePart est en bas à l'arrière (-Y, +Z).
function tent(out, B, dir, side, len, w, th, base) {
  for (const sd of [1, -1]) {
    const S = side.clone().multiplyScalar(sd);
    const Y = dir.clone(), Z = S.clone().negate(), X = Y.clone().cross(Z).normalize();
    const c = B.clone().addScaledVector(dir, len / 2).addScaledVector(S, w / 2);
    out.push({ ...base, shape: 'wedge', size: [th, len, w], pos: c.toArray(), rot: rot(X, Y, Z) });
  }
}

function convertPrim(p) {
  const base = { color: p.color, mat: MAT[p.mat] || 'plastic', alpha: p.mat === 'glass' ? 0.5 : 0, bone: p.bone };
  const out = [];
  if (p.t === 'box') out.push({ ...base, shape: 'block', size: p.size.toArray(), pos: p.pos.toArray(), rot: fromQuat(p.quat) });
  else if (p.t === 'ell') out.push({ ...base, shape: 'ellipsoid', size: p.size.clone().multiplyScalar(2).toArray(), pos: p.pos.toArray(), rot: fromQuat(p.quat) });
  else if (p.t === 'seg') {
    const d = p.b.clone().sub(p.a), h = d.length(); if (h < 1e-4) return out;
    const dn = d.clone().normalize();
    const lo = Math.min(p.ra, p.rb), hi = Math.max(p.ra, p.rb);
    if (lo < hi * 0.45) { // cône pointu -> pique
      const from = p.ra >= p.rb ? p.a : p.b, dir = p.ra >= p.rb ? dn : dn.clone().negate();
      const side = perp(dir);
      tent(out, from, dir, side, h, hi, hi * 1.4, base);
    } else {
      const r = (p.ra + p.rb) / 2, Y = perp(dn), Z = dn.clone().cross(Y).normalize();
      out.push({ ...base, shape: 'cyl', size: [h, 2 * r, 2 * r], pos: p.a.clone().lerp(p.b, 0.5).toArray(), rot: rot(dn, Y, Z) });
    }
  } else if (p.t === 'spike') {
    tent(out, p.pos, p.dir, perp(p.dir), p.len, p.w, p.w * 1.2, base);
  } else if (p.t === 'shard') {
    let side = p.normal ? p.dir.clone().cross(p.normal) : perp(p.dir);
    if (side.lengthSq() < 1e-6) side = perp(p.dir);
    side.normalize();
    tent(out, p.pos, p.dir, side, p.len, p.w, Math.max(0.03, p.w * 0.5), base);
  } else if (p.t === 'ring') {
    const full = p.arc >= Math.PI * 2 - 1e-3;
    const N = Math.max(6, Math.min(16, Math.round(p.R * 8))) * (full ? 1 : 0.5) | 0;
    for (let k = 0; k < N; k++) {
      const a = (k + 0.5) / N * p.arc;
      const radial = V(Math.cos(a), Math.sin(a), 0).applyQuaternion(p.quat);
      const tang = V(-Math.sin(a), Math.cos(a), 0).applyQuaternion(p.quat);
      const ax = V(0, 0, 1).applyQuaternion(p.quat);
      const chord = 2 * p.R * Math.sin(p.arc / N / 2) * 1.08 + p.r;
      out.push({ ...base, shape: 'block', size: [chord, p.r * 2, p.r * 2], pos: p.pos.clone().addScaledVector(radial, p.R).toArray(), rot: rot(tang, radial, ax) });
    }
  } else if (p.t === 'gear') {
    const ax = V(0, 0, 1).applyQuaternion(p.quat), Y = perp(ax), Z = ax.clone().cross(Y).normalize();
    out.push({ ...base, shape: 'cyl', size: [p.thick, p.R * 1.7, p.R * 1.7], pos: p.pos.toArray(), rot: rot(ax, Y, Z) });
    for (let k = 0; k < p.teeth; k++) {
      const a = k / p.teeth * Math.PI * 2;
      const radial = V(Math.cos(a), Math.sin(a), 0).applyQuaternion(p.quat), tang = V(-Math.sin(a), Math.cos(a), 0).applyQuaternion(p.quat);
      out.push({ ...base, shape: 'block', size: [p.R * 0.32, p.R * 0.3, p.thick], pos: p.pos.clone().addScaledVector(radial, p.R * 0.9).toArray(), rot: rot(tang, radial, ax) });
    }
  }
  return out;
}

// importance d'une primitive : sa plus grande dimension (les petits détails partent en premier)
function weight(p) {
  switch (p.t) {
    case 'box': return Math.max(p.size.x, p.size.y, p.size.z) * 1.1;
    case 'ell': return Math.max(p.size.x, p.size.y, p.size.z) * 2.2;
    case 'seg': return p.a.distanceTo(p.b) + Math.max(p.ra, p.rb) * 2;
    case 'spike': case 'shard': return p.len * 0.9;
    case 'ring': return p.R * 2.5;
    case 'gear': return p.R * 2.5;
  }
  return 0;
}

// F : modèle Forge ; budget : nombre max de pièces ; target : hauteur visée (studs) ; body : couleur du corps
export function toRoblox(F, { budget, target, body }) {
  // cadrage : pieds à y = -1.1, hauteur ramenée à target si besoin
  const box = new THREE.Box3();
  for (const p of F.prims) {
    if (p.pos) box.expandByPoint(p.pos);
    if (p.a) { box.expandByPoint(p.a); box.expandByPoint(p.b); }
  }
  const h = box.max.y - Math.min(0, box.min.y);
  const f = Math.min(1, target / Math.max(h, 1e-3));
  const y0 = Math.min(0, box.min.y);
  const conv = F.prims.map((p, i) => ({ p, i, w: weight(p), parts: convertPrim(p) }));
  conv.sort((a, b) => b.w - a.w);
  const keep = [];
  let n = 0;
  for (const c of conv) {
    if (!c.parts.length) continue;
    if (n + c.parts.length > budget) continue;
    keep.push(c); n += c.parts.length;
  }
  keep.sort((a, b) => a.i - b.i);
  const T = (v) => [+(v[0] * f).toFixed(3), +((v[1] - y0) * f - 1.1).toFixed(3), +(v[2] * f).toFixed(3)];
  const parts = [];
  let bodyMarked = 0;
  for (const c of keep) for (const q of c.parts) {
    q.pos = T(q.pos);
    q.size = q.size.map((s) => +Math.max(0.05, s * f).toFixed(3));
    q.rot = q.rot.map((r) => +r.toFixed(4));
    if (q.color === body && q.mat === 'plastic' && bodyMarked < 40) { q.name = 'Body'; bodyMarked++; }
    parts.push(q);
  }
  const bones = F.bones.slice(1).map((b) => ({ name: b.name, parent: b.parent, pivot: T([b.pivot.x, b.pivot.y, b.pivot.z]), spin: b.spin ? { axis: b.spin.axis, speed: b.spin.speed } : undefined }));
  return { parts, bones, anims: F.anims, factor: +f.toFixed(4), total: conv.reduce((s, c) => s + c.parts.length, 0) };
}
