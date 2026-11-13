/* Tileable procedural materials: wood grain, marble, rust. All noise uses integer periods,
   so every material tiles seamlessly. */
(function () {
  'use strict';
  const U = window.UGTG;
  const TAU = Math.PI * 2;

  const PRESETS = {
    wood: { c1: '#c08a55', c2: '#7a4a24', c3: '#5a3519', scale: 2, detail: 4, distort: 0.5, sharp: 1.6 },
    marble: { c1: '#ece9e2', c2: '#5d6166', c3: '#cfcac0', scale: 3, detail: 6, distort: 0.6, sharp: 2.2 },
    rust: { c1: '#7d8186', c2: '#a8501f', c3: '#4a2410', scale: 3, detail: 6, distort: 0.4, sharp: 1.2 },
  };
  const is = (m) => (p) => p.material === m;

  U.register({
    id: 'material',
    name: 'Wood / Marble / Rust',
    desc: 'Tileable procedural wood grain, marble veins and rusted metal',
    tags: ['Texturing', 'Nature'],
    tileable: true,
    icon: U.icon('<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9c4 1.5 9-1.5 17 0M3.5 14c5 1 10-2 17 .5"/>'),
    params: [
      { type: 'section', label: 'Material' },
      {
        key: 'material', label: 'Material', type: 'select', default: 'wood', options: [['wood', 'Wood grain'], ['marble', 'Marble'], ['rust', 'Rust']],
        apply: (v, p) => { if (PRESETS[v]) Object.assign(p, PRESETS[v]); },
      },
      { key: 'scale', label: 'Scale', type: 'int', min: 1, max: 12, default: PRESETS.wood.scale },
      { key: 'detail', label: 'Detail', type: 'int', min: 1, max: 8, default: PRESETS.wood.detail },
      { key: 'distort', label: 'Distortion', type: 'range', min: 0, max: 1.5, step: 0.01, default: PRESETS.wood.distort },
      { key: 'sharp', label: 'Sharpness', type: 'range', min: 0.3, max: 5, step: 0.01, default: PRESETS.wood.sharp },
      { key: 'seed', label: 'Seed', type: 'seed', default: 8 },
      { key: 'rings', label: 'Rings', type: 'int', min: 2, max: 60, default: 14, show: is('wood') },
      { key: 'knots', label: 'Knots', type: 'int', min: 0, max: 8, default: 2, show: is('wood') },
      { key: 'fibers', label: 'Fibers', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: is('wood') },
      { key: 'veins', label: 'Veins', type: 'int', min: 1, max: 10, default: 3, show: is('marble') },
      { key: 'coverage', label: 'Rust coverage', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, show: is('rust') },
      { key: 'pitting', label: 'Pitting', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: is('rust') },
      { type: 'section', label: 'Colors' },
      { key: 'c1', label: 'Light / base', type: 'color', default: PRESETS.wood.c1 },
      { key: 'c2', label: 'Dark / veins / rust', type: 'color', default: PRESETS.wood.c2 },
      { key: 'c3', label: 'Accent', type: 'color', default: PRESETS.wood.c3 },
    ],
    presets: [
      { name: 'Oak', group: 'Realistic', values: { rings: 18, knots: 1, fibers: 0.6, sharp: 1.2, c1: '#c89c66', c2: '#8c6036', c3: '#6a4422' } },
      { name: 'Walnut', group: 'Realistic', values: { rings: 12, distort: 0.7, sharp: 1.8, fibers: 0.5, c1: '#7c5438', c2: '#3c2416', c3: '#24150c' } },
      { name: 'Pine', group: 'Realistic', values: { rings: 9, knots: 3, sharp: 3.5, fibers: 0.3, c1: '#e8c58e', c2: '#b0743a', c3: '#9a6630' } },
      { name: 'Ebony', group: 'Realistic', values: { rings: 30, knots: 0, sharp: 1, distort: 0.35, fibers: 0.5, c1: '#3c3028', c2: '#100c0a', c3: '#4e3d30' } },
      { name: 'Mahogany', group: 'Realistic', values: { rings: 22, knots: 0, sharp: 1.4, distort: 0.3, fibers: 0.7, c1: '#a85c3a', c2: '#6a2e1c', c3: '#4e2016' } },
      { name: 'Maple', group: 'Realistic', values: { rings: 26, knots: 0, sharp: 2.6, distort: 0.3, fibers: 0.35, c1: '#efdcb8', c2: '#d0b286', c3: '#c09f72' } },
      { name: 'Carrara marble', group: 'Realistic', values: { material: 'marble', veins: 4, distort: 0.7, sharp: 1.3, c1: '#eeece8', c2: '#7a7f86', c3: '#d8d6d2' } },
      { name: 'Calacatta gold marble', group: 'Realistic', values: { material: 'marble', veins: 2, distort: 0.9, sharp: 0.85, c1: '#f5f1e8', c2: '#8f7c58', c3: '#e2dccd' } },
      { name: 'Nero Marquina (black marble)', group: 'Realistic', values: { material: 'marble', veins: 3, sharp: 1.2, c1: '#1c1c1f', c2: '#e6e4de', c3: '#2e2e33' } },
      { name: 'Verde green marble', group: 'Realistic', values: { material: 'marble', veins: 5, distort: 1, sharp: 1.1, c1: '#1f4a36', c2: '#d4e4d8', c3: '#0e281c' } },
      { name: 'Light rust', group: 'Realistic', values: { material: 'rust', coverage: 0.4, pitting: 0.3, c1: '#8f949a' } },
      { name: 'Heavy rust', group: 'Realistic', values: { material: 'rust', coverage: 0.8, pitting: 0.9, distort: 0.8, c1: '#4e5257', c2: '#8a3c14', c3: '#2e1408' } },
      { name: 'Rusted blue paint', group: 'Realistic', values: { material: 'rust', coverage: 0.45, pitting: 0.4, seed: 41, c1: '#3d6a8a', c2: '#a8521f', c3: '#4a2410' } },
      { name: 'Corten steel', group: 'Realistic', values: { material: 'rust', coverage: 1, pitting: 0, scale: 2, detail: 3, c2: '#b0602e', c3: '#6a3418' } },
      { name: 'Copper patina', group: 'Realistic', values: { material: 'rust', coverage: 0.6, pitting: 0.25, seed: 5, c1: '#b8763c', c2: '#6cc0a4', c3: '#2f6f5f' } },
      { name: 'Toon wood', group: 'Stylized', values: { rings: 7, knots: 1, detail: 2, distort: 0.3, sharp: 4, fibers: 0, c1: '#e8a868', c2: '#a0602a', c3: '#a0602a' } },
      { name: 'Hand-painted planks', group: 'Stylized', values: { rings: 10, knots: 2, detail: 3, distort: 0.6, sharp: 0.8, fibers: 0.2, c1: '#d29a5a', c2: '#8a4e2a', c3: '#f0c890' } },
      { name: 'Pink candy marble', group: 'Stylized', values: { material: 'marble', veins: 3, detail: 3, sharp: 0.7, c1: '#f8dce4', c2: '#c95c88', c3: '#eed4ff' } },
      { name: 'Cartoon rust', group: 'Stylized', values: { material: 'rust', detail: 3, sharp: 5, coverage: 0.5, pitting: 0, c1: '#7f95a8', c2: '#e47a30', c3: '#a8461c' } },
      { name: 'Magma veins', group: 'Stylized', values: { material: 'marble', veins: 4, distort: 1, sharp: 0.6, c1: '#1c1210', c2: '#ff6a1a', c3: '#3a1a12' } },
      { name: 'Alien marble', group: 'Sci-fi', values: { material: 'marble', veins: 6, distort: 1.3, sharp: 0.75, c1: '#1a0f2e', c2: '#4ef0d0', c3: '#5a2a8a' } },
      { name: 'Plasma veins', group: 'Sci-fi', values: { material: 'marble', veins: 8, detail: 7, distort: 0.8, sharp: 1.1, c1: '#05050c', c2: '#ff3af0', c3: '#1a0a3a' } },
      { name: 'Alien bark', group: 'Sci-fi', values: { rings: 24, knots: 4, distort: 0.9, sharp: 2.5, fibers: 0.6, c1: '#2e4a6a', c2: '#8af0ff', c3: '#14223a' } },
      { name: 'Acid-corroded hull', group: 'Sci-fi', values: { material: 'rust', coverage: 0.55, pitting: 0.7, scale: 5, seed: 99, c1: '#5c636c', c2: '#c4e43a', c3: '#3e4c10' } },
    ],
    render(ctx, W, H, p) {
      const c1 = U.hex(p.c1), c2 = U.hex(p.c2), c3 = U.hex(p.c3), seed = p.seed;
      const sc = p.scale, scy = Math.max(1, Math.round((sc * H) / W));
      const mix = (a, b, t, o) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; };
      const tmp = [0, 0, 0];

      if (p.material === 'wood') {
        const wx = sc, wy = scy * 4, fx = sc * 2, fy = Math.max(1, Math.round(p.rings * 6));
        U.pixels(ctx, W, H, (x, y, o) => {
          const u = (x + 0.5) / W, v = (y + 0.5) / H;
          // grain runs along X: low frequency along the grain, higher across it
          let t = v * p.rings + (U.fractal('perlin', u * wx, v * wy, wx, wy, p.detail, 0.5, 'fbm', seed) - 0.5) * p.distort * 4;
          if (p.knots > 0) {
            const w = U.worley(u * p.knots, v * p.knots, p.knots, p.knots, seed + 3);
            t += Math.exp(-((w.f1 / 0.22) ** 2)) * 2.2 * (w.id > 0.5 ? 1 : -1); // rings bend around knots
          }
          const ring = Math.pow(0.5 + 0.5 * Math.sin(TAU * t), p.sharp);
          const fib = p.fibers > 0 ? U.fractal('perlin', u * fx, v * fy, fx, fy, 2, 0.5, 'fbm', seed + 7) : 0.5;
          mix(c1, c2, ring, o);
          mix(o, c3, U.clamp((fib - 0.5) * 2.5) * p.fibers * 0.6, o);
        });
        return;
      }

      if (p.material === 'marble') {
        U.pixels(ctx, W, H, (x, y, o) => {
          const u = (x + 0.5) / W, v = (y + 0.5) / H;
          const turb = U.fractal('perlin', u * sc, v * scy, sc, scy, p.detail, 0.55, 'turbulence', seed);
          // integer vein counts keep |sin| periodic over the tile
          const s = Math.abs(Math.sin(Math.PI * (u * p.veins + v * p.veins + turb * p.distort * 4)));
          const vein = Math.pow(1 - s, p.sharp * 6);
          const cloud = U.fractal('perlin', u * sc * 2, v * scy * 2, sc * 2, scy * 2, 4, 0.5, 'fbm', seed + 9);
          mix(c1, c3, U.clamp((cloud - 0.4) * 1.5) * 0.6, tmp);
          mix(tmp, c2, U.clamp(vein), o);
        });
        return;
      }

      // rust
      const ps = sc * 14, psy = scy * 14;
      U.pixels(ctx, W, H, (x, y, o) => {
        const u = (x + 0.5) / W, v = (y + 0.5) / H;
        const n = U.fractal('perlin', u * sc, v * scy, sc, scy, p.detail, 0.55, 'fbm', seed);
        const edge = 1 - p.coverage;
        const cover = U.smoothstep(edge - 0.07 / p.sharp, edge + 0.07 / p.sharp, n + (U.fractal('perlin', u * sc * 6, v * scy * 6, sc * 6, scy * 6, 3, 0.5, 'fbm', seed + 2) - 0.5) * p.distort * 0.25);
        const fine = U.fractal('perlin', u * sc * 8, v * scy * 8, sc * 8, scy * 8, 3, 0.5, 'fbm', seed + 4);
        mix(c1, [c1[0] * 0.75, c1[1] * 0.75, c1[2] * 0.75], U.clamp((fine - 0.5) * 2), tmp); // brushed metal variation
        mix(c2, c3, U.clamp((fine - 0.35) * 1.6), o);                                         // rust: orange → dark brown
        mix(tmp, o, cover, o);
        if (p.pitting > 0) {
          const w = U.worley(u * ps, v * psy, ps, psy, seed + 6);
          const pit = (1 - U.smoothstep(0.05, 0.05 + 0.18 * p.pitting, w.f1)) * U.smoothstep(0.3, 0.7, cover + w.id * 0.4);
          o[0] *= 1 - pit * 0.6; o[1] *= 1 - pit * 0.6; o[2] *= 1 - pit * 0.6;
        }
      });
    },
  });
})();
