/* Shared lighting for the tileable ground generators (Sand, Gravel, Mud).
   A generator writes its albedo into an ImageData and its height into a Float32Array in short-side units
   (one pixel = 1 / S), then calls U.groundFinish(): height map output, flat albedo, or lit color from the
   height gradient (lambert), cast shadows marched toward the light, cavity occlusion from a blurred height
   on a coarse grid (so every size looks the same), wetness (darker, saturated, glossy) and an optional toon
   look. Everything wraps around the edges, so tileable inputs stay tileable.
   - U.groundLightParams(defaults): the Lighting section for a generator's params (angled or ambient light)
   - U.groundFinish(ctx, img, Hf, W, H, p, o): o = { flags, wetMap, aoScale, heightRef, shadowLen, height }
       flags (Uint8Array, optional): 1 = gets the full wet highlight (stones, water), 2 = toon outline
       wetMap (Float32Array, optional): per-pixel wetness 0..1, multiplied with p.wet when p.wet > 0, else used as is */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp } = U;
  const RAD = Math.PI / 180;

  U.groundLightParams = (d = {}) => [
    { type: 'section', label: 'Lighting' },
    { key: 'style', label: 'Style', type: 'select', default: d.style || 'realistic', options: [['realistic', 'Realistic'], ['toon', 'Toon (bands + outline)']] },
    { key: 'lightMode', label: 'Light', type: 'select', default: 'angled', options: [['angled', 'Angled (light angle)'], ['ambient', 'Ambient (soft, no direction)']], tip: 'Ambient: soft light from all around, like an overcast sky: no direction and no cast shadows; slopes darken gently and dips keep their occlusion. Best when the engine supplies the real light' },
    { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -135, show: (p) => p.lightMode !== 'ambient', tip: 'Direction the light comes from (-135 = top left)' },
    { key: 'lightHeight', label: 'Light height', type: 'range', min: 10, max: 80, step: 1, default: d.lightHeight || 40, show: (p) => p.lightMode !== 'ambient', tip: 'Elevation of the light in degrees: low light gives long shadows' },
    { key: 'relief', label: 'Relief shading', type: 'range', min: 0, max: 1, step: 0.01, default: d.relief == null ? 0.75 : d.relief },
    { key: 'shadow', label: 'Cast shadows', type: 'range', min: 0, max: 1, step: 0.01, default: d.shadow == null ? 0.5 : d.shadow, show: (p) => p.lightMode !== 'ambient' },
    { key: 'ao', label: 'Ambient occlusion', type: 'range', min: 0, max: 1, step: 0.01, default: d.ao == null ? 0.5 : d.ao, tip: d.aoTip || 'Darkens dips and gaps' },
    { key: 'wet', label: 'Wetness', type: 'range', min: 0, max: 1, step: 0.01, default: d.wet || 0, tip: 'Darker, more saturated colors and a glossy highlight' },
    { key: 'output', label: 'Output', type: 'select', default: 'lit', options: [['lit', 'Lit color'], ['albedo', 'Flat albedo (no baked light)'], ['height', 'Height map']] },
  ];

  U.groundFinish = function (ctx, img, Hf, W, H, p, o = {}) {
    const d = img.data, N = W * H, S = Math.min(W, H);
    if (o.height || p.output === 'height') {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < N; i++) { if (Hf[i] < lo) lo = Hf[i]; if (Hf[i] > hi) hi = Hf[i]; }
      const k = hi > lo ? 255 / (hi - lo) : 0;
      for (let i = 0; i < N; i++) { const g = (Hf[i] - lo) * k; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = g; d[i * 4 + 3] = 255; }
      ctx.putImageData(img, 0, 0);
      return;
    }
    const wetMap = o.wetMap || null, flags = o.flags || null;
    if (p.output === 'albedo') {
      // albedo still darkens where it is wet (wet soil is darker), but bakes no light
      if (p.wet > 0 || wetMap) for (let i = 0; i < N; i++) { const w = wetAt(i), f = 1 - w * 0.42; d[i * 4] *= f; d[i * 4 + 1] *= f; d[i * 4 + 2] *= f; }
      ctx.putImageData(img, 0, 0);
      return;
    }
    function wetAt(i) { return wetMap ? (p.wet > 0 ? clamp(wetMap[i] + p.wet * (1 - wetMap[i])) : wetMap[i]) : p.wet; }
    const toon = p.style === 'toon', ambient = p.lightMode === 'ambient';
    const la = p.lightAngle * RAD, le = p.lightHeight * RAD;
    const Lx = Math.cos(la) * Math.cos(le), Ly = Math.sin(la) * Math.cos(le), Lz = Math.sin(le), tanE = Math.tan(le);
    let Hx = Lx, Hy = Ly, Hz = Lz + 1;
    const hl = Math.hypot(Hx, Hy, Hz); Hx /= hl; Hy /= hl; Hz /= hl;
    const aoScale = o.aoScale || 20, heightRef = Math.max(1e-4, o.heightRef || 0.02);

    // cavity: blurred height on a coarse grid, sampled bilinearly with wrap
    let blur = null, bw = 0, bh = 0, bs = 1;
    if (p.ao > 0) {
      bs = Math.max(1, Math.ceil(S / 256)); bw = Math.ceil(W / bs); bh = Math.ceil(H / bs);
      blur = new Float32Array(bw * bh);
      const cnt = new Float32Array(bw * bh);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const j = ((y / bs) | 0) * bw + ((x / bs) | 0); blur[j] += Hf[y * W + x]; cnt[j]++; }
      for (let j = 0; j < blur.length; j++) blur[j] /= cnt[j] || 1;
      const rad = Math.max(1, Math.round(((S / bs) * 0.35) / aoScale)), tmp = new Float32Array(bw * bh);
      const pass = (src, dst, w, h, dx) => {
        const n = 2 * rad + 1;
        for (let a = 0; a < (dx ? h : w); a++) {
          let s = 0;
          const at = (k) => (dx ? src[a * w + U.mod(k, w)] : src[U.mod(k, h) * w + a]);
          for (let k = -rad; k <= rad; k++) s += at(k);
          for (let k = 0; k < (dx ? w : h); k++) { dst[dx ? a * w + k : k * w + a] = s / n; s += at(k + rad + 1) - at(k - rad); }
        }
      };
      for (let it = 0; it < 2; it++) { pass(blur, tmp, bw, bh, true); pass(tmp, blur, bw, bh, false); }
    }
    // wrap of an integer index into 0..n-1 (same as U.mod for integers, without the second %)
    const wr = (i, n) => { i %= n; return i < 0 ? i + n : i; };
    const blurAt = (x, y) => {
      const fx = (x + 0.5) / bs - 0.5, fy = (y + 0.5) / bs - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      const a = wr(x0, bw), a1 = wr(x0 + 1, bw), c = wr(y0, bh) * bw, c1 = wr(y0 + 1, bh) * bw;
      return lerp(lerp(blur[c + a], blur[c + a1], tx), lerp(blur[c1 + a], blur[c1 + a1], tx), ty);
    };
    const aoK = (p.ao * 0.75) / heightRef;
    const steps = 12, maxD = o.shadowLen || 0.05, sdx = Math.cos(la), sdy = Math.sin(la); // toward the light
    // shadow march offsets per step (the same expressions as per pixel, computed once)
    const stX = new Float64Array(steps + 1), stY = new Float64Array(steps + 1), stZ = new Float64Array(steps + 1);
    for (let k = 1; k <= steps; k++) { const dd = (k / steps) * maxD; stX[k] = sdx * dd * S; stY[k] = sdy * dd * S; stZ[k] = dd * tanE; }

    for (let y = 0, i = 0; y < H; y++) {
      const ym = wr(y - 1, H) * W, yp = wr(y + 1, H) * W, yr = y * W;
      for (let x = 0; x < W; x++, i++) {
        const q = i * 4, h0 = Hf[i];
        const gx = (Hf[yr + (x + 1 === W ? 0 : x + 1)] - Hf[yr + (x === 0 ? W - 1 : x - 1)]) * S * 0.5;
        const gy = (Hf[yp + x] - Hf[ym + x]) * S * 0.5;
        const nl = Math.hypot(gx, gy, 1), nx = -gx / nl, ny = -gy / nl, nz = 1 / nl;
        // ambient (sky from all around): slopes see less sky and darken gently, whichever way they face
        let shade = ambient ? Math.max(0.5, 1 - (1 - nz * nz) * p.relief * 1.4) : lerp(1, Math.max(0, nx * Lx + ny * Ly + nz * Lz) / Lz, p.relief); // flat ground = 1
        if (toon) shade = shade < 0.8 ? 0.72 : shade < 1.12 ? 1 : 1.18;
        if (p.shadow > 0 && !ambient) {
          let sh = 0;
          for (let k = 1; k <= steps; k++) {
            const sx = wr(Math.round(x + stX[k]), W), sy = wr(Math.round(y + stY[k]), H);
            const over = Hf[sy * W + sx] - h0 - stZ[k];
            if (over > 0) { sh = Math.max(sh, Math.min(1, over * S * 0.6)); if (sh >= 1) break; }
          }
          if (toon) sh = sh > 0.35 ? 1 : 0;
          shade *= 1 - sh * p.shadow * 0.55;
        }
        if (blur) shade *= 1 - clamp((blurAt(x, y) - h0) * aoK) * 0.65;
        const fl = flags ? flags[i] : 0;
        if (fl & 2) shade *= 0.45;
        const w = wetAt(i), dark = 1 - w * 0.42;
        let r = d[q] * dark, g = d[q + 1] * dark, b = d[q + 2] * dark;
        if (w > 0) { const l = (r + g + b) / 3, sat = 1 + w * 0.25; r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
        r *= shade; g *= shade; b *= shade;
        if (w > 0) {
          // ambient: a soft sky sheen on the flat wet parts instead of a hot spot
          let sp = ambient ? Math.pow(nz, 8) * w * (fl & 1 ? 0.22 : 0.08) : Math.pow(Math.max(0, nx * Hx + ny * Hy + nz * Hz), 60) * w * (fl & 1 ? 1.1 : 0.35);
          if (toon) sp = sp > 0.3 ? 0.6 : 0;
          r += sp * 255; g += sp * 255; b += sp * 255;
        }
        d[q] = r; d[q + 1] = g; d[q + 2] = b;
      }
    }
    ctx.putImageData(img, 0, 0);
  };
})();
