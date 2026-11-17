/* UGTG bar: shared pipeline for the linear and radial health bar generators.
   A bar is built from three components that are drawn and worn separately, so they can be exported
   as separate, pixel-aligned layers:
     back  – drop shadow + track (the empty bar) + extras (radial center disc)
     fill  – the filled part (+ glow)
     frame – the border, drawn on top
   plus an optional progress map: the fill shape at 100 % whose gray value is the position along the
   fill (0 at the start, 1 at the end), so an engine can alpha-clip it against the health value.

   A generator supplies a geometry object (all coordinates in canvas px, progress in its own units):
     k                    unit scale (px per param unit)
     len                  total progress length (px along a linear bar, degrees around a radial one)
     cells                [{ s0, s1, full? }] cells in progress units (one, or one per segment)
     path(c, cell, inset) add the outline of a cell, shrunk by `inset` px, to the current path
     region(c, s0, s1)    add a generous region covering progress s0..s1 (used as a clip)
     t(x, y)              progress 0..1 at a canvas point (for the progress map)
     along(c, c1, c2)     gradient from fill start (c1) to fill end (c2)
     across(c, stops)     gradient across the bar, stop 0 = light side (top / outer)
     extraBack(c, p)      optional, drawn on the back layer */
(function () {
  'use strict';
  const U = window.UGTG;

  U.barParams = (o = {}) => [
    { type: 'section', label: 'Fill' },
    { key: 'fillMode', label: 'Fill style', type: 'select', default: 'across', options: [['solid', 'Solid'], ['along', 'Gradient along the bar'], ['across', 'Gradient across the bar'], ['value', 'Color by fill amount']] },
    { key: 'fillColor', label: 'Fill color', type: 'color', default: o.fill || '#d8342b' },
    { key: 'fillColor2', label: 'Second color', type: 'color', default: o.fill2 || '#8a1712', show: (p) => p.fillMode !== 'solid', tip: 'Gradient end / dark side; for "by fill amount" the color when (almost) empty' },
    { key: 'fillAlpha', label: 'Fill opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'fillEnd', label: 'Fill end', type: 'select', default: 'cut', show: () => !o.noCells, options: [['cut', 'Cut straight'], ['shaped', 'Shaped like the bar']], tip: '"Shaped" keeps the bar\'s rounded / chamfered ends on the moving fill end' },
    { key: 'pad', label: 'Fill padding', type: 'range', min: 0, max: 20, step: 0.25, default: 1.5, tip: 'Gap between border and fill (' + o.unit + ')' },
    { key: 'shine', label: 'Shine', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Light band on the top / outer side of the fill' },
    { key: 'shade', label: 'Shade', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Darkens the bottom / inner side of the fill' },
    { type: 'section', label: 'Frame' },
    { key: 'borderW', label: 'Border thickness', type: 'range', min: 0, max: 24, step: 0.25, default: o.border == null ? 2 : o.border, tip: o.unit },
    { key: 'borderColor', label: 'Border color', type: 'color', default: '#0c0d0f', show: (p) => p.borderW > 0 },
    { key: 'borderAlpha', label: 'Border opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: (p) => p.borderW > 0 },
    { key: 'trackColor', label: 'Background color', type: 'color', default: '#1d1f22', tip: 'The empty part of the bar' },
    { key: 'trackAlpha', label: 'Background opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85 },
    { type: 'section', label: 'Segments' },
    { key: 'segments', label: 'Segments', type: 'int', min: 1, max: 60, default: 1, tip: '1 = one continuous bar' },
    { key: 'segGap', label: 'Segment gap', type: 'range', min: 0, max: o.gapMax || 20, step: 0.25, default: o.gap || 2, show: (p) => p.segments > 1, tip: o.gapUnit || o.unit },
    { key: 'segMode', label: 'Segment style', type: 'select', default: 'fill', options: [['fill', 'Gaps cut the fill only'], ['cells', 'Separate cells (own border)']], show: (p) => p.segments > 1 && !o.noCells },
    { type: 'section', label: 'Effects' },
    { key: 'glow', label: 'Fill glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'glowSize', label: 'Glow size', type: 'range', min: 1, max: 40, step: 0.5, default: 8, show: (p) => p.glow > 0, tip: o.unit },
    { key: 'glowColor', label: 'Glow color', type: 'color', default: o.fill || '#d8342b', show: (p) => p.glow > 0 },
    { key: 'shadowAlpha', label: 'Drop shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'shadowBlur', label: 'Shadow blur', type: 'range', min: 0, max: 30, step: 0.5, default: 3, show: (p) => p.shadowAlpha > 0, tip: o.unit },
    { key: 'shadowY', label: 'Shadow offset', type: 'range', min: -20, max: 20, step: 0.5, default: 1.5, show: (p) => p.shadowAlpha > 0, tip: o.unit },
    ...U.wearParams({ target: [['all', 'Everything'], ['fill', 'Fill only'], ['frame', 'Border + background only']] }),
    { key: 'seed', label: 'Seed', type: 'seed', default: 7 },
    { type: 'section', label: 'Output' },
    { key: 'split', label: 'Separate layer export', type: 'bool', default: true, tip: 'Download background and fill as separate, aligned PNGs (fill at 100 % so the engine can mask / scale it)' },
    { key: 'splitFrame', label: 'Border as its own top layer', type: 'bool', default: false, show: (p) => p.split, tip: 'Otherwise the border is part of the background layer' },
    { key: 'fullFill', label: 'Fill layer at 100 %', type: 'bool', default: true, show: (p) => p.split, tip: 'Export the fill completely full regardless of the preview amount' },
    { key: 'progressMap', label: 'Progress map layer', type: 'bool', default: false, show: (p) => p.split, tip: 'Extra grayscale layer: value = position along the fill (0 start, 1 end), alpha = fill shape. In the engine: show fill where value ≤ health' },
    { key: 'view', label: 'Preview layer', type: 'select', default: 'all', options: [['all', 'Everything (combined)'], ['back', 'Background layer'], ['fill', 'Fill layer'], ['frame', 'Border layer'], ['mask', 'Progress map']], tip: 'Preview only, the export uses the settings above' },
  ];

  /* the files of a separate-layer export, or null for one combined image */
  U.barLayers = (p) => {
    if (!p.split) return null;
    const out = [{ id: 'back', suffix: 'bg' }, { id: 'fill', suffix: 'fill' }];
    if (p.splitFrame) out.push({ id: 'frame', suffix: 'frame' });
    if (p.progressMap) out.push({ id: 'mask', suffix: 'progress' });
    return out;
  };

  /* progress range covered by fill amount v */
  U.barSpan = (dir, len, v) => {
    if (dir === 'center') return [(len * (1 - v)) / 2, (len * (1 + v)) / 2];
    return [0, len * v];
  };

  function fillStyle(c, p, g, v) {
    const a = p.fillAlpha;
    if (p.fillMode === 'along') return g.along(c, U.rgba(p.fillColor, a), U.rgba(p.fillColor2, a));
    if (p.fillMode === 'across') return g.across(c, [[0, U.rgba(p.fillColor, a)], [1, U.rgba(p.fillColor2, a)]]);
    if (p.fillMode === 'value') {
      const A = U.hex(p.fillColor), B = U.hex(p.fillColor2), f = U.smoothstep(0, 1, v);
      return `rgba(${U.lerp(B[0], A[0], f) | 0},${U.lerp(B[1], A[1], f) | 0},${U.lerp(B[2], A[2], f) | 0},${a})`;
    }
    return U.rgba(p.fillColor, a);
  }

  function drawFill(p, g, W, H, v, glow) {
    const out = U.canvas(W, H);
    if (v <= 0) return out;
    const k = g.k, ins = p.borderW * k + p.pad * k;
    const segFill = p.segments > 1 && (p.segMode === 'fill' || g.single);
    const [s0, s1] = U.barSpan(g.dir, g.len, v);
    const F = glow ? U.canvas(W, H) : out, c = F.getContext('2d');
    c.save();
    // clip to the fill amount (cut) and the segment cells
    // shape bars (g.single) always clip: their outline doesn't follow the progress axis
    const shaped = p.fillEnd === 'shaped' && p.segMode !== 'cells' && !g.single;
    if (!shaped) { c.beginPath(); g.region(c, s0, s1); c.clip(); }
    if (segFill) { c.beginPath(); for (const cell of g.segs) g.region(c, cell.s0, cell.s1); c.clip(); }
    c.beginPath();
    if (shaped) g.path(c, { s0, s1, full: v >= 1 && g.cells[0].full }, ins);
    else for (const cell of g.cells) g.path(c, cell, ins);
    c.fillStyle = fillStyle(c, p, g, v);
    c.fill();
    // shine (light side) + shade (dark side), kept inside the fill
    if (p.shine > 0 || p.shade > 0) {
      c.clip();
      c.fillStyle = g.across(c, [[0, `rgba(255,255,255,${p.shine * 0.8})`], [0.45, 'rgba(255,255,255,0)'], [0.55, 'rgba(0,0,0,0)'], [1, `rgba(0,0,0,${p.shade * 0.7})`]]);
      c.fillRect(0, 0, W, H);
    }
    c.restore();
    if (glow) {
      const o = out.getContext('2d');
      o.save();
      o.shadowColor = U.rgba(p.glowColor, Math.min(1, p.glow * 1.2));
      o.shadowBlur = p.glowSize * k;
      o.drawImage(F, 0, 0);
      if (p.glow > 0.5) o.drawImage(F, 0, 0);
      o.restore();
      o.drawImage(F, 0, 0);
    }
    return out;
  }

  function drawBack(p, g, W, H) {
    const out = U.canvas(W, H), c = out.getContext('2d'), k = g.k;
    const outline = () => { c.beginPath(); for (const cell of g.cells) g.path(c, cell, 0); };
    if (p.shadowAlpha > 0) {
      c.save();
      c.shadowColor = `rgba(0,0,0,${p.shadowAlpha})`;
      c.shadowBlur = p.shadowBlur * k;
      c.shadowOffsetY = p.shadowY * k;
      c.fillStyle = '#000';
      outline(); c.fill();
      c.restore();
      // keep only the shadow: a see-through track must not show the black casting body
      c.save(); c.globalCompositeOperation = 'destination-out'; outline(); c.fill(); c.restore();
    }
    if (g.extraBack) g.extraBack(c, p);
    if (p.trackAlpha > 0) {
      c.beginPath();
      for (const cell of g.cells) g.path(c, cell, p.borderW * k * 0.5);
      c.fillStyle = U.rgba(p.trackColor, p.trackAlpha);
      c.fill();
    }
    return out;
  }

  function drawFrame(p, g, W, H) {
    const out = U.canvas(W, H), c = out.getContext('2d'), b = p.borderW * g.k;
    if (b > 0 && p.borderAlpha > 0) {
      c.beginPath();
      for (const cell of g.cells) { g.path(c, cell, 0); g.path(c, cell, b); }
      c.fillStyle = U.rgba(p.borderColor, p.borderAlpha);
      c.fill('evenodd');
    }
    if (g.extraFrame) g.extraFrame(c, p); // e.g. a glass gloss on top of everything
    return out;
  }

  U.barRender = (ctx, W, H, p, opts, g) => {
    opts = opts || {};
    const layer = opts.layer || (opts.preview ? p.view || 'all' : 'all');
    const sep = layer !== 'all';
    const v = sep && p.fullFill && p.split ? 1 : U.clamp(p.value);
    const wear = U.wearActive(p), S = Math.min(W, H);
    let sil = null;
    if (wear && p.edgeWear > 0) {
      // edge wear follows the outline of the whole bar, not of each separately drawn part
      sil = U.canvas(W, H);
      const sc = sil.getContext('2d');
      sc.beginPath(); for (const cell of g.cells) g.path(sc, cell, 0); sc.fill();
    }
    const F = wear ? U.wearFields(W, H, p, S, sil) : null;
    const gOn = (part) => p.grungeOn === 'all' || p.grungeOn === part;
    const finish = (cv, part) => {
      if (!wear) return cv;
      if (gOn(part)) U.wearScratches(cv.getContext('2d'), W, H, p, S);
      return U.imageCanvas(U.wearApply(cv, p, F, { grunge: gOn(part) }));
    };

    if (layer === 'mask') {
      let m = drawFill(Object.assign({}, p, { fillMode: 'solid', fillColor: '#ffffff', fillAlpha: 1, shine: 0, shade: 0 }), g, W, H, 1, false);
      if (wear && gOn('fill')) U.wearScratches(m.getContext('2d'), W, H, p, S);
      const img = wear ? U.wearApply(m, p, F, { grunge: gOn('fill'), t: g.t }) : U.wearApply(m, Object.assign({}, p, { distort: 0 }), { W, H, S }, { grunge: false, color: false, t: g.t });
      ctx.putImageData(img, 0, 0);
      return;
    }
    const parts = [];
    if (layer === 'all' || layer === 'back') parts.push(finish(drawBack(p, g, W, H), 'frame'));
    if (layer === 'all' || layer === 'fill') parts.push(finish(drawFill(p, g, W, H, v, p.glow > 0), 'fill'));
    if (layer === 'all' || layer === 'frame' || (layer === 'back' && !(p.split && p.splitFrame))) parts.push(finish(drawFrame(p, g, W, H), 'frame'));
    for (const cv of parts) ctx.drawImage(cv, 0, 0);
  };
})();
