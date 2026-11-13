/* Grass billboard: side-view grass for alpha-tested / alpha-blended cards. Tufts of blades fanning out
   from the ground line, optional broad leaves, seed heads and flowers, midrib shading, root occlusion
   and a bottom alpha fade. The plant is always fitted inside the card with a side margin, so bushes
   never touch or leave the left / right edge. */
(function () {
  'use strict';
  const U = window.UGTG;

  const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c, k) => `rgb(${U.clamp(c[0] * k, 0, 255) | 0},${U.clamp(c[1] * k, 0, 255) | 0},${U.clamp(c[2] * k, 0, 255) | 0})`;
  const hasFlowers = (p) => p.flowers > 0;
  const hasHeads = (p) => p.heads > 0;

  U.register({
    id: 'grassCard',
    name: 'Grass Billboard',
    desc: 'Side-view grass cards with tufts, leaves, seed heads and flowers, alpha ready',
    tags: ['Nature', 'VFX'],
   
    icon: U.icon('<path d="M3 21h18"/><path d="M6 21c0-6-2-10-4-12"/><path d="M9 21c0-7 1-11 4-15"/><path d="M13 21c0-5 2-8 5-10"/><circle cx="18" cy="9" r="1.6"/><path d="M17 21c0-4-1-6-2-8"/>'),
    params: [
      { type: 'section', label: 'Layout' },
      { key: 'count', label: 'Blade count', type: 'int', min: 5, max: 3000, default: 320 },
      { key: 'tufts', label: 'Tufts', type: 'int', min: 1, max: 60, default: 9, tip: 'Blades grow in this many clumps' },
      { key: 'tuftWidth', label: 'Tuft width', type: 'range', min: 0.01, max: 1, step: 0.01, default: 0.12, tip: 'Fraction of the card width' },
      { key: 'scatter', label: 'Loose blades', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Share of blades placed anywhere instead of in a tuft' },
      { key: 'margin', label: 'Side margin', type: 'range', min: 0, max: 0.45, step: 0.01, default: 0.06, tip: 'Empty space kept at the left / right edge; the plant is scaled down if it would not fit' },
      { key: 'ground', label: 'Ground line', type: 'range', min: 0, max: 0.4, step: 0.005, default: 0.02, tip: 'Height of the root line above the bottom edge' },
      { key: 'rootJitter', label: 'Root depth variation', type: 'range', min: 0, max: 0.3, step: 0.005, default: 0.04 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 5 },
      { type: 'section', label: 'Blades' },
      { key: 'hMin', label: 'Min height', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.5 },
      { key: 'hMax', label: 'Max height', type: 'range', min: 0.05, max: 1.2, step: 0.01, default: 1.05 },
      { key: 'tuftShape', label: 'Tuft profile', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Blades in the middle of a tuft are taller' },
      { key: 'width', label: 'Blade width', type: 'range', min: 0.3, max: 40, step: 0.1, default: 7, tip: 'px @ 512 (card height)' },
      { key: 'taper', label: 'Tip sharpness', type: 'range', min: 0.2, max: 3, step: 0.01, default: 0.9 },
      { key: 'leaves', label: 'Broad leaves', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Share of blades drawn as wide, pointed leaves' },
      { key: 'midrib', label: 'Midrib fold shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { type: 'section', label: 'Wind & bend' },
      { key: 'lean', label: 'Wind lean', type: 'range', min: -60, max: 60, step: 1, default: 6 },
      { key: 'fan', label: 'Tuft fan-out', type: 'range', min: 0, max: 80, step: 1, default: 28, tip: 'Degrees blades at the tuft edge lean outward' },
      { key: 'leanVar', label: 'Lean variation', type: 'range', min: 0, max: 60, step: 1, default: 10 },
      { key: 'bend', label: 'Droop', type: 'range', min: 0, max: 2, step: 0.01, default: 0.55, tip: 'Blades curve over toward the side they lean' },
      { type: 'section', label: 'Seed heads & flowers' },
      { key: 'heads', label: 'Seed heads', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.06, tip: 'Share of stems topped by a wheat / oat style head' },
      { key: 'headLen', label: 'Head length', type: 'range', min: 0.05, max: 0.5, step: 0.01, default: 0.18, show: hasHeads },
      { key: 'headColor', label: 'Head color', type: 'color', default: '#c9b46a', show: hasHeads },
      { key: 'flowers', label: 'Flowers', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0 },
      { key: 'flowerSize', label: 'Flower size', type: 'range', min: 2, max: 40, step: 0.5, default: 9, show: hasFlowers, tip: 'px @ 512' },
      { key: 'flowerA', label: 'Flower color A', type: 'color', default: '#f4f1ff', show: hasFlowers },
      { key: 'flowerB', label: 'Flower color B', type: 'color', default: '#ffd23f', show: hasFlowers },
      { key: 'flowerCenter', label: 'Flower center', type: 'color', default: '#f2a20c', show: hasFlowers },
      { type: 'section', label: 'Colors' },
      { key: 'root', label: 'Root', type: 'color', default: '#1d3812' },
      { key: 'tip', label: 'Tip', type: 'color', default: '#8ccf45' },
      { key: 'dry', label: 'Dry blades', type: 'color', default: '#c2ad5a' },
      { key: 'dryAmt', label: 'Dry amount', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: 'variation', label: 'Brightness variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: 'depth', label: 'Depth shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Blades further back are darker' },
      { key: 'ao', label: 'Root occlusion', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Darkens the lower part of every blade' },
      { key: 'tipGlow', label: 'Tip translucency', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Brightens the tips like backlit grass' },
      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color + alpha'], ['mask', 'Alpha mask (white on black)'], ['bg', 'Color over background']] },
      { key: 'bg', label: 'Background', type: 'color', default: '#9db4c8', show: (p) => p.output === 'bg' },
      { key: 'fade', label: 'Bottom alpha fade', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0, show: (p) => p.output !== 'bg', tip: 'Fades the bottom of the card out so it blends into the ground' },
    ],
    presets: [
      // Realistic
      { name: 'Lawn edge', group: 'Realistic', values: { count: 520, tufts: 14, hMin: 0.4, hMax: 0.8, width: 5, heads: 0, dryAmt: 0.05 } },
      { name: 'Short turf', group: 'Realistic', values: { count: 900, tufts: 24, scatter: 0.4, hMin: 0.2, hMax: 0.45, width: 4, heads: 0, bend: 0.3 } },
      { name: 'Wild meadow', group: 'Realistic', values: { count: 420, heads: 0.12, flowers: 0.07, dryAmt: 0.22, root: '#2a4416', tip: '#a6cf55', tipGlow: 0.35 } },
      { name: 'Wheat field', group: 'Realistic', values: { count: 520, tufts: 30, tuftWidth: 0.05, scatter: 0.5, width: 3, bend: 0.3, lean: 4, fan: 12, heads: 0.45, headLen: 0.22, headColor: '#e8cf7a', root: '#6b5a2a', tip: '#e0c878', dry: '#c9a85a', dryAmt: 0.5, ao: 0.35 } },
      { name: 'Tall reeds', group: 'Realistic', values: { count: 170, tufts: 7, hMin: 0.75, hMax: 1.15, width: 5, taper: 0.5, bend: 0.2, fan: 14, heads: 0.12, headLen: 0.3, headColor: '#5a3a20', root: '#2c3a1a', tip: '#9aa860', dry: '#b8a66a', dryAmt: 0.2 } },
      { name: 'Autumn dry grass', group: 'Realistic', values: { root: '#4a3a1a', tip: '#d4a050', dry: '#a06a30', dryAmt: 0.6, heads: 0.1, headColor: '#c89a5a', tipGlow: 0.3 } },
      { name: 'Frosted winter grass', group: 'Realistic', values: { root: '#3a4a3a', tip: '#e8f0f0', dry: '#b0b8a0', dryAmt: 0.3, tipGlow: 0.5, bend: 0.8, heads: 0.04, headColor: '#e0e8e8' } },
      { name: 'Broadleaf weeds', group: 'Realistic', values: { count: 120, tufts: 6, leaves: 0.75, width: 9, hMin: 0.35, hMax: 0.8, midrib: 0.55, heads: 0, root: '#1f3a14', tip: '#6fae3a' } },
      { name: 'Daisy patch', group: 'Realistic', values: { flowers: 0.22, flowerA: '#ffffff', flowerB: '#f6f2ff', flowerCenter: '#f2c20c', flowerSize: 10, heads: 0.03 } },
      { name: 'Poppy field', group: 'Realistic', values: { flowers: 0.18, flowerA: '#e02a1a', flowerB: '#ff4a2a', flowerCenter: '#1a1a1a', flowerSize: 13, dryAmt: 0.15 } },
      { name: 'Lavender rows', group: 'Realistic', values: { count: 480, tufts: 8, tuftWidth: 0.09, heads: 0.4, headLen: 0.25, headColor: '#8a6ad0', root: '#3a4a30', tip: '#9ab880', dry: '#b0c0a0', dryAmt: 0.1, width: 3.5, bend: 0.25 } },
      { name: 'Single tuft (alpha card)', group: 'Realistic', values: { tufts: 1, tuftWidth: 0.5, count: 140, margin: 0.1, fan: 40, fade: 0.12, heads: 0.04 } },
      // Stylized
      { name: 'Toon lush', group: 'Stylized', values: { count: 150, width: 13, taper: 0.6, variation: 0.05, midrib: 0, ao: 0.3, depth: 0.3, tipGlow: 0.1, root: '#2a7a3a', tip: '#b8f060', dryAmt: 0, heads: 0 } },
      { name: 'Painterly meadow', group: 'Stylized', values: { count: 300, width: 9, flowers: 0.08, heads: 0.05, root: '#2f6a35', tip: '#c6e86a', tipGlow: 0.6, midrib: 0.15, flowerA: '#fff6e0', flowerB: '#ffb0c8' } },
      { name: 'Low-poly blades', group: 'Stylized', values: { count: 90, width: 15, taper: 0.3, midrib: 1, bend: 0.1, variation: 0.12, heads: 0, root: '#3a6a2a', tip: '#9ad050' } },
      { name: 'Pastel candy', group: 'Stylized', values: { root: '#6ac0a0', tip: '#f0d0f0', dry: '#fff0b0', dryAmt: 0.2, flowers: 0.1, flowerA: '#ff9ad0', flowerB: '#9ad0ff', flowerCenter: '#fff6a0', heads: 0 } },
      { name: 'Dark fantasy', group: 'Stylized', values: { root: '#141a14', tip: '#4a5a3a', dry: '#5a4a3a', dryAmt: 0.3, tipGlow: 0, bend: 0.9, heads: 0.06, headColor: '#3a3028' } },
      // Sci-fi
      { name: 'Bioluminescent alien grass', group: 'Sci-fi', values: { root: '#10203a', tip: '#40f0e0', dry: '#a040ff', dryAmt: 0.25, tipGlow: 1, ao: 0.8, heads: 0.08, headColor: '#d0a0ff' } },
      { name: 'Crimson alien reeds', group: 'Sci-fi', values: { count: 220, width: 4, hMin: 0.6, hMax: 1.1, root: '#2a0a10', tip: '#ff4060', dry: '#ff9a40', dryAmt: 0.15, heads: 0.2, headColor: '#ffd040', bend: 0.35 } },
      { name: 'Crystal shards', group: 'Sci-fi', values: { count: 80, width: 11, taper: 0.3, bend: 0, leanVar: 25, fan: 35, midrib: 1, root: '#204060', tip: '#c0f0ff', dryAmt: 0, tipGlow: 0.8, heads: 0 } },
      { name: 'Toxic wasteland', group: 'Sci-fi', values: { root: '#1a2a0a', tip: '#c0ff20', dry: '#6a5a20', dryAmt: 0.4, heads: 0.08, headColor: '#e0ff60', bend: 1 } },
    ],
    render(out, W, H, p) {
      // plants are drawn on a transparent canvas 3x as wide (card in the middle third), then fitted
      const off = U.canvas(W * 3, H);
      let ctx = off.getContext('2d');
      ctx.translate(W, 0);
      const k = H / 512, rnd = U.rng(p.seed), STEPS = 10;
      const mask = p.output === 'mask';
      const cRoot = U.hex(p.root), cTip = U.hex(p.tip), cDry = U.hex(p.dry), cHead = U.hex(p.headColor);
      const hmin = Math.min(p.hMin, p.hMax), hmax = Math.max(p.hMin, p.hMax);
      const x0 = p.margin, x1 = 1 - p.margin;
      const baseY = H * (1 - p.ground);

      // tuft centers, evenly spread with jitter so tufts don't pile up
      const trnd = U.rng(p.seed * 53 + 9), tufts = [];
      for (let i = 0; i < p.tufts; i++) tufts.push(U.lerp(x0, x1, (i + 0.5 + (trnd() - 0.5) * (p.tufts > 1 ? 0.6 : 0)) / p.tufts));

      const plants = [];
      for (let i = 0; i < p.count; i++) {
        const r = Array.from({ length: 8 }, rnd);
        let u, off = 0;
        if (r[0] < p.scatter) u = U.lerp(x0, x1, r[1]);
        else {
          // triangular distribution inside the tuft: dense in the middle
          off = (r[1] + r[2] - 1);
          u = tufts[(r[3] * tufts.length) | 0] + off * p.tuftWidth * 0.5;
          u = U.clamp(u, x0, x1);
        }
        const hShape = 1 - p.tuftShape * Math.abs(off) * 0.8;
        const kind = r[4] < p.flowers ? 'flower' : r[4] < p.flowers + p.heads ? 'head' : r[5] < p.leaves ? 'leaf' : 'blade';
        plants.push({ u, off, z: r[6], h: (hmin + (hmax - hmin) * Math.pow(r[7], 0.8)) * hShape, kind, sub: U.rng(p.seed * 7919 + i) });
      }
      plants.sort((a, b) => a.z - b.z); // back first

      const draw = (fn) => { ctx.save(); fn(); ctx.restore(); };

      for (const pl of plants) {
        const sub = pl.sub, s = Array.from({ length: 8 }, sub);
        const x = pl.u * W, y = baseY + H * p.rootJitter * (1 - pl.z) * s[0] + 2 * k;
        const deg = p.lean + pl.off * p.fan + (s[1] - 0.5) * 2 * p.leanVar;
        const heading = -Math.PI / 2 + (deg * Math.PI) / 180;
        const side = Math.sign(deg) || (s[2] < 0.5 ? -1 : 1);
        const stem = pl.kind === 'head' || pl.kind === 'flower';
        const curl = side * p.bend * (stem ? 0.35 : 0.4 + 0.6 * s[2]);
        const len = pl.h * H * (0.8 + 0.2 * pl.z);

        // centerline
        const pts = [[x, y]], step = len / STEPS;
        let cx = x, cy = y;
        for (let i = 1; i <= STEPS; i++) {
          const a = heading + curl * Math.pow(i / STEPS, 2);
          cx += Math.cos(a) * step;
          cy += Math.sin(a) * step;
          pts.push([cx, cy]);
        }
        const w = p.width * k * (0.6 + 0.8 * s[3]) * (pl.kind === 'leaf' ? 2.6 : stem ? 0.3 : 1);
        const left = [], right = [], mid = [];
        for (let i = 0; i <= STEPS; i++) {
          const a = pts[Math.max(0, i - 1)], b = pts[Math.min(STEPS, i + 1)], t = i / STEPS;
          const tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
          const prof = pl.kind === 'leaf' ? Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.9 + 0.1)), 0.8) * (1 - t * 0.2) : stem ? 1 - t * 0.5 : Math.pow(1 - t, p.taper);
          const hw = (Math.max(0.35, w) / 2) * prof;
          left.push([pts[i][0] - (ty / tl) * hw, pts[i][1] + (tx / tl) * hw]);
          right.push([pts[i][0] + (ty / tl) * hw, pts[i][1] - (tx / tl) * hw]);
          mid.push(pts[i]);
        }
        const ribbon = left.concat(right.slice().reverse());

        // colors
        const dry = s[4] < p.dryAmt;
        const shade = (1 - p.depth * 0.7 * (1 - pl.z)) * (1 + (s[5] - 0.5) * p.variation);
        const rootC = dry ? mixC(cRoot, cDry, 0.4) : cRoot, tipC = dry ? mixC(cTip, cDry, 0.75) : cTip;
        let fill;
        if (mask) fill = '#fff';
        else {
          const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[STEPS][0], pts[STEPS][1]);
          g.addColorStop(0, css(rootC, shade * (1 - p.ao * 0.75)));
          g.addColorStop(0.45, css(mixC(rootC, tipC, 0.55), shade));
          g.addColorStop(1, css(tipC, shade * (1 + p.tipGlow * 0.45)));
          fill = g;
        }

        draw(() => {
          ctx.fillStyle = fill;
          ctx.beginPath();
          U.polyPath(ctx, ribbon);
          ctx.fill();
          // midrib fold: one half of the blade is turned away from the light
          if (!mask && p.midrib > 0 && !stem) {
            ctx.fillStyle = `rgba(0,0,0,${0.35 * p.midrib})`;
            ctx.beginPath();
            U.polyPath(ctx, (side > 0 ? left : right).concat(mid.slice().reverse()));
            ctx.fill();
          }
          const tip = pts[STEPS], pre = pts[STEPS - 1];
          const ta = Math.atan2(tip[1] - pre[1], tip[0] - pre[0]);
          if (pl.kind === 'head') {
            // wheat / oat head: alternating grains along the last part of the stem
            const n = 9, hl = p.headLen * H * (0.7 + 0.3 * pl.z), gs = Math.max(1, w * 2.2);
            ctx.fillStyle = mask ? '#fff' : css(dry ? mixC(cHead, cDry, 0.5) : cHead, shade);
            for (let i = 0; i < n; i++) {
              const t = i / (n - 1), along = hl * (t - 0.85);
              const gx = tip[0] + Math.cos(ta) * along, gy = tip[1] + Math.sin(ta) * along;
              const sd = i % 2 ? 1 : -1, sz = gs * (1 - t * 0.45);
              ctx.beginPath();
              ctx.ellipse(gx + Math.cos(ta + sd * 1.2) * sz * 0.5, gy + Math.sin(ta + sd * 1.2) * sz * 0.5, sz, sz * 0.42, ta + sd * 0.45, 0, U.TAU);
              ctx.fill();
            }
          } else if (pl.kind === 'flower') {
            const fs = p.flowerSize * k * (0.7 + 0.5 * s[6]), petals = 5 + ((s[7] * 3) | 0);
            ctx.fillStyle = mask ? '#fff' : css(U.hex(s[7] < 0.5 ? p.flowerA : p.flowerB), Math.min(1.1, shade + 0.15));
            for (let i = 0; i < petals; i++) {
              const a = (i / petals) * U.TAU + s[6] * 3;
              ctx.beginPath();
              ctx.ellipse(tip[0] + Math.cos(a) * fs * 0.5, tip[1] + Math.sin(a) * fs * 0.32, fs * 0.5, fs * 0.24, a, 0, U.TAU);
              ctx.fill();
            }
            ctx.fillStyle = mask ? '#fff' : p.flowerCenter;
            ctx.beginPath();
            ctx.arc(tip[0], tip[1], fs * 0.22, 0, U.TAU);
            ctx.fill();
          }
        });
      }

      // fit: horizontal extent of everything drawn, scaled (uniformly, roots on the ground) into the margins
      const PW = W * 3, od = ctx.getImageData(0, 0, PW, H).data;
      let bx0 = PW, bx1 = -1, by0 = H;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < PW; x++) {
          if (od[(y * PW + x) * 4 + 3] < 4) continue;
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
        }
      }
      ctx = out;
      if (mask) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      else if (p.output === 'bg') { ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H); }
      if (bx1 >= bx0) {
        const bw = bx1 - bx0 + 1, room = W * (1 - 2 * p.margin) - 2;
        const s = Math.min(1, room / bw, (H * 0.99) / Math.max(1, H - by0));
        ctx.drawImage(off, bx0, 0, bw, H, W / 2 - (bw * s) / 2, H - H * s, bw * s, H * s);
      }

      if (p.fade > 0 && p.output !== 'bg') {
        // fade the bottom: alpha for 'color', toward black for the mask. destination-in clears
        // everything the fill doesn't cover, so the gradient covers the whole card (opaque above the fade).
        const g = ctx.createLinearGradient(0, H, 0, H * (1 - p.fade));
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.save();
        ctx.globalCompositeOperation = 'destination-in';
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
        if (mask) {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      }
    },
  });
})();
