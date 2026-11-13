/* Lateral muzzle flash: plume along +X with shock-diamond lobes and optional muzzle-brake side jets. */
(function () {
  'use strict';
  const U = window.UGTG;

  // normalisation for x^a (1-x)^b so the envelope peaks at 1
  const peakOf = (a, b) => Math.pow(a / (a + b), a) * Math.pow(b / (a + b), b);

  U.register({
    id: 'flashSide',
    name: 'Muzzle Flash (side)',
    desc: 'Sideways flash plume with lobes and muzzle-brake jets',
    tags: ['VFX', 'Shooter'],
   
    bg: 'black',
    icon: U.icon('<path d="M2 12h3"/><path d="M5 9.5c4 0 6-2.5 9-3 3 1 6 3 8 5.5-2 2.5-5 4.5-8 5.5-3-.5-5-3-9-3z"/>'),
    params: [
      { type: 'section', label: 'Plume' },
      { key: 'length', label: 'Length', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.85 },
      { key: 'width', label: 'Width', type: 'range', min: 0.02, max: 1, step: 0.01, default: 0.22 },
      { key: 'muzzleX', label: 'Muzzle position', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.06 },
      { key: 'taper', label: 'Tip taper', type: 'range', min: 0.2, max: 3, step: 0.01, default: 1 },
      { key: 'lobes', label: 'Lobes', type: 'int', min: 0, max: 6, default: 2 },
      { key: 'lobeStr', label: 'Lobe pinch', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.lobes > 0 },
      { key: 'core', label: 'Core size', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.18 },
      { key: 'coreI', label: 'Core intensity', type: 'range', min: 0, max: 2, step: 0.01, default: 1.2 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 42 },
      { type: 'section', label: 'Muzzle line' },
      { key: 'mLine', label: 'Vertical muzzle line', type: 'bool', default: true },
      { key: 'mLineH', label: 'Height', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.55, show: (p) => p.mLine },
      { key: 'mLineW', label: 'Thickness', type: 'range', min: 0.005, max: 0.3, step: 0.005, default: 0.04, show: (p) => p.mLine },
      { key: 'mLineX', label: 'Offset', type: 'range', min: -0.2, max: 0.5, step: 0.005, default: 0.02, show: (p) => p.mLine, tip: 'Position relative to the muzzle, in plume lengths' },
      { key: 'mLineAngle', label: 'Lean', type: 'range', min: -75, max: 75, step: 1, default: 0, show: (p) => p.mLine, tip: '+ leans toward the plume, − leans back. Upper and lower halves mirror.' },
      { key: 'mLineTaper', label: 'Taper', type: 'range', min: 0.2, max: 4, step: 0.01, default: 1.2, show: (p) => p.mLine },
      { key: 'mLineI', label: 'Intensity', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.9, show: (p) => p.mLine },
      { type: 'section', label: 'Side jets (muzzle brake)' },
      { key: 'jets', label: 'Side jets', type: 'bool', default: false },
      { key: 'jetPos', label: 'Jet position', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.04, show: (p) => p.jets },
      { key: 'jetLen', label: 'Jet length', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.6, show: (p) => p.jets },
      { key: 'jetW', label: 'Jet width', type: 'range', min: 0.02, max: 0.5, step: 0.01, default: 0.14, show: (p) => p.jets },
      { key: 'jetTilt', label: 'Jet angle', type: 'range', min: -60, max: 60, step: 1, default: 25, show: (p) => p.jets },
      { type: 'section', label: 'Distortion' },
      { key: 'distort', label: 'Noise distortion', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4 },
      { key: 'dScale', label: 'Noise scale', type: 'int', min: 1, max: 16, default: 4, show: (p) => p.distort > 0 },
      { key: 'breakup', label: 'Breakup', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
      ...U.flashColorParams(),
    ],
    presets: [
      // Realistic
      { name: 'Pistol', group: 'Realistic', values: { length: 0.55, width: 0.248, lobes: 1, lobeStr: 0.3, core: 0.2, mLineH: 0.45, mLineI: 0.7, distort: 0.35, breakup: 0.2 } },
      { name: 'Assault rifle', group: 'Realistic', values: { length: 0.85, width: 0.193, lobes: 2, lobeStr: 0.5, core: 0.18, mLineH: 0.6, distort: 0.4, breakup: 0.25 } },
      { name: 'Suppressed', group: 'Realistic', values: { length: 0.55, width: 0.154, taper: 1.4, lobes: 0, core: 0.14, coreI: 1, mLine: false, distort: 0.5, dScale: 6, breakup: 0.3, glow: 1 } },
      { name: 'Shotgun', group: 'Realistic', values: { length: 0.8, width: 0.33, taper: 0.7, lobes: 1, lobeStr: 0.25, core: 0.3, coreI: 1.5, mLineH: 0.8, mLineW: 0.07, distort: 0.65, dScale: 5, breakup: 0.35, glow: 1.3 } },
      { name: 'Muzzle brake', group: 'Realistic', values: { length: 0.7, width: 0.165, lobes: 2, lobeStr: 0.5, core: 0.18, mLine: false, jets: true, jetPos: 0.04, jetLen: 0.75, jetW: 0.2, jetTilt: -15, distort: 0.4, breakup: 0.25 } },
      { name: 'Tank / cannon brake', group: 'Realistic', values: { length: 0.9, width: 0.165, lobes: 3, lobeStr: 0.4, core: 0.22, coreI: 1.5, mLine: false, jets: true, jetPos: 0.02, jetLen: 1, jetW: 0.35, jetTilt: -25, distort: 0.6, breakup: 0.3, glow: 1.4 } },
      { name: 'LMG (long plume)', group: 'Realistic', values: { length: 0.9, width: 0.15, lobes: 4, lobeStr: 0.55, core: 0.2, coreI: 1.4, mLineH: 0.7, distort: 0.45, breakup: 0.25, glow: 1.2 } },
      { name: 'Sniper (shock diamonds)', group: 'Realistic', values: { length: 0.95, width: 0.135, taper: 0.6, lobes: 5, lobeStr: 0.85, core: 0.18, coreI: 1.6, mLineH: 0.8, mLineI: 1.1, distort: 0.3, breakup: 0.15, glow: 1.3 } },
      { name: 'Night vision bloom', group: 'Realistic', values: { length: 0.85, width: 0.22, lobes: 2, lobeStr: 0.5, core: 0.2, coreI: 1.4, distort: 0.45, breakup: 0.25, glow: 1.3 } },
      // Stylized
      { name: 'Cartoon cone', group: 'Stylized', values: { length: 0.8, width: 0.33, taper: 1.6, lobes: 0, core: 0.25, coreI: 2, mLineH: 0.7, mLineW: 0.06, mLineTaper: 0.6, mLineI: 1.3, distort: 0, breakup: 0, glow: 1.8 } },
      { name: 'Comic burst', group: 'Stylized', values: { length: 0.7, width: 0.33, taper: 0.4, lobes: 3, lobeStr: 0.9, core: 0.3, coreI: 2, mLineH: 0.9, mLineW: 0.08, mLineTaper: 0.5, mLineI: 1.3, distort: 0, breakup: 0, glow: 2 } },
      { name: 'Anime streak', group: 'Stylized', values: { length: 1, width: 0.066, taper: 2.2, lobes: 0, core: 0.12, coreI: 2, mLineH: 0.95, mLineW: 0.015, mLineAngle: 30, mLineTaper: 0.6, mLineI: 1.4, distort: 0.05, breakup: 0, glow: 1.5 } },
      { name: 'Pixel-friendly', group: 'Stylized', values: { length: 0.7, width: 0.385, taper: 0.8, lobes: 1, lobeStr: 0.7, core: 0.3, coreI: 2, mLineH: 0.85, mLineW: 0.1, mLineTaper: 0.8, mLineI: 1.2, distort: 0, breakup: 0, glow: 2.2 } },
      { name: 'Swept-back flare', group: 'Stylized', values: { length: 0.75, width: 0.22, lobes: 2, lobeStr: 0.4, core: 0.2, coreI: 1.4, mLineH: 0.8, mLineW: 0.03, mLineAngle: -40, mLineTaper: 0.9, mLineI: 1.1, distort: 0.2, breakup: 0.1, glow: 1.3 } },
      // Game-inspired
      { name: 'Tarkov-style suppressed rifle', group: 'Game-inspired', values: { length: 0.45, width: 0.275, taper: 0.7, lobes: 0, core: 0.2, coreI: 1, mLine: false, distort: 0.8, dScale: 10, breakup: 0.45, glow: 1.05 } },
      { name: 'Tarkov-style AK flash', group: 'Game-inspired', values: { length: 0.8, width: 0.231, lobes: 2, lobeStr: 0.6, core: 0.2, mLineH: 0.65, mLineAngle: 15, distort: 0.55, dScale: 5, breakup: 0.4 } },
      { name: 'CS-style AK flash', group: 'Game-inspired', values: { length: 0.8, width: 0.275, taper: 0.8, lobes: 1, lobeStr: 0.4, core: 0.26, coreI: 1.6, mLineH: 0.7, mLineW: 0.05, distort: 0.2, breakup: 0.1, glow: 1.4 } },
      { name: 'CoD-style rifle flash', group: 'Game-inspired', values: { length: 0.85, width: 0.248, lobes: 2, lobeStr: 0.45, core: 0.25, coreI: 1.8, mLineH: 0.75, mLineW: 0.05, mLineI: 1.1, distort: 0.35, breakup: 0.15, glow: 1.6 } },
      { name: 'Battlefield-style LMG flash', group: 'Game-inspired', values: { length: 0.9, width: 0.18, lobes: 3, lobeStr: 0.5, core: 0.28, coreI: 1.8, mLineH: 0.85, mLineW: 0.06, jets: true, jetLen: 0.5, jetW: 0.18, jetTilt: 20, distort: 0.55, breakup: 0.3, glow: 1.6 } },
      { name: 'Arma-style rifle flash', group: 'Game-inspired', values: { length: 0.7, width: 0.165, lobes: 2, lobeStr: 0.45, core: 0.15, coreI: 1.1, mLineH: 0.5, mLineI: 0.6, distort: 0.5, breakup: 0.35, glow: 0.95 } },
      { name: 'Doom-style shotgun', group: 'Game-inspired', values: { length: 0.75, width: 0.385, taper: 0.6, lobes: 2, lobeStr: 0.6, core: 0.35, coreI: 2, mLineH: 0.9, mLineW: 0.08, mLineI: 1.2, distort: 0.3, breakup: 0.1, glow: 2 } },
      // Sci-fi
      { name: 'Plasma burst', group: 'Sci-fi', values: { length: 0.8, width: 0.248, taper: 0.8, lobes: 3, lobeStr: 0.6, core: 0.25, coreI: 1.8, mLineH: 0.6, mLineW: 0.03, distort: 0.5, dScale: 3, breakup: 0.1, glow: 1.5 } },
      { name: 'Laser beam', group: 'Sci-fi', values: { length: 1, width: 0.024, taper: 0.2, lobes: 0, core: 0.15, coreI: 2, mLineH: 0.5, mLineW: 0.01, mLineI: 1.2, distort: 0, breakup: 0, glow: 1.6 } },
      { name: 'Ion pulse rings', group: 'Sci-fi', values: { length: 0.85, width: 0.275, taper: 0.5, lobes: 6, lobeStr: 1, core: 0.22, coreI: 1.6, mLineH: 0.7, mLineW: 0.02, mLineI: 1.2, distort: 0.15, breakup: 0, glow: 1.5 } },
      { name: 'Railgun discharge', group: 'Sci-fi', values: { length: 1, width: 0.075, taper: 0.3, lobes: 0, core: 0.2, coreI: 2, mLineH: 1, mLineW: 0.02, mLineTaper: 0.5, mLineI: 1.3, jets: true, jetPos: 0, jetLen: 0.8, jetW: 0.06, jetTilt: -30, distort: 0.2, breakup: 0, glow: 1.6 } },
    ],
    // tilesheet: the plume shoots out of the muzzle, the side jets and Mach disk follow, then it
    // widens, breaks up and fades
    animate(p, f) {
      const s = f.size, lag = Math.min(1, s * 1.15);
      p.length = Math.min(1, p.length * s);
      p.width *= 0.45 + 0.55 * lag;
      p.jetLen *= s;
      p.mLineH *= 0.3 + 0.7 * lag;
      p.mLineI *= f.energy;
      p.core *= 0.55 + 0.45 * lag;
      p.coreI *= Math.min(1, 0.4 + f.energy);
      p.glow *= f.energy;
      p.distort = Math.min(1, p.distort + f.dissolve * 0.5);
      p.breakup = Math.min(1, p.breakup + f.dissolve * 0.75);
      p.seed += f.seedOffset;
      return p;
    },
    render(ctx, W, H, p) {
      const lut = U.flashLUT(p), h = H / 2, mx = p.muzzleX * W;
      const Lp = (p.length * (W - mx)) / h; // plume length in half-height units
      const A = 0.35, B = 0.8 * p.taper, peak = peakOf(A, B), jpeak = peakOf(0.35, 0.9);
      const lean = ((p.mLineAngle || 0) * Math.PI) / 180, leanTan = Math.tan(lean), leanCos = Math.cos(lean);
      const tilt = (p.jetTilt * Math.PI) / 180, sx = Math.sin(tilt), cy = Math.cos(tilt), X0 = p.jetPos * Lp;
      U.pixels(ctx, W, H, (px, py, o) => {
        const X = (px + 0.5 - mx) / h, Y = (py + 0.5 - h) / h;
        const n = p.distort > 0 ? U.fractal('perlin', X * p.dScale * 0.5, Y * p.dScale * 0.5, 0, 0, 3, 0.5, 'fbm', p.seed) * 2 - 1 : 0;
        let I = 0;
        const x = X / Lp + p.distort * n * 0.06;
        if (x > 0 && x < 1) {
          let env = (p.width * Math.pow(x, A) * Math.pow(1 - x, B)) / peak;
          if (p.lobes > 0) env *= 1 - p.lobeStr * 0.6 * (0.5 + 0.5 * Math.cos(U.TAU * p.lobes * x));
          const yd = Math.abs(Y + p.distort * n * 0.45 * Math.min(1, x * 2) * p.width);
          if (env > 1e-4) I = (1 - U.smoothstep(env * 0.1, env, yd)) * (0.45 + 0.55 * Math.pow(1 - x, 0.6));
        }
        if (p.jets) {
          for (let s = -1; s <= 1; s += 2) {
            const dy = s * cy, rx = X - X0, along = rx * sx + Y * dy;
            if (along <= 0 || along >= p.jetLen) continue;
            const tt = along / p.jetLen, perp = -rx * dy + Y * sx;
            const jw = (p.jetW * Math.pow(tt, 0.35) * Math.pow(1 - tt, 0.9)) / jpeak;
            const pd = Math.abs(perp + p.distort * n * 0.4 * tt * p.jetW);
            I = U.screen(I, (1 - U.smoothstep(jw * 0.1, jw, pd)) * (1 - tt * 0.5));
          }
        }
        if (p.mLine && p.mLineI > 0) {
          // each half is a ray from the muzzle point, leaning by mLineAngle (mirrored above/below)
          const ay = Math.abs(Y + p.distort * n * 0.15 * Math.abs(Y));
          const dx = X - p.mLineX * Lp - ay * leanTan;
          const lx = (dx * leanCos) / p.mLineW;
          const along = U.clamp(ay / leanCos / p.mLineH);
          const v = Math.exp(-lx * lx) * Math.pow(1 - along, p.mLineTaper);
          if (v > 0) I = U.screen(I, Math.min(1, v * p.mLineI));
        }
        if (p.core > 0) {
          const cx = (X - p.core * 0.8) / (p.core * 2), cyy = Y / p.core;
          I = U.screen(I, Math.min(1, p.coreI * Math.exp(-(cx * cx + cyy * cyy) * 2)));
        }
        if (p.breakup > 0 && I > 0) {
          const b = U.fractal('perlin', X * 2.5 + 11, Y * 2.5 + 3, 0, 0, 3, 0.5, 'fbm', p.seed + 7);
          I *= 1 - p.breakup * U.smoothstep(0.42, 0.62, b) * Math.min(1, Math.hypot(X, Y) / (p.core * 2 + 0.1));
        }
        U.putRamp(o, lut, I * p.glow, p.bgBlack);
      });
    },
  });
})();
