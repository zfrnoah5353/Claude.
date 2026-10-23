// Dragon Céleste (Mythique) : long dragon asiatique ondulant dans les airs, écailles vertes,
// crinière et moustaches dorées, perle lumineuse en orbite.
import { Forge, V, euler, aim, shade } from '../forge.js';
import { dragonHead, scaleRing, floaters, spikeRow } from '../parts.js';

export default function longdragon() {
  const F = new Forge('Dragon Céleste', 101);
  const BODY = '3DBE8C', B2 = '32A578', B3 = '4FD39E', BELLY = 'D8FFE8', GOLD = 'FFD23F', DARK = '1F7A58', MANE = ['FFD23F', 'FFB02E', 'FF8A3D'], GLOW = 'FFE27A', RED = 'E8473A';

  const pts = [], rad = [];
  const N = 20;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    pts.push(V(Math.sin(u * Math.PI * 2.2) * 1.6 * (1 - u * 0.3), 3.6 - 1.6 * Math.sin(u * Math.PI * 1.1) + u * 0.4, -1.6 + u * 4.2));
    rad.push(0.48 * (1 - u * 0.75) + 0.04);
  }
  const body = F.chain('Seg', pts, rad, BODY, {
    parent: 0, segs: 8, joint: true,
    deco: (i, f) => {
      scaleRing(F, f, 8, [BODY, B2, B3], BELLY, { offset: i % 2 * 0.5, alt: i });
      F.spike(f.a.clone().addScaledVector(f.top, f.r * 1.0), f.top.clone().addScaledVector(f.t, 0.8), 0.15 + f.r * 0.6, 0.08, i % 2 ? GOLD : RED, i % 2 ? 'gold' : 'plastic', 4);
      for (let k = 0; k < 3; k++) F.shard(f.a.clone().addScaledVector(f.top, f.r * 0.9).addScaledVector(f.side, (k - 1) * f.r * 0.4), f.t.clone().addScaledVector(f.top, 0.6), 0.25 + f.r * 0.5, 0.1, MANE[k], 'plastic', f.side);
      if (i === 3 || i === 13) for (const sx of [-1, 1]) { // petites pattes griffues
        const hip = f.a.clone().addScaledVector(f.side, sx * f.r);
        const ft = hip.clone().addScaledVector(f.side, sx * 0.45).add(V(0, -0.55, -0.1));
        F.seg(hip, ft, 0.12, 0.09, BODY, 'plastic', 6);
        for (const d of [-1, 0, 1]) F.spike(ft, V(d * 0.4, -0.7, -0.8), 0.22, 0.04, GOLD, 'gold', 3);
      }
    },
  });
  // queue en flamme
  const tail = pts[N];
  for (let k = 0; k < 7; k++) F.at(body[N - 1]).shard(tail, V((k - 3) * 0.25, 0.2 * (k % 2), 1), 0.6, 0.16, MANE[k % 3], 'plastic', V(0, 1, 0));
  F.at(0);
  // tête (attachée au premier segment)
  const { head, jaw } = dragonHead(F, 'Head', body[0], pts[0].clone().add(V(0, 0.15, -0.35)), 0.85,
    { body: BODY, dark: DARK, belly: BELLY, horn: 'F2EEE6', crest: RED, fin: GOLD, eye: 'FF4A3D', gold: GOLD }, { whiskers: GOLD });
  F.at(head);
  for (let i = 0; i < 16; i++) F.shard(pts[0].clone().add(V(F.rand(-0.35, 0.35), 0.3 + F.rand(0, 0.3), 0.2 + F.rand(0, 0.4))), V(F.rand(-0.5, 0.5), 0.3, 1), 0.6, 0.15, MANE[i % 3], 'plastic', V(1, 0, 0));
  F.at(0);
  // perle sacrée
  floaters(F, [V(0.6, 4.9, -2.6)], (p) => {
    F.ell(V(0.32, 0.32, 0.32), p, null, GLOW, 'neon', 2);
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; F.spike(p, V(Math.cos(a), Math.sin(a), 0.2), 0.55, 0.05, GOLD, 'gold', 3); }
  }, 12);
  floaters(F, [V(-2.2, 2.0, 0.2), V(2.4, 2.4, 1.0), V(-1.8, 4.8, 1.8), V(2.0, 5.2, -0.4)], (p, i) => {
    for (let k = 0; k < 4; k++) F.ell(V(0.25, 0.18, 0.25).multiplyScalar(1 + (k % 2) * 0.4), p.clone().add(V((k - 1.5) * 0.3, (k % 2) * 0.1, 0)), null, k % 2 ? 'FFFFFF' : 'E6FFF4', 'plastic', 1);
  });
  body.forEach((b, i) => {
    F.anim('idle', b, [0, 1, 0], 4, 0.5, -i * 0.5);
    F.anim('idle', b, [1, 0, 0], 3, 0.5, -i * 0.5 + 1);
    F.anim('move', b, [0, 1, 0], 7, 1, -i * 0.6);
    F.anim('move', b, [1, 0, 0], 4, 1, -i * 0.6 + 1);
    F.anim('ability', b, [1, 0, 0], 7, 1, -i * 0.4);
  });
  F.anim('idle', jaw, [1, 0, 0], 4, 0.5, 0, -8);
  F.anim('move', jaw, [1, 0, 0], 4, 1, 0, -8);
  F.anim('ability', jaw, [1, 0, 0], 12, 1, 0, -22);
  F.anim('ability', head, [1, 0, 0], 10, 1, 0.5);
  F.bob('idle', 0.25, 0.5); F.bob('move', 0.35, 1); F.bob('ability', 0.4, 1);
  return F;
}
