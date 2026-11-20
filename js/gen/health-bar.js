/* Health bar: linear HUD bar. Track, fill, border with round / chamfered / square ends, slant,
   segments, shine, glow, plus noise (color + distortion) and grunge (wear, dirt, edge wear,
   scratches) for rough, worn UI. The bar runs along the long side of the texture (vertical bars:
   pick a tall aspect). Separate layer export: background, fill (at 100 %), border, progress map.
   Units are px @ 64 px short side. */
(function () {
  'use strict';
  const U = window.UGTG;

  function geometry(W, H, p) {
    const S = Math.min(W, H), k = S / 64, m = p.margin * k, horiz = W >= H;
    const L = (horiz ? W : H) - 2 * m, T = (horiz ? H : W) - 2 * m;
    const sk = p.skew * T, Le = Math.max(1, L - Math.abs(sk));
    const off = (v) => (sk >= 0 ? sk * (1 - v / T) : -sk * (v / T));
    // bar space (u along from the fill start side, v across from the top / left) -> canvas
    const flip = p.dir === 'end';
    const map = (u, v) => {
      const uu = flip ? Le - u : u;
      return horiz ? [m + uu + off(v), m + v] : [m + v, H - m - uu - off(v)];
    };
    const unmap = (x, y) => {
      const v = horiz ? y - m : x - m;
      const uu = horiz ? x - m - off(v) : H - m - y - off(v);
      return flip ? Le - uu : uu;
    };
    const r = p.radius * T;

    function path(c, cell, d) {
      const u0 = cell.s0 + d, u1 = cell.s1 - d, v0 = d, v1 = T - d;
      if (u1 - u0 <= 0.1 || v1 - v0 <= 0.1) return;
      let pts;
      if (p.corner === 'chamfer' && r > 0) {
        const q = Math.min(Math.max(0, r - d * 0.414), (u1 - u0) / 2, (v1 - v0) / 2);
        pts = [[u0 + q, v0], [u1 - q, v0], [u1, v0 + q], [u1, v1 - q], [u1 - q, v1], [u0 + q, v1], [u0, v1 - q], [u0, v0 + q]];
        U.polyPath(c, pts.map(([a, b]) => map(a, b)), 0);
      } else {
        pts = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
        U.polyPath(c, pts.map(([a, b]) => map(a, b)), p.corner === 'round' ? Math.max(0, r - d) : 0);
      }
    }
    function region(c, s0, s1) {
      const a = s0 <= 0 ? -T * 3 : s0, b = s1 >= Le ? Le + T * 3 : s1;
      U.polyPath(c, [[a, -T * 3], [b, -T * 3], [b, T * 4], [a, T * 4]].map(([x, y]) => map(x, y)), 0);
    }
    // segments along the bar
    const N = Math.max(1, p.segments | 0), gap = N > 1 ? p.segGap * k : 0, sl = (Le - (N - 1) * gap) / N;
    const segs = [];
    for (let i = 0; i < N; i++) segs.push({ s0: i * (sl + gap), s1: i * (sl + gap) + sl });
    const cells = N > 1 && p.segMode === 'cells' ? segs : [{ s0: 0, s1: Le }];

    return {
      k, len: Le, dir: p.dir === 'center' ? 'center' : 'start', cells, segs, path, region,
      t: (x, y) => {
        const u = unmap(x, y);
        return p.dir === 'center' ? Math.abs(u - Le / 2) / (Le / 2) : u / Le;
      },
      along: (c, c1, c2) => {
        const [x0, y0] = map(0, T / 2), [x1, y1] = map(Le, T / 2), g = c.createLinearGradient(x0, y0, x1, y1);
        if (p.dir === 'center') { g.addColorStop(0, c2); g.addColorStop(0.5, c1); g.addColorStop(1, c2); }
        else { g.addColorStop(0, c1); g.addColorStop(1, c2); }
        return g;
      },
      across: (c, stops) => {
        const g = horiz ? c.createLinearGradient(0, m, 0, m + T) : c.createLinearGradient(m, 0, m + T, 0);
        for (const [t, col] of stops) g.addColorStop(t, col);
        return g;
      },
    };
  }


  U.register({
    id: 'healthbar',
    name: 'Linear Bar',
    desc: 'Linear HUD bars with border, fill, segments, noise and grunge, exportable as separate layers',
    uses: ['Health, stamina and progress bars for game HUDs; export track, fill, border and progress map separately and drive the fill in the engine.', 'Loading bars and stat meters in menus and app interfaces.'],
    tags: ['UI', 'Shooter'],
    aspect: '4:1',
    bg: 'gray',
    icon: U.icon('<rect x="2.5" y="9" width="19" height="6" rx="1.5"/><rect x="4.5" y="11" width="10" height="2" rx=".5" fill="currentColor"/>'),
    exportLayers: U.barLayers,
    params: [
      { type: 'section', label: 'Shape' },
      { key: 'value', label: 'Fill amount (preview)', type: 'range', min: 0, max: 1, step: 0.005, default: 0.7, tip: 'Previews the bar at this fill. Combined exports use it too; a separate fill layer is exported at 100 %' },
      { key: 'dir', label: 'Fills from', type: 'select', default: 'start', options: [['start', 'Left / bottom'], ['end', 'Right / top'], ['center', 'Center outward']], tip: 'The bar runs along the long side; use a tall aspect for vertical bars' },
      { key: 'corner', label: 'Corners', type: 'select', default: 'round', options: [['round', 'Rounded'], ['chamfer', 'Chamfered'], ['square', 'Square']] },
      { key: 'radius', label: 'Roundness', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.2, show: (p) => p.corner !== 'square', tip: 'Fraction of the bar thickness (0.5 = pill)' },
      { key: 'skew', label: 'Slant', type: 'range', min: -1, max: 1, step: 0.01, default: 0, tip: 'Leans the bar (parallelogram)' },
      { key: 'margin', label: 'Margin', type: 'range', min: 0, max: 24, step: 0.25, default: 6, tip: 'Space around the bar for shadow, glow and distortion (px @ 64)' },
      ...U.barParams({ unit: 'px @ 64' }),
    ],
    presets: [
      { name: 'Flat green', group: 'Simple', values: { fillMode: 'solid', fillColor: '#4fd16a', glowColor: '#4fd16a', shine: 0, shade: 0, radius: 0.12, borderW: 0, trackColor: '#16251a', trackAlpha: 0.7, pad: 0, shadowAlpha: 0  } },
      { name: 'Pill', group: 'Simple', values: { radius: 0.5, fillColor: '#ff5a6e', fillColor2: '#c42446', borderW: 2.5, borderColor: '#ffffff', trackColor: '#2a1218', pad: 2.5, shine: 0.35, shadowAlpha: 0.25  } },
      { name: 'Thin outline', group: 'Simple', values: { corner: 'square', fillMode: 'solid', fillColor: '#f2f2f2', borderW: 1.5, borderColor: '#f2f2f2', trackAlpha: 0, pad: 3, shine: 0, shade: 0, shadowAlpha: 0  } },
      { name: 'Health by amount', group: 'Simple', values: { value: 0.35, fillMode: 'value', fillColor: '#53d35c', fillColor2: '#e0322a', radius: 0.15, shine: 0.2, shade: 0.15  } },
      { name: 'Tactical (Tarkov-style)', group: 'Realistic', values: { corner: 'square', fillMode: 'solid', fillColor: '#b9b29a', borderW: 1, borderColor: '#5d5c55', borderAlpha: 0.9, trackColor: '#16171a', trackAlpha: 0.75, pad: 2, shine: 0, shade: 0, shadowAlpha: 0, brightNoise: 0.08, noiseScale: 18, noiseType: 'value', grunge: 0.12, grungeType: 'speckle', grungeScale: 14, grungeOn: 'fill'  } },
      { name: 'Military stencil', group: 'Realistic', values: { corner: 'chamfer', radius: 0.35, fillColor: '#7d8b4a', fillColor2: '#4c5629', borderW: 2.5, borderColor: '#191b12', trackColor: '#2a2d21', trackAlpha: 0.9, shine: 0.1, shade: 0.3, colorNoise: 0.35, noiseColor: '#3a3a26', noiseScale: 2.5, grunge: 0.3, grungeType: 'chipped', grungeScale: 3, edgeWear: 0.5, scratches: 0.3, seed: 12  } },
      { name: 'Rusted metal', group: 'Realistic', values: { corner: 'square', fillColor: '#b8442a', fillColor2: '#6e1e12', borderW: 3, borderColor: '#3b2a20', trackColor: '#2a1d16', trackAlpha: 1, pad: 2, shine: 0.12, shade: 0.35, colorNoise: 0.55, noiseColor: '#7a4a22', noiseScale: 3, noiseDetail: 4, brightNoise: 0.15, distort: 0.12, distortScale: 3, grunge: 0.25, grungeType: 'blotchy', grungeScale: 4, edgeWear: 0.6, dirt: 0.5, dirtColor: '#2b1a0e', scratches: 0.25, seed: 33  } },
      { name: 'Painted wood', group: 'Realistic', values: { corner: 'round', radius: 0.12, fillColor: '#c8402f', fillColor2: '#8c2a1d', borderW: 4, borderColor: '#4a301b', trackColor: '#5c3b20', trackAlpha: 1, pad: 2.5, shine: 0.15, shade: 0.25, brightNoise: 0.18, noiseType: 'value', noiseScale: 3, grunge: 0.32, grungeType: 'streaks', grungeScale: 3, edgeWear: 0.45, dirt: 0.25, seed: 5  } },
      { name: 'Worn grunge', group: 'Stylized', values: { corner: 'square', fillColor: '#d23a2f', fillColor2: '#7f1610', borderW: 3, borderColor: '#111111', trackColor: '#191919', trackAlpha: 0.95, pad: 2, shine: 0.1, shade: 0.3, colorNoise: 0.3, noiseColor: '#3a0d0a', distort: 0.25, distortScale: 6, grunge: 0.35, grungeType: 'chipped', grungeScale: 3.5, edgeWear: 0.7, edgeWidth: 3, dirt: 0.35, scratches: 0.4, seed: 21  } },
      { name: 'Hand-painted brush', group: 'Stylized', values: { corner: 'round', radius: 0.4, fillMode: 'solid', fillColor: '#e2412e', borderW: 3.5, borderColor: '#1a1210', trackColor: '#2c201c', pad: 1.5, shine: 0, shade: 0, distort: 0.55, distortScale: 2.5, grunge: 0.2, grungeType: 'streaks', grungeScale: 2.5, edgeWear: 0.4, shadowAlpha: 0, seed: 8  } },
      { name: 'Horror blood', group: 'Stylized', values: { corner: 'square', fillColor: '#8e0b0b', fillColor2: '#3a0202', borderW: 0, trackColor: '#0d0b0b', trackAlpha: 0.8, pad: 0, shine: 0, shade: 0.4, colorNoise: 0.5, noiseColor: '#230101', noiseScale: 2, distort: 0.6, distortScale: 3.5, grunge: 0.28, grungeType: 'blotchy', grungeScale: 2.5, edgeWear: 0.8, edgeWidth: 6, shadowAlpha: 0, seed: 66  } },
      { name: 'Fantasy gold frame', group: 'Stylized', values: { corner: 'chamfer', radius: 0.45, fillColor: '#e0342a', fillColor2: '#7b0d12', borderW: 4, borderColor: '#c49a3c', trackColor: '#24120f', trackAlpha: 1, pad: 2, shine: 0.4, shade: 0.35, splitFrame: true, glow: 0.25, glowSize: 6, glowColor: '#ff5040', shadowAlpha: 0.5, shadowBlur: 4, shadowY: 2  } },
      { name: 'Retro segments', group: 'Stylized', values: { corner: 'square', fillMode: 'solid', fillColor: '#ffd23f', segments: 10, segGap: 2.5, segMode: 'cells', borderW: 2, borderColor: '#101010', trackColor: '#3a3220', trackAlpha: 1, pad: 2, shine: 0, shade: 0, shadowAlpha: 0.6, shadowBlur: 0, shadowY: 3  } },
      { name: 'Stamina slant', group: 'Game-inspired', values: { corner: 'square', skew: 0.6, fillMode: 'along', fillColor: '#f7d64a', fillColor2: '#f58a1f', borderW: 1.5, borderColor: '#141414', trackColor: '#141414', trackAlpha: 0.7, pad: 1.5, shine: 0.3, shade: 0.1  } },
      { name: 'Boss bar', group: 'Game-inspired', values: { corner: 'chamfer', radius: 0.5, fillColor: '#c21d1d', fillColor2: '#5d0606', borderW: 3, borderColor: '#d8c9a3', trackColor: '#120808', trackAlpha: 1, pad: 2.5, shine: 0.3, shade: 0.4, glow: 0.3, glowSize: 5, glowColor: '#ff2a2a', grunge: 0.08, grungeType: 'speckle', grungeScale: 10  } },
      { name: 'Shield cells', group: 'Game-inspired', values: { corner: 'chamfer', radius: 0.3, skew: 0.35, fillMode: 'across', fillColor: '#5fd8ff', fillColor2: '#2a6fd8', segments: 5, segGap: 3, segMode: 'cells', borderW: 1.5, borderColor: '#a8ecff', borderAlpha: 0.6, trackColor: '#0a1a2a', trackAlpha: 0.6, pad: 2, shine: 0.35, glow: 0.4, glowSize: 7, glowColor: '#3cc8ff', shadowAlpha: 0  } },
      { name: 'Survival ammo ticks', group: 'Game-inspired', values: { corner: 'square', fillMode: 'solid', fillColor: '#e8e2cf', segments: 24, segGap: 1.5, segMode: 'fill', borderW: 1, borderColor: '#8a8577', trackColor: '#000000', trackAlpha: 0.45, pad: 2, shine: 0, shade: 0, shadowAlpha: 0, grunge: 0.1, grungeType: 'speckle', grungeScale: 14  } },
      { name: 'Neon HUD', group: 'Sci-fi', values: { corner: 'chamfer', radius: 0.5, fillMode: 'along', fillColor: '#3cf2ff', fillColor2: '#7a5cff', borderW: 1.5, borderColor: '#3cf2ff', borderAlpha: 0.8, trackColor: '#03141a', trackAlpha: 0.55, pad: 2.5, shine: 0.25, shade: 0, glow: 0.7, glowSize: 10, glowColor: '#26d9ff', shadowAlpha: 0, margin: 10  } },
      { name: 'Energy segments', group: 'Sci-fi', values: { corner: 'square', skew: -0.5, fillMode: 'solid', fillColor: '#7dff8a', segments: 16, segGap: 2, segMode: 'fill', borderW: 1, borderColor: '#7dff8a', borderAlpha: 0.5, trackColor: '#06180a', trackAlpha: 0.6, pad: 2, shine: 0, shade: 0, glow: 0.6, glowSize: 6, glowColor: '#5aff6a', shadowAlpha: 0, margin: 8  } },
      { name: 'Glitched terminal', group: 'Sci-fi', values: { corner: 'square', fillMode: 'solid', fillColor: '#ff3b4a', borderW: 1.5, borderColor: '#ff3b4a', trackColor: '#16050a', trackAlpha: 0.7, pad: 2, shine: 0, shade: 0, glow: 0.5, glowSize: 6, glowColor: '#ff2030', noiseType: 'value', brightNoise: 0.35, noiseScale: 10, distort: 0.18, distortScale: 8, grunge: 0.25, grungeType: 'streaks', grungeScale: 6, shadowAlpha: 0, margin: 10  } },
      { name: 'Center drain (mana)', group: 'Sci-fi', values: { dir: 'center', radius: 0.5, fillMode: 'along', fillColor: '#9fd7ff', fillColor2: '#3046d8', borderW: 2, borderColor: '#0b1030', trackColor: '#0b1030', pad: 2, shine: 0.35, glow: 0.4, glowSize: 7, glowColor: '#4a7dff', margin: 8  } },
      // Post-apocalyptic: rust, scrap, dirt and wear
      { name: 'Scavenger health (rusted)', group: 'Post-apocalyptic', values: { corner: 'chamfer', radius: 0.3, fillColor: '#b8432a', fillColor2: '#6a1e10', borderW: 3, borderColor: '#2a1c12', trackColor: '#1c1612', trackAlpha: 0.95, shine: 0.05, shade: 0.35, colorNoise: 0.45, noiseColor: '#5a3a1a', noiseScale: 4, brightNoise: 0.15, distort: 0.06, grunge: 0.3, grungeType: 'chipped', grungeScale: 6, edgeWear: 0.6, dirt: 0.4, dirtColor: '#2a1a0c', scratches: 0.4, seed: 31 } },
      { name: 'Radiation meter', group: 'Post-apocalyptic', values: { corner: 'square', fillColor: '#c8e03a', fillColor2: '#5a7a10', segments: 10, segGap: 2, borderW: 2, borderColor: '#1a1c10', trackColor: '#14160c', trackAlpha: 0.95, colorNoise: 0.3, noiseColor: '#3a4a10', grunge: 0.25, grungeType: 'speckle', grungeScale: 10, dirt: 0.35, scratches: 0.3, glow: 0.3, glowColor: '#b4ff3a', seed: 5 } },
      { name: 'Duct-taped stamina', group: 'Post-apocalyptic', values: { corner: 'square', fillColor: '#d8c89a', fillColor2: '#9a8a5a', borderW: 2, borderColor: '#3a3a36', trackColor: '#22221e', distort: 0.15, distortScale: 6, grunge: 0.3, grungeType: 'streaks', grungeScale: 6, edgeWear: 0.4, dirt: 0.5, dirtColor: '#3a2a1a', scratches: 0.2, seed: 17 } },
    ],
    render(ctx, W, H, p, opts) {
      U.barRender(ctx, W, H, p, opts, geometry(W, H, p));
    },
  });
})();
