/* Plaster & concrete: tileable wall / floor surfaces. Mottled base color, fine grain, pores / air
   holes, exposed aggregate, trowel sweeps, stucco bumps, formwork panel seams with tie holes, hairline
   cracks, rain / water streak stains, chipped patches revealing an under-layer, and dirt. Height map
   for the normal map mode. Everything uses periodic noise, so it tiles. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;

  const LOOKS = {
    plaster: { base: '#d9d3c7', base2: '#c2bba9', under: '#9a8e7a' },
    concrete: { base: '#9a9893', base2: '#7e7c77', under: '#5e5c58' },
    stucco: { base: '#e2d6bf', base2: '#cbbd9f', under: '#a08a6a' },
    polished: { base: '#8e8c88', base2: '#6e6c68', under: '#4e4c48' },
  };

  U.register({
    id: 'plaster',
    name: 'Plaster & Concrete',
    desc: 'Tileable plaster, stucco and concrete with pores, trowel marks, formwork, cracks, stains and height map',
    uses: ['Wall and floor materials for interiors, bunkers and building facades, with a height map for the normal map mode.', 'Subtly textured backgrounds for UI and print layouts.'],
    tags: ['PBR'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M7 15l3-3 2 2 4-5" opacity=".6"/><circle cx="8" cy="8" r=".8" fill="currentColor"/><circle cx="16" cy="17" r=".6" fill="currentColor"/>'),
    params: [
      { type: 'section', label: 'Surface' },
      { key: 'look', label: 'Look', type: 'select', default: 'plaster', options: [['plaster', 'Plaster'], ['concrete', 'Concrete'], ['stucco', 'Stucco'], ['polished', 'Polished concrete'], ['custom', 'Custom']],
        apply: (v, p) => { const s = LOOKS[v]; if (s) Object.assign(p, s); } },
      { key: 'base', label: 'Color', type: 'color', default: LOOKS.plaster.base },
      { key: 'base2', label: 'Second color', type: 'color', default: LOOKS.plaster.base2, tip: 'Mottling blends toward this color' },
      { key: 'mottle', label: 'Mottling', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'mottleScale', label: 'Mottle scale', type: 'int', min: 1, max: 16, default: 3 },
      { key: 'grain', label: 'Fine grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 5 },
      { type: 'section', label: 'Structure' },
      { key: 'pores', label: 'Pores / air holes', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2 },
      { key: 'poreSize', label: 'Pore size', type: 'range', min: 0.2, max: 3, step: 0.05, default: 1, show: (p) => p.pores > 0 },
      { key: 'aggregate', label: 'Exposed aggregate', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Small stones showing through (terrazzo, washed or polished concrete)' },
      { key: 'aggColor', label: 'Aggregate color', type: 'color', default: '#5e5a54', show: (p) => p.aggregate > 0 },
      { key: 'aggScale', label: 'Aggregate scale', type: 'int', min: 8, max: 80, default: 28, show: (p) => p.aggregate > 0, tip: 'Stones across the texture' },
      { key: 'trowel', label: 'Trowel marks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Smeared, sweeping arcs from the trowel' },
      { key: 'stucco', label: 'Stucco bumps', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'stuccoScale', label: 'Bump scale', type: 'int', min: 4, max: 60, default: 18, show: (p) => p.stucco > 0 },
      { key: 'panels', label: 'Formwork panels', type: 'int', min: 0, max: 6, default: 0, tip: 'Cast concrete: panel seams per texture (0 = none) with tie holes' },
      { key: 'ties', label: 'Tie holes', type: 'bool', default: true, show: (p) => p.panels > 0 },
      { type: 'section', label: 'Damage' },
      { key: 'cracks', label: 'Cracks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15 },
      { key: 'crackScale', label: 'Crack scale', type: 'int', min: 1, max: 10, default: 3, show: (p) => p.cracks > 0 },
      { key: 'stains', label: 'Water stains', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Darker streaks running down' },
      { key: 'chips', label: 'Chipped patches', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Broken-off areas showing the layer below' },
      { key: 'under', label: 'Under-layer color', type: 'color', default: LOOKS.plaster.under, show: (p) => p.chips > 0 },
      { key: 'dirt', label: 'Dirt', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15 },
      { key: 'dirtColor', label: 'Dirt color', type: 'color', default: '#3a3328', show: (p) => p.dirt > 0 || p.stains > 0 },
    ],
    presets: [
      { name: 'Smooth plaster', group: 'Realistic', values: {} },
      { name: 'Old cracked plaster', group: 'Realistic', values: { mottle: 0.7, cracks: 0.55, stains: 0.45, chips: 0.35, dirt: 0.35, pores: 0.25 } },
      { name: 'Raw concrete', group: 'Realistic', values: { look: 'concrete', ...LOOKS.concrete, mottle: 0.6, grain: 0.55, pores: 0.55, poreSize: 0.9, trowel: 0.1, cracks: 0.15, stains: 0.3, dirt: 0.25 } },
      { name: 'Cast concrete (formwork)', group: 'Realistic', values: { look: 'concrete', ...LOOKS.concrete, mottle: 0.55, grain: 0.45, pores: 0.6, trowel: 0, panels: 2, ties: true, stains: 0.35, dirt: 0.2 } },
      { name: 'Polished concrete floor', group: 'Realistic', values: { look: 'polished', ...LOOKS.polished, mottle: 0.65, mottleScale: 2, grain: 0.15, pores: 0.1, aggregate: 0.6, aggColor: '#4a4642', aggScale: 34, trowel: 0.35, cracks: 0.08, stains: 0, dirt: 0.05 } },
      { name: 'Terrazzo', group: 'Realistic', values: { look: 'custom', base: '#e6e0d6', base2: '#d4ccbe', mottle: 0.3, grain: 0.1, pores: 0, aggregate: 1, aggColor: '#7a6a5a', aggScale: 22, trowel: 0, cracks: 0, stains: 0, dirt: 0 } },
      { name: 'Stucco facade', group: 'Realistic', values: { look: 'stucco', ...LOOKS.stucco, stucco: 0.75, stuccoScale: 22, trowel: 0, mottle: 0.4, stains: 0.35, cracks: 0.1, dirt: 0.2 } },
      { name: 'Skim coat (trowel)', group: 'Realistic', values: { look: 'plaster', base: '#e8e4dc', base2: '#cfc8ba', trowel: 0.85, mottle: 0.35, pores: 0.05, cracks: 0, stains: 0, dirt: 0.05 } },
      { name: 'Bunker wall', group: 'Realistic', values: { look: 'concrete', base: '#7a7872', base2: '#5a5852', under: '#3a3834', mottle: 0.8, grain: 0.6, pores: 0.6, panels: 3, ties: true, cracks: 0.45, stains: 0.65, chips: 0.25, dirt: 0.5 } },
      { name: 'Sidewalk concrete', group: 'Realistic', values: { look: 'concrete', base: '#a8a59e', base2: '#8e8b84', mottle: 0.5, grain: 0.7, pores: 0.3, aggregate: 0.25, aggScale: 46, trowel: 0, cracks: 0.25, crackScale: 2, stains: 0.15, dirt: 0.35 } },
      { name: 'Mediterranean whitewash', group: 'Stylized', values: { look: 'custom', base: '#f4f0e6', base2: '#e2d8c4', under: '#c8a882', stucco: 0.4, stuccoScale: 14, mottle: 0.35, chips: 0.3, cracks: 0.1, stains: 0.15, dirt: 0.1 } },
      { name: 'Hospital wall (horror)', group: 'Stylized', values: { look: 'custom', base: '#b8c4b4', base2: '#8a9a88', under: '#5a5a50', mottle: 0.8, cracks: 0.5, stains: 0.8, chips: 0.45, dirt: 0.6, dirtColor: '#2a2414', pores: 0.2 } },
      { name: 'Painted cinder plaster (toon)', group: 'Stylized', values: { look: 'custom', base: '#d8b48a', base2: '#c49a6a', mottle: 0.25, grain: 0.05, pores: 0, trowel: 0, cracks: 0.35, crackScale: 2, stains: 0, chips: 0.2, under: '#8a5a3a', dirt: 0 } },
      { name: 'Sci-fi ferrocrete', group: 'Sci-fi', values: { look: 'custom', base: '#8a9098', base2: '#6a727c', under: '#3a424c', mottle: 0.4, grain: 0.3, pores: 0.15, panels: 4, ties: true, cracks: 0.05, stains: 0.2, dirt: 0.1 } },
    ],
    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height), S = Math.min(W, H), k = S / 512, seed = p.seed | 0;
      const ar = H / W, per = (f) => [f, Math.max(1, Math.round(f * ar))];
      // periodic fbm in texture space (u, v in 0..1)
      const fb = (u, v, f, oct, s, mode) => { const [px, py] = per(f); return U.fractal('perlin', u * px, v * py, px, py, oct, 0.5, mode || 'fbm', seed + s); };
      const base = U.hex(p.base), base2 = U.hex(p.base2), under = U.hex(p.under), dirtC = U.hex(p.dirtColor), aggC = U.hex(p.aggColor);
      const [apx, apy] = per(p.aggScale), [spx, spy] = per(p.stuccoScale), [cpx, cpy] = per(p.crackScale * 2);
      const pores = per(Math.round(60 / p.poreSize));
      const panelsX = p.panels, panelsY = p.panels ? Math.max(1, Math.round(p.panels * ar)) : 0;
      U.pixels(ctx, W, H, (x, y, o) => {
        const u = (x + 0.5) / W, v = (y + 0.5) / H;
        let h = 0.6; // height
        // mottled base
        const m = fb(u, v, p.mottleScale, 4, 1);
        let t = clamp(0.5 + (m - 0.5) * 2 * p.mottle);
        let r = lerp(base[0], base2[0], t), g = lerp(base[1], base2[1], t), b = lerp(base[2], base2[2], t);
        // fine grain
        if (p.grain > 0) {
          const gn = (U.hash(x, y, seed + 3) - 0.5) * 0.6 + (fb(u, v, 64, 2, 2) - 0.5);
          const f = 1 + gn * p.grain * 0.18;
          r *= f; g *= f; b *= f; h += gn * p.grain * 0.05;
        }
        // stucco bumps
        if (p.stucco > 0) {
          // rounded blobs of varying height, lit from the top left (compare with a sample toward the light)
          const bumpAt = (uu, vv) => { const c = U.worley(uu * spx, vv * spy, spx, spy, seed + 6); return (1 - smoothstep(0, 0.65, c.f1)) ** 2 * (0.5 + 0.5 * c.id); };
          const b0 = bumpAt(u, v), e = 0.35 / spx, b1 = bumpAt(u - e, v - e * (spx / spy));
          const f = 1 + (b0 - b1) * p.stucco * 0.9 + (b0 - 0.3) * p.stucco * 0.05;
          r *= f; g *= f; b *= f; h += b0 * p.stucco * 0.35;
        }
        // aggregate: irregular, angular chips (shrunken, warped Voronoi cells)
        if (p.aggregate > 0) {
          const wx = (fb(u, v, p.aggScale / 3 | 0 || 1, 2, 19) - 0.5) / apx * 0.9, wy = (fb(u, v, p.aggScale / 3 | 0 || 1, 2, 20) - 0.5) / apy * 0.9;
          const c = U.worley((u + wx) * apx, (v + wy) * apy, apx, apy, seed + 7);
          if (c.id < p.aggregate * 0.75) {
            const gap = 0.12 + 0.25 * U.hash(Math.floor(c.id * 1e6), 1, seed); // per-stone size
            const st = smoothstep(gap, gap + 0.04, c.f2 - c.f1);
            if (st > 0) {
              const tone = 0.7 + U.hash(Math.floor(c.id * 1e6), 2, seed) * 0.6;
              r = lerp(r, aggC[0] * tone, st); g = lerp(g, aggC[1] * tone, st); b = lerp(b, aggC[2] * tone, st);
              h += st * 0.04;
            }
          }
        }
        // pores
        if (p.pores > 0) {
          const c = U.worley(u * pores[0], v * pores[1], pores[0], pores[1], seed + 8);
          if (c.id < p.pores * 0.6) {
            const rad = 0.04 + U.hash(Math.floor(c.id * 1e6), 3, seed) * 0.11, hole = 1 - smoothstep(rad * 0.55, rad, c.f1);
            if (hole > 0) { const f = 1 - hole * 0.38; r *= f; g *= f; b *= f; h -= hole * 0.3; }
          }
        }
        // formwork panel seams + tie holes
        if (panelsX > 0) {
          const fx = u * panelsX, fy = v * panelsY;
          const dx = Math.min(fx - Math.floor(fx), Math.ceil(fx) - fx) * (W / panelsX), dy = Math.min(fy - Math.floor(fy), Math.ceil(fy) - fy) * (H / panelsY);
          const seam = 1 - smoothstep(0.6 * k, 1.8 * k, Math.min(dx, dy));
          if (seam > 0) { const f = 1 - seam * 0.35; r *= f; g *= f; b *= f; h -= seam * 0.2; }
          if (p.ties) {
            // 2 x 2 tie holes per panel
            const lx = (fx - Math.floor(fx)) * 2, ly = (fy - Math.floor(fy)) * 2;
            const d = Math.hypot((lx - Math.floor(lx) - 0.5) * (W / panelsX / 2), (ly - Math.floor(ly) - 0.5) * (H / panelsY / 2));
            const tie = 1 - smoothstep(5 * k, 7 * k, d), ring = (1 - smoothstep(7 * k, 9 * k, d)) - tie;
            if (tie > 0 || ring > 0) { const f = 1 - tie * 0.6 - ring * 0.12; r *= f; g *= f; b *= f; h -= tie * 0.4; }
          }
        }
        // chipped patches (under-layer shows, with a darker broken rim)
        if (p.chips > 0) {
          const c = fb(u, v, 5, 5, 9), th = 0.78 - p.chips * 0.28;
          const ch = smoothstep(th, th + 0.015, c), rim = smoothstep(th - 0.03, th, c) - ch;
          if (ch > 0) { const un = 0.85 + fb(u, v, 30, 2, 10) * 0.3; r = lerp(r, under[0] * un, ch); g = lerp(g, under[1] * un, ch); b = lerp(b, under[2] * un, ch); h -= ch * 0.3; }
          if (rim > 0) { r *= 1 - rim * 0.35; g *= 1 - rim * 0.35; b *= 1 - rim * 0.35; }
        }
        // cracks: cell edges, masked so they wander instead of forming a full net
        if (p.cracks > 0) {
          const wx = (fb(u, v, 4, 2, 11) - 0.5) * 0.25, wy = (fb(u, v, 4, 2, 12) - 0.5) * 0.25;
          const c = U.worley((u + wx) * cpx, (v + wy) * cpy, cpx, cpy, seed + 13);
          const edge = c.f2 - c.f1, width = 0.012 + 0.01 * fb(u, v, 12, 2, 14);
          const mask = smoothstep(0.75 - p.cracks * 0.45, 0.85 - p.cracks * 0.4, fb(u, v, 3, 3, 15));
          const cr = (1 - smoothstep(width * 0.5, width, edge)) * mask;
          if (cr > 0) { const f = 1 - cr * 0.7; r *= f; g *= f; b *= f; h -= cr * 0.5; }
        }
        // water stains: vertical streaks from the top of each tile
        if (p.stains > 0) {
          const [sx] = per(14);
          const st = U.fractal('perlin', u * sx, v, sx, 1, 3, 0.5, 'fbm', seed + 16); // stretched vertically, still periodic
          const s = smoothstep(0.55, 0.8, st) * p.stains * (0.5 + 0.5 * fb(u, v, 3, 2, 17));
          r = lerp(r, dirtC[0], s * 0.45); g = lerp(g, dirtC[1], s * 0.45); b = lerp(b, dirtC[2], s * 0.45);
        }
        if (p.dirt > 0) {
          const d = smoothstep(0.45, 0.85, fb(u, v, 6, 4, 18)) * p.dirt;
          r = lerp(r, dirtC[0], d * 0.5); g = lerp(g, dirtC[1], d * 0.5); b = lerp(b, dirtC[2], d * 0.5);
        }
        if (height) { o[0] = o[1] = o[2] = clamp(h) * 255; return; }
        o[0] = r; o[1] = g; o[2] = b;
      });
      // trowel marks: overlapping translucent sweeping arcs (drawn wrapped, so they tile)
      if (p.trowel > 0 && !height) {
        const tr = U.rng(seed + 61), n = Math.round(30 + p.trowel * 90);
        ctx.save();
        ctx.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const R = S * (0.15 + tr() * 0.35), x0 = tr() * W, y0 = tr() * H, a0 = tr() * U.TAU, span = 0.5 + tr() * 1.2;
          ctx.lineWidth = S * (0.03 + tr() * 0.07);
          ctx.strokeStyle = tr() < 0.55 ? `rgba(255,255,255,${0.035 * p.trowel})` : `rgba(0,0,0,${0.03 * p.trowel})`;
          for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) {
            ctx.beginPath(); ctx.arc(x0 + dx, y0 + dy, R, a0, a0 + span); ctx.stroke();
          }
        }
        ctx.restore();
      }
    },
  });
})();
