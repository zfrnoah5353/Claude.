// Aperçu three.js des pièces Roblox converties (pour vérifier la conversion)
import * as THREE from 'three';
export function rbxGroup(plan) {
  const g = new THREE.Group();
  const mats = {};
  const mat = (c, m) => mats[c + m] ||= new THREE.MeshStandardMaterial({ color: '#' + c, flatShading: true, roughness: m === 'metal' ? 0.4 : 0.8, metalness: m === 'metal' ? 0.5 : 0, emissive: m === 'neon' ? new THREE.Color('#' + c) : new THREE.Color(0), emissiveIntensity: 0.6 });
  for (const p of plan.parts) {
    const [sx, sy, sz] = p.size;
    let geo;
    if (p.shape === 'block') geo = new THREE.BoxGeometry(sx, sy, sz);
    else if (p.shape === 'ellipsoid') { geo = new THREE.SphereGeometry(0.5, 16, 12); geo.scale(sx, sy, sz); }
    else if (p.shape === 'cyl') { geo = new THREE.CylinderGeometry(sy / 2, sy / 2, sx, 16); geo.rotateZ(-Math.PI / 2); }
    else if (p.shape === 'wedge') {
      const s = new THREE.Shape(); // dans le plan (z, y) : coin droit en bas à l'arrière
      s.moveTo(sz / 2, -sy / 2); s.lineTo(-sz / 2, -sy / 2); s.lineTo(sz / 2, sy / 2); s.lineTo(sz / 2, -sy / 2);
      geo = new THREE.ExtrudeGeometry(s, { depth: sx, bevelEnabled: false });
      geo.translate(0, 0, -sx / 2);
      // la forme est dessinée en (x=z, y=y) et extrudée sur z : on remet l'extrusion sur X
      geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1));
    }
    const m = new THREE.Mesh(geo, mat(p.color, p.mat));
    const r = p.rot;
    m.matrixAutoUpdate = false;
    m.matrix.set(r[0], r[1], r[2], p.pos[0], r[3], r[4], r[5], p.pos[1], r[6], r[7], r[8], p.pos[2], 0, 0, 0, 1);
    m.castShadow = true;
    if (p.alpha) { m.material = m.material.clone(); m.material.transparent = true; m.material.opacity = 1 - p.alpha; }
    g.add(m);
  }
  return g;
}
