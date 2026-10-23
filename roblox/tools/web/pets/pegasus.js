// Pégase Barbe-à-Papa (Mythique) : cheval ailé blanc rosé, crinière et queue en éclats
// de barbe-à-papa, sabots dorés, cristaux roses et nuages autour.
import { Forge, V, euler, aim, shade } from '../forge.js';
import { furBody, leg, wing, eyes, floaters, shardTail } from '../parts.js';

export default function pegasus() {
  const F = new Forge('Pégase Barbe-à-Papa', 51);
  const BODY = 'FFF6FB', BELLY = 'FFD6EC', PINK = 'FF8FB8', PINK2 = 'FFB3D1', LILAC = 'C9A6FF', GOLD = 'E8B64A', EYE = 'FF4FA0';
  const MANE = [PINK, PINK2, LILAC, 'FF6FA8'];

  const body = F.bone('Body', V(0, 2.4, 0));
  F.at(body);
  F.ell(V(0.85, 0.82, 1.5), V(0, 2.45, 0.1), euler(0.05, 0, 0), BODY, 'plastic', 2);
  F.ell(V(0.75, 0.55, 1.2), V(0, 2.15, 0.15), null, BELLY, 'plastic', 1);
  // paillettes roses sur la robe
  for (let i = 0; i < 40; i++) {
    const th = F.rand(0, 6.28), ph = F.rand(0.4, 2.4);
    const n = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    F.shard(V(n.x * 0.85, 2.45 + n.y * 0.82, 0.1 + n.z * 1.5), n.clone().add(V(0, -0.5, 0.6)), 0.3, 0.12, i % 3 ? PINK2 : LILAC, 'plastic', n);
  }
  // cou + crinière
  const neck = F.bone('Neck', V(0, 2.9, -1.0), body);
  F.at(neck);
  F.seg(V(0, 2.7, -1.0), V(0, 3.9, -1.65), 0.55, 0.38, BODY, 'plastic', 7);
  for (let i = 0; i < 22; i++) {
    const u = i / 21;
    const p = V(F.rand(-0.15, 0.15), 3.05 + u * 1.05, -0.85 - u * 0.7);
    F.shard(p, V(F.rand(-0.6, 0.6), 0.3, 1).normalize(), 0.7 - u * 0.2, 0.2, MANE[i % 4], 'plastic', V(1, 0, 0));
  }
  // tête
  const head = F.bone('Head', V(0, 3.95, -1.7), neck);
  F.at(head);
  F.ell(V(0.42, 0.45, 0.5), V(0, 4.05, -1.75), null, BODY, 'plastic', 1);
  F.seg(V(0, 3.95, -1.95), V(0, 3.62, -2.65), 0.32, 0.24, BODY, 'plastic', 7, Math.PI / 7);
  F.ell(V(0.26, 0.2, 0.2), V(0, 3.58, -2.65), null, BELLY, 'plastic', 1);
  for (const sx of [-1, 1]) F.ell(V(0.05, 0.04, 0.04), V(sx * 0.12, 3.6, -2.83), null, '6A3A55', 'plastic', 0);
  eyes(F, V(0, 4.12, -2.1), 0.3, 0.13, EYE, { brow: PINK, turn: 2 });
  for (const sx of [-1, 1]) F.spike(V(sx * 0.2, 4.4, -1.65), V(sx * 0.2, 1, 0.2), 0.42, 0.11, BODY, 'plastic', 4);
  for (let i = 0; i < 8; i++) F.shard(V(F.rand(-0.15, 0.15), 4.45, -1.85 + i * 0.05), V(F.rand(-0.5, 0.5), 0.6, -1), 0.5, 0.15, MANE[i % 4], 'plastic', V(1, 0, 0));
  // corne dorée spiralée
  F.seg(V(0, 4.42, -1.95), V(0, 5.05, -2.25), 0.09, 0.015, GOLD, 'gold', 5);
  F.ring(0.08, 0.02, V(0, 4.55, -2.0), aim(V(0, 1, -0.45)).multiply(euler(Math.PI / 2, 0, 0)), PINK2, 'plastic', 8, 3);
  F.at(body);

  // ailes
  const wings = [-1, 1].map((sx) => wing(F, sx < 0 ? 'WingL' : 'WingR', body, V(sx * 0.6, 3.05, -0.3), sx, 2.6, ['FFE9F4', PINK2, PINK, LILAC], { rows: 4, per: 11, long: 1.1, fw: 0.42 }));
  // queue
  shardTail(F, 'Tail', body, [V(0, 2.75, 1.5), V(0, 2.55, 2.05), V(0, 2.1, 2.45), V(0, 1.6, 2.7)], [0.18, 0.22, 0.2, 0.1], PINK, MANE, 14, 0.55);
  F.at(0);
  // pattes
  [[-0.45, -0.85, 0], [0.45, -0.85, Math.PI], [-0.45, 1.05, Math.PI], [0.45, 1.05, 0]].forEach(([x, z, ph], i) => {
    leg(F, `Leg${i + 1}`, body, V(x, 2.1, z), V(x, 1.1, z + (z < 0 ? -0.05 : 0.15)), V(x, 0.22, z), 0.22, BODY, { walk: ph, hoof: true, paw: GOLD, pawMat: 'gold' });
  });
  // nuages + cristaux roses autour
  floaters(F, [V(-2.6, 1.0, -1.2), V(2.6, 1.2, -0.8), V(-2.4, 1.1, 1.6), V(2.3, 0.9, 1.8)], (p) => {
    for (let k = 0; k < 5; k++) F.ell(V(1, 0.8, 1).multiplyScalar(0.28 + (k % 3) * 0.08), p.clone().add(V((k - 2) * 0.28, (k % 2) * 0.15, (k % 3 - 1) * 0.15)), null, k % 2 ? 'FFFFFF' : 'FFE3F0', 'plastic', 1);
  });
  floaters(F, [V(-1.9, 4.2, -1.8), V(2.0, 4.5, -1.2), V(-2.3, 3.0, 0.6), V(2.3, 3.3, 0.9), V(0.2, 5.6, -0.4)], (p, i) => F.spike(p, V(0.2, 1, 0), 0.5, 0.14, i % 2 ? PINK : LILAC, 'neon', 4));

  F.anim('idle', body, [1, 0, 0], 1.5, 0.5, 0);
  F.anim('move', body, [1, 0, 0], 4, 1, 0, -3);
  F.anim('ability', body, [1, 0, 0], 6, 1, 0, -12); // se cabre
  F.anim('idle', neck, [1, 0, 0], 3, 0.5, 1);
  F.anim('move', neck, [1, 0, 0], 6, 1, 0.5);
  F.anim('ability', neck, [1, 0, 0], 8, 1, 0.5, -6);
  F.anim('idle', head, [0, 1, 0], 5, 0.5, 0);
  F.anim('move', head, [1, 0, 0], 5, 1, 1);
  F.anim('ability', head, [1, 0, 0], 10, 1, 1);
  F.bob('move', 0.4, 1); F.bob('ability', 0.6, 1);
  return F;
}
