/* Tank reticle: modular gunner's sight. Center mark, main lines with thick posts, mil ticks with
   numbers, side chevrons (WWII style), range ladder, stadiametric rangefinder curve, corner brackets,
   ring and lens mask. Sizes are px @ 512 (short side). Drawn twice: outline pass, then color pass. */
(function () {
  'use strict';
  const U = window.UGTG;

  const on = (k) => (p) => !!p[k];
  const CENTERS = [['none', 'None'], ['chevron', 'Chevron (^)'], ['triangle', 'Filled triangle'], ['cross', 'Small cross'], ['dot', 'Dot'], ['circle', 'Circle'], ['box', 'Box'], ['diamond', 'Diamond'], ['post', 'Post (pointed)']];

  U.register({
    id: 'tankReticle',
    name: 'Tank Reticle',
    desc: 'Tank gunner sights: chevrons, mil scales, range ladders, rangefinder curves, brackets',
    tags: ['UI', 'Shooter', 'Vehicles'],
    bg: 'gray',
    icon: U.icon('<path d="M12 9l-3 4M12 9l3 4"/><path d="M2 12h5M17 12h5"/><path d="M5 12v-1.5M19 12v-1.5M9 12v-1M15 12v-1"/><path d="M12 15v6"/>'),
    params: [
      { type: 'section', label: 'Center' },
      { key: 'center', label: 'Center mark', type: 'select', default: 'chevron', options: CENTERS },
      { key: 'cSize', label: 'Size', type: 'range', min: 2, max: 80, step: 0.5, default: 14, show: (p) => p.center !== 'none' },
      { key: 'centerDot', label: 'Extra center dot', type: 'bool', default: false },
      { key: 'offsetY', label: 'Vertical offset', type: 'range', min: -0.4, max: 0.4, step: 0.005, default: 0, tip: 'Moves the whole reticle up / down' },
      { type: 'section', label: 'Main lines' },
      { key: 'width', label: 'Line width', type: 'range', min: 0.5, max: 10, step: 0.1, default: 1.6, tip: 'px @ 512' },
      { key: 'hLine', label: 'Horizontal line', type: 'bool', default: true },
      { key: 'hLen', label: 'Horizontal length', type: 'range', min: 10, max: 256, step: 1, default: 200, show: on('hLine') },
      { key: 'vDown', label: 'Vertical line down', type: 'bool', default: true },
      { key: 'vUp', label: 'Vertical line up', type: 'bool', default: false },
      { key: 'vLen', label: 'Vertical length', type: 'range', min: 10, max: 256, step: 1, default: 200, show: (p) => p.vDown || p.vUp },
      { key: 'gap', label: 'Center gap', type: 'range', min: 0, max: 120, step: 1, default: 26 },
      { key: 'postW', label: 'Outer post width', type: 'range', min: 1, max: 8, step: 0.1, default: 3, tip: 'Line width multiplier of the thick outer part. 1 = no posts' },
      { key: 'postStart', label: 'Posts start at', type: 'range', min: 10, max: 256, step: 1, default: 140, show: (p) => p.postW > 1 },
      { type: 'section', label: 'Mil ticks' },
      { key: 'ticks', label: 'Ticks per side', type: 'int', min: 0, max: 40, default: 8 },
      { key: 'tickSpacing', label: 'Spacing', type: 'range', min: 3, max: 60, step: 0.5, default: 14, show: (p) => p.ticks > 0 },
      { key: 'tickLen', label: 'Tick length', type: 'range', min: 1, max: 30, step: 0.5, default: 5, show: (p) => p.ticks > 0 },
      { key: 'majorEvery', label: 'Major every', type: 'int', min: 1, max: 10, default: 2, show: (p) => p.ticks > 0 },
      { key: 'majorLen', label: 'Major length', type: 'range', min: 1, max: 40, step: 0.5, default: 10, show: (p) => p.ticks > 0 },
      { key: 'tickDir', label: 'Tick direction', type: 'select', default: 'up', options: [['up', 'Up'], ['down', 'Down'], ['both', 'Both']], show: (p) => p.ticks > 0 },
      { key: 'tickNums', label: 'Numbers on major ticks', type: 'bool', default: true, show: (p) => p.ticks > 0 },
      { key: 'tickStep', label: 'Number step', type: 'int', min: 1, max: 100, default: 4, show: (p) => p.ticks > 0 && p.tickNums },
      { type: 'section', label: 'Side chevrons' },
      { key: 'sideChev', label: 'Chevrons per side', type: 'int', min: 0, max: 8, default: 0, tip: 'WWII-style lead triangles' },
      { key: 'sideSpacing', label: 'Spacing', type: 'range', min: 8, max: 120, step: 0.5, default: 40, show: (p) => p.sideChev > 0 },
      { key: 'sideSize', label: 'Size', type: 'range', min: 2, max: 40, step: 0.5, default: 8, show: (p) => p.sideChev > 0 },
      { key: 'sideFilled', label: 'Filled', type: 'bool', default: true, show: (p) => p.sideChev > 0 },
      { type: 'section', label: 'Range ladder' },
      { key: 'ladder', label: 'Range ladder', type: 'bool', default: false },
      { key: 'ladderX', label: 'Position X', type: 'range', min: -240, max: 240, step: 1, default: -120, show: on('ladder') },
      { key: 'ladderY', label: 'Start Y', type: 'range', min: -200, max: 240, step: 1, default: 20, show: on('ladder') },
      { key: 'ladderCount', label: 'Steps', type: 'int', min: 2, max: 30, default: 10, show: on('ladder') },
      { key: 'ladderSpacing', label: 'Spacing', type: 'range', min: 4, max: 40, step: 0.5, default: 14, show: on('ladder') },
      { key: 'ladderStep', label: 'Number step', type: 'int', min: 1, max: 100, default: 2, show: on('ladder'), tip: 'Label of each numbered step (e.g. hundreds of meters)' },
      { type: 'section', label: 'Rangefinder curve' },
      { key: 'rf', label: 'Stadiametric curve', type: 'bool', default: false, tip: 'Soviet-style rangefinder: fit a 2.7 m target between the curve and the baseline' },
      { key: 'rfX', label: 'Position X', type: 'range', min: -250, max: 200, step: 1, default: -175, show: on('rf') },
      { key: 'rfY', label: 'Baseline Y', type: 'range', min: -200, max: 250, step: 1, default: 135, show: on('rf') },
      { key: 'rfW', label: 'Width', type: 'range', min: 40, max: 480, step: 1, default: 170, show: on('rf') },
      { key: 'rfH', label: 'Height', type: 'range', min: 10, max: 200, step: 1, default: 70, show: on('rf') },
      { key: 'rfMarks', label: 'Range marks', type: 'int', min: 0, max: 12, default: 5, show: on('rf') },
      { type: 'section', label: 'Frame' },
      { key: 'brackets', label: 'Corner brackets', type: 'bool', default: false },
      { key: 'bSize', label: 'Bracket box size', type: 'range', min: 10, max: 250, step: 1, default: 60, show: on('brackets') },
      { key: 'bLen', label: 'Bracket arm length', type: 'range', min: 2, max: 100, step: 1, default: 18, show: on('brackets') },
      { key: 'ring', label: 'Ring', type: 'bool', default: false },
      { key: 'ringR', label: 'Ring radius', type: 'range', min: 5, max: 250, step: 1, default: 60, show: on('ring') },
      { key: 'ringTicks', label: 'Ring ticks', type: 'int', min: 0, max: 72, default: 0, show: on('ring') },
      { type: 'section', label: 'Color & lens' },
      { key: 'color', label: 'Reticle', type: 'color', default: '#101010' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.1, max: 1, step: 0.01, default: 1 },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 6, step: 0.1, default: 0, tip: 'px @ 512 around every element' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#000000', show: (p) => p.outline > 0 },
      { key: 'glow', label: 'Glow / illumination', type: 'range', min: 0, max: 30, step: 0.5, default: 0 },
      { key: 'fontSize', label: 'Number size', type: 'range', min: 5, max: 30, step: 0.5, default: 11 },
      { key: 'lens', label: 'Lens mask', type: 'bool', default: false },
      { key: 'lensR', label: 'Lens radius', type: 'range', min: 0.2, max: 0.5, step: 0.005, default: 0.48, show: on('lens') },
      { key: 'lensColor', label: 'Mask color', type: 'color', default: '#050505', show: on('lens') },
      { key: 'tint', label: 'Glass tint', type: 'color', default: '#9fb3a0', show: on('lens') },
      { key: 'tintAmt', label: 'Tint amount', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: on('lens') },
    ],
    presets: [
      // Realistic (sight families, simplified)
      { name: 'WWII German TZF (triangles)', group: 'Realistic', values: { center: 'triangle', cSize: 18, hLine: false, vDown: false, ticks: 0, sideChev: 3, sideSpacing: 46, sideSize: 9, gap: 0, postW: 1, lens: true, tintAmt: 0.25, tint: '#c8c0a0' } },
      { name: 'WWII Sherman M70 (range lines)', group: 'Realistic', values: { center: 'cross', cSize: 8, hLine: true, hLen: 150, vDown: true, vLen: 150, gap: 10, postW: 1, ticks: 5, tickSpacing: 26, tickLen: 6, majorEvery: 1, majorLen: 6, tickDir: 'down', tickNums: true, tickStep: 1, ladder: true, ladderX: 0, ladderY: 30, ladderCount: 8, ladderSpacing: 16, lens: true, tintAmt: 0.2 } },
      { name: 'Soviet TSh (chevron + range curve)', group: 'Realistic', values: { center: 'chevron', cSize: 12, hLine: true, hLen: 120, vDown: false, gap: 22, postW: 1, ticks: 6, tickSpacing: 16, tickLen: 5, majorEvery: 2, majorLen: 9, tickNums: true, tickStep: 4, rf: true, rfX: -175, rfY: 135, rfW: 190, rfH: 65, rfMarks: 5, ladder: true, ladderX: -150, ladderY: -120, ladderCount: 12, ladderSpacing: 9, lens: true, tintAmt: 0.2, tint: '#b8c0b0' } },
      { name: 'T-72 1K13-style', group: 'Realistic', values: { center: 'chevron', cSize: 10, centerDot: true, hLine: true, hLen: 90, vDown: true, vLen: 60, gap: 18, postW: 1, ticks: 4, tickSpacing: 18, majorEvery: 1, majorLen: 7, tickNums: false, ladder: true, ladderX: -110, ladderY: -60, ladderCount: 10, ladderSpacing: 12, ladderStep: 4, color: '#e04a2a', glow: 4, lens: true, tintAmt: 0.15 } },
      { name: 'Abrams GPS-style', group: 'Realistic', values: { center: 'box', cSize: 9, hLine: true, hLen: 230, vDown: true, vUp: true, vLen: 230, gap: 20, postW: 2.5, postStart: 110, ticks: 10, tickSpacing: 9, tickLen: 3, majorEvery: 5, majorLen: 7, tickDir: 'both', tickNums: false, lens: true, tintAmt: 0.12 } },
      { name: 'Leopard 2 EMES-style', group: 'Realistic', values: { center: 'circle', cSize: 10, centerDot: true, hLine: true, hLen: 220, vDown: true, vUp: true, vLen: 220, gap: 22, postW: 2.2, postStart: 120, ticks: 6, tickSpacing: 14, tickLen: 4, majorEvery: 2, majorLen: 8, tickDir: 'both', tickNums: false, ring: true, ringR: 70, lens: true, tintAmt: 0.1 } },
      { name: 'Challenger-style', group: 'Realistic', values: { center: 'chevron', cSize: 16, hLine: true, hLen: 230, vDown: true, vUp: false, vLen: 230, gap: 30, postW: 3, postStart: 90, ticks: 0, lens: true } },
      { name: 'Merkava-style', group: 'Realistic', values: { center: 'diamond', cSize: 7, hLine: true, hLen: 180, vDown: true, vLen: 120, gap: 16, postW: 1, ticks: 9, tickSpacing: 12, tickLen: 4, majorEvery: 3, majorLen: 9, tickDir: 'down', tickNums: true, tickStep: 1, lens: true } },
      { name: 'Thermal sight (white hot)', group: 'Realistic', values: { center: 'cross', cSize: 10, hLine: true, hLen: 130, vDown: true, vUp: true, vLen: 130, gap: 22, postW: 1, ticks: 0, brackets: true, bSize: 70, bLen: 20, color: '#f4f4f4', outline: 1.2, outlineColor: '#000000', lens: false } },
      { name: 'Night sight (green)', group: 'Realistic', values: { center: 'chevron', cSize: 12, hLine: true, hLen: 150, vDown: true, vLen: 100, gap: 22, postW: 1, ticks: 5, tickSpacing: 18, majorEvery: 1, majorLen: 7, tickNums: false, color: '#8dff6a', glow: 8, lens: true, lensR: 0.46, tint: '#1f5a24', tintAmt: 0.85 } },
      { name: 'Commander periscope', group: 'Realistic', values: { center: 'none', hLine: true, hLen: 240, vDown: true, vUp: true, vLen: 240, gap: 0, postW: 1, width: 1, ticks: 12, tickSpacing: 18, tickLen: 4, majorEvery: 3, majorLen: 9, tickDir: 'both', tickNums: true, tickStep: 5, fontSize: 9 } },
      // Game-inspired
      { name: 'War Thunder-style gunner sight', group: 'Game-inspired', values: { center: 'chevron', cSize: 11, hLine: true, hLen: 200, vDown: true, vLen: 200, gap: 24, postW: 2.6, postStart: 120, ticks: 8, tickSpacing: 13, tickLen: 4, majorEvery: 2, majorLen: 9, tickNums: true, tickStep: 4, ladder: true, ladderX: 0, ladderY: 30, ladderCount: 8, ladderSpacing: 11, ladderStep: 2, lens: true, tintAmt: 0.15 } },
      { name: 'World of Tanks-style aim circle', group: 'Game-inspired', values: { center: 'dot', cSize: 10, hLine: false, vDown: false, ticks: 0, ring: true, ringR: 55, ringTicks: 4, width: 2, color: '#ffffff', outline: 1.4, outlineColor: '#000000' } },
      { name: 'Battlefield-style tank reticle', group: 'Game-inspired', values: { center: 'cross', cSize: 8, hLine: true, hLen: 90, vDown: true, vUp: true, vLen: 90, gap: 22, postW: 1, ticks: 4, tickSpacing: 22, majorEvery: 1, majorLen: 6, tickDir: 'down', tickNums: false, ring: true, ringR: 40, color: '#ffb02e', glow: 6 } },
      { name: 'Arma-style coaxial MG sight', group: 'Game-inspired', values: { center: 'chevron', cSize: 8, hLine: true, hLen: 110, vDown: false, gap: 14, postW: 1, ticks: 0, ladder: true, ladderX: 0, ladderY: 20, ladderCount: 8, ladderSpacing: 13, ladderStep: 2, lens: true, tintAmt: 0.15 } },
      { name: 'Squad-style hull sight', group: 'Game-inspired', values: { center: 'triangle', cSize: 10, hLine: true, hLen: 180, vDown: true, vLen: 120, gap: 20, postW: 2, postStart: 100, ticks: 6, tickSpacing: 15, majorEvery: 2, majorLen: 8, tickNums: true, tickStep: 2, rf: true, rfX: 40, rfY: 170, rfW: 170, rfH: 50, rfMarks: 4, lens: true } },
      { name: 'Enlisted-style WWII sight', group: 'Game-inspired', values: { center: 'triangle', cSize: 14, hLine: false, vDown: false, ticks: 0, sideChev: 4, sideSpacing: 34, sideSize: 7, sideFilled: true, ladder: true, ladderX: -150, ladderY: -60, ladderCount: 9, ladderSpacing: 14, ladderStep: 4, lens: true, tintAmt: 0.3, tint: '#c8c0a0' } },
      // Stylized
      { name: 'Clean minimal chevron', group: 'Stylized', values: { center: 'chevron', cSize: 20, hLine: false, vDown: false, ticks: 0, width: 3, color: '#ffffff', outline: 1.6 } },
      { name: 'Arcade tank', group: 'Stylized', values: { center: 'circle', cSize: 14, centerDot: true, hLine: true, hLen: 70, vDown: true, vUp: true, vLen: 70, gap: 26, postW: 1, width: 4, ticks: 0, brackets: true, bSize: 48, bLen: 14, color: '#ffe14a', outline: 2, outlineColor: '#000000' } },
      { name: 'Blueprint sight', group: 'Stylized', values: { center: 'diamond', cSize: 8, hLine: true, hLen: 240, vDown: true, vUp: true, vLen: 240, gap: 12, postW: 1, width: 1, ticks: 16, tickSpacing: 14, tickLen: 3, majorEvery: 4, majorLen: 8, tickDir: 'both', tickNums: true, tickStep: 1, color: '#e8f2ff', lens: true, lensColor: '#0b2a57', tint: '#1d4f9a', tintAmt: 0.9, fontSize: 9 } },
      // Sci-fi
      { name: 'Hover tank HUD', group: 'Sci-fi', values: { center: 'diamond', cSize: 10, hLine: true, hLen: 160, vDown: false, gap: 40, postW: 1, ticks: 6, tickSpacing: 18, majorEvery: 3, majorLen: 9, tickDir: 'both', tickNums: true, tickStep: 10, brackets: true, bSize: 80, bLen: 22, ring: true, ringR: 34, ringTicks: 8, color: '#38e8ff', glow: 10, fontSize: 9 } },
      { name: 'Mech targeting', group: 'Sci-fi', values: { center: 'box', cSize: 12, centerDot: true, hLine: true, hLen: 220, vDown: true, vUp: true, vLen: 220, gap: 60, postW: 4, postStart: 150, ticks: 0, ring: true, ringR: 100, ringTicks: 36, brackets: true, bSize: 30, bLen: 10, color: '#ff4040', glow: 8 } },
      { name: 'Railgun lock', group: 'Sci-fi', values: { center: 'post', cSize: 10, hLine: true, hLen: 250, vDown: false, gap: 70, postW: 1, width: 1.2, ticks: 20, tickSpacing: 9, tickLen: 3, majorEvery: 5, majorLen: 8, tickDir: 'both', tickNums: false, sideChev: 2, sideSpacing: 60, sideSize: 6, sideFilled: false, color: '#b98cff', glow: 12 } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), k = S / 512, cx = W / 2, cy = H / 2 + p.offsetY * H;
      const X = (v) => cx + v * k, Y = (v) => cy + v * k;

      if (p.lens) {
        const r = p.lensR * S;
        if (p.tintAmt > 0) {
          ctx.fillStyle = U.rgba(p.tint, p.tintAmt);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, U.TAU);
          ctx.fill();
        }
        const g = ctx.createRadialGradient(cx, cy, r * 0.94, cx, cy, r * 1.02);
        g.addColorStop(0, U.rgba(p.lensColor, 0));
        g.addColorStop(1, U.rgba(p.lensColor, 1));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }

      const font = `600 ${p.fontSize * k}px ui-monospace, Consolas, monospace`;
      const pass = (color, grow, glow) => {
        ctx.save();
        ctx.strokeStyle = ctx.fillStyle = color;
        ctx.lineJoin = 'miter';
        ctx.globalAlpha = p.opacity;
        if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = glow * k; }
        const lw = (m = 1) => Math.max(0.6, p.width * m * k) + grow * 2;
        const line = (x0, y0, x1, y1, m) => {
          ctx.lineWidth = lw(m);
          ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); ctx.stroke();
        };
        const poly = (pts, fill, closed = true) => {
          ctx.beginPath();
          pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
          if (closed) ctx.closePath();
          if (fill) { ctx.fill(); if (grow > 0) { ctx.lineWidth = grow * 2; ctx.stroke(); } }
          else { ctx.lineWidth = lw(); ctx.stroke(); }
        };
        const circle = (x, y, r, fill) => {
          ctx.beginPath(); ctx.arc(X(x), Y(y), r * k, 0, U.TAU);
          if (fill) { ctx.fill(); if (grow > 0) { ctx.lineWidth = grow * 2; ctx.stroke(); } }
          else { ctx.lineWidth = lw(); ctx.stroke(); }
        };
        const text = (s, x, y, align = 'center', base = 'middle') => {
          ctx.font = font; ctx.textAlign = align; ctx.textBaseline = base;
          if (grow > 0) { ctx.lineWidth = grow * 2.5; ctx.strokeText(s, X(x), Y(y)); }
          ctx.fillText(s, X(x), Y(y));
        };
        // a line from a to b (distance from center) along a unit direction, thick beyond postStart
        const arm = (dx, dy, a, b) => {
          if (b <= a) return;
          const ps = p.postW > 1 ? Math.max(a, Math.min(b, p.postStart)) : b;
          if (ps > a) line(dx * a, dy * a, dx * ps, dy * ps, 1);
          if (b > ps) { ctx.lineCap = 'butt'; line(dx * ps, dy * ps, dx * b, dy * b, p.postW); }
        };

        // main lines
        ctx.lineCap = 'butt';
        if (p.hLine) { arm(-1, 0, p.gap, p.hLen); arm(1, 0, p.gap, p.hLen); }
        if (p.vDown) arm(0, 1, p.gap, p.vLen);
        if (p.vUp) arm(0, -1, p.gap, p.vLen);

        // mil ticks along the horizontal axis
        for (let i = 1; i <= p.ticks; i++) {
          const major = i % p.majorEvery === 0, len = major ? p.majorLen : p.tickLen;
          const y0 = p.tickDir === 'down' ? 0 : -len, y1 = p.tickDir === 'up' ? 0 : len;
          for (const s of [-1, 1]) {
            const x = s * i * p.tickSpacing;
            line(x, y0, x, y1, 1);
            if (major && p.tickNums) text(String((i / p.majorEvery) * p.tickStep), x, p.tickDir === 'down' ? len + p.fontSize * 0.8 : -len - p.fontSize * 0.8);
          }
        }

        // side chevrons
        for (let i = 1; i <= p.sideChev; i++) {
          for (const s of [-1, 1]) {
            const x = s * i * p.sideSpacing, z = p.sideSize;
            poly([[x, 0], [x - z * 0.6, z * 1.2], [x + z * 0.6, z * 1.2]], p.sideFilled, true);
          }
        }

        // center mark
        const z = p.cSize;
        ctx.lineCap = 'round';
        switch (p.center) {
          case 'chevron': poly([[-z, z * 0.9], [0, 0], [z, z * 0.9]], false, false); break;
          case 'triangle': poly([[0, 0], [-z * 0.6, z * 1.2], [z * 0.6, z * 1.2]], true); break;
          case 'cross': line(-z, 0, z, 0, 1); line(0, -z, 0, z, 1); break;
          case 'dot': circle(0, 0, z * 0.3, true); break;
          case 'circle': circle(0, 0, z, false); break;
          case 'box': poly([[-z, -z], [z, -z], [z, z], [-z, z]], false); break;
          case 'diamond': poly([[0, -z], [z, 0], [0, z], [-z, 0]], false); break;
          case 'post': poly([[0, 0], [-z * 0.5, z * 0.8], [-z * 0.5, z * 5], [z * 0.5, z * 5], [z * 0.5, z * 0.8]], true); break;
        }
        if (p.centerDot) circle(0, 0, Math.max(1.2, p.width * 0.9), true);

        // range ladder: vertical line, ticks to the right, numbers on the left
        if (p.ladder) {
          const x = p.ladderX, y0 = p.ladderY, y1 = y0 + p.ladderCount * p.ladderSpacing;
          ctx.lineCap = 'butt';
          line(x, y0, x, y1, 1);
          for (let i = 0; i <= p.ladderCount; i++) {
            const y = y0 + i * p.ladderSpacing, major = i % 2 === 0;
            line(x, y, x + (major ? 9 : 5), y, 1);
            if (major && i > 0) text(String((i / 2) * p.ladderStep), x - 4, y, 'right');
          }
        }

        // stadiametric rangefinder: baseline + falling curve, numbered range marks
        if (p.rf) {
          const x0 = p.rfX, by = p.rfY, w = p.rfW, h = p.rfH, N = 40;
          ctx.lineCap = 'butt';
          line(x0, by, x0 + w, by, 1);
          const pts = [];
          for (let i = 0; i <= N; i++) { const t = i / N; pts.push([x0 + t * w, by - h * (0.12 + 0.88 / (1 + 5 * t))]); }
          poly(pts, false, false);
          for (let i = 0; i < p.rfMarks; i++) {
            const t = p.rfMarks > 1 ? i / (p.rfMarks - 1) : 0, x = x0 + t * w;
            line(x, by, x, by + 5, 1);
            text(String((i + 1) * 2), x, by + 6 + p.fontSize * 0.7);
          }
        }

        // frame
        if (p.brackets) {
          const b = p.bSize, l = Math.min(p.bLen, b);
          ctx.lineCap = 'butt';
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) poly([[sx * b, sy * (b - l)], [sx * b, sy * b], [sx * (b - l), sy * b]], false, false);
        }
        if (p.ring) {
          circle(0, 0, p.ringR, false);
          for (let i = 0; i < p.ringTicks; i++) {
            const a = (i / p.ringTicks) * U.TAU - Math.PI / 2, r0 = p.ringR, r1 = p.ringR - Math.max(4, p.ringR * 0.12);
            line(Math.cos(a) * r0, Math.sin(a) * r0, Math.cos(a) * r1, Math.sin(a) * r1, 1);
          }
        }
        ctx.restore();
      };

      if (p.outline > 0) pass(p.outlineColor, p.outline * k, 0);
      pass(p.color, 0, p.glow);
    },
  });
})();
