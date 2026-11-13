/* Debris / shattered glass ground: STUB, card only. Implementation pending. */
(function () {
  'use strict';
  const U = window.UGTG;

  U.register({
    id: 'debris',
    name: 'Debris & Shattered Glass',
    desc: 'Ground texture of scattered debris and shattered glass (not implemented yet)',
    tags: ['Texturing', 'Decals'],
    normalMap: false, // enable once the generator is implemented
    icon: U.icon('<polygon points="4,15 9,11 11,17"/><polygon points="13,6 18,9 14,12"/><polygon points="14,15 20,14 18,19"/>'),
    params: [
      { type: 'section', label: 'Debris' },
      { key: 'color', label: 'Color', type: 'color', default: '#cfe6ea' },
    ],
    presets: [],
    // placeholder render until the generator is implemented
    render(ctx, W, H, p) {
      const r = U.rng(7), s = Math.min(W, H);
      ctx.fillStyle = p.color; ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(1, s * 0.004);
      for (let i = 0; i < 40; i++) {
        const x = r() * W, y = r() * H, k = s * (0.015 + r() * 0.05), a = r() * U.TAU;
        ctx.globalAlpha = 0.35 + r() * 0.4; ctx.beginPath();
        for (let j = 0; j < 3; j++) { const b = a + (j * U.TAU) / 3 + (r() - 0.5); ctx[j ? 'lineTo' : 'moveTo'](x + Math.cos(b) * k, y + Math.sin(b) * k * (0.5 + r())); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },
  });
})();
