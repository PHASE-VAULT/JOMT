/* Health bar: STUB, card only. Implementation pending. */
(function () {
  'use strict';
  const U = window.UGTG;

  U.register({
    id: 'healthbar',
    name: 'Health Bar',
    desc: 'Health / status bars for HUDs (not implemented yet)',
    tags: ['UI'],
    icon: U.icon('<rect x="3" y="9" width="18" height="6" rx="1.5"/><rect x="5" y="11" width="9" height="2" rx=".5"/>'),
    params: [
      { type: 'section', label: 'Bar' },
      { key: 'color', label: 'Color', type: 'color', default: '#5ad65a' },
    ],
    presets: [],
    // placeholder render until the generator is implemented
    render(ctx, W, H, p) {
      const w = W * 0.8, h = Math.max(4, H * 0.12), x = (W - w) / 2, y = (H - h) / 2;
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = p.color; ctx.fillRect(x + h * 0.15, y + h * 0.15, (w - h * 0.3) * 0.65, h * 0.7);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, h * 0.08); ctx.strokeRect(x, y, w, h);
    },
  });
})();
