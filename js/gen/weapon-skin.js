/* Arcade weapon skins: tileable, abstract gun-skin patterns in a loud, arcade shooter style.
   One base pattern (geometric shards, low-poly triangles, hex tech, tiger stripes, acid fluid,
   circuit traces, glitch, paint splatter, dragon scales, digital blocks, neon contours, carbon weave)
   is mapped through a 4-color palette (smooth ramp or flat steps), then overlays: ink outlines,
   facet shading, halftone dots, metallic flake, emissive glow and scanlines; finally wear: worn-off
   paint revealing brushed metal (biased toward edges), scratches and dirt.
   Separate maps: albedo, emissive, wear mask and a palette index map for recoloring in a shader.
   Every pattern uses whole periods per tile, so skins repeat seamlessly over a UV layout. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;
  const V = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };

  const PATTERNS = [
    ['shards', 'Geometric shards'], ['triangles', 'Low-poly triangles'], ['hex', 'Hex tech'], ['stripes', 'Tiger stripes'],
    ['fluid', 'Acid fluid'], ['circuit', 'Circuit traces'], ['glitch', 'Glitch'], ['splatter', 'Paint splatter'],
    ['scales', 'Dragon scales'], ['blocks', 'Digital blocks'], ['topo', 'Neon contours'], ['carbon', 'Carbon weave'],
  ];
  const PALETTES = {
    neon: ['#0d0b1e', '#ff2a8a', '#2af0ff', '#f6f0ff'],
    dragon: ['#120604', '#a8120c', '#ff7a12', '#ffd84a'],
    toxic: ['#0a0f06', '#2a4a0c', '#9aff1a', '#f4ff8a'],
    ice: ['#0a1a2e', '#2a6ab0', '#8ad8ff', '#ffffff'],
    gold: ['#1a1206', '#6a4a10', '#d8a830', '#fff0b0'],
    vapor: ['#2a1050', '#ff5fd2', '#5fd2ff', '#ffe07a'],
    blood: ['#0a0606', '#3a0808', '#b0141a', '#e8d8c8'],
    ocean: ['#04101a', '#0a4a6a', '#18b0b0', '#a8fff0'],
    sunset: ['#1a0a2a', '#c0304a', '#ff8a30', '#ffe0a0'],
    royal: ['#0a0a2a', '#3a1a8a', '#8a5aff', '#f0e0ff'],
    stealth: ['#0a0b0c', '#1e2124', '#3a3f44', '#ff5a1a'],
    candy: ['#ff5f9e', '#ffd25f', '#5fe3b0', '#ffffff'],
    sci: ['#f2f0ea', '#1a1a1a', '#ff6a1a', '#2a2a2a'],
    jade: ['#06140e', '#0e4a32', '#2ab07a', '#d8ffe8'],
  };
  const PAL_OPTS = [['neon', 'Neon'], ['dragon', 'Dragon fire'], ['toxic', 'Toxic'], ['ice', 'Ice'], ['gold', 'Gold'], ['vapor', 'Vaporwave'], ['blood', 'Blood'], ['ocean', 'Ocean'], ['sunset', 'Sunset'], ['royal', 'Royal purple'], ['stealth', 'Stealth + accent'], ['candy', 'Candy'], ['sci', 'Sci-fi white / orange'], ['jade', 'Jade'], ['custom', 'Custom']];
  const isP = (...l) => (p) => l.includes(p.pattern);

  U.register({
    id: 'weapon-skin',
    name: 'Arcade Weapon Skin',
    desc: 'Tileable abstract gun skins: shards, low-poly, hex, tiger stripes, acid, circuits, glitch, scales with ink, halftone, glow and wear',
    uses: ['Weapon, knife and gear skins for arcade and competitive shooters: tile them over the UV layout, use the emissive map for glowing accents and the wear mask for worn-off paint.', 'Loud backgrounds for loadout screens, loot cards and stream overlays.'],
    tags: ['Shooter', 'Texturing'],
    tileable: true,
    normalMap: false,
    icon: U.icon('<path d="M3 10h13l2-2h3v4h-3l-1 1h-3l-1 3H9l1-3H3z"/><path d="M6 10l2 3M10 10l2 3" opacity=".5"/>'),
    exportLayers: (p) => (p.split ? [{ id: 'color', suffix: 'albedo' }, { id: 'emissive', suffix: 'emissive' }, { id: 'wear', suffix: 'wear' }, { id: 'index', suffix: 'index' }] : null),
    params: [
      { type: 'section', label: 'Pattern' },
      { key: 'pattern', label: 'Pattern', type: 'select', default: 'shards', options: PATTERNS },
      { key: 'scale', label: 'Scale', type: 'int', min: 1, max: 40, default: 6, tip: 'Pattern features across the short side (whole numbers, so it tiles)' },
      { key: 'angle', label: 'Direction (°)', type: 'range', min: 0, max: 180, step: 1, default: 35, show: isP('stripes'), tip: 'Rounded to whole stripe counts per tile' },
      { key: 'warp', label: 'Warp', type: 'range', min: 0, max: 2, step: 0.01, default: 0.5, show: isP('stripes', 'fluid', 'topo', 'shards', 'splatter') },
      { key: 'density', label: 'Density', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: isP('circuit', 'glitch', 'splatter', 'hex', 'blocks', 'stripes'), tip: 'Traces, glitch blocks, splats, lit hex cells, block detail or stripe thickness' },
      { key: 'levels', label: 'Bands', type: 'int', min: 2, max: 12, default: 5, show: isP('fluid', 'topo') },
      { key: 'seed', label: 'Seed', type: 'seed', default: 8 },

      { type: 'section', label: 'Palette' },
      { key: 'palette', label: 'Palette', type: 'select', default: 'neon', options: PAL_OPTS, apply: (v, p) => { const c = PALETTES[v]; if (c) { p.c1 = c[0]; p.c2 = c[1]; p.c3 = c[2]; p.c4 = c[3]; } } },
      { key: 'c1', label: 'Color 1 (dark)', type: 'color', default: PALETTES.neon[0] },
      { key: 'c2', label: 'Color 2', type: 'color', default: PALETTES.neon[1] },
      { key: 'c3', label: 'Color 3', type: 'color', default: PALETTES.neon[2] },
      { key: 'c4', label: 'Color 4 (light)', type: 'color', default: PALETTES.neon[3] },
      { key: 'palMode', label: 'Color mapping', type: 'select', default: 'steps', options: [['steps', 'Flat steps (posterized)'], ['ramp', 'Smooth ramp']] },
      { key: 'palShift', label: 'Palette shift', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Rotates which regions get which color' },
      { key: 'palBias', label: 'Palette bias', type: 'range', min: -1, max: 1, step: 0.01, default: 0, tip: 'Toward the dark (−) or light (+) colors' },

      { type: 'section', label: 'Overlays' },
      { key: 'ink', label: 'Ink outlines', type: 'range', min: 0, max: 12, step: 0.1, default: 2.5, tip: 'Outline width between regions (px @ 512)' },
      { key: 'inkColor', label: 'Ink color', type: 'color', default: '#07060c', show: (p) => p.ink > 0 },
      { key: 'shade', label: 'Facet shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Light and shadow per facet / cell / scale' },
      { key: 'halftone', label: 'Halftone dots', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'halfSize', label: 'Dot spacing', type: 'range', min: 3, max: 40, step: 0.5, default: 10, show: (p) => p.halftone > 0, tip: 'px @ 512' },
      { key: 'halfColor', label: 'Dot color', type: 'color', default: '#000000', show: (p) => p.halftone > 0 },
      { key: 'flake', label: 'Metal flake', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Sparkling metallic paint' },
      { key: 'glow', label: 'Emissive glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Glowing parts: traces, contour lines, lit cells, stripe edges (also exported as an emissive map)' },
      { key: 'glowColor', label: 'Glow color', type: 'color', default: '#2af0ff', show: (p) => p.glow > 0 },
      { key: 'scan', label: 'Scanlines', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'grain', label: 'Grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15 },

      { type: 'section', label: 'Wear' },
      { key: 'wear', label: 'Worn paint', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Paint worn off down to the metal (battle-scarred)' },
      { key: 'edgeWear', label: 'Edge bias', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.wear > 0, tip: 'Wear starts at the ink edges and region borders' },
      { key: 'metalColor', label: 'Metal color', type: 'color', default: '#9a9ea4' },
      { key: 'scratches', label: 'Scratches', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2 },
      { key: 'dirt', label: 'Dirt', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },

      { type: 'section', label: 'Output' },
      { key: 'split', label: 'Separate maps', type: 'bool', default: false, tip: 'Download albedo, emissive, wear mask and palette index map as aligned PNGs' },
      { key: 'view', label: 'Preview map', type: 'select', default: 'color', options: [['color', 'Albedo (combined)'], ['emissive', 'Emissive'], ['wear', 'Wear mask'], ['index', 'Palette index']], tip: 'Preview only' },
    ],
    presets: [
      { name: 'Neon shards', group: 'Geometric', values: {} },
      { name: 'Low-poly sunset', group: 'Geometric', values: { pattern: 'triangles', scale: 8, palette: 'sunset', ...pal('sunset'), palMode: 'ramp', ink: 0.8, shade: 0.5, glow: 0, wear: 0.1 } },
      { name: 'Hex reactor', group: 'Geometric', values: { pattern: 'hex', scale: 10, density: 0.25, palette: 'stealth', ...pal('stealth'), glowColor: '#ff5a1a', glow: 0.9, ink: 2, shade: 0.35 } },
      { name: 'Digital ice', group: 'Geometric', values: { pattern: 'blocks', scale: 6, density: 0.6, palette: 'ice', ...pal('ice'), ink: 0.8, shade: 0.2, glow: 0, flake: 0.4 } },
      { name: 'Tiger fire', group: 'Organic', values: { pattern: 'stripes', scale: 5, angle: 70, warp: 0.9, density: 0.55, palette: 'dragon', ...pal('dragon'), ink: 1.5, glow: 0.3, glowColor: '#ff7a12', shade: 0.2 } },
      { name: 'Acid trip', group: 'Organic', values: { pattern: 'fluid', scale: 3, warp: 1.2, levels: 6, palette: 'toxic', ...pal('toxic'), ink: 2, glow: 0.2, glowColor: '#9aff1a', halftone: 0.35, halfSize: 8 } },
      { name: 'Dragon scales', group: 'Organic', values: { pattern: 'scales', scale: 9, palette: 'dragon', ...pal('dragon'), palMode: 'ramp', ink: 1.5, shade: 0.7, flake: 0.5, glow: 0, wear: 0.25 } },
      { name: 'Jade serpent', group: 'Organic', values: { pattern: 'scales', scale: 12, palette: 'jade', ...pal('jade'), palMode: 'ramp', ink: 1, shade: 0.6, flake: 0.6, glow: 0 } },
      { name: 'Paint bomb', group: 'Street', values: { pattern: 'splatter', scale: 4, density: 0.6, warp: 0.6, palette: 'candy', ...pal('candy'), ink: 0, shade: 0, glow: 0, flake: 0.1, halftone: 0.25, wear: 0.15 } },
      { name: 'Comic halftone', group: 'Street', values: { pattern: 'fluid', scale: 2, warp: 0.6, levels: 4, palette: 'vapor', ...pal('vapor'), ink: 4, halftone: 0.7, halfSize: 9, glow: 0, flake: 0 } },
      { name: 'Circuit overload', group: 'Tech', values: { pattern: 'circuit', scale: 12, density: 0.6, palette: 'ocean', ...pal('ocean'), glowColor: '#a8fff0', glow: 0.9, ink: 0, shade: 0.2 } },
      { name: 'Glitch core', group: 'Tech', values: { pattern: 'glitch', scale: 6, density: 0.5, palette: 'neon', ...pal('neon'), ink: 0, glow: 0.4, glowColor: '#ff2a8a', scan: 0.5, shade: 0 } },
      { name: 'Neon topography', group: 'Tech', values: { pattern: 'topo', scale: 3, warp: 0.7, levels: 9, palette: 'royal', ...pal('royal'), glowColor: '#8a5aff', glow: 1, ink: 0, shade: 0 } },
      { name: 'Sci-fi white / orange', group: 'Tech', values: { pattern: 'shards', scale: 4, warp: 0.1, palette: 'sci', ...pal('sci'), ink: 3, inkColor: '#111111', shade: 0.15, glow: 0, flake: 0, wear: 0.3, edgeWear: 0.8 } },
      { name: 'Carbon + gold', group: 'Material', values: { pattern: 'carbon', scale: 24, palette: 'gold', ...pal('gold'), ink: 0, shade: 0.6, glow: 0, flake: 0.5 } },
      { name: 'Stealth carbon', group: 'Material', values: { pattern: 'carbon', scale: 30, palette: 'stealth', ...pal('stealth'), ink: 0, shade: 0.7, glow: 0, flake: 0.2, wear: 0.15 } },
      { name: 'Battle-worn royal', group: 'Material', values: { pattern: 'shards', scale: 7, palette: 'royal', ...pal('royal'), wear: 0.7, edgeWear: 0.8, scratches: 0.7, dirt: 0.4, glow: 0.2, glowColor: '#8a5aff' } },
      { name: 'Factory new gold', group: 'Material', values: { pattern: 'triangles', scale: 5, palette: 'gold', ...pal('gold'), palMode: 'ramp', ink: 0.6, shade: 0.7, flake: 0.8, glow: 0, wear: 0, scratches: 0, dirt: 0 } },
    ],

    render(ctx, W, H, p, opts) {
      opts = opts || {};
      const layer = opts.layer || (opts.preview ? p.view || 'color' : 'color');
      const S = Math.min(W, H), k = S / 512, seed = p.seed | 0, N = W * H, ar = H / W;
      const per = (f) => [Math.max(1, Math.round((f * W) / S)), Math.max(1, Math.round((f * H) / S))];
      const sc = Math.max(1, p.scale | 0), [px, py] = per(sc), pat = p.pattern;
      const cols = [U.hex(p.c1), U.hex(p.c2), U.hex(p.c3), U.hex(p.c4)], ink = U.hex(p.inkColor), metal = U.hex(p.metalColor);
      const glowC = U.hex(p.glowColor), halfC = U.hex(p.halfColor);
      const inkW = p.ink * k, dens = clamp(p.density);

      // warp fields (tileable), in lattice units
      let WX = null, WY = null;
      if (p.warp > 0 && ['stripes', 'fluid', 'topo', 'shards', 'splatter'].includes(pat)) {
        const [qx, qy] = per(Math.max(1, Math.round(sc / 2)));
        WX = U.coarseField(W, H, 180, (x, y) => U.fractal('perlin', (x / W) * qx, (y / H) * qy, qx, qy, 3, 0.5, 'fbm', seed + 1) - 0.5);
        WY = U.coarseField(W, H, 180, (x, y) => U.fractal('perlin', (x / W) * qx, (y / H) * qy, qx, qy, 3, 0.5, 'fbm', seed + 2) - 0.5);
      }
      const [lx, ly] = per(Math.max(1, Math.round(sc / 3)));
      const slow = U.coarseField(W, H, 120, (x, y) => U.fractal('perlin', (x / W) * lx, (y / H) * ly, lx, ly, 2, 0.5, 'fbm', seed + 3)); // smooth tileable gradient
      // stripes: integer wave vector
      const a = (+p.angle || 0) * DEG;
      let kx = Math.round(Math.cos(a) * px), ky = Math.round(Math.sin(a) * py);
      if (!kx && !ky) kx = 1;
      const kLen = Math.hypot(kx / W, ky / H) * S;
      // hex lattice / scales rows
      const hexRows = Math.max(2, Math.round(H / ((W / px) * 0.866) / 2) * 2);
      const scW = W / px, scRows = Math.max(2, Math.round(H / (scW * 0.5) / 2) * 2), scH = H / scRows, scR = scW * 0.62;

      // scratches: strokes on a mask canvas, wrapped across the edges
      let scr = null;
      if (p.scratches > 0) {
        const c = U.canvas(W, H), g = c.getContext('2d'), r = U.rng(seed + 901), n = Math.round(p.scratches * 90);
        g.strokeStyle = '#fff'; g.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const x0 = r() * W, y0 = r() * H, ang = (r() - 0.5) * 1.1 + (r() < 0.3 ? Math.PI / 2 : 0), len = S * (0.04 + r() * 0.3);
          const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len, bend = (r() - 0.5) * len * 0.25;
          g.lineWidth = Math.max(0.6, k * (0.6 + r() * 1.6)); g.globalAlpha = 0.45 + r() * 0.55;
          for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) {
            g.beginPath(); g.moveTo(x0 + ox, y0 + oy);
            g.quadraticCurveTo((x0 + x1) / 2 - Math.sin(ang) * bend + ox, (y0 + y1) / 2 + Math.cos(ang) * bend + oy, x1 + ox, y1 + oy);
            g.stroke();
          }
        }
        const d = g.getImageData(0, 0, W, H).data;
        scr = new Float32Array(N);
        for (let i = 0; i < N; i++) scr[i] = d[i * 4 + 3] / 255;
      }
      const [wx, wy] = per(Math.max(2, sc * 1.5)), [bx, by] = per(sc * 12);
      const wearF = p.wear > 0 ? U.coarseField(W, H, 260, (x, y) => U.fractal('perlin', (x / W) * wx, (y / H) * wy, wx, wy, 5, 0.6, 'fbm', seed + 7)) : null;
      const ip = (n) => Math.max(1, Math.round(n)); // whole periods only, or the skin gets a seam
      const dx2 = ip(wx * 0.5), dy2 = ip(wy * 0.5), brx = ip(bx * 0.25), bry = ip(by * 6);
      const dirtF = p.dirt > 0 ? U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * dx2, (y / H) * dy2, dx2, dy2, 4, 0.55, 'fbm', seed + 8)) : null;
      // halftone lattice at 45° with whole periods (tileable)
      const hs = Math.max(2, p.halfSize * k), hn = Math.max(1, Math.round(W / hs / Math.SQRT2)), hm = Math.max(1, Math.round(H / hs / Math.SQRT2));
      const scanN = Math.max(1, Math.round(H / Math.max(2, 3 * k)));

      const img = ctx.createImageData(W, H), o = img.data;
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W, v = (y + 0.5) / H;
          let U0 = u, V0 = v;
          if (WX) { U0 += (WX[i] * p.warp) / px; V0 += (WY[i] * p.warp) / py; }
          let t = 0.5, e = 1e9, sh = 0, gl = 0;
          switch (pat) {
            case 'shards': {
              U.voro(U0 * px, V0 * py, px, py, seed, 1, false, W / px, H / py, 0, V);
              t = V.id; e = V.e;
              const fa = hash(V.ci, V.cj, seed + 5) * TAU;
              sh = ((U0 * px - V.px) * Math.cos(fa) + (V0 * py - V.py) * Math.sin(fa)) * 1.2;
              break;
            }
            case 'triangles': {
              const X = u * px, Y = v * py, i0 = Math.floor(X), j0 = Math.floor(Y), fx = X - i0, fy = Y - j0;
              const up = fx > fy ? 1 : 0, ci = U.mod(i0, px), cj = U.mod(j0, py);
              const cw = W / px, ch = H / py;
              t = clamp(slow[i] * 1.2 - 0.1 + (hash(ci * 2 + up, cj, seed) - 0.5) * 0.35);
              e = Math.min(fx * cw, (1 - fx) * cw, fy * ch, (1 - fy) * ch, (Math.abs(fx - fy) / Math.SQRT2) * Math.min(cw, ch));
              sh = (hash(ci * 2 + up, cj, seed + 9) - 0.5) * 1.2;
              break;
            }
            case 'hex': {
              U.voro(u * px, v * hexRows, px, hexRows, seed, 0, true, W / px, H / hexRows, 0, V);
              t = V.id * 0.75; e = V.e;
              const lit = hash(V.ci, V.cj, seed + 3) < dens * 0.45;
              if (lit) { t = 0.92; gl = 1 - smoothstep(0, (W / px) * 0.5, V.f1) * 0.6; }
              sh = 0.5 - V.f1 / (W / px) * 1.3;
              break;
            }
            case 'stripes': {
              const ph = kx * U0 + ky * V0;
              const s = Math.sin(TAU * ph), th = lerp(0.7, -0.4, dens) + (slow[i] - 0.5) * 0.9;
              const band2 = Math.sin(TAU * ph * 2 + 1.3);
              t = s > th ? 0.08 : band2 > 0.6 ? 0.62 : slow[i] > 0.55 ? 0.38 : 0.85;
              const grad = TAU * kLen / S; // ds per px (approx.)
              e = Math.abs(s - th) / Math.max(1e-4, grad * Math.sqrt(Math.max(0.05, 1 - s * s)));
              gl = (1 - smoothstep(0, 3 * k, e)) * 0.8;
              break;
            }
            case 'fluid':
            case 'topo': {
              const n = U.fractal('perlin', U0 * px, V0 * py, px, py, 4, 0.5, 'fbm', seed + 11);
              const L = Math.max(2, p.levels | 0), q = n * L, fq = q - Math.floor(q);
              const bandPx = S / (sc * 2.2 * L); // rough px per band step
              e = Math.min(fq, 1 - fq) * bandPx * 2.2;
              if (pat === 'fluid') t = (Math.floor(q) + 0.5) / L;
              else { t = 0.08 + (Math.floor(q) / L) * 0.25; gl = 1 - smoothstep(0.5 * k, 2.4 * k, e); e = 1e9; }
              break;
            }
            case 'circuit': {
              const X = u * px * 2, Y = v * py * 2, nx = px * 2, ny = py * 2;
              const i0 = Math.floor(X), j0 = Math.floor(Y), fx = X - i0 - 0.5, fy = Y - j0 - 0.5;
              const cw = W / nx, ch = H / ny;
              const R = (i, j) => hash(U.mod(i, nx), U.mod(j, ny), seed + 21) < dens * 0.75; // trace to the right
              const D = (i, j) => hash(U.mod(i, nx), U.mod(j, ny), seed + 22) < dens * 0.6; // trace down
              let d = 1e9;
              const tw = Math.max(0.6, 1.4 * k);
              if (R(i0, j0) && fx >= 0) d = Math.min(d, Math.abs(fy) * ch);
              if (R(i0 - 1, j0) && fx <= 0) d = Math.min(d, Math.abs(fy) * ch);
              if (D(i0, j0) && fy >= 0) d = Math.min(d, Math.abs(fx) * cw);
              if (D(i0, j0 - 1) && fy <= 0) d = Math.min(d, Math.abs(fx) * cw);
              const deg = R(i0, j0) + R(i0 - 1, j0) + D(i0, j0) + D(i0, j0 - 1);
              const pr = Math.hypot(fx * cw, fy * ch), padR = Math.min(cw, ch) * 0.2;
              const pad = deg === 1 || (deg > 0 && hash(U.mod(i0, nx), U.mod(j0, ny), seed + 23) < 0.25);
              const trace = Math.max(clamp(tw - d + 0.5), pad ? clamp(padR - pr + 0.5) - clamp(padR * 0.45 - pr + 0.5) : 0);
              const blk = hash(Math.floor(U.mod(i0, nx) / 4), Math.floor(U.mod(j0, ny) / 4), seed + 24);
              t = lerp(blk * 0.4, 0.9, trace);
              gl = trace;
              sh = -(1 - smoothstep(0, tw * 4, d)) * 0.3;
              break;
            }
            case 'glitch': {
              const rows = py * 4, row = Math.floor(v * rows), rid = U.mod(row, rows);
              const shift = hash(rid, 1, seed) < dens * 0.6 ? (hash(rid, 2, seed) - 0.5) * 0.4 : 0;
              const uu = u + Math.round(shift * px * 4) / (px * 4);
              const base = U.fractal('perlin', uu * px, v * py, px, py, 2, 0.5, 'fbm', seed + 31);
              const bxk = Math.floor(U.mod(uu, 1) * px * 3), byk = rid;
              const blk = hash(U.mod(bxk, px * 3), byk, seed + 32) < dens * 0.25;
              t = blk ? hash(bxk, byk, seed + 33) : Math.floor(base * 4) / 4 + 0.12;
              if (blk) gl = 0.7;
              e = Math.min(U.mod(v * rows, 1), 1 - U.mod(v * rows, 1)) * (H / rows) + (shift ? 0 : 1e9);
              break;
            }
            case 'splatter': {
              t = 0.06;
              for (let L = 0; L < 3; L++) {
                const f = px * (1 + L), g = py * (1 + L);
                const w = U.worley(U0 * f, V0 * g, f, g, seed + 41 + L);
                if (w.id > dens * 0.85 + 0.1) continue;
                const rr = 0.18 + w.id * 0.25 + (U.fractal('perlin', U0 * f * 3, V0 * g * 3, f * 3, g * 3, 2, 0.5, 'fbm', seed + 44 + L) - 0.5) * 0.3;
                const cp = (W / f) * 1;
                const ed = (rr - w.f1) * cp;
                if (ed > -0.5) { t = 0.32 + L * 0.28; e = Math.max(0, ed); sh = (0.5 - w.f1 / rr) * 0.6; }
              }
              break;
            }
            case 'scales': {
              const j0 = Math.floor(y / scH);
              let hit = false;
              for (let j = j0 + 2; j >= j0 - 2 && !hit; j--) {
                const off = U.mod(j, 2) ? 0.5 : 0, ic = Math.round(x / scW - off);
                for (let ii = ic - 1; ii <= ic + 1; ii++) {
                  const cx = (ii + off) * scW, cy = j * scH, d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
                  if (d < scR) {
                    const sid = hash(U.mod(ii, px), U.mod(j, scRows), seed + 51);
                    t = clamp(0.25 + (cy / H) * 0.4 + sid * 0.3);
                    t = clamp(U.mod(t + slow[i] * 0.4, 1));
                    e = scR - d; sh = 0.55 - (d / scR) * 1.1 + ((y + 0.5 - cy) / scR) * 0.4;
                    hit = true; break;
                  }
                }
              }
              break;
            }
            case 'blocks': {
              let lv = 1, X = u * px, Y = v * py, ci = Math.floor(X), cj = Math.floor(Y), size = 1;
              for (let L = 0; L < 3; L++) {
                if (hash(U.mod(ci, px * lv), U.mod(cj, py * lv), seed + 61 + L) > dens * 0.8) break;
                lv *= 2; X = u * px * lv; Y = v * py * lv; ci = Math.floor(X); cj = Math.floor(Y); size = 1 / lv;
              }
              const fx = X - ci, fy = Y - cj, cw = W / (px * lv), ch = H / (py * lv);
              t = hash(U.mod(ci, px * lv), U.mod(cj, py * lv), seed + 65);
              e = Math.min(fx * cw, (1 - fx) * cw, fy * ch, (1 - fy) * ch);
              sh = (fy < 0.15 ? 0.4 : fy > 0.85 ? -0.4 : 0) * size;
              break;
            }
            case 'carbon': {
              // 2×2 twill weave: tows alternate direction per cell, fibres along the tow
              const X = u * px * 2, Y = v * py * 2, ci = Math.floor(X), cj = Math.floor(Y), fx = X - ci, fy = Y - cj;
              const horiz = U.mod(ci + cj, 4) < 2;
              const across = horiz ? fy : fx, along = horiz ? fx : fy;
              const tow = Math.sin(across * Math.PI), fib = Math.sin(across * Math.PI * 14 + hash(ci, cj, seed) * 6) * 0.08;
              t = clamp(0.12 + tow * 0.25 + fib + slow[i] * 0.1);
              sh = (tow - 0.6) * 1 + Math.sin(along * Math.PI) * 0.15 * (horiz ? 1 : -1);
              break;
            }
          }

          // palette
          const idx = clamp(U.mod(t + p.palShift, 1.0000001) + p.palBias * 0.35);
          let r, g, b;
          if (p.palMode === 'ramp') {
            const q = idx * 3, n = Math.min(2, Math.floor(q)), f = q - n, A = cols[n], B = cols[n + 1];
            r = lerp(A[0], B[0], f); g = lerp(A[1], B[1], f); b = lerp(A[2], B[2], f);
          } else { const c = cols[Math.min(3, Math.floor(idx * 4))]; r = c[0]; g = c[1]; b = c[2]; }

          if (p.shade > 0 && sh) { const m = 1 + sh * p.shade * 0.6; r *= m; g *= m; b *= m; }
          if (p.halftone > 0) {
            const A = u * hn + v * hm, B = u * hn - v * hm, fa = A - Math.floor(A) - 0.5, fb = B - Math.floor(B) - 0.5;
            const dd = Math.hypot(fa, fb), rad = 0.12 + slow[i] * 0.38;
            const dot = clamp((rad - dd) * hs + 0.5) * p.halftone;
            r = lerp(r, halfC[0], dot); g = lerp(g, halfC[1], dot); b = lerp(b, halfC[2], dot);
          }
          if (p.flake > 0) {
            const fl = hash(x >> 1, y >> 1, seed + 71);
            if (fl > 1 - p.flake * 0.12) { const m = 1 + (hash(x, y, seed + 72) * 0.6 + 0.2) * p.flake; r *= m; g *= m; b *= m; }
            else { const m = 1 + (fl - 0.5) * p.flake * 0.12; r *= m; g *= m; b *= m; }
          }
          if (inkW > 0 && e < inkW + 1) {
            const ic = clamp(inkW / 2 - e + 0.5 + inkW / 2);
            r = lerp(r, ink[0], ic); g = lerp(g, ink[1], ic); b = lerp(b, ink[2], ic);
          }
          if (p.grain > 0) { const m = 1 + (hash(x, y, seed + 73) - 0.5) * p.grain * 0.18; r *= m; g *= m; b *= m; }
          const emis = clamp(gl * p.glow);
          if (emis > 0) { r = lerp(r, glowC[0], emis) + glowC[0] * emis * 0.25; g = lerp(g, glowC[1], emis) + glowC[1] * emis * 0.25; b = lerp(b, glowC[2], emis) + glowC[2] * emis * 0.25; }
          if (p.scan > 0) { const s = 1 - p.scan * 0.28 * (0.5 + 0.5 * Math.cos(v * scanN * TAU)); r *= s; g *= s; b *= s; }

          // wear: worn-off paint -> brushed metal
          let wm = 0;
          if (wearF) {
            // edges only lower the threshold where the noise is already high: chipped corners, not outlines
            const edge = p.edgeWear * (1 - smoothstep(0, 6 * k, e));
            wm = smoothstep(0.8 - p.wear * 0.42, 0.84 - p.wear * 0.42, wearF[i] + edge * 0.2 * smoothstep(0.45, 0.65, wearF[i]));
          }
          if (scr) wm = Math.max(wm, scr[i] * 0.9);
          if (wm > 0) {
            const br = U.fractal('perlin', u * brx, v * bry, brx, bry, 2, 0.5, 'fbm', seed + 75);
            const mm = 0.8 + br * 0.4;
            r = lerp(r, metal[0] * mm, wm); g = lerp(g, metal[1] * mm, wm); b = lerp(b, metal[2] * mm, wm);
          }
          if (dirtF) { const d = smoothstep(0.5, 0.85, dirtF[i]) * p.dirt * 0.6; r *= 1 - d; g *= 1 - d * 1.02; b *= 1 - d * 1.08; }

          const k4 = i * 4;
          if (layer === 'emissive') { const ee = emis * (1 - wm); o[k4] = glowC[0] * ee; o[k4 + 1] = glowC[1] * ee; o[k4 + 2] = glowC[2] * ee; }
          else if (layer === 'wear') { o[k4] = o[k4 + 1] = o[k4 + 2] = wm * 255; }
          else if (layer === 'index') { o[k4] = o[k4 + 1] = o[k4 + 2] = idx * 255; }
          else { o[k4] = r; o[k4 + 1] = g; o[k4 + 2] = b; }
          o[k4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });

  function pal(name) { const c = PALETTES[name]; return { c1: c[0], c2: c[1], c3: c[2], c4: c[3] }; }
})();
