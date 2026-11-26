/* Mountain range: distant mountains as a background impostor that tiles seamlessly in X. Two styles:
   Terrain (default): a real eroded heightfield (ridged multifractal with erosion weighting and domain
   warp: sharp alpine ridges, broad massifs, rolling hills, terraced mesas, volcanic cones, alien spires)
   in parallel mountain rows with valleys between them, ray-marched front to back per column (voxel-space
   style) with level of detail by distance and sub-pixel refinement on steep faces. The view is "unrolled":
   the noise is periodic across the strip, and every row further back holds proportionally more mountains
   (whole periods), so the strip tiles while rows still shrink with distance like real perspective; the
   terrain keeps natural proportions and is stretched vertically only up to a set limit. Each visible
   sample is lit from its true normal by a sun (direction + height) with soft cast shadows, sky light and
   cloud shadows. Materials follow altitude and slope: forest with canopy bumps, alpine meadows, rock with
   strata and variation, snow that slides off steep faces. Aerial perspective with sun in-scattering fades
   the far rows, height fog fills the valleys.
   Classic: the original ridgeline renderer: per layer a ridge profile from periodic fractal noise,
   extruded down and shaded from fake normals (profile slope blurred wider below the crest).
   Output: color, greyscale, silhouette mask or a depth map; the sky is transparent or a gradient. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, smoothstep } = U;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const perlin = U.perlin;

  // terrain amplitude per shape, relative to the main feature size
  const AMP = { alpine: 0.4, massif: 0.32, rolling: 0.16, mesa: 0.24, volcanic: 0.42, alien: 0.5 };
  const FOV = 50 * RAD; // horizontal view angle the strip stands for (sets how fast rows shrink with distance)

  /* ================= classic style (ridgeline layers) ================= */
  /* ridge height 0..1 at u in [0, 1) (period 1 => tiles), per peak shape */
  function profile(shape, u, F, p, seed) {
    const g = 0.35 + p.rough * 0.3, oct = 3 + Math.round(p.rough * 4);
    switch (shape) {
      case 'rolling': {
        const v = U.fractal('perlin', u * F, 0.5, F, 0, 3, 0.3 + p.rough * 0.15, 'fbm', seed);
        return smoothstep(0.15, 0.85, v);
      }
      case 'mesa': {
        const v = U.fractal('perlin', u * F, 0.5, F, 0, 4, 0.4, 'fbm', seed), n = U.fractal('perlin', u * F * 8, 3.5, F * 8, 0, 2, 0.5, 'fbm', seed + 5);
        return smoothstep(0.4, 0.45, v) * 0.55 + smoothstep(0.56, 0.6, v) * 0.45 + (n - 0.5) * 0.04 * (1 + p.rough) + v * 0.08;
      }
      case 'volcanic': {
        const base = U.fractal('perlin', u * F, 0.5, F, 0, oct, g, 'fbm', seed);
        let h = base * 0.35;
        const n = Math.max(1, Math.round(F * 0.5));
        for (let i = 0; i < n; i++) {
          const c = (i + 0.2 + U.hash(i, 1, seed) * 0.6) / n, r = (0.25 + U.hash(i, 2, seed) * 0.25) / n * 2.2;
          let dx = Math.abs(u - c); dx = Math.min(dx, 1 - dx);
          const t = clamp(1 - dx / r), ht = 0.55 + U.hash(i, 3, seed) * 0.45;
          let cone = Math.pow(t, 1.6) * ht;
          const rim = ht * 0.92;
          if (cone > rim) cone = rim - (cone - rim) * 0.6; // crater
          h = Math.max(h, cone + (base - 0.5) * 0.06);
        }
        return h;
      }
      case 'alien': {
        const v = U.fractal('perlin', u * F, 0.5, F, 0, oct, 0.55, 'ridged', seed);
        const sp = U.fractal('perlin', u * F * 4, 1.5, F * 4, 0, 2, 0.5, 'ridged', seed + 9);
        return Math.pow(v, 2.2) * 0.85 + Math.pow(sp, 6) * 0.35;
      }
      default: { // alpine: big crests (1 - |noise| gives sharp triangular peaks) + broad swell + jagged detail
        const P = U.perlin(u * F, 0.5, F, 0, seed), big = Math.pow(1 - Math.abs(P), 1 + p.sharp * 1.2);
        const F2 = Math.max(1, Math.round(F / 2)), sw = U.fractal('perlin', u * F2, 2.5, F2, 0, 2, 0.5, 'fbm', seed + 3);
        const det = U.fractal('perlin', u * F * 2, 4.5, F * 2, 0, oct, g, 'ridged', seed + 7);
        return big * 0.6 + sw * 0.3 + det * (0.08 + p.rough * 0.22);
      }
    }
  }
  function renderClassic(ctx, W, H, p) {
    const n = Math.max(1, p.layers | 0), seed = p.seed | 0, out = p.output, look = p.look;
    const flat = look === 'flat', toon = look === 'toon', amb = p.lightMode === 'ambient', plain = out === 'mask' || out === 'depth';
    const la = p.lightAngle * RAD, Lx0 = Math.cos(la), Lu0 = -Math.sin(la);
    const Ll = Math.hypot(Lx0, Lu0 * 0.8, 0.45);
    const Lx = Lx0 / Ll, Lu = (Lu0 * 0.8) / Ll, Lz = 0.45 / Ll;
    const C = (h) => U.hex(h).map((v) => v / 255);
    const rock = C(p.rockColor), rock2 = C(p.rockColor2), forest = C(p.forestColor), snow = C(p.snowColor);
    const haze = C(p.hazeColor), sun = C(p.sunColor), shad = C(p.shadowColor);
    const K = flat || plain ? 1 : p.shape === 'mesa' ? 3 : 5; // sub-ridges per layer (spurs in front of the main ridge)

    // blurred slope arrays of a height profile (deeper below a crest = wider flanks)
    const slopesOf = (hp, fw) => [fw * 0.006, fw * 0.035, fw * 0.11, fw * 0.28].map((r) => {
      const R = Math.round(r), b = new Float32Array(W);
      if (!R) b.set(hp);
      else {
        let sum = 0;
        for (let k = -R; k <= R; k++) sum += hp[U.mod(k, W)];
        for (let x = 0; x < W; x++) { b[x] = sum / (2 * R + 1); sum += hp[U.mod(x + R + 1, W)] - hp[U.mod(x - R, W)]; }
      }
      const sl = new Float32Array(W);
      for (let x = 0; x < W; x++) sl[x] = (b[(x + 1) % W] - b[(x - 1 + W) % W]) * 0.5;
      return sl;
    });

    // ---- per layer: main ridge profile (px up from the bottom) + sub-ridges ----
    const L = [];
    for (let li = 0; li < n; li++) {
      const d = n > 1 ? (n - 1 - li) / (n - 1) : 0; // 1 = farthest
      const F = Math.max(1, Math.round(p.peaks * (1 + d * p.layerDetail * 1.5) * W / H / 4));
      const s = seed * 97 + li * 1013;
      const drop = (1 - d) * p.layerDrop * (n > 1 ? 1 : 0);
      const hi = p.hMax * (1 - drop * 0.7), lo = p.hMin * (1 - drop * 0.85);
      const raw = new Float32Array(W);
      let mn = 1e9, mx = -1e9;
      for (let x = 0; x < W; x++) { const v = profile(p.shape, x / W, F, p, s); raw[x] = v; mn = Math.min(mn, v); mx = Math.max(mx, v); }
      const span = Math.max(0.02, hi - lo);
      const tl = lo + span * (p.forest * 0.8); // tree line (share of H)
      const TF = Math.max(8, Math.round((W / H) * 110 * (1 + d))), treeH = p.trees * (p.forest > 0 ? 1 : 0) * H * 0.014 * (1 - d * 0.5);
      const subs = [];
      for (let k = 0; k < K; k++) {
        const hp = new Float32Array(W), Fk = Math.max(1, Math.round(F * (1.5 + k * 0.6)));
        for (let x = 0; x < W; x++) {
          let h = lerp(lo, hi, (raw[x] - mn) / (mx - mn || 1)) * H;
          if (k > 0) { // a spur in front: follows the ridge, dips lower by a varying amount
            const nk = U.fractal('perlin', (x / W) * Fk, 1.5 + k * 3.3, Fk, 0, 3, 0.45, 'fbm', s + k * 59);
            h -= span * H * (k / K) * (0.1 + 1.8 * Math.pow(clamp((1 - nk) * 1.6 - 0.3), 1.3));
            h = Math.max(h, 0);
          }
          if (treeH > 0) { // tree tops below the tree line
            const fz = smoothstep(tl + 0.02, tl - 0.02, h / H);
            if (fz > 0) h += fz * treeH * (0.3 + U.fractal('value', (x / W) * TF, 0.5 + li + k * 2, TF, 0, 2, 0.5, 'fbm', s + 77) * 1.3);
          }
          hp[x] = h;
        }
        subs.push({ hp, slopes: flat || plain ? null : slopesOf(hp, W / Fk), k });
      }
      let top = H;
      for (const sb of subs) for (let x = 0; x < W; x++) top = Math.min(top, H - sb.hp[x]);
      L.push({ d, F, s, subs, main: subs[0].hp, lo, hi, span, tl, top: Math.max(0, Math.floor(top) - 1) });
    }

    const img = ctx.createImageData(W, H), D = img.data;
    const col = [0, 0, 0];
    const DF = (lay) => Math.max(2, Math.round(lay.F * 4)); // texture noise frequency (periodic in X)

    /* color of sub-ridge sb of layer lay at (x, y); nz = texture noise 0..1, ns = its x-slope */
    function shadePx(lay, sb, x, y, nz, ns) {
      if (out === 'depth') { const v = 1 - lay.d * 0.8; col[0] = col[1] = col[2] = v; return; }
      if (out === 'mask') { col[0] = col[1] = col[2] = 1; return; }
      const alt = (H - y) / H, span = lay.span, depth = y - (H - sb.hp[x]), mdepth = y - (H - lay.main[x]);
      let s = 0;
      if (sb.slopes) {
        const t = clamp(depth / (H * 0.12)) * 3, k = Math.min(2, t | 0), f = t - k;
        s = (lerp(sb.slopes[k][x], sb.slopes[k + 1][x], f) * (1 + t * 0.4) + ns * p.detail) / (1 + depth / (H * 0.3));
      }
      const sa = Math.abs(s);
      // material: rock (with strata) -> forest below the tree line -> snow above the snow line
      let c0 = rock[0], c1 = rock[1], c2 = rock[2];
      if (!flat) {
        const st = p.strata > 0 ? 0.5 + 0.5 * Math.sin(alt * (p.shape === 'mesa' ? 110 : 70) + nz * 4) : 0;
        const m = clamp(st * p.strata + (nz - 0.5) * p.detail * 0.9 + 0.2 * p.detail);
        c0 = lerp(c0, rock2[0], m); c1 = lerp(c1, rock2[1], m); c2 = lerp(c2, rock2[2], m);
      }
      if (p.forest > 0) {
        const tl = lay.tl + (nz - 0.5) * span * 0.3 - (toon ? 0 : sa * span * 0.15);
        const fz = flat ? (alt < tl ? 1 : 0) : smoothstep(tl + span * 0.02, tl - span * 0.02, alt);
        if (fz > 0) {
          const tex = flat || toon ? 1 : 0.85 + 0.3 * nz;
          c0 = lerp(c0, forest[0] * tex, fz); c1 = lerp(c1, forest[1] * tex, fz); c2 = lerp(c2, forest[2] * tex, fz);
        }
      }
      let sn = 0;
      if (p.snow > 0) {
        const sl = lay.hi - span * p.snow * 1.1 + (nz - 0.5) * span * 0.35 + p.snowSlope * Math.max(0, sa - 0.5) * span * 0.5 - span * (sb.k ? 0.08 : 0.3) * Math.exp(-depth / (H * 0.03 * (0.4 + p.snow))); // crests keep their snow caps
        sn = flat || toon ? (alt > sl ? 1 : 0) : smoothstep(sl - span * 0.01, sl + span * 0.01, alt);
        c0 = lerp(c0, snow[0], sn); c1 = lerp(c1, snow[1], sn); c2 = lerp(c2, snow[2], sn);
      }
      // light from fake normals: n = (-slope, up, toward the viewer)
      let li = 1;
      if (!flat) {
        if (amb) li = 0.72 + 0.2 * clamp(1 - sa * 0.7) + (nz - 0.5) * 0.3 * p.detail - (sb.k > 0 ? 0 : 0.04);
        else {
          const nx = -s, nu = 0.35 + sn * 0.2, nl = Math.sqrt(nx * nx + nu * nu + 0.81);
          const dif = Math.max(0, (nx * Lx + nu * Lu + 0.9 * Lz) / nl);
          li = lerp(0.8, 0.1 + dif * 1.2, p.shade);
          if (toon) li = li > 0.78 ? 1.05 : li > 0.45 ? 0.74 : 0.5;
        }
      }
      const tS = clamp(li);
      const lf = 0.45 + li * 0.75;
      col[0] = c0 * lerp(shad[0], sun[0], tS) * lf; col[1] = c1 * lerp(shad[1], sun[1], tS) * lf; col[2] = c2 * lerp(shad[2], sun[2], tS) * lf;
      // aerial haze (+ a little per sub-ridge further back) and valley fog toward the base of the layer
      const fogD = H * (0.1 + 0.3 * (1 - lay.d * 0.4));
      const hz = clamp(p.haze * Math.pow(lay.d, 0.85) * 0.88 + (toon || flat ? 0 : p.haze * (0.05 + 0.07 * (K - 1 - sb.k) / K)) + p.fog * Math.pow(clamp(mdepth / fogD), 1.4) * (0.45 + 0.55 * lay.d));
      col[0] = lerp(col[0], haze[0], hz); col[1] = lerp(col[1], haze[1], hz); col[2] = lerp(col[2], haze[2], hz);
    }

    const minTop = Math.min(...L.map((l) => l.top));
    // texture / gully noise per layer on a coarse grid that wraps in X (value + x-slope, bilinear)
    for (const lay of L) {
      if (flat || plain) continue;
      const f = DF(lay), gw = Math.max(8, Math.round(f * 12)), st = W / gw, gh = Math.ceil((H - lay.top) / st) + 2, fy = f * (H / W) * 0.9;
      const N = new Float32Array(gw * gh), S = new Float32Array(gw * gh), am = (W / f) * 0.05;
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) N[j * gw + i] = U.fractal('perlin', i / gw * f, ((lay.top + j * st) / H) * fy + lay.s * 0.01, f, 0, 3, 0.5, 'ridged', lay.s + 31);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) S[j * gw + i] = (N[j * gw + (i + 1) % gw] - N[j * gw + (i - 1 + gw) % gw]) / (2 * st) * am;
      Object.assign(lay, { gN: N, gS: S, gw, gh, st });
    }
    const smp = (lay, A, x, y) => {
      const fx = x / lay.st, fy = (y - lay.top) / lay.st, i = Math.floor(fx), j = Math.min(lay.gh - 2, Math.max(0, Math.floor(fy))), tx = fx - i, ty = clamp(fy - j);
      const i0 = i % lay.gw, i1 = (i + 1) % lay.gw, r0 = j * lay.gw, r1 = r0 + lay.gw;
      return lerp(lerp(A[r0 + i0], A[r0 + i1], tx), lerp(A[r1 + i0], A[r1 + i1], tx), ty);
    };
    for (let y = minTop; y < H; y++) {
      const o = y * W * 4;
      for (let x = 0; x < W; x++) {
        let r = 0, g = 0, b = 0, A = 0;
        for (let li = n - 1; li >= 0 && A < 0.999; li--) {
          const lay = L[li];
          for (let k = K - 1; k >= 0 && A < 0.999; k--) {
            const sb = lay.subs[k], cov = clamp(y + 1 - (H - sb.hp[x]));
            if (cov <= 0) continue;
            let nz = 0.5, ns = 0;
            if (lay.gN) { nz = smp(lay, lay.gN, x, y); ns = smp(lay, lay.gS, x, y); }
            shadePx(lay, sb, x, y, nz, ns);
            const w = (1 - A) * cov;
            r += col[0] * w; g += col[1] * w; b += col[2] * w; A += w;
          }
        }
        if (A > 0) { const i = o + x * 4; D[i] = (r / A) * 255; D[i + 1] = (g / A) * 255; D[i + 2] = (b / A) * 255; D[i + 3] = A * 255; }
      }
    }
    const grey = (dd) => { for (let i = 0; i < dd.length; i += 4) { const v = dd[i] * 0.2126 + dd[i + 1] * 0.7152 + dd[i + 2] * 0.0722; dd[i] = dd[i + 1] = dd[i + 2] = v; } };
    if (plain) for (let i = 0; i < D.length; i += 4) { const a = D[i + 3] / 255; D[i] *= a; D[i + 1] *= a; D[i + 2] *= a; D[i + 3] = 255; }
    ctx.clearRect(0, 0, W, H);
    ctx.putImageData(img, 0, 0);
    if (plain) return;
    if (p.sky === 'gradient') {
      const gr = ctx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, p.skyColor); gr.addColorStop(1, p.skyColor2);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (out === 'grey') { const im = ctx.getImageData(0, 0, W, H); grey(im.data); ctx.putImageData(im, 0, 0); }
  }

  /* ================= terrain style ================= */
  function renderTerrain(ctx, W, H, p) {
    const out = p.output, look = p.look, flat = look === 'flat', toon = look === 'toon', amb = p.lightMode === 'ambient';
    const plain = out === 'mask' || out === 'depth', seed = (p.seed | 0) * 7919 + 13, shape = AMP[p.shape] ? p.shape : 'alpine';
    const n = Math.max(1, p.layers | 0);

    /* world in units of the main feature size; camera at the origin looking along +z */
    const across = Math.max(1, p.peaks * (W / H) / 4), R0 = across / FOV; // strip width at R0 = `across` features
    const A = AMP[shape], D = R0 * p.spread * 0.8, last = R0 + D * (n - 1), D1 = n > 1 ? D : R0 * 0.5;
    const rMax = last + D1 * 1.6, camH = A * 0.3, hCap = A * 1.35 + camH;
    const pxAng = FOV / W, maxOct = clamp(p.octaves | 0, 3, 12);
    const sharpE = 1 + p.sharp * 2.2, gain = 0.3 + p.rough * 0.26, ero = 0.6 + p.detail * 2.4, wk = p.warp * 1.2;
    const treeAlt = A * p.forest * 0.75, treeOn = p.forest > 0 && p.trees > 0, canopy = A * 0.018 * p.trees;
    // features across the strip per row: even whole numbers (tiles; half-frequency warp keeps whole periods)
    const P = [];
    for (let k = 0; k < n; k++) P.push(Math.max(2, Math.round((across * (R0 + k * D1)) / R0 / 2) * 2));
    const Pf = Math.max(2, Math.round(across * 3));

    // shape value 0..~1 at (X, Z), X periodic over Px, with `oct` octaves (fractional = the last one fades in)
    function shapeVal(X, Z, Px, oct, sd) {
      if (wk > 0) { X += perlin(X * 0.5, Z * 0.5, Px / 2, 0, sd + 3) * wk; Z += perlin(X * 0.5 + 5.2, Z * 0.5 + 1.3, Px / 2, 0, sd + 5) * wk; }
      const on = Math.ceil(oct), fo = oct - Math.floor(oct) || 1;
      let sum = 0, norm = 0, amp = 1, f = 1, w = 1;
      switch (shape) {
        case 'rolling': {
          for (let o = 0; o < on; o++) { const a = amp * (o === on - 1 ? fo : 1); sum += perlin(X * f, Z * f, Px * f, 0, sd + o * 31) * a * (o ? w : 1); norm += amp; if (!o) w = 0.6 + 0.4 * p.detail; amp *= gain * 0.75; f *= 2; }
          return smoothstep(-0.55, 0.65, (sum / norm) * 1.6);
        }
        case 'mesa': {
          let v = 0, nn = 0, a = 1;
          for (let o = 0; o < 3; o++) { v += perlin(X * f, Z * f, Px * f, 0, sd + o * 31) * a; nn += a; a *= 0.45; f *= 2; }
          v = clamp((v / nn) * 1.4 + 0.5);
          const q = v * 3, fl = Math.floor(q), fr = q - fl, k = 0.06 + 0.12 * (1 - p.sharp);
          let h = (fl + smoothstep(0.82 - k, 0.9, fr)) / 3 + fr * 0.04; // flat tops, steep cliffs between the levels
          for (let o = 3; o < on; o++) { const g = 1 - Math.abs(perlin(X * f, Z * f, Px * f, 0, sd + o * 31)); h += (g * g - 0.5) * a * 0.35 * (o === on - 1 ? fo : 1); a *= gain; f *= 2; }
          return h;
        }
        case 'volcanic': {
          const c = U.worley(X * 0.5, Z * 0.5, Px / 2, 0, sd + 77), f1 = c.f1, ht = 0.5 + 0.5 * c.id;
          let cone = Math.pow(clamp(1 - f1 / 0.85), 1.5) * ht;
          const rim = ht * 0.88;
          if (cone > rim) cone = rim - (cone - rim) * 1.4; // crater
          let det = 0; norm = 0; amp = 1; f = 2;
          for (let o = 0; o < on; o++) { let s = 1 - Math.abs(perlin(X * f, Z * f, Px * f, 0, sd + o * 31)); s = s * s * w; w = clamp(s * ero); det += s * amp * (o === on - 1 ? fo : 1); norm += amp; amp *= gain; f *= 2; }
          return cone * 0.85 + (det / norm) * (0.2 + 0.25 * (1 - cone));
        }
        default: {
          // broad massif (half frequency) + one set of main ridges: the big, calm forms that read from far away
          const massif = shape === 'massif', alien = shape === 'alien';
          const base = 0.5 + 0.62 * perlin(X * 0.5, Z * 0.5, Px / 2, 0, sd + 1);
          const n0 = perlin(X, Z, Px, 0, sd);
          let r1 = massif ? 0.7 - Math.abs(n0) * 0.45 + n0 * 0.3 : 1 - Math.abs(n0);
          r1 = r1 > 0 ? Math.pow(r1, sharpE) : 0;
          let v = base * 0.5 + r1 * 0.62 * clamp(base + 0.35);
          // crest detail: ridged octaves weighted by the height so far (erosion: rough ridges, smooth valleys)
          w = clamp(v * ero * 0.6); amp = 0.5; f = 2;
          for (let o = 1; o < on; o++) {
            let s = 1 - Math.abs(perlin(X * f, Z * f, Px * f, 0, sd + o * 31));
            s = s * s * w; w = clamp(s * ero);
            v += s * amp * 0.42 * (o === on - 1 ? fo : 1); amp *= gain; f *= 2;
          }
          if (alien) { v = Math.pow(Math.max(0, v), 1.6) * 1.2; const sp = 1 - Math.abs(perlin(X * 4, Z * 4, Px * 4, 0, sd + 991)); v += Math.pow(sp, 9) * 0.45 * v; }
          return v * (massif ? 0.95 : 1.05);
        }
      }
    }
    // row envelope at distance r: parallel rows with valleys between, near rows lower, nothing past the last row
    function env(r) {
      const t = (r - R0) / D1;
      const inside = smoothstep(R0 - 0.5 * D1, R0 - 0.05 * D1, r) * smoothstep(last + 0.95 * D1, last + 0.35 * D1, r);
      const row = n > 1 ? lerp(1, 0.5 + 0.5 * Math.cos(TAU * t), p.sep) : 1;
      const drop = n > 1 ? 1 - p.layerDrop * 0.8 * (1 - clamp(t / (n - 1))) : 1;
      return inside * row * drop;
    }
    // one row: shape × macro massifs (some stretches of the range stand much higher than others); whole periods
    function rowVal(u, r, k, oct) {
      const Pk = P[k], h2 = Pk / 2, s = shapeVal(u * Pk, r, Pk, oct, seed + k * 1013);
      if (shape === 'mesa') return s;
      const mac = perlin(u * h2 + 0.37, r * 0.25, h2, 0, seed + 811 + k) + 0.5 * perlin(u * Pk, r * 0.5, Pk, 0, seed + 812 + k);
      return s * (0.55 + 0.7 * clamp(0.5 + mac * 0.8));
    }
    // terrain height at strip position u (0..1) and distance r; rows blend in the valleys between them
    function height(u, r, oct) {
      const t = (r - R0) / D1;
      let k0 = 0, k1 = 0, wb = 0;
      if (n > 1 && t > 0) {
        if (t >= n - 1) k0 = k1 = n - 1;
        else { k0 = Math.floor(t); k1 = k0 + 1; wb = smoothstep(0.3, 0.7, t - k0); }
      }
      const e = env(r);
      let h = 0;
      if (e > 0.002) {
        let s = wb < 1 ? rowVal(u, r, k0, oct) : 0;
        if (wb > 0) s = lerp(s, rowVal(u, r, k1, oct), wb);
        h = e * A * s;
      }
      if (p.foreground > 0 && r < R0) { // foothills in front of the first row
        const fg = p.foreground * 0.25 * A * smoothstep(R0 - 0.3 * D1, R0 * 0.35, r) * smoothstep(0, R0 * 0.3, r);
        if (fg > 0) h += fg * (0.5 + 0.5 * (perlin(u * Pf, (r / R0) * 6, Pf, 0, seed + 401) + 0.5 * perlin(u * Pf * 2, (r / R0) * 12, Pf * 2, 0, seed + 402)));
      }
      if (treeOn && oct > 4.5 && h < treeAlt + A * 0.1) { // tree canopy bumps below the tree line
        const fm = smoothstep(treeAlt + A * 0.06, treeAlt - A * 0.04, h) * clamp(oct - 4.5);
        const Pk = P[k0] * 48;
        if (fm > 0) h += fm * canopy * (0.5 + 0.5 * perlin(u * Pk, r * 48, Pk, 0, seed + 501));
      }
      return h;
    }
    const lod = (r) => clamp(Math.log2(1 / (r * pxAng)) + 0.5, 2, maxOct);

    /* ---- vertical fit: horizon at hMin, highest point at hMax, but never stretched beyond the limit ---- */
    const rFirst = Math.max(1e-3, R0 - 0.55 * D1);
    let phiMax = 0.01;
    for (let i = 0; i < 160; i++) {
      const u = (i + 0.5) / 160;
      for (let r = p.foreground > 0 ? R0 * 0.3 : rFirst; r < rMax; r *= 1.02) { const ph = Math.atan2(height(u, r, 4) - camH, r); if (ph > phiMax) phiMax = ph; }
    }
    const hY = H * (1 - p.hMin), nat = W / FOV;
    const exag = Math.min((Math.max(0.03, p.hMax - p.hMin) * H) / phiMax / nat, Math.max(0.5, p.stretch)), sY = nat * exag;
    const sn = clamp(Math.sqrt(exag), 1, 3); // shading slopes follow the stretched silhouette a little
    // start where the ground projects below the image bottom (flat land before the first row)
    const rMin = Math.max(1e-3, Math.min(p.foreground > 0 ? R0 * 0.3 : rFirst, (camH * sY) / (H - hY + 2)));

    /* ---- colors, light ---- */
    const C = (h) => U.hex(h).map((v) => v / 255);
    const rock = C(p.rockColor), rock2 = C(p.rockColor2), forest = C(p.forestColor), meadowC = C(p.meadowColor), snowC = C(p.snowColor);
    const hazeC = C(p.hazeColor), fogC = C(p.fogColor), sun = C(p.sunColor), skyL = C(p.shadowColor);
    const az = p.sunAz * RAD, el = Math.max(1, p.sunElev) * RAD, Ly = Math.sin(el), Lx = Math.sin(az) * Math.cos(el), Lz = -Math.cos(az) * Math.cos(el);
    const shadOn = !flat && !amb && !plain && p.shadows > 0;
    const hazeK = (p.haze * 2.6) / (last + D1 - R0 * 0.5), fogTop = A * p.fogHeight * 0.6, fogK = p.fog;
    const snowAlt = A * (1.02 - p.snow * 1.1), snowB = A * 0.05, slopeCut = 0.45 + (1 - p.snowSlope) * 0.45;
    const meadowTop = treeAlt + A * p.meadow * 0.35, contrast = p.shade;
    const glow = amb ? 0 : p.sunGlow * (0.25 + 0.75 * Math.pow(Math.max(0, -Math.cos(az)), 2)) * (1.2 - Ly);
    const hz = [hazeC[0] + sun[0] * glow * 0.45, hazeC[1] + sun[1] * glow * 0.45, hazeC[2] + sun[2] * glow * 0.45];
    const hazeAt = (r) => Math.exp(-Math.max(0, r - R0 * 0.5) * hazeK);

    function shadow(u, r, h) { // soft shadow toward the sun, in the slightly stretched slope space
      let res = 1, t = 0.012;
      const y0 = h * sn;
      for (let i = 0; i < 9; i++) {
        const rr = r + Lz * t;
        if (rr < rMin || rr > rMax * 1.1) break;
        const d = y0 + Ly * t - height(u + (Lx * t) / (FOV * rr), rr, 2.5) * sn;
        if (d < 0) return 0;
        res = Math.min(res, (10 * d) / t);
        t *= 1.75;
      }
      return clamp(res);
    }

    // soft shadows on a coarse (strip × log distance) grid: a fixed cost, independent of the export size
    let shG = null, gu = 0, gr = 0;
    const lr0 = Math.log(rMin), lr1 = Math.log(rMax);
    if (shadOn) {
      gu = Math.min(640, Math.max(64, Math.round(W / 2))); gr = Math.min(150, Math.max(40, Math.round(H * 0.6)));
      shG = new Float32Array(gu * gr);
      for (let j = 0; j < gr; j++) {
        const r = Math.exp(lr0 + ((lr1 - lr0) * j) / (gr - 1));
        for (let i = 0; i < gu; i++) { const u = i / gu; shG[j * gu + i] = shadow(u, r, height(u, r, 4)); }
      }
    }
    const shadowAt = (u, r) => {
      const fu = u * gu, fr = clamp((Math.log(r) - lr0) / (lr1 - lr0)) * (gr - 1), i = Math.floor(fu), j = Math.min(gr - 2, Math.floor(fr)), tu = fu - i, tr = fr - j;
      const i0 = ((i % gu) + gu) % gu, i1 = (i0 + 1) % gu, a = shG[j * gu + i0], b = shG[j * gu + i1], c = shG[(j + 1) * gu + i0], d = shG[(j + 1) * gu + i1];
      return lerp(lerp(a, b, tu), lerp(c, d, tu), tr);
    };

    const col = [0, 0, 0];
    function shadeAt(u, r, h, oct) {
      if (out === 'depth') { const v = 1 - Math.sqrt(clamp((r - rMin) / (rMax - rMin))); col[0] = col[1] = col[2] = v; return; }
      if (out === 'mask') { col[0] = col[1] = col[2] = 1; return; }
      if (flat) { // one tone per row: haze from the row's distance
        const b = r < R0 - D1 * 0.5 ? -0.6 : Math.min(n - 1, Math.round((r - R0) / D1)), Tb = hazeAt(R0 + b * D1);
        col[0] = lerp(hz[0], rock[0], Tb); col[1] = lerp(hz[1], rock[1], Tb); col[2] = lerp(hz[2], rock[2], Tb);
        return;
      }
      // normal from the height field at the pixel footprint
      const e = Math.max(r * pxAng * 0.75, 1e-4);
      const hx = height(u + e / (FOV * r), r, oct), hzz = height(u, r + e, oct);
      let nx = -((hx - h) / e) * sn, nz = -((hzz - h) / e) * sn;
      const ny = 1 / Math.sqrt(nx * nx + nz * nz + 1);
      nx *= ny; nz *= ny;
      const Pm = P[Math.max(0, Math.min(n - 1, Math.round((r - R0) / D1)))];
      const n1 = 0.5 + 0.5 * perlin(u * Pm * 6, r * 6, Pm * 6, 0, seed + 601), n2 = 0.5 + 0.5 * perlin(u * Pm * 18, r * 18, Pm * 18, 0, seed + 602);
      const nzv = n1 * 0.7 + n2 * 0.3, steep = 1 - ny;
      // material: rock (variation, strata) -> meadow -> forest -> snow
      let m = p.rockVar * smoothstep(0.35, 0.75, nzv + steep * 0.3);
      if (p.strata > 0) m = clamp(m + p.strata * (0.5 + 0.5 * Math.sin((h / A) * (shape === 'mesa' ? 75 : 46) + nzv * 3)) * smoothstep(0.15, 0.5, steep + 0.2));
      let c0 = lerp(rock[0], rock2[0], m), c1 = lerp(rock[1], rock2[1], m), c2 = lerp(rock[2], rock2[2], m);
      if (!toon) { const v = 0.88 + 0.24 * n2; c0 *= v; c1 *= v; c2 *= v; }
      if (p.meadow > 0) {
        const mm = smoothstep(meadowTop + A * 0.03, meadowTop - A * 0.03, h + (nzv - 0.5) * A * 0.15) * smoothstep(0.35, 0.75, ny);
        if (mm > 0) { c0 = lerp(c0, meadowC[0], mm); c1 = lerp(c1, meadowC[1], mm); c2 = lerp(c2, meadowC[2], mm); }
      }
      if (p.forest > 0) {
        const fm = smoothstep(treeAlt + A * 0.03, treeAlt - A * 0.03, h + (nzv - 0.5) * A * 0.18) * smoothstep(0.3, 0.6, ny);
        if (fm > 0) { const tv = toon ? 1 : 1 - p.trees * 0.35 * n2; c0 = lerp(c0, forest[0] * tv, fm); c1 = lerp(c1, forest[1] * tv, fm); c2 = lerp(c2, forest[2] * tv, fm); }
      }
      if (p.snow > 0) {
        let s = smoothstep(snowAlt - snowB, snowAlt + snowB, h + (nzv - 0.5) * A * 0.22) * smoothstep(slopeCut - 0.08, slopeCut + 0.08, ny + (n2 - 0.5) * 0.15);
        if (toon) s = s > 0.5 ? 1 : 0;
        c0 = lerp(c0, snowC[0], s); c1 = lerp(c1, snowC[1], s); c2 = lerp(c2, snowC[2], s);
      }
      // light: sun (soft cast shadow, cloud shadows) + sky light
      let lr, lg, lb;
      if (amb) {
        const a = (0.5 + 0.5 * ny) * (0.8 + 0.2 * nzv) * (1.25 - 0.35 * contrast) + 0.15;
        lr = a * lerp(1, skyL[0] * 1.6, 0.3); lg = a * lerp(1, skyL[1] * 1.6, 0.3); lb = a * lerp(1, skyL[2] * 1.6, 0.3);
      } else {
        let dif = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
        if (shadOn && dif > 0) dif *= lerp(1, shadowAt(u, r), p.shadows);
        if (p.clouds > 0) dif *= 1 - p.clouds * 0.75 * smoothstep(0.5, 0.7, 0.5 + 0.5 * (perlin(u * Pm * 0.5 + 3.7, r * 0.5, Pm * 0.5, 0, seed + 701) + 0.5 * perlin(u * Pm, r, Pm, 0, seed + 702)));
        if (toon) dif = dif > 0.45 ? 1 : dif > 0.12 ? 0.55 : 0.18;
        const ks = (0.75 + 1.1 * contrast) / Math.max(0.35, Ly + 0.3), ka = (1.15 - 0.6 * contrast) * (0.55 + 0.45 * ny);
        lr = sun[0] * dif * ks + skyL[0] * ka; lg = sun[1] * dif * ks + skyL[1] * ka; lb = sun[2] * dif * ks + skyL[2] * ka;
      }
      let r0 = c0 * lr, g0 = c1 * lg, b0 = c2 * lb;
      if (fogK > 0) { // valley fog: dense low down, fades up the slopes
        const f = fogK * (1 - smoothstep(0, fogTop, h + (n1 - 0.5) * fogTop * 0.5)) * smoothstep(R0 * 0.6, R0, r);
        r0 = lerp(r0, fogC[0], f); g0 = lerp(g0, fogC[1], f); b0 = lerp(b0, fogC[2], f);
      }
      const T = hazeAt(r); // aerial perspective
      col[0] = lerp(hz[0], r0, T); col[1] = lerp(hz[1], g0, T); col[2] = lerp(hz[2], b0, T);
    }

    /* ---- march every column front to back ---- */
    const img = ctx.createImageData(W, H), Dd = img.data;
    const cr = new Float32Array(H), cg = new Float32Array(H), cb = new Float32Array(H), ca = new Float32Array(H);
    const kStep = (pxAng * 4) / Math.max(1, Math.sqrt(exag));
    let ymin = H;
    const put = (yf) => { // cover rows [yf, ymin) with the current color (fractional coverage at both ends)
      const y0 = Math.max(0, yf), j0 = Math.floor(y0), j1 = Math.min(H - 1, Math.ceil(ymin) - 1);
      for (let j = j0; j <= j1; j++) {
        const part = Math.min(j + 1, ymin) - Math.max(j, y0);
        if (part <= 0) continue;
        const a = ca[j], t = a + part;
        cr[j] = (cr[j] * a + col[0] * part) / t; cg[j] = (cg[j] * a + col[1] * part) / t; cb[j] = (cb[j] * a + col[2] * part) / t; ca[j] = Math.min(1, t);
      }
      ymin = yf;
    };
    const proj = (h, r) => hY - Math.atan2(h - camH, r) * sY, slopeMax = A * 3.5;
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      cr.fill(0); cg.fill(0); cb.fill(0); ca.fill(0);
      ymin = H;
      let rPrev = rMin;
      for (let r = rMin, dr = 0; r < rMax; r += dr) {
        dr = r * kStep;
        const oct = lod(r), h = height(u, r, oct), yf = proj(h, r);
        if (yf < ymin) {
          const jump = ymin - yf;
          if (jump > 1.6 && ymin < H) { // steep face: refine between the last step and this one
            const m = Math.min(48, Math.ceil(jump / 1.1));
            for (let q = 1; q < m; q++) {
              const rr = rPrev + ((r - rPrev) * q) / m, oq = lod(rr), hh = height(u, rr, oq), yy = proj(hh, rr);
              if (yy < ymin) { shadeAt(u, rr, hh, oq); put(yy); }
            }
          }
          if (yf < ymin) { shadeAt(u, r, h, oct); put(yf); }
        }
        if (ymin <= 0) break;
        if (proj(hCap, r) > ymin) break; // nothing further back can rise above what is drawn
        // skip ahead while the terrain stays well below the line of sight over what is already drawn
        const tOcc = (hY - ymin) / sY;
        if (tOcc > 0) { const gap = camH + r * Math.tan(tOcc) - h; if (gap > 0) dr = Math.max(dr, gap / slopeMax); }
        rPrev = r;
      }
      // beyond the last row: flat, fully hazed land up to the horizon
      if (ymin > hY) {
        if (out === 'mask') col[0] = col[1] = col[2] = 1;
        else if (out === 'depth') col[0] = col[1] = col[2] = 0.02;
        else { col[0] = hz[0]; col[1] = hz[1]; col[2] = hz[2]; }
        put(hY);
      }
      for (let y = 0; y < H; y++) {
        const a = ca[y];
        if (a <= 0) continue;
        const i = (y * W + x) * 4;
        Dd[i] = clamp(cr[y]) * 255; Dd[i + 1] = clamp(cg[y]) * 255; Dd[i + 2] = clamp(cb[y]) * 255; Dd[i + 3] = a * 255;
      }
    }

    if (plain) for (let i = 0; i < Dd.length; i += 4) { const a = Dd[i + 3] / 255; Dd[i] *= a; Dd[i + 1] *= a; Dd[i + 2] *= a; Dd[i + 3] = 255; }
    ctx.clearRect(0, 0, W, H);
    ctx.putImageData(img, 0, 0);
    if (plain) return;
    if (p.sky === 'gradient') {
      const gr = ctx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, p.skyColor); gr.addColorStop(1, p.skyColor2);
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (out === 'grey') {
      const im = ctx.getImageData(0, 0, W, H), dd = im.data;
      for (let i = 0; i < dd.length; i += 4) { const v = dd[i] * 0.2126 + dd[i + 1] * 0.7152 + dd[i + 2] * 0.0722; dd[i] = dd[i + 1] = dd[i + 2] = v; }
      ctx.putImageData(im, 0, 0);
    }
  }

  const terrain = (p) => p.style !== 'classic', classic = (p) => p.style === 'classic';
  const lit = (p) => p.look !== 'flat';
  const sunOn = (p) => lit(p) && terrain(p) && p.lightMode !== 'ambient';

  U.register({
    id: 'mountains',
    name: 'Mountain Range',
    desc: 'Distant mountain ranges rendered from a real eroded terrain: rows of ridges fading into aerial haze, valley fog, sun and cast shadows, snow, rock, meadow and forest, tiling seamlessly from left to right; plus the classic ridgeline-layer style',
    uses: [
      'Background impostors for open-world, flight and racing games: a horizon strip that tiles horizontally (wraps around a skybox or a cylinder), with a mask and a depth map to split or fog the layers in the engine.',
      'Parallax backdrops for 2D games, menus and title screens, from realistic alpine ranges to toon layers and alien worlds.',
    ],
    tags: ['Nature', 'Lighting'],
    aspect: '4:1',
    bg: 'checker',
    icon: U.icon('<path d="M2 20l6-10 3 4 4-8 7 14z"/><path d="M13.2 9.6l1.8-3.6 1.8 3.6-1 .8-.8-.8-.8.8z" fill="currentColor" stroke="none"/><path d="M2 20l4-4 3 2" opacity=".6"/>'),
    params: [
      { type: 'section', label: 'Mountains' },
      { key: 'style', label: 'Style', type: 'select', default: 'terrain', options: [['terrain', 'Terrain (realistic, rendered)'], ['classic', 'Classic (ridgeline layers)']], tip: 'Terrain: a real eroded landscape seen from a camera, lit by a sun with cast shadows. Classic: the original fast renderer: extruded ridgelines per layer with stylized shading' },
      { key: 'shape', label: 'Peaks', type: 'select', default: 'alpine', options: [['alpine', 'Alpine (sharp ridges)'], ['massif', 'Massif (broad, eroded)'], ['rolling', 'Rolling hills'], ['mesa', 'Mesas & plateaus'], ['volcanic', 'Volcanic cones'], ['alien', 'Alien spires']], tip: 'Massif is terrain style only (classic draws it as alpine)' },
      { key: 'hMin', key2: 'hMax', label: 'Height', type: 'span', min: 0, max: 1, step: 0.01, default: 0.08, default2: 0.7, tip: 'Terrain: horizon (eye level) … highest peak as a share of the image height (within the stretch limit). Classic: lowest and highest ridge point of the farthest layer' },
      { key: 'stretch', label: 'Max vertical stretch', type: 'range', min: 0.5, max: 6, step: 0.05, default: 2, show: terrain, tip: 'How far the terrain may be stretched upward to reach the height above. 1 = true proportions (calm, distant look); higher = more dramatic but pointier' },
      { key: 'peaks', label: 'Peaks across', type: 'int', min: 1, max: 24, default: 5, tip: 'Size of the main mountains: how many fit across a 4:1 strip in the nearest row (rows further back hold more)' },
      { key: 'sharp', label: 'Sharpness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.shape === 'alpine' || (terrain(p) && (p.shape === 'massif' || p.shape === 'alien' || p.shape === 'mesa')), tip: 'Rounded summits (0) to knife-edge ridges and arêtes (1); mesas: softer or harder cliffs' },
      { key: 'rough', label: 'Ridge roughness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'How much small-scale relief sits on the big forms: notches, towers and crags' },
      { key: 'detail', label: 'Erosion & gullies', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Terrain: erosion weighting: detail gathers on the ridges, valleys stay smooth, faces get carved by gullies and spurs. Classic: vertical relief on the faces' },
      { key: 'warp', label: 'Range twist', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: terrain, tip: 'Domain warp: bends ridges into curving, branching ranges' },
      { key: 'octaves', label: 'Detail level', type: 'int', min: 3, max: 12, default: 9, show: terrain, tip: 'Finest terrain detail (octaves). Far rows automatically use fewer, so they stay clean' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 5 },

      { type: 'section', label: 'Layers' },
      { key: 'layers', label: 'Mountain rows', type: 'int', min: 1, max: 6, default: 4, tip: 'Ranges behind each other, each further away (smaller and hazier)' },
      { key: 'spread', label: 'Row spacing', type: 'range', min: 0.15, max: 2, step: 0.01, default: 0.6, show: (p) => terrain(p) && p.layers > 1, tip: 'Distance between the rows: small = tightly packed ridges, large = rows far apart with strong depth' },
      { key: 'layerDrop', label: 'Near rows lower', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.layers > 1, tip: 'How much lower the nearer rows are, so the far peaks show above them' },
      { key: 'sep', label: 'Valleys between rows', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, show: (p) => terrain(p) && p.layers > 1, tip: 'Deep valleys separate the rows (layered look, fog collects there) or one continuous massif' },
      { key: 'layerDetail', label: 'Far layer detail', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: classic, tip: 'Far layers get more, smaller peaks' },
      { key: 'foreground', label: 'Foreground hills', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: terrain, tip: 'Low foothills in front of the first row' },

      { type: 'section', label: 'Atmosphere' },
      { key: 'haze', label: 'Aerial haze', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Aerial perspective: distant terrain fades into the haze color' },
      { key: 'hazeColor', label: 'Haze color', type: 'color', default: '#b4c4d8' },
      { key: 'sunGlow', label: 'Sun glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: sunOn, tip: 'The haze lights up in the sun color, strongest when the sun is ahead (in-scattering)' },
      { key: 'fog', label: 'Valley fog', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Fog lying in the valleys and at the base of the ranges' },
      { key: 'fogHeight', label: 'Fog height', type: 'range', min: 0.02, max: 1, step: 0.01, default: 0.25, show: (p) => terrain(p) && p.fog > 0, tip: 'How high the fog reaches up the slopes' },
      { key: 'fogColor', label: 'Fog color', type: 'color', default: '#dde6ee', show: (p) => terrain(p) && p.fog > 0 },
      { key: 'clouds', label: 'Cloud shadows', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, show: sunOn, tip: 'Large soft shadows of clouds drifting over the ranges' },

      { type: 'section', label: 'Surface' },
      { key: 'snow', label: 'Snow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Snow line: 0 = no snow, 1 = snow down to the valleys' },
      { key: 'snowSlope', label: 'Bare steep slopes', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.snow > 0, tip: 'Snow slides off steep faces: rock shows through on cliffs and arêtes' },
      { key: 'forest', label: 'Forest / grass', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Tree line height: the lower slopes are covered in forest' },
      { key: 'trees', label: 'Tree canopy', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.forest > 0, tip: 'Bumpy tree tops along forested ridges' },
      { key: 'meadow', label: 'Alpine meadows', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: terrain, tip: 'Grass band between the tree line and the bare rock' },
      { key: 'strata', label: 'Rock strata', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Horizontal rock layers (strong on mesas)' },
      { key: 'rockVar', label: 'Rock variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: terrain, tip: 'Patches of the second rock color, scree and darker outcrops' },
      { key: 'rockColor', label: 'Rock color', type: 'color', default: '#7a7470' },
      { key: 'rockColor2', label: 'Rock color 2', type: 'color', default: '#5c5654', show: (p) => p.strata > 0 || p.rockVar > 0 || p.detail > 0 },
      { key: 'meadowColor', label: 'Meadow color', type: 'color', default: '#7a8a4c', show: (p) => terrain(p) && p.meadow > 0 },
      { key: 'forestColor', label: 'Forest color', type: 'color', default: '#3c5a34', show: (p) => p.forest > 0 },
      { key: 'snowColor', label: 'Snow color', type: 'color', default: '#f2f5fa', show: (p) => p.snow > 0 },

      { type: 'section', label: 'Lighting' },
      { key: 'look', label: 'Look', type: 'select', default: 'shaded', options: [['shaded', 'Shaded'], ['toon', 'Toon (hard light bands)'], ['flat', 'Flat (one tone per row)']] },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'angled', options: [['angled', 'Sun (directional)'], ['ambient', 'Ambient (overcast, no direction)']], show: lit, tip: 'Ambient: soft light from the whole sky, like an overcast day: no lit or shadowed flanks' },
      { key: 'sunAz', label: 'Sun direction', type: 'range', min: -180, max: 180, step: 1, default: -60, show: sunOn, tip: '0 = sun behind you (front-lit), ±90 = from the side, ±180 = sun behind the mountains (backlit silhouettes, glowing haze)' },
      { key: 'sunElev', label: 'Sun height', type: 'range', min: 1, max: 80, step: 1, default: 24, show: sunOn, tip: 'Sun elevation in degrees: low = long shadows and golden light' },
      { key: 'shadows', label: 'Cast shadows', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, show: sunOn, tip: 'Ridges cast soft shadows onto the slopes behind them' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -150, show: (p) => classic(p) && lit(p) && p.lightMode !== 'ambient', tip: 'Direction the sun comes from (180 = left, 0 = right, -90 = above)' },
      { key: 'shade', label: 'Light contrast', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, show: lit },
      { key: 'sunColor', label: 'Sun color', type: 'color', default: '#fff3e2', show: lit },
      { key: 'shadowColor', label: 'Shadow color', type: 'color', default: '#5e6c92', show: lit, tip: 'Sky light: tint of the faces in shadow' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color'], ['grey', 'Greyscale'], ['mask', 'Silhouette mask'], ['depth', 'Depth map']], tip: 'Mask: white mountains on black. Depth: near = white, far = dark, sky = black (terrain: continuous distance; classic: one grey per layer)' },
      { key: 'sky', label: 'Sky', type: 'select', default: 'transparent', options: [['transparent', 'Transparent'], ['gradient', 'Gradient']], show: (p) => p.output === 'color' || p.output === 'grey' },
      { key: 'skyColor', label: 'Sky color', type: 'color', default: '#5f8fcc', show: (p) => p.sky === 'gradient' && (p.output === 'color' || p.output === 'grey') },
      { key: 'skyColor2', label: 'Horizon color', type: 'color', default: '#d4e2ee', show: (p) => p.sky === 'gradient' && (p.output === 'color' || p.output === 'grey') },
    ],
    presets: [
      { name: 'Alps', group: 'Realistic', values: { seed: 5 } },
      { name: 'Distant alpine panorama', group: 'Realistic', values: { stretch: 1.6, peaks: 7, hMax: 0.55, layers: 5, spread: 0.5, haze: 0.7, fog: 0.35, seed: 21 } },
      { name: 'Rockies', group: 'Realistic', values: { peaks: 4, sharp: 0.45, rough: 0.6, snow: 0.25, forest: 0.5, trees: 0.6, meadow: 0.15, forestColor: '#2e4630', rockColor: '#6e6860', rockColor2: '#4e4a46', haze: 0.55, hazeColor: '#a8b8cc', seed: 12 } },
      { name: 'Himalaya giants', group: 'Realistic', values: { peaks: 3, hMax: 0.92, stretch: 2.8, sharp: 0.85, rough: 0.7, detail: 0.8, snow: 0.65, snowSlope: 0.75, forest: 0, meadow: 0, layers: 3, spread: 0.9, layerDrop: 0.65, haze: 0.5, hazeColor: '#9ab0cc', shadowColor: '#4a5a88', sunElev: 30, seed: 31 } },
      { name: 'Winter range', group: 'Realistic', values: { snow: 0.92, snowSlope: 0.35, forest: 0.25, trees: 0.5, meadow: 0, forestColor: '#2a3a34', haze: 0.55, hazeColor: '#c8d4e2', fogColor: '#e8eef6', sunColor: '#f4f6ff', shadowColor: '#7080a8', seed: 18 } },
      { name: 'Dolomites', group: 'Realistic', values: { stretch: 3.2, shape: 'massif', peaks: 6, sharp: 0.9, rough: 0.75, detail: 0.85, strata: 0.45, rockColor: '#b4aa98', rockColor2: '#8a8070', snow: 0.15, forest: 0.3, meadow: 0.5, meadowColor: '#86964e', sunAz: -95, sunElev: 12, sunColor: '#ffd8a8', seed: 44 } },
      { name: 'Rolling green hills', group: 'Realistic', values: { shape: 'rolling', peaks: 3, hMax: 0.5, stretch: 3, rough: 0.3, detail: 0.3, snow: 0, forest: 1, trees: 0.35, meadow: 0, forestColor: '#4e7a3a', strata: 0, rockVar: 0.2, haze: 0.6, hazeColor: '#b8cede', layerDrop: 0.4, fog: 0.15, seed: 8 } },
      { name: 'Desert mesas', group: 'Realistic', values: { shape: 'mesa', peaks: 3, hMax: 0.55, stretch: 2.5, sharp: 0.7, rough: 0.4, detail: 0.5, snow: 0, forest: 0, meadow: 0, strata: 0.8, rockVar: 0.6, rockColor: '#b46a3e', rockColor2: '#8e4a2a', haze: 0.55, hazeColor: '#e0b898', sunColor: '#fff0d8', shadowColor: '#7a5a6a', fog: 0, clouds: 0, layers: 3, seed: 22 } },
      { name: 'Volcanic', group: 'Realistic', values: { stretch: 2.6, shape: 'volcanic', peaks: 3, hMax: 0.8, rough: 0.35, detail: 0.7, snow: 0.2, snowSlope: 0.4, forest: 0.2, meadow: 0.1, forestColor: '#3a4a30', rockColor: '#4a4440', rockColor2: '#2e2a28', strata: 0.1, haze: 0.5, hazeColor: '#a8b0bc', layers: 3, seed: 4 } },
      { name: 'Misty blue mountains', group: 'Realistic', values: { stretch: 3.5, shape: 'massif', peaks: 4, sharp: 0.3, hMax: 0.72, rough: 0.45, snow: 0, forest: 1, trees: 0.5, meadow: 0, forestColor: '#2a4038', layers: 6, spread: 0.45, layerDrop: 0.55, sep: 0.8, haze: 0.85, fog: 0.75, fogHeight: 0.35, fogColor: '#c8d6e6', hazeColor: '#a8bcd8', lightMode: 'ambient', seed: 27 } },
      { name: 'Highlands', group: 'Realistic', values: { shape: 'rolling', peaks: 2, hMax: 0.6, stretch: 3, rough: 0.6, detail: 0.7, snow: 0, forest: 0, meadow: 1, meadowColor: '#6a7a44', rockColor: '#6a6458', haze: 0.6, hazeColor: '#b8c2cc', lightMode: 'ambient', clouds: 0, seed: 15 } },
      { name: 'Sunset range', group: 'Realistic', values: { peaks: 4, snow: 0.35, sunAz: 160, sunElev: 6, shade: 0.85, sunColor: '#ffb070', shadowColor: '#4a3a6a', hazeColor: '#e89a80', fogColor: '#e8b0a0', sunGlow: 0.7, haze: 0.7, fog: 0.25, sky: 'gradient', skyColor: '#3a3a7a', skyColor2: '#f8a070', seed: 9 } },
      { name: 'Golden hour, front-lit', group: 'Realistic', values: { peaks: 5, sunAz: -20, sunElev: 8, sunColor: '#ffc890', shadowColor: '#56608e', hazeColor: '#c8c0c8', haze: 0.55, snow: 0.45, seed: 37 } },
      { name: 'Night silhouette', group: 'Stylized', values: { stretch: 3, look: 'flat', layers: 5, layerDrop: 0.6, haze: 0.8, fog: 0, rockColor: '#0e1424', forestColor: '#0e1424', snow: 0, forest: 0, meadow: 0, hazeColor: '#3a4a78', seed: 33 } },
      { name: 'Toon layers', group: 'Stylized', values: { stretch: 2.6, look: 'toon', peaks: 4, sharp: 0.5, rough: 0.2, detail: 0.3, octaves: 6, strata: 0, rockVar: 0, snow: 0.35, snowSlope: 0.3, forest: 0.3, trees: 0, meadow: 0, forestColor: '#4a8a4a', rockColor: '#7a86a8', rockColor2: '#6a7698', haze: 0.6, hazeColor: '#bcd8f0', shadowColor: '#5a5a9a', clouds: 0, layers: 3, seed: 6 } },
      { name: 'Flat layered hills', group: 'Stylized', values: { look: 'flat', shape: 'rolling', peaks: 2, stretch: 3, rough: 0.15, snow: 0, forest: 0, meadow: 0, rockColor: '#3e6a5a', haze: 0.75, hazeColor: '#e8d8b0', layers: 5, layerDrop: 0.6, fog: 0, sky: 'gradient', skyColor: '#f0c890', skyColor2: '#fbeccc', seed: 2 } },
      { name: 'Alien planet', group: 'Sci-fi', values: { shape: 'alien', peaks: 5, hMax: 0.88, stretch: 2.6, rough: 0.6, snow: 0.25, snowColor: '#a0f0e0', forest: 0.3, trees: 0, meadow: 0, forestColor: '#6a2a7a', rockColor: '#a04a6a', rockColor2: '#5a2a4a', strata: 0.5, hazeColor: '#e0a0c0', fogColor: '#f0c0e0', haze: 0.65, sunColor: '#c0fff0', shadowColor: '#3a2a6a', seed: 13 } },
      { name: 'Red planet', group: 'Sci-fi', values: { shape: 'mesa', peaks: 4, hMax: 0.6, snow: 0, forest: 0, meadow: 0, strata: 0.6, rockColor: '#b05a34', rockColor2: '#7a3420', hazeColor: '#d8a080', haze: 0.7, fog: 0.1, fogColor: '#e0b090', clouds: 0, sunColor: '#fff0e0', shadowColor: '#5a3a3a', layers: 4, seed: 40 } },
      { name: 'Ice world', group: 'Sci-fi', values: { shape: 'alien', peaks: 6, snow: 0.75, snowSlope: 0.5, snowColor: '#e8f6ff', rockColor: '#5a7a9a', rockColor2: '#3a5a7a', forest: 0, meadow: 0, hazeColor: '#bcdcf0', shadowColor: '#4a6aa8', seed: 51 } },
      { name: 'Alps (classic)', group: 'Classic style', values: { style: 'classic', hMin: 0.3, hMax: 0.85, peaks: 4, sharp: 0.75, detail: 0.55, snow: 0.35, seed: 5 } },
      { name: 'Rockies (classic)', group: 'Classic style', values: { style: 'classic', hMin: 0.3, hMax: 0.85, peaks: 3, sharp: 0.55, detail: 0.55, snow: 0.22, rough: 0.6, forest: 0.5, trees: 0.6, forestColor: '#2e4630', rockColor: '#6e6860', rockColor2: '#4e4a46', haze: 0.55, hazeColor: '#a8b8cc', layers: 4, seed: 12 } },
      { name: 'Himalaya giants (classic)', group: 'Classic style', values: { style: 'classic', hMin: 0.4, hMax: 0.98, peaks: 2, sharp: 0.9, detail: 0.55, snow: 0.6, rough: 0.7, snowSlope: 0.75, forest: 0, layers: 3, layerDrop: 0.7, haze: 0.5, hazeColor: '#9ab0cc', shadowColor: '#4a5a88', seed: 31 } },
      { name: 'Desert mesas (classic)', group: 'Classic style', values: { style: 'classic', hMin: 0.12, hMax: 0.62, peaks: 3, sharp: 0.75, detail: 0.45, snow: 0, shape: 'mesa', rough: 0.4, forest: 0, strata: 0.75, rockColor: '#b46a3e', rockColor2: '#8e4a2a', haze: 0.55, hazeColor: '#e0b898', sunColor: '#fff0d8', shadowColor: '#7a5a6a', fog: 0, layers: 3, seed: 22 } },
      { name: 'Sunset range (classic)', group: 'Classic style', values: { style: 'classic', hMin: 0.3, hMax: 0.85, peaks: 3, sharp: 0.75, detail: 0.55, snow: 0.3, lightAngle: 178, shade: 0.85, sunColor: '#ffb070', shadowColor: '#4a3a6a', hazeColor: '#e89a80', haze: 0.7, fog: 0.25, sky: 'gradient', skyColor: '#3a3a7a', skyColor2: '#f8a070', seed: 9 } },
      { name: 'Night silhouette (classic)', group: 'Classic style', values: { style: 'classic', hMin: 0.3, hMax: 0.85, peaks: 4, sharp: 0.75, detail: 0.55, snow: 0, look: 'flat', layers: 5, layerDrop: 0.65, haze: 0.8, fog: 0.4, rockColor: '#0e1424', forestColor: '#0e1424', forest: 0, hazeColor: '#3a4a78', seed: 33 } },
      { name: 'Toon layers (classic)', group: 'Classic style', values: { style: 'classic', hMin: 0.3, hMax: 0.85, peaks: 3, sharp: 0.6, detail: 0.3, snow: 0.3, look: 'toon', rough: 0.2, strata: 0, snowSlope: 0.3, forest: 0.3, trees: 0, forestColor: '#4a8a4a', rockColor: '#7a86a8', rockColor2: '#6a7698', haze: 0.6, hazeColor: '#bcd8f0', shadowColor: '#5a5a9a', layers: 3, seed: 6 } },
      { name: 'Flat layered hills (classic)', group: 'Classic style', values: { style: 'classic', hMin: 0.3, hMax: 0.85, peaks: 2, sharp: 0.75, detail: 0.55, snow: 0, look: 'flat', shape: 'rolling', rough: 0.15, forest: 0, rockColor: '#3e6a5a', haze: 0.75, hazeColor: '#e8d8b0', layers: 5, layerDrop: 0.7, fog: 0, sky: 'gradient', skyColor: '#f0c890', skyColor2: '#fbeccc', seed: 2 } },
      { name: 'Alien planet (classic)', group: 'Classic style', values: { style: 'classic', hMin: 0.15, hMax: 0.95, peaks: 4, sharp: 0.75, detail: 0.55, snow: 0.25, shape: 'alien', rough: 0.6, snowColor: '#a0f0e0', forest: 0.3, trees: 0, forestColor: '#6a2a7a', rockColor: '#a04a6a', rockColor2: '#5a2a4a', strata: 0.5, hazeColor: '#e0a0c0', haze: 0.65, sunColor: '#c0fff0', shadowColor: '#3a2a6a', seed: 13 } },
      { name: 'Silhouette mask', group: 'Masks', values: { output: 'mask', layers: 1, seed: 5 } },
      { name: 'Depth map', group: 'Masks', values: { output: 'depth', layers: 5, seed: 5 } },
    ],
    render(ctx, W, H, p) {
      if (p.style === 'classic') return renderClassic(ctx, W, H, p);
      return renderTerrain(ctx, W, H, p);
    },
  });
})();
