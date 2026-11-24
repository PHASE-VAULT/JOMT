/* Leaf Litter: fallen leaves on the ground, e.g. an autumn leaf layer to blend over terrain. Leaves use the
   outlines of the Leafy Branch generator (U.leafShapes: oak lobes, maple / ivy palmate, birch serration,
   bites and holes), up to three species mixed, lying flat in random directions, slightly curled (a
   foreshortened, shaded half along the midrib) and mirrored. Layouts: a seamless fill (leaves crossing a
   border are drawn again on the other side, in the same order, so it tiles), the same with patchy drifts
   from a tileable noise mask, or a single pile decal that thins out toward the edges and never touches
   them. Every leaf gets a color from a 4-color palette, a second color toward its edges, a brightness
   jitter and, with Decay, browning, dark spots, dry edges, bites and holes. Realistic: soft color
   gradients, veins, spots, a soft fold shade and cast shadows onto the leaves below (optionally onto the
   ground, kept in the alpha). Stylized: flat colors, a hard fold shade, darker veins and outlines. Lower
   leaves can be darkened (fake AO). Twigs can be scattered between the leaves. Output: color + alpha (the
   leaf mask is the alpha), color on a ground color, white-on-black mask or height map (later leaves higher,
   curled edges up) for the normal map mode. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp } = U;
  const PI = Math.PI, TAU = PI * 2, RAD = PI / 180;

  const SPECIES = [['maple', 'Maple'], ['oak', 'Oak'], ['oval', 'Beech / cherry (oval)'], ['birch', 'Birch'], ['round', 'Round (aspen, linden)'], ['ivy', 'Ivy'], ['lanceolate', 'Narrow (willow, eucalyptus)'], ['willow', 'Willow strap'], ['holly', 'Holly'], ['needle', 'Pine needles']];
  const LEN = { needle: 0.55, willow: 1.15, lanceolate: 1.05, round: 0.8, ivy: 0.85, maple: 1, oak: 1.1, oval: 0.9, birch: 0.8, holly: 0.9 }; // relative leaf length
  const PALETTES = {
    autumn: ['#b8361e', '#d9741f', '#e3b22c', '#94612e'], maple: ['#a8221a', '#c8381c', '#de5a1e', '#e89a2a'],
    golden: ['#e8c23a', '#d9a42a', '#c6902a', '#b9b23e'], oak: ['#8a5a2e', '#a26b34', '#74492a', '#b08646'],
    early: ['#7f9a32', '#a9a83a', '#d6b43a', '#c9822c'], late: ['#6e4828', '#87562c', '#5a3c24', '#9a6a3a'],
    toon: ['#e2452b', '#f58a2a', '#ffc43a', '#b5562a'], spooky: ['#6a3a5a', '#e0702a', '#4a3a32', '#8a6a3a'],
    summer: ['#4f7a2a', '#6a9134', '#3f6524', '#86a63e'], spring: ['#8fbf3a', '#a9cf4a', '#76a830', '#c4d85a'],
    evergreen: ['#2f5124', '#3d6a2c', '#24401c', '#4f7a34'], toongreen: ['#4caf3a', '#7cc444', '#2f8a34', '#a6d84a'],
  };
  const palVals = (k) => ({ palette: k, c1: PALETTES[k][0], c2: PALETTES[k][1], c3: PALETTES[k][2], c4: PALETTES[k][3] });

  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const c8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  const css = (c, a) => (a == null ? `rgb(${c8(c[0])},${c8(c[1])},${c8(c[2])})` : `rgba(${c8(c[0])},${c8(c[1])},${c8(c[2])},${clamp(a)})`);
  const gray = (v) => { const g = c8(v * 255); return `rgb(${g},${g},${g})`; };

  // leaf variant -> Path2D in leaf units (x 0 = base … 1 = tip), holes cut out with the even-odd rule
  function variantPath(v) {
    const P = new Path2D(), pts = v.pts;
    P.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) P.lineTo(pts[i][0], pts[i][1]);
    P.closePath();
    for (const [x, y, r] of v.holes) { P.moveTo(x + r, y); P.arc(x, y, r, 0, TAU); }
    const V = new Path2D();
    for (const [x0, y0, x1, y1] of v.veins) { V.moveTo(x0, y0); V.lineTo(x1, y1); }
    return { path: P, veinPath: V, mainVein: v.veins.length ? v.veins[0] : null };
  }

  U.register({
    id: 'leaf-litter',
    name: 'Leaf Litter',
    desc: 'Fallen leaves on the ground (autumn leaf layers, piles, pine needles), tileable or as a pile decal, realistic or stylized, as color + alpha, mask, on a ground color or height map',
    uses: ['Autumn leaf layers blended over terrain, forest floors, paths and lawns: color + alpha or the leaf mask as a splat / blend mask; height for the normal map.', 'Leaf pile decals for props and level dressing; stylized and toon leaf carpets.'],
    tags: ['Nature', 'Texturing', 'Decals'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<path d="M4 14c3-6 9-8 14-7-1 5-5 10-11 10-1 0-2 0-3-3z"/><path d="M5 16c3-3 6-5 10-7" opacity=".6"/><path d="M15 20c1.5-2 3.5-3 5.5-3-.5 2-2 3.5-4 3.5z" opacity=".8"/>'),
    params: [
      { type: 'section', label: 'Leaves' },
      { key: 'species1', label: 'Species', type: 'select', default: 'maple', options: SPECIES },
      { key: 'species2', label: 'Second species', type: 'select', default: 'oak', options: [['none', 'None']].concat(SPECIES) },
      { key: 'species3', label: 'Third species', type: 'select', default: 'birch', options: [['none', 'None']].concat(SPECIES) },
      { key: 'count', label: 'Leaf count', type: 'int', min: 5, max: 3000, default: 420 },
      { key: 'size', label: 'Leaf size', type: 'range', min: 0.02, max: 0.4, step: 0.005, default: 0.1, tip: 'Leaf length relative to the texture' },
      { key: 'sizeVar', label: 'Size variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'curl', label: 'Curl', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Leaves folded along the midrib: narrower, one half shaded, edges raised in the height map' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 11 },

      { type: 'section', label: 'Layout' },
      { key: 'layout', label: 'Layout', type: 'select', default: 'fill', options: [['fill', 'Seamless fill'], ['patches', 'Seamless patches / drifts'], ['pile', 'Pile decal (centered)']] },
      { key: 'patchScale', label: 'Patch scale', type: 'int', min: 1, max: 12, default: 3, show: (p) => p.layout === 'patches', tip: 'Patches across the texture' },
      { key: 'patchCover', label: 'Patch coverage', type: 'range', min: 0.05, max: 0.95, step: 0.01, default: 0.5, show: (p) => p.layout === 'patches' },
      { key: 'patchSoft', label: 'Patch softness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.layout === 'patches', tip: 'Soft edges: leaves thin out gradually around the patches' },
      { key: 'pileSize', label: 'Pile size', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.85, show: (p) => p.layout === 'pile' },
      { key: 'pileFalloff', label: 'Edge falloff', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.layout === 'pile', tip: 'How much the leaves thin out toward the edge of the pile' },
      { key: 'margin', label: 'Edge margin', type: 'range', min: 0, max: 0.2, step: 0.005, default: 0.03, show: (p) => p.layout === 'pile', tip: 'Empty border: no leaf (or shadow) touches the texture edge' },
      { key: 'twigs', label: 'Twigs', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Small sticks scattered between the leaves' },

      { type: 'section', label: 'Colors' },
      { key: 'palette', label: 'Palette', type: 'select', default: 'autumn', options: [['autumn', 'Autumn mix'], ['maple', 'Red maple'], ['golden', 'Golden yellow'], ['oak', 'Brown oak'], ['early', 'Early autumn (green-yellow)'], ['late', 'Late autumn (brown)'], ['toon', 'Toon autumn'], ['spooky', 'Spooky'], ['summer', 'Summer green'], ['spring', 'Fresh spring green'], ['evergreen', 'Dark evergreen (ivy, holly)'], ['toongreen', 'Toon green'], ['custom', 'Custom']], apply: (v, p) => { const c = PALETTES[v]; if (c) { p.c1 = c[0]; p.c2 = c[1]; p.c3 = c[2]; p.c4 = c[3]; } } },
      { key: 'c1', label: 'Color 1', type: 'color', default: PALETTES.autumn[0] },
      { key: 'c2', label: 'Color 2', type: 'color', default: PALETTES.autumn[1] },
      { key: 'c3', label: 'Color 3', type: 'color', default: PALETTES.autumn[2] },
      { key: 'c4', label: 'Color 4', type: 'color', default: PALETTES.autumn[3] },
      { key: 'colorVar', label: 'Brightness variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'blend', label: 'Edge color blend', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Each leaf shifts toward the next palette color at its edges and tip' },
      { key: 'decay', label: 'Decay', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Share of brown, dry leaves with spots, dry edges, bites and holes' },
      { key: 'deadColor', label: 'Dry leaf color', type: 'color', default: '#6e4a2c', show: (p) => p.decay > 0 },
      { key: 'twigColor', label: 'Twig color', type: 'color', default: '#4e3624', show: (p) => p.twigs > 0 },

      { type: 'section', label: 'Look' },
      { key: 'style', label: 'Style', type: 'select', default: 'realistic', options: [['realistic', 'Realistic'], ['stylized', 'Stylized / toon']] },
      { key: 'veins', label: 'Veins', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'spots', label: 'Spots', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: (p) => p.style === 'realistic', tip: 'Dark blotches (more on decayed leaves)' },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.style === 'stylized' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#3a1e12', show: (p) => p.style === 'stylized' && p.outline > 0 },
      { key: 'depthShade', label: 'Depth darkening', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Leaves lower in the layer are darker (fake ambient occlusion)' },
      { key: 'shadow', label: 'Shadows', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Soft shadows the leaves cast onto the leaves below' },
      { key: 'shadowSoft', label: 'Shadow softness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.shadow > 0 },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -135, show: (p) => p.shadow > 0, tip: 'Direction the light comes from; shadows fall the other way' },
      { key: 'shadowGround', label: 'Shadows on the ground (in alpha)', type: 'bool', default: false, show: (p) => p.shadow > 0 && p.output === 'color', tip: 'Also keep the shadows on the empty ground as semi-transparent dark pixels' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color + alpha'], ['ground', 'On ground color'], ['mask', 'Mask (white leaves on black)'], ['height', 'Height map']] },
      { key: 'groundColor', label: 'Ground color', type: 'color', default: '#4a3a2a', show: (p) => p.output === 'ground' },
      { key: 'groundVar', label: 'Ground mottling', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.output === 'ground' },
    ],
    presets: [
      { name: 'Autumn leaves (mixed)', group: 'Realistic', values: {} },
      { name: 'Red maple carpet', group: 'Realistic', values: { species1: 'maple', species2: 'none', species3: 'none', palette: 'maple', c1: PALETTES.maple[0], c2: PALETTES.maple[1], c3: PALETTES.maple[2], c4: PALETTES.maple[3], count: 520, size: 0.11, decay: 0.15 } },
      { name: 'Golden birch & beech', group: 'Realistic', values: { species1: 'birch', species2: 'oval', species3: 'round', palette: 'golden', c1: PALETTES.golden[0], c2: PALETTES.golden[1], c3: PALETTES.golden[2], c4: PALETTES.golden[3], count: 700, size: 0.075, decay: 0.2 } },
      { name: 'Dry oak litter', group: 'Realistic', values: { species1: 'oak', species2: 'oak', species3: 'oval', palette: 'oak', c1: PALETTES.oak[0], c2: PALETTES.oak[1], c3: PALETTES.oak[2], c4: PALETTES.oak[3], count: 520, size: 0.1, decay: 0.65, curl: 0.7, spots: 0.4, twigs: 0.3 } },
      { name: 'Early autumn (scattered)', group: 'Realistic', values: { palette: 'early', c1: PALETTES.early[0], c2: PALETTES.early[1], c3: PALETTES.early[2], c4: PALETTES.early[3], layout: 'patches', patchScale: 3, patchCover: 0.4, count: 260, decay: 0.05, curl: 0.25, output: 'color' } },
      { name: 'Late autumn, rotting', group: 'Realistic', values: { palette: 'late', c1: PALETTES.late[0], c2: PALETTES.late[1], c3: PALETTES.late[2], c4: PALETTES.late[3], count: 650, decay: 0.9, curl: 0.3, spots: 0.7, depthShade: 0.5, twigs: 0.3 } },
      { name: 'Leaves on a path (drifts)', group: 'Realistic', values: { layout: 'patches', patchScale: 2, patchCover: 0.45, patchSoft: 0.6, count: 380, output: 'ground', groundColor: '#5b5248', groundVar: 0.3 } },
      { name: 'Leaf pile', group: 'Realistic', values: { layout: 'pile', count: 600, size: 0.085, pileSize: 0.9, pileFalloff: 0.55, depthShade: 0.45, shadow: 0.6 } },
      { name: 'Forest floor', group: 'Realistic', values: { species1: 'oak', species2: 'oval', species3: 'needle', palette: 'late', c1: '#7a4e2a', c2: '#a0662e', c3: '#c08a36', c4: '#5e4028', count: 900, size: 0.08, decay: 0.6, twigs: 0.45, output: 'ground', groundColor: '#3a2c20', depthShade: 0.45 } },
      { name: 'Pine needle litter', group: 'Realistic', values: { species1: 'needle', species2: 'needle', species3: 'none', palette: 'custom', c1: '#9a6a3a', c2: '#b07a40', c3: '#7e5532', c4: '#c08c4c', count: 2400, size: 0.09, sizeVar: 0.25, curl: 0, decay: 0.2, spots: 0, twigs: 0.35, shadow: 0.45, depthShade: 0.4, output: 'ground', groundColor: '#4a3626' } },
      // green, non-autumn leaves
      { name: 'Green leaves (summer)', group: 'Green leaves', values: Object.assign(palVals('summer'), { species1: 'oval', species2: 'birch', species3: 'maple', count: 420, decay: 0.05, deadColor: '#8a7a3a', curl: 0.3, blend: 0.3, spots: 0.1, twigs: 0.1 }) },
      { name: 'Fresh spring leaves', group: 'Green leaves', values: Object.assign(palVals('spring'), { species1: 'round', species2: 'birch', species3: 'oval', count: 380, size: 0.085, decay: 0, curl: 0.2, blend: 0.35, spots: 0, veins: 0.6, twigs: 0 }) },
      { name: 'Storm-blown green leaves', group: 'Green leaves', values: Object.assign(palVals('summer'), { species1: 'oak', species2: 'maple', species3: 'oval', layout: 'patches', patchScale: 3, patchCover: 0.4, patchSoft: 0.5, count: 240, decay: 0.08, deadColor: '#8a7a3a', curl: 0.35, blend: 0.25, twigs: 0.35 }) },
      { name: 'Green & yellow (late summer)', group: 'Green leaves', values: { palette: 'custom', c1: '#5a8030', c2: '#7f9a34', c3: '#c9b23a', c4: '#4a6a28', species1: 'oval', species2: 'maple', species3: 'birch', count: 450, decay: 0.15, deadColor: '#8a6a34', curl: 0.35, blend: 0.4 } },
      { name: 'Ivy ground cover', group: 'Green leaves', values: Object.assign(palVals('evergreen'), { species1: 'ivy', species2: 'ivy', species3: 'none', count: 900, size: 0.09, sizeVar: 0.45, decay: 0, curl: 0.2, blend: 0.2, veins: 0.75, spots: 0, depthShade: 0.55, shadow: 0.6, twigs: 0 }) },
      { name: 'Evergreen litter (holly & laurel)', group: 'Green leaves', values: Object.assign(palVals('evergreen'), { species1: 'holly', species2: 'lanceolate', species3: 'oval', count: 500, decay: 0.25, deadColor: '#6a5a34', curl: 0.4, blend: 0.25, spots: 0.2, twigs: 0.3 }) },
      { name: 'Green leaf pile (garden clippings)', group: 'Green leaves', values: Object.assign(palVals('summer'), { layout: 'pile', species1: 'oval', species2: 'round', species3: 'lanceolate', count: 600, size: 0.085, pileSize: 0.9, decay: 0.1, deadColor: '#8a7a3a', depthShade: 0.45, shadow: 0.6, twigs: 0.25 }) },
      { name: 'Toon green leaves', group: 'Stylized', values: Object.assign(palVals('toongreen'), { style: 'stylized', species1: 'oval', species2: 'maple', species3: 'round', count: 260, size: 0.13, sizeVar: 0.25, decay: 0, veins: 0.6, outline: 0.5, outlineColor: '#123a14', shadow: 0.35, shadowSoft: 0.1, depthShade: 0.25, twigs: 0 }) },
      { name: 'Toon autumn leaves', group: 'Stylized', values: { style: 'stylized', palette: 'toon', c1: PALETTES.toon[0], c2: PALETTES.toon[1], c3: PALETTES.toon[2], c4: PALETTES.toon[3], count: 260, size: 0.13, sizeVar: 0.25, decay: 0, veins: 0.6, outline: 0.5, shadow: 0.35, shadowSoft: 0.1, depthShade: 0.25, twigs: 0 } },
      { name: 'Toon leaf pile', group: 'Stylized', values: { style: 'stylized', palette: 'toon', c1: PALETTES.toon[0], c2: PALETTES.toon[1], c3: PALETTES.toon[2], c4: PALETTES.toon[3], layout: 'pile', count: 320, size: 0.12, pileSize: 0.9, decay: 0, outline: 0.6, shadow: 0.4, shadowSoft: 0.1, depthShade: 0.35, twigs: 0 } },
      { name: 'Cartoon scattered leaves', group: 'Stylized', values: { style: 'stylized', species1: 'maple', species2: 'oval', species3: 'none', palette: 'toon', c1: PALETTES.toon[0], c2: PALETTES.toon[1], c3: PALETTES.toon[2], c4: PALETTES.toon[3], layout: 'patches', patchScale: 3, patchCover: 0.35, patchSoft: 0.8, count: 110, size: 0.16, sizeVar: 0.2, decay: 0, curl: 0.3, outline: 0.8, veins: 0.4, blend: 0.2, shadow: 0.3, shadowSoft: 0, twigs: 0, output: 'ground', groundColor: '#6a8a3a', groundVar: 0.2 } },
      { name: 'Spooky dead leaves', group: 'Stylized', values: { style: 'stylized', species1: 'oak', species2: 'maple', species3: 'holly', palette: 'spooky', c1: PALETTES.spooky[0], c2: PALETTES.spooky[1], c3: PALETTES.spooky[2], c4: PALETTES.spooky[3], count: 340, size: 0.12, decay: 0.5, deadColor: '#3a2e2a', curl: 0.6, outline: 0.7, outlineColor: '#140c10', depthShade: 0.5, shadow: 0.5, shadowSoft: 0.2, twigs: 0.3, twigColor: '#2a1e1a' } },
    ],

    render(ctx, W, H, p, opts) {
      const out = (opts && opts.height) || p.output === 'height' ? 'height' : p.output;
      const S = Math.min(W, H), rnd = U.rng((p.seed | 0) * 7919 + 13), toon = p.style === 'stylized', LS = U.leafShapes;
      const pile = p.layout === 'pile', wrap = !pile;
      if (!LS) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); return; }

      // variant pools per species: intact and damaged (bites, holes)
      const species = [p.species1, p.species2, p.species3].filter((s) => s && s !== 'none' && LS.SHAPES[s]);
      if (!species.length) species.push('maple');
      const vr = U.rng((p.seed | 0) * 31 + 977), pools = {};
      for (const s of new Set(species)) {
        const sh = LS.SHAPES[s], mk = (dmg) => { const v = LS.buildVariant(sh, { leafWidth: 1, serration: 0 }, vr, dmg); return Object.assign(v, variantPath(v)); };
        pools[s] = { ok: [0, 1, 2, 3, 4, 5].map(() => mk(false)), dmg: sh.needle ? [] : [0, 1, 2, 3].map(() => mk(true)) };
      }

      // placement mask: tileable noise patches, or the pile's elliptic falloff
      const [px, py] = [Math.max(1, Math.round(p.patchScale)), Math.max(1, Math.round(p.patchScale * (H / W)))];
      const accept = (x, y) => {
        if (p.layout === 'patches') {
          const n = U.fractal('perlin', (x / W) * px, (y / H) * py, px, py, 4, 0.5, 'fbm', (p.seed | 0) + 404), t = 1 - p.patchCover, s = 0.02 + p.patchSoft * 0.18;
          return U.smoothstep(t - s, t + s, n * 1.25 - 0.125);
        }
        return 1;
      };
      const m = p.margin * S, rx = (W / 2 - m) * p.pileSize, ry = (H / 2 - m) * p.pileSize;

      // items: leaves and twigs in drawing order (first = bottom)
      const pal = [p.c1, p.c2, p.c3, p.c4].map(U.hex), dead = U.hex(p.deadColor), items = [];
      const nTw = Math.round(p.twigs * p.twigs * 60 * Math.max(0.3, p.count / 420)), total = p.count + nTw;
      let tries = 0;
      while (items.length < total && tries++ < total * 30) {
        let x, y, d = 0;
        if (pile) { const a = rnd() * TAU, r = Math.sqrt(rnd()); x = W / 2 + Math.cos(a) * r * rx; y = H / 2 + Math.sin(a) * r * ry; d = r; if (rnd() > 1 - p.pileFalloff * U.smoothstep(0.3, 1, r)) continue; }
        else { x = rnd() * W; y = rnd() * H; if (rnd() > accept(x, y)) continue; }
        const twig = rnd() < nTw / total, a = rnd() * TAU, z = items.length;
        if (twig) {
          const len = S * (0.05 + 0.13 * rnd()) * (0.6 + p.size * 4), w = Math.max(0.8, S * (0.003 + 0.004 * rnd())), pts = [], k = 3 + Math.floor(rnd() * 3);
          let ang = a, cx = -len / 2 * Math.cos(a), cy = -len / 2 * Math.sin(a);
          for (let i = 0; i <= k; i++) { pts.push([cx, cy]); ang += (rnd() - 0.5) * 0.5; cx += (Math.cos(ang) * len) / k; cy += (Math.sin(ang) * len) / k; }
          let ext = len / 2 + w * 2;
          if (pile) { const room = Math.min(x - m, W - m - x, y - m, H - m - y); if (room < ext) continue; }
          items.push({ twig: true, x, y, pts, w, ext, z, br: 0.8 + rnd() * 0.4 });
          continue;
        }
        const s = species[Math.floor(rnd() * species.length)], P = pools[s], dmg = P.dmg.length && rnd() < p.decay * 0.6;
        const v = dmg ? P.dmg[Math.floor(rnd() * P.dmg.length)] : P.ok[Math.floor(rnd() * P.ok.length)];
        let L = S * p.size * (LS.SHAPES[s].needle ? 1 : LEN[s] || 1) * (1 - p.sizeVar * 0.5 + rnd() * p.sizeVar);
        if (s === 'needle') L = S * p.size * 0.55 * (1 - p.sizeVar * 0.5 + rnd() * p.sizeVar);
        if (pile) { // shrink leaves that would cross the margin; drop tiny ones
          const room = Math.min(x - m, W - m - x, y - m, H - m - y) * 1.6;
          if (L > room) L = room;
          if (L < S * 0.012) continue;
        }
        const ci = Math.floor(rnd() * 4), dd = rnd() < p.decay ? 0.45 + 0.55 * rnd() : rnd() * 0.12 * p.decay;
        let base = mix(pal[ci], dead, dd), edge = mix(mix(pal[(ci + 1) % 4], dead, dd * 0.7), base, 1 - p.blend);
        const br = 1 + (rnd() - 0.5) * p.colorVar * 0.6;
        base = mul(base, br); edge = mul(edge, br);
        const fold = 1 - p.curl * (0.15 + 0.4 * rnd()), flip = rnd() < 0.5 ? 1 : -1, spots = [];
        const ns = toon ? 0 : Math.floor((p.spots * (0.3 + dd * 2)) * 4 * rnd() + p.spots * dd * 2);
        for (let k = 0; k < ns; k++) spots.push([0.2 + rnd() * 0.65, (rnd() - 0.5) * v.maxW * 1.4, 0.02 + rnd() * 0.06 * (0.5 + dd)]);
        items.push({ x, y, a, L, v, base, edge, dd, fold, flip, spots, z, d, pet: v.needle ? 0 : 0.05 + rnd() * 0.07, hj: rnd() });
      }
      const n = Math.max(1, items.length);

      const la = p.lightAngle * RAD, sd = S * 0.008 * (0.4 + p.curl), sox = -Math.cos(la) * sd, soy = -Math.sin(la) * sd, sblur = S * (0.002 + p.shadowSoft * 0.014);
      const shOn = p.shadow > 0 && out !== 'mask' && out !== 'height', FAR = Math.max(W, H) * 3 + 1000, outlinePx = p.outline * S * 0.005;

      // ground
      if (out === 'mask' || out === 'height') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      else if (out === 'ground') {
        const gc = U.hex(p.groundColor), gx = 6, gy = Math.max(1, Math.round(6 * (H / W)));
        const mot = U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * gx, (y / H) * gy, gx, gy, 5, 0.55, 'fbm', (p.seed | 0) + 77));
        const img = ctx.createImageData(W, H), o = img.data, gv = p.groundVar;
        for (let i = 0; i < W * H; i++) { const f = 1 + (mot[i] - 0.5) * gv * 0.9;o[i * 4] = gc[0] * f; o[i * 4 + 1] = gc[1] * f; o[i * 4 + 2] = gc[2] * f; o[i * 4 + 3] = 255; }
        ctx.putImageData(img, 0, 0);
      } else ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';

      const hOf = (it) => 0.12 + 0.78 * (it.z / n) + (it.hj - 0.5) * 0.04;
      const depthK = (it) => 1 - p.depthShade * 0.55 * (1 - it.z / n);

      // one copy of an item at offset (ox, oy) in the current mode
      const drawTwig = (c, it, ox, oy, mode, shadowPass) => {
        c.save(); c.translate(it.x + ox + (shadowPass ? FAR : 0), it.y + oy);
        const P = new Path2D(); P.moveTo(it.pts[0][0], it.pts[0][1]); for (let i = 1; i < it.pts.length; i++) P.lineTo(it.pts[i][0], it.pts[i][1]);
        c.lineWidth = it.w;
        if (shadowPass || mode === 'mask') { c.strokeStyle = '#fff'; c.stroke(P); c.restore(); return; }
        if (mode === 'height') { c.strokeStyle = gray(hOf(it) + 0.03); c.stroke(P); c.restore(); return; }
        const tc = mul(U.hex(p.twigColor), it.br * depthK(it));
        if (toon && outlinePx > 0) { c.lineWidth = it.w + outlinePx * 2; c.strokeStyle = p.outlineColor; c.stroke(P); c.lineWidth = it.w; }
        c.strokeStyle = css(tc); c.stroke(P);
        c.lineWidth = it.w * 0.35; c.strokeStyle = css(mul(tc, 1.45), 0.6); c.translate(-it.w * 0.18, -it.w * 0.18); c.stroke(P);
        c.restore();
      };
      const drawLeaf = (c, it, ox, oy, mode, shadowPass) => {
        const v = it.v, L = it.L;
        c.save();
        c.translate(it.x + ox + (shadowPass ? FAR : 0), it.y + oy); c.rotate(it.a); c.scale(L, L * it.fold * it.flip); c.translate(-0.5, 0);
        const lw = 1 / L; // one pixel in leaf units
        if (it.pet > 0) { // petiole
          c.lineWidth = Math.max(lw * 0.8, 0.022);
          c.strokeStyle = shadowPass || mode === 'mask' ? '#fff' : mode === 'height' ? gray(hOf(it)) : css(mul(it.dd > 0.4 ? dead : mul(it.base, 0.7), 0.75 * depthK(it)));
          c.beginPath(); c.moveTo(0.02, 0); c.lineTo(-it.pet, 0.015); c.stroke();
        }
        if (shadowPass || mode === 'mask') { c.fillStyle = '#fff'; c.fill(v.path, 'evenodd'); c.restore(); return; }
        if (mode === 'height') {
          const h = hOf(it), cu = p.curl * 0.06, mw = v.maxW || 0.2, g = c.createLinearGradient(0, -mw, 0, mw);
          g.addColorStop(0, gray(h + cu)); g.addColorStop(0.5, gray(h)); g.addColorStop(1, gray(h + cu));
          c.fillStyle = g; c.fill(v.path, 'evenodd'); c.restore(); return;
        }
        const dk = depthK(it), base = mul(it.base, dk), edge = mul(it.edge, dk);
        if (toon && outlinePx > 0) { c.lineWidth = (outlinePx * 2) / L; c.strokeStyle = p.outlineColor; c.stroke(v.path); }
        c.fillStyle = css(base); c.fill(v.path, 'evenodd');
        const mw = Math.max(0.03, v.maxW);
        c.save(); c.clip(v.path, 'evenodd');
        if (toon) {
          if (p.blend > 0) { const g = c.createRadialGradient(v.inX || 0.35, 0, 0.2, v.inX || 0.35, 0, 0.75); g.addColorStop(0, css(edge, 0)); g.addColorStop(0.55, css(edge, 0)); g.addColorStop(0.56, css(edge, 0.9)); c.fillStyle = g; c.fillRect(-0.1, -1, 1.3, 2); }
          if (p.curl > 0) { c.fillStyle = 'rgba(0,0,0,' + (0.1 + p.curl * 0.14) + ')'; c.fillRect(-0.1, -1, 1.3, 1); }
          if (p.veins > 0 && !v.needle) { c.lineWidth = Math.max(lw, 0.018 * (0.5 + p.veins)); c.strokeStyle = css(mul(base, 0.62), 0.5 + p.veins * 0.5); c.stroke(v.veinPath); }
        } else {
          // edge / tip color, soft
          if (p.blend > 0) { const cx = v.needle ? 0.5 : v.inX || 0.35, g = c.createRadialGradient(cx, 0, 0.05, cx, 0, 0.72); g.addColorStop(0, css(edge, 0)); g.addColorStop(1, css(edge, 0.95)); c.fillStyle = g; c.fillRect(-0.1, -1, 1.3, 2); }
          for (const [sx, sy, sr] of it.spots) { const g = c.createRadialGradient(sx, sy, 0, sx, sy, sr); const sc = mul(mix(dead, [40, 26, 16], 0.5), dk); g.addColorStop(0, css(sc, 0.85)); g.addColorStop(0.6, css(sc, 0.6)); g.addColorStop(1, css(sc, 0)); c.fillStyle = g; c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2); }
          if (p.curl > 0) { // soft fold: one half in shade, the other catching a little light
            const g = c.createLinearGradient(0, 0, 0, -mw), a = 0.08 + p.curl * 0.22; g.addColorStop(0, 'rgba(0,0,0,' + a + ')'); g.addColorStop(1, 'rgba(0,0,0,' + a * 0.35 + ')');
            c.fillStyle = g; c.fillRect(-0.1, -1, 1.3, 1); c.fillStyle = 'rgba(255,240,210,' + a * 0.25 + ')'; c.fillRect(-0.1, 0, 1.3, 1);
          }
          if (p.veins > 0 && !v.needle) { c.lineWidth = Math.max(lw * 0.7, 0.011); c.strokeStyle = it.dd > 0.4 ? css(mul(base, 0.7), p.veins * 0.6) : css(mix(base, [255, 235, 160], 0.35), p.veins * 0.6); c.stroke(v.veinPath); }
          if (it.dd > 0.2 && !v.needle) { c.lineWidth = 0.09; c.strokeStyle = css(mul(mix(dead, [50, 32, 18], 0.4), dk), it.dd * 0.55); c.stroke(v.path); } // dry, darker rim
        }
        c.restore();
        c.restore();
      };

      const draw = (it, mode) => {
        const ext = it.twig ? it.ext : it.L * 0.75, fn = it.twig ? drawTwig : drawLeaf, offs = [];
        for (const oy of wrap ? [-H, 0, H] : [0]) for (const ox of wrap ? [-W, 0, W] : [0]) if (it.x + ox + ext > -sblur * 3 && it.x + ox - ext < W + sblur * 3 && it.y + oy + ext > -sblur * 3 && it.y + oy - ext < H + sblur * 3) offs.push([ox, oy]);
        if (shOn) { // shadow cast onto what is already drawn (or onto the empty ground too)
          ctx.save();
          ctx.globalCompositeOperation = out === 'color' && p.shadowGround ? 'source-over' : 'source-atop';
          ctx.shadowColor = 'rgba(12,6,2,' + clamp(p.shadow * (toon ? 0.75 : 0.85)) + ')'; ctx.shadowBlur = sblur; ctx.shadowOffsetX = sox - FAR; ctx.shadowOffsetY = soy;
          for (const [ox, oy] of offs) fn(ctx, it, ox, oy, mode, true);
          ctx.restore();
        }
        for (const [ox, oy] of offs) fn(ctx, it, ox, oy, mode, false);
      };
      const mode = out === 'mask' ? 'mask' : out === 'height' ? 'height' : 'color';
      for (const it of items) draw(it, mode);
    },
  });
})();
