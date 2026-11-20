/* Rubber / PVC floor: tileable rubber and vinyl flooring. Raised coin or square studs, diamond-plate
   lozenges, ribs, pebble bumps, hammered dimples or a plain sheet; optional tile layout (PVC tile grid
   with grooves or welded seams, interlocking puzzle-edge mats, checkered tiles); EPDM color flecks,
   mottling, baked bevel light and ambient occlusion; wear: worn tops, dirt in the cavities, scuffs,
   scratches and sheen variation. Height map for the normal map mode. All counts are whole numbers and
   all noise is periodic, so the texture tiles. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;
  const fr = (x) => x - Math.floor(x);

  const RAISED = ['coin', 'square', 'diamond', 'ribbed', 'pebble'];
  const ROTATES = ['coin', 'square', 'diamond', 'ribbed'];
  const SIZED = ['coin', 'square', 'diamond', 'ribbed', 'pebble', 'hammered'];
  const isPat = (...l) => (p) => l.includes(p.pattern);
  const tiled = (p) => p.layout !== 'none';

  // rounded-rectangle edge distance (px, positive inside)
  const rbox = (qx, qy, hx, hy, rc) => {
    const ax = Math.abs(qx) - (hx - rc), ay = Math.abs(qy) - (hy - rc);
    return rc - (Math.hypot(Math.max(ax, 0), Math.max(ay, 0)) + Math.min(Math.max(ax, ay), 0));
  };

  /* low-resolution periodic field (fn(u, v) periodic over [0,1)), sampled bilinearly with wrapping */
  function lowField(W, H, fn) {
    const gw = Math.max(8, Math.ceil(W / 4)), gh = Math.max(8, Math.ceil(H / 4)), a = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) a[j * gw + i] = fn(i / gw, j / gh);
    return (u, v) => {
      const x = u * gw, y = v * gh, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const xa = ((x0 % gw) + gw) % gw, xb = (xa + 1) % gw, ya = ((y0 % gh) + gh) % gh, yb = (ya + 1) % gh;
      const r0 = a[ya * gw + xa] + (a[ya * gw + xb] - a[ya * gw + xa]) * fx, r1 = a[yb * gw + xa] + (a[yb * gw + xb] - a[yb * gw + xa]) * fx;
      return r0 + (r1 - r0) * fy;
    };
  }

  /* surface relief. Returns a function (u, v) -> profile 0..1 (1 = top surface) and sets pat.d
     (signed distance to the raised shape's edge in px, positive inside) and pat.id (per-element random) */
  function makePattern(p, W, H) {
    const seed = p.seed | 0, ar = H / W, k = Math.min(W, H) / 512;
    const out = { d: 1e3, id: 0.5, fn: null };
    const kind = p.pattern, rot = String(p.rotation);
    if (kind === 'plain') { out.fn = () => { out.d = 1e3; return 1; }; return out; }
    let n = Math.max(1, p.count | 0), ny = Math.max(1, Math.round(n * ar));
    if (kind === 'diamond' && rot !== '45') { n += n % 2; ny += ny % 2; } // alternating lozenges need even counts
    const soft = clamp(p.soft);

    if (kind === 'pebble' || kind === 'hammered') {
      const cw = Math.min(W / n, H / ny), size = clamp(p.size, 0.05, 1);
      const gap = (1 - size) * 0.25 * cw, bev = Math.max(0.75, (0.04 + soft * 0.4) * cw);
      out.fn = (u, v) => {
        const w = U.worley(u * n, v * ny, n, ny, seed + 31);
        out.id = w.id;
        if (kind === 'pebble') {
          const d = (w.f2 - w.f1) * 0.5 * cw - gap;
          out.d = d;
          return smoothstep(0, bev, d) * (0.8 + 0.2 * w.id);
        }
        // hammered: shallow craters, rims where the craters meet
        const r = 0.45 + size * 0.45, t = clamp(w.f1 / r);
        const dep = (1 - t * t) ** (1 + (1 - soft) * 2) * (0.6 + 0.4 * w.id);
        out.d = (w.f1 - r * 0.5) * cw;
        return 1 - dep;
      };
      return out;
    }

    // lattice: rot 0 (axis aligned), 90 (swapped), 45 (diagonal lattice: a = cx + cy, b = cx - cy)
    let pxX, pxY, PI, PJ;
    const r45 = rot === '45' && ROTATES.includes(kind), r90 = rot === '90' && ROTATES.includes(kind);
    if (r45) { pxX = pxY = Math.hypot(W / n, H / ny) / 2; }
    else if (r90) { pxX = H / ny; pxY = W / n; PI = ny; PJ = n; }
    else { pxX = W / n; pxY = H / ny; PI = n; PJ = ny; }
    const pitch = Math.min(pxX, pxY), size = clamp(p.size, 0.05, 0.98);
    const rad = size * 0.5 * pitch, bev = Math.max(0.75, soft * rad * 0.9 + 0.5 * k);
    const key = r45 ? (i, j) => hash(U.mod(i + j, 2 * n), U.mod(i - j, 2 * ny), seed + 5) : (i, j) => hash(U.mod(i, PI), U.mod(j, PJ), seed + 5);
    const rc = clamp(p.corner) * rad;
    // diamond plate lozenge: half length / half width (px)
    const hl = (0.2 + size * 0.3) * pitch * (r45 ? 0.85 : 1), hwz = size * 0.26 * pitch + 0.5 * k;
    out.fn = (u, v) => {
      let gx, gy;
      if (r45) { gx = u * n + v * ny; gy = u * n - v * ny; }
      else if (r90) { gx = v * ny; gy = u * n; }
      else { gx = u * n; gy = v * ny; }
      const i = Math.floor(gx), j = Math.floor(gy), qx = (gx - i - 0.5) * pxX, qy = (gy - j - 0.5) * pxY;
      let d;
      switch (kind) {
        case 'coin': d = rad - Math.hypot(qx, qy); break;
        case 'square': d = rbox(qx, qy, rad, rad, rc); break;
        case 'ribbed': d = size * 0.5 * pxY - Math.abs(qy); out.id = hash(U.mod(j, PJ || 2 * n), 7, seed); out.d = d; return smoothstep(0, bev, d);
        default: { // diamond plate: lozenges alternating +-45 deg (or 0 / 90 on the diagonal lattice)
          const flip = (i + j) & 1;
          let al, pe;
          if (r45) { al = flip ? qx : qy; pe = flip ? qy : qx; }
          else { const s1 = (qx + qy) * Math.SQRT1_2, s2 = (qx - qy) * Math.SQRT1_2; al = flip ? s2 : s1; pe = flip ? s1 : s2; }
          const t = clamp(Math.abs(al) / hl);
          d = Math.min(hwz * (1 - t * t) - Math.abs(pe), (hl - Math.abs(al)) * 0.5);
        }
      }
      out.id = key(i, j); out.d = d;
      return smoothstep(0, bev, d);
    };
    return out;
  }

  /* tile layout: sets t.seam (px distance to the nearest seam) and t.id / t.alt for the tile */
  function makeTiles(p, W, H) {
    const ar = H / W, seed = p.seed | 0;
    const t = { seam: 1e3, alt: 0, id: 0, fn: null };
    if (p.layout === 'none') { t.fn = () => {}; return t; }
    let T = Math.max(1, p.tiles | 0), Ty = Math.max(1, Math.round(T * ar));
    if (p.checker) { T += T % 2; Ty += Ty % 2; }
    const tw = W / T, th = H / Ty;
    const id = (i, j) => { i = U.mod(i, T); j = U.mod(j, Ty); t.alt = (i + j) & 1; t.id = hash(i, j, seed + 77); };
    if (p.layout === 'grid') {
      t.fn = (u, v) => {
        const tx = u * T, ty = v * Ty;
        t.seam = Math.min(Math.abs(tx - Math.round(tx)) * tw, Math.abs(ty - Math.round(ty)) * th);
        id(Math.floor(tx), Math.floor(ty));
      };
      return t;
    }
    // puzzle: seams displaced by a smoothed trapezoid wave (teeth), distance corrected by the slope
    const teeth = Math.max(1, p.teeth | 0), depth = p.toothDepth, K = 3, NORM = Math.sqrt(1 + K * K) / K, TW = U.TAU;
    let dv = 0;
    const disp = (s) => { const S = Math.sin(TW * s), q = K * S, r = Math.sqrt(1 + q * q); dv = depth * teeth * K * TW * Math.cos(TW * s) * NORM / (r * r * r); return depth * (q / r) * NORM; };
    t.fn = (u, v) => {
      const tx = u * T, ty = v * Ty;
      const gx = tx - disp(ty * teeth / 1) , sx = dv * tw / th; // dv: d(disp)/d(ty)
      const gy = ty - disp(tx * teeth), sy = dv * th / tw;
      const ex = Math.abs(gx - Math.round(gx)) * tw / Math.sqrt(1 + sx * sx), ey = Math.abs(gy - Math.round(gy)) * th / Math.sqrt(1 + sy * sy);
      t.seam = Math.min(ex, ey);
      id(Math.floor(gx), Math.floor(gy));
    };
    return t;
  }

  U.register({
    id: 'rubber-floor',
    name: 'Rubber / PVC Floor',
    desc: 'Tileable rubber and PVC floors with studs, diamond plate, ribs, EPDM flecks, tile seams and height map',
    uses: ['Floor materials for gyms, garages, industrial sites and playgrounds in 3D environments.', 'Grip and tread textures for mats, vehicle interiors and prop surfaces.'],
    tags: ['Texturing'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<rect x="3" y="3" width="18" height="18" rx="1.5"/><circle cx="7.5" cy="7.5" r="1.6"/><circle cx="16.5" cy="7.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="7.5" cy="16.5" r="1.6"/><circle cx="16.5" cy="16.5" r="1.6"/>'),
    params: [
      { type: 'section', label: 'Pattern' },
      { key: 'pattern', label: 'Pattern', type: 'select', default: 'coin', options: [['coin', 'Coin studs (round)'], ['square', 'Square studs'], ['diamond', 'Diamond plate (lozenges)'], ['ribbed', 'Ribbed / grooved lines'], ['pebble', 'Pebble (raised bumps)'], ['hammered', 'Hammered (dimpled)'], ['plain', 'Plain / smooth']] },
      { key: 'count', label: 'Pattern count', type: 'int', min: 2, max: 64, default: 10, show: (p) => p.pattern !== 'plain', tip: 'Studs / ribs / bumps across the texture (whole numbers, so it tiles)' },
      { key: 'rotation', label: 'Rotation', type: 'select', default: '0', options: [['0', '0°'], ['45', '45°'], ['90', '90°']], show: isPat(...ROTATES) },
      { key: 'size', label: 'Stud size', type: 'range', min: 0.15, max: 0.95, step: 0.01, default: 0.55, show: isPat(...SIZED), tip: 'Fraction of the spacing (rib width for ribs, crater size for hammered)' },
      { key: 'corner', label: 'Corner rounding', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: isPat('square') },
      { key: 'relief', label: 'Relief height', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.pattern !== 'plain', tip: 'Height of the studs / ribs: shading, cavity darkening and height map' },
      { key: 'soft', label: 'Edge softness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: (p) => p.pattern !== 'plain', tip: 'Bevel width: 0 = crisp edges, 1 = soft domes' },
      { key: 'shading', label: 'Bevel shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.pattern !== 'plain', tip: 'Baked light from the top left (set 0 for a pure albedo)' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 3 },
      { type: 'section', label: 'Tiles & seams' },
      { key: 'layout', label: 'Tile layout', type: 'select', default: 'none', options: [['none', 'None (seamless sheet)'], ['grid', 'Tile grid'], ['puzzle', 'Interlocking puzzle edges']] },
      { key: 'tiles', label: 'Tiles across', type: 'int', min: 1, max: 8, default: 2, show: tiled, tip: 'Rounded up to even counts with checker tiles' },
      { key: 'seamStyle', label: 'Seam style', type: 'select', default: 'groove', options: [['groove', 'Dark groove / gap'], ['weld', 'Welded seam (colored rod)']], show: (p) => p.layout === 'grid' },
      { key: 'seamWidth', label: 'Seam width', type: 'range', min: 0.5, max: 12, step: 0.1, default: 2.5, show: tiled, tip: 'px @ 512' },
      { key: 'seamColor', label: 'Weld rod color', type: 'color', default: '#5a5a5a', show: (p) => p.layout === 'grid' && p.seamStyle === 'weld' },
      { key: 'teeth', label: 'Teeth per edge', type: 'int', min: 1, max: 10, default: 4, show: (p) => p.layout === 'puzzle' },
      { key: 'toothDepth', label: 'Tooth depth', type: 'range', min: 0.02, max: 0.2, step: 0.005, default: 0.08, show: (p) => p.layout === 'puzzle', tip: 'Fraction of the tile size' },
      { key: 'checker', label: 'Checker tiles', type: 'bool', default: false, show: tiled },
      { key: 'color2', label: 'Alternate tile color', type: 'color', default: '#b23a32', show: (p) => tiled(p) && p.checker },
      { key: 'tileVar', label: 'Per-tile tone variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, show: tiled },
      { type: 'section', label: 'Color' },
      { key: 'base', label: 'Base color', type: 'color', default: '#2b2b2d' },
      { key: 'studSame', label: 'Studs same color', type: 'bool', default: true, show: isPat(...RAISED) },
      { key: 'studColor', label: 'Stud color', type: 'color', default: '#e0b020', show: (p) => RAISED.includes(p.pattern) && !p.studSame },
      { key: 'mottle', label: 'Mottling', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'mottleScale', label: 'Mottle scale', type: 'int', min: 1, max: 16, default: 4, show: (p) => p.mottle > 0 },
      { key: 'grain', label: 'Surface grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { type: 'section', label: 'Flecks (EPDM granules)' },
      { key: 'flecks', label: 'Fleck density', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'fleckSize', label: 'Fleck size', type: 'range', min: 1, max: 14, step: 0.1, default: 3, show: (p) => p.flecks > 0, tip: 'px @ 512' },
      { key: 'fleckCount', label: 'Fleck colors', type: 'int', min: 1, max: 3, default: 2, show: (p) => p.flecks > 0 },
      { key: 'fleck1', label: 'Fleck color 1', type: 'color', default: '#8a8a8a', show: (p) => p.flecks > 0 },
      { key: 'fleck2', label: 'Fleck color 2', type: 'color', default: '#3a6ec0', show: (p) => p.flecks > 0 && p.fleckCount >= 2 },
      { key: 'fleck3', label: 'Fleck color 3', type: 'color', default: '#d0d0d0', show: (p) => p.flecks > 0 && p.fleckCount >= 3 },
      { type: 'section', label: 'Wear' },
      { key: 'wear', label: 'Worn tops', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Stud and rib tops rubbed lighter and smoother' },
      { key: 'dirt', label: 'Dirt in cavities', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Grime around stud bases, in grooves and seams, plus a few patches' },
      { key: 'dirtColor', label: 'Dirt color', type: 'color', default: '#2a241c', show: (p) => p.dirt > 0 },
      { key: 'scuffs', label: 'Scuffs', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Smeared shoe and tire marks' },
      { key: 'scuffColor', label: 'Scuff color', type: 'color', default: '#6a6a6a', show: (p) => p.scuffs > 0, tip: 'Light grey on dark rubber, near black on light vinyl' },
      { key: 'scratches', label: 'Scratches', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: 'sheen', label: 'Sheen variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Patchy gloss / polish differences' },
    ],
    presets: [
      { name: 'Black coin rubber', group: 'Industrial', values: {} },
      { name: 'Grey industrial coin floor', group: 'Industrial', values: { base: '#5c5e62', count: 9, size: 0.5, soft: 0.2, wear: 0.35, dirt: 0.45, scuffs: 0.3, scuffColor: '#2a2a2a', scratches: 0.2 } },
      { name: 'Garage diamond rubber', group: 'Industrial', values: { pattern: 'diamond', count: 12, size: 0.6, base: '#1f1f21', relief: 0.65, soft: 0.25, dirt: 0.4, scuffs: 0.25, scuffColor: '#5a5a58' } },
      { name: 'Ribbed runner mat', group: 'Industrial', values: { pattern: 'ribbed', count: 22, size: 0.5, soft: 0.45, base: '#262628', relief: 0.55, dirt: 0.35, wear: 0.3 } },
      { name: 'Square stud tiles', group: 'Industrial', values: { pattern: 'square', count: 8, size: 0.5, corner: 0.35, base: '#38393b', layout: 'grid', tiles: 2, seamWidth: 2, dirt: 0.35 } },
      { name: 'Hammered rubber', group: 'Industrial', values: { pattern: 'hammered', count: 14, size: 0.7, soft: 0.5, relief: 0.5, base: '#303032', wear: 0.25, scuffs: 0.1 } },
      { name: 'Interlocking garage tiles', group: 'Industrial', values: { pattern: 'coin', count: 16, size: 0.5, base: '#4a4e54', layout: 'puzzle', tiles: 2, teeth: 4, toothDepth: 0.06, seamWidth: 2, tileVar: 0.25, dirt: 0.4, scuffs: 0.3, scuffColor: '#202020' } },
      { name: 'Gym floor (EPDM flecks)', group: 'Gym', values: { pattern: 'plain', base: '#1d1d1f', flecks: 0.55, fleckSize: 3, fleckCount: 3, fleck1: '#6a6a6a', fleck2: '#2f66b8', fleck3: '#c0c0c0', mottle: 0.2, wear: 0, dirt: 0.15, scuffs: 0.2, scuffColor: '#5a5a5a', scratches: 0.05 } },
      { name: 'Blue sports floor', group: 'Gym', values: { pattern: 'plain', base: '#2c5ea0', flecks: 0.25, fleckSize: 2, fleckCount: 2, fleck1: '#6e9ad8', fleck2: '#1a3a6a', mottle: 0.25, grain: 0.2, dirt: 0.1, scuffs: 0.3, scuffColor: '#1a1a22', sheen: 0.45 } },
      { name: 'Red sports floor', group: 'Gym', values: { pattern: 'plain', base: '#a8362e', flecks: 0.2, fleckSize: 2.2, fleckCount: 2, fleck1: '#d8685a', fleck2: '#5a1a16', mottle: 0.3, grain: 0.25, dirt: 0.1, scuffs: 0.3, scuffColor: '#22181a', sheen: 0.45 } },
      { name: 'Running track', group: 'Gym', values: { pattern: 'pebble', count: 48, size: 0.75, relief: 0.35, soft: 0.6, shading: 0.5, base: '#a84a34', flecks: 0.45, fleckSize: 2, fleckCount: 2, fleck1: '#2a1a16', fleck2: '#d07850', mottle: 0.35, wear: 0.15, dirt: 0.2, scuffs: 0.05 } },
      { name: 'Playground safety rubber', group: 'Gym', values: { pattern: 'pebble', count: 40, size: 0.85, relief: 0.4, soft: 0.5, base: '#3a6a34', flecks: 0.85, fleckSize: 6, fleckCount: 3, fleck1: '#4e8a44', fleck2: '#244a20', fleck3: '#7a3428', mottle: 0.2, grain: 0.5, wear: 0, dirt: 0.3, scuffs: 0, scratches: 0, sheen: 0.1 } },
      { name: 'Puzzle gym mats', group: 'Gym', values: { pattern: 'diamond', count: 32, size: 0.5, relief: 0.25, soft: 0.5, shading: 0.4, base: '#2c4c94', layout: 'puzzle', tiles: 2, teeth: 5, toothDepth: 0.07, seamWidth: 1.5, checker: true, color2: '#b0302c', tileVar: 0.1, mottle: 0.15, wear: 0, dirt: 0.2, scuffs: 0.15, scuffColor: '#1a1a1a', scratches: 0.05 } },
      { name: 'Hospital vinyl (welded)', group: 'PVC', values: { pattern: 'plain', base: '#c6d2ca', flecks: 0.4, fleckSize: 1.6, fleckCount: 3, fleck1: '#94a49a', fleck2: '#e6ece6', fleck3: '#6e8076', mottle: 0.4, mottleScale: 3, grain: 0.15, layout: 'grid', tiles: 2, seamStyle: 'weld', seamWidth: 2, seamColor: '#9aaaa0', tileVar: 0.08, wear: 0, dirt: 0.15, dirtColor: '#5a5a4a', scuffs: 0.25, scuffColor: '#3a3a3a', scratches: 0.15, sheen: 0.5 } },
      { name: 'Checkered PVC tiles', group: 'PVC', values: { pattern: 'plain', base: '#e8e4dc', layout: 'grid', tiles: 4, checker: true, color2: '#1e1e20', seamWidth: 1, tileVar: 0.1, mottle: 0.2, grain: 0.1, wear: 0, dirt: 0.25, scuffs: 0.2, scuffColor: '#2a2a2a', scratches: 0.15, sheen: 0.5 } },
      { name: 'Speckled vinyl sheet', group: 'PVC', values: { pattern: 'plain', base: '#cbb89a', flecks: 0.7, fleckSize: 1.4, fleckCount: 3, fleck1: '#8a7458', fleck2: '#efe4d0', fleck3: '#5a4a38', mottle: 0.35, grain: 0.1, layout: 'grid', tiles: 1, seamStyle: 'weld', seamWidth: 1.5, seamColor: '#a8957a', wear: 0, dirt: 0.15, scuffs: 0.2, scuffColor: '#3a3028', scratches: 0.12, sheen: 0.4 } },
      { name: 'Coin PVC garage tiles', group: 'PVC', values: { pattern: 'coin', count: 12, size: 0.45, relief: 0.4, soft: 0.35, base: '#6c7076', layout: 'grid', tiles: 3, seamWidth: 2.5, tileVar: 0.3, mottle: 0.15, dirt: 0.35, scuffs: 0.25, scuffColor: '#262626', sheen: 0.45 } },
      { name: 'Toon rubber studs', group: 'Stylized', values: { pattern: 'coin', count: 6, size: 0.6, soft: 0.55, relief: 0.8, shading: 1, base: '#d8503a', studSame: false, studColor: '#f07a54', mottle: 0, grain: 0, wear: 0, dirt: 0, scuffs: 0, scratches: 0, sheen: 0 } },
      { name: 'Sci-fi deck grip', group: 'Stylized', values: { pattern: 'square', rotation: '45', count: 12, size: 0.45, corner: 0.15, soft: 0.15, base: '#36404c', layout: 'grid', tiles: 2, seamWidth: 4, tileVar: 0.15, mottle: 0.2, wear: 0.4, dirt: 0.3, scuffs: 0.1 } },
      { name: 'Candy puzzle mats', group: 'Stylized', values: { pattern: 'plain', base: '#f29ab8', layout: 'puzzle', tiles: 2, teeth: 3, toothDepth: 0.1, seamWidth: 3, checker: true, color2: '#7ad0c8', tileVar: 0, mottle: 0, grain: 0.1, wear: 0, dirt: 0, scuffs: 0, scratches: 0, sheen: 0.2 } },
    ],
    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height), k = Math.min(W, H) / 512, seed = p.seed | 0, ar = H / W;
      const per = (f) => [f, Math.max(1, Math.round(f * ar))];
      const fb = (u, v, f, oct, s) => { const [a, b] = per(f); return U.fractal('perlin', u * a, v * b, a, b, oct, 0.5, 'fbm', seed + s); };
      const pat = makePattern(p, W, H), tl = makeTiles(p, W, H);
      const plain = p.pattern === 'plain', raised = RAISED.includes(p.pattern), relief = plain ? 0 : p.relief;
      const base = U.hex(p.base), alt = U.hex(p.color2), studC = U.hex(p.studColor), dirtC = U.hex(p.dirtColor), scuffC = U.hex(p.scuffColor), weldC = U.hex(p.seamColor);
      const fl = [U.hex(p.fleck1), U.hex(p.fleck2), U.hex(p.fleck3)], nfc = clamp(p.fleckCount | 0, 1, 3);
      const studOwn = raised && !p.studSame;
      // streak noise along the diagonals (X = (u+v)A, Y = (u-v)B stays periodic for integer A, B)
      const streak = (u, v, A, B, dir, s, oct) => {
        const X = (u + v * dir) * A, Y = (u - v * dir) * B;
        return U.fractal('perlin', X, Y, A, B, oct, 0.5, 'fbm', seed + s);
      };
      // low-frequency fields (sampled at reduced resolution)
      const mottleF = p.mottle > 0 ? lowField(W, H, (u, v) => fb(u, v, p.mottleScale, 4, 1)) : null;
      const sheenF = p.sheen > 0 ? lowField(W, H, (u, v) => fb(u, v, 3, 3, 2)) : null;
      const dirtF = p.dirt > 0 ? lowField(W, H, (u, v) => fb(u, v, 4, 4, 3)) : null;
      const wearF = p.wear > 0 ? lowField(W, H, (u, v) => fb(u, v, 6, 3, 4)) : null;
      const scuffTh = 0.78 - p.scuffs * 0.18;
      const scuffF = p.scuffs > 0 ? lowField(W, H, (u, v) => Math.max(smoothstep(scuffTh, scuffTh + 0.12, streak(u, v, 2, 14, 1, 21, 2)), smoothstep(scuffTh, scuffTh + 0.12, streak(u, v, 3, 12, -1, 22, 2))) * smoothstep(0.35, 0.65, fb(u, v, 3, 3, 5)), 2) : null;
      const mask2F = p.scratches > 0 ? lowField(W, H, (u, v) => fb(u, v, 5, 2, 6)) : null;
      // flecks: jittered grid cells, two offset layers
      const fcell = Math.max(1, p.fleckSize * 2.6 * k), fcx = Math.max(1, Math.round(W / fcell)), fcy = Math.max(1, Math.round(H / fcell));
      const fpx = W / fcx, fpy = H / fcy, fprob = p.flecks * 0.8;
      let fR = 0, fG = 0, fB = 0;
      const fleckAt = (u, v, L) => {
        const gx = u * fcx + L * 0.5, gy = v * fcy + L * 0.5, i0 = Math.floor(gx), j0 = Math.floor(gy);
        const i = U.mod(i0, fcx), j = U.mod(j0, fcy), s = seed + 900 + L * 37;
        if (hash(i, j, s) >= fprob) return 0;
        const r = 0.16 + 0.2 * hash(i, j, s + 1), cx = r + (1 - 2 * r) * hash(i, j, s + 2), cy = r + (1 - 2 * r) * hash(i, j, s + 3);
        const dx = (gx - i0 - cx) * fpx, dy = (gy - j0 - cy) * fpy, rr = r * Math.min(fpx, fpy);
        const ha = hash(i, j, s + 4), c = Math.cos(ha * 6.283), sn = Math.sin(ha * 6.283), el = 0.7 + 0.6 * hash(i, j, s + 5);
        const a = Math.abs(dx * c + dy * sn) * el, b = Math.abs(dy * c - dx * sn) / el;
        const dist = lerp(Math.hypot(a, b), Math.max(a, b), 0.45); // chunky granule shape
        const cov = 1 - smoothstep(rr - 0.6, rr + 0.6, dist);
        if (cov <= 0) return 0;
        const col = fl[Math.min(nfc - 1, Math.floor(hash(i, j, s + 6) * nfc))], tone = 0.88 + 0.24 * hash(i, j, s + 7);
        fR = col[0] * tone; fG = col[1] * tone; fB = col[2] * tone;
        return cov;
      };
      const [gF, gFy] = per(Math.max(8, Math.round(W / (3 * Math.max(1, k))))); // fine grain, ~3 px @ 512 cells
      const e = 1.5 * Math.max(1, k), sw = (p.seamWidth * k) / 2, aoR = Math.max(1.5, 6 * k);
      const isTiled = p.layout !== 'none', weld = p.layout === 'grid' && p.seamStyle === 'weld';

      // relief pass: profile, edge distance and element id per pixel
      const shade = !plain && relief > 0 && p.shading > 0, eo = Math.max(1, Math.round(e));
      let PB = null, DB = null, IB = null;
      if (!plain) {
        PB = new Float32Array(W * H); DB = new Float32Array(W * H); IB = new Float32Array(W * H);
        for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) { PB[i] = pat.fn((x + 0.5) / W, (y + 0.5) / H); DB[i] = pat.d; IB[i] = pat.id; }
      }
      U.pixels(ctx, W, H, (x, y, o) => {
        const u = (x + 0.5) / W, v = (y + 0.5) / H;
        // tiles
        tl.fn(u, v);
        const seamD = tl.seam, tid = tl.id, talt = tl.alt;
        // relief
        let prof = 1, d = 1e3, eid = 0.5, slope = 0;
        if (!plain) {
          const i = y * W + x;
          prof = PB[i]; d = DB[i]; eid = IB[i];
          // baked light from the top left: compare with the (wrapped) sample toward the light
          if (shade) slope = prof - PB[U.mod(y - eo, H) * W + U.mod(x - eo, W)];
        }
        // base color
        let br = base[0], bg = base[1], bb = base[2];
        if (isTiled && p.checker && talt) { br = alt[0]; bg = alt[1]; bb = alt[2]; }
        let r = br, g = bg, b = bb;
        if (studOwn) { r = lerp(br, studC[0], prof); g = lerp(bg, studC[1], prof); b = lerp(bb, studC[2], prof); }
        let f = 1;
        if (isTiled && p.tileVar > 0) f *= 1 + (tid - 0.5) * p.tileVar * 0.35;
        if (mottleF) f *= 1 + (mottleF(u, v) - 0.5) * p.mottle * 0.7;
        let gn = 0;
        if (p.grain > 0) { gn = (hash(x, y, seed + 11) - 0.5) * 0.7 + U.value(u * gF, v * gFy, gF, gFy, seed + 12) * 0.5; f *= 1 + gn * p.grain * 0.16; }
        r *= f; g *= f; b *= f;
        // EPDM flecks (embedded in the material, so they also cover the studs)
        if (p.flecks > 0) {
          for (let L = 0; L < 2; L++) {
            const c = fleckAt(u, v, L);
            if (c > 0) { const ff = f; r = lerp(r, fR * ff, c); g = lerp(g, fG * ff, c); b = lerp(b, fB * ff, c); }
          }
        }
        // cavity: around stud bases / between ribs / crater bottoms, and along seams
        let cav = 0;
        if (relief > 0) {
          if (p.pattern === 'hammered') cav = (1 - prof) * 0.8;
          else cav = (1 - prof) * Math.exp(Math.min(0, d) / aoR) * 0.9 + (1 - prof) * 0.25;
          cav *= relief;
        }
        let seamF = 0, seamNear = 0;
        if (isTiled) {
          seamF = 1 - smoothstep(sw - 0.6, sw + 0.6, seamD);
          seamNear = 1 - smoothstep(sw, sw + aoR, seamD);
          if (!weld) cav = Math.max(cav, seamNear * 0.8);
        }
        // worn tops: lighter, smoother
        if (p.wear > 0 && !plain) {
          const w = clamp(prof * (raised ? 1 : 0.6) * (0.4 + wearF(u, v) * 1.1) * (0.7 + 0.6 * eid)) * p.wear;
          const l = (r + g + b) / 3, lift = w * 0.35;
          r = lerp(r, l * 1.25 + 26, lift); g = lerp(g, l * 1.25 + 26, lift); b = lerp(b, l * 1.25 + 26, lift);
        } else if (p.wear > 0) {
          const w = smoothstep(0.55, 0.9, wearF(u, v)) * p.wear * 0.2;
          r = lerp(r, r * 1.2 + 15, w); g = lerp(g, g * 1.2 + 15, w); b = lerp(b, b * 1.2 + 15, w);
        }
        // baked bevel light + ambient occlusion
        if (slope !== 0) { const s = clamp(slope * 2.2, -1, 1) * p.shading * Math.min(1, relief * 1.6) * 0.45; const add = s > 0 ? s * 60 : 0; f = 1 + s; r = r * f + add; g = g * f + add; b = b * f + add; }
        const ao = 1 - cav * 0.35; r *= ao; g *= ao; b *= ao;
        // dirt: settles in cavities, plus patches
        if (p.dirt > 0) {
          const dn = dirtF(u, v);
          const dd = clamp(cav * (0.5 + dn) * 1.2 * p.dirt + smoothstep(0.55, 0.85, dn) * p.dirt * 0.35);
          r = lerp(r, dirtC[0], dd * 0.85); g = lerp(g, dirtC[1], dd * 0.85); b = lerp(b, dirtC[2], dd * 0.85);
        }
        // scuffs: smeared marks along both diagonals, on exposed surfaces
        let scr = 0;
        if (p.scuffs > 0) {
          const sc = scuffF(u, v) * (0.4 + 0.6 * prof) * Math.min(1, p.scuffs * 1.5);
          r = lerp(r, scuffC[0], sc * 0.6); g = lerp(g, scuffC[1], sc * 0.6); b = lerp(b, scuffC[2], sc * 0.6);
        }
        if (p.scratches > 0) {
          // two scratch directions in separate patches (no crossing 'x' marks)
          const m = mask2F(u, v), th = 0.7 - p.scratches * 0.25, a1 = smoothstep(th, th + 0.08, m), a2 = smoothstep(th, th + 0.08, 1 - m);
          if (a1 > 0 || a2 > 0) {
            const wdt = 0.012 + 0.004 * p.scratches, line = (n) => 1 - smoothstep(wdt * 0.4, wdt, Math.abs(n - 0.5));
            scr = (a1 > 0 ? line(streak(u, v, 2, 60, 1, 31, 2)) * a1 : line(streak(u, v, 3, 50, -1, 32, 2)) * a2) * (0.5 + 0.5 * prof);
            const l = (r + g + b) / 3, tgt = l < 110 ? 1.6 : 0.82, add = l < 110 ? 25 : 0;
            r = lerp(r, r * tgt + add, scr * 0.7); g = lerp(g, g * tgt + add, scr * 0.7); b = lerp(b, b * tgt + add, scr * 0.7);
          }
        }
        if (sheenF) { const s = (sheenF(u, v) - 0.5) * p.sheen * 0.35; r *= 1 + s; g *= 1 + s; b *= 1 + s; }
        // seams
        if (seamF > 0) {
          if (weld) {
            const t = clamp(seamD / Math.max(0.5, sw)), bead = Math.sqrt(1 - t * t) * 0.25 + 0.85;
            r = lerp(r, weldC[0] * bead, seamF); g = lerp(g, weldC[1] * bead, seamF); b = lerp(b, weldC[2] * bead, seamF);
          } else { const sf = 1 - seamF * 0.8; r *= sf; g *= sf; b *= sf; }
        }
        if (height) {
          let h = 0.35 + relief * 0.5 * prof + gn * p.grain * 0.03 - scr * 0.04;
          if (plain) h = 0.6 + gn * p.grain * 0.03 - scr * 0.04;
          if (isTiled) {
            if (weld) { const t = clamp(seamD / Math.max(0.5, sw)); h = lerp(h, 0.62 + Math.sqrt(1 - t * t) * 0.08, seamF); }
            else h = lerp(h, 0.05, seamF) - seamNear * 0.04;
          }
          o[0] = o[1] = o[2] = clamp(h) * 255; return;
        }
        o[0] = r; o[1] = g; o[2] = b;
      });
    },
  });
})();
