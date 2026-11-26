/* Carbon & Micro Patterns: tileable PBR composite weaves and fine machined metal patterns.
   Carbon / aramid / glass fabrics are built from a real weave matrix (plain 1×1, basket 2×2, twill 2/2,
   herringbone, 5- and 8-harness satin, spread tow, unidirectional): every cell knows which tow lies on top
   and how long its float runs, so tows dip exactly where they cross under. Tows have an adjustable
   cross-section (round … flat tape), gaps show the crossing tow underneath or an open hole (wire mesh, with
   optional transparency), fiber streaks run along each tow, and a baked anisotropic sheen makes tows
   parallel to the sheen axis light up like real carbon under a light. Forged carbon stacks wrapped, ragged
   chopped flakes in random directions over a Voronoi underlayer. Micro metal patterns: diamond knurl (any
   helix angle), straight knurl, cross-hatch honing, laser-textured dimples, micro hex and waffle grid.
   On top: clear coat (gloss, orange peel), brushed micro grain, polish / abrasion of the crests, scratches,
   scuffs and dust. All lattices use whole periods and splats wrap, so everything tiles. Outputs: color
   (albedo + AO), flat albedo, height, AO, roughness detail, metal mask and a fiber direction (anisotropy
   tangent) map; height, Metal mask and Roughness detail drive the normal / metallic / smoothness modes. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;

  // material: [fiber / metal color, resin / shade color, base roughness, metallic, clear coat, brushed micro grain]
  const MATS = {
    carbon: ['#585c62', '#060708', 0.42, 0, 0.85, 0],
    aramid: ['#e3b745', '#4a360c', 0.5, 0, 0.7, 0],
    glass: ['#dfe4df', '#68736e', 0.45, 0, 0.75, 0],
    bluecarbon: ['#3d74d0', '#04070e', 0.42, 0, 0.85, 0],
    redcarbon: ['#cc3a36', '#0e0303', 0.42, 0, 0.85, 0],
    greencarbon: ['#3fa060', '#030a05', 0.42, 0, 0.85, 0],
    silvercarbon: ['#c3c8ce', '#101215', 0.4, 0, 0.85, 0],
    steel: ['#b4b8bc', '#4a4f55', 0.32, 1, 0, 0.35],
    aluminium: ['#d0d3d6', '#7a8188', 0.3, 1, 0, 0.35],
    titanium: ['#b6b0a7', '#5c574f', 0.34, 1, 0, 0.35],
    brass: ['#d4b26c', '#6c4e1e', 0.3, 1, 0, 0.35],
    copper: ['#c27a52', '#5e2c16', 0.3, 1, 0, 0.35],
    gunmetal: ['#62676d', '#1c1f23', 0.38, 1, 0, 0.3],
    blackoxide: ['#3d3f43', '#0d0e10', 0.45, 1, 0, 0.25],
  };
  const setMat = (v, p) => { const m = MATS[v]; if (m) { p.color = m[0]; p.color2 = m[1]; p.rough = m[2]; p.metal = m[3]; p.coat = m[4]; p.micro = m[5]; } };

  const WEAVE = ['plain', 'basket', 'twill', 'herring', 'satin5', 'satin8', 'spread', 'ud', 'mesh'];
  const METALPAT = ['knurl', 'knurlStraight', 'crosshatch', 'dimples', 'hex', 'waffle', 'mesh'];
  // per pattern: [pattern scale, tow gap, tow flatness] (set when the pattern changes)
  const PDEF = {
    plain: [18, 0.05, 0.35], basket: [20, 0.05, 0.45], twill: [16, 0.05, 0.35], herring: [16, 0.05, 0.35], satin5: [20, 0.04, 0.4],
    satin8: [28, 0.04, 0.4], spread: [6, 0.015, 0.9], ud: [26, 0.03, 0.6], forged: [6], mesh: [24, 0.42, 0],
    knurl: [24], knurlStraight: [40], crosshatch: [70], dimples: [20], hex: [16], waffle: [14],
  };

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
  function fbmField(W, H, nx, ny, oct, gain, seed, cap) {
    const out = new Float32Array(W * H), ls = [];
    let a = 1, n = 0;
    for (let k = 0; k < oct; k++) { const f = 1 << k; if (k && Math.max(nx, ny) * f > cap) break; ls.push([lat(nx * f, ny * f, seed + k * 131), a]); n += a; a *= gain; }
    for (const [L, w] of ls) addField(out, L, W, H, w / n, false);
    return out;
  }
  // streaks along x (or along y with tr): a smooth lattice along the streak, a dense one across it; 0..1
  function streaks(W, H, across, cap, seed, tr) {
    const out = new Float32Array(W * H);
    addField(out, lat(3, Math.min(across, cap), seed), W, H, 0.65, tr);
    addField(out, lat(5, Math.min(across * 2.6, cap * 1.6), seed + 1), W, H, 0.35, tr);
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

  /* splat with wrap: fn(k, dx, dy) (px offsets from the center) for every pixel within radius R */
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

  /* weave matrix rx × ry: m = 1 where the horizontal tow (weft, runs along x) lies on top. For every cell
     the float it belongs to: st = cells of the float before this one, len = float length (0 = endless). */
  function weaveDef(type) {
    let rx = 2, ry = 2, f;
    switch (type) {
      case 'basket': rx = ry = 4; f = (c, r) => (((c >> 1) + (r >> 1)) & 1) === 0; break;
      case 'twill': rx = ry = 4; f = (c, r) => U.mod(c - r, 4) < 2; break;
      case 'herring': rx = 8; ry = 4; f = (c, r) => (c < 4 ? U.mod(c - r, 4) : U.mod(c + r - 1, 4)) < 2; break;
      case 'satin5': rx = ry = 5; f = (c, r) => U.mod(c - 2 * r, 5) !== 0; break;
      case 'satin8': rx = ry = 8; f = (c, r) => U.mod(c - 3 * r, 8) !== 0; break;
      case 'ud': rx = ry = 1; f = () => true; break;
      default: f = (c, r) => ((c + r) & 1) === 0; // plain, spread tow, wire mesh
    }
    const n = rx * ry, m = new Uint8Array(n), st = new Int16Array(n), len = new Int16Array(n);
    for (let r = 0; r < ry; r++) for (let c = 0; c < rx; c++) m[r * rx + c] = f(c, r) ? 1 : 0;
    for (let r = 0; r < ry; r++) for (let c = 0; c < rx; c++) {
      const k = r * rx + c, v = m[k], hz = v === 1, P = hz ? rx : ry;
      const at = (d) => (hz ? m[r * rx + U.mod(c + d, rx)] : m[U.mod(r + d, ry) * rx + c]) === v;
      let b = 0, e = 0;
      while (b < P && at(-b - 1)) b++;
      if (b >= P) { len[k] = 0; continue; } // the tow never dives: endless float
      while (at(e + 1)) e++;
      st[k] = b; len[k] = b + e + 1;
    }
    return { rx, ry, m, st, len };
  }

  /* patterns: each fills G.Hb (relief 0..1), G.Tn (tone, 1 = the main color), G.Rf (roughness offset),
     G.Dir (fiber / grain direction, radians) and, for weaves, G.Tr (tracer tows) and G.Al (alpha) */
  function weave(G, type) {
    const { p, W, H, Hb, Tn, Rf, Dir, Tr, Al, seed, cap } = G;
    const D = weaveDef(type), { rx, ry, m, st, len } = D;
    const nx = Math.max(rx, Math.round(p.cells / rx) * rx), ny = Math.max(ry, Math.round((nx * G.ar) / ry) * ry);
    const ud = type === 'ud', gap = clamp(p.towGap, 0, 0.9), ig = 1 / (1 - gap), fl = 2 + p.towFlat * 8, ifl = 1 / fl, dp = p.depth;
    const fd = Math.round(8 + 14 * p.fiberDetail), fh = streaks(W, H, ny * fd, cap, seed + 71, false), fv = streaks(W, H, nx * fd, cap, seed + 72, true);
    const sa = p.sheenAngle * RAD, sH = Math.cos(sa) * Math.cos(sa), sh = p.sheen, tv = p.towVar * 0.45, trN = p.tracer | 0;
    const fk = 0.2 + 0.55 * p.fiberDetail, wX = G.warpX, wY = G.warpY, irr = p.irregular * 0.35, soft = p.gapAlpha;
    const prof = (ac) => { const a = Math.abs(ac - 0.5) * 2 * ig; return a >= 1 ? 0 : Math.pow(1 - Math.pow(a, fl), ifl); };
    for (let i = 0, y = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) {
        let X = ((x + 0.5) / W) * nx, Y = ((y + 0.5) / H) * ny;
        if (wX) { X += wX[i] * irr; Y += wY[i] * irr; }
        const ii = Math.floor(X), j = Math.floor(Y), fx = X - ii, fy = Y - j, k = U.mod(j, ry) * rx + U.mod(ii, rx), top = m[k];
        let hz = top, pa = prof(top ? fy : fx), h, lit, low = 0;
        if (pa > 0) {
          let dip = 1;
          if (len[k]) dip = Math.pow(Math.sin((Math.PI * ((top ? fx : fy) + st[k])) / len[k]), 0.35);
          else if (ud) dip = 0.92 + 0.08 * Math.sin(fx * Math.PI); // slight waviness of the unidirectional plies
          lit = pa * dip; h = 0.42 + 0.58 * pa * (0.5 + 0.5 * dip);
        } else if (!ud) { // gap beside the top tow: the crossing tow underneath (wire mesh: an open hole where both have gaps)
          hz = top ? 0 : 1; pa = prof(hz ? fy : fx); lit = pa * 0.55; h = pa > 0 ? 0.08 + 0.3 * pa : 0; low = 1;
        } else { lit = 0; h = 0; }
        Dir[i] = hz ? 0 : Math.PI / 2;
        if (h <= 0) { Hb[i] = 0.5 - 0.5 * dp; Tn[i] = 0.05; Rf[i] = 0.08; if (soft) Al[i] = 0; continue; }
        const idx = hz ? U.mod(j, ny) : U.mod(ii, nx), sv = 0.5 + ((hz ? sH : 1 - sH) - 0.5) * sh, fb = (hz ? fh[i] : fv[i]) - 0.5;
        let t = (0.3 + 1.0 * sv) * (0.7 + 0.42 * lit) + fb * fk * (0.4 + sv) + (U.hash(idx, hz, seed + 5) - 0.5) * tv;
        if (low) t *= 0.55;
        Tn[i] = t; Rf[i] = (1 - lit) * 0.06 + Math.abs(fb) * 0.04;
        Hb[i] = 0.5 + (h - 0.5) * dp + fb * 0.015;
        if (trN > 0 && idx % trN === 0) Tr[i] = 1;
        if (soft) Al[i] = smoothstep(0, 0.2, pa);
      }
    }
  }

  const PAT = {
    // forged carbon: chopped tow flakes pressed in random directions; a Voronoi underlayer leaves no hole
    forged(G) {
      const { p, W, H, N, Hb, Tn, Rf, Dir, seed, cnx, cny, rnd } = G, cw = W / cnx, ch = H / cny, irr = p.irregular;
      const Ang = new Float32Array(N), V = new Float32Array(N), E = new Float32Array(N), Lay = new Float32Array(N), Id = new Float32Array(N);
      const o = {};
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        U.voro(((x + 0.5) / W) * cnx * 1.5, ((y + 0.5) / H) * cny * 1.5, Math.round(cnx * 1.5), Math.round(cny * 1.5), seed + 61, 1, false, cw / 1.5, ch / 1.5, 0, o);
        const a = o.id * Math.PI, c = Math.cos(a), s = Math.sin(a), dx = (x + 0.5) - (o.px / Math.round(cnx * 1.5)) * W, dy = (y + 0.5) - (o.py / Math.round(cny * 1.5)) * H;
        Ang[i] = a; V[i] = -dx * s + dy * c; E[i] = o.e; Lay[i] = 0; Id[i] = o.id;
      }
      const pts = [];
      for (let j = 0; j < cny; j++) for (let i = 0; i < cnx; i++) for (let n = 0; n < 4; n++) pts.push(((i + rnd()) / cnx) * W, ((j + rnd()) / cny) * H);
      const nF = pts.length / 2, fl = p.flakeLen, fw = p.flakeWidth;
      for (let f = 0; f < nF; f++) {
        const cx = pts[f * 2], cy = pts[f * 2 + 1], a = rnd() * Math.PI, c = Math.cos(a), s = Math.sin(a), id = rnd();
        const L = cw * fl * (1 - irr * 0.45 + rnd() * irr * 0.9) * 0.5, w = cw * fw * (1 - irr * 0.4 + rnd() * irr * 0.8) * 0.5;
        const ph1 = rnd() * TAU, ph2 = rnd() * TAU, kw = (3 + rnd() * 4) / L, lay = (f + 1) / nF;
        splat(W, H, cx, cy, Math.hypot(L * 1.15, w * 1.2), (k, dx, dy) => {
          const la = dx * c + dy * s, lb = -dx * s + dy * c;
          // ragged sides and frayed ends
          const hw = w * (1 + 0.07 * Math.sin(la * kw + ph1) + 0.03 * Math.sin(la * kw * 3.1 + ph2)), hl = L * (1 - 0.18 * Math.abs(lb) / w + 0.05 * Math.sin((lb / w) * 4 + ph2));
          const e = Math.min(hw - Math.abs(lb), hl - Math.abs(la));
          if (e <= 0) return;
          Ang[k] = a; V[k] = lb; E[k] = e; Lay[k] = lay; Id[k] = id;
        });
      }
      const sa = p.sheenAngle * RAD, sh = p.sheen, pitch = Math.max(0.6, cw * (0.11 - 0.07 * p.fiberDetail)), fk = 0.2 + 0.55 * p.fiberDetail, eb = cw * 0.06, tv = p.towVar * 0.45;
      const f1 = (t, s) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return lerp(U.hash(i, 0, s), U.hash(i + 1, 0, s), u); };
      for (let i = 0; i < N; i++) {
        const a = Ang[i], cs = Math.cos(a - sa), sv = 0.5 + (cs * cs - 0.5) * sh, sd = (Id[i] * 1e6) | 0;
        const fb = (f1(V[i] / pitch, sd) * 0.65 + f1(V[i] / (pitch * 0.4), sd + 1) * 0.35) - 0.5, ed = smoothstep(0, eb, E[i]);
        Tn[i] = (0.35 + 0.85 * sv) * (0.7 + 0.3 * ed) + fb * fk * (0.4 + sv) + (Id[i] - 0.5) * tv;
        Hb[i] = 0.45 + Lay[i] * 0.12 * p.depth + ed * 0.08 * p.depth + fb * 0.01;
        Rf[i] = (1 - ed) * 0.05; Dir[i] = a;
      }
    },
    knurl(G) { // diamond knurl: pyramids between two crossing helix groove sets
      const { p, W, H, Hb, Tn, Rf } = G, nx = Math.max(1, Math.round(p.cells)), ta = Math.tan(clamp(p.knurlAngle, 15, 75) * RAD);
      const ny = Math.max(1, Math.round((nx * G.ar) / ta)), kf = 1 / Math.max(0.05, 1 - p.flatTop);
      for (let i = 0, y = 0; y < H; y++) {
        const Y = ((y + 0.5) / H) * ny;
        for (let x = 0; x < W; x++, i++) {
          const X = ((x + 0.5) / W) * nx, s = X + Y, t = X - Y, ds = s - Math.floor(s) - 0.5, dt = t - Math.floor(t) - 0.5;
          const h = Math.min(1, (1 - Math.max(Math.abs(ds), Math.abs(dt)) * 2) * kf);
          Hb[i] = h; Tn[i] = h >= 1 ? 0.08 : 0; Rf[i] = (1 - h) * 0.08;
        }
      }
    },
    knurlStraight(G) { // straight knurl / serrations: parallel V ridges
      const { p, W, H, Hb, Rf, Dir } = G, vert = p.orient === 'v', n = Math.max(1, Math.round(p.cells)), kf = 1 / Math.max(0.05, 1 - p.flatTop);
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        const q = vert ? ((x + 0.5) / W) * n : ((y + 0.5) / H) * n, h = Math.min(1, (1 - Math.abs(q - Math.floor(q) - 0.5) * 2) * kf);
        Hb[i] = h; Rf[i] = (1 - h) * 0.08; Dir[i] = vert ? Math.PI / 2 : 0;
      }
    },
    crosshatch(G) { // honed cylinder cross-hatch: families of fine grooves at ± the hatch angle on flat plateaus
      const { p, W, H, S, N, Hb, Tn, Rf, Dir, seed, rnd } = G, Gv = new Float32Array(N), fam = 6, irr = p.irregular;
      for (let side = -1; side <= 1; side += 2) for (let f = 0; f < fam; f++) {
        const a = (side * p.hatchAngle + (rnd() - 0.5) * 10 * irr) * RAD, n = p.cells * (0.4 + rnd() * 1.2);
        let px = Math.round(-Math.sin(a) * n * (W / S)), py = Math.round(Math.cos(a) * n * (H / S));
        if (!px && !py) py = 1;
        const sharp = 8 + rnd() * 24, dep = 0.35 + rnd() * 0.65, ph = rnd(), ap = 2 + ((rnd() * 4) | 0);
        const amp = U.coarseField(W, H, 48, (x, y) => U.fractal('perlin', (x / W) * ap, (y / H) * ap, ap, ap, 2, 0.5, 'fbm', seed + side * 50 + f * 7));
        for (let i = 0, y = 0; y < H; y++) {
          const yy = ((y + 0.5) / H) * py + ph;
          for (let x = 0; x < W; x++, i++) {
            const v = 0.5 + 0.5 * Math.cos(TAU * (((x + 0.5) / W) * px + yy)), g = Math.pow(v, sharp) * dep * lerp(1, smoothstep(0.3, 0.7, amp[i]), irr);
            if (g > Gv[i]) Gv[i] = g;
          }
        }
      }
      const da = p.hatchAngle * RAD;
      for (let i = 0; i < N; i++) { const g = Gv[i]; Hb[i] = 1 - g; Tn[i] = -g * 0.15; Rf[i] = g * 0.12; Dir[i] = da; }
    },
    dimples(G) { // laser-textured dimples (or domes with Invert relief), hex or square layout
      const { p, W, H, Hb, Tn, Rf, seed } = G, hex = p.layout !== 'square', nx = Math.max(2, Math.round(p.cells)), cw = W / nx;
      const ny0 = hex ? Math.max(2, Math.round(H / (cw * 0.866))) : Math.max(1, Math.round(nx * G.ar)), ny = hex ? ny0 + (ny0 & 1) : ny0, ch = H / ny;
      const r0 = p.dimpleSize * Math.min(cw, hex ? cw : ch) * 0.5, jit = p.irregular * 0.45, rim = p.rim, o = {};
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        U.voro(((x + 0.5) / W) * nx, ((y + 0.5) / H) * ny, nx, ny, seed + 31, jit, hex, cw, ch, 0, o);
        const r = r0 * (1 - p.irregular * 0.35 * o.id), q = o.f1 / r, rm = rim * Math.exp(-((q - 1.06) * (q - 1.06)) / 0.012);
        const pit = q < 1 ? Math.sqrt(1 - q * q) : 0;
        Hb[i] = 0.8 - pit * 0.75 + rm * 0.2; Tn[i] = rm * 0.1; Rf[i] = pit * 0.1;
      }
    },
    hex(G) { // micro hex: raised hex pads between grooves (Invert relief: hex pockets)
      const { p, W, H, Hb, seed } = G, nx = Math.max(2, Math.round(p.cells)), cw = W / nx, ny0 = Math.max(2, Math.round(H / (cw * 0.866))), ny = ny0 + (ny0 & 1), ch = H / ny;
      const g = p.gap * cw * 0.5, bev = Math.max(1, cw * 0.08), o = {};
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        U.voro(((x + 0.5) / W) * nx, ((y + 0.5) / H) * ny, nx, ny, seed + 63, 0, true, cw, ch, 0, o);
        Hb[i] = smoothstep(g, g + bev, o.e);
      }
    },
    waffle(G) { // waffle grid: square pads between straight grooves (Invert relief: square pockets)
      const { p, W, H, Hb, cnx, cny } = G, cw = W / cnx, ch = H / cny, g = p.gap * Math.min(cw, ch) * 0.5, bev = Math.max(1, Math.min(cw, ch) * 0.08);
      for (let i = 0, y = 0; y < H; y++) {
        const fy = ((y + 0.5) / H) * cny % 1, ey = Math.min(fy, 1 - fy) * ch;
        for (let x = 0; x < W; x++, i++) { const fx = ((x + 0.5) / W) * cnx % 1; Hb[i] = smoothstep(g, g + bev, Math.min(Math.min(fx, 1 - fx) * cw, ey)); }
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
        splat(W, H, x, y, r + 1, (i, dx, dy) => { const c = clamp(r + 0.5 - Math.sqrt(dx * dx + dy * dy)) * v; if (c > Sc[i]) Sc[i] = c; });
        a += curv / steps; x += (Math.cos(a) * len) / steps; y += (Math.sin(a) * len) / steps;
      }
    }
  }

  /* layers per pixel: albedo (col), roughness (white = rough), metal mask, final height */
  function composite(G, F) {
    const { p, N, Hb, Tn, Rf, Tr, mot } = G, { crest, cav, wearN, fine, scuffN, peelN, Sc, Rr, Mm, col } = F;
    const c1 = U.hex(p.color), c0 = U.hex(p.color2), tc = U.hex(p.tracerColor), dc = U.hex(p.dustColor);
    const mt = p.metal, cv0 = p.colorVar * 0.35, wk = p.wear * 1.6, scuf = p.scuffs, dust = p.dust, coat = p.coat, peel = p.peel * coat * 0.05;
    for (let i = 0; i < N; i++) {
      const fn = fine[i], cr = crest[i], cv = cav[i], wn = wearN[i];
      let t = Tn[i] + (mot[i] - 0.5) * cv0, rough = p.rough + Rf[i], h = Hb[i];
      // clear coat: a glossy resin layer that hides most of the fiber roughness
      if (coat > 0) { rough = lerp(rough, p.coatRough + (fn - 0.5) * 0.03, coat); h += (peelN[i] - 0.5) * peel; }
      // crests: metal is polished bright and glossy, a clear coat is abraded matte and hazy
      const ew = wk > 0 ? clamp(smoothstep(0.15, 0.6, cr * 1.4 + (wn - 0.5) * 0.5 + (fn - 0.5) * 0.3) * wk) : 0;
      const tcl = clamp(t, 0, 1.45);
      let r = lerp(c0[0], c1[0], tcl), g = lerp(c0[1], c1[1], tcl), b = lerp(c0[2], c1[2], tcl);
      if (Tr[i]) { const l = lerp(0.12, 1.1, clamp(t / 1.3)); r = tc[0] * l; g = tc[1] * l; b = tc[2] * l; }
      if (ew > 0) {
        const mm = mt, l = ew * (mm * 0.35 + (1 - mm) * 0.1);
        r = lerp(r, Math.min(255, r * 1.2 + 40), l); g = lerp(g, Math.min(255, g * 1.2 + 40), l); b = lerp(b, Math.min(255, b * 1.2 + 40), l);
        rough += ew * (mm * -0.5 * rough + (1 - mm) * 0.3);
      }
      if (scuf > 0) { // scuffs: abraded, hazy matte patches
        const sm = clamp(smoothstep(0.55, 0.85, scuffN[i] + cr * 0.35 + (fn - 0.5) * 0.25) * scuf * 1.3);
        if (sm > 0) { const l = sm * 0.25; r = lerp(r, r * 0.75 + 60, l); g = lerp(g, g * 0.75 + 60, l); b = lerp(b, b * 0.75 + 60, l); rough += sm * 0.25; }
      }
      const sc = Sc[i]; // scratches: whitish in a clear coat, bright in bare metal
      if (sc > 0) {
        const l = sc * 0.55, a = mt * 40 + (1 - mt) * 110, k = mt * 1.15 + (1 - mt) * 0.5;
        r = lerp(r, Math.min(255, r * k + a), l); g = lerp(g, Math.min(255, g * k + a), l); b = lerp(b, Math.min(255, b * k + a), l);
        rough += sc * (0.1 + (1 - mt) * 0.15); h -= sc * 0.02;
      }
      let dm = 0;
      if (dust > 0) { // dust in the cavities
        dm = clamp(cv * 1.8 * (0.5 + wn) + (wn - 0.6) * 0.3) * dust * 0.85;
        r = lerp(r, dc[0], dm); g = lerp(g, dc[1], dm); b = lerp(b, dc[2], dm); rough = lerp(rough, 0.92, dm);
      }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      Rr[i] = clamp(rough); Mm[i] = mt * (1 - dm); Hb[i] = h;
    }
  }

  // color output: albedo × AO × soft relief shading (ambient, or from the light angle)
  function shadeOut(G, col, occl, o, flat) {
    const { p, W, H, S, Hb, Al } = G, aoK = flat ? 0 : p.ao * 0.75, shK = flat ? 0 : p.shade, amb = p.lightMode !== 'angled';
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
        o[k] = col[i * 3] * f; o[k + 1] = col[i * 3 + 1] * f; o[k + 2] = col[i * 3 + 2] * f; o[k + 3] = Al[i] * 255;
      }
    }
  }

  const pat = (...ts) => (p) => ts.includes(p.pattern);
  const isWeave = (p) => WEAVE.includes(p.pattern);
  const isFiber = (p) => isWeave(p) || p.pattern === 'forged';

  U.register({
    id: 'carbon',
    name: 'Carbon & Micro Patterns',
    desc: 'Tileable PBR carbon fiber and micro metal patterns: plain, twill, basket, herringbone, satin, spread tow, unidirectional and forged carbon, aramid and glass fabric, wire mesh, diamond and straight knurling, cross-hatch honing, laser dimples, micro hex and waffle grid',
    uses: ['Albedo, height, roughness, metallic and fiber direction maps for carbon parts (car hoods, spoilers, helmets, handguards, drones, bike frames), knurled grips, machined parts, speaker and wire meshes in 3D games.', 'Backgrounds, product renders and UI materials with a premium carbon or machined-metal look.'],
    tags: ['PBR', 'Texturing', 'Vehicles'],
    tileable: true,
    heightMap: true,
    mapSources: [['metalmask', 'Metal mask'], ['rough', 'Roughness detail']],
    icon: U.icon('<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9.3h5.3V4M14.7 4v5.3H20M9.3 20v-5.3H4M20 14.7h-5.3V20M9.3 9.3h5.4v5.4H9.3z"/>'),
    params: [
      { type: 'section', label: 'Pattern' },
      {
        key: 'pattern', label: 'Pattern', type: 'select', default: 'twill',
        options: [['plain', 'Carbon: plain weave 1×1'], ['basket', 'Carbon: basket weave 2×2'], ['twill', 'Carbon: twill 2/2'], ['herring', 'Carbon: herringbone twill'], ['satin5', 'Carbon: 5-harness satin'], ['satin8', 'Carbon: 8-harness satin'], ['spread', 'Carbon: spread tow (wide tapes)'], ['ud', 'Carbon: unidirectional (UD)'], ['forged', 'Carbon: forged (chopped flakes)'], ['mesh', 'Metal: woven wire mesh'], ['knurl', 'Metal: diamond knurl'], ['knurlStraight', 'Metal: straight knurl'], ['crosshatch', 'Metal: cross-hatch honing'], ['dimples', 'Metal: laser dimples'], ['hex', 'Metal: micro hex'], ['waffle', 'Metal: waffle grid']],
        apply: (v, p) => {
          const d = PDEF[v];
          if (d) { p.cells = d[0]; if (d.length > 1) { p.towGap = d[1]; p.towFlat = d[2]; } }
          const wantMetal = METALPAT.includes(v), m = MATS[p.material];
          if (m && wantMetal !== m[3] > 0) { p.material = wantMetal ? 'steel' : 'carbon'; setMat(p.material, p); }
          if (v === 'mesh') p.gapAlpha = true; else if (WEAVE.includes(v)) p.gapAlpha = false;
        },
        tip: 'Carbon weaves follow a real weave matrix (tows dip where they cross under); metal patterns are fine machined reliefs',
      },
      { key: 'cells', label: 'Pattern scale', type: 'int', min: 2, max: 160, default: 16, tip: 'Tows, flakes, knurl diamonds, ridges, grooves, dimples or cells across the texture: higher = finer' },
      { key: 'depth', label: 'Relief depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6 },
      { key: 'irregular', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, show: (p) => p.pattern !== 'knurl' && p.pattern !== 'knurlStraight' && p.pattern !== 'hex' && p.pattern !== 'waffle', tip: 'Weaves: tows wobble like hand-laid fabric. Forged: flake size variation. Cross-hatch: angle spread and broken grooves. Dimples: position and size jitter' },
      { key: 'towGap', label: 'Tow gap', type: 'range', min: 0, max: 0.8, step: 0.01, default: 0.05, show: isWeave, tip: 'Gap between neighbouring tows: resin shows, or the tow underneath; large gaps open holes (wire mesh)' },
      { key: 'towFlat', label: 'Tow flatness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: isWeave, tip: '0 = round tows / wires, 1 = flat spread tapes' },
      { key: 'gapAlpha', label: 'Transparent holes', type: 'bool', default: false, show: isWeave, tip: 'Open holes between the tows / wires become transparent (alpha cutout for meshes and grilles)' },
      { key: 'fiberDetail', label: 'Fiber detail', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: isFiber, tip: 'Fine filament streaks running along each tow or flake' },
      { key: 'towVar', label: 'Tow variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: isFiber, tip: 'Brightness difference from tow to tow (or flake to flake)' },
      { key: 'tracer', label: 'Tracer every N tows', type: 'int', min: 0, max: 16, default: 0, show: isWeave, tip: '0 = off. Colored tracer tows (aramid, colored glass) every N tows in both directions: carbon-kevlar hybrids' },
      { key: 'tracerColor', label: 'Tracer color', type: 'color', default: '#e3b745', show: (p) => isWeave(p) && p.tracer > 0 },
      { key: 'flakeLen', label: 'Flake length', type: 'range', min: 0.8, max: 4, step: 0.01, default: 2, show: pat('forged'), tip: 'Length of the chopped flakes in pattern cells' },
      { key: 'flakeWidth', label: 'Flake width', type: 'range', min: 0.3, max: 1.6, step: 0.01, default: 0.7, show: pat('forged') },
      { key: 'knurlAngle', label: 'Knurl angle', type: 'range', min: 15, max: 75, step: 1, default: 45, show: pat('knurl'), tip: 'Helix angle of the grooves: 30° and 45° are standard; the diamonds stretch accordingly' },
      { key: 'orient', label: 'Direction', type: 'select', default: 'v', options: [['h', 'Horizontal'], ['v', 'Vertical']], show: pat('knurlStraight') },
      { key: 'flatTop', label: 'Flat tops', type: 'range', min: 0, max: 0.85, step: 0.01, default: 0.1, show: pat('knurl', 'knurlStraight'), tip: '0 = sharp points, higher = flattened (worn or partially formed) tops' },
      { key: 'hatchAngle', label: 'Hatch angle', type: 'range', min: 5, max: 85, step: 1, default: 25, show: pat('crosshatch'), tip: 'Groove angle to the horizontal; honed cylinders use about 20–35°' },
      { key: 'layout', label: 'Layout', type: 'select', default: 'hex', options: [['hex', 'Staggered (hex)'], ['square', 'Square grid']], show: pat('dimples') },
      { key: 'dimpleSize', label: 'Dimple size', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.6, show: pat('dimples'), tip: 'Diameter relative to the spacing' },
      { key: 'rim', label: 'Melt rim', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: pat('dimples'), tip: 'Raised rim of re-solidified metal around laser dimples' },
      { key: 'gap', label: 'Groove width', type: 'range', min: 0.02, max: 0.6, step: 0.01, default: 0.16, show: pat('hex', 'waffle') },
      { key: 'invert', label: 'Invert relief', type: 'bool', default: false, show: (p) => !isFiber(p), tip: 'Pockets instead of pads, domes instead of dimples, grooves instead of ridges' },

      { type: 'section', label: 'Material' },
      { key: 'material', label: 'Material', type: 'select', default: 'carbon', options: [['carbon', 'Carbon fiber (black)'], ['aramid', 'Aramid / Kevlar (yellow)'], ['glass', 'Glass fiber'], ['bluecarbon', 'Tinted carbon: blue'], ['redcarbon', 'Tinted carbon: red'], ['greencarbon', 'Tinted carbon: green'], ['silvercarbon', 'Silver carbon (aluminized)'], ['steel', 'Steel'], ['aluminium', 'Aluminium'], ['titanium', 'Titanium'], ['brass', 'Brass'], ['copper', 'Copper'], ['gunmetal', 'Gunmetal'], ['blackoxide', 'Black oxide steel'], ['custom', 'Custom']], apply: setMat, tip: 'Sets colors, roughness, metallic, clear coat and brushed grain' },
      { key: 'color', label: 'Fiber / metal color', type: 'color', default: MATS.carbon[0], tip: 'Color of the lit fibers or the bare metal' },
      { key: 'color2', label: 'Resin / shade color', type: 'color', default: MATS.carbon[1], tip: 'Resin between and under the fibers, fibers facing away from the sheen; for metal the grooves' },
      { key: 'metal', label: 'Metallic', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Metal mask value: 0 for composites, 1 for bare metal' },
      { key: 'rough', label: 'Base roughness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.42, tip: 'Roughness of the bare fibers or metal (under the clear coat)' },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Broad, cloudy tone variation' },
      { key: 'sheen', label: 'Fiber sheen', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, tip: 'Baked anisotropic highlight: fibers parallel to the sheen direction light up, the crossing ones go dark. Lower it for a pure albedo when the engine renders anisotropy (use the fiber direction output)' },
      { key: 'sheenAngle', label: 'Sheen direction', type: 'range', min: 0, max: 180, step: 1, default: 0, show: (p) => p.sheen > 0, tip: 'Which fiber direction catches the light: 0° = horizontal tows bright, 90° = vertical ones, 45° = both alike' },
      { key: 'micro', label: 'Brushed micro grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Fine brushing / machining lines over the pattern' },
      { key: 'grainDir', label: 'Grain direction', type: 'select', default: 'h', options: [['h', 'Horizontal'], ['v', 'Vertical']], show: (p) => p.micro > 0 || !isFiber(p), tip: 'Direction of the micro grain (also the direction stored in the fiber direction map for metal patterns)' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Clear coat', active: (p) => p.coat > 0 },
      { key: 'coat', label: 'Clear coat', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, tip: 'Glossy resin / lacquer over the surface: hides the fiber roughness' },
      { key: 'coatRough', label: 'Coat roughness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.06, show: (p) => p.coat > 0, tip: 'Gloss ~0.05, satin ~0.3, matte clear ~0.55' },
      { key: 'peel', label: 'Orange peel', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: (p) => p.coat > 0, tip: 'Soft waviness of the sprayed clear coat (height / normal map only)' },

      { type: 'section', label: 'Wear' },
      { key: 'wear', label: 'Edge polish / abrasion', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'High spots rubbed: bare metal turns bright and glossy, a clear coat turns hazy and matte' },
      { key: 'scratches', label: 'Scratches', type: 'range', min: 0, max: 1, step: 0.01, default: 0.08, tip: 'Whitish scratches in the clear coat, bright ones in bare metal' },
      { key: 'scratchLen', label: 'Scratch length', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.3, show: (p) => p.scratches > 0 },
      { key: 'scuffs', label: 'Scuffs', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Hazy, matte abraded patches' },
      { key: 'dust', label: 'Dust', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Dust and grime in the grooves and cavities' },
      { key: 'dustColor', label: 'Dust color', type: 'color', default: '#8b8272', show: (p) => p.dust > 0 },

      { type: 'section', label: 'Shading' },
      { key: 'ao', label: 'AO strength', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Ambient occlusion in gaps, grooves and pits' },
      { key: 'shade', label: 'Relief shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Soft shading of the relief baked into the color (0 for a pure albedo)' },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'ambient', options: [['ambient', 'Ambient (soft, no direction)'], ['angled', 'Angled (light angle)']], show: (p) => p.shade > 0 },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -135, show: (p) => p.shade > 0 && p.lightMode === 'angled' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color (albedo + AO)'], ['albedo', 'Flat albedo'], ['height', 'Height map'], ['aomap', 'AO map'], ['rough', 'Roughness detail'], ['metalmask', 'Metal mask'], ['tangent', 'Fiber direction (anisotropy tangent)']], tip: 'Smoothness and metallic maps come from the mode switch above (sources: Roughness detail, Metal mask). Fiber direction: RG = tangent along the fibers / grain (OpenGL Y+), for anisotropic shaders' },
    ],
    presets: [
      // carbon
      { name: 'Carbon twill 2×2 (gloss)', group: 'Carbon fiber', values: {} },
      { name: 'Carbon plain weave 1×1', group: 'Carbon fiber', values: { pattern: 'plain', cells: 22 } },
      { name: 'Carbon basket weave', group: 'Carbon fiber', values: { pattern: 'basket', cells: 24 } },
      { name: 'Herringbone carbon', group: 'Carbon fiber', values: { pattern: 'herring', cells: 24 } },
      { name: 'Carbon 5-harness satin', group: 'Carbon fiber', values: { pattern: 'satin5', cells: 25 } },
      { name: 'Aerospace 8-harness satin', group: 'Carbon fiber', values: { pattern: 'satin8', cells: 32, sheen: 0.5 } },
      { name: 'Spread tow carbon (wide tapes)', group: 'Carbon fiber', values: { pattern: 'spread', cells: 6, sheen: 0.75, fiberDetail: 0.7 } },
      { name: 'Unidirectional carbon (UD)', group: 'Carbon fiber', values: { pattern: 'ud', cells: 26, sheen: 0.5, irregular: 0.25 } },
      { name: 'Forged carbon', group: 'Carbon fiber', values: { pattern: 'forged', cells: 6, sheen: 0.8, depth: 0.3, fiberDetail: 0.6 } },
      { name: 'Matte carbon (dry, no clear coat)', group: 'Carbon fiber', values: { pattern: 'twill', coat: 0, rough: 0.48, sheen: 0.5, fiberDetail: 0.75, depth: 0.75 } },
      { name: 'Satin clear carbon', group: 'Carbon fiber', values: { pattern: 'twill', coatRough: 0.3, peel: 0.15 } },
      { name: 'Coarse 12K twill', group: 'Carbon fiber', values: { pattern: 'twill', cells: 8, fiberDetail: 0.8, depth: 0.7 } },
      { name: 'Carbon-Kevlar hybrid', group: 'Carbon fiber', values: { pattern: 'twill', cells: 20, tracer: 2, tracerColor: '#e3b745' } },
      { name: 'Kevlar / aramid twill', group: 'Carbon fiber', values: { material: 'aramid', pattern: 'twill', cells: 18, sheen: 0.45 } },
      { name: 'Glass fiber fabric', group: 'Carbon fiber', values: { material: 'glass', pattern: 'plain', cells: 20, sheen: 0.3, coat: 0.5 } },
      { name: 'Blue tinted carbon', group: 'Carbon fiber', values: { material: 'bluecarbon', pattern: 'twill' } },
      { name: 'Red tinted carbon', group: 'Carbon fiber', values: { material: 'redcarbon', pattern: 'twill' } },
      { name: 'Silver carbon', group: 'Carbon fiber', values: { material: 'silvercarbon', pattern: 'plain', cells: 20 } },
      { name: 'Scratched carbon hood', group: 'Carbon fiber', values: { pattern: 'twill', cells: 14, wear: 0.3, scratches: 0.6, scratchLen: 0.45, scuffs: 0.35, dust: 0.15 } },
      // micro metal
      { name: 'Diamond knurl (steel)', group: 'Micro metal', values: { pattern: 'knurl', cells: 24, depth: 0.8, wear: 0.35, dust: 0.15 } },
      { name: 'Fine knurl (aluminium)', group: 'Micro metal', values: { pattern: 'knurl', material: 'aluminium', cells: 48, knurlAngle: 30, flatTop: 0.2, depth: 0.7, wear: 0.2 } },
      { name: 'Black oxide knurled grip', group: 'Micro metal', values: { pattern: 'knurl', material: 'blackoxide', cells: 30, flatTop: 0.25, wear: 0.6, dust: 0.2 } },
      { name: 'Straight knurl', group: 'Micro metal', values: { pattern: 'knurlStraight', cells: 40, depth: 0.7, wear: 0.3 } },
      { name: 'Cross-hatch honed cylinder', group: 'Micro metal', values: { pattern: 'crosshatch', cells: 70, hatchAngle: 25, depth: 0.5, irregular: 0.6, micro: 0 } },
      { name: 'Laser-textured dimples', group: 'Micro metal', values: { pattern: 'dimples', cells: 24, dimpleSize: 0.6, rim: 0.5, depth: 0.6 } },
      { name: 'Micro hex (titanium)', group: 'Micro metal', values: { pattern: 'hex', material: 'titanium', cells: 18, gap: 0.14, invert: true, depth: 0.6 } },
      { name: 'Gunmetal waffle grid', group: 'Micro metal', values: { pattern: 'waffle', material: 'gunmetal', cells: 16, gap: 0.2, depth: 0.7, wear: 0.3 } },
      { name: 'Woven steel wire mesh', group: 'Micro metal', values: { pattern: 'mesh', cells: 24, towGap: 0.42, towFlat: 0, sheen: 0.3, micro: 0, depth: 0.9 } },
      { name: 'Brass speaker mesh', group: 'Micro metal', values: { pattern: 'mesh', material: 'brass', cells: 40, towGap: 0.35, towFlat: 0, sheen: 0.3, micro: 0, depth: 0.9 } },
      { name: 'Twill wire cloth (filter)', group: 'Micro metal', values: { pattern: 'twill', material: 'steel', cells: 40, towGap: 0.12, towFlat: 0, sheen: 0.35, micro: 0, gapAlpha: true, depth: 0.9 } },
    ],

    render(ctx, W, H, p, opts) {
      const src = opts && opts.source, heightOut = !!(opts && opts.height) || (!src && p.output === 'height');
      const outMode = src === 'metalmask' || src === 'rough' ? src : heightOut ? 'height' : p.output;
      const seed = p.seed | 0, ar = H / W, S = Math.min(W, H), N = W * H, cap = S / 1.3, type = p.pattern;
      const weaveOn = WEAVE.includes(type), fiber = weaveOn || type === 'forged';
      const per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const [mpx, mpy] = per(3), [cnx, cny] = per(p.cells), [wpx, wpy] = per(Math.max(2, p.cells * 0.3));
      const pf = (px, py, oct, s, sc) => U.coarseField(W, H, sc, (x, y) => U.fractal('perlin', (x / W) * px, (y / H) * py, px, py, oct, 0.55, 'fbm', s));
      const warp = (s) => U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * wpx, (y / H) * wpy, wpx, wpy, 3, 0.5, 'fbm', s) - 0.5);
      const gd = p.grainDir === 'v' ? Math.PI / 2 : 0;
      const G = {
        p, W, H, N, S, ar, cap, seed, per, cnx, cny, rnd: U.rng(seed * 31 + 5),
        Hb: new Float32Array(N), Tn: new Float32Array(N), Rf: new Float32Array(N), Dir: new Float32Array(N).fill(gd),
        Tr: new Uint8Array(N), Al: new Float32Array(N).fill(1),
        mot: pf(mpx, mpy, 4, seed + 3, 96),
        warpX: weaveOn && p.irregular > 0 ? warp(seed + 11) : null, warpY: weaveOn && p.irregular > 0 ? warp(seed + 12) : null,
      };
      if (weaveOn) weave(G, type);
      else (PAT[type] || PAT.knurl)(G);
      const Hb = G.Hb;
      // metal patterns: optional inverted relief, crests a little brighter than the grooves
      if (!fiber) {
        const dp = p.depth;
        for (let i = 0; i < N; i++) {
          const h = p.invert ? 1 - Hb[i] : Hb[i];
          G.Tn[i] += 0.62 + 0.45 * h; Hb[i] = 0.5 + (h - 0.5) * dp;
        }
      }
      // brushed micro grain along the grain direction
      if (p.micro > 0) {
        const m = streaks(W, H, Math.min(S * 0.45, cap), cap, seed + 41, gd !== 0), k = p.micro;
        for (let i = 0; i < N; i++) { const d = m[i] - 0.5; Hb[i] += d * 0.03 * k; G.Tn[i] += d * 0.22 * k; G.Rf[i] += Math.abs(d) * 0.12 * k; }
      }

      // crests and cavities from the smoothed height; ambient occlusion from the full one (radii follow the pattern size)
      const cell = S / Math.max(2, p.cells);
      const b1 = blurWrap(Hb, W, H, Math.max(S * 0.002, cell * 0.04)), b2 = blurWrap(Hb, W, H, Math.max(2, cell * 0.3));
      const crest = new Float32Array(N), cav = new Float32Array(N), occl = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        crest[i] = clamp((b1[i] - b2[i]) * 7); cav[i] = clamp((b2[i] - b1[i]) * 6);
        occl[i] = clamp((b1[i] - Hb[i]) * 3 + (b2[i] - Hb[i]) * 2);
      }

      const [npx, npy] = per(8), [spx, spy] = per(7), [ppx, ppy] = per(14);
      const F = {
        crest, cav, fine: fbmField(W, H, ...per(Math.min(140, cap)), 2, 0.5, seed + 73, cap * 1.6),
        wearN: pf(npx, npy, 4, seed + 71, 160),
        scuffN: p.scuffs > 0 ? pf(spx, spy, 4, seed + 83, 200) : null,
        peelN: p.coat > 0 && p.peel > 0 ? pf(ppx, ppy, 3, seed + 91, 220) : new Float32Array(N).fill(0.5),
        Sc: new Float32Array(N), Rr: new Float32Array(N), Mm: new Float32Array(N), col: new Float32Array(N * 3),
      };
      if (p.scratches > 0) drawScratches(G, F.Sc);
      composite(G, F);

      const img = ctx.createImageData(W, H), o = img.data, Al = G.Al;
      const gray = (arr, k) => { for (let i = 0; i < N; i++) { const g = arr[i] * k; o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = g; o[i * 4 + 3] = 255; } ctx.putImageData(img, 0, 0); };
      if (outMode === 'height') {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < N; i++) { if (Hb[i] < lo) lo = Hb[i]; if (Hb[i] > hi) hi = Hb[i]; }
        const k = hi > lo ? 1 / (hi - lo) : 0;
        for (let i = 0; i < N; i++) Hb[i] = (Hb[i] - lo) * k;
        return gray(Hb, 255);
      }
      if (outMode === 'rough') return gray(F.Rr, 255);
      if (outMode === 'metalmask') { for (let i = 0; i < N; i++) F.Mm[i] *= Al[i]; return gray(F.Mm, 255); }
      if (outMode === 'aomap') { for (let i = 0; i < N; i++) occl[i] = 1 - occl[i] * Math.max(0.05, p.ao); return gray(occl, 255); }
      if (outMode === 'tangent') { // axial direction, folded to cos ≥ 0 so neighbouring tows never flip sign; image y down → OpenGL Y+
        const D = G.Dir;
        for (let i = 0; i < N; i++) {
          let c = Math.cos(D[i]), s = -Math.sin(D[i]);
          if (c < 0 || (c === 0 && s < 0)) { c = -c; s = -s; }
          const k = i * 4; o[k] = (c * 0.5 + 0.5) * 255; o[k + 1] = (s * 0.5 + 0.5) * 255; o[k + 2] = 128; o[k + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return;
      }
      shadeOut(G, F.col, occl, o, outMode === 'albedo');
      ctx.putImageData(img, 0, 0);
    },
  });
})();
