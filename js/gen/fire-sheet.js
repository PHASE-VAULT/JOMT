/* Fire tilesheet: a rising, flickering flame as a seamless loop (realistic gradient or toon bands / pixels).
   Heat field = flame envelope eroded by upward-scrolling noise. The noise is periodic in y and every
   octave scrolls a whole number of periods per loop, the sway / flicker / embers use whole-number
   frequencies of t, so frame t = 1 equals frame t = 0. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, smoothstep, TAU } = U;
  const PER = U.perlin;
  const frac = (x) => x - Math.floor(x);

  // loop fbm: periodic in y (period P), octave o scrolls (spd + o) periods per loop
  function fbmLoop(x, y, P, t, spd, oct, seed, ridged) {
    let amp = 1, sum = 0, norm = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      let n = PER(x * f, (y - t * P * (spd + o)) * f, 0, P * f, seed + o * 1013);
      if (ridged) n = 1 - 2 * Math.abs(n);
      sum += n * amp; norm += amp; amp *= 0.55; f *= 2;
    }
    return sum / norm * 0.5 + 0.5;
  }

  // flame heat at (u, v): u = horizontal, v = up from the base, both in flame heights
  function heatFn(p, t) {
    const seed = p.seed | 0, spd = p.speed | 0;
    const sc = p.scale, sy = sc / p.stretch, P = Math.max(1, Math.ceil(sy * 1.3 + 0.5));
    const ws = sc * 0.45, Pw = Math.max(1, Math.ceil(ws * 1.3 + 0.5));
    const oct = p.detail | 0, ridged = p.noiseType === 'ridged';
    // flicker: height pulses with whole-number frequencies of t
    const fl = 1 + p.flicker * 0.22 * (Math.sin(TAU * (t * 2) + seed) * 0.5 + Math.sin(TAU * (t * 3) + seed * 1.7) * 0.3 + Math.sin(TAU * (t * 5) + seed * 2.3) * 0.2);
    const w0 = p.width * 0.5, rb = w0 * (0.12 + 0.6 * p.roundness), tg = p.tongues | 0;
    const ct = Math.cos(TAU * t) * 0.9, st = Math.sin(TAU * t) * 0.9;
    const prof = (v) => Math.pow(Math.max(0, 1 - v), p.taper) * (0.72 + 0.28 * smoothstep(-0.05, 0.3, v)) + 0.0001;
    // tongues: sub-flames spread over the base, each with its own height, pulse and sway (periodic in t)
    const r = U.rng(seed * 7 + 3), T = [];
    for (let j = 0; j < tg; j++) {
      const c = tg > 1 ? j / (tg - 1) - 0.5 : 0, jx = (r() - 0.5) * 0.9 / Math.max(1, tg);
      const x = (c + jx) * w0 * 1.25, h = (1 - Math.abs(c) * 0.7) * (0.5 + r() * 0.6);
      const k = 1 + (r() * 2 | 0), ph = r() * TAU;
      T.push({ x: x + Math.sin(TAU * t * k + ph) * 0.05 * w0, h: h * (1 + 0.15 * Math.sin(TAU * t * (k + 1) + ph * 1.3)), w: w0 * Math.min(1, 1.5 / Math.sqrt(tg)) * (0.7 + r() * 0.6), k, ph });
    }
    // envelope: teardrop body united with the tongues (each sways on its own)
    const env = (uu, vp) => {
      let s = 1 - Math.abs(uu) / (w0 * prof(vp / bodyH)) - 0.7 * (vp / bodyH) * (vp / bodyH);
      for (let j = 0; j < tg; j++) {
        const q = T[j], sj = 1 - Math.abs(uu - q.x * (1 + vp * 0.3) - Math.sin(TAU * t * q.k + q.ph + vp * 4) * 0.12 * vp * vp) / (q.w * prof(vp / q.h)) - 0.7 * (vp / q.h) * (vp / q.h);
        const m = Math.max(0, 0.35 - Math.abs(sj - s)) / 0.35; s = Math.max(s, sj) + m * m * 0.0875; // smooth union fills the notches
      }
      return s;
    };
    const bodyH = tg > 0 ? 1 - p.tongueAmt * 0.6 : 1;
    const lim = w0 * 1.6 + 0.25 + p.distortion * 0.15;
    return (u, v) => {
      if (v < -rb * 1.3 || v > 1.35 || Math.abs(u - p.lean * Math.max(0, v)) > lim) return -1;
      v /= fl;
      const vp = Math.max(0, v);
      // sway: slow bending, stronger with height (circle in noise space = periodic)
      let uu = u - p.lean * vp - p.sway * 0.3 * vp * vp * (Math.sin(TAU * t + vp * 2.5 + seed) * 0.5 + PER(vp * 1.3 + ct, st, 0, 0, seed + 77));
      // domain warp: big curls that rise with the flame
      const wx = fbmLoop(uu * ws, v * ws, Pw, t, spd, 2, seed + 11, false) - 0.5;
      uu += p.distortion * wx * (0.08 + 0.5 * vp);
      // envelope, rounded off below the base
      let shape = env(uu, vp);
      if (v < 0) shape = 1 - Math.hypot(Math.max(0, 1 - shape), v / rb);
      // noise erosion, scrolling up
      const n = fbmLoop(uu * sc, v * sy, P, t, spd, oct, seed, ridged);
      let h = (Math.min(shape, 1.1) * 1.15 + (0.5 - n) * p.turbulence * (0.5 + 3.5 * vp) - 0.05) * 0.85;
      h *= 1 - 0.55 * smoothstep(0, 1.1, v);
      h -= smoothstep(0.6, 1.15, v) * 0.25; // no thin threads at the very top
      if (v < 0) h -= (1 - smoothstep(-rb, 0, v)) * 0.5;
      return h;
    };
  }

  U.register({
    id: 'fireSheet',
    name: 'Fire',
    desc: 'Looping flame tilesheets: realistic rising fire with embers or toon / pixel flames, seamless in time',
    uses: ['Looping flipbook textures for campfires, torches, candles, burning ground and magic fire in game particle systems.', 'Animated fire sprites for 2D games, pixel-art scenes and UI effects.'],
    tags: ['VFX', 'Nature'],
    bg: 'black',
    animLoop: true,
    animate(p, f) { p.time = (p.time || 0) + f.t; return p; },
    icon: U.icon('<path d="M12 21c-3.9 0-6.5-2.6-6.5-6.1 0-3.4 2.6-5.3 3.4-8.4 1.6 1.4 2.1 3 2.1 4.6 1.2-1 2-2.9 1.9-5.6 3.5 2.4 5.6 5.9 5.6 9.4 0 3.5-2.6 6.1-6.5 6.1z"/><path d="M12 21c-1.6 0-2.7-1.1-2.7-2.6 0-1.6 1.5-2.6 2.7-4.4 1.2 1.8 2.7 2.8 2.7 4.4 0 1.5-1.1 2.6-2.7 2.6z"/>'),
    params: [
      { type: 'section', label: 'Flame' },
      { key: 'height', label: 'Height', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.8, tip: 'Flame height as a share of the frame' },
      { key: 'width', label: 'Width', type: 'range', min: 0.05, max: 1.6, step: 0.01, default: 0.55, tip: 'Width of the flame base, relative to its height' },
      { key: 'base', label: 'Base position', type: 'range', min: 0, max: 0.4, step: 0.01, default: 0.08, tip: 'Distance of the flame base from the bottom edge' },
      { key: 'taper', label: 'Taper', type: 'range', min: 0.3, max: 3, step: 0.01, default: 1.1, tip: 'How quickly the flame narrows toward the tip' },
      { key: 'roundness', label: 'Base roundness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'lean', label: 'Lean', type: 'range', min: -0.6, max: 0.6, step: 0.01, default: 0, tip: 'Tilts the flame, like wind' },
      { key: 'tongues', label: 'Tongues', type: 'int', min: 0, max: 10, default: 3, tip: 'Number of separate licking tongues at the top (0 = one flame body)' },
      { key: 'tongueAmt', label: 'Tongue split', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => p.tongues > 0 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Motion' },
      { key: 'turbulence', label: 'Turbulence', type: 'range', min: 0, max: 2.5, step: 0.01, default: 1.6, tip: 'How strongly the noise eats into the flame: ragged, flickering edges' },
      { key: 'distortion', label: 'Distortion', type: 'range', min: 0, max: 2, step: 0.01, default: 1, tip: 'Large rising curls that bend the flame sideways' },
      { key: 'scale', label: 'Noise scale', type: 'range', min: 1, max: 16, step: 0.1, default: 7 },
      { key: 'stretch', label: 'Vertical stretch', type: 'range', min: 0.5, max: 4, step: 0.05, default: 1.6, tip: 'Stretches the noise upward into streaks' },
      { key: 'detail', label: 'Detail', type: 'int', min: 1, max: 6, default: 5 },
      { key: 'noiseType', label: 'Noise', type: 'select', default: 'smooth', options: [['smooth', 'Smooth'], ['ridged', 'Ridged (sharp tongues)']] },
      { key: 'speed', label: 'Rise speed', type: 'int', min: 1, max: 6, default: 1, tip: 'How far the fire rises per loop (whole steps so the loop stays seamless)' },
      { key: 'sway', label: 'Sway', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Slow sideways bending of the upper flame' },
      { key: 'flicker', label: 'Flicker', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'The flame height pulses' },
      { key: 'time', label: 'Time', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Moment of the loop shown in single-frame mode (in the tilesheet it is the start offset)' },

      { type: 'section', label: 'Embers', active: (p) => p.embers > 0 },
      { key: 'embers', label: 'Embers', type: 'int', min: 0, max: 80, default: 0, tip: 'Glowing sparks rising out of the fire' },
      { key: 'emberSize', label: 'Ember size', type: 'range', min: 0.002, max: 0.03, step: 0.001, default: 0.008, show: (p) => p.embers > 0 },
      { key: 'emberRise', label: 'Ember rise', type: 'range', min: 0.2, max: 1.5, step: 0.01, default: 0.9, show: (p) => p.embers > 0 },
      { key: 'emberSpread', label: 'Ember spread', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.embers > 0 },
      { key: 'emberColor', label: 'Ember color', type: 'color', default: '#ffb040', show: (p) => p.embers > 0 },

      { type: 'section', label: 'Style' },
      { key: 'style', label: 'Style', type: 'select', default: 'smooth', options: [['smooth', 'Realistic (smooth gradient)'], ['toon', 'Toon (flat color bands)']] },
      { key: 'bands', label: 'Color bands', type: 'int', min: 2, max: 6, default: 3, show: (p) => p.style === 'toon' },
      { key: 'outline', label: 'Outline width', type: 'range', min: 0, max: 0.03, step: 0.001, default: 0, show: (p) => p.style === 'toon', tip: 'Cartoon outline around the flame (relative to the frame size)' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#2a0800', show: (p) => p.style === 'toon' && p.outline > 0 },
      { key: 'pixels', label: 'Pixel grid', type: 'int', min: 0, max: 128, default: 0, tip: 'Renders the flame on a coarse pixel grid with this many pixels across (0 = off)' },

      { type: 'section', label: 'Color' },
      { key: 'cCore', label: 'Core', type: 'color', default: '#fff6d8' },
      { key: 'cHot', label: 'Hot', type: 'color', default: '#ffc030' },
      { key: 'cMid', label: 'Mid', type: 'color', default: '#f05a0a' },
      { key: 'cEdge', label: 'Edge', type: 'color', default: '#7a1004' },
      { key: 'heat', label: 'Heat', type: 'range', min: 0.3, max: 2, step: 0.01, default: 1, tip: 'Shifts the colors: higher = more of the flame is hot core' },
      { key: 'edgeSoft', label: 'Edge softness', type: 'range', min: 0.02, max: 0.6, step: 0.01, default: 0.1, show: (p) => p.style !== 'toon' },
      { key: 'blueBase', label: 'Blue base', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Blue, transparent zone at the bottom of the flame (candles, gas)' },
      { key: 'cBase', label: 'Base color', type: 'color', default: '#2a50ff', show: (p) => p.blueBase > 0 },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Soft halo around the flame' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color + alpha'], ['additive', 'Color on black (additive)'], ['gray', 'Grayscale + alpha (tint in engine)']] },
      { key: 'brightness', label: 'Brightness', type: 'range', min: 0.2, max: 2, step: 0.01, default: 1 },
    ],
    presets: [
      { name: 'Campfire', group: 'Realistic', values: { width: 0.75, tongues: 4, tongueAmt: 0.4, embers: 24, turbulence: 1.2, glow: 0.35 } },
      { name: 'Torch', group: 'Realistic', values: { height: 0.85, width: 0.38, base: 0.12, tongues: 2, tongueAmt: 0.3, turbulence: 1.25, sway: 0.5, embers: 10, emberSpread: 0.25 } },
      { name: 'Candle', group: 'Realistic', values: { height: 0.6, width: 0.55, base: 0.2, taper: 0.9, roundness: 0.9, tongues: 0, turbulence: 0.25, distortion: 0.25, scale: 2.5, detail: 3, sway: 0.25, flicker: 0.4, heat: 1.5, edgeSoft: 0.3, blueBase: 0.7, cCore: '#fffbe8', cHot: '#ffe080', cMid: '#ff9a30', cEdge: '#c04008', glow: 0.5 } },
      { name: 'Burning ground', group: 'Realistic', values: { height: 0.55, width: 1.6, base: 0.04, taper: 0.7, roundness: 0.2, tongues: 8, tongueAmt: 0.55, turbulence: 1.4, scale: 6, embers: 30, emberSpread: 1, glow: 0.2 } },
      { name: 'Bonfire (large)', group: 'Realistic', values: { height: 0.95, width: 0.9, base: 0.02, tongues: 5, tongueAmt: 0.5, turbulence: 1.5, distortion: 1.1, scale: 5.5, speed: 3, embers: 50, emberRise: 1.2, emberSpread: 0.8, glow: 0.4 } },
      { name: 'Small flame', group: 'Realistic', values: { height: 0.5, width: 0.35, base: 0.1, tongues: 2, turbulence: 0.9, scale: 3.5 } },
      { name: 'Windblown fire', group: 'Realistic', values: { lean: 0.4, sway: 0.7, width: 0.55, tongues: 4, turbulence: 1.3, distortion: 1.2, embers: 16, emberSpread: 0.9 } },
      { name: 'Blue gas flame', group: 'Realistic', values: { height: 0.6, width: 0.38, base: 0.1, taper: 1.3, roundness: 0.7, tongues: 0, turbulence: 0.35, distortion: 0.2, scale: 3, detail: 3, sway: 0.1, flicker: 0.5, heat: 1.2, cCore: '#e8f4ff', cHot: '#78b8ff', cMid: '#2a5aff', cEdge: '#18108a', edgeSoft: 0.35, glow: 0.35 } },
      { name: 'Oil fire (sooty)', group: 'Realistic', values: { width: 0.7, tongues: 5, tongueAmt: 0.45, turbulence: 1.6, distortion: 1.2, heat: 0.7, cCore: '#ffe0a0', cHot: '#ff9018', cMid: '#c83806', cEdge: '#2a0a04', edgeSoft: 0.12, glow: 0.15 } },
      { name: 'Grayscale flame', group: 'Realistic', values: { output: 'gray', embers: 12 } },
      { name: 'Toon fire', group: 'Stylized', values: { style: 'toon', bands: 3, outline: 0.012, noiseType: 'ridged', turbulence: 0.55, scale: 3.5, detail: 2, tongues: 3, tongueAmt: 0.5, glow: 0, cCore: '#fff3a0', cHot: '#ffc21a', cMid: '#ff6a10', cEdge: '#d82a08', outlineColor: '#4a0c02' } },
      { name: 'Toon fire (no outline)', group: 'Stylized', values: { style: 'toon', bands: 4, turbulence: 0.7, scale: 4, detail: 2, tongues: 4, tongueAmt: 0.45, glow: 0 } },
      { name: 'Pixel fire', group: 'Stylized', values: { style: 'toon', bands: 4, pixels: 32, turbulence: 1.2, scale: 3.5, detail: 3, tongues: 3, glow: 0, embers: 8, emberSize: 0.012 } },
      { name: 'Pixel torch (24 px)', group: 'Stylized', values: { style: 'toon', bands: 3, pixels: 24, width: 0.5, height: 0.8, turbulence: 1, scale: 3, detail: 2, tongues: 2, glow: 0 } },
      { name: 'Cel campfire (outlined)', group: 'Stylized', values: { style: 'toon', bands: 3, outline: 0.016, width: 0.85, scale: 4, detail: 2, tongues: 5, tongueAmt: 0.6, turbulence: 0.65, glow: 0, embers: 10, outlineColor: '#1a0400' } },
      { name: 'Magic green fire', group: 'Game-inspired', values: { tongues: 3, turbulence: 1.3, noiseType: 'ridged', cCore: '#f0ffe0', cHot: '#9aff40', cMid: '#30c818', cEdge: '#0a4a10', embers: 18, emberColor: '#a8ff60', glow: 0.45 } },
      { name: 'Soul fire', group: 'Game-inspired', values: { height: 0.9, width: 0.38, tongues: 3, tongueAmt: 0.5, turbulence: 1.6, distortion: 1.4, stretch: 2.4, sway: 0.6, heat: 0.8, cCore: '#e8ffff', cHot: '#60f0ff', cMid: '#1890c8', cEdge: '#0a2a5a', embers: 14, emberColor: '#80f8ff', glow: 0.5 } },
      { name: 'Hellfire', group: 'Game-inspired', values: { width: 0.9, height: 0.95, tongues: 6, tongueAmt: 0.6, noiseType: 'ridged', turbulence: 1.7, distortion: 1.3, speed: 3, heat: 1.15, cCore: '#ffd080', cHot: '#ff5a10', cMid: '#b01004', cEdge: '#300000', embers: 40, emberColor: '#ff5020', glow: 0.4 } },
      { name: 'Purple arcane flame', group: 'Game-inspired', values: { tongues: 3, turbulence: 1.2, stretch: 2, cCore: '#fff0ff', cHot: '#e070ff', cMid: '#8a20e0', cEdge: '#2a0860', embers: 16, emberColor: '#e8a0ff', glow: 0.45 } },
      { name: 'Plasma jet', group: 'Sci-fi', values: { height: 0.9, width: 0.22, base: 0.04, taper: 1.6, roundness: 0.3, tongues: 0, turbulence: 0.5, distortion: 0.2, stretch: 3.5, speed: 5, sway: 0.05, flicker: 0.6, heat: 1.3, cCore: '#ffffff', cHot: '#a0f0ff', cMid: '#2090ff', cEdge: '#1020a0', glow: 0.5 } },
      { name: 'White (tint in engine)', group: 'Sci-fi', values: { output: 'gray', style: 'smooth', tongues: 3, embers: 0, glow: 0.2 } },
    ],
    render(ctx, W, H, p) {
      const t = frac(p.time || 0), S = Math.min(W, H);
      const pixel = p.pixels > 0;
      const gw = pixel ? Math.max(4, p.pixels | 0) : W, gh = pixel ? Math.max(4, Math.round(gw * H / W)) : H;
      const k = gw / W; // grid px per output px
      const Hf = p.height * H * k, cx = gw * 0.5, by = gh - p.base * gh;
      const heat = heatFn(p, t), gain = p.heat;
      // heat field on the (possibly coarse) grid
      const hp = (x, y) => heat((x + 0.5 - cx) / Hf, (by - y - 0.5) / Hf) * gain;
      let F;
      if (pixel || S < 160) { F = new Float32Array(gw * gh); for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) F[y * gw + x] = hp(x, y); }
      else F = U.coarseField(W, H, S / 2, hp); // half resolution + bilinear: same look, 4x faster

      const cols = [p.cEdge, p.cMid, p.cHot, p.cCore].map(U.hex), cBase = U.hex(p.cBase), out = p.output;
      const toon = p.style === 'toon', nb = p.bands | 0, olw = p.outline * S * k;
      const soft = p.edgeSoft, br = p.brightness;
      // heat -> color: edge (dark red) .. core (white)
      const POS = [0.04, 0.3, 0.68, 1.02];
      const colAt = (h, o) => {
        let i = 0;
        while (i < 2 && h > POS[i + 1]) i++;
        const f = clamp((h - POS[i]) / (POS[i + 1] - POS[i])), a = cols[i], b = cols[i + 1];
        o[0] = lerp(a[0], b[0], f); o[1] = lerp(a[1], b[1], f); o[2] = lerp(a[2], b[2], f);
      };
      const bandCol = [];
      for (let b = 0; b < nb; b++) { const c = [0, 0, 0]; colAt(0.12 + (b / Math.max(1, nb - 1)) * 0.8, c); bandCol.push(c); }
      const th0 = 0.06; // outer edge of the toon flame
      const thr = (b) => th0 + Math.pow(b / nb, 0.85) * 0.85;
      const oc = U.hex(p.outlineColor);
      const img = new ImageData(gw, gh), d = img.data, c = [0, 0, 0];
      for (let y = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++) {
          const i = y * gw + x, h = F[i];
          let a;
          if (!toon) {
            if (h <= 0) continue;
            a = smoothstep(0, soft, h);
            colAt(h, c);
          } else {
            if (h < -0.2) continue;
            // pixel-accurate band edges from the heat gradient (hard steps in pixel mode)
            const gx = (F[i + (x < gw - 1 ? 1 : 0)] - F[i - (x > 0 ? 1 : 0)]) * 0.5, gy = (F[i + (y < gh - 1 ? gw : 0)] - F[i - (y > 0 ? gw : 0)]) * 0.5;
            const g = Math.max(1e-4, Math.hypot(gx, gy));
            const step = (th) => (pixel ? (h >= th ? 1 : 0) : clamp((h - th) / g + 0.5));
            const a0 = step(th0);
            const ao = olw > 0 ? (pixel ? (h >= th0 - olw * g ? 1 : 0) : clamp((h - th0) / g + olw + 0.5)) : a0;
            if (ao <= 0) continue;
            c[0] = bandCol[0][0]; c[1] = bandCol[0][1]; c[2] = bandCol[0][2];
            for (let b = 1; b < nb; b++) {
              const s = step(thr(b));
              if (s <= 0) break;
              const bc = bandCol[b];
              c[0] = lerp(c[0], bc[0], s); c[1] = lerp(c[1], bc[1], s); c[2] = lerp(c[2], bc[2], s);
            }
            if (olw > 0) { c[0] = lerp(oc[0], c[0], a0); c[1] = lerp(oc[1], c[1], a0); c[2] = lerp(oc[2], c[2], a0); }
            a = ao;
          }
          // blue, transparent base
          if (p.blueBase > 0) {
            const v = (by - y - 0.5) / Hf, bb = p.blueBase * (1 - smoothstep(0.02, 0.2, v)) * (1 - smoothstep(0.55, 1, h));
            c[0] = lerp(c[0], cBase[0], bb); c[1] = lerp(c[1], cBase[1], bb); c[2] = lerp(c[2], cBase[2], bb);
            a *= 1 - bb * 0.45;
          }
          const o = i * 4;
          d[o] = c[0] * br; d[o + 1] = c[1] * br; d[o + 2] = c[2] * br; d[o + 3] = a * 255;
        }
      }
      const fc = U.canvas(gw, gh), fx = fc.getContext('2d');
      fx.putImageData(img, 0, 0);

      // embers: each has a fixed phase, life = frac(t + phase) -> periodic
      if (p.embers > 0) {
        const r = U.rng((p.seed | 0) * 31 + 5), ec = U.hex(p.emberColor);
        fx.globalCompositeOperation = 'lighter';
        for (let e = 0; e < p.embers; e++) {
          const ph = r(), x0 = (r() - 0.5) * p.width * (0.4 + p.emberSpread), sp = 1 + (r() < 0.35 ? 1 : 0), wob = r(), wph = r(), sz = 0.5 + r();
          const life = frac(t * sp + ph);
          const ey = by - Hf * (0.15 + life * 1.1 * p.emberRise);
          const ex = cx + Hf * (x0 + p.lean * life * 0.8 + Math.sin(TAU * (life * (1 + wob) + wph)) * 0.06 * (0.3 + p.emberSpread) * life + x0 * life * p.emberSpread * 0.6);
          const bri = Math.pow(Math.sin(Math.PI * life), 0.6) * (0.6 + 0.4 * Math.sin(TAU * (life * 6 + wph)));
          if (bri <= 0.02) continue;
          const rad = Math.max(pixel ? 0.5 : 0.6, p.emberSize * S * k * sz * (1 - life * 0.5));
          if (pixel) { fx.fillStyle = `rgba(${ec[0]},${ec[1]},${ec[2]},${bri})`; fx.fillRect(Math.round(ex), Math.round(ey), 1, 1); continue; }
          const g = fx.createRadialGradient(ex, ey, 0, ex, ey, rad * 2.2);
          g.addColorStop(0, `rgba(255,250,220,${bri})`);
          g.addColorStop(0.22, `rgba(${ec[0]},${ec[1]},${ec[2]},${bri})`);
          g.addColorStop(0.45, `rgba(${ec[0]},${ec[1] * 0.6 | 0},${ec[2] * 0.3 | 0},${bri * 0.3})`);
          g.addColorStop(1, `rgba(${ec[0]},${ec[1] * 0.4 | 0},0,0)`);
          fx.fillStyle = g;
          fx.beginPath(); fx.arc(ex, ey, rad * 2.2, 0, TAU); fx.fill();
        }
        fx.globalCompositeOperation = 'source-over';
      }

      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = !pixel;
      // glow: blurred copy underneath (downscale -> upscale)
      if (p.glow > 0) {
        const mw = Math.max(4, W >> 2), mh = Math.max(4, H >> 2), m = U.canvas(mw, mh), mx = m.getContext('2d');
        mx.drawImage(fc, 0, 0, mw, mh);
        const gi = mx.getImageData(0, 0, mw, mh), bl = U.blurRGBA(gi.data, mw, mh, Math.min(mw, mh) * 0.07, false), gd = gi.data;
        for (let i = 0; i < gd.length; i += 4) {
          const a = bl[i + 3];
          gd[i + 3] = Math.min(255, a * 1.6);
          if (a > 0.01) { gd[i] = bl[i] * 255 / a; gd[i + 1] = bl[i + 1] * 255 / a; gd[i + 2] = bl[i + 2] * 255 / a; }
        }
        mx.putImageData(gi, 0, 0);
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = Math.min(1, p.glow);
        ctx.drawImage(m, 0, 0, W, H);
        ctx.restore();
        ctx.imageSmoothingEnabled = !pixel;
      }
      ctx.drawImage(fc, 0, 0, W, H);
      ctx.imageSmoothingEnabled = true;

      if (out === 'additive' || out === 'gray') {
        const im = ctx.getImageData(0, 0, W, H), dd = im.data;
        for (let i = 0; i < dd.length; i += 4) {
          const a = dd[i + 3] / 255;
          if (out === 'additive') { dd[i] *= a; dd[i + 1] *= a; dd[i + 2] *= a; dd[i + 3] = 255; }
          else { const l = Math.min(255, (dd[i] * 0.3 + dd[i + 1] * 0.59 + dd[i + 2] * 0.11) * 1.25); dd[i] = dd[i + 1] = dd[i + 2] = l; }
        }
        ctx.putImageData(im, 0, 0);
      }
    },
  });
})();
