/* Sand: tileable sand ground. A mottled base with round grains (Worley cells), dark mineral grains and
   glinting quartz; broad dune undulation and wind ripples (an asymmetric wave with an integer wave vector,
   so it stays periodic, warped and broken up by noise; sharpness = how steep the lee side is); scattered
   shell fragments and the odd pebble; wet patches. Height in short-side units, lit by js/ground.js
   (shadows, cavity occlusion, wet gloss, toon). Output: lit color, flat albedo or height map. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const RAD = Math.PI / 180;

  // nearest jittered feature point of a periodic cell grid: offset to it (cell units) and its integer key
  const CP = { dx: 0, dy: 0, k: 0 };
  function cellPt(x, y, px, py, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let bd = 1e9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j; // periods are whole numbers: one % per axis wraps exactly
      let wx = cx % px; if (wx < 0) wx += px;
      let wy = cy % py; if (wy < 0) wy += py;
      const dx = x - (cx + U.hash(wx, wy, s)), dy = y - (cy + U.hash(wx, wy, s + 7919)), dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; CP.dx = dx; CP.dy = dy; CP.k = wx * 7919 + wy; }
    }
    return CP;
  }

  const LOOKS = {
    beach: { sand: '#d9c59c', sand2: '#c4aa7c', speckColor: '#4e4236' },
    desert: { sand: '#e2b57c', sand2: '#c9935a', speckColor: '#6e4226' },
    quartz: { sand: '#f0ece2', sand2: '#e0d8c8', speckColor: '#9a9284' },
    red: { sand: '#c8703c', sand2: '#a85428', speckColor: '#4a2010' },
    volcanic: { sand: '#3a3634', sand2: '#2a2725', speckColor: '#a29a92' },
    silt: { sand: '#9a8a6e', sand2: '#7e7058', speckColor: '#3a3226' },
  };

  U.register({
    id: 'sand',
    name: 'Sand',
    desc: 'Tileable sand with grains, sparkle, dunes, wind ripples, shell fragments, pebbles, wet patches and height map',
    uses: ['Ground materials for beaches, deserts, dunes, seabeds and sandboxes on terrain and level geometry, with a height map for the normal map mode.', 'Top-down sand tiles for 2D and isometric games and backgrounds.'],
    tags: ['PBR', 'Nature'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9c3-2 6 2 9 0s6-2 9 0M3 15c3-2 6 2 9 0s6-2 9 0" opacity=".7"/><circle cx="7" cy="12" r=".6" fill="currentColor"/><circle cx="16" cy="18" r=".6" fill="currentColor"/><circle cx="14" cy="6" r=".6" fill="currentColor"/>'),
    params: [
      { type: 'section', label: 'Sand' },
      { key: 'look', label: 'Look', type: 'select', default: 'beach', options: [['beach', 'Beach sand'], ['desert', 'Desert sand'], ['quartz', 'White quartz sand'], ['red', 'Red desert sand'], ['volcanic', 'Volcanic'], ['silt', 'River silt'], ['custom', 'Custom']],
        apply: (v, p) => { const s = LOOKS[v]; if (s) Object.assign(p, s); } },
      { key: 'sand', label: 'Sand color', type: 'color', default: LOOKS.beach.sand },
      { key: 'sand2', label: 'Second color', type: 'color', default: LOOKS.beach.sand2, tip: 'Mottling blends toward this color' },
      { key: 'mottle', label: 'Mottling', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { key: 'mottleScale', label: 'Mottle scale', type: 'int', min: 1, max: 16, default: 4 },
      { key: 'grain', label: 'Sand grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55 },
      { key: 'grainScale', label: 'Grain scale', type: 'int', min: 40, max: 400, default: 160, tip: 'Sand grains across the short side' },
      { key: 'speckle', label: 'Dark grains', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'speckColor', label: 'Grain color', type: 'color', default: LOOKS.beach.speckColor, show: (p) => p.speckle > 0 },
      { key: 'sparkle', label: 'Sparkle', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Glinting quartz grains (lit output only)' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 12 },
      { type: 'section', label: 'Ripples' },
      { key: 'ripples', label: 'Wind ripples', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'rippleCount', label: 'Ripples across', type: 'int', min: 2, max: 60, default: 14, show: (p) => p.ripples > 0 },
      { key: 'rippleAngle', label: 'Ripple direction', type: 'range', min: -90, max: 90, step: 1, default: 15, show: (p) => p.ripples > 0, tip: 'Snapped slightly so the ripples still tile' },
      { key: 'rippleSharp', label: 'Sharpness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.ripples > 0, tip: '0 = soft symmetric waves, 1 = gentle windward side and a steep lee' },
      { key: 'rippleWarp', label: 'Waviness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.ripples > 0 },
      { key: 'rippleBreak', label: 'Break-up', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.ripples > 0, tip: 'Fades the ripples out in patches' },
      { type: 'section', label: 'Dunes' },
      { key: 'dunes', label: 'Dune relief', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Broad hills and hollows under the ripples' },
      { key: 'duneScale', label: 'Dunes across', type: 'int', min: 1, max: 8, default: 2, show: (p) => p.dunes > 0 },
      { type: 'section', label: 'Details', active: (p) => p.shells > 0 || p.pebbles > 0 || p.wetPatches > 0 },
      { key: 'shells', label: 'Shell fragments', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15 },
      { key: 'shellColor', label: 'Shell color', type: 'color', default: '#f2eadc', show: (p) => p.shells > 0 },
      { key: 'pebbles', label: 'Pebbles', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: 'pebbleColor', label: 'Pebble color', type: 'color', default: '#8a8074', show: (p) => p.pebbles > 0 },
      { key: 'detailScale', label: 'Detail size', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1, show: (p) => p.shells > 0 || p.pebbles > 0 },
      { key: 'wetPatches', label: 'Wet patches', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Darker, glossy patches of damp sand' },
      { key: 'wetScale', label: 'Wet patch scale', type: 'int', min: 1, max: 10, default: 3, show: (p) => p.wetPatches > 0 },
      ...U.groundLightParams({ shadow: 0.45, ao: 0.4, relief: 0.8, aoTip: 'Darkens the hollows and the gaps around shells and pebbles' }),
    ],
    presets: [
      { name: 'Beach sand', group: 'Realistic', values: {} },
      { name: 'Fine beach sand', group: 'Realistic', values: { ripples: 0, dunes: 0.1, shells: 0.05, pebbles: 0, grain: 0.6, speckle: 0.35, sparkle: 0.25 } },
      { name: 'Wet beach sand', group: 'Realistic', values: { ripples: 0.35, rippleCount: 10, rippleBreak: 0.6, wetPatches: 0.8, wetScale: 3, sparkle: 0.05, shells: 0.25, pebbles: 0.15 } },
      { name: 'Tidal flat', group: 'Realistic', values: { look: 'silt', ...LOOKS.silt, ripples: 0.75, rippleCount: 18, rippleSharp: 0.2, rippleWarp: 0.6, rippleBreak: 0.2, wet: 0.7, shells: 0.2, sparkle: 0 } },
      { name: 'Desert dunes', group: 'Realistic', values: { look: 'desert', ...LOOKS.desert, ripples: 0.85, rippleCount: 16, rippleAngle: 25, rippleSharp: 0.8, rippleWarp: 0.45, rippleBreak: 0.25, dunes: 0.6, grain: 0.4, speckle: 0.15, shells: 0, pebbles: 0, lightHeight: 30 } },
      { name: 'Flat desert sand', group: 'Realistic', values: { look: 'desert', ...LOOKS.desert, ripples: 0.15, rippleBreak: 0.7, dunes: 0.2, shells: 0, pebbles: 0.2, pebbleColor: '#9a6a44' } },
      { name: 'Red desert', group: 'Realistic', values: { look: 'red', ...LOOKS.red, ripples: 0.6, rippleCount: 12, rippleSharp: 0.7, dunes: 0.45, shells: 0, pebbles: 0.15, pebbleColor: '#6a3018', sparkle: 0.05 } },
      { name: 'White quartz beach', group: 'Realistic', values: { look: 'quartz', ...LOOKS.quartz, ripples: 0.1, sparkle: 0.7, speckle: 0.15, shells: 0.3, shellColor: '#f8d8c8', pebbles: 0 } },
      { name: 'Volcanic black sand', group: 'Realistic', values: { look: 'volcanic', ...LOOKS.volcanic, sparkle: 0.4, speckle: 0.25, shells: 0, pebbles: 0.3, pebbleColor: '#2a2624', ripples: 0.2 } },
      { name: 'Seabed sand', group: 'Realistic', values: { look: 'custom', sand: '#b8a888', sand2: '#9c8c6c', ripples: 0.9, rippleCount: 10, rippleSharp: 0.15, rippleWarp: 0.55, rippleBreak: 0.15, shells: 0.35, pebbles: 0.1, wet: 0.4, sparkle: 0 } },
      { name: 'River silt', group: 'Realistic', values: { look: 'silt', ...LOOKS.silt, grain: 0.3, grainScale: 260, ripples: 0.4, rippleCount: 22, rippleSharp: 0.3, wetPatches: 0.5, shells: 0, pebbles: 0.2 } },
      { name: 'Sandbox', group: 'Realistic', values: { look: 'custom', sand: '#d8c098', sand2: '#bea47a', ripples: 0, dunes: 0.35, duneScale: 4, shells: 0, pebbles: 0.05, wetPatches: 0.35, wetScale: 5 } },
      { name: 'Zen garden (raked)', group: 'Stylized', values: { look: 'custom', sand: '#e6e2d8', sand2: '#d6d0c2', speckColor: '#8a867c', ripples: 1, rippleCount: 22, rippleAngle: 90, rippleSharp: 0, rippleWarp: 0.08, rippleBreak: 0, dunes: 0, shells: 0, pebbles: 0, grain: 0.45, speckle: 0.2, sparkle: 0, mottle: 0.2 } },
      { name: 'Toon sand', group: 'Stylized', values: { style: 'toon', look: 'custom', sand: '#f2d08a', sand2: '#e8bf72', grain: 0.1, speckle: 0.1, sparkle: 0, mottle: 0.25, ripples: 0.5, rippleCount: 8, rippleBreak: 0.5, shells: 0.2, pebbles: 0.15, ao: 0.2 } },
      { name: 'Hand-painted sand', group: 'Stylized', values: { look: 'custom', sand: '#d8b888', sand2: '#b8946a', grain: 0.15, speckle: 0.15, sparkle: 0, mottle: 0.85, mottleScale: 3, ripples: 0.25, dunes: 0.3, relief: 0.9, ao: 0.6 } },
      { name: 'Mars sand', group: 'Sci-fi', values: { look: 'custom', sand: '#b4613a', sand2: '#94482a', speckColor: '#4a2014', ripples: 0.55, rippleCount: 9, rippleSharp: 0.75, rippleBreak: 0.5, dunes: 0.4, shells: 0, pebbles: 0.3, pebbleColor: '#5e3020', sparkle: 0, lightHeight: 30 } },
      { name: 'Alien crystal sand', group: 'Sci-fi', values: { look: 'custom', sand: '#3a2a5a', sand2: '#2a1e44', speckColor: '#8ae0ff', speckle: 0.45, sparkle: 0.9, ripples: 0.4, shells: 0.3, shellColor: '#9a7ae0', pebbles: 0.2, pebbleColor: '#6a4aa8' } },
    ],
    render(ctx, W, H, p, opts) {
      const S = Math.min(W, H), N = W * H, seed = p.seed | 0;
      const per = (f) => [Math.max(1, Math.round((f * W) / S)), Math.max(1, Math.round((f * H) / S))];
      const [mpx, mpy] = per(p.mottleScale), [gpx, gpy] = per(p.grainScale), [wpx, wpy] = per(3), [dpx, dpy] = per(p.duneScale);
      const [spx, spy] = per(Math.max(4, Math.round(36 / p.detailScale))), [ppx, ppy] = per(Math.max(3, Math.round(22 / p.detailScale))), [epx, epy] = per(p.wetScale);
      const sand = U.hex(p.sand), sand2 = U.hex(p.sand2), speck = U.hex(p.speckColor), shellC = U.hex(p.shellColor), pebC = U.hex(p.pebbleColor);
      const lit = p.output === 'lit' && !(opts && opts.height);
      const ra = p.rippleAngle * RAD;
      let kx = Math.round(p.rippleCount * (W / S) * Math.cos(ra)), ky = Math.round(p.rippleCount * (H / S) * Math.sin(ra));
      if (!kx && !ky) kx = 1;
      const ripA = (p.ripples * 0.09) / p.rippleCount, crest = lerp(0.5, 0.88, p.rippleSharp);
      const grainH = (p.grain * 0.25) / p.grainScale, duneA = p.dunes * 0.05 / p.duneScale;
      const Hf = new Float32Array(N), wetMap = p.wetPatches > 0 ? new Float32Array(N) : null, flags = new Uint8Array(N);
      const img = ctx.createImageData(W, H), d = img.data;
      for (let y = 0, i = 0; y < H; y++) {
        const v = (y + 0.5) / H;
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W, o = i * 4;
          const m = U.fractal('perlin', u * mpx, v * mpy, mpx, mpy, 4, 0.5, 'fbm', seed + 1), mt = clamp(0.5 + (m - 0.5) * 2 * p.mottle);
          let r = lerp(sand[0], sand2[0], mt), g = lerp(sand[1], sand2[1], mt), b = lerp(sand[2], sand2[2], mt);
          let h = (m - 0.5) * 0.004;
          if (p.dunes > 0) h += U.fractal('perlin', u * dpx, v * dpy, dpx, dpy, 3, 0.45, 'fbm', seed + 7) * duneA;
          // grains
          const gc = U.worley(u * gpx, v * gpy, gpx, gpy, seed + 3), gid = gc.id, f1 = gc.f1;
          const gf = 1 + ((gid - 0.5) * 0.4 - smoothstep(0.25, 0.75, f1) * 0.18) * p.grain;
          r *= gf; g *= gf; b *= gf;
          h += (0.5 - f1) * grainH;
          if (gid < p.speckle * 0.3 && f1 < 0.5) { const s = 0.85 * (1 - smoothstep(0.3, 0.5, f1)); r = lerp(r, speck[0], s); g = lerp(g, speck[1], s); b = lerp(b, speck[2], s); }
          if (lit && gid > 1 - p.sparkle * 0.04 && f1 < 0.3) { const s = 1 - f1 / 0.3; r = lerp(r, 255, s); g = lerp(g, 255, s); b = lerp(b, 255, s); }
          // ripples
          if (p.ripples > 0) {
            const wrp = (U.fractal('perlin', u * wpx, v * wpy, wpx, wpy, 3, 0.5, 'fbm', seed + 5) - 0.5) * p.rippleWarp * 3;
            const ph = kx * u + ky * v + wrp, t = ph - Math.floor(ph);
            const prof = t < crest ? smoothstep(0, crest, t) : 1 - smoothstep(crest, 1, t);
            const brk = p.rippleBreak > 0 ? smoothstep(p.rippleBreak * 0.7, p.rippleBreak * 0.7 + 0.25, U.fractal('perlin', u * wpx, v * wpy, wpx, wpy, 2, 0.5, 'fbm', seed + 6)) : 1;
            h += prof * ripA * brk;
          }
          // pebbles: small domes in a few cells
          if (p.pebbles > 0) {
            const c = cellPt(u * ppx, v * ppy, ppx, ppy, seed + 21), k = c.k;
            if (U.hash(k, 0, seed + 21) < p.pebbles * 0.25) {
              // rotated, slightly elongated dome
              const a = U.hash(k, 1, seed + 21) * Math.PI, el = 1 + U.hash(k, 2, seed + 21) * 0.7, rad = 0.12 + 0.12 * U.hash(k, 3, seed + 21);
              const ea = (c.dx * Math.cos(a) + c.dy * Math.sin(a)) / el, eb = -c.dx * Math.sin(a) + c.dy * Math.cos(a);
              const t = 1 - Math.hypot(ea, eb) / rad;
              if (t > 0) {
                const tone = 0.75 + 0.5 * U.hash(k, 4, seed + 21), s = smoothstep(0, 0.12, t);
                r = lerp(r, pebC[0] * tone, s); g = lerp(g, pebC[1] * tone, s); b = lerp(b, pebC[2] * tone, s);
                h += Math.sqrt(t) * (rad / ppx) * 0.6; flags[i] = 1;
              }
            }
          }
          // shell fragments: thin, curved slivers (bent ellipses) with growth ridges, lying flat
          if (p.shells > 0) {
            const c = cellPt(u * spx, v * spy, spx, spy, seed + 31), k = c.k;
            if (U.hash(k, 0, seed + 31) < p.shells * 0.3) {
              const a = U.hash(k, 1, seed + 31) * Math.PI * 2, len = 0.15 + 0.15 * U.hash(k, 2, seed + 31), bend = (U.hash(k, 3, seed + 31) - 0.5) * 8;
              const la = c.dx * Math.cos(a) + c.dy * Math.sin(a), lb = -c.dx * Math.sin(a) + c.dy * Math.cos(a) - bend * la * la;
              const t = 1 - Math.hypot(la / len, lb / (len * 0.32));
              if (t > 0) {
                const rib = 0.88 + 0.12 * Math.sin(lb * 140); // growth ridges
                const tone = (0.85 + 0.3 * U.hash(k, 4, seed + 31)) * rib, s = smoothstep(0, 0.2, t);
                r = lerp(r, shellC[0] * tone, s); g = lerp(g, shellC[1] * tone, s); b = lerp(b, shellC[2] * tone, s);
                h += s * (len / spx) * 0.08; flags[i] = 1;
              }
            }
          }
          if (wetMap) wetMap[i] = smoothstep(1 - p.wetPatches * 0.55, 1.05 - p.wetPatches * 0.55, U.fractal('perlin', u * epx, v * epy, epx, epy, 4, 0.5, 'fbm', seed + 41));
          Hf[i] = h;
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
        }
      }
      U.groundFinish(ctx, img, Hf, W, H, p, { flags, wetMap, aoScale: 18, heightRef: Math.max(0.004, ripA * 0.8 + duneA * 0.3), shadowLen: 0.03, height: !!(opts && opts.height) });
    },
  });
})();
