/* Gravel: tileable stone ground. Two stone layers (large stones and small gravel), one stone per jittered
   Voronoi cell: an ellipse (rotated, elongated, noisy outline) clipped to the cell's own border, so loose
   pebbles stay round while densely packed ones turn into angular, interlocking crushed stone. Each stone
   gets a rounded or bevelled dome, a facet tilt and ridge (angular stones), its own height, and can sink
   into the ground. The ground between the stones (soil, sand or grit) has its own colors and grain; dust
   settles on the stones. Height in short-side units, lit by js/ground.js (shadows, cavity occlusion, wet
   gloss, toon outlines). Output: lit color, flat albedo or height map (also used by the normal map mode). */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;

  const LOOKS = {
    river: { st1: '#8c867a', st2: '#5c5850', st3: '#b8ad9a', fill: '#867a63', fill2: '#6e634e' },
    limestone: { st1: '#d8d3c8', st2: '#b2ac9f', st3: '#ebe7de', fill: '#aca698', fill2: '#928c7e' },
    granite: { st1: '#9c968f', st2: '#6a6662', st3: '#c2bab1', fill: '#74706a', fill2: '#5c5852' },
    basalt: { st1: '#5a5654', st2: '#3a3736', st3: '#7a726c', fill: '#3a3634', fill2: '#2c2826' },
    sandstone: { st1: '#c8986a', st2: '#a8744c', st3: '#e0bc90', fill: '#b08a62', fill2: '#94704c' },
  };

  // scratch buffers for the 3 x 3 cell search
  const PX = new Float64Array(9), PY = new Float64Array(9), WX = new Int32Array(9), WY = new Int32Array(9);
  const JIT = 0.9;
  const ST = { h: 0, edge: 0, r1: 0, r2: 0, wx: 0, wy: 0 };

  U.register({
    id: 'gravel',
    name: 'Gravel',
    desc: 'Tileable gravel, pebbles and crushed stone, loose or tightly packed, with ground fill, shadows and height map',
    uses: ['Ground materials for paths, driveways, riverbeds, shingle beaches, railway beds and rubble on terrain and level geometry, with a height map for the normal map mode.', 'Top-down stone ground tiles for 2D and isometric games and backgrounds.'],
    tags: ['Texturing', 'Nature'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<rect x="3" y="3" width="18" height="18" rx="1"/><ellipse cx="9" cy="9" rx="3" ry="2.2"/><ellipse cx="15.5" cy="14.5" rx="2.6" ry="2"/><circle cx="7.5" cy="16" r="1.2"/><circle cx="16" cy="7.5" r="1"/><circle cx="12" cy="18.5" r=".7"/>'),
    params: [
      { type: 'section', label: 'Stones' },
      { key: 'look', label: 'Rock type', type: 'select', default: 'river', options: [['river', 'River stone'], ['limestone', 'Limestone'], ['granite', 'Granite'], ['basalt', 'Basalt'], ['sandstone', 'Sandstone'], ['custom', 'Custom']],
        apply: (v, p) => { const s = LOOKS[v]; if (s) Object.assign(p, s); } },
      { key: 'stones', label: 'Large stones', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, tip: 'Share of the cells that hold a large stone' },
      { key: 'stoneScale', label: 'Stones across', type: 'int', min: 2, max: 40, default: 9, show: (p) => p.stones > 0 },
      { key: 'gravel', label: 'Small gravel', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, tip: 'Share of the cells that hold a small stone' },
      { key: 'gravelScale', label: 'Small stones across', type: 'int', min: 8, max: 140, default: 30, show: (p) => p.gravel > 0 },
      { key: 'packing', label: 'Packing', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75, tip: 'Low = loose stones with ground between them, high = stones fill their cells and interlock' },
      { key: 'sizeVar', label: 'Size variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 12 },
      { type: 'section', label: 'Stone shape' },
      { key: 'roundness', label: 'Roundness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, tip: '0 = angular crushed stone with flat facets, 1 = smooth river pebbles' },
      { key: 'elong', label: 'Elongation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { key: 'irregular', label: 'Outline irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'stoneHeight', label: 'Stone height', type: 'range', min: 0.1, max: 1.5, step: 0.01, default: 0.6 },
      { key: 'bury', label: 'Sunk into the ground', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1, tip: 'Only the tops of the stones show above the ground' },
      { type: 'section', label: 'Stone color' },
      { key: 'st1', label: 'Stone color 1', type: 'color', default: LOOKS.river.st1 },
      { key: 'st2', label: 'Stone color 2', type: 'color', default: LOOKS.river.st2 },
      { key: 'st3', label: 'Stone color 3', type: 'color', default: LOOKS.river.st3 },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65 },
      { key: 'stoneDetail', label: 'Surface speckle', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'veins', label: 'Veins', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Light quartz veins across some stones' },
      { key: 'dust', label: 'Dust', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Ground-colored dust settled on the stones, mostly toward their edges' },
      { type: 'section', label: 'Ground between stones' },
      { key: 'fill', label: 'Ground color', type: 'color', default: LOOKS.river.fill },
      { key: 'fill2', label: 'Second color', type: 'color', default: LOOKS.river.fill2, tip: 'Mottling blends toward this color' },
      { key: 'fillMottle', label: 'Mottling', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'fillGrain', label: 'Grit', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Fine grit and sand grains between the stones' },
      ...U.groundLightParams({ shadow: 0.55, ao: 0.55, aoTip: 'Darkens the gaps around the stones' }),
    ],
    presets: [
      { name: 'River pebbles', group: 'Realistic', values: {} },
      { name: 'Wet riverbed', group: 'Realistic', values: { stones: 0.8, stoneScale: 8, gravel: 0.7, packing: 0.7, wet: 0.85, colorVar: 0.8, dust: 0 } },
      { name: 'Shingle beach', group: 'Realistic', values: { look: 'custom', st1: '#9a948a', st2: '#6e6a62', st3: '#c8c0b2', fill: '#c4aa7c', fill2: '#a8916a', stones: 0.6, stoneScale: 10, gravel: 0.6, gravelScale: 34, packing: 0.45, roundness: 1, elong: 0.6, bury: 0.25, dust: 0.05 } },
      { name: 'Pea gravel path', group: 'Realistic', values: { look: 'custom', st1: '#c8b49a', st2: '#9a8a78', st3: '#e2d6c4', fill: '#a0907a', fill2: '#887a66', stones: 0, gravel: 1, gravelScale: 26, packing: 0.9, roundness: 0.9, elong: 0.3, sizeVar: 0.4, stoneHeight: 0.55, bury: 0, colorVar: 0.7 } },
      { name: 'Crushed limestone', group: 'Realistic', values: { look: 'limestone', ...LOOKS.limestone, stones: 0.9, stoneScale: 14, gravel: 0.9, gravelScale: 42, packing: 0.9, roundness: 0.1, elong: 0.25, irregular: 0.45, stoneHeight: 0.5, bury: 0, colorVar: 0.35, stoneDetail: 0.5, veins: 0, dust: 0.35 } },
      { name: 'Driveway gravel', group: 'Realistic', values: { look: 'granite', ...LOOKS.granite, stones: 0.8, stoneScale: 16, gravel: 0.85, gravelScale: 44, packing: 0.8, roundness: 0.25, elong: 0.3, sizeVar: 0.45, stoneHeight: 0.5, bury: 0.05, colorVar: 0.6, stoneDetail: 0.6, dust: 0.2 } },
      { name: 'Railway ballast', group: 'Realistic', values: { look: 'custom', fill: '#3c3a36', fill2: '#2c2a27', st1: '#7a7670', st2: '#4e4b47', st3: '#9a928a', stones: 1, stoneScale: 8, gravel: 0.9, gravelScale: 24, packing: 0.95, roundness: 0.05, elong: 0.35, irregular: 0.5, sizeVar: 0.45, stoneHeight: 0.75, bury: 0, colorVar: 0.45, stoneDetail: 0.55, veins: 0, dust: 0.25, shadow: 0.75, ao: 0.75 } },
      { name: 'Granite chippings', group: 'Realistic', values: { look: 'granite', ...LOOKS.granite, stones: 0, gravel: 1, gravelScale: 30, packing: 1, roundness: 0.1, elong: 0.2, sizeVar: 0.35, stoneHeight: 0.45, bury: 0, stoneDetail: 0.85, colorVar: 0.5, veins: 0 } },
      { name: 'Basalt rubble', group: 'Realistic', values: { look: 'basalt', ...LOOKS.basalt, stones: 0.9, stoneScale: 7, gravel: 0.7, gravelScale: 26, packing: 0.7, roundness: 0.15, irregular: 0.55, stoneHeight: 0.8, veins: 0, dust: 0.3 } },
      { name: 'Sandstone scree', group: 'Realistic', values: { look: 'sandstone', ...LOOKS.sandstone, stones: 0.7, stoneScale: 9, gravel: 0.6, packing: 0.55, roundness: 0.35, elong: 0.6, irregular: 0.5, bury: 0.2, veins: 0, dust: 0.4 } },
      { name: 'Desert gravel (reg)', group: 'Realistic', values: { look: 'custom', fill: '#e2b57c', fill2: '#c9935a', st1: '#b4845c', st2: '#8a5d3e', st3: '#d6ab7c', stones: 0.25, stoneScale: 12, gravel: 0.75, gravelScale: 40, packing: 0.3, roundness: 0.35, bury: 0.5, stoneHeight: 0.45, colorVar: 0.7, dust: 0.3 } },
      { name: 'Lava scoria', group: 'Realistic', values: { look: 'custom', fill: '#2e2624', fill2: '#3c2c26', st1: '#5a3a30', st2: '#3a2622', st3: '#7a4a38', stones: 0.9, stoneScale: 11, gravel: 0.8, gravelScale: 34, packing: 0.75, roundness: 0.3, irregular: 0.8, sizeVar: 0.55, stoneHeight: 0.6, bury: 0, stoneDetail: 1, colorVar: 0.6, veins: 0 } },
      { name: 'Muddy gravel', group: 'Realistic', values: { look: 'custom', fill: '#5a4a38', fill2: '#463828', st1: '#8a7c6a', st2: '#625646', st3: '#a8987e', stones: 0.5, stoneScale: 11, gravel: 0.6, gravelScale: 34, packing: 0.45, roundness: 0.5, bury: 0.55, wet: 0.55, dust: 0.45 } },
      { name: 'Aquarium gravel', group: 'Stylized', values: { look: 'custom', fill: '#2a2a2a', fill2: '#1a1a1a', st1: '#e04a3a', st2: '#3a8ae0', st3: '#f0d04a', stones: 0, gravel: 1, gravelScale: 22, packing: 0.95, roundness: 0.95, colorVar: 1, stoneDetail: 0.1, veins: 0, dust: 0, wet: 0.5 } },
      { name: 'Toon gravel', group: 'Stylized', values: { style: 'toon', look: 'custom', fill: '#8a7a68', fill2: '#7a6a58', st1: '#c4b8a8', st2: '#a09484', st3: '#ddd2c2', fillGrain: 0.1, stones: 0.7, stoneScale: 10, gravel: 0.8, gravelScale: 26, packing: 0.7, roundness: 0.75, irregular: 0.15, colorVar: 0.4, stoneDetail: 0, veins: 0, dust: 0, ao: 0.3 } },
      { name: 'Hand-painted cobble path', group: 'Stylized', values: { look: 'custom', fill: '#6a5a48', fill2: '#544636', st1: '#a89888', st2: '#887868', st3: '#c8b8a4', stones: 0.95, stoneScale: 6, gravel: 0.4, packing: 0.8, roundness: 0.8, irregular: 0.2, stoneDetail: 0.1, veins: 0, dust: 0.2, relief: 0.9, ao: 0.7 } },
      { name: 'Lunar rubble', group: 'Sci-fi', values: { look: 'custom', fill: '#8a8784', fill2: '#6e6b68', st1: '#9a9692', st2: '#6a6764', st3: '#b4b0aa', stones: 0.35, stoneScale: 12, gravel: 0.55, gravelScale: 40, packing: 0.3, roundness: 0.2, irregular: 0.6, bury: 0.45, veins: 0, dust: 0.6, lightHeight: 20, shadow: 0.9 } },
      { name: 'Alien crystals', group: 'Sci-fi', values: { look: 'custom', fill: '#2a1e44', fill2: '#1e1434', st1: '#6a4aa8', st2: '#4a3480', st3: '#9a7ae0', stones: 0.6, stoneScale: 10, gravel: 0.6, gravelScale: 34, roundness: 0, elong: 0.8, irregular: 0.2, packing: 0.5, stoneDetail: 0.2, veins: 0.6, dust: 0 } },
    ],
    render(ctx, W, H, p, opts) {
      const S = Math.min(W, H), N = W * H, seed = p.seed | 0, toon = p.style === 'toon';
      const per = (f) => [Math.max(1, Math.round((f * W) / S)), Math.max(1, Math.round((f * H) / S))];
      const [mpx, mpy] = per(4), [gpx, gpy] = per(150), [dpx, dpy] = per(40);
      const fill = U.hex(p.fill), fill2 = U.hex(p.fill2), pal = [U.hex(p.st1), U.hex(p.st2), U.hex(p.st3)];

      // stone layers: f cells across the short side, radius in cell units
      const layers = [];
      const gap = lerp(0.06, 0.012, p.packing), rad = 0.24 + 0.52 * p.packing;
      if (p.stones > 0) layers.push({ f: p.stoneScale, cover: p.stones, s: seed + 101, k: 0 });
      if (p.gravel > 0) layers.push({ f: p.gravelScale, cover: p.gravel, s: seed + 202, k: 1 });
      for (const L of layers) { [L.px, L.py] = per(L.f); L.r = rad; }

      const stone = (L, u, v) => {
        const x = u * L.px, y = v * L.py, xi = Math.floor(x), yi = Math.floor(y);
        let b = 0, bd = 1e9;
        for (let n = 0, j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++, n++) {
            const cx = xi + i, cy = yi + j, wx = U.mod(cx, L.px), wy = U.mod(cy, L.py);
            const fx = cx + 0.5 + (U.hash(wx, wy, L.s) - 0.5) * JIT, fy = cy + 0.5 + (U.hash(wx, wy, L.s + 7919) - 0.5) * JIT;
            PX[n] = fx; PY[n] = fy; WX[n] = wx; WY[n] = wy;
            const d = (fx - x) * (fx - x) + (fy - y) * (fy - y);
            if (d < bd) { bd = d; b = n; }
          }
        }
        const wx = WX[b], wy = WY[b];
        ST.h = -Infinity;
        if (U.hash(wx, wy, L.s + 104729) >= L.cover) return ST;
        const h1 = U.hash(wx, wy, L.s + 11), h2 = U.hash(wx, wy, L.s + 12), h3 = U.hash(wx, wy, L.s + 13);
        const r0 = L.r * (1 - p.sizeVar * 0.55 * h1);
        // ellipse distance in the stone's rotated, stretched frame (area kept)
        const ang = h2 * Math.PI, se = Math.sqrt(1 + p.elong * 1.6 * h3), c = Math.cos(ang), s = Math.sin(ang);
        const lx = x - PX[b], ly = y - PY[b];
        const ea = (lx * c + ly * s) / se, eb = (-lx * s + ly * c) * se;
        let rho = Math.hypot(ea, eb) / r0;
        if (p.irregular > 0) rho *= 1 + (U.fractal('perlin', x * 2, y * 2, L.px * 2, L.py * 2, 2, 0.5, 'fbm', L.s + 31) - 0.5) * p.irregular * 1.1;
        if (rho >= 1) return ST;
        // exact distance to the own Voronoi border (nearest bisector)
        let e = 1e9;
        for (let n = 0; n < 9; n++) {
          if (n === b) continue;
          const ex = PX[n] - PX[b], ey = PY[n] - PY[b], len = Math.hypot(ex, ey) || 1;
          const t = (((PX[b] + PX[n]) * 0.5 - x) * ex + ((PY[b] + PY[n]) * 0.5 - y) * ey) / len;
          if (t < e) e = t;
        }
        const dist = Math.min((1 - rho) * r0, e - gap); // inside distance to the outline, cell units
        if (dist <= 0) return ST;
        // dome: wide circular shoulder for pebbles, narrow bevel + flat facet for crushed stone
        const bw = r0 * lerp(0.1, 1, p.roundness), t = Math.min(1, dist / bw), prof = Math.sqrt(1 - (1 - t) * (1 - t));
        // full stone height in short-side units; every stone sticks out a different amount
        const hc = (r0 / L.f) * p.stoneHeight * (0.6 + 0.65 * U.hash(wx, wy, L.s + 20));
        let h = hc * prof;
        if (p.roundness < 1) {
          // angular stones: a tilted top facet plus a ridge across it, so packed stones don't read as flat paving
          const ta = U.hash(wx, wy, L.s + 14) * Math.PI * 2, tm = 0.6 + 0.8 * U.hash(wx, wy, L.s + 15), ang2 = 1 - p.roundness;
          const along = lx * Math.cos(ta) + ly * Math.sin(ta), ridge = -Math.abs(-lx * Math.sin(ta) + ly * Math.cos(ta));
          h += ((along * tm * 0.9 + ridge * 0.8) / L.f) * p.stoneHeight * ang2 * t;
        }
        ST.h = h - hc * p.bury * 0.85;
        ST.edge = dist / r0;
        ST.r1 = U.hash(wx, wy, L.s + 16);
        ST.r2 = U.hash(wx, wy, L.s + 17);
        ST.wx = wx; ST.wy = wy;
        ST.lx = lx; ST.ly = ly;
        return ST;
      };

      const Hf = new Float32Array(N), flags = new Uint8Array(N);
      const img = ctx.createImageData(W, H), d = img.data;
      for (let y = 0, i = 0; y < H; y++) {
        const v = (y + 0.5) / H;
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W, o = i * 4;
          // ground between the stones: mottled soil with grit
          const m = U.fractal('perlin', u * mpx, v * mpy, mpx, mpy, 4, 0.5, 'fbm', seed + 1), mt = clamp(0.5 + (m - 0.5) * 2 * p.fillMottle);
          let r = lerp(fill[0], fill2[0], mt), g = lerp(fill[1], fill2[1], mt), b = lerp(fill[2], fill2[2], mt);
          let h = (m - 0.5) * 0.004;
          if (p.fillGrain > 0) {
            const gc = U.worley(u * gpx, v * gpy, gpx, gpy, seed + 3);
            const f = 1 + ((gc.id - 0.5) * 0.5 - smoothstep(0.25, 0.75, gc.f1) * 0.2) * p.fillGrain;
            r *= f; g *= f; b *= f; h += (0.5 - gc.f1) * p.fillGrain * 0.0016;
          }
          const gr = r, gg = g, gb = b;
          // stones: the highest surface wins
          for (const L of layers) {
            const st = stone(L, u, v);
            if (st.h <= h) continue;
            h = st.h;
            const pi = Math.min(2, (st.r1 * 3) | 0), q = pal[pi], q2 = pal[(pi + 1) % 3], mix = st.r2 * p.colorVar * 0.6;
            const br = 1 + (U.hash(st.wx, st.wy, L.s + 18) - 0.5) * p.colorVar * 0.5;
            let sd = 1;
            if (p.stoneDetail > 0) sd += (U.value(u * L.px * 9, v * L.py * 9, L.px * 9, L.py * 9, L.s + 19) * 0.6 + (U.hash(x, y, L.s) - 0.5) * 0.5) * p.stoneDetail * 0.3;
            r = lerp(q[0], q2[0], mix) * br * sd; g = lerp(q[1], q2[1], mix) * br * sd; b = lerp(q[2], q2[2], mix) * br * sd;
            // quartz veins: a light band across some stones
            if (p.veins > 0 && U.hash(st.wx, st.wy, L.s + 21) < p.veins * 0.6) {
              const va = U.hash(st.wx, st.wy, L.s + 22) * Math.PI, off = (U.hash(st.wx, st.wy, L.s + 23) - 0.5) * 0.3;
              const dv = Math.abs(st.lx * Math.sin(va) - st.ly * Math.cos(va) - off), vw = 0.025 + 0.03 * U.hash(st.wx, st.wy, L.s + 24);
              const vs = 1 - smoothstep(vw * 0.6, vw, dv);
              if (vs > 0) { r = lerp(r, 236, vs * 0.8); g = lerp(g, 232, vs * 0.8); b = lerp(b, 224, vs * 0.8); }
            }
            // dust collects toward the stone's edge and in patches
            if (p.dust > 0) {
              const ds = clamp((1 - smoothstep(0, 0.45, st.edge)) * 0.7 + (U.fractal('perlin', u * dpx, v * dpy, dpx, dpy, 2, 0.5, 'fbm', seed + 9) - 0.4)) * p.dust;
              r = lerp(r, gr * 1.08, ds); g = lerp(g, gg * 1.08, ds); b = lerp(b, gb * 1.08, ds);
            }
            flags[i] = toon && st.edge < 0.07 + L.k * 0.05 ? 3 : 1;
          }
          Hf[i] = h;
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
        }
      }
      const f0 = p.stones > 0 ? p.stoneScale : p.gravel > 0 ? p.gravelScale : 20;
      U.groundFinish(ctx, img, Hf, W, H, p, { flags, aoScale: f0, heightRef: (0.34 / f0) * p.stoneHeight, shadowLen: 0.05 * (0.4 + 0.6 * p.stoneHeight), height: !!(opts && opts.height) });
    },
  });
})();
