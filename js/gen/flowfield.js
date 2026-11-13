/* Flowfield: a grid of cells with one shape each. A tileable noise mask is projected onto the grid and
   rotates, offsets, scales and fades every shape. Noise uses integer periods and shapes near an edge
   are drawn again on the opposite side, so the texture tiles. */
(function () {
  'use strict';
  const U = window.UGTG;

  const SHAPES = [['line', 'Line'], ['dash', 'Dash (rounded)'], ['arrow', 'Arrow'], ['chevron', 'Chevron'], ['triangle', 'Triangle'], ['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ['circle', 'Circle'], ['cross', 'Cross'], ['polygon', 'Polygon'], ['star', 'Star'], ['leaf', 'Leaf']];
  const OPEN = { line: 1, dash: 1, arrow: 1, chevron: 1, cross: 1 };
  const NOISE = [['perlin', 'Perlin'], ['value', 'Value'], ['cells', 'Cells (Worley)'], ['ridged', 'Ridged'], ['waves', 'Waves'], ['swirl', 'Swirl cells']];

  /* tileable 0..1 field at (u, v) in [0, 1) */
  function field(p, u, v, sx, sy, seed) {
    switch (p.noise) {
      case 'value': return U.fractal('value', u * sx, v * sy, sx, sy, p.octaves, 0.5, 'fbm', seed);
      case 'cells': return U.clamp(U.worley(u * sx, v * sy, sx, sy, seed).f1);
      case 'ridged': return U.fractal('perlin', u * sx, v * sy, sx, sy, p.octaves, 0.5, 'ridged', seed);
      case 'waves': {
        // integer frequencies keep the waves periodic
        const w = Math.sin(U.TAU * (u * sx + 0.35 * Math.sin(U.TAU * v * sy)));
        const n = U.fractal('perlin', u * sx, v * sy, sx, sy, p.octaves, 0.5, 'fbm', seed);
        return U.clamp(0.5 + 0.35 * w + (n - 0.5) * 0.6);
      }
      case 'swirl': {
        // angle around the nearest cell point: shapes circle around each feature point
        const W = U.worley(u * sx, v * sy, sx, sy, seed);
        return W.id; // per-feature value; the swirl rotation itself comes from swirlAngle()
      }
      default: return U.fractal('perlin', u * sx, v * sy, sx, sy, p.octaves, 0.5, 'fbm', seed);
    }
  }

  // swirl needs the direction to the nearest feature point; done separately with a tiny search
  function swirlAngle(u, v, sx, sy, seed) {
    const x = u * sx, y = v * sy, xi = Math.floor(x), yi = Math.floor(y);
    let best = 1e9, ax = 0, ay = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = xi + i, cy = yi + j, wx = U.mod(cx, sx), wy = U.mod(cy, sy);
        const dx = cx + U.hash(wx, wy, seed) - x, dy = cy + U.hash(wx, wy, seed + 7919) - y, d = dx * dx + dy * dy;
        if (d < best) { best = d; ax = dx; ay = dy; }
      }
    }
    return Math.atan2(ay, ax) + Math.PI / 2; // tangent: rotate around the point
  }

  U.register({
    id: 'flowfield',
    name: 'Flowfield',
    desc: 'Grid of shapes rotated, offset and scaled by a tileable noise flow',
    tags: ['Texturing', 'Sci-fi'],
    tileable: true,
    icon: U.icon('<path d="M4 6l3-1M10 5l3 1M17 7l3 2"/><path d="M4 12l3-2M10 11l3 0M16 12l3 2"/><path d="M4 18l3-3M10 17l3-2M16 17l3 1"/>'),
    params: [
      { type: 'section', label: 'Grid' },
      { key: 'cols', label: 'Columns', type: 'int', min: 2, max: 128, default: 24, tip: 'Rows follow the aspect so cells stay square and the texture tiles' },
      { key: 'stagger', label: 'Stagger rows', type: 'bool', default: false },
      { key: 'jitter', label: 'Position jitter', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 3 },
      { type: 'section', label: 'Flow (noise mask)' },
      { key: 'noise', label: 'Noise', type: 'select', default: 'perlin', options: NOISE },
      { key: 'scale', label: 'Noise scale', type: 'int', min: 1, max: 16, default: 3, tip: 'Noise periods across the texture (integer, so it tiles)' },
      { key: 'octaves', label: 'Detail', type: 'int', min: 1, max: 6, default: 2, show: (p) => p.noise !== 'cells' && p.noise !== 'swirl' },
      { key: 'flow', label: 'Flow intensity', type: 'range', min: 0, max: 2, step: 0.01, default: 0.7, tip: 'How far the noise rotates the shapes (1 = ±180°)' },
      { key: 'baseAngle', label: 'Base angle', type: 'range', min: -180, max: 180, step: 1, default: 0 },
      { key: 'snap', label: 'Angle snap', type: 'range', min: 0, max: 90, step: 1, default: 0, tip: 'Quantize rotations to steps of this many degrees (0 = off)' },
      { key: 'randRot', label: 'Random rotation', type: 'range', min: 0, max: 180, step: 1, default: 0 },
      { key: 'offset', label: 'Offset along flow', type: 'range', min: 0, max: 2, step: 0.01, default: 0, tip: 'Pushes shapes along their flow direction, in cell sizes, scaled by a second noise' },
      { key: 'sizeMod', label: 'Size by noise', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'alphaMod', label: 'Opacity by noise', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'threshold', label: 'Cull below', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Skip cells where the noise is below this value' },
      { key: 'showMask', label: 'Show noise mask', type: 'bool', default: false, tip: 'Draws the flow noise as the background' },
      { type: 'section', label: 'Shape' },
      { key: 'shape', label: 'Shape', type: 'select', default: 'dash', options: SHAPES },
      { key: 'size', label: 'Size', type: 'range', min: 0.05, max: 3, step: 0.01, default: 0.85, tip: 'Length in cell sizes' },
      { key: 'ratio', label: 'Width ratio', type: 'range', min: 0.05, max: 1.5, step: 0.01, default: 0.2, tip: 'Width relative to length' },
      { key: 'sides', label: 'Sides / points', type: 'int', min: 3, max: 12, default: 6, show: (p) => p.shape === 'polygon' || p.shape === 'star' },
      { key: 'inset', label: 'Star inset', type: 'range', min: 0.1, max: 0.9, step: 0.01, default: 0.45, show: (p) => p.shape === 'star' },
      { type: 'section', label: 'Style' },
      { key: 'fill', label: 'Fill', type: 'bool', default: true },
      { key: 'fillColor', label: 'Fill color', type: 'color', default: '#e9ecef', show: (p) => p.fill },
      { key: 'stroke', label: 'Stroke', type: 'bool', default: false },
      { key: 'strokeColor', label: 'Stroke color', type: 'color', default: '#ffffff', show: (p) => p.stroke },
      { key: 'strokeW', label: 'Stroke / line width', type: 'range', min: 0.2, max: 20, step: 0.1, default: 2, tip: 'px @ 512. Lines, arrows, chevrons and crosses always use it' },
      { key: 'colorMod', label: 'Color by noise', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Blends toward the second color where the noise is high' },
      { key: 'color2', label: 'Second color', type: 'color', default: '#5fe3b0', show: (p) => p.colorMod > 0 },
      { key: 'bgMode', label: 'Background', type: 'select', default: 'color', options: [['transparent', 'Transparent'], ['color', 'Color']] },
      { key: 'bg', label: 'Background color', type: 'color', default: '#15181a', show: (p) => p.bgMode === 'color' },
    ],
    presets: [
      // Realistic
      { name: 'Wind map', group: 'Realistic', values: { cols: 22, shape: 'arrow', size: 0.8, ratio: 0.35, strokeW: 1.6, flow: 0.45, scale: 2, sizeMod: 0.5, fillColor: '#dfe7ee', bg: '#1b2a38' } },
      { name: 'Fur / hair strokes', group: 'Realistic', values: { cols: 64, shape: 'line', size: 1.9, strokeW: 1, flow: 0.35, scale: 3, octaves: 3, jitter: 1, randRot: 8, alphaMod: 0.5, fillColor: '#d9c3a3', colorMod: 0.6, color2: '#6b4a2b', bg: '#3a2818' } },
      { name: 'Grass tufts (top-down)', group: 'Realistic', values: { cols: 48, shape: 'leaf', size: 1.4, ratio: 0.18, flow: 0.9, scale: 4, jitter: 1, randRot: 25, sizeMod: 0.5, fillColor: '#7fb04a', colorMod: 0.7, color2: '#2f5a1e', bg: '#22361a' } },
      { name: 'Brushed / combed metal', group: 'Realistic', values: { cols: 96, shape: 'line', size: 2.6, strokeW: 0.6, flow: 0.08, baseAngle: 0, scale: 2, jitter: 1, alphaMod: 0.8, fillColor: '#ffffff', bg: '#6c7176' } },
      { name: 'Wood grain flow', group: 'Realistic', values: { cols: 56, shape: 'dash', size: 2.2, ratio: 0.08, flow: 0.18, noise: 'waves', scale: 2, jitter: 0.6, alphaMod: 0.6, fillColor: '#5a3418', colorMod: 0.5, color2: '#2e170a', bg: '#a8743f' } },
      { name: 'Fish scales', group: 'Realistic', values: { cols: 18, stagger: true, shape: 'ellipse', size: 1.15, ratio: 0.9, flow: 0.15, scale: 2, fill: true, stroke: true, strokeW: 1.4, fillColor: '#8fa7b5', strokeColor: '#2b3c47', colorMod: 0.5, color2: '#c9d8df', bg: '#2b3c47' } },
      { name: 'Rain streaks', group: 'Realistic', values: { cols: 40, shape: 'line', size: 1.3, strokeW: 0.9, flow: 0.06, baseAngle: 100, scale: 2, jitter: 1, offset: 0.8, alphaMod: 0.9, threshold: 0.25, fillColor: '#cfe0ff', bgMode: 'transparent' } },
      // Stylized
      { name: 'Op-art dashes', group: 'Stylized', values: { cols: 28, shape: 'dash', size: 0.9, ratio: 0.22, flow: 1, scale: 2, fillColor: '#f2f2f2', bg: '#111111' } },
      { name: 'Chevron current', group: 'Stylized', values: { cols: 16, shape: 'chevron', size: 0.7, strokeW: 3, flow: 0.5, scale: 2, snap: 15, fillColor: '#ffd23f', bg: '#16213e' } },
      { name: 'Truchet-ish tiles', group: 'Stylized', values: { cols: 14, shape: 'triangle', size: 1.42, ratio: 1, flow: 1, snap: 90, scale: 3, noise: 'value', fillColor: '#f4f1de', bg: '#e07a5f' } },
      { name: 'Confetti flow', group: 'Stylized', values: { cols: 26, shape: 'rect', size: 0.55, ratio: 0.45, flow: 1.4, scale: 3, jitter: 0.8, randRot: 40, sizeMod: 0.6, fillColor: '#ff5d8f', colorMod: 1, color2: '#5fd3ff', bg: '#1d1b2f' } },
      { name: 'Dot halftone flow', group: 'Stylized', values: { cols: 40, stagger: true, shape: 'circle', size: 0.9, ratio: 1, flow: 0, sizeMod: 1, scale: 3, fillColor: '#111111', bg: '#f3efe6' } },
      { name: 'Starfield drift', group: 'Stylized', values: { cols: 20, shape: 'star', sides: 5, inset: 0.42, size: 0.6, ratio: 1, flow: 0.8, scale: 2, jitter: 1, sizeMod: 0.8, alphaMod: 0.6, fillColor: '#fff4c2', bg: '#0e1028' } },
      { name: 'Leaf scatter', group: 'Stylized', values: { cols: 18, shape: 'leaf', size: 0.95, ratio: 0.42, flow: 1.2, scale: 2, jitter: 0.9, randRot: 30, sizeMod: 0.4, fillColor: '#e9a23b', colorMod: 0.9, color2: '#c2452d', bg: '#3b2a20' } },
      { name: 'Swirl vortices', group: 'Stylized', values: { cols: 30, noise: 'swirl', scale: 3, shape: 'dash', size: 0.9, ratio: 0.18, flow: 1, fillColor: '#ffffff', colorMod: 0.8, color2: '#7aa2ff', bg: '#0f1530' } },
      // Sci-fi
      { name: 'Vector field HUD', group: 'Sci-fi', values: { cols: 20, shape: 'arrow', size: 0.75, ratio: 0.3, strokeW: 1.4, flow: 0.8, scale: 2, sizeMod: 0.6, alphaMod: 0.5, fillColor: '#3cf2ff', bg: '#04121a', showMask: false } },
      { name: 'Circuit flow', group: 'Sci-fi', values: { cols: 24, shape: 'line', size: 1, strokeW: 2, flow: 1, snap: 45, noise: 'value', scale: 4, fillColor: '#5fe3b0', alphaMod: 0.6, bg: '#07140f' } },
      { name: 'Energy scales', group: 'Sci-fi', values: { cols: 16, stagger: true, shape: 'polygon', sides: 6, size: 1.05, ratio: 1, flow: 0.4, fill: false, stroke: true, strokeW: 1.5, strokeColor: '#9d7bff', colorMod: 0.7, color2: '#ff6bd5', sizeMod: 0.5, bg: '#0d0820' } },
      { name: 'Magnetic field lines', group: 'Sci-fi', values: { cols: 44, noise: 'swirl', scale: 2, shape: 'line', size: 1.4, strokeW: 1.1, flow: 1, jitter: 0.5, alphaMod: 0.7, fillColor: '#ff7a3c', colorMod: 0.6, color2: '#ffe08a', bg: '#140805' } },
      { name: 'Noise mask preview', group: 'Sci-fi', values: { cols: 24, shape: 'arrow', size: 0.8, ratio: 0.35, strokeW: 1.4, flow: 1, scale: 3, showMask: true, fillColor: '#ff3b6b' } },
    ],
    render(ctx, W, H, p) {
      const cols = p.cols;
      let rows = Math.max(1, Math.round((cols * H) / W));
      if (p.stagger && rows % 2) rows++; // staggered rows only tile with an even row count
      const cw = W / cols, chh = H / rows, cell = Math.min(cw, chh), k = Math.min(W, H) / 512;
      const sx = p.scale, sy = Math.max(1, Math.round((p.scale * H) / W));
      const rnd = U.rng(p.seed);
      const c1 = U.hex(p.fill ? p.fillColor : p.strokeColor), c2 = U.hex(p.color2);
      const mix = (a, b, t) => `rgb(${(a[0] + (b[0] - a[0]) * t) | 0},${(a[1] + (b[1] - a[1]) * t) | 0},${(a[2] + (b[2] - a[2]) * t) | 0})`;

      if (p.showMask) {
        U.pixels(ctx, W, H, (x, y, o) => {
          const n = p.noise === 'swirl' ? 0.5 + 0.5 * Math.sin(swirlAngle((x + 0.5) / W, (y + 0.5) / H, sx, sy, p.seed)) : field(p, (x + 0.5) / W, (y + 0.5) / H, sx, sy, p.seed);
          o[0] = o[1] = o[2] = 30 + n * 120;
        });
      } else if (p.bgMode === 'color') {
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, W, H);
      }

      // shape path in local units: x along the flow, length L, width w
      const path = (L, w) => {
        const hl = L / 2, hw = w / 2;
        ctx.beginPath();
        switch (p.shape) {
          case 'line': ctx.moveTo(-hl, 0); ctx.lineTo(hl, 0); break;
          case 'dash': ctx.moveTo(-hl + hw, 0); ctx.lineTo(hl - hw, 0); break;
          case 'arrow': ctx.moveTo(-hl, 0); ctx.lineTo(hl, 0); ctx.moveTo(hl - L * 0.3, -L * 0.18); ctx.lineTo(hl, 0); ctx.lineTo(hl - L * 0.3, L * 0.18); break;
          case 'chevron': ctx.moveTo(-hl * 0.6, -hl); ctx.lineTo(hl * 0.6, 0); ctx.lineTo(-hl * 0.6, hl); break;
          case 'cross': ctx.moveTo(-hl, 0); ctx.lineTo(hl, 0); ctx.moveTo(0, -hl); ctx.lineTo(0, hl); break;
          case 'triangle': ctx.moveTo(hl, 0); ctx.lineTo(-hl, -hw); ctx.lineTo(-hl, hw); ctx.closePath(); break;
          case 'rect': ctx.rect(-hl, -hw, L, w); break;
          case 'ellipse': ctx.ellipse(0, 0, hl, Math.max(0.3, hw), 0, 0, U.TAU); break;
          case 'circle': ctx.arc(0, 0, hl, 0, U.TAU); break;
          case 'leaf': ctx.moveTo(-hl, 0); ctx.quadraticCurveTo(0, -w * 1.2, hl, 0); ctx.quadraticCurveTo(0, w * 1.2, -hl, 0); ctx.closePath(); break;
          case 'polygon':
          case 'star': {
            const n = p.shape === 'star' ? p.sides * 2 : p.sides;
            for (let i = 0; i < n; i++) {
              const a = (i / n) * U.TAU, r = (p.shape === 'star' && i % 2 ? p.inset : 1) * hl;
              const x = Math.cos(a) * r, y = Math.sin(a) * r * (p.ratio < 1 && p.shape === 'polygon' ? Math.max(0.1, p.ratio) : 1);
              i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
            }
            ctx.closePath();
            break;
          }
        }
      };

      const lw = Math.max(0.4, p.strokeW * k);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const r = [rnd(), rnd(), rnd(), rnd()]; // fixed draws per cell so settings don't reshuffle
          let x = (i + 0.5 + (p.stagger && j % 2 ? 0.5 : 0) + (r[0] - 0.5) * p.jitter) * cw;
          let y = (j + 0.5 + (r[1] - 0.5) * p.jitter) * chh;
          const u = U.mod(x / W, 1), v = U.mod(y / H, 1);
          const n = field(p, u, v, sx, sy, p.seed);
          if (n < p.threshold) continue;
          let ang = (p.noise === 'swirl' ? swirlAngle(u, v, sx, sy, p.seed) * p.flow : (n - 0.5) * U.TAU * p.flow) + (p.baseAngle * Math.PI) / 180 + (r[2] - 0.5) * 2 * (p.randRot * Math.PI) / 180;
          if (p.snap > 0) { const st = (p.snap * Math.PI) / 180; ang = Math.round(ang / st) * st; }
          if (p.offset > 0) {
            const m = field(p, U.mod(u + 0.37, 1), U.mod(v + 0.61, 1), sx, sy, p.seed + 17);
            x += Math.cos(ang) * p.offset * cell * m;
            y += Math.sin(ang) * p.offset * cell * m;
          }
          const sc = 1 - p.sizeMod * (1 - n);
          const L = p.size * cell * sc, w = L * p.ratio;
          if (L < 0.3) continue;
          const alpha = 1 - p.alphaMod * (1 - n);
          const col = p.colorMod > 0 ? mix(c1, c2, n * p.colorMod) : null;
          const open = OPEN[p.shape];
          const reach = L * 0.75 + lw;

          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const px = x + ox * W, py = y + oy * H;
              if (px + reach < 0 || px - reach > W || py + reach < 0 || py - reach > H) continue;
              ctx.save();
              ctx.globalAlpha = alpha;
              ctx.translate(px, py);
              ctx.rotate(ang);
              path(L, w);
              if (open) {
                ctx.lineCap = p.shape === 'dash' ? 'round' : 'butt';
                ctx.lineJoin = 'round';
                ctx.lineWidth = p.shape === 'dash' ? Math.max(lw, w) : lw;
                ctx.strokeStyle = col || (p.fill ? p.fillColor : p.strokeColor);
                ctx.stroke();
              } else {
                if (p.fill) { ctx.fillStyle = col || p.fillColor; ctx.fill(); }
                if (p.stroke) { ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.strokeStyle = p.fill ? p.strokeColor : col || p.strokeColor; ctx.stroke(); }
              }
              ctx.restore();
            }
          }
        }
      }
    },
  });
})();
