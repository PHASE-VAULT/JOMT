/* Red dot / holographic sight reticle (1x reflex). Drawn in white so it can be tinted in engine.
   Reticle parts (dot, delta triangle, chevron, cross, rings, segments, ticks, posts, BDC dots) are drawn
   crisp, then made to look like a projected LED: noise warp and emitter grain (irregularity), core
   softness, a two-radius glow and an astigmatism starburst. Sizes are px @ 512. */
(function () {
  'use strict';
  const U = window.UGTG;

  const on = (k) => (p) => !!p[k];
  const POSTS = [['none', 'None'], ['all', 'All four'], ['bottom', 'Bottom'], ['sides', 'Left + right'], ['sidesBottom', 'Left + right + bottom'], ['top', 'Top']];
  const POST_DIRS = { all: [0, 1, 2, 3], bottom: [1], sides: [2, 3], sidesBottom: [1, 2, 3], top: [0], none: [] };
  const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]]; // up, down, left, right

  U.register({
    id: 'redDot',
    name: 'Red Dot Sight',
    desc: '1x reflex / holographic reticles: dots, rings, deltas, chevrons with LED glow and irregularity',
    tags: ['UI', 'Shooter'],
    bg: 'black',
    icon: U.icon('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>'),
    params: [
      { type: 'section', label: 'Center' },
      { key: 'scale', label: 'Reticle scale', type: 'range', min: 0.25, max: 6, step: 0.05, default: 2.5, tip: 'Zooms the whole reticle (incl. glow) inside the texture' },
      { key: 'center', label: 'Center mark', type: 'select', default: 'dot', options: [['none', 'None'], ['dot', 'Dot'], ['triangle', 'Delta triangle'], ['chevron', 'Chevron (^)'], ['cross', 'Cross'], ['diamond', 'Diamond']] },
      { key: 'cSize', label: 'Size', type: 'range', min: 1, max: 60, step: 0.5, default: 6, show: (p) => p.center !== 'none', tip: 'Dot diameter / mark height, px @ 512' },
      { key: 'cWidth', label: 'Line width', type: 'range', min: 0.5, max: 12, step: 0.1, default: 2.5, show: (p) => p.center === 'chevron' || p.center === 'cross' || p.center === 'diamond' },
      { key: 'cFilled', label: 'Filled', type: 'bool', default: true, show: (p) => p.center === 'triangle' || p.center === 'diamond' },
      { key: 'cGap', label: 'Cross gap', type: 'range', min: 0, max: 30, step: 0.5, default: 0, show: (p) => p.center === 'cross' },
      { type: 'section', label: 'Ring' },
      { key: 'ring', label: 'Ring', type: 'bool', default: false },
      { key: 'ringR', label: 'Radius', type: 'range', min: 5, max: 240, step: 0.5, default: 70, show: on('ring') },
      { key: 'ringW', label: 'Thickness', type: 'range', min: 0.5, max: 20, step: 0.1, default: 3, show: on('ring') },
      { key: 'ringSeg', label: 'Segments', type: 'int', min: 0, max: 16, default: 0, show: on('ring'), tip: '0 = closed ring' },
      { key: 'ringGap', label: 'Segment gap', type: 'range', min: 0.05, max: 0.9, step: 0.01, default: 0.3, show: (p) => p.ring && p.ringSeg > 0 },
      { key: 'ringRot', label: 'Segment rotation', type: 'range', min: -180, max: 180, step: 1, default: 45, show: (p) => p.ring && p.ringSeg > 0 },
      { key: 'ringTicks', label: 'Cardinal ticks', type: 'select', default: 'none', options: [['none', 'None'], ['in', 'Inward'], ['out', 'Outward']], show: on('ring') },
      { key: 'tickLen', label: 'Tick length', type: 'range', min: 1, max: 60, step: 0.5, default: 12, show: (p) => p.ring && p.ringTicks !== 'none' },
      { key: 'ring2', label: 'Second ring', type: 'bool', default: false },
      { key: 'ring2R', label: 'Radius', type: 'range', min: 5, max: 240, step: 0.5, default: 110, show: on('ring2') },
      { key: 'ring2W', label: 'Thickness', type: 'range', min: 0.5, max: 20, step: 0.1, default: 2, show: on('ring2') },
      { type: 'section', label: 'Posts & BDC' },
      { key: 'posts', label: 'Posts', type: 'select', default: 'none', options: POSTS },
      { key: 'postIn', label: 'Inner end', type: 'range', min: 0, max: 200, step: 0.5, default: 20, show: (p) => p.posts !== 'none' },
      { key: 'postOut', label: 'Outer end', type: 'range', min: 5, max: 256, step: 0.5, default: 60, show: (p) => p.posts !== 'none' },
      { key: 'postW', label: 'Width', type: 'range', min: 0.5, max: 16, step: 0.1, default: 3, show: (p) => p.posts !== 'none' },
      { key: 'bdc', label: 'BDC dots below', type: 'int', min: 0, max: 5, default: 0 },
      { key: 'bdcSpacing', label: 'BDC spacing', type: 'range', min: 4, max: 80, step: 0.5, default: 22, show: (p) => p.bdc > 0 },
      { key: 'bdcSize', label: 'BDC dot size', type: 'range', min: 1, max: 20, step: 0.5, default: 4, show: (p) => p.bdc > 0 },
      { type: 'section', label: 'Emitter' },
      { key: 'brightness', label: 'Brightness', type: 'range', min: 0.1, max: 2, step: 0.01, default: 1 },
      { key: 'softness', label: 'Core softness', type: 'range', min: 0, max: 6, step: 0.05, default: 0.6, tip: 'Blur of the crisp reticle, px @ 512' },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 2, step: 0.01, default: 0.6 },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 1, max: 60, step: 0.5, default: 10, show: (p) => p.glow > 0 },
      { key: 'astig', label: 'Astigmatism / starburst', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Smears the light along an axis, like a dot seen with astigmatism' },
      { key: 'astigAngle', label: 'Starburst angle', type: 'range', min: -90, max: 90, step: 1, default: 65, show: (p) => p.astig > 0 },
      { key: 'astigLen', label: 'Starburst length', type: 'range', min: 2, max: 80, step: 0.5, default: 18, show: (p) => p.astig > 0 },
      { key: 'gamma', label: 'Gamma', type: 'range', min: 0.3, max: 3, step: 0.01, default: 1 },
      { type: 'section', label: 'Irregularity' },
      { key: 'warp', label: 'Distortion', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1, tip: 'Noise warp of the projected shape' },
      { key: 'warpScale', label: 'Distortion scale', type: 'range', min: 1, max: 40, step: 0.5, default: 8, show: (p) => p.warp > 0 },
      { key: 'grain', label: 'Emitter noise', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Uneven brightness and speckle inside the reticle' },
      { key: 'grainScale', label: 'Noise scale', type: 'range', min: 2, max: 120, step: 1, default: 30, show: (p) => p.grain > 0 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 5 },
      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'black', options: [['black', 'White on black (additive)'], ['alpha', 'White + alpha']] },
      { key: 'tint', label: 'Tint', type: 'color', default: '#ffffff', tip: 'Leave white to tint in engine' },
    ],
    presets: [
      // Realistic
      { name: 'Tiny 1 MOA dot', group: 'Realistic', values: { scale: 3, cSize: 3, glow: 0.5, glowSize: 6, softness: 0.4 } },
      { name: 'Large 6 MOA dot', group: 'Realistic', values: { cSize: 12, glow: 0.7, glowSize: 14, softness: 1 } },
      { name: 'Astigmatic dot', group: 'Realistic', values: { scale: 4, cSize: 6, astig: 0.75, astigAngle: 65, astigLen: 22, glow: 0.7, grain: 0.1 } },
      { name: 'Holographic ring + dot (65 MOA)', group: 'Realistic', values: { cSize: 4, ring: true, ringR: 80, ringW: 3, glow: 0.55, glowSize: 7, warp: 0.15, grain: 0.35, grainScale: 60 } },
      { name: 'Holographic ring, cardinal ticks', group: 'Realistic', values: { cSize: 4, ring: true, ringR: 80, ringW: 3, ringTicks: 'in', tickLen: 14, glow: 0.55, glowSize: 7, warp: 0.15, grain: 0.35, grainScale: 60 } },
      { name: 'Holographic 2-dot BDC', group: 'Realistic', values: { cSize: 4, ring: true, ringR: 80, ringW: 3, bdc: 1, bdcSpacing: 40, bdcSize: 4, glow: 0.55, glowSize: 7, warp: 0.15, grain: 0.35, grainScale: 60 } },
      { name: 'Circle-dot (32 MOA)', group: 'Realistic', values: { cSize: 4, ring: true, ringR: 42, ringW: 2.4, glow: 0.6, glowSize: 8 } },
      { name: 'Segmented holo ring', group: 'Realistic', values: { cSize: 4, ring: true, ringR: 70, ringW: 3.5, ringSeg: 4, ringGap: 0.35, ringRot: 45, glow: 0.55, grain: 0.3, grainScale: 60 } },
      { name: 'Delta triangle', group: 'Realistic', values: { center: 'triangle', cSize: 10, glow: 0.6, glowSize: 8 } },
      { name: 'Delta triangle, open', group: 'Realistic', values: { center: 'triangle', cSize: 16, cFilled: false, cWidth: 2.2, glow: 0.55 } },
      { name: 'Cobra-style dot', group: 'Realistic', values: { scale: 4, cSize: 5, glow: 0.6, glowSize: 9, grain: 0.25, warp: 0.2 } },
      { name: 'Cobra-style chevron', group: 'Realistic', values: { center: 'chevron', cSize: 18, cWidth: 3, posts: 'bottom', postIn: 26, postOut: 70, postW: 3, glow: 0.6, grain: 0.25, warp: 0.2 } },
      { name: 'Cobra-style chevron + sides', group: 'Realistic', values: { center: 'chevron', cSize: 16, cWidth: 3, posts: 'sidesBottom', postIn: 32, postOut: 80, postW: 3, glow: 0.6, grain: 0.25, warp: 0.2 } },
      { name: 'Cobra-style crosshair', group: 'Realistic', values: { center: 'cross', cSize: 40, cWidth: 3, cGap: 6, glow: 0.55, grain: 0.25, warp: 0.2 } },
      { name: 'Illuminated chevron', group: 'Realistic', values: { center: 'chevron', cSize: 22, cWidth: 4, glow: 0.7, glowSize: 12 } },
      { name: 'Old reflex bullseye', group: 'Realistic', values: { scale: 2, cSize: 5, ring: true, ringR: 40, ringW: 2, ring2: true, ring2R: 95, ring2W: 2, glow: 0.5, warp: 0.25, warpScale: 6, grain: 0.4 } },
      { name: 'Worn cheap emitter', group: 'Realistic', values: { cSize: 7, ring: true, ringR: 60, ringW: 3, warp: 0.6, warpScale: 5, grain: 0.7, grainScale: 18, astig: 0.3, glow: 0.7 } },
      { name: 'Dim night setting', group: 'Realistic', values: { scale: 4, cSize: 4, brightness: 0.35, glow: 0.25, glowSize: 6, grain: 0.2 } },
      // Game-inspired
      { name: 'Tarkov-style Kobra', group: 'Game-inspired', values: { center: 'chevron', cSize: 16, cWidth: 3, posts: 'bottom', postIn: 24, postOut: 64, postW: 3, glow: 0.65, glowSize: 9, grain: 0.3, warp: 0.25 } },
      { name: 'CoD-style ring dot', group: 'Game-inspired', values: { cSize: 5, ring: true, ringR: 55, ringW: 4, glow: 0.75, glowSize: 12 } },
      { name: 'Battlefield-style holo', group: 'Game-inspired', values: { cSize: 4, ring: true, ringR: 75, ringW: 2.6, ringSeg: 4, ringGap: 0.2, ringRot: 0, ringTicks: 'in', tickLen: 10, glow: 0.6 } },
      { name: 'Apex-style holo', group: 'Game-inspired', values: { center: 'dot', cSize: 4, ring: true, ringR: 60, ringW: 3, ringTicks: 'out', tickLen: 14, glow: 0.65 } },
      { name: 'PUBG-style red dot', group: 'Game-inspired', values: { scale: 4, cSize: 7, glow: 0.8, glowSize: 12, astig: 0.15 } },
      { name: 'R6-style reflex', group: 'Game-inspired', values: { center: 'diamond', cSize: 8, cFilled: true, ring: true, ringR: 30, ringW: 2, glow: 0.6 } },
      { name: 'CS-style dot sight', group: 'Game-inspired', values: { cSize: 5, posts: 'all', postIn: 14, postOut: 34, postW: 2.4, glow: 0.5 } },
      // Stylized
      { name: 'Crisp vector dot', group: 'Stylized', values: { scale: 4, cSize: 8, softness: 0, glow: 0, grain: 0, warp: 0 } },
      { name: 'Crisp ring + cross', group: 'Stylized', values: { center: 'cross', cSize: 20, cWidth: 3, cGap: 5, ring: true, ringR: 50, ringW: 3, softness: 0, glow: 0.2, grain: 0, warp: 0 } },
      { name: 'Soft bloom dot', group: 'Stylized', values: { scale: 4, cSize: 10, softness: 3, glow: 1.4, glowSize: 30, grain: 0, warp: 0 } },
      // Sci-fi
      { name: 'Plasma delta', group: 'Sci-fi', values: { center: 'triangle', cSize: 10, ring: true, ringR: 60, ringW: 2.4, ringSeg: 3, ringGap: 0.45, ringRot: 90, glow: 0.9, glowSize: 14, warp: 0.35, warpScale: 14, grain: 0.3 } },
      { name: 'Hologram glitch', group: 'Sci-fi', values: { center: 'diamond', cSize: 10, cFilled: false, cWidth: 2, ring: true, ringR: 70, ringW: 2.5, ringSeg: 8, ringGap: 0.3, warp: 0.8, warpScale: 30, grain: 0.6, grainScale: 90, glow: 0.7 } },
      { name: 'Energy cross', group: 'Sci-fi', values: { center: 'cross', cSize: 60, cWidth: 2.5, cGap: 14, ring2: true, ring2R: 40, ring2W: 1.5, astig: 0.35, astigAngle: 0, astigLen: 30, glow: 1, glowSize: 14 } },
      { name: 'Targeting brackets', group: 'Sci-fi', values: { center: 'dot', cSize: 3, ring: true, ringR: 50, ringW: 3, ringSeg: 4, ringGap: 0.6, ringRot: 45, posts: 'all', postIn: 64, postOut: 90, postW: 2, glow: 0.8 } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), k = (S / 512) * p.scale, cx = W / 2, cy = H / 2;

      /* 1. crisp reticle, white on transparent */
      const A = U.canvas(W, H), a = A.getContext('2d');
      a.translate(cx, cy);
      a.scale(k, k);
      a.strokeStyle = a.fillStyle = '#fff';
      a.lineCap = 'round';
      a.lineJoin = 'round';
      const z = p.cSize;
      switch (p.center) {
        case 'dot': a.beginPath(); a.arc(0, 0, z / 2, 0, U.TAU); a.fill(); break;
        case 'triangle': {
          // delta pointing up with the aim point at its tip
          a.beginPath(); a.moveTo(0, 0); a.lineTo(-z * 0.58, z); a.lineTo(z * 0.58, z); a.closePath();
          if (p.cFilled) a.fill(); else { a.lineWidth = p.cWidth; a.stroke(); }
          break;
        }
        case 'chevron': a.lineWidth = p.cWidth; a.beginPath(); a.moveTo(-z * 0.6, z * 0.7); a.lineTo(0, 0); a.lineTo(z * 0.6, z * 0.7); a.stroke(); break;
        case 'cross': {
          a.lineWidth = p.cWidth; a.beginPath();
          for (const [dx, dy] of DIRS) { a.moveTo(dx * p.cGap, dy * p.cGap); a.lineTo(dx * z / 2, dy * z / 2); }
          a.stroke();
          break;
        }
        case 'diamond':
          a.beginPath(); a.moveTo(0, -z / 2); a.lineTo(z / 2, 0); a.lineTo(0, z / 2); a.lineTo(-z / 2, 0); a.closePath();
          if (p.cFilled) a.fill(); else { a.lineWidth = p.cWidth; a.stroke(); }
          break;
      }
      if (p.ring) {
        a.lineWidth = p.ringW; a.lineCap = 'butt';
        if (p.ringSeg > 0) {
          const segA = U.TAU / p.ringSeg, gap = segA * p.ringGap, r0 = (p.ringRot * Math.PI) / 180;
          for (let i = 0; i < p.ringSeg; i++) { a.beginPath(); a.arc(0, 0, p.ringR, r0 + i * segA + gap / 2, r0 + (i + 1) * segA - gap / 2); a.stroke(); }
        } else { a.beginPath(); a.arc(0, 0, p.ringR, 0, U.TAU); a.stroke(); }
        if (p.ringTicks !== 'none') {
          a.beginPath();
          for (const [dx, dy] of DIRS) {
            const r1 = p.ringR, r2 = p.ringTicks === 'in' ? p.ringR - p.tickLen : p.ringR + p.tickLen;
            a.moveTo(dx * r1, dy * r1); a.lineTo(dx * r2, dy * r2);
          }
          a.stroke();
        }
        a.lineCap = 'round';
      }
      if (p.ring2) { a.lineWidth = p.ring2W; a.beginPath(); a.arc(0, 0, p.ring2R, 0, U.TAU); a.stroke(); }
      if (p.posts !== 'none') {
        a.lineWidth = p.postW; a.lineCap = 'butt'; a.beginPath();
        for (const i of POST_DIRS[p.posts]) { const [dx, dy] = DIRS[i]; a.moveTo(dx * p.postIn, dy * p.postIn); a.lineTo(dx * p.postOut, dy * p.postOut); }
        a.stroke();
      }
      for (let i = 1; i <= p.bdc; i++) { a.beginPath(); a.arc(0, i * p.bdcSpacing, p.bdcSize / 2, 0, U.TAU); a.fill(); }

      /* 2. softness, then warp + emitter grain per pixel */
      let srcC = A;
      if (p.softness > 0) {
        const B0 = U.canvas(W, H), b0 = B0.getContext('2d');
        if (typeof b0.filter === 'string') b0.filter = `blur(${p.softness * k}px)`;
        b0.drawImage(A, 0, 0);
        srcC = B0;
      }
      const src = srcC.getContext('2d').getImageData(0, 0, W, H).data;
      const B = U.canvas(W, H), b = B.getContext('2d'), bimg = b.createImageData(W, H), bd = bimg.data;
      const amp = p.warp * 6 * k, ws = p.warpScale / S, gsc = p.grainScale / S;
      const alphaAt = (x, y) => {
        // bilinear alpha lookup
        if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return 0;
        const x0 = x | 0, y0 = y | 0, x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), tx = x - x0, ty = y - y0;
        const g = (xx, yy) => src[(yy * W + xx) * 4 + 3];
        return (g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty) + (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty;
      };
      for (let y = 0, o = 0; y < H; y++) {
        for (let x = 0; x < W; x++, o += 4) {
          let v;
          if (amp > 0) {
            const wx = U.perlin(x * ws, y * ws, 0, 0, p.seed) * amp, wy = U.perlin(x * ws + 17, y * ws + 5, 0, 0, p.seed + 1) * amp;
            v = alphaAt(x + wx, y + wy);
          } else v = src[o + 3];
          if (v > 0 && p.grain > 0) {
            const n = U.fractal('perlin', x * gsc, y * gsc, 0, 0, 3, 0.5, 'fbm', p.seed + 2);
            v *= 1 - p.grain * (0.75 * U.clamp((0.62 - n) * 2.2) + 0.25 * U.hash(x, y, p.seed));
          }
          bd[o] = bd[o + 1] = bd[o + 2] = 255; bd[o + 3] = v;
        }
      }
      b.putImageData(bimg, 0, 0);

      /* 3. light: core + astigmatism smear + two-radius glow, added up */
      const C = U.canvas(W, H), c = C.getContext('2d');
      c.globalCompositeOperation = 'lighter';
      c.drawImage(B, 0, 0);
      if (p.astig > 0) {
        const N = 14, ang = (p.astigAngle * Math.PI) / 180, L = p.astigLen * k;
        for (let i = 1; i <= N; i++) {
          const t = i / N, dx = Math.cos(ang) * L * t, dy = Math.sin(ang) * L * t;
          c.globalAlpha = p.astig * 0.55 * (1 - t) ** 1.5;
          c.drawImage(B, dx, dy); c.drawImage(B, -dx, -dy);
        }
      }
      if (p.glow > 0 && typeof c.filter === 'string') {
        c.filter = `blur(${p.glowSize * k * 0.35}px)`; c.globalAlpha = Math.min(1, p.glow * 0.7); c.drawImage(B, 0, 0);
        c.filter = `blur(${p.glowSize * k}px)`; c.globalAlpha = Math.min(1, p.glow * 0.55); c.drawImage(B, 0, 0);
        c.filter = 'none';
      }

      /* 4. output */
      const cd = c.getImageData(0, 0, W, H).data, tint = U.hex(p.tint);
      U.pixels(ctx, W, H, (x, y, o) => {
        const v = Math.pow(Math.min(1, (cd[(y * W + x) * 4 + 3] / 255) * p.brightness), p.gamma);
        if (p.output === 'alpha') { o[0] = tint[0]; o[1] = tint[1]; o[2] = tint[2]; o[3] = v * 255; }
        else { o[0] = tint[0] * v; o[1] = tint[1] * v; o[2] = tint[2] * v; }
      });
    },
  });
})();
