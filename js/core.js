/* UGTG core: generator registry, math, seeded RNG, tileable noise, color + canvas helpers */
(function () {
  'use strict';
  const U = (window.UGTG = window.UGTG || {});

  /* ---------- registry ---------- */
  U.generators = [];
  U.register = (g) => {
    // every preset list starts with the generator's own defaults
    if (g.presets) g.presets.unshift({ name: 'Default', group: 'Default', aspect: g.aspect || '1:1', values: {} });
    U.generators.push(g);
  };
  U.getGen = (id) => U.generators.find((g) => g.id === id);
  // filter tags, in display order; each generator lists up to 3 of them in `tags`
  U.TAGS = ['Horror', 'Texturing', 'UI', 'Shooter', 'Military', 'VFX', 'Lighting', 'Nature', 'Decals', 'Vehicles', 'Sci-fi'];

  /* ---------- math ---------- */
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (e0, e1, x) => {
    if (e0 === e1) return x < e0 ? 0 : 1;
    const t = clamp((x - e0) / (e1 - e0));
    return t * t * (3 - 2 * t);
  };
  const mod = (a, n) => ((a % n) + n) % n;
  const screen = (a, b) => 1 - (1 - a) * (1 - b);
  Object.assign(U, { clamp, lerp, smoothstep, mod, screen, TAU: Math.PI * 2 });

  U.rng = function (seed) {
    let a = (seed | 0) ^ 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function hash(x, y, s) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  U.hash = hash;

  /* ---------- tileable noise ----------
     Every basis takes a lattice period (px, py). Period 0 = no wrapping.
     Integer periods make the result tile seamlessly over [0, period). */
  const wrap = (i, p) => (p > 0 ? ((i % p) + p) % p : i);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

  U.value = function (x, y, px, py, s) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const xa = wrap(x0, px), xb = wrap(x0 + 1, px), ya = wrap(y0, py), yb = wrap(y0 + 1, py);
    const v = lerp(lerp(hash(xa, ya, s), hash(xb, ya, s), ux), lerp(hash(xa, yb, s), hash(xb, yb, s), ux), uy);
    return v * 2 - 1;
  };

  const GX = [1, -1, 0, 0, 0.7071, -0.7071, 0.7071, -0.7071];
  const GY = [0, 0, 1, -1, 0.7071, 0.7071, -0.7071, -0.7071];
  const grad = (ix, iy, s, dx, dy) => {
    const g = (hash(ix, iy, s) * 8) | 0;
    return GX[g] * dx + GY[g] * dy;
  };
  U.perlin = function (x, y, px, py, s) {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const fx = x - x0, fy = y - y0, ux = fade(fx), uy = fade(fy);
    const xa = wrap(x0, px), xb = wrap(x0 + 1, px), ya = wrap(y0, py), yb = wrap(y0 + 1, py);
    const n00 = grad(xa, ya, s, fx, fy), n10 = grad(xb, ya, s, fx - 1, fy);
    const n01 = grad(xa, yb, s, fx, fy - 1), n11 = grad(xb, yb, s, fx - 1, fy - 1);
    return lerp(lerp(n00, n10, ux), lerp(n01, n11, ux), uy) * 1.4142;
  };

  const WOUT = { f1: 0, f2: 0, id: 0 };
  U.worley = function (x, y, px, py, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 1e9, f2 = 1e9, id = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = xi + i, cy = yi + j, wx = wrap(cx, px), wy = wrap(cy, py);
        const dx = cx + hash(wx, wy, s) - x, dy = cy + hash(wx, wy, s + 7919) - y;
        const d = dx * dx + dy * dy;
        if (d < f1) { f2 = f1; f1 = d; id = hash(wx, wy, s + 104729); }
        else if (d < f2) f2 = d;
      }
    }
    WOUT.f1 = Math.sqrt(f1); WOUT.f2 = Math.sqrt(f2); WOUT.id = id;
    return WOUT;
  };

  const BASIS = {
    perlin: U.perlin,
    value: U.value,
    worley: (x, y, px, py, s) => U.worley(x, y, px, py, s).f1 * 2 - 1,
    cells: (x, y, px, py, s) => { const w = U.worley(x, y, px, py, s); return (w.f2 - w.f1) * 2 - 1; },
  };

  /* Fractal sum, lacunarity fixed at 2 so integer periods stay integer (= tileable). Returns 0..1 */
  U.fractal = function (basis, x, y, px, py, octaves, gain, mode, seed) {
    const fn = BASIS[basis] || U.perlin;
    let amp = 1, sum = 0, norm = 0, f = 1;
    for (let o = 0; o < octaves; o++) {
      let n = fn(x * f, y * f, px * f, py * f, seed + o * 1013);
      if (mode === 'ridged') { n = 1 - Math.abs(n); n = n * n * 2 - 1; }
      else if (mode === 'turbulence') n = Math.abs(n) * 2 - 1;
      sum += n * amp; norm += amp; amp *= gain; f *= 2;
    }
    return clamp((sum / norm) * 0.5 + 0.5);
  };

  /* ---------- color ---------- */
  U.hex = function (h) {
    h = String(h || '#000').replace('#', '');
    if (h.length === 3) h = h.replace(/./g, (c) => c + c);
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgba = (h, a) => { const c = U.hex(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

  /* stops: [[t, '#hex', alpha], ...] sorted by t -> 256-entry RGBA lookup table */
  U.ramp = function (stops) {
    const lut = new Uint8ClampedArray(1024);
    const cs = stops.map((s) => [s[0], U.hex(s[1]), s[2] == null ? 1 : s[2]]);
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      let k = 0;
      while (k < cs.length - 2 && t > cs[k + 1][0]) k++;
      const a = cs[k], b = cs[k + 1] || a;
      const f = b[0] > a[0] ? clamp((t - a[0]) / (b[0] - a[0])) : 0;
      lut[i * 4] = lerp(a[1][0], b[1][0], f);
      lut[i * 4 + 1] = lerp(a[1][1], b[1][1], f);
      lut[i * 4 + 2] = lerp(a[1][2], b[1][2], f);
      lut[i * 4 + 3] = lerp(a[2], b[2], f) * 255;
    }
    return lut;
  };

  /* write ramp color for intensity v into pixel `o`; `black` premultiplies onto a black background */
  U.putRamp = function (o, lut, v, black) {
    const j = ((v < 0 ? 0 : v > 1 ? 1 : v) * 255 | 0) * 4;
    if (black) {
      const a = lut[j + 3] / 255;
      o[0] = lut[j] * a; o[1] = lut[j + 1] * a; o[2] = lut[j + 2] * a; o[3] = 255;
    } else {
      o[0] = lut[j]; o[1] = lut[j + 1]; o[2] = lut[j + 2]; o[3] = lut[j + 3];
    }
  };

  /* ---------- canvas ---------- */
  U.canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };

  /* per-pixel renderer: fn(x, y, out) writes RGBA 0..255 into out */
  U.pixels = function (ctx, W, H, fn) {
    const img = ctx.createImageData(W, H), d = img.data, o = [0, 0, 0, 255];
    let i = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        o[3] = 255;
        fn(x, y, o);
        d[i++] = o[0]; d[i++] = o[1]; d[i++] = o[2]; d[i++] = o[3];
      }
    }
    ctx.putImageData(img, 0, 0);
  };

  U.rotPts = (pts, cx, cy, a) => {
    const c = Math.cos(a), s = Math.sin(a);
    return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
  };

  /* closed polygon path with optional corner rounding (radius clamped per corner) */
  U.polyPath = function (ctx, pts, r) {
    const n = pts.length;
    if (!r) {
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      return;
    }
    const a0 = pts[n - 1], b0 = pts[0];
    ctx.moveTo((a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2);
    for (let i = 0; i < n; i++) {
      const c = pts[i], pr = pts[(i + n - 1) % n], nx = pts[(i + 1) % n];
      const ax = pr[0] - c[0], ay = pr[1] - c[1], bx = nx[0] - c[0], by = nx[1] - c[1];
      const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      const half = Math.acos(clamp((ax * bx + ay * by) / (la * lb || 1), -1, 1)) / 2;
      const rr = Math.min(r, (Math.tan(half) * Math.min(la, lb)) / 2);
      ctx.arcTo(c[0], c[1], nx[0], nx[1], Math.max(0, rr));
    }
    ctx.closePath();
  };

  /* ---------- blur ----------
     Gaussian-like blur of RGBA ImageData (3 box passes per axis, premultiplied so transparent pixels
     don't bleed dark fringes). `r` = blur radius in px; `wrap` samples across the edges (tileable).
     Returns a new Float32Array of premultiplied RGBA (0..255) so callers can blend before writing. */
  U.blurRGBA = function (src, W, H, r, wrap) {
    const N = W * H, a = new Float32Array(N * 4), b = new Float32Array(N * 4);
    for (let i = 0, k = 0; i < N; i++, k += 4) {
      const al = src[k + 3] / 255;
      a[k] = src[k] * al; a[k + 1] = src[k + 1] * al; a[k + 2] = src[k + 2] * al; a[k + 3] = src[k + 3];
    }
    const br = Math.max(1, Math.round(r / 1.73)); // 3 box passes of radius br ≈ gaussian with sigma ≈ r / 2
    const ix = (i, n) => (wrap ? ((i % n) + n) % n : i < 0 ? 0 : i >= n ? n - 1 : i);
    const pass = (s, d, len, lines, step, lineStep) => {
      const inv = 1 / (2 * br + 1);
      for (let l = 0; l < lines; l++) {
        const o = l * lineStep * 4, st = step * 4;
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let k = -br; k <= br; k++) sum += s[o + ix(k, len) * st + c];
          for (let i = 0; i < len; i++) {
            d[o + i * st + c] = sum * inv;
            sum += s[o + ix(i + br + 1, len) * st + c] - s[o + ix(i - br, len) * st + c];
          }
        }
      }
    };
    for (let n = 0; n < 3; n++) { pass(a, b, W, H, 1, W); pass(b, a, H, W, W, 1); }
    return a;
  };

  /* ---------- cellular (Voronoi) with exact border distance ----------
     X, Y in lattice units over a periodic nx × ny lattice (whole numbers -> tiles). One feature point
     per lattice cell, jittered by `jit` (0 = grid, 1 = fully random inside its cell); `stag` offsets
     every odd row by half a cell (needs an even ny to tile). sx / sy: pixels per lattice unit, so
     distances are measured in pixels even for stretched cells. Writes into `out`:
       id  0..1 per cell, e = exact distance to the cell border (px), f1 = distance to the point (px),
       ci, cj = wrapped cell index, es = smooth-min border distance (rounded corners) when k > 0 */
  // feature point offsets per lattice cell, cached per (nx, ny, seed, jit, stag)
  const voroTables = new Map();
  function voroTable(nx, ny, seed, jit, stag) {
    const key = nx + ',' + ny + ',' + seed + ',' + jit + ',' + (stag ? 1 : 0);
    let t = voroTables.get(key);
    if (t) return t;
    if (voroTables.size > 24) voroTables.clear();
    t = { ox: new Float32Array(nx * ny), oy: new Float32Array(nx * ny), id: new Float32Array(nx * ny) };
    for (let j = 0, n = 0; j < ny; j++) for (let i = 0; i < nx; i++, n++) {
      t.ox[n] = 0.5 + (stag && (j & 1) ? 0.5 : 0) + (hash(i, j, seed) - 0.5) * jit;
      t.oy[n] = 0.5 + (hash(i, j, seed + 7) - 0.5) * jit;
      t.id[n] = hash(i, j, seed + 104729);
    }
    voroTables.set(key, t);
    return t;
  }

  U.voro = function (X, Y, nx, ny, seed, jit, stag, sx, sy, k, out) {
    const T = voroTable(nx, ny, seed, jit, stag), OX = T.ox, OY = T.oy;
    const P = U._vp || (U._vp = { x: 0, y: 0, wi: 0, wj: 0 });
    const pt = (i, j, o) => {
      let wi = i % nx; if (wi < 0) wi += nx;
      let wj = j % ny; if (wj < 0) wj += ny;
      const n = wj * nx + wi;
      o.x = i + OX[n]; o.y = j + OY[n]; o.wi = wi; o.wj = wj;
      return o;
    };
    const xi = Math.floor(X), yi = Math.floor(Y);
    let best = 1e18, ax = 0, ay = 0, bi = 0, bj = 0, bwi = 0, bwj = 0;
    for (let j = yi - 1; j <= yi + 1; j++) {
      for (let i = xi - (stag ? 2 : 1); i <= xi + 1; i++) {
        pt(i, j, P);
        const dx = (P.x - X) * sx, dy = (P.y - Y) * sy, d = dx * dx + dy * dy;
        if (d < best) { best = d; ax = P.x; ay = P.y; bi = i; bj = j; bwi = P.wi; bwj = P.wj; }
      }
    }
    // second pass: distance to the bisector with every neighbour point (exact cell border distance)
    let e = 1e9, es = 0;
    const kk = k > 0 ? k : 0, lim = kk * 6;
    const ds = U._vds || (U._vds = new Float64Array(32));
    let nd = 0;
    for (let j = bj - 2; j <= bj + 2; j++) {
      for (let i = bi - 2; i <= bi + 2; i++) {
        if (i === bi && j === bj) continue;
        pt(i, j, P);
        const ux = (P.x - ax) * sx, uy = (P.y - ay) * sy, l = Math.sqrt(ux * ux + uy * uy);
        if (l < 1e-9) continue;
        const mx = ((ax + P.x) * 0.5 - X) * sx, my = ((ay + P.y) * 0.5 - Y) * sy;
        const d = (mx * ux + my * uy) / l;
        if (d < e) e = d;
        if (kk && nd < 32) ds[nd++] = d;
      }
    }
    if (kk) {
      let s = 0;
      for (let n = 0; n < nd; n++) if (ds[n] < e + lim) s += Math.exp(-(ds[n] - e) / kk);
      es = e - kk * Math.log(s || 1);
    }
    out.id = T.id[bwj * nx + bwi];
    out.e = e; out.es = kk ? es : e; out.f1 = Math.sqrt(best);
    out.ci = bwi; out.cj = bwj; out.px = ax; out.py = ay;
    return out;
  };

  /* bilinear W×H field from fn(x, y) sampled on a coarse grid (~`cells` samples per short side):
     cheap smooth noise that looks the same at every resolution */
  U.coarseField = function (W, H, cells, fn) {
    const S = Math.min(W, H), st = Math.max(1, S / cells), gw = Math.ceil(W / st) + 2, gh = Math.ceil(H / st) + 2;
    const g = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fn(Math.min(W, i * st), Math.min(H, j * st));
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const fy = y / st, j = Math.floor(fy), ty = fy - j;
      for (let x = 0; x < W; x++) {
        const fx = x / st, i = Math.floor(fx), tx = fx - i, o = j * gw + i;
        const a0 = g[o] + (g[o + 1] - g[o]) * tx, b0 = g[o + gw] + (g[o + gw + 1] - g[o + gw]) * tx;
        out[y * W + x] = a0 + (b0 - a0) * ty;
      }
    }
    return out;
  };

  U.icon = (inner) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

  /* ---------- shared bits for the muzzle flash generators ---------- */
  U.flashLUT = (p) =>
    U.ramp([[0, p.cOuter, 0], [0.22, p.cOuter, 0.55], [0.5, p.cMid, 0.95], [0.8, p.cCore, 1], [1, p.cCore, 1]]);

  U.flashColorParams = () => [
    { type: 'section', label: 'Color' },
    { key: 'cCore', label: 'Core', type: 'color', default: '#ffffff' },
    { key: 'cMid', label: 'Mid', type: 'color', default: '#cfcfcf' },
    { key: 'cOuter', label: 'Outer', type: 'color', default: '#7a7a7a' },
    { key: 'glow', label: 'Brightness', type: 'range', min: 0.2, max: 2.5, step: 0.01, default: 1 },
    { key: 'bgBlack', label: 'Black background (additive)', type: 'bool', default: false },
  ];
})();
