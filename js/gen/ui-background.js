/* Simple grungy UI backgrounds, built from four steps (bottom to top):
     1. gradient  – solid, linear, radial or diamond, any number of color stops, plus a vignette
     2. noise     – one noise variant (clouds, ridged, cells, blocky, brushed) blended onto the color, plus fine grain
     3. grunge    – stains tinted into the color
     4. cutout    – grunge-shaped holes cut into the alpha (with an optional dark rim), torn edges toward the border
   All noise is placed relative to the short side and sampled on a fixed grid, so the preview and every
   export size look the same. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep } = U;
  const S_ = (pos, color, alpha = 1) => ({ pos, color, alpha });

  const NOISE = [['clouds', 'Clouds (soft)'], ['ridged', 'Ridged'], ['cells', 'Cells'], ['blocky', 'Blocky (value)'], ['brushed', 'Brushed (streaks)']];
  const GRUNGE = [['blotchy', 'Blotchy'], ['chipped', 'Chipped'], ['speckle', 'Speckle'], ['streaks', 'Drip streaks'], ['cracks', 'Cracks'], ['scratches', 'Scratches']];

  // noise variant at (x, y) in "feature" units; returns 0..1
  function noiseAt(type, x, y, oct, s) {
    switch (type) {
      case 'ridged': return U.fractal('perlin', x, y, 0, 0, oct, 0.5, 'ridged', s);
      case 'cells': return U.fractal('cells', x, y, 0, 0, Math.min(oct, 3), 0.5, 'fbm', s);
      case 'blocky': return U.fractal('value', x, y, 0, 0, oct, 0.5, 'fbm', s);
      case 'brushed': return U.fractal('perlin', x * 0.06, y * 2.2, 0, 0, oct, 0.6, 'fbm', s);
      default: return U.fractal('perlin', x, y, 0, 0, oct, 0.5, 'fbm', s);
    }
  }

  // grunge pattern at (x, y); returns roughly 0..1, higher = more grunge
  function grungeAt(type, x, y, s) {
    switch (type) {
      case 'chipped': {
        const w = U.worley(x * 1.3, y * 1.3, 0, 0, s + 21);
        return clamp(U.fractal('perlin', x, y, 0, 0, 4, 0.55, 'fbm', s) * 0.65 + (1 - w.f1) * 0.25 + w.id * 0.12);
      }
      case 'speckle': {
        // round specks of random size (two sizes of cells), clustered by a soft noise mask
        const m = U.fractal('perlin', x * 0.5, y * 0.5, 0, 0, 3, 0.5, 'fbm', s);
        const dot = (f, o) => { const w = U.worley(x * f, y * f, 0, 0, s + o), r = 0.12 + 0.3 * w.id; return 1 - smoothstep(r * 0.7, r, w.f1); };
        return clamp(m * 0.5 + Math.max(dot(3, 3), dot(7, 4) * 0.8) * (0.25 + m * 0.6));
      }
      case 'streaks': // drips: long vertically
        return U.fractal('perlin', x * 1.6, y * 0.12, 0, 0, 4, 0.55, 'fbm', s);
      case 'cracks': {
        const w = U.worley(x * 0.7, y * 0.7, 0, 0, s + 33), edge = 1 - smoothstep(0, 0.07, w.f2 - w.f1);
        return Math.max(U.fractal('perlin', x, y, 0, 0, 4, 0.55, 'fbm', s) * 0.8, edge * 0.95);
      }
      case 'scratches': {
        // thin straight scratches: one random segment per cell (most of them roughly in one direction)
        const X = x * 2, Y = y * 2, cx = Math.floor(X), cy = Math.floor(Y);
        let v = 0;
        for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
          const ix = cx + i, iy = cy + j;
          if (U.hash(ix, iy, s + 5) > 0.55) continue;
          const px = ix + U.hash(ix, iy, s + 6), py = iy + U.hash(ix, iy, s + 7);
          const a = 0.5 + (U.hash(ix, iy, s + 8) - 0.5) * (U.hash(ix, iy, s + 9) < 0.7 ? 0.5 : 3.2);
          const L = 0.4 + 1.1 * U.hash(ix, iy, s + 10), w = 0.012 + 0.02 * U.hash(ix, iy, s + 11);
          const dx = X - px, dy = Y - py, ca = Math.cos(a), sa = Math.sin(a);
          const along = dx * ca + dy * sa, across = Math.abs(-dx * sa + dy * ca);
          if (Math.abs(along) > L) continue;
          const taper = 1 - (along / L) * (along / L); // thin out toward both ends
          v = Math.max(v, (1 - smoothstep(w * taper * 0.4, w * taper + 1e-4, across)) * (0.6 + 0.4 * taper));
        }
        return clamp(v * 0.75 + U.fractal('perlin', x, y, 0, 0, 3, 0.5, 'fbm', s) * 0.3);
      }
      default:
        return U.fractal('perlin', x, y, 0, 0, 5, 0.55, 'fbm', s);
    }
  }

  /* W×H field from fn(x, y) (px), evaluated on a grid of ~400 cells per short side and interpolated:
     identical look at every resolution and fast at large export sizes */
  function field(W, H, S, fn) {
    const st = Math.max(1, S / 400), gw = Math.ceil(W / st) + 2, gh = Math.ceil(H / st) + 2;
    const g = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fn(i * st, j * st);
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const fy = y / st, j = Math.floor(fy), ty = fy - j;
      for (let x = 0; x < W; x++) {
        const fx = x / st, i = Math.floor(fx), tx = fx - i, o = j * gw + i;
        const a = g[o] + (g[o + 1] - g[o]) * tx, b = g[o + gw] + (g[o + gw + 1] - g[o + gw]) * tx;
        out[y * W + x] = a + (b - a) * ty;
      }
    }
    return out;
  }

  U.register({
    id: 'ui-background',
    name: 'UI Background',
    desc: 'Grungy UI backgrounds from gradients, noise, stains and cutouts with torn edges',
    uses: ['Panel, menu and inventory backgrounds for games with a worn military, horror or industrial look.', 'Backdrops for posters, social media graphics and title cards.'],
    tags: ['UI', 'Texturing'],
    aspect: '16:9',
    normalMap: false, // a flat UI background, not a surface
    icon: U.icon('<rect x="3.5" y="5" width="17" height="14" rx="1.5"/><path d="M3.5 15c3-2 5 1 8-1s5-3 9-1" opacity=".5"/><circle cx="16" cy="9" r="1.2"/><circle cx="8" cy="10" r=".7"/>'),
    params: [
      { type: 'section', label: 'Gradient' },
      { key: 'shape', label: 'Type', type: 'select', default: 'linear', options: [['solid', 'Solid (first stop)'], ['linear', 'Linear'], ['radial', 'Radial'], ['diamond', 'Diamond']] },
      { key: 'angle', label: 'Angle', type: 'range', min: -180, max: 180, step: 1, default: 90, show: (p) => p.shape === 'linear' || p.shape === 'diamond' },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.1, max: 3, step: 0.01, default: 1, show: (p) => p.shape !== 'solid' },
      { key: 'cx', label: 'Center X', type: 'range', min: -1, max: 1, step: 0.01, default: 0, show: (p) => p.shape === 'radial' || p.shape === 'diamond' },
      { key: 'cy', label: 'Center Y', type: 'range', min: -1, max: 1, step: 0.01, default: 0, show: (p) => p.shape === 'radial' || p.shape === 'diamond' },
      { key: 'bias', label: 'Bias', type: 'range', min: 0.2, max: 5, step: 0.01, default: 1, show: (p) => p.shape !== 'solid', tip: '<1 pushes toward the end color, >1 toward the start' },
      {
        key: 'stops', label: 'Stops', type: 'list', itemLabel: 'Stop', max: 8,
        itemSummary: (s) => `${(+s.pos).toFixed(2)} · ${s.color}${s.alpha < 1 ? ' · ' + Math.round(s.alpha * 100) + '%' : ''}`,
        default: [S_(0, '#2b2f33'), S_(1, '#14171a')],
        item: [
          { key: 'pos', label: 'Position', type: 'range', min: 0, max: 1, step: 0.005, default: 0.5 },
          { key: 'color', label: 'Color', type: 'color', default: '#3a3f44' },
          { key: 'alpha', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
        ],
      },
      { key: 'vignette', label: 'Vignette', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Darkens toward the corners' },
      { key: 'vigSize', label: 'Vignette size', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.vignette > 0, tip: 'How far the vignette reaches in' },
      { key: 'vigColor', label: 'Vignette color', type: 'color', default: '#000000', show: (p) => p.vignette > 0 },
      { key: 'dither', label: 'Dither', type: 'range', min: 0, max: 4, step: 0.1, default: 1, tip: 'Adds a little noise to hide 8-bit banding' },

      { type: 'section', label: 'Noise', active: (p) => p.noise > 0 || p.grain > 0 },
      { key: 'noiseType', label: 'Noise type', type: 'select', default: 'clouds', options: NOISE },
      { key: 'noise', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'noiseScale', label: 'Scale', type: 'range', min: 0.5, max: 40, step: 0.1, default: 5, tip: 'Noise features across the short side' },
      { key: 'noiseDetail', label: 'Detail', type: 'int', min: 1, max: 7, default: 5 },
      { key: 'noiseAngle', label: 'Streak angle', type: 'range', min: -90, max: 90, step: 1, default: 0, show: (p) => p.noiseType === 'brushed' },
      { key: 'noiseBlend', label: 'Blend', type: 'select', default: 'soft', options: [['soft', 'Soft light (lighten + darken)'], ['darken', 'Darken only'], ['tint', 'Tint toward color']] },
      { key: 'noiseColor', label: 'Noise color', type: 'color', default: '#5a4a38', show: (p) => p.noiseBlend === 'tint' },
      { key: 'grain', label: 'Fine grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Film-grain style per-pixel speckle' },

      { type: 'section', label: 'Grunge', active: (p) => p.stain > 0 || p.cut > 0 },
      { key: 'grungeType', label: 'Grunge type', type: 'select', default: 'blotchy', options: GRUNGE },
      { key: 'grungeScale', label: 'Grunge scale', type: 'range', min: 1, max: 40, step: 0.5, default: 6, tip: 'Grunge features across the short side' },
      { key: 'stain', label: 'Stains', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Grunge tinted into the color (keeps alpha)' },
      { key: 'stainColor', label: 'Stain color', type: 'color', default: '#0e0c0a', show: (p) => p.stain > 0 },
      { key: 'stainOpacity', label: 'Stain opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.stain > 0 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 21 },

      { type: 'section', label: 'Cutout', active: (p) => p.cut > 0 || p.edgeErode > 0 },
      { key: 'cut', label: 'Cutout', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Cuts grunge-shaped holes into the background (transparent)' },
      { key: 'cutSoft', label: 'Softness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1, tip: '0 = hard, crisp cut edges' },
      { key: 'edgeErode', label: 'Edge erosion', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Tears the background up toward the image border' },
      { key: 'edgeWidth', label: 'Edge width', type: 'range', min: 0.01, max: 0.5, step: 0.005, default: 0.12, show: (p) => p.edgeErode > 0, tip: 'How far in from the border the erosion reaches (fraction of the short side)' },
      { key: 'rim', label: 'Cut rim', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.cut > 0 || p.edgeErode > 0, tip: 'Darkened band along the cut edges (burnt / worn paint look)' },
      { key: 'rimWidth', label: 'Rim width', type: 'range', min: 0.01, max: 0.3, step: 0.005, default: 0.06, show: (p) => (p.cut > 0 || p.edgeErode > 0) && p.rim > 0 },
      { key: 'rimColor', label: 'Rim color', type: 'color', default: '#000000', show: (p) => (p.cut > 0 || p.edgeErode > 0) && p.rim > 0 },
      { key: 'invertCut', label: 'Invert cutout', type: 'bool', default: false, show: (p) => p.cut > 0, tip: 'Keep only the grunge shapes instead' },
    ],
    presets: [
      { name: 'Clean slate (no grunge)', group: 'Basic', values: { stain: 0, noise: 0.15, grain: 0.08, vignette: 0.3 } },
      { name: 'Radial spotlight', group: 'Basic', values: { shape: 'radial', scale: 1.3, stops: [S_(0, '#3d4247'), S_(1, '#0d0f11')], vignette: 0.2 } },
      { name: 'Military olive', group: 'Realistic', values: { stops: [S_(0, '#4b5236'), S_(1, '#262a1b')], noiseType: 'clouds', noise: 0.4, stain: 0.55, stainColor: '#15140c', grungeType: 'chipped', grain: 0.2 } },
      { name: 'Rusty metal', group: 'Realistic', values: { stops: [S_(0, '#5c5450'), S_(1, '#2e2826')], noiseType: 'brushed', noise: 0.35, noiseAngle: 0, stain: 0.7, stainColor: '#6e3416', stainOpacity: 0.75, grungeType: 'blotchy', grungeScale: 5, grain: 0.15 } },
      { name: 'Brushed steel', group: 'Realistic', values: { stops: [S_(0, '#7c8288'), S_(0.5, '#575c61'), S_(1, '#3a3e42')], noiseType: 'brushed', noise: 0.55, noiseScale: 8, stain: 0.2, grain: 0.1, vignette: 0.35 } },
      { name: 'Concrete', group: 'Realistic', values: { shape: 'solid', stops: [S_(0, '#6d6b66')], noiseType: 'clouds', noise: 0.5, noiseScale: 9, stain: 0.45, stainColor: '#2a2824', grungeType: 'speckle', grungeScale: 10, grain: 0.35, vignette: 0.35 } },
      { name: 'Old paper', group: 'Realistic', values: { shape: 'radial', scale: 1.4, stops: [S_(0, '#e6d6b2'), S_(1, '#bfa577')], noiseType: 'clouds', noise: 0.3, noiseBlend: 'tint', noiseColor: '#8a6a3c', stain: 0.45, stainColor: '#7a5528', stainOpacity: 0.4, grain: 0.12, vignette: 0.55, vigColor: '#4a3016', edgeErode: 0.5, edgeWidth: 0.08, rim: 0.6, rimColor: '#5a3a18', rimWidth: 0.04 } },
      { name: 'Torn edges', group: 'Stylized', values: { edgeErode: 0.75, edgeWidth: 0.14, rim: 0.6, grungeType: 'chipped' } },
      { name: 'Chipped paint cutout', group: 'Stylized', values: { stops: [S_(0, '#a8322a'), S_(1, '#6a1a14')], cut: 0.35, cutSoft: 0.02, grungeType: 'chipped', grungeScale: 7, rim: 0.4, stain: 0.3 } },
      { name: 'Blood red', group: 'Stylized', values: { shape: 'radial', scale: 1.3, stops: [S_(0, '#6a0c0c'), S_(1, '#1a0202')], noiseType: 'ridged', noise: 0.3, stain: 0.6, stainColor: '#050000', grungeType: 'streaks', grain: 0.2, vignette: 0.6 } },
      { name: 'Ink splatter', group: 'Stylized', values: { shape: 'solid', stops: [S_(0, '#111111')], noise: 0.1, grain: 0.05, cut: 0.55, invertCut: true, cutSoft: 0, grungeType: 'speckle', grungeScale: 5, rim: 0, vignette: 0, stain: 0 } },
      { name: 'Cracked plate', group: 'Stylized', values: { stops: [S_(0, '#4a4e52'), S_(1, '#24272a')], grungeType: 'cracks', grungeScale: 4, stain: 0.7, stainOpacity: 0.8 } },
      { name: 'Scratched dark', group: 'Stylized', values: { grungeType: 'scratches', grungeScale: 4, stain: 0.6, stainColor: '#8a8f94', stainOpacity: 0.35 } },
      { name: 'Sci-fi blue', group: 'Sci-fi', values: { stops: [S_(0, '#13304a'), S_(1, '#050c16')], noiseType: 'cells', noise: 0.3, noiseScale: 7, stain: 0.35, stainColor: '#000204', grain: 0.12, vignette: 0.55, vigColor: '#000308' } },
      { name: 'Toxic green', group: 'Sci-fi', values: { shape: 'radial', stops: [S_(0, '#3c6a12'), S_(1, '#0c1504')], noiseType: 'ridged', noise: 0.35, noiseBlend: 'tint', noiseColor: '#b4ff3a', stain: 0.5, stainColor: '#060a02', grungeType: 'streaks', vignette: 0.6 } },
      { name: 'Hazard amber', group: 'Sci-fi', values: { stops: [S_(0, '#c88a12'), S_(1, '#6a4206')], noiseType: 'blocky', noise: 0.25, noiseScale: 14, stain: 0.55, grungeType: 'scratches', grungeScale: 5, stainColor: '#1a1004', edgeErode: 0.4, edgeWidth: 0.08, rim: 0.5 } },
      // Post-apocalyptic: rust, scrap, dirt and wear
      { name: 'Wasteland scrap', group: 'Post-apocalyptic', values: { stops: [S_(0, '#5a4636'), S_(1, '#2a1e16')], noiseType: 'clouds', noise: 0.45, stain: 0.6, stainColor: '#6e3416', stainOpacity: 0.7, grungeType: 'chipped', grungeScale: 6, grain: 0.25, vignette: 0.6, edgeErode: 0.5, edgeWidth: 0.08, rim: 0.5, rimColor: '#1a0e06' } },
      { name: 'Fallout bunker', group: 'Post-apocalyptic', values: { stops: [S_(0, '#2e3626'), S_(1, '#141810')], noiseType: 'blocky', noise: 0.25, noiseScale: 18, stain: 0.5, stainColor: '#0a0c06', grungeType: 'streaks', grungeScale: 5, grain: 0.3, vignette: 0.65 } },
      { name: 'Ash and soot', group: 'Post-apocalyptic', values: { shape: 'radial', scale: 1.3, stops: [S_(0, '#6a6660'), S_(1, '#2a2826')], noiseType: 'clouds', noise: 0.5, noiseScale: 4, stain: 0.7, stainColor: '#0c0a08', stainOpacity: 0.75, grungeType: 'blotchy', grungeScale: 4, grain: 0.35, vignette: 0.6 } },
      { name: 'Radioactive dust', group: 'Post-apocalyptic', values: { stops: [S_(0, '#8a8a3a'), S_(1, '#3a3a14')], noiseType: 'clouds', noise: 0.4, noiseBlend: 'tint', noiseColor: '#c8e03a', stain: 0.45, stainColor: '#1a1a08', grungeType: 'speckle', grungeScale: 9, stainOpacity: 0.5, grain: 0.3, vignette: 0.55 } },
      { name: 'Scavenger panel (rusted)', group: 'Post-apocalyptic', values: { stops: [S_(0, '#c04a2e'), S_(1, '#6a1e10')], noiseType: 'clouds', noise: 0.4, noiseScale: 4, grain: 0.15, vignette: 0.35, grungeType: 'chipped', grungeScale: 6, stain: 0.35, stainColor: '#2a1a0c', stainOpacity: 0.6, cut: 0.32, cutSoft: 0.03, edgeErode: 0.6, edgeWidth: 0.06, rim: 0.35, rimWidth: 0.03, rimColor: '#1c120c', cut: 0.2, grungeScale: 3.5 } },
      { name: 'Scavenger panel (dark)', group: 'Post-apocalyptic', values: { stops: [S_(0, '#2e2722'), S_(1, '#16120f')], noiseType: 'clouds', noise: 0.35, noiseScale: 4, grain: 0.2, vignette: 0.4, grungeType: 'chipped', grungeScale: 6, stain: 0.4, stainColor: '#0a0806', stainOpacity: 0.6, cut: 0.3, cutSoft: 0.03, edgeErode: 0.6, edgeWidth: 0.06, rim: 0.3, rimWidth: 0.03, rimColor: '#000000', cut: 0.2, grungeScale: 3.5 } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), seed = p.seed | 0;
      const stops = (p.stops || []).slice().sort((a, b) => a.pos - b.pos).map((s) => ({ pos: s.pos, c: U.hex(s.color), a: s.alpha == null ? 1 : s.alpha }));
      if (!stops.length) stops.push({ pos: 0, c: [40, 40, 40], a: 1 });
      const sample = (t, o) => {
        if (p.shape === 'solid' || t <= stops[0].pos) { const s = stops[0]; o[0] = s.c[0]; o[1] = s.c[1]; o[2] = s.c[2]; return s.a; }
        for (let i = 1; i < stops.length; i++) {
          const b = stops[i];
          if (t <= b.pos) {
            const a = stops[i - 1], f = b.pos > a.pos ? (t - a.pos) / (b.pos - a.pos) : 1;
            o[0] = a.c[0] + (b.c[0] - a.c[0]) * f; o[1] = a.c[1] + (b.c[1] - a.c[1]) * f; o[2] = a.c[2] + (b.c[2] - a.c[2]) * f;
            return a.a + (b.a - a.a) * f;
          }
        }
        const s = stops[stops.length - 1]; o[0] = s.c[0]; o[1] = s.c[1]; o[2] = s.c[2]; return s.a;
      };
      const ang = (p.angle * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang), span = Math.abs(ca) + Math.abs(sa);

      // noise fields (only those in use)
      const nf = p.noise > 0 ? (() => {
        const k = p.noiseScale / S, na = (p.noiseAngle * Math.PI) / 180, nc = Math.cos(na), ns = Math.sin(na);
        return field(W, H, S, (x, y) => noiseAt(p.noiseType, (x * nc + y * ns) * k, (-x * ns + y * nc) * k, p.noiseDetail, seed + 11));
      })() : null;
      const useCut = p.cut > 0 || p.edgeErode > 0;
      const gk = p.grungeScale / S;
      const gf = p.stain > 0 ? field(W, H, S, (x, y) => grungeAt(p.grungeType, x * gk, y * gk, seed + 23)) : null;
      // cutout uses its own grunge layout (different seed) so stains and holes don't sit in the same spots
      const cf = useCut ? field(W, H, S, (x, y) => grungeAt(p.grungeType, x * gk, y * gk, seed + 37)) : null;
      const grainCell = Math.max(1, S / 512);
      const sCol = U.hex(p.stainColor), nCol = U.hex(p.noiseColor), vCol = U.hex(p.vigColor), rCol = U.hex(p.rimColor);
      const thrCut = 0.8 - 0.62 * p.cut, softW = 0.004 + p.cutSoft * 0.12, rimW = p.rimWidth;
      const thrStain = 0.72 - 0.5 * p.stain;

      const img = ctx.createImageData(W, H), d = img.data, o = [0, 0, 0];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const j = y * W + x, nx = ((x + 0.5) / W) * 2 - 1, ny = ((y + 0.5) / H) * 2 - 1;
          // 1. gradient
          let t = 0;
          if (p.shape !== 'solid') {
            const dx = nx - p.cx, dy = ny - p.cy;
            if (p.shape === 'radial') t = Math.hypot(dx, dy) / p.scale;
            else if (p.shape === 'diamond') { const rx = dx * ca + dy * sa, ry = -dx * sa + dy * ca; t = (Math.abs(rx) + Math.abs(ry)) / p.scale; }
            else t = ((nx * ca + ny * sa) / span / p.scale) * 0.5 + 0.5;
            t = clamp(t);
            if (p.bias !== 1) t = Math.pow(t, p.bias);
          }
          let A = sample(t, o), r = o[0], g = o[1], b = o[2];
          // 2. noise + grain
          if (nf) {
            const n = nf[j], amt = p.noise;
            if (p.noiseBlend === 'darken') { const f = 1 - amt * (1 - n) * 1.2; r *= f; g *= f; b *= f; }
            else if (p.noiseBlend === 'tint') { const f = clamp((n - 0.35) * 2) * amt; r += (nCol[0] - r) * f; g += (nCol[1] - g) * f; b += (nCol[2] - b) * f; }
            else { const f = 1 + (n - 0.5) * 2 * amt * 0.9; r *= f; g *= f; b *= f; }
          }
          if (p.grain > 0) {
            const q = (U.hash(Math.floor(x / grainCell), Math.floor(y / grainCell), seed + 99) - 0.5) * p.grain * 70;
            r += q; g += q; b += q;
          }
          // vignette
          if (p.vignette > 0) {
            const v = p.vignette * smoothstep(1 - p.vigSize * 0.9, 1.5, Math.hypot(nx, ny));
            r += (vCol[0] - r) * v; g += (vCol[1] - g) * v; b += (vCol[2] - b) * v;
          }
          // 3. stains
          if (gf) {
            const s = smoothstep(thrStain - 0.12, thrStain + 0.12, gf[j]) * p.stainOpacity;
            r += (sCol[0] - r) * s; g += (sCol[1] - g) * s; b += (sCol[2] - b) * s;
          }
          // 4. cutout (+ torn border) with a dark rim along the cut edge
          if (cf) {
            let c = cf[j];
            if (p.edgeErode > 0) {
              const e = Math.min(x + 0.5, W - x - 0.5, y + 0.5, H - y - 0.5) / S;
              c += p.edgeErode * 0.7 * (1 - smoothstep(0, p.edgeWidth, e));
            }
            let thr = p.cut > 0 ? thrCut : 1.05; // with only edge erosion, holes come from the border term alone
            let keep, rimT;
            if (p.invertCut && p.cut > 0) { keep = smoothstep(thr - softW, thr + softW, c); rimT = 1 - smoothstep(thr + softW, thr + softW + rimW, c); }
            else { keep = 1 - smoothstep(thr - softW, thr + softW, c); rimT = smoothstep(thr - softW - rimW, thr - softW, c); }
            if (p.rim > 0) { const f = rimT * p.rim; r += (rCol[0] - r) * f; g += (rCol[1] - g) * f; b += (rCol[2] - b) * f; }
            A *= keep;
          }
          const dt = p.dither > 0 ? (U.hash(x, y, 7) - 0.5) * p.dither : 0;
          const i4 = j * 4;
          d[i4] = r + dt; d[i4 + 1] = g + dt; d[i4 + 2] = b + dt; d[i4 + 3] = A * 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
