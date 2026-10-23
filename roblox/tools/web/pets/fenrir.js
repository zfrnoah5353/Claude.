// Fenrir Lune de Sang (Mythique) : loup noir hérissé, fissures rouges lumineuses,
// lune de sang derrière lui et éclats rouges en orbite.
import { Forge, V, euler, aim, shade } from '../forge.js';
import { furBody, leg, eyes, teeth, floaters, spikeRow } from '../parts.js';

export default function fenrir() {
  const F = new Forge('Fenrir Lune de Sang', 23);
  const BODY = '2A1F2E', DARK = '16101A', FUR = ['2A1F2E', '33263A', '1F1724', '3D2C40'], RED = 'FF2A3D', BLOOD = 'B3122A', CLAW = 'E8E0D8';

  const body = F.bone('Body', V(0, 2.0, 0));
  F.at(body);
  const bc = V(0, 2.05, 0.1), bs = V(0.95, 0.95, 1.55);
  furBody(F, bc, bs, BODY, FUR, 170, { quat: euler(0.22, 0, 0), len: 0.5, flow: V(0, -0.35, 0.8), minY: -0.4 });
  // crinière autour du cou
  furBody(F, V(0, 2.65, -1.1), V(0.95, 0.95, 0.75), BODY, FUR, 90, { len: 0.7, flow: V(0, -0.2, 0.9), minY: -0.5 });
  // fissures rouges lumineuses sur les flancs
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z = -0.9 + i * 0.55;
    F.box(V(0.05, 0.09, 0.42), V(sx * 0.93, 2.1 + Math.sin(i * 2.1) * 0.25, z), euler(0.3 * Math.sin(i * 3), 0.25 * sx, 0.5 * Math.cos(i)), RED, 'neon');
  }
  // piques le long de la colonne
  spikeRow(F, V(0, 2.95, -1.3), V(0, 2.75, 1.4), 9, (u) => V(0, 1, 0.5 + u * 0.4), (u) => 0.55 - 0.25 * u, 0.28, [BLOOD, DARK], 'plastic');

  // tête
  const head = F.bone('Head', V(0, 3.0, -1.6), body);
  F.at(head);
  F.ell(V(0.62, 0.58, 0.7), V(0, 3.25, -2.05), null, BODY, 'plastic', 1);
  F.seg(V(0, 3.12, -2.3), V(0, 3.02, -3.05), 0.34, 0.2, BODY, 'plastic', 6, Math.PI / 6);
  F.ell(V(0.13, 0.1, 0.1), V(0, 3.12, -3.06), null, '0A070C', 'plastic', 1);
  eyes(F, V(0, 3.42, -2.58), 0.23, 0.16, RED, { brow: DARK });
  for (const sx of [-1, 1]) {
    F.spike(V(sx * 0.35, 3.7, -1.95), V(sx * 0.35, 1, 0.25), 0.6, 0.18, BODY, 'plastic', 4);
    F.spike(V(sx * 0.35, 3.72, -1.98), V(sx * 0.35, 1, 0.2), 0.4, 0.09, BLOOD, 'plastic', 3);
  }
  furBody(F, V(0, 3.35, -1.85), V(0.55, 0.5, 0.45), BODY, FUR, 30, { len: 0.35, flow: V(0, 0, 1) });
  teeth(F, V(-0.22, 2.95, -2.6), V(-0.12, 2.92, -3.0), 3, V(0, -1, 0), 0.16, CLAW);
  teeth(F, V(0.22, 2.95, -2.6), V(0.12, 2.92, -3.0), 3, V(0, -1, 0), 0.16, CLAW);
  // mâchoire
  const jaw = F.bone('Jaw', V(0, 2.95, -2.3), head);
  F.at(jaw);
  F.seg(V(0, 2.85, -2.3), V(0, 2.82, -2.95), 0.22, 0.14, DARK, 'plastic', 6, Math.PI / 6);
  F.box(V(0.3, 0.05, 0.55), V(0, 2.96, -2.62), null, BLOOD);
  teeth(F, V(-0.15, 2.95, -2.7), V(0.15, 2.95, -2.7), 4, V(0, 1, 0), 0.12, CLAW);
  F.at(body);

  // queue touffue
  const tailPts = [V(0, 2.4, 1.5), V(0, 2.6, 2.1), V(0, 2.5, 2.7), V(0, 2.1, 3.15)];
  const tail = F.chain('Tail', tailPts, [0.32, 0.4, 0.34, 0.12], BODY, {
    parent: body, segs: 6,
    deco: (i, f) => { for (let k = 0; k < 14; k++) { const a = F.rand(0, 6.28); const n = f.side.clone().multiplyScalar(Math.cos(a)).addScaledVector(f.top, Math.sin(a)); F.shard(f.a.clone().lerp(f.b, F.rand(0, 1)).addScaledVector(n, f.r * 0.8), n.clone().multiplyScalar(0.5).add(f.t), 0.45, 0.14, FUR[k % 4], 'plastic', n); } },
  });
  F.at(0);

  // pattes (puissantes, griffues)
  [[-0.55, -0.85, 0], [0.55, -0.85, Math.PI], [-0.55, 1.0, Math.PI], [0.55, 1.0, 0]].forEach(([x, z, ph], i) => {
    const front = z < 0;
    leg(F, `Leg${i + 1}`, body, V(x, front ? 2.0 : 1.9, z), V(x * 1.1, 1.05, z + (front ? -0.1 : 0.25)), V(x * 1.1, 0.2, z + (front ? -0.15 : 0.05)), 0.3, BODY, { walk: ph, claws: CLAW, paw: DARK });
  });

  // lune de sang
  const moon = F.bone('Moon', V(0, 5.0, 2.6), 0);
  F.at(moon);
  F.seg(V(0, 5.0, 2.75), V(0, 5.0, 2.55), 1.55, 1.55, BLOOD, 'plastic', 20);
  F.seg(V(0, 5.0, 2.55), V(0, 5.0, 2.5), 1.4, 1.4, 'D81E34', 'plastic', 20);
  [[-0.6, 5.5, 0.32], [0.55, 4.6, 0.26], [0.2, 5.6, 0.18], [-0.35, 4.5, 0.2], [0.75, 5.35, 0.14]].forEach(([x, y, r]) => {
    const q = aim(V(0, 0, -1));
    F.seg(V(x, y, 2.5), V(x, y, 2.46), r, r * 0.9, '8E0E20', 'plastic', 10);
  });
  F.at(0);
  for (const st of ['idle', 'move', 'ability']) F.anim(st, moon, [0, 0, 1], 4, 0.5, 0);

  // éclats rouges en orbite
  floaters(F, [V(-2.2, 3.2, -1.2), V(2.3, 3.6, -0.6), V(-2.6, 2.0, 1.0), V(2.4, 2.2, 1.4), V(-1.6, 4.3, 0.4), V(1.7, 4.6, 0.8), V(0, 4.2, -2.6)], (p) => {
    F.spike(p.clone().add(V(0, -0.25, 0)), V(0.2, 1, 0.1), 0.55, 0.13, RED, 'neon', 4);
  });

  // animations du corps
  F.anim('idle', body, [1, 0, 0], 1.5, 0.5, 0);
  F.anim('move', body, [1, 0, 0], 4, 1, 0);
  F.anim('ability', body, [1, 0, 0], 6, 1, 0, -8); // se cabre pour hurler
  F.anim('idle', head, [1, 0, 0], 3, 0.5, 1);
  F.anim('move', head, [1, 0, 0], 5, 1, 0.8);
  F.anim('ability', head, [1, 0, 0], 8, 1, 0, -22);
  F.anim('idle', jaw, [1, 0, 0], 3, 0.5, 0, -4);
  F.anim('move', jaw, [1, 0, 0], 6, 1, 0, -8);
  F.anim('ability', jaw, [1, 0, 0], 10, 1, 0, -24);
  tail.forEach((b, i) => {
    F.anim('idle', b, [0, 1, 0], 8, 0.5, -i * 0.6);
    F.anim('move', b, [0, 1, 0], 16, 1, -i * 0.6);
    F.anim('ability', b, [1, 0, 0], 10, 1, -i * 0.5, -10);
  });
  return F;
}
