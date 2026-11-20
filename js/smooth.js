/* Smoothness / roughness map mode: turns the rendered texture into a grayscale smoothness map. A source
   (brightness, a color channel, alpha or the generator's own height map) is remapped into a smoothness
   range (min … max), shaped by a curve and optionally blurred; "Output roughness" inverts the result for
   engines that expect roughness (Unreal, glTF, Godot) instead of smoothness (Unity). Every generator gets a
   suggested range for its material (e.g. rough brick 0.08–0.35, water 0.85–0.98) with a short note, which
   is also the mode's starting point and can be restored with one click. */
(function () {
  'use strict';
  const U = window.UGTG;

  // suggested settings per generator id: [min, max, source, invertSource, note]
  const SUGGEST = {
    bricks: [0.08, 0.35, 'luma', true, 'Brick and mortar are rough; the (darker) brick faces slightly smoother than the light mortar joints'],
    planks: [0.25, 0.55, 'luma', false, 'Sealed or worn wood; raise the max for varnished floors'],
    plaster: [0.05, 0.3, 'luma', false, 'Plaster and concrete are very rough; polished concrete can go up to 0.6'],
    paving: [0.1, 0.4, 'luma', false, 'Stone paving: rough joints, slightly smoother worn tops'],
    'rubber-floor': [0.25, 0.55, 'luma', false, 'Rubber and PVC: satin; vinyl tiles a bit smoother'],
    sand: [0.05, 0.3, 'luma', false, 'Dry sand is rough; wet sand up to 0.6'],
    gravel: [0.05, 0.35, 'height', false, 'Gravel is rough, stone tops a bit smoother; wet pebbles up to 0.7'],
    mud: [0.05, 0.75, 'luma', true, 'Dry dirt is rough; wet mud and puddles glossy (the dark wet parts get the high values)'],
    leaves: [0.2, 0.45, 'luma', false, 'Leaves are satin, bark rough; waxy leaves up to 0.6'],
    material: [0.2, 0.7, 'luma', false, 'Wood ~0.3–0.5, polished marble up to 0.9, rust stays below 0.3'],
    camo: [0.15, 0.35, 'luma', false, 'Fabric and painted cloth are matte'],
    grass: [0.1, 0.35, 'luma', false, 'Vegetation is mostly matte; dew can push it up'],
    'ice-snow': [0.35, 0.9, 'luma', false, 'Snow is matte (~0.3), smooth ice glossy (~0.9)'],
    'water-normal': [0.85, 0.98, 'luma', false, 'Water is almost a mirror'],
    noise: [0.2, 0.8, 'luma', false, 'Generic noise: a wide range to break up a surface'],
    pattern: [0.3, 0.7, 'luma', false, 'Pattern masks: pick the range of the two materials they separate'],
    flowfield: [0.3, 0.7, 'luma', false, 'Flowfield masks: pick the range of the two materials they separate'],
    alien: [0.3, 0.9, 'luma', false, 'Detail maps: strong contrast between matte and glossy areas suits artifacts'],
    grime: [0.1, 0.6, 'a', true, 'Dirt roughens a surface: where the grime is, smoothness drops'],
    scratches: [0.3, 0.8, 'luma', true, 'Scratches roughen a polished surface: bright scratches become rough'],
    debris: [0.2, 0.75, 'luma', false, 'Glass and glaze glossy, stone and concrete rough'],
    maggots: [0.45, 0.85, 'luma', false, 'Wet, slimy bodies are glossy'],
    splatter: [0.55, 0.92, 'a', false, 'Fresh blood is wet and glossy; dried blood ~0.3–0.5'],
    'blood-pool': [0.6, 0.95, 'a', false, 'A fresh pool is wet and glossy; dried crust ~0.3–0.5'],
    graffiti: [0.3, 0.6, 'a', false, 'Spray paint is satin; wet blood writing up to 0.9'],
    impact: [0.1, 0.5, 'luma', false, 'Torn material and soot are rough; bare metal edges a bit smoother'],
    fence: [0.35, 0.7, 'luma', false, 'Painted or galvanized metal; rusty wire lower'],
    insect: [0.4, 0.8, 'luma', false, 'Chitin shells are glossy'],
    bullet: [0.5, 0.9, 'luma', false, 'Brass and copper are polished metal'],
    symbol: [0.3, 0.6, 'a', false, 'Painted symbols: satin paint'],
  };
  const DEF = [0.2, 0.8, 'luma', false, 'Generic range: bright parts smooth, dark parts rough'];
  const sug = (gen) => SUGGEST[gen && gen.id] || DEF;

  // every Texturing / Decals generator unless it opts out with `smoothMap: false`; others opt in with `smoothMap: true`
  U.hasSmooth = (gen) => !!gen && (gen.smoothMap === true || (gen.smoothMap !== false && (gen.tags || []).some((t) => t === 'Texturing' || t === 'Decals')));
  U.smoothNote = (gen) => sug(gen)[4];

  U.smoothDefaults = (gen) => {
    const [min, max, source, invertSource] = sug(gen), decal = !!gen && !(gen.tags || []).includes('Texturing');
    return { min, max, source: source === 'height' && !gen.heightMap ? 'luma' : source, invertSource, curve: 1, blur: 0, roughness: false, alpha: decal ? 'keep' : 'fill', bgValue: 0, wrap: !!(gen && gen.tileable) };
  };

  // the panel settings (built per generator: the "Use suggestion" button and the Height source depend on it)
  U.smoothParams = (gen) => [
    { type: 'section', label: 'Smoothness' },
    { key: 'roughness', label: 'Output roughness (invert)', type: 'bool', default: false, tip: 'Off: smoothness / glossiness (Unity, white = shiny). On: roughness (Unreal, glTF, Godot, Blender; white = rough)' },
    { key: 'min', label: 'Smoothness min', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Smoothness where the source is darkest' },
    { key: 'max', label: 'Smoothness max', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, tip: 'Smoothness where the source is brightest' },
    {
      type: 'button', buttons: [{
        label: 'Use suggestion', tip: 'Restore the suggested range and source for this generator',
        run: (v) => Object.assign(v, U.smoothDefaults(gen), { roughness: v.roughness, alpha: v.alpha, bgValue: v.bgValue, wrap: v.wrap }),
      }],
    },
    {
      key: 'source', label: 'Source', type: 'select', default: 'luma',
      options: [['luma', 'Brightness'], ['r', 'Red channel'], ['g', 'Green channel'], ['b', 'Blue channel'], ['a', 'Alpha (coverage)']].concat(gen && gen.heightMap ? [['height', 'Height map']] : []),
      tip: 'Which part of the texture drives the smoothness',
    },
    { key: 'invertSource', label: 'Invert source', type: 'bool', default: false, tip: 'Dark parts smooth instead of bright ones' },
    { key: 'curve', label: 'Curve', type: 'range', min: 0.25, max: 4, step: 0.01, default: 1, tip: 'Below 1 pushes values toward max, above 1 toward min' },
    { key: 'blur', label: 'Smoothing', type: 'range', min: 0, max: 8, step: 0.25, default: 0, tip: 'Blurs the source first: softer transitions between matte and glossy (px @ 512)' },
    { key: 'alpha', label: 'Transparency', type: 'select', default: 'fill', options: [['fill', 'Opaque (fill transparent areas)'], ['keep', 'Keep the texture\'s alpha (decals)']] },
    { key: 'bgValue', label: 'Fill value', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.alpha === 'fill', tip: 'Smoothness where the texture is transparent (before the roughness invert)' },
    { key: 'wrap', label: 'Wrap edges', type: 'bool', default: false, show: (p) => p.blur > 0, tip: 'Blur across the borders for tileable textures' },
  ];

  function blur(h, W, H, r, wrap) {
    const tmp = new Float32Array(h.length), inv = 1 / (2 * r + 1);
    const ix = (i, n) => (wrap ? ((i % n) + n) % n : i < 0 ? 0 : i >= n ? n - 1 : i);
    const pass = (src, dst, len, lines, step, lineStep) => {
      for (let l = 0; l < lines; l++) {
        const o = l * lineStep;
        let s = 0;
        for (let k = -r; k <= r; k++) s += src[o + ix(k, len) * step];
        for (let i = 0; i < len; i++) { dst[o + i * step] = s * inv; s += src[o + ix(i + r + 1, len) * step] - src[o + ix(i - r, len) * step]; }
      }
    };
    for (let n = 0; n < 2; n++) { pass(h, tmp, W, H, 1, W); pass(tmp, h, H, W, W, 1); }
  }

  /* src: the rendered texture; heightSrc: the generator's height map (when the source is 'height') */
  U.smoothMap = (src, p, heightSrc) => {
    const W = src.width, H = src.height, N = W * H;
    const d = src.getContext('2d').getImageData(0, 0, W, H).data;
    const hd = p.source === 'height' && heightSrc ? heightSrc.getContext('2d').getImageData(0, 0, W, H).data : null;
    const ch = { r: 0, g: 1, b: 2, a: 3 }[p.source];
    const v = new Float32Array(N), cov = new Float32Array(N);
    for (let i = 0, k = 0; i < N; i++, k += 4) {
      const a = d[k + 3] / 255;
      let x = hd ? hd[k] / 255 : ch === undefined ? (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) / 255 : d[k + ch] / 255;
      if (p.invertSource) x = 1 - x;
      v[i] = x; cov[i] = a;
    }
    const r = Math.round(p.blur * (Math.max(W, H) / 512));
    if (r > 0) blur(v, W, H, r, p.wrap);
    const out = U.canvas(W, H), oc = out.getContext('2d'), img = oc.createImageData(W, H), o = img.data;
    const lo = p.min, hi = p.max, keep = p.alpha === 'keep', alphaSrc = p.source === 'a';
    for (let i = 0, k = 0; i < N; i++, k += 4) {
      let s = lo + (hi - lo) * Math.pow(Math.min(1, Math.max(0, v[i])), p.curve);
      // fill mode: transparent texture areas blend toward the fill value (alpha as source already is the coverage)
      if (!keep && !alphaSrc) s = p.bgValue + (s - p.bgValue) * cov[i];
      if (p.roughness) s = 1 - s;
      const g = Math.round(Math.min(1, Math.max(0, s)) * 255);
      o[k] = o[k + 1] = o[k + 2] = g;
      o[k + 3] = keep ? d[k + 3] : 255;
    }
    oc.putImageData(img, 0, 0);
    return out;
  };
})();
