/* Clouds: individual cloud puffs on a transparent background, seen from the side (puffs sitting on a
   flat base) or from above (a round cluster of puffs). Each cloud is a smooth union of discs, eroded by
   noise, fitted inside the image with a margin and faded out toward the image edge, so the sprite never
   shows a hard border. Everything is one signed field F (0 at the cloud edge, > 0 inside) sampled on a
   grid in short-side units and upsampled, so every export size matches the preview. Every puff is a dome
   whose height drives the lighting; side views add self-shadowing toward the light. Styles: realistic
   (soft edges, silver lining), soft / painterly, toon (posterized bands, outline, cel highlight) and flat
   (hard-edged bands, pixel-art friendly). */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const RAD = Math.PI / 180;

  const isSide = (p) => p.projection === 'side';
  const soft = (p) => p.style === 'realistic' || p.style === 'soft';
  const banded = (p) => p.style === 'toon' || p.style === 'flat';

  /* side view: puffs { x, y, r } on a flat base (units: short side = 1, y down), centered on x = 0 */
  function cumulus(rnd, w, h, puff) {
    const P = [], n = Math.max(3, Math.round((w / h) * 1.8)), base = 0;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, dome = 1 - (2 * t - 1) ** 2;
      const r = h * (0.2 + 0.22 * dome) * (0.8 + 0.4 * rnd());
      P.push({ x: (t - 0.5) * (w - 2 * r) + (rnd() - 0.5) * r * 0.4, y: base - r * (0.75 + 0.2 * rnd()) - dome * h * 0.12, r });
    }
    const m = Math.round(1 + puff * 5 * Math.min(2.5, (w / h) * 0.6));
    for (let j = 0; j < m; j++) {
      const t = 0.15 + 0.7 * rnd(), dome = 1 - (2 * t - 1) ** 2;
      const r = h * (0.14 + 0.24 * dome) * (0.7 + 0.5 * rnd());
      const y = base - h * (0.3 + 0.45 * dome * (0.5 + 0.5 * rnd()));
      P.push({ x: (t - 0.5) * (w - 2 * r), y: Math.max(base - h + r, y), r });
    }
    return P;
  }

  /* top view: a round / oval cluster of puffs, bigger ones toward the middle, centered on (0, 0) */
  function cluster(rnd, w, h, puff) {
    const P = [], n = Math.round(5 + puff * 14);
    P.push({ x: 0, y: 0, r: Math.min(w, h) * 0.32 });
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 0.8, rr = Math.min(w, h) * (0.12 + 0.2 * (1 - d) * (0.6 + 0.6 * rnd())) * (1.1 - puff * 0.35);
      P.push({ x: Math.cos(a) * d * (w / 2 - rr * 0.6), y: Math.sin(a) * d * (h / 2 - rr * 0.6), r: rr });
    }
    return P;
  }

  U.register({
    id: 'clouds',
    name: 'Clouds',
    desc: 'Single cloud puffs from the side or from above, realistic or stylized, fading out toward the edge',
    uses: [
      'Cloud sprites for 2D games and UI: drift them across a sky, stack several at different speeds for parallax depth, or scatter them as level decoration.',
      'Soft puff textures for particle systems (clouds, steam, dust puffs) and top-down cloud sprites that float over maps in strategy and flight games.',
    ],
    tags: ['Nature', 'VFX'],
    aspect: '2:1',
    icon: U.icon('<path d="M6.5 17.5h11a3.5 3.5 0 0 0 .4-7 5 5 0 0 0-9.6-1.3A3.9 3.9 0 0 0 6.5 17.5z"/>'),
    params: [
      { type: 'section', label: 'Cloud' },
      { key: 'projection', label: 'View', type: 'select', default: 'side', options: [['side', 'Side view'], ['top', 'From above']] },
      { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.85, tip: 'How much of the space inside the margin the cloud fills' },
      { key: 'widthRatio', label: 'Width', type: 'range', min: 0.6, max: 5, step: 0.05, default: 2.2, tip: 'Width relative to the height (the cloud is fitted into the image either way)' },
      { key: 'puff', label: 'Puffiness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, tip: 'More, smaller puffs' },
      { key: 'flat', label: 'Flat base', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75, show: isSide, tip: 'How flat the bottom is' },
      { key: 'noiseScale', label: 'Noise scale', type: 'range', min: 0.5, max: 12, step: 0.1, default: 3, tip: 'Size of the edge noise relative to the cloud' },
      { key: 'detail', label: 'Edge detail', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Noise eating into the shape: billowy, cauliflower-like edges' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 9 },

      { type: 'section', label: 'Edges' },
      { key: 'margin', label: 'Edge margin', type: 'range', min: 0, max: 0.3, step: 0.005, default: 0.04, tip: 'Free border around the cloud (fraction of the short side)' },
      { key: 'fade', label: 'Edge falloff', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.12, tip: 'The cloud fades out over this distance toward the image edge, so the sprite has no hard border' },
      { key: 'fadeShape', label: 'Falloff shape', type: 'select', default: 'radial', options: [['radial', 'Radial (oval)'], ['rect', 'Rectangular']], show: (p) => p.fade > 0 },

      { type: 'section', label: 'Style' },
      { key: 'style', label: 'Style', type: 'select', default: 'realistic', options: [['realistic', 'Realistic'], ['soft', 'Soft / painterly'], ['toon', 'Toon (bands + outline)'], ['flat', 'Flat (pixel-art friendly)']] },
      { key: 'softness', label: 'Edge softness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: soft },
      { key: 'bands', label: 'Tone bands', type: 'int', min: 2, max: 5, default: 3, show: banded },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 10, step: 0.1, default: 0, show: banded, tip: 'px @ 512' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#3a4a6a', show: (p) => banded(p) && p.outline > 0 },
      { key: 'sun', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -60, tip: '-90 = light from straight above, 180 = from the left' },
      { key: 'shade', label: 'Self-shadowing', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'How dark the parts facing away from the light get' },
      { key: 'rim', label: 'Silver lining', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Bright thin edges toward the light (toon / flat: a cel highlight)' },

      { type: 'section', label: 'Color' },
      { key: 'cLit', label: 'Lit color', type: 'color', default: '#ffffff' },
      { key: 'cShadow', label: 'Shadow color', type: 'color', default: '#9eabc2' },
      { key: 'cRim', label: 'Highlight color', type: 'color', default: '#fff6e2', show: (p) => p.rim > 0 },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.05, max: 1, step: 0.01, default: 1 },
    ],
    presets: [
      { name: 'Fair-weather cumulus', group: 'Realistic', values: {} },
      { name: 'Towering cumulus', group: 'Realistic', aspect: '1:1', values: { widthRatio: 1.05, puff: 1, detail: 0.65, shade: 0.75, seed: 12 } },
      { name: 'Small puff', group: 'Realistic', aspect: '1:1', values: { widthRatio: 1.5, puff: 0.4, detail: 0.5, flat: 0.6, seed: 4 } },
      { name: 'Long flat cloud', group: 'Realistic', aspect: '4:1', values: { widthRatio: 4.5, puff: 0.5, flat: 0.9, detail: 0.45, shade: 0.5, seed: 31 } },
      { name: 'Wispy cloud', group: 'Realistic', values: { puff: 0.35, detail: 0.9, noiseScale: 4.5, softness: 0.8, shade: 0.45, rim: 0.6, opacity: 0.9, seed: 15 } },
      { name: 'Sunset cloud', group: 'Realistic', values: { sun: -8, cLit: '#ffd2a0', cShadow: '#6a4f7a', cRim: '#ffe7b8', rim: 0.85, shade: 0.75, seed: 3 } },
      { name: 'Storm cloud', group: 'Realistic', aspect: '1:1', values: { widthRatio: 1.4, puff: 0.9, detail: 0.7, shade: 0.9, cLit: '#b6bcc6', cShadow: '#3a404c', cRim: '#d8dde6', rim: 0.3, seed: 27 } },
      { name: 'Night cloud', group: 'Realistic', values: { cLit: '#8ea0c4', cShadow: '#28324c', cRim: '#c8d4f0', rim: 0.5, shade: 0.7, opacity: 0.9, seed: 19 } },
      { name: 'Toon puff', group: 'Stylized', values: { style: 'toon', bands: 3, outline: 3, detail: 0.15, puff: 0.7, cShadow: '#b4c6e6', seed: 5 } },
      { name: 'Cartoon cloud', group: 'Stylized', aspect: '1:1', values: { style: 'toon', widthRatio: 1.9, puff: 0.6, detail: 0, flat: 0.9, bands: 2, outline: 6, outlineColor: '#2a3550', cShadow: '#c9d8f2', rim: 0, seed: 8 } },
      { name: 'Flat pixel cloud', group: 'Stylized', values: { style: 'flat', bands: 2, detail: 0.25, noiseScale: 2, cShadow: '#c8d6ee', fade: 0, seed: 17 } },
      { name: 'Soft painterly cloud', group: 'Stylized', values: { style: 'soft', softness: 0.8, detail: 0.4, cShadow: '#b6a6cc', cLit: '#fff4ea', seed: 23 } },
      { name: 'Pink candy cloud', group: 'Stylized', aspect: '1:1', values: { style: 'toon', bands: 3, outline: 2, widthRatio: 1.6, detail: 0.1, puff: 0.8, cLit: '#fff0f6', cShadow: '#f2a8c8', cRim: '#ffffff', outlineColor: '#b0507a', seed: 41 } },
      { name: 'Puff from above', group: 'From above', aspect: '1:1', values: { projection: 'top', widthRatio: 1.2, puff: 0.7, detail: 0.6, shade: 0.55, sun: -120, seed: 11 } },
      { name: 'Long cloud from above', group: 'From above', values: { projection: 'top', widthRatio: 2.4, puff: 0.6, detail: 0.7, noiseScale: 4, shade: 0.5, seed: 6 } },
      { name: 'Toon cloud from above', group: 'From above', aspect: '1:1', values: { projection: 'top', style: 'toon', bands: 3, outline: 2, widthRatio: 1.1, detail: 0.2, cShadow: '#b4c6e6', seed: 13 } },
      { name: 'Cloud shadow (from above)', group: 'From above', aspect: '1:1', values: { projection: 'top', widthRatio: 1.3, softness: 0.9, detail: 0.5, shade: 0, rim: 0, cLit: '#000000', cShadow: '#000000', opacity: 0.45, seed: 11 } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), aw = W / S, ah = H / S, seed = p.seed | 0, rnd = U.rng(seed), side = isSide(p);

      /* ---------- grid in short-side units ---------- */
      const G = Math.min(512, Math.max(64, Math.round(S / 2))), st = S / G; // never more nodes than pixels
      const gw = Math.ceil(W / st) + 2, gh = Math.ceil(H / st) + 2, N = gw * gh;
      const F = new Float32Array(N), Z = new Float32Array(N); // Z: surface height for the lighting (units)
      const uOf = (i) => (i * st) / S, vOf = (j) => (j * st) / S;
      const blurZ = (rb) => {
        const tmp = new Float32Array(N);
        for (let pass = 0; pass < 2; pass++) {
          for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
            let sum = 0;
            for (let k = -rb; k <= rb; k++) sum += Z[j * gw + clamp(i + k, 0, gw - 1)];
            tmp[j * gw + i] = sum / (2 * rb + 1);
          }
          for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
            let sum = 0;
            for (let k = -rb; k <= rb; k++) sum += tmp[clamp(j + k, 0, gh - 1) * gw + i];
            Z[j * gw + i] = sum / (2 * rb + 1);
          }
        }
      };
      const noise = (u, v, freq, oct, mode, s) => U.fractal('perlin', u * freq, v * freq, 0, 0, oct, 0.5, mode, s);

      /* ---------- the cloud: built at a nominal size, then fitted inside the margin ---------- */
      const h0 = 0.5, w0 = h0 * p.widthRatio;
      const P = side ? cumulus(rnd, w0, h0, p.puff) : cluster(rnd, w0, h0, p.puff);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const q of P) { x0 = Math.min(x0, q.x - q.r); x1 = Math.max(x1, q.x + q.r); y0 = Math.min(y0, q.y - q.r); y1 = Math.max(y1, side ? 0 : q.y + q.r); }
      // room for the noisy fringe and the soft edge, inside the margin
      const fringe = 0.06 + p.detail * 0.08, availW = Math.max(0.05, aw - 2 * p.margin), availH = Math.max(0.05, ah - 2 * p.margin);
      const k = (p.size * Math.min(availW / ((x1 - x0) * (1 + fringe * 2)), availH / ((y1 - y0) * (1 + fringe * 2))));
      const ox = aw / 2 - ((x0 + x1) / 2) * k, oy = ah / 2 - ((y0 + y1) / 2) * k;
      for (const q of P) { q.x = q.x * k + ox; q.y = q.y * k + oy; q.r *= k; }
      const bottom0 = side ? oy : Infinity, cs = h0 * k; // cloud base (side view) and reference size

      /* ---------- field: smooth union of discs (exp-sum smooth min), domes for the lighting ---------- */
      const b = cs * 0.045 * (0.6 + p.puff * 0.6), E = new Float32Array(N), reach = b * 7;
      for (const q of P) {
        const bottom = side ? bottom0 + (1 - p.flat) * q.r * 0.9 : Infinity; // softer flattening = rounder bottoms
        const R = q.r + reach;
        const i0 = Math.max(0, Math.floor(((q.x - R) * S) / st)), i1 = Math.min(gw - 1, Math.ceil(((q.x + R) * S) / st));
        const j0 = Math.max(0, Math.floor(((q.y - R) * S) / st)), j1 = Math.min(gh - 1, Math.ceil(((q.y + R) * S) / st));
        for (let j = j0; j <= j1; j++) {
          const v = vOf(j), dv = v - q.y;
          for (let i = i0; i <= i1; i++) {
            const du = uOf(i) - q.x, dd = Math.sqrt(du * du + dv * dv), d = Math.max(dd - q.r, v - bottom), o = j * gw + i;
            if (d < reach) E[o] += Math.exp(-d / b);
            if (dd < q.r && v <= bottom) { const z = Math.sqrt(q.r * q.r - dd * dd); if (z > Z[o]) Z[o] = z; }
          }
        }
      }
      const unit = cs * 0.12, fr = p.noiseScale / cs, amp = p.detail;
      for (let j = 0, o = 0; j < gh; j++) {
        const v = vOf(j);
        for (let i = 0; i < gw; i++, o++) {
          let f = E[o] > 0 ? (b * Math.log(E[o])) / unit : -9;
          if (f > -3 && amp > 0) {
            const u = uOf(i);
            const n1 = noise(u, v, fr * 0.5, 4, 'fbm', seed + 101), n2 = noise(u, v, fr * 1.3, 3, 'turbulence', seed + 202);
            f += amp * ((n1 - 0.5) * 3.2 + (n2 - 0.3) * 1.4);
            if (Z[o] > 0) Z[o] += amp * (n1 - 0.5) * cs * 0.12;
          }
          F[o] = Math.max(f, -2.5);
        }
      }
      blurZ(Math.max(1, Math.round((b * 1.5 * S) / st)));
      const depth = 3.5;

      /* ---------- lighting on the grid ---------- */
      const sa = p.sun * RAD, lx = Math.cos(sa), ly = Math.sin(sa);
      const Lg = new Float32Array(N);
      const at = (fi, fj) => {
        const i = clamp(fi, 0, gw - 1.001), j = clamp(fj, 0, gh - 1.001), i0 = i | 0, j0 = j | 0, tx = i - i0, ty = j - j0, o = j0 * gw + i0;
        const a = F[o] + (F[o + 1] - F[o]) * tx, c = F[o + gw] + (F[o + gw + 1] - F[o + gw]) * tx;
        return a + (c - a) * ty;
      };
      const lz = 0.75, ln = Math.hypot(lx, ly, lz), Lx = lx / ln, Ly = ly / ln, Lz = lz / ln, du2 = (2 * st) / S;
      const stepU = cs * 0.06 * (S / st), K = 7;
      for (let j = 0, o = 0; j < gh; j++) for (let i = 0; i < gw; i++, o++) {
        if (F[o] < -2) { Lg[o] = 1; continue; }
        const il = i > 0 ? o - 1 : o, ir = i < gw - 1 ? o + 1 : o, ju = j > 0 ? o - gw : o, jd = j < gh - 1 ? o + gw : o;
        const nx = -(Z[ir] - Z[il]) / du2, ny = -(Z[jd] - Z[ju]) / du2, nl = Math.hypot(nx, ny, 1);
        let lit = 0.2 + 0.8 * Math.max(0, (nx * Lx + ny * Ly + Lz) / nl);
        if (side) {
          // self-shadowing: how much cloud lies between this point and the light
          let occ = 0;
          for (let s = 1; s <= K; s++) occ += clamp(at(i + lx * stepU * s, j + ly * stepU * s) / depth) * (1 - s / (K + 2));
          lit *= Math.exp(-occ * 0.35);
        } else lit *= 0.75 + 0.25 * clamp(F[o] / depth); // thicker parts are brighter from above
        Lg[o] = clamp(1 - p.shade * (1 - lit) * 1.15);
      }

      /* ---------- per pixel ---------- */
      const img = ctx.createImageData(W, H), d = img.data;
      const cL = U.hex(p.cLit), cS = U.hex(p.cShadow), cR = U.hex(p.cRim), cO = U.hex(p.outlineColor);
      const style = p.style, k512 = S / 512;
      const sw = soft(p) ? (style === 'soft' ? 0.6 + p.softness * 2.4 : 0.15 + p.softness * 1.6) : 0;
      const bands = Math.max(2, p.bands | 0), owPx = banded(p) ? p.outline * k512 : 0;
      const L2 = (Gd, o, tx, ty) => { const a = Gd[o] + (Gd[o + 1] - Gd[o]) * tx, c = Gd[o + gw] + (Gd[o + gw + 1] - Gd[o + gw]) * tx; return a + (c - a) * ty; };
      const fineF = (p.noiseScale / cs) * 4;
      // falloff toward the image edge (units of the short side)
      const fade = p.fade, rect = p.fadeShape === 'rect';
      const edgeDist = (u, v) => (rect ? Math.min(u, v, aw - u, ah - v) : (1 - Math.hypot((u - aw / 2) / (aw / 2), (v - ah / 2) / (ah / 2))) * Math.min(aw, ah) / 2);
      for (let y = 0; y < H; y++) {
        const fy = (y + 0.5) / st, gj = Math.min(gh - 2, Math.floor(fy)), ty = fy - gj, v = (y + 0.5) / S;
        for (let x = 0; x < W; x++) {
          const fx = (x + 0.5) / st, gi = Math.min(gw - 2, Math.floor(fx)), tx = fx - gi, o = gj * gw + gi;
          let f = L2(F, o, tx, ty);
          if (f < -2.4) continue;
          let lit = L2(Lg, o, tx, ty), a, r, g, bl;
          if (sw > 0) {
            if (f > -sw * 1.5 && f < sw * 1.5 && p.detail > 0) f += (noise((x + 0.5) / S, v, fineF, 3, 'fbm', seed + 505) - 0.5) * p.detail * 1.6;
            a = smoothstep(-sw * 0.5, sw, f);
            if (style === 'soft') lit = 0.3 + 0.7 * smoothstep(0, 1, lit);
            const t = Math.pow(lit, 0.8);
            r = lerp(cS[0], cL[0], t); g = lerp(cS[1], cL[1], t); bl = lerp(cS[2], cL[2], t);
            if (p.rim > 0) {
              const kk = (1 - smoothstep(0, depth * 0.45, f)) * smoothstep(0.55, 1, lit) * p.rim;
              r = lerp(r, cR[0], kk); g = lerp(g, cR[1], kk); bl = lerp(bl, cR[2], kk);
              a = Math.min(1, a * (1 + kk * 0.4));
            }
          } else {
            // banded: posterized light, hard (1 px) edge, optional outline and cel highlight
            const gpx = Math.max(1e-4, Math.hypot(F[o + 1] - F[o], F[o + gw] - F[o]) / st), aa = gpx * 0.6, ow = owPx * gpx;
            a = smoothstep(-aa, aa, f + ow);
            const q = Math.min(bands - 1, Math.floor(lit * bands * 0.999 + (style === 'flat' ? 0 : 0.15)));
            const t = q / (bands - 1);
            r = lerp(cS[0], cL[0], t); g = lerp(cS[1], cL[1], t); bl = lerp(cS[2], cL[2], t);
            if (p.rim > 0 && lit > 0.9 && f < depth * 0.25 * p.rim) { r = cR[0]; g = cR[1]; bl = cR[2]; }
            if (ow > 0) { const kk = 1 - smoothstep(-aa, aa, f); r = lerp(r, cO[0], kk); g = lerp(g, cO[1], kk); bl = lerp(bl, cO[2], kk); }
            if (style === 'flat') a = a >= 0.5 ? 1 : 0;
          }
          if (fade > 0) a *= smoothstep(0, fade, edgeDist((x + 0.5) / S, v));
          a *= p.opacity;
          if (a <= 0) continue;
          const i4 = (y * W + x) * 4;
          d[i4] = r; d[i4 + 1] = g; d[i4 + 2] = bl; d[i4 + 3] = clamp(a) * 255 + (a < 1 ? U.hash(x, y, 3) - 0.5 : 0);
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
