/* Radial health bar: ring / arc / pie gauge with the same track, fill, border, segments, noise and
   grunge as the linear Health Bar, plus start angle, sweep (full ring or gauge arc), direction,
   thickness, rounded ends and a center disc. Separate layer export: background, fill (at 100 %),
   border, and a progress map whose gray value is the angle along the fill (for radial alpha-clip fills
   in the engine). Units are px @ 256 px short side. */
(function () {
  'use strict';
  const U = window.UGTG;
  const RAD = Math.PI / 180;

  function geometry(W, H, p) {
    const S = Math.min(W, H), k = S / 256, cx = W / 2, cy = H / 2;
    const R = Math.max(2, S / 2 - p.margin * k), Ri = R * (1 - p.thickness);
    const sweep = U.clamp(p.sweep, 1, 360), full = sweep >= 360;
    const sign = p.dir === 'ccw' ? -1 : 1;
    const th0 = (p.start - 90) * RAD;
    const ang = (s) => th0 + sign * s * RAD; // progress (deg) -> canvas angle

    function arcPts(r, a0, a1, out) {
      const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (1.5 * RAD)));
      for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      return out;
    }
    function path(c, cell, d) {
      const ro = R - d, ri = Ri > 0.5 ? Ri + d : 0;
      if (ro - ri <= 0.3) return;
      if (cell.full) {
        c.moveTo(cx + ro, cy); c.arc(cx, cy, ro, 0, U.TAU);
        if (ri > 0.3) { c.moveTo(cx + ri, cy); c.arc(cx, cy, ri, U.TAU, 0, true); }
        return;
      }
      const a0 = ang(cell.s0), a1 = ang(cell.s1), mid = (a0 + a1) / 2;
      // edges inset parallel: the angular offset depends on the radius
      const io = Math.min(Math.abs(a1 - a0) / 2, d / ro) * sign;
      const pts = arcPts(ro, a0 + io, a1 - io, []);
      if (ri > 0.3) {
        const ii = Math.min(Math.abs(a1 - a0) / 2, d / ri);
        const b0 = a0 + ii * sign, b1 = a1 - ii * sign;
        if ((b1 - b0) * sign > 0) arcPts(ri, b1, b0, pts); else pts.push([cx + Math.cos(mid) * ri, cy + Math.sin(mid) * ri]);
      } else {
        // pie: the apex moves out so the side edges stay parallel to the cell's edges
        const half = Math.abs(a1 - a0) / 2, off = half < Math.PI / 2 && half > 0 ? d / Math.sin(half) : d;
        pts.push([cx + Math.cos(mid) * off, cy + Math.sin(mid) * off]);
      }
      U.polyPath(c, pts, p.roundness * (ro - ri) * 0.5);
    }
    function region(c, s0, s1) {
      if (s1 - s0 >= 359.99) { c.rect(0, 0, W, H); return; }
      const a0 = ang(s0), a1 = ang(s1), pts = [[cx, cy]];
      arcPts(S * 2, a0, a1, pts);
      U.polyPath(c, pts, 0);
    }
    const N = Math.max(1, p.segments | 0), gap = N > 1 ? p.segGap : 0;
    const sl = (sweep - (full ? N : N - 1) * gap) / N, segs = [];
    for (let i = 0; i < N; i++) segs.push({ s0: i * (sl + gap) + (full ? gap / 2 : 0), s1: i * (sl + gap) + sl + (full ? gap / 2 : 0) });
    const cells = N > 1 && p.segMode === 'cells' ? segs : [{ s0: 0, s1: sweep, full }];

    return {
      k, len: sweep, dir: p.dir === 'center' ? 'center' : 'start', cells, segs, path, region,
      t: (x, y) => {
        let a = (Math.atan2(y - cy, x - cx) - th0) * sign;
        a = U.mod(a, U.TAU) / RAD;
        if (a > sweep) a = a - sweep > 360 - a ? 0 : sweep; // outside a gauge arc: snap to the nearer end
        return p.dir === 'center' ? Math.abs(a - sweep / 2) / (sweep / 2) : a / sweep;
      },
      along: (c, c1, c2) => {
        if (!c.createConicGradient) return c1;
        // conic gradients always run clockwise from their start angle
        const g = c.createConicGradient(sign > 0 ? th0 : th0 - sweep * RAD, cx, cy), f = sweep / 360;
        const stops = p.dir === 'center' ? [[0, c2], [0.5, c1], [1, c2]] : [[0, c1], [1, c2]];
        for (const [t, col] of stops) g.addColorStop(sign > 0 ? t * f : (1 - t) * f, col);
        if (f < 1) g.addColorStop(1, sign > 0 ? stops[stops.length - 1][1] : stops[0][1]);
        return g;
      },
      across: (c, stops) => {
        const g = c.createRadialGradient(cx, cy, Math.max(0, Ri), cx, cy, R);
        for (const [t, col] of stops) g.addColorStop(1 - t, col);
        return g;
      },
      extraBack: (c, q) => {
        if (!(q.centerAlpha > 0) || Ri <= 1) return;
        const r = Ri - q.centerGap * k;
        if (r <= 0) return;
        c.beginPath(); c.arc(cx, cy, r, 0, U.TAU);
        c.fillStyle = U.rgba(q.centerColor, q.centerAlpha);
        c.fill();
      },
    };
  }

  U.register({
    id: 'radialbar',
    name: 'Radial Bar',
    desc: 'Ring, arc and pie gauges: border, fill, segments, noise distortion and grunge, separate layer export',
    tags: ['UI', 'Shooter'],
    aspect: '1:1',
    bg: 'gray',
    icon: U.icon('<path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5"/><path d="M12 7a5 5 0 1 1-5 5" opacity=".45"/>'),
    exportLayers: U.barLayers,
    params: [
      { type: 'section', label: 'Shape' },
      { key: 'value', label: 'Fill amount (preview)', type: 'range', min: 0, max: 1, step: 0.005, default: 0.7, tip: 'Previews the bar at this fill. Combined exports use it too; a separate fill layer is exported at 100 %' },
      { key: 'start', label: 'Start angle', type: 'range', min: -180, max: 180, step: 1, default: 0, tip: '0 = top, 90 = right (degrees, clockwise)' },
      { key: 'sweep', label: 'Sweep', type: 'range', min: 10, max: 360, step: 1, default: 360, tip: '360 = full ring, less = gauge arc' },
      { key: 'dir', label: 'Direction', type: 'select', default: 'cw', options: [['cw', 'Clockwise'], ['ccw', 'Counter-clockwise'], ['center', 'Center outward']] },
      { key: 'thickness', label: 'Thickness', type: 'range', min: 0.03, max: 1, step: 0.005, default: 0.2, tip: 'Fraction of the radius (1 = pie)' },
      { key: 'roundness', label: 'Roundness', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Rounds the ends of arcs and segments' },
      { key: 'margin', label: 'Margin', type: 'range', min: 0, max: 60, step: 0.5, default: 12, tip: 'Space around the ring for shadow, glow and distortion (px @ 256)' },
      { key: 'centerAlpha', label: 'Center disc', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Fills the hole (e.g. behind a portrait or icon); part of the background layer' },
      { key: 'centerColor', label: 'Center color', type: 'color', default: '#15171a', show: (p) => p.centerAlpha > 0 },
      { key: 'centerGap', label: 'Center gap', type: 'range', min: 0, max: 30, step: 0.5, default: 4, show: (p) => p.centerAlpha > 0, tip: 'px @ 256' },
      ...U.barParams({ unit: 'px @ 256', border: 3, gap: 4, gapMax: 45, gapUnit: 'degrees' }),
    ],
    presets: [
      { name: 'Simple ring', group: 'Simple', values: { fillMode: 'solid', fillColor: '#4fd16a', glowColor: '#4fd16a', borderW: 0, trackColor: '#000000', trackAlpha: 0.35, pad: 0, shine: 0, shade: 0, shadowAlpha: 0, thickness: 0.14 } },
      { name: 'Rounded arc', group: 'Simple', values: { sweep: 300, start: -150, thickness: 0.2, roundness: 1, fillEnd: 'shaped', fillColor: '#ff5a6e', fillColor2: '#c42446', borderW: 2.5, borderColor: '#ffffff', trackColor: '#2a1218', pad: 2 } },
      { name: 'Pie timer', group: 'Simple', values: { thickness: 1, fillMode: 'solid', fillColor: '#f2f2f2', borderW: 4, borderColor: '#f2f2f2', trackColor: '#000000', trackAlpha: 0.4, pad: 8, shine: 0, shade: 0, shadowAlpha: 0 } },
      { name: 'Portrait frame', group: 'Simple', values: { thickness: 0.16, fillColor: '#e0342a', fillColor2: '#8a1712', borderW: 3, borderColor: '#101010', trackColor: '#24120f', trackAlpha: 1, pad: 1.5, centerAlpha: 1, centerColor: '#2b2f36', centerGap: 3 } },
      { name: 'Speedometer gauge', group: 'Realistic', values: { sweep: 270, start: -135, thickness: 0.18, fillMode: 'along', fillColor: '#4fd16a', fillColor2: '#e0322a', segments: 27, segGap: 2, segMode: 'fill', borderW: 2, borderColor: '#d8d8d8', trackColor: '#101214', trackAlpha: 0.9, pad: 3, shine: 0.15, shade: 0.2 } },
      { name: 'Rusty valve dial', group: 'Realistic', values: { thickness: 0.3, fillColor: '#c25a2b', fillColor2: '#6e2a12', borderW: 7, borderColor: '#3b2a20', trackColor: '#2a1d16', trackAlpha: 1, pad: 3, shine: 0.15, shade: 0.35, colorNoise: 0.55, noiseColor: '#7a4a22', noiseScale: 7, noiseDetail: 4, brightNoise: 0.15, distort: 0.05, grunge: 0.22, grungeType: 'blotchy', grungeScale: 7, edgeWear: 0.35, dirt: 0.5, scratches: 0.3, centerAlpha: 1, centerColor: '#3b2a20', centerGap: 0, seed: 31 } },
      { name: 'Military compass ring', group: 'Realistic', values: { thickness: 0.16, fillMode: 'solid', fillColor: '#b9b29a', segments: 36, segGap: 3, segMode: 'fill', borderW: 2, borderColor: '#5d5c55', trackColor: '#16171a', trackAlpha: 0.8, pad: 3, shine: 0, shade: 0, shadowAlpha: 0, grunge: 0.15, grungeType: 'speckle', grungeScale: 28, grungeOn: 'fill' } },
      { name: 'Worn painted ring', group: 'Stylized', values: { thickness: 0.22, fillColor: '#d23a2f', fillColor2: '#7f1610', borderW: 6, borderColor: '#111111', trackColor: '#191919', trackAlpha: 0.95, pad: 3, shine: 0.1, shade: 0.3, colorNoise: 0.3, noiseColor: '#3a0d0a', distort: 0.25, distortScale: 5, grunge: 0.3, grungeType: 'chipped', grungeScale: 8, edgeWear: 0.45, edgeWidth: 3, dirt: 0.35, scratches: 0.4, seed: 21 } },
      { name: 'Ink brush circle (enso)', group: 'Stylized', values: { sweep: 340, start: 20, thickness: 0.18, roundness: 1, fillEnd: 'shaped', fillMode: 'solid', fillColor: '#141210', borderW: 0, trackAlpha: 0, pad: 0, shine: 0, shade: 0, shadowAlpha: 0, distort: 0.6, distortScale: 2.2, grunge: 0.12, grungeType: 'streaks', grungeScale: 5, edgeWear: 0.4, edgeWidth: 3, value: 0.85, seed: 4 } },
      { name: 'Blood moon', group: 'Stylized', values: { thickness: 1, fillColor: '#8e0b0b', fillColor2: '#3a0202', borderW: 0, trackColor: '#0d0b0b', trackAlpha: 0.75, pad: 0, shine: 0, shade: 0.5, colorNoise: 0.5, noiseColor: '#230101', noiseScale: 4, distort: 0.5, distortScale: 3, grunge: 0.2, edgeWear: 0.45, edgeWidth: 6, shadowAlpha: 0, seed: 66 } },
      { name: 'Fantasy orb frame', group: 'Stylized', values: { thickness: 0.2, fillColor: '#4a7dff', fillColor2: '#14206e', borderW: 6, borderColor: '#c49a3c', splitFrame: true, trackColor: '#0d0f24', trackAlpha: 1, pad: 2, shine: 0.45, shade: 0.35, glow: 0.3, glowSize: 8, glowColor: '#6fa0ff', centerAlpha: 1, centerColor: '#1a1626', centerGap: 3, shadowAlpha: 0.5, shadowBlur: 6, shadowY: 3 } },
      { name: 'Ability cooldown', group: 'Game-inspired', values: { thickness: 1, fillMode: 'solid', fillColor: '#000000', fillAlpha: 0.6, borderW: 0, trackAlpha: 0, pad: 0, shine: 0, shade: 0, shadowAlpha: 0, dir: 'ccw', value: 0.6 } },
      { name: 'Stamina wheel', group: 'Game-inspired', values: { thickness: 0.22, fillMode: 'value', fillColor: '#7ee05a', fillColor2: '#e0a028', borderW: 3, borderColor: '#10140c', trackColor: '#10140c', trackAlpha: 0.6, pad: 2.5, shine: 0.3, shade: 0.15, shadowAlpha: 0.3 } },
      { name: 'Shield cells', group: 'Game-inspired', values: { thickness: 0.2, roundness: 0.5, fillColor: '#5fd8ff', fillColor2: '#2a6fd8', segments: 6, segGap: 6, segMode: 'cells', borderW: 2, borderColor: '#a8ecff', borderAlpha: 0.6, trackColor: '#0a1a2a', trackAlpha: 0.6, pad: 3, shine: 0.35, glow: 0.4, glowSize: 8, glowColor: '#3cc8ff', shadowAlpha: 0 } },
      { name: 'Twin-stick health arc', group: 'Game-inspired', values: { sweep: 120, start: -30, dir: 'ccw', thickness: 0.14, roundness: 1, fillEnd: 'shaped', fillColor: '#ff4d4d', fillColor2: '#a01818', borderW: 2, borderColor: '#101010', trackColor: '#101010', trackAlpha: 0.6, pad: 1.5, margin: 20 } },
      { name: 'Neon reactor', group: 'Sci-fi', values: { thickness: 0.15, fillMode: 'along', fillColor: '#3cf2ff', fillColor2: '#7a5cff', borderW: 2, borderColor: '#3cf2ff', borderAlpha: 0.7, trackColor: '#03141a', trackAlpha: 0.55, pad: 4, shine: 0.25, shade: 0, glow: 0.75, glowSize: 12, glowColor: '#26d9ff', shadowAlpha: 0, margin: 22 } },
      { name: 'Segmented HUD ring', group: 'Sci-fi', values: { thickness: 0.12, fillMode: 'solid', fillColor: '#7dff8a', segments: 24, segGap: 4, segMode: 'cells', borderW: 1.5, borderColor: '#7dff8a', borderAlpha: 0.45, trackColor: '#06180a', trackAlpha: 0.5, pad: 2.5, shine: 0, shade: 0, glow: 0.55, glowSize: 7, glowColor: '#5aff6a', shadowAlpha: 0, margin: 18 } },
      { name: 'Glitched core', group: 'Sci-fi', values: { thickness: 0.28, sweep: 300, start: -150, fillMode: 'solid', fillColor: '#ff3b4a', borderW: 2, borderColor: '#ff3b4a', trackColor: '#16050a', trackAlpha: 0.7, pad: 3, shine: 0, shade: 0, glow: 0.5, glowSize: 8, glowColor: '#ff2030', noiseType: 'value', brightNoise: 0.35, noiseScale: 22, distort: 0.15, distortScale: 8, grunge: 0.25, grungeType: 'streaks', grungeScale: 10, shadowAlpha: 0, margin: 18 } },
      // Post-apocalyptic: rust, scrap, dirt and wear
      { name: 'Scrap pressure gauge', group: 'Post-apocalyptic', values: { thickness: 0.26, fillColor: '#c86a2a', fillColor2: '#5a2410', borderW: 6, borderColor: '#2a1e16', trackColor: '#18120e', trackAlpha: 1, pad: 3, shine: 0.1, shade: 0.35, colorNoise: 0.5, noiseColor: '#6a3a18', brightNoise: 0.15, distort: 0.05, grunge: 0.3, grungeType: 'chipped', grungeScale: 7, edgeWear: 0.5, dirt: 0.4, scratches: 0.4, seed: 9 } },
      { name: 'Geiger dial', group: 'Post-apocalyptic', values: { sweep: 270, start: -135, thickness: 0.16, fillMode: 'along', fillColor: '#9ae03a', fillColor2: '#e0a020', segments: 18, segGap: 2, borderW: 2, borderColor: '#c8c0a0', trackColor: '#141410', trackAlpha: 0.95, colorNoise: 0.3, noiseColor: '#3a3a20', grunge: 0.25, grungeType: 'speckle', grungeScale: 10, dirt: 0.4, scratches: 0.3, seed: 6 } },
    ],
    render(ctx, W, H, p, opts) {
      U.barRender(ctx, W, H, p, opts, geometry(W, H, p));
    },
  });
})();
