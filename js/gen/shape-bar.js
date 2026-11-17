/* Shape bar: a shape (rectangle, circle, hexagon, triangle, diamond, star, heart, shield, drop,
   cross, flask …) that fills up vertically or horizontally, like health orbs and potion flasks.
   Same fill / frame / segments / effects / noise / grunge / separate layer export as the linear and
   radial bars (js/bar.js); adds a wavy liquid surface and a glass gloss. Units are px @ 256. */
(function () {
  'use strict';
  const U = window.UGTG;
  const RAD = Math.PI / 180;

  const SHAPES = [
    ['rect', 'Rectangle'], ['circle', 'Circle / ellipse'], ['hexagon', 'Hexagon'], ['triangle', 'Triangle'], ['diamond', 'Diamond'],
    ['pentagon', 'Pentagon'], ['octagon', 'Octagon'], ['star', 'Star'], ['heart', 'Heart'], ['shield', 'Shield'], ['drop', 'Drop'],
    ['cross', 'Cross'], ['flask', 'Flask'],
  ];

  const ngon = (n, rot = -Math.PI / 2) => Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * U.TAU; return [Math.cos(a), Math.sin(a)]; });
  const arc = (cx, cy, r, a0, a1, n, out) => { for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; };

  /* unit outline (y down), any size; normalized later */
  function unitShape(type) {
    switch (type) {
      case 'rect': return [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      case 'circle': return ngon(96);
      case 'hexagon': return ngon(6);
      case 'triangle': return ngon(3); // equilateral (stretch to aspect makes it isosceles)
      case 'diamond': return [[0, -1], [1, 0], [0, 1], [-1, 0]];
      case 'pentagon': return ngon(5);
      case 'octagon': return ngon(8, -Math.PI / 2 + Math.PI / 8);
      case 'star': return ngon(10).map(([x, y], i) => (i % 2 ? [x * 0.48, y * 0.48] : [x, y]));
      case 'heart': {
        const pts = [];
        for (let i = 0; i < 96; i++) {
          const t = (i / 96) * U.TAU, s = Math.sin(t);
          pts.push([16 * s * s * s, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]);
        }
        return pts;
      }
      case 'shield': {
        // flat top, straight sides, then a quadratic curve from each side into the bottom point
        const right = [[1, 0.05]];
        for (let i = 1; i <= 24; i++) { const t = i / 24, u = 1 - t; right.push([u * u * 1 + 2 * u * t * 0.95, u * u * 0.05 + 2 * u * t * 0.75 + t * t]); }
        right[right.length - 1] = [0, 1];
        const left = right.slice(0, -1).reverse().map(([x, y]) => [-x, y]);
        return [[-1, -1], [1, -1]].concat(right, left);
      }
      case 'drop': {
        // round bottom, pointed top
        const r = 0.62, cy = 0.38, a = Math.asin(r / (1 + cy)); // tangent from the tip (0,-1)
        return [[0, -1]].concat(arc(0, cy, r, -Math.PI / 2 + a, (3 * Math.PI) / 2 - a, 64, []));
      }
      case 'cross': { const w = 0.34; return [[-w, -1], [w, -1], [w, -w], [1, -w], [1, w], [w, w], [w, 1], [-w, 1], [-w, w], [-1, w], [-1, -w], [-w, -w]]; }
      case 'flask': {
        const r = 0.74, cy = 0.26, nw = 0.3, ny = cy - Math.sqrt(r * r - nw * nw), a0 = Math.atan2(ny - cy, nw), a1 = Math.atan2(ny - cy, -nw) + U.TAU;
        return [[-nw - 0.06, -1], [nw + 0.06, -1], [nw, -0.88]].concat(arc(0, cy, r, a0, a1, 72, []), [[-nw, -0.88]]);
      }
    }
    return ngon(4);
  }

  /* polygon offset inward by d px (miter joins, limited at sharp tips) */
  function inset(pts, d) {
    if (!d) return pts;
    const n = pts.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const sgn = area > 0 ? 1 : -1, out = [];
    for (let i = 0; i < n; i++) {
      const a = pts[(i + n - 1) % n], b = pts[i], c = pts[(i + 1) % n];
      let e1x = b[0] - a[0], e1y = b[1] - a[1], e2x = c[0] - b[0], e2y = c[1] - b[1];
      const l1 = Math.hypot(e1x, e1y) || 1, l2 = Math.hypot(e2x, e2y) || 1;
      e1x /= l1; e1y /= l1; e2x /= l2; e2y /= l2;
      // inward normals (canvas y is down: positive area = clockwise on screen)
      const n1x = -e1y * sgn, n1y = e1x * sgn, n2x = -e2y * sgn, n2y = e2x * sgn;
      let mx = n1x + n2x, my = n1y + n2y;
      const dot = 1 + n1x * n2x + n1y * n2y;
      let f = dot > 1e-3 ? d / dot : d * 4;
      const len = Math.hypot(mx, my) * f;
      if (len > d * 4) f *= (d * 4) / len; // miter limit
      out.push([b[0] + mx * f, b[1] + my * f]);
    }
    return out;
  }

  function geometry(W, H, p) {
    const S = Math.min(W, H), k = S / 256, m = p.margin * k, cx = W / 2, cy = H / 2;
    // unit outline -> rotated -> normalized into the available box (uniform unless stretched)
    const rot = p.rotation * RAD, cr = Math.cos(rot), sr = Math.sin(rot);
    let u = unitShape(p.shape).map(([x, y]) => [x * cr - y * sr, x * sr + y * cr]);
    const xs = u.map((q) => q[0]), ys = u.map((q) => q[1]);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    const ax = (W - 2 * m) / 2, ay = (H - 2 * m) / 2;
    let sx, sy;
    if (p.stretch) { sx = (2 * ax) / (bx1 - bx0); sy = (2 * ay) / (by1 - by0); }
    else sx = sy = Math.min((2 * ax) / (bx1 - bx0), (2 * ay) / (by1 - by0));
    const outer = u.map(([x, y]) => [cx + (x - (bx0 + bx1) / 2) * sx, cy + (y - (by0 + by1) / 2) * sy]);
    const hx = ((bx1 - bx0) * sx) / 2, hy = ((by1 - by0) * sy) / 2;
    const round = p.radius * Math.min(hx, hy);
    const cache = new Map();
    const poly = (d) => { const key = Math.round(d * 100); if (!cache.has(key)) cache.set(key, inset(outer, d)); return cache.get(key); };

    // the progress axis spans the visible fill (inside border + padding), so 0..1 matches what you see
    const ins = (p.borderW + p.pad) * k, fp = poly(ins);
    const vert = p.fillDir === 'up' || p.fillDir === 'down' || p.fillDir === 'vcenter';
    const lo = Math.min(...fp.map((q) => (vert ? q[1] : q[0]))), hi = Math.max(...fp.map((q) => (vert ? q[1] : q[0])));
    const len = Math.max(1, hi - lo);
    const rev = p.fillDir === 'up' || p.fillDir === 'left' || p.fillDir === 'vcenter';
    const pos = (s) => (rev ? hi - s : lo + s); // progress -> axis coordinate
    const BIG = Math.max(W, H) * 3; // "infinite" for clip regions

    function path(c, cell, d) { U.polyPath(c, poly(d), Math.max(0, round - d)); }
    function region(c, s0, s1) {
      const a = s0 <= 0 ? -BIG : pos(s0), b = s1 >= len ? (rev ? -BIG : BIG) : pos(s1);
      const A = s0 <= 0 ? (rev ? BIG : -BIG) : a;
      const pts = [];
      // leading edge: optionally a liquid wave
      const waveOn = p.wave > 0 && s1 < len && p.fillDir !== 'vcenter' && p.fillDir !== 'hcenter';
      const amp = p.wave * 8 * k, n = 48, p0 = vert ? cx - hx : cy - hy, span = (vert ? hx : hy) * 2;
      const edge = [];
      for (let i = 0; i <= (waveOn ? n : 1); i++) {
        const t = waveOn ? i / n : i, q = p0 - BIG * (waveOn ? 0 : 1) + (span + (waveOn ? 0 : 2 * BIG)) * t;
        const off = waveOn ? Math.sin(t * p.waveCount * U.TAU + p.wavePhase * RAD) * amp : 0;
        edge.push(vert ? [q, b + off] : [b + off, q]);
      }
      if (waveOn) { edge.unshift(vert ? [-BIG, b] : [b, -BIG]); edge.push(vert ? [BIG, b] : [b, BIG]); }
      pts.push(...edge);
      pts.push(vert ? [BIG, A] : [A, BIG], vert ? [-BIG, A] : [A, -BIG]);
      U.polyPath(c, pts, 0);
    }
    const N = Math.max(1, p.segments | 0), gap = N > 1 ? p.segGap * k : 0, sl = (len - (N - 1) * gap) / N, segs = [];
    for (let i = 0; i < N; i++) segs.push({ s0: i * (sl + gap), s1: i * (sl + gap) + sl });

    return {
      k, len, dir: p.fillDir === 'vcenter' || p.fillDir === 'hcenter' ? 'center' : 'start', single: true,
      cells: [{ s0: 0, s1: len }], segs, path, region,
      t: (x, y) => {
        const s = rev ? hi - (vert ? y : x) : (vert ? y : x) - lo;
        return p.fillDir === 'vcenter' || p.fillDir === 'hcenter' ? Math.abs(s - len / 2) / (len / 2) : s / len;
      },
      along: (c, c1, c2) => {
        const a = pos(0), b = pos(len);
        const g = vert ? c.createLinearGradient(0, a, 0, b) : c.createLinearGradient(a, 0, b, 0);
        if (p.fillDir === 'vcenter' || p.fillDir === 'hcenter') { g.addColorStop(0, c2); g.addColorStop(0.5, c1); g.addColorStop(1, c2); }
        else { g.addColorStop(0, c1); g.addColorStop(1, c2); }
        return g;
      },
      // across the fill axis: vertical fills shade left (light) to right, horizontal ones top to bottom
      across: (c, stops) => {
        const g = vert ? c.createLinearGradient(cx - hx, 0, cx + hx, 0) : c.createLinearGradient(0, cy - hy, 0, cy + hy);
        for (const [t, col] of stops) g.addColorStop(t, col);
        return g;
      },
      extraFrame: (c, q) => {
        if (!(q.gloss > 0)) return;
        c.save();
        c.beginPath(); path(c, null, q.borderW * k); c.clip();
        const gx = cx - hx * 0.28, gy = cy - hy * 0.42, rx = hx * 0.62, ry = hy * 0.34;
        c.translate(gx, gy); c.rotate(-0.25); c.scale(1, ry / rx);
        const gr = c.createRadialGradient(0, 0, 0, 0, 0, rx);
        gr.addColorStop(0, `rgba(255,255,255,${q.gloss * 0.75})`);
        gr.addColorStop(0.55, `rgba(255,255,255,${q.gloss * 0.25})`);
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = gr;
        c.beginPath(); c.arc(0, 0, rx, 0, U.TAU); c.fill();
        c.restore();
      },
    };
  }

  U.register({
    id: 'shapebar',
    name: 'Shape Bar',
    desc: 'A shape (orb, hexagon, heart, shield, flask …) that fills vertically or horizontally, with grunge and separate layer export',
    tags: ['UI', 'Shooter'],
    aspect: '1:1',
    bg: 'gray',
    icon: U.icon('<circle cx="12" cy="12" r="8.5"/><path d="M4 14.5c2.5-1.2 5.5 1.2 8 0s5.5 1.2 8 0" /><path d="M4.6 15.5h14.8" opacity=".4"/>'),
    exportLayers: U.barLayers,
    params: [
      { type: 'section', label: 'Shape' },
      { key: 'value', label: 'Fill amount (preview)', type: 'range', min: 0, max: 1, step: 0.005, default: 0.6, tip: 'Previews the bar at this fill. Combined exports use it too; a separate fill layer is exported at 100 %' },
      { key: 'shape', label: 'Shape', type: 'select', default: 'circle', options: SHAPES },
      { key: 'fillDir', label: 'Fills', type: 'select', default: 'up', options: [['up', 'Bottom to top'], ['down', 'Top to bottom'], ['right', 'Left to right'], ['left', 'Right to left'], ['vcenter', 'Vertical, from the center'], ['hcenter', 'Horizontal, from the center']] },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: 0, tip: 'Rotates the shape; the fill direction stays' },
      { key: 'stretch', label: 'Stretch to aspect', type: 'bool', default: false, tip: 'Stretch the shape to the texture aspect instead of keeping its proportions' },
      { key: 'radius', label: 'Roundness', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0, tip: 'Rounds the corners (fraction of the shape size)' },
      { key: 'margin', label: 'Margin', type: 'range', min: 0, max: 60, step: 0.5, default: 12, tip: 'Space around the shape for shadow, glow and distortion (px @ 256)' },
      { key: 'wave', label: 'Liquid wave', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Wavy fill surface (not on center fills)' },
      { key: 'waveCount', label: 'Waves', type: 'range', min: 0.25, max: 6, step: 0.05, default: 1.5, show: (p) => p.wave > 0 },
      { key: 'wavePhase', label: 'Wave phase', type: 'range', min: 0, max: 360, step: 1, default: 0, show: (p) => p.wave > 0 },
      { key: 'gloss', label: 'Glass gloss', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Highlight on top of the shape. It sits on the border layer: in a separate export turn on "Border as its own top layer" to keep it above the fill' },
      ...U.barParams({ unit: 'px @ 256', border: 4, gap: 3, noCells: true }),
    ],
    presets: [
      { name: 'Health orb', group: 'Stylized', values: { shape: 'circle', fillColor: '#e0281e', fillColor2: '#5a0606', borderW: 7, borderColor: '#2a2420', trackColor: '#120808', trackAlpha: 0.95, pad: 2, shine: 0.25, shade: 0.5, wave: 0.35, gloss: 0.45, splitFrame: true, value: 0.62 } },
      { name: 'Mana orb', group: 'Stylized', values: { shape: 'circle', fillColor: '#3a7dff', fillColor2: '#0a1660', borderW: 7, borderColor: '#2a2420', trackColor: '#060a18', trackAlpha: 0.95, pad: 2, shine: 0.25, shade: 0.5, wave: 0.35, wavePhase: 140, gloss: 0.45, splitFrame: true, value: 0.45 } },
      { name: 'Potion flask', group: 'Stylized', values: { shape: 'flask', fillColor: '#ff3a6a', fillColor2: '#7a0a2a', borderW: 5, borderColor: '#e8e2d6', borderAlpha: 0.9, trackColor: '#c8e0ff', trackAlpha: 0.15, pad: 3, shine: 0.3, shade: 0.4, wave: 0.4, waveCount: 1.2, gloss: 0.55, splitFrame: true, shadowAlpha: 0.3, value: 0.55 } },
      { name: 'Heart container', group: 'Stylized', values: { shape: 'heart', fillMode: 'solid', fillColor: '#ff2d55', borderW: 6, borderColor: '#2a0a10', trackColor: '#3a1018', trackAlpha: 0.9, pad: 0, shine: 0.3, shade: 0.25, gloss: 0.3, value: 0.5 } },
      { name: 'Shield (stamina)', group: 'Stylized', values: { shape: 'shield', fillColor: '#ffd23f', fillColor2: '#c27a0a', borderW: 6, borderColor: '#2a2a2e', trackColor: '#16161a', trackAlpha: 0.9, pad: 3, shine: 0.3, shade: 0.35, value: 0.7 } },
      { name: 'Water drop', group: 'Stylized', values: { shape: 'drop', fillColor: '#4ac8ff', fillColor2: '#0a5aa8', borderW: 4, borderColor: '#0a2a4a', trackColor: '#0a1a2a', trackAlpha: 0.7, pad: 3, shine: 0.3, shade: 0.4, wave: 0.3, waveCount: 1, gloss: 0.4, splitFrame: true, value: 0.5 } },
      { name: 'Worn hexagon', group: 'Realistic', values: { shape: 'hexagon', fillColor: '#7d8b4a', fillColor2: '#4c5629', borderW: 7, borderColor: '#191b12', trackColor: '#2a2d21', trackAlpha: 1, pad: 3, shine: 0.1, shade: 0.3, colorNoise: 0.35, noiseColor: '#3a3a26', grunge: 0.25, grungeType: 'chipped', grungeScale: 5, edgeWear: 0.35, scratches: 0.3, seed: 12, value: 0.66 } },
      { name: 'Rusty tank gauge', group: 'Realistic', values: { shape: 'rect', radius: 0.12, stretch: true, fillColor: '#c8a23a', fillColor2: '#6a4a10', borderW: 8, borderColor: '#3b2a20', trackColor: '#1a1410', trackAlpha: 1, pad: 3, shine: 0.15, shade: 0.4, wave: 0.15, waveCount: 2.5, colorNoise: 0.5, noiseColor: '#5a3418', brightNoise: 0.15, grunge: 0.2, grungeScale: 6, edgeWear: 0.3, dirt: 0.4, value: 0.4, seed: 33 } },
      { name: 'Tarkov-style square cell', group: 'Realistic', values: { shape: 'rect', fillMode: 'solid', fillColor: '#b9b29a', borderW: 3, borderColor: '#5d5c55', borderAlpha: 0.9, trackColor: '#16171a', trackAlpha: 0.75, pad: 4, shine: 0, shade: 0, shadowAlpha: 0, value: 0.72 } },
      { name: 'Diamond rank', group: 'Simple', values: { shape: 'diamond', fillMode: 'solid', fillColor: '#f2f2f2', borderW: 5, borderColor: '#f2f2f2', trackAlpha: 0.3, trackColor: '#000000', pad: 6, shine: 0, shade: 0, shadowAlpha: 0 } },
      { name: 'Triangle warning', group: 'Simple', values: { shape: 'triangle', radius: 0.08, fillMode: 'solid', fillColor: '#f2b705', borderW: 6, borderColor: '#111111', trackColor: '#2a2410', pad: 4, shine: 0, shade: 0.2, value: 0.5 } },
      { name: 'Star power', group: 'Simple', values: { shape: 'star', fillColor: '#ffe14a', fillColor2: '#f08a1a', borderW: 5, borderColor: '#3a2408', trackColor: '#2a1a08', pad: 3, shine: 0.35, shade: 0.2, glow: 0.4, glowSize: 10, glowColor: '#ffc020', value: 0.6 } },
      { name: 'Side fill capsule', group: 'Simple', values: { shape: 'rect', radius: 0.5, stretch: true, fillDir: 'right', fillColor: '#53d35c', fillColor2: '#1f7a2a', borderW: 4, borderColor: '#0c0d0f', pad: 3, shine: 0.3, shade: 0.2 } },
      { name: 'Medic cross', group: 'Game-inspired', values: { shape: 'cross', fillMode: 'solid', fillColor: '#ff3a3a', borderW: 5, borderColor: '#ffffff', trackColor: '#3a0a0a', trackAlpha: 0.85, pad: 3, shine: 0, shade: 0.15, value: 0.55 } },
      { name: 'Grenade cooldown octagon', group: 'Game-inspired', values: { shape: 'octagon', fillMode: 'solid', fillColor: '#000000', fillAlpha: 0.55, fillDir: 'down', borderW: 3, borderColor: '#e8e2cf', trackColor: '#e8e2cf', trackAlpha: 0.15, pad: 0, shine: 0, shade: 0, shadowAlpha: 0, value: 0.4 } },
      { name: 'Neon hex core', group: 'Sci-fi', values: { shape: 'hexagon', rotation: 30, fillMode: 'along', fillColor: '#3cf2ff', fillColor2: '#7a5cff', borderW: 3, borderColor: '#3cf2ff', borderAlpha: 0.8, trackColor: '#03141a', trackAlpha: 0.55, pad: 5, shine: 0.25, shade: 0, glow: 0.7, glowSize: 12, glowColor: '#26d9ff', shadowAlpha: 0, margin: 22, segments: 8, segGap: 4 } },
      { name: 'Reactor cell (center)', group: 'Sci-fi', values: { shape: 'pentagon', fillDir: 'vcenter', fillColor: '#7dff8a', fillColor2: '#0a6a2a', borderW: 3, borderColor: '#7dff8a', borderAlpha: 0.6, trackColor: '#06180a', trackAlpha: 0.6, pad: 4, shine: 0.2, glow: 0.55, glowSize: 10, glowColor: '#5aff6a', shadowAlpha: 0, margin: 20 } },
      { name: 'Bio-hazard orb (worn)', group: 'Sci-fi', values: { shape: 'circle', fillColor: '#a8ff2a', fillColor2: '#2a6a0a', borderW: 8, borderColor: '#1a1d14', trackColor: '#0a0f06', trackAlpha: 0.95, pad: 2, shine: 0.2, shade: 0.5, wave: 0.5, waveCount: 2, gloss: 0.35, splitFrame: true, glow: 0.3, glowSize: 8, glowColor: '#8aff2a', distort: 0.12, grunge: 0.2, grungeType: 'cracks', grungeScale: 4, grungeOn: 'frame', edgeWear: 0.3, seed: 9, value: 0.5 } },
      // Post-apocalyptic: rust, scrap, dirt and wear
      { name: 'Fuel canister', group: 'Post-apocalyptic', values: { shape: 'rect', radius: 0.1, stretch: true, fillColor: '#b0402a', fillColor2: '#5a1a10', borderW: 7, borderColor: '#2a1a12', trackColor: '#141010', trackAlpha: 1, pad: 3, shine: 0.1, shade: 0.4, wave: 0.12, waveCount: 2, colorNoise: 0.45, noiseColor: '#4a2a14', grunge: 0.3, grungeType: 'chipped', grungeScale: 6, edgeWear: 0.5, dirt: 0.5, scratches: 0.35, seed: 14, value: 0.4 } },
      { name: 'Toxic waste hexagon', group: 'Post-apocalyptic', values: { shape: 'hexagon', fillColor: '#9ad02a', fillColor2: '#3a5a0a', borderW: 7, borderColor: '#1c1e10', trackColor: '#16180e', trackAlpha: 1, pad: 3, shine: 0.1, shade: 0.3, glow: 0.35, glowColor: '#b4ff3a', colorNoise: 0.3, noiseColor: '#2a3a0a', grunge: 0.3, grungeType: 'blotchy', grungeScale: 5, edgeWear: 0.45, dirt: 0.45, scratches: 0.3, seed: 22, value: 0.55 } },
    ],
    render(ctx, W, H, p, opts) {
      U.barRender(ctx, W, H, p, opts, geometry(W, H, p));
    },
  });
})();
