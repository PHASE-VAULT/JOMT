/* Vignette: darkening (or tinting) toward the edges. A shape metric gives a distance d (0 center,
   1 at the shape edge); a falloff curve turns it into the vignette amount. Shapes: ellipse (follows the
   aspect), circle, rounded rectangle, left/right edges, top/bottom edges or per-side amounts.
   Output as a color + alpha overlay, a multiply map (white center) or a grayscale mask. */
(function () {
  'use strict';
  const U = window.UGTG;

  const SHAPES = [['ellipse', 'Ellipse (fits aspect)'], ['circle', 'Circle'], ['rect', 'Rounded rectangle'], ['x', 'Left + right edges'], ['y', 'Top + bottom edges'], ['sides', 'Per side']];
  const CURVES = [['linear', 'Linear'], ['smooth', 'Smooth'], ['smoother', 'Smoother'], ['exp', 'Exponential']];
  const isSides = (p) => p.shape === 'sides';

  U.register({
    id: 'vignette',
    name: 'Vignette',
    desc: 'Elliptic, round, rectangular or edge-only vignettes with full falloff control',
    tags: ['UI', 'VFX', 'Lighting'],
    icon: U.icon('<rect x="3" y="4" width="18" height="16" rx="2"/><ellipse cx="12" cy="12" rx="5.5" ry="4.5" opacity=".6"/>'),
    params: [
      { type: 'section', label: 'Shape' },
      { key: 'shape', label: 'Shape', type: 'select', default: 'ellipse', options: SHAPES },
      { key: 'roundness', label: 'Corner roundness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.shape === 'rect', tip: '0 = sharp rectangle, 1 = fully rounded' },
      { key: 'left', label: 'Left', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: isSides },
      { key: 'right', label: 'Right', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: isSides },
      { key: 'top', label: 'Top', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: isSides },
      { key: 'bottom', label: 'Bottom', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: isSides },
      { key: 'cx', label: 'Center X', type: 'range', min: -0.5, max: 0.5, step: 0.005, default: 0 },
      { key: 'cy', label: 'Center Y', type: 'range', min: -0.5, max: 0.5, step: 0.005, default: 0 },
      { key: 'sx', label: 'Stretch X', type: 'range', min: 0.2, max: 3, step: 0.01, default: 1 },
      { key: 'sy', label: 'Stretch Y', type: 'range', min: 0.2, max: 3, step: 0.01, default: 1 },
      { type: 'section', label: 'Falloff' },
      { key: 'intensity', label: 'Intensity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8 },
      { key: 'start', label: 'Falloff start', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.45, tip: 'Distance from the center where darkening begins (1 = shape edge)' },
      { key: 'width', label: 'Falloff width', type: 'range', min: 0.01, max: 1.5, step: 0.01, default: 0.6, tip: 'How far it takes to reach full intensity' },
      { key: 'curve', label: 'Curve', type: 'select', default: 'smooth', options: CURVES },
      { key: 'power', label: 'Smoothness / power', type: 'range', min: 0.2, max: 5, step: 0.01, default: 1.2, tip: '< 1 darkens early and softly, > 1 keeps the center clear longer' },
      { key: 'invert', label: 'Invert (bright edges / dark center)', type: 'bool', default: false },
      { type: 'section', label: 'Texture' },
      { key: 'noise', label: 'Noise', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Breaks up the falloff for a grungy / organic vignette' },
      { key: 'noiseScale', label: 'Noise scale', type: 'range', min: 1, max: 30, step: 0.5, default: 6, show: (p) => p.noise > 0 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 4, show: (p) => p.noise > 0 },
      { key: 'dither', label: 'Dither (no banding)', type: 'bool', default: true },
      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'overlay', options: [['overlay', 'Color + alpha overlay'], ['multiply', 'Multiply map (white center)'], ['mask', 'Grayscale mask (white = vignette)']] },
      { key: 'color', label: 'Vignette color', type: 'color', default: '#000000', show: (p) => p.output !== 'mask' },
    ],
    presets: [
      // Photographic
      { name: 'Subtle photo vignette', group: 'Photographic', values: { intensity: 0.45, start: 0.55, width: 0.75, curve: 'smoother', power: 1.4 } },
      { name: 'Classic lens vignette', group: 'Photographic', values: { shape: 'circle', intensity: 0.7, start: 0.6, width: 0.9, curve: 'smooth', power: 1.6 } },
      { name: 'Strong cinematic', group: 'Photographic', values: { intensity: 0.95, start: 0.3, width: 0.75, curve: 'smoother', power: 1 } },
      { name: 'Wide-angle corners', group: 'Photographic', values: { shape: 'rect', roundness: 1, intensity: 0.6, start: 0.75, width: 0.55, curve: 'smooth', power: 1.6 } },
      { name: 'Letterbox fade (top + bottom)', group: 'Photographic', values: { shape: 'y', intensity: 1, start: 0.62, width: 0.3, curve: 'smooth', power: 1 } },
      { name: 'Side fade (left + right)', group: 'Photographic', values: { shape: 'x', intensity: 0.9, start: 0.5, width: 0.5, curve: 'smooth', power: 1.2 } },
      // UI / HUD
      { name: 'Panel edge fade', group: 'UI / HUD', values: { shape: 'rect', roundness: 0.2, intensity: 0.85, start: 0.78, width: 0.22, curve: 'smooth', power: 1 } },
      { name: 'Bottom gradient (text backing)', group: 'UI / HUD', values: { shape: 'sides', left: 0, right: 0, top: 0, bottom: 1, intensity: 0.85, start: 0.05, width: 0.95, curve: 'smooth', power: 1.3 } },
      { name: 'Left menu backing', group: 'UI / HUD', values: { shape: 'sides', left: 1, right: 0, top: 0, bottom: 0, intensity: 0.9, start: 0, width: 1, curve: 'smoother', power: 0.8 } },
      { name: 'Spotlight focus (tutorial)', group: 'UI / HUD', values: { shape: 'circle', intensity: 0.85, start: 0.3, width: 0.08, curve: 'smooth', power: 1 } },
      { name: 'Soft rounded frame', group: 'UI / HUD', values: { shape: 'rect', roundness: 0.6, intensity: 0.7, start: 0.65, width: 0.4, curve: 'smoother', power: 1.2 } },
      // Game-inspired
      { name: 'Low health (red)', group: 'Game-inspired', values: { intensity: 0.85, start: 0.45, width: 0.7, curve: 'smooth', power: 1.3, noise: 0.35, noiseScale: 5, color: '#8a0000' } },
      { name: 'Bleeding / damage pulse', group: 'Game-inspired', values: { shape: 'rect', roundness: 0.8, intensity: 0.95, start: 0.6, width: 0.45, curve: 'exp', power: 1, noise: 0.55, noiseScale: 9, color: '#6e0000' } },
      { name: 'Tunnel vision (exhaustion)', group: 'Game-inspired', values: { shape: 'circle', intensity: 1, start: 0.35, width: 0.5, curve: 'smoother', power: 1 } },
      { name: 'Stealth / hidden', group: 'Game-inspired', values: { intensity: 0.75, start: 0.4, width: 0.8, curve: 'smooth', power: 1, color: '#0a1530' } },
      { name: 'Poisoned (green)', group: 'Game-inspired', values: { intensity: 0.75, start: 0.4, width: 0.8, curve: 'smooth', power: 1.2, noise: 0.45, noiseScale: 4, color: '#2f5a00' } },
      { name: 'Frozen edges', group: 'Game-inspired', values: { shape: 'rect', roundness: 0.7, intensity: 0.85, start: 0.55, width: 0.5, curve: 'exp', power: 1, noise: 0.6, noiseScale: 12, color: '#cfeaff' } },
      // Stylized
      { name: 'Hard iris', group: 'Stylized', values: { shape: 'circle', intensity: 1, start: 0.85, width: 0.02, curve: 'linear', power: 1, dither: false } },
      { name: 'Dreamy white glow', group: 'Stylized', values: { intensity: 0.7, start: 0.3, width: 0.9, curve: 'smoother', power: 1, color: '#ffffff' } },
      { name: 'Grungy burnt edges', group: 'Stylized', values: { shape: 'rect', roundness: 0.5, intensity: 0.95, start: 0.55, width: 0.45, curve: 'smooth', power: 1, noise: 0.8, noiseScale: 14, color: '#140a00' } },
      { name: 'Center glow mask (inverted)', group: 'Stylized', values: { invert: true, intensity: 1, start: 0, width: 0.8, curve: 'smoother', power: 1, output: 'mask' } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), col = U.hex(p.color);
      const curve = (t) => {
        switch (p.curve) {
          case 'linear': return t;
          case 'smoother': return t * t * t * (t * (t * 6 - 15) + 10);
          case 'exp': return (1 - Math.exp(-4 * t)) / (1 - Math.exp(-4));
          default: return t * t * (3 - 2 * t);
        }
      };
      const fall = (d) => Math.pow(curve(U.clamp((d - p.start) / p.width)), p.power);
      const ns = p.noiseScale / S;

      U.pixels(ctx, W, H, (x, y, o) => {
        // -1..1 across the texture, centered and stretched
        let u = (((x + 0.5) / W) * 2 - 1 - p.cx * 2) / p.sx, v = (((y + 0.5) / H) * 2 - 1 - p.cy * 2) / p.sy;
        let n = 0;
        if (p.noise > 0) n = (U.fractal('perlin', x * ns, y * ns, 0, 0, 4, 0.55, 'fbm', p.seed) - 0.5) * p.noise * 0.5;
        let a;
        switch (p.shape) {
          case 'circle': a = fall(Math.hypot(u * (W / S), v * (H / S)) + n); break;
          case 'rect': {
            // rounded box: straight edges at |u| = 1 / |v| = 1, corners rounded by `roundness`
            // signed distance to a box of half-size 1 with corner radius R, shifted so center = 0, edge = 1
            const R = p.roundness, qx = Math.abs(u) - (1 - R), qy = Math.abs(v) - (1 - R);
            const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
            a = fall(d + 1 + n);
            break;
          }
          case 'x': a = fall(Math.abs(u) + n); break;
          case 'y': a = fall(Math.abs(v) + n); break;
          case 'sides': {
            const ax = fall(Math.abs(u) + n) * (u < 0 ? p.left : p.right), ay = fall(Math.abs(v) + n) * (v < 0 ? p.top : p.bottom);
            a = U.screen(ax, ay);
            break;
          }
          default: a = fall(Math.hypot(u, v) + n);
        }
        if (p.invert) a = 1 - a;
        a *= p.intensity;
        if (p.dither && a > 0 && a < 1) a += (U.hash(x, y, 91) - 0.5) / 255;
        a = U.clamp(a);
        if (p.output === 'mask') { o[0] = o[1] = o[2] = a * 255; }
        else if (p.output === 'multiply') { o[0] = 255 + (col[0] - 255) * a; o[1] = 255 + (col[1] - 255) * a; o[2] = 255 + (col[2] - 255) * a; }
        else { o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; o[3] = a * 255; }
      });
    },
  });
})();
