/* Spotlight / flashlight cookie: stacked layers (discs, rings, and scanner shapes: rectangles, frames,
   corner brackets, grids, scan lines, dot matrix, barcodes, spokes, segmented arcs, tick rings,
   crosshairs, polygons), radial falloff, streak / grain noise and scanlines. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep } = U;

  const TYPES = [['disc', 'Disc'], ['ring', 'Ring'], ['rect', 'Rectangle'], ['frame', 'Rectangular frame'], ['brackets', 'Corner brackets'],
    ['grid', 'Grid'], ['lines', 'Scan lines'], ['dots', 'Dot matrix'], ['barcode', 'Barcode'], ['spokes', 'Spokes'], ['arcs', 'Segmented arcs'],
    ['ticks', 'Tick ring'], ['cross', 'Crosshair'], ['polygon', 'Polygon outline']];
  const TYPE_NAME = Object.fromEntries(TYPES);
  const is = (...t) => (l) => t.includes(l.type);
  const RECTISH = ['rect', 'frame', 'brackets', 'barcode'];
  const PATTERN = ['grid', 'lines', 'dots'];

  // rounded box SDF (negative inside)
  const box = (x, y, hx, hy, rc) => {
    const ax = Math.abs(x) - (hx - rc), ay = Math.abs(y) - (hy - rc);
    return Math.hypot(Math.max(ax, 0), Math.max(ay, 0)) + Math.min(Math.max(ax, ay), 0) - rc;
  };
  const band = (d, w, soft) => 1 - smoothstep(w / 2, w / 2 + soft + 1e-3, Math.abs(d)); // line of width w along d = 0
  const fill = (d, soft) => 1 - smoothstep(-soft, 1e-3, d); // inside d < 0

  /* mask 0..1 of one layer at point (x, y) in cookie space (radius 1 = half the short side) */
  function layerMask(l, x, y, li, seed) {
    const rot = (l.rotation || 0) * Math.PI / 180, cr = Math.cos(rot), sr = Math.sin(rot);
    const dx = x - (l.x || 0), dy = y - (l.y || 0);
    const lx = dx * cr + dy * sr, ly = -dx * sr + dy * cr, r = Math.hypot(lx, ly);
    const R = l.radius, w = l.width, sf = l.soft, hx = R, hy = R * (l.aspect || 1);
    switch (l.type) {
      case 'ring': return band(r - R, w, sf);
      case 'rect': return fill(box(lx, ly, hx, hy, Math.min(l.corner * R, hx, hy)), sf);
      case 'frame': return band(box(lx, ly, hx, hy, Math.min(l.corner * R, hx, hy)), w, sf);
      case 'brackets': {
        const L = Math.max(0.01, l.corner * 2 * Math.min(hx, hy));
        const near = smoothstep(hx - L - sf, hx - L, Math.abs(lx)) * smoothstep(hy - L - sf, hy - L, Math.abs(ly));
        return band(box(lx, ly, hx, hy, 0), w, sf) * near;
      }
      case 'grid':
      case 'lines':
      case 'dots': {
        // pattern inside a circle (region) or a rectangle
        const reg = l.region === 'rect' ? fill(box(lx, ly, hx, hy, 0), sf) : fill(r - R, sf);
        if (reg <= 0) return 0;
        const sp = Math.max(0.005, l.spacing), gx = Math.abs(U.mod(lx + sp / 2, sp) - sp / 2), gy = Math.abs(U.mod(ly + sp / 2, sp) - sp / 2);
        if (l.type === 'dots') return reg * (1 - smoothstep(l.duty * sp * 0.5 - sf * 0.3, l.duty * sp * 0.5 + 1e-3, Math.hypot(gx, gy)));
        const d = l.type === 'lines' ? gy : Math.min(gx, gy);
        return reg * band(d, w, sf * 0.3);
      }
      case 'barcode': {
        const reg = fill(box(lx, ly, hx, hy, 0), sf * 0.3);
        if (reg <= 0) return 0;
        const n = Math.max(2, l.count), cw = (2 * hx) / n, i = Math.floor((lx + hx) / cw), u = (lx + hx) / cw - i;
        const h = U.hash(i, li * 31 + 7, seed), on = h > 0.32, bw = 0.25 + 0.7 * U.hash(i, li * 31 + 9, seed);
        return on ? reg * band((u - 0.5) * cw, bw * cw, sf * 0.15) : 0;
      }
      case 'spokes': {
        const n = Math.max(1, l.count), a = Math.atan2(ly, lx), step = (2 * Math.PI) / n;
        const da = U.mod(a + step / 2, step) - step / 2, d = r * Math.sin(Math.abs(da));
        const inner = R * l.duty;
        return band(d, w, sf * 0.3) * smoothstep(inner - sf, inner, r) * (1 - smoothstep(R, R + sf + 1e-3, r));
      }
      case 'arcs': {
        const n = Math.max(1, l.count), a = (Math.atan2(ly, lx) / (2 * Math.PI) + 0.5) * n, u = a - Math.floor(a);
        const edge = Math.min(u, l.duty - u) * (2 * Math.PI * r) / n; // distance to the segment ends along the arc
        return u < l.duty ? band(r - R, w, sf) * smoothstep(0, sf + 1e-3, edge) : 0;
      }
      case 'ticks': {
        const n = Math.max(1, l.count), a = Math.atan2(ly, lx), step = (2 * Math.PI) / n;
        const da = U.mod(a + step / 2, step) - step / 2, d = r * Math.sin(Math.abs(da));
        const len = l.spacing;
        return band(d, w, sf * 0.3) * smoothstep(R - len - sf * 0.3, R - len, r) * (1 - smoothstep(R, R + sf * 0.3 + 1e-3, r));
      }
      case 'cross': {
        const gap = R * l.duty, d = Math.min(Math.abs(lx), Math.abs(ly));
        return band(d, w, sf * 0.3) * smoothstep(gap - sf * 0.3, gap, r) * (1 - smoothstep(R, R + sf + 1e-3, Math.max(Math.abs(lx), Math.abs(ly))));
      }
      case 'polygon': {
        const n = Math.max(3, l.count), a = Math.atan2(ly, lx) + Math.PI / 2, step = (2 * Math.PI) / n;
        const ang = U.mod(a, step) - step / 2, d = r * Math.cos(ang) - R * Math.cos(Math.PI / n);
        return band(d, w, sf);
      }
      default: return fill(r - R, sf); // disc (soft inside the radius, as before)
    }
  }

  U.register({
    id: 'cookie',
    name: 'Spotlight Cookie',
    desc: 'Light cookies from layered rings, discs and scanner shapes with radial falloff, streak noise and scanlines',
    uses: ['Projector cookies for spotlights and flashlights in game engines, giving torches, headlights and stage lights a believable beam pattern.', 'Holographic scanner and targeting overlays for sci-fi HUDs and projection effects.'],
    tags: ['Lighting', 'Shooter'],
    bg: 'black',
    icon: U.icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/>'),
    params: [
      { type: 'section', label: 'Layers' },
      {
        key: 'layers', label: 'Circle layers', type: 'list', itemLabel: 'Layer', max: 12,
        itemSummary: (l) => `${l.on ? '' : '(hidden) '}${U.t(TYPE_NAME[l.type] || l.type)} · ${l.blend} · r ${(+l.radius).toFixed(2)}`,
        item: [
          { key: 'on', label: 'Visible', type: 'bool', default: true },
          { key: 'type', label: 'Type', type: 'select', default: 'ring', options: TYPES },
          { key: 'blend', label: 'Blend', type: 'select', default: 'add', options: [['add', 'Add'], ['subtract', 'Subtract'], ['multiply', 'Multiply'], ['max', 'Max']] },
          { key: 'radius', label: 'Radius / half width', type: 'range', min: 0, max: 1, step: 0.005, default: 0.5 },
          { key: 'aspect', label: 'Height / width', type: 'range', min: 0.05, max: 3, step: 0.01, default: 1, show: (l) => RECTISH.includes(l.type) || (PATTERN.includes(l.type) && l.region === 'rect') },
          { key: 'width', label: 'Line width', type: 'range', min: 0.002, max: 0.5, step: 0.001, default: 0.05, show: (l) => !['disc', 'rect', 'dots'].includes(l.type) },
          { key: 'corner', label: 'Corner', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.15, show: is('rect', 'frame', 'brackets'), tip: 'Rounding (rectangle, frame) or bracket length' },
          { key: 'region', label: 'Region', type: 'select', default: 'circle', options: [['circle', 'Circle'], ['rect', 'Rectangle']], show: is(...PATTERN) },
          { key: 'spacing', label: 'Spacing', type: 'range', min: 0.005, max: 0.5, step: 0.001, default: 0.06, show: is('grid', 'lines', 'dots', 'ticks'), tip: 'Grid / line / dot spacing; tick length for tick rings' },
          { key: 'count', label: 'Count', type: 'int', min: 1, max: 120, default: 12, show: is('spokes', 'arcs', 'ticks', 'barcode', 'polygon') },
          { key: 'duty', label: 'Fill / gap', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: is('arcs', 'dots', 'spokes', 'cross'), tip: 'Arcs: share of each segment drawn. Dots: dot size. Spokes / crosshair: empty center' },
          { key: 'x', label: 'Offset X', type: 'range', min: -1, max: 1, step: 0.005, default: 0 },
          { key: 'y', label: 'Offset Y', type: 'range', min: -1, max: 1, step: 0.005, default: 0 },
          { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 0.5, default: 0 },
          { key: 'soft', label: 'Softness', type: 'range', min: 0, max: 0.5, step: 0.005, default: 0.05 },
          { key: 'intensity', label: 'Intensity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4 },
        ],
        default: [
          { on: true, type: 'disc', blend: 'add', radius: 0.82, width: 0.05, soft: 0.22, intensity: 1 },
          { on: true, type: 'ring', blend: 'subtract', radius: 0.42, width: 0.06, soft: 0.05, intensity: 0.35 },
          { on: true, type: 'ring', blend: 'add', radius: 0.68, width: 0.03, soft: 0.04, intensity: 0.2 },
        ],
      },
      { type: 'section', label: 'Falloff' },
      { key: 'falloff', label: 'Center → edge', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4 },
      { key: 'power', label: 'Falloff curve', type: 'range', min: 0.2, max: 4, step: 0.01, default: 1.5, show: (p) => p.falloff > 0 },
      { key: 'edgeFade', label: 'Black edge (no leaks)', type: 'bool', default: true },
      { type: 'section', label: 'Noise' },
      { key: 'noiseType', label: 'Noise', type: 'select', default: 'streaks', options: [['none', 'None'], ['streaks', 'Radial streaks'], ['grain', 'Grain'], ['both', 'Both']] },
      { key: 'noiseAmt', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => p.noiseType !== 'none' },
      { key: 'noiseScale', label: 'Scale', type: 'int', min: 1, max: 32, default: 6, show: (p) => p.noiseType !== 'none' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7, tip: 'Noise and barcode patterns' },
      { key: 'scan', label: 'Scanlines', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Fine projector lines across the whole cookie' },
      { key: 'scanSpacing', label: 'Scanline spacing', type: 'range', min: 0.004, max: 0.1, step: 0.001, default: 0.016, show: (p) => p.scan > 0 },
      { key: 'scanAngle', label: 'Scanline angle', type: 'range', min: -90, max: 90, step: 1, default: 0, show: (p) => p.scan > 0 },
      { type: 'section', label: 'Output', collapsed: true, active: (p) => p.gamma !== 1 || p.invert || p.tint !== '#ffffff' || p.alphaOut },
      { key: 'gamma', label: 'Gamma', type: 'range', min: 0.2, max: 3, step: 0.01, default: 1 },
      { key: 'invert', label: 'Invert', type: 'bool', default: false },
      { key: 'tint', label: 'Tint', type: 'color', default: '#ffffff' },
      { key: 'alphaOut', label: 'Output as alpha', type: 'bool', default: false },
    ],
    presets: [
      // Realistic
      { name: 'Cheap LED (reflector rings)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.8, soft: 0.25, intensity: 0.45 },
        { type: 'disc', radius: 0.22, soft: 0.08, intensity: 0.7 },
        { type: 'ring', radius: 0.3, width: 0.02, soft: 0.02, intensity: 0.35 },
        { type: 'ring', radius: 0.45, width: 0.015, soft: 0.02, intensity: 0.25 },
        { type: 'ring', radius: 0.38, width: 0.03, soft: 0.03, blend: 'subtract', intensity: 0.2 },
        { type: 'ring', radius: 0.62, width: 0.02, soft: 0.03, intensity: 0.15 },
      ], falloff: 0.3, noiseType: 'streaks', noiseAmt: 0.12, tint: '#ffffff' } },
      { name: 'Tactical torch (hotspot + spill)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.88, soft: 0.3, intensity: 0.3 },
        { type: 'disc', radius: 0.26, soft: 0.12, intensity: 0.8 },
        { type: 'ring', radius: 0.32, width: 0.03, soft: 0.04, intensity: 0.15 },
      ], falloff: 0.2, noiseType: 'streaks', noiseAmt: 0.08, noiseScale: 10 } },
      { name: 'Old incandescent bulb', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.75, soft: 0.3, intensity: 0.85 },
        { type: 'disc', radius: 0.1, soft: 0.08, blend: 'subtract', intensity: 0.35 },
        { type: 'ring', radius: 0.35, width: 0.04, soft: 0.06, blend: 'subtract', intensity: 0.2 },
        { type: 'ring', radius: 0.55, width: 0.05, soft: 0.05, intensity: 0.15 },
      ], falloff: 0.5, power: 1.2, noiseType: 'both', noiseAmt: 0.25, noiseScale: 5, tint: '#ffffff' } },
      { name: 'Maglite (dark center hole)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.7, soft: 0.12, intensity: 0.75 },
        { type: 'disc', radius: 0.16, soft: 0.06, blend: 'subtract', intensity: 0.65 },
        { type: 'ring', radius: 0.22, width: 0.05, soft: 0.04, intensity: 0.35 },
        { type: 'ring', radius: 0.68, width: 0.03, soft: 0.03, intensity: 0.3 },
      ], falloff: 0.15, noiseType: 'streaks', noiseAmt: 0.15, tint: '#ffffff' } },
      { name: 'Headlamp (wide flood)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.9, soft: 0.45, intensity: 0.8 },
        { type: 'disc', radius: 0.4, soft: 0.3, intensity: 0.25 },
      ], falloff: 0.55, power: 1, noiseType: 'grain', noiseAmt: 0.06, noiseScale: 4, tint: '#ffffff' } },
      { name: 'Car headlight (projector)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.72, soft: 0.02, intensity: 0.7 },
        { type: 'disc', radius: 0.35, soft: 0.2, intensity: 0.35 },
        { type: 'ring', radius: 0.71, width: 0.02, soft: 0.015, intensity: 0.4 },
      ], falloff: 0.25, noiseType: 'none', tint: '#ffffff' } },
      { name: 'Stage spotlight (hard edge)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.78, soft: 0.01, intensity: 1 },
      ], falloff: 0.1, noiseType: 'none', tint: '#ffffff' } },
      { name: 'Follow spot (soft)', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.7, soft: 0.2, intensity: 1 },
        { type: 'ring', radius: 0.66, width: 0.03, soft: 0.04, intensity: 0.2 },
      ], falloff: 0.25, noiseType: 'none' } },
      { name: 'Searchlight', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.5, soft: 0.04, intensity: 1 },
        { type: 'disc', radius: 0.9, soft: 0.35, intensity: 0.15 },
        { type: 'ring', radius: 0.3, width: 0.01, soft: 0.02, blend: 'subtract', intensity: 0.15 },
        { type: 'ring', radius: 0.4, width: 0.01, soft: 0.02, blend: 'subtract', intensity: 0.15 },
      ], falloff: 0.1, noiseType: 'streaks', noiseAmt: 0.2, noiseScale: 16, tint: '#ffffff' } },
      { name: 'Foliage-dappled light', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.88, soft: 0.25, intensity: 1 },
      ], falloff: 0.3, noiseType: 'grain', noiseAmt: 1, noiseScale: 6, gamma: 1.6, seed: 12, tint: '#ffffff' } },
      { name: 'Dirty lens torch', group: 'Realistic', values: { layers: [
        { type: 'disc', radius: 0.8, soft: 0.25, intensity: 0.6 },
        { type: 'disc', radius: 0.3, soft: 0.15, intensity: 0.5 },
      ], falloff: 0.35, noiseType: 'both', noiseAmt: 0.55, noiseScale: 9, seed: 21 } },
      // Stylized
      { name: 'Toon spotlight (bands)', group: 'Stylized', values: { layers: [
        { type: 'disc', radius: 0.8, soft: 0, intensity: 0.35 },
        { type: 'disc', radius: 0.55, soft: 0, intensity: 0.3 },
        { type: 'disc', radius: 0.3, soft: 0, intensity: 0.35 },
      ], falloff: 0, noiseType: 'none' } },
      { name: 'Target rings', group: 'Stylized', values: { layers: [
        { type: 'disc', radius: 0.12, soft: 0.02, intensity: 1 },
        { type: 'ring', radius: 0.3, width: 0.06, soft: 0.02, intensity: 0.85 },
        { type: 'ring', radius: 0.52, width: 0.06, soft: 0.02, intensity: 0.65 },
        { type: 'ring', radius: 0.74, width: 0.06, soft: 0.02, intensity: 0.45 },
      ], falloff: 0, noiseType: 'none' } },
      { name: 'Sunburst rays', group: 'Stylized', values: { layers: [
        { type: 'disc', radius: 0.85, soft: 0.4, intensity: 1 },
      ], falloff: 0.5, power: 0.8, noiseType: 'streaks', noiseAmt: 1, noiseScale: 4, gamma: 1.4, tint: '#ffffff' } },
      { name: 'Soft vignette', group: 'Stylized', values: { layers: [
        { type: 'disc', radius: 0.9, soft: 0.5, intensity: 1 },
      ], falloff: 0, noiseType: 'none', edgeFade: false } },
      // Game-inspired
      { name: 'Tarkov-style tactical light', group: 'Game-inspired', values: { layers: [
        { type: 'disc', radius: 0.85, soft: 0.3, intensity: 0.4 },
        { type: 'disc', radius: 0.2, soft: 0.06, intensity: 1 },
        { type: 'ring', radius: 0.27, width: 0.04, soft: 0.04, intensity: 0.35 },
        { type: 'ring', radius: 0.5, width: 0.04, soft: 0.04, blend: 'subtract', intensity: 0.15 },
        { type: 'ring', radius: 0.6, width: 0.02, soft: 0.03, intensity: 0.12 },
      ], falloff: 0.3, noiseType: 'streaks', noiseAmt: 0.15, noiseScale: 12, tint: '#ffffff' } },
      { name: 'DayZ-style cheap flashlight', group: 'Game-inspired', values: { layers: [
        { type: 'disc', radius: 0.5, soft: 0.3, intensity: 0.5 },
        { type: 'ring', radius: 0.18, width: 0.04, soft: 0.04, intensity: 0.3 },
        { type: 'ring', radius: 0.42, width: 0.08, soft: 0.06, intensity: 0.15 },
        { type: 'ring', radius: 0.7, width: 0.06, soft: 0.08, intensity: 0.08 },
      ], falloff: 0.6, noiseType: 'grain', noiseAmt: 0.3, noiseScale: 12, tint: '#ffffff' } },
      { name: 'Battlefield-style blinding light', group: 'Game-inspired', values: { layers: [
        { type: 'disc', radius: 0.92, soft: 0.2, intensity: 1 },
        { type: 'disc', radius: 0.45, soft: 0.2, intensity: 1 },
      ], falloff: 0.1, noiseType: 'none', gamma: 0.5, tint: '#ffffff' } },
      { name: 'CoD-style weapon light', group: 'Game-inspired', values: { layers: [
        { type: 'disc', radius: 0.9, soft: 0.3, intensity: 0.7 },
        { type: 'disc', radius: 0.42, soft: 0.2, intensity: 0.5 },
      ], falloff: 0.3, noiseType: 'streaks', noiseAmt: 0.06, noiseScale: 14, tint: '#ffffff' } },
      { name: 'Doom-style harsh flashlight', group: 'Game-inspired', values: { layers: [
        { type: 'disc', radius: 0.55, soft: 0.06, intensity: 1 },
        { type: 'ring', radius: 0.5, width: 0.03, soft: 0.02, blend: 'subtract', intensity: 0.4 },
        { type: 'ring', radius: 0.25, width: 0.02, soft: 0.02, blend: 'subtract', intensity: 0.25 },
      ], falloff: 0.2, noiseType: 'grain', noiseAmt: 0.2, noiseScale: 14, tint: '#ffffff' } },
      { name: 'Siege-style weapon light', group: 'Game-inspired', values: { layers: [
        { type: 'disc', radius: 0.82, soft: 0.28, intensity: 0.5 },
        { type: 'disc', radius: 0.18, soft: 0.1, intensity: 0.7 },
        { type: 'ring', radius: 0.4, width: 0.015, soft: 0.02, intensity: 0.2 },
      ], falloff: 0.35, noiseType: 'none', tint: '#ffffff' } },
      // Scanners (futuristic)
      { name: 'Grid scanner', group: 'Scanners', values: { layers: [
        { type: 'grid', radius: 0.78, width: 0.008, spacing: 0.09, soft: 0.02, intensity: 0.75 },
        { type: 'ring', radius: 0.78, width: 0.02, soft: 0.01, intensity: 0.9 },
        { type: 'disc', radius: 0.78, soft: 0.2, intensity: 0.12 },
      ], falloff: 0.15, noiseType: 'none' } },
      { name: 'Barcode scanner', group: 'Scanners', values: { layers: [
        { type: 'barcode', radius: 0.62, aspect: 0.28, count: 46, soft: 0.01, intensity: 0.9 },
        { type: 'frame', radius: 0.68, aspect: 0.36, width: 0.012, corner: 0.02, soft: 0.01, intensity: 0.6 },
        { type: 'lines', region: 'rect', radius: 0.72, aspect: 0.02, width: 0.01, spacing: 0.5, soft: 0.01, intensity: 1, blend: 'max', y: 0.05 },
      ], falloff: 0, noiseType: 'none', scan: 0.25, scanSpacing: 0.012 } },
      { name: 'Laser line scanner', group: 'Scanners', values: { layers: [
        { type: 'rect', radius: 0.85, aspect: 0.012, corner: 0, soft: 0.02, intensity: 1 },
        { type: 'rect', radius: 0.85, aspect: 0.06, corner: 0, soft: 0.08, intensity: 0.3 },
        { type: 'ticks', radius: 0.85, width: 0.006, spacing: 0.04, count: 2, soft: 0.01, intensity: 0.6, rotation: 0 },
      ], falloff: 0.3, power: 2, noiseType: 'grain', noiseAmt: 0.1, noiseScale: 20 } },
      { name: 'Radar sweep', group: 'Scanners', values: { layers: [
        { type: 'ring', radius: 0.82, width: 0.015, soft: 0.01, intensity: 0.9 },
        { type: 'ring', radius: 0.6, width: 0.008, soft: 0.01, intensity: 0.5 },
        { type: 'ring', radius: 0.38, width: 0.008, soft: 0.01, intensity: 0.5 },
        { type: 'spokes', radius: 0.82, width: 0.006, count: 12, duty: 0.08, soft: 0.01, intensity: 0.4 },
        { type: 'ticks', radius: 0.82, width: 0.005, spacing: 0.035, count: 72, soft: 0.01, intensity: 0.7 },
      ], falloff: 0.2, noiseType: 'none' } },
      { name: 'Targeting frame', group: 'Scanners', values: { layers: [
        { type: 'brackets', radius: 0.6, aspect: 0.75, width: 0.025, corner: 0.22, soft: 0.01, intensity: 1 },
        { type: 'cross', radius: 0.22, width: 0.012, duty: 0.25, soft: 0.01, intensity: 0.9 },
        { type: 'rect', radius: 0.6, aspect: 0.75, corner: 0.05, soft: 0.1, intensity: 0.15 },
      ], falloff: 0, noiseType: 'none', scan: 0.2 } },
      { name: 'Biometric iris scanner', group: 'Scanners', values: { layers: [
        { type: 'arcs', radius: 0.8, width: 0.04, count: 8, duty: 0.8, soft: 0.01, intensity: 0.9 },
        { type: 'arcs', radius: 0.66, width: 0.015, count: 24, duty: 0.55, soft: 0.01, intensity: 0.7, rotation: 7 },
        { type: 'spokes', radius: 0.55, width: 0.006, count: 36, duty: 0.35, soft: 0.01, intensity: 0.5 },
        { type: 'ring', radius: 0.2, width: 0.02, soft: 0.01, intensity: 0.9 },
        { type: 'disc', radius: 0.1, soft: 0.02, intensity: 0.8 },
      ], falloff: 0.1, noiseType: 'none' } },
      { name: 'Security laser grid', group: 'Scanners', values: { layers: [
        { type: 'grid', region: 'rect', radius: 0.9, aspect: 0.9, width: 0.006, spacing: 0.12, soft: 0.02, intensity: 1, rotation: 45 },
      ], falloff: 0.25, power: 2, noiseType: 'none', edgeFade: true } },
      { name: 'Hex projector', group: 'Scanners', values: { layers: [
        { type: 'polygon', radius: 0.8, width: 0.02, count: 6, soft: 0.01, intensity: 0.9 },
        { type: 'polygon', radius: 0.55, width: 0.012, count: 6, soft: 0.01, intensity: 0.7, rotation: 30 },
        { type: 'polygon', radius: 0.3, width: 0.01, count: 6, soft: 0.01, intensity: 0.6 },
        { type: 'dots', radius: 0.78, spacing: 0.05, duty: 0.25, soft: 0.01, intensity: 0.25 },
      ], falloff: 0.1, noiseType: 'none', scan: 0.15 } },
      { name: 'Dot matrix projector', group: 'Scanners', values: { layers: [
        { type: 'dots', radius: 0.8, spacing: 0.045, duty: 0.45, soft: 0.02, intensity: 1 },
      ], falloff: 0.45, power: 1.5, noiseType: 'grain', noiseAmt: 0.15, noiseScale: 12 } },
      { name: 'Scan bars (vertical sweep)', group: 'Scanners', values: { layers: [
        { type: 'lines', region: 'rect', radius: 0.8, aspect: 0.8, width: 0.02, spacing: 0.08, soft: 0.04, intensity: 0.8 },
        { type: 'frame', radius: 0.8, aspect: 0.8, width: 0.015, corner: 0.03, soft: 0.01, intensity: 0.8 },
      ], falloff: 0, noiseType: 'none', scan: 0.3, scanSpacing: 0.01, scanAngle: 90 } },
      { name: 'HUD reticle projector', group: 'Scanners', values: { layers: [
        { type: 'arcs', radius: 0.75, width: 0.02, count: 4, duty: 0.6, soft: 0.01, intensity: 0.9, rotation: 45 },
        { type: 'ticks', radius: 0.62, width: 0.006, spacing: 0.04, count: 48, soft: 0.01, intensity: 0.6 },
        { type: 'cross', radius: 0.5, width: 0.008, duty: 0.15, soft: 0.01, intensity: 0.7 },
        { type: 'brackets', radius: 0.2, width: 0.012, corner: 0.3, soft: 0.01, intensity: 0.9 },
      ], falloff: 0, noiseType: 'none', scan: 0.2 } },
      // Sci-fi
      { name: 'Hologram projector', group: 'Sci-fi', values: { layers: [
        { type: 'disc', radius: 0.8, soft: 0.1, intensity: 0.25 },
        { type: 'ring', radius: 0.2, width: 0.015, soft: 0.01, intensity: 0.9 },
        { type: 'ring', radius: 0.35, width: 0.015, soft: 0.01, intensity: 0.8 },
        { type: 'ring', radius: 0.5, width: 0.015, soft: 0.01, intensity: 0.7 },
        { type: 'ring', radius: 0.65, width: 0.015, soft: 0.01, intensity: 0.6 },
        { type: 'ring', radius: 0.78, width: 0.03, soft: 0.01, intensity: 0.9 },
      ], falloff: 0, noiseType: 'streaks', noiseAmt: 0.3, noiseScale: 24, tint: '#ffffff' } },
      { name: 'Tractor beam', group: 'Sci-fi', values: { layers: [
        { type: 'disc', radius: 0.75, soft: 0.05, intensity: 0.6 },
        { type: 'ring', radius: 0.74, width: 0.04, soft: 0.04, intensity: 0.5 },
        { type: 'disc', radius: 0.35, soft: 0.3, blend: 'subtract', intensity: 0.25 },
      ], falloff: 0, noiseType: 'grain', noiseAmt: 0.35, noiseScale: 18, tint: '#ffffff' } },
      { name: 'Plasma helmet lamp', group: 'Sci-fi', values: { layers: [
        { type: 'disc', radius: 0.7, soft: 0.3, intensity: 0.8 },
        { type: 'ring', radius: 0.3, width: 0.08, soft: 0.06, intensity: 0.3 },
      ], falloff: 0.4, noiseType: 'streaks', noiseAmt: 0.5, noiseScale: 5, tint: '#ffffff' } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), tint = U.hex(p.tint), P = p.noiseScale * 4;
      const layers = p.layers.filter((l) => l.on).map((l) => Object.assign({ x: 0, y: 0, rotation: 0, aspect: 1, corner: 0.15, region: 'circle', spacing: 0.06, count: 12, duty: 0.5 }, l));
      const streaks = p.noiseType === 'streaks' || p.noiseType === 'both';
      const grain = p.noiseType === 'grain' || p.noiseType === 'both';
      U.pixels(ctx, W, H, (px, py, o) => {
        const x = (px + 0.5 - W / 2) / (S / 2), y = (py + 0.5 - H / 2) / (S / 2), r = Math.hypot(x, y);
        let v = 0;
        for (let li = 0; li < layers.length; li++) {
          const l = layers[li], m = layerMask(l, x, y, li, p.seed | 0);
          switch (l.blend) {
            case 'subtract': v -= m * l.intensity; break;
            case 'multiply': v *= 1 - l.intensity * (1 - m); break;
            case 'max': v = Math.max(v, m * l.intensity); break;
            default: v += m * l.intensity;
          }
        }
        v = U.clamp(v);
        if (p.falloff > 0) v *= 1 - p.falloff * Math.pow(Math.min(1, r), p.power);
        if (p.noiseType !== 'none' && p.noiseAmt > 0 && v > 0) {
          let n = 0, c = 0;
          if (streaks) { n += U.fractal('perlin', (Math.atan2(y, x) / U.TAU + 0.5) * P, r * p.noiseScale * 0.4, P, 0, 3, 0.55, 'fbm', p.seed); c++; }
          if (grain) { n += U.fractal('perlin', x * p.noiseScale + 50, y * p.noiseScale + 50, 0, 0, 4, 0.5, 'fbm', p.seed + 3); c++; }
          v *= 1 + p.noiseAmt * (n / c - 0.5) * 3;
        }
        if (p.scan > 0) {
          const sa = (p.scanAngle * Math.PI) / 180, t = (-x * Math.sin(sa) + y * Math.cos(sa)) / p.scanSpacing;
          v *= 1 - p.scan * (0.5 - 0.5 * Math.cos(t * U.TAU));
        }
        if (p.edgeFade) v *= 1 - U.smoothstep(0.92, 1, r);
        v = Math.pow(U.clamp(v), p.gamma);
        if (p.invert) v = 1 - v;
        if (p.alphaOut) { o[0] = tint[0]; o[1] = tint[1]; o[2] = tint[2]; o[3] = v * 255; }
        else { o[0] = tint[0] * v; o[1] = tint[1] * v; o[2] = tint[2] * v; }
      });
    },
  });
})();
