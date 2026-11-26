/* Radial menu: weapon / emote / pie selection wheels. A ring (or pie) split into 1–16 elements with
   parallel gaps (constant px width, not constant angle), per-element size weight, radial push and outer
   size, arc or straight outer edges, rounded corners, explode spacing and an optional center element
   and backing plate. One shared style (fill: solid, inner → outer, around the ring or a linear
   gradient over the whole menu; shine, shade, border, glow; noise + grunge from the shared wear stack)
   that every element can override with its own. Labels (custom text, numbers, letters) per element.
   Separate layer export: every element, its hover state, the center, the plate, an ID map and the
   combined image all export at the same full canvas size, so they stack in the engine without offsets.
   Units are px @ 256 px short side. */
(function () {
  'use strict';
  const U = window.UGTG;
  const RAD = Math.PI / 180, TAU = U.TAU;
  const MAXN = 16;

  const FONTS = {
    sans: (s) => `700 ${s}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`,
    mono: (s) => `700 ${s}px Consolas, "Cascadia Mono", "Courier New", monospace`,
    stencil: (s) => `400 ${s}px Impact, "Arial Narrow Bold", "Arial Narrow", sans-serif`,
    serif: (s) => `700 ${s}px Georgia, "Times New Roman", serif`,
  };
  const GRUNGE_TYPES = [['blotchy', 'Blotchy'], ['chipped', 'Chipped'], ['speckle', 'Speckle'], ['streaks', 'Streaks'], ['cracks', 'Cracks']];
  const ALWAYS = () => true;

  /* ---------- style definitions (shared style, per-element override, center) ---------- */
  const FILL_KEYS = ['fill', 'color', 'color2', 'gradAngle', 'alpha', 'shine', 'shade', 'borderW', 'borderColor', 'borderAlpha', 'glow', 'glowColor'];
  const WEAR_KEYS = ['colorNoise', 'noiseColor', 'brightNoise', 'noiseScale', 'distort', 'distortScale', 'grunge', 'grungeType', 'grungeScale', 'edgeWear', 'edgeWidth', 'dirt', 'dirtColor', 'scratches'];

  function fillDefs(pre, show, d = {}) {
    const s = show || ALWAYS, v = (o, k) => o[pre + k];
    return [
      { key: pre + 'fill', label: 'Fill style', type: 'select', default: d.fill || 'radial', show: s, options: [['solid', 'Solid'], ['radial', 'Gradient inner → outer'], ['angular', 'Gradient around the ring'], ['linear', 'Linear gradient (whole menu)']] },
      { key: pre + 'color', label: 'Color', type: 'color', default: d.color || '#2c3038', show: s },
      { key: pre + 'color2', label: 'Second color', type: 'color', default: d.color2 || '#121419', show: (o, r) => s(o, r) && v(o, 'fill') !== 'solid', tip: 'Gradient end color' },
      { key: pre + 'gradAngle', label: 'Gradient angle', type: 'range', min: -180, max: 180, step: 1, default: 0, show: (o, r) => s(o, r) && v(o, 'fill') === 'linear', tip: '0 = first color at the top (degrees, clockwise)' },
      { key: pre + 'alpha', label: 'Fill opacity', type: 'range', min: 0, max: 1, step: 0.01, default: d.alpha == null ? 0.92 : d.alpha, show: s },
      { key: pre + 'shine', label: 'Shine', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, show: s, tip: 'Light band along the outer edge' },
      { key: pre + 'shade', label: 'Shade', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, show: s, tip: 'Darkens toward the inner edge' },
      { key: pre + 'borderW', label: 'Border thickness', type: 'range', min: 0, max: 20, step: 0.25, default: d.borderW == null ? 1.5 : d.borderW, show: s, tip: 'px @ 256' },
      { key: pre + 'borderColor', label: 'Border color', type: 'color', default: d.borderColor || '#9aa1ad', show: (o, r) => s(o, r) && v(o, 'borderW') > 0 },
      { key: pre + 'borderAlpha', label: 'Border opacity', type: 'range', min: 0, max: 1, step: 0.01, default: d.borderAlpha == null ? 0.6 : d.borderAlpha, show: (o, r) => s(o, r) && v(o, 'borderW') > 0 },
      { key: pre + 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: s },
      { key: pre + 'glowColor', label: 'Glow color', type: 'color', default: '#3cc8ff', show: (o, r) => s(o, r) && v(o, 'glow') > 0 },
    ];
  }
  function wearDefs(pre, show) {
    const s = show || ALWAYS, v = (o, k) => o[pre + k];
    return [
      { key: pre + 'colorNoise', label: 'Color noise', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: s, tip: 'Blotches tinted toward the noise color' },
      { key: pre + 'noiseColor', label: 'Noise color', type: 'color', default: '#2a1d14', show: (o, r) => s(o, r) && v(o, 'colorNoise') > 0 },
      { key: pre + 'brightNoise', label: 'Brightness variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: s },
      { key: pre + 'noiseScale', label: 'Noise scale', type: 'range', min: 0.5, max: 30, step: 0.1, default: 6, show: (o, r) => s(o, r) && (v(o, 'colorNoise') > 0 || v(o, 'brightNoise') > 0), tip: 'Noise features across the short side' },
      { key: pre + 'distort', label: 'Distortion', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: s, tip: 'Warps the shape with noise (hand-made look)' },
      { key: pre + 'distortScale', label: 'Distortion scale', type: 'range', min: 0.5, max: 30, step: 0.1, default: 4, show: (o, r) => s(o, r) && v(o, 'distort') > 0 },
      { key: pre + 'grunge', label: 'Wear', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: s, tip: 'Worn-off areas from the grunge noise (erodes alpha)' },
      { key: pre + 'grungeType', label: 'Grunge type', type: 'select', default: 'blotchy', options: GRUNGE_TYPES, show: (o, r) => s(o, r) && (v(o, 'grunge') > 0 || v(o, 'edgeWear') > 0) },
      { key: pre + 'grungeScale', label: 'Grunge scale', type: 'range', min: 1, max: 60, step: 0.5, default: 6, show: (o, r) => s(o, r) && (v(o, 'grunge') > 0 || v(o, 'edgeWear') > 0 || v(o, 'dirt') > 0), tip: 'Grunge features across the short side' },
      { key: pre + 'edgeWear', label: 'Edge wear', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: s, tip: 'Wear concentrates on the element\'s edges and corners' },
      { key: pre + 'edgeWidth', label: 'Edge wear width', type: 'range', min: 0.5, max: 12, step: 0.1, default: 3, show: (o, r) => s(o, r) && v(o, 'edgeWear') > 0, tip: 'px @ 128' },
      { key: pre + 'dirt', label: 'Dirt', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: s, tip: 'Darkens / tints with the grunge noise, keeps alpha' },
      { key: pre + 'dirtColor', label: 'Dirt color', type: 'color', default: '#1c140d', show: (o, r) => s(o, r) && v(o, 'dirt') > 0 },
      { key: pre + 'scratches', label: 'Scratches', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: s, tip: 'Thin scratched-off lines' },
    ];
  }
  const readStyle = (o, pre) => {
    const st = {};
    for (const k of FILL_KEYS) st[k] = o[pre + k];
    for (const k of WEAR_KEYS) st[k] = o[pre + k];
    return st;
  };
  const wearOf = (st, seed) => ({
    colorNoise: st.colorNoise, noiseColor: st.noiseColor, brightNoise: st.brightNoise, noiseType: 'perlin', noiseScale: st.noiseScale, noiseDetail: 3,
    distort: st.distort, distortScale: st.distortScale, grunge: st.grunge, grungeType: st.grungeType, grungeScale: st.grungeScale,
    edgeWear: st.edgeWear, edgeWidth: st.edgeWidth, dirt: st.dirt, dirtColor: st.dirtColor, scratches: st.scratches, seed,
  });

  const ownStyle = (it) => !!it.custom;
  const ITEM = [
    { key: 'label', label: 'Label', type: 'text', default: '', max: 16, tip: 'Used when Labels is set to "Custom text"' },
    { key: 'weight', label: 'Size share', type: 'range', min: 0.2, max: 4, step: 0.05, default: 1, tip: 'Relative angular size (1 = equal share)' },
    { key: 'grow', label: 'Outer size', type: 'range', min: -60, max: 40, step: 0.5, default: 0, tip: 'Moves the outer edge in / out (px @ 256)' },
    { key: 'push', label: 'Push out', type: 'range', min: -20, max: 40, step: 0.5, default: 0, tip: 'Moves this element outward along its center line (px @ 256)' },
    { key: 'custom', label: 'Own style', type: 'bool', default: false, tip: 'Override the shared style (fill, gradient, border, glow, noise, grunge) for this element' },
    ...fillDefs('', ownStyle),
    ...wearDefs('', ownStyle),
  ];

  /* ---------- geometry ---------- */
  function layout(W, H, p) {
    const S = Math.min(W, H), k = S / 256, cx = W / 2, cy = H / 2;
    const items = (p.elements || []).slice(0, MAXN);
    const N = Math.max(1, items.length);
    const Ro = Math.max(4, S / 2 - p.margin * k), Ri = Ro * p.inner;
    const sweep = U.clamp(p.sweep, 10, 360), full = sweep >= 360;
    const ws = items.map((it) => Math.max(0.05, it.weight || 1)), wsum = ws.reduce((a, b) => a + b, 0) || 1;
    const spans = ws.map((w) => (sweep * w) / wsum);
    let a = p.rotate - (full ? spans[0] / 2 : sweep / 2);
    const els = items.map((it, i) => {
      const a0 = a, a1 = a + spans[i];
      a = a1;
      const mid = ((a0 + a1) / 2 - 90) * RAD;
      return { i, it, mid, a0: (a0 - 90) * RAD, a1: (a1 - 90) * RAD, h: (spans[i] / 2) * RAD, full: N === 1 && full };
    });
    return { S, k, cx, cy, Ro, Ri, N, els, sweep, full };
  }

  /* sector geometry for one element (hover state grows / pushes it) */
  function sector(L, p, el, hover) {
    const k = L.k, push = (p.explode + (el.it.push || 0) + (hover ? p.hoverPop : 0)) * k;
    return {
      cx: L.cx + Math.cos(el.mid) * push, cy: L.cy + Math.sin(el.mid) * push, mid: el.mid, h: el.h,
      ro: Math.max(2, L.Ro + ((el.it.grow || 0) + (hover ? p.hoverGrow : 0)) * k), ri: L.Ri, e: (p.gap * k) / 2,
      rf: p.round * k, flat: p.edges === 'flat', full: el.full, a0: el.a0, a1: el.a1,
    };
  }

  /* outline of a sector shrunk by d px: parallel side gaps, filleted corners, arc or straight edges */
  function sectorPath(c, g, d) {
    const ro = g.ro - d, e = g.e + d;
    let ri = g.ri > 0.5 ? g.ri + d : 0;
    if (ro - ri <= 0.5) return;
    if (g.full) {
      c.moveTo(g.cx + ro, g.cy); c.arc(g.cx, g.cy, ro, 0, TAU);
      if (ri > 0.5) { c.moveTo(g.cx + ri, g.cy); c.arc(g.cx, g.cy, ri, TAU, 0, true); }
      return;
    }
    const h = g.h, sh = Math.sin(h), ch = Math.cos(h), cs = Math.cos(g.mid), sn = Math.sin(g.mid);
    const T = (q) => [g.cx + q[0] * cs - q[1] * sn, g.cy + q[0] * sn + q[1] * cs];
    const mir = (q) => [q[0], -q[1]];
    // straight edges: polygon of the two side lines, the outer chord and the inner line (or the apex)
    if (g.flat && h < 1.2) {
      const Do = g.ro * ch - d, Di = ri > 0 ? ri : 0;
      const yAt = (D) => (e - D * sh) / ch, apex = e / sh;
      if (yAt(Do) >= -0.25 || Do <= apex) return;
      const o0 = [Do, yAt(Do)], pts = [];
      if (Di > apex + 0.25) pts.push([Di, yAt(Di)], o0, mir(o0), mir([Di, yAt(Di)]));
      else pts.push([apex, 0], o0, mir(o0));
      U.polyPath(c, pts.map(T), Math.max(0, g.rf - d));
      return;
    }
    // arc edges, in the element's frame (x along its center line, side 0 at -h)
    const n0 = [sh, ch], d0 = [ch, -sh];
    const P = (a, s) => [a * n0[0] + s * d0[0], a * n0[1] + s * d0[1]];
    let inner = ri > e * 1.02;
    if (!inner && h > 1.35) { ri = e * 1.05 + 0.5; inner = true; }
    if (inner && ro - ri <= 0.5) return;
    const apexS = (e * ch) / sh;
    const build = (rf) => {
      const to2 = (ro - rf) ** 2 - (e + rf) ** 2;
      if (to2 <= 0) return null;
      const tO = Math.sqrt(to2), C = P(e + rf, tO), f = ro / (ro - rf), Pa = [C[0] * f, C[1] * f];
      if (Pa[1] > -0.05) return null;
      const g1 = { Ps: P(e, tO), Pa, tO };
      if (inner) {
        const ti2 = (ri + rf) ** 2 - (e + rf) ** 2;
        if (ti2 < 0) return null;
        const tI = Math.sqrt(ti2), Ci = P(e + rf, tI), fi = ri / (ri + rf), Q = [Ci[0] * fi, Ci[1] * fi];
        if (Q[1] > -0.05 || tI >= tO - 0.1) return null;
        g1.Q = Q; g1.Pi = P(e, tI);
      } else if (apexS >= tO - 0.1) return null;
      return g1;
    };
    let rf = Math.min(Math.max(0, g.rf - d), (ro - (inner ? ri : 0)) * 0.45), G = null;
    for (let n = 0; n < 10 && !(G = build(rf)); n++) rf = n < 8 ? rf * 0.5 : 0;
    if (!G) return;
    // corner of a fillet: where the side line meets the circle's tangent at the tangent point
    const corner = (pt, r) => {
      const ux = pt[0] / r, uy = pt[1] / r, s = (r - e * (n0[0] * ux + n0[1] * uy)) / (d0[0] * ux + d0[1] * uy);
      return P(e, s);
    };
    const Ko = corner(G.Pa, ro), aO = Math.atan2(G.Pa[1], G.Pa[0]);
    const mv = (q) => { const t = T(q); c.moveTo(t[0], t[1]); };
    const at = (q1, q2, r) => { const a = T(q1), b = T(q2); c.arcTo(a[0], a[1], b[0], b[1], r); };
    mv(G.Ps);
    at(Ko, G.Pa, rf);
    c.arc(g.cx, g.cy, ro, g.mid + aO, g.mid - aO, false);
    at(mir(Ko), mir(G.Ps), rf);
    if (inner) {
      const Ki = corner(G.Q, ri), aI = Math.atan2(G.Q[1], G.Q[0]);
      at(mir(Ki), mir(G.Q), rf);
      c.arc(g.cx, g.cy, ri, g.mid - aI, g.mid + aI, true);
      at(Ki, G.Ps, rf);
    } else {
      at([e / sh, 0], G.Ps, Math.min(rf, apexS * 0.5));
    }
    c.closePath();
  }

  /* center element: circle or rounded regular polygon */
  function centerGeo(L, p) {
    return { cx: L.cx, cy: L.cy, r: Math.max(1, L.Ro * p.centerSize), sides: p.center === 'polygon' ? Math.max(3, p.centerSides | 0) : 0, rot: p.centerRot * RAD, round: p.centerRound };
  }
  function centerPath(c, g, d) {
    const r = g.r - d;
    if (r <= 0.3) return;
    if (!g.sides) { c.moveTo(g.cx + r, g.cy); c.arc(g.cx, g.cy, r, 0, TAU); return; }
    const n = g.sides, rr = (g.r - d / Math.cos(Math.PI / n)), pts = [];
    if (rr <= 0.3) return;
    for (let i = 0; i < n; i++) { const a = g.rot - Math.PI / 2 + (i * TAU) / n; pts.push([g.cx + Math.cos(a) * rr, g.cy + Math.sin(a) * rr]); }
    U.polyPath(c, pts, Math.max(0, g.round * g.r * 0.6 - d));
  }

  /* ---------- drawing ---------- */
  const mixHex = (a, b, t) => {
    const A = U.hex(a), B = U.hex(b), h = (v) => Math.round(v).toString(16).padStart(2, '0');
    return '#' + h(U.lerp(A[0], B[0], t)) + h(U.lerp(A[1], B[1], t)) + h(U.lerp(A[2], B[2], t));
  };

  function fillStyle(c, st, L, geo) {
    const a = st.alpha, c1 = U.rgba(st.color, a), c2 = U.rgba(st.color2, a);
    if (st.fill === 'radial') {
      const g = c.createRadialGradient(geo.cx, geo.cy, geo.r0, geo.cx, geo.cy, geo.r1);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      return g;
    }
    if (st.fill === 'angular' && c.createConicGradient && geo.a1 != null) {
      const g = c.createConicGradient(geo.a0, geo.cx, geo.cy), f = U.clamp((geo.a1 - geo.a0) / TAU, 0.001, 1);
      g.addColorStop(0, c1); g.addColorStop(f, c2); if (f < 1) g.addColorStop(1, c1);
      return g;
    }
    if (st.fill === 'linear' || st.fill === 'angular') {
      const t = st.fill === 'linear' ? st.gradAngle * RAD : 0, R = L.Ro;
      const g = c.createLinearGradient(L.cx - Math.sin(-t) * R, L.cy - Math.cos(t) * R, L.cx + Math.sin(-t) * R, L.cy + Math.cos(t) * R);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      return g;
    }
    return c1;
  }

  /* fill + shine / shade + border (+ label) of one shape into a fresh canvas */
  function drawBody(W, H, L, st, geo, path, label) {
    const out = U.canvas(W, H), c = out.getContext('2d'), k = L.k, b = Math.max(0, st.borderW) * k;
    c.save();
    c.beginPath(); path(c, b > 0 ? b * 0.5 : 0); c.clip();
    c.beginPath(); path(c, b > 0 ? b * 0.5 : 0);
    c.fillStyle = fillStyle(c, st, L, geo);
    c.fill();
    if (st.shine > 0 || st.shade > 0) {
      const g = c.createRadialGradient(geo.cx, geo.cy, geo.r0, geo.cx, geo.cy, geo.r1);
      g.addColorStop(0, `rgba(0,0,0,${st.shade * 0.7 * st.alpha})`);
      g.addColorStop(0.45, 'rgba(0,0,0,0)');
      g.addColorStop(0.7, 'rgba(255,255,255,0)');
      g.addColorStop(1, `rgba(255,255,255,${st.shine * 0.8 * st.alpha})`);
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }
    c.restore();
    if (label) label(c);
    if (b > 0 && st.borderAlpha > 0) {
      c.beginPath(); path(c, 0); path(c, b);
      c.fillStyle = U.rgba(st.borderColor, st.borderAlpha);
      c.fill('evenodd');
    }
    return out;
  }

  /* noise / grunge, then drop shadow and glow around the (worn) shape */
  /* bounding box of the visible pixels, grown by `pad` and clamped to the canvas (null if empty) */
  function alphaBox(cv, W, H, pad) {
    const d = cv.getContext('2d').getImageData(0, 0, W, H).data;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      const row = y * W * 4;
      let a = -1, b = -1;
      for (let x = 0; x < W; x++) if (d[row + x * 4 + 3]) { a = x; break; }
      if (a < 0) continue;
      for (let x = W - 1; x >= a; x--) if (d[row + x * 4 + 3]) { b = x; break; }
      if (a < x0) x0 = a; if (b > x1) x1 = b; if (y < y0) y0 = y; y1 = y;
    }
    if (x1 < 0) return null;
    return { x0: Math.max(0, x0 - pad), y0: Math.max(0, y0 - pad), x1: Math.min(W, x1 + 1 + pad), y1: Math.min(H, y1 + 1 + pad) };
  }

  function finish(body, W, H, L, p, st) {
    let cv = body;
    const wp = wearOf(st, p.seed | 0);
    if (U.wearActive(wp)) {
      // wear only the element's own area: the noise is sampled at texture positions, so the crop wears
      // exactly like the same spot of a full-size pass (much faster for many small elements)
      const bb = alphaBox(body, W, H, Math.ceil((wp.distort || 0) * L.S * 0.06) + 2);
      if (bb) {
        const cw = bb.x1 - bb.x0, chh = bb.y1 - bb.y0, crop = U.canvas(cw, chh), cc = crop.getContext('2d');
        cc.drawImage(body, -bb.x0, -bb.y0);
        cc.save(); cc.translate(-bb.x0, -bb.y0); U.wearScratches(cc, W, H, wp, L.S); cc.restore();
        const F = U.wearFields(cw, chh, wp, L.S, null, bb.x0, bb.y0);
        cv = U.canvas(W, H);
        cv.getContext('2d').drawImage(U.imageCanvas(U.wearApply(crop, wp, F, { grunge: true })), bb.x0, bb.y0);
      }
    }
    const out = U.canvas(W, H), c = out.getContext('2d'), k = L.k, off = W + H + 200;
    const shadow = (color, blur, dy) => {
      c.save();
      c.shadowColor = color; c.shadowBlur = blur; c.shadowOffsetX = off; c.shadowOffsetY = dy;
      c.drawImage(cv, -off, 0);
      c.restore();
    };
    if (p.shadowAlpha > 0) {
      shadow(`rgba(0,0,0,${p.shadowAlpha})`, p.shadowBlur * k, p.shadowY * k);
      // keep only the shadow: a see-through element must not show it underneath
      c.save(); c.globalCompositeOperation = 'destination-out'; c.drawImage(cv, 0, 0); c.restore();
    }
    if (st.glow > 0) {
      const col = U.rgba(st.glowColor, Math.min(1, st.glow * 1.2));
      shadow(col, p.glowSize * k, 0);
      if (st.glow > 0.5) shadow(col, p.glowSize * k, 0);
    }
    c.drawImage(cv, 0, 0);
    return out;
  }

  const letters = (n) => { let s = ''; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];
  function labelText(p, el) {
    switch (p.labelMode) {
      case 'custom': return el.it.label || '';
      case 'numbers': return String(el.i + 1);
      case 'letters': return letters(el.i);
      case 'roman': return ROMAN[el.i] || String(el.i + 1);
      default: return '';
    }
  }
  function textDrawer(p, L, text, x, y, ang) {
    if (!text) return null;
    return (c) => {
      const size = Math.max(4, p.labelSize * L.k);
      c.save();
      c.translate(x, y);
      if (ang) c.rotate(ang);
      c.font = (FONTS[p.font] || FONTS.sans)(size);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = U.rgba(p.labelColor, p.labelAlpha);
      if (p.labelSpacing && 'letterSpacing' in c) c.letterSpacing = (p.labelSpacing * size) + 'px';
      c.fillText(text, 0, size * 0.04);
      c.restore();
    };
  }
  function elementLabel(p, L, el, g) {
    const text = labelText(p, el);
    if (!text) return null;
    const r = (g.ri > 0.5 ? g.ri : 0) + (g.ro - (g.ri > 0.5 ? g.ri : 0)) * p.labelPos;
    const x = g.cx + Math.cos(g.mid) * r, y = g.cy + Math.sin(g.mid) * r;
    let ang = 0;
    if (p.labelOrient === 'tangent') {
      ang = g.mid + Math.PI / 2;
      if (Math.sin(g.mid) > 0.0001) ang += Math.PI; // keep text upright on the lower half
    } else if (p.labelOrient === 'radial') {
      ang = g.mid;
      if (Math.cos(g.mid) < -0.0001) ang += Math.PI; // left half reads outward-in
    }
    return textDrawer(p, L, text, x, y, ang);
  }

  function elementStyle(p, el, hover) {
    const st = el.it.custom ? readStyle(el.it, '') : readStyle(p, '');
    if (hover) {
      const t = p.hoverTint;
      if (t > 0) { st.color = mixHex(st.color, p.hoverColor, t); st.color2 = mixHex(st.color2, p.hoverColor, t); }
      if (p.hoverBorder) { st.borderColor = p.hoverBorderColor; st.borderAlpha = 1; st.borderW = Math.max(st.borderW, 0.75); }
      if (p.hoverGlow > 0) { st.glow = Math.max(st.glow, p.hoverGlow); st.glowColor = p.hoverGlowColor; }
      st.alpha = U.clamp(st.alpha + p.hoverAlpha);
    }
    return st;
  }

  function drawElement(W, H, L, p, el, hover) {
    const g = sector(L, p, el, hover), st = elementStyle(p, el, hover);
    const geo = { cx: g.cx, cy: g.cy, r0: g.ri > 0.5 ? g.ri : 0, r1: g.ro, a0: g.a0, a1: g.a1 };
    const body = drawBody(W, H, L, st, geo, (c, d) => sectorPath(c, g, d), elementLabel(p, L, el, g));
    return finish(body, W, H, L, p, st);
  }

  function drawCenter(W, H, L, p) {
    const g = centerGeo(L, p), st = p.c_own ? readStyle(p, 'c_') : readStyle(p, '');
    const geo = { cx: g.cx, cy: g.cy, r0: 0, r1: g.r, a0: -Math.PI / 2, a1: -Math.PI / 2 + TAU };
    const label = p.centerLabel ? textDrawer(Object.assign({}, p, { labelSize: p.centerLabelSize }), L, p.centerLabel, g.cx, g.cy, 0) : null;
    const body = drawBody(W, H, L, st, geo, (c, d) => centerPath(c, g, d), label);
    return finish(body, W, H, L, p, st);
  }

  function drawPlate(W, H, L, p) {
    const k = L.k, Rp = L.Ro + p.platePad * k, Rh = p.plate === 'ring' ? Math.max(0, L.Ri - p.platePad * k) : 0;
    const path = (c, d) => {
      const ro = Rp - d, ri = Rh > 0.5 ? Rh + d : 0;
      if (ro <= ri + 0.3) return;
      const first = L.els[0], last = L.els[L.els.length - 1], pad = p.platePad * k;
      const h = (last.a1 - first.a0) / 2 + pad / Math.max(1, Rp);
      if (L.full || p.plateFull || h >= Math.PI - 0.02) {
        c.moveTo(L.cx + ro, L.cy); c.arc(L.cx, L.cy, ro, 0, TAU);
        if (ri > 0.5) { c.moveTo(L.cx + ri, L.cy); c.arc(L.cx, L.cy, ri, TAU, 0, true); }
        return;
      }
      // partial menu: the plate follows the sweep
      const g = { cx: L.cx, cy: L.cy, mid: (first.a0 + last.a1) / 2, h, ro: Rp, ri: Rh, e: 0, rf: p.round * k + Math.max(0, pad), flat: false, full: false };
      sectorPath(c, g, d);
    };
    const st = Object.assign(readStyle(p, ''), {
      fill: 'solid', color: p.plateColor, alpha: p.plateAlpha, shine: 0, shade: p.plateShade,
      borderW: p.plateBorderW, borderColor: p.plateBorderColor, borderAlpha: 1, glow: 0,
    });
    if (!p.plateWear) for (const k2 of WEAR_KEYS) if (typeof st[k2] === 'number') st[k2] = 0;
    const body = drawBody(W, H, L, st, { cx: L.cx, cy: L.cy, r0: Rh, r1: Rp }, path, null);
    return finish(body, W, H, L, p, st);
  }

  /* ID map: every element a flat gray level (i + 1) / (N + 1), the center white; no wear or effects */
  function drawIdMap(W, H, L, p) {
    const out = U.canvas(W, H), c = out.getContext('2d');
    for (const el of L.els) {
      const g = sector(L, p, el, false), v = Math.round(((el.i + 1) / (L.N + 1)) * 255);
      c.beginPath(); sectorPath(c, g, 0);
      c.fillStyle = `rgb(${v},${v},${v})`; c.fill();
    }
    if (p.center !== 'none') { const g = centerGeo(L, p); c.beginPath(); centerPath(c, g, 0); c.fillStyle = '#fff'; c.fill(); }
    return out;
  }

  /* ---------- layers ---------- */
  const pad2 = (n) => String(n).padStart(2, '0');
  function exportLayers(p) {
    if (!p.split) return null;
    const n = Math.min(MAXN, (p.elements || []).length), out = [];
    if (p.plate !== 'none') out.push({ id: 'plate', suffix: 'plate' });
    for (let i = 0; i < n; i++) out.push({ id: 'el' + i, suffix: 'el' + pad2(i + 1) });
    if (p.hoverLayers) for (let i = 0; i < n; i++) out.push({ id: 'hov' + i, suffix: 'el' + pad2(i + 1) + '_hover' });
    if (p.center !== 'none') out.push({ id: 'center', suffix: 'center' });
    if (p.idMap) out.push({ id: 'idmap', suffix: 'idmap' });
    if (p.combinedLayer) out.push({ id: 'all', suffix: 'combined' });
    return out;
  }
  function previewLayer(p) {
    const i = Math.max(0, (p.viewIdx | 0) - 1);
    switch (p.view) {
      case 'element': return 'el' + i;
      case 'hover': return 'hov' + i;
      case 'plate': case 'center': case 'idmap': return p.view;
      default: return 'all';
    }
  }

  function render(ctx, W, H, p, opts) {
    opts = opts || {};
    const layer = opts.layer || (opts.preview ? previewLayer(p) : 'all');
    const L = layout(W, H, p);
    if (layer === 'idmap') { ctx.drawImage(drawIdMap(W, H, L, p), 0, 0); return; }
    const m = /^(el|hov)(\d+)$/.exec(layer);
    if (m) {
      const el = L.els[+m[2]];
      if (el) ctx.drawImage(drawElement(W, H, L, p, el, m[1] === 'hov'), 0, 0);
      return;
    }
    if (layer === 'plate') { if (p.plate !== 'none') ctx.drawImage(drawPlate(W, H, L, p), 0, 0); return; }
    if (layer === 'center') { if (p.center !== 'none') ctx.drawImage(drawCenter(W, H, L, p), 0, 0); return; }
    // combined
    if (p.plate !== 'none') ctx.drawImage(drawPlate(W, H, L, p), 0, 0);
    const hov = (p.hoverIdx | 0) - 1;
    for (const el of L.els) if (el.i !== hov) ctx.drawImage(drawElement(W, H, L, p, el, false), 0, 0);
    if (L.els[hov]) ctx.drawImage(drawElement(W, H, L, p, L.els[hov], true), 0, 0); // hovered on top
    if (p.center !== 'none') ctx.drawImage(drawCenter(W, H, L, p), 0, 0);
  }

  function setCount(v, n) {
    const list = v.elements || (v.elements = []);
    while (list.length > n) list.pop();
    while (list.length < n) list.push(list.length ? Object.assign(U.clone(list[list.length - 1]), { label: '' }) : U.defaultsFor(ITEM));
  }

  /* ---------- presets ---------- */
  const els = (n, f) => Array.from({ length: n }, (_, i) => (f ? f(i) : {}));
  const custom = (o) => Object.assign({ custom: true, fill: 'radial', alpha: 0.92, shine: 0.15, shade: 0.2, borderW: 1.5, borderColor: '#9aa1ad', borderAlpha: 0.6 }, o);
  const EMOTE = ['#e0463a', '#f08a2c', '#f2c33a', '#7cc94a', '#36b39a', '#3a8fe0', '#6a5ce0', '#c74ab8'];

  U.register({
    id: 'radialmenu',
    name: 'Radial Menu',
    desc: 'Weapon, emote and pie selection wheels with per-element style and grunge, exported as same-size stackable layers',
    uses: ['Weapon, item, emote and ability wheels for game HUDs: every slice, its hover state, the center and the plate export at the same size, so they stack in the engine without any offsets.', 'Pie and context menus, quick-select dials and radial navigation for apps and tools.'],
    tags: ['UI', 'Shooter'],
    aspect: '1:1',
    bg: 'gray',
    icon: U.icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3v5.5M12 15.5V21M3 12h5.5M15.5 12H21"/>'),
    exportLayers,
    params: [
      { type: 'section', label: 'Layout' },
      { key: 'sweep', label: 'Sweep', type: 'range', min: 10, max: 360, step: 1, default: 360, tip: '360 = full wheel, less = partial (arc) menu' },
      { key: 'rotate', label: 'Rotation', type: 'range', min: -180, max: 180, step: 0.5, default: 0, tip: 'Full wheel: element 1 is centered at the top at 0. Partial menu: the middle of the arc points this way (0 = up, degrees clockwise)' },
      { key: 'inner', label: 'Inner radius', type: 'range', min: 0, max: 0.92, step: 0.005, default: 0.42, tip: 'Fraction of the outer radius; 0 = pie slices' },
      { key: 'gap', label: 'Spacing', type: 'range', min: 0, max: 40, step: 0.25, default: 4, tip: 'Gap between elements, the same width from inside to outside (px @ 256)' },
      { key: 'explode', label: 'Explode', type: 'range', min: 0, max: 40, step: 0.25, default: 0, tip: 'Pushes every element outward from the center (px @ 256)' },
      { key: 'edges', label: 'Edges', type: 'select', default: 'arc', options: [['arc', 'Curved (ring)'], ['flat', 'Straight (polygon)']], tip: 'Straight works for 3 or more elements' },
      { key: 'round', label: 'Corner rounding', type: 'range', min: 0, max: 40, step: 0.25, default: 3, tip: 'px @ 256' },
      { key: 'margin', label: 'Margin', type: 'range', min: 0, max: 60, step: 0.5, default: 10, tip: 'Space around the wheel for shadow, glow, hover growth and distortion (px @ 256)' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Elements' },
      { type: 'button', buttons: [3, 4, 5, 6, 8, 10, 12].map((n) => ({ label: String(n), tip: 'Set the element count (keeps the existing elements\' settings)', run: (v) => setCount(v, n) })) },
      { key: 'elements', label: 'Elements', type: 'list', itemLabel: 'Element', max: MAXN, item: ITEM, default: els(6),
        itemSummary: (it) => [it.label ? '"' + it.label + '"' : '', it.weight !== 1 ? '×' + it.weight : '', it.custom ? U.t('Own style') : ''].filter(Boolean).join(' · ') },

      { type: 'section', label: 'Style' },
      ...fillDefs(''),
      { type: 'section', label: 'Grunge' },
      ...wearDefs(''),

      { type: 'section', label: 'Center' },
      { key: 'center', label: 'Center element', type: 'select', default: 'circle', options: [['none', 'None'], ['circle', 'Circle'], ['polygon', 'Polygon']] },
      { key: 'centerSize', label: 'Center size', type: 'range', min: 0.05, max: 0.9, step: 0.005, default: 0.34, show: (p) => p.center !== 'none', tip: 'Radius as a fraction of the outer radius' },
      { key: 'centerSides', label: 'Sides', type: 'int', min: 3, max: 12, default: 6, show: (p) => p.center === 'polygon' },
      { key: 'centerRot', label: 'Polygon rotation', type: 'range', min: -180, max: 180, step: 1, default: 0, show: (p) => p.center === 'polygon' },
      { key: 'centerRound', label: 'Polygon roundness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1, show: (p) => p.center === 'polygon' },
      { key: 'centerLabel', label: 'Center text', type: 'text', default: '', max: 16, show: (p) => p.center !== 'none' },
      { key: 'centerLabelSize', label: 'Center text size', type: 'range', min: 4, max: 60, step: 0.5, default: 16, show: (p) => p.center !== 'none' && !!p.centerLabel, tip: 'px @ 256' },
      { key: 'c_own', label: 'Own style', type: 'bool', default: true, show: (p) => p.center !== 'none', tip: 'Off: the center uses the shared element style' },
      ...fillDefs('c_', (p) => p.center !== 'none' && p.c_own, { fill: 'radial', color: '#1d2026', color2: '#0b0c0f' }),
      ...wearDefs('c_', (p) => p.center !== 'none' && p.c_own),

      { type: 'section', label: 'Labels' },
      { key: 'labelMode', label: 'Labels', type: 'select', default: 'none', options: [['none', 'None'], ['custom', 'Custom text (per element)'], ['numbers', 'Numbers'], ['letters', 'Letters'], ['roman', 'Roman numerals']] },
      { key: 'font', label: 'Font', type: 'select', default: 'sans', options: [['sans', 'Sans'], ['mono', 'Monospace'], ['stencil', 'Condensed / stencil'], ['serif', 'Serif']], show: (p) => p.labelMode !== 'none' || !!p.centerLabel },
      { key: 'labelSize', label: 'Text size', type: 'range', min: 4, max: 60, step: 0.5, default: 14, show: (p) => p.labelMode !== 'none', tip: 'px @ 256' },
      { key: 'labelColor', label: 'Text color', type: 'color', default: '#e8e6df', show: (p) => p.labelMode !== 'none' || !!p.centerLabel },
      { key: 'labelAlpha', label: 'Text opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.9, show: (p) => p.labelMode !== 'none' || !!p.centerLabel },
      { key: 'labelPos', label: 'Position', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.labelMode !== 'none', tip: '0 = inner edge, 1 = outer edge' },
      { key: 'labelOrient', label: 'Orientation', type: 'select', default: 'upright', options: [['upright', 'Upright'], ['tangent', 'Along the ring'], ['radial', 'Along the spoke']], show: (p) => p.labelMode !== 'none' },
      { key: 'labelSpacing', label: 'Letter spacing', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0, show: (p) => p.labelMode !== 'none' || !!p.centerLabel },

      { type: 'section', label: 'Hover' },
      { key: 'hoverIdx', label: 'Show hovered (preview)', type: 'int', min: 0, max: MAXN, default: 0, tip: 'Element shown in its hover state in the combined image (0 = none)' },
      { key: 'hoverGrow', label: 'Grow', type: 'range', min: 0, max: 40, step: 0.25, default: 6, tip: 'Outer edge moves out (px @ 256)' },
      { key: 'hoverPop', label: 'Pop out', type: 'range', min: 0, max: 40, step: 0.25, default: 2, tip: 'Whole element moves outward (px @ 256)' },
      { key: 'hoverTint', label: 'Tint', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'hoverColor', label: 'Tint color', type: 'color', default: '#6fb7ff', show: (p) => p.hoverTint > 0 },
      { key: 'hoverAlpha', label: 'Extra opacity', type: 'range', min: -1, max: 1, step: 0.01, default: 0.05, neutral: 0 },
      { key: 'hoverBorder', label: 'Highlight border', type: 'bool', default: true },
      { key: 'hoverBorderColor', label: 'Border color', type: 'color', default: '#cfe6ff', show: (p) => p.hoverBorder },
      { key: 'hoverGlow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'hoverGlowColor', label: 'Glow color', type: 'color', default: '#4aa8ff', show: (p) => p.hoverGlow > 0 },

      { type: 'section', label: 'Plate' },
      { key: 'plate', label: 'Backing plate', type: 'select', default: 'none', options: [['none', 'None'], ['disc', 'Disc'], ['ring', 'Ring (open center)']], tip: 'A shape behind all elements, exported as its own layer' },
      { key: 'platePad', label: 'Plate padding', type: 'range', min: -20, max: 40, step: 0.25, default: 6, show: (p) => p.plate !== 'none', tip: 'How far the plate reaches past the elements (px @ 256)' },
      { key: 'plateFull', label: 'Full circle on partial menus', type: 'bool', default: false, show: (p) => p.plate !== 'none' && p.sweep < 360 },
      { key: 'plateColor', label: 'Plate color', type: 'color', default: '#0b0c0f', show: (p) => p.plate !== 'none' },
      { key: 'plateAlpha', label: 'Plate opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.plate !== 'none' },
      { key: 'plateShade', label: 'Plate shade', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.plate !== 'none' },
      { key: 'plateBorderW', label: 'Plate border', type: 'range', min: 0, max: 20, step: 0.25, default: 0, show: (p) => p.plate !== 'none', tip: 'px @ 256' },
      { key: 'plateBorderColor', label: 'Plate border color', type: 'color', default: '#5b616b', show: (p) => p.plate !== 'none' && p.plateBorderW > 0 },
      { key: 'plateWear', label: 'Shared grunge on plate', type: 'bool', default: true, show: (p) => p.plate !== 'none' },

      { type: 'section', label: 'Effects' },
      { key: 'shadowAlpha', label: 'Drop shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4 },
      { key: 'shadowBlur', label: 'Shadow blur', type: 'range', min: 0, max: 30, step: 0.5, default: 4, show: (p) => p.shadowAlpha > 0, tip: 'px @ 256' },
      { key: 'shadowY', label: 'Shadow offset', type: 'range', min: -20, max: 20, step: 0.5, default: 2, show: (p) => p.shadowAlpha > 0, tip: 'px @ 256' },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 1, max: 40, step: 0.5, default: 8, tip: 'For every glow (style, center, hover); px @ 256' },

      { type: 'section', label: 'Output' },
      { key: 'split', label: 'Separate layer export', type: 'bool', default: true, tip: 'Download every element, the center and the plate as separate PNGs, all at the full texture size so they stack without offsets' },
      { key: 'hoverLayers', label: 'Hover layers', type: 'bool', default: true, show: (p) => p.split, tip: 'One extra file per element in its hover state (_elNN_hover)' },
      { key: 'idMap', label: 'ID map layer', type: 'bool', default: false, show: (p) => p.split, tip: 'Gray value per element = (index) / (count + 1), center white: sample it in the engine to find the element under the cursor' },
      { key: 'combinedLayer', label: 'Combined image too', type: 'bool', default: false, show: (p) => p.split },
      { key: 'view', label: 'Preview layer', type: 'select', default: 'all', options: [['all', 'Everything (combined)'], ['element', 'One element'], ['hover', 'One element, hovered'], ['center', 'Center'], ['plate', 'Plate'], ['idmap', 'ID map']], tip: 'Preview only' },
      { key: 'viewIdx', label: 'Element', type: 'int', min: 1, max: MAXN, default: 1, show: (p) => p.view === 'element' || p.view === 'hover' },
    ],
    presets: [
      { name: 'Weapon wheel (8)', group: 'Game-inspired', values: { elements: els(8), inner: 0.4, gap: 3, round: 2, fill: 'radial', color: '#262a31', color2: '#0f1115', alpha: 0.85, borderColor: '#c8ccd4', borderAlpha: 0.35, plate: 'none', center: 'circle', centerSize: 0.33, c_color: '#15171b', c_color2: '#050506', c_borderColor: '#c8ccd4', c_borderAlpha: 0.35, hoverIdx: 1, hoverTint: 0.25, hoverColor: '#ffffff', hoverBorderColor: '#ffffff', hoverGlow: 0.25, hoverGlowColor: '#ffffff' } },
      { name: 'Emote wheel', group: 'Game-inspired', values: { elements: els(8, (i) => custom({ color: EMOTE[i], color2: mixHex(EMOTE[i], '#000000', 0.45), borderColor: '#ffffff', borderAlpha: 0.5, borderW: 2 })), inner: 0.3, gap: 5, round: 6, centerSize: 0.24, c_color: '#ffffff', c_color2: '#cfcfcf', c_borderW: 0, c_shine: 0, labelMode: 'numbers', labelColor: '#ffffff', labelSize: 18, labelPos: 0.55, hoverIdx: 3, hoverTint: 0.15, hoverColor: '#ffffff', hoverBorderColor: '#ffffff', hoverGlow: 0.5, hoverGlowColor: '#ffffff' } },
      { name: 'Ability wheel (4)', group: 'Game-inspired', values: { elements: els(4), rotate: 45, inner: 0.36, gap: 8, round: 8, color: '#3a2f55', color2: '#17122a', borderColor: '#b99cff', borderAlpha: 0.7, borderW: 2, center: 'polygon', centerSides: 4, centerRot: 45, centerSize: 0.3, c_color: '#22193a', c_color2: '#0d0a18', c_borderColor: '#b99cff', c_borderW: 2, hoverIdx: 2, hoverColor: '#b99cff', hoverGlowColor: '#9a6bff', hoverBorderColor: '#e6dbff' } },
      { name: 'Quick slot arc (bottom)', group: 'Game-inspired', values: { elements: els(5), sweep: 140, rotate: 180, inner: 0.62, gap: 3, round: 3, margin: 6, center: 'none', color: '#2a2d33', color2: '#16181c', hoverIdx: 3, labelMode: 'numbers', labelOrient: 'tangent', labelSize: 12, labelPos: 0.5 } },
      { name: 'Pie menu (flat, 6)', group: 'Simple', values: { elements: els(6), edges: 'flat', inner: 0, gap: 4, round: 4, center: 'circle', centerSize: 0.22, fill: 'solid', color: '#30343b', alpha: 0.95, shine: 0, shade: 0, borderW: 0, c_fill: 'solid', c_color: '#101215', c_borderW: 0, c_shine: 0, c_shade: 0, shadowAlpha: 0.3, hoverIdx: 1, hoverTint: 0.5, hoverColor: '#3d8bff', hoverBorder: false, hoverGlow: 0, hoverGrow: 4, hoverPop: 0 } },
      { name: 'Hexagon wheel', group: 'Simple', values: { elements: els(6), edges: 'flat', rotate: 0, inner: 0.45, gap: 5, round: 2, center: 'polygon', centerSides: 6, centerRot: 30, centerSize: 0.36, centerRound: 0.05, fill: 'solid', color: '#2a2e35', shine: 0, shade: 0.15, c_fill: 'solid', c_color: '#16181c', hoverIdx: 4 } },
      { name: 'Minimal outline', group: 'Simple', values: { elements: els(8), inner: 0.55, gap: 6, round: 4, fill: 'solid', color: '#ffffff', alpha: 0.06, shine: 0, shade: 0, borderW: 1.5, borderColor: '#ffffff', borderAlpha: 0.7, center: 'circle', centerSize: 0.45, c_fill: 'solid', c_color: '#ffffff', c_alpha: 0.04, c_shine: 0, c_shade: 0, c_borderW: 1, c_borderColor: '#ffffff', c_borderAlpha: 0.4, shadowAlpha: 0, hoverIdx: 2, hoverTint: 0, hoverAlpha: 0.2, hoverBorderColor: '#ffffff', hoverGlow: 0, hoverGrow: 3, hoverPop: 0 } },
      { name: 'Compass (N E S W)', group: 'Simple', values: { elements: [{ label: 'N' }, { label: 'E' }, { label: 'S' }, { label: 'W' }], inner: 0.3, gap: 6, round: 5, labelMode: 'custom', labelSize: 22, labelPos: 0.6, font: 'serif', center: 'circle', centerSize: 0.22, hoverIdx: 1 } },
      { name: 'Segmented ring (gapless)', group: 'Simple', values: { elements: els(12), inner: 0.7, gap: 0, round: 0, fill: 'angular', color: '#3cf2ff', color2: '#1a6cff', alpha: 0.85, shine: 0.2, shade: 0, borderW: 1, borderColor: '#000000', borderAlpha: 0.6, center: 'none', shadowAlpha: 0, hoverIdx: 0, hoverLayers: true } },
      { name: 'Rusted scrap wheel', group: 'Post-apocalyptic', values: { elements: els(6), inner: 0.38, gap: 6, round: 3, fill: 'radial', color: '#6b4a32', color2: '#2e1d12', alpha: 1, shine: 0.1, shade: 0.4, borderW: 3, borderColor: '#1b120c', borderAlpha: 1, colorNoise: 0.55, noiseColor: '#8a4a1e', noiseScale: 7, brightNoise: 0.2, distort: 0.06, grunge: 0.3, grungeType: 'chipped', grungeScale: 9, edgeWear: 0.55, dirt: 0.45, dirtColor: '#1f140b', scratches: 0.4, c_color: '#3a2a1e', c_color2: '#140d08', c_borderW: 3, c_borderColor: '#1b120c', c_borderAlpha: 1, c_colorNoise: 0.5, c_noiseColor: '#7a4a22', c_grunge: 0.25, c_grungeType: 'chipped', c_edgeWear: 0.5, c_dirt: 0.4, plate: 'disc', platePad: 7, plateColor: '#140f0b', plateAlpha: 0.85, plateBorderW: 2, plateBorderColor: '#3a2a1e', hoverIdx: 2, hoverTint: 0.3, hoverColor: '#e0a040', hoverBorderColor: '#e0b060', hoverGlowColor: '#ff9a2a', labelMode: 'numbers', font: 'stencil', labelColor: '#d8c49a', labelSize: 20, seed: 33 } },
      { name: 'Duct-taped survival wheel', group: 'Post-apocalyptic', values: { elements: els(5), edges: 'flat', inner: 0.32, gap: 7, round: 1, fill: 'solid', color: '#c9b98e', alpha: 0.95, shine: 0, shade: 0.25, borderW: 2, borderColor: '#3a3a36', borderAlpha: 1, distort: 0.12, distortScale: 6, grunge: 0.28, grungeType: 'streaks', grungeScale: 6, edgeWear: 0.4, dirt: 0.5, dirtColor: '#3a2a1a', scratches: 0.25, center: 'polygon', centerSides: 5, centerSize: 0.26, c_fill: 'solid', c_color: '#3a3a36', c_borderW: 0, c_grunge: 0.2, c_grungeType: 'streaks', hoverIdx: 1, hoverTint: 0.4, hoverColor: '#ff6a2a', hoverBorder: false, hoverGlow: 0, labelMode: 'custom', font: 'stencil', labelColor: '#2a2420', seed: 17 } },
      { name: 'Military stencil', group: 'Realistic', values: { elements: els(8), inner: 0.4, gap: 4, round: 1, fill: 'solid', color: '#5e6a3a', alpha: 0.95, shine: 0.05, shade: 0.3, borderW: 2, borderColor: '#1c2012', borderAlpha: 1, colorNoise: 0.35, noiseColor: '#3a3a26', noiseScale: 5, grunge: 0.25, grungeType: 'chipped', grungeScale: 10, edgeWear: 0.45, scratches: 0.3, center: 'circle', c_fill: 'solid', c_color: '#2a2d21', c_borderColor: '#1c2012', c_borderW: 2, c_borderAlpha: 1, c_grunge: 0.2, c_grungeType: 'chipped', labelMode: 'numbers', font: 'stencil', labelColor: '#d8d2b8', labelSize: 18, hoverIdx: 5, hoverTint: 0.3, hoverColor: '#c8c090', hoverBorderColor: '#e8e2c8', hoverGlow: 0, seed: 12 } },
      { name: 'Brushed steel', group: 'Realistic', values: { elements: els(6), inner: 0.42, gap: 4, round: 4, fill: 'linear', gradAngle: 0, color: '#9aa0a8', color2: '#4a4f56', alpha: 1, shine: 0.35, shade: 0.25, borderW: 1.5, borderColor: '#2a2d31', borderAlpha: 1, brightNoise: 0.12, noiseScale: 18, scratches: 0.15, c_fill: 'linear', c_color: '#6a7078', c_color2: '#2e3237', c_borderColor: '#2a2d31', c_borderAlpha: 1, hoverIdx: 2, hoverTint: 0.2, hoverColor: '#ffffff', hoverBorderColor: '#ffffff', hoverGlow: 0.2, hoverGlowColor: '#ffffff' } },
      { name: 'Hand-painted', group: 'Stylized', values: { elements: els(6, (i) => custom({ fill: 'solid', color: ['#d8493a', '#e8a33a', '#5aa35a', '#3a7ec8', '#8a5ac8', '#c85a9a'][i], shine: 0, shade: 0.2, borderW: 3, borderColor: '#1a1210', borderAlpha: 1, distort: 0.35, distortScale: 3, grunge: 0.12, grungeType: 'streaks', grungeScale: 4, edgeWear: 0.3 })), inner: 0.34, gap: 7, round: 8, center: 'circle', centerSize: 0.26, c_fill: 'solid', c_color: '#f0e6d0', c_borderW: 3, c_borderColor: '#1a1210', c_borderAlpha: 1, c_distort: 0.35, c_distortScale: 3, shadowAlpha: 0.5, shadowBlur: 0, shadowY: 3, hoverIdx: 1, hoverTint: 0.15, hoverColor: '#ffffff', hoverBorder: false, hoverGlow: 0, seed: 8 } },
      { name: 'Fantasy gold', group: 'Stylized', values: { elements: els(6), inner: 0.4, gap: 5, round: 3, fill: 'radial', color: '#2a1b3a', color2: '#120a1c', alpha: 0.95, shine: 0.25, shade: 0.35, borderW: 3, borderColor: '#c49a3c', borderAlpha: 1, center: 'polygon', centerSides: 8, centerSize: 0.32, centerRot: 22.5, c_color: '#3a1e14', c_color2: '#120806', c_borderW: 3.5, c_borderColor: '#d8b050', c_borderAlpha: 1, c_glow: 0.25, c_glowColor: '#ffb040', plate: 'ring', platePad: 5, plateColor: '#0c0812', plateAlpha: 0.8, plateBorderW: 2, plateBorderColor: '#8a6a2a', labelMode: 'roman', font: 'serif', labelColor: '#e8cf8a', labelSize: 16, hoverIdx: 1, hoverTint: 0.2, hoverColor: '#ffd070', hoverBorderColor: '#ffe7a0', hoverGlowColor: '#ffb040', shadowAlpha: 0.5, shadowBlur: 6, shadowY: 3 } },
      { name: 'Horror (blood)', group: 'Stylized', values: { elements: els(6), inner: 0.36, gap: 6, round: 2, fill: 'radial', color: '#3a0606', color2: '#0e0101', alpha: 0.95, shine: 0, shade: 0.5, borderW: 1.5, borderColor: '#7a0d0d', borderAlpha: 0.8, colorNoise: 0.45, noiseColor: '#5a0505', noiseScale: 5, distort: 0.3, distortScale: 4, grunge: 0.22, grungeType: 'blotchy', grungeScale: 5, edgeWear: 0.5, edgeWidth: 5, center: 'circle', c_color: '#1a0202', c_color2: '#000000', c_borderColor: '#7a0d0d', c_distort: 0.3, c_distortScale: 4, hoverIdx: 4, hoverTint: 0.4, hoverColor: '#c01010', hoverBorderColor: '#ff3030', hoverGlowColor: '#ff0000', labelMode: 'custom', font: 'serif', seed: 66 } },
      { name: 'Neon HUD', group: 'Sci-fi', values: { elements: els(8), inner: 0.5, gap: 5, round: 2, fill: 'radial', color: '#03141a', color2: '#062a36', alpha: 0.6, shine: 0.1, shade: 0, borderW: 1.5, borderColor: '#3cf2ff', borderAlpha: 0.8, glow: 0.35, glowColor: '#26d9ff', center: 'circle', centerSize: 0.4, c_color: '#02090c', c_color2: '#041a22', c_alpha: 0.7, c_borderColor: '#3cf2ff', c_borderW: 1, c_borderAlpha: 0.5, shadowAlpha: 0, glowSize: 8, margin: 16, hoverIdx: 3, hoverTint: 0.45, hoverColor: '#3cf2ff', hoverBorderColor: '#c8fbff', hoverGlow: 0.8, hoverGlowColor: '#3cf2ff', labelMode: 'numbers', font: 'mono', labelColor: '#9ff6ff', labelSize: 13 } },
      { name: 'Hologram segments', group: 'Sci-fi', values: { elements: els(10), inner: 0.6, gap: 3, explode: 2, round: 0, edges: 'flat', fill: 'angular', color: '#7dff8a', color2: '#2aa84a', alpha: 0.45, shine: 0, shade: 0, borderW: 1, borderColor: '#7dff8a', borderAlpha: 0.7, glow: 0.4, glowColor: '#5aff6a', brightNoise: 0.25, noiseScale: 24, grunge: 0.15, grungeType: 'streaks', grungeScale: 14, center: 'polygon', centerSides: 10, centerSize: 0.48, c_fill: 'solid', c_color: '#0a2a10', c_alpha: 0.5, c_borderColor: '#7dff8a', c_borderW: 1, c_borderAlpha: 0.6, shadowAlpha: 0, margin: 14, hoverIdx: 1, hoverTint: 0.5, hoverColor: '#d0ffd8', hoverBorderColor: '#e8ffe8', hoverGlowColor: '#7dff8a', hoverGlow: 0.7 } },
      { name: 'Glitched terminal', group: 'Sci-fi', values: { elements: els(6), inner: 0.44, gap: 4, round: 0, fill: 'solid', color: '#16050a', alpha: 0.75, shine: 0, shade: 0, borderW: 1.5, borderColor: '#ff3b4a', borderAlpha: 1, glow: 0.3, glowColor: '#ff2030', brightNoise: 0.35, noiseScale: 22, distort: 0.12, distortScale: 8, grunge: 0.25, grungeType: 'streaks', grungeScale: 10, c_fill: 'solid', c_color: '#0e0306', c_borderColor: '#ff3b4a', c_borderW: 1.5, c_borderAlpha: 1, shadowAlpha: 0, margin: 14, labelMode: 'letters', font: 'mono', labelColor: '#ff6a74', hoverIdx: 2, hoverTint: 0.5, hoverColor: '#ff3b4a', hoverBorderColor: '#ffc0c4', hoverGlowColor: '#ff2030', hoverGlow: 0.7 } },
    ],
    render,
  });
})();
