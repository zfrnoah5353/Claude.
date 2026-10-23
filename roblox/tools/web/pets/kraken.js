// Kraken des Abysses (Divin) : manteau en dôme couronné de cristaux, 8 longs tentacules
// à piques, liserés dorés, épaves qui flottent autour.
import { Forge, V, euler, aim, shade } from '../forge.js';

export default function kraken() {
  const F = new Forge('Kraken des Abysses', 11);
  const BODY = '2A8C8A', BELLY = '7FE0D8', CRYST = '9FF2EA', GOLD = 'E8B64A', DARK = '1C5E5E', EYE = 'FFC81E';

  const head = F.bone('Head', V(0, 1.3, 0));
  F.at(head);
  // tête + manteau
  F.ell(V(1.2, 0.95, 1.15), V(0, 1.75, 0), null, BODY, 'plastic', 2);
  F.ell(V(1.02, 1.55, 1.0), V(0, 2.95, 0.12), euler(0.18, 0, 0), BODY, 'plastic', 2);
  F.ell(V(0.9, 0.5, 0.9), V(0, 1.12, 0), null, shade(BODY, -0.15), 'plastic', 1);
  // bandeau doré + motif grec
  F.ring(1.04, 0.075, V(0, 2.3, 0.04), euler(Math.PI / 2 + 0.05, 0, 0), GOLD, 'gold', 36, 4);
  F.ring(1.07, 0.04, V(0, 2.45, 0.06), euler(Math.PI / 2 + 0.06, 0, 0), shade(GOLD, -0.2), 'gold', 36, 4);
  const key = (x, y, w, h) => F.box(V(w, h, 0.06), V(x, y, -1.03), euler(-0.12, 0, 0), GOLD, 'gold');
  key(0, 2.78, 0.42, 0.05); key(0, 2.42, 0.42, 0.05); key(-0.19, 2.6, 0.05, 0.4); key(0.19, 2.6, 0.05, 0.4);
  key(-0.05, 2.66, 0.22, 0.04); key(0.06, 2.6, 0.04, 0.16); key(-0.02, 2.53, 0.17, 0.04);
  // couronne de cristaux sur le dôme
  for (let i = 0; i < 18; i++) {
    const th = F.rand(0, Math.PI * 2), ph = F.rand(0.05, 0.75);
    const n = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    const pos = V(n.x * 0.98, 2.95 + n.y * 1.5, 0.12 + n.z * 0.96);
    const len = 0.3 + 0.45 * (1 - ph) * F.rand(0.6, 1.2);
    F.spike(pos.addScaledVector(n, -0.05), n.clone().add(V(0, 0.6, 0)), len, 0.13, F.r() < 0.5 ? CRYST : BELLY, 'plastic');
  }
  // taches claires
  for (let i = 0; i < 16; i++) {
    const th = F.rand(0, Math.PI * 2), ph = F.rand(0.7, 1.7);
    const n = V(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    const pos = V(n.x * 1.0, 2.95 + n.y * 1.53, 0.12 + n.z * 0.98);
    const s = F.rand(0.07, 0.13);
    F.ell(V(s, s, s * 0.35), pos, aim(n).multiply(euler(Math.PI / 2, 0, 0)), BELLY, 'plastic', 0);
  }
  // yeux en colère
  for (const sx of [-1, 1]) {
    const eye = V(0.43 * sx, 1.9, -0.98);
    F.ell(V(0.27, 0.16, 0.1), eye, euler(0.1, 0, -0.25 * sx), EYE, 'neon', 1);
    F.box(V(0.04, 0.2, 0.04), eye.clone().add(V(0, 0, -0.07)), euler(0, 0, -0.1 * sx), '141414');
    F.box(V(0.38, 0.08, 0.14), eye.clone().add(V(-0.04 * sx, 0.17, -0.02)), euler(0.1, 0, -0.38 * sx), DARK);
    // marque dorée en « W » sur la joue
    for (let k = 0; k < 3; k++) F.box(V(0.03, 0.12, 0.03), V(sx * (0.72 + k * 0.06), 1.72 + (k % 2) * 0.03, -0.78 + k * 0.05), euler(0, 0, (k % 2 ? -0.5 : 0.5)), GOLD, 'gold');
  }

  // 8 tentacules
  for (let k = 0; k < 8; k++) {
    const a0 = (k + 0.5) / 8 * Math.PI * 2;
    const bend = (k % 2 ? 1 : -1) * 0.45;
    const N = 16, L = 5.4;
    const pts = [], rad = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const a = a0 + bend * u * u;
      let r = 0.65 + L * u;
      let y = u < 0.22 ? 1.25 - 1.05 * Math.sin((u / 0.22) * Math.PI / 2) : 0.2;
      if (u > 0.78) { // la pointe s'enroule vers le haut
        const w = (u - 0.78) / 0.22;
        y = 0.2 + 0.75 * w * w;
        r -= 0.35 * w * w * L * 0.22;
      }
      pts.push(V(Math.cos(a) * r, y, Math.sin(a) * r));
      rad.push(0.42 * (1 - u) + 0.05);
    }
    const bones = F.chain(`T${k + 1}_`, pts, rad, BODY, {
      parent: head, segs: 6, joint: true,
      deco: (i, f) => {
        const r = (f.r + f.r2) / 2;
        // piques de cristal sur le dessus
        {
          const pos = f.a.clone().lerp(f.b, 0.5).addScaledVector(f.top, r * 0.8);
          const len = 0.16 + r * 1.25;
          F.spike(pos, f.top.clone().addScaledVector(f.t, 0.5), len, len * 0.3, i % 2 ? CRYST : BELLY, 'plastic');
          for (const sd of [-1, 1]) if (i < 12) {
            const p2 = f.a.clone().lerp(f.b, 0.5).addScaledVector(f.top, r * 0.45).addScaledVector(f.side, sd * r * 0.7);
            F.spike(p2, f.top.clone().addScaledVector(f.side, sd * 0.9).addScaledVector(f.t, 0.5), len * 0.55, len * 0.18, CRYST, 'plastic');
          }
        }
        // liserés dorés des deux côtés
        for (const sd of [-1, 1]) {
          const off = (p, rr) => p.clone().addScaledVector(f.side, sd * rr * 0.92).addScaledVector(f.top, -rr * 0.35);
          F.seg(off(f.a, f.r), off(f.b, f.r2), Math.max(0.018, f.r * 0.11), Math.max(0.018, f.r2 * 0.11), GOLD, 'gold', 4);
        }
        // ventouses
        const c = f.a.clone().lerp(f.b, 0.5).addScaledVector(f.top, -r * 0.82);
        F.ell(V(r * 0.38, r * 0.12, r * 0.38), c, null, BELLY, 'plastic', 0);
      },
    });
    const side = V(-Math.sin(a0), 0, Math.cos(a0)); // axe horizontal perpendiculaire au tentacule
    bones.forEach((b, i) => {
      const ph = -i * 0.45 + k * 0.8;
      F.anim('idle', b, side, 3.2, 0.5, ph);
      F.anim('idle', b, [0, 1, 0], 2.2, 0.5, ph + 1.3);
      F.anim('move', b, side, 6, 1, ph);
      F.anim('move', b, [0, 1, 0], 4, 1, ph + 1);
      if (i < 6) F.anim('ability', b, side, 9, 1, -i * 0.35 + (k % 2) * Math.PI, -4);
      else F.anim('ability', b, side, 6, 1, ph);
    });
  }
  F.anim('idle', head, [1, 0, 0], 2, 0.5, 0);
  F.anim('move', head, [1, 0, 0], 5, 1, 0, 4);
  F.anim('ability', head, [1, 0, 0], 8, 1, 0.5, -3);

  // épaves flottantes autour
  const WOOD = '7A4E2C';
  [[3.6, 4.8, -1.6, 0.4], [-3.4, 5.4, -0.6, 1.4], [2.2, 5.9, 2.8, 2.1], [-2.6, 4.4, 3.0, 2.9]].forEach(([x, y, z, rot], i) => {
    const b = F.bone(`Debris${i + 1}`, V(x, y, z), 0);
    F.at(b);
    const q = euler(rot * 0.7, rot, rot * 1.3);
    const ax = V(0, 1, 0).applyQuaternion(q), bx = V(1, 0, 0).applyQuaternion(q);
    F.box(V(0.16, 1.5, 0.12), V(x, y, z), q, WOOD);
    F.box(V(0.13, 0.9, 0.1), V(x, y, z).addScaledVector(bx, 0.22).addScaledVector(ax, 0.2), q, shade(WOOD, 0.12));
    for (const t of [-0.45, 0.05, 0.5]) F.box(V(0.7, 0.1, 0.08), V(x, y, z).addScaledVector(ax, t), q.clone().multiply(euler(0, 0, 0.15 * (t > 0 ? 1 : -1))), shade(WOOD, -0.15));
    F.box(V(0.05, 0.05, 0.05), V(x, y, z).addScaledVector(ax, 0.75), q, GOLD, 'gold');
    for (const st of ['idle', 'move', 'ability']) {
      F.anim(st, b, [1, 0, 0], 10, 0.5, i * 1.7);
      F.anim(st, b, [0, 0, 1], 8, 0.5, i * 1.1 + 0.5);
    }
    F.at(0);
  });
  return F;
}
