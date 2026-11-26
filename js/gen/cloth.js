/* Cloth: tileable raw fabric surfaces for texturing (no garments), simulated at thread level.
   Woven fabrics use a real weave matrix (plain, basket / oxford, twill 2/2, drill 2/1, denim 3/1,
   herringbone, satin, ripstop): every cell knows which thread lies on top and how long its float runs, so
   threads dip where they cross under; gaps show the crossing thread underneath or open holes. Warp and weft
   carry their own color sequence (solid / two-tone, stripes, pinstripe, gingham, houndstooth, tartan setts
   written like "K4 R24 G24"), so color patterns come out of the weave like on a loom. Yarn detail: twist
   striations (S / Z), slubs (thickness changes along the thread), fiber streaks, hairiness and heather
   (per-thread color variation). Knits: jersey (V stitches), purl, 1×1 and 2×2 rib. Pile and non-wovens:
   velvet (crushed sheen), corduroy (wales), terry loops, felt and fleece (random fibers). Nets: tulle and
   sport mesh with transparent holes. Finishing: wash fade on the crests, pilling, stains, dirt, soft
   creases and a baked directional sheen. Lattices use whole periods and splats wrap, so everything tiles.
   Outputs: color (albedo + AO), flat albedo, height, AO, roughness detail, opacity and thread direction. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;

  // fiber: [base roughness, sheen, hairiness]
  const FIBERS = { cotton: [0.86, 0.15, 0.35], linen: [0.82, 0.2, 0.3], wool: [0.93, 0.1, 0.7], silk: [0.4, 0.85, 0.05], polyester: [0.6, 0.45, 0.1], nylon: [0.52, 0.55, 0.05], jute: [0.95, 0.05, 0.85], acrylic: [0.8, 0.25, 0.5] };
  const setFiber = (v, p) => { const f = FIBERS[v]; if (f) { p.rough = f[0]; p.sheen = f[1]; p.fuzz = f[2]; } };
  // tartan letters
  const TARTAN = { R: '#a8202a', G: '#1f4a2e', B: '#1c2a5a', K: '#151515', W: '#e8e6e0', Y: '#e0b830', N: '#7a7a7a', A: '#5a8ac8', P: '#5a2a6a', O: '#d8701a', T: '#6a4a2a', C: '#8a1428', M: '#2e6a3a', L: '#8ab4e0' };
  const WOVEN = ['plain', 'basket', 'twill', 'drill', 'denim', 'herring', 'satin', 'ripstop'];
  const KNIT = ['jersey', 'purl', 'rib1', 'rib2'];
  // per pattern: [threads / stitches / cells across, gap, flatness]
  const PDEF = {
    plain: [40, 0.06, 0.45], basket: [44, 0.05, 0.5], twill: [48, 0.04, 0.45], drill: [54, 0.04, 0.45], denim: [44, 0.03, 0.5], herring: [48, 0.04, 0.45],
    satin: [72, 0.02, 0.7], ripstop: [64, 0.03, 0.55], jersey: [22], purl: [22], rib1: [24], rib2: [24], velvet: [60], corduroy: [22], terry: [34], felt: [30], fleece: [26], tulle: [18], mesh: [14],
  };
  const isWoven = (p) => WOVEN.includes(p.weave), isKnit = (p) => KNIT.includes(p.weave);
  const hasThreads = (p) => isWoven(p) || isKnit(p);

  /* ---------- shared helpers (tileable lattices, blur, wrapped splats) ---------- */
  function lat(nx, ny, seed) {
    nx = Math.max(1, Math.round(nx)); ny = Math.max(1, Math.round(ny));
    const t = new Float32Array(nx * ny);
    for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k++) t[k] = U.hash(i, j, seed);
    return { nx, ny, t };
  }
  function addField(out, L, W, H, w, tr) {
    const nx = L.nx, ny = L.ny, t = L.t, PW = tr ? H : W, PH = tr ? W : H;
    const i0 = new Int32Array(PW), i1 = new Int32Array(PW), fx = new Float32Array(PW);
    for (let x = 0; x < PW; x++) { const X = ((x + 0.5) / PW) * nx, i = Math.floor(X), f = X - i; fx[x] = f * f * (3 - 2 * f); i0[x] = i % nx; i1[x] = (i + 1) % nx; }
    for (let y = 0; y < PH; y++) {
      const Y = ((y + 0.5) / PH) * ny, j = Math.floor(Y); let f = Y - j; f = f * f * (3 - 2 * f);
      const r0 = (j % ny) * nx, r1 = ((j + 1) % ny) * nx, st = tr ? W : 1, o0 = tr ? y : y * W;
      for (let x = 0, oi = o0; x < PW; x++, oi += st) {
        const a = t[r0 + i0[x]], b = t[r0 + i1[x]], c = t[r1 + i0[x]], d = t[r1 + i1[x]], q = fx[x], top = a + (b - a) * q;
        out[oi] += (top + (c + (d - c) * q - top) * f) * w;
      }
    }
    return out;
  }
  function fbmField(W, H, nx, ny, oct, gain, seed, cap) {
    const out = new Float32Array(W * H), ls = [];
    let a = 1, n = 0;
    for (let k = 0; k < oct; k++) { const f = 1 << k; if (k && Math.max(nx, ny) * f > cap) break; ls.push([lat(nx * f, ny * f, seed + k * 131), a]); n += a; a *= gain; }
    for (const [L, w] of ls) addField(out, L, W, H, w / n, false);
    return out;
  }
  function streaks(W, H, across, cap, seed, tr) {
    const out = new Float32Array(W * H);
    addField(out, lat(3, Math.min(across, cap), seed), W, H, 0.6, tr);
    addField(out, lat(5, Math.min(across * 2.7, cap * 1.6), seed + 1), W, H, 0.4, tr);
    return out;
  }
  function blurWrap(src, W, H, r) {
    const a = Float32Array.from(src);
    r = Math.round(r);
    if (r < 1) return a;
    const tmp = new Float32Array(a.length), inv = 1 / (2 * r + 1);
    const tab = (n) => { const t = new Int32Array(n + 2 * r + 2); for (let i = 0; i < t.length; i++) t[i] = U.mod(i - r - 1, n); return t; };
    const WX = tab(W), WY = tab(H), cs = new Float32Array(W);
    for (let n = 0; n < 2; n++) {
      for (let y = 0; y < H; y++) {
        const o = y * W; let s = 0;
        for (let k = -r; k <= r; k++) s += a[o + WX[k + r + 1]];
        for (let x = 0; x < W; x++) { tmp[o + x] = s * inv; s += a[o + WX[x + 2 * r + 2]] - a[o + WX[x + 1]]; }
      }
      cs.fill(0);
      for (let k = -r; k <= r; k++) { const row = WY[k + r + 1] * W; for (let x = 0; x < W; x++) cs[x] += tmp[row + x]; }
      for (let y = 0; y < H; y++) {
        const o = y * W, ad = WY[y + 2 * r + 2] * W, sb = WY[y + 1] * W;
        for (let x = 0; x < W; x++) { a[o + x] = cs[x] * inv; cs[x] += tmp[ad + x] - tmp[sb + x]; }
      }
    }
    return a;
  }
  function splat(W, H, cx, cy, R, fn) {
    const y0 = Math.floor(cy - R), y1 = Math.ceil(cy + R), x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), R2 = R * R;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      let wy = y % H; if (wy < 0) wy += H;
      const row = wy * W;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy >= R2) continue;
        let wx = x % W; if (wx < 0) wx += W;
        fn(row + wx, dx, dy);
      }
    }
  }
  // wrapped curved stroke (hairs, felt fibers): fn(k, coverage, t along)
  function stroke(W, H, x, y, a, len, w, curl, fn) {
    const steps = Math.max(2, Math.ceil(len / Math.max(0.5, w))), ds = len / steps;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      splat(W, H, x, y, w + 1, (k, dx, dy) => { const c = clamp(w + 0.5 - Math.sqrt(dx * dx + dy * dy)); if (c > 0) fn(k, c, t); });
      a += curl / steps; x += Math.cos(a) * ds; y += Math.sin(a) * ds;
    }
  }
  const gcd = (a, b) => (b ? gcd(b, a % b) : a), lcm = (a, b) => (a / gcd(a, b)) * b;
  const snap = (v, L) => Math.max(L, Math.round(v / L) * L);

  /* ---------- weave matrix (1 = weft, the horizontal thread, on top) with float runs ---------- */
  function weaveDef(type) {
    let rx = 2, ry = 2, f;
    switch (type) {
      case 'basket': rx = ry = 4; f = (c, r) => (((c >> 1) + (r >> 1)) & 1) === 0; break;
      case 'twill': rx = ry = 4; f = (c, r) => U.mod(c - r, 4) < 2; break;
      case 'drill': rx = ry = 3; f = (c, r) => U.mod(c - r, 3) === 0; break; // 2/1 warp-faced
      case 'denim': rx = ry = 4; f = (c, r) => U.mod(c - r, 4) === 0; break; // 3/1 warp-faced, right-hand
      case 'herring': rx = 8; ry = 4; f = (c, r) => (c < 4 ? U.mod(c - r, 4) : U.mod(c + r - 1, 4)) < 2; break;
      case 'satin': rx = ry = 5; f = (c, r) => U.mod(c - 2 * r, 5) === 0; break; // warp-faced 5-end satin
      default: f = (c, r) => ((c + r) & 1) === 0; // plain, ripstop
    }
    const n = rx * ry, m = new Uint8Array(n), st = new Int16Array(n), len = new Int16Array(n);
    for (let r = 0; r < ry; r++) for (let c = 0; c < rx; c++) m[r * rx + c] = f(c, r) ? 1 : 0;
    for (let r = 0; r < ry; r++) for (let c = 0; c < rx; c++) {
      const k = r * rx + c, v = m[k], hz = v === 1, P = hz ? rx : ry;
      const at = (d) => (hz ? m[r * rx + U.mod(c + d, rx)] : m[U.mod(r + d, ry) * rx + c]) === v;
      let b = 0, e = 0;
      while (b < P && at(-b - 1)) b++;
      if (b >= P) { len[k] = 0; continue; }
      while (at(e + 1)) e++;
      st[k] = b; len[k] = b + e + 1;
    }
    return { rx, ry, m, st, len };
  }

  /* ---------- color sequences for warp (vertical threads) and weft (horizontal) ---------- */
  function sett(str) { // "K4 R24 G24" -> symmetric sett, reflected at the pivots
    const seq = [];
    String(str || '').toUpperCase().split(/[\s,]+/).forEach((tok) => {
      const m = /^([A-Z])(\d+)$/.exec(tok) || /^(#[0-9A-F]{6})[:x*]?(\d+)$/.exec(tok);
      if (m) seq.push([TARTAN[m[1]] || m[1], Math.max(1, Math.min(400, +m[2]))]);
    });
    if (!seq.length) return null;
    const out = [], push = ([c, n]) => { const rgb = U.hex(c); for (let i = 0; i < n; i++) out.push(rgb); };
    seq.forEach(push);
    for (let i = seq.length - 2; i > 0; i--) push(seq[i]);
    return out;
  }
  function colorway(p) {
    const c1 = U.hex(p.color), c2 = U.hex(p.color2), c3 = U.hex(p.color3), n = Math.max(1, p.stripe | 0), m = Math.max(1, p.stripe2 | 0);
    const rep = (a, k) => Array.from({ length: k }, () => a);
    switch (p.colorway) {
      case 'stripes': return { wx: rep(c1, n).concat(rep(c3, m)), wy: [c2] };
      case 'pinstripe': return { wx: rep(c1, n).concat(rep(c3, Math.min(m, 3))), wy: [c2] };
      case 'check': { const s = rep(c1, n).concat(rep(c3, m)); return { wx: s, wy: s }; }
      case 'houndstooth': { const s = rep(c1, 4).concat(rep(c3, 4)); return { wx: s, wy: s }; }
      case 'tartan': { const s = sett(p.sett) || [c1]; return { wx: s, wy: s }; }
      default: return { wx: [c1], wy: [c2] };
    }
  }

  /* ---------- patterns: fill G.Hb (relief 0..1), G.Tn (tone, 1 = the thread color), G.Cr/Cg/Cb (thread color),
     G.Rf (roughness offset), G.Dir (thread direction), G.Al (alpha) ---------- */
  function setCol(G, i, c) { G.Cr[i] = c[0]; G.Cg[i] = c[1]; G.Cb[i] = c[2]; }

  function woven(G) {
    const { p, W, H, Hb, Tn, Rf, Dir, Al, seed, cap } = G, type = p.weave;
    const { rx, ry, m, st, len } = weaveDef(type), cwy = colorway(p), Px = cwy.wx.length, Py = cwy.wy.length;
    const nx = snap(p.threads, lcm(rx, Px)), ny = snap(p.threads * G.ar * (p.density || 1), lcm(ry, Py));
    const gap = clamp(p.gap, 0, 0.9), ig = 1 / (1 - gap), fl = 2 + p.flat * 8, ifl = 1 / fl, rip = type === 'ripstop', ripN = Math.max(4, p.ripN | 0);
    const fh = streaks(W, H, ny * 9, cap, seed + 71, false), fv = streaks(W, H, nx * 9, cap, seed + 72, true), fk = 0.15 + 0.4 * p.fiber;
    const tw = p.twist, twk = 2.4, twd = p.twistDir === 'S' ? -1 : 1, slb = p.slub, hv = p.heather * 0.5, sh = p.sheen, sa = p.sheenAngle * RAD, sH = Math.cos(sa) ** 2;
    const slP = (P) => Math.max(1, Math.round(P / 3)); // slub cells per thread length (whole periods)
    const sxP = slP(nx), syP = slP(ny);
    const slub = (s, P, cells, idx, hz) => { const x = (s / P) * cells, i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return lerp(U.hash(U.mod(i, cells), idx * 2 + hz, seed + 91), U.hash(U.mod(i + 1, cells), idx * 2 + hz, seed + 91), u); };
    const wX = G.warpX, wY = G.warpY, irr = p.irregular * 0.3, holes = p.holes;
    const prof = (ac, ws) => { const a = (Math.abs(ac - 0.5) * 2 * ig) / ws; return a >= 1 ? 0 : Math.pow(1 - Math.pow(a, fl), ifl); };
    for (let i = 0, y = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) {
        let X = ((x + 0.5) / W) * nx, Y = ((y + 0.5) / H) * ny;
        if (wX) { X += wX[i] * irr; Y += wY[i] * irr; }
        const ii = Math.floor(X), j = Math.floor(Y), fx = X - ii, fy = Y - j, k = U.mod(j, ry) * rx + U.mod(ii, rx), top = m[k];
        const wi = U.mod(ii, nx), wj = U.mod(j, ny);
        // thread width: ripstop reinforcement threads, slubs
        const wsOf = (hz) => {
          const idx = hz ? wj : wi; let ws = rip && idx % ripN === 0 ? 1 / Math.max(0.1, 1 - gap) * 1.05 : 1;
          if (slb > 0) ws *= 1 + slb * 0.7 * (slub(hz ? X : Y, hz ? nx : ny, hz ? sxP : syP, idx, hz) - 0.5);
          return ws;
        };
        let hz = top, ws = wsOf(hz), pa = prof(hz ? fy : fx, ws), h, lit, low = 0;
        if (pa > 0) {
          let dip = 1;
          if (len[k]) dip = Math.pow(Math.sin((Math.PI * ((top ? fx : fy) + st[k])) / len[k]), 0.4);
          lit = pa * dip; h = 0.4 + 0.6 * pa * (0.45 + 0.55 * dip);
        } else {
          hz = top ? 0 : 1; ws = wsOf(hz); pa = prof(hz ? fy : fx, ws); lit = pa * 0.5; h = pa > 0 ? 0.08 + 0.28 * pa : 0; low = 1;
        }
        const idx = hz ? wj : wi, col = hz ? cwy.wy[wj % Py] : cwy.wx[wi % Px];
        setCol(G, i, col);
        Dir[i] = hz ? 0 : Math.PI / 2;
        if (h <= 0) { Hb[i] = 0; Tn[i] = 0.42; Rf[i] = 0.05; if (holes) Al[i] = 0; continue; }
        if (rip && idx % ripN === 0) h = Math.min(1, h * 1.15 + 0.05);
        // twist: fibers spiral around the yarn, seen as slanted striations across the thread
        const along = hz ? X : Y, acr = ((hz ? fy : fx) - 0.5) * 2;
        const twS = tw > 0 ? (Math.cos(TAU * (along * twk + acr * 0.55 * twd)) * 0.5) * pa : 0;
        const fb = (hz ? fh[i] : fv[i]) - 0.5;
        const sv = 0.5 + ((hz ? sH : 1 - sH) - 0.5) * sh;
        let t = (0.72 + 0.36 * lit) * (1 + (sv - 0.5) * sh * 0.9) + twS * tw * 0.28 + fb * fk + (U.hash(idx, hz, seed + 5) - 0.5) * hv;
        if (low) t *= 0.62;
        Tn[i] = t; Rf[i] = (1 - lit) * 0.04 - sh * lit * 0.1;
        Hb[i] = h + twS * tw * 0.05 + fb * 0.02;
        if (holes && pa < 0.25) Al[i] = smoothstep(0, 0.25, pa);
      }
    }
  }

  function knit(G) { // jersey V stitches, purl bumps, rib columns of both
    const { p, W, H, Hb, Tn, Rf, Dir, seed, cap } = G, type = p.weave;
    const ribN = type === 'rib2' ? 2 : 1, rib = type === 'rib1' || type === 'rib2';
    const cwy = colorway(p), Pc = cwy.wy.length; // knits: the color sequence runs along the courses (striped knit)
    const nx = snap(p.threads, rib ? 2 * ribN : 1), ny = snap(p.threads * G.ar * 1.3 * (p.density || 1), Pc);
    const cw = W / nx, ch = H / ny, asp = ch / cw, tw = p.twist, hv = p.heather * 0.5, wX = G.warpX, wY = G.warpY, irr = p.irregular * 0.25;
    const fine = streaks(W, H, nx * 14, cap, seed + 73, true), tight = 1 - p.gap * 0.8;
    const legA = 24 * RAD, ca = Math.cos(legA), sa = Math.sin(legA);
    // capsule profile: point (u, v) in stitch units (x across, y down, y scaled to x units)
    const leg = (u, v, cx, cy, s) => { // s = ±1: tilt of the leg
      const dx = u - cx, dy = v - cy, al = dx * sa * s + dy * ca, ac = dx * ca - dy * sa * s, L = 0.34 * asp, w = 0.2 * tight;
      const e = Math.max(0, Math.abs(al) - L), d = Math.sqrt(e * e + ac * ac) / w;
      return d >= 1 ? -1 : Math.sqrt(1 - d * d) * (1 - (0.25 * Math.abs(al)) / (L + w));
    };
    for (let i = 0, y = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) {
        let X = ((x + 0.5) / W) * nx, Y = ((y + 0.5) / H) * ny;
        if (wX) { X += wX[i] * irr; Y += wY[i] * irr; }
        const ii = Math.floor(X), jj = Math.floor(Y), fx = X - ii, fy = Y - jj;
        const purlCol = type === 'purl' || (rib && Math.floor(U.mod(ii, nx) / ribN) % 2 === 1);
        let best = -1, dir = Math.PI / 2, rowOf = jj;
        if (!purlCol) { // two legs per stitch, legs reach into the courses above and below
          for (let dj = -1; dj <= 1; dj++) {
            const v = (fy - dj) * asp;
            const hl = leg(fx, v, 0.5 - 0.2, 0.5 * asp, 1), hr = leg(fx, v, 0.5 + 0.2, 0.5 * asp, -1);
            const hh = Math.max(hl, hr) + (dj === -1 ? -0.08 : dj === 1 ? 0.04 : 0); // the stitch below lies on top of the one above
            if (hh > best) { best = hh; dir = Math.PI / 2 + (hl > hr ? -legA : legA); rowOf = jj + dj; }
          }
        } else { // purl: horizontal loop bumps
          for (let dj = -1; dj <= 1; dj++) {
            const v = (fy - dj - 0.5) * asp, u = fx - 0.5, e = Math.max(0, Math.abs(u) - 0.3), d = Math.sqrt(e * e + v * v) / (0.27 * tight * asp);
            const hh = d >= 1 ? -1 : Math.sqrt(1 - d * d) * 0.85 - (rib ? 0.18 : 0);
            if (hh > best) { best = hh; dir = 0; rowOf = jj + dj; }
          }
        }
        const r = U.mod(rowOf, ny), col = cwy.wy[r % Pc];
        setCol(G, i, col);
        Dir[i] = dir;
        if (best < 0) { Hb[i] = rib && purlCol ? 0.02 : 0.05; Tn[i] = 0.4; Rf[i] = 0.04; continue; }
        const along = (dir === 0 ? X : Y) * 3, twS = tw > 0 ? Math.cos(TAU * (along + fx * 1.2)) * 0.5 * best : 0, fb = fine[i] - 0.5;
        Hb[i] = 0.15 + best * 0.85 + twS * tw * 0.05;
        Tn[i] = 0.68 + 0.42 * best + twS * tw * 0.25 + fb * (0.15 + 0.3 * p.fiber) + (U.hash(U.mod(ii, nx), r, seed + 5) - 0.5) * hv;
        Rf[i] = (1 - best) * 0.04;
      }
    }
  }

  const PILE = {
    velvet(G) { // dense cut pile: no visible weave, crushed sheen, fine speckle
      const { p, W, H, N, Hb, Tn, Rf, seed, cap } = G, [cx, cy] = G.per(3), crush = fbmField(W, H, cx, cy, 4, 0.55, seed + 31, cap);
      const sp = fbmField(W, H, ...G.per(Math.min(cap, p.threads * 6)), 1, 0.5, seed + 32, cap * 1.6), c = U.hex(p.color);
      for (let i = 0; i < N; i++) { const cr = crush[i] - 0.5; setCol(G, i, c); Hb[i] = 0.6 + (sp[i] - 0.5) * 0.15 + cr * 0.1; Tn[i] = 0.92 + cr * (0.35 + p.sheen * 0.8) + (sp[i] - 0.5) * 0.12; Rf[i] = -cr * 0.1; }
    },
    corduroy(G) { // wales: rounded pile ribs with cut grooves between them
      const { p, W, H, N, Hb, Tn, Rf, Dir, seed, cap } = G, n = Math.max(2, Math.round(p.threads)), cwy = colorway(p), Px = cwy.wx.length;
      const nn = snap(n, Px), sp = fbmField(W, H, ...G.per(Math.min(cap, nn * 12)), 1, 0.5, seed + 33, cap * 1.6), [cx, cy] = G.per(4), crush = fbmField(W, H, cx, cy, 3, 0.5, seed + 34, cap);
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        const X = ((x + 0.5) / W) * nn, wi = Math.floor(X), f = X - wi, a = Math.abs(f - 0.5) * 2 / (1 - p.gap * 0.8), pr = a >= 1 ? 0 : Math.pow(1 - a * a, 0.6);
        setCol(G, i, cwy.wx[U.mod(wi, nn) % Px]); Dir[i] = Math.PI / 2;
        Hb[i] = 0.1 + pr * 0.8 + (sp[i] - 0.5) * 0.08; Tn[i] = (0.55 + 0.5 * pr) * (1 + (crush[i] - 0.5) * p.sheen * 0.6) + (sp[i] - 0.5) * 0.15; Rf[i] = (1 - pr) * 0.05;
      }
    },
    terry(G) { // towel loops: little rings standing up, seen from above
      const { p, W, H, Hb, Tn, Rf, seed } = G, nx = Math.max(4, Math.round(p.threads)), ny = Math.max(4, Math.round(p.threads * G.ar)), cw = W / nx, ch = H / ny, o = {}, c = U.hex(p.color);
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        U.voro(((x + 0.5) / W) * nx, ((y + 0.5) / H) * ny, nx, ny, seed + 41, 0.8, false, cw, ch, 0, o);
        const rr = o.f1 / (cw * (0.42 + 0.1 * o.id)), ring = Math.exp(-((rr - 0.62) * (rr - 0.62)) / 0.045), cap2 = rr < 1 ? 1 - rr * 0.5 : 0;
        const h = Math.max(ring, cap2 * 0.55) * (0.75 + 0.25 * o.id);
        setCol(G, i, c); Hb[i] = h; Tn[i] = 0.62 + 0.45 * h + (o.id - 0.5) * p.heather * 0.4; Rf[i] = (1 - h) * 0.05;
      }
    },
    felt(G) { fibers(G, 1); },
    fleece(G) { fibers(G, 2); },
  };
  // felt / fleece: many random fibers matted together (fleece: curlier, clumpier, fuzzier)
  function fibers(G, mode) {
    const { p, W, H, N, S, Hb, Tn, Rf, Dir, seed, cap, rnd } = G, c = U.hex(p.color), c2 = U.hex(p.color2);
    const acc = new Float32Array(N), [cx, cy] = G.per(Math.max(2, p.threads * 0.25)), clump = fbmField(W, H, cx, cy, 4, 0.55, seed + 51, cap);
    const n = Math.round((p.threads * p.threads * 9 * (W * H)) / (S * S)) * (mode === 2 ? 1.2 : 1), len0 = (S / p.threads) * (mode === 2 ? 0.8 : 1.4), w = Math.max(0.5, S * 0.0013);
    for (let f = 0; f < n; f++) {
      const x = rnd() * W, y = rnd() * H, a = rnd() * TAU, len = len0 * (0.5 + rnd()), curl = (rnd() - 0.5) * (mode === 2 ? 9 : 2.5), v = 0.5 + rnd() * 0.5;
      stroke(W, H, x, y, a, len, w * (0.7 + rnd() * 0.6), curl, (k, cv) => { acc[k] += cv * v; if (cv > 0.5) Dir[k] = a; });
    }
    let mx = 0;
    for (let i = 0; i < N; i++) if (acc[i] > mx) mx = acc[i];
    const bl = blurWrap(acc, W, H, Math.max(1, S * 0.002)), k = 1 / Math.max(1e-4, mx * 0.6);
    for (let i = 0; i < N; i++) {
      const a = clamp(acc[i] * k), b = clamp(bl[i] * k * 1.4), cl = clump[i] - 0.5;
      const mix = clamp(0.5 + (U.hash(i % 977, (i / 977) | 0, seed) - 0.5) * p.heather);
      G.Cr[i] = lerp(c[0], c2[0], mix * p.heather); G.Cg[i] = lerp(c[1], c2[1], mix * p.heather); G.Cb[i] = lerp(c[2], c2[2], mix * p.heather);
      Hb[i] = 0.35 + b * 0.35 + a * 0.15 + cl * (mode === 2 ? 0.5 : 0.25); Tn[i] = 0.72 + a * 0.25 + cl * 0.25; Rf[i] = (1 - a) * 0.04;
    }
  }
  const NET = {
    tulle(G) { // hexagonal bobbinet: thin threads around hex holes
      const { p, W, H, Hb, Tn, Rf, Al, seed } = G, nx = Math.max(2, Math.round(p.threads)), cw = W / nx, ny0 = Math.max(2, Math.round(H / (cw * 0.866))), ny = ny0 + (ny0 & 1), ch = H / ny;
      const tw = Math.max(0.6, cw * (0.05 + p.gap * 0.3)), o = {}, c = U.hex(p.color);
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        U.voro(((x + 0.5) / W) * nx, ((y + 0.5) / H) * ny, nx, ny, seed + 63, p.irregular * 0.2, true, cw, ch, 0, o);
        const q = o.e / tw, pr = q >= 1 ? 0 : Math.sqrt(1 - q * q);
        setCol(G, i, c); Hb[i] = pr; Tn[i] = 0.7 + 0.4 * pr; Rf[i] = 0;
        if (p.holes) Al[i] = smoothstep(0, 0.35, pr);
        else if (pr <= 0) Tn[i] = 0.3;
      }
    },
    mesh(G) { // sport / air mesh: fine knit with round holes in a hex layout
      const { p, W, H, Hb, Tn, Rf, Al, seed, cap } = G, nx = Math.max(2, Math.round(p.threads)), cw = W / nx, ny0 = Math.max(2, Math.round(H / (cw * 0.866))), ny = ny0 + (ny0 & 1), ch = H / ny;
      const hr = cw * (0.18 + p.gap * 0.5), o = {}, c = U.hex(p.color), fine = fbmField(W, H, ...G.per(Math.min(cap, nx * 10)), 2, 0.5, seed + 65, cap * 1.6);
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        U.voro(((x + 0.5) / W) * nx, ((y + 0.5) / H) * ny, nx, ny, seed + 64, 0, true, cw, ch, 0, o);
        const e = smoothstep(hr - 1, hr + cw * 0.12, o.f1), rim = Math.exp(-((o.f1 - hr * 1.15) ** 2) / ((cw * 0.06) ** 2));
        setCol(G, i, c); Hb[i] = e * (0.6 + (fine[i] - 0.5) * 0.2) + rim * 0.2; Tn[i] = 0.75 + 0.3 * e + (fine[i] - 0.5) * 0.25 + rim * 0.08; Rf[i] = 0;
        if (p.holes) Al[i] = smoothstep(0, 0.3, e); else if (e < 0.05) Tn[i] = 0.3;
      }
    },
  };

  /* hairs on top of the fabric (hairiness / fuzz), and pills */
  function drawFuzz(G, Hr, Pl) {
    const { p, W, H, S, rnd } = G;
    const n = Math.round(p.fuzz * p.fuzz * 0.006 * W * H / Math.max(1, S / 512)), w = Math.max(0.35, S * 0.0007);
    for (let s = 0; s < n; s++) {
      const len = S * (0.006 + 0.022 * rnd()) * (0.5 + p.fuzz), v = 0.35 + 0.65 * rnd();
      stroke(W, H, rnd() * W, rnd() * H, rnd() * TAU, len, w, (rnd() - 0.5) * 3, (k, c, t) => { const a = c * v * Math.sin(Math.PI * t); if (a > Hr[k]) Hr[k] = a; });
    }
    const np = Math.round(p.pilling * 0.0005 * W * H / Math.max(1, (S / 512) ** 2) * 2);
    for (let s = 0; s < np; s++) {
      const cx = rnd() * W, cy = rnd() * H, r = S * (0.003 + 0.005 * rnd());
      splat(W, H, cx, cy, r * 1.6, (k, dx, dy) => { const q = Math.sqrt(dx * dx + dy * dy) / r, v = q < 1 ? Math.sqrt(1 - q * q) : Math.exp(-(q - 1) * 4) * 0.3; if (v > Pl[k]) Pl[k] = v; });
    }
  }

  // color output: albedo × AO × soft relief shading
  function shadeOut(G, col, occl, o, flat) {
    const { p, W, H, S, Hb, Al } = G, aoK = flat ? 0 : p.ao * 0.75, shK = flat ? 0 : p.shade, hs = S * 0.006;
    for (let y = 0, i = 0; y < H; y++) {
      const ru = (y ? y - 1 : H - 1) * W, rd = (y + 1 === H ? 0 : y + 1) * W, rc = y * W;
      for (let x = 0; x < W; x++, i++) {
        let f = 1 - occl[i] * aoK;
        if (shK > 0) {
          const gx = (Hb[rc + (x + 1 === W ? 0 : x + 1)] - Hb[rc + (x ? x - 1 : W - 1)]) * 0.5 * hs, gy = (Hb[rd + x] - Hb[ru + x]) * 0.5 * hs;
          f *= Math.max(0.5, 1 - (1 - 1 / Math.sqrt(gx * gx + gy * gy + 1)) * shK * 1.6);
        }
        const k = i * 4;
        o[k] = col[i * 3] * f; o[k + 1] = col[i * 3 + 1] * f; o[k + 2] = col[i * 3 + 2] * f; o[k + 3] = Al[i] * 255;
      }
    }
  }

  const pat = (...ts) => (p) => ts.includes(p.weave);
  const colorwayOn = (p) => isWoven(p) || isKnit(p) || p.weave === 'corduroy';

  U.register({
    id: 'cloth',
    name: 'Cloth & Fabric',
    desc: 'Tileable raw fabric for texturing, simulated thread by thread: canvas, linen, denim, twill, herringbone, satin, ripstop, oxford, tartan, houndstooth, gingham, jersey and rib knits, velvet, corduroy, terry, felt, fleece, tulle and sport mesh',
    uses: ['Albedo, height, roughness, AO, opacity and thread direction maps for cloth materials on characters, props, furniture, flags, bags and gear in 3D games (tile it over any UV layout).', 'Fabric backgrounds and swatches for UI, mock-ups, print and product renders.'],
    tags: ['PBR', 'Texturing'],
    tileable: true,
    heightMap: true,
    metalMap: false,
    mapSources: [['rough', 'Roughness detail']],
    icon: U.icon('<path d="M4 6.5h16M4 10.5h16M4 14.5h16M4 18.5h16" opacity=".45"/><path d="M7 4v16M12 4v16M17 4v16"/><path d="M7 6.5v4M12 10.5v4M17 6.5v4M7 14.5v4M17 14.5v4" stroke-width="2.6"/>'),
    params: [
      { type: 'section', label: 'Fabric' },
      {
        key: 'weave', label: 'Construction', type: 'select', default: 'twill',
        options: [['plain', 'Woven: plain (canvas, linen, poplin)'], ['basket', 'Woven: basket / oxford'], ['twill', 'Woven: twill 2/2'], ['drill', 'Woven: drill / chino 2/1'], ['denim', 'Woven: denim 3/1'], ['herring', 'Woven: herringbone'], ['satin', 'Woven: satin'], ['ripstop', 'Woven: ripstop'], ['jersey', 'Knit: jersey'], ['purl', 'Knit: purl (reverse jersey)'], ['rib1', 'Knit: 1×1 rib'], ['rib2', 'Knit: 2×2 rib'], ['velvet', 'Pile: velvet'], ['corduroy', 'Pile: corduroy'], ['terry', 'Pile: terry (towel)'], ['felt', 'Non-woven: felt'], ['fleece', 'Non-woven: fleece'], ['tulle', 'Net: tulle'], ['mesh', 'Net: sport mesh']],
        apply: (v, p) => { const d = PDEF[v]; if (d) { p.threads = d[0]; if (d.length > 1) { p.gap = d[1]; p.flat = d[2]; } } },
        tip: 'Woven fabrics follow a real weave matrix; knits are built from stitches; pile and non-wovens have no visible threads',
      },
      { key: 'threads', label: 'Threads across', type: 'int', min: 2, max: 400, default: 48, tip: 'Threads, stitches, wales, loops or cells across the texture (rounded so color patterns repeat whole)' },
      { key: 'density', label: 'Weft density', type: 'range', min: 0.5, max: 2, step: 0.01, default: 1, show: hasThreads, tip: 'Horizontal threads (or knit courses) relative to the vertical ones' },
      { key: 'depth', label: 'Relief depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7 },
      { key: 'gap', label: 'Openness', type: 'range', min: 0, max: 0.8, step: 0.01, default: 0.04, tip: 'Gaps between the threads (open weaves: gauze, burlap); knits: looser stitches; nets: thread / hole size' },
      { key: 'flat', label: 'Thread flatness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: isWoven, tip: '0 = round yarns, 1 = flat, pressed threads (filament fabrics)' },
      { key: 'ripN', label: 'Ripstop grid every', type: 'int', min: 4, max: 24, default: 8, show: pat('ripstop'), tip: 'Reinforcement threads every N threads in both directions' },
      { key: 'holes', label: 'Transparent holes', type: 'bool', default: false, tip: 'Open gaps become transparent (alpha) instead of a dark backing' },
      { key: 'irregular', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Threads and stitches wobble like on a real, slightly uneven loom' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Yarn' },
      { key: 'fiberType', label: 'Fiber', type: 'select', default: 'cotton', options: [['cotton', 'Cotton'], ['linen', 'Linen'], ['wool', 'Wool'], ['silk', 'Silk'], ['polyester', 'Polyester'], ['nylon', 'Nylon'], ['jute', 'Jute / hemp'], ['acrylic', 'Acrylic']], apply: setFiber, tip: 'Sets roughness, sheen and hairiness' },
      { key: 'twist', label: 'Twist striations', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: hasThreads, tip: 'Slanted fiber lines of the twisted yarn' },
      { key: 'twistDir', label: 'Twist', type: 'select', default: 'Z', options: [['Z', 'Z twist'], ['S', 'S twist']], show: (p) => isWoven(p) && p.twist > 0 },
      { key: 'slub', label: 'Slubs', type: 'range', min: 0, max: 1, step: 0.01, default: 0.08, show: isWoven, tip: 'Thick and thin spots along the yarn (linen, raw silk, burlap)' },
      { key: 'fiber', label: 'Fiber streaks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Fine filament streaks along the threads' },
      { key: 'heather', label: 'Heather / variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Thread-to-thread color variation (melange, heather, slub yarn). Felt / fleece: mix toward the second color' },
      { key: 'fuzz', label: 'Hairiness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Loose fiber ends sticking out of the yarn' },

      { type: 'section', label: 'Colors' },
      { key: 'colorway', label: 'Color pattern', type: 'select', default: 'solid', options: [['solid', 'Solid / two-tone (warp + weft)'], ['stripes', 'Stripes'], ['pinstripe', 'Pinstripe'], ['check', 'Gingham check'], ['houndstooth', 'Houndstooth'], ['tartan', 'Tartan (sett)']], show: colorwayOn, tip: 'Comes out of the weave like on a loom: warp and weft each carry their color sequence. Knits: stripes run along the courses' },
      { key: 'color', label: 'Main / warp color', type: 'color', default: '#5a6e8a' },
      { key: 'color2', label: 'Weft / second color', type: 'color', default: '#5a6e8a', tip: 'Horizontal threads (two-tone: chambray, denim, iridescent taffeta); felt / fleece: heather mix color' },
      { key: 'color3', label: 'Accent color', type: 'color', default: '#e8e4da', show: (p) => colorwayOn(p) && ['stripes', 'pinstripe', 'check', 'houndstooth'].includes(p.colorway) },
      { key: 'stripe', label: 'Main threads', type: 'int', min: 1, max: 60, default: 8, show: (p) => colorwayOn(p) && ['stripes', 'pinstripe', 'check'].includes(p.colorway), tip: 'Threads of the main color per repeat' },
      { key: 'stripe2', label: 'Accent threads', type: 'int', min: 1, max: 60, default: 8, show: (p) => colorwayOn(p) && ['stripes', 'pinstripe', 'check'].includes(p.colorway), tip: 'Threads of the accent color per repeat (pinstripe: 1–3)' },
      { key: 'sett', label: 'Sett', type: 'text', default: 'B22 K2 B2 K2 B2 K16 G16 K2 G16 K16', show: (p) => colorwayOn(p) && p.colorway === 'tartan', tip: 'Thread counts per color, mirrored at both ends: R red, G green, B blue, K black, W white, Y yellow, N grey, A azure, P purple, O orange, T brown, C crimson, M moss, L light blue, or #rrggbb, e.g. "K4 R24 G24 Y2"' },

      { type: 'section', label: 'Finish & wear' },
      { key: 'rough', label: 'Base roughness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.86 },
      { key: 'sheen', label: 'Sheen', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Glossy fibers catch the light along one direction (satin, silk, nylon, velvet)' },
      { key: 'sheenAngle', label: 'Sheen direction', type: 'range', min: 0, max: 180, step: 1, default: 90, show: (p) => p.sheen > 0 && isWoven(p), tip: '0° = horizontal threads bright, 90° = vertical ones' },
      { key: 'fade', label: 'Wash fade', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Worn, washed-out crests and patches (denim wear)' },
      { key: 'fadeColor', label: 'Faded color', type: 'color', default: '#c8ccd4', show: (p) => p.fade > 0 },
      { key: 'pilling', label: 'Pilling', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Small fuzz balls on worn knits and fleece' },
      { key: 'stains', label: 'Stains', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'stainColor', label: 'Stain color', type: 'color', default: '#6a5a40', show: (p) => p.stains > 0 },
      { key: 'dirt', label: 'Dirt', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Grime settling between the threads' },
      { key: 'creases', label: 'Soft creases', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Gentle, tileable waviness in the height map' },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Broad, cloudy dye variation' },

      { type: 'section', label: 'Shading' },
      { key: 'ao', label: 'AO strength', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55 },
      { key: 'shade', label: 'Relief shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Soft shading of the relief baked into the color (0 for a pure albedo)' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color (albedo + AO)'], ['albedo', 'Flat albedo'], ['height', 'Height map'], ['aomap', 'AO map'], ['rough', 'Roughness detail'], ['opacity', 'Opacity (holes)'], ['tangent', 'Thread direction (anisotropy tangent)']], tip: 'The smoothness map comes from the mode switch above (source: Roughness detail). Thread direction: RG tangent along the threads for anisotropic cloth shaders' },
    ],
    presets: [
      // cotton & linen
      { name: 'Cotton twill', group: 'Cotton & linen', values: {} },
      { name: 'Cotton canvas (duck)', group: 'Cotton & linen', values: { weave: 'plain', threads: 36, color: '#c8b896', color2: '#c4b492', gap: 0.05, flat: 0.35, slub: 0.2, fuzz: 0.4, depth: 0.8 } },
      { name: 'Unbleached muslin', group: 'Cotton & linen', values: { weave: 'plain', threads: 70, color: '#e4dcc8', color2: '#e0d8c2', gap: 0.12, slub: 0.35, fuzz: 0.45, heather: 0.25, depth: 0.5 } },
      { name: 'Linen (slubby)', group: 'Cotton & linen', values: { weave: 'plain', fiberType: 'linen', rough: 0.82, sheen: 0.2, fuzz: 0.3, threads: 48, color: '#cfc4ae', color2: '#c8bca4', gap: 0.08, slub: 0.75, heather: 0.4, irregular: 0.35 } },
      { name: 'Poplin shirting', group: 'Cotton & linen', values: { weave: 'plain', threads: 110, density: 1.6, color: '#f2f2ee', color2: '#f0f0ea', gap: 0.02, flat: 0.6, fuzz: 0.1, depth: 0.4, slub: 0.05 } },
      { name: 'Oxford cloth (blue)', group: 'Cotton & linen', values: { weave: 'basket', threads: 56, color: '#8aa8d0', color2: '#f2f0ea', slub: 0.15, fuzz: 0.25 } },
      { name: 'Chambray', group: 'Cotton & linen', values: { weave: 'plain', threads: 72, color: '#4a6a9a', color2: '#e8e8e4', slub: 0.25, fuzz: 0.2 } },
      { name: 'Raw denim', group: 'Cotton & linen', values: { weave: 'denim', threads: 44, color: '#1f2c4e', color2: '#d8d4c8', slub: 0.45, irregular: 0.3, fuzz: 0.25, heather: 0.25, depth: 0.8 } },
      { name: 'Washed denim', group: 'Cotton & linen', values: { weave: 'denim', threads: 44, color: '#3a5a8a', color2: '#e0ded6', slub: 0.4, irregular: 0.3, fuzz: 0.45, heather: 0.3, fade: 0.55, fadeColor: '#a8bcd4', colorVar: 0.35 } },
      { name: 'Black denim', group: 'Cotton & linen', values: { weave: 'denim', threads: 44, color: '#1c1c20', color2: '#4a4a4e', slub: 0.35, fuzz: 0.3, fade: 0.2, fadeColor: '#5a5a60' } },
      { name: 'Khaki chino (drill)', group: 'Cotton & linen', values: { weave: 'drill', threads: 60, color: '#b4a07a', color2: '#ac9872', fuzz: 0.2, slub: 0.1 } },
      { name: 'Burlap / hessian', group: 'Cotton & linen', values: { weave: 'plain', fiberType: 'jute', rough: 0.95, sheen: 0.05, fuzz: 0.85, threads: 16, color: '#9a7a4e', color2: '#94744a', gap: 0.32, flat: 0.15, slub: 0.85, irregular: 0.55, heather: 0.45, depth: 1, holes: true } },
      { name: 'Cheesecloth / gauze', group: 'Cotton & linen', values: { weave: 'plain', threads: 40, color: '#efe8d8', color2: '#ece4d4', gap: 0.5, flat: 0.1, slub: 0.4, fuzz: 0.5, irregular: 0.4, holes: true, depth: 0.6 } },
      // wool & suiting
      { name: 'Herringbone tweed', group: 'Wool & suiting', values: { weave: 'herring', fiberType: 'wool', rough: 0.93, sheen: 0.1, fuzz: 0.7, threads: 64, color: '#5a5048', color2: '#8a8070', heather: 0.6, slub: 0.3 } },
      { name: 'Houndstooth', group: 'Wool & suiting', values: { weave: 'twill', colorway: 'houndstooth', fiberType: 'wool', rough: 0.93, sheen: 0.1, fuzz: 0.5, threads: 64, color: '#1c1c1e', color3: '#e8e4da' } },
      { name: 'Black Watch tartan', group: 'Wool & suiting', values: { weave: 'twill', colorway: 'tartan', sett: 'B22 K2 B2 K2 B2 K16 G16 K2 G16 K16', fiberType: 'wool', rough: 0.93, sheen: 0.1, fuzz: 0.55, threads: 144, heather: 0.2 } },
      { name: 'Red tartan', group: 'Wool & suiting', values: { weave: 'twill', colorway: 'tartan', sett: 'R32 B8 K2 Y2 K2 W2 K2 R8 K16 W2 G12 R6', fiberType: 'wool', rough: 0.93, sheen: 0.1, fuzz: 0.5, threads: 160, heather: 0.15 } },
      { name: 'Gingham check', group: 'Wool & suiting', values: { weave: 'plain', colorway: 'check', threads: 96, color: '#c8343a', color3: '#f4f2ee', stripe: 8, stripe2: 8, fuzz: 0.15 } },
      { name: 'Pinstripe suiting', group: 'Wool & suiting', values: { weave: 'twill', colorway: 'pinstripe', fiberType: 'wool', rough: 0.9, sheen: 0.2, fuzz: 0.25, threads: 120, color: '#22283a', color2: '#22283a', color3: '#c8ccd8', stripe: 24, stripe2: 1, depth: 0.5 } },
      { name: 'Wool flannel', group: 'Wool & suiting', values: { weave: 'twill', fiberType: 'wool', rough: 0.95, sheen: 0.05, fuzz: 1, threads: 80, color: '#6a6c70', color2: '#6a6c70', heather: 0.55, depth: 0.4, fiber: 0.6 } },
      { name: 'Striped awning canvas', group: 'Wool & suiting', values: { weave: 'plain', colorway: 'stripes', threads: 48, color: '#2a5a8a', color2: '#ece8de', color3: '#ece8de', stripe: 12, stripe2: 12, depth: 0.7 } },
      // synthetics
      { name: 'Ripstop nylon', group: 'Technical & synthetic', values: { weave: 'ripstop', fiberType: 'nylon', rough: 0.52, sheen: 0.55, fuzz: 0.05, threads: 96, ripN: 10, color: '#3e4a36', color2: '#3e4a36', twist: 0.1, slub: 0, depth: 0.55 } },
      { name: 'Cordura / ballistic nylon', group: 'Technical & synthetic', values: { weave: 'basket', fiberType: 'nylon', rough: 0.6, sheen: 0.35, fuzz: 0.1, threads: 40, color: '#2a2c2e', color2: '#2a2c2e', twist: 0.3, slub: 0.05, depth: 0.85 } },
      { name: 'Silk satin', group: 'Technical & synthetic', values: { weave: 'satin', fiberType: 'silk', rough: 0.4, sheen: 0.85, fuzz: 0.05, threads: 120, color: '#8a1e34', color2: '#8a1e34', twist: 0.05, slub: 0, depth: 0.3 } },
      { name: 'Iridescent taffeta', group: 'Technical & synthetic', values: { weave: 'plain', fiberType: 'polyester', rough: 0.5, sheen: 0.7, fuzz: 0.02, threads: 120, color: '#2a6a7a', color2: '#7a2a6a', twist: 0, slub: 0, depth: 0.35 } },
      // knits
      { name: 'Cotton jersey (T-shirt)', group: 'Knits', values: { weave: 'jersey', threads: 26, color: '#e8e6e2', color2: '#e8e6e2', fuzz: 0.3, heather: 0.1 } },
      { name: 'Heather grey jersey', group: 'Knits', values: { weave: 'jersey', threads: 28, color: '#8a8c90', color2: '#8a8c90', heather: 0.8, fuzz: 0.4 } },
      { name: '1×1 rib knit', group: 'Knits', values: { weave: 'rib1', threads: 28, color: '#34446a', color2: '#34446a', fuzz: 0.3 } },
      { name: '2×2 rib cuff', group: 'Knits', values: { weave: 'rib2', threads: 32, color: '#1e1e22', color2: '#1e1e22', fuzz: 0.25, depth: 0.85 } },
      { name: 'Chunky wool knit', group: 'Knits', values: { weave: 'jersey', fiberType: 'wool', rough: 0.95, sheen: 0.05, fuzz: 0.9, threads: 9, color: '#d8ccb4', color2: '#d8ccb4', twist: 0.8, heather: 0.25, irregular: 0.35, depth: 1 } },
      { name: 'Purl knit', group: 'Knits', values: { weave: 'purl', threads: 22, color: '#7a3a2e', color2: '#7a3a2e', fuzz: 0.4 } },
      { name: 'Striped knit', group: 'Knits', values: { weave: 'jersey', colorway: 'stripes', threads: 26, color: '#1e2c4a', color2: '#1e2c4a', color3: '#e8e4da', stripe: 6, stripe2: 6 } },
      { name: 'Pilled old sweater', group: 'Knits', values: { weave: 'jersey', fiberType: 'acrylic', rough: 0.85, sheen: 0.2, fuzz: 0.85, threads: 18, color: '#5a6a4a', color2: '#5a6a4a', pilling: 0.8, heather: 0.3, fade: 0.25, fadeColor: '#8a9a7a' } },
      // pile & non-woven
      { name: 'Velvet', group: 'Pile & non-woven', values: { weave: 'velvet', fiberType: 'polyester', rough: 0.8, sheen: 0.8, fuzz: 0.05, color: '#4a1a3a', color2: '#4a1a3a' } },
      { name: 'Corduroy', group: 'Pile & non-woven', values: { weave: 'corduroy', threads: 22, color: '#8a5a32', color2: '#8a5a32', gap: 0.2, sheen: 0.5, fuzz: 0.2, depth: 0.8 } },
      { name: 'Terry towel', group: 'Pile & non-woven', values: { weave: 'terry', threads: 40, color: '#e8eef0', color2: '#e8eef0', heather: 0.2, fuzz: 0.3, depth: 0.9 } },
      { name: 'Wool felt', group: 'Pile & non-woven', values: { weave: 'felt', fiberType: 'wool', rough: 0.95, sheen: 0.05, fuzz: 0.5, threads: 30, color: '#7a2a24', color2: '#5a1e1a', heather: 0.3, depth: 0.5 } },
      { name: 'Fleece', group: 'Pile & non-woven', values: { weave: 'fleece', fiberType: 'polyester', rough: 0.9, sheen: 0.1, fuzz: 0.8, threads: 26, color: '#3a5a7a', color2: '#2e4a66', heather: 0.25, pilling: 0.3, depth: 0.7 } },
      // nets
      { name: 'Tulle (white)', group: 'Nets & mesh', values: { weave: 'tulle', threads: 18, color: '#f4f2f0', color2: '#f4f2f0', gap: 0.15, holes: true, fuzz: 0.05, depth: 0.6 } },
      { name: 'Sport mesh', group: 'Nets & mesh', values: { weave: 'mesh', fiberType: 'polyester', rough: 0.6, sheen: 0.3, threads: 16, color: '#1e1e22', color2: '#1e1e22', gap: 0.25, holes: true, fuzz: 0.05 } },
    ],

    render(ctx, W, H, p, opts) {
      const src = opts && opts.source, heightOut = !!(opts && opts.height) || (!src && p.output === 'height');
      const outMode = src === 'rough' ? 'rough' : heightOut ? 'height' : p.output;
      const seed = p.seed | 0, ar = H / W, S = Math.min(W, H), N = W * H, cap = S / 1.3, type = p.weave;
      const per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const [mpx, mpy] = per(3), [wpx, wpy] = per(Math.max(2, Math.min(p.threads * 0.25, 40)));
      const pf = (px, py, oct, s, sc) => U.coarseField(W, H, sc, (x, y) => U.fractal('perlin', (x / W) * px, (y / H) * py, px, py, oct, 0.55, 'fbm', s));
      const warp = (s) => U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * wpx, (y / H) * wpy, wpx, wpy, 3, 0.5, 'fbm', s) - 0.5);
      const threaded = WOVEN.includes(type) || KNIT.includes(type);
      const G = {
        p, W, H, N, S, ar, cap, seed, per, rnd: U.rng(seed * 31 + 5),
        Hb: new Float32Array(N), Tn: new Float32Array(N), Rf: new Float32Array(N), Dir: new Float32Array(N), Al: new Float32Array(N).fill(1),
        Cr: new Float32Array(N), Cg: new Float32Array(N), Cb: new Float32Array(N),
        warpX: threaded && p.irregular > 0 ? warp(seed + 11) : null, warpY: threaded && p.irregular > 0 ? warp(seed + 12) : null,
      };
      if (WOVEN.includes(type)) woven(G);
      else if (KNIT.includes(type)) knit(G);
      else if (PILE[type]) PILE[type](G);
      else if (NET[type]) NET[type](G);
      else woven(G);

      const Hb = G.Hb, dp = p.depth;
      for (let i = 0; i < N; i++) Hb[i] = 0.5 + (Hb[i] - 0.5) * dp;
      if (p.creases > 0) { const [cx, cy] = per(2), c = pf(cx, cy, 3, seed + 21, 64); for (let i = 0; i < N; i++) Hb[i] += (c[i] - 0.5) * p.creases * 0.6; }
      const Hr = new Float32Array(N), Pl = new Float32Array(N);
      if (p.fuzz > 0 || p.pilling > 0) drawFuzz(G, Hr, Pl);
      for (let i = 0; i < N; i++) Hb[i] += Hr[i] * 0.06 + Pl[i] * 0.25;

      // crests and cavities; AO
      const cell = S / Math.max(2, p.threads);
      const b1 = blurWrap(Hb, W, H, Math.max(S * 0.0015, cell * 0.05)), b2 = blurWrap(Hb, W, H, Math.max(2, cell * 0.45));
      const crest = new Float32Array(N), cav = new Float32Array(N), occl = new Float32Array(N);
      for (let i = 0; i < N; i++) { crest[i] = clamp((b1[i] - b2[i]) * 6); cav[i] = clamp((b2[i] - b1[i]) * 6); occl[i] = clamp((b1[i] - Hb[i]) * 2.5 + (b2[i] - Hb[i]) * 1.8); }

      // finishing layers
      const mot = pf(mpx, mpy, 4, seed + 3, 96), [fpx, fpy] = per(5), fadeN = p.fade > 0 ? pf(fpx, fpy, 4, seed + 81, 120) : null, [spx, spy] = per(3), stainN = p.stains > 0 ? pf(spx, spy, 5, seed + 85, 160) : null;
      const fc = U.hex(p.fadeColor), sc = U.hex(p.stainColor), cv0 = p.colorVar * 0.3, rough0 = p.rough;
      const col = new Float32Array(N * 3), Rr = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = G.Tn[i] * (1 + (mot[i] - 0.5) * cv0);
        let r = G.Cr[i] * t, g = G.Cg[i] * t, b = G.Cb[i] * t, rough = rough0 + G.Rf[i];
        const hr = Hr[i] + Pl[i] * 0.6;
        if (hr > 0) { const l = Math.min(1, hr) * 0.55; r = lerp(r, G.Cr[i] * 1.12 + 14, l); g = lerp(g, G.Cg[i] * 1.12 + 14, l); b = lerp(b, G.Cb[i] * 1.12 + 14, l); rough += hr * 0.08; }
        if (fadeN) { const fm = clamp((crest[i] * 1.5 + (fadeN[i] - 0.45) * 1.6) * p.fade); r = lerp(r, fc[0] * t, fm); g = lerp(g, fc[1] * t, fm); b = lerp(b, fc[2] * t, fm); }
        if (stainN) { const sm = smoothstep(0.62, 0.72, stainN[i] + (mot[i] - 0.5) * 0.2) * p.stains * 0.7; r *= lerp(1, sc[0] / 255, sm); g *= lerp(1, sc[1] / 255, sm); b *= lerp(1, sc[2] / 255, sm); rough -= sm * 0.1; }
        if (p.dirt > 0) { const dm = clamp(cav[i] * 1.6 + occl[i] * 0.5) * p.dirt * 0.7; r = lerp(r, 70, dm); g = lerp(g, 62, dm); b = lerp(b, 52, dm); rough += dm * 0.05; }
        col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b; Rr[i] = clamp(rough);
      }

      const img = ctx.createImageData(W, H), o = img.data;
      const gray = (arr, k) => { for (let i = 0; i < N; i++) { const v = arr[i] * k; o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = v; o[i * 4 + 3] = 255; } ctx.putImageData(img, 0, 0); };
      if (outMode === 'height') {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < N; i++) { if (Hb[i] < lo) lo = Hb[i]; if (Hb[i] > hi) hi = Hb[i]; }
        const k = hi > lo ? 1 / (hi - lo) : 0;
        for (let i = 0; i < N; i++) Hb[i] = (Hb[i] - lo) * k;
        return gray(Hb, 255);
      }
      if (outMode === 'rough') return gray(Rr, 255);
      if (outMode === 'opacity') return gray(G.Al, 255);
      if (outMode === 'aomap') { for (let i = 0; i < N; i++) occl[i] = 1 - occl[i] * Math.max(0.05, p.ao); return gray(occl, 255); }
      if (outMode === 'tangent') {
        for (let i = 0; i < N; i++) {
          let c = Math.cos(G.Dir[i]), s = -Math.sin(G.Dir[i]);
          if (c < 0 || (c === 0 && s < 0)) { c = -c; s = -s; }
          const k = i * 4; o[k] = (c * 0.5 + 0.5) * 255; o[k + 1] = (s * 0.5 + 0.5) * 255; o[k + 2] = 128; o[k + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return;
      }
      shadeOut(G, col, occl, o, outMode === 'albedo');
      ctx.putImageData(img, 0, 0);
    },
  });
})();
