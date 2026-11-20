/* Rock & cliff: tileable rock surfaces built from a height field. Components, each weighted by a setting:
   base undulation (fbm), rough ridged detail, sedimentary strata (wavy, tilted layers of different
   hardness that stand out as ledges), vertical joints (elongated Worley cells), blocky fractures
   (Worley blocks with bevelled, chipped edges), rounded lumps (boulders), pores / pits, vertical
   erosion grooves and crystal veins. The field is sampled on a periodic grid (one node per output pixel
   up to a cap, so it tiles and stays fast), lit from one light angle (normal from the height gradient,
   lambert + cavity occlusion + edge highlights) and colored from three rock colors by height, layer and
   noise. Overlays follow the shape: snow on upward-facing ledges, moss in crevices and on top faces,
   lichen spots on exposed rock, dirt in cavities. Styles: realistic, toon (banded light, outlined cracks)
   and hand-painted. Output: lit color, flat albedo (no baked light, for engines), or the height map
   (also used by the normal map mode). */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const RAD = Math.PI / 180;

  // rock types: colors + structure (the type select applies them, then everything stays editable)
  const C = (c1, c2, c3) => ({ c1, c2, c3 });
  const TYPES = {
    cliff: Object.assign(C('#a39a8c', '#7f7668', '#4a443c'), { strata: 0.75, strataCount: 9, strataAngle: 0.1, strataWarp: 0.45, joints: 0.55, fracture: 0, lumps: 0, pores: 0, erosion: 0.25, detail: 0.55, colorVar: 0.6 }),
    granite: Object.assign(C('#b3aea8', '#8e8984', '#55514d'), { strata: 0, joints: 0.15, fracture: 0.8, blockSize: 5, lumps: 0, pores: 0, erosion: 0, detail: 0.6, colorVar: 0.45, speckle: 0.6 }),
    boulder: Object.assign(C('#9a978f', '#77746c', '#46443f'), { strata: 0, joints: 0, fracture: 0.15, blockSize: 4, lumps: 0.85, lumpSize: 4, pores: 0, erosion: 0.1, detail: 0.35, colorVar: 0.5 }),
    slate: Object.assign(C('#5c6168', '#464b52', '#25282d'), { strata: 0.9, strataCount: 26, strataAngle: 0.35, strataWarp: 0.25, joints: 0.35, fracture: 0.2, blockSize: 6, lumps: 0, pores: 0, erosion: 0, detail: 0.45, colorVar: 0.35 }),
    sandstone: Object.assign(C('#d6a77a', '#b98458', '#7a4e30'), { strata: 0.6, strataCount: 12, strataAngle: 0, strataWarp: 0.7, joints: 0.2, fracture: 0, lumps: 0.15, lumpSize: 5, pores: 0.15, erosion: 0.7, detail: 0.35, colorVar: 0.8 }),
    basalt: Object.assign(C('#4a4a4c', '#363638', '#1a1a1c'), { strata: 0, joints: 0.4, fracture: 0.75, blockSize: 7, lumps: 0, pores: 0.55, erosion: 0, detail: 0.5, colorVar: 0.3 }),
  };
  const TYPE_OPTS = [['cliff', 'Cliff face (strata)'], ['granite', 'Granite (blocky)'], ['boulder', 'Weathered boulders'], ['slate', 'Slate / shale'], ['sandstone', 'Sandstone'], ['basalt', 'Volcanic / basalt'], ['custom', 'Custom']];


  /* periodic cellular noise: distances to the nearest / second feature point, the nearest cell's random id and
     `face`: a random tilted plane through that cell's feature point (flat, faceted rock faces) */
  const CELL = { f1: 0, f2: 0, id: 0, face: 0 };
  function cell(x, y, px, py, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 1e9, f2 = 1e9, best = 0, dx1 = 0, dy1 = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, wx = U.mod(cx, px), wy = U.mod(cy, py);
      const dx = cx + U.hash(wx, wy, s) - x, dy = cy + U.hash(wx, wy, s + 7919) - y, d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; best = wx * 73856093 ^ wy * 19349663; dx1 = dx; dy1 = dy; } else if (d < f2) f2 = d;
    }
    const id = U.hash(best, 3, s + 104729), ax = U.hash(best, 5, s + 31) * 2 - 1, ay = U.hash(best, 9, s + 37) * 2 - 1;
    CELL.f1 = Math.sqrt(f1); CELL.f2 = Math.sqrt(f2); CELL.id = id;
    CELL.face = (id - 0.5) * 0.7 - (dx1 * ax + dy1 * ay) * 0.9; // offset + tilt (dx1, dy1 point from the sample to the feature point)
    return CELL;
  }

  // wrap-around box blur on a grid (two passes ≈ tent), radius r in nodes
  function blur(src, w, h, r) {
    if (r < 1) return Float32Array.from(src);
    const a = Float32Array.from(src), t = new Float32Array(src.length), inv = 1 / (2 * r + 1);
    for (let n = 0; n < 2; n++) {
      for (let y = 0; y < h; y++) {
        const o = y * w; let s = 0;
        for (let k = -r; k <= r; k++) s += a[o + U.mod(k, w)];
        for (let x = 0; x < w; x++) { t[o + x] = s * inv; s += a[o + U.mod(x + r + 1, w)] - a[o + U.mod(x - r, w)]; }
      }
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += t[U.mod(k, h) * w + x];
        for (let y = 0; y < h; y++) { a[y * w + x] = s * inv; s += t[U.mod(y + r + 1, h) * w + x] - t[U.mod(y - r, h) * w + x]; }
      }
    }
    return a;
  }

  U.register({
    id: 'rock',
    name: 'Rock & Cliff',
    desc: 'Tileable rock and cliff surfaces with strata, joints, fractures, boulders, erosion, moss, snow and height map',
    uses: [
      'Seamless cliff, mountain and cave materials for 3D terrain and rock meshes: use the flat albedo with the height-based normal map and the Smoothness mode for a full material set.',
      'Rock walls, ledges and backgrounds for 2D platformers and hand-painted or toon-styled games.',
    ],
    tags: ['Texturing', 'Nature'],
    tileable: true,
    heightMap: true,
    normalDesc: 'Normal map from the rock height field (strata, facets, cracks; snow and moss slightly raised)',
    normalDefaults: { strength: 7, smooth: 0.5 },
    icon: U.icon('<path d="M3 19l4-8 3 3 4-8 7 13z"/><path d="M7 11l2 4M14 6l1 5" opacity=".55"/>'),
    params: [
      { type: 'section', label: 'Rock' },
      {
        key: 'type', label: 'Rock type', type: 'select', default: 'cliff', options: TYPE_OPTS,
        apply: (v, p) => { if (TYPES[v]) Object.assign(p, TYPES[v]); },
        tip: 'Picks colors and structure; tweak them afterwards',
      },
      { key: 'scale', label: 'Scale', type: 'int', min: 1, max: 10, default: 3, tip: 'Large features across the texture' },
      { key: 'detail', label: 'Roughness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Small rough, ridged surface detail' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 8 },

      { type: 'section', label: 'Structure' },
      { key: 'strata', label: 'Strata', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75, tip: 'Sedimentary layers of different hardness that stand out as ledges' },
      { key: 'strataCount', label: 'Layers', type: 'int', min: 2, max: 40, default: 9, show: (p) => p.strata > 0 },
      { key: 'strataAngle', label: 'Layer tilt', type: 'range', min: -1, max: 1, step: 0.05, default: 0.1, show: (p) => p.strata > 0, tip: 'Snaps to angles that still tile' },
      { key: 'strataWarp', label: 'Layer waviness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.strata > 0 },
      { key: 'joints', label: 'Vertical joints', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Long vertical cracks splitting the rock into columns' },
      { key: 'fracture', label: 'Blocky fractures', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Angular blocks with chipped, bevelled edges' },
      { key: 'blockSize', label: 'Blocks across', type: 'int', min: 2, max: 20, default: 5, show: (p) => p.fracture > 0 },
      { key: 'lumps', label: 'Rounded lumps', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Weathered, rounded boulders' },
      { key: 'lumpSize', label: 'Lumps across', type: 'int', min: 2, max: 16, default: 4, show: (p) => p.lumps > 0 },
      { key: 'crackWidth', label: 'Crack width', type: 'range', min: 0.02, max: 0.3, step: 0.005, default: 0.08, show: (p) => p.joints > 0 || p.fracture > 0 },
      { key: 'pores', label: 'Pores / pits', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Small holes, as in volcanic rock' },
      { key: 'erosion', label: 'Erosion', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Vertical rain grooves and softened edges' },
      { key: 'veins', label: 'Crystal veins', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Thin mineral or crystal veins running through the rock' },
      { key: 'veinScale', label: 'Vein scale', type: 'int', min: 1, max: 8, default: 2, show: (p) => p.veins > 0 },

      { type: 'section', label: 'Color' },
      { key: 'c1', label: 'Light rock', type: 'color', default: TYPES.cliff.c1 },
      { key: 'c2', label: 'Mid rock', type: 'color', default: TYPES.cliff.c2 },
      { key: 'c3', label: 'Dark rock / crevices', type: 'color', default: TYPES.cliff.c3 },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Patches and layer-to-layer color changes' },
      { key: 'speckle', label: 'Mineral speckle', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Light and dark grains, as in granite' },
      { key: 'veinColor', label: 'Vein color', type: 'color', default: '#e8e2d4', show: (p) => p.veins > 0 },
      { key: 'veinGlow', label: 'Vein glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.veins > 0, tip: 'Emissive veins (crystals, magma, alien minerals); not shaded' },

      { type: 'section', label: 'Overlays', active: (p) => p.moss > 0 || p.snow > 0 || p.lichen > 0 || p.dirt > 0 },
      { key: 'moss', label: 'Moss', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Grows in crevices and on upward-facing parts' },
      { key: 'mossColor', label: 'Moss color', type: 'color', default: '#5a7a2a', show: (p) => p.moss > 0 },
      { key: 'snow', label: 'Snow', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Settles on upward-facing ledges' },
      { key: 'snowColor', label: 'Snow color', type: 'color', default: '#eef3f8', show: (p) => p.snow > 0 },
      { key: 'lichen', label: 'Lichen', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Small crusty spots on exposed rock' },
      { key: 'lichenColor', label: 'Lichen color', type: 'color', default: '#c9b860', show: (p) => p.lichen > 0 },
      { key: 'dirt', label: 'Dirt', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Darkens cavities and low parts' },
      { key: 'dirtColor', label: 'Dirt color', type: 'color', default: '#3a3026', show: (p) => p.dirt > 0 },

      { type: 'section', label: 'Shading' },
      { key: 'style', label: 'Style', type: 'select', default: 'realistic', options: [['realistic', 'Realistic'], ['painted', 'Hand-painted'], ['toon', 'Toon (bands + outlines)']] },
      { key: 'bands', label: 'Light bands', type: 'int', min: 2, max: 6, default: 3, show: (p) => p.style === 'toon' },
      { key: 'light', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -125, tip: '-90 = light from the top, -135 = top-left' },
      { key: 'lightAmt', label: 'Shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75 },
      { key: 'bump', label: 'Relief depth', type: 'range', min: 0.1, max: 3, step: 0.05, default: 1, tip: 'How steep the relief is lit (and how strongly overlays follow it)' },
      { key: 'cavity', label: 'Cavity darkening', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Ambient occlusion in cracks and hollows' },
      { key: 'edges', label: 'Edge highlights', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Brightens sharp, exposed ridges and ledge edges' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'lit', options: [['lit', 'Color (lit)'], ['albedo', 'Albedo (no baked light)'], ['height', 'Height map']], tip: 'Albedo leaves the lighting to the engine: pair it with the normal map and Smoothness modes' },
    ],
    presets: [
      { name: 'Sedimentary cliff', group: 'Realistic', values: {} },
      { name: 'Granite outcrop', group: 'Realistic', values: { type: 'granite', ...TYPES.granite, seed: 14 } },
      { name: 'Weathered boulders', group: 'Realistic', values: { type: 'boulder', ...TYPES.boulder, lichen: 0.35, seed: 3 } },
      { name: 'Slate wall', group: 'Realistic', values: { type: 'slate', ...TYPES.slate, dirt: 0.15, seed: 21 } },
      { name: 'Desert sandstone', group: 'Realistic', values: { type: 'sandstone', ...TYPES.sandstone, dirt: 0.1, dirtColor: '#6a3e22', seed: 5 } },
      { name: 'Red canyon wall', group: 'Realistic', values: { type: 'sandstone', ...TYPES.sandstone, c1: '#c9805a', c2: '#a35a38', c3: '#5e2c18', strataCount: 16, strata: 0.8, erosion: 0.5, seed: 33 } },
      { name: 'Volcanic basalt', group: 'Realistic', values: { type: 'basalt', ...TYPES.basalt, dirt: 0.1, seed: 9 } },
      { name: 'Mossy forest rock', group: 'Realistic', values: { type: 'boulder', ...TYPES.boulder, c1: '#8a8a80', c2: '#686860', moss: 0.7, mossColor: '#4f7a24', lichen: 0.25, dirt: 0.35, seed: 17 } },
      { name: 'Mossy cliff', group: 'Realistic', values: { moss: 0.55, mossColor: '#56782a', dirt: 0.35, seed: 25 } },
      { name: 'Snowy mountain rock', group: 'Realistic', values: { type: 'granite', ...TYPES.granite, c1: '#8f8d8a', c2: '#6e6c69', c3: '#3a3937', snow: 0.65, dirt: 0.1, seed: 41 } },
      { name: 'Icy cliff ledges', group: 'Realistic', values: { strata: 0.85, strataCount: 7, c1: '#8a8e94', c2: '#666a70', c3: '#33363b', snow: 0.75, snowColor: '#f2f7ff', dirt: 0.05, seed: 12 } },
      { name: 'Cave wall (dark, wet)', group: 'Realistic', values: { type: 'boulder', ...TYPES.boulder, c1: '#5a5650', c2: '#3e3a35', c3: '#1a1814', lumps: 0.6, fracture: 0.3, cavity: 0.85, edges: 0.55, dirt: 0.4, seed: 6 } },
      { name: 'Hand-painted cliff', group: 'Stylized', values: { style: 'painted', detail: 0.2, c1: '#c8b49a', c2: '#9a8468', c3: '#5a4634', colorVar: 0.4, edges: 0.75, cavity: 0.7, moss: 0.3, mossColor: '#7aa03a', seed: 4 } },
      { name: 'Toon rock', group: 'Stylized', values: { type: 'granite', ...TYPES.granite, style: 'toon', bands: 3, detail: 0.15, speckle: 0, c1: '#b0a8c0', c2: '#8a82a0', c3: '#4a4460', edges: 0.6, seed: 19 } },
      { name: 'Toon desert mesa', group: 'Stylized', values: { type: 'sandstone', ...TYPES.sandstone, style: 'toon', bands: 3, detail: 0.1, pores: 0, c1: '#f0b070', c2: '#d07a40', c3: '#8a3a20', strataCount: 6, seed: 2 } },
      { name: 'Glowing crystal veins', group: 'Fantasy & Sci-fi', values: { type: 'basalt', ...TYPES.basalt, pores: 0.2, veins: 0.8, veinScale: 2, veinColor: '#3ae8ff', veinGlow: 0.9, seed: 27 } },
      { name: 'Magma rock', group: 'Fantasy & Sci-fi', values: { type: 'basalt', ...TYPES.basalt, c1: '#3a3230', c2: '#262120', c3: '#100c0b', fracture: 0.9, blockSize: 6, veins: 0.9, veinScale: 3, veinColor: '#ff6a10', veinGlow: 1, seed: 13 } },
      { name: 'Alien rock', group: 'Fantasy & Sci-fi', values: { type: 'boulder', ...TYPES.boulder, c1: '#7a8aa8', c2: '#56628a', c3: '#2a2a4a', lumps: 0.7, pores: 0.45, veins: 0.5, veinColor: '#c060ff', veinGlow: 0.6, lichen: 0.4, lichenColor: '#7aff9a', seed: 31 } },
      { name: 'Gold ore vein', group: 'Fantasy & Sci-fi', values: { type: 'slate', ...TYPES.slate, veins: 0.65, veinScale: 3, veinColor: '#ffcc40', veinGlow: 0.15, seed: 23 } },
    ],
    render(ctx, W, H, p, opts) {
      const heightOut = !!(opts && opts.height) || p.output === 'height', albedo = p.output === 'albedo';
      const seed = p.seed | 0, ar = H / W, S = Math.min(W, H);
      // periods: whole numbers across the width and the height, so everything tiles
      const per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const fb = (u, v, f, oct, s, mode) => { const [px, py] = per(f); return U.fractal('perlin', u * px, v * py, px, py, oct, 0.5, mode || 'fbm', seed + s); };

      /* ---------- grid: one node per pixel up to a cap, upsampled bilinearly (wraps) ---------- */
      const cap = 400, gw = Math.min(W, cap), gh = Math.max(1, Math.round(gw * ar)), N = gw * gh;
      const Hf = new Float32Array(N), CT = new Float32Array(N), CR = new Float32Array(N), VN = new Float32Array(N);
      const s = p.scale;
      const [jx, jy] = [Math.max(1, Math.round(s * 2.2)), Math.max(1, Math.round(s * 0.7 * ar))];
      const nb = Math.max(2, p.strataCount | 0), kTilt = Math.round(p.strataAngle * nb * 0.5);
      const [bx, by] = per(p.blockSize), [lx, ly] = per(p.lumpSize), [px4, py4] = per(s * 9), [ex, ey] = [Math.max(1, Math.round(s * 5)), Math.max(1, Math.round(s * 0.6 * ar))];
      // low-frequency noise on coarse periodic grids (q = reduction), read back bilinearly: same look, far fewer noise calls
      const field = (q, fn) => {
        const w = Math.max(4, Math.ceil(gw / q)), hh = Math.max(4, Math.ceil(gh / q)), a = new Float32Array(w * hh);
        for (let jj = 0, k = 0; jj < hh; jj++) for (let ii = 0; ii < w; ii++, k++) a[k] = fn(ii / w, jj / hh);
        return (u, v) => {
          const fx = u * w, fy = v * hh, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
          const xa = U.mod(x0, w), xb = U.mod(x0 + 1, w), ya = U.mod(y0, hh) * w, yb = U.mod(y0 + 1, hh) * w;
          const A = a[ya + xa] + (a[ya + xb] - a[ya + xa]) * tx, B = a[yb + xa] + (a[yb + xb] - a[yb + xa]) * tx;
          return A + (B - A) * ty;
        };
      };
      const fBase = field(4, (u, v) => fb(u, v, s, 3, 1)), fCT = field(4, (u, v) => fb(u, v, s * 1.5, 2, 30));
      const fWU = field(4, (u, v) => fb(u, v, s * 2, 2, 71)), fWV = field(4, (u, v) => fb(u, v, s * 2, 2, 72));
      const fVis = field(4, (u, v) => fb(u, v, s * 1.3, 2, 61)), fCW = field(4, (u, v) => fb(u, v, s * 3, 1, 62));
      const fStr = p.strata > 0 ? field(4, (u, v) => fb(u, v, s * 1.2, 2, 3)) : null;
      const fChip = p.fracture > 0 ? field(2, (u, v) => fb(u, v, p.blockSize * 3, 1, 14)) : null;
      const fLich = p.lichen > 0 ? field(2, (u, v) => fb(u, v, s * 6, 3, 51)) : null;
      const fMoss = p.moss > 0 ? field(2, (u, v) => fb(u, v, s * 3, 4, 53)) : null;
      const fEro = p.erosion > 0 ? field(2, (u, v) => U.fractal('perlin', u * ex, v * ey, ex, ey, 3, 0.5, 'ridged', seed + 19)) : null;
      const fSnow = p.snow > 0 ? field(2, (u, v) => fb(u, v, s * 2.5, 3, 57)) : null;
      const cw = p.crackWidth, warpU = 0.45 / Math.max(jx, bx, lx, 2), warpV = 0.45 / Math.max(jy, by, ly, 2);
      for (let j = 0, o = 0; j < gh; j++) {
        const v = j / gh;
        for (let i = 0; i < gw; i++, o++) {
          const u = i / gw;
          let h = fBase(u, v) * 0.5, crack = 0, ct = fCT(u, v);
          if (p.detail > 0) h += (fb(u, v, s * 4, 3, 2, 'ridged') - 0.5) * p.detail * 0.3;
          // domain warp for the cell layers: wobbly, natural crack lines instead of straight Voronoi edges
          const wu = u + (fWU(u, v) - 0.5) * warpU, wv = v + (fWV(u, v) - 0.5) * warpV;
          // cracks only show along part of the cell borders (broken, natural-looking crack network)
          const crackVis = smoothstep(0.38, 0.58, fVis(u, v)), crackW = cw * (0.6 + 0.8 * fCW(u, v));
          if (p.strata > 0) {
            // wavy, tilted layers of different hardness: the top of each layer juts out as a ledge and its
            // face slopes back down to the next layer (a step that faces down: shadow under every ledge)
            const ph = v * nb + u * kTilt + (fStr(u, v) - 0.5) * p.strataWarp * 3;
            const li = Math.floor(ph), fr = ph - li, lid = U.mod(li, nb);
            const hard = U.hash(lid, 7, seed + 9), round = smoothstep(0, 0.1, fr);
            h += p.strata * ((0.35 + 0.65 * hard) * (0.42 * Math.pow(1 - fr, 0.7) * round + 0.12) - 0.2);
            ct = lerp(ct, U.hash(lid, 11, seed + 9), p.strata * 0.7);
            crack = Math.max(crack, (1 - round) * p.strata * 0.25);
          }
          if (p.joints > 0) {
            // tall cells: their borders run mostly vertically (columns split by joints); each column a tilted face
            const c = cell(wu * jx, wv * jy, jx, jy, seed + 11), e = c.f2 - c.f1;
            const jc = (1 - smoothstep(crackW * 0.2, crackW, e)) * (0.35 + 0.65 * crackVis);
            h += p.joints * (c.face * 0.22 - jc * 0.28 - (1 - smoothstep(0, crackW * 3, e)) * 0.06);
            crack = Math.max(crack, jc * p.joints);
          }
          if (p.fracture > 0) {
            // angular blocks: each a flat, randomly tilted facet with a chipped, bevelled rim
            const c = cell(wu * bx, wv * by, bx, by, seed + 13), chip = (fChip(u, v) - 0.5) * 0.14, e = c.f2 - c.f1 + chip, face1 = c.face;
            const bevel = smoothstep(0, crackW * 3, e), fc = (1 - smoothstep(crackW * 0.15, crackW * 0.7, e)) * (0.3 + 0.7 * crackVis);
            // a finer fracture level splits every block into smaller facets (shallower, thinner cracks)
            const c2 = cell(wu * bx * 2, wv * by * 2, bx * 2, by * 2, seed + 14), e2 = c2.f2 - c2.f1;
            const fc2 = (1 - smoothstep(crackW * 0.1, crackW * 0.45, e2)) * crackVis * 0.5;
            h += p.fracture * (face1 * 0.36 + c2.face * 0.1 + bevel * 0.08 - fc * 0.22 - fc2 * 0.08);
            crack = Math.max(crack, fc2 * p.fracture * 0.6);
            ct = lerp(ct, c.id, p.fracture * 0.35);
            crack = Math.max(crack, fc * p.fracture);
          }
          if (p.lumps > 0) {
            // rounded lumps that fill their cells and meet in soft creases
            const c = cell(wu * lx, wv * ly, lx, ly, seed + 15), e = (c.f2 - c.f1) / Math.max(1e-3, c.f2);
            h += p.lumps * (Math.sqrt(clamp(e * 1.4)) * 0.42 + (c.id - 0.5) * 0.1 - 0.15);
            ct = lerp(ct, c.id, p.lumps * 0.25);
            crack = Math.max(crack, (1 - smoothstep(0, 0.12, e)) * p.lumps * 0.35 * crackVis);
          }
          if (p.pores > 0) {
            const c = U.worley(u * px4, v * py4, px4, py4, seed + 17);
            const pit = c.id < p.pores * 0.55 ? 1 - smoothstep(0.06, 0.24 * (0.5 + c.id), c.f1) : 0;
            h -= pit * 0.1; crack = Math.max(crack, pit * 0.5);
          }
          if (p.erosion > 0) {
            // vertical rain grooves
            const gq = fEro(u, v);
            h -= p.erosion * smoothstep(0.55, 1, gq) * 0.12;
          }
          if (p.veins > 0) {
            const vs = p.veinScale, [vx, vy] = per(vs);
            const r = U.fractal('perlin', u * vx + 0.31, v * vy + 0.17, vx, vy, 3, 0.45, 'ridged', seed + 23);
            const vv = smoothstep(0.86 - p.veins * 0.08, 0.97, r);
            VN[o] = vv; h -= vv * 0.04;
          }
          Hf[o] = h; CT[o] = ct; CR[o] = crack;
        }
      }
      // normalize the height to 0..1; erosion softens it
      let mn = Infinity, mx = -Infinity;
      for (let o = 0; o < N; o++) { if (Hf[o] < mn) mn = Hf[o]; if (Hf[o] > mx) mx = Hf[o]; }
      const span = Math.max(1e-6, mx - mn);
      for (let o = 0; o < N; o++) Hf[o] = (Hf[o] - mn) / span;
      let Hs = Hf;
      if (p.erosion > 0 || p.style === 'painted') {
        const soft = blur(Hf, gw, gh, Math.max(1, Math.round(gw / 220)));
        const k = Math.min(0.85, p.erosion * 0.5 + (p.style === 'painted' ? 0.6 : 0));
        Hs = new Float32Array(N); for (let o = 0; o < N; o++) Hs[o] = lerp(Hf[o], soft[o], k);
      }
      const HB = blur(Hs, gw, gh, Math.max(1, Math.round(gw / 45))); // local average: cavities / ridges
      const HO = blur(Hs, gw, gh, Math.max(1, Math.round(gw / 110))); // smoothed surface for snow / moss
      const VG = p.veins > 0 && p.veinGlow > 0 ? blur(VN, gw, gh, Math.max(1, Math.round(gw / 120))) : null;

      /* ---------- color per node ---------- */
      const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), Hout = new Float32Array(N);
      const c1 = U.hex(p.c1), c2 = U.hex(p.c2), c3 = U.hex(p.c3), mc = U.hex(p.mossColor), sc = U.hex(p.snowColor), lc = U.hex(p.lichenColor), dc = U.hex(p.dirtColor), vc = U.hex(p.veinColor);
      const la = p.light * RAD, el = 0.75, Lx = Math.cos(la) * el, Ly = Math.sin(la) * el, Lz = Math.sqrt(1 - el * el) + 0.35, Ln = Math.hypot(Lx, Ly, Lz);
      const bumpK = p.bump * 0.11 / Math.sqrt(s / 3); // relief steepness, independent of resolution
      const toon = p.style === 'toon', painted = p.style === 'painted', bands = Math.max(2, p.bands | 0);
      for (let j = 0, o = 0; j < gh; j++) {
        const jm = U.mod(j - 1, gh) * gw, jp = U.mod(j + 1, gh) * gw, jr = j * gw;
        const v = j / gh;
        for (let i = 0; i < gw; i++, o++) {
          const im = U.mod(i - 1, gw), ip = U.mod(i + 1, gw), u = i / gw;
          // height slope per short side of the texture (same relief at every resolution)
          const h = Hs[o], dhu = (Hs[jr + ip] - Hs[jr + im]) * 0.5 * (gw / W) * S, dhv = (Hs[jp + i] - Hs[jm + i]) * 0.5 * (gh / H) * S;
          // normal (y down in the image): n = (-dh/du, -dh/dv, 1/bump)
          let nx = -dhu * bumpK, ny = -dhv * bumpK, nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
          const dov = (HO[jp + i] - HO[jm + i]) * 0.5 * (gh / H) * S * bumpK, up = clamp(-dov / Math.hypot(dov, 1) * 2.4), cav = clamp((HB[o] - h) * 6), ridge = clamp((h - HB[o]) * 6);
          // base rock color: three tones by patch / layer value and height, cracks toward the dark tone
          const t = clamp(0.5 + (CT[o] - 0.5) * 2 * p.colorVar);
          let r = t < 0.5 ? lerp(c2[0], c1[0], t * 2) : lerp(c1[0], c2[0], (t - 0.5) * 2 * 0.6);
          let g = t < 0.5 ? lerp(c2[1], c1[1], t * 2) : lerp(c1[1], c2[1], (t - 0.5) * 2 * 0.6);
          let b = t < 0.5 ? lerp(c2[2], c1[2], t * 2) : lerp(c1[2], c2[2], (t - 0.5) * 2 * 0.6);
          const dark = clamp((1 - h) * (1 - h) * 0.45 + CR[o] * 0.75 + cav * 0.25);
          r = lerp(r, c3[0], dark); g = lerp(g, c3[1], dark); b = lerp(b, c3[2], dark);
          if (p.speckle > 0) {
            const q = U.hash(i * 7 + 3, j * 13 + 1, seed + 41), f = q > 0.93 ? 1 + p.speckle * 0.45 : q < 0.1 ? 1 - p.speckle * 0.5 : 1;
            r *= f; g *= f; b *= f;
          }
          // overlays
          let hOut = h;
          if (p.dirt > 0) { const k = clamp((cav * 1.4 + (1 - h) * 0.4) * p.dirt) * 0.75; r = lerp(r, dc[0], k); g = lerp(g, dc[1], k); b = lerp(b, dc[2], k); }
          if (p.lichen > 0) {
            const n = fLich(u, v), k = smoothstep(0.62 - p.lichen * 0.18, 0.7 - p.lichen * 0.18, n) * (1 - cav) * (0.4 + 0.6 * nz) * 0.85;
            r = lerp(r, lc[0], k); g = lerp(g, lc[1], k); b = lerp(b, lc[2], k);
          }
          if (p.moss > 0) {
            const n = fMoss(u, v);
            const k = smoothstep(0.55, 0.75, up * 0.55 + cav * 0.9 + (n - 0.5) * 0.8 + p.moss * 0.75 - 0.25) * p.moss ** 0.5;
            const mn2 = 0.88 + CT[o] * 0.24; // moss tone follows the rock patches
            r = lerp(r, mc[0] * mn2, k); g = lerp(g, mc[1] * mn2, k); b = lerp(b, mc[2] * mn2, k);
            hOut += k * 0.03;
          }
          let snowK = 0;
          if (p.snow > 0) {
            const n = fSnow(u, v);
            snowK = smoothstep(0.46, 0.66, up * 0.9 + (h - 0.5) * 0.35 + (n - 0.5) * 0.45 + p.snow * 0.75 - 0.35 - cav * 0.6);
            r = lerp(r, sc[0], snowK); g = lerp(g, sc[1], snowK); b = lerp(b, sc[2], snowK);
            hOut += snowK * 0.06;
          }
          let vk = 0;
          if (p.veins > 0) { vk = VN[o]; r = lerp(r, vc[0], vk); g = lerp(g, vc[1], vk); b = lerp(b, vc[2], vk); }
          Hout[o] = hOut;
          if (!albedo && !heightOut) {
            // lighting: lambert + ambient, cavity occlusion, edge highlights; toon bands / painted softening
            let lam = Math.max(0, (nx * Lx + ny * Ly + nz * Lz) / Ln);
            if (snowK > 0) lam = lerp(lam, 0.55 + lam * 0.5, snowK * 0.5);
            let lit = 0.35 + 0.9 * lam;
            if (toon) lit = 0.5 + (Math.min(bands - 1, Math.floor(lam * bands * 0.999 + 0.25)) / (bands - 1)) * 0.75;
            if (painted) lit = 0.5 + 0.65 * smoothstep(0, 1, lam);
            let shade = lerp(1, lit, p.lightAmt);
            shade *= 1 - p.cavity * clamp(cav * 1.6 + CR[o] * 0.35) * 0.6;
            shade += p.edges * ridge * (painted ? 0.55 : 0.35) * (0.5 + lam);
            if (toon && CR[o] > 0.55) shade *= 0.35; // inked cracks
            r *= shade; g *= shade; b *= shade;
            if (VG) { const gl = (vk * 1.0 + VG[o] * 1.6) * p.veinGlow; r = lerp(r, vc[0] * 1.25, clamp(gl)); g = lerp(g, vc[1] * 1.25, clamp(gl)); b = lerp(b, vc[2] * 1.25, clamp(gl)); }
          }
          R[o] = r; G[o] = g; B[o] = b;
        }
      }

      /* ---------- per pixel: bilinear upsample (wrapping) + fine grain ---------- */
      const img = ctx.createImageData(W, H), d = img.data, grain = toon ? 0 : painted ? 0.02 : 0.05 * (0.4 + p.detail);
      const sxk = gw / W, syk = gh / H;
      for (let y = 0, k = 0; y < H; y++) {
        const fy = (y + 0.5) * syk - 0.5, j0 = Math.floor(fy), ty = fy - j0, ja = U.mod(j0, gh) * gw, jb = U.mod(j0 + 1, gh) * gw;
        for (let x = 0; x < W; x++, k += 4) {
          const fx = (x + 0.5) * sxk - 0.5, i0 = Math.floor(fx), tx = fx - i0, ia = U.mod(i0, gw), ib = U.mod(i0 + 1, gw);
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
          const s00 = ja + ia, s10 = ja + ib, s01 = jb + ia, s11 = jb + ib;
          if (heightOut) {
            const hv = (Hout[s00] * w00 + Hout[s10] * w10 + Hout[s01] * w01 + Hout[s11] * w11) * 255;
            d[k] = d[k + 1] = d[k + 2] = hv; d[k + 3] = 255;
            continue;
          }
          const gn = grain ? 1 + (U.hash(x % W, y % H, seed + 77) - 0.5) * grain * 2 : 1;
          d[k] = (R[s00] * w00 + R[s10] * w10 + R[s01] * w01 + R[s11] * w11) * gn;
          d[k + 1] = (G[s00] * w00 + G[s10] * w10 + G[s01] * w01 + G[s11] * w11) * gn;
          d[k + 2] = (B[s00] * w00 + B[s10] * w10 + B[s01] * w01 + B[s11] * w11) * gn;
          d[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
