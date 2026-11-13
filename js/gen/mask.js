/* Mask: an overlay with shape openings cut out and a blurred (feathered) edge. For UI highlights
   (darken everything except one element) and first-person mask / visor overlays (gas mask eyes,
   helmet slits, face shields). Shapes can be mirrored as a pair; invert keeps only the shape
   (soft highlight sprites). Shape sizes are fractions of the short side, positions of the texture. */
(function () {
  'use strict';
  const U = window.UGTG;

  const SHAPES = [['rect', 'Rounded rectangle'], ['ellipse', 'Ellipse'], ['capsule', 'Capsule / slit'], ['visor', 'Visor (squarish curve)'], ['polygon', 'Polygon'], ['star', 'Star'], ['diamond', 'Diamond'], ['triangle', 'Triangle']];
  const is = (...k) => (p) => k.includes(p.shape);

  U.register({
    id: 'mask',
    name: 'Mask',
    desc: 'Inverted, feathered shape masks for UI highlights and mask / visor overlays',
    tags: ['UI', 'VFX', 'Shooter'],
    icon: U.icon('<rect x="3" y="4" width="18" height="16" rx="2"/><ellipse cx="8.5" cy="11" rx="2.6" ry="2"/><ellipse cx="15.5" cy="11" rx="2.6" ry="2"/>'),
    params: [
      { type: 'section', label: 'Opening' },
      { key: 'shape', label: 'Shape', type: 'select', default: 'rect', options: SHAPES },
      { key: 'w', label: 'Width', type: 'range', min: 0.01, max: 2, step: 0.005, default: 0.6, tip: 'Fraction of the short side' },
      { key: 'h', label: 'Height', type: 'range', min: 0.005, max: 2, step: 0.005, default: 0.4 },
      { key: 'radius', label: 'Corner radius', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.06, show: is('rect', 'polygon', 'diamond', 'triangle', 'star') },
      { key: 'squareness', label: 'Squareness', type: 'range', min: 2, max: 12, step: 0.1, default: 4, show: is('visor') },
      { key: 'bulge', label: 'Top / bottom bulge', type: 'range', min: -0.6, max: 0.6, step: 0.01, default: 0.25, show: is('visor'), tip: 'Makes the top edge rounder than the bottom (or the other way round)' },
      { key: 'sides', label: 'Sides / points', type: 'int', min: 3, max: 12, default: 6, show: is('polygon', 'star') },
      { key: 'inner', label: 'Star inner radius', type: 'range', min: 0.1, max: 0.9, step: 0.01, default: 0.5, show: is('star') },
      { key: 'cx', label: 'Position X', type: 'range', min: 0, max: 1, step: 0.005, default: 0.5 },
      { key: 'cy', label: 'Position Y', type: 'range', min: 0, max: 1, step: 0.005, default: 0.5 },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: 0 },
      { key: 'pair', label: 'Mirrored pair', type: 'bool', default: false, tip: 'Two openings mirrored left / right, e.g. gas mask eyes' },
      { key: 'gap', label: 'Pair spacing', type: 'range', min: 0, max: 1.5, step: 0.005, default: 0.45, show: (p) => p.pair, tip: 'Distance between the two centers, fraction of the short side' },
      { type: 'section', label: 'Edges' },
      { key: 'feather', label: 'Feather (blur)', type: 'range', min: 0, max: 120, step: 0.5, default: 16, tip: 'px @ 512' },
      { key: 'curve', label: 'Feather curve', type: 'range', min: 0.2, max: 4, step: 0.01, default: 1, tip: '< 1 opens the feathered edge, > 1 tightens it' },
      { key: 'shadow', label: 'Inner shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Darkens the inside of the opening toward its rim' },
      { key: 'shadowSize', label: 'Inner shadow size', type: 'range', min: 2, max: 200, step: 1, default: 40, show: (p) => p.shadow > 0 },
      { type: 'section', label: 'Overlay' },
      { key: 'opacity', label: 'Overlay opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75 },
      { key: 'tint', label: 'Tint inside the opening', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Opacity inside the opening, e.g. a tinted face shield' },
      { key: 'smudge', label: 'Smudge / grime', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Uneven, dirty overlay' },
      { key: 'smudgeScale', label: 'Smudge scale', type: 'range', min: 1, max: 30, step: 0.5, default: 6, show: (p) => p.smudge > 0 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 8, show: (p) => p.smudge > 0 },
      { key: 'invert', label: 'Invert (keep the shape only)', type: 'bool', default: false, tip: 'Highlight / glow sprite instead of a cut-out' },
      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'overlay', options: [['overlay', 'Color + alpha overlay'], ['mask', 'Grayscale mask (white = covered)'], ['alpha', 'White + alpha']] },
      { key: 'color', label: 'Overlay color', type: 'color', default: '#000000', show: (p) => p.output === 'overlay' },
    ],
    presets: [
      // UI highlight
      { name: 'Tutorial highlight (button)', group: 'UI highlight', values: { shape: 'rect', w: 0.5, h: 0.18, radius: 0.04, feather: 6, opacity: 0.75 } },
      { name: 'Inventory slot highlight', group: 'UI highlight', values: { shape: 'rect', w: 0.22, h: 0.22, radius: 0.02, cx: 0.3, cy: 0.4, feather: 4, opacity: 0.8 } },
      { name: 'Circular spotlight', group: 'UI highlight', values: { shape: 'ellipse', w: 0.32, h: 0.32, feather: 14, opacity: 0.8 } },
      { name: 'Soft focus area', group: 'UI highlight', values: { shape: 'ellipse', w: 0.9, h: 0.6, feather: 70, curve: 0.8, opacity: 0.65 } },
      { name: 'Hard cut-out window', group: 'UI highlight', values: { shape: 'rect', w: 0.7, h: 0.5, radius: 0, feather: 0, opacity: 0.85 } },
      { name: 'Glow highlight sprite', group: 'UI highlight', values: { shape: 'capsule', w: 0.7, h: 0.22, feather: 26, invert: true, opacity: 1, output: 'alpha' } },
      // Mask / visor overlays
      { name: 'Gas mask eyes', group: 'Mask & visor', aspect: '16:9', values: { shape: 'ellipse', w: 0.44, h: 0.38, rotation: 12, pair: true, gap: 0.5, cy: 0.46, feather: 22, curve: 1.2, shadow: 0.45, shadowSize: 50, opacity: 0.97, smudge: 0.25, smudgeScale: 5 } },
      { name: 'Respirator round lenses', group: 'Mask & visor', aspect: '16:9', values: { shape: 'ellipse', w: 0.42, h: 0.42, pair: true, gap: 0.47, cy: 0.45, feather: 14, shadow: 0.5, shadowSize: 40, opacity: 0.98, tint: 0.12, smudge: 0.3 } },
      { name: 'Tarkov-style face shield', group: 'Mask & visor', aspect: '16:9', values: { shape: 'visor', w: 1.5, h: 0.95, squareness: 3.2, bulge: 0.3, cy: 0.52, feather: 40, curve: 0.9, shadow: 0.35, shadowSize: 70, opacity: 0.92, tint: 0.18, smudge: 0.35, smudgeScale: 4 } },
      { name: 'Tarkov-style armored visor slit', group: 'Mask & visor', aspect: '16:9', values: { shape: 'capsule', w: 1.25, h: 0.2, cy: 0.47, feather: 18, shadow: 0.4, shadowSize: 30, opacity: 0.98, smudge: 0.2 } },
      { name: 'Welding mask window', group: 'Mask & visor', aspect: '16:9', values: { shape: 'rect', w: 0.62, h: 0.22, radius: 0.015, feather: 8, opacity: 1, tint: 0.55, smudge: 0.2 } },
      { name: 'Night vision binoculars', group: 'Mask & visor', aspect: '16:9', values: { shape: 'ellipse', w: 0.62, h: 0.62, pair: true, gap: 0.52, feather: 26, curve: 1.3, opacity: 1 } },
      { name: 'Tactical goggles', group: 'Mask & visor', aspect: '16:9', values: { shape: 'capsule', w: 0.6, h: 0.36, rotation: 8, pair: true, gap: 0.6, cy: 0.47, feather: 24, shadow: 0.35, shadowSize: 40, opacity: 0.95, tint: 0.08, smudge: 0.2 } },
      { name: 'Scope tunnel', group: 'Mask & visor', aspect: '16:9', values: { shape: 'ellipse', w: 0.85, h: 0.85, feather: 10, curve: 1.4, opacity: 1 } },
      { name: 'Tank periscope slit', group: 'Mask & visor', aspect: '16:9', values: { shape: 'rect', w: 1.4, h: 0.16, radius: 0.01, feather: 10, shadow: 0.5, shadowSize: 24, opacity: 1, tint: 0.1, smudge: 0.25 } },
      { name: 'Motorcycle helmet visor', group: 'Mask & visor', aspect: '16:9', values: { shape: 'visor', w: 1.65, h: 0.75, squareness: 2.6, bulge: 0.45, cy: 0.5, feather: 30, shadow: 0.25, shadowSize: 60, opacity: 0.96, tint: 0.25, smudge: 0.15 } },
      // Sci-fi
      { name: 'Space helmet HUD visor', group: 'Sci-fi', aspect: '16:9', values: { shape: 'visor', w: 1.7, h: 1.1, squareness: 5, bulge: 0.2, feather: 34, shadow: 0.3, shadowSize: 80, opacity: 0.9, tint: 0.08, color: '#05121a' } },
      { name: 'Hex viewport', group: 'Sci-fi', values: { shape: 'polygon', sides: 6, w: 0.8, h: 0.8, radius: 0.03, rotation: 30, feather: 12, opacity: 0.95, color: '#020812' } },
      { name: 'Mech cockpit slit', group: 'Sci-fi', aspect: '16:9', values: { shape: 'polygon', sides: 6, w: 1.5, h: 0.42, radius: 0.02, feather: 10, shadow: 0.4, shadowSize: 30, opacity: 1 } },
      { name: 'Diamond scanner window', group: 'Sci-fi', values: { shape: 'diamond', w: 0.7, h: 0.7, radius: 0.02, feather: 8, opacity: 0.9, color: '#001a14' } },
      { name: 'Star glow sprite', group: 'Sci-fi', values: { shape: 'star', sides: 4, inner: 0.25, w: 0.8, h: 0.8, radius: 0, feather: 10, invert: true, opacity: 1, output: 'alpha' } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), k = S / 512, col = U.hex(p.color);
      const rw = (p.w * S) / 2, rh = (p.h * S) / 2;

      // opening path in local coordinates (centered, unrotated)
      const shapePath = (c) => {
        c.beginPath();
        switch (p.shape) {
          case 'ellipse': c.ellipse(0, 0, rw, rh, 0, 0, U.TAU); break;
          case 'capsule': { const r = Math.min(rw, rh); U.polyPath(c, [[-rw, -rh], [rw, -rh], [rw, rh], [-rw, rh]], r); break; }
          case 'rect': U.polyPath(c, [[-rw, -rh], [rw, -rh], [rw, rh], [-rw, rh]], p.radius * S); break;
          case 'visor': {
            // superellipse; the top half is scaled by (1 + bulge), the bottom by (1 - bulge)
            const n = p.squareness, N = 96, pts = [];
            for (let i = 0; i < N; i++) {
              const t = (i / N) * U.TAU, ct = Math.cos(t), st = Math.sin(t);
              const x = Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n) * rw;
              let y = Math.sign(st) * Math.pow(Math.abs(st), 2 / n) * rh;
              y *= y < 0 ? 1 + p.bulge * 0.5 : 1 - p.bulge * 0.5;
              pts.push([x, y]);
            }
            U.polyPath(c, pts);
            break;
          }
          case 'diamond': U.polyPath(c, [[0, -rh], [rw, 0], [0, rh], [-rw, 0]], p.radius * S); break;
          case 'triangle': U.polyPath(c, [[0, -rh], [rw, rh], [-rw, rh]], p.radius * S); break;
          default: {
            const n = p.shape === 'star' ? p.sides * 2 : p.sides, pts = [];
            for (let i = 0; i < n; i++) {
              const a = (i / n) * U.TAU - Math.PI / 2, r = p.shape === 'star' && i % 2 ? p.inner : 1;
              pts.push([Math.cos(a) * rw * r, Math.sin(a) * rh * r]);
            }
            U.polyPath(c, pts, p.radius * S);
          }
        }
      };
      const openings = p.pair ? [[-1, p.cx * W - (p.gap * S) / 2], [1, p.cx * W + (p.gap * S) / 2]] : [[1, p.cx * W]];
      // white openings on transparent, blurred by `blur` px
      const drawHoles = (blur) => {
        const cv = U.canvas(W, H), c = cv.getContext('2d');
        if (blur > 0 && typeof c.filter === 'string') c.filter = `blur(${blur}px)`;
        c.fillStyle = '#fff';
        for (const [side, x] of openings) {
          c.save();
          c.translate(x, p.cy * H);
          c.rotate((side * p.rotation * Math.PI) / 180); // mirrored pair tilts opposite ways
          c.scale(side, 1);
          shapePath(c);
          c.fill();
          c.restore();
        }
        return c.getImageData(0, 0, W, H).data;
      };
      const hole = drawHoles(p.feather * k * 0.5);
      const deep = p.shadow > 0 ? drawHoles((p.feather * 0.5 + p.shadowSize) * k * 0.5) : null;
      const ss = p.smudgeScale / S;

      U.pixels(ctx, W, H, (x, y, o) => {
        const i = (y * W + x) * 4 + 3;
        const hv = Math.pow(hole[i] / 255, p.curve); // 1 inside the opening
        let a = p.invert ? hv * p.opacity : U.lerp(p.opacity, p.tint, hv);
        if (deep && !p.invert) {
          // inner shadow: inside the opening, where the wider blur has not reached full strength yet
          const sh = hv * (1 - deep[i] / 255) * p.shadow;
          a = U.screen(a, sh);
        }
        if (p.smudge > 0) {
          const n = U.fractal('perlin', x * ss, y * ss, 0, 0, 4, 0.55, 'fbm', p.seed);
          a *= 1 - p.smudge * 0.6 * U.clamp((n - 0.35) * 2);
        }
        a = U.clamp(a);
        if (p.output === 'mask') { o[0] = o[1] = o[2] = a * 255; }
        else if (p.output === 'alpha') { o[0] = o[1] = o[2] = 255; o[3] = a * 255; }
        else { o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; o[3] = a * 255; }
      });
    },
  });
})();
