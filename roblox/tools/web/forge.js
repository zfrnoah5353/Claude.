// Forge : petit atelier de modélisation low-poly détaillée (style « pièces facettées »).
// Un modèle = des os (pivot + parent) et des pièces (géométrie, couleur, matériau, os).
// Les pièces sont en coordonnées monde à la pose de repos ; build() les fusionne par os + couleur.
import * as THREE from 'three';
import { mergeGeometries } from './jsm/utils/BufferGeometryUtils.js';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// quaternion qui envoie +Y sur dir, avec un roulis optionnel autour de dir
export function aim(dir, roll = 0) {
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
  if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(UP, roll));
  return q;
}
export const euler = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'XYZ'));

function place(g, pos, quat, scale) {
  const m = new THREE.Matrix4().compose(pos || V(), quat || new THREE.Quaternion(), scale || V(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

// éclaircit / assombrit une couleur hex
export function shade(hex, t) {
  const c = new THREE.Color('#' + hex);
  if (t > 0) c.lerp(new THREE.Color(1, 1, 1), t); else c.lerp(new THREE.Color(0, 0, 0), -t);
  return c.getHexString();
}

export class Forge {
  constructor(name, seed = 7) {
    this.name = name;
    this.bones = [{ name: 'Root', parent: -1, pivot: V() }];
    this.pieces = [];
    this.cur = 0;
    this.anims = { idle: [], move: [], ability: [] };
    this.r = rng(seed);
    this.prims = []; // description des primitives (pour la conversion en pièces Roblox)
  }
  rand(a = 0, b = 1) { return a + (b - a) * this.r(); }
  bone(name, pivot, parent = this.cur, extra = {}) {
    this.bones.push({ name, parent, pivot: pivot.clone(), ...extra });
    return this.bones.length - 1;
  }
  at(b) { this.cur = b; return this; }
  add(g, color, mat = 'plastic', bone = this.cur) {
    g = g.index ? g.toNonIndexed() : g;
    g.deleteAttribute('uv'); g.deleteAttribute('normal');
    this.pieces.push({ g, color, mat, bone });
    return this;
  }
  rec(p) { if (!this.noRec) this.prims.push({ ...p, bone: this.cur }); }
  // --- primitives (toutes en coordonnées monde) ---
  box(size, pos, quat, color, mat) { this.rec({ t: 'box', size: size.clone(), pos: pos.clone(), quat: quat ? quat.clone() : new THREE.Quaternion(), color, mat }); return this.add(place(new THREE.BoxGeometry(size.x, size.y, size.z), pos, quat), color, mat); }
  ell(size, pos, quat, color, mat, detail = 1) { this.rec({ t: 'ell', size: size.clone(), pos: pos.clone(), quat: quat ? quat.clone() : new THREE.Quaternion(), color, mat }); return this.add(place(new THREE.IcosahedronGeometry(1, detail), pos, quat, size), color, mat); }
  // cylindre / cône de a vers b (rayons ra, rb), facettes = segs
  seg(a, b, ra, rb, color, mat, segs = 6, roll = 0) {
    const d = b.clone().sub(a), h = d.length();
    this.rec({ t: 'seg', a: a.clone(), b: b.clone(), ra, rb, color, mat });
    const g = new THREE.CylinderGeometry(rb, ra, h, segs, 1);
    g.translate(0, h / 2, 0);
    return this.add(place(g, a, aim(d, roll)), color, mat);
  }
  // pique de cristal : diamant allongé posé en pos, pointé vers dir
  spike(pos, dir, len, w, color, mat, sides = 4) {
    this.rec({ t: 'spike', pos: pos.clone(), dir: dir.clone().normalize(), len, w, color, mat });
    const g = new THREE.ConeGeometry(w, len, sides, 1);
    g.translate(0, len / 2, 0);
    const base = new THREE.ConeGeometry(w, len * 0.18, sides, 1);
    base.rotateX(Math.PI); base.translate(0, -len * 0.09, 0);
    const m = mergeGeometries([g.toNonIndexed(), base.toNonIndexed()]);
    return this.add(place(m, pos, aim(dir, Math.PI / sides)), color, mat);
  }
  // éclat triangulaire plat (poils, plumes, écailles)
  shard(pos, dir, len, w, color, mat, normal) {
    this.rec({ t: 'shard', pos: pos.clone(), dir: dir.clone().normalize(), len, w, normal: normal ? normal.clone() : null, color, mat });
    const g = new THREE.ConeGeometry(w, len, 3, 1);
    g.scale(1, 1, 0.35);
    g.translate(0, len / 2, 0);
    const q = aim(dir);
    if (normal) {
      // tourne l'éclat pour que sa face plate regarde « normal »
      const localN = normal.clone().applyQuaternion(q.clone().invert()); localN.y = 0;
      if (localN.lengthSq() > 1e-6) q.multiply(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), localN.normalize()));
    }
    return this.add(place(g, pos, q), color, mat);
  }
  ring(R, r, pos, quat, color, mat, segs = 32, tube = 5, arc = Math.PI * 2) {
    this.rec({ t: 'ring', R, r, pos: pos.clone(), quat: quat ? quat.clone() : new THREE.Quaternion(), arc, color, mat });
    return this.add(place(new THREE.TorusGeometry(R, r, tube, segs, arc), pos, quat), color, mat);
  }
  // engrenage extrudé, axe = Z local
  gear(R, teeth, thick, pos, quat, color, mat, hole = 0.35) {
    this.rec({ t: 'gear', R, teeth, thick, pos: pos.clone(), quat: quat ? quat.clone() : new THREE.Quaternion(), color, mat });
    const s = new THREE.Shape();
    const n = teeth * 4;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = (i % 4 < 2) ? R : R * 0.8;
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      i ? s.lineTo(x, y) : s.moveTo(x, y);
    }
    if (hole > 0) { const h = new THREE.Path(); h.absarc(0, 0, R * hole, 0, Math.PI * 2, true); s.holes.push(h); }
    const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -thick / 2);
    return this.add(place(g, pos, quat), color, mat);
  }
  // chaîne articulée : un os par point, un segment par intervalle.
  // pts : Vector3[], rad : rayon par point. deco(i, frame) décore le segment i (os courant = os i).
  chain(name, pts, rad, color, opts = {}) {
    const parent = opts.parent ?? this.cur;
    const bones = [];
    let p = parent;
    for (let i = 0; i < pts.length - 1; i++) {
      if (!opts.static) { p = this.bone(`${name}${i + 1}`, pts[i], p); bones.push(p); }
      this.at(p);
      const a = pts[i], b = pts[i + 1];
      const t = b.clone().sub(a).normalize();
      // repère : côté = t x up, dessus = côté x t
      let side = t.clone().cross(opts.up || UP);
      if (side.lengthSq() < 1e-6) side = V(1, 0, 0);
      side.normalize();
      const top = side.clone().cross(t).normalize();
      const ext = opts.overlap ? t.clone().multiplyScalar(opts.overlap * rad[i + 1]) : V();
      this.seg(a, b.clone().add(ext), rad[i], rad[i + 1], color, opts.mat, opts.segs || 6, opts.roll || 0);
      if (opts.joint) this.ell(V(rad[i], rad[i], rad[i]).multiplyScalar(1.02), a, null, color, opts.mat, 0);
      if (opts.deco) opts.deco(i, { a, b, t, side, top, r: rad[i], r2: rad[i + 1], u: i / (pts.length - 1) });
    }
    this.at(parent);
    return bones;
  }
  // animation : piste sinusoïdale (degrés) sur un os, même format que les plans Roblox
  anim(state, bone, axis, amp, freq, phase = 0, base = 0) {
    this.anims[state].push({ bone, axis: Array.isArray(axis) ? axis : [axis.x, axis.y, axis.z], amp, freq, phase, base });
  }
  spin(bone, axis, speed) { this.bones[bone].spin = { axis, speed }; }
  bob(state, amp, freq) { (this.bobs ||= {})[state] = { amp, freq }; }
}

