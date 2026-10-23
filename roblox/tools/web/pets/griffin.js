// Griffon Céleste (Mythique) : tête et ailes d'aigle aux plumes violettes, corps de lion doré,
// serres, étoiles bleues en orbite.
import { Forge, V, euler, aim, shade } from '../forge.js';
import { furBody, leg, wing, eyes, floaters, shardTail } from '../parts.js';

export default function griffin() {
  const F = new Forge('Griffon Céleste', 91);
  const BODY = 'C89A50', FUR = ['C89A50', 'B8893F', 'D8AC62'], WHITE = 'FFFFFF', FEATH = ['FFFFFF', 'EDEBFF', 'DAD4FF'], PURP = '8C7BFF', DEEP = '4B3A8C', GOLD = 'E8B64A', BEAK = 'F2B33D', GLOW = '7FD6FF';

  const body = F.bone('Body', V(0, 2.2, 0));
  F.at(body);
  furBody(F, V(0, 2.2, 0.5), V(0.85, 0.85, 1.25), BODY, FUR, 90, { len: 0.3, flow: V(0, -0.4, 0.8), minY: -0.6 });
  // poitrail de plumes
  furBody(F, V(0, 2.65, -0.75), V(0.9, 1.0, 0.85), WHITE, FEATH, 120, { len: 0.42, flow: V(0, -1, 0.3), minY: -0.7 });
  const head = F.bone('Head', V(0, 3.5, -1.1), body);
  F.at(head);
  furBody(F, V(0, 3.75, -1.25), V(0.55, 0.55, 0.6), WHITE, FEATH, 60, { len: 0.32, flow: V(0, 0, 1), minY: -0.4 });
  // bec crochu
  F.seg(V(0, 3.7, -1.7), V(0, 3.62, -2.15), 0.2, 0.12, BEAK, 'gold', 5);
  F.seg(V(0, 3.62, -2.15), V(0, 3.35, -2.3), 0.12, 0.02, BEAK, 'gold', 5);
  F.seg(V(0, 3.5, -1.7), V(0, 3.47, -2.0), 0.13, 0.06, shade(BEAK, -0.2), 'gold', 5);
  eyes(F, V(0, 3.9, -1.68), 0.28, 0.12, GLOW, { brow: DEEP });
  for (let i = 0; i < 6; i++) F.shard(V(0, 4.1, -1.3 + i * 0.12), V((i % 2 ? 1 : -1) * 0.2, 0.7, 1), 0.55, 0.12, i % 2 ? PURP : DEEP, 'plastic', V(1, 0, 0)); // aigrette
  F.at(body);
  [-1, 1].forEach((sx) => wing(F, sx < 0 ? 'WingL' : 'WingR', body, V(sx * 0.6, 3.0, -0.2), sx, 2.9, [WHITE, 'DAD4FF', PURP, DEEP], { rows: 4, per: 11, fw: 0.36, long: 1.15 }));
  shardTail(F, 'Tail', body, [V(0, 2.5, 1.7), V(0, 2.3, 2.3), V(0, 1.8, 2.7), V(0, 1.4, 2.8)], [0.12, 0.11, 0.1, 0.08], BODY, [PURP, DEEP], 3, 0.4);
  F.at(0);
  [[-0.45, -0.85, 0, true], [0.45, -0.85, Math.PI, true], [-0.5, 1.05, Math.PI, false], [0.5, 1.05, 0, false]].forEach(([x, z, ph, front], i) => {
    leg(F, `Leg${i + 1}`, body, V(x, 2.0, z), V(x, 1.05, z + (front ? -0.1 : 0.2)), V(x, 0.22, z - 0.05), front ? 0.2 : 0.28, front ? BEAK : BODY, { walk: ph, claws: front ? DEEP : 'FFFFFF', paw: front ? BEAK : shade(BODY, -0.2) });
  });
  floaters(F, [V(-2.6, 3.8, -1.0), V(2.7, 4.2, -0.6), V(-2.9, 2.0, 0.8), V(2.8, 2.3, 1.1), V(0, 5.4, 0.2), V(-1.4, 5.0, 1.5)], (p, i) => {
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; F.spike(p, V(Math.cos(a), Math.sin(a), 0), 0.28 - (i % 2) * 0.08, 0.08, GLOW, 'neon', 3); }
  });
  F.anim('idle', body, [1, 0, 0], 1.5, 0.5, 0);
  F.anim('move', body, [1, 0, 0], 4, 1, 0, -3);
  F.anim('ability', body, [1, 0, 0], 6, 1, 0, -10);
  F.anim('idle', head, [0, 1, 0], 8, 0.5, 0);
  F.anim('move', head, [1, 0, 0], 5, 1, 0.5);
  F.anim('ability', head, [1, 0, 0], 16, 1, 0, 6); // coup de bec
  F.bob('move', 0.4, 1); F.bob('ability', 0.5, 1);
  return F;
}
