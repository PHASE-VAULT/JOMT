/* Alien / artifact texture: each configured shape ("stamp") is scattered N times; positions are random and
   size / rotation / gray value can be jittered per copy. Copies wrap at the edges so the result tiles.
   Grayscale only (smoothness / roughness / height masks), with a final remap pass. */
(function () {
  'use strict';
  const U = window.UGTG;
  const is = (...l) => (s) => l.includes(s.type);
  const DEG = Math.PI / 180;

  const ngon = (n, r) => Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i * U.TAU) / n;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });

  // path for one stamp centered at (x, y); w/h in px, rot in radians, arc = arc length in radians
  function stampPath(g, s, x, y, w, h, rot, arc) {
    g.beginPath();
    switch (s.type) {
      case 'circle': g.ellipse(x, y, w / 2, h / 2, rot, 0, U.TAU); break;
      case 'arc': g.ellipse(x, y, w / 2, h / 2, rot, 0, arc); break;
      case 'rect': U.polyPath(g, U.rotPts([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]], x, y, rot)); break;
      case 'hex': U.polyPath(g, U.rotPts(ngon(6, w / 2), x, y, rot)); break;
      case 'triangle': U.polyPath(g, U.rotPts(ngon(3, w / 2), x, y, rot)); break;
      case 'line': { const c = (Math.cos(rot) * w) / 2, d = (Math.sin(rot) * w) / 2; g.moveTo(x - c, y - d); g.lineTo(x + c, y + d); break; }
    }
  }

  const gray = (v) => { const c = Math.round(U.clamp(v) * 255); return `rgb(${c},${c},${c})`; };

  // draw all copies of one stamp into g (wrapped across the W×H tile)
  function drawStamp(g, s, si, W, H, p, k) {
    const S = Math.min(W, H), rnd = U.rng(p.seed + si * 7919);
    const outline = s.type === 'line' || s.type === 'arc' || s.mode === 'outline';
    const hr = s.type === 'circle' || s.type === 'arc' || s.type === 'rect' ? s.aspect : 1;
    g.globalAlpha = s.opacity;
    g.lineWidth = s.strokeW * k;
    for (let i = 0; i < s.count; i++) {
      // fixed number of draws per copy so changing one option never reshuffles positions
      let x = rnd() * W, y = rnd() * H;
      const rs = rnd(), rr = rnd(), rv = rnd(), ra = rnd();
      if (p.grid > 0) { x = (Math.round((x / W) * p.grid) / p.grid) * W; y = (Math.round((y / H) * p.grid) / p.grid) * H; }
      const w = Math.max(0.5, s.size * S * (1 + s.sizeVar * (rs * 2 - 1))), h = w * hr;
      let dr = s.rotVar * (rr * 2 - 1);
      if (s.rotStep > 0) dr = Math.round(dr / s.rotStep) * s.rotStep;
      const rot = (s.rotation + dr) * DEG, arc = s.arcLen * DEG * (0.5 + ra);
      g.fillStyle = g.strokeStyle = gray(s.value + s.valueVar * (rv * 2 - 1));
      const reach = Math.hypot(w, h) / 2 + g.lineWidth;
      for (let oy = -1; oy <= 1; oy++) {
        const yy = y + oy * H;
        if (yy + reach < 0 || yy - reach > H) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const xx = x + ox * W;
          if (xx + reach < 0 || xx - reach > W) continue;
          stampPath(g, s, xx, yy, w, h, rot, arc);
          outline ? g.stroke() : g.fill();
        }
      }
    }
    g.globalAlpha = 1;
  }

  // remap every pixel v -> min + v * (max - min); optional normalize of the rendered range first
  function remap(ctx, W, H, p) {
    if (!p.normalize && p.remapMin === 0 && p.remapMax === 1) return;
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    let lo = 0, hi = 255;
    if (p.normalize) {
      lo = 255; hi = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const v = d[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
      if (hi <= lo) { lo = 0; hi = 255; }
    }
    const lut = new Uint8ClampedArray(256), a = p.remapMin, b = p.remapMax;
    for (let v = 0; v < 256; v++) lut[v] = Math.round((a + U.clamp((v - lo) / (hi - lo)) * (b - a)) * 255);
    for (let i = 0; i < d.length; i += 4) { const v = lut[Math.round((d[i] + d[i + 1] + d[i + 2]) / 3)]; d[i] = d[i + 1] = d[i + 2] = v; }
    ctx.putImageData(img, 0, 0);
  }

  U.register({
    id: 'alien',
    name: 'Detail Maps',
    desc: 'Scatter configured shapes into tileable grayscale detail, smoothness and roughness masks',
    tags: ['Texturing', 'Sci-fi'],
    tileable: true,
    icon: U.icon('<circle cx="7" cy="7" r="3.5"/><rect x="12.5" y="4" width="7" height="5"/><path d="M4 20l4-7 4 7z"/><path d="M14 13l6 6"/>'),
    params: [
      { type: 'section', label: 'Shapes' },
      {
        key: 'stamps', label: 'Shapes to scatter', type: 'list', itemLabel: 'Shape', max: 12,
        itemSummary: (s) => `${s.on ? '' : '(hidden) '}${s.count}× ${s.type} · ${s.type === 'line' || s.type === 'arc' ? 'line' : s.mode}${s.blur ? ' · soft' : ''}`,
        item: [
          { key: 'on', label: 'Visible', type: 'bool', default: true },
          { key: 'type', label: 'Shape', type: 'select', default: 'rect', options: [['circle', 'Circle / ellipse'], ['arc', 'Arc'], ['rect', 'Rect'], ['hex', 'Hexagon'], ['triangle', 'Triangle'], ['line', 'Line']] },
          { key: 'count', label: 'Count', type: 'int', min: 1, max: 1500, default: 40 },
          { key: 'size', label: 'Size', type: 'range', min: 0.002, max: 0.8, step: 0.001, default: 0.06 },
          { key: 'sizeVar', label: 'Size jitter', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Random size per copy (± fraction)' },
          { key: 'aspect', label: 'Height ratio', type: 'range', min: 0.05, max: 1, step: 0.01, default: 1, show: is('circle', 'arc', 'rect') },
          { key: 'arcLen', label: 'Arc length', type: 'range', min: 10, max: 360, step: 1, default: 120, show: is('arc'), tip: 'Degrees (copies vary 0.5–1.5×)' },
          { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: 0 },
          { key: 'rotVar', label: 'Rotation jitter', type: 'range', min: 0, max: 180, step: 1, default: 0, tip: '± degrees per copy' },
          { key: 'rotStep', label: 'Rotation snap', type: 'range', min: 0, max: 180, step: 1, default: 0, show: (s) => s.rotVar > 0, tip: '0 = free. Jitter snaps to multiples of this angle' },
          { key: 'mode', label: 'Draw', type: 'select', default: 'fill', options: [['fill', 'Filled'], ['outline', 'Outline']], show: (s) => s.type !== 'line' && s.type !== 'arc' },
          { key: 'strokeW', label: 'Line width', type: 'range', min: 0.25, max: 24, step: 0.25, default: 2, show: (s) => s.type === 'line' || s.type === 'arc' || s.mode === 'outline', tip: 'px @ 512' },
          { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6 },
          { key: 'value', label: 'Gray value', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
          { key: 'valueVar', label: 'Value jitter', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: '± random gray per copy' },
          { key: 'blur', label: 'Softness', type: 'range', min: 0, max: 32, step: 0.5, default: 0, tip: 'Blur radius, px @ 512' },
        ],
        // default: soft cloudy diamonds with a fine fibre layer and pits (smoothness-map look)
        default: [
          { on: true, type: 'rect', count: 160, size: 0.12, sizeVar: 0.5, aspect: 1, arcLen: 120, rotation: 45, rotVar: 0, rotStep: 0, mode: 'fill', strokeW: 2, opacity: 0.3, value: 0.55, valueVar: 0.45, blur: 6 },
          { on: true, type: 'arc', count: 160, size: 0.3, sizeVar: 0.5, aspect: 1, arcLen: 140, rotation: 0, rotVar: 180, rotStep: 0, mode: 'fill', strokeW: 0.75, opacity: 0.35, value: 0.85, valueVar: 0.1, blur: 0 },
          { on: true, type: 'circle', count: 300, size: 0.006, sizeVar: 0.5, aspect: 1, arcLen: 120, rotation: 0, rotVar: 0, rotStep: 0, mode: 'fill', strokeW: 2, opacity: 0.5, value: 0.05, valueVar: 0, blur: 0 },
        ],
      },
      { key: 'seed', label: 'Seed', type: 'seed', default: 451 },
      { key: 'grid', label: 'Snap to grid', type: 'int', min: 0, max: 64, default: 0, tip: '0 = off. Positions snap to an N×N grid' },
      { type: 'section', label: 'Output' },
      { key: 'blend', label: 'Blend', type: 'select', default: 'source-over', options: [['source-over', 'Normal'], ['lighter', 'Add'], ['screen', 'Screen'], ['multiply', 'Multiply'], ['difference', 'Difference'], ['lighten', 'Max'], ['darken', 'Min'], ['xor', 'XOR (alpha)']] },
      { key: 'bgTransparent', label: 'Transparent background', type: 'bool', default: false },
      { key: 'bgValue', label: 'Background value', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => !p.bgTransparent },
      { key: 'normalize', label: 'Normalize first', type: 'bool', default: false, tip: 'Stretch the rendered darkest..brightest to 0..1 before remapping' },
      { key: 'remapMin', label: 'Remap min', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Output for black. Min > max inverts' },
      { key: 'remapMax', label: 'Remap max', type: 'range', min: 0, max: 1, step: 0.01, default: 1, tip: 'Output for white' },
    ],
    presets: [
      // ref 1: dense tangle of thin circle outlines
      { name: 'Fibre tangle', group: 'Realistic', values: { bgValue: 0, stamps: [
        { type: 'circle', mode: 'outline', count: 520, size: 0.4, sizeVar: 0.5, strokeW: 1, opacity: 0.55, value: 0.82, valueVar: 0.1 },
      ] } },
      { name: 'Felt fibres', group: 'Realistic', values: { bgValue: 0.12, stamps: [
        { type: 'circle', count: 25, size: 0.3, sizeVar: 0.5, opacity: 0.2, value: 0.45, valueVar: 0.3, blur: 20 },
        { type: 'arc', count: 1500, size: 0.07, sizeVar: 0.6, arcLen: 110, rotVar: 180, strokeW: 0.75, opacity: 0.6, value: 0.85, valueVar: 0.15 },
      ] } },
      { name: 'Brushed scratches', group: 'Realistic', values: { bgValue: 0.45, stamps: [
        { type: 'line', count: 900, size: 0.4, sizeVar: 0.7, rotVar: 2, strokeW: 0.5, opacity: 0.3, value: 0.8, valueVar: 0.2 },
        { type: 'line', count: 600, size: 0.3, sizeVar: 0.7, rotVar: 2, strokeW: 0.5, opacity: 0.3, value: 0.15 },
        { type: 'line', count: 40, size: 0.25, sizeVar: 0.5, rotation: 8, rotVar: 20, strokeW: 1.25, opacity: 0.7, value: 0.95 },
      ] } },
      { name: 'Random scratches', group: 'Realistic', values: { bgValue: 0.08, stamps: [
        { type: 'line', count: 350, size: 0.12, sizeVar: 0.8, rotVar: 180, strokeW: 0.75, opacity: 0.55, value: 0.85, valueVar: 0.15 },
        { type: 'arc', count: 60, size: 0.5, sizeVar: 0.5, arcLen: 25, rotVar: 180, strokeW: 1, opacity: 0.6, value: 0.9 },
        { type: 'circle', count: 30, size: 0.25, sizeVar: 0.5, opacity: 0.12, value: 0.6, blur: 16 },
      ] } },
      { name: 'Pitted steel', group: 'Realistic', values: { bgValue: 0.7, stamps: [
        { type: 'circle', count: 30, size: 0.2, sizeVar: 0.5, opacity: 0.2, value: 0.4, valueVar: 0.2, blur: 14 },
        { type: 'circle', count: 1000, size: 0.006, sizeVar: 0.6, opacity: 0.7, value: 0.15, valueVar: 0.1 },
        { type: 'circle', count: 140, size: 0.016, sizeVar: 0.5, opacity: 0.7, value: 0.05, blur: 0.75 },
      ] } },
      { name: 'Water droplets', group: 'Realistic', values: { bgValue: 0.15, stamps: [
        { type: 'circle', count: 500, size: 0.008, sizeVar: 0.6, opacity: 0.8, value: 0.9 },
        { type: 'circle', count: 110, size: 0.03, sizeVar: 0.5, aspect: 0.85, rotVar: 180, opacity: 0.75, value: 0.85, blur: 0.75 },
        { type: 'circle', count: 18, size: 0.07, sizeVar: 0.3, aspect: 0.8, rotVar: 180, opacity: 0.7, value: 0.8, blur: 1 },
      ] } },
      { name: 'Smudged dust', group: 'Realistic', values: { bgValue: 0.18, stamps: [
        { type: 'circle', count: 40, size: 0.2, sizeVar: 0.6, aspect: 0.6, rotVar: 180, opacity: 0.35, value: 0.55, valueVar: 0.3, blur: 18 },
        { type: 'circle', count: 1500, size: 0.004, sizeVar: 0.6, opacity: 0.7, value: 0.85, valueVar: 0.15 },
        { type: 'arc', count: 120, size: 0.04, sizeVar: 0.6, arcLen: 120, rotVar: 180, strokeW: 0.75, opacity: 0.7, value: 0.8 },
      ] } },
      // ref 3: soft cloudy 45° squares
      { name: 'Cloudy diamonds', group: 'Realistic', values: { bgValue: 0.22, stamps: [
        { count: 160, size: 0.15, sizeVar: 0.5, rotation: 45, opacity: 0.4, value: 0.25, valueVar: 0.25, blur: 8 },
        { count: 280, size: 0.08, sizeVar: 0.5, rotation: 45, opacity: 0.35, value: 0.25, valueVar: 0.3, blur: 3 },
        { count: 120, size: 0.07, sizeVar: 0.5, rotation: 45, opacity: 0.15, value: 0.4, valueVar: 0.35 },
        { count: 60, size: 0.12, sizeVar: 0.5, rotation: 45, mode: 'outline', strokeW: 0.5, opacity: 0.12, value: 0.7 },
      ] } },
      { name: 'Soft blotches', group: 'Realistic', values: { bgValue: 0.4, stamps: [
        { type: 'circle', count: 80, size: 0.2, sizeVar: 0.6, opacity: 0.3, value: 0.5, valueVar: 0.5, blur: 14 },
        { type: 'circle', count: 200, size: 0.06, sizeVar: 0.6, opacity: 0.25, value: 0.5, valueVar: 0.5, blur: 4 },
      ] } },
      // ref 2: angular web of outlined triangles
      { name: 'Angular web', group: 'Stylized', values: { bgValue: 0, stamps: [
        { type: 'triangle', mode: 'outline', count: 520, size: 0.15, sizeVar: 0.8, rotation: -15, strokeW: 2, opacity: 1, value: 0.78 },
      ] } },
      { name: 'Shard lines', group: 'Stylized', values: { bgValue: 0.05, stamps: [
        { type: 'line', count: 500, size: 0.18, sizeVar: 0.8, rotation: 15, rotVar: 180, rotStep: 60, strokeW: 1.5, opacity: 0.8, value: 0.75, valueVar: 0.15 },
        { type: 'line', count: 80, size: 0.4, sizeVar: 0.5, rotation: 15, rotVar: 180, rotStep: 60, strokeW: 4, opacity: 0.5, value: 0.4 },
      ] } },
      { name: 'Diamond quilt', group: 'Stylized', values: { bgValue: 0.2, stamps: [
        { count: 220, size: 0.12, sizeVar: 0.5, rotation: 45, opacity: 0.3, value: 0.5, valueVar: 0.4 },
        { count: 120, size: 0.12, sizeVar: 0.5, rotation: 45, mode: 'outline', strokeW: 1, opacity: 0.35, value: 0.85 },
      ] } },
      { name: 'Arc sketch', group: 'Stylized', values: { bgValue: 0.92, stamps: [
        { type: 'arc', count: 300, size: 0.35, sizeVar: 0.6, arcLen: 70, rotVar: 180, strokeW: 1.25, opacity: 0.6, value: 0.1, valueVar: 0.1 },
        { type: 'circle', mode: 'outline', count: 25, size: 0.15, sizeVar: 0.6, strokeW: 2.5, opacity: 0.5, value: 0.2 },
      ] } },
      { name: 'Ripple rings', group: 'Stylized', values: { bgValue: 0.1, blend: 'lighter', stamps: [
        { type: 'circle', mode: 'outline', count: 60, size: 0.25, sizeVar: 0.7, strokeW: 6, opacity: 0.25, value: 0.8, blur: 3 },
        { type: 'circle', mode: 'outline', count: 60, size: 0.25, sizeVar: 0.7, strokeW: 1, opacity: 0.3, value: 0.8 },
      ] } },
      { name: 'Layered discs', group: 'Stylized', values: { bgValue: 0.05, stamps: [
        { type: 'circle', count: 40, size: 0.22, sizeVar: 0.5, opacity: 0.5, value: 0.4, valueVar: 0.35 },
        { type: 'circle', count: 80, size: 0.1, sizeVar: 0.5, opacity: 0.6, value: 0.55, valueVar: 0.35 },
        { type: 'circle', count: 160, size: 0.035, sizeVar: 0.5, opacity: 0.8, value: 0.7, valueVar: 0.3 },
      ] } },
      { name: 'Crystal facets', group: 'Stylized', values: { bgValue: 0.3, stamps: [
        { type: 'triangle', count: 220, size: 0.16, sizeVar: 0.7, rotVar: 180, rotStep: 60, opacity: 0.4, value: 0.5, valueVar: 0.45 },
        { type: 'triangle', mode: 'outline', count: 80, size: 0.16, sizeVar: 0.7, rotVar: 180, rotStep: 60, strokeW: 0.75, opacity: 0.5, value: 0.9 },
      ] } },
      { name: 'Greeble panels', group: 'Sci-fi', values: { grid: 32, bgValue: 0.35, stamps: [
        { count: 30, size: 0.2, sizeVar: 0.4, aspect: 0.5, rotVar: 90, rotStep: 90, opacity: 0.8, value: 0.4, valueVar: 0.15 },
        { count: 60, size: 0.08, sizeVar: 0.5, aspect: 0.3, rotVar: 90, rotStep: 90, opacity: 0.9, value: 0.7, valueVar: 0.15 },
        { count: 40, size: 0.12, sizeVar: 0.4, aspect: 0.6, rotVar: 90, rotStep: 90, mode: 'outline', strokeW: 1.5, opacity: 0.9, value: 0.1 },
        { count: 120, size: 0.015, opacity: 1, value: 0.9 },
      ] } },
      { name: 'Hex armor', group: 'Sci-fi', values: { grid: 12, bgValue: 0.25, stamps: [
        { type: 'hex', count: 90, size: 0.075, rotation: 30, opacity: 0.7, value: 0.6, valueVar: 0.2 },
        { type: 'hex', count: 90, size: 0.085, rotation: 30, mode: 'outline', strokeW: 2, opacity: 0.9, value: 0.05 },
        { type: 'hex', count: 30, size: 0.03, rotation: 30, opacity: 0.9, value: 1 },
      ] } },
      { name: 'Circuit traces', group: 'Sci-fi', values: { grid: 24, bgValue: 0.05, stamps: [
        { type: 'line', count: 140, size: 0.18, sizeVar: 0.5, rotVar: 90, rotStep: 90, strokeW: 2, opacity: 0.9, value: 0.7 },
        { type: 'line', count: 30, size: 0.08, sizeVar: 0.3, rotation: 45, rotVar: 90, rotStep: 90, strokeW: 2, opacity: 0.9, value: 0.7 },
        { type: 'circle', count: 90, size: 0.018, opacity: 1, value: 1 },
        { count: 12, size: 0.07, aspect: 0.6, rotVar: 90, rotStep: 90, opacity: 1, value: 0.35 },
      ] } },
      { name: 'Floor plates', group: 'Sci-fi', values: { grid: 4, bgValue: 0.2, stamps: [
        { count: 60, size: 0.235, opacity: 1, value: 0.45, valueVar: 0.15 },
        { count: 60, size: 0.235, mode: 'outline', strokeW: 3, opacity: 1, value: 0.05 },
        { count: 10, size: 0.06, aspect: 0.25, rotVar: 90, rotStep: 90, opacity: 1, value: 0.9 },
        { type: 'circle', count: 60, size: 0.02, opacity: 0.8, value: 0.15 },
      ] } },
      { name: 'Panel smoothness', group: 'Sci-fi', values: { bgValue: 0.5, stamps: [
        { count: 30, size: 0.25, sizeVar: 0.5, aspect: 0.6, rotVar: 90, rotStep: 90, opacity: 0.35, value: 0.5, valueVar: 0.4, blur: 2 },
        { count: 60, size: 0.1, sizeVar: 0.5, aspect: 0.4, rotVar: 90, rotStep: 90, opacity: 0.3, value: 0.5, valueVar: 0.5 },
        { type: 'circle', count: 400, size: 0.008, sizeVar: 0.5, opacity: 0.4, value: 0.2 },
        { type: 'line', count: 120, size: 0.08, sizeVar: 0.6, rotation: 45, strokeW: 0.75, opacity: 0.4, value: 1 },
      ] } },
      { name: 'Alien glyphs', group: 'Sci-fi', values: { bgValue: 0.05, stamps: [
        { type: 'triangle', count: 80, size: 0.05, rotVar: 180, rotStep: 90, mode: 'outline', strokeW: 2, opacity: 0.9, value: 0.9 },
        { type: 'arc', count: 100, size: 0.045, arcLen: 200, rotVar: 180, rotStep: 90, strokeW: 2, opacity: 0.9, value: 0.8 },
        { type: 'line', count: 120, size: 0.04, rotation: 90, rotVar: 90, rotStep: 45, strokeW: 2, opacity: 0.9, value: 0.9 },
        { type: 'hex', count: 40, size: 0.1, sizeVar: 0.4, mode: 'outline', strokeW: 1, opacity: 0.6, value: 0.4 },
      ] } },
      { name: 'Interference', group: 'Sci-fi', values: { blend: 'difference', bgValue: 0, stamps: [
        { count: 20, size: 0.3, sizeVar: 0.4, aspect: 0.5, rotVar: 90, rotStep: 45, opacity: 1, value: 0.55 },
        { type: 'circle', count: 20, size: 0.2, sizeVar: 0.4, opacity: 1, value: 0.35 },
        { type: 'triangle', count: 15, size: 0.2, sizeVar: 0.4, rotVar: 180, rotStep: 60, opacity: 1, value: 0.7 },
      ] } },
    ],
    render(ctx, W, H, p) {
      if (!p.bgTransparent) { ctx.fillStyle = gray(p.bgValue); ctx.fillRect(0, 0, W, H); }
      const k = Math.min(W, H) / 512;
      ctx.lineJoin = 'miter';
      ctx.lineCap = 'butt';

      p.stamps.forEach((s, si) => {
        if (!s.on) return;
        const br = s.blur * k;
        if (br < 0.25 || typeof ctx.filter !== 'string') {
          ctx.globalCompositeOperation = p.blend;
          drawStamp(ctx, s, si, W, H, p, k);
          return;
        }
        // soft layer: render on its own canvas, tile it 3×3 into a padded canvas, blur, put the center back
        const L = U.canvas(W, H), lg = L.getContext('2d');
        lg.lineJoin = 'miter'; lg.lineCap = 'butt';
        drawStamp(lg, s, si, W, H, p, k);
        const m = Math.min(Math.ceil(br * 3), W, H), P = U.canvas(W + 2 * m, H + 2 * m), pg = P.getContext('2d');
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) pg.drawImage(L, m + ox * W, m + oy * H);
        ctx.globalCompositeOperation = p.blend;
        ctx.filter = `blur(${br}px)`;
        ctx.drawImage(P, -m, -m);
        ctx.filter = 'none';
      });
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      remap(ctx, W, H, p);
    },
  });
})();
