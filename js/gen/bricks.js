/* Tileable tiles & bricks: running / stack / third / random bond, mortar, rounded corners, bevel,
   chipped edges, surface grain, per-brick color variation. Can also output a height map. */
(function () {
  'use strict';
  const U = window.UGTG;

  const PRESETS = {
    brick: { bond: 'running', cols: 4, rows: 8, mortar: 0.12, radius: 0.08, bevel: 0.18, edgeDark: 0.45, grain: 0.35, grainScale: 24, chip: 0.25, variation: 0.6, brick1: '#9c4a32', brick2: '#6e2f20', mortarColor: '#b8afa3' },
    subway: { bond: 'running', cols: 4, rows: 12, mortar: 0.08, radius: 0.18, bevel: 0.3, edgeDark: 0.25, grain: 0.05, grainScale: 16, chip: 0, variation: 0.15, brick1: '#f2f1ec', brick2: '#dcdad2', mortarColor: '#9a968d' },
    tiles: { bond: 'stack', cols: 4, rows: 4, mortar: 0.04, radius: 0.04, bevel: 0.08, edgeDark: 0.2, grain: 0.08, grainScale: 12, chip: 0, variation: 0.25, brick1: '#3f7f86', brick2: '#2d5f66', mortarColor: '#d9d6cf' },
    pavers: { bond: 'random', cols: 3, rows: 6, mortar: 0.1, radius: 0.22, bevel: 0.22, edgeDark: 0.35, grain: 0.5, grainScale: 32, chip: 0.45, variation: 0.8, brick1: '#8d8a84', brick2: '#5b5955', mortarColor: '#3b3833' },
  };
  const DEF = PRESETS.brick;

  U.register({
    id: 'bricks',
    name: 'Tiles & Bricks',
    desc: 'Tileable brick, tile and paver patterns with mortar, bevel and wear',
    tags: ['Texturing'],
    tileable: true,
    icon: U.icon('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 9.3h18M3 14.6h18M9 4v5.3M15 9.3v5.3M9 14.6V20"/>'),
    params: [
      { type: 'section', label: 'Layout' },
      {
        key: 'preset', label: 'Preset', type: 'select', default: 'brick',
        options: [['custom', 'Custom'], ['brick', 'Red brick'], ['subway', 'Subway tile'], ['tiles', 'Ceramic tiles'], ['pavers', 'Stone pavers']],
        apply: (v, p) => { if (PRESETS[v]) Object.assign(p, PRESETS[v]); },
      },
      { key: 'bond', label: 'Bond', type: 'select', default: DEF.bond, options: [['running', 'Running bond (½ offset)'], ['third', '⅓ offset'], ['stack', 'Stack bond (grid)'], ['random', 'Random offset']] },
      { key: 'cols', label: 'Columns', type: 'int', min: 1, max: 32, default: DEF.cols },
      { key: 'rows', label: 'Rows', type: 'int', min: 1, max: 64, default: DEF.rows, tip: 'Rounded up to an even count (running) or a multiple of 3 (⅓ offset) so it tiles' },
      { key: 'mortar', label: 'Mortar width', type: 'range', min: 0, max: 0.5, step: 0.005, default: DEF.mortar },
      { key: 'radius', label: 'Corner radius', type: 'range', min: 0, max: 0.5, step: 0.01, default: DEF.radius },
      { key: 'seed', label: 'Seed', type: 'seed', default: 17 },

      { type: 'section', label: 'Surface' },
      { key: 'bevel', label: 'Bevel', type: 'range', min: 0, max: 0.5, step: 0.005, default: DEF.bevel },
      { key: 'edgeDark', label: 'Edge shading', type: 'range', min: 0, max: 1, step: 0.01, default: DEF.edgeDark },
      { key: 'chip', label: 'Chipped edges', type: 'range', min: 0, max: 1, step: 0.01, default: DEF.chip },
      { key: 'grain', label: 'Surface grain', type: 'range', min: 0, max: 1, step: 0.01, default: DEF.grain },
      { key: 'grainScale', label: 'Grain scale', type: 'int', min: 2, max: 64, default: DEF.grainScale, show: (p) => p.grain > 0 || p.chip > 0 },

      { type: 'section', label: 'Color' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color'], ['height', 'Height map']] },
      { key: 'brick1', label: 'Brick color', type: 'color', default: DEF.brick1, show: (p) => p.output === 'color' },
      { key: 'brick2', label: 'Brick color 2', type: 'color', default: DEF.brick2, show: (p) => p.output === 'color' },
      { key: 'variation', label: 'Per-brick variation', type: 'range', min: 0, max: 1, step: 0.01, default: DEF.variation, show: (p) => p.output === 'color' },
      { key: 'mortarColor', label: 'Mortar color', type: 'color', default: DEF.mortarColor, show: (p) => p.output === 'color' },
    ],
    presets: [
      { name: 'Aged red brick', group: 'Realistic', values: { preset: 'brick', chip: 0.45, grain: 0.55, variation: 0.7, edgeDark: 0.5, brick2: '#5e2418', mortarColor: '#8c8378', seed: 23 } },
      { name: 'Old London stock brick', group: 'Realistic', values: { chip: 0.55, grain: 0.6, variation: 0.9, edgeDark: 0.55, brick1: '#c2a46c', brick2: '#6f5a3c', mortarColor: '#8c8476' } },
      { name: 'Dark clinker brick', group: 'Realistic', values: { cols: 4, rows: 10, mortar: 0.1, chip: 0.12, grain: 0.25, variation: 0.7, brick1: '#5a3226', brick2: '#24140f', mortarColor: '#6b6760' } },
      { name: 'Whitewashed brick', group: 'Realistic', values: { mortar: 0.09, chip: 0.4, grain: 0.45, variation: 0.35, edgeDark: 0.35, brick1: '#ece8e0', brick2: '#bfb5a6', mortarColor: '#d3cdc1' } },
      { name: 'Cinder blocks', group: 'Realistic', values: { cols: 2, rows: 4, mortar: 0.08, radius: 0.02, bevel: 0.05, edgeDark: 0.2, grain: 0.7, grainScale: 48, chip: 0.1, variation: 0.25, brick1: '#a3a29c', brick2: '#86847e', mortarColor: '#bab7af' } },
      { name: 'White subway tile', group: 'Realistic', values: { preset: 'subway' } },
      { name: 'Bathroom tiles', group: 'Realistic', values: { preset: 'tiles', cols: 8, rows: 8, mortar: 0.06, variation: 0.1, brick1: '#f3f5f5', brick2: '#dfe4e4', mortarColor: '#8f989a' } },
      { name: 'Teal ceramic tiles', group: 'Realistic', values: { preset: 'tiles' } },
      { name: 'Terracotta floor', group: 'Realistic', values: { preset: 'tiles', mortar: 0.07, radius: 0.06, grain: 0.35, grainScale: 20, chip: 0.15, variation: 0.6, brick1: '#b8673e', brick2: '#8c4728', mortarColor: '#cfc5b3' } },
      { name: 'Pool mosaic', group: 'Realistic', values: { preset: 'tiles', cols: 16, rows: 16, mortar: 0.12, radius: 0.12, variation: 0.9, brick1: '#46b3d4', brick2: '#1b6b93', mortarColor: '#e6eef0' } },
      { name: 'Cobblestone pavers', group: 'Realistic', values: { preset: 'pavers', cols: 8, rows: 8, mortar: 0.14, radius: 0.5, bevel: 0.14, edgeDark: 0.45, chip: 0.5, grain: 0.55, brick1: '#8f8b84', brick2: '#5e5b56' } },
      { name: 'Sandstone flagstones', group: 'Realistic', values: { bond: 'random', cols: 2, rows: 3, mortar: 0.05, radius: 0.04, bevel: 0.08, chip: 0.5, grain: 0.6, grainScale: 40, variation: 0.8, edgeDark: 0.3, brick1: '#cfae7c', brick2: '#9a7650', mortarColor: '#5a4a38' } },
      { name: 'Castle stone', group: 'Realistic', values: { bond: 'random', cols: 3, rows: 6, mortar: 0.09, radius: 0.12, bevel: 0.14, edgeDark: 0.5, chip: 0.6, grain: 0.7, grainScale: 40, variation: 0.7, brick1: '#8d897f', brick2: '#5c5850', mortarColor: '#48443c' } },
      { name: 'Dungeon wall', group: 'Stylized', values: { bond: 'random', cols: 3, rows: 6, mortar: 0.12, radius: 0.18, bevel: 0.16, edgeDark: 0.65, chip: 0.5, grain: 0.5, grainScale: 28, variation: 0.6, brick1: '#55535e', brick2: '#2b2a33', mortarColor: '#121116' } },
      { name: 'Toon bricks', group: 'Stylized', values: { cols: 3, rows: 6, mortar: 0.16, radius: 0.3, bevel: 0.06, edgeDark: 0.6, chip: 0, grain: 0, variation: 0.35, brick1: '#e0603e', brick2: '#b93f28', mortarColor: '#f3dcb9' } },
      { name: 'Hand-painted cobbles', group: 'Stylized', values: { preset: 'pavers', cols: 4, rows: 6, mortar: 0.14, radius: 0.48, bevel: 0.16, edgeDark: 0.55, chip: 0.25, grain: 0.15, variation: 0.6, brick1: '#c4ae8e', brick2: '#8a7258', mortarColor: '#3d3126' } },
      { name: 'Mossy temple stone', group: 'Stylized', values: { bond: 'third', cols: 3, rows: 6, mortar: 0.1, radius: 0.22, bevel: 0.14, edgeDark: 0.5, chip: 0.35, grain: 0.4, variation: 0.6, brick1: '#8c9a76', brick2: '#56664a', mortarColor: '#26321e' } },
      { name: 'Candy tiles', group: 'Stylized', values: { preset: 'tiles', cols: 6, rows: 6, mortar: 0.14, radius: 0.35, bevel: 0.2, edgeDark: 0.3, grain: 0, variation: 1, brick1: '#f7a8c8', brick2: '#9fd2f5', mortarColor: '#fff6fb' } },
      { name: 'Hull plates', group: 'Sci-fi', values: { bond: 'random', cols: 2, rows: 3, mortar: 0.025, radius: 0.03, bevel: 0.04, edgeDark: 0.55, chip: 0, grain: 0.15, grainScale: 12, variation: 0.4, brick1: '#7f868e', brick2: '#5c636b', mortarColor: '#16191d' } },
      { name: 'Offset tech panels', group: 'Sci-fi', values: { bond: 'third', cols: 3, rows: 6, mortar: 0.05, radius: 0.08, bevel: 0.1, edgeDark: 0.4, chip: 0, grain: 0.08, grainScale: 10, variation: 0.3, brick1: '#ccd1d6', brick2: '#a3a9b0', mortarColor: '#2c3137' } },
      { name: 'Glowing floor grid', group: 'Sci-fi', values: { bond: 'stack', cols: 4, rows: 4, mortar: 0.05, radius: 0.1, bevel: 0.12, edgeDark: 0.5, chip: 0, grain: 0.1, variation: 0.2, brick1: '#2f353d', brick2: '#22272d', mortarColor: '#22e0ff' } },
      { name: 'Neon grid panels', group: 'Sci-fi', values: { bond: 'stack', cols: 8, rows: 8, mortar: 0.08, radius: 0.04, bevel: 0.15, edgeDark: 0.6, chip: 0, grain: 0, variation: 0.6, brick1: '#141830', brick2: '#0a0c18', mortarColor: '#ff2bd6' } },
      { name: 'Hull panels height map', group: 'Sci-fi', values: { bond: 'stack', cols: 4, rows: 8, mortar: 0.04, radius: 0.05, bevel: 0.4, chip: 0, grain: 0.1, output: 'height' } },
    ],
    render(ctx, W, H, p) {
      const cols = p.cols;
      let rows = p.rows;
      if (p.bond === 'running' && rows % 2) rows++;
      if (p.bond === 'third' && rows % 3) rows += 3 - (rows % 3);
      const cw = W / cols, ch = H / rows, m = Math.min(cw, ch);
      const mort = (p.mortar * m) / 2;                       // half mortar, px
      const hx = Math.max(0.5, cw / 2 - mort), hy = Math.max(0.5, ch / 2 - mort);
      const rad = p.radius * Math.min(hx, hy);
      const bev = Math.max(0.5, p.bevel * m), chipAmp = p.chip * m * 0.18;
      const gs = p.grainScale, gsy = Math.max(1, Math.round((gs * H) / W));
      const b1 = U.hex(p.brick1), b2 = U.hex(p.brick2), mc = U.hex(p.mortarColor);
      const height = p.output === 'height';

      U.pixels(ctx, W, H, (x, y, o) => {
        const u = (x + 0.5) / W, v = (y + 0.5) / H;
        const fr = v * rows, row = Math.floor(fr), rw = U.mod(row, rows);
        const off = p.bond === 'running' ? (rw % 2) * 0.5
          : p.bond === 'third' ? (rw % 3) / 3
          : p.bond === 'random' ? U.hash(rw, 101, p.seed) : 0;
        const fc = u * cols + off, col = Math.floor(fc), cl = U.mod(col, cols);
        // position inside the brick, centered, in px
        const lx = Math.abs((fc - col - 0.5) * cw), ly = Math.abs((fr - row - 0.5) * ch);
        // rounded-box signed distance (negative inside the brick)
        const qx = lx - (hx - rad), qy = ly - (hy - rad);
        let dist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
        if (chipAmp > 0) dist += (U.fractal('perlin', u * gs * 2, v * gsy * 2, gs * 2, gsy * 2, 3, 0.55, 'fbm', p.seed + 5) - 0.45) * chipAmp * 2;
        const cover = U.clamp(0.5 - dist);                 // 1 inside, 0 in mortar, AA'd over ~1px
        const ramp = U.smoothstep(0, bev, -dist);           // 0 at the brick edge → 1 past the bevel
        const g = p.grain > 0 ? U.fractal('perlin', u * gs, v * gsy, gs, gsy, 4, 0.5, 'fbm', p.seed + 9) - 0.5 : 0;

        if (height) {
          const hBrick = 0.35 + 0.65 * ramp + g * p.grain * 0.25;
          const hMortar = 0.08 + g * p.grain * 0.1;
          const val = U.clamp(hMortar + (hBrick - hMortar) * cover) * 255;
          o[0] = o[1] = o[2] = val;
          return;
        }
        const r = U.hash(cl, rw, p.seed), t = r * p.variation;
        const shade = (1 - p.edgeDark * (1 - ramp)) * (1 + g * p.grain * 0.6) * (1 + (U.hash(cl, rw, p.seed + 3) - 0.5) * p.variation * 0.25);
        const mshade = 1 + g * p.grain * 0.4;
        for (let k = 0; k < 3; k++) {
          const brick = (b1[k] + (b2[k] - b1[k]) * t) * shade;
          o[k] = U.clamp(mc[k] * mshade + (brick - mc[k] * mshade) * cover, 0, 255);
        }
      });
      return { text: `${cols} × ${rows} bricks` };
    },
  });
})();
