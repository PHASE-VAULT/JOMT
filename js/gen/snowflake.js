/* Snowflake: ice crystal sprites and particle atlases. Every flake is built in one folded wedge of the
   circle (mirror symmetry per arm), so all arms grow alike like a real crystal: a main arm from the center,
   side branches at the branch angle, sub-branches on them, hexagonal plates in the center and at the arm
   tips. Crystal types: stellar dendrite, fernlike dendrite, stellar plate, sectored plate, hexagonal plate,
   simple star and a "V"-branch icon flake. A small per-arm length variation and edge noise break the perfect
   symmetry. Looks: realistic translucent ice (bright rims, ridges along the arms, hexagonal growth rings,
   see-through body), flat cartoon fill with outline, constant-width line icon and a soft blurred snow
   particle for VFX. Optional glow. A grid renders an atlas of different flakes (one per cell) for particle
   systems. Output: transparent sprite, on a background color, or a height map for the normal map mode. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, smoothstep, hash, mod } = U;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;
  const TYPES = ['dendrite', 'fern', 'stellar', 'sectored', 'plate', 'star', 'simple'];

  /* ---------- geometry of one flake, in flake-radius units (arm along +x, folded wedge y >= 0) ---------- */
  function buildFlake(p, type, seed) {
    const rnd = U.rng(seed);
    const segs = [], plates = []; // segs: x0, y0, x1, y1, r0, r1 · plates: cx, R (hexagon, a vertex on the arm axis)
    const th = 0.012 + p.thickness * 0.045, tipW = th * (1 - p.taper * 0.85);
    const ba = p.branchAngle * RAD, ca = Math.cos(ba), sa = Math.sin(ba);
    const seg = (x0, y0, x1, y1, r0, r1) => segs.push(x0, y0, x1, y1, r0, r1);
    const nb = Math.max(0, p.branches | 0), ns = Math.round(p.sub * 5);
    const arm = (w0, w1) => seg(0, 0, 0.97, 0, w0, w1);
    const center = p.center;

    // side branches along the arm, each with optional sub-branches at ±(branch angle) to the branch
    const branchSet = (n, t0, t1, lenF, wF, subN, profile) => {
      for (let i = 0; i < n; i++) {
        const t = lerp(t0, t1, n === 1 ? 0.5 : i / (n - 1)) + (rnd() - 0.5) * (0.5 / Math.max(1, n)) * p.irregular;
        const env = profile === 'mid' ? 0.3 + 0.7 * Math.sin(Math.PI * clamp(t * 1.05)) : 1 - t * 0.75;
        const len = p.branchLen * lenF * env * (1 - p.irregular * 0.35 + rnd() * p.irregular * 0.7);
        if (len <= 0.01) continue;
        const w = lerp(th, tipW, t) * wF, ex = t + ca * len, ey = sa * len;
        seg(t, 0, ex, ey, w, w * (1 - p.taper * 0.7));
        for (let j = 0; j < subN; j++) {
          const s = 0.18 + (0.7 * (j + 0.5)) / subN, sx = t + ca * len * s, sy = sa * len * s;
          const sl = len * (1 - s) * (0.35 + 0.35 * rnd()) * (0.6 + p.sub * 0.6), sw = w * 0.6;
          // the two sub-branch directions: branch angle - angle (outward, parallel to the arm) and + angle
          seg(sx, sy, sx + Math.cos(ba - ba) * sl, sy + Math.sin(ba - ba) * sl, sw, sw * 0.5);
          seg(sx, sy, sx + Math.cos(ba + ba) * sl * 0.8, sy + Math.sin(ba + ba) * sl * 0.8, sw, sw * 0.5);
        }
      }
    };

    switch (type) {
      case 'dendrite':
        arm(th, tipW);
        branchSet(nb, 0.2, 0.86, 0.75, 0.75, ns, 'mid');
        if (center > 0) plates.push(0, 0.08 + center * 0.3);
        break;
      case 'fern':
        arm(th * 0.85, tipW * 0.8);
        branchSet(Math.round(nb * 1.8) + 2, 0.12, 0.93, 0.55, 0.6, ns + 2, 'mid');
        if (center > 0) plates.push(0, 0.05 + center * 0.2);
        break;
      case 'stellar':
        arm(th * 1.3, th * 1.1);
        branchSet(Math.max(0, Math.round(nb * 0.5)), 0.35, 0.65, 0.35, 0.9, 0, 'out');
        plates.push(0, 0.1 + center * 0.3);
        plates.push(0.8, 0.12 + p.tipPlates * 0.12);  // broad plate at the tip
        if (p.tipPlates > 0.3) plates.push(0.52, 0.05 + p.tipPlates * 0.07);
        break;
      case 'sectored':
        arm(th * 0.5, th * 0.4);
        plates.push(0, 0.55 + center * 0.4);
        plates.push(0.82, 0.1 + p.tipPlates * 0.12);
        seg(0, 0, 0.97, 0, th * 1.1, th * 0.9);
        break;
      case 'plate':
        seg(0, 0, 0.8, 0, 0.004, 0.004); // ridge line only
        plates.push(0, 0.85);
        break;
      case 'star':
        seg(0, 0, 1, 0, th * 2.4, tipW * 0.3);
        branchSet(Math.min(nb, 2), 0.45, 0.7, 0.45, 1.2, 0, 'out');
        if (center > 0) plates.push(0, 0.12 + center * 0.25);
        break;
      default: // simple: icon-like arm with V branches near the tip
        arm(th, th);
        branchSet(Math.max(1, Math.min(nb, 3)), 0.45, 0.72, 0.45, 1, 0, 'out');
        if (center > 0) plates.push(0, 0.06 + center * 0.2);
    }
    return { segs: Float64Array.from(segs), plates: Float64Array.from(plates), ridgeW: th * 0.45 };
  }

  // per-pixel evaluation: signed distance (flake units), distance to the arm / branch centerlines, growth rings
  const EV = { sd: 0, dc: 0, ring: 1e9, r: 0 };
  function evalFlake(F, x, y, A, sector, armF, irr, seedN, rings, lineMode, lineW) {
    let r = Math.hypot(x, y);
    const th = Math.atan2(y, x), a = th / sector, ai = Math.round(a), tb = Math.abs(a - ai);
    const fa = armF[mod(ai, A)], fb = armF[mod(ai + (a > ai ? 1 : -1), A)];
    const sc = lerp(fa, fb, smoothstep(0.15, 0.5, tb) * 0.5);
    r /= sc;
    const t = Math.abs(th - ai * sector), px = r * Math.cos(t), py = r * Math.sin(t);
    let sd = 1e9, dc = 1e9, ring = 1e9;
    const S = F.segs;
    for (let k = 0; k < S.length; k += 6) {
      const x0 = S[k], y0 = S[k + 1], dx = S[k + 2] - x0, dy = S[k + 3] - y0;
      const ll = dx * dx + dy * dy, h = clamp(((px - x0) * dx + (py - y0) * dy) / (ll || 1));
      const ex = px - x0 - dx * h, ey = py - y0 - dy * h, d = Math.sqrt(ex * ex + ey * ey);
      const rr = lineMode ? lineW : S[k + 4] + (S[k + 5] - S[k + 4]) * h;
      if (d - rr < sd) sd = d - rr;
      if (d < dc) dc = d;
    }
    const P = F.plates, s2 = sector / 2, cs = Math.cos(s2), sn = Math.sin(s2);
    for (let k = 0; k < P.length; k += 2) {
      const cx = P[k], R = P[k + 1];
      let d, hd;
      if (cx === 0) { const q = px * cs + py * sn; d = q - R * cs; hd = q / (R * cs); }
      else {
        // hexagon on the arm (vertex toward the tip): max over its edge normals at ±30° and 90°
        const qx = Math.abs(px - cx), qy = Math.abs(py), q = Math.max(qx * 0.8660254 + qy * 0.5, qy);
        d = q - R * 0.8660254; hd = q / (R * 0.8660254);
      }
      if (lineMode) d = Math.abs(d + lineW) - lineW;
      if (d < sd) sd = d;
      if (hd < 1 && rings > 0) {
        // distance to the nearest inner growth ring (concentric hexagons)
        const f = hd * (rings + 0.6), fr = Math.abs(f - Math.round(f));
        if (Math.round(f) >= 1 && Math.round(f) <= rings) ring = Math.min(ring, (fr / (rings + 0.6)) * R);
      }
    }
    // edge noise breaks the perfect outline a little
    if (irr > 0) sd += (U.perlin(px * 9, py * 9, 0, 0, seedN) * 0.5) * irr * 0.012;
    EV.sd = sd * sc; EV.dc = dc * sc; EV.ring = ring * sc; EV.r = r * sc;
    return EV;
  }

  U.register({
    id: 'snowflake',
    name: 'Snowflake',
    desc: 'Snowflake sprites and particle atlases: dendrite, fern, stellar, sectored and plate ice crystals in realistic, flat, line icon or soft styles',
    uses: [
      'Snow particle sprites and atlases (one flake per cell) for snowfall, blizzards, frost magic and winter VFX.',
      'Winter UI icons, holiday decorations, frost decals on windows and stylized weather symbols.',
    ],
    tags: ['VFX', 'Nature', 'UI'],
    bg: 'checker',
    normalMap: true,
    heightMap: true,
    normalDesc: 'Normal map from the crystal\'s height: thicker center and ridges along the arms',
    icon: U.icon('<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="M10 4.8l2 1.6 2-1.6M10 19.2l2-1.6 2 1.6M4.9 10.2l2.3-.6-.4-2.5M19.1 13.8l-2.3.6.4 2.5M4.9 13.8l2.3.6-.4 2.5M19.1 10.2l-2.3-.6.4-2.5" opacity=".7"/>'),
    params: [
      { type: 'section', label: 'Crystal' },
      { key: 'type', label: 'Crystal type', type: 'select', default: 'dendrite', options: [['dendrite', 'Stellar dendrite'], ['fern', 'Fernlike dendrite'], ['stellar', 'Stellar plate'], ['sectored', 'Sectored plate'], ['plate', 'Hexagonal plate'], ['star', 'Simple star'], ['simple', 'Icon flake (V branches)']] },
      { key: 'mix', label: 'Mix crystal types', type: 'bool', default: false, show: (p) => p.grid > 1, tip: 'Each atlas cell picks a random crystal type' },
      { key: 'arms', label: 'Arms', type: 'int', min: 3, max: 12, default: 6, tip: 'Real snowflakes have 6; other counts for stylized flakes' },
      { key: 'branches', label: 'Branches per arm', type: 'int', min: 0, max: 10, default: 4 },
      { key: 'branchLen', label: 'Branch length', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { key: 'branchAngle', label: 'Branch angle', type: 'range', min: 20, max: 90, step: 1, default: 60, tip: 'Real ice crystals branch at 60°' },
      { key: 'sub', label: 'Sub-branches', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.type === 'dendrite' || p.type === 'fern' || p.mix, tip: 'Small twigs on the side branches' },
      { key: 'thickness', label: 'Arm thickness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'taper', label: 'Taper', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Arms and branches get thinner toward the tips' },
      { key: 'center', label: 'Center plate', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Hexagonal plate in the middle' },
      { key: 'tipPlates', label: 'Tip plates', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.type === 'stellar' || p.type === 'sectored' || p.mix, tip: 'Broad hexagonal plates at the arm ends' },
      { key: 'irregular', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Uneven branch lengths, slightly different arms and a ragged edge' },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: -90 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 5 },

      { type: 'section', label: 'Atlas' },
      { key: 'grid', label: 'Grid', type: 'select', default: 1, options: [[1, '1 × 1 · single flake'], [2, '2 × 2 · 4 flakes'], [3, '3 × 3 · 9 flakes'], [4, '4 × 4 · 16 flakes']], tip: 'A different flake in every cell, for particle systems that pick a random cell' },
      { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.92, tip: 'Flake size inside its cell' },
      { key: 'sizeVar', label: 'Size variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => p.grid > 1 },
      { key: 'rotVar', label: 'Random rotation', type: 'bool', default: true, show: (p) => p.grid > 1 },

      { type: 'section', label: 'Look' },
      { key: 'style', label: 'Style', type: 'select', default: 'crystal', options: [['crystal', 'Realistic ice crystal'], ['flat', 'Flat (cartoon)'], ['line', 'Line icon'], ['soft', 'Soft particle (blurred)']] },
      { key: 'body', label: 'Body opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.style === 'crystal', tip: 'How see-through the ice between the bright edges is' },
      { key: 'rim', label: 'Edge brightness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, show: (p) => p.style === 'crystal' },
      { key: 'ridges', label: 'Ridges', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.style === 'crystal', tip: 'Bright lines along the arms and branches' },
      { key: 'rings', label: 'Growth rings', type: 'int', min: 0, max: 6, default: 2, show: (p) => p.style === 'crystal', tip: 'Concentric hexagons inside the plates' },
      { key: 'frost', label: 'Surface texture', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.style === 'crystal' || p.style === 'soft', tip: 'Fine frosty noise in the ice' },
      { key: 'lineWidth', label: 'Line width', type: 'range', min: 0.5, max: 12, step: 0.25, default: 3, show: (p) => p.style === 'line', tip: 'px @ 512 for a single flake' },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 8, step: 0.25, default: 2, show: (p) => p.style === 'flat', tip: 'px @ 512 for a single flake' },
      { key: 'blur', label: 'Softness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.style === 'soft' },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15 },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 0.02, max: 0.5, step: 0.01, default: 0.12, show: (p) => p.glow > 0, tip: '× flake radius' },

      { type: 'section', label: 'Color' },
      { key: 'color', label: 'Ice color', type: 'color', default: '#ffffff', tip: 'Bright edges and ridges (fill for flat and line styles)' },
      { key: 'tint', label: 'Body tint', type: 'color', default: '#a9c9ee', show: (p) => p.style === 'crystal' || p.style === 'soft', tip: 'Color of the see-through ice' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#3d6a9e', show: (p) => p.style === 'flat' && p.outline > 0 },
      { key: 'glowColor', label: 'Glow color', type: 'color', default: '#9fd0ff', show: (p) => p.glow > 0 },
      { key: 'output', label: 'Output', type: 'select', default: 'alpha', options: [['alpha', 'Transparent'], ['bg', 'On background color'], ['height', 'Height map']] },
      { key: 'bgColor', label: 'Background', type: 'color', default: '#15233a', show: (p) => p.output === 'bg' },
    ],
    presets: [
      { name: 'Stellar dendrite', group: 'Realistic', values: {} },
      { name: 'Fernlike dendrite', group: 'Realistic', values: { type: 'fern', branches: 5, branchLen: 0.5, sub: 0.6, thickness: 0.2, center: 0.15, seed: 11 } },
      { name: 'Stellar plate', group: 'Realistic', values: { type: 'stellar', branches: 2, thickness: 0.45, center: 0.4, tipPlates: 0.6, rings: 2, seed: 3 } },
      { name: 'Sectored plate', group: 'Realistic', values: { type: 'sectored', center: 0.6, tipPlates: 0.4, thickness: 0.4, rings: 3, ridges: 0.8, seed: 8 } },
      { name: 'Hexagonal plate', group: 'Realistic', values: { type: 'plate', rings: 4, ridges: 0.5, body: 0.4, seed: 2 } },
      { name: 'Delicate dendrite', group: 'Realistic', values: { branches: 6, branchLen: 0.55, sub: 0.75, thickness: 0.12, taper: 0.7, center: 0.2, irregular: 0.45, seed: 21 } },
      { name: 'Snowfall atlas 4×4', group: 'Particles', values: { grid: 4, mix: true, size: 0.9, sizeVar: 0.3, glow: 0.1, seed: 4 } },
      { name: 'Snowfall atlas 2×2', group: 'Particles', values: { grid: 2, mix: true, size: 0.92, glow: 0.1, seed: 9 } },
      { name: 'Soft snow particles', group: 'Particles', values: { grid: 2, mix: true, style: 'soft', blur: 0.6, frost: 0.5, tint: '#dbe9ff', glow: 0.2, seed: 6 } },
      { name: 'Blurry snowflake', group: 'Particles', values: { style: 'soft', blur: 0.85, glow: 0.3, seed: 6 } },
      { name: 'Frost magic', group: 'Particles', values: { type: 'fern', branches: 5, sub: 0.6, color: '#e9fbff', tint: '#4fc6ff', glow: 0.55, glowSize: 0.2, glowColor: '#38a8ff', rim: 1, seed: 14 } },
      { name: 'Cartoon snowflake', group: 'Stylized', values: { style: 'flat', type: 'stellar', branches: 2, thickness: 0.55, center: 0.45, tipPlates: 0.7, irregular: 0, outline: 3, glow: 0, color: '#f4fbff' } },
      { name: 'Toon star flake', group: 'Stylized', values: { style: 'flat', type: 'star', branches: 2, thickness: 0.6, taper: 0.8, center: 0.3, irregular: 0, outline: 2.5, glow: 0, color: '#ffffff', outlineColor: '#2a5a9a' } },
      { name: 'Snowflake icon', group: 'Stylized', values: { style: 'line', type: 'simple', branches: 2, branchLen: 0.4, center: 0, irregular: 0, lineWidth: 3.5, glow: 0, color: '#ffffff' } },
      { name: 'Weather icon (blue)', group: 'Stylized', values: { style: 'line', type: 'simple', branches: 1, branchLen: 0.35, center: 0.15, irregular: 0, lineWidth: 5, glow: 0, color: '#3d8de0', output: 'bg', bgColor: '#ffffff' } },
      { name: '8-arm ornament', group: 'Stylized', values: { style: 'flat', type: 'dendrite', arms: 8, branches: 3, branchAngle: 45, sub: 0.3, thickness: 0.4, irregular: 0, outline: 2, glow: 0, color: '#fff7e0', outlineColor: '#b07a1a' } },
      { name: 'Holiday gold flake', group: 'Stylized', values: { type: 'sectored', center: 0.5, color: '#fff2b8', tint: '#d4a020', glow: 0.35, glowColor: '#ffcc55', output: 'bg', bgColor: '#3a0c12', seed: 12 } },
    ],

    render(ctx, W, H, p, opts) {
      opts = opts || {};
      const height = !!opts.height || p.output === 'height';
      const g = Math.max(1, Math.min(4, +p.grid || 1)), cw = W / g, ch = H / g;
      const S = Math.min(cw, ch), A = Math.max(3, p.arms | 0), sector = TAU / A, seed = p.seed | 0;
      const style = p.style || 'crystal', lineMode = style === 'line', soft = style === 'soft', flat = style === 'flat';
      const kRef = Math.min(W, H) / 512; // px @ 512 refers to the whole texture
      const col = U.hex(p.color), tint = U.hex(p.tint), gc = U.hex(p.glowColor), oc = U.hex(p.outlineColor), bg = U.hex(p.bgColor);

      // one flake per cell
      const cells = [];
      for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) {
        const cs = seed + (j * g + i) * 7919, rnd = U.rng(cs + 1);
        const type = p.mix && g > 1 ? TYPES[Math.floor(rnd() * TYPES.length)] : TYPES.includes(p.type) ? p.type : 'dendrite';
        const scale = p.size * (g > 1 ? 1 - p.sizeVar * rnd() * 0.6 : 1);
        const R = (S / 2) * scale / (1 + (p.glow > 0 ? p.glowSize * 0.5 : 0));
        const rot = (p.rotation * RAD) + (g > 1 && p.rotVar ? rnd() * sector : 0);
        const armF = new Float64Array(A);
        for (let a = 0; a < A; a++) armF[a] = 1 - p.irregular * 0.12 * rnd();
        const mx = Math.max(...armF);
        for (let a = 0; a < A; a++) armF[a] /= mx;
        cells.push({ F: buildFlake(p, type, cs), R, rot, armF, cx: (i + 0.5) * cw, cy: (j + 0.5) * ch, seedN: cs + 3 });
      }

      const img = ctx.createImageData(W, H), o = img.data;
      const rings = Math.max(0, p.rings | 0);
      for (let y = 0; y < H; y++) {
        const cj = Math.min(g - 1, Math.floor(y / ch));
        for (let x = 0; x < W; x++) {
          const ci = Math.min(g - 1, Math.floor(x / cw)), C = cells[cj * g + ci], R = C.R;
          const aa = 0.75 / R; // anti-aliasing width in flake units
          const dx0 = (x + 0.5 - C.cx) / R, dy0 = (y + 0.5 - C.cy) / R;
          const cr = Math.cos(-C.rot), sr = Math.sin(-C.rot), fx = dx0 * cr - dy0 * sr, fy = dx0 * sr + dy0 * cr;
          const rr = Math.hypot(fx, fy), k4 = (y * W + x) * 4;
          const reach = 1.08 + (p.glow > 0 ? p.glowSize * 1.6 : 0) + (soft ? p.blur * 0.25 : 0);
          let a = 0, r = 0, gg = 0, b = 0, hgt = 0;
          if (rr < reach) {
            const lw = ((p.lineWidth * kRef) / R) * 0.5;
            const E = evalFlake(C.F, fx, fy, A, sector, C.armF, p.irregular, C.seedN, rings, lineMode, lw);
            const sd = E.sd;
            let cov;
            if (soft) {
              const bw = 0.02 + p.blur * 0.2;
              cov = clamp(0.5 - sd / bw) * (0.75 + 0.25 * clamp(1 - rr));
              const blob = Math.exp(-(rr * rr) / (0.18 + p.blur * 0.3)) * p.blur * 0.55;
              cov = Math.max(cov, blob);
              const fr = 1 + (U.perlin(fx * 6, fy * 6, 0, 0, C.seedN + 5) * 0.5) * p.frost * 0.6;
              a = clamp(cov * fr);
              const t = clamp(0.5 - sd / 0.05);
              r = lerp(tint[0], col[0], t); gg = lerp(tint[1], col[1], t); b = lerp(tint[2], col[2], t);
              hgt = a;
            } else {
              cov = clamp(0.5 - sd / aa);
              if (cov > 0) {
                if (flat || lineMode) {
                  r = col[0]; gg = col[1]; b = col[2]; a = cov;
                  const ow = flat ? (p.outline * kRef) / R : 0;
                  if (ow > 0) {
                    const t = clamp(0.5 + (sd + ow) / aa); // 1 inside the outline band
                    r = lerp(r, oc[0], t); gg = lerp(gg, oc[1], t); b = lerp(b, oc[2], t);
                  }
                  hgt = cov * (0.5 + 0.5 * clamp(-sd * 20));
                } else {
                  const inD = Math.max(0, -sd), rimW = 0.01 + p.thickness * 0.012;
                  const rim = Math.exp(-inD / rimW) * p.rim;
                  const rw = C.F.ridgeW, ridge = Math.exp(-((E.dc / rw) ** 2)) * p.ridges;
                  const ringL = E.ring < 1e8 ? Math.exp(-((E.ring / 0.007) ** 2)) * p.ridges * 0.7 : 0;
                  const fr = (U.perlin(fx * 14, fy * 14, 0, 0, C.seedN + 7) + U.perlin(fx * 31, fy * 31, 0, 0, C.seedN + 8) * 0.5) * p.frost * 0.18;
                  const br = clamp(rim + ridge * 0.85 + ringL + fr + 0.08);
                  a = cov * clamp(p.body * (0.7 + fr) + br * (1 - p.body * 0.5));
                  r = lerp(tint[0], col[0], br); gg = lerp(tint[1], col[1], br); b = lerp(tint[2], col[2], br);
                  hgt = cov * (0.35 + 0.25 * clamp(inD * 12) + 0.3 * ridge / Math.max(0.01, p.ridges || 1) * (p.ridges > 0 ? 1 : 0) + 0.1 * (1 - clamp(E.r)));
                }
              }
            }
            // glow behind the flake
            if (p.glow > 0 && !height) {
              const gs = Math.max(0.01, p.glowSize), gl = Math.exp(-Math.max(0, sd) / (gs * 0.45)) * p.glow * (sd > 0 ? 1 : 0.6) * 0.85;
              if (gl > 0.002) {
                const na = a + gl * (1 - a);
                if (na > 0) { r = (r * a + gc[0] * gl * (1 - a)) / na; gg = (gg * a + gc[1] * gl * (1 - a)) / na; b = (b * a + gc[2] * gl * (1 - a)) / na; }
                a = na;
              }
            }
          }
          if (height) { const v = clamp(hgt) * 255; o[k4] = o[k4 + 1] = o[k4 + 2] = v; o[k4 + 3] = 255; continue; }
          if (p.output === 'bg') {
            o[k4] = lerp(bg[0], r, a); o[k4 + 1] = lerp(bg[1], gg, a); o[k4 + 2] = lerp(bg[2], b, a); o[k4 + 3] = 255;
          } else { o[k4] = r; o[k4 + 1] = gg; o[k4 + 2] = b; o[k4 + 3] = clamp(a) * 255; }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
