/* Smoke tilesheet: a billowing puff built from layered noise, seamlessly looping in time.
   Rise / drift use two noise phases that scroll and crossfade (each one is invisible at the moment
   it jumps back), the billows breathe and the swirl follows a circle in noise space, so frame
   t = 1 equals frame t = 0. Density and lighting are computed on a fixed grid (same look at
   every size) and upsampled bilinearly. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, smoothstep, TAU } = U;
  const PER = U.perlin;
  const frac = (x) => x - Math.floor(x);

  U.register({
    id: 'smokeSheet',
    name: 'Smoke',
    desc: 'Looping smoke puff tilesheets from layered, rising and swirling noise with soft lighting or toon shading',
    uses: ['Seamless smoke, steam and dust flipbooks for game particle systems, e.g. chimneys, fires, vents, explosions and footstep dust.', 'Animated smoke sprites for 2D games and stylized toon effects; the white + alpha output can be tinted in the engine.'],
    tags: ['VFX', 'Nature'],
    bg: 'checker',
    animLoop: true,
    animate(p, f) { p.time = (p.time || 0) + f.t; return p; },
    icon: U.icon('<path d="M7 18.5a3.5 3.5 0 0 1-.6-6.95A4.5 4.5 0 0 1 15 9.2a3.8 3.8 0 0 1 2.7 7A3 3 0 0 1 15 18.5z"/><path d="M9.5 6.5c0-1.5 1-2.5 2.5-2.5M14 5c.6-.6 1.4-1 2.3-1"/>'),
    params: [
      { type: 'section', label: 'Puff' },
      { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.8, tip: 'Radius of the puff as a share of the frame' },
      { key: 'billows', label: 'Billows', type: 'int', min: 0, max: 14, default: 7, tip: 'Number of round lumps that make up the outline' },
      { key: 'spread', label: 'Billow spread', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, show: (p) => p.billows > 0 },
      { key: 'squash', label: 'Squash', type: 'range', min: 0.4, max: 1.6, step: 0.01, default: 1, tip: 'Below 1 = flat and wide (dust), above 1 = tall (steam column)' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 11 },

      { type: 'section', label: 'Noise' },
      { key: 'scale', label: 'Billow scale', type: 'range', min: 0.5, max: 8, step: 0.05, default: 2.2, tip: 'Size of the noise lumps: low = big billows, high = fine detail' },
      { key: 'layers', label: 'Layers', type: 'int', min: 1, max: 4, default: 3, tip: 'Noise layers on top of each other, each finer and moving on its own' },
      { key: 'detail', label: 'Detail', type: 'int', min: 1, max: 5, default: 3 },
      { key: 'billowy', label: 'Billowy', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: '0 = soft, wispy noise; 1 = round cauliflower lumps with creases' },
      { key: 'erosion', label: 'Break-up', type: 'range', min: 0, max: 2, step: 0.01, default: 1, tip: 'How much the noise eats into the puff: ragged edges and holes' },
      { key: 'softness', label: 'Softness', type: 'range', min: 0.02, max: 1, step: 0.01, default: 0.35, tip: 'Width of the soft, transparent edge' },
      { key: 'density', label: 'Density', type: 'range', min: 0.05, max: 1.5, step: 0.01, default: 0.85, tip: 'Opacity of the smoke' },

      { type: 'section', label: 'Motion' },
      { key: 'rise', label: 'Rising', type: 'range', min: -1, max: 1, step: 0.01, default: 0.35, tip: 'How far the noise rises through the puff per loop (negative = sinks)' },
      { key: 'drift', label: 'Drift', type: 'range', min: -1, max: 1, step: 0.01, default: 0, tip: 'Sideways movement of the noise per loop' },
      { key: 'swirl', label: 'Swirl', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Churning, curling motion inside the puff' },
      { key: 'breathe', label: 'Breathing', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'The billows swell and shrink' },
      { key: 'time', label: 'Time', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Moment of the loop shown in single-frame mode (in the tilesheet it is the start offset)' },

      { type: 'section', label: 'Lighting' },
      { key: 'style', label: 'Style', type: 'select', default: 'soft', options: [['soft', 'Soft (realistic)'], ['toon', 'Toon (flat bands, hard edge)']] },
      { key: 'bands', label: 'Shade bands', type: 'int', min: 2, max: 5, default: 3, show: (p) => p.style === 'toon' },
      { key: 'outline', label: 'Outline width', type: 'range', min: 0, max: 0.03, step: 0.001, default: 0, show: (p) => p.style === 'toon' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#2a2a33', show: (p) => p.style === 'toon' && p.outline > 0 },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'ambient', options: [['angled', 'Angled (light angle)'], ['ambient', 'Ambient (soft, no direction)']], tip: 'Ambient: soft light from all around: no direction, thick inner parts get a little darker. Angled: light from one side, the far side falls into shadow' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -120, show: (p) => p.lightMode !== 'ambient', tip: 'Direction the light comes from (-90 = from above, 180 = from the left)' },
      { key: 'shading', label: 'Shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, tip: 'Strength of the self-shadowing' },

      { type: 'section', label: 'Color' },
      { key: 'color', label: 'Lit color', type: 'color', default: '#e8e8e8' },
      { key: 'shadowColor', label: 'Shadow color', type: 'color', default: '#6c7078' },
      { key: 'glowAmt', label: 'Underglow', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Light from below, e.g. smoke lit by a fire' },
      { key: 'glowColor', label: 'Underglow color', type: 'color', default: '#ff8a30', show: (p) => p.glowAmt > 0 },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color + alpha'], ['gray', 'Grayscale shading + alpha (tint in engine)'], ['white', 'White + alpha (alpha only)']] },
    ],
    presets: [
      { name: 'White steam', group: 'Realistic', values: { color: '#ffffff', shadowColor: '#b8bcc4', density: 0.6, softness: 0.7, billowy: 0.3, erosion: 1, rise: 0.6, swirl: 0.45, shading: 0.3, squash: 1.15 } },
      { name: 'Grey smoke', group: 'Realistic', values: { color: '#a8a8a8', shadowColor: '#4a4c50', density: 0.9 } },
      { name: 'Black oil smoke', group: 'Realistic', values: { color: '#3a3836', shadowColor: '#0c0b0a', density: 1.1, billowy: 0.8, erosion: 0.7, softness: 0.3, scale: 2.6, shading: 0.6, billows: 9 } },
      { name: 'Dust puff', group: 'Realistic', values: { color: '#c8ae8a', shadowColor: '#7a6448', squash: 0.62, rise: 0.1, drift: 0.15, density: 0.7, softness: 0.6, billowy: 0.4, erosion: 1.1, scale: 3, swirl: 0.25, billows: 9, spread: 0.45 } },
      { name: 'Sunlit cumulus puff', group: 'Realistic', values: { color: '#ffffff', shadowColor: '#7c8aa0', lightMode: 'angled', lightAngle: -120, shading: 0.8, billowy: 0.85, softness: 0.3, density: 1.1, erosion: 0.6 } },
      { name: 'Explosion smoke', group: 'Realistic', values: { color: '#5a5550', shadowColor: '#1a1816', glowAmt: 0.7, glowColor: '#ff7a20', billowy: 0.9, billows: 11, spread: 0.7, scale: 2.8, density: 1.2, softness: 0.3, rise: 0.5, swirl: 0.5 } },
      { name: 'Wispy smoke', group: 'Realistic', values: { color: '#c4c4c8', shadowColor: '#6a6c74', billowy: 0, erosion: 1.5, softness: 0.8, density: 0.65, scale: 1.8, swirl: 0.7, rise: 0.5, billows: 0, size: 0.75 } },
      { name: 'Fog patch', group: 'Realistic', values: { color: '#e4e8ec', shadowColor: '#a4aab4', squash: 0.55, billowy: 0.1, erosion: 1.1, softness: 1, density: 0.5, rise: 0, drift: 0.3, swirl: 0.2, shading: 0.25, size: 0.85, billows: 0 } },
      { name: 'Chimney smoke', group: 'Realistic', values: { color: '#9a9692', shadowColor: '#45423f', squash: 1.35, rise: 0.8, drift: 0.25, swirl: 0.5, density: 0.75, softness: 0.55 } },
      { name: 'Grayscale (tint in engine)', group: 'Realistic', values: { output: 'gray', color: '#ffffff', shadowColor: '#707070' } },
      { name: 'Toxic green gas', group: 'Game-inspired', values: { color: '#9aff5a', shadowColor: '#1e6a2a', glowAmt: 0.3, glowColor: '#d8ff40', billowy: 0.5, erosion: 1, softness: 0.55, density: 0.8, swirl: 0.6 } },
      { name: 'Magic purple smoke', group: 'Game-inspired', values: { color: '#d8a0ff', shadowColor: '#3a1a6a', billowy: 0.35, erosion: 1.2, swirl: 0.8, density: 0.75, softness: 0.6, glowAmt: 0.4, glowColor: '#ff60e0' } },
      { name: 'Shadow mist', group: 'Game-inspired', values: { color: '#2a2438', shadowColor: '#050408', billowy: 0.2, erosion: 1.4, softness: 0.7, density: 0.9, swirl: 0.9, rise: 0.3 } },
      { name: 'Toon smoke', group: 'Stylized', values: { style: 'toon', bands: 3, color: '#f4f4f4', shadowColor: '#8a90a0', lightMode: 'angled', lightAngle: -125, shading: 0.9, billowy: 1, erosion: 0.35, scale: 1.6, layers: 1, detail: 2, billows: 8, spread: 0.6 } },
      { name: 'Toon smoke (outlined)', group: 'Stylized', values: { style: 'toon', bands: 2, outline: 0.012, color: '#ffffff', shadowColor: '#a4aabb', outlineColor: '#2a2e3a', lightMode: 'angled', lightAngle: -125, shading: 0.9, billowy: 1, erosion: 0.3, scale: 1.5, layers: 1, detail: 2, billows: 8 } },
      { name: 'Cartoon dust cloud', group: 'Stylized', values: { style: 'toon', bands: 2, color: '#e8d4b0', shadowColor: '#a8865a', squash: 0.65, lightMode: 'angled', lightAngle: -100, shading: 0.8, billowy: 1, erosion: 0.3, scale: 1.8, layers: 1, detail: 2, billows: 10, spread: 0.8, rise: 0.1 } },
      { name: 'White + alpha (tint in engine)', group: 'Sci-fi', values: { output: 'white', density: 0.8 } },
      { name: 'Coolant vapor', group: 'Sci-fi', values: { color: '#e8fbff', shadowColor: '#5ab4d8', billowy: 0.2, erosion: 1.2, softness: 0.75, density: 0.6, rise: -0.4, swirl: 0.5, squash: 0.8, glowAmt: 0.2, glowColor: '#80e8ff' } },
      { name: 'Plasma exhaust', group: 'Sci-fi', values: { color: '#b0c8ff', shadowColor: '#2a2a6a', glowAmt: 0.8, glowColor: '#60a0ff', billowy: 0.6, erosion: 1, density: 0.85, rise: 0.8, swirl: 0.6 } },
    ],
    render(ctx, W, H, p) {
      const t = frac(p.time || 0), S = Math.min(W, H), seed = p.seed | 0;
      // density / lighting grid: fixed cell count per short side -> same look at every export size
      const cells = Math.min(S, 100), st = S / cells, gw = Math.ceil(W / st) + 2, gh = Math.ceil(H / st) + 2;
      const R = p.size, sq = p.squash;
      // puff = smooth union of breathing billows (periodic in t)
      const rnd = U.rng(seed * 13 + 1), blobs = [{ x: 0, y: 0.04, r: 0.5 }];
      for (let i = 0; i < p.billows; i++) {
        const a = (i / p.billows) * TAU + (rnd() - 0.5) * 0.9, d = 0.25 + 0.4 * p.spread + rnd() * 0.12;
        blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.85, r: 0.2 + rnd() * 0.15 + 0.12 * (1 - p.spread), k: 1 + (rnd() * 2 | 0), ph: rnd() * TAU });
      }
      for (const b of blobs) if (b.k) b.r *= 1 + p.breathe * 0.12 * Math.sin(TAU * t * b.k + b.ph);
      // fit the puff into the frame (resting pose) so it never touches the edges
      let ext = 0;
      for (const b of blobs) ext = Math.max(ext, Math.hypot(b.x, b.y) + b.r);
      const fit = 1 / ext;
      const mask = (x, y) => {
        let m = -1;
        for (const b of blobs) {
          const ex = x - b.x * fit, ey = y - b.y * fit, rr = b.r * fit, v = 1 - (ex * ex + ey * ey) / (rr * rr); // dome per billow
          const h = Math.max(0, 0.3 - Math.abs(v - m)) / 0.3;
          m = Math.max(m, v) + h * h * 0.075; // smooth union
        }
        return m;
      };
      // noise: layers of billow / smooth fbm; two phases scroll and crossfade (seamless at any speed)
      const nl = p.layers | 0, oct = p.detail | 0, bil = p.billowy;
      const ph0 = frac(t), ph1 = frac(t + 0.5), w0 = Math.sin(Math.PI * ph0) ** 2, w1 = 1 - w0, norm = 1 / Math.sqrt(w0 * w0 + w1 * w1);
      const sc = p.scale, swR = p.swirl * 0.9, cs = Math.cos(TAU * t) * swR, sn = Math.sin(TAU * t) * swR;
      const fbm = (x, y, s) => {
        let a = 1, sum = 0, nn = 0, f = 1;
        for (let o = 0; o < oct; o++) {
          const n = PER(x * f, y * f, 0, 0, s + o * 1013);
          sum += lerp(n * 0.5, Math.abs(n) * 1.4 - 0.45, bil) * a; nn += a; a *= 0.5; f *= 2;
        }
        return sum / nn; // ~ -0.5 .. 0.5, mean ~0
      };
      const noise = (x, y) => {
        let sum = 0, amp = 1, an = 0, s = sc;
        for (let l = 0; l < nl; l++) {
          const sp = 1 + l * 0.6; // finer layers move faster
          const dx = -p.drift * sp, dy = p.rise * sp; // rising = noise moves up (y down is +)
          const a = fbm((x + dx * ph0) * s + 31 * l, (y + dy * ph0) * s, seed + l * 77);
          const b = fbm((x + dx * ph1) * s + 57 * l, (y + dy * ph1) * s, seed + l * 77 + 500);
          sum += (a * w0 + b * w1) * norm * amp; an += amp; amp *= 0.5; s *= 1.9;
        }
        return sum / an;
      };
      // density on the grid; unit = half the short side, centred
      const G = new Float32Array(gw * gh), M = new Float32Array(gw * gh), N = new Float32Array(gw * gh), cxp = W / 2, cyp = H / 2, half = S / 2;
      const thr = 0.12;
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          const px = i * st, py = j * st;
          let x = (px - cxp) / half, y = (py - cyp) / half;
          const rr = Math.hypot(x, y);
          if (rr > 1.02) { G[j * gw + i] = M[j * gw + i] = -1; continue; }
          let mx = x / R, my = y / R * (1 / sq);
          // swirl: rotation around the centre, angle from noise along a circle (periodic)
          if (swR > 0) {
            const ang = PER(rr * 1.6 + cs, sn + 3.7, 0, 0, seed + 911) * p.swirl * 1.4;
            const c = Math.cos(ang), s = Math.sin(ang);
            const nx = x * c - y * s, ny = x * s + y * c; x = nx; y = ny;
          }
          let m = mask(mx, my);
          M[j * gw + i] = m;
          if (m < -0.9) { G[j * gw + i] = -1; continue; }
          const n = noise(x / R, y / R);
          let d = m * 1.15 + n * p.erosion * 1.6 - thr;
          d -= smoothstep(0.8, 1.0, rr) * 1.5; // never touches the frame edge
          G[j * gw + i] = d; N[j * gw + i] = n;
        }
      }
      // lighting on the grid
      const soft = p.softness, dens = (v) => (v <= 0 ? 0 : smoothstep(0, soft, v));
      const Dg = new Float32Array(gw * gh);
      for (let i = 0; i < G.length; i++) Dg[i] = dens(G[i]);
      const at = (x, y) => {
        const i = Math.round(x), j = Math.round(y);
        return i < 0 || j < 0 || i >= gw || j >= gh ? 0 : Dg[j * gw + i];
      };
      const Lg = new Float32Array(gw * gh), amb = p.lightMode === 'ambient', la = p.lightAngle * Math.PI / 180;
      const lx = Math.cos(la), ly = Math.sin(la), stepL = R * cells * 0.09, sh = p.shading;
      // height for the billow normals: the signed density, softly limited
      const Hh = new Float32Array(gw * gh);
      const toonH = p.style === 'toon' ? 0.75 : 0.25; // toon shading follows the big billows
      for (let i = 0; i < G.length; i++) { const h = lerp(G[i], M[i] * 1.15 - thr, toonH); Hh[i] = h <= -0.3 ? -0.3 : h > 1.2 ? 1.2 : h; }
      // two 3×3 box passes: smooth normals, no grainy shading
      const Tb = new Float32Array(gw * gh);
      for (let pass = 0; pass < 2; pass++) {
        for (let j = 1; j < gh - 1; j++) for (let i = 1; i < gw - 1; i++) { const k = j * gw + i; Tb[k] = (Hh[k - 1] + Hh[k + 1] + Hh[k] * 2) * 0.25; }
        for (let j = 1; j < gh - 1; j++) for (let i = 1; i < gw - 1; i++) { const k = j * gw + i; Hh[k] = (Tb[k - gw] + Tb[k + gw] + Tb[k] * 2) * 0.25; }
      }
      const hk = R * cells * (toonH > 0.5 ? 0.5 : 0.35), lz = 0.75, ln = Math.hypot(lx, ly, lz);
      const hAt = (i, j) => Hh[(j < 0 ? 0 : j >= gh ? gh - 1 : j) * gw + (i < 0 ? 0 : i >= gw ? gw - 1 : i)];
      const r2 = Math.max(1, Math.round(stepL * 0.6));
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          const k = j * gw + i;
          if (G[k] < -0.3) { Lg[k] = 1; continue; }
          // billow normal from the height gradient
          let nx = -(hAt(i + 1, j) - hAt(i - 1, j)) * hk * 0.5, ny = -(hAt(i, j + 1) - hAt(i, j - 1)) * hk * 0.5;
          const nl = Math.sqrt(nx * nx + ny * ny + 1); nx /= nl; ny /= nl; const nz = 1 / nl;
          // lumps vs creases: height relative to the neighbourhood
          const loc = Hh[k] - (hAt(i + r2, j) + hAt(i - r2, j) + hAt(i, j + r2) + hAt(i, j - r2)) * 0.25;
          let occ = 0, l;
          if (amb) {
            // thickness: ring of samples around the point; lumps bright, creases and thick parts darker
            for (let q = 0; q < 6; q++) { const a = q * TAU / 6; occ += at(i + Math.cos(a) * stepL, j + Math.sin(a) * stepL); }
            occ = occ / 6 * 0.6 + Dg[k] * 0.4;
            l = 1 - 0.5 * occ + clamp(loc * 2.5, -0.4, 0.35) + N[k] * 1.1 * (1 - toonH) + (nz - 1) * (0.1 + toonH * 0.3) - ny * 0.15; // cotton lumps, a bit brighter on top (sky)
          } else {
            // march toward the light: the more smoke in between, the darker; plus the billow's own facing
            for (let q = 1; q <= 4; q++) occ += at(i + lx * stepL * q * 0.7, j + ly * stepL * q * 0.7) * (1.1 - q * 0.15);
            const lam = (nx * lx + ny * ly + nz * lz) / ln;
            l = (0.3 + 0.8 * clamp(lam)) * (1 - (0.6 - toonH * 0.45) * clamp(occ * 0.42)) + clamp(loc * 1.5, -0.2, 0.2) + N[k] * 0.6 * (1 - toonH);
          }
          Lg[k] = clamp(lerp(0.9, l, sh));
        }
      }
      // upsample + colorize
      const img = ctx.createImageData(W, H), dd = img.data;
      const cL = U.hex(p.color), cS = U.hex(p.shadowColor), cG = U.hex(p.glowColor), cO = U.hex(p.outlineColor);
      const toon = p.style === 'toon', nb = p.bands | 0, olw = p.outline * S, out = p.output, ga = p.glowAmt, dmul = p.density;
      const Dfull = toon ? new Float32Array(W * H) : null, Lfull = toon ? new Float32Array(W * H) : null;
      const sample = (A, x, y) => {
        const fx = x / st, fy = y / st, i = Math.min(gw - 2, Math.floor(fx)), j = Math.min(gh - 2, Math.floor(fy)), tx = fx - i, ty = fy - j, o = j * gw + i;
        const a = A[o] + (A[o + 1] - A[o]) * tx, b = A[o + gw] + (A[o + gw + 1] - A[o + gw]) * tx;
        return a + (b - a) * ty;
      };
      const write = (o, l, a, y) => {
        // shade: shadow -> lit, plus underglow from below
        const g = ga * smoothstep(-0.2, 1, (y - cyp) / (half * R)) * (1 - l * 0.5);
        let r = lerp(cS[0], cL[0], l), gg = lerp(cS[1], cL[1], l), b = lerp(cS[2], cL[2], l);
        r = lerp(r, cG[0], g); gg = lerp(gg, cG[1], g); b = lerp(b, cG[2], g);
        if (out === 'white') { r = gg = b = 255; } else if (out === 'gray') { r = gg = b = l * 255 * 0.85 + 38; }
        dd[o] = r; dd[o + 1] = gg; dd[o + 2] = b; dd[o + 3] = clamp(a) * 255;
      };
      if (!toon) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const d = sample(G, x, y);
          if (d <= 0) continue;
          write((y * W + x) * 4, sample(Lg, x, y), dens(d) * dmul, y);
        }
      } else {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const k = y * W + x; Dfull[k] = sample(G, x, y); Lfull[k] = sample(Lg, x, y); }
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const k = y * W + x, d = Dfull[k];
          if (d < -0.3) continue;
          const g = Math.max(1e-4, Math.hypot(Dfull[k + 1] - Dfull[k - 1], Dfull[k + W] - Dfull[k - W]) * 0.5);
          const e = 0.06, a0 = clamp((d - e) / g + 0.5), ao = olw > 0 ? clamp((d - e) / g + olw + 0.5) : a0;
          if (ao <= 0) continue;
          // banded light with a 1px soft step
          const l = Lfull[k], lg = Math.max(1e-4, Math.hypot(Lfull[k + 1] - Lfull[k - 1], Lfull[k + W] - Lfull[k - W]) * 0.5);
          let q = 0;
          for (let b = 1; b < nb; b++) q += clamp((l - (b / nb) * 0.9 - 0.05) / lg + 0.5);
          const o = k * 4;
          write(o, q / (nb - 1), Math.min(1, dmul * 1.25) * ao, y);
          if (olw > 0 && a0 < 1) { dd[o] = lerp(cO[0], dd[o], a0); dd[o + 1] = lerp(cO[1], dd[o + 1], a0); dd[o + 2] = lerp(cO[2], dd[o + 2], a0); if (out === 'white') { dd[o] = dd[o + 1] = dd[o + 2] = 255; } }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
