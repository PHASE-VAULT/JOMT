/* Geometric symbol: sigils, emblems and cult / sect symbols built from a list of simple elements
   (rings, polygons, {n/k} polygrams, stars, arcs, crescents, lines, crosses, eyes, dots, chevrons,
   arrows, spirals, tridents). Every element can be repeated around the center and mirrored; elements
   can also cut shapes or lines out of what is below. A randomizer builds new symbols in several styles
   and symmetries. Rough / worn look: hand-drawn wobble, jitter (imperfect symmetry), and the shared
   noise (color + distortion) and grunge (wear, dirt, edge wear, scratches) stack.
   Units: positions and sizes are fractions of the symbol radius; line widths are px @ 256. */
(function () {
  'use strict';
  const U = window.UGTG;
  const RAD = Math.PI / 180;

  const TYPES = [
    ['ring', 'Circle'], ['polygon', 'Polygon'], ['polygram', 'Polygram {n/k}'], ['star', 'Star'], ['arc', 'Arc'],
    ['crescent', 'Crescent'], ['line', 'Line'], ['cross', 'Cross / rays'], ['eye', 'Eye'], ['dot', 'Dot'],
    ['chevron', 'Chevron'], ['arrow', 'Arrow'], ['spiral', 'Spiral'], ['trident', 'Trident'],
  ];
  const TYPE_NAME = Object.fromEntries(TYPES);
  const OPEN = new Set(['line', 'cross', 'chevron', 'arrow', 'spiral', 'trident', 'arc']); // no fill
  const HAS_SIDES = new Set(['polygon', 'polygram', 'star', 'cross']);
  const INNER = { star: 'Inner radius', arc: 'Arc length', crescent: 'Thickness', eye: 'Eye height', chevron: 'Opening', spiral: 'Turns' };

  /* ---------- element geometry: unit space, pointing "up" (-y), centered at 0,0 ---------- */
  const circle = (r, n = 72, cx = 0, cy = 0) => { const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * U.TAU; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return pts; };
  const ngon = (n, r, rot = 0) => { const pts = []; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + rot + (i / n) * U.TAU; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } return pts; };
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);

  function shape(e) {
    const s = e.size, n = Math.max(3, e.sides | 0), q = e.inner;
    switch (e.type) {
      case 'ring': return [{ pts: circle(s), closed: true }];
      case 'dot': return [{ pts: circle(s, 40), closed: true }];
      case 'polygon': return [{ pts: ngon(n, s), closed: true }];
      case 'star': {
        const pts = [];
        for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + (i / (n * 2)) * U.TAU, r = i % 2 ? s * U.clamp(q, 0.05, 1) : s; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
        return [{ pts, closed: true }];
      }
      case 'polygram': {
        const v = ngon(n, s), k = U.clamp(e.step | 0, 1, Math.floor((n - 1) / 2) || 1), g = gcd(n, k), out = [];
        for (let c = 0; c < g; c++) { const pts = []; for (let i = 0, j = c; i < n / g; i++, j = (j + k) % n) pts.push(v[j]); out.push({ pts, closed: true }); }
        return out;
      }
      case 'arc': {
        const span = U.clamp(q, 0.01, 1) * U.TAU, pts = [], m = Math.max(4, Math.ceil(span / (3 * RAD)));
        for (let i = 0; i <= m; i++) { const a = -Math.PI / 2 - span / 2 + (span * i) / m; pts.push([Math.cos(a) * s, Math.sin(a) * s]); }
        return [{ pts, closed: false }];
      }
      case 'crescent': {
        // outer circle minus the same circle shifted up; horns point up
        const o = s * U.clamp(0.15 + q * 1.2, 0.05, 1.95), f = Math.asin(U.clamp(o / 2 / s, 0, 1)), pts = [], m = 48;
        for (let i = 0; i <= m; i++) { const a = -f + ((Math.PI + 2 * f) * i) / m; pts.push([Math.cos(a) * s, Math.sin(a) * s]); }
        for (let i = 0; i <= m; i++) { const a = Math.PI - f - ((Math.PI - 2 * f) * i) / m; pts.push([Math.cos(a) * s, -o + Math.sin(a) * s]); }
        return [{ pts, closed: true }];
      }
      case 'line': return [{ pts: [[0, s], [0, -s]], closed: false }];
      case 'cross': { const out = []; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (i / n) * U.TAU; out.push({ pts: [[0, 0], [Math.cos(a) * s, Math.sin(a) * s]], closed: false }); } return out; }
      case 'eye': {
        const h = s * U.clamp(q, 0.1, 1) * 0.75, pts = [], m = 32;
        for (let i = 0; i <= m; i++) { const x = -s + (2 * s * i) / m; pts.push([x, -h * (1 - (x / s) ** 2)]); }
        for (let i = 1; i < m; i++) { const x = s - (2 * s * i) / m; pts.push([x, h * (1 - (x / s) ** 2)]); }
        return [{ pts, closed: true }, { pts: circle(h * 0.55, 40), closed: true }];
      }
      case 'chevron': { const w = s * (0.3 + q * 1.1); return [{ pts: [[-w, s * 0.45], [0, -s * 0.45], [w, s * 0.45]], closed: false }]; }
      case 'arrow': return [{ pts: [[0, s], [0, -s]], closed: false }, { pts: [[-s * 0.38, -s * 0.55], [0, -s], [s * 0.38, -s * 0.55]], closed: false }];
      case 'spiral': {
        const turns = 0.5 + q * 3.5, m = Math.ceil(turns * 72), pts = [];
        for (let i = 0; i <= m; i++) { const t = i / m, a = -Math.PI / 2 + t * turns * U.TAU; pts.push([Math.cos(a) * s * t, Math.sin(a) * s * t]); }
        return [{ pts, closed: false }];
      }
      case 'trident': {
        const cup = [], m = 24, w = s * 0.5, top = -s, bot = -s * 0.25;
        // U-shaped cross piece: down the left prong, round bottom, up the right prong
        cup.push([-w, top]);
        for (let i = 0; i <= m; i++) { const a = Math.PI - (Math.PI * i) / m; cup.push([Math.cos(a) * w, bot + Math.sin(a) * w * 0.55]); }
        cup.push([w, top]);
        return [{ pts: [[0, s], [0, -s]], closed: false }, { pts: cup, closed: false }];
      }
    }
    return [];
  }

  const ITEM = [
    { key: 'on', label: 'Enabled', type: 'bool', default: true },
    { key: 'type', label: 'Type', type: 'select', default: 'ring', options: TYPES },
    { key: 'mode', label: 'Draw as', type: 'select', default: 'stroke', options: [['stroke', 'Outline'], ['fill', 'Filled'], ['cut', 'Cut out (shape)'], ['cutline', 'Cut out (line)']], tip: 'Cut modes erase what the elements above in the list have drawn' },
    { key: 'size', label: 'Size', type: 'range', min: 0.01, max: 1.2, step: 0.005, default: 0.9, tip: 'Fraction of the symbol radius' },
    { key: 'dist', label: 'Distance from center', type: 'range', min: 0, max: 1.2, step: 0.005, default: 0 },
    { key: 'angle', label: 'Angle', type: 'range', min: -180, max: 180, step: 0.5, default: 0, tip: 'Position around the center, 0 = top' },
    { key: 'count', label: 'Copies around center', type: 'int', min: 1, max: 36, default: 1 },
    { key: 'spin', label: 'Rotation', type: 'range', min: -180, max: 180, step: 0.5, default: 0, tip: 'Rotation of the element itself (copies stay radially aligned)' },
    { key: 'sides', label: 'Sides / points', type: 'int', min: 3, max: 16, default: 3, show: (it) => HAS_SIDES.has(it.type) },
    { key: 'step', label: 'Polygram step', type: 'int', min: 1, max: 7, default: 2, show: (it) => it.type === 'polygram', tip: 'Connects every k-th point: {7/2}, {7/3} …' },
    { key: 'inner', label: 'Shape amount', type: 'range', min: 0, max: 1, step: 0.005, default: 0.5, show: (it) => it.type in INNER, tip: 'Star: inner radius · Arc: length · Crescent: thickness · Eye: height · Chevron: opening · Spiral: turns' },
    { key: 'width', label: 'Line width', type: 'range', min: 0.1, max: 5, step: 0.05, default: 1, tip: '× global line width' },
    { key: 'mirror', label: 'Mirror copy', type: 'bool', default: false, tip: 'Adds a copy mirrored across the vertical axis' },
  ];
  const itemDefaults = () => U.defaultsFor(ITEM);
  const el = (o) => Object.assign(itemDefaults(), o);

  /* ---------- randomizer ---------- */
  const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
  const rr = (r, a, b) => a + (b - a) * r();
  const chance = (r, x) => r() < x;
  const round = (v, d = 3) => +v.toFixed(d);

  function randomSymbol(p, r) {
    const style = p.rStyle === 'any' ? pick(r, ['occult', 'occult', 'tech', 'runic', 'minimal', 'tribal']) : p.rStyle;
    let sym = p.rSym === 'any' ? (style === 'runic' ? pick(r, ['mirror', 'mirror', 'radial']) : pick(r, ['radial', 'radial', 'radial', 'mirror', 'mirror', 'asym'])) : p.rSym;
    const cx = U.clamp(p.rComplex, 1, 10), E = [];
    const nR = style === 'tech' ? pick(r, [3, 4, 4, 6, 6, 8, 12]) : pick(r, [3, 3, 4, 5, 5, 6, 7, 8]);
    const n = sym === 'radial' ? nR : 1;
    const nn = sym === 'radial' ? nR : pick(r, [3, 3, 4, 5]); // polygon sides when the symbol itself isn't radial
    const mir = sym === 'mirror';
    const add = (o) => E.push(el(o));
    const extra = (k) => Math.round(rr(r, 0, 1) * k * (cx / 10)) ; // more elements with complexity

    if (style === 'occult') {
      if (chance(r, 0.8)) add({ type: 'ring', size: 0.96, width: rr(r, 0.8, 1.4) });
      if (chance(r, 0.45)) add({ type: 'ring', size: round(rr(r, 0.82, 0.88)), width: 0.5 });
      const mainR = round(rr(r, 0.7, 0.92));
      if (nn >= 5 && chance(r, 0.65)) add({ type: 'polygram', sides: nn, step: Math.floor((nn - 1) / 2), size: mainR, width: 0.9 });
      else add({ type: 'polygon', sides: nn, size: mainR, spin: chance(r, 0.3) ? 180 / (nn % 2 ? 1 : nn) : 0, width: 1 });
      if (chance(r, 0.7)) add({ type: pick(r, ['dot', 'ring', 'crescent', 'cross', 'dot', 'polygon']), sides: pick(r, [3, 4]), count: n === 1 ? nn : n, dist: mainR, size: round(rr(r, 0.06, 0.12)), mode: chance(r, 0.6) ? 'fill' : 'stroke', inner: 0.4, width: 0.8 });
      add({ type: pick(r, ['eye', 'dot', 'ring', 'crescent', 'polygram', 'cross']), sides: pick(r, [4, 5, 6]), step: 2, size: round(rr(r, 0.12, 0.3)), mode: chance(r, 0.5) ? 'fill' : 'stroke', inner: rr(r, 0.35, 0.65) });
      for (let i = 0, m = extra(3); i < m; i++) add({ type: pick(r, ['line', 'arc', 'dot', 'ring']), count: n === 1 ? pick(r, [2, 4, nn]) : n, angle: chance(r, 0.5) ? 180 / (n === 1 ? nn : n) : 0, dist: round(rr(r, 0.35, 1.05)), size: round(rr(r, 0.04, 0.16)), inner: 0.15, width: 0.7 });
    } else if (style === 'tech') {
      const k = Math.max(3, n === 1 ? pick(r, [3, 4, 6]) : n);
      add({ type: 'arc', count: k, size: 0.95, inner: round((1 / k) * rr(r, 0.55, 0.85)), angle: chance(r, 0.5) ? 180 / k : 0, width: rr(r, 1, 2) });
      if (chance(r, 0.7)) add({ type: 'ring', size: round(rr(r, 0.72, 0.82)), width: 0.4 });
      if (chance(r, 0.6)) add({ type: 'line', count: pick(r, [12, 16, 24, 36]), dist: 0.86, size: 0.04, width: 0.6 });
      add({ type: pick(r, ['chevron', 'polygon', 'dot', 'line']), sides: 4, count: k, dist: round(rr(r, 0.45, 0.62)), size: round(rr(r, 0.06, 0.13)), spin: 180, inner: 0.4, mode: chance(r, 0.5) ? 'fill' : 'stroke' });
      add({ type: pick(r, ['polygon', 'ring', 'dot', 'cross']), sides: pick(r, [4, 6]), size: round(rr(r, 0.12, 0.28)), spin: chance(r, 0.5) ? 45 : 0, mode: chance(r, 0.4) ? 'fill' : 'stroke' });
      for (let i = 0, m = extra(3); i < m; i++) add({ type: pick(r, ['arc', 'polygon', 'line', 'dot']), sides: 4, count: k * pick(r, [1, 2]), dist: round(rr(r, 0.3, 1)), size: round(rr(r, 0.03, 0.12)), inner: 0.06, width: 0.6, mode: 'fill' });
      if (chance(r, 0.3)) add({ type: 'line', mode: 'cutline', count: k, angle: 180 / k, dist: 0.7, size: 0.35, width: 1.4 });
    } else if (style === 'runic') {
      const tall = sym !== 'radial';
      if (tall) {
        add({ type: 'line', size: round(rr(r, 0.75, 0.95)), width: 1.5 });
        for (let i = 0, m = 1 + Math.round(rr(r, 0, 2 + cx / 4)); i < m; i++) {
          const up = chance(r, 0.5);
          add({ type: pick(r, ['line', 'line', 'chevron', 'arc']), dist: round(rr(r, 0.1, 0.7)), angle: up ? 0 : 180, size: round(rr(r, 0.2, 0.45)), spin: round(pick(r, [35, 45, 60, 90]) * (chance(r, 0.5) ? 1 : -1)), inner: 0.3, mirror: chance(r, 0.75), width: 1.3 });
        }
        if (chance(r, 0.4)) add({ type: 'dot', mode: 'fill', dist: round(rr(r, 0.5, 0.9)), angle: pick(r, [90, 180, 0]), size: 0.06, mirror: true });
      } else {
        add({ type: 'cross', sides: n, size: 0.9, width: 1.4 });
        add({ type: pick(r, ['chevron', 'line', 'arrow']), count: n, dist: round(rr(r, 0.45, 0.75)), size: round(rr(r, 0.15, 0.3)), spin: pick(r, [0, 45, 90, 180]), inner: 0.3, width: 1.2 });
      }
      if (chance(r, 0.35)) add({ type: pick(r, ['ring', 'polygon']), sides: pick(r, [4, 6]), size: 1.05, width: 0.7 });
    } else if (style === 'minimal') {
      add({ type: pick(r, ['ring', 'ring', 'polygon']), sides: nn, size: 0.92, width: rr(r, 1.2, 2.2) });
      add({ type: pick(r, ['line', 'polygon', 'dot', 'cross', 'crescent', 'eye']), sides: pick(r, [3, 4]), size: round(rr(r, 0.3, 0.9)), mode: chance(r, 0.4) ? 'fill' : 'stroke', inner: 0.5, width: 1.6 });
      if (chance(r, 0.5)) add({ type: pick(r, ['dot', 'line']), count: n === 1 ? pick(r, [1, 2, 3]) : n, dist: round(rr(r, 0.5, 0.8)), size: round(rr(r, 0.05, 0.12)), mode: 'fill', width: 1.6 });
    } else {
      // tribal / organic: crescents, spirals, arcs, eyes
      const k = n === 1 ? pick(r, [2, 3]) : n;
      add({ type: pick(r, ['spiral', 'crescent', 'eye', 'ring']), size: round(rr(r, 0.25, 0.4)), inner: rr(r, 0.3, 0.7), mode: chance(r, 0.4) ? 'fill' : 'stroke', width: 1.4 });
      add({ type: pick(r, ['crescent', 'arc', 'spiral', 'chevron']), count: k, dist: round(rr(r, 0.55, 0.72)), size: round(rr(r, 0.2, 0.32)), inner: rr(r, 0.25, 0.6), spin: pick(r, [0, 90, 180]), mode: chance(r, 0.5) ? 'fill' : 'stroke', mirror: mir && chance(r, 0.6), width: 1.3 });
      if (chance(r, 0.6)) add({ type: 'dot', count: k * pick(r, [1, 2]), dist: round(rr(r, 0.85, 0.98)), size: round(rr(r, 0.04, 0.08)), mode: 'fill', angle: 180 / k });
      for (let i = 0, m = extra(2); i < m; i++) add({ type: pick(r, ['arc', 'line', 'dot']), count: k, dist: round(rr(r, 0.4, 1)), size: round(rr(r, 0.06, 0.2)), inner: 0.2, angle: rr(r, 0, 60), width: 1 });
    }
    // symmetry post: mirror pairs off the axis; asymmetric: scatter loose bits around
    if (mir) for (const e of E) if (e.count === 1 && e.dist > 0 && e.angle % 180 !== 0) e.mirror = true;
    if (sym === 'asym') {
      for (let i = 0, m = 1 + extra(3); i < m; i++) add({ type: pick(r, ['dot', 'line', 'arc', 'chevron', 'ring', 'crescent']), dist: round(rr(r, 0.3, 1)), angle: round(rr(r, -180, 180)), size: round(rr(r, 0.05, 0.25)), spin: round(rr(r, -180, 180)), inner: rr(r, 0.1, 0.5), mode: chance(r, 0.4) ? 'fill' : 'stroke' });
      for (const e of E) if (chance(r, 0.4)) e.angle = round(e.angle + rr(r, -40, 40));
    }
    for (const e of E) { e.width = round(e.width, 2); e.inner = round(e.inner); }
    return E.slice(0, 16);
  }

  function mutate(items, r) {
    const out = U.clone(items);
    for (const e of out) {
      if (chance(r, 0.6)) e.size = round(U.clamp(e.size * rr(r, 0.8, 1.2), 0.01, 1.2));
      if (e.dist > 0 && chance(r, 0.5)) e.dist = round(U.clamp(e.dist + rr(r, -0.12, 0.12), 0, 1.2));
      if (chance(r, 0.3)) e.spin = round(U.clamp(e.spin + pick(r, [-45, -30, 30, 45, 180]), -180, 180));
      if (chance(r, 0.25)) e.mode = e.mode === 'stroke' ? 'fill' : e.mode === 'fill' ? 'stroke' : e.mode;
      if (chance(r, 0.2) && e.count > 1) e.count = Math.max(2, e.count + pick(r, [-1, 1]));
      if (chance(r, 0.25)) e.inner = round(U.clamp(e.inner + rr(r, -0.2, 0.2)));
      if (chance(r, 0.12)) e.type = pick(r, ['dot', 'ring', 'polygon', 'crescent', 'cross', 'line', 'chevron']);
    }
    return out;
  }

  /* ---------- rendering ---------- */
  function buildPaths(p, W, H) {
    const S = Math.min(W, H), R = (S / 2) * p.scale, cx = W / 2, cy = H / 2, k = S / 256;
    const jr = U.rng((p.seed | 0) + 77), grot = p.rotation * RAD;
    const ws = p.wobbleScale, wa = p.wobble * 0.06, seed = p.seed | 0;
    const out = [];
    for (const e of p.elements) {
      if (!e.on) continue;
      const base = shape(e), copies = Math.max(1, e.count | 0), mirrors = e.mirror || p.mirrorAll ? [1, -1] : [1];
      for (const mx of mirrors) {
        for (let i = 0; i < copies; i++) {
          const a = (e.angle + (360 * i) / copies) * RAD;
          // jitter: imperfect hand-made symmetry, per copy
          const ja = (jr() - 0.5) * p.jitter * 0.5, jd = (jr() - 0.5) * p.jitter * 0.12, js = 1 + (jr() - 0.5) * p.jitter * 0.3;
          const px = Math.sin(a + ja) * (e.dist + jd), py = -Math.cos(a + ja) * (e.dist + jd);
          const o = a + ja + e.spin * RAD + (jr() - 0.5) * p.jitter * 0.4, co = Math.cos(o), so = Math.sin(o);
          const polys = base.map((pl) => {
            let pts = pl.pts.map(([x, y]) => {
              x *= js; y *= js;
              let X = px + x * co - y * so, Y = py + x * so + y * co;
              X *= mx;
              return [X, Y];
            });
            // densify so the wobble can bend straight edges
            if (wa > 0) {
              const dense = [], n = pts.length, segs = pl.closed ? n : n - 1;
              for (let j = 0; j < segs; j++) {
                const A = pts[j], B = pts[(j + 1) % n], m = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / 0.02));
                for (let t = 0; t < m; t++) dense.push([A[0] + ((B[0] - A[0]) * t) / m, A[1] + ((B[1] - A[1]) * t) / m]);
              }
              if (!pl.closed) dense.push(pts[n - 1]);
              pts = dense.map(([x, y]) => [x + U.perlin(x * ws + 5.3, y * ws, 0, 0, seed + 11) * wa, y + U.perlin(x * ws, y * ws + 7.1, 0, 0, seed + 12) * wa]);
            }
            // global rotation, then to canvas px
            const cg = Math.cos(grot), sg = Math.sin(grot);
            return { pts: pts.map(([x, y]) => [cx + (x * cg - y * sg) * R, cy + (x * sg + y * cg) * R]), closed: pl.closed };
          });
          out.push({ e, polys, lw: Math.max(0.5, p.lineW * k * e.width) });
        }
      }
    }
    return out;
  }

  function trace(c, polys) {
    c.beginPath();
    for (const pl of polys) {
      pl.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      if (pl.closed) c.closePath();
    }
  }

  function drawSymbol(c, p, W, H, color) {
    const S = Math.min(W, H), k = S / 256;
    c.lineCap = p.lineStyle === 'sharp' ? 'butt' : 'round';
    c.lineJoin = p.lineStyle === 'sharp' ? 'miter' : 'round';
    c.miterLimit = 4;
    for (const it of buildPaths(p, W, H)) {
      const { e, polys, lw } = it, open = OPEN.has(e.type);
      trace(c, polys);
      c.globalCompositeOperation = e.mode === 'cut' || e.mode === 'cutline' ? 'destination-out' : 'source-over';
      c.fillStyle = c.strokeStyle = color;
      c.lineWidth = lw;
      if ((e.mode === 'fill' || e.mode === 'cut') && !open) { c.fill('evenodd'); if (e.mode === 'cut') { c.lineWidth = lw * 0.5; c.stroke(); } }
      else { if (e.mode === 'cutline') c.lineWidth = lw + p.cutGap * k; c.stroke(); }
    }
    c.globalCompositeOperation = 'source-over';
  }

  function badgePath(c, p, W, H) {
    const S = Math.min(W, H), R = (S / 2) * p.badgeSize, cx = W / 2, cy = H / 2;
    c.beginPath();
    if (p.badge === 'circle') c.arc(cx, cy, R, 0, U.TAU);
    else {
      const n = { square: 4, diamond: 4, hexagon: 6, triangle: 3 }[p.badge], rot = p.badge === 'square' ? Math.PI / 4 : 0;
      const pts = ngon(n, R * (p.badge === 'square' ? Math.SQRT2 : 1), rot).map(([x, y]) => [cx + x, cy + y]);
      U.polyPath(c, pts, R * p.badgeRound * 0.5);
    }
  }

  U.register({
    id: 'symbol',
    name: 'Geometric Symbol',
    desc: 'Geometric sigils, emblems and cult symbols from rings, polygrams, eyes and crescents, with symmetry and wear',
    uses: ['Ritual circles, cult markings and faction emblems for horror, fantasy and sci-fi games, used as wall and floor decals or on props.', 'Logos, tattoo designs and esoteric illustrations.'],
    tags: ['Horror', 'UI', 'Decals'],
    bg: 'gray',
    icon: U.icon('<circle cx="12" cy="12" r="9"/><polygon points="12,4.5 18.5,16 5.5,16"/><circle cx="12" cy="12.4" r="1.6" fill="currentColor"/>'),
    params: [
      { type: 'section', label: 'Symbol' },
      {
        key: '_rand', type: 'button', label: 'Randomize', buttons: [
          { label: 'New random symbol', icon: 'dice', primary: true, tip: 'Builds a new symbol from the randomizer settings below; colors and wear stay', run: (v) => { v.elements = randomSymbol(v, U.rng((Math.random() * 1e9) | 0)); } },
          { label: 'Mutate', tip: 'Small random changes to the current elements', run: (v) => { v.elements = mutate(v.elements, U.rng((Math.random() * 1e9) | 0)); } },
        ],
      },
      { key: 'rStyle', label: 'Randomizer style', type: 'select', default: 'any', options: [['any', 'Any'], ['occult', 'Occult / sect'], ['tech', 'Tech / sci-fi'], ['runic', 'Runic'], ['tribal', 'Tribal / organic'], ['minimal', 'Minimal']] },
      { key: 'rSym', label: 'Randomizer symmetry', type: 'select', default: 'any', options: [['any', 'Any'], ['radial', 'Radial'], ['mirror', 'Mirrored'], ['asym', 'Asymmetric']] },
      { key: 'rComplex', label: 'Randomizer complexity', type: 'int', min: 1, max: 10, default: 5 },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.1, max: 1.2, step: 0.005, default: 0.82, tip: 'Symbol radius as a fraction of half the short side' },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 0.5, default: 0 },
      { key: 'mirrorAll', label: 'Mirror everything', type: 'bool', default: false, tip: 'Adds a mirrored copy of every element (left / right symmetry)' },
      { type: 'section', label: 'Elements' },
      { key: 'elements', label: 'Elements', type: 'list', itemLabel: 'Element', max: 16, item: ITEM, itemSummary: (it) => U.t(TYPE_NAME[it.type] || it.type) + (it.count > 1 ? ' ×' + it.count : '') + (it.mode !== 'stroke' ? ' · ' + U.t({ fill: 'Filled', cut: 'Cut out (shape)', cutline: 'Cut out (line)' }[it.mode]) : ''),
        default: [
          el({ type: 'ring', size: 0.96, width: 1.2 }),
          el({ type: 'ring', size: 0.86, width: 0.5 }),
          el({ type: 'polygon', sides: 3, size: 0.86 }),
          el({ type: 'polygon', sides: 3, size: 0.86, spin: 180, width: 0.5 }),
          el({ type: 'eye', size: 0.26, inner: 0.55, mode: 'fill' }),
          el({ type: 'dot', size: 0.07, dist: 0.86, count: 3, angle: 60, mode: 'fill' }),
        ],
      },
      { type: 'section', label: 'Style' },
      { key: 'color', label: 'Color', type: 'color', default: '#e8e2d0' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
      { key: 'lineW', label: 'Line width', type: 'range', min: 0.5, max: 30, step: 0.25, default: 6, tip: 'px @ 256' },
      { key: 'lineStyle', label: 'Line ends', type: 'select', default: 'round', options: [['round', 'Round'], ['sharp', 'Sharp']] },
      { key: 'cutGap', label: 'Cut line gap', type: 'range', min: 0, max: 20, step: 0.25, default: 4, tip: 'Extra width of "cut out (line)" elements, px @ 256' },
      { key: 'outlineW', label: 'Outline', type: 'range', min: 0, max: 20, step: 0.25, default: 0, tip: 'Contour around the whole symbol, px @ 256' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#111111', show: (p) => p.outlineW > 0 },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 1, max: 60, step: 0.5, default: 14, show: (p) => p.glow > 0, tip: 'px @ 256' },
      { key: 'glowColor', label: 'Glow color', type: 'color', default: '#ff3b2a', show: (p) => p.glow > 0 },
      { key: 'badge', label: 'Badge', type: 'select', default: 'none', options: [['none', 'None'], ['circle', 'Circle'], ['square', 'Square'], ['diamond', 'Diamond'], ['hexagon', 'Hexagon'], ['triangle', 'Triangle']], tip: 'Solid shape behind the symbol' },
      { key: 'badgeColor', label: 'Badge color', type: 'color', default: '#2a1d1a', show: (p) => p.badge !== 'none' },
      { key: 'badgeSize', label: 'Badge size', type: 'range', min: 0.2, max: 1, step: 0.005, default: 0.98, show: (p) => p.badge !== 'none' },
      { key: 'badgeRound', label: 'Badge roundness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1, show: (p) => p.badge !== 'none' && p.badge !== 'circle' },
      { key: 'bgMode', label: 'Background', type: 'select', default: 'none', options: [['none', 'Transparent'], ['color', 'Color']] },
      { key: 'bgColor', label: 'Background color', type: 'color', default: '#6f6a60', show: (p) => p.bgMode === 'color' },
      { type: 'section', label: 'Hand-made' },
      { key: 'wobble', label: 'Line wobble', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Hand-drawn, shaky lines' },
      { key: 'wobbleScale', label: 'Wobble scale', type: 'range', min: 0.5, max: 20, step: 0.1, default: 5, show: (p) => p.wobble > 0 },
      { key: 'jitter', label: 'Imperfection', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Random offset, rotation and size per copy: breaks the perfect symmetry' },
      ...U.wearParams(),
      { key: 'seed', label: 'Seed', type: 'seed', default: 13 },
    ],
    presets: [
      { name: 'Cult sigil (worn)', group: 'Occult', values: { color: '#d8cfb8', wobble: 0.25, jitter: 0.25, grunge: 0.22, grungeType: 'chipped', grungeScale: 5, edgeWear: 0.2, edgeWidth: 2, scratches: 0.3, distort: 0.08, seed: 3 } },
      { name: 'Blood ritual circle', group: 'Occult', values: { color: '#7a0b0b', lineW: 5, elements: [{ type: 'ring', size: 0.98, width: 1.3 }, { type: 'ring', size: 0.88, width: 0.6 }, { type: 'polygram', sides: 5, step: 2, size: 0.88 }, { type: 'dot', size: 0.06, dist: 0.93, count: 5, angle: 36, mode: 'fill' }, { type: 'crescent', size: 0.16, inner: 0.35, mode: 'fill' }], wobble: 0.45, wobbleScale: 4, jitter: 0.2, colorNoise: 0.5, noiseColor: '#2b0202', grunge: 0.22, grungeType: 'blotchy', grungeScale: 6, edgeWear: 0.2, edgeWidth: 2, distort: 0.12, seed: 6 } },
      { name: 'All-seeing eye', group: 'Occult', values: { color: '#e9c46a', elements: [{ type: 'polygon', sides: 3, size: 0.95, width: 1.4 }, { type: 'eye', size: 0.38, inner: 0.6, dist: 0.12, angle: 180, mode: 'fill' }, { type: 'line', count: 15, dist: 0.95, size: 0.07, width: 0.7, angle: 12 }], glow: 0.35, glowSize: 16, glowColor: '#ffb347' } },
      { name: 'Heptagram seal', group: 'Occult', values: { color: '#cfc6b0', lineW: 4, elements: [{ type: 'ring', size: 1, width: 1.2 }, { type: 'ring', size: 0.9, width: 0.6 }, { type: 'polygram', sides: 7, step: 3, size: 0.9 }, { type: 'polygram', sides: 7, step: 2, size: 0.9, width: 0.5 }, { type: 'ring', size: 0.22 }, { type: 'dot', size: 0.07, mode: 'fill' }], grunge: 0.25, grungeType: 'speckle', grungeScale: 24, seed: 9 } },
      { name: 'Moon sect', group: 'Occult', values: { color: '#d9dde6', elements: [{ type: 'crescent', size: 0.55, inner: 0.25, mode: 'fill', spin: 0 }, { type: 'dot', size: 0.07, dist: 0.85, count: 7, mode: 'fill', angle: 0 }, { type: 'line', size: 0.32, dist: 0.6, angle: 180 }, { type: 'line', size: 0.15, dist: 0.65, angle: 180, spin: 90 }], glow: 0.25, glowSize: 18, glowColor: '#8fb2ff' } },
      { name: 'Painted on wall', group: 'Occult', values: { color: '#1b1714', bgMode: 'color', bgColor: '#8a8478', lineW: 8, wobble: 0.5, wobbleScale: 3, jitter: 0.35, distort: 0.12, grunge: 0.2, grungeType: 'streaks', grungeScale: 5, edgeWear: 0.2, edgeWidth: 2, seed: 4 } },
      { name: 'Branded scar', group: 'Occult', values: { color: '#5a1f16', lineW: 9, elements: [{ type: 'ring', size: 0.92 }, { type: 'cross', sides: 4, size: 0.92, spin: 45 }, { type: 'dot', size: 0.14, mode: 'fill' }], colorNoise: 0.6, noiseColor: '#2a0905', noiseScale: 10, brightNoise: 0.2, distort: 0.18, grunge: 0.2, edgeWear: 0.3, edgeWidth: 2, glow: 0.4, glowSize: 10, glowColor: '#7a1a0f', seed: 18 } },
      { name: 'Runic stave', group: 'Runic', values: { color: '#d6d2c4', lineW: 9, lineStyle: 'sharp', elements: [{ type: 'line', size: 0.9, width: 1.4 }, { type: 'line', size: 0.4, dist: 0.45, angle: 0, spin: 45, mirror: true, width: 1.3 }, { type: 'line', size: 0.35, dist: 0.3, angle: 180, spin: -45, mirror: true, width: 1.3 }], grunge: 0.18, grungeType: 'chipped', grungeScale: 7, edgeWear: 0.2, edgeWidth: 2, seed: 7 } },
      { name: 'Carved stone rune', group: 'Runic', values: { color: '#2b2a27', bgMode: 'color', bgColor: '#7d7a72', badge: 'circle', badgeColor: '#5f5c55', badgeSize: 0.97, lineW: 10, lineStyle: 'sharp', elements: [{ type: 'line', size: 0.75, width: 1.3 }, { type: 'chevron', size: 0.55, dist: 0.25, inner: 0.35, angle: 0, width: 1.2 }, { type: 'chevron', size: 0.55, dist: 0.25, inner: 0.35, angle: 180, spin: 180, width: 1.2 }], brightNoise: 0.15, noiseScale: 8, grunge: 0.2, grungeType: 'cracks', grungeScale: 3.5, dirt: 0.4, seed: 22 } },
      { name: 'Tech faction emblem', group: 'Sci-fi', values: { color: '#3cf2ff', lineW: 4, lineStyle: 'sharp', elements: [{ type: 'arc', count: 6, size: 0.95, inner: 0.12, angle: 30, width: 1.8 }, { type: 'ring', size: 0.78, width: 0.4 }, { type: 'line', count: 24, dist: 0.86, size: 0.035, width: 0.6 }, { type: 'chevron', count: 3, dist: 0.5, size: 0.12, spin: 180, inner: 0.4, mode: 'stroke' }, { type: 'polygon', sides: 6, size: 0.22, mode: 'fill' }, { type: 'polygon', sides: 6, size: 0.12, mode: 'cut' }], glow: 0.5, glowSize: 12, glowColor: '#00d8ff' } },
      { name: 'Corporate hex', group: 'Sci-fi', values: { color: '#f2f2f2', lineW: 6, lineStyle: 'sharp', elements: [{ type: 'polygon', sides: 6, size: 0.95, mode: 'fill' }, { type: 'polygon', sides: 3, size: 0.55, mode: 'cut' }, { type: 'line', count: 3, angle: 60, dist: 0.62, size: 0.3, mode: 'cutline', width: 1 }] } },
      { name: 'Hazard cult', group: 'Sci-fi', values: { color: '#f2b705', lineW: 7, elements: [{ type: 'ring', size: 0.95, width: 1.2 }, { type: 'arc', count: 3, size: 0.55, inner: 0.22, angle: 0, width: 4 }, { type: 'dot', size: 0.12, mode: 'fill' }, { type: 'line', count: 3, angle: 60, dist: 0.5, size: 0.5, mode: 'cutline' }], brightNoise: 0.15, grunge: 0.18, grungeType: 'chipped', edgeWear: 0.2, edgeWidth: 2, scratches: 0.3, seed: 15 } },
      { name: 'Sun disc', group: 'Tribal', values: { color: '#e07a2f', lineW: 6, elements: [{ type: 'dot', size: 0.36, mode: 'fill' }, { type: 'spiral', size: 0.3, inner: 0.45, mode: 'cutline', width: 0.6 }, { type: 'polygon', sides: 3, count: 12, dist: 0.62, size: 0.14, mode: 'fill' }, { type: 'ring', size: 0.85, width: 0.6 }], wobble: 0.2, jitter: 0.3, seed: 2 } },
      { name: 'Spiral totem', group: 'Tribal', values: { color: '#3b2a1e', bgMode: 'color', bgColor: '#c2a27a', lineW: 9, elements: [{ type: 'spiral', size: 0.35, inner: 0.6 }, { type: 'crescent', count: 3, dist: 0.68, size: 0.24, inner: 0.35, spin: 180, mode: 'fill' }, { type: 'dot', count: 6, dist: 0.95, size: 0.05, mode: 'fill', angle: 30 }], wobble: 0.35, wobbleScale: 4, jitter: 0.25, grunge: 0.2, grungeType: 'speckle', grungeScale: 20, seed: 5 } },
      { name: 'Clean minimal mark', group: 'Minimal', values: { color: '#ffffff', lineW: 10, elements: [{ type: 'ring', size: 0.9 }, { type: 'line', size: 0.55, angle: 0 }, { type: 'line', size: 0.3, dist: 0.18, spin: 90 }] } },
      { name: 'Stencil badge', group: 'Minimal', values: { color: '#151515', badge: 'diamond', badgeColor: '#d8c39a', badgeSize: 0.98, badgeRound: 0.15, scale: 0.6, lineW: 12, lineStyle: 'sharp', elements: [{ type: 'star', sides: 5, inner: 0.4, size: 0.95, mode: 'fill' }, { type: 'ring', size: 0.2, mode: 'cut' }, { type: 'line', count: 5, dist: 0.62, size: 0.3, mode: 'cutline', width: 0.35 }], grunge: 0.2, grungeType: 'blotchy', edgeWear: 0.25, edgeWidth: 2, seed: 11 } },
    ],
    render(ctx, W, H, p, opts) {
      const S = Math.min(W, H), k = S / 256;
      const A = U.canvas(W, H), a = A.getContext('2d');
      if (p.badge !== 'none') { badgePath(a, p, W, H); a.fillStyle = p.badgeColor; a.fill(); }
      // the symbol is drawn on its own layer so its cut modes don't punch through the badge
      const Sy = U.canvas(W, H);
      drawSymbol(Sy.getContext('2d'), p, W, H, p.color);
      if (p.outlineW > 0) {
        // contour: the symbol's silhouette stamped around a circle of offsets
        const ow = p.outlineW * k, n = Math.max(12, Math.ceil(ow * 3));
        const sil = U.canvas(W, H), sc = sil.getContext('2d');
        sc.drawImage(Sy, 0, 0); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = p.outlineColor; sc.fillRect(0, 0, W, H);
        for (let i = 0; i < n; i++) { const t = (i / n) * U.TAU; a.drawImage(sil, Math.cos(t) * ow, Math.sin(t) * ow); }
      }
      if (p.glow > 0) {
        a.save(); a.shadowColor = U.rgba(p.glowColor, Math.min(1, p.glow * 1.2)); a.shadowBlur = p.glowSize * k;
        a.drawImage(Sy, 0, 0); if (p.glow > 0.5) a.drawImage(Sy, 0, 0);
        a.restore();
      }
      a.drawImage(Sy, 0, 0);
      let out = A;
      if (U.wearActive(p)) {
        U.wearScratches(a, W, H, p, S);
        out = U.imageCanvas(U.wearApply(A, p, U.wearFields(W, H, p, S)));
      }
      if (p.bgMode === 'color') { ctx.fillStyle = p.bgColor; ctx.fillRect(0, 0, W, H); }
      ctx.globalAlpha = p.opacity;
      ctx.drawImage(out, 0, 0);
      ctx.globalAlpha = 1;
    },
  });
})();
