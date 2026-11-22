/* Solar cells: tileable photovoltaic cell textures. Monocrystalline (pseudo-square wafers with cut
   corners showing the backsheet), polycrystalline (blue crystal flakes), back-contact (all black),
   thin film (long scribed strips) and a sci-fi hex variant. Busbars, ribbons across the cell gaps,
   fine fingers, half-cut cells, optional aluminium panel frames every N cells, glass texture, sheen,
   dirt, micro-cracks with snail trails and burnt hotspots. Height map for the normal map mode.
   The cell grid is a whole number of cells (and panels) per tile, so it always repeats seamlessly. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;
  const V = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };

  const TYPES = {
    mono: { c1: '#121829', c2: '#223057', back: '#e4e7ea', busbars: 5, fingers: 64, corner: 0.45, gap: 5, crystal: 0 },
    poly: { c1: '#1d3a82', c2: '#3a6cc2', back: '#d9dde2', busbars: 3, fingers: 52, corner: 0, gap: 5, crystal: 0.8 },
    ibc: { c1: '#0b0d12', c2: '#171c28', back: '#0d0e11', busbars: 0, fingers: 0, corner: 0.35, gap: 3, crystal: 0 },
    thin: { c1: '#1b1e25', c2: '#2a2f3b', back: '#2b2e33', busbars: 0, fingers: 0, corner: 0, gap: 1.2, crystal: 0 },
    hex: { c1: '#0f1b2b', c2: '#1f4266', back: '#5fe3b0', busbars: 0, fingers: 0, corner: 0, gap: 3, crystal: 0.2 },
  };
  const isT = (...t) => (p) => t.includes(p.type);

  U.register({
    id: 'solar',
    name: 'Solar Cells',
    desc: 'Tileable solar panel cells: mono, poly, back-contact, thin film and sci-fi hex with busbars, fingers, frames, dirt and cracks',
    uses: ['Albedo and height textures for solar panels on rooftops, satellites, space stations, vehicles and sci-fi props; tile them across the panel mesh and use the normal map mode for the busbars and frame.', 'Emissive / detail masks for futuristic energy surfaces and UI backgrounds.'],
    tags: ['Texturing', 'Sci-fi'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M9 5v14M15 5v14M3 12h18"/><path d="M6 5v14M12 5v14M18 5v14" opacity=".35"/>'),
    params: [
      { type: 'section', label: 'Cells' },
      { key: 'type', label: 'Cell type', type: 'select', default: 'mono', options: [['mono', 'Monocrystalline'], ['poly', 'Polycrystalline'], ['ibc', 'Back-contact (all black)'], ['thin', 'Thin film'], ['hex', 'Hex cells (sci-fi)']],
        apply: (v, p) => { const t = TYPES[v]; if (!t) return; p.cellColor = t.c1; p.cellColor2 = t.c2; p.backColor = t.back; p.busbars = t.busbars; p.fingers = t.fingers; p.corner = t.corner; p.gap = t.gap; p.crystal = t.crystal; } },
      { key: 'cols', label: 'Cells across', type: 'int', min: 1, max: 32, default: 4, tip: 'Thin film: strips across. Rounded up to whole panels when frames are on' },
      { key: 'ratio', label: 'Cell height', type: 'range', min: 0.25, max: 4, step: 0.05, default: 1, show: (p) => p.type !== 'hex', tip: 'Height / width of one cell (thin film strips are usually tall: 4)' },
      { key: 'halfCut', label: 'Half-cut cells', type: 'bool', default: false, show: isT('mono', 'poly', 'ibc'), tip: 'Every cell split in two halves (modern high-efficiency modules)' },
      { key: 'gap', label: 'Cell gap', type: 'range', min: 0, max: 30, step: 0.1, default: 5, tip: 'Backsheet visible between the cells (px @ 512)' },
      { key: 'corner', label: 'Cut corners', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: isT('mono', 'ibc'), tip: 'Round wafer corners: the pseudo-square shape of monocrystalline cells' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 12 },

      { type: 'section', label: 'Contacts', active: (p) => p.busbars > 0 || p.fingers > 0 },
      { key: 'busbars', label: 'Busbars', type: 'int', min: 0, max: 16, default: 5, tip: 'Vertical silver contact bars per cell' },
      { key: 'busW', label: 'Busbar width', type: 'range', min: 0.3, max: 10, step: 0.05, default: 2, show: (p) => p.busbars > 0, tip: 'px @ 512' },
      { key: 'busStyle', label: 'Busbar style', type: 'select', default: 'solid', show: (p) => p.busbars > 0, options: [['solid', 'Solid bars'], ['pads', 'Segmented pads'], ['wire', 'Round wires']] },
      { key: 'ribbons', label: 'Ribbons across gaps', type: 'bool', default: true, show: (p) => p.busbars > 0, tip: 'The busbars continue through the gaps between cells (cell strings)' },
      { key: 'fingers', label: 'Fingers', type: 'int', min: 0, max: 160, default: 64, show: (p) => p.type !== 'thin', tip: 'Thin horizontal contact lines per cell' },
      { key: 'fingerW', label: 'Finger width', type: 'range', min: 0.1, max: 3, step: 0.05, default: 0.6, show: (p) => p.fingers > 0, tip: 'px @ 512' },
      { key: 'busColor', label: 'Busbar color', type: 'color', default: '#cdd2d7', show: (p) => p.busbars > 0 },
      { key: 'fingerColor', label: 'Finger color', type: 'color', default: '#8e99a6', show: (p) => p.fingers > 0 },

      { type: 'section', label: 'Color' },
      { key: 'cellColor', label: 'Cell color', type: 'color', default: TYPES.mono.c1 },
      { key: 'cellColor2', label: 'Second cell color', type: 'color', default: TYPES.mono.c2, tip: 'Crystal flakes, cell-to-cell variation and the wafer sheen' },
      { key: 'backColor', label: 'Backsheet color', type: 'color', default: TYPES.mono.back, tip: 'Visible in the gaps and cut corners. Hex: the glowing seams' },
      { key: 'crystal', label: 'Crystal flakes', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Polycrystalline grain pattern' },
      { key: 'crystalScale', label: 'Flake scale', type: 'int', min: 4, max: 120, default: 36, show: (p) => p.crystal > 0 },
      { key: 'colorVar', label: 'Cell variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Slightly different shade per cell' },
      { key: 'waferSheen', label: 'Wafer sheen', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Soft lighter center of every cell' },
      { key: 'glow', label: 'Seam glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: isT('hex'), tip: 'Sci-fi: the gaps glow in the backsheet color' },

      { type: 'section', label: 'Panel', active: (p) => p.panelX > 0 || p.panelY > 0 },
      { key: 'panelX', label: 'Cells per panel (across)', type: 'int', min: 0, max: 16, default: 0, tip: '0 = no frame: endless cells. Otherwise an aluminium frame every N cells' },
      { key: 'panelY', label: 'Cells per panel (down)', type: 'int', min: 0, max: 24, default: 0 },
      { key: 'frameW', label: 'Frame width', type: 'range', min: 0, max: 40, step: 0.25, default: 10, show: (p) => p.panelX > 0 || p.panelY > 0, tip: 'px @ 512' },
      { key: 'panelGap', label: 'Gap between panels', type: 'range', min: 0, max: 40, step: 0.25, default: 4, show: (p) => p.panelX > 0 || p.panelY > 0, tip: 'px @ 512' },
      { key: 'frameColor', label: 'Frame color', type: 'color', default: '#a9aeb3', show: (p) => p.panelX > 0 || p.panelY > 0 },
      { key: 'gapColor', label: 'Panel gap color', type: 'color', default: '#141516', show: (p) => (p.panelX > 0 || p.panelY > 0) && p.panelGap > 0 },

      { type: 'section', label: 'Glass & wear', active: (p) => p.dirt > 0 || p.cracks > 0 || p.hotspots > 0 || p.sheen > 0 || p.glass > 0 },
      { key: 'glass', label: 'Glass texture', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Fine prismatic pattern of the textured cover glass' },
      { key: 'sheen', label: 'Reflection sheen', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Diagonal sky reflection. Breaks seamless tiling' },
      { key: 'dirt', label: 'Dirt', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15 },
      { key: 'dirtColor', label: 'Dirt color', type: 'color', default: '#8a7a62', show: (p) => p.dirt > 0 },
      { key: 'cracks', label: 'Micro-cracks', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Share of cracked cells, with dark snail trails' },
      { key: 'hotspots', label: 'Burnt hotspots', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Share of cells with a brown burn mark' },
    ],
    presets: [
      { name: 'Monocrystalline (black)', group: 'Realistic', values: {} },
      { name: 'Mono half-cut module', group: 'Realistic', values: { halfCut: true, cols: 6, ratio: 1, busbars: 9, busW: 0.9, busStyle: 'wire', panelX: 6, panelY: 6, frameW: 8 } },
      { name: 'Polycrystalline (blue)', group: 'Realistic', values: { type: 'poly', cellColor: TYPES.poly.c1, cellColor2: TYPES.poly.c2, backColor: TYPES.poly.back, busbars: 3, fingers: 52, corner: 0, crystal: 0.8, waferSheen: 0.1 } },
      { name: 'Poly rooftop panel', group: 'Realistic', values: { type: 'poly', cols: 6, cellColor: TYPES.poly.c1, cellColor2: TYPES.poly.c2, backColor: TYPES.poly.back, busbars: 3, fingers: 48, corner: 0, crystal: 0.8, panelX: 6, panelY: 6, frameW: 9, dirt: 0.35 } },
      { name: 'All-black back-contact', group: 'Realistic', values: { type: 'ibc', cellColor: TYPES.ibc.c1, cellColor2: TYPES.ibc.c2, backColor: TYPES.ibc.back, busbars: 0, fingers: 0, corner: 0.35, gap: 3, waferSheen: 0.2 } },
      { name: 'Thin film strips', group: 'Realistic', values: { type: 'thin', cols: 24, ratio: 4, gap: 1.2, cellColor: TYPES.thin.c1, cellColor2: TYPES.thin.c2, backColor: TYPES.thin.back, busbars: 0, fingers: 0, corner: 0, waferSheen: 0.05, colorVar: 0.1 } },
      { name: 'Old blue panel (dirty, cracked)', group: 'Worn', values: { type: 'poly', cellColor: '#25417a', cellColor2: '#4a6fa8', backColor: '#cfd0c8', busbars: 2, busW: 3, fingers: 40, corner: 0, crystal: 0.9, dirt: 0.6, cracks: 0.35, hotspots: 0.15, panelX: 4, panelY: 4 } },
      { name: 'Wasteland scrap panel', group: 'Worn', values: { cellColor: '#141820', cellColor2: '#2b3242', dirt: 0.85, dirtColor: '#6e5a3e', cracks: 0.6, hotspots: 0.35, panelX: 4, panelY: 4, frameColor: '#7a6b5a', glass: 0.1 } },
      { name: 'Satellite wing (gold backsheet)', group: 'Space', values: { cols: 8, ratio: 0.6, gap: 3, corner: 0, backColor: '#c9a24a', cellColor: '#141c3a', cellColor2: '#2a3f7a', busbars: 2, busW: 1.2, fingers: 30, dirt: 0, glass: 0, colorVar: 0.15 } },
      { name: 'Space station array', group: 'Space', values: { type: 'poly', cols: 10, ratio: 0.5, cellColor: '#2a2a6a', cellColor2: '#4b4fb0', backColor: '#c8a050', busbars: 2, fingers: 24, corner: 0, crystal: 0.5, gap: 2.5, panelX: 5, panelY: 10, frameW: 5, panelGap: 6, frameColor: '#d9d5c8', dirt: 0 } },
      { name: 'Sci-fi hex collector', group: 'Sci-fi', values: { type: 'hex', cols: 8, cellColor: TYPES.hex.c1, cellColor2: TYPES.hex.c2, backColor: TYPES.hex.back, busbars: 0, fingers: 0, gap: 3, crystal: 0.2, glow: 0.7, dirt: 0 } },
      { name: 'Purple alien cells', group: 'Sci-fi', values: { type: 'hex', cols: 6, cellColor: '#1a0f2e', cellColor2: '#5a2a9a', backColor: '#ff5fd2', gap: 4, crystal: 0.6, crystalScale: 60, glow: 0.9, dirt: 0 } },
      { name: 'Stylized toon panel', group: 'Stylized', values: { cols: 3, cellColor: '#2a4aa0', cellColor2: '#4a7ae0', backColor: '#f2f2f2', busbars: 2, busW: 5, fingers: 10, fingerW: 1.6, gap: 10, corner: 0.6, glass: 0, dirt: 0, waferSheen: 0.6, colorVar: 0.1 } },
    ],

    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height), S = Math.min(W, H), k = S / 512, seed = p.seed | 0;
      const type = TYPES[p.type] ? p.type : 'mono';
      const hexT = type === 'hex', thin = type === 'thin';
      const pX = p.panelX | 0, pY = p.panelY | 0;
      // grid: whole cells, rounded up to whole panels
      let cols = Math.max(1, p.cols | 0);
      if (pX > 0) cols = Math.ceil(cols / pX) * pX;
      const cw = W / cols;
      let rows;
      if (hexT) rows = Math.max(2, Math.round(H / (cw * 0.866) / 2) * 2);
      else rows = Math.max(1, Math.round(H / (cw * Math.max(0.05, p.ratio))));
      if (pY > 0) rows = Math.max(pY, Math.round(rows / pY) * pY);
      const ch = H / rows;
      const fw = (pX > 0 || pY > 0) ? p.frameW * k : 0, pg = (pX > 0 || pY > 0) ? p.panelGap * k : 0;
      const PW = pX > 0 ? pX * cw : W, PH = pY > 0 ? pY * ch : H;
      const bandX = pX > 0 ? fw + pg : 0, bandY = pY > 0 ? fw + pg : 0; // frame + gap eat this much per panel
      const cwi = (PW - bandX) / (pX > 0 ? pX : cols), chi = (PH - bandY) / (pY > 0 ? pY : rows);
      const gap = p.gap * k, bw = p.busW * k, fgw = p.fingerW * k, nb = p.busbars | 0, nf = thin ? 0 : p.fingers | 0;

      const c1 = U.hex(p.cellColor), c2 = U.hex(p.cellColor2), bk = U.hex(p.backColor), busC = U.hex(p.busColor), finC = U.hex(p.fingerColor);
      const frC = U.hex(p.frameColor), gpC = U.hex(p.gapColor), dirtC = U.hex(p.dirtColor);
      const ar = H / W, per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const [gx, gy] = per(p.crystalScale), [dx1, dy1] = per(3), [dx2, dy2] = per(12);
      const dirtF = p.dirt > 0 ? U.coarseField(W, H, 220, (x, y) => U.fractal('perlin', (x / W) * dx1, (y / H) * dy1, dx1, dy1, 5, 0.55, 'fbm', seed + 31) * 0.7 + U.fractal('perlin', (x / W) * dx2, (y / H) * dy2, dx2, dy2, 3, 0.5, 'fbm', seed + 32) * 0.3) : null;
      const glassK = (Math.PI * 2) / Math.max(1.5, 3.2 * k);

      const img = ctx.createImageData(W, H), o = img.data;
      for (let y = 0, i = 0; y < H; y++) {
        const py0 = y + 0.5;
        for (let x = 0; x < W; x++, i++) {
          const px0 = x + 0.5;
          let r, g, b, ht;

          // --- panel frame / gap ---
          let frameT = -1, inGap = false, panelI = 0, panelJ = 0, lxp = px0, lyp = py0, edgeB = 1e9;
          if (pX > 0) {
            panelI = Math.floor(px0 / PW);
            const lx = px0 - panelI * PW, d = Math.min(lx, PW - lx);
            if (d < pg / 2) inGap = true; else if (d < pg / 2 + fw) frameT = Math.max(frameT, (d - pg / 2) / fw);
            lxp = lx - bandX / 2;
          }
          if (pY > 0) {
            panelJ = Math.floor(py0 / PH);
            const ly = py0 - panelJ * PH, d = Math.min(ly, PH - ly);
            if (d < pg / 2) inGap = true; else if (d < pg / 2 + fw && !inGap) frameT = frameT < 0 ? (d - pg / 2) / fw : Math.min(frameT, (d - pg / 2) / fw);
            lyp = ly - bandY / 2;
            edgeB = PH - bandY / 2 - ly; // distance to the bottom frame (dust gathers there)
          }

          if (inGap) {
            r = gpC[0]; g = gpC[1]; b = gpC[2]; ht = 0;
          } else if (frameT >= 0) {
            // anodized aluminium with a rounded profile, lit from the top-left
            const prof = Math.sin(frameT * Math.PI), sh = 0.72 + 0.28 * prof + (U.hash(x, y, seed) - 0.5) * 0.04;
            r = frC[0] * sh; g = frC[1] * sh; b = frC[2] * sh; ht = 0.75 + 0.25 * prof;
          } else {
            // --- cell ---
            let e, cellId, lx, ly, cwH = cwi, chH = chi, ci, cj;
            if (hexT) {
              U.voro(px0 / cw, py0 / ch, cols, rows, seed, 0, true, cw, ch, 0, V);
              e = V.e - gap / 2; cellId = V.id; ci = V.ci; cj = V.cj;
              lx = (px0 / cw - V.px) * cw + cw / 2; ly = (py0 / ch - V.py) * ch + ch / 2; cwH = cw; chH = ch;
            } else {
              ci = Math.floor(lxp / cwi); cj = Math.floor(lyp / chi);
              lx = lxp - ci * cwi; ly = lyp - cj * chi;
              const gci = U.mod(ci + panelI * (pX || 0), cols), gcj = U.mod(cj + panelJ * (pY || 0), rows);
              cellId = hash(gci, gcj, seed + 3);
              const ex = Math.min(lx, cwi - lx) - gap / 2;
              let eyv = Math.min(ly, chi - ly) - gap / 2;
              if (p.halfCut && !thin) eyv = Math.min(eyv, Math.abs(ly - chi / 2) - gap / 4);
              e = Math.min(ex, eyv);
              if (p.corner > 0 && (type === 'mono' || type === 'ibc')) {
                const hs = Math.min(cwi, chi) / 2 - gap / 2, R = lerp(hs * Math.SQRT2, hs * 1.03, p.corner);
                const dc = Math.hypot((lx - cwi / 2) * (hs / ((cwi - gap) / 2)), (ly - chi / 2) * (hs / ((chi - gap) / 2)));
                e = Math.min(e, R - dc);
              }
              ci = gci; cj = gcj; // wear is placed per cell of the whole texture, not repeated per panel
            }
            const cov = clamp(e + 0.5);
            // cell surface color
            const u = px0 / W, v = py0 / H;
            let f = 0.25 + (cellId - 0.5) * p.colorVar * 0.9;
            if (p.crystal > 0) {
              const w = U.worley(u * gx, v * gy, gx, gy, seed + 5);
              const flake = w.id * 0.75 + (1 - smoothstep(0, 0.12, w.f2 - w.f1)) * 0.15 + U.hash(x, y, seed + 6) * 0.1;
              f = lerp(f, flake, p.crystal);
            }
            if (p.waferSheen > 0) {
              const rr = Math.hypot((lx / cwH - 0.5) * 2, (ly / chH - 0.5) * 2);
              f += (1 - smoothstep(0, 1.2, rr)) * p.waferSheen * 0.35;
            }
            f = clamp(f);
            r = lerp(c1[0], c2[0], f); g = lerp(c1[1], c2[1], f); b = lerp(c1[2], c2[2], f);
            ht = 0.5;
            // micro-cracks + snail trails (cell-local noise, so they never cross into neighbours)
            if (p.cracks > 0 && hash(ci, cj, seed + 41) < p.cracks * 0.6) {
              const n = U.fractal('perlin', (lx / cwH) * 2.5, (ly / chH) * 2.5, 0, 0, 3, 0.5, 'ridged', seed + 100 + Math.floor(cellId * 997));
              const trail = smoothstep(0.78, 0.93, n) * 0.55, line = smoothstep(0.955, 0.985, n);
              r = lerp(r, 58, trail); g = lerp(g, 44, trail); b = lerp(b, 30, trail);
              r = lerp(r, 175, line); g = lerp(g, 180, line); b = lerp(b, 188, line);
              ht -= line * 0.02;
            }
            if (p.hotspots > 0 && hash(ci, cj, seed + 43) < p.hotspots * 0.35) {
              const hx = 0.3 + hash(ci, cj, seed + 44) * 0.4, hy = 0.3 + hash(ci, cj, seed + 45) * 0.4;
              const d = Math.hypot(lx / cwH - hx, ly / chH - hy), burn = (1 - smoothstep(0.05, 0.4, d)) * 0.85;
              r = lerp(r, 92, burn); g = lerp(g, 58, burn); b = lerp(b, 28, burn);
            }
            // fingers (thin horizontal lines; averaged when they get thinner than a pixel step)
            if (nf > 0 && cov > 0) {
              const sp = (chH - gap) / nf, t = U.mod(ly - gap / 2, sp), d = Math.min(t, sp - t);
              const fc = sp < 2.5 ? Math.min(1, fgw / sp) * 0.8 : clamp(fgw / 2 - d + 0.5);
              r = lerp(r, finC[0], fc); g = lerp(g, finC[1], fc); b = lerp(b, finC[2], fc);
              ht += fc * 0.02;
            }
            // gap / backsheet
            const bkC = hexT && p.glow > 0 ? [bk[0] * (0.5 + p.glow * 0.5), bk[1] * (0.5 + p.glow * 0.5), bk[2] * (0.5 + p.glow * 0.5)] : bk;
            r = lerp(bkC[0], r, cov); g = lerp(bkC[1], g, cov); b = lerp(bkC[2], b, cov);
            ht = lerp(0.44, ht, cov);
            if (hexT && p.glow > 0) {
              // soft glow bleeding from the seams into the cells
              const gl = (1 - smoothstep(0, gap * 2 + 3 * k, Math.max(0, e))) * p.glow * 0.45 * cov;
              r = lerp(r, bk[0], gl); g = lerp(g, bk[1], gl); b = lerp(b, bk[2], gl);
            }
            // busbars: vertical, optionally running on through the gaps between rows
            if (nb > 0 && !hexT) {
              const inX = lx > gap / 2 && lx < cwi - gap / 2;
              if (inX && (cov > 0 || p.ribbons)) {
                const sp = (cwi - gap) / nb, t = lx - gap / 2, kk = Math.floor(t / sp), d = Math.abs(t - (kk + 0.5) * sp);
                let bc = clamp(bw / 2 - d + 0.5);
                if (p.busStyle === 'pads' && cov > 0.5) { const seg = U.mod(ly, chi / 6); bc *= smoothstep(0, 1.5, Math.min(seg, chi / 6 - seg) - chi / 40); }
                if (bc > 0) {
                  let sh = 1;
                  if (p.busStyle === 'wire') sh = 0.65 + 0.55 * Math.sqrt(Math.max(0, 1 - (d / Math.max(0.5, bw / 2)) ** 2));
                  r = lerp(r, busC[0] * sh, bc); g = lerp(g, busC[1] * sh, bc); b = lerp(b, busC[2] * sh, bc);
                  ht += bc * 0.05;
                }
              }
            }
          }

          // --- cover glass, dirt, sheen (over everything but the panel gaps) ---
          if (!inGap) {
            if (p.glass > 0 && frameT < 0) {
              const gt = Math.sin(px0 * glassK) * Math.sin(py0 * glassK) * 0.035 + (U.hash(x, y, seed + 9) - 0.5) * 0.03;
              const m = 1 + gt * p.glass * 2;
              r *= m; g *= m; b *= m;
              ht += gt * p.glass * 0.05;
            }
            if (dirtF) {
              let d = smoothstep(0.42, 0.85, dirtF[i]) * p.dirt;
              if (pY > 0 && frameT < 0) d = Math.max(d, (1 - smoothstep(0, 40 * k, edgeB)) * p.dirt * (0.5 + dirtF[i] * 0.5)); // dust along the bottom frame
              r = lerp(r, dirtC[0], d * 0.8); g = lerp(g, dirtC[1], d * 0.8); b = lerp(b, dirtC[2], d * 0.8);
            }
            if (p.sheen > 0) {
              const s = (px0 / W + py0 / H) * 0.5, band = Math.exp(-((s - 0.35) ** 2) / 0.012) * 0.6 + Math.exp(-((s - 0.62) ** 2) / 0.003) * 0.3;
              const add = band * p.sheen * 110;
              r += add * 0.85; g += add * 0.92; b += add;
            }
          }
          const k4 = i * 4;
          if (height) { o[k4] = o[k4 + 1] = o[k4 + 2] = clamp(ht) * 255; }
          else { o[k4] = r; o[k4 + 1] = g; o[k4 + 2] = b; }
          o[k4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
