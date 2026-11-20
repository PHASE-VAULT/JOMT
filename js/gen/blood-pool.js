/* Blood pool decal: a pool of liquid seen from above. Like the splatter, everything is made of compact
   metaballs summed into a density field: the pool is a few lobes (clusters of balls), rivulets run off
   it along a flow direction with meandering, tapering chains ending in a bulb, satellite drops lie
   around it and an optional drag smear pulls a thin, streaky film away from it. The field is centered and
   scaled to fit, thresholded with a noisy edge, and its value above the threshold gives the liquid depth:
   thin, lighter and translucent at the edge, deep and dark in the middle. On top: coagulated clots, drying
   (dried film creeping in from the edge, a darker crust ring, craquelure cracks that open the film), and
   wet shading from a height built from the depth (meniscus relief, specular highlights on the slopes
   facing the light, surface ripples, a soft sky reflection). Output: transparent decal, on a background
   color, or the height map (also used by the normal map mode). */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;

  U.register({
    id: 'blood-pool',
    name: 'Blood Pool',
    desc: 'Pools of blood and other liquids with lobes, rivulets, drops, drag smears, clots, drying, cracks and gloss',
    uses: ['Floor decals for horror, crime-scene and shooter levels: pools under bodies, wounded characters and leaking containers, with a height map for the normal map mode and a glossy smoothness map.', 'Spills of paint, oil, wine, slime or water for props, posters and stylized scenes.'],
    tags: ['Horror', 'Decals', 'Shooter'],
    bg: 'white',
    normalMap: true, // normal map mode from the pool's own height (depth, meniscus, clots, crust, cracks)
    heightMap: true,
    icon: U.icon('<path d="M6 13c0-3.5 3-5.5 6.5-5.5S19 9.5 19 12.5 16.5 17 13 17c-1.5 0-2 1.5-4 1.5S6 16.5 6 13z"/><circle cx="4.5" cy="7.5" r="1" fill="currentColor"/><circle cx="20" cy="18.5" r=".8" fill="currentColor"/><path d="M10 11.5c1-1 2.5-1.3 3.5-1" opacity=".6"/>'),
    params: [
      { type: 'section', label: 'Pool' },
      { key: 'size', label: 'Pool size', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.6 },
      { key: 'lobes', label: 'Lobes', type: 'int', min: 1, max: 12, default: 4, tip: 'Overlapping round parts the pool is made of' },
      { key: 'lobeSpread', label: 'Lobe spread', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, show: (p) => p.lobes > 1 },
      { key: 'lobeVar', label: 'Lobe size variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.lobes > 1 },
      { key: 'irregular', label: 'Edge irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { key: 'edgeScale', label: 'Edge detail scale', type: 'range', min: 2, max: 30, step: 0.1, default: 5, show: (p) => p.irregular > 0, tip: 'Noise features across the short side' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 23 },
      { type: 'section', label: 'Flow' },
      { key: 'flowDir', label: 'Flow direction', type: 'range', min: -180, max: 180, step: 1, default: 90, tip: 'Downhill direction the rivulets run to (90 = down)' },
      { key: 'rivulets', label: 'Rivulets', type: 'int', min: 0, max: 16, default: 3 },
      { key: 'rivLen', label: 'Rivulet length', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.45, show: (p) => p.rivulets > 0 },
      { key: 'rivWidth', label: 'Rivulet width', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.4, show: (p) => p.rivulets > 0 },
      { key: 'flowSpread', label: 'Flow spread', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.rivulets > 0, tip: '0 = all rivulets run the same way, 1 = in every direction' },
      { key: 'meander', label: 'Meandering', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.rivulets > 0 },
      { key: 'droplets', label: 'Drops around', type: 'int', min: 0, max: 200, default: 18 },
      { key: 'dropSize', label: 'Drop size', type: 'range', min: 0.005, max: 0.08, step: 0.001, default: 0.022, show: (p) => p.droplets > 0 },
      { key: 'dropSpread', label: 'Drop spread', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.droplets > 0 },
      { key: 'smear', label: 'Drag smear', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'A thin, streaky film pulled away from the pool, like a dragged body' },
      { key: 'smearLen', label: 'Smear length', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.6, show: (p) => p.smear > 0 },
      { key: 'smearWidth', label: 'Smear width', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.5, show: (p) => p.smear > 0 },
      { key: 'smearAngle', label: 'Smear direction', type: 'range', min: -180, max: 180, step: 1, default: 0, show: (p) => p.smear > 0 },
      { type: 'section', label: 'Liquid' },
      { key: 'depth', label: 'Depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'How quickly the pool gets deep (and dark) inside the edge' },
      { key: 'edgeAlpha', label: 'Edge opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Opacity of the thin film at the very edge' },
      { key: 'clots', label: 'Clots', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Darker coagulated lumps in the deep parts' },
      { key: 'clotScale', label: 'Clot scale', type: 'range', min: 4, max: 60, step: 0.5, default: 18, show: (p) => p.clots > 0 },
      { type: 'section', label: 'Drying', active: (p) => p.dry > 0 || p.crust > 0 },
      { key: 'dry', label: 'Drying', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1, tip: 'Dried film creeps in from the edge: darker, browner and matte' },
      { key: 'crust', label: 'Crust ring', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Darker ring along the edge where the liquid dries first' },
      { key: 'cracks', label: 'Cracks', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'The dried film cracks into flakes (only where it is dry)' },
      { key: 'crackScale', label: 'Crack scale', type: 'range', min: 4, max: 60, step: 0.5, default: 22, show: (p) => p.cracks > 0 },
      { type: 'section', label: 'Shading' },
      { key: 'gloss', label: 'Gloss', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Specular highlights on the wet surface (fade where it is dry)' },
      { key: 'glossSize', label: 'Highlight size', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.gloss > 0 },
      { key: 'relief', label: 'Meniscus relief', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Light and shadow on the rounded edge of the liquid' },
      { key: 'ripple', label: 'Surface ripples', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Small waves that break the highlights up' },
      { key: 'sheen', label: 'Sky reflection', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Soft, cloudy reflection on the deep wet parts' },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'angled', options: [['angled', 'Angled (light angle)'], ['ambient', 'Ambient (soft, no direction)']], tip: 'Ambient: soft light from all around, like an overcast sky: no direction and no hard highlights; edges and slopes darken gently and the wet look comes from the sky reflection' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -135, show: (p) => p.lightMode !== 'ambient', tip: 'Direction the light comes from (-135 = top left)' },
      { type: 'section', label: 'Color' },
      { key: 'color', label: 'Color', type: 'color', default: '#8a0808' },
      { key: 'deepColor', label: 'Deep color', type: 'color', default: '#4a0303' },
      { key: 'edgeColor', label: 'Edge color', type: 'color', default: '#a8141a', tip: 'Color of the thin film at the edge' },
      { key: 'dryColor', label: 'Dried color', type: 'color', default: '#2e0c08', show: (p) => p.dry > 0 || p.crust > 0 },
      { key: 'bgMode', label: 'Background', type: 'select', default: 'transparent', options: [['transparent', 'Transparent'], ['color', 'Solid color'], ['height', 'Height map']] },
      { key: 'bgColor', label: 'Background color', type: 'color', default: '#8a8580', show: (p) => p.bgMode === 'color' },
    ],
    presets: [
      { name: 'Fresh pool', group: 'Realistic', values: { dry: 0, crust: 0.2, clots: 0.05, gloss: 0.75 } },
      { name: 'Large pool under body', group: 'Realistic', values: { size: 0.85, lobes: 7, lobeSpread: 0.7, rivulets: 2, rivLen: 0.3, droplets: 10, clots: 0.3, dry: 0.15, crust: 0.5, seed: 51 } },
      { name: 'Small pool', group: 'Realistic', values: { size: 0.35, lobes: 2, lobeSpread: 0.4, rivulets: 0, droplets: 12, dropSpread: 0.35, seed: 9 } },
      { name: 'Running downhill', group: 'Realistic', values: { size: 0.45, lobes: 3, rivulets: 7, rivLen: 0.85, rivWidth: 0.45, flowSpread: 0.25, meander: 0.6, droplets: 8, seed: 33 } },
      { name: 'Pool with drips', group: 'Realistic', values: { size: 0.4, lobes: 3, rivulets: 1, rivLen: 0.25, droplets: 80, dropSize: 0.018, dropSpread: 0.85, seed: 64 } },
      { name: 'Drag smear', group: 'Realistic', values: { size: 0.4, lobes: 3, lobeSpread: 0.4, rivulets: 0, droplets: 20, smear: 0.85, smearLen: 0.85, smearWidth: 0.55, smearAngle: 0, seed: 18 } },
      { name: 'Coagulating', group: 'Realistic', values: { clots: 0.75, clotScale: 14, dry: 0.3, crust: 0.6, gloss: 0.5, deepColor: '#2a0101', seed: 72 } },
      { name: 'Drying at the edges', group: 'Realistic', values: { dry: 0.5, crust: 0.8, clots: 0.25, gloss: 0.45, seed: 40 } },
      { name: 'Dried & cracked', group: 'Realistic', values: { dry: 1, crust: 0.7, cracks: 0.75, crackScale: 20, clots: 0.2, gloss: 0.1, sheen: 0, ripple: 0, dryColor: '#2a0a07', seed: 6 } },
      { name: 'Old stain', group: 'Realistic', values: { dry: 1, crust: 0.9, cracks: 0.2, edgeAlpha: 0.35, depth: 0.2, gloss: 0, sheen: 0, ripple: 0, relief: 0.15, dryColor: '#3a1a12', droplets: 6, rivulets: 1, seed: 27 } },
      { name: 'Leak from a door', group: 'Realistic', values: { size: 0.7, lobes: 6, lobeSpread: 0.9, lobeVar: 0.7, rivulets: 4, rivLen: 0.6, flowDir: 90, flowSpread: 0.15, droplets: 6, seed: 88 } },
      { name: 'Toon blood pool', group: 'Stylized', values: { irregular: 0.1, clots: 0, dry: 0, crust: 0, ripple: 0, sheen: 0, relief: 0.2, gloss: 0.9, glossSize: 0.8, depth: 0.15, edgeAlpha: 1, color: '#d0101c', deepColor: '#9a0612', edgeColor: '#e8202a', droplets: 10, rivulets: 2 } },
      { name: 'Comic ink pool', group: 'Stylized', values: { irregular: 0.05, clots: 0, dry: 0, crust: 0, ripple: 0, sheen: 0, relief: 0, gloss: 0.6, glossSize: 0.9, depth: 0, edgeAlpha: 1, color: '#0c0c10', deepColor: '#0c0c10', edgeColor: '#0c0c10', rivulets: 2, droplets: 14 } },
      { name: 'Slime puddle', group: 'Stylized', values: { color: '#56c428', deepColor: '#2a7a10', edgeColor: '#8ae84a', dryColor: '#3a5a10', clots: 0.35, clotScale: 10, crust: 0.3, dry: 0, gloss: 0.8, ripple: 0.4, seed: 5 } },
      { name: 'Black oil', group: 'Realistic', values: { color: '#14110e', deepColor: '#050403', edgeColor: '#3a2a1a', dryColor: '#1a1410', edgeAlpha: 0.45, clots: 0, dry: 0, crust: 0.2, gloss: 0.9, glossSize: 0.55, sheen: 0.45, ripple: 0.1, rivulets: 2, seed: 14 } },
      { name: 'Red wine spill', group: 'Realistic', values: { size: 0.45, color: '#5a0a22', deepColor: '#2a0412', edgeColor: '#8a2a4a', dryColor: '#3a0a1c', edgeAlpha: 0.4, clots: 0, dry: 0.2, crust: 0.85, rivulets: 1, droplets: 30, seed: 46 } },
      { name: 'Water puddle', group: 'Realistic', values: { color: '#5a6a78', deepColor: '#3a4652', edgeColor: '#8a98a4', edgeAlpha: 0.2, depth: 0.3, clots: 0, dry: 0, crust: 0, gloss: 0.9, glossSize: 0.5, sheen: 0.7, ripple: 0.3, rivulets: 1, droplets: 6, seed: 3 } },
      { name: 'Alien green blood', group: 'Sci-fi', values: { color: '#6ab01a', deepColor: '#2e5a06', edgeColor: '#b4f040', dryColor: '#2a3a08', clots: 0.4, crust: 0.4, seed: 61 } },
      { name: 'Blue alien blood', group: 'Sci-fi', values: { color: '#1468d0', deepColor: '#08306a', edgeColor: '#4aa0ff', dryColor: '#0a2244', seed: 45 } },
      { name: 'Android coolant', group: 'Sci-fi', values: { color: '#e4eef4', deepColor: '#b4c8d8', edgeColor: '#ffffff', dryColor: '#8aa0b0', edgeAlpha: 0.5, clots: 0, crust: 0.3, dry: 0, gloss: 0.8, sheen: 0.3, bgMode: 'color', bgColor: '#2c3036', seed: 19 } },
      { name: 'Toxic sludge', group: 'Sci-fi', values: { color: '#b0c818', deepColor: '#4a5a06', edgeColor: '#e0f040', dryColor: '#3a4008', clots: 0.6, clotScale: 12, ripple: 0.5, crust: 0.5, rivulets: 4, seed: 77 } },
    ],
    render(ctx, W, H, p, opts) {
      const heightOut = !!(opts && opts.height) || p.bgMode === 'height';
      const Sz = Math.min(W, H), cx = W / 2, cy = H / 2, rnd = U.rng(p.seed), N = W * H;
      const F = new Float32Array(N), M = p.smear > 0 ? new Float32Array(N) : null; // density, smear share
      const K = 1 / 0.5625; // (1 - d²/R²)² normalized to 1 at d = r (R = 2r)
      const balls = []; // [x, y, r, angle, stretch, smear]
      const ball = (x, y, r, a = 0, st = 1, sm = 0) => balls.push([x, y, Math.max(0.35, r), a, st, sm]);

      // ---- pool lobes ----
      const R0 = p.size * Sz * 0.5 * 0.8, flowA = p.flowDir * RAD;
      const lobes = [{ x: 0, y: 0, r: R0 }];
      for (let i = 1; i < p.lobes; i++) {
        const a = rnd() * TAU, dd = p.lobeSpread * R0 * (0.8 + 0.8 * rnd());
        lobes.push({ x: Math.cos(a) * dd, y: Math.sin(a) * dd, r: R0 * (0.62 - p.lobeVar * 0.35 * rnd()) });
      }
      for (const L of lobes) {
        ball(L.x, L.y, L.r);
        for (let i = 0; i < 8; i++) {
          const a = rnd() * TAU, dd = L.r * (0.3 + rnd() * 0.45);
          ball(L.x + Math.cos(a) * dd, L.y + Math.sin(a) * dd, L.r * (0.45 + rnd() * 0.3));
        }
      }
      // the pool's reach in a direction (the farthest lobe edge along it), for starting rivulets / smears at the rim
      const rim = (a) => lobes.reduce((m, L) => Math.max(m, L.x * Math.cos(a) + L.y * Math.sin(a) + L.r * 0.8), 0);
      // ---- rivulets: meandering, tapering chains along the flow direction, ending in a bulb ----
      for (let i = 0; i < p.rivulets; i++) {
        const a0 = flowA + (rnd() - 0.5) * TAU * p.flowSpread, rr = rim(a0) * 0.85;
        let x = Math.cos(a0) * rr, y = Math.sin(a0) * rr, hd = a0;
        const w0 = R0 * p.rivWidth * 0.28 * (0.6 + rnd() * 0.6), len = p.rivLen * Sz * 0.5 * (0.45 + rnd() * 0.75);
        let run = 0;
        while (run < len) {
          const t = run / len, w = w0 * (1 - t * 0.55), step = Math.max(0.6, w * 0.45);
          ball(x, y, w, hd, 1.25);
          hd += (rnd() - 0.5) * p.meander * 0.7;
          hd += Math.atan2(Math.sin(flowA - hd), Math.cos(flowA - hd)) * 0.08; // pulled back downhill
          x += Math.cos(hd) * step; y += Math.sin(hd) * step; run += step;
        }
        ball(x, y, w0 * (0.75 + rnd() * 0.4)); // the bulb where it stopped
      }
      // ---- drops around the pool ----
      for (let i = 0; i < p.droplets; i++) {
        const a = rnd() * TAU, dd = rim(a) * (1.05 + Math.pow(rnd(), 1.5) * (0.2 + p.dropSpread * 1.4));
        const r = p.dropSize * Sz * 0.5 * (0.3 + rnd() * 0.9);
        ball(Math.cos(a) * dd, Math.sin(a) * dd, r);
        if (rnd() < 0.3) { const b = rnd() * TAU; ball(Math.cos(a) * dd + Math.cos(b) * r * 1.6, Math.sin(a) * dd + Math.sin(b) * r * 1.6, r * (0.3 + rnd() * 0.4)); }
      }
      // ---- drag smear: a wide band of overlapping flat balls, thinning out toward its end ----
      if (p.smear > 0) {
        const sa = p.smearAngle * RAD, sl = p.smearLen * Sz * 0.5 * 1.3, sw = R0 * p.smearWidth * 1.8, ux = Math.cos(sa), uy = Math.sin(sa);
        const start = rim(sa) * 0.3, n = Math.ceil(sl / Math.max(1, sw * 0.12));
        let off = 0;
        for (let i = 0; i <= n; i++) {
          const t = i / n, d0 = start + sl * t;
          off += (rnd() - 0.5) * sw * 0.08;
          const w = sw * (1 - t * 0.45) * (0.85 + rnd() * 0.3);
          for (let k = 0; k < 5; k++) {
            const lat = off + (k / 4 - 0.5) * w * 0.75 + (rnd() - 0.5) * w * 0.15;
            ball(ux * d0 - uy * lat, uy * d0 + ux * lat, w * 0.3 * (1 - t * 0.3), sa, 1.6, 0.55 + 0.45 * t);
          }
        }
      }

      // ---- fit: center the bounding box of everything and shrink to fit inside a margin ----
      let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
      for (const [x, y, r, a, st] of balls) {
        const ex = r * Math.hypot(Math.cos(a) * st, Math.sin(a)), ey = r * Math.hypot(Math.sin(a) * st, Math.cos(a));
        bx0 = Math.min(bx0, x - ex); bx1 = Math.max(bx1, x + ex); by0 = Math.min(by0, y - ey); by1 = Math.max(by1, y + ey);
      }
      const margin = Sz * (0.04 + p.irregular * 0.11) + 2; // room for the outline warp
      const fit = Math.min(1, (W - 2 * margin) / Math.max(1, bx1 - bx0), (H - 2 * margin) / Math.max(1, by1 - by0));
      const mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2;
      for (const [bx, by, r0, a, st, sm] of balls) {
        const x0c = cx + (bx - mx) * fit, y0c = cy + (by - my) * fit, r = Math.max(0.35, r0 * fit);
        const R = 2 * r, reach = R * st, c = Math.cos(a), s = Math.sin(a);
        const x0 = Math.max(0, Math.floor(x0c - reach)), x1 = Math.min(W - 1, Math.ceil(x0c + reach));
        const y0 = Math.max(0, Math.floor(y0c - reach)), y1 = Math.min(H - 1, Math.ceil(y0c + reach));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const dx = x + 0.5 - x0c, dy = y + 0.5 - y0c, u = (dx * c + dy * s) / st, v = -dx * s + dy * c;
            const q = 1 - (u * u + v * v) / (R * R);
            if (q > 0) { const w = K * q * q, j = y * W + x; F[j] += w; if (M && sm) M[j] += w * sm; }
          }
        }
      }

      // ---- per pixel: coverage, depth, color, height ----
      const col = U.hex(p.color), deep = U.hex(p.deepColor), edge = U.hex(p.edgeColor), dry = U.hex(p.dryColor), bg = U.hex(p.bgColor);
      const solid = p.bgMode === 'color', kd = 0.4 + 4.5 * p.depth, sa = p.smearAngle * RAD, sc = Math.cos(sa), ss = Math.sin(sa);
      const Hh = new Float32Array(N), A = new Float32Array(N), Wt = new Float32Array(N); // height, alpha, wetness
      const img = ctx.createImageData(W, H), d = img.data;
      const dryLevel = p.dry * 1.15;
      // low-frequency warp of the lookup: the outline gets big bulges and bays instead of staying round
      const warp = p.irregular * Sz * 0.11, ws = p.edgeScale * 0.75;
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const nx = x / Sz, ny = y / Sz;
          let f = F[i], j = i;
          if (warp > 0.5) {
            // bilinear lookup: a nearest-pixel lookup would leave steps that show up in the highlights
            const fx = x + (U.fractal('perlin', nx * ws, ny * ws, 0, 0, 2, 0.5, 'fbm', p.seed + 61) - 0.5) * 2 * warp;
            const fy = y + (U.fractal('perlin', nx * ws, ny * ws, 0, 0, 2, 0.5, 'fbm', p.seed + 62) - 0.5) * 2 * warp;
            const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
            if (x0 < 0 || y0 < 0 || x0 >= W - 1 || y0 >= H - 1) continue;
            j = y0 * W + x0;
            f = lerp(lerp(F[j], F[j + 1], tx), lerp(F[j + W], F[j + W + 1], tx), ty);
          }
          if (f < 0.4) continue;
          let thr = 1;
          if (p.irregular > 0 && f < 2.2) thr = 1 + (U.fractal('perlin', nx * p.edgeScale, ny * p.edgeScale, 0, 0, 3, 0.5, 'fbm', p.seed + 5) - 0.5) * p.irregular * 0.9;
          let a = smoothstep(thr - 0.05, thr + 0.05, f);
          if (a <= 0) continue;
          let dep = clamp(1 - Math.exp(-Math.max(0, f - thr) * kd)); // 0 at the edge, 1 deep inside
          let wet = 1, h = dep, film = 0;
          if (M) {
            // the smear is a thin film with streaks along the drag direction
            film = clamp(M[j] / f);
            const along = nx * sc + ny * ss, across = -nx * ss + ny * sc;
            const streak = U.fractal('perlin', along * 3, across * 70, 0, 0, 3, 0.55, 'fbm', p.seed + 41);
            const keep = lerp(1, smoothstep(0.2, 0.6, streak) * 0.7 + 0.3, film * p.smear);
            a *= keep; dep *= 1 - film * 0.6; h = dep; wet *= 1 - film * 0.75; // the thin film is less glossy
          }
          // color by depth: thin edge -> normal -> deep
          const t1 = smoothstep(0, 0.3, dep), t2 = smoothstep(0.3, 1, dep);
          let r = lerp(lerp(edge[0], col[0], t1), deep[0], t2), g = lerp(lerp(edge[1], col[1], t1), deep[1], t2), b = lerp(lerp(edge[2], col[2], t1), deep[2], t2);
          a *= lerp(p.edgeAlpha, 1, smoothstep(0, 0.22, dep));
          // clots: dark, raised lumps in the deep parts
          if (p.clots > 0 && dep > 0.25) {
            const n = U.fractal('perlin', nx * p.clotScale, ny * p.clotScale, 0, 0, 3, 0.5, 'fbm', p.seed + 17), th = 0.74 - p.clots * 0.26;
            const cl = smoothstep(th, th + 0.07, n) * smoothstep(0.25, 0.6, dep);
            if (cl > 0) { r = lerp(r, deep[0] * 0.55, cl * 0.85); g = lerp(g, deep[1] * 0.55, cl * 0.85); b = lerp(b, deep[2] * 0.55, cl * 0.85); h += cl * 0.14 * smoothstep(th, th + 0.18, n); } // soft, low lumps
          }
          // drying: from the edge inward (and on thin smear film first)
          let dr = 0;
          if (p.dry > 0) {
            const lvl = dryLevel + film * 0.5 + (U.fractal('perlin', nx * 6, ny * 6, 0, 0, 2, 0.5, 'fbm', p.seed + 23) - 0.5) * 0.3;
            dr = 1 - smoothstep(lvl - 0.12, lvl + 0.12, dep);
          }
          if (p.crust > 0) {
            const ring = (1 - smoothstep(0.02, 0.06 + 0.12 * p.crust, dep)) * smoothstep(0, 0.02, dep + 0.01) * p.crust;
            dr = Math.max(dr, ring * 0.6);
            const k = ring * 0.7;
            r = lerp(r, dry[0] * 0.8, k); g = lerp(g, dry[1] * 0.8, k); b = lerp(b, dry[2] * 0.8, k);
            h += ring * 0.12;
          }
          if (dr > 0) {
            r = lerp(r, dry[0], dr * 0.85); g = lerp(g, dry[1], dr * 0.85); b = lerp(b, dry[2], dr * 0.85);
            wet *= 1 - dr * 0.95;
            h = lerp(h, h * 0.35 + 0.05, dr); // a dried film shrinks flat
            if (p.cracks > 0 && dr > 0.4) {
              const c = U.worley(nx * p.crackScale, ny * p.crackScale, 0, 0, p.seed + 29), e = c.f2 - c.f1;
              const wd = 0.04 + 0.08 * p.cracks;
              const cr = (1 - smoothstep(wd * 0.5, wd, e)) * smoothstep(0.4, 0.8, dr) * p.cracks;
              const lip = (1 - smoothstep(wd, wd * 2.2, e)) - cr; // flake edges curl up a little
              a *= 1 - cr * 0.92;
              h += lip * 0.06 - cr * 0.1;
              r *= 1 - lip * 0.25; g *= 1 - lip * 0.25; b *= 1 - lip * 0.25;
            }
          }
          if (p.ripple > 0 && wet > 0) h += (U.fractal('perlin', nx * 40, ny * 40, 0, 0, 2, 0.5, 'fbm', p.seed + 37) - 0.5) * p.ripple * 0.12 * smoothstep(0.1, 0.5, dep) * wet;
          Hh[i] = h; A[i] = a; Wt[i] = wet;
          const o = i * 4;
          d[o] = r; d[o + 1] = g; d[o + 2] = b;
        }
      }

      if (heightOut) {
        for (let i = 0, o = 0; i < N; i++, o += 4) { const v = clamp(Hh[i] * A[i] / 1.15) * 255; d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        return;
      }

      // ---- wet shading from the height: meniscus relief, specular, sky reflection ----
      const la = p.lightAngle * RAD, le = 35 * RAD;
      const Lx = Math.cos(la) * Math.cos(le), Ly = Math.sin(la) * Math.cos(le), Lz = Math.sin(le);
      let Hx = Lx, Hy = Ly, Hz = Lz + 1;
      const hn = Math.hypot(Hx, Hy, Hz); Hx /= hn; Hy /= hn; Hz /= hn;
      const ambient = p.lightMode === 'ambient';
      const hScale = Sz * 0.02, shin = lerp(160, 18, p.glossSize), gk = p.gloss * lerp(1.6, 0.9, p.glossSize);
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const o = i * 4, a = A[i];
          if (a > 0) {
            const hx0 = x > 0 ? Hh[i - 1] : Hh[i], hx1 = x < W - 1 ? Hh[i + 1] : Hh[i];
            const hy0 = y > 0 ? Hh[i - W] : Hh[i], hy1 = y < H - 1 ? Hh[i + W] : Hh[i];
            const gx = (hx1 - hx0) * 0.5 * hScale, gy = (hy1 - hy0) * 0.5 * hScale;
            const nl = Math.hypot(gx, gy, 1), nx = -gx / nl, ny = -gy / nl, nz = 1 / nl;
            // ambient light (sky from all around): slopes see less of the sky and darken gently, whichever way they face
            const sh = ambient ? Math.max(0.55, 1 - (1 - nz * nz) * p.relief * 1.6) : 1 + ((nx * Lx + ny * Ly + nz * Lz) / Lz - 1) * p.relief * 0.8;
            let r = d[o] * sh, g = d[o + 1] * sh, b = d[o + 2] * sh;
            const wet = Wt[i];
            if (p.sheen > 0 && wet > 0) {
              const sk = p.sheen * wet * smoothstep(0.1, 0.6, Hh[i]) * (0.25 + 0.75 * U.fractal('perlin', (x / Sz) * 2.5, (y / Sz) * 2.5, 0, 0, 3, 0.5, 'fbm', p.seed + 53)) * (ambient ? 0.65 : 0.45);
              r = lerp(r, 200, sk); g = lerp(g, 208, sk); b = lerp(b, 222, sk);
            }
            if (gk > 0 && wet > 0 && !ambient) { // ambient light has no hard highlights
              const nh = Math.max(0, nx * Hx + ny * Hy + nz * Hz), base = Math.pow(Hz, shin); // the flat surface's own (dim) highlight is removed
              const sp = Math.max(0, Math.pow(nh, shin) - base) / (1 - base) * gk * wet;
              r += sp * 255; g += sp * 255; b += sp * 255;
            }
            if (solid) { d[o] = lerp(bg[0], r, a); d[o + 1] = lerp(bg[1], g, a); d[o + 2] = lerp(bg[2], b, a); d[o + 3] = 255; }
            else { d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a * 255; }
          } else if (solid) { d[o] = bg[0]; d[o + 1] = bg[1]; d[o + 2] = bg[2]; d[o + 3] = 255; }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
