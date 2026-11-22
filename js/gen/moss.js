/* Moss: tileable moss carpets and patches. Coverage patches with fuzzy, tufted edges; cushion clumps
   (Voronoi domes with dark crevices between them); a fine leafy micro-structure of tiny star-like
   tips and strands; dry / bleached areas, color variation per clump and sporophyte capsules.
   Grows over stone, soil, bark or a flat color, or exports as a transparent overlay / mask.
   Height map for the normal map mode. All noise uses whole periods per tile, so it repeats seamlessly. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const V = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };

  const GROUNDS = { stone: ['#6f6d66', '#4a4844'], soil: ['#4a3826', '#2c2015'], bark: ['#4a3a2c', '#241b14'], color: ['#3a3226', '#3a3226'] };

  U.register({
    id: 'moss',
    name: 'Moss',
    desc: 'Tileable moss carpets and patches with cushion clumps, leafy detail, dry tips and spore capsules over stone, soil or bark',
    uses: ['Albedo and height textures for mossy rocks, forest floors, roofs, ruins and tree bark; blend the overlay output on top of other materials through a mask.', 'Ground cover and decal sheets for stylized nature scenes.'],
    tags: ['Texturing', 'Nature'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<path d="M3 17c2-3 4-3 6-1 1-3 4-4 6-1 2-2 4-1 6 1"/><path d="M3 20h18" opacity=".5"/><circle cx="8" cy="10" r="1"/><circle cx="14" cy="8" r="1"/><path d="M8 11v3M14 9v4" opacity=".6"/>'),
    params: [
      { type: 'section', label: 'Moss' },
      { key: 'coverage', label: 'Coverage', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75, tip: '1 = solid carpet, low values = scattered patches' },
      { key: 'patchScale', label: 'Patch scale', type: 'int', min: 1, max: 16, default: 3, tip: 'Patches across the texture' },
      { key: 'edgeSoft', label: 'Edge fuzz', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Tufted, broken-up patch edges' },
      { key: 'clumps', label: 'Cushion scale', type: 'int', min: 2, max: 80, default: 14, tip: 'Moss cushions across the texture' },
      { key: 'clumpDepth', label: 'Crevice depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Dark gaps between the cushions' },
      { key: 'fibers', label: 'Leafy detail', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7 },
      { key: 'fiberScale', label: 'Detail scale', type: 'int', min: 20, max: 300, default: 110, show: (p) => p.fibers > 0, tip: 'Tiny leaf tips across the texture' },
      { key: 'spores', label: 'Spore capsules', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Sporophytes: tiny capsules on stalks, seen from above' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 21 },

      { type: 'section', label: 'Color' },
      { key: 'dark', label: 'Shadow color', type: 'color', default: '#1b3010' },
      { key: 'mid', label: 'Moss color', type: 'color', default: '#4b7420' },
      { key: 'tip', label: 'Tip color', type: 'color', default: '#a4c443' },
      { key: 'tipAmt', label: 'Bright tips', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55 },
      { key: 'dry', label: 'Dry color', type: 'color', default: '#a39c52' },
      { key: 'dryAmt', label: 'Dry patches', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: 'colorVar', label: 'Cushion variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'sporeColor', label: 'Capsule color', type: 'color', default: '#b0582a', show: (p) => p.spores > 0 },

      { type: 'section', label: 'Ground' },
      { key: 'ground', label: 'Ground', type: 'select', default: 'stone', options: [['stone', 'Stone'], ['soil', 'Soil'], ['bark', 'Bark'], ['color', 'Flat color']], apply: (v, p) => { const g = GROUNDS[v]; if (g) { p.ground1 = g[0]; p.ground2 = g[1]; } } },
      { key: 'ground1', label: 'Ground color', type: 'color', default: GROUNDS.stone[0] },
      { key: 'ground2', label: 'Second color', type: 'color', default: GROUNDS.stone[1], show: (p) => p.ground !== 'color' },
      { key: 'groundScale', label: 'Ground scale', type: 'int', min: 1, max: 24, default: 4, show: (p) => p.ground !== 'color' },
      { key: 'shadow', label: 'Contact shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Darkens the ground around the moss edges' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Moss on ground'], ['overlay', 'Moss only (transparent)'], ['mask', 'Coverage mask']], tip: 'Overlay keeps only the moss with its coverage as alpha, for layering in a shader' },
    ],
    presets: [
      { name: 'Mossy stone', group: 'Realistic', values: {} },
      { name: 'Forest floor carpet', group: 'Realistic', values: { coverage: 0.95, ground: 'soil', ground1: GROUNDS.soil[0], ground2: GROUNDS.soil[1], clumps: 10, dryAmt: 0.35, spores: 0.35 } },
      { name: 'Cushion moss', group: 'Realistic', values: { coverage: 0.7, clumps: 6, clumpDepth: 0.85, fibers: 0.8, fiberScale: 140, mid: '#557f24', tip: '#b2d04a', patchScale: 4 } },
      { name: 'Thin moss on rock', group: 'Realistic', values: { coverage: 0.42, patchScale: 5, edgeSoft: 0.7, clumps: 24, clumpDepth: 0.3, fibers: 0.5, tipAmt: 0.3, groundScale: 6 } },
      { name: 'Moss on bark', group: 'Realistic', values: { coverage: 0.55, patchScale: 3, ground: 'bark', ground1: GROUNDS.bark[0], ground2: GROUNDS.bark[1], groundScale: 8, clumps: 20, dryAmt: 0.15 } },
      { name: 'Dry summer moss', group: 'Realistic', values: { coverage: 0.8, dryAmt: 0.75, dry: '#9a8f48', mid: '#5f6e2a', tip: '#b7b260', spores: 0.2 } },
      { name: 'Peat / sphagnum', group: 'Realistic', values: { coverage: 1, clumps: 18, clumpDepth: 0.5, mid: '#7a7a2a', dark: '#3a2a12', tip: '#c0a04a', dry: '#a0503a', dryAmt: 0.5, colorVar: 0.6, ground: 'soil', ground1: GROUNDS.soil[0], ground2: GROUNDS.soil[1] } },
      { name: 'Wet rainforest moss', group: 'Realistic', values: { coverage: 1, dark: '#0f2a0c', mid: '#2f6a1a', tip: '#6eaa2a', tipAmt: 0.4, dryAmt: 0, clumps: 12, fibers: 0.9 } },
      { name: 'Moss in a cobble joint', group: 'Realistic', values: { coverage: 0.35, patchScale: 8, edgeSoft: 0.8, clumps: 30, fibers: 0.6, groundScale: 10 } },
      { name: 'Moss overlay', group: 'Masks', values: { coverage: 0.6, output: 'overlay' } },
      { name: 'Coverage mask', group: 'Masks', values: { coverage: 0.55, output: 'mask' } },
      { name: 'Toon moss', group: 'Stylized', values: { coverage: 0.7, clumps: 8, clumpDepth: 1, fibers: 0.15, fiberScale: 40, tipAmt: 0.8, dark: '#2a5a20', mid: '#4f9a2c', tip: '#a8e05a', dryAmt: 0, colorVar: 0.1, edgeSoft: 0.1, ground: 'color', ground1: '#7a7a8a' } },
      { name: 'Glowing alien moss', group: 'Sci-fi', values: { coverage: 0.7, dark: '#0a1430', mid: '#2a4aa8', tip: '#5fe3f0', tipAmt: 0.9, dry: '#c03aff', dryAmt: 0.35, spores: 0.6, sporeColor: '#f0ff5a', ground: 'stone', ground1: '#2a2a30', ground2: '#141418' } },
      { name: 'Toxic fungus mat', group: 'Sci-fi', values: { coverage: 0.85, clumps: 9, dark: '#1a2a08', mid: '#6a9a10', tip: '#d8ff3a', dry: '#ffb020', dryAmt: 0.3, spores: 0.8, sporeColor: '#ff3a8a', ground: 'soil', ground1: '#2a2018', ground2: '#141008' } },
    ],

    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height), seed = p.seed | 0, ar = H / W;
      const per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const [ppx, ppy] = per(p.patchScale), [clx, cly] = per(p.clumps), [fbx, fby] = per(p.fiberScale), [grx, gry] = per(p.groundScale);
      const [dxp, dyp] = per(2), [spx, spy] = per(Math.round(Math.max(8, p.fiberScale * 0.35)));
      const dark = U.hex(p.dark), mid = U.hex(p.mid), tip = U.hex(p.tip), dry = U.hex(p.dry), spc = U.hex(p.sporeColor);
      const g1 = U.hex(p.ground1), g2 = U.hex(p.ground2);

      // low-frequency fields on a coarse grid (cheap and resolution independent)
      const patch = U.coarseField(W, H, 256, (x, y) => U.fractal('perlin', (x / W) * ppx, (y / H) * ppy, ppx, ppy, 5, 0.55, 'fbm', seed));
      const dryF = p.dryAmt > 0 ? U.coarseField(W, H, 128, (x, y) => U.fractal('perlin', (x / W) * dxp, (y / H) * dyp, dxp, dyp, 4, 0.5, 'fbm', seed + 7)) : null;
      const half = (n) => Math.max(1, Math.round(n * 0.5)); // whole periods only, or the texture gets a seam
      const wpx = half(clx), wpy = half(cly), hfx = half(fbx), hfy = half(fby), bly = half(gry);
      const warpX = U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * wpx, (y / H) * wpy, wpx, wpy, 3, 0.5, 'fbm', seed + 3) - 0.5);
      const warpY = U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * wpx, (y / H) * wpy, wpx, wpy, 3, 0.5, 'fbm', seed + 4) - 0.5);
      // crevice visibility varies, so the cushions don't read as a regular cell pattern
      const crevF = U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * clx, (y / H) * cly, clx, cly, 2, 0.5, 'fbm', seed + 8));
      const c2x = Math.max(1, Math.round(clx * 2.3)), c2y = Math.max(1, Math.round(cly * 2.3));
      const groundF = p.ground !== 'color' ? U.coarseField(W, H, 320, (x, y) => U.fractal('perlin', (x / W) * grx, (y / H) * gry, grx, gry, 5, 0.55, 'fbm', seed + 11)) : null;

      const th = lerp(0.82, 0.18, clamp(p.coverage)), soft = 0.015 + p.edgeSoft * 0.09;
      const img = ctx.createImageData(W, H), o = img.data;
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W, v = (y + 0.5) / H;

          // cushions: rounded Voronoi lumps on strongly warped coordinates, plus a second, smaller scale
          const cellR = Math.min(W / clx, H / cly) * 0.5;
          U.voro(u * clx + warpX[i] * 1.6, v * cly + warpY[i] * 1.6, clx, cly, seed + 1, 1, false, W / clx, H / cly, cellR * 0.35, V);
          const t1 = clamp(V.es / (cellR * 0.7)), clumpId = V.id;
          // secondary lumps: plain Worley F2 − F1 is close enough here and much cheaper than exact borders
          const w2 = U.worley(u * c2x + warpY[i] * 2.2, v * c2y + warpX[i] * 2.2, c2x, c2y, seed + 2);
          const t2 = clamp((w2.f2 - w2.f1) * 1.6);
          const d1 = Math.sqrt(1 - (1 - t1) * (1 - t1)), d2 = Math.sqrt(1 - (1 - t2) * (1 - t2));
          const cvis = 0.35 + 0.65 * smoothstep(0.3, 0.7, crevF[i]);
          const dome = clamp(1 - (1 - d1) * cvis * 0.85 - (1 - d2) * 0.35);

          // leafy micro-structure: tiny tips (worley blobs) and their dark gaps, plus fine strands
          let tipM = 0, gapM = 0, fib = 0.5;
          if (p.fibers > 0) {
            const w = U.worley(u * fbx, v * fby, fbx, fby, seed + 5);
            tipM = (1 - smoothstep(0.05, 0.5, w.f1)) * (0.6 + 0.4 * w.id);
            gapM = 1 - smoothstep(0, 0.1, w.f2 - w.f1);
            fib = U.fractal('perlin', u * hfx, v * hfy, hfx, hfy, 2, 0.5, 'ridged', seed + 6);
          }
          const fd = p.fibers;

          // coverage with tufted edges
          const cv0 = patch[i] + (tipM - 0.35) * 0.22 * (0.4 + p.edgeSoft) * fd + (dome - 0.5) * 0.12;
          const cov = smoothstep(th - soft, th + soft, cv0);
          const near = smoothstep(th - soft - 0.12, th - soft, cv0); // around the moss: contact shadow

          // moss color
          let sh = dome * 0.7 + (fib - 0.5) * 0.4 * fd + (clumpId - 0.5) * p.colorVar * 0.5;
          sh = clamp(sh);
          let r = lerp(dark[0], mid[0], sh), g = lerp(dark[1], mid[1], sh), b = lerp(dark[2], mid[2], sh);
          const tipK = clamp(tipM * fd * p.tipAmt * (0.35 + 0.65 * dome) * 1.4);
          let dr = 0;
          if (dryF) { dr = smoothstep(0.5, 0.78, dryF[i] + (clumpId - 0.5) * 0.25) * p.dryAmt; dr = clamp(dr + tipK * dr * 0.6); }
          r = lerp(r, tip[0], tipK); g = lerp(g, tip[1], tipK); b = lerp(b, tip[2], tipK);
          r = lerp(r, dry[0] * (0.6 + 0.5 * sh), dr); g = lerp(g, dry[1] * (0.6 + 0.5 * sh), dr); b = lerp(b, dry[2] * (0.6 + 0.5 * sh), dr);
          const crev = 1 - p.clumpDepth * (1 - dome) * 0.75 - gapM * 0.3 * fd;
          r *= crev; g *= crev; b *= crev;
          let mh = 0.4 + dome * 0.4 + (tipM - 0.4) * 0.12 * fd + (fib - 0.5) * 0.06 * fd;

          // spore capsules (sporophytes), only on the moss
          if (p.spores > 0) {
            const w = U.worley(u * spx, v * spy, spx, spy, seed + 13);
            if (w.id < p.spores * 0.6) {
              const rr = 0.09 + w.id * 0.05, d = w.f1;
              const cap = 1 - smoothstep(rr * 0.7, rr, d);
              if (cap > 0) {
                const hl = 1 - smoothstep(0, rr * 0.6, Math.hypot(d - rr * 0.25, 0));
                r = lerp(r, spc[0] * (0.75 + 0.4 * hl), cap); g = lerp(g, spc[1] * (0.75 + 0.4 * hl), cap); b = lerp(b, spc[2] * (0.75 + 0.4 * hl), cap);
                mh = Math.max(mh, mh + cap * 0.1);
              }
            }
          }

          // ground
          let gr = g1[0], gg = g1[1], gb = g1[2], gh = 0.15;
          if (groundF) {
            let gt = groundF[i];
            if (p.ground === 'bark') {
              const lines = U.fractal('perlin', u * grx * 3, v * bly, grx * 3, bly, 3, 0.5, 'ridged', seed + 15);
              gt = clamp(gt * 0.4 + lines * 0.7 - 0.1);
            } else if (p.ground === 'soil') {
              const w = U.worley(u * grx * 6, v * gry * 6, grx * 6, gry * 6, seed + 17);
              const peb = (1 - smoothstep(0.25, 0.32, w.f1)) * (w.id > 0.55 ? 1 : 0);
              gt = clamp(gt + peb * 0.4);
            } else {
              gt = clamp(gt + (U.hash(x, y, seed + 19) - 0.5) * 0.12);
            }
            gr = lerp(g2[0], g1[0], gt); gg = lerp(g2[1], g1[1], gt); gb = lerp(g2[2], g1[2], gt);
            gh = gt * 0.3;
          }
          const ao = 1 - near * (1 - cov) * p.shadow * 0.55;
          gr *= ao; gg *= ao; gb *= ao;

          const k = i * 4;
          if (height) { const hv = lerp(gh, mh, cov); o[k] = o[k + 1] = o[k + 2] = clamp(hv) * 255; o[k + 3] = 255; continue; }
          if (p.output === 'mask') { o[k] = o[k + 1] = o[k + 2] = cov * 255; o[k + 3] = 255; continue; }
          if (p.output === 'overlay') { o[k] = r; o[k + 1] = g; o[k + 2] = b; o[k + 3] = cov * 255; continue; }
          o[k] = lerp(gr, r, cov); o[k + 1] = lerp(gg, g, cov); o[k + 2] = lerp(gb, b, cov); o[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
