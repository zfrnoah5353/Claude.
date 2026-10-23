// Mammouth d'Ymir (Mythique) : fourrure en éclats marquée d'or, défenses cerclées,
// tour-horloge sur le dos, grand anneau doré et engrenages qui tournent autour.
import * as THREE from 'three';
import { Forge, V, euler, aim, shade } from '../forge.js';
import { furBody, leg, eyes, onEll } from '../parts.js';

export default function mammoth() {
  const F = new Forge("Mammouth d'Ymir", 31);
  const BODY = '7A4A2A', FUR = ['7A4A2A', '6A3E22', '8A5632', '5A3418', '94603A'], DARK = '4A2A14', TUSK = 'EEE6D0', GOLD = 'E8B64A', GLOW = 'FFE27A';

  const body = F.bone('Body', V(0, 2.6, 0));
  F.at(body);
  const bc = V(0, 2.65, 0.15), bs = V(1.45, 1.45, 1.85);
  furBody(F, bc, bs, BODY, FUR, 340, { len: 0.55, flow: V(0, -0.9, 0.2), minY: -0.9, skip: (p) => p.y > 3.85 && Math.abs(p.z - 0.2) < 0.7 && Math.abs(p.x) < 0.7 });
  // marques dorées en triangles
  for (let i = 0; i < 46; i++) {
    const { p, n } = onEll(bc, bs, F.rand(0, Math.PI * 2), Math.acos(F.rand(-0.85, 0.2)));
    F.shard(p.addScaledVector(n, 0.04), n.clone().multiplyScalar(0.3).add(V(0, -1, 0)), 0.36, 0.17, GLOW, 'neon', n);
  }

  // tête + bosse
  const head = F.bone('Head', V(0, 3.2, -1.5), body);
  F.at(head);
  furBody(F, V(0, 3.45, -1.95), V(1.05, 1.15, 0.9), BODY, FUR, 140, { len: 0.45, flow: V(0, -1, 0), minY: -0.6 });
  eyes(F, V(0, 3.55, -2.78), 0.38, 0.13, GLOW, { brow: DARK, pupil: true });
  // défenses courbes cerclées d'or
  for (const sx of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 9; i++) {
      const u = i / 9;
      pts.push(V(sx * (0.55 + 0.55 * u), 2.75 - 1.1 * Math.sin(u * Math.PI * 0.75) + 0.9 * u * u, -2.35 - 1.0 * Math.sin(u * Math.PI * 0.6)));
    }
    for (let i = 0; i < 9; i++) {
      const r = 0.2 * (1 - i / 10) + 0.03;
      F.seg(pts[i], pts[i + 1], r, r * 0.92, TUSK, 'plastic', 7);
      if (i === 2 || i === 5) F.ring(r * 1.05, 0.04, pts[i], aim(pts[i + 1].clone().sub(pts[i])).multiply(euler(Math.PI / 2, 0, 0)), GOLD, 'gold', 12, 4);
    }
    F.spike(pts[9], pts[9].clone().sub(pts[8]), 0.18, 0.05, GOLD, 'gold', 6);
  }
  // trompe articulée
  const trunkPts = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    trunkPts.push(V(0, 3.0 - 2.3 * u + 0.7 * Math.max(0, u - 0.7) * 4, -2.65 - 0.55 * Math.sin(u * Math.PI * 0.9) - 0.25 * u));
  }
  const trunk = F.chain('Trunk', trunkPts, trunkPts.map((_, i) => 0.36 - i * 0.03), BODY, {
    parent: head, segs: 7, joint: true,
    deco: (i, f) => {
      if (i % 2 === 1) F.ring(f.r * 1.02, 0.045, f.a, aim(f.t).multiply(euler(Math.PI / 2, 0, 0)), GOLD, 'gold', 14, 4);
      for (let k = 0; k < 6; k++) { const a = F.rand(0, 6.28); const n = f.side.clone().multiplyScalar(Math.cos(a)).addScaledVector(f.top, Math.sin(a)); F.shard(f.a.clone().lerp(f.b, F.rand(0, 1)).addScaledVector(n, f.r * 0.85), n.clone().add(V(0, -0.8, 0)), 0.22, 0.09, FUR[k % 5], 'plastic', n); }
    },
  });
  F.at(body);
  for (const sx of [-1, 1]) furBody(F, V(sx * 1.05, 3.55, -1.6), V(0.18, 0.55, 0.45), BODY, FUR, 16, { len: 0.35 }); // oreilles

  // tour-horloge sur le dos
  const tower = F.bone('Tower', V(0, 4.0, 0.2), body);
  F.at(tower);
  F.box(V(1.0, 0.25, 1.0), V(0, 4.0, 0.2), null, DARK);
  F.box(V(0.9, 1.25, 0.9), V(0, 4.7, 0.2), null, '5C3A20');
  for (const [x, z] of [[-0.47, -0.27], [0.47, -0.27], [-0.47, 0.67], [0.47, 0.67]]) F.box(V(0.1, 1.3, 0.1), V(x, 4.7, z), null, GOLD, 'gold');
  F.box(V(1.05, 0.1, 1.05), V(0, 5.35, 0.2), null, GOLD, 'gold');
  F.seg(V(0, 4.8, -0.27), V(0, 4.8, -0.3), 0.36, 0.36, GOLD, 'gold', 16);
  F.seg(V(0, 4.8, -0.3), V(0, 4.8, -0.32), 0.3, 0.3, GLOW, 'neon', 16);
  for (let h = 0; h < 12; h++) { const a = h / 12 * Math.PI * 2; F.box(V(0.03, 0.06, 0.02), V(Math.cos(a) * 0.25, 4.8 + Math.sin(a) * 0.25, -0.34), euler(0, 0, a), DARK); }
  F.box(V(0.035, 0.22, 0.02), V(0, 4.9, -0.345), null, DARK);
  F.box(V(0.16, 0.035, 0.02), V(0.07, 4.8, -0.345), null, DARK);
  F.seg(V(0, 5.4, 0.2), V(0, 6.15, 0.2), 0.78, 0.02, GOLD, 'gold', 4, Math.PI / 4);
  F.ell(V(0.09, 0.09, 0.09), V(0, 6.2, 0.2), null, GLOW, 'neon', 1);
  // fenêtres lumineuses sur les côtés
  for (const sx of [-1, 1]) F.box(V(0.03, 0.35, 0.22), V(sx * 0.46, 4.75, 0.25), null, GLOW, 'neon');
  F.at(body);
  // fumée (deux cheminées)
  const smoke = F.bone('Smoke', V(0, 5.6, 0.2), tower);
  F.at(smoke);
  for (const sx of [-1, 1]) {
    F.seg(V(sx * 0.32, 5.4, 0.55), V(sx * 0.32, 5.75, 0.55), 0.08, 0.08, DARK, 'plastic', 6);
    for (let k = 0; k < 4; k++) F.ell(V(1, 1, 1).multiplyScalar(0.14 + k * 0.05), V(sx * (0.32 + k * 0.08), 5.85 + k * 0.22, 0.55 + k * 0.05), null, k % 2 ? 'F2EEF5' : 'DCD6E2', 'plastic', 0);
  }
  F.at(body);

  F.at(0);
  [[-0.8, -0.9, 0], [0.8, -0.9, Math.PI], [-0.8, 1.1, Math.PI], [0.8, 1.1, 0]].forEach(([x, z, ph], i) => {
    const [up, lo] = leg(F, `Leg${i + 1}`, body, V(x, 2.0, z), V(x, 1.0, z), V(x, 0.2, z), 0.48, BODY, { walk: ph, paw: DARK, hoof: true });
    F.at(up);
    furBody(F, V(x, 1.45, z), V(0.5, 0.55, 0.5), BODY, FUR, 26, { len: 0.35, flow: V(0, -1, 0) });
    F.at(0);
  });

  // grand anneau doré derrière (tourne d'un quart de tour par boucle, 4 repères)
  const ring = F.bone('Halo', V(0, 3.8, 1.9), 0);
  F.spin(ring, [0, 0, 1], 0.25);
  F.at(ring);
  F.ring(3.1, 0.13, V(0, 3.8, 1.9), null, GOLD, 'gold', 64, 6);
  F.ring(2.75, 0.06, V(0, 3.8, 1.92), null, '3A2414', 'plastic', 64, 4);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    F.box(V(0.14, 0.42, 0.1), V(Math.cos(a) * 3.1, 3.8 + Math.sin(a) * 3.1, 1.86), euler(0, 0, a + Math.PI / 2), shade(GOLD, -0.2), 'gold');
  }
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2 + 0.2; F.spike(V(Math.cos(a) * 2.4, 3.8 + Math.sin(a) * 2.4, 1.9), V(Math.cos(a), Math.sin(a), 0), 0.18, 0.06, GLOW, 'neon', 4); }
  F.at(0);

  // engrenages flottants (10 dents : 1/10 de tour par boucle)
  [[-2.7, 1.4, -0.8, 0.5], [2.8, 1.6, -0.6, 0.45], [-3.1, 3.4, 0.4, 0.38], [3.2, 3.3, 0.6, 0.42], [-1.9, 0.6, -2.4, 0.33], [2.0, 0.7, -2.5, 0.36], [-3.3, 2.4, -1.6, 0.25], [3.4, 4.6, -0.4, 0.28]].forEach(([x, y, z, R], i) => {
    const p = V(x, y, z);
    const fl = F.bone('GearFloat' + (i + 1), p, 0);
    for (const st of ['idle', 'move', 'ability']) F.anim(st, fl, [1, 0, 0], 6, 0.5, i * 1.3);
    const g = F.bone('Gear' + (i + 1), p, fl);
    F.spin(g, [Math.sin(0.5 + i), 0, -Math.cos(0.5 + i)], (i % 2 ? -1 : 1) * 0.1);
    F.at(g);
    const q = aim(V(Math.sin(0.5 + i), 0, -Math.cos(0.5 + i))).multiply(euler(Math.PI / 2, 0, 0));
    F.gear(R, 10, R * 0.28, p, q, i % 3 ? GOLD : 'B8862F', 'gold', 0.3);
    F.at(0);
  });

  // animations
  F.anim('idle', body, [1, 0, 0], 1, 0.5, 0);
  F.anim('move', body, [0, 0, 1], 3, 1, 0);
  F.anim('ability', body, [1, 0, 0], 5, 1, 0, -6);
  F.anim('idle', head, [1, 0, 0], 3, 0.5, 0.6);
  F.anim('move', head, [1, 0, 0], 5, 1, 0.3);
  F.anim('ability', head, [1, 0, 0], 12, 1, 0, -8);
  F.anim('idle', smoke, [0, 0, 1], 6, 0.5, 0);
  F.anim('move', smoke, [1, 0, 0], 10, 1, 0, 8);
  F.anim('ability', smoke, [0, 0, 1], 10, 1, 0);
  trunk.forEach((b, i) => {
    F.anim('idle', b, [1, 0, 0], 4, 0.5, -i * 0.5);
    F.anim('idle', b, [0, 1, 0], 3, 0.5, -i * 0.5 + 1);
    F.anim('move', b, [0, 0, 1], 6, 1, -i * 0.6);
    F.anim('ability', b, [1, 0, 0], 10, 1, -i * 0.4, -10); // coup de trompe vers le haut
  });
  return F;
}
