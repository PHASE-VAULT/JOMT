/* Button: a UI button background with simple shading. Rounded / chamfered / square shape, solid or
   gradient fill, grain or stripe texture, a simple bevel (raised or pressed), a light top line, gloss,
   an inset inner line, outline + outer outline, drop shadow, glow and a state
   (normal / hover / pressed / disabled). Sizes are px @ 128 px button height (the short side). */
(function () {
  'use strict';
  const U = window.UGTG;

  const shade = (hex, f) => { const c = U.hex(hex); return `rgb(${U.clamp(c[0] * f, 0, 255) | 0},${U.clamp(c[1] * f, 0, 255) | 0},${U.clamp(c[2] * f, 0, 255) | 0})`; };
  const rgbaOf = (hex, a, f = 1) => { const c = U.hex(hex); return `rgba(${U.clamp(c[0] * f, 0, 255) | 0},${U.clamp(c[1] * f, 0, 255) | 0},${U.clamp(c[2] * f, 0, 255) | 0},${a})`; };

  // closed outline of the button body
  function bodyPath(c, x, y, w, h, corner, r) {
    c.beginPath();
    if (corner === 'chamfer' && r > 0) {
      const q = Math.min(r, w / 2, h / 2);
      c.moveTo(x + q, y); c.lineTo(x + w - q, y); c.lineTo(x + w, y + q); c.lineTo(x + w, y + h - q);
      c.lineTo(x + w - q, y + h); c.lineTo(x + q, y + h); c.lineTo(x, y + h - q); c.lineTo(x, y + q); c.closePath();
    } else if (corner === 'round' && r > 0) {
      U.polyPath(c, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], Math.min(r, w / 2, h / 2));
    } else c.rect(x, y, w, h);
  }

  U.register({
    id: 'button',
    name: 'UI Button',
    desc: 'UI buttons with simple bevel shading, rounded / chamfered corners and states',
    tags: ['UI'],
    aspect: '4:1',
    bg: 'gray',
    icon: U.icon('<rect x="2.5" y="7" width="19" height="10" rx="2.5"/><path d="M4.5 9.5h15" opacity=".5"/>'),
    params: [
      { type: 'section', label: 'Shape' },
      { key: 'corner', label: 'Corners', type: 'select', default: 'round', options: [['round', 'Rounded'], ['chamfer', 'Chamfered'], ['square', 'Square']] },
      { key: 'radius', label: 'Corner size', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.18, show: (p) => p.corner !== 'square', tip: 'Fraction of the button height (0.5 = pill)' },
      { key: 'margin', label: 'Margin', type: 'range', min: 0, max: 40, step: 0.5, default: 6, tip: 'Space around the button for outline, shadow and glow (px @ 128 height)' },
      { key: 'state', label: 'State', type: 'select', default: 'normal', options: [['normal', 'Normal'], ['hover', 'Hover'], ['pressed', 'Pressed'], ['disabled', 'Disabled']] },
      { type: 'section', label: 'Fill' },
      { key: 'fillMode', label: 'Fill', type: 'select', default: 'gradient', options: [['solid', 'Solid'], ['gradient', 'Vertical gradient']] },
      { key: 'top', label: 'Color (top)', type: 'color', default: '#5b6472' },
      { key: 'bottom', label: 'Color (bottom)', type: 'color', default: '#3c434e', show: (p) => p.fillMode === 'gradient' },
      { key: 'fillAlpha', label: 'Fill opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1, tip: 'Lower for ghost / glass buttons' },
      { key: 'grain', label: 'Grain', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0 },
      { key: 'stripes', label: 'Diagonal stripes', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0 },
      { key: 'stripeSize', label: 'Stripe spacing', type: 'range', min: 3, max: 60, step: 0.5, default: 12, show: (p) => p.stripes > 0 },
      { type: 'section', label: 'Shading' },
      { key: 'bevel', label: 'Bevel size', type: 'range', min: 0, max: 30, step: 0.25, default: 5 },
      { key: 'bevelLight', label: 'Bevel light', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.bevel > 0 },
      { key: 'bevelDark', label: 'Bevel shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: (p) => p.bevel > 0 },
      { key: 'topLine', label: 'Top highlight line', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Thin light line just inside the top edge' },
      { key: 'gloss', label: 'Gloss', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'innerW', label: 'Inner line', type: 'range', min: 0, max: 8, step: 0.25, default: 0, tip: 'Thin inset border, px @ 128 height' },
      { key: 'innerInset', label: 'Inner line inset', type: 'range', min: 1, max: 40, step: 0.5, default: 5, show: (p) => p.innerW > 0 },
      { key: 'innerColor', label: 'Inner line color', type: 'color', default: '#ffffff', show: (p) => p.innerW > 0 },
      { key: 'innerAlpha', label: 'Inner line opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => p.innerW > 0 },
      { type: 'section', label: 'Outline & effects' },
      { key: 'outlineW', label: 'Outline', type: 'range', min: 0, max: 16, step: 0.25, default: 2 },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#161a20', show: (p) => p.outlineW > 0 },
      { key: 'outer', label: 'Outer outline', type: 'range', min: 0, max: 16, step: 0.25, default: 0 },
      { key: 'outerColor', label: 'Outer outline color', type: 'color', default: '#000000', show: (p) => p.outer > 0 },
      { key: 'shadowY', label: 'Drop shadow offset', type: 'range', min: 0, max: 30, step: 0.5, default: 4 },
      { key: 'shadowBlur', label: 'Drop shadow blur', type: 'range', min: 0, max: 40, step: 0.5, default: 8 },
      { key: 'shadowAlpha', label: 'Drop shadow opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 1, max: 60, step: 0.5, default: 16, show: (p) => p.glow > 0 },
      { key: 'glowColor', label: 'Glow color', type: 'color', default: '#5fe3b0', show: (p) => p.glow > 0 },
    ],
    presets: [
      // Tarkov-style: dark slate gray, flat with a 1 px light inner rim, square corners
      { name: 'Tarkov-style button', group: 'Tarkov-style', values: { corner: 'square', top: '#3c3f41', bottom: '#28292b', outlineW: 1.5, outlineColor: '#0e0f10', bevel: 2, bevelLight: 0.12, bevelDark: 0.25, topLine: 0.18, innerW: 1.5, innerInset: 3, innerColor: '#8a8e91', innerAlpha: 0.35, grain: 0.06, shadowY: 2, shadowBlur: 3, shadowAlpha: 0.5 } },
      { name: 'Tarkov-style button (hover)', group: 'Tarkov-style', values: { corner: 'square', state: 'hover', top: '#3c3f41', bottom: '#28292b', outlineW: 1.5, outlineColor: '#0e0f10', bevel: 2, bevelLight: 0.12, bevelDark: 0.25, topLine: 0.25, innerW: 1.5, innerInset: 3, innerColor: '#c9c6bd', innerAlpha: 0.55, grain: 0.06, shadowY: 2, shadowBlur: 3, shadowAlpha: 0.5 } },
      { name: 'Tarkov-style button (pressed)', group: 'Tarkov-style', values: { corner: 'square', state: 'pressed', top: '#3c3f41', bottom: '#28292b', outlineW: 1.5, outlineColor: '#0e0f10', bevel: 2, bevelLight: 0.12, bevelDark: 0.3, topLine: 0, innerW: 1.5, innerInset: 3, innerColor: '#8a8e91', innerAlpha: 0.3, grain: 0.06, shadowY: 1, shadowBlur: 2, shadowAlpha: 0.4 } },
      { name: 'Tarkov-style accent (beige)', group: 'Tarkov-style', values: { corner: 'square', top: '#a8996f', bottom: '#7a6d4b', outlineW: 1.5, outlineColor: '#1c1912', bevel: 2, bevelLight: 0.18, bevelDark: 0.25, topLine: 0.3, innerW: 1.5, innerInset: 3, innerColor: '#e4dcc0', innerAlpha: 0.35, grain: 0.06, shadowY: 2, shadowBlur: 3, shadowAlpha: 0.5 } },
      { name: 'Tarkov-style warning (red)', group: 'Tarkov-style', values: { corner: 'square', top: '#6e2a24', bottom: '#4a1814', outlineW: 1.5, outlineColor: '#160605', bevel: 2, bevelLight: 0.15, bevelDark: 0.25, topLine: 0.22, innerW: 1.5, innerInset: 3, innerColor: '#d88a7a', innerAlpha: 0.3, grain: 0.06, shadowY: 2, shadowBlur: 3, shadowAlpha: 0.5 } },
      { name: 'Tarkov-style disabled', group: 'Tarkov-style', values: { corner: 'square', state: 'disabled', top: '#3c3f41', bottom: '#28292b', outlineW: 1.5, outlineColor: '#0e0f10', bevel: 2, bevelLight: 0.1, bevelDark: 0.2, topLine: 0.1, innerW: 1.5, innerInset: 3, innerColor: '#8a8e91', innerAlpha: 0.25, grain: 0.06, shadowY: 1, shadowBlur: 2, shadowAlpha: 0.35 } },
      // Realistic / modern
      { name: 'Primary blue', group: 'Realistic', values: { top: '#4a90ff', bottom: '#2f6fe0', radius: 0.2, outlineW: 1, outlineColor: '#1b3f86', bevel: 3, bevelLight: 0.25, bevelDark: 0.15, topLine: 0.3, shadowY: 3, shadowBlur: 8, shadowAlpha: 0.3 } },
      { name: 'Secondary gray', group: 'Realistic', values: { top: '#f4f5f7', bottom: '#dfe2e7', radius: 0.2, outlineW: 1.5, outlineColor: '#b6bcc6', bevel: 3, bevelLight: 0.5, bevelDark: 0.1, topLine: 0.5, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.15 } },
      { name: 'Success green', group: 'Realistic', values: { top: '#34d27b', bottom: '#1fa45a', radius: 0.2, outlineW: 1, outlineColor: '#0f5c31', bevel: 3, bevelLight: 0.25, bevelDark: 0.15, topLine: 0.3, shadowY: 3, shadowBlur: 8, shadowAlpha: 0.3 } },
      { name: 'Danger red', group: 'Realistic', values: { top: '#ff5a5f', bottom: '#d6343a', radius: 0.2, outlineW: 1, outlineColor: '#7a1418', bevel: 3, bevelLight: 0.25, bevelDark: 0.15, topLine: 0.3, shadowY: 3, shadowBlur: 8, shadowAlpha: 0.3 } },
      { name: 'Pill call-to-action', group: 'Realistic', values: { radius: 0.5, top: '#ff8a3d', bottom: '#ec4c7a', outlineW: 0, bevel: 0, topLine: 0.2, gloss: 0.15, shadowY: 6, shadowBlur: 14, shadowAlpha: 0.35 } },
      { name: 'Ghost outline', group: 'Realistic', values: { fillMode: 'solid', top: '#ffffff', fillAlpha: 0, outlineW: 2.5, outlineColor: '#ffffff', bevel: 0, topLine: 0, shadowAlpha: 0, radius: 0.2 } },
      { name: 'Windows 95 classic', group: 'Realistic', values: { corner: 'square', fillMode: 'solid', top: '#c0c0c0', outlineW: 1.5, outlineColor: '#000000', bevel: 4, bevelLight: 0.9, bevelDark: 0.55, topLine: 0, shadowAlpha: 0 } },
      { name: 'Brushed metal', group: 'Realistic', values: { corner: 'round', radius: 0.12, top: '#d9dde1', bottom: '#8e959c', outlineW: 1.5, outlineColor: '#3a3f44', bevel: 4, bevelLight: 0.6, bevelDark: 0.35, stripes: 0.06, stripeSize: 4, grain: 0.12, topLine: 0.5, shadowY: 3, shadowBlur: 5, shadowAlpha: 0.4 } },
      // Simple
      { name: 'Simple flat gray', group: 'Simple', values: { fillMode: 'solid', top: '#5b6168', outlineW: 0, bevel: 0, topLine: 0, shadowAlpha: 0, radius: 0.12 } },
      { name: 'Simple dark', group: 'Simple', values: { fillMode: 'solid', top: '#1f2226', outlineW: 1, outlineColor: '#3a3f45', bevel: 0, topLine: 0.08, shadowAlpha: 0, radius: 0.12 } },
      { name: 'Simple white rounded', group: 'Simple', values: { fillMode: 'solid', top: '#ffffff', outlineW: 0, bevel: 0, topLine: 0, shadowY: 2, shadowBlur: 6, shadowAlpha: 0.18, radius: 0.3 } },
      { name: 'Simple square accent', group: 'Simple', values: { corner: 'square', fillMode: 'solid', top: '#5fe3b0', outlineW: 0, bevel: 0, topLine: 0, shadowAlpha: 0 } },
      { name: 'Simple outline square', group: 'Simple', values: { corner: 'square', fillMode: 'solid', top: '#000000', fillAlpha: 0, outlineW: 2, outlineColor: '#e6e6e6', bevel: 0, topLine: 0, shadowAlpha: 0 } },
      // Stylized
      { name: 'Glossy aqua', group: 'Stylized', values: { radius: 0.5, top: '#7ad8ff', bottom: '#1a78d8', outlineW: 1.5, outlineColor: '#0c3d74', bevel: 2, gloss: 0.6, topLine: 0, shadowY: 3, shadowBlur: 6, shadowAlpha: 0.35 } },
      { name: 'Mobile game candy', group: 'Stylized', values: { margin: 10, radius: 0.35, top: '#ffd23f', bottom: '#ff9f1c', outlineW: 4, outlineColor: '#7a3d00', outer: 3, outerColor: '#ffffff', bevel: 6, bevelLight: 0.5, bevelDark: 0.35, gloss: 0.35, shadowY: 6, shadowBlur: 0, shadowAlpha: 0.45 } },
      { name: 'Retro pixel bevel', group: 'Stylized', values: { corner: 'square', fillMode: 'solid', top: '#3a6ea5', outlineW: 3, outlineColor: '#0b1a2b', bevel: 6, bevelLight: 0.7, bevelDark: 0.6, topLine: 0, shadowY: 6, shadowBlur: 0, shadowAlpha: 0.6 } },
      { name: 'Wooden plank', group: 'Stylized', values: { radius: 0.1, top: '#a8743f', bottom: '#6e4520', outlineW: 2, outlineColor: '#2e1a08', bevel: 5, bevelLight: 0.35, bevelDark: 0.4, stripes: 0.1, stripeSize: 22, grain: 0.2, topLine: 0.15, shadowY: 4, shadowBlur: 4, shadowAlpha: 0.5 } },
      { name: 'Fantasy gold', group: 'Stylized', values: { corner: 'chamfer', radius: 0.3, top: '#ffe28a', bottom: '#b37a14', outlineW: 2, outlineColor: '#3a2405', outer: 2, outerColor: '#d8b060', bevel: 5, bevelLight: 0.55, bevelDark: 0.4, topLine: 0.4, shadowY: 4, shadowBlur: 6, shadowAlpha: 0.5 } },
      { name: 'Stone RPG', group: 'Stylized', values: { corner: 'chamfer', radius: 0.22, top: '#8a857a', bottom: '#57534a', outlineW: 2, outlineColor: '#1d1b17', bevel: 6, bevelLight: 0.4, bevelDark: 0.5, grain: 0.3, topLine: 0.2, shadowY: 4, shadowBlur: 4, shadowAlpha: 0.55 } },
      // Sci-fi
      { name: 'Sci-fi chamfer neon', group: 'Sci-fi', values: { margin: 14, corner: 'chamfer', radius: 0.35, fillMode: 'gradient', top: '#0b2a33', bottom: '#06161c', outlineW: 2, outlineColor: '#3cf2ff', bevel: 0, topLine: 0.15, innerW: 1, innerInset: 6, innerColor: '#3cf2ff', innerAlpha: 0.35, glow: 0.7, glowSize: 16, glowColor: '#00d8ff', shadowAlpha: 0 } },
      { name: 'Holo glass', group: 'Sci-fi', values: { margin: 14, radius: 0.25, top: '#8fe8ff', bottom: '#3a8aff', fillAlpha: 0.28, outlineW: 1.5, outlineColor: '#bff4ff', bevel: 0, topLine: 0.5, gloss: 0.25, glow: 0.5, glowSize: 12, glowColor: '#40b0ff', shadowAlpha: 0 } },
      { name: 'Hazard stripes', group: 'Sci-fi', values: { corner: 'chamfer', radius: 0.25, fillMode: 'solid', top: '#f2b705', outlineW: 2, outlineColor: '#111111', stripes: 0.5, stripeSize: 18, bevel: 3, bevelLight: 0.2, bevelDark: 0.3, topLine: 0, shadowY: 3, shadowBlur: 3, shadowAlpha: 0.5 } },
      { name: 'Reactor red alert', group: 'Sci-fi', values: { margin: 14, corner: 'chamfer', radius: 0.4, top: '#3a0a0e', bottom: '#1a0306', outlineW: 2, outlineColor: '#ff3b4a', innerW: 1, innerInset: 6, innerColor: '#ff3b4a', innerAlpha: 0.4, bevel: 0, glow: 0.6, glowSize: 14, glowColor: '#ff2030', shadowAlpha: 0 } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), k = S / 128, m = p.margin * k;
      const pressed = p.state === 'pressed', hover = p.state === 'hover', disabled = p.state === 'disabled';
      const br = hover ? 1.14 : pressed ? 0.9 : 1;
      const sy = pressed ? Math.min(p.shadowY, 1.5) : p.shadowY; // a pressed button sits lower
      const x = m, y = m + (pressed ? 1.5 * k : 0), w = W - 2 * m, h = H - 2 * m - Math.max(0, sy * k * 0.6);
      if (w <= 2 || h <= 2) return;
      const r = p.radius * h;

      const L = U.canvas(W, H), c = L.getContext('2d');
      const body = () => bodyPath(c, x, y, w, h, p.corner, r);

      // glow and drop shadow (cast by the filled body)
      const shadowFill = (color, blur, oy) => { c.save(); c.shadowColor = color; c.shadowBlur = blur; c.shadowOffsetY = oy; c.fillStyle = '#000'; c.globalCompositeOperation = 'source-over'; body(); c.fill(); c.restore(); };
      if (p.glow > 0) { shadowFill(rgbaOf(p.glowColor, p.glow), p.glowSize * k, 0); }
      if (p.shadowAlpha > 0) shadowFill(`rgba(0,0,0,${p.shadowAlpha})`, p.shadowBlur * k, sy * k);
      // remove the black bodies used to cast the shadows (only their shadows should stay)
      c.save(); c.globalCompositeOperation = 'destination-out'; body(); c.fill(); c.restore();

      // outlines (stroked around the edge, the fill covers their inner half)
      c.lineJoin = p.corner === 'round' ? 'round' : 'miter';
      if (p.outer > 0) { body(); c.lineWidth = (p.outlineW + p.outer) * 2 * k; c.strokeStyle = shade(p.outerColor, 1); c.stroke(); }
      if (p.outlineW > 0) { body(); c.lineWidth = p.outlineW * 2 * k; c.strokeStyle = shade(p.outlineColor, br); c.stroke(); }

      // fill: knock the outline out inside first so a see-through fill shows what is behind the button
      body();
      c.save(); c.globalCompositeOperation = 'destination-out'; c.fill(); c.restore();
      let fs;
      if (p.fillMode === 'gradient') { fs = c.createLinearGradient(0, y, 0, y + h); fs.addColorStop(0, rgbaOf(p.top, p.fillAlpha, br)); fs.addColorStop(1, rgbaOf(p.bottom, p.fillAlpha, br)); }
      else fs = rgbaOf(p.top, p.fillAlpha, br);
      body(); c.fillStyle = fs; c.fill();

      c.save();
      body(); c.clip();
      // texture: grain + diagonal stripes
      if (p.grain > 0) {
        const tile = U.canvas(64, 64), tc = tile.getContext('2d'), img = tc.createImageData(64, 64);
        for (let i = 0; i < 64 * 64; i++) { const v = U.hash(i % 64, (i / 64) | 0, 33) * 255; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
        tc.putImageData(img, 0, 0);
        c.globalAlpha = p.grain; c.globalCompositeOperation = 'overlay';
        c.fillStyle = c.createPattern(tile, 'repeat'); c.fillRect(x, y, w, h);
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      }
      if (p.stripes > 0) {
        const st = p.stripeSize * k;
        c.strokeStyle = `rgba(0,0,0,${p.stripes})`; c.lineWidth = st * 0.5;
        c.beginPath();
        for (let t = -h; t < w + h; t += st) { c.moveTo(x + t, y + h); c.lineTo(x + t + h, y); }
        c.stroke();
      }
      // bevel: a stroke along the inside edge, light at the top and dark at the bottom (swapped when pressed)
      if (p.bevel > 0) {
        const g = c.createLinearGradient(0, y, 0, y + h);
        const lt = `rgba(255,255,255,${p.bevelLight})`, dk = `rgba(0,0,0,${p.bevelDark})`;
        g.addColorStop(0, pressed ? dk : lt); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, pressed ? lt : dk);
        body(); c.lineWidth = p.bevel * 2 * k; c.strokeStyle = g; c.stroke();
      }
      if (p.gloss > 0) {
        const g = c.createLinearGradient(0, y, 0, y + h * 0.5);
        g.addColorStop(0, `rgba(255,255,255,${p.gloss * 0.8})`); g.addColorStop(1, `rgba(255,255,255,${p.gloss * 0.12})`);
        c.fillStyle = g; c.fillRect(x, y, w, h * 0.5);
      }
      if (p.topLine > 0 && !pressed) {
        c.fillStyle = `rgba(255,255,255,${p.topLine})`;
        c.fillRect(x, y + Math.max(1, p.outlineW * k), w, Math.max(1, 1.5 * k));
      }
      c.restore();
      if (p.innerW > 0) {
        const d = p.innerInset * k;
        bodyPath(c, x + d, y + d, w - 2 * d, h - 2 * d, p.corner, Math.max(0, r - d));
        c.lineWidth = p.innerW * k; c.strokeStyle = rgbaOf(p.innerColor, p.innerAlpha, hover ? 1.15 : 1); c.stroke();
      }

      // disabled: washed out and see-through
      if (disabled) { ctx.save(); if ('filter' in ctx) ctx.filter = 'grayscale(0.85)'; ctx.globalAlpha = 0.5; ctx.drawImage(L, 0, 0); ctx.restore(); }
      else ctx.drawImage(L, 0, 0);
    },
  });
})();
