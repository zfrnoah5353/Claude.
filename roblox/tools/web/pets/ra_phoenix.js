// Ra, Phénix Solaire (Divin) : oiseau de feu aux plumes-flammes, grandes ailes déployées,
// disque solaire doré qui tourne derrière lui, braises en orbite.
import { Forge, V, euler, aim, shade } from '../forge.js';
import { furBody, wing, eyes, floaters } from '../parts.js';

export default function phoenix() {
  const F = new Forge('Ra, Phénix Solaire', 131);
  const BODY = 'FF5A1F', FLAME = ['FF5A1F', 'FF8A2A', 'FFB23F', 'FFD23F'], GOLD = 'E8B64A', SUN = 'FFD23F', DARK = 'B8321A', EYE = 'FFF3B8', BLUE = '2E5FB8';

  const body = F.bone('Body', V(0, 2.6, 0));
  F.at(body);
  furBody(F, V(0, 2.6, 0.1), V(0.7, 0.95, 0.75), BODY, FLAME, 120, { len: 0.42, flow: V(0, -0.5, 0.8), minY: -0.9, mat: 'plastic' });
  furBody(F, V(0, 2.35, -0.45), V(0.5, 0.65, 0.35), 'FFB23F', ['FFD23F', 'FFB23F'], 40, { len: 0.3, flow: V(0, -1, 0) });
  const head = F.bone('Head', V(0, 3.5, -0.3), body);
  F.at(head);
  furBody(F, V(0, 3.8, -0.4), V(0.42, 0.42, 0.45), BODY, FLAME, 40, { len: 0.28, flow: V(0, 0, 1) });
  F.seg(V(0, 3.75, -0.8), V(0, 3.62, -1.25), 0.15, 0.03, GOLD, 'gold', 5);
  F.seg(V(0, 3.62, -0.8), V(0, 3.58, -1.0), 0.09, 0.02, shade(GOLD, -0.2), 'gold', 5);
  eyes(F, V(0, 3.92, -0.75), 0.22, 0.12, EYE, { brow: DARK });
  for (const sx of [-1, 1]) F.box(V(0.3, 0.05, 0.02), V(sx * 0.3, 3.82, -0.78), euler(0, -0.4 * sx, -0.3 * sx), BLUE); // trait égyptien
  for (let i = 0; i < 9; i++) F.shard(V(0, 4.15, -0.4 + i * 0.07), V((i - 4) * 0.12, 1, 0.5), 0.75 - Math.abs(i - 4) * 0.08, 0.13, FLAME[i % 4], 'neon', V(1, 0, 0)); // crête de flammes
  // uræus et petit disque sur la tête
  F.seg(V(0, 4.25, -0.55), V(0, 4.35, -0.55), 0.22, 0.22, SUN, 'neon', 12);
  F.at(body);
  [-1, 1].forEach((sx) => wing(F, sx < 0 ? 'WingL' : 'WingR', body, V(sx * 0.5, 3.15, 0.0), sx, 3.2, ['FFD23F', 'FFB23F', 'FF8A2A', BODY], { rows: 4, per: 12, fw: 0.3, long: 1.2, bone: GOLD, boneMat: 'gold' }));
  // queue de flammes en éventail
  const tail = F.bone('Tail', V(0, 2.0, 0.6), body);
  F.at(tail);
  for (let i = 0; i < 11; i++) {
    const a = (i - 5) * 0.16;
    F.shard(V(0, 2.0, 0.6), V(Math.sin(a), -0.35, Math.cos(a)), 2.2 - Math.abs(i - 5) * 0.12, 0.2, FLAME[i % 4], i % 3 ? 'plastic' : 'neon', V(0, 1, 0));
  }
  F.at(body);
  // serres dorées
  for (const sx of [-1, 1]) {
    F.seg(V(sx * 0.25, 1.8, 0), V(sx * 0.28, 0.9, -0.05), 0.08, 0.06, GOLD, 'gold', 5);
    for (const d of [-1, 0, 1]) F.spike(V(sx * 0.28, 0.9, -0.05), V(d * 0.5, -0.4, -1), 0.3, 0.05, GOLD, 'gold', 3);
  }
  F.at(0);
  // disque solaire de Ra (un douzième de tour par boucle, 12 rayons)
  const sun = F.bone('Sun', V(0, 3.4, 1.6), 0);
  F.spin(sun, [0, 0, 1], 1 / 6);
  F.at(sun);
  F.seg(V(0, 3.4, 1.7), V(0, 3.4, 1.55), 1.35, 1.35, SUN, 'neon', 24);
  F.ring(1.45, 0.1, V(0, 3.4, 1.6), null, GOLD, 'gold', 48, 5);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; F.spike(V(Math.cos(a) * 1.5, 3.4 + Math.sin(a) * 1.5, 1.62), V(Math.cos(a), Math.sin(a), 0), k % 2 ? 0.6 : 0.95, 0.12, k % 2 ? 'FFB23F' : GOLD, k % 2 ? 'neon' : 'gold', 4); }
  F.at(0);
  floaters(F, [V(-2.6, 1.8, -1.0), V(2.6, 2.0, -0.8), V(-3.0, 3.6, 0.4), V(3.0, 3.8, 0.6), V(-1.6, 5.4, -0.2), V(1.7, 5.6, 0.2), V(0, 0.8, -1.8)], (p, i) => {
    F.spike(p.clone().add(V(0, -0.25, 0)), V(0, 1, 0), 0.55, 0.15, FLAME[i % 4], 'neon', 5);
    F.spike(p.clone().add(V(0.1, -0.3, 0)), V(0.4, 1, 0), 0.35, 0.09, 'FFD23F', 'neon', 4);
  });
  F.anim('idle', body, [1, 0, 0], 2, 0.5, 0);
  F.anim('move', body, [1, 0, 0], 5, 1, 0, -5);
  F.anim('ability', body, [1, 0, 0], 8, 1, 0, -6);
  F.anim('idle', head, [0, 1, 0], 6, 0.5, 0);
  F.anim('move', head, [1, 0, 0], 6, 1, 0.5);
  F.anim('ability', head, [1, 0, 0], 14, 1, 0, -10); // cri
  F.anim('idle', tail, [1, 0, 0], 6, 0.5, 0.5);
  F.anim('move', tail, [0, 1, 0], 10, 1, 0);
  F.anim('ability', tail, [1, 0, 0], 14, 1, 0, -6);
  F.bob('idle', 0.25, 0.5); F.bob('move', 0.5, 1); F.bob('ability', 0.6, 1);
  return F;
}
