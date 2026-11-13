/* Layered particle designer (smoke, fire, magic, sparks, bubbles, ...).
   Each layer evaluates a 0..1 intensity per pixel in its own transformed space (so noise moves,
   rotates and scales with the layer), gets colored, and is composited with its blend mode. */
(function () {
  'use strict';
  const U = window.UGTG;
  const TAU = Math.PI * 2;

  const BLEND = {
    normal: 'source-over', add: 'lighter', screen: 'screen', multiply: 'multiply',
    overlay: 'overlay', softlight: 'soft-light', mask: 'destination-in', erase: 'destination-out',
  };
  const ADJUST = ['multiply', 'overlay', 'softlight'];

  const LAYER = {
    on: true, type: 'glow', blend: 'normal', opacity: 1,
    size: 0.6, soft: 0.3, power: 2, width: 0.08, points: 6, sharp: 12, lenVar: 0,
    x: 0, y: 0, scale: 1, stretch: 1, rotation: 0,
    distort: 0, noiseMask: 0, nScale: 4, nOct: 4, nType: 'fbm', nContrast: 1.5, seed: 1,
    colorMode: 'solid', color: '#ffffff', color2: '#808080',
  };
  const L = (o) => Object.assign({}, LAYER, o);

  const PRESETS = {
    smoke: [
      L({ size: 0.85, power: 1.4, colorMode: 'gradient', color: '#e6e6e6', color2: '#7a7a7a', distort: 0.35, nScale: 3, noiseMask: 0.85, nOct: 5, nContrast: 1.6, seed: 3 }),
      L({ size: 0.55, power: 1.6, opacity: 0.55, color: '#f2f2f2', noiseMask: 0.8, nScale: 6, nOct: 4, seed: 9 }),
    ],
    fire: [
      L({ size: 0.9, power: 2.6, opacity: 0.45, blend: 'add', color: '#ffffff', y: 0.05, stretch: 1.3 }),
      L({ size: 0.7, power: 1.6, blend: 'add', colorMode: 'gradient', color: '#ffffff', color2: '#ffffff', y: 0.12, stretch: 1.6,
        distort: 0.55, nScale: 4, noiseMask: 0.85, nType: 'ridged', nContrast: 1.8, seed: 5 }),
      L({ size: 0.32, power: 1.8, blend: 'add', color: '#ffffff', opacity: 0.9, y: 0.25, stretch: 1.3, distort: 0.25, nScale: 5, seed: 8 }),
    ],
    magic: [
      L({ size: 0.95, power: 3, blend: 'add', color: '#ffffff', opacity: 0.75 }),
      L({ type: 'star', size: 0.95, points: 8, sharp: 28, lenVar: 0.55, power: 1.4, blend: 'add', color: '#ffffff', seed: 4 }),
      L({ type: 'ring', size: 0.45, width: 0.035, soft: 0.7, blend: 'add', color: '#ffffff', distort: 0.12, nScale: 6, seed: 2 }),
      L({ size: 0.22, power: 1.5, blend: 'add', color: '#ffffff' }),
    ],
    spark: [
      L({ type: 'flare', size: 1, width: 0.03, power: 1.3, blend: 'add', color: '#ffffff' }),
      L({ type: 'flare', size: 0.6, width: 0.025, power: 1.5, rotation: 90, blend: 'add', color: '#ffffff', opacity: 0.8 }),
      L({ type: 'star', size: 0.7, points: 6, sharp: 40, lenVar: 0.4, power: 1.6, blend: 'add', color: '#ffffff', rotation: 15, seed: 6 }),
      L({ size: 0.25, power: 2, blend: 'add', color: '#ffffff' }),
    ],
    bubble: [
      L({ type: 'bubble', size: 0.8, width: 0.07, color: '#ffffff', colorMode: 'gradient', color2: '#d8d8d8', opacity: 0.95 }),
    ],
    orb: [
      L({ size: 0.95, power: 2.4, blend: 'add', color: '#d6d6d6', opacity: 0.7 }),
      L({ type: 'disc', size: 0.5, soft: 0.25, blend: 'add', colorMode: 'gradient', color: '#ffffff', color2: '#d6d6d6',
        distort: 0.3, nScale: 5, noiseMask: 0.6, nType: 'turbulence', seed: 12 }),
      L({ type: 'ring', size: 0.55, width: 0.05, soft: 0.8, blend: 'add', color: '#f2f2f2', distort: 0.4, nScale: 7, seed: 13 }),
    ],
    abstract: [
      L({ type: 'polygon', points: 6, size: 0.7, soft: 0.04, colorMode: 'gradient', color: '#e3e3e3', color2: '#3d3d3d' }),
      L({ type: 'ring', size: 0.55, width: 0.03, soft: 0.2, blend: 'add', color: '#ffffff', opacity: 0.8 }),
      // multiply needs value in the color (white = no change), so map noise onto a white→black gradient
      L({ type: 'noise', blend: 'multiply', opacity: 0.85, colorMode: 'gradient', color: '#ffffff', color2: '#000000', nScale: 4, nType: 'ridged', nContrast: 1.4, seed: 21 }),
      L({ type: 'polygon', points: 3, size: 0.25, soft: 0.05, rotation: 180, blend: 'erase' }),
    ],
    glow: [L({ size: 0.95, power: 2 })],
  };

  /* ---------- per-layer intensity in local space ---------- */
  function shapeI(l, u, v) {
    const r = Math.hypot(u, v);
    switch (l.type) {
      case 'glow': return Math.pow(Math.max(0, 1 - r / l.size), l.power);
      case 'disc': return 1 - U.smoothstep(l.size * (1 - l.soft), l.size + 1e-4, r);
      case 'ring': {
        const hw = l.width / 2;
        return 1 - U.smoothstep(hw * (1 - l.soft), hw * (1 + l.soft) + 1e-4, Math.abs(r - l.size));
      }
      case 'star': {
        const a = Math.atan2(v, u), N = l.points;
        let len = l.size;
        if (l.lenVar > 0) len *= 1 - l.lenVar * U.hash(U.mod(Math.round((a * N) / TAU), N), 7, l.seed);
        return Math.pow(Math.abs(Math.cos((a * N) / 2)), l.sharp) * Math.pow(Math.max(0, 1 - r / len), l.power);
      }
      case 'flare':
        return Math.exp(-((v / l.width) ** 2) * 3) * Math.pow(Math.max(0, 1 - Math.abs(u) / l.size), l.power);
      case 'polygon': {
        const N = l.points, seg = TAU / N, t = U.mod(Math.atan2(v, u) + Math.PI / 2, seg) - seg / 2;
        const dp = (r * Math.cos(t)) / Math.cos(Math.PI / N); // == size on the polygon edge
        return 1 - U.smoothstep(l.size * (1 - l.soft), l.size + 1e-4, dp);
      }
      case 'bubble': {
        const rim = Math.exp(-(((r - l.size) / l.width) ** 2) * 2.5);
        const inner = r < l.size ? 0.12 + 0.25 * Math.pow(r / l.size, 4) : 0;
        const hx = u + l.size * 0.38, hy = (v + l.size * 0.38) * 1.3;
        const spec = Math.pow(Math.max(0, 1 - Math.hypot(hx, hy) / (l.size * 0.3)), 1.5);
        return U.screen(U.screen(rim, inner), spec);
      }
      default: return 1; // noise: the noise term below is the whole layer
    }
  }

  // how far (local units) a layer can reach; used to skip empty pixels
  function reach(l) {
    if (l.type === 'noise') return Infinity;
    if (l.type === 'ring') return l.size + l.width * (1 + l.soft);
    if (l.type === 'bubble') return l.size + l.width * 2;
    if (l.type === 'flare') return Math.hypot(l.size, l.width * 2);
    return l.size;
  }

  function renderLayer(l, W, H, S) {
    const c = U.canvas(W, H), g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    const A = U.hex(l.color), B = U.hex(l.color2), grad = l.colorMode === 'gradient';
    const rot = (l.rotation * Math.PI) / 180, cs = Math.cos(rot), sn = Math.sin(rot);
    const sx = Math.max(0.01, l.scale), sy = Math.max(0.01, l.scale * l.stretch);
    const bound = (reach(l) + l.distort * 0.45 + 0.02) * Math.max(sx, sy), bound2 = bound * bound;
    const ns = l.nScale, useMask = l.type === 'noise' || l.noiseMask > 0;
    let i = 0;
    for (let y = 0; y < H; y++) {
      const gy = (y + 0.5 - H / 2) / (S / 2) - l.y;
      for (let x = 0; x < W; x++, i += 4) {
        const gx = (x + 0.5 - W / 2) / (S / 2) - l.x;
        if (gx * gx + gy * gy > bound2) continue;
        let u = (gx * cs + gy * sn) / sx, v = (-gx * sn + gy * cs) / sy;
        if (l.distort > 0) {
          const w1 = U.fractal('perlin', u * ns + 17.3, v * ns + 5.1, 0, 0, 3, 0.5, 'fbm', l.seed + 11);
          const w2 = U.fractal('perlin', u * ns + 3.7, v * ns + 41.9, 0, 0, 3, 0.5, 'fbm', l.seed + 23);
          u += (w1 - 0.5) * l.distort * 0.9;
          v += (w2 - 0.5) * l.distort * 0.9;
        }
        let I = shapeI(l, u, v);
        if (I > 0.001 && useMask) {
          let n = U.fractal('perlin', u * ns, v * ns, 0, 0, l.nOct, 0.5, l.nType, l.seed);
          n = U.clamp((n - 0.5) * l.nContrast + 0.5);
          I = l.type === 'noise' ? n : I * (1 - l.noiseMask * (1 - n));
        }
        if (I <= 0.001) continue;
        if (I > 1) I = 1;
        if (grad) {
          d[i] = B[0] + (A[0] - B[0]) * I; d[i + 1] = B[1] + (A[1] - B[1]) * I; d[i + 2] = B[2] + (A[2] - B[2]) * I;
        } else { d[i] = A[0]; d[i + 1] = A[1]; d[i + 2] = A[2]; }
        d[i + 3] = I * l.opacity * 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  const t = (...l) => (x) => l.includes(x.type);
  const notNoise = (x) => x.type !== 'noise';

  U.register({
    id: 'particle',
    name: 'Particle',
    desc: 'Layered particle designer: smoke, fire, magic, sparks, bubbles',
    tags: ['VFX'],
    bg: 'black',
    icon: U.icon('<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><circle cx="12" cy="12" r="2.5"/><path d="M6.5 6.5l2 2M15.5 15.5l2 2M17.5 6.5l-2 2M8.5 15.5l-2 2" opacity=".55"/>'),
    params: [
      { type: 'section', label: 'Particle' },
      {
        key: 'preset', label: 'Preset', type: 'select', default: 'fire',
        options: [['custom', 'Custom'], ['smoke', 'Smoke puff'], ['fire', 'Fire'], ['magic', 'Magic burst'], ['spark', 'Spark / flare'],
          ['bubble', 'Bubble'], ['orb', 'Energy orb'], ['abstract', 'Abstract'], ['glow', 'Soft glow']],
        apply: (v, p) => { if (PRESETS[v]) p.layers = U.clone(PRESETS[v]); },
      },
      { key: 'edgeFade', label: 'Fade out at edges', type: 'bool', default: true, tip: 'Guarantees no hard square edge on the particle quad' },
      { key: 'edgeStart', label: 'Fade start', type: 'range', min: 0.3, max: 1, step: 0.01, default: 0.82, show: (p) => p.edgeFade },
      { key: 'bgMode', label: 'Background', type: 'select', default: 'transparent', options: [['transparent', 'Transparent'], ['color', 'Solid color']] },
      { key: 'bgColor', label: 'Background color', type: 'color', default: '#000000', show: (p) => p.bgMode === 'color' },

      { type: 'section', label: 'Layers (bottom → top)' },
      {
        key: 'layers', label: 'Layers', type: 'list', itemLabel: 'Layer', max: 12,
        itemSummary: (l) => `${l.on ? '' : '(hidden) '}${l.type} · ${l.blend}`,
        default: U.clone(PRESETS.fire),
        item: [
          { key: 'on', label: 'Visible', type: 'bool', default: true },
          {
            key: 'type', label: 'Shape', type: 'select', default: LAYER.type,
            options: [['glow', 'Soft glow'], ['disc', 'Disc'], ['ring', 'Ring'], ['star', 'Star rays'], ['flare', 'Flare streak'],
              ['polygon', 'Polygon'], ['bubble', 'Bubble'], ['noise', 'Noise field']],
          },
          { key: 'blend', label: 'Blend', type: 'select', default: LAYER.blend, options: [['normal', 'Normal'], ['add', 'Add'], ['screen', 'Screen'], ['multiply', 'Multiply'], ['overlay', 'Overlay'], ['softlight', 'Soft light'], ['mask', 'Mask (keep below)'], ['erase', 'Erase']] },
          { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: LAYER.opacity },
          { key: 'size', label: 'Size', type: 'range', min: 0.01, max: 1.5, step: 0.005, default: LAYER.size, show: notNoise },
          { key: 'soft', label: 'Softness', type: 'range', min: 0, max: 1, step: 0.01, default: LAYER.soft, show: t('disc', 'ring', 'polygon') },
          { key: 'power', label: 'Falloff', type: 'range', min: 0.2, max: 8, step: 0.05, default: LAYER.power, show: t('glow', 'star', 'flare') },
          { key: 'width', label: 'Width', type: 'range', min: 0.005, max: 0.5, step: 0.005, default: LAYER.width, show: t('ring', 'flare', 'bubble') },
          { key: 'points', label: 'Points / sides', type: 'int', min: 2, max: 32, default: LAYER.points, show: t('star', 'polygon') },
          { key: 'sharp', label: 'Ray sharpness', type: 'range', min: 1, max: 80, step: 0.5, default: LAYER.sharp, show: t('star') },
          { key: 'lenVar', label: 'Ray length variation', type: 'range', min: 0, max: 1, step: 0.01, default: LAYER.lenVar, show: t('star') },

          { type: 'section', label: 'Color' },
          { key: 'colorMode', label: 'Color', type: 'select', default: LAYER.colorMode, options: [['solid', 'Solid'], ['gradient', 'Gradient (outer → inner)']] },
          { key: 'color', label: 'Inner / main', type: 'color', default: LAYER.color },
          { key: 'color2', label: 'Outer', type: 'color', default: LAYER.color2, show: (x) => x.colorMode === 'gradient' },

          { type: 'section', label: 'Transform', collapsed: true, active: (l) => !!(l.x || l.y || l.scale !== 1 || l.stretch !== 1 || l.rotation) },
          { key: 'x', label: 'Offset X', type: 'range', min: -1, max: 1, step: 0.005, default: 0 },
          { key: 'y', label: 'Offset Y', type: 'range', min: -1, max: 1, step: 0.005, default: 0 },
          { key: 'scale', label: 'Scale', type: 'range', min: 0.05, max: 3, step: 0.01, default: 1 },
          { key: 'stretch', label: 'Stretch Y', type: 'range', min: 0.1, max: 4, step: 0.01, default: 1 },
          { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: 0 },

          { type: 'section', label: 'Noise', collapsed: true, active: (l) => l.type === 'noise' || l.distort > 0 || l.noiseMask > 0 },
          { key: 'distort', label: 'Distortion', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0, show: notNoise },
          { key: 'noiseMask', label: 'Noise mask', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: notNoise, tip: 'Multiply the layer by noise (smoke, fire breakup)' },
          { key: 'nType', label: 'Noise type', type: 'select', default: 'fbm', options: [['fbm', 'Cloudy (fBm)'], ['ridged', 'Ridged (flames)'], ['turbulence', 'Turbulence (wisps)']] },
          { key: 'nScale', label: 'Noise scale', type: 'range', min: 0.5, max: 20, step: 0.1, default: 4 },
          { key: 'nOct', label: 'Detail', type: 'int', min: 1, max: 7, default: 4 },
          { key: 'nContrast', label: 'Noise contrast', type: 'range', min: 0.2, max: 4, step: 0.01, default: 1.5 },
          { key: 'seed', label: 'Seed', type: 'seed', default: 1 },
        ],
      },
    ],
    presets: [
      { name: 'Smoke puff', group: 'Realistic', values: { preset: 'smoke' } },
      { name: 'Dark smoke', group: 'Realistic', values: { preset: 'custom', layers: [
        { size: 0.9, power: 1.2, colorMode: 'gradient', color: '#6e6e6e', color2: '#252525', distort: 0.45, noiseMask: 0.9, nScale: 3, nOct: 5, nContrast: 1.8, seed: 31 },
        { size: 0.6, power: 1.5, opacity: 0.7, color: '#3a3a3a', noiseMask: 0.85, nScale: 5, nType: 'turbulence', seed: 7 },
      ] } },
      { name: 'Steam wisp', group: 'Realistic', values: { preset: 'custom', layers: [
        { size: 0.7, power: 1.6, stretch: 1.5, opacity: 0.35, color: '#ffffff', distort: 0.4, noiseMask: 0.6, nScale: 3, seed: 13 },
        { size: 0.9, power: 1.1, stretch: 1.6, color: '#ffffff', distort: 0.6, noiseMask: 0.85, nType: 'turbulence', nScale: 3, nOct: 5, nContrast: 1.4, seed: 14 },
      ] } },
      { name: 'Campfire', group: 'Realistic', values: { preset: 'custom', layers: [{ type: 'glow', blend: 'add', size: 0.55, power: 2.2, colorMode: 'gradient', color: '#ffffff', color2: '#7a7a7a', y: 0.18, stretch: 0.6, distort: 0.3, noiseMask: 0.15 }, { type: 'glow', blend: 'screen', size: 0.34, power: 1.6, color: '#ffffff', y: -0.02, stretch: 1.9, distort: 0.6, noiseMask: 0.3, nScale: 5, seed: 3 }, { type: 'glow', blend: 'screen', size: 0.17, power: 1.4, color: '#e8e8e8', x: -0.13, y: 0.06, stretch: 2.6, rotation: -8, distort: 0.7, noiseMask: 0.3, nScale: 6, seed: 7 }, { type: 'glow', blend: 'screen', size: 0.15, power: 1.4, color: '#e8e8e8', x: 0.14, y: 0.08, stretch: 2.3, rotation: 9, distort: 0.7, noiseMask: 0.3, nScale: 6, seed: 11 }] } },
      { name: 'Candle flame', group: 'Realistic', values: { preset: 'custom', layers: [
        { size: 0.75, power: 3, blend: 'add', color: '#ffffff', opacity: 0.5 },
        { type: 'disc', size: 0.2, soft: 0.8, stretch: 2.4, y: -0.12, blend: 'add', colorMode: 'gradient', color: '#ffffff', color2: '#ffffff', distort: 0.08, nScale: 3, seed: 4 },
        { type: 'disc', size: 0.08, soft: 0.9, stretch: 1.4, y: 0.18, blend: 'add', color: '#ffffff', opacity: 0.7 },
      ] } },
      { name: 'Explosion fireball', group: 'Realistic', values: { preset: 'custom', layers: [
        { size: 1, power: 1.8, blend: 'add', color: '#ffffff', opacity: 0.8 },
        { type: 'disc', size: 0.82, soft: 0.5, blend: 'add', colorMode: 'gradient', color: '#ffffff', color2: '#ffffff', distort: 0.5, noiseMask: 0.7, nType: 'turbulence', nScale: 3.5, nOct: 5, nContrast: 1.6, seed: 19 },
        { size: 0.9, power: 1.5, blend: 'multiply', opacity: 0.5, colorMode: 'gradient', color: '#ffffff', color2: '#3a3a3a', noiseMask: 0.6, nScale: 5, seed: 23 },
        { size: 0.5, power: 1.6, blend: 'add', color: '#ffffff', opacity: 0.8 },
      ] } },
      { name: 'Muzzle smoke', group: 'Realistic', values: { preset: 'custom', layers: [
        { size: 0.95, power: 1.1, stretch: 0.45, colorMode: 'gradient', color: '#e4e4e4', color2: '#9a9a9a', distort: 0.5, noiseMask: 0.75, nType: 'turbulence', nScale: 4, nOct: 5, nContrast: 1.8, seed: 41 },
        { size: 0.5, power: 1.4, x: -0.3, stretch: 0.6, opacity: 0.8, color: '#ececec', noiseMask: 0.8, nScale: 6, seed: 42 },
      ] } },
      { name: 'Shell sparks', group: 'Realistic', values: { preset: 'custom', layers: [
        { type: 'star', size: 1, points: 22, sharp: 70, lenVar: 0.85, power: 1.2, blend: 'add', color: '#ffffff', seed: 8 },
        { type: 'star', size: 0.6, points: 13, sharp: 60, lenVar: 0.7, power: 1.4, rotation: 9, blend: 'add', color: '#ffffff', seed: 15 },
        { size: 0.22, power: 2.5, blend: 'add', color: '#ffffff' },
      ] } },
      { name: 'Tracer glow', group: 'Realistic', values: { preset: 'custom', layers: [
        { type: 'flare', size: 1, width: 0.12, power: 0.8, blend: 'add', color: '#ffffff', opacity: 0.55 },
        { type: 'flare', size: 0.95, width: 0.03, power: 0.6, blend: 'add', colorMode: 'gradient', color: '#ffffff', color2: '#ffffff' },
      ] } },
      { name: 'Bullet impact dust', group: 'Realistic', values: { preset: 'custom', layers: [
        { size: 0.85, power: 1.2, colorMode: 'gradient', color: '#c9c9c9', color2: '#7a7a7a', distort: 0.4, noiseMask: 0.9, nScale: 4, nOct: 5, nContrast: 1.8, seed: 51 },
        { type: 'star', size: 0.95, points: 16, sharp: 30, lenVar: 0.75, power: 1.1, opacity: 0.8, color: '#a8a8a8', distort: 0.15, seed: 52 },
        { size: 0.3, power: 1.5, opacity: 0.7, color: '#e2e2e2', noiseMask: 0.6, nScale: 7, seed: 53 },
      ] } },
      { name: 'Bubble', group: 'Realistic', values: { preset: 'bubble' } },
      { name: 'Lens flare', group: 'Realistic', values: { preset: 'custom', layers: [
        { size: 0.6, power: 2.5, blend: 'add', color: '#ffffff', opacity: 0.8 },
        { type: 'flare', size: 1, width: 0.02, power: 1, blend: 'add', color: '#ffffff' },
        { type: 'ring', size: 0.4, width: 0.05, soft: 0.9, blend: 'add', color: '#ffffff', opacity: 0.35 },
        { size: 0.12, power: 1.5, blend: 'add', color: '#ffffff' },
      ] } },
      { name: 'Magic burst', group: 'Stylized', values: { preset: 'magic' } },
      { name: 'Toon fire', group: 'Stylized', values: { preset: 'custom', layers: [
        { type: 'disc', size: 0.55, soft: 0.03, stretch: 1.5, y: 0.05, color: '#e8e8e8', distort: 0.5, nScale: 3, seed: 61 },
        { type: 'disc', size: 0.4, soft: 0.03, stretch: 1.4, y: 0.15, color: '#ffffff', distort: 0.45, nScale: 3, seed: 62 },
        { type: 'disc', size: 0.22, soft: 0.03, stretch: 1.3, y: 0.28, color: '#ffffff', distort: 0.35, nScale: 3, seed: 63 },
      ] } },
      { name: 'Toon smoke', group: 'Stylized', values: { preset: 'custom', layers: [
        { type: 'disc', size: 0.4, soft: 0.04, x: -0.25, y: 0.1, color: '#e0e0e0' },
        { type: 'disc', size: 0.45, soft: 0.04, x: 0.2, y: 0.05, color: '#ebebeb' },
        { type: 'disc', size: 0.38, soft: 0.04, y: -0.25, color: '#f4f4f4' },
        { type: 'disc', size: 0.5, soft: 0.5, x: 0.15, y: 0.35, blend: 'multiply', color: '#a3a3a3', opacity: 0.6 },
      ] } },
      { name: 'Heal sparkle', group: 'Stylized', values: { preset: 'custom', layers: [
        { size: 0.9, power: 2.6, blend: 'add', color: '#e0e0e0', opacity: 0.6 },
        { type: 'star', size: 0.8, points: 4, sharp: 40, power: 1.2, blend: 'add', color: '#ffffff' },
        { type: 'star', size: 0.25, points: 4, sharp: 30, power: 1.2, x: 0.4, y: -0.35, rotation: 45, blend: 'add', color: '#ffffff' },
        { type: 'star', size: 0.18, points: 4, sharp: 30, power: 1.2, x: -0.45, y: 0.3, blend: 'add', color: '#ffffff' },
      ] } },
      { name: 'Poison cloud', group: 'Stylized', values: { preset: 'custom', layers: [
        { size: 0.9, power: 1.3, colorMode: 'gradient', color: '#ffffff', color2: '#7a7a7a', distort: 0.4, noiseMask: 0.85, nScale: 3, nOct: 5, nContrast: 1.7, seed: 71 },
        { size: 0.5, power: 1.6, blend: 'add', color: '#ffffff', opacity: 0.45, noiseMask: 0.7, nScale: 5, seed: 72 },
      ] } },
      { name: 'Ice crystal', group: 'Stylized', values: { preset: 'custom', layers: [
        { size: 0.9, power: 2.4, blend: 'add', color: '#ffffff', opacity: 0.55 },
        { type: 'star', size: 0.9, points: 6, sharp: 50, power: 0.9, blend: 'add', color: '#ffffff' },
        { type: 'polygon', points: 6, size: 0.28, soft: 0.05, rotation: 30, colorMode: 'gradient', color: '#ffffff', color2: '#ffffff' },
      ] } },
      { name: 'Comic hit', group: 'Stylized', values: { preset: 'custom', edgeFade: false, layers: [
        { type: 'star', size: 0.95, points: 9, sharp: 8, lenVar: 0.5, power: 0.5, color: '#ffffff', seed: 81 },
        { type: 'polygon', size: 0.3, points: 9, soft: 0.03, color: '#ffffff' },
        { type: 'polygon', size: 0.2, points: 9, soft: 0.03, rotation: 20, color: '#ffffff' },
      ] } },
      { name: 'Energy orb', group: 'Sci-fi', values: { preset: 'orb' } },
      { name: 'Portal', group: 'Sci-fi', values: { preset: 'custom', layers: [
        { size: 1, power: 2.4, blend: 'add', color: '#ffffff', opacity: 0.7 },
        { type: 'ring', size: 0.55, width: 0.3, soft: 0.9, blend: 'add', colorMode: 'gradient', color: '#ffffff', color2: '#c8c8c8', distort: 0.35, noiseMask: 0.7, nType: 'turbulence', nScale: 5, seed: 91 },
        { type: 'disc', size: 0.42, soft: 0.4, color: '#181818' },
        { type: 'ring', size: 0.46, width: 0.025, soft: 0.6, blend: 'add', color: '#ffffff', distort: 0.12, nScale: 8, seed: 92 },
      ] } },
      { name: 'Plasma ball', group: 'Sci-fi', values: { preset: 'custom', layers: [
        { size: 1, power: 2.2, blend: 'add', color: '#ffffff', opacity: 0.6 },
        { type: 'disc', size: 0.6, soft: 0.2, blend: 'add', colorMode: 'gradient', color: '#ffffff', color2: '#ffffff', noiseMask: 0.9, nType: 'ridged', nScale: 4, nOct: 5, nContrast: 2.5, distort: 0.3, seed: 101 },
        { size: 0.25, power: 1.5, blend: 'add', color: '#ffffff' },
      ] } },
      { name: 'Shield hit', group: 'Sci-fi', values: { preset: 'custom', layers: [
        { type: 'polygon', points: 6, size: 0.8, soft: 0.6, rotation: 30, blend: 'add', color: '#ffffff', opacity: 0.6 },
        { type: 'polygon', points: 6, size: 0.6, soft: 0.5, rotation: 30, blend: 'erase', opacity: 0.85 },
        { type: 'ring', size: 0.3, width: 0.04, soft: 0.6, blend: 'add', color: '#ffffff' },
        { size: 0.3, power: 2, blend: 'add', color: '#ffffff' },
      ] } },
      { name: 'Black hole', group: 'Sci-fi', values: { preset: 'custom', layers: [
        { type: 'ring', size: 0.45, width: 0.4, soft: 1, blend: 'add', colorMode: 'gradient', color: '#ffffff', color2: '#ffffff', distort: 0.25, noiseMask: 0.6, nType: 'turbulence', nScale: 6, seed: 111 },
        { type: 'flare', size: 1, width: 0.05, power: 1, blend: 'add', color: '#ffffff', opacity: 0.8 },
        { type: 'disc', size: 0.28, soft: 0.15, color: '#000000' },
      ] } },
      { name: 'Laser impact', group: 'Sci-fi', values: { preset: 'custom', layers: [
        { size: 0.8, power: 2.5, blend: 'add', color: '#ffffff', opacity: 0.8 },
        { type: 'flare', size: 1, width: 0.025, power: 1.2, blend: 'add', color: '#ffffff' },
        { type: 'flare', size: 0.6, width: 0.02, power: 1.4, rotation: 90, blend: 'add', color: '#ffffff' },
        { size: 0.18, power: 1.4, blend: 'add', color: '#ffffff' },
      ] } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H);
      let out = U.canvas(W, H), oc = out.getContext('2d');
      for (const l of p.layers) {
        if (!l.on || l.opacity <= 0) continue;
        const layer = renderLayer(Object.assign({}, LAYER, l), W, H, S), mode = BLEND[l.blend] || 'source-over';
        if (ADJUST.includes(l.blend)) {
          // adjustment blends only modify what's below: blend on a copy, then restore the original alpha
          const tmp = U.canvas(W, H), tc = tmp.getContext('2d');
          tc.drawImage(out, 0, 0);
          tc.globalCompositeOperation = mode;
          tc.drawImage(layer, 0, 0);
          tc.globalCompositeOperation = 'destination-in';
          tc.drawImage(out, 0, 0);
          out = tmp; oc = tc;
          oc.globalCompositeOperation = 'source-over';
        } else {
          oc.globalCompositeOperation = mode;
          oc.drawImage(layer, 0, 0);
        }
      }
      if (p.edgeFade) {
        const R = S / 2, gr = oc.createRadialGradient(W / 2, H / 2, R * p.edgeStart, W / 2, H / 2, R);
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        oc.globalCompositeOperation = 'destination-in';
        oc.fillStyle = gr;
        oc.fillRect(0, 0, W, H);
      }
      if (p.bgMode === 'color') { ctx.fillStyle = p.bgColor; ctx.fillRect(0, 0, W, H); }
      ctx.drawImage(out, 0, 0);
    },
  });
})();
