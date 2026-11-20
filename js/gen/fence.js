/* Fence: alpha-cutout fence and mesh textures. Chain-link (with over / under weave), welded square
   mesh, chicken wire (hexagonal), diagonal lattice, picket fence, metal railing (spear tips), horizontal
   slats and barbed wire. Wires are shaded as round tubes, boards get wood grain; rust / dirt noise.
   Meshes tile both ways, the rest tiles horizontally. Output: color + alpha, hard cutout (alpha 0 / 1
   for alpha testing) or a white-on-black mask. Sizes are px @ 512. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const MESH = new Set(['chainlink', 'weld', 'hex', 'lattice']);
  const isBoard = (p) => p.type === 'picket' || p.type === 'slats' || p.type === 'lattice';

  U.register({
    id: 'fence',
    name: 'Fence',
    desc: 'Alpha-cutout fences and meshes: chain-link, wire mesh, lattice, pickets, railings, slats and barbed wire',
    uses: ['Alpha-tested textures for fences, grates and railings in 3D environments, tiling along long fence runs.', 'Foreground silhouettes and parallax layers in 2D side-scrollers.'],
    tags: ['Texturing', 'Decals', 'Military'],
    normalMap: true,
    heightMap: true, // wires as round tubes, boards with beveled edges
    icon: U.icon('<path d="M5 21V7l1.5-2L8 7v14M11 21V7l1.5-2L14 7v14M17 21V7l1.5-2L20 7v14"/><path d="M3 10h18M3 17h18"/>'),
    params: [
      { type: 'section', label: 'Fence' },
      { key: 'type', label: 'Type', type: 'select', default: 'chainlink', options: [['chainlink', 'Chain-link'], ['weld', 'Welded square mesh'], ['hex', 'Chicken wire (hex)'], ['lattice', 'Diagonal lattice'], ['picket', 'Picket fence'], ['railing', 'Metal railing'], ['slats', 'Horizontal slats'], ['barbed', 'Barbed wire']] },
      { key: 'cells', label: 'Cells across', type: 'int', min: 1, max: 80, default: 10, tip: 'Mesh openings / boards / bars across the texture (exact, so it tiles horizontally)' },
      { key: 'thick', label: 'Wire / bar thickness', type: 'range', min: 0.5, max: 60, step: 0.25, default: 4, tip: 'px @ 512' },
      { key: 'fill', label: 'Board width', type: 'range', min: 0.1, max: 0.98, step: 0.01, default: 0.72, show: (p) => p.type === 'picket' || p.type === 'slats', tip: 'Fraction of the spacing covered by a board' },
      { key: 'top', label: 'Picket tops', type: 'select', default: 'point', options: [['point', 'Pointed'], ['round', 'Round'], ['dog', 'Dog-ear'], ['flat', 'Flat']], show: (p) => p.type === 'picket' },
      { key: 'topY', label: 'Top height', type: 'range', min: 0, max: 0.6, step: 0.005, default: 0.06, show: (p) => p.type === 'picket' || p.type === 'railing', tip: 'Free space above the fence (fraction of the height)' },
      { key: 'rails', label: 'Rails', type: 'int', min: 0, max: 4, default: 2, show: (p) => p.type === 'picket' || p.type === 'railing' },
      { key: 'railW', label: 'Rail thickness', type: 'range', min: 2, max: 80, step: 0.5, default: 18, show: (p) => (p.type === 'picket' || p.type === 'railing') && p.rails > 0, tip: 'px @ 512' },
      { key: 'spears', label: 'Spear tips', type: 'bool', default: true, show: (p) => p.type === 'railing' },
      { key: 'strands', label: 'Strands', type: 'int', min: 1, max: 8, default: 3, show: (p) => p.type === 'barbed' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 3 },
      { type: 'section', label: 'Color' },
      { key: 'color', label: 'Color', type: 'color', default: '#9aa0a4' },
      { key: 'color2', label: 'Second color', type: 'color', default: '#6a6e72', tip: 'Shading / wood grain / variation' },
      { key: 'shade', label: 'Tube / edge shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6 },
      { key: 'rust', label: 'Rust / weathering', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15 },
      { key: 'rustColor', label: 'Rust color', type: 'color', default: '#7a3e1a', show: (p) => p.rust > 0 },
      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'cutout', options: [['cutout', 'Hard cutout (alpha 0 / 1)'], ['alpha', 'Color + soft alpha'], ['mask', 'Mask (white on black)']], tip: 'Hard cutout: every pixel is fully opaque or fully transparent, ready for alpha testing' },
      { key: 'cutoff', label: 'Cutoff', type: 'range', min: 0.05, max: 0.95, step: 0.01, default: 0.5, show: (p) => p.output === 'cutout' },
    ],
    presets: [
      { name: 'Chain-link (galvanized)', group: 'Realistic', values: {} },
      { name: 'Chain-link (rusty)', group: 'Realistic', values: { color: '#8a7a6a', color2: '#5a4a3a', rust: 0.7, thick: 4.5 } },
      { name: 'Chain-link (green coated)', group: 'Realistic', values: { color: '#3a6a3a', color2: '#1e3e1e', rust: 0, thick: 5 } },
      { name: 'Welded wire mesh', group: 'Realistic', values: { type: 'weld', cells: 8, thick: 4, color: '#a8acae', color2: '#6a6e70', rust: 0.1 } },
      { name: 'Fine grate', group: 'Realistic', values: { type: 'weld', cells: 24, thick: 3, color: '#5a5e62', color2: '#2a2e32' } },
      { name: 'Chicken wire', group: 'Realistic', values: { type: 'hex', cells: 12, thick: 2.2, color: '#b0b4b6', color2: '#70767a', rust: 0.2 } },
      { name: 'Garden lattice', group: 'Realistic', values: { type: 'lattice', cells: 5, thick: 26, color: '#c8b08a', color2: '#8a6a44', rust: 0, shade: 0.4 } },
      { name: 'White picket fence', group: 'Realistic', values: { type: 'picket', cells: 7, fill: 0.62, top: 'point', topY: 0.08, rails: 2, railW: 22, color: '#f2f0ea', color2: '#c8c4ba', rust: 0.1, rustColor: '#8a8070', shade: 0.35 } },
      { name: 'Weathered wooden fence', group: 'Realistic', values: { type: 'picket', cells: 6, fill: 0.86, top: 'dog', topY: 0.04, rails: 2, railW: 26, color: '#9a8a72', color2: '#5a4a38', rust: 0.35, rustColor: '#3a3a2a', shade: 0.45 } },
      { name: 'Privacy slats', group: 'Realistic', values: { type: 'slats', cells: 9, fill: 0.85, color: '#8a6040', color2: '#5a3a22', rust: 0.1, rustColor: '#3a2a1a', shade: 0.4 } },
      { name: 'Wrought iron railing', group: 'Realistic', values: { type: 'railing', cells: 10, thick: 9, topY: 0.08, rails: 2, railW: 14, spears: true, color: '#2a2a2c', color2: '#0e0e10', rust: 0.15 } },
      { name: 'Park railing (green)', group: 'Realistic', values: { type: 'railing', cells: 8, thick: 12, topY: 0.1, rails: 3, railW: 12, spears: false, color: '#2e5a3a', color2: '#16301e', rust: 0.1 } },
      { name: 'Barbed wire', group: 'Realistic', values: { type: 'barbed', strands: 3, cells: 6, thick: 4.5, color: '#8a8a86', color2: '#4a4a46', rust: 0.35 } },
      { name: 'Dense security mesh', group: 'Realistic', values: { type: 'chainlink', cells: 18, thick: 3.5, color: '#9a9ea0', rust: 0.25 } },
      { name: 'Cartoon picket', group: 'Stylized', values: { type: 'picket', cells: 5, fill: 0.7, top: 'round', topY: 0.12, rails: 2, railW: 30, color: '#ffffff', color2: '#b8c8e0', shade: 0.6, rust: 0 } },
      { name: 'Sci-fi energy grate', group: 'Sci-fi', values: { type: 'hex', cells: 10, thick: 4, color: '#7af0ff', color2: '#1a6a8a', rust: 0, shade: 0.8 } },
    ],
    render(ctx, W, H, p, opts) {
      const height = !!(opts && opts.height);
      const k = Math.min(W, H) / 512, seed = p.seed | 0, n = Math.max(1, p.cells);
      const sx = W / n, mesh = MESH.has(p.type);
      const ny = mesh ? Math.max(1, Math.round(H / sx)) : 1, sy = mesh ? H / ny : H; // mesh: square-ish cells that tile vertically
      const hw = (p.thick * k) / 2;
      const c1 = U.hex(p.color), c2 = U.hex(p.color2), rc = U.hex(p.rustColor);
      const noise = (x, y, f, s) => U.fractal('perlin', (x / W) * f, (y / H) * Math.max(1, Math.round((f * H) / W)), f, Math.max(1, Math.round((f * H) / W)), 4, 0.5, 'fbm', seed + s);
      const cov = (d, w) => clamp(w - d + 0.5); // anti-aliased coverage of a band of half-width w
      const tube = (d, w) => Math.sqrt(clamp(1 - (d / Math.max(0.5, w)) ** 2)); // 1 on the wire's center line
      // hex grid sized so whole 2-column periods (3R) fit the width and whole rows (sqrt3 R) the height
      const hm = Math.max(1, Math.round(n / Math.sqrt(3))), R = W / (3 * hm), hRows = Math.max(1, Math.round(H / (Math.sqrt(3) * R))), hyScale = (hRows * Math.sqrt(3) * R) / H;
      const hex = (x, y) => {
        // flat-top hex grid with circumradius R; returns distance to the nearest cell edge
        const qx = x / (1.5 * R);
        const col = Math.floor(qx), cands = [col - 1, col, col + 1];
        let best = 1e9, second = 1e9;
        for (const c of cands) for (const dr of [-1, 0, 1]) {
          const cx = c * 1.5 * R, cy = (Math.floor(y / (Math.sqrt(3) * R) - (c % 2 ? 0.5 : 0)) + dr + (c % 2 ? 0.5 : 0)) * Math.sqrt(3) * R;
          const d = Math.hypot(x - cx, y - cy);
          if (d < best) { second = best; best = d; } else if (d < second) second = d;
        }
        return (second - best) / 2;
      };
      U.pixels(ctx, W, H, (x, y, o) => {
        const px = x + 0.5, py = y + 0.5;
        let a = 0, light = 1, grain = 0.5, wood = false, hgt = -1; // hgt: surface height 0..1 (default: from light)
        switch (p.type) {
          case 'chainlink': {
            // two diamond wire families; at crossings one runs over the other (alternating weave)
            const u = px / sx, v = py / sy;
            const d1 = Math.abs(U.mod(u + v + 0.5, 1) - 0.5) * sx * 0.7071, d2 = Math.abs(U.mod(u - v + 0.5, 1) - 0.5) * sx * 0.7071;
            const a1 = cov(d1, hw), a2 = cov(d2, hw);
            const over1 = (Math.floor(u + v + 0.5) + Math.floor(u - v + 0.5)) % 2 === 0;
            const top = over1 ? [a1, d1] : [a2, d2], bot = over1 ? [a2, d2] : [a1, d1];
            a = Math.max(a1, a2);
            light = top[0] > 0.01 ? tube(top[1], hw) : tube(bot[1], hw) * (top[0] > 0 ? 1 : 0.85);
            break;
          }
          case 'weld': {
            const dx = Math.abs(U.mod(px / sx + 0.5, 1) - 0.5) * sx, dy = Math.abs(U.mod(py / sy + 0.5, 1) - 0.5) * sy;
            a = Math.max(cov(dx, hw), cov(dy, hw));
            light = Math.max(dx < hw ? tube(dx, hw) : 0, dy < hw ? tube(dy, hw) : 0);
            if (dx < hw && dy < hw) light *= 0.85; // weld nodes
            break;
          }
          case 'hex': {
            const d = hex(U.mod(px, W), U.mod(py * hyScale, hRows * Math.sqrt(3) * R));
            a = cov(d, hw); light = tube(d, hw);
            break;
          }
          case 'lattice': {
            const u = px / sx, v = py / sy;
            const d1 = Math.abs(U.mod(u + v + 0.5, 1) - 0.5) * sx * 0.7071, d2 = Math.abs(U.mod(u - v + 0.5, 1) - 0.5) * sx * 0.7071;
            const a1 = cov(d1, hw), a2 = cov(d2, hw);
            a = Math.max(a1, a2); wood = true;
            const onTop = a1 >= a2 ? d1 : d2;
            light = 1 - p.shade * 0.4 * smoothstep(hw * 0.6, hw, onTop);
            hgt = (a1 >= a2 ? 0.8 : 1) * (0.7 + 0.3 * (1 - smoothstep(hw * 0.5, hw, onTop))); // slats cross over each other
            grain = U.fractal('perlin', (a1 >= a2 ? (u - v) : (u + v)) * 6, onTop / sx * 30, 0, 0, 3, 0.5, 'fbm', seed + 4);
            break;
          }
          case 'picket': {
            const lx = U.mod(px / sx, 1) - 0.5, bw = p.fill * 0.5, top0 = p.topY * H;
            const edge = (bw - Math.abs(lx)) * sx; // px to the board side
            let topLine = top0 + bw * sx; // where the straight part starts
            let inTop = 1;
            const ax = Math.abs(lx) / bw; // 0 center .. 1 edge
            if (p.top === 'point') inTop = cov(top0 + ax * bw * sx * 1.1 - py, 0);
            else if (p.top === 'round') inTop = cov(top0 + bw * sx * (1 - Math.sqrt(clamp(1 - ax * ax))) - py, 0);
            else if (p.top === 'dog') inTop = cov(top0 + Math.max(0, ax - 0.55) * bw * sx * 1.4 - py, 0);
            else inTop = cov(top0 - py, 0);
            const board = Math.min(cov(-edge, 0), inTop); // inside the board's width and below its top line
            // rails behind the boards
            let rail = 0;
            for (let i = 0; i < p.rails; i++) {
              const ry = top0 + bw * sx * 2 + ((H - top0 - bw * sx * 2) * (i + 0.5)) / Math.max(1, p.rails);
              rail = Math.max(rail, cov(Math.abs(py - ry), p.railW * k * 0.5));
            }
            a = Math.max(board, rail); wood = true;
            light = board > 0.01 ? 1 - p.shade * 0.45 * (1 - smoothstep(0, 3 * k, edge)) : 0.7;
            hgt = board > 0.01 ? 0.75 + 0.25 * smoothstep(0, 4 * k, edge) : 0.55; // rails sit behind the boards
            grain = U.fractal('perlin', (px / sx) * 4, (py / H) * 0.6, n * 4, 0, 3, 0.5, 'fbm', seed + 5);
            void topLine;
            break;
          }
          case 'railing': {
            const lx = (U.mod(px / sx, 1) - 0.5) * sx, top0 = p.topY * H;
            // bars run up into the spear heads, so the tips never float
            const barTop = p.spears ? top0 - hw * 4 : top0;
            const bar = Math.min(cov(Math.abs(lx), hw), cov(barTop - py, 0));
            let tip = 0;
            if (p.spears) {
              // spear head above the top: a diamond around the bar's top end
              const sy0 = top0 - hw * 4, d = Math.abs(lx) / (hw * 2.2) + Math.abs(py - sy0) / (hw * 4);
              tip = clamp((1 - d) * hw * 2);
            }
            let rail = 0;
            for (let i = 0; i < p.rails; i++) {
              // rails evenly from just below the top to the bottom
              const rh = p.railW * k * 0.5, y0 = top0 + hw * 3 + rh, y1 = H - rh;
              const ry = p.rails === 1 ? (y0 + y1) / 2 : y0 + ((y1 - y0) * i) / (p.rails - 1);
              rail = Math.max(rail, cov(Math.abs(py - ry), rh));
            }
            a = Math.max(bar, tip, rail);
            light = bar >= rail ? tube(Math.abs(lx), hw) : 0.85;
            break;
          }
          case 'slats': {
            const rows = n, lv = U.mod(py / (H / rows), 1) - 0.5, bw = p.fill * 0.5;
            const edge = (bw - Math.abs(lv)) * (H / rows);
            a = cov(-edge, 0); wood = true;
            light = 1 - p.shade * 0.45 * (1 - smoothstep(0, 3 * k, edge));
            hgt = 0.6 + 0.4 * smoothstep(0, 4 * k, edge);
            grain = U.fractal('perlin', (px / W) * 2, (py / H) * rows * 4, 2, rows * 4, 3, 0.5, 'fbm', seed + 6);
            break;
          }
          case 'barbed': {
            const rows = Math.max(1, p.strands), band = H / rows, ly = U.mod(py, band) - band / 2;
            const per = W / Math.max(1, n * 3), ph = (px / per) * U.TAU;
            const w1 = Math.sin(ph) * hw * 1.2, w2 = -Math.sin(ph) * hw * 1.2;
            const d1 = Math.abs(ly - w1), d2 = Math.abs(ly - w2);
            a = Math.max(cov(d1, hw), cov(d2, hw));
            light = tube(Math.min(d1, d2), hw);
            // barbs: short twisted spikes every few periods
            const bx = U.mod(px, W / n) - W / n / 2;
            // barbs: four short spikes in an X around each barb point
            const bl = hw * 10;
            if (Math.abs(bx) < bl) {
              for (const s of [-1, 1]) {
                const dd = Math.abs(ly - s * bx * 1.1) * 0.67;
                const c = cov(dd, hw * 0.75) * (1 - smoothstep(bl * 0.7, bl, Math.abs(bx)));
                if (c > a) { a = c; light = 0.9; }
              }
            }
            break;
          }
        }
        if (height) {
          const hv = hgt >= 0 ? hgt : 0.25 + 0.75 * light;
          o[0] = o[1] = o[2] = U.clamp(a) * hv * 255; o[3] = 255;
          return;
        }
        if (a <= 0.001) { o[3] = 0; if (p.output === 'mask') { o[0] = o[1] = o[2] = 0; o[3] = 255; } return; }
        // color: tube / edge light, wood grain, rust
        let r, g, b;
        if (wood) { const t = clamp(0.5 + (grain - 0.5) * 1.6); r = lerp(c2[0], c1[0], t); g = lerp(c2[1], c1[1], t); b = lerp(c2[2], c1[2], t); }
        else { r = c1[0]; g = c1[1]; b = c1[2]; }
        const L = lerp(1, 0.45 + 0.75 * light, p.shade);
        const dk = lerp(1, light, 0.3);
        r = lerp(c2[0], r, dk) * L; g = lerp(c2[1], g, dk) * L; b = lerp(c2[2], b, dk) * L;
        if (p.rust > 0) {
          const rn = smoothstep(0.55 - p.rust * 0.3, 0.75 - p.rust * 0.2, noise(px, py, 8, 7)) * p.rust;
          r = lerp(r, rc[0], rn); g = lerp(g, rc[1], rn); b = lerp(b, rc[2], rn);
        }
        if (p.output === 'mask') { o[0] = o[1] = o[2] = a * 255; o[3] = 255; return; }
        o[0] = r; o[1] = g; o[2] = b;
        o[3] = p.output === 'cutout' ? (a >= p.cutoff ? 255 : 0) : a * 255;
      });
    },
  });
})();
