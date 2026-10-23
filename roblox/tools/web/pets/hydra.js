// Hydre d'Olympe (Divin) : corps violet trapu, cinq cous de dragon aux yeux verts,
// crêtes et cristaux citron, ruines de temple en orbite.
import { Forge, V, euler, aim, shade } from '../forge.js';
import { furBody, leg, dragonHead, scaleRing, floaters, pillar, spikeRow, shardTail } from '../parts.js';

export default function hydra() {
  const F = new Forge("Hydre d'Olympe", 121);
  const BODY = '6B3FA0', B2 = '5A3388', B3 = '7D4FB5', BELLY = 'C9A6FF', LIME = 'C6FF4F', GOLD = 'E8B64A', DARK = '3A2160', MARBLE = 'F2EEF5';

  const body = F.bone('Body', V(0, 1.8, 0.3));
  F.at(body);
  F.ell(V(1.35, 1.05, 1.6), V(0, 1.85, 0.4), null, BODY, 'plastic', 2);
  F.ell(V(1.1, 0.7, 1.3), V(0, 1.45, 0.3), null, BELLY, 'plastic', 1);
  for (let i = 0; i < 70; i++) { const th = F.rand(0, 6.28), ph = F.rand(0.1, 1.5); const n = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)); F.shard(V(n.x * 1.32, 1.85 + n.y * 1.03, 0.4 + n.z * 1.57), n.clone().add(V(0, -0.3, 0.8)), 0.3, 0.16, [BODY, B2, B3][i % 3], 'plastic', n); }
  spikeRow(F, V(0, 2.95, -0.2), V(0, 2.5, 1.9), 7, () => V(0, 1, 0.5), (u) => 0.55 - u * 0.2, 0.25, [LIME, DARK], 'plastic');
  shardTail(F, 'Tail', body, [V(0, 1.9, 1.9), V(0, 1.6, 2.6), V(0.3, 1.0, 3.1), V(0.6, 0.5, 3.3)], [0.45, 0.35, 0.25, 0.1], BODY, [LIME, DARK], 4, 0.4);
  F.at(0);
  [[-0.85, -0.6, 0], [0.85, -0.6, Math.PI], [-0.9, 1.3, Math.PI], [0.9, 1.3, 0]].forEach(([x, z, ph], i) => {
    leg(F, `Leg${i + 1}`, body, V(x, 1.6, z), V(x * 1.15, 0.9, z), V(x * 1.15, 0.22, z - 0.1), 0.34, BODY, { walk: ph, claws: LIME, paw: DARK });
  });
  // cinq cous
  const C = { body: BODY, dark: DARK, belly: BELLY, horn: DARK, crest: LIME, fin: B3, eye: LIME, gold: GOLD };
  const necks = [];
  [-2, -1, 0, 1, 2].forEach((k, n) => {
    const a = k * 0.62;
    const pts = [];
    const H = 2.2 + (2 - Math.abs(k)) * 0.45;
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      pts.push(V(Math.sin(a) * (0.5 + u * 2.3), 2.3 + H * Math.sin(u * Math.PI / 2), -0.6 - Math.cos(a) * u * 1.3 + 0.4 * Math.sin(u * Math.PI)));
    }
    const bones = F.chain(`Neck${n + 1}_`, pts, pts.map((_, i) => 0.36 - i * 0.03), BODY, {
      parent: body, segs: 7, joint: true,
      deco: (i, f) => { scaleRing(F, f, 7, [BODY, B2, B3], B3, { alt: i }); if (i % 2) F.spike(f.a.clone().addScaledVector(f.top, f.r), f.top.clone().addScaledVector(f.t, 0.6), 0.25, 0.07, LIME, 'plastic', 4); },
    });
    const h = dragonHead(F, `Head${n + 1}`, bones[5], pts[6].clone().add(V(0, 0.1, -0.2)), 0.55, C, { crest: 4, fins: Math.abs(k) !== 1 });
    necks.push({ bones, ...h, n });
    F.at(0);
  });
  // ruines de temple et cristaux citron
  floaters(F, [V(-3.0, 1.5, -0.8), V(3.0, 1.8, -0.6), V(-2.8, 3.2, 1.4), V(2.9, 3.0, 1.6)], (p, i) => {
    pillar(F, p.clone().add(V(0, -0.5, 0)), 1.0, 0.16, MARBLE, 'plastic', euler(0.3 * Math.sin(i * 2), 0, 0.3 * Math.cos(i)));
    F.box(V(0.2, 0.08, 0.2), p.clone().add(V(0, 0.55, 0)), null, GOLD, 'gold');
  });
  floaters(F, [V(-1.8, 5.6, -0.8), V(1.9, 5.4, -0.6), V(0, 6.2, 0.6), V(-2.4, 4.4, -1.8), V(2.4, 4.6, -1.6)], (p) => F.spike(p, V(0.2, 1, 0), 0.5, 0.13, LIME, 'neon', 4));
  // animations
  F.anim('idle', body, [1, 0, 0], 1, 0.5, 0);
  F.anim('move', body, [0, 0, 1], 3, 1, 0);
  F.anim('ability', body, [1, 0, 0], 3, 1, 0, -3);
  for (const nk of necks) {
    nk.bones.forEach((b, i) => {
      F.anim('idle', b, [0, 0, 1], 3, 0.5, nk.n * 1.3 - i * 0.4);
      F.anim('idle', b, [1, 0, 0], 2, 0.5, nk.n * 1.1 - i * 0.4);
      F.anim('move', b, [0, 0, 1], 5, 1, nk.n * 1.3 - i * 0.5);
      F.anim('ability', b, [1, 0, 0], 8, 1, nk.n * 1.25 - i * 0.3, 2); // frappes en vague
    });
    F.anim('idle', nk.jaw, [1, 0, 0], 6, 0.5, nk.n, -8);
    F.anim('move', nk.jaw, [1, 0, 0], 6, 1, nk.n, -8);
    F.anim('ability', nk.jaw, [1, 0, 0], 16, 1, nk.n * 1.25, -20);
  }
  return F;
}
