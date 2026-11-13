/* Geometric symbol: STUB, card only. Implementation pending. */
(function () {
  'use strict';
  const U = window.UGTG;

  U.register({
    id: 'symbol',
    name: 'Geometric Symbol',
    desc: 'Geometric symbols, sigils and emblems (not implemented yet)',
    tags: ['UI'],
    icon: U.icon('<polygon points="12,3 20.5,17.5 3.5,17.5"/><circle cx="12" cy="12.7" r="3.2"/>'),
    params: [
      { type: 'section', label: 'Symbol' },
      { key: 'color', label: 'Color', type: 'color', default: '#ffffff' },
    ],
    presets: [],
    // placeholder render until the generator is implemented
    render(ctx, W, H, p) {
      const r = Math.min(W, H) * 0.38, cx = W / 2, cy = H / 2;
      ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, r * 0.06); ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + (i * U.TAU) / 3; ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.42, 0, U.TAU); ctx.stroke();
    },
  });
})();
