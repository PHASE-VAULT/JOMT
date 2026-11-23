/* Markers: HUD icons that mark world-space points of interest (quest objectives, waypoints, map pins,
   enemies, allies, loot, danger, capture points …). A body shape (circle, diamond, shield, hexagon,
   map pin, speech bubble, chevron, ring, target brackets …) carries a vector icon or a custom glyph
   (letters, numbers, ! ?), styled with solid / gradient / outline-only fill, outline, inset ring, gloss,
   glow and drop shadow, plus noise / grunge / edge wear / scratches from the shared wear stack; optional
   pulse rings and a ground base under pins.
   An optional animation (pulse, bob, spin, ping, blink) loops seamlessly and exports as a numbered PNG
   sequence; the preview box plays it. Everything is sized relative to the marker, so it fits any canvas. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp } = U;
  const TAU = Math.PI * 2;

  const SHAPES = [['circle', 'Circle'], ['diamond', 'Diamond'], ['shield', 'Shield'], ['hexagon', 'Hexagon'], ['square', 'Rounded square'],
    ['triangle', 'Triangle'], ['pin', 'Map pin'], ['bubble', 'Bubble with pointer'], ['chevron', 'Chevron (pointing down)'], ['ring', 'Ring'],
    ['brackets', 'Target brackets'], ['star', 'Star'], ['none', 'Icon only']];
  const ICONS = [['none', 'None'], ['dot', 'Dot'], ['exclaim', '! (exclamation)'], ['question', '? (question)'], ['glyph', 'Text / number'],
    ['star', 'Star'], ['skull', 'Skull'], ['plus', 'Plus / medic'], ['cross', 'Cross'], ['crosshair', 'Crosshair'], ['check', 'Check'],
    ['heart', 'Heart'], ['flag', 'Flag'], ['house', 'House'], ['bolt', 'Lightning'], ['eye', 'Eye'], ['arrow', 'Arrow down'],
    ['gear', 'Gear'], ['lock', 'Lock'], ['sword', 'Sword'], ['coin', 'Coin'], ['chest', 'Chest / loot'], ['person', 'Person']];
  const ANIMS = [['none', 'None (still)'], ['pulse', 'Pulse (breathe)'], ['bob', 'Bob up and down'], ['spin', 'Spin (coin flip)'], ['ping', 'Ping rings'], ['blink', 'Blink / glow pulse']];
  const animOn = (p) => p.anim !== 'none';
  const frameCount = (p) => Math.max(2, p.frames | 0);
  const hasBase = (p) => ['pin', 'chevron', 'bubble'].includes(p.shape);

  /* ---------- body shapes in units of the radius R, centered on (0, 0); y down ----------
     each returns the path (already begun) and its extents / icon placement */
  const poly = (c, pts, r) => U.polyPath(c, pts, r);
  const SH = {
    circle: (c) => { c.arc(0, 0, 1, 0, TAU); return { top: -1, bottom: 1, half: 1, iy: 0, is: 1 }; },
    square: (c) => { poly(c, [[-0.9, -0.9], [0.9, -0.9], [0.9, 0.9], [-0.9, 0.9]], 0.28); return { top: -0.9, bottom: 0.9, half: 0.9, iy: 0, is: 0.95 }; },
    diamond: (c) => { poly(c, [[0, -1.2], [1.2, 0], [0, 1.2], [-1.2, 0]], 0.12); return { top: -1.2, bottom: 1.2, half: 1.2, iy: 0, is: 0.78 }; },
    hexagon: (c) => { poly(c, Array.from({ length: 6 }, (_, i) => [Math.cos(-Math.PI / 2 + (i * TAU) / 6) * 1.08, Math.sin(-Math.PI / 2 + (i * TAU) / 6) * 1.08]), 0.1); return { top: -1.08, bottom: 1.08, half: 0.94, iy: 0, is: 0.9 }; },
    triangle: (c) => { poly(c, [[0, -1.2], [1.15, 0.85], [-1.15, 0.85]], 0.14); return { top: -1.2, bottom: 0.85, half: 1.15, iy: 0.22, is: 0.68 }; },
    shield: (c) => {
      c.moveTo(-0.92, -0.95); c.lineTo(0.92, -0.95); c.lineTo(0.92, 0.05);
      c.quadraticCurveTo(0.9, 0.78, 0, 1.18); c.quadraticCurveTo(-0.9, 0.78, -0.92, 0.05); c.closePath();
      return { top: -0.95, bottom: 1.18, half: 0.92, iy: -0.02, is: 0.85 };
    },
    pin: (c) => {
      // head circle (r 1) with tangents meeting at the tip (0, 2): tangent points at ±60° from straight down
      c.moveTo(0, 2); c.lineTo(Math.sin(Math.PI / 3), 0.5); c.arc(0, 0, 1, Math.PI / 6, (5 * Math.PI) / 6, true); c.closePath();
      return { top: -1, bottom: 2, half: 1, iy: 0, is: 0.82, tip: 2 };
    },
    bubble: (c) => {
      const a = Math.asin(0.36);
      c.moveTo(0, 1.5); c.lineTo(0.36, Math.cos(a)); c.arc(0, 0, 1, Math.PI / 2 - a, Math.PI / 2 + a, true); c.closePath();
      return { top: -1, bottom: 1.5, half: 1, iy: 0, is: 0.9, tip: 1.5 };
    },
    chevron: (c) => { poly(c, [[-1.1, -0.65], [0, 0.35], [1.1, -0.65], [1.1, 0.1], [0, 1.1], [-1.1, 0.1]], 0.08); return { top: -0.65, bottom: 1.1, half: 1.1, iy: -1.75, is: 0.75, tip: 1.1, iconAbove: true }; },
    ring: (c, p) => { const w = clamp(p.ringW, 0.08, 0.6); c.arc(0, 0, 1, 0, TAU); c.moveTo(1 - w, 0); c.arc(0, 0, 1 - w, 0, TAU, true); return { top: -1, bottom: 1, half: 1, iy: 0, is: 0.85 * (1 - w * 0.6) }; },
    brackets: (c, p) => {
      const L = 0.55, w = clamp(p.ringW, 0.08, 0.4);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x = sx, y = sy;
        // an L-shaped corner: outer corner at (x, y), arms toward the middle
        const pts = [[x, y], [x - sx * L, y], [x - sx * L, y - sy * w], [x - sx * w, y - sy * w], [x - sx * w, y - sy * L], [x, y - sy * L]];
        c.moveTo(pts[0][0], pts[0][1]); for (const q of pts.slice(1)) c.lineTo(q[0], q[1]); c.closePath();
      }
      return { top: -1, bottom: 1, half: 1, iy: 0, is: 0.8 };
    },
    star: (c) => { poly(c, Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 0.55 : 1.2, a = -Math.PI / 2 + (i * Math.PI) / 5; return [Math.cos(a) * r, Math.sin(a) * r + 0.08]; }), 0.06); return { top: -1.12, bottom: 1.05, half: 1.15, iy: 0.12, is: 0.5 }; },
    none: () => ({ top: -0.9, bottom: 0.9, half: 0.9, iy: 0, is: 1.55, empty: true }),
  };
  // outline-type bodies: the fill color draws the shape itself (no background behind the icon)
  const thin = (p) => p.shape === 'ring' || p.shape === 'brackets';

  /* ---------- icons, drawn in a 24 × 24 box on their own canvas (so holes can be cut) ---------- */
  const ICON = {
    dot: (c) => { c.beginPath(); c.arc(12, 12, 6, 0, TAU); c.fill(); },
    exclaim: (c) => { c.beginPath(); U.polyPath(c, [[10.2, 3], [13.8, 3], [13.2, 15], [10.8, 15]], 1.2); c.fill(); c.beginPath(); c.arc(12, 19, 2.1, 0, TAU); c.fill(); },
    star: (c) => { c.beginPath(); U.polyPath(c, Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 4.4 : 10.5, a = -Math.PI / 2 + (i * Math.PI) / 5; return [12 + Math.cos(a) * r, 13 + Math.sin(a) * r]; }), 0.6); c.fill(); },
    skull: (c) => {
      c.beginPath(); c.arc(12, 10.2, 8.2, 0, TAU); c.fill();
      c.beginPath(); U.polyPath(c, [[7.2, 13], [16.8, 13], [16.8, 20.8], [7.2, 20.8]], 1.6); c.fill();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath(); c.arc(8.7, 10.8, 2.5, 0, TAU); c.arc(15.3, 10.8, 2.5, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(12, 13.6); c.lineTo(10.7, 16); c.lineTo(13.3, 16); c.closePath(); c.fill();
      c.fillRect(10.1, 17.6, 1, 3.4); c.fillRect(12.9, 17.6, 1, 3.4);
      c.globalCompositeOperation = 'source-over';
    },
    plus: (c) => { c.beginPath(); U.polyPath(c, [[9.3, 3], [14.7, 3], [14.7, 9.3], [21, 9.3], [21, 14.7], [14.7, 14.7], [14.7, 21], [9.3, 21], [9.3, 14.7], [3, 14.7], [3, 9.3], [9.3, 9.3]], 0.8); c.fill(); },
    cross: (c) => { c.translate(12, 12); c.rotate(Math.PI / 4); c.translate(-12, -12); ICON.plus(c); },
    crosshair: (c) => {
      c.lineWidth = 2.4; c.beginPath(); c.arc(12, 12, 7, 0, TAU); c.stroke();
      c.lineCap = 'round'; c.beginPath();
      for (const [x0, y0, x1, y1] of [[12, 1.5, 12, 7.5], [12, 16.5, 12, 22.5], [1.5, 12, 7.5, 12], [16.5, 12, 22.5, 12]]) { c.moveTo(x0, y0); c.lineTo(x1, y1); }
      c.stroke(); c.beginPath(); c.arc(12, 12, 1.8, 0, TAU); c.fill();
    },
    check: (c) => { c.lineWidth = 3.8; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(4.5, 12.8); c.lineTo(9.8, 18); c.lineTo(19.5, 6.5); c.stroke(); },
    heart: (c) => { c.fill(new Path2D('M12 21l-1.4-1.3C5.4 15 2 11.9 2 8.1 2 5 4.4 2.5 7.5 2.5c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1 3.1 0 5.5 2.5 5.5 5.6 0 3.8-3.4 6.9-8.6 11.6z')); },
    flag: (c) => { c.fillRect(5, 2.5, 2.2, 19.5); c.beginPath(); c.moveTo(7.2, 3); c.lineTo(20.5, 3); c.lineTo(16.8, 8.3); c.lineTo(20.5, 13.6); c.lineTo(7.2, 13.6); c.closePath(); c.fill(); },
    house: (c) => { c.beginPath(); U.polyPath(c, [[12, 2.5], [22, 11.5], [19.2, 11.5], [19.2, 21], [14.4, 21], [14.4, 15], [9.6, 15], [9.6, 21], [4.8, 21], [4.8, 11.5], [2, 11.5]], 0.5); c.fill(); },
    bolt: (c) => { c.beginPath(); U.polyPath(c, [[14, 1.5], [4.5, 13.5], [11, 13.5], [9.6, 22.5], [19.5, 9.8], [12.9, 9.8]], 0.4); c.fill(); },
    eye: (c) => {
      c.beginPath(); c.moveTo(1.5, 12); c.quadraticCurveTo(12, 1, 22.5, 12); c.quadraticCurveTo(12, 23, 1.5, 12); c.fill();
      c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(12, 12, 4.6, 0, TAU); c.fill();
      c.globalCompositeOperation = 'source-over'; c.beginPath(); c.arc(12, 12, 2.6, 0, TAU); c.fill();
    },
    arrow: (c) => { c.beginPath(); U.polyPath(c, [[9, 2.5], [15, 2.5], [15, 11.5], [20.5, 11.5], [12, 21.5], [3.5, 11.5], [9, 11.5]], 0.6); c.fill(); },
    gear: (c) => {
      const pts = [];
      for (let i = 0; i < 8; i++) for (const [da, r] of [[-0.2, 7.4], [-0.11, 10.4], [0.11, 10.4], [0.2, 7.4]]) { const a = ((i + 0.5) / 8) * TAU + da * 2; pts.push([12 + Math.cos(a) * r, 12 + Math.sin(a) * r]); }
      c.beginPath(); U.polyPath(c, pts, 0.5); c.fill();
      c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(12, 12, 3.3, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over';
    },
    lock: (c) => {
      c.lineWidth = 2.6; c.beginPath(); c.moveTo(7.6, 11.5); c.lineTo(7.6, 8); c.arc(12, 8, 4.4, Math.PI, 0); c.lineTo(16.4, 11.5); c.stroke();
      c.beginPath(); U.polyPath(c, [[4.5, 10.5], [19.5, 10.5], [19.5, 21.5], [4.5, 21.5]], 2); c.fill();
      c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(12, 15, 1.8, 0, TAU); c.fill(); c.fillRect(11.2, 15, 1.6, 3.8); c.globalCompositeOperation = 'source-over';
    },
    sword: (c) => {
      c.translate(12, 12); c.rotate(Math.PI / 4); c.translate(-12, -12);
      c.beginPath(); c.moveTo(12, 0.8); c.lineTo(14.1, 4); c.lineTo(14.1, 15.2); c.lineTo(9.9, 15.2); c.lineTo(9.9, 4); c.closePath(); c.fill();
      c.beginPath(); U.polyPath(c, [[6.2, 15.2], [17.8, 15.2], [17.8, 17.4], [6.2, 17.4]], 1); c.fill();
      c.fillRect(10.9, 17.4, 2.2, 3.6); c.beginPath(); c.arc(12, 22, 1.6, 0, TAU); c.fill();
    },
    coin: (c) => {
      c.beginPath(); c.arc(12, 12, 10, 0, TAU); c.fill();
      c.globalCompositeOperation = 'destination-out';
      c.lineWidth = 1.2; c.beginPath(); c.arc(12, 12, 7.9, 0, TAU); c.stroke();
      c.font = '800 12px system-ui, "Segoe UI", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('$', 12, 12.6);
      c.globalCompositeOperation = 'source-over';
    },
    chest: (c) => {
      c.beginPath(); U.polyPath(c, [[2.5, 4.5], [21.5, 4.5], [21.5, 10], [2.5, 10]], 2.4); c.fill();
      c.beginPath(); U.polyPath(c, [[2.5, 11.2], [21.5, 11.2], [21.5, 21], [2.5, 21]], 1.4); c.fill();
      c.globalCompositeOperation = 'destination-out'; c.fillRect(10.3, 8.6, 3.4, 4.6); c.globalCompositeOperation = 'source-over';
      c.fillRect(11.1, 9.4, 1.8, 3);
    },
    person: (c) => { c.beginPath(); c.arc(12, 7, 4.4, 0, TAU); c.fill(); c.beginPath(); c.ellipse(12, 21.5, 8.2, 8.5, 0, Math.PI, TAU); c.fill(); },
  };
  const textIcon = (c, txt) => {
    const s = String(txt || '').slice(0, 3) || '?';
    const fs = s.length === 1 ? 20 : s.length === 2 ? 15 : 11.5;
    c.font = `800 ${fs}px system-ui, "Segoe UI", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    const m = c.measureText(s), asc = m.actualBoundingBoxAscent || fs * 0.72, desc = m.actualBoundingBoxDescent || 0;
    c.fillText(s, 12, 12 + (asc - desc) / 2);
  };
  function iconCanvas(p, px, color) {
    const n = Math.max(4, Math.ceil(px * 1.25)), c = U.canvas(n, n), g = c.getContext('2d'), k = px / 24;
    g.translate((n - px) / 2, (n - px) / 2); g.scale(k, k);
    g.fillStyle = color; g.strokeStyle = color;
    if (p.icon === 'question') textIcon(g, '?');
    else if (p.icon === 'glyph') textIcon(g, p.glyph);
    else if (ICON[p.icon]) ICON[p.icon](g);
    return c;
  }

  U.register({
    id: 'marker',
    name: 'Marker',
    desc: 'HUD markers for world-space points of interest: objective, waypoint, map pin, enemy, loot and capture-point icons',
    uses: [
      'Screen-space markers that float over world positions in the HUD: quest objectives, waypoints, enemies, allies, loot, danger zones or capture points, optionally worn and grungy, or animated as a looping PNG sequence.',
      'Map and minimap pins, compass-bar icons and point-of-interest symbols for menus and level select screens.',
    ],
    tags: ['UI', 'Shooter', 'Military'],
    aspect: '1:1',
    normalMap: false,
    exportLayers: (p) => (animOn(p) && p.exportFrames ? Array.from({ length: frameCount(p) }, (_, i) => ({ id: 'frame' + i, suffix: 'f' + String(i).padStart(2, '0') })) : null),
    icon: U.icon('<path d="M12 21s-6-5.6-6-10.5a6 6 0 0 1 12 0C18 15.4 12 21 12 21z"/><path d="M12 7.5v3.5"/><circle cx="12" cy="13.3" r=".6" fill="currentColor"/>'),
    params: [
      { type: 'section', label: 'Marker' },
      { key: 'shape', label: 'Shape', type: 'select', default: 'diamond', options: SHAPES },
      { key: 'size', label: 'Size', type: 'range', min: 0.3, max: 1, step: 0.01, default: 0.86, tip: 'How much of the image the marker (with its extras) fills' },
      { key: 'ringW', label: 'Line width', type: 'range', min: 0.08, max: 0.5, step: 0.01, default: 0.2, show: (p) => thin(p), tip: 'Thickness of the ring / bracket arms' },
      { key: 'icon', label: 'Icon', type: 'select', default: 'exclaim', options: ICONS },
      { key: 'glyph', label: 'Text', type: 'text', default: 'A', max: 3, placeholder: 'A', show: (p) => p.icon === 'glyph', tip: 'Up to 3 characters: a letter, number or sign' },
      { key: 'iconSize', label: 'Icon size', type: 'range', min: 0.3, max: 1.5, step: 0.01, default: 1, show: (p) => p.icon !== 'none' },
      { key: 'iconColor', label: 'Icon color', type: 'color', default: '#1b1306', show: (p) => p.icon !== 'none' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7, tip: 'Seed of the noise and grunge' },
      { key: 'iconShadow', label: 'Icon shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.icon !== 'none', tip: 'Soft dark shadow under the icon (readability on light bodies)' },

      { type: 'section', label: 'Style' },
      { key: 'fill', label: 'Fill', type: 'select', default: 'gradient', options: [['solid', 'Solid'], ['gradient', 'Gradient (top → bottom)'], ['outline', 'Outline only (hologram)']], show: (p) => p.shape !== 'none' },
      { key: 'color', label: 'Color', type: 'color', default: '#ffc83d' },
      { key: 'color2', label: 'Bottom color', type: 'color', default: '#ff9500', show: (p) => p.fill === 'gradient' && p.shape !== 'none' },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 0.3, step: 0.005, default: 0.08, tip: 'Relative to the marker size' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#1b1306', show: (p) => p.outline > 0 },
      { key: 'inset', label: 'Inset ring', type: 'range', min: 0, max: 0.15, step: 0.005, default: 0, show: (p) => p.shape !== 'none' && !thin(p), tip: 'A thin line inside the edge' },
      { key: 'insetColor', label: 'Inset ring color', type: 'color', default: '#ffffff', show: (p) => p.inset > 0 },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'glowColor', label: 'Glow color', type: 'color', default: '#ffc83d', show: (p) => p.glow > 0 },
      { key: 'shadow', label: 'Drop shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },

      { type: 'section', label: 'Shading', active: (p) => p.bevel > 0 || p.innerShadow > 0 || p.specular > 0 },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'angled', options: [['angled', 'Angled (light angle)'], ['ambient', 'Ambient (soft, no direction)']], show: (p) => p.shape !== 'none', tip: 'Ambient: soft light from all around: the bevel and inner shadow run evenly along the whole edge and the specular becomes a soft sheen in the middle' },
      { key: 'shadeLight', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -120, show: (p) => p.shape !== 'none' && p.lightMode !== 'ambient', tip: 'Where the light comes from for bevel and specular (-90 = from above, -135 = top left)' },
      { key: 'gloss', label: 'Gloss', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.shape !== 'none' && p.fill !== 'outline' },
      { key: 'bevel', label: 'Bevel', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.shape !== 'none', tip: 'Raised edge: light rim on the lit side, dark rim on the far side' },
      { key: 'bevelSize', label: 'Bevel width', type: 'range', min: 0.02, max: 0.4, step: 0.01, default: 0.12, show: (p) => p.shape !== 'none' && p.bevel > 0 },
      { key: 'innerShadow', label: 'Inner shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.shape !== 'none', tip: 'Soft shadow along the inside of the edge: a pressed-in / glassy look' },
      { key: 'specular', label: 'Specular highlight', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.shape !== 'none' && p.fill !== 'outline', tip: 'A bright spot toward the light' },
      { key: 'shadeIcon', label: 'Shade the icon too', type: 'bool', default: false, show: (p) => p.shape !== 'none' && p.icon !== 'none' && (p.bevel > 0 || p.innerShadow > 0), tip: 'Off: bevel and inner shadow sit under the icon. On: the icon is drawn first and gets the same light' },

      { type: 'section', label: 'Extras', active: (p) => p.rings > 0 || p.base > 0 },
      { key: 'rings', label: 'Pulse rings', type: 'int', min: 0, max: 3, default: 0, tip: 'Rings around the marker (on the ground under pins); they expand with the Ping / Pulse animation. Ping uses 3 rings when this is 0' },
      { key: 'ringColor', label: 'Ring color', type: 'color', default: '#ffc83d', show: (p) => p.rings > 0 || p.anim === 'ping' },
      { key: 'base', label: 'Ground base', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: hasBase, tip: 'Soft ellipse on the ground under the pin / pointer' },

      ...U.wearParams(),

      { type: 'section', label: 'Animation', active: animOn },
      { key: 'anim', label: 'Animation', type: 'select', default: 'none', options: ANIMS, tip: 'A seamless loop; turn on the frame export to download it as PNGs' },
      { key: 'amount', label: 'Strength', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: animOn },
      { key: 'exportFrames', label: 'Export frame sequence', type: 'bool', default: true, show: animOn, tip: 'Download the loop as numbered PNGs (_f00, _f01 …). Off: one still image' },
      { key: 'frames', label: 'Frames', type: 'int', min: 4, max: 120, default: 30, show: animOn },
      { key: 'fps', label: 'Playback FPS', type: 'int', min: 4, max: 60, default: 30, show: animOn, tip: 'Preview speed; use the same rate in the engine' },
      { key: 'previewFrame', label: 'Still frame', type: 'int', min: 0, max: 120, default: 0, show: animOn, tip: 'Which frame the big preview (and a still export) shows' },
    ],
    presets: [
      { name: 'Quest objective', group: 'Game', values: {} },
      { name: 'Main quest (shield)', group: 'Game', values: { shape: 'shield', icon: 'star', color: '#ffd24a', color2: '#e08a00', inset: 0.05, insetColor: '#fff2c0', glow: 0.35 } },
      { name: 'Side quest', group: 'Game', values: { icon: 'question', color: '#e9eef5', color2: '#9aa8b8', outlineColor: '#141a22', iconColor: '#141a22' } },
      { name: 'Waypoint pin', group: 'Game', values: { shape: 'pin', icon: 'dot', color: '#3ad7ff', color2: '#0a8fd8', outlineColor: '#05233a', iconColor: '#ffffff', base: 0.6, rings: 2, ringColor: '#3ad7ff' } },
      { name: 'Map pin (red)', group: 'Game', values: { shape: 'pin', icon: 'dot', color: '#ff4a4a', color2: '#c41818', outlineColor: '#3a0606', iconColor: '#ffffff', base: 0.5 } },
      { name: 'Waypoint chevron', group: 'Game', values: { shape: 'chevron', icon: 'none', color: '#ffffff', color2: '#c9d6e3', outline: 0.06, outlineColor: '#0b1520', gloss: 0, base: 0 } },
      { name: 'Enemy', group: 'Game', values: { shape: 'triangle', icon: 'skull', iconSize: 1.05, color: '#ff4040', color2: '#b00010', outlineColor: '#2a0004', iconColor: '#fff4f4', glow: 0.25, glowColor: '#ff2020' } },
      { name: 'Boss', group: 'Game', values: { shape: 'shield', icon: 'skull', color: '#d81a2a', color2: '#5a0008', outlineColor: '#1a0002', iconColor: '#ffe6c0', inset: 0.05, insetColor: '#ffb070', glow: 0.6, glowColor: '#ff3020' } },
      { name: 'Ally', group: 'Game', values: { shape: 'circle', icon: 'person', color: '#4aa8ff', color2: '#1a5fd8', outlineColor: '#04183a', iconColor: '#ffffff' } },
      { name: 'Loot', group: 'Game', values: { shape: 'hexagon', icon: 'chest', iconSize: 0.9, color: '#c070ff', color2: '#6a20c8', outlineColor: '#1c0638', iconColor: '#fff4ff', glow: 0.4, glowColor: '#b060ff' } },
      { name: 'Shop / trader', group: 'Game', values: { shape: 'circle', icon: 'coin', color: '#ffe066', color2: '#d8a000', iconColor: '#5a3a00' } },
      { name: 'Home base', group: 'Game', values: { shape: 'square', icon: 'house', color: '#5fe36a', color2: '#1e9a3a', outlineColor: '#06240c', iconColor: '#ffffff' } },
      { name: 'Danger zone', group: 'Game', values: { shape: 'triangle', icon: 'exclaim', color: '#ffd400', color2: '#ff9a00', outlineColor: '#201400', iconColor: '#201400' } },
      { name: 'Medic', group: 'Game', values: { shape: 'circle', icon: 'plus', iconSize: 0.95, color: '#ffffff', color2: '#dfe5ea', outlineColor: '#7a0a0a', iconColor: '#e01818' } },
      { name: 'Locked', group: 'Game', values: { shape: 'circle', icon: 'lock', iconSize: 0.85, color: '#9aa3ad', color2: '#5c646d', outlineColor: '#12161a', iconColor: '#12161a', gloss: 0.2, shadow: 0.3 } },
      { name: 'Completed', group: 'Game', values: { shape: 'circle', icon: 'check', color: '#4ce07a', color2: '#169a42', outlineColor: '#04240e', iconColor: '#ffffff' } },
      { name: 'Capture point A', group: 'Shooter', values: { shape: 'hexagon', icon: 'glyph', glyph: 'A', fill: 'solid', color: '#2a8cff', outline: 0.07, outlineColor: '#ffffff', iconColor: '#ffffff', gloss: 0 } },
      { name: 'Defend B', group: 'Shooter', values: { shape: 'shield', icon: 'glyph', glyph: 'B', fill: 'solid', color: '#ff3a3a', outline: 0.07, outlineColor: '#ffffff', iconColor: '#ffffff', gloss: 0 } },
      { name: 'Target lock', group: 'Shooter', values: { shape: 'brackets', ringW: 0.16, icon: 'crosshair', iconSize: 0.75, fill: 'solid', color: '#ff3030', outline: 0.03, outlineColor: '#200000', iconColor: '#ff3030', gloss: 0, glow: 0.45, glowColor: '#ff2020', shadow: 0 } },
      { name: 'Ping', group: 'Shooter', values: { shape: 'ring', ringW: 0.2, icon: 'dot', iconSize: 0.7, fill: 'solid', color: '#ffb000', outline: 0.04, iconColor: '#ffb000', gloss: 0, rings: 2, ringColor: '#ffb000', glow: 0.3, glowColor: '#ffb000', anim: 'ping', frames: 40 } },
      { name: 'Spotted enemy', group: 'Shooter', values: { shape: 'chevron', icon: 'none', fill: 'solid', color: '#ff2a2a', outline: 0.05, outlineColor: '#1a0000', gloss: 0, base: 0, shadow: 0.3 } },
      { name: 'Hologram objective', group: 'Sci-fi', values: { shape: 'diamond', icon: 'exclaim', fill: 'outline', color: '#36f0ff', outline: 0.07, outlineColor: '#36f0ff', iconColor: '#36f0ff', glow: 0.8, glowColor: '#00d8ff', shadow: 0 } },
      { name: 'Hologram waypoint', group: 'Sci-fi', values: { shape: 'pin', icon: 'bolt', fill: 'outline', color: '#7dffb0', outline: 0.07, outlineColor: '#7dffb0', iconColor: '#7dffb0', glow: 0.8, glowColor: '#30ff90', shadow: 0, base: 0.7, rings: 1, ringColor: '#30ff90' } },
      { name: 'Scanner POI', group: 'Sci-fi', values: { shape: 'brackets', ringW: 0.12, icon: 'eye', iconSize: 0.8, fill: 'solid', color: '#ffb84d', outline: 0, iconColor: '#ffb84d', gloss: 0, glow: 0.5, glowColor: '#ff9a00', shadow: 0 } },
      { name: 'Fantasy quest', group: 'Fantasy', values: { shape: 'shield', icon: 'sword', iconSize: 0.95, color: '#e8c070', color2: '#8a5a20', outline: 0.07, outlineColor: '#2a1806', inset: 0.045, insetColor: '#fff0c8', iconColor: '#2a1806', gloss: 0.45 } },
      { name: 'Heart pickup', group: 'Fantasy', values: { shape: 'none', icon: 'heart', color: '#ff3a5a', iconColor: '#ff3a5a', outline: 0.1, outlineColor: '#3a0010', glow: 0.5, glowColor: '#ff3a5a' } },
      { name: 'Beveled objective', group: 'Shaded', values: { bevel: 0.8, bevelSize: 0.14, specular: 0.5, gloss: 0.15 } },
      { name: 'Glass orb waypoint', group: 'Shaded', values: { shape: 'circle', icon: 'dot', color: '#7fd8ff', color2: '#1a6ad8', outlineColor: '#041a3a', iconColor: '#ffffff', innerShadow: 0.7, specular: 0.9, gloss: 0.5, glow: 0.3, glowColor: '#4ac8ff' } },
      { name: 'Embossed shield', group: 'Shaded', values: { shape: 'shield', icon: 'star', color: '#c8ccd2', color2: '#6a7078', outlineColor: '#15181c', iconColor: '#2a2e34', bevel: 1, bevelSize: 0.18, innerShadow: 0.3, gloss: 0.1, shadeIcon: true } },
      { name: 'Pressed button marker', group: 'Shaded', values: { shape: 'square', icon: 'house', color: '#5fe36a', color2: '#1e9a3a', outlineColor: '#06240c', iconColor: '#ffffff', innerShadow: 0.85, gloss: 0, specular: 0.25 } },
      { name: 'Battle-worn objective', group: 'Worn', values: { grunge: 0.45, grungeType: 'chipped', grungeScale: 8, edgeWear: 0.6, dirt: 0.35, scratches: 0.3, seed: 12 } },
      { name: 'Rusty danger sign', group: 'Worn', values: { shape: 'triangle', icon: 'exclaim', color: '#e8b400', color2: '#a86a00', outlineColor: '#1a1000', iconColor: '#1a1000', gloss: 0.1, colorNoise: 0.5, noiseColor: '#5a2a0a', noiseScale: 7, grunge: 0.35, grungeType: 'blotchy', edgeWear: 0.5, dirt: 0.5, dirtColor: '#3a1a08', scratches: 0.25, seed: 4 } },
      { name: 'Stencil spray marker', group: 'Worn', values: { shape: 'circle', icon: 'glyph', glyph: 'A', fill: 'solid', color: '#f2f2f2', outline: 0, iconColor: '#1a1a1a', gloss: 0, shadow: 0.15, distort: 0.25, distortScale: 10, grunge: 0.5, grungeType: 'speckle', grungeScale: 22, edgeWear: 0.4, seed: 9 } },
      { name: 'Faded map pin', group: 'Worn', values: { shape: 'pin', icon: 'dot', color: '#d84a3a', color2: '#8a2418', outlineColor: '#2a0a06', iconColor: '#f4e6d0', base: 0.4, brightNoise: 0.4, noiseScale: 5, grunge: 0.3, grungeType: 'streaks', edgeWear: 0.35, dirt: 0.4, dirtColor: '#3a2410', seed: 21 } },
      { name: 'Pulsing objective', group: 'Animated', values: { anim: 'pulse', glow: 0.4, rings: 1 } },
      { name: 'Bobbing waypoint pin', group: 'Animated', values: { shape: 'pin', icon: 'dot', color: '#3ad7ff', color2: '#0a8fd8', outlineColor: '#05233a', iconColor: '#ffffff', base: 0.6, anim: 'bob', amount: 0.6, frames: 40 } },
      { name: 'Spinning coin', group: 'Animated', values: { shape: 'circle', icon: 'coin', color: '#ffe066', color2: '#d8a000', iconColor: '#5a3a00', anim: 'spin', frames: 36 } },
      { name: 'Radar ping', group: 'Animated', values: { shape: 'ring', ringW: 0.2, icon: 'dot', iconSize: 0.7, fill: 'solid', color: '#ffb000', outline: 0.04, iconColor: '#ffb000', gloss: 0, rings: 3, ringColor: '#ffb000', glow: 0.3, glowColor: '#ffb000', anim: 'ping', frames: 45 } },
      { name: 'Blinking danger', group: 'Animated', values: { shape: 'triangle', icon: 'exclaim', color: '#ff3030', color2: '#b00000', outlineColor: '#200000', iconColor: '#ffffff', glow: 0.8, glowColor: '#ff2020', anim: 'blink', frames: 24 } },
    ],
    render(ctx, W, H, p, opts) {
      opts = opts || {};
      const N = frameCount(p), fm = typeof opts.layer === 'string' && /^frame(\d+)$/.exec(opts.layer);
      const t = animOn(p) ? (fm ? +fm[1] : Math.min(Math.max(0, p.previewFrame | 0), N - 1)) / N : 0;
      const A = animOn(p) ? p.amount : 0, wave = Math.sin(TAU * t), S = Math.min(W, H);

      // shape metrics (path built on a scratch context)
      const shapeFn = SH[p.shape] || SH.circle;
      const scratch = U.canvas(2, 2).getContext('2d'); scratch.beginPath();
      const m = shapeFn(scratch, p);
      const base = hasBase(p) && m.tip != null ? p.base : 0;
      // the Ping animation always has rings to move (3 when none are set)
      const nRings = p.rings > 0 ? p.rings : p.anim === 'ping' ? 3 : 0;
      const ringR = nRings > 0 ? 1.75 : 0;

      /* ---------- fit: extents in units of R ---------- */
      const bob = p.anim === 'bob' ? A * 0.3 : 0, pulse = p.anim === 'pulse' ? A * 0.12 : 0;
      const pad = 0.12 + p.glow * 0.35 + p.shadow * 0.18 + p.outline + p.distort * 0.15;
      let top = Math.min(m.top, m.iconAbove && p.icon !== 'none' ? m.iy - 0.62 * m.is * p.iconSize : m.top) * (1 + pulse) - bob - pad;
      let bottom = m.bottom * (1 + pulse) + pad + (base > 0 ? 0.2 : 0);
      const ringOnGround = m.tip != null;
      if (ringR) { if (ringOnGround) bottom = Math.max(bottom, m.tip + ringR * 0.38); else { top = Math.min(top, -ringR); bottom = Math.max(bottom, ringR); } }
      const half = Math.max(m.half * (1 + pulse) + pad, ringR);
      const R = Math.min((H * 0.96) / (bottom - top), (W * 0.96) / (2 * half)) * p.size;
      const cx = W / 2, cy = H / 2 - ((top + bottom) / 2) * R; // body center

      const col = U.hex(p.color), css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
      const blinkK = p.anim === 'blink' ? 0.5 + 0.5 * Math.cos(TAU * t) : 1;

      /* ---------- ground base + pulse rings (behind the marker, never worn) ---------- */
      ctx.save();
      ctx.translate(cx, cy);
      if (base > 0) {
        const gy = m.tip * R, sc = 1 - bob * 0.6 * (0.5 - 0.5 * wave);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R * 0.55 * sc);
        g.addColorStop(0, `rgba(0,0,0,${0.55 * base})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save(); ctx.translate(0, gy); ctx.scale(1, 0.32); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R * 0.55 * sc, 0, TAU); ctx.fill(); ctx.restore();
      }
      if (nRings > 0) {
        const rc = U.hex(p.ringColor), moving = p.anim === 'ping' || p.anim === 'pulse';
        ctx.save();
        if (ringOnGround) { ctx.translate(0, m.tip * R); ctx.scale(1, 0.38); }
        for (let i = 0; i < nRings; i++) {
          const ph = moving ? U.mod(t + i / nRings, 1) : (i + 1) / (nRings + 1);
          const r = R * lerp(1.05, ringR, ph), a = (moving ? Math.pow(1 - ph, 1.3) : 1 - ph * 0.7) * 0.85;
          ctx.strokeStyle = css(rc, a); ctx.lineWidth = Math.max(1, R * 0.07 * (1 - ph * 0.5));
          ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();

      /* ---------- the marker body + icon, on their own layer (so wear can be applied to it) ---------- */
      let L = U.canvas(W, H);
      const g = L.getContext('2d');
      const by = -bob * R * (1 - Math.cos(TAU * t)); // bob: rises and falls back
      const sx = p.anim === 'spin' ? Math.cos(TAU * t) : 1, sc = 1 + pulse * wave;
      g.save();
      g.translate(cx, cy + by);
      g.scale(R * sc * (Math.abs(sx) < 0.04 ? 0.04 * Math.sign(sx || 1) : sx), R * sc);
      const body = () => { g.beginPath(); shapeFn(g, p); };
      let bodyShade = null; // bevel / inner shadow / specular (drawn before or after the icon)
      const u = 1 / R; // one pixel in body units
      if (!m.empty) {
        // outline: a wide stroke under the fill
        if (p.outline > 0) { g.lineJoin = 'round'; g.strokeStyle = p.outlineColor; g.lineWidth = p.outline * 2; body(); g.stroke(); }
        const outlineOnly = p.fill === 'outline' && !thin(p);
        if (outlineOnly) { g.fillStyle = css(col, 0.16); body(); g.fill('evenodd'); g.strokeStyle = p.color; g.lineWidth = Math.max(u * 1.5, 0.09); body(); g.stroke(); }
        else {
          if (p.fill === 'gradient') { const gr = g.createLinearGradient(0, m.top, 0, m.bottom); gr.addColorStop(0, p.color); gr.addColorStop(1, p.color2); g.fillStyle = gr; } else g.fillStyle = p.color;
          body(); g.fill('evenodd');
        }
        // inset ring: the same outline, shrunk toward the middle
        if (p.inset > 0 && !thin(p)) {
          g.save(); const k = 1 - p.inset * 2.6; g.translate(0, ((m.top + m.bottom) / 2) * (1 - k)); g.scale(k, k);
          g.strokeStyle = p.insetColor; g.lineWidth = p.inset / k; body(); g.stroke(); g.restore();
        }
        bodyShade = () => {
          // ambient light (from all around): no direction, so every offset below is zero
          const ambient = p.lightMode === 'ambient';
          const la = (p.shadeLight ?? -120) * Math.PI / 180, lx = ambient ? 0 : Math.cos(la), ly = ambient ? 0 : Math.sin(la);
          // bevel: the outline shifted toward / away from the light and clipped to the body leaves a light
          // rim on the lit side and a dark rim on the far side
          if (p.bevel > 0 && ambient) {
            // ambient: an even raised edge all round, a dark rim at the very edge and a light band just inside it
            const b = p.bevelSize;
            g.save(); body(); g.clip('evenodd'); g.lineJoin = 'round';
            g.lineWidth = b * 2; g.strokeStyle = `rgba(255,255,255,${0.45 * p.bevel})`; body(); g.stroke();
            g.lineWidth = b * 0.9; g.strokeStyle = `rgba(0,0,0,${0.45 * p.bevel})`; body(); g.stroke();
            g.restore();
          } else if (p.bevel > 0) {
            const b = p.bevelSize;
            g.save(); body(); g.clip('evenodd'); g.lineJoin = 'round'; g.lineWidth = b * 2;
            g.save(); g.translate(lx * b * 0.55, ly * b * 0.55); g.strokeStyle = `rgba(0,0,0,${0.55 * p.bevel})`; body(); g.stroke(); g.restore();
            g.save(); g.translate(-lx * b * 0.55, -ly * b * 0.55); g.strokeStyle = `rgba(255,255,255,${0.6 * p.bevel})`; body(); g.stroke(); g.restore();
            g.restore();
          }
          // inner shadow: a blurred dark ring just inside the edge, offset away from the light
          if (p.innerShadow > 0) {
            g.save(); body(); g.clip('evenodd');
            g.shadowColor = `rgba(0,0,0,${0.8 * p.innerShadow})`; g.shadowBlur = R * 0.22; g.shadowOffsetX = -lx * R * 0.05; g.shadowOffsetY = -ly * R * 0.05;
            g.beginPath(); g.rect(-4, -4, 8, 8); shapeFn(g, p); g.fillStyle = '#000'; g.fill('evenodd');
            g.restore();
          }
          // specular: a soft bright spot toward the light (ambient: a dimmer, wider sheen in the middle)
          if (p.specular > 0 && !outlineOnly) {
            g.save(); body(); g.clip('evenodd');
            const sk = ambient ? 0.55 * p.specular : p.specular;
            const sx0 = lx * m.half * 0.42, sy0 = ly * (m.bottom - m.top) * 0.24 + (m.top + m.bottom) / 2 * 0.3, rs = Math.min(m.half, (m.bottom - m.top) / 2) * (ambient ? 0.75 : 0.55);
            const gr = g.createRadialGradient(sx0, sy0, 0, sx0, sy0, rs);
            gr.addColorStop(0, `rgba(255,255,255,${0.85 * sk})`); gr.addColorStop(0.35, `rgba(255,255,255,${0.3 * sk})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr; g.fillRect(-m.half - 1, m.top - 1, 2 * m.half + 2, m.bottom - m.top + 2);
            g.restore();
          }
        };
        if (!(p.shadeIcon && p.icon !== 'none')) bodyShade();
        // gloss: soft light over the upper half
        if (p.gloss > 0 && !outlineOnly) {
          g.save(); body(); g.clip('evenodd');
          const gr = g.createLinearGradient(0, m.top, 0, (m.top + m.bottom) / 2);
          gr.addColorStop(0, `rgba(255,255,255,${0.55 * p.gloss})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.fillRect(-m.half - 1, m.top - 1, 2 * m.half + 2, (m.bottom - m.top) / 2 + 1);
          g.restore();
        }
      }
      g.restore();
      // icon
      if (p.icon !== 'none') {
        const px = R * sc * m.is * p.iconSize * 1.25, ic = iconCanvas(p, px, m.empty ? p.color : p.iconColor);
        const icx = cx, icy = cy + by + m.iy * R * sc, w = ic.width * Math.abs(sx || 1), h = ic.height;
        g.save();
        if (m.empty && p.outline > 0) { // icon-only marker: the outline is drawn around the icon itself
          const oc = iconCanvas(p, px, p.outlineColor), o = p.outline * R * 0.6;
          for (let a = 0; a < 16; a++) g.drawImage(oc, icx - w / 2 + Math.cos((a / 16) * TAU) * o, icy - h / 2 + Math.sin((a / 16) * TAU) * o, w, h);
        }
        if (p.iconShadow > 0) { g.shadowColor = `rgba(0,0,0,${0.7 * p.iconShadow})`; g.shadowBlur = R * 0.12; g.shadowOffsetY = R * 0.04; }
        g.drawImage(ic, icx - w / 2, icy - h / 2, w, h);
        g.restore();
      }

      if (bodyShade && p.shadeIcon && p.icon !== 'none') {
        g.save(); g.translate(cx, cy + by); g.scale(R * sc * (Math.abs(sx) < 0.04 ? 0.04 * Math.sign(sx || 1) : sx), R * sc); bodyShade(); g.restore();
      }

      /* ---------- wear: noise, distortion, grunge, edge wear, dirt, scratches ---------- */
      if (U.wearActive(p)) {
        const F = U.wearFields(W, H, p, S, L);
        L = U.imageCanvas(U.wearApply(L, p, F));
        U.wearScratches(L.getContext('2d'), W, H, p, S);
      }

      /* ---------- composite: drop shadow and glow follow the (worn) layer ---------- */
      const far = W * 4; // shadows are cast from an off-canvas copy, so only the shadow lands on the canvas
      if (p.shadow > 0) {
        ctx.save(); ctx.shadowColor = `rgba(0,0,0,${0.75 * p.shadow})`; ctx.shadowBlur = R * 0.18 * p.shadow + 1;
        ctx.shadowOffsetX = far; ctx.shadowOffsetY = R * 0.07 * p.shadow; ctx.drawImage(L, -far, 0); ctx.restore();
      }
      if (p.glow > 0) {
        ctx.save(); ctx.shadowColor = css(U.hex(p.glowColor), clamp(p.glow * blinkK)); ctx.shadowBlur = R * 0.55 * p.glow;
        ctx.shadowOffsetX = far; ctx.drawImage(L, -far, 0); ctx.drawImage(L, -far, 0); ctx.restore();
      }
      ctx.drawImage(L, 0, 0);
      if (p.anim === 'blink' && blinkK < 1) {
        // blink: the whole marker dims (down to 35 %)
        ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = `rgba(0,0,0,${0.35 + 0.65 * (A > 0 ? lerp(1, blinkK, A) : 1)})`; ctx.fillRect(0, 0, W, H); ctx.restore();
      }
    },
  });
})();
