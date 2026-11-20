/* ColorTweaks – style v2 « natif TikTok » : plein ecran, sous-titres geants visibles des la 1re image,
   revelation avec flash + secousse, coupes rapides. Charge avant scenes.js. */
(function () {
  'use strict';
  const { clamp, lerp, ease, PRESETS, makeFilter, el, LOGO, ev, IMG_WAITS } = window.CT;
  const CFG = window.CONFIG;
  const FOOT = '*rendu du filtre reproduit au montage';

  // ---- gameplay plein ecran : fond flou + image nette centree (sans bandes noires) ----
  function fullGameplay(root, src, preset) {
    const wrap = el('div', 'v2gp', null, root);
    const bg = el('img', 'v2bg', null, wrap);
    const fg = el('img', 'v2fg', null, wrap);
    const f = makeFilter(PRESETS[preset || 'Original']);
    bg.style.filter = `${f.css} blur(28px) brightness(.62)`;
    fg.style.filter = f.css;
    let last = '';
    function frame(lt, kb) {
      if (!src) return;
      let url;
      if (src.kind === 'clip') {
        const i = Math.floor((src.start + lt) * src.fps) % src.count;
        url = `${src.dir}/f_${String(i + 1).padStart(5, '0')}.jpg`;
      } else url = src.src;
      if (url !== last) {
        last = url;
        bg.src = url; fg.src = url;
        IMG_WAITS.add(bg.decode().catch(() => {})); IMG_WAITS.add(fg.decode().catch(() => {}));
      }
      fg.style.transform = `translate(-50%,-50%) scale(${kb.toFixed(4)})`;
      bg.style.transform = `scale(${(1.25 + (kb - 1) * 0.5).toFixed(4)})`;
    }
    return { wrap, bg, fg, filter: f, frame };
  }

  // ---- sous-titres facon TikTok, mot par mot ----
  function caption(parent, html, cls, top) {
    const c = el('div', 'v2cap ' + (cls || ''), null, parent);
    c.style.top = top + 'px';
    // decoupe en mots en gardant les balises <y> (mot surligne)
    html = html.replace(/\[([^\]]+)\]/g, (m, g) => g.split(' ').map(w => `[${w}]`).join(' '));
    const parts = html.split(' ');
    const words = parts.map(w => {
      const s = el('span', 'w', w.replace(/\[(.+?)\]/g, '<b>$1</b>'), c);
      c.appendChild(document.createTextNode(' '));
      return s;
    });
    return { c, words };
  }
  function popWords(words, lt, start, step, already) {
    words.forEach((w, i) => {
      const t0 = start + i * step;
      if (already) { w.style.opacity = 1; w.style.transform = 'none'; return; }
      const p = clamp((lt - t0) / 0.32);
      w.style.opacity = p > 0 ? 1 : 0;
      const e = ease.spring(p, 0.55, 14);
      w.style.transform = `scale(${lerp(0.4, 1, e).toFixed(3)}) translateY(${((1 - e) * 30).toFixed(1)}px)`;
    });
  }
  function exitAll(node, lt, dur) {
    const x = ease.inCubic(clamp((lt - (dur - 0.22)) / 0.22));
    node.style.opacity = (1 - x).toFixed(3);
    node.style.transform = `translateY(${(-x * 80).toFixed(1)}px) scale(${lerp(1, 0.9, x).toFixed(3)})`;
  }
  // secousse deterministe apres un impact
  function shake(stage, lt, at, amp) {
    const d = lt - at;
    if (d < 0 || d > 0.45) return '';
    const k = Math.exp(-d * 9) * amp;
    return `translate(${(Math.sin(d * 90) * k).toFixed(1)}px,${(Math.cos(d * 77) * k).toFixed(1)}px)`;
  }
  const BR = CFG.broll || [];
  const GP = (CFG.gameplay && CFG.gameplay.sources) || [];

  const V2 = {
    // 1) accroche sur le gameplay terne : texte visible des la 1re image (miniature !)
    v2hook(s, ctx) {
      const g = fullGameplay(ctx.root, GP[s.gp % GP.length], 'Original');
      const cap = caption(ctx.root, s.text, 'big', s.top || 560);
      const sub = s.sub ? caption(ctx.root, s.sub, 'small', (s.top || 560) + 420) : null;
      ctx.root.style.display = 'block';
      ev(ctx.t0 + 0.02, 'impact', 0.7);
      return (t, lt) => {
        g.frame(lt, lerp(1.0, 1.06, ease.inOutCubic(clamp(lt / s.dur))));
        popWords(cap.words, lt, 0, 0, true);
        const punch = ease.spring(clamp(lt / 0.45), 0.5, 12);
        cap.c.style.transform = `scale(${lerp(1.12, 1, punch).toFixed(3)})`;
        if (sub) { popWords(sub.words, lt, 0.35, 0.09); }
      };
    },

    // 2) revelation : flash blanc, secousse, le filtre s'allume, balayage avant/apres
    v2reveal(s, ctx) {
      const src = GP[s.gp % GP.length];
      const g = fullGameplay(ctx.root, src, s.preset);
      const before = fullGameplay(ctx.root, src, 'Original');
      const line = el('div', 'v2line', null, ctx.root);
      const la = el('div', 'v2tag', 'AVANT', ctx.root); la.style.left = '40px';
      const lb = el('div', 'v2tag on', 'APRÈS', ctx.root); lb.style.right = '40px';
      const cap = caption(ctx.root, s.text, 'mid', 1320);
      const foot = el('div', 'v2foot txt', FOOT, ctx.root);
      const flash = el('div', 'v2flash', null, ctx.root);
      ev(ctx.t0, 'impact', 1.2);
      ev(ctx.t0 + 1.5, 'riser', 0.6);
      return (t, lt) => {
        const kb = lerp(1.03, 1.1, ease.inOutCubic(clamp(lt / s.dur)));
        g.frame(lt, kb); before.frame(lt, kb);
        // 0-0.9 s : tout apres (choc) ; puis le rideau « avant » revient de gauche et repart
        let p;
        if (lt < 0.9) p = 0;
        else if (lt < 2.0) p = lerp(0, 0.5, ease.outCubic(clamp((lt - 0.9) / 0.6)));
        else p = lerp(0.5, 0, ease.inCubic(clamp((lt - 2.3) / 0.5)));
        before.wrap.style.clipPath = `inset(0 ${((1 - p) * 100).toFixed(2)}% 0 0)`;
        line.style.left = `${(p * 1080 - 4).toFixed(1)}px`;
        line.style.opacity = p > 0.01 ? 1 : 0;
        la.style.opacity = p > 0.15 ? 1 : 0; lb.style.opacity = lt > 0.15 ? 1 : 0;
        flash.style.opacity = (Math.exp(-lt * 9)).toFixed(3);
        ctx.root.style.transform = shake(ctx.root, lt, 0, 22);
        popWords(cap.words, lt, 0.12, 0.1);
        exitAll(cap.c, lt, s.dur);
        foot.style.opacity = 1;
      };
    },

    // 3) coupes rapides : un look par coupe, zoom choc + nom geant
    v2cuts(s, ctx) {
      const seg = s.dur / s.presets.length;
      const layers = s.presets.map((p, i) => {
        const g = fullGameplay(ctx.root, GP[(s.gp + i) % GP.length], p);
        const cap = caption(ctx.root, `[${p}]`, 'huge', 1150);
        return { g, cap, p };
      });
      const foot = el('div', 'v2foot txt', FOOT, ctx.root);
      const flash = el('div', 'v2flash', null, ctx.root);
      layers.forEach((l, i) => ev(ctx.t0 + i * seg, i ? 'click' : 'pop', 1));
      return (t, lt) => {
        const i = Math.min(layers.length - 1, Math.floor(lt / seg));
        const ls = lt - i * seg;
        layers.forEach((l, k) => {
          const on = k === i;
          l.g.wrap.style.display = on ? 'block' : 'none';
          l.cap.c.style.display = on ? 'block' : 'none';
        });
        const l = layers[i];
        const e = ease.spring(clamp(ls / 0.35), 0.5, 13);
        l.g.frame(lt, lerp(1.22, 1.05, e));
        l.cap.c.style.transform = `scale(${lerp(1.6, 1, e).toFixed(3)}) rotate(${lerp(-6, 0, e).toFixed(2)}deg)`;
        popWords(l.cap.words, ls, 0, 0, true);
        flash.style.opacity = (0.55 * Math.exp(-ls * 14)).toFixed(3);
        foot.style.opacity = 1;
      };
    },

    // 4) phrase choc sur plan d'illustration libre de droits (non filtre)
    v2line(s, ctx) {
      const box = el('div', 'bgv', null, ctx.root);
      const img = el('img', null, null, box);
      el('div', 'tint', null, box);
      const src = BR.length ? BR[s.br % BR.length] : null;
      const cap = caption(ctx.root, s.text, 'big', 620);
      let last = '';
      return (t, lt) => {
        if (src) {
          const i = Math.min(src.count - 1, Math.floor(lt * src.fps));
          const url = `${src.dir}/f_${String(i + 1).padStart(5, '0')}.jpg`;
          if (url !== last) { last = url; img.src = url; IMG_WAITS.add(img.decode().catch(() => {})); }
          img.style.transform = `scale(${lerp(1.0, 1.1, ease.inOutCubic(clamp(lt / s.dur))).toFixed(4)})`;
        }
        popWords(cap.words, lt, 0.05, 0.11);
        exitAll(cap.c, lt, s.dur);
      };
    },

    // 5) appel a l'action : sur le gameplay filtre, boucle propre vers le debut
    v2cta(s, ctx) {
      const g = fullGameplay(ctx.root, GP[s.gp % GP.length], s.preset);
      const dim = el('div', 'v2dim', null, ctx.root);
      const c = el('div', 'col', null, ctx.root);
      Object.assign(c.style, { top: '420px', height: '1100px', gap: '30px' });
      const logo = el('div', null, LOGO(190), c);
      const name = el('div', 'v2cap big', 'ColorTweaks', c); name.style.position = 'relative';
      const pill = el('div', 'v2pill', 'Gratuit · Windows 11', c);
      const btn = el('div', 'btn txt', 'Lien en bio', c);
      [logo, name, pill, btn].forEach((n, i) => ctx.add(n, { at: 0.05 + i * 0.14, kind: 'pop', until: null }));
      return (t, lt) => {
        g.frame(lt, lerp(1.08, 1.0, ease.outCubic(clamp(lt / s.dur))));
        dim.style.opacity = lerp(0, 0.55, ease.outCubic(clamp(lt / 0.4))).toFixed(3);
        if (lt > 1.2) btn.style.transform += ` scale(${(1 + 0.04 * Math.sin((lt - 1.2) * 6)).toFixed(4)})`;
      };
    },
  };
  window.V2_BUILD = V2;
})();
