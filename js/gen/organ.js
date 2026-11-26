/* Survival organs: grungy status icons for survival / horror HUDs: heart, lungs, stomach, brain, head,
   skull, liver, kidneys, intestines, eye, bone and a drop.
   Each organ is a union of simple primitives (paths, thick strokes, ellipses, cut-outs) in a 100-unit
   box. From that mask a signed distance field (exact Euclidean distance transform) is built, so the
   outline, the inset fill and edge roughness work on overlapping primitives.
   Layers: background (empty organ + shadow), fill (the content: flesh, liquid, gradient, hatch or
   solid, clipped to the fill amount with an optional liquid surface), outline (border + anatomical
   detail lines) and a progress map (gray = position along the fill direction) so the engine can fill
   the organ from one texture. Wear: the shared
   noise / grunge stack (js/wear.js). Units are px @ 256 px short side. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;

  /* ---------- shapes (100 × 100 units) ----------
     prims:   f = filled svg path, s = stroked svg path (w = width), e = ellipse [cx, cy, rx, ry, deg],
              cut: true removes it, mx: true mirrors it (x -> 100 - x)
     details: d = line, tube = both edges of a tube (w = tube width), c = circle [cx, cy, r] (fill = dot),
              a = opacity, mx = mirrored copy */
  const BEAN = 'M30 18 C17 18 11 33 11 50 C11 67 17 82 30 82 C40 82 45 74 43 65 C41 59 36.5 56 36.5 50 C36.5 44 41 41 43 35 C45 27 40 18 30 18 Z';
  const COIL = 'M34 36 C46 30 58 30 66 36 C70 42 62 48 50 46 C38 44 31 50 35 57 C41 63 57 61 64 65 C69 71 59 77 48 75 C40 73 35 77 40 83';

  const ORGANS = {
    heart: {
      name: 'Heart',
      prims: [
        { f: 'M46 92 C30 82 15 66 16 48 C17 35 27 28 39 30 C44 31 48 33 51 35 C55 30 63 27 71 29 C83 33 87 48 82 61 C76 75 62 85 46 92 Z' },
        { s: 'M42 33 C40 20 46 10 56 9 C64 8 70 13 70 21 L70 30', w: 9 },
        { s: 'M57 33 C58 25 63 21 74 21', w: 7 },
        { s: 'M31 34 L29 15', w: 7 },
        { s: 'M48 12 L47 4', w: 4 }, { s: 'M56 10 L57 2', w: 4 }, { s: 'M63 11 L66 4', w: 4 },
      ],
      details: [{ d: 'M53 36 C47 50 47 68 55 86' }, { d: 'M29 44 C36 48 44 46 51 41' }, { d: 'M60 40 C68 44 74 52 76 60', a: 0.6 }, { tube: 'M57 33 C58 25 63 21 74 21', w: 7 }],
    },
    lungs: {
      name: 'Lungs',
      prims: [
        { f: 'M44 30 C40 22 30 21 24 33 C16 49 12 72 15 87 C17 94 26 95 34 91 C41 88 45 84 46 78 L46 40 C46 36 45.5 33 44 30 Z' },
        { f: 'M56 30 C60 22 70 21 76 33 C84 49 88 72 85 87 C83 94 74 95 66 91 C61 89 58 86 57.5 82 C63 76 62.5 66 55.5 62 L54 40 C54 36 54.5 33 56 30 Z' },
        { s: 'M50 3 L50 28', w: 7 },
        { s: 'M50 26 C46 29 43 33 40 40', w: 5 },
        { s: 'M50 26 C54 29 57 33 60 40', w: 5 },
      ],
      details: [
        { d: 'M17 62 C26 58 35 57 45 50' }, { d: 'M20 45 C28 46 36 45 45 43' }, { d: 'M83 64 C74 60 66 58 56 52' },
        { d: 'M40 40 C36 48 33 56 31 66', a: 0.6 }, { d: 'M60 40 C64 48 67 56 69 66', a: 0.6 },
        { d: 'M47 8 L53 8' }, { d: 'M47 13 L53 13' }, { d: 'M47 18 L53 18' },
      ],
    },
    stomach: {
      name: 'Stomach',
      prims: [
        { s: 'M41 3 C41 11 42 17 45 22', w: 9 },
        { f: 'M44 18 C56 12 75 16 81 31 C87 46 83 64 73 76 C63 88 46 93 34 87 C28 84 23 81 18 81 C13 81 11 76 13 72 C15 68 21 67 28 67 C38 67 45 61 47 51 C49 41 43 33 39 27 C37 23 39 19 44 18 Z' },
        { s: 'M16 75 C10 78 8 84 10 92', w: 8 },
      ],
      details: [{ d: 'M52 27 C63 31 70 41 71 53' }, { d: 'M45 74 C56 76 65 70 70 61' }, { d: 'M57 21 C68 25 76 36 77 48', a: 0.6 }, { d: 'M16 70 C20 73 22 77 21 82' }],
    },
    brain: {
      name: 'Brain',
      prims: [
        { f: 'M16 52 C12 34 25 16 46 14 C66 12 84 21 88 39 C91 54 84 66 72 68 L58 68 C51 68 45 70 41 72 C34 75 23 71 19 62 C17.5 59 16.4 55.8 16 52 Z' },
        { e: [68, 72, 14, 8.5, -8] },
        { s: 'M57 68 C57 78 55 87 53 95', w: 8 },
      ],
      details: [
        { d: 'M26 32 C32 28 37 36 43 30 C49 24 54 32 60 28 C66 24 71 32 78 30' },
        { d: 'M21 47 C28 41 34 50 41 44 C48 38 54 48 61 42 C67 37 73 46 82 42' },
        { d: 'M27 61 C33 56 39 63 46 58 C52 54 56 60 62 57' },
        { d: 'M50 15 C47 24 52 30 48 38 C45 45 51 52 47 60' },
        { d: 'M57 73 C63 70 71 70 79 74', a: 0.7 }, { d: 'M58 78 C64 76 70 76 76 79', a: 0.7 },
      ],
    },
    head: {
      name: 'Head',
      prims: [
        { e: [50, 38, 21, 26, 0] }, { e: [29, 40, 4, 7, 0] }, { e: [71, 40, 4, 7, 0] },
        { s: 'M50 58 L50 76', w: 19 },
        { f: 'M12 100 C12 88 24 81 39 77 L61 77 C76 81 88 88 88 100 Z' },
      ],
      details: [{ d: 'M39 64 C44 70 56 70 61 64', a: 0.5 }, { d: 'M40 77 C44 80 56 80 60 77', a: 0.5 }],
    },
    skull: {
      name: 'Skull',
      prims: [
        { e: [50, 40, 30, 30, 0] },
        { f: 'M30 56 L70 56 L68 74 C66 80 60 84 50 84 C40 84 34 80 32 74 Z' },
        { e: [38, 49, 8.5, 9.5, 0], cut: true }, { e: [62, 49, 8.5, 9.5, 0], cut: true },
        { f: 'M50 59 L45.5 68 L54.5 68 Z', cut: true },
      ],
      details: [{ d: 'M37 75.5 L63 75.5' }, { d: 'M42 72 L42 80' }, { d: 'M46 72 L46 81.5' }, { d: 'M50 72 L50 82' }, { d: 'M54 72 L54 81.5' }, { d: 'M58 72 L58 80' }, { d: 'M50 12 C47 20 53 26 50 33', a: 0.5 }],
    },
    liver: {
      name: 'Liver',
      prims: [
        { f: 'M10 42 C11 29 32 21 56 21 C75 21 89 25 91 33 C93 42 85 48 74 54 C62 61 50 69 39 72 C29 75 20 69 16 61 C12 55 9.5 49 10 42 Z' },
        { e: [60, 62, 6, 9, 20] },
      ],
      details: [{ d: 'M57 22 C54 36 56 50 61 60' }, { d: 'M22 50 C30 46 40 46 48 50', a: 0.5 }],
    },
    kidneys: {
      name: 'Kidneys',
      prims: [
        { f: BEAN }, { f: BEAN, mx: true },
        { s: 'M39 52 C44 60 46 74 46 96', w: 3.2 }, { s: 'M39 52 C44 60 46 74 46 96', w: 3.2, mx: true },
      ],
      details: [{ d: 'M21 32 C16 43 16 57 21 68', a: 0.7 }, { d: 'M21 32 C16 43 16 57 21 68', a: 0.7, mx: true }, { d: 'M28 43 L35 50 L28 57', a: 0.6 }, { d: 'M28 43 L35 50 L28 57', a: 0.6, mx: true }],
    },
    intestines: {
      name: 'Intestines',
      prims: [
        { s: 'M23 88 L21 40 C21 26 29 20 41 20 L59 20 C71 20 79 26 79 40 L79 70 C79 81 72 87 60 88', w: 12 },
        { s: COIL, w: 8 },
        { s: 'M60 88 C56 90 52 92 50 97', w: 6 },
      ],
      details: [{ tube: COIL, w: 8 }, { d: 'M15 50 L27 50' }, { d: 'M15 66 L27 66' }, { d: 'M35 14 L35 26' }, { d: 'M65 14 L65 26' }, { d: 'M73 50 L85 50' }, { d: 'M73 66 L85 66' }],
    },
    eye: {
      name: 'Eye',
      prims: [{ f: 'M5 50 C22 27 78 27 95 50 C78 73 22 73 5 50 Z' }],
      details: [{ c: [50, 50, 17] }, { c: [50, 50, 7.5], fill: true }, { d: 'M58 43 C60 44 61 46 61.5 48', a: 0.6 }],
    },
    bone: {
      name: 'Bone',
      prims: [{ s: 'M27 27 L73 73', w: 12 }, { e: [21, 31, 9, 9, 0] }, { e: [31, 21, 9, 9, 0] }, { e: [69, 79, 9, 9, 0] }, { e: [79, 69, 9, 9, 0] }],
      details: [{ d: 'M34 40 L60 66', a: 0.4 }],
    },
    drop: {
      name: 'Drop',
      prims: [{ f: 'M50 5 C50 5 19 44 19 64 C19 82 33 95 50 95 C67 95 81 82 81 64 C81 44 50 5 50 5 Z' }],
      details: [{ d: 'M33 64 C33 74 39 81 47 83', a: 0.8 }],
    },
  };

  const pathCache = new Map();
  const P2 = (s) => { let p = pathCache.get(s); if (!p) pathCache.set(s, (p = new Path2D(s))); return p; };

  /* draw primitives (white) in unit space with transform T = [s, tx, ty, flip] */
  function drawPrims(c, prims, T) {
    for (const pr of prims) {
      c.save();
      c.setTransform(T[3] ? -T[0] : T[0], 0, 0, T[0], T[3] ? T[1] + 100 * T[0] : T[1], T[2]);
      if (pr.mx) c.transform(-1, 0, 0, 1, 100, 0);
      c.globalCompositeOperation = pr.cut ? 'destination-out' : 'source-over';
      c.fillStyle = c.strokeStyle = '#fff';
      if (pr.f) c.fill(P2(pr.f));
      else if (pr.s) { c.lineWidth = pr.w; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(P2(pr.s)); }
      else if (pr.e) { c.beginPath(); c.ellipse(pr.e[0], pr.e[1], pr.e[2], pr.e[3], (pr.e[4] || 0) * Math.PI / 180, 0, U.TAU); c.fill(); }
      c.restore();
    }
    // cut-outs apply to everything drawn before them; draw them last so later prims can't refill them
    for (const pr of prims) {
      if (!pr.cut) continue;
      c.save();
      c.setTransform(T[3] ? -T[0] : T[0], 0, 0, T[0], T[3] ? T[1] + 100 * T[0] : T[1], T[2]);
      if (pr.mx) c.transform(-1, 0, 0, 1, 100, 0);
      c.globalCompositeOperation = 'destination-out';
      if (pr.f) c.fill(P2(pr.f));
      else if (pr.e) { c.beginPath(); c.ellipse(pr.e[0], pr.e[1], pr.e[2], pr.e[3], (pr.e[4] || 0) * Math.PI / 180, 0, U.TAU); c.fill(); }
      c.restore();
    }
  }

  function drawDetails(c, details, T, wPx) {
    const s = T[0];
    for (const d of details) {
      c.save();
      c.setTransform(T[3] ? -s : s, 0, 0, s, T[3] ? T[1] + 100 * s : T[1], T[2]);
      if (d.mx) c.transform(-1, 0, 0, 1, 100, 0);
      c.globalAlpha = d.a == null ? 1 : d.a;
      c.strokeStyle = c.fillStyle = '#fff';
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.lineWidth = wPx / s;
      if (d.d) c.stroke(P2(d.d));
      else if (d.c) {
        c.beginPath(); c.arc(d.c[0], d.c[1], d.c[2], 0, U.TAU);
        if (d.fill) c.fill(); else c.stroke();
      } else if (d.tube) {
        // both edges of a tube: stroke wide, then clear the middle (on its own canvas so the rest survives)
        const tc = U.canvas(c.canvas.width, c.canvas.height), t = tc.getContext('2d');
        t.setTransform(c.getTransform());
        t.lineCap = 'round'; t.lineJoin = 'round'; t.strokeStyle = '#fff';
        t.lineWidth = d.w + wPx / s; t.stroke(P2(d.tube));
        t.globalCompositeOperation = 'destination-out';
        t.lineWidth = Math.max(0.1, d.w - wPx / s); t.stroke(P2(d.tube));
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.drawImage(tc, 0, 0);
      }
      c.restore();
    }
  }

  // bounding box of an organ in units (rendered once at low resolution)
  const bboxCache = new Map();
  function bbox(key) {
    let b = bboxCache.get(key);
    if (b) return b;
    const R = 200, c = U.canvas(R, R), g = c.getContext('2d'), s = R / 120;
    drawPrims(g, ORGANS[key].prims, [s, 10 * s, 10 * s, false]);
    const d = g.getImageData(0, 0, R, R).data;
    let x0 = R, y0 = R, x1 = 0, y1 = 0;
    for (let y = 0; y < R; y++) for (let x = 0; x < R; x++) if (d[(y * R + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    b = [x0 / s - 10, y0 / s - 10, (x1 + 1) / s - 10, (y1 + 1) / s - 10];
    bboxCache.set(key, b);
    return b;
  }

  /* exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher), in place on f (0 at features) */
  function edt(f, W, H) {
    const n = Math.max(W, H), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), g = new Float64Array(n);
    const pass = (len, get, set) => {
      for (let q = 0; q < len; q++) g[q] = get(q);
      let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
      for (let q = 1; q < len; q++) {
        let s;
        do { const r = v[k]; s = ((g[q] + q * q) - (g[r] + r * r)) / (2 * q - 2 * r); if (s <= z[k]) k--; else break; } while (k >= 0);
        k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
      }
      k = 0;
      for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + g[r]; }
      for (let q = 0; q < len; q++) set(q, d[q]);
    };
    for (let x = 0; x < W; x++) pass(H, (q) => f[q * W + x], (q, val) => { f[q * W + x] = val; });
    for (let y = 0; y < H; y++) { const o = y * W; pass(W, (q) => f[o + q], (q, val) => { f[o + q] = val; }); }
  }

  /* signed distance (px, negative inside) from an alpha mask */
  function sdfFromAlpha(a, W, H) {
    const N = W * H, BIG = 1e12, fin = new Float64Array(N), fout = new Float64Array(N);
    for (let i = 0; i < N; i++) { const inside = a[i] >= 0.5; fin[i] = inside ? BIG : 0; fout[i] = inside ? 0 : BIG; }
    edt(fin, W, H); edt(fout, W, H);
    const s = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const al = a[i];
      if (al > 0.02 && al < 0.98) s[i] = 0.5 - al;
      else if (al >= 0.5) s[i] = -(Math.sqrt(fin[i]) - 0.5);
      else s[i] = Math.sqrt(fout[i]) - 0.5;
    }
    return s;
  }

  const alphaOf = (cv) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, N = cv.width * cv.height, a = new Float32Array(N);
    for (let i = 0; i < N; i++) a[i] = d[i * 4 + 3] / 255;
    return a;
  };

  // wear stack with grungy defaults
  const WEAR = U.wearParams({ target: [['all', 'Everything'], ['fill', 'Fill only'], ['frame', 'Outline + background only']] });
  const WEAR_DEF = { grunge: 0.28, grungeType: 'chipped', grungeScale: 9, edgeWear: 0.35, dirt: 0.3, scratches: 0.15, brightNoise: 0.12 };
  for (const d of WEAR) if (d.key && d.key in WEAR_DEF) d.default = WEAR_DEF[d.key];

  const FILL_STYLES = [['flesh', 'Flesh (mottled + veins)'], ['liquid', 'Liquid (bubbles)'], ['gradient', 'Gradient'], ['hatch', 'Hatched (ink)'], ['solid', 'Solid']];

  U.register({
    id: 'organ',
    name: 'Survival Organs',
    desc: 'Grungy organ status icons (heart, lungs, stomach, brain, skull, liver …) with a separate fill layer and progress map',
    uses: ['HUD status icons for survival and horror games: health (heart), stamina (lungs), hunger (stomach), sanity (brain), thirst (kidneys, drop) and toxicity (liver); export outline, fill and progress map as aligned layers and fill them in the engine.', 'Inventory and medical UI icons, e.g. for organ items, injuries and status effects.'],
    tags: ['UI', 'Horror'],
    aspect: '1:1',
    bg: 'gray',
    icon: U.icon('<path d="M12 20c-4-2.5-8-6-8-10a4 4 0 0 1 7-2.6A4 4 0 0 1 20 10c0 4-4 7.5-8 10z"/><path d="M8 14h8" opacity=".6"/><path d="M7 16.5c2 1.5 8 1.5 10 0" opacity=".35"/>'),
    exportLayers: (p) => {
      if (!p.split) return null;
      const out = [{ id: 'back', suffix: 'bg' }, { id: 'fill', suffix: 'fill' }, { id: 'frame', suffix: 'outline' }];
      if (p.progressMap) out.push({ id: 'mask', suffix: 'progress' });
      return out;
    },
    params: [
      { type: 'section', label: 'Organ' },
      { key: 'organ', label: 'Organ', type: 'select', default: 'heart', options: Object.keys(ORGANS).map((k) => [k, ORGANS[k].name]) },
      { key: 'margin', label: 'Margin', type: 'range', min: 0, max: 0.35, step: 0.005, default: 0.08, tip: 'Free space around the organ (share of the short side)' },
      { key: 'flip', label: 'Mirror', type: 'bool', default: false },
      { key: 'seed', label: 'Seed', type: 'seed', default: 13 },

      { type: 'section', label: 'Outline' },
      { key: 'borderW', label: 'Outline width', type: 'range', min: 0, max: 24, step: 0.25, default: 6 },
      { key: 'borderColor', label: 'Outline color', type: 'color', default: '#15110f' },
      { key: 'detail', label: 'Detail lines', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, tip: 'Anatomical lines inside the organ (fissures, vessels, folds)' },
      { key: 'detailW', label: 'Detail width', type: 'range', min: 0.5, max: 12, step: 0.25, default: 3, show: (p) => p.detail > 0 },
      { key: 'detailColor', label: 'Detail color', type: 'color', default: '#15110f', show: (p) => p.detail > 0 },
      { key: 'detailCut', label: 'Details cut the fill', type: 'bool', default: true, show: (p) => p.detail > 0, tip: 'The fill layer gets gaps under the detail lines, so separate layers stack cleanly' },
      { key: 'rough', label: 'Edge roughness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Jagged, hand-inked outline' },
      { key: 'roughScale', label: 'Roughness scale', type: 'range', min: 2, max: 60, step: 0.5, default: 18, show: (p) => p.rough > 0 },

      { type: 'section', label: 'Fill' },
      { key: 'value', label: 'Fill amount (preview)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, tip: 'For the combined image; the separate fill layer is exported full unless "Fill layer at 100 %" is off' },
      { key: 'fillDir', label: 'Fills from', type: 'select', default: 'up', options: [['up', 'Bottom (rises)'], ['down', 'Top (drains)'], ['right', 'Left'], ['left', 'Right']] },
      { key: 'fillStyle', label: 'Fill content', type: 'select', default: 'flesh', options: FILL_STYLES },
      { key: 'fillColor', label: 'Fill color', type: 'color', default: '#b2302a' },
      { key: 'fillColor2', label: 'Second color', type: 'color', default: '#4e110e', show: (p) => p.fillStyle !== 'solid', tip: 'Dark / bottom color of the content' },
      { key: 'texScale', label: 'Content scale', type: 'range', min: 1, max: 24, step: 0.5, default: 6, show: (p) => p.fillStyle === 'flesh' || p.fillStyle === 'liquid' || p.fillStyle === 'hatch' },
      { key: 'veins', label: 'Veins', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, show: (p) => p.fillStyle === 'flesh' },
      { key: 'pad', label: 'Fill inset', type: 'range', min: -6, max: 20, step: 0.25, default: 2, tip: 'Gap between the outline and the fill' },
      { key: 'shade', label: 'Inner shade', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Darkens the fill toward its edges' },
      { key: 'rim', label: 'Rim light', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Light edge on the top-left side' },
      { key: 'wave', label: 'Surface wave', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Liquid surface at the fill level' },
      { key: 'waves', label: 'Wave count', type: 'range', min: 0.5, max: 8, step: 0.5, default: 2, show: (p) => p.wave > 0 },
      { key: 'surface', label: 'Surface line', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Bright meniscus line at the fill level' },

      { type: 'section', label: 'Background' },
      { key: 'backColor', label: 'Empty color', type: 'color', default: '#201a18', tip: 'The empty organ behind the fill' },
      { key: 'backAlpha', label: 'Empty opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85 },
      { key: 'shadowAlpha', label: 'Drop shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { key: 'shadowBlur', label: 'Shadow blur', type: 'range', min: 0, max: 30, step: 0.5, default: 6, show: (p) => p.shadowAlpha > 0 },
      { key: 'shadowY', label: 'Shadow offset', type: 'range', min: -20, max: 20, step: 0.5, default: 3, show: (p) => p.shadowAlpha > 0 },
      { key: 'glow', label: 'Outer glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'glowColor', label: 'Glow color', type: 'color', default: '#ff3a2a', show: (p) => p.glow > 0 },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 1, max: 40, step: 0.5, default: 10, show: (p) => p.glow > 0 },

      ...WEAR,

      { type: 'section', label: 'Output' },
      { key: 'split', label: 'Separate layer export', type: 'bool', default: true, tip: 'Download background, fill and outline as separate, aligned PNGs' },
      { key: 'fullFill', label: 'Fill layer at 100 %', type: 'bool', default: true, show: (p) => p.split, tip: 'Export the fill completely full, so the engine can mask it' },
      { key: 'progressMap', label: 'Progress map layer', type: 'bool', default: true, show: (p) => p.split, tip: 'Extra grayscale layer: value = position along the fill direction (0 = start, 1 = end), alpha = fill shape. In the engine: show the fill where value ≤ amount' },
      { key: 'view', label: 'Preview layer', type: 'select', default: 'all', options: [['all', 'Everything (combined)'], ['back', 'Background layer'], ['fill', 'Fill layer'], ['frame', 'Outline layer'], ['mask', 'Progress map']], tip: 'Preview only, the export uses the settings above' },
    ],
    presets: [
      { name: 'Heart · health', group: 'Status', values: {} },
      { name: 'Lungs · stamina', group: 'Status', values: { organ: 'lungs', fillStyle: 'gradient', fillColor: '#7ec4e8', fillColor2: '#1d4a6e', value: 0.6, wave: 0.15, glowColor: '#7ec4e8' } },
      { name: 'Stomach · hunger', group: 'Status', values: { organ: 'stomach', fillStyle: 'liquid', fillColor: '#d89a3a', fillColor2: '#6a3a10', value: 0.45, wave: 0.5 } },
      { name: 'Brain · sanity', group: 'Status', values: { organ: 'brain', fillStyle: 'flesh', fillColor: '#b060c8', fillColor2: '#3a1450', veins: 0.3, value: 0.55 } },
      { name: 'Kidneys · thirst', group: 'Status', values: { organ: 'kidneys', fillStyle: 'liquid', fillColor: '#4ab0e8', fillColor2: '#0e3a5a', value: 0.35, wave: 0.45 } },
      { name: 'Drop · hydration', group: 'Status', values: { organ: 'drop', fillStyle: 'liquid', fillColor: '#5ab8f0', fillColor2: '#103a66', value: 0.65, wave: 0.6, detail: 0.6 } },
      { name: 'Liver · toxicity', group: 'Status', values: { organ: 'liver', fillStyle: 'flesh', fillColor: '#8ab830', fillColor2: '#2a3a0a', veins: 0.4, value: 0.4, glow: 0.35, glowColor: '#9aff3a' } },
      { name: 'Intestines · digestion', group: 'Status', values: { organ: 'intestines', fillStyle: 'flesh', fillColor: '#c87a6a', fillColor2: '#5a241c', veins: 0.25, value: 0.8, detailW: 2.5 } },
      { name: 'Eye · vision', group: 'Status', values: { organ: 'eye', fillStyle: 'gradient', fillColor: '#e8e2d6', fillColor2: '#8a7a6a', value: 1, wave: 0, surface: 0, detailW: 3.5 } },
      { name: 'Bone · fracture', group: 'Status', values: { organ: 'bone', fillStyle: 'gradient', fillColor: '#e6dcc4', fillColor2: '#8a7a5a', value: 1, wave: 0, surface: 0, grungeType: 'cracks', grunge: 0.35 } },
      { name: 'Skull · infection', group: 'Status', values: { organ: 'skull', fillStyle: 'gradient', fillColor: '#ddd2b8', fillColor2: '#6a5a40', value: 0.5, fillDir: 'down', wave: 0.2 } },
      { name: 'Head · concussion', group: 'Status', values: { organ: 'head', fillStyle: 'gradient', fillColor: '#d8a07a', fillColor2: '#6a3a24', value: 0.7 } },
      { name: 'Bloody grunge heart', group: 'Style', values: { fillColor: '#c41e18', fillColor2: '#3a0806', veins: 0.8, grunge: 0.45, dirt: 0.5, dirtColor: '#2a0604', scratches: 0.35, rough: 0.6, value: 0.85 } },
      { name: 'Clean flat icon', group: 'Style', values: { fillStyle: 'solid', fillColor: '#e0453a', rough: 0, grunge: 0, edgeWear: 0, dirt: 0, scratches: 0, brightNoise: 0, shade: 0.25, rim: 0.2, shadowAlpha: 0.3, wave: 0.2 } },
      { name: 'Ink-hatched lungs', group: 'Style', values: { organ: 'lungs', fillStyle: 'hatch', fillColor: '#e8dcc4', fillColor2: '#6a5a48', texScale: 10, backColor: '#e8dcc4', backAlpha: 0.25, shade: 0.2, rim: 0, value: 1, wave: 0, surface: 0 } },
      { name: 'Military stencil', group: 'Style', values: { fillStyle: 'solid', fillColor: '#8a9a5a', borderColor: '#1e2414', detailColor: '#1e2414', backColor: '#2a3020', rough: 0.15, grunge: 0.45, grungeType: 'speckle', edgeWear: 0.5, value: 1, wave: 0, surface: 0, shade: 0.3 } },
      { name: 'Radiation lungs', group: 'Style', values: { organ: 'lungs', fillStyle: 'liquid', fillColor: '#b8ff2a', fillColor2: '#2a5a0a', glow: 0.6, glowColor: '#9aff1a', value: 0.5, wave: 0.6 } },
      { name: 'Frozen heart', group: 'Style', values: { fillStyle: 'flesh', fillColor: '#a8dcf0', fillColor2: '#2a5a7a', veins: 0.3, backColor: '#14222a', glow: 0.3, glowColor: '#8ad8ff', grungeType: 'cracks' } },
    ],

    render(ctx, W, H, p, opts) {
      opts = opts || {};
      const layer = opts.layer || (opts.preview ? p.view || 'all' : 'all');
      const sep = layer !== 'all';
      const amount = sep && p.split && p.fullFill ? 1 : clamp(p.value);
      const org = ORGANS[p.organ] || ORGANS.heart, key = ORGANS[p.organ] ? p.organ : 'heart';
      const S = Math.min(W, H), k = S / 256, N = W * H, seed = p.seed | 0;

      // fit the organ into the canvas (keeping room for outline and shadow)
      const bb = bbox(key), bw = bb[2] - bb[0], bh = bb[3] - bb[1];
      const pad0 = p.margin * S + (p.borderW * k) / 2 + Math.max(p.shadowAlpha > 0 ? (p.shadowBlur + Math.abs(p.shadowY)) * k * 0.6 : 0, p.glow > 0 ? p.glowSize * k * 0.6 : 0);
      const s = Math.max(0.01, Math.min((W - 2 * pad0) / bw, (H - 2 * pad0) / bh));
      const tx = (W - bw * s) / 2 - (p.flip ? 100 - bb[2] : bb[0]) * s, ty = (H - bh * s) / 2 - bb[1] * s;
      const T = [s, tx, ty, !!p.flip];

      // mask -> signed distance field (+ edge roughness)
      const maskCv = U.canvas(W, H);
      drawPrims(maskCv.getContext('2d'), org.prims, T);
      const sdf = sdfFromAlpha(alphaOf(maskCv), W, H);
      if (p.rough > 0) {
        const rs = p.roughScale / S, amp = p.rough * k * 2.2;
        const rn = U.coarseField(W, H, Math.max(64, Math.min(400, p.roughScale * 8)), (x, y) => U.fractal('perlin', x * rs, y * rs, 0, 0, 3, 0.55, 'fbm', seed + 71));
        for (let i = 0; i < N; i++) sdf[i] += (rn[i] - 0.5) * 2 * amp;
      }

      const bwPx = p.borderW * k, inset = bwPx / 2 + p.pad * k;
      // detail lines (clipped to the inside of the outline)
      let det = null;
      if (p.detail > 0 && org.details.length) {
        const dc = U.canvas(W, H);
        drawDetails(dc.getContext('2d'), org.details, T, p.detailW * k);
        det = alphaOf(dc);
        for (let i = 0; i < N; i++) det[i] *= clamp(0.5 - (sdf[i] + bwPx * 0.3)) * p.detail;
      }

      // fill extent along the fill direction (bounding box of the fill region)
      let x0 = W, x1 = 0, y0 = H, y1 = 0;
      for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) if (sdf[i] + inset < 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < x0) { x0 = 0; x1 = W - 1; y0 = 0; y1 = H - 1; }
      x1 += 1; y1 += 1;
      const dir = p.fillDir;
      const tAt = (x, y) => (dir === 'down' ? (y - y0) / (y1 - y0) : dir === 'right' ? (x - x0) / (x1 - x0) : dir === 'left' ? (x1 - x) / (x1 - x0) : (y1 - y) / (y1 - y0));
      const len = dir === 'up' || dir === 'down' ? y1 - y0 : x1 - x0, cross = dir === 'up' || dir === 'down' ? x1 - x0 : y1 - y0;
      const waveAmp = p.wave * k * 6 * Math.sin(Math.PI * clamp(amount)) ** 0.5;

      // fill content noise
      const ts = p.texScale / S;
      const mott = p.fillStyle === 'flesh' || p.fillStyle === 'liquid' ? U.coarseField(W, H, 220, (x, y) => U.fractal('perlin', x * ts, y * ts, 0, 0, 4, 0.55, 'fbm', seed + 5)) : null;
      const veinF = p.fillStyle === 'flesh' && p.veins > 0 ? U.coarseField(W, H, 320, (x, y) => U.fractal('perlin', x * ts * 1.6 + 7.1, y * ts * 1.6, 0, 0, 4, 0.5, 'ridged', seed + 6)) : null;
      const fc1 = U.hex(p.fillColor), fc2 = U.hex(p.fillColor2);
      const shadeW = Math.max(2, 22 * k), rimW = Math.max(1.5, 7 * k);
      const L = [-0.62, -0.78]; // light from the top-left (image space)
      const bcol = U.hex(p.borderColor), dcol = U.hex(p.detailColor), backC = U.hex(p.backColor);

      const build = (what) => {
        const img = new ImageData(W, H), o = img.data;
        for (let y = 0, i = 0; y < H; y++) {
          for (let x = 0; x < W; x++, i++) {
            const sd = sdf[i], k4 = i * 4;
            if (what === 'frame') {
              const bc = bwPx > 0 ? clamp(bwPx / 2 + 0.5 - Math.abs(sd)) : 0, dc = det ? det[i] : 0;
              if (bc <= 0 && dc <= 0) continue;
              const a = bc + dc * (1 - bc);
              const t = a > 0 ? bc / a : 0;
              o[k4] = lerp(dcol[0], bcol[0], t); o[k4 + 1] = lerp(dcol[1], bcol[1], t); o[k4 + 2] = lerp(dcol[2], bcol[2], t); o[k4 + 3] = a * 255;
              continue;
            }
            if (what === 'back') {
              const a = clamp(0.5 - sd) * p.backAlpha;
              if (a <= 0) continue;
              o[k4] = backC[0]; o[k4 + 1] = backC[1]; o[k4 + 2] = backC[2]; o[k4 + 3] = a * 255;
              continue;
            }
            // fill / mask
            const fin = sd + inset;
            let a = clamp(0.5 - fin);
            if (a <= 0) continue;
            if (det && p.detailCut) a *= 1 - det[i];
            const t = tAt(x + 0.5, y + 0.5);
            if (what === 'mask') { const g = clamp(t) * 255; o[k4] = o[k4 + 1] = o[k4 + 2] = g; o[k4 + 3] = a * 255; continue; }
            // clip to the fill amount, with a liquid surface wave
            let level = amount;
            if (amount < 1 && amount > 0) {
              const c = dir === 'up' || dir === 'down' ? (x - x0) / cross : (y - y0) / cross;
              level += (Math.sin(c * U.TAU * p.waves + seed) * 0.6 + Math.sin(c * U.TAU * p.waves * 2.3 + seed * 1.7) * 0.4) * waveAmp / len;
            }
            const dpx = (level - t) * len; // px below the surface (positive = filled)
            if (amount <= 0) continue;
            if (amount < 1) a *= clamp(dpx + 0.5);
            if (a <= 0) continue;
            // content
            const v = clamp((y - y0) / (y1 - y0));
            let f = v, r, g, b;
            if (p.fillStyle === 'flesh') {
              f = clamp(v * 0.45 + (mott[i] - 0.5) * 1.3 + 0.3);
              if (veinF) f = clamp(f + smoothstep(0.72, 0.9, veinF[i]) * p.veins * 0.75);
              f = clamp(f + (U.hash(x, y, seed + 8) - 0.5) * 0.08);
            } else if (p.fillStyle === 'liquid') {
              f = clamp(v * 0.85 + (mott[i] - 0.5) * 0.35);
              const w = U.worley(x * ts * 3, y * ts * 3, 0, 0, seed + 9);
              if (w.id < 0.35) { const rr = 0.12 + w.id * 0.35, ring = 1 - smoothstep(0, 0.05, Math.abs(w.f1 - rr)); f = clamp(f - ring * 0.5); }
            } else if (p.fillStyle === 'hatch') {
              const sp = Math.max(3, S / (p.texScale * 6)), q = U.mod((x + y) / sp, 1);
              f = clamp(v * 0.5 + (q < 0.35 + v * 0.3 ? 0.55 : 0) - 0.1);
            } else if (p.fillStyle === 'solid') f = 0;
            r = lerp(fc1[0], fc2[0], f); g = lerp(fc1[1], fc2[1], f); b = lerp(fc1[2], fc2[2], f);
            // inner shade, rim light (from the SDF gradient), surface line
            const depth = -fin;
            const shade = 1 - p.shade * 0.6 * (1 - smoothstep(0, shadeW, depth));
            r *= shade; g *= shade; b *= shade;
            if (p.rim > 0) {
              const xl = x > 0 ? i - 1 : i, xr = x < W - 1 ? i + 1 : i, yu = y > 0 ? i - W : i, yd = y < H - 1 ? i + W : i;
              const gx = sdf[xr] - sdf[xl], gy = sdf[yd] - sdf[yu], gl = Math.hypot(gx, gy) || 1;
              const facing = clamp((gx / gl) * L[0] + (gy / gl) * L[1]); // outward normal toward the light
              const rimK = facing * (1 - smoothstep(0, rimW, depth)) * p.rim * 0.8;
              r = lerp(r, 255, rimK * 0.6); g = lerp(g, 255, rimK * 0.55); b = lerp(b, 255, rimK * 0.5);
            }
            if (p.surface > 0 && amount < 1) {
              const sl = (1 - smoothstep(0, Math.max(1, 2.2 * k), Math.abs(dpx - 1.2 * k))) * p.surface;
              r = lerp(r, 255, sl * 0.55); g = lerp(g, 255, sl * 0.5); b = lerp(b, 255, sl * 0.45);
            }
            o[k4] = r; o[k4 + 1] = g; o[k4 + 2] = b; o[k4 + 3] = a * 255;
          }
        }
        return U.imageCanvas(img);
      };

      // wear: shared noise fields, edge wear along the whole silhouette
      const wear = U.wearActive(p);
      const F = wear ? U.wearFields(W, H, p, S, p.edgeWear > 0 ? maskCv : null) : null;
      const gOn = (part) => p.grungeOn === 'all' || p.grungeOn === part;
      const finish = (cv, part) => {
        if (!wear) return cv;
        if (gOn(part)) U.wearScratches(cv.getContext('2d'), W, H, p, S);
        return U.imageCanvas(U.wearApply(cv, p, F, { grunge: gOn(part) }));
      };
      const withShadow = (cv) => {
        // drop shadow + glow cast by the whole silhouette, kept outside the organ
        if (!(p.shadowAlpha > 0) && !(p.glow > 0)) return cv;
        const out = U.canvas(W, H), c = out.getContext('2d');
        // a black caster: its anti-aliased rim survives the cut-out below, and must not show as a light fringe
        const blk = U.canvas(W, H), bg = blk.getContext('2d');
        bg.drawImage(maskCv, 0, 0); bg.globalCompositeOperation = 'source-in'; bg.fillStyle = p.borderColor; bg.fillRect(0, 0, W, H);
        const cast = (color, blur, oy) => {
          c.save(); c.shadowColor = color; c.shadowBlur = blur; c.shadowOffsetY = oy; c.drawImage(blk, 0, 0); c.restore();
          c.save(); c.globalCompositeOperation = 'destination-out'; c.drawImage(maskCv, 0, 0); c.restore();
        };
        // canvas shadows draw the caster too: cast from a black copy, then cut the caster out
        if (p.shadowAlpha > 0) cast(`rgba(0,0,0,${p.shadowAlpha})`, p.shadowBlur * k, p.shadowY * k);
        if (p.glow > 0) { const sv = U.canvas(W, H), g = sv.getContext('2d'); g.drawImage(out, 0, 0); c.clearRect(0, 0, W, H); cast(U.rgba(p.glowColor, Math.min(1, p.glow * 1.3)), p.glowSize * k, 0); c.drawImage(sv, 0, 0); }
        c.drawImage(cv, 0, 0);
        return out;
      };

      if (layer === 'mask') {
        const m = build('mask');
        ctx.drawImage(wear ? U.imageCanvas(U.wearApply(m, p, F, { grunge: gOn('fill'), color: false, t: (sx, sy) => tAt(sx, sy) })) : m, 0, 0);
        return;
      }
      const parts = [];
      if (layer === 'all' || layer === 'back') parts.push(withShadow(finish(build('back'), 'frame')));
      if (layer === 'all' || layer === 'fill') parts.push(finish(build('fill'), 'fill'));
      if (layer === 'all' || layer === 'frame') parts.push(finish(build('frame'), 'frame'));
      for (const cv of parts) ctx.drawImage(cv, 0, 0);
    },
  });
})();
