// Gummy Golem (Mythique, boss) : colosse de blocs de gomme verte, cristaux dorés,
// cœur lumineux, rochers qui flottent autour.
import { Forge, V, euler, aim, shade } from '../forge.js';
import { eyes, floaters } from '../parts.js';

export default function golem() {
  const F = new Forge('Gummy Golem', 111);
  const G = ['6FD66F', '5CC45C', '82E082', '4FB24F'], BELLY = 'CFF7CF', DARK = '3FA34F', GLOW = 'FFE27A', PINK = 'FF7AA8';
  const chunk = (size, pos, rot) => F.box(size, pos, euler(...rot), G[Math.floor(F.rand(0, 4))]);
  // masse rocheuse : noyau facetté + blocs posés sur la surface, orientés vers l'extérieur
  const rocky = (c, s, n) => {
    F.ell(s, c, null, G[Math.floor(F.rand(0, 4))], 'plastic', 1);
    for (let i = 0; i < n; i++) {
      const th = F.rand(0, Math.PI * 2), ph = Math.acos(F.rand(-1, 1));
      const nn = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
      const pos = V(c.x + nn.x * s.x * 0.85, c.y + nn.y * s.y * 0.85, c.z + nn.z * s.z * 0.85);
      const k = Math.min(s.x, s.y, s.z) * F.rand(0.45, 0.8);
      F.box(V(k, k * F.rand(0.6, 1), k), pos, aim(nn, F.rand(0, 1.5)), G[Math.floor(F.rand(0, 4))]);
    }
  };

  const hips = F.bone('Hips', V(0, 1.7, 0));
  F.at(hips);
  rocky(V(0, 1.8, 0), V(0.9, 0.5, 0.7), 8);
  const legs = [-1, 1].map((sx) => {
    const b = F.bone(sx < 0 ? 'LegL' : 'LegR', V(sx * 0.6, 1.6, 0), hips);
    F.at(b);
    rocky(V(sx * 0.65, 1.0, 0), V(0.45, 0.6, 0.45), 6);
    F.box(V(0.85, 0.35, 1.0), V(sx * 0.68, 0.2, -0.1), euler(0, 0.1 * sx, 0), DARK);
    F.at(hips);
    return b;
  });
  const chest = F.bone('Chest', V(0, 2.2, 0), hips);
  F.at(chest);
  rocky(V(0, 3.0, 0), V(1.3, 0.85, 0.9), 16);
  // cœur lumineux + cristaux d'épaules
  F.ell(V(0.32, 0.32, 0.2), V(0, 3.0, -0.95), null, PINK, 'neon', 1);
  F.ring(0.4, 0.06, V(0, 3.0, -0.95), null, GLOW, 'gold', 16, 4);
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) F.spike(V(sx * (1.1 + F.rand(-0.2, 0.2)), 3.7, F.rand(-0.4, 0.4)), V(sx * 0.4, 1, F.rand(-0.3, 0.3)), F.rand(0.5, 0.9), 0.15, k % 2 ? GLOW : 'FFF3B8', 'neon', 5);
  // tête
  const head = F.bone('Head', V(0, 3.9, -0.1), chest);
  F.at(head);
  rocky(V(0, 4.2, -0.15), V(0.55, 0.42, 0.5), 6);
  eyes(F, V(0, 4.25, -0.7), 0.22, 0.13, GLOW, { brow: DARK, pupil: false });
  F.box(V(0.5, 0.08, 0.05), V(0, 3.98, -0.68), null, DARK);
  // bras massifs
  const arms = [-1, 1].map((sx) => {
    const b = F.bone(sx < 0 ? 'ArmL' : 'ArmR', V(sx * 1.35, 3.4, 0), chest);
    F.at(b);
    rocky(V(sx * 1.55, 3.0, 0), V(0.5, 0.55, 0.5), 6);
    rocky(V(sx * 1.7, 2.0, -0.15), V(0.55, 0.6, 0.55), 6);
    F.box(V(0.9, 0.7, 0.9), V(sx * 1.75, 1.3, -0.2), euler(0.2, 0, 0.1 * sx), DARK);
    F.at(chest);
    return b;
  });
  F.at(0);
  floaters(F, [V(-2.8, 2.0, -0.6), V(2.9, 2.4, -0.4), V(-2.4, 4.5, 0.8), V(2.5, 4.8, 0.9), V(0, 5.6, 0.6)], (p) => rocky(p, V(0.3, 0.26, 0.3), 4));

  legs.forEach((b, i) => { F.anim('move', b, [1, 0, 0], 16, 1, i * Math.PI); F.anim('idle', b, [1, 0, 0], 1, 0.5, i * Math.PI); F.anim('ability', b, [1, 0, 0], 3, 1, i * Math.PI); });
  arms.forEach((b, i) => {
    F.anim('idle', b, [1, 0, 0], 3, 0.5, i * Math.PI);
    F.anim('move', b, [1, 0, 0], 14, 1, (1 - i) * Math.PI);
    F.anim('ability', b, [1, 0, 0], 30, 1, 0, 30); // coup de poing double au sol
  });
  F.anim('idle', chest, [0, 1, 0], 2, 0.5, 0);
  F.anim('move', chest, [0, 0, 1], 4, 1, 0);
  F.anim('ability', chest, [1, 0, 0], 10, 1, 0, 6);
  F.anim('idle', head, [0, 1, 0], 6, 0.5, 0);
  F.anim('ability', head, [1, 0, 0], 6, 1, 0);
  return F;
}
