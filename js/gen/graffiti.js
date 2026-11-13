/* Graffiti decal: an abstract graffiti word. Letters come from a small stroke-skeleton alphabet and are
   drawn as thick strokes in layers (second outline, outline, fill), which merges the outline of the
   whole word like a real piece. Styles: bubble (smooth, fat), block, wildstyle (skewed, spiked), finger-painted
   (blood writing: variable pressure, dry tails, drag streaks, flecks).
   Extras: 3D extrusion, highlights, drips, sparkles, arrows, scribbled tags. Amateur look: abstraction
   jitter, line wobble, fill misregistration, overspray, grunge wear and a distortion warp.
   Everything is laid out in a virtual 512-unit space and scaled to fit, so the piece is never clipped. */
(function () {
  'use strict';
  const U = window.UGTG;

  const PALETTES = {
    hiphop: { c1: '#ff3fa4', c2: '#2fd3ff', c3: '#ffe03a', c4: '#8a4dff', c5: '#3dff8a', outline: '#121018', shadow: '#2a1d5c', hi: '#ffffff' },
    retro: { c1: '#ff6b35', c2: '#f7c548', c3: '#2ec4b6', c4: '#e84a5f', c5: '#a06cd5', outline: '#1b1b2f', shadow: '#3a2d5c', hi: '#fff6e0' },
    toxic: { c1: '#b6ff1a', c2: '#39ff88', c3: '#00e0c6', c4: '#d4ff00', c5: '#7cff3a', outline: '#0d1a05', shadow: '#4b1d7a', hi: '#f4ffe0' },
    fire: { c1: '#ffdd00', c2: '#ff9500', c3: '#ff4b1f', c4: '#ff1e56', c5: '#ffb700', outline: '#1a0505', shadow: '#5c0f1f', hi: '#fff8d0' },
    ice: { c1: '#e0f7ff', c2: '#7fdcff', c3: '#3aa0ff', c4: '#b5a8ff', c5: '#ffffff', outline: '#0a1a33', shadow: '#1d3c78', hi: '#ffffff' },
    pastel: { c1: '#ffb3d1', c2: '#b3e5ff', c3: '#fff3a6', c4: '#c9b3ff', c5: '#b8ffd9', outline: '#3a2e4f', shadow: '#8f7fb8', hi: '#ffffff' },
    neon: { c1: '#ff2bd6', c2: '#00f0ff', c3: '#fffb00', c4: '#7a00ff', c5: '#00ff6a', outline: '#05010d', shadow: '#22114a', hi: '#ffffff' },
    mono: { c1: '#f2f2f2', c2: '#cfcfcf', c3: '#9a9a9a', c4: '#ffffff', c5: '#e0e0e0', outline: '#111111', shadow: '#555555', hi: '#ffffff' },
    // blood writing: fresh (wet, bright) and dried (dark, brownish)
    blood: { c1: '#8a0b08', c2: '#6e0806', c3: '#9a120d', c4: '#5a0605', c5: '#7c0a07', outline: '#2a0202', shadow: '#1a0000', hi: '#d8483a' },
    driedblood: { c1: '#4e0a07', c2: '#3c0806', c3: '#5a120c', c4: '#341008', c5: '#461008', outline: '#1a0603', shadow: '#120402', hi: '#7a3a2a' },
  };
  const one = (c, extra) => Object.assign({ palette: 'custom', c1: c, c2: c, c3: c, c4: c, c5: c }, extra);
  const PAL_OPTS = [['hiphop', 'Hip-hop'], ['retro', 'Retro 80s'], ['toxic', 'Toxic'], ['fire', 'Fire'], ['ice', 'Ice'], ['pastel', 'Pastel'], ['neon', 'Neon'], ['mono', 'Mono'], ['blood', 'Blood (fresh)'], ['driedblood', 'Blood (dried)'], ['custom', 'Custom']];

  /* stroke skeletons: polylines in a unit box (x 0..1, y 0 top .. 1 baseline); w = advance width */
  const O = [[0.5, 0], [0.88, 0.15], [1, 0.5], [0.88, 0.85], [0.5, 1], [0.12, 0.85], [0, 0.5], [0.12, 0.15], [0.5, 0]];
  const FONT = {
    A: [[[0, 1], [0.5, 0], [1, 1]], [[0.22, 0.62], [0.78, 0.62]]],
    B: [[[0, 1], [0, 0], [0.62, 0], [0.86, 0.2], [0.62, 0.45], [0, 0.45]], [[0.62, 0.45], [0.92, 0.7], [0.7, 1], [0, 1]]],
    C: [[[0.95, 0.15], [0.6, 0], [0.25, 0.05], [0, 0.5], [0.25, 0.95], [0.6, 1], [0.95, 0.85]]],
    D: [[[0, 0], [0, 1], [0.55, 1], [0.95, 0.65], [0.95, 0.35], [0.55, 0], [0, 0]]],
    E: [[[0.95, 0], [0, 0], [0, 1], [0.95, 1]], [[0, 0.5], [0.72, 0.5]]],
    F: [[[0.95, 0], [0, 0], [0, 1]], [[0, 0.5], [0.7, 0.5]]],
    G: [[[0.95, 0.15], [0.6, 0], [0.2, 0.05], [0, 0.5], [0.25, 0.97], [0.65, 1], [0.95, 0.8], [0.95, 0.55], [0.55, 0.55]]],
    H: [[[0, 0], [0, 1]], [[1, 0], [1, 1]], [[0, 0.5], [1, 0.5]]],
    I: [[[0.5, 0], [0.5, 1]]],
    J: [[[0.9, 0], [0.9, 0.72], [0.62, 1], [0.25, 0.95], [0.05, 0.7]]],
    K: [[[0, 0], [0, 1]], [[0.95, 0], [0.05, 0.56]], [[0.36, 0.38], [1, 1]]],
    L: [[[0, 0], [0, 1], [0.9, 1]]],
    M: [[[0, 1], [0, 0], [0.5, 0.55], [1, 0], [1, 1]]],
    N: [[[0, 1], [0, 0], [1, 1], [1, 0]]],
    O: [O],
    P: [[[0, 1], [0, 0], [0.7, 0], [0.95, 0.25], [0.7, 0.5], [0, 0.5]]],
    Q: [O, [[0.6, 0.7], [1, 1.05]]],
    R: [[[0, 1], [0, 0], [0.7, 0], [0.95, 0.25], [0.7, 0.5], [0, 0.5]], [[0.45, 0.5], [1, 1]]],
    S: [[[0.95, 0.12], [0.6, 0], [0.2, 0.05], [0.05, 0.25], [0.3, 0.45], [0.75, 0.55], [0.95, 0.75], [0.8, 0.95], [0.4, 1], [0.05, 0.88]]],
    T: [[[0, 0], [1, 0]], [[0.5, 0], [0.5, 1]]],
    U: [[[0, 0], [0, 0.7], [0.25, 1], [0.75, 1], [1, 0.7], [1, 0]]],
    V: [[[0, 0], [0.5, 1], [1, 0]]],
    W: [[[0, 0], [0.25, 1], [0.5, 0.45], [0.75, 1], [1, 0]]],
    X: [[[0, 0], [1, 1]], [[1, 0], [0, 1]]],
    Y: [[[0, 0], [0.5, 0.5], [1, 0]], [[0.5, 0.5], [0.5, 1]]],
    Z: [[[0, 0], [1, 0], [0, 1], [1, 1]]],
    0: [O, [[0.25, 0.8], [0.75, 0.2]]],
    1: [[[0.15, 0.25], [0.55, 0], [0.55, 1]], [[0.15, 1], [0.95, 1]]],
    2: [[[0.05, 0.2], [0.3, 0.02], [0.7, 0.02], [0.95, 0.25], [0.85, 0.5], [0.05, 1], [0.95, 1]]],
    3: [[[0.05, 0.1], [0.4, 0], [0.85, 0.1], [0.9, 0.3], [0.5, 0.48]], [[0.5, 0.48], [0.95, 0.65], [0.9, 0.9], [0.5, 1], [0.05, 0.9]]],
    4: [[[0.75, 1], [0.75, 0], [0, 0.7], [1, 0.7]]],
    5: [[[0.95, 0], [0.1, 0], [0.05, 0.45], [0.6, 0.4], [0.95, 0.65], [0.85, 0.92], [0.45, 1], [0.05, 0.9]]],
    6: [[[0.9, 0.08], [0.5, 0], [0.15, 0.2], [0, 0.6], [0.2, 0.95], [0.6, 1], [0.95, 0.75], [0.75, 0.5], [0.3, 0.5], [0.05, 0.65]]],
    7: [[[0, 0], [1, 0], [0.35, 1]]],
    8: [[[0.5, 0.47], [0.15, 0.3], [0.2, 0.05], [0.5, 0], [0.8, 0.05], [0.85, 0.3], [0.5, 0.47]], [[0.5, 0.47], [0.1, 0.7], [0.2, 0.95], [0.5, 1], [0.8, 0.95], [0.9, 0.7], [0.5, 0.47]]],
    9: [[[0.1, 0.92], [0.5, 1], [0.85, 0.8], [1, 0.4], [0.8, 0.05], [0.4, 0], [0.05, 0.25], [0.25, 0.5], [0.7, 0.5], [0.95, 0.35]]],
    '!': [[[0.5, 0], [0.5, 0.62]], [[0.5, 0.93], [0.5, 0.95]]],
    '?': [[[0.05, 0.2], [0.3, 0], [0.75, 0], [0.95, 0.25], [0.5, 0.5], [0.5, 0.65]], [[0.5, 0.93], [0.5, 0.95]]],
    '.': [[[0.5, 0.93], [0.5, 0.95]]],
    ',': [[[0.55, 0.88], [0.4, 1.12]]],
    ':': [[[0.5, 0.35], [0.5, 0.37]], [[0.5, 0.93], [0.5, 0.95]]],
    ';': [[[0.5, 0.35], [0.5, 0.37]], [[0.55, 0.88], [0.4, 1.12]]],
    "'": [[[0.5, 0], [0.5, 0.28]]],
    '"': [[[0.25, 0], [0.25, 0.28]], [[0.75, 0], [0.75, 0.28]]],
    '-': [[[0.1, 0.55], [0.9, 0.55]]],
    '+': [[[0.08, 0.55], [0.92, 0.55]], [[0.5, 0.15], [0.5, 0.95]]],
    '=': [[[0.1, 0.4], [0.9, 0.4]], [[0.1, 0.72], [0.9, 0.72]]],
    _: [[[0, 1], [1, 1]]],
    '/': [[[0.1, 1], [0.9, 0]]],
    '\\': [[[0.1, 0], [0.9, 1]]],
    '*': [[[0.5, 0.12], [0.5, 0.78]], [[0.2, 0.28], [0.8, 0.62]], [[0.8, 0.28], [0.2, 0.62]]],
    '#': [[[0.38, 0], [0.25, 1]], [[0.78, 0], [0.65, 1]], [[0.05, 0.33], [0.95, 0.33]], [[0.02, 0.67], [0.92, 0.67]]],
    '&': [[[1, 1], [0.25, 0.4], [0.2, 0.15], [0.45, 0], [0.7, 0.15], [0.6, 0.35], [0.1, 0.65], [0.15, 0.92], [0.45, 1], [0.75, 0.85], [0.95, 0.6]]],
    '@': [[[0.7, 0.62], [0.66, 0.35], [0.45, 0.32], [0.33, 0.5], [0.45, 0.68], [0.7, 0.62], [0.86, 0.7], [1, 0.5], [0.86, 0.15], [0.5, 0], [0.15, 0.15], [0, 0.5], [0.15, 0.85], [0.5, 1], [0.8, 0.92]]],
    $: [[[0.95, 0.12], [0.6, 0], [0.2, 0.05], [0.05, 0.25], [0.3, 0.45], [0.75, 0.55], [0.95, 0.75], [0.8, 0.95], [0.4, 1], [0.05, 0.88]], [[0.5, -0.12], [0.5, 1.12]]],
    '%': [[[0.9, 0], [0.1, 1]], [[0.2, 0.02], [0.36, 0.15], [0.2, 0.3], [0.04, 0.15], [0.2, 0.02]], [[0.8, 0.7], [0.96, 0.84], [0.8, 0.98], [0.64, 0.84], [0.8, 0.7]]],
    '(': [[[0.75, -0.05], [0.35, 0.2], [0.25, 0.5], [0.35, 0.8], [0.75, 1.05]]],
    ')': [[[0.25, -0.05], [0.65, 0.2], [0.75, 0.5], [0.65, 0.8], [0.25, 1.05]]],
    '[': [[[0.8, -0.05], [0.3, -0.05], [0.3, 1.05], [0.8, 1.05]]],
    ']': [[[0.2, -0.05], [0.7, -0.05], [0.7, 1.05], [0.2, 1.05]]],
    '<': [[[0.9, 0.15], [0.1, 0.55], [0.9, 0.95]]],
    '>': [[[0.1, 0.15], [0.9, 0.55], [0.1, 0.95]]],
    '^': [[[0.1, 0.45], [0.5, 0], [0.9, 0.45]]],
    '~': [[[0.05, 0.6], [0.25, 0.45], [0.5, 0.58], [0.75, 0.7], [0.95, 0.52]]],
  };
  const WIDTH = { I: 0.3, M: 1.25, W: 1.3, 1: 0.7, '!': 0.3, '.': 0.3, ',': 0.3, ':': 0.3, ';': 0.3, "'": 0.25, '"': 0.5, '-': 0.7, '/': 0.7, '\\': 0.7, '(': 0.5, ')': 0.5, '[': 0.5, ']': 0.5, '<': 0.75, '>': 0.75, '^': 0.8, '@': 1.15, '%': 1.05 };
  const RANDOM_SET = 'ABCDEFGHKMNOPRSTUWXYZ'; // letters that look good in a random word

  /* text -> drawable characters: uppercase, accents stripped (Ä -> A), ß -> SS, unknown signs dropped */
  const normalize = (txt) => txt.toUpperCase().replace(/ß/g, 'SS').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split('').filter((ch) => ch === ' ' || FONT[ch]).join('').replace(/ +/g, ' ').trim();

  /* auto line break: balanced rows so the piece stays roughly square; breaks at spaces, splits long words */
  function wrap(chars) {
    const N = chars.filter((c) => c !== ' ').length;
    const perRow0 = Math.max(5, Math.round(Math.sqrt(1.8 * N)));
    const target = Math.ceil(N / Math.max(1, Math.round(N / perRow0)));
    const rows = [];
    let line = '';
    for (let w of chars.join('').split(' ').filter(Boolean)) {
      while (w.length > Math.max(12, target * 1.8)) { // much too long for any row: hard split
        if (line) { rows.push(line); line = ''; }
        rows.push(w.slice(0, target));
        w = w.slice(target);
      }
      if (!line) line = w;
      else if ((line + w).length <= target + 1) line += ' ' + w;
      else { rows.push(line); line = w; }
    }
    if (line) rows.push(line);
    return rows.map((r) => r.split(''));
  }

  // open Catmull-Rom through a polyline (closed when it ends where it starts)
  function smooth(pts, steps) {
    const closed = pts.length > 2 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1];
    const P = closed ? pts.slice(0, -1) : pts, n = P.length, out = [];
    const at = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      for (let s = 0; s < steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
      }
    }
    out.push(closed ? out[0] : P[n - 1]);
    return out;
  }
  /* finger-painted stroke: resampled path with a pressure curve (full blob at the start, running dry towards
     the end, noisy in between), dry gaps in the tail and small flecks along the edges */
  function fingerStroke(pl, T, jr, seed) {
    const pts = [pl[0]], step = Math.max(1.5, T * 0.3);
    let acc = 0;
    for (let i = 1; i < pl.length; i++) {
      const [ax, ay] = pl[i - 1], [bx, by] = pl[i], d = Math.hypot(bx - ax, by - ay);
      for (let t = step - acc; t < d; t += step) pts.push([ax + ((bx - ax) * t) / d, ay + ((by - ay) * t) / d]);
      acc = (acc + d) % step;
    }
    pts.push(pl[pl.length - 1]);
    const n = pts.length, start = 0.95 + jr() * 0.25, dry = 0.35 + jr() * 0.35;
    const pr = pts.map((_, i) => {
      const t = n > 1 ? i / (n - 1) : 0;
      const bulge = 1 + 0.25 * Math.exp(-t * 14); // blob where the finger touched down
      return Math.max(0.28, start * bulge * (1 - dry * Math.pow(t, 1.4)) * (0.82 + 0.36 * (U.perlin(i * 0.3, seed * 0.37, 0, 0, seed) * 0.5 + 0.5)));
    });
    const gap = pts.map((_, i) => { const t = n > 1 ? i / (n - 1) : 0; return t > 0.72 && jr() < (t - 0.72) * 1.6; }); // dry, broken tail
    const flecks = [];
    for (let i = 0; i < n; i += 2) if (jr() < 0.18) {
      const a = jr() * U.TAU, r = T * pr[i] * (0.95 + jr() * 0.7);
      flecks.push([pts[i][0] + Math.cos(a) * r, pts[i][1] + Math.sin(a) * r, T * (0.05 + jr() * 0.12)]);
    }
    return { pts, pr, gap, flecks };
  }
  function paintFinger(c, L, extra, style, T) {
    c.save();
    c.lineCap = c.lineJoin = 'round';
    c.strokeStyle = c.fillStyle = style;
    for (const b of L.brush) {
      for (let i = 1; i < b.pts.length; i++) {
        if (b.gap[i] && extra === 0) continue;
        c.lineWidth = Math.max(0.5, (T * (b.pr[i - 1] + b.pr[i]) * 0.5 + extra) * 2);
        c.beginPath(); c.moveTo(b.pts[i - 1][0], b.pts[i - 1][1]); c.lineTo(b.pts[i][0], b.pts[i][1]); c.stroke();
      }
      for (const [x, y, r] of b.flecks) { c.beginPath(); c.arc(x, y, r + extra, 0, U.TAU); c.fill(); }
    }
    if (extra === 0) { // drag streaks: thin darker / lighter lines along the stroke, like finger lines in wet paint
      for (const b of L.brush) {
        for (const [off, col, w] of [[-0.42, 'rgba(0,0,0,0.28)', 0.13], [0.38, 'rgba(0,0,0,0.22)', 0.1], [-0.12, 'rgba(255,255,255,0.10)', 0.08], [0.15, 'rgba(0,0,0,0.16)', 0.07]]) {
          c.strokeStyle = col;
          for (let i = 1; i < b.pts.length; i++) {
            if (b.gap[i]) continue;
            const [ax, ay] = b.pts[i - 1], [bx, by] = b.pts[i], dl = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / dl, ny = (bx - ax) / dl;
            const oa = off * T * b.pr[i - 1], ob = off * T * b.pr[i];
            c.lineWidth = Math.max(0.4, T * w * b.pr[i]);
            c.beginPath(); c.moveTo(ax + nx * oa, ay + ny * oa); c.lineTo(bx + nx * ob, by + ny * ob); c.stroke();
          }
        }
      }
    }
    c.restore();
  }

  const trace = (c, poly, close) => {
    c.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) c.lineTo(poly[i][0], poly[i][1]);
    if (close) c.closePath();
  };

  U.register({
    id: 'graffiti',
    name: 'Graffiti & Blood Writing',
    desc: 'Graffiti words or grungy, dripping bloody writing: outlines, 3D, drips, wobble and grunge',
    tags: ['Decals', 'Texturing'],
    icon: U.icon('<path d="M3 17c1-6 3-9 5-9s2 5 0 9M3.5 13.5h4.5"/><path d="M11 17V8c3 0 4 1 4 2.5S13 13 11 13c3 0 4.5 1 4.5 2.2S14 17 11 17z"/><path d="M18 9l3 8M21 9l-3 8"/>'),
    params: [
      { type: 'section', label: 'Word' },
      { key: 'word', label: 'Text', type: 'text', default: '', max: 48, placeholder: 'random', tip: 'Letters, numbers and signs (! ? . , - + = / * # & @ $ % : ; quotes, brackets …). Lowercase and accents are converted. Leave empty for a random abstract word from the seed' },
      { key: 'letters', label: 'Random letters', type: 'int', min: 2, max: 24, default: 5, show: (p) => !p.word },
      { key: 'style', label: 'Lettering', type: 'select', default: 'bubble', options: [['bubble', 'Bubble (round, fat)'], ['block', 'Block'], ['finger', 'Finger-painted (blood)'], ['wild', 'Wildstyle (skewed, spiked)']] },
      { key: 'abstract', label: 'Abstraction', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: '0 = readable letters, 1 = letters dissolve into abstract shapes' },
      { key: 'weight', label: 'Letter weight', type: 'range', min: 0.05, max: 0.28, step: 0.005, default: 0.15, tip: 'Stroke thickness relative to letter height' },
      { key: 'layout', label: 'Layout', type: 'select', default: 'auto', options: [['auto', 'Auto line break'], ['row', 'One row'], ['arc', 'Arc']], tip: 'Auto breaks the text into balanced rows (at spaces where possible) so the piece stays roughly square' },
      { key: 'overlap', label: 'Letter overlap', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'bounce', label: 'Bounce', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Letters jump up and down off the baseline' },
      { key: 'rotJitter', label: 'Letter rotation', type: 'range', min: 0, max: 35, step: 1, default: 10 },
      { key: 'sizeVar', label: 'Size variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: 'tilt', label: 'Tilt', type: 'range', min: -30, max: 30, step: 1, default: -6 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 9 },
      { type: 'section', label: 'Outline & 3D' },
      { key: 'outlineW', label: 'Outline width', type: 'range', min: 0, max: 20, step: 0.1, default: 6, tip: 'Units of a 512 piece; the piece is scaled to fit' },
      { key: 'outerW', label: 'Second outline', type: 'range', min: 0, max: 20, step: 0.1, default: 0, tip: 'Sticker-style border around the outline' },
      { key: 'depth', label: '3D extrusion', type: 'range', min: 0, max: 40, step: 0.5, default: 12 },
      { key: 'depthAngle', label: 'Extrusion angle', type: 'range', min: -180, max: 180, step: 1, default: 40, show: (p) => p.depth > 0 },
      { key: 'innerLine', label: 'Inner line', type: 'range', min: 0, max: 6, step: 0.1, default: 0, tip: 'A thin line just inside every letter' },
      { type: 'section', label: 'Fill & details' },
      { key: 'fillStyle', label: 'Fill', type: 'select', default: 'gradient', options: [['solid', 'Solid'], ['gradient', 'Two-color fade'], ['split', 'Split (two-tone)'], ['dots', 'Polka dots']] },
      { key: 'highlights', label: 'Highlights', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, tip: 'Shine strokes and dots on the letters' },
      { key: 'drips', label: 'Drips', type: 'int', min: 0, max: 60, default: 5 },
      { key: 'dripLen', label: 'Drip length', type: 'range', min: 5, max: 320, step: 1, default: 60, show: (p) => p.drips > 0 },
      { key: 'stars', label: 'Sparkles', type: 'int', min: 0, max: 20, default: 3 },
      { key: 'arrows', label: 'Arrows', type: 'int', min: 0, max: 8, default: 1 },
      { key: 'scribbles', label: 'Scribbled tags', type: 'int', min: 0, max: 20, default: 2, tip: 'Thin wobbly loops behind the piece' },
      { type: 'section', label: 'Colors' },
      { key: 'palette', label: 'Palette', type: 'select', default: 'hiphop', options: PAL_OPTS, apply: (v, p) => { if (PALETTES[v]) Object.assign(p, PALETTES[v]); } },
      { key: 'c1', label: 'Color 1', type: 'color', default: PALETTES.hiphop.c1 },
      { key: 'c2', label: 'Color 2', type: 'color', default: PALETTES.hiphop.c2 },
      { key: 'c3', label: 'Color 3', type: 'color', default: PALETTES.hiphop.c3 },
      { key: 'c4', label: 'Color 4', type: 'color', default: PALETTES.hiphop.c4 },
      { key: 'c5', label: 'Color 5', type: 'color', default: PALETTES.hiphop.c5 },
      { key: 'outline', label: 'Outline', type: 'color', default: PALETTES.hiphop.outline },
      { key: 'outer', label: 'Second outline', type: 'color', default: '#ffffff', show: (p) => p.outerW > 0 },
      { key: 'shadow', label: '3D / shadow', type: 'color', default: PALETTES.hiphop.shadow },
      { key: 'hi', label: 'Highlight', type: 'color', default: PALETTES.hiphop.hi },
      { key: 'desat', label: 'Desaturate', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Blends the whole piece toward greyscale (by perceived brightness); the wall keeps its color' },
      { type: 'section', label: 'Amateur look' },
      { key: 'wobble', label: 'Line wobble', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'misalign', label: 'Fill misregistration', type: 'range', min: 0, max: 20, step: 0.1, default: 3, tip: 'Shifts the fill against its outline, like a hasty fill-in' },
      { key: 'overspray', label: 'Overspray', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Soft spray halo and speckles around the paint' },
      { key: 'grunge', label: 'Grunge / wear', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Worn-off paint from a noise mask' },
      { key: 'distort', label: 'Distortion', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Warps the finished piece with noise' },
      { type: 'section', label: 'Output' },
      { key: 'bgMode', label: 'Background', type: 'select', default: 'transparent', options: [['transparent', 'Transparent (decal)'], ['wall', 'Wall color']] },
      { key: 'wall', label: 'Wall color', type: 'color', default: '#8e8a84', show: (p) => p.bgMode === 'wall' },
    ],
    presets: [
      // Realistic
      { name: 'Street piece', group: 'Realistic', values: { letters: 5, style: 'block', abstract: 0.3, depth: 14, drips: 7, grunge: 0.35, overspray: 0.5, bgMode: 'wall', seed: 21 } },
      { name: 'Weathered wall piece', group: 'Realistic', values: { palette: 'retro', letters: 6, abstract: 0.4, depth: 10, drips: 4, grunge: 0.75, distort: 0.35, overspray: 0.45, bgMode: 'wall', wall: '#7c776f', seed: 4 } },
      { name: 'Quick throw-up', group: 'Realistic', values: { palette: 'mono', letters: 3, style: 'bubble', weight: 0.22, overlap: 0.6, fillStyle: 'solid', depth: 0, highlights: 0.2, drips: 6, dripLen: 90, stars: 0, arrows: 0, scribbles: 1, wobble: 0.6, misalign: 7, overspray: 0.6, grunge: 0.3, seed: 12 } },
      { name: 'Dripping tag wall', group: 'Realistic', values: { palette: 'fire', letters: 5, style: 'bubble', depth: 6, drips: 18, dripLen: 120, stars: 1, arrows: 0, scribbles: 6, overspray: 0.55, grunge: 0.4, bgMode: 'wall', wall: '#5f6266', seed: 8 } },
      { name: 'Wildstyle burner', group: 'Realistic', values: { palette: 'neon', style: 'wild', letters: 6, abstract: 0.55, overlap: 0.5, weight: 0.12, depth: 16, depthAngle: 30, innerLine: 1.5, arrows: 4, stars: 4, drips: 3, wobble: 0.15, misalign: 1, overspray: 0.4, grunge: 0.15, seed: 31 } },
      { name: 'Crew tag with numbers', group: 'Realistic', values: { word: 'Crew #2026!', style: 'block', abstract: 0.15, bounce: 0.25, depth: 12, drips: 5, seed: 33 } },
      { name: 'Long shout-out (auto wrap)', group: 'Stylized', values: { word: 'Just one more texture?!', style: 'bubble', weight: 0.17, abstract: 0.15, overlap: 0.45, depth: 10, drips: 4, stars: 4, arrows: 0, scribbles: 0, seed: 44 } },
      { name: 'Legible block letters', group: 'Realistic', values: { word: 'JOMT', style: 'block', abstract: 0.05, bounce: 0.15, rotJitter: 4, sizeVar: 0.1, depth: 12, drips: 3, wobble: 0.1, misalign: 1, seed: 3 } },
      // Stylized
      { name: 'Bubble throwie', group: 'Stylized', values: { palette: 'hiphop', letters: 4, style: 'bubble', weight: 0.21, overlap: 0.55, abstract: 0.2, depth: 14, highlights: 1, drips: 3, stars: 3, arrows: 0, scribbles: 0, wobble: 0.1, misalign: 0, grunge: 0, distort: 0, overspray: 0.15, seed: 5 } },
      { name: 'Sticker bomb', group: 'Stylized', values: { palette: 'pastel', letters: 4, style: 'bubble', weight: 0.2, outerW: 9, outer: '#ffffff', depth: 0, fillStyle: 'dots', highlights: 0.8, drips: 0, stars: 2, arrows: 1, scribbles: 0, wobble: 0.05, misalign: 0, overspray: 0, grunge: 0, distort: 0, seed: 14 } },
      { name: 'Kid doodle', group: 'Stylized', values: { palette: 'retro', letters: 4, style: 'bubble', abstract: 0.7, bounce: 0.8, rotJitter: 25, fillStyle: 'solid', depth: 0, outlineW: 5, highlights: 0.2, drips: 1, stars: 4, arrows: 2, scribbles: 4, wobble: 1, misalign: 10, overspray: 0, grunge: 0.1, distort: 0.6, seed: 2 } },
      { name: 'Comic shout', group: 'Stylized', values: { palette: 'fire', style: 'wild', letters: 4, abstract: 0.25, weight: 0.17, sizeVar: 0.5, depth: 10, fillStyle: 'split', highlights: 0.6, drips: 0, stars: 8, arrows: 0, scribbles: 0, wobble: 0.1, misalign: 0, overspray: 0, grunge: 0, distort: 0.1, seed: 17 } },
      { name: 'Arc of bubbles', group: 'Stylized', values: { palette: 'ice', layout: 'arc', letters: 7, style: 'bubble', weight: 0.19, depth: 12, depthAngle: 60, innerLine: 1.5, drips: 4, stars: 3, arrows: 0, wobble: 0.2, grunge: 0.1, seed: 6 } },
      { name: 'Pastel cutie', group: 'Stylized', values: { palette: 'pastel', letters: 5, style: 'bubble', weight: 0.2, outlineW: 6, depth: 8, highlights: 1, drips: 2, stars: 5, arrows: 0, scribbles: 0, wobble: 0.1, misalign: 1, overspray: 0.2, grunge: 0, distort: 0, seed: 23 } },
      { name: 'Black & white stencil', group: 'Stylized', values: { palette: 'mono', letters: 5, style: 'block', fillStyle: 'split', depth: 8, shadow: '#111111', highlights: 0.4, drips: 4, stars: 2, arrows: 1, grunge: 0.45, overspray: 0.3, seed: 19 } },
      { name: 'Arrow storm', group: 'Stylized', values: { palette: 'retro', style: 'wild', letters: 4, abstract: 0.45, arrows: 8, stars: 2, drips: 2, depth: 12, seed: 27 } },
      // Sci-fi
      { name: 'Toxic slime piece', group: 'Sci-fi', values: { palette: 'toxic', letters: 5, style: 'bubble', abstract: 0.5, weight: 0.19, depth: 12, drips: 14, dripLen: 110, stars: 2, arrows: 0, overspray: 0.6, grunge: 0.2, seed: 13 } },
      { name: 'Cyberpunk neon tag', group: 'Sci-fi', values: { palette: 'neon', style: 'wild', letters: 6, abstract: 0.5, weight: 0.11, outlineW: 5, outerW: 3, outer: '#00f0ff', depth: 10, innerLine: 1.2, arrows: 3, stars: 5, drips: 3, overspray: 0.8, grunge: 0.1, bgMode: 'wall', wall: '#14121c', seed: 41 } },
      { name: 'Holo ice crew', group: 'Sci-fi', values: { palette: 'ice', style: 'block', letters: 6, abstract: 0.3, fillStyle: 'split', depth: 18, depthAngle: -40, innerLine: 1.5, stars: 6, arrows: 2, drips: 0, wobble: 0.05, misalign: 0, overspray: 0.4, grunge: 0, distort: 0, seed: 29 } },
      // Bloody writing: thin, shaky finger-painted strokes, long runny drips, heavy grunge and distortion
      ...[
        ['GET OUT', 'blood', { seed: 81 }],
        ['HELP ME', 'blood', { seed: 82, weight: 0.085 }],
        ['RUN', 'blood', { seed: 83, weight: 0.14, drips: 34, dripLen: 240 }],
        ['I SEE YOU', 'blood', { seed: 84, weight: 0.08, wobble: 0.85, distort: 0.5 }],
        ['BEHIND YOU', 'blood', { seed: 85, highlights: 0.4, drips: 28 }],
        ['NO ESCAPE', 'driedblood', { seed: 86, grunge: 0.42, drips: 14, dripLen: 110 }],
        ['IIII IIII IIII', 'driedblood', { seed: 87, weight: 0.075, drips: 10, dripLen: 90, rotJitter: 14, layout: 'row' }],
        ['THEY ARE HERE', 'blood', { seed: 88, weight: 0.09, bgMode: 'wall', wall: '#8f8a80' }],
        ['DEAD', 'driedblood', { seed: 89, weight: 0.16, bgMode: 'wall', wall: '#6e6a62', grunge: 0.45, drips: 18 }],
      ].map(([word, pal, extra]) => ({
        name: (word === 'IIII IIII IIII' ? 'Tally marks' : '"' + word + '"') + (pal === 'driedblood' ? ' (dried)' : '') + (extra.bgMode ? ' on wall' : ''),
        group: 'Bloody writing',
        values: Object.assign({ palette: pal }, PALETTES[pal], { word, style: 'finger', weight: 0.1, abstract: 0.25, bounce: 0.35, rotJitter: 9, sizeVar: 0.35, outlineW: 0, outline: PALETTES[pal].c1, stars: 0, arrows: 0, scribbles: 0, highlights: 0.15, fillStyle: 'solid', depth: 0, drips: 22, dripLen: 170, wobble: 0.7, misalign: 0, overspray: 0.05, grunge: 0.3, distort: 0.4 }, extra),
      })),
      // Post-apocalyptic
      { name: 'Safe zone (spray)', group: 'Post-apocalyptic', values: one('#e4ded0', { word: 'SAFE ZONE', style: 'block', weight: 0.11, abstract: 0.12, bounce: 0.2, rotJitter: 5, outlineW: 0, outline: '#e4ded0', stars: 0, arrows: 0, scribbles: 0, highlights: 0, fillStyle: 'solid', depth: 0, bgMode: 'wall', wall: '#6d6a63', drips: 9, dripLen: 90, wobble: 0.5, misalign: 0, overspray: 0.7, grunge: 0.65, distort: 0.3, seed: 51 }) },
      { name: 'Stay out!', group: 'Post-apocalyptic', values: one('#a3221a', { word: 'STAY OUT!', style: 'block', weight: 0.12, abstract: 0.15, bounce: 0.25, rotJitter: 7, outlineW: 0, outline: '#a3221a', stars: 0, arrows: 0, scribbles: 0, highlights: 0, fillStyle: 'solid', depth: 0, bgMode: 'wall', wall: '#7a756c', drips: 12, dripLen: 120, wobble: 0.55, overspray: 0.75, grunge: 0.6, distort: 0.3, seed: 52 }) },
      { name: 'Dead end', group: 'Post-apocalyptic', values: one('#151515', { word: 'DEAD END', style: 'block', weight: 0.13, abstract: 0.1, bounce: 0.15, rotJitter: 4, outlineW: 0, outline: '#151515', stars: 0, arrows: 0, scribbles: 0, highlights: 0, fillStyle: 'solid', depth: 0, bgMode: 'wall', wall: '#6b5440', drips: 7, dripLen: 70, wobble: 0.45, overspray: 0.6, grunge: 0.75, distort: 0.25, seed: 53 }) },
      { name: 'Quarantine', group: 'Post-apocalyptic', values: one('#c9a227', { word: 'QUARANTINE', style: 'block', weight: 0.13, abstract: 0.05, bounce: 0.1, rotJitter: 3, outlineW: 3, outline: '#111111', stars: 0, arrows: 0, scribbles: 0, highlights: 0, fillStyle: 'solid', depth: 0, bgMode: 'wall', wall: '#4a4a44', drips: 5, dripLen: 60, wobble: 0.3, misalign: 2, overspray: 0.5, grunge: 0.6, distort: 0.2, seed: 54 }) },
      { name: 'Repent', group: 'Post-apocalyptic', values: one('#6b0f0f', { word: 'REPENT', style: 'bubble', weight: 0.13, abstract: 0.2, bounce: 0.3, rotJitter: 8, outlineW: 0, outline: '#6b0f0f', stars: 0, arrows: 0, scribbles: 0, highlights: 0, fillStyle: 'solid', depth: 0, bgMode: 'wall', wall: '#8a8378', drips: 16, dripLen: 160, wobble: 0.6, overspray: 0.65, grunge: 0.55, distort: 0.35, seed: 55 }) },
      { name: 'Water this way', group: 'Post-apocalyptic', values: one('#e8e4da', { word: 'WATER ->', style: 'block', weight: 0.11, abstract: 0.1, bounce: 0.2, rotJitter: 5, outlineW: 0, outline: '#e8e4da', stars: 0, arrows: 0, scribbles: 0, highlights: 0, fillStyle: 'solid', depth: 0, bgMode: 'wall', wall: '#55524c', drips: 6, dripLen: 70, wobble: 0.55, overspray: 0.6, grunge: 0.55, distort: 0.3, seed: 56 }) },
      { name: 'Survivors inside', group: 'Post-apocalyptic', values: one('#d9d4c7', { word: 'SURVIVORS INSIDE', style: 'block', weight: 0.1, abstract: 0.15, bounce: 0.3, rotJitter: 6, outlineW: 0, outline: '#d9d4c7', stars: 0, arrows: 0, scribbles: 0, highlights: 0, fillStyle: 'solid', depth: 0, bgMode: 'wall', wall: '#3e3c38', drips: 10, dripLen: 80, wobble: 0.65, overspray: 0.55, grunge: 0.6, distort: 0.35, seed: 57 }) },
      { name: 'No hope (faded)', group: 'Post-apocalyptic', values: one('#7c2a20', { word: 'NO HOPE', style: 'bubble', weight: 0.14, abstract: 0.25, bounce: 0.35, rotJitter: 10, outlineW: 0, outline: '#7c2a20', stars: 0, arrows: 0, scribbles: 0, highlights: 0, fillStyle: 'solid', depth: 0, bgMode: 'wall', wall: '#8c8579', drips: 8, dripLen: 110, wobble: 0.6, overspray: 0.5, grunge: 0.72, distort: 0.4, seed: 58 }) },
      { name: 'Tally wall', group: 'Post-apocalyptic', values: one('#ece6d8', { word: 'IIII IIII IIII II', style: 'block', weight: 0.09, abstract: 0.3, bounce: 0.25, rotJitter: 9, overlap: 0.1, outlineW: 0, outline: '#ece6d8', stars: 0, arrows: 0, scribbles: 0, highlights: 0, fillStyle: 'solid', depth: 0, bgMode: 'wall', wall: '#5a5650', drips: 4, dripLen: 50, wobble: 0.5, overspray: 0.45, grunge: 0.55, distort: 0.25, seed: 59 }) },
      { name: 'Danger: toxic', group: 'Post-apocalyptic', values: one('#d7b21f', { word: 'DANGER: TOXIC', style: 'block', weight: 0.12, abstract: 0.08, bounce: 0.15, rotJitter: 4, outlineW: 4, outline: '#121212', stars: 0, arrows: 0, scribbles: 0, highlights: 0, fillStyle: 'solid', depth: 6, shadow: '#121212', bgMode: 'wall', wall: '#4c4f45', drips: 6, dripLen: 70, wobble: 0.35, misalign: 3, overspray: 0.5, grunge: 0.65, distort: 0.25, seed: 60 }) },
      { name: 'Raider gang tag', group: 'Post-apocalyptic', values: { palette: 'custom', c1: '#8e3b1f', c2: '#b5651d', c3: '#6b2a17', c4: '#a04a22', c5: '#7d3318', outline: '#151210', shadow: '#2a1e17', hi: '#d9c7a8', word: 'RAIDERZ', style: 'wild', abstract: 0.45, weight: 0.12, depth: 8, highlights: 0.3, drips: 5, stars: 0, arrows: 2, scribbles: 2, wobble: 0.35, misalign: 3, overspray: 0.45, grunge: 0.7, distort: 0.3, bgMode: 'wall', wall: '#5c5249', seed: 61 } },
      { name: 'Wasteland crew', group: 'Post-apocalyptic', values: { palette: 'custom', c1: '#d1b46a', c2: '#9fae5c', c3: '#d98f4e', c4: '#c2a160', c5: '#b8bb7a', outline: '#16130e', shadow: '#2e2a20', hi: '#e2d8bf', word: 'WASTELAND', style: 'bubble', weight: 0.16, abstract: 0.25, depth: 10, highlights: 0.35, drips: 6, stars: 0, arrows: 0, scribbles: 1, wobble: 0.3, misalign: 2, overspray: 0.4, grunge: 0.55, distort: 0.3, bgMode: 'wall', wall: '#6e6658', seed: 62 } },
      // Simple
      { name: 'Simple tag (one color)', group: 'Simple', values: one('#ff3fa4', { letters: 4, style: 'bubble', weight: 0.18, abstract: 0.15, outlineW: 4, outline: '#121018', depth: 0, fillStyle: 'solid', highlights: 0.4, drips: 0, stars: 0, arrows: 0, scribbles: 0, wobble: 0.15, misalign: 0, overspray: 0.15, grunge: 0, distort: 0, seed: 71 }) },
      { name: 'Clean black & white', group: 'Simple', values: one('#ffffff', { word: 'HELLO', style: 'bubble', weight: 0.18, abstract: 0.05, bounce: 0.2, outlineW: 5, outline: '#111111', depth: 0, fillStyle: 'solid', highlights: 0, drips: 0, stars: 0, arrows: 0, scribbles: 0, wobble: 0.05, misalign: 0, overspray: 0, grunge: 0, distort: 0, seed: 72 }) },
      { name: 'Minimal throw-up', group: 'Simple', values: { palette: 'custom', c1: '#2fd3ff', c2: '#1f8fff', c3: '#2fd3ff', c4: '#1f8fff', c5: '#2fd3ff', outline: '#0b1020', shadow: '#0b1020', letters: 3, style: 'bubble', weight: 0.22, overlap: 0.55, abstract: 0.15, outlineW: 6, depth: 6, highlights: 0.5, drips: 0, stars: 0, arrows: 0, scribbles: 0, wobble: 0.1, misalign: 0, overspray: 0.1, grunge: 0, distort: 0, seed: 73 } },
      { name: 'Marker hand-style tag', group: 'Simple', values: one('#141414', { letters: 6, layout: 'row', style: 'block', weight: 0.06, abstract: 0.55, bounce: 0.4, rotJitter: 12, overlap: 0.2, outlineW: 0, outline: '#141414', depth: 0, fillStyle: 'solid', highlights: 0, drips: 2, dripLen: 30, stars: 0, arrows: 0, scribbles: 0, wobble: 0.45, misalign: 0, overspray: 0, grunge: 0.1, distort: 0.15, seed: 74 }) },
      { name: 'Spray stencil', group: 'Simple', values: one('#151515', { word: 'NO ENTRY', style: 'block', weight: 0.12, abstract: 0, bounce: 0, rotJitter: 0, sizeVar: 0, tilt: 0, outlineW: 0, outline: '#151515', depth: 0, fillStyle: 'solid', highlights: 0, drips: 0, stars: 0, arrows: 0, scribbles: 0, wobble: 0, misalign: 0, overspray: 0.55, grunge: 0.25, distort: 0, seed: 75 }) },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), K = S / 512, VW = W / K, VH = H / K; // virtual space: short side = 512
      const rnd = U.rng(p.seed), drnd = U.rng(p.seed * 31 + 7); // details have their own RNG
      const cols = [p.c1, p.c2, p.c3, p.c4, p.c5];
      const wild = p.style === 'wild', bubble = p.style === 'bubble', finger = p.style === 'finger';

      /* ---- the word ---- */
      let chars = normalize(p.word || '').split('');
      if (!chars.length) { const wr = U.rng(p.seed * 7 + 1); chars = Array.from({ length: p.letters }, () => RANDOM_SET[(wr() * RANDOM_SET.length) | 0]); }
      const rows = p.layout === 'auto' ? wrap(chars) : [chars];

      /* ---- layout: letter skeletons in virtual units ---- */
      const LH = 100, T = LH * p.weight * (bubble ? 1.15 : 1); // letter height, stroke half width
      const wob = (poly, amp, s) => poly.map(([x, y]) => [x + U.perlin(x * 0.03, y * 0.03 + s, 0, 0, p.seed) * amp, y + U.perlin(x * 0.03 + 40, y * 0.03 + s, 0, 0, p.seed + 1) * amp]);
      const letters = [];
      const tilt = (p.tilt * Math.PI) / 180;
      rows.forEach((row, ri) => {
        const advs = row.map((ch) => (ch === ' ' ? 0.45 : WIDTH[ch] || 1) * LH * 0.62 + T * 2 * (1 - p.overlap * 0.8));
        const total = advs.reduce((a, b) => a + b, 0);
        let cx = -total / 2;
        row.forEach((ch, i) => {
          const adv = advs[i], r = [rnd(), rnd(), rnd(), rnd(), rnd()];
          cx += adv;
          if (ch === ' ' || !FONT[ch]) return;
          const t = row.length > 1 ? i / (row.length - 1) - 0.5 : 0;
          const sc = 1 + (r[0] - 0.5) * p.sizeVar * 0.7;
          const lw = (WIDTH[ch] || 1) * LH * 0.62 * sc, lh = LH * sc;
          let x = cx - adv / 2, y = (ri - (rows.length - 1) / 2) * LH * 1.45 + (r[1] - 0.5) * p.bounce * LH * 0.45;
          if (p.layout === 'arc') y += -Math.cos(t * Math.PI * 0.9) * total * 0.16 + total * 0.08;
          const rot = (r[2] - 0.5) * 2 * (p.rotJitter * Math.PI) / 180, skew = wild ? -0.28 - r[3] * 0.15 : 0;
          const ca = Math.cos(rot + tilt), sa = Math.sin(rot + tilt);
          const gx = x * Math.cos(tilt) - y * Math.sin(tilt), gy = x * Math.sin(tilt) + y * Math.cos(tilt);
          const jr = U.rng(p.seed * 131 + letters.length * 17);
          const strokes = FONT[ch].map((pl) => {
            let pts = pl.map(([u, v]) => {
              // abstraction: jitter the skeleton, more in the middle of strokes than at joints
              const jx = (jr() - 0.5) * p.abstract * 0.55, jy = (jr() - 0.5) * p.abstract * 0.55;
              let lx = (u - 0.5 + jx) * lw, ly = (v - 0.5 + jy) * lh;
              lx += -ly * skew;
              return [gx + lx * ca - ly * sa, gy + lx * sa + ly * ca];
            });
            if (bubble || finger) pts = smooth(pts, finger ? 4 : 6);
            if (p.wobble > 0) pts = wob(pts, p.wobble * 5, letters.length * 3.1);
            return pts;
          });
          // wildstyle: spikes off the free stroke ends
          const spikes = [];
          if (wild) {
            for (const pl of strokes) {
              for (const [a, b] of [[pl[0], pl[1]], [pl[pl.length - 1], pl[pl.length - 2]]]) {
                if (jr() > 0.45 + p.abstract * 0.3) continue;
                const dx = a[0] - b[0], dy = a[1] - b[1], dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
                const L = T * (1.6 + jr() * 2.2), bend = (jr() - 0.5) * 1.2;
                const tipx = a[0] + (ux + -uy * bend) * L, tipy = a[1] + (uy + ux * bend) * L;
                spikes.push([[a[0] - uy * T, a[1] + ux * T], [tipx, tipy], [a[0] + uy * T, a[1] - ux * T]]);
              }
            }
          }
          const color = cols[letters.length % 5], color2 = cols[(letters.length + 2) % 5];
          const brush = finger ? strokes.map((pl, si) => fingerStroke(pl, T, jr, p.seed + letters.length * 7 + si)) : null;
          letters.push({ strokes, spikes, color, color2, cx: gx, cy: gy, lh, brush });
        });
      });
      if (!letters.length) return;

      // paint one layer of a letter: strokes at half width T + extra, spikes filled (+ stroked by extra)
      const paint = (c, L, extra, style) => {
        if (L.brush) { paintFinger(c, L, extra, style, T); return; }
        c.strokeStyle = c.fillStyle = style;
        c.lineWidth = Math.max(0.5, (T + extra) * 2);
        for (const pl of L.strokes) { c.beginPath(); trace(c, pl); c.stroke(); }
        for (const sp of L.spikes) { c.beginPath(); trace(c, sp, true); c.fill(); if (extra > 0) { c.lineWidth = extra * 2; c.stroke(); c.lineWidth = Math.max(0.5, (T + extra) * 2); } }
      };

      // drips: from low points of a letter, only where the drip runs free below everything else
      const hit = U.canvas(1, 1).getContext('2d');
      hit.lineWidth = (T + p.outlineW) * 2;
      hit.lineCap = hit.lineJoin = 'round';
      const lpaths = letters.map((L) => { const pa = new Path2D(); for (const pl of L.strokes) trace(pa, pl); return pa; });
      const covered = (x, y) => lpaths.some((pa) => hit.isPointInStroke(pa, x, y));
      const drips = [];
      for (let i = 0; i < p.drips; i++) {
        const L = letters[(drnd() * letters.length) | 0], cand = [];
        for (const pl of L.strokes) for (const pt of pl) if (pt[1] > L.cy + L.lh * 0.1) cand.push(pt);
        const len = p.dripLen * (0.35 + drnd() * 0.9), w = T * (0.25 + drnd() * 0.25);
        for (let tries = 0; tries < 14 && cand.length; tries++) {
          const [x, y] = cand[(drnd() * cand.length) | 0], y0 = y + T * 0.6;
          if (covered(x, y0 + T + p.outlineW + 2) || covered(x, y0 + len * 0.5) || covered(x, y0 + len)) continue;
          drips.push({ x, y: y0, len, w, L });
          break;
        }
      }
      // a drip flares out of the letter edge, thins into a stem and ends in a round bulb
      const dripPath = (c, d, g = 0) => {
        const w = d.w + g, fl = d.w * 2.4 + g, top = d.y - T * 1.2, neck = d.y + T * 0.5, end = d.y + d.len, wb = d.w * 1.3 + g;
        c.moveTo(d.x - fl, top);
        c.quadraticCurveTo(d.x - w, top + T * 0.45, d.x - w, neck);
        c.lineTo(d.x - w * 0.85, end - wb * 0.6);
        c.arc(d.x, end, wb, Math.PI * 1.12, -Math.PI * 0.12, true);
        c.lineTo(d.x + w * 0.85, end - wb * 0.6);
        c.lineTo(d.x + w, neck);
        c.quadraticCurveTo(d.x + w, top + T * 0.45, d.x + fl, top);
        c.closePath();
      };

      // bounds of the word (for decorations and the fit)
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      const grow = (x, y, m) => { bx0 = Math.min(bx0, x - m); bx1 = Math.max(bx1, x + m); by0 = Math.min(by0, y - m); by1 = Math.max(by1, y + m); };
      for (const L of letters) { for (const pl of L.strokes) for (const [x, y] of pl) grow(x, y, T); for (const sp of L.spikes) for (const [x, y] of sp) grow(x, y, 0); }
      const wx0 = bx0, wx1 = bx1, wy0 = by0, wy1 = by1;
      const around = () => {
        const a = drnd() * U.TAU, ex = (wx1 - wx0) / 2 + 18, ey = (wy1 - wy0) / 2 + 18;
        return [(wx0 + wx1) / 2 + Math.cos(a) * ex * (0.85 + drnd() * 0.25), (wy0 + wy1) / 2 + Math.sin(a) * ey * (0.85 + drnd() * 0.25)];
      };
      const stars = [];
      for (let i = 0; i < p.stars; i++) { const [x, y] = around(); stars.push({ x, y, r: 8 + drnd() * 14, color: drnd() < 0.5 ? p.hi : cols[(drnd() * 5) | 0] }); }
      const arrows = [];
      for (let i = 0; i < p.arrows; i++) {
        const [x, y] = around(), a = Math.atan2(y - (wy0 + wy1) / 2, x - (wx0 + wx1) / 2) + (drnd() - 0.5) * 1.2, len = 40 + drnd() * 50, bend = (drnd() - 0.5) * 1.4;
        const pts = [];
        for (let j = 0; j <= 10; j++) { const t = j / 10, aa = a + bend * t; pts.push([x - Math.cos(a) * len * 0.5 + Math.cos(aa) * len * t, y - Math.sin(a) * len * 0.5 + Math.sin(aa) * len * t]); }
        arrows.push({ pts, w: 5 + drnd() * 4, color: cols[(drnd() * 5) | 0] });
      }
      const scribbles = [];
      for (let i = 0; i < p.scribbles; i++) {
        const [x, y] = around(), pts = [];
        for (let j = 0; j < 30; j++) { const t = j / 29; pts.push([x + (t - 0.5) * 120 + Math.sin(t * 22 + i) * 12, y + Math.cos(t * 17 + i * 2) * 16 + (drnd() - 0.5) * 6]); }
        scribbles.push({ pts: wob(pts, 3 + p.wobble * 6, i), color: cols[(drnd() * 5) | 0] });
      }

      /* ---- fit ---- */
      const pad = p.outlineW + p.outerW + 6;
      const dx = Math.cos((p.depthAngle * Math.PI) / 180) * p.depth, dy = Math.sin((p.depthAngle * Math.PI) / 180) * p.depth;
      for (const L of letters) for (const pl of L.strokes) for (const [x, y] of pl) { grow(x, y, T + pad); grow(x + dx, y + dy, T + pad); }
      for (const d of drips) grow(d.x, d.y + d.len + d.w, pad + d.w);
      for (const s of stars) grow(s.x, s.y, s.r + pad);
      for (const a of arrows) for (const [x, y] of a.pts) grow(x, y, a.w * 3 + pad);
      for (const s of scribbles) for (const [x, y] of s.pts) grow(x, y, 4);
      const halo = p.overspray * 18;
      const margin = 10 + halo + p.distort * 14;
      const fit = Math.min(1.8, (VW - 2 * margin) / (bx1 - bx0), (VH - 2 * margin) / (by1 - by0));
      const ox = VW / 2 - ((bx0 + bx1) / 2) * fit, oy = VH / 2 - ((by0 + by1) / 2) * fit;

      /* ---- draw ---- */
      const layer = U.canvas(W, H), c = layer.getContext('2d');
      const setup = (cc) => { cc.setTransform(K * fit, 0, 0, K * fit, ox * K, oy * K); cc.lineCap = bubble || finger ? 'round' : 'square'; cc.lineJoin = bubble || finger ? 'round' : 'miter'; cc.miterLimit = 3; };
      setup(c);

      for (const s of scribbles) {
        c.save(); c.lineCap = c.lineJoin = 'round';
        c.beginPath(); trace(c, s.pts);
        c.strokeStyle = p.outline; c.lineWidth = 4.5; c.stroke();
        c.strokeStyle = s.color; c.lineWidth = 2.2; c.stroke();
        c.restore();
      }

      if (p.overspray > 0) {
        const h = U.canvas(W, H), hc = h.getContext('2d');
        setup(hc);
        for (const L of letters) paint(hc, L, p.outlineW + halo * 0.5, L.color);
        const g = U.canvas(W, H), gc = g.getContext('2d');
        if (typeof gc.filter === 'string') gc.filter = `blur(${halo * K * fit * 0.6}px)`;
        gc.globalAlpha = 0.55 * p.overspray;
        gc.drawImage(h, 0, 0);
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(g, 0, 0); c.restore();
      }

      // 3D extrusion: outlined steps from the far end toward the word
      if (p.depth > 0) {
        const steps = Math.max(2, Math.ceil(p.depth / 2));
        for (const pass of [0, 1]) {
          for (let i = steps; i >= 1; i--) {
            c.save(); c.translate(dx * (i / steps), dy * (i / steps));
            for (const L of letters) paint(c, L, pass ? 0 : p.outlineW, pass ? p.shadow : p.outline);
            for (const d of drips) { c.beginPath(); dripPath(c, d, pass ? 0 : p.outlineW); c.fillStyle = pass ? p.shadow : p.outline; c.fill(); }
            c.restore();
          }
        }
      }

      // outlines of the whole word first (merged), then fills
      const arrowHead = (a, g) => {
        const n2 = a.pts.length, [x, y] = a.pts[n2 - 1], [px, py] = a.pts[n2 - 3], ang = Math.atan2(y - py, x - px), hs = a.w * 2.6 + g;
        c.beginPath();
        c.moveTo(x + Math.cos(ang) * hs, y + Math.sin(ang) * hs);
        c.lineTo(x + Math.cos(ang + 2.4) * hs, y + Math.sin(ang + 2.4) * hs);
        c.lineTo(x + Math.cos(ang - 2.4) * hs, y + Math.sin(ang - 2.4) * hs);
        c.closePath(); c.fill();
      };
      const outlineAll = (w, color) => {
        for (const L of letters) paint(c, L, w, color);
        c.fillStyle = color;
        for (const d of drips) { c.beginPath(); dripPath(c, d, w); c.fill(); }
        c.save(); c.lineCap = 'round';
        for (const a of arrows) { c.beginPath(); trace(c, a.pts); c.strokeStyle = color; c.lineWidth = (a.w + w) * 2; c.stroke(); arrowHead(a, w * 1.6); }
        c.restore();
      };
      if (p.outerW > 0) outlineAll(p.outlineW + p.outerW, p.outer);
      outlineAll(p.outlineW, p.outline);

      for (const L of letters) {
        const mx = (drnd() - 0.5) * 2 * p.misalign, my = (drnd() - 0.5) * 2 * p.misalign;
        const top = L.cy - L.lh * 0.6, bot = L.cy + L.lh * 0.6;
        let fs = L.color;
        if (p.fillStyle === 'gradient' || p.fillStyle === 'split') {
          const g = c.createLinearGradient(0, top, 0, bot);
          if (p.fillStyle === 'gradient') { g.addColorStop(0, L.color); g.addColorStop(1, L.color2); }
          else { g.addColorStop(0, L.color); g.addColorStop(0.52, L.color); g.addColorStop(0.52, L.color2); g.addColorStop(1, L.color2); }
          fs = g;
        } else if (p.fillStyle === 'dots') {
          const tile = U.canvas(16, 16), tc = tile.getContext('2d');
          tc.fillStyle = L.color; tc.fillRect(0, 0, 16, 16);
          tc.fillStyle = U.rgba(p.hi, 0.6); tc.beginPath(); tc.arc(4, 4, 2.6, 0, U.TAU); tc.arc(12, 12, 2.6, 0, U.TAU); tc.fill();
          fs = c.createPattern(tile, 'repeat');
        }
        c.save();
        c.translate(mx, my);
        // the letter's drips share its fill and offset (a gradient simply continues down the drip),
        // drawn first so the letter covers their flared tops
        const own = drips.filter((d) => d.L === L);
        for (const d of own) { c.beginPath(); dripPath(c, d); c.fillStyle = fs; c.fill(); }
        paint(c, L, 0, fs);
        if (p.innerLine > 0 && T > p.innerLine + 3) {
          c.lineWidth = (T - 2.5) * 2; c.strokeStyle = p.outline;
          for (const pl of L.strokes) { c.beginPath(); trace(c, pl); c.stroke(); }
          c.lineWidth = (T - 2.5 - p.innerLine) * 2; c.strokeStyle = fs;
          for (const pl of L.strokes) { c.beginPath(); trace(c, pl); c.stroke(); }
        }
        // highlights: short shine strokes offset toward the upper left along the longest stroke parts
        if (p.highlights > 0) {
          c.globalAlpha = Math.min(1, p.highlights * 1.2);
          c.strokeStyle = c.fillStyle = p.hi; c.lineCap = 'round';
          c.lineWidth = Math.max(1.5, T * 0.22);
          for (const pl of L.strokes) {
            const a = pl[0], b = pl[Math.min(pl.length - 1, Math.max(1, (pl.length * 0.35) | 0))];
            const sx = b[0] - a[0], sy = b[1] - a[1], sl = Math.hypot(sx, sy);
            if (sl < T * 1.5) continue;
            let nx = -sy / sl, ny = sx / sl;
            if (nx + ny > 0) { nx = -nx; ny = -ny; } // offset toward the upper left
            const o = T * 0.48;
            c.beginPath(); c.moveTo(a[0] + nx * o + sx * 0.15, a[1] + ny * o + sy * 0.15); c.lineTo(a[0] + nx * o + sx * 0.55, a[1] + ny * o + sy * 0.55); c.stroke();
            if (p.highlights > 0.5) { c.beginPath(); c.arc(a[0] + nx * o + sx * 0.72, a[1] + ny * o + sy * 0.72, c.lineWidth * 0.6, 0, U.TAU); c.fill(); }
          }
          // a thin shine down the left side of each drip
          c.lineWidth = Math.max(1, T * 0.12);
          c.globalAlpha = Math.min(1, p.highlights) * 0.7;
          for (const d of own) { if (d.len < T * 1.5) continue; c.beginPath(); c.moveTo(d.x - d.w * 0.45, d.y + T * 0.7); c.lineTo(d.x - d.w * 0.4, d.y + d.len - d.w * 0.8); c.stroke(); }
          c.globalAlpha = 1;
        }
        c.restore();
      }
      c.save(); c.lineCap = 'round';
      for (const a of arrows) { c.beginPath(); trace(c, a.pts); c.strokeStyle = a.color; c.lineWidth = a.w * 2; c.stroke(); c.fillStyle = a.color; arrowHead(a, 0); }
      c.restore();

      for (const s of stars) {
        c.beginPath();
        for (let i = 0; i < 8; i++) { const a = (i / 8) * U.TAU - Math.PI / 2, r = i % 2 ? s.r * 0.28 : s.r; i ? c.lineTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r) : c.moveTo(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r); }
        c.closePath();
        c.lineJoin = 'round'; c.strokeStyle = p.outline; c.lineWidth = Math.max(2, p.outlineW * 0.8); c.stroke();
        c.fillStyle = s.color; c.fill();
      }

      /* ---- post: distortion warp, grunge wear, wall ---- */
      const src = c.getImageData(0, 0, W, H).data;
      const img = ctx.createImageData(W, H), d = img.data;
      const amp = p.distort * 9 * K, wall = U.hex(p.wall), onWall = p.bgMode === 'wall';
      const ws = 4 / S, gs = 10 / S;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const o = (y * W + x) * 4;
          let sx = x, sy = y;
          if (amp > 0) {
            sx = Math.round(x + U.perlin(x * ws, y * ws, 0, 0, p.seed + 3) * amp + U.perlin(x * ws * 4, y * ws * 4, 0, 0, p.seed + 4) * amp * 0.35);
            sy = Math.round(y + U.perlin(x * ws + 9, y * ws, 0, 0, p.seed + 5) * amp + U.perlin(x * ws * 4, y * ws * 4 + 3, 0, 0, p.seed + 6) * amp * 0.35);
          }
          let r = 0, g = 0, b = 0, a = 0;
          if (sx >= 0 && sy >= 0 && sx < W && sy < H) { const i = (sy * W + sx) * 4; r = src[i]; g = src[i + 1]; b = src[i + 2]; a = src[i + 3] / 255; }
          if (a > 0 && p.desat > 0) {
            // blend toward luminance (Rec. 709 weights) so light / dark structure is kept
            const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            r += (l - r) * p.desat; g += (l - g) * p.desat; b += (l - b) * p.desat;
          }
          if (a > 0 && p.grunge > 0) {
            // worn paint: fbm erosion
            const n = U.fractal('perlin', x * gs, y * gs, 0, 0, 4, 0.55, 'fbm', p.seed + 9);
            const wear = U.smoothstep(0.62 - p.grunge * 0.35, 0.7 - p.grunge * 0.3, n) * p.grunge;
            a *= 1 - U.clamp(wear);
          }
          if (onWall) {
            const wn = 0.86 + U.fractal('perlin', x * gs * 0.6, y * gs * 0.6, 0, 0, 4, 0.5, 'fbm', p.seed + 11) * 0.22 + (U.hash(x, y, 5) - 0.5) * 0.06;
            d[o] = wall[0] * wn * (1 - a) + r * a; d[o + 1] = wall[1] * wn * (1 - a) + g * a; d[o + 2] = wall[2] * wn * (1 - a) + b * a; d[o + 3] = 255;
          } else { d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a * 255; }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
