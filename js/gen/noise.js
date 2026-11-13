/* Tileable fractal noise: Perlin, value, Worley, cellular; fBm / ridged / turbulence. */
(function () {
  'use strict';
  const U = window.UGTG;
  const notWhite = (p) => p.type !== 'white';

  U.register({
    id: 'noise',
    name: 'Noise',
    desc: 'Tileable Perlin, value, Worley noise with fBm octaves',
    tags: ['Texturing', 'VFX'],
    tileable: true,
    icon: U.icon('<path d="M3 15c2-4 4-4 6 0s4 4 6 0 4-4 6 0"/><path d="M3 9c2-4 4-4 6 0s4 4 6 0 4-4 6 0" opacity=".5"/>'),
    params: [
      { type: 'section', label: 'Noise' },
      { key: 'type', label: 'Type', type: 'select', default: 'perlin', options: [['perlin', 'Perlin (gradient)'], ['value', 'Value'], ['worley', 'Worley (cells)'], ['cells', 'Cellular edges'], ['white', 'White noise']] },
      { key: 'mode', label: 'Fractal', type: 'select', default: 'fbm', options: [['fbm', 'fBm'], ['ridged', 'Ridged'], ['turbulence', 'Turbulence']], show: notWhite },
      { key: 'scale', label: 'Scale', type: 'int', min: 1, max: 32, default: 4, show: notWhite },
      { key: 'octaves', label: 'Octaves', type: 'int', min: 1, max: 8, default: 5, show: notWhite },
      { key: 'gain', label: 'Persistence', type: 'range', min: 0.1, max: 0.9, step: 0.01, default: 0.5, show: (p) => notWhite(p) && p.octaves > 1 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 1337 },
      { type: 'section', label: 'Adjust' },
      { key: 'contrast', label: 'Contrast', type: 'range', min: 0, max: 4, step: 0.01, default: 1.2 },
      { key: 'brightness', label: 'Brightness', type: 'range', min: -1, max: 1, step: 0.01, default: 0 },
      { key: 'invert', label: 'Invert', type: 'bool', default: false },
      { type: 'section', label: 'Color', collapsed: true, active: (p) => p.colorA !== '#000000' || p.colorB !== '#ffffff' || p.alphaOut },
      { key: 'colorA', label: 'Low', type: 'color', default: '#000000' },
      { key: 'colorB', label: 'High', type: 'color', default: '#ffffff' },
      { key: 'alphaOut', label: 'Output as alpha', type: 'bool', default: false, tip: 'High color with noise in the alpha channel' },
      { type: 'section', label: 'Domain warp', collapsed: true },
      { key: 'warp', label: 'Warp amount', type: 'range', min: 0, max: 2, step: 0.01, default: 0, show: notWhite },
    ],
    presets: [
      { name: 'Clouds', group: 'Realistic', values: { scale: 3, octaves: 6, gain: 0.55, contrast: 1.5, brightness: -0.05, colorA: '#3f7fd4', colorB: '#ffffff' } },
      { name: 'Marble', group: 'Realistic', values: { mode: 'turbulence', scale: 3, octaves: 6, contrast: 1.8, invert: true, warp: 0.8, colorA: '#2e2e30', colorB: '#f4f1ea' } },
      { name: 'Terrain heightmap', group: 'Realistic', values: { mode: 'ridged', scale: 3, octaves: 7, gain: 0.48, contrast: 1.3, seed: 2024 } },
      { name: 'Caustics', group: 'Realistic', values: { type: 'worley', mode: 'ridged', scale: 5, octaves: 3, gain: 0.35, contrast: 1.8, brightness: -0.25, warp: 0.4, colorA: '#0a4a6c', colorB: '#d4fbff' } },
      { name: 'Smoke wisps', group: 'Realistic', values: { mode: 'turbulence', scale: 3, octaves: 6, contrast: 1.9, brightness: 0.1, warp: 0.7, alphaOut: true, colorB: '#e0e0e0' } },
      { name: 'Cobble stone', group: 'Realistic', values: { type: 'worley', scale: 6, octaves: 2, gain: 0.25, contrast: 1.8, invert: true, warp: 0.12, colorA: '#2a2723', colorB: '#a9a195' } },
      { name: 'Cracked mud', group: 'Realistic', values: { type: 'cells', scale: 6, octaves: 1, contrast: 3, brightness: 0.35, warp: 0.15, colorA: '#2b1d12', colorB: '#a97f52' } },
      { name: 'Sand dunes', group: 'Realistic', values: { mode: 'ridged', scale: 2, octaves: 3, gain: 0.35, contrast: 1.1, warp: 0.4, colorA: '#a77d45', colorB: '#f2d79e' } },
      { name: 'Granite', group: 'Realistic', values: { type: 'value', scale: 32, octaves: 3, contrast: 2.2, colorA: '#2c2a2b', colorB: '#c9c2bd' } },
      { name: 'Film grain', group: 'Realistic', values: { type: 'white', contrast: 0.35, colorA: '#000000', colorB: '#ffffff' } },
      { name: 'Moss patches', group: 'Realistic', values: { scale: 5, octaves: 6, gain: 0.6, contrast: 2, warp: 0.3, colorA: '#2c2418', colorB: '#6f8f32' } },
      { name: 'Toon clouds', group: 'Stylized', values: { scale: 3, octaves: 2, contrast: 4, brightness: -0.1, colorA: '#5aa9f0', colorB: '#ffffff' } },
      { name: 'Cotton candy', group: 'Stylized', values: { scale: 2, octaves: 4, warp: 1.1, contrast: 1.4, colorA: '#ff79b8', colorB: '#8fe6ff' } },
      { name: 'Blob camo', group: 'Stylized', values: { scale: 4, octaves: 2, contrast: 4, colorA: '#3c4a25', colorB: '#a39468' } },
      { name: 'Paper', group: 'Stylized', values: { type: 'value', scale: 32, octaves: 6, gain: 0.6, contrast: 0.45, colorA: '#cfc4ad', colorB: '#fbf6ea' } },
      { name: 'Watercolor wash', group: 'Stylized', values: { scale: 2, octaves: 5, warp: 1.6, contrast: 0.9, colorA: '#2f63a0', colorB: '#f6efe0' } },
      { name: 'Psychedelic swirl', group: 'Stylized', values: { mode: 'turbulence', scale: 2, octaves: 3, warp: 2, contrast: 1.6, colorA: '#ff1f8f', colorB: '#ffe14a' } },
      { name: 'Nebula', group: 'Sci-fi', values: { scale: 2, octaves: 7, gain: 0.6, warp: 1.4, contrast: 2.4, brightness: -0.3, colorA: '#05010f', colorB: '#c056ff' } },
      { name: 'Energy veins', group: 'Sci-fi', values: { mode: 'ridged', scale: 3, octaves: 4, gain: 0.45, warp: 0.6, contrast: 3, brightness: -0.6, colorA: '#00040a', colorB: '#39d0ff' } },
      { name: 'Plasma', group: 'Sci-fi', values: { mode: 'turbulence', scale: 3, octaves: 5, warp: 1, contrast: 2.2, brightness: 0.3, invert: true, colorA: '#12002e', colorB: '#ff4fd8' } },
      { name: 'Alien cells', group: 'Sci-fi', values: { type: 'cells', mode: 'ridged', scale: 8, octaves: 2, gain: 0.4, contrast: 2, brightness: -0.2, warp: 0.3, colorA: '#001a10', colorB: '#4dff9a' } },
      { name: 'Force field', group: 'Sci-fi', values: { type: 'worley', mode: 'ridged', scale: 6, octaves: 2, contrast: 2.2, brightness: -0.3, alphaOut: true, colorB: '#49c6ff' } },
      { name: 'Lava planet', group: 'Sci-fi', values: { mode: 'ridged', scale: 4, octaves: 6, warp: 0.5, contrast: 2.6, brightness: -0.35, colorA: '#140300', colorB: '#ff7a1a' } },
    ],
    render(ctx, W, H, p) {
      const sx = p.scale, sy = Math.max(1, Math.round((p.scale * H) / W));
      const A = U.hex(p.colorA), B = U.hex(p.colorB);
      U.pixels(ctx, W, H, (x, y, o) => {
        let n;
        if (p.type === 'white') n = U.hash(x, y, p.seed);
        else {
          let u = ((x + 0.5) / W) * sx, v = ((y + 0.5) / H) * sy;
          if (p.warp > 0) {
            const wu = U.fractal('perlin', u, v, sx, sy, 3, 0.5, 'fbm', p.seed + 777) - 0.5;
            const wv = U.fractal('perlin', u, v, sx, sy, 3, 0.5, 'fbm', p.seed + 999) - 0.5;
            u += p.warp * wu * 2; v += p.warp * wv * 2;
          }
          n = U.fractal(p.type, u, v, sx, sy, p.octaves, p.gain, p.mode, p.seed);
        }
        n = U.clamp((n - 0.5) * p.contrast + 0.5 + p.brightness);
        if (p.invert) n = 1 - n;
        if (p.alphaOut) { o[0] = B[0]; o[1] = B[1]; o[2] = B[2]; o[3] = n * 255; }
        else { o[0] = A[0] + (B[0] - A[0]) * n; o[1] = A[1] + (B[1] - A[1]) * n; o[2] = A[2] + (B[2] - A[2]) * n; }
      });
    },
  });
})();
