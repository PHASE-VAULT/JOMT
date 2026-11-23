/* Blood stain UI: blood elements for menus, damage HUDs, horror panels and title backdrops (transparent).
   A shape (brush smear, splat, drip edge, hand print smear, ring stain, wiped panel, spray) is drawn as
   coverage on a canvas and / or splatted as metaballs into a density field; drips hang from the lowest
   edge of whatever was drawn and droplets scatter around it. The field is domain-warped and thresholded
   with fine noise for rough edges, then colored: thickness variation, brush streaks, dried rim, fresh ->
   dried color, a wet sheen from the field's height (angled or ambient light) or a flat toon look.
   Optional depth-of-field blur: a disc (bokeh) kernel with highlight bloom, uniform, tilt-shift band or
   sharp core. Everything is in short-side units and noise is sampled per short side, so preview = export. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const TAU = Math.PI * 2;

  const SHAPES = [['smear', 'Brush smear'], ['splat', 'Splat'], ['drips', 'Drip edge (top)'], ['hand', 'Hand print smear'], ['ring', 'Ring stain'], ['wiped', 'Wiped panel'], ['spray', 'Spray / mist']];
  const is = (...l) => (p) => l.includes(p.shape);
  const blurOn = (p) => p.blur > 0;

  /* separable box blur of a single channel (zero outside), `passes` times */
  function boxBlur(src, W, H, r, passes) {
    r = Math.max(1, Math.round(r));
    let a = Float32Array.from(src), b = new Float32Array(W * H);
    const inv = 1 / (2 * r + 1);
    for (let n = 0; n < passes; n++) {
      for (let y = 0; y < H; y++) {
        const o = y * W; let s = 0;
        for (let k = 0; k <= r && k < W; k++) s += a[o + k];
        for (let x = 0; x < W; x++) {
          b[o + x] = s * inv;
          if (x + r + 1 < W) s += a[o + x + r + 1];
          if (x - r >= 0) s -= a[o + x - r];
        }
      }
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = 0; k <= r && k < H; k++) s += b[k * W + x];
        for (let y = 0; y < H; y++) {
          a[y * W + x] = s * inv;
          if (y + r + 1 < H) s += b[(y + r + 1) * W + x];
          if (y - r >= 0) s -= b[(y - r) * W + x];
        }
      }
    }
    return a;
  }

  /* disc (bokeh) blur of planar channels (Float32, length W*H each), radius r px. It runs on a copy
     downsampled so the disc stays ~5 px (the result is smooth anyway) and is scaled back up bilinearly. */
  function discBlur(chs, W, H, r) {
    const f = Math.max(1, Math.ceil(r / 5)), w = Math.ceil(W / f), h = Math.ceil(H / f), rr = r / f, ri = Math.ceil(rr);
    const spans = new Int32Array(2 * ri + 1);
    let area = 0;
    for (let dy = -ri; dy <= ri; dy++) { const q = (rr + 0.5) ** 2 - dy * dy, hw = q < 0 ? -1 : Math.floor(Math.sqrt(q)); spans[dy + ri] = hw; if (hw >= 0) area += 2 * hw + 1; }
    // index / weight tables shared by every channel
    const xs = new Int32Array(W), ys = new Int32Array(H);
    for (let x = 0; x < W; x++) xs[x] = (x / f) | 0;
    for (let y = 0; y < H; y++) ys[y] = (y / f) | 0;
    const ux0 = new Int32Array(W), ux1 = new Int32Array(W), utx = new Float32Array(W), uy0 = new Int32Array(H), uy1 = new Int32Array(H), uty = new Float32Array(H);
    const tab = (n, m, i0, i1, t) => { for (let x = 0; x < n; x++) { const fx = Math.min(m - 1, Math.max(0, (x + 0.5) / f - 0.5)), i = Math.floor(fx); i0[x] = i; i1[x] = Math.min(m - 1, i + 1); t[x] = fx - i; } };
    tab(W, w, ux0, ux1, utx); tab(H, h, uy0, uy1, uty);
    const sm = new Float32Array(w * h), P = new Float32Array((w + 1) * h), invA = 1 / area, inv = 1 / (f * f);
    return chs.map((src) => {
      if (f === 1) sm.set(src);
      else {
        sm.fill(0);
        for (let y = 0, i = 0; y < H; y++) { const sy = ys[y] * w; for (let x = 0; x < W; x++, i++) sm[sy + xs[x]] += src[i]; }
        for (let i = 0; i < sm.length; i++) sm[i] *= inv;
      }
      // row prefix sums, then sum the disc's row spans
      for (let y = 0; y < h; y++) { let s = 0; const o = y * (w + 1); P[o] = 0; for (let x = 0; x < w; x++) { s += sm[y * w + x]; P[o + x + 1] = s; } }
      const out = new Float32Array(w * h);
      for (let y = 0; y < h; y++) {
        const k0 = Math.max(-ri, -y), k1 = Math.min(ri, h - 1 - y);
        for (let x = 0; x < w; x++) {
          let s = 0;
          for (let dy = k0; dy <= k1; dy++) {
            const hw = spans[dy + ri]; if (hw < 0) continue; const o = (y + dy) * (w + 1), x0 = x - hw < 0 ? 0 : x - hw, x1 = x + hw + 1 > w ? w : x + hw + 1;
            s += P[o + x1] - P[o + x0];
          }
          out[y * w + x] = s * invA;
        }
      }
      if (f === 1) return out;
      const up = new Float32Array(W * H);
      for (let y = 0, i = 0; y < H; y++) {
        const r0 = uy0[y] * w, r1 = uy1[y] * w, ty = uty[y];
        for (let x = 0; x < W; x++, i++) {
          const a0 = ux0[x], a1 = ux1[x], tx = utx[x], top = out[r0 + a0] + (out[r0 + a1] - out[r0 + a0]) * tx, bot = out[r1 + a0] + (out[r1 + a1] - out[r1 + a0]) * tx;
          up[i] = top + (bot - top) * ty;
        }
      }
      return up;
    });
  }

  U.register({
    id: 'blood-ui',
    name: 'Blood Stain UI',
    desc: 'Blood smears, splats, drip edges, hand prints, ring stains, wiped panels and sprays for horror menus and damage HUDs, with sheen and depth-of-field blur',
    uses: [
      'Horror UI art: brush-smear menu highlights, title backdrops, wiped panels, damage-HUD corner drips and bloody hand prints.',
      'Foreground blood on the lens (out-of-focus splats), stylized toon blood for cartoon games, and stain decals for posters and thumbnails.',
    ],
    tags: ['Horror', 'UI', 'Decals'],
    aspect: '2:1',
    bg: 'white',
    icon: U.icon('<path d="M3 9c3-2 7-2.5 11-2s6 .5 7 1.5c-1 1.6-5 2.4-9 2.6-3 .2-6 0-9-.6"/><path d="M8 11v4.5M8 15.5a1 1 0 0 0 2 0V12M15 10.5v6a1.2 1.2 0 0 0 2.4 0v-6.5"/><circle cx="20" cy="15" r=".8"/>'),
    params: [
      { type: 'section', label: 'Shape' },
      { key: 'shape', label: 'Shape', type: 'select', default: 'smear', options: SHAPES },
      { key: 'size', label: 'Size', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.85, tip: 'How much of the image the shape fills' },
      { key: 'angle', label: 'Angle', type: 'range', min: -180, max: 180, step: 1, default: -4, show: is('smear', 'hand', 'spray', 'wiped'), tip: 'Stroke / drag / spray direction' },
      { key: 'width', label: 'Stroke width', type: 'range', min: 0.04, max: 0.8, step: 0.005, default: 0.34, show: is('smear', 'wiped', 'ring'), tip: 'Fraction of the short side' },
      { key: 'bend', label: 'Bend', type: 'range', min: -1, max: 1, step: 0.01, default: 0.25, show: is('smear') },
      { key: 'dryBrush', label: 'Dry brush', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: is('smear', 'wiped'), tip: 'The stroke runs out of blood toward its end and breaks into bristle lines' },
      { key: 'smearLen', label: 'Smear length', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: is('hand') },
      { key: 'edgeFrom', key2: 'edgeTo', label: 'Edge span', type: 'span', min: 0, max: 1, step: 0.01, default: 0, default2: 1, show: is('drips'), tip: 'Part of the top edge the blood runs along (0 … 0.4 = top-left corner)' },
      { key: 'edgeDepth', label: 'Edge depth', type: 'range', min: 0.02, max: 0.6, step: 0.005, default: 0.14, show: is('drips'), tip: 'Height of the band at the top, fraction of the image height' },
      { key: 'blobs', label: 'Blobs', type: 'int', min: 1, max: 12, default: 5, show: is('splat') },
      { key: 'spikes', label: 'Spikes', type: 'int', min: 0, max: 40, default: 14, show: is('splat') },
      { key: 'density', label: 'Density', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.6, show: is('spray') },
      { key: 'seed', label: 'Seed', type: 'seed', default: 12 },

      { type: 'section', label: 'Edges & drips' },
      { key: 'rough', label: 'Edge roughness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'roughScale', label: 'Roughness scale', type: 'range', min: 2, max: 40, step: 0.5, default: 10, show: (p) => p.rough > 0, tip: 'Wobbles across the short side' },
      { key: 'drips', label: 'Drips', type: 'int', min: 0, max: 40, default: 4, tip: 'Runs hanging from the lowest edge of the shape' },
      { key: 'dripMin', key2: 'dripMax', label: 'Drip length', type: 'span', min: 0.02, max: 1, step: 0.01, default: 0.08, default2: 0.3, show: (p) => p.drips > 0, tip: 'Fraction of the image height' },
      { key: 'dripW', label: 'Drip width', type: 'range', min: 0.003, max: 0.04, step: 0.001, default: 0.011, show: (p) => p.drips > 0 },
      { key: 'droplets', label: 'Droplets', type: 'int', min: 0, max: 400, default: 30 },
      { key: 'dropSize', label: 'Droplet size', type: 'range', min: 0.002, max: 0.05, step: 0.001, default: 0.012, show: (p) => p.droplets > 0 },
      { key: 'dropSpread', label: 'Droplet spread', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.droplets > 0 },

      { type: 'section', label: 'Texture' },
      { key: 'variation', label: 'Thickness variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Thin areas turn see-through, pooled areas darker' },
      { key: 'varScale', label: 'Variation scale', type: 'range', min: 1, max: 30, step: 0.5, default: 6, show: (p) => p.variation > 0 },
      { key: 'streaks', label: 'Streaks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, show: is('smear', 'wiped', 'hand', 'drips'), tip: 'Fine lines along the stroke / drag direction' },
      { key: 'rim', label: 'Dried rim', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Darker, drier edge like a stain that dried from the outside in' },

      { type: 'section', label: 'Color' },
      { key: 'style', label: 'Style', type: 'select', default: 'real', options: [['real', 'Realistic'], ['toon', 'Toon (flat colors)']] },
      { key: 'color', label: 'Fresh color', type: 'color', default: '#8e0a0a' },
      { key: 'dryColor', label: 'Dried color', type: 'color', default: '#3b160c' },
      { key: 'dry', label: 'Dryness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: '0 = fresh red, 1 = dried brown (also dulls the sheen)' },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 8, step: 0.1, default: 2.5, show: (p) => p.style === 'toon', tip: 'px @ 512' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#2a0004', show: (p) => p.style === 'toon' && p.outline > 0 },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.05, max: 1, step: 0.01, default: 1 },
      { key: 'bgMode', label: 'Background', type: 'select', default: 'transparent', options: [['transparent', 'Transparent'], ['color', 'Solid color']] },
      { key: 'bgColor', label: 'Background color', type: 'color', default: '#141414', show: (p) => p.bgMode === 'color' },

      { type: 'section', label: 'Sheen' },
      { key: 'sheen', label: 'Highlight sheen', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Wet highlights on the thick parts' },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'angled', options: [['angled', 'Angled (light angle)'], ['ambient', 'Ambient (soft, no direction)']], show: (p) => p.sheen > 0, tip: 'Ambient: soft, even sheen along every slope, no direction' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -135, show: (p) => p.sheen > 0 && p.lightMode !== 'ambient', tip: 'Direction the light comes from (-135 = top left)' },
      { key: 'gloss', label: 'Glossiness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, show: (p) => p.sheen > 0, tip: 'Small, sharp highlights (high) or broad, soft ones (low)' },

      { type: 'section', label: 'Blur', active: blurOn },
      { key: 'blur', label: 'Out of focus', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Depth-of-field blur with a disc (bokeh) kernel, like blood on a lens close to the camera' },
      { key: 'focus', label: 'Focus', type: 'select', default: 'uniform', options: [['uniform', 'Uniform'], ['tilt', 'Tilt-shift band'], ['core', 'Sharp core']], show: blurOn, tip: 'Tilt-shift: sharp along a band, blurrier away from it. Sharp core: sharp center, blur grows toward the edges' },
      { key: 'focusPos', label: 'Focus band position', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => blurOn(p) && p.focus === 'tilt' },
      { key: 'focusAngle', label: 'Focus band angle', type: 'range', min: -90, max: 90, step: 1, default: 0, show: (p) => blurOn(p) && p.focus === 'tilt' },
      { key: 'focusWidth', label: 'Sharp area size', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => blurOn(p) && p.focus !== 'uniform' },
      { key: 'bokeh', label: 'Highlight bloom', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: blurOn, tip: 'Bright highlights spread into brighter discs, like bokeh' },
    ],
    presets: [
      { name: 'Menu smear', group: 'Menu & title', aspect: '2:1', values: {} },
      { name: 'Menu highlight (thin)', group: 'Menu & title', aspect: '4:1', values: { width: 0.55, bend: 0.1, dryBrush: 0.6, streaks: 0.75, drips: 3, dripMin: 0.15, dripMax: 0.45, dripW: 0.02, droplets: 12, seed: 4 } },
      { name: 'Title splat', group: 'Menu & title', aspect: '2:1', values: { shape: 'splat', size: 0.9, blobs: 7, spikes: 22, droplets: 90, dropSpread: 0.6, drips: 5, dripMax: 0.35, sheen: 0.55, seed: 21 } },
      { name: 'Slash smear', group: 'Menu & title', aspect: '2:1', values: { width: 0.16, angle: -14, bend: -0.35, dryBrush: 0.75, streaks: 0.8, drips: 2, droplets: 40, dropSpread: 0.5, seed: 33 } },
      { name: 'Dry brush stroke', group: 'Menu & title', aspect: '2:1', values: { dryBrush: 1, streaks: 0.9, rough: 0.7, drips: 0, droplets: 8, sheen: 0.2, dry: 0.35, seed: 9 } },
      { name: 'Damage corner drips', group: 'Damage HUD', aspect: '16:9', values: { shape: 'drips', edgeFrom: 0, edgeTo: 0.42, edgeDepth: 0.16, drips: 9, dripMin: 0.06, dripMax: 0.4, dripW: 0.012, droplets: 25, dropSpread: 0.25, streaks: 0.2, seed: 5 } },
      { name: 'Top edge bleed', group: 'Damage HUD', aspect: '16:9', values: { shape: 'drips', edgeDepth: 0.09, drips: 22, dripMin: 0.04, dripMax: 0.5, dripW: 0.009, droplets: 10, streaks: 0.15, seed: 17 } },
      { name: 'Lens splat (out of focus)', group: 'Damage HUD', aspect: '16:9', values: { shape: 'splat', size: 0.7, blobs: 6, spikes: 16, droplets: 70, dropSpread: 0.7, drips: 3, sheen: 0.7, blur: 0.55, focus: 'uniform', bokeh: 0.7, opacity: 0.9, seed: 44 } },
      { name: 'Foreground splat, sharp core', group: 'Damage HUD', aspect: '16:9', values: { shape: 'splat', size: 0.85, blobs: 8, spikes: 24, droplets: 120, dropSpread: 0.9, drips: 4, sheen: 0.6, blur: 0.6, focus: 'core', focusWidth: 0.2, seed: 8 } },
      { name: 'Wiped panel', group: 'Horror panels', aspect: '2:1', values: { shape: 'wiped', size: 0.88, width: 0.22, dryBrush: 0.7, streaks: 0.85, variation: 0.6, drips: 6, dripMin: 0.05, dripMax: 0.22, droplets: 15, dry: 0.3, sheen: 0.25, seed: 14 } },
      { name: 'Bloody hand print smear', group: 'Horror panels', aspect: '1:1', values: { shape: 'hand', size: 0.62, angle: 90, smearLen: 0.55, streaks: 0.7, drips: 3, dripMin: 0.05, dripMax: 0.18, droplets: 10, seed: 3 } },
      { name: 'Hand print', group: 'Horror panels', aspect: '1:1', values: { shape: 'hand', size: 0.8, angle: 80, smearLen: 0.06, streaks: 0.2, variation: 0.7, rough: 0.6, drips: 2, dripMax: 0.15, droplets: 6, seed: 27 } },
      { name: 'Dried stain', group: 'Horror panels', aspect: '1:1', values: { shape: 'splat', size: 0.75, blobs: 4, spikes: 8, droplets: 30, dropSpread: 0.4, drips: 0, dry: 0.85, rim: 0.85, variation: 0.7, sheen: 0.05, streaks: 0, seed: 61 } },
      { name: 'Ring stain', group: 'Horror panels', aspect: '1:1', values: { shape: 'ring', size: 0.7, width: 0.08, rim: 0.9, dry: 0.55, variation: 0.6, drips: 0, droplets: 14, dropSpread: 0.3, sheen: 0.1, streaks: 0, seed: 2 } },
      { name: 'Spray', group: 'Horror panels', aspect: '1:1', values: { shape: 'spray', size: 0.8, density: 0.7, angle: 20, drips: 4, dripMax: 0.2, dripW: 0.007, droplets: 60, dropSpread: 0.6, streaks: 0, sheen: 0.3, seed: 15 } },
      { name: 'Tilt-shift smear', group: 'Horror panels', aspect: '2:1', values: { blur: 0.5, focus: 'tilt', focusPos: 0.45, focusWidth: 0.12, focusAngle: -6, bokeh: 0.6, seed: 23 } },
      { name: 'Toon blood', group: 'Stylized', aspect: '1:1', values: { shape: 'splat', style: 'toon', color: '#d81a24', size: 0.8, blobs: 5, spikes: 12, droplets: 25, dropSize: 0.02, rough: 0.15, variation: 0, streaks: 0, rim: 0.5, drips: 3, dripW: 0.016, sheen: 0.7, lightMode: 'angled', outline: 3, seed: 30 } },
      { name: 'Toon drip edge', group: 'Stylized', aspect: '16:9', values: { shape: 'drips', style: 'toon', color: '#e0202a', edgeDepth: 0.12, drips: 11, dripMin: 0.08, dripMax: 0.45, dripW: 0.02, rough: 0.1, variation: 0, streaks: 0, rim: 0.4, droplets: 0, sheen: 0.6, outline: 3, seed: 6 } },
      { name: 'Toon smear', group: 'Stylized', aspect: '2:1', values: { style: 'toon', color: '#c4121c', rough: 0.2, dryBrush: 0.6, streaks: 0, variation: 0, rim: 0.4, drips: 3, dripW: 0.018, droplets: 10, dropSize: 0.018, sheen: 0.6, outline: 2.5, seed: 19 } },
      { name: 'Black ichor', group: 'Sci-fi', aspect: '2:1', values: { shape: 'smear', color: '#14161c', dryColor: '#050507', dry: 0, sheen: 0.8, gloss: 0.8, drips: 6, dripMax: 0.4, rim: 0.2, seed: 50 } },
      { name: 'Alien blood splat', group: 'Sci-fi', aspect: '1:1', values: { shape: 'splat', color: '#5fd11a', dryColor: '#2c4a08', dry: 0.1, size: 0.85, blobs: 6, spikes: 18, droplets: 80, sheen: 0.65, rim: 0.5, drips: 3, seed: 72 } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), cx = W / 2, cy = H / 2, rnd = U.rng(p.seed), N = W * H;
      const ang = (p.angle * Math.PI) / 180, toon = p.style === 'toon';

      /* ---------- 1. coverage drawn on a canvas ---------- */
      const cv = U.canvas(W, H), c = cv.getContext('2d');
      c.fillStyle = '#fff'; c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round';
      // metaball field (splats, drips, droplets): small balls at full resolution, big ones on a 1/Q grid
      const B = new Float32Array(N), Q = 4, QW = Math.ceil(W / Q) + 2, QH = Math.ceil(H / Q) + 2, BQ = new Float32Array(QW * QH);
      const K = 0.5 / 0.5625; // field = 0.5 exactly at the ball radius
      const splat = (arr, w, h, bx, by, r, a, st) => {
        const R = 2 * r, reach = R * st, co = Math.cos(a), si = Math.sin(a), iR = 1 / (R * R);
        const x0 = Math.max(0, Math.floor(bx - reach)), x1 = Math.min(w - 1, Math.ceil(bx + reach));
        const y0 = Math.max(0, Math.floor(by - reach)), y1 = Math.min(h - 1, Math.ceil(by + reach));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - bx, dy = y + 0.5 - by, u = (dx * co + dy * si) / st, v = -dx * si + dy * co;
          const q = 1 - (u * u + v * v) * iR;
          if (q > 0) arr[y * w + x] += K * q * q;
        }
      };
      const ball = (bx, by, r, a = 0, st = 1) => {
        r = Math.max(0.4, r);
        if (r >= 3 * Q) splat(BQ, QW, QH, bx / Q, by / Q, r / Q, a, st);
        else splat(B, W, H, bx, by, r, a, st);
      };
      // adds both ball fields into F and clears them
      const mergeBalls = (F) => {
        for (let y = 0, i = 0; y < H; y++) {
          const fy = (y + 0.5) / Q - 0.5, j = Math.max(0, Math.floor(fy)), ty = clamp(fy - j);
          for (let x = 0; x < W; x++, i++) {
            const fx = (x + 0.5) / Q - 0.5, k = Math.max(0, Math.floor(fx)), tx = clamp(fx - k), o = j * QW + k;
            const a = BQ[o] + (BQ[o + 1] - BQ[o]) * tx, b = BQ[o + QW] + (BQ[o + QW + 1] - BQ[o + QW]) * tx;
            F[i] += B[i] + a + (b - a) * ty;
          }
        }
        B.fill(0); BQ.fill(0);
      };

      // brush stroke from a to b: a solid core plus bristle lines that run out toward the end
      const stroke = (ax, ay, bx, by, hw, bendK, dry, alpha, cap = 0.07) => {
        const L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L, nx = -uy, ny = ux, n = 48;
        const pt = (t, o) => {
          const bendO = bendK * L * 0.18 * (1 - (2 * t - 1) ** 2) + Math.sin(t * 7 + p.seed) * hw * 0.08;
          const w = hw * Math.sqrt(1 - (1 - Math.min(1, t / cap)) ** 2) * (1 - 0.3 * smoothstep(0.5, 1, t)) * (0.92 + 0.08 * Math.sin(t * 13 + p.seed * 3));
          return [ax + ux * L * t + nx * (bendO + o * w), ay + uy * L * t + ny * (bendO + o * w)];
        };
        // core: a filled band that stops earlier the drier the brush
        const tc = 1 - dry * 0.8, core = 0.85;
        c.globalAlpha = alpha; c.beginPath();
        for (let i = 0; i <= n; i++) { const [x, y] = pt((i / n) * tc, -core); i ? c.lineTo(x, y) : c.moveTo(x, y); }
        for (let i = n; i >= 0; i--) { const [x, y] = pt((i / n) * tc, core); c.lineTo(x, y); }
        c.closePath(); c.fill();
        // bristles: each runs out of blood somewhere along the dry part, the outer ones earlier
        const nb = Math.round(clamp((hw / S) * 420, 30, 120));
        for (let j = 0; j < nb; j++) {
          const o = rnd() * 2 - 1, te = Math.max(0.12, 1 - dry * rnd() ** 0.6 * 0.7 - o * o * dry * 0.2), ts = rnd() * 0.03;
          c.lineWidth = Math.max(0.6, ((hw * 2) / nb) * (1.2 + rnd() * 2.2));
          c.globalAlpha = alpha * (0.7 + 0.3 * rnd());
          c.beginPath();
          for (let i = 0; i <= 30; i++) { const [x, y] = pt(ts + (te - ts) * (i / 30), o); i ? c.lineTo(x, y) : c.moveTo(x, y); }
          c.stroke();
        }
        c.globalAlpha = 1;
      };
      // longest centered segment along angle a that fits inside the canvas with a margin
      const span = (a, m) => Math.min((W - 2 * m) / Math.max(1e-3, Math.abs(Math.cos(a))), (H - 2 * m) / Math.max(1e-3, Math.abs(Math.sin(a))));

      switch (p.shape) {
        case 'smear': {
          const hw = (p.width * S) / 2, m = hw * 1.1 + Math.abs(p.bend) * S * 0.05 + S * 0.03, L = span(ang, m) * p.size;
          stroke(cx - (Math.cos(ang) * L) / 2, cy - (Math.sin(ang) * L) / 2, cx + (Math.cos(ang) * L) / 2, cy + (Math.sin(ang) * L) / 2, hw, p.bend, p.dryBrush, 1);
          break;
        }
        case 'wiped': {
          // a panel made of overlapping horizontal-ish wipes
          const pw = W * p.size * 0.92, ph = H * p.size * 0.75, n = Math.max(2, Math.round(ph / (p.width * S * 0.55))), hw = Math.min(ph / n, p.width * S * 0.5);
          for (let i = 0; i < n; i++) {
            const y = cy - ph / 2 + hw + ((ph - 2 * hw) * i) / Math.max(1, n - 1), a = ang + (rnd() - 0.5) * 0.08, l = pw * (0.8 + rnd() * 0.2) - 2 * hw;
            const sx = cx + (rnd() - 0.5) * pw * 0.06, dir = i % 2 ? -1 : 1;
            stroke(sx - (dir * Math.cos(a) * l) / 2, y - (dir * Math.sin(a) * l) / 2, sx + (dir * Math.cos(a) * l) / 2, y + (dir * Math.sin(a) * l) / 2, hw * (0.85 + rnd() * 0.3), (rnd() - 0.5) * 0.4, p.dryBrush * (0.6 + rnd() * 0.4), 0.7 + rnd() * 0.3, 0.012 + rnd() * 0.02);
          }
          break;
        }
        case 'drips': {
          const x0 = p.edgeFrom * W, x1 = Math.max(x0 + 2, p.edgeTo * W), d = p.edgeDepth * H, n = 64;
          c.beginPath(); c.moveTo(x0, -2);
          for (let i = 0; i <= n; i++) {
            const t = i / n, x = x0 + (x1 - x0) * t;
            // taper toward ends that lie inside the image; ends on the image border stay full
            const endA = p.edgeFrom > 0.005 ? Math.sqrt(1 - (1 - Math.min(1, t / 0.3)) ** 2) : 1, endB = p.edgeTo < 0.995 ? Math.sqrt(1 - (1 - Math.min(1, (1 - t) / 0.3)) ** 2) : 1;
            const wob = 0.75 + 0.35 * U.fractal('perlin', (x / S) * 6, 0.5, 0, 0, 3, 0.5, 'fbm', p.seed + 3);
            c.lineTo(x, d * wob * endA * endB);
          }
          c.lineTo(x1, -2); c.closePath(); c.fill();
          break;
        }
        case 'hand': {
          // hand space: fingers point to -y, the drag runs along +y (rotated onto the angle)
          const hs = p.size * S * 0.5 * (1 - 0.45 * p.smearLen), len = p.smearLen * (S * 0.95 - hs * 1.1), dx = Math.cos(ang), dy = Math.sin(ang);
          const mid = (-0.62 * hs + 0.5 * hs + len) / 2;
          c.save(); c.translate(cx - dx * mid, cy - dy * mid); c.rotate(Math.atan2(-dx, dy));
          // smear film and streaks first: contact points of the palm heel and fingers dragged along +y
          if (len > 1) {
            const g = c.createLinearGradient(0, 0, 0, len + 0.4 * hs);
            g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = g; c.beginPath(); c.ellipse(0, 0.1 * hs + len * 0.45, 0.3 * hs, 0.25 * hs + len * 0.5, 0, 0, TAU); c.fill(); c.fillStyle = '#fff';
            for (let i = 0; i < 9; i++) {
              const x0 = (-0.3 + (0.6 * i) / 8 + (rnd() - 0.5) * 0.05) * hs, te = 0.45 + rnd() * 0.55, w0 = hs * (0.05 + rnd() * 0.05), drift = (rnd() - 0.5) * 0.15 * hs;
              for (let j = 0; j < 12; j++) {
                const t0 = (j / 12) * te, t1 = ((j + 1) / 12) * te;
                c.globalAlpha = 1 - 0.55 * (j / 12); c.lineWidth = Math.max(0.6, w0 * (1.3 - 0.9 * (j / 12)));
                c.beginPath(); c.moveTo(x0 + drift * t0 * t0, 0.2 * hs + len * t0); c.lineTo(x0 + drift * t1 * t1, 0.2 * hs + len * t1); c.stroke();
              }
            }
            c.globalAlpha = 1;
          }
          // the print: palm, four fingers and the thumb
          c.beginPath(); c.ellipse(0, 0.12 * hs, 0.3 * hs, 0.33 * hs, 0, 0, TAU); c.fill();
          c.lineWidth = 0.115 * hs;
          for (const [fx, fl, fa] of [[-0.23, 0.38, -0.17], [-0.08, 0.47, -0.05], [0.075, 0.45, 0.05], [0.215, 0.34, 0.16]]) {
            c.beginPath(); c.moveTo(fx * hs, -0.08 * hs); c.lineTo(fx * hs + Math.sin(fa) * fl * hs, -0.08 * hs - Math.cos(fa) * fl * hs); c.stroke();
          }
          c.lineWidth = 0.13 * hs; c.beginPath(); c.moveTo(-0.24 * hs, 0.22 * hs); c.lineTo(-0.47 * hs, -0.02 * hs); c.stroke();
          c.restore();
          break;
        }
        case 'ring': {
          const R = p.size * S * 0.4, w = p.width * S * 0.5;
          const ring = (ox, oy, r, a0, a1, lw, al) => {
            c.lineWidth = lw; c.globalAlpha = al; c.beginPath();
            for (let i = 0; i <= 90; i++) {
              const a = a0 + ((a1 - a0) * i) / 90, rr = r * (1 + 0.05 * (U.fractal('perlin', Math.cos(a) * 1.5 + 5, Math.sin(a) * 1.5 + 5, 0, 0, 3, 0.5, 'fbm', p.seed) - 0.5) * 2);
              const x = ox + Math.cos(a) * rr, y = oy + Math.sin(a) * rr;
              i ? c.lineTo(x, y) : c.moveTo(x, y);
            }
            c.stroke();
          };
          c.fillStyle = 'rgba(255,255,255,0.3)'; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
          ring(cx, cy, R, 0, TAU, w, 1);
          ring(cx + R * 0.22, cy - R * 0.12, R * 0.92, 0.6, 3.2, w * 0.5, 0.75);
          c.globalAlpha = 1;
          break;
        }
        case 'spray': {
          const sg = p.size * S * 0.2, n = Math.round(400 + 5000 * p.density * p.size), co = Math.cos(ang), si = Math.sin(ang);
          const g = c.createRadialGradient(cx, cy, 0, cx, cy, sg * 1.1);
          g.addColorStop(0, `rgba(255,255,255,${0.6 + 0.4 * p.density})`); g.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = g; c.beginPath(); c.arc(cx, cy, sg * 1.1, 0, TAU); c.fill(); c.fillStyle = '#fff';
          for (let i = 0; i < n; i++) {
            // gaussian cloud, stretched along the spray direction
            const r1 = Math.sqrt(-2 * Math.log(1 - rnd() * 0.999)), t = rnd() * TAU, u = Math.cos(t) * r1 * sg * 1.35, v = Math.sin(t) * r1 * sg * 0.8;
            const x = cx + u * co - v * si, y = cy + u * si + v * co, r = S * 0.0022 * (0.5 + rnd() * 1.6) * (1.3 - Math.min(1, r1 / 3) * 0.6);
            c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
          }
          break;
        }
        case 'splat': {
          const main = p.size * S * 0.17, blobs = [[cx, cy, main]];
          for (let i = 1; i < p.blobs; i++) {
            const a = rnd() * TAU, d = main * (0.5 + rnd() * 0.9);
            blobs.push([cx + Math.cos(a) * d * (W / S) ** 0.5, cy + Math.sin(a) * d, main * (0.3 + rnd() * 0.35)]);
          }
          for (const [x, y, r] of blobs) {
            ball(x, y, r);
            for (let i = 0; i < 6; i++) { const a = rnd() * TAU, d = r * (0.3 + rnd() * 0.5); ball(x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.4 + rnd() * 0.35)); }
          }
          for (let i = 0; i < p.spikes; i++) {
            const [bx, by, br] = blobs[(rnd() * blobs.length) | 0], a = rnd() * TAU, L = br + main * (0.5 + rnd() * 1.1), w0 = Math.max(1, br * (0.14 + rnd() * 0.12));
            for (let j = 0; j <= 10; j++) { const t = j / 10, d = br * 0.6 + (L - br * 0.6) * t; ball(bx + Math.cos(a) * d, by + Math.sin(a) * d, w0 * (1 - t * 0.75), a, 1.6); }
            if (rnd() < 0.6) { const d = L + w0 * (2 + rnd() * 3); ball(bx + Math.cos(a) * d, by + Math.sin(a) * d, w0 * (0.5 + rnd() * 0.5)); }
          }
          break;
        }
      }

      /* ---------- 2. field: blurred coverage + metaballs ---------- */
      const img0 = c.getImageData(0, 0, W, H).data, C = new Float32Array(N);
      for (let i = 0; i < N; i++) C[i] = img0[i * 4 + 3] / 255;
      const F = boxBlur(C, W, H, Math.max(1, S * 0.004), 2);
      mergeBalls(F);

      // drips hang from the lowest edge of the shape
      if (p.drips > 0) {
        const bottom = new Int32Array(W).fill(-1);
        for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) if (F[y * W + x] > 0.5) { bottom[x] = y; break; }
        const cols = [];
        const minRun = Math.max(2, Math.round(p.dripW * S * 1.6));
        for (let x = 0; x < W; x++) { const y = bottom[x]; if (y >= minRun && F[(y - minRun) * W + x] > 0.5) cols.push(x); }
        for (let i = 0; i < p.drips && cols.length; i++) {
          const x = cols[(rnd() * cols.length) | 0], w = p.dripW * S * (0.55 + rnd() * 0.8);
          const L = Math.min(H - bottom[x] - S * 0.03 - w * 2, H * lerp(p.dripMin, p.dripMax, rnd() ** 1.4));
          if (L < w) continue;
          const y0 = bottom[x] - w * 1.5, steps = Math.max(4, Math.ceil(L / (w * 0.45))), wob = (rnd() - 0.5) * w * 1.5;
          for (let j = 0; j <= steps; j++) {
            const t = j / steps;
            ball(x + wob * t * t, y0 + L * t, w * (1 - 0.3 * t) * (j === 0 ? 1.6 : 1));
          }
          ball(x + wob, y0 + L + w * 0.3, w * 1.45); // bulb at the end
        }
      }
      // droplets scattered around the shape
      if (p.droplets > 0) {
        for (let i = 0; i < p.droplets; i++) {
          // always draw all 30 tries, so the random stream (and the layout) is the same at every size
          let sx = cx, sy = cy, hit = false;
          for (let t = 0; t < 30; t++) { const x = (rnd() * W) | 0, y = (rnd() * H) | 0; if (!hit && F[y * W + x] > 0.5) { sx = x; sy = y; hit = true; } }
          const a = p.shape === 'spray' ? ang + (rnd() - 0.5) * 2.2 : rnd() * TAU, d = S * (0.02 + rnd() ** 1.8 * p.dropSpread * 0.45);
          const r = p.dropSize * S * (0.25 + rnd() ** 2 * 1.2), x = sx + Math.cos(a) * d, y = sy + Math.sin(a) * d;
          if (x < r * 2 || y < r * 2 || x > W - r * 2 || y > H - r * 2) continue;
          ball(x, y, r, a, 1 + rnd() * 0.5);
        }
      }
      mergeBalls(F);

      /* ---------- 3. warped edges, thickness, color ---------- */
      const rs = p.roughScale, wAmp = p.rough * S * 0.018;
      const wx = p.rough > 0 ? U.coarseField(W, H, Math.max(16, rs * 5), (x, y) => U.fractal('perlin', (x / S) * rs, (y / S) * rs, 0, 0, 3, 0.5, 'fbm', p.seed + 11) - 0.5) : null;
      const wy = p.rough > 0 ? U.coarseField(W, H, Math.max(16, rs * 5), (x, y) => U.fractal('perlin', (x / S) * rs, (y / S) * rs, 0, 0, 3, 0.5, 'fbm', p.seed + 12) - 0.5) : null;
      const sample = (x, y) => {
        x = clamp(x, 0, W - 1.001); y = clamp(y, 0, H - 1.001);
        const i = x | 0, j = y | 0, tx = x - i, ty = y - j, o = j * W + i;
        const a = F[o] + (F[o + 1] - F[o]) * tx, b = F[o + W] + (F[o + W + 1] - F[o + W]) * tx;
        return a + (b - a) * ty;
      };
      // only the bounding box of the field (grown by the warp) needs the per-pixel work
      let bx0 = W, by0 = H, bx1 = -1, by1 = -1;
      for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) if (F[i] > 0.1) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
      const grow = Math.ceil(wAmp + 3);
      bx0 = Math.max(0, bx0 - grow); by0 = Math.max(0, by0 - grow); bx1 = Math.min(W - 1, bx1 + grow); by1 = Math.min(H - 1, by1 + grow);
      const Fw = new Float32Array(N), A = new Float32Array(N);
      for (let y = by0; y <= by1; y++) for (let x = bx0, i = y * W + bx0; x <= bx1; x++, i++) {
        let f = wx ? sample(x + wx[i] * wAmp * 2, y + wy[i] * wAmp * 2) : F[i];
        Fw[i] = f;
        if (f < 0.12) continue;
        let thr = 0.5;
        if (p.rough > 0 && f < 0.95) thr += U.value((x / S) * 80, (y / S) * 80, 0, 0, p.seed + 13) * p.rough * 0.16;
        const e = toon ? 0.025 : 0.06;
        A[i] = smoothstep(thr - e, thr + e, f);
      }
      const vS = p.varScale, varOn = p.variation > 0 || p.sheen > 0;
      const V1 = varOn ? U.coarseField(W, H, Math.max(12, vS * 5), (x, y) => U.fractal('perlin', (x / S) * vS, (y / S) * vS, 0, 0, 3, 0.55, 'fbm', p.seed + 21)) : null;
      const V2 = varOn ? U.coarseField(W, H, Math.max(24, vS * 18), (x, y) => U.fractal('value', (x / S) * vS * 4, (y / S) * vS * 4, 0, 0, 2, 0.5, 'fbm', p.seed + 22)) : null;
      // height for the sheen: the clipped coverage (a meniscus along every edge) plus a little of the
      // thickness noise, softened. Interior field bumps (bristles, overlapping balls) are ignored
      let Hf = null;
      if (p.sheen > 0) {
        const hs = new Float32Array(N);
        for (let i = 0; i < N; i++) if (A[i] > 0) hs[i] = A[i] * (0.75 + 0.25 * clamp(Fw[i] - 0.5));
        Hf = boxBlur(hs, W, H, Math.max(1, S * 0.011), 2);
      }
      const streakA = p.shape === 'drips' ? Math.PI / 2 : ang, sco = Math.cos(streakA), ssi = Math.sin(streakA);
      const streaky = p.streaks > 0 && ['smear', 'wiped', 'hand', 'drips'].includes(p.shape);
      const col = U.hex(p.color), dcol = U.hex(p.dryColor), dry = p.dry;
      const base = [lerp(col[0], dcol[0], dry), lerp(col[1], dcol[1], dry), lerp(col[2], dcol[2], dry)];
      const rimC = [dcol[0] * 0.75, dcol[1] * 0.7, dcol[2] * 0.7];
      const la = (p.lightAngle * Math.PI) / 180, Lx = Math.cos(la), Ly = Math.sin(la); // toward the light
      // half vector between the light (from the light angle, 45° up) and the viewer
      let hx = Math.cos(la) * 0.7, hy = Math.sin(la) * 0.7, hz = 0.7 + 1;
      { const l = Math.hypot(hx, hy, hz); hx /= l; hy /= l; hz /= l; }
      const shin = lerp(8, 90, p.gloss), amb = p.lightMode === 'ambient', sheen = p.sheen * (1 - dry * 0.8);
      const gK = S * 0.012 * 6; // height gradient -> normal tilt
      const R = new Float32Array(N), G = new Float32Array(N), Bc = new Float32Array(N); // straight color
      const s31 = p.seed + 31, s32 = p.seed + 32;
      for (let y = by0; y <= by1; y++) for (let x = bx0, i = y * W + bx0; x <= bx1; x++, i++) {
        let a = A[i];
        if (a <= 0) continue;
        const f = Fw[i];
        let r = base[0], g = base[1], b = base[2];
        // thickness: thin -> see-through, thick -> darker
        let L = 1;
        if (p.variation > 0 && !toon) L = 1 + p.variation * ((V1[i] - 0.5) * 2.2 + (V2[i] - 0.5) * 0.9);
        if (streaky && !toon) {
          const u = (x * sco + y * ssi) / S, v = (-x * ssi + y * sco) / S;
          // fine lines along the stroke, fading in and out along it
          const s = (0.5 + 0.333 * U.value(u * 3, v * 150, 0, 0, s31) + 0.167 * U.value(u * 6, v * 300, 0, 0, s31 + 1013)) * (1 + 0.4 * U.value(u * 6, v * 20, 0, 0, s32));
          L *= 1 - p.streaks * 0.7 * smoothstep(0.4, 0.8, s);
        }
        const thick = clamp((f - 0.5) * 1.2);
        if (!toon) {
          a *= clamp(0.15 + 0.85 * L);
          const dk = clamp((L - 1) * 0.8 + thick * 0.35) * 0.55;
          r *= 1 - dk; g *= 1 - dk; b *= 1 - dk;
        }
        // dried rim
        if (p.rim > 0) {
          const k = toon ? (f < 0.5 + 0.18 * p.rim ? 0.65 : 0) : (1 - smoothstep(0.5, 0.5 + 0.5 * p.rim + 0.05, f)) * p.rim;
          r = lerp(r, rimC[0], k); g = lerp(g, rimC[1], k); b = lerp(b, rimC[2], k);
        }
        // sheen from the height gradient
        if (sheen > 0 && x > 0 && y > 0 && x < W - 1 && y < H - 1) {
          const gx = (Hf[i + 1] - Hf[i - 1]) * gK, gy = (Hf[i + W] - Hf[i - W]) * gK;
          let nx = -gx, ny = -gy, nz = 1;
          const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
          let s;
          if (amb) s = clamp((1 - nz) * 2.5) * 0.5 * (0.5 + V2[i]);
          else s = Math.pow(Math.max(0, nx * hx + ny * hy + nz * hz), shin) * 1.3 + Math.max(0, nx * Lx + ny * Ly) * 0.12;
          s *= sheen * smoothstep(0.3, 0.9, a) * (0.35 + 1.1 * V2[i]);
          if (toon) s = s > 0.3 ? 0.85 : 0;
          r = lerp(r, 255, clamp(s)); g = lerp(g, 235, clamp(s)); b = lerp(b, 235, clamp(s));
        }
        A[i] = a; R[i] = r; G[i] = g; Bc[i] = b;
      }
      // toon outline: dilate the shape and fill the ring outside it
      if (toon && p.outline > 0) {
        const ow = p.outline * (S / 512), D = boxBlur(A, W, H, Math.max(1, ow * 0.6), 2), oc = U.hex(p.outlineColor);
        for (let i = 0; i < N; i++) {
          const o = smoothstep(0.02, 0.12, D[i]) * (1 - A[i]);
          if (o <= 0) continue;
          const na = A[i] + o;
          R[i] = (R[i] * A[i] + oc[0] * o) / na; G[i] = (G[i] * A[i] + oc[1] * o) / na; Bc[i] = (Bc[i] * A[i] + oc[2] * o) / na; A[i] = na;
        }
      }

      /* ---------- 4. depth-of-field blur ---------- */
      if (p.blur > 0) {
        const rad = p.blur * S * 0.05;
        // premultiplied color weighted by brightness (bloom), plain alpha, and the weight sum
        const pr = new Float32Array(N), pg = new Float32Array(N), pb = new Float32Array(N), pw = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          const a = A[i];
          if (!a) continue;
          const lum = (R[i] * 0.3 + G[i] * 0.55 + Bc[i] * 0.15) / 255, w = a * (1 + p.bokeh * 12 * lum ** 3);
          pr[i] = R[i] * w; pg[i] = G[i] * w; pb[i] = Bc[i] * w; pw[i] = w;
        }
        const full = discBlur([pr, pg, pb, pw, A], W, H, rad);
        const half = p.focus === 'uniform' ? null : discBlur([pr, pg, pb, pw, A], W, H, rad * 0.45);
        const fa = (p.focusAngle * Math.PI) / 180, fco = Math.cos(fa), fsi = Math.sin(fa);
        let res = full;
        if (half) {
          // per pixel blur amount t: 0 = sharp, 0.5 = half, 1 = full blur
          const T = new Float32Array(N), w0 = p.focusWidth, tilt = p.focus === 'tilt', fy = p.focusPos * H, iS = 2 / S;
          for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
            if (tilt) T[i] = smoothstep(w0 * 0.5, w0 * 0.5 + 0.35, Math.abs(-(x - cx) * fsi + (y - fy) * fco) / H);
            else { const dx = x - cx, dy = y - cy; T[i] = smoothstep(w0, w0 + 0.6, Math.sqrt(dx * dx + dy * dy) * iS); }
          }
          res = [pr, pg, pb, pw, A].map((s, k) => {
            const hk = half[k], fk = full[k], o = new Float32Array(N);
            for (let i = 0; i < N; i++) { const t = T[i]; o[i] = t < 0.5 ? s[i] + (hk[i] - s[i]) * t * 2 : hk[i] + (fk[i] - hk[i]) * (t * 2 - 1); }
            return o;
          });
        }
        const [r0, g0, b0, w1, a1] = res;
        for (let i = 0; i < N; i++) {
          const w = w1[i], a = a1[i];
          if (a <= 1e-4 || w <= 1e-6) { A[i] = 0; continue; }
          R[i] = r0[i] / w; G[i] = g0[i] / w; Bc[i] = b0[i] / w; A[i] = a < 1 ? a : 1;
        }
      }

      /* ---------- 5. write ---------- */
      const out = ctx.createImageData(W, H), d = out.data, solid = p.bgMode === 'color', bg = U.hex(p.bgColor), op = p.opacity;
      for (let i = 0, o = 0; i < N; i++, o += 4) {
        const a = A[i] * op;
        if (solid) { d[o] = lerp(bg[0], R[i], a); d[o + 1] = lerp(bg[1], G[i], a); d[o + 2] = lerp(bg[2], Bc[i], a); d[o + 3] = 255; }
        else if (a > 0) { d[o] = R[i]; d[o + 1] = G[i]; d[o + 2] = Bc[i]; d[o + 3] = a * 255; }
      }
      ctx.putImageData(out, 0, 0);
    },
  });
})();
