/* UGTG wear: shared "rough & worn" post-processing for UI-style generators (health bars, symbols).
   Two independent noise layers:
     1. Noise  – tints / varies the color and warps (distorts) the shape
     2. Grunge – erodes alpha (worn-off paint, chips, cracks, streaks), dirt tint, edge wear, scratches
   Every field is computed in pixel space relative to the short side S, so preview and export match,
   and separate layers rendered with the same params line up pixel-exactly. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep } = U;

  const NOISE_TYPES = [['perlin', 'Perlin (soft)'], ['ridged', 'Ridged'], ['cells', 'Cells'], ['value', 'Value (blocky)']];
  const GRUNGE_TYPES = [['blotchy', 'Blotchy'], ['chipped', 'Chipped'], ['speckle', 'Speckle'], ['streaks', 'Streaks'], ['cracks', 'Cracks']];

  /* params for the two noise sections. `opts.target` adds a "Grunge on" select with those options. */
  U.wearParams = (opts = {}) => {
    const out = [
      { type: 'section', label: 'Noise' },
      { key: 'noiseType', label: 'Noise type', type: 'select', default: 'perlin', options: NOISE_TYPES },
      { key: 'noiseScale', label: 'Noise scale', type: 'range', min: 0.5, max: 30, step: 0.1, default: 6, tip: 'Noise features across the short side' },
      { key: 'noiseDetail', label: 'Noise detail', type: 'int', min: 1, max: 6, default: 3 },
      { key: 'colorNoise', label: 'Color noise', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Blotches tinted toward the noise color' },
      { key: 'noiseColor', label: 'Noise color', type: 'color', default: '#2a1d14', show: (p) => p.colorNoise > 0 },
      { key: 'brightNoise', label: 'Brightness variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'distort', label: 'Distortion', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Warps the whole shape with noise' },
      { key: 'distortScale', label: 'Distortion scale', type: 'range', min: 0.5, max: 30, step: 0.1, default: 4, show: (p) => p.distort > 0 },
      { type: 'section', label: 'Grunge' },
      { key: 'grunge', label: 'Wear', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Worn-off areas from the grunge noise (erodes alpha)' },
      { key: 'grungeType', label: 'Grunge type', type: 'select', default: 'blotchy', options: GRUNGE_TYPES },
      { key: 'grungeScale', label: 'Grunge scale', type: 'range', min: 1, max: 60, step: 0.5, default: 6, tip: 'Grunge features across the short side' },
      { key: 'edgeWear', label: 'Edge wear', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Wear concentrates on edges and corners' },
      { key: 'edgeWidth', label: 'Edge wear width', type: 'range', min: 0.5, max: 12, step: 0.1, default: 3, show: (p) => p.edgeWear > 0, tip: 'px @ 128' },
      { key: 'dirt', label: 'Dirt', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Darkens / tints with the grunge noise, keeps alpha' },
      { key: 'dirtColor', label: 'Dirt color', type: 'color', default: '#1c140d', show: (p) => p.dirt > 0 },
      { key: 'scratches', label: 'Scratches', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Thin scratched-off lines' },
    ];
    if (opts.target) out.push({ key: 'grungeOn', label: 'Grunge on', type: 'select', default: opts.target[0][0], options: opts.target });
    return out;
  };

  const anyNoise = (p) => p.colorNoise > 0 || p.brightNoise > 0 || p.distort > 0;
  const anyGrunge = (p) => p.grunge > 0 || p.dirt > 0 || p.edgeWear > 0 || p.scratches > 0;
  U.wearActive = (p) => anyNoise(p) || anyGrunge(p);

  function grungeAt(type, x, y, s) {
    switch (type) {
      case 'chipped': {
        const w = U.worley(x * 1.3, y * 1.3, 0, 0, s + 21);
        return clamp(U.fractal('perlin', x, y, 0, 0, 4, 0.55, 'fbm', s) * 0.65 + (1 - w.f1) * 0.25 + w.id * 0.12);
      }
      case 'speckle':
        return clamp(U.fractal('perlin', x * 0.5, y * 0.5, 0, 0, 3, 0.5, 'fbm', s) * 0.55 + U.hash(Math.floor(x * 9), Math.floor(y * 9), s + 3) * 0.3 + U.value(x * 4, y * 4, 0, 0, s + 4) * 0.1 + 0.05);
      case 'streaks':
        return U.fractal('perlin', x * 0.12, y * 1.6, 0, 0, 4, 0.55, 'fbm', s);
      case 'cracks': {
        const w = U.worley(x * 0.7, y * 0.7, 0, 0, s + 33), edge = 1 - smoothstep(0, 0.07, w.f2 - w.f1);
        return Math.max(U.fractal('perlin', x, y, 0, 0, 4, 0.55, 'fbm', s) * 0.8, edge * 0.95);
      }
      default:
        return U.fractal('perlin', x, y, 0, 0, 5, 0.55, 'fbm', s);
    }
  }

  /* a W×H field from fn(x, y), evaluated on a grid of ~200 cells per short side and interpolated
     bilinearly: the noise is the same at every resolution (preview = export) and fast to compute */
  function fieldAt(W, H, S, fn) {
    const st = Math.max(1, S / 200), gw = Math.ceil(W / st) + 2, gh = Math.ceil(H / st) + 2;
    const g = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) g[j * gw + i] = fn(i * st, j * st);
    if (st === 1) {
      const out = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] = g[y * gw + x];
      return out;
    }
    const out = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      const fy = y / st, j = Math.floor(fy), ty = fy - j;
      for (let x = 0; x < W; x++) {
        const fx = x / st, i = Math.floor(fx), tx = fx - i, o = j * gw + i;
        const a = g[o] + (g[o + 1] - g[o]) * tx, b = g[o + gw] + (g[o + gw + 1] - g[o + gw]) * tx;
        out[y * W + x] = a + (b - a) * ty;
      }
    }
    return out;
  }

  /* precompute the noise fields once per render; reused for every layer / component.
     `silhouette` (optional canvas): the whole object's shape; edge wear follows its outline, so
     separately rendered parts (a thin border, the fill) wear along the same, real edges.
     `ox`, `oy` (optional): the W×H area is a crop at this offset inside a larger texture; the noise is
     sampled at the texture position, so a cropped part wears like the same spot of the full image. */
  U.wearFields = (W, H, p, S, silhouette, ox, oy) => {
    const seed = p.seed | 0, F = { W, H, S };
    const field = ox || oy ? (w, h, s, fn) => fieldAt(w, h, s, (x, y) => fn(x + (ox || 0), y + (oy || 0))) : fieldAt;
    if (p.distort > 0) {
      const ds = p.distortScale / S, amp = p.distort * S * 0.06;
      F.wx = field(W, H, S, (x, y) => (U.fractal('perlin', x * ds, y * ds, 0, 0, 3, 0.5, 'fbm', seed + 101) - 0.5) * 2 * amp);
      F.wy = field(W, H, S, (x, y) => (U.fractal('perlin', x * ds + 31.7, y * ds, 0, 0, 3, 0.5, 'fbm', seed + 202) - 0.5) * 2 * amp);
    }
    if (p.colorNoise > 0 || p.brightNoise > 0) {
      const ns = p.noiseScale / S, basis = p.noiseType === 'ridged' ? 'perlin' : p.noiseType, mode = p.noiseType === 'ridged' ? 'ridged' : 'fbm';
      F.cn = field(W, H, S, (x, y) => U.fractal(basis, x * ns, y * ns, 0, 0, p.noiseDetail, 0.5, mode, seed + 303));
    }
    if (p.grunge > 0 || p.edgeWear > 0) {
      const gs = p.grungeScale / S;
      F.g = field(W, H, S, (x, y) => grungeAt(p.grungeType, x * gs, y * gs, seed + 404));
    }
    if (p.dirt > 0) {
      const gs = (p.grungeScale * 0.6) / S;
      F.d = field(W, H, S, (x, y) => U.fractal('perlin', x * gs, y * gs, 0, 0, 4, 0.55, 'fbm', seed + 505));
    }
    if (p.edgeWear > 0 && silhouette) F.edge = edgeField(silhouette, W, H, p, S);
    return F;
  };

  /* 0 inside, rising to 1 at the outline of the alpha shape (within edgeWidth) */
  function edgeField(cv, W, H, p, S) {
    const sd = cv.getContext('2d').getImageData(0, 0, W, H).data, N = W * H, a = new Float32Array(N);
    for (let i = 0; i < N; i++) a[i] = sd[i * 4 + 3] / 255;
    const b = blurAlpha(a, W, H, (p.edgeWidth * S) / 128);
    for (let i = 0; i < N; i++) b[i] = clamp((1 - b[i]) * 2);
    return b;
  }

  /* box blur of an alpha channel (0..1), separable, radius r px */
  function blurAlpha(a, W, H, r) {
    r = Math.max(1, Math.round(r));
    const tmp = new Float32Array(W * H), out = new Float32Array(W * H), n = 2 * r + 1;
    for (let y = 0; y < H; y++) {
      let s = 0;
      const row = y * W;
      for (let x = -r; x <= r; x++) s += a[row + clamp(x, 0, W - 1)];
      for (let x = 0; x < W; x++) {
        tmp[row + x] = s / n;
        s += a[row + Math.min(W - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
      }
    }
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) {
        out[y * W + x] = s / n;
        s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x];
      }
    }
    return out;
  }

  /* thin scratches that remove paint; same seed -> same scratches on every layer */
  U.wearScratches = (c, W, H, p, S) => {
    if (!(p.scratches > 0)) return;
    const r = U.rng((p.seed | 0) + 9001), n = Math.round(p.scratches * 70);
    c.save();
    c.globalCompositeOperation = 'destination-out';
    c.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * H, a = (r() - 0.5) * 1.2 + (r() < 0.5 ? 0 : Math.PI / 2) * (r() < 0.3 ? 1 : 0);
      const len = S * (0.05 + r() * 0.35), bend = (r() - 0.5) * len * 0.3;
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      c.lineWidth = Math.max(0.6, S * (0.002 + r() * 0.006));
      c.strokeStyle = `rgba(0,0,0,${0.5 + r() * 0.5})`;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo((x + ex) / 2 - Math.sin(a) * bend, (y + ey) / 2 + Math.cos(a) * bend, ex, ey);
      c.stroke();
    }
    c.restore();
  };

  /* Post-process one source canvas into ImageData.
     o.grunge: apply grunge (wear, dirt, edge wear); o.color: apply color noise;
     o.t(x, y): if given, output a grayscale progress map (value = t) instead of the color. */
  U.wearApply = (src, p, F, o = {}) => {
    const { W, H, S } = F, N = W * H;
    const sd = src.getContext('2d').getImageData(0, 0, W, H).data;
    const out = new ImageData(W, H), d = out.data;
    const doG = o.grunge !== false, doC = o.color !== false;
    // edge wear: the object's silhouette edge if given, else this source's own alpha edge
    const edge = doG && p.edgeWear > 0 ? F.edge || edgeField(src, W, H, p, S) : null;
    const nc = U.hex(p.noiseColor || '#000'), dc = U.hex(p.dirtColor || '#000');
    const th = 0.8 - p.grunge * 0.5;
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) {
        let sx = x, sy = y, r, g, b, a;
        if (F.wx) {
          // bilinear, premultiplied (no dark fringes at transparent edges)
          sx = x + F.wx[i]; sy = y + F.wy[i];
          const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
          r = g = b = a = 0;
          for (let k = 0; k < 4; k++) {
            const xx = x0 + (k & 1), yy = y0 + (k >> 1);
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const w = ((k & 1) ? fx : 1 - fx) * ((k >> 1) ? fy : 1 - fy), j = (yy * W + xx) * 4, aw = sd[j + 3] * w;
            r += sd[j] * aw; g += sd[j + 1] * aw; b += sd[j + 2] * aw; a += aw;
          }
          if (a > 0) { r /= a; g /= a; b /= a; }
          a /= 255;
        } else {
          const j = i * 4;
          r = sd[j]; g = sd[j + 1]; b = sd[j + 2]; a = sd[j + 3] / 255;
        }
        const o4 = i * 4;
        if (a <= 0.001) { d[o4 + 3] = 0; continue; }
        if (doG) {
          if (F.g && (p.grunge > 0 || edge)) {
            let e = 0;
            if (edge) {
              const ex = clamp(Math.round(sx), 0, W - 1), ey = clamp(Math.round(sy), 0, H - 1);
              e = edge[ey * W + ex] * p.edgeWear;
            }
            const t = p.grunge > 0 ? th : 0.92;
            a *= 1 - smoothstep(t - 0.035, t + 0.035, F.g[i] + e * 0.45);
          }
          if (F.d) {
            const m = smoothstep(0.42, 0.78, F.d[i]) * p.dirt;
            r += (dc[0] - r) * m; g += (dc[1] - g) * m; b += (dc[2] - b) * m;
          }
        }
        if (o.t) {
          const v = clamp(o.t(sx, sy)) * 255;
          d[o4] = d[o4 + 1] = d[o4 + 2] = v; d[o4 + 3] = a * 255;
          continue;
        }
        if (doC && F.cn) {
          const n = F.cn[i];
          if (p.colorNoise > 0) {
            const m = smoothstep(0.38, 0.78, n) * p.colorNoise;
            r += (nc[0] - r) * m; g += (nc[1] - g) * m; b += (nc[2] - b) * m;
          }
          if (p.brightNoise > 0) { const f = 1 + (n - 0.5) * 2 * p.brightNoise; r *= f; g *= f; b *= f; }
        }
        d[o4] = r; d[o4 + 1] = g; d[o4 + 2] = b; d[o4 + 3] = a * 255;
      }
    }
    return out;
  };

  /* convenience: ImageData -> canvas */
  U.imageCanvas = (img) => {
    const c = U.canvas(img.width, img.height);
    c.getContext('2d').putImageData(img, 0, 0);
    return c;
  };
})();
