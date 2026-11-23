/* Mountain range: distant mountains as a background impostor that tiles seamlessly in X. Several depth
   layers, each a ridgeline profile from periodic fractal noise (sharp alpine ridges, rolling hills, mesas
   with cliffs and terraces, volcanic cones, spiky alien peaks). The faces below a ridge are shaded from
   fake normals: the profile slope, blurred wider the further down from the ridge (so every peak gets a lit
   and a shadowed flank), plus vertical gully / spur noise. Color bands: forest / grass at the bottom,
   rock with strata in the middle, snow above a snow line that steep slopes and gullies break up. Far
   layers fade into the haze color (aerial perspective) and valley fog fills the base of every layer.
   Output: color, greyscale, silhouette mask or depth (layer) map; the sky is transparent or a gradient. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, smoothstep } = U;
  const RAD = Math.PI / 180;

  /* ridge height 0..1 at u in [0, 1) (period 1 => tiles), per peak shape */
  function profile(shape, u, F, p, seed) {
    const g = 0.35 + p.rough * 0.3, oct = 3 + Math.round(p.rough * 4);
    switch (shape) {
      case 'rolling': {
        const v = U.fractal('perlin', u * F, 0.5, F, 0, 3, 0.3 + p.rough * 0.15, 'fbm', seed);
        return smoothstep(0.15, 0.85, v);
      }
      case 'mesa': {
        const v = U.fractal('perlin', u * F, 0.5, F, 0, 4, 0.4, 'fbm', seed), n = U.fractal('perlin', u * F * 8, 3.5, F * 8, 0, 2, 0.5, 'fbm', seed + 5);
        return smoothstep(0.4, 0.45, v) * 0.55 + smoothstep(0.56, 0.6, v) * 0.45 + (n - 0.5) * 0.04 * (1 + p.rough) + v * 0.08;
      }
      case 'volcanic': {
        const base = U.fractal('perlin', u * F, 0.5, F, 0, oct, g, 'fbm', seed);
        let h = base * 0.35;
        const n = Math.max(1, Math.round(F * 0.5));
        for (let i = 0; i < n; i++) {
          const c = (i + 0.2 + U.hash(i, 1, seed) * 0.6) / n, r = (0.25 + U.hash(i, 2, seed) * 0.25) / n * 2.2;
          let dx = Math.abs(u - c); dx = Math.min(dx, 1 - dx);
          const t = clamp(1 - dx / r), ht = 0.55 + U.hash(i, 3, seed) * 0.45;
          let cone = Math.pow(t, 1.6) * ht;
          const rim = ht * 0.92;
          if (cone > rim) cone = rim - (cone - rim) * 0.6; // crater
          h = Math.max(h, cone + (base - 0.5) * 0.06);
        }
        return h;
      }
      case 'alien': {
        const v = U.fractal('perlin', u * F, 0.5, F, 0, oct, 0.55, 'ridged', seed);
        const sp = U.fractal('perlin', u * F * 4, 1.5, F * 4, 0, 2, 0.5, 'ridged', seed + 9);
        return Math.pow(v, 2.2) * 0.85 + Math.pow(sp, 6) * 0.35;
      }
      default: { // alpine: big crests (1 - |noise| gives sharp triangular peaks) + broad swell + jagged detail
        const P = U.perlin(u * F, 0.5, F, 0, seed), big = Math.pow(1 - Math.abs(P), 1 + p.sharp * 1.2);
        const F2 = Math.max(1, Math.round(F / 2)), sw = U.fractal('perlin', u * F2, 2.5, F2, 0, 2, 0.5, 'fbm', seed + 3);
        const det = U.fractal('perlin', u * F * 2, 4.5, F * 2, 0, oct, g, 'ridged', seed + 7);
        return big * 0.6 + sw * 0.3 + det * (0.08 + p.rough * 0.22);
      }
    }
  }

  U.register({
    id: 'mountains',
    name: 'Mountain Range',
    desc: 'Distant mountain ranges in hazy depth layers with ridges, snow caps, rock and forest bands, tiling seamlessly from left to right',
    uses: [
      'Background impostors for open-world, flight and racing games: a horizon strip that tiles horizontally (wraps around a skybox or a cylinder), with a mask and a depth map to split or fog the layers in the engine.',
      'Parallax backdrops for 2D games, menus and title screens, from realistic alpine ranges to toon layers and alien worlds.',
    ],
    tags: ['Nature', 'Lighting'],
    aspect: '4:1',
    bg: 'checker',
    icon: U.icon('<path d="M2 20l6-10 3 4 4-8 7 14z"/><path d="M13.2 9.6l1.8-3.6 1.8 3.6-1 .8-.8-.8-.8.8z" fill="currentColor" stroke="none"/><path d="M2 20l4-4 3 2" opacity=".6"/>'),
    params: [
      { type: 'section', label: 'Mountains' },
      { key: 'shape', label: 'Peaks', type: 'select', default: 'alpine', options: [['alpine', 'Alpine (sharp ridges)'], ['rolling', 'Rolling hills'], ['mesa', 'Mesas & plateaus'], ['volcanic', 'Volcanic cones'], ['alien', 'Alien spires']] },
      { key: 'hMin', key2: 'hMax', label: 'Height', type: 'span', min: 0, max: 1, step: 0.01, default: 0.3, default2: 0.85, tip: 'Lowest and highest ridge point of the farthest layer, as a share of the image height' },
      { key: 'peaks', label: 'Peaks across', type: 'int', min: 1, max: 16, default: 4, tip: 'Size of the main mountains: how many fit across a 4:1 strip (far layers get more)' },
      { key: 'sharp', label: 'Sharpness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75, show: (p) => p.shape === 'alpine', tip: 'Smooth summits (0) to knife-edge ridges (1)' },
      { key: 'rough', label: 'Ridge roughness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Small bumps and notches along the ridgeline' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 5 },

      { type: 'section', label: 'Layers' },
      { key: 'layers', label: 'Depth layers', type: 'int', min: 1, max: 6, default: 4 },
      { key: 'layerDrop', label: 'Near layers lower', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'How much lower the nearer ranges sit, so the far peaks show above them' },
      { key: 'layerDetail', label: 'Far layer detail', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Far layers get more, smaller peaks' },
      { key: 'haze', label: 'Aerial haze', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Far layers fade toward the haze color (aerial perspective)' },
      { key: 'fog', label: 'Valley fog', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Fog filling the base of every layer, for misty layered ranges' },
      { key: 'hazeColor', label: 'Haze color', type: 'color', default: '#b4c4d8' },

      { type: 'section', label: 'Surface' },
      { key: 'snow', label: 'Snow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Snow line: 0 = no snow, 1 = snow down to the valleys' },
      { key: 'snowSlope', label: 'Bare steep slopes', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.snow > 0, tip: 'Snow slides off steep faces and gathers in gullies' },
      { key: 'forest', label: 'Forest / grass', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Tree line height: the lower part of every range is covered in forest or grass' },
      { key: 'trees', label: 'Tree silhouettes', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.forest > 0, tip: 'Bumpy tree tops along forested ridges' },
      { key: 'detail', label: 'Gullies & spurs', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Vertical relief on the faces below the ridges' },
      { key: 'strata', label: 'Rock strata', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Horizontal rock layers (strong on mesas)' },
      { key: 'rockColor', label: 'Rock color', type: 'color', default: '#7a7470' },
      { key: 'rockColor2', label: 'Rock color 2', type: 'color', default: '#5c5654', show: (p) => p.strata > 0 || p.detail > 0 },
      { key: 'forestColor', label: 'Forest color', type: 'color', default: '#3c5a34', show: (p) => p.forest > 0 },
      { key: 'snowColor', label: 'Snow color', type: 'color', default: '#f2f5fa', show: (p) => p.snow > 0 },

      { type: 'section', label: 'Lighting' },
      { key: 'look', label: 'Look', type: 'select', default: 'shaded', options: [['shaded', 'Shaded'], ['toon', 'Toon (hard light bands)'], ['flat', 'Flat (one tone per layer)']] },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'angled', options: [['angled', 'Angled (light angle)'], ['ambient', 'Ambient (soft, no direction)']], show: (p) => p.look !== 'flat', tip: 'Ambient: soft light from all around, like an overcast sky: no lit or shadowed flanks; gullies darken a little and upward-facing parts are lighter' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -150, show: (p) => p.look !== 'flat' && p.lightMode !== 'ambient', tip: 'Direction the sun comes from (180 = left, 0 = right, -90 = above)' },
      { key: 'shade', label: 'Light contrast', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, show: (p) => p.look !== 'flat' },
      { key: 'sunColor', label: 'Sun color', type: 'color', default: '#fff3e2', show: (p) => p.look !== 'flat' },
      { key: 'shadowColor', label: 'Shadow color', type: 'color', default: '#5e6c92', show: (p) => p.look !== 'flat', tip: 'Tint of the faces turned away from the light (sky light)' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color'], ['grey', 'Greyscale'], ['mask', 'Silhouette mask'], ['depth', 'Depth (layer) map']], tip: 'Mask: white mountains on black. Depth: one grey per layer, near = white, sky = black' },
      { key: 'sky', label: 'Sky', type: 'select', default: 'transparent', options: [['transparent', 'Transparent'], ['gradient', 'Gradient']], show: (p) => p.output === 'color' || p.output === 'grey' },
      { key: 'skyColor', label: 'Sky color', type: 'color', default: '#5f8fcc', show: (p) => p.sky === 'gradient' && (p.output === 'color' || p.output === 'grey') },
      { key: 'skyColor2', label: 'Horizon color', type: 'color', default: '#d4e2ee', show: (p) => p.sky === 'gradient' && (p.output === 'color' || p.output === 'grey') },
    ],
    presets: [
      { name: 'Alps', group: 'Realistic', values: { seed: 5 } },
      { name: 'Rockies', group: 'Realistic', values: { peaks: 3, sharp: 0.55, rough: 0.6, snow: 0.22, forest: 0.5, trees: 0.6, forestColor: '#2e4630', rockColor: '#6e6860', rockColor2: '#4e4a46', haze: 0.55, hazeColor: '#a8b8cc', layers: 4, seed: 12 } },
      { name: 'Himalaya giants', group: 'Realistic', values: { peaks: 2, hMin: 0.4, hMax: 0.98, sharp: 0.9, rough: 0.7, snow: 0.6, snowSlope: 0.75, forest: 0, layers: 3, layerDrop: 0.7, haze: 0.5, hazeColor: '#9ab0cc', shadowColor: '#4a5a88', seed: 31 } },
      { name: 'Winter range', group: 'Realistic', values: { snow: 0.9, snowSlope: 0.35, forest: 0.25, trees: 0.5, forestColor: '#2a3a34', haze: 0.55, hazeColor: '#c8d4e2', sunColor: '#f4f6ff', shadowColor: '#7080a8', seed: 18 } },
      { name: 'Rolling green hills', group: 'Realistic', values: { shape: 'rolling', peaks: 3, hMin: 0.15, hMax: 0.6, rough: 0.3, snow: 0, forest: 1, trees: 0.35, forestColor: '#4e7a3a', detail: 0.25, strata: 0, haze: 0.6, hazeColor: '#b8cede', layers: 4, layerDrop: 0.6, fog: 0.15, seed: 8 } },
      { name: 'Desert mesas', group: 'Realistic', values: { shape: 'mesa', peaks: 3, hMin: 0.12, hMax: 0.62, rough: 0.4, snow: 0, forest: 0, strata: 0.75, detail: 0.45, rockColor: '#b46a3e', rockColor2: '#8e4a2a', haze: 0.55, hazeColor: '#e0b898', sunColor: '#fff0d8', shadowColor: '#7a5a6a', fog: 0, layers: 3, seed: 22 } },
      { name: 'Volcanic', group: 'Realistic', values: { shape: 'volcanic', peaks: 3, hMin: 0.1, hMax: 0.85, rough: 0.35, snow: 0.12, snowSlope: 0.4, forest: 0.18, forestColor: '#3a4a30', rockColor: '#4a4440', rockColor2: '#2e2a28', strata: 0.1, haze: 0.5, hazeColor: '#a8b0bc', layers: 3, seed: 4 } },
      { name: 'Misty blue mountains', group: 'Realistic', values: { shape: 'rolling', peaks: 4, hMin: 0.2, hMax: 0.8, rough: 0.45, snow: 0, forest: 1, trees: 0.5, forestColor: '#2a4038', detail: 0.4, layers: 6, layerDrop: 0.75, haze: 0.85, fog: 0.75, hazeColor: '#a8bcd8', lightMode: 'ambient', seed: 27 } },
      { name: 'Highlands', group: 'Realistic', values: { shape: 'rolling', peaks: 2, hMin: 0.2, hMax: 0.7, rough: 0.6, snow: 0, forest: 0.7, trees: 0, forestColor: '#6a7a44', rockColor: '#6a6458', detail: 0.6, haze: 0.6, hazeColor: '#b8c2cc', lightMode: 'ambient', layers: 4, seed: 15 } },
      { name: 'Sunset range', group: 'Realistic', values: { peaks: 3, snow: 0.3, lightAngle: 178, shade: 0.85, sunColor: '#ffb070', shadowColor: '#4a3a6a', hazeColor: '#e89a80', haze: 0.7, fog: 0.25, sky: 'gradient', skyColor: '#3a3a7a', skyColor2: '#f8a070', seed: 9 } },
      { name: 'Night silhouette', group: 'Stylized', values: { look: 'flat', layers: 5, layerDrop: 0.65, haze: 0.8, fog: 0.4, rockColor: '#0e1424', forestColor: '#0e1424', snow: 0, forest: 0, hazeColor: '#3a4a78', seed: 33 } },
      { name: 'Toon layers', group: 'Stylized', values: { look: 'toon', peaks: 3, sharp: 0.6, rough: 0.2, detail: 0.3, strata: 0, snow: 0.3, snowSlope: 0.3, forest: 0.3, trees: 0, forestColor: '#4a8a4a', rockColor: '#7a86a8', rockColor2: '#6a7698', haze: 0.6, hazeColor: '#bcd8f0', shadowColor: '#5a5a9a', layers: 3, seed: 6 } },
      { name: 'Flat layered hills', group: 'Stylized', values: { look: 'flat', shape: 'rolling', peaks: 2, rough: 0.15, snow: 0, forest: 0, rockColor: '#3e6a5a', haze: 0.75, hazeColor: '#e8d8b0', layers: 5, layerDrop: 0.7, fog: 0, sky: 'gradient', skyColor: '#f0c890', skyColor2: '#fbeccc', seed: 2 } },
      { name: 'Alien planet', group: 'Sci-fi', values: { shape: 'alien', peaks: 4, hMin: 0.15, hMax: 0.95, rough: 0.6, snow: 0.25, snowColor: '#a0f0e0', forest: 0.3, trees: 0, forestColor: '#6a2a7a', rockColor: '#a04a6a', rockColor2: '#5a2a4a', strata: 0.5, hazeColor: '#e0a0c0', haze: 0.65, sunColor: '#c0fff0', shadowColor: '#3a2a6a', seed: 13 } },
      { name: 'Red planet', group: 'Sci-fi', values: { shape: 'mesa', peaks: 4, hMin: 0.1, hMax: 0.7, snow: 0, forest: 0, strata: 0.6, rockColor: '#b05a34', rockColor2: '#7a3420', hazeColor: '#d8a080', haze: 0.7, sunColor: '#fff0e0', shadowColor: '#5a3a3a', layers: 4, seed: 40 } },
      { name: 'Ice world', group: 'Sci-fi', values: { shape: 'alien', peaks: 5, snow: 0.7, snowSlope: 0.5, snowColor: '#e8f6ff', rockColor: '#5a7a9a', rockColor2: '#3a5a7a', forest: 0, hazeColor: '#bcdcf0', shadowColor: '#4a6aa8', seed: 51 } },
      { name: 'Silhouette mask', group: 'Masks', values: { output: 'mask', layers: 1, seed: 5 } },
      { name: 'Depth layer map', group: 'Masks', values: { output: 'depth', layers: 5, seed: 5 } },
    ],
    render(ctx, W, H, p) {
      const n = Math.max(1, p.layers | 0), seed = p.seed | 0, out = p.output, look = p.look;
      const flat = look === 'flat', toon = look === 'toon', amb = p.lightMode === 'ambient', plain = out === 'mask' || out === 'depth';
      const la = p.lightAngle * RAD, Lx0 = Math.cos(la), Lu0 = -Math.sin(la);
      const Ll = Math.hypot(Lx0, Lu0 * 0.8, 0.45);
      const Lx = Lx0 / Ll, Lu = (Lu0 * 0.8) / Ll, Lz = 0.45 / Ll;
      const C = (h) => U.hex(h).map((v) => v / 255);
      const rock = C(p.rockColor), rock2 = C(p.rockColor2), forest = C(p.forestColor), snow = C(p.snowColor);
      const haze = C(p.hazeColor), sun = C(p.sunColor), shad = C(p.shadowColor);
      const K = flat || plain ? 1 : p.shape === 'mesa' ? 3 : 5; // sub-ridges per layer (spurs in front of the main ridge)

      // blurred slope arrays of a height profile (deeper below a crest = wider flanks)
      const slopesOf = (hp, fw) => [fw * 0.006, fw * 0.035, fw * 0.11, fw * 0.28].map((r) => {
        const R = Math.round(r), b = new Float32Array(W);
        if (!R) b.set(hp);
        else {
          let sum = 0;
          for (let k = -R; k <= R; k++) sum += hp[U.mod(k, W)];
          for (let x = 0; x < W; x++) { b[x] = sum / (2 * R + 1); sum += hp[U.mod(x + R + 1, W)] - hp[U.mod(x - R, W)]; }
        }
        const sl = new Float32Array(W);
        for (let x = 0; x < W; x++) sl[x] = (b[(x + 1) % W] - b[(x - 1 + W) % W]) * 0.5;
        return sl;
      });

      // ---- per layer: main ridge profile (px up from the bottom) + sub-ridges ----
      const L = [];
      for (let li = 0; li < n; li++) {
        const d = n > 1 ? (n - 1 - li) / (n - 1) : 0; // 1 = farthest
        const F = Math.max(1, Math.round(p.peaks * (1 + d * p.layerDetail * 1.5) * W / H / 4));
        const s = seed * 97 + li * 1013;
        const drop = (1 - d) * p.layerDrop * (n > 1 ? 1 : 0);
        const hi = p.hMax * (1 - drop * 0.7), lo = p.hMin * (1 - drop * 0.85);
        const raw = new Float32Array(W);
        let mn = 1e9, mx = -1e9;
        for (let x = 0; x < W; x++) { const v = profile(p.shape, x / W, F, p, s); raw[x] = v; mn = Math.min(mn, v); mx = Math.max(mx, v); }
        const span = Math.max(0.02, hi - lo);
        const tl = lo + span * (p.forest * 0.8); // tree line (share of H)
        const TF = Math.max(8, Math.round((W / H) * 110 * (1 + d))), treeH = p.trees * (p.forest > 0 ? 1 : 0) * H * 0.014 * (1 - d * 0.5);
        const subs = [];
        for (let k = 0; k < K; k++) {
          const hp = new Float32Array(W), Fk = Math.max(1, Math.round(F * (1.5 + k * 0.6)));
          for (let x = 0; x < W; x++) {
            let h = lerp(lo, hi, (raw[x] - mn) / (mx - mn || 1)) * H;
            if (k > 0) { // a spur in front: follows the ridge, dips lower by a varying amount
              const nk = U.fractal('perlin', (x / W) * Fk, 1.5 + k * 3.3, Fk, 0, 3, 0.45, 'fbm', s + k * 59);
              h -= span * H * (k / K) * (0.1 + 1.8 * Math.pow(clamp((1 - nk) * 1.6 - 0.3), 1.3));
              h = Math.max(h, 0);
            }
            if (treeH > 0) { // tree tops below the tree line
              const fz = smoothstep(tl + 0.02, tl - 0.02, h / H);
              if (fz > 0) h += fz * treeH * (0.3 + U.fractal('value', (x / W) * TF, 0.5 + li + k * 2, TF, 0, 2, 0.5, 'fbm', s + 77) * 1.3);
            }
            hp[x] = h;
          }
          subs.push({ hp, slopes: flat || plain ? null : slopesOf(hp, W / Fk), k });
        }
        let top = H;
        for (const sb of subs) for (let x = 0; x < W; x++) top = Math.min(top, H - sb.hp[x]);
        L.push({ d, F, s, subs, main: subs[0].hp, lo, hi, span, tl, top: Math.max(0, Math.floor(top) - 1) });
      }

      const img = ctx.createImageData(W, H), D = img.data;
      const col = [0, 0, 0];
      const DF = (lay) => Math.max(2, Math.round(lay.F * 4)); // texture noise frequency (periodic in X)

      /* color of sub-ridge sb of layer lay at (x, y); nz = texture noise 0..1, ns = its x-slope */
      function shadePx(lay, sb, x, y, nz, ns) {
        if (out === 'depth') { const v = 1 - lay.d * 0.8; col[0] = col[1] = col[2] = v; return; }
        if (out === 'mask') { col[0] = col[1] = col[2] = 1; return; }
        const alt = (H - y) / H, span = lay.span, depth = y - (H - sb.hp[x]), mdepth = y - (H - lay.main[x]);
        let s = 0;
        if (sb.slopes) {
          const t = clamp(depth / (H * 0.12)) * 3, k = Math.min(2, t | 0), f = t - k;
          s = (lerp(sb.slopes[k][x], sb.slopes[k + 1][x], f) * (1 + t * 0.4) + ns * p.detail) / (1 + depth / (H * 0.3));
        }
        const sa = Math.abs(s);
        // material: rock (with strata) -> forest below the tree line -> snow above the snow line
        let c0 = rock[0], c1 = rock[1], c2 = rock[2];
        if (!flat) {
          const st = p.strata > 0 ? 0.5 + 0.5 * Math.sin(alt * (p.shape === 'mesa' ? 110 : 70) + nz * 4) : 0;
          const m = clamp(st * p.strata + (nz - 0.5) * p.detail * 0.9 + 0.2 * p.detail);
          c0 = lerp(c0, rock2[0], m); c1 = lerp(c1, rock2[1], m); c2 = lerp(c2, rock2[2], m);
        }
        if (p.forest > 0) {
          const tl = lay.tl + (nz - 0.5) * span * 0.3 - (toon ? 0 : sa * span * 0.15);
          const fz = flat ? (alt < tl ? 1 : 0) : smoothstep(tl + span * 0.02, tl - span * 0.02, alt);
          if (fz > 0) {
            const tex = flat || toon ? 1 : 0.85 + 0.3 * nz;
            c0 = lerp(c0, forest[0] * tex, fz); c1 = lerp(c1, forest[1] * tex, fz); c2 = lerp(c2, forest[2] * tex, fz);
          }
        }
        let sn = 0;
        if (p.snow > 0) {
          const sl = lay.hi - span * p.snow * 1.1 + (nz - 0.5) * span * 0.35 + p.snowSlope * Math.max(0, sa - 0.5) * span * 0.5 - span * (sb.k ? 0.08 : 0.3) * Math.exp(-depth / (H * 0.03 * (0.4 + p.snow))); // crests keep their snow caps
          sn = flat || toon ? (alt > sl ? 1 : 0) : smoothstep(sl - span * 0.01, sl + span * 0.01, alt);
          c0 = lerp(c0, snow[0], sn); c1 = lerp(c1, snow[1], sn); c2 = lerp(c2, snow[2], sn);
        }
        // light from fake normals: n = (-slope, up, toward the viewer)
        let li = 1;
        if (!flat) {
          if (amb) li = 0.72 + 0.2 * clamp(1 - sa * 0.7) + (nz - 0.5) * 0.3 * p.detail - (sb.k > 0 ? 0 : 0.04);
          else {
            const nx = -s, nu = 0.35 + sn * 0.2, nl = Math.sqrt(nx * nx + nu * nu + 0.81);
            const dif = Math.max(0, (nx * Lx + nu * Lu + 0.9 * Lz) / nl);
            li = lerp(0.8, 0.1 + dif * 1.2, p.shade);
            if (toon) li = li > 0.78 ? 1.05 : li > 0.45 ? 0.74 : 0.5;
          }
        }
        const tS = clamp(li);
        const lf = 0.45 + li * 0.75;
        col[0] = c0 * lerp(shad[0], sun[0], tS) * lf; col[1] = c1 * lerp(shad[1], sun[1], tS) * lf; col[2] = c2 * lerp(shad[2], sun[2], tS) * lf;
        // aerial haze (+ a little per sub-ridge further back) and valley fog toward the base of the layer
        const fogD = H * (0.1 + 0.3 * (1 - lay.d * 0.4));
        const hz = clamp(p.haze * Math.pow(lay.d, 0.85) * 0.88 + (toon || flat ? 0 : p.haze * (0.05 + 0.07 * (K - 1 - sb.k) / K)) + p.fog * Math.pow(clamp(mdepth / fogD), 1.4) * (0.45 + 0.55 * lay.d));
        col[0] = lerp(col[0], haze[0], hz); col[1] = lerp(col[1], haze[1], hz); col[2] = lerp(col[2], haze[2], hz);
      }

      const minTop = Math.min(...L.map((l) => l.top));
      // texture / gully noise per layer on a coarse grid that wraps in X (value + x-slope, bilinear)
      for (const lay of L) {
        if (flat || plain) continue;
        const f = DF(lay), gw = Math.max(8, Math.round(f * 12)), st = W / gw, gh = Math.ceil((H - lay.top) / st) + 2, fy = f * (H / W) * 0.9;
        const N = new Float32Array(gw * gh), S = new Float32Array(gw * gh), am = (W / f) * 0.05;
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) N[j * gw + i] = U.fractal('perlin', i / gw * f, ((lay.top + j * st) / H) * fy + lay.s * 0.01, f, 0, 3, 0.5, 'ridged', lay.s + 31);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) S[j * gw + i] = (N[j * gw + (i + 1) % gw] - N[j * gw + (i - 1 + gw) % gw]) / (2 * st) * am;
        Object.assign(lay, { gN: N, gS: S, gw, gh, st });
      }
      const smp = (lay, A, x, y) => {
        const fx = x / lay.st, fy = (y - lay.top) / lay.st, i = Math.floor(fx), j = Math.min(lay.gh - 2, Math.max(0, Math.floor(fy))), tx = fx - i, ty = clamp(fy - j);
        const i0 = i % lay.gw, i1 = (i + 1) % lay.gw, r0 = j * lay.gw, r1 = r0 + lay.gw;
        return lerp(lerp(A[r0 + i0], A[r0 + i1], tx), lerp(A[r1 + i0], A[r1 + i1], tx), ty);
      };
      for (let y = minTop; y < H; y++) {
        const o = y * W * 4;
        for (let x = 0; x < W; x++) {
          let r = 0, g = 0, b = 0, A = 0;
          for (let li = n - 1; li >= 0 && A < 0.999; li--) {
            const lay = L[li];
            for (let k = K - 1; k >= 0 && A < 0.999; k--) {
              const sb = lay.subs[k], cov = clamp(y + 1 - (H - sb.hp[x]));
              if (cov <= 0) continue;
              let nz = 0.5, ns = 0;
              if (lay.gN) { nz = smp(lay, lay.gN, x, y); ns = smp(lay, lay.gS, x, y); }
              shadePx(lay, sb, x, y, nz, ns);
              const w = (1 - A) * cov;
              r += col[0] * w; g += col[1] * w; b += col[2] * w; A += w;
            }
          }
          if (A > 0) { const i = o + x * 4; D[i] = (r / A) * 255; D[i + 1] = (g / A) * 255; D[i + 2] = (b / A) * 255; D[i + 3] = A * 255; }
        }
      }
      const grey = (dd) => { for (let i = 0; i < dd.length; i += 4) { const v = dd[i] * 0.2126 + dd[i + 1] * 0.7152 + dd[i + 2] * 0.0722; dd[i] = dd[i + 1] = dd[i + 2] = v; } };
      if (plain) for (let i = 0; i < D.length; i += 4) { const a = D[i + 3] / 255; D[i] *= a; D[i + 1] *= a; D[i + 2] *= a; D[i + 3] = 255; }
      ctx.clearRect(0, 0, W, H);
      ctx.putImageData(img, 0, 0);
      if (plain) return;
      if (p.sky === 'gradient') {
        const gr = ctx.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, p.skyColor); gr.addColorStop(1, p.skyColor2);
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (out === 'grey') { const im = ctx.getImageData(0, 0, W, H); grey(im.data); ctx.putImageData(im, 0, 0); }
    },
  });
})();
