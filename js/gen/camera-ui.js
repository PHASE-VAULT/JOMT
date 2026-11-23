/* Camera overlay: transparent screen overlays for camcorder, DSLR, bodycam, CCTV, drone, night-vision,
   VHS and helmet-cam views. Readouts (REC, timecode, date, label, battery, signal, exposure, mode boxes,
   zoom bar, exposure meter, heading tape) sit in six screen slots (top / bottom × left / center / right)
   and stack in a fixed order; small items share a row (signal + battery, REC + timecode). Frame marks
   (corner brackets, safe area, rule of thirds, cinema frame lines with matte), center marks, AF points,
   focus box and horizon line. Optional screen effects: tint, vignette, scanlines, VHS noise and a
   chromatic edge split of the overlay. Two export layers (REC dot on / off) give a blinking REC.
   All sizes are fractions of the short side (line widths px @ 512), so preview = export. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp } = U;
  const TAU = Math.PI * 2;

  const SLOTS = [['tl', 'Top left'], ['tc', 'Top center'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['bc', 'Bottom center'], ['br', 'Bottom right'], ['none', 'Hidden']];
  const FONTS = {
    mono: (s) => `600 ${s}px Consolas, "Cascadia Mono", "Courier New", monospace`,
    monoBold: (s) => `800 ${s}px "Courier New", Consolas, monospace`,
    sans: (s) => `600 ${s}px system-ui, "Segoe UI", Roboto, sans-serif`,
    narrow: (s) => `600 ${s}px "Arial Narrow", "Roboto Condensed", "Segoe UI", sans-serif`,
  };
  const CINE = [['none', 'None'], ['1.85', '1.85 : 1'], ['2.39', '2.39 : 1 (scope)'], ['2', '2 : 1'], ['1.33', '4 : 3'], ['1', '1 : 1'], ['0.5625', '9 : 16 (vertical)']];
  const hid = (k) => (p) => p[k] !== 'none';
  const T = (key, label, def, extra) => Object.assign({ key, label, type: 'text', default: def, max: 40 }, extra);
  const SL = (key, label, def, extra) => Object.assign({ key, label, type: 'select', default: def, options: SLOTS }, extra);
  const R = (key, label, min, max, step, def, extra) => Object.assign({ key, label, type: 'range', min, max, step, default: def }, extra);
  const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  U.register({
    id: 'camera-ui',
    name: 'Camera Overlay',
    desc: 'Camcorder, viewfinder, bodycam, CCTV, drone and VHS screen overlays with REC, timecode, battery, frame marks and screen effects',
    uses: [
      'Full-screen overlays for in-game cameras: camcorder and found-footage horror, bodycams, security monitors, drones, photo modes and helmet cams.',
      'Viewfinder frames and recording HUDs for cutscenes, trailers, thumbnails and video edits.',
    ],
    tags: ['UI', 'Horror', 'Military'],
    aspect: '16:9',
    bg: 'gray',
    exportLayers: (p) => (p.blink && p.recPos !== 'none' ? [{ id: 'frame0', suffix: 'rec_on' }, { id: 'frame1', suffix: 'rec_off' }] : null),
    icon: U.icon('<path d="M3 8V5h3M18 5h3v3M21 16v3h-3M6 19H3v-3"/><circle cx="7" cy="9" r="1.3" fill="currentColor"/><path d="M10 9h4M12 12.5v-1M12 13.5v1M10.5 13h-1M13.5 13h1" opacity=".7"/><rect x="15" y="15" width="4" height="2"/>'),
    params: [
      { type: 'section', label: 'Style' },
      { key: 'color', label: 'Color', type: 'color', default: '#ffffff', tip: 'White for camcorders, green for night vision, amber for old monitors' },
      { key: 'accent', label: 'REC / warning color', type: 'color', default: '#ff2a2a' },
      R('lineW', 'Line weight', 0.5, 6, 0.05, 1.6, { tip: 'px @ 512' }),
      R('opacity', 'Opacity', 0.05, 1, 0.01, 0.92),
      { key: 'font', label: 'Font', type: 'select', default: 'mono', options: [['mono', 'Monospace'], ['monoBold', 'Monospace heavy (VHS)'], ['sans', 'Sans'], ['narrow', 'Narrow']] },
      R('textSize', 'Text size', 0.015, 0.09, 0.001, 0.04, { tip: 'Fraction of the short side' }),
      R('margin', 'Screen margin', 0, 0.2, 0.002, 0.06, { tip: 'Distance of the readouts from the screen edge (fraction of the short side)' }),
      R('shadow', 'Drop shadow', 0, 1, 0.01, 0.6, { tip: 'Dark shadow behind the lines and text for readability on bright footage' }),
      R('glow', 'Glow', 0, 1, 0.01, 0),

      { type: 'section', label: 'Readouts' },
      SL('recPos', 'REC indicator', 'tl'),
      T('recText', 'REC text', 'REC', { show: hid('recPos'), max: 16 }),
      { key: 'recDot', label: 'Dot', type: 'bool', default: true, show: hid('recPos') },
      SL('tcPos', 'Timecode', 'tr'),
      T('tcText', 'Timecode text', '00:12:47:08', { show: hid('tcPos') }),
      { key: 'tcInline', label: 'Timecode next to REC', type: 'bool', default: false, show: (p) => p.tcPos !== 'none' && p.tcPos === p.recPos, tip: 'When both share a slot, the timecode follows the REC indicator on the same row' },
      SL('datePos', 'Date / time', 'bl'),
      T('dateText', 'Date text', 'NOV 23 2026  14:32:07', { show: hid('datePos') }),
      SL('labelPos', 'Label', 'none'),
      T('labelText', 'Label text', 'CAM 01', { show: hid('labelPos') }),
      SL('expPos', 'Exposure readout', 'none'),
      T('expText', 'Exposure text', '1/50  F2.8  ISO 800', { show: hid('expPos') }),
      SL('modePos', 'Mode labels', 'none'),
      T('modeText', 'Mode text', 'AUTO 4K HDR', { show: hid('modePos'), tip: 'Words separated by spaces' }),
      { key: 'modeBoxes', label: 'Boxed modes', type: 'bool', default: true, show: hid('modePos') },

      { type: 'section', label: 'Indicators' },
      SL('battPos', 'Battery', 'br'),
      R('battLevel', 'Battery level', 0, 1, 0.01, 0.75, { show: hid('battPos') }),
      { key: 'battSeg', label: 'Battery segments', type: 'int', min: 0, max: 10, default: 4, show: hid('battPos'), tip: '0 = one continuous bar' },
      R('battLow', 'Low battery below', 0, 1, 0.01, 0.2, { show: hid('battPos'), tip: 'At or below this level the battery turns the warning color' }),
      { key: 'battPct', label: 'Percentage', type: 'bool', default: false, show: hid('battPos') },
      SL('sigPos', 'Signal bars', 'none'),
      { key: 'sigLevel', label: 'Signal level', type: 'int', min: 0, max: 5, default: 4, show: hid('sigPos') },
      SL('zoomPos', 'Zoom bar', 'none'),
      R('zoom', 'Zoom', 0, 1, 0.01, 0.3, { show: hid('zoomPos') }),
      SL('meterPos', 'Exposure meter', 'none'),
      R('ev', 'Exposure value', -3, 3, 0.05, 0, { show: hid('meterPos') }),
      SL('headPos', 'Heading tape', 'none'),
      R('heading', 'Heading', 0, 359, 1, 42, { show: hid('headPos') }),

      { type: 'section', label: 'Frame' },
      { key: 'corners', label: 'Corner brackets', type: 'bool', default: true },
      R('cornerLen', 'Bracket length', 0.02, 0.3, 0.002, 0.08, { show: (p) => p.corners }),
      R('frameInset', 'Bracket inset', 0, 0.25, 0.002, 0.035, { show: (p) => p.corners, tip: 'Fraction of the short side' }),
      { key: 'safe', label: 'Safe-area frame', type: 'select', default: 'none', options: [['none', 'None'], ['solid', 'Solid'], ['dashed', 'Dashed'], ['ticks', 'Corner ticks']] },
      R('safeInset', 'Safe-area inset', 0.02, 0.25, 0.002, 0.1, { show: hid('safe'), tip: 'Fraction of each side' }),
      { key: 'thirds', label: 'Rule of thirds', type: 'select', default: 'none', options: [['none', 'None'], ['lines', 'Lines'], ['crosses', '+ at intersections'], ['dots', 'Dots at intersections']] },
      R('thirdsAlpha', 'Thirds opacity', 0.05, 1, 0.01, 0.4, { show: hid('thirds') }),
      { key: 'cine', label: 'Cinema frame lines', type: 'select', default: 'none', options: CINE },
      R('cineMatte', 'Matte outside', 0, 1, 0.01, 0.6, { show: hid('cine'), tip: 'Darkens the area outside the frame lines (letterbox)' }),
      { key: 'cineLines', label: 'Draw frame lines', type: 'bool', default: true, show: hid('cine') },

      { type: 'section', label: 'Center' },
      { key: 'center', label: 'Center mark', type: 'select', default: 'plus', options: [['none', 'None'], ['plus', 'Plus'], ['crosshair', 'Crosshair'], ['brackets', 'Brackets'], ['circle', 'Circle'], ['arcs', 'Broken ring'], ['dot', 'Dot']] },
      R('centerSize', 'Center size', 0.01, 0.4, 0.002, 0.04, { show: hid('center') }),
      { key: 'focus', label: 'Focus box', type: 'select', default: 'none', options: [['none', 'None'], ['corners', 'Corners'], ['box', 'Box'], ['dashed', 'Dashed box']] },
      R('focusSize', 'Focus box size', 0.04, 0.6, 0.002, 0.16, { show: hid('focus') }),
      R('focusX', 'Focus box X', -0.45, 0.45, 0.005, 0, { show: hid('focus') }),
      R('focusY', 'Focus box Y', -0.45, 0.45, 0.005, 0, { show: hid('focus') }),
      { key: 'focusColor', label: 'Focus box color', type: 'color', default: '#5dff6a', show: hid('focus') },
      { key: 'afPoints', label: 'AF points', type: 'int', min: 0, max: 15, default: 0, tip: 'Columns of autofocus point squares around the center (0 = off)' },
      { key: 'horizon', label: 'Horizon line', type: 'bool', default: false },
      R('roll', 'Roll', -45, 45, 0.5, 0, { show: (p) => p.horizon }),

      { type: 'section', label: 'Effects', active: (p) => p.tint > 0 || p.vignette > 0 || p.scan > 0 || p.noise > 0 || p.chroma > 0 },
      R('tint', 'Screen tint', 0, 1, 0.01, 0, { tip: 'Fills the screen with the tint color at this opacity (night vision, old monitors)' }),
      { key: 'tintColor', label: 'Tint color', type: 'color', default: '#1f8a2a', show: (p) => p.tint > 0 },
      R('vignette', 'Vignette', 0, 1, 0.01, 0),
      R('scan', 'Scanlines', 0, 1, 0.01, 0),
      R('scanGap', 'Scanline spacing', 1.5, 12, 0.1, 3, { show: (p) => p.scan > 0, tip: 'px @ 512' }),
      R('noise', 'VHS noise', 0, 1, 0.01, 0, { tip: 'Specks, dropout streaks and a tracking band near the bottom' }),
      R('chroma', 'Chromatic edge', 0, 1, 0.01, 0, { tip: 'Red / blue split of the overlay that grows toward the screen edges' }),
      { key: 'seed', label: 'Seed', type: 'seed', default: 7, show: (p) => p.noise > 0 },

      { type: 'section', label: 'Output' },
      { key: 'blink', label: 'Blink layers (REC dot on / off)', type: 'bool', default: false, tip: 'Download saves two PNGs: with and without the REC dot. The corner player shows them blinking' },
      { key: 'blinkText', label: 'Blink the REC text too', type: 'bool', default: false, show: (p) => p.blink },
      { key: 'fps', label: 'Blink speed (fps)', type: 'int', min: 1, max: 8, default: 2, show: (p) => p.blink },
    ],
    presets: [
      { name: 'Camcorder', group: 'Realistic', aspect: '16:9', values: { tcInline: false, modePos: 'tr', modeText: 'SP 16:9', battPct: false, center: 'plus' } },
      { name: 'DSLR viewfinder', group: 'Realistic', aspect: '16:9', values: { color: '#d9ffd0', recPos: 'none', tcPos: 'none', datePos: 'none', battPos: 'br', battSeg: 3, expPos: 'bc', expText: '1/125  F5.6  ISO 400', meterPos: 'bc', ev: -0.35, modePos: 'bl', modeText: 'M AWB RAW', corners: false, safe: 'solid', safeInset: 0.06, center: 'none', afPoints: 9, focus: 'corners', focusSize: 0.07, focusX: 0.08, focusY: -0.04, focusColor: '#ff3a3a', shadow: 0.2, lineW: 1.1, textSize: 0.034 } },
      { name: 'Bodycam', group: 'Realistic', aspect: '16:9', values: { font: 'sans', recPos: 'tl', recText: 'REC', tcPos: 'none', datePos: 'tr', dateText: '2026-11-23  T14:32:07Z', labelPos: 'tr', labelText: 'UNIT 4471  AXIS-2', battPos: 'tl', battSeg: 0, sigPos: 'none', corners: false, center: 'none', vignette: 0.45, chroma: 0.35, shadow: 0.8, textSize: 0.032 } },
      { name: 'Security CCTV', group: 'Realistic', aspect: '16:9', values: { color: '#f2f2f2', recPos: 'br', recDot: false, recText: 'REC', labelPos: 'tl', labelText: 'CAM 03  LOBBY', tcPos: 'none', datePos: 'tr', dateText: '11-23-2026  02:14:55', battPos: 'none', corners: false, center: 'none', scan: 0.35, scanGap: 2.6, noise: 0.35, vignette: 0.35, shadow: 0.9, font: 'monoBold' } },
      { name: 'Drone', group: 'Realistic', aspect: '16:9', values: { recPos: 'tl', tcPos: 'tl', tcInline: true, tcText: '00:03:12', datePos: 'none', labelPos: 'bl', labelText: 'H 120.4m  D 342m  VS 1.2', sigPos: 'tr', sigLevel: 4, battPos: 'tr', battPct: true, battLevel: 0.64, expPos: 'br', expText: 'ISO 100  1/500  EV 0', headPos: 'tc', heading: 274, horizon: true, roll: -6, center: 'crosshair', centerSize: 0.03, corners: false, thirds: 'crosses', thirdsAlpha: 0.5, zoomPos: 'bc', zoom: 0.18, textSize: 0.032 } },
      { name: 'Night vision', group: 'Realistic', aspect: '16:9', values: { color: '#8dff7a', accent: '#d9ff4a', tint: 0.18, tintColor: '#2e9a2a', vignette: 0.85, scan: 0.3, noise: 0.45, recPos: 'tl', tcPos: 'tl', tcInline: true, datePos: 'none', labelPos: 'tr', labelText: 'IR ON  NV 2', battPos: 'br', battLevel: 0.3, center: 'crosshair', centerSize: 0.05, glow: 0.5, shadow: 0.2 } },
      { name: 'Found-footage VHS', group: 'Realistic', aspect: '16:9', values: { font: 'monoBold', recPos: 'none', labelPos: 'tl', labelText: 'PLAY ▶', tcPos: 'tr', tcText: 'SP  0:42:17', datePos: 'bl', dateText: 'JUN 14 1998  AM 11:42', battPos: 'none', corners: false, center: 'none', scan: 0.4, scanGap: 2.4, noise: 0.75, chroma: 0.75, vignette: 0.4, shadow: 0.7, textSize: 0.05, glow: 0.25, seed: 19 } },
      { name: 'Cinema frame lines', group: 'Realistic', aspect: '16:9', values: { recPos: 'tl', recDot: true, recText: 'REC', tcPos: 'tr', tcText: '01:02:33:14', datePos: 'none', battPos: 'none', corners: false, cine: '2.39', cineMatte: 0.55, thirds: 'lines', thirdsAlpha: 0.22, safe: 'ticks', safeInset: 0.05, center: 'plus', centerSize: 0.025, modePos: 'bl', modeText: 'A-CAM 24FPS 180°', textSize: 0.03, lineW: 1.1 } },
      { name: 'Minimal REC', group: 'Stylized', aspect: '16:9', values: { tcPos: 'none', datePos: 'none', battPos: 'none', corners: false, center: 'none', shadow: 0.5 } },
      { name: 'Phone camera', group: 'Stylized', aspect: '9:16', values: { font: 'sans', recPos: 'tc', recText: '00:00:41', tcPos: 'none', datePos: 'none', battPos: 'none', modePos: 'bc', modeText: '0.5x 1x 2x', modeBoxes: true, corners: false, thirds: 'lines', thirdsAlpha: 0.3, center: 'none', focus: 'corners', focusColor: '#ffd23a', focusSize: 0.2, focusY: 0.05, textSize: 0.038 } },
      { name: 'Vlog frame', group: 'Stylized', aspect: '16:9', values: { font: 'sans', color: '#ffffff', tcPos: 'tl', tcInline: true, datePos: 'none', battPos: 'tr', battPct: true, modePos: 'br', modeText: '4K 60', corners: true, cornerLen: 0.12, frameInset: 0.05, lineW: 2.6, center: 'none', shadow: 0.4 } },
      { name: 'Amber monitor', group: 'Stylized', aspect: '16:9', values: { color: '#ffb23a', accent: '#ff5a1a', font: 'monoBold', labelPos: 'tl', labelText: 'FEED 02', recPos: 'tr', tcPos: 'tr', tcInline: true, datePos: 'bl', battPos: 'none', scan: 0.5, scanGap: 3.4, vignette: 0.6, tint: 0.08, tintColor: '#ff9a20', glow: 0.6, center: 'brackets', centerSize: 0.06 } },
      { name: 'Paranormal cam', group: 'Game-inspired', aspect: '16:9', values: { recPos: 'tl', tcPos: 'tl', tcInline: true, datePos: 'bl', dateText: 'OCT 31 2026  03:13:00', labelPos: 'tr', labelText: 'EMF 4.7  TEMP 41°F', battPos: 'br', battLevel: 0.12, center: 'circle', centerSize: 0.05, noise: 0.5, scan: 0.25, chroma: 0.4, vignette: 0.55, seed: 13 } },
      { name: 'Asylum night cam', group: 'Game-inspired', aspect: '16:9', values: { color: '#b8ffb0', accent: '#ff3030', tint: 0.22, tintColor: '#3aa03a', vignette: 0.9, noise: 0.55, scan: 0.15, recPos: 'tl', tcPos: 'none', datePos: 'none', battPos: 'tr', battLevel: 0.18, battSeg: 5, labelPos: 'br', labelText: 'NIGHT VISION', corners: true, frameInset: 0.04, center: 'none', zoomPos: 'bl', zoom: 0.1, glow: 0.4 } },
      { name: 'Military drone feed', group: 'Game-inspired', aspect: '16:9', values: { color: '#e8e8e8', font: 'monoBold', recPos: 'none', tcPos: 'none', labelPos: 'tl', labelText: 'MQ-9  TGT LOCK', datePos: 'tr', dateText: '23NOV26 1432Z', expPos: 'bl', expText: 'ALT 18250  SPD 172', modePos: 'br', modeText: 'WHOT  NFOV', modeBoxes: true, battPos: 'none', headPos: 'tc', heading: 312, center: 'crosshair', centerSize: 0.09, focus: 'box', focusSize: 0.09, focusColor: '#e8e8e8', corners: true, cornerLen: 0.05, horizon: true, scan: 0.15, noise: 0.2, shadow: 0.4, textSize: 0.036 } },
      { name: 'Sci-fi helmet cam', group: 'Sci-fi', aspect: '16:9', values: { color: '#6ef3ff', accent: '#ff4a6a', font: 'narrow', recPos: 'tr', recText: 'LINK REC', labelPos: 'tl', labelText: 'SUIT CAM 02 // O2 87%', tcPos: 'none', datePos: 'bl', dateText: 'CYCLE 0412.3', battPos: 'br', battSeg: 8, battPct: true, sigPos: 'br', sigLevel: 3, headPos: 'tc', heading: 128, center: 'arcs', centerSize: 0.08, corners: true, cornerLen: 0.14, frameInset: 0.05, horizon: true, roll: 4, glow: 0.7, chroma: 0.2, vignette: 0.35, shadow: 0.2, lineW: 1.3 } },
      { name: 'Exo-suit scanner', group: 'Sci-fi', aspect: '16:9', values: { color: '#ffd166', accent: '#ff4f3a', font: 'narrow', recPos: 'none', labelPos: 'tl', labelText: 'SCAN MODE // BIO', tcPos: 'tr', tcText: 'T+00:14:52', datePos: 'none', battPos: 'none', meterPos: 'bc', ev: 1.3, modePos: 'bl', modeText: 'IR UV XR', focus: 'corners', focusSize: 0.28, focusColor: '#ffd166', center: 'brackets', centerSize: 0.05, thirds: 'dots', thirdsAlpha: 0.7, corners: false, safe: 'ticks', safeInset: 0.04, glow: 0.6, scan: 0.2, scanGap: 2.4 } },
    ],
    render(ctx, W, H, p, opts) {
      const S = Math.min(W, H), k = S / 512, lw = Math.max(0.75, p.lineW * k);
      const fs = Math.max(5, p.textSize * S), font = FONTS[p.font] || FONTS.mono;
      const layer = opts && opts.layer, dotOff = layer === 'frame1';
      const cx = W / 2, cy = H / 2, col = p.color;

      /* ---------- screen effects below the overlay ---------- */
      if (p.tint > 0) { ctx.fillStyle = U.rgba(p.tintColor, p.tint); ctx.fillRect(0, 0, W, H); }
      if (p.cine !== 'none' && p.cineMatte > 0) {
        const fr = cineRect(W, H, +p.cine);
        ctx.fillStyle = `rgba(0,0,0,${p.cineMatte})`;
        ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(fr[0], fr[1], fr[2], fr[3]); ctx.fill('evenodd');
      }
      if (p.vignette > 0) {
        ctx.save(); ctx.translate(cx, cy); ctx.scale(W / S, H / S);
        const g = ctx.createRadialGradient(0, 0, S * 0.25, 0, 0, S * 0.78);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.55, `rgba(0,0,0,${0.35 * p.vignette})`); g.addColorStop(1, `rgba(0,0,0,${0.95 * p.vignette})`);
        ctx.fillStyle = g; ctx.fillRect(-S, -S, 2 * S * Math.max(1, W / H), 2 * S * Math.max(1, H / W)); ctx.restore();
      }

      /* ---------- the overlay itself, on its own canvas ---------- */
      const ui = U.canvas(W, H), c = ui.getContext('2d');
      c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw; c.lineCap = 'butt'; c.lineJoin = 'miter';
      const line = (pts) => { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke(); };
      const text = (t, x, y, align, size = fs, color = col) => { c.font = font(size); c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(t, x, y); };
      const tw = (t, size = fs) => { c.font = font(size); return c.measureText(t).width; };

      // frame marks
      if (p.corners) {
        const m = p.frameInset * S + lw / 2, L = p.cornerLen * S;
        line([m, m + L, m, m, m + L, m]); line([W - m - L, m, W - m, m, W - m, m + L]);
        line([m, H - m - L, m, H - m, m + L, H - m]); line([W - m - L, H - m, W - m, H - m, W - m, H - m - L]);
      }
      if (p.safe !== 'none') {
        const ix = p.safeInset * W, iy = p.safeInset * H;
        c.save(); c.globalAlpha = 0.75;
        if (p.safe === 'ticks') {
          const L = S * 0.03;
          line([ix, iy + L, ix, iy, ix + L, iy]); line([W - ix - L, iy, W - ix, iy, W - ix, iy + L]);
          line([ix, H - iy - L, ix, H - iy, ix + L, H - iy]); line([W - ix - L, H - iy, W - ix, H - iy, W - ix, H - iy - L]);
        } else {
          if (p.safe === 'dashed') c.setLineDash([lw * 5, lw * 4]);
          c.strokeRect(ix, iy, W - 2 * ix, H - 2 * iy);
        }
        c.restore();
      }
      if (p.thirds !== 'none') {
        c.save(); c.globalAlpha = p.thirdsAlpha;
        const xs = [W / 3, (2 * W) / 3], ys = [H / 3, (2 * H) / 3];
        if (p.thirds === 'lines') { c.lineWidth = Math.max(0.75, lw * 0.7); for (const x of xs) line([x, 0, x, H]); for (const y of ys) line([0, y, W, y]); }
        else for (const x of xs) for (const y of ys) {
          if (p.thirds === 'dots') { c.beginPath(); c.arc(x, y, lw * 1.6, 0, TAU); c.fill(); }
          else { const a = S * 0.018; line([x - a, y, x + a, y]); line([x, y - a, x, y + a]); }
        }
        c.restore();
      }
      if (p.cine !== 'none' && p.cineLines) {
        const [x, y, w, h] = cineRect(W, H, +p.cine);
        c.save(); c.globalAlpha = 0.85; c.lineWidth = Math.max(0.75, lw * 0.8); c.strokeRect(x, y, w, h); c.restore();
      }

      // center mark
      const cs = p.centerSize * S;
      switch (p.center) {
        case 'plus': line([cx - cs, cy, cx + cs, cy]); line([cx, cy - cs, cx, cy + cs]); break;
        case 'crosshair': {
          const g = cs * 0.3;
          line([cx - cs, cy, cx - g, cy]); line([cx + g, cy, cx + cs, cy]); line([cx, cy - cs, cx, cy - g]); line([cx, cy + g, cx, cy + cs]);
          c.beginPath(); c.arc(cx, cy, lw * 0.9, 0, TAU); c.fill();
          break;
        }
        case 'brackets': {
          const a = cs, b = cs * 0.4;
          line([cx - a, cy - a + b, cx - a, cy - a, cx - a + b, cy - a]); line([cx + a - b, cy - a, cx + a, cy - a, cx + a, cy - a + b]);
          line([cx - a, cy + a - b, cx - a, cy + a, cx - a + b, cy + a]); line([cx + a - b, cy + a, cx + a, cy + a, cx + a, cy + a - b]);
          c.beginPath(); c.arc(cx, cy, lw * 0.9, 0, TAU); c.fill();
          break;
        }
        case 'circle':
          c.beginPath(); c.arc(cx, cy, cs, 0, TAU); c.stroke();
          for (let i = 0; i < 4; i++) { const a = (i * TAU) / 4, co = Math.cos(a), si = Math.sin(a); line([cx + co * cs, cy + si * cs, cx + co * cs * 1.35, cy + si * cs * 1.35]); }
          c.beginPath(); c.arc(cx, cy, lw * 0.9, 0, TAU); c.fill();
          break;
        case 'arcs':
          for (let i = 0; i < 4; i++) { const a = (i * TAU) / 4 + 0.22; c.beginPath(); c.arc(cx, cy, cs, a, a + TAU / 4 - 0.44); c.stroke(); }
          c.save(); c.lineWidth = lw * 0.7;
          for (let i = 0; i < 4; i++) { const a = (i * TAU) / 4 + TAU / 8, co = Math.cos(a), si = Math.sin(a); line([cx + co * cs * 0.55, cy + si * cs * 0.55, cx + co * cs * 0.8, cy + si * cs * 0.8]); }
          c.restore();
          c.beginPath(); c.arc(cx, cy, lw * 0.9, 0, TAU); c.fill();
          break;
        case 'dot': c.beginPath(); c.arc(cx, cy, Math.max(lw * 1.2, cs * 0.12), 0, TAU); c.fill(); break;
      }
      if (p.afPoints > 0) {
        const nx = p.afPoints | 0, ny = Math.max(1, Math.round(nx * 0.35) | 1), sp = (W * 0.36) / Math.max(1, nx), sq = Math.min(sp * 0.36, S * 0.026);
        c.save(); c.lineWidth = Math.max(0.75, lw * 0.7); c.globalAlpha = 0.7;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const x = cx + (i - (nx - 1) / 2) * sp, y = cy + (j - (ny - 1) / 2) * sp * 1.1;
          // skip the outer corners so the pattern reads as a diamond-ish AF field
          if (nx > 3 && ny > 2 && (i === 0 || i === nx - 1) && (j === 0 || j === ny - 1)) continue;
          c.strokeRect(x - sq / 2, y - sq / 2, sq, sq);
        }
        c.restore();
      }
      if (p.focus !== 'none') {
        const fx = cx + p.focusX * W, fy = cy + p.focusY * H, a = (p.focusSize * S) / 2;
        c.save(); c.strokeStyle = p.focusColor; c.lineWidth = lw * 1.1;
        if (p.focus === 'corners') {
          const b = a * 0.35;
          line([fx - a, fy - a + b, fx - a, fy - a, fx - a + b, fy - a]); line([fx + a - b, fy - a, fx + a, fy - a, fx + a, fy - a + b]);
          line([fx - a, fy + a - b, fx - a, fy + a, fx - a + b, fy + a]); line([fx + a - b, fy + a, fx + a, fy + a, fx + a, fy + a - b]);
        } else {
          if (p.focus === 'dashed') c.setLineDash([lw * 3, lw * 2.5]);
          c.strokeRect(fx - a, fy - a, 2 * a, 2 * a);
        }
        c.restore();
      }
      if (p.horizon) {
        const r = (p.roll * Math.PI) / 180, L = S * 0.16, g = S * 0.07, t = S * 0.015;
        c.save(); c.translate(cx, cy); c.rotate(r);
        line([-g - L, 0, -g, 0, -g, t]); line([g + L, 0, g, 0, g, t]);
        c.restore();
      }

      /* ---------- readouts in six slots ---------- */
      const gap = fs * 0.6;
      const items = {
        rec: () => {
          const r = fs * 0.36, showDot = p.recDot, tx = p.recText || '';
          const w = (showDot ? 2 * r + (tx ? fs * 0.3 : 0) : 0) + (tx ? tw(tx) : 0);
          return { w, h: fs, draw(x, y) {
            if (showDot && !dotOff) { c.fillStyle = p.accent; c.beginPath(); c.arc(x + r, y + fs / 2, r, 0, TAU); c.fill(); }
            if (tx && !(dotOff && p.blinkText)) text(tx, x + (showDot ? 2 * r + fs * 0.3 : 0), y + fs / 2, 'left', fs, showDot ? col : p.accent);
          } };
        },
        txt: (t) => ({ w: tw(t), h: fs, draw(x, y) { text(t, x, y + fs / 2, 'left'); } }),
        modes: () => {
          const words = (p.modeText || '').split(/\s+/).filter(Boolean), px = p.modeBoxes ? fs * 0.3 : 0, sp = fs * (p.modeBoxes ? 0.3 : 0.6);
          const ws = words.map((t) => tw(t, fs * 0.85) + 2 * px), w = ws.reduce((a, b) => a + b, 0) + sp * Math.max(0, words.length - 1);
          return { w, h: fs * 1.15, draw(x, y) {
            let xx = x;
            words.forEach((t, i) => {
              if (p.modeBoxes) { c.save(); c.lineWidth = Math.max(0.75, lw * 0.75); c.strokeStyle = col; c.strokeRect(xx + 0.5, y + 0.5, ws[i] - 1, fs * 1.15 - 1); c.restore(); }
              text(t, xx + ws[i] / 2, y + fs * 0.6, 'center', fs * 0.85); xx += ws[i] + sp;
            });
          } };
        },
        batt: () => {
          const bw = fs * 1.9, bh = fs * 0.85, nub = fs * 0.14, lvl = clamp(p.battLevel), low = lvl <= p.battLow, pct = p.battPct ? `${Math.round(lvl * 100)}%` : '';
          const pw = pct ? tw(pct, fs * 0.8) + fs * 0.3 : 0;
          return { w: pw + bw + nub, h: fs, draw(x, y) {
            if (pct) text(pct, x, y + fs / 2, 'left', fs * 0.8, low ? p.accent : col);
            const bx = x + pw, by = y + (fs - bh) / 2, lwB = Math.max(0.75, lw * 0.8), inn = lwB + Math.max(1, fs * 0.07), cc = low ? p.accent : col;
            c.save(); c.strokeStyle = cc; c.fillStyle = cc; c.lineWidth = lwB;
            c.strokeRect(bx + lwB / 2, by + lwB / 2, bw - lwB, bh - lwB);
            c.fillRect(bx + bw, by + bh * 0.3, nub, bh * 0.4);
            const ix = bx + inn, iy = by + inn, iw = bw - 2 * inn, ih = bh - 2 * inn, n = p.battSeg | 0;
            if (n <= 0) c.fillRect(ix, iy, iw * lvl, ih);
            else {
              const sg = Math.max(1, fs * 0.06), sw = (iw - sg * (n - 1)) / n, on = Math.ceil(lvl * n - 1e-6);
              for (let i = 0; i < on; i++) c.fillRect(ix + i * (sw + sg), iy, sw, ih);
            }
            c.restore();
          } };
        },
        sig: () => {
          const n = 5, bw = fs * 0.2, sp = fs * 0.09;
          return { w: n * bw + (n - 1) * sp, h: fs, draw(x, y) {
            for (let i = 0; i < n; i++) {
              const h = fs * (0.25 + (0.75 * (i + 1)) / n);
              c.globalAlpha = i < p.sigLevel ? 1 : 0.3; c.fillStyle = col; c.fillRect(x + i * (bw + sp), y + fs - h, bw, h);
            }
            c.globalAlpha = 1;
          } };
        },
        zoom: () => {
          const len = fs * 6, wW = tw('W', fs * 0.85), wT = tw('T', fs * 0.85), sp = fs * 0.35;
          return { w: wW + len + wT + 2 * sp, h: fs, draw(x, y) {
            const my = y + fs / 2, x0 = x + wW + sp, x1 = x0 + len;
            text('W', x, my, 'left', fs * 0.85); text('T', x1 + sp, my, 'left', fs * 0.85);
            c.save(); c.lineWidth = Math.max(0.75, lw * 0.8); line([x0, my, x1, my]);
            for (let i = 0; i <= 4; i++) { const xx = x0 + (len * i) / 4; line([xx, my - fs * 0.15, xx, my + fs * 0.15]); }
            c.fillRect(x0 + len * clamp(p.zoom) - fs * 0.12, my - fs * 0.38, fs * 0.24, fs * 0.76);
            c.restore();
          } };
        },
        meter: () => {
          const len = fs * 8, h = fs * 1.5;
          return { w: len + fs, h, draw(x, y) {
            const x0 = x + fs / 2, my = y + fs * 0.55, step = len / 6;
            c.save(); c.lineWidth = Math.max(0.75, lw * 0.8);
            for (let i = 0; i <= 18; i++) {
              const xx = x0 + (len * i) / 18, major = i % 3 === 0;
              line([xx, my - (major ? fs * 0.3 : fs * 0.15), xx, my]);
            }
            line([x0, my, x0 + len, my]);
            for (let i = 0; i <= 6; i++) text(String(Math.abs(i - 3)), x0 + i * step, my - fs * 0.62, 'center', fs * 0.55);
            text('-', x0 - fs * 0.35, my - fs * 0.3, 'center', fs * 0.7); text('+', x0 + len + fs * 0.35, my - fs * 0.3, 'center', fs * 0.7);
            const ex = x0 + ((clamp(p.ev, -3, 3) + 3) / 6) * len;
            c.beginPath(); c.moveTo(ex, my + fs * 0.12); c.lineTo(ex - fs * 0.22, my + fs * 0.5); c.lineTo(ex + fs * 0.22, my + fs * 0.5); c.closePath(); c.fill();
            c.restore();
          } };
        },
        head: () => {
          const len = Math.min(fs * 14, W * 0.42), h = fs * 1.7, span = 90;
          return { w: len, h, draw(x, y) {
            const mid = x + len / 2, by = y + h * 0.62, hd = p.heading;
            c.save(); c.beginPath(); c.rect(x, y - 2, len, h + 4); c.clip(); c.lineWidth = Math.max(0.75, lw * 0.8);
            for (let d = Math.floor((hd - span / 2) / 5) * 5; d <= hd + span / 2; d += 5) {
              const xx = mid + ((d - hd) / span) * len, dn = U.mod(d, 360), major = dn % 15 === 0;
              const fade = 1 - Math.abs(xx - mid) / (len / 2);
              c.globalAlpha = clamp(fade * 1.6);
              line([xx, by, xx, by - (major ? fs * 0.35 : fs * 0.18)]);
              if (dn % 45 === 0) text(COMPASS[dn / 45], xx, y + fs * 0.35, 'center', fs * 0.7);
              else if (dn % 15 === 0) text(String(dn), xx, y + fs * 0.35, 'center', fs * 0.5);
            }
            c.restore();
            c.beginPath(); c.moveTo(mid, by + fs * 0.06); c.lineTo(mid - fs * 0.2, by + fs * 0.42); c.lineTo(mid + fs * 0.2, by + fs * 0.42); c.closePath(); c.fill();
            text(String(Math.round(U.mod(hd, 360))).padStart(3, '0'), mid + fs * 0.35, by + fs * 0.32, 'left', fs * 0.55);
          } };
        },
      };
      // items in display order; `join` puts an item on the previous row when both share a slot
      const order = [
        ['recPos', items.rec], ['tcPos', () => items.txt(p.tcText || ''), p.tcInline && p.tcPos === p.recPos ? 'recPos' : null],
        ['labelPos', () => items.txt(p.labelText || '')], ['datePos', () => items.txt(p.dateText || '')],
        ['sigPos', items.sig], ['battPos', items.batt, 'sigPos'], ['expPos', () => items.txt(p.expText || '')],
        ['modePos', items.modes], ['zoomPos', items.zoom], ['meterPos', items.meter], ['headPos', items.head],
      ];
      const slots = {};
      let lastKey = {};
      for (const [key, make, join] of order) {
        const s = p[key];
        if (!s || s === 'none') continue;
        const it = make();
        if (!(it.w > 0)) continue;
        const rows = slots[s] || (slots[s] = []);
        if (join && p[join] === s && lastKey[s] === join && rows.length) rows[rows.length - 1].push(it);
        else rows.push([it]);
        lastKey[s] = key;
      }
      // readouts stay inside the corner brackets
      const m = Math.max(p.margin * S, p.corners ? p.frameInset * S + lw + fs * 0.45 : 0), rg = fs * 0.4;
      for (const s of Object.keys(slots)) {
        const rows = slots[s].map((r) => ({ r, w: r.reduce((a, it) => a + it.w, 0) + gap * (r.length - 1), h: Math.max(...r.map((it) => it.h)) }));
        const total = rows.reduce((a, r) => a + r.h, 0) + rg * (rows.length - 1);
        let y = s[0] === 't' ? m : H - m - total;
        for (const row of rows) {
          let x = s[1] === 'l' ? m : s[1] === 'r' ? W - m - row.w : (W - row.w) / 2;
          // right-aligned rows keep their items in order, so a right slot reads left to right
          for (const it of row.r) { it.draw(x, y + (row.h - it.h) / 2); x += it.w + gap; }
          y += row.h + rg;
        }
      }

      /* ---------- chromatic edge: radial red / blue split of the overlay ---------- */
      let src = ui;
      if (p.chroma > 0) {
        const id = c.getImageData(0, 0, W, H), s0 = id.data, out = new ImageData(W, H), d = out.data, sc = p.chroma * 0.009;
        const fr = 1 + sc, fb = 1 - sc;
        for (let y = 0, o = 0; y < H; y++) {
          const dy = y + 0.5 - cy, ry = Math.round(cy + dy * fr - 0.5), by = Math.round(cy + dy * fb - 0.5);
          for (let x = 0; x < W; x++, o += 4) {
            const dx = x + 0.5 - cx, rx = Math.round(cx + dx * fr - 0.5), bx = Math.round(cx + dx * fb - 0.5);
            const ri = rx >= 0 && rx < W && ry >= 0 && ry < H ? (ry * W + rx) * 4 : -1, bi = bx >= 0 && bx < W && by >= 0 && by < H ? (by * W + bx) * 4 : -1;
            const ar = ri >= 0 ? s0[ri + 3] : 0, ag = s0[o + 3], ab = bi >= 0 ? s0[bi + 3] : 0, a = Math.max(ar, ag, ab);
            if (!a) continue;
            d[o] = (ri >= 0 ? s0[ri] * ar : 0) / a; d[o + 1] = (s0[o + 1] * ag) / a; d[o + 2] = (bi >= 0 ? s0[bi + 2] * ab : 0) / a; d[o + 3] = a;
          }
        }
        src = U.canvas(W, H); src.getContext('2d').putImageData(out, 0, 0);
      }

      /* ---------- composite: shadow, glow, overlay ---------- */
      ctx.save();
      ctx.globalAlpha = p.opacity;
      const off = W * 3;
      if (p.shadow > 0) {
        ctx.shadowColor = `rgba(0,0,0,${Math.min(1, 0.95 * p.shadow + 0.1)})`; ctx.shadowBlur = (1.5 + 4 * p.shadow) * k;
        ctx.shadowOffsetX = off + k * 1.2 * p.shadow; ctx.shadowOffsetY = k * 1.2 * p.shadow;
        ctx.drawImage(src, -off, 0);
        if (p.shadow > 0.5) ctx.drawImage(src, -off, 0);
      }
      if (p.glow > 0) {
        ctx.shadowColor = U.rgba(col, Math.min(1, 0.4 + p.glow * 0.6)); ctx.shadowBlur = p.glow * 14 * k; ctx.shadowOffsetX = off; ctx.shadowOffsetY = 0;
        ctx.drawImage(src, -off, 0);
      }
      ctx.shadowColor = 'rgba(0,0,0,0)'; ctx.shadowBlur = 0; ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
      ctx.drawImage(src, 0, 0);
      ctx.restore();

      /* ---------- screen effects above the overlay ---------- */
      if (p.scan > 0) {
        const g = Math.max(2, p.scanGap * k), th = Math.max(1, g * 0.45);
        ctx.fillStyle = `rgba(0,0,0,${0.55 * p.scan})`;
        for (let y = 0; y < H; y += g) ctx.fillRect(0, Math.round(y), W, Math.round(th));
      }
      if (p.noise > 0) {
        const rnd = U.rng(p.seed), n = p.noise;
        // specks
        const count = Math.round(n * 2600 * (W * H) / (S * S) * 0.6);
        for (let i = 0; i < count; i++) {
          const x = rnd() * W, y = rnd() * H, s = Math.max(1, k * (0.6 + rnd() * 1.6)), lum = rnd() < 0.55 ? 255 : 0;
          ctx.fillStyle = `rgba(${lum},${lum},${lum},${(0.15 + rnd() * 0.45) * n})`; ctx.fillRect(x, y, s * (1 + rnd() * 2), s);
        }
        // dropout streaks
        const streaks = Math.round(n * 26);
        for (let i = 0; i < streaks; i++) {
          const y = rnd() * H, x = rnd() * W, len = W * (0.03 + rnd() * rnd() * 0.4), h = Math.max(1, k * (0.6 + rnd() * 1.4));
          const g = ctx.createLinearGradient(x, 0, x + len, 0);
          const a = (0.25 + rnd() * 0.5) * n;
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.3, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g; ctx.fillRect(x, y, len, h);
        }
        // tracking band: a jittery strip of noise near the bottom
        const ty = H * (0.86 + rnd() * 0.06), th = H * 0.035 * (0.6 + n);
        for (let y = ty; y < ty + th; y += Math.max(1, k)) {
          const f = 1 - Math.abs((y - ty) / th - 0.5) * 2;
          let x = -rnd() * W * 0.1;
          while (x < W) {
            const len = W * (0.01 + rnd() * 0.08), a = rnd() * 0.5 * f * n;
            if (rnd() < 0.6) { ctx.fillStyle = `rgba(230,230,230,${a})`; ctx.fillRect(x, y, len, Math.max(1, k)); }
            x += len + rnd() * W * 0.05;
          }
        }
      }
    },
  });

  // frame-line rectangle of a target aspect ratio fitted into the screen
  function cineRect(W, H, r) {
    let w = W, h = W / r;
    if (h > H) { h = H; w = H * r; }
    return [(W - w) / 2, (H - h) / 2, w, h];
  }
})();
