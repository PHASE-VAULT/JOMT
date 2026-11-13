/* Normal map mode for texturing generators: derives a tangent-space normal map from the rendered
   texture, treating one of its channels as a height map. Settings scale with resolution, so the
   preview matches the export at any size (reference: 512 px on the long side). */
(function () {
  'use strict';
  const U = window.UGTG;

  U.NORMAL_PARAMS = [
    { type: 'section', label: 'Normal' }, // the one panel tab shown in normal mode
    { key: 'strength', label: 'Strength', type: 'range', min: 0, max: 20, step: 0.1, default: 3, tip: 'How steep the bumps are' },
    { key: 'smooth', label: 'Smoothing', type: 'range', min: 0, max: 8, step: 0.25, default: 0.5, tip: 'Blurs the height first: removes pixel noise, rounds the bumps (px @ 512)' },
    { key: 'filter', label: 'Filter', type: 'select', default: 'sobel', options: [['sobel', 'Sobel (smooth)'], ['central', 'Central difference (sharp)']] },
    { key: 'source', label: 'Height from', type: 'select', default: 'luma', options: [['luma', 'Brightness'], ['r', 'Red channel'], ['g', 'Green channel'], ['b', 'Blue channel'], ['a', 'Alpha']] },
    { key: 'invert', label: 'Invert height', type: 'bool', default: false, tip: 'Dark areas raised instead of bright ones' },
    { key: 'contrast', label: 'Height contrast', type: 'range', min: 0.25, max: 4, step: 0.05, default: 1, tip: 'Above 1 exaggerates mid-tone detail, below 1 flattens it' },
    { key: 'yDir', label: 'Green channel', type: 'select', default: 'gl', options: [['gl', 'OpenGL (Y+) · Unity, Blender, Godot'], ['dx', 'DirectX (Y−) · Unreal, Substance DX']] },
    { key: 'wrap', label: 'Wrap edges', type: 'bool', default: true, tip: 'Sample across the borders so a tileable texture gives a seamless normal map' },
  ];

  // a generator can set its own starting values with `normalDefaults: { strength: 8, ... }`
  U.normalDefaults = (gen) => Object.assign(U.defaultsFor(U.NORMAL_PARAMS), { wrap: !!(gen && gen.tileable) }, gen && gen.normalDefaults);

  // separable box blur, two passes ≈ tent filter; running sums keep it O(n) for any radius
  function blur(h, W, H, r, wrap) {
    const tmp = new Float32Array(h.length), inv = 1 / (2 * r + 1);
    const ix = (i, n) => (wrap ? ((i % n) + n) % n : i < 0 ? 0 : i >= n ? n - 1 : i);
    const pass = (src, dst, len, lines, step, lineStep) => {
      for (let l = 0; l < lines; l++) {
        const o = l * lineStep;
        let s = 0;
        for (let k = -r; k <= r; k++) s += src[o + ix(k, len) * step];
        for (let i = 0; i < len; i++) {
          dst[o + i * step] = s * inv;
          s += src[o + ix(i + r + 1, len) * step] - src[o + ix(i - r, len) * step];
        }
      }
    };
    for (let n = 0; n < 2; n++) {
      pass(h, tmp, W, H, 1, W);
      pass(tmp, h, H, W, W, 1);
    }
  }

  U.normalMap = (src, p) => {
    const W = src.width, H = src.height, N = W * H;
    const d = src.getContext('2d').getImageData(0, 0, W, H).data;
    const sc = Math.max(W, H) / 512;
    const ch = { r: 0, g: 1, b: 2, a: 3 }[p.source];
    const h = new Float32Array(N);
    for (let i = 0, k = 0; i < N; i++, k += 4) {
      let v = ch === undefined ? (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) / 255 : d[k + ch] / 255;
      if (ch !== 3) v *= d[k + 3] / 255; // transparent pixels count as low
      if (p.invert) v = 1 - v;
      if (p.contrast !== 1) v = v < 0.5 ? 0.5 * Math.pow(2 * v, p.contrast) : 1 - 0.5 * Math.pow(2 - 2 * v, p.contrast);
      h[i] = v;
    }
    const r = Math.round(p.smooth * sc);
    if (r > 0) blur(h, W, H, r, p.wrap);

    const out = U.canvas(W, H), oc = out.getContext('2d'), img = oc.createImageData(W, H), o = img.data;
    const X = (x) => (p.wrap ? (x + W) % W : x < 0 ? 0 : x >= W ? W - 1 : x);
    const Y = (y) => (p.wrap ? (y + H) % H : y < 0 ? 0 : y >= H ? H - 1 : y);
    // slopes per pixel shrink as resolution grows; scaling by sc keeps the look resolution-independent
    const s = p.strength * sc, gy = p.yDir === 'dx' ? -1 : 1, sobel = p.filter === 'sobel';
    for (let y = 0; y < H; y++) {
      const ru = Y(y - 1) * W, rc = y * W, rd = Y(y + 1) * W;
      for (let x = 0; x < W; x++) {
        const xl = X(x - 1), xr = X(x + 1);
        let dx, dy;
        if (sobel) {
          dx = (h[ru + xr] + 2 * h[rc + xr] + h[rd + xr] - h[ru + xl] - 2 * h[rc + xl] - h[rd + xl]) / 8;
          dy = (h[rd + xl] + 2 * h[rd + x] + h[rd + xr] - h[ru + xl] - 2 * h[ru + x] - h[ru + xr]) / 8;
        } else {
          dx = (h[rc + xr] - h[rc + xl]) / 2;
          dy = (h[rd + x] - h[ru + x]) / 2;
        }
        // tangent space: n = (-dh/du, -dh/dv, 1) with v pointing up (image y points down)
        const nx = -dx * s, ny = dy * s * gy, l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        const k = (rc + x) * 4;
        o[k] = (nx * l * 0.5 + 0.5) * 255 + 0.5;
        o[k + 1] = (ny * l * 0.5 + 0.5) * 255 + 0.5;
        o[k + 2] = (l * 0.5 + 0.5) * 255 + 0.5;
        o[k + 3] = 255;
      }
    }
    oc.putImageData(img, 0, 0);
    return out;
  };
})();
