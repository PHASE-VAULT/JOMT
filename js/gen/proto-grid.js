/* Prototype grid: greybox / dev textures for level design and layouting. A flat base color (palette presets
   or custom), optional checker on major or minor cells and subtle tileable grunge; major and minor grid lines
   (minor solid, dashed or dotted), diagonal crosses, cell-corner brackets, edge ticks or corner triangles,
   per-cell labels (size text, A1, x,y or index), a size stamp ("1024 × 1024" or custom) and X / Y axis arrows.
   Always tiles: the line positions are whole pixels with x = 0 and x = W both drawn, so the border lines are
   half width on each edge and join into one full line across the seam; anything that crosses the border is
   drawn with wrapped copies. Output as color, lines only (transparent) or a white-on-black mask. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp } = U;

  // palette: base, checker, major, minor, text
  const PALETTES = {
    grey: ['#8a8a8a', '#7c7c7c', '#5a5a5a', '#737373', '#3c3c3c'],
    light: ['#d4d4d4', '#c6c6c6', '#9a9a9a', '#b8b8b8', '#6a6a6a'],
    dark: ['#3a3d42', '#33363a', '#25272b', '#2f3236', '#9aa0a8'],
    night: ['#15181d', '#1b1f25', '#4cc2ff', '#2a3340', '#4cc2ff'],
    orange: ['#e8833a', '#dc7630', '#b65a1c', '#d26f2a', '#6e3208'],
    blue: ['#4a7bd0', '#4270c2', '#2c55a0', '#3e69b8', '#e8f0ff'],
    green: ['#5aa84e', '#509c45', '#3a7f31', '#4c9442', '#173c12'],
    purple: ['#8a5ac8', '#7f50bb', '#633a9c', '#7a4cb4', '#f0e6ff'],
    red: ['#c83a3a', '#bb3232', '#932222', '#b23030', '#ffe8e8'],
    yellow: ['#e6c23a', '#dab632', '#b0901c', '#cfac2e', '#4a3a00'],
  };
  const PAL_OPTS = [['grey', 'Grey'], ['light', 'Light grey'], ['dark', 'Dark grey'], ['night', 'Night (dark mode)'], ['orange', 'Orange'], ['blue', 'Blue'], ['green', 'Green'], ['purple', 'Purple'], ['red', 'Red (danger)'], ['yellow', 'Yellow (caution)'], ['custom', 'Custom']];
  const POS = [['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right'], ['center', 'Center']];
  const FONTS = {
    sans: (s) => `700 ${s}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`,
    mono: (s) => `700 ${s}px Consolas, "Cascadia Mono", "Courier New", monospace`,
    stencil: (s) => `400 ${s}px Impact, "Arial Narrow Bold", "Arial Narrow", sans-serif`,
  };
  const letters = (n) => { let s = ''; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };
  const TIMES = String.fromCharCode(215);
  const notOut = (o) => (p) => p.output !== o;

  U.register({
    id: 'proto-grid',
    name: 'Prototype Grid',
    desc: 'Tileable greybox / dev grid textures with major and minor lines, checker, cell labels, size stamp, diagonals and axis arrows',
    uses: [
      'Prototype and greybox materials for level design: floors, walls and trims with a readable metric grid, so scale and alignment are obvious while blocking out.',
      'Layout and debug textures: UV / texel-density checks, measuring grids, overlay grids (lines only) and grid masks for emission or decals.',
    ],
    tags: ['Texturing', 'UI'],
    tileable: true,
    aspect: '1:1',
    icon: U.icon('<rect x="3.5" y="3.5" width="17" height="17" rx="1"/><path d="M12 3.5v17M3.5 12h17"/><path d="M7.75 3.5v17M16.25 3.5v17M3.5 7.75h17M3.5 16.25h17" opacity=".35"/><path d="M5.5 5.5l4.5 4.5M10 5.5l-4.5 4.5" opacity=".7"/>'),
    params: [
      { type: 'section', label: 'Base' },
      {
        key: 'palette', label: 'Color preset', type: 'select', default: 'grey', options: PAL_OPTS,
        apply: (v, p) => { const c = PALETTES[v]; if (c) [p.color, p.color2, p.majorColor, p.minorColor, p.textColor] = c; },
        tip: 'Sets the base, checker, line and text colors at once; edit any of them afterwards',
      },
      { key: 'color', label: 'Base color', type: 'color', default: PALETTES.grey[0], show: notOut('mask') },
      { key: 'checker', label: 'Checker', type: 'select', default: 'none', options: [['none', 'None'], ['major', 'Major cells'], ['minor', 'Minor cells']], show: notOut('mask') },
      { key: 'color2', label: 'Checker color', type: 'color', default: PALETTES.grey[1], show: (p) => p.checker !== 'none' && p.output !== 'mask' },
      { key: 'grunge', label: 'Surface grunge', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.output === 'color', tip: 'Subtle tileable blotches and grain' },
      { key: 'grungeScale', label: 'Grunge scale', type: 'range', min: 1, max: 16, step: 1, default: 4, show: (p) => p.output === 'color' && p.grunge > 0, tip: 'Blotches across the texture (whole numbers keep it tileable)' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 5, show: (p) => p.output === 'color' && p.grunge > 0 },

      { type: 'section', label: 'Grid' },
      { key: 'cells', label: 'Major cells', type: 'int', min: 1, max: 32, default: 4, tip: 'Major cells across the short side; the long side gets a whole number of cells too (tileable)' },
      { key: 'subdiv', label: 'Minor subdivisions', type: 'int', min: 1, max: 16, default: 4, tip: 'Minor cells per major cell (1 = none)' },
      { key: 'majorW', label: 'Major width', type: 'range', min: 0, max: 16, step: 0.25, default: 3, tip: 'px @ 512' },
      { key: 'majorColor', label: 'Major color', type: 'color', default: PALETTES.grey[2], show: (p) => p.majorW > 0 && p.output !== 'mask' },
      { key: 'majorAlpha', label: 'Major opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: (p) => p.majorW > 0 },
      { key: 'minorStyle', label: 'Minor lines', type: 'select', default: 'solid', options: [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['none', 'None']], show: (p) => p.subdiv > 1 },
      { key: 'minorW', label: 'Minor width', type: 'range', min: 0.25, max: 8, step: 0.25, default: 1, show: (p) => p.subdiv > 1 && p.minorStyle !== 'none', tip: 'px @ 512' },
      { key: 'minorColor', label: 'Minor color', type: 'color', default: PALETTES.grey[3], show: (p) => p.subdiv > 1 && p.minorStyle !== 'none' && p.output !== 'mask' },
      { key: 'minorAlpha', label: 'Minor opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: (p) => p.subdiv > 1 && p.minorStyle !== 'none' },
      { key: 'borderW', label: 'Tile border', type: 'range', min: 0, max: 24, step: 0.25, default: 0, tip: 'Extra-wide line along the texture border (px @ 512, full width across the seam; 0 = like the major lines)' },

      { type: 'section', label: 'Marks', active: (p) => p.diagonal !== 'none' || p.marks !== 'none' || p.axes },
      { key: 'diagonal', label: 'Diagonals', type: 'select', default: 'none', options: [['none', 'None'], ['cellX', 'X in every major cell'], ['cellSlash', '/ in every major cell'], ['tileX', 'X across the texture']] },
      { key: 'diagAlpha', label: 'Diagonal opacity', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.5, show: (p) => p.diagonal !== 'none' },
      { key: 'marks', label: 'Markers', type: 'select', default: 'none', options: [['none', 'None'], ['corners', 'Cell corner brackets'], ['ticks', 'Edge center ticks'], ['triangles', 'Texture corner triangles']] },
      { key: 'markSize', label: 'Marker size', type: 'range', min: 0.03, max: 0.5, step: 0.01, default: 0.15, show: (p) => p.marks !== 'none', tip: 'Fraction of a major cell (triangles: of the texture)' },
      { key: 'markColor', label: 'Marker color', type: 'color', default: '#ffffff', show: (p) => p.marks !== 'none' && p.output !== 'mask' },
      { key: 'axes', label: 'Axis arrows', type: 'bool', default: false },
      { key: 'axesLabels', label: 'Axis names', type: 'select', default: 'xy', options: [['xy', 'X / Y (red / green)'], ['xz', 'X / Z (red / blue)'], ['uv', 'U / V']], show: (p) => p.axes },
      { key: 'axesPos', label: 'Axis origin', type: 'select', default: 'bl', options: [['bl', 'Bottom left'], ['tl', 'Top left'], ['center', 'Center']], show: (p) => p.axes },
      { key: 'axesSize', label: 'Axis length', type: 'range', min: 0.05, max: 0.5, step: 0.01, default: 0.18, show: (p) => p.axes, tip: 'Fraction of the short side' },

      { type: 'section', label: 'Labels', active: (p) => p.cellLabel !== 'none' || p.sizeText !== 'none' },
      { key: 'cellLabel', label: 'Cell labels', type: 'select', default: 'none', options: [['none', 'None'], ['text', 'Size text (e.g. 1m)'], ['coords', 'Coordinates (A1)'], ['xy', 'x, y (0, 0)'], ['index', 'Numbered (1, 2, 3)']] },
      { key: 'cellText', label: 'Cell text', type: 'text', default: '1m', max: 12, show: (p) => p.cellLabel === 'text' },
      { key: 'labelPos', label: 'Label position', type: 'select', default: 'tl', options: POS, show: (p) => p.cellLabel !== 'none' },
      { key: 'labelSize', label: 'Label size', type: 'range', min: 0.05, max: 0.5, step: 0.01, default: 0.14, show: (p) => p.cellLabel !== 'none', tip: 'Fraction of a major cell' },
      { key: 'sizeText', label: 'Size stamp', type: 'select', default: 'pixels', options: [['none', 'None'], ['pixels', 'Pixel size (1024 × 1024)'], ['custom', 'Custom text']] },
      { key: 'sizeCustom', label: 'Stamp text', type: 'text', default: '1 m', max: 20, show: (p) => p.sizeText === 'custom' },
      { key: 'sizePos', label: 'Stamp position', type: 'select', default: 'bl', options: POS, show: (p) => p.sizeText !== 'none' },
      { key: 'sizeScale', label: 'Stamp size', type: 'range', min: 0.015, max: 0.2, step: 0.005, default: 0.04, show: (p) => p.sizeText !== 'none', tip: 'Fraction of the short side' },
      { key: 'font', label: 'Font', type: 'select', default: 'sans', options: [['sans', 'Sans'], ['mono', 'Monospace'], ['stencil', 'Condensed / stencil']], show: (p) => p.cellLabel !== 'none' || p.sizeText !== 'none' },
      { key: 'textColor', label: 'Text color', type: 'color', default: PALETTES.grey[4], show: (p) => (p.cellLabel !== 'none' || p.sizeText !== 'none') && p.output !== 'mask' },
      { key: 'textAlpha', label: 'Text opacity', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.8, show: (p) => p.cellLabel !== 'none' || p.sizeText !== 'none' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color texture'], ['lines', 'Lines only (transparent)'], ['mask', 'Mask (white on black)']], tip: 'Lines only: overlay grid for decals / UI. Mask: grayscale for emission, roughness or blending in the engine' },
    ],
    presets: [
      { name: 'Grey (classic)', group: 'Colors', values: {} },
      { name: 'Light grey', group: 'Colors', values: { palette: 'light' } },
      { name: 'Dark grey', group: 'Colors', values: { palette: 'dark' } },
      { name: 'Orange', group: 'Colors', values: { palette: 'orange', cellLabel: 'text', labelPos: 'tl' } },
      { name: 'Blue', group: 'Colors', values: { palette: 'blue', checker: 'major' } },
      { name: 'Green', group: 'Colors', values: { palette: 'green', diagonal: 'cellX', diagAlpha: 0.35 } },
      { name: 'Purple', group: 'Colors', values: { palette: 'purple', marks: 'corners', markColor: '#f0e6ff' } },
      { name: 'Red / danger', group: 'Colors', values: { palette: 'red', diagonal: 'tileX', diagAlpha: 0.45, majorW: 4, sizeText: 'custom', sizeCustom: 'DANGER', sizePos: 'center', sizeScale: 0.09, font: 'stencil', textAlpha: 0.9 } },
      { name: 'Night / dark mode', group: 'Colors', values: { palette: 'night', majorW: 1.5, minorW: 0.75, majorAlpha: 0.8, minorAlpha: 0.7, cellLabel: 'xy', labelSize: 0.1, textAlpha: 0.55, font: 'mono' } },
      { name: 'Floor 1 m', group: 'Level design', values: { palette: 'grey', cells: 4, subdiv: 10, minorW: 0.6, majorW: 3, cellLabel: 'text', cellText: '1m', labelPos: 'tl', labelSize: 0.13, sizeText: 'custom', sizeCustom: '4 m × 4 m', sizePos: 'br', marks: 'triangles', markSize: 0.08, markColor: '#d9d9d9' } },
      { name: 'Wall 50 cm', group: 'Level design', values: { palette: 'orange', cells: 2, subdiv: 5, majorW: 4, minorW: 1, cellLabel: 'text', cellText: '50cm', labelPos: 'tl', labelSize: 0.1, sizeText: 'custom', sizeCustom: '1 m', sizePos: 'br', diagonal: 'cellSlash', diagAlpha: 0.25, axes: true, axesLabels: 'xz', axesSize: 0.14 } },
      { name: 'Trim strip', group: 'Level design', aspect: '4:1', values: { palette: 'dark', cells: 1, subdiv: 4, majorW: 3, borderW: 6, marks: 'ticks', markSize: 0.12, markColor: '#c9ced6', sizeText: 'custom', sizeCustom: 'TRIM 25cm', sizePos: 'bl', sizeScale: 0.16 } },
      { name: 'Coordinate floor', group: 'Level design', values: { palette: 'light', cells: 8, subdiv: 2, majorW: 2, minorStyle: 'dashed', cellLabel: 'coords', labelPos: 'center', labelSize: 0.22, textAlpha: 0.45, sizeText: 'none', axes: true } },
      { name: 'Debug checker', group: 'Debug', values: { palette: 'custom', color: '#d9d9d9', color2: '#3a3a3a', checker: 'major', cells: 8, subdiv: 1, majorW: 0, cellLabel: 'coords', labelPos: 'center', labelSize: 0.2, textColor: '#e0473a', textAlpha: 1, sizeText: 'none' } },
      { name: 'UV / texel check', group: 'Debug', values: { palette: 'custom', color: '#b0b0b0', color2: '#8c8c8c', checker: 'minor', cells: 8, subdiv: 2, majorW: 1.5, majorColor: '#e0473a', minorStyle: 'none', cellLabel: 'index', labelPos: 'tl', labelSize: 0.18, textColor: '#1a1a1a', textAlpha: 0.85, axes: true, axesLabels: 'uv', axesPos: 'bl', sizeText: 'pixels', sizePos: 'center', sizeScale: 0.05 } },
      { name: 'Blueprint', group: 'Debug', values: { palette: 'custom', color: '#1d4f91', majorColor: '#dce9ff', minorColor: '#7fa3d6', textColor: '#dce9ff', cells: 4, subdiv: 5, majorW: 1.5, minorW: 0.6, majorAlpha: 0.8, minorAlpha: 0.6, font: 'mono', cellLabel: 'xy', labelSize: 0.1, textAlpha: 0.8, grunge: 0.25 } },
      { name: 'Worn concrete greybox', group: 'Debug', values: { palette: 'grey', grunge: 0.6, grungeScale: 3, majorW: 2.5, minorAlpha: 0.7, seed: 11 } },
      { name: 'Grid overlay (lines only)', group: 'Output', values: { output: 'lines', palette: 'custom', majorColor: '#ffffff', minorColor: '#ffffff', majorAlpha: 0.8, minorAlpha: 0.3, majorW: 2, sizeText: 'none' } },
      { name: 'Grid mask (emission)', group: 'Output', values: { output: 'mask', majorW: 2.5, minorW: 1, minorAlpha: 0.35, sizeText: 'none' } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), k = S / 512, out = p.output, mask = out === 'mask';
      const col = (c) => (mask ? '#ffffff' : c);
      const nx = Math.max(1, Math.round((p.cells * W) / S)), ny = Math.max(1, Math.round((p.cells * H) / S)), sub = Math.max(1, p.subdiv | 0);
      const X = [], Y = [];
      for (let i = 0; i <= nx; i++) X.push(Math.round((i * W) / nx));
      for (let j = 0; j <= ny; j++) Y.push(Math.round((j * H) / ny));
      const minor = (A) => { const o = []; for (let i = 0; i + 1 < A.length; i++) for (let s = 1; s < sub; s++) o.push(Math.round(A[i] + ((A[i + 1] - A[i]) * s) / sub)); return o; };
      const cw = W / nx, ch = H / ny, cs = Math.min(cw, ch);

      /* ---------- base, checker, grunge ---------- */
      if (mask) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      else if (out === 'color') {
        ctx.fillStyle = p.color; ctx.fillRect(0, 0, W, H);
        if (p.checker !== 'none') {
          const mx = p.checker === 'minor' ? sub : 1, xs = [], ys = [];
          for (let i = 0; i <= nx * mx; i++) xs.push(Math.round((i * W) / (nx * mx)));
          for (let j = 0; j <= ny * mx; j++) ys.push(Math.round((j * H) / (ny * mx)));
          ctx.fillStyle = p.color2;
          for (let j = 0; j + 1 < ys.length; j++) for (let i = 0; i + 1 < xs.length; i++) if ((i + j) & 1) ctx.fillRect(xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j]);
        }
        if (p.grunge > 0) grunge(ctx, W, H, S, p);
      }

      /* ---------- lines (each level on its own layer so crossings don't double the opacity) ---------- */
      const layer = (alpha, draw) => {
        if (alpha <= 0) return;
        const c = U.canvas(W, H), g = c.getContext('2d');
        draw(g);
        ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(c, 0, 0); ctx.restore();
      };
      // crisp line of width w centered on whole pixel v; on the border v = 0 / v = W it is cut in half
      const px = (w) => Math.max(1, Math.round(w * k));
      const vline = (g, x, w, y0 = 0, y1 = H) => { const a = Math.floor(w / 2); g.fillRect(x - a, y0, w, y1 - y0); };
      const hline = (g, y, w, x0 = 0, x1 = W) => { const a = Math.floor(w / 2); g.fillRect(x0, y - a, x1 - x0, w); };
      // thin lines below 1 px fade instead of shrinking
      const thin = (w) => clamp(w * k);
      if (sub > 1 && p.minorStyle !== 'none') {
        const w = px(p.minorW), mxs = minor(X), mys = minor(Y);
        layer(p.minorAlpha * thin(p.minorW), (g) => {
          g.fillStyle = col(p.minorColor);
          if (p.minorStyle === 'solid') { for (const x of mxs) vline(g, x, w); for (const y of mys) hline(g, y, w); }
          else {
            // dashes / dots fitted to the minor cells, so they tile and stay clear of the crossings
            const ax = X.concat(mxs).sort((a, b) => a - b), ay = Y.concat(mys).sort((a, b) => a - b);
            const segs = (A, f) => { for (let i = 0; i + 1 < A.length; i++) f(A[i], A[i + 1]); };
            if (p.minorStyle === 'dashed') {
              for (const x of mxs) segs(ay, (a, b) => vline(g, x, w, a + (b - a) * 0.25, b - (b - a) * 0.25));
              for (const y of mys) segs(ax, (a, b) => hline(g, y, w, a + (b - a) * 0.25, b - (b - a) * 0.25));
            } else {
              const d = Math.max(w * 1.6, 2), dots = (a, b, f) => { const n = Math.max(1, Math.round((b - a) / (d * 3))); for (let s = 0; s < n; s++) f(a + ((b - a) * (s + 0.5)) / n); };
              for (const x of mxs) segs(ay, (a, b) => dots(a, b, (y) => g.fillRect(x - d / 2, y - d / 2, d, d)));
              for (const y of mys) segs(ax, (a, b) => dots(a, b, (x) => g.fillRect(x - d / 2, y - d / 2, d, d)));
            }
          }
        });
      }
      if (p.majorW > 0 || p.borderW > 0) {
        const w = px(p.majorW), bw = p.borderW > 0 ? Math.max(1, Math.round(p.borderW * k)) : w;
        layer(p.majorAlpha * (p.majorW > 0 ? thin(p.majorW) : 1), (g) => {
          g.fillStyle = col(p.majorColor);
          if (p.majorW > 0) { for (const x of X.slice(1, -1)) vline(g, x, w); for (const y of Y.slice(1, -1)) hline(g, y, w); }
          // the border: half of the line on each edge
          vline(g, 0, bw); vline(g, W, bw); hline(g, 0, bw); hline(g, H, bw);
        });
      }

      /* ---------- marks ---------- */
      // draws f(g, ox, oy) at the 9 wrapped offsets so shapes crossing the border tile
      const wrap9 = (g, f) => { for (const oy of [-H, 0, H]) for (const ox of [-W, 0, W]) f(g, ox, oy); };
      if (p.diagonal !== 'none') {
        layer(p.diagAlpha, (g) => {
          g.strokeStyle = col(p.majorColor); g.lineWidth = Math.max(1, Math.max(p.majorW, 1) * 0.7 * k); g.lineCap = 'butt';
          g.beginPath();
          wrap9(g, (g, ox, oy) => {
            if (p.diagonal === 'tileX') { g.moveTo(ox, oy); g.lineTo(ox + W, oy + H); g.moveTo(ox + W, oy); g.lineTo(ox, oy + H); return; }
            for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
              const x0 = X[i] + ox, x1 = X[i + 1] + ox, y0 = Y[j] + oy, y1 = Y[j + 1] + oy;
              g.moveTo(x0, y1); g.lineTo(x1, y0);
              if (p.diagonal === 'cellX') { g.moveTo(x0, y0); g.lineTo(x1, y1); }
            }
          });
          g.stroke();
        });
      }
      if (p.marks !== 'none') {
        layer(1, (g) => {
          g.fillStyle = g.strokeStyle = col(p.markColor);
          const lw = Math.max(1, Math.max(p.majorW, 1.5) * k);
          if (p.marks === 'triangles') {
            const L = p.markSize * S * 0.5;
            for (const [x, y, sx, sy] of [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + sx * L, y); g.lineTo(x, y + sy * L); g.closePath(); g.fill(); }
          } else if (p.marks === 'corners') {
            const L = p.markSize * cs, gap = lw * 1.5 + px(p.majorW) / 2;
            for (const x of X) for (const y of Y) for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
              const cx = x + sx * gap, cy = y + sy * gap;
              g.fillRect(Math.min(cx, cx + sx * L), sy > 0 ? cy : cy - lw, L, lw);
              g.fillRect(sx > 0 ? cx : cx - lw, Math.min(cy, cy + sy * L), lw, L);
            }
          } else {
            const L = p.markSize * cs * 0.5;
            for (const x of X) for (let j = 0; j < ny; j++) { const y = (Y[j] + Y[j + 1]) / 2; g.fillRect(x - L, Math.round(y - lw / 2), 2 * L, lw); }
            for (const y of Y) for (let i = 0; i < nx; i++) { const x = (X[i] + X[i + 1]) / 2; g.fillRect(Math.round(x - lw / 2), y - L, lw, 2 * L); }
          }
        });
      }

      /* ---------- labels ---------- */
      const font = FONTS[p.font] || FONTS.sans, edge = px(p.majorW) / 2;
      const put = (g, t, x0, y0, x1, y1, pos, size) => {
        g.font = font(size);
        const pad = size * 0.35 + edge;
        g.textAlign = pos === 'center' ? 'center' : pos[1] === 'l' ? 'left' : 'right';
        g.textBaseline = pos === 'center' ? 'middle' : pos[0] === 't' ? 'top' : 'bottom';
        const x = pos === 'center' ? (x0 + x1) / 2 : pos[1] === 'l' ? x0 + pad : x1 - pad;
        const y = pos === 'center' ? (y0 + y1) / 2 : pos[0] === 't' ? y0 + pad : y1 - pad;
        g.fillText(t, x, y + (g.textBaseline === 'top' ? size * 0.06 : 0));
      };
      if (p.cellLabel !== 'none') {
        layer(p.textAlpha, (g) => {
          g.fillStyle = col(p.textColor);
          const name = (i, j) => (p.cellLabel === 'text' ? p.cellText || '' : p.cellLabel === 'coords' ? letters(i) + (j + 1) : p.cellLabel === 'xy' ? `${i},${j}` : String(j * nx + i + 1));
          // one font size for all cells: fit the widest label into the cell
          g.font = font(100);
          let wMax = 0.01;
          for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) wMax = Math.max(wMax, g.measureText(name(i, j)).width / 100);
          const size = Math.max(4, Math.min(p.labelSize * cs, (cs * 0.8) / wMax));
          for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) put(g, name(i, j), X[i], Y[j], X[i + 1], Y[j + 1], p.labelPos, size);
        });
      }
      if (p.sizeText !== 'none') {
        const t = p.sizeText === 'pixels' ? `${W} ${TIMES} ${H}` : p.sizeCustom || '';
        if (t) layer(p.textAlpha, (g) => {
          g.fillStyle = col(p.textColor); g.font = font(100);
          const size = Math.max(4, Math.min(p.sizeScale * S, (W * 0.9) / Math.max(0.01, g.measureText(t).width / 100)));
          put(g, t, 0, 0, W, H, p.sizePos, size);
        });
      }

      /* ---------- axis arrows ---------- */
      if (p.axes) {
        const L = p.axesSize * S, lw = Math.max(1.5, 3 * k), m = edge + lw * 2 + S * 0.02, ah = lw * 3.2;
        const [ox, oy] = p.axesPos === 'center' ? [W / 2, H / 2] : p.axesPos === 'tl' ? [m, m] : [m, H - m];
        const vy = p.axesPos === 'tl' ? 1 : -1; // vertical axis points into the texture
        const [nX, nY] = p.axesLabels === 'uv' ? ['U', 'V'] : p.axesLabels === 'xz' ? ['X', 'Z'] : ['X', 'Y'];
        const cX = mask ? '#fff' : '#e5484d', cY = mask ? '#fff' : p.axesLabels === 'xz' ? '#3e7bfa' : '#46a758';
        layer(1, (g) => {
          g.lineWidth = lw; g.lineCap = 'round';
          const arrow = (dx, dy, c, label) => {
            const ex = ox + dx * L, ey = oy + dy * L;
            g.strokeStyle = g.fillStyle = c;
            g.beginPath(); g.moveTo(ox, oy); g.lineTo(ex - dx * ah, ey - dy * ah); g.stroke();
            g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - dx * ah * 1.6 - dy * ah * 0.75, ey - dy * ah * 1.6 + dx * ah * 0.75); g.lineTo(ex - dx * ah * 1.6 + dy * ah * 0.75, ey - dy * ah * 1.6 - dx * ah * 0.75); g.closePath(); g.fill();
            g.font = font(Math.max(6, L * 0.22)); g.textAlign = 'center'; g.textBaseline = 'middle';
            g.fillText(label, ex + dx * L * 0.16 + (dy ? L * 0.13 : 0), ey + dy * L * 0.16 + (dx ? -vy * L * 0.13 : 0));
          };
          arrow(1, 0, cX, nX); arrow(0, vy, cY, nY);
          g.fillStyle = mask ? '#fff' : '#f2f2f2'; g.beginPath(); g.arc(ox, oy, lw * 1.6, 0, Math.PI * 2); g.fill();
        });
      }
    },
  });

  /* subtle tileable grunge: low-frequency blotches (periodic noise on a coarse grid, wrapped bilinear) and
     per-pixel grain, applied as a brightness change */
  function grunge(ctx, W, H, S, p) {
    const px = Math.max(1, Math.round((p.grungeScale * W) / S)), py = Math.max(1, Math.round((p.grungeScale * H) / S));
    const gw = Math.max(8, px * 16), gh = Math.max(8, py * 16), G = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) G[j * gw + i] = U.fractal('perlin', (i / gw) * px, (j / gh) * py, px, py, 5, 0.55, 'fbm', p.seed) - 0.5;
    const img = ctx.getImageData(0, 0, W, H), d = img.data, amt = p.grunge;
    for (let y = 0, o = 0; y < H; y++) {
      const fy = (y / H) * gh, j = Math.floor(fy), ty = fy - j, j0 = j % gh, j1 = (j + 1) % gh;
      for (let x = 0; x < W; x++, o += 4) {
        const fx = (x / W) * gw, i = Math.floor(fx), tx = fx - i, i0 = i % gw, i1 = (i + 1) % gw;
        const a = G[j0 * gw + i0] + (G[j0 * gw + i1] - G[j0 * gw + i0]) * tx, b = G[j1 * gw + i0] + (G[j1 * gw + i1] - G[j1 * gw + i0]) * tx;
        const n = (a + (b - a) * ty) * 0.55 + (U.hash(x, y, p.seed + 3) - 0.5) * 0.12, f = 1 + n * amt * 0.5;
        d[o] = d[o] * f; d[o + 1] = d[o + 1] * f; d[o + 2] = d[o + 2] * f;
      }
    }
    ctx.putImageData(img, 0, 0);
  }
})();
