// Anubis Cacao (Mythique) : chacal debout noir et or, pagne rayé, collier ousekh,
// sceptre ouas, yeux dorés lumineux, ankh et scarabée en orbite.
import { Forge, V, euler, aim, shade } from '../forge.js';
import { beastHead, headAnims, floaters, eyes } from '../parts.js';

export default function anubis() {
  const F = new Forge('Anubis Cacao', 81);
  const BODY = '2A2230', SKIN = '4A3A50', GOLD = 'E8B64A', BLUE = '2E5FB8', TEAL = '2FA8A0', GLOW = 'FFD54A', WHITE = 'F2EEE6';

  const hips = F.bone('Hips', V(0, 2.1, 0));
  F.at(hips);
  // pagne rayé
  F.seg(V(0, 1.55, 0), V(0, 2.25, 0), 0.62, 0.5, WHITE, 'plastic', 8);
  for (let i = 0; i < 6; i++) F.box(V(0.08, 0.66, 0.05), V(-0.25 + i * 0.1, 1.85, -0.6 + Math.abs(i - 2.5) * 0.02), euler(0.08, 0, 0), i % 2 ? GOLD : BLUE, i % 2 ? 'gold' : 'plastic');
  F.ring(0.52, 0.07, V(0, 2.25, 0), euler(Math.PI / 2, 0, 0), GOLD, 'gold', 16, 4);
  // jambes
  const legs = [-1, 1].map((sx) => {
    const up = F.bone(sx < 0 ? 'LegL' : 'LegR', V(sx * 0.32, 1.75, 0), hips);
    F.at(up);
    F.seg(V(sx * 0.32, 1.75, 0), V(sx * 0.34, 0.95, -0.05), 0.24, 0.18, SKIN, 'plastic', 6);
    F.seg(V(sx * 0.34, 0.95, -0.05), V(sx * 0.34, 0.22, 0.08), 0.18, 0.13, SKIN, 'plastic', 6);
    F.ring(0.17, 0.05, V(sx * 0.34, 0.45, 0.05), euler(Math.PI / 2, 0, 0), GOLD, 'gold', 12, 3);
    F.box(V(0.3, 0.14, 0.55), V(sx * 0.34, 0.1, -0.08), null, GOLD, 'gold');
    F.at(hips);
    return up;
  });
  // torse
  const chest = F.bone('Chest', V(0, 2.3, 0), hips);
  F.at(chest);
  F.seg(V(0, 2.2, 0), V(0, 3.3, 0), 0.48, 0.66, BODY, 'plastic', 8);
  F.ell(V(0.66, 0.3, 0.42), V(0, 3.32, 0), null, BODY, 'plastic', 1);
  // collier ousekh à rangées
  [[0.72, GOLD, 'gold'], [0.66, TEAL, 'plastic'], [0.6, GOLD, 'gold'], [0.54, BLUE, 'plastic']].forEach(([r, c, m], i) =>
    F.ring(r, 0.07, V(0, 3.38 - i * 0.07, -0.02), euler(Math.PI / 2 - 0.25, 0, 0), c, m, 20, 4));
  for (let k = 0; k < 14; k++) { const a = Math.PI * (0.1 + 0.8 * k / 13); F.box(V(0.06, 0.16, 0.04), V(Math.cos(a) * 0.7, 3.12 - Math.sin(a) * 0.04, -0.3 - Math.sin(a) * 0.3), euler(-0.3, 0, a - Math.PI / 2), GLOW, 'neon'); }
  // bras
  const arms = [-1, 1].map((sx) => {
    const sh = F.bone(sx < 0 ? 'ArmL' : 'ArmR', V(sx * 0.72, 3.25, 0), chest);
    F.at(sh);
    F.ell(V(0.26, 0.24, 0.26), V(sx * 0.72, 3.25, 0), null, GOLD, 'gold', 1);
    F.seg(V(sx * 0.75, 3.2, 0), V(sx * 0.85, 2.55, -0.15), 0.17, 0.14, SKIN, 'plastic', 6);
    F.seg(V(sx * 0.85, 2.55, -0.15), V(sx * 0.82, 2.05, -0.55), 0.14, 0.11, SKIN, 'plastic', 6);
    F.seg(V(sx * 0.84, 2.35, -0.3), V(sx * 0.83, 2.2, -0.42), 0.16, 0.16, GOLD, 'gold', 8);
    F.ell(V(0.13, 0.11, 0.13), V(sx * 0.82, 2.0, -0.6), null, SKIN, 'plastic', 1);
    if (sx > 0) { // sceptre ouas
      F.seg(V(0.82, 0.2, -0.65), V(0.82, 3.9, -0.65), 0.05, 0.05, GOLD, 'gold', 6);
      F.seg(V(0.82, 3.9, -0.65), V(0.82, 4.15, -0.95), 0.07, 0.06, GOLD, 'gold', 5);
      F.ell(V(0.07, 0.07, 0.07), V(0.82, 4.16, -0.97), null, GLOW, 'neon', 1);
      F.seg(V(0.82, 0.2, -0.65), V(0.82, 0.05, -0.55), 0.04, 0.02, GOLD, 'gold', 4);
      F.seg(V(0.82, 0.2, -0.65), V(0.82, 0.05, -0.75), 0.04, 0.02, GOLD, 'gold', 4);
    }
    F.at(chest);
    return sh;
  });
  // tête de chacal
  const { head, jaw } = beastHead(F, 'Head', chest, V(0, 3.95, -0.1), 0.85,
    { body: BODY, dark: '120D16', belly: SKIN, eye: GLOW, ear: GOLD }, { snout: 0.85, earH: 0.95 });
  F.at(head);
  for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) F.box(V(0.2, 0.08, 0.36), V(sx * 0.45, 3.85 - i * 0.12, 0.05), euler(0, 0, sx * 0.2), i % 2 ? BLUE : GOLD, i % 2 ? 'plastic' : 'gold');
  F.ring(0.36, 0.05, V(0, 4.32, -0.05), euler(Math.PI / 2, 0, 0), GOLD, 'gold', 14, 3);
  F.at(0);
  // ankh + scarabée en orbite
  floaters(F, [V(-1.9, 3.6, -0.6), V(2.0, 2.6, -0.8)], (p, i) => {
    if (i === 0) {
      F.ring(0.22, 0.06, p.clone().add(V(0, 0.35, 0)), null, GOLD, 'gold', 12, 4);
      F.box(V(0.12, 0.6, 0.1), p.clone().add(V(0, -0.15, 0)), null, GOLD, 'gold');
      F.box(V(0.55, 0.1, 0.1), p.clone().add(V(0, 0.1, 0)), null, GOLD, 'gold');
    } else {
      F.ell(V(0.3, 0.14, 0.38), p, null, TEAL, 'plastic', 1);
      F.ell(V(0.14, 0.1, 0.12), p.clone().add(V(0, 0, -0.38)), null, BLUE, 'plastic', 1);
      for (const sx of [-1, 1]) F.shard(p.clone().add(V(sx * 0.2, 0.05, 0)), V(sx, 0.4, 0.2), 0.6, 0.18, GOLD, 'gold', V(0, 1, 0));
    }
  });
  floaters(F, [V(-1.5, 1.2, -1.2), V(1.6, 4.4, 0.6), V(-1.8, 4.6, 0.9)], (p) => F.spike(p, V(0, 1, 0), 0.35, 0.1, GLOW, 'neon', 4));

  // animations : marche, frappe du sceptre
  legs.forEach((b, i) => {
    F.anim('idle', b, [1, 0, 0], 1, 0.5, i * Math.PI);
    F.anim('move', b, [1, 0, 0], 22, 1, i * Math.PI);
    F.anim('ability', b, [1, 0, 0], 4, 1, i * Math.PI);
  });
  arms.forEach((b, i) => {
    F.anim('idle', b, [1, 0, 0], 3, 0.5, i * Math.PI);
    F.anim('move', b, [1, 0, 0], 18, 1, (1 - i) * Math.PI);
    F.anim('ability', b, [1, 0, 0], i ? 26 : 8, 1, 0, i ? 18 : 0);
  });
  F.anim('idle', chest, [0, 1, 0], 3, 0.5, 0);
  F.anim('move', chest, [0, 1, 0], 6, 1, 0);
  F.anim('ability', chest, [1, 0, 0], 6, 1, 0, 3);
  headAnims(F, head, jaw);
  return F;
}
