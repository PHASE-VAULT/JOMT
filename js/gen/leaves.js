/* Leafy Branch: alpha-cutout foliage cards (a branch on a 1:1 quad, alpha tested in the engine).
   A main stem (or up to three) grows from the bottom edge to the top on the horizontal center, with
   wobble, lean and taper. Side branches leave it alternate, opposite or in whorls, get shorter toward the
   top (cone, oval frond outline or even), droop or curve up and carry second-order twigs. Every twig (and
   optionally the main stem) carries foliage: broad leaves from a width profile (oval, birch, round,
   lanceolate, willow, oak lobes, holly spines, fern leaflets, palm straps), palmate leaves (maple, ivy)
   or needles (alternate, opposite, all around the twig or in pine bundles). Leaves are folded along the
   midrib and rolled (foreshortened halves), bent, mirrored, scaled; some show their lighter underside,
   some have holes / bites and dry tips. Extras: berries, blossoms, pine cones, catkins.
   Everything stays inside the card: branches stop before the margin and leaves / extras near an edge
   shrink toward their attachment point (or are dropped); only the stem leaves the bottom edge.
   All items are depth sorted and drawn with canvas paths three ways: color, height (leaves in front
   higher, domed leaves, rounded stems) and a leaf / translucency mask. The color pass gets ambient
   occlusion from the height buffer (leaves behind and inside the branch darker) and leaf shading from
   the midrib fold (ambient by default, optional light angle). Output: color + alpha (hard cutout or
   soft), opaque edge-padded RGB, alpha mask or height map; transparent pixels can be filled with the
   nearby leaf color (push-pull dilation) so mipmaps don't get dark / white fringes. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, smoothstep } = U;
  const PI = Math.PI, TAU = PI * 2, RAD = PI / 180;

  /* leaf shapes in leaf space: x = 0 (base) … 1 (tip), y across in units of the length.
     w: half width, widest: position of the widest point, tip / base: pointiness / roundness,
     lobes / lobeDepth, teeth + serr (built-in serration), spines (holly), cord (heart base) */
  const SHAPES = {
    oval: { w: 0.3, widest: 0.42, tip: 1.3, base: 1.1, teeth: 26, serr: 0.05, veins: 8 },
    birch: { w: 0.33, widest: 0.3, tip: 1.8, base: 1.8, teeth: 16, serr: 0.45, veins: 7 },
    round: { w: 0.42, widest: 0.48, tip: 0.85, base: 1.4, teeth: 22, serr: 0, veins: 6 },
    lanceolate: { w: 0.13, widest: 0.33, tip: 1.6, base: 1, teeth: 30, serr: 0, veins: 9 },
    willow: { w: 0.075, widest: 0.42, tip: 1.9, base: 1, teeth: 40, serr: 0.06, veins: 12 },
    oak: { w: 0.3, widest: 0.62, tip: 0.8, base: 0.8, lobes: 4, lobeDepth: 0.5, teeth: 20, serr: 0, veins: 5, cord: 0.15 },
    holly: { w: 0.26, widest: 0.5, tip: 1.6, base: 1.2, teeth: 4.5, serr: 1, spines: true, veins: 5 },
    leaflet: { w: 0.19, widest: 0.38, tip: 0.55, base: 1.6, teeth: 8, serr: 0, veins: 4 },
    palm: { w: 0.05, widest: 0.25, tip: 1.6, base: 0.8, teeth: 30, serr: 0, veins: 0 },
    needle: { w: 0.035, needle: true, veins: 0 },
    maple: { palmate: true, lobes: 5, lobeDepth: 0.6, tip: 2.2, teeth: 3, serr: 0.35, veins: 5 },
    ivy: { palmate: true, lobes: 5, lobeDepth: 0.3, tip: 1.1, teeth: 3, serr: 0, veins: 5 },
  };
  const SHAPE_OPTS = [['oval', 'Oval (beech, cherry)'], ['birch', 'Birch (serrated)'], ['round', 'Round'], ['lanceolate', 'Lanceolate (eucalyptus, olive, bamboo)'], ['willow', 'Willow (narrow)'], ['oak', 'Oak (lobed)'], ['maple', 'Maple (palmate)'], ['ivy', 'Ivy'], ['holly', 'Holly (spiny)'], ['leaflet', 'Leaflet (fern)'], ['palm', 'Palm strap'], ['needle', 'Needle']];

  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const c8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  const css = (c, a) => (a == null ? `rgb(${c8(c[0])},${c8(c[1])},${c8(c[2])})` : `rgba(${c8(c[0])},${c8(c[1])},${c8(c[2])},${clamp(a)})`);
  const gray = (v, a) => { const g = c8(v * 255); return a == null ? `rgb(${g},${g},${g})` : `rgba(${g},${g},${g},${clamp(a)})`; };

  /* replace the outline points inside a bite circle (cx, cy, r) by an arc that bends toward (ix, iy) */
  function bite(pts, cx, cy, r, ix, iy) {
    const n = pts.length, ins = pts.map((q) => Math.hypot(q[0] - cx, q[1] - cy) < r);
    let i0 = -1;
    for (let i = 0; i < n; i++) if (ins[i] && !ins[(i - 1 + n) % n]) { i0 = i; break; }
    if (i0 < 0) return pts;
    let i1 = i0;
    while (ins[(i1 + 1) % n] && i1 - i0 < n - 3) i1++;
    const A = pts[(i0 - 1 + n) % n], B = pts[(i1 + 1) % n];
    const a0 = Math.atan2(A[1] - cy, A[0] - cx), a1 = Math.atan2(B[1] - cy, B[0] - cx);
    let d = a1 - a0;
    while (d > PI) d -= TAU;
    while (d <= -PI) d += TAU;
    const alt = d > 0 ? d - TAU : d + TAU, ia = Math.atan2(iy - cy, ix - cx);
    const score = (dd) => Math.cos(a0 + dd / 2 - ia);
    if (score(alt) > score(d)) d = alt;
    const out = [];
    for (let k = 1; k <= n; k++) { const j = (i1 + k) % n; if (ins[j]) continue; out.push(pts[j]); if (j === (i0 - 1 + n) % n) break; }
    const steps = 10;
    for (let s = 1; s < steps; s++) { const a = a0 + (d * s) / steps; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return out;
  }

  /* one leaf outline variant: { pts, veins: [[x0, y0, x1, y1, weight]], holes: [[x, y, r]], maxW, needle } */
  function buildVariant(sh, p, rnd, damaged) {
    const wMul = p.leafWidth, serr = clamp((sh.serr || 0) + p.serration * 0.6), teeth = sh.teeth || 20;
    const asL = 1 + (rnd() - 0.5) * 0.14, asR = 2 - asL;
    let pts = [];
    const veins = [], holes = [];
    if (sh.needle) {
      const w = sh.w * wMul;
      pts = [[0, -w * 0.75], [0.1, -w], [0.75, -w * 0.8], [1, 0], [0.75, w * 0.8], [0.1, w], [0, w * 0.75]];
      return { pts, veins, holes, maxW: w, needle: true };
    }
    let maxW, inX = 0.45;
    if (sh.palmate) {
      const k = sh.lobes, R = 0.5, span = PI * Math.min(0.8, 0.42 + 0.08 * k), lob = [];
      for (let j = 0; j < k; j++) { const th = -span + (2 * span * j) / (k - 1); lob.push([th, (0.55 + 0.45 * Math.cos(th * 0.6)) * (0.9 + 0.2 * rnd())]); }
      const rAt = (th) => {
        const q = ((th + span) / (2 * span)) * (k - 1), j = clamp(Math.round(q), 0, k - 1), dq = Math.abs(q - j);
        let r = R * lob[j][1] * (1 - sh.lobeDepth * Math.pow(Math.min(1, 2 * dq), 1 / sh.tip));
        if (Math.abs(th) > span) r = lerp(r, R * 0.2, smoothstep(span, PI, Math.abs(th)));
        if (serr > 0) r *= 1 - serr * 0.12 * ((dq * teeth * 2) % 1);
        return Math.max(R * 0.15, r);
      };
      const N = 150, raw = [];
      for (let i = 0; i < N; i++) { const th = -PI + (TAU * i) / N, r = rAt(th) * (th > 0 ? asL : asR); raw.push([Math.cos(th) * r, Math.sin(th) * r * wMul]); }
      let x0 = Infinity, x1 = -Infinity;
      for (const q of raw) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; }
      const sc = 1 / (x1 - x0), C = -x0 * sc;
      // rotate the list so it starts at the base notch (angle PI), then shift to x = 0 at the base
      pts = raw.map((q) => [(q[0] - x0) * sc, q[1] * sc]);
      veins.push([0, 0, C, 0, 1]);
      for (const [th] of lob) { const r = rAt(th) * sc * 0.9; veins.push([C, 0, C + Math.cos(th) * r, Math.sin(th) * r * wMul, 0.8]); }
      maxW = 0.5 * wMul; inX = C;
      if (damaged) {
        const nb = rnd() < 0.6 ? 1 : 0;
        for (let b = 0; b < nb; b++) { const q = pts[Math.floor(N * (0.2 + 0.6 * rnd()))]; pts = bite(pts, q[0], q[1], 0.07 + 0.06 * rnd(), C, 0); }
        const nh = 1 + Math.floor(rnd() * 3);
        for (let h = 0; h < nh; h++) holes.push([C + (rnd() - 0.4) * 0.35, (rnd() - 0.5) * 0.35 * wMul, 0.02 + 0.03 * rnd()]);
      }
    } else {
      const wp = sh.widest, cord = sh.cord || 0;
      const hw = (u) => {
        let f;
        if (u < wp) { const t = u / wp; f = cord > 0 ? lerp(cord * 0.75, 1, Math.sin((PI / 2) * t)) : Math.pow(Math.sin((PI / 2) * t), 1 / sh.base); }
        else f = Math.pow(Math.max(0, Math.cos((PI / 2) * ((u - wp) / (1 - wp)))), sh.tip);
        if (sh.lobes) f *= 1 - sh.lobeDepth * Math.pow(1 - Math.abs(Math.sin(PI * (sh.lobes + 0.5) * u)), 2) * smoothstep(0.03, 0.15, u) * (1 - smoothstep(0.85, 1, u));
        return Math.max(0, f) * sh.w * wMul;
      };
      const sAmp = sh.spines ? 0.42 : 0.14;
      const serrAt = (u) => (serr > 0 ? 1 - serr * sAmp * ((u * teeth) % 1) * smoothstep(0.05, 0.16, u) * (1 - smoothstep(0.93, 1, u)) : 1);
      const N = Math.min(220, Math.max(64, Math.round(teeth * 6)));
      const xOf = (u) => (cord > 0 && u < wp ? u - cord * 0.1 * Math.pow(1 - u / wp, 2) : u);
      for (let i = 0; i <= N; i++) { const u = i / N; pts.push([xOf(u), hw(u) * asL * serrAt(u)]); }
      for (let i = N - 1; i >= 1; i--) { const u = i / N; pts.push([xOf(u), -hw(u) * asR * serrAt(u + 0.5 / teeth)]); }
      veins.push([0, 0, 1, 0, 1]);
      const nv = sh.veins;
      for (let i = 1; i <= nv; i++) {
        const xs = 0.04 + (0.84 * i) / (nv + 1), xe = Math.min(0.96, xs + 0.1 + 0.14 * Math.min(1, sh.w * wMul * 3));
        veins.push([xs, 0, xe, hw(xe) * 0.85 * asL, 0.5], [xs, 0, xe, -hw(xe) * 0.85 * asR, 0.5]);
      }
      maxW = hw(wp) * Math.max(asL, asR);
      if (damaged) {
        const nb = rnd() < 0.55 ? 1 + (rnd() < 0.3 ? 1 : 0) : 0;
        for (let b = 0; b < nb; b++) {
          const u = 0.3 + 0.55 * rnd(), sd = rnd() < 0.5 ? 1 : -1, w = hw(u) * (sd > 0 ? asL : asR);
          if (w > 0.02) pts = bite(pts, u, w * sd, Math.min(w * 1.1, 0.05 + 0.07 * rnd()), u, 0);
        }
        const nh = 1 + Math.floor(rnd() * 3);
        for (let h = 0; h < nh; h++) {
          const u = 0.25 + 0.5 * rnd(), w = hw(u);
          if (w > 0.03) holes.push([u, (rnd() - 0.5) * w * 0.9, Math.min(w * 0.35, 0.015 + 0.03 * rnd())]);
        }
      }
    }
    return { pts, veins, holes, maxW, inX, needle: false };
  }

  // separable box blur (clamped edges), two passes ≈ tent filter
  function blur(a, W, H, r) {
    if (r < 1) return;
    const tmp = new Float32Array(a.length), inv = 1 / (2 * r + 1);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < H; y++) {
        const o = y * W;
        let s = 0;
        for (let k = -r; k <= r; k++) s += a[o + clamp(k, 0, W - 1)];
        for (let x = 0; x < W; x++) { tmp[o + x] = s * inv; s += a[o + Math.min(W - 1, x + r + 1)] - a[o + Math.max(0, x - r)]; }
      }
      for (let x = 0; x < W; x++) {
        let s = 0;
        for (let k = -r; k <= r; k++) s += tmp[clamp(k, 0, H - 1) * W + x];
        for (let y = 0; y < H; y++) { a[y * W + x] = s * inv; s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; }
      }
    }
  }

  /* push-pull dilation: fills the RGB of fully transparent pixels with the nearby (alpha weighted) color.
     Builds a pyramid of alpha-weighted colors, then every empty cell takes the bilinear color of the
     next coarser level, from the top down. */
  function bil(P, fx, fy, o) {
    const pw = P.w, ph = P.h, c = P.c;
    if (fx < 0) fx = 0; else if (fx > pw - 1) fx = pw - 1;
    if (fy < 0) fy = 0; else if (fy > ph - 1) fy = ph - 1;
    const x0 = fx | 0, y0 = fy | 0, x1 = x0 + 1 < pw ? x0 + 1 : x0, y1 = y0 + 1 < ph ? y0 + 1 : y0, tx = fx - x0, ty = fy - y0;
    const a = (y0 * pw + x0) * 4, b = (y0 * pw + x1) * 4, e = (y1 * pw + x0) * 4, f = (y1 * pw + x1) * 4;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    o[0] = c[a] * w00 + c[b] * w10 + c[e] * w01 + c[f] * w11;
    o[1] = c[a + 1] * w00 + c[b + 1] * w10 + c[e + 1] * w01 + c[f + 1] * w11;
    o[2] = c[a + 2] * w00 + c[b + 2] * w10 + c[e + 2] * w01 + c[f + 2] * w11;
  }
  // 2×2 sums into the next level (separate loops for the 8-bit image and the float levels keep both fast)
  function downPx(d, n, w, h, nw) {
    for (let y = 0, s = 0; y < h; y++) {
      const ro = (y >> 1) * nw * 4;
      for (let x = 0; x < w; x++, s += 4) {
        const a = d[s + 3];
        if (!a) continue;
        const t = ro + (x >> 1) * 4;
        n[t] += d[s] * a; n[t + 1] += d[s + 1] * a; n[t + 2] += d[s + 2] * a; n[t + 3] += a;
      }
    }
  }
  function down(c, n, w, h, nw) {
    for (let y = 0, s = 0; y < h; y++) {
      const ro = (y >> 1) * nw * 4;
      for (let x = 0; x < w; x++, s += 4) {
        const a = c[s + 3];
        if (!a) continue;
        const t = ro + (x >> 1) * 4;
        n[t] += c[s]; n[t + 1] += c[s + 1]; n[t + 2] += c[s + 2]; n[t + 3] += a;
      }
    }
  }
  function dilate(d, W, H) {
    const lv = [];
    let w = W, h = H, src = null;
    // level 1 straight from the pixels (level 0 is the image itself)
    while (w > 1 || h > 1) {
      const nw = Math.max(1, (w + 1) >> 1), nh = Math.max(1, (h + 1) >> 1), n = new Float32Array(nw * nh * 4);
      if (src) down(src, n, w, h, nw); else downPx(d, n, w, h, nw);
      w = nw; h = nh; src = n;
      lv.push({ w, h, c: n });
    }
    const o = [0, 0, 0];
    for (let l = lv.length - 1; l >= 0; l--) {
      const L = lv[l], P = lv[l + 1], c = L.c;
      for (let y = 0, k = 0; y < L.h; y++) for (let x = 0; x < L.w; x++, k += 4) {
        const a = c[k + 3];
        if (a > 1e-3) { c[k] /= a; c[k + 1] /= a; c[k + 2] /= a; c[k + 3] = 1; continue; }
        if (P) { bil(P, (x + 0.5) / 2 - 0.5, (y + 0.5) / 2 - 0.5, o); c[k] = o[0]; c[k + 1] = o[1]; c[k + 2] = o[2]; } else c[k] = c[k + 1] = c[k + 2] = 0;
        c[k + 3] = 1;
      }
    }
    const P = lv[0];
    if (!P) return;
    // full resolution: nearest cell of the (already smooth) half-resolution level
    const pc = P.c, pw = P.w;
    for (let y = 0, k = 0; y < H; y++) {
      const ro = (y >> 1) * pw;
      for (let x = 0; x < W; x++, k += 4) {
        if (d[k + 3]) continue;
        const t = (ro + (x >> 1)) * 4;
        d[k] = pc[t]; d[k + 1] = pc[t + 1]; d[k + 2] = pc[t + 2];
      }
    }
  }

  const isToon = (p) => p.style === 'toon';
  const hasLeaves = (p) => p.density > 0;
  const needles = (p) => p.shape === 'needle';

  U.register({
    id: 'leaves',
    name: 'Leafy Branch',
    desc: 'Alpha-cutout foliage cards: a branch growing up the card with side branches, twigs and leaves, needles, berries or blossoms, with AO, height map and edge padding',
    uses: ['Alpha-tested foliage cards for tree crowns, bushes, hedges and conifers in 3D games (color + clean alpha, height for the normal map, leaf mask for smoothness).', 'Branch and frond sprites for 2D scenes, parallax layers and illustrations.'],
    tags: ['Nature', 'Texturing'],
    aspect: '1:1',
    bg: 'checker',
    heightMap: true,
    // extra sources for the smoothness / metallic maps: leaves vs. bark, and how thin (translucent) the leaf is
    mapSources: [['leaf', 'Leaf mask (leaves white, bark black)'], ['transl', 'Translucency (thin leaf areas bright)']],
    icon: U.icon('<path d="M12 22V3"/><path d="M12 15l-5-4M12 10l5-4M12 18l4-3"/><path d="M7 11c-3 0-4-2-4-4 2 0 4 1 4 4zM17 6c0-3 2-4 4-4 0 2-1 4-4 4zM16 15c1-2 3-3 5-2-1 2-3 3-5 2z" opacity=".7"/>'),
    params: [
      { type: 'section', label: 'Main stem' },
      { key: 'stems', label: 'Main stems', type: 'int', min: 1, max: 3, default: 1 },
      { key: 'spread', label: 'Stem spread', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.stems > 1, tip: 'How far the extra stems fan out from the center' },
      { key: 'stemTop', label: 'Stem height', type: 'range', min: 0.4, max: 1, step: 0.01, default: 0.96, tip: 'Where the stem tip ends: 1 = at the top margin' },
      { key: 'stemWidth', label: 'Stem thickness', type: 'range', min: 0.003, max: 0.07, step: 0.001, default: 0.02, tip: 'At the base, relative to the card' },
      { key: 'stemTaper', label: 'Taper', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, tip: 'Thick at the bottom, thin at the tip' },
      { key: 'wobble', label: 'Wobble', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'lean', label: 'Lean / curve', type: 'range', min: -1, max: 1, step: 0.01, default: 0, tip: 'Bends the stem to one side toward the top' },
      { key: 'fromBottom', label: 'Stem leaves the bottom edge', type: 'bool', default: true, tip: 'Off: the stem ends above the bottom edge (nothing touches any edge)' },
      { key: 'baseGap', label: 'Gap at the bottom', type: 'range', min: 0.02, max: 0.4, step: 0.01, default: 0.08, show: (p) => !p.fromBottom },
      { key: 'nodes', label: 'Stem nodes', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Rings across the stem (bamboo); more = closer together' },
      { key: 'margin', label: 'Edge margin', type: 'range', min: 0, max: 0.12, step: 0.005, default: 0.02, tip: 'Empty border kept around the foliage: twigs stop before it, leaves near it shrink' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 12 },

      { type: 'section', label: 'Side branches' },
      { key: 'branches', label: 'Side branches', type: 'int', min: 0, max: 30, default: 9, tip: 'Branch nodes per main stem' },
      { key: 'arrange', label: 'Arrangement', type: 'select', default: 'alternate', options: [['alternate', 'Alternate'], ['opposite', 'Opposite pairs'], ['whorl', 'Whorls (3, one toward the viewer)'], ['random', 'Random sides']], show: (p) => p.branches > 0 },
      { key: 'branchStart', label: 'Bare stem at the base', type: 'range', min: 0, max: 0.8, step: 0.01, default: 0.16, tip: 'Lower part of the stem without branches' },
      { key: 'branchAngle', label: 'Branch angle', type: 'range', min: 10, max: 95, step: 1, default: 52, show: (p) => p.branches > 0, tip: 'Angle between branch and stem' },
      { key: 'angleVar', label: 'Angle variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.branches > 0 },
      { key: 'branchLen', label: 'Branch length', type: 'range', min: 0.04, max: 0.6, step: 0.01, default: 0.42, show: (p) => p.branches > 0, tip: 'Longest branch, relative to the card' },
      { key: 'profile', label: 'Outline', type: 'select', default: 'cone', options: [['cone', 'Cone (longest at the bottom)'], ['oval', 'Oval / frond (short at both ends)'], ['even', 'Even']], tip: 'How branch (and main-stem leaf) length changes from bottom to top' },
      { key: 'lenTaper', label: 'Shorter toward the top', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.profile !== 'even' },
      { key: 'lenVar', label: 'Length variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.branches > 0 },
      { key: 'droop', label: 'Droop / upward curve', type: 'range', min: -1, max: 1, step: 0.01, default: 0.15, show: (p) => p.branches > 0, tip: 'Positive: branches bend down under their weight, negative: they curve up' },
      { key: 'branchWidth', label: 'Branch thickness', type: 'range', min: 0.15, max: 1, step: 0.01, default: 0.55, show: (p) => p.branches > 0, tip: 'Relative to the stem where the branch starts' },
      { key: 'twigs', label: 'Twigs per branch', type: 'int', min: 0, max: 10, default: 3, show: (p) => p.branches > 0, tip: 'Second-order twigs on each side branch' },
      { key: 'twigAngle', label: 'Twig angle', type: 'range', min: 10, max: 90, step: 1, default: 45, show: (p) => p.branches > 0 && p.twigs > 0 },
      { key: 'twigLen', label: 'Twig length', type: 'range', min: 0.1, max: 0.9, step: 0.01, default: 0.45, show: (p) => p.branches > 0 && p.twigs > 0, tip: 'Relative to the branch' },

      { type: 'section', label: 'Foliage' },
      { key: 'shape', label: 'Leaf shape', type: 'select', default: 'oval', options: SHAPE_OPTS },
      { key: 'leafMin', key2: 'leafMax', label: 'Leaf size', type: 'span', min: 0.005, max: 0.4, step: 0.005, default: 0.06, default2: 0.09, tip: 'Leaf length range, relative to the card (each leaf picks a size in between)' },
      { key: 'leafWidth', label: 'Leaf width', type: 'range', min: 0.3, max: 2.5, step: 0.01, default: 1, tip: 'Multiplies the width of the leaf shape' },
      { key: 'density', label: 'Density', type: 'range', min: 0, max: 10, step: 0.05, default: 1.25, tip: 'Leaves along the twigs: about one leaf per half leaf length at 1 (0 = bare branch)' },
      { key: 'leafArrange', label: 'Leaf arrangement', type: 'select', default: 'alternate', show: hasLeaves, options: [['alternate', 'Alternate'], ['opposite', 'Opposite pairs'], ['around', 'All around the twig'], ['bundle', 'Bundles (pine needles)']] },
      { key: 'bundle', label: 'Needles per bundle', type: 'int', min: 2, max: 8, default: 3, show: (p) => hasLeaves(p) && p.leafArrange === 'bundle' },
      { key: 'leafAngle', label: 'Leaf angle', type: 'range', min: 3, max: 100, step: 1, default: 50, show: hasLeaves, tip: 'Angle between leaf and twig: small = along the twig' },
      { key: 'leafJitter', label: 'Random rotation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: hasLeaves },
      { key: 'leafDroop', label: 'Leaf droop', type: 'range', min: -1, max: 1, step: 0.01, default: 0.15, show: hasLeaves, tip: 'Positive: leaves hang down, negative: they point up' },
      { key: 'leafStart', label: 'Bare twig base', type: 'range', min: 0, max: 0.9, step: 0.01, default: 0.1, show: hasLeaves, tip: 'Lower part of every branch and twig without leaves' },
      { key: 'leafProfile', label: 'Smaller toward the tip', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: hasLeaves, tip: 'Young leaves near the twig tips are smaller' },
      { key: 'stemLeaves', label: 'Leaves on the main stem', type: 'bool', default: true, show: hasLeaves, tip: 'Fronds and vines carry their leaves directly on the stem' },
      { key: 'terminal', label: 'Leaf at every tip', type: 'bool', default: true, show: hasLeaves },
      { key: 'petiole', label: 'Leaf stalk', type: 'range', min: 0, max: 0.8, step: 0.01, default: 0.1, show: (p) => hasLeaves(p) && !needles(p), tip: 'Stalk length relative to the leaf' },

      { type: 'section', label: 'Leaf surface', show: hasLeaves },
      { key: 'fold', label: 'Curl / fold', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Leaves folded along the midrib and rolled: seen at an angle, one half gets narrow and darker' },
      { key: 'leafBend', label: 'Bend', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Sickle-shaped, curved midribs' },
      { key: 'backside', label: 'Undersides', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Share of leaves turned over, showing the lighter underside' },
      { key: 'veins', label: 'Veins', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => !needles(p) },
      { key: 'serration', label: 'Serrated edge', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => !needles(p) },
      { key: 'damage', label: 'Holes & bites', type: 'range', min: 0, max: 1, step: 0.01, default: 0.06, show: (p) => !needles(p), tip: 'Share of leaves with insect holes and bite marks (you see through them)' },
      { key: 'dryTips', label: 'Dry tips', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Share of leaves with brown, dried tips' },

      { type: 'section', label: 'Extras', active: (p) => p.extra !== 'none' && p.extraAmt > 0 },
      { key: 'extra', label: 'Extras', type: 'select', default: 'none', options: [['none', 'None'], ['berries', 'Berries'], ['blossoms', 'Blossoms'], ['cones', 'Pine cones'], ['catkins', 'Catkins']] },
      { key: 'extraAmt', label: 'Amount', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.extra !== 'none' },
      { key: 'extraSize', label: 'Size', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1, show: (p) => p.extra !== 'none' },
      { key: 'extraColor', label: 'Color', type: 'color', default: '#c01e28', show: (p) => p.extra !== 'none' },
      { key: 'extraColor2', label: 'Second color', type: 'color', default: '#f2d04a', show: (p) => p.extra !== 'none', tip: 'Blossom center, berry ripeness mix, cone scale tips, catkin tip' },

      { type: 'section', label: 'Color' },
      { key: 'leaf1', label: 'Leaf color 1 (young)', type: 'color', default: '#a2c25a' },
      { key: 'leaf2', label: 'Leaf color 2', type: 'color', default: '#5e9234' },
      { key: 'leaf3', label: 'Leaf color 3 (old)', type: 'color', default: '#305a24' },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'How far each leaf strays along the three colors' },
      { key: 'underside', label: 'Underside color', type: 'color', default: '#a6bd88', show: (p) => p.backside > 0 },
      { key: 'autumn', label: 'Autumn mix', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Share of leaves turned yellow, orange, red or brown' },
      { key: 'autumnYellow', label: 'Autumn yellow', type: 'color', default: '#e8b828', show: (p) => p.autumn > 0 },
      { key: 'autumnRed', label: 'Autumn red', type: 'color', default: '#cc4a1e', show: (p) => p.autumn > 0 },
      { key: 'autumnBrown', label: 'Autumn brown', type: 'color', default: '#7a4a22', show: (p) => p.autumn > 0 },
      { key: 'dryColor', label: 'Dry color', type: 'color', default: '#8c6a3a', show: (p) => p.dryTips > 0 },
      { key: 'veinColor', label: 'Vein color', type: 'color', default: '#d6e6a4', show: (p) => p.veins > 0 && !needles(p) },
      { key: 'bark', label: 'Bark color', type: 'color', default: '#5a4636', tip: 'Main stem and thick branches' },
      { key: 'twig', label: 'Twig color', type: 'color', default: '#6e5a3c', tip: 'Thin twigs and leaf stalks' },

      { type: 'section', label: 'Shading' },
      { key: 'style', label: 'Style', type: 'select', default: 'realistic', options: [['realistic', 'Realistic'], ['toon', 'Toon (flat + outline)']] },
      { key: 'midrib', label: 'Midrib gradient', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Shading across each leaf: brighter along the midrib, darker toward the rim' },
      { key: 'translucency', label: 'Translucency', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: (p) => !isToon(p), tip: 'Thin rims and tips glow a little warmer and lighter' },
      { key: 'ao', label: 'Ambient occlusion', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Darkens leaves behind other leaves and in dense parts of the branch' },
      { key: 'aoSpread', label: 'AO spread', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.ao > 0 },
      { key: 'depthShade', label: 'Inner darkening', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Leaves behind the stem and close to it are darker' },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'ambient', options: [['ambient', 'Ambient (soft, no direction)'], ['angled', 'Angled (light angle)']], tip: 'Ambient: soft light from all around, so the engine can light the card itself; leaf halves tilted away from the viewer darken, whichever way they face' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -125, show: (p) => p.lightMode === 'angled', tip: 'Direction the light comes from (-135 = top left)' },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: isToon },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#17220f', show: (p) => isToon(p) && p.outline > 0 },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Emissive veins and rims (sci-fi)' },
      { key: 'glowColor', label: 'Glow color', type: 'color', default: '#7af8ff', show: (p) => p.glow > 0 },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color + alpha (cutout)'], ['rgb', 'Color, padded (opaque RGB)'], ['mask', 'Alpha mask (white on black)'], ['height', 'Height map']], tip: 'Padded RGB: the color with the transparent area filled by the dilated leaf color, alpha 1 everywhere; pair it with the alpha mask in the engine' },
      { key: 'alphaEdge', label: 'Alpha edges', type: 'select', default: 'hard', options: [['hard', 'Hard (binary, for alpha testing)'], ['soft', 'Soft (anti-aliased)']], show: (p) => p.output === 'color' || p.output === 'mask' },
      { key: 'cutoff', label: 'Cutoff', type: 'range', min: 0.1, max: 0.9, step: 0.01, default: 0.5, show: (p) => (p.output === 'color' || p.output === 'mask') && p.alphaEdge === 'hard', tip: 'Coverage above which a pixel becomes opaque' },
      { key: 'dilate', label: 'Dilate color into transparent area', type: 'bool', default: true, show: (p) => p.output === 'color' || p.output === 'rgb', tip: 'Fills the color of transparent pixels with the nearby leaf color (edge padding), so mipmaps get no dark or white fringes. Browsers drop the color of fully transparent pixels when saving a PNG, so for padded files export "Color, padded (opaque RGB)" plus the alpha mask' },
    ],
    presets: [
      { name: 'Beech branch', group: 'Broadleaf', values: {} },
      { name: 'Oak branch', group: 'Broadleaf', values: { shape: 'oak', leafMin: 0.07, leafMax: 0.11, density: 1, branches: 6, branchAngle: 60, droop: 0.05, wobble: 0.55, stemWidth: 0.026, leafAngle: 55, leafJitter: 0.5, petiole: 0.04, fold: 0.35, leaf1: '#8fae4a', leaf2: '#55782c', leaf3: '#2e4a1e', bark: '#4a3c30', twig: '#5e4a34', extra: 'berries', extraAmt: 0.2, extraSize: 1.1, extraColor: '#8a6a2c', extraColor2: '#5e6a2a', seed: 4 } },
      { name: 'Birch twig', group: 'Broadleaf', values: { shape: 'birch', leafMin: 0.045, leafMax: 0.065, density: 1.3, branches: 9, branchAngle: 45, droop: 0.55, lenTaper: 0.5, twigs: 3, twigLen: 0.5, stemWidth: 0.012, branchWidth: 0.6, leafDroop: 0.45, petiole: 0.25, leaf1: '#b6d064', leaf2: '#7ca43c', leaf3: '#4a7226', twig: '#5a3a2a', bark: '#4a3328', extra: 'catkins', extraAmt: 0.25, extraColor: '#8a7a3a', extraColor2: '#c4b060', seed: 7 } },
      { name: 'Willow branch', group: 'Broadleaf', values: { shape: 'willow', leafMin: 0.08, leafMax: 0.13, density: 1.8, branches: 7, branchAngle: 35, droop: 0.9, branchLen: 0.44, lenTaper: 0.3, twigs: 1, leafAngle: 28, leafDroop: 0.6, leafBend: 0.4, petiole: 0.03, fold: 0.55, stemWidth: 0.014, leaf1: '#b2c47c', leaf2: '#7c9850', leaf3: '#4e6a34', underside: '#c2cfaa', backside: 0.3, twig: '#8a7a3a', bark: '#5a5032', seed: 3 } },
      { name: 'Eucalyptus', group: 'Broadleaf', values: { shape: 'lanceolate', leafMin: 0.09, leafMax: 0.15, leafWidth: 1.2, density: 1, branches: 6, branchAngle: 40, droop: 0.4, leafAngle: 35, leafDroop: 0.7, leafBend: 0.8, petiole: 0.12, fold: 0.2, veins: 0.25, leaf1: '#a4b8a0', leaf2: '#6e8a78', leaf3: '#4a6458', underside: '#b8c6b4', backside: 0.3, colorVar: 0.35, twig: '#9a6a4a', bark: '#a08a74', midrib: 0.35, seed: 9 } },
      { name: 'Olive branch', group: 'Broadleaf', values: { shape: 'lanceolate', leafMin: 0.07, leafMax: 0.1, leafWidth: 0.85, density: 1.3, leafArrange: 'opposite', branches: 6, branchAngle: 48, droop: 0.2, leafAngle: 38, leafDroop: 0.1, petiole: 0.03, fold: 0.3, veins: 0.15, leaf1: '#9aa47a', leaf2: '#66744e', leaf3: '#3e4a32', underside: '#c4c8b0', backside: 0.4, twig: '#7a7258', bark: '#6a6252', extra: 'berries', extraAmt: 0.3, extraSize: 0.9, extraColor: '#2e2a3a', extraColor2: '#6a7a2a', seed: 5 } },
      { name: 'Maple branch (autumn)', group: 'Seasonal', values: { shape: 'maple', leafMin: 0.08, leafMax: 0.12, density: 0.8, leafArrange: 'opposite', arrange: 'opposite', branches: 4, branchAngle: 50, petiole: 0.45, leafAngle: 60, fold: 0.3, veins: 0.6, autumn: 0.85, damage: 0.15, dryTips: 0.2, twig: '#7a3e2a', bark: '#5a3a2a', seed: 6, leaf1: '#b4c048', leaf2: '#7e9a34', leaf3: '#4e6e26', autumnYellow: '#f0c028', autumnRed: '#d8441a', autumnBrown: '#8a4a1e' } },
      { name: 'Cherry blossom branch', group: 'Seasonal', values: { shape: 'oval', leafMin: 0.04, leafMax: 0.06, density: 0.5, serration: 0.4, branches: 6, branchAngle: 58, droop: -0.1, wobble: 0.6, stemWidth: 0.018, twigs: 2, leaf1: '#b4c46a', leaf2: '#7c9a46', leaf3: '#4e6e30', bark: '#3e2c2a', twig: '#4e3430', extra: 'blossoms', extraAmt: 0.9, extraSize: 1.1, extraColor: '#f8c6d4', extraColor2: '#e05a7a', seed: 11 } },
      { name: 'Holly with berries', group: 'Seasonal', values: { shape: 'holly', leafMin: 0.07, leafMax: 0.1, density: 1.1, branches: 5, branchAngle: 50, twigs: 1, leafAngle: 55, petiole: 0.05, fold: 0.6, leafBend: 0.25, veins: 0.3, midrib: 0.7, leaf1: '#3c7a34', leaf2: '#1e5220', leaf3: '#0e3216', underside: '#6a9a58', bark: '#4a5232', twig: '#4a5e2e', extra: 'berries', extraAmt: 0.75, extraSize: 1.1, extraColor: '#d01a1e', extraColor2: '#e8403a', seed: 2 } },
      { name: 'Dead dry twig', group: 'Seasonal', values: { density: 0, branches: 8, twigs: 3, branchAngle: 48, droop: -0.15, wobble: 0.7, angleVar: 0.8, lenVar: 0.6, stemWidth: 0.022, branchWidth: 0.6, twigLen: 0.5, bark: '#5a4e44', twig: '#7a6a5a', ao: 0.4, seed: 8 } },
      { name: 'Pine branch', group: 'Conifer', values: { shape: 'needle', leafMin: 0.09, leafMax: 0.13, leafWidth: 0.9, density: 2.6, leafArrange: 'bundle', bundle: 3, leafAngle: 38, leafJitter: 0.25, leafDroop: -0.1, leafProfile: 0.15, leafStart: 0.05, branches: 7, branchAngle: 55, branchLen: 0.32, droop: 0.1, twigs: 2, stemWidth: 0.024, stemLeaves: true, fold: 0.1, leaf1: '#6e8c48', leaf2: '#46683a', leaf3: '#26422a', colorVar: 0.45, bark: '#5a4234', twig: '#8a6a44', extra: 'cones', extraAmt: 0.5, extraColor: '#7a5434', extraColor2: '#b08a5a', seed: 14 } },
      { name: 'Spruce branch', group: 'Conifer', values: { shape: 'needle', leafMin: 0.035, leafMax: 0.05, leafWidth: 1.6, density: 4, leafArrange: 'around', leafAngle: 55, leafJitter: 0.2, leafDroop: 0, leafProfile: 0.1, leafStart: 0, branches: 9, arrange: 'opposite', branchAngle: 62, branchLen: 0.4, lenTaper: 0.75, droop: 0.35, twigs: 4, twigAngle: 50, twigLen: 0.4, stemWidth: 0.018, terminal: false, fold: 0.1, leaf1: '#4e7058', leaf2: '#33503e', leaf3: '#1c3024', colorVar: 0.4, bark: '#4e3a2c', twig: '#7a5a3a', ao: 0.7, seed: 21 } },
      { name: 'Fir branch (flat needles)', group: 'Conifer', values: { shape: 'needle', leafMin: 0.03, leafMax: 0.042, leafWidth: 2, density: 3, leafArrange: 'opposite', leafAngle: 72, leafJitter: 0.15, leafDroop: 0, leafProfile: 0.2, leafStart: 0, branches: 8, arrange: 'opposite', branchAngle: 58, branchLen: 0.38, droop: 0.15, twigs: 3, twigAngle: 55, twigLen: 0.45, stemWidth: 0.016, terminal: false, backside: 0.2, underside: '#7a9a8a', fold: 0.05, leaf1: '#4a7a42', leaf2: '#2e5a32', leaf3: '#1a3a22', colorVar: 0.35, bark: '#5a4636', twig: '#7a6a3a', seed: 17 } },
      { name: 'Fern frond', group: 'Fronds & vines', values: { shape: 'leaflet', leafMin: 0.035, leafMax: 0.048, leafWidth: 1.1, density: 1.6, leafArrange: 'opposite', leafAngle: 70, leafJitter: 0.1, leafDroop: 0.05, leafProfile: 0.55, leafStart: 0.02, petiole: 0, branches: 16, arrange: 'opposite', branchStart: 0.12, branchAngle: 72, angleVar: 0.15, branchLen: 0.4, profile: 'oval', lenTaper: 0.7, lenVar: 0.1, droop: 0.1, branchWidth: 0.4, twigs: 0, stemWidth: 0.012, stemTaper: 0.85, wobble: 0.15, lean: 0.25, stemLeaves: true, fold: 0.3, veins: 0.3, damage: 0, backside: 0, leaf1: '#94c050', leaf2: '#5a9430', leaf3: '#2e6420', bark: '#5a6a2a', twig: '#6a8a34', seed: 10 } },
      { name: 'Palm frond', group: 'Fronds & vines', values: { shape: 'palm', leafMin: 0.3, leafMax: 0.46, leafWidth: 1.25, density: 9, leafArrange: 'opposite', leafAngle: 58, leafJitter: 0.15, leafDroop: 0.55, leafBend: 0.7, leafProfile: 0.25, petiole: 0, branches: 0, branchStart: 0.18, profile: 'oval', lenTaper: 0.45, stemWidth: 0.02, stemTaper: 0.85, wobble: 0.1, lean: 0.35, stemLeaves: true, terminal: true, fold: 0.6, veins: 0.4, damage: 0.02, dryTips: 0.25, leaf1: '#8fb04a', leaf2: '#56822e', leaf3: '#2c5420', bark: '#6a6a3a', twig: '#7a7a3e', seed: 13 } },
      { name: 'Ivy vine', group: 'Fronds & vines', values: { shape: 'ivy', leafMin: 0.08, leafMax: 0.12, density: 1.2, leafArrange: 'alternate', leafAngle: 70, leafJitter: 0.6, leafDroop: 0.1, leafProfile: 0.4, petiole: 0.55, branches: 4, branchAngle: 60, branchLen: 0.24, droop: 0.3, twigs: 0, stemWidth: 0.012, stemTaper: 0.5, wobble: 1, lean: -0.2, stemLeaves: true, fold: 0.2, veins: 0.7, midrib: 0.4, leaf1: '#6aa448', leaf2: '#3e7a32', leaf3: '#22501e', veinColor: '#cfe0b0', underside: '#7a9a6a', bark: '#5a4a34', twig: '#6a5e3a', seed: 19 } },
      { name: 'Bamboo', group: 'Fronds & vines', values: { shape: 'lanceolate', leafMin: 0.11, leafMax: 0.17, leafWidth: 1.1, density: 1.4, leafAngle: 32, leafDroop: 0.75, leafBend: 0.35, leafProfile: 0.2, leafStart: 0.35, petiole: 0.06, branches: 7, branchStart: 0.3, branchAngle: 55, branchLen: 0.3, droop: 0.4, twigs: 2, stemWidth: 0.03, stemTaper: 0.5, wobble: 0.1, stemLeaves: false, nodes: 0.45, fold: 0.4, veins: 0.3, leaf1: '#b0c860', leaf2: '#76a03c', leaf3: '#44702a', bark: '#8aa04a', twig: '#9aa856', seed: 15 } },
      { name: 'Toon branch', group: 'Stylized', values: { style: 'toon', density: 1, leafMin: 0.07, leafMax: 0.1, leaf1: '#a8e05a', leaf2: '#5cb03a', leaf3: '#2e7a2e', colorVar: 0.35, bark: '#7a4e32', twig: '#8a5e3a', veins: 0.5, damage: 0, ao: 0.35, depthShade: 0.25, backside: 0 } },
      { name: 'Toon pine', group: 'Stylized', values: { style: 'toon', shape: 'needle', leafMin: 0.05, leafMax: 0.065, leafWidth: 2.4, density: 2.5, leafArrange: 'opposite', leafAngle: 50, leafJitter: 0.1, leafDroop: 0.1, leafStart: 0, branches: 8, arrange: 'opposite', branchAngle: 62, branchLen: 0.4, lenTaper: 0.85, droop: 0.3, twigs: 2, stemWidth: 0.03, terminal: false, outline: 0.35, leaf1: '#5ab870', leaf2: '#2e8a52', leaf3: '#1a5a3a', bark: '#6a4a32', twig: '#6a4a32', ao: 0.3, depthShade: 0.25, seed: 5 } },
      { name: 'Alien glowing branch', group: 'Sci-fi', values: { shape: 'lanceolate', leafMin: 0.07, leafMax: 0.12, leafWidth: 1.6, density: 1, leafBend: 0.6, leafDroop: -0.2, droop: -0.5, wobble: 0.8, branchAngle: 45, leaf1: '#7af0e0', leaf2: '#2a8aa8', leaf3: '#1a2a70', underside: '#c07aff', backside: 0.25, veinColor: '#e0fff8', veins: 0.9, glow: 0.8, glowColor: '#7affea', translucency: 0.6, bark: '#2a1a3a', twig: '#4a2a6a', extra: 'berries', extraAmt: 0.4, extraColor: '#ff5ae0', extraColor2: '#ffe05a', seed: 23 } },
      { name: 'Crystal thorn branch', group: 'Sci-fi', values: { shape: 'holly', leafMin: 0.05, leafMax: 0.08, leafWidth: 0.8, density: 1.1, leafAngle: 40, branches: 8, arrange: 'random', branchAngle: 40, droop: -0.4, angleVar: 0.8, wobble: 0.6, style: 'toon', outline: 0.25, outlineColor: '#120a2a', leaf1: '#e0d0ff', leaf2: '#9a7ae8', leaf3: '#4a2a98', bark: '#2a2440', twig: '#3a3460', glow: 0.5, glowColor: '#f0e0ff', seed: 30 } },
    ],

    render(ctx, W, H, p, opts) {
      opts = opts || {};
      const mode = opts.height || p.output === 'height' ? 'height' : opts.source === 'leaf' ? 'leaf' : opts.source === 'transl' ? 'transl' : 'color';
      const S = Math.min(W, H), m = p.margin * S, toon = p.style === 'toon';
      const rnd = U.rng((p.seed | 0) * 7919 + 13);
      const sh = SHAPES[p.shape] || SHAPES.oval, isNeedle = !!sh.needle;
      const bx0 = m, bx1 = W - m, by0 = m, by1 = H - m;

      /* ---------- leaf outline pool (own rng, so damage / width changes don't reshuffle the branch) ---------- */
      const prng = U.rng((p.seed | 0) * 31 + 977);
      const pool = [], dpool = [];
      for (let i = 0; i < (isNeedle ? 2 : 8); i++) pool.push(buildVariant(sh, p, prng, false));
      if (p.damage > 0 && !isNeedle) for (let i = 0; i < 6; i++) dpool.push(buildVariant(sh, p, prng, true));

      /* ---------- axes: polylines with diameters ---------- */
      const axes = [];
      const mkAxis = (xs, ys, ds, z, order) => {
        const n = xs.length, cl = new Float32Array(n);
        for (let i = 1; i < n; i++) cl[i] = cl[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
        const a = { xs, ys, ds, cl, n, len: cl[n - 1], z, order, d0: ds[0] };
        axes.push(a);
        return a;
      };
      const sample = (a, t) => {
        const L = clamp(t) * a.len;
        let i = 1;
        while (i < a.n - 1 && a.cl[i] < L) i++;
        const s0 = a.cl[i - 1], s1 = a.cl[i], f = s1 > s0 ? clamp((L - s0) / (s1 - s0)) : 0;
        return { x: lerp(a.xs[i - 1], a.xs[i], f), y: lerp(a.ys[i - 1], a.ys[i], f), d: lerp(a.ds[i - 1], a.ds[i], f), ang: Math.atan2(a.ys[i] - a.ys[i - 1], a.xs[i] - a.xs[i - 1]), t };
      };
      const profF = (tt) => (p.profile === 'even' ? 1 : p.profile === 'oval' ? Math.pow(Math.sin(PI * (0.1 + 0.82 * tt)), 0.6) * (1 - 0.5 * p.lenTaper * tt) : 1 - p.lenTaper * tt);
      const leafReach = hasLeaves(p) ? p.leafMax * S * (isNeedle ? 0.5 : 0.3) : 0;
      // grow a branch / twig step by step; it stops before the margin (minus room for its leaves)
      const grow = (x, y, ang, len, d0, z, order) => {
        const n = Math.max(6, Math.min(48, Math.ceil(len / (S * 0.008)))), st = len / n, rr = leafReach + d0;
        const xs = [x], ys = [y];
        const bend = p.droop * 1.5 / n, wig = 0.12 + p.wobble * 0.15;
        for (let i = 0; i < n; i++) {
          ang += bend * Math.cos(ang) * (0.6 + 0.8 * (i / n)) + (rnd() - 0.5) * wig;
          const nx = x + Math.cos(ang) * st, ny = y + Math.sin(ang) * st;
          if (nx < bx0 + rr || nx > bx1 - rr || ny < by0 + rr || ny > by1 - rr) break;
          x = nx; y = ny; xs.push(x); ys.push(y);
        }
        if (xs.length < 3) return null;
        const d1 = Math.max(S * 0.0012, d0 * 0.28), k = xs.length, ds = new Float32Array(k);
        for (let i = 0; i < k; i++) ds[i] = lerp(d0, d1, Math.pow(i / (k - 1), 0.8));
        return mkAxis(xs, ys, ds, z, order);
      };

      // main stems
      const stems = [], ns = p.stems | 0;
      for (let k = 0; k < ns; k++) {
        const off = ns > 1 ? k / (ns - 1) - 0.5 : 0, side = Math.abs(off) > 0.01;
        const d0 = p.stemWidth * S * (side ? 0.8 : 1);
        const baseY = p.fromBottom ? H + d0 : H * (1 - p.baseGap), visBase = p.fromBottom ? H : baseY;
        const hk = side ? 0.78 + 0.16 * rnd() : 1;
        const topY = lerp(visBase, by0 + d0 * 0.5 + leafReach * 0.4, p.stemTop * hk);
        const ph1 = rnd() * TAU, ph2 = rnd() * TAU, f1 = 1.2 + rnd(), f2 = 3 + 2 * rnd();
        const n = 56, xs = [], ys = [], ds = new Float32Array(n);
        const x0 = W / 2 + off * p.spread * S * 0.12, drift = off * p.spread * S * 0.5;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          let x = x0 + drift * t * (1.5 - 0.5 * t) + p.lean * S * 0.22 * t * t;
          x += p.wobble * S * 0.035 * smoothstep(0, 0.35, t) * (Math.sin(t * f1 * PI + ph1) * 0.7 + Math.sin(t * f2 * PI + ph2) * 0.3);
          ds[i] = Math.max(S * 0.0015, d0 * (1 - p.stemTaper * Math.pow(t, 0.9)));
          xs.push(clamp(x, bx0 + ds[i], bx1 - ds[i])); ys.push(lerp(baseY, topY, t));
        }
        stems.push(mkAxis(xs, ys, ds, side ? (rnd() - 0.5) * 0.6 : 0, 0));
      }

      // side branches + twigs
      const leafy = []; // axes that carry foliage: [axis, isMain]
      for (const st of stems) {
        if (p.stemLeaves) leafy.push([st, true]);
        const nb = p.branches | 0;
        let sd = rnd() < 0.5 ? 1 : -1;
        for (let i = 0; i < nb; i++) {
          const tt = (i + 0.5 + (rnd() - 0.5) * 0.5) / nb, t = p.branchStart + (1 - p.branchStart) * tt * 0.94;
          const at = sample(st, t), pf = profF(tt);
          const list = p.arrange === 'opposite' ? [[1, 1, 0], [-1, 1, 0]] : p.arrange === 'whorl' ? [[1, 1, 0], [-1, 1, 0], [rnd() < 0.5 ? 1 : -1, 0.45, rnd() < 0.5 ? 0.85 : -0.85]] : [[p.arrange === 'random' ? (rnd() < 0.5 ? 1 : -1) : sd, 1, 0]];
          sd = -sd;
          for (const [side, lk, zf] of list) {
            const alpha = p.branchAngle * RAD * (1 - 0.2 * tt) * (1 + (rnd() - 0.5) * p.angleVar * 0.7) * (lk < 1 ? 0.45 : 1);
            const len = p.branchLen * S * pf * lk * (1 - p.lenVar * rnd() * 0.6);
            const z = zf || st.z + (rnd() - 0.5) * 1.1;
            const d0 = Math.min(at.d * 0.9, Math.max(S * 0.0015, at.d * p.branchWidth));
            const br = grow(at.x, at.y, at.ang + side * alpha, len, d0, z, 1);
            if (!br) continue;
            leafy.push([br, false]);
            const nt = p.twigs | 0;
            let ts = rnd() < 0.5 ? 1 : -1;
            for (let j = 0; j < nt; j++) {
              const s = 0.18 + 0.72 * ((j + 0.5 + (rnd() - 0.5) * 0.4) / nt), bt = sample(br, s);
              const tl = p.twigLen * br.len * (1 - 0.45 * s) * (0.75 + 0.5 * rnd());
              const ta = bt.ang + ts * p.twigAngle * RAD * (0.8 + 0.4 * rnd());
              ts = -ts;
              const tw = grow(bt.x, bt.y, ta, tl, Math.max(S * 0.0012, bt.d * 0.7), z + (rnd() - 0.5) * 0.5, 2);
              if (tw) leafy.push([tw, false]);
            }
          }
        }
      }
      // main stems alone (no branches, no stem leaves) still carry foliage
      if (!leafy.length) for (const st of stems) leafy.push([st, true]);

      /* ---------- leaves ---------- */
      const leaves = [], nodes = [];
      const avgL = Math.max(1e-6, ((p.leafMin + p.leafMax) / 2) * S);
      const C1 = U.hex(p.leaf1), C2 = U.hex(p.leaf2), C3 = U.hex(p.leaf3), CU = U.hex(p.underside);
      const AY = U.hex(p.autumnYellow), AR = U.hex(p.autumnRed), AB = U.hex(p.autumnBrown);
      const foldA = p.fold * 0.8;
      const addLeaf = (ax, at, side, phi, sizeF, terminal) => {
        let L = lerp(p.leafMin, p.leafMax, rnd()) * S * sizeF;
        let alpha = terminal ? 0 : p.leafAngle * RAD, z = ax.z + (rnd() - 0.5) * 0.7, roll = (rnd() - 0.5) * 2 * (0.2 + p.fold * 0.6);
        if (phi != null) {
          const sp = Math.sin(phi), app = Math.abs(sp);
          side = sp >= 0 ? 1 : -1;
          alpha *= 0.2 + 0.8 * app;
          L *= 1 - 0.5 * (1 - app) * Math.sin(p.leafAngle * RAD);
          z = ax.z + Math.cos(phi) * 0.7;
          roll += (1 - app) * side * 0.6;
        }
        let th = at.ang + side * alpha + (rnd() - 0.5) * p.leafJitter * 1.3;
        if (p.leafDroop) { const vx = Math.cos(th), vy = Math.sin(th) + p.leafDroop * (terminal ? 0.5 : 1); th = Math.atan2(vy, vx); }
        const back = rnd() < p.backside;
        const dmg = dpool.length && rnd() < p.damage;
        const v = dmg ? dpool[Math.floor(rnd() * dpool.length)] : pool[Math.floor(rnd() * pool.length)];
        const flip = rnd() < 0.5 ? 1 : -1;
        const bend = (rnd() - 0.5) * p.leafBend * 0.5 + (Math.cos(th) >= 0 ? 1 : -1) * p.leafBend * 0.12 * (p.leafDroop >= 0 ? 1 : -1);
        // color: young (tips) lighter, old (inner) darker, random spread along the three colors
        const ct = clamp(0.5 + (rnd() - 0.5) * p.colorVar * 1.5 - 0.3 * (at.t - 0.5) + (ax.order === 0 ? 0.08 : 0));
        let col = ct < 0.5 ? mix(C1, C2, ct * 2) : mix(C2, C3, (ct - 0.5) * 2);
        col = mul(col, 1 + (rnd() - 0.5) * 0.14 * p.colorVar);
        const au = rnd(), aq = rnd() * 2, ak = 0.7 + 0.3 * rnd();
        if (au < p.autumn) col = mix(col, aq < 1 ? mix(AY, AR, aq) : mix(AR, AB, aq - 1), ak);
        if (back) col = mix(col, CU, 0.55);
        const dryR = rnd(), dry = dryR < p.dryTips ? 0.45 + 0.55 * rnd() : 0;
        const pet = isNeedle ? 0 : p.petiole;
        leaves.push({ ax: at.x, ay: at.y, th, L, v, roll, back, flip, bend, z, col, dry, pet, order: ax.order });
      };
      for (const [ax, isMain] of leafy) {
        if (!hasLeaves(p)) break;
        const t0 = isMain ? Math.max(p.branchStart, p.leafStart) : p.leafStart, usable = ax.len * (1 - t0);
        if (usable <= 0) continue;
        const arr = p.leafArrange, count = (p.density * usable) / (avgL * 0.5);
        const nn = Math.min(500, Math.round(arr === 'opposite' ? count / 2 : count));
        let sd = rnd() < 0.5 ? 1 : -1;
        for (let i = 0; i < nn; i++) {
          const t = t0 + (1 - t0) * clamp((i + 0.5 + (rnd() - 0.5) * 0.5) / nn) * 0.97;
          const at = sample(ax, t);
          const sizeF = (1 - p.leafProfile * t) * (isMain ? profF(clamp((t - p.branchStart) / (1 - p.branchStart))) : 1);
          if (sizeF <= 0.05) continue;
          nodes.push({ x: at.x, y: at.y, ang: at.ang, z: ax.z, order: ax.order });
          if (arr === 'opposite') { addLeaf(ax, at, 1, null, sizeF); addLeaf(ax, at, -1, null, sizeF); }
          else if (arr === 'around') addLeaf(ax, at, 1, i * 2.39996 + rnd() * 0.5, sizeF);
          else if (arr === 'bundle') { const nb = p.bundle | 0, ph = rnd() * TAU; for (let b = 0; b < nb; b++) addLeaf(ax, at, 1, ph + (b / nb) * TAU + (rnd() - 0.5) * 0.8, sizeF); }
          else { addLeaf(ax, at, sd, null, sizeF); sd = -sd; }
        }
        if (p.terminal) {
          const at = sample(ax, 1), sizeF = Math.max(0.3, 1 - p.leafProfile * 0.9);
          if (arr === 'bundle') { const nb = p.bundle | 0, ph = rnd() * TAU; for (let b = 0; b < nb; b++) addLeaf(ax, at, 1, ph + (b / nb) * TAU, sizeF); }
          else addLeaf(ax, at, 0, null, sizeF, true);
        }
      }

      /* ---------- leaf geometry in pixels + fit inside the card ---------- */
      const fitK = (ax, ay, xs, ys) => {
        if (ax < bx0 || ax > bx1 || ay < by0 || ay > by1) return 0;
        let k = 1;
        for (let i = 0; i < xs.length; i++) {
          const dx = xs[i] - ax, dy = ys[i] - ay;
          if (dx > 0 && ax + dx * k > bx1) k = (bx1 - ax) / dx; else if (dx < 0 && ax + dx * k < bx0) k = (bx0 - ax) / dx;
          if (dy > 0 && ay + dy * k > by1) k = (by1 - ay) / dy; else if (dy < 0 && ay + dy * k < by0) k = (by0 - ay) / dy;
        }
        return k;
      };
      const drawn = [];
      for (const lf of leaves) {
        const v = lf.v, c = Math.cos(lf.th), s = Math.sin(lf.th);
        const tp = foldA + lf.roll, tm = foldA - lf.roll;
        const wp = Math.max(0.1, Math.cos(tp)), wm = Math.max(0.1, Math.cos(tm));
        let L = lf.L;
        const n = v.pts.length, xs = new Float32Array(n), ys = new Float32Array(n);
        const bxp = lf.ax + c * lf.pet * L, byp = lf.ay + s * lf.pet * L;
        for (let i = 0; i < n; i++) {
          const u = v.pts[i][0], y0 = v.pts[i][1] * lf.flip, yy = (y0 >= 0 ? y0 * wp : y0 * wm) + lf.bend * u * u;
          xs[i] = bxp + (c * u - s * yy) * L; ys[i] = byp + (s * u + c * yy) * L;
        }
        let k = fitK(lf.ax, lf.ay, xs, ys);
        if (k < 0.3) continue;
        if (k < 1) { for (let i = 0; i < n; i++) { xs[i] = lf.ax + (xs[i] - lf.ax) * k; ys[i] = lf.ay + (ys[i] - lf.ay) * k; } L *= k; }
        Object.assign(lf, { c, s, wp, wm, tp, tm, Lp: L, bx: lf.ax + c * lf.pet * L, by: lf.ay + s * lf.pet * L, xs, ys });
        drawn.push(lf);
      }

      /* ---------- extras (own rng) ---------- */
      const erng = U.rng((p.seed | 0) * 131 + 4241), extras = [];
      if (p.extra !== 'none' && p.extraAmt > 0) {
        const tips = leafy.map(([a]) => ({ ...sample(a, 1), z: a.z, order: a.order }));
        const E = p.extra, amt = p.extraAmt, sz = p.extraSize * S;
        const inBox = (x, y, r) => x - r >= bx0 && x + r <= bx1 && y - r >= by0 && y + r <= by1;
        const shrinkR = (x, y, r) => Math.min(r, x - bx0, bx1 - x, y - by0, by1 - y);
        const cands = [];
        for (const t of tips) cands.push([t, true]);
        for (const nd of nodes) cands.push([nd, false]);
        for (const [c, tip] of cands) {
          const pr = E === 'berries' ? (tip ? amt : amt * 0.12) : E === 'blossoms' ? (tip ? amt * 0.8 : amt * 0.4) : E === 'cones' ? (tip && c.order > 0 ? amt * 0.6 : 0) : tip ? amt * 0.6 : amt * 0.08;
          if (erng() >= pr) continue;
          if (E === 'berries') {
            const nbr = 3 + Math.floor(erng() * 6), r = 0.0105 * sz * (0.85 + 0.3 * erng());
            const cx = c.x + (erng() - 0.5) * r * 2, cy = c.y + r * (1.5 + erng() * 1.5), list = [];
            for (let b = 0; b < nbr; b++) {
              const a = erng() * TAU, dd = Math.sqrt(erng()) * r * 1.5, x = cx + Math.cos(a) * dd, y = cy + Math.sin(a) * dd, rr = shrinkR(x, y, r * (0.8 + 0.35 * erng()));
              if (rr > r * 0.5) list.push({ x, y, r: rr, k: erng(), z: erng() });
            }
            list.sort((a, b) => a.y - b.y || a.z - b.z);
            if (list.length) extras.push({ type: 'berries', z: c.z + 0.35, sx: c.x, sy: c.y, list });
          } else if (E === 'blossoms') {
            const nf = 1 + Math.floor(erng() * 3);
            for (let f = 0; f < nf; f++) {
              const r = 0.022 * sz * (0.8 + 0.4 * erng()), x = c.x + (erng() - 0.5) * r * 2.4, y = c.y + (erng() - 0.5) * r * 2.4, rr = shrinkR(x, y, r);
              if (rr > r * 0.5) extras.push({ type: 'blossom', z: c.z + 0.2 + erng() * 0.4, x, y, r: rr, rot: erng() * TAU, sq: 0.55 + 0.45 * erng(), tilt: erng() * PI, k: erng() });
            }
          } else if (E === 'cones') {
            let l = 0.08 * sz * (0.8 + 0.4 * erng());
            const vx = Math.cos(c.ang) * 0.4, vy = Math.sin(c.ang) * 0.4 + 1, a = Math.atan2(vy, vx) + (erng() - 0.5) * 0.4;
            const ex = c.x + Math.cos(a) * l, ey = c.y + Math.sin(a) * l;
            if (!inBox(ex, ey, l * 0.25)) { l *= 0.6; if (!inBox(c.x + Math.cos(a) * l, c.y + Math.sin(a) * l, l * 0.25)) continue; }
            extras.push({ type: 'cone', z: c.z + 0.1, x: c.x, y: c.y, a, l, k: erng() });
          } else {
            let l = 0.07 * sz * (0.75 + 0.5 * erng());
            const a = PI / 2 + (erng() - 0.5) * 0.7, cv = (erng() - 0.5) * 0.8;
            if (!inBox(c.x + Math.cos(a) * l, c.y + Math.sin(a) * l, l * 0.12)) { l *= 0.55; if (!inBox(c.x + Math.cos(a) * l, c.y + Math.sin(a) * l, l * 0.12)) continue; }
            extras.push({ type: 'catkin', z: c.z + 0.15, x: c.x, y: c.y, a, l, cv, k: erng() });
          }
        }
      }

      /* ---------- depth-sorted draw list ---------- */
      const items = [];
      for (const a of axes) items.push({ z: a.z - 0.001 * a.order, kind: 0, o: a });
      for (const lf of drawn) items.push({ z: lf.z, kind: 1, o: lf });
      for (const e of extras) items.push({ z: e.z, kind: 2, o: e });
      items.sort((a, b) => a.z - b.z);
      let zmin = Infinity, zmax = -Infinity;
      for (const it of items) { if (it.z < zmin) zmin = it.z; if (it.z > zmax) zmax = it.z; }
      const zN = (z) => (zmax > zmin ? (z - zmin) / (zmax - zmin) : 0.5);
      const hOf = (z) => 0.3 + 0.55 * zN(z); // height of an item in the height map

      const la = p.lightAngle * RAD, ang = p.lightMode === 'angled', LE = 50 * RAD;
      const LX = Math.cos(la) * Math.cos(LE), LY = Math.sin(la) * Math.cos(LE), LZ = Math.sin(LE);
      // brightness of a surface with normal (nx, ny, nz)
      const lit = (nx, ny, nz) => (ang ? 0.38 + 0.72 * Math.max(0, nx * LX + ny * LY + nz * LZ) : 0.6 + 0.4 * nz);
      const BARK = U.hex(p.bark), TWIG = U.hex(p.twig), VEIN = U.hex(p.veinColor), GLOW = U.hex(p.glowColor), DRY = U.hex(p.dryColor), OUT = p.outlineColor;
      const E1 = U.hex(p.extraColor), E2 = U.hex(p.extraColor2);
      const stemD = p.stemWidth * S, olw = Math.max(1, p.outline * S * 0.005);
      // inner darkening: close to the main stem and behind it
      const innerShade = (x, z) => 1 - p.depthShade * (0.5 * (1 - clamp(Math.abs(x - W / 2) / (S * 0.4))) + 0.5 * clamp(-z * 0.9)) * 0.7;

      const axisPath = (a) => {
        const P = new Path2D(), n = a.n, L = [], R = [];
        for (let i = 0; i < n; i++) {
          const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
          let tx = a.xs[i1] - a.xs[i0], ty = a.ys[i1] - a.ys[i0];
          const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
          const r = a.ds[i] / 2;
          L.push([a.xs[i] - ty * r, a.ys[i] + tx * r]); R.push([a.xs[i] + ty * r, a.ys[i] - tx * r]);
        }
        P.moveTo(L[0][0], L[0][1]);
        for (let i = 1; i < n; i++) P.lineTo(L[i][0], L[i][1]);
        const e = n - 1, ea = Math.atan2(a.ys[e] - a.ys[e - 1], a.xs[e] - a.xs[e - 1]);
        P.arc(a.xs[e], a.ys[e], a.ds[e] / 2, ea + PI / 2, ea - PI / 2, true);
        for (let i = n - 1; i >= 0; i--) P.lineTo(R[i][0], R[i][1]);
        P.closePath();
        return P;
      };
      // stroke the centerline with a width that follows the diameter (k = fraction of it)
      const strokeAxis = (c, a, k, style, off) => {
        c.strokeStyle = style; c.lineCap = 'round';
        const ox = off ? off[0] : 0, oy = off ? off[1] : 0;
        for (let i = 1; i < a.n; i++) {
          c.lineWidth = Math.max(0.5, a.ds[i] * k);
          c.beginPath(); c.moveTo(a.xs[i - 1] + ox * a.ds[i], a.ys[i - 1] + oy * a.ds[i]); c.lineTo(a.xs[i] + ox * a.ds[i], a.ys[i] + oy * a.ds[i]); c.stroke();
        }
      };

      const drawAxis = (c, a, md) => {
        const path = axisPath(a);
        if (md === 'leaf' || md === 'transl') { c.fillStyle = '#000'; c.fill(path); return; }
        if (md === 'height') {
          const h = hOf(a.z) - 0.04;
          c.fillStyle = gray(h); c.fill(path);
          if (a.d0 > 3) { strokeAxis(c, a, 0.65, gray(h + 0.04)); strokeAxis(c, a, 0.3, gray(h + 0.08)); }
          return;
        }
        const am = sample(a, 0.5), base = mix(TWIG, BARK, clamp(a.d0 / (stemD * 0.6))), sh = innerShade(W / 2, a.z * 0.6) * (0.5 + 0.5 * itemAO(am.x, am.y));
        if (toon) {
          c.fillStyle = css(mul(base, sh)); c.fill(path);
          if (p.outline > 0) { c.lineWidth = olw; c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke(path); }
          return;
        }
        c.fillStyle = css(mul(base, 0.62 * sh)); c.fill(path);
        if (a.d0 > 2.5) {
          const off = ang ? [LX * 0.12, LY * 0.12] : null;
          strokeAxis(c, a, 0.7, css(mul(base, 0.85 * sh)), off);
          strokeAxis(c, a, 0.32, css(mul(base, 1.08 * sh)), off);
        }
        if (p.nodes > 0 && a.order === 0) { // bamboo rings
          const step = lerp(0.24, 0.05, p.nodes) * H;
          for (let L = step * (0.6 + 0.3 * ((p.seed % 7) / 7)); L < a.len - step * 0.3; L += step) {
            const q = sample(a, L / a.len), nx = -Math.sin(q.ang), ny = Math.cos(q.ang), r = q.d * 0.56;
            c.lineCap = 'butt';
            c.lineWidth = Math.max(1, q.d * 0.12); c.strokeStyle = css(mul(base, 0.45 * sh));
            c.beginPath(); c.moveTo(q.x - nx * r, q.y - ny * r); c.lineTo(q.x + nx * r, q.y + ny * r); c.stroke();
            const ox = Math.cos(q.ang) * q.d * 0.12, oy = Math.sin(q.ang) * q.d * 0.12;
            c.lineWidth = Math.max(0.7, q.d * 0.06); c.strokeStyle = css(mul(base, 1.25 * sh));
            c.beginPath(); c.moveTo(q.x - nx * r * 0.9 - ox, q.y - ny * r * 0.9 - oy); c.lineTo(q.x + nx * r * 0.9 - ox, q.y + ny * r * 0.9 - oy); c.stroke();
          }
        }
      };

      const leafPath = (lf) => {
        if (lf.path) return lf.path;
        const P = new Path2D(), xs = lf.xs, ys = lf.ys;
        P.moveTo(xs[0], ys[0]);
        for (let i = 1; i < xs.length; i++) P.lineTo(xs[i], ys[i]);
        P.closePath();
        for (const [u, y, r] of lf.v.holes) {
          const y0 = y * lf.flip, yy = (y0 >= 0 ? y0 * lf.wp : y0 * lf.wm) + lf.bend * u * u;
          const hx = lf.bx + (lf.c * u - lf.s * yy) * lf.Lp, hy = lf.by + (lf.s * u + lf.c * yy) * lf.Lp;
          const rx = r * lf.Lp, ry = r * lf.Lp * (lf.wp + lf.wm) * 0.5;
          P.moveTo(hx + Math.cos(lf.th) * rx, hy + Math.sin(lf.th) * rx);
          P.ellipse(hx, hy, rx, ry, lf.th, 0, TAU);
        }
        lf.path = P;
        return P;
      };
      const ptAt = (lf, u, y) => { const yy = y + lf.bend * u * u; return [lf.bx + (lf.c * u - lf.s * yy) * lf.Lp, lf.by + (lf.s * u + lf.c * yy) * lf.Lp]; };

      const drawLeaf = (c, lf, md) => {
        const path = leafPath(lf), L = lf.Lp, v = lf.v;
        const px = -lf.s, py = lf.c;
        const Wp = v.maxW * L * lf.wp, Wm = v.maxW * L * lf.wm, small = Wp + Wm < 2.5;
        const M = ptAt(lf, v.needle ? 0.5 : v.inX, 0), mr = Wm / (Wp + Wm);
        const g0x = M[0] - px * Wm, g0y = M[1] - py * Wm, g1x = M[0] + px * Wp, g1y = M[1] + py * Wp;
        // petiole
        if (lf.pet > 0 && L * lf.pet > 0.8) {
          c.lineCap = 'round'; c.lineWidth = Math.max(0.6, L * 0.022);
          c.strokeStyle = md === 'color' ? css(mul(TWIG, innerShade(lf.ax, lf.z))) : md === 'height' ? gray(hOf(lf.z) - 0.03) : '#000';
          c.beginPath(); c.moveTo(lf.ax, lf.ay); c.lineTo(lf.bx, lf.by); c.stroke();
        }
        if (md === 'leaf') { c.fillStyle = '#fff'; c.fill(path, 'evenodd'); return; }
        if (md === 'height') {
          const h = hOf(lf.z), dome = 0.05 * (v.needle ? 0.5 : 1);
          if (small) { c.fillStyle = gray(h); c.fill(path, 'evenodd'); return; }
          const g = c.createLinearGradient(g0x, g0y, g1x, g1y);
          g.addColorStop(0, gray(h - dome)); g.addColorStop(mr, gray(h + dome)); g.addColorStop(1, gray(h - dome));
          c.fillStyle = g; c.fill(path, 'evenodd');
          return;
        }
        if (md === 'transl') {
          const k = (lf.back ? 0.85 : 1) * (v.needle ? 0.55 : 1);
          if (small) { c.fillStyle = gray(0.7 * k); c.fill(path, 'evenodd'); return; }
          const g = c.createLinearGradient(g0x, g0y, g1x, g1y);
          g.addColorStop(0, gray(k)); g.addColorStop(mr, gray(0.45 * k)); g.addColorStop(1, gray(k));
          c.fillStyle = g; c.fill(path, 'evenodd');
          return;
        }
        // color
        const mpt = ptAt(lf, 0.5, 0), sh = innerShade(lf.bx, lf.z) * (1 + 0.06 * clamp(lf.z)) * itemAO(mpt[0], mpt[1]);
        const nP = lit(-px * Math.sin(lf.tp), -py * Math.sin(lf.tp), Math.cos(lf.tp)), nM = lit(px * Math.sin(lf.tm), py * Math.sin(lf.tm), Math.cos(lf.tm));
        const col = lf.col;
        if (toon) {
          const cP = mul(col, sh * (nP >= nM ? 1 : 0.8)), cM = mul(col, sh * (nM > nP ? 1 : 0.8));
          if (small) c.fillStyle = css(cP);
          else { const g = c.createLinearGradient(g0x, g0y, g1x, g1y); g.addColorStop(0, css(cM)); g.addColorStop(mr, css(cM)); g.addColorStop(mr, css(cP)); g.addColorStop(1, css(cP)); c.fillStyle = g; }
          c.fill(path, 'evenodd');
        } else {
          const mid = p.midrib, tr = p.translucency;
          const hP = mul(col, sh * nP), hM = mul(col, sh * nM);
          const tint = [col[0] * 1.2 + 28, col[1] * 1.18 + 22, col[2] * 0.85 + 4];
          const eP = mix(mul(hP, 1 - 0.3 * mid), mul(tint, sh * nP), tr * 0.45), eM = mix(mul(hM, 1 - 0.3 * mid), mul(tint, sh * nM), tr * 0.45);
          const rib = mul(mix(hP, hM, 0.5), 1 + 0.12 * mid);
          if (small) { c.fillStyle = css(mix(hP, hM, 0.5)); c.fill(path, 'evenodd'); }
          else {
            const g = c.createLinearGradient(g0x, g0y, g1x, g1y);
            g.addColorStop(0, css(eM)); g.addColorStop(mr * 0.55, css(hM)); g.addColorStop(mr, css(rib)); g.addColorStop(mr + (1 - mr) * 0.45, css(hP)); g.addColorStop(1, css(eP));
            c.fillStyle = g; c.fill(path, 'evenodd');
            // base → tip: darker where the leaf meets the twig, dry tip, translucent tip
            const tip = ptAt(lf, 1, 0), g2 = c.createLinearGradient(lf.bx, lf.by, tip[0], tip[1]);
            g2.addColorStop(0, `rgba(0,0,0,${0.3 * p.depthShade + 0.1})`); g2.addColorStop(0.35, 'rgba(0,0,0,0)');
            if (lf.dry > 0) { g2.addColorStop(0.55, css(DRY, 0)); g2.addColorStop(0.85, css(mul(DRY, sh), lf.dry * 0.8)); g2.addColorStop(1, css(mul(DRY, sh), lf.dry)); }
            else if (tr > 0) { g2.addColorStop(0.7, css(tint, 0)); g2.addColorStop(1, css(mul(tint, sh), tr * 0.3)); }
            c.fillStyle = g2; c.fill(path, 'evenodd');
          }
        }
        // veins
        const vk = p.veins, gl = p.glow;
        if ((vk > 0 || gl > 0) && !v.needle && L > 14) {
          const vc = gl > 0 ? mix(mix(col, VEIN, 0.6), GLOW, gl) : mix(col, VEIN, 0.6);
          const va = clamp(gl > 0 ? Math.max(vk * 0.6, gl) : vk * 0.65);
          c.strokeStyle = toon ? css(mul(col, 0.6 * sh)) : css(mul(vc, gl > 0 ? 1 : sh), va); c.lineCap = 'round';
          for (const [x0, y0, x1, y1, w] of v.veins) {
            if (L * w < 12 && w < 1) continue;
            const a0 = ptAt(lf, x0, y0 * lf.flip * (y0 * lf.flip >= 0 ? lf.wp : lf.wm)), a1 = ptAt(lf, x1, y1 * lf.flip * (y1 * lf.flip >= 0 ? lf.wp : lf.wm));
            c.lineWidth = Math.max(0.5, L * 0.012 * w * (1 + gl));
            c.beginPath(); c.moveTo(a0[0], a0[1]);
            c.lineTo(a1[0], a1[1]); c.stroke();
          }
        }
        if (gl > 0 && !small) { c.lineWidth = Math.max(0.6, L * 0.01); c.strokeStyle = css(GLOW, gl * 0.8); c.stroke(path); }
        if (toon && p.outline > 0) { c.lineWidth = olw * (v.needle ? 0.6 : 1); c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke(path); }
      };

      const drawExtra = (c, e, md) => {
        const hz = hOf(e.z);
        if (e.type === 'berries') {
          c.lineCap = 'round'; c.lineWidth = Math.max(0.6, e.list[0].r * 0.18);
          c.strokeStyle = md === 'color' ? css(TWIG) : md === 'height' ? gray(hz - 0.05) : '#000';
          c.beginPath(); for (const b of e.list) { c.moveTo(e.sx, e.sy); c.lineTo(b.x, b.y); } c.stroke();
          for (const b of e.list) {
            c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU);
            if (md === 'leaf') { c.fillStyle = '#fff'; c.fill(); continue; }
            if (md === 'transl') { c.fillStyle = gray(0.25); c.fill(); continue; }
            if (md === 'height') { const g = c.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r); g.addColorStop(0, gray(hz + 0.1)); g.addColorStop(1, gray(hz - 0.02)); c.fillStyle = g; c.fill(); continue; }
            const bc = mul(mix(E1, E2, b.k * 0.35), itemAO(b.x, b.y));
            if (toon) { c.fillStyle = css(bc); c.fill(); if (p.outline > 0) { c.lineWidth = olw * 0.7; c.strokeStyle = OUT; c.stroke(); } continue; }
            const hx = b.x + (ang ? LX : 0) * b.r * 0.4, hy = b.y + (ang ? LY : -0.3) * b.r * 0.4;
            const g = c.createRadialGradient(hx, hy, 0, b.x, b.y, b.r);
            g.addColorStop(0, css(mul(bc, 1.25))); g.addColorStop(0.7, css(bc)); g.addColorStop(1, css(mul(bc, 0.55)));
            c.fillStyle = g; c.fill();
            if (p.glow > 0) { c.fillStyle = css(E2, p.glow * 0.5); c.beginPath(); c.arc(b.x, b.y, b.r * 0.45, 0, TAU); c.fill(); }
            c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(hx - b.r * 0.1, hy - b.r * 0.1, b.r * 0.18, 0, TAU); c.fill();
          }
          return;
        }
        c.save();
        if (e.type === 'blossom') {
          c.translate(e.x, e.y); c.rotate(e.tilt); c.scale(1, e.sq); c.rotate(e.rot);
          const r = e.r;
          c.beginPath();
          for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU, cx = Math.cos(a) * r * 0.5, cy = Math.sin(a) * r * 0.5; c.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5); c.ellipse(cx, cy, r * 0.5, r * 0.36, a, 0, TAU); }
          if (md === 'leaf') { c.fillStyle = '#fff'; c.fill(); c.restore(); return; }
          if (md === 'transl') { c.fillStyle = gray(0.9); c.fill(); c.restore(); return; }
          if (md === 'height') { const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, gray(hz + 0.02)); g.addColorStop(1, gray(hz + 0.06)); c.fillStyle = g; c.fill(); c.restore(); return; }
          const pc = mul(E1, (0.92 + 0.12 * e.k) * itemAO(e.x, e.y));
          if (toon) { c.fillStyle = css(pc); c.fill(); if (p.outline > 0) { c.lineWidth = olw / Math.max(0.5, e.sq); c.strokeStyle = OUT; c.stroke(); } }
          else { const g = c.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, css(mix(pc, E2, 0.35))); g.addColorStop(0.35, css(pc)); g.addColorStop(1, css(mix(pc, [255, 255, 255], 0.25))); c.fillStyle = g; c.fill(); }
          c.fillStyle = css(E2); c.beginPath(); c.arc(0, 0, r * 0.16, 0, TAU); c.fill();
          c.fillStyle = css(mix(E2, [255, 230, 120], 0.6));
          for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU + e.k; c.beginPath(); c.arc(Math.cos(a) * r * 0.26, Math.sin(a) * r * 0.26, Math.max(0.4, r * 0.045), 0, TAU); c.fill(); }
        } else if (e.type === 'cone') {
          c.translate(e.x, e.y); c.rotate(e.a);
          const l = e.l, w = l * 0.24;
          c.beginPath(); c.ellipse(l * 0.52, 0, l * 0.5, w, 0, 0, TAU);
          if (md === 'leaf' || md === 'transl') { c.fillStyle = '#000'; c.fill(); c.restore(); return; }
          if (md === 'height') { const g = c.createLinearGradient(0, -w, 0, w); g.addColorStop(0, gray(hz - 0.04)); g.addColorStop(0.5, gray(hz + 0.08)); g.addColorStop(1, gray(hz - 0.04)); c.fillStyle = g; c.fill(); c.restore(); return; }
          c.fillStyle = css(mul(E1, toon ? 1 : 0.6)); c.fill();
          if (toon && p.outline > 0) { c.lineWidth = olw; c.strokeStyle = OUT; c.stroke(); }
          const rows = 7;
          for (let r = 0; r < rows; r++) {
            const x = l * (0.12 + 0.8 * (r / (rows - 1))), hw = w * Math.sqrt(Math.max(0, 1 - Math.pow((x - l * 0.52) / (l * 0.5), 2)));
            const cols = 3, sc = l * 0.075;
            for (let k = 0; k < cols; k++) {
              const y = (k - (cols - 1) / 2 + (r % 2 ? 0.5 : 0) * 0.6) * hw * 0.62;
              if (Math.abs(y) > hw * 0.9) continue;
              c.beginPath(); c.ellipse(x, y, sc, Math.min(hw * 0.4, sc * 1.2), 0, 0, TAU);
              c.fillStyle = css(toon ? mix(E1, E2, 0.5) : mix(E1, E2, 0.15 + 0.5 * (1 - Math.abs(y) / (hw + 1e-6))));
              c.fill();
              c.fillStyle = css(mul(E1, 0.45)); c.fillRect(x - sc * 1.05, y - sc * 0.15, sc * 0.35, sc * 0.3);
            }
          }
        } else if (e.type === 'catkin') {
          const nb = 12;
          for (let i = 0; i < nb; i++) {
            const t = i / (nb - 1), a = e.a + e.cv * t, x = e.x + Math.cos(a) * e.l * t, y = e.y + Math.sin(a) * e.l * t, r = e.l * 0.075 * (0.7 + 0.6 * Math.sin(PI * Math.min(1, t * 1.2 + 0.1)));
            c.beginPath(); c.arc(x, y, r, 0, TAU);
            if (md === 'leaf' || md === 'transl') c.fillStyle = gray(md === 'leaf' ? 0.35 : 0.1);
            else if (md === 'height') c.fillStyle = gray(hz + 0.03);
            else { const cc = mix(E1, E2, t * 0.7); c.fillStyle = css(toon ? cc : mul(cc, 0.75 + 0.3 * ((i * 7) % 3) / 2)); }
            c.fill();
          }
        }
        c.restore();
      };

      let itemAO = () => 1; // per-item share of the ambient occlusion (set before the color pass)
      const drawScene = (c, md) => {
        for (const it of items) {
          if (it.kind === 0) drawAxis(c, it.o, md);
          else if (it.kind === 1) drawLeaf(c, it.o, md);
          else drawExtra(c, it.o, md);
        }
      };

      /* ---------- grayscale passes ---------- */
      if (mode !== 'color') {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        drawScene(ctx, mode);
        return;
      }

      /* ---------- ambient occlusion field ----------
         On a fixed low-res grid (~320 px, so every export size looks the same), from a height pass
         (leaves behind other leaves) and its coverage (dense inner parts of the branch). Leaves, stems
         and extras take most of it as one value each (clean shading, no smudges), the rest is applied
         per pixel for soft contact shading. */
      const hard = p.alphaEdge === 'hard', cut = p.cutoff * 255, N = W * H;
      let occ = null, lw = 0, lh = 0;
      if (p.ao > 0 && p.output !== 'mask') {
        const f = Math.max(1, S / 320), lS = Math.min(W, H) / f;
        lw = Math.max(1, Math.round(W / f)); lh = Math.max(1, Math.round(H / f));
        const LN = lw * lh, hc = U.canvas(lw, lh), hx = hc.getContext('2d');
        hx.scale(lw / W, lh / H);
        drawScene(hx, 'height');
        const hd = hx.getImageData(0, 0, lw, lh).data, h = new Float32Array(LN), cov = new Float32Array(LN);
        for (let i = 0, k = 0; i < LN; i++, k += 4) { cov[i] = hd[k + 3] / 255; h[i] = (hd[k] / 255) * cov[i]; }
        const b1 = Float32Array.from(h);
        blur(b1, lw, lh, Math.max(1, Math.round(lS * 0.012 * (0.5 + p.aoSpread))));
        blur(cov, lw, lh, Math.max(1, Math.round(lS * 0.045 * (0.4 + p.aoSpread))));
        const aoK = p.ao * (toon ? 0.6 : 1), w2 = 0.45 * (0.5 + p.aoSpread);
        occ = new Float32Array(LN);
        for (let i = 0; i < LN; i++) occ[i] = aoK * (0.6 * clamp((b1[i] - h[i]) / 0.1) + w2 * smoothstep(0.2, 0.85, cov[i]));
      }
      const occAt = (x, y) => {
        const fx = clamp((x * lw) / W - 0.5, 0, lw - 1), fy = clamp((y * lh) / H - 0.5, 0, lh - 1), x0 = fx | 0, y0 = fy | 0, x1 = Math.min(lw - 1, x0 + 1), y1 = Math.min(lh - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
        return lerp(lerp(occ[y0 * lw + x0], occ[y0 * lw + x1], tx), lerp(occ[y1 * lw + x0], occ[y1 * lw + x1], tx), ty);
      };
      itemAO = occ ? (x, y) => 1 - 0.7 * occAt(x, y) : () => 1;

      /* ---------- color pass ---------- */
      ctx.clearRect(0, 0, W, H);
      drawScene(ctx, 'color');
      const img = ctx.getImageData(0, 0, W, H), d = img.data;
      if (p.output === 'mask') {
        for (let i = 0, k = 0; i < N; i++, k += 4) { const a = hard ? (d[k + 3] >= cut ? 255 : 0) : d[k + 3]; d[k] = d[k + 1] = d[k + 2] = a; d[k + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        return;
      }
      if (occ) { // the per-pixel share, bilinear upsampled
        const sx = lw / W, sy = lh / H, X0 = new Int32Array(W), X1 = new Int32Array(W), TX = new Float32Array(W);
        for (let x = 0; x < W; x++) { const fx = clamp((x + 0.5) * sx - 0.5, 0, lw - 1); X0[x] = fx | 0; X1[x] = Math.min(lw - 1, X0[x] + 1); TX[x] = fx - X0[x]; }
        for (let y = 0, k = 0; y < H; y++) {
          const fy = clamp((y + 0.5) * sy - 0.5, 0, lh - 1), y0 = fy | 0, y1 = Math.min(lh - 1, y0 + 1), ty = fy - y0, r0 = y0 * lw, r1 = y1 * lw;
          for (let x = 0; x < W; x++, k += 4) {
            if (!d[k + 3]) continue;
            const tx = TX[x], a = occ[r0 + X0[x]] + (occ[r0 + X1[x]] - occ[r0 + X0[x]]) * tx, b = occ[r1 + X0[x]] + (occ[r1 + X1[x]] - occ[r1 + X0[x]]) * tx;
            const fo = 1 - 0.3 * (a + (b - a) * ty);
            d[k] *= fo; d[k + 1] *= fo; d[k + 2] *= fo;
          }
        }
      }
      if (hard || p.output === 'rgb') for (let k = 3; k < d.length; k += 4) d[k] = d[k] >= cut ? 255 : 0;
      if (p.dilate) dilate(d, W, H);
      if (p.output === 'rgb') for (let k = 0; k < d.length; k += 4) { if (!p.dilate && !d[k + 3]) d[k] = d[k + 1] = d[k + 2] = 0; d[k + 3] = 255; }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
