/* Mud: tileable wet mud surfaces. A warped, lumpy sludge height field; tire tracks with tread patterns
   (straight top to bottom, so they tile) and scattered boot prints, both pressed in with a raised rim of
   pushed-up mud; puddles that fill everything below a water level (tracks fill first); drying cracks on
   the higher, drier areas; pebbles and straw. Shaded from its own height (directional light, contact
   shadows, wet specular highlights), so the albedo reads as glossy mud even without a normal map.
   Height map for the normal map mode. Everything wraps across the edges: seamless. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;
  const V = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };

  /* draw fn(ctx, ox, oy) at the 9 wrapped offsets so shapes crossing an edge continue on the other side */
  const wrapped = (c, W, H, fn) => { for (const oy of [-H, 0, H]) for (const ox of [-W, 0, W]) fn(c, ox, oy); };

  U.register({
    id: 'mud-dl',
    name: 'Mud (download)',
    desc: 'Tileable wet mud with tire tracks, boot prints, puddles, drying cracks, pebbles and straw',
    uses: ['Albedo and height textures for muddy roads, battlefields, farmyards, swamps and construction sites; the height drives the normal map mode, the puddles a smoothness map.', 'Blend layers for terrain shaders, e.g. mud painted into tire ruts and paths.'],
    tags: ['Texturing', 'Nature'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<path d="M3 15c3-2 5 1 8-1s5-2 10 0"/><path d="M3 19c4-1 7 1 10 0s5-1 8 0" opacity=".5"/><path d="M8 4v8M12 4v8" opacity=".6"/><path d="M7 6h2M11 6h2M7 9h2M11 9h2" opacity=".6"/>'),
    params: [
      { type: 'section', label: 'Mud' },
      { key: 'scale', label: 'Scale', type: 'int', min: 1, max: 12, default: 3, tip: 'Large mud features across the texture' },
      { key: 'lumps', label: 'Lumps', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Sticky clumps of sludge' },
      { key: 'flow', label: 'Flow swirl', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Smeared, swirled sludge' },
      { key: 'detail', label: 'Fine detail', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'bump', label: 'Relief', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'How strongly the height shades the color' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 6 },

      { type: 'section', label: 'Water' },
      { key: 'wetness', label: 'Wetness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, tip: 'Darker, glossier mud' },
      { key: 'gloss', label: 'Wet highlights', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'puddles', label: 'Puddles', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Water level: fills tracks and low areas first' },
      { key: 'water', label: 'Water color', type: 'color', default: '#3a3a30', show: (p) => p.puddles > 0 },
      { key: 'murky', label: 'Murkiness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.puddles > 0, tip: '0 = clear water showing the mud below, 1 = opaque brown' },
      { key: 'cracks', label: 'Drying cracks', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Cracked crust on the higher, drier areas' },
      { key: 'crackScale', label: 'Crack scale', type: 'int', min: 3, max: 40, default: 12, show: (p) => p.cracks > 0 },

      { type: 'section', label: 'Tracks', active: (p) => p.tires > 0 || p.boots > 0 },
      { key: 'tires', label: 'Tire tracks', type: 'int', min: 0, max: 6, default: 2, tip: 'Straight tracks running top to bottom (tileable)' },
      { key: 'tireW', label: 'Tire width', type: 'range', min: 10, max: 160, step: 1, default: 56, show: (p) => p.tires > 0, tip: 'px @ 512' },
      { key: 'tread', label: 'Tread', type: 'select', default: 'chevron', show: (p) => p.tires > 0, options: [['chevron', 'Chevron (tractor)'], ['blocks', 'Blocks (off-road)'], ['bars', 'Bars'], ['tank', 'Tank track'], ['smooth', 'Smooth']] },
      { key: 'tireDepth', label: 'Track depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.tires > 0 },
      { key: 'boots', label: 'Boot prints', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: 'bootSize', label: 'Print size', type: 'range', min: 0.3, max: 2, step: 0.01, default: 1, show: (p) => p.boots > 0 },
      { key: 'bootDir', label: 'Walking direction (°)', type: 'range', min: 0, max: 360, step: 1, default: 270, show: (p) => p.boots > 0, tip: '270 = walking up' },
      { key: 'bootSpread', label: 'Direction spread', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.boots > 0 },
      { key: 'rim', label: 'Pushed-up rim', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.tires > 0 || p.boots > 0 },

      { type: 'section', label: 'Debris', active: (p) => p.pebbles > 0 || p.straw > 0 },
      { key: 'pebbles', label: 'Pebbles', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2 },
      { key: 'straw', label: 'Straw / grass bits', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },

      { type: 'section', label: 'Color' },
      { key: 'wetColor', label: 'Wet mud', type: 'color', default: '#3b2b1d' },
      { key: 'dryColor', label: 'Dry mud', type: 'color', default: '#7a6248' },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4 },
      { key: 'strawColor', label: 'Straw color', type: 'color', default: '#b09a5a', show: (p) => p.straw > 0 },
      { key: 'pebbleColor', label: 'Pebble color', type: 'color', default: '#8a8478', show: (p) => p.pebbles > 0 },
    ],
    presets: [
      { name: 'Muddy dirt road', group: 'Realistic', values: {} },
      { name: 'Tractor ruts', group: 'Realistic', values: { tires: 2, tireW: 80, tread: 'chevron', tireDepth: 0.8, puddles: 0.5, boots: 0.05, straw: 0.25 } },
      { name: 'Off-road trail', group: 'Realistic', values: { tires: 3, tireW: 46, tread: 'blocks', puddles: 0.3, pebbles: 0.4, boots: 0 } },
      { name: 'Tank tracks', group: 'Military', values: { tires: 2, tireW: 110, tread: 'tank', tireDepth: 0.9, wetness: 0.7, puddles: 0.45, boots: 0.15, wetColor: '#33291f', dryColor: '#6a5a44' } },
      { name: 'Trench mud', group: 'Military', values: { scale: 4, lumps: 0.8, flow: 0.7, tires: 0, boots: 0.7, bootSpread: 1, wetness: 0.9, puddles: 0.55, murky: 0.85, wetColor: '#2e261c', dryColor: '#5a4a38', straw: 0.15 } },
      { name: 'Footpath in the rain', group: 'Realistic', values: { tires: 0, boots: 0.8, bootSpread: 0.25, puddles: 0.4, wetness: 0.85, gloss: 0.7 } },
      { name: 'Farmyard muck', group: 'Realistic', values: { tires: 1, tireW: 70, boots: 0.35, straw: 0.7, wetColor: '#33261a', dryColor: '#6a5236', wetness: 0.85, puddles: 0.4, murky: 0.9, water: '#3a3220' } },
      { name: 'Drying mud flat', group: 'Realistic', values: { tires: 0, boots: 0.15, wetness: 0.15, gloss: 0.1, puddles: 0.12, cracks: 0.85, crackScale: 9, dryColor: '#8a7256', wetColor: '#4a3a28' } },
      { name: 'Cracked riverbed', group: 'Realistic', values: { tires: 0, boots: 0, wetness: 0.05, gloss: 0, puddles: 0, cracks: 1, crackScale: 7, lumps: 0.2, dryColor: '#9a8466', wetColor: '#5a4a36', pebbles: 0.25 } },
      { name: 'Swamp sludge', group: 'Realistic', values: { tires: 0, boots: 0.1, scale: 2, flow: 0.9, lumps: 0.7, wetness: 1, gloss: 0.8, puddles: 0.6, murky: 0.75, water: '#2e3622', wetColor: '#2a2a1a', dryColor: '#4e4a2e', straw: 0.3, strawColor: '#6a7a3a' } },
      { name: 'Clay pit', group: 'Realistic', values: { tires: 2, tread: 'blocks', wetColor: '#7a4a2a', dryColor: '#b8865a', water: '#8a6a4a', murky: 0.95, puddles: 0.35, wetness: 0.6 } },
      { name: 'Construction site', group: 'Realistic', values: { tires: 4, tireW: 60, tread: 'blocks', pebbles: 0.55, boots: 0.3, wetColor: '#4a3e30', dryColor: '#8a7a64', puddles: 0.3 } },
      { name: 'Cartoon mud', group: 'Stylized', values: { detail: 0.1, lumps: 0.6, bump: 0.8, gloss: 0.9, tires: 1, tireW: 70, tread: 'bars', boots: 0.2, wetColor: '#6a4428', dryColor: '#9a6a40', water: '#5a7a9a', murky: 0.2, colorVar: 0.15, pebbles: 0, straw: 0 } },
      { name: 'Toxic sludge', group: 'Sci-fi', values: { tires: 1, tread: 'tank', boots: 0.2, wetColor: '#2a3014', dryColor: '#4a5a1e', water: '#9aff1a', murky: 0.9, puddles: 0.5, gloss: 0.9, straw: 0 } },
      { name: 'Alien bog', group: 'Sci-fi', values: { tires: 0, boots: 0.3, flow: 0.9, wetColor: '#2a1a34', dryColor: '#5a3a6a', water: '#38f0c8', murky: 0.7, puddles: 0.45, gloss: 0.8, straw: 0.2, strawColor: '#c03aff' } },
    ],

    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height), S = Math.min(W, H), k = S / 512, seed = p.seed | 0, N = W * H, ar = H / W;
      const per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const [sx, sy] = per(p.scale), [wx, wy] = per(Math.max(1, Math.round(p.scale / 2))), [lx, ly] = per(p.scale * 4), [dx, dy] = per(p.scale * 24);

      // ---- pressed-in shapes (tire tracks, boot prints) on a depth canvas: red = depth ----
      let D = null, Dw = null;
      if (p.tires > 0 || p.boots > 0) {
        const dc = U.canvas(W, H), g = dc.getContext('2d'), rnd = U.rng(seed + 300);
        g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
        const lvl = (v) => `rgb(${v | 0},0,0)`;
        for (let t = 0; t < p.tires; t++) {
          const tw = p.tireW * k * (0.85 + rnd() * 0.3), cx = rnd() * W, dep = 255 * p.tireDepth * (0.75 + rnd() * 0.25);
          const rowH = Math.max(3, p.tread === 'tank' ? tw * 0.28 : tw * 0.32), rows = Math.max(1, Math.round(H / rowH)), rh = H / rows;
          wrapped(g, W, H, (c, ox) => {
            c.fillStyle = lvl(dep);
            c.fillRect(cx - tw / 2 + ox, 0, tw, H);
            if (p.tread === 'smooth') return;
            // raised tread pattern inside the track (less deep), clipped to the track
            c.save();
            c.beginPath(); c.rect(cx - tw / 2 + ox, 0, tw, H); c.clip();
            c.fillStyle = lvl(dep * 0.45);
            c.strokeStyle = lvl(dep * 0.45);
            for (let r = -1; r <= rows; r++) {
              const y = r * rh, x0 = cx - tw / 2 + ox;
              if (p.tread === 'chevron') {
                c.lineWidth = rh * 0.36; c.lineCap = 'butt';
                c.beginPath(); c.moveTo(x0 + tw * 0.05, y + rh * 0.75); c.lineTo(x0 + tw * 0.45, y + rh * 0.1); c.stroke();
                c.beginPath(); c.moveTo(x0 + tw * 0.95, y + rh * 0.75); c.lineTo(x0 + tw * 0.55, y + rh * 0.1); c.stroke();
              } else if (p.tread === 'blocks') {
                const off = U.mod(r, 2) ? tw * 0.16 : 0;
                for (let b = -1; b < 4; b++) c.fillRect(x0 + tw * 0.04 + off + b * tw * 0.32, y + rh * 0.15, tw * 0.2, rh * 0.6);
              } else if (p.tread === 'bars') {
                c.fillRect(x0, y + rh * 0.2, tw, rh * 0.4);
              } else if (p.tread === 'tank') {
                c.fillRect(x0, y + rh * 0.1, tw, rh * 0.5);
                c.fillStyle = lvl(dep * 0.25); c.fillRect(x0 + tw * 0.42, y + rh * 0.1, tw * 0.16, rh * 0.5); c.fillStyle = lvl(dep * 0.45);
              }
            }
            c.restore();
          });
        }
        if (p.boots > 0) {
          const area = (W * H) / (S * S), n = Math.round(p.boots * 26 * area / Math.max(0.3, p.bootSize));
          const L = p.bootSize * S * 0.075, Bw = L * 0.38;
          for (let i = 0; i < n; i++) {
            const x = rnd() * W, y = rnd() * H, a = (p.bootDir + 90) * Math.PI / 180 + (rnd() - 0.5) * p.bootSpread * Math.PI * 2;
            const dep = 255 * (0.55 + rnd() * 0.35), mir = rnd() < 0.5 ? -1 : 1;
            wrapped(g, W, H, (c, ox, oy) => {
              c.save();
              c.translate(x + ox, y + oy); c.rotate(a); c.scale(mir, 1);
              const sole = new Path2D();
              sole.ellipse(0, -L * 0.2, Bw * 0.5, L * 0.32, 0.08, 0, U.TAU);
              sole.ellipse(Bw * 0.04, L * 0.32, Bw * 0.4, L * 0.18, 0, 0, U.TAU);
              c.fillStyle = lvl(dep); c.fill(sole);
              // lugs
              c.clip(sole);
              c.fillStyle = lvl(dep * 0.5);
              for (let j = -6; j <= 6; j++) c.fillRect(-Bw, j * L * 0.085, Bw * 2, L * 0.035);
              c.restore();
            });
          }
        }
        const src = g.getImageData(0, 0, W, H).data;
        const b1 = U.blurRGBA(src, W, H, Math.max(0.8, 1.6 * k), true), b2 = U.blurRGBA(src, W, H, Math.max(2, 9 * k), true);
        D = new Float32Array(N); Dw = new Float32Array(N);
        for (let i = 0; i < N; i++) { D[i] = b1[i * 4] / 255; Dw[i] = b2[i * 4] / 255; }
      }

      // ---- straw (wrapped strokes) ----
      let ST = null;
      if (p.straw > 0) {
        const c = U.canvas(W, H), g = c.getContext('2d'), rnd = U.rng(seed + 500), n = Math.round(p.straw * 260 * (W * H) / (S * S));
        g.strokeStyle = '#fff'; g.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const x = rnd() * W, y = rnd() * H, a = rnd() * Math.PI, l = S * (0.015 + rnd() * 0.05), bend = (rnd() - 0.5) * l * 0.4;
          g.lineWidth = Math.max(0.7, k * (1 + rnd() * 1.6)); g.globalAlpha = 0.5 + rnd() * 0.5;
          const ex = Math.cos(a) * l, ey = Math.sin(a) * l;
          wrapped(g, W, H, (cc, ox, oy) => { cc.beginPath(); cc.moveTo(x + ox, y + oy); cc.quadraticCurveTo(x + ox + ex / 2 - Math.sin(a) * bend, y + oy + ey / 2 + Math.cos(a) * bend, x + ox + ex, y + oy + ey); cc.stroke(); });
        }
        const d = g.getImageData(0, 0, W, H).data;
        ST = new Float32Array(N);
        for (let i = 0; i < N; i++) ST[i] = d[i * 4 + 3] / 255;
      }

      // ---- pass 1: height ----
      const WX = U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * wx, (y / H) * wy, wx, wy, 3, 0.5, 'fbm', seed + 1) - 0.5);
      const WY = U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * wx, (y / H) * wy, wx, wy, 3, 0.5, 'fbm', seed + 2) - 0.5);
      const Hh = new Float32Array(N), CR = new Float32Array(N), PB = new Float32Array(N), CV = new Float32Array(N);
      const fw = p.flow * 1.2, [cx, cy] = per(p.crackScale), [px, py] = per(Math.round(p.scale * 14));
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W, v = (y + 0.5) / H;
          const uu = u + (WX[i] * fw) / sx, vv = v + (WY[i] * fw) / sy;
          let h = U.fractal('perlin', uu * sx, vv * sy, sx, sy, 4, 0.5, 'fbm', seed) * 0.7;
          if (p.lumps > 0) { const w = U.worley(uu * lx, vv * ly, lx, ly, seed + 3); h += (1 - w.f1) * 0.25 * p.lumps - 0.12 * p.lumps; }
          if (p.detail > 0) h += (U.fractal('perlin', uu * dx, vv * dy, dx, dy, 2, 0.5, 'fbm', seed + 4) - 0.5) * 0.12 * p.detail;
          CV[i] = U.fractal('perlin', u * sx * 2, v * sy * 2, sx * 2, sy * 2, 2, 0.5, 'fbm', seed + 9);
          if (D) h += -D[i] * 0.42 + Math.max(0, Dw[i] - D[i]) * 0.55 * p.rim;
          if (p.pebbles > 0) {
            const w = U.worley(u * px, v * py, px, py, seed + 7);
            if (w.id < p.pebbles * 0.45) {
              const r = 0.16 + w.id * 0.25, t = clamp(1 - w.f1 / r);
              if (t > 0) { PB[i] = smoothstep(0, 0.15, t); h = Math.max(h, h * 0.4 + 0.3 + Math.sqrt(t) * 0.15); }
            }
          }
          Hh[i] = h;
        }
      }
      // drying cracks on the higher areas (above the water line)
      const level = p.puddles * 0.5;
      if (p.cracks > 0) {
        const cwPx = Math.max(0.8, 2.2 * k);
        for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W, v = (y + 0.5) / H;
          U.voro(u * cx + WX[i] * 0.4, v * cy + WY[i] * 0.4, cx, cy, seed + 11, 1, false, W / cx, H / cy, 0, V);
          const dryK = p.cracks * smoothstep(level + 0.02, level + 0.18, Hh[i]) * (1 - p.wetness * 0.6);
          const groove = (1 - smoothstep(0, cwPx * (0.6 + V.id), V.e)) * dryK;
          const curl = (1 - smoothstep(0, (W / cx) * 0.25, V.e)) * 0.05 * dryK;
          CR[i] = groove;
          Hh[i] += curl - groove * 0.12;
        }
      }

      const img = ctx.createImageData(W, H), o = img.data;
      if (height) {
        for (let i = 0; i < N; i++) { const hv = Math.max(Hh[i], level); o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = clamp(hv) * 255; o[i * 4 + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        return;
      }

      // ---- pass 2: color + lighting from the height ----
      const wet = U.hex(p.wetColor), dry = U.hex(p.dryColor), wc = U.hex(p.water), stc = U.hex(p.strawColor), pbc = U.hex(p.pebbleColor);
      const K = p.bump * 0.35, Lx = -0.55, Ly = -0.6, Lz = 0.58, so = Math.max(1, Math.round(3 * k));
      for (let y = 0, i = 0; y < H; y++) {
        const yu = U.mod(y - 1, H) * W, yd = U.mod(y + 1, H) * W, ys = U.mod(y - so, H) * W;
        for (let x = 0; x < W; x++, i++) {
          const xl = x ? x - 1 : W - 1, xr = x === W - 1 ? 0 : x + 1, row = y * W;
          const h = Hh[i];
          const gx = (Hh[row + xr] - Hh[row + xl]) * 0.5 * S, gy = (Hh[yd + x] - Hh[yu + x]) * 0.5 * S;
          let nx = -gx * K, ny = -gy * K, nz = 1;
          const nl = 1 / Math.sqrt(nx * nx + ny * ny + 1); nx *= nl; ny *= nl; nz *= nl;
          const lam = nx * Lx + ny * Ly + nz * Lz;
          // contact shadow: higher ground toward the light
          const sh = clamp((Hh[ys + U.mod(x - so, W)] - h) * 6) * p.bump;
          // moisture: wetter in the low areas
          const m = clamp(p.wetness + (1 - smoothstep(level, level + 0.18, h)) * 0.45 - (CV[i] - 0.5) * p.colorVar * 0.6);
          let r = lerp(dry[0], wet[0], m), g = lerp(dry[1], wet[1], m), b = lerp(dry[2], wet[2], m);
          const vr = 1 + (CV[i] - 0.5) * p.colorVar * 0.5;
          r *= vr; g *= vr; b *= vr;
          if (PB[i] > 0) { const t = PB[i], pv = 0.85 + hash(x >> 2, y >> 2, seed) * 0.3; r = lerp(r, pbc[0] * pv * (1 - m * 0.35), t); g = lerp(g, pbc[1] * pv * (1 - m * 0.35), t); b = lerp(b, pbc[2] * pv * (1 - m * 0.35), t); }
          if (ST && ST[i] > 0) { const t = ST[i] * 0.9, sv = 1 - m * 0.3; r = lerp(r, stc[0] * sv, t); g = lerp(g, stc[1] * sv, t); b = lerp(b, stc[2] * sv, t); }
          if (CR[i] > 0) { const t = CR[i] * 0.8; r *= 1 - t * 0.7; g *= 1 - t * 0.7; b *= 1 - t * 0.7; }
          const light = (0.45 + 0.75 * lam) * (1 - sh * 0.45);
          r *= light; g *= light; b *= light;
          // wet specular
          const hz = nx * -0.33 + ny * -0.36 + nz * 0.87, spec = Math.pow(Math.max(0, hz), 40) * p.gloss * m * 220;
          r += spec; g += spec; b += spec * 0.95;
          // puddles: flat water below the level
          if (h < level) {
            const dep = clamp((level - h) * 7), murk = clamp(p.murky * 0.7 + dep * 0.4);
            r = lerp(r * 0.55, wc[0], murk); g = lerp(g * 0.55, wc[1], murk); b = lerp(b * 0.55, wc[2], murk);
            // sky reflection streak + bright shoreline
            const refl = (0.08 + 0.1 * (CV[i] - 0.3)) * 255 * (0.4 + p.gloss * 0.6);
            const shore = (1 - smoothstep(0, 0.012, level - h)) * 40 * p.gloss;
            r += refl * 0.8 + shore; g += refl * 0.85 + shore; b += refl + shore;
          }
          const k4 = i * 4;
          o[k4] = r; o[k4 + 1] = g; o[k4 + 2] = b; o[k4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
