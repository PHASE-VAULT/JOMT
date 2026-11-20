/* Map grid: transparent coordinate-system overlays for maps (world maps, tactical / military maps, minimaps,
   fantasy atlases, sci-fi star maps, game boards). A grid of major lines (fixed column / row counts, or square
   cells from the short side) with minor subdivisions; each level solid, dashed, dotted or drawn as + marks at
   the intersections. Axis labels per axis in many naming styles (letters, numbers, zero-padded, roman,
   military two-digit easting / northing, latitude / longitude, chess), placed on any edge, either in the
   middle of the cells or on the lines, optionally as cell IDs ("B4") inside every cell. Extras: a border band
   with neatline (alternating scale ticks), edge ticks, frame, north arrow / compass rose, scale bar, origin
   axes, grid-zone designator and an optional background (color or checkerboard).
   Sizes are fractions of the short side (line widths in px @ 512), so the preview matches every export. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp } = U;
  const TAU = Math.PI * 2;

  const NAMING = [['letters', 'Letters (A, B … AA)'], ['lower', 'Lowercase letters (a, b …)'], ['numbers', 'Numbers (1, 2, 3)'], ['padded', 'Zero-padded (01, 02)'],
    ['roman', 'Roman numerals (I, II, III)'], ['mgrs', 'Military grid (two-digit easting / northing)'], ['latlon', 'Latitude / longitude (12°N, 45°E)'],
    ['chess', 'Chess (a–h / 1–8)'], ['none', 'None']];
  const LINE = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['cross', '+ marks at intersections'], ['none', 'None']];
  const CORNERS = [['none', 'None'], ['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right']];
  const FONTS = {
    sans: (s) => `600 ${s}px system-ui, "Segoe UI", Roboto, sans-serif`,
    mono: (s) => `600 ${s}px Consolas, "Cascadia Mono", "Courier New", monospace`,
    serif: (s) => `600 ${s}px Georgia, "Times New Roman", serif`,
    stencil: (s) => `400 ${s}px Impact, "Arial Narrow Bold", "Arial Narrow", sans-serif`,
  };

  /* ---------- naming ---------- */
  const letters = (n) => { let s = ''; n = Math.floor(n); if (n < 0) return ''; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };
  const roman = (n) => {
    n = Math.round(n); if (n <= 0 || n > 3999) return String(n);
    const R = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = ''; for (const [v, r] of R) while (n >= v) { s += r; n -= v; } return s;
  };
  const DEG = String.fromCharCode(176), PRIME = String.fromCharCode(8242);
  const num = (v) => (Math.abs(v - Math.round(v)) < 1e-6 ? String(Math.round(v)) : String(+v.toFixed(2)));
  const pad2 = (v) => { const r = Math.round(v); return (r < 0 ? '-' : '') + String(Math.abs(r)).padStart(2, '0'); };
  function deg(v, axis) {
    const hemi = axis === 'x' ? (v < 0 ? 'W' : 'E') : v < 0 ? 'S' : 'N';
    let a = Math.abs(v), d = Math.floor(a + 1e-9), m = Math.round((a - d) * 60);
    if (m === 60) { d++; m = 0; }
    // degree / prime signs built from char codes: the output never depends on the page's text encoding
    return `${d}${DEG}${m ? String(m).padStart(2, '0') + PRIME : ''}${hemi}`;
  }
  /* label for index i (0-based) of `count` along an axis */
  function name(style, start, step, i, axis, count) {
    switch (style) {
      case 'letters': return letters(Math.round(start) - 1 + i);
      case 'lower': return letters(Math.round(start) - 1 + i).toLowerCase();
      case 'numbers': return num(start + i * step);
      case 'padded': return pad2(start + i * step);
      case 'roman': return roman(start + i * step);
      case 'mgrs': return String(U.mod(Math.round(start + i * step), 100)).padStart(2, '0');
      case 'latlon': return deg(start + i * step, axis);
      case 'chess': return axis === 'x' ? letters(i).toLowerCase() : String(count - i); // ranks count up from the bottom
      default: return '';
    }
  }

  /* ---------- axis layout: major line positions and the cells between them ---------- */
  function axis(a0, len, square, n, cell) {
    const lines = [], cells = [];
    if (!square) {
      for (let i = 0; i <= n; i++) lines.push(a0 + (len * i) / n);
      for (let i = 0; i < n; i++) cells.push([lines[i], lines[i + 1]]);
      return { lines, cells, ends: true };
    }
    for (let x = 0; x <= len + 0.5; x += cell) lines.push(a0 + Math.min(x, len));
    for (let i = 0; i + 1 < lines.length; i++) cells.push([lines[i], lines[i + 1]]);
    const last = lines[lines.length - 1], rest = a0 + len - last;
    if (rest > cell * 0.5) cells.push([last, a0 + len]); // a partial cell more than half wide still gets a label
    return { lines, cells, ends: Math.abs(last - (a0 + len)) < 0.5 };
  }

  const edgeOn = (p) => p.edgeTop || p.edgeBottom || p.edgeLeft || p.edgeRight;
  const counted = (p) => p.sizing === 'counts';

  U.register({
    id: 'mapgrid',
    name: 'Map Grid',
    desc: 'Coordinate grid overlays for maps with lettered, numbered, military or lat/long axes, frames, compass and scale bar',
    uses: [
      'Transparent coordinate overlays laid over world maps, tactical and military maps, minimaps or strategy boards, so players can call out positions like "B4" or "34 67".',
      'Map furniture for fantasy atlases, sci-fi star charts, blueprints, game boards (chess, battleship) and graph paper backgrounds.',
    ],
    tags: ['UI', 'Military'],
    aspect: '1:1',
    normalMap: false,
    icon: U.icon('<rect x="4.5" y="4.5" width="15" height="15" rx="1"/><path d="M9.5 4.5v15M14.5 4.5v15M4.5 9.5h15M4.5 14.5h15" opacity=".6"/><path d="M2 7h1.5M2 12h1.5M7 2v1.5M12 2v1.5"/>'),
    params: [
      { type: 'section', label: 'Grid' },
      { key: 'sizing', label: 'Cells', type: 'select', default: 'counts', options: [['counts', 'Fixed columns × rows'], ['square', 'Square cells']], tip: 'Fixed counts stretch the cells to the image; square cells take their size from the short side' },
      { key: 'cols', label: 'Columns', type: 'int', min: 1, max: 40, default: 8, show: counted },
      { key: 'rows', label: 'Rows', type: 'int', min: 1, max: 40, default: 8, show: counted },
      { key: 'cells', label: 'Cells across the short side', type: 'int', min: 1, max: 40, default: 8, show: (p) => !counted(p) },
      { key: 'subdiv', label: 'Minor subdivisions', type: 'int', min: 1, max: 10, default: 1, tip: 'Minor lines per major cell (1 = none)' },
      { key: 'majorStyle', label: 'Major lines', type: 'select', default: 'solid', options: LINE },
      { key: 'majorW', label: 'Major width', type: 'range', min: 0.25, max: 8, step: 0.05, default: 1.5, show: (p) => p.majorStyle !== 'none', tip: 'px @ 512' },
      { key: 'majorColor', label: 'Major color', type: 'color', default: '#ffffff', show: (p) => p.majorStyle !== 'none' },
      { key: 'majorAlpha', label: 'Major opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, show: (p) => p.majorStyle !== 'none' },
      { key: 'minorStyle', label: 'Minor lines', type: 'select', default: 'solid', options: LINE, show: (p) => p.subdiv > 1 },
      { key: 'minorW', label: 'Minor width', type: 'range', min: 0.25, max: 6, step: 0.05, default: 0.75, show: (p) => p.subdiv > 1 && p.minorStyle !== 'none', tip: 'px @ 512' },
      { key: 'minorColor', label: 'Minor color', type: 'color', default: '#ffffff', show: (p) => p.subdiv > 1 && p.minorStyle !== 'none' },
      { key: 'minorAlpha', label: 'Minor opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: (p) => p.subdiv > 1 && p.minorStyle !== 'none' },
      { key: 'crossSize', label: '+ mark size', type: 'range', min: 0.05, max: 0.5, step: 0.01, default: 0.18, show: (p) => p.majorStyle === 'cross' || (p.subdiv > 1 && p.minorStyle === 'cross'), tip: 'Arm length, fraction of the cell' },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'opacity', label: 'Overall opacity', type: 'range', min: 0.05, max: 1, step: 0.01, default: 1 },

      { type: 'section', label: 'Axes' },
      { key: 'xStyle', label: 'Columns (X) naming', type: 'select', default: 'letters', options: NAMING },
      { key: 'xStart', label: 'X start', type: 'range', min: -180, max: 180, step: 0.25, default: 1, show: (p) => p.xStyle !== 'none' && p.xStyle !== 'chess', tip: 'Letters / roman: 1 = A / I. Numbers, military grid and degrees: the first value' },
      { key: 'xStep', label: 'X step', type: 'range', min: -10, max: 10, step: 0.05, default: 1, show: (p) => ['numbers', 'padded', 'roman', 'mgrs', 'latlon'].includes(p.xStyle) },
      { key: 'yStyle', label: 'Rows (Y) naming', type: 'select', default: 'numbers', options: NAMING },
      { key: 'yStart', label: 'Y start', type: 'range', min: -180, max: 180, step: 0.25, default: 1, show: (p) => p.yStyle !== 'none' && p.yStyle !== 'chess' },
      { key: 'yStep', label: 'Y step', type: 'range', min: -10, max: 10, step: 0.05, default: 1, show: (p) => ['numbers', 'padded', 'roman', 'mgrs', 'latlon'].includes(p.yStyle) },
      { key: 'yFromBottom', label: 'Count rows from the bottom', type: 'bool', default: false, tip: 'Northings and latitudes usually grow upward' },
      { key: 'labelAt', label: 'Labels at', type: 'select', default: 'cells', options: [['cells', 'Cell centers'], ['lines', 'Grid lines']], tip: 'Letter / number grids label the cells; military and lat / long grids label the lines' },

      { type: 'section', label: 'Labels' },
      { key: 'labelCorner', label: 'Label corner', type: 'select', default: 'tl', options: [['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right'], ['center', 'Centered on the edge']], show: (p) => edgeOn(p) && !(p.band > 0) && p.labelAt !== 'lines', tip: 'For labels inside the map (no border band): they sit in this corner of their cell; where a column and a row label meet in a corner cell they collapse into one (e.g. A1)' },
      { key: 'edgeTop', label: 'Top edge', type: 'bool', default: true },
      { key: 'edgeBottom', label: 'Bottom edge', type: 'bool', default: false },
      { key: 'edgeLeft', label: 'Left edge', type: 'bool', default: true },
      { key: 'edgeRight', label: 'Right edge', type: 'bool', default: false },
      { key: 'font', label: 'Font', type: 'select', default: 'sans', options: [['sans', 'Sans'], ['mono', 'Monospace'], ['serif', 'Serif'], ['stencil', 'Condensed / stencil']] },
      { key: 'labelSize', label: 'Label size', type: 'range', min: 0.01, max: 0.09, step: 0.001, default: 0.04, tip: 'Fraction of the short side; shrinks automatically when labels would collide' },
      { key: 'labelColor', label: 'Label color', type: 'color', default: '#ffffff' },
      { key: 'halo', label: 'Halo', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Outline around the text for readability on busy maps' },
      { key: 'haloColor', label: 'Halo color', type: 'color', default: '#101418', show: (p) => p.halo > 0 },
      { key: 'cellIds', label: 'Cell IDs inside cells', type: 'bool', default: false, tip: 'Writes the cell name (e.g. B4) into every cell' },
      { key: 'cellIdPos', label: 'Cell ID position', type: 'select', default: 'tl', options: [['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right'], ['center', 'Center']], show: (p) => p.cellIds },
      { key: 'cellIdSize', label: 'Cell ID size', type: 'range', min: 0.008, max: 0.08, step: 0.001, default: 0.022, show: (p) => p.cellIds },
      { key: 'cellIdAlpha', label: 'Cell ID opacity', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.6, show: (p) => p.cellIds },

      { type: 'section', label: 'Frame' },
      { key: 'band', label: 'Border band', type: 'range', min: 0, max: 0.14, step: 0.002, default: 0, tip: 'A margin around the map that holds the edge labels (fraction of the short side)' },
      { key: 'bandColor', label: 'Band color', type: 'color', default: '#101418', show: (p) => p.band > 0 },
      { key: 'bandAlpha', label: 'Band opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, show: (p) => p.band > 0 },
      { key: 'neatline', label: 'Neatline scale ticks', type: 'bool', default: false, show: (p) => p.band > 0, tip: 'Alternating dark / light segments along the inner edge of the band, one per minor cell' },
      { key: 'neatColor', label: 'Neatline light color', type: 'color', default: '#ffffff', show: (p) => p.band > 0 && p.neatline },
      { key: 'frameW', label: 'Frame line', type: 'range', min: 0, max: 8, step: 0.05, default: 0, tip: 'px @ 512; around the map (and the band)' },
      { key: 'frameColor', label: 'Frame color', type: 'color', default: '#ffffff', show: (p) => p.frameW > 0 || p.ticks > 0 || (p.band > 0 && p.neatline) },
      { key: 'ticks', label: 'Edge ticks', type: 'range', min: 0, max: 0.05, step: 0.001, default: 0, tip: 'Short ticks on the map edge at every minor line (length, fraction of the short side)' },

      { type: 'section', label: 'Extras', active: (p) => p.compass !== 'none' || p.scaleBar !== 'none' || p.origin !== 'none' || !!p.zone || p.bg !== 'none' },
      { key: 'compass', label: 'North arrow', type: 'select', default: 'none', options: CORNERS },
      { key: 'compassStyle', label: 'Compass style', type: 'select', default: 'arrow', options: [['arrow', 'North arrow'], ['rose', 'Compass rose']], show: (p) => p.compass !== 'none' },
      { key: 'compassSize', label: 'Compass size', type: 'range', min: 0.04, max: 0.3, step: 0.005, default: 0.1, show: (p) => p.compass !== 'none' },
      { key: 'scaleBar', label: 'Scale bar', type: 'select', default: 'none', options: CORNERS },
      { key: 'scaleCells', label: 'Scale bar length (cells)', type: 'int', min: 1, max: 6, default: 2, show: (p) => p.scaleBar !== 'none' },
      { key: 'scaleValue', label: 'Distance per cell', type: 'range', min: 0.1, max: 1000, step: 0.1, default: 1, show: (p) => p.scaleBar !== 'none' },
      { key: 'scaleUnits', label: 'Units', type: 'text', default: 'km', max: 8, placeholder: 'km', show: (p) => p.scaleBar !== 'none' },
      { key: 'origin', label: 'Origin axes', type: 'select', default: 'none', options: [['none', 'None'], ['bl', 'Bottom left'], ['tl', 'Top left'], ['center', 'Center (cartesian)']], tip: 'Highlights the two axes through the origin' },
      { key: 'originColor', label: 'Origin color', type: 'color', default: '#ff4a4a', show: (p) => p.origin !== 'none' },
      { key: 'zone', label: 'Grid zone label', type: 'text', default: '', max: 16, placeholder: 'e.g. 38S MB', tip: 'Grid-zone designator or map sheet name, written into the top-left corner' },
      { key: 'bg', label: 'Background', type: 'select', default: 'none', options: [['none', 'Transparent (overlay)'], ['color', 'Solid color'], ['checker', 'Checkerboard (board games)']] },
      { key: 'bgColor', label: 'Background color', type: 'color', default: '#1d4f91', show: (p) => p.bg !== 'none' },
      { key: 'bgColor2', label: 'Second color', type: 'color', default: '#b48862', show: (p) => p.bg === 'checker' },
    ],
    presets: [
      { name: 'Simple overlay grid', group: 'Game / UI', values: {} },
      { name: 'Minimap HUD', group: 'Game / UI', values: { cols: 6, rows: 6, majorW: 1, majorAlpha: 0.25, labelSize: 0.03, halo: 0.35 } },
      { name: 'Strategy map (all edges)', group: 'Game / UI', values: { cols: 10, rows: 10, edgeBottom: true, edgeRight: true, band: 0.055, bandColor: '#000000', bandAlpha: 0.55, majorAlpha: 0.45, halo: 0, labelSize: 0.03 } },
      { name: 'Battleship board', group: 'Game / UI', values: { sizing: 'square', cells: 10, majorColor: '#8fc3f0', majorAlpha: 0.75, majorW: 1.4, band: 0.085, bandColor: '#0a2340', bandAlpha: 1, bg: 'color', bgColor: '#123a66', labelSize: 0.045, halo: 0, frameW: 2, frameColor: '#8fc3f0' } },
      { name: 'Chess board coordinates', group: 'Game / UI', values: { xStyle: 'chess', yStyle: 'chess', majorStyle: 'none', edgeTop: false, edgeBottom: true, band: 0.06, bandColor: '#3a2716', bandAlpha: 1, labelColor: '#f2e6cc', halo: 0, font: 'serif', bg: 'checker', bgColor: '#eed7b4', bgColor2: '#b48862', frameW: 1.5, frameColor: '#1e130a' } },
      { name: 'Military grid (MGRS)', group: 'Military', values: { xStyle: 'mgrs', xStart: 34, yStyle: 'mgrs', yStart: 61, yFromBottom: true, labelAt: 'lines', cols: 8, rows: 8, majorColor: '#151515', majorAlpha: 0.75, majorW: 1.1, edgeBottom: true, edgeRight: true, font: 'stencil', labelColor: '#151515', halo: 0, band: 0.07, bandColor: '#ece6cf', bandAlpha: 1, frameW: 2, frameColor: '#151515', ticks: 0.008, subdiv: 2, minorStyle: 'none', zone: '38S MB' } },
      { name: 'Tactical + marks', group: 'Military', values: { xStyle: 'mgrs', xStart: 12, yStyle: 'mgrs', yStart: 40, yFromBottom: true, labelAt: 'lines', majorStyle: 'cross', crossSize: 0.16, majorW: 1.6, majorColor: '#d6e08c', majorAlpha: 0.9, font: 'mono', labelColor: '#d6e08c', haloColor: '#151a08', halo: 0.6, labelSize: 0.032, zone: '33U VP' } },
      { name: 'Artillery grid (olive)', group: 'Military', values: { sizing: 'square', cells: 10, subdiv: 2, minorStyle: 'dotted', minorColor: '#2c3416', minorAlpha: 0.7, majorColor: '#2c3416', majorAlpha: 0.85, majorW: 1.2, xStyle: 'padded', xStart: 20, yStyle: 'padded', yStart: 50, yFromBottom: true, labelAt: 'lines', font: 'stencil', labelColor: '#e8e2c0', halo: 0, band: 0.065, bandColor: '#4f5728', bandAlpha: 1, neatline: true, neatColor: '#e8e2c0', frameColor: '#1d220d', frameW: 1.5, edgeBottom: true, edgeRight: true } },
      { name: 'Tactical HUD overlay', group: 'Military', values: { cols: 6, rows: 6, majorStyle: 'cross', crossSize: 0.12, majorColor: '#7dff7a', majorAlpha: 0.85, glow: 0.5, edgeTop: false, edgeLeft: false, cellIds: true, cellIdPos: 'tl', cellIdAlpha: 0.7, cellIdSize: 0.03, font: 'mono', labelColor: '#7dff7a', haloColor: '#001400', halo: 0.4, labelSize: 0.03, frameW: 1.2, frameColor: '#7dff7a' } },
      { name: 'Topographic lat / long', group: 'Topographic', values: { xStyle: 'latlon', xStart: 12, xStep: 0.25, yStyle: 'latlon', yStart: 47, yStep: 0.25, yFromBottom: true, labelAt: 'lines', cols: 4, rows: 4, subdiv: 5, minorStyle: 'none', majorColor: '#2a6fb0', majorAlpha: 0.7, majorW: 0.9, font: 'serif', labelColor: '#1d2a38', halo: 0, labelSize: 0.028, edgeBottom: true, edgeRight: true, band: 0.075, bandColor: '#ffffff', bandAlpha: 1, neatline: true, neatColor: '#ffffff', frameW: 1.4, frameColor: '#1d2a38', compass: 'tr', compassSize: 0.09, scaleBar: 'bl', scaleCells: 1, scaleValue: 18.6, scaleUnits: 'km' } },
      { name: 'Survey grid (brown)', group: 'Topographic', values: { sizing: 'square', cells: 6, subdiv: 5, minorColor: '#8a5a2b', minorAlpha: 0.3, minorW: 0.5, majorColor: '#8a5a2b', majorAlpha: 0.8, majorW: 1.2, xStyle: 'padded', xStart: 0, yStyle: 'padded', yStart: 0, yFromBottom: true, labelAt: 'lines', labelColor: '#5a3814', haloColor: '#f3ead6', halo: 0.6, labelSize: 0.03, ticks: 0.008, frameW: 1, frameColor: '#5a3814' } },
      { name: 'Fantasy atlas', group: 'Fantasy', values: { xStyle: 'roman', yStyle: 'letters', cols: 6, rows: 6, majorStyle: 'dashed', majorColor: '#5a3b1c', majorAlpha: 0.55, majorW: 1.2, font: 'serif', labelColor: '#3a240e', halo: 0, labelSize: 0.034, edgeBottom: true, edgeRight: true, band: 0.075, bandColor: '#e8d9b5', bandAlpha: 1, neatline: true, neatColor: '#e8d9b5', frameW: 2.2, frameColor: '#3a240e', compass: 'br', compassStyle: 'rose', compassSize: 0.16 } },
      { name: 'Treasure map grid', group: 'Fantasy', values: { cols: 5, rows: 5, majorStyle: 'dotted', majorColor: '#4a2e12', majorAlpha: 0.7, majorW: 2, font: 'serif', labelColor: '#4a2e12', haloColor: '#efe0bc', halo: 0.7, labelSize: 0.04, compass: 'br', compassStyle: 'rose', compassSize: 0.14 } },
      { name: 'Sci-fi star map', group: 'Sci-fi', values: { sizing: 'square', cells: 6, subdiv: 4, minorColor: '#3ef2ff', minorAlpha: 0.12, minorW: 0.5, majorColor: '#3ef2ff', majorAlpha: 0.45, majorW: 0.9, glow: 0.6, xStyle: 'padded', xStart: -3, yStyle: 'padded', yStart: -3, yFromBottom: true, labelAt: 'lines', origin: 'center', originColor: '#3ef2ff', font: 'mono', labelColor: '#9ef9ff', haloColor: '#001018', halo: 0.5, labelSize: 0.026, edgeLeft: true, edgeTop: false, edgeBottom: true } },
      { name: 'Sector map', group: 'Sci-fi', values: { cols: 5, rows: 5, majorColor: '#ffb347', majorAlpha: 0.5, majorW: 1, glow: 0.35, cellIds: true, cellIdPos: 'center', cellIdSize: 0.05, cellIdAlpha: 0.18, font: 'mono', labelColor: '#ffb347', halo: 0, band: 0.05, bandColor: '#0b0d10', bandAlpha: 0.9, frameW: 1.2, frameColor: '#ffb347', labelSize: 0.028, zone: 'SECTOR 7' } },
      { name: 'Blueprint', group: 'Technical', values: { sizing: 'square', cells: 8, subdiv: 4, minorColor: '#ffffff', minorAlpha: 0.14, minorW: 0.5, majorColor: '#ffffff', majorAlpha: 0.45, majorW: 1, bg: 'color', bgColor: '#1d4f91', xStyle: 'numbers', xStart: 0, yStyle: 'numbers', yStart: 0, yFromBottom: true, labelAt: 'lines', font: 'mono', labelColor: '#e6f0ff', halo: 0, labelSize: 0.024, origin: 'bl', originColor: '#ffffff', frameW: 2, frameColor: '#ffffff', scaleBar: 'br', scaleCells: 2, scaleValue: 50, scaleUnits: 'cm' } },
      { name: 'Cartesian graph', group: 'Technical', values: { sizing: 'square', cells: 8, subdiv: 5, minorColor: '#333333', minorAlpha: 0.15, minorW: 0.5, majorColor: '#333333', majorAlpha: 0.4, majorW: 0.9, xStyle: 'numbers', xStart: -4, yStyle: 'numbers', yStart: -4, yFromBottom: true, labelAt: 'lines', origin: 'center', originColor: '#222222', labelColor: '#222222', halo: 0.5, haloColor: '#ffffff', labelSize: 0.026, edgeTop: false, edgeBottom: true } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), k = S / 512;
      const bw = p.band > 0 ? Math.max(2, p.band * S) : 0;
      const mx0 = bw, my0 = bw, mx1 = W - bw, my1 = H - bw, mw = mx1 - mx0, mh = my1 - my0;
      const square = !counted(p), cell = square ? Math.min(mw, mh) / Math.max(1, p.cells) : 0;
      const X = axis(mx0, mw, square, Math.max(1, p.cols | 0), cell), Y = axis(my0, mh, square, Math.max(1, p.rows | 0), cell);
      const nx = X.cells.length, ny = Y.cells.length, sub = Math.max(1, p.subdiv | 0);
      const rgba = (hex, a) => { const c = U.hex(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };
      ctx.save();
      ctx.globalAlpha = p.opacity;

      /* ---------- background ---------- */
      if (p.bg === 'color') { ctx.fillStyle = p.bgColor; ctx.fillRect(mx0, my0, mw, mh); }
      else if (p.bg === 'checker') {
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const [x0, x1] = X.cells[i], [y0, y1] = Y.cells[j];
          ctx.fillStyle = (i + j) % 2 ? p.bgColor2 : p.bgColor; ctx.fillRect(x0, y0, x1 - x0 + 0.5, y1 - y0 + 0.5);
        }
      }

      /* ---------- lines ---------- */
      const minorPos = (A) => {
        const out = [];
        if (sub < 2) return out;
        for (const [a, b] of A.cells) for (let s = 1; s < sub; s++) { const v = a + ((b - a) * s) / sub; if (v < b - 0.5) out.push(v); }
        return out;
      };
      const crisp = (v, w) => (Math.round(w) % 2 ? Math.floor(v) + 0.5 : Math.round(v));
      function drawLines(xs, ys, style, w, color, alpha, armCell) {
        if (style === 'none' || alpha <= 0) return;
        ctx.save();
        ctx.strokeStyle = rgba(color, alpha); ctx.lineWidth = w; ctx.lineCap = style === 'dotted' ? 'round' : 'butt';
        if (p.glow > 0) { ctx.shadowColor = rgba(color, Math.min(1, alpha * 1.4)); ctx.shadowBlur = p.glow * 10 * k; }
        if (style === 'dashed') ctx.setLineDash([w * 4 + 3 * k, w * 2.5 + 3 * k]);
        if (style === 'dotted') ctx.setLineDash([0.01, w * 2.6 + 2 * k]);
        ctx.beginPath();
        if (style === 'cross') {
          const arm = armCell * p.crossSize;
          for (const x of xs) for (const y of ys) { ctx.moveTo(x - arm, y); ctx.lineTo(x + arm, y); ctx.moveTo(x, y - arm); ctx.lineTo(x, y + arm); }
        } else {
          for (const x of xs) { const cx = crisp(x, w); ctx.moveTo(cx, my0); ctx.lineTo(cx, my1); }
          for (const y of ys) { const cy = crisp(y, w); ctx.moveTo(mx0, cy); ctx.lineTo(mx1, cy); }
        }
        ctx.stroke();
        ctx.restore();
      }
      // skip lines that lie on the map border when a frame / band already draws it
      const inner = (A, lo, hi) => A.lines.filter((v) => !(bw > 0 || p.frameW > 0) || (v > lo + 0.75 && v < hi - 0.75));
      const cellW = Math.min(...X.cells.map(([a, b]) => b - a)), cellH = Math.min(...Y.cells.map(([a, b]) => b - a));
      if (sub > 1) {
        const mxs = minorPos(X), mys = minorPos(Y);
        if (p.minorStyle === 'cross') drawLines(mxs.concat(X.lines), mys.concat(Y.lines), 'cross', Math.max(0.5, p.minorW * k), p.minorColor, p.minorAlpha, Math.min(cellW, cellH) / sub);
        else drawLines(mxs, mys, p.minorStyle, Math.max(0.5, p.minorW * k), p.minorColor, p.minorAlpha);
      }
      if (p.majorStyle === 'cross') drawLines(X.lines, Y.lines, 'cross', Math.max(0.5, p.majorW * k), p.majorColor, p.majorAlpha, Math.min(cellW, cellH));
      else drawLines(inner(X, mx0, mx1), inner(Y, my0, my1), p.majorStyle, Math.max(0.5, p.majorW * k), p.majorColor, p.majorAlpha);

      /* ---------- origin axes ---------- */
      if (p.origin !== 'none') {
        const near = (A, v) => A.lines.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), A.lines[0]);
        const ox = p.origin === 'center' ? near(X, (mx0 + mx1) / 2) : X.lines[0];
        const oy = p.origin === 'center' ? near(Y, (my0 + my1) / 2) : p.origin === 'bl' ? Y.lines[Y.lines.length - 1] : Y.lines[0];
        const w = Math.max(1, (p.majorW * 1.8 + 0.6) * k), ah = 6 * k + w * 2;
        ctx.save();
        ctx.strokeStyle = p.originColor; ctx.fillStyle = p.originColor; ctx.lineWidth = w; ctx.lineCap = 'round';
        if (p.glow > 0) { ctx.shadowColor = p.originColor; ctx.shadowBlur = p.glow * 12 * k; }
        ctx.beginPath(); ctx.moveTo(mx0, oy); ctx.lineTo(mx1 - (p.origin === 'center' ? ah : 0), oy); ctx.moveTo(ox, my1); ctx.lineTo(ox, my0 + (p.origin === 'center' ? ah : 0)); ctx.stroke();
        if (p.origin === 'center') {
          // arrowheads on the positive ends (right, up)
          ctx.beginPath(); ctx.moveTo(mx1, oy); ctx.lineTo(mx1 - ah * 1.6, oy - ah * 0.8); ctx.lineTo(mx1 - ah * 1.6, oy + ah * 0.8); ctx.closePath(); ctx.fill();
          ctx.beginPath(); ctx.moveTo(ox, my0); ctx.lineTo(ox - ah * 0.8, my0 + ah * 1.6); ctx.lineTo(ox + ah * 0.8, my0 + ah * 1.6); ctx.closePath(); ctx.fill();
        }
        ctx.beginPath(); ctx.arc(ox, oy, w * 1.8, 0, TAU); ctx.fill();
        ctx.restore();
      }

      /* ---------- border band, neatline, ticks, frame ---------- */
      if (bw > 0 && p.bandAlpha > 0) {
        ctx.fillStyle = rgba(p.bandColor, p.bandAlpha);
        ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(mx0, my0, mw, mh); ctx.fill('evenodd');
      }
      const fw = p.frameW * k;
      if (bw > 0 && p.neatline) {
        // alternating segments along the inner edge of the band, one per minor cell
        const nw = Math.max(2, bw * 0.16), segs = (A) => { const out = []; for (const [a, b] of A.cells) for (let s = 0; s < sub; s++) out.push([a + ((b - a) * s) / sub, a + ((b - a) * (s + 1)) / sub]); return out; };
        const sx = segs(X), sy = segs(Y);
        sx.forEach(([a, b], i) => { ctx.fillStyle = i % 2 ? p.neatColor : p.frameColor; ctx.fillRect(a, my0 - nw, b - a, nw); ctx.fillStyle = i % 2 ? p.frameColor : p.neatColor; ctx.fillRect(a, my1, b - a, nw); });
        sy.forEach(([a, b], i) => { ctx.fillStyle = i % 2 ? p.neatColor : p.frameColor; ctx.fillRect(mx0 - nw, a, nw, b - a); ctx.fillStyle = i % 2 ? p.frameColor : p.neatColor; ctx.fillRect(mx1, a, nw, b - a); });
        ctx.strokeStyle = p.frameColor; ctx.lineWidth = Math.max(1, fw * 0.6 || k);
        ctx.strokeRect(mx0 - nw, my0 - nw, mw + 2 * nw, mh + 2 * nw);
      }
      if (p.ticks > 0) {
        const tl = p.ticks * S, xs = sub > 1 ? minorPos(X).concat(X.lines) : X.lines, ys = sub > 1 ? minorPos(Y).concat(Y.lines) : Y.lines;
        ctx.save(); ctx.strokeStyle = p.frameColor; ctx.lineWidth = Math.max(1, k * 1.1); ctx.beginPath();
        for (const x of xs) { const major = X.lines.includes(x), l = major ? tl * 1.7 : tl; ctx.moveTo(x, my0); ctx.lineTo(x, my0 + l); ctx.moveTo(x, my1); ctx.lineTo(x, my1 - l); }
        for (const y of ys) { const major = Y.lines.includes(y), l = major ? tl * 1.7 : tl; ctx.moveTo(mx0, y); ctx.lineTo(mx0 + l, y); ctx.moveTo(mx1, y); ctx.lineTo(mx1 - l, y); }
        ctx.stroke(); ctx.restore();
      }
      if (fw > 0) {
        ctx.save(); ctx.strokeStyle = p.frameColor; ctx.lineWidth = fw;
        if (p.glow > 0) { ctx.shadowColor = p.frameColor; ctx.shadowBlur = p.glow * 10 * k; }
        ctx.strokeRect(mx0 + (bw > 0 ? 0 : fw / 2), my0 + (bw > 0 ? 0 : fw / 2), mw - (bw > 0 ? 0 : fw), mh - (bw > 0 ? 0 : fw));
        if (bw > 0) ctx.strokeRect(fw / 2, fw / 2, W - fw, H - fw);
        ctx.restore();
      }

      /* ---------- labels ---------- */
      const lines = p.labelAt === 'lines';
      const nCount = (A) => (lines ? A.lines.length : A.cells.length);
      const yIdx = (j, n) => (p.yFromBottom || p.yStyle === 'chess' ? n - 1 - j : j);
      const xName = (i) => name(p.xStyle, p.xStart, p.xStep, i, 'x', nCount(X));
      const yName = (j) => { const n = nCount(Y); return p.yStyle === 'chess' ? name('chess', 0, 1, j, 'y', n) : name(p.yStyle, p.yStart, p.yStep, yIdx(j, n), 'y', n); };
      const font = FONTS[p.font] || FONTS.sans;
      const drawText = (txt, x, y, align, base, size, alpha = 1) => {
        if (!txt) return;
        ctx.font = font(size); ctx.textAlign = align; ctx.textBaseline = base;
        if (p.halo > 0) { ctx.lineJoin = 'round'; ctx.strokeStyle = rgba(p.haloColor, alpha); ctx.lineWidth = Math.max(1, size * 0.28 * p.halo * 2); ctx.strokeText(txt, x, y); }
        ctx.fillStyle = rgba(p.labelColor, alpha); ctx.fillText(txt, x, y);
      };
      if (edgeOn(p)) {
        // which positions get a label on each axis (lines: skip the ones on the map border)
        const xs = lines ? X.lines.map((v, i) => [v, i]).filter(([v]) => v > mx0 + 1 && v < mx1 - 1) : X.cells.map(([a, b], i) => [(a + b) / 2, i]);
        const ys = lines ? Y.lines.map((v, j) => [v, j]).filter(([v]) => v > my0 + 1 && v < my1 - 1) : Y.cells.map(([a, b], j) => [(a + b) / 2, j]);
        // one font size for all edges: shrink until the labels fit their spacing (and the band)
        let fs = p.labelSize * S;
        ctx.font = font(100);
        const wOf = (t) => ctx.measureText(t).width / 100;
        const xW = Math.max(0.01, ...xs.map(([, i]) => wOf(xName(i)))), yW = Math.max(0.01, ...ys.map(([, j]) => wOf(yName(j))));
        const gapX = lines ? Math.min(...X.lines.slice(1).map((v, i) => v - X.lines[i])) : cellW, gapY = lines ? Math.min(...Y.lines.slice(1).map((v, i) => v - Y.lines[i])) : cellH;
        if (p.edgeTop || p.edgeBottom) fs = Math.min(fs, (gapX * (lines && !bw ? 0.8 : 0.88)) / xW);
        if (p.edgeLeft || p.edgeRight) fs = Math.min(fs, gapY * (lines && !bw ? 0.55 : 0.8));
        // side labels that are too long for the band run vertically along the edge (as on topographic maps)
        let rotV = false;
        if (bw > 0) {
          fs = Math.min(fs, bw * (p.neatline ? 0.52 : 0.62));
          const room = bw * (p.neatline ? 0.7 : 0.84);
          if ((p.edgeLeft || p.edgeRight) && yW * fs > room) {
            if (yW * fs * 0.7 <= room) fs = room / yW; // a little smaller still fits horizontally
            else { rotV = true; fs = Math.min(fs, (gapY * 0.85) / yW); }
          }
        }
        fs = Math.max(4, fs);
        const pad = fs * 0.4, inset = bw > 0 && p.neatline ? Math.max(2, bw * 0.16) : 0;
        ctx.save();
        if (p.glow > 0) { ctx.shadowColor = p.labelColor; ctx.shadowBlur = p.glow * 6 * k; }
        const band = (outer, innerEdge) => (outer + innerEdge) / 2;
        // labels inside the map, in a cell corner: column and row labels that meet in a corner cell collapse into one
        const corner = !bw && !lines && p.labelCorner && p.labelCorner !== 'center' ? p.labelCorner : null;
        if (corner) {
          const right = corner[1] === 'r', bottom = corner[0] === 'b', spots = new Map();
          const put = (ci, cj, part, txt) => { const key = ci + ',' + cj, o = spots.get(key) || { ci, cj }; o[part] = txt; spots.set(key, o); };
          const lastX = X.cells.length - 1, lastY = Y.cells.length - 1;
          for (const [, i] of xs) { const t = xName(i); if (p.edgeTop) put(i, 0, 'x', t); if (p.edgeBottom) put(i, lastY, 'x', t); }
          for (const [, j] of ys) { const t = yName(j); if (p.edgeLeft) put(0, j, 'y', t); if (p.edgeRight) put(lastX, j, 'y', t); }
          // a combined label like "A1" may be wider than the single ones: shrink if needed
          let fc = fs;
          for (const o of spots.values()) if (o.x && o.y) fc = Math.min(fc, (cellW * 0.9) / Math.max(0.01, wOf(o.x + o.y)));
          fc = Math.max(4, fc);
          for (const o of spots.values()) {
            const [a, b] = X.cells[o.ci], [c, d] = Y.cells[o.cj], pc = fc * 0.4;
            drawText((o.x || '') + (o.y || ''), right ? b - pc : a + pc, bottom ? d - pc : c + pc * 0.8, right ? 'right' : 'left', bottom ? 'bottom' : 'top', o.x && o.y ? fc : fs);
          }
        }
        for (const [x, i] of corner ? [] : xs) {
          const t = xName(i);
          if (bw > 0) {
            if (p.edgeTop) drawText(t, x, band(0, my0 - inset), 'center', 'middle', fs);
            if (p.edgeBottom) drawText(t, x, band(H, my1 + inset), 'center', 'middle', fs);
          } else if (lines) {
            if (p.edgeTop) drawText(t, x + pad * 0.6, my0 + pad, 'left', 'top', fs);
            if (p.edgeBottom) drawText(t, x + pad * 0.6, my1 - pad, 'left', 'bottom', fs);
          } else {
            if (p.edgeTop) drawText(t, x, my0 + pad, 'center', 'top', fs);
            if (p.edgeBottom) drawText(t, x, my1 - pad, 'center', 'bottom', fs);
          }
        }
        for (const [y, j] of corner ? [] : ys) {
          const t = yName(j);
          if (bw > 0) {
            const rot = (cx, a) => { ctx.save(); ctx.translate(cx, y); ctx.rotate(a); drawText(t, 0, 0, 'center', 'middle', fs); ctx.restore(); };
            if (p.edgeLeft) rotV ? rot(band(0, mx0 - inset), -Math.PI / 2) : drawText(t, band(0, mx0 - inset), y, 'center', 'middle', fs);
            if (p.edgeRight) rotV ? rot(band(W, mx1 + inset), Math.PI / 2) : drawText(t, band(W, mx1 + inset), y, 'center', 'middle', fs);
          } else if (lines) {
            if (p.edgeLeft) drawText(t, mx0 + pad, y - pad * 0.5, 'left', 'bottom', fs);
            if (p.edgeRight) drawText(t, mx1 - pad, y - pad * 0.5, 'right', 'bottom', fs);
          } else {
            if (p.edgeLeft) drawText(t, mx0 + pad, y, 'left', 'middle', fs);
            if (p.edgeRight) drawText(t, mx1 - pad, y, 'right', 'middle', fs);
          }
        }
        ctx.restore();
      }

      /* ---------- cell IDs ---------- */
      if (p.cellIds) {
        const ids = [];
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          // IDs always name the cell (column + row), whatever the edge labels are placed on
          const xn = name(p.xStyle, p.xStart, p.xStep, i, 'x', nx), yn = p.yStyle === 'chess' ? String(ny - j) : name(p.yStyle, p.yStart, p.yStep, p.yFromBottom ? ny - 1 - j : j, 'y', ny);
          ids.push([i, j, xn + (p.xStyle === 'mgrs' || p.xStyle === 'latlon' ? ' ' : '') + yn]);
        }
        ctx.font = font(100);
        const maxW = Math.max(0.01, ...ids.map(([, , t]) => ctx.measureText(t).width / 100));
        const fs = Math.max(4, Math.min(p.cellIdSize * S, (cellW * (p.cellIdPos === 'center' ? 0.85 : 0.6)) / maxW, cellH * 0.4));
        const pad = fs * 0.45;
        ctx.save();
        for (const [i, j, t] of ids) {
          const [x0, x1] = X.cells[i], [y0, y1] = Y.cells[j], pos = p.cellIdPos;
          const x = pos === 'center' ? (x0 + x1) / 2 : pos[1] === 'l' ? x0 + pad : x1 - pad;
          const y = pos === 'center' ? (y0 + y1) / 2 : pos[0] === 't' ? y0 + pad : y1 - pad;
          drawText(t, x, y, pos === 'center' ? 'center' : pos[1] === 'l' ? 'left' : 'right', pos === 'center' ? 'middle' : pos[0] === 't' ? 'top' : 'bottom', fs, p.cellIdAlpha);
        }
        ctx.restore();
      }

      /* ---------- corner items: zone label, compass, scale bar ---------- */
      const margin = S * 0.035;
      const cornerAt = (c, w, h) => {
        const x = c[1] === 'l' ? mx0 + margin : mx1 - margin - w, y = c[0] === 't' ? my0 + margin : my1 - margin - h;
        return [x, y];
      };
      if (p.zone) {
        if (bw > 0) {
          // in the band's top-left corner square
          ctx.font = font(100);
          const fs = Math.max(4, Math.min(bw * 0.42, (bw * 0.9) / (ctx.measureText(p.zone).width / 100)));
          drawText(p.zone, bw / 2, bw / 2, 'center', 'middle', fs);
        } else {
          const fs = Math.max(5, p.labelSize * S * 0.9);
          drawText(p.zone, mx0 + margin, my1 - margin, 'left', 'bottom', fs);
        }
      }
      if (p.compass !== 'none') {
        const r = p.compassSize * S * 0.5, [x, y] = cornerAt(p.compass, 2 * r, 2 * r * 1.25), cx = x + r, cy = y + r * 1.4;
        const dark = p.labelColor, light = p.halo > 0 ? p.haloColor : p.bandColor;
        ctx.save(); ctx.lineJoin = 'round';
        if (p.compassStyle === 'rose') {
          ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, r * 0.04);
          ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, TAU); ctx.stroke();
          for (let n = 0; n < 8; n++) {
            const a = -Math.PI / 2 + (n * TAU) / 8, L = n % 2 ? r * 0.55 : r * 0.92, wv = r * (n % 2 ? 0.09 : 0.15);
            const tip = [cx + Math.cos(a) * L, cy + Math.sin(a) * L], l1 = [cx + Math.cos(a - Math.PI / 2) * wv, cy + Math.sin(a - Math.PI / 2) * wv], r1 = [cx + Math.cos(a + Math.PI / 2) * wv, cy + Math.sin(a + Math.PI / 2) * wv];
            ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...l1); ctx.lineTo(...tip); ctx.closePath(); ctx.fill();
            ctx.fillStyle = light; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(...r1); ctx.lineTo(...tip); ctx.closePath(); ctx.fill(); ctx.stroke();
          }
          drawText('N', cx, cy - r * 0.95, 'center', 'bottom', r * 0.42);
        } else {
          // north arrow: a split arrowhead with an N above it
          ctx.lineWidth = Math.max(1, r * 0.05); ctx.strokeStyle = dark;
          const top = cy - r * 0.55, bot = cy + r * 0.75, wv = r * 0.42;
          ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx - wv, bot); ctx.lineTo(cx, bot - r * 0.35); ctx.closePath(); ctx.fill();
          ctx.fillStyle = light; ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx + wv, bot); ctx.lineTo(cx, bot - r * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(cx, top); ctx.lineTo(cx - wv, bot); ctx.lineTo(cx, bot - r * 0.35); ctx.closePath(); ctx.stroke();
          drawText('N', cx, top - r * 0.12, 'center', 'bottom', r * 0.55);
        }
        ctx.restore();
      }
      if (p.scaleBar !== 'none') {
        const len = Math.min(mw * 0.6, X.cells.length ? (X.cells[0][1] - X.cells[0][0]) * p.scaleCells : mw * 0.3), h = Math.max(3, S * 0.014), fs = Math.max(5, S * 0.022);
        const [x, y0] = cornerAt(p.scaleBar, len, h + fs * 1.4), y = y0 + fs * 1.4, segs = 4;
        const c1 = p.labelColor, c2 = p.halo > 0 ? p.haloColor : bw > 0 ? p.bandColor : '#ffffff';
        for (let s = 0; s < segs; s++) { ctx.fillStyle = s % 2 ? c2 : c1; ctx.fillRect(x + (len * s) / segs, y, len / segs, h); }
        ctx.strokeStyle = c1; ctx.lineWidth = Math.max(1, k); ctx.strokeRect(x, y, len, h);
        const total = p.scaleValue * p.scaleCells;
        drawText('0', x, y - fs * 0.25, 'left', 'bottom', fs);
        // the middle value only when it doesn't run into the end label
        const mid = num(+(total / 2).toFixed(2)), endT = `${num(+total.toFixed(2))} ${p.scaleUnits || ''}`.trim();
        ctx.font = font(fs);
        if (len / 2 - ctx.measureText(mid).width / 2 > ctx.measureText(endT).width + fs * 0.4) drawText(mid, x + len / 2, y - fs * 0.25, 'center', 'bottom', fs);
        drawText(`${num(+total.toFixed(2))} ${p.scaleUnits || ''}`.trim(), x + len, y - fs * 0.25, 'right', 'bottom', fs);
      }
      ctx.restore();
    },
  });
})();
