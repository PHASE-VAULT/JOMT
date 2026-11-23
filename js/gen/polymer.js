/* Polymer: tileable hard rubber, PVC and polymer surfaces for gun parts, attachments and gear. A molded
   texture (smooth, sand / EDM grain, pebble or haircell grain, stippling, aggressive granular grip,
   checkering, ribs, hex, carbon-fiber twill) builds a height buffer plus a tone and roughness pattern; a
   fine molded grain and glass-fiber flow marks lie over it. Wear works like on real plastic: high spots
   are polished glossy by handling, scratches and scuffs whiten (stress whitening) and turn matte, oily
   smudges make a matte surface glossier, dust collects in the cavities, sun fading turns it chalky and an
   optional paint coat chips off the edges down to the base polymer. All noise uses whole periods and the
   splatted stipples / grains wrap, so everything tiles. The color output is a flat albedo with optional AO
   and soft relief shading; the height map drives the normal map mode and the own Roughness detail source
   (white = rough) gives an exact smoothness map. Non-metal throughout. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;

  // polymer colors: [color, shade color]
  const COLORS = {
    black: ['#2c2d30', '#0f1012'], fde: ['#8c7858', '#5a4a34'], coyote: ['#77604a', '#47372a'], tan: ['#b19c78', '#7a6a50'],
    odgreen: ['#545a40', '#2e3322'], ranger: ['#3f4a3b', '#212a20'], grey: ['#5e6163', '#333638'], orange: ['#d9661c', '#923c0c'],
    red: ['#b5322a', '#6e1a15'], blue: ['#2f63a8', '#1a3a68'], white: ['#d8d7d1', '#a2a19b'], carbon: ['#3a3c40', '#0b0b0c'],
  };
  // material: [base roughness, fine grain]
  const MATS = { nylon: [0.55, 0.35], pvc: [0.4, 0.15], abs: [0.32, 0.12], rubber: [0.78, 0.5], softtouch: [0.86, 0.25], composite: [0.18, 0] };
  // a sensible pattern scale per texture (set when the texture changes)
  const CELLS = { leather: 36, stipple: 40, granular: 34, checker: 20, ribs: 16, hex: 14, carbon: 16 };

  /* tileable value-noise lattice nx × ny (texture units, wraps) */
  function lat(nx, ny, seed) {
    nx = Math.max(1, Math.round(nx)); ny = Math.max(1, Math.round(ny));
    const t = new Float32Array(nx * ny);
    for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k++) t[k] = U.hash(i, j, seed);
    return { nx, ny, t };
  }
  // whole W × H field of a lattice, added with weight w; tr: the lattice's x axis runs down the image
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
  // fractal field: octaves double, capped near the pixel size (so preview and export match); 0..1
  function fbmField(W, H, nx, ny, oct, gain, seed, cap, tr) {
    const out = new Float32Array(W * H), ls = [];
    let a = 1, n = 0;
    for (let k = 0; k < oct; k++) { const f = 1 << k; if (k && Math.max(nx, ny) * f > cap) break; ls.push([lat(nx * f, ny * f, seed + k * 131), a]); n += a; a *= gain; }
    for (const [L, w] of ls) addField(out, L, W, H, w / n, tr);
    return out;
  }

  // separable box blur with wrap, run twice ≈ tent; r in px; returns a new array
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

  /* round splat with wrap: fn(k, q, dx, dy) for every pixel within q = dist / r < qmax */
  function splat(W, H, cx, cy, r, qmax, fn) {
    const R = r * qmax, y0 = Math.floor(cy - R), y1 = Math.ceil(cy + R), x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), ir = 1 / r;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      let wy = y % H; if (wy < 0) wy += H;
      const row = wy * W;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, q = Math.sqrt(dx * dx + dy * dy) * ir;
        if (q >= qmax) continue;
        let wx = x % W; if (wx < 0) wx += W;
        fn(row + wx, q, dx * ir, dy * ir);
      }
    }
  }

  // stratified random positions (k per lattice cell, in px): even coverage without clumps or bare spots
  function scatter(G, k) {
    const { W, H, cnx, cny, rnd } = G, pts = [];
    for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++) for (let n = 0; n < k; n++) pts.push(((i + rnd()) / cnx) * W, ((j + rnd()) / cny) * H);
    return pts;
  }

  /* textures: each fills G.Hb (relief ≈ 0..1), G.Tn (tone, 1 = the polymer color) and G.Rf (roughness offset) */
  const PAT = {
    smooth(G) { // injection molded: only faint sink marks and waviness
      const { W, H, N, Hb, Tn, seed, cap } = G, c = fbmField(W, H, ...G.per(3), 3, 0.5, seed + 21, cap);
      for (let i = 0; i < N; i++) { Hb[i] = 0.5 + (c[i] - 0.5) * 0.03; Tn[i] = 1 + (c[i] - 0.5) * 0.05; }
    },
    sand(G) { // EDM / sand-blasted mold texture: dense, fine bumps
      const { p, N, Hb, Tn, Rf, seed } = G, a = G.grain(p.grain, seed + 51), b = G.grain(p.grain * 2.3, seed + 52, 1), dp = p.depth;
      for (let i = 0; i < N; i++) {
        const v = smoothstep(0.28, 0.72, a[i] * 0.72 + b[i] * 0.28);
        Hb[i] = 0.5 + (v - 0.5) * 0.35 * dp; Tn[i] = 1 + (v - 0.5) * 0.08; Rf[i] = (0.5 - v) * 0.05;
      }
    },
    leather(G) { // pebble / haircell grain: rounded pebbles between thin creases
      const { p, W, H, Hb, Tn, seed, cnx, cny, warpX, warpY } = G, cw = W / cnx, ch = H / cny, irr = p.irregular * 0.45, dp = p.depth;
      const o = {}, gap = cw * 0.05, dome = cw * 0.32, k = cw * 0.1, gr = G.grain(cnx * 3, seed + 53);
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        U.voro(((x + 0.5) / W) * cnx + warpX[i] * irr, ((y + 0.5) / H) * cny + warpY[i] * irr, cnx, cny, seed + 61, 1, false, cw, ch, k, o);
        const q = clamp((o.es - gap) / dome), h = Math.sqrt(q) * (0.82 + 0.18 * o.id) + (gr[i] - 0.5) * 0.12;
        Hb[i] = 0.3 + h * 0.55 * dp; Tn[i] = 1 + (o.id - 0.5) * 0.06 + (q - 0.8) * 0.06;
      }
    },
    stipple(G) { // hot-iron stippling: overlapping round dimples with slightly raised, melted rims
      const { p, W, H, N, Hb, Tn, Rf, rnd, cnx } = G, cw = W / cnx, pts = scatter(G, 2), irr = p.irregular, dp = p.depth;
      const P = new Float32Array(N), Rm = new Float32Array(N);
      for (let s = 0; s < pts.length; s += 2) {
        const cx = pts[s], cy = pts[s + 1], r = cw * 0.52 * (1 - irr * 0.35 + rnd() * irr * 0.7), d = 0.75 + rnd() * 0.25;
        splat(W, H, cx, cy, r, 1.35, (k, q) => {
          if (q < 1) { const v = d * Math.pow(1 - q * q, 0.7); if (v > P[k]) P[k] = v; }
          const rim = Math.exp(-((q - 1.04) * (q - 1.04)) / 0.016); if (rim > Rm[k]) Rm[k] = rim;
        });
      }
      for (let i = 0; i < N; i++) {
        const pit = P[i], h = 0.62 + Rm[i] * (1 - pit) * 0.12 - pit * 0.6;
        Hb[i] = 0.5 + (h - 0.5) * dp; Tn[i] = 1 - pit * 0.08 + Rm[i] * 0.03; Rf[i] = pit * 0.04;
      }
    },
    granular(G) { // aggressive grip texture: sharp, faceted raised grains
      const { p, W, H, N, Hb, Tn, Rf, rnd, cnx } = G, cw = W / cnx, pts = scatter(G, 3), irr = p.irregular, dp = p.depth, B = new Float32Array(N);
      for (let s = 0; s < pts.length; s += 2) {
        const cx = pts[s], cy = pts[s + 1], r = cw * 0.62 * (1 - irr * 0.4 + rnd() * irr * 0.8), hp = 0.6 + rnd() * 0.4;
        const tx = (rnd() - 0.5) * 0.7, ty = (rnd() - 0.5) * 0.7;
        splat(W, H, cx, cy, r, 1, (k, q, dx, dy) => { const f = 1 - q, v = hp * Math.pow(f, 1.2) + (dx * tx + dy * ty) * f * 0.35; if (v > B[k]) B[k] = v; });
      }
      for (let i = 0; i < N; i++) { const g = B[i]; Hb[i] = 0.15 + g * 0.75 * dp; Tn[i] = 1 + (g - 0.4) * 0.1; Rf[i] = (0.3 - g) * 0.06; }
    },
    checker(G) { // cut checkering: pyramids between V grooves (diamond or square), optional flat tops
      const { p, W, H, Hb, Tn, cnx, cny } = G, dia = p.checkStyle !== 'square', fl = p.flatTop, dp = p.depth, kf = 1 / Math.max(0.05, 1 - fl);
      for (let i = 0, y = 0; y < H; y++) {
        const Y = ((y + 0.5) / H) * cny;
        for (let x = 0; x < W; x++, i++) {
          const X = ((x + 0.5) / W) * cnx, s = dia ? X + Y : X, t = dia ? X - Y : Y;
          const m = Math.max(Math.abs(s - Math.floor(s) - 0.5), Math.abs(t - Math.floor(t) - 0.5)) * 2, h = Math.min(1, (1 - m) * kf);
          Hb[i] = 0.2 + h * 0.65 * dp; Tn[i] = 1 + (h - 0.5) * 0.05;
        }
      }
    },
    ribs(G) { // parallel molded ribs / grooves (rail covers, grips, handguards)
      const { p, W, H, Hb, Tn, cnx, cny } = G, vert = p.orient === 'v', n = vert ? cnx : cny, len = vert ? W : H, cp = len / n, w = p.ribWidth, half = (w * cp) / 2, dp = p.depth;
      const prof = new Float32Array(len), pr = p.ribProfile;
      for (let k = 0; k < len; k++) {
        const f = (((k + 0.5) / len) * n) % 1, d = Math.abs(f - 0.5) / (w / 2), cov = clamp((1 - d) * half + 0.5);
        prof[k] = pr === 'flat' ? clamp((1 - d) / 0.3) * cov : pr === 'tri' ? clamp(1 - d) : Math.sqrt(Math.max(0, 1 - d * d)) * cov;
      }
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) { const h = prof[vert ? x : y]; Hb[i] = 0.2 + h * 0.7 * dp; Tn[i] = 1 + (h - 0.5) * 0.05; }
    },
    hex(G) { // honeycomb: raised hex pads or hex pockets with beveled walls
      const { p, W, H, Hb, Tn, seed, cnx } = G, cw = W / cnx, ny0 = Math.max(2, Math.round(H / (cw * 0.866))), ny = ny0 + (ny0 & 1), ch = H / ny;
      const g = p.gap * cw * 0.5, bev = Math.max(1, cw * 0.07), raised = p.hexMode !== 'recessed', dp = p.depth, o = {};
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        U.voro(((x + 0.5) / W) * cnx, ((y + 0.5) / H) * ny, cnx, ny, seed + 63, 0, true, cw, ch, 0, o);
        const e = smoothstep(g, g + bev, o.e), h = raised ? e : 1 - e;
        Hb[i] = 0.2 + h * 0.7 * dp; Tn[i] = 1 + (h - 0.5) * 0.04 + (o.id - 0.5) * 0.03 * e;
      }
    },
    carbon(G) { // 2×2 twill carbon fiber under clear coat: tows bulge, run both ways and catch the light differently
      const { p, W, H, Hb, Tn, Rf, seed, cap, N } = G, nx = Math.max(4, Math.round(G.cnx / 4) * 4), ny = Math.max(4, Math.round((nx * G.ar) / 4) * 4), dp = p.depth;
      const fh = addField(new Float32Array(N), lat(3, Math.min(ny * 9, cap), seed + 71), W, H, 1, false), fv = addField(new Float32Array(N), lat(3, Math.min(nx * 9, cap), seed + 72), W, H, 1, true);
      for (let i = 0, y = 0; y < H; y++) {
        const Y = ((y + 0.5) / H) * ny, j = Math.floor(Y), fy = Y - j;
        for (let x = 0; x < W; x++, i++) {
          const X = ((x + 0.5) / W) * nx, ii = Math.floor(X), fx = X - ii, k = (((ii - j) % 4) + 4) % 4, warp = k < 2;
          const ac = warp ? fy : fx, al = warp ? (k + fx) / 2 : (3 - k + fy) / 2, across = Math.sqrt(Math.max(0, 1 - (2 * ac - 1) * (2 * ac - 1)));
          const dip = Math.pow(Math.sin(Math.PI * al), 0.35), fib = warp ? fh[i] : fv[i];
          Hb[i] = 0.5 + (across * dip - 0.6) * 0.3 * dp + (fib - 0.5) * 0.02;
          Tn[i] = (warp ? 1.2 : 0.72) * (0.8 + 0.25 * across * dip) + (fib - 0.5) * (warp ? 0.35 : 0.22);
          Rf[i] = (1 - across * dip) * 0.08;
        }
      }
    },
  };

  /* scratches: tapered, slightly curved strokes drawn with wrap into a 0..1 buffer */
  function drawScratches(G, Sc) {
    const { p, W, H, S, rnd } = G, n = Math.round(p.scratches * 200);
    for (let s = 0; s < n; s++) {
      let x = rnd() * W, y = rnd() * H, a = rnd() * TAU;
      const len = S * p.scratchLen * (0.08 + 0.92 * Math.pow(rnd(), 2)) * 0.6, w = Math.max(0.4, S * 0.0011 * (0.5 + rnd()));
      const curv = (rnd() - 0.5) * 0.5, amp = 0.35 + 0.65 * rnd(), steps = Math.max(2, Math.ceil(len / 0.6)), ph = rnd() * 6;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, taper = Math.sqrt(Math.sin(Math.PI * t)), r = w * (0.4 + 0.6 * taper), v = amp * taper * (0.65 + 0.35 * Math.sin(t * 9 + ph));
        splat(W, H, x, y, r + 1, 1, (i, q) => { const c = clamp((r + 0.5) - q * (r + 1)) * v; if (c > Sc[i]) Sc[i] = c; });
        a += curv / steps; x += (Math.cos(a) * len) / steps; y += (Math.sin(a) * len) / steps;
      }
    }
  }

  /* oily fingerprints (ridged ovals, a soft smear when too small to resolve) and wipe marks */
  function drawSmudges(G, Sm) {
    const { p, W, H, S, rnd, seed } = G, nf = Math.round(p.smudges * 7), nw = Math.round(p.smudges * 5), Lq = lat(12, 12, seed + 95);
    const vn = (u, v) => { // point sample of the 12 × 12 lattice
      const x = u * 12, y = v * 12; let i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
      fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); i = U.mod(i, 12); j = U.mod(j, 12);
      const i1 = (i + 1) % 12, r0 = j * 12, r1 = ((j + 1) % 12) * 12, t = Lq.t, a = t[r0 + i] + (t[r0 + i1] - t[r0 + i]) * fx, b = t[r1 + i] + (t[r1 + i1] - t[r1 + i]) * fx;
      return a + (b - a) * fy;
    };
    for (let f = 0; f < nf + nw; f++) {
      const cx = rnd() * W, cy = rnd() * H, rot = rnd() * TAU, cs = Math.cos(rot), sn = Math.sin(rot), fp = f < nf;
      const a = S * (fp ? 0.042 : 0.09) * (0.75 + 0.5 * rnd()), b = a * (fp ? 0.72 : 0.35 + 0.2 * rnd()), str = 0.6 + 0.4 * rnd();
      const rAmp = clamp((a / 16 - 1.2) / 1.5), ox = rnd(), oy = rnd();
      splat(W, H, cx, cy, a, 1, (k, q0, ux, uy) => {
        const la = ux * cs + uy * sn, lb = ((-ux * sn + uy * cs) * a) / b, q = Math.sqrt(la * la + lb * lb);
        if (q >= 1) return;
        let v;
        if (fp) {
          const n = vn(ox + la * 0.3, oy + lb * 0.3), ridge = 0.5 + 0.5 * Math.sin((Math.sqrt(la * la + lb * lb * 1.3) + lb * 0.25 + n * 0.25) * 16 * Math.PI);
          v = (1 - smoothstep(0.55, 1, q)) * lerp(0.55, ridge, rAmp) * smoothstep(0.15, 0.6, n + 0.2);
        } else v = Math.exp(-q * q * 3) * (0.6 + 0.4 * Math.sin(lb * 14 + vn(ox + la, oy) * 4));
        if (v * str > Sm[k]) Sm[k] = v * str;
      });
    }
  }

  /* layers per pixel: albedo (col), roughness (white = rough), final height */
  function composite(G, F) {
    const { p, N, Hb, Tn, Rf, mot } = G, { crest, cav, wearN, fine, flowN, fadeN, scuffN, Sc, Sm, Rr, col } = F;
    const c1 = U.hex(p.color), c0 = U.hex(p.color2), pc = U.hex(p.coatColor), dc = U.hex(p.dustColor);
    const base = p.rough, cv0 = p.colorVar * 0.35, wk = p.wear * 1.6, flow = p.flow, fade = p.fade, scuf = p.scuffs, dust = p.dust;
    const coatOn = p.coat > 0, thP = p.coat * 1.12 - 0.04, cR = p.coatRough;
    for (let i = 0; i < N; i++) {
      const fn = fine[i], cr = crest[i], cv = cav[i], wn = wearN[i];
      let t = Tn[i] + (mot[i] - 0.5) * cv0, rough = base + Rf[i], h = Hb[i];
      if (flowN) { const fl = flowN[i] * flow; t -= fl * 0.07; rough -= fl * 0.12; } // glass-fiber flow lines: darker, glossier swirls
      // handling polish: crests (plus some noise) rubbed glossy, a little lighter
      const ew = wk > 0 ? clamp(smoothstep(0.15, 0.6, cr * 1.4 + (wn - 0.5) * 0.5 + (fn - 0.5) * 0.3) * wk) : 0;
      rough -= ew * 0.4 * rough; t += ew * 0.06;
      const tc = clamp(t, 0, 1.4);
      let r = lerp(c0[0], c1[0], tc), g = lerp(c0[1], c1[1], tc), b = lerp(c0[2], c1[2], tc);
      if (ew > 0) { const l = ew * 10; r += l; g += l; b += l; }
      const sc = Sc[i];
      // paint coat: chips off the edges, scratches and noise, exposing the polymer underneath
      if (coatOn) {
        const e = clamp((wn - 0.5) * 2.4 + 0.5) * 0.85 + cr * 0.9 * (0.5 + p.wear) + (fn - 0.5) * 0.06 + sc * 0.8, pm = 1 - smoothstep(thP - 0.02, thP + 0.02, e);
        if (pm > 0) {
          const l = 0.92 + (t - 1) * 0.7 + (fn - 0.5) * 0.06, rim = 1 - Math.abs(pm - 0.5) * 2, lc = l * (1 - rim * 0.2);
          r = lerp(r, pc[0] * lc, pm); g = lerp(g, pc[1] * lc, pm); b = lerp(b, pc[2] * lc, pm);
          rough = lerp(rough, cR + (fn - 0.5) * 0.08 - ew * 0.2, pm); h += pm * 0.03;
        }
      }
      // sun fading: chalky, lighter, desaturated and rougher in broad patches
      if (fade > 0) {
        const fm = fade * (0.55 + 0.45 * fadeN[i]) * (1 - cv * 0.5), L = 0.3 * r + 0.55 * g + 0.15 * b, tr = L * 0.55 + 95, k = fm * 0.65;
        r = lerp(r, tr + (r - L) * 0.3, k); g = lerp(g, tr + (g - L) * 0.3, k); b = lerp(b, tr + (b - L) * 0.3, k); rough += fm * 0.18;
      }
      // scuffs: abraded patches (mostly on the high spots), lighter and matte
      if (scuf > 0) {
        const sm = clamp(smoothstep(0.55, 0.85, scuffN[i] + cr * 0.35 + (fn - 0.5) * 0.25) * scuf * 1.3);
        if (sm > 0) { const l = sm * 0.3; r = lerp(r, r * 0.7 + 85, l); g = lerp(g, g * 0.7 + 85, l); b = lerp(b, b * 0.7 + 85, l); rough += sm * 0.15; }
      }
      // scratches: stress-whitened lines, rough, shallow grooves
      if (sc > 0) { const l = sc * 0.5; r = lerp(r, r * 0.55 + 120, l); g = lerp(g, g * 0.55 + 120, l); b = lerp(b, b * 0.55 + 120, l); rough += sc * 0.22; h -= sc * 0.025; }
      if (dust > 0) { // dust in the cavities
        const dm = clamp(cv * 1.8 * (0.5 + wn) + (wn - 0.6) * 0.3) * dust;
        r = lerp(r, dc[0], dm * 0.85); g = lerp(g, dc[1], dm * 0.85); b = lerp(b, dc[2], dm * 0.85); rough = lerp(rough, 0.92, dm * 0.85);
      }
      const sm = Sm[i]; // oily fingerprints: slightly darker, glossier on matte polymer
      if (sm > 0) { r *= 1 - sm * 0.15; g *= 1 - sm * 0.15; b *= 1 - sm * 0.14; rough -= sm * 0.3 * rough; }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      Rr[i] = clamp(rough); Hb[i] = h;
    }
  }

  // color output: albedo × AO × soft relief shading (ambient, or from the light angle)
  function shadeOut(G, col, occl, o, flat) {
    const { p, W, H, S, Hb } = G, aoK = flat ? 0 : p.ao * 0.75, shK = flat ? 0 : p.shade, amb = p.lightMode !== 'angled';
    const la = p.lightAngle * RAD, Lx = Math.cos(la) * 0.7071, Ly = Math.sin(la) * 0.7071, Lz = 0.7071, hs = S * 0.012;
    for (let y = 0, i = 0; y < H; y++) {
      const ru = (y ? y - 1 : H - 1) * W, rd = (y + 1 === H ? 0 : y + 1) * W, rc = y * W;
      for (let x = 0; x < W; x++, i++) {
        let f = 1 - occl[i] * aoK;
        if (shK > 0) {
          const gx = (Hb[rc + (x + 1 === W ? 0 : x + 1)] - Hb[rc + (x ? x - 1 : W - 1)]) * 0.5 * hs, gy = (Hb[rd + x] - Hb[ru + x]) * 0.5 * hs;
          const nl = Math.sqrt(gx * gx + gy * gy + 1), nz = 1 / nl;
          f *= amb ? Math.max(0.5, 1 - (1 - nz) * shK * 1.6) : clamp(1 + (((-gx * Lx - gy * Ly) / nl + nz * Lz) / Lz - 1) * shK * 0.9, 0.3, 1.6);
        }
        const k = i * 4;
        o[k] = col[i * 3] * f; o[k + 1] = col[i * 3 + 1] * f; o[k + 2] = col[i * 3 + 2] * f; o[k + 3] = 255;
      }
    }
  }

  const pat = (...ts) => (p) => ts.includes(p.pattern);

  U.register({
    id: 'polymer',
    name: 'Polymer & Hard Rubber',
    desc: 'Tileable PBR polymer, hard rubber and PVC for gun parts, attachments and gear: molded grain, stippling, grip texture, checkering, ribs, hex, carbon fiber, with handling wear, scuffs, dust, fading and paint',
    uses: ['Albedo, height and AO textures for polymer frames, grips, stocks, handguards, magazines, rail covers, holsters, optics armor, cases and other gear; the own roughness source gives an exact smoothness map (non-metal).', 'Training guns, toy-like stylized weapons and sci-fi plastic armor.'],
    tags: ['PBR', 'Texturing', 'Shooter', 'Military'],
    tileable: true,
    heightMap: true,
    mapSources: [['rough', 'Roughness detail']],
    icon: U.icon('<path d="M4 6h15l1 3h-8l-1.5 9.5a1 1 0 0 1-1 .5H6.5a1 1 0 0 1-1-1.2L7 9H4z"/><circle cx="8.4" cy="12" r=".55" fill="currentColor"/><circle cx="9.8" cy="13.6" r=".55" fill="currentColor"/><circle cx="8" cy="15.2" r=".55" fill="currentColor"/><circle cx="9.4" cy="16.8" r=".55" fill="currentColor"/>'),
    params: [
      { type: 'section', label: 'Polymer' },
      { key: 'polyColor', label: 'Color', type: 'select', default: 'black', options: [['black', 'Black'], ['fde', 'Flat dark earth (FDE)'], ['coyote', 'Coyote brown'], ['tan', 'Tan'], ['odgreen', 'OD green'], ['ranger', 'Ranger green'], ['grey', 'Grey'], ['orange', 'Blaze orange (training)'], ['red', 'Red (training)'], ['blue', 'Blue (training)'], ['white', 'White'], ['carbon', 'Carbon black'], ['custom', 'Custom']], apply: (v, p) => { const c = COLORS[v]; if (c) { p.color = c[0]; p.color2 = c[1]; } }, tip: 'Sets the polymer and shade colors' },
      { key: 'color', label: 'Polymer color', type: 'color', default: COLORS.black[0] },
      { key: 'color2', label: 'Shade color', type: 'color', default: COLORS.black[1], tip: 'Darker tone for pits, grooves and variation' },
      { key: 'material', label: 'Material', type: 'select', default: 'nylon', options: [['nylon', 'Polymer (glass-filled nylon)'], ['pvc', 'PVC'], ['abs', 'ABS (semi-gloss)'], ['rubber', 'Hard rubber'], ['softtouch', 'Soft-touch overmold (TPE)'], ['composite', 'Clear-coated composite']], apply: (v, p) => { const m = MATS[v]; if (m) { p.rough = m[0]; p.micro = m[1]; } }, tip: 'Sets the base roughness and the fine molded grain' },
      { key: 'rough', label: 'Base roughness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Roughness of the clean surface: ABS ~0.3, nylon polymer ~0.55, hard rubber ~0.8' },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Broad, cloudy tone variation of the molded part' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Texture' },
      { key: 'pattern', label: 'Texture', type: 'select', default: 'sand', options: [['smooth', 'Smooth molded'], ['sand', 'Molded sand / EDM texture'], ['leather', 'Pebble / haircell grain'], ['stipple', 'Stippling'], ['granular', 'Aggressive grip (granules)'], ['checker', 'Checkering'], ['ribs', 'Ribs / grooves'], ['hex', 'Hex / honeycomb'], ['carbon', 'Carbon fiber (twill)']], apply: (v, p) => { if (CELLS[v]) p.cells = CELLS[v]; } },
      { key: 'grain', label: 'Grain', type: 'int', min: 40, max: 900, default: 260, show: pat('sand'), tip: 'Texture bumps across the texture: higher = finer' },
      { key: 'cells', label: 'Pattern scale', type: 'int', min: 2, max: 120, default: 36, show: (p) => p.pattern in CELLS, tip: 'Pebbles, stipples, grains, pyramids, ribs, hexes or tows across the texture' },
      { key: 'depth', label: 'Relief depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.pattern !== 'smooth' },
      { key: 'irregular', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: pat('leather', 'stipple', 'granular'), tip: 'Size and shape variation' },
      { key: 'checkStyle', label: 'Checkering', type: 'select', default: 'diamond', options: [['diamond', 'Diamond (45°)'], ['square', 'Square']], show: pat('checker') },
      { key: 'flatTop', label: 'Flat tops', type: 'range', min: 0, max: 0.85, step: 0.01, default: 0.15, show: pat('checker'), tip: '0 = sharp pyramids, higher = flat-topped diamonds' },
      { key: 'orient', label: 'Direction', type: 'select', default: 'h', options: [['h', 'Horizontal'], ['v', 'Vertical']], show: pat('ribs') },
      { key: 'ribProfile', label: 'Profile', type: 'select', default: 'round', options: [['round', 'Round'], ['flat', 'Flat with chamfer'], ['tri', 'Triangular (V grooves)']], show: pat('ribs') },
      { key: 'ribWidth', label: 'Rib width', type: 'range', min: 0.15, max: 1, step: 0.01, default: 0.6, show: pat('ribs'), tip: 'Share of each period the rib covers' },
      { key: 'hexMode', label: 'Hexes', type: 'select', default: 'raised', options: [['raised', 'Raised pads'], ['recessed', 'Recessed pockets']], show: pat('hex') },
      { key: 'gap', label: 'Groove width', type: 'range', min: 0.02, max: 0.5, step: 0.01, default: 0.14, show: pat('hex') },
      { key: 'micro', label: 'Fine molded grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Fine mold texture on top of the pattern' },
      { key: 'microScale', label: 'Fine grain scale', type: 'int', min: 100, max: 900, default: 420, show: (p) => p.micro > 0 },
      { key: 'flow', label: 'Flow marks', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Swirling flow lines of glass-filled polymer: slightly darker and glossier' },

      { type: 'section', label: 'Wear' },
      { key: 'wear', label: 'Handling polish', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'High spots and edges rubbed glossy by hands and holsters; chips the paint coat there' },
      { key: 'scratches', label: 'Scratches', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Stress-whitened scratches: lighter and matte' },
      { key: 'scratchLen', label: 'Scratch length', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.3, show: (p) => p.scratches > 0 },
      { key: 'scuffs', label: 'Scuffs', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1, tip: 'Abraded, whitish matte patches, mostly on the high spots' },
      { key: 'smudges', label: 'Fingerprints & smudges', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Oily fingerprints and wipe marks: slightly darker and glossier' },
      { key: 'dust', label: 'Dust', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Dust and grime collecting in pits and grooves' },
      { key: 'dustColor', label: 'Dust color', type: 'color', default: '#8b8272', show: (p) => p.dust > 0 },
      { key: 'fade', label: 'Sun fading', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'UV-faded, chalky polymer: lighter, greyer and rougher in broad patches' },

      { type: 'section', label: 'Paint coat', active: (p) => p.coat > 0 },
      { key: 'coat', label: 'Paint coverage', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Spray paint or coating over the polymer; 1 = fully painted except worn edges' },
      { key: 'coatColor', label: 'Paint color', type: 'color', default: '#a08a66', show: (p) => p.coat > 0 },
      { key: 'coatRough', label: 'Paint roughness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, show: (p) => p.coat > 0 },
      { key: 'chipScale', label: 'Chip scale', type: 'int', min: 2, max: 40, default: 10, show: (p) => p.coat > 0 },

      { type: 'section', label: 'Shading' },
      { key: 'ao', label: 'AO strength', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Ambient occlusion in pits, grooves and between grains' },
      { key: 'shade', label: 'Relief shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Soft shading of the relief baked into the color (0 for a pure albedo)' },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'ambient', options: [['ambient', 'Ambient (soft, no direction)'], ['angled', 'Angled (light angle)']], show: (p) => p.shade > 0, tip: 'Ambient: slopes darken evenly, no direction, good for PBR. Angled: lit from one side' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -135, show: (p) => p.shade > 0 && p.lightMode === 'angled' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color (albedo + AO)'], ['albedo', 'Flat albedo'], ['height', 'Height map'], ['aomap', 'AO map'], ['rough', 'Roughness detail']], tip: 'The smoothness map comes from the mode switch above (source: Roughness detail)' },
    ],
    presets: [
      // gun parts
      { name: 'Black polymer frame', group: 'Gun parts', values: { pattern: 'sand', grain: 380, depth: 0.35, wear: 0.25, scratches: 0.12, dust: 0.1 } },
      { name: 'Stippled pistol grip', group: 'Gun parts', values: { pattern: 'stipple', cells: 46, depth: 0.7, irregular: 0.5, micro: 0.2, wear: 0.35, scratches: 0.05, dust: 0.2 } },
      { name: 'Aggressive grip texture', group: 'Gun parts', values: { pattern: 'granular', cells: 40, depth: 0.75, irregular: 0.6, micro: 0.15, wear: 0.45, scratches: 0.05, dust: 0.25 } },
      { name: 'Checkered grip panel', group: 'Gun parts', values: { pattern: 'checker', cells: 22, depth: 0.7, flatTop: 0.12, micro: 0.25, wear: 0.4, scratches: 0.08, dust: 0.25 } },
      { name: 'FDE polymer furniture', group: 'Gun parts', values: { polyColor: 'fde', color: COLORS.fde[0], color2: COLORS.fde[1], pattern: 'sand', grain: 220, depth: 0.5, wear: 0.2, scratches: 0.15, scuffs: 0.15, dust: 0.2, dustColor: '#6e624f' } },
      { name: 'OD green ribbed handguard', group: 'Gun parts', values: { polyColor: 'odgreen', color: COLORS.odgreen[0], color2: COLORS.odgreen[1], pattern: 'ribs', cells: 14, orient: 'v', ribProfile: 'flat', ribWidth: 0.62, depth: 0.7, micro: 0.4, wear: 0.3, scratches: 0.15, dust: 0.3 } },
      { name: 'Rubber rail cover', group: 'Gun parts', values: { material: 'rubber', rough: 0.78, micro: 0.5, pattern: 'ribs', cells: 10, orient: 'v', ribProfile: 'round', ribWidth: 0.8, depth: 0.8, wear: 0.15, scratches: 0.05, scuffs: 0.2, dust: 0.35 } },
      { name: 'Rubber recoil pad', group: 'Gun parts', values: { material: 'rubber', rough: 0.8, micro: 0.45, pattern: 'leather', cells: 24, depth: 0.7, irregular: 0.6, wear: 0.1, scratches: 0.05, scuffs: 0.25, dust: 0.35 } },
      { name: 'Grey precision stock', group: 'Gun parts', values: { polyColor: 'grey', color: COLORS.grey[0], color2: COLORS.grey[1], pattern: 'sand', grain: 150, depth: 0.55, irregular: 0.5, micro: 0.4, wear: 0.15, scratches: 0.12, dust: 0.15 } },
      { name: 'Carbon fiber handguard', group: 'Gun parts', values: { polyColor: 'carbon', color: COLORS.carbon[0], color2: COLORS.carbon[1], material: 'composite', rough: 0.18, micro: 0, pattern: 'carbon', cells: 16, depth: 0.5, colorVar: 0.1, wear: 0, scratches: 0.12, scuffs: 0, dust: 0.05, smudges: 0.3 } },
      { name: 'Worn polymer (handling polish)', group: 'Gun parts', values: { pattern: 'sand', grain: 300, depth: 0.45, wear: 0.85, scratches: 0.4, scratchLen: 0.35, scuffs: 0.3, smudges: 0.45, dust: 0.3 } },
      { name: 'Rattle-can paint over black', group: 'Gun parts', values: { pattern: 'sand', grain: 280, depth: 0.4, coat: 0.72, coatColor: '#9c8763', coatRough: 0.75, chipScale: 9, wear: 0.6, scratches: 0.3, scuffs: 0.1, dust: 0.2 } },
      // gear
      { name: 'Coyote polymer magazine', group: 'Gear', values: { polyColor: 'coyote', color: COLORS.coyote[0], color2: COLORS.coyote[1], pattern: 'sand', grain: 420, depth: 0.3, wear: 0.4, scratches: 0.3, scuffs: 0.25, dust: 0.25, dustColor: '#7a6e5a' } },
      { name: 'Kydex holster (haircell)', group: 'Gear', values: { material: 'pvc', rough: 0.45, micro: 0.1, pattern: 'leather', cells: 70, depth: 0.35, irregular: 0.35, wear: 0.4, scratches: 0.2, dust: 0.1 } },
      { name: 'Rubber-armored optic', group: 'Gear', values: { material: 'rubber', rough: 0.82, micro: 0.55, pattern: 'leather', cells: 50, depth: 0.45, irregular: 0.5, wear: 0.15, scuffs: 0.2, dust: 0.25, smudges: 0.25 } },
      { name: 'Hard case shell (pebbled)', group: 'Gear', values: { material: 'abs', rough: 0.4, micro: 0.15, pattern: 'leather', cells: 20, depth: 0.45, irregular: 0.6, wear: 0.3, scratches: 0.3, scuffs: 0.35, dust: 0.2 } },
      { name: 'Ranger green hex grip', group: 'Gear', values: { polyColor: 'ranger', color: COLORS.ranger[0], color2: COLORS.ranger[1], material: 'softtouch', rough: 0.86, micro: 0.25, pattern: 'hex', cells: 12, hexMode: 'raised', gap: 0.16, depth: 0.7, wear: 0.25, dust: 0.3 } },
      { name: 'Sun-faded tan polymer', group: 'Gear', values: { polyColor: 'tan', color: COLORS.tan[0], color2: COLORS.tan[1], pattern: 'sand', grain: 240, depth: 0.45, fade: 0.7, wear: 0.25, scratches: 0.3, scuffs: 0.35, dust: 0.45, dustColor: '#9a8e78' } },
      { name: 'Soft-touch overmold', group: 'Gear', values: { material: 'softtouch', rough: 0.86, micro: 0.25, pattern: 'smooth', wear: 0.3, smudges: 0.5, scratches: 0.05, dust: 0.1 } },
      { name: 'Blue training pistol', group: 'Training & sci-fi', values: { polyColor: 'blue', color: COLORS.blue[0], color2: COLORS.blue[1], pattern: 'sand', grain: 320, depth: 0.35, wear: 0.3, scratches: 0.35, scuffs: 0.3, dust: 0.15 } },
      { name: 'Blaze orange training part', group: 'Training & sci-fi', values: { polyColor: 'orange', color: COLORS.orange[0], color2: COLORS.orange[1], material: 'abs', rough: 0.35, micro: 0.12, pattern: 'smooth', wear: 0.2, scratches: 0.3, scuffs: 0.3, dust: 0.2 } },
      { name: 'Sci-fi white armor plastic', group: 'Training & sci-fi', values: { polyColor: 'white', color: COLORS.white[0], color2: COLORS.white[1], material: 'abs', rough: 0.3, micro: 0.1, pattern: 'smooth', colorVar: 0.15, wear: 0.2, scratches: 0.25, scuffs: 0.2, dust: 0.25, dustColor: '#6e6a62' } },
      { name: 'Sci-fi hex panel', group: 'Training & sci-fi', values: { polyColor: 'grey', color: '#4a4e53', color2: '#25282c', material: 'abs', rough: 0.4, micro: 0.15, pattern: 'hex', cells: 8, hexMode: 'recessed', gap: 0.12, depth: 0.8, wear: 0.4, scratches: 0.2, dust: 0.3 } },
    ],

    render(ctx, W, H, p, opts) {
      const src = opts && opts.source, heightOut = !!(opts && opts.height) || (!src && p.output === 'height');
      const outMode = src === 'rough' ? 'rough' : heightOut ? 'height' : p.output;
      const seed = p.seed | 0, ar = H / W, S = Math.min(W, H), N = W * H, cap = S / 1.3, type = PAT[p.pattern] ? p.pattern : 'sand';
      const per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const grain = (n, s, oct = 2) => { const [gx, gy] = per(Math.min(n, cap)); return fbmField(W, H, gx, gy, oct, 0.5, s, cap * 1.6); };
      const [mpx, mpy] = per(3), [cnx, cny] = per(p.cells), [wpx, wpy] = per(Math.max(2, p.cells * 0.35));
      const pf = (px, py, oct, s, sc) => U.coarseField(W, H, sc, (x, y) => U.fractal('perlin', (x / W) * px, (y / H) * py, px, py, oct, 0.55, 'fbm', s));
      const warp = (s) => U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * wpx, (y / H) * wpy, wpx, wpy, 3, 0.5, 'fbm', s) - 0.5);
      const G = {
        p, W, H, N, S, ar, cap, seed, per, grain, cnx, cny, rnd: U.rng(seed * 31 + 5),
        Hb: new Float32Array(N), Tn: new Float32Array(N), Rf: new Float32Array(N),
        mot: pf(mpx, mpy, 4, seed + 3, 96),
        warpX: type === 'leather' ? warp(seed + 11) : null, warpY: type === 'leather' ? warp(seed + 12) : null,
      };
      PAT[type](G);

      // fine molded grain over every texture
      const Hb = G.Hb;
      if (p.micro > 0) {
        const m = grain(p.microScale, seed + 41, 1), k = p.micro;
        for (let i = 0; i < N; i++) { const d = m[i] - 0.5; Hb[i] += d * 0.05 * k; G.Tn[i] += d * 0.06 * k; }
      }

      // crests and cavities from the smoothed height; ambient occlusion from the full one
      const b1 = blurWrap(Hb, W, H, S * 0.003), b2 = blurWrap(Hb, W, H, S * 0.02);
      const crest = new Float32Array(N), cav = new Float32Array(N), occl = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        crest[i] = clamp((b1[i] - b2[i]) * 7); cav[i] = clamp((b2[i] - b1[i]) * 6);
        occl[i] = clamp((b1[i] - Hb[i]) * 3 + (b2[i] - Hb[i]) * 2);
      }

      // overlay fields: wear / chip noise, fine breakup, flow marks, fading, scuffs; scratches and smudges are drawn
      const [npx, npy] = per(Math.max(2, p.chipScale)), [fpx, fpy] = per(2), [spx, spy] = per(7);
      let flowN = null;
      if (p.flow > 0) { // contour bands of a warped noise: swirling flow lines
        flowN = U.coarseField(W, H, 220, (x, y) => {
          const u = x / W, v = y / H, w = U.fractal('perlin', u * fpx, v * fpy, fpx, fpy, 3, 0.5, 'fbm', seed + 87);
          const n = U.fractal('perlin', u * fpx * 2 + w * 1.5, v * fpy * 2 + w * 1.5, fpx * 2, fpy * 2, 2, 0.5, 'fbm', seed + 88);
          return smoothstep(0.55, 1, 0.5 + 0.5 * Math.sin(n * TAU * 7));
        });
      }
      const F = {
        crest, cav, fine: grain(140, seed + 73), flowN,
        wearN: pf(npx, npy, 4, seed + 71, 160),
        fadeN: p.fade > 0 ? pf(fpx, fpy, 4, seed + 81, 96) : null,
        scuffN: p.scuffs > 0 ? pf(spx, spy, 4, seed + 83, 200) : null,
        Sc: new Float32Array(N), Sm: new Float32Array(N), Rr: new Float32Array(N), col: new Float32Array(N * 3),
      };
      if (p.scratches > 0) drawScratches(G, F.Sc);
      if (p.smudges > 0) drawSmudges(G, F.Sm);
      composite(G, F);

      const img = ctx.createImageData(W, H), o = img.data;
      const gray = (arr, k) => { for (let i = 0; i < N; i++) { const g = arr[i] * k; o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = g; o[i * 4 + 3] = 255; } ctx.putImageData(img, 0, 0); };
      if (outMode === 'height') {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < N; i++) { if (Hb[i] < lo) lo = Hb[i]; if (Hb[i] > hi) hi = Hb[i]; }
        const k = hi > lo ? 1 / (hi - lo) : 0;
        for (let i = 0; i < N; i++) Hb[i] = (Hb[i] - lo) * k;
        return gray(Hb, 255);
      }
      if (outMode === 'rough') return gray(F.Rr, 255);
      if (outMode === 'aomap') { for (let i = 0; i < N; i++) occl[i] = 1 - occl[i] * Math.max(0.05, p.ao); return gray(occl, 255); }
      shadeOut(G, F.col, occl, o, outMode === 'albedo');
      ctx.putImageData(img, 0, 0);
    },
  });
})();
