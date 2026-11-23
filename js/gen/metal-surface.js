/* Metal: tileable PBR metal surfaces. A finish (brushed linear / circular / radial / engine-turned,
   polished, blasted, hammered, cast, galvanized spangle, diamond plate, perforated, corrugated, anodized)
   builds a height buffer plus a brightness and roughness pattern. On top: edge wear (crests polished bare),
   scratches, fingerprints and smudges, cavity dirt, heat tint, a chipped paint coat and corrosion (rust,
   verdigris, bronze patina, tarnish, white oxide) with pitting and run-down streaks that collects in the
   cavities first. All noise uses whole periods, so it tiles. The color output is a flat albedo with
   optional AO and soft relief shading (ambient by default); the height map drives the normal map mode and
   two own map sources (metal mask, roughness detail: white = rough) give exact smoothness / metallic maps. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;

  // base metal: [color, shade color]
  const METALS = {
    steel: ['#a9adb1', '#62686e'], aluminium: ['#c6c9cc', '#8c9197'], copper: ['#bc7048', '#66301a'],
    brass: ['#ccaa64', '#80602a'], gold: ['#eec25a', '#a8781c'], bronze: ['#ad7c4c', '#5e3c1e'],
    iron: ['#85827e', '#47433f'], titanium: ['#b2aca3', '#736d65'], chrome: ['#cbced2', '#8a8f95'], zinc: ['#b8bfc3', '#7c848a'],
    gunmetal: ['#5d6268', '#2a2e33'], // dark, slightly blue-grey gun steel
  };
  // corrosion colors: deep, mid, light
  const CORR = {
    rust: ['#2e170c', '#673016', '#9a5226'], verdigris: ['#294339', '#3d7062', '#6a9a86'],
    patina: ['#2c281a', '#4e5a38', '#738a5e'], tarnish: ['#221d18', '#3e3428', '#5e503c'], oxide: ['#8a8a84', '#bdbdb5', '#e2e2da'],
  };
  const SOFT = { tarnish: 0.2, oxide: 0.08, patina: 0.05, verdigris: 0.04, rust: 0.03 }; // patch edge softness
  // a sensible pattern scale per finish (set when the finish changes)
  const CELLS = { hammered: 9, galvanized: 4, diamond: 6, perforated: 14, corrugated: 8, cast: 6, brushed: 8 };

  /* tileable value-noise lattice nx × ny (texture units, wraps) */
  function lat(nx, ny, seed) {
    nx = Math.max(1, Math.round(nx)); ny = Math.max(1, Math.round(ny));
    const t = new Float32Array(nx * ny);
    for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k++) t[k] = U.hash(i, j, seed);
    return { nx, ny, t };
  }
  // point sample (for warped or polar coordinates)
  function vn(L, u, v) {
    const nx = L.nx, ny = L.ny, x = u * nx, y = v * ny;
    let i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    i %= nx; if (i < 0) i += nx; j %= ny; if (j < 0) j += ny;
    const i1 = i + 1 === nx ? 0 : i + 1, r0 = j * nx, r1 = (j + 1 === ny ? 0 : j + 1) * nx, t = L.t;
    const a = t[r0 + i] + (t[r0 + i1] - t[r0 + i]) * fx, b = t[r1 + i] + (t[r1 + i1] - t[r1 + i]) * fx;
    return a + (b - a) * fy;
  }
  // whole W × H field of a lattice, added with weight w (row-wise, no per-pixel floor / mod);
  // tr: the lattice's x axis runs down the image (vertical streaks)
  function addField(out, L, W, H, w, tr) {
    const nx = L.nx, ny = L.ny, t = L.t, PW = tr ? H : W, PH = tr ? W : H;
    const i0 = new Int32Array(PW), i1 = new Int32Array(PW), fx = new Float32Array(PW);
    for (let x = 0; x < PW; x++) { const X = ((x + 0.5) / PW) * nx, i = Math.floor(X), f = X - i; fx[x] = f * f * (3 - 2 * f); i0[x] = i % nx; i1[x] = (i + 1) % nx; }
    for (let y = 0; y < PH; y++) {
      const Y = ((y + 0.5) / PH) * ny, j = Math.floor(Y); let f = Y - j; f = f * f * (3 - 2 * f);
      const r0 = (j % ny) * nx, r1 = ((j + 1) % ny) * nx;
      const st = tr ? W : 1, o0 = tr ? y : y * W; // output index = o0 + x * st
      for (let x = 0, oi = o0; x < PW; x++, oi += st) {
        const a = t[r0 + i0[x]], b = t[r0 + i1[x]], c = t[r1 + i0[x]], d = t[r1 + i1[x]], q = fx[x];
        const top = a + (b - a) * q;
        out[oi] += (top + (c + (d - c) * q - top) * f) * w;
      }
    }
    return out;
  }
  // fractal field: octaves double, capped near the pixel size (so preview and export match); 0..1
  function latSet(nx, ny, oct, gain, seed, cap) {
    const ls = [];
    let a = 1, n = 0;
    for (let k = 0; k < oct; k++) { const f = 1 << k; if (k && Math.max(nx, ny) * f > cap) break; ls.push([lat(nx * f, ny * f, seed + k * 131), a]); n += a; a *= gain; }
    for (const l of ls) l[1] /= n;
    return ls;
  }
  const fbmAt = (ls, u, v) => { let s = 0; for (let k = 0; k < ls.length; k++) s += vn(ls[k][0], u, v) * ls[k][1]; return s; };
  function fbmField(W, H, nx, ny, oct, gain, seed, cap, tr) {
    const out = new Float32Array(W * H);
    for (const [L, w] of latSet(nx, ny, oct, gain, seed, cap)) addField(out, L, W, H, w, tr);
    return out;
  }

  /* worley cell with the offset to its point (lattice units); points precomputed per lattice */
  const C = { f1: 0, f2: 0, id: 0, id2: 0, dx: 0, dy: 0 };
  function cellTab(nx, ny, seed, jit) {
    const n = nx * ny, px = new Float32Array(n), py = new Float32Array(n), id = new Float32Array(n), id2 = new Float32Array(n);
    for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k++) {
      px[k] = 0.5 + (U.hash(i, j, seed) - 0.5) * jit; py[k] = 0.5 + (U.hash(i, j, seed + 7) - 0.5) * jit;
      id[k] = U.hash(i, j, seed + 13); id2[k] = U.hash(i, j, seed + 29);
    }
    return { nx, ny, px, py, id, id2 };
  }
  function cell(T, x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), nx = T.nx, ny = T.ny;
    let f1 = 1e9, f2 = 1e9;
    for (let j = -1; j <= 1; j++) {
      const cy = yi + j; let wy = cy % ny; if (wy < 0) wy += ny;
      for (let i = -1; i <= 1; i++) {
        const cx = xi + i; let wx = cx % nx; if (wx < 0) wx += nx;
        const k = wy * nx + wx, dx = x - cx - T.px[k], dy = y - cy - T.py[k], d = dx * dx + dy * dy;
        if (d < f1) { f2 = f1; f1 = d; C.id = T.id[k]; C.id2 = T.id2[k]; C.dx = dx; C.dy = dy; } else if (d < f2) f2 = d;
      }
    }
    C.f1 = Math.sqrt(f1); C.f2 = Math.sqrt(f2);
    return C;
  }

  // separable box blur with wrap (index tables), run twice ≈ tent; r in px; returns a new array
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
      // vertical pass row by row with running column sums (cache friendly)
      cs.fill(0);
      for (let k = -r; k <= r; k++) { const row = WY[k + r + 1] * W; for (let x = 0; x < W; x++) cs[x] += tmp[row + x]; }
      for (let y = 0; y < H; y++) {
        const o = y * W, ad = WY[y + 2 * r + 2] * W, sb = WY[y + 1] * W;
        for (let x = 0; x < W; x++) { a[o + x] = cs[x] * inv; cs[x] += tmp[ad + x] - tmp[sb + x]; }
      }
    }
    return a;
  }

  // soft round dab into B (max), wrapped
  function dab(B, W, H, fx, fy, r, v) {
    const R = Math.ceil(r + 1);
    for (let y = Math.floor(fy - R); y <= Math.ceil(fy + R); y++) {
      const row = U.mod(y, H) * W, dy = y + 0.5 - fy;
      for (let x = Math.floor(fx - R); x <= Math.ceil(fx + R); x++) {
        const dx = x + 0.5 - fx, c = clamp(r + 0.5 - Math.sqrt(dx * dx + dy * dy)) * v, k = row + U.mod(x, W);
        if (c > B[k]) B[k] = c;
      }
    }
  }

  const HEAT = [[0, [205, 175, 115]], [0.25, [185, 125, 60]], [0.5, [115, 62, 105]], [0.72, [52, 82, 165]], [1, [120, 165, 200]]];
  const HC = [0, 0, 0], heatCol = (t) => { let k = 0; while (k < HEAT.length - 2 && t > HEAT[k + 1][0]) k++; const a = HEAT[k], b = HEAT[k + 1], f = clamp((t - a[0]) / (b[0] - a[0])); for (let c = 0; c < 3; c++) HC[c] = lerp(a[1][c], b[1][c], f); return HC; };

  /* finishes: each fills G.Hb (height ≈ 0..1 relief + small micro detail), G.Tn (brightness, 0.8 = base)
     and G.Rf (roughness), and G.A (coverage, perforated holes). Kept as small functions so V8 optimizes them. */
  const FIN = {
    brushed(G) {
      const { p, W, H, N, Hb, Tn, Rf, seed, cap, ar } = G, m = p.brushMode, F = Math.max(8, p.lines), k = p.brush;
      if (m === 'linear') {
        // streaks along the brushing: coarse bands to sharp fine lines, plus a few deeper lines
        const tr = p.orient === 'v', cross = tr ? W : H, Fc = Math.min(F, cross / 1.2), f2 = Math.min(2 * F, cross / 1.1), two = f2 > Fc * 1.4;
        const B = new Float32Array(N), D = new Float32Array(N), E = new Float32Array(N);
        addField(B, lat(2, F / 16, seed + 41), W, H, 0.16, tr);
        addField(B, lat(4, F / 4, seed + 42), W, H, 0.26, tr);
        addField(B, lat(8, Fc, seed + 43), W, H, two ? 0.36 : 0.58, tr);
        if (two) addField(B, lat(14, f2, seed + 44), W, H, 0.22, tr);
        addField(D, lat(5, Fc, seed + 77), W, H, 1, tr); addField(E, lat(6, Fc, seed + 78), W, H, 1, tr);
        for (let i = 0; i < N; i++) {
          const b = B[i] + smoothstep(0.8, 0.97, D[i]) * (E[i] - 0.35) * 0.7;
          Hb[i] = 0.5 + (b - 0.5) * 0.08; Tn[i] = 0.8 + (b - 0.5) * k * 0.8; Rf[i] = 0.32 + (b - 0.5) * 0.3;
        }
      } else if (m === 'swirl') {
        // engine-turned: overlapping circular brushed spots in a grid; later spots lie on top
        const nx = G.cnx, ny = G.cny, R = 0.72, Lr = latSet(4, F / nx, 3, 0.7, seed + 41, (cap / nx) * 1.5);
        for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
          const X = ((x + 0.5) / W) * nx, Y = ((y + 0.5) / H) * ny, xi = Math.floor(X), yi = Math.floor(Y);
          let best = -1, lx = 0, ly = 0;
          for (let j = yi - 1; j <= yi + 1; j++) for (let ii = xi - 1; ii <= xi + 1; ii++) {
            const dx = X - ii - 0.5, dy = Y - j - 0.5;
            if (dx * dx + dy * dy > R * R) continue;
            const ord = U.mod(j, ny) * nx + U.mod(ii, nx);
            if (ord > best) { best = ord; lx = dx; ly = dy; }
          }
          const r = Math.sqrt(lx * lx + ly * ly) / R, an = Math.atan2(ly, lx);
          const b = fbmAt(Lr, an / TAU + 0.5, r * 0.999), sweep = Math.cos(an - 0.6) * (1 - r * 0.3);
          Hb[i] = 0.5 + (b - 0.5) * 0.06 - r * r * 0.04;
          Tn[i] = 0.8 + (b - 0.5) * k * 0.6 + sweep * k * 0.35 - smoothstep(0.88, 1, r) * 0.08;
          Rf[i] = 0.3 + (b - 0.5) * 0.25;
        }
      } else {
        // circular (spun: rings) or radial (spokes) around the center
        const Ls = latSet(3, F / 8, 4, 0.75, seed + 41, cap * 1.2), circ = m === 'circular';
        for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
          const dx = (x + 0.5) / W - 0.5, dy = ((y + 0.5) / H - 0.5) * ar, r = Math.sqrt(dx * dx + dy * dy), an = Math.atan2(dy, dx) / TAU + 0.5;
          let b = circ ? fbmAt(Ls, an, r / 0.75) : fbmAt(Ls, r / 0.75, an);
          if (!circ) b = 0.5 + (b - 0.5) * smoothstep(0, 0.12, r);
          Hb[i] = 0.5 + (b - 0.5) * 0.08; Tn[i] = 0.8 + (b - 0.5) * k * 0.8; Rf[i] = 0.32 + (b - 0.5) * 0.3;
        }
      }
    },
    polished(G) {
      const { W, H, N, Hb, Tn, Rf, seed, cap } = G, c = fbmField(W, H, ...G.per(4), 3, 0.5, seed + 21, cap);
      for (let i = 0; i < N; i++) { Hb[i] = 0.5 + (c[i] - 0.5) * 0.02; Tn[i] = 0.84 + (c[i] - 0.5) * 0.16; Rf[i] = 0.06 + c[i] * 0.06; }
    },
    blasted(G, ano) {
      const { p, N, Hb, Tn, Rf, seed } = G, g = ano ? p.grain * 1.4 : p.grain, gr = G.grain(g, seed + 51), gh = G.grain(g / 5, seed + 55, 1);
      for (let i = 0; i < N; i++) {
        Hb[i] = 0.5 + (gr[i] - 0.5) * 0.12 + (gh[i] - 0.5) * 0.04;
        Tn[i] = 0.8 + (gr[i] - 0.5) * (ano ? 0.08 : 0.2) + (gh[i] - 0.5) * 0.06;
        Rf[i] = (ano ? 0.36 : 0.58) + (gr[i] - 0.5) * 0.12;
      }
    },
    anodized(G) { FIN.blasted(G, true); },
    hammered(G) { // round dents meeting in soft ridges; every facet catches a different tone
      const { p, W, H, Hb, Tn, Rf, seed, warpX, warpY, cnx, cny } = G, T = cellTab(cnx, cny, seed + 61, 0.85), irr = p.irregular * 1.2, dp = p.depth, gr = G.grain(p.grain, seed + 52);
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        const c = cell(T, ((x + 0.5) / W) * cnx + warpX[i] * irr, ((y + 0.5) / H) * cny + warpY[i] * irr), q = Math.min(1, c.f1 / 0.75), rid = smoothstep(0.12, 0, c.f2 - c.f1), g = gr[i];
        Hb[i] = dp * (q * q * 0.8 + rid * 0.08 + (c.id - 0.5) * 0.06) + (g - 0.5) * 0.02;
        Tn[i] = 0.8 + (c.id - 0.5) * 0.16 + (c.dx * 0.35 - c.dy * 0.2) * 0.12 + (g - 0.5) * 0.05;
        Rf[i] = 0.2 + c.id2 * 0.1;
      }
    },
    galvanized(G) { // zinc crystals: flat grains of very different brightness with fern-like dendrites
      const { p, W, H, Hb, Tn, Rf, seed, warpX, warpY, cnx, cny } = G, T = cellTab(cnx, cny, seed + 61, 1), irr = p.irregular * 1.2, dp = p.depth, gr = G.grain(p.grain, seed + 52);
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        const c = cell(T, ((x + 0.5) / W) * cnx + warpX[i] * irr, ((y + 0.5) / H) * cny + warpY[i] * irr), g = gr[i];
        const th = c.id2 * Math.PI, cs = Math.cos(th), sn = Math.sin(th), pr = c.dx * cs + c.dy * sn, pq = -c.dx * sn + c.dy * cs;
        const fern = Math.sin(pr * 90 + Math.sin(pq * 40) * 1.5) * 0.5 + 0.5, half = pq > 0 ? 1 : -1, edge = smoothstep(0, 0.03, c.f2 - c.f1);
        Hb[i] = 0.5 + (c.id - 0.5) * 0.06 * dp + fern * 0.02 - (1 - edge) * 0.08 * dp + (g - 0.5) * 0.015;
        Tn[i] = 0.6 + c.id * 0.42 + half * 0.05 * c.id2 + (fern - 0.5) * 0.06 - (1 - edge) * 0.1 + (g - 0.5) * 0.04;
        Rf[i] = 0.3 + (1 - c.id) * 0.2 + (1 - edge) * 0.15;
      }
    },
    cast(G) { // lumpy sand-cast surface with pits
      const { p, W, H, Hb, Tn, Rf, seed, warpX, warpY, cnx, cny, cap } = G, irr = p.irregular * 0.06, dp = p.depth, gr = G.grain(p.grain, seed + 52);
      const Lu = fbmField(W, H, cnx, cny, 4, 0.5, seed + 63, cap), Tp = cellTab(cnx * 5, cny * 5, seed + 67, 1);
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        const u = (x + 0.5) / W, v = (y + 0.5) / H, g = gr[i], lump = Lu[i] + (warpX[i] - warpY[i]) * irr * 2, c = cell(Tp, u * Tp.nx, v * Tp.ny);
        const pit = c.id > 0.55 ? smoothstep(0.22, 0.08, c.f1) * (c.id - 0.55) * 2.2 : 0;
        Hb[i] = dp * (lump - 0.5) * 1.2 + 0.5 + (g - 0.5) * 0.08 - pit * 0.25;
        Tn[i] = 0.72 + (lump - 0.5) * 0.25 + (g - 0.5) * 0.22 - pit * 0.3;
        Rf[i] = 0.68 + (g - 0.5) * 0.15 + pit * 0.1;
      }
    },
    diamond(G) { // tread plate: raised, pointed bars at ±45° in a checker; even cell counts so it tiles
      const { p, W, H, Hb, Tn, Rf, seed, cnx, cny } = G, nx = cnx + (cnx & 1), ny = Math.max(2, cny + (cny & 1)), cw = W / nx, ch = H / ny, cpx = Math.min(cw, ch);
      const dp = p.depth, gr = G.grain(260, seed + 53), L = 0.42, w = 0.1, aa = Math.max(1, cpx * 0.025);
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        const X = (x + 0.5) / cw, Y = (y + 0.5) / ch, ci = Math.floor(X), cj = Math.floor(Y), lx = X - ci - 0.5, ly = Y - cj - 0.5; // per-cell units (cells stretch with the aspect)
        const sg = (ci + cj) & 1 ? 1 : -1, a = (lx + sg * ly) * 0.7071, b = (-sg * lx + ly) * 0.7071;
        const t = Math.abs(a) / L, hw = t < 1 ? w * Math.pow(1 - Math.pow(t, 2.4), 0.5) : 0;
        const cov = hw > 0 ? clamp(0.5 - ((Math.abs(b) - hw) * cpx) / aa) : 0, q = hw > 0 ? clamp(Math.abs(b) / hw) : 1, dome = Math.sqrt(1 - q * q);
        Hb[i] = 0.2 + dp * cov * (0.5 + 0.5 * dome) * 0.8 + (gr[i] - 0.5) * 0.03;
        Tn[i] = 0.78 + (gr[i] - 0.5) * 0.12 + cov * 0.04;
        Rf[i] = 0.45 - cov * 0.1 + (gr[i] - 0.5) * 0.1;
      }
    },
    perforated(G) {
      const { p, W, H, Hb, Tn, Rf, A, seed, cnx, cny } = G, sl = p.holeShape === 'slot', sq = p.holeShape === 'square', vert = sl && p.orient === 'v', st = !!p.stagger;
      let nx = cnx, ny = cny;
      if (sl) { if (vert) nx = Math.max(1, Math.round(nx * 1.6)); else ny = Math.max(1, Math.round(ny * 1.6)); }
      if (st) ny += ny & 1; // odd rows shift by half a cell: even row count to tile
      const cw = W / nx, ch = H / ny, R = p.holeSize * 0.5 * Math.min(cw, ch), bev = Math.max(1, R * 0.3), dp = p.depth, gr = G.grain(260, seed + 54);
      const sr = R * 0.55, Lh = Math.max(0, (vert ? ch : cw) * 0.42 - sr), rr = R * 0.15, Ex = (G.Ex = new Float32Array(G.N));
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        const Y = (y + 0.5) / ch, cj = Math.floor(Y), X = (x + 0.5) / cw - (st && cj & 1 ? 0.5 : 0);
        const dx = (X - Math.floor(X) - 0.5) * cw, dy = (Y - cj - 0.5) * ch, ax = Math.abs(dx), ay = Math.abs(dy);
        let d;
        if (sq) { const qx = ax - R + rr, qy = ay - R + rr; d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr; }
        else if (sl) d = vert ? Math.hypot(ax, Math.max(ay - Lh, 0)) - sr : Math.hypot(Math.max(ax - Lh, 0), ay) - sr;
        else d = Math.sqrt(dx * dx + dy * dy) - R;
        const hole = clamp(0.5 - d), rim = smoothstep(0, bev, d);
        A[i] = 1 - hole;
        Hb[i] = 0.3 + 0.5 * dp * (0.4 + 0.6 * rim) + (gr[i] - 0.5) * 0.02; // the hole itself is cut in by the coverage
        Ex[i] = hole < 1 ? 1 - smoothstep(0, bev * 1.6, d) : 0; // hole rims count as edges
        Tn[i] = 0.8 + (gr[i] - 0.5) * 0.12; Rf[i] = 0.42 + (gr[i] - 0.5) * 0.1;
      }
    },
    corrugated(G) {
      const { p, W, H, Hb, Tn, Rf, seed, cnx, cny } = G, vert = p.orient === 'v', n = vert ? cnx : cny, dp = p.depth, box = p.profile === 'box', gr = G.grain(260, seed + 56);
      const prof = new Float32Array(vert ? W : H);
      for (let k = 0; k < prof.length; k++) { const s = Math.sin(((k + 0.5) / prof.length) * n * TAU); prof[k] = box ? clamp(s * 2.2, -1, 1) : s; }
      for (let i = 0, y = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
        Hb[i] = 0.5 + prof[vert ? x : y] * 0.45 * dp + (gr[i] - 0.5) * 0.02;
        Tn[i] = 0.8 + (gr[i] - 0.5) * 0.12; Rf[i] = 0.4 + (gr[i] - 0.5) * 0.1;
      }
    },
  };

  /* scratches: tapered strokes drawn with wrap into a 0..1 buffer */
  function drawScratches(G, Sc) {
    const { p, W, H, S, rnd } = G, n = Math.round(p.scratches * 220), al = p.scratchAlign, baseA = p.orient === 'v' ? Math.PI / 2 : 0;
    const around = p.type === 'brushed' && p.brushMode !== 'linear';
    for (let s = 0; s < n; s++) {
      let x = rnd() * W, y = rnd() * H;
      const len = S * p.scratchLen * (0.08 + 0.92 * Math.pow(rnd(), 2)) * 0.6, w = Math.max(0.35, S * 0.0009 * (0.5 + rnd()));
      let a = al === 'aligned' ? baseA + (rnd() - 0.5) * 0.12 : rnd() * TAU;
      if (al === 'aligned' && around) a = Math.atan2(y - H / 2, x - W / 2) + (p.brushMode === 'radial' ? 0 : Math.PI / 2);
      const curv = al === 'swirl' ? (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 2.5) : (rnd() - 0.5) * 0.4, amp = 0.35 + 0.65 * rnd();
      const steps = Math.max(2, Math.ceil(len / 0.6)), ph = rnd() * 6;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, taper = Math.sqrt(Math.sin(Math.PI * t));
        dab(Sc, W, H, x, y, w * (0.4 + 0.6 * taper), amp * taper * (0.65 + 0.35 * Math.sin(t * 9 + ph)));
        a += curv / steps; x += (Math.cos(a) * len) / steps; y += (Math.sin(a) * len) / steps;
      }
    }
  }

  /* fingerprints (ridged ovals, a soft smear when too small to resolve) and wipe marks */
  function drawSmudges(G, Sm) {
    const { p, W, H, S, rnd, seed } = G, nf = Math.round(p.smudges * 7), nw = Math.round(p.smudges * 5), Lq = lat(12, 12, seed + 95);
    for (let f = 0; f < nf + nw; f++) {
      const cx = rnd() * W, cy = rnd() * H, rot = rnd() * TAU, cs = Math.cos(rot), sn = Math.sin(rot), fp = f < nf;
      const a = S * (fp ? 0.042 : 0.09) * (0.75 + 0.5 * rnd()), b = a * (fp ? 0.72 : 0.35 + 0.2 * rnd()), str = 0.6 + 0.4 * rnd();
      const rAmp = clamp((a / 16 - 1.2) / 1.5), R = Math.ceil(a + 2), ox = rnd(), oy = rnd();
      for (let y = Math.floor(cy - R); y <= cy + R; y++) for (let x = Math.floor(cx - R); x <= cx + R; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, la = (dx * cs + dy * sn) / a, lb = (-dx * sn + dy * cs) / b, q = Math.sqrt(la * la + lb * lb);
        if (q >= 1) continue;
        let v;
        if (fp) {
          const n = vn(Lq, ox + la * 0.3, oy + lb * 0.3);
          const ridge = 0.5 + 0.5 * Math.sin((Math.sqrt(la * la + lb * lb * 1.3) + lb * 0.25 + n * 0.25) * 16 * Math.PI);
          v = (1 - smoothstep(0.55, 1, q)) * lerp(0.55, ridge, rAmp) * smoothstep(0.15, 0.6, n + 0.2);
        } else v = Math.exp(-q * q * 3) * (0.6 + 0.4 * Math.sin(lb * 14 + vn(Lq, ox + la, oy) * 4));
        const k = U.mod(y, H) * W + U.mod(x, W);
        if (v * str > Sm[k]) Sm[k] = v * str;
      }
    }
  }

  /* layers per pixel: albedo (col), metal mask, roughness (white = rough), final height */
  function composite(G, F) {
    const { p, W, H, Hb, Tn, Rf, A, mot } = G, { crest, cav, wearN, fine, corrN, midN, pitN, strN, heatN, Sc, Sm, Rr, Mm, col } = F;
    const ano = p.type === 'anodized', mc = U.hex(ano ? p.anodColor : p.color), mc2 = ano ? mc.map((c) => c * 0.6) : U.hex(p.color2);
    const bare = ano ? U.hex(p.color) : mc; // what edge wear and scratches expose
    const pc = U.hex(p.paintColor), dc = U.hex(p.dirtColor), cA = U.hex(p.corrA), cB = U.hex(p.corrB), cC = U.hex(p.corrC);
    const thC = lerp(0.8, 0.18, p.corrosion), soft = SOFT[p.corrType] || 0.04, thP = p.paint * 1.12 - 0.04, paintOn = p.paint > 0;
    const cMet = p.corrType === 'tarnish' ? 0.5 : 0.97, heat = p.heat, ewr = p.edgeWear, pt0 = 0.8 - p.pitting * 0.2, stK = p.streaks * 0.7, dirt = p.dirt;
    const sY = [Math.round(H * 0.03), Math.round(H * 0.08), Math.round(H * 0.15)], cv0 = p.colorVar * 0.45, ewK = p.edgeWear * 1.6;
    for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
      const fn = fine[i], cr = crest[i], cv = cav[i], wn = wearN[i];
      let t = Tn[i] + (mot[i] - 0.5) * cv0;
      // edge wear: crests (plus some noise) rubbed bare and polished
      const ew = ewK > 0 ? clamp(smoothstep(0.15, 0.6, cr * 1.4 + (wn - 0.5) * 0.5 + (fn - 0.5) * 0.3) * ewK) : 0;
      t += ew * 0.14;
      const tc = clamp(t, 0, 1.35);
      let r = lerp(mc2[0], mc[0], tc), g = lerp(mc2[1], mc[1], tc), b = lerp(mc2[2], mc[2], tc);
      if (ano && ew > 0) { const e = ew * 0.85; r = lerp(r, bare[0] * t, e); g = lerp(g, bare[1] * t, e); b = lerp(b, bare[2] * t, e); }
      let rough = Rf[i] - ew * 0.12, metal = 1, h = Hb[i];
      if (heatN) { // temper colors in broad bands
        const hv = clamp(heatN[i] * 1.25 - 0.1 + (fn - 0.5) * 0.1), hm = heat * smoothstep(0.15, 0.6, hv) * 0.6, hc = heatCol(hv), l = 0.6 + t * 0.5;
        r = lerp(r, hc[0] * l, hm); g = lerp(g, hc[1] * l, hm); b = lerp(b, hc[2] * l, hm);
      }
      // scratches on bare metal: brighter lines, rougher on polished metal, shallow grooves
      const sc = Sc[i];
      if (sc > 0) { const l = sc * 0.3; r = lerp(r, bare[0] * 1.15, l); g = lerp(g, bare[1] * 1.15, l); b = lerp(b, bare[2] * 1.15, l); rough += sc * (rough < 0.3 ? 0.18 : -0.05); h -= sc * 0.02; }
      // paint coat with chips (edges and scratches chip first)
      if (paintOn) {
        const e = clamp((wn - 0.5) * 2.4 + 0.5) * 0.85 + cr * 0.9 * (0.5 + ewr) + (fn - 0.5) * 0.06 + sc * 0.8, pm = 1 - smoothstep(thP - 0.02, thP + 0.02, e);
        if (pm > 0) {
          const pv = 0.92 + (fn - 0.5) * 0.08 + (mot[i] - 0.5) * 0.1, rim = 1 - Math.abs(pm - 0.5) * 2, l = pv * (1 - rim * 0.25);
          r = lerp(r, pc[0] * l, pm); g = lerp(g, pc[1] * l, pm); b = lerp(b, pc[2] * l, pm);
          rough = lerp(rough, 0.5 + (fn - 0.5) * 0.1, pm); metal *= 1 - pm; h += pm * 0.03;
        }
      }
      // corrosion: patches from the cavities outward, pitting, run-down streaks; rubbed off the crests
      if (corrN) {
        const n = corrN[i] + cv * 0.12 - cr * ewr * 0.5 + (fn - 0.5) * 0.1;
        let cm = smoothstep(thC - soft, thC + soft * 1.5, n);
        if (pitN) cm = Math.max(cm, smoothstep(thC - 0.16, thC, n) * smoothstep(pt0, pt0 + 0.08, pitN[i]));
        if (strN) {
          let up = 0;
          for (let k = 0; k < 3; k++) { let yy = y - sY[k]; if (yy < 0) yy += H; up = Math.max(up, corrN[yy * W + x] * (1 - k * 0.12)); }
          cm = Math.max(cm, smoothstep(0.45, 0.85, strN[i]) * smoothstep(thC - 0.08, thC + 0.1, up) * stK);
        }
        if (cm > 0) {
          const tone = clamp((n - thC) * 2.5 + (midN[i] - 0.5) * 1.5 + (fn - 0.5) * 0.6 + 0.35);
          let r2, g2, b2;
          if (tone < 0.5) { const f = tone * 2; r2 = lerp(cA[0], cB[0], f); g2 = lerp(cA[1], cB[1], f); b2 = lerp(cA[2], cB[2], f); }
          else { const f = (tone - 0.5) * 2; r2 = lerp(cB[0], cC[0], f); g2 = lerp(cB[1], cC[1], f); b2 = lerp(cB[2], cC[2], f); }
          const k = cm * (1 - sc * 0.8);
          r = lerp(r, r2, k); g = lerp(g, g2, k); b = lerp(b, b2, k);
          rough = lerp(rough, 0.8 + (fn - 0.5) * 0.15, k); metal *= 1 - k * cMet; h += k * ((midN[i] - 0.4) * 0.05 + (fn - 0.5) * 0.03);
        }
      }
      if (dirt > 0) { // grime in the cavities
        const dm = clamp(cv * 1.6 * (0.5 + wn) + (wn - 0.6) * 0.3) * dirt;
        r = lerp(r, dc[0], dm * 0.8); g = lerp(g, dc[1], dm * 0.8); b = lerp(b, dc[2], dm * 0.8);
        rough = lerp(rough, 0.85, dm * 0.8); metal *= 1 - dm * 0.6;
      }
      const sm = Sm[i]; // fingerprints / smudges: oily, slightly darker and rougher
      if (sm > 0) { r *= 1 - sm * 0.22; g *= 1 - sm * 0.22; b *= 1 - sm * 0.2; rough += sm * 0.25; }
      col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
      Rr[i] = clamp(rough); Mm[i] = clamp(metal) * A[i]; Hb[i] = h * A[i];
    }
  }

  // color output: albedo × AO × soft relief shading (ambient, or from the light angle)
  function shadeOut(G, col, occl, o, flat) {
    const { p, W, H, S, Hb, A } = G, aoK = flat ? 0 : p.ao * 0.75, shK = flat ? 0 : p.shade, amb = p.lightMode !== 'angled';
    const la = p.lightAngle * RAD, Lx = Math.cos(la) * 0.7071, Ly = Math.sin(la) * 0.7071, Lz = 0.7071, hs = S * 0.012;
    const dark = p.type === 'perforated' && p.holeMode === 'dark';
    for (let y = 0, i = 0; y < H; y++) {
      const ru = (y ? y - 1 : H - 1) * W, rd = (y + 1 === H ? 0 : y + 1) * W, rc = y * W;
      for (let x = 0; x < W; x++, i++) {
        let f = 1 - occl[i] * aoK;
        if (shK > 0) {
          const gx = (Hb[rc + (x + 1 === W ? 0 : x + 1)] - Hb[rc + (x ? x - 1 : W - 1)]) * 0.5 * hs, gy = (Hb[rd + x] - Hb[ru + x]) * 0.5 * hs;
          const nl = Math.sqrt(gx * gx + gy * gy + 1), nz = 1 / nl;
          f *= amb ? Math.max(0.5, 1 - (1 - nz) * shK * 1.6) : clamp(1 + (((-gx * Lx - gy * Ly) / nl + nz * Lz) / Lz - 1) * shK * 0.9, 0.3, 1.6);
        }
        let r = col[i * 3] * f, g = col[i * 3 + 1] * f, b = col[i * 3 + 2] * f, a = A[i];
        if (dark && a < 1) { const k = 1 - a; r = lerp(r, 10, k); g = lerp(g, 11, k); b = lerp(b, 13, k); a = 1; }
        const k = i * 4;
        o[k] = r; o[k + 1] = g; o[k + 2] = b; o[k + 3] = a * 255;
      }
    }
  }

  const isBrushed = (p) => p.type === 'brushed';
  const usesCells = (p) => p.type in CELLS && !(p.type === 'brushed' && p.brushMode !== 'swirl');

  U.register({
    id: 'metal-surface',
    name: 'Metal',
    desc: 'Tileable PBR metal: brushed, polished, blasted, hammered, cast, galvanized, diamond plate, perforated, corrugated or anodized, with wear, scratches, smudges, paint and corrosion',
    uses: ['Albedo, height and AO textures for metal props, floors, walls, machines and vehicles; the own metal mask and roughness sources give exact metallic and smoothness maps (rust, paint and dirt are non-metal).', 'Stylized and sci-fi hull plates, anodized parts and gold trims.'],
    tags: ['PBR', 'Texturing', 'Sci-fi'],
    tileable: true,
    heightMap: true,
    mapSources: [['metalmask', 'Metal mask'], ['rough', 'Roughness detail']],
    icon: U.icon('<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M6 8h12M6 11h9M8 14h10M6 17h7" opacity=".55"/><circle cx="18" cy="17" r=".8" fill="currentColor"/>'),
    params: [
      { type: 'section', label: 'Metal' },
      { key: 'metal', label: 'Metal', type: 'select', default: 'steel', options: [['steel', 'Steel'], ['aluminium', 'Aluminium'], ['copper', 'Copper'], ['brass', 'Brass'], ['gold', 'Gold'], ['bronze', 'Bronze'], ['iron', 'Iron'], ['titanium', 'Titanium'], ['chrome', 'Chrome'], ['zinc', 'Zinc'], ['gunmetal', 'Gunmetal'], ['custom', 'Custom']], apply: (v, p) => { const m = METALS[v]; if (m) { p.color = m[0]; p.color2 = m[1]; } }, tip: 'Sets the metal and shade colors' },
      { key: 'color', label: 'Metal color', type: 'color', default: METALS.steel[0] },
      { key: 'color2', label: 'Shade color', type: 'color', default: METALS.steel[1], tip: 'Darker tone for grooves, dents and variation' },
      { key: 'type', label: 'Finish', type: 'select', default: 'brushed', options: [['brushed', 'Brushed'], ['polished', 'Polished'], ['blasted', 'Sandblasted / bead-blasted'], ['hammered', 'Hammered'], ['cast', 'Cast / rough'], ['galvanized', 'Galvanized spangle'], ['diamond', 'Diamond / tread plate'], ['perforated', 'Perforated'], ['corrugated', 'Corrugated'], ['anodized', 'Anodized']], apply: (v, p) => { if (CELLS[v]) p.cells = CELLS[v]; } },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Broad, cloudy brightness variation' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Pattern' },
      { key: 'brushMode', label: 'Brushing', type: 'select', default: 'linear', options: [['linear', 'Linear'], ['circular', 'Circular (spun)'], ['radial', 'Radial'], ['swirl', 'Engine-turned (swirls)']], show: isBrushed },
      { key: 'orient', label: 'Direction', type: 'select', default: 'h', options: [['h', 'Horizontal'], ['v', 'Vertical']], show: (p) => (isBrushed(p) && p.brushMode === 'linear') || p.type === 'corrugated' || (p.type === 'perforated' && p.holeShape === 'slot') },
      { key: 'lines', label: 'Line density', type: 'int', min: 50, max: 1500, default: 500, show: (p) => isBrushed(p), tip: 'Brush lines across the texture' },
      { key: 'brush', label: 'Brush contrast', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: isBrushed },
      { key: 'grain', label: 'Grain', type: 'int', min: 40, max: 900, default: 320, show: (p) => p.type === 'blasted' || p.type === 'anodized' || p.type === 'cast', tip: 'Blast grains across the texture: higher = finer' },
      { key: 'cells', label: 'Pattern scale', type: 'int', min: 1, max: 60, default: 8, show: usesCells, tip: 'Dents, spangles, plate cells, holes, waves or swirls across the texture' },
      { key: 'depth', label: 'Relief depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => ['hammered', 'cast', 'diamond', 'perforated', 'corrugated', 'galvanized'].includes(p.type) },
      { key: 'irregular', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => ['hammered', 'cast', 'galvanized'].includes(p.type) },
      { key: 'holeShape', label: 'Hole shape', type: 'select', default: 'round', options: [['round', 'Round'], ['square', 'Square'], ['slot', 'Slot']], show: (p) => p.type === 'perforated' },
      { key: 'holeSize', label: 'Hole size', type: 'range', min: 0.1, max: 0.9, step: 0.01, default: 0.55, show: (p) => p.type === 'perforated' },
      { key: 'stagger', label: 'Staggered rows', type: 'bool', default: true, show: (p) => p.type === 'perforated' },
      { key: 'holeMode', label: 'Holes', type: 'select', default: 'alpha', options: [['alpha', 'Transparent'], ['dark', 'Dark backing']], show: (p) => p.type === 'perforated' },
      { key: 'profile', label: 'Profile', type: 'select', default: 'sine', options: [['sine', 'Sine waves'], ['box', 'Box / trapezoid']], show: (p) => p.type === 'corrugated' },
      { key: 'anodColor', label: 'Anodized color', type: 'color', default: '#2a5aa8', show: (p) => p.type === 'anodized' },

      { type: 'section', label: 'Wear' },
      { key: 'edgeWear', label: 'Edge wear', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Crests and edges rubbed bare and polished; removes paint and corrosion there' },
      { key: 'scratches', label: 'Scratches', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: 'scratchLen', label: 'Scratch length', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.35, show: (p) => p.scratches > 0 },
      { key: 'scratchAlign', label: 'Scratch direction', type: 'select', default: 'random', options: [['random', 'Random'], ['aligned', 'Along the brushing / direction'], ['swirl', 'Polishing swirls']], show: (p) => p.scratches > 0 },
      { key: 'smudges', label: 'Fingerprints & smudges', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Oily fingerprints and wipe marks: slightly darker and rougher' },
      { key: 'dirt', label: 'Cavity dirt', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Grime collecting in grooves, dents and around holes' },
      { key: 'dirtColor', label: 'Dirt color', type: 'color', default: '#3a342c', show: (p) => p.dirt > 0 },
      { key: 'heat', label: 'Heat tint', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Temper colors of heated steel or titanium: straw, bronze, purple, blue' },

      { type: 'section', label: 'Corrosion', active: (p) => p.corrosion > 0 },
      { key: 'corrosion', label: 'Corrosion', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Coverage; starts in cavities and spreads over the surface' },
      { key: 'corrType', label: 'Type', type: 'select', default: 'rust', options: [['rust', 'Rust (steel, iron)'], ['verdigris', 'Verdigris (copper)'], ['patina', 'Patina (bronze)'], ['tarnish', 'Tarnish (brass, silver)'], ['oxide', 'White oxide (zinc, aluminium)']], apply: (v, p) => { const c = CORR[v]; if (c) { p.corrA = c[0]; p.corrB = c[1]; p.corrC = c[2]; } }, show: (p) => p.corrosion > 0 },
      { key: 'corrScale', label: 'Patch scale', type: 'int', min: 1, max: 16, default: 4, show: (p) => p.corrosion > 0 },
      { key: 'pitting', label: 'Pitting', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.corrosion > 0, tip: 'Small corrosion spots around the patches' },
      { key: 'streaks', label: 'Run-down streaks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: (p) => p.corrosion > 0, tip: 'Stains running down from the patches' },
      { key: 'corrA', label: 'Deep color', type: 'color', default: CORR.rust[0], show: (p) => p.corrosion > 0 },
      { key: 'corrB', label: 'Corrosion color', type: 'color', default: CORR.rust[1], show: (p) => p.corrosion > 0 },
      { key: 'corrC', label: 'Light color', type: 'color', default: CORR.rust[2], show: (p) => p.corrosion > 0 },

      { type: 'section', label: 'Paint', active: (p) => p.paint > 0 },
      { key: 'paint', label: 'Paint coverage', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: '1 = fully painted except worn edges; lower = chipped down to the metal' },
      { key: 'paintColor', label: 'Paint color', type: 'color', default: '#3e5a3c', show: (p) => p.paint > 0 },
      { key: 'chipScale', label: 'Chip scale', type: 'int', min: 2, max: 40, default: 10, show: (p) => p.paint > 0 },

      { type: 'section', label: 'Shading' },
      { key: 'ao', label: 'AO strength', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Ambient occlusion in grooves, dents and holes' },
      { key: 'shade', label: 'Relief shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Soft shading of the relief baked into the color (0 for a pure albedo)' },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'ambient', options: [['ambient', 'Ambient (soft, no direction)'], ['angled', 'Angled (light angle)']], show: (p) => p.shade > 0, tip: 'Ambient: slopes darken evenly, no direction, good for PBR. Angled: lit from one side' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -135, show: (p) => p.shade > 0 && p.lightMode === 'angled' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color (albedo + AO)'], ['albedo', 'Flat albedo'], ['height', 'Height map'], ['aomap', 'AO map'], ['rough', 'Roughness detail'], ['metalmask', 'Metal mask']], tip: 'Smoothness and metallic maps come from the mode switch above (sources: Metal mask, Roughness detail)' },
    ],
    presets: [
      { name: 'Brushed steel', group: 'Realistic', values: {} },
      { name: 'Spun stainless (circular)', group: 'Realistic', values: { brushMode: 'circular', lines: 700, brush: 0.6, scratches: 0.1, dirt: 0, colorVar: 0.15 } },
      { name: 'Polished chrome', group: 'Realistic', values: { metal: 'chrome', type: 'polished', scratches: 0.2, scratchAlign: 'swirl', scratchLen: 0.2, edgeWear: 0, dirt: 0, colorVar: 0.2, smudges: 0.35 } },
      { name: 'Bead-blasted aluminium', group: 'Realistic', values: { metal: 'aluminium', type: 'blasted', grain: 520, scratches: 0.1, dirt: 0.1, colorVar: 0.2 } },
      { name: 'Hammered copper', group: 'Realistic', values: { metal: 'copper', type: 'hammered', cells: 10, depth: 0.45, irregular: 0.3, edgeWear: 0.12, scratches: 0.08, dirt: 0.2, colorVar: 0.35, corrosion: 0.1, corrType: 'verdigris', corrScale: 3, pitting: 0, streaks: 0 } },
      { name: 'Cast iron', group: 'Realistic', values: { metal: 'iron', type: 'cast', grain: 260, cells: 6, depth: 0.5, edgeWear: 0.4, scratches: 0.1, dirt: 0.4, corrosion: 0.18, corrScale: 5, streaks: 0.1 } },
      { name: 'Galvanized steel', group: 'Realistic', values: { metal: 'zinc', type: 'galvanized', cells: 4, depth: 0.3, edgeWear: 0.1, scratches: 0.15, dirt: 0.15, colorVar: 0.2 } },
      { name: 'Aluminium diamond plate', group: 'Realistic', values: { metal: 'aluminium', type: 'diamond', cells: 6, depth: 0.7, edgeWear: 0.7, scratches: 0.3, dirt: 0.25, colorVar: 0.25 } },
      { name: 'Perforated steel sheet', group: 'Realistic', values: { type: 'perforated', cells: 14, holeSize: 0.55, scratches: 0.15, edgeWear: 0.4, dirt: 0.25 } },
      { name: 'Rusty corrugated roof', group: 'Realistic', values: { metal: 'zinc', type: 'corrugated', cells: 8, depth: 0.8, orient: 'v', corrosion: 0.38, corrScale: 3, streaks: 0.55, pitting: 0.5, dirt: 0.3, scratches: 0.05, edgeWear: 0.2 } },
      { name: 'Rusted steel', group: 'Realistic', values: { type: 'blasted', metal: 'iron', grain: 240, corrosion: 0.72, corrScale: 4, pitting: 0.7, streaks: 0.4, dirt: 0.3, scratches: 0.15, edgeWear: 0.3 } },
      { name: 'Copper verdigris', group: 'Realistic', values: { metal: 'copper', color: '#a65e3a', color2: '#4e2412', type: 'polished', corrosion: 0.5, corrType: 'verdigris', corrScale: 3, pitting: 0.3, streaks: 0.6, scratches: 0.05, edgeWear: 0.1, dirt: 0.25, colorVar: 0.5 } },
      { name: 'Bronze patina', group: 'Realistic', values: { metal: 'bronze', type: 'cast', grain: 400, cells: 4, depth: 0.25, corrosion: 0.6, corrType: 'patina', corrScale: 4, pitting: 0.5, streaks: 0.2, edgeWear: 0.6, dirt: 0.3 } },
      { name: 'Chipped painted steel', group: 'Realistic', values: { type: 'blasted', grain: 300, paint: 0.75, chipScale: 8, paintColor: '#3e5a3c', edgeWear: 0.6, scratches: 0.35, dirt: 0.3, corrosion: 0.15, corrScale: 6, streaks: 0.4, pitting: 0.5 } },
      { name: 'Heat-tinted exhaust', group: 'Realistic', values: { metal: 'titanium', brushMode: 'circular', lines: 400, brush: 0.3, heat: 0.6, scratches: 0.1, dirt: 0.25, colorVar: 0.4 } },
      { name: 'Gunmetal', group: 'Gunmetal', values: { metal: 'gunmetal', color: '#5d6268', color2: '#2a2e33', type: 'polished', scratches: 0.15, scratchLen: 0.3, smudges: 0.3, edgeWear: 0.25, dirt: 0.1, colorVar: 0.2 } },
      { name: 'Brushed gunmetal', group: 'Gunmetal', values: { metal: 'gunmetal', color: '#5d6268', color2: '#2a2e33', lines: 500, brush: 0.55, scratches: 0.12, edgeWear: 0.2, dirt: 0.1, colorVar: 0.15 } },
      { name: 'Blued gun steel', group: 'Gunmetal', values: { metal: 'custom', color: '#3c4552', color2: '#141922', type: 'polished', scratches: 0.12, scratchLen: 0.25, smudges: 0.4, edgeWear: 0.35, dirt: 0.08, colorVar: 0.3 } },
      { name: 'Parkerized (matte phosphate)', group: 'Gunmetal', values: { metal: 'custom', color: '#4d4d4a', color2: '#262624', type: 'blasted', grain: 460, scratches: 0.1, edgeWear: 0.45, smudges: 0.15, dirt: 0.2, colorVar: 0.25 } },
      { name: 'Cerakote gunmetal', group: 'Gunmetal', values: { metal: 'gunmetal', color: '#5d6268', color2: '#2a2e33', type: 'blasted', grain: 380, paint: 0.95, paintColor: '#4a4f56', chipScale: 12, edgeWear: 0.45, scratches: 0.25, dirt: 0.15 } },
      { name: 'Worn gunmetal receiver', group: 'Gunmetal', values: { metal: 'gunmetal', color: '#5d6268', color2: '#2a2e33', type: 'polished', edgeWear: 0.8, scratches: 0.45, scratchLen: 0.35, smudges: 0.45, dirt: 0.35, colorVar: 0.3, corrosion: 0.06, corrScale: 6, pitting: 0.3, streaks: 0 } },
      { name: 'Gunmetal vent plate (sci-fi)', group: 'Gunmetal', values: { metal: 'gunmetal', color: '#5d6268', color2: '#2a2e33', type: 'perforated', holeShape: 'slot', cells: 10, holeSize: 0.55, holeMode: 'dark', edgeWear: 0.5, scratches: 0.2, dirt: 0.25 } },
      { name: 'Toon gold', group: 'Stylized', values: { metal: 'gold', type: 'hammered', cells: 5, depth: 0.5, irregular: 0.15, colorVar: 0.4, scratches: 0, smudges: 0, dirt: 0, edgeWear: 0.5, shade: 0.7, ao: 0.6 } },
      { name: 'Toon rusty plate', group: 'Stylized', values: { metal: 'steel', type: 'diamond', cells: 4, depth: 1, edgeWear: 1, corrosion: 0.45, corrScale: 2, pitting: 0, streaks: 0.2, scratches: 0, dirt: 0.5, shade: 0.6, ao: 0.8 } },
      { name: 'Anodized blue aluminium', group: 'Sci-fi', values: { metal: 'aluminium', type: 'anodized', anodColor: '#2a5aa8', grain: 600, edgeWear: 0.35, scratches: 0.2, dirt: 0.05 } },
      { name: 'Engine-turned titanium', group: 'Sci-fi', values: { metal: 'titanium', brushMode: 'swirl', cells: 6, lines: 400, brush: 0.8, scratches: 0.05, dirt: 0, edgeWear: 0 } },
      { name: 'Vent grille', group: 'Sci-fi', values: { metal: 'steel', type: 'perforated', holeShape: 'slot', cells: 8, holeSize: 0.6, holeMode: 'dark', paint: 0.9, paintColor: '#2a2e34', chipScale: 14, edgeWear: 0.3, scratches: 0.2, dirt: 0.3 } },
    ],

    render(ctx, W, H, p, opts) {
      const src = opts && opts.source, heightOut = !!(opts && opts.height) || (!src && p.output === 'height');
      const outMode = src === 'metalmask' || src === 'rough' ? src : heightOut ? 'height' : p.output;
      const seed = p.seed | 0, ar = H / W, S = Math.min(W, H), N = W * H, cap = S / 1.3, type = FIN[p.type] ? p.type : 'brushed';
      const per = (f) => [Math.max(1, Math.round(f)), Math.max(1, Math.round(f * ar))];
      const grain = (n, s, oct = 2) => { const [gx, gy] = per(Math.min(n, cap)); return fbmField(W, H, gx, gy, oct, 0.5, s, cap * 1.6); };
      const [mpx, mpy] = per(3), [cnx, cny] = per(p.cells), [wpx, wpy] = per(Math.max(2, p.cells * 0.5));
      const warp = (s) => U.coarseField(W, H, 128, (x, y) => U.fractal('perlin', (x / W) * wpx, (y / H) * wpy, wpx, wpy, 3, 0.5, 'fbm', s) - 0.5);
      const warpOn = type === 'hammered' || type === 'cast' || type === 'galvanized';
      const G = {
        p, W, H, N, S, ar, cap, seed, per, grain, cnx, cny, rnd: U.rng(seed * 31 + 5),
        Hb: new Float32Array(N), Tn: new Float32Array(N), Rf: new Float32Array(N), A: new Float32Array(N).fill(1),
        mot: U.coarseField(W, H, 96, (x, y) => U.fractal('perlin', (x / W) * mpx, (y / H) * mpy, mpx, mpy, 4, 0.55, 'fbm', seed + 3)),
        warpX: warpOn ? warp(seed + 11) : null, warpY: warpOn ? warp(seed + 12) : null,
      };
      FIN[type](G);

      // crests and cavities from the smoothed height (micro grain ignored); ambient occlusion from the full one
      const Hb = G.Hb, b1 = blurWrap(Hb, W, H, S * 0.004), b2 = blurWrap(Hb, W, H, S * 0.025);
      const crest = new Float32Array(N), cav = new Float32Array(N), occl = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        crest[i] = G.Ex ? Math.max(clamp((b1[i] - b2[i]) * 7), G.Ex[i]) : clamp((b1[i] - b2[i]) * 7); cav[i] = clamp((b2[i] - b1[i]) * 6);
        occl[i] = clamp((b1[i] - Hb[i]) * 3 + (b2[i] - Hb[i]) * 2);
      }

      // overlay fields: wear / chip noise, fine detail, corrosion, heat; scratches and smudges are drawn
      const [npx, npy] = per(Math.max(2, p.chipScale)), [cpx, cpy] = per(p.corrScale), corrOn = p.corrosion > 0;
      const F = {
        crest, cav, fine: grain(140, seed + 73),
        wearN: U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * npx, (y / H) * npy, npx, npy, 4, 0.6, 'fbm', seed + 71)),
        corrN: corrOn ? U.coarseField(W, H, 200, (x, y) => U.fractal('perlin', (x / W) * cpx, (y / H) * cpy, cpx, cpy, 5, 0.55, 'fbm', seed + 81)) : null,
        midN: corrOn ? fbmField(W, H, ...per(Math.min(p.corrScale * 6, cap)), 2, 0.55, seed + 85, cap) : null,
        pitN: corrOn && p.pitting > 0 ? grain(320, seed + 75, 1) : null,
        strN: corrOn && p.streaks > 0 ? fbmField(W, H, per(48)[0], 2, 2, 0.5, seed + 83, cap) : null, // long vertical streaks
        heatN: p.heat > 0 ? U.coarseField(W, H, 96, (x, y) => U.fractal('perlin', (x / W) * mpx, (y / H) * mpy, mpx, mpy, 3, 0.5, 'fbm', seed + 91)) : null,
        Sc: new Float32Array(N), Sm: new Float32Array(N), Rr: new Float32Array(N), Mm: new Float32Array(N), col: new Float32Array(N * 3),
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
      if (outMode === 'metalmask') return gray(F.Mm, 255);
      if (outMode === 'aomap') { for (let i = 0; i < N; i++) occl[i] = 1 - occl[i] * Math.max(0.05, p.ao); return gray(occl, 255); }
      shadeOut(G, F.col, occl, o, outMode === 'albedo');
      ctx.putImageData(img, 0, 0);
    },
  });
})();
