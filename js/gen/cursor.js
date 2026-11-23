/* Mouse cursor designer. Units are px on a 64×64 canvas. Reports the hotspot for the export size.
   Every shape is built as one Path2D so outline, fill and shading all share the same geometry. */
(function () {
  'use strict';
  const U = window.UGTG;
  const is = (...l) => (p) => l.includes(p.shape);
  const SHAPES = ['arrow', 'pointer', 'triangle', 'shard', 'dart', 'gem', 'stealth', 'ring', 'cross'];
  const CENTERED = ['ring', 'cross'];

  /* Shape definitions, tip (hotspot) at 0,0, y down, extent ~1.
     pts: outline polygon. keys: the outline corners that get a crease to the facet center (always incl. the tip, 0).
     c: the natural facet center. relief() turns this into a low-poly relief used for facet shading and lines. */
  const AX = (62 * Math.PI) / 180, UA = [Math.cos(AX), Math.sin(AX)], VA = [-Math.sin(AX), Math.cos(AX)];
  // symmetric shapes are authored along a 62° axis: a = distance along it, s = sideways
  const ax = (a, s) => [a * UA[0] + s * VA[0], a * UA[1] + s * VA[1]];
  function fit(def, m = 0.98) {
    const k = m / Math.max(...def.pts.map((q) => Math.max(q[0], q[1])));
    def.pts = def.pts.map(([x, y]) => [x * k, y * k]);
    def.c = [def.c[0] * k, def.c[1] * k];
    return def;
  }

  const DEF = {
    arrow: { pts: [[0, 0], [0, 0.86], [0.2, 0.68], [0.33, 0.98], [0.46, 0.93], [0.33, 0.63], [0.58, 0.63]], keys: [0, 1, 6], c: [0.19, 0.55] },
    arrowNoTail: { pts: [[0, 0], [0, 0.86], [0.22, 0.66], [0.6, 0.62]], keys: [0, 1, 3], c: [0.17, 0.46] },
    // folded along the line from the tip to the notch
    pointer: { pts: [[0, 0], [0.7, 0.52], [0.32, 0.6], [0.14, 0.95]], keys: [0, 1, 2, 3], c: [0.2, 0.375] },
    triangle: { pts: [[0, 0], [0.72, 0.4], [0.4, 0.72]], keys: [0, 1, 2], c: [0.3, 0.3] },
    // blade arrow: slanted wing and a tail that kicks out to the right
    shard: { pts: [[0, 0], [0.04, 0.86], [0.24, 0.7], [0.33, 0.99], [0.49, 0.91], [0.37, 0.64], [0.68, 0.6]], keys: [0, 1, 6], c: [0.2, 0.5] },
    // paper plane: centre spine plus a keel down to the rear notch
    dart: fit({ pts: [[0, 0], ax(1, 0.42), ax(0.64, 0), ax(1, -0.42)], keys: [0, 1, 2, 3], c: ax(0.42, 0) }),
    // kite-cut gem: long point, wide shoulders, short flat back
    gem: fit({ pts: [[0, 0], ax(0.6, 0.32), ax(0.92, 0.16), ax(0.92, -0.16), ax(0.6, -0.32)], keys: [0, 1, 2, 3, 4], c: ax(0.6, 0) }),
    // flying wing with a W-shaped trailing edge: creases to the wing tips and the rear centre
    stealth: fit({ pts: [[0, 0], ax(0.86, 0.4), ax(0.74, 0.24), ax(0.88, 0.12), ax(0.76, 0), ax(0.88, -0.12), ax(0.74, -0.24), ax(0.86, -0.4)], keys: [0, 1, 4, 7], c: ax(0.45, 0) }),
  };

  // distance along ray o + s·d (s > 0) to the first crossing of the polygon outline
  function rayHit(P, o, d) {
    let best = Infinity;
    for (let i = 0; i < P.length; i++) {
      const p = P[i], q = P[(i + 1) % P.length], e = [q[0] - p[0], q[1] - p[1]], w = [p[0] - o[0], p[1] - o[1]];
      const den = d[0] * e[1] - d[1] * e[0];
      if (Math.abs(den) < 1e-12) continue;
      const t = (w[0] * e[1] - w[1] * e[0]) / den, r = (w[0] * d[1] - w[1] * d[0]) / den;
      if (t > 1e-6 && r >= -1e-9 && r <= 1 + 1e-9 && t < best) best = t;
    }
    return best === Infinity ? 0 : best;
  }

  /* Low-poly relief: one raised center with a straight crease to each key corner, nothing else.
     Every stretch of outline between two neighbouring keys forms ONE flat face with the center (its in-between
     corners are put on that face's plane), so there are never extra edges.
     The center moves along the central axis (tip -> natural center -> far outline): along -1..0..1 = toward the
     tip .. natural spot .. toward the far end; side -1..1 = fraction of the way to the outline on either side
     (+ = clockwise side, the wing on an arrow). It always stays inside the shape. */
  function relief(def, along, side) {
    const P = def.pts, n = P.length, K = def.keys;
    const L0 = Math.hypot(def.c[0], def.c[1]), u = [def.c[0] / L0, def.c[1] / L0];
    const Lend = rayHit(P, [0, 0], u) || L0 / 0.7, t0 = L0 / Lend;
    const v = Math.max(-1, Math.min(1, along || 0));
    const t = v < 0 ? t0 + v * (t0 - 0.12) : t0 + v * (0.92 - t0);
    const a = [u[0] * t * Lend, u[1] * t * Lend], d = [u[1], -u[0]];
    const sd = Math.max(-1, Math.min(1, side || 0)) * 0.85;
    const off = sd >= 0 ? sd * rayHit(P, a, d) : sd * rayHit(P, a, [-d[0], -d[1]]);
    const c = [a[0] + d[0] * off, a[1] + d[1] * off];
    const z = new Array(n).fill(0), faces = [];
    K.forEach((ka, i) => {
      const kb = K[(i + 1) % K.length], face = [n, ka];
      const e = [P[kb][0] - P[ka][0], P[kb][1] - P[ka][1]];
      const dist = (q) => (q[0] - P[ka][0]) * -e[1] + (q[1] - P[ka][1]) * e[0];
      const dc = dist(c) || 1e-6;
      for (let j = (ka + 1) % n; j !== kb; j = (j + 1) % n) { face.push(j); z[j] = dist(P[j]) / dc; }
      face.push(kb);
      faces.push(face);
    });
    return { pts: P, ext: [[c[0], c[1], 1]], faces, z };
  }

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

    const margin = k, round = p.join === 'round';
    // (chamfered corners use bevel joins; their outline bounds are covered by the miter estimate)
    const sz = p.size * (S - 2 * margin - 2 * ow);
    const def = relief(DEF[shape === 'arrow' && !p.tail ? 'arrowNoTail' : shape], p.facetCenter, p.facetSide);
    const tf = ([x, y]) => [x * sz * p.slim, y * sz];
    // built untilted first (tilt is applied below, once its safe range is known)
    let pts = def.pts.map(tf);
    // relief vertices (outline corners before chamfering + raised ridge points), z in px
    const zs = p.facetDepth * sz * 0.12;
    let fv = pts.map(([x, y], i) => [x, y, def.z ? def.z[i] * zs : 0]).concat(def.ext.map(tf).map(([x, y], i) => [x, y, def.ext[i][2] * zs]));
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
    /* The tip (hotspot) must always be the top-left-most point of the drawn cursor: every other point of the
       outline must lie between "straight right" (0°) and "straight down" (90°) as seen from the tip.
       Sharp joins: test the mitered outer outline from its own tip. Round joins: the stroke is a disk around
       every point, so the plain outline from the plain tip decides. Tilt (a rigid rotation, which turns every
       direction by the same angle) is clamped to the range that keeps all points inside that quarter. */
    let outer = ow > 0 ? offsetPoly(pts, ow, round) : pts;
    const ref = round ? pts : outer;
    let lo = -Infinity, hi = Infinity;
    for (let i = 1; i < ref.length; i++) {
      const vx = ref[i][0] - ref[0][0], vy = ref[i][1] - ref[0][1];
      if (Math.hypot(vx, vy) < 1e-6) continue;
      const phi = Math.atan2(vy, vx);
      lo = Math.max(lo, -phi); hi = Math.min(hi, Math.PI / 2 - phi);
    }
    const want = (p.tilt * Math.PI) / 180;
    const a = lo <= hi ? Math.max(lo, Math.min(hi, want)) : (lo + hi) / 2; // (a shape wider than 90° can't comply; split the overflow)
    if (a !== 0) {
      pts = U.rotPts(pts, 0, 0, a);
      outer = U.rotPts(outer, 0, 0, a);
      fv = fv.map(([x, y, z]) => { const [rx, ry] = U.rotPts([[x, y]], 0, 0, a)[0]; return [rx, ry, z]; });
    }
    // anchor the tip's outline at the top-left margin (round joins: the stroke's disk around the tip)
    const tipX = round ? pts[0][0] - ow : outer[0][0], tipY = round ? pts[0][1] - ow : outer[0][1];
    const dx = margin - tipX, dy = margin - tipY;
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
    const ambient = p.lightMode === 'ambient';
    // face normals (z up); faces are flat polygons, the first three vertices (center + crease corner + next) span the plane
    const nrm = sh.faces.map((f) => {
      const [A, B, C] = f.slice(0, 3).map((i) => fv[i]);
      const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
      const n = norm3([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
      return n[2] < 0 ? n.map((q) => -q) : n;
    });
    c.save();
    c.clip(sh.path, sh.rule);
    if (p.facets > 0) {
      const lay = U.canvas(W, H), lc = lay.getContext('2d');
      lc.lineJoin = 'round'; lc.lineWidth = 1.5; // each face also stroked in its own tone: no anti-alias seams between faces
      sh.faces.forEach((f, fi) => {
        const n = nrm[fi];
        // 0 = same as a flat face; ambient: only the steepness counts, steeper faces darken whichever way they face
        const s = ambient ? (n[2] - 1) * 1.2 : n[0] * Lt[0] + n[1] * Lt[1] + n[2] * Lt[2] - Lt[2];
        const t = (s > 0 ? s * 2.2 : s * 1.4) * p.facets;
        const g = Math.round(255 * Math.min(1, Math.max(0, 0.5 + 0.5 * t)));
        lc.fillStyle = lc.strokeStyle = `rgb(${g},${g},${g})`;
        lc.beginPath();
        f.forEach((i, j) => lc[j ? 'lineTo' : 'moveTo'](fv[i][0], fv[i][1]));
        lc.closePath();
        lc.fill(); lc.stroke();
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
        for (let i = 0; i < f.length; i++) {
          const key = [f[i], f[(i + 1) % f.length]].sort((x, y) => x - y).join();
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
    // ambient light: no offset, so highlight and inner shadow run evenly along every edge
    const ambient = p.lightMode === 'ambient', off = ambient ? 0 : 1;
    // the mask is everything outside the shape, grown inward by `inset` px
    const mask = (inset) => {
      const m = U.canvas(W, H), oc = m.getContext('2d');
      oc.fillRect(0, 0, W, H);
      oc.globalCompositeOperation = 'destination-out';
      oc.fill(sh.path, sh.rule);
      if (inset > 0) { oc.globalCompositeOperation = 'source-over'; oc.lineWidth = 2 * inset; oc.lineJoin = 'round'; oc.stroke(sh.path); }
      return m;
    };
    // dir -1: offset away from the light (lit edges), +1: toward the light (shadowed edges)
    const inner = (color, alpha, size, dir, inset) => {
      if (alpha <= 0 || size <= 0) return;
      c.save();
      c.clip(sh.path, sh.rule);
      c.shadowColor = U.rgba(color, alpha);
      c.shadowBlur = size * k;
      c.shadowOffsetX = off * dir * L[0] * size * k * 0.6;
      c.shadowOffsetY = off * dir * L[1] * size * k * 0.6;
      c.drawImage(mask(inset), 0, 0); // the mask itself is clipped away; only its shadow lands inside
      c.restore();
    };
    // ambient with both on: the highlight sits a little inside the dark edge instead of under it (an even bevel)
    const hlInset = ambient && p.innerShadow > 0 ? p.isSize * k * 0.4 : 0;
    inner(p.hlColor, p.highlight, p.hlSize, -1, hlInset);
    inner('#000000', p.innerShadow, p.isSize, 1, 0);

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
    desc: 'Mouse cursors with outline, gradient, bevel, gloss and glow, exported with their hotspot position',
    uses: ['Custom pointer graphics for game menus and RTS or RPG interfaces, with the hotspot ready for the engine\'s cursor setup.', 'Themed cursors for websites and desktop applications.'],
    tags: ['UI'],
    bg: 'gray',
    icon: U.icon('<path d="M5 3l13 8-5.5 1.5L10 18z"/>'),
    params: [
      { type: 'section', label: 'Cursor' },
      { key: 'shape', label: 'Shape', type: 'select', default: 'arrow', options: [['arrow', 'Classic arrow'], ['pointer', 'Pointer'], ['triangle', 'Triangle'], ['shard', 'Shard blade'], ['dart', 'Paper-plane dart'], ['gem', 'Cut gem'], ['stealth', 'Stealth wing'], ['ring', 'Ring'], ['cross', 'Cross']] },
      { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.75 },
      { key: 'slim', label: 'Width', type: 'range', min: 0.4, max: 1.6, step: 0.01, default: 1, show: (p) => !CENTERED.includes(p.shape) },
      { key: 'tail', label: 'Tail', type: 'bool', default: true, show: is('arrow') },
      { key: 'tilt', label: 'Tilt', type: 'range', min: -45, max: 45, step: 1, default: 0, show: (p) => !CENTERED.includes(p.shape), tip: 'Rotates around the tip. Limited per shape, so the tip always stays the top-left-most point of the cursor' },
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
      { key: 'facetCenter', label: 'Facet center', type: 'range', min: -1, max: 1, step: 0.01, default: 0, show: (p) => !CENTERED.includes(p.shape) && (p.facets > 0 || p.facetLines > 0), tip: 'Where all creases meet, moved along the central axis: - toward the tip, + toward the far end (0 = the shape\'s natural spot)' },
      { key: 'facetSide', label: 'Facet center offset', type: 'range', min: -1, max: 1, step: 0.01, default: 0, show: (p) => !CENTERED.includes(p.shape) && (p.facets > 0 || p.facetLines > 0), tip: 'Moves the meeting point sideways off the central axis, as a fraction of the way to the outline: - one side, + the other (the wing on an arrow)' },
      { key: 'facetLines', label: 'Facet lines', type: 'range', min: 0, max: 2, step: 0.05, default: 0, show: (p) => !CENTERED.includes(p.shape), tip: 'px @ 64' },
      { key: 'facetLineColor', label: 'Facet line color', type: 'color', default: '#ffffff', show: (p) => p.facetLines > 0 && !CENTERED.includes(p.shape) },

      { type: 'section', label: 'Shading' },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'angled', options: [['angled', 'Angled (light angle)'], ['ambient', 'Ambient (soft, no direction)']], show: (p) => shadeOn(p) || p.facets > 0, tip: 'Ambient: soft light from all around: the inner highlight and inner shadow run evenly along every edge and steeper facets darken evenly, whichever way they face' },
      { key: 'lightAngle', label: 'Light direction', type: 'range', min: -180, max: 180, step: 1, default: -135, show: (p) => (shadeOn(p) || p.facets > 0) && p.lightMode !== 'ambient', tip: '-135 = light from top-left' },
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

      ...U.wearParams(),
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },
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
      // Post-apocalyptic: rust, scrap, dirt and wear
      { name: 'Scavenger cursor (rusted)', group: 'Post-apocalyptic', values: { shape: 'arrow', fillMode: 'linear', fill: '#b8432a', fill2: '#6a1e10', gradAngle: 60, outlineW: 2.5, outlineColor: '#1c120c', colorNoise: 0.45, noiseColor: '#5a3a1a', noiseScale: 4, brightNoise: 0.15, distort: 0.06, grunge: 0.3, grungeType: 'chipped', grungeScale: 6, edgeWear: 0.6, dirt: 0.4, dirtColor: '#2a1a0c', scratches: 0.4, scratches: 0.25, shadowAlpha: 0.5, seed: 31 } },
      { name: 'Scrap metal pointer', group: 'Post-apocalyptic', values: { shape: 'shard', fillMode: 'linear', fill: '#7a6a56', fill2: '#3a3026', gradAngle: 60, outlineW: 2, outlineColor: '#15100b', facets: 0.45, colorNoise: 0.45, noiseColor: '#5a3a1a', noiseScale: 4, brightNoise: 0.15, distort: 0.06, grunge: 0.3, grungeType: 'chipped', grungeScale: 6, edgeWear: 0.6, dirt: 0.4, dirtColor: '#2a1a0c', scratches: 0.4, noiseColor: '#7a3e18', scratches: 0.3, shadowAlpha: 0.5, seed: 13 } },
      { name: 'Bone-white wasteland', group: 'Post-apocalyptic', values: { shape: 'arrow', fill: '#d8d0bc', outlineW: 2, outlineColor: '#2a2420', colorNoise: 0.3, noiseColor: '#8a7a5a', noiseScale: 5, distort: 0.05, grunge: 0.22, grungeType: 'speckle', grungeScale: 9, edgeWear: 0.45, dirt: 0.5, dirtColor: '#4a3a24', scratches: 0.3, shadowAlpha: 0.45, seed: 5 } },
      { name: 'Radiation cursor', group: 'Post-apocalyptic', values: { shape: 'pointer', fillMode: 'linear', fill: '#c8e03a', fill2: '#5a7a10', gradAngle: 60, outlineW: 2, outlineColor: '#141608', glow: true, glowColor: '#b4ff3a', glowSize: 3, glowAlpha: 0.6, colorNoise: 0.3, noiseColor: '#3a4a10', distort: 0.05, grunge: 0.25, grungeType: 'chipped', grungeScale: 7, edgeWear: 0.5, dirt: 0.35, scratches: 0.25, shadow: false, seed: 9 } },
    ],
    render(ctx, W, H, p) {
      const k = Math.min(W, H) / 64;
      let layer = U.canvas(W, H);
      let hot, gw = W;
      /* wear (noise, grunge, distortion) on the drawn cursor, before shadow and glow, so they follow the worn
         shape. The tip stays intact: the unworn cursor is blended back in a small soft circle around the hotspot. */
      const wear = (cv, w, h, hp) => {
        if (!U.wearActive(p)) return cv;
        const S = Math.min(w, h), F = U.wearFields(w, h, p, S, cv);
        const out = U.imageCanvas(U.wearApply(cv, p, F)), oc = out.getContext('2d');
        U.wearScratches(oc, w, h, p, S);
        if (hp) {
          const r = Math.max(2, (S / 64) * 5), keep = U.canvas(w, h), kc = keep.getContext('2d');
          kc.drawImage(cv, 0, 0);
          kc.globalCompositeOperation = 'destination-in';
          const g = kc.createRadialGradient(hp[0], hp[1], 0, hp[0], hp[1], r);
          g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
          kc.fillStyle = g; kc.fillRect(0, 0, w, h);
          oc.drawImage(keep, 0, 0);
        }
        return out;
      };
      if (p.pixel) {
        gw = W >= H ? p.grid : Math.max(1, Math.round((p.grid * W) / H));
        const gh = W >= H ? Math.max(1, Math.round((p.grid * H) / W)) : p.grid;
        let small = U.canvas(gw, gh);
        hot = draw(small.getContext('2d'), gw, gh, p);
        small = wear(small, gw, gh, CENTERED.includes(p.shape) ? null : hot);
        const sc = small.getContext('2d');
        const img = sc.getImageData(0, 0, gw, gh), d = img.data;
        for (let i = 3; i < d.length; i += 4) d[i] = d[i] >= 110 ? 255 : 0;
        sc.putImageData(img, 0, 0);
        const lc = layer.getContext('2d');
        lc.imageSmoothingEnabled = false;
        lc.drawImage(small, 0, 0, W, H);
        hot = [(Math.floor(hot[0]) + 0.5) / gw, (Math.floor(hot[1]) + 0.5) / gh];
      } else {
        hot = draw(layer.getContext('2d'), W, H, p);
        layer = wear(layer, W, H, CENTERED.includes(p.shape) ? null : hot);
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
