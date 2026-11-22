/* Gravel: tileable, densely packed stones. Every stone is a Voronoi cell with an exact, smoothly rounded
   outline; its top is either a dome (pea / river gravel) or faceted (crushed stone, ballast): the
   intersection of a few random planes per stone, so it reads as angular, broken rock. A second, finer
   layer of stones fills the gaps; the voids between them are dark and can be partly filled with sand /
   dust, weeds or water. Per-stone colors from a 3-color palette, granite speckle, dust coat, wetness.
   Shaded from its own height (light, contact shadows, gap occlusion); height map for the normal map
   mode. Whole cells per tile: seamless. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;
  const V = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };
  const V2 = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };

  const TYPES = {
    crushed: { round: 0.15, facets: 0.85, flat: 0, c1: '#8a8780', c2: '#6a6660', c3: '#a09a8e' },
    pea: { round: 0.95, facets: 0, flat: 0, c1: '#b09a7a', c2: '#8a7a64', c3: '#c8b89a' },
    ballast: { round: 0.08, facets: 1, flat: 0, c1: '#6e6c68', c2: '#4e4c4a', c3: '#8a8680' },
    river: { round: 0.9, facets: 0, flat: 0.55, c1: '#9a9288', c2: '#6a6458', c3: '#a8886a' },
  };

  U.register({
    id: 'gravel-dl',
    name: 'Gravel (download)',
    desc: 'Tileable packed gravel: crushed stone, pea gravel, railway ballast or flat river stones with fill stones, dust, weeds and water',
    uses: ['Albedo and height textures for driveways, paths, railway beds, roofs, construction sites and river banks; the height drives the normal map mode or displacement.', 'Ground tiles for top-down, strategy and survival games.'],
    tags: ['Texturing', 'Nature'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<path d="M4 9l3-3 3 1 1 3-3 2-3-1z"/><path d="M13 6l4-1 2 3-2 3-3-1z"/><path d="M6 15l3-1 3 2-1 3-4 0z"/><path d="M14 14l3 0 2 2-1 3-3 0-1-3z"/>'),
    params: [
      { type: 'section', label: 'Stones' },
      { key: 'type', label: 'Gravel type', type: 'select', default: 'crushed', options: [['crushed', 'Crushed stone (angular)'], ['pea', 'Pea gravel (round)'], ['ballast', 'Railway ballast'], ['river', 'River stones (flat, round)']],
        apply: (v, p) => { const t = TYPES[v]; if (!t) return; p.round = t.round; p.facets = t.facets; p.flat = t.flat; p.c1 = t.c1; p.c2 = t.c2; p.c3 = t.c3; } },
      { key: 'count', label: 'Stones across', type: 'int', min: 3, max: 60, default: 14, tip: 'Rounded so the texture tiles' },
      { key: 'irregular', label: 'Size irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85 },
      { key: 'warp', label: 'Shape wobble', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'round', label: 'Roundness', type: 'range', min: 0, max: 1, step: 0.01, default: TYPES.crushed.round, tip: 'Rounded outline and domed top (pea gravel) versus sharp corners' },
      { key: 'facets', label: 'Facets', type: 'range', min: 0, max: 1, step: 0.01, default: TYPES.crushed.facets, tip: 'Broken, flat faces on top (crushed stone)' },
      { key: 'flat', label: 'Flatness', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Flat, worn tops (river stones)' },
      { key: 'gap', label: 'Gap width', type: 'range', min: 0, max: 20, step: 0.1, default: 3, tip: 'px @ 512' },
      { key: 'fill', label: 'Fill stones', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, tip: 'Smaller stones in the gaps between the big ones' },
      { key: 'fillScale', label: 'Fill stone size', type: 'range', min: 1.5, max: 5, step: 0.1, default: 2.6, show: (p) => p.fill > 0, tip: 'Fill stones per big stone (higher = smaller)' },
      { key: 'heightVar', label: 'Height variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'bump', label: 'Relief', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'How strongly the height shades the color' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 23 },

      { type: 'section', label: 'Color' },
      { key: 'c1', label: 'Stone color 1', type: 'color', default: TYPES.crushed.c1 },
      { key: 'c2', label: 'Stone color 2', type: 'color', default: TYPES.crushed.c2 },
      { key: 'c3', label: 'Stone color 3', type: 'color', default: TYPES.crushed.c3 },
      { key: 'colorVar', label: 'Color mix', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6 },
      { key: 'brightVar', label: 'Brightness variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'speckle', label: 'Speckle', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Granite-like mineral flecks' },
      { key: 'gapColor', label: 'Gap color', type: 'color', default: '#1e1b18' },

      { type: 'section', label: 'Weathering', active: (p) => p.dust > 0 || p.sandFill > 0 || p.weeds > 0 || p.wet > 0 || p.puddles > 0 },
      { key: 'dust', label: 'Dust coat', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Light dust on the stones' },
      { key: 'sandFill', label: 'Sand in gaps', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Fills the voids with sand / soil' },
      { key: 'sandColor', label: 'Sand color', type: 'color', default: '#9a8668', show: (p) => p.sandFill > 0 || p.dust > 0 },
      { key: 'weeds', label: 'Weeds', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Small green sprouts in the gaps' },
      { key: 'weedColor', label: 'Weed color', type: 'color', default: '#4a7a2a', show: (p) => p.weeds > 0 },
      { key: 'wet', label: 'Wetness', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Darker, saturated, glossy' },
      { key: 'puddles', label: 'Puddles', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Water filling the low areas' },
      { key: 'waterColor', label: 'Water color', type: 'color', default: '#30363a', show: (p) => p.puddles > 0 },
    ],
    presets: [
      { name: 'Crushed gray gravel', group: 'Realistic', values: {} },
      { name: 'Pea gravel', group: 'Realistic', values: { type: 'pea', ...pick('pea'), count: 22, gap: 2.5, fill: 0.5, speckle: 0.15, dust: 0.05 } },
      { name: 'Railway ballast', group: 'Realistic', values: { type: 'ballast', ...pick('ballast'), count: 9, gap: 4, fill: 0.85, dust: 0.25, sandColor: '#6a5a48', speckle: 0.45 } },
      { name: 'River stones', group: 'Realistic', values: { type: 'river', ...pick('river'), count: 8, irregular: 1, warp: 0.4, gap: 5, fill: 0.8, fillScale: 3, colorVar: 0.9, speckle: 0.25, dust: 0, wet: 0.35 } },
      { name: 'Wet driveway', group: 'Realistic', values: { count: 18, wet: 0.8, puddles: 0.35, dust: 0 } },
      { name: 'Limestone chippings', group: 'Realistic', values: { count: 18, c1: '#c8c2b4', c2: '#a8a294', c3: '#dcd6c8', speckle: 0.1, dust: 0.35, sandColor: '#d0c8b4' } },
      { name: 'Red granite chips', group: 'Realistic', values: { count: 16, c1: '#a06a5a', c2: '#7a4a3e', c3: '#c09080', speckle: 0.8 } },
      { name: 'Gravel path with weeds', group: 'Realistic', values: { count: 18, sandFill: 0.55, weeds: 0.5, dust: 0.3 } },
      { name: 'Dusty quarry', group: 'Realistic', values: { count: 12, dust: 0.75, sandFill: 0.6, sandColor: '#b8a888', c1: '#a09a8a', c2: '#7a7468', c3: '#b8b0a0' } },
      { name: 'Roof gravel', group: 'Realistic', values: { type: 'pea', ...pick('pea'), count: 30, gap: 1.5, c1: '#8a8a86', c2: '#5a5a58', c3: '#a8a49c', dust: 0.2, fill: 0.4 } },
      { name: 'Stream bed (wet)', group: 'Realistic', values: { type: 'river', ...pick('river'), count: 10, gap: 4, wet: 0.9, puddles: 0.55, waterColor: '#3a4a40', colorVar: 1, c3: '#9a6a4a' } },
      { name: 'Cartoon pebbles', group: 'Stylized', values: { type: 'pea', round: 1, facets: 0, count: 10, gap: 5, speckle: 0, brightVar: 0.2, c1: '#c8b090', c2: '#a08a6e', c3: '#d8c4a4', bump: 0.85, fill: 0.3, dust: 0 } },
      { name: 'Obsidian shards', group: 'Fantasy', values: { type: 'ballast', ...pick('ballast'), count: 11, c1: '#1e1c24', c2: '#0e0d12', c3: '#3a3448', speckle: 0.1, dust: 0, wet: 0.6 } },
      { name: 'Crystal gravel', group: 'Fantasy', values: { count: 14, c1: '#5fe3b0', c2: '#2a8a8a', c3: '#a8f0ff', facets: 1, round: 0.05, speckle: 0.2, dust: 0, gapColor: '#0a1a1a', wet: 0.5 } },
    ],

    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height), S = Math.min(W, H), k = S / 512, seed = p.seed | 0, N = W * H, ar = H / W;
      const per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const [nx, ny] = per(p.count), sx = W / nx, sy = H / ny, R = Math.min(sx, sy) * 0.5;
      const fsc = Math.max(1.5, p.fillScale), [fx, fy] = per(Math.round(p.count * fsc)), fsx = W / fx, fsy = H / fy, fR = Math.min(fsx, fsy) * 0.5;
      const [wx, wy] = per(Math.max(1, Math.round(p.count / 3))), [dx, dy] = per(3), [spx, spy] = per(p.count * 12);
      const WX = p.warp > 0 ? U.coarseField(W, H, 200, (x, y) => U.fractal('perlin', (x / W) * wx, (y / H) * wy, wx, wy, 3, 0.5, 'fbm', seed + 1) - 0.5) : null;
      const WY = p.warp > 0 ? U.coarseField(W, H, 200, (x, y) => U.fractal('perlin', (x / W) * wx, (y / H) * wy, wx, wy, 3, 0.5, 'fbm', seed + 2) - 0.5) : null;
      const low = U.coarseField(W, H, 120, (x, y) => U.fractal('perlin', (x / W) * dx, (y / H) * dy, dx, dy, 3, 0.5, 'fbm', seed + 3));
      const jw = (p.gap * k) / 2;
      const facets = clamp(p.facets), rnd = clamp(p.round), flat = clamp(p.flat);

      /* stone top height at a point: dome / faceted / flat, scaled by the stone's own height */
      const stone = (Vv, X, Y, csx, csy, cR, s, hv) => {
        // round stones: clip the cell to a circle around its point (sized per stone), so pebbles are round
        let e = Vv.es;
        if (rnd > 0) { const rc = cR * (0.95 + hash(Vv.ci, Vv.cj, s + 6) * 0.35); e = lerp(e, Math.min(e, rc - Vv.f1), rnd); }
        e -= jw * (cR / R);
        if (e <= -1) return null;
        // the profile reaches its top well before the center, so round stones have no crease at their point
        const t = clamp(e / (cR * (0.25 + 0.4 * (1 - flat * 0.6))));
        // round stones: radial profile (distance from the center relative to the radius in that direction)
        // instead of the edge distance, whose medial axis would show up as a crease
        const rho = clamp(Vv.f1 / Math.max(1e-3, Vv.f1 + Math.max(0, e)));
        const radial = Math.sqrt(Math.max(0, 1 - rho * rho)) * smoothstep(0, 0.12, t);
        const edgeDome = Math.sqrt(1 - (1 - t) * (1 - t));
        const flatTop = lerp(smoothstep(0, 0.5, t), smoothstep(0, 0.6, 1 - rho) * smoothstep(0, 0.12, t), rnd);
        const dome = lerp(lerp(edgeDome, radial, rnd), flatTop, flat);
        let top = dome;
        if (facets > 0) {
          // intersection of 4 tilted planes through the stone's peak: an angular, broken top
          const lx = ((X - Vv.px) * csx) / cR, ly = ((Y - Vv.py) * csy) / cR;
          const a0 = hash(Vv.ci, Vv.cj, s + 1) * U.TAU, ox = (hash(Vv.ci, Vv.cj, s + 2) - 0.5) * 0.5, oy = (hash(Vv.ci, Vv.cj, s + 3) - 0.5) * 0.5;
          let m = 0;
          for (let q = 0; q < 4; q++) {
            const aq = a0 + q * 1.5708 + (hash(Vv.ci * 7 + q, Vv.cj, s + 4) - 0.5) * 0.9, sl = 0.7 + hash(Vv.ci, Vv.cj * 5 + q, s + 5) * 0.8;
            const d = (lx - ox) * Math.cos(aq) + (ly - oy) * Math.sin(aq);
            if (d * sl > m) m = d * sl;
          }
          const fac = clamp(1 - m * 0.75) * smoothstep(0, 0.25, t);
          top = lerp(dome, Math.min(fac, smoothstep(0, 0.22, t) * 1.1), facets);
        }
        top = lerp(top, top * dome, rnd * 0.5);
        return { cov: smoothstep(-0.7, 0.7, e), h: top * hv, t };
      };

      const Hh = new Float32Array(N), ID = new Float32Array(N), CV = new Float32Array(N), GP = new Float32Array(N), FS = new Float32Array(N);
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W, v = (y + 0.5) / H;
          let X = u * nx, Y = v * ny;
          if (WX) { X += WX[i] * p.warp * 1.2; Y += WY[i] * p.warp * 1.2; }
          U.voro(X, Y, nx, ny, seed, clamp(p.irregular), false, sx, sy, Math.max(0.5, R * 0.06), V);
          const hv = 0.6 + 0.4 * (1 - p.heightVar) + (hash(V.ci, V.cj, seed + 9) - 0.5) * p.heightVar * 0.8;
          const big = stone(V, X, Y, sx, sy, R, seed, hv);
          let h = 0.05 + (low[i] - 0.5) * 0.06, id = -1, cov = 0;
          if (p.fill > 0) {
            const X2 = u * fx + (WX ? WX[i] * p.warp * 2 : 0), Y2 = v * fy + (WY ? WY[i] * p.warp * 2 : 0);
            U.voro(X2, Y2, fx, fy, seed + 50, 1, false, fsx, fsy, Math.max(0.5, fR * 0.06), V2);
            if (V2.id < p.fill) {
              const sm = stone(V2, X2, Y2, fsx, fsy, fR, seed + 50, 0.45 + hash(V2.ci, V2.cj, seed + 59) * 0.25);
              if (sm && sm.cov > 0) { h = lerp(h, 0.08 + sm.h * 0.55, sm.cov); id = 1000 + V2.id; cov = sm.cov; FS[i] = sm.cov; }
            }
          }
          if (big && big.cov > 0) { const hb = 0.12 + big.h * 0.8; if (hb >= h || big.cov > 0.5) { h = lerp(h, Math.max(h, hb), big.cov); id = V.id; cov = Math.max(cov, big.cov); } }
          GP[i] = 1 - cov; // void
          ID[i] = id; CV[i] = cov;
          Hh[i] = h;
        }
      }
      // sand filling the voids up to a level
      const sandLvl = p.sandFill * 0.32;
      if (p.sandFill > 0) for (let i = 0; i < N; i++) if (Hh[i] < sandLvl + (low[i] - 0.5) * 0.06) Hh[i] = sandLvl + (low[i] - 0.5) * 0.06;
      const level = p.puddles * 0.42 * 1;

      const img = ctx.createImageData(W, H), o = img.data;
      if (height) {
        for (let i = 0; i < N; i++) { const hv = p.puddles > 0 ? Math.max(Hh[i], level * smoothstep(0.35, 0.6, low[i])) : Hh[i]; o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = clamp(hv) * 255; o[i * 4 + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        return;
      }

      const c = [U.hex(p.c1), U.hex(p.c2), U.hex(p.c3)], gc = U.hex(p.gapColor), sc = U.hex(p.sandColor), wdc = U.hex(p.weedColor), wc = U.hex(p.waterColor);
      const K = p.bump * 0.5, Lx = -0.55, Ly = -0.6, Lz = 0.58, so = Math.max(1, Math.round(2.5 * k));
      for (let y = 0, i = 0; y < H; y++) {
        const yu = U.mod(y - 1, H) * W, yd = U.mod(y + 1, H) * W, ys = U.mod(y - so, H) * W;
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W, v = (y + 0.5) / H;
          const xl = x ? x - 1 : W - 1, xr = x === W - 1 ? 0 : x + 1, row = y * W, h = Hh[i];
          const gxv = (Hh[row + xr] - Hh[row + xl]) * 0.5 * S, gyv = (Hh[yd + x] - Hh[yu + x]) * 0.5 * S;
          let nx_ = -gxv * K, ny_ = -gyv * K, nz = 1;
          const nl = 1 / Math.sqrt(nx_ * nx_ + ny_ * ny_ + 1); nx_ *= nl; ny_ *= nl; nz *= nl;
          const lam = nx_ * Lx + ny_ * Ly + nz * Lz;
          const sh = clamp((Hh[ys + U.mod(x - so, W)] - h) * 6) * p.bump;
          // stone color from its id
          const id = ID[i], q1 = hash(Math.floor(id * 99991), 1, seed), q2 = hash(Math.floor(id * 99991), 2, seed);
          let r = lerp(c[0][0], lerp(c[1][0], c[2][0], q2), q1 * p.colorVar), g = lerp(c[0][1], lerp(c[1][1], c[2][1], q2), q1 * p.colorVar), b = lerp(c[0][2], lerp(c[1][2], c[2][2], q2), q1 * p.colorVar);
          let m = 1 + (hash(Math.floor(id * 99991), 3, seed) - 0.5) * p.brightVar * 0.8;
          if (p.speckle > 0) { const sp = hash(Math.floor(u * spx), Math.floor(v * spy), seed + 7 + (Math.floor(id * 97) & 7)); m *= sp > 1 - p.speckle * 0.25 ? 1.35 : sp < p.speckle * 0.18 ? 0.55 : 1; }
          r *= m; g *= m; b *= m;
          if (p.dust > 0) { const d = p.dust * (0.4 + 0.6 * smoothstep(0.4, 0.8, low[i] + (hash(x, y, seed + 8) - 0.5) * 0.2)); r = lerp(r, sc[0], d * 0.7); g = lerp(g, sc[1], d * 0.7); b = lerp(b, sc[2], d * 0.7); }
          // gaps: dark voids, or sand where filled
          const cov = CV[i];
          let gr = gc[0], gg = gc[1], gb = gc[2];
          if (p.sandFill > 0 && h <= sandLvl + 0.04) { const t = 0.8 + hash(x, y, seed + 9) * 0.3; gr = sc[0] * t; gg = sc[1] * t; gb = sc[2] * t; }
          if (p.weeds > 0 && cov < 0.6) {
            const w = U.worley(u * nx * 3, v * ny * 3, nx * 3, ny * 3, seed + 31);
            if (w.id < p.weeds * 0.45) { const leaf = 1 - smoothstep(0.1, 0.32, w.f1 + (hash(x, y, seed + 32) - 0.5) * 0.15); const t = 0.7 + hash(x >> 1, y >> 1, seed + 33) * 0.5; gr = lerp(gr, wdc[0] * t, leaf); gg = lerp(gg, wdc[1] * t, leaf); gb = lerp(gb, wdc[2] * t, leaf); }
          }
          r = lerp(gr, r, cov); g = lerp(gg, g, cov); b = lerp(gb, b, cov);
          // occlusion near the bottom of the voids
          const ao = 1 - (1 - smoothstep(0.05, 0.35, h)) * 0.45 * (p.sandFill > 0 ? 0.4 : 1);
          if (p.wet > 0) { const l = (r + g + b) / 3, w = p.wet; r = lerp(r, (r - l) * 1.3 + l * 0.55, w); g = lerp(g, (g - l) * 1.3 + l * 0.55, w); b = lerp(b, (b - l) * 1.3 + l * 0.58, w); }
          const light = (0.45 + 0.75 * lam) * (1 - sh * 0.5) * ao;
          r *= light; g *= light; b *= light;
          if (p.wet > 0) { const hz = nx_ * -0.33 + ny_ * -0.36 + nz * 0.87, spc = Math.pow(Math.max(0, hz), 50) * p.wet * 160 * cov; r += spc; g += spc; b += spc; }
          if (p.puddles > 0) {
            const lv = level * smoothstep(0.35, 0.6, low[i]);
            if (h < lv) { const d = clamp((lv - h) * 8); r = lerp(r * 0.6, wc[0], 0.35 + d * 0.5); g = lerp(g * 0.6, wc[1], 0.35 + d * 0.5); b = lerp(b * 0.6, wc[2], 0.35 + d * 0.5); const rf = 25 + low[i] * 30; r += rf; g += rf; b += rf * 1.1; }
          }
          const k4 = i * 4;
          o[k4] = r; o[k4 + 1] = g; o[k4 + 2] = b; o[k4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });

  function pick(t) { const x = TYPES[t]; return { round: x.round, facets: x.facets, flat: x.flat, c1: x.c1, c2: x.c2, c3: x.c3 }; }
})();
