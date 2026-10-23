// Sphinx Praliné (Mythique) : lion couché, coiffe némès rayée or et bleu, yeux turquoise,
// ailes repliées, pyramides et œil d'Horus qui flottent.
import { Forge, V, euler, aim, shade } from '../forge.js';
import { furBody, leg, wing, eyes, floaters, shardTail } from '../parts.js';

export default function sphinx() {
  const F = new Forge('Sphinx Praliné', 71);
  const BODY = 'D9A066', LIGHT = 'F0C890', DARK = 'A8703E', BLUE = '2E5FB8', GOLD = 'E8B64A', GLOW = '5BE7FF';
  const FUR = [BODY, 'CF9558', 'E3AE74', DARK];

  const body = F.bone('Body', V(0, 1.2, 0.3));
  F.at(body);
  F.ell(V(1.0, 0.75, 1.65), V(0, 1.1, 0.4), null, BODY, 'plastic', 2);
  furBody(F, V(0, 1.4, 0.6), V(0.9, 0.5, 1.3), BODY, FUR, 60, { len: 0.3, flow: V(0, -0.6, 0.6), minY: 0 });
  // pattes avant allongées
  for (const sx of [-1, 1]) {
    F.seg(V(sx * 0.55, 0.8, -0.8), V(sx * 0.55, 0.35, -2.2), 0.3, 0.27, BODY, 'plastic', 6);
    F.ell(V(0.33, 0.22, 0.42), V(sx * 0.55, 0.3, -2.3), null, LIGHT, 'plastic', 1);
    for (const dx of [-0.15, 0, 0.15]) F.spike(V(sx * 0.55 + dx, 0.25, -2.65), V(0, -0.2, -1), 0.16, 0.04, 'FFFFFF', 'plastic', 3);
    F.ring(0.3, 0.06, V(sx * 0.55, 0.55, -1.6), aim(V(0, -0.3, -1)).multiply(euler(Math.PI / 2, 0, 0)), GOLD, 'gold', 12, 4);
  }
  // pattes arrière repliées
  for (const sx of [-1, 1]) {
    F.ell(V(0.45, 0.55, 0.7), V(sx * 0.85, 0.75, 1.3), null, BODY, 'plastic', 1);
    F.ell(V(0.3, 0.2, 0.45), V(sx * 0.9, 0.22, 0.9), null, LIGHT, 'plastic', 1);
  }
  // ailes repliées
  [-1, 1].forEach((sx) => wing(F, sx < 0 ? 'WingL' : 'WingR', body, V(sx * 0.65, 1.75, -0.2), sx, 1.7, [LIGHT, GOLD, BLUE], { rows: 3, per: 8, fw: 0.3 }));
  // tête humaine + némès
  const head = F.bone('Head', V(0, 2.2, -1.05), body);
  F.at(head);
  F.seg(V(0, 1.5, -0.8), V(0, 2.3, -1.15), 0.45, 0.36, BODY, 'plastic', 7);
  F.ell(V(0.45, 0.52, 0.45), V(0, 2.65, -1.25), null, LIGHT, 'plastic', 1);
  eyes(F, V(0, 2.75, -1.66), 0.18, 0.11, GLOW, { brow: '3A2414', h: 0.45, turn: 0.5 });
  for (const sx of [-1, 1]) F.box(V(0.26, 0.05, 0.02), V(sx * 0.21, 2.67, -1.71), euler(0, 0, -0.15 * sx), '1A1A3A'); // khôl
  F.box(V(0.12, 0.26, 0.14), V(0, 2.55, -1.7), euler(0.2, 0, 0), BODY);
  F.box(V(0.22, 0.04, 0.05), V(0, 2.38, -1.65), null, '8A4A2A');
  F.seg(V(0, 2.25, -1.55), V(0, 1.75, -1.7), 0.08, 0.06, BLUE, 'plastic', 6); // barbe postiche
  F.ring(0.08, 0.025, V(0, 2.0, -1.62), euler(Math.PI / 2, 0, 0), GOLD, 'gold', 8, 3);
  // némès : bandes rayées qui tombent sur les épaules
  for (let i = 0; i < 9; i++) {
    const c = i % 2 ? BLUE : GOLD, m = i % 2 ? 'plastic' : 'gold';
    F.box(V(0.98 - i * 0.02, 0.1, 0.92), V(0, 3.12 - i * 0.07, -1.18 + i * 0.01), euler(-0.08, 0, 0), c, m);
  }
  for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) {
    const c = i % 2 ? BLUE : GOLD, m = i % 2 ? 'plastic' : 'gold';
    F.box(V(0.42, 0.13, 0.22), V(sx * (0.55 + i * 0.015), 2.75 - i * 0.14, -1.2 + i * 0.03), euler(0, 0, sx * (0.25 + i * 0.03)), c, m);
  }
  F.seg(V(0, 2.95, -1.3), V(0, 3.0, 0.1), 0.25, 0.08, GOLD, 'gold', 6); // natte arrière
  F.seg(V(0, 3.1, -1.65), V(0, 3.45, -1.62), 0.06, 0.1, GOLD, 'gold', 6); // uræus
  F.ell(V(0.09, 0.09, 0.06), V(0, 3.5, -1.65), null, GLOW, 'neon', 1);
  F.at(body);
  shardTail(F, 'Tail', body, [V(0, 1.1, 2.0), V(0.5, 0.6, 2.4), V(1.0, 0.4, 2.3), V(1.4, 0.6, 1.9)], [0.12, 0.11, 0.1, 0.08], BODY, [DARK], 2, 0.3);
  F.at(0);
  // pyramides + œil flottants
  floaters(F, [V(-2.6, 1.6, -0.8), V(2.6, 1.9, -0.4), V(-2.3, 3.2, 1.2), V(2.4, 3.4, 1.4)], (p, i) => {
    F.seg(p.clone().add(V(0, -0.3, 0)), p.clone().add(V(0, 0.35, 0)), 0.45 - (i % 2) * 0.1, 0.01, i % 2 ? GOLD : LIGHT, i % 2 ? 'gold' : 'plastic', 4, Math.PI / 4);
    F.seg(p.clone().add(V(0, 0.2, 0)), p.clone().add(V(0, 0.36, 0)), 0.1, 0.01, GLOW, 'neon', 4, Math.PI / 4);
  });
  floaters(F, [V(0, 4.3, -1.3)], (p) => {
    F.ell(V(0.35, 0.18, 0.05), p, null, 'FFFFFF', 'plastic', 1);
    F.ell(V(0.12, 0.12, 0.06), p.clone().add(V(0, 0, -0.03)), null, BLUE, 'plastic', 1);
    F.box(V(0.6, 0.05, 0.06), p.clone().add(V(0, 0.22, 0)), null, GOLD, 'gold');
    F.box(V(0.05, 0.35, 0.06), p.clone().add(V(0.05, -0.32, 0)), euler(0, 0, 0.2), GOLD, 'gold');
  });

  F.anim('idle', body, [1, 0, 0], 1, 0.5, 0);
  F.anim('move', body, [0, 0, 1], 2, 1, 0);
  F.anim('ability', body, [1, 0, 0], 3, 1, 0, -2);
  F.anim('idle', head, [0, 1, 0], 6, 0.5, 0);
  F.anim('move', head, [0, 1, 0], 8, 1, 0);
  F.anim('ability', head, [1, 0, 0], 8, 1, 0, -10);
  F.bob('idle', 0.03, 0.5); F.bob('move', 0.1, 1);
  return F;
}