const matCache = new Map();
function material(color, mat) {
  const key = color + mat;
  if (matCache.has(key)) return matCache.get(key);
  const c = new THREE.Color('#' + color);
  const m = new THREE.MeshStandardMaterial({
    color: c,
    roughness: mat === 'gold' ? 0.38 : mat === 'neon' ? 0.5 : 0.82,
    metalness: mat === 'gold' ? 0.55 : 0,
    emissive: mat === 'neon' ? c : new THREE.Color(0),
    emissiveIntensity: mat === 'neon' ? 0.65 : 0,
  });
  if (mat === 'glass') { m.transparent = true; m.opacity = 0.45; }
  m.name = (mat === 'neon' ? 'Neon_' : mat === 'gold' ? 'Gold_' : mat === 'glass' ? 'Glass_' : 'Mat_') + color;
  matCache.set(key, m);
  return m;
}

export function build(F, scale = 1) {
  const root = new THREE.Group();
  root.name = F.name;
  const nodes = [root];
  F.bones.forEach((b, i) => {
    if (i === 0) return;
    const n = new THREE.Group();
    n.name = `${b.name}_${i}`;
    const pp = F.bones[b.parent].pivot;
    n.position.copy(b.pivot).sub(pp);
    nodes[b.parent].add(n);
    nodes.push(n);
  });
  const buckets = new Map();
  for (const pc of F.pieces) {
    const key = pc.bone + '|' + pc.color + pc.mat;
    if (!buckets.has(key)) buckets.set(key, { bone: pc.bone, color: pc.color, mat: pc.mat, geos: [] });
    const g = pc.g.clone();
    const pv = F.bones[pc.bone].pivot;
    g.translate(-pv.x, -pv.y, -pv.z);
    buckets.get(key).geos.push(g);
  }
  let k = 0;
  for (const b of buckets.values()) {
    const g = mergeGeometries(b.geos);
    g.computeVertexNormals(); // non indexé => normales plates (facettes)
    const mesh = new THREE.Mesh(g, material(b.color, b.mat));
    mesh.name = `${nodes[b.bone].name}_m${++k}`;
    nodes[b.bone].add(mesh);
  }
  root.scale.setScalar(scale);
  return { root, nodes };
}

