/* City skyline: a distant city as a background impostor that tiles seamlessly in X (buildings crossing
   the right edge continue on the left). Several depth layers, far ones smaller, lighter and hazier
   (aerial perspective, ground fog). Every building is built from parts (tiers, roofs, crowns, domes,
   tanks, chimneys, antennas) and drawn as two visible faces (lit / shadowed by an angled sun) or flat
   (ambient). Windows are a grid per face with lit / unlit ratio, warm / cool mix and whole lit floors;
   night adds red aviation lights, neon and an optional glow. Output: color, greyscale, silhouette mask,
   emissive (lit windows, lights and neon only) or a depth (layer) map. Sky above is transparent. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp } = U;
  const RAD = Math.PI / 180;

  // time of day: picking one sets the matching colors (presets can override them on top)
  const TIMES = {
    day: { bldColor: '#7b838e', bldColor2: '#9c9488', hazeColor: '#c2cbd7', sunColor: '#fff1dc', skyColor: '#5d8fd0', skyColor2: '#cfe0ee' },
    dusk: { bldColor: '#2e2b3b', bldColor2: '#3e3236', hazeColor: '#b07a80', sunColor: '#ffa466', skyColor: '#343a72', skyColor2: '#f09a62' },
    night: { bldColor: '#15171f', bldColor2: '#1d1a1c', hazeColor: '#272b3e', sunColor: '#6a7cae', skyColor: '#04060e', skyColor2: '#1d2242' },
  };
  // building type weights per city style
  const STYLES = {
    modern: { box: 4, setback: 3, spire: 1.5, dome: 0.3, tank: 0.6, slant: 1, lowrise: 2, futur: 0.6 },
    downtown: { box: 4, setback: 4, spire: 2.5, dome: 0.4, tank: 1.2, slant: 1, lowrise: 0.6 },
    oldtown: { gable: 6, lowrise: 1.5, church: 0.6, dome: 0.4 },
    industrial: { industrial: 4, stack: 1.5, silo: 1.5, tank: 0.8, box: 1, lowrise: 2 },
    futuristic: { futur: 4, needle: 1, setback: 2, dome: 0.8, box: 1, spire: 1 },
    mixed: { box: 3, setback: 2, spire: 1, dome: 0.5, tank: 1, slant: 1, gable: 1.5, lowrise: 2, industrial: 1, stack: 0.5, silo: 0.4, futur: 0.6, church: 0.3 },
  };
  // width / height multipliers per type
  const SHAPE = {
    box: [1, 1], setback: [1.1, 1.1], spire: [0.9, 1.2], dome: [1.1, 0.7], tank: [1, 0.7], slant: [1, 0.85], lowrise: [1.3, 0.32],
    futur: [1, 1.15], needle: [0.7, 1.5], gable: [0.75, 0.4], church: [1.1, 0.75], industrial: [2.2, 0.28], stack: [0.35, 0.9], silo: [1.3, 0.45],
  };
  const pick = (w, r) => {
    let s = 0;
    for (const k in w) s += w[k];
    let t = r * s;
    for (const k in w) { t -= w[k]; if (t <= 0) return k; }
    return 'box';
  };
  const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const mulC = (a, f) => [a[0] * f, a[1] * f, a[2] * f];

  /* geometry of one building (px, ground at y = G): silhouette path, face boxes (for the two-face split),
     window regions, curved parts (domes / cylinders), aviation light spots, neon spots, smoke sources */
  function geo(b, G, S, p) {
    const r = U.rng(b.seed), x0 = b.x, w = b.w, x1 = x0 + w, h = b.h, top = G - h;
    const sil = new Path2D(), faces = [], regs = [], curved = [], tops = [], neon = [], smoke = [];
    const rect = (a, y0, c, y1, win = true) => { sil.rect(a, y0, c - a, y1 - y0); faces.push([a, y0, c, y1]); if (win) regs.push([a, y0, c, y1]); };
    const poly = (pts) => {
      let ar = 0;
      for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; ar += a[0] * c[1] - c[0] * a[1]; }
      if (ar < 0) pts = pts.slice().reverse(); // same winding as rect() so the union fills (nonzero)
      sil.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) sil.lineTo(pts[i][0], pts[i][1]);
      sil.closePath();
      let a = 1e9, c = -1e9, y0 = 1e9, y1 = -1e9;
      for (const q of pts) { a = Math.min(a, q[0]); c = Math.max(c, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      faces.push([a, y0, c, y1]);
    };
    const ell = (cx, cy, rx, ry, kind) => { sil.moveTo(cx + rx, cy); sil.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); curved.push({ kind, cx, cy, rx, ry }); };
    const cyl = (a, y0, c, y1) => { sil.rect(a, y0, c - a, y1 - y0); curved.push({ kind: 'cyl', a, y0, c, y1 }); };
    const ant = (x, y, len) => { const lw = Math.max(1, S * 0.0035 * b.sc); sil.rect(x - lw / 2, y - len, lw, len); faces.push([x - lw / 2, y - len, x + lw / 2, y]); tops.push([x, y - len]); };
    const roofBits = (a, c, y) => { // AC units, stair houses, antennas, water tank
      if (r() < p.roofDetail) {
        const n = 1 + ((r() * 3) | 0);
        for (let i = 0; i < n; i++) {
          const bw = (c - a) * (0.1 + r() * 0.22), bx = a + r() * (c - a - bw), bh = Math.min(bw, S * (0.008 + r() * 0.02) * b.sc);
          rect(bx, y - bh, bx + bw, y, false);
        }
      }
      if (r() < p.roofDetail * 0.35 && c - a > S * 0.03 * b.sc) tank(a + (c - a) * (0.2 + r() * 0.5), y, Math.min((c - a) * 0.28, S * 0.035 * b.sc));
      if (r() < p.spires * (b.h > S * 0.3 ? 0.8 : 0.3)) ant(a + (c - a) * (0.2 + r() * 0.6), y, S * (0.02 + r() * 0.08) * b.sc);
    };
    function tank(cx, y, tw) { // rooftop water tank on legs with a cone roof
      const lh = tw * 0.5, th = tw * 0.95, a = cx - tw / 2, c = cx + tw / 2, lw = Math.max(1, tw * 0.08);
      sil.rect(a + tw * 0.1, y - lh, lw, lh); sil.rect(c - tw * 0.1 - lw, y - lh, lw, lh);
      faces.push([a, y - lh, c, y]);
      cyl(a, y - lh - th, c, y - lh);
      poly([[a - tw * 0.04, y - lh - th], [cx, y - lh - th - tw * 0.35], [c + tw * 0.04, y - lh - th]]);
    }
    const neonSign = (a, c, y0, y1) => { if (r() < p.neon) { const vw = Math.max(1, (c - a) * (0.08 + r() * 0.1)), vx = a + (c - a) * (0.1 + r() * 0.75); neon.push([vx, y0 + (y1 - y0) * r() * 0.5, vw, (y1 - y0) * (0.12 + r() * 0.3), r() < 0.5 ? 0 : 1]); } };
    switch (b.type) {
      case 'setback': {
        const n = 2 + ((r() * 3) | 0);
        let a = x0, c = x1, yb = G, rest = h;
        for (let i = 0; i < n; i++) {
          const hh = i === n - 1 ? rest : rest * (0.45 + r() * 0.25);
          rect(a, yb - hh, c, yb);
          if (i === 0) neonSign(a, c, yb - hh, yb);
          yb -= hh; rest -= hh;
          const k = 0.62 + r() * 0.22, nw = (c - a) * k, off = (c - a - nw) * (0.5 + (r() - 0.5) * 0.6);
          a += off; c = a + nw;
        }
        const tc = faces[faces.length - 1];
        if (r() < p.spires) ant((tc[0] + tc[2]) / 2, top, h * (0.08 + r() * 0.18)); else roofBits(tc[0], tc[2], top);
        break;
      }
      case 'spire': {
        const bh = h * 0.76, ch = h * 0.12, cw = w * (0.25 + r() * 0.25);
        rect(x0, G - bh, x1, G);
        neonSign(x0, x1, G - bh, G);
        const mid = (x0 + x1) / 2, cr = r();
        if (cr < 0.4) poly([[x0 + w * 0.06, G - bh], [mid - cw / 2, G - bh - ch], [mid + cw / 2, G - bh - ch], [x1 - w * 0.06, G - bh]]); // tapering crown
        else if (cr < 0.7) { rect(x0 + w * 0.12, G - bh - ch * 0.5, x1 - w * 0.12, G - bh); rect(x0 + w * 0.28, G - bh - ch, x1 - w * 0.28, G - bh - ch * 0.5); } // stepped crown
        else poly([[x0, G - bh], [mid, G - bh - ch * 1.6], [x1, G - bh]]); // pyramid
        ant(mid, G - bh - ch * (cr >= 0.7 ? 1.6 : 1), h * 0.12 + h * 0.1 * r());
        break;
      }
      case 'dome': {
        const bh = h * 0.72;
        rect(x0, G - bh, x1, G);
        const dw = w * (0.32 + r() * 0.12), drum = h * 0.08, mid = (x0 + x1) / 2;
        rect(mid - dw, G - bh - drum, mid + dw, G - bh, false);
        ell(mid, G - bh - drum, dw * 0.92, dw * (0.8 + r() * 0.3), 'dome');
        ant(mid, G - bh - drum - dw * 0.95, h * 0.05);
        break;
      }
      case 'tank': {
        rect(x0, top, x1, G);
        neonSign(x0, x1, top, G);
        const n = w > S * 0.08 * b.sc && r() < 0.5 ? 2 : 1;
        for (let i = 0; i < n; i++) tank(x0 + w * (n === 1 ? 0.3 + r() * 0.4 : 0.25 + i * 0.5), top, Math.min(w * 0.3, S * 0.04 * b.sc));
        if (r() < p.roofDetail) rect(x0 + w * 0.05, top - S * 0.012 * b.sc, x0 + w * 0.22, top, false);
        break;
      }
      case 'slant': {
        const rh = Math.min(w * (0.25 + r() * 0.5), h * 0.3), y = top + rh;
        rect(x0, y, x1, G);
        poly(r() < 0.5 ? [[x0, y], [x0, top], [x1, y]] : [[x0, y], [x1, top], [x1, y]]);
        if (r() < p.spires * 0.5) ant(r() < 0.5 ? x0 + w * 0.1 : x1 - w * 0.1, top + rh * 0.1, h * 0.1);
        break;
      }
      case 'gable': { // narrow old-town house with a pitched roof and a chimney
        const rh = Math.min(w * (0.35 + r() * 0.35), h * 0.6), y = top + rh, mid = x0 + w * (0.4 + r() * 0.2);
        rect(x0, y, x1, G);
        if (r() < 0.25) { const st = rh * 0.45; poly([[x0, y], [x0 + w * 0.15, y - st], [x1 - w * 0.15, y - st], [x1, y]]); poly([[x0 + w * 0.15, y - st], [mid, top], [x1 - w * 0.15, y - st]]); }
        else poly([[x0 - w * 0.03, y], [mid, top], [x1 + w * 0.03, y]]);
        if (r() < 0.7) { const cx = x0 + w * (0.15 + r() * 0.7), cw = Math.max(1, w * 0.08); rect(cx, top + rh * 0.35, cx + cw, y - rh * 0.4 * Math.abs(cx - mid) / (w * 0.5) + rh * 0.1, false); }
        break;
      }
      case 'church': {
        const bh = h * 0.42, tw = w * (0.24 + r() * 0.08), tx = r() < 0.5 ? x0 + w * 0.08 : x1 - w * 0.08 - tw;
        rect(x0, G - bh, x1, G);
        poly([[x0, G - bh], [(x0 + x1) / 2, G - bh - w * 0.3], [x1, G - bh]]);
        rect(tx, G - h * 0.72, tx + tw, G, false);
        poly([[tx - tw * 0.06, G - h * 0.72], [tx + tw / 2, top], [tx + tw * 1.06, G - h * 0.72]]);
        tops.push([tx + tw / 2, top]);
        break;
      }
      case 'industrial': { // hall with a sawtooth roof and chimney stacks
        rect(x0, top, x1, G);
        const n = 3 + ((r() * 5) | 0), tw = w / n, th = Math.min(tw * 0.5, h * 0.35), rev = r() < 0.5;
        for (let i = 0; i < n; i++) {
          const a = x0 + i * tw, c = a + tw;
          poly(rev ? [[a, top], [a, top - th], [c, top]] : [[a, top], [c, top - th], [c, top]]);
        }
        const m = 1 + ((r() * 3) | 0);
        for (let i = 0; i < m; i++) {
          const cx = x0 + w * (0.1 + r() * 0.8), sw = Math.max(2, S * (0.008 + r() * 0.008) * b.sc), sh = h * (1.6 + r() * 2.2);
          poly([[cx - sw, G], [cx - sw * 0.7, G - sh], [cx + sw * 0.7, G - sh], [cx + sw, G]]);
          tops.push([cx, G - sh]); smoke.push([cx, G - sh, sw]);
        }
        break;
      }
      case 'stack': { // free-standing tapered chimney with a ring at the top
        const sw = Math.max(2, w * 0.22), mid = (x0 + x1) / 2;
        poly([[mid - sw, G], [mid - sw * 0.6, top], [mid + sw * 0.6, top], [mid + sw, G]]);
        rect(mid - sw * 0.72, top + h * 0.03, mid + sw * 0.72, top + h * 0.05, false);
        tops.push([mid, top]); smoke.push([mid, top, sw * 0.6]);
        const hw = w * 0.45; rect(mid - hw, G - h * 0.18, mid + hw, G);
        break;
      }
      case 'silo': {
        const n = 2 + ((r() * 3) | 0), cw = w / n;
        for (let i = 0; i < n; i++) {
          const a = x0 + i * cw + cw * 0.04, c = a + cw * 0.92, sh = h * (0.85 + r() * 0.15);
          cyl(a, G - sh, c, G);
          ell((a + c) / 2, G - sh, cw * 0.46, cw * 0.18, 'dome');
        }
        rect(x0 + w * 0.3, top - h * 0.12, x0 + w * 0.42, G - h * 0.3, false); // elevator head
        break;
      }
      case 'futur': { // tapered tower with a rounded or sliced top
        const tw = w * (0.35 + r() * 0.3), mid = (x0 + x1) / 2 + (r() - 0.5) * w * 0.2, bh = h * 0.88;
        poly([[x0, G], [mid - tw / 2, G - bh], [mid + tw / 2, G - bh], [x1, G]]);
        regs.push([x0, G - bh, x1, G]);
        const tr = r();
        if (tr < 0.45) ell(mid, G - bh, tw / 2, h * 0.12, 'dome');
        else if (tr < 0.8) poly([[mid - tw / 2, G - bh], [mid + tw / 2, G - bh - h * 0.12], [mid + tw / 2, G - bh]]);
        ant(mid, G - bh - (tr < 0.8 ? h * 0.1 : 0), h * (0.06 + r() * 0.12));
        if (r() < p.neon * 1.5) neon.push([mid - tw * 0.1, G - bh * 0.95, Math.max(1, tw * 0.06), bh * 0.6, r() < 0.5 ? 0 : 1]);
        break;
      }
      case 'needle': { // TV tower: tapered shaft, pod, antenna
        const mid = (x0 + x1) / 2, sw = Math.max(2, w * 0.14), ph = h * 0.66;
        poly([[mid - sw, G], [mid - sw * 0.45, G - h * 0.8], [mid + sw * 0.45, G - h * 0.8], [mid + sw, G]]);
        ell(mid, G - ph, w * 0.42, w * 0.13, 'dome');
        regs.push([mid - w * 0.42, G - ph - w * 0.08, mid + w * 0.42, G - ph + w * 0.08]);
        ell(mid, G - ph - w * 0.22, w * 0.22, w * 0.07, 'dome');
        ant(mid, G - h * 0.8, h * 0.2);
        break;
      }
      default: // box, lowrise
        rect(x0, top, x1, G);
        neonSign(x0, x1, top, G);
        roofBits(x0, x1, top);
    }
    return { sil, faces, regs, curved, tops, neon, smoke };
  }

  U.register({
    id: 'skyline',
    name: 'City Skyline',
    desc: 'Distant city skylines in depth layers with windows, roofs and lights, tiling seamlessly from left to right',
    uses: [
      'Background impostors for open-world, racing and flight games: a horizontal strip around the horizon (tiles horizontally, so it wraps around a skybox or cylinder), with a mask and an emissive map for night.',
      'Parallax backdrops for 2D side-scrollers and menus: render each depth layer as its own strip, or day, dusk and night versions of the same city.',
    ],
    tags: ['Nature', 'Lighting'],
    aspect: '4:1',
    bg: 'checker',
    icon: U.icon('<path d="M2 21h20M4 21V11h4v10M8 21V6h4v15M12 21V9l3-2 3 2v12M18 21v-7h3v7M10 3v3"/><path d="M5.5 13.5h1M5.5 16h1M9.5 9h1M9.5 12h1M14 12h2" opacity=".7"/>'),
    params: [
      { type: 'section', label: 'City' },
      { key: 'style', label: 'City style', type: 'select', default: 'modern', options: [['modern', 'Modern'], ['downtown', 'Downtown high-rise'], ['oldtown', 'Old town'], ['industrial', 'Industrial'], ['futuristic', 'Futuristic'], ['mixed', 'Mixed']], tip: 'Which building types appear (boxes, setbacks, spires, domes, water tanks, gables, halls, chimneys, silos, tapered towers)' },
      { key: 'count', label: 'Buildings', type: 'int', min: 4, max: 120, default: 24, tip: 'Buildings across the width in the nearest layer (far layers get more, smaller ones)' },
      { key: 'hMin', key2: 'hMax', label: 'Height', type: 'span', min: 0.02, max: 1, step: 0.01, default: 0.18, default2: 0.72, tip: 'Building height range as a share of the image height' },
      { key: 'heightVar', label: 'Height variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Random height differences between neighbours' },
      { key: 'cluster', label: 'Downtown clusters', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Groups the tall buildings into a few downtown areas' },
      { key: 'density', label: 'Density', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75, tip: '0 = gaps between buildings, 1 = packed and overlapping' },
      { key: 'widthVar', label: 'Width variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'spires', label: 'Spires & antennas', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { key: 'roofDetail', label: 'Roof details', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Rooftop units, stair houses and water tanks' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Layers' },
      { key: 'layers', label: 'Depth layers', type: 'int', min: 1, max: 5, default: 3 },
      { key: 'layerScale', label: 'Far layer scale', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'How much smaller the buildings in the far layers are' },
      { key: 'nearHeight', label: 'Near layer height', type: 'range', min: 0.2, max: 1.5, step: 0.01, default: 0.7, tip: 'Height of the nearest layer relative to the farthest (below 1: the far city towers above)' },
      { key: 'haze', label: 'Aerial haze', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Far layers fade toward the haze color (aerial perspective)' },
      { key: 'fog', label: 'Ground fog', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Fog rising from the base of every layer' },
      { key: 'greyVar', label: 'Brightness variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Lighter and darker buildings' },
      { key: 'colorMix', label: 'Second color share', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Buildings tinted toward the second building color' },

      { type: 'section', label: 'Windows' },
      { key: 'winStyle', label: 'Window style', type: 'select', default: 'mixed', options: [['mixed', 'Mixed'], ['grid', 'Grid'], ['bands', 'Ribbon bands'], ['vertical', 'Vertical strips'], ['none', 'None']] },
      { key: 'floorH', label: 'Floor height', type: 'range', min: 0.004, max: 0.06, step: 0.001, default: 0.016, show: (p) => p.winStyle !== 'none', tip: 'Share of the image height (nearest layer)' },
      { key: 'winSpacing', label: 'Window spacing', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1, show: (p) => p.winStyle !== 'none', tip: 'Column width relative to the floor height' },
      { key: 'winSize', label: 'Window size', type: 'range', min: 0.15, max: 0.95, step: 0.01, default: 0.55, show: (p) => p.winStyle !== 'none' },
      { key: 'litRatio', label: 'Lit windows', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.winStyle !== 'none' },
      { key: 'litFloors', label: 'Lit floor grouping', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.winStyle !== 'none', tip: 'Lights come on in whole floors (offices) instead of single windows' },
      { key: 'litVar', label: 'Brightness variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.winStyle !== 'none' },
      { key: 'winColor', label: 'Warm light', type: 'color', default: '#ffcf7a', show: (p) => p.winStyle !== 'none' },
      { key: 'winColor2', label: 'Cool light', type: 'color', default: '#cfe4ff', show: (p) => p.winStyle !== 'none' },
      { key: 'coolMix', label: 'Cool share', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => p.winStyle !== 'none', tip: 'Share of windows with the cool (fluorescent / LED) light' },

      { type: 'section', label: 'Lighting' },
      { key: 'time', label: 'Time of day', type: 'select', default: 'day', options: [['day', 'Day'], ['dusk', 'Dusk'], ['night', 'Night']], apply: (v, p) => Object.assign(p, TIMES[v] || {}), tip: 'Sets the matching colors. Day: windows are dark glass. Dusk: some lights on. Night: dark buildings, lit windows, aviation lights' },
      { key: 'look', label: 'Look', type: 'select', default: 'shaded', options: [['shaded', 'Shaded (two faces)'], ['flat', 'Flat (one tone per building)'], ['toon', 'Toon (hard tones, outline)']] },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'angled', options: [['angled', 'Angled (light angle)'], ['ambient', 'Ambient (soft, no direction)']], show: (p) => p.look !== 'flat', tip: 'Ambient: soft light from all around, like an overcast sky: both faces of a building get the same tone, only darkening slightly toward the ground' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -150, show: (p) => p.look !== 'flat' && p.lightMode !== 'ambient', tip: 'Direction the sun comes from (180 = left, 0 = right, -90 = above)' },
      { key: 'shade', label: 'Face contrast', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.look !== 'flat' && p.lightMode !== 'ambient', tip: 'Brightness difference between the lit and the shadowed face' },
      { key: 'bldColor', label: 'Building color', type: 'color', default: TIMES.day.bldColor },
      { key: 'bldColor2', label: 'Second building color', type: 'color', default: TIMES.day.bldColor2, show: (p) => p.colorMix > 0 },
      { key: 'sunColor', label: 'Sun color', type: 'color', default: TIMES.day.sunColor, show: (p) => p.look !== 'flat' && p.lightMode !== 'ambient', tip: 'Tints the lit faces' },
      { key: 'hazeColor', label: 'Haze color', type: 'color', default: TIMES.day.hazeColor, show: (p) => p.haze > 0 || p.fog > 0 },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 6, step: 0.1, default: 1.5, show: (p) => p.look === 'toon', tip: 'px @ 512' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#1a1c24', show: (p) => p.look === 'toon' && p.outline > 0 },
      { key: 'aviation', label: 'Aviation lights', type: 'bool', default: true, tip: 'Red lights on the tops of tall buildings, antennas and chimneys (dusk and night)' },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Soft light bleeding around lit windows, signs and lights' },
      { key: 'neon', label: 'Neon signs', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Glowing vertical signs and light strips' },
      { key: 'neonColor', label: 'Neon color', type: 'color', default: '#ff2fb4', show: (p) => p.neon > 0 },
      { key: 'neonColor2', label: 'Neon color 2', type: 'color', default: '#2ff0ff', show: (p) => p.neon > 0 },
      { key: 'smoke', label: 'Chimney smoke', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.style === 'industrial' || p.style === 'mixed' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color'], ['grey', 'Greyscale'], ['mask', 'Silhouette mask'], ['emissive', 'Emissive (lights only)'], ['depth', 'Depth (layer) map']], tip: 'Mask: white city on black. Emissive: lit windows, lights and neon on black, for an emission map. Depth: one grey per layer, near = white' },
      { key: 'sky', label: 'Sky', type: 'select', default: 'transparent', options: [['transparent', 'Transparent'], ['gradient', 'Gradient']], show: (p) => p.output === 'color' || p.output === 'grey' },
      { key: 'skyColor', label: 'Sky color', type: 'color', default: TIMES.day.skyColor, show: (p) => p.sky === 'gradient' && (p.output === 'color' || p.output === 'grey') },
      { key: 'skyColor2', label: 'Horizon color', type: 'color', default: TIMES.day.skyColor2, show: (p) => p.sky === 'gradient' && (p.output === 'color' || p.output === 'grey') },
    ],
    presets: [
      { name: 'Modern downtown (day)', group: 'Realistic', values: { style: 'downtown', count: 30, seed: 7 } },
      { name: 'Overcast city', group: 'Realistic', values: { style: 'modern', lightMode: 'ambient', haze: 0.7, bldColor: '#808892', hazeColor: '#c9ced4', seed: 12 } },
      { name: 'Night city', group: 'Realistic', values: { time: 'night', style: 'downtown', litRatio: 0.42, glow: 0.45, haze: 0.5, seed: 21 } },
      { name: 'Dusk', group: 'Realistic', values: { time: 'dusk', style: 'downtown', litRatio: 0.3, haze: 0.6, lightAngle: 175, shade: 0.5, sky: 'gradient', seed: 33 } },
      { name: 'Foggy layered city', group: 'Realistic', values: { style: 'modern', layers: 5, haze: 0.85, fog: 0.6, lightMode: 'ambient', hazeColor: '#d2d6da', bldColor: '#5a6068', greyVar: 0.3, seed: 18 } },
      { name: 'Old town', group: 'Realistic', values: { style: 'oldtown', count: 44, hMin: 0.3, hMax: 1, nearHeight: 0.9, heightVar: 0.35, cluster: 0.2, density: 0.95, bldColor: '#8f8072', bldColor2: '#9a7866', colorMix: 0.5, floorH: 0.03, winSpacing: 1.4, winStyle: 'grid', winSize: 0.5, layerScale: 0.35, seed: 4 } },
      { name: 'Old town at night', group: 'Realistic', values: { time: 'night', style: 'oldtown', count: 44, hMin: 0.3, hMax: 1, nearHeight: 0.9, heightVar: 0.35, cluster: 0.2, density: 0.95, floorH: 0.03, winSpacing: 1.4, winStyle: 'grid', litRatio: 0.3, coolMix: 0, glow: 0.5, aviation: false, seed: 4 } },
      { name: 'Industrial zone', group: 'Realistic', values: { style: 'industrial', count: 18, hMin: 0.2, hMax: 0.75, heightVar: 0.4, cluster: 0.1, density: 0.6, haze: 0.6, bldColor: '#6e6a66', bldColor2: '#7a5c4c', colorMix: 0.4, winStyle: 'bands', smoke: 0.7, seed: 9 } },
      { name: 'Industrial night', group: 'Realistic', values: { time: 'night', style: 'industrial', count: 18, hMin: 0.2, hMax: 0.75, cluster: 0.1, density: 0.6, winStyle: 'bands', litRatio: 0.25, coolMix: 0.6, smoke: 0.4, glow: 0.5, seed: 9 } },
      { name: 'Small town', group: 'Realistic', values: { style: 'mixed', count: 36, hMin: 0.06, hMax: 0.45, heightVar: 0.5, cluster: 0.7, density: 0.55, layers: 2, seed: 27 } },
      { name: 'Futuristic city', group: 'Sci-fi', values: { style: 'futuristic', count: 24, hMin: 0.25, hMax: 0.95, bldColor: '#8a96a6', bldColor2: '#c8d2dc', colorMix: 0.4, winStyle: 'bands', haze: 0.6, hazeColor: '#c8dcea', seed: 14 } },
      { name: 'Cyberpunk neon', group: 'Sci-fi', values: { time: 'night', style: 'futuristic', count: 34, hMin: 0.3, hMax: 1, cluster: 0.4, density: 0.9, neon: 0.6, glow: 0.7, litRatio: 0.5, coolMix: 0.6, winColor2: '#9fe8ff', hazeColor: '#3a1e4a', haze: 0.6, fog: 0.3, layers: 4, seed: 41 } },
      { name: 'Sci-fi night towers', group: 'Sci-fi', values: { time: 'night', style: 'futuristic', count: 22, hMin: 0.3, hMax: 0.95, winStyle: 'bands', litRatio: 0.55, litFloors: 0.8, coolMix: 0.9, winColor2: '#8fd8ff', neon: 0.25, neonColor: '#3affd0', neonColor2: '#3a8cff', glow: 0.55, seed: 52 } },
      { name: 'Silhouette mask', group: 'Masks', values: { output: 'mask', layers: 1, winStyle: 'none', density: 0.9, count: 30, seed: 7 } },
      { name: 'Layered silhouettes', group: 'Masks', values: { look: 'flat', winStyle: 'none', greyVar: 0, colorMix: 0, bldColor: '#1c2230', hazeColor: '#9aa6be', haze: 0.85, layers: 4, fog: 0, seed: 23 } },
      { name: 'Night emissive map', group: 'Masks', values: { time: 'night', output: 'emissive', style: 'downtown', litRatio: 0.42, glow: 0.4, seed: 21 } },
      { name: 'Depth layer map', group: 'Masks', values: { output: 'depth', layers: 4, seed: 7 } },
      { name: 'Toon skyline', group: 'Stylized', values: { look: 'toon', style: 'modern', count: 22, layers: 2, haze: 0.5, bldColor: '#5b7fb0', bldColor2: '#7d6bb0', colorMix: 0.4, hazeColor: '#b8d4f0', sunColor: '#fff6e0', winStyle: 'grid', floorH: 0.028, winSpacing: 1.3, winSize: 0.5, greyVar: 0.3, roofDetail: 0.3, sky: 'gradient', skyColor: '#7ab4ee', skyColor2: '#d8ecff', seed: 3 } },
      { name: 'Flat retro silhouette', group: 'Stylized', values: { time: 'dusk', look: 'flat', winStyle: 'none', greyVar: 0.15, colorMix: 0, bldColor: '#2a1a3a', hazeColor: '#e86a7a', haze: 0.8, layers: 3, aviation: false, sky: 'gradient', skyColor: '#2a1c5a', skyColor2: '#ff9a6a', seed: 11 } },
      { name: 'Synthwave night', group: 'Stylized', values: { time: 'night', look: 'flat', style: 'futuristic', winStyle: 'bands', litRatio: 0.22, coolMix: 0.5, winColor: '#ff5ad0', winColor2: '#5ae8ff', bldColor: '#120a24', hazeColor: '#4a1a5a', neon: 0.4, glow: 0.6, layers: 3, sky: 'gradient', skyColor: '#0a0420', skyColor2: '#7a1a6a', seed: 61 } },
    ],
    render(ctx, W, H, p) {
      const S = H, G = H, n = Math.max(1, p.layers | 0), out = p.output, time = p.time;
      const night = time === 'night', dusk = time === 'dusk', winOn = p.winStyle !== 'none';
      const bc1 = U.hex(p.bldColor), bc2 = U.hex(p.bldColor2), sun = U.hex(p.sunColor).map((v) => v / 255), haze = U.hex(p.hazeColor);
      const wc1 = U.hex(p.winColor), wc2 = U.hex(p.winColor2), nc = [U.hex(p.neonColor), U.hex(p.neonColor2)];
      const look = p.look, flat = look === 'flat', toon = look === 'toon', amb = p.lightMode === 'ambient';
      const la = p.lightAngle * RAD, lx = Math.cos(la);
      const k = flat || amb ? 0 : p.shade * Math.max(0.25, Math.abs(lx)) * Math.sign(lx || 1);
      const emis = U.canvas(W, H), ec = emis.getContext('2d');
      const litMul = night ? 1 : dusk ? 0.8 : 0; // how much the lit windows glow
      const litShare = night ? 1 : dusk ? 0.55 : 0;
      ctx.clearRect(0, 0, W, H);
      const lights = []; // aviation lights [x, y, size, layer depth]
      const smokes = [];

      for (let li = 0; li < n; li++) {
        const d = n > 1 ? (n - 1 - li) / (n - 1) : 0; // 1 = farthest, 0 = nearest
        const sc = 1 - p.layerScale * d * 0.65, hm = n > 1 ? lerp(p.nearHeight, 1, d) : 1;
        const cnt = Math.max(2, Math.round(p.count / sc)), seed = (p.seed | 0) * 131 + li * 977;
        const r = U.rng(seed), styleW = STYLES[p.style] || STYLES.modern;
        // ---- lay out the buildings along X, scaled to exactly W so the row wraps ----
        const bl = [];
        let xs = 0;
        const wAvg = W / cnt;
        for (let i = 0; i < cnt; i++) {
          const type = pick(styleW, r()), sh = SHAPE[type] || SHAPE.box;
          const w = wAvg * sh[0] * (1 + (r() - 0.5) * p.widthVar * 1.3);
          let gap = wAvg * ((1 - p.density) * r() * 1.1 - p.density * 0.3 * r());
          if (gap > 0 && gap < wAvg * 0.12) gap = -wAvg * 0.02; // no hairline slits
          bl.push({ type, x: xs, w, sh, r1: r(), r2: r(), tone: r(), mix: r(), split: 0.3 + r() * 0.4, ws: r(), seed: seed + i * 7919 + 1, z: r() });
          xs += w + gap;
        }
        const kx = W / xs;
        for (const b of bl) {
          b.x *= kx; b.w *= kx;
          const cxu = (b.x + b.w / 2) / W;
          const env = clamp((U.fractal('perlin', cxu * 3, 0.37 + li * 3.1, 3, 0, 3, 0.5, 'fbm', (p.seed | 0) + 17) - 0.5) * 2.6 + 0.5);
          let t = lerp(0.45, env, p.cluster) + (b.r1 - 0.5) * p.heightVar * 1.1;
          t = clamp(t) ** 1.25;
          b.h = Math.max(S * 0.01, lerp(p.hMin, p.hMax, t) * hm * S * b.sh[1]);
          if (b.type === 'industrial' || b.type === 'stack' || b.type === 'silo') b.h = Math.max(b.h, S * 0.04 * sc);
          b.sc = sc;
        }
        bl.sort((a, c) => a.z - c.z);

        const lc = U.canvas(W, H), c = lc.getContext('2d');
        const fh = Math.max(0.6, p.floorH * S * sc), olw = (p.outline * S) / 512 * (n > 1 ? lerp(1, 0.6, d) : 1);
        for (const b of bl) {
          const g = geo(b, G, S, p);
          // face colors
          const base = mulC(mixC(bc1, bc2, b.mix < p.colorMix ? 0.35 + 0.65 * b.r2 : 0), 1 + (b.tone - 0.5) * p.greyVar * 0.7);
          let fl = 1 - k * 0.55, fr = 1 + k * 0.55;
          if (toon) { fl = fl > 1 ? 1.12 : 0.78; fr = fr > 1 ? 1.12 : 0.78; if (amb) fl = fr = 1; }
          const lit = (f) => { const s = clamp((f - 1) * 2); return [base[0] * f * lerp(1, sun[0] * 1.15, s), base[1] * f * lerp(1, sun[1] * 1.15, s), base[2] * f * lerp(1, sun[2] * 1.15, s)]; };
          const cL = lit(fl), cR = lit(fr);
          for (const off of [-W, 0, W]) {
            if (b.x + off > W + b.w || b.x + b.w + off < -b.w * 2) continue;
            for (const cc of [c, ec]) { cc.save(); cc.translate(off, 0); }
            if (toon && olw > 0) { c.strokeStyle = p.outlineColor; c.lineWidth = olw * 2; c.lineJoin = 'round'; c.stroke(g.sil); }
            c.fillStyle = rgb(cL); c.fill(g.sil);
            ec.globalCompositeOperation = 'destination-out'; ec.fill(g.sil); ec.globalCompositeOperation = 'source-over'; // nearer buildings hide the lights behind them
            c.save(); c.clip(g.sil);
            if (!flat) {
              c.fillStyle = rgb(cR);
              for (const f of g.faces) { const sx = f[0] + (f[2] - f[0]) * b.split; c.fillRect(sx, f[1] - 1, f[2] - sx + 1, f[3] - f[1] + 2); }
            }
            // curved parts: horizontal shading across domes and cylinders
            for (const q of g.curved) {
              const a = q.kind === 'cyl' ? q.a : q.cx - q.rx, e = q.kind === 'cyl' ? q.c : q.cx + q.rx;
              const gr = c.createLinearGradient(a, 0, e, 0);
              if (flat) { gr.addColorStop(0, rgb(cL)); gr.addColorStop(1, rgb(cL)); }
              else if (toon) { gr.addColorStop(0, rgb(cL)); gr.addColorStop(0.5, rgb(cL)); gr.addColorStop(0.5, rgb(cR)); gr.addColorStop(1, rgb(cR)); }
              else { gr.addColorStop(0, rgb(mixC(cL, cR, 0.15))); gr.addColorStop(k < 0 ? 0.3 : 0.7, rgb(mixC(cL, cR, 0.5))); gr.addColorStop(1, rgb(mixC(cL, cR, 0.9))); }
              c.fillStyle = gr;
              if (q.kind === 'cyl') c.fillRect(q.a, q.y0, q.c - q.a, q.y1 - q.y0);
              else { c.beginPath(); c.ellipse(q.cx, q.cy, q.rx, q.ry, 0, 0, Math.PI * 2); c.fill(); }
            }
            // windows
            if (winOn && fh >= 0.6) drawWindows(c, ec, b, g, fh, base, cL, cR, d, flat);
            c.restore();
            // neon signs
            for (const q of g.neon) {
              const col = nc[q[4]], a = (night ? 1 : dusk ? 0.8 : 0.55) * (1 - p.haze * d * 0.5);
              for (const cc of [c, ec]) { cc.globalAlpha = cc === ec ? 1 - p.haze * d * 0.6 : a; cc.fillStyle = rgb(col); cc.fillRect(q[0], q[1], q[2], q[3]); cc.globalAlpha = 1; }
              if (p.neon > 0.3 && q[3] > q[2] * 3) { // sign segments
                c.fillStyle = 'rgba(0,0,0,0.35)';
                const seg = Math.max(2, q[2] * 1.3);
                for (let y = q[1] + seg; y < q[1] + q[3]; y += seg) c.fillRect(q[0], y, q[2], Math.max(0.6, seg * 0.18));
              }
            }
            if (p.neon > 0 && (b.type === 'futur' || b.type === 'needle' || b.type === 'setback') && U.hash(b.seed, 3, 9) < p.neon) { // edge strips
              const f = g.faces[0], sx = f[0] + (f[2] - f[0]) * b.split, col = nc[U.hash(b.seed, 5, 2) < 0.5 ? 0 : 1], lw = Math.max(1, S * 0.003 * sc);
              for (const cc of [c, ec]) { cc.save(); cc.clip(g.sil); cc.fillStyle = rgb(col); cc.globalAlpha = (night ? 0.9 : 0.5) * (1 - p.haze * d * 0.5); cc.fillRect(sx - lw / 2, f[1], lw, f[3] - f[1]); cc.restore(); }
            }
            for (const cc of [c, ec]) cc.restore();
            if (off === 0) {
              for (const t of g.tops) lights.push([t[0], t[1], sc, d, b.seed]);
              for (const s of g.smoke) smokes.push([s[0], s[1], s[2], d, li]);
            }
          }
        }
        // ---- smoke of this layer, then aerial haze and ground fog on the layer only (source-atop) ----
        if (p.smoke > 0 && (out === 'color' || out === 'grey')) drawSmoke(c, smokes.filter((s) => s[4] === li), base0(), d);
        c.globalCompositeOperation = 'source-atop';
        if (out === 'depth' || out === 'mask') {
          const v = out === 'mask' ? 255 : Math.round(255 * (1 - d * 0.8));
          c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(0, 0, W, H);
        } else {
          // light falloff toward the ground
          const ao = c.createLinearGradient(0, G - S * 0.6 * hm, 0, G);
          ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, `rgba(0,0,0,${amb ? 0.28 : 0.16})`);
          c.fillStyle = ao; c.fillRect(0, 0, W, H);
          const hz = p.haze * Math.pow(d, 0.85) * 0.88;
          if (hz > 0) { c.fillStyle = U.rgba(p.hazeColor, hz); c.fillRect(0, 0, W, H); }
          if (p.fog > 0) {
            const fH = S * (0.12 + 0.4 * p.fog) * (0.6 + 0.4 * hm), fa = clamp(p.fog * (0.55 + 0.45 * d) * 1.1);
            const fg = c.createLinearGradient(0, G - fH, 0, G);
            fg.addColorStop(0, U.rgba(p.hazeColor, 0)); fg.addColorStop(0.7, U.rgba(p.hazeColor, fa * 0.7)); fg.addColorStop(1, U.rgba(p.hazeColor, fa));
            c.fillStyle = fg; c.fillRect(0, 0, W, H);
          }
        }
        c.globalCompositeOperation = 'source-over';
        ctx.drawImage(lc, 0, 0);
      }

      function base0() { return mixC(bc1, haze, 0.4); }

      function drawWindows(c, ec, b, g, fh, base, cL, cR, d, flat) {
        const style = p.winStyle === 'mixed' ? ['grid', 'grid', 'bands', 'vertical', 'grid'][(b.ws * 5) | 0] : p.winStyle;
        if (b.type === 'industrial' && p.winStyle === 'mixed') return drawBand(c, b, g, fh, cL, cR, d);
        const dayGlass = (cf) => mulC(cf, 0.62);
        const buckets = new Map(); // color -> Path2D (main), lit ones also go to the emissive canvas
        const add = (key, col, lit, x, y, w, h) => {
          let e = buckets.get(key);
          if (!e) buckets.set(key, (e = { col, lit, path: new Path2D() }));
          e.path.rect(x, y, w, h);
        };
        let floorNo = 0;
        for (const rg of g.regs) {
          const rw = rg[2] - rg[0], sx = rg[0] + rw * (flat ? 1 : b.split);
          const top = rg[1] + fh * 0.6, bot = rg[3] - fh * 0.4;
          const nf = Math.floor((bot - top) / fh);
          if (nf < 1) continue;
          const fstep = (bot - top) / nf;
          const facesX = flat ? [[rg[0], rg[2], cL]] : [[rg[0], sx, cL], [sx, rg[2], cR]];
          for (const [a, e, cf] of facesX) {
            const fw = e - a;
            if (fw < fh * 0.5) continue;
            const ncol = Math.max(1, Math.round(fw / (fh * p.winSpacing)));
            const cw = fw / ncol;
            let ww = cw * p.winSize, wh = fstep * (0.3 + 0.55 * p.winSize), wy0 = (fstep - wh) * 0.45;
            if (style === 'bands') { ww = cw * 0.96; wh = fstep * (0.25 + 0.5 * p.winSize); }
            else if (style === 'vertical') { ww = cw * (0.15 + 0.35 * p.winSize); wh = fstep * 0.97; wy0 = 0; }
            ww = Math.max(0.7, ww); wh = Math.max(0.7, wh);
            const glass = dayGlass(cf);
            for (let f = 0; f < nf; f++) {
              const fy = top + f * fstep + wy0, fl = floorNo + f;
              const floorOn = U.hash(b.seed, fl, 11) < p.litRatio;
              const pl = lerp(p.litRatio, floorOn ? 0.9 : 0.04, p.litFloors) * litShare;
              for (let i = 0; i < ncol; i++) {
                const x = a + i * cw + (cw - ww) / 2, hh = U.hash(b.seed + i * 31, fl, 5);
                if (litMul > 0 && hh < pl) {
                  const cool = U.hash(b.seed, fl * 7 + i, 13) < p.coolMix ? 1 : 0, br = 1 - p.litVar * U.hash(i, fl, b.seed) * 0.75;
                  const q = Math.round(br * 5);
                  add('l' + cool + q, mulC(cool ? wc2 : wc1, (q / 5) * litMul), true, x, fy, ww, wh);
                } else {
                  const rf = night ? 0.72 : dusk ? 0.8 : 1, q = (U.hash(i * 3, fl, b.seed + 7) * 3) | 0;
                  add('u' + (cf === cL ? 'L' : 'R') + q, night || dusk ? mulC(cf, rf - q * 0.06) : mixC(glass, cf, q * 0.12 + (time === 'day' && U.hash(i, fl * 5, b.seed) < 0.08 ? 0.5 : 0)), false, x, fy, ww, wh);
                }
              }
            }
          }
          floorNo += nf + 3;
        }
        const ea = 1 - p.haze * d * 0.65;
        for (const e of buckets.values()) {
          c.fillStyle = rgb(e.col); c.fill(e.path);
          if (e.lit) { ec.save(); ec.clip(g.sil); ec.globalAlpha = ea; ec.fillStyle = rgb(e.col); ec.fill(e.path); ec.restore(); }
        }
      }
      function drawBand(c, b, g, fh, cL, cR, d) { // industrial halls: one row of clerestory windows
        const rg = g.regs[0];
        if (!rg) return;
        const y = rg[1] + (rg[3] - rg[1]) * 0.2, h = Math.max(0.8, fh * 0.7), on = litMul > 0 && U.hash(b.seed, 1, 2) < p.litRatio * 1.5;
        const col = on ? mulC(U.hash(b.seed, 2, 2) < p.coolMix ? wc2 : wc1, litMul * 0.85) : mulC(cL, night ? 0.7 : 0.6);
        c.fillStyle = rgb(col);
        const n = Math.max(2, Math.round((rg[2] - rg[0]) / (fh * 1.5)));
        const path = new Path2D();
        for (let i = 0; i < n; i++) { const x = rg[0] + (i + 0.15) * (rg[2] - rg[0]) / n; path.rect(x, y, (rg[2] - rg[0]) / n * 0.7, h); }
        c.fill(path);
        if (on) { ec.save(); ec.globalAlpha = 1 - p.haze * d * 0.65; ec.fillStyle = rgb(col); ec.fill(path); ec.restore(); }
      }
      function drawSmoke(c, list, col, d) {
        const sm = p.smoke, ang = -Math.PI / 2 + 0.6; // drifts up and to the right
        for (const s of list) {
          const rr = U.rng(s[4] * 1000 + Math.round(s[0]));
          const m = 9;
          for (let i = 0; i < m; i++) {
            const t = i / m, len = S * 0.35 * sm * t, rad = s[2] * (1.5 + t * 9 * sm) + S * 0.005;
            const x = s[0] + Math.cos(ang) * len + (rr() - 0.5) * rad * 0.6, y = s[1] + Math.sin(ang) * len * 0.8 - rad * 0.3;
            for (const ox of [-W, 0, W]) {
              if (x + ox + rad < 0 || x + ox - rad > W) continue;
              const gr = c.createRadialGradient(x + ox, y, 0, x + ox, y, rad);
              const sc = night ? mulC(col, 0.6) : mixC(col, haze, 0.5);
              const a = sm * 0.55 * (1 - t) * (0.7 + 0.3 * rr());
              gr.addColorStop(0, `rgba(${sc[0] | 0},${sc[1] | 0},${sc[2] | 0},${a})`); gr.addColorStop(1, `rgba(${sc[0] | 0},${sc[1] | 0},${sc[2] | 0},0)`);
              c.fillStyle = gr; c.fillRect(x + ox - rad, y - rad, rad * 2, rad * 2);
            }
          }
        }
      }

      // ---- aviation lights (only on tall things; checked against nearer layers via the emissive canvas order) ----
      if (p.aviation && litMul > 0 && out !== 'mask' && out !== 'depth') {
        let maxY = H;
        for (const L of lights) maxY = Math.min(maxY, L[1]);
        const thr = lerp(maxY, H, 0.45);
        for (const L of lights) {
          if (L[1] > thr || U.hash(L[4], 9, 1) < 0.3) continue;
          const rad = Math.max(0.8, S * 0.0045 * L[2]), a = (night ? 1 : 0.85) * (1 - p.haze * L[3] * 0.5);
          for (const ox of [-W, 0, W]) {
            const x = L[0] + ox;
            if (x < -rad * 8 || x > W + rad * 8) continue;
            for (const cc of [ctx, ec]) {
              const gr = cc.createRadialGradient(x, L[1], 0, x, L[1], rad * (2.5 + p.glow * 4));
              gr.addColorStop(0, `rgba(255,70,50,${a})`); gr.addColorStop(0.25, `rgba(255,40,30,${a * 0.6})`); gr.addColorStop(1, 'rgba(255,30,20,0)');
              cc.fillStyle = gr; cc.fillRect(x - rad * 7, L[1] - rad * 7, rad * 14, rad * 14);
              cc.fillStyle = `rgba(255,120,100,${a})`; cc.beginPath(); cc.arc(x, L[1], rad * 0.6, 0, Math.PI * 2); cc.fill();
            }
          }
        }
      }

      // ---- glow: blurred emissive, wrapped in X, added on top ----
      let glowC = null;
      if (p.glow > 0 && (litMul > 0 || p.neon > 0) && out !== 'mask' && out !== 'depth') {
        const ds = 4, gw = Math.ceil(W / ds), gh = Math.ceil(H / ds), pad = Math.ceil(gw * 0.1);
        const sm = U.canvas(gw + pad * 2, gh), sc = sm.getContext('2d');
        for (const ox of [-gw, 0, gw]) sc.drawImage(emis, pad + ox, 0, gw, gh);
        const bl = U.canvas(gw + pad * 2, gh), bc = bl.getContext('2d');
        bc.filter = `blur(${Math.max(1, (S / ds) * 0.012)}px)`;
        bc.drawImage(sm, 0, 0);
        bc.filter = 'none';
        glowC = U.canvas(W, H);
        const gc = glowC.getContext('2d');
        gc.globalAlpha = Math.min(1, p.glow * 1.4);
        gc.drawImage(bl, pad, 0, gw, gh, 0, 0, W, H);
        gc.globalCompositeOperation = 'lighter';
        bc.clearRect(0, 0, bl.width, gh);
        bc.filter = `blur(${Math.max(1, (S / ds) * 0.04)}px)`;
        bc.drawImage(sm, 0, 0);
        bc.filter = 'none';
        gc.globalAlpha = p.glow * 0.9;
        gc.drawImage(bl, pad, 0, gw, gh, 0, 0, W, H);
      }

      // ---- output ----
      if (out === 'emissive') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(emis, 0, 0);
        if (glowC) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowC, 0, 0); ctx.globalCompositeOperation = 'source-over'; }
        return;
      }
      if (glowC) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowC, 0, 0); ctx.globalCompositeOperation = 'source-over'; }
      if (out === 'mask' || out === 'depth') {
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
        return;
      }
      if (p.sky === 'gradient') {
        const gr = ctx.createLinearGradient(0, 0, 0, H);
        gr.addColorStop(0, p.skyColor); gr.addColorStop(1, p.skyColor2);
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'source-over';
      }
      if (out === 'grey') {
        const img = ctx.getImageData(0, 0, W, H), dd = img.data;
        for (let i = 0; i < dd.length; i += 4) { const v = dd[i] * 0.2126 + dd[i + 1] * 0.7152 + dd[i + 2] * 0.0722; dd[i] = dd[i + 1] = dd[i + 2] = v; }
        ctx.putImageData(img, 0, 0);
      }
    },
  });
})();
