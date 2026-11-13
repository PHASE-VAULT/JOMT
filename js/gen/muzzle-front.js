/* Frontal muzzle flash: star of noisy prongs around a hot core, with anamorphic stretch + streak. */
(function () {
  'use strict';
  const U = window.UGTG;

  U.register({
    id: 'flashFront',
    name: 'Muzzle Flash (front)',
    desc: 'Noisy star-shaped flash seen from the front, anamorphic stretch',
    tags: ['VFX', 'Shooter'],
    bg: 'black',
    icon: U.icon('<path d="M12 2l1.8 6.5L20 6l-4.2 5L22 13l-6.5 1.5L17 21l-5-4.5L7 21l1.5-6.5L2 13l6.2-2L4 6l6.2 2.5z"/>'),
    params: [
      { type: 'section', label: 'Shape' },
      { key: 'prongs', label: 'Prongs', type: 'int', min: 2, max: 16, default: 5 },
      { key: 'length', label: 'Prong length', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.85 },
      { key: 'lenVar', label: 'Length variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'width', label: 'Prong width', type: 'range', min: 0.1, max: 1.5, step: 0.01, default: 0.55 },
      { key: 'jitter', label: 'Angle jitter', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'core', label: 'Core size', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.22 },
      { key: 'coreI', label: 'Core intensity', type: 'range', min: 0, max: 2, step: 0.01, default: 1.2 },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: -90 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 42 },
      { type: 'section', label: 'Distortion' },
      { key: 'distort', label: 'Noise distortion', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'dScale', label: 'Noise scale', type: 'int', min: 1, max: 16, default: 5, show: (p) => p.distort > 0 },
      { key: 'breakup', label: 'Breakup', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
      { type: 'section', label: 'Anamorphic', active: (p) => p.stretchX !== 1 || p.stretchY !== 1 || p.streak > 0 },
      { key: 'stretchX', label: 'Stretch X', type: 'range', min: 0.25, max: 3, step: 0.01, default: 1 },
      { key: 'stretchY', label: 'Stretch Y', type: 'range', min: 0.25, max: 3, step: 0.01, default: 1 },
      { key: 'streak', label: 'Streak intensity', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0 },
      { key: 'streakLen', label: 'Streak length', type: 'range', min: 0.05, max: 1.5, step: 0.01, default: 0.5, show: (p) => p.streak > 0 },
      { key: 'streakThick', label: 'Streak thickness', type: 'range', min: 0.005, max: 0.2, step: 0.001, default: 0.02, show: (p) => p.streak > 0 },
      ...U.flashColorParams(),
    ],
    presets: [
      // Realistic
      { name: 'Pistol', group: 'Realistic', values: { prongs: 4, length: 0.6, lenVar: 0.3, width: 0.5, core: 0.2, coreI: 1.1, distort: 0.3, breakup: 0.2, rotation: -45 } },
      { name: 'Assault rifle', group: 'Realistic', values: { prongs: 5, length: 0.9, lenVar: 0.35, width: 0.5, core: 0.2, coreI: 1.3, distort: 0.4, breakup: 0.3 } },
      { name: 'Rifle, 3-prong flash hider', group: 'Realistic', values: { prongs: 3, length: 0.95, lenVar: 0.15, width: 0.45, jitter: 0.08, core: 0.18, coreI: 1.4, distort: 0.25, breakup: 0.15, rotation: 90 } },
      { name: 'Suppressed (faint)', group: 'Realistic', values: { prongs: 7, length: 0.7, lenVar: 0.4, width: 0.9, core: 0.24, coreI: 1, distort: 0.5, dScale: 7, breakup: 0.25, glow: 1 } },
      { name: 'Shotgun blast', group: 'Realistic', values: { prongs: 11, length: 1, lenVar: 0.5, width: 0.7, jitter: 0.6, core: 0.32, coreI: 1.5, distort: 0.6, dScale: 6, breakup: 0.35, glow: 1.2 } },
      { name: 'Compensator (vents up)', group: 'Realistic', values: { prongs: 3, length: 1, lenVar: 0.2, width: 0.45, jitter: 0.05, core: 0.24, coreI: 1.4, distort: 0.35, breakup: 0.2, rotation: -90, stretchY: 1.3, stretchX: 0.8 } },
      { name: 'Muzzle brake (side ports)', group: 'Realistic', values: { prongs: 4, length: 1, lenVar: 0.45, width: 0.35, jitter: 0.05, core: 0.24, coreI: 1.4, distort: 0.35, breakup: 0.25, rotation: 0, stretchX: 1.6, stretchY: 0.8 } },
      { name: 'LMG sustained fire', group: 'Realistic', values: { prongs: 6, length: 1, lenVar: 0.3, width: 0.65, core: 0.3, coreI: 1.6, distort: 0.45, breakup: 0.2, glow: 1.3 } },
      { name: 'Night vision bloom', group: 'Realistic', values: { prongs: 5, length: 0.85, width: 0.55, core: 0.26, coreI: 1.5, distort: 0.45, breakup: 0.2, glow: 1.4 } },
      // Stylized
      { name: 'Cartoon star', group: 'Stylized', values: { prongs: 6, length: 0.95, lenVar: 0, width: 0.7, jitter: 0, core: 0.3, coreI: 2, distort: 0, breakup: 0, glow: 1.6 } },
      { name: 'Comic burst', group: 'Stylized', values: { prongs: 12, length: 1, lenVar: 0.45, width: 0.6, jitter: 0.2, core: 0.35, coreI: 2, distort: 0, breakup: 0, glow: 2 } },
      { name: 'Anime flash', group: 'Stylized', values: { prongs: 8, length: 1, lenVar: 0.6, width: 0.25, jitter: 0.5, core: 0.18, coreI: 2, distort: 0.05, breakup: 0, streak: 0.8, streakLen: 0.9, streakThick: 0.012, glow: 1.5 } },
      { name: 'Pixel-friendly', group: 'Stylized', values: { prongs: 4, length: 0.9, lenVar: 0, width: 0.6, jitter: 0, core: 0.3, coreI: 2, distort: 0, breakup: 0, rotation: -45, glow: 2.2 } },
      { name: 'Anamorphic lens flare', group: 'Stylized', values: { prongs: 6, length: 0.6, width: 0.55, core: 0.22, coreI: 1.4, distort: 0.3, breakup: 0.15, streak: 1.2, streakLen: 1.2, streakThick: 0.018, glow: 1.3 } },
      // Game-inspired
      { name: 'Tarkov-style suppressed rifle', group: 'Game-inspired', values: { prongs: 10, length: 0.6, lenVar: 0.5, width: 1.3, jitter: 0.6, core: 0.2, coreI: 1.1, distort: 0.7, dScale: 10, breakup: 0.3, glow: 1 } },
      { name: 'CS-style AK flash', group: 'Game-inspired', values: { prongs: 5, length: 1, lenVar: 0.2, width: 0.6, jitter: 0.15, core: 0.28, coreI: 1.6, distort: 0.2, breakup: 0.1, glow: 1.4 } },
      { name: 'CoD-style rifle flash', group: 'Game-inspired', values: { prongs: 4, length: 1, lenVar: 0.25, width: 0.5, jitter: 0.1, core: 0.3, coreI: 1.8, distort: 0.35, breakup: 0.15, streak: 0.5, streakLen: 0.6, streakThick: 0.03, glow: 1.6 } },
      { name: 'Battlefield-style heavy flash', group: 'Game-inspired', values: { prongs: 7, length: 1, lenVar: 0.4, width: 0.75, core: 0.38, coreI: 1.8, distort: 0.55, breakup: 0.3, streak: 0.35, streakLen: 0.8, streakThick: 0.05, glow: 1.7 } },
      { name: 'Halo-style plasma bolt', group: 'Game-inspired', values: { prongs: 6, length: 0.7, lenVar: 0.2, width: 0.9, core: 0.35, coreI: 1.8, distort: 0.5, dScale: 4, breakup: 0.1, glow: 1.5 } },
      { name: 'Doom-style shotgun', group: 'Game-inspired', values: { prongs: 9, length: 1, lenVar: 0.3, width: 0.8, jitter: 0.3, core: 0.4, coreI: 2, distort: 0.3, breakup: 0.1, glow: 2 } },
      { name: 'Valorant-style clean flash', group: 'Game-inspired', values: { prongs: 4, length: 0.8, lenVar: 0.1, width: 0.4, jitter: 0, core: 0.2, coreI: 1.6, distort: 0.05, breakup: 0, rotation: -45, glow: 1.3 } },
      // Sci-fi
      { name: 'Plasma burst', group: 'Sci-fi', values: { prongs: 7, length: 0.75, lenVar: 0.3, width: 0.8, core: 0.32, coreI: 1.8, distort: 0.55, dScale: 4, breakup: 0.15, glow: 1.5 } },
      { name: 'Laser emitter', group: 'Sci-fi', values: { prongs: 4, length: 0.5, lenVar: 0, width: 0.2, jitter: 0, core: 0.15, coreI: 2, distort: 0, breakup: 0, rotation: -45, streak: 1.5, streakLen: 1.5, streakThick: 0.01, glow: 1.6 } },
      { name: 'Ion discharge', group: 'Sci-fi', values: { prongs: 14, length: 0.9, lenVar: 0.6, width: 0.3, jitter: 0.6, core: 0.25, coreI: 1.6, distort: 0.7, dScale: 10, breakup: 0.3, glow: 1.4 } },
      { name: 'Pulse rifle', group: 'Sci-fi', values: { prongs: 3, length: 0.8, lenVar: 0.1, width: 0.6, jitter: 0, core: 0.3, coreI: 1.8, distort: 0.2, breakup: 0, rotation: 90, stretchY: 0.7, streak: 0.6, streakLen: 0.5, streakThick: 0.03, glow: 1.4 } },
    ],
    // tilesheet: prongs shoot out from a hot core, then the flash swells, breaks up and fades
    animate(p, f) {
      const s = f.size, lag = Math.min(1, s * 1.15); // the core forms slightly ahead of the prongs
      p.length *= s;
      p.width *= 0.6 + 0.4 * lag;
      p.core *= 0.55 + 0.45 * lag;
      p.coreI *= Math.min(1, 0.4 + f.energy);
      p.glow *= f.energy;
      p.streak *= f.energy;
      p.streakLen *= 0.4 + 0.6 * s;
      p.distort = Math.min(1, p.distort + f.dissolve * 0.5);
      p.breakup = Math.min(1, p.breakup + f.dissolve * 0.75);
      p.seed += f.seedOffset;
      return p;
    },
    render(ctx, W, H, p) {
      const S = Math.min(W, H), lut = U.flashLUT(p), rnd = U.rng(p.seed), N = p.prongs, TAU = U.TAU;
      const rot = (p.rotation * Math.PI) / 180, prongs = [];
      for (let i = 0; i < N; i++) {
        prongs.push({
          a: rot + ((i + p.jitter * (rnd() - 0.5)) * TAU) / N,
          L: p.length * (1 - p.lenVar * rnd()),
          w: ((p.width * Math.PI) / N) * (0.7 + 0.6 * rnd()),
        });
      }
      const P = Math.max(2, p.dScale * 2);
      const reach = Math.max(1, p.core * 3) / Math.max(0.2, 1 - 0.6 * p.distort);
      U.pixels(ctx, W, H, (px, py, o) => {
        const x = (px + 0.5 - W / 2) / (S / 2), y = (py + 0.5 - H / 2) / (S / 2);
        const ax = x / p.stretchX, ay = y / p.stretchY, r = Math.hypot(ax, ay);
        let I = 0;
        if (r < reach) {
          let th = Math.atan2(ay, ax);
          let rd = r;
          if (p.distort > 0) {
            const n = U.fractal('perlin', (th / TAU + 0.5) * P, r * p.dScale, P, 0, 3, 0.5, 'fbm', p.seed) * 2 - 1;
            rd = r * (1 + p.distort * n * 0.6);
            th += p.distort * 0.35 * n;
          }
          for (const pr of prongs) {
            const t = rd / pr.L;
            if (t >= 1) continue;
            let d = th - pr.a;
            d -= TAU * Math.round(d / TAU);
            const hw = pr.w * Math.pow(1 - t, 0.75) + pr.w * 0.6 * Math.max(0, 1 - t * 4);
            const a = 1 - Math.abs(d) / hw;
            if (a > 0) I = U.screen(I, Math.pow(a, 0.9) * Math.pow(1 - t, 0.45));
          }
          if (p.core > 0) I = U.screen(I, Math.min(1, p.coreI * Math.exp(-((rd / p.core) ** 2) * 2.2)));
          if (p.breakup > 0 && I > 0) {
            const b = U.fractal('perlin', x * 5 + 31, y * 5 + 17, 0, 0, 3, 0.5, 'fbm', p.seed + 7);
            I *= 1 - p.breakup * U.smoothstep(0.42, 0.62, b) * Math.min(1, r / (p.core + 0.05));
          }
        }
        if (p.streak > 0) {
          I = U.screen(I, Math.min(1, p.streak * Math.exp(-((y / p.streakThick) ** 2)) * Math.exp(-Math.abs(x) / p.streakLen)));
        }
        U.putRamp(o, lut, I * p.glow, p.bgBlack);
      });
    },
  });
})();
