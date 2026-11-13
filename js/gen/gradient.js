/* Gradients / ramps: linear, radial, angular, diamond, square; any number of color stops,
   repeat / mirror, posterized steps (toon ramps), bias and dithering against banding. */
(function () {
  'use strict';
  const U = window.UGTG;
  const TAU = Math.PI * 2;
  const S = (pos, color, alpha = 1) => ({ pos, color, alpha });
  // n hard-edged bands cycling through the given colors (2 stops per band)
  const bands = (n, ...cols) => Array.from({ length: n }, (_, i) => [S(i / n, cols[i % cols.length]), S((i + 1) / n, cols[i % cols.length])]).flat();

  const PRESETS = {
    bw: [S(0, '#000000'), S(1, '#ffffff')],
    sunset: [S(0, '#1b1036'), S(0.4, '#a0306e'), S(0.7, '#ff7a3d'), S(1, '#ffe08a')],
    fire: [S(0, '#000000', 0), S(0.25, '#5a0a00'), S(0.55, '#ff4a0a'), S(0.8, '#ffc547'), S(1, '#fff8e0')],
    toon: [S(0, '#202833'), S(0.5, '#6f8296'), S(1, '#e6eef5')],
    rainbow: [S(0, '#ff3b3b'), S(0.2, '#ffb02e'), S(0.4, '#f7f04a'), S(0.6, '#3fdc7a'), S(0.8, '#3a8cff'), S(1, '#a456ff')],
    mint: [S(0, '#06150f'), S(0.5, '#2c8f6c'), S(1, '#c9fbe6')],
    fade: [S(0, '#ffffff', 1), S(1, '#ffffff', 0)],
  };

  U.register({
    id: 'gradient',
    name: 'Gradient',
    desc: 'Linear, radial, angular gradients and ramps / LUTs with color stops',
    tags: ['UI', 'Texturing'],
    icon: U.icon('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M8 5v14M12.5 5v14M17 5v14" opacity=".35"/>'),
    params: [
      { type: 'section', label: 'Gradient' },
      {
        key: 'preset', label: 'Preset', type: 'select', default: 'sunset',
        options: [['custom', 'Custom'], ['bw', 'Black → white'], ['sunset', 'Sunset'], ['fire', 'Fire ramp'], ['toon', 'Toon (3 tones)'], ['rainbow', 'Rainbow'], ['mint', 'Mint'], ['fade', 'White → transparent']],
        apply: (v, p) => { if (PRESETS[v]) { p.stops = U.clone(PRESETS[v]); if (v === 'toon') p.steps = 3; } },
      },
      { key: 'shape', label: 'Shape', type: 'select', default: 'linear', options: [['linear', 'Linear'], ['radial', 'Radial'], ['angular', 'Angular (conic)'], ['diamond', 'Diamond'], ['square', 'Square']] },
      { key: 'angle', label: 'Angle', type: 'range', min: -180, max: 180, step: 1, default: 90, show: (p) => p.shape !== 'radial' },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.05, max: 3, step: 0.01, default: 1 },
      { key: 'cx', label: 'Center X', type: 'range', min: -1, max: 1, step: 0.01, default: 0, show: (p) => p.shape !== 'linear' },
      { key: 'cy', label: 'Center Y', type: 'range', min: -1, max: 1, step: 0.01, default: 0, show: (p) => p.shape !== 'linear' },
      { key: 'repeat', label: 'Repeat', type: 'select', default: 'none', options: [['none', 'None (clamp)'], ['repeat', 'Repeat'], ['mirror', 'Mirror']] },
      { key: 'reverse', label: 'Reverse', type: 'bool', default: false },
      { type: 'section', label: 'Color stops' },
      {
        key: 'stops', label: 'Stops', type: 'list', itemLabel: 'Stop', max: 16,
        itemSummary: (s) => `${(+s.pos).toFixed(2)} · ${s.color}${s.alpha < 1 ? ' · ' + Math.round(s.alpha * 100) + '%' : ''}`,
        default: U.clone(PRESETS.sunset),
        item: [
          { key: 'pos', label: 'Position', type: 'range', min: 0, max: 1, step: 0.005, default: 0.5 },
          { key: 'color', label: 'Color', type: 'color', default: '#ffffff' },
          { key: 'alpha', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
        ],
      },
      { type: 'section', label: 'Shaping', collapsed: true, active: (p) => p.bias !== 1 || p.steps >= 2 || p.dither > 0 },
      { key: 'bias', label: 'Bias', type: 'range', min: 0.2, max: 5, step: 0.01, default: 1, tip: '<1 pushes toward the end color, >1 toward the start' },
      { key: 'steps', label: 'Steps (0 = smooth)', type: 'int', min: 0, max: 32, default: 0, tip: 'Posterize into hard bands, e.g. 3 for a toon ramp' },
      { key: 'dither', label: 'Dither', type: 'range', min: 0, max: 4, step: 0.1, default: 1, tip: 'Adds a little noise to hide 8-bit banding' },
    ],
    presets: [
      { name: 'Day sky', group: 'Realistic', values: { preset: 'custom', stops: [S(0, '#1f5fc8'), S(0.55, '#7fb6ee'), S(1, '#e6f2fb')] } },
      { name: 'Sunset sky', group: 'Realistic', values: { preset: 'custom', stops: [{ pos: 0, color: '#1b1446', alpha: 1 }, { pos: 0.45, color: '#a33b6b', alpha: 1 }, { pos: 0.75, color: '#f2733a', alpha: 1 }, { pos: 1, color: '#ffd27a', alpha: 1 }], bias: 0.8 } },
      { name: 'Night sky', group: 'Realistic', values: { preset: 'custom', bias: 1.6, stops: [S(0, '#010208'), S(0.6, '#0b1638'), S(1, '#25386b')] } },
      { name: 'Ocean depth', group: 'Realistic', values: { preset: 'custom', stops: [S(0, '#a5ecf2'), S(0.3, '#1586b0'), S(1, '#020f24')] } },
      { name: 'Chrome ramp', group: 'Realistic', values: { preset: 'custom', stops: [S(0, '#ffffff'), S(0.35, '#8a9099'), S(0.5, '#23272d'), S(0.62, '#5d636b'), S(1, '#e3e8ee')] } },
      { name: 'Gold ramp', group: 'Realistic', values: { preset: 'custom', stops: [S(0, '#fff2bf'), S(0.4, '#d4a53a'), S(0.65, '#7a4e10'), S(1, '#f0cf78')] } },
      { name: 'Copper ramp', group: 'Realistic', values: { preset: 'custom', stops: [S(0, '#ffd2b0'), S(0.45, '#c46a35'), S(0.7, '#5a2410'), S(1, '#e39a6b')] } },
      { name: 'Fire ramp', group: 'Realistic', values: { preset: 'fire', angle: 0 } },
      { name: 'Heatmap (jet)', group: 'Realistic', values: { preset: 'custom', angle: 0, stops: [S(0, '#00007f'), S(0.15, '#0000ff'), S(0.38, '#00ffff'), S(0.62, '#ffff00'), S(0.85, '#ff0000'), S(1, '#7f0000')] } },
      { name: 'Thermal camera', group: 'Realistic', values: { preset: 'custom', angle: 0, stops: [S(0, '#000000'), S(0.3, '#3a0a6e'), S(0.55, '#c22b6b'), S(0.8, '#ff9b2b'), S(1, '#ffffd0')] } },
      { name: 'Vignette', group: 'Realistic', values: { preset: 'custom', shape: 'radial', scale: 1.45, stops: [S(0.35, '#000000', 0), S(1, '#000000', 0.85)] } },
      { name: 'Toon ramp', group: 'Stylized', values: { preset: 'toon', angle: 0 } },
      { name: 'Toon skin ramp', group: 'Stylized', values: { preset: 'custom', angle: 0, steps: 4, stops: [S(0, '#6b3a3a'), S(0.5, '#d9907a'), S(1, '#ffe3d1')] } },
      { name: 'Rainbow', group: 'Stylized', values: { preset: 'rainbow', angle: 0 } },
      { name: 'Synthwave sky', group: 'Stylized', values: { preset: 'custom', steps: 10, stops: [S(0, '#1a0533'), S(0.45, '#6b1a7a'), S(0.8, '#ff2d95'), S(1, '#ffb86b')] } },
      { name: 'Sunburst', group: 'Stylized', values: { preset: 'custom', shape: 'angular', dither: 0, stops: bands(8, '#ffcf3f', '#ff9a1f') } },
      { name: 'Target rings', group: 'Stylized', values: { preset: 'custom', shape: 'radial', scale: 0.25, repeat: 'repeat', dither: 0, stops: bands(2, '#e8333a', '#f7f3ea') } },
      { name: 'Pastel bloom', group: 'Stylized', values: { preset: 'custom', shape: 'radial', scale: 1.3, stops: [S(0, '#fff4d6'), S(0.5, '#ffc2dc'), S(1, '#b7c6ff')] } },
      { name: 'Holo foil', group: 'Stylized', values: { preset: 'custom', shape: 'angular', angle: -30, stops: [S(0, '#ffb3e6'), S(0.25, '#b3f0ff'), S(0.5, '#d4ffb3'), S(0.75, '#fff0b3'), S(1, '#ffb3e6')] } },
      { name: 'Neon horizon', group: 'Sci-fi', values: { preset: 'custom', bias: 1.8, stops: [S(0, '#000000'), S(0.6, '#2b0a5a'), S(0.92, '#ff2fd6'), S(1, '#ffd1f6')] } },
      { name: 'UI glass', group: 'Sci-fi', values: { preset: 'custom', stops: [S(0, '#ffffff', 0.4), S(0.48, '#ffffff', 0.1), S(0.5, '#bfe6ff', 0.04), S(1, '#7fd0ff', 0.22)] } },
      { name: 'Scanlines', group: 'Sci-fi', values: { preset: 'custom', scale: 0.06, repeat: 'repeat', dither: 0, stops: [S(0, '#00e5ff', 0.35), S(0.5, '#00e5ff', 0.35), S(0.5, '#00e5ff', 0), S(1, '#00e5ff', 0)] } },
      { name: 'Radar sweep', group: 'Sci-fi', values: { preset: 'custom', shape: 'angular', angle: -90, reverse: true, stops: [S(0, '#001408'), S(0.55, '#001408'), S(0.995, '#00ff88'), S(1, '#d8ffe9')] } },
      { name: 'Plasma core', group: 'Sci-fi', values: { preset: 'custom', shape: 'radial', stops: [S(0, '#ffffff'), S(0.15, '#c9a3ff'), S(0.45, '#6a1bd6', 0.8), S(1, '#12002e', 0)] } },
      { name: 'Tech square pulse', group: 'Sci-fi', values: { preset: 'custom', shape: 'square', angle: 0, scale: 0.3, repeat: 'mirror', stops: [S(0, '#00151f'), S(0.85, '#00384f'), S(1, '#00e5ff')] } },
    ],
    render(ctx, W, H, p) {
      const stops = p.stops.slice().sort((a, b) => a.pos - b.pos).map((s) => ({ pos: s.pos, c: U.hex(s.color), a: s.alpha }));
      if (!stops.length) return;
      const ang = (p.angle * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
      const span = Math.abs(ca) + Math.abs(sa);
      const sample = (t, o) => {
        if (t <= stops[0].pos) { const s = stops[0]; o[0] = s.c[0]; o[1] = s.c[1]; o[2] = s.c[2]; return s.a; }
        for (let i = 1; i < stops.length; i++) {
          const b = stops[i];
          if (t <= b.pos) {
            const a = stops[i - 1], f = b.pos > a.pos ? (t - a.pos) / (b.pos - a.pos) : 1;
            o[0] = a.c[0] + (b.c[0] - a.c[0]) * f; o[1] = a.c[1] + (b.c[1] - a.c[1]) * f; o[2] = a.c[2] + (b.c[2] - a.c[2]) * f;
            return a.a + (b.a - a.a) * f;
          }
        }
        const s = stops[stops.length - 1]; o[0] = s.c[0]; o[1] = s.c[1]; o[2] = s.c[2]; return s.a;
      };
      U.pixels(ctx, W, H, (x, y, o) => {
        const nx = ((x + 0.5) / W) * 2 - 1, ny = ((y + 0.5) / H) * 2 - 1;
        const dx = nx - p.cx, dy = ny - p.cy;
        const rx = dx * ca + dy * sa, ry = -dx * sa + dy * ca;
        let t;
        switch (p.shape) {
          case 'radial': t = Math.hypot(dx, dy) / p.scale; break;
          case 'angular': t = U.mod(Math.atan2(dy, dx) - ang, TAU) / TAU; break;
          case 'diamond': t = (Math.abs(rx) + Math.abs(ry)) / p.scale; break;
          case 'square': t = Math.max(Math.abs(rx), Math.abs(ry)) / p.scale; break;
          default: t = ((nx * ca + ny * sa) / span / p.scale) * 0.5 + 0.5;
        }
        if (p.repeat === 'repeat') t = t - Math.floor(t);
        else if (p.repeat === 'mirror') t = 1 - Math.abs(2 * (t / 2 - Math.floor(t / 2)) - 1);
        t = U.clamp(t);
        if (p.reverse) t = 1 - t;
        if (p.bias !== 1) t = Math.pow(t, p.bias);
        if (p.steps >= 2) t = Math.min(p.steps - 1, Math.floor(t * p.steps)) / (p.steps - 1);
        const a = sample(t, o);
        const d = p.dither > 0 && p.steps < 2 ? (U.hash(x, y, 7) - 0.5) * p.dither : 0;
        o[0] += d; o[1] += d; o[2] += d;
        o[3] = a * 255 + d;
      });
    },
  });
})();
