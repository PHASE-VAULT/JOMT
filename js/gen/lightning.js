/* Lightning: midpoint-displaced main bolt(s) with recursive branches, core + glow.
   Optional "flow" output bakes travel time into the alpha (or a channel): the base of the bolt is 1
   and the ends of the branches are 0, so stepping an alpha-clip threshold in a shader grows the bolt.

   Rendering: core strokes at full resolution, glow blurred at a reduced resolution, flow stamped
   into a low-res float grid; the three are combined per pixel at the end. */
(function () {
  'use strict';
  const U = window.UGTG;

  const isFlow = (p) => p.output === 'flowAlpha' || p.output === 'packed' || p.output === 'flowMask';

  /* midpoint displacement between a and b; offsets are perpendicular to each sub-segment */
  function bolt(a, b, levels, chaos, rough, r) {
    let pts = [a, b];
    let d = Math.hypot(b[0] - a[0], b[1] - a[1]) * chaos;
    for (let l = 0; l < levels; l++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1];
        const dx = p1[0] - p0[0], dy = p1[1] - p0[1], len = Math.hypot(dx, dy) || 1;
        const off = (r() - 0.5) * d;
        out.push([(p0[0] + p1[0]) / 2 - (dy / len) * off, (p0[1] + p1[1]) / 2 + (dx / len) * off], p1);
      }
      pts = out;
      d *= rough;
    }
    return pts;
  }

  U.register({
    id: 'lightning',
    name: 'Lightning',
    desc: 'Branching lightning bolts with glow and an optional baked flow alpha for animating the strike',
    tags: ['VFX', 'Sci-fi'],
    bg: 'black',
    icon: U.icon('<path d="M13 2L7 12h4l-3 10 9-13h-5l3-7z"/>'),
    params: [
      { type: 'section', label: 'Bolt' },
      { key: 'startX', label: 'Start X', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'startY', label: 'Start Y', type: 'range', min: 0, max: 1, step: 0.01, default: 0.02 },
      { key: 'endX', label: 'End X', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'endY', label: 'End Y', type: 'range', min: 0, max: 1, step: 0.01, default: 0.98 },
      { key: 'bolts', label: 'Main bolts', type: 'int', min: 1, max: 6, default: 1 },
      { key: 'endSpread', label: 'End spread', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => p.bolts > 1, tip: 'How far apart the ends of several main bolts land' },
      { key: 'detail', label: 'Detail', type: 'int', min: 2, max: 10, default: 8, tip: 'Subdivision levels' },
      { key: 'chaos', label: 'Chaos', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Sideways displacement relative to the bolt length' },
      { key: 'rough', label: 'Roughness', type: 'range', min: 0.3, max: 0.8, step: 0.01, default: 0.55, tip: 'How much fine zig-zag survives at the small scales' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },
      { type: 'section', label: 'Branches' },
      { key: 'branches', label: 'Branches', type: 'range', min: 0, max: 30, step: 0.5, default: 7, tip: 'Average branch count on a main bolt' },
      { key: 'branchDepth', label: 'Branch levels', type: 'int', min: 1, max: 4, default: 2, show: (p) => p.branches > 0 },
      { key: 'branchDecay', label: 'Sub-branch amount', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.5, show: (p) => p.branches > 0 && p.branchDepth > 1 },
      { key: 'branchLen', label: 'Branch length', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.4, show: (p) => p.branches > 0, tip: 'Relative to the rest of the parent bolt' },
      { key: 'branchAngle', label: 'Branch angle', type: 'range', min: 5, max: 90, step: 1, default: 32, show: (p) => p.branches > 0 },
      { key: 'branchWidth', label: 'Branch width', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.55, show: (p) => p.branches > 0 },
      { key: 'branchBright', label: 'Branch brightness', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.75, show: (p) => p.branches > 0 },
      { type: 'section', label: 'Shape & glow' },
      { key: 'width', label: 'Core width', type: 'range', min: 0.3, max: 20, step: 0.1, default: 3, tip: 'px @ 512' },
      { key: 'tipWidth', label: 'Width at ends', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'fade', label: 'Fade toward ends', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 2, step: 0.01, default: 1 },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 1, max: 80, step: 0.5, default: 16, show: (p) => p.glow > 0, tip: 'px @ 512' },
      { type: 'section', label: 'Color' },
      { key: 'cCore', label: 'Core', type: 'color', default: '#ffffff' },
      { key: 'cMid', label: 'Mid', type: 'color', default: '#d6d6d6' },
      { key: 'cOuter', label: 'Outer glow', type: 'color', default: '#8a8a8a' },
      { type: 'section', label: 'Output & flow' },
      {
        key: 'output', label: 'Output', type: 'select', default: 'color',
        tip: 'Flow in alpha: PNG stores color with less precision where alpha is low, and drops it at alpha 0. Use Packed for exact data.',
        options: [
          ['color', 'Color, transparent background'],
          ['black', 'Color on black (additive)'],
          ['flowAlpha', 'Color on black + flow in alpha'],
          ['packed', 'Packed: R intensity, G flow'],
          ['flowMask', 'Flow only (grayscale)'],
        ],
      },
      { key: 'flowNorm', label: 'Flow reaches 0 at', type: 'select', default: 'distance', show: isFlow, options: [['distance', 'Farthest tip (constant speed)'], ['tips', 'Every branch tip']], tip: 'Farthest tip: the value drops evenly with distance travelled from the base, so the strike grows at one speed. Every branch tip: each branch fades to 0 at its own end.' },
      { key: 'flowCurve', label: 'Flow curve', type: 'range', min: 0.2, max: 4, step: 0.01, default: 1, show: isFlow, tip: '< 1 spends more of the 0..1 range near the base, > 1 near the tips' },
      { key: 'flowInvert', label: 'Invert flow (base 0, tips 1)', type: 'bool', default: false, show: isFlow },
      { key: 'reveal', label: 'Preview reveal', type: 'range', min: 0, max: 1, step: 0.005, default: 1, tip: 'Preview only (not exported): shows the bolt as far as it has grown at this animation progress, like an alpha clip at 1 − progress' },
    ],
    presets: [
      // Realistic
      { name: 'Storm bolt', group: 'Realistic', values: { startX: 0.45, endX: 0.55, chaos: 0.3, branches: 9, branchLen: 0.35, width: 1.75, glowSize: 11 } },
      { name: 'Cloud-to-ground (many branches)', group: 'Realistic', values: { startX: 0.4, startY: 0, endX: 0.6, chaos: 0.32, detail: 9, branches: 22, branchDepth: 3, branchDecay: 0.7, branchLen: 0.45, branchAngle: 35, branchWidth: 0.5, branchBright: 0.6, width: 1.5, fade: 0.2, glowSize: 10, seed: 11 } },
      { name: 'Forked strike', group: 'Realistic', values: { startX: 0.5, bolts: 3, endSpread: 0.6, chaos: 0.3, branches: 5, width: 1.5, glowSize: 9, seed: 23 } },
      { name: 'Distant bolt (faint)', group: 'Realistic', values: { startX: 0.35, startY: 0.05, endX: 0.6, endY: 0.95, chaos: 0.25, branches: 4, width: 1.2, tipWidth: 0.5, fade: 0.5, glow: 0.6, glowSize: 30 } },
      { name: 'Anvil crawler (horizontal)', group: 'Realistic', values: { startX: 0.02, startY: 0.35, endX: 0.98, endY: 0.45, chaos: 0.25, branches: 18, branchDepth: 3, branchDecay: 0.7, branchLen: 0.3, branchAngle: 45, branchWidth: 0.6, width: 1.25, fade: 0.15, glowSize: 12, seed: 5 } },
      { name: 'Electric spark arc', group: 'Realistic', values: { startX: 0.15, startY: 0.5, endX: 0.85, endY: 0.5, detail: 7, chaos: 0.22, rough: 0.65, branches: 3, branchLen: 0.15, width: 1, tipWidth: 0.8, fade: 0, glowSize: 6 } },
      { name: 'Static discharge', group: 'Realistic', values: { startX: 0.3, startY: 0.45, endX: 0.7, endY: 0.55, detail: 6, chaos: 0.5, rough: 0.7, branches: 6, branchLen: 0.5, branchAngle: 50, width: 1.2, glowSize: 8 } },
      { name: 'Storm strike (flow alpha)', group: 'Realistic', values: { chaos: 0.33, branches: 14, branchDepth: 3, branchDecay: 0.6, width: 1.5, glowSize: 9, seed: 31, output: 'flowAlpha', reveal: 0.7 } },
      // Stylized
      { name: 'Cartoon zig-zag', group: 'Stylized', values: { startX: 0.42, endX: 0.58, detail: 3, chaos: 0.9, rough: 0.55, branches: 0, width: 20, tipWidth: 0.15, fade: 0, glow: 0.6, glowSize: 16, seed: 2 } },
      { name: 'Comic bolt', group: 'Stylized', values: { startX: 0.4, endX: 0.6, detail: 4, chaos: 0.55, rough: 0.45, branches: 3, branchDepth: 1, branchLen: 0.35, branchAngle: 40, branchWidth: 0.6, branchBright: 1, width: 18, tipWidth: 0.2, fade: 0, glow: 0.7, glowSize: 12, seed: 8 } },
      { name: 'Anime thin bolts', group: 'Stylized', values: { startX: 0.3, startY: 0, endX: 0.65, bolts: 3, endSpread: 0.5, detail: 8, chaos: 0.25, rough: 0.45, branches: 3, width: 1, tipWidth: 0.1, fade: 0, glow: 0.7, glowSize: 6 } },
      { name: 'Pixel-friendly bolt', group: 'Stylized', values: { startX: 0.4, endX: 0.6, detail: 3, chaos: 0.5, rough: 0.5, branches: 1, branchDepth: 1, branchLen: 0.35, branchWidth: 0.7, width: 20, tipWidth: 0.6, fade: 0, glow: 0 } },
      { name: 'Neon sign bolt', group: 'Stylized', values: { startX: 0.35, startY: 0.08, endX: 0.65, endY: 0.92, detail: 3, chaos: 0.6, rough: 0.4, branches: 0, width: 8, tipWidth: 1, fade: 0, glow: 1.5, glowSize: 30 } },
      // Game-inspired
      { name: 'Diablo-style chain lightning', group: 'Game-inspired', values: { startX: 0.03, startY: 0.5, endX: 0.97, endY: 0.5, detail: 8, chaos: 0.4, rough: 0.6, branches: 10, branchDepth: 2, branchLen: 0.15, branchAngle: 50, width: 1.05, fade: 0.1, glowSize: 4.9 } },
      { name: 'BioShock-style shock bolt', group: 'Game-inspired', values: { startX: 0.05, startY: 0.55, endX: 0.95, endY: 0.45, bolts: 3, endSpread: 0.3, chaos: 0.3, branches: 6, branchLen: 0.3, width: 1.25, glowSize: 9, seed: 9, output: 'flowAlpha' } },
      { name: 'Dota-style god strike', group: 'Game-inspired', values: { chaos: 0.22, branches: 12, branchDepth: 2, branchLen: 0.25, width: 4.5, tipWidth: 0.5, fade: 0.1, glow: 1.6, glowSize: 20 } },
      // Sci-fi
      { name: 'Force lightning', group: 'Sci-fi', values: { startX: 0.05, startY: 0.5, endX: 0.95, endY: 0.5, bolts: 4, endSpread: 0.5, detail: 8, chaos: 0.3, rough: 0.6, branches: 3, branchLen: 0.25, width: 1, fade: 0.25, glowSize: 8, seed: 17 } },
      { name: 'Tesla coil', group: 'Sci-fi', values: { startX: 0.5, startY: 0.9, endX: 0.5, endY: 0.1, bolts: 5, endSpread: 1, detail: 7, chaos: 0.45, rough: 0.6, branches: 3, branchLen: 0.25, branchAngle: 45, width: 1.5, fade: 0.4, glowSize: 10, seed: 3, output: 'flowAlpha' } },
      { name: 'Arc weapon beam (packed)', group: 'Sci-fi', values: { startX: 0, startY: 0.5, endX: 1, endY: 0.5, bolts: 2, endSpread: 0.08, detail: 9, chaos: 0.12, rough: 0.7, branches: 6, branchLen: 0.08, branchAngle: 60, width: 1.05, tipWidth: 0.8, fade: 0, glow: 1.4, glowSize: 7, output: 'packed' } },
      { name: 'Plasma discharge', group: 'Sci-fi', values: { startX: 0.2, startY: 0.2, endX: 0.8, endY: 0.8, detail: 7, chaos: 0.5, rough: 0.5, branches: 8, branchLen: 0.35, width: 6, tipWidth: 0.2, glow: 1.5, glowSize: 36 } },
      { name: 'Corrupted lightning', group: 'Sci-fi', values: { chaos: 0.4, rough: 0.65, branches: 16, branchDepth: 3, branchDecay: 0.8, branchAngle: 50, width: 1.5, glowSize: 11, seed: 19, output: 'flowAlpha' } },
      { name: 'Ion storm', group: 'Sci-fi', values: { startX: 0.5, startY: 0, bolts: 4, endSpread: 0.9, chaos: 0.35, branches: 8, branchDepth: 2, width: 2.2, glowSize: 26, seed: 41 } },
    ],
    render(ctx, W, H, p, opts) {
      const S = Math.min(W, H), k = S / 512;
      const rnd = U.rng(p.seed), brnd = U.rng(p.seed * 131 + 17);
      const levels = Math.round(p.detail);
      const wMain = p.width * k, glowR = p.glowSize * k;

      /* ---- build paths: { pts, s (distance from the strike origin), local, L, f0, depth } ---- */
      const paths = [];
      const addPath = (pts, s0, f0, depth) => {
        const s = [s0], local = [0];
        for (let i = 1; i < pts.length; i++) {
          const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          s.push(s[i - 1] + d);
          local.push(local[i - 1] + d);
        }
        const path = { pts, s, local, L: local[local.length - 1] || 1, f0, depth };
        paths.push(path);
        return path;
      };
      const tipFlow = (path, i) => path.f0 * (1 - path.local[i] / path.L);

      // main bolts first (own RNG), so branch settings don't reshuffle the main shape
      const start = [p.startX * W, p.startY * H];
      const mains = [];
      for (let b = 0; b < p.bolts; b++) {
        const off = p.bolts > 1 ? (b / (p.bolts - 1) - 0.5 + (rnd() - 0.5) * 0.3) * p.endSpread : 0;
        const ex = p.endX * W + off * W, ey = p.endY * H + (p.bolts > 1 ? (rnd() - 0.5) * 0.1 * p.endSpread * H : 0);
        mains.push(addPath(bolt(start, [ex, ey], levels, p.chaos, p.rough, rnd), 0, 1, 0));
      }
      const mainL = mains[0].L;

      const spawn = (parent) => {
        if (parent.depth >= p.branchDepth || p.branches <= 0) return;
        const expected = p.branches * Math.pow(p.branchDecay, parent.depth) * (parent.L / mainL);
        const n = Math.floor(expected + brnd());
        const pts = parent.pts, N = pts.length;
        for (let j = 0; j < n; j++) {
          const i = Math.max(1, Math.min(N - 2, Math.floor((0.04 + brnd() * 0.82) * (N - 1))));
          const a = pts[i - 1], c = pts[i + 1];
          const side = brnd() < 0.5 ? -1 : 1;
          const heading = Math.atan2(c[1] - a[1], c[0] - a[0]) + side * ((p.branchAngle * Math.PI) / 180) * (0.6 + 0.8 * brnd());
          const len = (parent.L - parent.local[i]) * p.branchLen * (0.4 + 0.6 * brnd());
          if (len < 3 * k) continue;
          const end = [pts[i][0] + Math.cos(heading) * len, pts[i][1] + Math.sin(heading) * len];
          const bp = bolt(pts[i], end, Math.max(2, levels - 1 - parent.depth), p.chaos, p.rough, brnd);
          const child = addPath(bp, parent.s[i], tipFlow(parent, i), parent.depth + 1);
          spawn(child);
        }
      };
      for (const m of mains) spawn(m);

      let sMax = 0;
      for (const path of paths) sMax = Math.max(sMax, path.s[path.s.length - 1]);
      const flowAt = p.flowNorm === 'tips' ? tipFlow : (path, i) => 1 - path.s[i] / (sMax || 1);

      /* ---- rasterize ----
         core: full-res strokes, each path as a few polyline chunks (dim, deep branches first, so the
         main bolt ends on top). glow: the same strokes drawn into a downscaled canvas, blurred there
         and sampled bilinearly. flow: a low-res float grid where every path point stamps its flow
         (max), so no wide strokes or 8-bit flow are needed. */
      const CH = 6; // segments per stroke chunk
      const core = U.canvas(W, H), cc = core.getContext('2d');
      cc.fillStyle = '#000';
      cc.fillRect(0, 0, W, H);
      cc.lineCap = cc.lineJoin = 'round';
      const glowOn = p.glow > 0;
      const gs = glowOn ? U.clamp(glowR / 4, 1, 8) : 1; // glow downscale factor
      const GW = Math.max(1, Math.ceil(W / gs)), GH = Math.max(1, Math.ceil(H / gs));
      const gsrc = glowOn ? U.canvas(GW, GH) : null, gc = gsrc && gsrc.getContext('2d');
      if (gc) {
        gc.fillStyle = '#000';
        gc.fillRect(0, 0, GW, GH);
        gc.lineCap = gc.lineJoin = 'round';
        gc.scale(1 / gs, 1 / gs);
      }
      const stroke = (c, pts, a, b, width, style) => {
        c.strokeStyle = style;
        c.lineWidth = width;
        c.beginPath();
        c.moveTo(pts[a][0], pts[a][1]);
        for (let i = a + 1; i <= b; i++) c.lineTo(pts[i][0], pts[i][1]);
        c.stroke();
      };

      // flow grid
      const cell = Math.max(1, S / 256), FW = Math.ceil(W / cell) + 1, FH = Math.ceil(H / cell) + 1;
      const flow = new Float32Array(FW * FH);
      const stamp = (x, y, r, v) => {
        const cx = x / cell, cy = y / cell, rr = r / cell;
        const x0 = Math.max(0, Math.floor(cx - rr)), x1 = Math.min(FW - 1, Math.ceil(cx + rr));
        const y0 = Math.max(0, Math.floor(cy - rr)), y1 = Math.min(FH - 1, Math.ceil(cy + rr));
        for (let yy = y0; yy <= y1; yy++) {
          for (let xx = x0; xx <= x1; xx++) {
            if ((xx - cx) ** 2 + (yy - cy) ** 2 > rr * rr) continue;
            const o = yy * FW + xx;
            if (v > flow[o]) flow[o] = v;
          }
        }
      };

      const order = paths.slice().sort((a, b) => b.depth - a.depth);
      for (const path of order) {
        const { pts } = path, N = pts.length;
        const w0 = wMain * Math.pow(p.branchWidth, path.depth), bright = Math.pow(p.branchBright, path.depth);
        for (let i = 0; i < N - 1; i += CH) {
          const e = Math.min(N - 1, i + CH);
          const t = (path.local[i] + path.local[e]) / 2 / path.L;
          const w = Math.max(0.35, w0 * U.lerp(1, p.tipWidth, t));
          const v = Math.round(255 * bright * (1 - p.fade * t));
          const style = `rgb(${v},${v},${v})`;
          stroke(cc, pts, i, e, w, style);
          if (gc) stroke(gc, pts, i, e, w + glowR * 1.2 * (w / wMain), style);
        }
        // flow covers the core plus the visible part of the glow
        const cover = w0 / 2 + (glowOn ? glowR * 0.8 : 0) + 1.5;
        let lx = -1e9, ly = -1e9;
        for (let i = 0; i < N; i++) {
          const [x, y] = pts[i];
          if (i < N - 1 && (x - lx) ** 2 + (y - ly) ** 2 < cell * cell * 0.25) continue;
          stamp(x, y, cover, flowAt(path, i));
          lx = x; ly = y;
        }
      }

      let gd = null;
      if (gc) {
        // two blur radii: a tight hot halo plus a wide soft one, both at the reduced resolution
        const glow = U.canvas(GW, GH), g2 = glow.getContext('2d');
        const canBlur = typeof g2.filter === 'string';
        g2.globalCompositeOperation = 'lighter';
        if (canBlur) g2.filter = `blur(${(glowR * 0.3) / gs}px)`;
        g2.globalAlpha = 0.55;
        g2.drawImage(gsrc, 0, 0);
        if (canBlur) g2.filter = `blur(${glowR / gs}px)`;
        g2.globalAlpha = 0.6;
        g2.drawImage(gsrc, 0, 0);
        gd = g2.getImageData(0, 0, GW, GH).data;
      }
      // bilinear sample of a low-res grid (value at cell centers for the glow, at corners for flow)
      const bilerp = (get, gw, gh, fx, fy) => {
        fx = U.clamp(fx, 0, gw - 1); fy = U.clamp(fy, 0, gh - 1);
        const x0 = fx | 0, y0 = fy | 0, x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
        const a = get(x0, y0) + (get(x1, y0) - get(x0, y0)) * tx, b = get(x0, y1) + (get(x1, y1) - get(x0, y1)) * tx;
        return a + (b - a) * ty;
      };
      const glowAt = (x, y) => (gd ? bilerp((u, v) => gd[(v * GW + u) * 4], GW, GH, (x + 0.5) / gs - 0.5, (y + 0.5) / gs - 0.5) / 255 : 0);
      const flowAtPx = (x, y) => bilerp((u, v) => flow[v * FW + u], FW, FH, x / cell, y / cell);

      /* ---- resolve channels into the chosen output ---- */
      const src = cc.getImageData(0, 0, W, H).data;
      const img = ctx.createImageData(W, H), d = img.data;
      const lut = U.ramp([[0, p.cOuter, 0], [0.3, p.cOuter, 0.65], [0.62, p.cMid, 0.95], [0.88, p.cCore, 1], [1, p.cCore, 1]]);
      const clip = opts && opts.preview && p.reveal < 1 ? 1 - p.reveal : -1;
      const curve = p.flowCurve, needFlow = isFlow(p) || clip >= 0;
      for (let i = 0, px = 0; i < d.length; i += 4, px++) {
        const x = px % W, y = (px / W) | 0;
        const c = src[i] / 255, g = glowOn ? Math.min(1, glowAt(x, y) * p.glow) : 0;
        const I = U.screen(c, g);
        if (I < 3 / 255) continue; // leaves 0,0,0,0
        let F = needFlow ? Math.pow(U.clamp(flowAtPx(x + 0.5, y + 0.5)), curve) : 1;
        if (clip >= 0 && F < clip) continue;
        if (p.flowInvert) F = 1 - F;
        const j = ((I * 255) | 0) * 4;
        switch (p.output) {
          case 'color':
            d[i] = lut[j]; d[i + 1] = lut[j + 1]; d[i + 2] = lut[j + 2]; d[i + 3] = lut[j + 3];
            break;
          case 'packed':
            d[i] = I * 255; d[i + 1] = F * 255; d[i + 3] = 255;
            break;
          case 'flowMask':
            d[i] = d[i + 1] = d[i + 2] = F * 255; d[i + 3] = 255;
            break;
          default: { // black / flowAlpha: premultiplied onto black
            const a = lut[j + 3] / 255;
            d[i] = lut[j] * a; d[i + 1] = lut[j + 1] * a; d[i + 2] = lut[j + 2] * a;
            d[i + 3] = p.output === 'flowAlpha' ? F * 255 : 255;
          }
        }
      }
      // opaque outputs keep a solid black background
      if (p.output === 'black' || p.output === 'packed' || p.output === 'flowMask') {
        for (let i = 3; i < d.length; i += 4) d[i] = 255;
      }
      ctx.putImageData(img, 0, 0);

      const flowText = p.flowInvert ? 'flow: base 0 → tips 1' : 'flow: base 1 → tips 0';
      return { text: `${paths.length} paths` + (isFlow(p) ? ` · ${flowText}` : '') };
    },
  });
})();
