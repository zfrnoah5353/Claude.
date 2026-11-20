/* ColorTweaks – bibliotheque de scenes. Chaque scene est decrite par generate.py
   dans window.CONFIG.scenes = [{type, dur, ...}] et construite ici. */
(function () {
  'use strict';
  const { clamp, lerp, ease, PRESETS, makeFilter, el, LOGO, ev, addScene, IMG_WAITS } = window.CT;
  const CFG = window.CONFIG;
  const FOOT = '*rendu du filtre reproduit au montage';

  const ICONS = {
    palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.4-2-.4-1 .3-2 1.4-2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15" cy="7.5" r="1.2"/>',
    sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
    game: '<rect x="2.5" y="7" width="19" height="11" rx="5"/><path d="M7 11v3M5.5 12.5h3"/><circle cx="15.5" cy="11.5" r="1"/><circle cx="17.5" cy="13.5" r="1"/>',
    auto: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    keys: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h1M10 10h1M14 10h1M18 10h0M7 14h10"/>',
    tune: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    tray: '<rect x="3" y="14" width="18" height="6" rx="2"/><path d="M12 3v7M8.5 7.5 12 11l3.5-3.5"/>',
    shield: '<path d="M12 3 4.5 6v6c0 4.5 3.2 7.8 7.5 9 4.3-1.2 7.5-4.5 7.5-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  };
  const icon = (n, s = 44, c = '#3be38f') => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

  // ---------- source gameplay (clip decoupe en images ou capture fixe) ----------
  const GP = CFG.gameplay || null;
  let gpCursor = 0; // chaque scene prend un passage different du clip
  function gameplay(parent, x, y, w, h, opt = {}) {
    const box = el('div', 'shot', null, parent);
    Object.assign(box.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    const src = GP && GP.sources[(opt.pick != null ? opt.pick : gpCursor++) % GP.sources.length];
    const img = el('img', null, null, box);
    const top = opt.split ? el('img', null, null, box) : null;
    let last = '';
    const f = makeFilter(PRESETS[opt.preset || 'Original']);
    img.style.filter = f.css;
    function update(lt, dur) {
      if (!src) return;
      let url, kb;
      if (src.kind === 'clip') {
        const i = Math.floor((src.start + lt) * src.fps) % src.count;
        url = `${src.dir}/f_${String(i + 1).padStart(5, '0')}.jpg`;
        kb = 1.02;
      } else {
        url = src.src;
        kb = lerp(1.04, 1.14, ease.inOutCubic(clamp(lt / Math.max(dur, 0.1))));
      }
      if (url !== last) {
        last = url;
        img.src = url; IMG_WAITS.add(img.decode().catch(() => {}));
        if (top) { top.src = url; IMG_WAITS.add(top.decode().catch(() => {})); }
      }
      const tr = `scale(${kb.toFixed(4)})`;
      img.style.transform = tr; if (top) top.style.transform = tr;
    }
    return { box, img, top, filter: f, update, src };
  }

  // ---------- plans d'illustration libres de droits (jamais filtres : ce ne sont pas des captures de jeu) ----------
  const BR = (CFG.broll || []);
  let brCursor = 0;
  function broll(ctx, strong) {
    const box = el('div', 'bgv', null, ctx.root);
    const img = el('img', null, null, box);
    const tint = el('div', 'tint', null, box);
    if (strong) tint.style.opacity = 1.0; else tint.style.opacity = 0.85;
    const src = BR.length ? BR[(brCursor++) % BR.length] : null;
    ctx.add(box, { at: 0, kind: 'fade', din: 0.3, silent: true, dout: 0.3, exitScale: 1 });
    ctx.root.classList.add('onv');
    let last = '';
    return (lt, dur) => {
      if (!src) return;
      const i = Math.min(src.count - 1, Math.floor(lt * src.fps));
      const url = `${src.dir}/f_${String(i + 1).padStart(5, '0')}.jpg`;
      if (url !== last) { last = url; img.src = url; IMG_WAITS.add(img.decode().catch(() => {})); }
      img.style.transform = `scale(${lerp(1.0, 1.08, ease.inOutCubic(clamp(lt / Math.max(dur, 0.1)))).toFixed(4)})`;
    };
  }

  function foot(root) { return el('div', 'foot txt', FOOT, root); }
  function col(root, top = 330, height = 1200, gap = 40) {
    const c = el('div', 'col', null, root);
    Object.assign(c.style, { top: top + 'px', height: height + 'px', gap: gap + 'px' });
    return c;
  }
  const kindIn = () => CFG.style && CFG.style.textIn || 'up';

  // =====================================================================
  const BUILD = {
    hook(s, ctx) {
      const bu = s.broll ? broll(ctx) : null;
      const c = col(ctx.root, 330, 1150, 34);
      let at = 0.05;
      if (s.kicker) { ctx.add(el('div', 'pill txt', s.kicker, c), { at, kind: 'pop' }); at += 0.18; }
      s.lines.forEach(l => { ctx.add(el('div', 'h1 txt', l, c), { at, kind: kindIn(), sfx: 'tick' }); at += 0.16; });
      if (s.sub) ctx.add(el('div', 'sub txt', s.sub, c), { at: at + 0.15, kind: 'up', dist: 60 });
      ev(ctx.t0 + 0.05, 'impact', 1);
      if (bu) return (t, lt) => bu(lt, s.dur);
    },

    brollText(s, ctx) {
      const bu = broll(ctx);
      const c = col(ctx.root, s.pos === 'low' ? 900 : 330, s.pos === 'low' ? 620 : 1150, 26);
      let at = 0.2;
      if (s.kicker) { ctx.add(el('div', 'pill txt', s.kicker, c), { at, kind: 'pop' }); at += 0.15; }
      s.lines.forEach(l => { ctx.add(el('div', (s.big ? 'h1' : 'h2') + ' txt', l, c), { at, kind: kindIn() }); at += 0.18; });
      if (s.sub) ctx.add(el('div', 'sub txt', s.sub, c), { at: at + 0.2, kind: 'up', dist: 50 });
      return (t, lt) => bu(lt, s.dur);
    },

    truth(s, ctx) {
      const bu = s.broll ? broll(ctx, true) : null;
      const c = col(ctx.root, 330, 1150, 40);
      ctx.add(el('div', 'pill txt', s.kicker || 'Vrai ou faux ?', c), { at: 0.05, kind: 'pop' });
      ctx.add(el('div', 'h2 txt', `«\u00a0${s.statement}\u00a0»`, c), { at: 0.2, kind: kindIn() });
      const st = el('div', 'stamp txt ' + (s.verdict === 'VRAI' ? 'v' : 'f'), s.verdict, c);
      ctx.add(st, { at: 1.15, kind: 'zoom', sfx: 'impact', strength: 0.9 });
      ctx.add(el('div', 'sub txt', s.detail, c), { at: 1.5, kind: 'up', dist: 50 });
      return (t, lt) => {
        if (bu) bu(lt, s.dur);
        const k = clamp((lt - 1.15) / 0.5);
        st.style.transform += ` rotate(${lerp(-14, -4, ease.spring(k)).toFixed(2)}deg)`;
      };
    },

    steps(s, ctx) {
      const c = col(ctx.root, 300, 1230, 26);
      ctx.add(el('div', 'h2 txt', s.title, c), { at: 0.05, kind: kindIn() });
      const gapT = (s.dur - 1.4) / s.steps.length;
      s.steps.forEach((st, i) => {
        const r = el('div', 'card row', null, c);
        Object.assign(r.style, { width: '900px', padding: '26px 34px', textAlign: 'left' });
        el('div', 'num', String(i + 1), r);
        el('div', 'txt', `<div style="font-weight:700;font-size:42px;line-height:1.15">${st.t}</div><div style="font-weight:500;font-size:29px;color:var(--mu);line-height:1.3;margin-top:4px">${st.d}</div>`, r);
        ctx.add(r, { at: 0.45 + i * gapT, kind: 'pop', sfx: 'pop' });
      });
    },

    app(s, ctx) {
      const root = ctx.root;
      const c = col(root, 300, 220, 10);
      ctx.add(el('div', 'h2 txt', s.title, c), { at: 0.05, kind: kindIn() });
      if (s.sub) ctx.add(el('div', 'sub txt', s.sub, c), { at: 0.2, kind: 'up', dist: 60 });
      const g = gameplay(root, 150, 520, 780, 380, { preset: s.from });
      ctx.add(g.box, { at: 0.25, kind: 'pop' });
      const app = el('div', 'app', null, root);
      Object.assign(app.style, { left: '70px', top: '925px', width: '940px', height: '585px' });
      app.innerHTML = `<div class="side">${['Accueil', 'Panneau couleurs', 'Jeux', 'Profils', 'Performances', 'Raccourcis'].map((n, i) => `<span class="it${i === 1 ? ' on' : ''}">${n}</span>`).join('')}</div>
        <div class="main"><div class="mh"><span>Panneau couleurs</span><span class="tg"><i></i></span></div>
        ${['Saturation', 'Contraste', 'Luminosité', 'Température'].map(n => `<div class="sl"><div><span>${n}</span><span class="v">0</span></div><i><u></u><b></b></i></div>`).join('')}
        <div class="pr">${['Naturel', 'Vibrant', 'Néon', 'Cinématique', 'FPS'].map(n => `<span>${n}</span>`).join('')}</div></div>`;
      ctx.add(app, { at: 0.45, kind: 'pop' });
      const mk = el('div', 'mock txt', 'Maquette de l’interface', root); mk.style.top = '1528px';
      ctx.add(mk, { at: 0.6, kind: 'fade', silent: true });
      const ft = foot(root); ctx.add(ft, { at: 0.6, kind: 'fade', silent: true });
      ft.style.top = '1556px'; mk.style.top = '1522px';
      const ranges = [[0, 5], [0.5, 2], [-0.5, 0.5], [-1, 1]];
      const sls = [...app.querySelectorAll('.sl')];
      const chips = [...app.querySelectorAll('.pr span')];
      const tg = app.querySelector('.tg'), knob = tg.querySelector('i');
      const tSwitch = s.dur * 0.42, tOn = 1.0;
      ev(ctx.t0 + tOn, 'click', 0.9); ev(ctx.t0 + tSwitch, 'click', 1);
      const A = PRESETS[s.from], B = PRESETS[s.to];
      return (t, lt) => {
        g.update(lt, s.dur);
        const on = ease.spring(clamp((lt - tOn) / 0.5));
        knob.style.transform = `translateX(${(on * 32).toFixed(1)}px)`;
        tg.style.background = on > 0.5 ? '#3E74B8' : '#2a2a31';
        const p = ease.spring(clamp((lt - tSwitch) / 0.8), 0.7, 11);
        const vals = A.map((a, i) => lerp(a, B[i], p));
        const shown = lt < tOn ? PRESETS.Original : vals;
        g.filter.set(lt < tOn ? PRESETS.Original : vals);
        sls.forEach((sl, i) => {
          const v = vals[i], r = ranges[i];
          const pct = clamp((v - r[0]) / (r[1] - r[0])) * 100;
          sl.querySelector('b').style.left = pct + '%';
          sl.querySelector('u').style.width = pct + '%';
          sl.querySelector('.v').textContent = (i >= 2 && v >= 0 ? '+' : '') + v.toFixed(2);
        });
        chips.forEach(ch => ch.classList.toggle('on', ch.textContent === (lt < tSwitch ? s.from : s.to)));
        void shown;
      };
    },

    keys(s, ctx) {
      const root = ctx.root;
      const c = col(root, 300, 200, 8);
      ctx.add(el('div', 'h2 txt', s.title, c), { at: 0.05, kind: kindIn() });
      const g = gameplay(root, 80, 540, 920, 518, { preset: 'Original' });
      ctx.add(g.box, { at: 0.2, kind: 'pop' });
      const lab = el('div', 'tag r txt', '', g.box);
      lab.style.left = '22px';
      const kr = el('div', 'row', null, root);
      Object.assign(kr.style, { position: 'absolute', left: '0', right: '0', top: '1130px', justifyContent: 'center', gap: '22px' });
      const keyNodes = [];
      s.combo.forEach((k, i) => {
        if (i) el('span', 'plus', '+', kr);
        const kn = el('span', 'key', k, kr);
        keyNodes.push(kn);
        ctx.add(kn, { at: 0.35 + i * 0.12, kind: 'pop' });
      });
      const cap = el('div', 'sub txt', s.caption, root);
      Object.assign(cap.style, { position: 'absolute', left: '90px', right: '90px', top: '1330px', textAlign: 'center' });
      ctx.add(cap, { at: 0.7, kind: 'up', dist: 50 });
      const ft = foot(root); ctx.add(ft, { at: 0.6, kind: 'fade', silent: true });
      const presses = s.presses; // temps relatifs
      presses.forEach(p => ev(ctx.t0 + p, 'click', 1));
      const seq = s.mode === 'toggle' ? null : s.cycle;
      return (t, lt) => {
        g.update(lt, s.dur);
        let n = presses.filter(p => lt >= p).length;
        let preset, label;
        if (s.mode === 'toggle') {
          const onState = n % 2 === 1;
          preset = onState ? s.preset : 'Original';
          label = onState ? `Filtre activé · ${s.preset}` : 'Filtre désactivé';
        } else {
          preset = seq[Math.min(n, seq.length - 1)];
          label = preset;
        }
        g.filter.set(PRESETS[preset]);
        if (lab.textContent !== label) lab.textContent = label;
        lab.style.opacity = lt > 0.5 ? 1 : 0;
        // enfoncement des touches
        let depth = 0;
        for (const p of presses) { const d = lt - p + 0.08; if (d >= 0 && d < 0.3) depth = Math.max(depth, Math.sin(clamp(d / 0.3) * Math.PI)); }
        keyNodes.forEach(k => {
          const base = k.style.transform.replace(/translateY\([^)]*\)/g, '');
          k.style.transform = base + ` translateY(${(depth * 12).toFixed(1)}px)`;
          k.style.boxShadow = `0 ${(12 - depth * 10).toFixed(1)}px 0 #08191e, 0 26px 50px rgba(0,0,0,.45)`;
          k.style.borderColor = depth > 0.2 ? 'rgba(59,227,143,.9)' : 'rgba(160,240,215,.35)';
        });
        // pastille : petit rebond a chaque appui
        const lp = presses.filter(p => lt >= p).pop();
        const b = lp == null ? 1 : ease.spring(clamp((lt - lp) / 0.45));
        lab.style.transform = `scale(${lerp(0.7, 1, b).toFixed(3)})`;
      };
    },

    quizQ(s, ctx) {
      const c = col(ctx.root, 300, 1230, 24);
      if (s.kicker) ctx.add(el('div', 'pill txt', s.kicker, c), { at: 0.05, kind: 'pop' });
      ctx.add(el('div', 'h2 txt', s.q, c), { at: 0.15, kind: kindIn() });
      s.answers.forEach((a, i) => {
        const r = el('div', 'card ans', `<div class="l">${a.l}</div><div class="t txt">${a.t}</div>`, c);
        r.style.width = '900px'; r.style.textAlign = 'left';
        ctx.add(r, { at: 0.6 + i * 0.32, kind: i % 2 ? 'left' : 'right', dist: 80, sfx: 'pop' });
      });
    },

    quizA(s, ctx) {
      const root = ctx.root;
      const c = col(root, 300, 230, 6);
      ctx.add(el('div', 'h3 txt', `Réponse <span class="hl">${s.l}</span>`, c), { at: 0.05, kind: kindIn() });
      ctx.add(el('div', 'sub txt', s.t, c), { at: 0.15, kind: 'up', dist: 50 });
      const g = gameplay(root, 80, 600, 920, 518, { preset: s.preset });
      ctx.add(g.box, { at: 0.2, kind: 'zoom' });
      const big = el('div', 'h1 txt', `→ <span class="hl">${s.preset}</span>`, root);
      Object.assign(big.style, { position: 'absolute', left: '90px', right: '90px', top: '1170px', textAlign: 'center' });
      ctx.add(big, { at: 0.45, kind: 'pop', strength: 1 });
      const d = el('div', 'sub txt', s.why, root);
      Object.assign(d.style, { position: 'absolute', left: '90px', right: '90px', top: '1300px', textAlign: 'center' });
      ctx.add(d, { at: 0.65, kind: 'up', dist: 50 });
      const ft = foot(root); ctx.add(ft, { at: 0.5, kind: 'fade', silent: true });
      return (t, lt) => g.update(lt, s.dur);
    },

    beforeafter(s, ctx) {
      const root = ctx.root;
      const c = col(root, 300, 200, 8);
      ctx.add(el('div', 'h2 txt', s.title, c), { at: 0.05, kind: kindIn() });
      const tall = GP && GP.sources[0] && GP.sources[0].kind === 'clip';
      const h = tall ? 900 : 560, y = tall ? 520 : 650;
      const g = gameplay(root, 80, y, 920, h, { preset: s.preset, split: true });
      ctx.add(g.box, { at: 0.15, kind: 'pop' });
      el('span', 'tag', 'Avant', g.box).style.left = '22px';
      el('span', 'tag r', `Après · ${s.preset}`, g.box).style.right = '22px';
      const bar = el('div', 'wipe', null, g.box);
      const pl = el('div', 'h3 txt', s.caption, root);
      Object.assign(pl.style, { position: 'absolute', left: '90px', right: '90px', top: (y + h + 50) + 'px', textAlign: 'center' });
      ctx.add(pl, { at: 0.9, kind: 'up', dist: 50 });
      const ft = foot(root); ctx.add(ft, { at: 0.5, kind: 'fade', silent: true });
      // balayage : 100 % avant -> tout apres -> moitie/moitie (chaque segment avec easing)
      const k1 = 0.7, k2 = 0.45 * s.dur, k3 = 0.72 * s.dur;
      ev(ctx.t0 + k1, 'riser', 0.8); ev(ctx.t0 + k2, 'impact', 0.9);
      return (t, lt) => {
        g.update(lt, s.dur);
        let p;
        if (lt < k1) p = 1;
        else if (lt < k2) p = lerp(1, 0, ease.inOutCubic(clamp((lt - k1) / (k2 - k1 - 0.3))));
        else p = lerp(0, 0.5, ease.spring(clamp((lt - k3) / 0.9), 0.7, 11));
        g.top.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`;
        g.top.style.filter = 'none';
        bar.style.left = `calc(${(p * 100).toFixed(2)}% - 3px)`;
      };
    },

    carousel(s, ctx) {
      const root = ctx.root;
      const c = col(root, 300, 200, 8);
      ctx.add(el('div', 'h2 txt', s.title, c), { at: 0.05, kind: kindIn() });
      const tall = GP && GP.sources[0] && GP.sources[0].kind === 'clip';
      const h = tall ? 860 : 560, y = tall ? 520 : 650;
      const g = gameplay(root, 80, y, 920, h, { preset: s.presets[0] });
      ctx.add(g.box, { at: 0.15, kind: 'pop' });
      const name = el('div', 'h1 txt', '', root);
      Object.assign(name.style, { position: 'absolute', left: '90px', right: '90px', top: (y + h + 30) + 'px', textAlign: 'center' });
      const ft = foot(root); ctx.add(ft, { at: 0.5, kind: 'fade', silent: true });
      const seg = (s.dur - 0.5) / s.presets.length;
      s.presets.forEach((p, i) => ev(ctx.t0 + 0.3 + i * seg, i ? 'click' : 'pop', 1));
      return (t, lt) => {
        g.update(lt, s.dur);
        const i = Math.min(s.presets.length - 1, Math.max(0, Math.floor((lt - 0.3) / seg)));
        const p = s.presets[i];
        g.filter.set(PRESETS[p]);
        name.innerHTML = `<span class="hl">${p}</span>`;
        const ls = lt - (0.3 + i * seg);
        const e = ease.spring(clamp(ls / 0.5));
        const out = ease.inCubic(clamp((lt - (s.dur - 0.38)) / 0.38));
        name.style.opacity = lt < 0.3 ? 0 : (clamp(ls / 0.15) * (1 - out)).toFixed(3);
        name.style.transform = `translateY(${((1 - e) * 50 - out * 120).toFixed(1)}px) scale(${lerp(0.75, 1, e).toFixed(3)})`;
        g.box.style.outline = `${(8 * (1 - clamp(ls / 0.35))).toFixed(1)}px solid rgba(59,227,143,.8)`;
      };
    },

    games(s, ctx) {
      const c = col(ctx.root, 290, 1250, 16);
      ctx.add(el('div', 'h2 txt', s.title, c), { at: 0.05, kind: kindIn() });
      const cols = ['#ff4655', '#f2a33a', '#7c5cff', '#e0412f', '#f99e1a', '#3be38f'];
      s.games.forEach((gm, i) => {
        const r = el('div', 'card game', `<div class="gi" style="background:${cols[i % cols.length]}"></div><div class="txt" style="text-align:left"><div class="gn">${gm.n}</div><div class="gl">${gm.l}</div></div>`, c);
        r.style.width = '880px';
        ctx.add(r, { at: 0.5 + i * 0.28, kind: i % 2 ? 'left' : 'right', dist: 70, sfx: 'pop' });
      });
      if (s.note) ctx.add(el('div', 'sub txt', s.note, c), { at: 0.6 + s.games.length * 0.28, kind: 'up', dist: 40 });
    },

    features(s, ctx) {
      const c = col(ctx.root, 300, 1230, 20);
      ctx.add(el('div', 'h2 txt', s.title, c), { at: 0.05, kind: kindIn() });
      const stepT = (s.dur - 1.3) / s.items.length;
      s.items.forEach((it, i) => {
        const r = el('div', 'card feat', `<div class="ic">${icon(it.i)}</div><div class="txt" style="text-align:left"><div class="t">${it.t}</div><div class="d">${it.d}</div></div>`, c);
        r.style.width = '900px';
        ctx.add(r, { at: 0.45 + i * stepT, kind: 'pop' });
      });
    },

    auto(s, ctx) {
      const root = ctx.root;
      const c = col(root, 300, 200, 8);
      ctx.add(el('div', 'h2 txt', s.title, c), { at: 0.05, kind: kindIn() });
      const scr = el('div', 'shot', null, root);
      Object.assign(scr.style, { left: '60px', top: '540px', width: '960px', height: '760px', background: 'linear-gradient(160deg,#16324a,#0f2233)' });
      ctx.add(scr, { at: 0.15, kind: 'pop' });
      const g = gameplay(scr, 40, 40, 880, 495, { preset: 'Original' });
      g.box.style.borderRadius = '18px';
      const wt = el('span', 'tag', s.game, g.box); wt.style.left = '18px';
      const tb = el('div', 'taskbar', null, scr);
      tb.innerHTML = `<div class="tray">${LOGO(34)}</div><div class="clock">21:42<br>${s.date}</div>`;
      const toast = el('div', 'toast', null, scr);
      const ft = foot(root); ctx.add(ft, { at: 0.5, kind: 'fade', silent: true });
      const cap = el('div', 'sub txt', s.caption, root);
      Object.assign(cap.style, { position: 'absolute', left: '90px', right: '90px', top: '1340px', textAlign: 'center' });
      ctx.add(cap, { at: 0.8, kind: 'up', dist: 50 });
      const tIn = 0.7, tDet = 1.9, tQuit = s.dur * 0.68;
      ev(ctx.t0 + tDet, 'pop', 1); ev(ctx.t0 + tQuit, 'pop', 0.8);
      const P = PRESETS[s.preset], O = PRESETS.Original;
      return (t, lt) => {
        g.update(lt, s.dur);
        // fenetre du jeu : arrive au premier plan puis se ferme
        const ein = ease.spring(clamp((lt - tIn) / 0.6));
        const eout = ease.inCubic(clamp((lt - tQuit) / 0.45));
        g.box.style.opacity = (clamp((lt - tIn) / 0.2) * (1 - eout)).toFixed(3);
        g.box.style.transform = `translateY(${((1 - ein) * 80 + eout * 60).toFixed(1)}px) scale(${(lerp(0.85, 1, ein) * lerp(1, 0.8, eout)).toFixed(3)})`;
        const pf = ease.outCubic(clamp((lt - tDet - 0.15) / 0.6));
        g.filter.set(O.map((o, i) => lerp(o, P[i], pf)));
        // notifications
        let msg = null, t0 = 0;
        if (lt >= tQuit + 0.2) { msg = ['Jeu quitté', 'Tes couleurs d’origine reviennent']; t0 = tQuit + 0.2; }
        else if (lt >= tDet) { msg = [`${s.game} détecté`, `Look ${s.preset} appliqué automatiquement`]; t0 = tDet; }
        if (msg) {
          const html = `<div class="t1">${msg[0]}</div><div class="t2">${msg[1]}</div>`;
          if (toast.innerHTML !== html) toast.innerHTML = html;
          const e = ease.spring(clamp((lt - t0) / 0.5));
          toast.style.opacity = clamp((lt - t0) / 0.15).toFixed(3);
          toast.style.transform = `translateX(${((1 - e) * 120).toFixed(1)}px)`;
        } else toast.style.opacity = 0;
      };
    },

    safety(s, ctx) {
      const c = col(ctx.root, 300, 1230, 22);
      ctx.add(el('div', 'h2 txt', s.title, c), { at: 0.05, kind: kindIn() });
      s.items.forEach((it, i) => {
        const r = el('div', 'card feat', `<div class="ic">${icon('check')}</div><div class="txt" style="text-align:left"><div class="t">${it}</div></div>`, c);
        r.style.width = '900px';
        ctx.add(r, { at: 0.5 + i * 0.45, kind: 'pop' });
      });
    },

    tray(s, ctx) {
      const root = ctx.root;
      const c = col(root, 300, 300, 14);
      ctx.add(el('div', 'h2 txt', s.title, c), { at: 0.05, kind: kindIn() });
      ctx.add(el('div', 'sub txt', s.sub, c), { at: 0.2, kind: 'up', dist: 50 });
      const bar = el('div', 'card', null, root);
      Object.assign(bar.style, { position: 'absolute', left: '90px', width: '900px', top: '820px', height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '34px', padding: '0 46px', background: 'rgba(20,26,34,.95)' });
      bar.innerHTML = `<span style="opacity:.5">${icon('game', 58, '#cfd8e3')}</span><span class="tray" style="width:110px;height:110px;border-radius:26px">${LOGO(70)}</span><div class="clock" style="font-size:40px">21:42</div>`;
      ctx.add(bar, { at: 0.4, kind: 'pop' });
      const tip = el('div', 'toast', `<div class="t1">ColorTweaks</div><div class="t2">${s.tip}</div>`, root);
      Object.assign(tip.style, { left: '220px', right: 'auto', top: '1070px', bottom: 'auto', width: '640px' });
      ctx.add(tip, { at: 1.1, kind: 'pop' });
    },

    outro(s, ctx) {
      const bu = s.broll ? broll(ctx, true) : null;
      const c = col(ctx.root, 330, 1180, 34);
      ctx.add(el('div', null, LOGO(230), c), { at: 0.05, kind: 'zoom', sfx: 'impact', until: null });
      ctx.add(el('div', 'h1 txt', s.title || 'Disponible maintenant', c), { at: 0.3, kind: kindIn(), until: null });
      ctx.add(el('div', 'pill txt', 'Gratuit · Windows 11', c), { at: 0.55, kind: 'pop', until: null });
      const b = el('div', 'btn txt', 'Lien en bio', c);
      ctx.add(b, { at: 0.85, kind: 'pop', until: null, strength: 1 });
      return (t, lt) => {
        if (bu) bu(lt, s.dur);
        // pulsation douce du bouton (sinus, pas lineaire)
        if (lt > 1.6) {
          const k = 1 + 0.035 * Math.sin((lt - 1.6) * 5.2);
          b.style.transform += ` scale(${k.toFixed(4)})`;
        }
      };
    },
  };

  // ---------- construction ----------
  window.__stageLayout(CFG);
  let t = 0;
  CFG.scenes.forEach(s => {
    const t0 = t, t1 = t + s.dur;
    addScene(t0, t1, ctx => BUILD[s.type](s, ctx));
    t = t1;
  });
  CFG.duration = t;
  window.READY = document.fonts.ready.then(() => true);
})();
