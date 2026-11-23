/* Loading icons: looping UI busy indicators exported as a numbered PNG sequence (_f00, _f01 …), one
   image per frame, to play back in an engine's UI (no sprite sheet). Types: dot ring, spinner segments,
   breathing arc, pulse rings, bouncing dots, equalizer bars, orbiting dots, metaball blobs, square grid
   wave, spinning polygon and a dot helix. Every motion runs a whole number of cycles per loop, so the
   last frame flows straight back into the first. The preview box plays the sequence live. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, smoothstep } = U;
  const TAU = Math.PI * 2;

  const TYPES = [
    ['dots', 'Dot ring'], ['segments', 'Spinner segments'], ['arc', 'Breathing arc'], ['pulse', 'Pulse rings'],
    ['bounce', 'Bouncing dots'], ['bars', 'Equalizer bars'], ['orbit', 'Orbiting dots'], ['metaballs', 'Metaball blobs'],
    ['grid', 'Square grid wave'], ['shape', 'Spinning shape'], ['helix', 'Dot helix'],
  ];
  const is = (...t) => (p) => t.includes(p.type);
  const mixC = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
  const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
  // eased loop phase: 0 → 1 with zero speed at both ends (keeps the loop seamless incl. speed)
  const easeLoop = (x, k) => (k > 0 ? lerp(x, x - Math.sin(TAU * x) / TAU, k) : x);
  /* speed = cycles per base loop of "Frames" frames, in quarter steps. A seamless loop needs a whole number
     of cycles, so speeds like 0.5 or 0.25 repeat the base loop 2× / 4× (more frames, same motion per frame) */
  const speedOf = (p) => Math.max(0.25, Math.round((+p.cycles || 1) * 4) / 4);
  const repeats = (p) => { const s = speedOf(p); for (const q of [1, 2, 4]) if (Math.abs(s * q - Math.round(s * q)) < 1e-6) return q; return 4; };
  const frameCount = (p) => Math.max(2, p.frames | 0) * repeats(p);

  U.register({
    id: 'loader',
    name: 'Loading Icon',
    desc: 'Looping loading spinners: dot rings, arcs, pulses, bouncing dots, bars, orbits, metaballs and shapes',
    uses: [
      'Animated busy indicators for game and app UI: exported as a numbered PNG sequence that loops seamlessly, to play back frame by frame in the engine\'s UI system.',
      'Animated icons for loading screens, save indicators and streaming / matchmaking status, or a looping sequence for video overlays.',
    ],
    tags: ['UI'],
    bg: 'black',
    normalMap: false,
    // always a frame sequence: one PNG per frame
    exportLayers: (p) => Array.from({ length: frameCount(p) }, (_, i) => ({ id: 'frame' + i, suffix: 'f' + String(i).padStart(2, '0') })),
    icon: U.icon('<path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5" /><circle cx="12" cy="3.5" r="1.2" fill="currentColor"/><circle cx="5.9" cy="6" r=".9" fill="currentColor" opacity=".6"/>'),
    params: [
      { type: 'section', label: 'Loader' },
      { key: 'type', label: 'Type', type: 'select', default: 'dots', options: TYPES },
      { key: 'count', label: 'Count', type: 'int', min: 2, max: 24, default: 8, show: (p) => !['arc', 'shape'].includes(p.type), tip: 'Dots, segments, rings, bars or blobs' },
      { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.8, tip: 'Fraction of the image the loader fills' },
      { key: 'thick', label: 'Thickness / dot size', type: 'range', min: 0.02, max: 0.5, step: 0.005, default: 0.14 },
      { key: 'cycles', label: 'Speed (cycles per loop)', type: 'range', min: 0.25, max: 6, step: 0.25, default: 1, tip: 'Turns / beats per Frames. Below 1 (or at x.5 / x.25) the loop only closes after 2 or 4 rounds, so the export gets 2× or 4× the frames: slower motion that still loops seamlessly' },
      { key: 'ease', label: 'Ease in / out', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: is('dots', 'segments', 'arc', 'orbit', 'shape', 'metaballs'), tip: 'Speeds up in the middle of the loop and slows down at its end' },
      { key: 'trail', label: 'Trail length', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.6, show: is('dots', 'segments', 'orbit') },
      { key: 'minScale', label: 'Tail size', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: is('dots', 'segments', 'bounce', 'helix'), tip: 'Size of dots outside the trail / at the back' },
      { key: 'minAlpha', label: 'Tail opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: is('dots', 'segments', 'orbit', 'helix', 'bars') },
      { key: 'arcMin', key2: 'arcMax', label: 'Arc length', type: 'span', min: 0.02, max: 0.95, step: 0.01, default: 0.08, default2: 0.72, show: is('arc') },
      { key: 'track', label: 'Track ring', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, show: is('arc', 'dots', 'segments'), tip: 'Faint full ring under the moving part' },
      { key: 'bounce', label: 'Jump height', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: is('bounce') },
      { key: 'delay', label: 'Stagger', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: is('bounce', 'bars', 'grid', 'pulse'), tip: 'Phase offset between neighbours' },
      { key: 'sides', label: 'Sides', type: 'int', min: 3, max: 8, default: 4, show: is('shape') },
      { key: 'fill', label: 'Filled', type: 'bool', default: false, show: is('shape', 'grid') },
      { key: 'round', label: 'Corner rounding', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: is('shape', 'grid', 'bars') },
      { key: 'gooey', label: 'Gooeyness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: is('metaballs'), tip: 'How readily blobs merge' },
      { key: 'twist', label: 'Twist', type: 'range', min: 0.25, max: 2, step: 0.05, default: 1, show: is('helix') },
      { type: 'section', label: 'Color' },
      { key: 'color', label: 'Main color', type: 'color', default: '#5fe3b0' },
      { key: 'color2', label: 'Second color', type: 'color', default: '#2a6cff', tip: 'Tail / second strand / gradient end' },
      { key: 'colorMix', label: 'Use second color', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'How much the tail / back fades toward the second color' },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'plate', label: 'Background', type: 'select', default: 'none', options: [['none', 'Transparent'], ['circle', 'Round plate'], ['rounded', 'Rounded square plate'], ['solid', 'Solid']] },
      { key: 'plateColor', label: 'Background color', type: 'color', default: '#15181a', show: (p) => p.plate !== 'none' },
      { type: 'section', label: 'Frames' },
      { key: 'frames', label: 'Frames', type: 'int', min: 4, max: 120, default: 24, tip: 'Frames per loop at whole-number speeds. Speeds like 0.5 or 0.25 multiply this (2× / 4×) so the loop stays seamless; the Download button shows the real count. Saved as _f00, _f01 …' },
      { key: 'fps', label: 'Playback FPS', type: 'int', min: 4, max: 60, default: 24, tip: 'Preview speed; use the same rate in the engine (frames ÷ fps = loop length in seconds)' },
      { key: 'previewFrame', label: 'Still frame', type: 'int', min: 0, max: 480, default: 0, tip: 'Which frame the big preview shows (0 = first). The small box plays the whole loop' },
    ],
    presets: [
      { name: 'Dot ring', group: 'Classic', values: {} },
      { name: 'iOS-style segments', group: 'Classic', values: { type: 'segments', count: 12, thick: 0.09, trail: 0.85, minAlpha: 0.15, minScale: 1, color: '#e8ecef', colorMix: 0, track: 0, frames: 12, fps: 12 } },
      { name: 'Material arc', group: 'Classic', values: { type: 'arc', thick: 0.1, track: 0, cycles: 2, ease: 0.3, color: '#4f8dff', colorMix: 0, frames: 48, fps: 30 } },
      { name: 'Arc on track', group: 'Classic', values: { type: 'arc', thick: 0.12, track: 0.18, arcMin: 0.25, arcMax: 0.25, color: '#ffffff', colorMix: 0, frames: 24 } },
      { name: 'Three bouncing dots', group: 'Classic', values: { type: 'bounce', count: 3, thick: 0.16, bounce: 0.5, delay: 0.35, minScale: 0.75, color: '#ffffff', colorMix: 0.5, color2: '#9aa4ad', frames: 30, fps: 30 } },
      { name: 'Typing indicator', group: 'Classic', values: { type: 'bounce', count: 3, thick: 0.13, bounce: 0.25, delay: 0.25, minScale: 1, color: '#c7ccd1', colorMix: 0.8, color2: '#5d646b', plate: 'rounded', plateColor: '#2a2f33', size: 0.62, frames: 24 } },
      { name: 'Equalizer', group: 'Classic', values: { type: 'bars', count: 5, thick: 0.1, round: 1, delay: 0.3, color: '#ff4f7b', color2: '#ffb347', colorMix: 0.8, minAlpha: 1, frames: 24 } },
      { name: 'Radar pulse', group: 'Classic', values: { type: 'pulse', count: 3, thick: 0.04, delay: 1, color: '#5fe3b0', colorMix: 0, glow: 0.5, frames: 36, fps: 30 } },
      { name: 'Gooey blobs', group: 'Stylized', values: { type: 'metaballs', count: 5, thick: 0.17, gooey: 0.7, ease: 0.4, color: '#ff5fa2', color2: '#7a5cff', colorMix: 1, frames: 40, fps: 30 } },
      { name: 'Lava lamp', group: 'Stylized', values: { type: 'metaballs', count: 7, thick: 0.13, gooey: 1, cycles: 1, color: '#ffb02e', color2: '#ff3b3b', colorMix: 1, glow: 0.4, plate: 'circle', plateColor: '#1a0a06', frames: 48, fps: 24 } },
      { name: 'Orbiting planets', group: 'Stylized', values: { type: 'orbit', count: 3, thick: 0.1, trail: 0.4, minAlpha: 0.1, color: '#ffd166', color2: '#06d6a0', colorMix: 1, frames: 36, fps: 24 } },
      { name: 'Square grid wave', group: 'Stylized', values: { type: 'grid', count: 9, thick: 0.2, delay: 0.6, fill: true, round: 0.2, color: '#7a5cff', color2: '#00d4ff', colorMix: 1, frames: 32, fps: 24 } },
      { name: 'Spinning square', group: 'Stylized', values: { type: 'shape', sides: 4, thick: 0.08, ease: 0.8, round: 0.3, color: '#ffffff', colorMix: 0, frames: 30, fps: 30 } },
      { name: 'Triangle tumble', group: 'Stylized', values: { type: 'shape', sides: 3, fill: true, ease: 1, round: 0.35, color: '#ff7a00', color2: '#ffd000', colorMix: 0.7, frames: 24 } },
      { name: 'DNA helix', group: 'Sci-fi', values: { type: 'helix', count: 10, thick: 0.08, twist: 1, minScale: 0.35, minAlpha: 0.35, color: '#00e5ff', color2: '#ff3df2', colorMix: 1, glow: 0.4, frames: 40, fps: 30 } },
      { name: 'Neon ring', group: 'Sci-fi', values: { type: 'dots', count: 16, thick: 0.06, trail: 0.5, minScale: 0.2, minAlpha: 0.08, color: '#00ffd5', color2: '#0047ff', colorMix: 1, glow: 0.8, track: 0.08, frames: 32, fps: 30 } },
      { name: 'HUD scanner', group: 'Sci-fi', values: { type: 'segments', count: 24, thick: 0.05, trail: 0.35, minAlpha: 0.1, minScale: 1, color: '#ffb300', colorMix: 0.3, color2: '#ff3d00', glow: 0.6, track: 0.12, cycles: 2, frames: 48, fps: 30 } },
      { name: 'Thin ring dots', group: 'Minimal', values: { type: 'dots', count: 24, thick: 0.03, trail: 0.3, minScale: 0.6, minAlpha: 0.12, color: '#ffffff', colorMix: 0, track: 0, frames: 32, fps: 30 } },
      { name: 'Hairline arc', group: 'Minimal', values: { type: 'arc', thick: 0.025, track: 0.08, arcMin: 0.1, arcMax: 0.55, ease: 0.3, color: '#ffffff', colorMix: 0, frames: 40, fps: 30 } },
      { name: 'Dot pair orbit', group: 'Minimal', values: { type: 'orbit', count: 2, thick: 0.08, trail: 0.2, minAlpha: 0.1, color: '#ffffff', color2: '#9aa4ad', colorMix: 0.5, track: 0, frames: 36, fps: 30 } },
      { name: 'Quiet pulse', group: 'Minimal', values: { type: 'pulse', count: 2, thick: 0.02, delay: 1, color: '#c7ccd1', colorMix: 0, frames: 48, fps: 30 } },
      { name: 'Segment wheel', group: 'Classic', values: { type: 'segments', count: 8, thick: 0.16, trail: 0.5, minScale: 0.7, minAlpha: 0.2, color: '#e8ecef', colorMix: 0, track: 0, frames: 16, fps: 16 } },
      { name: 'Blue bounce', group: 'Classic', values: { type: 'bounce', count: 4, thick: 0.12, bounce: 0.45, delay: 0.4, minScale: 0.85, color: '#3b82f6', color2: '#93c5fd', colorMix: 0.6, frames: 36, fps: 30 } },
      { name: 'Progress ring (green)', group: 'Classic', values: { type: 'arc', thick: 0.11, track: 0.2, arcMin: 0.3, arcMax: 0.3, color: '#22c55e', colorMix: 0, frames: 30, fps: 30 } },
      { name: 'Bar wave', group: 'Classic', values: { type: 'bars', count: 7, thick: 0.08, round: 0.5, delay: 0.7, color: '#f97316', color2: '#fde047', colorMix: 1, minAlpha: 0.8, frames: 32, fps: 30 } },
      { name: 'Ticking clock', group: 'Classic', values: { type: 'segments', count: 12, thick: 0.06, trail: 0.08, minScale: 1, minAlpha: 0.25, color: '#ffffff', colorMix: 0, track: 0, frames: 12, fps: 4 } },
      { name: 'Fruit salad', group: 'Stylized', values: { type: 'dots', count: 6, thick: 0.18, trail: 0.9, minScale: 0.45, minAlpha: 0.6, color: '#ff6b6b', color2: '#ffd93d', colorMix: 1, track: 0, frames: 30, fps: 30 } },
      { name: 'Jelly blob', group: 'Stylized', values: { type: 'metaballs', count: 3, thick: 0.2, gooey: 0.9, ease: 0.6, color: '#00d1b2', color2: '#3273dc', colorMix: 1, frames: 40, fps: 30 } },
      { name: 'Sunburst segments', group: 'Stylized', values: { type: 'segments', count: 18, thick: 0.07, trail: 0.7, minScale: 1, minAlpha: 0.2, color: '#ffb703', color2: '#fb8500', colorMix: 1, glow: 0.3, track: 0, frames: 36, fps: 30 } },
      { name: 'Triangle outline spin', group: 'Stylized', values: { type: 'shape', sides: 3, thick: 0.08, ease: 0.7, round: 0.4, color: '#a78bfa', color2: '#f472b6', colorMix: 1, frames: 30, fps: 30 } },
      { name: 'Hollow grid wave', group: 'Stylized', values: { type: 'grid', count: 9, thick: 0.22, delay: 0.7, fill: false, round: 0.5, color: '#34d399', color2: '#60a5fa', colorMix: 1, frames: 36, fps: 30 } },
      { name: 'Amber terminal', group: 'Retro', values: { type: 'segments', count: 8, thick: 0.12, trail: 0.4, minScale: 1, minAlpha: 0.15, color: '#ffb000', colorMix: 0, glow: 0.5, plate: 'solid', plateColor: '#000000', track: 0, frames: 8, fps: 8 } },
      { name: 'Handheld dots', group: 'Retro', values: { type: 'bounce', count: 3, thick: 0.14, bounce: 0.5, delay: 0.5, minScale: 1, color: '#9bbc0f', color2: '#306230', colorMix: 0.5, plate: 'solid', plateColor: '#0f380f', frames: 12, fps: 8 } },
      { name: 'CRT pulse', group: 'Retro', values: { type: 'pulse', count: 3, thick: 0.05, delay: 1, color: '#33ff66', colorMix: 0, glow: 0.8, plate: 'solid', plateColor: '#001a08', frames: 24, fps: 12 } },
      { name: 'Fairy dust orbit', group: 'Fantasy', values: { type: 'orbit', count: 4, thick: 0.06, trail: 0.9, minAlpha: 0.05, color: '#fff6c2', color2: '#ff9de2', colorMix: 1, glow: 1, frames: 48, fps: 30 } },
      { name: 'Portal helix', group: 'Fantasy', values: { type: 'helix', count: 16, thick: 0.05, twist: 2, minScale: 0.3, minAlpha: 0.25, color: '#b388ff', color2: '#00e5ff', colorMix: 1, glow: 0.7, frames: 48, fps: 30 } },
      { name: 'Ember blobs', group: 'Fantasy', values: { type: 'metaballs', count: 5, thick: 0.13, gooey: 0.75, color: '#ff8a00', color2: '#ff2a00', colorMix: 1, glow: 0.9, plate: 'circle', plateColor: '#140400', frames: 40, fps: 30 } },
      { name: 'Targeting arc', group: 'Sci-fi', values: { type: 'arc', thick: 0.06, track: 0.25, arcMin: 0.1, arcMax: 0.5, cycles: 2, color: '#ff2d55', colorMix: 0, glow: 0.6, frames: 48, fps: 30 } },
      { name: 'Data stream bars', group: 'Sci-fi', values: { type: 'bars', count: 9, thick: 0.05, round: 0, delay: 1, color: '#00ffa3', color2: '#00b8ff', colorMix: 1, minAlpha: 0.7, glow: 0.5, frames: 24, fps: 24 } },
      { name: 'Quantum dots', group: 'Sci-fi', values: { type: 'dots', count: 20, thick: 0.05, trail: 0.25, minScale: 0.3, minAlpha: 0.08, color: '#ffffff', color2: '#00e5ff', colorMix: 1, glow: 1, cycles: 2, track: 0, frames: 48, fps: 30 } },
      { name: 'Shield charge', group: 'Sci-fi', values: { type: 'segments', count: 6, thick: 0.18, trail: 0.6, minScale: 1, minAlpha: 0.15, color: '#4dd2ff', color2: '#1e40ff', colorMix: 1, glow: 0.6, track: 0.1, plate: 'circle', plateColor: '#020818', frames: 24, fps: 24 } },
      { name: 'Warp core', group: 'Sci-fi', values: { type: 'pulse', count: 5, thick: 0.03, delay: 1, cycles: 1, color: '#7df9ff', color2: '#3a2cff', colorMix: 1, glow: 0.9, frames: 60, fps: 30 } },
      { name: 'Reactor helix', group: 'Sci-fi', values: { type: 'helix', count: 14, thick: 0.06, twist: 1.5, minScale: 0.25, minAlpha: 0.2, color: '#9dff4a', color2: '#00b3ff', colorMix: 1, glow: 0.6, plate: 'circle', plateColor: '#06100a', frames: 48, fps: 30 } },
      { name: 'Cyber segments', group: 'Sci-fi', values: { type: 'segments', count: 32, thick: 0.035, trail: 0.6, minAlpha: 0.06, minScale: 1, color: '#ff2e88', color2: '#7a00ff', colorMix: 1, glow: 0.7, cycles: 1, frames: 40, fps: 30 } },
      { name: 'Plasma blobs', group: 'Sci-fi', values: { type: 'metaballs', count: 6, thick: 0.12, gooey: 0.85, ease: 0.2, color: '#00fff0', color2: '#0050ff', colorMix: 1, glow: 0.7, frames: 48, fps: 30 } },
      { name: 'Minimal white arc', group: 'Minimal', values: { type: 'arc', thick: 0.05, track: 0.12, arcMin: 0.18, arcMax: 0.18, color: '#ffffff', colorMix: 0, frames: 24, fps: 24 } },
      { name: 'Mono dots', group: 'Minimal', values: { type: 'dots', count: 10, thick: 0.08, trail: 0.4, minScale: 0.5, minAlpha: 0.15, color: '#ffffff', colorMix: 0, track: 0, frames: 30, fps: 30 } },
      { name: 'Single pulse dot', group: 'Minimal', values: { type: 'pulse', count: 1, thick: 0.08, delay: 1, color: '#ffffff', colorMix: 0, frames: 30, fps: 30 } },
      { name: 'Pill bars', group: 'Minimal', values: { type: 'bars', count: 3, thick: 0.16, round: 1, delay: 0.5, color: '#ffffff', colorMix: 0, minAlpha: 0.6, frames: 30, fps: 30 } },
      { name: 'Wave dots', group: 'Classic', values: { type: 'bounce', count: 5, thick: 0.11, bounce: 0.3, delay: 0.6, minScale: 0.8, color: '#4f8dff', color2: '#a4c4ff', colorMix: 0.6, frames: 40, fps: 30 } },
      { name: 'Two-tone arc', group: 'Classic', values: { type: 'arc', thick: 0.14, track: 0, arcMin: 0.15, arcMax: 0.65, ease: 0.4, color: '#ff7a00', color2: '#ffd000', colorMix: 1, frames: 36, fps: 30 } },
      { name: 'Slow dash ring', group: 'Classic', values: { type: 'segments', count: 8, thick: 0.14, trail: 0.7, minScale: 0.8, minAlpha: 0.2, color: '#c7ccd1', colorMix: 0, cycles: 0.5, frames: 24, fps: 24 } },
      { name: 'Rainbow ring', group: 'Stylized', values: { type: 'dots', count: 12, thick: 0.1, trail: 0.85, minScale: 0.35, minAlpha: 0.3, color: '#ff3b8a', color2: '#3bd2ff', colorMix: 1, track: 0, frames: 36, fps: 30 } },
      { name: 'Bubblegum bounce', group: 'Stylized', values: { type: 'bounce', count: 3, thick: 0.2, bounce: 0.75, delay: 0.5, minScale: 0.85, color: '#ff7ac8', color2: '#ffb3e0', colorMix: 0.6, plate: 'rounded', plateColor: '#2a0a20', frames: 36, fps: 30 } },
      { name: 'Breathing hexagon', group: 'Stylized', values: { type: 'shape', sides: 6, thick: 0.09, ease: 0.6, round: 0.25, color: '#00e5a0', color2: '#00a3ff', colorMix: 1, frames: 36, fps: 30 } },
      { name: 'Pentagon tumble', group: 'Stylized', values: { type: 'shape', sides: 5, fill: true, ease: 1, round: 0.3, color: '#ffcc00', color2: '#ff5a00', colorMix: 0.8, frames: 30, fps: 30 } },
      { name: 'Checker wave', group: 'Stylized', values: { type: 'grid', count: 16, thick: 0.25, delay: 0.8, fill: true, round: 0.35, color: '#ff4f7b', color2: '#ffd166', colorMix: 1, frames: 40, fps: 30 } },
      { name: 'Slow planets', group: 'Stylized', values: { type: 'orbit', count: 2, thick: 0.13, trail: 0.6, minAlpha: 0.15, cycles: 0.5, color: '#ff9f43', color2: '#54a0ff', colorMix: 1, frames: 36, fps: 24 } },
      { name: 'Retro pixel bars', group: 'Retro', values: { type: 'bars', count: 4, thick: 0.14, round: 0, delay: 0.5, color: '#39ff14', color2: '#0b6b00', colorMix: 0.7, minAlpha: 1, plate: 'solid', plateColor: '#000000', frames: 16, fps: 12 } },
      { name: 'Arcade blocks', group: 'Retro', values: { type: 'grid', count: 4, thick: 0.3, delay: 1, fill: true, round: 0, color: '#ffe600', color2: '#ff2d00', colorMix: 1, frames: 16, fps: 12 } },
      { name: 'Magic orbit', group: 'Fantasy', values: { type: 'orbit', count: 3, thick: 0.08, trail: 0.7, minAlpha: 0.1, color: '#ffd76a', color2: '#b05cff', colorMix: 1, glow: 0.8, frames: 48, fps: 30 } },
      { name: 'Mana blobs', group: 'Fantasy', values: { type: 'metaballs', count: 4, thick: 0.16, gooey: 0.6, ease: 0.5, color: '#5fb8ff', color2: '#1a2cff', colorMix: 1, glow: 0.5, plate: 'circle', plateColor: '#070a1e', frames: 40, fps: 30 } },
      { name: 'Rune circle', group: 'Fantasy', values: { type: 'segments', count: 16, thick: 0.06, trail: 0.5, minAlpha: 0.15, minScale: 1, color: '#ffb84d', color2: '#ff4d00', colorMix: 0.7, glow: 0.7, track: 0.15, cycles: 0.5, frames: 48, fps: 30 } },
      { name: 'Energy core', group: 'Sci-fi', values: { type: 'pulse', count: 4, thick: 0.06, delay: 1, cycles: 2, color: '#b388ff', color2: '#00e5ff', colorMix: 1, glow: 1, plate: 'circle', plateColor: '#0a0614', frames: 48, fps: 30 } },
    ],
    render(ctx, W, H, p, opts) {
      opts = opts || {};
      const N = frameCount(p), fm = typeof opts.layer === 'string' && /^frame(\d+)$/.exec(opts.layer);
      const i = fm ? +fm[1] : Math.min(Math.max(0, p.previewFrame | 0), N - 1);
      const t = (i % N) / N; // loop phase 0..1 (frame N would be frame 0 again)
      const S = Math.min(W, H), cx = W / 2, cy = H / 2, R = (S / 2) * p.size * 0.92, th = Math.max(1, R * p.thick);
      const c1 = U.hex(p.color), c2 = U.hex(p.color2), cm = p.colorMix;
      const colAt = (f) => mixC(c2, c1, 1 - cm * (1 - f)); // f = 1 head / front … 0 tail / back

      // background plate
      if (p.plate !== 'none') {
        ctx.fillStyle = p.plateColor;
        ctx.beginPath();
        if (p.plate === 'circle') ctx.arc(cx, cy, S * 0.48, 0, TAU);
        else if (p.plate === 'rounded') U.polyPath(ctx, [[cx - S * 0.46, cy - S * 0.46], [cx + S * 0.46, cy - S * 0.46], [cx + S * 0.46, cy + S * 0.46], [cx - S * 0.46, cy + S * 0.46]], S * 0.18);
        else ctx.rect(0, 0, W, H);
        ctx.fill();
      }
      if (p.glow > 0) { ctx.shadowColor = css(c1, 0.9); ctx.shadowBlur = p.glow * R * 0.25; }
      const dot = (x, y, r, col, a) => { ctx.fillStyle = css(col, a); ctx.beginPath(); ctx.arc(x, y, Math.max(0.3, r), 0, TAU); ctx.fill(); };
      const track = (r, w) => {
        if (!(p.track > 0)) return;
        const sb = ctx.shadowBlur; ctx.shadowBlur = 0;
        ctx.strokeStyle = css(c1, p.track); ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
        ctx.shadowBlur = sb;
      };
      // whole cycles over the full (possibly repeated) loop, so the last frame flows into the first
      const n = Math.max(2, p.count | 0), cyc = Math.round(speedOf(p) * repeats(p)), e = easeLoop(t, p.ease);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      switch (p.type) {
        case 'dots':
        case 'segments': {
          // a head runs around the ring; elements behind it fade and shrink over the trail
          const seg = p.type === 'segments', head = U.mod(cyc * e, 1) * n, tl = Math.max(0.5, p.trail * n);
          const r = seg ? th * 0.5 : Math.min(th, ((Math.PI * R) / n) * 0.85);
          track(seg ? R * 0.775 : R - r, seg ? R * 0.45 : Math.max(1, r * 0.35));
          for (let j = 0; j < n; j++) {
            const d = U.mod(head - j, n), f = clamp(1 - d / tl), a = -Math.PI / 2 + (TAU * j) / n;
            const sc = lerp(p.minScale, 1, f), al = lerp(p.minAlpha, 1, f), col = colAt(f);
            if (seg) {
              ctx.strokeStyle = css(col, al); ctx.lineWidth = Math.max(1, th * lerp(0.6, 1, sc));
              ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke();
            } else dot(cx + Math.cos(a) * (R - r), cy + Math.sin(a) * (R - r), r * sc, col, al);
          }
          break;
        }
        case 'arc': {
          // the arc's length breathes while it turns; the tail catches up while the head races ahead
          const rr = R - th / 2, breath = 0.5 - 0.5 * Math.cos(TAU * cyc * t);
          const len = lerp(p.arcMin, Math.max(p.arcMin, p.arcMax), breath) * TAU;
          const start = TAU * (cyc * e) + (p.arcMax > p.arcMin ? TAU * (cyc * t - Math.sin(TAU * cyc * t) / TAU) : 0) - Math.PI / 2;
          track(rr, th);
          const g = ctx.createConicGradient ? ctx.createConicGradient(start, cx, cy) : null;
          if (g && cm > 0) { g.addColorStop(0, css(c2)); g.addColorStop(Math.min(0.999, len / TAU), css(c1)); g.addColorStop(1, css(c1)); ctx.strokeStyle = g; }
          else ctx.strokeStyle = css(c1);
          ctx.lineWidth = th; ctx.beginPath(); ctx.arc(cx, cy, rr, start, start + len); ctx.stroke();
          break;
        }
        case 'pulse': {
          // rings expand from the center and fade out, evenly staggered
          for (let j = 0; j < n; j++) {
            const ph = U.mod(cyc * t + (j / n) * p.delay, 1), a = Math.pow(1 - ph, 1.4);
            ctx.strokeStyle = css(colAt(1 - ph), a); ctx.lineWidth = Math.max(1, th * (1 - ph * 0.5));
            ctx.beginPath(); ctx.arc(cx, cy, Math.max(0.5, R * ph), 0, TAU); ctx.stroke();
          }
          dot(cx, cy, th * 0.9, c1, 1);
          break;
        }
        case 'bounce': {
          const r = Math.min(th, R / n), gap = (2 * R) / n;
          for (let j = 0; j < n; j++) {
            const ph = U.mod(cyc * t - j * p.delay / n, 1), up = ph < 0.5 ? Math.sin(ph * TAU) : 0; // airborne the first half
            const x = cx - R + gap * (j + 0.5), y = cy + r * 0.5 - up * p.bounce * R * 0.7;
            const sq = ph < 0.5 ? 1 : 1 - 0.18 * Math.sin((ph - 0.5) * TAU); // squash on landing
            const f = up; ctx.fillStyle = css(colAt(f), 1);
            ctx.beginPath(); ctx.ellipse(x, y + r * (1 - sq), r * lerp(p.minScale, 1, f) * (2 - sq), r * lerp(p.minScale, 1, f) * sq, 0, 0, TAU); ctx.fill();
          }
          break;
        }
        case 'bars': {
          const w = Math.min(th * 1.4, (2 * R) / n * 0.7), gap = (2 * R) / n;
          for (let j = 0; j < n; j++) {
            const h = lerp(0.25, 1, 0.5 - 0.5 * Math.cos(TAU * (cyc * t - j * p.delay / n))) * R * 1.6;
            const x = cx - R + gap * (j + 0.5) - w / 2, f = h / (R * 1.6);
            ctx.fillStyle = css(colAt(f), lerp(p.minAlpha, 1, f));
            ctx.beginPath(); U.polyPath(ctx, [[x, cy - h / 2], [x + w, cy - h / 2], [x + w, cy + h / 2], [x, cy + h / 2]], (w / 2) * p.round); ctx.fill();
          }
          break;
        }
        case 'orbit': {
          // dots on nested orbits, inner ones faster (whole turns), each with a fading trail of ghosts
          const r = Math.min(th, R / (n + 1)) * 0.7, ghosts = 10;
          for (let j = 0; j < n; j++) {
            const orb = R * (n === 1 ? 0.8 : lerp(0.3, 1, j / (n - 1))) - r, speed = cyc * (n - j), dir = j % 2 ? -1 : 1;
            track(orb, Math.max(1, r * 0.25));
            for (let g = ghosts; g >= 0; g--) {
              const lag = (g / ghosts) * p.trail * 0.35, a = dir * TAU * (speed * e - lag * (n - j) * 0.5) - Math.PI / 2, f = 1 - g / ghosts;
              if (g && p.trail <= 0.05) continue;
              dot(cx + Math.cos(a) * orb, cy + Math.sin(a) * orb, r * lerp(0.3, 1, f), colAt(j / Math.max(1, n - 1)), g ? lerp(p.minAlpha, 0.6, f) * f : 1);
            }
          }
          break;
        }
        case 'metaballs': {
          // blobs orbit at different whole speeds, swell and merge (thresholded metaball field)
          const blobs = [], br = R * p.thick * 1.6;
          for (let j = 0; j < n; j++) {
            const sp = 1 + (j % 3), a = TAU * (cyc * sp * (j % 2 ? -e : e) + j / n), orb = R * (0.25 + 0.45 * (0.5 + 0.5 * Math.sin(TAU * (cyc * t + j / n))));
            blobs.push([cx + Math.cos(a) * orb, cy + Math.sin(a) * orb, br * (0.75 + 0.25 * Math.cos(TAU * (cyc * t * 2 + j / n)))]);
          }
          blobs.push([cx, cy, br * 1.1]);
          // drawn on its own canvas, then composited (so the glow and the plate work like for the other types)
          const mc = U.canvas(W, H), mg = mc.getContext('2d'), img = mg.createImageData(W, H), d = img.data, thr = lerp(1.6, 0.6, p.gooey);
          const x0 = Math.max(0, Math.floor(cx - R * 1.2)), x1 = Math.min(W, Math.ceil(cx + R * 1.2)), y0 = Math.max(0, Math.floor(cy - R * 1.2)), y1 = Math.min(H, Math.ceil(cy + R * 1.2));
          for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            let f = 0, wsum = 0, cw = 0;
            for (let b = 0; b < blobs.length; b++) {
              const B = blobs[b], dx = x + 0.5 - B[0], dy = y + 0.5 - B[1], q = (B[2] * B[2]) / (dx * dx + dy * dy + 1e-3);
              f += q; wsum += q; if (b === blobs.length - 1) cw = q;
            }
            const aa = smoothstep(thr - 0.06 * thr, thr + 0.06 * thr, f);
            if (aa <= 0) continue;
            const col = colAt(clamp((cw / wsum) * 1.5)), o = (y * W + x) * 4;
            d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = aa * 255;
          }
          mg.putImageData(img, 0, 0);
          ctx.drawImage(mc, 0, 0);
          break;
        }
        case 'grid': {
          // a 3×3 (or k×k) grid of squares: a wave runs diagonally, scaling and turning them
          const k = Math.max(2, Math.round(Math.sqrt(n))), cell = (2 * R) / k, s0 = cell * lerp(0.35, 0.9, p.thick / 0.5);
          for (let gy = 0; gy < k; gy++) for (let gx = 0; gx < k; gx++) {
            const ph = 0.5 - 0.5 * Math.cos(TAU * (cyc * t - ((gx + gy) / (2 * (k - 1))) * p.delay));
            const s = s0 * lerp(0.2, 1, ph), x = cx - R + cell * (gx + 0.5), y = cy - R + cell * (gy + 0.5), rot = ph * Math.PI / 2;
            const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [x + (u * Math.cos(rot) - v * Math.sin(rot)) * s / 2, y + (u * Math.sin(rot) + v * Math.cos(rot)) * s / 2]);
            ctx.beginPath(); U.polyPath(ctx, pts, (s / 2) * p.round);
            if (p.fill) { ctx.fillStyle = css(colAt(ph), 1); ctx.fill(); } else { ctx.strokeStyle = css(colAt(ph), 1); ctx.lineWidth = Math.max(1, s * 0.15); ctx.stroke(); }
          }
          break;
        }
        case 'shape': {
          // a polygon turns (whole turns per loop, divided by its symmetry) and breathes in size
          const sides = Math.max(3, p.sides | 0), rot = (TAU / sides) * cyc * e * (sides > 4 ? 1 : 2) - Math.PI / 2;
          const sc = 1 - 0.18 * Math.sin(TAU * cyc * t * (sides > 4 ? 1 : 2)) ** 2, rr = (R - th / 2) * sc;
          const pts = Array.from({ length: sides }, (_, j) => [cx + Math.cos(rot + (TAU * j) / sides) * rr, cy + Math.sin(rot + (TAU * j) / sides) * rr]);
          ctx.beginPath(); U.polyPath(ctx, pts, rr * p.round * 0.6);
          const g = ctx.createLinearGradient(cx - rr, cy - rr, cx + rr, cy + rr);
          g.addColorStop(0, css(c1)); g.addColorStop(1, css(colAt(0)));
          if (p.fill) { ctx.fillStyle = g; ctx.fill(); } else { ctx.strokeStyle = g; ctx.lineWidth = th; ctx.stroke(); }
          break;
        }
        case 'helix': {
          // two strands of dots twisting around each other; the dot in front is bigger and brighter
          const gap = (2 * R) / n, r = Math.min(th, gap * 0.45), list = [];
          for (let j = 0; j < n; j++) for (const s of [0, 1]) {
            const ph = TAU * (cyc * t + (j / n) * p.twist) + s * Math.PI, z = Math.cos(ph);
            list.push([cx - R + gap * (j + 0.5), cy + Math.sin(ph) * R * 0.45, z, s]);
          }
          list.sort((a, b) => a[2] - b[2]);
          for (const [x, y, z, s] of list) {
            const f = 0.5 + 0.5 * z;
            dot(x, y, r * lerp(p.minScale, 1, f), s ? mixC(c1, c2, cm) : c1, lerp(p.minAlpha, 1, f));
          }
          break;
        }
      }
      ctx.shadowBlur = 0;
    },
  });
})();
