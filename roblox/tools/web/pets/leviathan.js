// Léviathan Cosmique (Divin) : serpent de mer enroulé en écailles tressées, cou dressé,
// tête de dragon à nageoires, colonnes dorées en orbite et bulles.
import { Forge, V, euler, aim, shade } from '../forge.js';
import { dragonHead, scaleRing, pillar, floaters, bubbles, spikeRow } from '../parts.js';

export default function leviathan() {
  const F = new Forge('Léviathan Cosmique', 41);
  const BODY = '2E9AA0', B2 = '257F86', B3 = '3AB3B5', DARK = '1E5C66', BELLY = 'B8F5EE', GOLD = 'E8B64A', CRYST = '9FF2EA', EYE = 'FFC81E', GLOW = '5FF0E0';

  // anneaux enroulés au sol (statiques), de la queue vers le cou
  const coil = [], crad = [];
  const NC = 52;
  for (let i = 0; i <= NC; i++) {
    const u = i / NC;
    const a = 0.6 + u * Math.PI * 2 * 2.0;
    const R = 2.05 - 0.45 * u;
    coil.push(V(Math.cos(a) * R, 0.5 + u * 2.0, Math.sin(a) * R + 0.2));
    crad.push(Math.min(0.5, 0.08 + u * 2.2));
  }
  const ringDeco = (i, f) => {
    scaleRing(F, f, 9, [BODY, B2, B3], BELLY, { offset: i % 2 * 0.5, alt: i });
    if (i % 6 === 3) F.ring(f.r * 1.08, 0.07, f.a, aim(f.t).multiply(euler(Math.PI / 2, 0, 0)), GOLD, 'gold', 14, 4);
    if (i % 2 === 0 && f.r > 0.2) F.spike(f.a.clone().addScaledVector(f.top, f.r * 1.05), f.top.clone().addScaledVector(f.t, 0.7), 0.15 + f.r * 0.45, 0.07, i % 4 ? GOLD : DARK, i % 4 ? 'gold' : 'plastic', 4);
  };
  F.chain('Coil', coil, crad, BODY, { static: true, segs: 9, joint: true, deco: ringDeco });

  // cou dressé articulé
  const base = coil[NC];
  const neckPts = [];
  for (let i = 0; i <= 8; i++) {
    const u = i / 8;
    neckPts.push(V(base.x * (1 - u) + 0.0 * u + 0.35 * Math.sin(u * Math.PI), base.y + u * 3.4, base.z * (1 - u) - 0.5 * u));
  }
  const neck = F.chain('Neck', neckPts, neckPts.map((_, i) => 0.55 - i * 0.025), BODY, { parent: 0, segs: 9, joint: true, deco: ringDeco });
  const top = neckPts[8];

  // petits bras griffus
  const arm = F.bones[neck[3]].pivot;
  for (const sx of [-1, 1]) {
    const sh = arm.clone().add(V(sx * 0.45, 0.1, -0.1));
    const el = sh.clone().add(V(sx * 0.55, -0.35, -0.35));
    const ha = el.clone().add(V(sx * 0.35, 0.25, -0.45));
    F.at(neck[3]);
    F.seg(sh, el, 0.14, 0.11, B2, 'plastic', 6);
    F.seg(el, ha, 0.11, 0.09, B2, 'plastic', 6);
    F.ring(0.12, 0.035, el, aim(ha.clone().sub(el)).multiply(euler(Math.PI / 2, 0, 0)), GOLD, 'gold', 10, 3);
    for (const d of [-1, 0, 1]) F.spike(ha, V(sx * 0.3 + d * 0.3, 0.2, -1), 0.22, 0.04, DARK, 'plastic', 3);
  }

  // tête
  const { head, jaw } = dragonHead(F, 'Head', neck[7], top.clone().add(V(0, 0.35, -0.3)), 0.95,
    { body: BODY, dark: DARK, belly: BELLY, horn: DARK, crest: DARK, fin: '1F6F78', eye: EYE, gold: GOLD });

  // colonnes dorées en orbite
  const cols = [];
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + 0.3; cols.push(V(Math.cos(a) * 3.6, 1.1 + (k % 3) * 0.9, Math.sin(a) * 3.6)); }
  floaters(F, cols, (p, k) => pillar(F, p.clone().add(V(0, -0.45, 0)), 0.9, 0.13, GOLD, 'gold', euler(0.2 * Math.sin(k), 0, 0.25 * Math.cos(k * 2))), 7);
  // ondes d'eau au sol
  F.ring(3.0, 0.03, V(0, 0.05, 0.2), euler(Math.PI / 2, 0, 0), GLOW, 'glass', 48, 3);
  F.ring(3.6, 0.025, V(0, 0.04, 0.2), euler(Math.PI / 2, 0, 0), GLOW, 'glass', 48, 3);
  bubbles(F, V(0, 0, 0.2), 16, 3.2);
  // étincelles de cristal
  floaters(F, [V(-1.4, 5.6, -1.0), V(1.6, 5.2, -0.6), V(-2.2, 3.8, -1.6), V(2.2, 3.9, -1.4)], (p) => F.spike(p, V(0, 1, 0), 0.3, 0.09, CRYST, 'neon', 4));

  // animations : le cou ondule, la tête mord
  neck.forEach((b, i) => {
    F.anim('idle', b, [0, 0, 1], 2.5, 0.5, -i * 0.5);
    F.anim('idle', b, [1, 0, 0], 1.5, 0.5, -i * 0.5 + 1);
    F.anim('move', b, [0, 0, 1], 5, 1, -i * 0.6);
    F.anim('ability', b, [1, 0, 0], 6, 1, -i * 0.25, -2.5);
  });
  F.anim('idle', head, [1, 0, 0], 4, 0.5, 0);
  F.anim('move', head, [0, 1, 0], 8, 1, 0);
  F.anim('ability', head, [1, 0, 0], 14, 1, 0, -6);
  F.anim('idle', jaw, [1, 0, 0], 5, 0.5, 0, -10);
  F.anim('move', jaw, [1, 0, 0], 6, 1, 0, -12);
  F.anim('ability', jaw, [1, 0, 0], 18, 1, 0, -22);
  F.bob('idle', 0.02, 0.5); F.bob('move', 0.05, 1); F.bob('ability', 0.08, 1);
  return F;
}