const CLIP = 2, FPS = 30;
export function clips(F, rig) {
  const times = [];
  for (let f = 0; f <= CLIP * FPS; f++) times.push(f / FPS);
  const animated = new Set();
  for (const st in F.anims) for (const t of F.anims[st]) animated.add(t.bone);
  const out = [];
  const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), ax = new THREE.Vector3();
  for (const st of ['idle', 'move', 'ability']) {
    const tracks = [];
    for (const bi of animated) {
      const vals = [];
      for (const time of times) {
        q.identity();
        for (const t of F.anims[st]) {
          if (t.bone !== bi) continue;
          const ang = THREE.MathUtils.degToRad(t.base + t.amp * Math.sin(2 * Math.PI * t.freq * time + t.phase));
          q.multiply(qa.setFromAxisAngle(ax.set(...t.axis).normalize(), ang));
        }
        vals.push(q.x, q.y, q.z, q.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${rig.nodes[bi].name}.quaternion`, times, vals));
    }
    F.bones.forEach((b, i) => {
      if (!b.spin) return;
      const vals = [];
      const a = V(...b.spin.axis).normalize();
      for (const time of times) { q.setFromAxisAngle(a, (b.spin.speed * Math.PI) * time); vals.push(q.x, q.y, q.z, q.w); }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${rig.nodes[i].name}.quaternion`, times, vals));
    });
    const bob = (F.bobs && F.bobs[st]) || { amp: st === 'idle' ? 0.06 : st === 'move' ? 0.18 : 0.25, freq: st === 'idle' ? 0.5 : 1 };
    const pos = [];
    for (const time of times) pos.push(0, bob.amp * (0.5 + 0.5 * Math.sin(2 * Math.PI * bob.freq * time)) * rig.root.scale.y, 0);
    tracks.push(new THREE.VectorKeyframeTrack(`${rig.root.name}.position`, times, pos));
    out.push(new THREE.AnimationClip(st, CLIP, tracks));
  }
  return out;
}

export function triCount(rig) {
  let t = 0;
  rig.root.traverse(o => { if (o.isMesh) t += o.geometry.attributes.position.count / 3; });
  return t;
}
