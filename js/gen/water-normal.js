/* Water normals: tileable water normal maps (and height maps) for game water shaders, built from a stack
   of layers (first → last): directional wave trains, noise waves, ridged chop, rain ripples, cellular /
   caustic undulation, flow streaks and calm-area masks.
   Every layer is an analytic height field h(x, y) with an exact analytic gradient, so the normal map is
   computed from the true slopes (no finite differences, no blur). Tiling is exact: waves use integer wave
   vectors per tile, lattice noise uses integer periods, ripples wrap across the edges.
   Units: one "world unit" = one repeat of the global tiling scale (short side / scale). A layer's
   strength is its steepness (slope), its height scales with its wavelength, so the height map is
   dominated by big swells while the normals get detail from every layer. */
(function () {
  'use strict';
  const U = window.UGTG;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const tr = (s) => (U.t ? U.t(s) : s);

  const TYPES = [
    ['waves', 'Directional waves'], ['noise', 'Noise waves'], ['ridged', 'Choppy noise (ridged)'], ['ripples', 'Rain ripples'],
    ['cells', 'Cellular / caustic'], ['flow', 'Flow streaks'], ['mask', 'Mask (calm areas)'],
  ];
  const TYPE_NAME = Object.fromEntries(TYPES);
  const TYPE_IDX = Object.fromEntries(TYPES.map((t, i) => [t[0], i]));
  const is = (...t) => (l) => t.includes(l.type);
  const LATTICE = ['noise', 'ridged', 'cells'];

  const LAYER_DEFS = [
    { key: 'on', label: 'Visible', type: 'bool', default: true },
    { key: 'type', label: 'Type', type: 'select', default: 'waves', options: TYPES },
    { key: 'blend', label: 'Blend', type: 'select', default: 'add', options: [['add', 'Add'], ['max', 'Max (highest wins)']], show: (l) => l.type !== 'mask', tip: 'Add sums the heights; Max keeps whichever is higher (crests poke through)' },
    { key: 'amp', label: 'Strength', type: 'range', min: 0, max: 2, step: 0.01, default: 0.5, show: (l) => l.type !== 'mask', tip: 'Steepness of this layer: how strongly it bends the normals. Its height scales with its wavelength' },
    { key: 'scale', label: 'Scale', type: 'range', min: 1, max: 48, step: 1, default: 4, show: (l) => l.type !== 'ripples', tip: 'Waves / features per tile repeat (whole numbers, so it tiles)' },
    // directional waves + flow
    { key: 'count', label: 'Wave count', type: 'range', min: 1, max: 64, step: 1, default: 12, show: is('waves', 'flow'), tip: 'Number of summed sine waves' },
    { key: 'dir', label: 'Direction (°)', type: 'range', min: 0, max: 360, step: 1, default: 30, show: is('waves', 'flow'), tip: 'Waves: direction the waves travel. Flow: direction the water flows. 0° = right, 90° = up' },
    { key: 'spread', label: 'Spread (°)', type: 'range', min: 0, max: 180, step: 1, default: 40, show: is('waves'), tip: 'Random angle around the main direction; 180 = waves from everywhere' },
    { key: 'sizeVar', label: 'Size variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: is('waves', 'ripples'), tip: 'Waves: range of wavelengths around the scale. Ripples: mix of small / faded and big / strong rings' },
    { key: 'stretch', label: 'Stretch', type: 'range', min: 1, max: 16, step: 0.1, default: 6, show: is('flow'), tip: 'How long the streaks are compared to their width' },
    { key: 'chop', label: 'Choppiness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, show: is('waves', 'noise', 'flow'), tip: 'Sharpens the crests and widens the troughs (trochoid-like)' },
    // lattice noise
    { key: 'octaves', label: 'Detail (octaves)', type: 'range', min: 1, max: 7, step: 1, default: 4, show: is(...LATTICE) },
    { key: 'gain', label: 'Roughness', type: 'range', min: 0.2, max: 0.85, step: 0.01, default: 0.5, show: (l) => LATTICE.includes(l.type) && l.octaves > 1, tip: 'Strength of each finer octave' },
    { key: 'warp', label: 'Warp', type: 'range', min: 0, max: 2, step: 0.01, default: 0, show: is(...LATTICE, 'mask'), tip: 'Swirls the pattern with a second noise (organic, caustic-like shapes)' },
    { key: 'sharp', label: 'Crease sharpness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: is('cells'), tip: 'Rounded domes with sharp grooves (high) or soft cones (low)' },
    // ripples
    { key: 'drops', label: 'Drops per tile', type: 'range', min: 1, max: 300, step: 1, default: 24, show: is('ripples'), tip: 'Number of ripples per tile repeat' },
    { key: 'radius', label: 'Ripple radius', type: 'range', min: 0.02, max: 0.5, step: 0.005, default: 0.1, show: is('ripples'), tip: 'Outer radius, as a fraction of one tile repeat' },
    { key: 'rings', label: 'Rings', type: 'range', min: 1, max: 12, step: 0.5, default: 4, show: is('ripples') },
    { key: 'decay', label: 'Ring fade', type: 'range', min: 0, max: 8, step: 0.05, default: 2, show: is('ripples'), tip: 'How fast the outer rings fade' },
    // mask
    { key: 'coverage', label: 'Calm coverage', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: is('mask'), tip: 'Share of the surface that is calm' },
    { key: 'soft', label: 'Edge softness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: is('mask') },
    { key: 'calm', label: 'Calmness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.9, show: is('mask'), tip: 'How flat the calm areas get (1 = mirror-flat). Affects every layer before this one in the list' },
    { key: 'seed', label: 'Seed offset', type: 'seed', default: 0 },
  ];
  const LD = {};
  for (const d of LAYER_DEFS) if (d.key) LD[d.key] = d.default;

  /* preset helpers: list items only need what differs from the item defaults */
  const WV = (o) => Object.assign({ type: 'waves' }, o);
  const NZ = (o) => Object.assign({ type: 'noise' }, o);
  const RG = (o) => Object.assign({ type: 'ridged', octaves: 3 }, o);
  const RP = (o) => Object.assign({ type: 'ripples' }, o);
  const CL = (o) => Object.assign({ type: 'cells', octaves: 1 }, o);
  const FL = (o) => Object.assign({ type: 'flow', dir: 0, count: 24, chop: 0.1 }, o);
  const MK = (o) => Object.assign({ type: 'mask', scale: 2, octaves: 3 }, o);

  const DEFAULT_LAYERS = [
    WV({ amp: 0.45, scale: 3, count: 12, dir: 30, spread: 40, chop: 0.3 }),
    WV({ amp: 0.3, scale: 8, count: 16, dir: 50, spread: 80, chop: 0.2, seed: 1 }),
    NZ({ amp: 0.08, scale: 12, octaves: 3, chop: 0 }),
  ];

  /* ---------- analytic noise with derivatives (results in NV, NX, NY) ---------- */
  let NV = 0, NX = 0, NY = 0;

  // periodic lattice tables: random unit gradients (perlin) or feature points (cells)
  function gradTable(px, py, seed) {
    const g = new Float32Array(px * py * 2);
    for (let y = 0, k = 0; y < py; y++) for (let x = 0; x < px; x++, k += 2) {
      const a = U.hash(x, y, seed) * TAU;
      g[k] = Math.cos(a); g[k + 1] = Math.sin(a);
    }
    return { px, py, g };
  }
  function pointTable(px, py, seed) {
    const g = new Float32Array(px * py * 2);
    for (let y = 0, k = 0; y < py; y++) for (let x = 0; x < px; x++, k += 2) {
      g[k] = 0.1 + 0.8 * U.hash(x, y, seed); g[k + 1] = 0.1 + 0.8 * U.hash(x, y, seed + 7919);
    }
    return { px, py, g };
  }

  // gradient noise, quintic fade, value ~[-1, 1]; derivatives in lattice units
  function perlinD(T, X, Y) {
    const px = T.px, py = T.py, G = T.g;
    let xi = Math.floor(X), yi = Math.floor(Y);
    const fx = X - xi, fy = Y - yi;
    if (xi < 0 || xi >= px) { xi %= px; if (xi < 0) xi += px; }
    if (yi < 0 || yi >= py) { yi %= py; if (yi < 0) yi += py; }
    const x1 = xi + 1 === px ? 0 : xi + 1, r0 = yi * px, r1 = (yi + 1 === py ? 0 : yi + 1) * px;
    const i00 = (r0 + xi) << 1, i10 = (r0 + x1) << 1, i01 = (r1 + xi) << 1, i11 = (r1 + x1) << 1;
    const ax = G[i00], ay = G[i00 + 1], bx = G[i10], by = G[i10 + 1], cx = G[i01], cy = G[i01 + 1], dx = G[i11], dy = G[i11 + 1];
    const a = ax * fx + ay * fy, b = bx * (fx - 1) + by * fy, c = cx * fx + cy * (fy - 1), d = dx * (fx - 1) + dy * (fy - 1);
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const du = 30 * fx * fx * (fx * (fx - 2) + 1), dv = 30 * fy * fy * (fy * (fy - 2) + 1);
    const k = a - b - c + d, uv = u * v;
    NV = (a + u * (b - a) + v * (c - a) + uv * k) * 1.4;
    NX = (ax + u * (bx - ax) + v * (cx - ax) + uv * (ax - bx - cx + dx) + du * (b - a + v * k)) * 1.4;
    NY = (ay + u * (by - ay) + v * (cy - ay) + uv * (ay - by - cy + dy) + dv * (c - a + u * k)) * 1.4;
  }

  // worley F2 - F1 (0 on cell borders, rising toward the cell centers) and its gradient
  function cellsD(T, X, Y) {
    const px = T.px, py = T.py, P = T.g;
    const xi = Math.floor(X), yi = Math.floor(Y);
    let d1 = 1e9, d2 = 1e9, ax = 0, ay = 0, bx = 0, by = 0;
    for (let j = -1; j <= 1; j++) {
      const cy = yi + j;
      let wy = cy % py; if (wy < 0) wy += py;
      for (let i = -1; i <= 1; i++) {
        const cx = xi + i;
        let wx = cx % px; if (wx < 0) wx += px;
        const k = (wy * px + wx) << 1;
        const dx = X - cx - P[k], dy = Y - cy - P[k + 1], d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; bx = ax; by = ay; d1 = d; ax = dx; ay = dy; }
        else if (d < d2) { d2 = d; bx = dx; by = dy; }
      }
    }
    const f1 = Math.sqrt(d1) || 1e-6, f2 = Math.sqrt(d2) || 1e-6;
    NV = f2 - f1; NX = bx / f2 - ax / f1; NY = by / f2 - ay / f1;
  }

  /* mean of the choppy wave profile over one period (keeps choppy layers centered around 0) */
  const chopMean = (c) => {
    if (c <= 0) return 0;
    let m = 0;
    for (let i = 0; i < 256; i++) { const s = (Math.sin((i + 0.5) / 256 * TAU) + 1) * 0.5; m += (2 * s * (1 - c)) / (1 - c * s) - 1; }
    return m / 256;
  };

  U.register({
    id: 'water-normal',
    name: 'Water Normals',
    desc: 'Tileable water normal and height maps from layered waves, noise, rain ripples, caustic cells and flow streaks',
    tags: ['Texturing', 'Nature', 'VFX'],
    tileable: true,
    normalMap: false, // the output already is a normal map, computed from exact slopes
    icon: U.icon('<path d="M3 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M3 13c2-2 4-2 6 0s4 2 6 0 4-2 6 0" opacity=".7"/><path d="M3 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" opacity=".45"/>'),
    exportLayers: (p) => (p.output === 'both' ? [{ id: 'normal', suffix: 'normal' }, { id: 'height', suffix: 'height' }] : null),
    params: [
      { type: 'section', label: 'Water' },
      { key: 'strength', label: 'Normal strength', type: 'range', min: 0, max: 4, step: 0.01, default: 1, tip: 'Scales every slope: 0 = flat, 1 = as designed' },
      { key: 'scale', label: 'Tiling scale', type: 'range', min: 1, max: 8, step: 1, default: 1, tip: 'Repeats the whole look this many times across the texture (finer water, same steepness)' },
      { key: 'yDir', label: 'Green channel', type: 'select', default: 'gl', options: [['gl', 'OpenGL (Y+) · Unity, Blender, Godot'], ['dx', 'DirectX (Y−) · Unreal, Substance DX']] },
      { key: 'seed', label: 'Seed', type: 'seed', default: 1 },

      { type: 'section', label: 'Layers' },
      {
        key: 'layers', label: 'Layers', type: 'list', itemLabel: 'Layer', max: 10,
        itemSummary: (l) => `${l.on === false ? '(hidden) ' : ''}${tr(TYPE_NAME[l.type] || l.type)}${l.type === 'mask' ? ` · ${Math.round((l.calm == null ? LD.calm : l.calm) * 100)}%` : ` · ${l.amp == null ? LD.amp : l.amp}`}`,
        default: JSON.parse(JSON.stringify(DEFAULT_LAYERS)),
        item: LAYER_DEFS,
      },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'normal', options: [['normal', 'Normal map'], ['height', 'Height map'], ['both', 'Normal + height (separate files)']], tip: 'Both: the export downloads the normal map and the height map as two aligned PNGs' },
      { key: 'heightNorm', label: 'Height range', type: 'select', default: 'auto', show: (p) => p.output !== 'normal', options: [['auto', 'Auto (full black → white)'], ['fixed', 'Fixed (stable across seeds)']], tip: 'Auto stretches the lowest point to black and the highest to white. Fixed maps the theoretical range, so seeds and presets stay comparable' },
      { key: 'view', label: 'Preview layer', type: 'select', default: 'normal', show: (p) => p.output === 'both', options: [['normal', 'Normal map'], ['height', 'Height map']], tip: 'Preview only, the export uses the settings above' },
    ],
    presets: [
      // Ocean
      { name: 'Gentle swell', group: 'Ocean', values: { seed: 4, layers: [WV({ amp: 0.35, scale: 2, count: 8, dir: 20, spread: 25, chop: 0.05 }), WV({ amp: 0.15, scale: 7, count: 12, spread: 60, chop: 0, seed: 1 }), NZ({ amp: 0.06, scale: 16, octaves: 3, chop: 0 })] } },
      { name: 'Open ocean', group: 'Ocean', values: { seed: 7, layers: [WV({ amp: 0.5, scale: 2, count: 12, dir: 20, spread: 30, chop: 0.3 }), WV({ amp: 0.35, scale: 6, count: 16, dir: 35, spread: 70, chop: 0.3, seed: 1 }), NZ({ amp: 0.08, scale: 12, octaves: 3, chop: 0.1 })] } },
      { name: 'Choppy sea', group: 'Ocean', values: { seed: 12, layers: [WV({ amp: 0.55, scale: 3, count: 14, dir: 40, spread: 60, chop: 0.55 }), RG({ amp: 0.35, scale: 8, octaves: 3, warp: 0.3 }), NZ({ amp: 0.12, scale: 20, octaves: 2, chop: 0.3 })] } },
      { name: 'Stormy sea', group: 'Ocean', values: { seed: 3, strength: 1.2, layers: [WV({ amp: 0.75, scale: 2, count: 16, dir: 15, spread: 45, chop: 0.8 }), WV({ amp: 0.45, scale: 6, count: 16, dir: 30, spread: 90, chop: 0.6, seed: 1 }), RG({ amp: 0.3, scale: 6, octaves: 4, warp: 0.4 })] } },
      { name: 'Shallow beach water', group: 'Ocean', values: { seed: 9, layers: [WV({ amp: 0.45, scale: 3, count: 8, dir: 90, spread: 20, chop: 0.45 }), CL({ amp: 0.12, scale: 4, warp: 0.8, sharp: 0.2 }), NZ({ amp: 0.1, scale: 16, octaves: 3, chop: 0 })] } },
      // Lake & river
      { name: 'Calm lake', group: 'Lake & river', values: { seed: 5, layers: [NZ({ amp: 0.18, scale: 4, octaves: 4, warp: 0.4, chop: 0 }), WV({ amp: 0.1, scale: 12, count: 12, spread: 120, chop: 0 })] } },
      { name: 'Windy lake', group: 'Lake & river', values: { seed: 21, layers: [WV({ amp: 0.4, scale: 8, count: 16, dir: 60, spread: 50, chop: 0.35 }), RG({ amp: 0.15, scale: 14, octaves: 3 }), NZ({ amp: 0.1, scale: 4, octaves: 2, chop: 0 })] } },
      { name: 'Pond with wind gusts', group: 'Lake & river', values: { seed: 14, layers: [NZ({ amp: 0.35, scale: 10, octaves: 3, chop: 0.2 }), WV({ amp: 0.25, scale: 14, count: 12, dir: 45, spread: 60, chop: 0.2 }), MK({ coverage: 0.5, calm: 0.92, soft: 0.5, warp: 0.5 }), NZ({ amp: 0.08, scale: 3, octaves: 2, chop: 0, seed: 1 })] } },
      { name: 'River flow', group: 'Lake & river', values: { seed: 6, layers: [FL({ amp: 0.45, scale: 6, stretch: 6, chop: 0.2 }), FL({ amp: 0.2, scale: 18, stretch: 4, seed: 1 }), NZ({ amp: 0.12, scale: 14, octaves: 3, chop: 0 })] } },
      { name: 'Slow stream', group: 'Lake & river', values: { seed: 2, layers: [FL({ amp: 0.25, scale: 4, stretch: 9, chop: 0 }), NZ({ amp: 0.1, scale: 8, octaves: 3, warp: 0.6, chop: 0 })] } },
      // Rain & puddles
      { name: 'Light drizzle', group: 'Rain & puddles', values: { seed: 8, layers: [RP({ amp: 0.5, drops: 10, radius: 0.1, rings: 5, decay: 2 }), NZ({ amp: 0.04, scale: 4, octaves: 2, chop: 0 })] } },
      { name: 'Rain on puddle', group: 'Rain & puddles', values: { seed: 11, layers: [RP({ amp: 0.6, drops: 28, radius: 0.08, rings: 4 }), NZ({ amp: 0.05, scale: 4, octaves: 2, chop: 0 })] } },
      { name: 'Heavy rain', group: 'Rain & puddles', values: { seed: 17, layers: [RP({ amp: 0.6, drops: 80, radius: 0.06, rings: 3, decay: 1.5 }), RP({ amp: 0.35, drops: 30, radius: 0.13, rings: 5, seed: 1 }), NZ({ amp: 0.12, scale: 10, octaves: 3, chop: 0 })] } },
      { name: 'Rain on lake', group: 'Rain & puddles', values: { seed: 19, layers: [NZ({ amp: 0.2, scale: 5, octaves: 4, warp: 0.4, chop: 0 }), RP({ amp: 0.45, drops: 40, radius: 0.07, rings: 4 })] } },
      // Pool & stylized
      { name: 'Swimming pool', group: 'Pool & stylized', values: { seed: 10, layers: [CL({ amp: 0.2, scale: 4, warp: 0.7, sharp: 0.1 }), NZ({ amp: 0.1, scale: 3, octaves: 2, chop: 0 })] } },
      { name: 'Caustic shimmer', group: 'Pool & stylized', values: { seed: 13, layers: [CL({ amp: 0.4, scale: 6, octaves: 2, gain: 0.4, warp: 1, sharp: 0.7 })] } },
      { name: 'Toon water', group: 'Pool & stylized', values: { seed: 1, layers: [WV({ amp: 0.5, scale: 2, count: 2, dir: 20, spread: 30, sizeVar: 0.2, chop: 0.6 }), WV({ amp: 0.3, scale: 5, count: 2, dir: 70, spread: 30, sizeVar: 0.2, chop: 0.5, seed: 1 })] } },
      { name: 'Cartoon rain rings', group: 'Pool & stylized', values: { seed: 3, layers: [RP({ amp: 0.6, drops: 6, radius: 0.25, rings: 3, decay: 0.5, sizeVar: 0.3 })] } },
    ],

    render(ctx, W, H, p, opts) {
      opts = opts || {};
      let view = p.output === 'height' ? 'height' : 'normal';
      if (p.output === 'both') view = opts.layer || (opts.preview ? p.view || 'normal' : 'normal');
      if (opts.height) view = 'height';

      const S = Math.min(W, H), G = Math.max(1, Math.round(p.scale || 1)), N = W * H;
      const TX = (G * W) / S, TY = (G * H) / S; // tile size in world units
      const gseed = (p.seed | 0) * 1009;
      const AH = new Float32Array(N), AX = new Float32Array(N), AY = new Float32Array(N); // accumulated height + world gradient
      const LH = new Float32Array(N), LX = new Float32Array(N), LY = new Float32Array(N); // current layer
      let bound = 0, has = false;

      const tables = new Map();
      const table = (kind, px, py, seed) => {
        const k = kind + px + ',' + py + ',' + seed;
        let t = tables.get(k);
        if (!t) tables.set(k, (t = kind === 'cells' ? pointTable(px, py, seed) : gradTable(px, py, seed)));
        return t;
      };

      /* lattice field: fbm of perlin / ridged / cells (+ domain warp) -> LH = value, LX/LY = gradient per world unit */
      function lattice(kind, F, oct, gain, warp, seed, sharp) {
        const Px = Math.max(1, Math.round(F * TX)), Py = Math.max(1, Math.round(F * TY));
        const ex = Px / TX, ey = Py / TY;
        // drop octaves whose cells would be smaller than 2 px (aliasing)
        let no = 1;
        while (no < oct && (Px << no) * 2 <= W && (Py << no) * 2 <= H) no++;
        const T = [], amps = [];
        let norm = 0;
        // each octave is shifted by a fixed fraction so their lattice points (where gradient noise is 0) don't line up
        const OX = [], OY = [];
        for (let o = 0, a = 1; o < no; o++, a *= gain) {
          T.push(table(kind, Px << o, Py << o, seed + o * 1013)); amps.push(a); norm += a;
          OX.push(o ? U.hash(o, 1, seed) * 4 : 0); OY.push(o ? U.hash(o, 2, seed) * 4 : 0);
        }
        for (let o = 0; o < no; o++) amps[o] /= norm;
        const WA = warp > 0 ? table('perlin', Px, Py, seed + 501) : null, WB = warp > 0 ? table('perlin', Px, Py, seed + 502) : null;
        const e = 1 + 4 * sharp, es = 1 / Math.sqrt(e);
        const sx = Px / W, sy = Py / H;
        if (!WA && kind !== 'cells') {
          // fast path (no warp): the x terms are shared by all rows and the y terms by a whole row,
          // so they are computed once per octave; same math as perlinD
          LH.fill(0); LX.fill(0); LY.fill(0);
          const ridged = kind === 'ridged';
          const CI0 = new Int32Array(W), CI1 = new Int32Array(W), CF = new Float64Array(W), CU = new Float64Array(W), CD = new Float64Array(W);
          for (let o = 0; o < no; o++) {
            const t = T[o], px = t.px, py = t.py, Gt = t.g, f = 1 << o, a = amps[o] * 1.4, gxs = a * f * ex, gys = a * f * ey;
            for (let x = 0; x < W; x++) {
              const X = x * sx * f + OX[o], xi = Math.floor(X), fx = X - xi, xw = xi % px;
              CI0[x] = xw; CI1[x] = xw + 1 === px ? 0 : xw + 1; CF[x] = fx;
              CU[x] = fx * fx * fx * (fx * (fx * 6 - 15) + 10); CD[x] = 30 * fx * fx * (fx * (fx - 2) + 1);
            }
            for (let y = 0; y < H; y++) {
              const Y = y * sy * f + OY[o], yf = Math.floor(Y), fy = Y - yf, yi = yf % py;
              const r0 = yi * px, r1 = (yi + 1 === py ? 0 : yi + 1) * px, fy1 = fy - 1;
              const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10), dv = 30 * fy * fy * (fy * (fy - 2) + 1);
              for (let x = 0, i = y * W; x < W; x++, i++) {
                const xi = CI0[x], x1 = CI1[x], fx = CF[x], u = CU[x], fx1 = fx - 1;
                const i00 = (r0 + xi) << 1, i10 = (r0 + x1) << 1, i01 = (r1 + xi) << 1, i11 = (r1 + x1) << 1;
                const ax = Gt[i00], ay = Gt[i00 + 1], bx = Gt[i10], by = Gt[i10 + 1], cx = Gt[i01], cy = Gt[i01 + 1], dx = Gt[i11], dy = Gt[i11 + 1];
                const A0 = ax * fx + ay * fy, B = bx * fx1 + by * fy, C = cx * fx + cy * fy1, D = dx * fx1 + dy * fy1;
                const k = A0 - B - C + D, uv = u * v;
                let n = A0 + u * (B - A0) + v * (C - A0) + uv * k;
                let gx = ax + u * (bx - ax) + v * (cx - ax) + uv * (ax - bx - cx + dx) + CD[x] * (B - A0 + v * k);
                let gy = ay + u * (by - ay) + v * (cy - ay) + uv * (ay - by - cy + dy) + dv * (C - A0 + u * k);
                if (ridged) {
                  n *= 1.4;
                  const r = 1 - Math.abs(n), s = n > 0 ? -2 * r : n < 0 ? 2 * r : 0;
                  LH[i] += amps[o] * (r * r - 0.5); gx *= s; gy *= s;
                } else LH[i] += a * n;
                LX[i] += gxs * gx; LY[i] += gys * gy;
              }
            }
          }
          return;
        }
        for (let y = 0, i = 0; y < H; y++) {
          const Y0 = y * sy;
          for (let x = 0; x < W; x++, i++) {
            let X = x * sx, Y = Y0, j00 = 1, j01 = 0, j10 = 0, j11 = 1;
            if (WA) {
              perlinD(WA, X, Y); const va = NV, ax = NX, ay = NY;
              perlinD(WB, X, Y);
              X += warp * va; Y += warp * NV;
              j00 = 1 + warp * ax; j01 = warp * ay; j10 = warp * NX; j11 = 1 + warp * NY;
            }
            let v = 0, gx = 0, gy = 0;
            if (kind === 'perlin') {
              for (let o = 0; o < no; o++) {
                const f = 1 << o, a = amps[o];
                perlinD(T[o], X * f + OX[o], Y * f + OY[o]);
                v += a * NV; gx += a * f * NX; gy += a * f * NY;
              }
            } else for (let o = 0; o < no; o++) {
              const f = 1 << o, a = amps[o];
              if (kind === 'cells') {
                cellsD(T[o], X * f + OX[o], Y * f + OY[o]);
                const t = NV < 1 ? NV : 1, q = 1 - t, qe = Math.pow(q, e - 1);
                const s = NV < 1 ? e * qe * es : 0;
                v += a * ((1 - qe * q) * es - 0.5 * es); gx += a * f * s * NX; gy += a * f * s * NY;
              } else {
                perlinD(T[o], X * f + OX[o], Y * f + OY[o]);
                const r = 1 - Math.abs(NV), s = NV > 0 ? -2 * r : NV < 0 ? 2 * r : 0;
                v += a * (r * r - 0.5); gx += a * f * s * NX; gy += a * f * s * NY;
              }
            }
            // chain rule through the warp: grad = J^T * grad'
            LH[i] = v; LX[i] = (gx * j00 + gy * j10) * ex; LY[i] = (gx * j01 + gy * j11) * ey;
          }
        }
      }

      /* sum of sine waves with integer wave vectors (kx, ky cycles per tile) -> LH / LX / LY (already scaled) */
      function spectral(waves, A, chop) {
        const c = 0.85 * U.clamp(chop || 0), mean = chopMean(c);
        const list = [];
        for (const w of waves) {
          if ((w.kx === 0 && w.ky === 0) || Math.abs(w.kx) * 2.2 > W || Math.abs(w.ky) * 2.2 > H) continue; // nothing / above Nyquist
          const kwx = w.kx / TX, kwy = w.ky / TY, kw = Math.hypot(kwx, kwy);
          list.push({ kxm: ((w.kx % W) + W) % W, ky: w.ky, cp: Math.cos(w.ph), sp: Math.sin(w.ph), h: (A * w.w) / (TAU * kw), gx: (A * w.w * kwx) / kw, gy: (A * w.w * kwy) / kw });
        }
        const n = list.length;
        if (!n) return 0;
        const CX = new Float64Array(W), SX = new Float64Array(W), CY = new Float64Array(H), SY = new Float64Array(H);
        for (let i = 0; i < W; i++) { CX[i] = Math.cos((TAU * i) / W); SX[i] = Math.sin((TAU * i) / W); }
        for (let i = 0; i < H; i++) { CY[i] = Math.cos((TAU * i) / H); SY[i] = Math.sin((TAU * i) / H); }
        const KX = new Int32Array(n);
        const AHs = new Float64Array(n), AGx = new Float64Array(n), AGy = new Float64Array(n);
        let b = 0;
        for (let j = 0; j < n; j++) { KX[j] = list[j].kxm; AHs[j] = list[j].h; AGx[j] = list[j].gx; AGy[j] = list[j].gy; b += Math.abs(list[j].h) * (1 + Math.abs(mean)); }
        const c1 = 1 - c;
        // wave-outer over one image row at a time (the row stays in cache, the wave constants in registers)
        for (let y = 0; y < H; y++) {
          const o = y * W;
          for (let j = 0; j < n; j++) {
            const w = list[j], iy = (((w.ky * y) % H) + H) % H;
            const rc = CY[iy] * w.cp - SY[iy] * w.sp, rs = SY[iy] * w.cp + CY[iy] * w.sp;
            const kx = KX[j], ah = AHs[j], agx = AGx[j], agy = AGy[j];
            let k = 0;
            if (c > 0) {
              for (let x = o, xe = o + W; x < xe; x++) {
                const cx = CX[k], sx = SX[k];
                k += kx; if (k >= W) k -= W;
                const cs = cx * rc - sx * rs, sn = sx * rc + cx * rs;
                const s = (sn + 1) * 0.5, den = 1 - c * s, dv = (c1 / (den * den)) * cs;
                LH[x] += ah * ((2 * s * c1) / den - 1 - mean); LX[x] += agx * dv; LY[x] += agy * dv;
              }
            } else {
              for (let x = o, xe = o + W; x < xe; x++) {
                const cx = CX[k], sx = SX[k];
                k += kx; if (k >= W) k -= W;
                const cs = cx * rc - sx * rs;
                LH[x] += ah * (sx * rc + cx * rs); LX[x] += agx * cs; LY[x] += agy * cs;
              }
            }
          }
        }
        return b;
      }

      /* rain ripples: decaying concentric rings around random centers, wrapped across the edges */
      function ripples(l, A, seed) {
        const rnd = U.rng(seed);
        const R0 = Math.min(+l.radius || LD.radius, 0.5 * Math.min(TX, TY)), rings = Math.max(0.5, +l.rings || LD.rings);
        const decay = Math.max(0, +l.decay), vr = U.clamp(+l.sizeVar);
        const count = Math.min(4000, Math.max(0, Math.round((+l.drops || 0) * TX * TY / (G * G))));
        const pxw = W / TX, pyw = H / TY; // pixels per world unit
        let b = 0;
        for (let d = 0; d < count; d++) {
          const cx = rnd() * TX, cy = rnd() * TY;
          const R = R0 * (1 - vr * 0.6 * rnd()), amp = A * (1 - vr * 0.8 * rnd());
          const k = (TAU * rings) / R, hA = amp / k;
          b = Math.max(b, hA);
          const x0 = Math.floor((cx - R) * pxw), x1 = Math.min(Math.ceil((cx + R) * pxw), x0 + W - 1);
          const y0 = Math.floor((cy - R) * pyw), y1 = Math.min(Math.ceil((cy + R) * pyw), y0 + H - 1);
          const iR = 1 / R;
          for (let yy = y0; yy <= y1; yy++) {
            const dy = yy / pyw - cy, row = (((yy % H) + H) % H) * W;
            for (let xx = x0; xx <= x1; xx++) {
              const dx = xx / pxw - cx, r2 = dx * dx + dy * dy;
              if (r2 >= R * R) continue;
              const r = Math.sqrt(r2), t = r * iR, t2 = t * t, q = 1 - t2, ex = Math.exp(-decay * t2);
              const env = q * q * ex, denv = ex * q * (-4 * t - 2 * decay * t * q) * iR; // d env / d r
              const ck = Math.cos(k * r), sk = Math.sin(k * r);
              const i = row + (((xx % W) + W) % W);
              LH[i] += hA * ck * env;
              if (r > 1e-9) {
                const dr = hA * (-k * sk * env + ck * denv) / r;
                LX[i] += dr * dx; LY[i] += dr * dy;
              }
            }
          }
        }
        return b * 1.5;
      }

      const nth = {};
      const layers = (Array.isArray(p.layers) ? p.layers : []).map((l) => Object.assign({}, LD, l)).filter((l) => l && l.on !== false);
      for (const l of layers) {
        const type = TYPE_NAME[l.type] ? l.type : 'waves';
        nth[type] = (nth[type] || 0) + 1;
        const seed = gseed + (l.seed | 0) * 7919 + TYPE_IDX[type] * 31 + nth[type] * 577;
        const F = Math.max(1, Math.round(+l.scale || 1));
        const oct = Math.max(1, Math.min(8, Math.round(+l.octaves || 1)));
        const gain = U.clamp(+l.gain || 0.5, 0.05, 0.95), warp = Math.max(0, +l.warp || 0);

        if (type === 'mask') {
          if (!has || !(l.calm > 0)) continue;
          lattice('perlin', F, oct, 0.5, warp, seed, 0);
          const th = 0.5 + (U.clamp(+l.coverage) - 0.5) * 0.5, sw = 0.02 + 0.2 * U.clamp(+l.soft), calm = U.clamp(+l.calm);
          const e0 = th - sw, e1 = th + sw, inv = 1 / (e1 - e0);
          for (let i = 0; i < N; i++) {
            const t = (LH[i] * 0.5 + 0.5 - e0) * inv;
            let m = 1, dm = 0;
            if (t <= 0) m = 0;
            else if (t < 1) { m = t * t * (3 - 2 * t); dm = 6 * t * (1 - t) * inv * 0.5; }
            const k = 1 - calm * (1 - m), dk = calm * dm;
            AX[i] = AX[i] * k + AH[i] * dk * LX[i]; AY[i] = AY[i] * k + AH[i] * dk * LY[i]; AH[i] *= k;
          }
          continue;
        }

        const A = +l.amp;
        if (!(A > 0)) continue;
        LH.fill(0); LX.fill(0); LY.fill(0);
        let b = 0;
        if (type === 'waves' || type === 'flow') {
          const rnd = U.rng(seed), n = Math.max(1, Math.min(64, Math.round(+l.count || 1))), dir = (+l.dir || 0) * DEG;
          const waves = [];
          let wsum = 0;
          for (let i = 0; i < n; i++) {
            let a, f, w;
            if (type === 'waves') {
              a = dir + (rnd() + rnd() - 1) * (+l.spread || 0) * DEG;
              f = F * Math.pow(2, (rnd() * 2 - 1) * U.clamp(+l.sizeVar) * 1.25);
              w = 1;
            } else {
              // streaks along the flow: wave crests parallel to it, wave vectors nearly perpendicular
              a = dir + Math.PI / 2 + (rnd() + rnd() - 1) * Math.atan(1 / Math.max(1, +l.stretch || 1));
              f = F * Math.pow(2, rnd() * 2.5);
              w = Math.pow(f / F, -0.35);
            }
            waves.push({ kx: Math.round(f * Math.cos(a) * TX), ky: Math.round(-f * Math.sin(a) * TY), ph: rnd() * TAU, w });
            wsum += w * w;
          }
          const wn = 1 / Math.sqrt(wsum);
          for (const w of waves) w.w *= wn;
          b = spectral(waves, A, l.chop);
        } else if (type === 'ripples') {
          b = ripples(l, A, seed);
        } else {
          lattice(type === 'noise' ? 'perlin' : type, F, oct, gain, warp, seed, U.clamp(+l.sharp));
          const c = type === 'noise' ? 0.85 * U.clamp(+l.chop) : 0, c1 = 1 - c, sc = A / F;
          for (let i = 0; i < N; i++) {
            let v = LH[i], d = 1;
            if (c > 0) {
              const s = U.clamp(v * 0.5 + 0.5), den = 1 - c * s;
              v = (2 * s * c1) / den - 1; d = c1 / (den * den);
            }
            LH[i] = v * sc; LX[i] *= d * sc; LY[i] *= d * sc;
          }
          b = sc * (type === 'cells' ? 0.6 : 1);
        }

        if (l.blend === 'max' && has) {
          for (let i = 0; i < N; i++) if (LH[i] > AH[i]) { AH[i] = LH[i]; AX[i] = LX[i]; AY[i] = LY[i]; }
          bound = Math.max(bound, b);
        } else {
          for (let i = 0; i < N; i++) { AH[i] += LH[i]; AX[i] += LX[i]; AY[i] += LY[i]; }
          bound += b;
        }
        has = true;
      }

      const img = ctx.createImageData(W, H), o = img.data;
      if (view === 'height') {
        let lo = Infinity, hi = -Infinity;
        if (p.heightNorm === 'fixed') { const r = (bound || 1) * 0.7; lo = -r; hi = r; }
        else { for (let i = 0; i < N; i++) { const v = AH[i]; if (v < lo) lo = v; if (v > hi) hi = v; } }
        const s = hi - lo > 1e-12 ? 255 / (hi - lo) : 0;
        for (let i = 0, k = 0; i < N; i++, k += 4) {
          const g = s ? (AH[i] - lo) * s + 0.5 : 128;
          o[k] = o[k + 1] = o[k + 2] = g; o[k + 3] = 255;
        }
      } else {
        // tangent space as in the app's normal mode: n = (-dh/dx, dh/dy_down * (GL ? 1 : -1), 1), normalized
        const K = +p.strength >= 0 ? +p.strength : 1, gy = p.yDir === 'dx' ? -1 : 1;
        for (let i = 0, k = 0; i < N; i++, k += 4) {
          const nx = -AX[i] * K, ny = AY[i] * K * gy, l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
          o[k] = (nx * l * 0.5 + 0.5) * 255 + 0.5;
          o[k + 1] = (ny * l * 0.5 + 0.5) * 255 + 0.5;
          o[k + 2] = (l * 0.5 + 0.5) * 255 + 0.5;
          o[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
