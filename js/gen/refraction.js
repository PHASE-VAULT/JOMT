/* Glass & refraction normals: tileable normal maps (plus height and DuDv distortion maps) for refraction
   and distortion shaders on glass, ice, water surfaces, heat haze and screen effects.
   A height field is built from one base pattern (frosted, rippled, reeded / fluted, hammered, pebbled,
   glass blocks, crackle, heat haze, warped, fresnel lens) plus overlays (frost, rain droplets with
   trails, smudges). Heights are in short-side units, so slopes (= refraction strength) don't depend on
   the pattern scale or the export size. Normals come from wrapped central differences: seamless.
   The WebGL box in the corner (js/glpreview.js) shows a scene refracted through the result. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;
  const TAU = Math.PI * 2, DEG = Math.PI / 180;

  const PATTERNS = [
    ['frosted', 'Frosted / sandblasted'], ['rippled', 'Rippled glass'], ['reeded', 'Reeded / fluted glass'], ['hammered', 'Hammered glass'],
    ['pebbled', 'Pebbled glass'], ['blocks', 'Glass blocks'], ['crackle', 'Crackle / shattered'], ['wavy', 'Warped / wavy'],
    ['heat', 'Heat haze'], ['fresnel', 'Fresnel lens rings'], ['flat', 'Flat (overlays only)'],
  ];
  const isP = (...l) => (p) => l.includes(p.pattern);
  const CELLS = ['hammered', 'pebbled', 'crackle'];
  const V = { id: 0, e: 0, es: 0, f1: 0, ci: 0, cj: 0, px: 0, py: 0 };

  U.register({
    id: 'refraction',
    name: 'Glass & Refraction Normals',
    desc: 'Tileable normal, height and DuDv maps for glass, ice and water refraction: frosted, reeded, hammered, blocks, raindrops, heat haze',
    uses: ['Distortion / refraction normal maps for glass, windows, ice, water surfaces, heat haze and lens effects in real-time shaders; check the look in the live WebGL preview.', 'DuDv offset maps for screen-space distortion such as shockwaves, wet lenses and UI glass panels.'],
    tags: ['Texturing', 'VFX'],
    tileable: true,
    normalMap: false, // the output already is a normal map
    icon: U.icon('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 3v18M12 3v18M16 3v18" opacity=".45"/><path d="M6 8l4-3M6 13l8-6" opacity=".9"/>'),
    exportLayers: (p) => (p.output === 'both' ? [{ id: 'normal', suffix: 'normal' }, { id: 'height', suffix: 'height' }] : null),
    glPreview: { isNormal: (p) => p.output === 'normal' || (p.output === 'both' && (p.view || 'normal') === 'normal'), flipY: (p) => p.yDir === 'dx' },
    params: [
      { type: 'section', label: 'Pattern' },
      { key: 'pattern', label: 'Pattern', type: 'select', default: 'reeded', options: PATTERNS },
      { key: 'scale', label: 'Scale', type: 'int', min: 1, max: 96, default: 10, show: (p) => p.pattern !== 'flat', tip: 'Features across the short side (whole numbers, so it tiles)' },
      { key: 'angle', label: 'Direction (°)', type: 'range', min: 0, max: 180, step: 1, default: 0, show: isP('rippled', 'reeded', 'heat'), tip: '0 = vertical reeds / ripples running top to bottom. Rounded to whole wave counts per tile' },
      { key: 'concave', label: 'Concave (fluted)', type: 'bool', default: false, show: isP('reeded', 'hammered', 'pebbled', 'blocks'), tip: 'Grooves / dimples instead of ribs / domes' },
      { key: 'sharp', label: 'Sharpness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: isP('rippled', 'hammered', 'pebbled', 'crackle', 'reeded'), tip: 'Rippled: pointed crests. Hammered / pebbled: cone instead of sphere. Crackle: facet tilt. Reeded: flatter tops' },
      { key: 'jitter', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, show: isP(...CELLS), tip: 'Random cell placement (0 = regular grid)' },
      { key: 'gap', label: 'Groove width', type: 'range', min: 0, max: 12, step: 0.1, default: 2.5, show: isP('blocks', 'crackle'), tip: 'px @ 512' },
      { key: 'rings', label: 'Rings', type: 'range', min: 0, max: 12, step: 0.5, default: 3, show: isP('blocks'), tip: 'Concentric ripples inside each block' },
      { key: 'octaves', label: 'Detail (octaves)', type: 'int', min: 1, max: 6, default: 4, show: isP('frosted', 'wavy', 'heat') },
      { key: 'warp', label: 'Warp', type: 'range', min: 0, max: 2, step: 0.01, default: 0.15, show: (p) => p.pattern !== 'flat' && p.pattern !== 'fresnel', tip: 'Bends the pattern with noise (hand-made, imperfect glass)' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 3 },

      { type: 'section', label: 'Overlays', active: (p) => p.frost > 0 || p.drops > 0 || p.smudge > 0 },
      { key: 'frost', label: 'Frost', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Fine sandblasted noise on top' },
      { key: 'frostScale', label: 'Frost scale', type: 'int', min: 8, max: 160, default: 64, show: (p) => p.frost > 0 },
      { key: 'drops', label: 'Rain drops', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Droplets sitting on the glass (amount)' },
      { key: 'dropSize', label: 'Drop size', type: 'range', min: 0.1, max: 2, step: 0.01, default: 0.6, show: (p) => p.drops > 0 },
      { key: 'dropVar', label: 'Size variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, show: (p) => p.drops > 0 },
      { key: 'trails', label: 'Run-down trails', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: (p) => p.drops > 0, tip: 'Share of the drops that leave a trail running down' },
      { key: 'smudge', label: 'Smudges', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Large, soft wipe marks' },

      { type: 'section', label: 'Output' },
      { key: 'strength', label: 'Normal strength', type: 'range', min: 0, max: 4, step: 0.01, default: 1, tip: 'Scales every slope: how strongly the glass bends the view' },
      { key: 'output', label: 'Output', type: 'select', default: 'normal', options: [['normal', 'Normal map'], ['dudv', 'DuDv distortion (RG offset)'], ['height', 'Height map'], ['both', 'Normal + height (separate files)']], tip: 'DuDv: red / green = offset direction around 0.5, blue = 0 (Unity / Godot screen distortion shaders)' },
      { key: 'yDir', label: 'Green channel', type: 'select', default: 'gl', show: (p) => p.output !== 'height', options: [['gl', 'OpenGL (Y+) · Unity, Blender, Godot'], ['dx', 'DirectX (Y−) · Unreal, Substance DX']] },
      { key: 'view', label: 'Preview layer', type: 'select', default: 'normal', show: (p) => p.output === 'both', options: [['normal', 'Normal map'], ['height', 'Height map']], tip: 'Preview only, the export uses the settings above' },
    ],
    presets: [
      { name: 'Reeded glass (ribs)', group: 'Architectural', values: { pattern: 'reeded', scale: 12, warp: 0.05 } },
      { name: 'Fluted glass (grooves)', group: 'Architectural', values: { pattern: 'reeded', scale: 18, concave: true, sharp: 0.1, warp: 0.04 } },
      { name: 'Frosted bathroom glass', group: 'Architectural', values: { pattern: 'frosted', scale: 80, octaves: 3, warp: 0, strength: 0.6 } },
      { name: 'Hammered glass', group: 'Architectural', values: { pattern: 'hammered', scale: 9, sharp: 0.1, jitter: 0.9, warp: 0.25, concave: true } },
      { name: 'Pebbled glass', group: 'Architectural', values: { pattern: 'pebbled', scale: 22, sharp: 0.15, jitter: 0.8, warp: 0.1, strength: 0.8 } },
      { name: 'Glass blocks', group: 'Architectural', values: { pattern: 'blocks', scale: 3, gap: 5, rings: 3, warp: 0.05, strength: 1.2 } },
      { name: 'Rippled cathedral glass', group: 'Architectural', values: { pattern: 'rippled', scale: 7, angle: 12, sharp: 0.2, warp: 0.6 } },
      { name: 'Old wavy window', group: 'Architectural', values: { pattern: 'wavy', scale: 3, octaves: 3, warp: 0.6, strength: 0.6 } },
      { name: 'Rain on window', group: 'Weather', values: { pattern: 'wavy', scale: 2, octaves: 2, warp: 0.3, strength: 0.9, drops: 0.6, dropSize: 0.6, dropVar: 0.8, trails: 0.45, smudge: 0.2 } },
      { name: 'Heavy rain droplets', group: 'Weather', values: { pattern: 'flat', drops: 1, dropSize: 0.45, dropVar: 0.9, trails: 0.6 } },
      { name: 'Condensation', group: 'Weather', values: { pattern: 'frosted', scale: 40, octaves: 2, warp: 0, strength: 0.4, drops: 1, dropSize: 0.18, dropVar: 0.8, trails: 0.05 } },
      { name: 'Frosted with clear drops', group: 'Weather', values: { pattern: 'frosted', scale: 90, octaves: 3, warp: 0, strength: 0.7, drops: 0.5, dropSize: 0.7, trails: 0.4 } },
      { name: 'Shattered safety glass', group: 'Damage', values: { pattern: 'crackle', scale: 14, jitter: 1, sharp: 0.5, gap: 1.2, warp: 0.1, strength: 1.4 } },
      { name: 'Cracked ice', group: 'Damage', values: { pattern: 'crackle', scale: 6, jitter: 1, sharp: 0.25, gap: 3, warp: 0.5, frost: 0.35, frostScale: 48 } },
      { name: 'Heat haze', group: 'VFX', values: { pattern: 'heat', scale: 4, octaves: 4, warp: 0.8, strength: 0.5 } },
      { name: 'Water surface (calm)', group: 'VFX', values: { pattern: 'wavy', scale: 4, octaves: 4, warp: 0.4, strength: 0.6 } },
      { name: 'Fresnel lens', group: 'VFX', values: { pattern: 'fresnel', scale: 14, strength: 0.9 } },
      { name: 'Shower door (pebbles + frost)', group: 'Architectural', values: { pattern: 'pebbled', scale: 30, sharp: 0.3, frost: 0.4, frostScale: 96, strength: 0.7 } },
    ],

    render(ctx, W, H, p, opts) {
      opts = opts || {};
      let view = p.output === 'height' ? 'height' : p.output === 'dudv' ? 'dudv' : 'normal';
      if (p.output === 'both') view = opts.layer || (opts.preview ? p.view || 'normal' : 'normal');
      if (opts.height) view = 'height';
      if (opts.glNormal) view = 'normal';

      const S = Math.min(W, H), N = W * H, seed = p.seed | 0;
      const per = (f) => [Math.max(1, Math.round((f * W) / S)), Math.max(1, Math.round((f * H) / S))];
      const sc = Math.max(1, p.scale | 0), [px, py] = per(sc);
      const h = new Float32Array(N);
      const pat = p.pattern, warp = pat === 'fresnel' || pat === 'flat' ? 0 : +p.warp || 0;

      // tileable warp (uv offset, in units of one feature)
      let WX = null, WY = null;
      if (warp > 0) {
        const [qx, qy] = per(Math.max(1, Math.round(sc / 4)));
        WX = U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * qx, (y / H) * qy, qx, qy, 3, 0.5, 'fbm', seed + 51) - 0.5);
        WY = U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * qx, (y / H) * qy, qx, qy, 3, 0.5, 'fbm', seed + 52) - 0.5);
      }

      // wave vector for directional patterns: whole cycles per tile along x and y
      const a = (+p.angle || 0) * DEG;
      let kx = Math.round(Math.cos(a) * px), ky = Math.round(Math.sin(a) * py);
      if (!kx && !ky) kx = 1;
      const kLen = Math.hypot(kx / W, ky / H) * S; // cycles per short side
      const sharp = clamp(+p.sharp || 0), cv = p.concave ? -1 : 1;
      const gapPx = ((+p.gap || 0) * S) / 512;
      const cellPx = S / sc;

      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          let u = (x + 0.5) / W, v = (y + 0.5) / H;
          if (WX) { u += (WX[i] * warp * 2) / px; v += (WY[i] * warp * 2) / py; }
          let z = 0;
          switch (pat) {
            case 'frosted':
              z = (U.fractal('perlin', u * px, v * py, px, py, p.octaves, 0.55, 'fbm', seed) - 0.5) * 0.9 / sc;
              break;
            case 'wavy':
              z = (U.fractal('perlin', u * px, v * py, px, py, p.octaves, 0.5, 'fbm', seed) - 0.5) * 1.6 / sc;
              break;
            case 'heat': {
              // stretched along the direction: long, slowly wobbling streaks (0° = rising vertically)
              const vert = a < 45 * DEG || a > 135 * DEG;
              const hx = vert ? px : Math.max(1, Math.round(px * 0.3)), hy = vert ? Math.max(1, Math.round(py * 0.3)) : py;
              z = (U.fractal('perlin', u * hx, v * hy, hx, hy, p.octaves, 0.5, 'fbm', seed) - 0.5) * 1.4 / sc;
              break;
            }
            case 'rippled': {
              const ph = TAU * (kx * u + ky * v);
              let s = Math.sin(ph);
              if (sharp > 0) { const c = sharp * 0.85, t = (s + 1) * 0.5; s = (2 * t * (1 - c)) / (1 - c * t) - 1; }
              z = (s * 0.5) / (TAU * kLen) * 2;
              break;
            }
            case 'reeded': {
              let f = kx * u + ky * v;
              f -= Math.floor(f);
              const t = 2 * f - 1, flat = 1 - sharp * 0.85;
              const prof = Math.sqrt(Math.max(0, 1 - 0.97 * Math.pow(Math.abs(t), 2 / Math.max(0.3, flat)) ));
              z = (cv * prof * 0.5) / kLen;
              break;
            }
            case 'hammered':
            case 'pebbled':
            case 'crackle': {
              U.voro(u * px, v * py, px, py, seed, clamp(+p.jitter), false, W / px, H / py, 0, V);
              const R = cellPx * 0.55;
              if (pat === 'hammered') {
                const d = Math.min(1.3, V.f1 / R);
                z = (cv * lerp(d * d, d, sharp) * 0.5 * R) / S;
              } else if (pat === 'pebbled') {
                const t = clamp(V.e / R), size = 0.7 + 0.6 * V.id;
                z = (cv * lerp(Math.sqrt(1 - (1 - t) * (1 - t)), t, sharp) * 0.45 * R * size) / S;
              } else {
                // tilted flat facets with grooves along the cracks
                const tx = (hash(V.ci, V.cj, seed + 11) - 0.5) * sharp * 0.6, ty = (hash(V.ci, V.cj, seed + 12) - 0.5) * sharp * 0.6;
                const lx = (u * px - V.px) * (W / px), ly = (v * py - V.py) * (H / py);
                const groove = 1 - smoothstep(0, Math.max(0.5, gapPx), V.e);
                z = (lx * tx + ly * ty - groove * Math.max(0.5, gapPx) * 0.8) / S;
              }
              break;
            }
            case 'blocks': {
              let fx = u * px, fy = v * py;
              fx -= Math.floor(fx); fy -= Math.floor(fy);
              const cw = W / px, ch = H / py, bx = 2 * fx - 1, by = 2 * fy - 1;
              const edge = Math.min((1 - Math.abs(bx)) * cw, (1 - Math.abs(by)) * ch) * 0.5; // px to the block border
              const pil = (1 - Math.pow(Math.abs(bx), 6)) * (1 - Math.pow(Math.abs(by), 6));
              const r = Math.hypot(bx, by), rings = +p.rings || 0;
              const rip = rings > 0 ? Math.cos(r * rings * Math.PI) * 0.12 * (1 - Math.min(1, r)) : 0;
              const groove = gapPx > 0 ? 1 - smoothstep(0, gapPx, edge) : 0;
              z = ((cv * (pil * 0.3 + rip) - groove * 0.25) * Math.min(cw, ch)) / S;
              break;
            }
            case 'fresnel': {
              const rx = ((u - 0.5) * W) / S, ry = ((v - 0.5) * H) / S, r = Math.hypot(rx, ry);
              let f = r * sc;
              f -= Math.floor(f);
              z = (f / sc) * r * 2.4;
              break;
            }
            default: z = 0;
          }
          h[i] = z;
        }
      }

      // frost: fine sandblasted noise
      if (p.frost > 0) {
        const [fx, fy] = per(Math.max(4, p.frostScale | 0));
        for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
          h[i] += (U.fractal('perlin', ((x + 0.5) / W) * fx, ((y + 0.5) / H) * fy, fx, fy, 2, 0.5, 'fbm', seed + 77) - 0.5) * (0.7 / fx) * (W / S) * p.frost;
        }
      }
      // smudges: soft low-frequency wipes
      if (p.smudge > 0) {
        const [mx, my] = per(3);
        for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
          const n = U.fractal('perlin', ((x + 0.5) / W) * mx, ((y + 0.5) / H) * my, mx, my, 3, 0.5, 'ridged', seed + 88);
          h[i] += smoothstep(0.55, 0.95, n) * 0.012 * p.smudge;
        }
      }
      // rain drops: hemispherical caps (max blend), trails running down; wrapped across the edges
      if (p.drops > 0) {
        const rnd = U.rng(seed + 999), area = (W * H) / (S * S), D = new Float32Array(N);
        const R0 = S * 0.03 * p.dropSize, count = Math.min(3000, Math.round(p.drops * 260 * area / Math.max(0.15, p.dropSize)));
        for (let n = 0; n < count; n++) {
          const cx = rnd() * W, cy = rnd() * H, r = Math.max(1.2, R0 * (1 - p.dropVar * 0.85 * rnd() * rnd() * 1.2));
          const hr = (r / S) * 0.55, trail = rnd() < p.trails, tl = trail ? r * (3 + rnd() * 10) : 0, tw = r * 0.38;
          const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r), y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r + tl);
          for (let yy = y0; yy <= y1; yy++) {
            const row = U.mod(yy, H) * W, dy = yy + 0.5 - cy;
            for (let xx = x0; xx <= x1; xx++) {
              const dx = xx + 0.5 - cx, d2 = dx * dx + dy * dy;
              let z = -1;
              if (d2 < r * r) z = hr * Math.sqrt(1 - d2 / (r * r));
              else if (trail && dy > 0 && dy < tl && Math.abs(dx) < tw) {
                const k = 1 - Math.abs(dx) / tw, fade = 1 - dy / tl;
                z = hr * 0.22 * Math.sqrt(k) * fade;
              }
              if (z < 0) continue;
              const i = row + U.mod(xx, W);
              if (z > D[i]) D[i] = z; // overlapping drops merge instead of stacking
            }
          }
        }
        for (let i = 0; i < N; i++) h[i] += D[i];
      }

      const img = ctx.createImageData(W, H), o = img.data;
      if (view === 'height') {
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < N; i++) { if (h[i] < lo) lo = h[i]; if (h[i] > hi) hi = h[i]; }
        const s = hi - lo > 1e-12 ? 255 / (hi - lo) : 0;
        for (let i = 0, k = 0; i < N; i++, k += 4) { o[k] = o[k + 1] = o[k + 2] = s ? (h[i] - lo) * s + 0.5 : 128; o[k + 3] = 255; }
      } else {
        const K = +p.strength >= 0 ? +p.strength : 1, gy = p.yDir === 'dx' ? -1 : 1, hs = S * 0.5;
        for (let y = 0; y < H; y++) {
          const ru = U.mod(y - 1, H) * W, rc = y * W, rd = U.mod(y + 1, H) * W;
          for (let x = 0; x < W; x++) {
            const xl = x ? x - 1 : W - 1, xr = x === W - 1 ? 0 : x + 1;
            const dx = (h[rc + xr] - h[rc + xl]) * hs, dy = (h[rd + x] - h[ru + x]) * hs;
            const nx = -dx * K, ny = dy * K * gy, l = 1 / Math.sqrt(nx * nx + ny * ny + 1), k = (rc + x) * 4;
            o[k] = (nx * l * 0.5 + 0.5) * 255 + 0.5;
            o[k + 1] = (ny * l * 0.5 + 0.5) * 255 + 0.5;
            o[k + 2] = view === 'dudv' ? 0 : (l * 0.5 + 0.5) * 255 + 0.5;
            o[k + 3] = 255;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
