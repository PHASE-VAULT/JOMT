/* Ice & snow: tileable winter surfaces. Fresh / packed / wind-swept (sastrugi) / slushy snow, clear lake
   ice with white cracks and trapped bubbles, cracked ice sheets, frosted glass and hoarfrost (feathery
   ridged frost plus branching fern crystals), glacier ice with compressed layers, and icy ground (snow
   patches over ice). Snow is lit from its own height field with blue-tinted dips and sparkle.
   Everything uses periodic noise or wrapped splats, so the texture tiles. Dedicated height map for the
   normal map mode: drifts and ripples as relief, cracks and skate marks as grooves, frost raised. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;

  const SNOWY = { fresh: 1, packed: 1, wind: 1, slush: 1, icy: 1 };
  const ICY = { lake: 1, cracked: 1, frost: 1, glacier: 1, icy: 1 };
  const hasSnow = (p) => !!SNOWY[p.type];
  const hasIce = (p) => !!ICY[p.type];

  // what each surface type starts from (applied when the type is picked; presets override single values)
  const BASE = {
    snowColor: '#f3f6fb', shadowColor: '#8ea6d6', iceColor: '#b9d4e4', deepColor: '#4f7c9e', crackColor: '#ffffff', dirtColor: '#5a4e40',
    drift: 0.5, driftScale: 3, grain: 0.5, packed: 0, ripples: 0, sparkle: 0.45, shadowTint: 0.55, shading: 0.8, cover: 0.55,
    depth: 0.6, layers: 0, cracks: 0, crackDetail: 0.3, crackStyle: 'white', bubbles: 0, scratches: 0,
    frost: 0, crystals: 0, feather: 0.6, dirt: 0, wet: 0, toon: 0,
  };
  const TYPES = {
    fresh: {},
    packed: { drift: 0.25, packed: 0.75, sparkle: 0.25, shadowTint: 0.4, dirt: 0.15, iceColor: '#c4d6e2' },
    wind: { drift: 0.35, driftScale: 2, ripples: 0.75, sparkle: 0.4, shadowTint: 0.65 },
    slush: { snowColor: '#d9dad6', shadowColor: '#8a929c', drift: 0.35, packed: 0.4, sparkle: 0.1, shadowTint: 0.3, dirt: 0.4, wet: 0.6, dirtColor: '#5a5044', iceColor: '#8a959c', deepColor: '#3a4248' },
    lake: { iceColor: '#3c5a6c', deepColor: '#0e1c26', depth: 0.8, cracks: 0.45, crackDetail: 0.35, bubbles: 0.45, sparkle: 0.2, drift: 0.3 },
    cracked: { iceColor: '#a9cbdc', deepColor: '#3f6f8e', depth: 0.6, cracks: 1, crackDetail: 0.6, bubbles: 0.15, drift: 0.3 },
    frost: { iceColor: '#5f7a8c', deepColor: '#24384a', depth: 0.5, frost: 0.85, crystals: 0.6, feather: 0.8, sparkle: 0.35, drift: 0.3 },
    glacier: { iceColor: '#8fd0ea', deepColor: '#0d4f86', crackColor: '#e6f6ff', depth: 0.85, layers: 0.7, cracks: 0.3, crackDetail: 0.2, bubbles: 0.3, drift: 0.3 },
    icy: { iceColor: '#6c8a9c', deepColor: '#24384a', depth: 0.6, cover: 0.55, cracks: 0.35, bubbles: 0.2, drift: 0.35, dirt: 0.1 },
  };
  const typeValues = (t) => Object.assign({}, BASE, TYPES[t] || {});

  const LIGHT = (() => { const l = [-0.6, -0.6, 0.55], m = Math.hypot(...l); return l.map((v) => v / m); })();

  U.register({
    id: 'ice-snow',
    name: 'Ice / Snow',
    desc: 'Tileable snow and ice from fresh powder and slush to cracked lake ice, glacier and frost, with height map',
    uses: ['Winter ground, frozen lake and glacier materials for 3D terrain, using the height map for drifts, cracks and frost relief.', 'Frosted-glass textures for windows and cold screen effects.'],
    tags: ['Texturing', 'Nature'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5M4.5 10.2l3.4.9-.9 3.4M19.5 13.8l-3.4-.9.9-3.4" opacity=".7"/>'),
    params: [
      { type: 'section', label: 'Surface' },
      { key: 'type', label: 'Type', type: 'select', default: 'fresh',
        options: [['fresh', 'Fresh snow'], ['packed', 'Packed / trodden snow'], ['wind', 'Wind-swept snow (sastrugi)'], ['slush', 'Slushy snow'], ['lake', 'Sea / lake ice'], ['cracked', 'Cracked ice sheet'], ['frost', 'Frosted glass / hoarfrost'], ['glacier', 'Glacier blue ice'], ['icy', 'Icy ground (snow over ice)']],
        apply: (v, p) => Object.assign(p, typeValues(v)) },
      { key: 'scale', label: 'Scale', type: 'int', min: 1, max: 8, default: 1, tip: 'Repeats every feature this many times across the texture (whole numbers keep it seamless)' },
      { key: 'grain', label: 'Fine grain', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.grain, tip: 'Granular surface texture' },
      { key: 'shading', label: 'Relief shading', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.shading, tip: 'Lights the surface from its height (light from the top left)' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 11 },

      { type: 'section', label: 'Snow' },
      { key: 'cover', label: 'Snow coverage', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.cover, show: (p) => p.type === 'icy', tip: 'How much of the ice is covered by snow patches' },
      { key: 'drift', label: 'Drift bumps', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.drift, tip: 'Strength of the soft snow drifts and bumps' },
      { key: 'driftScale', label: 'Drift scale', type: 'int', min: 1, max: 16, default: BASE.driftScale, show: (p) => p.drift > 0, tip: 'Drifts across the texture' },
      { key: 'packed', label: 'Compressed patches', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.packed, show: hasSnow, tip: 'Trodden, flattened areas with dents: smoother, greyer and slightly icy' },
      { key: 'ripples', label: 'Wind ripples', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.ripples, show: hasSnow, tip: 'Sastrugi: sharp-crested ridges carved by the wind' },
      { key: 'rippleCount', label: 'Ripple count', type: 'int', min: 2, max: 40, default: 12, show: (p) => hasSnow(p) && p.ripples > 0 },
      { key: 'windDir', label: 'Wind direction', type: 'range', min: -90, max: 90, step: 1, default: 20, show: (p) => hasSnow(p) && p.ripples > 0, tip: 'Degrees; snapped slightly so the ripples tile' },
      { key: 'sparkle', label: 'Sparkle', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.sparkle, tip: 'Density of tiny glittering ice crystals' },
      { key: 'shadowTint', label: 'Blue shadows', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.shadowTint, show: hasSnow, tip: 'Tints dips and shaded slopes with the shadow color' },

      { type: 'section', label: 'Ice' },
      { key: 'depth', label: 'Depth gradient', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.depth, show: hasIce, tip: 'Blends from the ice color (surface) into the deep ice color through clouds of depth' },
      { key: 'layers', label: 'Compressed layers', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.layers, show: hasIce, tip: 'Bands of compressed ice, as in glaciers' },
      { key: 'layerCount', label: 'Layer count', type: 'int', min: 2, max: 30, default: 9, show: (p) => hasIce(p) && p.layers > 0 },
      { key: 'cracks', label: 'Cracks', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.cracks, show: hasIce },
      { key: 'crackScale', label: 'Crack scale', type: 'int', min: 1, max: 12, default: 3, show: (p) => hasIce(p) && p.cracks > 0, tip: 'Ice plates across the texture' },
      { key: 'crackWidth', label: 'Crack width', type: 'range', min: 0.3, max: 4, step: 0.05, default: 1.2, show: (p) => hasIce(p) && p.cracks > 0 },
      { key: 'crackDetail', label: 'Fine cracks', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.crackDetail, show: (p) => hasIce(p) && p.cracks > 0, tip: 'A second, smaller crack network' },
      { key: 'crackStyle', label: 'Crack look', type: 'select', default: 'white', options: [['white', 'White / frosty'], ['dark', 'Dark']], show: (p) => hasIce(p) && p.cracks > 0 },
      { key: 'bubbles', label: 'Bubbles', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.bubbles, show: hasIce, tip: 'Air bubbles trapped in the ice' },
      { key: 'bubbleSize', label: 'Bubble size', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1, show: (p) => hasIce(p) && p.bubbles > 0 },
      { key: 'scratches', label: 'Skate marks', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.scratches, show: hasIce, tip: 'Long curved scratches' },

      { type: 'section', label: 'Frost' },
      { key: 'frost', label: 'Frost coverage', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.frost, tip: 'Noise-masked frost over the surface' },
      { key: 'feather', label: 'Feathery texture', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.feather, show: (p) => p.frost > 0, tip: 'Vein-like hoarfrost structure inside the frost' },
      { key: 'crystals', label: 'Frost crystals', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.crystals, tip: 'Branching, fern-like ice crystals' },
      { key: 'crystalSize', label: 'Crystal size', type: 'range', min: 0.3, max: 2, step: 0.05, default: 1, show: (p) => p.crystals > 0 },

      { type: 'section', label: 'Color' },
      { key: 'snowColor', label: 'Snow', type: 'color', default: BASE.snowColor, tip: 'Also used for frost and frosty highlights' },
      { key: 'shadowColor', label: 'Shadow tint', type: 'color', default: BASE.shadowColor },
      { key: 'iceColor', label: 'Ice', type: 'color', default: BASE.iceColor, tip: 'Ice near the surface' },
      { key: 'deepColor', label: 'Deep ice', type: 'color', default: BASE.deepColor },
      { key: 'crackColor', label: 'Cracks', type: 'color', default: BASE.crackColor },
      { key: 'toon', label: 'Toon bands', type: 'int', min: 0, max: 6, default: 0, tip: 'Cel shading: quantizes the lighting and the ice depth into flat bands (0 = off)' },

      { type: 'section', label: 'Dirt / slush' },
      { key: 'dirt', label: 'Dirt', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.dirt, tip: 'Dirt and ground showing through, collecting in dips' },
      { key: 'dirtColor', label: 'Dirt color', type: 'color', default: BASE.dirtColor },
      { key: 'wet', label: 'Wetness / slush', type: 'range', min: 0, max: 1, step: 0.01, default: BASE.wet, tip: 'Soaked, darker snow with flat meltwater puddles' },
    ],
    presets: [
      { name: 'Fresh powder', group: 'Snow', values: { type: 'fresh', drift: 0.6, sparkle: 0.6 } },
      { name: 'Deep snow drifts', group: 'Snow', values: { type: 'fresh', drift: 1, driftScale: 2, shadowTint: 0.8, sparkle: 0.35 } },
      { name: 'Packed path snow', group: 'Snow', values: { type: 'packed', packed: 0.9, dirt: 0.25 } },
      { name: 'Wind-blown sastrugi', group: 'Snow', values: { type: 'wind', ripples: 0.9, rippleCount: 10, windDir: 25 } },
      { name: 'Dirty city slush', group: 'Snow', values: { type: 'slush', dirt: 0.45, wet: 0.7, packed: 0.6 } },
      { name: 'Frozen lake (black ice)', group: 'Ice', values: { type: 'lake', cracks: 0.5, crackScale: 2, bubbles: 0.55, depth: 0.9 } },
      { name: 'Cracked river ice', group: 'Ice', values: { type: 'cracked', crackScale: 4, crackDetail: 0.7, frost: 0.25, iceColor: '#9ec4d6', deepColor: '#33627e' } },
      { name: 'Glacier', group: 'Ice', values: { type: 'glacier' } },
      { name: 'Ice rink', group: 'Ice', values: { type: 'lake', iceColor: '#dfeef5', deepColor: '#a9c8da', crackColor: '#ffffff', depth: 0.4, cracks: 0, bubbles: 0.1, scratches: 0.85, frost: 0.15, sparkle: 0.1 } },
      { name: 'Icy rock ground', group: 'Ice', values: { type: 'icy', cover: 0.4, dirt: 0.55, dirtColor: '#4a4844', iceColor: '#5c6c74', deepColor: '#2a3238', cracks: 0.25 } },
      { name: 'Frosted window', group: 'Frost', values: { type: 'frost', frost: 0.45, crystals: 1, crystalSize: 1.3, feather: 0.7, iceColor: '#6d8aa0', deepColor: '#2a4258', sparkle: 0.2 } },
      { name: 'Hoarfrost', group: 'Frost', values: { type: 'frost', frost: 0.9, feather: 1, crystals: 0.35, crystalSize: 0.6, iceColor: '#4a5550', deepColor: '#1e2622', depth: 0.6, dirt: 0.2, dirtColor: '#3a3a2a', sparkle: 0.6 } },
      { name: 'Frost-covered lake', group: 'Frost', values: { type: 'lake', frost: 0.55, feather: 0.8, crystals: 0.3, cracks: 0.35 } },
      { name: 'Cartoon snow', group: 'Stylized', values: { type: 'fresh', toon: 3, grain: 0, sparkle: 0.15, drift: 0.85, driftScale: 3, shading: 0.6, shadowTint: 0.75, shadowColor: '#7f9fe0', snowColor: '#f8fbff' } },
      { name: 'Toon ice', group: 'Stylized', values: { type: 'cracked', toon: 3, grain: 0, crackStyle: 'dark', crackColor: '#1f4a6e', crackWidth: 2.2, crackDetail: 0, crackScale: 3, iceColor: '#8fe0f5', deepColor: '#3a9ad0', bubbles: 0.3, bubbleSize: 1.6, sparkle: 0 } },
    ],
    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height), N = W * H, C = setup(p, W, H);
      makeFields(C, p);
      if (p.crystals > 0) drawCrystals(C, p);
      if (C.SCR) drawScratches(C, p);

      // --- pass 1: height, albedo, snow weight, dips, sparkle (per-feature helpers keep this loop small) ---
      const Hh = new Float32Array(N), R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N);
      const SW = new Float32Array(N), DP = new Float32Array(N), SP = new Float32Array(N);
      for (let y = 0, i = 0; y < H; y++) {
        const v = (y + 0.5) / H;
        for (let x = 0; x < W; x++, i++) pixel(C, p, (x + 0.5) / W, v, x, y, i, Hh, R, G, B, SW, DP, SP, height);
      }

      const img = ctx.createImageData(W, H), d = img.data;
      if (height) {
        for (let j = 0; j < N; j++) { const g = clamp(Hh[j]) * 255; d[j * 4] = d[j * 4 + 1] = d[j * 4 + 2] = g; d[j * 4 + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        return;
      }
      shadePass(C, p, d, Hh, R, G, B, SW, DP, SP);
      ctx.putImageData(img, 0, 0);
    },
  });

  /* ---------- render helpers (module level, so each one stays small and optimizable) ---------- */
  const fb = (C, u, v, px, py, oct, s) => U.fractal('perlin', u * px, v * py, px, py, oct, 0.5, 'fbm', C.seed + s);
  const qz = (C, t) => (C.toon > 0 ? Math.round(t * C.toon) / C.toon : t);
  // per-pixel scratch values (fixed shape, double fields)
  const O = { hs: 0.5, dip: 0.5, pack: 0.5, puddle: 0.5, sr: 0.5, sg: 0.5, sb: 0.5, hi: 0.5, ir: 0.5, ig: 0.5, ib: 0.5, core: 0.5, halo: 0.5 };

  /* Smooth noise fields are evaluated on a coarse periodic grid (about 8 samples per finest noise period,
     never more than the image) and sampled bilinearly with wrap-around: same look, far fewer noise calls. */
  const SPP = 8;
  function lowField(C, fmax, fn) {
    const gw = Math.min(C.W, Math.max(4, Math.ceil(fmax * SPP))), gh = Math.min(C.H, Math.max(4, Math.ceil(fmax * SPP * C.ar)));
    const g = new Float32Array(gw * gh);
    for (let y = 0, i = 0; y < gh; y++) { const v = (y + 0.5) / gh; for (let x = 0; x < gw; x++, i++) g[i] = fn((x + 0.5) / gw, v); }
    return { g, w: gw, h: gh };
  }
  function smp(F, u, v) {
    const w = F.w, h = F.h, g = F.g, fx = u * w - 0.5, fy = v * h - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const xa = x0 < 0 ? x0 + w : x0, xb = x0 + 1 >= w ? x0 + 1 - w : x0 + 1;
    const ya = (y0 < 0 ? y0 + h : y0) * w, yb = (y0 + 1 >= h ? y0 + 1 - h : y0 + 1) * w;
    const a = g[ya + xa] + (g[ya + xb] - g[ya + xa]) * tx, b = g[yb + xa] + (g[yb + xb] - g[yb + xa]) * tx;
    return a + (b - a) * ty;
  }
  function makeFields(C, p) {
    const snow = C.snowType || C.icyGround, ice = C.iceType, F = (fmax, fn) => lowField(C, fmax, fn), f = (u, v, px, py, oct, s) => fb(C, u, v, px, py, oct, s);
    C.fGrain = p.grain > 0 ? F(C.gX * 2, (u, v) => f(u, v, C.gX, C.gY, 2, 1)) : null;
    C.fDrift = snow && p.drift > 0 ? F(C.dX * (C.toon ? 4 : 16), (u, v) => f(u, v, C.dX, C.dY, C.toon ? 3 : 5, 2)) : null;
    C.fRipW = snow && p.ripples > 0 ? F(C.L8X, (u, v) => (f(u, v, C.L2X, C.L2Y, 2, 4) - 0.5) * 2.4 + (f(u, v, C.L8X, C.L8Y, 1, 5) - 0.5) * 0.5) : null;
    C.fRipM = snow && p.ripples > 0 ? F(C.L2X, (u, v) => f(u, v, C.L2X, C.L2Y, 1, 6)) : null;
    C.fPack = snow && p.packed > 0 ? F(C.pX * 4, (u, v) => f(u, v, C.pX, C.pY, 3, 7)) : null;
    C.fWet = snow && p.wet > 0 ? F(C.L4X * 4, (u, v) => f(u, v, C.L4X, C.L4Y, 3, 9)) : null;
    C.fCover = C.icyGround ? F(C.cv2X, (u, v) => f(u, v, C.cvX, C.cvY, 3, 12) + (f(u, v, C.cv2X, C.cv2Y, 1, 13) - 0.5) * 0.18) : null;
    C.fDn = ice ? F(C.L2X * 4, (u, v) => f(u, v, C.L2X, C.L2Y, 3, 20)) : null;
    C.fCn = ice ? F(C.L8X * 2, (u, v) => f(u, v, C.L8X, C.L8Y, 2, 21)) : null;
    C.fLay = ice && p.layers > 0 ? F(C.L8X, (u, v) => (f(u, v, C.L2X, C.L2Y, 2, 22) - 0.5) * 3 + (f(u, v, C.L8X, C.L8Y, 1, 23) - 0.5) * 0.3) : null;
    const cr = ice && p.cracks > 0;
    C.fCrWx = cr ? F(C.L4X, (u, v) => f(u, v, C.L4X, C.L4Y, 1, 24)) : null;
    C.fCrWy = cr ? F(C.L4X, (u, v) => f(u, v, C.L4X, C.L4Y, 1, 25)) : null;
    C.fCrM = cr ? F(C.L2X * 2, (u, v) => f(u, v, C.L2X, C.L2Y, 2, 26)) : null;
    C.fCrM2 = cr && p.crackDetail > 0 ? F(C.L4X * 2, (u, v) => f(u, v, C.L4X, C.L4Y, 2, 29)) : null;
    C.fFrost = p.frost > 0 ? F(C.cvX * 4, (u, v) => f(u, v, C.cvX, C.cvY, 3, 40)) : null;
    C.fFeather = p.frost > 0 && p.feather > 0 ? F(C.frX * 4, (u, v) => {
      const wx = ((f(u, v, C.L4X, C.L4Y, 1, 41) - 0.5) * 0.08) / C.sc;
      return U.fractal('perlin', (u + wx + 1) * C.frX, (v - wx + 1) * C.frY, C.frX, C.frY, 3, 0.55, 'ridged', C.seed + 42);
    }) : null;
    C.fDirt = p.dirt > 0 ? F(C.L4X * 4, (u, v) => f(u, v, C.L4X, C.L4Y, 3, 50)) : null;
  }

  function setup(p, W, H) {
    const S = Math.min(W, H), ar = H / W, sc = Math.max(1, p.scale | 0);
    const perX = (f) => Math.max(1, Math.round(f)) * sc, perY = (f) => Math.max(1, Math.round(f * sc * ar));
    const wa = (p.windDir * Math.PI) / 180, rc = Math.max(1, p.rippleCount) * sc;
    let kx = Math.round(rc * Math.cos(wa)), ky = Math.round(rc * Math.sin(wa) * ar); // integer wave vector: ripples tile
    if (!kx && !ky) kx = 1;
    const c1X = perX(p.crackScale), c2X = perX(p.crackScale * 3), bs = Math.max(2, Math.round(22 / p.bubbleSize));
    const iceType = !!ICY[p.type];
    return {
      W, H, S, k: S / 512, ar, sc, seed: p.seed | 0, toon: p.toon | 0,
      snowType: !!SNOWY[p.type], iceType, icyGround: p.type === 'icy',
      snowC: U.hex(p.snowColor), shadC: U.hex(p.shadowColor), iceC: U.hex(p.iceColor), deepC: U.hex(p.deepColor),
      crackC: U.hex(p.crackColor), dirtC: U.hex(p.dirtColor), darkCracks: p.crackStyle === 'dark',
      // noise periods (all integers -> tileable)
      dX: perX(p.driftScale), dY: perY(p.driftScale), gX: perX(48), gY: perY(48), pX: perX(3), pY: perY(3),
      ftX: perX(10), ftY: perY(5), cvX: perX(3), cvY: perY(3), cv2X: perX(24), cv2Y: perY(24),
      c1X, c1Y: perY(p.crackScale), c2X, c2Y: perY(p.crackScale * 3),
      bX: perX(bs), bY: perY(bs), b2X: perX(bs * 2.5), b2Y: perY(bs * 2.5),
      frX: perX(14), frY: perY(14), L4X: perX(4), L4Y: perY(4), L8X: perX(8), L8Y: perY(8), L2X: perX(2), L2Y: perY(2),
      LC: Math.max(1, p.layerCount | 0) * Math.max(1, Math.round(sc * ar)), kx, ky,
      // crack widths in lattice units (px @ 512, resolution independent)
      cw1: (p.crackWidth * 1.4 * c1X) / 512, cw2: (p.crackWidth * 0.9 * c2X) / 512,
      sgX: 170, sgY: Math.max(1, Math.round(170 * ar)),
      CR: p.crystals > 0 ? new Float32Array(W * H) : null,
      SCR: p.scratches > 0 && iceType ? new Float32Array(W * H) : null,
      fGrain: null, fDrift: null, fRipW: null, fRipM: null, fPack: null, fWet: null, fCover: null, fDn: null, fCn: null, fLay: null,
      fCrWx: null, fCrWy: null, fCrM: null, fCrM2: null, fFrost: null, fFeather: null, fDirt: null,
    };
  }

  /* ---------- wrapped splats (fern crystals, skate marks) ---------- */
  function stamp(C, buf, x, y, w, val) {
    const W = C.W, H = C.H, r = Math.ceil(w + 1), xi = Math.floor(x), yi = Math.floor(y);
    for (let j = -r; j <= r; j++) {
      const yy = ((yi + j) % H + H) % H, dy = yi + j + 0.5 - y;
      for (let i = -r; i <= r; i++) {
        const dx = xi + i + 0.5 - x, a = val * clamp(w + 0.5 - Math.sqrt(dx * dx + dy * dy));
        if (a > 0) { const idx = yy * W + (((xi + i) % W + W) % W); if (a > buf[idx]) buf[idx] = a; }
      }
    }
  }
  function line(C, buf, x0, y0, x1, y1, w0, w1, val) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.6));
    for (let i = 0; i <= n; i++) { const t = i / n; stamp(C, buf, lerp(x0, x1, t), lerp(y0, y1, t), lerp(w0, w1, t), val); }
  }
  function drawCrystals(C, p) {
    const r = U.rng(C.seed + 501), count = Math.round(4 + p.crystals * 26) * C.sc * C.sc;
    const seg = 0.012 / C.sc, W = C.W, H = C.H, k = C.k, ar = C.ar; // texture units per growth step
    const grow = (x, y, ang, len, width, depth, val) => {
      const n = Math.max(1, Math.round(len / seg));
      for (let i = 0; i < n; i++) {
        ang += (r() - 0.5) * 0.25;
        const nx = x + Math.cos(ang) * seg, ny = y + (Math.sin(ang) * seg) / ar;
        const w0 = width * (1 - (i / n) * 0.7), w1 = width * (1 - ((i + 1) / n) * 0.7);
        line(C, C.CR, x * W, y * H, nx * W, ny * H, w0 * k, w1 * k, val);
        x = nx; y = ny;
        // fern: a pair of side branches every second step, shorter toward the tip
        if (depth < 2 && i > 0 && i % 2 === 0 && i < n - 1) {
          const bl = (n - i) * seg * (0.45 + r() * 0.25), spread = 0.85 + r() * 0.35;
          grow(x, y, ang + spread, bl, w0 * 0.65, depth + 1, val * 0.9);
          grow(x, y, ang - spread, bl * (0.8 + r() * 0.3), w0 * 0.65, depth + 1, val * 0.9);
        }
      }
    };
    for (let c = 0; c < count; c++) {
      const x = r(), y = r(), ang = r() * U.TAU, len = ((0.06 + r() * 0.12) * p.crystalSize) / C.sc;
      grow(x, y, ang, len, 1.3 + r(), 0, 0.65 + r() * 0.35);
    }
  }
  function drawScratches(C, p) {
    const r = U.rng(C.seed + 601), count = Math.round(p.scratches * 34) * C.sc, S = C.S, k = C.k;
    for (let c = 0; c < count; c++) {
      const R = (S * (0.25 + r() * 1.1)) / C.sc, cx = r() * C.W, cy = r() * C.H, a0 = r() * U.TAU;
      const span = ((S * (0.15 + r() * 0.5)) / C.sc) / R, w = (0.35 + r() * 0.7) * k, val = 0.3 + r() * 0.7;
      const pair = r() < 0.35, steps = Math.max(2, Math.ceil((span * R) / 3));
      for (const off of pair ? [0, 2.2 * k] : [0]) { // skates leave pairs of parallel marks
        let px0 = cx + Math.cos(a0) * (R + off), py0 = cy + Math.sin(a0) * (R + off);
        for (let i = 1; i <= steps; i++) {
          const a = a0 + (span * i) / steps, f = Math.sin((Math.PI * i) / steps); // fade in / out
          const px1 = cx + Math.cos(a) * (R + off), py1 = cy + Math.sin(a) * (R + off), ww = w * (0.4 + 0.6 * f);
          line(C, C.SCR, px0, py0, px1, py1, ww, ww, val * (0.3 + 0.7 * f));
          px0 = px1; py0 = py1;
        }
      }
    }
  }

  /* ---------- snow: writes O.hs (height), O.dip, O.pack, O.puddle, O.sr/sg/sb (albedo) ---------- */
  function snowAt(C, p, u, v, gn, gr) {
    let hs = 0.5, dip = 0, pack = 0, puddle = 0;
    if (p.drift > 0) {
      const d = smp(C.fDrift, u, v);
      hs += (d - 0.5) * p.drift * 1.1; dip = clamp((0.5 - d) * 2.5 * p.drift + 0.2 * p.drift);
    }
    if (p.ripples > 0) {
      // sastrugi: warped wave along the wind, gentle windward slope, sharp crest, steep drop; broken up by a mask
      const w = smp(C.fRipW, u, v);
      const ph = u * C.kx + v * C.ky + w, t = ph - Math.floor(ph);
      const prof = t < 0.72 ? smoothstep(0, 0.72, t) : 1 - smoothstep(0.72, 1, t);
      const m = smoothstep(0.3, 0.6, smp(C.fRipM, u, v)) * p.ripples;
      hs += (prof - 0.5) * m * 0.22; dip = Math.max(dip, (1 - prof) * m * 0.5);
    }
    if (p.packed > 0) {
      pack = smoothstep(0.62 - p.packed * 0.45, 0.68 - p.packed * 0.42, smp(C.fPack, u, v));
      if (pack > 0) {
        hs = lerp(hs, 0.42 + (hs - 0.5) * 0.25, pack);
        const c = U.worley(u * C.ftX, v * C.ftY, C.ftX, C.ftY, C.seed + 8); // elongated trodden dents
        if (c.id < 0.5) { const dent = (1 - smoothstep(0.12, 0.38, c.f1)) * pack * (0.4 + 1.2 * c.id); hs -= dent * 0.05; dip = Math.max(dip, dent * 0.3); }
      }
    }
    hs += gn * 0.06;
    const sn = C.snowC, ice = C.iceC;
    let r = sn[0], g = sn[1], b = sn[2];
    if (pack > 0) { const t = pack * 0.55; r = lerp(r, ice[0] * 0.9, t); g = lerp(g, ice[1] * 0.9, t); b = lerp(b, ice[2] * 0.9, t); } // greyer, slightly icy
    if (p.wet > 0) {
      const f = 1 - p.wet * 0.18, dc = C.dirtC, dp = C.deepC; r *= f; g *= f; b *= f * 1.02;
      const n = smp(C.fWet, u, v);
      puddle = smoothstep(0.7 - p.wet * 0.14, 0.73 - p.wet * 0.14, n);
      if (puddle > 0) {
        hs = lerp(hs, 0.34, puddle);
        r = lerp(r, lerp(dc[0], dp[0], 0.5) * 0.8, puddle); g = lerp(g, lerp(dc[1], dp[1], 0.5) * 0.8, puddle); b = lerp(b, lerp(dc[2], dp[2], 0.5) * 0.8, puddle);
      }
      const t = smoothstep(0.56 - p.wet * 0.14, 0.7 - p.wet * 0.14, n) * (1 - puddle) * 0.45; // soaked slush around the puddles
      r = lerp(r, (dc[0] + r) * 0.6, t); g = lerp(g, (dc[1] + g) * 0.6, t); b = lerp(b, (dc[2] + b) * 0.6, t);
    }
    const gf = 1 + gr * 0.05;
    O.hs = hs; O.dip = dip; O.pack = pack; O.puddle = puddle; O.sr = r * gf; O.sg = g * gf; O.sb = b * gf;
  }

  /* ---------- ice: writes O.hi (height), O.ir/ig/ib (color) ---------- */
  // (lattice coordinates are shifted by one whole period to stay positive: same result, keeps the noise code on its fast integer path)
  function cracksAt(C, p, u, v, cn) {
    const sc = C.sc;
    const wx = ((smp(C.fCrWx, u, v) - 0.5) * 0.18) / sc, wy = ((smp(C.fCrWy, u, v) - 0.5) * 0.18) / sc;
    const mask = smoothstep(0.8 - p.cracks * 0.8, 0.88 - p.cracks * 0.72, smp(C.fCrM, u, v));
    let core = 0, halo = 0;
    if (mask > 0) {
      const c = U.worley((u + wx + 1) * C.c1X, (v + wy + 1) * C.c1Y, C.c1X, C.c1Y, C.seed + 27), e = c.f2 - c.f1;
      const wv = C.cw1 * (0.6 + 0.8 * cn);
      core = (1 - smoothstep(wv * 0.5, wv, e)) * mask;
      halo = (1 - smoothstep(wv, wv * 7, e)) * mask;
    }
    if (p.crackDetail > 0) {
      const m2 = smoothstep(0.85 - p.crackDetail * 0.6, 0.95 - p.crackDetail * 0.55, smp(C.fCrM2, u, v)) * Math.max(mask, 0.35);
      if (m2 > 0) {
        const c = U.worley((u + wx * 0.6 + 1) * C.c2X, (v + wy * 0.6 + 1) * C.c2Y, C.c2X, C.c2Y, C.seed + 31), e = c.f2 - c.f1;
        core = Math.max(core, (1 - smoothstep(C.cw2 * 0.5, C.cw2, e)) * m2 * 0.8);
        halo = Math.max(halo, (1 - smoothstep(C.cw2, C.cw2 * 5, e)) * m2 * 0.6);
      }
    }
    O.core = core; O.halo = halo;
  }
  function bubbleAt(C, p, u, v, L) {
    const px = L ? C.b2X : C.bX, py = L ? C.b2Y : C.bY, c = U.worley(u * px, v * py, px, py, C.seed + 30 + L);
    if (c.id >= p.bubbles * (L ? 0.5 : 0.7)) return 0;
    const id = Math.floor(c.id * 1e6), rad = 0.1 + hash(id, 1, C.seed) * 0.25;
    if (c.f1 >= rad) return 0;
    const disc = 1 - smoothstep(rad * 0.8, rad, c.f1), rim = smoothstep(rad * 0.45, rad * 0.85, c.f1) * disc;
    const a = 0.35 + 0.65 * hash(id, 2, C.seed); // deeper bubbles are fainter
    return C.toon ? disc * 0.75 * a : (disc * 0.22 + rim * 0.55) * a * 0.85;
  }
  function iceAt(C, p, u, v, i, gn, s) {
    const dn = smp(C.fDn, u, v), cn = smp(C.fCn, u, v), ic = C.iceC, dp = C.deepC, sn = C.snowC;
    let hi = 0.4 + (dn - 0.5) * 0.04 + gn * 0.01;
    const t = qz(C, clamp(0.5 + (dn - 0.5) * 2.4) * p.depth);
    let r = lerp(ic[0], dp[0], t), g = lerp(ic[1], dp[1], t), b = lerp(ic[2], dp[2], t);
    if (!C.toon) { const cl = smoothstep(0.58, 0.85, cn) * 0.14; r = lerp(r, sn[0], cl); g = lerp(g, sn[1], cl); b = lerp(b, sn[2], cl); } // cloudy inclusions
    if (p.layers > 0) {
      // compressed bands: warped rows, each with its own brightness; band index wraps so it tiles
      const LC = C.LC, ph = v * LC + smp(C.fLay, u, v);
      const b0 = Math.floor(ph), f = ph - b0, m0 = ((b0 % LC) + LC) % LC, m1 = (m0 + 1) % LC;
      const lb = qz(C, lerp(hash(m0, 7, C.seed), hash(m1, 7, C.seed), smoothstep(0.82, 1, f)));
      const dk = (1 - lb) * p.layers * 0.75, wh = smoothstep(0.72, 0.95, lb) * p.layers * 0.55;
      r = lerp(r, dp[0], dk); g = lerp(g, dp[1], dk); b = lerp(b, dp[2], dk);
      r = lerp(r, sn[0], wh); g = lerp(g, sn[1], wh); b = lerp(b, sn[2], wh);
      hi += (lb - 0.5) * p.layers * 0.05;
    }
    if (p.bubbles > 0) {
      const w = Math.max(bubbleAt(C, p, u, v, 0), bubbleAt(C, p, u, v, 1));
      if (w > 0) { r = lerp(r, sn[0], w); g = lerp(g, sn[1], w); b = lerp(b, sn[2], w); }
    }
    if (p.cracks > 0) {
      cracksAt(C, p, u, v, cn);
      const core = O.core, halo = O.halo;
      if (core > 0 || halo > 0) {
        let a;
        if (C.darkCracks) a = C.toon ? (core > 0.4 ? 1 : 0) : core;
        else a = C.toon ? (core > 0.4 ? 1 : halo > 0.5 ? 0.45 : 0) : Math.min(1, core * 0.9 + halo * halo * 0.35); // white planes with a frosty glow
        const cc = C.crackC;
        r = lerp(r, cc[0], a); g = lerp(g, cc[1], a); b = lerp(b, cc[2], a);
        hi -= core * 0.25;
      }
    }
    if (C.SCR) {
      const sv = C.SCR[i] * (1 - s);
      if (sv > 0) { const a = sv * 0.65; r = lerp(r, sn[0], a); g = lerp(g, sn[1], a); b = lerp(b, sn[2], a); hi -= sv * 0.06; }
    }
    O.hi = hi; O.ir = r; O.ig = g; O.ib = b;
  }

  /* ---------- frost amount 0..1 (noise-masked, feathery ridged structure) ---------- */
  function frostAt(C, p, u, v) {
    const fm = smoothstep(0.78 - p.frost * 0.8, 0.86 - p.frost * 0.74, smp(C.fFrost, u, v));
    if (fm <= 0) return 0;
    let tex = 1;
    if (C.fFeather) tex = 1 - p.feather + p.feather * smoothstep(0.3, 0.85, smp(C.fFeather, u, v));
    return fm * (0.35 + 0.65 * tex);
  }

  function sparkleAt(C, p, u, v, amt) {
    const cx = Math.floor(u * C.sgX), cy = Math.floor(v * C.sgY), hh = hash(cx, cy, C.seed + 77), th = p.sparkle * 0.22 * amt;
    if (hh >= th) return 0;
    // one possible speck per cell of a fixed grid, at a random spot inside the cell (never cut by the cell edge)
    const ox = (u * C.sgX - cx - 0.25 - 0.5 * hash(cx, cy, C.seed + 78)) * (C.W / C.sgX), oy = (v * C.sgY - cy - 0.25 - 0.5 * hash(cx, cy, C.seed + 79)) * (C.H / C.sgY);
    const rad = (0.6 + hh / th) * Math.max(0.8, C.k * 0.9);
    return clamp(1 - Math.sqrt(ox * ox + oy * oy) / rad);
  }

  function pixel(C, p, u, v, x, y, i, Hh, R, G, B, SW, DP, SP, height) {
    let s = C.snowType ? 1 : 0;
    if (C.icyGround) {
      const th = 1 - p.cover, n = smp(C.fCover, u, v);
      s = smoothstep(th - 0.025, th + 0.025, n);
    }
    // fine grain: noise (height + color) and per-pixel speckle (color only)
    let gn = 0, gr = 0;
    if (p.grain > 0) { gn = (smp(C.fGrain, u, v) - 0.5) * p.grain; gr = gn + (hash(x, y, C.seed + 3) - 0.5) * 0.35 * p.grain; }
    let hs = 0.5, dip = 0, pack = 0, puddle = 0, sr = 0, sg = 0, sb = 0, hi = 0.4, ir = 0, ig = 0, ib = 0;
    if (s > 0) { snowAt(C, p, u, v, gn, gr); hs = O.hs; dip = O.dip; pack = O.pack; puddle = O.puddle; sr = O.sr; sg = O.sg; sb = O.sb; }
    if (s < 1) { iceAt(C, p, u, v, i, gn, s); hi = O.hi; ir = O.ir; ig = O.ig; ib = O.ib; }

    // snow over ice (snow patches sit higher)
    let h = C.snowType ? hs : lerp(hi, hs + 0.12, s);
    let r = lerp(ir, sr, s), g = lerp(ig, sg, s), b = lerp(ib, sb, s);

    let fv = p.frost > 0 ? frostAt(C, p, u, v) : 0;
    if (C.CR) fv = Math.max(fv, C.CR[i]);
    if (fv > 0) {
      const a = fv * 0.92, sn = C.snowC;
      r = lerp(r, sn[0], a); g = lerp(g, sn[1], a); b = lerp(b, sn[2], a);
      h += fv * 0.1 * (1 - s * 0.5);
    }
    if (p.dirt > 0) { // dirt / ground, collecting in the dips and trodden areas
      const n = smp(C.fDirt, u, v) + (dip - 0.3) * 0.25 + pack * 0.12 + (1 - s) * 0.05;
      const dm = smoothstep(0.78 - p.dirt * 0.62, 0.98 - p.dirt * 0.55, n) * (1 - fv * 0.7);
      if (dm > 0) {
        const a = C.toon ? (dm > 0.5 ? 0.85 : 0) : dm * 0.85, tn = 0.85 + gr * 0.6, dc = C.dirtC;
        r = lerp(r, dc[0] * tn, a); g = lerp(g, dc[1] * tn, a); b = lerp(b, dc[2] * tn, a);
        h -= dm * 0.03;
      }
    }
    Hh[i] = h;
    if (height) return;
    R[i] = r; G[i] = g; B[i] = b;
    SW[i] = Math.max(s * (1 - puddle * 0.8), fv * 0.7, 0.35);
    DP[i] = dip * s * (1 - puddle);
    if (p.sparkle > 0) SP[i] = sparkleAt(C, p, u, v, Math.max(s * (1 - pack * 0.7) * (1 - puddle) * (1 - p.wet * 0.7), fv * 0.8, (1 - s) * 0.25));
  }

  /* ---------- pass 2: light from the (wrapped) height gradient, blue shadows, sparkle ---------- */
  function shadePass(C, p, d, Hh, R, G, B, SW, DP, SP) {
    const W = C.W, H = C.H, toon = C.toon, bump = 0.045 * W, sh = p.shading, tint = p.shadowTint;
    const sR = C.shadC[0] / 255, sG = C.shadC[1] / 255, sB = C.shadC[2] / 255;
    for (let y = 0, i = 0; y < H; y++) {
      const yu = ((y + H - 1) % H) * W, yd = ((y + 1) % H) * W, yr = y * W;
      for (let x = 0; x < W; x++, i++) {
        const xl = (x + W - 1) % W, xr = (x + 1) % W;
        const nx = -(Hh[yr + xr] - Hh[yr + xl]) * 0.5 * bump, ny = -(Hh[yd + x] - Hh[yu + x]) * 0.5 * bump;
        let ratio = (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) / Math.sqrt(nx * nx + ny * ny + 1) / LIGHT[2]; // 1 = flat
        if (toon) ratio = 1 + Math.round((ratio - 1) * toon * 1.5) / (toon * 1.5);
        const w = SW[i], shade = Math.max(0.35, 1 + (ratio - 1) * sh * w);
        let r = R[i], g = G[i], b = B[i];
        if (tint > 0) {
          let tt = clamp(DP[i] * 0.9 + (1 - ratio) * 1.4 * w) * tint * Math.min(1, w * 1.5);
          if (toon) tt = Math.round(tt * toon) / toon;
          if (tt > 0) { r *= lerp(1, sR, tt); g *= lerp(1, sG, tt); b *= lerp(1, sB, tt); }
        }
        r *= shade; g *= shade; b *= shade;
        const spv = SP[i];
        if (spv > 0) { const a = spv * (0.45 + 0.55 * clamp(ratio)); r = lerp(r, 255, a); g = lerp(g, 255, a); b = lerp(b, 255, a); }
        const o = i * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
  }
})();
