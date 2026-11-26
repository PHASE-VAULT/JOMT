/* Hit marker: the feedback mark that flashes on the crosshair when a shot lands. Diagonal ticks, X,
   inward corners, wedges, arc segments or a ring; gap, length, thickness, taper, arm count; optional
   second "confirm" set and center dot; outline, glow, drop shadow. Tilesheet mode animates a pop
   (scale) and fade. Units are px @ 128. */
(function () {
  'use strict';
  const U = window.UGTG;
  const RAD = Math.PI / 180;

  // one arm along +x from r0 to r1 (local space), drawn as a filled polygon (taper) or stroke.
  // Returns 'fill' / 'stroke', or ['stroke', lineWidth] when the arm needs its own line width.
  function arm(c, style, r0, r1, th, p, k) {
    const taper = p.taper, round = p.round, L = r1 - r0;
    const w0 = th / 2, w1 = (th / 2) * (1 - taper);
    c.beginPath();
    if (style === 'wedge') {
      c.moveTo(r0, 0); c.lineTo(r1, -th * 0.9); c.lineTo(r1 + th * 0.3, 0); c.lineTo(r1, th * 0.9); c.closePath();
      return 'fill';
    }
    if (style === 'corner') {
      // a V / L pointing at the center: two legs meeting at r0, opening set by `open`
      // open = 1 is a right angle (legs at ±45°); each leg is ~L long whatever the opening
      const o = p.open == null ? 1 : p.open, l = L * 0.99 / Math.hypot(1, o);
      c.moveTo(r0 + l, -l * o); c.lineTo(r0, 0); c.lineTo(r0 + l, l * o);
      return 'stroke';
    }
    if (style === 'blade') {
      // lens / needle: sharp at both ends, widest at `bladePeak` along the arm
      const m = r0 + L * p.bladePeak;
      c.moveTo(r0, 0); c.quadraticCurveTo(m, -th, r1, 0); c.quadraticCurveTo(m, th, r0, 0); c.closePath();
      return 'fill';
    }
    if (style === 'twin') {
      // two thin parallel lines per arm
      const off = th * 0.25 + p.twinGap * k / 2;
      c.moveTo(r0, -off); c.lineTo(r1, -off); c.moveTo(r0, off); c.lineTo(r1, off);
      return ['stroke', th * 0.5];
    }
    if (style === 'dots') {
      // a row of dots, shrinking outward (or inward with negative taper)
      const n = Math.max(1, p.dotCount | 0);
      for (let i = 0; i < n; i++) {
        const f = n > 1 ? i / (n - 1) : 0, x = r0 + L * f;
        const r = Math.max(0.3, w0 * (taper >= 0 ? 1 - taper * f * 0.8 : 1 + taper * (1 - f) * 0.8));
        c.moveTo(x + r, 0); c.arc(x, 0, r, 0, U.TAU);
      }
      return 'fill';
    }
    const cut = (p.cut || 0) * th;
    if (round && taper < 0.05 && !cut) { c.moveTo(r0, 0); c.lineTo(r1, 0); return 'stroke'; }
    // tapered bar: thick at the outer end, thin toward the center (or the other way round with negative taper);
    // `cut` slants both ends into a parallelogram
    const a = taper >= 0 ? w1 : w0, b = taper >= 0 ? w0 : w0 * (1 + taper);
    c.moveTo(r0 + cut, -a); c.lineTo(r1 + cut, -b); c.lineTo(r1 - cut, b); c.lineTo(r0 - cut, a); c.closePath();
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
        const rr0 = p.style === 'x' ? Math.max(0, r0 * 0.15) : r0, mid = (rr0 + r1) / 2, tw = (p.twist || 0) * RAD;
        shapes.push((cc) => {
          cc.save(); cc.rotate(a);
          // twist: each arm turns about its own middle (pinwheel)
          if (tw) { cc.translate(mid, 0); cc.rotate(tw); cc.translate(-mid, 0); }
          const how = arm(cc, style, rr0, r1, t, p, k * s);
          cc.restore();
          return Array.isArray(how) ? how : [how, t];
        });
      }
    }
    if (p.dot > 0) shapes.push((cc) => { cc.beginPath(); cc.arc(0, 0, p.dot * k * s, 0, U.TAU); return ['fill', 0]; });
    // color along the arms: radial gradient from the center gap to the outermost tip
    const rIn = Math.max(0, gap - th), rOut = Math.max(rIn + 1, sets[sets.length - 1][1] + th);
    const paint = (() => {
      if (!p.gradient || p.gradient === 'none') return p.color;
      const g = c.createRadialGradient(0, 0, rIn, 0, 0, rOut);
      if (p.gradient === 'two') { g.addColorStop(0, p.color); g.addColorStop(1, p.color2); }
      else if (p.gradient === 'fadeOut') { g.addColorStop(0, p.color); g.addColorStop(0.35, p.color); g.addColorStop(1, U.rgba(p.color, 0)); }
      else { g.addColorStop(0, U.rgba(p.color, 0)); g.addColorStop(0.65, p.color); g.addColorStop(1, p.color); }
      return g;
    })();
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
    if (p.hollow) {
      // outline only: grow the shapes, then cut the shapes themselves out
      if (p.outline > 0) run(p.outlineColor, (p.hollowW + p.outline) * k * s);
      run(paint, p.hollowW * k * s);
      c.globalCompositeOperation = 'destination-out';
      run('#000', 0);
      c.globalCompositeOperation = 'source-over';
    } else {
      if (p.outline > 0) run(p.outlineColor, p.outline * k * s);
      run(paint, 0);
    }
    c.restore();
  }

  // the marker plus its echo rings, each on its own layer (hollow mode cuts holes per marker)
  function markerLayer(W, H, p, k) {
    const L = U.canvas(W, H), c = L.getContext('2d');
    const n = p.echo | 0;
    for (let i = n; i >= 0; i--) {
      const M = U.canvas(W, H);
      drawMarker(M.getContext('2d'), p, k, W / 2, H / 2, 1 + i * p.echoSpread);
      c.globalAlpha = i ? p.echoAlpha * (1 - i / (n + 1)) : 1;
      c.drawImage(M, 0, 0);
    }
    return L;
  }

  // a copy of the layer in one flat color (keeps its alpha)
  function tinted(L, color) {
    const T = U.canvas(L.width, L.height), c = T.getContext('2d');
    c.drawImage(L, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color; c.fillRect(0, 0, T.width, T.height);
    return T;
  }

  U.register({
    id: 'hitmarker',
    name: 'Hit Marker',
    desc: 'Hit markers from ticks, X shapes, corners, wedges or arcs, with kill variants, glow and pop animation',
    uses: ['Hit-confirm feedback that flashes over the crosshair in shooters, with separate variants for headshots, kills and armor hits.', 'Click and impact feedback sprites in arcade and mobile games.'],
    tags: ['UI', 'Shooter', 'Animation'],
    bg: 'gray',
    icon: U.icon('<path d="M5 5l4 4M19 5l-4 4M5 19l4-4M19 19l-4-4"/>'),
    params: [
      { type: 'section', label: 'Marker' },
      { key: 'style', label: 'Style', type: 'select', default: 'bar', options: [['bar', 'Ticks'], ['x', 'X (through the center)'], ['blade', 'Blades (sharp both ends)'], ['twin', 'Twin lines'], ['dots', 'Dot trails'], ['corner', 'Corners / chevrons'], ['wedge', 'Wedges'], ['arc', 'Arc segments'], ['ring', 'Ring']] },
      { key: 'arms', label: 'Arms', type: 'int', min: 2, max: 12, default: 4, show: (p) => p.style !== 'ring' },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 0.5, default: 45, show: (p) => p.style !== 'ring' },
      { key: 'gap', label: 'Center gap', type: 'range', min: 0, max: 60, step: 0.25, default: 9, tip: 'px @ 128' },
      { key: 'length', label: 'Length', type: 'range', min: 1, max: 60, step: 0.25, default: 14, tip: 'px @ 128' },
      { key: 'thickness', label: 'Thickness', type: 'range', min: 0.5, max: 20, step: 0.25, default: 3.5, tip: 'px @ 128' },
      { key: 'taper', label: 'Taper', type: 'range', min: -1, max: 1, step: 0.01, default: 0, show: (p) => p.style === 'bar' || p.style === 'x' || p.style === 'dots', tip: 'Positive: thin toward the center (dots: smaller outward). Negative: the other way round' },
      { key: 'cut', label: 'Slanted ends', type: 'range', min: -2, max: 2, step: 0.05, default: 0, show: (p) => p.style === 'bar' || p.style === 'x', tip: 'Cuts both ends of each tick at an angle (parallelogram), a sleek, fast look' },
      { key: 'bladePeak', label: 'Blade widest point', type: 'range', min: 0.1, max: 0.9, step: 0.01, default: 0.65, show: (p) => p.style === 'blade', tip: 'Where along the arm the blade is widest (0 = center side, 1 = tip)' },
      { key: 'twinGap', label: 'Line spacing', type: 'range', min: 0, max: 10, step: 0.25, default: 1.5, show: (p) => p.style === 'twin', tip: 'px @ 128' },
      { key: 'dotCount', label: 'Dots per arm', type: 'int', min: 1, max: 8, default: 3, show: (p) => p.style === 'dots' },
      { key: 'open', label: 'Opening', type: 'range', min: 0.2, max: 2.5, step: 0.01, default: 1, show: (p) => p.style === 'corner', tip: '1 = right angle; lower = narrow chevron, higher = flat bracket' },
      { key: 'arcSpan', label: 'Arc length', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.45, show: (p) => p.style === 'arc' },
      { key: 'twist', label: 'Twist', type: 'range', min: -90, max: 90, step: 0.5, default: 0, show: (p) => p.style !== 'ring' && p.style !== 'arc', tip: 'Turns every arm about its own middle: pinwheel / shuriken look' },
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
      { key: 'gradient', label: 'Gradient', type: 'select', default: 'none', options: [['none', 'None (flat)'], ['two', 'Two colors (center → tips)'], ['fadeOut', 'Fade out toward the tips'], ['fadeIn', 'Fade in from the center']] },
      { key: 'color2', label: 'Tip color', type: 'color', default: '#ff3a6a', show: (p) => p.gradient === 'two' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
      { key: 'hollow', label: 'Hollow (outline only)', type: 'bool', default: false, tip: 'Draws only a thin line around each shape' },
      { key: 'hollowW', label: 'Line width', type: 'range', min: 0.25, max: 4, step: 0.05, default: 0.9, show: (p) => p.hollow, tip: 'px @ 128' },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 6, step: 0.25, default: 0.75, tip: 'px @ 128' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#000000', show: (p) => p.outline > 0 },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 1, max: 40, step: 0.5, default: 8, show: (p) => p.glow > 0, tip: 'px @ 128' },
      { key: 'glowColor', label: 'Glow color', type: 'color', default: '#ffffff', show: (p) => p.glow > 0 },
      { key: 'shadow', label: 'Drop shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'chroma', label: 'Chromatic split', type: 'range', min: 0, max: 6, step: 0.1, default: 0, tip: 'Red / cyan copies offset sideways, a glitchy RGB edge (px @ 128)' },
      { key: 'chromaA', label: 'Split color A', type: 'color', default: '#ff2a5a', show: (p) => p.chroma > 0 },
      { key: 'chromaB', label: 'Split color B', type: 'color', default: '#2ae8ff', show: (p) => p.chroma > 0 },

      { type: 'section', label: 'Echo', active: (p) => p.echo > 0 },
      { key: 'echo', label: 'Echo rings', type: 'int', min: 0, max: 4, default: 0, tip: 'Fainter, larger copies around the marker (ripple / afterimage)' },
      { key: 'echoSpread', label: 'Spread', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.25, show: (p) => p.echo > 0, tip: 'Extra size per echo' },
      { key: 'echoAlpha', label: 'Echo strength', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.45, show: (p) => p.echo > 0 },

      { type: 'section', label: 'Animation (tilesheet)' },
      { key: 'pop', label: 'Pop', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Tilesheet mode: the marker starts this much bigger and snaps to size, then fades' },
      { key: 'spin', label: 'Spin-in', type: 'range', min: -180, max: 180, step: 1, default: 0, tip: 'Degrees the marker turns while it snaps into place' },
      { key: 'expand', label: 'Expand out', type: 'range', min: 0, max: 30, step: 0.25, default: 0, tip: 'The arms slide outward while fading (px @ 128)' },
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
      // Modern: thin, clean, flat shapes with subtle light
      { name: 'Minimal blades', group: 'Modern', values: { style: 'blade', gap: 8, length: 16, thickness: 3.2, bladePeak: 0.7, outline: 0, shadow: 0.25, pop: 0.35, expand: 4 } },
      { name: 'Sleek slant ticks', group: 'Modern', values: { thickness: 2.5, length: 13, gap: 8, cut: 1.2, outline: 0, shadow: 0.3, pop: 0.3 } },
      { name: 'Hairline', group: 'Modern', values: { thickness: 1, length: 12, gap: 9, outline: 0, shadow: 0.45, gradient: 'fadeOut', pop: 0.2, expand: 3 } },
      { name: 'Hollow ticks', group: 'Modern', values: { thickness: 4.5, length: 14, gap: 8, hollow: true, hollowW: 0.9, outline: 0, shadow: 0.3, cut: 0.4 } },
      { name: 'Twin line', group: 'Modern', values: { style: 'twin', thickness: 2.5, twinGap: 1.75, length: 12, gap: 8, outline: 0, shadow: 0.3 } },
      { name: 'Dot trail', group: 'Modern', values: { style: 'dots', dotCount: 3, thickness: 4.2, taper: 0.6, length: 12, gap: 8, outline: 0, shadow: 0.3, expand: 6 } },
      { name: 'Pinwheel', group: 'Modern', values: { style: 'blade', twist: 28, gap: 7, length: 15, thickness: 3.5, outline: 0, shadow: 0.3, spin: 90, pop: 0.3 } },
      { name: 'Chevron lock', group: 'Modern', values: { style: 'corner', open: 0.55, rotation: 0, gap: 9, length: 7, thickness: 2, round: true, outline: 0, shadow: 0.35, expand: 5 } },
      { name: 'Esports clean (white / red)', group: 'Modern', values: { style: 'blade', gap: 7, length: 15, thickness: 3, gradient: 'two', color: '#ffffff', color2: '#ff3a4a', outline: 0, shadow: 0.35, pop: 0.4 } },
      { name: 'Gradient kill', group: 'Modern', values: { thickness: 3, length: 16, gap: 7, cut: 1, gradient: 'two', color: '#ffd6e0', color2: '#ff1f4b', double: true, doubleGap: 3, doubleLen: 0.45, doubleThick: 0.7, outline: 0, glow: 0.35, glowColor: '#ff1f4b', glowSize: 6 } },
      { name: 'Headshot halo', group: 'Modern', values: { style: 'blade', gap: 8, length: 14, thickness: 3, color: '#ffe08a', glow: 0.45, glowColor: '#ffb020', glowSize: 7, echo: 1, echoSpread: 0.3, echoAlpha: 0.4, outline: 0, shadow: 0.2, expand: 4 } },
      { name: 'Ripple confirm', group: 'Modern', values: { thickness: 2, length: 8, gap: 9, outline: 0, echo: 2, echoSpread: 0.55, echoAlpha: 0.7, shadow: 0.25, expand: 4 } },
      { name: 'Glitch hit', group: 'Modern', values: { style: 'x', thickness: 2.5, length: 18, gap: 4, cut: 0.8, chroma: 1.5, outline: 0, shadow: 0, pop: 0.4 } },
      { name: 'Holo shuriken', group: 'Modern', values: { style: 'blade', arms: 3, rotation: -90, twist: 35, gap: 6, length: 16, thickness: 4, hollow: true, hollowW: 1, color: '#7af6ff', glow: 0.6, glowColor: '#22d6ff', glowSize: 8, outline: 0, shadow: 0, spin: 120 } },
      { name: 'Neon arc kill', group: 'Modern', values: { style: 'arc', arms: 4, arcSpan: 0.35, rotation: 45, gap: 12, length: 5, thickness: 2, round: true, color: '#ff4a8a', glow: 0.7, glowColor: '#ff2a6a', glowSize: 10, double: true, doubleGap: 2, doubleLen: 1, doubleThick: 0.6, outline: 0, shadow: 0, spin: -60 } },
    ],
    // tilesheet: pops in bigger, snaps to size, then fades
    animate(p, f) {
      const grow = Math.min(1, f.size);
      p.scale *= 1 + p.pop * (1 - grow) * 1.2 - (1 - Math.min(1, f.energy)) * 0.1;
      p.opacity *= Math.min(1, f.energy);
      if (p.spin) p.rotation += p.spin * (1 - grow);
      if (p.expand && grow >= 0.999) p.gap += p.expand * (1 - Math.min(1, f.energy)); // only while fading
      return p;
    },
    render(ctx, W, H, p) {
      const S = Math.min(W, H), k = S / 128;
      const L = markerLayer(W, H, p, k);
      ctx.save();
      ctx.globalAlpha = p.opacity;
      if (p.chroma > 0) {
        const d = p.chroma * k * p.scale;
        ctx.save(); ctx.globalAlpha = p.opacity * 0.85;
        ctx.drawImage(tinted(L, p.chromaA), -d, 0);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(tinted(L, p.chromaB), d, 0);
        ctx.restore();
      }
      if (p.shadow > 0) { ctx.save(); ctx.shadowColor = `rgba(0,0,0,${p.shadow})`; ctx.shadowBlur = 2 * k; ctx.shadowOffsetY = 1 * k; ctx.drawImage(L, 0, 0); ctx.restore(); }
      if (p.glow > 0) { ctx.save(); ctx.shadowColor = U.rgba(p.glowColor, Math.min(1, p.glow * 1.3)); ctx.shadowBlur = p.glowSize * k; ctx.drawImage(L, 0, 0); if (p.glow > 0.5) ctx.drawImage(L, 0, 0); ctx.restore(); }
      ctx.drawImage(L, 0, 0);
      ctx.restore();
    },
  });
})();
