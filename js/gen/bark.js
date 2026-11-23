/* Tree bark: tileable bark textures (seamless in both directions). Seven bark structures built on periodic
   noise and cellular patterns: furrowed ridges (oak, ash, elm, walnut, chestnut), flaky
   plates (pine, maple), scales (spruce, larch), smooth bark with lenticels and dark marks (birch, beech,
   cherry, aspen), peeling camo patches (plane tree, eucalyptus), fibrous strips (redwood, cedar) and ring
   scars (palm). Fibers, cross cracks, flaking with the inner bark showing through, moss in the furrows,
   lichen on the ridges, baked lighting and furrow darkness. Stylized looks: hand-painted, toon / cel with
   ink outlines and pixel art. Every pattern uses whole periods per tile, so it repeats seamlessly; the
   height map drives the normal map mode. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, smoothstep, hash, mod } = U;
  const V = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };
  const V2 = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };
  const VORO = { furrowed: 1, plates: 1, scales: 1, patches: 1 };
  const isM = (...m) => (p) => m.includes(p.model);

  /* short horizontal dashes (lenticels) on a jittered nx × ny lattice: coverage 0..1, tiles */
  function dashes(X, Y, nx, ny, sx, sy, len, thick, keep, seed) {
    const xi = Math.floor(X), yi = Math.floor(Y), ri = Math.min(4, Math.ceil((len * 1.6) / sx) + 1);
    let best = 0;
    for (let j = yi - 1; j <= yi + 1; j++) {
      for (let i = xi - ri; i <= xi + ri; i++) {
        const wi = mod(i, nx), wj = mod(j, ny);
        if (hash(wi, wj, seed + 3) > keep) continue;
        const r = hash(wi, wj, seed), L = len * (0.4 + r * 1.2), T = thick * (0.7 + r * 0.6);
        const dx = ((X - i - hash(wi, wj, seed + 1)) * sx) / L, dy = ((Y - j - hash(wi, wj, seed + 2)) * sy) / T;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1.2) best = Math.max(best, clamp((1 - d) * T + 0.5));
      }
    }
    return best;
  }

  U.register({
    id: 'bark',
    name: 'Tree Bark',
    desc: 'Tileable tree bark: furrowed, plated, scaly, smooth, peeling, fibrous and palm bark with moss, lichen and hand-painted, toon or pixel art looks',
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
      { key: 'cols', label: 'Ridges across', type: 'int', min: 1, max: 40, default: 7, tip: 'Number of ridges, plates or patches across the tile' },
      { key: 'elong', label: 'Stretch', type: 'range', min: 0.3, max: 10, step: 0.05, default: 3.5, show: (p) => p.model !== 'rings', tip: 'How much longer than wide the ridges and plates are (along the trunk)' },
      { key: 'rings', label: 'Rings down', type: 'int', min: 2, max: 60, default: 8, show: isM('rings'), tip: 'Leaf scar rings per tile' },
      { key: 'furrow', label: 'Furrow width', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.model !== 'smooth' },
      { key: 'irregular', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.9, show: (p) => !!VORO[p.model] },
      { key: 'diamond', label: 'Diamond pattern', type: 'bool', default: false, show: isM('furrowed'), tip: 'Offset rows: ridges merge into a net of diamonds (ash, walnut)' },
      { key: 'warp', label: 'Waviness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Detail' },
      { key: 'depth', label: 'Relief depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7 },
      { key: 'rough', label: 'Roughness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.model !== 'smooth' && p.model !== 'patches', tip: 'Small bumps on the ridge and plate tops' },
      { key: 'fibers', label: 'Fibers', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Fine stringy grain along the trunk' },
      { key: 'cracks', label: 'Cross cracks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: isM('furrowed', 'plates'), tip: 'Ridges broken into blocks (old oak)' },
      { key: 'flakes', label: 'Flaking', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: isM('plates', 'scales'), tip: 'Layered flakes on the plates; some fall off and show the inner bark' },
      { key: 'lenticels', label: 'Lenticels', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Short horizontal breathing pores (birch, cherry)' },
      { key: 'lentDensity', label: 'Lenticels across', type: 'int', min: 2, max: 60, default: 12, show: (p) => p.lenticels > 0 },
      { key: 'lentLen', label: 'Lenticel length', type: 'range', min: 1, max: 60, step: 0.5, default: 10, show: (p) => p.lenticels > 0, tip: 'px @ 512' },
      { key: 'marks', label: 'Dark marks', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Dark patches and bands (birch)' },

      { type: 'section', label: 'Color' },
      { key: 'color', label: 'Bark color', type: 'color', default: '#6e6254' },
      { key: 'color2', label: 'Furrow color', type: 'color', default: '#2b241e' },
      { key: 'color3', label: 'Inner bark', type: 'color', default: '#6a4a34', tip: 'The under-layer: furrow bottoms, cracks, flaked spots and fresh patches' },
      { key: 'inner', label: 'Inner bark showing', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: 'lentColor', label: 'Lenticel color', type: 'color', default: '#3a3028', show: (p) => p.lenticels > 0 },
      { key: 'markColor', label: 'Mark color', type: 'color', default: '#1e1b18', show: (p) => p.marks > 0 },
      { key: 'colorVar', label: 'Plate variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Slightly different shade per ridge or plate' },
      { key: 'mottle', label: 'Mottling', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Large soft light / dark blotches' },

      { type: 'section', label: 'Moss & lichen', active: (p) => p.moss > 0 || p.lichen > 0 },
      { key: 'moss', label: 'Moss', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Grows in the furrows first' },
      { key: 'mossColor', label: 'Moss color', type: 'color', default: '#4f6a2a', show: (p) => p.moss > 0 },
      { key: 'lichen', label: 'Lichen', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Pale crusty spots on the ridges' },
      { key: 'lichenColor', label: 'Lichen color', type: 'color', default: '#a7b292', show: (p) => p.lichen > 0 },

      { type: 'section', label: 'Lighting' },
      { key: 'shade', label: 'Baked shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, tip: 'Light and shadow from the relief (0 for a pure albedo map)' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -120, show: (p) => p.shade > 0, tip: 'Direction the light comes from in the image (-90 = from the top)' },
      { key: 'ao', label: 'Furrow darkness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Ambient occlusion in the deep furrows' },

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
      { name: 'Old oak (mossy)', group: 'Deciduous', values: { cols: 6, furrow: 0.5, cracks: 0.7, depth: 0.85, moss: 0.4, lichen: 0.25, color: '#625849', color2: '#221d18' } },
      { name: 'Ash', group: 'Deciduous', values: { cols: 11, elong: 3.6, furrow: 0.32, irregular: 0.35, diamond: true, warp: 0.25, cracks: 0.1, depth: 0.6, color: '#7f7b71', color2: '#36332d', color3: '#5e574c', inner: 0, mottle: 0.25 } },
      { name: 'Elm', group: 'Deciduous', values: { cols: 9, elong: 4.2, furrow: 0.45, warp: 0.65, cracks: 0.3, fibers: 0.5, color: '#5f5449', color2: '#241e19', color3: '#7a5c44', inner: 0.2 } },
      { name: 'Black walnut', group: 'Deciduous', values: { cols: 10, elong: 2.8, furrow: 0.38, irregular: 0.5, diamond: true, cracks: 0.25, color: '#3f3631', color2: '#171210', color3: '#4a3a30', mottle: 0.2 } },
      { name: 'Sweet chestnut', group: 'Deciduous', values: { cols: 8, elong: 5, furrow: 0.42, warp: 0.4, cracks: 0.15, fibers: 0.45, color: '#6a5b4d', color2: '#2a221b', color3: '#7a5a40', inner: 0.15 } },
      { name: 'Willow', group: 'Deciduous', values: { cols: 8, elong: 5.5, furrow: 0.4, warp: 0.6, cracks: 0.2, fibers: 0.6, depth: 0.85, color: '#6a6151', color2: '#26211a', color3: '#6e5a42' } },
      { name: 'Maple (mature)', group: 'Deciduous', values: { model: 'plates', cols: 6, elong: 3.4, furrow: 0.25, flakes: 0.6, cracks: 0.35, color: '#77716a', color2: '#33302b', color3: '#6a5644', inner: 0.2, mottle: 0.3 } },
      { name: 'Beech', group: 'Deciduous', values: { model: 'smooth', cols: 4, warp: 0.4, fibers: 0.1, lenticels: 0.25, lentLen: 5, lentDensity: 16, lentColor: '#6f6d66', marks: 0.08, markColor: '#4a4844', color: '#a09f98', color2: '#5c5a55', color3: '#8b9286', mottle: 0.7, colorVar: 0.1, depth: 0.4, ao: 0.2 } },
      { name: 'Silver birch', group: 'Deciduous', values: { model: 'smooth', cols: 4, warp: 0.35, fibers: 0.15, lenticels: 0.75, lentLen: 18, lentDensity: 9, lentColor: '#4a4038', marks: 0.5, markColor: '#1e1b18', color: '#e9e5dd', color2: '#3a342e', color3: '#d4cbbd', mottle: 0.35, colorVar: 0.1, depth: 0.45, ao: 0.2 } },
      { name: 'Cherry', group: 'Deciduous', values: { model: 'smooth', cols: 5, warp: 0.3, fibers: 0.2, lenticels: 0.85, lentLen: 24, lentDensity: 7, lentColor: '#b89478', marks: 0.1, markColor: '#22130f', color: '#5c3029', color2: '#2a1714', color3: '#7a4a3c', mottle: 0.45, depth: 0.45, ao: 0.25 } },
      { name: 'Aspen / poplar', group: 'Deciduous', values: { model: 'smooth', cols: 4, warp: 0.35, fibers: 0.1, lenticels: 0.45, lentLen: 14, lentDensity: 6, lentColor: '#3a362e', marks: 0.18, markColor: '#2a2722', color: '#cfd0b6', color2: '#5a5a48', color3: '#b8bc9a', mottle: 0.4, depth: 0.4, ao: 0.2 } },
      { name: 'Plane tree (sycamore)', group: 'Deciduous', values: { model: 'patches', cols: 6, elong: 1.4, furrow: 0.2, warp: 0.9, fibers: 0.1, inner: 0.3, color: '#9d9b80', color2: '#6b6950', color3: '#e2dbb9', colorVar: 0.6, mottle: 0.3, depth: 0.35, ao: 0.2 } },
      { name: 'Scots pine', group: 'Conifer', values: { model: 'plates', cols: 4, elong: 1.7, furrow: 0.35, flakes: 0.8, cracks: 0.3, inner: 0.55, color: '#7a5a46', color2: '#2a1c14', color3: '#c46c3a', depth: 0.8 } },
      { name: 'Ponderosa pine', group: 'Conifer', values: { model: 'plates', cols: 3, elong: 1.9, furrow: 0.22, irregular: 1, warp: 0.7, flakes: 0.9, cracks: 0.2, inner: 0.35, color: '#9c6b45', color2: '#1c140f', color3: '#d09060', depth: 0.75 } },
      { name: 'Spruce', group: 'Conifer', values: { model: 'scales', cols: 12, elong: 0.8, furrow: 0.18, irregular: 0.6, flakes: 0.5, warp: 0.3, inner: 0.25, color: '#6b5245', color2: '#2c2019', color3: '#8c5a40', fibers: 0.2 } },
      { name: 'Larch', group: 'Conifer', values: { model: 'scales', cols: 7, elong: 1.1, furrow: 0.3, irregular: 0.8, flakes: 0.7, warp: 0.5, inner: 0.45, color: '#7a5848', color2: '#2a1a14', color3: '#b0583a', depth: 0.8 } },
      { name: 'Redwood / sequoia', group: 'Conifer', values: { model: 'fibrous', cols: 8, elong: 8, furrow: 0.45, warp: 0.5, fibers: 0.85, color: '#8c4b30', color2: '#3a1a10', color3: '#aa623c', inner: 0.25, depth: 0.85 } },
      { name: 'Cedar', group: 'Conifer', values: { model: 'fibrous', cols: 10, elong: 7, furrow: 0.35, warp: 0.55, fibers: 0.75, color: '#7a6052', color2: '#33261e', color3: '#8e5a44', inner: 0.15, mottle: 0.5 } },
      { name: 'Palm', group: 'Tropical', values: { model: 'rings', cols: 6, rings: 8, furrow: 0.25, warp: 0.35, fibers: 0.6, color: '#8a7a60', color2: '#3e3326', color3: '#a08a68', inner: 0.2, depth: 0.7 } },
      { name: 'Eucalyptus', group: 'Tropical', values: { model: 'patches', cols: 5, elong: 1.8, furrow: 0.15, warp: 0.75, fibers: 0.15, inner: 0.35, color: '#c9c2a6', color2: '#9c9a80', color3: '#e2c6ae', colorVar: 0.7, mottle: 0.35, depth: 0.3, ao: 0.15 } },
      { name: 'Stringybark', group: 'Tropical', values: { model: 'fibrous', cols: 7, elong: 5, furrow: 0.5, warp: 0.8, fibers: 0.95, color: '#7d6a58', color2: '#2c231b', color3: '#9a7454', inner: 0.3, depth: 0.9 } },
      { name: 'Dead tree (bleached)', group: 'Worn', values: { cols: 7, elong: 4, furrow: 0.45, cracks: 0.6, fibers: 0.7, color: '#9a958d', color2: '#3c3935', color3: '#7a736a', inner: 0, mottle: 0.4, lichen: 0.2 } },
      { name: 'Burnt bark', group: 'Worn', values: { cols: 6, furrow: 0.5, cracks: 0.85, depth: 0.85, color: '#26221f', color2: '#0b0a09', color3: '#3a2a20', inner: 0.15, mottle: 0.5 } },
      { name: 'Haunted tree', group: 'Worn', values: { cols: 5, elong: 3, furrow: 0.55, warp: 0.9, cracks: 0.5, color: '#3a3532', color2: '#0f0d0c', color3: '#4a2a22', moss: 0.25, mossColor: '#3a4a2a', lichen: 0.15, lichenColor: '#7a8a80' } },
      { name: 'Hand-painted oak', group: 'Stylized', values: { style: 'painted', bands: 4, cols: 5, elong: 2.2, furrow: 0.45, warp: 0.6, cracks: 0.4, fibers: 0.2, color: '#7d5f45', color2: '#33231a', color3: '#9a6a44', highlight: 0.6 } },
      { name: 'Hand-painted pine', group: 'Stylized', values: { style: 'painted', model: 'plates', bands: 4, cols: 4, elong: 1.7, furrow: 0.35, flakes: 0.6, inner: 0.5, color: '#8a5a42', color2: '#2a1810', color3: '#d27a44', highlight: 0.6 } },
      { name: 'Toon trunk', group: 'Stylized', values: { style: 'toon', bands: 3, cols: 5, elong: 2.2, furrow: 0.45, warp: 0.6, cracks: 0.15, fibers: 0, color: '#8a5a3a', color2: '#4a2c1c', color3: '#a8703e', mottle: 0, colorVar: 0.2, outline: 2 } },
      { name: 'Toon birch', group: 'Stylized', values: { style: 'toon', model: 'smooth', bands: 3, cols: 4, warp: 0.3, fibers: 0, lenticels: 0.7, lentLen: 22, lentDensity: 7, lentColor: '#2a2420', marks: 0.45, markColor: '#2a2420', color: '#f2eee6', color2: '#3a342e', color3: '#ddd4c4', mottle: 0.2, outline: 1.5 } },
      { name: 'Pixel art oak', group: 'Stylized', values: { style: 'pixel', bands: 3, pixel: 8, cols: 5, elong: 3, furrow: 0.45, warp: 0.5, cracks: 0.3, fibers: 0.1, color: '#7a5a3e', color2: '#2e1e14', color3: '#9a6a42', outline: 0 } },
      { name: 'Pixel art birch', group: 'Stylized', values: { style: 'pixel', model: 'smooth', bands: 3, pixel: 8, cols: 4, warp: 0.3, fibers: 0, lenticels: 0.8, lentLen: 26, lentDensity: 6, lentColor: '#2a2420', marks: 0.45, markColor: '#1e1b18', color: '#eeeae2', color2: '#3a342e', color3: '#d4cbbd', mottle: 0.25, outline: 0 } },
      { name: 'Enchanted tree', group: 'Stylized', values: { style: 'painted', bands: 5, cols: 6, elong: 3.5, warp: 0.7, furrow: 0.4, color: '#5e4a78', color2: '#1e1630', color3: '#59d6c0', inner: 0.45, moss: 0.25, mossColor: '#3fa08a', highlight: 0.7 } },
    ],

    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height), S = Math.min(W, H), k = S / 512, seed = p.seed | 0, ar = H / W;
      const model = ['furrowed', 'plates', 'scales', 'smooth', 'patches', 'fibrous', 'rings'].includes(p.model) ? p.model : 'furrowed';
      const style = p.style || 'realistic', toonish = style === 'toon' || style === 'pixel', painted = style === 'painted';
      const nx = Math.max(1, p.cols | 0), stag = (model === 'furrowed' && p.diamond) || model === 'scales';
      let ny = Math.max(VORO[model] ? 2 : 1, Math.round((nx * ar) / Math.max(0.1, p.elong))); // 2+ rows: a single row repeats as a visible band
      if (stag && ny & 1) ny++;
      const sx = W / nx, sy = H / ny;
      const per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const fwPx = Math.max(0.6 * k, p.furrow * sx * 0.5);
      const jit = model === 'patches' ? 1 : model === 'scales' ? p.irregular * 0.5 : p.irregular;

      // low-frequency periodic fields (warp in lattice units, mottling, moss / lichen / mark masks)
      const [wpx, wpy] = per(Math.max(1, nx * 0.6));
      const warpA = p.warp * (model === 'patches' ? 0.8 : 0.55);
      const wX = U.coarseField(W, H, 160, (x, y) => (U.fractal('perlin', (x / W) * wpx, (y / H) * wpy, wpx, wpy, 3, 0.5, 'fbm', seed + 11) - 0.5) * warpA * 2);
      const wY = U.coarseField(W, H, 160, (x, y) => (U.fractal('perlin', (x / W) * wpx, (y / H) * wpy, wpx, wpy, 3, 0.5, 'fbm', seed + 12) - 0.5) * warpA);
      const [mx, my] = per(3);
      const mot = U.coarseField(W, H, 200, (x, y) => U.fractal('perlin', (x / W) * mx, (y / H) * my, mx, my, 4, 0.55, 'fbm', seed + 13));
      const [gx, gy] = per(4);
      const mossF = p.moss > 0 ? U.coarseField(W, H, 220, (x, y) => U.fractal('perlin', (x / W) * gx, (y / H) * gy, gx, gy, 5, 0.55, 'fbm', seed + 14)) : null;
      const [lx1, ly1] = per(Math.max(3, nx * 1.5));
      const lichF = p.lichen > 0 ? U.coarseField(W, H, 300, (x, y) => U.fractal('perlin', (x / W) * lx1, (y / H) * ly1, lx1, ly1, 5, 0.6, 'fbm', seed + 15)) : null;
      const mkx = Math.max(1, Math.round(nx * 0.5)), mky = Math.max(1, Math.round(mkx * ar * 4));
      const markF = p.marks > 0 ? U.coarseField(W, H, 300, (x, y) => U.fractal('perlin', (x / W) * mkx, (y / H) * mky, mkx, mky, 5, 0.55, 'fbm', seed + 16)) : null;
      // fibers: many fine ridges along the trunk; a whole multiple of nx so they follow the warp
      const fibN = nx * Math.max(4, Math.round(70 / nx)), fibY = Math.max(1, Math.round((fibN * ar) / 10)), fk = fibN / nx;
      // lenticel lattice
      const lnx = Math.max(1, p.lentDensity | 0), lny = Math.max(1, Math.round(lnx * ar * 2.5));
      const lLen = p.lentLen * k, lThick = Math.max(0.7 * k, p.lentLen * 0.16 * k);
      // fibrous / rings lattices
      const cY = Math.max(1, Math.round((nx * ar) / Math.max(0.1, p.elong))), R = Math.max(1, p.rings | 0);
      const crN = Math.max(1, Math.round(Math.max(0.3, p.elong) * 0.5)); // cross cracks per lattice cell
      // surface roughness: small bumps on the ridge tops
      const rq = nx * Math.max(3, Math.round(40 / nx)), rqy = Math.max(1, Math.round((rq * ar) / 2));

      const N = W * H, Hh = new Float32Array(N), Ed = new Float32Array(N);
      const Rr = height ? null : new Float32Array(N), Gg = height ? null : new Float32Array(N), Bb = height ? null : new Float32Array(N);
      const c1 = U.hex(p.color), c2 = U.hex(p.color2), c3 = U.hex(p.color3), lc = U.hex(p.lentColor), mc = U.hex(p.markColor);
      const moC = U.hex(p.mossColor), liC = U.hex(p.lichenColor);
      const nb = Math.max(2, p.bands | 0);
      const quant = (t) => {
        if (style === 'realistic') return t;
        const s = clamp(t) * (nb - 1), i = Math.floor(s), f = s - i;
        return (i + (painted ? smoothstep(0.3, 0.7, f) : f >= 0.5 ? 1 : 0)) / (nb - 1);
      };

      /* ---- pass 1: height, edge signal (for ink lines) and unlit color ---- */
      for (let y = 0, i = 0; y < H; y++) {
        const v = (y + 0.5) / H;
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W;
          const wx = wX[i], wy = wY[i];
          const X = u * nx + wx, Y = v * ny + wy;
          const fib = U.fractal('perlin', (u * nx + wx * 0.6) * fk, v * fibY, fibN, fibY, 3, 0.55, 'ridged', seed + 20);
          const grain = hash(x, y, seed + 21) - 0.5;
          let h, ed, inn = 0, pid = 0.5, tone;
          let pr = -1, pg = 0, pb = 0; // patch base color (peeling patches)

          if (VORO[model]) {
            U.voro(X, Y, nx, ny, seed, jit, stag, sx, sx, 0, V); // cells measured in lattice space, then stretched: long ridges, not tilted borders
            pid = V.id;
            const e2 = V.e + (fib - 0.5) * fwPx * 0.8 + grain * 0.6 * k;
            if (model === 'patches') {
              const ps = Math.max(1.2 * k, fwPx * 0.25);
              ed = clamp(e2 / ps);
              h = 0.45 + V.id * 0.2 - (1 - smoothstep(0, ps, e2)) * 0.12 + (fib - 0.5) * 0.05 * p.fibers;
              tone = 0.5;
              // patch color: fresh light under-layer for a share of the patches, older ones between bark and furrow color
              const t = V.id;
              if (t < p.inner) { pr = c3[0]; pg = c3[1]; pb = c3[2]; }
              else { const f = (t - p.inner) / Math.max(0.01, 1 - p.inner); pr = lerp(c1[0], c2[0], f); pg = lerp(c1[1], c2[1], f); pb = lerp(c1[2], c2[2], f); }
              inn = 0;
            } else if (model === 'scales') {
              const dy = (Y - V.py) * sy, t = clamp(dy / sy + 0.5);
              const rim = smoothstep(0, fwPx, e2);
              ed = clamp(e2 / fwPx);
              h = rim * (0.3 + 0.7 * Math.pow(t, 0.8)) * (0.85 + 0.15 * V.id);
              inn = (1 - smoothstep(0, fwPx * 0.8, e2)) * p.inner;
              if (p.flakes > 0 && hash(V.ci, V.cj, seed + 50) < p.flakes * 0.3) { h *= 0.7; inn = Math.max(inn, p.inner * 0.9 * rim); }
              tone = h;
            } else {
              ed = clamp(e2 / fwPx);
              const r = smoothstep(0, fwPx * (model === 'plates' ? 0.55 : 1), e2);
              if (model === 'furrowed') h = Math.pow(r, 0.7) * (0.85 + 0.15 * smoothstep(fwPx, fwPx * 3, e2));
              else h = r * 0.92;
              h *= 0.88 + 0.12 * V.id;
              inn = (1 - smoothstep(0, fwPx * 0.8, e2)) * p.inner;
              if (model === 'plates' && p.flakes > 0) {
                // layered flakes: a finer cell pattern inside each plate, some flakes missing
                U.voro(X * 3, Y * 3, nx * 3, ny * 3, seed + 5, 0.9, false, sx / 3, sx / 3, 0, V2);
                const sub = 1 - smoothstep(0.3 * k, 0.3 * k + 1.4 * k, V2.e + grain * 0.5 * k);
                h *= 1 - p.flakes * (0.12 * (1 - V2.id) + 0.2 * sub);
                inn = Math.max(inn, sub * p.inner * 0.6 * r);
                if (V2.id < p.flakes * 0.22) { h *= 0.8; inn = Math.max(inn, p.inner * r); }
                ed = Math.min(ed, 1 - sub * p.flakes * 0.9);
              }
              if (p.cracks > 0) {
                // horizontal breaks across the ridges, slanted per cell
                const ct = Y * crN + V.id * 3.7 + (X - V.px) * 0.6 * (V.id - 0.5), ci = Math.floor(ct), f = ct - ci;
                const key = ci - Math.floor(V.py) * crN;
                if (hash(V.ci * 97 + mod(key, 61), V.cj, seed + 9) < p.cracks) {
                  const d = Math.min(f, 1 - f) * (sy / crN), cw = 0.5 * k + fwPx * 0.12;
                  const cr = (1 - smoothstep(cw * 0.3, cw, d + grain * 0.4 * k)) * smoothstep(0, fwPx, e2) * (0.5 + 0.5 * hash(V.ci, mod(key, 61), seed + 8));
                  h *= 1 - cr * 0.6;
                  inn = Math.max(inn, cr * p.inner * 0.8);
                  ed = Math.min(ed, 1 - cr);
                }
              }
              tone = h;
            }
          } else if (model === 'smooth') {
            h = 0.55 + (mot[i] - 0.5) * 0.15 + (fib - 0.5) * 0.06 * p.fibers;
            ed = 1;
            tone = 0.5;
          } else if (model === 'fibrous') {
            const rv = U.fractal('perlin', (u * nx + wx), v * cY + wy, nx, cY, 4, 0.5, 'ridged', seed + 30);
            const fw = 0.1 + p.furrow * 0.5, fur = smoothstep(1 - fw, 1, rv + (fib - 0.5) * 0.15);
            h = (1 - fur) * (0.7 + 0.3 * fib) * (0.9 + 0.1 * rv);
            ed = 1 - fur;
            inn = fur * p.inner;
            pid = rv;
            tone = h;
          } else { // rings (palm)
            const Yr = v * R + wy * (R / ny) + (fib - 0.5) * 0.03, j = Math.floor(Yr), t = Yr - j, jr = mod(j, R);
            const gw = 0.04 + p.furrow * 0.22;
            const g = smoothstep(0, gw, t + grain * 0.01);
            h = g * (0.5 + 0.4 * Math.pow(1 - t, 1.3)) * (0.9 + 0.1 * hash(jr, 0, seed + 31));
            ed = clamp(t / gw);
            inn = (1 - g) * p.inner;
            pid = hash(jr, 0, seed + 32);
            tone = h;
          }
          if (model !== 'smooth' && model !== 'patches') {
            h *= 1 - p.fibers * 0.35 * (1 - fib);
            if (p.rough > 0) h *= 1 - p.rough * 0.35 * U.fractal('perlin', u * rq + wx * (rq / nx), v * rqy, rq, rqy, 3, 0.55, 'fbm', seed + 22);
          }

          // lenticels and dark marks (any bark type)
          let lent = 0, mark = 0;
          if (p.lenticels > 0) {
            lent = dashes(u * lnx + wx * (lnx / nx), v * lny + wy * (lny / ny) * 0.3, lnx, lny, W / lnx, H / lny, lLen, lThick, p.lenticels, seed + 40);
            h += lent * 0.05;
            ed = Math.min(ed, 1 - lent);
          }
          if (markF) {
            const th = 0.68 - p.marks * 0.25;
            mark = smoothstep(th, th + 0.04, markF[i] + grain * 0.03);
            h -= mark * 0.04;
            ed = Math.min(ed, 1 - mark);
          }
          // moss in the furrows, lichen on the ridges
          let moss = 0, lich = 0;
          if (mossF) {
            const m0 = 0.78 - p.moss * 0.42;
            moss = smoothstep(m0, m0 + 0.06, mossF[i] + (1 - h) * (0.1 + p.moss * 0.2) + grain * 0.05);
            h = lerp(h, Math.max(h, 0.35 + fib * 0.25), moss);
          }
          if (lichF) {
            const l0 = 0.74 - p.lichen * 0.24;
            lich = smoothstep(l0, l0 + 0.025, lichF[i] + grain * 0.04) * smoothstep(0.25, 0.5, h);
            h += lich * 0.03;
          }
          h = clamp(h);
          Hh[i] = h; Ed[i] = ed;
          if (height) continue;

          // unlit color
          let r, g, b;
          if (pr >= 0) {
            const f = 1 + (mot[i] - 0.5) * p.mottle * 0.5;
            r = pr * f; g = pg * f; b = pb * f;
            const edge = 1 - smoothstep(0, 1, ed);
            r = lerp(r, c2[0], edge * 0.6); g = lerp(g, c2[1], edge * 0.6); b = lerp(b, c2[2], edge * 0.6);
          } else if (model === 'smooth') {
            const t = quant(smoothstep(0.38, 0.62, mot[i])) * Math.min(1, p.mottle * 1.4);
            r = lerp(c1[0], c3[0], t); g = lerp(c1[1], c3[1], t); b = lerp(c1[2], c3[2], t);
            const f = (1 + (fib - 0.5) * 0.08 * p.fibers) * (1 + (mot[i] - 0.5) * p.mottle * 0.5);
            r *= f; g *= f; b *= f;
          } else {
            const t = quant(smoothstep(0.05, 0.85, tone));
            r = lerp(c2[0], c1[0], t); g = lerp(c2[1], c1[1], t); b = lerp(c2[2], c1[2], t);
            const f = (1 + (pid - 0.5) * p.colorVar * 0.45) * (1 + (mot[i] - 0.5) * p.mottle * 0.7);
            r *= f; g *= f; b *= f;
            const ii = toonish ? (inn > 0.4 ? 1 : 0) : clamp(inn);
            r = lerp(r, c3[0], ii); g = lerp(g, c3[1], ii); b = lerp(b, c3[2], ii);
          }
          if (lent > 0) { const a = toonish ? (lent > 0.5 ? 1 : 0) : lent; r = lerp(r, lc[0], a); g = lerp(g, lc[1], a); b = lerp(b, lc[2], a); }
          if (mark > 0) { const a = toonish ? (mark > 0.5 ? 1 : 0) : mark; r = lerp(r, mc[0], a); g = lerp(g, mc[1], a); b = lerp(b, mc[2], a); }
          if (moss > 0) {
            const f = 0.75 + 0.5 * fib, a = toonish ? (moss > 0.5 ? 1 : 0) : moss;
            r = lerp(r, moC[0] * f, a); g = lerp(g, moC[1] * f, a); b = lerp(b, moC[2] * f, a);
          }
          if (lich > 0) { const a = toonish ? (lich > 0.5 ? 1 : 0) : lich; r = lerp(r, liC[0], a); g = lerp(g, liC[1], a); b = lerp(b, liC[2], a); }
          Rr[i] = r; Gg[i] = g; Bb[i] = b;
        }
      }

      /* ---- pass 2: lighting, stylization (from the wrapped height gradient, so it tiles) ---- */
      const img = ctx.createImageData(W, H), o = img.data;
      const la = p.lightAngle * Math.PI / 180, el = 50 * Math.PI / 180;
      const Lx = Math.cos(la) * Math.cos(el), Ly = Math.sin(la) * Math.cos(el), Lz = Math.sin(el);
      const hs = p.depth * 20 * k, ow = p.outline * k, oc = U.hex(p.outlineColor);
      const qL = (l) => {
        if (style === 'realistic') return l;
        const lo = 0.45, hi = 1.3, s = clamp((l - lo) / (hi - lo)) * (nb - 1), i = Math.floor(s), f = s - i;
        return lo + (hi - lo) * (i + (painted ? smoothstep(0.3, 0.7, f) : f >= 0.5 ? 1 : 0)) / (nb - 1);
      };
      const out = new Float32Array(N * 3);
      for (let y = 0, i = 0; y < H; y++) {
        const yu = (y - 1 + H) % H, yd = (y + 1) % H;
        for (let x = 0; x < W; x++, i++) {
          const xl = (x - 1 + W) % W, xr = (x + 1) % W;
          const h = Hh[i];
          if (height) { out[i * 3] = h; continue; }
          const dx = (Hh[y * W + xr] - Hh[y * W + xl]) * 0.5, dy = (Hh[yd * W + x] - Hh[yu * W + x]) * 0.5;
          const nx0 = -dx * hs, ny0 = -dy * hs, nl = Math.sqrt(nx0 * nx0 + ny0 * ny0 + 1);
          const lam = Math.max(0, (nx0 * Lx + ny0 * Ly + Lz) / nl) / Lz;
          let L = qL(1 + (lam - 1) * p.shade) * lerp(1 - p.ao * 0.7, 1, smoothstep(0, 0.6, h));
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
            } else if (e < 0.5 && ow > 0) { r = lerp(r, oc[0], 0.5); g = lerp(g, oc[1], 0.5); b = lerp(b, oc[2], 0.5); }
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
  function isS(...s) { return (p) => s.includes(p.style); }
})();
