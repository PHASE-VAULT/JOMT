/* Tree bark: tileable bark textures (seamless in both directions), built as a layered height field.
   Plate-type barks (furrowed ridges, flaky plates, scales, corky bark) start from a stretched, warped
   cellular network: every cell becomes a plate with a rounded top, separated by deep V-shaped fissures
   with ragged walls. On the plates, stacked flake layers (terraces from a per-plate noise) peel off and
   expose the fresh inner bark (pine, plane); a finer second network splits plates into corky chunks
   (larch, Douglas fir); scales overlap like roof tiles and some fall off (spruce, fir); cross cracks
   break long ridges into blocks (oak). Smooth bark (birch, beech, cherry) has horizontal lenticels,
   papery peeling strips, black cracked patches and chevron branch scars. Also peeling camo patches
   (plane tree, eucalyptus), fibrous interlaced strips (redwood, cedar) and palm ring scars.
   Lighting is baked from the height: a directional light plus cavity occlusion from the blurred height
   (deep fissures go dark, plate tops stay lit). Stylized looks: hand-painted, toon / cel with ink
   outlines and pixel art. Every pattern uses whole periods per tile, so it repeats seamlessly; the
   height map drives the normal map mode. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, smoothstep, hash, mod } = U;
  const V = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };
  const V2 = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };
  const VORO = { furrowed: 1, plates: 1, scales: 1, patches: 1 };
  const PLATED = { furrowed: 1, plates: 1, scales: 1 };
  const MODELS = ['furrowed', 'plates', 'scales', 'smooth', 'patches', 'fibrous', 'rings'];
  const isM = (...m) => (p) => m.includes(p.model);
  const isS = (...s) => (p) => s.includes(p.style);
  const plated = (p) => !!PLATED[p.model];
  const fbm = (x, y, px, py, o, s) => U.fractal('perlin', x, y, px, py, o, 0.5, 'fbm', s);

  /* short horizontal dashes (lenticels) on a jittered nx × ny lattice: returns coverage 0..1 and sets
     DASH.core (1 on the dark center line), tiles */
  const DASH = { core: 0 };
  function dashes(X, Y, nx, ny, sx, sy, len, thick, keep, seed) {
    const xi = Math.floor(X), yi = Math.floor(Y), ri = Math.min(4, Math.ceil((len * 1.6) / sx) + 1);
    let best = 0, core = 0;
    for (let j = yi - 1; j <= yi + 1; j++) {
      for (let i = xi - ri; i <= xi + ri; i++) {
        const wi = mod(i, nx), wj = mod(j, ny);
        if (hash(wi, wj, seed + 3) > keep) continue;
        const r = hash(wi, wj, seed), L = len * (0.4 + r * 1.2), T = thick * (0.7 + r * 0.6);
        const ddx = ((X - i - hash(wi, wj, seed + 1)) * sx) / L, ddy = (Y - j - hash(wi, wj, seed + 2)) * sy;
        // lens shape: thickest in the middle, pointed ends
        const ax = Math.abs(ddx);
        if (ax >= 1) continue;
        const half = T * (1 - ax * ax) * 0.5 + 0.35, ay = Math.abs(ddy);
        const c = 1 - smoothstep(half - 0.6, half + 0.6, ay);
        if (c > best) { best = c; core = 1 - smoothstep(0, half * 0.5 + 0.4, ay); }
      }
    }
    DASH.core = core;
    return best;
  }

  /* chevron branch scars (birch "eyes"): a ∧ shaped dark band on a sparse jittered lattice, tiles */
  function chevrons(X, Y, nx, ny, sx, sy, size, keep, seed) {
    const xi = Math.floor(X), yi = Math.floor(Y);
    let best = 0;
    for (let j = yi - 1; j <= yi + 1; j++) {
      for (let i = xi - 1; i <= xi + 1; i++) {
        const wi = mod(i, nx), wj = mod(j, ny);
        if (hash(wi, wj, seed + 3) > keep) continue;
        const r = hash(wi, wj, seed), sz = size * (0.6 + r * 0.8);
        const dx = ((X - i - 0.2 - hash(wi, wj, seed + 1) * 0.6) * sx) / sz, dy = ((Y - j - 0.2 - hash(wi, wj, seed + 2) * 0.6) * sy) / sz;
        const ax = Math.abs(dx);
        if (ax > 1.1 || dy < -0.35 || dy > 0.8) continue;
        const arm = Math.abs(dy - ax * 0.42 - 0.02), w = 0.13 * (1 - ax * 0.7) + 0.02;
        const c = (1 - smoothstep(w * 0.55, w, arm)) * (1 - smoothstep(0.75, 1.05, ax));
        const knot = 1 - smoothstep(0.08, 0.16, Math.hypot(dx * 0.9, dy - 0.04)); // the branch stub at the apex
        best = Math.max(best, c, knot);
      }
    }
    return best;
  }

  /* wrapped (seamless) box blur, run twice per call for a soft tent kernel */
  function blurWrap(src, W, H, r) {
    r = Math.max(1, Math.round(r));
    const n = 2 * r + 1, inv = 1 / n;
    let a = src;
    const t = new Float32Array(W * H), b = new Float32Array(W * H);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) {
        const o = y * W;
        let s = 0;
        for (let k = -r; k <= r; k++) s += a[o + mod(k, W)];
        for (let x = 0; x < W; x++) {
          t[o + x] = s * inv;
          s += a[o + mod(x + r + 1, W)] - a[o + mod(x - r, W)];
        }
      }
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += t[mod(k, H) * W + x];
        for (let y = 0; y < H; y++) {
          b[y * W + x] = s * inv;
          s += t[mod(y + r + 1, H) * W + x] - t[mod(y - r, H) * W + x];
        }
      }
      if (pass === 0) a = b.slice();
    }
    return b;
  }

  U.register({
    id: 'bark',
    name: 'Tree Bark',
    desc: 'Tileable tree bark: furrowed, plated, flaking, scaly, corky, smooth, peeling, fibrous and palm bark with moss, lichen and hand-painted, toon or pixel art looks',
    uses: [
      'Seamless albedo and height textures for tree trunks, logs, branches and wooden props; tile them around the trunk (U) and along it (V) and use the normal map mode for the furrows.',
      'Stylized foliage kits: hand-painted, toon or pixel art trunks for fantasy, cartoon and retro games.',
    ],
    tags: ['Texturing', 'Nature'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<path d="M7 3c.6 3-.8 5 0 9s-.6 6 0 9M12 3c-.5 3 .9 5 0 9s.6 6 0 9M17 3c.6 3-.8 5 0 9s-.6 6 0 9"/><path d="M9.2 8.5l.9 1.2M14.2 15l.9 1.2" opacity=".5"/>'),
    params: [
      { type: 'section', label: 'Bark' },
      { key: 'model', label: 'Bark type', type: 'select', default: 'furrowed', options: [['furrowed', 'Furrowed ridges'], ['plates', 'Flaky plates'], ['scales', 'Scales'], ['smooth', 'Smooth with lenticels'], ['patches', 'Peeling patches'], ['fibrous', 'Fibrous strips'], ['rings', 'Ring scars (palm)']] },
      { key: 'cols', label: 'Ridges across', type: 'int', min: 1, max: 40, default: 6, tip: 'Number of ridges, plates or patches across the tile' },
      { key: 'elong', label: 'Stretch', type: 'range', min: 0.3, max: 10, step: 0.05, default: 3.2, show: (p) => p.model !== 'rings', tip: 'How much longer than wide the ridges and plates are (along the trunk)' },
      { key: 'rings', label: 'Rings down', type: 'int', min: 2, max: 60, default: 8, show: isM('rings'), tip: 'Leaf scar rings per tile' },
      { key: 'furrow', label: 'Furrow width', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.model !== 'smooth' },
      { key: 'irregular', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, show: (p) => !!VORO[p.model], tip: 'Uneven plate sizes and ragged fissure walls' },
      { key: 'diamond', label: 'Diamond pattern', type: 'bool', default: false, show: isM('furrowed'), tip: 'Offset rows: ridges merge into a net of diamonds (ash, walnut)' },
      { key: 'warp', label: 'Waviness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Detail' },
      { key: 'depth', label: 'Relief depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75 },
      { key: 'dome', label: 'Plate rounding', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: plated, tip: 'Rounded, bulging plate and ridge tops instead of flat ones' },
      { key: 'layers', label: 'Flake layers', type: 'int', min: 0, max: 5, default: 0, show: plated, tip: 'Stacked bark layers on each plate; the top ones peel off in scalloped flakes (pine, plane)' },
      { key: 'flakes', label: 'Flaking', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => plated(p) && (p.layers > 0 || p.model === 'scales'), tip: 'How much of the outer layers has peeled off, showing the inner bark; scales: share of fallen scales' },
      { key: 'flakeSize', label: 'Flake size', type: 'range', min: 0.2, max: 2, step: 0.01, default: 1, show: (p) => plated(p) && p.layers > 0 },
      { key: 'sub', label: 'Fine fissures', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: plated, tip: 'A finer crack network that splits the plates into small corky chunks (larch, Douglas fir, old pine)' },
      { key: 'cracks', label: 'Cross cracks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: isM('furrowed', 'plates'), tip: 'Ridges broken into blocks (old oak)' },
      { key: 'rough', label: 'Roughness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.model !== 'smooth', tip: 'Corky bumps and pits on the plate tops and fissure walls' },
      { key: 'fibers', label: 'Fibers', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Fine stringy grain along the trunk' },
      { key: 'peel', label: 'Peeling strips', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: isM('smooth'), tip: 'Thin papery strips curling off around the trunk, with the fresh layer showing where they came off (birch, cherry)' },
      { key: 'lenticels', label: 'Lenticels', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Short horizontal breathing pores (birch, cherry)' },
      { key: 'lentDensity', label: 'Lenticels across', type: 'int', min: 2, max: 60, default: 12, show: (p) => p.lenticels > 0 },
      { key: 'lentLen', label: 'Lenticel length', type: 'range', min: 1, max: 60, step: 0.5, default: 10, show: (p) => p.lenticels > 0, tip: 'px @ 512' },
      { key: 'marks', label: 'Dark marks', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Dark cracked patches and bands (birch)' },
      { key: 'scars', label: 'Branch scars', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: isM('smooth'), tip: 'Dark chevron-shaped scars where old branches were (birch, aspen, beech)' },

      { type: 'section', label: 'Color' },
      { key: 'color', label: 'Bark color', type: 'color', default: '#6f6457', tip: 'The weathered outer layer' },
      { key: 'color2', label: 'Furrow color', type: 'color', default: '#1f1915' },
      { key: 'color3', label: 'Inner bark', type: 'color', default: '#7a5238', tip: 'The fresh under-layer: peeled flakes, fallen scales, fissure walls and fresh patches' },
      { key: 'inner', label: 'Inner bark showing', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'How much the inner bark color shows on the fissure walls' },
      { key: 'lentColor', label: 'Lenticel color', type: 'color', default: '#3a3028', show: (p) => p.lenticels > 0 },
      { key: 'markColor', label: 'Mark color', type: 'color', default: '#1e1b18', show: (p) => p.marks > 0 || p.scars > 0 },
      { key: 'colorVar', label: 'Plate variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Slightly different shade per ridge or plate' },
      { key: 'mottle', label: 'Mottling', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Large soft light / dark blotches' },
      { key: 'speckle', label: 'Color noise', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Fine grainy color variation' },

      { type: 'section', label: 'Moss & lichen', active: (p) => p.moss > 0 || p.lichen > 0 },
      { key: 'moss', label: 'Moss', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Grows in the furrows first' },
      { key: 'mossColor', label: 'Moss color', type: 'color', default: '#4f6a2a', show: (p) => p.moss > 0 },
      { key: 'lichen', label: 'Lichen', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Pale crusty spots on the ridges' },
      { key: 'lichenColor', label: 'Lichen color', type: 'color', default: '#a7b292', show: (p) => p.lichen > 0 },

      { type: 'section', label: 'Lighting' },
      { key: 'shade', label: 'Baked shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, tip: 'Light and shadow from the relief (0 for a pure albedo map)' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -120, show: (p) => p.shade > 0, tip: 'Direction the light comes from in the image (-90 = from the top)' },
      { key: 'ao', label: 'Furrow darkness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Ambient occlusion in the fissures and cavities' },

      { type: 'section', label: 'Style' },
      { key: 'style', label: 'Look', type: 'select', default: 'realistic', options: [['realistic', 'Realistic'], ['painted', 'Hand-painted'], ['toon', 'Toon / cel'], ['pixel', 'Pixel art']] },
      { key: 'bands', label: 'Color steps', type: 'int', min: 2, max: 8, default: 4, show: (p) => p.style !== 'realistic', tip: 'Number of tones in the posterized shading' },
      { key: 'outline', label: 'Outline width', type: 'range', min: 0, max: 6, step: 0.25, default: 1.5, show: isS('toon', 'pixel'), tip: 'Ink lines along the furrow edges (px @ 512)' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#1a120c', show: (p) => isS('toon', 'pixel')(p) && p.outline > 0 },
      { key: 'highlight', label: 'Edge highlight', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: isS('painted', 'toon'), tip: 'Light strokes on the lit ridge edges' },
      { key: 'pixel', label: 'Pixel size', type: 'range', min: 2, max: 32, step: 1, default: 6, show: isS('pixel'), tip: 'px @ 512; rounded so a whole number of pixels fits the tile' },
    ],
    presets: [
      { name: 'Oak', group: 'Deciduous', values: {} },
      { name: 'Old oak (mossy)', group: 'Deciduous', values: { cols: 5, furrow: 0.6, cracks: 0.65, sub: 0.25, depth: 0.9, rough: 0.6, moss: 0.4, lichen: 0.25, color: '#625849', color2: '#1a1612' } },
      { name: 'Ash', group: 'Deciduous', values: { cols: 10, elong: 3.6, furrow: 0.42, irregular: 0.35, diamond: true, warp: 0.25, cracks: 0.1, dome: 0.8, rough: 0.3, depth: 0.65, color: '#7f7b71', color2: '#2e2b26', color3: '#5e574c', inner: 0, mottle: 0.25 } },
      { name: 'Elm', group: 'Deciduous', values: { cols: 8, elong: 4.2, furrow: 0.5, warp: 0.65, cracks: 0.3, fibers: 0.5, sub: 0.15, color: '#5f5449', color2: '#1e1915', color3: '#7a5c44', inner: 0.25 } },
      { name: 'Black walnut', group: 'Deciduous', values: { cols: 9, elong: 2.8, furrow: 0.45, irregular: 0.5, diamond: true, cracks: 0.25, rough: 0.55, color: '#3f3631', color2: '#110d0b', color3: '#4a3a30', mottle: 0.2 } },
      { name: 'Sweet chestnut', group: 'Deciduous', values: { cols: 7, elong: 5, furrow: 0.5, warp: 0.45, cracks: 0.15, fibers: 0.5, color: '#6a5b4d', color2: '#221b15', color3: '#7a5a40', inner: 0.2 } },
      { name: 'Willow', group: 'Deciduous', values: { cols: 7, elong: 5.5, furrow: 0.55, warp: 0.6, cracks: 0.2, fibers: 0.6, sub: 0.2, depth: 0.9, color: '#6a6151', color2: '#201b15', color3: '#6e5a42' } },
      { name: 'Maple (mature)', group: 'Deciduous', values: { model: 'plates', cols: 6, elong: 3.4, furrow: 0.3, layers: 2, flakes: 0.35, flakeSize: 0.8, cracks: 0.35, dome: 0.4, color: '#77716a', color2: '#2a2723', color3: '#6a5644', inner: 0.2, mottle: 0.3 } },
      { name: 'Beech', group: 'Deciduous', values: { model: 'smooth', cols: 4, warp: 0.4, fibers: 0.1, lenticels: 0.2, lentLen: 5, lentDensity: 16, lentColor: '#6f6d66', marks: 0.08, markColor: '#4a4844', scars: 0.25, color: '#a09f98', color2: '#5c5a55', color3: '#8b9286', mottle: 0.7, colorVar: 0.1, depth: 0.4, ao: 0.25, speckle: 0.3 } },
      { name: 'Silver birch', group: 'Deciduous', values: { model: 'smooth', cols: 4, warp: 0.35, fibers: 0.1, peel: 0.35, lenticels: 0.8, lentLen: 16, lentDensity: 10, lentColor: '#3e3630', marks: 0.45, markColor: '#1a1715', scars: 0.45, color: '#ece9e2', color2: '#3a342e', color3: '#d9c4ad', mottle: 0.3, colorVar: 0.1, depth: 0.55, ao: 0.35, speckle: 0.35 } },
      { name: 'Old birch (black base)', group: 'Deciduous', values: { model: 'smooth', cols: 3, warp: 0.5, fibers: 0.15, peel: 0.25, lenticels: 0.6, lentLen: 14, lentDensity: 10, lentColor: '#3e3630', marks: 0.85, markColor: '#151210', scars: 0.3, color: '#e2ded5', color2: '#3a342e', color3: '#cdb8a0', mottle: 0.35, depth: 0.8, ao: 0.5, speckle: 0.4, seed: 3 } },
      { name: 'Cherry', group: 'Deciduous', values: { model: 'smooth', cols: 5, warp: 0.3, fibers: 0.2, peel: 0.3, lenticels: 0.85, lentLen: 24, lentDensity: 7, lentColor: '#b89478', marks: 0.08, markColor: '#22130f', color: '#5c3029', color2: '#2a1714', color3: '#8a5444', mottle: 0.45, depth: 0.5, ao: 0.3 } },
      { name: 'Aspen / poplar', group: 'Deciduous', values: { model: 'smooth', cols: 4, warp: 0.35, fibers: 0.1, lenticels: 0.45, lentLen: 10, lentDensity: 8, lentColor: '#3a362e', marks: 0.15, markColor: '#2a2722', scars: 0.5, color: '#cfd0b6', color2: '#5a5a48', color3: '#b8bc9a', mottle: 0.4, depth: 0.45, ao: 0.25 } },
      { name: 'Plane tree (sycamore)', group: 'Deciduous', values: { model: 'patches', cols: 6, elong: 1.4, furrow: 0.2, warp: 0.9, fibers: 0.1, inner: 0.3, color: '#9d9b80', color2: '#6b6950', color3: '#e2dbb9', colorVar: 0.6, mottle: 0.3, depth: 0.4, ao: 0.3 } },
      { name: 'Stone pine', group: 'Conifer', values: { model: 'plates', cols: 4, elong: 2.2, furrow: 0.42, irregular: 1, warp: 0.6, dome: 0.35, layers: 3, flakes: 0.3, flakeSize: 1.6, cracks: 0.2, rough: 0.35, fibers: 0.15, color: '#86766c', color2: '#150f0c', color3: '#c06a3e', inner: 0.35, colorVar: 0.35, depth: 0.85, ao: 0.7 } },
      { name: 'Scots pine', group: 'Conifer', values: { model: 'plates', cols: 5, elong: 1.9, furrow: 0.4, dome: 0.4, layers: 2, flakes: 0.6, flakeSize: 0.8, cracks: 0.3, sub: 0.15, color: '#7a5f4e', color2: '#21160f', color3: '#c46c3a', inner: 0.4, depth: 0.85 } },
      { name: 'Ponderosa pine', group: 'Conifer', values: { model: 'plates', cols: 3, elong: 1.8, furrow: 0.3, irregular: 1, warp: 0.7, dome: 0.25, layers: 4, flakes: 0.5, flakeSize: 0.7, cracks: 0.15, color: '#9c6b45', color2: '#140e0a', color3: '#d49a66', inner: 0.3, depth: 0.8 } },
      { name: 'Larch', group: 'Conifer', values: { model: 'plates', cols: 5, elong: 2.6, furrow: 0.5, irregular: 0.9, warp: 0.6, dome: 0.5, layers: 1, flakes: 0.3, flakeSize: 0.6, sub: 0.7, cracks: 0.4, rough: 0.8, fibers: 0.2, color: '#7a6356', color2: '#1d130e', color3: '#9a5238', inner: 0.3, colorVar: 0.25, speckle: 0.55, depth: 0.9, ao: 0.7 } },
      { name: 'Douglas fir', group: 'Conifer', values: { cols: 4, elong: 3.5, furrow: 0.6, irregular: 0.9, warp: 0.55, dome: 0.55, sub: 0.6, cracks: 0.45, rough: 0.85, fibers: 0.3, color: '#6c5244', color2: '#1a110c', color3: '#9a5a3c', inner: 0.4, speckle: 0.55, depth: 1, ao: 0.75 } },
      { name: 'Silver fir', group: 'Conifer', values: { model: 'plates', cols: 6, elong: 1.8, furrow: 0.32, irregular: 1, warp: 0.6, dome: 0.75, layers: 1, flakes: 0.08, flakeSize: 0.45, sub: 0.12, cracks: 0.3, rough: 0.7, fibers: 0.1, color: '#8d8a84', color2: '#26221f', color3: '#a8623c', inner: 0.04, colorVar: 0.3, mottle: 0.45, speckle: 0.5, lichen: 0.2, lichenColor: '#c9c8bd', depth: 0.75 } },
      { name: 'Spruce', group: 'Conifer', values: { model: 'scales', cols: 12, elong: 0.8, furrow: 0.2, irregular: 0.6, flakes: 0.3, warp: 0.3, dome: 0.7, inner: 0.25, color: '#6b5245', color2: '#24190f', color3: '#8c5a40', fibers: 0.2 } },
      { name: 'Redwood / sequoia', group: 'Conifer', values: { model: 'fibrous', cols: 8, elong: 8, furrow: 0.5, warp: 0.5, fibers: 0.85, color: '#8c4b30', color2: '#2e140b', color3: '#aa623c', inner: 0.25, depth: 0.9 } },
      { name: 'Cedar', group: 'Conifer', values: { model: 'fibrous', cols: 10, elong: 7, furrow: 0.4, warp: 0.55, fibers: 0.75, color: '#7a6052', color2: '#2a1f18', color3: '#8e5a44', inner: 0.15, mottle: 0.5 } },
      { name: 'Palm', group: 'Tropical', values: { model: 'rings', cols: 6, rings: 8, furrow: 0.25, warp: 0.35, fibers: 0.6, color: '#8a7a60', color2: '#3e3326', color3: '#a08a68', inner: 0.2, depth: 0.7 } },
      { name: 'Eucalyptus', group: 'Tropical', values: { model: 'patches', cols: 5, elong: 1.8, furrow: 0.15, warp: 0.75, fibers: 0.15, inner: 0.35, color: '#c9c2a6', color2: '#9c9a80', color3: '#e2c6ae', colorVar: 0.7, mottle: 0.35, depth: 0.35, ao: 0.25 } },
      { name: 'Stringybark', group: 'Tropical', values: { model: 'fibrous', cols: 7, elong: 5, furrow: 0.55, warp: 0.8, fibers: 0.95, color: '#7d6a58', color2: '#241c15', color3: '#9a7454', inner: 0.3, depth: 0.95 } },
      { name: 'Dead tree (bleached)', group: 'Worn', values: { cols: 6, elong: 4, furrow: 0.5, cracks: 0.6, fibers: 0.7, sub: 0.2, color: '#9a958d', color2: '#3a3733', color3: '#7a736a', inner: 0, mottle: 0.4, lichen: 0.2 } },
      { name: 'Burnt bark', group: 'Worn', values: { cols: 6, furrow: 0.55, cracks: 0.85, sub: 0.5, rough: 0.7, depth: 0.9, color: '#26221f', color2: '#080707', color3: '#3a2a20', inner: 0.15, mottle: 0.5 } },
      { name: 'Haunted tree', group: 'Worn', values: { cols: 5, elong: 3, furrow: 0.6, warp: 0.9, cracks: 0.5, color: '#3a3532', color2: '#0c0a09', color3: '#4a2a22', moss: 0.25, mossColor: '#3a4a2a', lichen: 0.15, lichenColor: '#7a8a80' } },
      { name: 'Hand-painted oak', group: 'Stylized', values: { style: 'painted', bands: 4, cols: 5, elong: 2.2, furrow: 0.5, warp: 0.6, cracks: 0.4, fibers: 0.2, rough: 0.2, speckle: 0, color: '#7d5f45', color2: '#33231a', color3: '#9a6a44', highlight: 0.6 } },
      { name: 'Hand-painted pine', group: 'Stylized', values: { style: 'painted', model: 'plates', bands: 4, cols: 4, elong: 1.7, furrow: 0.4, layers: 2, flakes: 0.5, rough: 0.15, speckle: 0, inner: 0.5, color: '#8a5a42', color2: '#2a1810', color3: '#d27a44', highlight: 0.6 } },
      { name: 'Toon trunk', group: 'Stylized', values: { style: 'toon', bands: 3, cols: 5, elong: 2.2, furrow: 0.45, warp: 0.6, cracks: 0.15, fibers: 0, rough: 0, speckle: 0, color: '#8a5a3a', color2: '#4a2c1c', color3: '#a8703e', mottle: 0, colorVar: 0.2, outline: 2 } },
      { name: 'Toon birch', group: 'Stylized', values: { style: 'toon', model: 'smooth', bands: 3, cols: 4, warp: 0.3, fibers: 0, speckle: 0, lenticels: 0.7, lentLen: 22, lentDensity: 7, lentColor: '#2a2420', marks: 0.45, scars: 0.4, markColor: '#2a2420', color: '#f2eee6', color2: '#3a342e', color3: '#ddd4c4', mottle: 0.2, outline: 1.5 } },
      { name: 'Pixel art oak', group: 'Stylized', values: { style: 'pixel', bands: 3, pixel: 8, cols: 5, elong: 3, furrow: 0.45, warp: 0.5, cracks: 0.3, fibers: 0.1, rough: 0.2, speckle: 0, color: '#7a5a3e', color2: '#2e1e14', color3: '#9a6a42', outline: 0 } },
      { name: 'Pixel art birch', group: 'Stylized', values: { style: 'pixel', model: 'smooth', bands: 3, pixel: 8, cols: 4, warp: 0.3, fibers: 0, speckle: 0, lenticels: 0.8, lentLen: 26, lentDensity: 6, lentColor: '#2a2420', marks: 0.45, markColor: '#1e1b18', color: '#eeeae2', color2: '#3a342e', color3: '#d4cbbd', mottle: 0.25, outline: 0 } },
      { name: 'Enchanted tree', group: 'Stylized', values: { style: 'painted', bands: 5, cols: 6, elong: 3.5, warp: 0.7, furrow: 0.45, speckle: 0.1, color: '#5e4a78', color2: '#1e1630', color3: '#59d6c0', inner: 0.6, moss: 0.25, mossColor: '#3fa08a', highlight: 0.7 } },
    ],

    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height), S = Math.min(W, H), k = S / 512, seed = p.seed | 0, ar = H / W;
      const model = MODELS.includes(p.model) ? p.model : 'furrowed';
      const style = p.style || 'realistic', toonish = style === 'toon' || style === 'pixel', painted = style === 'painted', real = style === 'realistic';
      const nx = Math.max(1, p.cols | 0), stag = (model === 'furrowed' && p.diamond) || model === 'scales';
      let ny = Math.max(VORO[model] ? 2 : 1, Math.round((nx * ar) / Math.max(0.1, p.elong))); // 2+ rows: a single row repeats as a visible band
      if (stag && ny & 1) ny++;
      const sx = W / nx, sy = H / ny;
      // periods for a feature count f across (fy follows the aspect; st > 1 stretches the features along the trunk)
      const per = (f, st = 1) => [Math.max(1, Math.round(f)), Math.max(1, Math.round((f * ar) / st))];
      const fwPx = Math.max(0.8 * k, p.furrow * sx * 0.32);
      const jit = model === 'patches' ? 1 : model === 'scales' ? 0.25 + p.irregular * 0.45 : 0.2 + p.irregular * 0.8;
      const LAY = Math.max(0, p.layers | 0), stretch = Math.max(1, Math.min(4, p.elong * 0.6));
      const spk = real ? p.speckle : p.speckle * 0.3;

      // low-frequency periodic fields (warp in lattice units, mottling, fissure width, moss / lichen / mark masks)
      const [wpx, wpy] = per(Math.max(1, nx * 0.6));
      const warpA = p.warp * (model === 'patches' ? 0.8 : 0.55);
      const wX = U.coarseField(W, H, 160, (x, y) => (fbm((x / W) * wpx, (y / H) * wpy, wpx, wpy, 3, seed + 11) - 0.5) * warpA * 2);
      const wY = U.coarseField(W, H, 160, (x, y) => (fbm((x / W) * wpx, (y / H) * wpy, wpx, wpy, 3, seed + 12) - 0.5) * warpA);
      const [mx, my] = per(3);
      const mot = U.coarseField(W, H, 200, (x, y) => U.fractal('perlin', (x / W) * mx, (y / H) * my, mx, my, 4, 0.55, 'fbm', seed + 13));
      const [vx, vy] = per(Math.max(2, nx * 0.8), stretch);
      const fwVar = U.coarseField(W, H, 160, (x, y) => fbm((x / W) * vx, (y / H) * vy, vx, vy, 2, seed + 17));
      const [gx, gy] = per(4);
      const mossF = p.moss > 0 ? U.coarseField(W, H, 220, (x, y) => U.fractal('perlin', (x / W) * gx, (y / H) * gy, gx, gy, 5, 0.55, 'fbm', seed + 14)) : null;
      const [lx1, ly1] = per(Math.max(4, nx * 2));
      const lichF = p.lichen > 0 ? U.coarseField(W, H, 320, (x, y) => U.fractal('perlin', (x / W) * lx1, (y / H) * ly1, lx1, ly1, 5, 0.6, 'fbm', seed + 15)) : null;
      const mkx = Math.max(1, Math.round(nx * 0.5)), mky = Math.max(1, Math.round(mkx * ar * 3.5));
      const markF = p.marks > 0 ? U.coarseField(W, H, 300, (x, y) => U.fractal('perlin', (x / W) * mkx, (y / H) * mky, mkx, mky, 6, 0.55, 'fbm', seed + 16)) : null;

      // detail periods
      const [rgx, rgy] = per(nx * 3.5, 1.2);             // ragged fissure walls
      const [flx, fly] = per((nx * 2.2) / Math.max(0.2, p.flakeSize), 1.3); // flake terraces
      const [rqx, rqy] = per(Math.max(24, nx * 9), 1.8);          // corky roughness
      const fibN = nx * Math.max(4, Math.round(70 / nx)), fibY = Math.max(1, Math.round((fibN * ar) / 10)), fk = fibN / nx;
      const [spx, spy] = per(48);                                 // fine color noise
      const detailCells = Math.min(S, Math.max(256, S * 0.5));
      const ragF = U.coarseField(W, H, detailCells, (x, y) => { const uu = x / W, vv = y / H, ix = Math.min(W - 1, x | 0) + Math.min(H - 1, y | 0) * W; return fbm((uu + wX[ix] / nx) * rgx, (vv + wY[ix] / ny) * rgy, rgx, rgy, 3, seed + 23); });
      const spF = height || spk <= 0 ? null : U.coarseField(W, H, detailCells, (x, y) => fbm((x / W) * spx, (y / H) * spy, spx, spy, 2, seed + 71));
      const lnx = Math.max(1, p.lentDensity | 0), lny = Math.max(1, Math.round(lnx * ar * 2.5));
      const lLen = p.lentLen * k, lThick = Math.max(0.9 * k, p.lentLen * 0.18 * k);
      const cY = Math.max(1, Math.round((nx * ar) / Math.max(0.1, p.elong))), R = Math.max(1, p.rings | 0);
      const crN = Math.max(1, Math.round(Math.max(0.3, p.elong) * 0.5)); // cross cracks per lattice cell
      const SUBM = 3, fw2 = Math.max(0.7 * k, fwPx * 0.38);
      // smooth bark: peeling strips (wide, thin bands), black patch cracks, chevron scars
      const [pfx, pfy] = per(Math.max(2, nx), 0.12);
      const bkx = Math.max(2, Math.round(nx * 2.5)), bky = Math.max(2, Math.round(bkx * ar * 4));
      const scx = Math.max(1, Math.round(nx * 0.75)), scy = Math.max(1, Math.round(scx * ar * 0.9));

      const N = W * H, Hh = new Float32Array(N), Ed = new Float32Array(N);
      const Rr = height ? null : new Float32Array(N), Gg = height ? null : new Float32Array(N), Bb = height ? null : new Float32Array(N);
      const c1 = U.hex(p.color), c2 = U.hex(p.color2), c3 = U.hex(p.color3), lc = U.hex(p.lentColor), mc = U.hex(p.markColor);
      const moC = U.hex(p.mossColor), liC = U.hex(p.lichenColor);
      const nb = Math.max(2, p.bands | 0);
      const quant = (t) => {
        if (real) return t;
        const s = clamp(t) * (nb - 1), i = Math.floor(s), f = s - i;
        return (i + (painted ? smoothstep(0.3, 0.7, f) : f >= 0.5 ? 1 : 0)) / (nb - 1);
      };
      const hard = (a) => (toonish ? (a > 0.5 ? 1 : 0) : a);

      /* ---- pass 1: height, edge signal (for ink lines) and unlit color ---- */
      for (let y = 0, i = 0; y < H; y++) {
        const v = (y + 0.5) / H;
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W;
          const wx = wX[i], wy = wY[i], uw = u + wx / nx, vw = v + wy / ny;
          const X = u * nx + wx, Y = v * ny + wy;
          const fib = U.fractal('perlin', (u * nx + wx * 0.6) * fk, v * fibY, fibN, fibY, 3, 0.55, 'ridged', seed + 20);
          const grain = hash(x, y, seed + 21) - 0.5;
          let h, ed = 1, pid = 0.5;
          let lt = 0;    // 0 = weathered outer layer … 1 = fresh inner bark
          let fz = 0;    // fissure amount: 0 on the plate tops … 1 at the fissure bottom
          let pr = -1, pg = 0, pb = 0; // patch base color (peeling patches)
          let mark = 0, markTop = 0, lent = 0, lcore = 0, peelUp = 0, peelGone = 0, lvar = 0;

          if (VORO[model]) {
            U.voro(X, Y, nx, ny, seed, jit, stag, sx, sx, 0, V); // cells in lattice space, then stretched: long ridges
            pid = V.id;
            const rag = ragF[i];
            if (model === 'patches') {
              const e2 = V.e + (rag - 0.5) * sx * 0.12 * p.irregular + (fib - 0.5) * fwPx * 0.6 + grain * 0.6 * k;
              const ps = Math.max(1.2 * k, fwPx * 0.3);
              ed = clamp(e2 / ps);
              const t = V.id, step = smoothstep(0, ps, e2);
              // fresh patches lie a little lower than the older bark around them, with a lifted, shadowed rim
              h = 0.5 + (t < p.inner ? -0.06 : (t - 0.5) * 0.14) - (1 - step) * 0.1 + (fib - 0.5) * 0.04 * p.fibers;
              if (t < p.inner) { pr = c3[0]; pg = c3[1]; pb = c3[2]; }
              else { const f = (t - p.inner) / Math.max(0.01, 1 - p.inner); pr = lerp(c1[0], c2[0], f); pg = lerp(c1[1], c2[1], f); pb = lerp(c1[2], c2[2], f); }
            } else {
              const fw = fwPx * (0.55 + 0.9 * fwVar[i]);
              const e = V.e + (rag - 0.5) * (fw * 1.3 + sx * 0.06) * (0.35 + p.irregular * 0.65) + grain * 0.5 * k;
              const t = clamp(e / fw), sh = 1 - (1 - t) * (1 - t); // V-shaped fissure with a rounded shoulder
              const Rp = sx * (model === 'scales' ? 0.42 : 0.5), d = clamp(V.e / Rp), dome = d * (2 - d);
              let top = 0.5 + 0.4 * lerp(1, dome, p.dome) + (V.id - 0.5) * 0.08;
              if (model === 'scales') {
                // roof tiles: each scale rises toward its lower edge, which overlaps the next one
                const ty = clamp(((Y - V.py) * sy) / sy + 0.5);
                top *= 0.72 + 0.34 * ty;
                if (hash(V.ci, V.cj, seed + 50) < p.flakes * 0.4) { top -= 0.22; lt = 1; } // fallen scale
              }
              // per-plate noise: soft lumps on the plate tops, and the terraces of the flake layers
              const n = fbm(uw * flx + V.id * 7.31, vw * fly + V.id * 3.17, flx, fly, 3, seed + 25);
              top += (n - 0.5) * 0.2;
              // stacked flake layers: the top layers peel off first near the plate edges
              if (LAY > 0) {
                const q = clamp((n - 0.5) * 1.7 + 0.5 + (p.flakes - 0.5) * 1.3 + (1 - d) * 0.3) * (LAY + 0.999);
                const li = Math.floor(q), fr = li >= LAY ? 0 : q - li, stp = smoothstep(0.84, 1, fr);
                const lip = Math.exp(-(((fr - 0.8) / 0.07) ** 2)) * 0.02; // the curled edge of the flake above
                top -= ((li + stp) * 0.1 * (4 / (LAY + 3))) - lip;
                lvar = hash(li, V.ci * 131 + V.cj, seed + 26) - 0.5;
                lt = Math.max(lt, Math.pow((li + stp) / LAY, 0.75));
                ed = Math.min(ed, 1 - Math.exp(-(((fr - 0.92) / 0.05) ** 2)) * (li < LAY ? 1 : 0));
              }
              const fb = 0.03 + 0.07 * rag;
              h = lerp(fb, top, sh);
              fz = 1 - sh;
              ed = Math.min(ed, clamp(e / fw * 1.4));
              // finer crack network: corky chunks
              if (p.sub > 0) {
                U.voro(X * SUBM, Y * SUBM, nx * SUBM, ny * SUBM, seed + 5, 0.9, false, sx / SUBM, sx / SUBM, 0, V2);
                const e2 = V2.e + (rag - 0.5) * fw2 * 1.6 + grain * 0.4 * k, t2 = clamp(e2 / fw2), cut = (1 - t2 * (2 - t2)) * p.sub * (0.55 + 0.45 * hash(V2.ci, V2.cj, seed + 6));
                h = lerp(h, fb + (h - fb) * 0.3, cut);
                fz = Math.max(fz, cut * 0.75);
                ed = Math.min(ed, 1 - cut);
              }
              // horizontal breaks across the ridges, slanted per cell
              if (p.cracks > 0 && model !== 'scales') {
                const ct = Y * crN + V.id * 3.7 + (X - V.px) * 0.6 * (V.id - 0.5) + (rag - 0.5) * 0.25, ci = Math.floor(ct), f = ct - ci;
                const key = ci - Math.floor(V.py) * crN;
                if (hash(V.ci * 97 + mod(key, 61), V.cj, seed + 9) < p.cracks) {
                  const dd = Math.min(f, 1 - f) * (sy / crN), cw = 1 * k + fw * 0.7;
                  const cr = (1 - smoothstep(cw * 0.1, cw, dd + (rag - 0.5) * cw * 0.8 + grain * 0.4 * k)) * (0.6 + 0.4 * hash(V.ci, mod(key, 61), seed + 8));
                  h = lerp(h, fb + (h - fb) * 0.4, cr * sh);
                  fz = Math.max(fz, cr * 0.8 * sh);
                  ed = Math.min(ed, 1 - cr);
                }
              }
            }
          } else if (model === 'smooth') {
            const band = fbm(u * 2, v * Math.max(2, Math.round(40 * ar)), 2, Math.max(2, Math.round(40 * ar)), 2, seed + 34);
            h = 0.55 + (mot[i] - 0.5) * 0.1 + (band - 0.5) * 0.04 + (fib - 0.5) * 0.05 * p.fibers;
            if (p.peel > 0) {
              const pn = fbm(uw * pfx, v * pfy + wy * 0.2, pfx, pfy, 4, seed + 33) + grain * 0.01;
              const t1 = 0.7 - p.peel * 0.16, t0 = 0.3 + p.peel * 0.12;
              peelUp = smoothstep(t1, t1 + 0.012, pn);
              peelGone = 1 - smoothstep(t0 - 0.012, t0, pn);
              h += peelUp * (0.05 + (pn - t1) * 0.4) - peelGone * 0.035;
              ed = Math.min(ed, 1 - peelUp * 0.6);
            }
            if (markF) {
              // black, cracked, horizontally torn patches; rougher and lower than the smooth bark
              const mv = markF[i] + (ragF[i] - 0.5) * 0.12 + grain * 0.02;
              const th = 0.7 - p.marks * 0.3;
              mark = smoothstep(th, th + 0.03, mv);
              if (mark > 0) {
                // thick, rough black bark: raised lumps torn by mostly horizontal cracks
                const crk = U.fractal('perlin', uw * bkx, vw * bky, bkx, bky, 4, 0.5, 'ridged', seed + 41);
                const bt = 1 - smoothstep(0.72, 0.93, crk + grain * 0.04);
                const lump = U.fractal('perlin', uw * rqx, vw * rqy * 0.5, rqx, Math.max(1, Math.round(rqy * 0.5)), 3, 0.55, 'ridged', seed + 42);
                const inner = smoothstep(th + 0.02, th + 0.25, mv);
                markTop = bt * (0.4 + 0.6 * lump);
                h = lerp(h, 0.5 + inner * 0.12 + (bt * (2 - bt)) * (0.1 + 0.12 * inner) + (lump - 0.5) * 0.12 - (1 - bt) * 0.12, mark);
                ed = Math.min(ed, 1 - mark);
              }
            }
            if (p.scars > 0) {
              const sc = chevrons(u * scx + wx * (scx / nx), v * scy + wy * (scy / ny), scx, scy, W / scx, H / scy, (W / scx) * 0.45, p.scars, seed + 45);
              if (sc > mark) { h = lerp(h, 0.42, sc - mark); mark = Math.max(mark, sc); markTop = Math.min(markTop, 0.3); ed = Math.min(ed, 1 - sc); }
            }
          } else if (model === 'fibrous') {
            const a = U.fractal('perlin', u * nx + wx, v * cY + wy, nx, cY, 4, 0.5, 'ridged', seed + 30);
            const b = U.fractal('perlin', u * nx * 2 + wx * 1.6, v * cY * 2 + wy, nx * 2, cY * 2, 3, 0.5, 'ridged', seed + 31);
            const rv = Math.max(a, b * 0.9 - 0.04), fw = 0.12 + p.furrow * 0.5;
            const t = clamp((1 - rv - (fib - 0.5) * 0.15) / fw), sh = 1 - (1 - t) * (1 - t);
            const fur = 1 - sh;
            h = 0.06 + sh * (0.6 + 0.25 * fib + 0.1 * rv);
            ed = sh;
            fz = fur;
            pid = rv;
          } else { // rings (palm)
            const Yr = v * R + wy * (R / ny) + (fib - 0.5) * 0.03, j = Math.floor(Yr), t = Yr - j, jr = mod(j, R);
            const gw = 0.04 + p.furrow * 0.22;
            const g = smoothstep(0, gw, t + grain * 0.01);
            h = g * (0.5 + 0.4 * Math.pow(1 - t, 1.3)) * (0.9 + 0.1 * hash(jr, 0, seed + 31));
            ed = clamp(t / gw);
            fz = 1 - g;
            pid = hash(jr, 0, seed + 32);
          }
          if (model !== 'smooth' && model !== 'patches') {
            h *= 1 - p.fibers * 0.25 * (1 - fib) * (1 - fz * 0.8);
            if (p.rough > 0) {
              const rq = U.fractal('perlin', uw * rqx, vw * rqy, rqx, rqy, 3, 0.55, 'ridged', seed + 22);
              h += (rq - 0.55) * p.rough * 0.13 * (0.35 + 0.65 * (1 - fz));
            }
          }

          // lenticels (any bark type): dark lens-shaped pores with a slightly raised rim
          if (p.lenticels > 0) {
            lent = dashes(u * lnx + wx * (lnx / nx), v * lny + wy * (lny / ny) * 0.3, lnx, lny, W / lnx, H / lny, lLen, lThick, p.lenticels, seed + 40) * (1 - mark);
            lcore = DASH.core * lent;
            h += lent * 0.025 - lcore * 0.04;
            ed = Math.min(ed, 1 - lent);
          }
          if (markF && model !== 'smooth') {
            const th = 0.7 - p.marks * 0.25;
            mark = smoothstep(th, th + 0.04, markF[i] + grain * 0.03);
            h -= mark * 0.03;
            ed = Math.min(ed, 1 - mark);
            markTop = 0.5;
          }
          // moss in the furrows, lichen on the ridges
          let moss = 0, lich = 0;
          if (mossF) {
            const m0 = 0.78 - p.moss * 0.42;
            moss = smoothstep(m0, m0 + 0.06, mossF[i] + fz * (0.12 + p.moss * 0.22) + (1 - h) * 0.08 + grain * 0.05);
            h = lerp(h, Math.max(h, 0.35 + fib * 0.25), moss);
          }
          if (lichF) {
            const l0 = 0.74 - p.lichen * 0.24, lv = lichF[i] + grain * 0.04;
            lich = smoothstep(l0, l0 + 0.02, lv) * (1 - smoothstep(0.3, 0.6, fz));
            h += lich * (0.02 + 0.02 * smoothstep(l0 + 0.03, l0 + 0.06, lv));
          }
          h = clamp(h);
          Hh[i] = h; Ed[i] = ed;
          if (height) continue;

          // unlit color
          let r, g, b;
          const sp = 1 + (hash(x, y, seed + 70) - 0.5) * spk * 0.22 + (spF ? spF[i] - 0.5 : 0) * spk * 0.35;
          if (pr >= 0) {
            const f = (1 + (mot[i] - 0.5) * p.mottle * 0.5) * sp, edge = 1 - smoothstep(0, 1, ed);
            r = lerp(pr * f, c2[0], edge * 0.6); g = lerp(pg * f, c2[1], edge * 0.6); b = lerp(pb * f, c2[2], edge * 0.6);
          } else if (model === 'smooth') {
            const t = quant(smoothstep(0.38, 0.62, mot[i])) * Math.min(1, p.mottle * 1.2);
            r = lerp(c1[0], c3[0], t * 0.6); g = lerp(c1[1], c3[1], t * 0.6); b = lerp(c1[2], c3[2], t * 0.6);
            const f = (1 + (fib - 0.5) * 0.08 * p.fibers) * (1 + (mot[i] - 0.5) * p.mottle * 0.3) * sp;
            r *= f; g *= f; b *= f;
            if (peelGone > 0) { const a = hard(peelGone); r = lerp(r, c3[0] * sp, a); g = lerp(g, c3[1] * sp, a); b = lerp(b, c3[2] * sp, a); }
            if (peelUp > 0) { const a = hard(peelUp) * 0.5; r = lerp(r, Math.min(255, r * 1.06 + 6), a); g = lerp(g, Math.min(255, g * 1.05 + 5), a); b = lerp(b, Math.min(255, b * 1.03 + 3), a); }
          } else {
            const tq = quant(lt);
            r = lerp(c1[0], c3[0], tq); g = lerp(c1[1], c3[1], tq); b = lerp(c1[2], c3[2], tq);
            const f = (1 + (pid - 0.5) * p.colorVar * 0.45 + lvar * 0.16 * lt) * (1 + (mot[i] - 0.5) * p.mottle * 0.7) * sp;
            r *= f; g *= f; b *= f;
            // fissures: inner bark on the walls, dark furrow color at the bottom
            const wall = hard(clamp(fz * (1 - fz) * 4) * p.inner), deep = toonish ? (fz > 0.55 ? 1 : 0) : smoothstep(0.35, 1, fz) * 0.92;
            r = lerp(r, c3[0] * sp, wall); g = lerp(g, c3[1] * sp, wall); b = lerp(b, c3[2] * sp, wall);
            r = lerp(r, c2[0], deep); g = lerp(g, c2[1], deep); b = lerp(b, c2[2], deep);
          }
          if (lent > 0) { const a = hard(lent) * (0.55 + 0.45 * lcore); r = lerp(r, lc[0], a); g = lerp(g, lc[1], a); b = lerp(b, lc[2], a); }
          if (mark > 0) {
            // weathered gray on the patch tops, near black in the cracks
            const a = hard(mark), t = toonish ? 0 : markTop * 0.35;
            const mr = lerp(mc[0], c1[0] * 0.55, t), mg = lerp(mc[1], c1[1] * 0.55, t), mbb = lerp(mc[2], c1[2] * 0.55, t);
            r = lerp(r, mr * sp, a); g = lerp(g, mg * sp, a); b = lerp(b, mbb * sp, a);
          }
          if (moss > 0) {
            const f = 0.75 + 0.5 * fib, a = hard(moss);
            r = lerp(r, moC[0] * f, a); g = lerp(g, moC[1] * f, a); b = lerp(b, moC[2] * f, a);
          }
          if (lich > 0) { const a = hard(lich), f = sp * (0.9 + 0.2 * hash(x >> 1, y >> 1, seed + 72)); r = lerp(r, liC[0] * f, a); g = lerp(g, liC[1] * f, a); b = lerp(b, liC[2] * f, a); }
          Rr[i] = r; Gg[i] = g; Bb[i] = b;
        }
      }

      /* ---- pass 2: lighting, cavity occlusion, stylization (from the wrapped height, so it tiles) ---- */
      const img = ctx.createImageData(W, H), o = img.data;
      const la = p.lightAngle * Math.PI / 180, el = 48 * Math.PI / 180;
      const Lx = Math.cos(la) * Math.cos(el), Ly = Math.sin(la) * Math.cos(el), Lz = Math.sin(el);
      const hs = p.depth * 26 * k, ow = p.outline * k, oc = U.hex(p.outlineColor);
      const qL = (l) => {
        if (real) return l;
        const lo = 0.45, hi = 1.3, s = clamp((l - lo) / (hi - lo)) * (nb - 1), i = Math.floor(s), f = s - i;
        return lo + (hi - lo) * (i + (painted ? smoothstep(0.3, 0.7, f) : f >= 0.5 ? 1 : 0)) / (nb - 1);
      };
      const B1 = height || p.ao <= 0 ? null : blurWrap(Hh, W, H, 3 * k), B2 = height || p.ao <= 0 ? null : blurWrap(Hh, W, H, 12 * k);
      const cavG = 2.5 + p.depth * 4;
      const out = new Float32Array(N * 3);
      for (let y = 0, i = 0; y < H; y++) {
        const yu = (y - 1 + H) % H, yd = (y + 1) % H;
        for (let x = 0; x < W; x++, i++) {
          const xl = (x - 1 + W) % W, xr = (x + 1) % W;
          const h = Hh[i];
          if (height) { out[i * 3] = h; continue; }
          const dx = (Hh[y * W + xr] - Hh[y * W + xl]) * 0.5, dy = (Hh[yd * W + x] - Hh[yu * W + x]) * 0.5;
          const nx0 = -dx * hs, ny0 = -dy * hs, nl = Math.sqrt(nx0 * nx0 + ny0 * ny0 + 1);
          const ndl = (nx0 * Lx + ny0 * Ly + Lz) / nl, lam = Math.max(0, ndl * 0.8 + 0.2 * (ndl * 0.5 + 0.5)) / (Lz * 0.8 + 0.2 * (Lz * 0.5 + 0.5));
          let occ = 1;
          if (B1) {
            const cav = clamp((B1[i] - h) * cavG * 1.4 + (B2[i] - h) * cavG * 0.8);
            occ = (1 - p.ao * 0.8 * (toonish ? (cav > 0.35 ? 0.6 : 0) : cav)) * lerp(1 - p.ao * 0.45, 1, smoothstep(0.04, 0.5, h));
          }
          const L = qL((1 + (lam - 1) * p.shade) * occ);
          let r = Rr[i] * L, g = Gg[i] * L, b = Bb[i] * L;
          if ((painted || style === 'toon') && p.highlight > 0 && p.shade > 0) {
            const hl = smoothstep(1.08, 1.25, lam) * smoothstep(0.35, 0.6, h) * p.highlight * 0.45;
            const a = style === 'toon' ? (hl > 0.12 ? p.highlight * 0.4 : 0) : hl;
            r += (255 - r) * a; g += (255 - g) * a; b += (255 - b) * a;
          }
          if (painted) { const f = 1 + (hash(x >> 1, y >> 3, seed + 60) - 0.5) * 0.05; r *= f; g *= f; b *= f; }
          if (toonish && ow > 0) {
            const e = Ed[i], ex = (Ed[y * W + xr] - Ed[y * W + xl]) * 0.5, ey = (Ed[yd * W + x] - Ed[yu * W + x]) * 0.5;
            const gr = Math.sqrt(ex * ex + ey * ey);
            if (gr > 1e-4) {
              const d = Math.abs(e - 0.5) / gr, a = 1 - smoothstep(ow * 0.5 - 0.5, ow * 0.5 + 0.5, d);
              r = lerp(r, oc[0], a); g = lerp(g, oc[1], a); b = lerp(b, oc[2], a);
            } else if (e < 0.5) { r = lerp(r, oc[0], 0.5); g = lerp(g, oc[1], 0.5); b = lerp(b, oc[2], 0.5); }
          }
          out[i * 3] = r; out[i * 3 + 1] = g; out[i * 3 + 2] = b;
        }
      }

      // pixel art: a whole number of blocks per tile, each block takes the color at its center (tiles)
      const pix = style === 'pixel';
      const bx = pix ? Math.max(2, Math.round(W / Math.max(1, p.pixel * k))) : W, by = pix ? Math.max(2, Math.round(H / Math.max(1, p.pixel * k))) : H;
      for (let y = 0, i = 0; y < H; y++) {
        const sy0 = pix ? Math.min(H - 1, Math.floor((Math.floor((y * by) / H) + 0.5) * H / by)) : y;
        for (let x = 0; x < W; x++, i++) {
          const sx0 = pix ? Math.min(W - 1, Math.floor((Math.floor((x * bx) / W) + 0.5) * W / bx)) : x;
          const s = (sy0 * W + sx0) * 3, k4 = i * 4;
          if (height) { o[k4] = o[k4 + 1] = o[k4 + 2] = clamp(out[s]) * 255; }
          else { o[k4] = out[s]; o[k4 + 1] = out[s + 1]; o[k4 + 2] = out[s + 2]; }
          o[k4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
