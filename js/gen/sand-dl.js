/* Sand & riverbed: tileable sand surfaces, from desert and beach to shallow and submerged riverbeds.
   Wind / current ripples (asymmetric profile with a gentle stoss side and a steep lee side, whole wave
   counts per tile, warped and fading in patches), dunes, fine grain and sparkle; rounded river stones
   and shell bits half buried in the sand; an optional water layer above a level: depth-dependent tint
   and absorption, animated-looking caustics, wet sand along the waterline and algae in the deep parts.
   Shaded from its own height; height map for the normal map mode. Seamless. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;
  const DEG = Math.PI / 180;

  U.register({
    id: 'sand-dl',
    name: 'Sand & Riverbed (download)',
    desc: 'Tileable sand with wind / current ripples, dunes, river stones and shells, optional shallow water with caustics',
    uses: ['Albedo and height textures for beaches, deserts, sandbanks and river or lake beds; with the water layer, a ready riverbed seen through shallow water.', 'Ground layers for terrain shaders, e.g. sand blended along shorelines.'],
    tags: ['Texturing', 'Nature'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0" opacity=".6"/><circle cx="8" cy="19" r="1.2"/><circle cx="15" cy="18.5" r="1.6"/>'),
    params: [
      { type: 'section', label: 'Sand' },
      { key: 'ripples', label: 'Ripples', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7 },
      { key: 'rippleScale', label: 'Ripple count', type: 'int', min: 2, max: 60, default: 14, show: (p) => p.ripples > 0, tip: 'Ripples across the texture (whole numbers, so it tiles)' },
      { key: 'angle', label: 'Ripple direction (°)', type: 'range', min: 0, max: 180, step: 1, default: 15, show: (p) => p.ripples > 0, tip: 'Direction the crests run. Rounded to whole wave counts per tile' },
      { key: 'rippleSharp', label: 'Lee steepness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.ripples > 0, tip: 'Asymmetric ripples: gentle on one side, steep on the other' },
      { key: 'rippleWarp', label: 'Ripple wobble', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.ripples > 0 },
      { key: 'rippleBreak', label: 'Ripple patches', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.ripples > 0, tip: 'Ripples fade out in some areas' },
      { key: 'dunes', label: 'Dunes', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Large, soft height variation' },
      { key: 'grain', label: 'Grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55 },
      { key: 'sparkle', label: 'Sparkle', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Glinting quartz / mica grains' },
      { key: 'bump', label: 'Relief', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'How strongly the height shades the color' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 9 },

      { type: 'section', label: 'Stones', active: (p) => p.pebbles > 0 || p.shells > 0 },
      { key: 'pebbles', label: 'River stones', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: 'pebbleSize', label: 'Stone size', type: 'range', min: 0.3, max: 3, step: 0.01, default: 1, show: (p) => p.pebbles > 0 },
      { key: 'c1', label: 'Stone color 1', type: 'color', default: '#8a8070', show: (p) => p.pebbles > 0 },
      { key: 'c2', label: 'Stone color 2', type: 'color', default: '#5e5a52', show: (p) => p.pebbles > 0 },
      { key: 'c3', label: 'Stone color 3', type: 'color', default: '#a07a5a', show: (p) => p.pebbles > 0 },
      { key: 'shells', label: 'Shell bits', type: 'range', min: 0, max: 1, step: 0.01, default: 0.05 },

      { type: 'section', label: 'Water', active: (p) => p.water > 0 },
      { key: 'water', label: 'Water level', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: '0 = dry, 1 = everything under water (riverbed)' },
      { key: 'waterColor', label: 'Water color', type: 'color', default: '#2f6a6a', show: (p) => p.water > 0 },
      { key: 'clarity', label: 'Clarity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, show: (p) => p.water > 0, tip: 'How deep you can see into the water' },
      { key: 'caustics', label: 'Caustics', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.water > 0, tip: 'Light patterns focused by the water surface' },
      { key: 'causticScale', label: 'Caustic scale', type: 'int', min: 2, max: 30, default: 8, show: (p) => p.water > 0 && p.caustics > 0 },
      { key: 'algae', label: 'Algae', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.water > 0, tip: 'Green growth in the deeper parts' },
      { key: 'algaeColor', label: 'Algae color', type: 'color', default: '#4a6a2a', show: (p) => p.water > 0 && p.algae > 0 },
      { key: 'wetEdge', label: 'Wet sand', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.water > 0, tip: 'Dark, wet sand above the waterline' },

      { type: 'section', label: 'Color' },
      { key: 'sand1', label: 'Sand color', type: 'color', default: '#d2b689' },
      { key: 'sand2', label: 'Dark / wet sand', type: 'color', default: '#8e7350' },
      { key: 'crest', label: 'Crest light', type: 'color', default: '#ead5ac', tip: 'Dry, wind-sorted sand on the crests' },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
    ],
    presets: [
      { name: 'Desert ripples', group: 'Dry', values: {} },
      { name: 'Beach sand', group: 'Dry', values: { ripples: 0.35, rippleScale: 10, dunes: 0.2, shells: 0.35, pebbles: 0.05, sand1: '#dcc8a0', sand2: '#a08a66', crest: '#efe2c4', sparkle: 0.3 } },
      { name: 'Dune crest', group: 'Dry', values: { ripples: 0.9, rippleScale: 22, rippleSharp: 0.85, rippleWarp: 0.3, rippleBreak: 0.1, dunes: 0.8, sand1: '#d8a868', sand2: '#a0703c', crest: '#f0c890' } },
      { name: 'Red desert', group: 'Dry', values: { sand1: '#c27a48', sand2: '#8a4a28', crest: '#e09a62', ripples: 0.75, rippleScale: 16, pebbles: 0.08, c1: '#6a3a24', c2: '#4a2a1a', c3: '#8a5a3a' } },
      { name: 'White gypsum sand', group: 'Dry', values: { sand1: '#ece8dc', sand2: '#b8b2a2', crest: '#ffffff', ripples: 0.6, sparkle: 0.5, grain: 0.35 } },
      { name: 'Black volcanic beach', group: 'Dry', values: { sand1: '#3a3836', sand2: '#1e1d1c', crest: '#5a5754', ripples: 0.3, sparkle: 0.6, pebbles: 0.2, c1: '#2a2826', c2: '#141312', c3: '#4a4440', shells: 0 } },
      { name: 'Wet sandbank', group: 'Water', values: { water: 0.35, ripples: 0.6, rippleScale: 18, rippleSharp: 0.3, dunes: 0.4, wetEdge: 0.8, caustics: 0.4, shells: 0.15, clarity: 0.7 } },
      { name: 'Shallow beach water', group: 'Water', values: { water: 0.75, waterColor: '#3a9aa0', clarity: 0.85, caustics: 0.8, causticScale: 6, ripples: 0.5, rippleScale: 12, shells: 0.25, sand1: '#e0cca4' } },
      { name: 'Clear river bed', group: 'Water', values: { water: 1, waterColor: '#3a6a5a', clarity: 0.8, caustics: 0.7, ripples: 0.45, rippleScale: 9, angle: 90, rippleSharp: 0.4, pebbles: 0.65, pebbleSize: 1.3, dunes: 0.25, sand1: '#b09a76', sand2: '#7a6a50', crest: '#c8b48e' } },
      { name: 'Pebbly stream', group: 'Water', values: { water: 0.85, waterColor: '#4a7060', clarity: 0.75, caustics: 0.55, ripples: 0.2, pebbles: 1, pebbleSize: 1.6, algae: 0.3, sand1: '#a08e70', sand2: '#6a5a44' } },
      { name: 'Murky lake bottom', group: 'Water', values: { water: 1, waterColor: '#3e4a2e', clarity: 0.3, caustics: 0.25, ripples: 0.2, pebbles: 0.2, algae: 0.7, algaeColor: '#3a5020', sand1: '#8a7a5a', sand2: '#5a4e38' } },
      { name: 'Tropical lagoon', group: 'Water', values: { water: 0.9, waterColor: '#2ab0b8', clarity: 0.95, caustics: 1, causticScale: 5, ripples: 0.4, shells: 0.4, sand1: '#f0e4c8', sand2: '#c8b48e', crest: '#fff6e0' } },
      { name: 'Stylized beach', group: 'Stylized', values: { grain: 0.1, sparkle: 0, ripples: 0.8, rippleScale: 8, rippleWarp: 0.6, bump: 0.8, colorVar: 0.15, water: 0.4, waterColor: '#4ac0d0', clarity: 0.9, caustics: 0.9, causticScale: 4, wetEdge: 0.5 } },
      { name: 'Alien dunes', group: 'Sci-fi', values: { sand1: '#9a6ac8', sand2: '#4a2a6a', crest: '#d0a8ff', ripples: 0.9, rippleScale: 18, sparkle: 0.6, dunes: 0.6 } },
    ],

    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height), S = Math.min(W, H), k = S / 512, seed = p.seed | 0, N = W * H, ar = H / W;
      const per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const rs = Math.max(1, p.rippleScale | 0), [rpx, rpy] = per(rs), [dnx, dny] = per(2), [wqx, wqy] = per(Math.max(1, Math.round(rs / 4)));
      const [gx, gy] = per(160), [pbx, pby] = per(Math.max(2, Math.round(16 / p.pebbleSize))), [shx, shy] = per(40), [cx, cy] = per(p.causticScale);
      // ripple wave vector: crests run along `angle`, so the waves travel perpendicular to it
      const a = (p.angle + 90) * DEG;
      let kx = Math.round(Math.cos(a) * rpx), ky = Math.round(Math.sin(a) * rpy);
      if (!kx && !ky) kx = 1;
      const asym = lerp(0.5, 0.9, p.rippleSharp);

      const dune = U.coarseField(W, H, 120, (x, y) => U.fractal('perlin', (x / W) * dnx, (y / H) * dny, dnx, dny, 4, 0.5, 'fbm', seed));
      const WQ = U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * wqx, (y / H) * wqy, wqx, wqy, 3, 0.5, 'fbm', seed + 1) - 0.5);
      const patch = U.coarseField(W, H, 120, (x, y) => U.fractal('perlin', (x / W) * dnx * 2, (y / H) * dny * 2, dnx * 2, dny * 2, 3, 0.5, 'fbm', seed + 2));
      const cvar = U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * dnx * 3, (y / H) * dny * 3, dnx * 3, dny * 3, 3, 0.5, 'fbm', seed + 3));

      const Hh = new Float32Array(N), ST = new Float32Array(N), SC = new Float32Array(N), SH = new Float32Array(N), RP = new Float32Array(N);
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W, v = (y + 0.5) / H;
          let h = dune[i] * 0.5 * p.dunes + 0.25;
          if (p.ripples > 0) {
            let f = kx * u + ky * v + WQ[i] * p.rippleWarp * 3;
            f -= Math.floor(f);
            const prof = f < asym ? f / asym : (1 - f) / (1 - asym);
            const s = prof * prof * (3 - 2 * prof);
            const amt = p.ripples * (1 - p.rippleBreak * smoothstep(0.35, 0.65, 1 - patch[i]));
            RP[i] = s * amt;
            h += (s - 0.5) * 0.14 * amt;
          }
          if (p.grain > 0) h += ((U.fractal('perlin', u * gx, v * gy, gx, gy, 2, 0.5, 'fbm', seed + 4) - 0.5) * 0.03 + (hash(x, y, seed + 5) - 0.5) * 0.015) * p.grain;
          if (p.pebbles > 0) {
            const w = U.worley(u * pbx, v * pby, pbx, pby, seed + 6), amt = p.pebbles * 0.55;
            if (w.id < amt) {
              const q = w.id / amt, wob = (U.fractal('perlin', u * pbx * 2, v * pby * 2, pbx * 2, pby * 2, 2, 0.5, 'fbm', seed + 7) - 0.5) * 0.1;
              const r = 0.18 + q * 0.22, t = clamp(1 - (w.f1 + wob) / r);
              if (t > 0) {
                const c = smoothstep(0, 0.1, t), hh = h + 0.02 + Math.sqrt(t) * 0.12 * (0.6 + q);
                ST[i] = c; SC[i] = hash(Math.floor(w.id * 7919), 3, seed);
                h = lerp(h, Math.max(h, hh), c);
              }
            }
          }
          if (p.shells > 0) {
            const w = U.worley(u * shx, v * shy, shx, shy, seed + 8);
            if (w.id < p.shells * 0.25) {
              // small fan / fragment: a disc cut by a wedge, with ribs
              const r = 0.18 + w.id * 0.4, t = clamp(1 - w.f1 / r);
              if (t > 0) SH[i] = smoothstep(0, 0.2, t) * (0.75 + 0.25 * Math.sin(w.f1 * 60 + w.id * 9));
              h += SH[i] * 0.015;
            }
          }
          Hh[i] = h;
        }
      }

      // level 1 sits just above the highest point: fully submerged, but still shallow enough to see the bed
      let hMax = 0;
      for (let i = 0; i < N; i++) if (Hh[i] > hMax) hMax = Hh[i];
      const level = p.water > 0 ? lerp(0.12, hMax + 0.04, p.water) : -1;
      const img = ctx.createImageData(W, H), o = img.data;
      if (height) {
        for (let i = 0; i < N; i++) { o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = clamp(Hh[i]) * 255; o[i * 4 + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        return;
      }

      const s1 = U.hex(p.sand1), s2 = U.hex(p.sand2), cr = U.hex(p.crest), wc = U.hex(p.waterColor), alg = U.hex(p.algaeColor);
      const C = [U.hex(p.c1), U.hex(p.c2), U.hex(p.c3)];
      const K = p.bump * 0.45, Lx = -0.55, Ly = -0.6, Lz = 0.58, so = Math.max(1, Math.round(2.5 * k));
      const absorb = 0.8 + (1 - p.clarity) * 9;
      for (let y = 0, i = 0; y < H; y++) {
        const yu = U.mod(y - 1, H) * W, yd = U.mod(y + 1, H) * W, ys = U.mod(y - so, H) * W;
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W, v = (y + 0.5) / H;
          const xl = x ? x - 1 : W - 1, xr = x === W - 1 ? 0 : x + 1, row = y * W, h = Hh[i];
          const gxv = (Hh[row + xr] - Hh[row + xl]) * 0.5 * S, gyv = (Hh[yd + x] - Hh[yu + x]) * 0.5 * S;
          let nx = -gxv * K, ny = -gyv * K, nz = 1;
          const nl = 1 / Math.sqrt(nx * nx + ny * ny + 1); nx *= nl; ny *= nl; nz *= nl;
          const lam = nx * Lx + ny * Ly + nz * Lz;
          const sh = clamp((Hh[ys + U.mod(x - so, W)] - h) * 7) * p.bump;
          // sand: darker in troughs, light crests
          const f = clamp(0.55 + (cvar[i] - 0.5) * p.colorVar * 1.6 + (hash(x, y, seed + 10) - 0.5) * p.grain * 0.18);
          let r = lerp(s2[0], s1[0], f), g = lerp(s2[1], s1[1], f), b = lerp(s2[2], s1[2], f);
          const ct = RP[i] > 0.75 ? (RP[i] - 0.75) * 2.5 : 0;
          r = lerp(r, cr[0], ct * 0.6); g = lerp(g, cr[1], ct * 0.6); b = lerp(b, cr[2], ct * 0.6);
          if (SH[i] > 0) { const t = SH[i]; r = lerp(r, 236, t); g = lerp(g, 226, t); b = lerp(b, 210, t); }
          if (ST[i] > 0) {
            const q = SC[i], A = C[Math.floor(q * 3) % 3], B = C[(Math.floor(q * 3) + 1) % 3], m = (q * 3) % 1, vv = 0.85 + hash(x >> 1, y >> 1, seed + 11) * 0.25;
            r = lerp(r, lerp(A[0], B[0], m) * vv, ST[i]); g = lerp(g, lerp(A[1], B[1], m) * vv, ST[i]); b = lerp(b, lerp(A[2], B[2], m) * vv, ST[i]);
          }
          // wet sand near (above) the waterline
          if (level > -1 && p.wetEdge > 0 && h >= level) {
            const wt = (1 - smoothstep(0, 0.12, h - level)) * p.wetEdge, l = (r + g + b) / 3;
            r = lerp(r, (r - l) * 1.2 + l * 0.6, wt); g = lerp(g, (g - l) * 1.2 + l * 0.6, wt); b = lerp(b, (b - l) * 1.2 + l * 0.62, wt);
          }
          let light = (0.5 + 0.7 * lam) * (1 - sh * 0.5);
          if (p.sparkle > 0 && hash(x, y, seed + 12) > 1 - p.sparkle * 0.02 && lam > 0.6) light += 0.8;
          r *= light; g *= light; b *= light;
          // water: depth tint + absorption, algae, caustics
          if (h < level) {
            const d = level - h, ab = 1 - Math.exp(-d * absorb);
            if (p.algae > 0) { const am = smoothstep(0.1, 0.35, d + (cvar[i] - 0.5) * 0.3) * p.algae * (0.6 + hash(x >> 1, y >> 1, seed + 13) * 0.4); r = lerp(r, alg[0], am); g = lerp(g, alg[1], am); b = lerp(b, alg[2], am); }
            if (p.caustics > 0) {
              const w1 = U.worley(u * cx + WQ[i] * 1.5, v * cy - WQ[i] * 1.5, cx, cy, seed + 20);
              const w2 = U.worley(u * cx * 2 - WQ[i] * 2, v * cy * 2 + WQ[i] * 2, cx * 2, cy * 2, seed + 21);
              // soft, wide bright bands rather than thin cell borders
              const cl = Math.pow(1 - smoothstep(0, 0.32, w1.f2 - w1.f1), 3) * 0.85 + Math.pow(1 - smoothstep(0, 0.26, w2.f2 - w2.f1), 3) * 0.45;
              const ck = cl * p.caustics * (1 - ab) * 150;
              r += ck * 0.95; g += ck; b += ck * 0.9;
            }
            r = lerp(r * (wc[0] / 255 * 0.6 + 0.4), wc[0], ab); g = lerp(g * (wc[1] / 255 * 0.6 + 0.4), wc[1], ab); b = lerp(b * (wc[2] / 255 * 0.6 + 0.4), wc[2], ab);
            const shore = (1 - smoothstep(0, 0.01, d)) * 60;
            r += shore; g += shore; b += shore;
          }
          const k4 = i * 4;
          o[k4] = r; o[k4 + 1] = g; o[k4 + 2] = b; o[k4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
