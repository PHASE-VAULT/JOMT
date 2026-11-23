/* Output post-processing, applied to the preview and every export after the generator (and any derived
   map) has rendered:
   - saturation: 0 = grayscale (Rec. 709 luma), 1 = unchanged, up to 2 = boosted
   - colors: reduce the image to at most N colors (median cut palette, no dithering, alpha untouched),
     i.e. a posterize to an optimal palette. N >= U.COLORS_MAX means "all colors" (off). */
(function () {
  'use strict';
  const U = window.UGTG;
  U.COLORS_MAX = 257; // slider end stop = no reduction

  function saturate(d, s) {
    for (let k = 0; k < d.length; k += 4) {
      const r = d[k], g = d[k + 1], b = d[k + 2], l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      d[k] = l + (r - l) * s; d[k + 1] = l + (g - l) * s; d[k + 2] = l + (b - l) * s; // Uint8Clamped clamps
    }
  }

  /* median cut over a sample of the visible pixels: split the box with the widest channel range at its
     median until there are n boxes; each box's mean is a palette color */
  function palette(d, n) {
    const total = d.length >> 2, stride = Math.max(1, Math.floor(total / 65536));
    const px = [];
    for (let i = 0; i < total; i += stride) { const k = i * 4; if (d[k + 3] > 0) px.push((d[k] << 16) | (d[k + 1] << 8) | d[k + 2]); }
    if (!px.length) return null;
    const uniq = new Set(px);
    if (uniq.size <= n) return [...uniq].map((c) => [c >> 16, (c >> 8) & 255, c & 255]); // the sample's own colors
    const ch = (c, i) => (c >> (16 - i * 8)) & 255;
    const box = (a) => {
      let lo = [255, 255, 255], hi = [0, 0, 0];
      for (const c of a) for (let i = 0; i < 3; i++) { const v = ch(c, i); if (v < lo[i]) lo[i] = v; if (v > hi[i]) hi[i] = v; }
      const r = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], axis = r.indexOf(Math.max(...r));
      return { a, axis, range: r[axis] * Math.sqrt(a.length) }; // big and populous boxes split first
    };
    const boxes = [box(px)];
    while (boxes.length < n) {
      let bi = -1, best = 0;
      boxes.forEach((b, i) => { if (b.a.length > 1 && b.range > best) { best = b.range; bi = i; } });
      if (bi < 0) break;
      const b = boxes[bi], ax = b.axis;
      b.a.sort((x, y) => ch(x, ax) - ch(y, ax));
      const m = b.a.length >> 1;
      boxes.splice(bi, 1, box(b.a.slice(0, m)), box(b.a.slice(m)));
    }
    return boxes.map(({ a }) => {
      let r = 0, g = 0, bl = 0;
      for (const c of a) { r += ch(c, 0); g += ch(c, 1); bl += ch(c, 2); }
      return [Math.round(r / a.length), Math.round(g / a.length), Math.round(bl / a.length)];
    });
  }

  function reduce(d, n) {
    // exact check: an image with at most n distinct colors stays as it is
    const seen = new Set();
    for (let k = 0; k < d.length && seen.size <= n; k += 4) if (d[k + 3] > 0) seen.add((d[k] << 16) | (d[k + 1] << 8) | d[k + 2]);
    if (seen.size <= n) return;
    const pal = palette(d, n);
    if (!pal) return;
    // nearest palette color per 6-bit-per-channel bucket, computed on demand
    const cache = new Int16Array(1 << 18).fill(-1);
    for (let k = 0; k < d.length; k += 4) {
      const key = ((d[k] >> 2) << 12) | ((d[k + 1] >> 2) << 6) | (d[k + 2] >> 2);
      let j = cache[key];
      if (j < 0) {
        const r = d[k], g = d[k + 1], b = d[k + 2];
        let bd = Infinity;
        for (let i = 0; i < pal.length; i++) {
          const p = pal[i], dr = r - p[0], dg = g - p[1], db = b - p[2];
          // weighted toward green like the eye (redmean would be overkill here)
          const dist = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
          if (dist < bd) { bd = dist; j = i; }
        }
        cache[key] = j;
      }
      const p = pal[j];
      d[k] = p[0]; d[k + 1] = p[1]; d[k + 2] = p[2];
    }
  }

  U.postActive = (o) => (o.saturation != null && o.saturation !== 1) || (o.colors != null && o.colors < U.COLORS_MAX);

  /* in place on the canvas; returns it */
  U.postProcess = (canvas, o) => {
    if (!U.postActive(o)) return canvas;
    const W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d'), img = ctx.getImageData(0, 0, W, H);
    if (o.saturation != null && o.saturation !== 1) saturate(img.data, o.saturation);
    if (o.colors != null && o.colors < U.COLORS_MAX) reduce(img.data, Math.max(2, Math.round(o.colors)));
    ctx.putImageData(img, 0, 0);
    return canvas;
  };
})();
