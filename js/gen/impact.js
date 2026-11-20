/* Bullet impact decal in three styles, always round-symmetric (built from radial pieces, nothing stretched):
     Realistic  – per-pixel hole with a lit inner wall and depth shading, a spalled crater of exposed material
                  (concrete, brick, plaster), a chipped paint ring with torn petals curling out (metal),
                  torn fibers with splinters (wood) or a crushed zone with radial + ring cracks (glass);
                  chips lying around, hairline cracks, a mottled soot / powder-burn ring and dust specks.
     Stylized   – flat cartoon look: burst star, hole with a crescent highlight, a few outlined chips,
                  flat soot ring, bold outlines.
     Polygonal  – low-poly: hole wall, crater and shards built from triangles, each facet flat-shaded
                  from the light direction.
   Everything is placed in hole-radius units and auto-fitted inside the texture with a margin, so a large
   impact is never clipped. Lit from one light angle. Output: transparent decal, on the base surface color,
   or a height map (surface = mid gray, hole low, chips / petals raised); normal map mode uses that height. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const LN = 720; // angular resolution of the outline lookup tables

  // material looks: surface (base color around), inner (exposed / fresh material), chip, hole, soot, dust
  const MAT = {
    concrete: { kind: 'spall', surface: '#8f8b83', inner: '#b9b4a8', chip: '#a7a297', hole: '#0c0b0a', soot: '#25221e', dust: '#d6d0c2', reach: 2.4, pieces: 14 },
    brick: { kind: 'spall', surface: '#8e4430', inner: '#c98467', chip: '#a95a3f', hole: '#0e0605', soot: '#22140e', dust: '#d8a68b', reach: 2.2, pieces: 12 },
    plaster: { kind: 'spall', surface: '#e1dcd0', inner: '#f7f4ec', chip: '#ece7dc', hole: '#151311', soot: '#3a352f', dust: '#ffffff', reach: 2.8, pieces: 10 },
    metal: { kind: 'petals', surface: '#4f5a44', inner: '#c3c7cb', chip: '#a6abb0', hole: '#050505', soot: '#121212', dust: '#8c8c8c', reach: 1.6, pieces: 8 },
    wood: { kind: 'splinters', surface: '#7d5230', inner: '#dcb37c', chip: '#c08c55', hole: '#0b0604', soot: '#1d130b', dust: '#caa071', reach: 1.9, pieces: 14 },
    glass: { kind: 'glass', surface: '#9fc3cc', inner: '#ffffff', chip: '#e6f4f8', hole: '#0b1013', soot: '#1e1e1e', dust: '#ffffff', reach: 1.5, pieces: 14 },
  };
  const kindOf = (p) => (MAT[p.material] || MAT.concrete).kind;

  const hex = U.hex;
  const mul = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const css = (c, a = 1) => `rgba(${clamp(c[0], 0, 255) | 0},${clamp(c[1], 0, 255) | 0},${clamp(c[2], 0, 255) | 0},${a})`;
  const gray = (h, a = 1) => { const v = clamp(h) * 255 | 0; return `rgba(${v},${v},${v},${a})`; };

  // periodic noise around the circle, 0..1 (u = 0..1 wraps)
  const ring = (u, period, oct, seed) => U.fractal('perlin', u * period, 0.37, period, 0, oct, 0.5, 'fbm', seed);
  const lutIdx = (th) => { let i = Math.floor((th / TAU) * LN) % LN; return i < 0 ? i + LN : i; };

  function poly(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }

  U.register({
    id: 'impact',
    name: 'Bullet Impact',
    desc: 'Bullet hole decals in concrete, brick, plaster, metal, wood or glass, rendered realistic, stylized or low-poly, with height map',
    uses: [
      'Bullet hole decals that a shooter spawns where shots hit walls, doors, vehicles or windows, one texture per surface material.',
      'Damage dressing for static scenes, and cartoon or low-poly hit marks for stylized games.',
    ],
    tags: ['Decals', 'Shooter', 'Military'],
    bg: 'checker',
    normalMap: true,
    heightMap: true,
    normalDesc: 'Normal map from the impact\'s height: hole, crater, chips and petals; soot and dust are left out',
    normalDefaults: { strength: 6, smooth: 0.5 },
    icon: U.icon('<circle cx="12" cy="12" r="2.2"/><path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1M15.2 15.2l2.1 2.1M17.3 6.7l-2.1 2.1M8.8 15.2l-2.1 2.1"/>'),
    params: [
      { type: 'section', label: 'Impact' },
      { key: 'style', label: 'Style', type: 'select', default: 'realistic', options: [['realistic', 'Realistic'], ['stylized', 'Stylized (cartoon)'], ['polygonal', 'Polygonal (low-poly)']] },
      {
        key: 'material', label: 'Material', type: 'select', default: 'concrete',
        options: [['concrete', 'Concrete'], ['brick', 'Brick'], ['plaster', 'Plaster / drywall'], ['metal', 'Metal (sheet steel)'], ['wood', 'Wood'], ['glass', 'Glass']],
        apply: (v, p) => { const M = MAT[v]; if (M) Object.assign(p, { surface: M.surface, inner: M.inner, chip: M.chip, holeColor: M.hole, sootColor: M.soot, dustColor: M.dust, reach: M.reach, pieces: M.pieces }); },
        tip: 'Picks the damage type (crater, petals, splinters or cracks) and fitting colors; tweak them afterwards',
      },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.2, max: 1, step: 0.01, default: 1, tip: 'Size of the whole impact; 1 = fills the texture (minus the edge margin). The hole size relative to the damage comes from the reach settings' },
      { key: 'irregular', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'How ragged the hole and the damage outline are' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },
      { type: 'section', label: 'Damage' },
      { key: 'reach', label: 'Damage reach', type: 'range', min: 1.1, max: 5, step: 0.05, default: 2.4, tip: 'Crater / petals / splinters / crushed zone, × hole radius' },
      { key: 'jag', label: 'Jaggedness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Spikiness of the damage outline' },
      { key: 'pieces', label: 'Pieces', type: 'int', min: 0, max: 40, default: 14, tip: 'Chips (stone), petals (metal), splinters (wood), radial cracks (glass), burst spikes (stylized)' },
      { key: 'pieceSize', label: 'Piece size', type: 'range', min: 0.2, max: 2, step: 0.01, default: 1 },
      { key: 'cracks', label: 'Cracks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Hairline cracks out of the crater; for glass the ring cracks between the radial ones' },
      { key: 'crackReach', label: 'Crack reach', type: 'range', min: 1, max: 6, step: 0.05, default: 3.2, show: (p) => p.cracks > 0 || kindOf(p) === 'glass', tip: '× hole radius' },
      { key: 'depth', label: 'Hole depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, tip: 'Width of the lit inner wall before the hole goes black' },
      { type: 'section', label: 'Soot & dust' },
      { key: 'soot', label: 'Soot / powder burn', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Color only: never part of the height / normal map' },
      { key: 'sootSize', label: 'Soot size', type: 'range', min: 1.5, max: 8, step: 0.05, default: 3.8, show: (p) => p.soot > 0, tip: '× hole radius' },
      { key: 'sootNoise', label: 'Soot breakup', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.soot > 0 },
      { key: 'dust', label: 'Dust specks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { type: 'section', label: 'Color' },
      { key: 'inner', label: 'Exposed material', type: 'color', default: MAT.concrete.inner, tip: 'Crater, bare metal, fresh wood, crushed glass' },
      { key: 'chip', label: 'Chips / pieces', type: 'color', default: MAT.concrete.chip },
      { key: 'holeColor', label: 'Hole', type: 'color', default: MAT.concrete.hole },
      { key: 'surface', label: 'Surface', type: 'color', default: MAT.concrete.surface, tip: 'Paint around metal hits, the base for "On surface color" and the stylized rim' },
      { key: 'sootColor', label: 'Soot', type: 'color', default: MAT.concrete.soot, show: (p) => p.soot > 0 },
      { key: 'dustColor', label: 'Dust', type: 'color', default: MAT.concrete.dust, show: (p) => p.dust > 0 },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 8, step: 0.1, default: 3, show: (p) => p.style !== 'realistic', tip: 'px @ 512' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#1a1614', show: (p) => p.style !== 'realistic' && p.outline > 0 },
      { type: 'section', label: 'Shading' },
      { key: 'light', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -135, tip: '-135 = light from top-left' },
      { key: 'lightAmt', label: 'Shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8 },
      { key: 'shine', label: 'Specular', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Glints on metal petals, glass edges and stylized highlights' },
      { key: 'shadow', label: 'Contact shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'alpha', options: [['alpha', 'Transparent (decal)'], ['surface', 'On surface color'], ['height', 'Height map']] },
      { key: 'surfaceVar', label: 'Surface variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: (p) => p.output === 'surface' },
      { key: 'margin', label: 'Edge margin', type: 'range', min: 0, max: 0.2, step: 0.005, default: 0.03, tip: 'Free border, fraction of the short side' },
    ],
    presets: [
      // Realistic
      { name: 'Concrete wall', group: 'Realistic', values: {} },
      { name: 'Concrete (large caliber)', group: 'Realistic', values: { reach: 2.9, jag: 0.7, pieces: 22, pieceSize: 1.3, cracks: 0.7, crackReach: 3.8, soot: 0.45, sootSize: 4.2, dust: 0.7, seed: 21 } },
      { name: 'Red brick', group: 'Realistic', values: { material: 'brick', seed: 12 } },
      { name: 'Plaster / drywall', group: 'Realistic', values: { material: 'plaster', soot: 0.5, cracks: 0.55, seed: 4 } },
      { name: 'Painted steel', group: 'Realistic', values: { material: 'metal', soot: 0.5, seed: 9 } },
      { name: 'Bare steel plate', group: 'Realistic', values: { material: 'metal', surface: '#7e8287', reach: 1.4, pieces: 10, soot: 0.65, sootSize: 3.2, seed: 15 } },
      { name: 'Rusty sheet metal', group: 'Realistic', values: { material: 'metal', surface: '#6a3e24', inner: '#b8a693', chip: '#8a6a52', reach: 1.8, jag: 0.8, pieces: 7, soot: 0.45, sootColor: '#1e130c', dust: 0.3, dustColor: '#8a5232', seed: 27 } },
      { name: 'Wooden planks', group: 'Realistic', values: { material: 'wood', seed: 3 } },
      { name: 'Dark wood door', group: 'Realistic', values: { material: 'wood', surface: '#3d2414', inner: '#c39561', chip: '#9a6a3c', reach: 2.2, pieces: 18, soot: 0.4, seed: 30 } },
      { name: 'Window glass', group: 'Realistic', values: { material: 'glass', crackReach: 4.8, soot: 0, dust: 0.25, seed: 8 } },
      { name: 'Bulletproof glass', group: 'Realistic', values: { material: 'glass', reach: 2.4, pieces: 24, cracks: 0.9, crackReach: 3.4, soot: 0.2, dust: 0.4, seed: 19 } },
      // Stylized
      { name: 'Cartoon wall hit', group: 'Stylized', values: { style: 'stylized', pieces: 10, soot: 0.5, dust: 0.2, outline: 3 } },
      { name: 'Comic metal hole', group: 'Stylized', values: { style: 'stylized', material: 'metal', pieces: 8, outline: 3.5, seed: 9 } },
      { name: 'Toon wood splinter', group: 'Stylized', values: { style: 'stylized', material: 'wood', pieces: 10, outline: 3, seed: 3 } },
      { name: 'Toon glass crack', group: 'Stylized', values: { style: 'stylized', material: 'glass', crackReach: 4.5, soot: 0, outline: 2.5, seed: 8 } },
      { name: 'Pop-art burst', group: 'Stylized', values: { style: 'stylized', material: 'plaster', inner: '#ffe14a', chip: '#ff8a1e', surface: '#ff4a2a', holeColor: '#1a0a2a', outlineColor: '#1a0a2a', pieces: 14, reach: 2.6, jag: 0.8, outline: 4, soot: 0, dust: 0, seed: 40 } },
      // Polygonal
      { name: 'Low-poly concrete', group: 'Polygonal', values: { style: 'polygonal', outline: 0, seed: 5 } },
      { name: 'Low-poly brick', group: 'Polygonal', values: { style: 'polygonal', material: 'brick', outline: 0, seed: 12 } },
      { name: 'Low-poly metal petals', group: 'Polygonal', values: { style: 'polygonal', material: 'metal', outline: 0, seed: 9 } },
      { name: 'Low-poly wood', group: 'Polygonal', values: { style: 'polygonal', material: 'wood', outline: 0, seed: 3 } },
      { name: 'Shattered glass (faceted)', group: 'Polygonal', values: { style: 'polygonal', material: 'glass', outline: 0, soot: 0, seed: 8 } },
      { name: 'Crystal rock (outlined)', group: 'Polygonal', values: { style: 'polygonal', material: 'concrete', inner: '#9ab0c8', chip: '#7a90aa', surface: '#4a5a6e', outline: 1.5, outlineColor: '#121820', soot: 0.3, seed: 33 } },
    ],
    render(ctx, W, H, p, opts) {
      opts = opts || {};
      const height = !!opts.height || p.output === 'height';
      const S = Math.min(W, H), k = S / 512, cx = W / 2, cy = H / 2, seed = p.seed | 0, kind = kindOf(p), style = p.style;
      const rnd = U.rng(seed), la = p.light * RAD, lx = Math.cos(la), ly = Math.sin(la), LA = p.lightAmt;
      const C = { inner: hex(p.inner), chip: hex(p.chip), hole: hex(p.holeColor), surf: hex(p.surface), soot: hex(p.sootColor), dust: hex(p.dustColor), line: hex(p.outlineColor) };
      const irr = p.irregular, jag = p.jag;

      /* ---------- outlines over the angle (hole-radius units) ---------- */
      const HL = new Float32Array(LN), CL = new Float32Array(LN), SL = new Float32Array(LN), SK = new Float32Array(LN);
      const reach = kind === 'glass' ? Math.min(p.reach, 1.8) : p.reach;
      let cMax = 0;
      for (let i = 0; i < LN; i++) {
        const u = i / LN;
        HL[i] = (1 + irr * 0.32 * (ring(u, 7, 3, seed + 1) - 0.5) * 2) * (kind === 'glass' ? 0.6 : 1);
        // damage outline: broad lobes plus sharp spikes (spall / torn edge)
        const lobes = ring(u, 5, 3, seed + 2) - 0.5, spikes = Math.abs(ring(u, 23, 2, seed + 3) - 0.5) * 2;
        CL[i] = Math.max(HL[i] * 1.12, reach * (1 + irr * lobes * 0.7 + jag * (spikes - 0.35) * 0.55));
        SL[i] = p.sootSize * (0.82 + 0.36 * ring(u, 6, 3, seed + 4));
        SK[i] = ring(u, 40, 2, seed + 5);
        cMax = Math.max(cMax, CL[i]);
      }
      const hAt = (th) => HL[lutIdx(th)], cAt = (th) => CL[lutIdx(th)];

      /* ---------- pieces, in hole-radius units (so the fit can measure them) ---------- */
      const ps = p.pieceSize, nP = p.pieces;
      const chips = [], petals = [], splinters = [], cracks = [];
      if (kind === 'spall' || style === 'polygonal' && kind !== 'glass' && kind !== 'petals') {
        for (let i = 0; i < nP; i++) {
          const a = rnd() * TAU, d = cAt(a) * (0.95 + Math.pow(rnd(), 1.6) * 0.9), r = 0.16 * ps * (0.5 + rnd() * rnd() * 1.6);
          const m = 5 + ((rnd() * 3) | 0), a0 = rnd() * TAU, pts = [];
          for (let j = 0; j < m; j++) { const t = a0 + (j / m) * TAU + (rnd() - 0.5) * 0.6, rr = r * (0.6 + rnd() * 0.45); pts.push([Math.cos(a) * d + Math.cos(t) * rr, Math.sin(a) * d + Math.sin(t) * rr]); }
          chips.push({ pts, tone: rnd(), x: Math.cos(a) * d, y: Math.sin(a) * d, r });
        }
      }
      if (kind === 'petals') {
        const n = Math.max(3, nP), off = rnd() * TAU;
        for (let i = 0; i < n; i++) {
          const span = (TAU / n) * (0.62 + rnd() * 0.3), mid = off + (i / n) * TAU + (rnd() - 0.5) * (TAU / n) * 0.25;
          const a0 = mid - span / 2, a1 = mid + span / 2, tip = hAt(mid) + (reach - 0.9) * ps * (0.55 + rnd() * 0.6);
          const left = [], right = [];
          for (let j = 0; j <= 3; j++) { const t = j / 3, aL = lerp(a0, mid - span * 0.06, t), rL = lerp(hAt(a0) * 0.9, tip * (0.82 + rnd() * 0.12), t * t) + (rnd() - 0.5) * jag * 0.18 * t; left.push([Math.cos(aL) * rL, Math.sin(aL) * rL]); }
          for (let j = 3; j >= 0; j--) { const t = j / 3, aR = lerp(a1, mid + span * 0.06, t), rR = lerp(hAt(a1) * 0.9, tip * (0.82 + rnd() * 0.12), t * t) + (rnd() - 0.5) * jag * 0.18 * t; right.push([Math.cos(aR) * rR, Math.sin(aR) * rR]); }
          const tipPt = [Math.cos(mid + (rnd() - 0.5) * span * 0.2) * tip, Math.sin(mid + (rnd() - 0.5) * span * 0.2) * tip];
          petals.push({ mid, tip, pts: left.concat([tipPt], right), base: hAt(mid) * 0.9, tone: rnd(), spec: rnd() });
        }
      }
      if (kind === 'splinters') {
        const n = Math.round(nP * 1.4);
        for (let i = 0; i < n; i++) {
          const a = rnd() * TAU, r0 = hAt(a) * (0.9 + rnd() * 0.25), len = (reach - 0.6) * ps * (0.45 + rnd() * 0.9), w = 0.14 * ps * (0.5 + rnd());
          const nx = -Math.sin(a), ny = Math.cos(a), dx = Math.cos(a), dy = Math.sin(a), bend = (rnd() - 0.5) * 0.25 * len;
          const tip = [dx * (r0 + len) + nx * bend, dy * (r0 + len) + ny * bend];
          const midL = [dx * (r0 + len * 0.5) + nx * (w * 0.6 + bend * 0.5), dy * (r0 + len * 0.5) + ny * (w * 0.6 + bend * 0.5)];
          const midR = [dx * (r0 + len * 0.5) - nx * (w * 0.55 - bend * 0.5), dy * (r0 + len * 0.5) - ny * (w * 0.55 - bend * 0.5)];
          splinters.push({ a, base: [dx * r0, dy * r0], bl: [dx * r0 + nx * w, dy * r0 + ny * w], br: [dx * r0 - nx * w, dy * r0 - ny * w], midL, midR, tip, tone: rnd(), len: r0 + len });
        }
      }
      // cracks: jagged radial polylines (glass: the main structure; stone / plaster: hairlines from the crater)
      const nCr = kind === 'glass' ? Math.max(3, nP) : kind === 'spall' ? Math.round(p.cracks * 10) : 0;
      const crR = [];
      if (nCr > 0 && (kind === 'glass' || p.cracks > 0)) {
        const off = rnd() * TAU;
        for (let i = 0; i < nCr; i++) {
          let a = kind === 'glass' ? off + (i / nCr) * TAU + (rnd() - 0.5) * (TAU / nCr) * 0.5 : rnd() * TAU;
          const r0 = kind === 'glass' ? hAt(a) * 0.95 : cAt(a) * 0.92, L = p.crackReach * (kind === 'glass' ? 0.55 + rnd() * 0.45 : 0.35 + rnd() * 0.5);
          const pts = [[Math.cos(a) * r0, Math.sin(a) * r0]], steps = 7;
          let r = r0;
          for (let j = 1; j <= steps; j++) { r = r0 + ((L - r0 * 0.3) * j) / steps; a += (rnd() - 0.5) * 0.22; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
          cracks.push(pts); crR.push(r);
        }
      }
      // glass ring cracks between neighbouring radials
      const rings = [];
      if (kind === 'glass' && cracks.length > 2) {
        const nR = Math.round(1 + p.cracks * 4);
        for (let j = 0; j < nR; j++) {
          const rr = 1.5 + (j + 0.3 * rnd()) * ((p.crackReach * 0.75 - 1.5) / Math.max(1, nR));
          for (let i = 0; i < cracks.length; i++) {
            const A = cracks[i], B = cracks[(i + 1) % cracks.length];
            if (rnd() > 0.72 || crR[i] < rr || crR[(i + 1) % cracks.length] < rr) continue;
            const pa = A[Math.min(A.length - 1, Math.round(((rr - 1) / (crR[i] - 1)) * (A.length - 1)))], pb = B[Math.min(B.length - 1, Math.round(((rr - 1) / (crR[(i + 1) % cracks.length] - 1)) * (B.length - 1)))];
            const mx = (pa[0] + pb[0]) / 2, my = (pa[1] + pb[1]) / 2, ml = Math.hypot(mx, my) || 1, bow = 1 + 0.06 + (rnd() - 0.5) * 0.08;
            rings.push([pa, [mx / ml * ml * bow, my / ml * ml * bow], pb]);
          }
        }
      }

      /* ---------- fit: extent in hole radii -> hole radius in px ---------- */
      let ext = cMax;
      const grow = (pts) => { for (const q of pts) ext = Math.max(ext, Math.hypot(q[0], q[1])); };
      chips.forEach((c) => grow(c.pts)); petals.forEach((q) => grow(q.pts)); splinters.forEach((s) => grow([s.tip, s.bl, s.br])); cracks.forEach(grow);
      if (p.soot > 0 && !height) ext = Math.max(ext, p.sootSize * 1.2);
      if (style === 'stylized') ext = Math.max(ext, reach * 1.65);
      ext *= 1.04;
      const R = Math.max(2, ((S / 2 - p.margin * S - 2) / ext) * p.scale), px = 1 / R;
      const X = (q) => [cx + q[0] * R, cy + q[1] * R], Xs = (pts) => pts.map(X);
      const K = Math.max(0.9 * k, R / 36); // stroke scale: hole size, but never thinner than ~1 px @ 512

      /* ---------- background ---------- */
      if (height) { ctx.fillStyle = gray(0.5); ctx.fillRect(0, 0, W, H); }
      else if (p.output === 'surface') {
        ctx.fillStyle = p.surface; ctx.fillRect(0, 0, W, H);
        if (p.surfaceVar > 0) {
          const n = 96, c = U.canvas(n, n), g = c.getContext('2d'), im = g.createImageData(n, n);
          for (let i = 0; i < n * n; i++) { const v = U.fractal('perlin', (i % n) / n * 6, ((i / n) | 0) / n * 6, 0, 0, 4, 0.55, 'fbm', seed + 90); im.data[i * 4 + 3] = clamp(Math.abs(v - 0.5) * 2.4) * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v > 0.5 ? 255 : 0; }
          g.putImageData(im, 0, 0); ctx.globalAlpha = p.surfaceVar * 0.35; ctx.drawImage(c, 0, 0, W, H); ctx.globalAlpha = 1;
        }
      }

      // contact shadows of raised pieces, blurred once
      const shadowOf = (draw) => {
        if (height || p.shadow <= 0) return;
        const sc = U.canvas(W, H), s = sc.getContext('2d');
        s.fillStyle = '#000'; s.strokeStyle = '#000';
        s.translate(-lx * K * 1.6, -ly * K * 1.6); draw(s);
        const bc = U.canvas(W, H), b = bc.getContext('2d');
        if (typeof b.filter === 'string') b.filter = `blur(${Math.max(0.5, K * 1.4)}px)`;
        b.drawImage(sc, 0, 0);
        ctx.globalAlpha = p.shadow * 0.8; ctx.drawImage(bc, 0, 0); ctx.globalAlpha = 1;
      };

      if (style === 'stylized') drawStylized();
      else if (style === 'polygonal') drawPolygonal();
      else drawRealistic();

      /* =================================== realistic =================================== */
      function drawRealistic() {
        // per-pixel: soot, crater / ring / crushed zone, hole
        const x0 = Math.max(0, Math.floor(cx - ext * R)), x1 = Math.min(W, Math.ceil(cx + ext * R)), y0 = Math.max(0, Math.floor(cy - ext * R)), y1 = Math.min(H, Math.ceil(cy + ext * R));
        const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0), d = img.data, iw = x1 - x0;
        const over = (o, c, a) => {
          if (a <= 0) return;
          const ba = d[o + 3] / 255, oa = a + ba * (1 - a);
          for (let j = 0; j < 3; j++) d[o + j] = (c[j] * a + d[o + j] * ba * (1 - a)) / oa;
          d[o + 3] = oa * 255;
        };
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const dx = (x + 0.5 - cx) / R, dy = (y + 0.5 - cy) / R, r = Math.hypot(dx, dy);
            if (r > ext) continue;
            const o = ((y - y0) * iw + (x - x0)) * 4, th = Math.atan2(dy, dx), li = lutIdx(th), hh = HL[li], cc = CL[li];
            const ux = dx / (r || 1), uy = dy / (r || 1), facing = -(ux * lx + uy * ly); // a wall facing the center is lit when it faces the light
            const nz = U.fractal('perlin', x / S * 40, y / S * 40, 0, 0, 3, 0.5, 'fbm', seed + 11);
            let hv = 0.5;
            // soot / powder burn
            let sa = 0;
            if (!height && p.soot > 0 && r > hh) {
              const sr = SL[li], t = (r - hh) / Math.max(0.1, sr - hh);
              const mott = U.fractal('perlin', x / S * 14, y / S * 14, 0, 0, 4, 0.55, 'fbm', seed + 12);
              sa = p.soot * Math.pow(1 - smoothstep(0, 1, t), 1.4) * clamp(1 + p.sootNoise * ((mott - 0.5) * 2.4 + (SK[li] - 0.5) * 1.6 * smoothstep(0.2, 0.9, t)));
            }
            // damage zone
            const inZone = smoothstep(cc + px, cc - px, r);
            if (r > hh - px) {
              if (!height) over(o, C.soot, sa * (1 - inZone * 0.6));
              if (inZone > 0) {
                const t = clamp((r - hh) / Math.max(0.05, cc - hh));
                let col, a = inZone;
                if (kind === 'petals') {
                  // chipped paint ring: bare brushed metal
                  col = mul(C.inner, 0.78 + 0.25 * nz + LA * 0.12 * facing * (1 - t));
                  hv = 0.5;
                } else if (kind === 'glass') {
                  // crushed, frosted zone
                  col = C.inner; a *= (0.25 + 0.5 * nz) * (1 - t * 0.6);
                  hv = 0.48;
                } else {
                  // crater sloping down to the hole; the far wall catches the light, the lip at the edge too
                  const slope = 1 - t;
                  const lip = smoothstep(0.82, 1, t) * -facing;
                  let b = 1 + LA * (0.42 * facing * (0.35 + 0.65 * slope) + 0.25 * lip) - 0.28 * slope * p.depth;
                  b *= 0.82 + 0.4 * (nz - 0.5) + 0.12;
                  const base = kind === 'splinters' ? mix(C.inner, C.chip, smoothstep(0.3, 0.7, U.fractal('perlin', x / S * 70, y / S * 70, 0, 0, 2, 0.5, 'fbm', seed + 13))) : C.inner;
                  col = mul(base, b);
                  hv = 0.5 - 0.3 * Math.pow(slope, 1.3) + 0.03 * (nz - 0.5);
                }
                if (!height) { over(o, col, a); if (sa > 0) over(o, C.soot, sa * 0.35 * a); }
                else { const g = (0.5 + (hv - 0.5) * a) * 255; d[o] = d[o + 1] = d[o + 2] = g; d[o + 3] = 255; }
              }
            }
            // hole: lit inner wall shading into the dark
            if (r < hh + px) {
              const a = smoothstep(hh + px, hh - px, r), wall = Math.max(0.05, 0.15 + 0.45 * p.depth);
              const t = clamp((hh - r) / (hh * wall));
              if (!height) {
                const wc = mul(kind === 'glass' ? C.chip : C.inner, 0.25 + 0.55 * LA * Math.max(0, facing) + 0.15 * nz);
                over(o, mix(wc, C.hole, Math.pow(t, 0.75)), a);
              } else { const g = lerp(0.18, 0, Math.pow(t, 0.6)) * 255 * a + d[o] * (1 - a); d[o] = d[o + 1] = d[o + 2] = g; d[o + 3] = 255; }
            }
          }
        }
        ctx.putImageData(img, x0, y0);
        drawPieces(false);
        if (!height) dustSpecks();
      }

      /* raised pieces shared by realistic (soft shading) and the crack overlay */
      function drawPieces() {
        // chips
        if (chips.length) {
          shadowOf((s) => { for (const c of chips) { poly(s, Xs(c.pts)); s.fill(); } });
          for (const c of chips) {
            const P = Xs(c.pts);
            ctx.save(); poly(ctx, P);
            if (height) { ctx.fillStyle = gray(0.62 + c.tone * 0.12); ctx.fill(); ctx.restore(); continue; }
            ctx.fillStyle = css(mul(C.chip, 0.85 + c.tone * 0.3)); ctx.fill(); ctx.clip();
            const [ccx, ccy] = X([c.x, c.y]), rr = c.r * R;
            const g = ctx.createLinearGradient(ccx + lx * rr, ccy + ly * rr, ccx - lx * rr, ccy - ly * rr);
            g.addColorStop(0, `rgba(255,255,255,${0.35 * LA})`); g.addColorStop(1, `rgba(0,0,0,${0.45 * LA})`);
            ctx.fillStyle = g; ctx.fillRect(ccx - rr * 2, ccy - rr * 2, rr * 4, rr * 4);
            ctx.restore();
            ctx.lineWidth = Math.max(0.5, K * 0.5); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; poly(ctx, P); ctx.stroke();
          }
        }
        // metal petals: curl out toward the viewer; the ones facing the light are bright
        if (petals.length) {
          shadowOf((s) => { for (const q of petals) { poly(s, Xs(q.pts)); s.fill(); } });
          for (const q of petals) {
            const P = Xs(q.pts), ux = Math.cos(q.mid), uy = Math.sin(q.mid), lit = ux * lx + uy * ly;
            const [bx, by] = X([ux * q.base, uy * q.base]), [tx, ty] = X([ux * q.tip, uy * q.tip]);
            const g = ctx.createLinearGradient(bx, by, tx, ty);
            if (height) { g.addColorStop(0, gray(0.45)); g.addColorStop(1, gray(0.85)); }
            else {
              const b = 0.62 + 0.38 * lit * LA, col = mul(C.inner, (0.85 + q.tone * 0.25) * b);
              g.addColorStop(0, css(mul(col, 0.35))); g.addColorStop(0.45, css(col)); g.addColorStop(1, css(mul(col, 1.08)));
            }
            ctx.fillStyle = g; poly(ctx, P); ctx.fill();
            if (height) continue;
            // torn edge: thin bright rim, plus a glint streak on lit petals
            ctx.lineJoin = 'round';
            ctx.strokeStyle = css(mix(C.inner, [255, 255, 255], 0.5), 0.55); ctx.lineWidth = Math.max(0.5, K * 0.6); poly(ctx, P); ctx.stroke();
            if (p.shine > 0 && lit > 0) {
              ctx.strokeStyle = `rgba(255,255,255,${p.shine * Math.pow(lit, 1.5) * 0.85})`; ctx.lineWidth = Math.max(0.6, K * 1.1); ctx.lineCap = 'round';
              const a2 = q.mid + (q.spec - 0.5) * 0.2, r1 = lerp(q.base, q.tip, 0.35), r2 = lerp(q.base, q.tip, 0.8);
              ctx.beginPath(); ctx.moveTo(...X([Math.cos(a2) * r1, Math.sin(a2) * r1])); ctx.lineTo(...X([Math.cos(a2) * r2, Math.sin(a2) * r2])); ctx.stroke();
            }
          }
        }
        // wood splinters: two-tone ridge (one flank lit, one in shade)
        if (splinters.length) {
          shadowOf((s) => { for (const q of splinters) { poly(s, Xs([q.bl, q.midL, q.tip, q.midR, q.br])); s.fill(); } });
          for (const q of splinters) {
            const nx = -Math.sin(q.a), ny = Math.cos(q.a), side = nx * lx + ny * ly;
            const col = mul(mix(C.inner, C.chip, q.tone), 1);
            const A = Xs([q.bl, q.midL, q.tip, q.base]), B = Xs([q.br, q.midR, q.tip, q.base]);
            if (height) { ctx.fillStyle = gray(0.7 + q.tone * 0.1); poly(ctx, Xs([q.bl, q.midL, q.tip, q.midR, q.br])); ctx.fill(); continue; }
            ctx.fillStyle = css(mul(col, 1 + 0.3 * LA * side)); poly(ctx, A); ctx.fill();
            ctx.fillStyle = css(mul(col, 1 - 0.3 * LA * side)); poly(ctx, B); ctx.fill();
            ctx.strokeStyle = css(mul(C.chip, 0.45), 0.6); ctx.lineWidth = Math.max(0.4, K * 0.4); ctx.lineJoin = 'round';
            poly(ctx, Xs([q.bl, q.midL, q.tip, q.midR, q.br])); ctx.stroke();
          }
        }
        // cracks
        if (cracks.length) {
          const glass = kind === 'glass', all = cracks.concat(rings);
          ctx.lineJoin = 'round'; ctx.lineCap = 'round';
          for (const pass of height ? [0] : [0, 1]) {
            for (let i = 0; i < all.length; i++) {
              const pts = Xs(all[i]), main = i < cracks.length;
              ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
              for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
              const w = K * (glass ? (main ? 1 : 0.7) : 0.55);
              if (height) { ctx.strokeStyle = gray(0.4); ctx.lineWidth = w; }
              else if (pass === 0) { ctx.strokeStyle = glass ? 'rgba(10,20,26,0.55)' : 'rgba(0,0,0,0.55)'; ctx.lineWidth = w * 1.6; ctx.save(); ctx.translate(-lx * w * 0.5, -ly * w * 0.5); ctx.stroke(); ctx.restore(); continue; }
              else { ctx.strokeStyle = glass ? `rgba(255,255,255,${0.55 + p.shine * 0.4})` : css(mix(C.inner, [255, 255, 255], 0.3), 0.45); ctx.lineWidth = w * 0.8; }
              ctx.stroke();
            }
          }
        }
      }

      function dustSpecks() {
        if (p.dust <= 0) return;
        const r2 = U.rng(seed + 77), n = Math.round(p.dust * 220 * (kind === 'glass' ? 1.4 : 1));
        for (let i = 0; i < n; i++) {
          const a = r2() * TAU, d = cAt(a) * 0.9 + Math.pow(r2(), 1.8) * (ext * 0.95 - cAt(a)), s = Math.max(0.5, K * (0.25 + r2() * r2() * 1.2));
          const [x, y] = X([Math.cos(a) * d, Math.sin(a) * d]);
          ctx.fillStyle = css(mul(C.dust, 0.75 + r2() * 0.4), 0.35 + r2() * 0.6);
          ctx.beginPath(); ctx.arc(x, y, s, 0, TAU); ctx.fill();
        }
      }

      /* =================================== stylized =================================== */
      function drawStylized() {
        const ow = p.outline * k, line = css(C.line), r2 = U.rng(seed + 3);
        const stroke = () => { if (ow > 0) { ctx.lineWidth = ow; ctx.lineJoin = 'round'; ctx.strokeStyle = line; ctx.stroke(); } };
        const smooth = (fn, n = 72) => { const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU; pts.push([Math.cos(a) * fn(a), Math.sin(a) * fn(a)]); } return pts; };
        const sR = (a) => SL[lutIdx(a)] * 0.95, holeR = (a) => 1 + (hAt(a) - 1) * 0.6;
        // flat soot ring
        if (!height && p.soot > 0) { ctx.fillStyle = css(C.soot, p.soot * 0.4); poly(ctx, Xs(smooth(sR))); ctx.fill(); }
        // burst star (or petals / splinters / cracks by material)
        const n = Math.max(5, nP), off = r2() * TAU;
        if (kind === 'glass') {
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (const pass of [0, 1]) for (const c of cracks.concat(rings)) {
            const pts = Xs(c);
            ctx.beginPath(); ctx.moveTo(...pts[0]); for (let j = 1; j < pts.length; j += 2) ctx.lineTo(...pts[j]); ctx.lineTo(...pts[pts.length - 1]);
            ctx.lineWidth = Math.max(1, (pass ? 1.6 : 1.6 + ow * 1.2) * k); ctx.strokeStyle = height ? gray(0.4) : pass ? css(C.inner) : line; ctx.stroke();
          }
        } else {
          const star = [];
          for (let i = 0; i < n * 2; i++) {
            const a = off + (i / (n * 2)) * TAU, outer = i % 2 === 0;
            const rr = outer ? reach * (1.05 + r2() * 0.55 * (0.4 + jag)) : reach * (0.62 + r2() * 0.12);
            star.push([Math.cos(a) * rr, Math.sin(a) * rr]);
          }
          if (kind !== 'spall' && kind !== 'splinters') { /* metal: star of petals */ }
          ctx.fillStyle = height ? gray(0.6) : css(kind === 'petals' ? C.inner : C.chip); poly(ctx, Xs(star)); ctx.fill(); if (!height) stroke();
          // second, inner tone: lit half of the burst
          if (!height) {
            const inner = star.map(([x, y]) => [x * 0.72 + lx * 0.12, y * 0.72 + ly * 0.12]);
            ctx.fillStyle = css(mix(C.inner, [255, 255, 255], 0.15)); poly(ctx, Xs(inner)); ctx.fill();
          }
          // chips flying off
          const nc = Math.round(n / 3);
          for (let i = 0; i < nc; i++) {
            const a = r2() * TAU, d = reach * (1.35 + r2() * 0.3), s = 0.22 * ps * (0.6 + r2() * 0.6), a0 = r2() * TAU;
            const tri = [0, 1, 2].map((j) => [Math.cos(a) * d + Math.cos(a0 + j * 2.1) * s, Math.sin(a) * d + Math.sin(a0 + j * 2.1) * s]);
            ctx.fillStyle = height ? gray(0.62) : css(C.chip); poly(ctx, Xs(tri)); ctx.fill(); if (!height) stroke();
          }
        }
        // hole: wall crescent on the lit far side, then the hole shifted toward the light
        const hole = smooth(holeR);
        if (height) { ctx.fillStyle = gray(0.05); poly(ctx, Xs(hole)); ctx.fill(); return; }
        ctx.fillStyle = css(mix(C.inner, C.hole, 0.35)); poly(ctx, Xs(hole)); ctx.fill();
        ctx.save(); poly(ctx, Xs(hole)); ctx.clip();
        ctx.fillStyle = css(C.hole); poly(ctx, Xs(hole.map(([x, y]) => [x * 0.92 + lx * 0.22, y * 0.92 + ly * 0.22]))); ctx.fill();
        ctx.restore();
        poly(ctx, Xs(hole)); stroke();
        // specular highlight: two short white dashes on the lit side of the burst
        if (p.shine > 0 && kind !== 'glass') {
          ctx.strokeStyle = `rgba(255,255,255,${0.5 + p.shine * 0.5})`; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1, 2.2 * k);
          for (const [a, r1, r2b] of [[la - 0.35, 1.35, 1.7], [la + 0.05, 1.3, 1.45]]) {
            ctx.beginPath(); ctx.arc(cx, cy, R * (r1 + r2b) / 2 * Math.min(1, reach / 2), a - 0.18, a + 0.18); ctx.stroke();
          }
        }
        if (p.dust > 0) dustSpecks();
      }

      /* =================================== polygonal =================================== */
      function drawPolygonal() {
        const r2 = U.rng(seed + 9), ow = p.outline * k;
        const facet = (pts, base, nx, ny, hv, alpha = 1) => {
          // flat shading: facet tilt (nx, ny) vs. the light
          const b = 1 + LA * 0.55 * (nx * lx + ny * ly);
          poly(ctx, Xs(pts));
          ctx.fillStyle = height ? gray(hv) : css(mul(base, b), alpha); ctx.fill();
          if (!height) {
            if (ow > 0 && alpha >= 1) { ctx.lineWidth = ow; ctx.strokeStyle = css(C.line, 0.9); ctx.lineJoin = 'round'; ctx.stroke(); }
            else if (alpha >= 1) { ctx.lineWidth = 0.6; ctx.strokeStyle = css(mul(base, b), alpha); ctx.stroke(); } // closes hairline seams
          }
        };
        const V = 9 + ((irr * 5) | 0), off = r2() * TAU;
        const angs = Array.from({ length: V }, (_, i) => off + ((i + (r2() - 0.5) * 0.5) / V) * TAU);
        const hv = angs.map((a) => hAt(a)), outer = angs.map((a) => cAt(a));
        const P = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
        // soot: low-poly ring of translucent triangles
        if (!height && p.soot > 0) {
          for (let i = 0; i < V; i++) {
            const a = angs[i], b = angs[(i + 1) % V] + (i === V - 1 ? TAU : 0), sa = SL[lutIdx(a)], sb = SL[lutIdx(b)];
            facet([P(a, outer[i] * 0.95), P(b, outer[(i + 1) % V] * 0.95), P(b, sb), P(a, sa)], C.soot, 0, 0, 0.5, p.soot * (0.35 + r2() * 0.3));
          }
        }
        if (kind === 'glass') {
          // shattered panes between the radial cracks: faint facets with bright edges
          for (let i = 0; i < cracks.length; i++) {
            const A = cracks[i], B = cracks[(i + 1) % cracks.length];
            for (let j = 0; j < A.length - 2; j += 2) {
              const quad = [A[j], A[j + 2], B[Math.min(B.length - 1, j + 2)], B[j]], mx = (A[j][0] + B[j][0]) / 2, my = (A[j][1] + B[j][1]) / 2, ml = Math.hypot(mx, my) || 1;
              const t = r2() - 0.5;
              facet(quad, C.inner, (mx / ml) * t * 2, (my / ml) * t * 2, 0.5, 0.1 + r2() * 0.22);
            }
          }
          ctx.lineJoin = 'round';
          for (const c of cracks.concat(rings)) { const pts = Xs(c); ctx.beginPath(); ctx.moveTo(...pts[0]); for (let j = 1; j < pts.length; j++) ctx.lineTo(...pts[j]); ctx.strokeStyle = height ? gray(0.4) : `rgba(255,255,255,${0.6 + p.shine * 0.4})`; ctx.lineWidth = Math.max(0.6, K * 0.7); ctx.stroke(); }
        } else if (kind === 'petals') {
          // folded petals: two facets each, split along the spine
          for (const q of petals) {
            const n = q.pts.length, tipI = (n - 1) / 2, tip = q.pts[tipI], ux = Math.cos(q.mid), uy = Math.sin(q.mid), nx = -uy, ny = ux;
            const baseL = q.pts[0], baseR = q.pts[n - 1], spineBase = P(q.mid, q.base);
            facet([baseL, q.pts[2], tip, spineBase], C.inner, ux * 0.6 + nx * 0.5, uy * 0.6 + ny * 0.5, 0.75);
            facet([spineBase, tip, q.pts[n - 3], baseR], C.inner, ux * 0.6 - nx * 0.5, uy * 0.6 - ny * 0.5, 0.7);
          }
        } else {
          // crater ring: two triangles per segment, each tilted toward the center plus some jitter
          for (let i = 0; i < V; i++) {
            const j = (i + 1) % V, a = angs[i], b = angs[j] + (j === 0 ? TAU : 0), m = (a + b) / 2, mo = (outer[i] + outer[j]) / 2 * (0.95 + r2() * 0.15);
            const A = P(a, hv[i]), B = P(b, hv[j]), Co = P(a, outer[i]), D = P(b, outer[j]), M = P(m, mo);
            const ux = -Math.cos(m), uy = -Math.sin(m), base = kind === 'splinters' ? mix(C.inner, C.chip, r2() * 0.5) : mul(C.inner, 0.9 + r2() * 0.2);
            facet([A, B, M], base, ux * 0.9 + (r2() - 0.5) * 0.5, uy * 0.9 + (r2() - 0.5) * 0.5, 0.3);
            facet([A, M, Co], base, ux * 0.5 + (r2() - 0.5) * 0.6, uy * 0.5 + (r2() - 0.5) * 0.6, 0.42);
            facet([B, D, M], base, ux * 0.5 + (r2() - 0.5) * 0.6, uy * 0.5 + (r2() - 0.5) * 0.6, 0.42);
          }
          // splinters as single spikes with two facets
          for (const q of splinters) {
            const nx = -Math.sin(q.a), ny = Math.cos(q.a), base = mix(C.inner, C.chip, q.tone);
            facet([q.bl, q.tip, q.base], base, nx, ny, 0.72); facet([q.base, q.tip, q.br], base, -nx, -ny, 0.68);
          }
          // shards: chips as triangles fanned from their center
          for (const c of chips) {
            for (let i = 0; i < c.pts.length; i++) {
              const a = c.pts[i], b = c.pts[(i + 1) % c.pts.length], mx = (a[0] + b[0]) / 2 - c.x, my = (a[1] + b[1]) / 2 - c.y, ml = Math.hypot(mx, my) || 1;
              facet([[c.x, c.y], a, b], mul(C.chip, 0.9 + c.tone * 0.2), (mx / ml) * 0.8, (my / ml) * 0.8, 0.66);
            }
          }
        }
        // hole: faceted inner wall (fan between the outline and a smaller inner polygon) + dark core
        const inner = angs.map((a, i) => P(a + (r2() - 0.5) * 0.2, hv[i] * (0.42 + r2() * 0.12)));
        for (let i = 0; i < V; i++) {
          const j = (i + 1) % V, a = angs[i], b = angs[j] + (j === 0 ? TAU : 0), m = (a + b) / 2;
          const A = P(a, hv[i]), B = P(b, hv[j]);
          // the wall faces the center: lit when that points at the light
          const lit = -(Math.cos(m) * lx + Math.sin(m) * ly), base = mix(C.hole, kind === 'glass' ? C.chip : C.inner, 0.25 + 0.35 * Math.max(0, lit) * LA);
          facet([A, B, inner[j], inner[i]], base, 0, 0, 0.15);
        }
        facet(inner, C.hole, 0, 0, 0.02);
        if (!height && p.dust > 0) dustSpecks();
      }
    },
  });
})();
