/* Tileable camouflage: woodland blobs, digital (pixel), tiger stripe, splinter, flecktarn dots,
   plus optional chip (rock) or rain-streak overlays.
   Noise fields are periodic; digital uses an integer cell grid so everything tiles. */
(function () {
  'use strict';
  const U = window.UGTG;

  const PRESETS = {
    woodland: ['#6f7a46', '#4f3d2a', '#2c3a24', '#151411'],
    desert: ['#cdb68d', '#a8885f', '#7c6a48', '#e3d4b2'],
    arid: ['#c2ae86', '#8f7c58', '#6b6a45', '#d9caa6', '#4a3d2c'],
    urban: ['#9a9b9c', '#6a6b6d', '#3e3f42', '#c9cacb'],
    navy: ['#3b4b66', '#26344d', '#5d6f8c', '#171e2c'],
    arctic: ['#e9ecef', '#c4c9ce', '#8e969d', '#5f676e'],
    jungle: ['#43602c', '#2a3d1d', '#6d7d3c', '#13180f'],
  };
  const blobby = (p) => p.pattern !== 'splinter';
  const digi = (p) => p.pattern === 'digital' || p.pattern === 'dtiger';
  const striped = (p) => p.pattern === 'tiger' || p.pattern === 'dtiger';
  const hasOv = (p) => p.overlay !== 'none';

  function fieldGrid(FW, FH, sx, sy, oct, gain, seed) {
    const f = new Float32Array(FW * FH);
    for (let j = 0; j < FH; j++)
      for (let i = 0; i < FW; i++) f[j * FW + i] = U.fractal('perlin', (i / FW) * sx, (j / FH) * sy, sx, sy, oct, gain, 'fbm', seed);
    return f;
  }
  function sampleGrid(f, FW, FH, u, v) {
    const x = u * FW, y = v * FH, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const xa = U.mod(x0, FW), xb = (xa + 1) % FW, ya = U.mod(y0, FH), yb = (ya + 1) % FH;
    return U.lerp(U.lerp(f[ya * FW + xa], f[ya * FW + xb], fx), U.lerp(f[yb * FW + xa], f[yb * FW + xb], fx), fy);
  }

  const colorParams = [1, 2, 3, 4, 5, 6].map((i) => ({
    key: 'c' + i, label: i === 1 ? 'Base' : 'Color ' + i, type: 'color', default: (PRESETS.woodland[i - 1] || '#000000'),
    show: (p) => i <= p.count,
  }));

  // shorthand for presets with their own palette: pal('#base', '#c2', ...) -> { preset: 'custom', count, c1.. }
  const pal = (...c) => c.reduce((o, h, i) => { o['c' + (i + 1)] = h; return o; }, { preset: 'custom', count: c.length });
  const P = (name, group, values, ...c) => ({ name, group, values: c.length ? Object.assign(pal(...c), values) : values });

  U.register({
    id: 'camo',
    name: 'Camo',
    desc: 'Tileable woodland, digital, tiger, splinter, flecktarn camo',
    tags: ['Texturing', 'Shooter'],
    tileable: true,
    icon: U.icon('<path d="M3.5 8c2.5-3 5 0 7.5-1.5S15 3 17 5s3.5 2.5 3 5-3 2-4.5 4-4 5-7 4-3-3-4.5-4S1.5 10.5 3.5 8z"/><path d="M8 10c1-1 3 0 3 1.5S9 14 8 13s-1-2 0-3z"/>'),
    params: [
      { type: 'section', label: 'Camo' },
      { key: 'pattern', label: 'Pattern', type: 'select', default: 'woodland', options: [['woodland', 'Woodland (blobs)'], ['digital', 'Digital (pixel)'], ['tiger', 'Tiger stripe'], ['dtiger', 'Digital tiger'], ['splinter', 'Splinter'], ['flecktarn', 'Flecktarn (dots)']] },
      {
        key: 'preset', label: 'Palette', type: 'select', default: 'woodland',
        options: [['woodland', 'Woodland'], ['desert', 'Desert'], ['arid', 'Arid 5-color'], ['urban', 'Urban'], ['navy', 'Naval blue'], ['arctic', 'Arctic'], ['jungle', 'Jungle'], ['custom', 'Custom']],
        apply: (v, p) => {
          const c = PRESETS[v];
          if (!c) return;
          c.forEach((h, i) => { p['c' + (i + 1)] = h; });
          p.count = c.length;
        },
      },
      { key: 'scale', label: 'Scale', type: 'int', min: 1, max: 16, default: 3 },
      { key: 'pixels', label: 'Pixel grid', type: 'int', min: 8, max: 256, default: 64, show: digi },
      { key: 'stretch', label: 'Stretch', type: 'int', min: 1, max: 8, default: 4, show: striped },
      { key: 'vertical', label: 'Vertical stripes', type: 'bool', default: false, show: striped },
      { key: 'coverage', label: 'Coverage', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: blobby },
      { key: 'detail', label: 'Detail', type: 'int', min: 1, max: 6, default: 4, show: blobby },
      { key: 'rough', label: 'Roughness', type: 'range', min: 0.2, max: 0.8, step: 0.01, default: 0.5, show: blobby },
      { key: 'dotSize', label: 'Dot size', type: 'range', min: 0.1, max: 0.6, step: 0.01, default: 0.35, show: (p) => p.pattern === 'flecktarn' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 2024 },
      { type: 'section', label: 'Colors' },
      { key: 'count', label: 'Colors', type: 'int', min: 2, max: 6, default: 4 },
      ...colorParams,
      { type: 'section', label: 'Overlay' },
      { key: 'overlay', label: 'Overlay', type: 'select', default: 'none', options: [['none', 'None'], ['chips', 'Chips (rocks)'], ['rain', 'Rain streaks']] },
      { key: 'ovDensity', label: 'Density', type: 'range', min: 0.02, max: 1, step: 0.01, default: 0.35, show: hasOv },
      { key: 'ovSize', label: 'Size', type: 'range', min: 0.05, max: 0.6, step: 0.01, default: 0.2, show: hasOv },
      { key: 'ov1', label: 'Overlay color', type: 'color', default: '#16150f', show: hasOv },
      { key: 'ov2', label: 'Overlay color 2', type: 'color', default: '#16150f', show: hasOv },
    ],
    presets: [
      // --- real-world patterns ---
      P('US Woodland (M81)', 'Realistic', {}, '#a69c6e', '#4b5a33', '#5e4630', '#1a1a14'),
      P('ERDL', 'Realistic', { scale: 4, detail: 5, rough: 0.6, coverage: 0.52 }, '#8d9656', '#5e4a2e', '#33452a', '#16160f'),
      P('USMC frogskin (WWII)', 'Realistic', { scale: 5, detail: 2, rough: 0.3, coverage: 0.45 }, '#b2a882', '#7a8452', '#48583a', '#6a5236', '#2a2f22'),
      P('Vietnam tiger stripe', 'Realistic', { pattern: 'tiger', stretch: 5, coverage: 0.55 }, '#7c7f50', '#4a5a2a', '#5a4a2c', '#171711'),
      P('Desert 3-color', 'Realistic', { scale: 2 }, '#d6c19a', '#a88a62', '#8a7a56'),
      P('6-color desert (chocolate chip)', 'Realistic', { scale: 2, coverage: 0.45, overlay: 'chips', ovDensity: 0.55, ovSize: 0.24, ov1: '#1c1915', ov2: '#f1ebdc' }, '#d1b98f', '#a8875e', '#7e6347'),
      P('Multicam-ish', 'Realistic', { scale: 4, detail: 5, rough: 0.62, coverage: 0.45 }, '#a69a74', '#7c7252', '#5c5c3c', '#c6ba98', '#4c3c2a'),
      P('UCP digital', 'Realistic', { pattern: 'digital', pixels: 80, scale: 4 }, '#a5a796', '#7d8473', '#cdccb9'),
      P('MARPAT woodland', 'Realistic', { pattern: 'digital', pixels: 96, scale: 5 }, '#77744f', '#4a4b33', '#5c4a35', '#26261d'),
      P('MARPAT desert', 'Realistic', { pattern: 'digital', pixels: 96, scale: 5 }, '#cdb48a', '#a6865c', '#6e5a40'),
      P('AOR-1 (desert digital)', 'Realistic', { pattern: 'digital', pixels: 144, scale: 6, detail: 5 }, '#cbb68e', '#a88c64', '#8c7c55', '#6c5840'),
      P('Naval digital (NWU)', 'Realistic', { pattern: 'digital', pixels: 80, scale: 4, preset: 'navy' }),
      P('CADPAT (temperate)', 'Realistic', { pattern: 'digital', pixels: 176, scale: 6, detail: 5 }, '#77844e', '#45593a', '#4e3f2e', '#1b1f16'),
      P('Chinese Type 07', 'Realistic', { pattern: 'digital', pixels: 64, scale: 3, coverage: 0.55 }, '#5f6440', '#7e7552', '#3c4a30', '#262820'),
      P('British DPM', 'Realistic', { scale: 4, rough: 0.55, coverage: 0.48 }, '#a49c6c', '#6c7741', '#5c3e27', '#191711'),
      P('British desert DPM', 'Realistic', { scale: 3, coverage: 0.4 }, '#d3bd92', '#8f6c48'),
      P('French CCE', 'Realistic', { scale: 4, detail: 5, rough: 0.58, coverage: 0.5 }, '#8b8a5a', '#536238', '#6c4b32', '#1b1b15'),
      P('Flecktarn', 'Realistic', { pattern: 'flecktarn' }, '#8b8f68', '#5a6040', '#3a4228', '#6a4a30', '#14140f'),
      P('Tropentarn', 'Realistic', { pattern: 'flecktarn', dotSize: 0.32, coverage: 0.45 }, '#c9b88f', '#8a8a5c', '#7c5f42', '#2b2b20'),
      P('Splinter (Splittertarn)', 'Realistic', { pattern: 'splinter', overlay: 'rain', ovDensity: 0.55, ovSize: 0.14, ov1: '#2e3a22' }, '#a49a72', '#5a6a3a', '#6a4a32', '#3e4c2c'),
      P('East German Strichtarn', 'Realistic', { scale: 2, coverage: 0.4, overlay: 'rain', ovDensity: 0.7, ovSize: 0.16, ov1: '#3e4630' }, '#8b8c74', '#83846c'),
      P('Swedish M90', 'Realistic', { pattern: 'splinter', scale: 4 }, '#9ba67a', '#5a6c3e', '#2f3d26', '#1c1d17', '#9ba67a'),
      P('Danish M84', 'Realistic', { pattern: 'flecktarn', dotSize: 0.4, coverage: 0.48 }, '#8c9868', '#4b6236', '#1e231a'),
      P('Swiss TAZ 83', 'Realistic', { pattern: 'flecktarn', scale: 4, dotSize: 0.26, coverage: 0.55 }, '#a9a487', '#6f7a4b', '#8a5a3a', '#3e4a2e', '#1a1a14'),
      P('Czech vz.95', 'Realistic', { scale: 6, detail: 5, rough: 0.6, coverage: 0.55 }, '#7f8c5c', '#3f5131', '#5d4632', '#17170f'),
      P('Italian Vegetato', 'Realistic', { scale: 5, detail: 6, rough: 0.72, coverage: 0.5 }, '#a2976a', '#5d6c3a', '#704f33', '#2a2c1e'),
      P('Polish wz.93 Pantera', 'Realistic', { pattern: 'tiger', stretch: 2, detail: 5, rough: 0.6, scale: 4 }, '#6e7448', '#4a5434', '#5a4030', '#16150f'),
      P('Russian Flora (VSR-98)', 'Realistic', { pattern: 'tiger', vertical: true, stretch: 3, scale: 4, coverage: 0.5 }, '#7f8a62', '#a9a079', '#3e5a34', '#5c4a35'),
      P('Soviet Berezka (birch)', 'Realistic', { pattern: 'flecktarn', dotSize: 0.45, scale: 2, coverage: 0.55 }, '#c7c3a0', '#5c6e3c', '#7f9256'),
      P('Rhodesian brushstroke', 'Realistic', { pattern: 'tiger', stretch: 2, scale: 2, detail: 3, rough: 0.42, coverage: 0.45 }, '#ab9d6e', '#4e5a34', '#5c3f29'),
      P('Urban grey', 'Realistic', { preset: 'urban' }),
      P('Snow', 'Realistic', { preset: 'arctic', coverage: 0.3, count: 3 }),
      P('Jungle', 'Realistic', { preset: 'jungle', scale: 4 }),
      P('Naval dazzle', 'Realistic', { pattern: 'splinter', scale: 2, seed: 7 }, '#eef0ef', '#1b1d24', '#5b6b82', '#a9b5c5', '#1b1d24'),
      // --- stylized / sci-fi ---
      P('Pink camo', 'Stylized', {}, '#f7b6d2', '#e07aa8', '#b04478', '#5a1a3a'),
      P('Toon blobs', 'Stylized', { scale: 2, detail: 1, rough: 0.2 }, '#9fd25a', '#4e9a3a', '#2a5a2a'),
      P('Pop-art camo', 'Stylized', { scale: 2, detail: 2 }, '#ffde3a', '#ff4a8a', '#3ab0ff', '#7a3aff', '#111111'),
      P('Neon digital', 'Stylized', { pattern: 'digital', pixels: 32 }, '#0a0a12', '#ff2bd6', '#3af0ff', '#6a3aff'),
      P('Active camo (adaptive)', 'Sci-fi', { pattern: 'digital', pixels: 160, scale: 5, rough: 0.7 }, '#3c4754', '#2f3844', '#4a5866', '#262d36'),
      P('Stealth splinter', 'Sci-fi', { pattern: 'splinter', scale: 5 }, '#1c2026', '#242a31', '#2e353e', '#15181c'),
      P('Alien jungle', 'Sci-fi', { pattern: 'flecktarn' }, '#1e3a3a', '#3ad0b0', '#6a2a8a', '#0c1418'),
      P('Thermal cloak', 'Sci-fi', { pattern: 'tiger', stretch: 3 }, '#101a3a', '#2a3a8a', '#5a2a9a', '#0a0a18'),
      // --- game-inspired (recreated via settings) ---
      P('CoD-style red tiger', 'Game-inspired', { pattern: 'tiger', stretch: 6, coverage: 0.6 }, '#b0141a', '#3a0505', '#0c0303'),
      P('CoD-style blue tiger', 'Game-inspired', { pattern: 'tiger', stretch: 6, coverage: 0.6 }, '#2a5ad0', '#0a1a5a', '#03040c'),
      P('CoD-style digital red tiger', 'Game-inspired', { pattern: 'dtiger', pixels: 64, stretch: 4, coverage: 0.58 }, '#c01820', '#4a0608', '#0e0303'),
      P('CoD-style gold', 'Game-inspired', { scale: 3, detail: 3, rough: 0.45 }, '#d8aa36', '#a87a1c', '#f2d474', '#6e4c0c'),
      P('CoD-style diamond', 'Game-inspired', { pattern: 'splinter', scale: 5 }, '#c4e8ff', '#eef8ff', '#82bce4', '#ffffff', '#a2d2f2'),
      P('CoD-style urban digital', 'Game-inspired', { pattern: 'digital', pixels: 64, scale: 4, coverage: 0.55 }, '#5a5c60', '#2c2d30', '#8e9094', '#141416'),
      P('Battlefield-style naval splinter', 'Game-inspired', { pattern: 'splinter', scale: 3 }, '#56657a', '#2a3444', '#8592a4', '#1a2029'),
      P('Tarkov-style A-TACS', 'Game-inspired', { scale: 6, detail: 6, rough: 0.7, coverage: 0.55 }, '#b8a684', '#8a7656', '#6a5a40', '#4c3e2c', '#d2c4a2'),
      P('Tarkov-style Multicam Black', 'Game-inspired', { scale: 4, detail: 5, rough: 0.62, coverage: 0.45 }, '#2c2c2b', '#1b1b1b', '#3d3d3a', '#101010'),
      P('Tarkov-style EMR digital', 'Game-inspired', { pattern: 'digital', pixels: 128, scale: 5, detail: 5 }, '#7a7a54', '#4c5636', '#5e4a36', '#232419'),
      P('Rainbow Six-style urban tiger', 'Game-inspired', { pattern: 'tiger', stretch: 4, coverage: 0.5 }, '#6e7176', '#3c3e42', '#a4a7ab', '#141518'),
      P('PUBG-style desert digital', 'Game-inspired', { pattern: 'digital', pixels: 48, scale: 3 }, '#d9c39a', '#b89a6c', '#8e7652', '#5c4a34'),
      P('Halo-style UNSC digital', 'Game-inspired', { pattern: 'digital', pixels: 56, scale: 3, coverage: 0.55 }, '#4f5c46', '#2d3a32', '#6e7b5e', '#1a2222', '#3f6670'),
      P('Fortnite-style arctic', 'Game-inspired', { scale: 2, detail: 2, rough: 0.3 }, '#f4fbff', '#9fdcff', '#4fb0f0', '#2a5fc8'),
      P('Metal Gear-style olive drab', 'Game-inspired', { scale: 3, detail: 3, coverage: 0.45 }, '#5b5e3c', '#53562f', '#646846'),
      P('Metal Gear-style splitter', 'Game-inspired', { pattern: 'splinter', scale: 3 }, '#8a7a50', '#5a4a30', '#58643a', '#3a3a26'),
      P('Metal Gear-style tuxedo', 'Game-inspired', { pattern: 'splinter', scale: 2, seed: 11 }, '#111113', '#111113', '#e8e8e4', '#111113'),
      P('Ghost-style arctic digital', 'Game-inspired', { pattern: 'digital', pixels: 48, scale: 6, preset: 'arctic' }),
      P('Ghost Recon-style Multicam Tropic', 'Game-inspired', { scale: 4, detail: 5, rough: 0.62, coverage: 0.45 }, '#4f5c33', '#2e3c22', '#6e7642', '#1c2416', '#7a6a44'),
    ],
    render(ctx, W, H, p) {
      const n = U.clamp(p.count | 0, 2, 6), asp = H / W;
      const cols = [];
      for (let i = 0; i < n; i++) cols.push(U.hex(p['c' + (i + 1)]));
      const thr = (l) => 0.5 + (0.5 - p.coverage) * 0.3 + (l - 1) * 0.02;
      const sx0 = p.scale, sy0 = Math.max(1, Math.round(p.scale * asp));
      const st = striped(p) ? p.stretch : 1;
      const sx = p.vertical && st > 1 ? sx0 * st : sx0, sy = !p.vertical ? sy0 * st : sy0;

      let cells = null, cx = 0, cy = 0, fields = null, FW = 0, FH = 0;
      if (digi(p)) {
        cx = p.pixels; cy = Math.max(1, Math.round(p.pixels * asp));
        cells = new Uint8Array(cx * cy);
        for (let j = 0; j < cy; j++)
          for (let i = 0; i < cx; i++) {
            const u = ((i + 0.5) / cx) * sx, v = ((j + 0.5) / cy) * sy;
            let idx = 0;
            for (let l = 1; l < n; l++) if (U.fractal('perlin', u, v, sx, sy, p.detail, p.rough, 'fbm', p.seed + l * 97) > thr(l)) idx = l;
            cells[j * cx + i] = idx;
          }
      } else if (p.pattern !== 'splinter') {
        // evaluate the fields on a capped grid and interpolate: same look, far faster at 4K
        FW = Math.min(W, 640); FH = Math.max(1, Math.round(FW * asp));
        fields = [];
        for (let l = 1; l < n; l++) fields[l] = fieldGrid(FW, FH, sx, sy, p.detail, p.rough, p.seed + l * 97);
      }
      const D = p.scale * 10, Dy = Math.max(1, Math.round(D * asp));
      // overlay grids (integer periods so they tile)
      const ov = p.overlay, oc = [U.hex(p.ov1), U.hex(p.ov2)];
      const CD = p.scale * 8, CDy = Math.max(1, Math.round(CD * asp));
      const RX = p.scale * 20, RY = Math.max(1, Math.round(p.scale * 6 * asp)), rw = Math.max(p.ovSize * 0.5, (0.6 * RX) / W);

      U.pixels(ctx, W, H, (x, y, o) => {
        const u = (x + 0.5) / W, v = (y + 0.5) / H;
        let idx = 0;
        if (cells) idx = cells[Math.min(cy - 1, (v * cy) | 0) * cx + Math.min(cx - 1, (u * cx) | 0)];
        else if (p.pattern === 'splinter') {
          const w = U.worley(u * sx * 2, v * sy * 2, sx * 2, sy * 2, p.seed);
          idx = Math.min(n - 1, (w.id * n) | 0);
        } else {
          for (let l = 1; l < n; l++) {
            const f = sampleGrid(fields[l], FW, FH, u, v);
            if (p.pattern === 'flecktarn') {
              if (f > thr(l) - 0.06 && U.worley(u * D, v * Dy, D, Dy, p.seed + l * 31).f1 < p.dotSize) idx = l;
            } else if (f > thr(l)) idx = l;
          }
        }
        let c = cols[idx];
        if (ov === 'chips') {
          const w = U.worley(u * CD, v * CDy, CD, CDy, p.seed + 555), id = w.id;
          // wobble the edge a little so chips look like pebbles, not discs
          const r = p.ovSize * (0.75 + 0.5 * U.hash(id * 1e6, 3, p.seed)) * (1 + 0.25 * U.perlin(u * CD * 3, v * CDy * 3, CD * 3, CDy * 3, p.seed + 9));
          if (id < p.ovDensity && w.f1 < r) c = oc[id < p.ovDensity * 0.5 ? 0 : 1];
        } else if (ov === 'rain') {
          const gx = u * RX, ix = Math.floor(gx), fx = gx - ix, iw = U.mod(ix, RX);
          const gy = v * RY + U.hash(iw, 0, p.seed + 1), iy = Math.floor(gy), fy = gy - iy;
          if (fy < 0.8 && Math.abs(fx - 0.5) < rw && U.hash(iw, U.mod(iy, RY), p.seed + 3) < p.ovDensity) c = oc[0];
        }
        o[0] = c[0]; o[1] = c[1]; o[2] = c[2];
      });
    },
  });
})();
