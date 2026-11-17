/* Lens flare (frontal): what a camera / eye sees looking into a bright source such as the sun, a
   flashlight, a headlight or a muzzle: hot core, soft bloom, starburst (diffraction) rays plus fine
   rays, an anamorphic streak, a chromatic halo ring, aperture-shaped ghosts along the flare axis and
   lens dirt lit by the source. Built additively on black; output additive (black background) or
   color + alpha. Sizes are px @ 512. */
(function () {
  'use strict';
  const U = window.UGTG;
  const RAD = Math.PI / 180;

  const rgb = (hex, a, f = 1) => { const c = U.hex(hex); return `rgba(${U.clamp(c[0] * f, 0, 255) | 0},${U.clamp(c[1] * f, 0, 255) | 0},${U.clamp(c[2] * f, 0, 255) | 0},${U.clamp(a, 0, 1)})`; };
  const GHOST_TINTS = ['#7fd8ff', '#9dff9a', '#ff8ad8', '#ffc46a', '#8a9cff', '#6affe0'];

  /* radial gradient with a power falloff: alpha = intensity * (1 - t)^falloff */
  function softDisc(c, x, y, r, color, intensity, falloff) {
    if (r <= 0 || intensity <= 0) return;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    for (let i = 0; i <= 10; i++) { const t = i / 10; g.addColorStop(t, rgb(color, intensity * Math.pow(1 - t, falloff))); }
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, U.TAU); c.fill();
  }

  /* one tapered ray from the source, fading toward its tip */
  function ray(c, x, y, a, len, w, color, intensity) {
    if (len <= 0 || intensity <= 0) return;
    const ca = Math.cos(a), sa = Math.sin(a), px = -sa * w / 2, py = ca * w / 2;
    const g = c.createLinearGradient(x, y, x + ca * len, y + sa * len);
    g.addColorStop(0, rgb(color, intensity));
    g.addColorStop(0.25, rgb(color, intensity * 0.45));
    g.addColorStop(1, rgb(color, 0));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x + px, y + py); c.lineTo(x + ca * len, y + sa * len); c.lineTo(x - px, y - py); c.closePath();
    c.fill();
  }

  U.register({
    id: 'lensflare',
    name: 'Lens Flare',
    desc: 'Frontal lens flare from bright sources (sun, flashlight, headlight): core, rays, anamorphic streak, halo, ghosts, lens dirt',
    tags: ['VFX', 'Lighting', 'Shooter'],
    bg: 'black',
    icon: U.icon('<circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3"/>'),
    params: [
      { type: 'section', label: 'Source' },
      { key: 'x', label: 'Position X', type: 'range', min: 0, max: 1, step: 0.005, default: 0.5 },
      { key: 'y', label: 'Position Y', type: 'range', min: 0, max: 1, step: 0.005, default: 0.5 },
      { key: 'bright', label: 'Brightness', type: 'range', min: 0.1, max: 3, step: 0.01, default: 1 },
      { key: 'coreSize', label: 'Core size', type: 'range', min: 0, max: 120, step: 0.5, default: 22, tip: 'px @ 512' },
      { key: 'coreColor', label: 'Core color', type: 'color', default: '#ffffff' },
      { key: 'glow', label: 'Bloom', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.55 },
      { key: 'glowSize', label: 'Bloom size', type: 'range', min: 5, max: 512, step: 1, default: 150, show: (p) => p.glow > 0, tip: 'px @ 512' },
      { key: 'glowFalloff', label: 'Bloom falloff', type: 'range', min: 0.5, max: 8, step: 0.05, default: 2.6, show: (p) => p.glow > 0, tip: 'Higher = tighter, hotter center' },
      { key: 'glowColor', label: 'Bloom color', type: 'color', default: '#ffe9c8', show: (p) => p.glow > 0 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 3 },
      { type: 'section', label: 'Rays' },
      { key: 'rays', label: 'Main rays', type: 'int', min: 0, max: 48, default: 6, tip: 'Diffraction spikes (aperture blades: 6 blades give 6 or 12 spikes)' },
      { key: 'rayLen', label: 'Ray length', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.75, show: (p) => p.rays > 0, tip: 'Fraction of half the texture' },
      { key: 'rayWidth', label: 'Ray width', type: 'range', min: 0.5, max: 30, step: 0.25, default: 5, show: (p) => p.rays > 0, tip: 'px @ 512 at the source' },
      { key: 'rayVar', label: 'Length variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.rays > 0 },
      { key: 'rayRot', label: 'Ray rotation', type: 'range', min: -180, max: 180, step: 0.5, default: 15, show: (p) => p.rays > 0 },
      { key: 'rayIntensity', label: 'Ray intensity', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.7, show: (p) => p.rays > 0 },
      { key: 'rayColor', label: 'Ray color', type: 'color', default: '#fff4e0', show: (p) => p.rays > 0 || p.fine > 0 },
      { key: 'fine', label: 'Fine rays', type: 'int', min: 0, max: 400, default: 80, tip: 'Many thin, faint rays of random length (eyelash / dust diffraction)' },
      { key: 'fineLen', label: 'Fine ray length', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.55, show: (p) => p.fine > 0 },
      { key: 'fineIntensity', label: 'Fine ray intensity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.22, show: (p) => p.fine > 0 },
      { type: 'section', label: 'Streak' },
      { key: 'streak', label: 'Anamorphic streak', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.25 },
      { key: 'streakLen', label: 'Streak length', type: 'range', min: 0.05, max: 2, step: 0.01, default: 0.95, show: (p) => p.streak > 0, tip: 'Fraction of the texture width' },
      { key: 'streakThick', label: 'Streak thickness', type: 'range', min: 0.5, max: 60, step: 0.25, default: 7, show: (p) => p.streak > 0, tip: 'px @ 512' },
      { key: 'streakAngle', label: 'Streak angle', type: 'range', min: -90, max: 90, step: 0.5, default: 0, show: (p) => p.streak > 0 },
      { key: 'streakColor', label: 'Streak color', type: 'color', default: '#a8cfff', show: (p) => p.streak > 0 },
      { type: 'section', label: 'Halo' },
      { key: 'ring', label: 'Halo ring', type: 'range', min: 0, max: 1, step: 0.01, default: 0.18 },
      { key: 'ringRadius', label: 'Ring radius', type: 'range', min: 5, max: 400, step: 0.5, default: 165, show: (p) => p.ring > 0, tip: 'px @ 512' },
      { key: 'ringWidth', label: 'Ring width', type: 'range', min: 1, max: 120, step: 0.5, default: 22, show: (p) => p.ring > 0, tip: 'px @ 512' },
      { key: 'chroma', label: 'Chromatic split', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.ring > 0, tip: 'Rainbow fringing: red, green and blue rings drift apart' },
      { type: 'section', label: 'Ghosts' },
      { key: 'ghosts', label: 'Ghosts', type: 'int', min: 0, max: 16, default: 5, tip: 'Reflections of the aperture along the flare axis' },
      { key: 'ghostShape', label: 'Ghost shape', type: 'select', default: 'hex', options: [['circle', 'Circle'], ['hex', 'Hexagon (6 blades)'], ['oct', 'Octagon (8 blades)'], ['pent', 'Pentagon (5 blades)']], show: (p) => p.ghosts > 0 },
      { key: 'ghostAngle', label: 'Flare axis', type: 'range', min: -180, max: 180, step: 0.5, default: 35, show: (p) => p.ghosts > 0, tip: 'Direction the ghosts line up in (usually through the image center)' },
      { key: 'ghostSpread', label: 'Ghost spread', type: 'range', min: 0.05, max: 1.5, step: 0.01, default: 0.8, show: (p) => p.ghosts > 0 },
      { key: 'ghostSize', label: 'Ghost size', type: 'range', min: 2, max: 200, step: 0.5, default: 34, show: (p) => p.ghosts > 0, tip: 'px @ 512' },
      { key: 'ghostIntensity', label: 'Ghost intensity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.18, show: (p) => p.ghosts > 0 },
      { key: 'ghostColor', label: 'Ghost colors', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, show: (p) => p.ghosts > 0, tip: '0 = white, 1 = strongly tinted (cyan, green, magenta, amber …)' },
      { type: 'section', label: 'Lens dirt' },
      { key: 'dirt', label: 'Lens dirt', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Dust and smudges on the lens, lit by the source' },
      { key: 'dirtRadius', label: 'Lit radius', type: 'range', min: 20, max: 600, step: 1, default: 260, show: (p) => p.dirt > 0, tip: 'px @ 512' },
      { key: 'dirtColor', label: 'Dirt color', type: 'color', default: '#ffe2b8', show: (p) => p.dirt > 0 },
      { type: 'section', label: 'Output' },
      { key: 'edgeShape', label: 'Edge fade shape', type: 'select', default: 'radial', options: [['radial', 'Radial (round)'], ['rect', 'Rectangular']], tip: 'Everything fades out before the texture edge, so the sprite never shows a border' },
      { key: 'edgeFade', label: 'Edge fade', type: 'range', min: 0.02, max: 0.8, step: 0.01, default: 0.3, tip: 'Width of the fade toward the edge (fraction of half the texture)' },
      { key: 'output', label: 'Output', type: 'select', default: 'additive', options: [['additive', 'Additive (on black)'], ['alpha', 'Color + alpha']], tip: 'Additive: use with an additive / screen material. Color + alpha: for normal alpha blending' },
    ],
    presets: [
      { name: 'Midday sun', group: 'Realistic', values: { coreSize: 30, glow: 0.8, glowSize: 230, glowColor: '#fff2d6', rays: 12, rayLen: 0.9, rayWidth: 4, rayIntensity: 0.55, fine: 160, fineIntensity: 0.25, streak: 0.12, ring: 0.14, ghosts: 6, ghostIntensity: 0.12, dirt: 0.25 } },
      { name: 'Sunset sun', group: 'Realistic', values: { coreColor: '#fff2d0', coreSize: 34, glow: 1, glowSize: 280, glowFalloff: 2, glowColor: '#ffaa55', rays: 8, rayColor: '#ffd8a0', rayLen: 0.7, rayIntensity: 0.45, fine: 120, fineIntensity: 0.2, streak: 0.2, streakColor: '#ffb070', ring: 0.2, ringRadius: 200, ghosts: 6, ghostColor: 0.5, ghostIntensity: 0.15, dirt: 0.35, dirtColor: '#ffcc90' } },
      { name: 'LED flashlight', group: 'Realistic', values: { coreSize: 16, glow: 0.7, glowSize: 120, glowFalloff: 3.4, glowColor: '#e8f0ff', rays: 6, rayRot: 0, rayLen: 0.55, rayWidth: 3, rayIntensity: 0.6, rayColor: '#f0f6ff', fine: 60, fineIntensity: 0.18, streak: 0.55, streakLen: 1.1, streakThick: 5, streakColor: '#8ab8ff', ring: 0.1, ghosts: 3, ghostIntensity: 0.1 } },
      { name: 'Halogen headlight', group: 'Realistic', values: { coreSize: 22, coreColor: '#fff6e0', glow: 0.9, glowSize: 170, glowColor: '#ffd9a0', rays: 10, rayRot: 9, rayLen: 0.6, rayIntensity: 0.5, rayColor: '#ffe6c0', fine: 90, streak: 0.35, streakColor: '#ffd8a0', ring: 0, ghosts: 4, ghostShape: 'circle', ghostIntensity: 0.12 } },
      { name: 'Street lamp (sodium)', group: 'Realistic', values: { coreSize: 18, coreColor: '#ffe0a0', glow: 1.1, glowSize: 200, glowFalloff: 1.8, glowColor: '#ff9a30', rays: 4, rayRot: 45, rayLen: 0.5, rayIntensity: 0.4, rayColor: '#ffb860', fine: 40, fineIntensity: 0.15, streak: 0, ring: 0, ghosts: 0 } },
      { name: 'Camera phone flare', group: 'Realistic', values: { coreSize: 26, glow: 0.7, rays: 0, fine: 30, fineIntensity: 0.12, streak: 0.1, ring: 0.3, ringRadius: 120, chroma: 1, ghosts: 9, ghostShape: 'circle', ghostSpread: 1.1, ghostSize: 26, ghostIntensity: 0.28, ghostColor: 0.9, dirt: 0.4 } },
      { name: 'Eye glare (starburst)', group: 'Realistic', values: { coreSize: 14, glow: 0.6, glowSize: 110, rays: 0, fine: 320, fineLen: 0.85, fineIntensity: 0.35, streak: 0, ring: 0.12, ringRadius: 60, ringWidth: 30, chroma: 0.8, ghosts: 0 } },
      { name: 'Cinematic anamorphic', group: 'Stylized', values: { coreSize: 20, glow: 0.6, glowColor: '#d8e8ff', rays: 0, fine: 0, streak: 1.1, streakLen: 1.8, streakThick: 9, streakColor: '#5aa0ff', ring: 0.12, ringRadius: 90, chroma: 0.3, ghosts: 7, ghostShape: 'oct', ghostAngle: 0, ghostSpread: 1, ghostColor: 0.8, ghostIntensity: 0.16 } },
      { name: 'Anime sparkle', group: 'Stylized', values: { coreSize: 26, glow: 0.5, glowSize: 90, glowFalloff: 3.5, rays: 4, rayRot: 0, rayLen: 1, rayWidth: 9, rayVar: 0, rayIntensity: 1, fine: 0, streak: 0, ring: 0.3, ringRadius: 60, ringWidth: 8, chroma: 0, ghosts: 0 } },
      { name: 'Cartoon sun', group: 'Stylized', values: { coreSize: 70, coreColor: '#fff6b0', glow: 0.6, glowSize: 180, glowColor: '#ffd23f', rays: 16, rayRot: 0, rayLen: 0.85, rayWidth: 20, rayVar: 0.3, rayIntensity: 0.55, rayColor: '#ffe060', fine: 0, streak: 0, ring: 0, ghosts: 0 } },
      { name: 'Muzzle / explosion glare', group: 'Game-inspired', values: { coreSize: 40, coreColor: '#fff0d0', glow: 1.2, glowSize: 260, glowFalloff: 2.2, glowColor: '#ff9a40', rays: 8, rayLen: 0.8, rayWidth: 8, rayIntensity: 0.6, rayColor: '#ffc080', fine: 100, fineIntensity: 0.25, streak: 0.3, streakColor: '#ffb070', ring: 0, ghosts: 0, output: 'alpha' } },
      { name: 'Tactical flashlight blind', group: 'Game-inspired', values: { coreSize: 40, glow: 1.4, glowSize: 380, glowFalloff: 1.6, glowColor: '#f0f4ff', rays: 6, rayLen: 1.2, rayWidth: 6, rayIntensity: 0.8, fine: 200, fineLen: 1, fineIntensity: 0.3, streak: 0.6, streakLen: 1.6, streakColor: '#c8dcff', ring: 0.2, ringRadius: 220, ghosts: 5, ghostIntensity: 0.2, dirt: 0.6, dirtRadius: 420, dirtColor: '#e8eeff' } },
      { name: 'Sniper scope glint', group: 'Game-inspired', values: { coreSize: 12, glow: 0.8, glowSize: 70, glowFalloff: 3, glowColor: '#fff8e8', rays: 4, rayRot: 0, rayLen: 0.6, rayWidth: 4, rayVar: 0, rayIntensity: 1, fine: 0, streak: 0.5, streakLen: 0.7, streakThick: 4, streakColor: '#ffffff', ring: 0, ghosts: 0 } },
      { name: 'Sci-fi blue anamorphic', group: 'Sci-fi', values: { coreColor: '#e0f4ff', coreSize: 18, glow: 0.7, glowColor: '#40a0ff', rays: 0, fine: 0, streak: 1.4, streakLen: 2, streakThick: 12, streakColor: '#2a7dff', ring: 0.25, ringRadius: 140, ringWidth: 10, chroma: 0.2, ghosts: 8, ghostShape: 'circle', ghostAngle: 0, ghostColor: 1, ghostIntensity: 0.22 } },
      { name: 'Plasma star', group: 'Sci-fi', values: { coreColor: '#ffe0ff', coreSize: 24, glow: 1, glowSize: 200, glowColor: '#c040ff', rays: 12, rayLen: 0.9, rayWidth: 6, rayIntensity: 0.7, rayColor: '#ff80ff', fine: 120, fineIntensity: 0.25, streak: 0.4, streakColor: '#ff60c0', ring: 0.3, ringRadius: 180, chroma: 1, ghosts: 4, ghostIntensity: 0.15 } },
      { name: 'Alien sun (green)', group: 'Sci-fi', values: { coreColor: '#f0ffe0', coreSize: 36, glow: 1, glowSize: 260, glowColor: '#7aff4a', rays: 9, rayLen: 0.8, rayIntensity: 0.5, rayColor: '#c8ff80', fine: 140, streak: 0.2, streakColor: '#80ffb0', ring: 0.25, ringRadius: 210, chroma: 0.7, ghosts: 6, ghostIntensity: 0.15, dirt: 0.3, dirtColor: '#d0ffb0' } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), k = S / 512, x = p.x * W, y = p.y * H, R = S / 2, B = p.bright;
      const r = U.rng(p.seed | 0);
      const L = U.canvas(W, H), c = L.getContext('2d');
      c.globalCompositeOperation = 'lighter';

      // lens dirt first (it sits behind everything else that is bright)
      if (p.dirt > 0) {
        const dr = p.dirtRadius * k, n = Math.round(260 * p.dirt);
        for (let i = 0; i < n; i++) {
          const a = r() * U.TAU, d = Math.sqrt(r()) * dr * 1.1, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
          const lit = Math.pow(U.clamp(1 - d / dr), 1.6), big = r() < 0.12;
          const sz = (big ? 10 + r() * 28 : 1.5 + r() * 5) * k;
          softDisc(c, px, py, sz, p.dirtColor, lit * (big ? 0.06 : 0.22) * p.dirt * B * (0.5 + r()), big ? 1.2 : 0.8);
        }
      }
      // bloom + core
      softDisc(c, x, y, p.glowSize * k, p.glowColor, p.glow * 0.8 * B, p.glowFalloff);
      // fine rays: many thin, faint, random
      for (let i = 0; i < p.fine; i++) {
        ray(c, x, y, r() * U.TAU, p.fineLen * R * (0.25 + r() * 0.75), Math.max(0.6, 1.2 * k * (0.5 + r())), p.rayColor, p.fineIntensity * B * (0.3 + r() * 0.7));
      }
      // main rays: evenly spaced diffraction spikes
      for (let i = 0; i < p.rays; i++) {
        const a = p.rayRot * RAD + (i / p.rays) * U.TAU + (r() - 0.5) * 0.04;
        const len = p.rayLen * R * (1 - r() * p.rayVar);
        ray(c, x, y, a, len, p.rayWidth * k, p.rayColor, p.rayIntensity * B);
        ray(c, x, y, a, len * 0.6, p.rayWidth * k * 0.35, '#ffffff', p.rayIntensity * B * 0.6); // hot center line
      }
      // anamorphic streak: a stretched soft ellipse plus a thin hot line
      if (p.streak > 0) {
        const len = p.streakLen * W * 0.5, th = p.streakThick * k;
        c.save();
        c.translate(x, y); c.rotate(p.streakAngle * RAD);
        for (const [sy, col, inten, fall] of [[th * 3, p.streakColor, 0.35, 1.5], [th, p.streakColor, 0.8, 1.2], [th * 0.25, '#ffffff', 0.7, 1.4]]) {
          c.save(); c.scale(len, sy);
          softDisc(c, 0, 0, 1, col, p.streak * inten * B, fall);
          c.restore();
        }
        c.restore();
      }
      // chromatic halo ring: red, green and blue rings drift apart
      if (p.ring > 0) {
        const rr = p.ringRadius * k, rw = p.ringWidth * k;
        const parts = p.chroma > 0 ? [['#ff3020', 1], ['#30ff40', 0], ['#3050ff', -1]] : [['#ffffff', 0]];
        for (const [col, o] of parts) {
          const rad = rr + o * p.chroma * rw * 0.6, r0 = Math.max(0, rad - rw / 2), r1 = rad + rw / 2;
          const g = c.createRadialGradient(x, y, r0, x, y, r1);
          const a = p.ring * B * (p.chroma > 0 ? 0.9 : 0.6);
          g.addColorStop(0, rgb(col, 0)); g.addColorStop(0.5, rgb(col, a)); g.addColorStop(1, rgb(col, 0));
          c.fillStyle = g;
          c.beginPath(); c.arc(x, y, r1, 0, U.TAU); c.arc(x, y, r0, 0, U.TAU, true); c.fill();
        }
      }
      // ghosts: aperture-shaped reflections along the flare axis, on both sides of the source
      if (p.ghosts > 0) {
        const ax = Math.cos(p.ghostAngle * RAD), ay = Math.sin(p.ghostAngle * RAD);
        const sides = { hex: 6, oct: 8, pent: 5 }[p.ghostShape] || 0, rot = r() * U.TAU;
        for (let i = 0; i < p.ghosts; i++) {
          const d = (r() * 2 - 1) * p.ghostSpread * R, gx = x + ax * d, gy = y + ay * d;
          const gs = p.ghostSize * k * (0.35 + r() * 1.3), tint = GHOST_TINTS[(r() * GHOST_TINTS.length) | 0];
          const col = '#' + U.hex(tint).map((v) => Math.round(U.lerp(255, v, p.ghostColor)).toString(16).padStart(2, '0')).join('');
          const inten = p.ghostIntensity * B * (0.4 + r() * 0.8);
          // flat disc with a slightly brighter rim, soft edge
          const g = c.createRadialGradient(gx, gy, 0, gx, gy, gs);
          g.addColorStop(0, rgb(col, inten * 0.45)); g.addColorStop(0.8, rgb(col, inten * 0.6)); g.addColorStop(0.93, rgb(col, inten)); g.addColorStop(1, rgb(col, 0));
          c.fillStyle = g;
          c.beginPath();
          if (sides) { const pts = []; for (let j = 0; j < sides; j++) { const a = rot + (j / sides) * U.TAU; pts.push([gx + Math.cos(a) * gs, gy + Math.sin(a) * gs]); } U.polyPath(c, pts, gs * 0.08); }
          else c.arc(gx, gy, gs, 0, U.TAU);
          c.fill();
        }
      }
      softDisc(c, x, y, p.coreSize * k * 2.2, p.coreColor, Math.min(1, B), 1.6);
      softDisc(c, x, y, p.coreSize * k, '#ffffff', Math.min(1, B), 0.7);

      /* edge fade: everything reaches zero just inside the border, so the sprite never touches the edge */
      c.globalCompositeOperation = 'destination-in';
      const ef = U.clamp(p.edgeFade, 0.02, 0.98), m = 0.01; // m: tiny always-empty margin
      if (p.edgeShape === 'rect') {
        for (const horiz of [true, false]) {
          const g = horiz ? c.createLinearGradient(0, 0, W, 0) : c.createLinearGradient(0, 0, 0, H);
          const a = m / 2, b = Math.min(0.5, (m + ef) / 2);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(a, 'rgba(0,0,0,0)');
          for (let i = 1; i <= 8; i++) { const t = i / 8; g.addColorStop(a + (b - a) * t, `rgba(0,0,0,${U.smoothstep(0, 1, t)})`); }
          g.addColorStop(1 - b, 'rgba(0,0,0,1)');
          for (let i = 7; i >= 0; i--) { const t = i / 8; g.addColorStop(1 - a - (b - a) * t, `rgba(0,0,0,${U.smoothstep(0, 1, t)})`); }
          g.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = g; c.fillRect(0, 0, W, H);
        }
      } else {
        // ellipse inscribed in the texture
        c.save();
        c.setTransform(W / 2, 0, 0, H / 2, W / 2, H / 2);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 1), r1 = 1 - m, r0 = Math.max(0, r1 - ef);
        g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(r0, 'rgba(0,0,0,1)');
        for (let i = 1; i <= 8; i++) { const t = i / 8; g.addColorStop(r0 + (r1 - r0) * t, `rgba(0,0,0,${1 - U.smoothstep(0, 1, t)})`); }
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(-1, -1, 2, 2);
        c.restore();
      }
      c.globalCompositeOperation = 'source-over';
      if (p.output !== 'alpha') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.drawImage(L, 0, 0); return; }
      // flatten onto black, then derive alpha from brightness
      const F = U.canvas(W, H), fc = F.getContext('2d');
      fc.fillStyle = '#000'; fc.fillRect(0, 0, W, H); fc.drawImage(L, 0, 0);
      // color + alpha: alpha = brightest channel, color un-premultiplied, so alpha blending looks like the additive version
      const img = fc.getImageData(0, 0, W, H), d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const a = Math.max(d[i], d[i + 1], d[i + 2]);
        if (a === 0) { d[i + 3] = 0; continue; }
        const f = 255 / a;
        d[i] *= f; d[i + 1] *= f; d[i + 2] *= f; d[i + 3] = a;
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
