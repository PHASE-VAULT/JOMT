/* Galaxy: tileable deep-space textures for skies, backgrounds and weapon / gear skins.
     nebula   – domain-warped fractal clouds in three colors (a slow hue field picks the mix), brighter
                filaments, dark dust lanes cutting through them,
     stars    – three lattice layers (many faint, fewer medium, a few bright), star colors from blue-white to
                orange by temperature, soft halos and four-point diffraction spikes on the brightest,
     galaxies – small spiral galaxies scattered over the tile (tilted discs with logarithmic arms and a core),
     look     – realistic, or stylized (posterized nebula bands, crisp stars) for cartoon / arcade skins;
                exposure, saturation and grain.
   Every noise period and star lattice is a whole number per tile, and stars near an edge are found from the
   wrapped neighbour cells, so the texture repeats seamlessly. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;
  const TAU = Math.PI * 2;
  const wr = (i, n) => { i %= n; return i < 0 ? i + n : i; };

  const PAL = {
    purple: { bg: '#04030c', bg2: '#0b0820', neb1: '#5a2aa8', neb2: '#c03a9a', neb3: '#2a6ad8', dust: '#020106' },
    teal: { bg: '#020a10', bg2: '#06182a', neb1: '#0fa8b0', neb2: '#ff4a9a', neb3: '#3a4ad8', dust: '#010406' },
    fire: { bg: '#080302', bg2: '#1a0806', neb1: '#c0281a', neb2: '#ff9a2a', neb3: '#6a1a5a', dust: '#030101' },
    emerald: { bg: '#020804', bg2: '#061a10', neb1: '#1aa860', neb2: '#2ad8c8', neb3: '#8ac82a', dust: '#010402' },
    gold: { bg: '#060402', bg2: '#140e06', neb1: '#c8902a', neb2: '#fff0b0', neb3: '#8a3a1a', dust: '#020101' },
    ice: { bg: '#02040a', bg2: '#081428', neb1: '#4a8ae8', neb2: '#cfe8ff', neb3: '#6a4ad8', dust: '#010206' },
  };
  const PAL_OPTS = [['purple', 'Purple nebula'], ['teal', 'Teal / pink'], ['fire', 'Fire'], ['emerald', 'Emerald'], ['gold', 'Gold'], ['ice', 'Ice blue'], ['custom', 'Custom']];
  const STAR_T = [[155, 176, 255], [202, 215, 255], [248, 247, 255], [255, 244, 234], [255, 210, 161], [255, 180, 120]];

  U.register({
    id: 'galaxy',
    name: 'Galaxy',
    desc: 'Tileable galaxy and deep-space textures: nebula clouds, dust lanes, star fields with diffraction spikes and spiral galaxies, realistic or stylized',
    uses: [
      'Galaxy weapon, knife and gear skins: tile it over the UV layout; the stylized look gives flat, posterized cosmic skins.',
      'Seamless space backgrounds and skybox detail for menus, loading screens, sci-fi games and stream overlays.',
    ],
    tags: ['Sci-fi', 'Shooter', 'Texturing'],
    tileable: true,
    icon: U.icon('<path d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/><path d="M12 10c4-4 9-1 7 3M12 14c-4 4-9 1-7-3"/><path d="M18.5 5.5v2M17.5 6.5h2M5 18v1.6M4.2 18.8h1.6" opacity=".7"/>'),
    params: [
      { type: 'section', label: 'Nebula' },
      { key: 'palette', label: 'Palette', type: 'select', default: 'purple', options: PAL_OPTS, apply: (v, p) => { if (PAL[v]) Object.assign(p, PAL[v]); } },
      { key: 'nebula', label: 'Nebula brightness', type: 'range', min: 0, max: 2, step: 0.01, default: 1 },
      { key: 'coverage', label: 'Coverage', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'How much of the sky the clouds fill' },
      { key: 'scale', label: 'Cloud scale', type: 'int', min: 1, max: 12, default: 2, tip: 'Cloud features across the tile' },
      { key: 'warp', label: 'Swirl', type: 'range', min: 0, max: 2, step: 0.01, default: 0.9, tip: 'Domain warp: wispy, swirling clouds' },
      { key: 'detail', label: 'Detail', type: 'int', min: 2, max: 7, default: 6 },
      { key: 'filaments', label: 'Filaments', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Bright thin strands inside the clouds' },
      { key: 'dust', label: 'Dust lanes', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Dark dust cutting through the clouds' },
      { key: 'neb1', label: 'Nebula color 1', type: 'color', default: PAL.purple.neb1 },
      { key: 'neb2', label: 'Nebula color 2', type: 'color', default: PAL.purple.neb2 },
      { key: 'neb3', label: 'Nebula color 3', type: 'color', default: PAL.purple.neb3 },
      { key: 'dustColor', label: 'Dust color', type: 'color', default: PAL.purple.dust, show: (p) => p.dust > 0 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 3 },

      { type: 'section', label: 'Stars' },
      { key: 'stars', label: 'Star density', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6 },
      { key: 'starSize', label: 'Star size', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1 },
      { key: 'starBright', label: 'Star brightness', type: 'range', min: 0, max: 2, step: 0.01, default: 1 },
      { key: 'bigStars', label: 'Bright stars', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'A few large stars with halos' },
      { key: 'spikes', label: 'Diffraction spikes', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.bigStars > 0 },
      { key: 'starColor', label: 'Star colors', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: '0 = all white, 1 = full blue-to-orange temperature range' },
      { key: 'nebStars', label: 'Stars follow clouds', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'More stars inside the bright clouds' },

      { type: 'section', label: 'Galaxies' },
      { key: 'galaxies', label: 'Spiral galaxies', type: 'int', min: 0, max: 12, default: 2 },
      { key: 'galSize', label: 'Galaxy size', type: 'range', min: 0.03, max: 0.4, step: 0.005, default: 0.1, show: (p) => p.galaxies > 0, tip: 'Radius relative to the tile' },
      { key: 'arms', label: 'Arms', type: 'int', min: 1, max: 6, default: 2, show: (p) => p.galaxies > 0 },
      { key: 'twist', label: 'Arm twist', type: 'range', min: 0, max: 6, step: 0.05, default: 2.6, show: (p) => p.galaxies > 0 },
      { key: 'galColor', label: 'Galaxy color', type: 'color', default: '#d8c8ff', show: (p) => p.galaxies > 0 },

      { type: 'section', label: 'Look' },
      { key: 'style', label: 'Style', type: 'select', default: 'realistic', options: [['realistic', 'Realistic'], ['stylized', 'Stylized (posterized)']] },
      { key: 'bands', label: 'Color steps', type: 'int', min: 2, max: 10, default: 5, show: (p) => p.style === 'stylized' },
      { key: 'bg', label: 'Space color', type: 'color', default: PAL.purple.bg },
      { key: 'bg2', label: 'Space color 2', type: 'color', default: PAL.purple.bg2, tip: 'Soft large-scale variation of the background' },
      { key: 'exposure', label: 'Exposure', type: 'range', min: 0.3, max: 2.5, step: 0.01, default: 1 },
      { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 2, step: 0.01, default: 1.1 },
      { key: 'grain', label: 'Grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
    ],
    presets: [
      { name: 'Purple nebula', group: 'Realistic', values: {} },
      { name: 'Teal & pink nebula', group: 'Realistic', values: { palette: 'teal', ...PAL.teal, seed: 8 } },
      { name: 'Fire nebula', group: 'Realistic', values: { palette: 'fire', ...PAL.fire, warp: 1.2, filaments: 0.6, seed: 14 } },
      { name: 'Emerald nebula', group: 'Realistic', values: { palette: 'emerald', ...PAL.emerald, seed: 21 } },
      { name: 'Deep star field', group: 'Realistic', values: { nebula: 0.25, coverage: 0.35, dust: 0.2, stars: 0.9, bigStars: 0.6, galaxies: 4, galSize: 0.06, seed: 5 } },
      { name: 'Galactic core', group: 'Realistic', values: { palette: 'gold', ...PAL.gold, neb1: '#a8641e', coverage: 0.55, exposure: 0.85, nebula: 1, dust: 0.7, stars: 1, nebStars: 0.9, galaxies: 0, seed: 9 } },
      { name: 'Ice galaxy', group: 'Realistic', values: { palette: 'ice', ...PAL.ice, galaxies: 1, galSize: 0.3, twist: 3, arms: 2, galColor: '#cfe8ff', coverage: 0.4, seed: 2 } },
      { name: 'Galaxy skin', group: 'Skins', values: { scale: 3, nebula: 1.4, coverage: 0.75, exposure: 1.2, saturation: 1.4, stars: 0.8, bigStars: 0.5, galaxies: 1, seed: 11 } },
      { name: 'Pink galaxy skin', group: 'Skins', values: { palette: 'teal', ...PAL.teal, neb1: '#ff3aa8', neb2: '#7a2aff', neb3: '#2ad8ff', scale: 3, nebula: 1.4, coverage: 0.8, exposure: 1.2, saturation: 1.4, seed: 17 } },
      { name: 'Dark matter skin', group: 'Skins', values: { neb1: '#3a1a6a', neb2: '#ff2a8a', neb3: '#1a0a3a', scale: 4, nebula: 1.1, coverage: 0.6, dust: 0.8, filaments: 0.8, stars: 0.7, galaxies: 0, saturation: 1.3, seed: 23 } },
      { name: 'Cartoon space', group: 'Stylized', values: { style: 'stylized', bands: 4, palette: 'purple', scale: 2, warp: 0.7, filaments: 0.2, dust: 0.3, stars: 0.5, spikes: 0.8, grain: 0, saturation: 1.3, galaxies: 1, seed: 4 } },
      { name: 'Arcade cosmic skin', group: 'Stylized', values: { style: 'stylized', bands: 5, neb1: '#ff2a8a', neb2: '#2af0ff', neb3: '#7a2aff', bg: '#07041a', bg2: '#120838', scale: 3, coverage: 0.8, nebula: 1.4, stars: 0.6, spikes: 0.9, grain: 0, saturation: 1.4, seed: 30 } },
    ],

    render(ctx, W, H, p, opts) {
      const S = Math.min(W, H), k = S / 512, seed = p.seed | 0, ar = H / W;
      const sc = Math.max(1, p.scale | 0), nx = sc, ny = Math.max(1, Math.round(sc * ar));
      const oct = Math.max(2, p.detail | 0), stylized = p.style === 'stylized', nb = Math.max(2, p.bands | 0);
      const c1 = U.hex(p.neb1), c2 = U.hex(p.neb2), c3 = U.hex(p.neb3), dc = U.hex(p.dustColor), bg = U.hex(p.bg), bg2 = U.hex(p.bg2), gc = U.hex(p.galColor);
      const fb = (u, v, fx, fy, o, s, mode) => U.fractal('perlin', u * fx, v * fy, fx, fy, o, 0.5, mode || 'fbm', seed + s);
      // warp + hue + background + dust on coarse grids (smooth, cheap)
      const qx = U.coarseField(W, H, 200, (x, y) => fb(x / W, y / H, nx, ny, 4, 1) - 0.5);
      const qy = U.coarseField(W, H, 200, (x, y) => fb(x / W, y / H, nx, ny, 4, 2) - 0.5);
      const hue = U.coarseField(W, H, 140, (x, y) => fb(x / W, y / H, nx, ny, 3, 3));
      const hue2 = U.coarseField(W, H, 140, (x, y) => fb(x / W, y / H, nx * 2, ny * 2, 3, 4));
      const bgF = U.coarseField(W, H, 100, (x, y) => fb(x / W, y / H, 2, Math.max(1, Math.round(2 * ar)), 3, 5));
      const dustF = p.dust > 0 ? U.coarseField(W, H, 320, (x, y) => fb(x / W, y / H, nx * 2, ny * 2, 5, 6, 'ridged')) : null;

      /* ---- nebula + background ---- */
      const N = W * H, R = new Float32Array(N), G = new Float32Array(N), B = new Float32Array(N), DEN = new Float32Array(N);
      const cov = p.coverage, quant = (t) => (stylized ? Math.round(clamp(t) * (nb - 1)) / (nb - 1) : t);
      for (let y = 0, i = 0; y < H; y++) {
        const v = (y + 0.5) / H;
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W;
          const wu = u + (qx[i] * p.warp) / nx, wv = v + (qy[i] * p.warp) / ny;
          const n = fb(wu, wv, nx, ny, oct, 7);
          let d = smoothstep(0.62 - cov * 0.4, 0.95 - cov * 0.3, n);
          if (p.filaments > 0) { const fl = fb(wu, wv, nx * 2, ny * 2, 4, 8, 'ridged'); d += Math.pow(fl, 4) * p.filaments * 0.9 * smoothstep(0.3, 0.7, d + 0.2); }
          if (dustF) d *= 1 - smoothstep(0.55, 0.9, dustF[i]) * p.dust * 0.9;
          d = clamp(d * p.nebula, 0, 1.6);
          if (stylized) d = quant(smoothstep(0.02, 1, d)) * 1.05;
          DEN[i] = clamp(d);
          // nebula color: hue field mixes the three colors; dense cores shift toward color 2
          let h1 = clamp(hue[i] * 1.6 - 0.3), h2 = smoothstep(0.55, 0.85, hue2[i] * 0.6 + d * 0.35);
          if (stylized) { h1 = Math.round(h1 * 2) / 2; h2 = h2 > 0.5 ? 1 : 0; }
          let r = lerp(c1[0], c3[0], h1), g = lerp(c1[1], c3[1], h1), b = lerp(c1[2], c3[2], h1);
          r = lerp(r, c2[0], h2); g = lerp(g, c2[1], h2); b = lerp(b, c2[2], h2);
          const t = smoothstep(0, 1, bgF[i]);
          let br = lerp(bg[0], bg2[0], t), bgG = lerp(bg[1], bg2[1], t), bb = lerp(bg[2], bg2[2], t);
          if (dustF) { const dd = smoothstep(0.6, 0.95, dustF[i]) * p.dust * 0.6; br = lerp(br, dc[0], dd); bgG = lerp(bgG, dc[1], dd); bb = lerp(bb, dc[2], dd); }
          // additive light: clouds glow over the background, bright cores burn toward white
          const core = Math.max(0, d - 1) * 0.6;
          R[i] = br + r * Math.min(1, d) + 255 * core; G[i] = bgG + g * Math.min(1, d) + 255 * core; B[i] = bb + b * Math.min(1, d) + 255 * core;
        }
      }

      /* ---- spiral galaxies (wrapped, so they tile) ---- */
      if (p.galaxies > 0) {
        const rnd = U.rng(seed + 50), nG = p.galaxies | 0;
        for (let gI = 0; gI < nG; gI++) {
          const gx = rnd() * W, gy = rnd() * H, Rg = p.galSize * S * (0.6 + rnd() * 0.6), rot = rnd() * TAU, tilt = 0.35 + rnd() * 0.65, dir = rnd() < 0.5 ? 1 : -1;
          const ext = Math.ceil(Rg * 2.2), cs = Math.cos(rot), sn = Math.sin(rot), arms = Math.max(1, p.arms | 0);
          for (let yy = -ext; yy <= ext; yy++) for (let xx = -ext; xx <= ext; xx++) {
            const lx = (xx * cs + yy * sn) / Rg, ly = (-xx * sn + yy * cs) / (Rg * tilt);
            const r = Math.hypot(lx, ly);
            if (r > 2.2) continue;
            const th = Math.atan2(ly, lx);
            const arm = Math.pow(0.5 + 0.5 * Math.cos(arms * (th - dir * Math.log(r + 0.05) * p.twist)), 3);
            const disc = Math.exp(-r * 2.2), core = Math.exp(-r * r * 30);
            const I = (disc * (0.25 + arm * 0.9) + core * 1.6) * 0.85;
            if (I < 0.004) continue;
            const px = wr(Math.round(gx + xx), W), py = wr(Math.round(gy + yy), H), j = py * W + px;
            const wc = core * 0.8;
            R[j] += (gc[0] * (1 - wc) + 255 * wc) * I; G[j] += (gc[1] * (1 - wc) + 255 * wc) * I; B[j] += (gc[2] * (1 - wc) + 255 * wc) * I;
          }
        }
      }

      /* ---- stars: three lattice layers ---- */
      const LAYERS = [
        { cell: 7, prob: 0.55, size: 0.55, bright: 0.55 },
        { cell: 22, prob: 0.45, size: 0.9, bright: 0.9 },
        { cell: 70, prob: 0.5 * p.bigStars, size: 1.6, bright: 1.5, big: true },
      ];
      for (let L = 0; L < LAYERS.length; L++) {
        const ly = LAYERS[L];
        if (p.stars <= 0 || ly.prob <= 0) continue;
        const cpx = ly.cell * k, gxN = Math.max(1, Math.round(W / cpx)), gyN = Math.max(1, Math.round(H / cpx)), cw = W / gxN, ch = H / gyN;
        const reach = Math.ceil((ly.big ? 18 : 4) * k * p.starSize * (ly.big ? 1 + p.spikes : 1));
        for (let cj = 0; cj < gyN; cj++) for (let ci = 0; ci < gxN; ci++) {
          const sd = seed + 100 + L * 17;
          if (hash(ci, cj, sd) > ly.prob * (0.3 + p.stars * 0.9)) continue;
          const sx = (ci + hash(ci, cj, sd + 1)) * cw, sy = (cj + hash(ci, cj, sd + 2)) * ch;
          const si = wr(Math.floor(sy), H) * W + wr(Math.floor(sx), W);
          if (p.nebStars > 0 && hash(ci, cj, sd + 3) > 1 - p.nebStars + DEN[si] * p.nebStars * 1.2) continue;
          const mag = Math.pow(hash(ci, cj, sd + 4), 3);
          const I = ly.bright * (0.25 + mag * 0.9) * p.starBright;
          const rad = Math.max(0.35, ly.size * k * p.starSize * (0.6 + mag * 0.8));
          const tq = hash(ci, cj, sd + 5) * (STAR_T.length - 1), t0 = Math.floor(tq), tf = tq - t0;
          const T0 = STAR_T[t0], T1 = STAR_T[Math.min(STAR_T.length - 1, t0 + 1)];
          const sr = lerp(255, lerp(T0[0], T1[0], tf), p.starColor), sg = lerp(255, lerp(T0[1], T1[1], tf), p.starColor), sbb = lerp(255, lerp(T0[2], T1[2], tf), p.starColor);
          const spike = ly.big ? p.spikes * mag : 0, rr = Math.min(reach, Math.ceil(rad * 6 + spike * 26 * k * p.starSize));
          for (let yy = -rr; yy <= rr; yy++) for (let xx = -rr; xx <= rr; xx++) {
            const dx = Math.floor(sx) + xx + 0.5 - sx, dy = Math.floor(sy) + yy + 0.5 - sy, d = Math.hypot(dx, dy);
            let a = stylized ? (d < rad * 1.4 ? 1 : 0) : Math.exp(-(d * d) / (rad * rad * 0.9));
            if (ly.big) a += Math.exp(-d / (rad * 2.5)) * 0.25 * (stylized ? 0.5 : 1);
            if (spike > 0) {
              const sl = 26 * k * p.starSize * spike, w = Math.max(0.6, rad * 0.35);
              const ax = Math.abs(dx), ay = Math.abs(dy);
              a += (Math.exp(-(ay * ay) / (w * w)) * Math.max(0, 1 - ax / sl) + Math.exp(-(ax * ax) / (w * w)) * Math.max(0, 1 - ay / sl)) * 0.7;
            }
            a *= I;
            if (a < 0.004) continue;
            const j = wr(Math.floor(sy) + yy, H) * W + wr(Math.floor(sx) + xx, W);
            R[j] += sr * a; G[j] += sg * a; B[j] += sbb * a;
          }
        }
      }

      /* ---- tone map, saturation, grain ---- */
      const img = ctx.createImageData(W, H), o = img.data, ex = p.exposure, sat = p.saturation;
      for (let i = 0, k4 = 0; i < N; i++, k4 += 4) {
        // soft shoulder: bright additive light rolls off to white instead of clipping hard
        let r = R[i] * ex / 255, g = G[i] * ex / 255, b = B[i] * ex / 255;
        r = 1 - Math.exp(-r * 1.25); g = 1 - Math.exp(-g * 1.25); b = 1 - Math.exp(-b * 1.25);
        const l = r * 0.299 + g * 0.587 + b * 0.114;
        r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
        if (p.grain > 0) { const m = (hash(i % W, (i / W) | 0, seed + 9) - 0.5) * p.grain * 0.06; r += m; g += m; b += m; }
        o[k4] = clamp(r) * 255; o[k4 + 1] = clamp(g) * 255; o[k4 + 2] = clamp(b) * 255; o[k4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
