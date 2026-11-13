/* Tilesheet mode: renders an animation as an N×N grid of frames (left to right, top to bottom).
   A generator opts in with `animate(params, frame) -> params`, where frame describes one moment of a
   build-up → peak → fade lifecycle:
     { i, n, t (0..1), size (scale of the effect), energy (brightness 0..~1), dissolve (0..1, grows while fading), seedOffset }
   Generators with `animLoop: true` (walk cycles, wing beats) get a seamless loop instead: frame = { i, n, t = i / n, loop: true },
   and only the grid and preview settings are shown. */
(function () {
  'use strict';
  const U = window.UGTG;
  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  // keys are prefixed "sh_" in the panel so they can sit next to the generator's own settings
  U.SHEET_PARAMS = [
    { type: 'section', label: 'Tilesheet' },
    { key: 'sh_grid', label: 'Grid', type: 'select', default: 4, options: [[2, '2 × 2 · 4 frames'], [3, '3 × 3 · 9 frames'], [4, '4 × 4 · 16 frames'], [5, '5 × 5 · 25 frames'], [6, '6 × 6 · 36 frames'], [8, '8 × 8 · 64 frames']], tip: 'Frames run left to right, top to bottom. The export size is the whole sheet' },
    { key: 'sh_rise', label: 'Build-up', type: 'range', min: 0.02, max: 0.8, step: 0.01, default: 0.2, tip: 'Share of the animation spent forming, up to full size', show: (p) => !p.sh__loop },
    { key: 'sh_hold', label: 'Hold at peak', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.08, show: (p) => !p.sh__loop },
    { key: 'sh_startSize', label: 'Start size', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, show: (p) => !p.sh__loop },
    { key: 'sh_endSize', label: 'End size', type: 'range', min: 0.5, max: 1.6, step: 0.01, default: 1.12, tip: 'Keeps growing (above 1) or shrinks (below 1) while it fades', show: (p) => !p.sh__loop },
    { key: 'sh_fade', label: 'Fade curve', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1.2, tip: 'Above 1 fades quickly at first, below 1 lingers', show: (p) => !p.sh__loop },
    { key: 'sh_dissipate', label: 'Dissipation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Breaks up and distorts the effect as it fades', show: (p) => !p.sh__loop },
    { key: 'sh_flicker', label: 'Flicker', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Random brightness change per frame', show: (p) => !p.sh__loop },
    { key: 'sh_reseed', label: 'New noise every frame', type: 'bool', default: false, tip: 'Each frame gets its own seed: livelier, but less continuous', show: (p) => !p.sh__loop },
    { key: 'sh_play', label: 'Animation preview', type: 'bool', default: true },
    { key: 'sh_fps', label: 'Preview FPS', type: 'int', min: 2, max: 60, default: 24, show: (p) => p.sh_play },
    { key: 'sh_loop', label: 'Pause between loops', type: 'range', min: 0, max: 2, step: 0.05, default: 0.4, show: (p) => p.sh_play && !p.sh__loop, tip: 'Seconds of empty frame before the animation repeats (preview only)' },
  ];

  U.sheetDefaults = () => {
    const o = { on: false };
    for (const d of U.SHEET_PARAMS) if (d.key) o[d.key.slice(3)] = d.default;
    return o;
  };

  U.sheetFrame = (s, i, N) => { // frame i of N
    const t = (i + 0.5) / N; // frame centres: the first frame already shows the flash forming
    const rise = Math.max(0.01, s.rise), hold = Math.min(s.hold, 0.98 - rise);
    const g = clamp(t / rise), grow = 1 - (1 - g) * (1 - g); // ease-out build-up
    const u = clamp((t - rise - hold) / Math.max(0.01, 1 - rise - hold)); // 0..1 through the fade
    let energy = grow * Math.pow(1 - u, s.fade);
    if (s.flicker > 0) energy *= 1 + s.flicker * (U.rng(i * 7919 + 13)() - 0.5) * 0.8;
    const size = (s.startSize + (1 - s.startSize) * grow) * (1 + (s.endSize - 1) * u);
    return { i, n: N, t, energy: Math.max(0, energy), size, dissolve: s.dissipate * u, seedOffset: s.reseed ? i * 101 : 0 };
  };

  /* full sheet at W×H (frame size = W/grid × H/grid) */
  U.renderSheet = (gen, params, s, W, H, opts) => {
    const n = +s.grid, fw = Math.max(1, Math.floor(W / n)), fh = Math.max(1, Math.floor(H / n));
    const out = U.canvas(fw * n, fh * n), oc = out.getContext('2d');
    for (let i = 0; i < n * n; i++) {
      const N = n * n, frame = gen.animLoop ? { i, n: N, t: i / N, loop: true } : U.sheetFrame(s, i, N);
      const p = gen.animate(U.clone(params), frame);
      const c = U.canvas(fw, fh);
      gen.render(c.getContext('2d'), fw, fh, p, opts);
      oc.drawImage(c, (i % n) * fw, Math.floor(i / n) * fh);
    }
    return { canvas: out, info: { sheet: { n, fw, fh } } };
  };
})();
