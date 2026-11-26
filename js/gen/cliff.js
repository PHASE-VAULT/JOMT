/* Cliff: tileable cliff faces built from large-scale cliff structure rather than rock texture.
     slabs    – the face is split into tall slabs / pillars by long vertical fissures that wander a little and
                open and close along their length; every slab steps forward or back and faces a slightly
                different way (flat, rounded or prism-shaped), so neighbouring slabs catch the light differently,
     ledges   – horizontal bedding: each layer has a lit, upward-facing top and a face that recedes below it
                (overhang), offset from slab to slab by faulting,
     facets   – large flat fracture planes with crisp edges (chiselled faces, no dark crack lines),
     relief   – vertical arêtes and gullies, fine vertical scoring, a little roughness,
     light    – directional light with cast shadows marched over the height field (ledges and protruding
                slabs throw shadows down the face) plus cavity occlusion; or ambient,
     weather  – dark water / varnish streaks running down from the ledges, light worn edges, vegetation,
                snow and dirt collecting on the ledge tops, lichen, flint nodules along chalk layers.
   Everything is evaluated on a periodic grid (tiles) and upsampled with fine grain. Output: lit color, flat
   albedo (no baked light) or the height map (also used by the normal map mode). */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const RAD = Math.PI / 180;
  const wr = (i, n) => { i %= n; return i < 0 ? i + n : i; };

  /* periodic cellular noise with a random tilted plane per cell (flat fracture facets) */
  const CELL = { f1: 0, f2: 0, id: 0, face: 0 };
  function cell(x, y, px, py, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 1e9, f2 = 1e9, best = 0, dx1 = 0, dy1 = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, wx = wr(cx, px), wy = wr(cy, py);
      const dx = cx + U.hash(wx, wy, s) - x, dy = cy + U.hash(wx, wy, s + 7919) - y, d = dx * dx + dy * dy;
      if (d < f1) { f2 = f1; f1 = d; best = wx * 73856093 ^ wy * 19349663; dx1 = dx; dy1 = dy; } else if (d < f2) f2 = d;
    }
    const id = U.hash(best, 3, s + 104729), ax = U.hash(best, 5, s + 31) * 2 - 1, ay = U.hash(best, 9, s + 37) * 2 - 1;
    CELL.f1 = Math.sqrt(f1); CELL.f2 = Math.sqrt(f2); CELL.id = id;
    CELL.face = (id - 0.5) * 0.6 - (dx1 * ax + dy1 * ay) * 1.1;
    return CELL;
  }

  // wrap-around box blur on the grid (two passes ≈ tent)
  function blur(src, w, h, r) {
    if (r < 1) return Float32Array.from(src);
    const a = Float32Array.from(src), t = new Float32Array(src.length), inv = 1 / (2 * r + 1);
    for (let n = 0; n < 2; n++) {
      for (let y = 0; y < h; y++) {
        const o = y * w; let s = 0;
        for (let k = -r; k <= r; k++) s += a[o + wr(k, w)];
        for (let x = 0; x < w; x++) { t[o + x] = s * inv; s += a[o + wr(x + r + 1, w)] - a[o + wr(x - r, w)]; }
      }
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += t[wr(k, h) * w + x];
        for (let y = 0; y < h; y++) { a[y * w + x] = s * inv; s += t[wr(y + r + 1, h) * w + x] - t[wr(y - r, h) * w + x]; }
      }
    }
    return a;
  }

  // cliff types: colors + structure (the type select applies them, then everything stays editable)
  const C = (c1, c2, c3) => ({ c1, c2, c3 });
  const TYPES = {
    granite: Object.assign(C('#aaa59e', '#86817a', '#3e3b37'), { structure: 'faces', diag: 0.55, diagCount: 2, slabs: 4, blocks: 3, slabVar: 0.7, depthVar: 0.7, tiltVar: 0.8, slabShape: 'flat', fissure: 0.55, fissureCont: 0.65, meander: 0.35, strata: 0.15, strataCount: 4, strataAngle: 0.15, strataWarp: 0.5, overhang: 0.4, fault: 0.4, facets: 0.15, facetSize: 4, ridges: 0.3, striation: 0.15, rough: 0.6, banding: 0.1, colorVar: 0.45, streaks: 0.55, streakColor: '#2c2824', nodules: 0 }),
    sandstone: Object.assign(C('#d39a6c', '#b0704a', '#5a2c18'), { structure: 'faces', diag: 0.15, diagCount: 2, slabs: 3, blocks: 0, slabVar: 0.5, depthVar: 0.4, tiltVar: 0.35, slabShape: 'rounded', fissure: 0.4, fissureCont: 0.5, meander: 0.5, strata: 0.85, strataCount: 12, strataAngle: 0, strataWarp: 0.35, overhang: 0.75, fault: 0.1, facets: 0.1, facetSize: 3, ridges: 0.3, striation: 0.24, rough: 0.4, banding: 0.8, colorVar: 0.3, streaks: 0.75, streakColor: '#3a1e14', nodules: 0 }),
    limestone: Object.assign(C('#c8c3b6', '#a29c8e', '#4d4840'), { structure: 'faces', diag: 0.35, diagCount: 2, slabs: 4, blocks: 2, slabVar: 0.6, depthVar: 0.6, tiltVar: 0.5, slabShape: 'flat', fissure: 0.5, fissureCont: 0.6, meander: 0.4, strata: 0.6, strataCount: 7, strataAngle: 0.05, strataWarp: 0.4, overhang: 0.6, fault: 0.25, facets: 0.15, facetSize: 4, ridges: 0.4, striation: 0.21, rough: 0.55, banding: 0.3, colorVar: 0.35, streaks: 0.85, streakColor: '#35302a', nodules: 0 }),
    dolomite: Object.assign(C('#c9c2b4', '#9d968a', '#45403a'), { structure: 'faces', diag: 0.45, diagCount: 2, slabs: 3, blocks: 3, slabVar: 0.8, depthVar: 1, tiltVar: 0.7, slabShape: 'prism', fissure: 0.75, fissureCont: 0.9, meander: 0.3, strata: 0.35, strataCount: 6, strataAngle: 0.1, strataWarp: 0.5, overhang: 0.5, fault: 0.5, facets: 0.2, facetSize: 5, ridges: 0.55, striation: 0.24, rough: 0.6, banding: 0.2, colorVar: 0.4, streaks: 0.6, streakColor: '#3a342c', nodules: 0 }),
    basalt: Object.assign(C('#5c5c60', '#434347', '#18181b'), { structure: 'columns', diag: 0, slabs: 13, blocks: 4, slabVar: 0.3, depthVar: 0.55, tiltVar: 0.6, slabShape: 'prism', fissure: 0.35, fissureCont: 1, meander: 0.05, strata: 0.35, strataCount: 5, strataAngle: 0, strataWarp: 0.15, overhang: 0.35, fault: 1, facets: 0, facetSize: 4, ridges: 0, striation: 0.09, rough: 0.3, banding: 0.05, colorVar: 0.35, streaks: 0.3, streakColor: '#141414', nodules: 0 }),
    chalk: Object.assign(C('#f0ede5', '#d4cfc2', '#8a8377'), { structure: 'faces', diag: 0.25, diagCount: 2, slabs: 3, blocks: 1, slabVar: 0.6, depthVar: 0.4, tiltVar: 0.45, slabShape: 'rounded', fissure: 0.35, fissureCont: 0.45, meander: 0.45, strata: 0.4, strataCount: 8, strataAngle: 0.05, strataWarp: 0.3, overhang: 0.35, fault: 0.1, facets: 0.1, facetSize: 3, ridges: 0.3, striation: 0.21, rough: 0.35, banding: 0.15, colorVar: 0.2, streaks: 0.35, streakColor: '#7a7466', nodules: 0.6 }),
    slate: Object.assign(C('#646a72', '#4a5058', '#1e2126'), { structure: 'faces', diag: 0.6, diagCount: 3, slabs: 5, blocks: 3, slabVar: 0.5, depthVar: 0.5, tiltVar: 0.6, slabShape: 'flat', fissure: 0.45, fissureCont: 0.7, meander: 0.2, strata: 0.7, strataCount: 26, strataAngle: 0.5, strataWarp: 0.2, overhang: 0.3, fault: 0.3, facets: 0.2, facetSize: 5, ridges: 0.2, striation: 0.09, rough: 0.5, banding: 0.25, colorVar: 0.3, streaks: 0.3, streakColor: '#16181b', nodules: 0 }),
    ice: Object.assign(C('#d6ecf7', '#93c3dc', '#2f6a8c'), { structure: 'faces', diag: 0.4, diagCount: 2, slabs: 4, blocks: 2, slabVar: 0.6, depthVar: 0.6, tiltVar: 0.6, slabShape: 'rounded', fissure: 0.45, fissureCont: 0.6, meander: 0.4, strata: 0.45, strataCount: 10, strataAngle: 0.05, strataWarp: 0.5, overhang: 0.4, fault: 0.2, facets: 0.2, facetSize: 4, ridges: 0.5, striation: 0.33, rough: 0.25, banding: 0.4, colorVar: 0.35, streaks: 0.25, streakColor: '#3f7896', nodules: 0 }),
  };
  const TYPE_OPTS = [['granite', 'Granite face'], ['sandstone', 'Canyon sandstone'], ['limestone', 'Limestone (ledges, streaks)'], ['dolomite', 'Alpine towers (dolomite)'], ['basalt', 'Columnar basalt'], ['chalk', 'Chalk (flint bands)'], ['slate', 'Slate / shale'], ['ice', 'Glacier ice wall'], ['custom', 'Custom']];
  const D = TYPES.granite;

  U.register({
    id: 'cliff',
    name: 'Cliff',
    desc: 'Tileable cliff faces with tall slabs, deep fissures, ledges, overhangs, cast shadows and streaks: granite, canyon sandstone, limestone, alpine towers, basalt columns, chalk, slate and ice',
    uses: [
      'Seamless cliff, canyon, quarry and mountain-side materials for terrain cliffs and rock wall meshes; use the flat albedo with the height-based normal map and the Smoothness mode for a full material set.',
      'Cliff walls, ledges and backgrounds for 2D platformers and hand-painted or toon-styled games.',
    ],
    tags: ['PBR', 'Nature', 'Texturing'],
    tileable: true,
    heightMap: true,
    normalDesc: 'Normal map from the cliff height field (slabs, fissures, ledges, facets)',
    normalDefaults: { strength: 7, smooth: 0.5 },
    icon: U.icon('<path d="M4 21V9l3-2 1-4h5l2 4 3 1 2 4v9"/><path d="M4 12h7l2 2h8M7 7v14M14 4v5M17 14v7" opacity=".55"/>'),
    params: [
      { type: 'section', label: 'Cliff' },
      {
        key: 'type', label: 'Cliff type', type: 'select', default: 'granite', options: TYPE_OPTS,
        apply: (v, p) => { if (TYPES[v]) Object.assign(p, TYPES[v]); },
        tip: 'Picks colors and structure; tweak them afterwards',
      },
      { key: 'seed', label: 'Seed', type: 'seed', default: 8 },

      { type: 'section', label: 'Structure' },
      { key: 'structure', label: 'Structure', type: 'select', default: D.structure, options: [['faces', 'Angular joint faces'], ['slabs', 'Vertical slabs'], ['columns', 'Columns (prisms)']], tip: 'Joint faces: long parallel fractures step the face into angular planes (most cliffs). Slabs: tall sheets split by vertical fissures. Columns: basalt organ pipes' },
      { key: 'slabs', label: 'Joints across', type: 'int', min: 2, max: 24, default: D.slabs, tip: 'Vertical fractures, slabs or columns across the tile' },
      { key: 'diag', label: 'Diagonal joints', type: 'range', min: 0, max: 1, step: 0.01, default: D.diag, show: (p) => p.structure === 'faces', tip: 'A second, slanted fracture set that cuts the faces into angular wedges' },
      { key: 'diagCount', label: 'Diagonal joints across', type: 'int', min: 1, max: 16, default: D.diagCount, show: (p) => p.structure === 'faces' && p.diag > 0 },
      { key: 'slabVar', label: 'Spacing variation', type: 'range', min: 0, max: 1, step: 0.01, default: D.slabVar },
      { key: 'slabShape', label: 'Slab profile', type: 'select', default: D.slabShape, options: [['flat', 'Flat faces'], ['rounded', 'Rounded'], ['prism', 'Prism (two faces)']], show: (p) => p.structure === 'slabs' },
      { key: 'depthVar', label: 'Step forward / back', type: 'range', min: 0, max: 1, step: 0.01, default: D.depthVar, tip: 'How much neighbouring blocks stand out or sit back' },
      { key: 'tiltVar', label: 'Face angles', type: 'range', min: 0, max: 1, step: 0.01, default: D.tiltVar, tip: 'Every block faces a slightly different way, so it catches the light differently' },
      { key: 'fissure', label: 'Fissure width', type: 'range', min: 0, max: 1, step: 0.01, default: D.fissure },
      { key: 'fissureCont', label: 'Fissure continuity', type: 'range', min: 0, max: 1, step: 0.01, default: D.fissureCont, tip: 'Low: fissures open and close along their length, blocks partly merge' },
      { key: 'blocks', label: 'Block breaks', type: 'int', min: 0, max: 16, default: D.blocks, show: (p) => p.structure !== 'faces', tip: 'Horizontal joints that split each slab into stacked blocks stepping in and out' },
      { key: 'meander', label: 'Fissure waviness', type: 'range', min: 0, max: 1, step: 0.01, default: D.meander },

      { type: 'section', label: 'Ledges' },
      { key: 'strata', label: 'Ledges', type: 'range', min: 0, max: 1, step: 0.01, default: D.strata, tip: 'Horizontal bedding: lit ledge tops with receding faces below' },
      { key: 'strataCount', label: 'Layers', type: 'int', min: 1, max: 40, default: D.strataCount, show: (p) => p.strata > 0 },
      { key: 'overhang', label: 'Overhang', type: 'range', min: 0, max: 1, step: 0.01, default: D.overhang, show: (p) => p.strata > 0, tip: 'How far each ledge juts out over the face below it' },
      { key: 'strataAngle', label: 'Layer tilt', type: 'range', min: -1, max: 1, step: 0.05, default: D.strataAngle, show: (p) => p.strata > 0, tip: 'Snaps to angles that still tile' },
      { key: 'strataWarp', label: 'Layer waviness', type: 'range', min: 0, max: 1, step: 0.01, default: D.strataWarp, show: (p) => p.strata > 0 },
      { key: 'fault', label: 'Faulting', type: 'range', min: 0, max: 1, step: 0.01, default: D.fault, show: (p) => p.strata > 0, tip: 'Layers shift up or down from slab to slab' },

      { type: 'section', label: 'Faces' },
      { key: 'facets', label: 'Fracture facets', type: 'range', min: 0, max: 1, step: 0.01, default: D.facets, tip: 'Large flat fracture planes with crisp edges' },
      { key: 'facetSize', label: 'Facets across', type: 'int', min: 1, max: 16, default: D.facetSize, show: (p) => p.facets > 0 },
      { key: 'ridges', label: 'Arêtes & gullies', type: 'range', min: 0, max: 1, step: 0.01, default: D.ridges, tip: 'Vertical ridges and grooves running down the face' },
      { key: 'striation', label: 'Vertical scoring', type: 'range', min: 0, max: 1, step: 0.01, default: D.striation, tip: 'Fine vertical lines from weathering' },
      { key: 'rough', label: 'Roughness', type: 'range', min: 0, max: 1, step: 0.01, default: D.rough },
      { key: 'nodules', label: 'Flint nodules', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.strata > 0, tip: 'Dark nodules strung along the layers (chalk cliffs)' },

      { type: 'section', label: 'Color' },
      { key: 'c1', label: 'Light rock', type: 'color', default: D.c1 },
      { key: 'c2', label: 'Mid rock', type: 'color', default: D.c2 },
      { key: 'c3', label: 'Dark rock / crevices', type: 'color', default: D.c3 },
      { key: 'colorVar', label: 'Slab variation', type: 'range', min: 0, max: 1, step: 0.01, default: D.colorVar, tip: 'Each slab a slightly different shade' },
      { key: 'banding', label: 'Layer color bands', type: 'range', min: 0, max: 1, step: 0.01, default: D.banding, tip: 'Horizontal color bands following the layers (canyon walls)' },
      { key: 'streaks', label: 'Rain streaks', type: 'range', min: 0, max: 1, step: 0.01, default: D.streaks, tip: 'Dark water and desert-varnish streaks running down from the ledges' },
      { key: 'streakColor', label: 'Streak color', type: 'color', default: D.streakColor, show: (p) => p.streaks > 0 },
      { key: 'edgeWear', label: 'Worn edges', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Lighter, weathered slab and ledge edges' },
      { key: 'noduleColor', label: 'Nodule color', type: 'color', default: '#2c2c32', show: (p) => p.nodules > 0 && p.strata > 0 },

      { type: 'section', label: 'Overlays', active: (p) => p.moss > 0 || p.snow > 0 || p.lichen > 0 || p.dirt > 0 },
      { key: 'moss', label: 'Vegetation / moss', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Grows on the ledges and in the cracks' },
      { key: 'mossColor', label: 'Moss color', type: 'color', default: '#5a7a2a', show: (p) => p.moss > 0 },
      { key: 'snow', label: 'Snow', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Settles on upward-facing ledges' },
      { key: 'snowColor', label: 'Snow color', type: 'color', default: '#eef3f8', show: (p) => p.snow > 0 },
      { key: 'lichen', label: 'Lichen', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'lichenColor', label: 'Lichen color', type: 'color', default: '#c9b860', show: (p) => p.lichen > 0 },
      { key: 'dirt', label: 'Dirt', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Darkens fissures and ledge tops' },
      { key: 'dirtColor', label: 'Dirt color', type: 'color', default: '#3a3026', show: (p) => p.dirt > 0 },

      { type: 'section', label: 'Shading' },
      { key: 'style', label: 'Style', type: 'select', default: 'realistic', options: [['realistic', 'Realistic'], ['painted', 'Hand-painted'], ['toon', 'Toon (bands + outlines)']] },
      { key: 'bands', label: 'Light bands', type: 'int', min: 2, max: 6, default: 3, show: (p) => p.style === 'toon' },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'angled', options: [['angled', 'Angled (light angle)'], ['ambient', 'Ambient (soft, no direction)']] },
      { key: 'light', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -115, show: (p) => p.lightMode !== 'ambient', tip: '-90 = light from the top: shadows under the ledges' },
      { key: 'lightHeight', label: 'Light height', type: 'range', min: 10, max: 80, step: 1, default: 38, show: (p) => p.lightMode !== 'ambient', tip: 'Low light: long shadows and strong relief' },
      { key: 'shadows', label: 'Cast shadows', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, show: (p) => p.lightMode !== 'ambient' },
      { key: 'lightAmt', label: 'Shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85 },
      { key: 'bump', label: 'Relief depth', type: 'range', min: 0.1, max: 3, step: 0.05, default: 1 },
      { key: 'cavity', label: 'Cavity darkening', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65 },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'lit', options: [['lit', 'Color (lit)'], ['albedo', 'Albedo (no baked light)'], ['height', 'Height map']], tip: 'Albedo leaves the lighting to the engine: pair it with the normal map and Smoothness modes' },
    ],
    presets: [
      { name: 'Granite cliff face', group: 'Realistic', values: {} },
      { name: 'Red canyon wall', group: 'Realistic', values: { type: 'sandstone', ...TYPES.sandstone, seed: 33 } },
      { name: 'Desert varnish wall', group: 'Realistic', values: { type: 'sandstone', ...TYPES.sandstone, c1: '#d8ab80', c2: '#b5835a', c3: '#6a4128', streaks: 1, streakColor: '#24150e', banding: 0.4, seed: 7 } },
      { name: 'Limestone cliff', group: 'Realistic', values: { type: 'limestone', ...TYPES.limestone, seed: 9 } },
      { name: 'Alpine towers', group: 'Realistic', values: { type: 'dolomite', ...TYPES.dolomite, seed: 14 } },
      { name: 'Basalt columns', group: 'Realistic', values: { type: 'basalt', ...TYPES.basalt, seed: 5 } },
      { name: 'White chalk cliff', group: 'Realistic', values: { type: 'chalk', ...TYPES.chalk, dirt: 0.1, seed: 12 } },
      { name: 'Slate quarry wall', group: 'Realistic', values: { type: 'slate', ...TYPES.slate, dirt: 0.15, seed: 21 } },
      { name: 'Mossy cliff', group: 'Realistic', values: { type: 'limestone', ...TYPES.limestone, c1: '#a8a598', c2: '#84817a', moss: 0.6, mossColor: '#4f7426', streaks: 0.6, dirt: 0.35, seed: 25 } },
      { name: 'Coastal cliff (wet)', group: 'Realistic', values: { c1: '#6e6a64', c2: '#4e4b46', c3: '#1e1c19', streaks: 0.8, streakColor: '#141210', lichen: 0.35, lichenColor: '#d8b040', edgeWear: 0.2, seed: 44 } },
      { name: 'Snowy mountain face', group: 'Realistic', values: { type: 'dolomite', ...TYPES.dolomite, c1: '#8f8d8a', c2: '#6e6c69', c3: '#2e2d2b', snow: 0.6, dirt: 0.1, seed: 41 } },
      { name: 'Glacier ice wall', group: 'Realistic', values: { type: 'ice', ...TYPES.ice, dirt: 0.05, edgeWear: 0.6, seed: 18 } },
      { name: 'Hand-painted cliff', group: 'Stylized', values: { type: 'sandstone', ...TYPES.sandstone, style: 'painted', c1: '#d8b48a', c2: '#a8805e', c3: '#5a3c2a', rough: 0.05, striation: 0.09, streaks: 0.3, moss: 0.3, mossColor: '#7aa03a', seed: 4 } },
      { name: 'Toon desert mesa', group: 'Stylized', values: { type: 'sandstone', ...TYPES.sandstone, style: 'toon', bands: 3, rough: 0, striation: 0, streaks: 0, c1: '#f0b070', c2: '#d07a40', c3: '#8a3a20', strataCount: 6, seed: 2 } },
      { name: 'Toon basalt columns', group: 'Stylized', values: { type: 'basalt', ...TYPES.basalt, style: 'toon', bands: 3, rough: 0, striation: 0, streaks: 0, c1: '#8a8aa0', c2: '#62627a', c3: '#2a2a3a', slabs: 8, seed: 3 } },
      { name: 'Toon granite cliff', group: 'Stylized', values: { style: 'toon', bands: 3, rough: 0, striation: 0, streaks: 0.2, c1: '#b8b0c8', c2: '#8a82a0', c3: '#3a3450', seed: 19 } },
      { name: 'Dark fantasy cliff', group: 'Fantasy & Sci-fi', values: { type: 'dolomite', ...TYPES.dolomite, c1: '#5a5470', c2: '#3e3a52', c3: '#120f1c', streaks: 0.5, streakColor: '#0a0810', lichen: 0.25, lichenColor: '#6aff9a', seed: 27 } },
      { name: 'Alien cliff', group: 'Fantasy & Sci-fi', values: { type: 'sandstone', ...TYPES.sandstone, c1: '#9ac8b0', c2: '#5a8a7a', c3: '#1a2e30', banding: 0.9, streakColor: '#102020', seed: 31 } },
    ],

    render(ctx, W, H, p, opts) {
      const heightOut = !!(opts && opts.height) || p.output === 'height', albedo = p.output === 'albedo';
      const seed = p.seed | 0, ar = H / W, S = Math.min(W, H);
      const fb = (u, v, fx, fy, oct, s, mode) => U.fractal('perlin', u * fx, v * fy, fx, fy, oct, 0.5, mode || 'fbm', seed + s);
      const py = (f) => Math.max(1, Math.round(f * ar)); // whole periods down the texture

      /* ---------- grid ---------- */
      const gw = Math.min(W, Math.max(192, Math.round(W * 0.7)), 320), gh = Math.max(1, Math.round(gw * ar)), N = gw * gh;
      const field = (q, fn) => {
        const w = Math.max(4, Math.ceil(gw / q)), hh = Math.max(4, Math.ceil(gh / q)), a = new Float32Array(w * hh);
        for (let jj = 0, k = 0; jj < hh; jj++) for (let ii = 0; ii < w; ii++, k++) a[k] = fn(ii / w, jj / hh);
        return (u, v) => {
          const fx = u * w, fy = v * hh, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
          const xa = wr(x0, w), xb = wr(x0 + 1, w), ya = wr(y0, hh) * w, yb = wr(y0 + 1, hh) * w;
          const A = a[ya + xa] + (a[ya + xb] - a[ya + xa]) * tx, B = a[yb + xa] + (a[yb + xb] - a[yb + xa]) * tx;
          return A + (B - A) * ty;
        };
      };
      const nS = Math.max(2, p.slabs | 0), nL = Math.max(1, p.strataCount | 0), kTilt = Math.round(p.strataAngle * nL * 0.5);
      const fMean = field(4, (u, v) => fb(u, v, nS, py(2), 3, 1));
      const fFw = field(4, (u, v) => fb(u, v, nS, py(5), 2, 2));
      const fCont = field(3, (u, v) => fb(u, v, nS * 2, py(3), 3, 3));
      const fStr = field(4, (u, v) => fb(u, v, 3, py(2), 2, 4));
      const fLay = field(4, (u, v) => fb(u, v, 1, py(Math.max(2, nL * 0.5)), 2, 14)); // uneven layer thickness
      const fRag = field(1.5, (u, v) => fb(u, v, nS * 6, py(nS * 3), 3, 15));
      const nB = Math.max(0, p.blocks | 0);
      const faces = p.structure !== 'slabs' && p.structure !== 'columns';
      // angular joint faces: families of long, nearly parallel fractures; across each one the face steps and
      // changes tilt, so the cliff becomes angular, stepped planes
      const gcd = (a, b) => (b ? gcd(b, a % b) : a);
      const nC = Math.max(1, p.diagCount | 0), nCy = Math.max(1, Math.round(nC * ar)), gC = gcd(nC, nCy), dSgn = U.hash(seed, 1, 77) < 0.5 ? 1 : -1;
      const fMu = field(3, (u, v) => fb(u, v, 3, py(3), 3, 16)), fMv = field(3, (u, v) => fb(u, v, 3, py(3), 3, 17));
      const fSpA = field(3, (u, v) => fb(u, v, nS, py(1), 2, 18)), fSpC = field(3, (u, v) => fb(u, v, nC, py(1), 2, 19));
      const fMA = field(4, (u, v) => fb(u, v, 2, py(3), 2, 20)), fMC = field(4, (u, v) => fb(u, v, 2, py(2), 2, 21));
      const fBig = field(4, (u, v) => fb(u, v, 2, py(2), 3, 23));
      const fWu = field(4, (u, v) => fb(u, v, 4, py(4), 2, 5)), fWv = field(4, (u, v) => fb(u, v, 4, py(4), 2, 6));
      const rx = Math.max(2, Math.round(nS * 1.5));
      const fRid = p.ridges > 0 ? field(2, (u, v) => fb(u, v, rx, py(1), 3, 7, 'ridged')) : null;
      const fStri = p.striation > 0 ? field(1, (u, v) => fb(u, v, 90, py(3), 3, 8)) : null;
      const fRough = p.rough > 0 ? field(1, (u, v) => fb(u, v, 18, py(18), 4, 9, 'ridged') * 0.6 + fb(u, v, 40, py(40), 3, 24) * 0.4) : null;
      const chipN = 14, chipY = Math.max(1, Math.round(14 * ar));
      const fStreakMask = p.streaks > 0 ? field(4, (u, v) => fb(u, v, 3, py(2), 2, 25)) : null;
      const fStreak = p.streaks > 0 ? field(1.5, (u, v) => fb(u, v, 46, py(1.5), 4, 10)) : null;
      const fMoss = p.moss > 0 ? field(2, (u, v) => fb(u, v, 8, py(8), 4, 11)) : null;
      const fSnow = p.snow > 0 ? field(2, (u, v) => fb(u, v, 7, py(7), 3, 12)) : null;
      const fLich = p.lichen > 0 ? field(1.5, (u, v) => fb(u, v, 16, py(16), 3, 13)) : null;
      const fx = Math.max(1, p.facetSize | 0), fy = Math.max(1, Math.round(fx * ar * 0.55));
      const [nox, noy] = [Math.max(2, Math.round(nL * 1.6)), py(nL * 1.6)];

      const Hf = new Float32Array(N), SL = new Float32Array(N), LT = new Float32Array(N), FI = new Float32Array(N), LF = new Float32Array(N), NO = new Float32Array(N);
      for (let j = 0, o = 0; j < gh; j++) {
        const v = j / gh;
        for (let i = 0; i < gw; i++, o++) {
          const u = i / gw;
          let h, cid, fiss, bevel, cont, joint = 0;
          if (faces) {
            /* angular joint faces */
            const wu = u + (fMu(u, v) - 0.5) * p.meander * 0.35 / nS, wv = v + (fMv(u, v) - 0.5) * p.meander * 0.35 / nS;
            const fwU = p.fissure * 0.02 + 0.0015;
            // near-vertical joint set: irregularly spaced bands, each a tilted plane at its own depth
            const sA = wu * nS + (fSpA(u, v) - 0.5) * 1.1 * p.slabVar, biA = Math.floor(sA), fA = sA - biA, kA = wr(biA, nS);
            const mA = smoothstep(0.22, 0.55, fMA(u, v) + (p.fissureCont - 0.5) * 0.7);
            const tA = (U.hash(kA, 41, seed + 3) - 0.5) * 2;
            h = mA * ((U.hash(kA, 40, seed + 3) - 0.5) * p.depthVar * 0.9 + tA * p.tiltVar * 1.6 * (fA - 0.5));
            let crA = (1 - smoothstep(fwU * 0.2, fwU, Math.min(fA, 1 - fA) / nS)) * mA;
            cid = kA * 31;
            // diagonal (conjugate) joint set
            let crC = 0;
            if (p.diag > 0) {
              const sC = wu * nC + dSgn * wv * nCy + (fSpC(u, v) - 0.5) * 1.1, biC = Math.floor(sC), fC = sC - biC, kC = wr(biC, gC * 997);
              const mC = smoothstep(0.3, 0.62, fMC(u, v) + (p.fissureCont - 0.5) * 0.6) * p.diag;
              const kk = wr(biC, Math.max(1, gC));
              const tC = (U.hash(kk, 43, seed + 3) - 0.5) * 2;
              h += mC * ((U.hash(kk, 42, seed + 3) - 0.5) * p.depthVar * 0.7 + tC * p.tiltVar * 1.3 * (fC - 0.5));
              crC = (1 - smoothstep(fwU * 0.15, fwU * 0.8, Math.min(fC, 1 - fC) / Math.hypot(nC, nCy))) * mC;
              cid += kk * 7 + (kC & 0);
            }
            h += (fBig(u, v) - 0.5) * 0.3;
            cont = smoothstep(0.4, 0.58, fCont(u, v) + (p.fissureCont - 0.5) * 0.9);
            fiss = Math.max(crA * (0.4 + 0.6 * cont), crC * 0.6) * 0.7;
            bevel = 0;
            h -= fiss * 0.25;
          } else {
            const X = u * nS + (fMean(u, v) - 0.5) * p.meander * 0.9, i0 = Math.floor(X);
            const bnd = (k) => k + (U.hash(wr(k, nS), 1, seed + 3) - 0.5) * p.slabVar * 0.75;
            let ci = i0; if (X < bnd(i0)) ci = i0 - 1; else if (X >= bnd(i0 + 1)) ci = i0 + 1;
            const b0 = bnd(ci), b1 = bnd(ci + 1), wd = b1 - b0, t = (X - b0) / wd; cid = wr(ci, nS);
            const e = Math.min(t, 1 - t) * wd + (fRag(u, v) - 0.5) * (p.fissure * 0.06 + 0.012), edgeId = t < 0.5 ? cid : wr(ci + 1, nS);
            cont = smoothstep(0.4, 0.58, fCont(u, v) + (U.hash(edgeId, 5, seed + 3) - 0.5) * 0.35 + (p.fissureCont - 0.5) * 0.9);
            const fw = p.fissure * 0.1 * (0.45 + fFw(u, v));
            fiss = (1 - smoothstep(fw * 0.2, fw + 0.004, e)) * cont;
            bevel = 1 - smoothstep(0, fw * 2.2 + 0.035, e);
            const dI = U.hash(cid, 7, seed + 3) - 0.5, tI = U.hash(cid, 8, seed + 3) - 0.5;
            h = dI * p.depthVar * 0.55 + (t - 0.5) * tI * p.tiltVar * 0.9 * wd;
            if (p.slabShape === 'rounded') h += Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)) * 0.18 * wd;
            else if (p.slabShape === 'prism' || p.structure === 'columns') { const m = 0.3 + U.hash(cid, 2, seed + 3) * 0.4; h += (1 - Math.abs(t - m) / Math.max(m, 1 - m)) * 0.22 * wd; }
            h -= bevel * 0.14 * (0.35 + 0.65 * cont) + fiss * 0.55;
              if (nB > 0) {
              // horizontal block joints: each slab is a stack of blocks that step in and out
              const bp = v * nB + U.hash(cid, 30, seed + 3) * 0.9 + (fRag(u, v) - 0.5) * 0.12, bi = Math.floor(bp), bf = bp - bi, bid = wr(bi, nB);
              const bo = (U.hash(cid * 31 + bid, 31, seed + 3) - 0.5) * p.depthVar * 0.45;
              const jv = U.hash(cid * 31 + bid, 32, seed + 3) < 0.75 ? 1 : 0.25;
              joint = (1 - smoothstep(0.004, 0.03 + p.fissure * 0.02, Math.min(bf, 1 - bf))) * jv;
              h += bo + (1 - bf) * 0.05 - joint * 0.3;
            }
          }
          /* ledges */
          let lf = 1, lt = 0.5;
          if (p.strata > 0) {
            const ph = v * nL + u * kTilt + (fStr(u, v) - 0.5) * p.strataWarp * 2.5 + (fLay(u, v) - 0.5) * 1.6 + (U.hash(cid, 9, seed + 3) - 0.5) * p.fault * 1.6;
            const li = Math.floor(ph), f = ph - li, lid = wr(li, nL), hd = U.hash(lid, 11, seed + 9);
            const up = smoothstep(0, 0.16, f), prof = up * Math.pow(1 - f, 0.45 + (1 - p.overhang) * 1.6);
            h += p.strata * (Math.pow(hd, 1.6) * prof * 0.7 - 0.25);
            lf = f; lt = U.hash(lid, 12, seed + 9);
            if (p.nodules > 0) {
              const wn = U.worley(u * nox, v * noy, nox, noy, seed + 95), band = 1 - smoothstep(0.1, 0.25, Math.abs(f - 0.88) * 2);
              const nd = wn.id < p.nodules * 0.8 ? (1 - smoothstep(0.16, 0.3, wn.f1)) * band : 0;
              NO[o] = nd; h += nd * 0.03;
            }
          }
          /* faces */
          if (p.facets > 0) {
            const wu = u + (fWu(u, v) - 0.5) * 0.12 / fx, wv = v + (fWv(u, v) - 0.5) * 0.12 / fy;
            const c = cell(wu * fx, wv * fy, fx, fy, seed + 13);
            h += p.facets * c.face * 0.34 * (1 - fiss);
          }
          if (fRid) h += p.ridges * (fRid(u, v) - 0.5) * 0.4;
          if (fStri) h += p.striation * (fStri(u, v) - 0.5) * 0.04;
          if (fRough) {
            // rock material: chipped, granular stone surface (ridged roughness + small tilted chips)
            const ch = cell(u * chipN, v * chipY, chipN, chipY, seed + 26);
            h += p.rough * ((fRough(u, v) - 0.5) * 0.22 + ch.face * 0.05);
          }
          Hf[o] = h; SL[o] = U.hash(cid, 20, seed + 3); LT[o] = lt; FI[o] = Math.max(fiss, bevel * 0.35 * cont, joint * 0.8); LF[o] = lf;
        }
      }
      let mn = Infinity, mx = -Infinity;
      for (let o = 0; o < N; o++) { if (Hf[o] < mn) mn = Hf[o]; if (Hf[o] > mx) mx = Hf[o]; }
      const span = Math.max(1e-6, mx - mn);
      for (let o = 0; o < N; o++) Hf[o] = (Hf[o] - mn) / span;
      let Hs = Hf;
      if (p.style === 'painted') { const sb = blur(Hf, gw, gh, Math.max(1, Math.round(gw / 200))); Hs = new Float32Array(N); for (let o = 0; o < N; o++) Hs[o] = lerp(Hf[o], sb[o], 0.6); }
      const HB = blur(Hs, gw, gh, Math.max(1, Math.round(gw / 40)));
      const HO = blur(Hs, gw, gh, Math.max(1, Math.round(gw / 140)));

      /* ---------- light + cast shadows ---------- */
      const ambient = p.lightMode === 'ambient', la = p.light * RAD, el = clamp(p.lightHeight, 5, 85) * RAD;
      const Lx = Math.cos(la) * Math.cos(el), Ly = Math.sin(la) * Math.cos(el), Lz = Math.sin(el);
      const relief = 0.28 * p.bump;                     // height span as a fraction of the short side
      const nodeU = (W / gw) / S, nodeV = (H / gh) / S;   // node size in short-side units
      const SH = new Float32Array(N);
      if (!ambient && p.shadows > 0 && !heightOut && !albedo) {
        const dx = Math.cos(la), dy = Math.sin(la), m = Math.max(Math.abs(dx), Math.abs(dy)), sx = dx / m, sy = dy / m;
        const stepLen = Math.hypot(sx * nodeU, sy * nodeV), rise = (Math.tan(el) * stepLen) / relief, maxSteps = Math.min(140, Math.ceil(1 / rise) + 2);
        for (let j = 0, o = 0; j < gh; j++) for (let i = 0; i < gw; i++, o++) {
          const h0 = Hs[o];
          let occ = 0, x = i, y = j;
          for (let k = 1; k <= maxSteps; k++) {
            x += sx; y += sy;
            const hr = h0 + rise * k;
            if (hr > 1) break;
            const d = Hs[wr(Math.round(y), gh) * gw + wr(Math.round(x), gw)] - hr;
            if (d > 0) { occ = Math.max(occ, clamp(d / 0.04)); if (occ >= 1) break; }
          }
          SH[o] = occ;
        }
        // soften the shadow edges a little
        const sb = blur(SH, gw, gh, Math.max(1, Math.round(gw / 300)));
        SH.set(sb);
      }

      /* ---------- color per node ---------- */
      const R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
      const c1 = U.hex(p.c1), c2 = U.hex(p.c2), c3 = U.hex(p.c3), stc = U.hex(p.streakColor), mc = U.hex(p.mossColor), sc = U.hex(p.snowColor), lc = U.hex(p.lichenColor), dc = U.hex(p.dirtColor), nc = U.hex(p.noduleColor);
      const toon = p.style === 'toon', painted = p.style === 'painted', bands = Math.max(2, p.bands | 0);
      for (let j = 0, o = 0; j < gh; j++) {
        const jm = wr(j - 1, gh) * gw, jp = wr(j + 1, gh) * gw, jr = j * gw, v = j / gh;
        for (let i = 0; i < gw; i++, o++) {
          const im = wr(i - 1, gw), ip = wr(i + 1, gw), u = i / gw, h = Hs[o];
          const su = (Hs[jr + ip] - Hs[jr + im]) * 0.5 * relief / nodeU, sv = (Hs[jp + i] - Hs[jm + i]) * 0.5 * relief / nodeV;
          let nx = -su, ny = -sv, nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
          const svO = (HO[jp + i] - HO[jm + i]) * 0.5 * relief / nodeV, upF = clamp(svO * 3); // + where the surface faces up (ledge tops)
          const cav = clamp((HB[o] - h) * 5), ridge = clamp((h - HB[o]) * 5);
          // base: three tones from slab shade, layer bands and height
          const t = clamp(0.55 + (SL[o] - 0.5) * p.colorVar * 0.9 + (LT[o] - 0.5) * p.banding * 1.1 + (h - 0.5) * 0.35);
          let r, g, b;
          if (t > 0.5) { const k = (t - 0.5) * 2; r = lerp(c2[0], c1[0], k); g = lerp(c2[1], c1[1], k); b = lerp(c2[2], c1[2], k); }
          else { const k = t * 2; r = lerp(c3[0], c2[0], 0.35 + k * 0.65); g = lerp(c3[1], c2[1], 0.35 + k * 0.65); b = lerp(c3[2], c2[2], 0.35 + k * 0.65); }
          const dark = clamp(FI[o] * 0.85 + cav * 0.35);
          r = lerp(r, c3[0], dark); g = lerp(g, c3[1], dark); b = lerp(b, c3[2], dark);
          if (p.edgeWear > 0) { const k = clamp(ridge * 1.5) * p.edgeWear * 0.45; r = lerp(r, c1[0] * 1.08, k); g = lerp(g, c1[1] * 1.08, k); b = lerp(b, c1[2] * 1.08, k); }
          if (NO[o] > 0) { r = lerp(r, nc[0], NO[o]); g = lerp(g, nc[1], NO[o]); b = lerp(b, nc[2], NO[o]); }
          if (fStreak) {
            // streaks start under the ledges and run down the steep faces
            const n = fStreak(u, v), below = p.strata > 0 ? 0.45 + 0.55 * smoothstep(0, 0.5, LF[o]) : 1;
            const k = smoothstep(0.56 - p.streaks * 0.16, 0.74 - p.streaks * 0.1, n) * p.streaks * below * (1 - upF) * 0.8 * smoothstep(0.3, 0.6, fStreakMask(u, v) + p.streaks * 0.2);
            r = lerp(r, stc[0], k); g = lerp(g, stc[1], k); b = lerp(b, stc[2], k);
          }
          if (p.dirt > 0) { const k = clamp((cav * 1.2 + FI[o] * 0.6 + upF * 0.4) * p.dirt) * 0.7; r = lerp(r, dc[0], k); g = lerp(g, dc[1], k); b = lerp(b, dc[2], k); }
          if (fLich) { const k = smoothstep(0.62 - p.lichen * 0.2, 0.68 - p.lichen * 0.2, fLich(u, v)) * (1 - FI[o]) * 0.85; r = lerp(r, lc[0], k); g = lerp(g, lc[1], k); b = lerp(b, lc[2], k); }
          if (fMoss) {
            const k = smoothstep(0.5, 0.68, upF * 0.8 + FI[o] * 0.45 + cav * 0.5 + (fMoss(u, v) - 0.5) * 0.7 + p.moss * 0.6 - 0.3) * Math.sqrt(p.moss);
            const f = 0.85 + SL[o] * 0.3; r = lerp(r, mc[0] * f, k); g = lerp(g, mc[1] * f, k); b = lerp(b, mc[2] * f, k);
          }
          let snowK = 0;
          if (fSnow) {
            snowK = smoothstep(0.45, 0.62, upF * 1.1 + (fSnow(u, v) - 0.5) * 0.5 + p.snow * 0.75 - 0.4 - FI[o] * 0.3);
            r = lerp(r, sc[0], snowK); g = lerp(g, sc[1], snowK); b = lerp(b, sc[2], snowK);
          }
          if (!albedo && !heightOut) {
            let lam;
            if (ambient) lam = Math.max(0.35, nz * nz * 1.05 - Math.max(0, ny) * 0.25); // overhang undersides a little darker
            else lam = Math.max(0, (nx * Lx + ny * Ly + nz * Lz)) / Math.max(0.3, Lz);
            lam *= 1 - SH[o] * p.shadows * 0.8;
            if (snowK > 0) lam = lerp(lam, 0.6 + lam * 0.45, snowK * 0.5);
            let lit = 0.3 + 0.75 * lam;
            if (toon) lit = 0.45 + (Math.min(bands - 1, Math.floor(clamp(lam * 0.9, 0, 0.999) * bands)) / (bands - 1)) * 0.8;
            else if (painted) lit = 0.45 + 0.7 * smoothstep(0, 1.1, lam);
            let shade = lerp(1, lit, p.lightAmt);
            shade *= 1 - p.cavity * clamp(cav * 1.4 + FI[o] * 0.6) * 0.65;
            if (toon && FI[o] > 0.55) shade *= 0.35; // inked fissures
            r *= shade; g *= shade; b *= shade;
          }
          R[o] = r; G[o] = g; B[o] = b;
        }
      }

      /* ---------- per pixel: bilinear upsample (wrapping) + fine grain ---------- */
      const img = ctx.createImageData(W, H), d = img.data, grain = toon ? 0 : painted ? 0.02 : 0.045;
      const sxk = gw / W, syk = gh / H;
      for (let y = 0, k = 0; y < H; y++) {
        const fy0 = (y + 0.5) * syk - 0.5, j0 = Math.floor(fy0), ty = fy0 - j0, ja = wr(j0, gh) * gw, jb = wr(j0 + 1, gh) * gw;
        for (let x = 0; x < W; x++, k += 4) {
          const fx0 = (x + 0.5) * sxk - 0.5, i0 = Math.floor(fx0), tx = fx0 - i0, ia = wr(i0, gw), ib = wr(i0 + 1, gw);
          const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
          const s00 = ja + ia, s10 = ja + ib, s01 = jb + ia, s11 = jb + ib;
          if (heightOut) { const hv = (Hs[s00] * w00 + Hs[s10] * w10 + Hs[s01] * w01 + Hs[s11] * w11) * 255; d[k] = d[k + 1] = d[k + 2] = hv; d[k + 3] = 255; continue; }
          const gn = grain ? 1 + (U.hash(x, y, seed + 77) - 0.5) * grain * 2 : 1;
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
