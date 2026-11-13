/* Basic shapes: rect, ellipse, triangle, polygon, star, ring, capsule, cross, arrow. */
(function () {
  'use strict';
  const U = window.UGTG;
  const is = (...l) => (p) => l.includes(p.shape);

  const ngon = (n, ax, ay) => Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * U.TAU) / n;
    return [Math.cos(a) * ax, Math.sin(a) * ay];
  });
  const star = (n, ax, ay, inner) => Array.from({ length: n * 2 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / n, k = i % 2 ? inner : 1;
    return [Math.cos(a) * ax * k, Math.sin(a) * ay * k];
  });

  U.register({
    id: 'shape',
    name: 'Shape',
    desc: 'Rects, circles, ellipses, polygons, stars, rings, arrows',
    tags: ['UI', 'VFX'],
    icon: U.icon('<rect x="3.5" y="11" width="9" height="9" rx="1"/><circle cx="16" cy="8" r="4.5"/>'),
    params: [
      { type: 'section', label: 'Shape' },
      {
        key: 'shape', label: 'Shape', type: 'select', default: 'ellipse',
        options: [['rect', 'Rectangle'], ['ellipse', 'Circle / Ellipse'], ['triangle', 'Triangle'], ['rtriangle', 'Right triangle'], ['diamond', 'Diamond'],
          ['polygon', 'Polygon'], ['star', 'Star'], ['ring', 'Ring'], ['capsule', 'Capsule'], ['cross', 'Cross'], ['arrow', 'Arrow']],
      },
      { key: 'w', label: 'Width', type: 'range', min: 0.02, max: 1, step: 0.01, default: 0.7 },
      { key: 'h', label: 'Height', type: 'range', min: 0.02, max: 1, step: 0.01, default: 0.7 },
      { key: 'sides', label: 'Sides / points', type: 'int', min: 3, max: 24, default: 6, show: is('polygon', 'star') },
      { key: 'inner', label: 'Inner radius', type: 'range', min: 0.05, max: 0.95, step: 0.01, default: 0.5, show: is('star', 'ring') },
      { key: 'thick', label: 'Bar thickness', type: 'range', min: 0.05, max: 0.9, step: 0.01, default: 0.3, show: is('cross', 'arrow') },
      { key: 'radius', label: 'Corner radius', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0, show: (p) => !['ellipse', 'ring', 'capsule'].includes(p.shape) },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: 0 },
      { type: 'section', label: 'Fill' },
      { key: 'fillMode', label: 'Fill', type: 'select', default: 'solid', options: [['solid', 'Solid'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient'], ['none', 'None']] },
      { key: 'color1', label: 'Color', type: 'color', default: '#ffffff', show: (p) => p.fillMode !== 'none' },
      { key: 'color2', label: 'Color 2', type: 'color', default: '#ff8a3d', show: (p) => p.fillMode === 'linear' || p.fillMode === 'radial' },
      { key: 'gradAngle', label: 'Gradient angle', type: 'range', min: -180, max: 180, step: 1, default: 90, show: (p) => p.fillMode === 'linear' },
      { type: 'section', label: 'Stroke (px @ 512)' },
      { key: 'stroke', label: 'Outline', type: 'bool', default: false },
      { key: 'strokeW', label: 'Width', type: 'range', min: 0.5, max: 64, step: 0.5, default: 8, show: (p) => p.stroke },
      { key: 'strokeColor', label: 'Color', type: 'color', default: '#000000', show: (p) => p.stroke },
      { type: 'section', label: 'Output', collapsed: true, active: (p) => p.feather > 0 || !p.transparent },
      { key: 'feather', label: 'Edge blur', type: 'range', min: 0, max: 64, step: 0.5, default: 0 },
      { key: 'transparent', label: 'Transparent background', type: 'bool', default: true },
      { key: 'bg', label: 'Background', type: 'color', default: '#000000', show: (p) => !p.transparent },
    ],
    presets: [
      { name: 'Soft blob mask', group: 'Realistic', values: { w: 0.6, h: 0.6, feather: 48 } },
      { name: 'Contact shadow', group: 'Realistic', values: { w: 0.8, h: 0.32, color1: '#000000', feather: 36 } },
      { name: 'Gold coin', group: 'Realistic', values: { w: 0.8, h: 0.8, fillMode: 'radial', color1: '#ffe9a0', color2: '#b67d14', stroke: true, strokeW: 14, strokeColor: '#7a5208' } },
      { name: 'Stop sign', group: 'Realistic', values: { shape: 'polygon', sides: 8, w: 0.85, h: 0.85, rotation: 22.5, color1: '#c8102e', stroke: true, strokeW: 16, strokeColor: '#ffffff' } },
      { name: 'Warning sign', group: 'Realistic', values: { shape: 'triangle', w: 0.85, h: 0.75, radius: 0.08, color1: '#ffcc00', stroke: true, strokeW: 20, strokeColor: '#111111' } },
      { name: 'Medicine pill', group: 'Realistic', values: { shape: 'capsule', w: 0.8, h: 0.3, rotation: -30, fillMode: 'linear', gradAngle: 0, color1: '#e63946', color2: '#f1f1f1', stroke: true, strokeW: 4, strokeColor: '#7d1d25' } },
      { name: 'Round button', group: 'Stylized', aspect: '2:1', values: { shape: 'rect', w: 0.9, h: 0.7, radius: 0.25, fillMode: 'linear', color1: '#5fb0ff', color2: '#1d5fd1', stroke: true, strokeW: 6, strokeColor: '#0d2f6b' } },
      { name: 'Health bar cap', group: 'Stylized', aspect: '4:1', values: { shape: 'capsule', w: 0.96, h: 0.6, fillMode: 'linear', color1: '#ff7b7b', color2: '#b3122a', stroke: true, strokeW: 6, strokeColor: '#2a0508' } },
      { name: 'Star badge', group: 'Stylized', values: { shape: 'star', sides: 5, inner: 0.45, w: 0.85, h: 0.85, radius: 0.04, fillMode: 'linear', color1: '#ffe066', color2: '#f59f00', stroke: true, strokeW: 10, strokeColor: '#7a4a00' } },
      { name: 'Hex badge', group: 'Stylized', values: { shape: 'polygon', w: 0.8, h: 0.8, radius: 0.06, fillMode: 'radial', color1: '#8ee88f', color2: '#2b9348', stroke: true, strokeW: 12, strokeColor: '#ffffff' } },
      { name: 'Arrow icon', group: 'Stylized', values: { shape: 'arrow', w: 0.8, h: 0.55, thick: 0.35, radius: 0.04, stroke: true, strokeW: 8, strokeColor: '#222222' } },
      { name: 'Health plus', group: 'Stylized', values: { shape: 'cross', w: 0.7, h: 0.7, thick: 0.35, radius: 0.12, color1: '#3ddc84', stroke: true, strokeW: 8, strokeColor: '#0b3d22' } },
      { name: 'Notification dot', group: 'Stylized', values: { w: 0.5, h: 0.5, color1: '#ff3b30', stroke: true, strokeW: 16, strokeColor: '#ffffff' } },
      { name: 'Gem', group: 'Stylized', values: { shape: 'diamond', w: 0.55, h: 0.85, fillMode: 'linear', gradAngle: 45, color1: '#b9f2ff', color2: '#3a86ff', stroke: true, strokeW: 6, strokeColor: '#0b2a6b' } },
      { name: 'Sparkle', group: 'Stylized', values: { shape: 'star', sides: 4, inner: 0.18, w: 0.9, h: 0.9, color1: '#fff6c9', feather: 2 } },
      { name: 'Glow orb', group: 'Sci-fi', values: { w: 0.6, h: 0.6, fillMode: 'radial', color1: '#ffffff', color2: '#00a8ff', feather: 24 } },
      { name: 'Hologram hex', group: 'Sci-fi', values: { shape: 'polygon', w: 0.85, h: 0.85, fillMode: 'radial', color1: '#062a30', color2: '#00ffd0', stroke: true, strokeW: 5, strokeColor: '#b6fff4', feather: 2 } },
      { name: 'Energy ring', group: 'Sci-fi', values: { shape: 'ring', w: 0.8, h: 0.8, inner: 0.82, color1: '#9ff0ff', feather: 8 } },
      { name: 'Neon triangle', group: 'Sci-fi', values: { shape: 'triangle', w: 0.8, h: 0.7, radius: 0.08, fillMode: 'none', stroke: true, strokeW: 10, strokeColor: '#ff3df0', feather: 1.5 } },
      { name: 'Plasma burst', group: 'Sci-fi', values: { shape: 'star', sides: 12, inner: 0.25, w: 0.9, h: 0.9, fillMode: 'radial', color1: '#ffffff', color2: '#8a2be2', feather: 4 } },
      { name: 'Shield dome', group: 'Sci-fi', values: { w: 0.9, h: 0.9, fillMode: 'radial', color1: '#04102a', color2: '#3fa9ff', stroke: true, strokeW: 3, strokeColor: '#bfe6ff' } },
      { name: 'Boost arrow', group: 'Sci-fi', values: { shape: 'arrow', w: 0.6, h: 0.8, thick: 0.25, rotation: -90, fillMode: 'linear', gradAngle: 0, color1: '#ffe14a', color2: '#ff6a00', feather: 1 } },
      { name: 'Data panel', group: 'Sci-fi', values: { shape: 'rect', w: 0.9, h: 0.6, radius: 0.1, fillMode: 'linear', color1: '#0d2638', color2: '#04080f', stroke: true, strokeW: 4, strokeColor: '#36d6ff', transparent: false, bg: '#000000' } },
    ],
    render(ctx, W, H, p) {
      const k = Math.min(W, H) / 512;
      if (!p.transparent) { ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H); }
      const sw = p.stroke ? p.strokeW * k : 0;
      const ax = Math.max(1, (p.w * W) / 2 - sw / 2), ay = Math.max(1, (p.h * H) / 2 - sw / 2);
      const r = p.radius * 2 * Math.min(ax, ay);
      const rect = [[-ax, -ay], [ax, -ay], [ax, ay], [-ax, ay]];

      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate((p.rotation * Math.PI) / 180);
      if (p.feather > 0) ctx.filter = `blur(${p.feather * k}px)`;
      ctx.beginPath();
      let rule = 'nonzero';
      switch (p.shape) {
        case 'rect': U.polyPath(ctx, rect, r); break;
        case 'ellipse': ctx.ellipse(0, 0, ax, ay, 0, 0, U.TAU); break;
        case 'capsule': U.polyPath(ctx, rect, Math.min(ax, ay)); break;
        case 'triangle': U.polyPath(ctx, [[0, -ay], [ax, ay], [-ax, ay]], r); break;
        case 'rtriangle': U.polyPath(ctx, [[-ax, -ay], [ax, ay], [-ax, ay]], r); break;
        case 'diamond': U.polyPath(ctx, [[0, -ay], [ax, 0], [0, ay], [-ax, 0]], r); break;
        case 'polygon': U.polyPath(ctx, ngon(p.sides, ax, ay), r); break;
        case 'star': U.polyPath(ctx, star(p.sides, ax, ay, p.inner), r); break;
        case 'ring':
          ctx.ellipse(0, 0, ax, ay, 0, 0, U.TAU);
          ctx.moveTo(ax * p.inner, 0);
          ctx.ellipse(0, 0, ax * p.inner, ay * p.inner, 0, 0, U.TAU);
          rule = 'evenodd';
          break;
        case 'cross': {
          const t = p.thick * Math.min(ax, ay);
          U.polyPath(ctx, [[-t, -ay], [t, -ay], [t, -t], [ax, -t], [ax, t], [t, t], [t, ay], [-t, ay], [-t, t], [-ax, t], [-ax, -t], [-t, -t]], r);
          break;
        }
        case 'arrow': {
          const t = p.thick * ay, hl = Math.min(ax, ay * 1.2);
          U.polyPath(ctx, [[-ax, -t], [ax - hl, -t], [ax - hl, -ay], [ax, 0], [ax - hl, ay], [ax - hl, t], [-ax, t]], r);
          break;
        }
      }

      let fill = null;
      if (p.fillMode === 'solid') fill = p.color1;
      else if (p.fillMode === 'linear') {
        const a = (p.gradAngle * Math.PI) / 180, L = Math.max(ax, ay), c = Math.cos(a) * L, s = Math.sin(a) * L;
        fill = ctx.createLinearGradient(-c, -s, c, s);
        fill.addColorStop(0, p.color1); fill.addColorStop(1, p.color2);
      } else if (p.fillMode === 'radial') {
        fill = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(ax, ay));
        fill.addColorStop(0, p.color1); fill.addColorStop(1, p.color2);
      }
      if (fill) { ctx.fillStyle = fill; ctx.fill(rule); }
      if (sw > 0) { ctx.lineWidth = sw; ctx.lineJoin = 'round'; ctx.strokeStyle = p.strokeColor; ctx.stroke(); }
      ctx.restore();
    },
  });
})();
