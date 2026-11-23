/* Dirt: tileable dry soil and ground. Loose soil with clods (rounded Voronoi lumps), fine granules and
   sand, pebbles and bigger stones with their own palette, organic debris (twigs, leaf bits, half-buried
   roots, dry grass sprigs), optional plowed furrows / rake lines and a dusty or damp finish. Shaded from
   its own height (directional light + contact shadows) so the albedo already reads three-dimensional;
   height map for the normal map mode. Everything wraps across the edges: seamless. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;
  const V = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };
  const wrapped = (c, W, H, fn) => { for (const oy of [-H, 0, H]) for (const ox of [-W, 0, W]) fn(c, ox, oy); };

  const SOILS = {
    loam: ['#5e4630', '#3a2a1c', '#9a8466'],
    sand: ['#b89a6e', '#8a6e4a', '#d8c4a0'],
    clay: ['#8a5236', '#5a3220', '#b8825e'],
    forest: ['#3e2e20', '#22180f', '#6a5a44'],
    ash: ['#55524e', '#2e2c2a', '#8a8680'],
    red: ['#9a4a2a', '#6a2a14', '#c8805a'],
  };

  U.register({
    id: 'dirt',
    name: 'Dirt',
    desc: 'Tileable dry soil with clods, granules, pebbles, stones, twigs, leaves, roots, grass bits and plowed furrows',
    uses: ['Albedo and height textures for dirt paths, fields, forest floors, desert ground and terrain layers; the height drives the normal map mode or terrain height blending.', 'Ground tiles for top-down, strategy and survival games.'],
    tags: ['PBR', 'Nature'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<path d="M3 17c3-2 6-2 9 0s6 2 9 0"/><circle cx="7" cy="12" r="1.6"/><circle cx="15" cy="10" r="1.1"/><circle cx="18" cy="14" r=".8"/><path d="M9 8l4 1" opacity=".6"/>'),
    params: [
      { type: 'section', label: 'Soil' },
      { key: 'soil', label: 'Soil type', type: 'select', default: 'loam', options: [['loam', 'Loam (brown)'], ['sand', 'Sandy'], ['clay', 'Clay'], ['forest', 'Forest humus'], ['ash', 'Ash / burnt'], ['red', 'Red earth']], apply: (v, p) => { const s = SOILS[v]; if (s) { p.soil1 = s[0]; p.soil2 = s[1]; p.dust = s[2]; } } },
      { key: 'scale', label: 'Scale', type: 'int', min: 1, max: 12, default: 3, tip: 'Large color / height variation across the texture' },
      { key: 'clods', label: 'Clods', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Lumps of packed soil' },
      { key: 'clodScale', label: 'Clod scale', type: 'int', min: 4, max: 80, default: 22, show: (p) => p.clods > 0, tip: 'Clods across the texture' },
      { key: 'granules', label: 'Granules', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Fine crumbs and sand grains' },
      { key: 'furrows', label: 'Furrows', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Plowed rows / rake lines running top to bottom' },
      { key: 'furrowCount', label: 'Furrow count', type: 'int', min: 2, max: 40, default: 8, show: (p) => p.furrows > 0 },
      { key: 'bump', label: 'Relief', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'How strongly the height shades the color' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 17 },

      { type: 'section', label: 'Stones' },
      { key: 'pebbles', label: 'Pebbles', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'pebbleSize', label: 'Pebble size', type: 'range', min: 0.3, max: 2, step: 0.01, default: 1, show: (p) => p.pebbles > 0 },
      { key: 'stones', label: 'Big stones', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: 'stone1', label: 'Stone color', type: 'color', default: '#8e887e' },
      { key: 'stone2', label: 'Second stone color', type: 'color', default: '#6a5e50' },

      { type: 'section', label: 'Organic', active: (p) => p.twigs > 0 || p.leaves > 0 || p.roots > 0 || p.grass > 0 },
      { key: 'twigs', label: 'Twigs', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15 },
      { key: 'leaves', label: 'Leaf bits', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: 'leafColor', label: 'Leaf color', type: 'color', default: '#8a5a24', show: (p) => p.leaves > 0 },
      { key: 'roots', label: 'Roots', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Half-buried root strands' },
      { key: 'grass', label: 'Dry grass bits', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: 'grassColor', label: 'Grass color', type: 'color', default: '#a09450', show: (p) => p.grass > 0 },

      { type: 'section', label: 'Color' },
      { key: 'soil1', label: 'Soil color', type: 'color', default: SOILS.loam[0] },
      { key: 'soil2', label: 'Dark soil', type: 'color', default: SOILS.loam[1] },
      { key: 'dust', label: 'Dust color', type: 'color', default: SOILS.loam[2] },
      { key: 'dryness', label: 'Dusty tops', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Dry, light dust on the raised parts' },
      { key: 'damp', label: 'Dampness', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Darker, saturated damp soil in the low areas' },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
    ],
    presets: [
      { name: 'Brown dirt', group: 'Realistic', values: {} },
      { name: 'Dirt path', group: 'Realistic', values: { clods: 0.3, granules: 0.7, pebbles: 0.55, pebbleSize: 0.8, stones: 0.15, twigs: 0.05, leaves: 0.05, grass: 0.15, dryness: 0.6 } },
      { name: 'Plowed field', group: 'Realistic', values: { furrows: 0.85, furrowCount: 7, clods: 0.8, clodScale: 18, pebbles: 0.15, stones: 0, twigs: 0, leaves: 0, grass: 0.2, damp: 0.25, dryness: 0.25 } },
      { name: 'Forest floor', group: 'Realistic', values: { soil: 'forest', ...soil('forest'), clods: 0.4, pebbles: 0.1, stones: 0.05, twigs: 0.5, leaves: 0.6, roots: 0.4, grass: 0, dryness: 0.1, damp: 0.3 } },
      { name: 'Desert sand & gravel', group: 'Realistic', values: { soil: 'sand', ...soil('sand'), clods: 0.1, granules: 0.9, pebbles: 0.5, pebbleSize: 0.7, stones: 0.12, twigs: 0.02, leaves: 0, grass: 0.05, dryness: 0.7, stone1: '#a8957a', stone2: '#7a6448' } },
      { name: 'Clay ground', group: 'Realistic', values: { soil: 'clay', ...soil('clay'), clods: 0.7, clodScale: 14, pebbles: 0.15, twigs: 0.05, grass: 0.05 } },
      { name: 'Red earth outback', group: 'Realistic', values: { soil: 'red', ...soil('red'), clods: 0.35, granules: 0.8, pebbles: 0.45, stones: 0.15, grass: 0.25, grassColor: '#b8a050', dryness: 0.7 } },
      { name: 'Burnt ground', group: 'Realistic', values: { soil: 'ash', ...soil('ash'), clods: 0.4, pebbles: 0.25, twigs: 0.45, leaves: 0, grass: 0, roots: 0.1, dryness: 0.5, stone1: '#4a4642', stone2: '#2a2826' } },
      { name: 'Raked garden soil', group: 'Realistic', values: { soil: 'forest', ...soil('forest'), furrows: 0.5, furrowCount: 24, clods: 0.6, clodScale: 40, pebbles: 0.05, stones: 0, twigs: 0, leaves: 0, grass: 0, damp: 0.5, dryness: 0 } },
      { name: 'Gravel yard', group: 'Realistic', values: { pebbles: 1, pebbleSize: 0.9, stones: 0.3, clods: 0.1, granules: 0.5, twigs: 0, leaves: 0, grass: 0.05, dryness: 0.5 } },
      { name: 'Hand-painted dirt', group: 'Stylized', values: { clods: 0.6, clodScale: 12, granules: 0.1, pebbles: 0.3, pebbleSize: 1.5, stones: 0.15, twigs: 0, leaves: 0.15, grass: 0.1, colorVar: 0.3, bump: 0.8, soil1: '#8a6040', soil2: '#5a3a24', dust: '#c09a70' } },
      { name: 'Mars regolith', group: 'Sci-fi', values: { soil: 'red', soil1: '#b05a32', soil2: '#6a2c18', dust: '#e0a070', clods: 0.2, granules: 0.9, pebbles: 0.5, stones: 0.25, twigs: 0, leaves: 0, grass: 0, roots: 0, dryness: 0.8, stone1: '#7a4a34', stone2: '#4a2a1e' } },
      { name: 'Alien soil', group: 'Sci-fi', values: { soil1: '#3a3050', soil2: '#1a1428', dust: '#8a7ab0', clods: 0.5, pebbles: 0.3, stone1: '#5fe3b0', stone2: '#2a8a6a', twigs: 0.2, leaves: 0, grass: 0.2, grassColor: '#c03aff', roots: 0.3 } },
    ],

    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height), S = Math.min(W, H), k = S / 512, seed = p.seed | 0, N = W * H, ar = H / W;
      const per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const [sx, sy] = per(p.scale), [clx, cly] = per(p.clodScale), [gx, gy] = per(p.scale * 40);
      const [pbx, pby] = per(Math.round(28 / Math.max(0.3, p.pebbleSize))), [stx, sty] = per(Math.max(2, Math.round(p.scale * 2.5)));

      // ---- organic debris on a color canvas (twigs, leaves, grass) and a root canvas, wrapped ----
      const area = (W * H) / (S * S);
      const deb = U.canvas(W, H), dg = deb.getContext('2d'), rnd = U.rng(seed + 400);
      let anyDeb = false, RT = null;
      if (p.roots > 0) {
        const rc = U.canvas(W, H), g = rc.getContext('2d'), n = Math.round(p.roots * 10 * area);
        g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round';
        for (let i = 0; i < n; i++) {
          let x = rnd() * W, y = rnd() * H, a = rnd() * U.TAU;
          const pts = [[x, y]], w0 = k * (2 + rnd() * 5);
          for (let s = 0; s < 14; s++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * S * 0.03; y += Math.sin(a) * S * 0.03; pts.push([x, y]); }
          wrapped(g, W, H, (c, ox, oy) => {
            for (let s = 1; s < pts.length; s++) {
              c.lineWidth = w0 * (1 - s / pts.length * 0.7);
              c.beginPath(); c.moveTo(pts[s - 1][0] + ox, pts[s - 1][1] + oy); c.lineTo(pts[s][0] + ox, pts[s][1] + oy); c.stroke();
            }
          });
        }
        const d = g.getImageData(0, 0, W, H).data;
        RT = new Float32Array(N);
        for (let i = 0; i < N; i++) RT[i] = d[i * 4 + 3] / 255;
      }
      const stroke = (n, color, wMin, wMax, lMin, lMax, bendK, alpha) => {
        dg.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI, l = S * (lMin + rnd() * (lMax - lMin)), bend = (rnd() - 0.5) * l * bendK;
          const ex = Math.cos(a) * l, ey = Math.sin(a) * l, sh = 0.7 + rnd() * 0.5, c0 = U.hex(color);
          dg.lineWidth = Math.max(0.7, k * (wMin + rnd() * (wMax - wMin)));
          dg.strokeStyle = `rgba(${c0[0] * sh | 0},${c0[1] * sh | 0},${c0[2] * sh | 0},${alpha})`;
          wrapped(dg, W, H, (c, ox, oy) => { c.beginPath(); c.moveTo(x + ox, y + oy); c.quadraticCurveTo(x + ox + ex / 2 - Math.sin(a) * bend, y + oy + ey / 2 + Math.cos(a) * bend, x + ox + ex, y + oy + ey); c.stroke(); });
        }
        anyDeb = true;
      };
      dg.save();
      dg.shadowColor = 'rgba(0,0,0,0.45)'; dg.shadowBlur = 2.5 * k; dg.shadowOffsetX = 1.5 * k; dg.shadowOffsetY = 1.5 * k;
      if (p.grass > 0) stroke(Math.round(p.grass * 220 * area), p.grassColor, 0.8, 1.8, 0.02, 0.06, 0.5, 0.9);
      if (p.twigs > 0) stroke(Math.round(p.twigs * 45 * area), '#5a4430', 2, 5, 0.03, 0.12, 0.2, 1);
      if (p.leaves > 0) {
        const n = Math.round(p.leaves * 160 * area), lc = U.hex(p.leafColor);
        for (let i = 0; i < n; i++) {
          const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI, L = S * (0.008 + rnd() * 0.022), v = 0.6 + rnd() * 0.6, hueS = rnd();
          const col = `rgb(${clamp(lc[0] * v * (0.8 + hueS * 0.4), 0, 255) | 0},${clamp(lc[1] * v, 0, 255) | 0},${clamp(lc[2] * v * (1.2 - hueS * 0.4), 0, 255) | 0})`;
          wrapped(dg, W, H, (c, ox, oy) => {
            c.save(); c.translate(x + ox, y + oy); c.rotate(a);
            c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, L, L * (0.35 + hueS * 0.25), 0, 0, U.TAU); c.fill();
            c.restore();
          });
        }
        anyDeb = true;
      }
      dg.restore();
      let DB = null;
      if (anyDeb) DB = dg.getImageData(0, 0, W, H).data;

      // ---- pass 1: height ----
      const base = U.coarseField(W, H, 200, (x, y) => U.fractal('perlin', (x / W) * sx, (y / H) * sy, sx, sy, 5, 0.55, 'fbm', seed));
      const cvar = U.coarseField(W, H, 200, (x, y) => U.fractal('perlin', (x / W) * sx * 2, (y / H) * sy * 2, sx * 2, sy * 2, 3, 0.5, 'fbm', seed + 5));
      const Hh = new Float32Array(N), ST = new Float32Array(N), SC = new Float32Array(N), CL = new Float32Array(N);
      const fN = Math.max(1, p.furrowCount | 0);
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W, v = (y + 0.5) / H;
          let h = base[i] * 0.35;
          if (p.furrows > 0) {
            const wob = (cvar[i] - 0.5) * 0.25, f = Math.sin((u * fN + wob) * U.TAU);
            h += (f * 0.5 + 0.5) * 0.35 * p.furrows - 0.1 * p.furrows;
          }
          if (p.clods > 0) {
            // warped coordinates + varied size / visibility: loose lumps, not an even egg-crate
            U.voro(u * clx + (cvar[i] - 0.5) * 2.2, v * cly + (base[i] - 0.5) * 2.2, clx, cly, seed + 1, 1, false, W / clx, H / cly, Math.min(W / clx, H / cly) * 0.18, V);
            const R = Math.min(W / clx, H / cly) * 0.5, t = clamp(V.es / (R * (0.5 + V.id * 0.6)));
            const dome = Math.sqrt(1 - (1 - t) * (1 - t)) * (0.25 + V.id * V.id * 1.1);
            const vis = smoothstep(0.45 - p.clods * 0.35, 0.65 - p.clods * 0.35, hash(V.ci, V.cj, seed + 2) * 0.7 + base[i] * 0.5);
            CL[i] = dome * vis;
            h += dome * vis * 0.22 * p.clods;
          }
          if (p.granules > 0) h += ((U.fractal('perlin', u * gx, v * gy, gx, gy, 2, 0.5, 'fbm', seed + 3) - 0.5) * 0.08 + (hash(x, y, seed + 4) - 0.5) * 0.04) * p.granules;
          if (RT) h = lerp(h, h + 0.06, RT[i] * p.roots);
          // pebbles (small) and stones (big): irregular domes
          const stoneAt = (fx, fy, s, amt, rMin, rVar, hgt) => {
            const w = U.worley(u * fx, v * fy, fx, fy, s);
            if (w.id >= amt) return;
            // irregular outline, flat-topped profile, sitting in the soil rather than on top of it
            const wob = (U.fractal('perlin', u * fx * 3, v * fy * 3, fx * 3, fy * 3, 2, 0.5, 'fbm', s + 1) - 0.5) * 0.22;
            const q = w.id / Math.max(0.01, amt), r = rMin + q * q * rVar, t = clamp(1 - (w.f1 + wob) / r);
            if (t <= 0) return;
            const c = smoothstep(0, 0.12, t), hh = h + 0.02 + smoothstep(0, 0.6, t) * hgt * (0.6 + q * 0.6);
            if (c > ST[i]) { ST[i] = c; SC[i] = hash(Math.floor(w.id * 9973), 1, s); }
            h = lerp(h, Math.max(h, hh), c);
          };
          if (p.pebbles > 0) stoneAt(pbx, pby, seed + 10, p.pebbles * 0.38, 0.1, 0.22, 0.07);
          if (p.stones > 0) stoneAt(stx, sty, seed + 20, p.stones * 0.5, 0.2, 0.18, 0.2);
          if (DB) h += (DB[i * 4 + 3] / 255) * 0.05;
          Hh[i] = h;
        }
      }

      const img = ctx.createImageData(W, H), o = img.data;
      if (height) {
        for (let i = 0; i < N; i++) { o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = clamp(Hh[i]) * 255; o[i * 4 + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        return;
      }

      // ---- pass 2: color + lighting ----
      const s1 = U.hex(p.soil1), s2 = U.hex(p.soil2), du = U.hex(p.dust), st1 = U.hex(p.stone1), st2 = U.hex(p.stone2);
      const K = p.bump * 0.4, Lx = -0.55, Ly = -0.6, Lz = 0.58, so = Math.max(1, Math.round(2.5 * k));
      let hMin = Infinity, hMax = -Infinity;
      for (let i = 0; i < N; i++) { if (Hh[i] < hMin) hMin = Hh[i]; if (Hh[i] > hMax) hMax = Hh[i]; }
      const hr = 1 / Math.max(1e-6, hMax - hMin);
      for (let y = 0, i = 0; y < H; y++) {
        const yu = U.mod(y - 1, H) * W, yd = U.mod(y + 1, H) * W, ys = U.mod(y - so, H) * W;
        for (let x = 0; x < W; x++, i++) {
          const xl = x ? x - 1 : W - 1, xr = x === W - 1 ? 0 : x + 1, row = y * W, h = Hh[i], hn = (h - hMin) * hr;
          const gxv = (Hh[row + xr] - Hh[row + xl]) * 0.5 * S, gyv = (Hh[yd + x] - Hh[yu + x]) * 0.5 * S;
          let nx = -gxv * K, ny = -gyv * K, nz = 1;
          const nl = 1 / Math.sqrt(nx * nx + ny * ny + 1); nx *= nl; ny *= nl; nz *= nl;
          const lam = nx * Lx + ny * Ly + nz * Lz;
          const sh = clamp((Hh[ys + U.mod(x - so, W)] - h) * 7) * p.bump;
          // soil
          const f = clamp(0.5 + (cvar[i] - 0.5) * p.colorVar * 1.8 - CL[i] * 0.15 + (hash(x, y, seed + 6) - 0.5) * p.granules * 0.25);
          let r = lerp(s2[0], s1[0], f), g = lerp(s2[1], s1[1], f), b = lerp(s2[2], s1[2], f);
          if (p.dryness > 0) { const d = smoothstep(0.45, 0.85, hn + (cvar[i] - 0.5) * 0.3) * p.dryness; r = lerp(r, du[0], d); g = lerp(g, du[1], d); b = lerp(b, du[2], d); }
          if (RT && RT[i] > 0) { const t = RT[i] * p.roots; r = lerp(r, 70, t); g = lerp(g, 50, t); b = lerp(b, 34, t); }
          if (ST[i] > 0) {
            const t = ST[i], q = SC[i], vv = 0.8 + hash(x >> 1, y >> 1, seed + 7) * 0.3;
            r = lerp(r, lerp(st2[0], st1[0], q) * vv, t); g = lerp(g, lerp(st2[1], st1[1], q) * vv, t); b = lerp(b, lerp(st2[2], st1[2], q) * vv, t);
          }
          if (DB) { const a = DB[i * 4 + 3] / 255; if (a > 0) { r = lerp(r, DB[i * 4], a); g = lerp(g, DB[i * 4 + 1], a); b = lerp(b, DB[i * 4 + 2], a); } }
          if (p.damp > 0) {
            const d = (1 - smoothstep(0.2, 0.6, hn)) * p.damp, l = (r + g + b) / 3;
            r = lerp(r, (r - l) * 1.3 + l * 0.55, d); g = lerp(g, (g - l) * 1.3 + l * 0.55, d); b = lerp(b, (b - l) * 1.3 + l * 0.58, d);
          }
          const light = (0.5 + 0.7 * lam) * (1 - sh * 0.5);
          const k4 = i * 4;
          o[k4] = r * light; o[k4 + 1] = g * light; o[k4 + 2] = b * light; o[k4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });

  function soil(name) { const s = SOILS[name]; return { soil1: s[0], soil2: s[1], dust: s[2] }; }
})();
