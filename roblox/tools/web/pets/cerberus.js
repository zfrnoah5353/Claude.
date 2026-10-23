// Cerbère Guimauve (Mythique) : chien à trois têtes en guimauve, colliers dorés à pointes,
// yeux roses lumineux, flammes et chaînes autour.
import { Forge, V, euler, aim, shade } from '../forge.js';
import { furBody, leg, beastHead, headAnims, floaters, shardTail, spikeRow } from '../parts.js';

export default function cerberus() {
  const F = new Forge('Cerbère Guimauve', 61);
  const BODY = 'F5E6FF', FUR = ['F5E6FF', 'EAD6FA', 'FFFFFF', 'DCC4F5'], DARK = 'B69CFF', DEEP = '7A5CC8', GLOW = 'FF4FD8', GOLD = 'E8B64A';

  const body = F.bone('Body', V(0, 2.1, 0));
  F.at(body);
  const bc = V(0, 2.15, 0.15), bs = V(1.15, 1.0, 1.55);
  furBody(F, bc, bs, BODY, FUR, 160, { len: 0.42, flow: V(0, -0.5, 0.7), minY: -0.5 });
  spikeRow(F, V(0, 3.1, -0.7), V(0, 2.9, 1.3), 6, () => V(0, 1, 0.4), (u) => 0.45 - u * 0.2, 0.3, [DARK, DEEP], 'plastic');
  // trois cous + têtes
  const heads = [];
  [[-1.25, 0.35], [0, 0], [1.25, -0.35]].forEach(([x, yaw], i) => {
    const neck = F.bone(`Neck${i + 1}`, V(x * 0.55, 2.7, -1.0), body);
    F.at(neck);
    const top = V(x * 1.05, 3.45 + (i === 1 ? 0.35 : 0), -1.75 + Math.abs(x) * 0.25);
    F.seg(V(x * 0.55, 2.6, -0.95), top, 0.48, 0.38, BODY, 'plastic', 7);
    furBody(F, V(x * 0.8, 3.0, -1.35), V(0.5, 0.45, 0.45), BODY, FUR, 24, { len: 0.35 });
    // collier doré à pointes
    const cdir = top.clone().sub(V(x * 0.55, 2.6, -0.95)).normalize();
    const cpos = V(x * 0.55, 2.6, -0.95).lerp(top, 0.55);
    F.ring(0.46, 0.08, cpos, aim(cdir).multiply(euler(Math.PI / 2, 0, 0)), GOLD, 'gold', 16, 4);
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2;
      const side = V(1, 0, 0).applyQuaternion(aim(cdir)), up = V(0, 0, 1).applyQuaternion(aim(cdir));
      const n = side.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
      F.spike(cpos.clone().addScaledVector(n, 0.5), n, 0.22, 0.06, shade(GOLD, 0.2), 'gold', 4);
    }
    const h = beastHead(F, `Head${i + 1}`, neck, top.clone().add(V(0, 0.15, -0.15)), 0.85,
      { body: BODY, dark: DEEP, belly: 'FFFFFF', eye: GLOW, ear: DARK }, { snout: 0.6, earH: 0.55, fur: 18, furColors: FUR });
    heads.push({ neck, ...h, yaw, i });
    F.at(body);
  });
  shardTail(F, 'Tail', body, [V(0, 2.6, 1.6), V(0, 3.0, 2.1), V(0, 3.5, 2.35), V(0, 3.9, 2.3)], [0.2, 0.22, 0.2, 0.15], BODY, FUR, 12, 0.4);
  F.at(0);
  [[-0.6, -0.8, 0], [0.6, -0.8, Math.PI], [-0.6, 1.05, Math.PI], [0.6, 1.05, 0]].forEach(([x, z, ph], i) => {
    leg(F, `Leg${i + 1}`, body, V(x, 1.9, z), V(x * 1.05, 1.0, z - 0.05), V(x * 1.05, 0.22, z - 0.1), 0.3, BODY, { walk: ph, claws: DEEP, paw: DARK });
  });
  // flammes roses + chaînes brisées
  floaters(F, [V(-2.3, 2.8, -1.2), V(2.3, 3.0, -1.0), V(-2.5, 1.4, 1.0), V(2.5, 1.6, 1.3), V(0, 5.0, -0.6)], (p, i) => {
    F.spike(p.clone().add(V(0, -0.3, 0)), V(0, 1, 0), 0.7, 0.2, GLOW, 'neon', 5);
    F.spike(p.clone().add(V(0.12, -0.35, 0)), V(0.3, 1, 0), 0.45, 0.12, 'FF9AE6', 'neon', 4);
  });
  floaters(F, [V(-1.8, 4.3, 1.2), V(1.9, 4.1, 1.5)], (p) => {
    for (let k = 0; k < 4; k++) F.ring(0.18, 0.05, p.clone().add(V(0, -k * 0.27, 0)), euler(0, k % 2 ? Math.PI / 2 : 0, 0), '8E8AA8', 'gold', 10, 4);
  });

  F.anim('idle', body, [1, 0, 0], 1.5, 0.5, 0);
  F.anim('move', body, [0, 0, 1], 3, 1, 0);
  F.anim('ability', body, [1, 0, 0], 4, 1.5, 0);
  for (const h of heads) {
    F.anim('idle', h.neck, [0, 1, 0], 5, 0.5, h.i * 2);
    F.anim('move', h.neck, [1, 0, 0], 5, 1, h.i * 2);
    F.anim('ability', h.neck, [1, 0, 0], 12, 1.5, h.i * 2.1, 6); // morsures en cascade
    headAnims(F, h.head, h.jaw, 1, h.i * 2.1);
  }
  return F;
}
