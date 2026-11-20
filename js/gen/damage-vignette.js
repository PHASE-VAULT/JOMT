/* Damage vignette: screen-space "you are hurt" overlays (transparent PNG), built from a stack of layers
   (bottom → top): vignettes with organic edge breakup, veins, cracks, blood splatter, droplets, drips from
   the top edge and flat tints / flashes. Each layer has its own colors, opacity and blend mode.
   Everything is placed in short-side units and the noise / blood fields are sampled on a fixed grid,
   so the preview and every export size look the same.
   "Damage progress" (0..1) grows every layer between its own start and end (defaults per type: veins
   race in early, the vignette creeps in from the edges over the whole range, drips run down late, splatter
   blobs and droplets land one after another). The frame sequence export bakes N aligned PNGs along that
   progress, to flip through in the engine (frame 1 = first damage … last frame = full damage). */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep } = U;
  const TAU = Math.PI * 2;
  const tr = (s) => (U.t ? U.t(s) : s);

  const SHAPES = [['ellipse', 'Ellipse (fits aspect)'], ['rect', 'Rounded rectangle'], ['sides', 'Per side']];
  const TYPES = [['vignette', 'Vignette'], ['veins', 'Veins'], ['cracks', 'Cracks'], ['splatter', 'Splatter'], ['droplets', 'Droplets'], ['drips', 'Drips from top'], ['tint', 'Solid tint / flash']];
  const TYPE_NAME = Object.fromEntries(TYPES);
  const BLENDS = [['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['add', 'Add']];
  const BREAK = [['blotchy', 'Blotchy'], ['tendrils', 'Tendrils (reaching in)'], ['crystals', 'Crystals (faceted)'], ['flames', 'Flames (rising)']];
  const isSides = (p) => p.shape === 'sides';
  const is = (...t) => (l) => t.includes(l.type);
  const EDGE = ['vignette', 'veins', 'cracks'], BLOOD = ['splatter', 'droplets', 'drips'];
  // default growth window per layer type: [starts growing, fully grown] along the damage progress
  const AUTO_TIME = { vignette: [0, 1], veins: [0, 0.45], cracks: [0.05, 0.55], splatter: [0.1, 0.75], droplets: [0, 0.65], drips: [0.35, 1], tint: [0, 0.3] };
  const TIME = (type) => ({ tStart: AUTO_TIME[type][0], tEnd: AUTO_TIME[type][1] });
  const timeWindow = (l) => [Math.min(l.tStart, l.tEnd - 0.01), Math.max(l.tEnd, l.tStart + 0.01)];
  // progress of frame i of n: from `first` to full damage, spaced by `curve`
  const frameT = (p, i) => { const n = Math.max(2, p.frameCount | 0); return p.frameFirst + (1 - p.frameFirst) * Math.pow(i / (n - 1), p.frameCurve); };

  // smooth maximum (k = blend width) so per-side shapes get rounded corners
  const smax = (a, b, k) => { const h = a - b; return 0.5 * (a + b + Math.sqrt(h * h + k * k)); };

  /* layer helpers for the presets (list items only need what differs from the item defaults) */
  const V = (o) => Object.assign({ type: 'vignette' }, TIME('vignette'), o);
  const VEIN = (o) => Object.assign({ type: 'veins' }, TIME('veins'), { color: '#1a0000', reach: 0.7, opacity: 0.6 }, o);
  const CRACK = (o) => Object.assign({ type: 'cracks' }, TIME('cracks'), { color: '#1a0000', reach: 0.6, width: 0.3, opacity: 0.7 }, o);
  const BL = { color: '#9a0606', color2: '#3c0101', opacity: 0.92 };
  const SPL = (o) => Object.assign({ type: 'splatter' }, TIME('splatter'), { reach: 0.4, amount: 0.45 }, BL, o);
  const DROP = (o) => Object.assign({ type: 'droplets' }, TIME('droplets'), { reach: 0.4, amount: 0.4 }, BL, o);
  const DRIP = (o) => Object.assign({ type: 'drips' }, TIME('drips'), { amount: 0.17, length: 0.4 }, BL, o);
  const TINT = (o) => Object.assign({ type: 'tint' }, TIME('tint'), { color: '#ff0000', opacity: 0.15 }, o);

  const LAYER_DEFS = [
    { key: 'on', label: 'Visible', type: 'bool', default: true },
    { key: 'type', label: 'Type', type: 'select', default: 'vignette', options: TYPES, apply: (v, l) => Object.assign(l, TIME(v)), tip: 'Changing the type also resets Start / End to the default timing of that type' },
    { key: 'blend', label: 'Blend', type: 'select', default: 'normal', options: BLENDS },
    { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.9 },
    { key: 'tStart', label: 'Start (damage progress)', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Damage progress at which this layer starts to grow (0 = right away)' },
    { key: 'tEnd', label: 'End (damage progress)', type: 'range', min: 0, max: 1, step: 0.01, default: 1, tip: 'Damage progress at which this layer is fully grown. Defaults per type: veins 0 → 0.45, cracks 0.05 → 0.55, droplets 0 → 0.65, splatter 0.1 → 0.75, vignette 0 → 1, drips 0.35 → 1, tint 0 → 0.3' },
    { key: 'shape', label: 'Shape', type: 'select', default: 'global', options: [['global', 'Global shape']].concat(SHAPES), show: is(...EDGE) },
    { key: 'reach', label: 'Reach', type: 'range', min: 0.02, max: 1.5, step: 0.01, default: 0.5, show: (l) => l.type !== 'tint' && l.type !== 'drips', tip: 'How far the layer reaches in from the screen edge' },
    { key: 'softness', label: 'Softness', type: 'range', min: 0.02, max: 1, step: 0.01, default: 0.85, show: is('vignette'), tip: 'Width of the fade (fraction of the reach); low = hard inner edge' },
    { key: 'falloff', label: 'Falloff curve', type: 'range', min: 0.3, max: 4, step: 0.01, default: 1.6, show: is('vignette'), tip: '< 1 fills in early and softly, > 1 keeps the effect tight to the edge' },
    { key: 'amount', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: is(...BLOOD), tip: 'Number of blobs / droplets / drips' },
    { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 2.5, step: 0.01, default: 1, show: is(...BLOOD) },
    { key: 'length', label: 'Drip length', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.4, show: is('drips') },
    { key: 'scale', label: 'Scale', type: 'range', min: 1, max: 20, step: 0.1, default: 5, show: is('veins', 'cracks'), tip: 'Line features across the short side' },
    { key: 'width', label: 'Line width', type: 'range', min: 0.01, max: 1, step: 0.01, default: 0.35, show: is('veins', 'cracks') },

    { type: 'section', label: 'Color' },
    { key: 'color', label: 'Color (inner)', type: 'color', default: '#c40c0c', tip: 'Vignette: color at its inner edge. Blood: color of thin parts' },
    { key: 'color2', label: 'Outer / thick color', type: 'color', default: '#2a0000', show: is('vignette', ...BLOOD), tip: 'Vignette: color at the screen edge. Blood: color where it is thickest' },
    { key: 'colorBias', label: 'Color bias', type: 'range', min: 0.2, max: 4, step: 0.01, default: 1, show: is('vignette'), tip: '< 1 reaches the outer color early, > 1 keeps more of the inner color' },

    { type: 'section', label: 'Edge breakup', show: is('vignette'), active: (l) => l.breakup > 0 },
    { key: 'breakStyle', label: 'Style', type: 'select', default: 'blotchy', options: BREAK, show: is('vignette') },
    { key: 'breakup', label: 'Breakup', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: is('vignette'), tip: 'Distorts the inner edge with noise for an organic look' },
    { key: 'breakScale', label: 'Breakup scale', type: 'range', min: 1, max: 20, step: 0.1, default: 4, show: (l) => l.type === 'vignette' && l.breakup > 0, tip: 'Noise features across the short side' },
    { key: 'seed', label: 'Seed offset', type: 'seed', default: 0, show: (l) => l.type !== 'tint' },

  ];

  const DEFAULT_LAYERS = [V({ opacity: 0.9 }), SPL({}), DROP({})];

  U.register({
    id: 'damage-vignette',
    name: 'Damage Vignette',
    desc: 'Screen overlays for player damage: blood vignettes, veins, cracks, drips and tints with a progress sequence',
    uses: ['Full-screen HUD overlays that show player damage in shooters and horror games, faded in or played as a frame sequence as health drops.', 'Status-effect screens such as poison, burning or freezing overlays.'],
    tags: ['Horror', 'VFX', 'Shooter'],
    aspect: '16:9',
    normalMap: false, // a screen overlay, not a surface
    icon: U.icon('<rect x="3" y="4.5" width="18" height="15" rx="2"/><path d="M3.5 10c2.5 0 3.5-2 4-5.5M20.5 14c-2.5 0-3.5 2-4 5.5" opacity=".6"/><path d="M11 4.5v4M14.5 4.5v2.2"/><circle cx="11" cy="9.6" r=".9"/>'),
    // frame sequence: one PNG per frame, numbered _f00, _f01 … in progress order
    exportLayers: (p) => (p.frames ? Array.from({ length: Math.max(2, p.frameCount | 0) }, (_, i) => ({ id: 'frame' + i, suffix: 'f' + String(i).padStart(2, '0') })) : null),
    params: [
      { type: 'section', label: 'Damage' },
      { key: 'pulse', label: 'Damage progress', type: 'range', min: 0, max: 1, step: 0.01, default: 1, tip: 'Grows every layer between its own Start and End (set per layer). 1 = full damage. The frame sequence export ignores this and bakes the whole progression' },
      { key: 'opacity', label: 'Master opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Global shape' },
      { key: 'shape', label: 'Shape', type: 'select', default: 'ellipse', options: SHAPES, tip: 'Used by every layer set to "Global shape"; blood follows the per-side amounts' },
      { key: 'roundness', label: 'Corner roundness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'For rounded-rectangle shapes' },
      { key: 'top', label: 'Top', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: isSides },
      { key: 'bottom', label: 'Bottom', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: isSides },
      { key: 'left', label: 'Left', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: isSides },
      { key: 'right', label: 'Right', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: isSides },

      { type: 'section', label: 'Layers (bottom → top)' },
      {
        key: 'layers', label: 'Layers', type: 'list', itemLabel: 'Layer', max: 12,
        itemSummary: (l) => `${l.on === false ? '(hidden) ' : ''}${tr(TYPE_NAME[l.type] || l.type)} · ${l.blend} · ${Math.round(l.opacity * 100)}% · ${(+(l.tStart ?? 0)).toFixed(2)}→${(+(l.tEnd ?? 1)).toFixed(2)}`,
        default: U.clone ? U.clone(DEFAULT_LAYERS) : JSON.parse(JSON.stringify(DEFAULT_LAYERS)),
        item: LAYER_DEFS,
      },

      { type: 'section', label: 'Output' },
      { key: 'dither', label: 'Dither (no banding)', type: 'bool', default: true },
      { key: 'frames', label: 'Export frame sequence', type: 'bool', default: false, tip: 'Download N aligned PNGs (_f00, _f01 …) from first damage to full damage, to flip through in the engine' },
      { key: 'frameCount', label: 'Frames', type: 'int', min: 2, max: 64, default: 16, show: (p) => p.frames },
      { key: 'frameFirst', label: 'First frame progress', type: 'range', min: 0, max: 0.9, step: 0.01, default: 0.05, show: (p) => p.frames, tip: 'Damage progress of the first frame (0 = empty frame); the last frame is always full damage' },
      { key: 'frameCurve', label: 'Frame spacing', type: 'range', min: 0.3, max: 3, step: 0.01, default: 1, show: (p) => p.frames, tip: '1 = even steps; > 1 = more frames early in the progression (fine detail as the damage starts), < 1 = more frames near full damage' },
      { key: 'previewFrame', label: 'Preview frame', type: 'int', min: 0, max: 64, default: 0, show: (p) => p.frames, tip: 'Preview only: 0 = use Damage progress, otherwise shows that frame of the sequence' },
    ],
    presets: [
      // Realistic
      { name: 'Bleeding', group: 'Realistic', values: { seed: 12, layers: [V({ reach: 0.55, breakup: 0.55 }), VEIN({ reach: 0.77, width: 0.3, opacity: 0.32 }), SPL({ amount: 0.55, reach: 0.44 }), DROP({ amount: 0.5, reach: 0.44 }), DRIP({ amount: 0.17, length: 0.3 })] } },
      { name: 'Light hit (graze)', group: 'Realistic', values: { seed: 3, layers: [V({ reach: 0.32, softness: 1, falloff: 2.2, opacity: 0.75, breakup: 0.35 }), SPL({ amount: 0.15, size: 0.7, reach: 0.12 }), DROP({ amount: 0.25, size: 0.7, reach: 0.12 })] } },
      { name: 'Heavy damage', group: 'Realistic', values: { seed: 31, layers: [V({ reach: 0.75, falloff: 1.2, breakup: 0.65, breakScale: 3.5 }), VEIN({ reach: 1.2, opacity: 0.5 }), SPL({ amount: 0.9, size: 1.3, reach: 0.95 }), DROP({ amount: 0.7, size: 1.3, reach: 0.95 }), DRIP({ amount: 0.34, size: 1.3, length: 0.5 })] } },
      { name: 'Blood running down', group: 'Realistic', values: { seed: 44, shape: 'sides', top: 1, bottom: 0.5, left: 0.6, right: 0.6, layers: [V({ reach: 0.4, breakup: 0.4 }), SPL({ amount: 0.3, size: 1.1, reach: 0.2 }), DROP({ amount: 0.3, size: 1.1, reach: 0.2 }), DRIP({ amount: 0.67, size: 1.1, length: 0.75 })] } },
      { name: 'Low health (dark pulse)', group: 'Realistic', values: { seed: 9, layers: [V({ reach: 0.6, softness: 1, falloff: 1.3, color: '#7a0000', color2: '#0a0000', breakup: 0.3, breakScale: 3 }), VEIN({ reach: 0.9, color: '#050000', scale: 4, width: 0.35, opacity: 0.65 })] } },
      { name: 'Near death (black)', group: 'Realistic', values: { seed: 5, shape: 'rect', roundness: 1, layers: [V({ reach: 0.85, softness: 1, falloff: 1.1, opacity: 0.97, color: '#2a2424', color2: '#000000', colorBias: 0.6, breakup: 0.5, breakScale: 2.5 }), VEIN({ reach: 1.27, color: '#000000', scale: 3.5, opacity: 0.6 })] } },
      // Stylized
      { name: 'Arcade hit flash', group: 'Stylized', values: { shape: 'rect', roundness: 0.8, layers: [TINT({ color: '#ff2020', opacity: 0.12 }), V({ reach: 0.38, softness: 0.9, falloff: 1.4, color: '#ff1a1a', color2: '#b00000', opacity: 0.8, breakup: 0 })] } },
      { name: 'Comic splat frame', group: 'Stylized', values: { seed: 21, shape: 'rect', roundness: 0.4, dither: false, layers: [V({ reach: 0.3, softness: 0.08, falloff: 1, color: '#d40d1a', color2: '#6a0008', breakup: 0.8, breakScale: 6 }), SPL({ amount: 0.8, size: 1.4, reach: 0.15, color: '#e0101e', color2: '#8a0010', opacity: 1 }), DROP({ amount: 0.6, size: 1.4, reach: 0.15, color: '#e0101e', color2: '#8a0010', opacity: 1 })] } },
      { name: 'Horror veins', group: 'Stylized', values: { seed: 66, layers: [V({ reach: 0.65, falloff: 1.8, color: '#5a0010', color2: '#120004', breakup: 0.55, breakStyle: 'tendrils', breakScale: 4 }), VEIN({ reach: 1.04, scale: 5, width: 0.55, color: '#220006', opacity: 0.9 }), SPL({ amount: 0.2, reach: 0.4 }), DROP({ amount: 0.2, reach: 0.4 })] } },
      { name: 'Cracked visor', group: 'Stylized', values: { seed: 14, shape: 'rect', roundness: 0.5, layers: [V({ reach: 0.45, softness: 1, falloff: 1.8, color: '#6a0000', color2: '#1a0000', breakup: 0.4 }), CRACK({ reach: 1.1, scale: 3, width: 0.25, color: '#f4f4f4', opacity: 0.95, blend: 'screen' }), SPL({ amount: 0.35, reach: 0.25 })] } },
      // Elemental
      { name: 'Poisoned', group: 'Elemental', values: { seed: 17, layers: [V({ reach: 0.6, color: '#7ad41e', color2: '#123a04', breakup: 0.6, breakScale: 5 }), VEIN({ reach: 0.96, color: '#0b2802', opacity: 0.55 }), SPL({ amount: 0.3, size: 0.8, reach: 0.45, color: '#8be02a', color2: '#2c6a08', opacity: 0.8 }), DROP({ amount: 0.5, size: 0.8, reach: 0.45, color: '#8be02a', color2: '#2c6a08', opacity: 0.8 }), DRIP({ amount: 0.13, size: 0.8, color: '#8be02a', color2: '#2c6a08', opacity: 0.8 })] } },
      { name: 'Burning', group: 'Elemental', values: { seed: 8, shape: 'sides', top: 0.5, bottom: 1, left: 0.75, right: 0.75, layers: [V({ reach: 0.65, softness: 0.6, falloff: 0.9, opacity: 1, color: '#ffb030', color2: '#8a1400', colorBias: 0.8, breakup: 0.9, breakStyle: 'flames', breakScale: 4 }), CRACK({ reach: 0.78, scale: 5, width: 0.25, color: '#2a0600', opacity: 0.5 }), DROP({ amount: 0.35, size: 0.6, reach: 0.6, color: '#ffd060', color2: '#ff7a10', opacity: 0.92, blend: 'screen' })] } },
      { name: 'Frozen', group: 'Elemental', values: { seed: 23, shape: 'rect', roundness: 0.7, layers: [V({ reach: 0.55, falloff: 1.4, opacity: 0.85, color: '#d8f2ff', color2: '#3a7fb8', breakup: 0.7, breakStyle: 'crystals', breakScale: 7 }), CRACK({ reach: 0.77, scale: 5, width: 0.35, color: '#ffffff', opacity: 0.8 })] } },
      { name: 'Electric / EMP', group: 'Elemental', values: { seed: 42, layers: [V({ reach: 0.5, falloff: 1.6, opacity: 0.85, color: '#38c8ff', color2: '#06103a', colorBias: 0.6, breakup: 0.5, breakStyle: 'tendrils', breakScale: 6 }), VEIN({ reach: 0.85, scale: 3, width: 0.12, color: '#e0fbff', opacity: 1, blend: 'screen' }), TINT({ color: '#40c0ff', opacity: 0.06, blend: 'screen' })] } },
      { name: 'Radiation', group: 'Elemental', values: { seed: 52, shape: 'rect', roundness: 1, layers: [V({ reach: 0.6, softness: 0.7, falloff: 1.2, opacity: 0.85, color: '#d8ff3a', color2: '#2a3a00', colorBias: 0.8, breakup: 0.55, breakStyle: 'crystals', breakScale: 10 }), DROP({ amount: 0.7, size: 0.5, reach: 0.75, color: '#eaff70', color2: '#9ad000', opacity: 0.9, blend: 'screen' })] } },
      // Engine-ready: frame sequences of the damage growing in
      { name: 'Creeping blood (16 frames)', group: 'Engine-ready', values: { seed: 12, frames: true, frameCount: 16, layers: [V({ reach: 0.75, falloff: 1.2, breakup: 0.65, breakScale: 3.5 }), VEIN({ reach: 1.1, opacity: 0.45 }), SPL({ amount: 0.7, size: 1.2, reach: 0.8 }), DROP({ amount: 0.5, reach: 0.8 }), DRIP({ amount: 0.25, length: 0.45 })] } },
      { name: 'Veins first, blood later (24 frames)', group: 'Engine-ready', values: { seed: 66, frames: true, frameCount: 24, frameCurve: 1.3, layers: [V({ reach: 0.65, falloff: 1.6, color: '#5a0010', color2: '#120004', breakup: 0.55, breakStyle: 'tendrils', tStart: 0.25, tEnd: 1 }), VEIN({ reach: 1.1, scale: 5, width: 0.5, color: '#220006', opacity: 0.85, tStart: 0, tEnd: 0.35 }), SPL({ amount: 0.5, reach: 0.5, tStart: 0.45, tEnd: 0.9 }), DROP({ amount: 0.4, reach: 0.5, tStart: 0.4, tEnd: 0.85 })] } },
      { name: 'Creeping frost (12 frames)', group: 'Engine-ready', values: { seed: 23, shape: 'rect', roundness: 0.7, frames: true, frameCount: 12, layers: [V({ reach: 0.8, falloff: 1.2, opacity: 0.9, color: '#d8f2ff', color2: '#3a7fb8', breakup: 0.75, breakStyle: 'crystals', breakScale: 7 }), CRACK({ reach: 1, scale: 5, width: 0.35, color: '#ffffff', opacity: 0.8 })] } },
    ],
    render(ctx, W, H, p, opts) {
      opts = opts || {};
      // damage progress: a frame of the sequence export, the preview frame, or the slider
      const fm = typeof opts.layer === 'string' && /^frame(\d+)$/.exec(opts.layer);
      const pf = opts.preview && p.frames && p.previewFrame > 0 ? Math.min(p.previewFrame, Math.max(2, p.frameCount | 0)) - 1 : -1;
      const pulse = fm ? frameT(p, +fm[1]) : pf >= 0 ? frameT(p, pf) : clamp(p.pulse);
      const S = Math.min(W, H), seed = p.seed | 0;
      const ax = W / S, ay = H / S; // half extents (short side spans -1..1)

      // list items only store what differs from the item defaults
      const LD = {};
      for (const d of LAYER_DEFS) if (d.key) LD[d.key] = d.default;
      const layers = (p.layers || []).map((l) => Object.assign({}, LD, l)).filter((l) => l.on !== false && l.opacity > 0);

      /* ---------- grid: everything sampled at ~400 nodes per short side ---------- */
      const st = Math.max(1, S / 400), gw = Math.ceil(W / st) + 2, gh = Math.ceil(H / st) + 2, N = gw * gh;
      const du = (2 * st) / S; // node spacing in metric units
      const uOf = (i) => (i * st * 2 - W) / S, vOf = (j) => (j * st * 2 - H) / S;

      /* ---------- shape metric r: 0 at the center (short axis), 1 at the screen edge ---------- */
      const Rr = p.roundness, sw = [p.left, p.right, p.top, p.bottom];
      const shapeR = (kind, u, v) => {
        if (kind === 'rect') {
          const qx = Math.abs(u) - (ax - Rr), qy = Math.abs(v) - (ay - Rr);
          return 1 + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - Rr;
        }
        if (kind === 'sides') {
          const rl = sw[0] > 0 ? 1 - (u + ax) / sw[0] : -9, rr = sw[1] > 0 ? 1 - (ax - u) / sw[1] : -9;
          const rt = sw[2] > 0 ? 1 - (v + ay) / sw[2] : -9, rb = sw[3] > 0 ? 1 - (ay - v) / sw[3] : -9;
          return smax(smax(rl, rr, 0.12), smax(rt, rb, 0.12), 0.25);
        }
        return Math.hypot(u / ax, v / ay);
      };
      const baseCache = {};
      const baseGrid = (kind) => {
        if (kind === 'global') kind = p.shape;
        if (baseCache[kind]) return baseCache[kind];
        const g = new Float32Array(N);
        for (let j = 0, o = 0; j < gh; j++) { const v = vOf(j); for (let i = 0; i < gw; i++, o++) g[o] = shapeR(kind, uOf(i), v); }
        return (baseCache[kind] = g);
      };

      // low-frequency fields on a half-resolution grid, upsampled bilinearly (only evaluated where `need`)
      const cw = (gw >> 1) + 2, ch = (gh >> 1) + 2;
      const half = (R, need, fn) => {
        const c = new Float32Array(cw * ch), out = new Float32Array(N);
        for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
          const r = R[Math.min(gh - 1, j * 2) * gw + Math.min(gw - 1, i * 2)];
          if (need(r)) c[j * cw + i] = fn(uOf(i * 2), vOf(j * 2), r);
        }
        for (let j = 0, o = 0; j < gh; j++) {
          const cj = j >> 1, ty = (j & 1) * 0.5;
          for (let i = 0; i < gw; i++, o++) {
            const k = cj * cw + (i >> 1), tx = (i & 1) * 0.5;
            const a = c[k] + (c[k + 1] - c[k]) * tx, b = c[k + cw] + (c[k + cw + 1] - c[k + cw]) * tx;
            out[o] = a + (b - a) * ty;
          }
        }
        return out;
      };

      /* ---------- breakup offset (0-centered, roughly -1..1) ---------- */
      const breakAt = (l, s, u, v, r) => {
        const bk = l.breakScale;
        switch (l.breakStyle) {
          case 'tendrils': {
            // ridged noise in polar coordinates (wraps around): long fingers pointing at the center
            const bP = Math.max(3, Math.round(bk * 3)), th = (Math.atan2(v, u) / TAU + 0.5) * bP;
            return (U.fractal('perlin', th, r * bk * 0.8, bP, 0, 4, 0.5, 'ridged', s + 11) - 0.45) * 2.2;
          }
          case 'crystals': {
            const id = U.worley(u * bk, v * bk, 0, 0, s + 13).id;
            return (id - 0.5) * 1.6 + (U.fractal('perlin', u * bk * 2, v * bk * 2, 0, 0, 2, 0.5, 'fbm', s + 14) - 0.5) * 0.8;
          }
          case 'flames': return (U.fractal('perlin', u * bk * 1.4, v * bk * 0.35, 0, 0, 4, 0.55, 'turbulence', s + 15) - 0.45) * 2.4;
          default: return (U.fractal('perlin', u * bk, v * bk, 0, 0, 4, 0.55, 'fbm', s + 11) - 0.5) * 2.4;
        }
      };

      /* ---------- veins / cracks: distance-like value, 0 on a line ---------- */
      const lineAt = (cracks, vk, s, u, v) => {
        const vw = vk * 0.7, wx = U.perlin(u * vw, v * vw, 0, 0, s + 31) * 0.7, wy = U.perlin(u * vw + 9.1, v * vw, 0, 0, s + 32) * 0.7;
        if (cracks) {
          const x = u * vk + wx * 0.4, y = v * vk + wy * 0.4;
          // (U.worley returns a shared object: read it before the next call)
          let w = U.worley(x, y, 0, 0, s + 33);
          const e1 = w.f2 - w.f1;
          w = U.worley(x * 2.3, y * 2.3, 0, 0, s + 34); // finer secondary cracks
          return Math.min(e1 * 0.5, (w.f2 - w.f1) * 0.8);
        }
        // capillaries: cell edges in polar coordinates, stretched toward the center so they creep inward as
        // long branching lines; a finer layer adds side branches. Angular units widen with the radius,
        // so the result is scaled by it to keep the line width on the long sides
        const vP = Math.max(4, Math.round(vk * 7));
        const rho = Math.hypot(u, v), x = (Math.atan2(v, u) / TAU + 0.5) * vP + wx * 0.5, y = rho * vk * 0.3 + wy * 0.5;
        let w = U.worley(x, y, vP, 0, s + 35);
        const e1 = w.f2 - w.f1;
        w = U.worley(x * 2, y * 2.2, vP * 2, 0, s + 36);
        return Math.min(e1 * 0.45, (w.f2 - w.f1) * 0.8) * clamp(rho / 1.2, 0.6, 1.8);
      };

      /* ---------- blood: metaballs splatted into a density grid ---------- */
      const K = 1 / 0.5625;
      const sideW = p.shape === 'sides' ? [p.left, p.right, p.top, p.bottom] : [1, 1, 1, 1];
      // g = growth of this layer (0..1). Blobs, droplets and drips each get a birth time from their own
      // random stream (the layout itself never changes with g) and swell in from there: a ball's weight
      // scales its density, so a young blob only shows its core and spreads as it fills up
      const bloodGrid = (l, s, g) => {
        const G = new Float32Array(N), rnd = U.rng(s * 7 + 3), born = U.rng(s * 13 + 5), bs = l.size;
        let wt = 1;
        const grow = (span, ramp) => { const b = born() * span; wt = g >= 1 ? 1 : smoothstep(b, b + ramp, g); return wt; };
        const ball = (bu, bv, r) => {
          if (wt <= 0) return;
          r = Math.max(r, du * 0.8);
          const R = 2 * r, R2 = R * R, ci = W / st / 2, cj = H / st / 2;
          const i0 = Math.max(0, Math.floor((bu - R) / du + ci)), i1 = Math.min(gw - 1, Math.ceil((bu + R) / du + ci));
          const j0 = Math.max(0, Math.floor((bv - R) / du + cj)), j1 = Math.min(gh - 1, Math.ceil((bv + R) / du + cj));
          for (let j = j0; j <= j1; j++) {
            const dv = vOf(j) - bv;
            for (let i = i0; i <= i1; i++) {
              const dd = uOf(i) - bu, q = 1 - (dd * dd + dv * dv) / R2;
              if (q > 0) G[j * gw + i] += K * q * q * wt;
            }
          }
        };
        // random point near an edge: side picked by length (× per-side amount), `depth` inward
        const lens = [2 * ay, 2 * ay, 2 * ax, 2 * ax].map((x, k) => x * sideW[k]);
        const tot = lens.reduce((a, b) => a + b, 0) || 1;
        const edgePt = (n) => {
          let t = rnd() * tot, k = 0;
          while (k < 3 && t > lens[k]) t -= lens[k++];
          const along = rnd() * 2 - 1;
          if (k === 0) return [-ax + n, along * ay, 0];
          if (k === 1) return [ax - n, along * ay, Math.PI];
          if (k === 2) return [along * ax, -ay + n, Math.PI / 2];
          return [along * ax, ay - n, -Math.PI / 2];
        };
        const spreadD = l.reach * 0.8 + 0.02;
        if (l.type === 'splatter') {
          // blobs: cluster of balls + short spikes + a few satellite drops
          const n = Math.round(l.amount * 22);
          for (let b = 0; b < n; b++) {
            const [cx, cy, inA] = edgePt(Math.pow(rnd(), 1.6) * spreadD - 0.03);
            const r = bs * 0.06 * (0.45 + rnd() * rnd() * 1.2);
            grow(0.6, 0.4); // blobs land one after another, then spread
            ball(cx, cy, r);
            for (let k = 0; k < 6; k++) { const a = rnd() * TAU, d = r * (0.4 + rnd() * 0.6); ball(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.35 + rnd() * 0.4)); }
            const spikes = 2 + Math.floor(rnd() * 5);
            for (let k = 0; k < spikes; k++) {
              const a = inA + (rnd() - 0.5) * 2.6, L = r * (1.2 + rnd() * 2.2), w0 = r * (0.18 + rnd() * 0.15);
              for (let q = 0; q <= 8; q++) { const t = q / 8, d = r * 0.6 + (L - r * 0.6) * t; ball(cx + Math.cos(a) * d, cy + Math.sin(a) * d, w0 * (1 - t * 0.7)); }
              if (rnd() < 0.6) { const d = L + w0 * (2 + rnd() * 3); ball(cx + Math.cos(a) * d, cy + Math.sin(a) * d, w0 * (0.6 + rnd() * 0.5)); }
            }
            for (let k = 0; k < 5; k++) { const a = inA + (rnd() - 0.5) * 3, d = r * (1.6 + rnd() * 2.5); ball(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r * (0.06 + rnd() * 0.12)); }
          }
        } else if (l.type === 'droplets') {
          const n = Math.round(l.amount * 260);
          for (let k = 0; k < n; k++) { const [x, y] = edgePt(Math.pow(rnd(), 1.3) * spreadD * 1.3); grow(0.8, 0.2); ball(x, y, bs * 0.011 * (0.35 + rnd() * rnd() * 1.6)); }
        } else {
          // drips from the top edge: a wobbling, slightly thinning trail with a bulb at the end
          const n = Math.round(l.amount * 24);
          for (let k = 0; k < n; k++) {
            const x0 = (rnd() * 2 - 1) * ax * 0.95, L = l.length * 2 * ay * (0.25 + 0.75 * rnd());
            const w = bs * 0.014 * (0.6 + rnd() * 0.7), ph = rnd() * TAU, wob = w * (0.3 + rnd());
            const jx = (rnd() - 0.5) * w * 3;
            // each drip starts at its own time and runs down: the trail is drawn as far as it has got
            const b0 = born() * 0.45, run = g >= 1 ? 1 : clamp((g - b0) / (1 - b0));
            if (run <= 0) continue;
            wt = 1;
            const sw = Math.min(1, run * 5); // the source blob at the edge fills first
            ball(x0, -ay, w * 2.6 * sw);
            ball(x0 + jx, -ay + w * 1.5, w * 1.8 * sw);
            const steps = Math.max(2, Math.ceil(L / (w * 0.6))), tip = Math.pow(run, 0.8);
            for (let q = 0; q <= steps; q++) { const t = q / steps; if (t > tip) break; ball(x0 + Math.sin(ph + t * 7) * wob * t, -ay + L * t, w * (1 - 0.3 * t)); }
            ball(x0 + Math.sin(ph + tip * 7) * wob * tip, -ay + L * tip + w * 0.6, w * (1 + 0.45 * tip));
          }
        }
        // irregular edges: perturb the density where it is near the threshold
        for (let j = 0, o = 0; j < gh; j++) {
          const v = vOf(j);
          for (let i = 0; i < gw; i++, o++) {
            const f = G[o];
            if (f > 0.25 && f < 2.5) G[o] = f + (U.fractal('perlin', uOf(i) * 14, v * 14, 0, 0, 3, 0.5, 'fbm', s + 51) - 0.5) * 0.5;
          }
        }
        return G;
      };

      /* ---------- per-layer setup ---------- */
      const BL_CODE = { normal: 0, multiply: 1, screen: 2, add: 3 };
      const L = layers.map((l, idx) => {
        const s = seed + (l.seed | 0) * 7919 + idx * 101;
        // growth of this layer inside its timing window
        const [t0, t1] = timeWindow(l), g = pulse >= 1 ? 1 : clamp((pulse - t0) / (t1 - t0)), aK = Math.pow(g, 0.6);
        const o = { t: l.type, blend: BL_CODE[l.blend] | 0, c1: U.hex(l.color), c2: U.hex(l.color2) };
        if (g <= 0) return null;
        if (l.type === 'vignette') {
          // creeps in from the screen edge
          const reach = l.reach * (0.15 + 0.85 * g), rs = 1 - reach, fadeW = Math.max(1e-3, reach * l.softness);
          const bAmt = l.breakup * reach * 0.6;
          let G = baseGrid(l.shape);
          if (bAmt > 0) {
            const lo = rs - bAmt * 1.4 - 0.08, off = half(G, (r) => r > lo, (u, v, r) => breakAt(l, s, u, v, r));
            const g2 = new Float32Array(N);
            for (let k = 0; k < N; k++) g2[k] = G[k] + off[k] * bAmt;
            G = g2;
          }
          // alpha + color as a function of r (lookup table over r = rs .. rs + span)
          const span = Math.max(fadeW, reach), NL = 1024, LA = new Float32Array(NL + 1), LC = new Float32Array((NL + 1) * 3);
          for (let k = 0; k <= NL; k++) {
            const dr = (k / NL) * span, q = clamp(dr / fadeW), ct = Math.pow(clamp(dr / reach), l.colorBias);
            LA[k] = Math.pow(q * q * (3 - 2 * q), l.falloff) * l.opacity * aK;
            for (let c = 0; c < 3; c++) LC[k * 3 + c] = o.c1[c] + (o.c2[c] - o.c1[c]) * ct;
          }
          Object.assign(o, { G, rs, span, NL, LA, LC });
        } else if (l.type === 'veins' || l.type === 'cracks') {
          // lines grow inward from the edge, tapering at their front
          const reach = l.reach * g, lo = 1 - reach, R = baseGrid(l.shape), cracks = l.type === 'cracks';
          const GV = half(R, (r) => r > lo - 0.08, (u, v) => lineAt(cracks, l.scale, s, u, v));
          Object.assign(o, { R, GV, lo, vw: l.width * 0.1, a: l.opacity * Math.min(1, g * 2.5) });
        } else if (l.type === 'tint') {
          o.a = l.opacity * aK;
        } else {
          Object.assign(o, { GB: bloodGrid(l, s, g), thr: 1 + (1 - g) * 0.5, a: l.opacity * Math.min(1, 0.4 + g) });
        }
        return o;
      }).filter(Boolean);

      /* ---------- per-pixel composite (premultiplied accumulator, W3C-style blend modes) ---------- */
      const L2 = (G, o, tx, ty) => { const a = G[o] + (G[o + 1] - G[o]) * tx, b = G[o + gw] + (G[o + gw + 1] - G[o + gw]) * tx; return a + (b - a) * ty; };
      const img = ctx.createImageData(W, H), d = img.data;
      const P = [0, 0, 0]; // premultiplied color 0..255
      const master = p.opacity, nL = L.length;
      for (let y = 0; y < H; y++) {
        const fy = (y + 0.5) / st, gj = Math.floor(fy), ty = fy - gj;
        for (let x = 0; x < W; x++) {
          const fx = (x + 0.5) / st, gi = Math.floor(fx), tx = fx - gi, o = gj * gw + gi;
          let A = 0;
          P[0] = P[1] = P[2] = 0;
          for (let li = 0; li < nL; li++) {
            const l = L[li];
            let a = 0, cr = 0, cg = 0, cb = 0;
            if (l.t === 'vignette') {
              const r = L2(l.G, o, tx, ty);
              if (r <= l.rs) continue;
              const k = r >= l.rs + l.span ? l.NL : ((r - l.rs) / l.span) * l.NL | 0;
              a = l.LA[k]; cr = l.LC[k * 3]; cg = l.LC[k * 3 + 1]; cb = l.LC[k * 3 + 2];
            } else if (l.t === 'veins' || l.t === 'cracks') {
              const r = L2(l.R, o, tx, ty);
              if (r <= l.lo) continue;
              const m = smoothstep(l.lo, Math.max(l.lo + 0.05, 1), r), wv = l.vw * (0.25 + 0.75 * m);
              a = (1 - smoothstep(wv * 0.5, wv + du * 0.25, L2(l.GV, o, tx, ty))) * m * l.a;
              cr = l.c1[0]; cg = l.c1[1]; cb = l.c1[2];
            } else if (l.t === 'tint') {
              a = l.a; cr = l.c1[0]; cg = l.c1[1]; cb = l.c1[2];
            } else {
              const f = L2(l.GB, o, tx, ty), th = l.thr;
              if (f < th - 0.08) continue;
              a = smoothstep(th - 0.06, th + 0.06, f) * l.a * (0.8 + 0.2 * smoothstep(th, th + 1, f));
              const k = smoothstep(th, th + 1.6, f); // thin parts light, thick parts dark
              cr = l.c1[0] + (l.c2[0] - l.c1[0]) * k; cg = l.c1[1] + (l.c2[1] - l.c1[1]) * k; cb = l.c1[2] + (l.c2[2] - l.c1[2]) * k;
            }
            if (a <= 0) continue;
            if (l.blend && A > 0) {
              // blend with the straight color below, weighted by its alpha
              const ia = 1 / A, sr = P[0] * ia, sg = P[1] * ia, sb = P[2] * ia;
              let br, bg, bb;
              if (l.blend === 1) { br = (sr * cr) / 255; bg = (sg * cg) / 255; bb = (sb * cb) / 255; }
              else if (l.blend === 2) { br = sr + cr - (sr * cr) / 255; bg = sg + cg - (sg * cg) / 255; bb = sb + cb - (sb * cb) / 255; }
              else { br = Math.min(255, sr + cr); bg = Math.min(255, sg + cg); bb = Math.min(255, sb + cb); }
              cr = A * br + (1 - A) * cr; cg = A * bg + (1 - A) * cg; cb = A * bb + (1 - A) * cb;
            }
            P[0] = P[0] * (1 - a) + cr * a; P[1] = P[1] * (1 - a) + cg * a; P[2] = P[2] * (1 - a) + cb * a;
            A += a * (1 - A);
          }
          const i4 = (y * W + x) * 4;
          if (A > 0) { const ia = 1 / A; d[i4] = P[0] * ia; d[i4 + 1] = P[1] * ia; d[i4 + 2] = P[2] * ia; }
          A *= master;
          if (p.dither && A > 0 && A < 1) A += (U.hash(x, y, 91) - 0.5) / 255;
          d[i4 + 3] = clamp(A) * 255;
        }
      }

      ctx.putImageData(img, 0, 0);
    },
  });
})();
