/* Debris & shattered glass: a flat ground texture of scattered broken chunks, to lay under geometry
   (decal / floor overlay). Materials: glass shards, stones / pebbles, concrete rubble, brick bits,
   wood splinters, ceramic / tile shards, or a mixed rubble pile. Layouts: even scatter or a centered
   pile, optionally shaped by a noise mask. Made to sit on a simple quad under a mesh: nothing ever
   touches the texture edge (edge margin + a soft density fade toward it); it does not tile. Every piece is lit from one light
   direction (gradient + bevel rim), glass glints when it faces the light, pieces cast a soft contact
   shadow; fine dust specks, glitter and a dust haze sit around them. Output: transparent decal, on a
   ground color, or a height map; normal map mode uses that height map. */
(function () {
  'use strict';
  const U = window.UGTG;
  const RAD = Math.PI / 180;

  // material defaults: colors, look and shape character
  const MAT = {
    glass: { c1: '#cfe7e6', c2: '#9cc4c2', edge: '#ffffff', opacity: 0.32, sides: [3, 5], jag: 0, round: 0, elong: 2.2, bevel: 1, shine: 0.85 },
    stone: { c1: '#8d877c', c2: '#5e5950', edge: '#b9b2a4', opacity: 1, sides: [7, 11], jag: 0.35, round: 0.55, elong: 1.4, bevel: 1.5, shine: 0 },
    concrete: { c1: '#a19d95', c2: '#77736c', edge: '#c9c5bc', opacity: 1, sides: [5, 8], jag: 0.3, round: 0.12, elong: 1.5, bevel: 2, shine: 0 },
    brick: { c1: '#a4553a', c2: '#6f3424', edge: '#c98a6b', opacity: 1, sides: [4, 6], jag: 0.25, round: 0.1, elong: 1.7, bevel: 2, shine: 0 },
    wood: { c1: '#9a6d42', c2: '#5e3f22', edge: '#d3ad7d', opacity: 1, sides: [0, 0], jag: 0.5, round: 0, elong: 6, bevel: 2, shine: 0 },
    ceramic: { c1: '#e9e6df', c2: '#b8c7cf', edge: '#ffffff', opacity: 1, sides: [3, 5], jag: 0, round: 0.05, elong: 1.6, bevel: 1.5, shine: 0.4 },
  };
  const MIX = [['concrete', 0.4], ['brick', 0.2], ['wood', 0.15], ['glass', 0.15], ['stone', 0.1]];

  const mixColor = (a, b, t) => { const A = U.hex(a), B = U.hex(b); return [U.lerp(A[0], B[0], t), U.lerp(A[1], B[1], t), U.lerp(A[2], B[2], t)]; };
  const css = (c, a = 1, f = 1) => `rgba(${U.clamp(c[0] * f, 0, 255) | 0},${U.clamp(c[1] * f, 0, 255) | 0},${U.clamp(c[2] * f, 0, 255) | 0},${a})`;

  /* unit-size outline of one piece (radius ~1) */
  function outline(mat, r, p) {
    const M = MAT[mat];
    if (mat === 'wood') {
      // splinter: long body with ragged, pointed ends
      const pts = [], n = 6, jag = 0.15 + p.jag * 0.6;
      pts.push([-1 - r() * jag * 0.6, (r() - 0.5) * 0.3]);
      for (let i = 1; i < n; i++) pts.push([-1 + (2 * i) / n + (r() - 0.5) * 0.1, -0.32 - r() * 0.12 * jag]);
      pts.push([1 + r() * jag * 0.6, (r() - 0.5) * 0.3]);
      for (let i = n - 1; i > 0; i--) pts.push([-1 + (2 * i) / n + (r() - 0.5) * 0.1, 0.32 + r() * 0.12 * jag]);
      return pts;
    }
    if (mat === 'stone') {
      // pebble: smooth outline from a few low harmonics, flattened on one side now and then
      const n = 20, h2 = r() * 0.12 + p.jag * 0.12, h3 = r() * 0.08 + p.jag * 0.1, f2 = r() * U.TAU, f3 = r() * U.TAU, flat = r() < 0.4 ? r() * U.TAU : null;
      const pts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * U.TAU;
        let rad = 1 + Math.cos(2 * a + f2) * h2 + Math.cos(3 * a + f3) * h3;
        if (flat != null) rad = Math.min(rad, 0.82 / Math.max(0.3, Math.cos(a - flat)));
        pts.push([Math.cos(a) * rad, Math.sin(a) * rad]);
      }
      return pts;
    }
    const lo = M.sides[0], hi = M.sides[1], n = Math.max(3, Math.round(U.lerp(lo, hi, r()) + (p.sides - 5) * 0.5));
    // random angles with a minimum gap: sharp, irregular shards / chunks
    const ang = [];
    for (let i = 0; i < n; i++) ang.push((i + 0.15 + r() * 0.7) / n * U.TAU);
    const jag = M.jag + p.jag * 0.5;
    return ang.map((a) => { const rad = 1 - r() * jag * 0.55; return [Math.cos(a) * rad, Math.sin(a) * rad]; });
  }

  /* where debris may land, 0..1: fades out toward the texture edge, optionally shaped by a noise mask */
  const useMask = (p) => p.mask || p.layout === 'clusters'; // old 'clusters' tabs = scatter + mask
  function densityFn(p, W, H) {
    const S = Math.min(W, H), em = p.edgeMargin * S, ef = Math.max(1, p.edgeFade * S), ms = p.maskScale / S, seed = (p.seed | 0) + 17;
    const th = 0.68 - p.maskCover * 0.36, soft = 0.02 + p.maskSoft * 0.2;
    return (x, y) => {
      // distance to the edge: of the inscribed ellipse (radial, default) or of the rectangle
      const d = p.falloff === 'rect' ? Math.min(x, y, W - x, H - y)
        : (1 - Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2))) * (S / 2);
      let v = U.smoothstep(em, em + ef, d);
      if (useMask(p) && v > 0) v *= U.smoothstep(th - soft, th + soft, U.fractal('perlin', x * ms, y * ms, 0, 0, 4, 0.5, 'fbm', seed));
      return v;
    };
  }

  /* low-res canvas of the density (white + alpha), scaled up over the texture */
  function densityCanvas(p, W, H) {
    const n = 160, dens = densityFn(p, W, H), cw = Math.max(1, Math.round((n * W) / Math.max(W, H))), ch = Math.max(1, Math.round((n * H) / Math.max(W, H)));
    const c = U.canvas(cw, ch), g = c.getContext('2d'), img = g.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const o = (y * cw + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = dens(((x + 0.5) * W) / cw, ((y + 0.5) * H) / ch) * 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* lay out pieces: { x, y, size, rot, mat, pts (px, centered at x,y), tone } */
  function layout(p, W, H) {
    const S = Math.min(W, H), r = U.rng(p.seed | 0), out = [];
    const sMax = p.size * S, sMin = sMax * (1 - p.sizeVar);
    const pile = p.layout === 'pile', dens = densityFn(p, W, H);
    // no part of a piece (or its shadow) may come closer to the edge than this
    const em = Math.max(2, p.edgeMargin * S * 0.5 + (p.shadowDist + p.shadowSize) * (S / 512));
    let tries = 0;
    while (out.length < p.count && tries++ < p.count * 30) {
      const t = Math.pow(r(), p.smallBias);
      const size = sMin + (sMax - sMin) * t;
      let x, y;
      if (pile) {
        // gaussian-ish pile, small bits fly further out
        const u = Math.max(1e-6, r()), d = Math.sqrt(-2 * Math.log(u)) * 0.42 * p.spread * (S / 2) * (1.35 - t * 0.6), a = r() * U.TAU;
        x = W / 2 + Math.cos(a) * d; y = H / 2 + Math.sin(a) * d;
      } else { x = r() * W; y = r() * H; }
      if (r() > dens(x, y)) continue;
      let mat = p.material;
      if (mat === 'mixed') { let q = r(), i = 0; while (i < MIX.length - 1 && (q -= MIX[i][1]) > 0) i++; mat = MIX[i][0]; }
      const M = MAT[mat];
      const e = mat === 'wood' ? Math.max(3, p.elong * 1.6 + r() * 2) : 1 + (p.elong * (M.elong / 1.6) - 1) * r();
      const sx = Math.sqrt(e), sy = 1 / Math.sqrt(e);
      const rot = (p.dir * RAD) + (r() - 0.5) * Math.PI * 2 * (1 - p.align);
      const cr = Math.cos(rot), sr = Math.sin(rot), half = size / 2;
      const pts = outline(mat, r, p).map(([ux, uy]) => { const X = ux * sx * half, Y = uy * sy * half; return [x + X * cr - Y * sr, y + X * sr + Y * cr]; });
      if (pts.some(([px, py]) => px < em || py < em || px > W - em || py > H - em)) continue; // never touch the edge
      out.push({ x, y, size, rot, mat, pts, tone: r(), hval: 0.45 + r() * 0.4, glint: r(), vari: r() });
    }
    // big first, small bits land on top
    out.sort((a, b) => b.size - a.size);
    return out;
  }

  function trace(c, pts, dx, dy, round) {
    c.beginPath();
    U.polyPath(c, pts.map(([x, y]) => [x + dx, y + dy]), round);
  }

  let grainTile = null;
  function grain() {
    if (grainTile) return grainTile;
    grainTile = U.canvas(96, 96);
    const g = grainTile.getContext('2d'), img = g.createImageData(96, 96);
    for (let i = 0; i < 96 * 96; i++) {
      // mostly soft mottling, a little pixel grain; tileable over 96 px
      const x = i % 96, y = (i / 96) | 0, v = (0.5 + U.hash(x, y, 71) * 0.18 - 0.09 + U.value(x / 8, y / 8, 12, 12, 72) * 0.32) * 255;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return grainTile;
  }

  /* low-res tileable noise (white + alpha), drawn scaled up over the texture = smooth. It carries a
     1-texel wrapped border that is drawn just outside the canvas, so the bilinear upscale tiles. */
  function drawNoise(ctx, p, W, H, seed, pile, freq, alpha) {
    const n = 96, N = n + 2, c = U.canvas(N, N), g = c.getContext('2d'), img = g.createImageData(N, N), f = Math.max(1, Math.round(freq));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = U.mod(x - 1, n) / n, w = U.mod(y - 1, n) / n;
      let v = U.fractal('perlin', u * f, w * f, f, f, 4, 0.55, 'fbm', seed);
      if (pile) v *= U.clamp(1.2 - Math.hypot((x - 1) / n - 0.5, (y - 1) / n - 0.5) / (0.5 * p.spread + 0.05));
      const o = (y * N + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = U.clamp(v) * 255 * alpha;
    }
    g.putImageData(img, 0, 0);
    ctx.drawImage(c, -W / n, -H / n, (W * N) / n, (H * N) / n);
  }

  /* noise drawn in one solid color */
  function colorNoise(ctx, p, W, H, seed, pile, freq, color, alpha, maskC) {
    const t = U.canvas(W, H), g = t.getContext('2d');
    drawNoise(g, p, W, H, seed, pile, freq, 1);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, W, H);
    if (maskC) { g.globalCompositeOperation = 'destination-in'; g.drawImage(maskC, 0, 0, W, H); } // e.g. haze: edge fade + noise mask
    ctx.globalAlpha = alpha; ctx.drawImage(t, 0, 0); ctx.globalAlpha = 1;
  }

  function drawPiece(c, pc, p, k, dx, dy, light) {
    const M = MAT[pc.mat], mixed = p.material === 'mixed';
    const c1 = mixed ? M.c1 : p.c1, c2 = mixed ? M.c2 : p.c2, edge = mixed ? M.edge : p.edge;
    const op = mixed ? M.opacity : p.opacity, glass = pc.mat === 'glass';
    const roundR = (mixed ? M.round : p.roundness) * pc.size * 0.25;
    const col = mixColor(c1, c2, pc.tone * p.colorVar + (1 - p.colorVar) * 0.5);
    const [lx, ly] = light;
    c.save();
    trace(c, pc.pts, dx, dy, roundR);
    c.fillStyle = css(col, op);
    c.fill();
    c.clip();
    const cx = pc.x + dx, cy = pc.y + dy, h = pc.size * 0.6;
    // light falloff across the piece: rounded stones get a dome (highlight toward the light, dark rim),
    // flat chunks and shards a straight gradient
    let g;
    if (pc.mat === 'stone') {
      // (lx, ly) points toward the light
      g = c.createRadialGradient(cx + lx * h * 0.35, cy + ly * h * 0.35, 0, cx, cy, h * 1.05);
      g.addColorStop(0, `rgba(255,255,255,${p.lightAmt * 0.3})`);
      g.addColorStop(0.55, 'rgba(255,255,255,0)');
      g.addColorStop(1, `rgba(0,0,0,${p.lightAmt * 0.55})`);
    } else {
      g = c.createLinearGradient(cx + lx * h, cy + ly * h, cx - lx * h, cy - ly * h);
      g.addColorStop(0, `rgba(255,255,255,${p.lightAmt * (glass ? 0.25 : 0.3)})`);
      g.addColorStop(1, `rgba(0,0,0,${p.lightAmt * (glass ? 0.15 : 0.4)})`);
    }
    c.fillStyle = g;
    c.fillRect(cx - pc.size, cy - pc.size, pc.size * 2, pc.size * 2);
    // surface grain (stone, concrete, brick; light on wood)
    if (p.grain > 0 && !glass) {
      c.globalCompositeOperation = 'overlay';
      c.globalAlpha = p.grain * (pc.mat === 'wood' ? 0.5 : 1);
      const pat = c.createPattern(grain(), 'repeat');
      // the grain scales with the texture, so every export size matches the preview
      if (pat.setTransform) pat.setTransform(new DOMMatrix([k * 0.6, 0, 0, k * 0.6, pc.vari * 96, pc.tone * 96]));
      c.fillStyle = pat;
      c.fillRect(cx - pc.size, cy - pc.size, pc.size * 2, pc.size * 2);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }
    // wood grain lines along the splinter
    if (pc.mat === 'wood') {
      c.strokeStyle = css(mixColor(c2, '#000000', 0.35), 0.45);
      c.lineWidth = Math.max(0.5, pc.size * 0.012);
      const cr = Math.cos(pc.rot), sr = Math.sin(pc.rot), L = pc.size * 1.4;
      c.beginPath();
      for (let i = -3; i <= 3; i++) {
        const o = i * pc.size * 0.045 + (pc.vari - 0.5) * pc.size * 0.02;
        c.moveTo(cx - cr * L - sr * o, cy - sr * L + cr * o); c.lineTo(cx + cr * L - sr * o, cy + sr * L + cr * o);
      }
      c.stroke();
    }
    // bevel: light rim on the lit side, dark rim on the far side
    const b = (mixed ? M.bevel : p.bevel) * k;
    if (b > 0) {
      c.lineWidth = b;
      c.lineJoin = 'round';
      trace(c, pc.pts, dx + lx * b * 0.6, dy + ly * b * 0.6, roundR);
      c.strokeStyle = `rgba(0,0,0,${p.lightAmt * (glass ? 0.2 : 0.35)})`;
      c.stroke();
      trace(c, pc.pts, dx - lx * b * 0.6, dy - ly * b * 0.6, roundR);
      c.strokeStyle = css(U.hex(edge), p.lightAmt * (glass ? 0.6 : 0.4));
      c.stroke();
    }
    // glass / glaze: glint when the shard faces the light, plus a streak
    const shine = mixed ? M.shine : p.shine;
    if (shine > 0) {
      const face = Math.pow(Math.max(0, Math.cos(pc.rot * 2 + pc.glint * 3 - Math.atan2(ly, lx))), 6);
      if (face > 0.02) { c.fillStyle = `rgba(255,255,255,${face * shine * 0.75})`; c.fillRect(cx - pc.size, cy - pc.size, pc.size * 2, pc.size * 2); }
      const a = pc.pts[0], z = pc.pts[Math.floor(pc.pts.length / 2)];
      c.strokeStyle = `rgba(255,255,255,${shine * 0.5})`;
      c.lineWidth = Math.max(0.6, pc.size * 0.03);
      c.beginPath();
      c.moveTo(U.lerp(a[0], z[0], 0.2) + dx, U.lerp(a[1], z[1], 0.2) + dy);
      c.lineTo(U.lerp(a[0], z[0], 0.55) + dx + lx * pc.size * 0.05, U.lerp(a[1], z[1], 0.55) + dy + ly * pc.size * 0.05);
      c.stroke();
    }
    c.restore();
    // crisp outer edge: bright for glass and glaze (broken edges catch light), thin dark otherwise
    trace(c, pc.pts, dx, dy, roundR);
    c.lineWidth = Math.max(0.5, (glass ? 0.9 : 0.6) * k * p.edgeW);
    c.strokeStyle = glass || pc.mat === 'ceramic' ? css(U.hex(edge), 0.85) : `rgba(0,0,0,${0.35 * p.edgeW})`;
    if (p.edgeW > 0) c.stroke();
  }

  function drawHeight(c, pc, p, dx, dy) {
    const M = MAT[pc.mat], roundR = (p.material === 'mixed' ? M.round : p.roundness) * pc.size * 0.25;
    const thin = pc.mat === 'glass' || pc.mat === 'ceramic' ? 0.45 : pc.mat === 'wood' ? 0.75 : 1;
    const top = pc.hval * thin, edgeF = pc.mat === 'stone' ? 0.25 : pc.mat === 'glass' ? 0.7 : 0.45;
    const g = c.createRadialGradient(pc.x + dx, pc.y + dy, 0, pc.x + dx, pc.y + dy, pc.size * 0.55);
    const v = (t) => { const q = (t * 255) | 0; return `rgb(${q},${q},${q})`; };
    g.addColorStop(0, v(top)); g.addColorStop(1, v(top * edgeF));
    trace(c, pc.pts, dx, dy, roundR);
    c.fillStyle = g;
    c.fill();
  }

  U.register({
    id: 'debris',
    name: 'Debris & Shattered Glass',
    desc: 'Ground decals of scattered glass shards, rubble, pebbles, wood splinters or tile shards with height map',
    uses: ['Floor decals under broken windows, destroyed walls or smashed props in 3D levels, laid on a quad with the height output feeding the normal map.', 'Top-down ground clutter for 2D and isometric games.'],
    tags: ['Texturing', 'Decals'],
    heightMap: true,
    icon: U.icon('<polygon points="4,15 9,11 11,17"/><polygon points="13,6 18,9 14,12"/><polygon points="14,15 20,14 18,19"/>'),
    params: [
      { type: 'section', label: 'Debris' },
      {
        key: 'material', label: 'Material', type: 'select', default: 'glass',
        options: [['glass', 'Shattered glass'], ['stone', 'Stones / pebbles'], ['concrete', 'Concrete rubble'], ['brick', 'Brick bits'], ['wood', 'Wood splinters'], ['ceramic', 'Ceramic / tile shards'], ['mixed', 'Mixed rubble']],
        apply: (v, p) => { const M = MAT[v]; if (!M) return; Object.assign(p, { c1: M.c1, c2: M.c2, edge: M.edge, opacity: M.opacity, roundness: M.round, bevel: M.bevel, shine: M.shine, elong: M.elong }); },
        tip: 'Picks fitting colors and look; tweak them afterwards',
      },
      { key: 'layout', label: 'Layout', type: 'select', default: 'scatter', options: [['scatter', 'Even scatter'], ['pile', 'Centered pile']] },
      { key: 'count', label: 'Count', type: 'int', min: 1, max: 3000, default: 160 },
      { key: 'size', label: 'Max size', type: 'range', min: 0.005, max: 0.4, step: 0.001, default: 0.09, tip: 'Fraction of the short side' },
      { key: 'sizeVar', label: 'Size variation', type: 'range', min: 0, max: 0.98, step: 0.01, default: 0.8 },
      { key: 'smallBias', label: 'Small-piece bias', type: 'range', min: 0.3, max: 5, step: 0.05, default: 2.2, tip: 'Higher = many small pieces, few big ones' },
      { key: 'spread', label: 'Pile spread', type: 'range', min: 0.1, max: 1.5, step: 0.01, default: 0.55, show: (p) => p.layout === 'pile' },
      { key: 'falloff', label: 'Edge falloff', type: 'select', default: 'radial', options: [['radial', 'Radial (round)'], ['rect', 'Rectangular']], tip: 'Shape of the fade toward the texture edge' },
      { key: 'edgeMargin', label: 'Edge margin', type: 'range', min: 0, max: 0.3, step: 0.005, default: 0.04, tip: 'Empty border kept free of debris (fraction of the short side)' },
      { key: 'edgeFade', label: 'Edge fade', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.3, tip: 'Debris thins out over this distance toward the margin, so the quad has no visible border' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 11 },
      { type: 'section', label: 'Noise mask' },
      { key: 'mask', label: 'Noise mask', type: 'bool', default: false, tip: 'Debris only lands where the noise allows: patches and clusters instead of an even spread' },
      { key: 'maskScale', label: 'Mask scale', type: 'range', min: 0.5, max: 12, step: 0.1, default: 2.5, show: useMask, tip: 'Noise features across the short side' },
      { key: 'maskCover', label: 'Coverage', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: useMask },
      { key: 'maskSoft', label: 'Mask softness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: useMask },
      { key: 'showMask', label: 'Show mask (preview)', type: 'bool', default: false, show: useMask, tip: 'Preview only: shows where debris may land, incl. the edge fade' },
      { type: 'section', label: 'Shape' },
      { key: 'sides', label: 'Corners', type: 'int', min: 3, max: 12, default: 5, tip: 'Shifts the number of corners per piece' },
      { key: 'jag', label: 'Jaggedness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2 },
      { key: 'roundness', label: 'Rounded corners', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Worn pebbles vs. sharp shards' },
      { key: 'elong', label: 'Elongation', type: 'range', min: 1, max: 6, step: 0.05, default: 2.2 },
      { key: 'align', label: 'Alignment', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: '0 = random rotation, 1 = all along the direction' },
      { key: 'dir', label: 'Direction', type: 'range', min: -90, max: 90, step: 1, default: 0, show: (p) => p.align > 0 },
      { type: 'section', label: 'Color' },
      { key: 'c1', label: 'Color A', type: 'color', default: MAT.glass.c1, show: (p) => p.material !== 'mixed' },
      { key: 'c2', label: 'Color B', type: 'color', default: MAT.glass.c2, show: (p) => p.material !== 'mixed' },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 1, tip: 'How far pieces spread between color A and B', show: (p) => p.material !== 'mixed' },
      { key: 'edge', label: 'Edge / highlight color', type: 'color', default: MAT.glass.edge, show: (p) => p.material !== 'mixed' },
      { key: 'opacity', label: 'Piece opacity', type: 'range', min: 0.05, max: 1, step: 0.01, default: MAT.glass.opacity, show: (p) => p.material !== 'mixed', tip: 'Low for see-through glass' },
      { key: 'grain', label: 'Surface grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { type: 'section', label: 'Shading' },
      { key: 'light', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -135, tip: '-135 = light from top-left' },
      { key: 'lightAmt', label: 'Shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7 },
      { key: 'bevel', label: 'Bevel', type: 'range', min: 0, max: 10, step: 0.1, default: MAT.glass.bevel, show: (p) => p.material !== 'mixed', tip: 'px @ 512' },
      { key: 'shine', label: 'Glints', type: 'range', min: 0, max: 1, step: 0.01, default: MAT.glass.shine, show: (p) => p.material !== 'mixed', tip: 'Pieces facing the light flash bright (glass, glaze)' },
      { key: 'edgeW', label: 'Edge line', type: 'range', min: 0, max: 3, step: 0.05, default: 1 },
      { key: 'shadow', label: 'Contact shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { key: 'shadowSize', label: 'Shadow softness', type: 'range', min: 0, max: 20, step: 0.25, default: 3, show: (p) => p.shadow > 0, tip: 'px @ 512' },
      { key: 'shadowDist', label: 'Shadow offset', type: 'range', min: 0, max: 20, step: 0.25, default: 2, show: (p) => p.shadow > 0, tip: 'px @ 512, away from the light' },
      { type: 'section', label: 'Dust' },
      { key: 'dust', label: 'Fine fragments', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Tiny specks and crumbs' },
      { key: 'dustSize', label: 'Fragment size', type: 'range', min: 0.3, max: 6, step: 0.05, default: 1.4, show: (p) => p.dust > 0, tip: 'px @ 512' },
      { key: 'dustColor', label: 'Fragment color', type: 'color', default: '#d9e8e6', show: (p) => p.dust > 0 },
      { key: 'glitter', label: 'Glitter', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Bright sparkling specks (glass dust)' },
      { key: 'haze', label: 'Dust haze', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Soft dust stain under the pieces' },
      { key: 'hazeColor', label: 'Haze color', type: 'color', default: '#8a8478', show: (p) => p.haze > 0 },
      { key: 'hazeScale', label: 'Haze scale', type: 'int', min: 1, max: 12, default: 3, show: (p) => p.haze > 0 },
      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'alpha', options: [['alpha', 'Transparent (decal)'], ['ground', 'On ground color'], ['height', 'Height map']] },
      { key: 'ground', label: 'Ground color', type: 'color', default: '#4a4740', show: (p) => p.output === 'ground' },
      { key: 'groundVar', label: 'Ground variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.output === 'ground' },
    ],
    presets: [
      { name: 'Broken window glass', group: 'Realistic', values: { material: 'glass', count: 220, size: 0.1, glitter: 0.5, dust: 0.45 } },
      { name: 'Glass pile (decal)', group: 'Realistic', values: { material: 'glass', layout: 'pile', count: 320, size: 0.12, spread: 0.6, glitter: 0.6, dust: 0.6, seed: 4 } },
      { name: 'Bottle glass (green)', group: 'Realistic', values: { material: 'glass', c1: '#5d9a5a', c2: '#2e5e34', edge: '#d8ffd0', opacity: 0.5, count: 140, size: 0.08, dustColor: '#8fcf8a', glitter: 0.35, seed: 8 } },
      { name: 'Bottle glass (brown)', group: 'Realistic', values: { material: 'glass', c1: '#9a5a1e', c2: '#5a2e0c', edge: '#ffd8a8', opacity: 0.55, count: 140, size: 0.08, dustColor: '#c08a50', glitter: 0.3, seed: 9 } },
      { name: 'Gravel', group: 'Realistic', values: { material: 'stone', count: 900, size: 0.05, sizeVar: 0.7, smallBias: 1.2, dust: 0.3, dustColor: '#8d877c', glitter: 0, output: 'ground', ground: '#4f4a42' } },
      { name: 'River pebbles', group: 'Realistic', values: { material: 'stone', c1: '#a59b8a', c2: '#5a564e', count: 380, size: 0.11, sizeVar: 0.6, smallBias: 1, roundness: 0.9, grain: 0.2, jag: 0, elong: 1.6, glitter: 0, dust: 0.1, dustColor: '#8d877c', output: 'ground', ground: '#3e3a33' } },
      { name: 'Concrete rubble', group: 'Realistic', values: { material: 'concrete', count: 260, size: 0.12, dust: 0.6, dustColor: '#b3afa6', glitter: 0, haze: 0.45, hazeColor: '#9a968e' } },
      { name: 'Rubble pile (mixed)', group: 'Realistic', values: { material: 'mixed', layout: 'pile', count: 420, size: 0.14, spread: 0.65, dust: 0.7, dustColor: '#a39f96', glitter: 0.15, haze: 0.6, hazeColor: '#8f8a80', seed: 21 } },
      { name: 'Brick debris', group: 'Realistic', values: { material: 'brick', mask: true, maskScale: 3, maskCover: 0.45, count: 380, size: 0.1, dust: 0.55, dustColor: '#b06a4e', glitter: 0, haze: 0.4, hazeColor: '#a0624a', seed: 14 } },
      { name: 'Wood splinters', group: 'Realistic', values: { material: 'wood', count: 160, size: 0.16, elong: 3.5, dust: 0.45, dustColor: '#b48a5a', glitter: 0, seed: 3 } },
      { name: 'Broken planks (aligned)', group: 'Realistic', values: { material: 'wood', count: 70, size: 0.3, sizeVar: 0.6, elong: 5, align: 0.85, dir: 20, dust: 0.3, dustColor: '#b48a5a', glitter: 0, seed: 12 } },
      { name: 'Smashed tiles', group: 'Realistic', values: { material: 'ceramic', count: 140, size: 0.11, dust: 0.4, dustColor: '#e6e3dc', glitter: 0.1, seed: 6 } },
      { name: 'Smashed plates (blue)', group: 'Realistic', values: { material: 'ceramic', c1: '#f4f2ec', c2: '#3c64a8', colorVar: 0.5, layout: 'pile', count: 120, size: 0.13, spread: 0.5, dust: 0.4, dustColor: '#f4f2ec', glitter: 0.1, seed: 2 } },
      { name: 'Glass on asphalt', group: 'Realistic', values: { material: 'glass', count: 240, size: 0.07, glitter: 0.7, dust: 0.5, output: 'ground', ground: '#2e2e30', groundVar: 0.4, shadow: 0.25, seed: 30 } },
      { name: 'Cartoon rocks', group: 'Stylized', values: { material: 'stone', c1: '#9aa0b0', c2: '#6a7080', count: 90, size: 0.16, roundness: 0.6, jag: 0.15, grain: 0, edgeW: 2.5, lightAmt: 1, bevel: 6, shadow: 0.6, shadowSize: 0, shadowDist: 5, dust: 0, glitter: 0 } },
      { name: 'Low-poly crystal shards', group: 'Stylized', values: { material: 'glass', c1: '#b48bff', c2: '#5a3fd8', edge: '#f0e0ff', opacity: 0.75, count: 90, size: 0.14, elong: 3, shine: 1, glitter: 0.8, dust: 0.3, dustColor: '#d0b8ff', seed: 19 } },
      { name: 'Ice shards', group: 'Stylized', values: { material: 'glass', c1: '#e6f6ff', c2: '#8cc8ec', edge: '#ffffff', opacity: 0.6, count: 180, size: 0.1, elong: 2.8, glitter: 0.9, dust: 0.6, dustColor: '#eaf8ff', haze: 0.3, hazeColor: '#dff2ff', seed: 25 } },
      { name: 'Sci-fi panel scraps', group: 'Sci-fi', values: { material: 'concrete', c1: '#7d8a96', c2: '#3f4a55', edge: '#c8e0f0', count: 120, size: 0.13, sides: 4, jag: 0.05, roundness: 0, grain: 0.15, bevel: 2, shine: 0.3, dust: 0.3, dustColor: '#9fb4c4', glitter: 0.3, seed: 41 } },
    ],
    render(ctx, W, H, p, opts) {
      opts = opts || {};
      const S = Math.min(W, H), k = S / 512, pile = p.layout === 'pile';
      if (opts.preview && p.showMask && useMask(p)) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(densityCanvas(p, W, H), 0, 0, W, H);
        return;
      }
      const pieces = layout(p, W, H), la = p.light * RAD, light = [Math.cos(la), Math.sin(la)];
      const r = U.rng((p.seed | 0) + 5);

      // height map (also the source for normal map mode)
      if (opts.height || p.output === 'height') {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        for (const pc of pieces) for (const [dx, dy] of [[0, 0]]) drawHeight(ctx, pc, p, dx, dy);
        return;
      }

      if (p.output === 'ground') {
        ctx.fillStyle = p.ground; ctx.fillRect(0, 0, W, H);
        if (p.groundVar > 0) {
          // dark blotches + lighter fine mottling
          colorNoise(ctx, p, W, H, (p.seed | 0) + 90, false, 5, '#000000', p.groundVar * 0.55);
          colorNoise(ctx, p, W, H, (p.seed | 0) + 91, false, 14, '#ffffff', p.groundVar * 0.18);
        }
      }
      if (p.haze > 0) colorNoise(ctx, p, W, H, (p.seed | 0) + 60, pile, p.hazeScale, p.hazeColor, p.haze, densityCanvas(p, W, H));

      // contact shadows: all on one layer, blurred once
      if (p.shadow > 0) {
        const sc = U.canvas(W, H), s = sc.getContext('2d'), sd = p.shadowDist * k;
        s.fillStyle = '#000';
        for (const pc of pieces) {
          const thin = pc.mat === 'glass' ? 0.4 : 1;
          s.globalAlpha = thin;
          for (const [dx, dy] of [[0, 0]]) { trace(s, pc.pts, dx - light[0] * sd, dy - light[1] * sd, 0); s.fill(); }
        }
        const bl = p.shadowSize * k;
        if (bl > 0.3 && typeof ctx.filter === 'string') {
          const bc = U.canvas(W, H), b = bc.getContext('2d');
          b.filter = `blur(${bl}px)`;
          b.drawImage(sc, 0, 0);
          ctx.globalAlpha = p.shadow; ctx.drawImage(bc, 0, 0);
        } else { ctx.globalAlpha = p.shadow; ctx.drawImage(sc, 0, 0); }
        ctx.globalAlpha = 1;
      }

      for (const pc of pieces) for (const [dx, dy] of [[0, 0]]) drawPiece(ctx, pc, p, k, dx, dy, light);

      // fine fragments and glitter
      const area = (W * H) / (512 * 512);
      // fragments follow the same density (edge fade + noise mask) as the pieces
      const dens = densityFn(p, W, H);
      const spot = () => {
        for (let tries = 0; tries < 40; tries++) {
          let x, y;
          if (!pile) { x = r() * W; y = r() * H; }
          else {
            const u = Math.max(1e-6, r()), d = Math.sqrt(-2 * Math.log(u)) * 0.5 * p.spread * (S / 2), a = r() * U.TAU;
            x = W / 2 + Math.cos(a) * d; y = H / 2 + Math.sin(a) * d;
          }
          if (r() < dens(x, y)) return [x, y];
        }
        return [-1e4, -1e4]; // nowhere allowed: drawn off-canvas
      };
      if (p.dust > 0) {
        const n = Math.round(p.dust * 2500 * area), dc = U.hex(p.dustColor);
        for (let i = 0; i < n; i++) {
          const [x, y] = spot(), s = Math.max(0.4, p.dustSize * k * (0.3 + r() * r() * 1.7)), f = 0.6 + r() * 0.6;
          ctx.fillStyle = css(dc, 0.35 + r() * 0.6, f);
          ctx.beginPath();
          // a few corners: crumbs, not perfect dots
          const m = 3 + ((r() * 3) | 0), a0 = r() * U.TAU;
          for (let j = 0; j < m; j++) { const a = a0 + (j / m) * U.TAU, rr = s * (0.6 + r() * 0.5); j ? ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
          ctx.fill();
        }
      }
      if (p.glitter > 0) {
        const n = Math.round(p.glitter * 260 * area);
        for (let i = 0; i < n; i++) {
          const [x, y] = spot(), s = k * (0.6 + r() * 1.6), a = 0.4 + r() * 0.6;
          ctx.fillStyle = `rgba(255,255,255,${a})`;
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        }
      }
    },
  });
})();
