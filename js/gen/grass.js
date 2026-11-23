/* Grass: a tileable top-down ground of scattered blades, or a side-view grass card (blades
   growing from the bottom edge, transparent background) that tiles horizontally.
   Blades crossing an edge are drawn again on the opposite side. The ground style can scatter fall
   leaves (oval, pointed, maple, oak, birch) and needles in and on the grass: each has a depth and is
   sorted together with the blades, so some lie inside the grass and some on top; they tile too. */
(function () {
  'use strict';
  const U = window.UGTG;

  const PRESETS = {
    lush: { root: '#1f3d14', tip: '#7cbf3a', dry: '#b5a24a', soil: '#2b2414', dryAmt: 0.12 },
    meadow: { root: '#2e4a1a', tip: '#a8d05a', dry: '#d8c46a', soil: '#3a2f1c', dryAmt: 0.25 },
    dry: { root: '#5a4a24', tip: '#d9c27a', dry: '#8a7a3a', soil: '#5c4a30', dryAmt: 0.45 },
    stylized: { root: '#1a5c3a', tip: '#8ff07a', dry: '#f0e070', soil: '#1e3a24', dryAmt: 0.08 },
  };
  const isGround = (p) => p.style === 'ground';
  const isCard = (p) => p.style === 'card';

  const LEAF_SHAPES = ['oval', 'pointed', 'maple', 'oak', 'birch'];
  function leafOutline(shape, r) {
    const pts = [];
    if (shape === 'maple') {
      // palmate: five pointed lobes fanning out from the stem (base at -x, main lobe toward +x)
      const lobes = [[0, 1], [0.95, 0.85], [-0.95, 0.85], [1.85, 0.52], [-1.85, 0.52]];
      for (let i = 0; i <= 44; i++) {
        const th = -2.55 + (5.1 * i) / 44;
        let rad = 0.42;
        for (const [la, lr] of lobes) rad = Math.max(rad, lr * Math.pow(Math.max(0, Math.cos((th - la) * 1.7)), 2.4));
        rad *= 1 + (i % 2 === 0 ? 0.04 : 0) + (r() - 0.5) * 0.03; // small teeth
        pts.push([Math.cos(th) * rad * 1.1 - 0.5, Math.sin(th) * rad * 1.1]);
      }
      pts.push([-0.78, 0]);
      return pts;
    }
    const n = 16, w = shape === 'birch' ? 0.62 : shape === 'oak' ? 0.42 : shape === 'pointed' ? 0.34 : 0.45;
    const prof = (t) => {
      // t 0..1 base -> tip
      let hw = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.98 + 0.02)), shape === 'pointed' ? 1.25 : 0.75);
      if (shape === 'pointed' || shape === 'birch') hw *= 1 - 0.35 * t; // widest near the base
      if (shape === 'oak') hw *= 0.72 + 0.28 * Math.abs(Math.sin(t * Math.PI * 4.5)); // wavy lobes
      if (shape === 'birch') hw *= 1 + 0.06 * Math.sin(t * Math.PI * 14); // fine teeth
      return hw * w;
    };
    for (let i = 0; i <= n; i++) { const t = i / n; pts.push([-1 + 2 * t, -prof(t)]); }
    for (let i = n - 1; i > 0; i--) { const t = i / n; pts.push([-1 + 2 * t, prof(t)]); }
    return pts;
  }

  const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c, k) => `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`;

  /* fall leaves and needles: positions in tile fractions, depth z (> 1 = on top of all blades).
     Leaves are single items; needles are grouped into a few depth layers and drawn batched (one path
     per color shade per layer), which keeps thousands of needles fast. */
  const NEEDLE_LAYERS = 10, NEEDLE_SHADES = 4;
  /* leaf outlines are built once as Path2D (a few variants per shape) and reused with transforms */
  const VARIANTS = 6, POOL = new Map();
  function leafPaths(shape, v) {
    const key = shape + v;
    if (!POOL.has(key)) {
      const r = U.rng(9173 + v * 31 + shape.length * 7), pts = leafOutline(shape, r);
      const mk = (q) => { const P = new Path2D(); q.forEach(([a, b], i) => (i ? P.lineTo(a, b) : P.moveTo(a, b))); P.closePath(); return P; };
      POOL.set(key, { full: mk(pts), half: [mk(pts.filter(([, y]) => y >= 0)), mk(pts.filter(([, y]) => y <= 0))] });
    }
    return POOL.get(key);
  }
  function scatterFall(p, W, H, S, k, patch) {
    const out = [], r = U.rng(p.seed * 131 + 17);
    const cols = [U.hex(p.leafA), U.hex(p.leafB), U.hex(p.leafC)], brown = U.hex(p.leafBrown);
    const place = () => {
      // drifts: reject in low-noise areas (tileable patch noise)
      for (let t = 0; t < 12; t++) {
        const u = r(), v = r();
        if (p.leafClump <= 0 || r() < U.lerp(1, U.smoothstep(0.38, 0.66, patch(u, v, 51)), p.leafClump)) return [u, v];
      }
      return [r(), r()];
    };
    const depth = () => (r() < p.onTop ? 1 + r() : 0.25 + r() * 0.75);
    for (let i = 0; i < p.leaves; i++) {
      const [u, v] = place();
      const shape = p.leafShape === 'mixed' ? LEAF_SHAPES[(r() * LEAF_SHAPES.length) | 0] : p.leafShape;
      const size = p.leafSize * k * (1 - p.leafSizeVar * r()) * (shape === 'birch' ? 0.85 : 1);
      // color: one of three, nudged toward a neighbor, some dried to brown
      const ci = (r() * 3) | 0, dried = r() < p.brownAmt;
      let c = mixC(cols[ci], cols[(ci + 1) % 3], r() * p.leafVar);
      if (dried) c = mixC(c, brown, 0.55 + r() * 0.45);
      c = c.map((x) => x * (1 + (r() - 0.5) * p.leafVar * 0.4));
      const paths = leafPaths(shape, (r() * VARIANTS) | 0), half = paths.half[r() < 0.5 ? 0 : 1];
      // dark spots on dried / older leaves
      const spots = [];
      const nSpots = Math.round(p.leafDetail * (dried ? 3 + r() * 5 : r() < 0.3 ? 1 + r() * 2 : 0));
      for (let j = 0; j < nSpots; j++) spots.push([-0.6 + r() * 1.2, (r() - 0.5) * 0.45, 0.04 + r() * 0.08]);
      out.push({ fall: 'leaf', u, v, z: depth(), shape, size, rot: r() * U.TAU, aspect: 0.85 + r() * 0.3, c, dried, full: paths.full, half, spots });
    }
    if (p.needles > 0) {
      const n1 = U.hex(p.needleColor), n2 = U.hex(p.needleColor2);
      const layers = [];
      for (let l = 0; l <= NEEDLE_LAYERS; l++) {
        // NEEDLE_LAYERS layers inside the grass (z 0.25..1) + one on top
        const z = l < NEEDLE_LAYERS ? 0.25 + (0.75 * (l + 0.5)) / NEEDLE_LAYERS : 1.5;
        layers.push({ fall: 'needles', z, shades: Array.from({ length: NEEDLE_SHADES }, (_, s) => ({ c: mixC(n1, n2, s / (NEEDLE_SHADES - 1)), segs: [] })) });
      }
      for (let i = 0; i < p.needles; i++) {
        const [u, v] = place();
        const top = r() < p.onTop, layer = layers[top ? NEEDLE_LAYERS : Math.min(NEEDLE_LAYERS - 1, (r() * NEEDLE_LAYERS) | 0)];
        const len = p.needleLen * k * (0.6 + r() * 0.6), rot = r() * U.TAU, bend = (r() - 0.5) * 0.5;
        const pair = r() < p.needlePairs, spread = 0.15 + r() * 0.35, shade = layer.shades[(r() * NEEDLE_SHADES) | 0];
        const x = u * W, y = v * H;
        for (const a of pair ? [rot - spread / 2, rot + spread / 2] : [rot]) {
          const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
          shade.segs.push([x, y, x + ex / 2 - ey * bend * 0.3, y + ey / 2 + ex * bend * 0.3, x + ex, y + ey, len]);
        }
      }
      out.push(...layers);
    }
    return out;
  }

  // offsets at which something of radius `ext` at (x, y) must be drawn so the texture tiles
  function tileOffsets(x, y, ext, W, H) {
    const o = [];
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const X = x + ox * W, Y = y + oy * H;
      if (X + ext >= 0 && X - ext <= W && Y + ext >= 0 && Y - ext <= H) o.push([ox * W, oy * H]);
    }
    return o;
  }

  function drawNeedles(ctx, layer, W, H, p, k) {
    const shadeF = layer.z >= 1 ? 1 : 1 - p.depth * 0.55 * (1 - layer.z);
    const lw = Math.max(0.6, 1.3 * k);
    const trace = (segs, sx, sy) => {
      ctx.beginPath();
      for (const [x0, y0, cx, cy, x1, y1, len] of segs) {
        for (const [dx, dy] of tileOffsets(x0, y0, len, W, H)) {
          ctx.moveTo(x0 + dx + sx, y0 + dy + sy); ctx.quadraticCurveTo(cx + dx + sx, cy + dy + sy, x1 + dx + sx, y1 + dy + sy);
        }
      }
    };
    ctx.lineCap = 'round';
    if (p.leafShadow > 0) {
      // cheap soft-ish shadow: two offset passes, no blur
      ctx.strokeStyle = `rgba(0,0,0,${0.22 * p.leafShadow})`;
      for (const s of [1, 1.8]) { ctx.lineWidth = lw * (1 + s * 0.4); for (const sh of layer.shades) { trace(sh.segs, 0.8 * k * s, k * s); ctx.stroke(); } }
    }
    ctx.lineWidth = lw;
    for (const sh of layer.shades) {
      if (!sh.segs.length) continue;
      ctx.strokeStyle = css(sh.c, shadeF);
      trace(sh.segs, 0, 0); ctx.stroke();
    }
  }

  function drawLeaf(ctx, f, W, H, p, k) {
    const shadeF = f.z >= 1 ? 1 : 1 - p.depth * 0.55 * (1 - f.z), det = p.leafDetail;
    const sx = f.size / 2, sy = (f.size / 2) * f.aspect, cr = Math.cos(f.rot), sr = Math.sin(f.rot);
    // colors: darker, slightly browned base -> lighter tip
    const base = mixC(f.c, U.hex(p.leafBrown), 0.25 * det).map((v) => v * (1 - 0.18 * det));
    const tip = f.c.map((v) => v * (1 + 0.1 * det));
    for (const [dx, dy] of tileOffsets(f.u * W, f.v * H, f.size, W, H)) {
      const x = f.u * W + dx, y = f.v * H + dy;
      if (p.leafShadow > 0) {
        // two offset passes = a soft contact shadow without canvas blur
        for (const s of [1, 2]) {
          ctx.setTransform(cr * sx * 1.04, sr * sx * 1.04, -sr * sy * 1.04, cr * sy * 1.04, x + 1.1 * k * s, y + 1.4 * k * s);
          ctx.fillStyle = `rgba(0,0,0,${0.2 * p.leafShadow})`;
          ctx.fill(f.full);
        }
      }
      ctx.setTransform(cr * sx, sr * sx, -sr * sy, cr * sy, x, y); // unit leaf space: base at -1, tip at +1
      if (det > 0) {
        const g = ctx.createLinearGradient(-1, 0, 1, 0);
        g.addColorStop(0, css(base, shadeF)); g.addColorStop(1, css(tip, shadeF));
        ctx.fillStyle = g;
      } else ctx.fillStyle = css(f.c, shadeF);
      ctx.fill(f.full);
      // curl: one half of the leaf turned away from the light
      if (p.leafShade > 0) { ctx.fillStyle = `rgba(0,0,0,${0.24 * p.leafShade})`; ctx.fill(f.half); }
      const px = 1 / sx; // one screen pixel in leaf units (roughly)
      if (det > 0) {
        // side veins (dark, faint) and a pale midrib
        ctx.lineWidth = Math.max(0.5, f.size * 0.02) * px;
        ctx.strokeStyle = `rgba(40,20,0,${0.22 * det})`;
        ctx.beginPath();
        for (let t = -0.55; t <= 0.45; t += 0.25) for (const s of [-1, 1]) { ctx.moveTo(t, 0); ctx.lineTo(t + 0.28, s * 0.32); }
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,236,190,${0.3 * det})`;
        ctx.lineWidth = Math.max(0.5, f.size * 0.03) * px;
        ctx.beginPath(); ctx.moveTo(-0.95, 0); ctx.lineTo(0.8, 0); ctx.stroke();
        // spots
        if (f.spots.length) {
          ctx.fillStyle = `rgba(45,22,8,${0.45 * det})`;
          ctx.beginPath();
          for (const [a, b, rr] of f.spots) { ctx.moveTo(a + rr, b); ctx.arc(a, b, rr, 0, U.TAU); }
          ctx.fill();
        }
      } else if (p.leafShade > 0) {
        ctx.strokeStyle = `rgba(0,0,0,${0.3 * p.leafShade})`;
        ctx.lineWidth = Math.max(0.5, f.size * 0.035) * px;
        ctx.beginPath(); ctx.moveTo(-0.95, 0); ctx.lineTo(0.85, 0); ctx.stroke();
      }
      // darker rim + stem
      ctx.lineWidth = Math.max(0.5, f.size * 0.04) * px;
      ctx.strokeStyle = `rgba(30,15,0,${0.18 + 0.15 * det})`;
      ctx.stroke(f.full);
      ctx.strokeStyle = css(base, shadeF * 0.7);
      ctx.beginPath(); ctx.moveTo(-0.95, 0); ctx.lineTo(-1.2, 0.08); ctx.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawFall(ctx, f, W, H, p, k, mask) {
    if (mask) { drawFallMask(ctx, f, W, H, k); return; }
    if (f.fall === 'needles') drawNeedles(ctx, f, W, H, p, k);
    else drawLeaf(ctx, f, W, H, p, k);
  }

  /* mask: plain white silhouettes, no shading or shadows */
  function drawFallMask(ctx, f, W, H, k) {
    ctx.fillStyle = ctx.strokeStyle = '#fff';
    if (f.fall === 'needles') {
      ctx.lineCap = 'round'; ctx.lineWidth = Math.max(0.6, 1.3 * k);
      ctx.beginPath();
      for (const sh of f.shades) for (const [x0, y0, cx, cy, x1, y1, len] of sh.segs) {
        for (const [dx, dy] of tileOffsets(x0, y0, len, W, H)) { ctx.moveTo(x0 + dx, y0 + dy); ctx.quadraticCurveTo(cx + dx, cy + dy, x1 + dx, y1 + dy); }
      }
      ctx.stroke();
      return;
    }
    const sx = f.size / 2, sy = (f.size / 2) * f.aspect, cr = Math.cos(f.rot), sr = Math.sin(f.rot);
    for (const [dx, dy] of tileOffsets(f.u * W, f.v * H, f.size, W, H)) {
      ctx.setTransform(cr * sx, sr * sx, -sr * sy, cr * sy, f.u * W + dx, f.v * H + dy);
      ctx.fill(f.full);
      ctx.lineWidth = Math.max(0.5, f.size * 0.04) / sx;
      ctx.beginPath(); ctx.moveTo(-0.95, 0); ctx.lineTo(-1.2, 0.08); ctx.stroke(); // stem
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  U.register({
    id: 'grass',
    name: 'Grass',
    desc: 'Tileable top-down grass ground or side-view grass strips with blade shape, wind, color and fallen leaves',
    uses: ['Ground textures for lawns, meadows and autumn forest floors on terrain and level geometry.', 'Horizontally tiling grass edges for 2D platformer ground tiles.'],
    tags: ['PBR', 'Nature'],
    tileable: true,
    icon: U.icon('<path d="M4 20c1-5 0-9-1-12"/><path d="M8 20c0-6 2-10 5-13"/><path d="M12 20c0-4-1-7-3-9"/><path d="M15 20c1-5 3-8 6-10"/><path d="M18 20c0-3-1-5-2-7"/>'),
    params: [
      { type: 'section', label: 'Grass' },
      { key: 'style', label: 'Style', type: 'select', default: 'ground', options: [['ground', 'Top-down ground (tiles both ways)'], ['card', 'Side-view card (tiles horizontally)']] },
      { key: 'count', label: 'Blade count', type: 'int', min: 10, max: 20000, default: 3500 },
      { key: 'lenMin', key2: 'lenMax', label: 'Length', type: 'span', min: 0.01, max: 1, step: 0.005, default: 0.04, default2: 0.1, tip: 'Ground: fraction of the texture size. Card: fraction of the height.' },
      { key: 'width', label: 'Blade width', type: 'range', min: 0.3, max: 30, step: 0.1, default: 3, tip: 'px @ 512' },
      { key: 'taper', label: 'Tip sharpness', type: 'range', min: 0.2, max: 3, step: 0.01, default: 1, tip: 'Higher = blades narrow sooner' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 21 },
      { type: 'section', label: 'Direction & shape' },
      { key: 'dir', label: 'Wind direction', type: 'range', min: -180, max: 180, step: 1, default: -60, show: isGround },
      { key: 'spread', label: 'Direction spread', type: 'range', min: 0, max: 360, step: 1, default: 300, show: isGround, tip: '360 = blades point anywhere, 0 = all combed one way' },
      { key: 'lean', label: 'Wind lean', type: 'range', min: -60, max: 60, step: 1, default: 8, show: isCard },
      { key: 'leanVar', label: 'Lean variation', type: 'range', min: 0, max: 60, step: 1, default: 14, show: isCard },
      { key: 'bend', label: 'Bend', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.45, tip: 'How much blades curve toward the tip' },
      { key: 'clump', label: 'Clumping', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'clumps', label: 'Clump count', type: 'int', min: 2, max: 200, default: 40, show: (p) => p.clump > 0 },
      { key: 'rootJitter', label: 'Root height variation', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.06, show: isCard },
      { type: 'section', label: 'Color' },
      {
        key: 'preset', label: 'Preset', type: 'select', default: 'lush', options: [['lush', 'Lush'], ['meadow', 'Meadow'], ['dry', 'Dry / savanna'], ['stylized', 'Stylized'], ['custom', 'Custom']],
        apply: (v, p) => { if (PRESETS[v]) Object.assign(p, PRESETS[v]); },
      },
      { key: 'root', label: 'Root', type: 'color', default: PRESETS.lush.root },
      { key: 'tip', label: 'Tip', type: 'color', default: PRESETS.lush.tip },
      { key: 'dry', label: 'Dry blades', type: 'color', default: PRESETS.lush.dry },
      { key: 'dryAmt', label: 'Dry amount', type: 'range', min: 0, max: 1, step: 0.01, default: PRESETS.lush.dryAmt },
      { key: 'patches', label: 'Color patches', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Groups dry blades and brightness into large patches instead of random speckle' },
      { key: 'variation', label: 'Brightness variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'depth', label: 'Depth shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Blades underneath / behind are darker' },
      { key: 'soil', label: 'Ground color', type: 'color', default: PRESETS.lush.soil, show: isGround },
      { key: 'bgFill', label: 'Background fill', type: 'bool', default: false, show: isCard },
      { type: 'section', label: 'Fall leaves', show: isGround, active: (p) => p.leaves > 0 || p.needles > 0 },
      { key: 'leaves', label: 'Leaves', type: 'int', min: 0, max: 3000, default: 0, tip: 'Fallen leaves scattered in and on the grass (top-down ground only)' },
      { key: 'leafShape', label: 'Leaf shape', type: 'select', default: 'mixed', options: [['mixed', 'Mixed'], ['oval', 'Oval'], ['pointed', 'Pointed (beech / cherry)'], ['maple', 'Maple'], ['oak', 'Oak'], ['birch', 'Birch (small, round)']], show: (p) => p.leaves > 0 },
      { key: 'leafSize', label: 'Leaf size', type: 'range', min: 2, max: 160, step: 0.5, default: 30, show: (p) => p.leaves > 0, tip: 'px @ 512' },
      { key: 'leafSizeVar', label: 'Size variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.leaves > 0 },
      { key: 'leafA', label: 'Leaf color 1', type: 'color', default: '#b8301c', show: (p) => p.leaves > 0 },
      { key: 'leafB', label: 'Leaf color 2', type: 'color', default: '#e0701c', show: (p) => p.leaves > 0 },
      { key: 'leafC', label: 'Leaf color 3', type: 'color', default: '#e8b42a', show: (p) => p.leaves > 0 },
      { key: 'leafBrown', label: 'Dried leaf color', type: 'color', default: '#6e4322', show: (p) => p.leaves > 0 },
      { key: 'brownAmt', label: 'Dried amount', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => p.leaves > 0 },
      { key: 'leafVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.leaves > 0 },
      { key: 'leafShade', label: 'Curl shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.leaves > 0, tip: 'Leaves are slightly curled: one half lighter, one darker, plus the midrib' },
      { key: 'leafDetail', label: 'Leaf detail', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, show: (p) => p.leaves > 0, tip: 'Natural look: color shift from stem to tip, veins, pale midrib, spots on dried leaves. 0 = flat, stylized leaves' },
      { key: 'needles', label: 'Needles', type: 'int', min: 0, max: 10000, default: 0, tip: 'Fallen pine / spruce needles' },
      { key: 'needleLen', label: 'Needle length', type: 'range', min: 2, max: 60, step: 0.5, default: 14, show: (p) => p.needles > 0, tip: 'px @ 512' },
      { key: 'needlePairs', label: 'Needle pairs', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.needles > 0, tip: 'Share of needles lying in V-shaped pairs (pine)' },
      { key: 'needleColor', label: 'Needle color', type: 'color', default: '#a4622a', show: (p) => p.needles > 0 },
      { key: 'needleColor2', label: 'Needle color 2', type: 'color', default: '#5c3a1c', show: (p) => p.needles > 0 },
      { key: 'onTop', label: 'On top of the grass', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.leaves > 0 || p.needles > 0, tip: 'Share lying on top; the rest sits inside the grass with blades crossing over it' },
      { key: 'leafClump', label: 'Clumping', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.leaves > 0 || p.needles > 0, tip: 'Gathers leaves and needles into drifts (tileable noise)' },
      { key: 'leafShadow', label: 'Shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.leaves > 0 || p.needles > 0 },
      { type: 'section', label: 'Output', show: isGround, active: (p) => !p.grassOn || p.transparentBg || p.fallOutput === 'mask' },
      { key: 'grassOn', label: 'Grass blades', type: 'bool', default: true, tip: 'Off: only leaves and needles (e.g. a leaf layer to put over another ground)' },
      { key: 'transparentBg', label: 'Transparent background', type: 'bool', default: false, tip: 'No soil: everything else sits on a transparent background' },
      { key: 'fallOutput', label: 'Leaf output', type: 'select', default: 'color', options: [['color', 'Color'], ['mask', 'Mask (leaves & needles white)']], tip: 'Mask: leaves and needles in white, no shading or shadows; on black, or transparent with a transparent background. Visible grass blades cut into the mask' },
      { key: 'bg', label: 'Background', type: 'color', default: '#000000', show: (p) => isCard(p) && p.bgFill },
    ],
    presets: [
      { name: 'Lawn', group: 'Realistic', values: { count: 12000, lenMin: 0.02, lenMax: 0.05, width: 2.2, clump: 0.1, patches: 0.3, variation: 0.25 } },
      { name: 'Lush ground', group: 'Realistic', values: { preset: 'lush', count: 7000, lenMax: 0.13, clump: 0.55, patches: 0.7, depth: 0.7, seed: 8 } },
      { name: 'Meadow', group: 'Realistic', values: { preset: 'meadow', count: 5000, lenMax: 0.14, clump: 0.5, bend: 0.6 } },
      { name: 'Dry grass', group: 'Realistic', values: { preset: 'dry', count: 4500, spread: 360, bend: 0.8, width: 2.4, patches: 0.7 } },
      { name: 'Savanna', group: 'Realistic', values: { preset: 'dry', count: 6000, lenMin: 0.06, lenMax: 0.18, width: 2, dir: -30, spread: 120, clump: 0.6, root: '#7a6a30', tip: '#f0da8c', dry: '#a89a48', dryAmt: 0.3, soil: '#8a6a40' } },
      { name: 'Winter frost', group: 'Realistic', values: { preset: 'custom', count: 4000, root: '#3a4a3c', tip: '#dfe9ec', dry: '#a8ae9c', dryAmt: 0.3, soil: '#cfd6da', variation: 0.2 } },
      { name: 'Autumn', group: 'Realistic', values: { preset: 'custom', root: '#4a3a1a', tip: '#c89a3a', dry: '#a4522c', dryAmt: 0.55, soil: '#3a2a1a', patches: 0.8 } },
      { name: 'Wet dark lawn', group: 'Realistic', values: { count: 8000, lenMin: 0.03, lenMax: 0.07, preset: 'custom', root: '#0f2a0c', tip: '#4f9a30', dry: '#6a7a2a', dryAmt: 0.05, soil: '#1a160c', depth: 0.7 } },
      { name: 'Patchy sparse grass', group: 'Realistic', values: { count: 1400, clump: 0.85, clumps: 25, patches: 1, preset: 'meadow', soil: '#5a4630' } },
      { name: 'Wind-combed grass', group: 'Realistic', values: { count: 5000, lenMin: 0.08, lenMax: 0.18, width: 2.5, dir: -20, spread: 40, bend: 0.25, clump: 0.2 } },
      { name: 'Autumn lawn with leaves', group: 'Fall', values: { count: 7000, lenMin: 0.03, lenMax: 0.08, preset: 'meadow', dryAmt: 0.35, leaves: 120, leafSize: 30, needles: 0 } },
      { name: 'Red maple carpet', group: 'Fall', values: { preset: 'custom', count: 5000, root: '#2e4a1a', tip: '#8fb04a', dry: '#c8a24a', dryAmt: 0.3, soil: '#3a2a1a', leaves: 300, leafShape: 'maple', leafSize: 42, leafA: '#a8221a', leafB: '#d23a1c', leafC: '#e8742a', brownAmt: 0.15, onTop: 0.6, leafClump: 0.5 } },
      { name: 'Birch leaves (yellow)', group: 'Fall', values: { preset: 'meadow', count: 6000, leaves: 260, leafShape: 'birch', leafSize: 30, leafA: '#e8c22a', leafB: '#f0d65a', leafC: '#d4a01c', brownAmt: 0.15, leafVar: 0.25 } },
      { name: 'Oak leaves (late fall)', group: 'Fall', values: { preset: 'dry', count: 4500, leaves: 200, leafShape: 'oak', leafSize: 40, leafA: '#8a4a1e', leafB: '#a8622a', leafC: '#c08a3a', leafBrown: '#5a3a1c', brownAmt: 0.55, onTop: 0.5, leafClump: 0.45 } },
      { name: 'Park after a storm', group: 'Fall', values: { preset: 'lush', count: 6500, leaves: 380, leafShape: 'mixed', leafSize: 32, brownAmt: 0.3, needles: 600, needleLen: 12, onTop: 0.55, leafClump: 0.3 } },
      { name: 'Pine forest floor', group: 'Fall', values: { preset: 'custom', count: 2500, lenMin: 0.03, lenMax: 0.08, root: '#2a3a1a', tip: '#7a8a3a', dry: '#a08a4a', dryAmt: 0.45, soil: '#3a2616', needles: 6000, needleLen: 16, needlePairs: 0.6, leaves: 30, leafShape: 'pointed', leafSize: 24, brownAmt: 0.6, onTop: 0.5, leafClump: 0.4 } },
      { name: 'Spruce needles on moss', group: 'Fall', values: { preset: 'custom', count: 9000, lenMin: 0.015, lenMax: 0.035, width: 2.2, root: '#1a3412', tip: '#5a8a2a', dry: '#8a8a3a', dryAmt: 0.1, soil: '#1e2a12', needles: 3500, needleLen: 9, needlePairs: 0, needleColor: '#8a5a2a', needleColor2: '#4a3a1a', onTop: 0.4 } },
      { name: 'Toon fall leaves', group: 'Fall', values: { preset: 'stylized', count: 2500, width: 8, taper: 0.6, variation: 0.1, depth: 0.3, leaves: 160, leafShape: 'oval', leafSize: 44, leafA: '#ff5a3a', leafB: '#ff9a2a', leafC: '#ffd23a', brownAmt: 0, leafVar: 0.15, leafShade: 0.35, leafShadow: 0.25, leafDetail: 0, onTop: 0.7 } },
      { name: 'Leaf mask (no grass)', group: 'Fall', values: { grassOn: false, transparentBg: true, fallOutput: 'mask', leaves: 260, leafShape: 'mixed', leafSize: 34, needles: 0, leafClump: 0.3 } },
      { name: 'Leaves only, color (transparent)', group: 'Fall', values: { grassOn: false, transparentBg: true, leaves: 260, leafShape: 'mixed', leafSize: 34, needles: 300, leafClump: 0.3, onTop: 1 } },
      { name: 'Grass card', group: 'Realistic', values: { style: 'card', count: 900, lenMin: 0.4, lenMax: 0.9, width: 5 } },
      { name: 'Tall grass card', group: 'Realistic', values: { style: 'card', count: 600, lenMin: 0.6, lenMax: 1, width: 4, lean: 15, leanVar: 20, preset: 'meadow' } },
      { name: 'Dry grass card', group: 'Realistic', values: { style: 'card', count: 700, lenMin: 0.35, lenMax: 0.9, width: 3.5, leanVar: 22, bend: 0.7, preset: 'dry' } },
      { name: 'Grass tuft card', group: 'Realistic', values: { style: 'card', count: 500, lenMin: 0.2, lenMax: 0.55, width: 6, clump: 0.85, clumps: 6, leanVar: 30 } },
      { name: 'Windblown card', group: 'Realistic', values: { style: 'card', count: 800, lenMin: 0.6, lenMax: 1, width: 4, lean: 30, leanVar: 8, bend: 0.8 } },
      { name: 'Frosted card', group: 'Realistic', values: { style: 'card', count: 800, lenMin: 0.3, lenMax: 0.8, width: 4, preset: 'custom', root: '#3a4a3c', tip: '#e6eef2', dry: '#a8ae9c', dryAmt: 0.3 } },
      { name: 'Toon grass', group: 'Stylized', values: { preset: 'stylized', count: 2500, width: 8, taper: 0.6, variation: 0.1, depth: 0.3, patches: 0.2 } },
      { name: 'Toon grass card', group: 'Stylized', values: { style: 'card', preset: 'stylized', count: 160, lenMin: 0.5, lenMax: 0.85, width: 14, taper: 0.5, variation: 0.1, depth: 0.35 } },
      { name: 'Pastel meadow', group: 'Stylized', values: { preset: 'custom', count: 4000, width: 4.5, lenMax: 0.12, root: '#3a7a4a', tip: '#cdf28a', dry: '#ffe08a', dryAmt: 0.15, soil: '#4a6a3a', variation: 0.15 } },
      { name: 'Candy grass', group: 'Stylized', values: { preset: 'custom', width: 5, root: '#8a2a6a', tip: '#ffa8e0', dry: '#a8e8ff', dryAmt: 0.25, soil: '#3a1a3a' } },
      { name: 'Alien grass', group: 'Sci-fi', values: { preset: 'custom', width: 3.5, depth: 0.3, root: '#2a1a5a', tip: '#5af6ff', dry: '#ff4ae0', dryAmt: 0.2, soil: '#140a1e' } },
      { name: 'Crimson alien grass', group: 'Sci-fi', values: { preset: 'custom', count: 4500, lenMax: 0.13, bend: 0.9, root: '#3a0a0a', tip: '#ff5a3a', dry: '#ffd23a', dryAmt: 0.15, soil: '#2a0a0a' } },
      { name: 'Crystal spikes', group: 'Sci-fi', values: { preset: 'custom', count: 1800, width: 5, taper: 0.4, bend: 0, spread: 360, root: '#3a4a7a', tip: '#e0f4ff', dry: '#b8a8ff', dryAmt: 0.2, soil: '#121624', variation: 0.5 } },
      { name: 'Bioluminescent card', group: 'Sci-fi', values: { style: 'card', count: 700, lenMin: 0.35, lenMax: 0.9, width: 4, bend: 0.8, preset: 'custom', root: '#0a2a3a', tip: '#7affc8', dry: '#c87aff', dryAmt: 0.15, bgFill: true, bg: '#05070f' } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), k = S / 512, rnd = U.rng(p.seed), STEPS = 7;
      const ground = p.style === 'ground';
      const cRoot = U.hex(p.root), cTip = U.hex(p.tip), cDry = U.hex(p.dry);
      const lmin = Math.min(p.lenMin, p.lenMax), lmax = Math.max(p.lenMin, p.lenMax);
      const px = 3, py = ground ? Math.max(1, Math.round((3 * H) / W)) : 0; // patch noise periods
      const patch = (u, v, s) => U.fractal('perlin', u * px, v * Math.max(py, 1), px, py, 3, 0.5, 'fbm', p.seed + s);

      // background (ground: soil, or nothing / black for transparent and mask output)
      const mask = ground && p.fallOutput === 'mask', clearBg = ground && p.transparentBg;
      if (ground && mask && !clearBg) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      else if (ground && !clearBg) {
        const soil = U.hex(p.soil), sx = 6, sy = Math.max(1, Math.round((6 * H) / W));
        U.pixels(ctx, W, H, (x, y, o) => {
          const n = U.fractal('perlin', ((x + 0.5) / W) * sx, ((y + 0.5) / H) * sy, sx, sy, 4, 0.5, 'fbm', p.seed + 31);
          const m = 0.7 + n * 0.5;
          o[0] = soil[0] * m; o[1] = soil[1] * m; o[2] = soil[2] * m;
        });
      } else if (p.bgFill) {
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, W, H);
      }

      // clump centers (fractions of the tile)
      const clumps = [];
      const crnd = U.rng(p.seed * 31 + 5);
      for (let i = 0; i < p.clumps; i++) clumps.push([crnd(), crnd()]);

      const blades = [];
      for (let i = 0; i < p.count; i++) {
        const r = Array.from({ length: 9 }, rnd);
        let u = r[0], v = r[1];
        if (p.clump > 0 && r[2] < p.clump) {
          // pull toward a clump center, gaussian-ish falloff
          const c = clumps[(r[3] * clumps.length) | 0], rad = (0.5 / Math.sqrt(clumps.length)) * Math.sqrt(-Math.log(1 - r[4] * 0.95));
          u = U.mod(c[0] + Math.cos(r[5] * U.TAU) * rad, 1);
          v = U.mod(c[1] + Math.sin(r[5] * U.TAU) * rad, 1);
        }
        blades.push({ u, v, z: r[6], len: lmin + (lmax - lmin) * Math.pow(r[7], 1.3), r8: r[8], sub: U.rng(p.seed * 7919 + i) });
      }
      // fall leaves and needles (ground only): depth-sorted together with the blades
      const extras = ground ? scatterFall(p, W, H, S, k, patch) : [];
      blades.sort((a, b) => a.z - b.z); // back / underneath first
      const items = blades.concat(extras).sort((a, b) => a.z - b.z);

      for (const b of items) {
        if (b.fall) { drawFall(ctx, b, W, H, p, k, mask); continue; }
        if (ground && !p.grassOn) continue;
        const sub = b.sub, s1 = sub(), s2 = sub(), s3 = sub(), s4 = sub();
        let x, y, heading, len, curl;
        if (ground) {
          x = b.u * W; y = b.v * H;
          heading = ((p.dir + (s1 - 0.5) * p.spread) * Math.PI) / 180;
          len = b.len * S;
          curl = (s2 - 0.5) * 2 * p.bend;
        } else {
          x = b.u * W; y = H * (1 - p.rootJitter * b.z * s3) + 2 * k; // front blades root lower
          heading = -Math.PI / 2 + ((p.lean + (s1 - 0.5) * 2 * p.leanVar) * Math.PI) / 180;
          len = b.len * H * (0.75 + 0.25 * b.z);
          // blades curve further in the direction they already lean, like drooping under their weight
          const side = Math.sign(heading + Math.PI / 2) || (s2 < 0.5 ? -1 : 1);
          curl = side * p.bend * (0.4 + 0.6 * s2);
        }

        // centerline: heading turns progressively (quadratic) toward the tip
        const pts = [[x, y]], step = len / STEPS;
        for (let s = 1; s <= STEPS; s++) {
          const a = heading + curl * Math.pow(s / STEPS, 2);
          x += Math.cos(a) * step;
          y += Math.sin(a) * step;
          pts.push([x, y]);
        }
        const w = p.width * k * (0.6 + 0.8 * s4);
        const left = [], right = [];
        for (let s = 0; s <= STEPS; s++) {
          const a = pts[Math.max(0, s - 1)], c = pts[Math.min(STEPS, s + 1)];
          const tx = c[0] - a[0], ty = c[1] - a[1], tl = Math.hypot(tx, ty) || 1;
          const hw = (Math.max(0.3, w) / 2) * Math.pow(1 - s / STEPS, p.taper);
          left.push([pts[s][0] - (ty / tl) * hw, pts[s][1] + (tx / tl) * hw]);
          right.push([pts[s][0] + (ty / tl) * hw, pts[s][1] - (tx / tl) * hw]);
        }
        const ribbon = left.concat(right.reverse());

        // color: dry blades and brightness grouped into patches via tileable noise
        const pu = U.mod(b.u, 1), pv = U.mod(b.v, 1);
        const pn = p.patches > 0 ? patch(pu, pv, 3) : 0.5;
        const dryT = U.clamp(p.dryAmt + (pn - 0.5) * p.patches * 1.6);
        const isDry = b.r8 < dryT;
        const shade = (1 - p.depth * 0.75 * (1 - b.z)) * (1 + (sub() - 0.5) * p.variation + (p.patches > 0 ? (patch(pu, pv, 9) - 0.5) * p.variation * p.patches : 0));
        const tipC = isDry ? mixC(cTip, cDry, 0.6 + 0.4 * sub()) : cTip;
        const rootC = isDry ? mixC(cRoot, cDry, 0.35) : cRoot;
        const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[STEPS][0], pts[STEPS][1]);
        g.addColorStop(0, css(rootC, Math.max(0, shade * 0.85)));
        g.addColorStop(1, css(mixC(rootC, tipC, 1), Math.max(0, shade)));
        ctx.fillStyle = mask ? '#000' : g;
        // mask: blades hide the leaves below them (cut out when the background is transparent)
        if (mask && clearBg) ctx.globalCompositeOperation = 'destination-out';

        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [qx, qy] of ribbon) { x0 = Math.min(x0, qx); y0 = Math.min(y0, qy); x1 = Math.max(x1, qx); y1 = Math.max(y1, qy); }
        const oyR = ground ? 1 : 0;
        for (let oy = -oyR; oy <= oyR; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const dx = ox * W, dy = oy * H;
            if (x1 + dx < 0 || x0 + dx > W || y1 + dy < 0 || y0 + dy > H) continue;
            ctx.save();
            ctx.translate(dx, dy);
            ctx.beginPath();
            U.polyPath(ctx, ribbon);
            ctx.fill();
            ctx.restore();
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    },
  });
})();
