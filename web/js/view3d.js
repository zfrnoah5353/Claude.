// Vue 3D schématique du PC (dimensions réelles en mm quand elles sont connues) et du bureau.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CAT } from './core.js';

const COLORS = { BLACK: 0x2b2f38, WHITE: 0xe9ecf1, GREY: 0x7b818c, GRAY: 0x7b818c, SILVER: 0xb9bec7, RED: 0xb3262b, BLUE: 0x2459c4, GREEN: 0x2f8f4e, PINK: 0xe58bb2, GOLD: 0xc9a44a, YELLOW: 0xe0c341, PURPLE: 0x7648c4, ORANGE: 0xe07a2a, BROWN: 0x6b4a32, BEIGE: 0xd8c9a8 };
const colorOf = (p, def) => (p && p.col && COLORS[p.col[0]] != null) ? COLORS[p.col[0]] : def;
const BOARD = { 'ATX': [244, 305], 'Micro ATX': [244, 244], 'Mini-ITX': [170, 170], 'EATX': [300, 305] };
const CASE_DEF = [[/Full Tower/, [540, 240, 560]], [/Mini ITX/, [350, 180, 300]], [/Micro ATX|Mini Tower/, [400, 210, 400]], [/./, [450, 220, 470]]];

export class View3D {
  constructor(el, onPick) {
    this.el = el; this.onPick = onPick;
    this.opts = { airflow: false, rgb: true, desk: false, panel: true };
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 200);
    this.camera.position.set(7.5, 4.5, 9);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; this.controls.maxPolarAngle = Math.PI * 0.52;
    this.controls.minDistance = 3; this.controls.maxDistance = 40;
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x20222a, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(6, 10, 8); this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x9db4ff, 0.8); fill.position.set(-8, 4, -6); this.scene.add(fill);
    this.root = new THREE.Group(); this.scene.add(this.root);
    this.spinners = []; this.glows = []; this.pickables = []; this.particles = null;
    this.ray = new THREE.Raycaster(); this.clock = new THREE.Clock();
    this.tip = document.createElement('div'); this.tip.className = 'tip3d'; el.appendChild(this.tip);

    let down = null;
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const hit = this.hit(e); if (hit) this.onPick(hit.cat);
    });
    dom.addEventListener('pointermove', e => {
      const hit = this.hit(e);
      dom.style.cursor = hit ? 'pointer' : 'grab';
      if (hit) {
        const r = el.getBoundingClientRect();
        this.tip.textContent = hit.label; this.tip.style.display = 'block';
        this.tip.style.left = (e.clientX - r.left + 14) + 'px'; this.tip.style.top = (e.clientY - r.top + 14) + 'px';
      } else this.tip.style.display = 'none';
    });
    dom.addEventListener('pointerleave', () => { this.tip.style.display = 'none'; });
    new ResizeObserver(() => this.resize()).observe(el);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = this.el.clientWidth || 600, h = this.el.clientHeight || 400;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%'; this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  hit(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(v, this.camera);
    for (const h of this.ray.intersectObjects(this.pickables, false)) return h.object.userData;
    return null;
  }

  setOption(k, v) { this.opts[k] = v; if (this.ctx) this.update(this.ctx, k === 'desk'); }

  // ---------------------------------------------------------------- construction
  update(ctx, reframe) {
    const first = !this.ctx; this.ctx = ctx;
    this.root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { o.material.map && o.material.map.dispose(); o.material.dispose(); } });
    this.root.clear(); this.spinners = []; this.glows = []; this.pickables = []; this.particles = null;
    this.flow = { intake: 0, exhaust: 0 };

    const pc = new THREE.Group(); pc.scale.setScalar(0.01); this.root.add(pc);
    const size = this.buildPC(pc, ctx);
    let target = new THREE.Vector3(0, size[2] / 200, 0), dist = Math.max(size[0], size[2]) / 100 * 2.25;
    const floor = new THREE.GridHelper(60, 60, 0x3a4252, 0x232833);
    floor.position.y = -0.13; floor.material.transparent = true; floor.material.opacity = 0.55; this.root.add(floor);
    this.labelScale = this.opts.desk ? 2.4 : 1;

    if (this.opts.desk) {
      const desk = new THREE.Group(); desk.scale.setScalar(0.01); this.root.add(desk);
      this.buildDesk(desk, ctx);
      pc.position.set(5.6, 7.5, -0.6); pc.rotation.y = -0.25;
      floor.position.y = 0;
      target = new THREE.Vector3(0.6, 9.4, 0); dist = 31;
    }
    if (first || reframe) {
      this.controls.target.copy(target);
      const dir = this.opts.desk ? new THREE.Vector3(0.12, 0.3, 1) : new THREE.Vector3(0.5, 0.28, 1);
      this.camera.position.copy(target).add(dir.normalize().multiplyScalar(dist));
    }
  }

  mat(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...o }); }
  box(g, w, h, d, x, y, z, color, pick, o) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), color instanceof THREE.Material ? color : this.mat(color, o));
    m.position.set(x, y, z); g.add(m);
    if (pick) { m.userData = pick; this.pickables.push(m); }
    return m;
  }
  glow(g, w, h, d, x, y, z, phase = 0) {
    const m = this.box(g, w, h, d, x, y, z, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x00aaff, emissiveIntensity: 1.6 }));
    m.userData.phase = phase; this.glows.push(m); return m;
  }
  ghost(g, w, h, d, x, y, z, cat) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x6aa5ff, transparent: true, opacity: 0.1, depthWrite: false }));
    m.position.set(x, y, z); m.userData = { cat, label: '+ Ajouter : ' + CAT[cat].label }; g.add(m); this.pickables.push(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x6aa5ff, transparent: true, opacity: 0.75 }));
    e.position.copy(m.position); g.add(e);
    const s = this.label('+ ' + CAT[cat].label); s.position.set(x, y, z + d / 2 + 4); s.scale.set(110 * (this.labelScale || 1), 27.5 * (this.labelScale || 1), 1); g.add(s);
    return m;
  }
  label(text) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d'); x.font = '600 52px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(12,16,26,.72)'; const w = Math.min(500, x.measureText(text).width + 50);
    x.beginPath(); x.roundRect(256 - w / 2, 22, w, 84, 42); x.fill();
    x.fillStyle = '#bcd6ff'; x.fillText(text, 256, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  }
  // Ventilateur : cadre + hélice, axe selon Z local.
  fan(g, size, x, y, z, rot, pick, rgb, color = 0x1b1d22) {
    const f = new THREE.Group(); f.position.set(x, y, z); f.rotation.set(rot[0], rot[1], rot[2]); g.add(f);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(size / 2 - 4, 4, 8, 32), this.mat(color));
    f.add(frame);
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) this.box(f, 12, 12, 25, sx * (size / 2 - 6), sy * (size / 2 - 6), 0, color);
    const hit = this.box(f, size, size, 25, 0, 0, 0, new THREE.MeshBasicMaterial({ visible: false }), pick);
    hit.material.visible = false;
    const rotor = new THREE.Group(); f.add(rotor);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.16, size * 0.16, 14, 20), this.mat(color)); hub.rotation.x = Math.PI / 2; rotor.add(hub);
    const bm = rgb ? new THREE.MeshStandardMaterial({ color: 0xdddddd, transparent: true, opacity: 0.75, emissive: 0x00aaff, emissiveIntensity: 0.5 }) : this.mat(0x30343c);
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(size * 0.3, size * 0.17, 2), bm);
      const a = i / 7 * Math.PI * 2; b.position.set(Math.cos(a) * size * 0.28, Math.sin(a) * size * 0.28, 0); b.rotation.set(0.45, 0, a); rotor.add(b);
    }
    if (rgb) { bm.userData = { phase: Math.random() }; this.glows.push({ material: bm, userData: { phase: (x + y) * 0.002 } }); }
    this.spinners.push(rotor);
    return f;
  }

  buildPC(g, ctx) {
    const cas = ctx.case;
    let dims = null;
    if (cas && cas.dims) { const s = [...cas.dims].sort((a, b) => a - b); const rest = cas.dims.filter((v, i) => i !== cas.dims.indexOf(s[0])); dims = [rest[0], s[0], rest[1]]; if (dims[0] > 800 || dims[2] > 900 || dims[1] < 90) dims = null; }
    if (!dims) dims = CASE_DEF.find(([re]) => re.test((cas && cas.ff) || 'ATX Mid Tower'))[1];
    const [D, W, H] = dims;
    const pk = (cat, p) => ({ cat, label: p ? p.n : CAT[cat].label });
    const bad = new Set(ctx.issues ? ctx.issues.filter(i => i.level === 'err').flatMap(i => i.cats) : []);
    const tint = (cat, col) => bad.has(cat) ? 0xd03030 : col;

    // --- boîtier
    const cc = colorOf(cas, 0x22252b);
    if (cas) {
      const t = 3, pick = pk('case', cas), m = this.mat(tint('case', cc), { roughness: 0.7 });
      this.box(g, D, t, W, 0, t / 2, 0, m, pick); this.box(g, D, t, W, 0, H - t / 2, 0, m, pick);
      this.box(g, t, H, W, -D / 2 + t / 2, H / 2, 0, m, pick);
      this.box(g, D, H, t, 0, H / 2, -W / 2 + t / 2, this.mat(tint('case', new THREE.Color(cc).lerp(new THREE.Color(0x596070), 0.25).getHex()), { roughness: 0.9 }), pick);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(D, H, W)), new THREE.LineBasicMaterial({ color: 0x8892a6, transparent: true, opacity: 0.55 }));
      edges.position.y = H / 2; g.add(edges);
      const lamp = new THREE.PointLight(0xffffff, 2.2, 0, 0); lamp.position.set(D * 0.2, H * 0.6, W * 1.5); g.add(lamp);
      const front = this.box(g, t, H, W, D / 2 - t / 2, H / 2, 0, this.mat(tint('case', cc), { roughness: 0.9, transparent: true, opacity: 0.4 }), pick);
      front.renderOrder = 2;
      if (this.opts.panel) {
        const glass = this.box(g, D, H, 2, 0, H / 2, W / 2 - 1, new THREE.MeshStandardMaterial({ color: cas.glass ? 0x9fc4ff : cc, transparent: true, opacity: cas.glass ? 0.07 : 0.14, roughness: 0.1, metalness: 0.4, depthWrite: false }));
        glass.renderOrder = 3;
      }
      this.box(g, D * 0.62, 2, W - 8, -D / 2 + D * 0.31 + 3, 95, 0, this.mat(cc, { roughness: 0.8 }), pick); // cache alimentation
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.box(g, 30, 12, 20, sx * (D / 2 - 40), -6, sz * (W / 2 - 22), 0x101114);
    } else {
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(D, H, W)), new THREE.LineBasicMaterial({ color: 0x6aa5ff, transparent: true, opacity: 0.6 }));
      e.position.y = H / 2; g.add(e);
      const hitbox = this.box(g, D, 6, W, 0, 3, 0, new THREE.MeshBasicMaterial({ color: 0x6aa5ff, transparent: true, opacity: 0.12 }), { cat: 'case', label: '+ Ajouter : Boîtier' });
      const s = this.label('+ Boîtier'); s.position.set(D / 2 - 60, 30, W / 2); s.scale.set(110, 27.5, 1); g.add(s);
    }

    // --- carte mère (plaquée sur le panneau du fond, face vers +Z)
    const mobo = ctx.mobo;
    const [bw, bh] = BOARD[(mobo && mobo.ff)] || BOARD.ATX;
    const zb = -W / 2 + 18;                        // surface de la carte
    const bx0 = -D / 2 + 22, by1 = H - 28;          // coin haut-arrière
    const bx = bx0 + bw / 2, by = by1 - bh / 2;
    if (mobo) {
      const pick = pk('mobo', mobo), col = tint('mobo', 0x1c2733);
      this.box(g, bw, bh, 3, bx, by, zb - 1.5, col, pick, { roughness: 0.85 });
      this.box(g, 26, 95, 28, bx0 + 34, by1 - 62, zb + 14, 0x6d7686, pick, { metalness: 0.7 });   // radiateurs VRM
      this.box(g, 85, 22, 24, bx0 + 100, by1 - 16, zb + 12, 0x6d7686, pick, { metalness: 0.7 });
      this.box(g, 40, 150, 40, bx0 + 20, by1 - 80, zb + 20, 0x2a2d34, pick);                                     // connectique arrière
      for (let i = 0; i < Math.min(3, Math.floor((bh - 150) / 45)); i++) this.box(g, 150, 8, 10, bx0 + 110, by1 - 172 - i * 42, zb + 5, 0x4a5262, pick);
      if (bh > 200) this.box(g, 60, 60, 12, bx0 + bw - 60, by1 - bh + 60, zb + 6, 0x6d7686, pick, { metalness: 0.7 });
    } else this.ghost(g, bw, bh, 4, bx, by, zb, 'mobo');

    // --- processeur + refroidissement
    const cx = bx0 + 108, cy = by1 - 82;
    const cpu = ctx.cpu, cooler = ctx.cooler;
    if (cpu) this.box(g, 42, 42, 6, cx, cy, zb + 3, tint('cpu', 0xb9bec7), pk('cpu', cpu), { metalness: 0.9, roughness: 0.3 });
    else this.ghost(g, 50, 50, 8, cx, cy, zb + 4, 'cpu');
    let topUsed = 0;
    if (cooler) {
      const pick = pk('cooler', cooler), col = tint('cooler', colorOf(cooler, 0x8d939e));
      if (cooler.water) {
        const rad = Math.min(cooler.rad || 240, D - 40), n = Math.max(1, Math.round((cooler.rad || 240) / 120));
        this.box(g, 62, 62, 34, cx, cy, zb + 23, tint('cooler', colorOf(cooler, 0x1b1d22)), pick);
        if (this.opts.rgb && cooler.rgb !== false) this.glow(g, 46, 46, 2, cx, cy, zb + 41, 0.2);
        const rx = -D / 2 + 30 + rad / 2 + 20;
        this.box(g, rad + 30, 27, 120, rx, H - 22, 0, 0x1a1c20, pick, { roughness: 0.9 });
        for (let i = 0; i < n; i++) this.fan(g, 120, rx - rad / 2 + 60 + i * 120 * (rad / (n * 120)), H - 50, 0, [Math.PI / 2, 0, 0], pick, this.opts.rgb && cooler.rgb);
        this.flow.exhaust += n; topUsed = rad + 40;
        for (const dz of [-12, 12]) {                                     // tuyaux
          const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(cx + 20, cy + dz, zb + 30), new THREE.Vector3(cx + 70, cy + 40, zb + 90), new THREE.Vector3(rx + rad / 2 - 10, H - 60, 30 + dz), new THREE.Vector3(rx + rad / 2 + 5, H - 30, dz)]);
          g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 6, 8), this.mat(0x111214, { roughness: 0.9 })));
        }
      } else {
        const h = Math.min(cooler.h || 155, W - 30), fans = cooler.fans || 1, low = h < 90;
        if (low) {
          this.box(g, 95, 95, h - 28, cx, cy, zb + 6 + (h - 28) / 2, col, pick, { metalness: 0.8 });
          this.fan(g, 92, cx, cy, zb + h - 6, [0, 0, 0], pick, this.opts.rgb && cooler.rgb);
        } else {
          const towers = fans >= 2 && (cooler.fan || 120) >= 120 ? 2 : 1, tw = 48, fs = Math.min(cooler.fan || 120, 130);
          this.box(g, 44, 44, 26, cx, cy, zb + 19, 0x9aa0aa, pick, { metalness: 0.9 });
          for (let i = 0; i < towers; i++) {
            const tx = cx + (towers === 2 ? (i ? 40 : -40) : 0);
            for (let k = 0; k < 9; k++) this.box(g, tw, fs, (h - 40) / 9 - 3, tx, cy, zb + 36 + k * (h - 40) / 9 + (h - 40) / 18, col, pick, { metalness: 0.85, roughness: 0.35 });
          }
          const span = towers === 2 ? 40 : 0;
          const fx = fans >= 2 && towers === 2 ? [cx, cx + span + tw / 2 + 14] : fans >= 2 ? [cx + tw / 2 + 14, cx - tw / 2 - 14] : [cx + tw / 2 + 14];
          for (const x of fx) this.fan(g, fs, x, cy, zb + 36 + (h - 40) / 2, [0, Math.PI / 2, 0], pick, this.opts.rgb && cooler.rgb);
        }
      }
    } else if (!cpu || !cpu.stock) this.ghost(g, 110, 120, 110, cx, cy, zb + 65, 'cooler');
    else { this.box(g, 90, 90, 40, cx, cy, zb + 26, 0x2b2e35, pk('cpu', cpu)); this.fan(g, 88, cx, cy, zb + 50, [0, 0, 0], pk('cpu', cpu), false); }

    // --- mémoire
    const sticks = [];
    for (const r of ctx.ram) for (let i = 0; i < (r.p.qty || 1) * r.qty; i++) sticks.push(r.p);
    const rx0 = cx + 78;
    if (sticks.length) sticks.slice(0, 8).forEach((p, i) => {
      const x = rx0 + i * (sticks.length > 2 ? 9 : 18) + (sticks.length <= 2 ? 9 : 0);
      this.box(g, 6, 133, 34, x, cy - 5, zb + 20, tint('ram', colorOf(p, 0x2a2d34)), pk('ram', p), { metalness: 0.6 });
      if (this.opts.rgb && p.rgb) this.glow(g, 6.5, 128, 5, x, cy - 5, zb + 39, i * 0.08);
    });
    else this.ghost(g, 40, 133, 34, rx0 + 18, cy - 5, zb + 18, 'ram');

    // --- carte graphique
    const gpu = ctx.gpu, gy = by1 - 172;
    if (gpu) {
      const len = gpu.len || 280, th = (gpu.slots || 2.5) * 20, pick = pk('gpu', gpu), col = tint('gpu', colorOf(gpu, 0x24272e));
      const over = len > D - 30;
      const gx = -D / 2 + 12 + len / 2;
      this.box(g, len, th - 6, 125, gx, gy - th / 2, zb + 66, over ? 0xd03030 : col, pick, { roughness: 0.6 });
      this.box(g, len, 3, 128, gx, gy + 1, zb + 66, colorOf(gpu, 0x3a3f49), pick, { metalness: 0.8 });
      const n = len > 290 ? 3 : len > 200 ? 2 : 1, fs = Math.min(95, len / n - 8);
      for (let i = 0; i < n; i++) this.fan(g, fs, gx - len / 2 + (i + 0.5) * len / n, gy - th - 1, zb + 66, [Math.PI / 2, 0, 0], pick, false, 0x101114);
      if (this.opts.rgb) this.glow(g, len * 0.5, 4, 3, gx + len * 0.1, gy - 8, zb + 130, 0.4);
    } else if (!cpu || !cpu.igpu) this.ghost(g, 270, 50, 120, -D / 2 + 12 + 135, gy - 25, zb + 64, 'gpu');

    // --- stockage
    let m2 = 0, bay = 0;
    for (const s of ctx.storage) for (let i = 0; i < s.qty; i++) {
      const pick = pk('storage', s.p);
      if ((s.p.ff || '').startsWith('M.2') || s.p.nvme) { this.box(g, 80, 22, 4, bx0 + 150, by1 - 150 - (m2 > 0 ? 60 + m2 * 30 : 0), zb + 3, tint('storage', 0x1f6f4a), pick); m2++; }
      else { const big = s.p.ff === '3.5"'; this.box(g, big ? 147 : 100, big ? 26 : 9, big ? 102 : 70, D / 2 - 110, 20 + bay * 32, -W / 2 + 80, tint('storage', big ? 0x9aa0aa : 0x2a2d34), pick, { metalness: 0.7 }); bay++; }
    }
    if (!ctx.storage.length) this.ghost(g, 80, 22, 6, bx0 + 150, by1 - 150, zb + 4, 'storage');

    // --- alimentation
    const psu = ctx.psu;
    const pl = Math.min((psu && psu.len) || 150, 200), sfx = psu && /SFX/.test(psu.ff || '');
    const pw = sfx ? 125 : 150, ph = sfx ? 64 : 86;
    if (psu) {
      const pick = pk('psu', psu);
      this.box(g, pl, ph, pw, -D / 2 + 8 + pl / 2, 5 + ph / 2, -W / 2 + 12 + pw / 2, tint('psu', colorOf(psu, 0x1b1d22)), pick, { roughness: 0.8 });
      this.fan(g, 110, -D / 2 + 8 + pl / 2, 6, -W / 2 + 12 + pw / 2, [Math.PI / 2, 0, 0], pick, false);
    } else this.ghost(g, 150, 86, 150, -D / 2 + 83, 48, -W / 2 + 87, 'psu');

    // --- ventilateurs de boîtier : façade (entrée), arrière puis dessus (sortie)
    const fans = [];
    for (const f of ctx.fan) for (let i = 0; i < (f.p.qty || 1) * f.qty; i++) fans.push(f.p);
    const frontMax = Math.max(1, Math.min(3, Math.floor((H - 60) / 125)));
    let nf = 0, nt = 0, rear = false;
    this.flowPts = { in: [], out: [] };
    for (const p of fans) {
      const s = p.size || 120, pick = pk('fan', p), rgb = this.opts.rgb && p.rgb, col = colorOf(p, 0x1b1d22);
      if (nf < frontMax) { const y = 80 + s / 2 + nf * (s + 6); this.fan(g, s, D / 2 - 22, y, 0, [0, Math.PI / 2, 0], pick, rgb, col); this.flowPts.in.push([D / 2 - 30, y, 0]); nf++; this.flow.intake++; }
      else if (!rear) { this.fan(g, Math.min(s, 120), -D / 2 + 20, cy, 10, [0, Math.PI / 2, 0], pick, rgb, col); this.flowPts.out.push([-D / 2 - 40, cy, 10]); rear = true; this.flow.exhaust++; }
      else if (topUsed + (nt + 1) * (s + 6) < D - 30) { const x = D / 2 - 40 - s / 2 - nt * (s + 6); this.fan(g, s, x, H - 20, 0, [Math.PI / 2, 0, 0], pick, rgb, col); this.flowPts.out.push([x, H + 50, 0]); nt++; this.flow.exhaust++; }
    }
    if (!fans.length) { const m = this.ghost(g, 25, 120, 120, D / 2 - 22, 80 + 60, 0, 'fan'); }
    if (topUsed) this.flowPts.out.push([-D / 2 + 30 + topUsed / 2, H + 50, 0]);

    if (this.opts.airflow) this.buildAirflow(g, D, W, H, cy, gy);
    return [D, W, H];
  }

  buildAirflow(g, D, W, H, cy, gy) {
    const ins = this.flowPts.in.length ? this.flowPts.in : [[D / 2 - 30, H * 0.45, 0]];
    const outs = this.flowPts.out.length ? this.flowPts.out : [[-D / 2 - 30, cy, 0]];
    const curves = [];
    ins.forEach((a, i) => outs.forEach((b, k) => {
      const midY = (i + k) % 2 ? cy : gy - 60;
      curves.push(new THREE.CatmullRomCurve3([
        new THREE.Vector3(a[0] + 110, a[1], a[2]), new THREE.Vector3(a[0], a[1], a[2]),
        new THREE.Vector3(D * 0.12, (a[1] + midY) / 2, 10), new THREE.Vector3(-D * 0.15, midY, 0),
        new THREE.Vector3((b[0] - D * 0.15) / 2, (b[1] + midY) / 2, b[2]), new THREE.Vector3(b[0], b[1], b[2])]));
    }));
    const N = 420, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(pts);
    const active = this.flowPts.in.length + this.flowPts.out.length;
    this.particles = { pts, curves, speed: active ? 0.22 : 0.06, data: Array.from({ length: N }, (_, i) => ({ c: i % curves.length, t: Math.random(), j: [(Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * Math.min(120, W * 0.5)] })) };
  }

  buildDesk(g, ctx) {
    const top = 750, wood = 0x6b4f3a;
    this.box(g, 1800, 30, 800, 0, top - 15, 0, wood, null, { roughness: 0.8, metalness: 0 });
    for (const sx of [-1, 1]) this.box(g, 50, top - 30, 700, sx * 840, (top - 30) / 2, 0, 0x1b1d22);
    const mons = [];
    for (const m of ctx.monitor) for (let i = 0; i < m.qty; i++) mons.push(m.p);
    const sizes = mons.map(p => { const d = (p.size || 27) * 25.4, a = (p.rw && p.rh) ? p.rw / p.rh : 16 / 9; const h = d / Math.sqrt(1 + a * a); return [h * a, h]; });
    const totalW = sizes.reduce((s, v) => s + v[0] + 20, 0);
    let x = -200 - totalW / 2;
    if (!mons.length) this.ghost(g, 610, 350, 30, -200, top + 280, -200, 'monitor');
    mons.forEach((p, i) => {
      const [w, h] = sizes[i], pick = { cat: 'monitor', label: p.n }, mx = x + w / 2 + 10; x += w + 20;
      this.box(g, w + 14, h + 14, 18, mx, top + 110 + h / 2, -220, 0x101114, pick);
      this.box(g, w, h, 2, mx, top + 110 + h / 2, -210, new THREE.MeshStandardMaterial({ color: 0x0a1a3a, emissive: 0x1d4fa8, emissiveIntensity: 0.7, roughness: 0.2 }), pick);
      this.box(g, 40, 120, 30, mx, top + 60, -235, 0x1b1d22, pick); this.box(g, 240, 10, 180, mx, top + 5, -230, 0x1b1d22, pick);
    });
    if (ctx.keyboard) { this.box(g, 440, 22, 135, -200, top + 11, 120, colorOf(ctx.keyboard, 0x24272e), { cat: 'keyboard', label: ctx.keyboard.n }); if (this.opts.rgb) this.glow(g, 420, 2, 115, -200, top + 23, 120, 0.6); }
    else this.ghost(g, 440, 22, 135, -200, top + 11, 120, 'keyboard');
    if (ctx.mouse) { this.box(g, 320, 3, 270, 220, top + 1.5, 130, 0x101114); this.box(g, 64, 36, 120, 220, top + 20, 130, colorOf(ctx.mouse, 0x24272e), { cat: 'mouse', label: ctx.mouse.n }); }
    else this.ghost(g, 64, 36, 120, 220, top + 18, 130, 'mouse');
    if (ctx.headset) {
      const pick = { cat: 'headset', label: ctx.headset.n }, hx = -720, col = colorOf(ctx.headset, 0x24272e);
      this.box(g, 120, 8, 120, hx, top + 4, -150, 0x1b1d22, pick); this.box(g, 14, 250, 14, hx, top + 125, -150, 0x1b1d22, pick);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(85, 9, 10, 24, Math.PI), this.mat(col)); arc.position.set(hx, top + 235, -150); g.add(arc);
      for (const s of [-1, 1]) this.box(g, 34, 90, 80, hx + s * 88, top + 205, -150, col, pick);
    } else this.ghost(g, 200, 240, 90, -720, top + 120, -150, 'headset');
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1), t = this.clock.elapsedTime;
    for (const r of this.spinners) r.rotation.z += dt * 9;
    for (const m of this.glows) m.material.emissive.setHSL((t * 0.12 + (m.userData.phase || 0)) % 1, 1, 0.5);
    if (this.particles) {
      const { pts, curves, data, speed } = this.particles, pos = pts.geometry.attributes.position, col = pts.geometry.attributes.color, v = new THREE.Vector3(), c = new THREE.Color();
      data.forEach((d, i) => {
        d.t += dt * speed * (0.7 + (i % 7) * 0.08); if (d.t > 1) d.t -= 1;
        curves[d.c].getPoint(d.t, v);
        const spread = Math.sin(d.t * Math.PI);
        pos.setXYZ(i, v.x + d.j[0] * spread, v.y + d.j[1] * spread, v.z + d.j[2] * spread);
        c.setHSL(0.6 - 0.6 * Math.pow(d.t, 1.4), 1, 0.55); col.setXYZ(i, c.r, c.g, c.b);
      });
      pos.needsUpdate = true; col.needsUpdate = true;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
