/* Metallic map mode: turns the rendered texture into a grayscale metallic map (white = metal, black =
   dielectric). Uses the same remap as the smoothness mode (js/smooth.js): a source (brightness, a channel,
   alpha or the generator's height map) is mapped into a metallic range (min … max), shaped by a curve and
   optionally blurred. Every generator gets a suggested range for its material with a short note: most
   surfaces (stone, wood, soil, plants, paint) are non-metal and export black; metal parts (brass, wire,
   bare steel under scratches) get high values. The suggestion is the starting point and can be restored. */
(function () {
  'use strict';
  const U = window.UGTG;

  // suggested settings per generator id: [min, max, source, invertSource, note, curve?]
  const NON_METAL = [0, 0, 'luma', false, 'Non-metal (dielectric): metallic 0 everywhere. Raise the range only for painted-over or embedded metal'];
  const SUGGEST = {
    material: [0, 0.35, 'luma', true, 'Wood and marble are non-metal (set the range to 0); for rust, flaky dark rust ~0–0.3, raise the max where bare steel shows'],
    'weapon-skin': [0, 0.6, 'luma', false, 'Paint is non-metal; the bright, worn edges show bare metal. Raise the max for exposed metal parts'],
    bullet: [0.9, 1, 'a', false, 'Brass, copper and steel cases are metal: 1 where the bullet is'],
    fence: [0.7, 1, 'a', false, 'Galvanized or bare wire is metal; painted or rusty wire lower'],
    scratches: [0, 1, 'luma', false, 'Scratches through paint expose bare metal: bright scratches become metallic'],
    impact: [0, 0.7, 'luma', false, 'Bullet holes in metal: torn bare edges metallic, soot and paint not'],
    solar: [0, 0.4, 'luma', false, 'Cells and glass are non-metal; bright frame and busbars can go metallic'],
    alien: [0, 1, 'luma', false, 'Sci-fi artifacts: bright parts metal, dark parts not; tighten the range for mixed materials'],
    grime: [0, 1, 'a', true, 'For metal surfaces: dirt is non-metal, so metallic drops where the grime is'],
    noise: [0, 1, 'luma', false, 'Generic noise as a metal mask: bright = metal'],
    pattern: [0, 1, 'luma', false, 'Pattern as a metal mask: inlays, studs or plates; pick which side is metal with Invert source'],
    flowfield: [0, 1, 'luma', false, 'Flowfield as a metal mask: bright = metal'],
    debris: NON_METAL,
    carbon: [0, 1, 'metalmask', false, 'Composites (carbon, aramid, glass) are non-metal; the metal patterns (knurl, mesh, hatch, dimples) are 1; dust is non-metal', 1],
    'metal-surface': [0, 1, 'metalmask', false, 'Bare metal (incl. worn edges and scratches through paint) is 1; rust, verdigris, patina, paint and dirt are non-metal (tarnish stays half metallic)', 1],
    moss: [0, 0.2, 'tips', false, 'Moss is non-metal; a touch of metallic on the leaf tips (the curve keeps it on the brightest ones) adds the waxy, shimmering sheen of moss in engines without a sheen slot. Set the range to 0 for strict PBR', 1.6],
  };
  const sug = (gen) => SUGGEST[gen && gen.id] || NON_METAL;

  // PBR generators plus the ones with a metal suggestion; a generator can opt out with `metalMap: false` or in with `metalMap: true`
  U.hasMetal = (gen) => !!gen && gen.metalMap !== false && (gen.metalMap === true || (gen.tags || []).includes('PBR') || gen.id in SUGGEST);
  U.metalNote = (gen) => sug(gen)[4];

  U.metalDefaults = (gen) => {
    const [min, max, source, invertSource, , curve] = sug(gen), decal = !!gen && !(gen.tags || []).some((t) => t === 'PBR' || t === 'Texturing');
    return { min, max, source: U.validSource(gen, source), invertSource, curve: curve || 1, blur: 0, alpha: decal ? 'keep' : 'fill', bgValue: 0, wrap: !!(gen && gen.tileable) };
  };

  U.metalParams = (gen) => [
    { type: 'section', label: 'Metallic' },
    { key: 'min', key2: 'max', label: 'Metallic range', type: 'span', min: 0, max: 1, step: 0.01, default: 0, default2: 0, tip: 'Metallic where the source is darkest … where it is brightest (0 = non-metal, 1 = metal)' },
    {
      type: 'button', buttons: [{
        label: 'Use suggestion', tip: 'Restore the suggested range and source for this generator',
        run: (v) => Object.assign(v, U.metalDefaults(gen), { alpha: v.alpha, bgValue: v.bgValue, wrap: v.wrap }),
      }],
    },
    {
      key: 'source', label: 'Source', type: 'select', default: 'luma',
      options: U.mapSourceOptions(gen),
      tip: 'Which part of the texture drives the metallic value',
    },
    { key: 'invertSource', label: 'Invert source', type: 'bool', default: false, tip: 'Dark parts metallic instead of bright ones' },
    { key: 'curve', label: 'Curve', type: 'range', min: 0.25, max: 4, step: 0.01, default: 1, tip: 'Below 1 pushes values toward max, above 1 toward min. Metal is usually all or nothing: a strong curve separates it' },
    { key: 'blur', label: 'Smoothing', type: 'range', min: 0, max: 8, step: 0.25, default: 0, tip: 'Blurs the source first: softer transitions between metal and non-metal (px @ 512)' },
    { key: 'alpha', label: 'Transparency', type: 'select', default: 'fill', options: [['fill', 'Opaque (fill transparent areas)'], ['keep', 'Keep the texture\'s alpha (decals)']] },
    { key: 'bgValue', label: 'Fill value', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.alpha === 'fill', tip: 'Metallic where the texture is transparent' },
    { key: 'wrap', label: 'Wrap edges', type: 'bool', default: false, show: (p) => p.blur > 0, tip: 'Blur across the borders for tileable textures' },
  ];

  // same remap as the smoothness map, never inverted at the end
  U.metalMap = (src, p, heightSrc) => U.smoothMap(src, Object.assign({}, p, { roughness: false }), heightSrc);
})();
