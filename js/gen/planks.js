/* Plank floor: tileable wooden floors and decking. Patterns: random lengths, half / third offset,
   stacked, herringbone, basket weave. Every board gets its own grain (rings + fibers, knots), color
   and brightness variation; gaps with dirt, beveled edges, nails, worn varnish. Height map for the
   normal map mode. All pattern geometry is periodic over the tile, board ids are taken from the
   board's wrapped origin so a board crossing the edge continues seamlessly. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;

  const SPECIES = {
    oak: { light: '#c8995c', dark: '#8a5a2e', gap: '#2a1a0e' },
    walnut: { light: '#7a5236', dark: '#3e2414', gap: '#140a04' },
    pine: { light: '#e2bf82', dark: '#b07a3e', gap: '#3a2814' },
    maple: { light: '#ecd2a6', dark: '#c9a06a', gap: '#5a4026' },
    cherry: { light: '#b8683a', dark: '#7a3a1c', gap: '#24100a' },
    ebony: { light: '#4a3a30', dark: '#1e1612', gap: '#080605' },
    grey: { light: '#a8a49a', dark: '#6e6a62', gap: '#2a2824' },
    white: { light: '#e8e2d6', dark: '#bfb4a2', gap: '#6a6050' },
    teak: { light: '#b8844a', dark: '#7a4e24', gap: '#0c0c0c' },
  };

  /* board lookup for a point in board units (board width = 1). Returns
     { id (0..1), a (along, 0..len), b (across, 0..1), len, ends (true if board ends are visible) } */
  function makeLayout(p, W, H) {
    const horiz = p.direction !== 'vertical';
    const TW = horiz ? W : H, TH = horiz ? H : W; // texture extent along / across the boards
    const pat = p.pattern, seed = p.seed | 0;
    const R = Math.max(2, Math.round(p.ratio));
    if (pat === 'herringbone' || pat === 'basket') {
      const cell = pat === 'herringbone' ? 2 * R : 2 * R; // period in board units
      const ny = Math.max(1, Math.round(p.rows / cell)) * cell, nx = Math.max(1, Math.round((ny * TW) / TH / cell)) * cell;
      const fx = nx / TW, fy = ny / TH; // board units per px
      const at = (X, Y) => {
        const x = U.mod(X, nx), y = U.mod(Y, ny);
        if (pat === 'basket') {
          const cx = Math.floor(x / R), cy = Math.floor(y / R), h = (cx + cy) % 2 === 0;
          const lx = x - cx * R, ly = y - cy * R, strip = Math.floor(h ? ly : lx);
          const id = hash(U.mod(cx, nx / R), U.mod(cy, ny / R) * 31 + strip, seed);
          return h ? { id, a: lx, b: ly - strip, len: R, ends: true } : { id, a: ly, b: lx - strip, len: R, ends: true };
        }
        // herringbone: staircase bands along (1,1), bands repeat by (R,-R)
        const t = (x - y) / (2 * R);
        for (let T = Math.floor(t) - 1; T <= Math.floor(t) + 1; T++) {
          const lx = x - T * R, ly = y + T * R;
          let k = Math.floor(ly);
          if (lx >= k && lx < k + R) return { id: hash(U.mod(T * R + k, nx), U.mod(-T * R + k, ny), seed), a: lx - k, b: ly - k, len: R, ends: true };
          k = Math.floor(lx);
          if (ly >= k + 1 && ly < k + 1 + R) return { id: hash(U.mod(T * R + k, nx) + 7777, U.mod(-T * R + k + 1, ny), seed), a: ly - k - 1, b: lx - k, len: R, ends: true };
        }
        return { id: 0, a: 0, b: 0.5, len: R, ends: true };
      };
      return { at, fx, fy, horiz, unitPx: TH / ny };
    }
    // rows of boards
    const step = pat === 'brick' ? 2 : pat === 'third' ? 3 : 1;
    const rows = Math.max(step, Math.round(p.rows / step) * step);
    const unitPx = TH / rows, nx = TW / unitPx; // texture length in board units
    const r = U.rng(seed * 17 + 3), rowCuts = [];
    const fixedN = Math.max(1, Math.round(nx / p.boardLen)), fixedLen = nx / fixedN;
    for (let i = 0; i < rows; i++) {
      const cuts = [];
      if (pat === 'random') {
        let pos = r() * nx;
        const lo = Math.min(p.lenMin, p.lenMax), hi = Math.max(p.lenMin, p.lenMax);
        // at least one cut per row; boards longer than the texture simply run across it
        for (let acc = 0; acc < nx - lo * 0.5 || !cuts.length;) { cuts.push(U.mod(pos + acc, nx)); acc += lo + (hi - lo) * r(); }
        cuts.sort((a, b) => a - b);
      } else {
        const off = pat === 'stack' ? 0 : ((i % step) * fixedLen) / step;
        for (let j = 0; j < fixedN; j++) cuts.push(U.mod(off + j * fixedLen, nx));
        cuts.sort((a, b) => a - b);
      }
      rowCuts.push(cuts);
    }
    const at = (X, Y) => {
      const row = U.mod(Math.floor(Y), rows), b = Y - Math.floor(Y), cuts = rowCuts[row], x = U.mod(X, nx);
      let j = cuts.length - 1;
      for (let q = 0; q < cuts.length; q++) if (cuts[q] <= x) j = q; else break;
      const start = cuts[j], end = j + 1 < cuts.length ? cuts[j + 1] : cuts[0] + nx;
      const a = U.mod(x - start, nx), len = U.mod(end - start, nx) || nx;
      return { id: hash(row, j, seed), a, b, len, ends: true };
    };
    return { at, fx: 1 / unitPx, fy: 1 / unitPx, horiz, unitPx };
  }

  U.register({
    id: 'planks',
    name: 'Plank Floor',
    desc: 'Tileable wooden floors and decking: random lengths, offsets, herringbone, basket weave, grain, knots, gaps and wear',
    tags: ['Texturing'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9.3h18M3 14.7h18M11 4v5.3M7 9.3v5.4M15 9.3v5.4M12 14.7V20"/>'),
    params: [
      { type: 'section', label: 'Layout' },
      { key: 'pattern', label: 'Pattern', type: 'select', default: 'random', options: [['random', 'Random lengths'], ['brick', 'Half offset'], ['third', 'Third offset'], ['stack', 'Stacked'], ['herringbone', 'Herringbone'], ['basket', 'Basket weave (parquet)']] },
      { key: 'direction', label: 'Direction', type: 'select', default: 'horizontal', options: [['horizontal', 'Horizontal'], ['vertical', 'Vertical']] },
      { key: 'rows', label: 'Boards across', type: 'int', min: 2, max: 40, default: 6, tip: 'Number of board widths across the texture (rounded so the pattern tiles)' },
      { key: 'lenMin', label: 'Min length', type: 'range', min: 1, max: 30, step: 0.1, default: 4, show: (p) => p.pattern === 'random', tip: 'In board widths' },
      { key: 'lenMax', label: 'Max length', type: 'range', min: 1, max: 30, step: 0.1, default: 11, show: (p) => p.pattern === 'random', tip: 'In board widths' },
      { key: 'boardLen', label: 'Board length', type: 'range', min: 1, max: 30, step: 0.1, default: 7, show: (p) => ['brick', 'third', 'stack'].includes(p.pattern), tip: 'In board widths (rounded so the row tiles)' },
      { key: 'ratio', label: 'Length / width', type: 'int', min: 2, max: 8, default: 4, show: (p) => p.pattern === 'herringbone' || p.pattern === 'basket', tip: 'Herringbone: board length in widths. Basket: boards per square' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },
      { type: 'section', label: 'Wood' },
      { key: 'species', label: 'Wood', type: 'select', default: 'oak', options: [['oak', 'Oak'], ['walnut', 'Walnut'], ['pine', 'Pine'], ['maple', 'Maple'], ['cherry', 'Cherry'], ['ebony', 'Dark stain'], ['grey', 'Weathered grey'], ['white', 'Whitewashed'], ['teak', 'Teak deck'], ['custom', 'Custom']],
        apply: (v, p) => { const s = SPECIES[v]; if (s) Object.assign(p, s); } },
      { key: 'light', label: 'Light wood', type: 'color', default: SPECIES.oak.light },
      { key: 'dark', label: 'Dark wood', type: 'color', default: SPECIES.oak.dark },
      { key: 'boardVar', label: 'Board color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { key: 'grain', label: 'Grain contrast', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6 },
      { key: 'grainScale', label: 'Grain scale', type: 'range', min: 0.3, max: 4, step: 0.05, default: 1 },
      { key: 'rings', label: 'Growth rings', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Long wavy ring lines (flat-sawn look)' },
      { key: 'knots', label: 'Knots', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Share of boards with a knot' },
      { type: 'section', label: 'Joints & wear' },
      { key: 'gapW', label: 'Gap width', type: 'range', min: 0, max: 8, step: 0.1, default: 1.2, tip: 'px @ 512' },
      { key: 'gap', label: 'Gap color', type: 'color', default: SPECIES.oak.gap },
      { key: 'bevel', label: 'Edge bevel', type: 'range', min: 0, max: 10, step: 0.1, default: 2, tip: 'px @ 512' },
      { key: 'bevelDark', label: 'Bevel darkening', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.bevel > 0 },
      { key: 'nails', label: 'Nails', type: 'bool', default: false, tip: 'Two nail heads at each board end' },
      { key: 'wear', label: 'Worn varnish', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Lighter, matte patches' },
      { key: 'dirt', label: 'Dirt', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Dark grime, mostly along the joints' },
    ],
    presets: [
      { name: 'Oak floor', group: 'Realistic', values: {} },
      { name: 'Walnut parquet (herringbone)', group: 'Realistic', values: { pattern: 'herringbone', species: 'walnut', ...SPECIES.walnut, rows: 16, ratio: 4, gapW: 0.8, bevel: 1, rings: 0.4 } },
      { name: 'Pine boards (rustic)', group: 'Realistic', values: { species: 'pine', ...SPECIES.pine, rows: 5, lenMin: 6, lenMax: 16, knots: 0.6, gapW: 2, bevel: 3, nails: true, wear: 0.35, dirt: 0.35 } },
      { name: 'Maple sports floor', group: 'Realistic', values: { species: 'maple', ...SPECIES.maple, rows: 14, lenMin: 8, lenMax: 20, knots: 0.05, gapW: 0.5, bevel: 0.6, grain: 0.35, rings: 0.3, boardVar: 0.25, wear: 0.1, dirt: 0.05 } },
      { name: 'Cherry half offset', group: 'Realistic', values: { pattern: 'brick', species: 'cherry', ...SPECIES.cherry, rows: 8, boardLen: 6 } },
      { name: 'Basket weave parquet', group: 'Realistic', values: { pattern: 'basket', species: 'oak', ...SPECIES.oak, rows: 12, ratio: 4, gapW: 0.8, bevel: 1, knots: 0.05 } },
      { name: 'Dark stained floor', group: 'Realistic', values: { species: 'ebony', ...SPECIES.ebony, rows: 6, grain: 0.45, wear: 0.15 } },
      { name: 'Weathered barn boards', group: 'Realistic', values: { species: 'grey', ...SPECIES.grey, rows: 4, lenMin: 8, lenMax: 20, knots: 0.7, grain: 0.85, rings: 0.8, gapW: 4, gap: '#14120f', bevel: 4, bevelDark: 0.5, nails: true, wear: 0.5, dirt: 0.5, boardVar: 0.6 } },
      { name: 'Whitewashed boards', group: 'Realistic', values: { species: 'white', ...SPECIES.white, rows: 5, knots: 0.3, gapW: 2, bevel: 2.5, wear: 0.3 } },
      { name: 'Teak boat deck', group: 'Realistic', values: { species: 'teak', ...SPECIES.teak, rows: 10, lenMin: 10, lenMax: 24, gapW: 3, bevel: 0.5, bevelDark: 0.1, knots: 0.05, wear: 0.25, dirt: 0.1 } },
      { name: 'Garden decking', group: 'Realistic', values: { pattern: 'stack', species: 'teak', light: '#a8703c', dark: '#6a4220', gap: '#0a0806', rows: 6, boardLen: 30, gapW: 6, bevel: 2, wear: 0.4, dirt: 0.3, knots: 0.2 } },
      { name: 'Old ship planks', group: 'Realistic', values: { species: 'walnut', light: '#6e5440', dark: '#3a2a1e', gap: '#0c0806', rows: 5, lenMin: 10, lenMax: 26, gapW: 3, bevel: 3, nails: true, knots: 0.5, grain: 0.75, wear: 0.4, dirt: 0.55 } },
      { name: 'Cartoon planks', group: 'Stylized', values: { species: 'custom', light: '#d89a5a', dark: '#a8622e', gap: '#3a1e0c', rows: 5, lenMin: 5, lenMax: 10, grain: 0.3, rings: 0.9, knots: 0.4, gapW: 3, bevel: 5, bevelDark: 0.6, wear: 0, dirt: 0 } },
      { name: 'Haunted manor floor', group: 'Stylized', values: { species: 'custom', light: '#4a3a32', dark: '#1e1612', gap: '#000000', rows: 6, knots: 0.5, grain: 0.8, gapW: 3, bevel: 3, nails: true, wear: 0.5, dirt: 0.7 } },
      { name: 'Sci-fi composite planks', group: 'Sci-fi', values: { pattern: 'third', species: 'custom', light: '#5a6470', dark: '#3a424c', gap: '#0a0c10', rows: 8, boardLen: 6, grain: 0.15, rings: 0, knots: 0, gapW: 1.5, bevel: 1.5, wear: 0.1, dirt: 0.15 } },
    ],
    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height);
      const L = makeLayout(p, W, H), k = Math.min(W, H) / 512, seed = p.seed | 0;
      const light = U.hex(p.light), dark = U.hex(p.dark), gapC = U.hex(p.gap);
      const gapPx = p.gapW * k * 0.5, bevPx = Math.max(0.01, p.bevel * k), gs = p.grainScale;
      // tileable wear / dirt noise: evaluated on a coarse wrapped grid and interpolated (fast, same at every size)
      const coarse = (s, f) => {
        const gw = 96, gh = Math.max(8, Math.round((96 * H) / W)), fy = Math.max(1, Math.round((f * H) / W)), g = new Float32Array(gw * gh);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = U.fractal('perlin', (i / gw) * f, (j / gh) * fy, f, fy, 4, 0.5, 'fbm', seed + s);
        return (x, y) => {
          const X = (x / W) * gw - 0.5, Y = (y / H) * gh - 0.5, i0 = Math.floor(X), j0 = Math.floor(Y), tx = X - i0, ty = Y - j0;
          const at = (i, j) => g[U.mod(j, gh) * gw + U.mod(i, gw)];
          return lerp(lerp(at(i0, j0), at(i0 + 1, j0), tx), lerp(at(i0, j0 + 1), at(i0 + 1, j0 + 1), tx), ty);
        };
      };
      const wearN = p.wear > 0 ? coarse(31, 4) : null, dirtN = p.dirt > 0 ? coarse(41, 6) : null;
      U.pixels(ctx, W, H, (x, y, o) => {
        const px = x + 0.5, py = y + 0.5;
        const X = L.horiz ? px * L.fx : py * L.fx, Y = L.horiz ? py * L.fy : px * L.fy;
        const bd = L.at(X, Y), id = bd.id, upx = L.unitPx;
        // distance to the board edge in px
        const eb = Math.min(bd.b, 1 - bd.b) * upx, ea = bd.ends ? Math.min(bd.a, bd.len - bd.a) * upx : 1e9, e = Math.min(ea, eb);
        const inGap = 1 - smoothstep(gapPx - 0.5, gapPx + 0.5, e);
        const bev = 1 - smoothstep(gapPx, gapPx + bevPx, e);
        // grain in board space: fibers along the board + wavy growth rings + knot
        const off = id * 97.3;
        const fib = U.fractal('perlin', bd.a * 0.35 * gs + off, bd.b * 5 * gs, 0, 0, 3, 0.55, 'fbm', seed + 11);
        let ringT = bd.b * 2.2 * gs + U.fractal('perlin', bd.a * 0.18 * gs + off, bd.b * 0.8, 0, 0, 2, 0.5, 'fbm', seed + 12) * 3 + off;
        let knot = 0;
        if (hash(Math.floor(id * 1e6), 5, seed) < p.knots) {
          const ka = (0.2 + 0.6 * hash(Math.floor(id * 1e6), 6, seed)) * bd.len, kb = 0.3 + 0.4 * hash(Math.floor(id * 1e6), 7, seed);
          // elliptical knot, stretched along the grain; rings bend around it
          const kr = 0.07 + 0.08 * hash(Math.floor(id * 1e6), 8, seed), d = Math.hypot((bd.a - ka) / 2.2, bd.b - kb);
          ringT += (0.25 * kr) / (d + 0.04);
          knot = (1 - smoothstep(kr * 0.3, kr, d)) * (0.75 + 0.25 * Math.sin(d / kr * 9));
        }
        const ring = Math.pow(0.5 + 0.5 * Math.sin(ringT * U.TAU), 3);
        // fine fibers: thin streaks along the board
        const fine = U.fractal('value', bd.a * 0.6 * gs + off, bd.b * 38 * gs, 0, 0, 2, 0.5, 'fbm', seed + 13);
        let t = clamp(0.5 + (fib - 0.5) * 1.6 * p.grain + (fine - 0.5) * 0.7 * p.grain - ring * p.rings * 0.45 * (0.5 + p.grain));
        // per-board color / brightness
        const bv = (hash(Math.floor(id * 1e6), 9, seed) - 0.5) * p.boardVar;
        t = clamp(t + bv * 0.8);
        const bright = 1 + (hash(Math.floor(id * 1e6), 10, seed) - 0.5) * p.boardVar * 0.35;
        let r = lerp(dark[0], light[0], t) * bright, g = lerp(dark[1], light[1], t) * bright, b = lerp(dark[2], light[2], t) * bright;
        if (knot > 0) { const kf = 1 - knot * 0.4; r *= kf; g *= kf * 0.94; b *= kf * 0.88; }
        // nails near the board ends
        let nail = 0;
        if (p.nails && bd.ends) {
          for (const na of [0.35, bd.len - 0.35]) for (const nb of [0.28, 0.72]) {
            const d = Math.hypot((bd.a - na) * upx, (bd.b - nb) * upx);
            nail = Math.max(nail, 1 - smoothstep(1.6 * k, 2.6 * k, d));
          }
          if (nail > 0) { const nf = 1 - nail * 0.75; r = lerp(r, 40, nail * 0.8) * nf + 0; g = lerp(g, 38, nail * 0.8) * nf; b = lerp(b, 36, nail * 0.8) * nf; }
        }
        // wear: lighter, flatter; dirt: darker, mostly near joints
        if (p.wear > 0) {
          const w = smoothstep(0.5, 0.75, wearN(px, py)) * p.wear;
          const l = (r + g + b) / 3;
          r = lerp(r, l * 1.15, w * 0.6); g = lerp(g, l * 1.12, w * 0.6); b = lerp(b, l * 1.05, w * 0.6);
        }
        if (p.dirt > 0) {
          const dn = dirtN(px, py), dm = clamp((smoothstep(0.45, 0.8, dn) * 0.6 + (1 - smoothstep(0, upx * 0.18, e)) * 0.7) * p.dirt);
          r *= 1 - dm * 0.45; g *= 1 - dm * 0.47; b *= 1 - dm * 0.5;
        }
        const bd2 = 1 - bev * p.bevelDark;
        r *= bd2; g *= bd2; b *= bd2;
        if (height) {
          const h = (1 - bev * 0.6) * (0.9 + 0.1 * t) - knot * 0.08 - nail * 0.1;
          const v = lerp(h, 0, inGap) * 255;
          o[0] = o[1] = o[2] = v;
          return;
        }
        o[0] = lerp(r, gapC[0], inGap); o[1] = lerp(g, gapC[1], inGap); o[2] = lerp(b, gapC[2], inGap);
      });
    },
  });
})();
