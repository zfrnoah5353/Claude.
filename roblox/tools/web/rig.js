// Assemble un pet (plan JSON exporté par export_models.luau) en hiérarchie three.js
// animée : un nœud par os, pièces fusionnées par couleur, clips idle / move / ability.
import * as THREE from 'three';
import { mergeGeometries } from './jsm/utils/BufferGeometryUtils.js';

const CLIP = 2; // durée des boucles (s)
const FPS = 30;

function partGeometry(p) {
  const [sx, sy, sz] = p.size;
  let g;
  if (p.shape === 'block') g = new THREE.BoxGeometry(sx, sy, sz);
  else if (p.shape === 'ball') g = new THREE.IcosahedronGeometry(Math.min(sx, sy, sz) / 2, 1);
  else if (p.shape === 'ellipsoid') { g = new THREE.IcosahedronGeometry(0.5, 1); g.scale(sx, sy, sz); }
  else { g = new THREE.CylinderGeometry(sy / 2, sy / 2, sx, 10); g.rotateZ(-Math.PI / 2); }
  return g.toNonIndexed();
}

function partMatrix(p) {
  const r = p.rot, t = p.pos;
  return new THREE.Matrix4().set(r[0], r[1], r[2], t[0], r[3], r[4], r[5], t[1], r[6], r[7], r[8], t[2], 0, 0, 0, 1);
}

const matCache = new Map();
function material(color, mat, alpha) {
  const key = color + mat + alpha;
  if (matCache.has(key)) return matCache.get(key);
  const c = new THREE.Color('#' + color);
  const m = new THREE.MeshStandardMaterial({
    color: c, flatShading: true,
    roughness: mat === 'metal' ? 0.35 : 0.75,
    metalness: mat === 'metal' ? 0.6 : 0,
    emissive: mat === 'neon' ? c : new THREE.Color(0),
    emissiveIntensity: mat === 'neon' ? 1.2 : 0,
  });
  if (alpha > 0) { m.transparent = true; m.opacity = 1 - alpha; }
  m.name = (mat === 'neon' ? 'Neon_' : mat === 'metal' ? 'Gold_' : 'Mat_') + color;
  matCache.set(key, m);
  return m;
}

export function buildRig(m) {
  const root = new THREE.Group();
  root.name = m.name;
  const nodes = [root];
  const pivots = [[0, 0, 0]];
  (m.bones || []).forEach((b, i) => {
    const node = new THREE.Group();
    node.name = `${b.name}_${i + 1}`;
    const pp = pivots[b.parent];
    node.position.set(b.pivot[0] - pp[0], b.pivot[1] - pp[1], b.pivot[2] - pp[2]);
    nodes[b.parent].add(node);
    nodes.push(node);
    pivots.push(b.pivot);
  });
  // nœuds des pièces qui tournent autour du pet
  const spin = {};
  function spinNode(p) {
    const parentIdx = p.bone || 0;
    const pv = p.pivot || [0, 0, 0];
    const key = `${p.tag}_${parentIdx}_${pv.join('_')}`;
    if (!spin[key]) {
      const n = new THREE.Group();
      n.name = `${p.tag}_${Object.keys(spin).length + 1}`;
      const pp = pivots[parentIdx];
      n.position.set(pv[0] - pp[0], pv[1] - pp[1], pv[2] - pp[2]);
      nodes[parentIdx].add(n);
      spin[key] = { node: n, axis: p.tag === 'SpinZ' ? 'z' : 'y', world: pv };
    }
    return spin[key];
  }
  const buckets = new Map();
  for (const p of m.parts) {
    let node = nodes[p.bone || 0], world = pivots[p.bone || 0];
    if (p.tag === 'SpinY' || p.tag === 'SpinZ') { const sn = spinNode(p); node = sn.node; world = sn.world; }
    const g = partGeometry(p);
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(-world[0], -world[1], -world[2]).multiply(partMatrix(p)));
    const key = node.uuid + '|' + p.color + p.mat + p.alpha;
    if (!buckets.has(key)) buckets.set(key, { node, p, geos: [] });
    buckets.get(key).geos.push(g);
  }
  let i = 0;
  for (const { node, p, geos } of buckets.values()) {
    const merged = mergeGeometries(geos.map((g) => { g.deleteAttribute('normal'); g.deleteAttribute('uv'); return g; }));
    merged.computeVertexNormals(); // normales plates : facettes nettes
    const mesh = new THREE.Mesh(merged, material(p.color, p.mat, p.alpha));
    mesh.name = `${node.name}_mesh${++i}`;
    node.add(mesh);
  }
  root.scale.setScalar(m.scale || 1);
  return { root, nodes, spin: Object.values(spin) };
}

