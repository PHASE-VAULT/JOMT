/* Bullet / projectile impact decal, built from four layers (bottom to top):
     1. smoke / dust grunge   – noisy soot or dust around the hit (color only, never in the normal map)
     2. surrounding material  – a soft gradient bulge of the surface pushed up around the hit
     3. bent-out material     – noise-based torn petals curling up around the hole; the main color / material
     4. hole                  – the dark center
   Shapes come from angular noise (hole edge, petal reach, surround reach). Every pixel gets a height; the
   petals and the surround are lit from that height field, and normal map mode uses the same field (without
   the smoke), so color and normals always match. Transparent output, no background. */
(function () {
  'use strict';
  const U = window.UGTG;
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const LN = 1024; // angular resolution of the shape lookup tables
  const LIGHT = (() => { const l = [-0.55, -0.6, 0.58], m = Math.hypot(...l); return l.map((v) => v / m); })();

  U.register({
    id: 'impact',
    name: 'Bullet Impact',
    desc: 'Layered bullet / projectile impact decal: hole, bent-out material, surrounding bulge and smoke / dust, with normal map',
    tags: ['Decals', 'Shooter'],
    bg: 'checker',
    normalMap: true, // normal map mode, from the impact's own height field (no smoke)
    heightMap: true,
    normalDesc: 'Normal map of the impact itself (hole, bent material, surrounding bulge); the smoke stain is left out',
    normalDefaults: { strength: 8, smooth: 0.5 },
    icon: U.icon('<circle cx="12" cy="12" r="2.2"/><path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1M15.2 15.2l2.1 2.1M17.3 6.7l-2.1 2.1M8.8 15.2l-2.1 2.1"/>'),
    params: [
      { type: 'section', label: 'Hole' },
      { key: 'holeSize', label: 'Hole size', type: 'range', min: 0.01, max: 0.15, step: 0.001, default: 0.055, tip: 'Hole radius as a fraction of the texture; every layer scales with it' },
      { key: 'roundness', label: 'Roundness', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Global perfectness: smooths away the irregular hole edge, the tears between the flaps, the uneven flap reach, the surface noise and the bulge outline. 1 = a perfectly round impact' },
      { key: 'holeIrregular', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'holeSoft', label: 'Inner depth gradient', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'How far the hole lightens towards its edge (0 = flat black)' },
      { key: 'holeColor', label: 'Hole color', type: 'color', default: '#000000' },
      { key: 'stretch', label: 'Impact angle (stretch)', type: 'range', min: 1, max: 2.5, step: 0.01, default: 1, tip: '1 = straight hit; higher = a glancing hit, elongated along the direction' },
      { key: 'direction', label: 'Direction', type: 'range', min: -180, max: 180, step: 1, default: 0, show: (p) => p.stretch > 1 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Bent material' },
      { key: 'petalSize', label: 'Reach', type: 'range', min: 1.1, max: 5, step: 0.05, default: 2.1, tip: 'How far the torn material bends out (× hole size)' },
      { key: 'petals', label: 'Petals', type: 'int', min: 2, max: 24, default: 8, tip: 'Number of torn flaps' },
      { key: 'jag', label: 'Tearing', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'How deep the tears between the flaps go (0 = one continuous crown)' },
      { key: 'petalNoise', label: 'Surface noise', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'noiseScale', label: 'Noise detail', type: 'range', min: 1, max: 30, step: 0.5, default: 9 },
      { key: 'anisotropy', label: 'Grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Stretches the tearing and the noise along one direction (wood fibers)' },
      { key: 'grainAngle', label: 'Grain direction', type: 'range', min: -90, max: 90, step: 1, default: 0, show: (p) => p.anisotropy > 0 },
      { key: 'petalColor', label: 'Color', type: 'color', default: '#a9aaa6' },
      { key: 'petalColor2', label: 'Color variation', type: 'color', default: '#7c7d79', tip: 'Mixed in by the surface noise' },
      { key: 'shade', label: 'Shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, tip: 'Lighting from the height field (light from the top left)' },

      { type: 'section', label: 'Surrounding material' },
      { key: 'surroundSize', label: 'Reach', type: 'range', min: 1.5, max: 10, step: 0.1, default: 3.6, tip: '× hole size' },
      { key: 'surroundAlpha', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75 },
      { key: 'surroundBulge', label: 'Bulge', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'How much the surface is pushed up towards the hit' },
      { key: 'surroundColor', label: 'Color', type: 'color', default: '#7d7f7a' },

      { type: 'section', label: 'Smoke / dust' },
      { key: 'smoke', label: 'Smoke / dust', type: 'bool', default: true, tip: 'Soot or dust around the hit. Color only: never part of the normal map' },
      { key: 'smokeSize', label: 'Size', type: 'range', min: 1.5, max: 14, step: 0.1, default: 6, show: (p) => p.smoke, tip: '× hole size' },
      { key: 'smokeAlpha', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.smoke },
      { key: 'grunge', label: 'Grunge', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, show: (p) => p.smoke, tip: 'Noisy breakup of the stain' },
      { key: 'grungeScale', label: 'Grunge detail', type: 'range', min: 2, max: 40, step: 0.5, default: 14, show: (p) => p.smoke && p.grunge > 0 },
      { key: 'smokeColor', label: 'Color', type: 'color', default: '#15120f', show: (p) => p.smoke },
    ],
    presets: [
      { name: 'Bare steel', group: 'Metal', values: {} },
      { name: 'Painted metal', group: 'Metal', values: { petalColor: '#b4b5b0', petalColor2: '#85867f', surroundColor: '#4e5a3e', surroundAlpha: 0.9, surroundSize: 3, petals: 7 } },
      { name: 'Thin sheet metal', group: 'Metal', values: { holeSize: 0.045, petalSize: 2.8, petals: 6, jag: 0.85, petalNoise: 0.3, surroundBulge: 0.3, surroundSize: 2.6 } },
      { name: 'Armor plate (large caliber)', group: 'Metal', values: { holeSize: 0.09, petalSize: 1.6, petals: 14, jag: 0.3, petalColor: '#8f918c', petalColor2: '#5c5d59', surroundBulge: 0.9, surroundSize: 2.8, smokeSize: 5, smokeAlpha: 0.8 } },
      { name: 'Rusty metal', group: 'Metal', values: { petalColor: '#9a8a78', petalColor2: '#6a3e22', petalNoise: 0.8, surroundColor: '#7a4528', surroundAlpha: 0.85, smokeColor: '#2a1a10' } },
      { name: 'Wood', group: 'Wood', values: { petalColor: '#d8b585', petalColor2: '#a57a48', surroundColor: '#7a5230', surroundAlpha: 0.6, anisotropy: 0.75, petals: 12, jag: 0.8, petalSize: 2.6, noiseScale: 14, petalNoise: 0.7, surroundBulge: 0.35, smokeAlpha: 0.45, smokeColor: '#1f140c' } },
      { name: 'Dark wood', group: 'Wood', values: { petalColor: '#b38656', petalColor2: '#6a4426', surroundColor: '#3a2412', surroundAlpha: 0.7, anisotropy: 0.75, petals: 12, jag: 0.8, petalSize: 2.6, noiseScale: 14, petalNoise: 0.7, surroundBulge: 0.35, smokeAlpha: 0.4 } },
      { name: 'Concrete', group: 'Stone', values: { petalColor: '#a6a29a', petalColor2: '#7b776f', petals: 16, jag: 0.45, petalSize: 2.4, petalNoise: 0.9, noiseScale: 18, surroundColor: '#8a867e', surroundAlpha: 0.55, surroundBulge: 0.2, smokeColor: '#c9c3b6', smokeAlpha: 0.45, grunge: 0.8 } },
      { name: 'Brick', group: 'Stone', values: { petalColor: '#c48462', petalColor2: '#8a4a32', petals: 14, jag: 0.4, petalSize: 2.3, petalNoise: 0.9, noiseScale: 16, surroundColor: '#9a5a3c', surroundAlpha: 0.5, surroundBulge: 0.2, smokeColor: '#d8b49a', smokeAlpha: 0.4, grunge: 0.8 } },
      { name: 'Plaster / drywall', group: 'Stone', values: { petalColor: '#f0ede6', petalColor2: '#c9c4ba', petals: 10, jag: 0.35, petalSize: 2.2, petalNoise: 0.6, surroundColor: '#e2ddd2', surroundAlpha: 0.5, surroundBulge: 0.25, smokeColor: '#3a3632', smokeAlpha: 0.4 } },
      { name: 'Rubber / tire', group: 'Other', values: { petalColor: '#2c2c2c', petalColor2: '#1a1a1a', petals: 5, jag: 0.25, petalSize: 1.6, petalNoise: 0.2, surroundColor: '#242424', surroundAlpha: 0.6, smokeAlpha: 0.3 } },
      { name: 'No smoke', group: 'Other', values: { smoke: false } },
      { name: 'Glancing hit', group: 'Other', values: { stretch: 1.9, direction: -20, petals: 5 } },
    ],
    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height);
      const S = Math.min(W, H), hr = p.holeSize * S, cx = W / 2, cy = H / 2, seed = p.seed;
      const dir = p.direction * D2R, cd = Math.cos(dir), sd = Math.sin(dir), st = p.stretch;
      const grain = p.grainAngle * D2R, an = p.anisotropy;
      const fr = (x, y, o, s) => U.fractal('perlin', x, y, 0, 0, o, 0.5, 'fbm', seed + s); // 0..1
      const irr = 1 - U.clamp(p.roundness || 0); // roundness: 1 = perfect circle, no noise in the shapes or the surface
      const holeIrr = p.holeIrregular * irr, jag = p.jag * irr, petalNoise = p.petalNoise * irr;

      /* ---------- shape lookup tables over the angle (periodic noise sampled on a circle) ---------- */
      const Rh = new Float32Array(LN), Rp = new Float32Array(LN), Rs = new Float32Array(LN);
      let rMax = 0;
      for (let i = 0; i < LN; i++) {
        const th = (i / LN) * TAU, c = Math.cos(th), s = Math.sin(th);
        Rh[i] = hr * (1 + holeIrr * (fr(c * 2 + 5, s * 2 + 5, 3, 0) - 0.5) * 1.4);
        // torn flaps: broad lobes with narrow tears between them; "tearing" sets how deep the tears go
        const phase = (fr(c * 1.5 + 20, s * 1.5 + 20, 2, 1) - 0.5) * 3 * irr;
        const lob = 0.5 + 0.5 * Math.cos(p.petals * th + phase);
        const sharp = Math.pow(lob, 0.18); // ~1 across a flap, dropping to 0 only in the narrow tear
        const cg = Math.cos(th - grain), aniso = 1 + an * (cg * cg * 2 - 1) * 0.65; // longer along the grain (smooth oval, no kinks)
        const reach = (p.petalSize - 1) * hr * aniso * (1 + 0.8 * irr * (fr(c * 4 + 40, s * 4 + 40, 3, 2) - 0.5));
        Rp[i] = Rh[i] + reach * (1 - jag * 0.92 * (1 - sharp)) * (1 - 0.15 * irr * (1 - sharp));
        Rs[i] = Math.max(Rp[i] * 1.15, hr * p.surroundSize * (1 + 0.4 * irr * (fr(c * 2 + 60, s * 2 + 60, 3, 3) - 0.5)) * (0.6 + 0.4 * aniso));
        rMax = Math.max(rMax, Rs[i]);
      }
      const lut = (A, th) => { const f = (((th / TAU) * LN) % LN + LN) % LN, i = f | 0, t = f - i; return A[i] + (A[(i + 1) % LN] - A[i]) * t; };
      const smokeR = p.smoke ? hr * p.smokeSize : 0;
      const bound = Math.max(rMax, smokeR * 1.25) * st + 2;
      const x0 = Math.max(0, Math.floor(cx - bound)), x1 = Math.min(W, Math.ceil(cx + bound));
      const y0 = Math.max(0, Math.floor(cy - bound)), y1 = Math.min(H, Math.ceil(cy + bound));
      const bw = x1 - x0, bh = y1 - y0;
      if (height) { ctx.fillStyle = 'rgb(128,128,128)'; ctx.fillRect(0, 0, W, H); } // neutral height everywhere
      if (bw <= 0 || bh <= 0) return;

      /* ---------- pass 1: height field + layer coverages ---------- */
      const N = bw * bh;
      const Hm = new Float32Array(N).fill(0.5), wHole = new Float32Array(N), wPetal = new Float32Array(N);
      const wSur = new Float32Array(N), aSmoke = new Float32Array(N), nv = new Float32Array(N), hDepth = new Float32Array(N);
      const ss = smoothstep, aa = 1;
      const ns = p.noiseScale / hr, ca = Math.cos(grain), sa = Math.sin(grain);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          const u = (dx * cd + dy * sd) / st, v = -dx * sd + dy * cd;
          const r = Math.hypot(u, v), j = (y - y0) * bw + (x - x0);
          if (!height && smokeR > 0 && r < smokeR * 1.25) {
            const d = r / smokeR, g = fr((x / S) * p.grungeScale, (y / S) * p.grungeScale, 4, 7);
            const a = Math.exp(-d * d * 2.8) * (1 - p.grunge + p.grunge * 2.2 * Math.max(0, g - 0.3)) * ss(1.25, 0.9, d);
            aSmoke[j] = Math.min(1, Math.max(0, a) * p.smokeAlpha);
          }
          if (r > rMax + 2) continue;
          const th = Math.atan2(v, u), rh = lut(Rh, th), rp = lut(Rp, th), rs = lut(Rs, th);
          // surface noise, stretched along the grain
          const gu = (u * ca + v * sa) / (1 + an * 3), gv = -u * sa + v * ca;
          const n = fr(gu * ns * 0.12 + 100, gv * ns * 0.12 + 100, 4, 4);
          nv[j] = n;
          // surrounding bulge
          let h = 0.5, sur = 0;
          if (r < rs) {
            const s = Math.max(0, (r - rp) / Math.max(1e-3, rs - rp));
            const bump = (1 - s) * (1 - s);
            h += 0.2 * p.surroundBulge * bump;
            sur = p.surroundAlpha * Math.pow(1 - s, 1.5) * (1 + 0.5 * irr * (n - 0.5));
          }
          // bent-out petals: highest at the lip of the hole, sloping down outwards
          const inP = ss(rp + aa, rp - aa, r);
          if (inP > 0) {
            const t = Math.max(0, Math.min(1, (r - rh) / Math.max(1e-3, rp - rh)));
            const hp = 0.5 + 0.42 * (1 - 0.65 * t) + petalNoise * 0.14 * (n - 0.5);
            h += (Math.max(h, hp) - h) * inP;
          }
          // hole
          const inH = ss(rh + aa, rh - aa, r), depth = Math.max(0, Math.min(1, r / Math.max(1e-3, rh)));
          hDepth[j] = depth;
          h += (0.03 + 0.12 * Math.pow(depth, 3) - h) * inH;
          Hm[j] = h; wHole[j] = inH; wPetal[j] = inP; wSur[j] = sur;
        }
      }

      const out = ctx.createImageData(bw, bh), d = out.data;
      if (height) {
        for (let j = 0; j < N; j++) { const v = Math.round(Math.max(0, Math.min(1, Hm[j])) * 255); d[j * 4] = d[j * 4 + 1] = d[j * 4 + 2] = v; d[j * 4 + 3] = 255; }
        ctx.putImageData(out, x0, y0);
        return;
      }

      /* ---------- pass 2: light the petals and the surround from the height field, composite the layers ---------- */
      const cP1 = U.hex(p.petalColor), cP2 = U.hex(p.petalColor2), cS = U.hex(p.surroundColor), cH = U.hex(p.holeColor), cSm = U.hex(p.smokeColor);
      const g = hr * 2.2; // slope scale: features about the hole size read as clear slopes
      let R = 0, G = 0, B = 0, A = 0;
      const over = (cr, cg, cb, a) => { // straight-alpha "over"
        if (a <= 0) return;
        const na = a + A * (1 - a);
        R = (cr * a + R * A * (1 - a)) / na; G = (cg * a + G * A * (1 - a)) / na; B = (cb * a + B * A * (1 - a)) / na; A = na;
      };
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const j = y * bw + x;
          const hL = Hm[x > 0 ? j - 1 : j], hR = Hm[x < bw - 1 ? j + 1 : j], hU = Hm[y > 0 ? j - bw : j], hD = Hm[y < bh - 1 ? j + bw : j];
          const nx = -(hR - hL) * 0.5 * g, ny = -(hD - hU) * 0.5 * g, l = 1 / Math.hypot(nx, ny, 1);
          const lit = (nx * LIGHT[0] + ny * LIGHT[1] + LIGHT[2]) * l - LIGHT[2];
          const f = Math.max(0.15, 1 + p.shade * 1.8 * lit);
          R = G = B = A = 0;
          over(cSm[0], cSm[1], cSm[2], aSmoke[j]);
          over(cS[0] * f, cS[1] * f, cS[2] * f, wSur[j] * (1 - wPetal[j]));
          if (wPetal[j] > 0) {
            const m = Math.max(0, Math.min(1, (nv[j] - 0.3) * 1.6 * Math.min(1, petalNoise * 1.5 + 0.2 * irr)));
            over((cP1[0] + (cP2[0] - cP1[0]) * m) * f, (cP1[1] + (cP2[1] - cP1[1]) * m) * f, (cP1[2] + (cP2[2] - cP1[2]) * m) * f, wPetal[j]);
          }
          if (wHole[j] > 0) { // dark center, lightening slightly towards the edge
            const e = p.holeSoft * 0.35 * Math.pow(hDepth[j], 3);
            over(cH[0] + (cP2[0] - cH[0]) * e, cH[1] + (cP2[1] - cH[1]) * e, cH[2] + (cP2[2] - cH[2]) * e, wHole[j]);
          }
          const o = j * 4;
          d[o] = Math.min(255, R); d[o + 1] = Math.min(255, G); d[o + 2] = Math.min(255, B); d[o + 3] = Math.round(A * 255);
        }
      }
      const layer = U.canvas(bw, bh);
      layer.getContext('2d').putImageData(out, 0, 0);
      const fin = U.canvas(W, H), fc = fin.getContext('2d');
      fc.drawImage(layer, x0, y0);
      ctx.drawImage(fin, 0, 0);
    },
  });

  function smoothstep(e0, e1, x) { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }
})();
