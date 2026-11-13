/* Mouse cursor designer. Units are px on a 64×64 canvas. Reports the hotspot for the export size.
   Every shape is built as one Path2D so outline, fill and shading all share the same geometry. */
(function () {
  'use strict';
  const U = window.UGTG;
  const is = (...l) => (p) => l.includes(p.shape);
  const SHAPES = ['arrow', 'pointer', 'triangle', 'shard', 'dart', 'gem', 'stealth', 'ring', 'cross'];
  const CENTERED = ['ring', 'cross'];

  /* Shape definitions, tip (hotspot) at 0,0, y down, extent ~1.
     pts: outline polygon. ext: interior ridge points [x, y, height] (outline points have height 0).
     faces: triangles indexing pts then ext — a low-poly relief used for facet shading and facet lines. */
  const AX = (62 * Math.PI) / 180, UA = [Math.cos(AX), Math.sin(AX)], VA = [-Math.sin(AX), Math.cos(AX)];
  // symmetric shapes are authored along a 62° axis: a = distance along it, s = sideways
  const ax = (a, s, z) => { const q = [a * UA[0] + s * VA[0], a * UA[1] + s * VA[1]]; return z === undefined ? q : [q[0], q[1], z]; };
  const fan = (n, e) => Array.from({ length: n }, (_, i) => [i, (i + 1) % n, e]);
  function fit(def, m = 0.98) {
    const s = m / Math.max(...def.pts.map((q) => Math.max(q[0], q[1])));
    def.pts = def.pts.map(([x, y]) => [x * s, y * s]);
    def.ext = def.ext.map(([x, y, z]) => [x * s, y * s, z]);
    return def;
  }
  // gem cut: a raised flat table (outline shrunk toward c) with a ring of bevel facets
  function gem(pts, c, t) {
    const n = pts.length, faces = [];
    const ext = pts.map(([x, y]) => [c[0] + (x - c[0]) * t, c[1] + (y - c[1]) * t, 1]);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; faces.push([i, j, n + j], [i, n + j, n + i]); }
    for (let i = 1; i < n - 1; i++) faces.push([n, n + i, n + i + 1]);
    return fit({ pts, ext, faces });
  }

  const DEF = {
    arrow: {
      pts: [[0, 0], [0, 0.86], [0.2, 0.68], [0.33, 0.98], [0.46, 0.93], [0.33, 0.63], [0.58, 0.63]],
      ext: [[0.19, 0.55, 1], [0.395, 0.955, 0.35]],
      faces: [[0, 1, 7], [1, 2, 7], [7, 2, 5], [7, 5, 6], [0, 7, 6], [2, 3, 8], [8, 4, 5], [2, 8, 5]],
    },
    arrowNoTail: { pts: [[0, 0], [0, 0.86], [0.22, 0.66], [0.6, 0.62]], ext: [[0.17, 0.46, 1]], faces: fan(4, 4) },
    // folded along the line from the tip to the notch
    pointer: { pts: [[0, 0], [0.7, 0.52], [0.32, 0.6], [0.14, 0.95]], ext: [[0.2, 0.375, 1]], faces: fan(4, 4) },
    triangle: { pts: [[0, 0], [0.72, 0.4], [0.4, 0.72]], ext: [[0.3, 0.3, 1]], faces: fan(3, 3) },
    // blade arrow: slanted wing and a tail that kicks out to the right
    shard: {
      pts: [[0, 0], [0.04, 0.86], [0.24, 0.7], [0.33, 0.99], [0.49, 0.91], [0.37, 0.64], [0.68, 0.6]],
      ext: [[0.16, 0.42, 1], [0.29, 0.62, 0.7], [0.41, 0.95, 0.3]],
      faces: [[0, 1, 7], [1, 2, 7], [7, 2, 8], [8, 2, 5], [8, 5, 6], [7, 8, 6], [0, 7, 6], [2, 3, 9], [9, 4, 5], [2, 9, 5]],
    },
    // paper plane: centre spine plus a keel down to the rear notch
    dart: fit({ pts: [[0, 0], ax(1, 0.42), ax(0.64, 0), ax(1, -0.42)], ext: [ax(0.42, 0, 1)], faces: fan(4, 4) }),
    // kite-cut gem: long point, wide shoulders, short flat back
    gem: gem([[0, 0], ax(0.6, 0.32), ax(0.92, 0.16), ax(0.92, -0.16), ax(0.6, -0.32)], ax(0.6, 0), 0.45),
    // flying wing with a W-shaped trailing edge and a raised spine
    stealth: fit({
      pts: [[0, 0], ax(0.86, 0.4), ax(0.74, 0.24), ax(0.88, 0.12), ax(0.76, 0), ax(0.88, -0.12), ax(0.74, -0.24), ax(0.86, -0.4)],
      ext: [ax(0.36, 0, 1), ax(0.6, 0, 0.7)],
      faces: [[0, 1, 8], [8, 1, 2], [8, 2, 9], [9, 2, 3], [9, 3, 4], [0, 8, 7], [8, 7, 6], [8, 6, 9], [9, 6, 5], [9, 5, 4]],
    }),
  };

  function norm(x, y) { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; }
  function norm3([x, y, z]) { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }

  // outward offset of each vertex by distance d (miter or round joins), used for bounds + hotspot
  function offsetPoly(pts, d, round) {
    const n = pts.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
    const sgn = area > 0 ? -1 : 1; // pick the normal side that points away from the interior
    return pts.map((c, i) => {
      const pr = pts[(i + n - 1) % n], nx = pts[(i + 1) % n];
      const e1 = norm(c[0] - pr[0], c[1] - pr[1]), e2 = norm(nx[0] - c[0], nx[1] - c[1]);
      const n1 = [-e1[1] * sgn, e1[0] * sgn], n2 = [-e2[1] * sgn, e2[0] * sgn];
      const m = norm(n1[0] + n2[0], n1[1] + n2[1]);
      const len = round ? d : d / Math.max(0.08, m[0] * n1[0] + m[1] * n1[1]);
      return [c[0] + m[0] * len, c[1] + m[1] * len];
    });
  }

  /* -> { path, rule, hot: [x, y], box: [x0, y0, x1, y1] } in canvas px */
  function build(W, H, p, k) {
    const S = Math.min(W, H), shape = SHAPES.includes(p.shape) ? p.shape : 'arrow';
    const ow = (p.outlineW + (p.outline2 ? p.outline2W : 0)) * k; // total outline width
    const path = new Path2D();

    if (CENTERED.includes(shape)) {
      const cx = W / 2, cy = H / 2, lw = p.lineW * k, R = Math.max(lw, (p.size * S) / 2 - ow - k);
      const box = [cx - R, cy - R, cx + R, cy + R];
      if (shape === 'ring') {
        const ri = Math.max(0, R - lw);
        path.arc(cx, cy, R, 0, U.TAU);
        path.moveTo(cx + ri, cy); path.arc(cx, cy, ri, 0, U.TAU);
        if (p.centerDot) { const dr = Math.min(ri * 0.8, lw * 0.75); path.moveTo(cx + dr, cy); path.arc(cx, cy, dr, 0, U.TAU); }
        return { path, rule: 'evenodd', hot: [cx, cy], box };
      }
      // cross: four arm rectangles (+ optional square dot); outlining rectangles keeps every edge outlined
      const h = lw / 2, g = Math.max(h, p.crossGap * k), len = R - g;
      if (p.crossGap * k <= h) {
        // no real gap: two solid bars, so the center is filled instead of an outlined hole
        path.rect(cx - R, cy - h, 2 * R, lw);
        path.rect(cx - h, cy - R, lw, 2 * R);
      } else if (len > 0) {
        path.rect(cx + g, cy - h, len, lw); path.rect(cx - R, cy - h, len, lw);
        path.rect(cx - h, cy + g, lw, len); path.rect(cx - h, cy - R, lw, len);
      }
      if (p.centerDot) path.rect(cx - h, cy - h, lw, lw);
      return { path, rule: 'nonzero', hot: [cx, cy], box };
    }

    const margin = k, round = p.join === 'round', a = (p.tilt * Math.PI) / 180;
    // (chamfered corners use bevel joins; their outline bounds are covered by the miter estimate)
    const sz = p.size * (S - 2 * margin - 2 * ow);
    const def = DEF[shape === 'arrow' && !p.tail ? 'arrowNoTail' : shape];
    const tf = ([x, y]) => [x * sz * p.slim, y * sz];
    let pts = U.rotPts(def.pts.map(tf), 0, 0, a);
    // relief vertices (outline corners before chamfering + raised ridge points), z in px
    const zs = p.facetDepth * sz * 0.12;
    let fv = pts.map(([x, y]) => [x, y, 0]).concat(U.rotPts(def.ext.map(tf), 0, 0, a).map(([x, y], i) => [x, y, def.ext[i][2] * zs]));
    if (p.join === 'bevel' && p.chamfer > 0) {
      const ch = p.chamfer * sz, out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const c = pts[i], pr = pts[i - 1], nx = pts[(i + 1) % pts.length];
        // at most 30% of each edge, so short edges (tail end) keep a straight middle part
        const d1 = Math.min(ch, Math.hypot(c[0] - pr[0], c[1] - pr[1]) * 0.3), d2 = Math.min(ch, Math.hypot(nx[0] - c[0], nx[1] - c[1]) * 0.3);
        const u1 = norm(pr[0] - c[0], pr[1] - c[1]), u2 = norm(nx[0] - c[0], nx[1] - c[1]);
        out.push([c[0] + u1[0] * d1, c[1] + u1[1] * d1], [c[0] + u2[0] * d2, c[1] + u2[1] * d2]);
      }
      pts = out;
    }
    // place the shape so its *outline* (incl. sharp miter tips) starts at the margin
    const outer = ow > 0 ? offsetPoly(pts, ow, round) : pts;
    const dx = margin - Math.min(...outer.map((q) => q[0])), dy = margin - Math.min(...outer.map((q) => q[1]));
    pts = pts.map(([x, y]) => [x + dx, y + dy]);
    fv = fv.map(([x, y, z]) => [x + dx, y + dy, z]);
    U.polyPath(path, pts);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    return { path, rule: 'nonzero', fv, faces: def.faces, hot: [outer[0][0] + dx, outer[0][1] + dy], box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  }

  function fillStyle(c, p, [x0, y0, x1, y1]) {
    if (p.fillMode === 'solid') return p.fill;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, r = Math.hypot(x1 - x0, y1 - y0) / 2;
    let g;
    if (p.fillMode === 'radial') g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
    else {
      const a = (p.gradAngle * Math.PI) / 180, dx = Math.cos(a) * r, dy = Math.sin(a) * r;
      g = c.createLinearGradient(cx - dx, cy - dy, cx + dx, cy + dy);
    }
    g.addColorStop(0, p.fill);
    g.addColorStop(1, p.fill2);
    return g;
  }

  /* low-poly facets: each relief triangle is lit by its 3D normal (Lambert, relative to a flat face).
     Faces are painted opaque as 50%-grey-centred tones on a layer (slightly enlarged, so no anti-alias
     seams), then hard-light blended onto the fill: lighter than grey brightens, darker shades. */
  function facets(c, p, sh, k, W, H) {
    if (!sh.fv || (p.facets <= 0 && p.facetLines <= 0)) return;
    const fv = sh.fv, a = (p.lightAngle * Math.PI) / 180, Lt = norm3([Math.cos(a), Math.sin(a), 1.1]);
    // face normals (z up), from the relief with at least a little depth so creases stay defined
    const nrm = sh.faces.map((f) => {
      const [A, B, C] = f.map((i) => fv[i]);
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const n = norm3([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
      return n[2] < 0 ? n.map((q) => -q) : n;
    });
    c.save();
    c.clip(sh.path, sh.rule);
    if (p.facets > 0) {
      const lay = U.canvas(W, H), lc = lay.getContext('2d'), grow = 0.75;
      sh.faces.forEach((f, fi) => {
        const [A, B, C] = f.map((i) => fv[i]), n = nrm[fi];
        const s = n[0] * Lt[0] + n[1] * Lt[1] + n[2] * Lt[2] - Lt[2]; // 0 = same as a flat face
        const t = (s > 0 ? s * 2.2 : s * 1.4) * p.facets;
        const g = Math.round(255 * Math.min(1, Math.max(0, 0.5 + 0.5 * t)));
        const mx = (A[0] + B[0] + C[0]) / 3, my = (A[1] + B[1] + C[1]) / 3;
        lc.fillStyle = `rgb(${g},${g},${g})`;
        lc.beginPath();
        [A, B, C].forEach(([x, y], i) => {
          const d = norm(x - mx, y - my);
          lc[i ? 'lineTo' : 'moveTo'](x + d[0] * grow, y + d[1] * grow);
        });
        lc.closePath();
        lc.fill();
      });
      c.globalCompositeOperation = 'hard-light';
      c.drawImage(lay, 0, 0);
      c.globalCompositeOperation = 'source-over';
    }
    if (p.facetLines > 0) {
      // only real creases: edges shared by two faces that are not coplanar
      // (outline edges belong to one face and are covered by the outline; a flat gem table has no creases)
      const seen = new Map();
      sh.faces.forEach((f, fi) => {
        for (let i = 0; i < 3; i++) {
          const key = [f[i], f[(i + 1) % 3]].sort((x, y) => x - y).join();
          (seen.get(key) || seen.set(key, []).get(key)).push(fi);
        }
      });
      c.beginPath();
      for (const [key, fs] of seen) {
        if (fs.length < 2) continue;
        const a1 = nrm[fs[0]], a2 = nrm[fs[1]];
        if (a1[0] * a2[0] + a1[1] * a2[1] + a1[2] * a2[2] > 0.9999) continue;
        const [i, j] = key.split(',').map(Number);
        c.moveTo(fv[i][0], fv[i][1]); c.lineTo(fv[j][0], fv[j][1]);
      }
      c.strokeStyle = p.facetLineColor; c.lineWidth = p.facetLines * k; c.lineCap = 'round';
      c.stroke();
    }
    c.restore();
  }

  /* inner highlight / inner shadow / gloss, all clipped to the shape */
  function shading(c, p, sh, k, W, H) {
    const a = (p.lightAngle * Math.PI) / 180, L = [Math.cos(a), Math.sin(a)];
    let outside = null;
    // dir -1: offset away from the light (lit edges), +1: toward the light (shadowed edges)
    const inner = (color, alpha, size, dir) => {
      if (alpha <= 0 || size <= 0) return;
      if (!outside) {
        outside = U.canvas(W, H);
        const oc = outside.getContext('2d');
        oc.fillRect(0, 0, W, H);
        oc.globalCompositeOperation = 'destination-out';
        oc.fill(sh.path, sh.rule);
      }
      c.save();
      c.clip(sh.path, sh.rule);
      c.shadowColor = U.rgba(color, alpha);
      c.shadowBlur = size * k;
      c.shadowOffsetX = dir * L[0] * size * k * 0.6;
      c.shadowOffsetY = dir * L[1] * size * k * 0.6;
      c.drawImage(outside, 0, 0); // the mask itself is clipped away; only its shadow lands inside
      c.restore();
    };
    inner(p.hlColor, p.highlight, p.hlSize, -1);
    inner('#000000', p.innerShadow, p.isSize, 1);

    if (p.gloss > 0) {
      const [x0, y0, x1, y1] = sh.box, mid = y0 + (y1 - y0) * 0.5;
      const g = c.createLinearGradient(0, y0, 0, mid);
      g.addColorStop(0, `rgba(255,255,255,${p.gloss})`);
      g.addColorStop(0.97, `rgba(255,255,255,${p.gloss * 0.25})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.save();
      c.clip(sh.path, sh.rule);
      c.fillStyle = g;
      c.fillRect(x0 - 2, y0 - 2, x1 - x0 + 4, mid - y0 + 2);
      c.restore();
    }
  }

  function draw(c, W, H, p) {
    const k = Math.min(W, H) / 64, sh = build(W, H, p, k);
    const ow = p.outlineW * k, ow2 = p.outline2 ? p.outline2W * k : 0;
    // chamfers are cut into the geometry itself; the outline then follows it with sharp joins
    // (a bevel *join* would also flatten the hotspot tip and double-cut every chamfered corner)
    c.lineJoin = !CENTERED.includes(p.shape) && p.join === 'round' ? 'round' : 'miter';
    c.miterLimit = 12;
    if (ow2 > 0) { c.lineWidth = 2 * (ow + ow2); c.strokeStyle = p.outline2Color; c.stroke(sh.path); }
    if (ow > 0) { c.lineWidth = 2 * ow; c.strokeStyle = p.outlineColor; c.stroke(sh.path); }
    c.fillStyle = fillStyle(c, p, sh.box);
    c.fill(sh.path, sh.rule);
    facets(c, p, sh, k, W, H);
    shading(c, p, sh, k, W, H);
    return sh.hot;
  }

  const shadeOn = (p) => p.highlight > 0 || p.innerShadow > 0;

  U.register({
    id: 'cursor',
    name: 'Cursor',
    desc: 'Mouse cursors with gradients, bevel shading, gloss, glow and hotspot',
    tags: ['UI'],
    bg: 'gray',
    icon: U.icon('<path d="M5 3l13 8-5.5 1.5L10 18z"/>'),
    params: [
      { type: 'section', label: 'Cursor' },
      { key: 'shape', label: 'Shape', type: 'select', default: 'arrow', options: [['arrow', 'Classic arrow'], ['pointer', 'Pointer'], ['triangle', 'Triangle'], ['shard', 'Shard blade'], ['dart', 'Paper-plane dart'], ['gem', 'Cut gem'], ['stealth', 'Stealth wing'], ['ring', 'Ring'], ['cross', 'Cross']] },
      { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.75 },
      { key: 'slim', label: 'Width', type: 'range', min: 0.4, max: 1.6, step: 0.01, default: 1, show: (p) => !CENTERED.includes(p.shape) },
      { key: 'tail', label: 'Tail', type: 'bool', default: true, show: is('arrow') },
      { key: 'tilt', label: 'Tilt', type: 'range', min: -45, max: 45, step: 1, default: 0, show: (p) => !CENTERED.includes(p.shape) },
      { key: 'lineW', label: 'Line thickness', type: 'range', min: 0.5, max: 12, step: 0.5, default: 3, show: is('ring', 'cross') },
      { key: 'crossGap', label: 'Center gap', type: 'range', min: 0, max: 16, step: 0.5, default: 3, show: is('cross') },
      { key: 'centerDot', label: 'Center dot', type: 'bool', default: true, show: is('ring', 'cross') },

      { type: 'section', label: 'Fill' },
      { key: 'fillMode', label: 'Fill', type: 'select', default: 'solid', options: [['solid', 'Solid'], ['linear', 'Linear gradient'], ['radial', 'Radial gradient']] },
      { key: 'fill', label: 'Color', type: 'color', default: '#ffffff' },
      { key: 'fill2', label: 'Color 2', type: 'color', default: '#b9c2be', show: (p) => p.fillMode !== 'solid' },
      { key: 'gradAngle', label: 'Gradient angle', type: 'range', min: -180, max: 180, step: 1, default: 90, show: (p) => p.fillMode === 'linear' },

      { type: 'section', label: 'Outline (px @ 64)' },
      { key: 'outlineW', label: 'Outline', type: 'range', min: 0, max: 6, step: 0.25, default: 1.5 },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#000000', show: (p) => p.outlineW > 0 },
      { key: 'join', label: 'Corners', type: 'select', default: 'miter', options: [['miter', 'Sharp'], ['round', 'Round'], ['bevel', 'Chamfered (cut)']], show: (p) => !CENTERED.includes(p.shape) },
      { key: 'chamfer', label: 'Chamfer size', type: 'range', min: 0, max: 0.08, step: 0.0025, default: 0.035, show: (p) => p.join === 'bevel' && !CENTERED.includes(p.shape), tip: 'Cuts every corner except the tip (the hotspot stays sharp)' },
      { key: 'outline2', label: 'Second outline', type: 'bool', default: false },
      { key: 'outline2W', label: 'Second width', type: 'range', min: 0.25, max: 6, step: 0.25, default: 1, show: (p) => p.outline2 },
      { key: 'outline2Color', label: 'Second color', type: 'color', default: '#ffffff', show: (p) => p.outline2 },

      { type: 'section', label: 'Facets (low-poly)', show: (p) => !CENTERED.includes(p.shape) },
      { key: 'facets', label: 'Facet shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => !CENTERED.includes(p.shape), tip: 'Splits the shape into lit / shaded triangles (uses the light direction)' },
      { key: 'facetDepth', label: 'Facet depth', type: 'range', min: 0.2, max: 2.5, step: 0.05, default: 1, show: (p) => !CENTERED.includes(p.shape) && p.facets > 0, tip: 'How steep the facets are: stronger light / dark contrast' },
      { key: 'facetLines', label: 'Facet lines', type: 'range', min: 0, max: 2, step: 0.05, default: 0, show: (p) => !CENTERED.includes(p.shape), tip: 'px @ 64' },
      { key: 'facetLineColor', label: 'Facet line color', type: 'color', default: '#ffffff', show: (p) => p.facetLines > 0 && !CENTERED.includes(p.shape) },

      { type: 'section', label: 'Shading' },
      { key: 'lightAngle', label: 'Light direction', type: 'range', min: -180, max: 180, step: 1, default: -135, show: (p) => shadeOn(p) || p.facets > 0, tip: '-135 = light from top-left' },
      { key: 'highlight', label: 'Inner highlight', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'hlSize', label: 'Highlight size', type: 'range', min: 0.25, max: 8, step: 0.25, default: 2, show: (p) => p.highlight > 0 },
      { key: 'hlColor', label: 'Highlight color', type: 'color', default: '#ffffff', show: (p) => p.highlight > 0 },
      { key: 'innerShadow', label: 'Inner shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'isSize', label: 'Inner shadow size', type: 'range', min: 0.25, max: 8, step: 0.25, default: 2.5, show: (p) => p.innerShadow > 0 },
      { key: 'gloss', label: 'Gloss', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },

      { type: 'section', label: 'Drop shadow' },
      { key: 'shadow', label: 'Drop shadow', type: 'bool', default: true },
      { key: 'shadowX', label: 'Offset X', type: 'range', min: -8, max: 8, step: 0.25, default: 1.5, show: (p) => p.shadow },
      { key: 'shadowY', label: 'Offset Y', type: 'range', min: -8, max: 8, step: 0.25, default: 2, show: (p) => p.shadow },
      { key: 'shadowBlur', label: 'Blur', type: 'range', min: 0, max: 10, step: 0.25, default: 2, show: (p) => p.shadow && !p.pixel },
      { key: 'shadowAlpha', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.shadow },
      { key: 'shadowColor', label: 'Color', type: 'color', default: '#000000', show: (p) => p.shadow },

      { type: 'section', label: 'Outer glow', collapsed: true },
      { key: 'glow', label: 'Outer glow', type: 'bool', default: false },
      { key: 'glowColor', label: 'Glow color', type: 'color', default: '#5fe3b0', show: (p) => p.glow },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 0.5, max: 16, step: 0.25, default: 4, show: (p) => p.glow },
      { key: 'glowAlpha', label: 'Glow strength', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, show: (p) => p.glow },

      { type: 'section', label: 'Pixel art', collapsed: true },
      { key: 'pixel', label: 'Pixel-art mode', type: 'bool', default: false, tip: 'Render on a small grid, hard alpha, nearest-neighbour upscale' },
      { key: 'grid', label: 'Grid', type: 'select', default: 32, options: [[16, '16 px'], [24, '24 px'], [32, '32 px'], [48, '48 px'], [64, '64 px']], show: (p) => p.pixel },
    ],
    presets: [
      // Realistic: desktop OS cursors
      { name: 'Classic desktop arrow', group: 'Realistic', values: { size: 0.6, slim: 0.92, outlineW: 1, join: 'miter', shadow: false } },
      { name: 'Modern soft arrow', group: 'Realistic', values: { fillMode: 'linear', fill2: '#e4e8ec', outlineW: 1.25, join: 'round', shadowX: 0.5, shadowY: 2.5, shadowBlur: 4, shadowAlpha: 0.35 } },
      { name: 'Black arrow', group: 'Realistic', values: { fill: '#111111', outlineColor: '#ffffff', outlineW: 1.5, shadowX: 1, shadowY: 1.5, shadowBlur: 3, shadowAlpha: 0.35 } },

      // Stylized
      { name: 'Candy gloss', group: 'Stylized', values: { shape: 'pointer', fillMode: 'linear', fill: '#ff7ab8', fill2: '#d0207a', outlineColor: '#5a0a32', outlineW: 1.5, join: 'round', gloss: 0.55, shadowAlpha: 0.3 } },
      { name: 'Comic thick outline', group: 'Stylized', values: { fill: '#ffe23a', outlineW: 3, join: 'round', tilt: -10, shadowX: 3, shadowY: 3, shadowBlur: 0, shadowAlpha: 1, shadowColor: '#000000' } },
      { name: 'Retro pixel arrow', group: 'Stylized', values: { pixel: true, grid: 16, size: 0.85, outlineW: 4, shadowX: 4, shadowY: 4, shadowAlpha: 0.5 } },
      { name: 'Pastel triangle', group: 'Stylized', values: { shape: 'triangle', fill: '#b8e6d0', outlineColor: '#ffffff', outlineW: 2, join: 'round', outline2: true, outline2W: 1, outline2Color: '#6a8f86', highlight: 0.5, hlSize: 2, shadowAlpha: 0.25, shadowBlur: 3 } },
      { name: 'Frosted glass', group: 'Stylized', values: { fillMode: 'radial', fill: '#f4faff', fill2: '#a8c8e0', outlineW: 1, outlineColor: '#4a6a85', join: 'round', highlight: 0.8, hlSize: 2.5, innerShadow: 0.3, gloss: 0.35, shadowAlpha: 0.25, shadowBlur: 5 } },
      { name: 'Paper cutout', group: 'Stylized', values: { shape: 'pointer', slim: 1.15, fill: '#f6efe0', outlineW: 0, innerShadow: 0.35, isSize: 3, shadowX: 2.5, shadowY: 3, shadowBlur: 1.5, shadowAlpha: 0.5 } },

      // Game-inspired UI
      { name: 'Fantasy RPG gold gauntlet', group: 'Game-inspired', values: { shape: 'pointer', slim: 0.9, fillMode: 'linear', fill: '#ffe08a', fill2: '#a8701a', gradAngle: 60, outlineW: 1.25, outlineColor: '#3a2208', outline2: true, outline2W: 1, outline2Color: '#d8b060', highlight: 0.7, hlSize: 1.5, innerShadow: 0.6, isSize: 2 } },
      { name: 'Dark RPG blood arrow', group: 'Game-inspired', values: { fillMode: 'linear', fill: '#d01818', fill2: '#4a0404', gradAngle: 60, outlineColor: '#160202', outlineW: 1.5, outline2: true, outline2W: 0.75, outline2Color: '#8a6a3a', highlight: 0.4, hlSize: 1.5, innerShadow: 0.5 } },
      { name: 'RTS command pointer', group: 'Game-inspired', values: { shape: 'triangle', size: 0.7, fillMode: 'linear', fill: '#7aff6a', fill2: '#1a8a2a', gradAngle: 45, outlineColor: '#06200a', outlineW: 1.25, highlight: 0.6, hlSize: 1.5 } },
      { name: 'Tactical shooter HUD', group: 'Game-inspired', values: { shape: 'triangle', slim: 0.85, fill: '#e8ecd8', outlineW: 1, outlineColor: '#2a3020', shadowX: 0, shadowY: 0, shadowBlur: 3, shadowAlpha: 0.8 } },
      { name: 'MMO stone arrow', group: 'Game-inspired', values: { fillMode: 'linear', fill: '#c8c0b0', fill2: '#6a6458', gradAngle: 60, outlineColor: '#1a1814', outlineW: 1.5, join: 'round', highlight: 0.8, hlSize: 1.25, innerShadow: 0.7, isSize: 1.75, tilt: -8 } },

      // Sci-fi
      { name: 'Neon cyan glow', group: 'Sci-fi', values: { fill: '#0a1a20', outlineColor: '#40f0ff', outlineW: 1.25, shadow: false, glow: true, glowColor: '#00e0ff', glowSize: 5, glowAlpha: 0.9 } },
      { name: 'Hologram triangle', group: 'Sci-fi', values: { shape: 'triangle', fillMode: 'linear', fill: '#7af8ff', fill2: '#2a6aff', gradAngle: 90, outlineW: 0.75, outlineColor: '#d8ffff', shadow: false, glow: true, glowColor: '#40a0ff', glowSize: 6, glowAlpha: 0.7 } },
      { name: 'Cyberpunk yellow', group: 'Sci-fi', values: { shape: 'pointer', slim: 1.2, tilt: 8, fill: '#fcee0a', outlineW: 1, outlineColor: '#111111', outline2: true, outline2W: 1, outline2Color: '#00f0ff', shadowX: 2.5, shadowY: 2.5, shadowBlur: 0, shadowAlpha: 1, shadowColor: '#ff003c' } },
      { name: 'Alien bio cursor', group: 'Sci-fi', values: { shape: 'pointer', slim: 0.8, fillMode: 'radial', fill: '#c8ff3a', fill2: '#2a7a0a', outlineColor: '#2a0a3a', outlineW: 1.5, join: 'round', gloss: 0.3, glow: true, glowColor: '#8aff2a', glowSize: 4, glowAlpha: 0.6, shadow: false } },
      // Edgy / polygonal
      { name: 'Faceted classic', group: 'Edgy / polygonal', values: { shape: 'arrow', fill: '#f6f6f6', outlineW: 1.25, outlineColor: '#111111', facets: 0.45, shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Folded paper arrow', group: 'Edgy / polygonal', values: { shape: 'arrow', fill: '#f3efe6', outlineW: 0.5, outlineColor: '#8a8272', facets: 0.6, facetDepth: 1.2, shadowX: 1.5, shadowY: 2.5, shadowBlur: 2, shadowAlpha: 0.4 } },
      { name: 'Angular arrow (cut corners)', group: 'Edgy / polygonal', values: { shape: 'arrow', fill: '#ffffff', outlineW: 1.5, outlineColor: '#000000', join: 'bevel', chamfer: 0.035, shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Shard blade', group: 'Edgy / polygonal', values: { shape: 'shard', fill: '#eef0f2', outlineW: 1.25, outlineColor: '#111317', facets: 0.6, facetLines: 0.25, facetLineColor: '#ffffff', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Obsidian shard', group: 'Edgy / polygonal', values: { shape: 'shard', fillMode: 'linear', fill: '#3a3a44', fill2: '#121216', gradAngle: 60, outlineW: 1.25, outlineColor: '#e6e6ec', facets: 0.8, facetLines: 0.3, facetLineColor: '#8a8a98', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.35 } },
      { name: 'Paper plane', group: 'Edgy / polygonal', values: { shape: 'dart', size: 0.8, fill: '#fbfaf6', outlineW: 0.75, outlineColor: '#2a2a2a', facets: 0.7, facetLines: 0.3, facetLineColor: '#b8b4aa', shadowX: 2, shadowY: 3.5, shadowBlur: 3, shadowAlpha: 0.3 } },
      { name: 'Crystal dart', group: 'Edgy / polygonal', values: { shape: 'dart', size: 0.8, fillMode: 'linear', fill: '#e8f8ff', fill2: '#6fb4e0', gradAngle: 60, outlineW: 1, outlineColor: '#1e3a58', facets: 0.75, facetLines: 0.4, facetLineColor: '#ffffff', glow: true, glowColor: '#9fe0ff', glowSize: 3, glowAlpha: 0.5, shadow: false } },
      { name: 'Ruby blade', group: 'Edgy / polygonal', values: { shape: 'dart', size: 0.8, slim: 0.85, fillMode: 'linear', fill: '#ff4a5a', fill2: '#8a0a1c', gradAngle: 60, outlineW: 1, outlineColor: '#2a0306', facets: 0.8, facetLines: 0.3, facetLineColor: '#ffb0b8', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Sapphire gem', group: 'Edgy / polygonal', values: { shape: 'gem', size: 0.8, fillMode: 'linear', fill: '#7fd0ff', fill2: '#2346c8', gradAngle: 60, outlineW: 1, outlineColor: '#0b1838', facets: 0.75, facetLines: 0.4, facetLineColor: '#d8f4ff', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Gold gem', group: 'Edgy / polygonal', values: { shape: 'gem', size: 0.8, fillMode: 'linear', fill: '#ffe28a', fill2: '#b37a14', gradAngle: 70, outlineW: 1, outlineColor: '#3a2405', facets: 0.8, facetLines: 0.35, facetLineColor: '#fff2c4', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Emerald gem', group: 'Edgy / polygonal', values: { shape: 'gem', size: 0.8, fillMode: 'linear', fill: '#6ef0a8', fill2: '#0a7a44', gradAngle: 60, outlineW: 1, outlineColor: '#04281a', facets: 0.8, facetLines: 0.35, facetLineColor: '#d2ffe6', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Stealth wing', group: 'Edgy / polygonal', values: { shape: 'stealth', size: 0.85, fillMode: 'linear', fill: '#626a74', fill2: '#2a2e34', gradAngle: 60, outlineW: 1, outlineColor: '#0d0f12', facets: 0.7, facetLines: 0.3, facetLineColor: '#9aa2ac', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Neon wireframe', group: 'Edgy / polygonal', values: { shape: 'stealth', size: 0.85, fill: '#06080c', outlineW: 1, outlineColor: '#3cf2ff', facetLines: 0.6, facetLineColor: '#3cf2ff', glow: true, glowColor: '#00d8ff', glowSize: 4, glowAlpha: 0.8, shadow: false } },
      { name: 'Origami pointer', group: 'Edgy / polygonal', values: { shape: 'pointer', fill: '#ffd6a0', outlineW: 0.75, outlineColor: '#6a4a24', facets: 0.6, facetDepth: 1.3, shadowX: 1.5, shadowY: 2.5, shadowBlur: 2, shadowAlpha: 0.35 } },
      { name: 'Prism triangle', group: 'Edgy / polygonal', values: { shape: 'triangle', fillMode: 'linear', fill: '#c8b8ff', fill2: '#5a3ad8', gradAngle: 45, outlineW: 1, outlineColor: '#1a0e48', facets: 0.75, facetLines: 0.35, facetLineColor: '#eee8ff', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      // Tactical: matte military palettes, chamfered cuts, crisp low shadows
      { name: 'Chamfered tactical', group: 'Tactical', values: { shape: 'arrow', fill: '#d6dbcf', outlineW: 1.25, outlineColor: '#1d2219', join: 'bevel', chamfer: 0.03, facets: 0.35, facetLines: 0.3, facetLineColor: '#f2f5ec', shadowX: 1, shadowY: 1.5, shadowBlur: 1, shadowAlpha: 0.6 } },
      { name: 'Olive drab', group: 'Tactical', values: { shape: 'arrow', slim: 0.92, fillMode: 'linear', fill: '#6b7350', fill2: '#454b32', gradAngle: 60, outlineW: 1, outlineColor: '#15170e', join: 'bevel', chamfer: 0.03, facets: 0.4, facetLines: 0.2, facetLineColor: '#a3ab84', shadowX: 1, shadowY: 1.5, shadowBlur: 1, shadowAlpha: 0.6 } },
      { name: 'Ranger green blade', group: 'Tactical', values: { shape: 'shard', fillMode: 'linear', fill: '#4e5a42', fill2: '#2c3326', gradAngle: 60, outlineW: 1, outlineColor: '#0e110b', join: 'bevel', chamfer: 0.02, facets: 0.55, facetLines: 0.2, facetLineColor: '#7d8a6c', shadowX: 1, shadowY: 1.5, shadowBlur: 1, shadowAlpha: 0.6 } },
      { name: 'Desert tan', group: 'Tactical', values: { shape: 'dart', size: 0.8, slim: 0.9, fill: '#c2ad84', outlineW: 1, outlineColor: '#2b2416', facets: 0.5, facetLines: 0.2, facetLineColor: '#e8dcc0', shadowX: 1, shadowY: 1.5, shadowBlur: 1, shadowAlpha: 0.55 } },
      { name: 'Coyote brown', group: 'Tactical', values: { shape: 'pointer', slim: 0.9, fill: '#7e6142', outlineW: 1, outlineColor: '#1e150b', join: 'bevel', chamfer: 0.025, facets: 0.5, facetLines: 0.2, facetLineColor: '#b39572', shadowX: 1, shadowY: 1.5, shadowBlur: 1, shadowAlpha: 0.6 } },
      { name: 'Urban grey', group: 'Tactical', values: { shape: 'arrow', slim: 0.92, fill: '#8b9094', outlineW: 1, outlineColor: '#121416', join: 'bevel', chamfer: 0.03, facets: 0.35, shadowX: 1, shadowY: 1.5, shadowBlur: 1, shadowAlpha: 0.6 } },
      { name: 'Gunmetal wing', group: 'Tactical', values: { shape: 'stealth', size: 0.8, fillMode: 'linear', fill: '#5c6166', fill2: '#25282b', gradAngle: 60, outlineW: 1, outlineColor: '#08090a', facets: 0.6, facetLines: 0.25, facetLineColor: '#8c939a', shadowX: 1, shadowY: 1.5, shadowBlur: 1, shadowAlpha: 0.6 } },
      { name: 'Matte black ops', group: 'Tactical', values: { shape: 'shard', fill: '#1b1d1f', outlineW: 0.75, outlineColor: '#6b7378', facets: 0.45, facetLines: 0.2, facetLineColor: '#3c4146', shadowX: 0.75, shadowY: 1.25, shadowBlur: 1, shadowAlpha: 0.7 } },
      { name: 'Night vision', group: 'Tactical', values: { shape: 'shard', fill: '#0a170b', outlineW: 0.75, outlineColor: '#7dff7a', facetLines: 0.35, facetLineColor: '#3bc43b', glow: true, glowColor: '#4dff4a', glowSize: 2.5, glowAlpha: 0.5, shadow: false } },
      { name: 'Laser designator', group: 'Tactical', values: { shape: 'dart', size: 0.8, slim: 0.85, fill: '#121416', outlineW: 0.75, outlineColor: '#ff3b30', facets: 0.4, facetLines: 0.3, facetLineColor: '#7a1a16', glow: true, glowColor: '#ff2a1f', glowSize: 2.5, glowAlpha: 0.45, shadow: false } },
      { name: 'HUD amber', group: 'Tactical', values: { shape: 'triangle', slim: 0.9, fill: '#14100a', outlineW: 0.75, outlineColor: '#ffb21a', facetLines: 0.3, facetLineColor: '#a8700a', glow: true, glowColor: '#ffa000', glowSize: 2.5, glowAlpha: 0.4, shadow: false } },
      { name: 'Arctic white', group: 'Tactical', values: { shape: 'arrow', slim: 0.92, fill: '#e9ecee', outlineW: 1, outlineColor: '#2a3036', join: 'bevel', chamfer: 0.03, facets: 0.35, facetLines: 0.2, facetLineColor: '#ffffff', shadowX: 1, shadowY: 1.5, shadowBlur: 1, shadowAlpha: 0.45 } },
      // Modern
      { name: 'Indigo accent', group: 'Modern', values: { fill: '#6366f1', outlineW: 1.5, outlineColor: '#ffffff', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Emerald accent', group: 'Modern', values: { shape: 'pointer', fill: '#10b981', outlineW: 1.5, outlineColor: '#ffffff', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Rose accent', group: 'Modern', values: { fill: '#f43f5e', outlineW: 1.5, outlineColor: '#ffffff', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Amber accent', group: 'Modern', values: { shape: 'triangle', fill: '#f59e0b', outlineW: 1.5, outlineColor: '#ffffff', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Sky accent', group: 'Modern', values: { fill: '#0ea5e9', outlineW: 1.5, outlineColor: '#ffffff', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Violet gradient', group: 'Modern', values: { fillMode: 'linear', fill: '#a78bfa', fill2: '#6d28d9', gradAngle: 60, outlineW: 1.25, outlineColor: '#ffffff', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Teal to blue', group: 'Modern', values: { shape: 'pointer', fillMode: 'linear', fill: '#2dd4bf', fill2: '#3b82f6', gradAngle: 45, outlineW: 1.25, outlineColor: '#ffffff', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Sunset gradient', group: 'Modern', values: { fillMode: 'linear', fill: '#fb923c', fill2: '#db2777', gradAngle: 60, outlineW: 1.25, outlineColor: '#ffffff', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Soft pastel lilac', group: 'Modern', values: { fill: '#e9d5ff', outlineW: 1.5, outlineColor: '#7c3aed', join: 'round', shadowX: 0, shadowY: 2, shadowBlur: 5, shadowAlpha: 0.2, shadowColor: '#4c1d95' } },
      { name: 'Mint fresh', group: 'Modern', values: { shape: 'triangle', fill: '#a7f3d0', outlineW: 1.5, outlineColor: '#065f46', join: 'round', shadowX: 0, shadowY: 2, shadowBlur: 5, shadowAlpha: 0.25, shadowColor: '#064e3b' } },
      { name: 'Dark mode accent', group: 'Modern', values: { fill: '#18181b', outlineW: 1.5, outlineColor: '#a78bfa', join: 'round', shadowX: 0, shadowY: 0, shadowBlur: 4, shadowAlpha: 0.5, shadowColor: '#7c3aed' } },
      { name: 'Glassy modern', group: 'Modern', values: { fillMode: 'linear', fill: '#ffffff', fill2: '#dbeafe', gradAngle: 90, outlineW: 1, outlineColor: '#94a3b8', join: 'round', highlight: 0.6, hlSize: 1.5, gloss: 0.2, shadowX: 0, shadowY: 3, shadowBlur: 6, shadowAlpha: 0.25, shadowColor: '#1e293b' } },
      // Greyscale
      { name: 'Minimal white', group: 'Greyscale', values: { fill: '#ffffff', outlineW: 1.25, outlineColor: '#111111', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Minimal black', group: 'Greyscale', values: { fill: '#0a0a0a', outlineW: 1.25, outlineColor: '#ffffff', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Slate', group: 'Greyscale', values: { fill: '#475569', outlineW: 1.25, outlineColor: '#f8fafc', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Zinc soft', group: 'Greyscale', values: { shape: 'pointer', fill: '#d4d4d8', outlineW: 1.25, outlineColor: '#27272a', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Graphite gradient', group: 'Greyscale', values: { fillMode: 'linear', fill: '#71717a', fill2: '#18181b', gradAngle: 60, outlineW: 1, outlineColor: '#e4e4e7', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Silver gradient', group: 'Greyscale', values: { fillMode: 'linear', fill: '#fafafa', fill2: '#a1a1aa', gradAngle: 60, outlineW: 1, outlineColor: '#27272a', join: 'round', highlight: 0.5, hlSize: 1.25, shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Mid grey triangle', group: 'Greyscale', values: { shape: 'triangle', fill: '#9ca3af', outlineW: 1.5, outlineColor: '#111827', join: 'round', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Outlined ghost', group: 'Greyscale', values: { fill: '#ffffff', outlineW: 1.75, outlineColor: '#3f3f46', outline2: true, outline2W: 0.75, outline2Color: '#ffffff', join: 'round', shadow: false } },
      { name: 'Charcoal shard', group: 'Greyscale', values: { shape: 'shard', fill: '#27272a', outlineW: 1.25, outlineColor: '#e4e4e7', facets: 0.7, facetLines: 0.3, facetLineColor: '#71717a', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
      { name: 'Grey low-poly gem', group: 'Greyscale', values: { shape: 'gem', size: 0.8, fill: '#a1a1aa', outlineW: 1, outlineColor: '#18181b', facets: 0.85, facetLines: 0.35, facetLineColor: '#f4f4f5', shadowX: 0.75, shadowY: 2, shadowBlur: 4, shadowAlpha: 0.3 } },
    ],
    render(ctx, W, H, p) {
      const k = Math.min(W, H) / 64;
      const layer = U.canvas(W, H);
      let hot, gw = W;
      if (p.pixel) {
        gw = W >= H ? p.grid : Math.max(1, Math.round((p.grid * W) / H));
        const gh = W >= H ? Math.max(1, Math.round((p.grid * H) / W)) : p.grid;
        const small = U.canvas(gw, gh), sc = small.getContext('2d');
        hot = draw(sc, gw, gh, p);
        const img = sc.getImageData(0, 0, gw, gh), d = img.data;
        for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
        sc.putImageData(img, 0, 0);
        const lc = layer.getContext('2d');
        lc.imageSmoothingEnabled = false;
        lc.drawImage(small, 0, 0, W, H);
        hot = [(Math.floor(hot[0]) + 0.5) / gw, (Math.floor(hot[1]) + 0.5) / gh];
      } else {
        hot = draw(layer.getContext('2d'), W, H, p);
        hot = [hot[0] / W, hot[1] / H];
      }

      // shadow-only passes: draw the layer far off-canvas and shift just its shadow back in
      const far = W * 4;
      const shadowPass = (color, ox, oy, blur, times) => {
        ctx.save();
        ctx.shadowColor = color; ctx.shadowBlur = blur;
        ctx.shadowOffsetX = ox + far; ctx.shadowOffsetY = oy;
        for (let i = 0; i < times; i++) ctx.drawImage(layer, -far, 0);
        ctx.restore();
      };
      if (p.shadow && p.shadowAlpha > 0) {
        if (p.pixel) {
          const cell = W / gw;
          shadowPass(U.rgba(p.shadowColor, p.shadowAlpha), Math.round((p.shadowX * gw) / 64) * cell, Math.round((p.shadowY * gw) / 64) * cell, 0, 1);
        } else shadowPass(U.rgba(p.shadowColor, p.shadowAlpha), p.shadowX * k, p.shadowY * k, p.shadowBlur * k, 1);
      }
      if (p.glow && p.glowAlpha > 0) shadowPass(U.rgba(p.glowColor, p.glowAlpha), 0, 0, p.glowSize * k, 2);
      ctx.drawImage(layer, 0, 0);

      return { hotspot: hot };
    },
  });
})();