export function makeClips(m, rig) {
  const times = [];
  for (let f = 0; f <= CLIP * FPS; f++) times.push(f / FPS);
  const animated = new Set();
  for (const st of ['idle', 'move', 'ability']) for (const t of (m.anims && m.anims[st]) || []) animated.add(t.bone);
  const clips = [];
  const bob = { idle: (t) => 0.08 * Math.sin(Math.PI * t), move: (t) => 0.3 * Math.abs(Math.sin(2 * Math.PI * t)), ability: (t) => 0.45 * Math.abs(Math.sin(3 * Math.PI * t)) };
  for (const st of ['idle', 'move', 'ability']) {
    const tracks = [];
    const list = (m.anims && m.anims[st]) || [];
    for (const bi of animated) {
      const vals = [];
      const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), ax = new THREE.Vector3();
      for (const time of times) {
        q.identity();
        for (const t of list) {
          if (t.bone !== bi) continue;
          const ang = THREE.MathUtils.degToRad(t.base + t.amp * Math.sin(2 * Math.PI * t.freq * time + t.phase));
          q.multiply(qa.setFromAxisAngle(ax.set(t.axis[0], t.axis[1], t.axis[2]).normalize(), ang));
        }
        vals.push(q.x, q.y, q.z, q.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${rig.nodes[bi].name}.quaternion`, times, vals));
    }
    for (const sn of rig.spin) {
      const vals = [];
      const q = new THREE.Quaternion();
      const ax = sn.axis === 'y' ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
      for (const time of times) { q.setFromAxisAngle(ax, Math.PI * time); vals.push(q.x, q.y, q.z, q.w); }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${sn.node.name}.quaternion`, times, vals));
    }
    const pos = [];
    for (const time of times) pos.push(0, bob[st](time) * (m.scale || 1), 0);
    tracks.push(new THREE.VectorKeyframeTrack(`${rig.root.name}.position`, times, pos));
    clips.push(new THREE.AnimationClip(st, CLIP, tracks));
  }
  return clips;
}

// OBJ + MTL statiques (pose de repos), couleurs par matériau
export function toOBJ(rig, name) {
  rig.root.updateMatrixWorld(true);
  let obj = `# Sweet Pets Factory - ${name}\nmtllib ${name}.mtl\n`, mtl = `# Sweet Pets Factory - ${name}\n`;
  const mats = new Map();
  let vbase = 1;
  rig.root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!mats.has(m.name)) {
      mats.set(m.name, true);
      const c = m.color, e = m.emissive;
      mtl += `newmtl ${m.name}\nKd ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}\nKa 0 0 0\nKe ${e.r.toFixed(4)} ${e.g.toFixed(4)} ${e.b.toFixed(4)}\nd ${m.opacity.toFixed(3)}\nillum 2\n\n`;
    }
    const pos = o.geometry.attributes.position, v = new THREE.Vector3();
    obj += `o ${o.name}\nusemtl ${m.name}\n`;
    for (let k = 0; k < pos.count; k++) { v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld); obj += `v ${v.x.toFixed(4)} ${v.y.toFixed(4)} ${v.z.toFixed(4)}\n`; }
    for (let k = 0; k < pos.count; k += 3) obj += `f ${vbase + k} ${vbase + k + 1} ${vbase + k + 2}\n`;
    vbase += pos.count;
  });
  return { obj, mtl };
}
