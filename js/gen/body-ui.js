/* Character body UI: a human figure for status / damage HUDs, split into 14 sections (head, neck, thorax,
   stomach, upper / lower arms, hands, upper / lower legs, feet). Two styles share one partition:
   regular (smooth silhouette) and blocky (rectangles).
   Every section is drawn as its own mask, made exclusive in priority order (upper arms behind the
   thorax, lower arms and hands in front of thorax and stomach), and turned into a local signed distance field. Gaps between sections,
   per-section borders, the fill inset and the inner glow all come from these fields, so they stay clean
   at every size. Each section has a health value (state color or fill level), one section can be selected.
   Layers: background (empty sections, shadow, glow), fill, outline, plus one mask per section and a
   part ID map for engines. Wear: the shared noise / grunge stack (js/wear.js). Units are px @ 256 px short side. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const R2D = Math.PI / 180;

  /* every section the figure can be split into (display order, also the gray order of the part ID map);
     "left" = the character's left. Which ones exist depends on the grouping settings (sectionIds) */
  const SECTIONS = [
    ['head', 'Head'], ['neck', 'Neck'], ['thorax', 'Thorax'], ['stomach', 'Stomach'], ['torso', 'Torso (thorax + stomach)'],
    ['upperArmL', 'Upper arm (left)'], ['lowerArmL', 'Lower arm (left)'], ['handL', 'Hand (left)'], ['armL', 'Whole arm (left)'],
    ['upperArmR', 'Upper arm (right)'], ['lowerArmR', 'Lower arm (right)'], ['handR', 'Hand (right)'], ['armR', 'Whole arm (right)'],
    ['upperLegL', 'Upper leg (left)'], ['lowerLegL', 'Lower leg (left)'], ['footL', 'Foot (left)'], ['legL', 'Whole leg (left)'],
    ['upperLegR', 'Upper leg (right)'], ['lowerLegR', 'Lower leg (right)'], ['footR', 'Foot (right)'], ['legR', 'Whole leg (right)'],
  ];
  const SEC_IDX = Object.fromEntries(SECTIONS.map(([id], i) => [id, i]));
  const ID_STEP = Math.floor(255 / (SECTIONS.length + 1)); // gray step of the part ID map (11)
  // exclusivity: an earlier section owns the overlap with a later one. Lower arms and hands lie in front of the
  // thorax and stomach, the upper arms behind them (the thorax keeps the shoulder); a merged whole arm stays in front
  const PRIO = ['lowerArmL', 'lowerArmR', 'handL', 'handR', 'armL', 'armR',
    'head', 'torso', 'thorax', 'stomach', 'neck', 'upperArmL', 'upperArmR', 'legL', 'legR', 'upperLegL', 'upperLegR', 'lowerLegL', 'lowerLegR', 'footL', 'footR'];

  // sections that exist with the current grouping
  function sectionIds(p) {
    const ids = ['head', 'neck'].concat(p.torsoSplit === 'one' ? ['torso'] : ['thorax', 'stomach']);
    for (const s of ['L', 'R']) {
      ids.push(...(p.armSplit === 'one' ? ['arm'] : p.armSplit === 'two' ? ['upperArm', 'lowerArm'] : ['upperArm', 'lowerArm', 'hand']).map((x) => x + s));
      ids.push(...(p.legSplit === 'one' ? ['leg'] : p.legSplit === 'two' ? ['upperLeg', 'lowerLeg'] : ['upperLeg', 'lowerLeg', 'foot']).map((x) => x + s));
    }
    return ids;
  }
  // anatomical parts -> sections (merged parts become one mask: no seam, one health, one fill)
  function group(p, P) {
    const out = { head: P.head, neck: P.neck };
    if (p.torsoSplit === 'one') out.torso = P.thorax.concat(P.stomach);
    else { out.thorax = P.thorax; out.stomach = P.stomach; }
    for (const s of ['L', 'R']) {
      const limb = (mode, a, b, c, whole) => {
        if (mode === 'one') out[whole + s] = P[a + s].concat(P[b + s], P[c + s]);
        else if (mode === 'two') { out[a + s] = P[a + s]; out[b + s] = P[b + s].concat(P[c + s]); }
        else { out[a + s] = P[a + s]; out[b + s] = P[b + s]; out[c + s] = P[c + s]; }
      };
      limb(p.armSplit, 'upperArm', 'lowerArm', 'hand', 'arm');
      limb(p.legSplit, 'upperLeg', 'lowerLeg', 'foot', 'leg');
    }
    return out;
  }

  /* ---------- geometry helpers (unit space: figure ≈ 100 wide, ≈ 160 tall, centered on x = 50) ---------- */
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];
  const dirA = (s, deg) => [s * Math.sin(deg * R2D), Math.cos(deg * R2D)]; // from straight down, + = outward
  const perp = (d) => [-d[1], d[0]];
  const norm = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
  const rotDeg = (d) => Math.atan2(-d[0], d[1]) / R2D; // rotation that turns "down" into d
  const X = (s, dx) => 50 + s * dx;

  const fill = (P, cut) => ({ P, cut: !!cut });
  const stroke = (P, w, cut) => ({ P, w, cut: !!cut });
  const ell = (c, rx, ry, deg = 0) => { const P = new Path2D(); P.ellipse(c[0], c[1], rx, ry, deg * R2D, 0, U.TAU); return P; };
  const circ = (c, r) => ell(c, r, r);
  const line = (...pts) => { const P = new Path2D(); P.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) P.lineTo(pts[i][0], pts[i][1]); return P; };
  const quad = (a, c, b) => { const P = new Path2D(); P.moveTo(a[0], a[1]); P.quadraticCurveTo(c[0], c[1], b[0], b[1]); return P; };

  // closed polygon with rounded corners
  function roundPoly(pts, r) {
    const P = new Path2D(), n = pts.length;
    let minE = Infinity;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; minE = Math.min(minE, Math.hypot(b[0] - a[0], b[1] - a[1])); }
    r = Math.max(0, Math.min(r || 0, minE / 2 - 1e-3));
    if (r <= 0) { P.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < n; i++) P.lineTo(pts[i][0], pts[i][1]); P.closePath(); return P; }
    const a = pts[n - 1], b = pts[0];
    P.moveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    for (let i = 0; i < n; i++) { const c = pts[i], d = pts[(i + 1) % n]; P.arcTo(c[0], c[1], d[0], d[1], r); }
    P.closePath();
    return P;
  }
  // box along the segment a -> b (width w), rounded corners
  function segBox(a, b, w, r) {
    const d = norm([b[0] - a[0], b[1] - a[1]]), q = perp(d), h = w / 2;
    return roundPoly([add(a, q, h), add(b, q, h), add(b, q, -h), add(a, q, -h)], r);
  }
  const box = (c, w, h, r) => roundPoly([[c[0] - w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] - h / 2], [c[0] + w / 2, c[1] + h / 2], [c[0] - w / 2, c[1] + h / 2]], r);

  // hull of two circles (a, ra) and (b, rb): a tapered, round-ended limb
  function taper(a, ra, b, rb) {
    const P = new Path2D(), dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy);
    if (d <= Math.abs(ra - rb) + 1e-6) { const big = ra >= rb; P.arc(big ? a[0] : b[0], big ? a[1] : b[1], big ? ra : rb, 0, U.TAU); return P; }
    const ux = dx / d, uy = dy / d, sn = (ra - rb) / d, cs = Math.sqrt(Math.max(0, 1 - sn * sn));
    const n1 = [ux * sn - uy * cs, uy * sn + ux * cs], n2 = [ux * sn + uy * cs, uy * sn - ux * cs];
    const ang = (v) => Math.atan2(v[1], v[0]);
    const m = (x) => ((x % U.TAU) + U.TAU) % U.TAU;
    const arcVia = (c, r, a0, a1, via) => P.arc(c[0], c[1], r, a0, a1, !(m(via - a0) < m(a1 - a0)));
    P.moveTo(a[0] + ra * n1[0], a[1] + ra * n1[1]);
    P.lineTo(b[0] + rb * n1[0], b[1] + rb * n1[1]);
    arcVia(b, rb, ang(n1), ang(n2), Math.atan2(uy, ux));
    P.lineTo(a[0] + ra * n2[0], a[1] + ra * n2[1]);
    arcVia(a, ra, ang(n2), ang(n1), Math.atan2(-uy, -ux));
    P.closePath();
    return P;
  }

  // symmetric closed shape: start point + cubic segments [c1, c2, end] down the viewer's left half, mirrored back up
  function symPath(start, segs) {
    const mx = (q) => [100 - q[0], q[1]], P = new Path2D();
    P.moveTo(start[0], start[1]);
    for (const [c1, c2, e] of segs) P.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], e[0], e[1]);
    const ends = [start, ...segs.map((sg) => sg[2])], last = mx(ends[ends.length - 1]);
    P.lineTo(last[0], last[1]);
    for (let i = segs.length - 1; i >= 0; i--) {
      const [c1, c2] = segs[i], c2m = mx(c2), c1m = mx(c1), e = mx(ends[i]);
      P.bezierCurveTo(c2m[0], c2m[1], c1m[0], c1m[1], e[0], e[1]);
    }
    P.closePath();
    return P;
  }

  /* ---------- low-poly helpers: the regular shapes rebuilt from straight edges ---------- */
  function hull(pts) {
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  // n-gon ellipse with a vertex on top
  function ellPoly(c, rx, ry, deg, n) {
    const r = deg * R2D, cs = Math.cos(r), sn = Math.sin(r), pts = [];
    for (let i = 0; i < n; i++) { const t = -Math.PI / 2 + (i * U.TAU) / n, x = Math.cos(t) * rx, y = Math.sin(t) * ry; pts.push([c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]); }
    return roundPoly(pts, 0);
  }
  // faceted limb: hull of two n-gons aligned with the limb (flat end caps)
  function taperPoly(a, ra, b, rb, n) {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), pts = [];
    for (let i = 0; i < n; i++) { const t = ang + Math.PI / n + (i * U.TAU) / n; pts.push([a[0] + Math.cos(t) * ra, a[1] + Math.sin(t) * ra], [b[0] + Math.cos(t) * rb, b[1] + Math.sin(t) * rb]); }
    return roundPoly(hull(pts), 0);
  }
  // symPath with every cubic replaced by k straight segments
  function symPoly(start, segs, k) {
    const left = [start];
    let a = start;
    for (const [c1, c2, e, kk] of segs) {
      const n = kk || k;
      for (let i = 1; i <= n; i++) {
        const t = i / n, m = 1 - t, w0 = m * m * m, w1 = 3 * m * m * t, w2 = 3 * m * t * t, w3 = t * t * t;
        left.push([w0 * a[0] + w1 * c1[0] + w2 * c2[0] + w3 * e[0], w0 * a[1] + w1 * c1[1] + w2 * c2[1] + w3 * e[1]]);
      }
      a = e;
    }
    return roundPoly(left.concat(left.slice().reverse().map((q) => [100 - q[0], q[1]])), 0);
  }

  /* ---------- joints of the regular style ---------- */
  function joints(p) {
    const hs = p.headSize, b = p.build, J = { hs, b };
    J.hh = 24 * hs; J.hw = 18 * hs; J.headCy = J.hh / 2;
    J.shY = J.hh + 5 * p.neckLen;
    J.sw = 17 * p.shoulders * (0.85 + 0.15 * b);
    J.nw = 4.3 * b;
    J.shR = 4.4 * b; // upper arm radius at the shoulder = the round shoulder of the thorax
    J.shDx = J.sw - 4.2 * (0.6 + 0.4 * b);
    J.shCy = J.shY + 1.1 + J.shR; // top of the arm 1.1 below the shoulder line (= shY + 5.5 at build 1)
    J.ww = 11.5 * (0.65 + 0.35 * b) * (0.8 + 0.2 * p.hips);
    J.waistY = J.shY + 31;
    J.H = 13 * p.hips * (0.75 + 0.25 * b);
    J.hipY = J.waistY + 13;
    J.crotchY = J.waistY + 22;
    J.side = (s) => {
      const o = {};
      o.sh = [X(s, J.shDx), J.shCy];
      o.d1 = dirA(s, p.armSpread);
      o.elbow = add(o.sh, o.d1, 28 * p.armLen);
      o.d2 = dirA(s, p.armSpread - p.elbowBend);
      o.wrist = add(o.elbow, o.d2, 25 * p.armLen);
      o.dh = dirA(s, p.armSpread - p.elbowBend + p.handAngle);
      o.inH = [o.dh[1] * -s, o.dh[0] * s];
      o.hip = [X(s, J.H * 0.5), J.hipY + 2];
      o.dl = dirA(s, p.legSpread);
      o.knee = add(o.hip, o.dl, 40 * p.legLen);
      o.ankle = add(o.knee, o.dl, 38 * p.legLen);
      o.df = dirA(s, p.legSpread + p.footAngle);
      o.inA = [o.d2[1] * -s, o.d2[0] * s]; // toward the body (perpendicular to the forearm)
      o.inL = [o.dl[1] * -s, o.dl[0] * s];
      return o;
    };
    return J;
  }

  function regular(p, J, sides) {
    const { b, hh, hw, headCy, shY, sw, nw, ww, waistY, H, hipY, crotchY } = J, L = (dx, y) => [50 - dx, y];
    const parts = {}, details = [];
    const poly = p.style === 'lowpoly', nF = Math.max(3, p.facets | 0), kS = Math.max(1, Math.round(nF / 3));
    // limbs keep at least 6 corners so bent joints stay flush; hands and feet at least 4
    const nL = Math.max(6, nF), nE = Math.max(4, nF);
    const El = (c, rx, ry, deg = 0, n = nF + 2) => (poly ? ellPoly(c, rx, ry, deg, n) : ell(c, rx, ry, deg));
    const Tp = (a, ra, bb, rb, n = nL) => (poly ? taperPoly(a, ra, bb, rb, n) : taper(a, ra, bb, rb));
    const SP = (start, segs) => (poly ? symPoly(start, segs, kS) : symPath(start, segs));
    parts.head = [fill(El([50, headCy], hw / 2, hh / 2))];
    parts.neck = [fill(Tp([50, hh - 4], 3.9 * b, [50, shY + 5], nw))];
    // the shoulder is the cap of the upper arm (circle around the shoulder joint with the arm's radius): the outline
    // runs flat onto its top, follows it around the outside (cubic quarter circle) and leaves it tangentially,
    // so the arm hanging behind continues the same curve without a bump
    // neck to shoulder: one quarter ellipse from the neck base (flat) to the outer side of the shoulder joint (vertical).
    // The joint sits so the upper arm's round top always stays inside it, so the arm behind adds no bump
    const cx = J.shDx, cy = J.shCy, r = J.shR, N = [nw, shY - 0.5], E = [cx + r, cy];
    // fullness f of the cubic: the roundest curve (from a quarter ellipse, f = 0.55) that still contains the arm's top
    let C1 = [E[0], N[1]], C2 = C1;
    for (let f = 0.55; f <= 1.001; f += 0.025) {
      const c1 = [N[0] + f * (E[0] - N[0]), N[1]], c2 = [E[0], E[1] - f * (E[1] - N[1])], pts = [];
      for (let i = 0; i <= 64; i++) {
        const t = i / 64, m = 1 - t, w0 = m * m * m, w1 = 3 * m * m * t, w2 = 3 * m * t * t, w3 = t * t * t;
        pts.push([w0 * N[0] + w1 * c1[0] + w2 * c2[0] + w3 * E[0], w0 * N[1] + w1 * c1[1] + w2 * c2[1] + w3 * E[1]]);
      }
      let ok = true;
      for (let a = 0; a <= 48 && ok; a++) {
        const th = -Math.PI + (a * Math.PI) / 48, qu = cx + r * Math.cos(th), qy = cy + r * Math.sin(th);
        if (qu <= N[0]) continue;
        let j = 1;
        while (j < pts.length - 1 && pts[j][0] < qu) j++;
        const A = pts[j - 1], B = pts[j], yc = A[1] + (B[1] - A[1]) * clamp((qu - A[0]) / (B[0] - A[0] || 1));
        if (qy < yc - 0.03) ok = false; // the arm pokes out above the shoulder curve
      }
      if (ok) { C1 = c1; C2 = c2; break; }
    }
    parts.thorax = [fill(SP(L(N[0], N[1]), [
      [L(C1[0], C1[1]), L(C2[0], C2[1]), L(E[0], E[1]), Math.max(2, kS)],
      // flank from the shoulder down to the armpit, relative to the shoulder (no S-curve on heavy builds)
      [L(E[0], cy + 4), L(E[0] - 1.8, shY + 13), L(E[0] - 2.4, shY + 18)],
      [L(E[0] - 3.8, shY + 23), L(ww + 0.6, waistY - 7), L(ww, waistY)],
    ]))];
    parts.stomach = [fill(SP(L(ww + 0.15, waistY - 2), [
      [L(ww + 0.3, waistY + 4), L(H, hipY - 5), L(H, hipY)],
      [L(H, hipY + 3.5), L(H - 1, hipY + 6), L(H - 2.5, hipY + 7.5)],
      [L(H * 0.55, hipY + 9), L(3, crotchY - 1), L(0, crotchY)],
    ]))];
    for (const [sfx, s] of sides) {
      const o = J.side(s);
      parts['upperArm' + sfx] = [fill(Tp(o.sh, poly ? J.shR * 0.86 : J.shR, o.elbow, 3.5 * b))];
      const hz = p.handSize, fz = p.footSize;
      parts['lowerArm' + sfx] = [fill(Tp(o.elbow, 3.4 * b, o.wrist, 2.4 * b))];
      parts['hand' + sfx] = [fill(Tp(add(o.wrist, o.dh, 0.6), 2.2 * b * hz, add(o.wrist, o.dh, 7.4 * hz), 2.7 * b * hz, nE))];
      parts['upperLeg' + sfx] = [fill(Tp(o.hip, H * 0.48, o.knee, 4.6 * b))];
      parts['lowerLeg' + sfx] = [fill(Tp(o.knee, 4.4 * b, o.ankle, 2.5 * b)), fill(El(add(o.knee, o.dl, 11), 4.6 * b, 9, rotDeg(o.dl), nL + 2))];
      parts['foot' + sfx] = [fill(Tp(add(o.ankle, o.dl, 1), 2.6 * b * fz, add(o.ankle, o.df, 7.5 * fz), 3 * b * fz, nE))];
      details.push({ P: quad(add(o.knee, perp(o.dl), -2.6), add(o.knee, o.dl, 2.2), add(o.knee, perp(o.dl), 2.6)), a: 0.6 });
      details.push({ P: quad(add(o.elbow, perp(o.d1), -1.6), add(o.elbow, o.d1, 1.2), add(o.elbow, perp(o.d1), 1.6)), a: 0.4 });
    }
    for (const s of [-1, 1]) {
      details.push({ P: quad([X(s, 2), shY + 3.6], [X(s, sw * 0.45), shY + 2], [X(s, sw - 4), shY + 3.6]), a: 0.55 }); // collarbones
      details.push({ P: quad([X(s, sw - 5), shY + 15], [X(s, 6), shY + 19.5], [X(s, 1), shY + 15.5]), a: 0.7 }); // pecs
    }
    details.push({ P: line([50, shY + 21], [50, waistY + 6]), a: 0.45 });
    details.push({ P: quad([X(-1, ww - 1), waistY], [50, waistY + 2], [X(1, ww - 1), waistY]), a: 0.35 });
    return { parts, details, face: { cx: 50, cy: headCy, w: hw, h: hh } };
  }

  function blocky(p, sides) {
    const hs = p.headSize, b = p.build, rr = p.blockRound, parts = {};
    const R = (w, h) => rr * Math.min(w, h) / 2;
    const hd = 17 * hs, nh = 4 * p.neckLen, shY = hd + nh;
    const tw = 13 * p.shoulders * (0.7 + 0.3 * b), waistY = shY + 26, sh2 = tw * 0.92 * p.hips, hipY = waistY + 16;
    parts.head = [fill(box([50, hd / 2], hd, hd, R(hd, hd)))];
    parts.neck = [fill(box([50, hd + nh / 2], 6 * b, nh + 2, R(6 * b, nh + 2) * 0.5))];
    parts.thorax = [fill(box([50, shY + 13], 2 * tw, 26, R(2 * tw, 26)))];
    parts.stomach = [fill(box([50, waistY + 7.5], 2 * sh2, 17, R(2 * sh2, 16)))]; // overlaps the thorax: no hairline when merged
    const aw = 6.5 * b, lw = 8.5 * b;
    for (const [sfx, s] of sides) {
      const sh = [X(s, tw + aw / 2), shY], d1 = dirA(s, p.armSpread), el = add(sh, d1, 24 * p.armLen);
      const d2 = dirA(s, p.armSpread - p.elbowBend), wr = add(el, d2, 18 * p.armLen);
      const dh = dirA(s, p.armSpread - p.elbowBend + p.handAngle), hz = p.handSize, hw = aw * 0.95 * (0.7 + 0.3 * hz);
      parts['upperArm' + sfx] = [fill(segBox(sh, el, aw, R(aw, 24)))];
      parts['lowerArm' + sfx] = [fill(segBox(el, wr, aw * 0.92, R(aw, 18)))];
      parts['hand' + sfx] = [fill(segBox(wr, add(wr, dh, 6 * hz), hw, R(hw, 6 * hz)))];
      const hp = [X(s, sh2 - lw / 2), hipY], dl = dirA(s, p.legSpread), kn = add(hp, dl, 28 * p.legLen), an = add(kn, dl, 26 * p.legLen);
      parts['upperLeg' + sfx] = [fill(segBox(hp, kn, lw, R(lw, 28)))];
      parts['lowerLeg' + sfx] = [fill(segBox(kn, an, lw * 0.9, R(lw, 26)))];
      const fz = p.footSize, fd = dirA(s, p.legSpread + p.footAngle * 0.4), fw = (lw + 2.5) * fz;
      const fc = add(add(an, dl, 2.5 * fz), [s, 0], (1.2 + p.footAngle * 0.03) * fz);
      parts['foot' + sfx] = [fill(segBox(add(fc, fd, -2.6 * fz), add(fc, fd, 2.6 * fz), fw, R(fw, 5.2 * fz)))];
    }
    return { parts, details: [], face: { cx: 50, cy: hd / 2, w: hd, h: hd } };
  }

  /* ---------- face: eyes, eyebrows and mouth on the head ----------
     Face space: 100 units across the head's short side, origin at the head center (x right, y down).
     Every expression is [eyes, brows, mouth]; each feature returns point-list shapes for one eye side
     (ex = eye center x, side = -1 viewer's left / +1 viewer's right, the inner end points toward side * -1):
     strokes (open or closed polylines), fills (closed) and tears (closed, own color). Curves are sampled with
     the current face style's resolution (FQ): fine for regular, a few straight segments for low poly; the blocky
     style rasterizes the regular shapes onto a coarse pixel grid. */
  // px: pixel style, a few glyphs swap to versions that survive the coarse grid
  const FACE_STYLES = { regular: { nc: 16, ne: 32, ns: 60 }, lowpoly: { nc: 3, ne: 6, ns: 16 }, blocky: { nc: 16, ne: 32, ns: 60, px: true } };
  let FQ = FACE_STYLES.regular;
  const qPt = (a, c, b, t) => { const m = 1 - t; return [m * m * a[0] + 2 * m * t * c[0] + t * t * b[0], m * m * a[1] + 2 * m * t * c[1] + t * t * b[1]]; };
  const cPt = (a, c1, c2, b, t) => { const m = 1 - t, w0 = m * m * m, w1 = 3 * m * m * t, w2 = 3 * m * t * t, w3 = t * t * t; return [w0 * a[0] + w1 * c1[0] + w2 * c2[0] + w3 * b[0], w0 * a[1] + w1 * c1[1] + w2 * c2[1] + w3 * b[1]]; };
  const fLine = (...pts) => ({ pts });
  const fQuad = (a, c, b) => { const pts = []; for (let i = 0; i <= FQ.nc; i++) pts.push(qPt(a, c, b, i / FQ.nc)); return { pts }; };
  const fEll = (c, rx, ry) => { const pts = []; for (let i = 0; i < FQ.ne; i++) { const t = -Math.PI / 2 + (i * U.TAU) / FQ.ne; pts.push([c[0] + Math.cos(t) * rx, c[1] + Math.sin(t) * ry]); } return { pts, closed: true }; };
  // closed outline from a start point and ['L', p] / ['Q', c, p] / ['C', c1, c2, p] steps
  function fPath(start, ...ops) {
    const pts = [start];
    let cur = start;
    for (const op of ops) {
      if (op[0] === 'L') pts.push(op[1]);
      else for (let i = 1; i <= FQ.nc; i++) pts.push(op[0] === 'Q' ? qPt(cur, op[1], op[2], i / FQ.nc) : cPt(cur, op[1], op[2], op[3], i / FQ.nc));
      cur = op[op.length - 1];
    }
    return { pts, closed: true };
  }
  // polygon with each corner rounded by a quadratic curve
  function fRoundPoly(P, r) {
    const n = P.length, unit = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    const corner = (i) => { const c = P[i], u0 = unit(c, P[(i - 1 + n) % n]), u1 = unit(c, P[(i + 1) % n]); return [add(c, u0, r), c, add(c, u1, r)]; };
    const c0 = corner(0), ops = [];
    for (let i = 1; i <= n; i++) { const [p1, c, p2] = corner(i % n); ops.push(['L', p1], ['Q', c, p2]); }
    return fPath(c0[2], ...ops.slice(0, -2), ['L', c0[0]], ['Q', c0[1], c0[2]]);
  }
  const fCubic2 = (a, b1, b2, m, c1, c2, e) => {
    const pts = [];
    for (let i = 0; i <= FQ.nc; i++) pts.push(cPt(a, b1, b2, m, i / FQ.nc));
    for (let i = 1; i <= FQ.nc; i++) pts.push(cPt(m, c1, c2, e, i / FQ.nc));
    return { pts };
  };
  const fTear = (c, r) => { const [x, y] = c; return fPath([x, y - r * 1.6], ['C', [x + r, y - r * 0.4], [x + r, y + r], [x, y + r]], ['C', [x - r, y + r], [x - r, y - r * 0.4], [x, y - r * 1.6]]); };
  const fHeart = (c, k = 1) => { const [x, y] = c; return fPath([x, y + 5.5 * k], ['C', [x - 9 * k, y - 0.5 * k], [x - 4.5 * k, y - 8 * k], [x, y - 3 * k]], ['C', [x + 4.5 * k, y - 8 * k], [x + 9 * k, y - 0.5 * k], [x, y + 5.5 * k]]); };

  const EX = 14, EY = 0, BY = -14, MY = 22;
  const EYES = {
    dot: (ex) => ({ fills: [fEll([ex, EY], 4, 5)] }),
    ring: (ex) => ({ strokes: [fEll([ex, EY], 7, 7)], fills: [fEll([ex, EY + 0.5], 2.2, 2.2)] }),
    happy: (ex) => ({ strokes: [fQuad([ex - 6, EY + 2], [ex, EY - 7], [ex + 6, EY + 2])] }),
    closed: (ex) => ({ strokes: [fQuad([ex - 6, EY], [ex, EY + 5], [ex + 6, EY])] }),
    squeeze: (ex, side) => ({ strokes: [fLine([ex + 6 * side, EY - 5], [ex - 4 * side, EY], [ex + 6 * side, EY + 5])] }), // > <
    x: (ex) => ({ strokes: [fLine([ex - 5, EY - 5], [ex + 5, EY + 5]), fLine([ex + 5, EY - 5], [ex - 5, EY + 5])] }),
    spiral: (ex, side) => {
      if (FQ.px) return { strokes: [fEll([ex, EY + 1], 5.5, 5.5)] }; // pixel style: a hollow ring reads better than a spiral
      const pts = [];
      for (let i = 0; i <= FQ.ns; i++) { const t = i / FQ.ns, a = t * U.TAU * 1.6 * side, rr = 1.2 + t * 7; pts.push([ex + Math.cos(a) * rr, EY + Math.sin(a) * rr]); }
      return { strokes: [{ pts }] };
    },
    // dot under a lid line; tilt > 0 lowers the inner end (angry), 0 = flat (determined / tired)
    lid: (ex, side, tilt = 0) => ({ fills: [fEll([ex, EY + 1.5], 3.6, 4)], strokes: [fLine([ex + 6.5 * side, EY - 3 + tilt * 3], [ex - 6.5 * side, EY - 3 - tilt * 1.5])] }),
    halfClosed: (ex) => ({ fills: [fEll([ex, EY + 2], 3.4, 2.6)], strokes: [fLine([ex - 6.5, EY], [ex + 6.5, EY])] }),
    laugh: (ex) => ({ strokes: [fLine([ex - 6, EY + 2.5], [ex, EY - 4], [ex + 6, EY + 2.5])] }),
    // closed, sagging eyes with a tear and a short stream below
    cry: (ex, side) => ({ strokes: [fQuad([ex - 6, EY - 1], [ex, EY + 4], [ex + 6, EY - 1])], tears: [fTear([ex - 2 * side, EY + 9], 3), fTear([ex - 3 * side, EY + 17], 2.2)] }),
    wink: (ex, side) => (side < 0 ? EYES.dot(ex) : EYES.happy(ex)),
    heart: (ex) => ({ fills: [fHeart([ex, EY], FQ.px ? 1.5 : 1)] }),
  };
  const BROWS = {
    none: () => ({}),
    flat: (ex) => ({ strokes: [fLine([ex - 7, BY], [ex + 7, BY])] }),
    low: (ex) => ({ strokes: [fLine([ex - 7, BY + 3], [ex + 7, BY + 3])] }),
    raised: (ex) => ({ strokes: [fQuad([ex - 7, BY - 1], [ex, BY - 7], [ex + 7, BY - 1])] }),
    high: (ex) => ({ strokes: [fQuad([ex - 7, BY - 4], [ex, BY - 11], [ex + 7, BY - 4])] }),
    angry: (ex, side) => ({ strokes: [fLine([ex + 7 * side, BY - 3], [ex - 7 * side, BY + 4])] }),
    halfAngry: (ex, side) => ({ strokes: [fLine([ex + 7 * side, BY - 1], [ex - 7 * side, BY + 2])] }),
    sad: (ex, side) => ({ strokes: [fLine([ex + 7 * side, BY + 2], [ex - 7 * side, BY - 4])] }),
    uneven: (ex, side) => (side < 0 ? BROWS.high(ex) : BROWS.low(ex)),
    oneUp: (ex, side) => (side < 0 ? BROWS.high(ex) : BROWS.flat(ex)),
  };
  const MOUTHS = {
    line: () => ({ strokes: [fLine([-9, MY], [9, MY])] }),
    small: () => ({ strokes: [fLine([-5, MY], [5, MY])] }),
    smile: () => ({ strokes: [fQuad([-12, MY - 3], [0, MY + 9], [12, MY - 3])] }),
    frown: () => ({ strokes: [fQuad([-10, MY + 4], [0, MY - 5], [10, MY + 4])] }),
    grimace: () => ({ strokes: [fLine([-12, MY], [-7, MY - 3], [-2, MY + 3], [3, MY - 3], [8, MY + 3], [12, MY])] }),
    wavy: () => ({ strokes: [fCubic2([-12, MY], [-8, MY - 5], [-4, MY + 5], [0, MY], [4, MY - 5], [8, MY + 5], [12, MY])] }),
    o: () => ({ strokes: [fEll([0, MY + 1], 4.5, 6)] }),
    smirk: () => ({ strokes: [fQuad([-9, MY + 1], [4, MY + 1.5], [11, MY - 3])] }),
    smallFrown: () => ({ strokes: [fQuad([-6, MY + 2], [0, MY - 2.5], [6, MY + 2])] }),
    // open mouths are filled
    laughOpen: () => ({ fills: [fPath([-13, MY - 4], ['L', [13, MY - 4]], ['Q', [13, MY + 12], [0, MY + 12]], ['Q', [-13, MY + 12], [-13, MY - 4]])] }),
    wail: () => ({ fills: [fPath([-11, MY + 7], ['Q', [0, MY - 9], [11, MY + 7]], ['Q', [0, MY + 2], [-11, MY + 7]])] }),
    scream: () => ({ fills: [fRoundPoly([[-8, MY - 4], [8, MY - 4], [6, MY + 9], [-6, MY + 9]], 3)] }),
    pant: () => ({ fills: [fEll([0, MY + 1], 3.6, 4.6)] }),
  };
  const EXPRESSIONS = {
    neutral: ['dot', 'flat', 'line'],
    happy: ['happy', 'raised', 'smile'],
    angry: [(ex, side) => EYES.lid(ex, side, 1), 'angry', 'frown'],
    sad: ['dot', 'sad', 'frown'],
    injured: ['squeeze', 'sad', 'grimace'],
    dizzy: ['spiral', 'uneven', 'wavy'],
    surprised: ['ring', 'high', 'o'],
    sleepy: ['closed', 'low', 'small'],
    knockedOut: ['x', 'none', 'wavy'],
    determined: [(ex, side) => EYES.lid(ex, side, 0), 'halfAngry', 'smirk'],
    sick: ['halfClosed', 'sad', 'wavy'],
    crying: ['cry', 'sad', 'wail'],
    laughing: ['laugh', 'raised', 'laughOpen'],
    wink: ['wink', 'raised', 'smile'],
    furious: [(ex, side) => EYES.lid(ex, side, 1), 'angry', 'scream'],
    worried: ['dot', 'sad', 'smallFrown'],
    skeptical: ['dot', 'oneUp', 'line'],
    inLove: ['heart', 'raised', 'smile'],
    exhausted: ['halfClosed', 'low', 'pant'],
  };
  const FACE_OPTIONS = [['none', 'None'], ['auto', 'Auto (from head health)'], ['neutral', 'Neutral'], ['happy', 'Happy'], ['angry', 'Angry'], ['sad', 'Sad'],
    ['injured', 'Injured (pain)'], ['dizzy', 'Dizzy'], ['surprised', 'Surprised / scared'], ['sleepy', 'Sleepy / unconscious'], ['knockedOut', 'Knocked out'], ['determined', 'Determined'], ['sick', 'Sick / nauseous'],
    ['crying', 'Crying'], ['laughing', 'Laughing'], ['wink', 'Wink'], ['furious', 'Furious (shouting)'], ['worried', 'Worried'], ['skeptical', 'Skeptical'], ['inLove', 'In love'], ['exhausted', 'Exhausted']];
  // the expression to draw (null = no face): "auto" follows the head's health
  function faceExpr(p) {
    if (p.face === 'none' || p.fromBack) return null;
    if (p.face !== 'auto') return EXPRESSIONS[p.face] ? p.face : null;
    const h = p.h_head == null ? 1 : p.h_head;
    return h >= 0.75 ? 'happy' : h >= 0.5 ? 'neutral' : h >= 0.25 ? 'sad' : h > 0 ? 'injured' : 'knockedOut';
  }
  // regular / lowpoly / blocky ("match" follows the body style)
  const faceStyleOf = (p) => (p.faceStyle === 'match' ? (p.style === 'lowpoly' ? 'lowpoly' : p.style === 'blocky' ? 'blocky' : 'regular') : p.faceStyle || 'regular');
  function facePaths(expr, p, style) {
    FQ = FACE_STYLES[style] || FACE_STYLES.regular;
    const [e, b, m] = EXPRESSIONS[expr], strokes = [], fills = [], tears = [];
    const addF = (f) => { if (f.strokes) strokes.push(...f.strokes); if (f.fills) fills.push(...f.fills); if (f.tears) tears.push(...f.tears); };
    const pick = (set, k) => (typeof k === 'function' ? k : set[k]);
    const ex = EX * p.eyeSpacing, bx = ex * p.browSpacing;
    // brows and mouth are drawn at their default place, then moved by the height sliders
    const moved = (f, dy) => {
      if (!dy) return f;
      const mv = (arr) => arr && arr.map((sh) => ({ pts: sh.pts.map((q) => [q[0], q[1] + dy]), closed: sh.closed }));
      return { strokes: mv(f.strokes), fills: mv(f.fills), tears: mv(f.tears) };
    };
    for (const side of [-1, 1]) {
      if (p.faceEyes) addF(pick(EYES, e)(side * ex, side));
      if (p.faceBrows) addF(moved(pick(BROWS, b)(side * bx, side), p.browY));
    }
    if (p.faceMouth) addF(moved(MOUTHS[m](), p.mouthY));
    FQ = FACE_STYLES.regular;
    return { strokes, fills, tears };
  }
  const shapePath = (sh) => { const P = new Path2D(); sh.pts.forEach((q, i) => (i ? P.lineTo(q[0], q[1]) : P.moveTo(q[0], q[1]))); if (sh.closed) P.closePath(); return P; };
  // draws the face shapes on g (already in face space); lw = line width in face units
  function drawFace(g, f, style, lw, color, tearColor, pixels) {
    const paint = (c, shapes, strokes) => {
      c.fillStyle = c.strokeStyle = color;
      for (const sh of shapes.fills) c.fill(shapePath(sh));
      for (const sh of strokes) c.stroke(shapePath(sh));
      if (shapes.tears.length) { c.fillStyle = tearColor; for (const sh of shapes.tears) c.fill(shapePath(sh)); }
    };
    if (style !== 'blocky') {
      g.lineWidth = lw;
      if (style === 'lowpoly') { g.lineCap = 'square'; g.lineJoin = 'miter'; g.miterLimit = 3; } else { g.lineCap = 'round'; g.lineJoin = 'round'; }
      paint(g, f, f.strokes);
      return;
    }
    // blocky: pixel art on a G × G grid over the face box (-50 … 50). Lines walk their segments and mark every cell
    // they pass (thick lines also the cells within the line radius), filled shapes mark the cells they cover and at
    // least the cell at their center, then every marked cell is drawn as a square
    // the grid covers only where features can be (x -38 … 38, y -36 … 40 incl. the height sliders), so pixels stay small
    const HB = 38, CY = 2, G = Math.max(5, pixels | 0) | 1, cell = (2 * HB) / G;
    const ci = (v) => Math.floor((v + HB) / cell), cj = (v) => Math.floor((v - CY + HB) / cell);
    // odd grid: a center column straddles x = 0, and columns are mirrored around it, so symmetric features stay symmetric
    const cx = (v) => (v >= 0 ? ci(v) : G - 1 - ci(-v));
    const inG = (i, j) => i >= 0 && j >= 0 && i < G && j < G;
    const main = new Uint8Array(G * G), wet = new Uint8Array(G * G);
    const rr = Math.max(0, lw / 2 - cell / 2), rc = Math.ceil(rr / cell);
    const mark = (grid, x, y) => {
      const i0 = cx(x), j0 = cj(y);
      for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) {
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= G || j >= G || (di || dj) && Math.hypot(di, dj) * cell > rr + cell * 0.5) continue;
        grid[j * G + i] = 1;
      }
    };
    for (const sh of f.strokes) {
      const P = sh.closed ? sh.pts.concat([sh.pts[0]]) : sh.pts;
      for (let k = 1; k < P.length; k++) {
        const A = P[k - 1], B = P[k], n = Math.max(1, Math.ceil(Math.hypot(B[0] - A[0], B[1] - A[1]) / (cell * 0.25)));
        for (let t = 0; t <= n; t++) mark(main, A[0] + ((B[0] - A[0]) * t) / n, A[1] + ((B[1] - A[1]) * t) / n);
      }
    }
    const cover = (grid, shapes) => {
      if (!shapes.length) return;
      const sm = U.canvas(G, G), c = sm.getContext('2d');
      c.setTransform(1 / cell, 0, 0, 1 / cell, G / 2, G / 2 - CY / cell);
      c.fillStyle = '#fff';
      for (const sh of shapes) {
        c.fill(shapePath(sh));
        let mx = 0, my = 0;
        for (const q of sh.pts) { mx += q[0]; my += q[1]; }
        const i = cx(mx / sh.pts.length), j = cj(my / sh.pts.length);
        if (inG(i, j)) grid[j * G + i] = 1;
      }
      const d = c.getImageData(0, 0, G, G).data;
      for (let i = 0; i < G * G; i++) if (d[i * 4 + 3] >= 128) grid[i] = 1;
    };
    cover(main, f.fills);
    cover(wet, f.tears);
    const ov = 0.02 * cell; // tiny overlap: no seams between cells
    const draw = (grid, col) => {
      g.fillStyle = col;
      for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) if (grid[j * G + i]) g.fillRect(-HB + i * cell - ov, CY - HB + j * cell - ov, cell + 2 * ov, cell + 2 * ov);
    };
    draw(main, color);
    for (let i = 0; i < G * G; i++) if (main[i]) wet[i] = 0;
    draw(wet, tearColor);
  }

  function figure(p) {
    const s = p.fromBack ? -1 : 1, sides = [['L', s], ['R', -s]];
    let f;
    if (p.style === 'blocky') f = blocky(p, sides);
    else {
      f = regular(p, joints(p), sides);
    }
    f.parts = group(p, f.parts);
    f.ids = PRIO.filter((id) => f.parts[id]);
    return f;
  }

  /* ---------- drawing ---------- */
  // white primitives in unit space; T = [scale, tx, ty]. erase: remove the shape (cut-outs ignored)
  function drawPrims(c, prims, T, erase) {
    c.save();
    c.setTransform(T[0], 0, 0, T[0], T[1], T[2]);
    c.fillStyle = c.strokeStyle = '#fff';
    c.lineCap = 'round'; c.lineJoin = 'round';
    const draw = (pr) => { if (pr.w) { c.lineWidth = pr.w; c.stroke(pr.P); } else c.fill(pr.P); };
    c.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    for (const pr of prims) if (!pr.cut) draw(pr);
    if (!erase) { c.globalCompositeOperation = 'destination-out'; for (const pr of prims) if (pr.cut) draw(pr); }
    c.restore();
  }

  // unit-space bounding box of a primitive list (rendered at low resolution)
  const BB = { x0: -50, y0: -20, w: 200, h: 260, s: 2 };
  function unitBox(prims) {
    const R = BB.s, cw = BB.w * R, ch = BB.h * R, c = U.canvas(cw, ch), g = c.getContext('2d');
    drawPrims(g, prims, [R, -BB.x0 * R, -BB.y0 * R]);
    const d = g.getImageData(0, 0, cw, ch).data;
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (d[(y * cw + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    return [x0 / R + BB.x0, y0 / R + BB.y0, (x1 + 1) / R + BB.x0, (y1 + 1) / R + BB.y0];
  }

  /* exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher), in place on f (0 at features) */
  function edt(f, W, H) {
    const n = Math.max(W, H), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), g = new Float64Array(n);
    const pass = (len, get, set) => {
      for (let q = 0; q < len; q++) g[q] = get(q);
      let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
      for (let q = 1; q < len; q++) {
        let s;
        do { const r = v[k]; s = ((g[q] + q * q) - (g[r] + r * r)) / (2 * q - 2 * r); if (s <= z[k]) k--; else break; } while (k >= 0);
        k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
      }
      k = 0;
      for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; const r = v[k]; d[q] = (q - r) * (q - r) + g[r]; }
      for (let q = 0; q < len; q++) set(q, d[q]);
    };
    for (let x = 0; x < W; x++) pass(H, (q) => f[q * W + x], (q, val) => { f[q * W + x] = val; });
    for (let y = 0; y < H; y++) { const o = y * W; pass(W, (q) => f[o + q], (q, val) => { f[o + q] = val; }); }
  }
  /* signed distance (px, negative inside) from an alpha mask */
  function sdfFromAlpha(a, W, H) {
    const N = W * H, BIG = 1e12, fin = new Float64Array(N), fout = new Float64Array(N);
    for (let i = 0; i < N; i++) { const inside = a[i] >= 0.5; fin[i] = inside ? BIG : 0; fout[i] = inside ? 0 : BIG; }
    edt(fin, W, H); edt(fout, W, H);
    const s = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const al = a[i];
      if (al > 0.02 && al < 0.98) s[i] = 0.5 - al;
      else if (al >= 0.5) s[i] = -(Math.sqrt(fin[i]) - 0.5);
      else s[i] = Math.sqrt(fout[i]) - 0.5;
    }
    return s;
  }
  const alphaOf = (cv) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data, N = cv.width * cv.height, a = new Float32Array(N);
    for (let i = 0; i < N; i++) a[i] = d[i * 4 + 3] / 255;
    return a;
  };

  /* ---------- params ---------- */
  const WEAR = U.wearParams({ target: [['all', 'Everything'], ['fill', 'Fill only'], ['frame', 'Outline + background only']] });
  const isReg = (p) => p.style === 'regular' || p.style === 'lowpoly', isBlock = (p) => p.style === 'blocky';
  const statesOn = (p) => p.stateMode !== 'off';
  const HEALTH = SECTIONS.map(([id, name]) => ({ key: 'h_' + id, label: name, type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: (p) => (statesOn(p) || (id === 'head' && p.face === 'auto')) && sectionIds(p).includes(id) }));
  const faceOn = (p) => p.face !== 'none';
  const globalFill = (p) => p.fillScope === 'global';
  const globalUsed = (p) => globalFill(p) || (p.split && p.globalLayer);
  const healths = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => ['h_' + k, v]));

  U.register({
    id: 'body-ui',
    name: 'Character Body UI',
    desc: 'Human figure for status / damage HUDs in regular or blocky style, split into head, neck, thorax, stomach, arms, legs and feet',
    uses: ['Per-limb health and damage displays for survival, horror, shooter and RPG HUDs: color every section by its health or fill it like a bar, highlight the selected part, export one mask per section and tint them in the engine.', 'Medical, inventory and character screens: hologram body scans, neon outlines and blocky retro paper dolls.'],
    tags: ['UI', 'Horror', 'Shooter'],
    aspect: '1:2',
    bg: 'gray',
    icon: U.icon('<circle cx="12" cy="4.2" r="2.2"/><path d="M8.5 8h7l-.8 6h-5.4z"/><path d="M8.3 8.6 6.6 14M15.7 8.6l1.7 5.4M10.2 14.6 9.6 21M13.8 14.6l.6 6.4"/>'),
    exportLayers: (p) => {
      if (p.faceOnly && faceExpr(p)) return p.split ? [{ id: 'face', suffix: 'face' }] : null;
      if (!p.split) return null;
      const out = [{ id: 'back', suffix: 'bg' }, { id: 'fill', suffix: 'fill' }, { id: 'frame', suffix: 'outline' }];
      if (p.globalLayer && !globalFill(p)) out.push({ id: 'fillGlobal', suffix: 'fill_global' });
      if (p.progressMap && globalUsed(p)) out.push({ id: 'progress', suffix: 'progress' });
      if (p.partLayers) for (const id of sectionIds(p)) out.push({ id: 'part_' + id, suffix: 'part_' + id });
      if (p.idMap) out.push({ id: 'ids', suffix: 'part_ids' });
      if (faceExpr(p)) out.push({ id: 'face', suffix: 'face' });
      return out;
    },
    params: [
      { type: 'section', label: 'Figure' },
      { key: 'style', label: 'Style', type: 'select', default: 'regular', options: [['regular', 'Regular (silhouette)'], ['lowpoly', 'Low poly (faceted)'], ['blocky', 'Blocky (rectangles)']] },
      { key: 'fromBack', label: 'Seen from behind', type: 'bool', default: false, tip: 'Swaps the sides: off = facing the viewer (the character\'s left is on the right of the image)' },
      { key: 'margin', label: 'Margin', type: 'range', min: 0, max: 0.35, step: 0.005, default: 0.06, tip: 'Free space around the figure (share of the short side)' },
      { key: 'gap', label: 'Section gap', type: 'range', min: 0, max: 16, step: 0.25, default: 1.5, tip: 'Gap between neighbouring sections (px @ 256); the outer silhouette stays' },
      { key: 'facets', label: 'Facets', type: 'int', min: 3, max: 14, default: 6, show: (p) => p.style === 'lowpoly', tip: 'Corners per round shape: low = chunky, close to blocky; high = close to the regular silhouette' },
      { key: 'blockRound', label: 'Corner rounding', type: 'range', min: 0, max: 1, step: 0.01, default: 0.12, show: isBlock },
      { key: 'detail', label: 'Detail lines', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: isReg, tip: 'Collarbones, chest, belly line, knees and elbows' },
      { key: 'detailW', label: 'Detail width', type: 'range', min: 0.25, max: 8, step: 0.25, default: 1.25, show: (p) => isReg(p) && p.detail > 0 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Sections' },
      { key: 'torsoSplit', label: 'Torso', type: 'select', default: 'split', options: [['split', 'Thorax + stomach'], ['one', 'One section']] },
      { key: 'armSplit', label: 'Arms', type: 'select', default: 'three', options: [['three', 'Upper arm + lower arm + hand'], ['two', 'Upper arm + lower arm with hand'], ['one', 'One section']] },
      { key: 'legSplit', label: 'Legs', type: 'select', default: 'three', options: [['three', 'Upper leg + lower leg + foot'], ['two', 'Upper leg + lower leg with foot'], ['one', 'One section']] },

      { type: 'section', label: 'Body shape' },
      { key: 'headSize', label: 'Head size', type: 'range', min: 0.6, max: 1.6, step: 0.01, default: 1 },
      { key: 'neckLen', label: 'Neck length', type: 'range', min: 0.2, max: 2.5, step: 0.01, default: 1 },
      { key: 'shoulders', label: 'Shoulder width', type: 'range', min: 0.7, max: 1.4, step: 0.01, default: 1 },
      { key: 'hips', label: 'Hip width', type: 'range', min: 0.7, max: 1.4, step: 0.01, default: 1 },
      { key: 'build', label: 'Build (thickness)', type: 'range', min: 0.6, max: 1.6, step: 0.01, default: 1 },
      { key: 'armLen', label: 'Arm length', type: 'range', min: 0.7, max: 1.3, step: 0.01, default: 1 },
      { key: 'legLen', label: 'Leg length', type: 'range', min: 0.7, max: 1.3, step: 0.01, default: 1 },
      { key: 'armSpread', label: 'Arm spread', type: 'range', min: 0, max: 80, step: 0.5, default: 13, tip: 'Degrees away from the body' },
      { key: 'elbowBend', label: 'Elbow bend', type: 'range', min: -30, max: 60, step: 0.5, default: 5, tip: 'Forearm angle back toward the body (degrees)' },
      { key: 'legSpread', label: 'Leg spread', type: 'range', min: 0, max: 35, step: 0.5, default: 3 },
      { key: 'handSize', label: 'Hand size', type: 'range', min: 0.5, max: 1.8, step: 0.01, default: 1 },
      { key: 'handAngle', label: 'Hand angle', type: 'range', min: -60, max: 60, step: 0.5, default: 0, tip: 'Hands turned outward (+) or inward (−) from the forearm (degrees)' },
      { key: 'footSize', label: 'Foot size', type: 'range', min: 0.5, max: 1.8, step: 0.01, default: 1 },
      { key: 'footAngle', label: 'Foot angle', type: 'range', min: 0, max: 80, step: 0.5, default: 30, tip: 'Feet turned outward (degrees)' },

      { type: 'section', label: 'Face' },
      { key: 'face', label: 'Expression', type: 'select', default: 'none', options: FACE_OPTIONS, tip: 'Simple eyes, eyebrows and mouth on the head (hidden when seen from behind). Auto: happy, neutral, sad, injured or knocked out by the head health (Part states)' },
      { key: 'faceStyle', label: 'Face style', type: 'select', default: 'regular', options: [['regular', 'Regular (smooth)'], ['lowpoly', 'Low poly (angular)'], ['blocky', 'Blocky (pixels)'], ['match', 'Match the body style']], show: faceOn },
      { key: 'facePixels', label: 'Face pixels', type: 'int', min: 9, max: 49, step: 2, default: 23, show: (p) => faceOn(p) && faceStyleOf(p) === 'blocky', tip: 'Pixels across the face box (always odd, so the face stays symmetric): fewer = chunkier pixel face' },
      { key: 'faceColor', label: 'Face color', type: 'color', default: '#16191a', show: faceOn },
      { key: 'tearColor', label: 'Tear color', type: 'color', default: '#4aa8ff', show: (p) => p.face === 'crying' },
      { key: 'faceAlpha', label: 'Face opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: faceOn },
      { key: 'faceW', label: 'Line width', type: 'range', min: 0.5, max: 8, step: 0.25, default: 2, show: faceOn, tip: 'px @ 256' },
      { key: 'faceSize', label: 'Face size', type: 'range', min: 0.4, max: 1.6, step: 0.01, default: 1, show: faceOn },
      { key: 'eyeSpacing', label: 'Eye spacing', type: 'range', min: 0.5, max: 1.6, step: 0.01, default: 1, show: faceOn },
      { key: 'browSpacing', label: 'Eyebrow spacing', type: 'range', min: 0.5, max: 1.8, step: 0.01, default: 1, show: (p) => faceOn(p) && p.faceBrows, tip: 'Distance of the eyebrows from the center, relative to the eyes' },
      { key: 'browY', label: 'Eyebrow height', type: 'range', min: -10, max: 8, step: 0.25, default: 0, show: (p) => faceOn(p) && p.faceBrows, tip: 'Moves the eyebrows up (−) or down (+), in face units (the face is 100 wide)' },
      { key: 'mouthY', label: 'Mouth height', type: 'range', min: -12, max: 15, step: 0.25, default: 0, show: (p) => faceOn(p) && p.faceMouth, tip: 'Moves the mouth up (−) or down (+), in face units (the face is 100 wide)' },
      { key: 'faceY', label: 'Face height', type: 'range', min: -0.25, max: 0.25, step: 0.005, default: 0, show: faceOn, tip: 'Moves the face up (−) or down (+), share of the head height' },
      { key: 'faceEyes', label: 'Eyes', type: 'bool', default: true, show: faceOn },
      { key: 'faceBrows', label: 'Eyebrows', type: 'bool', default: true, show: faceOn },
      { key: 'faceMouth', label: 'Mouth', type: 'bool', default: true, show: faceOn },

      { type: 'section', label: 'Fill' },
      { key: 'fillScope', label: 'Fill', type: 'select', default: 'sections', options: [['sections', 'Per section (gaps, states)'], ['global', 'Whole body (one global fill)']], tip: 'Whole body: one continuous fill over the silhouette, without section gaps, per-section shading or health states (borders stay per section)' },
      { key: 'gValue', label: 'Fill amount', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: globalUsed, tip: 'Whole-body fill level, like a health bar. Separate layer export stays at 100 % while "Fill layer at 100 %" is on' },
      { key: 'gDir', label: 'Fills from', type: 'select', default: 'up', options: [['up', 'Bottom (rises)'], ['down', 'Top (drains)'], ['right', 'Left'], ['left', 'Right']], show: globalUsed },
      { key: 'gWave', label: 'Surface wave', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: globalUsed, tip: 'Liquid surface at the fill level' },
      { key: 'gWaves', label: 'Wave count', type: 'range', min: 0.5, max: 8, step: 0.5, default: 2, show: (p) => globalUsed(p) && p.gWave > 0 },
      { key: 'gSurface', label: 'Surface line', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: globalUsed, tip: 'Bright line at the fill level' },
      { key: 'fillColor', label: 'Fill color', type: 'color', default: '#b7bfbe' },
      { key: 'fillAlpha', label: 'Fill opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
      { key: 'fillStyle', label: 'Fill content', type: 'select', default: 'solid', options: [['solid', 'Solid'], ['gradient', 'Gradient (top to bottom)'], ['scanlines', 'Scanlines'], ['hatch', 'Hatched'], ['facets', 'Low-poly facets']] },
      { key: 'texAmount', label: 'Content strength', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.fillStyle !== 'solid' },
      { key: 'texScale', label: 'Line spacing', type: 'range', min: 1, max: 24, step: 0.25, default: 4, show: (p) => p.fillStyle === 'scanlines' || p.fillStyle === 'hatch' || p.fillStyle === 'facets', tip: 'Line spacing, or the triangle size of the low-poly facets (px @ 256)' },
      { key: 'pad', label: 'Fill inset', type: 'range', min: -4, max: 16, step: 0.25, default: 0, tip: 'Gap between the outline and the fill' },
      { key: 'shade', label: 'Inner shade', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Darkens the fill toward its edges' },
      { key: 'innerGlow', label: 'Inner glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Brighter, more opaque edges inside each section (hologram look)' },
      { key: 'innerGlowW', label: 'Inner glow width', type: 'range', min: 0.5, max: 30, step: 0.25, default: 6, show: (p) => p.innerGlow > 0 },

      { type: 'section', label: 'Border' },
      { key: 'borderMode', label: 'Border', type: 'select', default: 'parts', options: [['parts', 'Every section'], ['outer', 'Outer silhouette only'], ['both', 'Silhouette + section lines'], ['none', 'None']] },
      { key: 'borderW', label: 'Border width', type: 'range', min: 0, max: 16, step: 0.25, default: 2, show: (p) => p.borderMode !== 'none' },
      { key: 'seamW', label: 'Section line width', type: 'range', min: 0, max: 12, step: 0.25, default: 1, show: (p) => p.borderMode === 'both' },
      { key: 'seams', label: 'Seam lines', type: 'select', default: 'merged', options: [['merged', 'Merged (one line per seam)'], ['separate', 'Separate (every section outlined)']], show: (p) => p.borderMode === 'parts' || p.borderMode === 'both', tip: 'Merged: one line of the border width where two sections meet, so seams match the outer edge (a section gap wider than the line shows beside it). Separate: every section gets its own outline around its gap' },
      { key: 'borderPos', label: 'Border position', type: 'select', default: 'center', options: [['inside', 'Inside'], ['center', 'Centered on the edge'], ['outside', 'Outside']], show: (p) => p.borderMode !== 'none' },
      { key: 'borderColor', label: 'Border color', type: 'color', default: '#16191a', show: (p) => p.borderMode !== 'none' },
      { key: 'borderByState', label: 'Border uses state color', type: 'bool', default: false, show: (p) => p.borderMode !== 'none' && statesOn(p), tip: 'Every section\'s border takes the color of its health state' },
      { key: 'line2W', label: 'Inner line', type: 'range', min: 0, max: 8, step: 0.25, default: 0, show: (p) => p.borderMode !== 'none', tip: 'Second, thinner line inside the border (0 = off)' },
      { key: 'line2Gap', label: 'Inner line spacing', type: 'range', min: 0, max: 12, step: 0.25, default: 1.5, show: (p) => p.borderMode !== 'none' && p.line2W > 0 },

      { type: 'section', label: 'Background' },
      { key: 'backColor', label: 'Empty color', type: 'color', default: '#1c1f20', tip: 'Behind the fill: shows through a low fill opacity and where a section is not filled to 100 %' },
      { key: 'backAlpha', label: 'Empty opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'shadowAlpha', label: 'Drop shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'shadowBlur', label: 'Shadow blur', type: 'range', min: 0, max: 30, step: 0.5, default: 5, show: (p) => p.shadowAlpha > 0 },
      { key: 'shadowY', label: 'Shadow offset', type: 'range', min: -20, max: 20, step: 0.5, default: 2.5, show: (p) => p.shadowAlpha > 0 },
      { key: 'glow', label: 'Outer glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'glowFrom', label: 'Glow source', type: 'select', default: 'shape', options: [['shape', 'Silhouette (outside only)'], ['lines', 'Border lines (neon)']], show: (p) => p.glow > 0 },
      { key: 'glowColor', label: 'Glow color', type: 'color', default: '#ff3a3a', show: (p) => p.glow > 0 },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 1, max: 40, step: 0.5, default: 8, show: (p) => p.glow > 0 },

      { type: 'section', label: 'Part states' },
      { key: 'stateMode', label: 'Health display', type: 'select', default: 'off', options: [['off', 'Off (fill color)'], ['color', 'State color'], ['level', 'Fill level'], ['both', 'State color + fill level']], tip: 'Uses the health value of every section below' },
      { key: 'okColor', label: 'Healthy color', type: 'color', default: '#5ccf4e', show: (p) => p.stateMode === 'color' || p.stateMode === 'both' },
      { key: 'hurtColor', label: 'Hurt color', type: 'color', default: '#e8b02a', show: (p) => p.stateMode === 'color' || p.stateMode === 'both' },
      { key: 'critColor', label: 'Critical color', type: 'color', default: '#d8342b', show: (p) => p.stateMode === 'color' || p.stateMode === 'both' },
      { key: 'stepped', label: 'Stepped colors', type: 'bool', default: false, show: (p) => p.stateMode === 'color' || p.stateMode === 'both', tip: 'Three hard steps (above 66 %, above 33 %, below) instead of a smooth blend' },
      { key: 'fillDir', label: 'Fills from', type: 'select', default: 'up', options: [['up', 'Bottom (rises)'], ['down', 'Top (drains)']], show: (p) => p.stateMode === 'level' || p.stateMode === 'both' },
      { key: 'hideDead', label: 'Hide sections at 0', type: 'bool', default: false, show: statesOn, tip: 'Destroyed sections keep only their border and background' },
      ...HEALTH,
      { key: 'selected', label: 'Selected section', type: 'select', default: 'none', options: [['none', 'None']].concat(SECTIONS), tip: 'Only sections that exist with the current grouping can be selected' },
      { key: 'selColor', label: 'Selection color', type: 'color', default: '#ffd23a', show: (p) => p.selected !== 'none' },
      { key: 'selFill', label: 'Selection fill tint', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => p.selected !== 'none' },
      { key: 'selBorder', label: 'Selection border width', type: 'range', min: 1, max: 3, step: 0.05, default: 1.6, show: (p) => p.selected !== 'none', tip: 'Multiplies the border width of the selected section' },

      ...WEAR,

      { type: 'section', label: 'Output' },
      { key: 'faceOnly', label: 'Face only', type: 'bool', default: false, show: faceOn, tip: 'Preview and export only the face, at the same size and position as on the full figure, so it lies exactly on the head in the engine' },
      { key: 'split', label: 'Separate layer export', type: 'bool', default: true, tip: 'Download background, fill and outline as separate, aligned PNGs' },
      { key: 'fullFill', label: 'Fill layer at 100 %', type: 'bool', default: true, show: (p) => p.split, tip: 'Exported separate layers ignore the fill level, so the engine can mask the fill itself (the layer preview still shows it)' },
      { key: 'globalLayer', label: 'Extra global fill layer', type: 'bool', default: false, show: (p) => p.split && !globalFill(p), tip: 'Also export the whole-body fill (one continuous silhouette, no section gaps) as _fill_global' },
      { key: 'progressMap', label: 'Progress map layer', type: 'bool', default: false, show: (p) => p.split && globalUsed(p), tip: 'Extra grayscale layer for the whole-body fill: value = position along the fill direction (0 = start, 1 = end), alpha = fill shape. In the engine: show the fill where value ≤ amount' },
      { key: 'partLayers', label: 'One mask per section', type: 'bool', default: false, show: (p) => p.split, tip: 'Extra white mask PNG for every existing section (head, neck, thorax …) to tint each by its health in the engine' },
      { key: 'idMap', label: 'Part ID map', type: 'bool', default: false, show: (p) => p.split, tip: 'Extra layer: every section in its own gray value, (index + 1) × 11 in this order: head, neck, thorax, stomach, torso, upper arm L, lower arm L, hand L, whole arm L, upper arm R, lower arm R, hand R, whole arm R, upper leg L, lower leg L, foot L, whole leg L, upper leg R, lower leg R, foot R, whole leg R' },
      { key: 'view', label: 'Preview layer', type: 'select', default: 'all', options: [['all', 'Everything (combined)'], ['back', 'Background layer'], ['fill', 'Fill layer'], ['frame', 'Outline layer'], ['fillGlobal', 'Global fill layer'], ['progress', 'Progress map (global fill)'], ['face', 'Face layer'], ['ids', 'Part ID map']], tip: 'Preview only, the export uses the settings above' },
    ],
    presets: [
      { name: 'Silhouette · gray', group: 'Regular', values: { fillColor: '#8f9493', borderColor: '#2a2d2e', borderW: 1.5, gap: 0, borderMode: 'outer', shade: 0.35, backAlpha: 0 } },
      { name: 'Hologram · damage scan', group: 'Regular', values: { fillColor: '#ff3b30', fillAlpha: 0.35, fillStyle: 'scanlines', texAmount: 0.5, texScale: 3, innerGlow: 0.75, innerGlowW: 7, borderMode: 'parts', borderW: 1.5, borderColor: '#ff6a5a', borderByState: true, gap: 1, glow: 0.45, glowFrom: 'lines', glowColor: '#ff2a1a', glowSize: 10, stateMode: 'color', okColor: '#ff6a4a', hurtColor: '#e0281c', critColor: '#8a0a08', selected: 'thorax', selColor: '#ffe14a', ...healths({ thorax: 0.3, stomach: 0.55, lowerLegR: 0.4 }) } },
      { name: 'Neon outline', group: 'Regular', values: { fillAlpha: 0, borderMode: 'parts', seams: 'separate', borderW: 2.25, borderColor: '#f4d6d6', gap: 3.5, glow: 0.8, glowFrom: 'lines', glowColor: '#ff3050', glowSize: 9, armSpread: 18, legSpread: 6 } },
      { name: 'Status · health colors', group: 'Regular', values: { stateMode: 'color', borderMode: 'parts', borderW: 1.75, borderColor: '#101213', gap: 1.5, shade: 0.3, backAlpha: 0.5, ...healths({ head: 0.9, thorax: 0.6, upperArmL: 0.2, lowerArmL: 0.25, lowerLegR: 0.45, footR: 0.5 }) } },
      { name: 'Status · fill level', group: 'Regular', values: { stateMode: 'level', fillColor: '#d8d2c4', backColor: '#2a2624', backAlpha: 0.85, borderMode: 'parts', borderW: 1.5, gap: 1.5, ...healths({ thorax: 0.5, upperLegL: 0.3, lowerLegL: 0.15, upperArmR: 0.7 }) } },
      { name: 'Cartoon status · auto face', group: 'Regular', values: { face: 'auto', faceW: 2.25, fillColor: '#f0d2b0', stateMode: 'color', okColor: '#7ad35a', hurtColor: '#f2b33a', critColor: '#e0483a', borderW: 2.5, borderColor: '#1a1414', gap: 1.5, shade: 0.25, ...healths({ head: 0.35, upperArmL: 0.3, lowerLegR: 0.15, thorax: 0.7 }) } },
      { name: 'Grunge survival', group: 'Regular', values: { fillColor: '#9a2a22', stateMode: 'color', okColor: '#7d8a5a', hurtColor: '#b8862a', critColor: '#8e1e16', fillStyle: 'gradient', texAmount: 0.5, borderW: 3, borderColor: '#14100e', gap: 2.5, shade: 0.5, backAlpha: 0.6, backColor: '#201a18', grunge: 0.2, grungeType: 'chipped', grungeScale: 9, edgeWear: 0.3, dirt: 0.35, scratches: 0.2, brightNoise: 0.12, ...healths({ lowerArmR: 0.15, thorax: 0.5, footL: 0.4 }) } },
      { name: 'Clean flat', group: 'Regular', values: { fillColor: '#e4e7e6', borderMode: 'none', gap: 2.5, shadowAlpha: 0.3 } },
      { name: 'Low poly · faceted', group: 'Low poly', values: { style: 'lowpoly', facets: 6, fillColor: '#8fb4c8', fillStyle: 'facets', texAmount: 0.55, texScale: 5, borderW: 1.5, borderColor: '#14202a', gap: 1, shade: 0.2 } },
      { name: 'Low poly · health states', group: 'Low poly', values: { style: 'lowpoly', facets: 5, stateMode: 'color', stepped: true, okColor: '#58c46a', hurtColor: '#e8b02a', critColor: '#d8342b', fillStyle: 'facets', texAmount: 0.35, texScale: 6, borderW: 2, borderColor: '#101214', gap: 1.5, face: 'auto', ...healths({ head: 0.6, upperLegR: 0.25, lowerArmL: 0.4 }) } },
      { name: 'Blocky · green', group: 'Blocky', values: { style: 'blocky', fillColor: '#35e03a', borderMode: 'none', gap: 3, blockRound: 0.04, armSpread: 4, legSpread: 0, footAngle: 0 } },
      { name: 'Blocky · damage states', group: 'Blocky', values: { style: 'blocky', stateMode: 'color', stepped: true, borderMode: 'parts', seams: 'separate', borderW: 1.5, borderColor: '#0a0c0a', gap: 2.5, blockRound: 0.2, backAlpha: 0.5, armSpread: 6, legSpread: 1, footAngle: 10, selected: 'upperArmL', selColor: '#ffffff', ...healths({ upperArmL: 0.2, thorax: 0.55, lowerLegR: 0.3 }) } },
      { name: 'Med-bay hologram', group: 'Sci-fi', values: { fillColor: '#3ad6ff', fillAlpha: 0.25, fillStyle: 'scanlines', texAmount: 0.6, texScale: 3, innerGlow: 0.8, innerGlowW: 8, borderW: 1.25, borderColor: '#9af0ff', gap: 1.5, glow: 0.6, glowFrom: 'lines', glowColor: '#2ac8ff', glowSize: 10, selected: 'head', selColor: '#ffffff', selFill: 0.15 } },
      { name: 'Cyberpunk neon', group: 'Sci-fi', values: { fillColor: '#ff2bd6', fillAlpha: 0.12, innerGlow: 0.6, innerGlowW: 5, seams: 'separate', borderW: 1.75, borderColor: '#3af2ff', gap: 3, glow: 0.7, glowFrom: 'lines', glowColor: '#ff2bd6', glowSize: 12, armSpread: 20, legSpread: 7 } },
      { name: 'Mech diagnostics', group: 'Sci-fi', values: { style: 'blocky', blockRound: 0.25, fillColor: '#7fd0ff', fillAlpha: 0.3, fillStyle: 'scanlines', texScale: 2.5, innerGlow: 0.6, seams: 'separate', borderW: 1.5, borderColor: '#bfe9ff', line2W: 0.75, line2Gap: 1.5, gap: 3, stateMode: 'color', stepped: true, okColor: '#7fd0ff', hurtColor: '#ffb02a', critColor: '#ff3b3b', borderByState: true, glow: 0.4, glowFrom: 'lines', glowColor: '#5ab8ff', armSpread: 6, footAngle: 10, ...healths({ upperArmR: 0.2, lowerLegL: 0.5, thorax: 0.6 }) } },
      { name: 'Injury chart (paper)', group: 'Horror & survival', values: { fillColor: '#e9dfc7', fillStyle: 'hatch', texAmount: 0.35, texScale: 5, stateMode: 'color', okColor: '#e9dfc7', hurtColor: '#d9a066', critColor: '#a8261e', borderW: 2, borderColor: '#2a1f18', gap: 1, shade: 0.25, grunge: 0.12, dirt: 0.4, dirtColor: '#6a4a2a', edgeWear: 0.2, ...healths({ lowerArmL: 0.15, handL: 0.1, thorax: 0.55, lowerLegR: 0.4 }) } },
      { name: 'Infection spread', group: 'Horror & survival', values: { fillScope: 'global', gValue: 0.45, gWave: 0.4, gSurface: 0.5, fillColor: '#8ad13a', fillStyle: 'gradient', texAmount: 0.5, innerGlow: 0.4, backColor: '#2a2a26', backAlpha: 0.85, borderW: 2, borderColor: '#121410', glow: 0.35, glowColor: '#9aff3a' } },
      { name: 'Blood loss', group: 'Horror & survival', values: { fillScope: 'global', gValue: 0.6, gWave: 0.6, gWaves: 3, gSurface: 0.6, fillColor: '#b3140f', fillStyle: 'gradient', texAmount: 0.4, shade: 0.4, backColor: '#1e1514', backAlpha: 0.9, borderW: 2.5, borderColor: '#0d0909', grunge: 0.07, grungeType: 'chipped', dirt: 0.25, dirtColor: '#3a0806' } },
      { name: 'Armor zones', group: 'Military & tactical', values: { fillColor: '#4a5048', fillAlpha: 0.9, stateMode: 'color', stepped: true, okColor: '#cfd6cf', hurtColor: '#e0a030', critColor: '#d8342b', borderW: 1.25, borderColor: '#0e100e', gap: 2, armSplit: 'two', legSplit: 'two', ...healths({ thorax: 0.3, upperLegL: 0.6, lowerArmR: 0.5 }) } },
      { name: 'Night vision', group: 'Military & tactical', values: { fillColor: '#7dff6a', fillAlpha: 0.2, fillStyle: 'scanlines', texScale: 2, innerGlow: 0.7, innerGlowW: 6, borderMode: 'outer', borderW: 1.5, borderColor: '#b8ffae', glow: 0.6, glowColor: '#3aff2a', glowSize: 10, brightNoise: 0.25 } },
      { name: 'Thermal signature', group: 'Military & tactical', values: { fillColor: '#ffd040', fillStyle: 'gradient', texAmount: 0.35, shade: 0.9, borderMode: 'none', gap: 0, torsoSplit: 'one', armSplit: 'one', legSplit: 'one', glow: 0.5, glowColor: '#ff3a1a', glowSize: 10 } },
      { name: 'Green phosphor terminal', group: 'Retro', values: { fillColor: '#33ff66', fillAlpha: 0.18, fillStyle: 'scanlines', texAmount: 0.7, texScale: 2.5, borderMode: 'both', borderW: 2, seamW: 1, borderColor: '#5cff7a', gap: 1, glow: 0.5, glowFrom: 'lines', glowColor: '#22ff55', glowSize: 8, brightNoise: 0.15 } },
      { name: 'Amber CRT', group: 'Retro', values: { fillColor: '#ffb000', fillAlpha: 0.18, fillStyle: 'scanlines', texAmount: 0.7, texScale: 2.5, borderMode: 'both', borderW: 2, seamW: 1, borderColor: '#ffc23a', gap: 1, glow: 0.5, glowFrom: 'lines', glowColor: '#ff9a00', glowSize: 8, brightNoise: 0.15 } },
      { name: '8-bit pixel figure', group: 'Retro', values: { style: 'blocky', blockRound: 0, stateMode: 'color', stepped: true, okColor: '#3ce03c', hurtColor: '#f8d820', critColor: '#e83020', seams: 'separate', borderW: 3, borderColor: '#000000', gap: 2, armSpread: 0, legSpread: 0, footAngle: 0, ...healths({ head: 0.5, upperLegR: 0.2, lowerLegR: 0.2 }) } },
      { name: 'Parchment', group: 'Fantasy', values: { fillColor: '#d9c79a', fillStyle: 'gradient', texAmount: 0.3, borderMode: 'both', borderW: 2.5, seamW: 1, borderColor: '#3a2614', line2W: 0.75, line2Gap: 1.25, shade: 0.35, dirt: 0.45, dirtColor: '#6a4a26', grunge: 0.1, edgeWear: 0.25, stateMode: 'color', okColor: '#d9c79a', hurtColor: '#c98a3a', critColor: '#8e1e16', ...healths({ upperArmL: 0.4, lowerLegR: 0.2 }) } },
      { name: 'Plate armor', group: 'Fantasy', values: { style: 'blocky', blockRound: 0.35, fillColor: '#9aa3a8', fillStyle: 'gradient', texAmount: 0.55, shade: 0.5, innerGlow: 0.25, innerGlowW: 3, borderW: 2, borderColor: '#1a1d20', line2W: 0.75, line2Gap: 1, gap: 2, seams: 'separate', scratches: 0.25, edgeWear: 0.2, armSpread: 6, footAngle: 12 } },
      { name: 'Blocky · military stencil', group: 'Blocky', values: { style: 'blocky', fillColor: '#8a9a5a', borderColor: '#1e2414', borderW: 2.5, gap: 2, blockRound: 0.08, armSpread: 5, footAngle: 8, grunge: 0.22, grungeType: 'speckle', edgeWear: 0.35, shade: 0.25 } },
    ],

    render(ctx, W, H, p, opts) {
      opts = opts || {};
      const layer = opts.layer || (opts.preview ? p.view || 'all' : 'all');
      const sep = layer !== 'all';
      // "Fill layer at 100 %": exported separate layers ignore the fill levels; the layer preview still shows them
      const fullOut = sep && !opts.preview && p.split && p.fullFill;
      const S = Math.min(W, H), k = S / 256, N = W * H, BIG = 1e6;
      const fig = figure(p), IDS = fig.ids;

      // fit the figure into the canvas, keeping room for border, shadow and glow
      const partBB = {};
      let bb = null;
      const grow = (a, b) => (!a ? b.slice() : [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]);
      for (const id of IDS) { const b = unitBox(fig.parts[id]); partBB[id] = b; if (b) bb = grow(bb, b); }
      if (!bb) return;
      const bwPx = p.borderMode === 'none' ? 0 : p.borderW * k;
      const extra = Math.max(p.shadowAlpha > 0 ? (p.shadowBlur + Math.abs(p.shadowY)) * k * 0.6 : 0, p.glow > 0 ? p.glowSize * k * 0.6 : 0);
      const pad0 = p.margin * S + bwPx + extra;
      const bw = bb[2] - bb[0], bh = bb[3] - bb[1];
      const s = Math.max(0.01, Math.min((W - 2 * pad0) / bw, (H - 2 * pad0) / bh));
      const tx = (W - bw * s) / 2 - bb[0] * s, ty = (H - bh * s) / 2 - bb[1] * s;
      const T = [s, tx, ty];

      // per-section exclusive masks -> local signed distance fields; keep the two nearest sections per pixel
      const gapPx = p.gap * k, Rpad = Math.ceil(gapPx + bwPx * 2 + (p.line2W + p.line2Gap) * k + 4);
      const best1 = new Float32Array(N).fill(BIG), best2 = new Float32Array(N).fill(BIG);
      const id1 = new Int8Array(N).fill(-1), id2 = new Int8Array(N).fill(-1);
      const pxBox = IDS.map(() => null), boxes = IDS.map((id) => partBB[id] && [
        Math.max(0, Math.floor(partBB[id][0] * s + tx) - Rpad), Math.max(0, Math.floor(partBB[id][1] * s + ty) - Rpad),
        Math.min(W, Math.ceil(partBB[id][2] * s + tx) + Rpad), Math.min(H, Math.ceil(partBB[id][3] * s + ty) + Rpad)]);
      for (let n = 0; n < IDS.length; n++) {
        const bx = boxes[n];
        if (!bx || bx[2] <= bx[0] || bx[3] <= bx[1]) continue;
        const lw = bx[2] - bx[0], lh = bx[3] - bx[1], c = U.canvas(lw, lh), g = c.getContext('2d'), LT = [s, tx - bx[0], ty - bx[1]];
        drawPrims(g, fig.parts[IDS[n]], LT);
        for (let m = 0; m < n; m++) {
          const o = boxes[m];
          if (o && o[0] < bx[2] && o[2] > bx[0] && o[1] < bx[3] && o[3] > bx[1]) drawPrims(g, fig.parts[IDS[m]], LT, true);
        }
        const a = alphaOf(c), sd = sdfFromAlpha(a, lw, lh);
        let x0 = W, y0 = H, x1 = -1, y1 = -1;
        for (let ly = 0, j = 0; ly < lh; ly++) {
          const row = (bx[1] + ly) * W + bx[0];
          for (let lx = 0; lx < lw; lx++, j++) {
            const v = sd[j], i = row + lx;
            if (a[j] >= 0.5) { const gx = bx[0] + lx, gy = bx[1] + ly; if (gx < x0) x0 = gx; if (gx > x1) x1 = gx; if (gy < y0) y0 = gy; if (gy > y1) y1 = gy; }
            if (v < best1[i]) { best2[i] = best1[i]; id2[i] = id1[i]; best1[i] = v; id1[i] = n; }
            else if (v < best2[i]) { best2[i] = v; id2[i] = n; }
          }
        }
        if (x1 >= 0) pxBox[n] = [x0, y0, x1 + 1, y1 + 1];
      }
      // effective field: each section minus a gap toward its nearest neighbour (the outer silhouette is kept)
      const eff = new Float32Array(N), own = new Int8Array(N), hg = gapPx / 2;
      for (let i = 0; i < N; i++) {
        const b1 = best1[i], b2 = best2[i];
        if (id1[i] < 0) { eff[i] = BIG; own[i] = -1; continue; }
        const e1 = Math.max(b1, hg - b2), e2 = id2[i] < 0 ? BIG : Math.max(b2, hg - b1);
        if (e1 <= e2) { eff[i] = e1; own[i] = id1[i]; } else { eff[i] = e2; own[i] = id2[i]; }
      }

      // union silhouette (shadow / glow caster, edge wear, outer border)
      const maskCv = U.canvas(W, H), mg = maskCv.getContext('2d');
      for (const id of IDS) drawPrims(mg, fig.parts[id], T);
      const outerOn = p.borderMode === 'outer' || p.borderMode === 'both';
      // whole-body (global) fill: one continuous fill over the silhouette, no section gaps or per-section looks
      const globMain = globalFill(p);
      const mergedSeams = p.seams !== 'separate' && p.borderMode !== 'outer' && p.borderMode !== 'none';
      const needU = (outerOn && bwPx > 0) || mergedSeams || globMain || layer === 'fillGlobal' || layer === 'progress';
      const uAll = needU ? sdfFromAlpha(alphaOf(maskCv), W, H) : null;
      const uSdf = outerOn && bwPx > 0 ? uAll : null;
      let fb = null;
      for (const b of pxBox) if (b) fb = fb ? [Math.min(fb[0], b[0]), Math.min(fb[1], b[1]), Math.max(fb[2], b[2]), Math.max(fb[3], b[3])] : b.slice();
      fb = fb || [0, 0, W, H];
      // whole-body fill level along the fill direction (t = 0 at the start, 1 at the end of the figure)
      const gAmt = fullOut ? 1 : clamp(p.gValue), gDir = p.gDir, gHoriz = gDir === 'left' || gDir === 'right';
      const fw = Math.max(1, fb[2] - fb[0]), fh = Math.max(1, fb[3] - fb[1]), gLen = gHoriz ? fw : fh, gCross = gHoriz ? fh : fw;
      const tAt = (x, y) => (gDir === 'down' ? (y - fb[1]) / fh : gDir === 'right' ? (x - fb[0]) / fw : gDir === 'left' ? (fb[2] - x) / fw : (fb[3] - y) / fh);
      const waveAmp = p.gWave * k * 6 * Math.sqrt(Math.sin(Math.PI * gAmt));
      // detail lines (regular style)
      let det = null;
      if (fig.details.length && p.detail > 0) {
        const dc = U.canvas(W, H), g = dc.getContext('2d');
        g.setTransform(s, 0, 0, s, tx, ty);
        g.strokeStyle = '#fff'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = (p.detailW * k) / s;
        for (const d of fig.details) { g.globalAlpha = d.a; g.stroke(d.P); }
        det = alphaOf(dc);
        for (let i = 0; i < N; i++) det[i] *= clamp(0.5 - (eff[i] + bwPx * 0.5)) * p.detail;
      }

      // per-section state
      const stOn = statesOn(p), colOn = p.stateMode === 'color' || p.stateMode === 'both';
      const lvlOn = (p.stateMode === 'level' || p.stateMode === 'both') && !fullOut;
      const okC = U.hex(p.okColor), huC = U.hex(p.hurtColor), crC = U.hex(p.critColor), fC = U.hex(p.fillColor);
      const mixC = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      const stateCol = (h) => (p.stepped ? (h > 0.66 ? okC : h > 0.33 ? huC : crC) : h >= 0.5 ? mixC(huC, okC, (h - 0.5) * 2) : mixC(crC, huC, h * 2));
      const health = IDS.map((id) => clamp(p['h_' + id] == null ? 1 : p['h_' + id]));
      const baseCol = IDS.map((id, n) => (colOn ? stateCol(health[n]) : fC));
      const dead = IDS.map((id, n) => stOn && p.hideDead && health[n] <= 0);
      const selN = IDS.indexOf(p.selected), selC = U.hex(p.selColor);
      const bcol = U.hex(p.borderColor), backC = U.hex(p.backColor);
      const inset = p.pad * k, shadeW = Math.max(2, 18 * k), igW = Math.max(1, p.innerGlowW * k);
      const spacing = Math.max(2, p.texScale * k);

      const off = (w) => (p.borderPos === 'inside' ? -w / 2 : p.borderPos === 'outside' ? w / 2 : 0);
      const band = (e, w, o) => (w > 0 ? clamp(w / 2 + 0.5 - Math.abs(e - o)) : 0);
      const partW = p.borderMode === 'both' ? p.seamW * k : p.borderMode === 'parts' ? bwPx : 0;
      const l2 = p.line2W * k, l2g = p.line2Gap * k;

      const build = (what) => {
        const img = new ImageData(W, H), o = img.data;
        const partOnly = /^part_/.test(what) ? IDS.indexOf(what.slice(5)) : -1;
        const glob = what === 'fillGlobal' || what === 'progress' || (globMain && (what === 'fill' || what === 'back'));
        const prog = what === 'progress';
        if (what === 'fillGlobal') what = 'fill';
        for (let y = 0, i = 0; y < H; y++) {
          for (let x = 0; x < W; x++, i++) {
            const k4 = i * 4, n = own[i], e = eff[i];
            if (what === 'frame') {
              if (n < 0 && !uSdf) continue;
              const wsel = selN >= 0 && n === selN ? p.selBorder : 1;
              let a = 0;
              // section borders
              if (partW > 0 && n >= 0) {
                if (mergedSeams) {
                  // one line of the border width on every seam (distance to the seam between the two nearest
                  // sections, clipped to the silhouette), and the silhouette edge itself in 'parts' mode
                  const w = partW;
                  if (id2[i] >= 0) a = band(Math.max(Math.abs(best1[i]), Math.abs(best2[i])), w, 0) * clamp(0.5 - uAll[i]);
                  if (p.borderMode === 'parts') a = Math.max(a, band(uAll[i], w, off(w)));
                  if (l2 > 0) a = Math.max(a, band(e, l2, -w / 2 - l2g - l2 / 2));
                  // the selected section gets its own, wider outline inside its edge
                  if (wsel > 1 || selN === n) { const ws = w * wsel; a = Math.max(a, band(e, ws, -ws / 2)); }
                } else {
                  const w = partW * wsel, ob = off(w);
                  a = band(e, w, ob);
                  if (l2 > 0) a = Math.max(a, band(e, l2, ob - w / 2 - l2g - l2 / 2));
                }
              }
              // outer silhouette border
              if (uSdf) {
                const w = bwPx, ob = off(w);
                a = Math.max(a, band(uSdf[i], w, ob));
                if (l2 > 0) a = Math.max(a, band(uSdf[i], l2, ob - w / 2 - l2g - l2 / 2));
              }
              const dc = det ? det[i] : 0;
              if (a <= 0 && dc <= 0) continue;
              let c = selN >= 0 && n === selN ? selC : p.borderByState && stOn && n >= 0 ? baseCol[n] : bcol;
              const t = a + dc * (1 - a);
              if (dc > 0 && a < 1) c = mixC(bcol, c, a / t);
              o[k4] = c[0]; o[k4 + 1] = c[1]; o[k4 + 2] = c[2]; o[k4 + 3] = t * 255;
              continue;
            }
            if (what === 'back') {
              let r = 0, g = 0, b = 0, a = 0;
              const over = (cr, cg, cb, ca) => { if (ca <= 0) return; const na = ca + a * (1 - ca); r = (cr * ca + r * a * (1 - ca)) / na; g = (cg * ca + g * a * (1 - ca)) / na; b = (cb * ca + b * a * (1 - ca)) / na; a = na; };
              if (p.backAlpha > 0 && (glob || n >= 0)) over(backC[0], backC[1], backC[2], clamp(0.5 - ((glob ? uAll[i] : e) + inset)) * p.backAlpha);
              if (a <= 0) continue;
              o[k4] = r; o[k4 + 1] = g; o[k4 + 2] = b; o[k4 + 3] = a * 255;
              continue;
            }
            // fill, section masks, ID map
            if (n < 0 && !glob) continue;
            const fin = (glob ? uAll[i] : e) + inset;
            let a = clamp(0.5 - fin);
            if (a <= 0) continue;
            if (what === 'ids') { const v = (SEC_IDX[IDS[n]] + 1) * ID_STEP; o[k4] = o[k4 + 1] = o[k4 + 2] = v; o[k4 + 3] = a * 255; continue; }
            if (partOnly >= 0) { if (n !== partOnly) continue; o[k4] = o[k4 + 1] = o[k4 + 2] = 255; o[k4 + 3] = a * 255; continue; }
            let v, base;
            let dpx = Infinity; // px below the global fill surface
            if (glob) {
              // one fill for the whole figure: gradient over the figure height, plain fill color, one fill level
              const t = tAt(x + 0.5, y + 0.5);
              if (prog) { const gv = clamp(t) * 255; o[k4] = o[k4 + 1] = o[k4 + 2] = gv; o[k4 + 3] = a * 255; continue; }
              if (gAmt <= 0) continue;
              if (gAmt < 1) {
                const c = gHoriz ? (y - fb[1]) / gCross : (x - fb[0]) / gCross;
                const level = gAmt + ((Math.sin(c * U.TAU * p.gWaves + p.seed) * 0.6 + Math.sin(c * U.TAU * p.gWaves * 2.3 + p.seed * 1.7) * 0.4) * waveAmp) / gLen;
                dpx = (level - t) * gLen;
                a *= clamp(dpx + 0.5);
                if (a <= 0) continue;
              }
              v = clamp((y + 0.5 - fb[1]) / fh);
              base = fC;
            } else {
              if (dead[n]) continue;
              const bx = pxBox[n] || [0, 0, W, H], ph = Math.max(1, bx[3] - bx[1]);
              v = clamp((y + 0.5 - bx[1]) / ph);
              if (lvlOn) {
                const t = p.fillDir === 'down' ? v : 1 - v;
                a *= clamp((health[n] - t) * ph + 0.5);
                if (a <= 0) continue;
              }
              base = baseCol[n];
            }
            const depth = -fin, edgeK = p.innerGlow > 0 ? p.innerGlow * (1 - smoothstep(0, igW, depth)) : 0;
            a *= clamp(p.fillAlpha + edgeK * (1 - p.fillAlpha));
            if (a <= 0) continue;
            let m = 1;
            if (p.fillStyle === 'gradient') m = 1 - p.texAmount * 0.6 * v;
            else if (p.fillStyle === 'scanlines') m = U.mod(y / spacing, 1) < 0.5 ? 1 : 1 - p.texAmount * 0.7;
            else if (p.fillStyle === 'hatch') m = U.mod((x + y) / spacing, 1) < 0.5 ? 1 : 1 - p.texAmount * 0.7;
            else if (p.fillStyle === 'facets') {
              const cs = spacing * 3, u = x / cs - y / (cs * 1.7320508), w2 = (2 * y) / (cs * 1.7320508), i0 = Math.floor(u), j0 = Math.floor(w2);
              const tri = u - i0 + (w2 - j0) < 1 ? 0 : 1;
              m = 1 - p.texAmount * 0.55 * U.hash(i0 * 2 + tri, j0, (p.seed | 0) + 77);
            }
            if (p.shade > 0) m *= 1 - p.shade * 0.6 * (1 - smoothstep(0, shadeW, depth));
            let r = base[0] * m, g = base[1] * m, b = base[2] * m;
            if (edgeK > 0) { r = lerp(r, lerp(base[0], 255, 0.55), edgeK); g = lerp(g, lerp(base[1], 255, 0.55), edgeK); b = lerp(b, lerp(base[2], 255, 0.55), edgeK); }
            if (glob && p.gSurface > 0 && dpx < Infinity) {
              const sl = (1 - smoothstep(0, Math.max(1, 2.2 * k), Math.abs(dpx - 1.2 * k))) * p.gSurface;
              r = lerp(r, 255, sl * 0.55); g = lerp(g, 255, sl * 0.5); b = lerp(b, 255, sl * 0.45);
            }
            if (!glob && n === selN && p.selFill > 0) { r = lerp(r, selC[0], p.selFill); g = lerp(g, selC[1], p.selFill); b = lerp(b, selC[2], p.selFill); }
            o[k4] = r; o[k4 + 1] = g; o[k4 + 2] = b; o[k4 + 3] = a * 255;
          }
        }
        return U.imageCanvas(img);
      };

      // face: strokes and dots in face space on the head, clipped to the head section
      const faceCv = (() => {
        const ex = faceExpr(p), hi = IDS.indexOf('head');
        if (!ex || !fig.face || hi < 0 || !(p.faceAlpha > 0)) return null;
        const F0 = fig.face, sc = (p.faceSize * Math.min(F0.w, F0.h)) / 100, fs = s * sc;
        const cv = U.canvas(W, H), g = cv.getContext('2d');
        g.setTransform(fs, 0, 0, fs, tx + s * F0.cx, ty + s * (F0.cy + p.faceY * F0.h));
        const fst = faceStyleOf(p);
        drawFace(g, facePaths(ex, p, fst), fst, Math.max(0.5, p.faceW * k) / fs, p.faceColor, p.tearColor, p.facePixels);
        const img = g.getImageData(0, 0, W, H), d = img.data;
        for (let i = 0; i < N; i++) if (d[i * 4 + 3]) d[i * 4 + 3] *= (own[i] === hi ? clamp(0.5 - (eff[i] + inset)) : 0) * p.faceAlpha;
        g.putImageData(img, 0, 0);
        return cv;
      })();

      // wear: shared noise fields, edge wear along the whole silhouette
      const wear = U.wearActive(p);
      const F = wear ? U.wearFields(W, H, p, S, p.edgeWear > 0 ? maskCv : null) : null;
      const gOn = (part) => p.grungeOn === 'all' || p.grungeOn === part;
      const finish = (cv, part, color) => {
        if (!wear) return cv;
        if (gOn(part)) U.wearScratches(cv.getContext('2d'), W, H, p, S);
        return U.imageCanvas(U.wearApply(cv, p, F, { grunge: gOn(part), color: color !== false }));
      };
      // canvas shadow / glow cast by a caster, kept outside `cut` (null = nothing cut away)
      const cast = (c, caster, color, blur, oy, cut) => {
        c.save(); c.shadowColor = color; c.shadowBlur = blur; c.shadowOffsetY = oy;
        // cast from far off-canvas so only the shadow lands here
        c.shadowOffsetX = W * 4; c.drawImage(caster, -W * 4, 0); c.restore();
        if (cut) { c.save(); c.globalCompositeOperation = 'destination-out'; c.drawImage(cut, 0, 0); c.restore(); }
      };
      const caster = () => {
        const cv = U.canvas(W, H), g = cv.getContext('2d');
        g.drawImage(maskCv, 0, 0);
        return cv;
      };
      const withShadow = (cv) => {
        const glowShape = p.glow > 0 && p.glowFrom !== 'lines';
        if (!(p.shadowAlpha > 0) && !glowShape) return cv;
        const out = U.canvas(W, H), c = out.getContext('2d'), sil = caster();
        if (p.shadowAlpha > 0) cast(c, sil, `rgba(0,0,0,${p.shadowAlpha})`, p.shadowBlur * k, p.shadowY * k, sil);
        if (glowShape) for (let j = 0; j < (p.glow > 0.6 ? 2 : 1); j++) cast(c, sil, U.rgba(p.glowColor, Math.min(1, p.glow * 1.3)), p.glowSize * k, 0, sil);
        c.drawImage(cv, 0, 0);
        return out;
      };
      const withLineGlow = (cv) => {
        if (!(p.glow > 0) || p.glowFrom !== 'lines') return cv;
        const out = U.canvas(W, H), c = out.getContext('2d');
        for (let j = 0; j < (p.glow > 0.5 ? 2 : 1); j++) cast(c, cv, U.rgba(p.glowColor, Math.min(1, p.glow * 1.2)), p.glowSize * k * (j ? 0.4 : 1), 0, null);
        c.drawImage(cv, 0, 0);
        return out;
      };

      if (p.faceOnly && faceCv) { ctx.drawImage(finish(faceCv, 'frame'), 0, 0); return; }
      if (layer === 'ids' || /^part_/.test(layer)) { ctx.drawImage(finish(build(layer), 'fill', false), 0, 0); return; }
      if (layer === 'fillGlobal') { ctx.drawImage(finish(build(layer), 'fill'), 0, 0); return; }
      if (layer === 'progress') {
        const m = build('progress');
        ctx.drawImage(wear ? U.imageCanvas(U.wearApply(m, p, F, { grunge: gOn('fill'), color: false, t: (sx, sy) => tAt(sx, sy) })) : m, 0, 0);
        return;
      }
      const parts = [];
      if (layer === 'all' || layer === 'back') parts.push(withShadow(finish(build('back'), 'frame')));
      if (layer === 'all' || layer === 'fill') parts.push(finish(build('fill'), 'fill'));
      if (layer === 'all' || layer === 'frame') parts.push(withLineGlow(finish(build('frame'), 'frame')));
      if ((layer === 'all' || layer === 'face') && faceCv) parts.push(finish(faceCv, 'frame'));
      for (const cv of parts) ctx.drawImage(cv, 0, 0);
    },
  });
})();
