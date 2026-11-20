/* Leaves: alpha-cutout leaf textures for foliage cards and billboards inside tree crowns, bushes and
   ground cover. A layout places leaves (single leaf, twig, branch spray, leaf clump) and stems; every leaf
   is one of a few outline variants built from the shape settings:
   - simple blades: a width profile along the midrib (widest point, base roundness, tip pointiness,
     heart-shaped base), rounded lobes (oak), serration (birch), pinnate veins;
   - palmate (maple): lobes around a center, pointy tips, deep sinuses, veins to every lobe tip;
   - fan (ginkgo): a wedge with a notched, wavy rim and radial veins.
   Leaves are tilted about their midrib (curl), folded along it (one half lit, one shaded) and lit from one
   light; back leaves are darker and drawn behind the stems. Styles: realistic (base-to-tip gradient,
   fold shading, veins, translucency, spots, insect holes, dry edges, gloss), low-poly (flat facets with a
   crumpled fold) and toon (two flat tones, outline, vein lines). Output: color with hard cutout or soft
   alpha, a white-on-black mask, or a normal map from the leaf / facet orientation (OpenGL / DirectX). */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, smoothstep } = U;
  const RAD = Math.PI / 180, TAU = Math.PI * 2;

  // shape presets: the Leaf shape select applies one of these, then everything stays editable
  const BASE = { form: 'simple', leafWidth: 0.55, widest: 0.45, tipShape: 1.2, baseShape: 1.2, cordate: 0, lobes: 0, lobeDepth: 0, serration: 0, teeth: 24, petiole: 0.12, veinCount: 7 };
  const SHAPES = {
    oval: {},
    lanceolate: { leafWidth: 0.28, widest: 0.35, tipShape: 1.8, baseShape: 0.9, petiole: 0.08, veinCount: 9 },
    round: { leafWidth: 0.85, widest: 0.5, tipShape: 0.8, baseShape: 1.4, serration: 0.12, teeth: 26, petiole: 0.2, veinCount: 6 },
    heart: { leafWidth: 0.8, widest: 0.32, tipShape: 1.6, baseShape: 1.5, cordate: 0.7, serration: 0.04, teeth: 30, petiole: 0.3, veinCount: 6 },
    birch: { leafWidth: 0.62, widest: 0.35, tipShape: 1.7, baseShape: 1.6, serration: 0.55, teeth: 18, petiole: 0.22, veinCount: 7 },
    oak: { leafWidth: 0.55, widest: 0.62, tipShape: 0.9, baseShape: 0.8, cordate: 0.15, lobes: 4, lobeDepth: 0.55, petiole: 0.06, veinCount: 5 },
    willow: { leafWidth: 0.13, widest: 0.4, tipShape: 2, baseShape: 1, serration: 0.1, teeth: 40, petiole: 0.04, veinCount: 12 },
    maple: { form: 'palmate', leafWidth: 1, lobes: 5, lobeDepth: 0.6, tipShape: 2.2, serration: 0.35, teeth: 3, petiole: 0.45, veinCount: 5 },
    ginkgo: { form: 'fan', leafWidth: 0.9, lobes: 2, lobeDepth: 0.55, serration: 0.1, teeth: 30, petiole: 0.55, veinCount: 14 },
    needle: { leafWidth: 0.045, widest: 0.5, tipShape: 1.4, baseShape: 1, petiole: 0, veinCount: 0 },
  };
  const SHAPE_OPTS = [['oval', 'Oval'], ['lanceolate', 'Lanceolate'], ['round', 'Round'], ['heart', 'Heart'], ['birch', 'Birch (serrated)'], ['oak', 'Oak (lobed)'], ['willow', 'Willow'], ['maple', 'Maple (palmate)'], ['ginkgo', 'Ginkgo (fan)'], ['needle', 'Needle'], ['custom', 'Custom']];
  const shape = (k) => Object.assign({}, BASE, SHAPES[k]);

  const simple = (p) => p.form === 'simple', notSingle = (p) => p.layout !== 'single';
  const branched = (p) => p.layout === 'twig' || p.layout === 'spray';

  /* one outline variant in leaf space: blade from x = 0 (base) to about x = 1 (tip), y across.
     Returns the outline, veins [x0, y0, cx, cy, x1, y1, weight], spots where holes / blemishes fit, low-poly facets */
  function buildVariant(p, rnd) {
    const W = p.leafWidth, asL = 1 + (rnd() - 0.5) * p.asym * 0.6, asR = 2 - asL;
    const pts = [], veins = [], spots = [], tris = [];
    const crumple = () => (rnd() - 0.5) * 0.06;
    if (p.form === 'palmate') {
      const k = Math.max(3, p.lobes | 0), R = 0.5, span = Math.PI * Math.min(0.8, 0.42 + 0.08 * k), lob = [];
      for (let j = 0; j < k; j++) { const th = -span + (2 * span * j) / (k - 1); lob.push([th, (0.55 + 0.45 * Math.cos(th * 0.6)) * (0.9 + 0.2 * rnd())]); }
      const rAt = (th) => {
        const q = ((th + span) / (2 * span)) * (k - 1), j = clamp(Math.round(q), 0, k - 1), dq = Math.abs(q - j);
        let r = R * lob[j][1] * (1 - p.lobeDepth * Math.pow(Math.min(1, 2 * dq), 1 / Math.max(0.3, p.tipShape)));
        if (Math.abs(th) > span) r = lerp(r, R * 0.22, smoothstep(span, Math.PI, Math.abs(th)));
        if (p.serration > 0) r *= 1 - p.serration * 0.12 * ((dq * p.teeth * 2) % 1);
        return Math.max(R * 0.15, r);
      };
      const N = 180, raw = [];
      for (let i = 0; i <= N; i++) { const th = -Math.PI + (TAU * i) / N, r = rAt(th) * (th > 0 ? asL : asR); raw.push([Math.cos(th) * r, Math.sin(th) * r * W]); }
      const x0 = -rAt(Math.PI), sc = 1 / (R * Math.max(...lob.map((l) => l[1])) - x0);
      for (const q of raw) pts.push([(q[0] - x0) * sc, q[1] * sc]);
      const C = [-x0 * sc, 0];
      veins.push([0, 0, C[0] * 0.5, 0, C[0], 0, 1]);
      for (const [th] of lob) {
        const r = rAt(th) * sc * 0.92, tx = C[0] + Math.cos(th) * r, ty = Math.sin(th) * r * W;
        veins.push([C[0], 0, (C[0] + tx) / 2 + Math.sin(th) * 0.02, ty / 2, tx, ty, 0.7]);
        spots.push([(C[0] * 2 + tx) / 3, ty / 3, r * 0.12]);
      }
      spots.push([C[0], 0, 0.06]);
      // low-poly: fan of facets from a raised center to the outline
      const M = Math.max(4, p.facets) * k, ring = [];
      for (let i = 0; i < M; i++) { const th = -Math.PI + (TAU * (i + 0.5)) / M, r = rAt(th) * sc; ring.push([C[0] + Math.cos(th) * r, Math.sin(th) * r * W, crumple()]); }
      const c3 = [C[0], 0, 0.12];
      for (let i = 0; i < M; i++) { const a = ring[i], b = ring[(i + 1) % M], m = [(a[0] + b[0] + c3[0] * 2) / 4, (a[1] + b[1]) / 4, 0.09 + crumple()]; tris.push([c3, a, m], [m, a, b], [c3, m, b]); }
    } else if (p.form === 'fan') {
      const span = W * 1.1, N = 120, wob = rnd() * 6;
      const rAt = (th) => {
        let r = 1 - p.lobeDepth * 0.35 * Math.exp(-((th / 0.12) ** 2));
        r *= 1 + 0.03 * Math.sin(th * 9 + wob);
        if (p.serration > 0) r *= 1 - p.serration * 0.05 * ((((th + span) / (2 * span)) * p.teeth) % 1);
        return r;
      };
      pts.push([0, 0]);
      for (let i = 0; i <= N; i++) { const th = -span + (2 * span * i) / N, r = rAt(th) * (th > 0 ? asL : asR); pts.push([Math.cos(th) * r, Math.sin(th) * r]); }
      for (let i = 0; i < p.veinCount; i++) { const th = -span * 0.92 + (1.84 * span * (i + 0.5)) / p.veinCount, r = rAt(th) * 0.95; veins.push([0.03, 0, Math.cos(th) * r * 0.5, Math.sin(th) * r * 0.45, Math.cos(th) * r, Math.sin(th) * r, 0.35]); }
      spots.push([0.55, -0.15, 0.06], [0.55, 0.15, 0.06], [0.7, 0, 0.05]);
      const M = Math.max(4, p.facets) * 2, ring = [], mid = [];
      for (let i = 0; i <= M; i++) { const th = -span + (2 * span * i) / M, r = rAt(th); ring.push([Math.cos(th) * r, Math.sin(th) * r, crumple()]); mid.push([Math.cos(th) * r * 0.5, Math.sin(th) * r * 0.5, 0.06 + crumple()]); }
      const o = [0, 0, 0];
      for (let i = 0; i < M; i++) tris.push([o, mid[i], mid[i + 1]], [mid[i], ring[i], ring[i + 1]], [mid[i], ring[i + 1], mid[i + 1]]);
    } else {
      const wp = p.widest, cord = p.cordate, N = 72;
      const hw = (u) => {
        let f;
        if (u < wp) { const t = u / wp; f = cord > 0 ? lerp(cord * 0.75, 1, Math.sin((Math.PI / 2) * t)) : Math.pow(Math.sin((Math.PI / 2) * t), 1 / p.baseShape); }
        else f = Math.pow(Math.max(0, Math.cos((Math.PI / 2) * ((u - wp) / (1 - wp)))), p.tipShape);
        if (p.lobes > 0 && p.lobeDepth > 0) f *= 1 - p.lobeDepth * Math.pow(1 - Math.abs(Math.sin(Math.PI * (p.lobes + 0.5) * u)), 2) * smoothstep(0.03, 0.15, u) * (1 - smoothstep(0.85, 1, u));
        if (p.serration > 0) f *= 1 - p.serration * 0.13 * ((u * p.teeth) % 1) * smoothstep(0.08, 0.2, u);
        return Math.max(0, f) * W * 0.5;
      };
      const xOf = (u) => (cord > 0 && u < wp ? u - cord * 0.12 * Math.pow(1 - u / wp, 2) : u);
      if (cord > 0) pts.push([cord * 0.06, 0]);
      for (let i = 0; i <= N; i++) { const u = i / N; pts.push([xOf(u), hw(u) * asL]); }
      for (let i = N; i >= 0; i--) { const u = i / N; pts.push([xOf(u), -hw(u) * asR]); }
      const bend = (rnd() - 0.5) * 0.05;
      veins.push([0, 0, 0.5, bend, 1, 0, 1]);
      for (let i = 1; i <= p.veinCount; i++) {
        const xs = 0.05 + (0.82 * i) / (p.veinCount + 1), xe = Math.min(0.97, xs + 0.1 + 0.12 * Math.min(1, W));
        for (const sd of [1, -1]) { const ye = hw(xe) * 0.88 * sd * (sd > 0 ? asL : asR); veins.push([xs, bend * xs * 2 * (1 - xs), xs + (xe - xs) * 0.25, ye * 0.6, xe, ye, 0.45]); }
      }
      for (const u of [0.3, 0.5, 0.65]) { const w = hw(u); if (w > 0.03) spots.push([u, w * 0.45, w * 0.35], [u, -w * 0.45, w * 0.35]); }
      // low-poly: midrib + both edges sampled at F stations, folded and crumpled
      const F = Math.max(2, p.facets), mid = [], lft = [], rgt = [];
      for (let j = 0; j <= F; j++) {
        const u = j / F, x = xOf(u), w = hw(u);
        mid.push([x, 0, crumple() * 0.5]); lft.push([x, w * asL, crumple()]); rgt.push([x, -w * asR, crumple()]);
      }
      for (const q of lft.concat(rgt)) q[2] += Math.abs(q[1]) * p.fold * 1.2; // the fold lifts the edges
      for (let j = 0; j < F; j++) {
        tris.push([mid[j], lft[j], lft[j + 1]], [mid[j], lft[j + 1], mid[j + 1]]);
        tris.push([mid[j], rgt[j + 1], rgt[j]], [mid[j], mid[j + 1], rgt[j + 1]]);
      }
    }
    let y0 = Infinity, y1 = -Infinity, x1 = 0;
    for (const q of pts) { if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; if (q[0] > x1) x1 = q[0]; }
    return { pts, veins, spots, tris, y0, y1, x1 };
  }

  U.register({
    id: 'leaves',
    name: 'Leaves',
    desc: 'Leaf textures for foliage cards: single leaves, twigs, sprays and clumps in realistic, low-poly and toon styles',
    uses: ['Alpha-cutout leaf textures for foliage cards and billboards inside tree crowns, bushes and ground cover, with a matching normal map.', 'Leaf sprites for particles (falling leaves), 2D games, UI and illustrations.'],
    tags: ['Nature', 'Texturing'],
    normalMap: false, // the Output menu gives the leaf / facet normals instead
    icon: U.icon('<path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14z"/><path d="M5 19L15 9M9 15h3M12 12V9" opacity=".6"/>'),
    params: [
      { type: 'section', label: 'Style' },
      { key: 'style', label: 'Style', type: 'select', default: 'realistic', options: [['realistic', 'Realistic'], ['lowpoly', 'Low-poly (facets)'], ['toon', 'Toon (flat + outline)']] },
      { key: 'layout', label: 'Layout', type: 'select', default: 'spray', options: [['single', 'Single leaf'], ['twig', 'Twig'], ['spray', 'Branch spray'], ['clump', 'Leaf clump']] },
      { key: 'size', label: 'Size', type: 'range', min: 0.5, max: 1, step: 0.01, default: 0.94, tip: 'How much of the card the leaves fill' },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: 0, show: (p) => p.layout === 'single' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 8 },
      { type: 'section', label: 'Leaf shape' },
      { key: 'shape', label: 'Leaf shape', type: 'select', default: 'oval', options: SHAPE_OPTS, apply: (v, p) => { if (SHAPES[v]) Object.assign(p, shape(v)); } },
      { key: 'form', label: 'Form', type: 'select', default: 'simple', options: [['simple', 'Simple blade'], ['palmate', 'Palmate (lobes from the center)'], ['fan', 'Fan']] },
      { key: 'leafWidth', label: 'Width', type: 'range', min: 0.03, max: 1.2, step: 0.01, default: BASE.leafWidth, tip: 'Relative to the leaf length' },
      { key: 'widest', label: 'Widest point', type: 'range', min: 0.15, max: 0.85, step: 0.01, default: BASE.widest, show: simple, tip: '0 = near the base, 1 = near the tip' },
      { key: 'baseShape', label: 'Base roundness', type: 'range', min: 0.3, max: 3, step: 0.05, default: BASE.baseShape, show: simple },
      { key: 'tipShape', label: 'Tip pointiness', type: 'range', min: 0.3, max: 3, step: 0.05, default: BASE.tipShape, show: (p) => p.form !== 'fan' },
      { key: 'cordate', label: 'Heart-shaped base', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: simple },
      { key: 'lobes', label: 'Lobes', type: 'int', min: 0, max: 9, default: 0, tip: 'Rounded lobes along the edge (simple), lobes around the center (palmate), notch (fan)' },
      { key: 'lobeDepth', label: 'Lobe depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'serration', label: 'Serration', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'teeth', label: 'Teeth', type: 'int', min: 2, max: 60, default: BASE.teeth, show: (p) => p.serration > 0 },
      { key: 'petiole', label: 'Leaf stalk', type: 'range', min: 0, max: 0.8, step: 0.01, default: BASE.petiole, tip: 'Stalk length relative to the leaf' },
      { key: 'asym', label: 'Asymmetry', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
      { type: 'section', label: 'Arrangement', show: notSingle },
      { key: 'count', label: 'Leaves', type: 'int', min: 1, max: 120, default: 12, show: notSingle, tip: 'Leaves on the main stem, or in the clump' },
      { key: 'arrange', label: 'Arrangement', type: 'select', default: 'alternate', show: branched, options: [['alternate', 'Alternate'], ['opposite', 'Opposite pairs'], ['whorled', 'Whorled (3)'], ['spiral', 'Spiral (needles)']] },
      { key: 'branches', label: 'Side branches', type: 'int', min: 0, max: 10, default: 4, show: (p) => p.layout === 'spray' },
      { key: 'branchAngle', label: 'Branch angle', type: 'range', min: 10, max: 85, step: 1, default: 42, show: (p) => p.layout === 'spray' },
      { key: 'leafLen', label: 'Leaf size', type: 'range', min: 0.05, max: 0.7, step: 0.01, default: 0.26, show: notSingle, tip: 'Relative to the main stem' },
      { key: 'sizeVar', label: 'Size variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: notSingle },
      { key: 'leafAngle', label: 'Leaf angle', type: 'range', min: 5, max: 100, step: 1, default: 48, show: branched, tip: 'Angle between leaf and stem' },
      { key: 'droop', label: 'Droop', type: 'range', min: -1, max: 1, step: 0.01, default: 0.1, show: notSingle, tip: 'Positive lets the leaves hang down, negative points them up' },
      { key: 'jitter', label: 'Angle jitter', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: notSingle },
      { key: 'stemCurve', label: 'Stem curve', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: branched },
      { key: 'terminal', label: 'Leaf at the tip', type: 'bool', default: true, show: branched },
      { type: 'section', label: 'Surface' },
      { key: 'curl', label: 'Curl / tilt', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Leaves tilt about their midrib and look narrower' },
      { key: 'fold', label: 'Fold', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'V-fold along the midrib: one half lit, one half shaded' },
      { key: 'veins', label: 'Veins', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, show: (p) => p.style !== 'lowpoly' },
      { key: 'veinCount', label: 'Side veins', type: 'int', min: 0, max: 16, default: BASE.veinCount, show: (p) => p.style !== 'lowpoly' && p.veins > 0 },
      { key: 'facets', label: 'Facet detail', type: 'int', min: 2, max: 12, default: 4, show: (p) => p.style === 'lowpoly' },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.style === 'toon' },
      { key: 'translucency', label: 'Translucency', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => p.style === 'realistic', tip: 'Light shining through: warmer, brighter leaves' },
      { key: 'gloss', label: 'Gloss', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, show: (p) => p.style === 'realistic' },
      { key: 'spots', label: 'Spots', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1, show: (p) => p.style !== 'lowpoly', tip: 'Share of the leaves with blemishes' },
      { key: 'holes', label: 'Insect holes', type: 'range', min: 0, max: 1, step: 0.01, default: 0.05, tip: 'Share of the leaves with holes eaten into them' },
      { key: 'dryEdges', label: 'Dry edges', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1, show: (p) => p.style !== 'lowpoly', tip: 'Share of the leaves with a dry, brown rim' },
      { type: 'section', label: 'Color' },
      { key: 'leafLight', label: 'Leaf light', type: 'color', default: '#a4c060' },
      { key: 'leafMid', label: 'Leaf mid', type: 'color', default: '#6e9440' },
      { key: 'leafDark', label: 'Leaf dark', type: 'color', default: '#3e6428' },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'autumn', label: 'Autumn leaves', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Share of the leaves turned to autumn colors' },
      { key: 'autumn1', label: 'Autumn color 1', type: 'color', default: '#e8b030', show: (p) => p.autumn > 0 },
      { key: 'autumn2', label: 'Autumn color 2', type: 'color', default: '#c4461c', show: (p) => p.autumn > 0 },
      { key: 'veinColor', label: 'Vein color', type: 'color', default: '#c8dc8c', show: (p) => p.style !== 'lowpoly' && p.veins > 0 },
      { key: 'dryColor', label: 'Dry color', type: 'color', default: '#8a6a3a', show: (p) => p.style !== 'lowpoly' && p.dryEdges > 0 },
      { key: 'stemColor', label: 'Stem color', type: 'color', default: '#6a5a38' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#1e2a14', show: (p) => p.style === 'toon' && p.outline > 0 },
      { type: 'section', label: 'Lighting' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -125, tip: 'Direction the light comes from (-135 = top left)' },
      { key: 'lightHeight', label: 'Light height', type: 'range', min: 10, max: 85, step: 1, default: 55 },
      { key: 'contrast', label: 'Contrast', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'depthShade', label: 'Depth darkening', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: notSingle, tip: 'Leaves behind the stems are darker' },
      { key: 'front', label: 'Leaves in front', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: notSingle, tip: 'Share of the leaves drawn over the stems' },
      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'cutout', options: [['cutout', 'Hard cutout (alpha 0 / 1)'], ['alpha', 'Color + soft alpha'], ['mask', 'Mask (white on black)'], ['normalGL', 'Normal map (OpenGL)'], ['normalDX', 'Normal map (DirectX)']], tip: 'Hard cutout: every pixel is fully opaque or fully transparent, ready for alpha testing' },
      { key: 'cutoff', label: 'Cutoff', type: 'range', min: 0.05, max: 0.95, step: 0.01, default: 0.5, show: (p) => p.output === 'cutout' },
      { key: 'normalStrength', label: 'Normal strength', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.output === 'normalGL' || p.output === 'normalDX', tip: '0 = flat, 1 = the full leaf tilt and fold' },
    ],
    presets: [
      { name: 'Beech spray', group: 'Realistic', values: {} },
      { name: 'Oak twig', group: 'Realistic', values: { shape: 'oak', ...shape('oak'), layout: 'twig', count: 9, leafLen: 0.36, leafAngle: 40, curl: 0.3, leafLight: '#98b058', leafMid: '#62843a', leafDark: '#385a22' } },
      { name: 'Birch spray', group: 'Realistic', values: { shape: 'birch', ...shape('birch'), branches: 5, count: 14, leafLen: 0.2, leafLight: '#b4cc68', leafMid: '#7ea444', leafDark: '#4a7028', stemColor: '#5a4030', droop: 0.35 } },
      { name: 'Linden heart leaves', group: 'Realistic', values: { shape: 'heart', ...shape('heart'), layout: 'twig', count: 8, leafLen: 0.34, leafAngle: 60, leafLight: '#a8c468', leafMid: '#72984a', leafDark: '#44682c' } },
      { name: 'Ash compound leaf', group: 'Realistic', values: { shape: 'lanceolate', ...shape('lanceolate'), layout: 'twig', arrange: 'opposite', count: 12, leafLen: 0.28, leafAngle: 62, petiole: 0.02, serration: 0.15, teeth: 22, stemColor: '#8a9a5a', curl: 0.25 } },
      { name: 'Willow twig', group: 'Realistic', values: { shape: 'willow', ...shape('willow'), layout: 'twig', count: 26, leafLen: 0.4, leafAngle: 28, droop: 0.55, fold: 0.6, leafLight: '#b0c478', leafMid: '#7c9850', leafDark: '#4e6a34' } },
      { name: 'Maple leaf', group: 'Realistic', values: { shape: 'maple', ...shape('maple'), layout: 'single', curl: 0, fold: 0.3, veins: 0.7 } },
      { name: 'Autumn maple leaf', group: 'Realistic', values: { shape: 'maple', ...shape('maple'), layout: 'single', curl: 0, fold: 0.3, veins: 0.7, autumn: 1, spots: 1, dryEdges: 1, autumn1: '#f0b028', autumn2: '#d03a18', seed: 3 } },
      { name: 'Maple branch (autumn)', group: 'Realistic', values: { shape: 'maple', ...shape('maple'), layout: 'spray', count: 7, branches: 3, leafLen: 0.34, leafAngle: 55, autumn: 0.8, spots: 0.3, dryEdges: 0.3, stemColor: '#7a4a2a' } },
      { name: 'Ginkgo leaf', group: 'Realistic', values: { shape: 'ginkgo', ...shape('ginkgo'), layout: 'single', curl: 0, fold: 0.15, veins: 0.4, leafLight: '#b8cc5a', leafMid: '#8aa83a', leafDark: '#5a7a24' } },
      { name: 'Ginkgo leaves (autumn)', group: 'Realistic', values: { shape: 'ginkgo', ...shape('ginkgo'), layout: 'clump', count: 14, leafLen: 0.4, curl: 0.3, fold: 0.15, veins: 0.4, autumn: 1, autumn1: '#f4d040', autumn2: '#e0a020' } },
      { name: 'Dense leaf clump', group: 'Realistic', values: { layout: 'clump', count: 40, leafLen: 0.42, sizeVar: 0.4, front: 0.7 } },
      { name: 'Ivy leaves', group: 'Realistic', values: { shape: 'maple', ...shape('maple'), lobes: 3, lobeDepth: 0.35, tipShape: 1.2, serration: 0, petiole: 0.6, layout: 'twig', count: 9, leafLen: 0.34, leafAngle: 70, gloss: 0.6, veinColor: '#d8e4b8', leafLight: '#5a8a3a', leafMid: '#2e5a22', leafDark: '#183a14', stemColor: '#6a5a3a' } },
      { name: 'Dry brown leaf', group: 'Realistic', values: { layout: 'single', shape: 'oak', ...shape('oak'), curl: 0.2, fold: 0.6, leafLight: '#a8865a', leafMid: '#7a5a38', leafDark: '#4a3420', veinColor: '#c8a878', spots: 1, holes: 1, dryEdges: 1, dryColor: '#5a3a20', translucency: 0, gloss: 0 } },
      { name: 'Insect-eaten leaves', group: 'Realistic', values: { layout: 'twig', count: 8, leafLen: 0.34, holes: 0.9, spots: 0.6, dryEdges: 0.4 } },
      { name: 'Fir needle spray', group: 'Realistic', values: { shape: 'needle', ...shape('needle'), layout: 'spray', arrange: 'opposite', count: 60, branches: 6, branchAngle: 50, leafWidth: 0.08, leafLen: 0.16, leafAngle: 65, sizeVar: 0.15, jitter: 0.15, droop: 0, curl: 0.1, fold: 0, terminal: false, leafLight: '#5e7c44', leafMid: '#3e5a2e', leafDark: '#22381c', stemColor: '#7a6040' } },
      { name: 'Pine needles', group: 'Realistic', values: { shape: 'needle', ...shape('needle'), leafWidth: 0.03, layout: 'twig', arrange: 'spiral', count: 90, leafLen: 0.4, leafAngle: 30, sizeVar: 0.2, jitter: 0.3, droop: -0.2, terminal: false, leafLight: '#6e8c48', leafMid: '#4a6a34', leafDark: '#2a4220', stemColor: '#8a6a44' } },
      { name: 'Spruce sprig', group: 'Realistic', values: { shape: 'needle', ...shape('needle'), leafWidth: 0.1, layout: 'spray', arrange: 'spiral', count: 80, branches: 5, branchAngle: 55, leafLen: 0.13, leafAngle: 55, sizeVar: 0.15, droop: 0.15, terminal: false, leafLight: '#4e7058', leafMid: '#33503e', leafDark: '#1e3426' } },
      { name: 'Low-poly leaf clump', group: 'Stylized', values: { style: 'lowpoly', layout: 'spray', count: 10, branches: 5, leafLen: 0.34, leafWidth: 0.7, tipShape: 1.6, facets: 3, fold: 0.8, curl: 0.5, jitter: 0.6, leafLight: '#a3b878', leafMid: '#7f9a5c', leafDark: '#556e40', stemColor: '#6e5444', contrast: 0.55 } },
      { name: 'Low-poly fir branch', group: 'Stylized', values: { style: 'lowpoly', shape: 'needle', ...shape('needle'), leafWidth: 0.2, tipShape: 0.7, layout: 'twig', arrange: 'alternate', count: 22, leafLen: 0.46, leafAngle: 44, droop: -0.15, sizeVar: 0.3, facets: 3, fold: 0.9, terminal: true, leafLight: '#56683e', leafMid: '#3e4e2e', leafDark: '#26321e', stemColor: '#3e4e2e' } },
      { name: 'Low-poly maple', group: 'Stylized', values: { style: 'lowpoly', shape: 'maple', ...shape('maple'), serration: 0, layout: 'single', facets: 3, curl: 0, leafLight: '#e8a848', leafMid: '#c8702c', leafDark: '#8a3c1c' } },
      { name: 'Low-poly autumn spray', group: 'Stylized', values: { style: 'lowpoly', layout: 'spray', count: 9, branches: 4, leafLen: 0.3, facets: 3, fold: 0.7, autumn: 0.9, autumn1: '#e8b040', autumn2: '#c85a24' } },
      { name: 'Toon leaf spray', group: 'Stylized', values: { style: 'toon', leafLight: '#9ad85a', leafMid: '#58a838', leafDark: '#2e7028', veins: 0.6, veinCount: 4, spots: 0, holes: 0, dryEdges: 0, curl: 0.25 } },
      { name: 'Toon single leaf', group: 'Stylized', values: { style: 'toon', layout: 'single', rotation: -30, leafLight: '#9ad85a', leafMid: '#58a838', leafDark: '#2e7028', veins: 0.7, veinCount: 5, outline: 0.6, curl: 0, spots: 0, holes: 0, dryEdges: 0 } },
      { name: 'Cartoon autumn clump', group: 'Stylized', values: { style: 'toon', shape: 'maple', ...shape('maple'), serration: 0, layout: 'clump', count: 12, leafLen: 0.45, autumn: 1, autumn1: '#ffc040', autumn2: '#f05a28', outline: 0.5, veins: 0.5, spots: 0, holes: 0, dryEdges: 0 } },
      { name: 'Alien glow leaves', group: 'Sci-fi', values: { shape: 'lanceolate', ...shape('lanceolate'), layout: 'clump', count: 22, leafLen: 0.5, leafLight: '#7af0e0', leafMid: '#2a9aa8', leafDark: '#1a3a70', veinColor: '#e0fff8', veins: 0.9, translucency: 0.8, gloss: 0.5 } },
      { name: 'Crystal leaves', group: 'Sci-fi', values: { style: 'lowpoly', shape: 'lanceolate', ...shape('lanceolate'), layout: 'spray', count: 10, branches: 4, leafLen: 0.32, facets: 2, fold: 1, leafLight: '#e0d0ff', leafMid: '#9a7ae8', leafDark: '#3a2a88', stemColor: '#5a4a9a', contrast: 0.9 } },
    ],
    render(ctx, W, H, p) {
      const rnd = U.rng(p.seed), out = p.output, style = p.style;
      const isNormal = out === 'normalGL' || out === 'normalDX', isMask = out === 'mask';
      const la = p.lightAngle * RAD, le = p.lightHeight * RAD;
      // light in plant space (y up, z toward the viewer)
      const L = [Math.cos(la) * Math.cos(le), -Math.sin(la) * Math.cos(le), Math.sin(le)];
      const C = { l: U.hex(p.leafLight), m: U.hex(p.leafMid), d: U.hex(p.leafDark), a1: U.hex(p.autumn1), a2: U.hex(p.autumn2), vein: U.hex(p.veinColor), dry: U.hex(p.dryColor), stem: U.hex(p.stemColor), ol: U.hex(p.outlineColor) };
      const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
      const css = (c, a = 1) => `rgba(${clamp(c[0], 0, 255) | 0},${clamp(c[1], 0, 255) | 0},${clamp(c[2], 0, 255) | 0},${a})`;
      const ramp = (t) => (t < 0.5 ? mix(C.d, C.m, t * 2) : mix(C.m, C.l, (t - 0.5) * 2));
      const lit = (n) => clamp(0.55 + (n[0] * L[0] + n[1] * L[1] + n[2] * L[2] - 0.72) * (0.6 + p.contrast * 2.2));
      const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      // normal map color; the strength eases every normal toward facing the viewer
      const ncol = (n0) => {
        const s = p.normalStrength, n = norm([n0[0] * s, n0[1] * s, lerp(1, n0[2], s)]);
        return [(n[0] * 0.5 + 0.5) * 255, ((out === 'normalDX' ? -n[1] : n[1]) * 0.5 + 0.5) * 255, (n[2] * 0.5 + 0.5) * 255];
      };

      // outline variants shared by all leaves
      const NV = p.layout === 'single' ? 1 : 5, variants = [];
      for (let i = 0; i < NV; i++) variants.push(buildVariant(p, rnd));

      // ---------- layout (plant space: main stem length ~ 1, y up) ----------
      const leaves = [], stems = [];
      const depthOrder = () => (rnd() < p.front ? 1 + rnd() : -1 - rnd());
      const addLeaf = (x, y, a, len, order, fore = 1) => {
        leaves.push({
          x, y, a, len: len * (1 + (rnd() - 0.5) * p.sizeVar * (p.layout === 'single' ? 0 : 1)), v: (rnd() * NV) | 0, order,
          cy: (1 - p.curl * 0.75 * rnd()) * fore, ts: rnd() < 0.5 ? -1 : 1,
          tint: rnd() - 0.5, tb: rnd(), au: rnd() < p.autumn ? 0.55 + 0.45 * rnd() : 0,
          spot: rnd() < p.spots, hole: rnd() < p.holes, dry: rnd() < p.dryEdges ? 0.4 + 0.6 * rnd() : 0, r1: rnd(), r2: rnd(),
        });
      };
      const leafDir = (sa, side, t) => {
        let a = sa + side * p.leafAngle * RAD * (1 - 0.35 * t) + (rnd() - 0.5) * p.jitter * 0.9;
        if (p.droop) a += Math.atan2(Math.sin(-Math.PI / 2 - a), Math.cos(-Math.PI / 2 - a)) * p.droop * 0.45;
        return a;
      };
      const stemLine = (x, y, a, len) => {
        const pts = [[x, y]], ang = [a], segs = 8, bend = (rnd() < 0.5 ? -1 : 1) * p.stemCurve * 0.09;
        for (let k = 0; k < segs; k++) { a += bend + (rnd() - 0.5) * 0.08 * p.jitter; const q = pts[k]; pts.push([q[0] + (Math.cos(a) * len) / segs, q[1] + (Math.sin(a) * len) / segs]); ang.push(a); }
        const at = (t) => { const f = clamp(t) * segs, k = Math.min(segs - 1, Math.floor(f)), r = f - k; return [lerp(pts[k][0], pts[k + 1][0], r), lerp(pts[k][1], pts[k + 1][1], r), ang[k + 1]]; };
        return { pts, at };
      };
      const twig = (x, y, a, len, n, w) => {
        const st = stemLine(x, y, a, len), ll = p.leafLen * Math.min(1, len + 0.4);
        stems.push({ pts: st.pts, w0: w, w1: w * 0.35 });
        const per = p.arrange === 'opposite' ? 2 : p.arrange === 'whorled' ? 3 : 1, nodes = Math.max(1, Math.ceil(n / per));
        for (let i = 0; i < nodes; i++) {
          const t = nodes > 1 ? 0.1 + (0.82 * i) / (nodes - 1) : 0.6, [px, py, pa] = st.at(t), Ls = ll * (0.75 + 0.35 * Math.sin(Math.PI * Math.min(1, t + 0.15)));
          if (p.arrange === 'spiral') {
            const ph = i * 2.39996, c = Math.cos(ph), s = Math.sin(ph), fore = Math.sqrt(1 - (s * 0.8) ** 2);
            addLeaf(px, py, pa + Math.sign(c || 1) * p.leafAngle * RAD * Math.sqrt(Math.abs(c)) * (1 - 0.3 * t) + (rnd() - 0.5) * p.jitter * 0.5, Ls * fore, s > 0 ? 1 + s : -1 + s);
          } else if (per === 1) addLeaf(px, py, leafDir(pa, i % 2 ? 1 : -1, t), Ls, depthOrder());
          else {
            addLeaf(px, py, leafDir(pa, 1, t), Ls, depthOrder());
            addLeaf(px, py, leafDir(pa, -1, t), Ls, depthOrder());
            if (per === 3) addLeaf(px, py, leafDir(pa, 0, t), Ls, 1.6, 0.55); // the one pointing at the viewer, foreshortened
          }
        }
        if (p.terminal) { const [ex, ey, ea] = st.at(1); addLeaf(ex, ey, ea + (rnd() - 0.5) * 0.2, ll * 0.95, 1.2); }
        return st;
      };
      if (p.layout === 'single') {
        addLeaf(0, 0, Math.PI / 2 + p.rotation * RAD, 1, 1);
      } else if (p.layout === 'twig') {
        twig(0, 0, Math.PI / 2 + (rnd() - 0.5) * 0.3, 1, p.count, 0.012);
      } else if (p.layout === 'spray') {
        const st = twig(0, 0, Math.PI / 2 + (rnd() - 0.5) * 0.2, 1, p.count, 0.016);
        for (let j = 0; j < p.branches; j++) {
          const t = 0.1 + (0.62 * (j + 0.5)) / p.branches, side = j % 2 ? 1 : -1, [bx, by, ba] = st.at(t), bl = 0.62 * (1 - t * 0.55) * (0.8 + 0.4 * rnd());
          twig(bx, by, ba + side * p.branchAngle * RAD * (0.8 + 0.4 * rnd()), bl, Math.max(2, Math.round(p.count * bl * 0.9)), 0.011);
        }
      } else {
        // clump: leaves radiating from the center; the stalks start behind it so the blades meet without a gap,
        // and a few small leaves on top cover the middle
        const n = p.count, inner = Math.max(2, Math.round(n * 0.2));
        for (let i = 0; i < n + inner; i++) {
          const top = i >= n, a = ((top ? i - n : i) / (top ? inner : n)) * TAU + (rnd() - 0.5) * (0.6 + p.jitter);
          const len = p.leafLen * (top ? 0.35 + 0.2 * rnd() : 0.65 + 0.5 * rnd()), r0 = -(p.petiole + 0.08) * len + p.leafLen * 0.06 * rnd();
          addLeaf(Math.cos(a) * r0, Math.sin(a) * r0, a + (rnd() - 0.5) * p.jitter, len, top ? 1.8 + rnd() * 0.2 : depthOrder());
        }
      }

      // ---------- fit everything into the card ----------
      const pet = p.petiole;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const grow = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
      for (const lf of leaves) {
        const v = variants[lf.v], c = Math.cos(lf.a), s = Math.sin(lf.a);
        for (const [lx, ly] of [[-pet, 0], [v.x1, v.y0], [v.x1, v.y1], [0, v.y0], [0, v.y1], [v.x1 * 0.5, v.y0], [v.x1 * 0.5, v.y1]]) {
          const x = lx + pet, y = ly * lf.cy;
          grow(lf.x + (x * c - y * s) * lf.len, lf.y + (x * s + y * c) * lf.len);
        }
      }
      for (const st of stems) for (const q of st.pts) grow(q[0], q[1]);
      const k = Math.min((W * p.size) / Math.max(1e-6, x1 - x0), (H * p.size) / Math.max(1e-6, y1 - y0));
      const ox = W / 2 - ((x0 + x1) / 2) * k, oy = H / 2 + ((y0 + y1) / 2) * k; // canvas = (ox + x k, oy - y k)
      const px = Math.min(W, H) / 512; // a pixel unit that scales with the export size

      // depth darkening: back leaves (order < 0) darker than front ones
      const depthF = (o) => 1 - p.depthShade * 0.45 * (o < 0 ? 0.55 + (-o - 1) * 0.45 : o === 0 ? 0.3 : Math.max(0, 2 - o) * 0.25);

      function line(a, b, c, d) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.stroke(); }
      // ---------- stems: two half strips, each facing a side ----------
      const drawStem = (st) => {
        const n = st.pts.length;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        if (style === 'toon' && p.outline > 0 && !isNormal && !isMask) {
          ctx.strokeStyle = css(C.ol);
          for (let i = 0; i < n - 1; i++) { ctx.lineWidth = lerp(st.w0, st.w1, i / (n - 1)) * k * 2 + p.outline * 6.4 * px; line(ox + st.pts[i][0] * k, oy - st.pts[i][1] * k, ox + st.pts[i + 1][0] * k, oy - st.pts[i + 1][1] * k); }
        }
        for (let i = 0; i < n - 1; i++) {
          const w = lerp(st.w0, st.w1, i / (n - 1)) * k, [ax, ay] = st.pts[i], [bx, by] = st.pts[i + 1];
          const X0 = ox + ax * k, Y0 = oy - ay * k, X1 = ox + bx * k, Y1 = oy - by * k;
          if (isMask) { ctx.strokeStyle = '#fff'; ctx.lineWidth = w * 2; line(X0, Y0, X1, Y1); continue; }
          const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1, sx = -dy / l, sy = dx / l;
          for (const sd of [1, -1]) {
            const nrm = norm([sx * sd * 0.8, sy * sd * 0.8, 0.6]);
            const col = isNormal ? ncol(nrm) : style === 'toon' ? (sd > 0 ? C.stem : mix(C.stem, [0, 0, 0], 0.3)) : mix(mix(C.stem, [0, 0, 0], 0.45), C.stem, lit(nrm) * 1.2);
            const qx = sx * sd * w * 0.5, qy = -sy * sd * w * 0.5;
            ctx.strokeStyle = css(col); ctx.lineWidth = w + 0.6;
            line(X0 + qx, Y0 + qy, X1 + qx, Y1 + qy);
          }
        }
      };

      // ---------- leaves ----------
      const leafPath = (v, lf) => {
        const path = new Path2D();
        v.pts.forEach((q, i) => (i ? path.lineTo(q[0], q[1]) : path.moveTo(q[0], q[1])));
        path.closePath();
        if (lf.hole && v.spots.length) {
          const nh = 1 + ((lf.r1 * 3) | 0);
          for (let i = 0; i < nh; i++) {
            const s = v.spots[((lf.r2 * 97 + i * 31) | 0) % v.spots.length], r = s[2] * (0.35 + 0.4 * ((lf.r1 * 7 + i) % 1));
            path.moveTo(s[0] + r, s[1]);
            path.ellipse(s[0], s[1], r, r * 0.75, 0, 0, TAU);
          }
        }
        return path;
      };
      // leaf-space normal -> plant space: tilt about the midrib, then the leaf's rotation
      const toPlant = (lf, n) => {
        const ph = Math.acos(clamp(Math.abs(lf.cy), 0, 1)) * lf.ts, cph = Math.cos(ph), sph = Math.sin(ph);
        const ny = n[1] * cph - n[2] * sph, nz = n[1] * sph + n[2] * cph, c = Math.cos(lf.a), s = Math.sin(lf.a);
        return norm([n[0] * c - ny * s, n[0] * s + ny * c, nz]);
      };
      const leafColor = (lf, I) => {
        let c = ramp(clamp(I + lf.tint * p.colorVar * 0.5));
        if (lf.au > 0) { const a = mix(C.a1, C.a2, lf.tb); c = mix(c, mix(a, mix(a, [0, 0, 0], 0.35), 1 - I), lf.au); }
        const f = (1 + (lf.tb - 0.5) * p.colorVar * 0.3) * depthF(lf.order);
        return [c[0] * f, c[1] * f, c[2] * f];
      };
      function drawVeins(v, unit, wMul, offset) {
        ctx.lineCap = 'round';
        const o = offset || 0;
        for (const [a, b, c, d, e, f, w] of v.veins) {
          ctx.lineWidth = Math.max(0.6 * unit, w * 2.2 * px * unit * wMul);
          ctx.beginPath(); ctx.moveTo(a, b + o); ctx.quadraticCurveTo(c, d + o, e, f + o); ctx.stroke();
        }
      }
      function dots(v, lf, col, alpha) {
        if (!v.spots.length) return;
        const n = 2 + ((lf.r2 * 4) | 0);
        for (let i = 0; i < n; i++) {
          const sp = v.spots[((lf.r1 * 53 + i * 17) | 0) % v.spots.length], r = sp[2] * (0.1 + 0.18 * ((lf.r2 * 13 + i * 0.37) % 1));
          const cx = sp[0] + (((lf.r1 * 29 + i * 0.61) % 1) - 0.5) * sp[2], cy = sp[1] + (((lf.r2 * 31 + i * 0.43) % 1) - 0.5) * sp[2];
          const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.8);
          rg.addColorStop(0, css(col, alpha)); rg.addColorStop(0.5, css(col, alpha * 0.8)); rg.addColorStop(0.55, `rgba(220,200,90,${alpha * 0.35})`); rg.addColorStop(1, 'rgba(220,200,90,0)');
          ctx.fillStyle = rg; ctx.fillRect(cx - r * 2, cy - r * 2, r * 4, r * 4);
        }
      }
      const drawLeaf = (lf) => {
        const v = variants[lf.v], c = Math.cos(lf.a), s = Math.sin(lf.a), Lk = lf.len * k, cy = lf.cy;
        // leaf space -> canvas (the blade starts after the stalk)
        ctx.setTransform(Lk * c, -Lk * s, -Lk * cy * s, -Lk * cy * c, ox + (lf.x + pet * c * lf.len) * k, oy - (lf.y + pet * s * lf.len) * k);
        const unit = 1 / Lk; // one canvas pixel in leaf units (along the midrib)
        const n0 = toPlant(lf, [0, 0, 1]), nL = toPlant(lf, norm([0, -p.fold * 0.9, 1])), nR = toPlant(lf, norm([0, p.fold * 0.9, 1]));
        const I0 = lit(n0), IL = lit(nL), IR = lit(nR), base = leafColor(lf, I0);
        if (pet > 0) {
          ctx.lineCap = 'round';
          ctx.strokeStyle = isMask ? '#fff' : isNormal ? css(ncol(n0)) : css(mix(C.stem, base, 0.35));
          ctx.lineWidth = Math.max(0.012, 1.4 * px * unit); line(-pet, 0, 0.02, 0);
        }
        if (style === 'lowpoly' && !isMask) {
          ctx.lineJoin = 'round'; ctx.lineWidth = 0.7 * unit;
          for (const [a, b, d] of v.tris) {
            let n = norm([(b[1] - a[1]) * (d[2] - a[2]) - (b[2] - a[2]) * (d[1] - a[1]), (b[2] - a[2]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[2] - a[2]), (b[0] - a[0]) * (d[1] - a[1]) - (b[1] - a[1]) * (d[0] - a[0])]);
            if (n[2] < 0) n = [-n[0], -n[1], -n[2]];
            const np = toPlant(lf, n), cs = css(isNormal ? ncol(np) : leafColor(lf, lit(np)));
            ctx.fillStyle = cs; ctx.strokeStyle = cs;
            ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
          }
          return;
        }
        const path = leafPath(v, lf);
        if (isMask) { ctx.fillStyle = '#fff'; ctx.fill(path, 'evenodd'); return; }
        if (isNormal) {
          ctx.fillStyle = css(ncol(n0)); ctx.fill(path, 'evenodd');
          ctx.save(); ctx.clip(path, 'evenodd');
          ctx.fillStyle = css(ncol(nL)); ctx.fillRect(-1, 0, 3, 2);
          ctx.fillStyle = css(ncol(nR)); ctx.fillRect(-1, -2, 3, 2);
          ctx.restore();
          return;
        }
        if (style === 'toon') {
          const q = (I) => (I < 0.42 ? 0.2 : I < 0.68 ? 0.5 : 0.85);
          ctx.fillStyle = css(leafColor(lf, q(I0))); ctx.fill(path, 'evenodd');
          ctx.save(); ctx.clip(path, 'evenodd');
          ctx.fillStyle = css(leafColor(lf, q(IL))); ctx.fillRect(-1, 0, 3, 2);
          ctx.fillStyle = css(leafColor(lf, q(IR))); ctx.fillRect(-1, -2, 3, 2);
          if (p.veins > 0) { ctx.strokeStyle = css(mix(base, [0, 0, 0], 0.45), p.veins * 0.8); drawVeins(v, unit, 1.3); }
          if (lf.spot) dots(v, lf, mix(base, [0, 0, 0], 0.4), 0.7);
          if (lf.dry) { ctx.strokeStyle = css(C.dry); ctx.lineWidth = lf.dry * 0.07; ctx.stroke(path); }
          ctx.restore();
          if (p.outline > 0) { ctx.strokeStyle = css(C.ol); ctx.lineWidth = p.outline * 3.2 * px * unit; ctx.lineJoin = 'round'; ctx.stroke(path); }
          return;
        }
        // ---- realistic ----
        const tipC = mix(base, mix(C.l, base, 0.5), 0.25), baseC = mix(base, [base[0] * 0.8, base[1] * 0.85, base[2] * 0.55], 0.5);
        const g = ctx.createLinearGradient(0, 0, 1, 0); g.addColorStop(0, css(baseC)); g.addColorStop(1, css(tipC));
        ctx.fillStyle = g; ctx.fill(path, 'evenodd');
        ctx.save(); ctx.clip(path, 'evenodd');
        // fold: each half lighter or darker than the leaf plane, strongest next to the midrib
        for (const [side, I] of [[1, IL], [-1, IR]]) {
          const dlt = (I - I0) * 1.3, col = dlt > 0 ? '255,255,235' : '0,0,0', a = Math.min(0.55, Math.abs(dlt));
          const gg = ctx.createLinearGradient(0, 0, 0, side * 0.5);
          gg.addColorStop(0, `rgba(${col},${a})`); gg.addColorStop(1, `rgba(${col},${a * 0.35})`);
          ctx.fillStyle = gg; ctx.fillRect(-1, side > 0 ? 0 : -2, 3, 2);
        }
        if (p.translucency > 0) { ctx.fillStyle = css(mix(C.l, [255, 240, 140], 0.4), p.translucency * 0.22); ctx.fillRect(-1, -2, 3, 4); }
        if (lf.spot) dots(v, lf, [110, 80, 30], 0.55);
        if (p.veins > 0) {
          ctx.strokeStyle = css(mix(base, [0, 0, 0], 0.5), p.veins * 0.25); drawVeins(v, unit, 1.6, 0.8 * unit); // soft shadow beside each vein
          ctx.strokeStyle = css(mix(base, C.vein, 0.5 + p.translucency * 0.4), 0.35 + p.veins * 0.5); drawVeins(v, unit, 1);
        }
        if (lf.dry) {
          ctx.lineJoin = 'round';
          ctx.strokeStyle = css(C.dry, 0.85); ctx.lineWidth = lf.dry * 0.14; ctx.stroke(path);
          ctx.strokeStyle = css(mix(C.dry, [0, 0, 0], 0.45), 0.8); ctx.lineWidth = lf.dry * 0.035; ctx.stroke(path);
        }
        if (p.gloss > 0) {
          const gx = 0.45, gy = lf.ts > 0 ? 0.12 : -0.12, rg = ctx.createRadialGradient(gx, gy, 0, gx, gy, 0.45);
          rg.addColorStop(0, `rgba(255,255,255,${p.gloss * 0.35 * clamp(I0 + 0.2)})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = rg; ctx.fillRect(-1, -2, 3, 4);
        }
        ctx.strokeStyle = css(mix(base, [0, 0, 0], 0.55), 0.45); ctx.lineWidth = 1.6 * px * unit; ctx.stroke(path);
        ctx.restore();
      };

      // ---------- draw back to front ----------
      const items = leaves.map((lf, i) => [lf.order, i, lf, false]).concat(stems.map((st, i) => [0, 1e6 + i, st, true]));
      items.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      ctx.save();
      for (const [, , it, isStem] of items) { if (isStem) drawStem(it); else drawLeaf(it); }
      ctx.restore();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (out === 'cutout' || isMask) {
        const img = ctx.getImageData(0, 0, W, H), d = img.data, cut = p.cutoff * 255;
        for (let o = 0; o < d.length; o += 4) {
          if (isMask) { const a = d[o + 3]; d[o] = d[o + 1] = d[o + 2] = a; d[o + 3] = 255; }
          else d[o + 3] = d[o + 3] >= cut ? 255 : 0;
        }
        ctx.putImageData(img, 0, 0);
      }
    },
  });
})();
