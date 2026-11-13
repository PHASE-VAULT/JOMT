/* (Blood) splatter decal. Every blob, spike segment, droplet and mist dot is a compact metaball
   splatted into a density field; thresholding the field makes nearby drops merge like liquid.
   A noisy threshold gives organic edges; the rim can be darkened like drying fluid. */
(function () {
  'use strict';
  const U = window.UGTG;
  const TAU = Math.PI * 2;

  U.register({
    id: 'splatter',
    name: 'Splatter',
    desc: 'Blood / paint / liquid splatter decals with drops, spikes and mist',
    tags: ['Decals', 'Shooter'],
    bg: 'white',
    icon: U.icon('<path d="M12 7c3 0 5 2 5 5s-2 5-5 5-5-2-5-5 2-5 5-5z"/><circle cx="19.5" cy="6" r="1.2"/><circle cx="4.5" cy="18" r="1"/><circle cx="20" cy="17" r=".7"/><path d="M12 7V3M7.5 8.5L5 6" opacity=".6"/>'),
    params: [
      { type: 'section', label: 'Splatter' },
      { key: 'size', label: 'Main blob size', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.2 },
      { key: 'blobs', label: 'Blob count', type: 'int', min: 1, max: 12, default: 4 },
      { key: 'blobSpread', label: 'Blob spread', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, show: (p) => p.blobs > 1 },
      { key: 'blobVar', label: 'Blob size variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.blobs > 1 },
      { key: 'irregular', label: 'Edge irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4 },
      { key: 'spikes', label: 'Spikes', type: 'int', min: 0, max: 48, default: 14 },
      { key: 'spikeLen', label: 'Spike length', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.45, show: (p) => p.spikes > 0 },
      { key: 'droplets', label: 'Droplets', type: 'int', min: 0, max: 400, default: 70 },
      { key: 'spread', label: 'Droplet spread', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.85, show: (p) => p.droplets > 0 },
      { key: 'dropSize', label: 'Droplet size', type: 'range', min: 0.005, max: 0.1, step: 0.001, default: 0.03, show: (p) => p.droplets > 0 },
      { key: 'mist', label: 'Mist dots', type: 'int', min: 0, max: 1500, default: 220 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 31 },
      { type: 'section', label: 'Impact direction' },
      { key: 'directional', label: 'Directionality', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: '0 = radial burst, 1 = everything flies one way as teardrops' },
      { key: 'direction', label: 'Direction', type: 'range', min: -180, max: 180, step: 1, default: 0, show: (p) => p.directional > 0 },
      { type: 'section', label: 'Color' },
      { key: 'color', label: 'Color', type: 'color', default: '#7a0a0a' },
      { key: 'rim', label: 'Rim darkening', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55 },
      { key: 'rimColor', label: 'Rim color', type: 'color', default: '#360303', show: (p) => p.rim > 0 },
      { key: 'bgMode', label: 'Background', type: 'select', default: 'transparent', options: [['transparent', 'Transparent'], ['color', 'Solid color']] },
      { key: 'bgColor', label: 'Background color', type: 'color', default: '#e8e4dc', show: (p) => p.bgMode === 'color' },
    ],
    presets: [
      { name: 'Fresh blood', group: 'Realistic', values: { color: '#9e0b0b', rim: 0.3, rimColor: '#4a0303', size: 0.26, spikes: 22, droplets: 120, mist: 400, directional: 0.15, irregular: 0.5, seed: 44 } },
      { name: 'Dried blood', group: 'Realistic', values: { irregular: 0.6, mist: 100, seed: 12, color: '#4c1410', rim: 0.8, rimColor: '#1e0806' } },
      { name: 'Blood pool', group: 'Realistic', values: { size: 0.38, blobs: 3, blobSpread: 0.35, spikes: 4, spikeLen: 0.2, droplets: 20, mist: 30, directional: 0, rim: 0.7 } },
      { name: 'Gunshot spray', group: 'Realistic', values: { size: 0.08, blobs: 2, blobSpread: 0.3, spikes: 24, spikeLen: 0.35, droplets: 220, spread: 0.65, dropSize: 0.012, mist: 1200, directional: 0.75, direction: -20 } },
      { name: 'Cast-off trail', group: 'Realistic', values: { size: 0.06, blobs: 8, blobSpread: 0.5, blobVar: 0.8, spikes: 6, spikeLen: 0.2, droplets: 150, spread: 0.45, dropSize: 0.02, mist: 120, directional: 1, direction: 30 } },
      { name: 'Blood drops', group: 'Realistic', values: { size: 0.03, blobs: 1, spikes: 0, droplets: 40, spread: 1, dropSize: 0.05, mist: 0, directional: 0, irregular: 0.25, rim: 0.7 } },
      { name: 'Paint splash', group: 'Realistic', values: { irregular: 0.2, seed: 90, color: '#1f6fd6', rim: 0.2, rimColor: '#0f3a80' } },
      { name: 'Mud splatter', group: 'Realistic', values: { irregular: 0.8, droplets: 150, mist: 500, seed: 7, color: '#4c3824', rim: 0.4, rimColor: '#2a1d10' } },
      { name: 'Oil stain', group: 'Realistic', values: { size: 0.35, blobs: 3, blobSpread: 0.3, irregular: 0.7, spikes: 0, droplets: 10, mist: 0, directional: 0, color: '#1a1712', rim: 0.4, rimColor: '#000000' } },
      { name: 'Ink blot', group: 'Realistic', values: { size: 0.25, spikes: 30, spikeLen: 0.6, mist: 80, directional: 0, color: '#0b0d1a', rim: 0.3, rimColor: '#000000', bgMode: 'color', bgColor: '#f4efe2' } },
      { name: 'Coffee spill', group: 'Realistic', values: { size: 0.3, blobs: 2, spikes: 2, droplets: 15, mist: 0, directional: 0, color: '#8a5530', rim: 0.95, rimColor: '#3e200c', bgMode: 'color', bgColor: '#f2eee6' } },
      { name: 'Paintball hit', group: 'Stylized', values: { size: 0.15, irregular: 0.1, spikes: 20, spikeLen: 0.7, droplets: 40, mist: 0, directional: 0, color: '#ff3ab0', rim: 0 } },
      { name: 'Toon blood', group: 'Stylized', values: { irregular: 0.1, spikes: 10, droplets: 30, seed: 77, dropSize: 0.04, mist: 0, color: '#e01020', rim: 0 } },
      { name: 'Comic ink splash', group: 'Stylized', values: { irregular: 0, spikes: 36, spikeLen: 0.9, droplets: 60, mist: 0, directional: 0, color: '#111111', rim: 0 } },
      { name: 'Slime', group: 'Stylized', values: { size: 0.25, irregular: 0.3, spikes: 6, droplets: 40, mist: 40, seed: 3, color: '#5ad62a', rim: 0.6, rimColor: '#2a7a10' } },
      { name: 'Alien goo', group: 'Sci-fi', values: { size: 0.22, blobs: 7, blobSpread: 0.6, irregular: 0.5, spikes: 8, droplets: 60, mist: 80, color: '#9aff3a', rim: 0.75, rimColor: '#2a6a00' } },
      { name: 'Xeno acid', group: 'Sci-fi', values: { blobSpread: 0.4, spikes: 20, spikeLen: 0.3, droplets: 120, spread: 0.6, mist: 500, seed: 64, directional: 0.5, direction: 60, color: '#d4f020', rim: 0.6, rimColor: '#5a7a00' } },
      { name: 'Android coolant', group: 'Sci-fi', values: { seed: 18, color: '#eef4f8', rimColor: '#86aac4', rim: 0.7, bgMode: 'color', bgColor: '#2c3036' } },
      { name: 'Blue alien blood', group: 'Sci-fi', values: { irregular: 0.5, spikes: 18, seed: 45, color: '#1a8aff', rimColor: '#0a2a7a' } },
      { name: 'Plasma splash', group: 'Sci-fi', values: { size: 0.12, spikes: 30, spikeLen: 0.8, droplets: 90, mist: 600, directional: 0, color: '#3af0ff', rim: 0.7, rimColor: '#0a5a8a', bgMode: 'color', bgColor: '#0a0c14' } },
      { name: 'Tarkov-style blood decal', group: 'Game-inspired', values: { size: 0.14, blobSpread: 0.35, irregular: 0.55, spikes: 18, spikeLen: 0.3, droplets: 160, spread: 0.7, dropSize: 0.015, mist: 900, directional: 0.6, direction: 15, color: '#5c0606', rim: 0.7, rimColor: '#220202' } },
      { name: 'CoD-style hit splatter', group: 'Game-inspired', values: { size: 0.12, spikes: 30, spikeLen: 0.8, droplets: 120, mist: 400, directional: 0, color: '#b00c0c', rim: 0.4, rimColor: '#4a0202' } },
      { name: 'Doom-style gore splat', group: 'Game-inspired', values: { size: 0.3, blobs: 8, blobSpread: 0.6, irregular: 0.8, spikes: 10, droplets: 50, dropSize: 0.05, mist: 0, directional: 0, color: '#a00000', rim: 0.7, rimColor: '#3a0000' } },
      { name: 'Splatoon-style ink', group: 'Game-inspired', values: { size: 0.25, blobs: 6, irregular: 0.15, spikes: 12, spikeLen: 0.5, droplets: 30, dropSize: 0.05, mist: 0, directional: 0, color: '#ff7a00', rim: 0.25, rimColor: '#c04a00' } },
      { name: 'L4D-style bile', group: 'Game-inspired', values: { size: 0.22, irregular: 0.7, droplets: 120, mist: 300, seed: 55, color: '#7c8a1c', rim: 0.6, rimColor: '#3a4008' } },
    ],
    render(ctx, W, H, p) {
      const Sz = Math.min(W, H), cx = W / 2, cy = H / 2, rnd = U.rng(p.seed);
      const F = new Float32Array(W * H);
      const K = 1 / 0.5625; // normalizes (1 - d²/R²)² so the field is exactly 1 at d = r (R = 2r)

      // balls are collected first, then centered and scaled to fit the canvas before rasterizing,
      // so the splatter never runs off an edge
      const balls = [];
      const ball = (bx, by, r, ang = 0, stretch = 1) => balls.push([bx, by, Math.max(0.35, r), ang, stretch]);

      // compact metaball: radius r (px), optionally stretched along angle `ang`
      const rasterBall = (bx, by, r, ang, stretch) => {
        const R = 2 * r, reach = R * stretch, c = Math.cos(ang), s = Math.sin(ang);
        const x0 = Math.max(0, Math.floor(bx - reach)), x1 = Math.min(W - 1, Math.ceil(bx + reach));
        const y0 = Math.max(0, Math.floor(by - reach)), y1 = Math.min(H - 1, Math.ceil(by + reach));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const dx = x + 0.5 - bx, dy = y + 0.5 - by;
            const a = (dx * c + dy * s) / stretch, b = -dx * s + dy * c;
            const q = 1 - (a * a + b * b) / (R * R);
            if (q > 0) F[y * W + x] += K * q * q;
          }
        }
      };

      const dirA = (p.direction * Math.PI) / 180, dirK = p.directional;
      const pickAngle = () => dirA + (rnd() - 0.5) * TAU * (1 - dirK * 0.85);
      const main = p.size * Sz * 0.5;

      // main blobs: the first sits in the center at full size, the rest scatter around it (pushed
      // along the impact direction when directional) and are smaller
      const blobs = [{ x: cx, y: cy, r: main }];
      for (let i = 1; i < p.blobs; i++) {
        const a = pickAngle(), d = p.blobSpread * Sz * 0.5 * (0.4 + 0.6 * rnd());
        blobs.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, r: main * (0.55 - p.blobVar * 0.4 * rnd()) });
      }
      // each blob is a cluster of overlapping balls
      for (const b of blobs) {
        if (b.r <= 0) continue;
        ball(b.x, b.y, b.r);
        for (let i = 0; i < 7; i++) {
          const a = rnd() * TAU, d = b.r * (0.35 + rnd() * 0.45);
          ball(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, b.r * (0.45 + rnd() * 0.35));
        }
      }
      // spikes and droplets start from a random blob, bigger blobs more often
      const total = blobs.reduce((s, b) => s + b.r, 0) || 1;
      const pickBlob = () => {
        let t = rnd() * total;
        for (const b of blobs) { t -= b.r; if (t <= 0) return b; }
        return blobs[0];
      };
      // spikes: chains of shrinking, stretched balls radiating out of a blob
      for (let i = 0; i < p.spikes; i++) {
        const b = pickBlob(), br = Math.max(b.r, Sz * 0.01);
        const a = pickAngle(), L = (br + p.spikeLen * Sz * 0.5 * (br / Math.max(main, 1e-3)) ** 0.5) * (0.4 + rnd() * 0.8), w0 = Math.max(1.2, br * (0.12 + rnd() * 0.12));
        const segs = 10;
        for (let j = 0; j <= segs; j++) {
          const t = j / segs, d = br * 0.6 + (L - br * 0.6) * t;
          ball(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, w0 * (1 - t * 0.8), a, 1.6);
        }
        if (rnd() < 0.6) { // a drop flung off the end of the spike
          const d = L + w0 * (2 + rnd() * 4);
          ball(b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, w0 * (0.5 + rnd() * 0.5), a, 1 + dirK * 1.5);
        }
      }
      // droplets: teardrops (head + shrinking tail pointing back to the impact)
      for (let i = 0; i < p.droplets; i++) {
        const b = pickBlob();
        const a = pickAngle(), dist = (0.12 + Math.pow(rnd(), 0.7) * p.spread) * Sz * 0.5;
        const r = p.dropSize * Sz * 0.5 * (0.35 + rnd()) * (1.2 - dist / (Sz * 0.5) * 0.6);
        const hx = b.x + Math.cos(a) * dist, hy = b.y + Math.sin(a) * dist, st = 1 + dirK * 1.4 * rnd();
        ball(hx, hy, r, a, st);
        const tail = Math.round(dirK * 4 * rnd());
        for (let j = 1; j <= tail; j++) ball(hx - Math.cos(a) * r * 1.4 * j, hy - Math.sin(a) * r * 1.4 * j, r * (1 - j / (tail + 1)) * 0.8, a, 1.3);
      }
      // mist: tiny dots, denser close to the impact
      for (let i = 0; i < p.mist; i++) {
        const a = pickAngle(), dist = (0.1 + Math.pow(rnd(), 0.6) * 0.85) * Sz * 0.5;
        ball(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, Math.max(0.5, Sz * 0.0022 * (0.4 + rnd())));
      }

      // fit: bounding box of every ball's visible extent (field reaches 1 at r, stretched along ang)
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const [x, y, r, ang, st] of balls) {
        const ex = r * Math.hypot(Math.cos(ang) * st, Math.sin(ang)), ey = r * Math.hypot(Math.sin(ang) * st, Math.cos(ang));
        bx0 = Math.min(bx0, x - ex); bx1 = Math.max(bx1, x + ex);
        by0 = Math.min(by0, y - ey); by1 = Math.max(by1, y + ey);
      }
      const margin = Sz * 0.03 + 2;
      const fit = Math.min(1, (W - 2 * margin) / Math.max(1, bx1 - bx0), (H - 2 * margin) / Math.max(1, by1 - by0));
      const mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2;
      for (const [x, y, r, ang, st] of balls) rasterBall(cx + (x - mx) * fit, cy + (y - my) * fit, Math.max(0.35, r * fit), ang, st);

      const col = U.hex(p.color), rim = U.hex(p.rimColor), bg = U.hex(p.bgColor), solid = p.bgMode === 'color';
      const img = ctx.createImageData(W, H), d = img.data;
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const f = F[i], o = i * 4;
          let thr = 1;
          if (p.irregular > 0 && f > 0.5 && f < 1.8) {
            const n = U.fractal('perlin', (x / Sz) * 9, (y / Sz) * 9, 0, 0, 3, 0.5, 'fbm', p.seed + 5);
            thr = 1 + (n - 0.5) * p.irregular * 1.1;
          }
          const a = U.smoothstep(thr - 0.07, thr + 0.07, f);
          const k = p.rim > 0 ? (1 - U.smoothstep(thr, thr + 0.9, f)) * p.rim : 0; // dark near the edge
          const r = col[0] + (rim[0] - col[0]) * k, g = col[1] + (rim[1] - col[1]) * k, b = col[2] + (rim[2] - col[2]) * k;
          if (solid) { d[o] = bg[0] + (r - bg[0]) * a; d[o + 1] = bg[1] + (g - bg[1]) * a; d[o + 2] = bg[2] + (b - bg[2]) * a; d[o + 3] = 255; }
          else if (a > 0) { d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a * 255; }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
