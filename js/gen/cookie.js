/* Spotlight / flashlight cookie: stacked disc + ring layers, radial falloff, streak/grain noise. */
(function () {
  'use strict';
  const U = window.UGTG;

  U.register({
    id: 'cookie',
    name: 'Spotlight Cookie',
    desc: 'Layered rings and discs with falloff and noise for light cookies',
    tags: ['Lighting', 'Shooter'],
    bg: 'black',
    icon: U.icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/>'),
    params: [
      { type: 'section', label: 'Layers' },
      {
        key: 'layers', label: 'Circle layers', type: 'list', itemLabel: 'Layer', max: 12,
        itemSummary: (l) => `${l.on ? '' : '(hidden) '}${l.type === 'ring' ? 'Ring' : 'Disc'} · ${l.blend} · r ${(+l.radius).toFixed(2)}`,
        item: [
          { key: 'on', label: 'Visible', type: 'bool', default: true },
          { key: 'type', label: 'Type', type: 'select', default: 'ring', options: [['disc', 'Disc'], ['ring', 'Ring']] },
          { key: 'blend', label: 'Blend', type: 'select', default: 'add', options: [['add', 'Add'], ['subtract', 'Subtract'], ['multiply', 'Multiply'], ['max', 'Max']] },
          { key: 'radius', label: 'Radius', type: 'range', min: 0, max: 1, step: 0.005, default: 0.5 },
          { key: 'width', label: 'Ring width', type: 'range', min: 0.005, max: 0.5, step: 0.005, default: 0.05, show: (l) => l.type === 'ring' },
          { key: 'soft', label: 'Softness', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.05 },
          { key: 'intensity', label: 'Intensity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4 },
        ],
        default: [
          { on: true, type: 'disc', blend: 'add', radius: 0.82, width: 0.05, soft: 0.22, intensity: 1 },
          { on: true, type: 'ring', blend: 'subtract', radius: 0.42, width: 0.06, soft: 0.05, intensity: 0.35 },
          { on: true, type: 'ring', blend: 'add', radius: 0.68, width: 0.03, soft: 0.04, intensity: 0.2 },
        ],
      },
      { type: 'section', label: 'Falloff' },
      { key: 'falloff', label: 'Center → edge', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4 },
      { key: 'power', label: 'Falloff curve', type: 'range', min: 0.2, max: 4, step: 0.01, default: 1.5, show: (p) => p.falloff > 0 },
      { key: 'edgeFade', label: 'Black edge (no leaks)', type: 'bool', default: true },
      { type: 'section', label: 'Noise' },
      { key: 'noiseType', label: 'Noise', type: 'select', default: 'streaks', options: [['none', 'None'], ['streaks', 'Radial streaks'], ['grain', 'Grain'], ['both', 'Both']] },
      { key: 'noiseAmt', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => p.noiseType !== 'none' },
      { key: 'noiseScale', label: 'Scale', type: 'int', min: 1, max: 32, default: 6, show: (p) => p.noiseType !== 'none' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7, show: (p) => p.noiseType !== 'none' },
      { type: 'section', label: 'Output', collapsed: true, active: (p) => p.gamma !== 1 || p.invert || p.tint !== '#ffffff' || p.alphaOut },
      { key: 'gamma', label: 'Gamma', type: 'range', min: 0.2, max: 3, step: 0.01, default: 1 },
      { key: 'invert', label: 'Invert', type: 'bool', default: false },
      { key: 'tint', label: 'Tint', type: 'color', default: '#ffffff' },
      { key: 'alphaOut', label: 'Output as alpha', type: 'bool', default: false },
    ],
    presets: [
      // Realistic
      { name: 'Cheap LED (reflector rings)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.8, soft: 0.25, intensity: 0.45 },
        { type: 'disc', radius: 0.22, soft: 0.08, intensity: 0.7 },
        { type: 'ring', radius: 0.3, width: 0.02, soft: 0.02, intensity: 0.35 },
        { type: 'ring', radius: 0.45, width: 0.015, soft: 0.02, intensity: 0.25 },
        { type: 'ring', radius: 0.38, width: 0.03, soft: 0.03, blend: 'subtract', intensity: 0.2 },
        { type: 'ring', radius: 0.62, width: 0.02, soft: 0.03, intensity: 0.15 },
      ], falloff: 0.3, noiseType: 'streaks', noiseAmt: 0.12, tint: '#ffffff' } },
      { name: 'Tactical torch (hotspot + spill)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.88, soft: 0.3, intensity: 0.3 },
        { type: 'disc', radius: 0.26, soft: 0.12, intensity: 0.8 },
        { type: 'ring', radius: 0.32, width: 0.03, soft: 0.04, intensity: 0.15 },
      ], falloff: 0.2, noiseType: 'streaks', noiseAmt: 0.08, noiseScale: 10 } },
      { name: 'Old incandescent bulb', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.75, soft: 0.3, intensity: 0.85 },
        { type: 'disc', radius: 0.1, soft: 0.08, blend: 'subtract', intensity: 0.35 },
        { type: 'ring', radius: 0.35, width: 0.04, soft: 0.06, blend: 'subtract', intensity: 0.2 },
        { type: 'ring', radius: 0.55, width: 0.05, soft: 0.05, intensity: 0.15 },
      ], falloff: 0.5, power: 1.2, noiseType: 'both', noiseAmt: 0.25, noiseScale: 5, tint: '#ffffff' } },
      { name: 'Maglite (dark center hole)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.7, soft: 0.12, intensity: 0.75 },
        { type: 'disc', radius: 0.16, soft: 0.06, blend: 'subtract', intensity: 0.65 },
        { type: 'ring', radius: 0.22, width: 0.05, soft: 0.04, intensity: 0.35 },
        { type: 'ring', radius: 0.68, width: 0.03, soft: 0.03, intensity: 0.3 },
      ], falloff: 0.15, noiseType: 'streaks', noiseAmt: 0.15, tint: '#ffffff' } },
      { name: 'Headlamp (wide flood)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.9, soft: 0.45, intensity: 0.8 },
        { type: 'disc', radius: 0.4, soft: 0.3, intensity: 0.25 },
      ], falloff: 0.55, power: 1, noiseType: 'grain', noiseAmt: 0.06, noiseScale: 4, tint: '#ffffff' } },
      { name: 'Car headlight (projector)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.72, soft: 0.02, intensity: 0.7 },
        { type: 'disc', radius: 0.35, soft: 0.2, intensity: 0.35 },
        { type: 'ring', radius: 0.71, width: 0.02, soft: 0.015, intensity: 0.4 },
      ], falloff: 0.25, noiseType: 'none', tint: '#ffffff' } },
      { name: 'Stage spotlight (hard edge)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.78, soft: 0.01, intensity: 1 },
      ], falloff: 0.1, noiseType: 'none', tint: '#ffffff' } },
      { name: 'Follow spot (soft)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.7, soft: 0.2, intensity: 1 },
        { type: 'ring', radius: 0.66, width: 0.03, soft: 0.04, intensity: 0.2 },
      ], falloff: 0.25, noiseType: 'none' } },
      { name: 'Searchlight', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.5, soft: 0.04, intensity: 1 },
        { type: 'disc', radius: 0.9, soft: 0.35, intensity: 0.15 },
        { type: 'ring', radius: 0.3, width: 0.01, soft: 0.02, blend: 'subtract', intensity: 0.15 },
        { type: 'ring', radius: 0.4, width: 0.01, soft: 0.02, blend: 'subtract', intensity: 0.15 },
      ], falloff: 0.1, noiseType: 'streaks', noiseAmt: 0.2, noiseScale: 16, tint: '#ffffff' } },
      { name: 'Foliage-dappled light', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.88, soft: 0.25, intensity: 1 },
      ], falloff: 0.3, noiseType: 'grain', noiseAmt: 1, noiseScale: 6, gamma: 1.6, seed: 12, tint: '#ffffff' } },
      { name: 'Dirty lens torch', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.8, soft: 0.25, intensity: 0.6 },
        { type: 'disc', radius: 0.3, soft: 0.15, intensity: 0.5 },
      ], falloff: 0.35, noiseType: 'both', noiseAmt: 0.55, noiseScale: 9, seed: 21 } },
      // Stylized
      { name: 'Toon spotlight (bands)', group: 'Stylized', values: { layers: [
        { type: 'disc', radius: 0.8, soft: 0, intensity: 0.35 },
        { type: 'disc', radius: 0.55, soft: 0, intensity: 0.3 },
        { type: 'disc', radius: 0.3, soft: 0, intensity: 0.35 },
      ], falloff: 0, noiseType: 'none' } },
      { name: 'Target rings', group: 'Stylized', values: { layers: [
        { type: 'disc', radius: 0.12, soft: 0.02, intensity: 1 },
        { type: 'ring', radius: 0.3, width: 0.06, soft: 0.02, intensity: 0.85 },
        { type: 'ring', radius: 0.52, width: 0.06, soft: 0.02, intensity: 0.65 },
        { type: 'ring', radius: 0.74, width: 0.06, soft: 0.02, intensity: 0.45 },
      ], falloff: 0, noiseType: 'none' } },
      { name: 'Sunburst rays', group: 'Stylized', values: { layers: [
        { type: 'disc', radius: 0.85, soft: 0.4, intensity: 1 },
      ], falloff: 0.5, power: 0.8, noiseType: 'streaks', noiseAmt: 1, noiseScale: 4, gamma: 1.4, tint: '#ffffff' } },
      { name: 'Soft vignette', group: 'Stylized', values: { layers: [
        { type: 'disc', radius: 0.9, soft: 0.5, intensity: 1 },
      ], falloff: 0, noiseType: 'none', edgeFade: false } },
      // Game-inspired
      { name: 'Tarkov-style tactical light', group: 'Game-inspired', values: { layers: [
        { type: 'disc', radius: 0.85, soft: 0.3, intensity: 0.4 },
        { type: 'disc', radius: 0.2, soft: 0.06, intensity: 1 },
        { type: 'ring', radius: 0.27, width: 0.04, soft: 0.04, intensity: 0.35 },
        { type: 'ring', radius: 0.5, width: 0.04, soft: 0.04, blend: 'subtract', intensity: 0.15 },
        { type: 'ring', radius: 0.6, width: 0.02, soft: 0.03, intensity: 0.12 },
      ], falloff: 0.3, noiseType: 'streaks', noiseAmt: 0.15, noiseScale: 12, tint: '#ffffff' } },
      { name: 'DayZ-style cheap flashlight', group: 'Game-inspired', values: { layers: [
        { type: 'disc', radius: 0.5, soft: 0.3, intensity: 0.5 },
        { type: 'ring', radius: 0.18, width: 0.04, soft: 0.04, intensity: 0.3 },
        { type: 'ring', radius: 0.42, width: 0.08, soft: 0.06, intensity: 0.15 },
        { type: 'ring', radius: 0.7, width: 0.06, soft: 0.08, intensity: 0.08 },
      ], falloff: 0.6, noiseType: 'grain', noiseAmt: 0.3, noiseScale: 12, tint: '#ffffff' } },
      { name: 'Battlefield-style blinding light', group: 'Game-inspired', values: { layers: [
        { type: 'disc', radius: 0.92, soft: 0.2, intensity: 1 },
        { type: 'disc', radius: 0.45, soft: 0.2, intensity: 1 },
      ], falloff: 0.1, noiseType: 'none', gamma: 0.5, tint: '#ffffff' } },
      { name: 'CoD-style weapon light', group: 'Game-inspired', values: { layers: [
        { type: 'disc', radius: 0.9, soft: 0.3, intensity: 0.7 },
        { type: 'disc', radius: 0.42, soft: 0.2, intensity: 0.5 },
      ], falloff: 0.3, noiseType: 'streaks', noiseAmt: 0.06, noiseScale: 14, tint: '#ffffff' } },
      { name: 'Doom-style harsh flashlight', group: 'Game-inspired', values: { layers: [
        { type: 'disc', radius: 0.55, soft: 0.06, intensity: 1 },
        { type: 'ring', radius: 0.5, width: 0.03, soft: 0.02, blend: 'subtract', intensity: 0.4 },
        { type: 'ring', radius: 0.25, width: 0.02, soft: 0.02, blend: 'subtract', intensity: 0.25 },
      ], falloff: 0.2, noiseType: 'grain', noiseAmt: 0.2, noiseScale: 14, tint: '#ffffff' } },
      { name: 'Siege-style weapon light', group: 'Game-inspired', values: { layers: [
        { type: 'disc', radius: 0.82, soft: 0.28, intensity: 0.5 },
        { type: 'disc', radius: 0.18, soft: 0.1, intensity: 0.7 },
        { type: 'ring', radius: 0.4, width: 0.015, soft: 0.02, intensity: 0.2 },
      ], falloff: 0.35, noiseType: 'none', tint: '#ffffff' } },
      // Sci-fi
      { name: 'Hologram projector', group: 'Sci-fi', values: { layers: [
        { type: 'disc', radius: 0.8, soft: 0.1, intensity: 0.25 },
        { type: 'ring', radius: 0.2, width: 0.015, soft: 0.01, intensity: 0.9 },
        { type: 'ring', radius: 0.35, width: 0.015, soft: 0.01, intensity: 0.8 },
        { type: 'ring', radius: 0.5, width: 0.015, soft: 0.01, intensity: 0.7 },
        { type: 'ring', radius: 0.65, width: 0.015, soft: 0.01, intensity: 0.6 },
        { type: 'ring', radius: 0.78, width: 0.03, soft: 0.01, intensity: 0.9 },
      ], falloff: 0, noiseType: 'streaks', noiseAmt: 0.3, noiseScale: 24, tint: '#ffffff' } },
      { name: 'Tractor beam', group: 'Sci-fi', values: { layers: [
        { type: 'disc', radius: 0.75, soft: 0.05, intensity: 0.6 },
        { type: 'ring', radius: 0.74, width: 0.04, soft: 0.04, intensity: 0.5 },
        { type: 'disc', radius: 0.35, soft: 0.3, blend: 'subtract', intensity: 0.25 },
      ], falloff: 0, noiseType: 'grain', noiseAmt: 0.35, noiseScale: 18, tint: '#ffffff' } },
      { name: 'Plasma helmet lamp', group: 'Sci-fi', values: { layers: [
        { type: 'disc', radius: 0.7, soft: 0.3, intensity: 0.8 },
        { type: 'ring', radius: 0.3, width: 0.08, soft: 0.06, intensity: 0.3 },
      ], falloff: 0.4, noiseType: 'streaks', noiseAmt: 0.5, noiseScale: 5, tint: '#ffffff' } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), tint = U.hex(p.tint), P = p.noiseScale * 4;
      const layers = p.layers.filter((l) => l.on);
      const streaks = p.noiseType === 'streaks' || p.noiseType === 'both';
      const grain = p.noiseType === 'grain' || p.noiseType === 'both';
      U.pixels(ctx, W, H, (px, py, o) => {
        const x = (px + 0.5 - W / 2) / (S / 2), y = (py + 0.5 - H / 2) / (S / 2), r = Math.hypot(x, y);
        let v = 0;
        for (const l of layers) {
          const m = l.type === 'ring'
            ? 1 - U.smoothstep(l.width / 2, l.width / 2 + l.soft + 1e-3, Math.abs(r - l.radius))
            : 1 - U.smoothstep(l.radius - l.soft, l.radius + 1e-3, r);
          switch (l.blend) {
            case 'subtract': v -= m * l.intensity; break;
            case 'multiply': v *= 1 - l.intensity * (1 - m); break;
            case 'max': v = Math.max(v, m * l.intensity); break;
            default: v += m * l.intensity;
          }
        }
        v = U.clamp(v);
        if (p.falloff > 0) v *= 1 - p.falloff * Math.pow(Math.min(1, r), p.power);
        if (p.noiseType !== 'none' && p.noiseAmt > 0 && v > 0) {
          let n = 0, c = 0;
          if (streaks) { n += U.fractal('perlin', (Math.atan2(y, x) / U.TAU + 0.5) * P, r * p.noiseScale * 0.4, P, 0, 3, 0.55, 'fbm', p.seed); c++; }
          if (grain) { n += U.fractal('perlin', x * p.noiseScale + 50, y * p.noiseScale + 50, 0, 0, 4, 0.5, 'fbm', p.seed + 3); c++; }
          v *= 1 + p.noiseAmt * (n / c - 0.5) * 3;
        }
        if (p.edgeFade) v *= 1 - U.smoothstep(0.92, 1, r);
        v = Math.pow(U.clamp(v), p.gamma);
        if (p.invert) v = 1 - v;
        if (p.alphaOut) { o[0] = tint[0]; o[1] = tint[1]; o[2] = tint[2]; o[3] = v * 255; }
        else { o[0] = tint[0] * v; o[1] = tint[1] * v; o[2] = tint[2] * v; }
      });
    },
  });
})();
