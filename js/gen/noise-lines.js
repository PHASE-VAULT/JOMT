/* Noise Lines: equally spaced lines through a noise-distorted field, tileable. The field is
     contours – fractal noise: its iso-lines (topographic map look, rings around every bump),
     rings    – distance to scattered centers: concentric rings, each set pushed around by noise,
     waves    – parallel lines bent by noise,
     radial   – one set of rings around the tile center (distance on the torus, so it still tiles).
   Lines are drawn every 1 / count of the field with a width measured in pixels (the field's gradient turns the
   distance in field units into pixels), so they stay even and anti-aliased however the noise bends them.
   Every Nth line can be a thicker major line, lines can break up, glow, vary in width; the bands between the
   lines can be filled (alternating, a 4-color palette cycle for camo, or a height gradient). Output: color,
   a white line mask, or the field as a height map. Every period is a whole number per tile. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;
  const wr = (i, n) => { i %= n; return i < 0 ? i + n : i; };
  const isM = (...m) => (p) => m.includes(p.mode);

  U.register({
    id: 'noise-lines',
    name: 'Noise Lines',
    desc: 'Tileable noise lines: contour lines, rings and waves equally offset by noise, with major lines, glow, breakup and band fills for camo and backgrounds',
    uses: [
      'Topographic and contour-line camo for weapon skins, vehicles and gear; fill the bands for a layered camo or keep only the lines.',
      'Subtle animated-feel backgrounds for menus, loading screens, posters and UI panels; use the line mask to tint or emit in the engine.',
    ],
    tags: ['Texturing', 'UI', 'Military'],
    tileable: true,
    heightMap: true,
    normalMap: true,
    normalDesc: 'Normal map from the lines: carved grooves or raised ridges (Line relief)',
    normalDefaults: { strength: 5, smooth: 0.5 },
    icon: U.icon('<path d="M3 8c3-3 6 2 9-1s6 1 9-1M3 13c3-3 6 2 9-1s6 1 9-1M3 18c3-3 6 2 9-1s6 1 9-1"/>'),
    params: [
      { type: 'section', label: 'Lines' },
      { key: 'mode', label: 'Line field', type: 'select', default: 'contours', options: [['contours', 'Contours (noise iso-lines)'], ['rings', 'Rings around scattered centers'], ['waves', 'Parallel waves'], ['radial', 'One ring set (centered)']] },
      { key: 'count', label: 'Line count', type: 'range', min: 2, max: 60, step: 1, default: 7, tip: 'Lines per unit of the field: more = denser lines' },
      { key: 'centers', label: 'Centers across', type: 'int', min: 1, max: 12, default: 3, show: isM('rings') },
      { key: 'angle', label: 'Direction (°)', type: 'range', min: 0, max: 180, step: 1, default: 0, show: isM('waves'), tip: 'Rounded to whole line counts per tile' },
      { key: 'scale', label: 'Noise scale', type: 'int', min: 1, max: 16, default: 2, tip: 'Noise features across the tile' },
      { key: 'distort', label: 'Distortion', type: 'range', min: 0, max: 2, step: 0.01, default: 0.6, show: (p) => p.mode !== 'contours', tip: 'How strongly the noise pushes the lines around' },
      { key: 'octaves', label: 'Detail', type: 'int', min: 1, max: 6, default: 3, tip: 'Noise octaves: more = wigglier lines' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 4 },

      { type: 'section', label: 'Line style' },
      { key: 'width', label: 'Line width', type: 'range', min: 0, max: 16, step: 0.1, default: 2.5, tip: 'px @ 512; 0 = no lines (bands only)' },
      { key: 'widthVar', label: 'Width variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2 },
      { key: 'soft', label: 'Softness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Blurry line edges' },
      { key: 'major', label: 'Major line every', type: 'int', min: 0, max: 10, default: 0, tip: 'Every Nth line thicker and brighter (topographic index lines); 0 = off' },
      { key: 'majorWidth', label: 'Major line width', type: 'range', min: 1, max: 4, step: 0.05, default: 2, show: (p) => p.major > 0, tip: '× line width' },
      { key: 'breakup', label: 'Breakup', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Lines fade out and break in places' },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 1, max: 30, step: 0.5, default: 8, show: (p) => p.glow > 0, tip: 'px @ 512' },

      { type: 'section', label: 'Color' },
      { key: 'lineColor', label: 'Line color', type: 'color', default: '#cfd3d6' },
      { key: 'lineColor2', label: 'Second line color', type: 'color', default: '#cfd3d6', tip: 'Lines blend toward this color along the field (or major lines use it)' },
      { key: 'lineOpacity', label: 'Line opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85 },
      { key: 'fill', label: 'Band fill', type: 'select', default: 'none', options: [['none', 'None (background only)'], ['alt', 'Alternating bands'], ['palette', '4-color palette (camo)'], ['gradient', 'Height gradient']] },
      { key: 'bg', label: 'Background', type: 'color', default: '#2a2c2e' },
      { key: 'bg2', label: 'Background 2', type: 'color', default: '#202224', tip: 'Second band / gradient color; also the mottling color' },
      { key: 'c3', label: 'Band color 3', type: 'color', default: '#3a3d38', show: (p) => p.fill === 'palette' },
      { key: 'c4', label: 'Band color 4', type: 'color', default: '#4a4436', show: (p) => p.fill === 'palette' },
      { key: 'mottle', label: 'Mottling', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Soft blotches in the background' },
      { key: 'grain', label: 'Grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15 },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color'], ['mask', 'Line mask (white on black)'], ['height', 'Height map']] },
      { key: 'relief', label: 'Line relief', type: 'select', default: 'carved', options: [['carved', 'Carved (grooves)'], ['raised', 'Raised (ridges)'], ['field', 'Smooth field slopes']], tip: 'How the lines appear in the height map and the normal map mode' },
      { key: 'reliefDepth', label: 'Relief depth', type: 'range', min: 0.1, max: 1, step: 0.01, default: 1, show: (p) => p.relief !== 'field' },
    ],
    presets: [
      { name: 'Grey contour lines', group: 'Backgrounds', values: {} },
      { name: 'Topographic map', group: 'Backgrounds', values: { count: 8, scale: 3, octaves: 4, width: 1.2, major: 5, majorWidth: 2.2, lineColor: '#8a6a42', lineColor2: '#6a4a2a', lineOpacity: 0.9, bg: '#efe6d2', bg2: '#e2d6bc', mottle: 0.4, grain: 0.1, seed: 7 } },
      { name: 'Neon contours', group: 'Backgrounds', values: { count: 6, width: 2, glow: 0.6, glowSize: 10, lineColor: '#2af0ff', lineColor2: '#ff2a8a', lineOpacity: 1, bg: '#07060f', bg2: '#0d0a1c', mottle: 0.2, grain: 0.05, seed: 3 } },
      { name: 'Blueprint rings', group: 'Backgrounds', values: { mode: 'rings', centers: 3, count: 26, distort: 0.25, width: 1, lineColor: '#cfe4ff', lineColor2: '#cfe4ff', lineOpacity: 0.7, bg: '#123a6a', bg2: '#0e3060', mottle: 0.2, grain: 0.1 } },
      { name: 'Subtle waves', group: 'Backgrounds', values: { mode: 'waves', count: 24, scale: 2, distort: 0.8, octaves: 2, width: 1.2, soft: 0.5, lineColor: '#ffffff', lineColor2: '#ffffff', lineOpacity: 0.12, bg: '#1d2430', bg2: '#151b25', mottle: 0.5, grain: 0.05 } },
      { name: 'Ripple rings', group: 'Backgrounds', values: { mode: 'radial', count: 30, scale: 3, distort: 0.35, width: 2.5, soft: 0.4, lineColor: '#9ad8ff', lineColor2: '#3a6aff', lineOpacity: 0.8, glow: 0.3, bg: '#06121e', bg2: '#0a1a2c', seed: 9 } },
      { name: 'Wood grain rings', group: 'Backgrounds', values: { mode: 'rings', centers: 2, count: 34, distort: 0.9, octaves: 4, width: 2, widthVar: 0.6, soft: 0.5, lineColor: '#5a3a1e', lineColor2: '#4a2c14', lineOpacity: 0.7, bg: '#b88454', bg2: '#a87444', mottle: 0.5, grain: 0.25, seed: 12 } },
      { name: 'Topo camo (filled)', group: 'Camo', values: { count: 3, scale: 3, octaves: 4, width: 1.5, fill: 'palette', bg: '#2a3020', bg2: '#4a5530', c3: '#6e6a44', c4: '#1a1a14', lineColor: '#141410', lineColor2: '#141410', lineOpacity: 0.8, mottle: 0.1, grain: 0.2, seed: 21 } },
      { name: 'Desert topo camo', group: 'Camo', values: { count: 3, scale: 2, octaves: 4, width: 0, fill: 'palette', bg: '#c9b088', bg2: '#a88a5e', c3: '#7a6040', c4: '#e2d0aa', mottle: 0.15, grain: 0.2, seed: 5 } },
      { name: 'Urban contour camo', group: 'Camo', values: { count: 4, scale: 3, octaves: 3, width: 1, fill: 'alt', bg: '#5a5d62', bg2: '#3a3c40', lineColor: '#16171a', lineColor2: '#16171a', lineOpacity: 0.9, grain: 0.15, seed: 14 } },
      { name: 'Neon topo skin', group: 'Camo', values: { count: 4, scale: 3, width: 2.5, major: 3, majorWidth: 1.8, fill: 'gradient', bg: '#1a0730', bg2: '#ff3aa8', lineColor: '#ffe14a', lineColor2: '#ffe14a', lineOpacity: 1, glow: 0.4, glowSize: 6, grain: 0.1, seed: 18 } },
      { name: 'Thermal map', group: 'Camo', values: { count: 4, scale: 2, octaves: 3, width: 1, fill: 'gradient', bg: '#120a3a', bg2: '#ffb020', lineColor: '#000000', lineColor2: '#000000', lineOpacity: 0.5, grain: 0.05, seed: 2 } },
      { name: 'Broken lines', group: 'Stylized', values: { count: 7, width: 2.5, breakup: 0.6, widthVar: 0.6, lineColor: '#e8e2d4', lineColor2: '#e8e2d4', bg: '#1a1a1a', bg2: '#121212', mottle: 0.3, grain: 0.2, seed: 6 } },
      { name: 'Ink wave pattern', group: 'Stylized', values: { mode: 'waves', angle: 30, count: 14, scale: 3, distort: 1.2, width: 4, widthVar: 0.3, soft: 0, lineColor: '#1a1a2a', lineColor2: '#1a1a2a', lineOpacity: 1, bg: '#f2ece0', bg2: '#e8e0d0', mottle: 0.2, grain: 0.1, seed: 11 } },
    ],

    render(ctx, W, H, p, opts) {
      const heightOut = !!(opts && opts.height) || p.output === 'height', mask = p.output === 'mask', relief = p.relief || 'carved';
      const S = Math.min(W, H), k = S / 512, seed = p.seed | 0, N = W * H, ar = H / W;
      const sc = Math.max(1, p.scale | 0), nx = Math.max(1, Math.round((sc * W) / S)), ny = Math.max(1, Math.round((sc * H) / S));
      const oct = Math.max(1, p.octaves | 0), cnt = Math.max(1, p.count);
      const mode = p.mode || 'contours';
      // waves: integer direction so the lines tile
      const a = ((+p.angle || 0) * Math.PI) / 180, lw = Math.max(1, Math.round(cnt));
      let kx = Math.round(Math.sin(a) * lw * (W / S)), ky = Math.round(Math.cos(a) * lw * (H / S));
      if (!kx && !ky) ky = 1;
      const cx = Math.max(1, p.centers | 0), cy = Math.max(1, Math.round(cx * ar));

      /* ---- field F (in "line units": a line at every integer) ---- */
      const F = new Float32Array(N);
      let fmin = Infinity, fmax = -Infinity;
      for (let y = 0, i = 0; y < H; y++) {
        const v = (y + 0.5) / H;
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W;
          const n = U.fractal('perlin', u * nx, v * ny, nx, ny, oct, 0.5, 'fbm', seed + 1);
          let f;
          if (mode === 'contours') f = (n - 0.5) * cnt * 2.2 + 0.37; // phase: perlin is exactly 0.5 along some lattice edges, keep lines off that level // fbm mostly spans ~0.3..0.7: stretch so the count means lines across
          else if (mode === 'rings') { const w = U.worley(u * cx, v * cy, cx, cy, seed + 2); f = (w.f1 + (n - 0.5) * p.distort * 0.5) * cnt * 0.5; }
          else if (mode === 'waves') f = kx * u + ky * v + (n - 0.5) * p.distort * lw * 0.4;
          else { // radial: distance to the tile center on the torus
            const du = Math.min(Math.abs(u - 0.5), 1 - Math.abs(u - 0.5)) * (W / S), dv = Math.min(Math.abs(v - 0.5), 1 - Math.abs(v - 0.5)) * (H / S);
            f = (Math.hypot(du, dv) + (n - 0.5) * p.distort * 0.3) * cnt;
          }
          F[i] = f; if (f < fmin) fmin = f; if (f > fmax) fmax = f;
        }
      }

      const img = ctx.createImageData(W, H), o = img.data;
      const lc = U.hex(p.lineColor), lc2 = U.hex(p.lineColor2), b1 = U.hex(p.bg), b2 = U.hex(p.bg2), b3 = U.hex(p.c3), b4 = U.hex(p.c4);
      const pal4 = [b1, b2, b3, b4];
      const mot = p.mottle > 0 ? U.coarseField(W, H, 120, (x, y) => U.fractal('perlin', (x / W) * 3, (y / H) * Math.max(1, Math.round(3 * ar)), 3, Math.max(1, Math.round(3 * ar)), 3, 0.5, 'fbm', seed + 5)) : null;
      const brk = p.breakup > 0 || p.widthVar > 0 ? U.coarseField(W, H, 200, (x, y) => U.fractal('perlin', (x / W) * nx * 3, (y / H) * ny * 3, nx * 3, ny * 3, 3, 0.5, 'fbm', seed + 6)) : null;
      const span = Math.max(1e-6, fmax - fmin), major = Math.max(0, p.major | 0);
      const w0 = p.width * k, gR = Math.max(0.5, p.glowSize * k), softPx = 0.5 + p.soft * 3 * k;
      for (let y = 0, i = 0; y < H; y++) {
        const yu = wr(y - 1, H) * W, yd = wr(y + 1, H) * W;
        for (let x = 0; x < W; x++, i++) {
          const f = F[i], k4 = i * 4;
          if (heightOut && relief === 'field') { const hv = ((f - fmin) / span) * 255; o[k4] = o[k4 + 1] = o[k4 + 2] = hv; o[k4 + 3] = 255; continue; }
          // field gradient (wrapping) -> distance to the nearest line in px
          // waves jump by a whole line count at the tile edge: unwrap that jump so the gradient stays smooth
          const jx = mode === 'waves' ? (x === W - 1 ? kx : 0) + (x === 0 ? kx : 0) : 0, jy = mode === 'waves' ? (y === H - 1 ? ky : 0) + (y === 0 ? ky : 0) : 0;
          const gx = (F[y * W + wr(x + 1, W)] - F[y * W + wr(x - 1, W)] + jx) * 0.5, gy = (F[yd + x] - F[yu + x] + jy) * 0.5;
          const g = Math.max(1e-5, Math.hypot(gx, gy));
          const li = Math.round(f), dl = Math.abs(f - li), dpx = dl / g;
          const isMajor = major > 0 && wr(li, major) === 0;
          let w = w0 * (isMajor ? p.majorWidth : 1);
          if (brk && p.widthVar > 0) w *= 1 + (brk[i] - 0.5) * 2 * p.widthVar;
          let la = w > 0 ? 1 - smoothstep(w / 2 - softPx * 0.5, w / 2 + softPx * 0.5, dpx) : 0;
          if (brk && p.breakup > 0) la *= smoothstep(0.35 + p.breakup * 0.3, 0.45 + p.breakup * 0.3, 1 - brk[i] + 0.25);
          const gl = p.glow > 0 && w > 0 ? Math.exp(-Math.max(0, dpx - w / 2) / gR) * p.glow * 0.7 : 0;
          if (heightOut) {
            // lines as grooves or ridges: a rounded profile across the line (wider for major lines), on a flat mid-gray surface
            const half = Math.max(0.75, w / 2 + softPx * 0.5), q = clamp(dpx / half);
            let prof = w > 0 ? Math.sqrt(1 - q * q) : 0;
            if (brk && p.breakup > 0) prof *= smoothstep(0.35 + p.breakup * 0.3, 0.45 + p.breakup * 0.3, 1 - brk[i] + 0.25);
            const hv = clamp(0.5 + (relief === 'raised' ? 1 : -1) * prof * 0.45 * p.reliefDepth * (isMajor ? 1 : 0.85)) * 255;
            o[k4] = o[k4 + 1] = o[k4 + 2] = hv; o[k4 + 3] = 255; continue;
          }
          if (mask) { const m = clamp(la + gl) * 255; o[k4] = o[k4 + 1] = o[k4 + 2] = m; o[k4 + 3] = 255; continue; }
          // background / bands
          let r, gg, b;
          const band = Math.floor(f);
          if (p.fill === 'alt') { const c = wr(band, 2) ? b2 : b1; r = c[0]; gg = c[1]; b = c[2]; }
          else if (p.fill === 'palette') { const c = pal4[(wr(band, 4) + Math.floor(hash(wr(band, 997), 3, seed + 7) * 2)) % 4]; r = c[0]; gg = c[1]; b = c[2]; }
          else if (p.fill === 'gradient') { const t = (f - fmin) / span; r = lerp(b1[0], b2[0], t); gg = lerp(b1[1], b2[1], t); b = lerp(b1[2], b2[2], t); }
          else { r = b1[0]; gg = b1[1]; b = b1[2]; }
          if (mot) { const m = smoothstep(0.3, 0.7, mot[i]) * p.mottle; const c = p.fill === 'none' ? b2 : [r * 0.85, gg * 0.85, b * 0.85]; r = lerp(r, c[0], m); gg = lerp(gg, c[1], m); b = lerp(b, c[2], m); }
          // lines
          const t2 = isMajor ? 1 : clamp((f - fmin) / span);
          const lr = lerp(lc[0], lc2[0], t2), lg = lerp(lc[1], lc2[1], t2), lb = lerp(lc[2], lc2[2], t2);
          const A = clamp(la * p.lineOpacity * (isMajor ? 1 : 0.92));
          if (gl > 0) { r += lr * gl * 0.6; gg += lg * gl * 0.6; b += lb * gl * 0.6; }
          r = lerp(r, lr, A); gg = lerp(gg, lg, A); b = lerp(b, lb, A);
          if (p.grain > 0) { const m = 1 + (hash(x, y, seed + 9) - 0.5) * p.grain * 0.2; r *= m; gg *= m; b *= m; }
          o[k4] = r; o[k4 + 1] = gg; o[k4 + 2] = b; o[k4 + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
