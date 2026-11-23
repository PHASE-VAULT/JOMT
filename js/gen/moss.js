/* Moss: tileable, fully covered moss carpets, from tight cushion moss to flat top-down carpets.
   Built from thousands of tiny star-shaped fronds (a stem top with curling arms and feathery side
   leaflets) splatted into a height buffer: every pixel keeps the highest frond over it, so fronds
   overlap and occlude like real moss and the result looks fluffy instead of noisy. The fronds sit on
   cushion mounds (warped Voronoi domes with crevices) and medium tufts. Ambient occlusion comes from the
   real height buffer (frond scale + cushion scale) with its own strength. Color: dark depths, mid green,
   bright tips, a soft non-directional fuzz sheen on the canopy, color variation, dry patches and dead
   brown fronds. Output: color, height map or AO map. Everything wraps, so it tiles seamlessly, and all
   sizes are relative to the texture, so preview and export match.
   Shine: use the Smoothness and Metallic modes (suggested ranges make the bright tips a little glossy). */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const V = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };

  // box blur with wrap (separable, running sums), in place; r in px
  function blurWrap(a, W, H, r) {
    if (r < 1) return;
    const tmp = new Float32Array(a.length), inv = 1 / (2 * r + 1);
    const wx = (n, len) => { const t = new Int32Array(len + 2 * r + 2); for (let i = 0; i < t.length; i++) t[i] = U.mod(i - r - 1, n); return t; }; // index i - r - 1 wrapped
    const WX = wx(W, W), WY = wx(H, H);
    for (let y = 0; y < H; y++) {
      const o = y * W;
      let s = 0;
      for (let k = -r; k <= r; k++) s += a[o + WX[k + r + 1]];
      for (let x = 0; x < W; x++) { tmp[o + x] = s * inv; s += a[o + WX[x + 2 * r + 2]] - a[o + WX[x + 1]]; }
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let k = -r; k <= r; k++) s += tmp[WY[k + r + 1] * W + x];
      for (let y = 0; y < H; y++) { a[y * W + x] = s * inv; s += tmp[WY[y + 2 * r + 2] * W + x] - tmp[WY[y + 1] * W + x]; }
    }
  }

  U.register({
    id: 'moss',
    name: 'Moss',
    desc: 'Fluffy, fully covered moss: cushion mounds or flat carpets built from layered star-shaped fronds, with AO, bright tips, dry patches and dead bits',
    uses: ['Albedo, height and AO textures for mossy rocks, forest floors, roofs, ruins and logs; pair with the Smoothness and Metallic modes for the soft sheen of moss tips.', 'Ground cover for stylized nature scenes and terrain layers.'],
    tags: ['PBR', 'Nature'],
    tileable: true,
    heightMap: true,
    // extra source for the smoothness / metallic maps: the leaf tips at the top of the canopy
    mapSources: [['tips', 'Leaf tips']],
    icon: U.icon('<path d="M3 17c2-3 4-3 6-1 1-3 4-4 6-1 2-2 4-1 6 1"/><path d="M3 20h18" opacity=".5"/><circle cx="8" cy="10" r="1"/><circle cx="14" cy="8" r="1"/><path d="M8 11v3M14 9v4" opacity=".6"/>'),
    params: [
      { type: 'section', label: 'Moss' },
      { key: 'cushions', label: 'Cushion scale', type: 'int', min: 1, max: 40, default: 4, tip: 'Moss cushions (mounds) across the texture' },
      { key: 'cushionHeight', label: 'Cushion height', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, tip: '0 = flat carpet, 1 = tall, round pillows' },
      { key: 'crevice', label: 'Crevice depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, tip: 'How deep the gaps between the cushions dip' },
      { key: 'tufts', label: 'Tufts', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Smaller lumps on the cushions' },
      { key: 'fronds', label: 'Frond scale', type: 'int', min: 20, max: 260, default: 80, tip: 'Moss fronds (tiny star-shaped sprigs) across the texture' },
      { key: 'density', label: 'Density', type: 'range', min: 0.6, max: 3, step: 0.05, default: 1.7, tip: 'Fronds per spot: higher = denser, more layered, fewer dark gaps' },
      { key: 'arms', label: 'Leaflets', type: 'int', min: 3, max: 12, default: 7, tip: 'Arms per frond' },
      { key: 'fluff', label: 'Fluffiness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, tip: 'Curling arms and feathery side leaflets' },
      { key: 'thickness', label: 'Strand thickness', type: 'range', min: 0.3, max: 2, step: 0.05, default: 0.75 },
      { key: 'dead', label: 'Dead bits', type: 'range', min: 0, max: 1, step: 0.01, default: 0.12, tip: 'Brown, dead fronds mixed into the carpet' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 21 },

      { type: 'section', label: 'Color' },
      { key: 'dark', label: 'Depth color', type: 'color', default: '#1a3a0e', tip: 'Color deep inside the moss' },
      { key: 'mid', label: 'Moss color', type: 'color', default: '#4c8a1e' },
      { key: 'tip', label: 'Tip color', type: 'color', default: '#a8d43c' },
      { key: 'tipAmt', label: 'Bright tips', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6 },
      { key: 'sheen', label: 'Fuzz sheen', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Soft, non-directional glow on the top of the canopy (light caught by the tiny leaf tips)' },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Per frond and in broad patches' },
      { key: 'dry', label: 'Dry color', type: 'color', default: '#a7a04e' },
      { key: 'dryAmt', label: 'Dry patches', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15 },
      { key: 'deadColor', label: 'Dead color', type: 'color', default: '#7a4a24', show: (p) => p.dead > 0 },

      { type: 'section', label: 'Shading' },
      { key: 'ao', label: 'AO strength', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Ambient occlusion: darkens the gaps between fronds and the crevices between cushions' },
      { key: 'aoSize', label: 'AO spread', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.ao > 0, tip: 'Low = only the tight gaps between fronds, high = also broad shading between cushions' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color (albedo + AO)'], ['albedo', 'Flat albedo (no AO)'], ['height', 'Height map'], ['aomap', 'AO map']], tip: 'Albedo, height and AO for a PBR material; smoothness and metallic come from the mode switch above' },
    ],
    presets: [
      { name: 'Cushion moss', group: 'Realistic', values: {} },
      { name: 'Moss carpet (top-down)', group: 'Realistic', values: { cushions: 3, cushionHeight: 0.15, crevice: 0.2, tufts: 0.55, fronds: 95, density: 2, fluff: 0.75, thickness: 0.7, dead: 0.22, dark: '#26400c', mid: '#6a9a1c', tip: '#b8d63a', tipAmt: 0.65, sheen: 0.3, colorVar: 0.55, dryAmt: 0.1, deadColor: '#7a3f1e', ao: 0.7, aoSize: 0.25 } },
      { name: 'Pillow moss', group: 'Realistic', values: { cushions: 3, cushionHeight: 0.85, crevice: 0.8, tufts: 0.3, fronds: 70, density: 2.2, dead: 0.04, mid: '#4f9a24', tip: '#b8e04a', sheen: 0.45, ao: 0.75, aoSize: 0.7 } },
      { name: 'Fine sheet moss', group: 'Realistic', values: { cushions: 6, cushionHeight: 0.25, crevice: 0.3, tufts: 0.3, fronds: 180, density: 2.4, arms: 8, fluff: 0.5, thickness: 0.6, dead: 0.05, sheen: 0.25 } },
      { name: 'Wet rainforest moss', group: 'Realistic', values: { cushions: 5, cushionHeight: 0.5, fronds: 70, fluff: 0.85, dark: '#0e260a', mid: '#2e6a18', tip: '#6eae2a', tipAmt: 0.45, sheen: 0.55, dryAmt: 0, dead: 0.03, ao: 0.75 } },
      { name: 'Dry summer moss', group: 'Realistic', values: { dryAmt: 0.7, dry: '#9e9448', mid: '#617228', tip: '#b8b45e', dead: 0.3, deadColor: '#86592e', sheen: 0.15 } },
      { name: 'Peat / sphagnum', group: 'Realistic', values: { cushions: 6, cushionHeight: 0.4, fronds: 55, arms: 5, fluff: 0.9, thickness: 1.1, mid: '#7a7a2a', dark: '#3a2a12', tip: '#c4a64c', dry: '#a0503a', dryAmt: 0.45, colorVar: 0.6, dead: 0.2 } },
      { name: 'Coarse feather moss', group: 'Realistic', values: { cushions: 2, cushionHeight: 0.35, crevice: 0.4, fronds: 36, density: 1.6, arms: 9, fluff: 1, thickness: 1.2, dead: 0.15, mid: '#587e1e', tip: '#b2c84a' } },
      { name: 'Moss height map', group: 'Maps', values: { output: 'height' } },
      { name: 'Moss AO map', group: 'Maps', values: { output: 'aomap' } },
      { name: 'Toon moss', group: 'Stylized', values: { cushions: 4, cushionHeight: 0.7, crevice: 0.9, fronds: 40, density: 1.4, arms: 5, fluff: 0.1, thickness: 1.6, tipAmt: 0.85, sheen: 0, dark: '#2a5a20', mid: '#4f9a2c', tip: '#a8e05a', dryAmt: 0, dead: 0, colorVar: 0.1, ao: 0.5 } },
      { name: 'Glowing alien moss', group: 'Sci-fi', values: { dark: '#0a1430', mid: '#2a4aa8', tip: '#5fe3f0', tipAmt: 0.9, sheen: 0.7, dry: '#c03aff', dryAmt: 0.35, deadColor: '#f0ff5a', dead: 0.1 } },
      { name: 'Toxic fungus mat', group: 'Sci-fi', values: { cushions: 6, fronds: 50, arms: 4, fluff: 0.3, thickness: 1.5, dark: '#1a2a08', mid: '#6a9a10', tip: '#d8ff3a', dry: '#ffb020', dryAmt: 0.3, dead: 0.3, deadColor: '#ff3a8a' } },
    ],

    render(ctx, W, H, p, opts) {
      const tipsOut = !!(opts && opts.source === 'tips'), heightOut = !tipsOut && (!!(opts && opts.height) || p.output === 'height'), seed = p.seed | 0, ar = H / W, S = Math.min(W, H), N = W * H;
      const per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const [clx, cly] = per(p.cushions), [fnx, fny] = per(p.fronds), [vpx, vpy] = per(Math.max(2, p.cushions * 0.7)), [dxp, dyp] = per(2);
      const half = (n) => Math.max(1, Math.round(n * 0.5)); // whole periods only, or the texture gets a seam
      const wpx = half(clx), wpy = half(cly);
      const c2x = Math.max(1, Math.round(clx * 3)), c2y = Math.max(1, Math.round(cly * 3));

      /* 1. the surface the fronds grow on: warped cushion domes with crevices + smaller tufts */
      const warpX = U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * wpx, (y / H) * wpy, wpx, wpy, 3, 0.5, 'fbm', seed + 3) - 0.5);
      const warpY = U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * wpx, (y / H) * wpy, wpx, wpy, 3, 0.5, 'fbm', seed + 4) - 0.5);
      const cellR = Math.min(W / clx, H / cly) * 0.5;
      const surf = U.coarseField(W, H, 320, (x, y) => {
        const u = x / W, v = y / H, i = Math.min(N - 1, Math.round(Math.min(H - 1, y)) * W + Math.round(Math.min(W - 1, x)));
        U.voro(u * clx + warpX[i] * 1.5, v * cly + warpY[i] * 1.5, clx, cly, seed + 1, 1, false, W / clx, H / cly, cellR * 0.35, V);
        const t1 = clamp(V.es / (cellR * 0.8)), dome = Math.sqrt(1 - (1 - t1) * (1 - t1));
        const w2 = U.worley(u * c2x + warpY[i] * 2, v * c2y + warpX[i] * 2, c2x, c2y, seed + 2);
        const tuft = Math.sqrt(clamp((w2.f2 - w2.f1) * 1.5));
        return (1 - p.crevice * (1 - dome)) * p.cushionHeight * 0.55 + (tuft - 0.5) * p.tufts * 0.1;
      });

      /* 2. fronds: star-shaped sprigs on a jittered grid, splatted with a z-buffer (highest wins) */
      const Hb = new Float32Array(N), Tb = new Float32Array(N), Ib = new Float32Array(N), Db = new Uint8Array(N);
      const gapDepth = 0.075;
      for (let i = 0; i < N; i++) { Hb[i] = surf[i] - gapDepth; Ib[i] = -1; }
      const cw = W / fnx, ch = H / fny, R0 = Math.min(cw, ch) * 1.05;
      const wPx = Math.max(0.5, R0 * 0.06 * p.thickness); // strand half width, px
      const reach = Math.ceil(wPx + 0.5), step = Math.max(0.5, wPx * 0.85);
      const strandDrop = 0.012; // a strand is rounded: its edge sits a little lower than its middle
      const put = (fx, fy, h, t, id, dead) => {
        const x0 = Math.floor(fx - reach), y0 = Math.floor(fy - reach), x1 = Math.ceil(fx + reach), y1 = Math.ceil(fy + reach);
        const w2 = (wPx + 0.35) * (wPx + 0.35);
        for (let y = y0; y <= y1; y++) {
          const dy = y + 0.5 - fy, row = (y < 0 ? y + H : y >= H ? y - H : y) * W;
          for (let x = x0; x <= x1; x++) {
            const dx = x + 0.5 - fx, d2 = dx * dx + dy * dy;
            if (d2 > w2) continue;
            const k = row + (x < 0 ? x + W : x >= W ? x - W : x), hh = h - (d2 / w2) * strandDrop;
            if (hh > Hb[k]) { Hb[k] = hh; Tb[k] = t; Ib[k] = id; Db[k] = dead; }
          }
        }
      };
      // one arm from (x, y) at angle a, length L, height h0 at the base sloping down by drop
      const arm = (x, y, a, L, h0, drop, curl, id, dead, t0, side, rnd) => {
        const n = Math.max(2, Math.ceil(L / step));
        let px = x, py = y, ang = a;
        for (let s = 1; s <= n; s++) {
          const t = s / n;
          ang += curl / n;
          px += Math.cos(ang) * (L / n); py += Math.sin(ang) * (L / n);
          const tt = t0 + (1 - t0) * t;
          put(px, py, h0 - drop * t * t, tt, id, dead);
          // feathery side leaflets, alternating, shorter toward the tip (skipped when below ~1.5 px)
          if (side && s % 2 === 0 && t < 0.85) {
            const sl = L * 0.32 * (1 - t) * (0.6 + 0.4 * rnd());
            if (sl < 1.5) continue;
            const sa = ang + (s % 4 === 0 ? 1 : -1) * (0.9 + 0.3 * rnd());
            arm(px, py, sa, sl, h0 - drop * t * t - 0.004, drop * 0.5, curl * 0.3, id, dead, tt, false, rnd);
          }
        }
      };
      const dens = p.density, fluff = p.fluff;
      for (let j = 0; j < fny; j++) {
        for (let i = 0; i < fnx; i++) {
          const rnd = U.rng(seed * 7919 + j * 104729 + i * 15485863 + 11);
          const cnt = Math.floor(dens) + (rnd() < dens - Math.floor(dens) ? 1 : 0);
          for (let c = 0; c < cnt; c++) {
            const cx = (i + rnd()) * cw, cy = (j + rnd()) * ch;
            const k0 = U.mod(Math.round(cy), H) * W + U.mod(Math.round(cx), W);
            const id = rnd(), dead = rnd() < p.dead * 0.35 ? 1 : 0;
            const R = R0 * (0.65 + 0.55 * rnd()) * (dead ? 0.8 : 1);
            // apex: on the surface, some fronds stick out, some sit lower in the canopy
            const apex = surf[k0] + (rnd() - 0.35) * 0.05 - dead * 0.03; // dead fronds sit lower, half covered
            const drop = 0.03 + 0.02 * fluff;
            const na = Math.max(3, p.arms + Math.round((rnd() - 0.5) * 2)), rot = rnd() * Math.PI * 2;
            put(cx, cy, apex + 0.004, 0, id, dead); // the stem top
            for (let a = 0; a < na; a++) {
              const ang = rot + (a / na) * Math.PI * 2 + (rnd() - 0.5) * 0.6;
              const L = R * (0.55 + 0.45 * rnd());
              const curl = (rnd() - 0.5) * 2.4 * fluff;
              arm(cx, cy, ang, L, apex, drop, curl, id, dead, 0.15, fluff > 0.05 && rnd() < 0.35 + fluff * 0.65, rnd);
            }
          }
        }
      }

      /* 3. ambient occlusion from the height buffer: tight (frond scale) + broad (cushion scale) */
      const occl = new Float32Array(N);
      {
        const b1 = Float32Array.from(Hb), b2 = Float32Array.from(Hb);
        blurWrap(b1, W, H, Math.max(1, Math.round(R0 * 0.45)));
        blurWrap(b1, W, H, Math.max(1, Math.round(R0 * 0.45)));
        blurWrap(b2, W, H, Math.max(1, Math.round(cellR * (0.15 + p.aoSize * 0.35))));
        blurWrap(b2, W, H, Math.max(1, Math.round(cellR * (0.15 + p.aoSize * 0.35))));
        for (let i = 0; i < N; i++) {
          const a1 = clamp((b1[i] - Hb[i]) / (gapDepth * 0.8)), a2 = clamp((b2[i] - Hb[i]) / (0.05 + 0.12 * p.cushionHeight));
          occl[i] = clamp(a1 * (1 - p.aoSize * 0.3) + a2 * (0.25 + p.aoSize));
        }
      }

      const img = ctx.createImageData(W, H), o = img.data;
      if (heightOut) {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < N; i++) { if (Hb[i] < lo) lo = Hb[i]; if (Hb[i] > hi) hi = Hb[i]; }
        const k = hi > lo ? 255 / (hi - lo) : 0;
        for (let i = 0; i < N; i++) { const g = (Hb[i] - lo) * k; o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = g; o[i * 4 + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        return;
      }
      if (tipsOut) { // leaf tips high in the canopy (live fronds only): the source for smoothness / metallic
        for (let i = 0; i < N; i++) { const top = clamp(1 - occl[i] * 1.4), g = Ib[i] < 0 || Db[i] ? 0 : smoothstep(0.3, 1, Tb[i]) * top * top * 255; o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = g; o[i * 4 + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        return;
      }
      if (p.output === 'aomap') {
        for (let i = 0; i < N; i++) { const g = (1 - occl[i] * Math.max(0.05, p.ao)) * 255; o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = g; o[i * 4 + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        return;
      }

      /* 4. color */
      const dark = U.hex(p.dark), mid = U.hex(p.mid), tip = U.hex(p.tip), dry = U.hex(p.dry), dc = U.hex(p.deadColor);
      const glow = tip.map((c) => c + (255 - c) * 0.45); // sheen: the tip color, paler
      const varF = U.coarseField(W, H, 128, (x, y) => U.fractal('perlin', (x / W) * vpx, (y / H) * vpy, vpx, vpy, 4, 0.55, 'fbm', seed + 9));
      const dryF = p.dryAmt > 0 ? U.coarseField(W, H, 128, (x, y) => U.fractal('perlin', (x / W) * dxp, (y / H) * dyp, dxp, dyp, 4, 0.5, 'fbm', seed + 7)) : null;
      const aoK = p.output === 'albedo' ? 0 : p.ao;
      for (let i = 0; i < N; i++) {
        const k = i * 4, id = Ib[i], t = Tb[i];
        // how high in the canopy: tips on top of the cushions catch the most light
        const top = clamp(1 - occl[i] * 1.4);
        let r, g, b;
        if (id < 0) { // gap between fronds: the dark depth
          r = dark[0] * 0.8; g = dark[1] * 0.8; b = dark[2] * 0.8;
        } else {
          const vf = (varF[i] - 0.5) * 2 * p.colorVar, fv = (id - 0.5) * p.colorVar;
          // body: depth → mid along the frond, brighter higher up
          const body = clamp(0.1 + 0.6 * t + 0.4 * top + fv * 0.5);
          r = lerp(dark[0], mid[0], body); g = lerp(dark[1], mid[1], body); b = lerp(dark[2], mid[2], body);
          // broad patches lean toward the tip color (yellow-green) or the depth color
          if (vf > 0) { r = lerp(r, tip[0], vf * 0.35); g = lerp(g, tip[1], vf * 0.35); b = lerp(b, tip[2], vf * 0.35); } else { r = lerp(r, dark[0], -vf * 0.3); g = lerp(g, dark[1], -vf * 0.3); b = lerp(b, dark[2], -vf * 0.3); }
          const tk = clamp(p.tipAmt * smoothstep(0.35, 1, t) * (0.45 + 0.55 * top) * (1 + fv));
          r = lerp(r, tip[0], tk); g = lerp(g, tip[1], tk); b = lerp(b, tip[2], tk);
          if (dryF) {
            const dr = smoothstep(0.5, 0.78, dryF[i] + (id - 0.5) * 0.2) * p.dryAmt;
            r = lerp(r, dry[0] * (0.75 + 0.35 * t), dr); g = lerp(g, dry[1] * (0.75 + 0.35 * t), dr); b = lerp(b, dry[2] * (0.75 + 0.35 * t), dr);
          }
          if (Db[i]) { const s = 0.55 + 0.5 * t; r = lerp(r, dc[0] * s, 0.8); g = lerp(g, dc[1] * s, 0.8); b = lerp(b, dc[2] * s, 0.8); }
          // fuzz sheen: soft glow on the uppermost tips, no light direction
          const sh = Db[i] ? 0 : p.sheen * smoothstep(0.45, 1, t) * top * top * 0.6;
          r = lerp(r, glow[0], sh); g = lerp(g, glow[1], sh); b = lerp(b, glow[2], sh);
        }
        const ao = 1 - occl[i] * aoK * 0.85;
        o[k] = r * ao; o[k + 1] = g * ao; o[k + 2] = b * ao; o[k + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
