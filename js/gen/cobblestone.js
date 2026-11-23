/* Cobblestone: tileable cobble streets, courtyards and river-stone paths. Stones are Voronoi cells with
   exact border distances (rounded corners from a smooth minimum, shapes wobbled by a domain warp), laid
   out irregularly, in staggered courses, as square setts or as rounded river stones of mixed sizes.
   Each stone gets a domed / worn-flat height profile, its own color from a 3-color palette, grain, pits,
   chipped edges and cracks. Small filler pebbles sit in the joints; joints are filled with sand, dirt,
   mud, grass, moss or mortar. Moss on the stone edges, edge darkening, wetness and puddles that fill the
   low areas. Height map for the normal map mode. Whole cells per tile: seamless. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;
  const V = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };
  const V2 = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };

  const JOINTS = { sand: '#a08c6a', dirt: '#3e3224', mud: '#2a2118', grass: '#3c5a22', moss: '#2e4418', mortar: '#9a978e', dark: '#141210' };

  U.register({
    id: 'cobblestone',
    name: 'Cobblestone',
    desc: 'Tileable cobblestones: irregular, coursed, setts or round river stones with filler pebbles, chips, moss, mud and puddles',
    uses: ['Albedo and height textures for old-town streets, castle courtyards, garden paths and river beds; the height output drives the normal map mode or parallax / displacement.', 'Ground tiles for top-down, strategy and medieval games.'],
    tags: ['PBR', 'Nature'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<path d="M4 6c2-2 5-2 6 0 1 3-1 5-3 5S3 9 4 6z"/><path d="M13 5c3-1 6 0 6 3s-2 4-4 3-4-4-2-6z"/><path d="M5 15c2-2 6-1 6 2s-3 4-5 3-2-3-1-5z"/><path d="M14 14c2-1 5 0 5 3s-3 3-5 2-2-4 0-5z"/>'),
    params: [
      { type: 'section', label: 'Stones' },
      { key: 'layout', label: 'Layout', type: 'select', default: 'random', options: [['random', 'Irregular cobbles'], ['courses', 'Staggered courses'], ['setts', 'Square setts'], ['river', 'River stones (mixed sizes)']] },
      { key: 'count', label: 'Stones across', type: 'int', min: 2, max: 40, default: 7, tip: 'Rounded so the texture tiles' },
      { key: 'ratio', label: 'Stone length', type: 'range', min: 1, max: 3, step: 0.05, default: 1.6, show: (p) => p.layout === 'courses', tip: 'Length / height of the stones in a course' },
      { key: 'irregular', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, tip: 'Random placement and size of the stones' },
      { key: 'warp', label: 'Shape wobble', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Bends the straight Voronoi edges into natural outlines' },
      { key: 'round', label: 'Corner rounding', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55 },
      { key: 'sizeVar', label: 'Size variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Some stones are smaller, leaving wider joints (filled by pebbles)' },
      { key: 'gap', label: 'Joint width', type: 'range', min: 0, max: 30, step: 0.1, default: 5, tip: 'px @ 512' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 4 },

      { type: 'section', label: 'Surface' },
      { key: 'dome', label: 'Dome', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.6, tip: 'How far the rounded top reaches in from the edge' },
      { key: 'flatTop', label: 'Worn flat tops', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Tops polished flat by traffic' },
      { key: 'heightVar', label: 'Height variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Some stones sit higher or sunk in' },
      { key: 'chips', label: 'Chipped edges', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'pits', label: 'Pits', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Small holes in the stone surface' },
      { key: 'cracks', label: 'Cracks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Share of cracked stones' },
      { key: 'grain', label: 'Grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },

      { type: 'section', label: 'Color' },
      { key: 'c1', label: 'Stone color 1', type: 'color', default: '#8d877c' },
      { key: 'c2', label: 'Stone color 2', type: 'color', default: '#6a655d' },
      { key: 'c3', label: 'Stone color 3', type: 'color', default: '#9a8a74' },
      { key: 'colorVar', label: 'Color mix', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, tip: 'How strongly the stones spread over the three colors' },
      { key: 'brightVar', label: 'Brightness variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'edgeDark', label: 'Edge darkening', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Dirt and occlusion toward the joints' },

      { type: 'section', label: 'Joints' },
      { key: 'joint', label: 'Joint fill', type: 'select', default: 'dirt', options: [['sand', 'Sand'], ['dirt', 'Dirt'], ['mud', 'Mud'], ['grass', 'Grass'], ['moss', 'Moss'], ['mortar', 'Mortar'], ['dark', 'Dark gap']], apply: (v, p) => { if (JOINTS[v]) p.jointColor = JOINTS[v]; } },
      { key: 'jointColor', label: 'Joint color', type: 'color', default: JOINTS.dirt },
      { key: 'filler', label: 'Filler pebbles', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Small stones packed into the wider joints' },
      { key: 'fillerScale', label: 'Pebble size', type: 'range', min: 2, max: 8, step: 0.1, default: 4, show: (p) => p.filler > 0, tip: 'Pebbles per stone (higher = smaller pebbles)' },

      { type: 'section', label: 'Weather', active: (p) => p.moss > 0 || p.wet > 0 || p.puddles > 0 },
      { key: 'moss', label: 'Moss', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Moss creeping from the joints onto the stones' },
      { key: 'mossColor', label: 'Moss color', type: 'color', default: '#40601e', show: (p) => p.moss > 0 },
      { key: 'wet', label: 'Wetness', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Darker, more saturated (pair with a smoothness map)' },
      { key: 'puddles', label: 'Puddles', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Water fills the low areas: flat in the height map' },
      { key: 'waterColor', label: 'Water color', type: 'color', default: '#2a3238', show: (p) => p.puddles > 0 },
    ],
    presets: [
      { name: 'Old town cobbles', group: 'Realistic', values: {} },
      { name: 'Granite setts', group: 'Realistic', values: { layout: 'setts', count: 8, irregular: 0.3, warp: 0.15, round: 0.35, gap: 3.5, dome: 0.4, flatTop: 0.55, c1: '#8a8a8e', c2: '#5e5e64', c3: '#7a7470', joint: 'dark', jointColor: JOINTS.dark, filler: 0, chips: 0.25 } },
      { name: 'Staggered courses', group: 'Realistic', values: { layout: 'courses', count: 6, ratio: 1.8, irregular: 0.5, warp: 0.25, gap: 4, joint: 'sand', jointColor: JOINTS.sand, filler: 0.1 } },
      { name: 'River stone path', group: 'Realistic', values: { layout: 'river', count: 6, irregular: 1, warp: 0.45, round: 1, sizeVar: 0.7, gap: 7, dome: 0.95, flatTop: 0, chips: 0.05, pits: 0.05, cracks: 0, grain: 0.3, c1: '#9a958c', c2: '#6e6a64', c3: '#b0a590', joint: 'sand', jointColor: JOINTS.sand, filler: 0.75, fillerScale: 3.2 } },
      { name: 'Muddy village street', group: 'Realistic', values: { count: 6, gap: 9, sizeVar: 0.4, joint: 'mud', jointColor: JOINTS.mud, filler: 0.5, wet: 0.5, puddles: 0.45, edgeDark: 0.7 } },
      { name: 'Rain-soaked cobbles', group: 'Realistic', values: { c1: '#5c5852', c2: '#45423d', c3: '#6a625a', wet: 0.85, puddles: 0.3, joint: 'dark', jointColor: JOINTS.dark, flatTop: 0.5 } },
      { name: 'Mossy courtyard', group: 'Realistic', values: { count: 6, gap: 7, joint: 'moss', jointColor: JOINTS.moss, moss: 0.6, filler: 0.2, c1: '#7e7a6e', c2: '#5c5a50', c3: '#8a826e' } },
      { name: 'Grass-jointed garden path', group: 'Realistic', values: { layout: 'river', count: 4, gap: 14, round: 0.9, sizeVar: 0.3, dome: 0.5, flatTop: 0.5, joint: 'grass', jointColor: JOINTS.grass, filler: 0 } },
      { name: 'Castle courtyard', group: 'Realistic', values: { count: 5, irregular: 0.7, gap: 4, chips: 0.6, cracks: 0.35, pits: 0.4, c1: '#8a8274', c2: '#5e584e', c3: '#a09482', joint: 'mortar', jointColor: '#6e6a60', edgeDark: 0.65 } },
      { name: 'Desert ruins', group: 'Realistic', values: { count: 6, c1: '#c2a27a', c2: '#9a7a54', c3: '#d4b88e', joint: 'sand', jointColor: '#c8aa7a', chips: 0.7, cracks: 0.3, edgeDark: 0.35, filler: 0.25 } },
      { name: 'Cartoon cobbles', group: 'Stylized', values: { count: 5, warp: 0.25, round: 0.9, gap: 8, dome: 0.8, flatTop: 0.4, chips: 0, pits: 0, cracks: 0, grain: 0.05, c1: '#b4aac8', c2: '#8e84a8', c3: '#a69ec0', brightVar: 0.2, edgeDark: 0.8, joint: 'dark', jointColor: '#2a2440', filler: 0 } },
      { name: 'Hand-painted path', group: 'Stylized', values: { count: 4, round: 0.8, gap: 7, grain: 0.15, pits: 0.1, c1: '#c8b08a', c2: '#a08868', c3: '#d6c4a0', joint: 'grass', jointColor: '#4a7a2a', moss: 0.3, mossColor: '#5a8a2a' } },
      { name: 'Obsidian path', group: 'Fantasy', values: { count: 6, c1: '#1a1820', c2: '#2a2634', c3: '#3a2a4a', joint: 'dark', jointColor: '#ff5a1a', grain: 0.2, chips: 0.5, flatTop: 0.6 } },
      { name: 'Alien flagstones', group: 'Fantasy', values: { count: 5, c1: '#3a4a5a', c2: '#2a3242', c3: '#4a3a6a', joint: 'dark', jointColor: '#38f0c8', moss: 0.35, mossColor: '#c03aff', wet: 0.3 } },
    ],

    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height), S = Math.min(W, H), k = S / 512, seed = p.seed | 0, ar = H / W;
      const layout = p.layout;
      const nx = Math.max(1, p.count | 0);
      let ny, stag = false, jit = clamp(p.irregular);
      if (layout === 'courses') { ny = Math.max(2, Math.round((nx * ar * p.ratio) / 2) * 2); stag = true; jit *= 0.55; }
      else if (layout === 'setts') { ny = Math.max(1, Math.round(nx * ar)); jit *= 0.35; }
      else ny = Math.max(1, Math.round(nx * ar));
      const sx = W / nx, sy = H / ny, cellR = Math.min(sx, sy) * 0.5;
      const kRound = Math.max(0.001, p.round * cellR * 0.3);
      const jw = (p.gap * k) / 2;
      const river = layout === 'river';
      const sizeVar = river ? Math.max(p.sizeVar, 0.3) : p.sizeVar;

      const per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const [wx, wy] = per(Math.max(1, nx * 0.5)), [cx, cy] = per(nx * 5), [gx, gy] = per(nx * 10), [mx, my] = per(nx), [qx, qy] = per(2);
      const pgx = Math.max(1, Math.round(gx * 0.6)), pgy = Math.max(1, Math.round(gy * 0.6)); // pits
      const warpA = p.warp * 0.32;
      const WX = p.warp > 0 ? U.coarseField(W, H, 200, (x, y) => U.fractal('perlin', (x / W) * wx, (y / H) * wy, wx, wy, 3, 0.5, 'fbm', seed + 1) - 0.5) : null;
      const WY = p.warp > 0 ? U.coarseField(W, H, 200, (x, y) => U.fractal('perlin', (x / W) * wx, (y / H) * wy, wx, wy, 3, 0.5, 'fbm', seed + 2) - 0.5) : null;
      const mossF = p.moss > 0 ? U.coarseField(W, H, 240, (x, y) => U.fractal('perlin', (x / W) * mx * 2, (y / H) * my * 2, mx * 2, my * 2, 4, 0.55, 'fbm', seed + 5)) : null;
      const pudF = p.puddles > 0 ? U.coarseField(W, H, 120, (x, y) => U.fractal('perlin', (x / W) * qx, (y / H) * qy, qx, qy, 3, 0.5, 'fbm', seed + 6)) : null;
      const c1 = U.hex(p.c1), c2 = U.hex(p.c2), c3 = U.hex(p.c3), jc = U.hex(p.jointColor), mc = U.hex(p.mossColor), wc = U.hex(p.waterColor);
      const fs = Math.max(2, p.fillerScale), fnx = Math.max(1, Math.round(nx * fs)), fny = Math.max(1, Math.round(ny * fs));
      const fR = Math.min(W / fnx, H / fny) * 0.5;

      const img = ctx.createImageData(W, H), o = img.data;
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W, v = (y + 0.5) / H;
          let X = u * nx, Y = v * ny;
          if (WX) { X += WX[i] * warpA * 2; Y += WY[i] * warpA * 2; }
          U.voro(X, Y, nx, ny, seed, jit, stag, sx, sy, kRound, V);
          const id = V.id, si = V.ci, sj = V.cj;
          // smaller stones leave wider joints
          const shrink = sizeVar > 0 ? hash(si, sj, seed + 21) * sizeVar * cellR * 0.45 : 0;
          let e = V.es - jw - shrink;
          // chipped edges: noise bites into the outline
          if (p.chips > 0) {
            const cn = U.fractal('perlin', u * cx, v * cy, cx, cy, 3, 0.55, 'fbm', seed + 9);
            e -= smoothstep(0.5, 0.78, cn) * p.chips * cellR * 0.22;
          }
          const cov = smoothstep(-0.7, 0.7, e);
          const t = clamp(e / (cellR * (0.15 + 0.85 * p.dome)));
          const prof = lerp(Math.sqrt(1 - (1 - t) * (1 - t)), smoothstep(0, 0.55, t), p.flatTop);
          const hv = 1 + (hash(si, sj, seed + 23) - 0.5) * p.heightVar * 0.8;
          let sh = (0.42 + 0.5 * prof) * hv;

          // stone color: blend of the three palette colors per stone
          const a1 = hash(si, sj, seed + 31), a2 = hash(si, sj, seed + 32), cm = p.colorVar;
          let r = lerp(c1[0], lerp(c2[0], c3[0], a2), a1 * cm), g = lerp(c1[1], lerp(c2[1], c3[1], a2), a1 * cm), b = lerp(c1[2], lerp(c2[2], c3[2], a2), a1 * cm);
          const bv = 1 + (hash(si, sj, seed + 33) - 0.5) * p.brightVar * 0.7;
          let gr = 0;
          if (p.grain > 0) gr = (U.fractal('perlin', u * gx, v * gy, gx, gy, 3, 0.5, 'fbm', seed + 11) - 0.5) * p.grain * 0.45 + (hash(x, y, seed + 12) - 0.5) * p.grain * 0.12;
          let m = bv * (1 + gr) * (1 - p.edgeDark * 0.55 * (1 - t) * (1 - t)) * (0.85 + 0.15 * prof);
          // pits
          if (p.pits > 0) {
            const w = U.worley(u * pgx, v * pgy, pgx, pgy, seed + 13);
            if (w.id < p.pits * 0.35) { const pit = 1 - smoothstep(0.05, 0.2, w.f1); m *= 1 - pit * 0.45; sh -= pit * 0.06; }
          }
          // cracks on some stones (noise in stone-local coordinates)
          if (p.cracks > 0 && hash(si, sj, seed + 41) < p.cracks * 0.6) {
            const lx = (X - V.px) * 1.6, ly = (Y - V.py) * 1.6;
            const n = U.fractal('perlin', lx + si * 7.3, ly + sj * 3.1, 0, 0, 3, 0.5, 'ridged', seed + 43);
            const cr = smoothstep(0.93, 0.975, n) * smoothstep(0, cellR * 0.2, e);
            m *= 1 - cr * 0.6; sh -= cr * 0.08;
          }
          r *= m; g *= m; b *= m;
          sh += gr * 0.15;

          // joints: fill material, or a filler pebble
          let jr = jc[0], jg = jc[1], jb = jc[2], jh = 0.08;
          const jn = U.fractal('perlin', u * gx, v * gy, gx, gy, 2, 0.5, 'fbm', seed + 15);
          const jm = 0.72 + jn * 0.55;
          jr *= jm; jg *= jm; jb *= jm; jh += (jn - 0.5) * 0.06;
          if (p.joint === 'grass' || p.joint === 'moss') { const bl = hash(x, y, seed + 16) > 0.5 ? 1.25 : 0.8; jr *= bl; jg *= bl; jb *= bl; jh += 0.04; }
          if (p.filler > 0 && cov < 1) {
            U.voro(u * fnx + (WX ? WX[i] * 0.6 : 0), v * fny, fnx, fny, seed + 77, 1, false, W / fnx, H / fny, fR * 0.3, V2);
            if (V2.id < p.filler) {
              const e2 = V2.es - fR * 0.18, pc = smoothstep(-0.6, 0.6, e2), t2 = clamp(e2 / (fR * 0.7));
              const pp = Math.sqrt(1 - (1 - t2) * (1 - t2)), pm = (0.55 + 0.35 * pp) * (0.85 + hash(V2.ci, V2.cj, seed + 78) * 0.3);
              const q = V2.id / Math.max(0.01, p.filler);
              const pr = lerp(c2[0], c3[0], q) * pm, pg = lerp(c2[1], c3[1], q) * pm, pb = lerp(c2[2], c3[2], q) * pm;
              jr = lerp(jr, pr, pc); jg = lerp(jg, pg, pc); jb = lerp(jb, pb, pc);
              jh = lerp(jh, 0.16 + 0.16 * pp, pc);
            }
          }
          let R = lerp(jr, r, cov), G = lerp(jg, g, cov), B = lerp(jb, b, cov), Hh = lerp(jh, sh, cov);

          // moss from the joints onto the stone edges
          if (mossF) {
            const edge = 1 - smoothstep(0, cellR * 0.45, Math.max(0, e));
            const mm = smoothstep(0.72 - p.moss * 0.45, 0.82 - p.moss * 0.42, mossF[i] * 0.55 + edge * 0.6) * p.moss;
            const mt = 0.75 + (hash(x, y, seed + 17) - 0.5) * 0.4;
            R = lerp(R, mc[0] * mt, mm); G = lerp(G, mc[1] * mt, mm); B = lerp(B, mc[2] * mt, mm);
            Hh += mm * 0.03;
          }
          // wetness: darker and more saturated
          if (p.wet > 0) {
            const l = (R + G + B) / 3, w = p.wet;
            R = lerp(R, (R - l) * 1.35 + l * 0.58, w); G = lerp(G, (G - l) * 1.35 + l * 0.58, w); B = lerp(B, (B - l) * 1.35 + l * 0.62, w);
          }
          // puddles fill everything below a (noise-varied) water level
          if (pudF) {
            const lvl = p.puddles * 0.62 * smoothstep(0.35, 0.65, pudF[i]);
            if (Hh < lvl) {
              const d = clamp((lvl - Hh) * 8);
              R = lerp(R * 0.6, wc[0], 0.35 + d * 0.5); G = lerp(G * 0.6, wc[1], 0.35 + d * 0.5); B = lerp(B * 0.6, wc[2], 0.35 + d * 0.5);
              Hh = lvl;
            }
          }
          const k4 = i * 4;
          if (height) { o[k4] = o[k4 + 1] = o[k4 + 2] = clamp(Hh) * 255; }
          else { o[k4] = R; o[k4 + 1] = G; o[k4 + 2] = B; }
          o[k4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
