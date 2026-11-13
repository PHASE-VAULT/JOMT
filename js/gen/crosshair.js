/* Counter-Strike-style crosshair. Units are pixels on a 64×64 canvas, scaled to the export size. */
(function () {
  'use strict';
  const U = window.UGTG;

  U.register({
    id: 'crosshair',
    name: 'Simple Crosshair',
    desc: 'CS-style crosshair: length, gap, thickness, outline, dot',
    tags: ['UI', 'Shooter'],
    bg: 'gray',
    icon: U.icon('<path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>'),
    params: [
      { type: 'section', label: 'Lines (px @ 64)' },
      { key: 'length', label: 'Length', type: 'range', min: 0, max: 32, step: 0.5, default: 6 },
      { key: 'thickness', label: 'Thickness', type: 'range', min: 0.5, max: 16, step: 0.5, default: 2 },
      { key: 'gap', label: 'Gap', type: 'range', min: -8, max: 24, step: 0.5, default: 3 },
      { key: 'color', label: 'Color', type: 'color', default: '#00ff6a' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
      { key: 'tstyle', label: 'T-style (no top)', type: 'bool', default: false },
      { key: 'rotation', label: 'Rotation', type: 'range', min: 0, max: 90, step: 1, default: 0, tip: '45° makes an X' },
      { type: 'section', label: 'Outline' },
      { key: 'outline', label: 'Outline', type: 'bool', default: true },
      { key: 'outlineW', label: 'Outline thickness', type: 'range', min: 0.5, max: 6, step: 0.5, default: 1, show: (p) => p.outline },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#000000', show: (p) => p.outline },
      { type: 'section', label: 'Center dot' },
      { key: 'dot', label: 'Center dot', type: 'bool', default: false },
      { key: 'dotSize', label: 'Dot size', type: 'range', min: 0.5, max: 16, step: 0.5, default: 2, show: (p) => p.dot },
      { key: 'dotRound', label: 'Round dot', type: 'bool', default: false, show: (p) => p.dot },
      { type: 'section', label: 'Circle', collapsed: true },
      { key: 'circle', label: 'Circle', type: 'bool', default: false },
      { key: 'circleR', label: 'Radius', type: 'range', min: 1, max: 32, step: 0.5, default: 12, show: (p) => p.circle },
      { key: 'circleW', label: 'Thickness', type: 'range', min: 0.5, max: 8, step: 0.5, default: 1.5, show: (p) => p.circle },
      { type: 'section', label: 'Output', collapsed: true },
      { key: 'snap', label: 'Pixel snap', type: 'bool', default: true, tip: 'Round sizes to whole pixels at the output size for crisp lines' },
    ],
    presets: [
      // Realistic: optic / sight-like reticles
      { name: 'Red dot sight', group: 'Realistic', values: { length: 0, dot: true, dotSize: 4, dotRound: true, color: '#ff2a1a', outline: false } },
      { name: 'Holographic ring', group: 'Realistic', values: { length: 0, dot: true, dotSize: 2.5, dotRound: true, circle: true, circleR: 14, circleW: 1.5, color: '#ff3a24', outline: false, opacity: 0.9 } },
      { name: 'Fine crosshair', group: 'Realistic', values: { length: 30, thickness: 0.5, gap: 0, color: '#111111', outline: false, snap: false } },
      { name: 'Amber T-post', group: 'Realistic', values: { length: 12, thickness: 1.5, gap: 4, color: '#ffb020', tstyle: true, outlineColor: '#2a1a00', dot: true, dotSize: 1.5, dotRound: true } },

      // Stylized
      { name: 'Chunky cartoon', group: 'Stylized', values: { length: 7, thickness: 4, gap: 4, color: '#ffe23a', outlineW: 2, dot: true, dotSize: 4, dotRound: true } },
      { name: 'Neon pink X', group: 'Stylized', values: { length: 9, thickness: 2, gap: 5, rotation: 45, color: '#ff3ad0', outlineColor: '#3a0030', snap: false } },
      { name: 'Bold circle', group: 'Stylized', values: { length: 0, circle: true, circleR: 10, circleW: 3, color: '#ffffff', outlineW: 1.5, dot: true, dotSize: 3, dotRound: true } },
      { name: 'Orange brackets', group: 'Stylized', values: { length: 4, thickness: 3, gap: 14, color: '#ff7a1a', outlineW: 1, circle: true, circleR: 22, circleW: 1, opacity: 0.9 } },

      // Game-inspired (general look only)
      { name: 'CS-style classic static', group: 'Game-inspired', values: { length: 5, thickness: 1, gap: 2, color: '#32ff32' } },
      { name: 'CS-style tiny cyan', group: 'Game-inspired', values: { length: 3, thickness: 1, gap: 1, color: '#00ffff' } },
      { name: 'CS-style T-crosshair', group: 'Game-inspired', values: { length: 4, thickness: 1.5, gap: 1.5, color: '#ffff32', tstyle: true, dot: true, dotSize: 1.5 } },
      { name: 'CS2-style default', group: 'Game-inspired', values: { length: 7, thickness: 2, gap: 4, color: '#2bd94a', outline: false, opacity: 0.8 } },
      { name: 'Valorant-style dot', group: 'Game-inspired', values: { length: 0, dot: true, dotSize: 2, color: '#00ffff', outlineColor: '#000000', opacity: 1 } },
      { name: 'Valorant-style default', group: 'Game-inspired', values: { length: 4, thickness: 2, gap: 3, color: '#ffffff', outlineColor: '#000000', opacity: 0.95 } },
      { name: 'CoD-style hipfire', group: 'Game-inspired', values: { length: 6, thickness: 1.5, gap: 9, color: '#ffffff', outlineColor: '#1a1a1a', opacity: 0.85, dot: true, dotSize: 1.5, dotRound: true } },
      { name: 'Battlefield-style hipfire', group: 'Game-inspired', values: { length: 5, thickness: 1, gap: 6, color: '#e6f2ff', outline: false, dot: true, dotSize: 2, dotRound: true, circle: true, circleR: 13, circleW: 0.5, opacity: 0.8 } },
      { name: 'R6-style precision', group: 'Game-inspired', values: { length: 8, thickness: 1, gap: 3, color: '#ffffff', outline: false, dot: true, dotSize: 1, opacity: 0.9 } },
      { name: 'Apex-style hip', group: 'Game-inspired', values: { length: 3, thickness: 1, gap: 5, color: '#ffffff', outline: false, dot: true, dotSize: 1.5, dotRound: true, opacity: 0.9 } },
      { name: 'PUBG-style plus', group: 'Game-inspired', values: { length: 4, thickness: 1.5, gap: 0, color: '#f4f4f4', outlineColor: '#1a1a1a', opacity: 0.9 } },
      { name: 'Halo-style AR circle', group: 'Game-inspired', values: { length: 3, thickness: 1.5, gap: 13, color: '#7fd6ff', outline: false, circle: true, circleR: 11, circleW: 1.5, dot: true, dotSize: 1.5, dotRound: true } },
      { name: 'Doom-style plasma', group: 'Game-inspired', values: { length: 3, thickness: 2, gap: 6, rotation: 45, color: '#ffffff', outlineColor: '#b01010', snap: false, circle: true, circleR: 4, circleW: 1 } },

      // Sci-fi
      { name: 'Plasma ring', group: 'Sci-fi', values: { length: 3, thickness: 1, gap: 8, color: '#40f0ff', outlineColor: '#7a20ff', circle: true, circleR: 9, circleW: 1, dot: true, dotSize: 1.5, dotRound: true } },
      { name: 'Targeting X', group: 'Sci-fi', values: { length: 12, thickness: 1, gap: 8, rotation: 45, color: '#ff9a1a', outline: false, snap: false, circle: true, circleR: 20, circleW: 0.5 } },
      { name: 'Alien acid', group: 'Sci-fi', values: { length: 6, thickness: 2.5, gap: 5, rotation: 30, color: '#8aff2a', outlineColor: '#4a0a6a', outlineW: 1.5, snap: false, dot: true, dotSize: 3, dotRound: true } },
      { name: 'Railgun lock', group: 'Sci-fi', values: { length: 18, thickness: 0.5, gap: 14, color: '#d8f8ff', outlineColor: '#0060ff', outlineW: 0.5, snap: false, circle: true, circleR: 6, circleW: 1 } },
    ],
    render(ctx, W, H, p) {
      const k = Math.min(W, H) / 64;
      const snap = p.snap && p.rotation % 90 === 0;
      const q = (v) => (snap ? Math.round(v) : v);
      const min1 = (v) => (snap ? Math.max(1, v) : v);
      const L = q(p.length * k), t = min1(q(p.thickness * k)), g = q(p.gap * k);
      const o = p.outline ? min1(q(p.outlineW * k)) : 0;
      const h0 = snap ? Math.floor(t / 2) : t / 2;

      const rects = [];
      if (L > 0) {
        rects.push([g, -h0, L, t], [-g - L, -h0, L, t], [-h0, g, t, L]);
        if (!p.tstyle) rects.push([-h0, -g - L, t, L]);
      }
      const dotR = (p.dotSize * k) / 2;
      if (p.dot && !p.dotRound) {
        const d = min1(q(p.dotSize * k)), d0 = snap ? Math.floor(d / 2) : d / 2;
        rects.push([-d0, -d0, d, d]);
      }

      const lay = U.canvas(W, H), c = lay.getContext('2d');
      c.translate(snap ? Math.round(W / 2) : W / 2, snap ? Math.round(H / 2) : H / 2);
      c.rotate((p.rotation * Math.PI) / 180);
      const ring = (lw, color) => {
        c.beginPath(); c.arc(0, 0, p.circleR * k, 0, U.TAU);
        c.lineWidth = lw; c.strokeStyle = color; c.stroke();
      };
      const roundDot = (r) => { c.beginPath(); c.arc(0, 0, r, 0, U.TAU); c.fill(); };

      if (o > 0) {
        c.fillStyle = p.outlineColor;
        for (const [x, y, w, h] of rects) c.fillRect(x - o, y - o, w + 2 * o, h + 2 * o);
        if (p.dot && p.dotRound) roundDot(dotR + o);
        if (p.circle) ring(p.circleW * k + 2 * o, p.outlineColor);
      }
      c.fillStyle = p.color;
      for (const [x, y, w, h] of rects) c.fillRect(x, y, w, h);
      if (p.dot && p.dotRound) roundDot(dotR);
      if (p.circle) ring(p.circleW * k, p.color);

      ctx.globalAlpha = p.opacity;
      ctx.drawImage(lay, 0, 0);
      ctx.globalAlpha = 1;
    },
  });
})();
