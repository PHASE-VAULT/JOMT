/* Rainbow: sky rainbow sprites on a transparent background, for games and VFX.
     - geometry: an arc (or full ring) around a center that may sit below the image, so only the top
       of the circle shows; visible span with soft ends, or a full circle for halos / glories
     - colors: a smooth wavelength-like spectrum or custom color stops, optionally cut into hard bands
     - optics: secondary bow (reversed colors, ~1.3x radius, fainter), Alexander's dark band between the
       two, brighter sky inside the primary, faint supernumerary fringes inside the violet edge
     - breakup: soft band edges, glow, noise-modulated opacity (wisps through haze), ground fade
     - cartoon: outline, cloud puffs at the ends, pixel-art snapping
   Positions are fractions of the image; radius and pixel size scale with the width, so the preview and
   every export size look the same. Rendered straight into ImageData. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep } = U;
  const DEG = Math.PI / 180;
  const S_ = (pos, color, alpha = 1) => ({ pos, color, alpha });
  // one stop at the center of each of n equal bands: smooth gradient through them, or exact colors with hard bands
  const centered = (...cols) => cols.map((c, i) => S_(+((i + 0.5) / cols.length).toFixed(4), c));

  // wavelength-like spectrum, outer edge (red, t = 0) to inner edge (violet, t = 1); the 7 ROYGBIV colors
  // sit at the band centers, so 7 hard bands give clean cartoon colors
  const SPECTRUM = [S_(0, '#d4121c'), ...centered('#ff2a1f', '#ff8a1c', '#ffe53a', '#3fd65a', '#2f86ff', '#4b3cff', '#9b3df0'), S_(1, '#7426c8')];
  const PASTEL = centered('#ffb3c7', '#ffd6a8', '#fff3b0', '#c4f5c0', '#b8dcff', '#d9c2ff');
  const PRIDE = centered('#e40303', '#ff8c00', '#ffed00', '#008026', '#004dff', '#750787');
  const SYNTH = [S_(0, '#ff2fd6', 0), S_(0.15, '#ff2fd6'), S_(0.45, '#ff5f6d'), S_(0.7, '#a24bff'), S_(0.9, '#2fe6ff'), S_(1, '#2fe6ff', 0)];
  const HALO = [S_(0, '#dfe8ff', 0), S_(0.45, '#f4f6ff', 0.55), S_(0.78, '#ffe8b8', 0.9), S_(0.92, '#ff9e57'), S_(1, '#d65a2e')];
  const PIXEL = centered('#e83b3b', '#f79617', '#f9e231', '#5ac54f', '#3c9df0', '#7a4fd8');
  const FAIRY = [S_(0, '#ffd27a', 0.2), S_(0.25, '#ff8ad8'), S_(0.55, '#b48cff'), S_(0.8, '#5ff2d8'), S_(1, '#e8fff6', 0.3)];

  // cloud puff circles: [x, y, r] in cloud-size units, y down
  const PUFFS = [[0, 0, 0.62], [-0.62, 0.18, 0.46], [0.62, 0.18, 0.46], [-0.3, -0.3, 0.45], [0.32, -0.24, 0.5], [-1.05, 0.32, 0.32], [1.05, 0.32, 0.32]];

  const isArc = (p) => p.shape !== 'full';

  U.register({
    id: 'rainbow',
    name: 'Rainbow',
    desc: 'Rainbow sprites on transparent background: natural, double, fogbow, halo ring, cartoon and pixel bands',
    tags: ['VFX', 'Nature'],
    aspect: '2:1',
    normalMap: false, // a sky sprite, not a surface
    icon: U.icon('<path d="M3 18a9 9 0 0 1 18 0"/><path d="M6 18a6 6 0 0 1 12 0" opacity=".65"/><path d="M9 18a3 3 0 0 1 6 0" opacity=".35"/>'),
    params: [
      { type: 'section', label: 'Arc' },
      { key: 'shape', label: 'Shape', type: 'select', default: 'arc', options: [['arc', 'Arc'], ['full', 'Full circle (halo / glory)']] },
      { key: 'cx', label: 'Center X', type: 'range', min: -0.5, max: 1.5, step: 0.005, default: 0.5, tip: 'Fraction of the width' },
      { key: 'cy', label: 'Center Y', type: 'range', min: -0.5, max: 3, step: 0.005, default: 1, tip: 'Fraction of the height. 1 = bottom edge; larger puts the center below the image so only part of the arc shows' },
      { key: 'radius', label: 'Radius', type: 'range', min: 0.03, max: 1.5, step: 0.005, default: 0.42, tip: 'Outer (red) edge, as a fraction of the width' },
      { key: 'width', label: 'Band width', type: 'range', min: 0.02, max: 0.6, step: 0.005, default: 0.1, tip: 'Thickness of the color band, as a fraction of the radius' },
      { key: 'dir', label: 'Direction', type: 'range', min: -180, max: 180, step: 1, default: -90, show: isArc, tip: 'Angle of the middle of the visible arc. −90 = up, 0 = right' },
      { key: 'span', label: 'Visible span', type: 'range', min: 5, max: 340, step: 1, default: 180, show: isArc, tip: 'How many degrees of the circle are drawn' },
      { key: 'endFade', label: 'End fade', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: isArc, tip: 'Soft fade-out at both ends of the arc. 0 = cut off' },

      { type: 'section', label: 'Colors' },
      { key: 'palette', label: 'Palette', type: 'select', default: 'spectrum', options: [['spectrum', 'Spectrum (natural)'], ['custom', 'Custom color stops']] },
      {
        key: 'stops', label: 'Stops', type: 'list', itemLabel: 'Stop', max: 12, show: (p) => p.palette === 'custom',
        itemSummary: (s) => `${(+s.pos).toFixed(2)} · ${s.color}${s.alpha < 1 ? ' · ' + Math.round(s.alpha * 100) + '%' : ''}`,
        default: centered('#ff2a1f', '#ff8a1c', '#ffe53a', '#3fd65a', '#2f86ff', '#9b3df0'),
        item: [
          { key: 'pos', label: 'Position', type: 'range', min: 0, max: 1, step: 0.005, default: 0.5, tip: '0 = outer edge, 1 = inner edge' },
          { key: 'color', label: 'Color', type: 'color', default: '#ffffff' },
          { key: 'alpha', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
        ],
      },
      { key: 'bands', label: 'Hard bands (0 = smooth)', type: 'int', min: 0, max: 16, default: 0, tip: 'Cuts the colors into n flat bands; each band takes the color at its center' },
      { key: 'reverse', label: 'Reverse colors', type: 'bool', default: false, tip: 'Red on the inside, as in a sun halo' },
      { key: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.85 },
      { key: 'brightness', label: 'Brightness', type: 'range', min: 0.2, max: 2, step: 0.01, default: 1 },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75 },

      { type: 'section', label: 'Optics', active: (p) => p.secondary > 0 || p.alex > 0 || p.innerSky > 0 || p.supernum > 0 },
      { key: 'secondary', label: 'Secondary rainbow', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Outer bow with reversed colors, fainter and wider' },
      { key: 'secRadius', label: 'Secondary radius', type: 'range', min: 1.1, max: 1.8, step: 0.01, default: 1.3, show: (p) => p.secondary > 0, tip: 'Relative to the primary radius (real: about 1.3)' },
      { key: 'alex', label: "Alexander's dark band", type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Darker sky between the primary and the secondary bow' },
      { key: 'alexColor', label: 'Dark band color', type: 'color', default: '#0b1424', show: (p) => p.alex > 0 },
      { key: 'innerSky', label: 'Bright inner sky', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'The sky inside the primary bow is lighter' },
      { key: 'supernum', label: 'Supernumerary fringes', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Faint pink / green fringes just inside the violet edge' },

      { type: 'section', label: 'Softness', active: (p) => p.softness > 0 || p.glow > 0 || p.noise > 0 || p.groundFade > 0 },
      { key: 'softness', label: 'Edge softness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: '0 = crisp band edges, 1 = fully blurred' },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Soft colored light around the band' },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 0.1, max: 3, step: 0.01, default: 0.6, show: (p) => p.glow > 0, tip: 'In band widths' },
      { key: 'noise', label: 'Noise breakup', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Wispy fades, as if seen through haze or clouds' },
      { key: 'noiseScale', label: 'Noise scale', type: 'range', min: 0.5, max: 20, step: 0.1, default: 4, show: (p) => p.noise > 0, tip: 'Wisps across the short side' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },
      { key: 'groundFade', label: 'Ground fade', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Fades out toward the bottom of the image (the feet of the bow). Fraction of the height' },
      { key: 'edgeFade', label: 'Border fade', type: 'range', min: 0, max: 0.3, step: 0.005, default: 0.03, tip: 'Fades out toward the image border so the sprite never shows an edge' },

      { type: 'section', label: 'Cartoon', active: (p) => p.outline > 0 || (p.clouds && isArc(p)) || p.pixel > 0 },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0, tip: 'Outline around the band (and clouds), in band widths' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#ffffff', show: (p) => p.outline > 0 },
      { key: 'clouds', label: 'Cloud puffs at the ends', type: 'bool', default: false, show: isArc },
      { key: 'cloudSize', label: 'Cloud size', type: 'range', min: 0.5, max: 4, step: 0.01, default: 1, show: (p) => p.clouds && isArc(p), tip: 'In band widths' },
      { key: 'cloudColor', label: 'Cloud color', type: 'color', default: '#ffffff', show: (p) => p.clouds && isArc(p) },
      { key: 'cloudShade', label: 'Cloud shade', type: 'color', default: '#c9d5e8', show: (p) => p.clouds && isArc(p) },
      { key: 'pixel', label: 'Pixel size (0 = off)', type: 'range', min: 0, max: 32, step: 0.5, default: 0, tip: 'Pixel-art look: snaps everything to blocks of this size (px at 512 wide)' },
    ],
    presets: [
      // Realistic
      { name: 'Natural rainbow', group: 'Realistic', values: { noise: 0.3, innerSky: 0.15 } },
      { name: 'Double rainbow', group: 'Realistic', values: { radius: 0.32, width: 0.09, secondary: 0.45, alex: 0.3, innerSky: 0.2, supernum: 0.35, noise: 0.25 } },
      { name: 'Faint misty rainbow', group: 'Realistic', values: { opacity: 0.45, saturation: 0.6, softness: 0.9, glow: 0.3, glowSize: 1, noise: 0.65, noiseScale: 3, groundFade: 0.5 } },
      { name: 'Rainbow fragment', group: 'Realistic', values: { cx: 0, cy: 2, radius: 1, width: 0.07, dir: -52, span: 40, endFade: 0.7, noise: 0.45, noiseScale: 3, groundFade: 0.2 } },
      { name: 'Fogbow', group: 'Realistic', values: { radius: 0.4, width: 0.3, saturation: 0.14, brightness: 1.1, opacity: 0.6, softness: 1, glow: 0.35, glowSize: 1, noise: 0.35, noiseScale: 3 } },
      { name: 'Sun halo (22° ring)', group: 'Realistic', values: { shape: 'full', cy: 0.5, radius: 0.21, width: 0.3, palette: 'custom', stops: HALO, saturation: 0.9, opacity: 0.85, softness: 0.4, glow: 0, noise: 0.2, noiseScale: 3, groundFade: 0, edgeFade: 0.05 } },
      { name: 'Moonbow', group: 'Realistic', values: { saturation: 0.3, brightness: 0.9, opacity: 0.45, softness: 0.8, glow: 0.2, noise: 0.35 } },
      // Stylized
      { name: 'Cartoon 7-band', group: 'Stylized', values: { cy: 0.76, radius: 0.32, width: 0.36, bands: 7, saturation: 1, opacity: 1, softness: 0, glow: 0, endFade: 0, noise: 0, groundFade: 0, edgeFade: 0, outline: 0.12, clouds: true, cloudSize: 0.95 } },
      { name: 'Pastel kawaii', group: 'Stylized', values: { cy: 0.76, radius: 0.32, width: 0.4, palette: 'custom', stops: PASTEL, bands: 6, saturation: 1, opacity: 1, softness: 0, glow: 0, endFade: 0, noise: 0, groundFade: 0, edgeFade: 0, outline: 0.1, outlineColor: '#ffffff', clouds: true, cloudSize: 0.95, cloudShade: '#ffd3ea' } },
      { name: 'Pride bands', group: 'Stylized', values: { cy: 1, radius: 0.46, width: 0.42, palette: 'custom', stops: PRIDE, bands: 6, saturation: 1, opacity: 1, softness: 0, glow: 0, endFade: 0, noise: 0, groundFade: 0, edgeFade: 0 } },
      { name: 'Pixel-art rainbow', group: 'Stylized', values: { cy: 0.76, radius: 0.32, width: 0.36, palette: 'custom', stops: PIXEL, bands: 6, saturation: 1, opacity: 1, softness: 0, glow: 0, endFade: 0, noise: 0, groundFade: 0, edgeFade: 0, outline: 0.1, outlineColor: '#1d1d2b', clouds: true, cloudSize: 0.95, cloudShade: '#a9b8d4', pixel: 8 } },
      // Fantasy
      { name: 'Neon synthwave arc', group: 'Fantasy', values: { radius: 0.4, width: 0.12, palette: 'custom', stops: SYNTH, saturation: 1.2, brightness: 1.25, opacity: 1, softness: 0.25, glow: 0.7, glowSize: 1.6, noise: 0, groundFade: 0.3, endFade: 0.1, secondary: 0.35, secRadius: 1.18 } },
      { name: 'Glory ring', group: 'Fantasy', values: { shape: 'full', cy: 0.5, radius: 0.14, width: 0.35, saturation: 1, opacity: 0.8, softness: 0.7, glow: 0.25, glowSize: 0.8, supernum: 0.8, innerSky: 0.5, noise: 0.1, groundFade: 0, edgeFade: 0.05 } },
      { name: 'Fairy bow', group: 'Fantasy', values: { radius: 0.4, width: 0.16, palette: 'custom', stops: FAIRY, saturation: 1.1, brightness: 1.15, opacity: 0.85, softness: 0.7, glow: 0.6, glowSize: 1.4, noise: 0.55, noiseScale: 6, innerSky: 0.25, endFade: 0.4 } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), seed = p.seed | 0, full = !isArc(p);
      const cx = p.cx * W, cy = p.cy * H;
      const R = Math.max(1, p.radius * W), w = Math.max(0.5, p.width * R);
      const secA = p.secondary > 0 ? p.secondary * 0.7 : 0, R2 = R * p.secRadius, w2 = w * p.secRadius * 1.25;
      const cell = p.pixel > 0 ? Math.max(1, (p.pixel * W) / 512) : 0;
      const aa = cell ? 1e-3 : 1; // antialias width in px (pixel art stays crisp)
      const op = p.opacity, reverse = !!p.reverse, glow = p.glow, glowSize = p.glowSize;
      const innerSky = p.innerSky, alex = p.alex, supernum = p.supernum, outline = p.outline;

      /* color lookup: 256 entries, saturation + brightness applied. Desaturating moves toward the
         brightest channel, so low saturation gives pale / white bows (fogbow, moonbow) instead of grey */
      const src = p.palette === 'custom' && p.stops && p.stops.length ? p.stops : SPECTRUM;
      const raw = U.ramp(src.slice().sort((a, b) => a.pos - b.pos).map((s) => [s.pos, s.color, s.alpha == null ? 1 : s.alpha]));
      const lut = new Float32Array(1024), sat = p.saturation, bri = p.brightness;
      for (let i = 0; i < 1024; i += 4) {
        const r = raw[i], g = raw[i + 1], b = raw[i + 2], l = Math.max(r, g, b) * 0.8 + (r * 0.299 + g * 0.587 + b * 0.114) * 0.2;
        lut[i] = clamp((l + (r - l) * sat) * bri, 0, 255);
        lut[i + 1] = clamp((l + (g - l) * sat) * bri, 0, 255);
        lut[i + 2] = clamp((l + (b - l) * sat) * bri, 0, 255);
        lut[i + 3] = raw[i + 3] / 255;
      }
      const nb = p.bands | 0;
      const bandJ = (k) => ((((k + 0.5) / nb) * 255 + 0.5) | 0) * 4;
      // band color at t (0 = outer edge, 1 = inner edge) into C; returns the stop alpha. aaT: antialias width in t units
      const C = new Float64Array(3);
      function colorAt(t, aaT) {
        if (reverse) t = 1 - t;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (nb < 2) {
          const j = ((t * 255 + 0.5) | 0) * 4;
          C[0] = lut[j]; C[1] = lut[j + 1]; C[2] = lut[j + 2];
          return lut[j + 3];
        }
        const f = t * nb, k = Math.min(nb - 1, f | 0), fr = f - k, h = aaT * nb * 0.5;
        let j = bandJ(k);
        C[0] = lut[j]; C[1] = lut[j + 1]; C[2] = lut[j + 2];
        let a = lut[j + 3];
        if (h > 0) { // blend across the hard band boundary over ~1 px
          let k2 = -1, m = 0;
          if (fr > 1 - h && k < nb - 1) { k2 = k + 1; m = (fr - (1 - h)) / (2 * h); }
          else if (fr < h && k > 0) { k2 = k - 1; m = (h - fr) / (2 * h); }
          if (k2 >= 0) {
            j = bandJ(k2);
            C[0] += (lut[j] - C[0]) * m; C[1] += (lut[j + 1] - C[1]) * m; C[2] += (lut[j + 2] - C[2]) * m; a += (lut[j + 3] - a) * m;
          }
        }
        return a;
      }
      // smooth 0..1 step without argument defaults (hot path)
      const ss = (e0, e1, x) => { let t = (x - e0) / (e1 - e0); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
      // band coverage at t with soft edges; e = edge half-width in t units
      const cover = (t, e) => ss(-e, e, t) * ss(-e, e, 1 - t);
      const glowAt = (t) => {
        if (glow <= 0) return 0;
        const q = (t < 0 ? -t : t > 1 ? t - 1 : 0) / glowSize;
        return q > 2.2 ? 0 : glow * Math.exp(-q * q);
      };

      /* noise breakup: sampled on a coarse grid (stretched along the arc), interpolated */
      const noise = p.noise;
      let ng = null, nst = 1, ngw = 0;
      if (noise > 0) {
        nst = Math.max(1, S / 200); ngw = Math.ceil(W / nst) + 2;
        const gh = Math.ceil(H / nst) + 2;
        ng = new Float32Array(ngw * gh);
        const k = p.noiseScale / S, dR = p.dir * DEG, Rm = R - w / 2;
        for (let j = 0; j < gh; j++) for (let i = 0; i < ngw; i++) {
          const x = i * nst, y = j * nst;
          let u, v;
          if (full) { u = x * k; v = y * k; }
          else {
            const dx = x - cx, dy = y - cy;
            let da = Math.atan2(dy, dx) - dR;
            da -= Math.round(da / U.TAU) * U.TAU;
            u = da * Rm * k * 0.45; v = (Math.hypot(dx, dy) - Rm) * k * 1.8; // wisps run along the arc
          }
          ng[j * ngw + i] = 1 - noise * (1 - smoothstep(0.32, 0.68, U.fractal('perlin', u, v, 0, 0, 4, 0.5, 'fbm', seed + 11)));
        }
      }

      /* cloud puffs at both arc ends (upright, centered on the band), one bounding box per end */
      const clouds = [];
      if (p.clouds && !full) {
        const cs = p.cloudSize * w, Rm = R - w / 2, rng = U.rng(seed + 5), ow = outline * w + 2;
        for (const s of [-1, 1]) {
          const a = (p.dir + (s * p.span) / 2) * DEG, ex = cx + Math.cos(a) * Rm, ey = cy + Math.sin(a) * Rm + cs * 0.12;
          const pf = PUFFS.map(([px, py, pr]) => [ex + (px * s + (rng() - 0.5) * 0.12) * cs, ey + (py + (rng() - 0.5) * 0.1) * cs, pr * (0.88 + rng() * 0.24) * cs]);
          const bb = [Infinity, Infinity, -Infinity, -Infinity];
          for (const c of pf) {
            bb[0] = Math.min(bb[0], c[0] - c[2] - ow); bb[2] = Math.max(bb[2], c[0] + c[2] + ow);
            bb[1] = Math.min(bb[1], c[1] - c[2] - ow); bb[3] = Math.max(bb[3], c[1] + c[2] + ow);
          }
          clouds.push({ pf, bb, ey, cs });
        }
      }

      /* radial extent of everything drawn around the center (quick reject) */
      const soft = p.softness * 0.45, ext = Math.max(glow > 0 ? glowSize * 2.2 : 0, soft, outline) + 0.05;
      let rMax = R + w * ext + 2, rMin = R - w - w * Math.max(ext, supernum > 0 ? 3.2 : 0) - 2;
      if (secA > 0) rMax = Math.max(rMax, R2 + w2 * ext + 2);
      if (alex > 0) rMax = Math.max(rMax, R2);
      if (innerSky > 0) rMin = Math.min(rMin, R * 0.2);
      const rMin2 = rMin > 0 ? rMin * rMin : 0, rMax2 = rMax * rMax;
      const half = (p.span / 2) * DEG, dirR = p.dir * DEG, endF = p.endFade * half, TAU = U.TAU, PI = Math.PI;
      const cAlex = U.hex(p.alexColor), cOut = U.hex(p.outlineColor), cCloud = U.hex(p.cloudColor), cShade = U.hex(p.cloudShade);
      const ef = p.edgeFade * S, gf = p.groundFade * H;
      const aaP = aa / w, aaS = aa / w2, eP = Math.max(soft, aaP * 0.5), eS = Math.max(soft, aaS * 0.5);
      const oW = 1 + 2 * outline, Ro2 = R2 - w2;

      const img = ctx.createImageData(W, H), d = img.data;
      const A = new Float64Array(4); // premultiplied accumulator r, g, b, a ("over" compositing, bottom to top)
      const over = (r, g, b, a) => {
        if (a <= 0) return;
        if (a > 1) a = 1;
        const k = 1 - a;
        A[0] = r * a + A[0] * k; A[1] = g * a + A[1] * k; A[2] = b * a + A[2] * k; A[3] = a + A[3] * k;
      };

      for (let y = 0; y < H; y++) {
        const Y = cell ? (Math.floor(y / cell) + 0.5) * cell : y + 0.5, dy = Y - cy;
        const ground = gf > 0 ? ss(0, gf, H - Y) : 1;
        for (let x = 0; x < W; x++) {
          const X = cell ? (Math.floor(x / cell) + 0.5) * cell : x + 0.5;
          const dx = X - cx, r2 = dx * dx + dy * dy;
          const inRing = r2 >= rMin2 && r2 <= rMax2;
          let cl = null;
          for (let c = 0; c < clouds.length; c++) { const b = clouds[c].bb; if (X >= b[0] && X <= b[2] && Y >= b[1] && Y <= b[3]) { cl = clouds[c]; break; } }
          if (!inRing && !cl) continue;
          // border fade (applies to everything)
          let edge = 1;
          if (ef > 0) { edge = ss(0, ef, Math.min(X, W - X, Y, H - Y)); if (edge <= 0) continue; }
          A[0] = A[1] = A[2] = A[3] = 0;

          if (inRing) {
            const r = Math.sqrt(r2);
            // common mask: arc ends, ground, noise, border
            let M = edge * ground;
            if (!full && M > 0) {
              let da = Math.atan2(dy, dx) - dirR;
              if (da > PI) da -= TAU; else if (da < -PI) da += TAU;
              const e = (half - Math.abs(da)) * r, fw = endF * r;
              M *= fw > aa ? ss(0, fw, e) : clamp(e / aa + 0.5);
            }
            if (M > 0 && ng) {
              const fx = X / nst, fy = Y / nst, i = fx | 0, j = fy | 0, tx = fx - i, ty = fy - j, o = j * ngw + i;
              const a = ng[o] + (ng[o + 1] - ng[o]) * tx, b = ng[o + ngw] + (ng[o + ngw + 1] - ng[o + ngw]) * tx;
              M *= a + (b - a) * ty;
            }
            if (M > 0.002) {
              const t1 = (R - r) / w;
              // bright inner sky
              if (innerSky > 0 && r < R) {
                const a = innerSky * 0.4 * ss(R * 0.2, R - w, r) * (1 - ss(R - w * 1.1, R - w * 0.3, r));
                over(255, 255, 255, a * M * op);
              }
              // Alexander's dark band between the bows
              if (alex > 0 && r > R - w * 0.3 && r < Ro2 + w2 * 0.2) {
                const a = alex * 0.42 * ss(R - w * 0.3, R + w * 0.6, r) * (1 - ss(Ro2 - w2 * 0.6, Ro2 + w2 * 0.2, r));
                over(cAlex[0], cAlex[1], cAlex[2], a * M);
              }
              // secondary bow (reversed colors)
              if (secA > 0) {
                const t2 = (R2 - r) / w2;
                if (t2 > -ext && t2 < 1 + ext) {
                  const ca = colorAt(1 - t2, aaS), cv = cover(t2, eS), gl = glowAt(t2);
                  over(C[0], C[1], C[2], (cv + gl * (1 - cv)) * ca * secA * op * M);
                }
              }
              if (t1 > -ext && t1 < 1 + ext) {
                // outline under the primary band
                if (outline > 0) over(cOut[0], cOut[1], cOut[2], cover((t1 + outline) / oW, eP / oW) * op * M);
                // primary bow
                const ca = colorAt(t1, aaP), cv = cover(t1, eP), gl = glowAt(t1);
                over(C[0], C[1], C[2], (cv + gl * (1 - cv)) * ca * op * M);
              }
              // supernumerary fringes just inside the violet edge: alternating pink / green
              if (supernum > 0 && t1 > 1 && t1 < 4.2) {
                const dd = t1 - 1, per = 0.42, s = Math.sin((PI * dd) / per);
                const a = supernum * 0.75 * Math.exp(-dd * 0.85) * s * s * op * M;
                if (((dd / per) | 0) % 2 === 0) over(220, 140, 255, a);
                else over(140, 240, 165, a);
              }
            }
          }

          // cloud puffs on top (not affected by noise / ground fade)
          if (cl) {
            let sd = Infinity;
            const pf = cl.pf;
            for (let i = 0; i < pf.length; i++) {
              const c = pf[i], ux = X - c[0], uy = Y - c[1], v = Math.sqrt(ux * ux + uy * uy) - c[2];
              if (v < sd) sd = v;
            }
            if (outline > 0) over(cOut[0], cOut[1], cOut[2], clamp(0.5 - (sd - outline * w) / aa) * edge);
            const a = clamp(0.5 - sd / aa) * edge;
            if (a > 0) { // shaded underside
              const sh = ss(-0.15, 0.6, (Y - cl.ey) / cl.cs) * 0.85;
              over(cCloud[0] + (cShade[0] - cCloud[0]) * sh, cCloud[1] + (cShade[1] - cCloud[1]) * sh, cCloud[2] + (cShade[2] - cCloud[2]) * sh, a);
            }
          }

          const pa = A[3];
          if (pa > 0) {
            const i4 = (y * W + x) * 4;
            d[i4] = A[0] / pa; d[i4 + 1] = A[1] / pa; d[i4 + 2] = A[2] / pa; d[i4 + 3] = pa * 255;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
