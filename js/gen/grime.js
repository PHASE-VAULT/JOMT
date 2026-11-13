/* Tileable grime / grunge: stains, mottling, speckles and drip streaks from periodic noise.
   Output as a transparent overlay, a grayscale mask, or dirt over a base color. */
(function () {
  'use strict';
  const U = window.UGTG;

  U.register({
    id: 'grime',
    name: 'Grime / Grunge',
    desc: 'Tileable dirt, stains, speckles and drip streaks',
    tags: ['Texturing', 'Decals'],
    normalMap: false, // a dirt overlay / mask, not a surface: no normal map mode
    tileable: true,
    icon: U.icon('<path d="M4 5c3 1 5-1 8 0s4 3 7 2"/><path d="M6 10v6M11 9v9M16 11v4" opacity=".6"/><circle cx="18" cy="17" r="1"/><circle cx="8" cy="19" r=".8"/>'),
    params: [
      { type: 'section', label: 'Grime' },
      { key: 'amount', label: 'Amount', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.9 },
      { key: 'scale', label: 'Scale', type: 'int', min: 1, max: 16, default: 3 },
      { key: 'contrast', label: 'Contrast', type: 'range', min: 0.2, max: 4, step: 0.01, default: 1.5 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 77 },
      { type: 'section', label: 'Layers' },
      { key: 'stains', label: 'Stains', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75 },
      { key: 'mottle', label: 'Mottling', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { key: 'speckles', label: 'Speckles', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'streaks', label: 'Drip streaks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { type: 'section', label: 'Output' },
      { key: 'mode', label: 'Output', type: 'select', default: 'overlay', options: [['overlay', 'Overlay (transparent)'], ['mask', 'Grayscale mask'], ['color', 'Dirt over base color']] },
      { key: 'dirt', label: 'Dirt color', type: 'color', default: '#2b2116', show: (p) => p.mode !== 'mask' },
      { key: 'base', label: 'Base color', type: 'color', default: '#a39888', show: (p) => p.mode === 'color' },
      { key: 'invert', label: 'Invert mask', type: 'bool', default: false, show: (p) => p.mode === 'mask' },
    ],
    presets: [
      { name: 'Light grime overlay', group: 'Realistic', values: { amount: 0.55, scale: 4, contrast: 1.2, stains: 0.5, mottle: 0.35, speckles: 0.3, streaks: 0.12, seed: 12 } },
      { name: 'Grunge mask', group: 'Realistic', values: { contrast: 2.2, speckles: 0.8, mode: 'mask' } },
      { name: 'Oily floor', group: 'Realistic', values: { scale: 2, contrast: 2, stains: 0.95, mottle: 0.3, speckles: 0.2, streaks: 0, mode: 'color', dirt: '#0d0c0a', base: '#5c5e60' } },
      { name: 'Dusty concrete', group: 'Realistic', values: { amount: 1.2, scale: 4, contrast: 1.8, stains: 0.5, mottle: 0.9, speckles: 0.7, streaks: 0, mode: 'color', dirt: '#d0cabd', base: '#8e8c86' } },
      { name: 'Water stains', group: 'Realistic', values: { amount: 0.8, contrast: 2.6, stains: 0.6, mottle: 0.2, speckles: 0.05, streaks: 0.85, mode: 'color', dirt: '#6e5c40', base: '#dcd5c6' } },
      { name: 'Soot', group: 'Realistic', values: { amount: 1.1, scale: 2, contrast: 1.2, stains: 0.9, mottle: 0.6, speckles: 0, streaks: 0.25, mode: 'color', dirt: '#0a0909', base: '#8c847a' } },
      { name: 'Mossy stone', group: 'Realistic', values: { amount: 1.1, scale: 4, contrast: 2.4, stains: 0.8, mottle: 0.7, speckles: 0.6, streaks: 0.15, mode: 'color', dirt: '#3e5a22', base: '#7e7c74' } },
      { name: 'Rust bleed', group: 'Realistic', values: { scale: 4, contrast: 2.2, stains: 0.3, mottle: 0.25, speckles: 0.15, streaks: 1, mode: 'color', dirt: '#7c3a14', base: '#b9b5ad' } },
      { name: 'Mud splash', group: 'Realistic', values: { scale: 1, contrast: 2, stains: 0.5, mottle: 0.3, speckles: 1, streaks: 0, mode: 'color', dirt: '#3c2b18', base: '#a8a294' } },
      { name: 'Limescale', group: 'Realistic', values: { amount: 0.75, scale: 5, stains: 0.55, mottle: 0.6, speckles: 0.35, streaks: 0.3, mode: 'color', dirt: '#e2dfd6', base: '#4e555c' } },
      { name: 'Dirt mask (fine)', group: 'Realistic', values: { amount: 1, scale: 8, contrast: 1.2, stains: 0.4, mottle: 0.8, speckles: 0.6, streaks: 0, mode: 'mask' } },
      { name: 'Toon dirt', group: 'Stylized', values: { amount: 1, scale: 2, contrast: 4, stains: 0.8, mottle: 0, speckles: 0.6, streaks: 0, mode: 'color', dirt: '#6c4a2a', base: '#cdb88c' } },
      { name: 'Painterly grunge', group: 'Stylized', values: { amount: 1.2, scale: 2, contrast: 1.2, stains: 0.9, mottle: 0.8, speckles: 0.2, streaks: 0, mode: 'color', dirt: '#8a5a3a', base: '#e4cca4' } },
      { name: 'Comic speckle', group: 'Stylized', values: { amount: 1, scale: 1, contrast: 4, stains: 0, mottle: 0, speckles: 1, streaks: 0, mode: 'color', dirt: '#1e1e1e', base: '#f2e8d2' } },
      { name: 'Ink wash', group: 'Stylized', values: { amount: 1, contrast: 3, stains: 0.9, mottle: 0, speckles: 0, streaks: 0.6, mode: 'color', dirt: '#1c2440', base: '#e8e2d0' } },
      { name: 'Sci-fi residue', group: 'Sci-fi', values: { contrast: 2, stains: 0.6, mottle: 0.3, speckles: 0.5, streaks: 0.6, mode: 'color', dirt: '#38f0c8', base: '#262b32' } },
      { name: 'Coolant leak', group: 'Sci-fi', values: { scale: 4, contrast: 2.4, stains: 0.3, mottle: 0.1, speckles: 0.2, streaks: 1, mode: 'color', dirt: '#4ab0ff', base: '#363c44' } },
      { name: 'Blaster scorch', group: 'Sci-fi', values: { amount: 1.2, scale: 2, contrast: 3, stains: 1, mottle: 0.4, speckles: 0.2, streaks: 0, mode: 'color', dirt: '#060505', base: '#7a8189' } },
      { name: 'Alien biofilm', group: 'Sci-fi', values: { scale: 5, contrast: 2, stains: 0.6, mottle: 0.9, speckles: 0.8, streaks: 0.1, mode: 'color', dirt: '#c03aff', base: '#1a1222' } },
      { name: 'Radioactive sludge', group: 'Sci-fi', values: { amount: 1.2, scale: 3, contrast: 2.8, stains: 0.8, mottle: 0.5, speckles: 0.3, streaks: 0.4, mode: 'color', dirt: '#b4ff1a', base: '#2a2c24' } },
    ],
    render(ctx, W, H, p) {
      const sx = p.scale, sy = Math.max(1, Math.round((p.scale * H) / W));
      const dc = U.hex(p.dirt), bc = U.hex(p.base), seed = p.seed;
      const ssx = sx * 24, ssy = sy * 24;                      // speckle cells
      const tx = sx * 8, ty = Math.max(1, Math.round(sy * 0.5)); // streaks: thin across, long down
      U.pixels(ctx, W, H, (x, y, o) => {
        const u = (x + 0.5) / W, v = (y + 0.5) / H;
        let g = 0;
        if (p.stains > 0) {
          const n = U.fractal('perlin', u * sx, v * sy, sx, sy, 5, 0.55, 'fbm', seed);
          g = U.screen(g, U.clamp((n - 0.5) * p.contrast * 2.4) * p.stains);
        }
        if (p.mottle > 0) {
          const n = U.fractal('perlin', u * sx * 8, v * sy * 8, sx * 8, sy * 8, 3, 0.5, 'fbm', seed + 3);
          g = U.screen(g, U.clamp((n - 0.45) * p.contrast * 1.6) * p.mottle * 0.65);
        }
        if (p.speckles > 0) {
          const w = U.worley(u * ssx, v * ssy, ssx, ssy, seed + 7);
          const r = 0.06 + 0.16 * w.id; // varied dot sizes
          const gate = U.fractal('perlin', u * sx * 2, v * sy * 2, sx * 2, sy * 2, 2, 0.5, 'fbm', seed + 9);
          g = U.screen(g, (1 - U.smoothstep(r * 0.6, r, w.f1)) * U.smoothstep(0.42, 0.6, gate) * p.speckles);
        }
        if (p.streaks > 0) {
          const s = U.fractal('perlin', u * tx, v * ty, tx, ty, 4, 0.5, 'ridged', seed + 11);
          const gate = U.fractal('perlin', u * sx, v * sy, sx, sy, 2, 0.5, 'fbm', seed + 13);
          g = U.screen(g, U.smoothstep(0.62, 0.92, s) * U.smoothstep(0.38, 0.62, gate) * p.streaks);
        }
        g = U.clamp(g * p.amount);
        if (p.mode === 'mask') { const vv = (p.invert ? 1 - g : g) * 255; o[0] = o[1] = o[2] = vv; }
        else if (p.mode === 'overlay') { o[0] = dc[0]; o[1] = dc[1]; o[2] = dc[2]; o[3] = g * 255; }
        else { o[0] = bc[0] + (dc[0] - bc[0]) * g; o[1] = bc[1] + (dc[1] - bc[1]) * g; o[2] = bc[2] + (dc[2] - bc[2]) * g; }
      });
    },
  });
})();
