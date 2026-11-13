/* Grass: a tileable top-down ground of scattered blades, or a side-view grass card (blades
   growing from the bottom edge, transparent background) that tiles horizontally.
   Blades crossing an edge are drawn again on the opposite side. */
(function () {
  'use strict';
  const U = window.UGTG;

  const PRESETS = {
    lush: { root: '#1f3d14', tip: '#7cbf3a', dry: '#b5a24a', soil: '#2b2414', dryAmt: 0.12 },
    meadow: { root: '#2e4a1a', tip: '#a8d05a', dry: '#d8c46a', soil: '#3a2f1c', dryAmt: 0.25 },
    dry: { root: '#5a4a24', tip: '#d9c27a', dry: '#8a7a3a', soil: '#5c4a30', dryAmt: 0.45 },
    stylized: { root: '#1a5c3a', tip: '#8ff07a', dry: '#f0e070', soil: '#1e3a24', dryAmt: 0.08 },
  };
  const isGround = (p) => p.style === 'ground';
  const isCard = (p) => p.style === 'card';

  const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c, k) => `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`;

  U.register({
    id: 'grass',
    name: 'Grass',
    desc: 'Top-down grass ground or side-view grass cards with blade shape, wind and color variation',
    tags: ['Texturing', 'Nature'],
    tileable: true,
    icon: U.icon('<path d="M4 20c1-5 0-9-1-12"/><path d="M8 20c0-6 2-10 5-13"/><path d="M12 20c0-4-1-7-3-9"/><path d="M15 20c1-5 3-8 6-10"/><path d="M18 20c0-3-1-5-2-7"/>'),
    params: [
      { type: 'section', label: 'Grass' },
      { key: 'style', label: 'Style', type: 'select', default: 'ground', options: [['ground', 'Top-down ground (tiles both ways)'], ['card', 'Side-view card (tiles horizontally)']] },
      { key: 'count', label: 'Blade count', type: 'int', min: 10, max: 20000, default: 3500 },
      { key: 'lenMin', label: 'Min length', type: 'range', min: 0.01, max: 1, step: 0.005, default: 0.04, tip: 'Ground: fraction of the texture size. Card: fraction of the height.' },
      { key: 'lenMax', label: 'Max length', type: 'range', min: 0.01, max: 1, step: 0.005, default: 0.1 },
      { key: 'width', label: 'Blade width', type: 'range', min: 0.3, max: 30, step: 0.1, default: 3, tip: 'px @ 512' },
      { key: 'taper', label: 'Tip sharpness', type: 'range', min: 0.2, max: 3, step: 0.01, default: 1, tip: 'Higher = blades narrow sooner' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 21 },
      { type: 'section', label: 'Direction & shape' },
      { key: 'dir', label: 'Wind direction', type: 'range', min: -180, max: 180, step: 1, default: -60, show: isGround },
      { key: 'spread', label: 'Direction spread', type: 'range', min: 0, max: 360, step: 1, default: 300, show: isGround, tip: '360 = blades point anywhere, 0 = all combed one way' },
      { key: 'lean', label: 'Wind lean', type: 'range', min: -60, max: 60, step: 1, default: 8, show: isCard },
      { key: 'leanVar', label: 'Lean variation', type: 'range', min: 0, max: 60, step: 1, default: 14, show: isCard },
      { key: 'bend', label: 'Bend', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.45, tip: 'How much blades curve toward the tip' },
      { key: 'clump', label: 'Clumping', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'clumps', label: 'Clump count', type: 'int', min: 2, max: 200, default: 40, show: (p) => p.clump > 0 },
      { key: 'rootJitter', label: 'Root height variation', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.06, show: isCard },
      { type: 'section', label: 'Colors' },
      {
        key: 'preset', label: 'Preset', type: 'select', default: 'lush', options: [['lush', 'Lush'], ['meadow', 'Meadow'], ['dry', 'Dry / savanna'], ['stylized', 'Stylized'], ['custom', 'Custom']],
        apply: (v, p) => { if (PRESETS[v]) Object.assign(p, PRESETS[v]); },
      },
      { key: 'root', label: 'Root', type: 'color', default: PRESETS.lush.root },
      { key: 'tip', label: 'Tip', type: 'color', default: PRESETS.lush.tip },
      { key: 'dry', label: 'Dry blades', type: 'color', default: PRESETS.lush.dry },
      { key: 'dryAmt', label: 'Dry amount', type: 'range', min: 0, max: 1, step: 0.01, default: PRESETS.lush.dryAmt },
      { key: 'patches', label: 'Color patches', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Groups dry blades and brightness into large patches instead of random speckle' },
      { key: 'variation', label: 'Brightness variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'depth', label: 'Depth shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, tip: 'Blades underneath / behind are darker' },
      { key: 'soil', label: 'Ground color', type: 'color', default: PRESETS.lush.soil, show: isGround },
      { key: 'bgFill', label: 'Background fill', type: 'bool', default: false, show: isCard },
      { key: 'bg', label: 'Background', type: 'color', default: '#000000', show: (p) => isCard(p) && p.bgFill },
    ],
    presets: [
      { name: 'Lawn', group: 'Realistic', values: { count: 12000, lenMin: 0.02, lenMax: 0.05, width: 2.2, clump: 0.1, patches: 0.3, variation: 0.25 } },
      { name: 'Lush ground', group: 'Realistic', values: { preset: 'lush', count: 7000, lenMax: 0.13, clump: 0.55, patches: 0.7, depth: 0.7, seed: 8 } },
      { name: 'Meadow', group: 'Realistic', values: { preset: 'meadow', count: 5000, lenMax: 0.14, clump: 0.5, bend: 0.6 } },
      { name: 'Dry grass', group: 'Realistic', values: { preset: 'dry', count: 4500, spread: 360, bend: 0.8, width: 2.4, patches: 0.7 } },
      { name: 'Savanna', group: 'Realistic', values: { preset: 'dry', count: 6000, lenMin: 0.06, lenMax: 0.18, width: 2, dir: -30, spread: 120, clump: 0.6, root: '#7a6a30', tip: '#f0da8c', dry: '#a89a48', dryAmt: 0.3, soil: '#8a6a40' } },
      { name: 'Winter frost', group: 'Realistic', values: { preset: 'custom', count: 4000, root: '#3a4a3c', tip: '#dfe9ec', dry: '#a8ae9c', dryAmt: 0.3, soil: '#cfd6da', variation: 0.2 } },
      { name: 'Autumn', group: 'Realistic', values: { preset: 'custom', root: '#4a3a1a', tip: '#c89a3a', dry: '#a4522c', dryAmt: 0.55, soil: '#3a2a1a', patches: 0.8 } },
      { name: 'Wet dark lawn', group: 'Realistic', values: { count: 8000, lenMin: 0.03, lenMax: 0.07, preset: 'custom', root: '#0f2a0c', tip: '#4f9a30', dry: '#6a7a2a', dryAmt: 0.05, soil: '#1a160c', depth: 0.7 } },
      { name: 'Patchy sparse grass', group: 'Realistic', values: { count: 1400, clump: 0.85, clumps: 25, patches: 1, preset: 'meadow', soil: '#5a4630' } },
      { name: 'Wind-combed grass', group: 'Realistic', values: { count: 5000, lenMin: 0.08, lenMax: 0.18, width: 2.5, dir: -20, spread: 40, bend: 0.25, clump: 0.2 } },
      { name: 'Grass card', group: 'Realistic', values: { style: 'card', count: 900, lenMin: 0.4, lenMax: 0.9, width: 5 } },
      { name: 'Tall grass card', group: 'Realistic', values: { style: 'card', count: 600, lenMin: 0.6, lenMax: 1, width: 4, lean: 15, leanVar: 20, preset: 'meadow' } },
      { name: 'Dry grass card', group: 'Realistic', values: { style: 'card', count: 700, lenMin: 0.35, lenMax: 0.9, width: 3.5, leanVar: 22, bend: 0.7, preset: 'dry' } },
      { name: 'Grass tuft card', group: 'Realistic', values: { style: 'card', count: 500, lenMin: 0.2, lenMax: 0.55, width: 6, clump: 0.85, clumps: 6, leanVar: 30 } },
      { name: 'Windblown card', group: 'Realistic', values: { style: 'card', count: 800, lenMin: 0.6, lenMax: 1, width: 4, lean: 30, leanVar: 8, bend: 0.8 } },
      { name: 'Frosted card', group: 'Realistic', values: { style: 'card', count: 800, lenMin: 0.3, lenMax: 0.8, width: 4, preset: 'custom', root: '#3a4a3c', tip: '#e6eef2', dry: '#a8ae9c', dryAmt: 0.3 } },
      { name: 'Toon grass', group: 'Stylized', values: { preset: 'stylized', count: 2500, width: 8, taper: 0.6, variation: 0.1, depth: 0.3, patches: 0.2 } },
      { name: 'Toon grass card', group: 'Stylized', values: { style: 'card', preset: 'stylized', count: 160, lenMin: 0.5, lenMax: 0.85, width: 14, taper: 0.5, variation: 0.1, depth: 0.35 } },
      { name: 'Pastel meadow', group: 'Stylized', values: { preset: 'custom', count: 4000, width: 4.5, lenMax: 0.12, root: '#3a7a4a', tip: '#cdf28a', dry: '#ffe08a', dryAmt: 0.15, soil: '#4a6a3a', variation: 0.15 } },
      { name: 'Candy grass', group: 'Stylized', values: { preset: 'custom', width: 5, root: '#8a2a6a', tip: '#ffa8e0', dry: '#a8e8ff', dryAmt: 0.25, soil: '#3a1a3a' } },
      { name: 'Alien grass', group: 'Sci-fi', values: { preset: 'custom', width: 3.5, depth: 0.3, root: '#2a1a5a', tip: '#5af6ff', dry: '#ff4ae0', dryAmt: 0.2, soil: '#140a1e' } },
      { name: 'Crimson alien grass', group: 'Sci-fi', values: { preset: 'custom', count: 4500, lenMax: 0.13, bend: 0.9, root: '#3a0a0a', tip: '#ff5a3a', dry: '#ffd23a', dryAmt: 0.15, soil: '#2a0a0a' } },
      { name: 'Crystal spikes', group: 'Sci-fi', values: { preset: 'custom', count: 1800, width: 5, taper: 0.4, bend: 0, spread: 360, root: '#3a4a7a', tip: '#e0f4ff', dry: '#b8a8ff', dryAmt: 0.2, soil: '#121624', variation: 0.5 } },
      { name: 'Bioluminescent card', group: 'Sci-fi', values: { style: 'card', count: 700, lenMin: 0.35, lenMax: 0.9, width: 4, bend: 0.8, preset: 'custom', root: '#0a2a3a', tip: '#7affc8', dry: '#c87aff', dryAmt: 0.15, bgFill: true, bg: '#05070f' } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), k = S / 512, rnd = U.rng(p.seed), STEPS = 7;
      const ground = p.style === 'ground';
      const cRoot = U.hex(p.root), cTip = U.hex(p.tip), cDry = U.hex(p.dry);
      const lmin = Math.min(p.lenMin, p.lenMax), lmax = Math.max(p.lenMin, p.lenMax);
      const px = 3, py = ground ? Math.max(1, Math.round((3 * H) / W)) : 0; // patch noise periods
      const patch = (u, v, s) => U.fractal('perlin', u * px, v * Math.max(py, 1), px, py, 3, 0.5, 'fbm', p.seed + s);

      // background
      if (ground) {
        const soil = U.hex(p.soil), sx = 6, sy = Math.max(1, Math.round((6 * H) / W));
        U.pixels(ctx, W, H, (x, y, o) => {
          const n = U.fractal('perlin', ((x + 0.5) / W) * sx, ((y + 0.5) / H) * sy, sx, sy, 4, 0.5, 'fbm', p.seed + 31);
          const m = 0.7 + n * 0.5;
          o[0] = soil[0] * m; o[1] = soil[1] * m; o[2] = soil[2] * m;
        });
      } else if (p.bgFill) {
        ctx.fillStyle = p.bg;
        ctx.fillRect(0, 0, W, H);
      }

      // clump centers (fractions of the tile)
      const clumps = [];
      const crnd = U.rng(p.seed * 31 + 5);
      for (let i = 0; i < p.clumps; i++) clumps.push([crnd(), crnd()]);

      const blades = [];
      for (let i = 0; i < p.count; i++) {
        const r = Array.from({ length: 9 }, rnd);
        let u = r[0], v = r[1];
        if (p.clump > 0 && r[2] < p.clump) {
          // pull toward a clump center, gaussian-ish falloff
          const c = clumps[(r[3] * clumps.length) | 0], rad = (0.5 / Math.sqrt(clumps.length)) * Math.sqrt(-Math.log(1 - r[4] * 0.95));
          u = U.mod(c[0] + Math.cos(r[5] * U.TAU) * rad, 1);
          v = U.mod(c[1] + Math.sin(r[5] * U.TAU) * rad, 1);
        }
        blades.push({ u, v, z: r[6], len: lmin + (lmax - lmin) * Math.pow(r[7], 1.3), r8: r[8], sub: U.rng(p.seed * 7919 + i) });
      }
      blades.sort((a, b) => a.z - b.z); // back / underneath first

      for (const b of blades) {
        const sub = b.sub, s1 = sub(), s2 = sub(), s3 = sub(), s4 = sub();
        let x, y, heading, len, curl;
        if (ground) {
          x = b.u * W; y = b.v * H;
          heading = ((p.dir + (s1 - 0.5) * p.spread) * Math.PI) / 180;
          len = b.len * S;
          curl = (s2 - 0.5) * 2 * p.bend;
        } else {
          x = b.u * W; y = H * (1 - p.rootJitter * b.z * s3) + 2 * k; // front blades root lower
          heading = -Math.PI / 2 + ((p.lean + (s1 - 0.5) * 2 * p.leanVar) * Math.PI) / 180;
          len = b.len * H * (0.75 + 0.25 * b.z);
          // blades curve further in the direction they already lean, like drooping under their weight
          const side = Math.sign(heading + Math.PI / 2) || (s2 < 0.5 ? -1 : 1);
          curl = side * p.bend * (0.4 + 0.6 * s2);
        }

        // centerline: heading turns progressively (quadratic) toward the tip
        const pts = [[x, y]], step = len / STEPS;
        for (let s = 1; s <= STEPS; s++) {
          const a = heading + curl * Math.pow(s / STEPS, 2);
          x += Math.cos(a) * step;
          y += Math.sin(a) * step;
          pts.push([x, y]);
        }
        const w = p.width * k * (0.6 + 0.8 * s4);
        const left = [], right = [];
        for (let s = 0; s <= STEPS; s++) {
          const a = pts[Math.max(0, s - 1)], c = pts[Math.min(STEPS, s + 1)];
          const tx = c[0] - a[0], ty = c[1] - a[1], tl = Math.hypot(tx, ty) || 1;
          const hw = (Math.max(0.3, w) / 2) * Math.pow(1 - s / STEPS, p.taper);
          left.push([pts[s][0] - (ty / tl) * hw, pts[s][1] + (tx / tl) * hw]);
          right.push([pts[s][0] + (ty / tl) * hw, pts[s][1] - (tx / tl) * hw]);
        }
        const ribbon = left.concat(right.reverse());

        // color: dry blades and brightness grouped into patches via tileable noise
        const pu = U.mod(b.u, 1), pv = U.mod(b.v, 1);
        const pn = p.patches > 0 ? patch(pu, pv, 3) : 0.5;
        const dryT = U.clamp(p.dryAmt + (pn - 0.5) * p.patches * 1.6);
        const isDry = b.r8 < dryT;
        const shade = (1 - p.depth * 0.75 * (1 - b.z)) * (1 + (sub() - 0.5) * p.variation + (p.patches > 0 ? (patch(pu, pv, 9) - 0.5) * p.variation * p.patches : 0));
        const tipC = isDry ? mixC(cTip, cDry, 0.6 + 0.4 * sub()) : cTip;
        const rootC = isDry ? mixC(cRoot, cDry, 0.35) : cRoot;
        const g = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[STEPS][0], pts[STEPS][1]);
        g.addColorStop(0, css(rootC, Math.max(0, shade * 0.85)));
        g.addColorStop(1, css(mixC(rootC, tipC, 1), Math.max(0, shade)));
        ctx.fillStyle = g;

        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [qx, qy] of ribbon) { x0 = Math.min(x0, qx); y0 = Math.min(y0, qy); x1 = Math.max(x1, qx); y1 = Math.max(y1, qy); }
        const oyR = ground ? 1 : 0;
        for (let oy = -oyR; oy <= oyR; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const dx = ox * W, dy = oy * H;
            if (x1 + dx < 0 || x0 + dx > W || y1 + dy < 0 || y0 + dy > H) continue;
            ctx.save();
            ctx.translate(dx, dy);
            ctx.beginPath();
            U.polyPath(ctx, ribbon);
            ctx.fill();
            ctx.restore();
          }
        }
      }
    },
  });
})();
