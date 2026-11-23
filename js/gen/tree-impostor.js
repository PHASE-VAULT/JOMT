/* Tree Impostor: a procedural 3D tree (trunk with root flare, recursive branches, leaves / needles /
   palm leaflets) rendered from many view directions into one atlas for impostor and billboard LODs:
   a single card, a ring of side views, a hemi-octahedral or a full octahedral grid.
   A small software rasterizer with a z-buffer (capsule branches, oriented leaf cards) gives exact
   albedo, normal (view or object space), depth and coverage per frame. Ambient occlusion and the sun
   shadow are baked once per tree from depth maps rendered from the sun and a set of sky directions,
   so every frame of the atlas shows the same lighting on the same leaf. */
(function () {
  'use strict';
  const U = window.UGTG;
  const TAU = Math.PI * 2, DEG = Math.PI / 180, GOLD = 2.39996323;

  /* ---------- vectors ---------- */
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const UP = [0, 1, 0], XA = [1, 0, 0];
  const norm = (a, f) => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : f || [0, 1, 0];
  };
  const perp = (d) => norm(Math.abs(d[1]) < 0.9 ? cross(d, UP) : cross(d, XA), [1, 0, 0]);
  const randUnit = (rnd) => {
    const z = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - z * z);
    return [s * Math.cos(a), z, s * Math.sin(a)];
  };
  // direction at angle `th` away from `d`, turned by `ph` around it (`e1` = reference perpendicular)
  const cone = (d, e1, th, ph) => {
    const e2 = cross(d, e1), s = Math.sin(th), c = Math.cos(th), cp = Math.cos(ph), sp = Math.sin(ph);
    return norm([d[0] * c + (e1[0] * cp + e2[0] * sp) * s, d[1] * c + (e1[1] * cp + e2[1] * sp) * s, d[2] * c + (e1[2] * cp + e2[2] * sp) * s]);
  };

  /* crown outline: length of the main branches over the branching zone (u = 0 bottom … 1 top) */
  const CROWN = {
    ellipsoid: (u) => 0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, u * 0.85 + 0.1)),
    heart: (u) => 0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, Math.pow(u, 1.5) * 0.9 + 0.08)),
    teardrop: (u) => 0.3 + 0.7 * Math.sin(Math.PI * Math.min(1, Math.pow(u, 0.6) * 0.9 + 0.08)),
    cone: (u) => 1 - 0.85 * u,
    vase: (u) => 0.25 + 0.75 * u,
    cylinder: (u) => (u > 0.85 ? 1 - (u - 0.85) * 3 : 1),
  };
  const SHAPES = { oval: 0, round: 1, lobed: 2, needle: 3 };

  /* ---------- tree geometry (trunk height = 1 unit, base at the origin, Y up) ---------- */
  function buildTree(p) {
    const rnd = U.rng((p.seed | 0) * 7919 + 17);
    const segs = [], leaves = [];
    const form = p.form, lvMax = form === 'palm' ? 1 : Math.max(1, p.levels | 0);
    const LS = p.leafSize, leafOn = (p.leafCount | 0) > 0 && LS > 0;
    const cA = U.hex(p.leafA), cB = U.hex(p.leafB), cX = U.hex(p.accent), bark = U.hex(p.barkColor);
    const la = p.leafAngle * DEG, minR = 0.0008;

    const leafColor = (cr, acc) => {
      const lr = rnd();
      let c = mix3(cA, cB, U.clamp(0.5 + (cr - 0.5) * p.leafVar * 1.4 + (lr - 0.5) * p.leafVar * 0.7));
      if (acc) c = mix3(c, cX, 0.65 + 0.35 * lr);
      return scl(c, 1 + (rnd() - 0.5) * 0.16);
    };
    const addLeaf = (c, ax, n, L, Wd, col) => {
      ax = norm(ax);
      n = norm(sub(n, scl(ax, dot(n, ax))), perp(ax));
      leaves.push({ c, a: ax, n, b: cross(n, ax), L, W: Wd, col, ao: 1, sh: 1 });
    };
    const facingN = (n0) => norm(mix3(n0, UP, p.facing), UP);
    const droop = (ax) => norm(sub(ax, scl(UP, p.leafDroop)), ax);

    // point + direction at t (0..1) along a polyline
    const along = (pts, t) => {
      const n = pts.length - 1, f = U.clamp(t) * n, i = Math.min(n - 1, Math.floor(f)), k = f - i;
      return [mix3(pts[i], pts[i + 1], k), norm(sub(pts[i + 1], pts[i]))];
    };

    function leavesOn(pts) {
      const cr = rnd(), acc = rnd() < p.accentAmt, cnt = p.leafCount | 0;
      for (let i = 0; i < cnt; i++) {
        const L = LS * 0.5 * (1 - p.leafSizeVar * rnd()), col = leafColor(cr, acc);
        if (p.leafArr === 'pinnate') {
          // leaflet pairs along both sides of the frond, short at its base and tip
          const u = (i + 0.5) / cnt, t = 1 - p.leafAlong + p.leafAlong * u;
          const [pos, d] = along(pts, t);
          const e = norm(cross(d, UP), perp(d));
          const LL = L * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.15 + 0.85 * u)));
          for (const s of [-1, 1]) {
            const ax = droop(norm(add(scl(e, s * Math.sin(la)), scl(d, Math.cos(la)))));
            addLeaf(add(pos, scl(ax, LL)), ax, facingN(norm(cross(ax, d), UP)), LL, LL * p.leafWidth, col);
          }
        } else if (p.leafArr === 'brush') {
          // needles / leaves all around the twig (bottlebrush)
          const t = 1 - p.leafAlong * ((i + rnd()) / cnt);
          const [pos, d] = along(pts, t);
          const ax = droop(cone(d, perp(d), la * (0.8 + 0.4 * rnd()), rnd() * TAU));
          addLeaf(add(pos, scl(ax, L * 0.95)), ax, facingN(randUnit(rnd)), L, L * p.leafWidth, col);
        } else {
          // clumps around the outer part of the twig
          const t = 1 - p.leafAlong * Math.pow(rnd(), 0.7);
          const [pos, d] = along(pts, t);
          const ax = droop(cone(d, perp(d), la * (0.5 + rnd()), rnd() * TAU));
          const c = add(add(pos, scl(randUnit(rnd), p.cluster * LS * rnd())), scl(ax, L * 0.8));
          addLeaf(c, ax, facingN(randUnit(rnd)), L, L * p.leafWidth, col);
        }
      }
    }

    function grow(start, dir, length, r0, lv, trop) {
      const steps = lv === 0 ? 12 : lv === 1 ? 8 : lv === 2 ? 6 : 4, st = length / steps;
      const pts = [start];
      let pos = start, d = dir;
      for (let i = 1; i <= steps; i++) {
        const g = randUnit(rnd);
        d = norm(add(add(d, scl(g, p.gnarl * (lv === 0 ? 0.12 : 0.3))), scl(UP, (trop * (lv === 0 ? 1 : 2.2)) / steps)), d);
        pos = add(pos, scl(d, st));
        pts.push(pos);
      }
      const tipR = lv === 0 ? (form === 'palm' ? 0.7 : 0.25) : 0.35;
      const rAt = (t) => {
        let r = r0 * (1 - (1 - tipR) * t);
        if (lv === 0 && p.flare > 0 && t < 0.1) r *= 1 + p.flare * Math.pow(1 - t / 0.1, 2);
        return Math.max(r, minR);
      };
      for (let i = 0; i < steps; i++) {
        const tone = 1 + (rnd() - 0.5) * p.barkVar * 2;
        segs.push({ a: pts[i], b: pts[i + 1], ra: rAt(i / steps), rb: rAt((i + 1) / steps), col: scl(bark, tone), ao0: 1, ao1: 1, sh0: 1, sh1: 1 });
      }
      return { pts, rAt };
    }

    function spawn(br, length, lv) {
      if (lv >= lvMax) { if (leafOn) leavesOn(br.pts); return; }
      const top = lv === 0, count = top ? p.branches | 0 : p.children | 0;
      const t0 = top ? p.branchStart : p.childStart, t1 = top ? 0.98 : 0.96;
      const perW = Math.max(1, p.whorlSize | 0), nW = Math.ceil(count / perW), phase = rnd() * TAU;
      for (let k = 0; k < count; k++) {
        let t, ph;
        if (top && form === 'palm') { t = 1; ph = k * GOLD + rnd() * 0.3; }
        else if (top && form === 'whorled') {
          const w = Math.floor(k / perW), j = k % perW;
          t = t0 + ((t1 - t0) * (w + 0.5 + (rnd() - 0.5) * 0.25)) / nW;
          ph = (j / perW) * TAU + w * 0.9 + (rnd() - 0.5) * 0.3;
        } else {
          t = t0 + ((t1 - t0) * (k + 0.25 + 0.5 * rnd())) / Math.max(1, count);
          ph = phase + k * GOLD + (rnd() - 0.5) * 0.5;
        }
        const [pos, d] = along(br.pts, t);
        const th = (p.angle + (rnd() - 0.5) * 2 * p.angleVar) * DEG;
        const cd = cone(d, perp(d), th, ph);
        let cl;
        if (top) cl = form === 'palm' ? p.branchLen : p.branchLen * (CROWN[p.crown] || CROWN.ellipsoid)(U.clamp((t - t0) / Math.max(1e-3, t1 - t0)));
        else cl = length * p.lenRatio * (1 - 0.45 * t);
        cl *= 0.8 + 0.4 * rnd();
        const child = grow(pos, cd, cl, br.rAt(t) * p.radRatio, lv + 1, p.tropism);
        spawn(child, cl, lv + 1);
      }
    }

    if (form === 'multi') {
      const n = Math.max(1, p.stems | 0);
      for (let s = 0; s < n; s++) {
        const dir = cone(UP, XA, p.stemSpread * (0.4 + 0.6 * rnd()) * DEG, (s / n) * TAU + rnd() * 0.6);
        const base = [(rnd() - 0.5) * p.trunkR * 3, 0, (rnd() - 0.5) * p.trunkR * 3];
        const len = 0.65 + 0.35 * rnd();
        spawn(grow(base, dir, len, p.trunkR * 0.6, 0, p.trunkCurve), len, 0);
      }
    } else {
      const dir = cone(UP, XA, p.lean * DEG, rnd() * TAU);
      spawn(grow([0, 0, 0], dir, 1, p.trunkR, 0, p.trunkCurve), 1, 0);
    }

    // bounds: box, bounding sphere, radius around the trunk axis and from the pivot
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    const pts = [];
    for (const s of segs) { pts.push([s.a, s.ra], [s.b, s.rb]); }
    for (const l of leaves) pts.push([l.c, l.L]);
    if (!pts.length) pts.push([[0, 0, 0], 0.1]);
    for (const [q, r] of pts) for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], q[i] - r); mx[i] = Math.max(mx[i], q[i] + r); }
    const center = scl(add(mn, mx), 0.5);
    let R = 1e-3, Rxz = 1e-3, Rp = 1e-3;
    for (const [q, r] of pts) {
      R = Math.max(R, Math.hypot(q[0] - center[0], q[1] - center[1], q[2] - center[2]) + r);
      Rxz = Math.max(Rxz, Math.hypot(q[0], q[2]) + r);
      Rp = Math.max(Rp, Math.hypot(q[0], q[1], q[2]) + r);
    }
    return { segs, leaves, center, R, Rxz, Rp, ymin: Math.min(0, mn[1]), ymax: mx[1], shape: SHAPES[p.leafShape] || 0, bulge: p.bulge, fold: p.fold };
  }

  /* ---------- rasterizer ----------
     View V: r / u / d = right, up, toward-camera axes; C = projection origin; scale px per unit;
     cx, cy = pixel position of C. Buffer B: w, h, z (larger = closer) and, when `full`, normal,
     albedo, ao, sun visibility and kind (0 empty, 1 bark, 2 leaf). */
  function viewFor(d) {
    const r = Math.abs(d[1]) > 0.999 ? [1, 0, 0] : norm(cross(UP, d));
    return { d, r, u: cross(d, r) };
  }

  function gbuf(n) {
    return {
      w: 0, h: 0, z: new Float32Array(n), kind: new Uint8Array(n),
      nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n),
      cr: new Float32Array(n), cg: new Float32Array(n), cb: new Float32Array(n),
      ao: new Float32Array(n), sh: new Float32Array(n),
    };
  }

  function raster(T, V, B, full) {
    const [r0, r1, r2] = V.r, [u0, u1, u2] = V.u, [d0, d1, d2] = V.d, C = V.C;
    const s = V.scale, cx = V.cx, cy = V.cy, w = B.w, h = B.h, Z = B.z;
    const minPx = full ? 0.5 : 0.7;

    for (const S of T.segs) {
      let ox = S.a[0] - C[0], oy = S.a[1] - C[1], oz = S.a[2] - C[2];
      const ax = cx + (ox * r0 + oy * r1 + oz * r2) * s, ay = cy - (ox * u0 + oy * u1 + oz * u2) * s, az = ox * d0 + oy * d1 + oz * d2;
      ox = S.b[0] - C[0]; oy = S.b[1] - C[1]; oz = S.b[2] - C[2];
      const bx = cx + (ox * r0 + oy * r1 + oz * r2) * s, by = cy - (ox * u0 + oy * u1 + oz * u2) * s, bz = ox * d0 + oy * d1 + oz * d2;
      const ra = Math.max(S.ra * s, minPx), rb = Math.max(S.rb * s, minPx), rm = Math.max(ra, rb);
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - rm)), x1 = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + rm));
      const y0 = Math.max(0, Math.floor(Math.min(ay, by) - rm)), y1 = Math.min(h - 1, Math.ceil(Math.max(ay, by) + rm));
      if (x0 > x1 || y0 > y1) continue;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, il2 = l2 > 1e-9 ? 1 / l2 : 0, dz = bz - az, dr = rb - ra;
      const col = S.col;
      for (let y = y0; y <= y1; y++) {
        const qy = y + 0.5;
        for (let x = x0; x <= x1; x++) {
          const qx = x + 0.5;
          let t = ((qx - ax) * dx + (qy - ay) * dy) * il2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = qx - (ax + dx * t), ey = qy - (ay + dy * t), q2 = ex * ex + ey * ey, rr = ra + dr * t;
          if (q2 >= rr * rr) continue;
          const hh = Math.sqrt(rr * rr - q2), z = az + dz * t + hh / s, i = y * w + x;
          if (z <= Z[i]) continue;
          Z[i] = z;
          if (!full) continue;
          const inv = 1 / rr, vx = ex * inv, vy = -ey * inv, vz = hh * inv;
          B.nx[i] = vx * r0 + vy * u0 + vz * d0; B.ny[i] = vx * r1 + vy * u1 + vz * d1; B.nz[i] = vx * r2 + vy * u2 + vz * d2;
          B.cr[i] = col[0]; B.cg[i] = col[1]; B.cb[i] = col[2];
          B.ao[i] = S.ao0 + (S.ao1 - S.ao0) * t; B.sh[i] = S.sh0 + (S.sh1 - S.sh0) * t;
          B.kind[i] = 1;
        }
      }
    }

    const shape = T.shape, bulge = T.bulge, fold = T.fold;
    for (const Lf of T.leaves) {
      const ox = Lf.c[0] - C[0], oy = Lf.c[1] - C[1], oz = Lf.c[2] - C[2];
      const sx = cx + (ox * r0 + oy * r1 + oz * r2) * s, sy = cy - (ox * u0 + oy * u1 + oz * u2) * s, sz = ox * d0 + oy * d1 + oz * d2;
      const a = Lf.a, b = Lf.b, L = Lf.L, Wd = Lf.W;
      const Ax = (a[0] * r0 + a[1] * r1 + a[2] * r2) * L * s, Ay = -(a[0] * u0 + a[1] * u1 + a[2] * u2) * L * s, Az = (a[0] * d0 + a[1] * d1 + a[2] * d2) * L;
      const Bx = (b[0] * r0 + b[1] * r1 + b[2] * r2) * Wd * s, By = -(b[0] * u0 + b[1] * u1 + b[2] * u2) * Wd * s, Bz = (b[0] * d0 + b[1] * d1 + b[2] * d2) * Wd;
      const det = Ax * By - Bx * Ay;
      if (Math.abs(det) < 1e-3) continue; // edge-on
      const ex = Math.abs(Ax) + Math.abs(Bx), ey = Math.abs(Ay) + Math.abs(By);
      const x0 = Math.max(0, Math.floor(sx - ex)), x1 = Math.min(w - 1, Math.ceil(sx + ex));
      const y0 = Math.max(0, Math.floor(sy - ey)), y1 = Math.min(h - 1, Math.ceil(sy + ey));
      if (x0 > x1 || y0 > y1) continue;
      const id = 1 / det, n = Lf.n, fs = n[0] * d0 + n[1] * d1 + n[2] * d2 >= 0 ? 1 : -1;
      const back = fs < 0, col = Lf.col, rib = (shape === 0 || shape === 2) && Wd * s > 3;
      for (let y = y0; y <= y1; y++) {
        const qy = y + 0.5 - sy;
        for (let x = x0; x <= x1; x++) {
          const qx = x + 0.5 - sx;
          const uu = (qx * By - qy * Bx) * id, vv = (Ax * qy - Ay * qx) * id;
          if (uu < -1 || uu > 1 || vv < -1 || vv > 1) continue;
          let inside;
          if (shape === 1) inside = uu * uu + vv * vv <= 1;
          else if (shape === 2) {
            const rho = Math.hypot(uu, vv);
            inside = rho <= 1 && rho <= 0.62 + 0.38 * Math.pow(Math.abs(Math.cos(Math.atan2(vv, uu) * 2.5)), 0.6);
          } else if (shape === 3) inside = Math.abs(vv) <= Math.min(1, (1 - uu) * 3);
          else inside = Math.abs(vv) <= Math.pow(1 - uu * uu, 0.6) * (1 - 0.2 * uu);
          if (!inside) continue;
          const z = sz + uu * Az + vv * Bz, i = y * w + x;
          if (z <= Z[i]) continue;
          Z[i] = z;
          if (!full) continue;
          // physical normal: dome (bulge) + V-fold along the midrib, then turned toward the viewer
          const fv = vv > 0 ? -fold : fold;
          let mx = n[0] + (a[0] * uu + b[0] * vv) * bulge + b[0] * fv;
          let my = n[1] + (a[1] * uu + b[1] * vv) * bulge + b[1] * fv;
          let mz = n[2] + (a[2] * uu + b[2] * vv) * bulge + b[2] * fv;
          const il = fs / (Math.hypot(mx, my, mz) || 1);
          B.nx[i] = mx * il; B.ny[i] = my * il; B.nz[i] = mz * il;
          let k = 0.92 + 0.05 * (uu + 1);
          if (rib && Math.abs(vv) < 0.06) k *= 0.84;
          if (back) { B.cr[i] = col[0] * k * 1.06 + 10; B.cg[i] = col[1] * k * 1.06 + 10; B.cb[i] = col[2] * k * 1.06 + 8; }
          else { B.cr[i] = col[0] * k; B.cg[i] = col[1] * k; B.cb[i] = col[2] * k; }
          B.ao[i] = Lf.ao; B.sh[i] = Lf.sh;
          B.kind[i] = 2;
        }
      }
    }
  }

  /* ---------- occlusion bake: depth maps from the sun and from sky directions ---------- */
  function depthMap(T, dir, res) {
    const V = viewFor(dir);
    Object.assign(V, { C: T.center, scale: (res / 2) * 0.98 / T.R, cx: res / 2, cy: res / 2 });
    const B = { w: res, h: res, z: new Float32Array(res * res).fill(-Infinity) };
    raster(T, V, B, false);
    return { V, z: B.z, res };
  }
  function visAt(M, P, bias, pcf) {
    const V = M.V, C = V.C, o0 = P[0] - C[0], o1 = P[1] - C[1], o2 = P[2] - C[2];
    const x = V.cx + (o0 * V.r[0] + o1 * V.r[1] + o2 * V.r[2]) * V.scale;
    const y = V.cy - (o0 * V.u[0] + o1 * V.u[1] + o2 * V.u[2]) * V.scale;
    const z = o0 * V.d[0] + o1 * V.d[1] + o2 * V.d[2] + bias + 1.5 / V.scale;
    const xi = Math.floor(x), yi = Math.floor(y), R = pcf ? 1 : 0, res = M.res;
    let lit = 0, n = 0;
    for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
      const X = xi + i, Y = yi + j;
      n++;
      if (X < 0 || Y < 0 || X >= res || Y >= res || M.z[Y * res + X] <= z) lit++;
    }
    return lit / n;
  }
  const sunDir = (p) => [Math.sin(p.sunAz * DEG) * Math.cos(p.sunEl * DEG), Math.sin(p.sunEl * DEG), Math.cos(p.sunAz * DEG) * Math.cos(p.sunEl * DEG)];

  function bake(T, p, preview) {
    const l = sunDir(p), sun = depthMap(T, l, preview ? 256 : 512);
    const K = preview ? 10 : 16, res = preview ? 96 : 160, sky = [];
    for (let k = 0; k < K; k++) {
      const y = Math.sqrt((k + 0.5) / K), a = k * GOLD, s = Math.sqrt(1 - y * y);
      const d = [s * Math.cos(a), y, s * Math.sin(a)];
      sky.push({ d, M: depthMap(T, d, res) });
    }
    const aoAt = (P, off) => {
      let v = 0;
      for (const S of sky) v += visAt(S.M, off ? add(P, scl(S.d, off)) : P, off ? off * 0.2 : 0, false);
      return v / K;
    };
    for (const Lf of T.leaves) {
      Lf.sh = visAt(sun, Lf.c, Lf.L * 0.9, true);
      let v = 0;
      for (const S of sky) v += visAt(S.M, Lf.c, Lf.L * 0.9, false);
      Lf.ao = v / K;
    }
    for (const S of T.segs) {
      S.sh0 = visAt(sun, add(S.a, scl(l, S.ra * 1.1)), S.ra * 0.2, true);
      S.sh1 = visAt(sun, add(S.b, scl(l, S.rb * 1.1)), S.rb * 0.2, true);
      S.ao0 = aoAt(S.a, S.ra * 1.1);
      S.ao1 = aoAt(S.b, S.rb * 1.1);
    }
  }

  // geometry only depends on these settings; the tree (and its bake) is cached between renders
  const GEO = ['form', 'stems', 'stemSpread', 'crown', 'seed', 'trunkR', 'flare', 'lean', 'trunkCurve', 'gnarl', 'barkColor', 'barkVar',
    'levels', 'branches', 'whorlSize', 'branchStart', 'branchLen', 'angle', 'angleVar', 'children', 'childStart', 'lenRatio', 'radRatio', 'tropism',
    'leafCount', 'leafArr', 'leafShape', 'leafSize', 'leafSizeVar', 'leafWidth', 'leafAlong', 'cluster', 'leafAngle', 'leafDroop', 'facing', 'bulge', 'fold',
    'leafA', 'leafB', 'leafVar', 'accent', 'accentAmt'];
  let treeKey = null, tree = null, bakeKey = null;
  function getTree(p) {
    const key = JSON.stringify(GEO.map((k) => p[k]));
    if (key !== treeKey) { tree = buildTree(p); treeKey = key; bakeKey = null; }
    return tree;
  }

  /* ---------- atlas layout ---------- */
  const ringDir = (az, el) => [Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), Math.cos(az * DEG) * Math.cos(el * DEG)];
  function layoutOf(p) {
    if (p.layout === 'single') return { cols: 1, rows: 1, dirs: [ringDir(p.rot, p.elev)], ring: true };
    if (p.layout === 'ring') {
      const n = Math.max(1, p.views | 0);
      let cols = n;
      if (!p.oneRow) for (let c = Math.ceil(Math.sqrt(n)); c <= n; c++) if (n % c === 0) { cols = c; break; }
      return { cols, rows: Math.ceil(n / cols), dirs: Array.from({ length: n }, (_, k) => ringDir(p.rot + (k * 360) / n, p.elev)), ring: true };
    }
    const N = Math.max(2, p.grid | 0), hemi = p.layout === 'hemi', dirs = [];
    const coord = (i) => (p.sampling === 'edges' ? (i / (N - 1)) * 2 - 1 : ((i + 0.5) / N) * 2 - 1);
    for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) {
      const x = coord(col), y = coord(row);
      if (hemi) {
        const a = x + y, b = x - y;
        dirs.push(norm([a, 2 - Math.abs(a) - Math.abs(b), b]));
      } else {
        let nx = x, nz = y;
        const up = 1 - Math.abs(x) - Math.abs(y);
        if (up < 0) { nx = (1 - Math.abs(y)) * Math.sign(x || 1); nz = (1 - Math.abs(x)) * Math.sign(y || 1); }
        dirs.push(norm([nx, up, nz]));
      }
    }
    return { cols: N, rows: N, dirs, ring: false };
  }

  /* nearest-color fill of the empty pixels of a frame (two-pass chamfer propagation); alpha → 255 */
  function dilateRegion(D, W, x0, y0, fw, fh, bg) {
    const N = fw * fh, near = new Int32Array(N);
    let any = false;
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const k = y * fw + x;
      if (D[((y0 + y) * W + x0 + x) * 4 + 3] > 0) { near[k] = k; any = true; } else near[k] = -1;
    }
    if (any) {
      const d2 = (k, n) => { const dx = (k % fw) - (n % fw), dy = ((k / fw) | 0) - ((n / fw) | 0); return dx * dx + dy * dy; };
      const relax = (k, j) => { const n = near[j]; if (n >= 0 && (near[k] < 0 || d2(k, n) < d2(k, near[k]))) near[k] = n; };
      for (let it = 0; it < 2; it++) {
        for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
          const k = y * fw + x;
          if (x > 0) relax(k, k - 1);
          if (y > 0) { relax(k, k - fw); if (x > 0) relax(k, k - fw - 1); if (x < fw - 1) relax(k, k - fw + 1); }
        }
        for (let y = fh - 1; y >= 0; y--) for (let x = fw - 1; x >= 0; x--) {
          const k = y * fw + x;
          if (x < fw - 1) relax(k, k + 1);
          if (y < fh - 1) { relax(k, k + fw); if (x < fw - 1) relax(k, k + fw + 1); if (x > 0) relax(k, k + fw - 1); }
        }
      }
    }
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const k = y * fw + x, o = ((y0 + y) * W + x0 + x) * 4;
      if (D[o + 3] === 0) {
        const n = near[k];
        if (n >= 0) { const q = ((y0 + ((n / fw) | 0)) * W + x0 + (n % fw)) * 4; D[o] = D[q]; D[o + 1] = D[q + 1]; D[o + 2] = D[q + 2]; }
        else { D[o] = bg[0]; D[o + 1] = bg[1]; D[o + 2] = bg[2]; }
      }
      D[o + 3] = 255;
    }
  }

  const isOut = (...o) => (p) => o.includes(p.output);
  const isLayout = (...o) => (p) => o.includes(p.layout);
  const branchy = (p) => p.form !== 'palm' && p.levels > 1;
  const leafy = (p) => p.leafCount > 0;
  const MODES = { albedo: 0, lit: 1, normal: 2, depth: 3, ao: 4, mask: 5 };

  U.register({
    id: 'treeImpostor',
    name: 'Tree Impostor',
    desc: 'Procedural 3D trees baked into impostor atlases: single card, ring of side views, hemi-octahedral or octahedral grid, with albedo, normal, depth and AO',
    uses: ['Impostor / billboard LODs for distant trees in 3D engines: bake a ring or (hemi-)octahedral atlas with matching albedo, normal, depth and AO files for an impostor shader.', 'Cross-quad tree cards and pre-lit tree sprites for 2D games, strategy maps and backgrounds.'],
    tags: ['Nature', 'VFX'],
    aspect: '2:1',
    normalMap: false, // it renders true normals itself
    icon: U.icon('<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M12 3v18M3 12h18" opacity=".35"/><circle cx="7.5" cy="6.4" r="2.3"/><path d="M7.5 8.7v2.2"/><circle cx="16.5" cy="15.4" r="2.3"/><path d="M16.5 17.7v2.2"/>'),
    exportLayers: (p) => {
      if (p.output === 'set') return [{ id: 'albedo', suffix: 'albedo' }, { id: 'normal', suffix: 'normal' }, { id: 'depth', suffix: 'depth' }, { id: 'ao', suffix: 'ao' }].concat(p.dilate ? [{ id: 'mask', suffix: 'alpha' }] : []);
      if (p.dilate && (p.output === 'albedo' || p.output === 'lit')) return [{ id: p.output, suffix: p.output }, { id: 'mask', suffix: 'alpha' }];
      return null;
    },
    params: [
      { type: 'section', label: 'Tree' },
      { key: 'form', label: 'Form', type: 'select', default: 'trunk', options: [['trunk', 'Single trunk (broadleaf)'], ['whorled', 'Whorled tiers (conifer)'], ['multi', 'Multi-stem (shrub)'], ['palm', 'Palm (frond crown)']] },
      { key: 'stems', label: 'Stems', type: 'int', min: 2, max: 16, default: 6, show: (p) => p.form === 'multi' },
      { key: 'stemSpread', label: 'Stem spread (°)', type: 'range', min: 0, max: 70, step: 1, default: 30, show: (p) => p.form === 'multi' },
      { key: 'crown', label: 'Crown shape', type: 'select', default: 'ellipsoid', show: (p) => p.form !== 'palm', options: [['ellipsoid', 'Round'], ['heart', 'Wide at the top'], ['teardrop', 'Wide at the bottom'], ['cone', 'Cone'], ['vase', 'Vase (inverted cone)'], ['cylinder', 'Column']], tip: 'Length of the main branches from the bottom to the top of the crown' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Trunk' },
      { key: 'trunkR', label: 'Trunk radius', type: 'range', min: 0.005, max: 0.12, step: 0.001, default: 0.035, tip: 'At the base, as a fraction of the trunk height' },
      { key: 'flare', label: 'Root flare', type: 'range', min: 0, max: 2, step: 0.01, default: 0.6 },
      { key: 'lean', label: 'Lean (°)', type: 'range', min: 0, max: 45, step: 1, default: 3 },
      { key: 'trunkCurve', label: 'Trunk bend', type: 'range', min: -1, max: 1, step: 0.01, default: 0, tip: 'Bends a leaning trunk back up (+) or further over (−)' },
      { key: 'gnarl', label: 'Crookedness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'barkColor', label: 'Bark', type: 'color', default: '#4b3b2e' },
      { key: 'barkVar', label: 'Bark variation', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.12 },

      { type: 'section', label: 'Branches' },
      { key: 'levels', label: 'Branch levels', type: 'int', min: 1, max: 4, default: 3, show: (p) => p.form !== 'palm', tip: 'Branches, sub-branches, twigs … Leaves grow on the last level' },
      { key: 'branches', label: 'Main branches', type: 'int', min: 1, max: 160, default: 14, tip: 'Per trunk / stem; for palms the number of fronds' },
      { key: 'whorlSize', label: 'Branches per whorl', type: 'int', min: 2, max: 12, default: 5, show: (p) => p.form === 'whorled' },
      { key: 'branchStart', label: 'Clear trunk', type: 'range', min: 0, max: 0.95, step: 0.01, default: 0.35, show: (p) => p.form !== 'palm', tip: 'Height where the main branches start' },
      { key: 'branchLen', label: 'Main branch length', type: 'range', min: 0.05, max: 1.2, step: 0.01, default: 0.5, tip: 'Fraction of the trunk height' },
      { key: 'angle', label: 'Branch angle (°)', type: 'range', min: 0, max: 150, step: 1, default: 50 },
      { key: 'angleVar', label: 'Angle variation (°)', type: 'range', min: 0, max: 45, step: 1, default: 12 },
      { key: 'children', label: 'Sub-branches', type: 'int', min: 1, max: 10, default: 4, show: branchy },
      { key: 'childStart', label: 'Sub-branch start', type: 'range', min: 0, max: 0.9, step: 0.01, default: 0.2, show: branchy },
      { key: 'lenRatio', label: 'Sub-branch length', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.55, show: branchy, tip: 'Relative to the parent branch' },
      { key: 'radRatio', label: 'Thickness ratio', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.6, tip: 'Child radius relative to the parent where it starts' },
      { key: 'tropism', label: 'Growth direction', type: 'range', min: -1, max: 1, step: 0.01, default: 0.2, tip: '+ grows upward, − droops (weeping)' },

      { type: 'section', label: 'Leaves' },
      { key: 'leafCount', label: 'Leaves per twig', type: 'int', min: 0, max: 80, default: 12, tip: '0 = bare tree' },
      { key: 'leafArr', label: 'Arrangement', type: 'select', default: 'cluster', show: leafy, options: [['cluster', 'Clumps at the twig ends'], ['brush', 'All around the twig (needles)'], ['pinnate', 'Pairs along both sides (fronds)']] },
      { key: 'leafShape', label: 'Leaf shape', type: 'select', default: 'oval', show: leafy, options: [['oval', 'Pointed oval'], ['round', 'Round / blob'], ['lobed', 'Lobed (maple, oak)'], ['needle', 'Needle / strap']] },
      { key: 'leafSize', label: 'Leaf size', type: 'range', min: 0.005, max: 0.3, step: 0.001, default: 0.045, show: leafy, tip: 'Fraction of the trunk height' },
      { key: 'leafSizeVar', label: 'Size variation', type: 'range', min: 0, max: 0.9, step: 0.01, default: 0.35, show: leafy },
      { key: 'leafWidth', label: 'Width ratio', type: 'range', min: 0.04, max: 1.5, step: 0.01, default: 0.55, show: leafy },
      { key: 'leafAlong', label: 'Leafy part of twig', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.65, show: leafy, tip: 'Share of each twig, from the tip, that carries leaves' },
      { key: 'cluster', label: 'Clump spread', type: 'range', min: 0, max: 4, step: 0.01, default: 1.2, show: (p) => leafy(p) && p.leafArr === 'cluster', tip: 'In leaf sizes' },
      { key: 'leafAngle', label: 'Leaf angle (°)', type: 'range', min: 0, max: 120, step: 1, default: 45, show: leafy, tip: 'Between the leaf and its twig' },
      { key: 'leafDroop', label: 'Leaf droop', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, show: leafy },
      { key: 'facing', label: 'Face upward', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: leafy, tip: '0 = random orientation, 1 = every leaf faces the sky' },
      { key: 'bulge', label: 'Rounded normals', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.2, show: leafy, tip: 'Bends the leaf normals into a dome: softer, clumpier shading (high for toon blobs, round needles)' },
      { key: 'fold', label: 'Midrib fold', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: leafy },

      { type: 'section', label: 'Leaf color' },
      { key: 'leafA', label: 'Leaf color A', type: 'color', default: '#36602a' },
      { key: 'leafB', label: 'Leaf color B', type: 'color', default: '#7ea33c' },
      { key: 'leafVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Mixes A and B per twig and per leaf' },
      { key: 'accent', label: 'Accent color', type: 'color', default: '#d0702a' },
      { key: 'accentAmt', label: 'Accent share', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Share of twigs in the accent color (autumn leaves, blossoms)' },

      { type: 'section', label: 'Atlas' },
      { key: 'layout', label: 'Layout', type: 'select', default: 'ring', options: [['single', 'Single view'], ['ring', 'Ring of side views'], ['hemi', 'Hemi-octahedral grid (upper half)'], ['octa', 'Octahedral grid (full sphere)']], tip: 'Ring: frame k is seen from azimuth start + k · 360° / views, rows left to right, top to bottom. Octahedral: frame (col, row) with x, y ∈ [−1, 1] (row 0 = top = −1) looks from hemi: normalize(x+y, 2−|x+y|−|x−y|, x−y), full: the octahedron (x, 1−|x|−|y|, y) folded below the horizon, as (X, Y up, Z)' },
      { key: 'views', label: 'Views', type: 'int', min: 2, max: 32, default: 8, show: isLayout('ring'), tip: 'Laid out as a near-square grid (8 = 4 × 2); set the aspect to match' },
      { key: 'oneRow', label: 'Single row', type: 'bool', default: false, show: isLayout('ring') },
      { key: 'elev', label: 'Camera elevation (°)', type: 'range', min: -30, max: 90, step: 1, default: 0, show: isLayout('single', 'ring') },
      { key: 'rot', label: 'Azimuth start (°)', type: 'range', min: 0, max: 360, step: 1, default: 0, show: isLayout('single', 'ring') },
      { key: 'grid', label: 'Grid size', type: 'int', min: 2, max: 32, default: 8, show: isLayout('hemi', 'octa'), tip: 'N × N frames; use a 1:1 aspect' },
      { key: 'sampling', label: 'Frame directions', type: 'select', default: 'edges', show: isLayout('hemi', 'octa'), options: [['edges', 'Grid corners (i / (N − 1), includes the horizon)'], ['centers', 'Cell centers ((i + 0.5) / N)']] },
      { key: 'fit', label: 'Fit', type: 'select', default: 'pivot', show: isLayout('single', 'ring'), options: [['pivot', 'Ground pivot (trunk base at the bottom center)'], ['sphere', 'Bounding sphere (centered)']], tip: 'Same scale and pivot in every frame either way; octahedral grids always use the bounding sphere' },
      { key: 'pad', label: 'Frame padding', type: 'range', min: 0, max: 0.25, step: 0.005, default: 0.03 },

      { type: 'section', label: 'Lighting' },
      { key: 'sunAz', label: 'Sun azimuth (°)', type: 'range', min: 0, max: 360, step: 1, default: 40, show: isOut('lit') },
      { key: 'sunEl', label: 'Sun elevation (°)', type: 'range', min: -10, max: 90, step: 1, default: 50, show: isOut('lit') },
      { key: 'sunI', label: 'Sun intensity', type: 'range', min: 0, max: 2.5, step: 0.01, default: 1.1, show: isOut('lit') },
      { key: 'sunColor', label: 'Sun color', type: 'color', default: '#fff3e0', show: isOut('lit') },
      { key: 'skyColor', label: 'Sky color', type: 'color', default: '#b8cff0', show: isOut('lit') },
      { key: 'ambient', label: 'Ambient', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.5, show: isOut('lit') },
      { key: 'shadow', label: 'Self-shadowing', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75, show: isOut('lit') },
      { key: 'transl', label: 'Leaf translucency', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: isOut('lit') },
      { key: 'aoAmt', label: 'Ambient occlusion', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, show: isOut('lit', 'ao', 'set') },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'albedo', options: [['albedo', 'Albedo + alpha (unlit)'], ['lit', 'Lit color + alpha (baked light)'], ['normal', 'Normal map'], ['depth', 'Depth'], ['ao', 'Ambient occlusion'], ['mask', 'Alpha mask'], ['set', 'Impostor set (separate files)']], tip: 'Impostor set: albedo, normal, depth and AO as pixel-aligned files' },
      { key: 'view', label: 'Preview layer', type: 'select', default: 'albedo', show: isOut('set'), options: [['albedo', 'Albedo'], ['normal', 'Normal map'], ['depth', 'Depth'], ['ao', 'Ambient occlusion'], ['mask', 'Alpha mask']], tip: 'Preview only, the export saves every layer' },
      { key: 'aoAlb', label: 'AO in albedo', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: isOut('albedo', 'set') },
      { key: 'nspace', label: 'Normal space', type: 'select', default: 'view', show: isOut('normal', 'set'), options: [['view', 'Per frame (view space, billboard tangent)'], ['world', 'Object space, Y up'], ['worldZ', 'Object space, Z up']], tip: 'View space: X right, Y up, Z toward the camera of each frame. Object space Z up = (X, −Z, Y)' },
      { key: 'yDir', label: 'Green channel', type: 'select', default: 'gl', show: isOut('normal', 'set'), options: [['gl', 'OpenGL (Y+) · Unity, Blender, Godot'], ['dx', 'DirectX (Y−) · Unreal, Substance DX']] },
      { key: 'dilate', label: 'Dilate color into transparent area', type: 'bool', default: false, show: isOut('albedo', 'lit', 'normal', 'set'), tip: 'Pushes the nearest color into every empty pixel against dark mip fringes. Browsers drop the color of fully transparent PNG pixels, so color files become opaque and an _alpha mask file is exported next to them' },
      { key: 'aa', label: 'Anti-aliasing', type: 'select', default: 2, options: [[1, 'Off'], [2, '2 × 2 supersampling'], [3, '3 × 3 supersampling']] },
    ],
    presets: [
      // Realistic
      { name: 'Oak', group: 'Realistic', values: { crown: 'heart', branches: 12, branchStart: 0.3, branchLen: 0.62, angle: 60, angleVar: 15, gnarl: 0.55, tropism: 0.05, trunkR: 0.05, leafShape: 'lobed', leafSize: 0.05, leafWidth: 0.8, leafCount: 12, leafA: '#3a5a22', leafB: '#6c8a30', barkColor: '#4a4036' } },
      { name: 'Birch', group: 'Realistic', values: { trunkR: 0.022, barkColor: '#d8d2c4', barkVar: 0.22, crown: 'teardrop', branches: 18, branchStart: 0.35, branchLen: 0.4, angle: 40, tropism: -0.35, gnarl: 0.2, lenRatio: 0.65, leafShape: 'oval', leafSize: 0.03, leafCount: 14, leafA: '#5c8a2e', leafB: '#a3bf4a' } },
      { name: 'Maple', group: 'Realistic', values: { crown: 'ellipsoid', branches: 14, angle: 52, leafShape: 'lobed', leafSize: 0.055, leafWidth: 0.9, leafCount: 11, leafA: '#3d6a26', leafB: '#5f8f30' } },
      { name: 'Autumn maple', group: 'Realistic', values: { crown: 'ellipsoid', branches: 14, angle: 52, leafShape: 'lobed', leafSize: 0.055, leafWidth: 0.9, leafCount: 11, leafA: '#c2401c', leafB: '#e89a2c', accent: '#f2c84a', accentAmt: 0.3 } },
      { name: 'Weeping willow', group: 'Realistic', values: { crown: 'ellipsoid', branches: 14, branchLen: 0.55, angle: 55, tropism: -0.95, lenRatio: 0.85, children: 5, leafShape: 'oval', leafWidth: 0.18, leafSize: 0.05, leafArr: 'brush', leafAlong: 0.9, leafCount: 24, leafAngle: 25, leafDroop: 0.5, facing: 0.1, leafA: '#6a8a3a', leafB: '#a6b85a', barkColor: '#4a4034' } },
      { name: 'Cherry blossom', group: 'Realistic', values: { crown: 'heart', angle: 65, gnarl: 0.6, branchStart: 0.25, leafShape: 'round', leafSize: 0.022, leafWidth: 1, leafCount: 20, cluster: 1.6, leafA: '#f2b8cc', leafB: '#fde4ee', leafVar: 0.4, accent: '#7a9a4a', accentAmt: 0.15, barkColor: '#3a2a26' } },
      { name: 'Spruce', group: 'Realistic', values: { form: 'whorled', crown: 'cone', levels: 2, branches: 70, whorlSize: 5, branchStart: 0.08, branchLen: 0.42, angle: 95, angleVar: 8, tropism: -0.25, children: 9, childStart: 0.1, lenRatio: 0.4, radRatio: 0.4, gnarl: 0.15, leafArr: 'brush', leafShape: 'needle', leafCount: 70, leafSize: 0.04, leafWidth: 0.14, leafAlong: 1, leafAngle: 55, facing: 0, bulge: 0.6, fold: 0, leafA: '#1d3a26', leafB: '#355a36', leafVar: 0.4, barkColor: '#3e3128', trunkR: 0.03, flare: 0.4 } },
      { name: 'Scots pine', group: 'Realistic', values: { form: 'whorled', crown: 'ellipsoid', branchStart: 0.6, branches: 24, whorlSize: 4, branchLen: 0.4, angle: 75, tropism: 0.15, gnarl: 0.5, levels: 3, children: 3, lenRatio: 0.6, leafArr: 'brush', leafShape: 'needle', leafCount: 30, leafSize: 0.04, leafWidth: 0.08, leafAlong: 0.35, leafAngle: 40, facing: 0, bulge: 0.6, fold: 0, leafA: '#2c4a2a', leafB: '#4f6e3a', barkColor: '#8a5a3a', trunkR: 0.028 } },
      { name: 'Coconut palm', group: 'Realistic', values: { form: 'palm', branches: 16, branchLen: 0.45, angle: 70, angleVar: 30, tropism: -0.7, lean: 18, trunkCurve: 0.5, trunkR: 0.025, flare: 0.8, gnarl: 0.08, radRatio: 0.5, leafArr: 'pinnate', leafShape: 'oval', leafWidth: 0.12, leafSize: 0.16, leafSizeVar: 0.15, leafCount: 26, leafAlong: 0.9, leafAngle: 70, leafDroop: 0.35, facing: 0.5, fold: 0.5, bulge: 0.1, leafA: '#3e6a26', leafB: '#7a9a3a', barkColor: '#6a5a48' } },
      { name: 'Acacia (umbrella)', group: 'Realistic', values: { crown: 'vase', branchStart: 0.45, branches: 8, branchLen: 0.6, angle: 48, tropism: 0.3, gnarl: 0.6, lenRatio: 0.6, leafShape: 'round', leafSize: 0.02, leafWidth: 1, leafCount: 26, cluster: 2.2, leafAlong: 0.35, facing: 0.9, leafA: '#5a6e2a', leafB: '#8a9a40', barkColor: '#3e342c' } },
      { name: 'Round shrub', group: 'Realistic', values: { form: 'multi', stems: 7, stemSpread: 35, crown: 'ellipsoid', levels: 2, branches: 6, branchStart: 0.3, branchLen: 0.45, angle: 45, children: 4, leafShape: 'oval', leafSize: 0.07, leafCount: 14, cluster: 1.5, trunkR: 0.025, flare: 0, pad: 0.04 } },
      { name: 'Dead tree', group: 'Realistic', values: { leafCount: 0, levels: 4, gnarl: 0.7, branches: 9, children: 3, angle: 50, tropism: 0, crown: 'heart', barkColor: '#5a5048', trunkR: 0.045 } },
      // Stylized
      { name: 'Toon blob tree', group: 'Stylized', values: { levels: 2, branches: 9, children: 3, leafShape: 'round', leafSize: 0.16, leafWidth: 1, leafSizeVar: 0.3, leafCount: 4, cluster: 1, bulge: 1.2, fold: 0, facing: 0, leafVar: 0.25, leafA: '#4caf50', leafB: '#8bd65a', barkColor: '#7a5030', gnarl: 0.15, barkVar: 0.04 } },
      { name: 'Lollipop topiary', group: 'Stylized', values: { levels: 2, branchStart: 0.55, crown: 'ellipsoid', branches: 20, angle: 70, branchLen: 0.25, children: 3, leafShape: 'round', leafSize: 0.09, leafWidth: 1, leafCount: 6, cluster: 0.8, bulge: 1, fold: 0, gnarl: 0, lean: 0, trunkR: 0.02, flare: 0, leafA: '#3f8f3a', leafB: '#6cc04a' } },
      { name: 'Toon pine', group: 'Stylized', values: { form: 'whorled', crown: 'cone', levels: 1, branches: 36, whorlSize: 6, branchStart: 0.1, branchLen: 0.4, angle: 100, angleVar: 4, tropism: -0.1, gnarl: 0, leafArr: 'brush', leafShape: 'round', leafCount: 5, leafSize: 0.11, leafWidth: 1, leafAlong: 1, leafAngle: 20, facing: 0.6, bulge: 1.2, fold: 0, leafVar: 0.2, leafA: '#2f7a4a', leafB: '#4ea860', trunkR: 0.03 } },
      { name: 'Painterly autumn', group: 'Stylized', values: { leafShape: 'round', leafSize: 0.08, leafWidth: 0.8, leafCount: 7, cluster: 1.4, bulge: 0.8, fold: 0, leafA: '#d06a2a', leafB: '#f0b040', accent: '#a03020', accentAmt: 0.25, leafVar: 0.8 } },
      // Sci-fi
      { name: 'Bioluminescent tree', group: 'Sci-fi', values: { tropism: -0.5, leafShape: 'round', leafSize: 0.035, leafWidth: 1, leafCount: 14, bulge: 0.8, leafA: '#20e0d0', leafB: '#a040ff', accent: '#ffe060', accentAmt: 0.2, barkColor: '#1a1c2e', gnarl: 0.5 } },
      { name: 'Crimson alien spire', group: 'Sci-fi', values: { form: 'whorled', crown: 'cone', levels: 2, branches: 40, whorlSize: 3, branchStart: 0.15, branchLen: 0.35, angle: 35, tropism: 0.6, gnarl: 0.35, leafArr: 'brush', leafShape: 'needle', leafCount: 20, leafSize: 0.05, leafWidth: 0.25, leafAngle: 30, leafA: '#ff3040', leafB: '#ff9a40', barkColor: '#2a0a14', trunkR: 0.04 } },
      { name: 'Crystal palm', group: 'Sci-fi', values: { form: 'palm', branches: 12, branchLen: 0.5, angle: 60, angleVar: 25, tropism: -0.4, lean: 8, trunkCurve: 0.3, trunkR: 0.03, leafArr: 'pinnate', leafShape: 'needle', leafWidth: 0.18, leafSize: 0.14, leafCount: 18, leafAlong: 0.85, leafAngle: 60, leafDroop: 0.1, facing: 0.3, fold: 0.8, bulge: 0, leafA: '#80e8ff', leafB: '#d0a0ff', barkColor: '#303850' } },
    ],

    render(out, W, H, p, opts) {
      opts = opts || {};
      let view = p.output;
      if (p.output === 'set') view = opts.layer || (opts.preview ? p.view || 'albedo' : 'albedo');
      else if (opts.layer) view = opts.layer;
      const mode = MODES[view] == null ? 0 : MODES[view];

      const T = getTree(p);
      if (mode === 1 || mode === 4 || (mode === 0 && p.aoAlb > 0)) {
        const key = [treeKey, p.sunAz, p.sunEl, !!opts.preview].join('|');
        if (key !== bakeKey) { bake(T, p, !!opts.preview); bakeKey = key; }
      }

      const LY = layoutOf(p), img = out.createImageData(W, H), D = img.data;
      const ss = Math.max(1, Math.min(3, +p.aa || 1)), TS = Math.max(32, Math.floor(1024 / ss));
      const B = gbuf(TS * ss * TS * ss);
      const dil = !!p.dilate && mode <= 2;
      const l = sunDir(p), sC = U.hex(p.sunColor), kC = U.hex(p.skyColor), sI = p.sunI / 255;
      const sR = sC[0] * sI, sG = sC[1] * sI, sB = sC[2] * sI, kR = kC[0] / 255, kG = kC[1] / 255, kB = kC[2] / 255;
      const aoA = mode === 0 ? p.aoAlb : 0, aoAmt = p.aoAmt, shAmt = p.shadow, tr = p.transl, amb = p.ambient;
      const ns = p.nspace, gy = p.yDir === 'dx' ? -1 : 1;
      const sphere = !LY.ring || p.fit === 'sphere';

      for (let f = 0; f < LY.dirs.length; f++) {
        const col = f % LY.cols, row = (f / LY.cols) | 0;
        const fx0 = Math.floor((col * W) / LY.cols), fx1 = Math.floor(((col + 1) * W) / LY.cols);
        const fy0 = Math.floor((row * H) / LY.rows), fy1 = Math.floor(((row + 1) * H) / LY.rows);
        const fw = fx1 - fx0, fh = fy1 - fy0;
        if (fw < 1 || fh < 1) continue;
        const bwF = fw * ss, bhF = fh * ss, pad = p.pad;
        const V = viewFor(LY.dirs[f]);
        let cxF, cyF, Rn;
        if (sphere) {
          V.C = T.center; V.scale = (Math.min(bwF, bhF) * 0.5 * (1 - 2 * pad)) / T.R;
          cxF = bwF / 2; cyF = bhF / 2; Rn = T.R;
        } else {
          // bounding cylinder around the trunk axis: the same scale and pivot from every azimuth
          const ce = Math.cos(p.elev * DEG), se = Math.abs(Math.sin(p.elev * DEG));
          const ys = [T.ymin * ce, T.ymax * ce];
          const yMin = Math.min(...ys) - T.Rxz * se, yMax = Math.max(...ys) + T.Rxz * se;
          V.C = [0, 0, 0];
          V.scale = Math.min((bwF * (1 - 2 * pad)) / (2 * T.Rxz), (bhF * (1 - 2 * pad)) / Math.max(1e-6, yMax - yMin));
          cxF = bwF / 2; cyF = bhF * (1 - pad) + yMin * V.scale; Rn = T.Rp;
        }
        const [r0, r1, r2] = V.r, [u0, u1, u2] = V.u, [d0, d1, d2] = V.d;
        // background normal: facing the camera
        const bgN = ns === 'view' ? [0, 0, 1] : ns === 'worldZ' ? [d0, -d2, d1] : [d0, d1, d2];
        const bgEnc = [(bgN[0] * 0.5 + 0.5) * 255, (bgN[1] * gy * 0.5 + 0.5) * 255, (bgN[2] * 0.5 + 0.5) * 255];

        for (let ty = 0; ty < fh; ty += TS) for (let tx = 0; tx < fw; tx += TS) {
          const tw = Math.min(TS, fw - tx), th = Math.min(TS, fh - ty), bw = tw * ss, bh = th * ss, n = bw * bh;
          B.w = bw; B.h = bh;
          B.z.fill(-Infinity, 0, n); B.kind.fill(0, 0, n);
          V.cx = cxF - tx * ss; V.cy = cyF - ty * ss;
          raster(T, V, B, true);

          for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
            let cnt = 0, s0 = 0, s1 = 0, s2 = 0;
            for (let sy = 0; sy < ss; sy++) {
              let i = (y * ss + sy) * bw + x * ss;
              for (let sx = 0; sx < ss; sx++, i++) {
                const k = B.kind[i];
                if (!k) continue;
                cnt++;
                if (mode === 0) {
                  const a = aoA ? 1 - aoA * (1 - B.ao[i]) : 1;
                  s0 += B.cr[i] * a; s1 += B.cg[i] * a; s2 += B.cb[i] * a;
                } else if (mode === 1) {
                  const nx = B.nx[i], ny = B.ny[i], nz = B.nz[i], ndl = nx * l[0] + ny * l[1] + nz * l[2];
                  const sh = 1 - shAmt * (1 - B.sh[i]), ao = 1 - aoAmt * (1 - B.ao[i]);
                  let dif = (ndl > 0 ? ndl : 0) * sh;
                  if (k === 2 && ndl < 0) dif -= ndl * tr * sh;
                  const am = amb * (0.6 + 0.4 * ny) * ao;
                  s0 += B.cr[i] * (sR * dif + kR * am); s1 += B.cg[i] * (sG * dif + kG * am); s2 += B.cb[i] * (sB * dif + kB * am);
                } else if (mode === 2) {
                  const nx = B.nx[i], ny = B.ny[i], nz = B.nz[i];
                  if (ns === 'view') { s0 += nx * r0 + ny * r1 + nz * r2; s1 += nx * u0 + ny * u1 + nz * u2; s2 += nx * d0 + ny * d1 + nz * d2; }
                  else if (ns === 'worldZ') { s0 += nx; s1 -= nz; s2 += ny; }
                  else { s0 += nx; s1 += ny; s2 += nz; }
                } else if (mode === 3) s0 += B.z[i];
                else if (mode === 4) s0 += 1 - aoAmt * (1 - B.ao[i]);
              }
            }
            const o = ((fy0 + ty + y) * W + fx0 + tx + x) * 4, cov = cnt / (ss * ss);
            if (mode <= 1) {
              if (cnt) { D[o] = s0 / cnt; D[o + 1] = s1 / cnt; D[o + 2] = s2 / cnt; D[o + 3] = dil ? 255 : cov * 255; }
              else { D[o] = D[o + 1] = D[o + 2] = D[o + 3] = 0; }
            } else if (mode === 2) {
              if (cnt) {
                const il = 1 / (Math.hypot(s0, s1, s2) || 1);
                D[o] = (s0 * il * 0.5 + 0.5) * 255; D[o + 1] = (s1 * il * gy * 0.5 + 0.5) * 255; D[o + 2] = (s2 * il * 0.5 + 0.5) * 255; D[o + 3] = 255;
              } else { D[o] = bgEnc[0]; D[o + 1] = bgEnc[1]; D[o + 2] = bgEnc[2]; D[o + 3] = dil ? 0 : 255; }
            } else {
              const v = mode === 3 ? (cnt ? U.clamp(0.5 + (0.5 * s0) / cnt / Rn) : 0) : mode === 4 ? (cnt ? s0 / cnt : 1) : cov;
              D[o] = D[o + 1] = D[o + 2] = v * 255; D[o + 3] = 255;
            }
          }
        }
        if (dil) dilateRegion(D, W, fx0, fy0, fw, fh, mode === 2 ? bgEnc : [0, 0, 0]);
      }
      out.putImageData(img, 0, 0);
    },
  });
})();
