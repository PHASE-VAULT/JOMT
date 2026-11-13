/* Tileable scratches: tapered, slightly curved and jagged strokes with a direction bias.
   Strokes crossing an edge are drawn again on the opposite side, so the texture tiles. */
(function () {
  'use strict';
  const U = window.UGTG;

  U.register({
    id: 'scratches',
    name: 'Scratches',
    desc: 'Tileable scratch / wear maps with direction and taper',
    tags: ['Texturing', 'Decals'],
    tileable: true,
    icon: U.icon('<path d="M4 18c4-5 8-9 15-13"/><path d="M6 20c3-3 6-6 12-9" opacity=".55"/><path d="M3 12c3-2 5-3 8-4" opacity=".55"/>'),
    params: [
      { type: 'section', label: 'Scratches' },
      { key: 'count', label: 'Count', type: 'int', min: 1, max: 1500, default: 180 },
      { key: 'lenMin', label: 'Min length', type: 'range', min: 0.005, max: 1, step: 0.005, default: 0.03 },
      { key: 'lenMax', label: 'Max length', type: 'range', min: 0.005, max: 1.5, step: 0.005, default: 0.4 },
      { key: 'bias', label: 'Short-scratch bias', type: 'range', min: 0.3, max: 5, step: 0.01, default: 2.2, tip: 'Higher = many short scratches, few long ones' },
      { key: 'wMin', label: 'Min width', type: 'range', min: 0.2, max: 12, step: 0.1, default: 0.5, tip: 'px @ 512' },
      { key: 'wMax', label: 'Max width', type: 'range', min: 0.2, max: 16, step: 0.1, default: 2.2, tip: 'px @ 512' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 12 },
      { type: 'section', label: 'Direction & shape' },
      { key: 'dir', label: 'Direction', type: 'range', min: -90, max: 90, step: 1, default: 25 },
      { key: 'spread', label: 'Direction spread', type: 'range', min: 0, max: 180, step: 1, default: 50, tip: '0 = all parallel (brushed), 180 = any direction' },
      { key: 'curve', label: 'Curvature', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: 'jag', label: 'Jaggedness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2 },
      { key: 'taper', label: 'Taper ends', type: 'bool', default: true },
      { key: 'opMin', label: 'Min opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: 'opMax', label: 'Max opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.95 },
      { type: 'section', label: 'Output' },
      { key: 'mode', label: 'Output', type: 'select', default: 'mask', options: [['mask', 'White on black (mask)'], ['overlay', 'Overlay (transparent)'], ['color', 'Scratches over base color']] },
      { key: 'color', label: 'Scratch color', type: 'color', default: '#e8e6e0', show: (p) => p.mode !== 'mask' },
      { key: 'base', label: 'Base color', type: 'color', default: '#34373b', show: (p) => p.mode === 'color' },
    ],
    presets: [
      { name: 'Dense fine scratch mask', group: 'Realistic', values: { count: 520, lenMin: 0.02, lenMax: 0.22, wMin: 0.3, wMax: 1.3, spread: 140, opMin: 0.2, opMax: 0.8, seed: 5 } },
      { name: 'Brushed steel', group: 'Realistic', values: { count: 1500, lenMin: 0.2, lenMax: 1.2, bias: 1, wMin: 0.2, wMax: 0.9, dir: 0, spread: 0, curve: 0, jag: 0, opMin: 0.05, opMax: 0.35, mode: 'color', color: '#dde1e6', base: '#868b92' } },
      { name: 'Brushed aluminium mask', group: 'Realistic', values: { count: 1500, lenMin: 0.3, lenMax: 1.5, bias: 1, wMin: 0.2, wMax: 1.4, dir: 0, spread: 2, curve: 0, jag: 0.05, opMin: 0.05, opMax: 0.5 } },
      { name: 'Worn paint', group: 'Realistic', values: { count: 450, lenMin: 0.01, lenMax: 0.15, wMin: 1, wMax: 5, spread: 180, curve: 0.4, jag: 0.6, opMin: 0.7, opMax: 1, mode: 'color', color: '#b4b6b2', base: '#3d5a3a' } },
      { name: 'Glass scuffs', group: 'Realistic', values: { count: 600, lenMax: 0.12, wMin: 0.3, wMax: 1.2, spread: 180, curve: 0.6, opMin: 0.25, opMax: 0.75, mode: 'overlay', color: '#ffffff' } },
      { name: 'Car paint swirls', group: 'Realistic', values: { count: 800, lenMin: 0.05, lenMax: 0.25, wMin: 0.2, wMax: 0.7, spread: 180, curve: 1, jag: 0, opMin: 0.15, opMax: 0.6, mode: 'color', color: '#a8a8ac', base: '#141518' } },
      { name: 'Heavy wear', group: 'Realistic', values: { count: 1200, lenMax: 0.6, wMin: 0.5, wMax: 5, spread: 180, jag: 0.5, opMin: 0.3, opMax: 1 } },
      { name: 'Micro scratches', group: 'Realistic', values: { count: 1000, lenMin: 0.01, lenMax: 0.08, wMin: 0.3, wMax: 0.8, spread: 180, curve: 0.3, opMin: 0.2, opMax: 0.75 } },
      { name: 'Floor scuffs', group: 'Realistic', values: { count: 260, lenMin: 0.02, lenMax: 0.12, wMin: 1.5, wMax: 7, spread: 120, curve: 0.5, jag: 0.1, opMin: 0.15, opMax: 0.5, mode: 'color', color: '#3a2c22', base: '#c49a62' } },
      { name: 'Deep gouges', group: 'Realistic', values: { count: 40, lenMin: 0.1, lenMax: 0.5, bias: 1.2, wMin: 3, wMax: 8, spread: 90, jag: 0.8, opMin: 0.8, opMax: 1, mode: 'color', color: '#1c1a18', base: '#8c8478' } },
      { name: 'Anodized wear', group: 'Realistic', values: { count: 500, lenMax: 0.2, wMin: 0.3, wMax: 2.5, spread: 140, jag: 0.4, opMin: 0.3, opMax: 0.9, mode: 'color', color: '#a0a6ac', base: '#1d1e21' } },
      { name: 'Claw marks', group: 'Stylized', values: { count: 6, lenMin: 0.45, lenMax: 0.8, bias: 1, wMin: 8, wMax: 14, dir: 60, spread: 8, curve: 0.3, jag: 0, opMin: 1, opMax: 1, mode: 'color', color: '#2a1608', base: '#7a5636' } },
      { name: 'Toon scratches', group: 'Stylized', values: { count: 60, lenMin: 0.05, lenMax: 0.25, bias: 1.5, wMin: 3, wMax: 6, curve: 0.1, jag: 0, opMin: 1, opMax: 1, mode: 'color', color: '#ffffff', base: '#3a6ac8' } },
      { name: 'Pencil hatching', group: 'Stylized', values: { count: 450, lenMin: 0.05, lenMax: 0.15, bias: 1, wMin: 1, wMax: 2, dir: 45, spread: 6, curve: 0, jag: 0.05, opMin: 0.4, opMax: 0.9, mode: 'color', color: '#3a3530', base: '#f2ead8' } },
      { name: 'Chalkboard', group: 'Stylized', values: { count: 300, lenMax: 0.3, wMin: 1, wMax: 4, spread: 180, curve: 0.5, opMin: 0.05, opMax: 0.3, mode: 'color', color: '#e8e8e0', base: '#2c3c32' } },
      { name: 'Energy scars', group: 'Sci-fi', values: { count: 40, lenMin: 0.15, lenMax: 0.7, bias: 1.2, wMin: 1, wMax: 4, spread: 180, curve: 0.6, jag: 1, opMin: 0.6, opMax: 1, mode: 'color', color: '#3af0ff', base: '#0a0c14' } },
      { name: 'Plasma burns', group: 'Sci-fi', values: { count: 80, lenMin: 0.05, lenMax: 0.3, wMin: 2, wMax: 7, spread: 180, curve: 0.3, jag: 0.7, opMin: 0.5, opMax: 1, mode: 'color', color: '#ff6a1a', base: '#20232a' } },
      { name: 'Laser-etched lines', group: 'Sci-fi', values: { count: 120, lenMin: 0.1, lenMax: 0.5, bias: 1, wMin: 0.4, wMax: 1.2, dir: 0, spread: 0, curve: 0, jag: 0, taper: false, opMin: 0.5, opMax: 1, mode: 'color', color: '#ff3a6a', base: '#1a1e24' } },
      { name: 'Micrometeor pitting', group: 'Sci-fi', values: { count: 1200, lenMin: 0.005, lenMax: 0.04, wMin: 0.5, wMax: 2.5, spread: 180, jag: 0.8, opMin: 0.4, opMax: 1, mode: 'color', color: '#454a52', base: '#c6cad0' } },
      { name: 'Glitch streaks', group: 'Sci-fi', values: { count: 90, lenMin: 0.05, lenMax: 1, bias: 1.5, wMin: 0.5, wMax: 8, dir: 0, spread: 0, curve: 0, jag: 0, taper: false, opMin: 0.2, opMax: 0.8, mode: 'color', color: '#ff2bd6', base: '#0a0a12' } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), k = S / 512, rnd = U.rng(p.seed), STEPS = 14;
      if (p.mode === 'mask') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      else if (p.mode === 'color') { ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H); }
      ctx.fillStyle = p.mode === 'mask' ? '#ffffff' : p.color;
      const lmin = Math.min(p.lenMin, p.lenMax), lmax = Math.max(p.lenMin, p.lenMax);
      const wmin = Math.min(p.wMin, p.wMax), wmax = Math.max(p.wMin, p.wMax);
      const dir = (p.dir * Math.PI) / 180, spread = (p.spread * Math.PI) / 180;

      for (let i = 0; i < p.count; i++) {
        // draw all randoms for this scratch up front so settings don't reshuffle the layout
        const r = Array.from({ length: 6 }, rnd);
        const len = (lmin + (lmax - lmin) * Math.pow(r[0], p.bias)) * S;
        const width = (wmin + (wmax - wmin) * Math.pow(r[1], 1.5)) * k;
        let heading = dir + (r[2] - 0.5) * spread;
        const alpha = p.opMin + (p.opMax - p.opMin) * r[3];
        const turn = (r[4] - 0.5) * p.curve * 1.6;
        const sub = U.rng(p.seed * 7919 + i);
        let x = r[5] * W, y = sub() * H;
        const pts = [[x, y]];
        const step = len / STEPS;
        for (let s = 0; s < STEPS; s++) {
          heading += turn / STEPS + (sub() - 0.5) * p.jag * 0.5;
          x += Math.cos(heading) * step;
          y += Math.sin(heading) * step;
          pts.push([x, y]);
        }
        // one filled ribbon per scratch (tapered to points), so semi-transparent scratches have no
        // darker overlaps at the joints
        const left = [], right = [];
        for (let s = 0; s <= STEPS; s++) {
          const a = pts[Math.max(0, s - 1)], b = pts[Math.min(STEPS, s + 1)];
          const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
          const hw = (Math.max(0.35, width) / 2) * (p.taper ? Math.pow(Math.sin((Math.PI * s) / STEPS), 0.6) : 1);
          left.push([pts[s][0] - (ty / tl) * hw, pts[s][1] + (tx / tl) * hw]);
          right.push([pts[s][0] + (ty / tl) * hw, pts[s][1] - (tx / tl) * hw]);
        }
        const ribbon = left.concat(right.reverse());
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [px, py] of ribbon) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py); }
        ctx.globalAlpha = alpha;
        for (let oy = -2; oy <= 2; oy++) {
          for (let ox = -2; ox <= 2; ox++) {
            const dx = ox * W, dy = oy * H;
            if (x1 + dx < 0 || x0 + dx > W || y1 + dy < 0 || y0 + dy > H) continue;
            ctx.beginPath();
            U.polyPath(ctx, ribbon.map(([px, py]) => [px + dx, py + dy]));
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
    },
  });
})();
