/* Street paving: tileable street and sidewalk surfaces. Cobblestones (irregular), setts in rows, fan /
   arc cobbles (segmental arcs), herringbone pavers, square slabs and hexagon pavers. Every stone gets
   its own color, a rounded domed top and surface grain; joints filled with sand, dirt, grass or mortar;
   moss, wear polish, oil / dirt stains and wetness. Height map for the normal map mode. All pattern
   sizes are rounded so the texture tiles. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp, hash } = U;
  const SQ3 = Math.sqrt(3);

  const JOINTS = { sand: '#a8987a', dirt: '#3a3024', grass: '#3a5a22', mortar: '#8a8780', dark: '#1a1814' };

  // rounded-rectangle edge distance (px, positive inside); q = point relative to the center, h = half size
  const rbox = (qx, qy, hx, hy, rc) => {
    const ax = Math.abs(qx) - (hx - rc), ay = Math.abs(qy) - (hy - rc);
    const out = Math.hypot(Math.max(ax, 0), Math.max(ay, 0)) + Math.min(Math.max(ax, ay), 0);
    return rc - out;
  };

  function makePattern(p, W, H) {
    const seed = p.seed | 0, n = Math.max(1, p.cells), ar = H / W;
    const rc = p.round * Math.min(W, H) / 512;
    switch (p.pattern) {
      case 'cobble': {
        const cx = n, cy = Math.max(1, Math.round(n * ar)), cw = W / cx;
        return (x, y) => {
          const w = U.worley((x / W) * cx, (y / H) * cy, cx, cy, seed);
          return { id: w.id, e: (w.f2 - w.f1) * cw * 0.5, size: cw };
        };
      }
      case 'setts':
      case 'slabs': {
        const rows = Math.max(2, Math.round((p.pattern === 'slabs' ? n : n * 2) * ar / 2) * 2);
        const rh = H / rows, per = Math.max(1, Math.round(W / (rh * (p.pattern === 'slabs' ? 1 : p.ratio)))), sw = W / per;
        const stag = p.pattern === 'setts' ? 0.5 : p.stagger;
        return (x, y) => {
          const row = Math.floor(y / rh), off = (row % 2) * stag * sw, lx = U.mod(x - off, W), col = Math.floor(lx / sw);
          const qx = lx - (col + 0.5) * sw, qy = y - (row + 0.5) * rh;
          // setts: slightly irregular sizes
          const jit = p.pattern === 'setts' ? (hash(col, U.mod(row, rows), seed) - 0.5) * 0.12 : 0;
          return { id: hash(U.mod(col, per), U.mod(row, rows), seed + 1), e: rbox(qx, qy, sw / 2 * (1 - Math.abs(jit)), rh / 2, Math.min(rc, rh / 2)), size: rh };
        };
      }
      case 'herringbone': {
        const R = 2, cell = 2 * R, ny = Math.max(1, Math.round((n * 2) / cell)) * cell, nx = Math.max(1, Math.round((ny / ar) / cell)) * cell;
        const ux = W / nx, uy = H / ny; // px per paver width
        return (x, y) => {
          const X = U.mod(x / ux, nx), Y = U.mod(y / uy, ny), t = (X - Y) / (2 * R);
          for (let T = Math.floor(t) - 1; T <= Math.floor(t) + 1; T++) {
            const lx = X - T * R, ly = Y + T * R;
            let k = Math.floor(ly);
            if (lx >= k && lx < k + R) return { id: hash(U.mod(T * R + k, nx), U.mod(-T * R + k, ny), seed + 2), e: rbox((lx - k - R / 2) * ux, (ly - k - 0.5) * uy, R / 2 * ux, 0.5 * uy, Math.min(rc, uy / 2)), size: uy };
            k = Math.floor(lx);
            if (ly >= k + 1 && ly < k + 1 + R) return { id: hash(U.mod(T * R + k, nx) + 999, U.mod(-T * R + k, ny), seed + 2), e: rbox((lx - k - 0.5) * ux, (ly - k - 1 - R / 2) * uy, 0.5 * ux, R / 2 * uy, Math.min(rc, ux / 2)), size: ux };
          }
          return { id: 0, e: 0, size: ux };
        };
      }
      case 'hex': {
        const m = Math.max(1, Math.round(n / SQ3)), R = W / (3 * m), rowsN = Math.max(1, Math.round(H / (SQ3 * R))), ys = (rowsN * SQ3 * R) / H, PH = rowsN * SQ3 * R;
        return (x, y) => {
          const X = U.mod(x, W), Y = U.mod(y * ys, PH), col = Math.floor(X / (1.5 * R));
          let best = 1e9, second = 1e9, bid = 0;
          for (let c = col - 1; c <= col + 1; c++) {
            const off = U.mod(c, 2) ? 0.5 : 0, r0 = Math.floor(Y / (SQ3 * R) - off);
            for (let r = r0 - 1; r <= r0 + 1; r++) {
              const cx = c * 1.5 * R, cy = (r + off) * SQ3 * R, d = Math.hypot(X - cx, Y - cy);
              if (d < best) { second = best; best = d; bid = hash(U.mod(c, 2 * m), U.mod(r, rowsN), seed + 3); } else if (d < second) second = d;
            }
          }
          return { id: bid, e: (second - best) / 2, size: R };
        };
      }
      case 'fan':
      default: {
        // segmental arcs: overlapping "fish scale" fans, each made of rings of small stones
        const cols = Math.max(1, Math.round(n / 4)), Rs = W / (2 * cols), rowsN = Math.max(2, Math.round(H / Rs / 2) * 2), ys = (rowsN * Rs) / H;
        const ringW = Rs / Math.max(2, p.rings), stoneL = ringW * p.ratio * 0.6;
        return (x, y) => {
          const X = U.mod(x, W), Y = U.mod(y * ys, rowsN * Rs), j0 = Math.floor(Y / Rs);
          // overlapping disks ("fish scales"): the disk with the largest row index that contains the point
          // wins; its visible edge is either its own rim or the rim of an overlapping disk in front of it
          let front = 1e9;
          for (let j = j0 + 2; j >= j0 - 2; j--) {
            const off = U.mod(j, 2) ? Rs : 0, i0 = Math.floor((X - off) / (2 * Rs));
            let hit = null;
            for (let i = i0 - 1; i <= i0 + 1; i++) {
              const cx = i * 2 * Rs + off, cy = j * Rs, dx = X - cx, dy = Y - cy, d = Math.hypot(dx, dy);
              if (d < Rs && !hit) hit = { i, dx, dy, d };
              else if (d >= Rs) front = Math.min(front, d - Rs);
            }
            if (!hit) continue;
            const { i, dx, dy, d } = hit;
            const ring = Math.floor(d / ringW), rr = (ring + 0.5) * ringW;
            const ang = U.mod(Math.atan2(-dy, dx), U.TAU), segs = Math.max(3, Math.round((U.TAU * rr) / stoneL)), sa = U.TAU / segs, si = Math.floor(ang / sa);
            const eRad = Math.min(d - ring * ringW, (ring + 1) * ringW - d);
            const eAng = Math.min(ang - si * sa, (si + 1) * sa - ang) * Math.max(1, d);
            const id = hash(U.mod(i, cols) * 131 + ring, U.mod(j, rowsN) * 977 + si, seed + 4);
            return { id, e: Math.min(eRad, eAng, Rs - d, front) / ys, size: ringW };
          }
          return { id: 0, e: 0, size: ringW };
        };
      }
    }
  }

  U.register({
    id: 'paving',
    name: 'Street Paving',
    desc: 'Tileable cobblestones, setts, fan cobbles, herringbone, slabs and hex pavers with joints, moss and wetness',
    uses: ['Street and sidewalk materials for city, village and medieval levels, with a height map for the normal map mode.', 'Top-down road and plaza tiles for 2D and strategy games.'],
    tags: ['PBR'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h7M10 3v6M14 9h7M14 3v6M3 15h4M7 9v6M11 15h10M15 9v6M11 15v6"/>'),
    params: [
      { type: 'section', label: 'Pattern' },
      { key: 'pattern', label: 'Pattern', type: 'select', default: 'cobble', options: [['cobble', 'Cobblestones'], ['setts', 'Setts (rows)'], ['fan', 'Fan / arc cobbles'], ['herringbone', 'Herringbone pavers'], ['slabs', 'Square slabs'], ['hex', 'Hexagon pavers']] },
      { key: 'cells', label: 'Stones across', type: 'int', min: 2, max: 40, default: 8, tip: 'Rough number of stones across the texture (rounded so it tiles)' },
      { key: 'ratio', label: 'Stone length', type: 'range', min: 1, max: 3, step: 0.05, default: 1.5, show: (p) => p.pattern === 'setts' || p.pattern === 'fan', tip: 'Length / width' },
      { key: 'rings', label: 'Rings per fan', type: 'int', min: 2, max: 12, default: 5, show: (p) => p.pattern === 'fan' },
      { key: 'stagger', label: 'Row offset', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0, show: (p) => p.pattern === 'slabs' },
      { key: 'joint', label: 'Joint width', type: 'range', min: 0, max: 16, step: 0.1, default: 3, tip: 'px @ 512' },
      { key: 'round', label: 'Edge rounding', type: 'range', min: 0, max: 40, step: 0.5, default: 6, tip: 'px @ 512: rounded corners and domed tops' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 9 },
      { type: 'section', label: 'Stone' },
      { key: 'color1', label: 'Stone color', type: 'color', default: '#8e8a82' },
      { key: 'color2', label: 'Second color', type: 'color', default: '#6a655c' },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'How far stones spread between the two colors' },
      { key: 'brightVar', label: 'Brightness variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'grain', label: 'Surface grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { key: 'dome', label: 'Dome shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Darker toward the stone edges' },
      { type: 'section', label: 'Joints & wear' },
      { key: 'jointFill', label: 'Joint fill', type: 'select', default: 'sand', options: [['sand', 'Sand'], ['dirt', 'Dirt'], ['grass', 'Grass'], ['mortar', 'Mortar'], ['dark', 'Dark gap']], apply: (v, p) => { if (JOINTS[v]) p.jointColor = JOINTS[v]; } },
      { key: 'jointColor', label: 'Joint color', type: 'color', default: JOINTS.sand },
      { key: 'moss', label: 'Moss', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Green growth creeping from the joints' },
      { key: 'polish', label: 'Wear polish', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Stone tops worn smooth and lighter' },
      { key: 'stains', label: 'Stains', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Oil and dirt patches' },
      { key: 'wet', label: 'Wetness', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Darker, more saturated (pair with a smoothness map in the engine)' },
    ],
    presets: [
      { name: 'Old town cobblestones', group: 'Realistic', values: {} },
      { name: 'Granite setts', group: 'Realistic', values: { pattern: 'setts', cells: 7, ratio: 1.4, color1: '#8a8a8e', color2: '#5e5e64', joint: 2.5, round: 5, jointFill: 'dark', jointColor: JOINTS.dark } },
      { name: 'Fan cobbles (Bogenpflaster)', group: 'Realistic', values: { pattern: 'fan', cells: 8, rings: 5, ratio: 1.2, color1: '#8e8a84', color2: '#5a5650', joint: 2.2, round: 3, jointFill: 'dirt', jointColor: JOINTS.dirt } },
      { name: 'Herringbone brick pavers', group: 'Realistic', values: { pattern: 'herringbone', cells: 12, color1: '#a4583a', color2: '#7a3e28', joint: 2, round: 3, jointFill: 'sand', jointColor: JOINTS.sand, grain: 0.35, stains: 0.2 } },
      { name: 'Concrete sidewalk slabs', group: 'Realistic', values: { pattern: 'slabs', cells: 3, color1: '#b0ada6', color2: '#98958e', colorVar: 0.3, brightVar: 0.15, joint: 4, round: 2, dome: 0.1, jointFill: 'dirt', jointColor: '#4a443a', grain: 0.55, stains: 0.35 } },
      { name: 'Grass-jointed slabs', group: 'Realistic', values: { pattern: 'slabs', cells: 3, stagger: 0.5, color1: '#a8a49a', color2: '#8a867c', joint: 10, round: 3, jointFill: 'grass', jointColor: JOINTS.grass, moss: 0.35, stains: 0.15 } },
      { name: 'Hexagon pavers', group: 'Realistic', values: { pattern: 'hex', cells: 7, color1: '#8a8680', color2: '#6e6a62', joint: 3, round: 5 } },
      { name: 'Mossy forest path', group: 'Realistic', values: { pattern: 'cobble', cells: 6, color1: '#7a766c', color2: '#4e4a42', joint: 6, round: 12, jointFill: 'grass', jointColor: '#2e4a1a', moss: 0.65, polish: 0.05, stains: 0.1 } },
      { name: 'Wet cobblestones at night', group: 'Realistic', values: { color1: '#5a5854', color2: '#3a3834', wet: 0.8, polish: 0.5, jointFill: 'dark', jointColor: JOINTS.dark } },
      { name: 'Roman road', group: 'Realistic', values: { pattern: 'cobble', cells: 4, color1: '#9a9488', color2: '#6e6a60', joint: 4, round: 16, polish: 0.6, stains: 0.15, jointFill: 'dirt', jointColor: JOINTS.dirt } },
      { name: 'Red brick sidewalk', group: 'Realistic', values: { pattern: 'setts', cells: 9, ratio: 2, color1: '#a85a3c', color2: '#7a3a24', joint: 2, round: 2, jointFill: 'mortar', jointColor: JOINTS.mortar, dome: 0.25 } },
      { name: 'Cartoon cobbles', group: 'Stylized', values: { pattern: 'cobble', cells: 6, color1: '#b0a8c8', color2: '#8a80a8', colorVar: 0.5, grain: 0.05, joint: 6, round: 18, dome: 0.8, jointFill: 'dark', jointColor: '#2a2440', stains: 0, polish: 0 } },
      { name: 'Sci-fi deck hex', group: 'Sci-fi', values: { pattern: 'hex', cells: 5, color1: '#5a6470', color2: '#3e4650', colorVar: 0.3, grain: 0.15, joint: 3, round: 2, dome: 0.15, jointFill: 'dark', jointColor: '#0a0e12', stains: 0.1 } },
    ],
    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height), k = Math.min(W, H) / 512, seed = p.seed | 0;
      const pat = makePattern(p, W, H);
      const c1 = U.hex(p.color1), c2 = U.hex(p.color2), jc = U.hex(p.jointColor), moss = U.hex('#3e5a1e');
      const jw = (p.joint * k) / 2, rnd = Math.max(1, p.round * k);
      const ar = H / W, per = (f) => [f, Math.max(1, Math.round(f * ar))];
      const fb = (x, y, f, oct, s) => { const [a, b] = per(f); return U.fractal('perlin', (x / W) * a, (y / H) * b, a, b, oct, 0.5, 'fbm', seed + s); };
      U.pixels(ctx, W, H, (x, y, o) => {
        const px = x + 0.5, py = y + 0.5, st = pat(px, py), e = st.e - jw;
        const stone = smoothstep(-0.6, 0.6, e), domeT = smoothstep(0, rnd, e);
        const id = Math.floor(st.id * 1e6);
        // stone color
        const t = clamp(0.5 + (hash(id, 1, seed) - 0.5) * 2 * p.colorVar);
        const bv = 1 + (hash(id, 2, seed) - 0.5) * p.brightVar * 0.6;
        let r = lerp(c1[0], c2[0], t) * bv, g = lerp(c1[1], c2[1], t) * bv, b = lerp(c1[2], c2[2], t) * bv;
        const gr = p.grain > 0 ? (fb(px, py, 48, 3, 5) - 0.5) * p.grain * 0.5 + (hash(x, y, seed + 6) - 0.5) * p.grain * 0.12 : 0;
        const shade = (1 + gr) * (1 - p.dome * 0.35 * (1 - domeT)) * (1 + p.polish * 0.18 * domeT * fb(px, py, 6, 3, 7));
        r *= shade; g *= shade; b *= shade;
        // joints: fill color with grain; grass joints get speckled green
        let jr = jc[0], jg = jc[1], jb = jc[2];
        const jn = 0.75 + fb(px, py, 64, 2, 8) * 0.5;
        jr *= jn; jg *= jn; jb *= jn;
        if (p.jointFill === 'grass') { const blades = hash(x, y, seed + 9) > 0.5 ? 1.25 : 0.8; jr *= blades; jg *= blades; jb *= blades; }
        // moss creeps from the joints onto the stones
        if (p.moss > 0) {
          const mn = fb(px, py, 10, 4, 10), near = 1 - smoothstep(0, rnd * 2.5, e);
          const m = smoothstep(0.75 - p.moss * 0.5, 0.85 - p.moss * 0.45, mn * 0.6 + near * 0.6) * p.moss;
          r = lerp(r, moss[0], m); g = lerp(g, moss[1], m); b = lerp(b, moss[2], m);
        }
        if (p.stains > 0) {
          const s = smoothstep(0.55, 0.85, fb(px, py, 4, 4, 11)) * p.stains;
          r *= 1 - s * 0.45; g *= 1 - s * 0.45; b *= 1 - s * 0.42;
        }
        let R = lerp(jr, r, stone), G = lerp(jg, g, stone), B = lerp(jb, b, stone);
        if (p.wet > 0) {
          const l = (R + G + B) / 3, w = p.wet;
          R = lerp(R, (R - l) * 1.35 + l * 0.6, w); G = lerp(G, (G - l) * 1.35 + l * 0.6, w); B = lerp(B, (B - l) * 1.35 + l * 0.62, w);
        }
        if (height) { const h = stone * (0.55 + 0.45 * domeT) + gr * 0.2 * stone; o[0] = o[1] = o[2] = clamp(h) * 255; return; }
        o[0] = R; o[1] = G; o[2] = B;
      });
    },
  });
})();
