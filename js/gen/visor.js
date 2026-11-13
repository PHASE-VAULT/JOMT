/* Visor / glass crack decal: one centered hit on a square, transparent texture, meant to be placed and
   scaled in the engine (helmet visors, face shields, screens). Chaotic milky shattered center, jagged
   radial cracks with branches, partial concentric rings and a soft haze; optional scratches and smudges
   around it that fade out towards the edges, so the square never shows. Always 1:1. */
(function () {
  'use strict';
  const U = window.UGTG;
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;

  function crackPts(rnd, x, y, a, L, jag, step) {
    const pts = [[x, y]];
    let d = 0, ang = a;
    while (d < L) {
      ang += (rnd() - 0.5) * jag;
      ang += (a - ang) * 0.2;
      const s = step * (0.5 + rnd());
      x += Math.cos(ang) * s; y += Math.sin(ang) * s; d += s;
      pts.push([x, y]);
    }
    return pts;
  }
  const pointAt = (pts, cx, cy, r) => pts.find(([x, y]) => Math.hypot(x - cx, y - cy) >= r) || null;

  U.register({
    id: 'visor',
    name: 'Visor Cracks',
    desc: 'Cracked visor / glass decal: shattered hit with radial and ring cracks, scratches; square, placed in engine',
    tags: ['UI', 'Shooter'],
    fixedAspect: '1:1',
    bg: 'black',
    icon: U.icon('<rect x="3" y="3" width="18" height="18" rx="2" opacity=".4"/><path d="M12 12l-6-4M12 12l-2 8M12 12l8-3M12 12l6 6M12 12l-7 3M12 12l1-8"/>'),
    params: [
      { type: 'section', label: 'Hit' },
      { key: 'size', label: 'Crack reach', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.92, tip: 'How far the cracks run, as a fraction of the distance from the center to the texture edge' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 19 },

      { type: 'section', label: 'Shatter' },
      { key: 'shatter', label: 'Shattered center', type: 'range', min: 0, max: 0.35, step: 0.005, default: 0.2, tip: 'Radius of the bright crushed area, as a fraction of the texture size' },
      { key: 'shards', label: 'Shards', type: 'int', min: 0, max: 300, default: 120, show: (p) => p.shatter > 0 },
      { key: 'core', label: 'Core brightness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, show: (p) => p.shatter > 0 },
      { key: 'haze', label: 'Milky haze', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Soft frosted glow around the impact' },

      { type: 'section', label: 'Cracks' },
      { key: 'cracks', label: 'Radial cracks', type: 'int', min: 0, max: 60, default: 22 },
      { key: 'crackVar', label: 'Length variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65, show: (p) => p.cracks > 0 },
      { key: 'jag', label: 'Jaggedness', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.55, show: (p) => p.cracks > 0 },
      { key: 'branches', label: 'Branching', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.cracks > 0 },
      { key: 'rings', label: 'Concentric cracks', type: 'int', min: 0, max: 8, default: 3, show: (p) => p.cracks > 2 },
      { key: 'ringGaps', label: 'Ring gaps', type: 'range', min: 0, max: 0.9, step: 0.01, default: 0.45, show: (p) => p.cracks > 2 && p.rings > 0, tip: 'Share of ring segments left out' },
      { key: 'width', label: 'Crack width', type: 'range', min: 0.3, max: 4, step: 0.05, default: 1.6, tip: 'px @ 1024' },
      { key: 'glow', label: 'Crack glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Soft light scattered along the cracks' },
      { key: 'shadow', label: 'Dark edge', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Thin dark line beside each crack so it reads on bright backgrounds' },

      { type: 'section', label: 'Scratches' },
      { key: 'scratches', label: 'Scratches', type: 'int', min: 0, max: 400, default: 60, tip: 'Fine scratches around the hit; they fade out towards the texture edges' },
      { key: 'scratchLen', label: 'Length', type: 'range', min: 0.01, max: 0.6, step: 0.005, default: 0.14, show: (p) => p.scratches > 0 },
      { key: 'scratchAlpha', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.22, show: (p) => p.scratches > 0 },
      { key: 'scratchDir', label: 'Direction', type: 'range', min: -90, max: 90, step: 1, default: 10, show: (p) => p.scratches > 0 },
      { key: 'scratchSpread', label: 'Direction spread', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.scratches > 0, tip: '0 = all parallel (wiping marks), 1 = any direction' },
      { key: 'smudge', label: 'Smudges', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },

      { type: 'section', label: 'Color' },
      { key: 'color', label: 'Crack color', type: 'color', default: '#f4f6f6' },
      { key: 'shadowColor', label: 'Dark edge color', type: 'color', default: '#000000' },

      { type: 'section', label: 'Blending' },
      { key: 'blend', label: 'Blend', type: 'select', default: 'normal', options: [['normal', 'Normal'], ['add', 'Additive'], ['screen', 'Screen']], tip: 'How overlapping cracks, shards and haze combine. Additive / Screen let them build up light like real scattered light instead of stacking as solid white' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.05, max: 1, step: 0.01, default: 1 },
      { key: 'variation', label: 'Opacity variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Noisy breakup of the transparency: cracks fade in and out along their length' },
      { key: 'variationScale', label: 'Variation detail', type: 'range', min: 1, max: 30, step: 0.5, default: 8, show: (p) => p.variation > 0 },
      { key: 'output', label: 'Output', type: 'select', default: 'straight', options: [['straight', 'Straight alpha'], ['luma', 'Alpha from brightness'], ['additive', 'Additive on black']], tip: 'Straight alpha: color + transparency (alpha-blended materials). Alpha from brightness: only the bright parts stay opaque, dark edges become see-through. Additive on black: opaque, for additive shaders' },
    ],
    presets: [
      { name: 'Tarkov-style visor hit', group: 'Game-inspired', values: {} },
      { name: 'Tarkov-style face shield hit', group: 'Game-inspired', values: { shatter: 0.15, cracks: 18, rings: 2, branches: 0.55, scratches: 90, seed: 44 } },
      { name: 'Heavily shattered', group: 'Damage', values: { size: 1, shatter: 0.28, shards: 220, cracks: 32, branches: 0.65, rings: 5, ringGaps: 0.3, haze: 0.55, seed: 5 } },
      { name: 'Single clean crack', group: 'Damage', values: { shatter: 0.03, shards: 12, cracks: 6, crackVar: 0.85, rings: 0, branches: 0.25, haze: 0.08, scratches: 20, seed: 8 } },
      { name: 'Spiderweb', group: 'Damage', values: { cracks: 30, rings: 6, ringGaps: 0.2, branches: 0.3, shatter: 0.12, seed: 12 } },
      { name: 'Small chip', group: 'Damage', values: { size: 0.45, shatter: 0.07, shards: 40, cracks: 10, rings: 1, haze: 0.2, scratches: 30 } },
      { name: 'Scratches only', group: 'Wear', values: { shatter: 0, haze: 0, cracks: 0, scratches: 260, scratchLen: 0.2, scratchAlpha: 0.3, smudge: 0.3 } },
      { name: 'Sci-fi HUD glass', group: 'Sci-fi', values: { color: '#bff4ff', glow: 0.7, haze: 0.5, shadow: 0.3 } },
      { name: 'Cracks only (no scratches)', group: 'Simple', values: { scratches: 0, smudge: 0 } },
      { name: 'Realistic glass (screen, varied)', group: 'Realistic', values: { blend: 'screen', variation: 0.55, variationScale: 7, glow: 0.5, shadow: 0.25, core: 0.65, haze: 0.45, width: 1.3 } },
      { name: 'Soft scattered light (additive)', group: 'Realistic', values: { blend: 'add', variation: 0.45, opacity: 0.75, glow: 0.55, shadow: 0, core: 0.32, haze: 0.35, shards: 120 } },
      { name: 'Alpha from brightness', group: 'Realistic', values: { blend: 'screen', output: 'luma', variation: 0.4, shadow: 0.4 } },
      { name: 'Additive shader texture', group: 'Realistic', values: { blend: 'add', output: 'additive', variation: 0.45, shadow: 0, glow: 0.5, core: 0.32, haze: 0.3, opacity: 0.8 } },
    ],
    render(out, W, H, p) {
      // everything is drawn into a layer with the chosen blend mode, then converted to the output mode
      const layer = U.canvas(W, H), ctx = layer.getContext('2d');
      ctx.globalCompositeOperation = p.blend === 'add' ? 'lighter' : p.blend === 'screen' ? 'screen' : 'source-over';
      const rnd = U.rng(p.seed), S = Math.min(W, H), k = S / 1024, cx = W / 2, cy = H / 2;
      const col = U.hex(p.color), rgba = (a) => `rgba(${col[0]},${col[1]},${col[2]},${a})`;
      const sh = U.hex(p.shadowColor), shadow = (a) => `rgba(${sh[0]},${sh[1]},${sh[2]},${a})`;
      // everything fades out before the texture edge, so the square never shows when placed in engine
      const edgeFade = (x, y) => U.smoothstep(0.5, 0.36, Math.hypot(x - cx, y - cy) / S);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      // smudges: low-frequency greasy patches (quarter resolution, scaled up)
      if (p.smudge > 0) {
        const q = 4, w4 = Math.ceil(W / q), h4 = Math.ceil(H / q);
        const sm = U.canvas(w4, h4), sc = sm.getContext('2d'), img = sc.createImageData(w4, h4), d = img.data;
        for (let y = 0; y < h4; y++) {
          for (let x = 0; x < w4; x++) {
            const n = U.fractal('perlin', ((x * q) / S) * 2.2, ((y * q) / S) * 2.2, 0, 0, 4, 0.5, 'fbm', p.seed + 11);
            const v = U.smoothstep(0.55, 0.85, n) * p.smudge * 0.35 * edgeFade(x * q, y * q);
            if (v <= 0) continue;
            const o = (y * w4 + x) * 4;
            d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = v * 255;
          }
        }
        sc.putImageData(img, 0, 0);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sm, 0, 0, w4 * q, h4 * q);
      }

      // scratches: thin faint lines spread around the hit, mostly in one direction, fading towards the edges
      for (let i = 0; i < p.scratches; i++) {
        const a0 = rnd() * TAU, d0 = Math.sqrt(rnd()) * S * 0.42;
        const x = cx + Math.cos(a0) * d0, y = cy + Math.sin(a0) * d0, base = (p.scratchDir * Math.PI) / 180;
        const a = base + (rnd() - 0.5) * Math.PI * p.scratchSpread, L = S * p.scratchLen * (0.2 + rnd() * 0.8);
        const x0 = x - Math.cos(a) * L / 2, y0 = y - Math.sin(a) * L / 2, x1 = x + Math.cos(a) * L / 2, y1 = y + Math.sin(a) * L / 2;
        const bend = (rnd() - 0.5) * L * 0.15, alpha = p.scratchAlpha * (0.3 + rnd() * 0.7);
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        g.addColorStop(0, rgba(alpha * edgeFade(x0, y0))); g.addColorStop(0.5, rgba(alpha * edgeFade(x, y))); g.addColorStop(1, rgba(alpha * edgeFade(x1, y1)));
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(0.4, (0.4 + rnd() * 0.9) * k);
        ctx.beginPath(); ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(x - Math.sin(a) * bend, y + Math.cos(a) * bend, x1, y1);
        ctx.stroke();
      }

      const reach = (p.size * S) / 2; // cracks end before the edge
      const w = p.width * k;
      const strokePath = (pts, w0, w1, a) => {
        for (let j = 1; j < pts.length; j++) {
          const t = j / (pts.length - 1);
          ctx.lineWidth = Math.max(0.35, lerp(w0, w1, t));
          ctx.strokeStyle = a(t, pts[j][0], pts[j][1]);
          ctx.beginPath(); ctx.moveTo(pts[j - 1][0], pts[j - 1][1]); ctx.lineTo(pts[j][0], pts[j][1]); ctx.stroke();
        }
      };
      // one crack = soft glow, dark edge, then the bright line; fades towards its end and the texture edge
      const crack = (pts, cw, fade) => {
        const f = (t, x, y) => (1 - t * fade) * edgeFade(x, y);
        if (p.glow > 0) strokePath(pts, cw * 5, cw * 1.5, (t, x, y) => rgba(p.glow * 0.12 * f(t, x, y)));
        if (p.shadow > 0) {
          const o = Math.max(0.6, cw * 0.8);
          strokePath(pts.map(([x, y]) => [x + o, y + o]), cw, cw * 0.35, (t, x, y) => shadow(p.shadow * 0.7 * f(t, x, y)));
        }
        strokePath(pts, cw * 1.7, cw * 0.35, (t, x, y) => rgba(0.97 * (1 - t * fade * 0.8) * edgeFade(x, y)));
      };

      // milky haze
      if (p.haze > 0) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, reach * 0.45);
        g.addColorStop(0, rgba(p.haze * 0.45)); g.addColorStop(0.35, rgba(p.haze * 0.14)); g.addColorStop(1, rgba(0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, reach * 0.45, 0, TAU); ctx.fill();
      }
      // radial cracks + branches
      const radial = [];
      for (let i = 0; i < p.cracks; i++) {
        const a = (i / p.cracks) * TAU + (rnd() - 0.5) * (TAU / p.cracks) * 0.9;
        const L = reach * (1 - p.crackVar * rnd());
        const pts = crackPts(rnd, cx, cy, a, L, p.jag, reach * 0.025);
        radial.push(pts);
        crack(pts, w * (0.7 + rnd() * 0.6), 1);
        if (rnd() < p.branches) {
          const j = 3 + ((rnd() * (pts.length - 4)) | 0), [bx, by] = pts[Math.min(j, pts.length - 1)];
          const ba = a + (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.55);
          crack(crackPts(rnd, bx, by, ba, L * (0.15 + rnd() * 0.35), p.jag * 1.2, reach * 0.02), w * 0.6, 1);
        }
      }
      // concentric cracks between neighbouring radial cracks (bowed towards the impact)
      for (let r = 0; r < p.rings && radial.length > 2; r++) {
        const R = reach * (0.1 + (r + 0.6) * (0.5 / Math.max(1, p.rings))) * (0.85 + rnd() * 0.3);
        for (let i = 0; i < radial.length; i++) {
          if (rnd() < p.ringGaps) continue;
          const a = pointAt(radial[i], cx, cy, R), b = pointAt(radial[(i + 1) % radial.length], cx, cy, R * (0.9 + rnd() * 0.2));
          if (!a || !b) continue;
          const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy, bow = 0.86 + rnd() * 0.08;
          const pts = [];
          for (let s = 0; s <= 6; s++) {
            const t = s / 6, qx = cx + mx * bow, qy = cy + my * bow;
            pts.push([(1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * qx + t * t * b[0], (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * qy + t * t * b[1]]);
          }
          crack(pts, w * 0.55, 0.3);
        }
      }
      // shattered center: chaotic, milky-white crushed glass
      if (p.shatter > 0) {
        const R = p.shatter * S;
        for (let i = 0; i < 9; i++) {
          const a = rnd() * TAU, d = R * Math.pow(rnd(), 1.3) * 0.7, r = R * (0.12 + rnd() * 0.3);
          const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, rgba(0.3 * p.core)); g.addColorStop(1, rgba(0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        }
        for (let i = 0; i < p.shards * 0.45; i++) {
          const a = rnd() * TAU, r0 = R * rnd() * 0.25, L = R * (0.35 + Math.pow(rnd(), 0.8) * 1.05);
          const wa = R * (0.012 + rnd() * 0.05), nx = -Math.sin(a), ny = Math.cos(a);
          const x0 = cx + Math.cos(a) * r0, y0 = cy + Math.sin(a) * r0, x1 = cx + Math.cos(a) * L, y1 = cy + Math.sin(a) * L;
          const kx = (x0 + x1) / 2 + nx * wa * (rnd() - 0.5) * 3, ky = (y0 + y1) / 2 + ny * wa * (rnd() - 0.5) * 3;
          const g = ctx.createLinearGradient(x0, y0, x1, y1);
          g.addColorStop(0, rgba(0.95)); g.addColorStop(0.6, rgba(0.55)); g.addColorStop(1, rgba(0));
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(x0 + nx * wa, y0 + ny * wa); ctx.lineTo(kx + nx * wa * 0.5, ky + ny * wa * 0.5); ctx.lineTo(x1, y1);
          ctx.lineTo(kx - nx * wa * 0.5, ky - ny * wa * 0.5); ctx.lineTo(x0 - nx * wa, y0 - ny * wa);
          ctx.closePath(); ctx.fill();
        }
        for (let i = 0; i < p.shards; i++) {
          const a = rnd() * TAU, d = R * Math.pow(rnd(), 1.7) * 0.75, s = R * (0.03 + rnd() * 0.11) * (1 - (d / R) * 0.6);
          const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, nv = 3 + ((rnd() * 3) | 0), rot = rnd() * TAU;
          ctx.beginPath();
          for (let v = 0; v < nv; v++) {
            const va = rot + (v / nv) * TAU + (rnd() - 0.5) * 0.9, vr = s * (0.5 + rnd());
            ctx[v ? 'lineTo' : 'moveTo'](x + Math.cos(va) * vr, y + Math.sin(va) * vr);
          }
          ctx.closePath();
          ctx.fillStyle = rgba((0.35 + rnd() * 0.6) * p.core); ctx.fill();
        }
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 0.35);
        g.addColorStop(0, rgba(p.core)); g.addColorStop(0.55, rgba(p.core * 0.55)); g.addColorStop(1, rgba(0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * 0.35, 0, TAU); ctx.fill();
        ctx.fillStyle = shadow(0.55); ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, R * 0.035), 0, TAU); ctx.fill();
      }

      // opacity variation: multiply the alpha by a soft noise mask (quarter resolution, scaled up)
      ctx.globalCompositeOperation = 'source-over';
      if (p.variation > 0) {
        const q = 4, w4 = Math.ceil(W / q), h4 = Math.ceil(H / q), m = U.canvas(w4, h4), mc = m.getContext('2d'), img = mc.createImageData(w4, h4), d = img.data;
        for (let y = 0; y < h4; y++) for (let x = 0; x < w4; x++) {
          const n = U.fractal('perlin', ((x * q) / S) * p.variationScale, ((y * q) / S) * p.variationScale, 0, 0, 3, 0.55, 'fbm', p.seed + 23);
          d[(y * w4 + x) * 4 + 3] = 255 * (1 - p.variation * U.smoothstep(0.62, 0.3, n));
        }
        mc.putImageData(img, 0, 0);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(m, 0, 0, w4 * q, h4 * q);
        ctx.globalCompositeOperation = 'source-over';
      }

      // output mode
      const img = ctx.getImageData(0, 0, W, H), d = img.data, op = p.opacity;
      for (let i = 0; i < d.length; i += 4) {
        let a = (d[i + 3] / 255) * op;
        if (p.output === 'luma') { // only bright parts stay opaque; color becomes the crack color
          a *= (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
          d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
        }
        if (p.output === 'additive') { d[i] *= a; d[i + 1] *= a; d[i + 2] *= a; a = 1; } // premultiplied onto black
        d[i + 3] = Math.round(a * 255);
      }
      ctx.putImageData(img, 0, 0);
      out.drawImage(layer, 0, 0);
    },
  });
})();
