/* Seamless geometric patterns. Shapes near the edges are also drawn one cell outside the
   canvas so they wrap; rows are forced even where a row offset would otherwise break tiling. */
(function () {
  'use strict';
  const U = window.UGTG;
  const CELL = ['dots', 'squares', 'diamonds', 'rings', 'crosses'];
  const OUTLINE = ['dots', 'squares', 'diamonds', 'triangles', 'hexagons'];
  const SIZED = CELL.concat(['triangles', 'hexagons']);
  const is = (...list) => (p) => list.includes(p.shape);

  function rowsFor(p, W, H, cols) {
    let rows = p.rows;
    if (p.autoRows) {
      const k = p.shape === 'hexagons' || p.shape === 'triangles' ? Math.sqrt(3) / 2 : 1;
      rows = Math.max(1, Math.round(H / ((W / cols) * k)));
    }
    const even = ['hexagons', 'triangles', 'checker'].includes(p.shape) || (p.stagger && CELL.includes(p.shape));
    if (even && rows % 2) rows++;
    return rows;
  }

  /* size modulation: returns a multiplier for the shape centered at (x, y), sampled at wrapped
     coordinates so a shape and its edge-wrap copy always get the same size */
  const tri = (s) => 1 - Math.abs(2 * (s - Math.floor(s)) - 1);
  function makeMod(p, W, H, cols, rows) {
    if (p.modType === 'none' || !SIZED.includes(p.shape)) return () => 1;
    const ns = p.modScale, nsy = Math.max(1, Math.round((p.modScale * H) / W));
    const field = (u, v, c, r) => {
      switch (p.modType) {
        case 'noise': {
          const n = U.fractal('perlin', u * ns, v * nsy, ns, nsy, 3, 0.5, 'fbm', p.modSeed);
          return U.clamp((n - 0.5) * 2.4 + 0.5);
        }
        case 'random': return U.hash(U.mod(c, cols), U.mod(r, rows), p.modSeed);
        case 'radial': return U.clamp(Math.hypot(u - 0.5, v - 0.5) / Math.SQRT1_2);
        default: { // linear
          const s = p.modDir === 'h' ? u : p.modDir === 'v' ? v : p.modDir === 'diag' ? u + v : u - v + 1;
          if (p.modMirror) return tri(s); // period 1 in u and v -> seamless
          return p.modDir === 'h' || p.modDir === 'v' ? s : s / 2;
        }
      }
    };
    return (x, y, c, r) => {
      let f = field(U.mod(x / W, 1), U.mod(y / H, 1), c, r);
      if (p.modInvert) f = 1 - f;
      f = Math.pow(U.clamp(f), p.modCurve);
      return p.modMin + (p.modMax - p.modMin) * f;
    };
  }

  function paint(ctx, path, color, outline, lw) {
    if (outline) { ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(path); }
    else { ctx.fillStyle = color; ctx.fill(path); }
  }

  function cells(ctx, p, cols, rows, cw, ch, m, lw, outline, mod) {
    const a = (p.angle * Math.PI) / 180;
    const path = new Path2D();
    for (let r = -1; r <= rows; r++) {
      const off = p.stagger && U.mod(r, 2) ? 0.5 : 0;
      for (let c = -1; c <= cols; c++) {
        const x = (c + 0.5 + off) * cw, y = (r + 0.5) * ch;
        const s = p.size * m * mod(x, y, c, r), h = s / 2;
        if (s <= 0.01) continue;
        switch (p.shape) {
          case 'dots': path.moveTo(x + h, y); path.arc(x, y, h, 0, U.TAU); break;
          case 'rings': {
            const rr = h - lw / 2;
            if (rr > 0) { path.moveTo(x + rr, y); path.arc(x, y, rr, 0, U.TAU); }
            break;
          }
          case 'squares': U.polyPath(path, U.rotPts([[-h, -h], [h, -h], [h, h], [-h, h]], x, y, a), p.radius * s); break;
          case 'diamonds': U.polyPath(path, U.rotPts([[0, -h], [h, 0], [0, h], [-h, 0]], x, y, a)); break;
          case 'crosses': {
            const t = Math.min(lw, s) / 2;
            U.polyPath(path, U.rotPts([[-h, -t], [h, -t], [h, t], [-h, t]], x, y, a));
            U.polyPath(path, U.rotPts([[-t, -h], [t, -h], [t, h], [-t, h]], x, y, a));
            break;
          }
        }
      }
    }
    paint(ctx, path, p.fg, outline || p.shape === 'rings', lw);
  }

  function triangles(ctx, p, cols, rows, cw, ch, lw, outline, mod) {
    const up = new Path2D(), dn = new Path2D();
    const tri = (path, pts, c, r) => {
      const cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3, cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
      const k = p.size * mod(cx, cy, c, r);
      if (k <= 0.005) return;
      U.polyPath(path, pts.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k]));
    };
    for (let r = -1; r <= rows; r++) {
      const off = U.mod(r, 2) ? 0.5 : 0, y0 = r * ch, y1 = y0 + ch;
      for (let c = -2; c <= cols; c++) {
        const x = (c + off) * cw;
        tri(up, [[x, y1], [x + cw, y1], [x + cw / 2, y0]], c * 2, r);
        tri(dn, [[x + cw / 2, y0], [x + cw * 1.5, y0], [x + cw, y1]], c * 2 + 1, r);
      }
    }
    paint(ctx, up, p.fg, outline, lw);
    if (p.twoTone) paint(ctx, dn, p.fg2, outline, lw);
  }

  function hexagons(ctx, p, cols, rows, cw, ch, lw, outline, mod) {
    // pointy-top hexes; vertical radius is fitted to the row spacing so the grid tiles exactly
    const A = new Path2D(), B = new Path2D();
    for (let r = -1; r <= rows; r++) {
      const odd = U.mod(r, 2), off = odd ? 0.5 : 0;
      for (let c = -1; c <= cols; c++) {
        const x = (c + 0.5 + off) * cw, y = (r + 0.5) * ch, pts = [];
        const k = p.size * mod(x, y, c, r);
        if (k <= 0.005) continue;
        const rx = (cw / Math.sqrt(3)) * k, ry = (ch / 1.5) * k;
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 3;
          pts.push([x + Math.cos(a) * rx, y + Math.sin(a) * ry]);
        }
        U.polyPath(p.twoTone && odd ? B : A, pts);
      }
    }
    paint(ctx, A, p.fg, outline, lw);
    if (p.twoTone) paint(ctx, B, p.fg2, outline, lw);
  }

  function stripes(ctx, W, H, p) {
    const n = p.cols, t = p.line / n;
    const anti = p.dir === 'anti';
    ctx.save();
    ctx.scale(W, H); // unit space: stripes stay seamless on any aspect
    ctx.beginPath();
    for (let k = anti ? -2 * n - 1 : -1; k <= (anti ? n : 2 * n); k++) {
      const c = k / n;
      if (p.dir === 'h') ctx.rect(0, c, 1, t);
      else if (p.dir === 'v') ctx.rect(c, 0, t, 1);
      else if (p.dir === 'diag') { ctx.moveTo(c, 0); ctx.lineTo(c + t, 0); ctx.lineTo(c + t - 2, 2); ctx.lineTo(c - 2, 2); ctx.closePath(); }
      else { ctx.moveTo(c, 0); ctx.lineTo(c + t, 0); ctx.lineTo(c + t + 2, 2); ctx.lineTo(c + 2, 2); ctx.closePath(); }
    }
    ctx.fill();
    ctx.restore();
  }

  U.register({
    id: 'pattern',
    name: 'Pattern',
    desc: 'Seamless dots, squares, triangles, hexagons, stripes',
    tags: ['Texturing', 'UI'],
    tileable: true,
    icon: U.icon('<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="6" r="2.2"/><circle cx="12" cy="12" r="2.2"/><circle cx="6" cy="18" r="2.2"/><circle cx="18" cy="18" r="2.2"/>'),
    params: [
      { type: 'section', label: 'Pattern' },
      {
        key: 'shape', label: 'Shape', type: 'select', default: 'dots',
        options: [['dots', 'Dots'], ['squares', 'Squares / Rects'], ['diamonds', 'Diamonds'], ['rings', 'Rings'], ['crosses', 'Crosses'],
          ['triangles', 'Triangles'], ['hexagons', 'Hexagons'], ['checker', 'Checker'], ['stripes', 'Stripes'], ['grid', 'Grid lines']],
      },
      { key: 'cols', label: 'Columns', type: 'int', min: 1, max: 64, default: 8 },
      { key: 'autoRows', label: 'Auto rows', type: 'bool', default: true, show: (p) => p.shape !== 'stripes', tip: 'Pick the row count that keeps shapes regular' },
      { key: 'rows', label: 'Rows', type: 'int', min: 1, max: 64, default: 8, show: (p) => p.shape !== 'stripes' && !p.autoRows },
      { key: 'size', label: 'Size', type: 'range', min: 0.02, max: 1, step: 0.01, default: 0.55, show: (p) => !['checker', 'stripes', 'grid'].includes(p.shape) },
      { key: 'line', label: 'Line width', type: 'range', min: 0.01, max: 0.9, step: 0.01, default: 0.15, show: (p) => ['stripes', 'grid', 'crosses', 'rings'].includes(p.shape) || (p.outline && OUTLINE.includes(p.shape)) },
      { key: 'dir', label: 'Direction', type: 'select', default: 'diag', options: [['h', 'Horizontal'], ['v', 'Vertical'], ['diag', 'Diagonal /'], ['anti', 'Diagonal \\']], show: is('stripes') },
      { key: 'stagger', label: 'Stagger rows', type: 'bool', default: false, show: (p) => CELL.includes(p.shape) },
      { key: 'radius', label: 'Corner radius', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0, show: is('squares') },
      { key: 'angle', label: 'Shape rotation', type: 'range', min: -180, max: 180, step: 1, default: 0, show: is('squares', 'diamonds', 'crosses') },
      { key: 'outline', label: 'Outline only', type: 'bool', default: false, show: (p) => OUTLINE.includes(p.shape) },
      { type: 'section', label: 'Size modulation', show: (p) => SIZED.includes(p.shape) },
      {
        key: 'modType', label: 'Scale by', type: 'select', default: 'none',
        options: [['none', 'None'], ['noise', 'Noise'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient'], ['random', 'Random per shape']],
      },
      { key: 'modDir', label: 'Direction', type: 'select', default: 'h', options: [['h', 'Horizontal'], ['v', 'Vertical'], ['diag', 'Diagonal /'], ['anti', 'Diagonal \\']], show: (p) => p.modType === 'linear' },
      { key: 'modMirror', label: 'Mirrored (seamless)', type: 'bool', default: true, show: (p) => p.modType === 'linear', tip: 'Ramps up and back down so opposite edges match' },
      { key: 'modScale', label: 'Noise scale', type: 'int', min: 1, max: 16, default: 3, show: (p) => p.modType === 'noise' },
      { key: 'modSeed', label: 'Seed', type: 'seed', default: 99, show: (p) => p.modType === 'noise' || p.modType === 'random' },
      { key: 'modMin', label: 'Min scale', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.modType !== 'none' },
      { key: 'modMax', label: 'Max scale', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: (p) => p.modType !== 'none' },
      { key: 'modCurve', label: 'Curve', type: 'range', min: 0.2, max: 4, step: 0.01, default: 1, show: (p) => p.modType !== 'none' },
      { key: 'modInvert', label: 'Invert', type: 'bool', default: false, show: (p) => p.modType !== 'none' },
      { type: 'section', label: 'Colors' },
      { key: 'fg', label: 'Foreground', type: 'color', default: '#f2f2f2' },
      { key: 'twoTone', label: 'Second shape color', type: 'bool', default: false, show: is('triangles', 'hexagons') },
      { key: 'fg2', label: 'Foreground 2', type: 'color', default: '#ff8a3d', show: (p) => p.twoTone && ['triangles', 'hexagons'].includes(p.shape) },
      { key: 'transparent', label: 'Transparent background', type: 'bool', default: false },
      { key: 'bg', label: 'Background', type: 'color', default: '#1d1f24', show: (p) => !p.transparent },
    ],
    presets: [
      { name: 'Checker floor', group: 'Realistic', values: { shape: 'checker', cols: 8, fg: '#efe9dc', bg: '#1b1b1d' } },
      { name: 'Picnic gingham', group: 'Realistic', values: { shape: 'checker', cols: 16, fg: '#c8283a', bg: '#f6f1ea' } },
      { name: 'Hex bathroom tiles', group: 'Realistic', values: { shape: 'hexagons', cols: 12, size: 0.9, fg: '#f4f4f0', bg: '#9a9a94' } },
      { name: 'Chainmail', group: 'Realistic', values: { shape: 'rings', cols: 14, size: 1, line: 0.2, stagger: true, fg: '#a3a8ad', bg: '#202124' } },
      { name: 'Hazard stripes', group: 'Realistic', values: { shape: 'stripes', cols: 6, line: 0.5, fg: '#f5c400', bg: '#141414' } },
      { name: 'Pinstripe suit', group: 'Realistic', values: { shape: 'stripes', dir: 'v', cols: 32, line: 0.07, fg: '#7a7f8f', bg: '#1d2130' } },
      { name: 'Graph paper', group: 'Realistic', values: { shape: 'grid', cols: 32, line: 0.05, fg: '#9cc2e6', bg: '#f8fbff' } },
      { name: 'Perforated metal', group: 'Realistic', values: { shape: 'dots', cols: 16, size: 0.5, stagger: true, fg: '#0d0e10', bg: '#8f9398' } },
      { name: 'Tread plate', group: 'Realistic', values: { shape: 'squares', cols: 12, size: 0.5, stagger: true, angle: 45, radius: 0.12, fg: '#d3d6da', bg: '#868b91' } },
      { name: 'Carbon weave', group: 'Realistic', values: { shape: 'checker', cols: 32, fg: '#34373c', bg: '#121315' } },
      { name: 'Polka dots', group: 'Stylized', values: { shape: 'dots', cols: 6, size: 0.45, stagger: true, fg: '#ffffff', bg: '#e0475b' } },
      { name: 'Retro wallpaper', group: 'Stylized', values: { shape: 'rings', cols: 6, size: 0.95, line: 0.12, stagger: true, fg: '#e8a33d', bg: '#2d5a4f' } },
      { name: 'Halftone fade', group: 'Stylized', values: { shape: 'dots', cols: 24, size: 1, stagger: true, modType: 'linear', modDir: 'diag', fg: '#151515', bg: '#f3efe6' } },
      { name: 'Candy stripes', group: 'Stylized', values: { shape: 'stripes', dir: 'anti', cols: 8, line: 0.5, fg: '#ffffff', bg: '#e8434f' } },
      { name: 'Triangle mosaic', group: 'Stylized', values: { shape: 'triangles', cols: 6, size: 0.9, twoTone: true, fg: '#4ecdc4', fg2: '#ff6b6b', bg: '#2d3047' } },
      { name: 'Swiss crosses', group: 'Stylized', values: { shape: 'crosses', cols: 8, size: 0.55, line: 0.18, stagger: true, fg: '#ffffff', bg: '#d62839' } },
      { name: 'Honeycomb', group: 'Stylized', values: { shape: 'hexagons', cols: 8, size: 0.88, fg: '#ffc63b', bg: '#7a4a00' } },
      { name: 'Harlequin', group: 'Stylized', values: { shape: 'diamonds', cols: 6, size: 1, fg: '#b3202e', bg: '#1c1c1c' } },
      { name: 'Bubble dots', group: 'Stylized', values: { shape: 'dots', cols: 12, size: 0.95, stagger: true, modType: 'noise', modScale: 2, modMin: 0.1, fg: '#7ad3ff', bg: '#283a73' } },
      { name: 'Hex shield', group: 'Sci-fi', values: { shape: 'hexagons', cols: 14, size: 0.95, outline: true, line: 0.06, fg: '#39d0ff', bg: '#050b14' } },
      { name: 'Neon grid', group: 'Sci-fi', values: { shape: 'grid', cols: 16, line: 0.06, fg: '#ff2fd6', bg: '#0b0420' } },
      { name: 'Hex dissolve', group: 'Sci-fi', values: { shape: 'hexagons', cols: 16, size: 0.92, twoTone: true, modType: 'radial', modInvert: true, modCurve: 0.6, fg: '#36f1cd', fg2: '#1aa0c8', bg: '#04121a' } },
      { name: 'Data panel', group: 'Sci-fi', values: { shape: 'squares', cols: 16, size: 0.8, radius: 0.12, modType: 'random', modMin: 0.15, fg: '#3cf0a0', bg: '#06140f' } },
      { name: 'LED matrix', group: 'Sci-fi', values: { shape: 'dots', cols: 32, size: 0.7, modType: 'noise', modScale: 4, modCurve: 1.8, fg: '#ff5a2a', bg: '#140805' } },
      { name: 'Hologram triangles', group: 'Sci-fi', values: { shape: 'triangles', cols: 10, size: 0.96, outline: true, line: 0.04, fg: '#b46bff', bg: '#0b0617' } },
    ],
    render(ctx, W, H, p) {
      if (!p.transparent) { ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H); }
      ctx.fillStyle = ctx.strokeStyle = p.fg;
      ctx.lineJoin = 'round';
      if (p.shape === 'stripes') return stripes(ctx, W, H, p);

      let cols = p.cols;
      if (p.shape === 'checker' && cols % 2) cols++;
      const rows = rowsFor(p, W, H, cols);
      const cw = W / cols, ch = H / rows, m = Math.min(cw, ch), lw = p.line * m;
      const outline = p.outline && OUTLINE.includes(p.shape);
      // triangles index columns per half-cell (2 per column) for the per-cell random mode
      const mod = makeMod(p, W, H, p.shape === 'triangles' ? cols * 2 : cols, rows);

      switch (p.shape) {
        case 'grid':
          ctx.beginPath();
          for (let c = 0; c <= cols; c++) ctx.rect(c * cw - lw / 2, 0, lw, H);
          for (let r = 0; r <= rows; r++) ctx.rect(0, r * ch - lw / 2, W, lw);
          ctx.fill();
          break;
        case 'checker':
          ctx.beginPath();
          for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if ((r + c) % 2 === 0) ctx.rect(c * cw, r * ch, cw, ch);
          ctx.fill();
          break;
        case 'triangles': triangles(ctx, p, cols, rows, cw, ch, lw, outline, mod); break;
        case 'hexagons': hexagons(ctx, p, cols, rows, cw, ch, lw, outline, mod); break;
        default: cells(ctx, p, cols, rows, cw, ch, m, lw, outline, mod);
      }
      return { text: `${cols} × ${rows} cells` };
    },
  });
})();
