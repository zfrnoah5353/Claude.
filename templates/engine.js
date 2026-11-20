/* ColorTweaks – moteur d'animation deterministe.
   Tout l'affichage depend uniquement de t (secondes) : render(t) peut etre
   appele dans n'importe quel ordre et donne toujours la meme image. */
(function () {
  'use strict';
  const W = 1080, H = 1920;

  // ---------- maths / easing (jamais lineaire) ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, p) => a + (b - a) * p;
  const ease = {
    outCubic: p => 1 - Math.pow(1 - p, 3),
    outQuint: p => 1 - Math.pow(1 - p, 5),
    outExpo: p => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
    inCubic: p => p * p * p,
    inQuart: p => p * p * p * p,
    inOutCubic: p => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
    // ressort amorti : leger depassement (~8 %) puis stabilisation exacte a 1
    spring: (p, zeta = 0.62, omega = 13) => {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      const t = p * 1.0;
      const wd = omega * Math.sqrt(1 - zeta * zeta);
      const v = 1 - Math.exp(-zeta * omega * t) * (Math.cos(wd * t) + (zeta * omega / wd) * Math.sin(wd * t));
      // raccord doux vers 1 sur les derniers 15 %
      const k = clamp((p - 0.85) / 0.15);
      return lerp(v, 1, ease.inOutCubic(k));
    },
  };

  // ---------- PRNG deterministe ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- filtre couleur : meme formule que le moteur de l'appli ----------
  // out_k = c * g_k * (l + s*(ch_k - l)) + o ; l = .213r+.715g+.072b ; o = .5(1-c)+b ; g = [1+.2T, 1, 1-.2T]
  const PRESETS = {
    Original: [1, 1, 0, 0],
    Naturel: [1.15, 1, 0, 0],
    Vibrant: [2, 1.05, 0, 0],
    'Néon': [4, 0.95, 0.05, 0],
    'Cinématique': [1.3, 1.2, -0.04, 0],
    FPS: [1.6, 1.15, 0.05, 0],
  };
  function matrix(s, c, b, T) {
    const w = [0.213, 0.715, 0.072];
    const g = [1 + 0.2 * T, 1, 1 - 0.2 * T];
    const o = 0.5 * (1 - c) + b;
    const rows = [];
    for (let k = 0; k < 3; k++) {
      const r = [];
      for (let j = 0; j < 3; j++) r.push(c * g[k] * ((1 - s) * w[j] + (k === j ? s : 0)));
      r.push(0, o);
      rows.push(r.map(v => +v.toFixed(5)).join(' '));
    }
    rows.push('0 0 0 1 0');
    return rows.join(' ');
  }
  let filterCount = 0;
  function makeFilter(vals, hue = 0) {
    const id = 'f' + (filterCount++);
    const defs = document.getElementById('filters');
    const f = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    f.setAttribute('id', id);
    f.setAttribute('color-interpolation-filters', 'sRGB');
    const m = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
    m.setAttribute('type', 'matrix');
    m.setAttribute('values', matrix(...vals));
    f.appendChild(m);
    if (hue) {
      const h = document.createElementNS('http://www.w3.org/2000/svg', 'feColorMatrix');
      h.setAttribute('type', 'hueRotate');
      h.setAttribute('values', String(hue));
      f.appendChild(h);
    }
    defs.appendChild(f);
    return { id, css: `url(#${id})`, node: m, set: v => m.setAttribute('values', matrix(...v)) };
  }
  function presetFilter(name) { return makeFilter(PRESETS[name]); }

  // ---------- helpers DOM ----------
  function el(tag, cls, html, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  }
  const LOGO = (size, color = '#3be38f') =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="1.9" stroke-linejoin="round"><path d="M12 2l8.5 5v10L12 22l-8.5-5V7z"/><circle cx="12" cy="12" r="3.2" fill="${color}" stroke="none"/></svg>`;

  // ---------- evenements (pour caler la musique et les effets) ----------
  const EVENTS = [];
  function ev(t, type, strength = 1) { EVENTS.push({ t: +t.toFixed(3), type, strength }); }

  // ---------- animation d'un element ----------
  // kind : 'up' (texte), 'pop' (UI, ressort), 'left' / 'right' (glisse), 'fade', 'zoom'
  // entree : easing out (arrive vite puis freine) ; sortie : easing in (part doucement puis s'echappe)
  function animate(node, t, o) {
    const tin = o.tin, din = o.din || 0.55, tout = o.tout, dout = o.dout || 0.38;
    const dist = o.dist == null ? 110 : o.dist;
    if (t < tin || (tout != null && t >= tout + dout)) { node.style.opacity = 0; node.style.visibility = 'hidden'; return 0; }
    node.style.visibility = 'visible';
    const pi = clamp((t - tin) / din);
    const po = tout == null ? 0 : clamp((t - tout) / dout);
    const ui = o.kind === 'pop' || o.kind === 'zoom';
    const e = ui ? ease.spring(pi) : ease.outExpo(pi);
    const op = ease.outCubic(clamp(pi * 1.6));
    const x = ease.inCubic(po);
    let tx = 0, ty = 0, sc = 1, rot = 0;
    switch (o.kind) {
      case 'up': ty = (1 - e) * dist; break;
      case 'down': ty = -(1 - e) * dist; break;
      case 'left': tx = (1 - e) * dist * 2.2; break;
      case 'right': tx = -(1 - e) * dist * 2.2; break;
      case 'pop': sc = lerp(0.6, 1, e); ty = (1 - e) * 40; break;
      case 'zoom': sc = lerp(1.35, 1, e); break;
      case 'tilt': sc = lerp(0.8, 1, e); rot = (1 - e) * -6; ty = (1 - e) * 60; break;
      default: break;
    }
    // sortie : accelere vers le haut (ou le cote) en reduisant
    const exitDir = o.exit || 'up';
    if (exitDir === 'up') ty += -x * (dist * 1.4);
    else if (exitDir === 'left') tx += -x * 700;
    else if (exitDir === 'right') tx += x * 700;
    else if (exitDir === 'down') ty += x * (dist * 1.4);
    sc *= lerp(1, o.exitScale == null ? 0.92 : o.exitScale, x);
    const base = o.base || '';
    node.style.transform = `${base} translate(${tx.toFixed(2)}px,${ty.toFixed(2)}px) scale(${sc.toFixed(4)}) rotate(${rot.toFixed(3)}deg)`;
    node.style.opacity = (op * (1 - x)).toFixed(4);
    return e * (1 - x);
  }

  // ---------- scenes ----------
  const SCENES = [];
  const IMG_WAITS = new Set();
  function addScene(t0, t1, build) {
    const root = el('div', 'scene', null, document.getElementById('scenes'));
    const ctx = { t0, t1, root, items: [] };
    // ajoute un element anime ; tin relatif au debut de scene
    ctx.add = (node, o) => {
      const oo = Object.assign({}, o);
      oo.tin = t0 + (o.at || 0);
      if (o.until === null) oo.tout = null;
      else oo.tout = o.until != null ? t0 + o.until : t1 - (o.dout || 0.38);
      ctx.items.push({ node, o: oo });
      if (!o.silent) ev(oo.tin, o.sfx || (o.kind === 'pop' || o.kind === 'zoom' ? 'pop' : 'tick'), o.strength || 0.8);
      return node;
    };
    const upd = build(ctx) || (() => {});
    SCENES.push({ t0, t1, root, ctx, upd });
    ev(t0, 'whoosh', 1);
    return ctx;
  }

  function stageLayout(cfg) {
    // halos colores dans les coins (jamais de noir uni en haut/bas)
    const rnd = mulberry32(cfg.seed || 1);
    const halos = document.getElementById('halos');
    const pos = [[-380, -420], [380, -330], [-420, 1240], [420, 1300]];
    const cols = cfg.halos || ['#3be38f', '#22d3ee', '#7c5cff', '#ff4d8d'];
    window.__halos = pos.map((p, i) => {
      const h = el('div', 'halo', null, halos);
      h.style.left = p[0] + 'px'; h.style.top = p[1] + 'px';
      h.style.background = `radial-gradient(circle, ${cols[i % cols.length]} 0%, transparent 62%)`;
      return { h, ph: rnd() * 6.28, sp: 0.25 + rnd() * 0.25, amp: 50 + rnd() * 60 };
    });
    const head = document.getElementById('header');
    head.innerHTML = LOGO(52) + '<span class="name">COLORTWEAKS</span>';
  }

  function drawChrome(t, dur) {
    for (const o of window.__halos || []) {
      const dx = Math.sin(t * o.sp + o.ph) * o.amp, dy = Math.cos(t * o.sp * 0.8 + o.ph) * o.amp;
      o.h.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)`;
    }
    animate(document.getElementById('header'), t, { tin: 0.05, din: 0.6, kind: 'down', dist: 60, tout: null });
    // le pied de page reste visible jusqu'au bout
    animate(document.getElementById('footer'), t, { tin: 0.25, din: 0.6, kind: 'up', dist: 60, tout: null });
  }

  async function render(t) {
    const cfg = window.CONFIG;
    drawChrome(t, cfg.duration);
    for (const s of SCENES) {
      const on = t >= s.t0 && t < s.t1;
      s.root.style.display = on ? 'block' : 'none';
      if (!on) continue;
      for (const it of s.ctx.items) animate(it.node, t, it.o);
      s.upd(t, t - s.t0);
    }
    if (IMG_WAITS.size) { await Promise.all([...IMG_WAITS]); IMG_WAITS.clear(); }
  }

  // verifie qu'aucun texte ne deborde (appele aux images cles)
  function checkLayout() {
    const bad = [];
    document.querySelectorAll('.scene .txt, .scene .card, .scene .app').forEach(n => {
      if (n.closest('.scene').style.display === 'none') return;
      const cs = getComputedStyle(n);
      if (+cs.opacity < 0.95 || cs.visibility === 'hidden') return;
      const r = n.getBoundingClientRect();
      if (r.width === 0) return;
      if (r.left < 30 || r.right > W - 30 || r.top < 250 || r.bottom > 1600)
        bad.push(`hors cadre: "${(n.textContent || '').trim().slice(0, 40)}" [${r.left|0},${r.top|0},${r.right|0},${r.bottom|0}]`);
      n.querySelectorAll('*').forEach(c => {
        if (c.scrollWidth > c.clientWidth + 2 && getComputedStyle(c).overflow !== 'visible')
          bad.push(`texte coupe: "${(c.textContent || '').trim().slice(0, 40)}"`);
      });
      if (n.classList.contains('txt') && n.scrollWidth > n.clientWidth + 2)
        bad.push(`texte deborde: "${(n.textContent || '').trim().slice(0, 40)}"`);
    });
    return bad;
  }

  window.CT = { W, H, clamp, lerp, ease, mulberry32, PRESETS, matrix, makeFilter, presetFilter, el, LOGO, ev, EVENTS, animate, addScene, SCENES, IMG_WAITS };
  window.render = render;
  window.checkLayout = checkLayout;
  window.getEvents = () => EVENTS.slice().sort((a, b) => a.t - b.t);
  window.__stageLayout = stageLayout;
})();
