/* Hit marker: the feedback mark that flashes on the crosshair when a shot lands. Diagonal ticks, X,
   inward corners, wedges, arc segments or a ring; gap, length, thickness, taper, arm count; optional
   second "confirm" set and center dot; outline, glow, drop shadow. Tilesheet mode animates a pop
   (scale) and fade. Units are px @ 128. */
(function () {
  'use strict';
  const U = window.UGTG;
  const RAD = Math.PI / 180;

  // one arm along +x from r0 to r1 (local space), drawn as a filled polygon (taper) or stroke
  function arm(c, style, r0, r1, th, taper, round) {
    const w0 = th / 2, w1 = (th / 2) * (1 - taper);
    c.beginPath();
    if (style === 'wedge') {
      c.moveTo(r0, 0); c.lineTo(r1, -th * 0.9); c.lineTo(r1 + th * 0.3, 0); c.lineTo(r1, th * 0.9); c.closePath();
      return 'fill';
    }
    if (style === 'corner') {
      // an L pointing at the center: two legs meeting at r0
      const L = r1 - r0;
      c.moveTo(r0 + L * 0.7, -L * 0.7); c.lineTo(r0, 0); c.lineTo(r0 + L * 0.7, L * 0.7);
      return 'stroke';
    }
    if (round && taper < 0.05) { c.moveTo(r0, 0); c.lineTo(r1, 0); return 'stroke'; }
    // tapered bar: thick at the outer end, thin toward the center (or the other way round with negative taper)
    const a = taper >= 0 ? w1 : w0, b = taper >= 0 ? w0 : w0 * (1 + taper);
    c.moveTo(r0, -a); c.lineTo(r1, -b); c.lineTo(r1, b); c.lineTo(r0, a); c.closePath();
    return 'fill';
  }

  function drawMarker(c, p, k, cx, cy, scaleMul) {
    const s = p.scale * scaleMul, gap = p.gap * k * s, len = p.length * k * s, th = p.thickness * k * s;
    c.save();
    c.translate(cx, cy);
    c.lineCap = p.round ? 'round' : 'butt';
    c.lineJoin = p.round ? 'round' : 'miter';
    const sets = [[gap, gap + len, th, 1]];
    if (p.double) sets.push([gap + len + p.doubleGap * k * s, gap + len + p.doubleGap * k * s + len * p.doubleLen, th * p.doubleThick, 2]);
    const shapes = [];
    for (const [r0, r1, t] of sets) {
      if (p.style === 'ring') { shapes.push((cc) => { cc.beginPath(); cc.arc(0, 0, (r0 + r1) / 2, 0, U.TAU); return ['stroke', t]; }); continue; }
      for (let i = 0; i < p.arms; i++) {
        const a = (p.rotation + (360 * i) / p.arms) * RAD;
        if (p.style === 'arc') {
          const span = ((360 / p.arms) * p.arcSpan * RAD) / 2;
          shapes.push((cc) => { cc.beginPath(); cc.arc(0, 0, (r0 + r1) / 2, a - span, a + span); return ['stroke', t]; });
          continue;
        }
        const style = p.style === 'x' ? 'bar' : p.style;
        // X: the bars run through the center (no gap)
        const rr0 = p.style === 'x' ? Math.max(0, r0 * 0.15) : r0;
        shapes.push((cc) => { cc.save(); cc.rotate(a); const how = arm(cc, style, rr0, r1, t, p.taper, p.round); cc.restore(); return [how, t]; });
      }
    }
    if (p.dot > 0) shapes.push((cc) => { cc.beginPath(); cc.arc(0, 0, p.dot * k * s, 0, U.TAU); return ['fill', 0]; });
    // draw: shapes are re-traced for each pass (outline, then fill)
    const run = (color, extra) => {
      c.fillStyle = c.strokeStyle = color;
      for (const sh of shapes) {
        const [how, lw] = sh(c);
        // outline pass: strokes get wider, fills get a stroke around them
        if (extra > 0) { c.lineWidth = (how === 'stroke' ? lw : 0) + extra * 2; c.stroke(); if (how === 'fill') c.fill(); }
        else if (how === 'fill') c.fill();
        else { c.lineWidth = lw; c.stroke(); }
      }
    };
    if (p.outline > 0) run(p.outlineColor, p.outline * k * s);
    run(p.color, 0);
    c.restore();
  }

  U.register({
    id: 'hitmarker',
    name: 'Hit Marker',
    desc: 'Hit markers from ticks, X shapes, corners, wedges or arcs, with kill variants, glow and pop animation',
    uses: ['Hit-confirm feedback that flashes over the crosshair in shooters, with separate variants for headshots, kills and armor hits.', 'Click and impact feedback sprites in arcade and mobile games.'],
    tags: ['UI', 'Shooter'],
    bg: 'gray',
    icon: U.icon('<path d="M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4"/>'),
    params: [
      { type: 'section', label: 'Marker' },
      { key: 'style', label: 'Style', type: 'select', default: 'bar', options: [['bar', 'Ticks'], ['x', 'X (through the center)'], ['corner', 'Corners'], ['wedge', 'Wedges'], ['arc', 'Arc segments'], ['ring', 'Ring']] },
      { key: 'arms', label: 'Arms', type: 'int', min: 2, max: 12, default: 4, show: (p) => p.style !== 'ring' },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 0.5, default: 45, show: (p) => p.style !== 'ring' },
      { key: 'gap', label: 'Center gap', type: 'range', min: 0, max: 60, step: 0.25, default: 9, tip: 'px @ 128' },
      { key: 'length', label: 'Length', type: 'range', min: 1, max: 60, step: 0.25, default: 14, tip: 'px @ 128' },
      { key: 'thickness', label: 'Thickness', type: 'range', min: 0.5, max: 20, step: 0.25, default: 3.5, tip: 'px @ 128' },
      { key: 'taper', label: 'Taper', type: 'range', min: -1, max: 1, step: 0.01, default: 0, show: (p) => p.style === 'bar' || p.style === 'x', tip: 'Positive: thin toward the center. Negative: thin toward the outside' },
      { key: 'arcSpan', label: 'Arc length', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.45, show: (p) => p.style === 'arc' },
      { key: 'round', label: 'Rounded ends', type: 'bool', default: false },
      { key: 'dot', label: 'Center dot', type: 'range', min: 0, max: 12, step: 0.25, default: 0, tip: 'px @ 128' },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.2, max: 2.5, step: 0.01, default: 1 },
      { type: 'section', label: 'Second set' },
      { key: 'double', label: 'Second set', type: 'bool', default: false, tip: 'An outer set, e.g. for kill confirm' },
      { key: 'doubleGap', label: 'Distance', type: 'range', min: 0, max: 40, step: 0.25, default: 4, show: (p) => p.double },
      { key: 'doubleLen', label: 'Length', type: 'range', min: 0.1, max: 2, step: 0.01, default: 0.6, show: (p) => p.double, tip: '× main length' },
      { key: 'doubleThick', label: 'Thickness', type: 'range', min: 0.1, max: 2, step: 0.01, default: 0.6, show: (p) => p.double, tip: '× main thickness' },
      { type: 'section', label: 'Style' },
      { key: 'color', label: 'Color', type: 'color', default: '#ffffff' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 6, step: 0.25, default: 0.75, tip: 'px @ 128' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#000000', show: (p) => p.outline > 0 },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 1, max: 40, step: 0.5, default: 8, show: (p) => p.glow > 0, tip: 'px @ 128' },
      { key: 'glowColor', label: 'Glow color', type: 'color', default: '#ffffff', show: (p) => p.glow > 0 },
      { key: 'shadow', label: 'Drop shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'pop', label: 'Pop (tilesheet)', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Tilesheet mode: the marker starts this much bigger and snaps to size, then fades' },
    ],
    presets: [
      { name: 'Classic hit', group: 'Simple', values: {} },
      { name: 'Headshot (gold)', group: 'Simple', values: { color: '#ffcf3a', thickness: 4, length: 16, glow: 0.4, glowColor: '#ffb020', dot: 2 } },
      { name: 'Kill (red)', group: 'Simple', values: { color: '#ff2a2a', thickness: 4.5, length: 17, double: true, doubleGap: 4, glow: 0.35, glowColor: '#ff0000' } },
      { name: 'Armor hit (blue)', group: 'Simple', values: { color: '#5ab4ff', glow: 0.3, glowColor: '#2a8cff' } },
      { name: 'Shield break', group: 'Sci-fi', values: { style: 'arc', arms: 4, arcSpan: 0.55, gap: 12, length: 8, thickness: 3, color: '#4af0ff', glow: 0.6, glowColor: '#00d8ff', rotation: 45 } },
      { name: 'Thin tactical', group: 'Realistic', values: { thickness: 1.5, length: 10, gap: 7, outline: 0.5, shadow: 0.5 } },
      { name: 'Tapered spikes', group: 'Stylized', values: { taper: 0.85, thickness: 6, length: 18, gap: 6, outline: 1 } },
      { name: 'Hard X', group: 'Stylized', values: { style: 'x', thickness: 3, length: 18, gap: 4, outline: 1 } },
      { name: 'Corners', group: 'Stylized', values: { style: 'corner', gap: 10, length: 8, thickness: 2.5, rotation: 0, round: true } },
      { name: 'Wedges', group: 'Stylized', values: { style: 'wedge', gap: 8, length: 12, thickness: 4, rotation: 45 } },
      { name: 'Ring pulse', group: 'Sci-fi', values: { style: 'ring', gap: 12, length: 4, thickness: 2, color: '#7dff8a', glow: 0.6, glowColor: '#5aff6a', outline: 0 } },
      { name: 'Triple arc', group: 'Sci-fi', values: { style: 'arc', arms: 3, arcSpan: 0.6, gap: 10, length: 6, thickness: 2.5, rotation: -90, color: '#ff4af0', glow: 0.5, glowColor: '#ff2ad8' } },
      { name: 'Critical burst', group: 'Game-inspired', values: { arms: 8, rotation: 22.5, taper: 0.7, length: 15, thickness: 4, gap: 7, color: '#ff9a2a', glow: 0.5, glowColor: '#ff6a00', double: true, doubleGap: 3, doubleLen: 0.4 } },
      { name: 'Arena shooter hit', group: 'Game-inspired', values: { style: 'x', thickness: 4, length: 22, gap: 3, taper: 0.5, color: '#ffffff', outline: 1.25, glow: 0.25 } },
      { name: 'Retro pixel hit', group: 'Stylized', values: { thickness: 4, length: 10, gap: 8, outline: 1, outlineColor: '#000000', shadow: 0, round: false, rotation: 45 } },
    ],
    // tilesheet: pops in bigger, snaps to size, then fades
    animate(p, f) {
      const grow = Math.min(1, f.size);
      p.scale *= 1 + p.pop * (1 - grow) * 1.2 - (1 - Math.min(1, f.energy)) * 0.1;
      p.opacity *= Math.min(1, f.energy);
      return p;
    },
    render(ctx, W, H, p) {
      const S = Math.min(W, H), k = S / 128, cx = W / 2, cy = H / 2;
      const L = U.canvas(W, H), c = L.getContext('2d');
      drawMarker(c, p, k, cx, cy, 1);
      ctx.save();
      ctx.globalAlpha = p.opacity;
      if (p.shadow > 0) { ctx.save(); ctx.shadowColor = `rgba(0,0,0,${p.shadow})`; ctx.shadowBlur = 2 * k; ctx.shadowOffsetY = 1 * k; ctx.drawImage(L, 0, 0); ctx.restore(); }
      if (p.glow > 0) { ctx.save(); ctx.shadowColor = U.rgba(p.glowColor, Math.min(1, p.glow * 1.3)); ctx.shadowBlur = p.glowSize * k; ctx.drawImage(L, 0, 0); if (p.glow > 0.5) ctx.drawImage(L, 0, 0); ctx.restore(); }
      ctx.drawImage(L, 0, 0);
      ctx.restore();
    },
  });
})();
