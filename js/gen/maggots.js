/* Maggots: a flat decal of fly larvae (or other grubs) seen from above, to lay on a quad over a corpse,
   food or the floor, like the debris decal: scatter, a centered pile or several clusters, optionally
   shaped by a noise mask; nothing ever touches the texture edge (edge margin + soft density fade).
   Every maggot is a tapered, segmented tube along a bent spine (blunt rear with two spiracles, pointed
   head with dark mouth hooks), shaded as a cylinder lit from one direction, with a see-through gut line,
   creases between the segments, a wet highlight, a soft contact shadow and an optional slime stain.
   Animation (twitching): Tilesheet mode renders a seamless loop as an N×N flipbook, or the frame
   sequence export downloads N separate PNGs. Each maggot bends, swings its head and squeezes a
   contraction wave along its body, on whole cycles per loop so the last frame runs into the first.
   Output: transparent decal, on a ground color, or a height map; normal map mode uses that height map. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const TAU = Math.PI * 2, RAD = Math.PI / 180;

  const mix = (A, B, t) => [lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)];
  const css = (c, a = 1) => `rgba(${clamp(c[0], 0, 255) | 0},${clamp(c[1], 0, 255) | 0},${clamp(c[2], 0, 255) | 0},${a})`;
  // sine bent toward a square wave: 0 = smooth wiggle, 1 = snaps between two poses (twitch)
  const snap = (x, jerk) => { const s = Math.sin(x); return Math.sign(s) * Math.pow(Math.abs(s), 1 - 0.8 * jerk); };

  const useMask = (p) => p.mask;
  /* where maggots may lie, 0..1: fades out toward the texture edge, optionally shaped by a noise mask */
  function densityFn(p, W, H) {
    const S = Math.min(W, H), em = p.edgeMargin * S, ef = Math.max(1, p.edgeFade * S), ms = p.maskScale / S, seed = (p.seed | 0) + 17;
    const th = 0.68 - p.maskCover * 0.36, soft = 0.02 + p.maskSoft * 0.2;
    return (x, y) => {
      const d = p.falloff === 'rect' ? Math.min(x, y, W - x, H - y) : (1 - Math.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2))) * (S / 2);
      let v = smoothstep(em, em + ef, d);
      if (useMask(p) && v > 0) v *= smoothstep(th - soft, th + soft, U.fractal('perlin', x * ms, y * ms, 0, 0, 4, 0.5, 'fbm', seed));
      return v;
    };
  }

  function densityCanvas(p, W, H) {
    const n = 160, dens = densityFn(p, W, H), cw = Math.max(1, Math.round((n * W) / Math.max(W, H))), ch = Math.max(1, Math.round((n * H) / Math.max(W, H)));
    const c = U.canvas(cw, ch), g = c.getContext('2d'), img = g.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const o = (y * cw + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = dens(((x + 0.5) * W) / cw, ((y + 0.5) * H) / ch) * 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* lay out maggots (never depends on the animation time, so every frame has the same ones) */
  function layout(p, W, H) {
    const S = Math.min(W, H), r = U.rng(p.seed | 0), out = [], dens = densityFn(p, W, H);
    const Lmax = p.size * S, Lmin = Lmax * (1 - p.sizeVar);
    const em = Math.max(2, (p.shadowDist + p.shadowSize) * (S / 512));
    // cluster centers: kept away from the edge so their maggots have room
    const centers = [];
    if (p.layout === 'clusters') {
      for (let i = 0, tries = 0; i < p.clusters && tries < 400; tries++) {
        const x = W * (0.15 + 0.7 * r()), y = H * (0.15 + 0.7 * r());
        if (dens(x, y) > 0.6) { centers.push([x, y]); i++; }
      }
      if (!centers.length) centers.push([W / 2, H / 2]);
    }
    let tries = 0;
    while (out.length < p.count && tries++ < p.count * 40) {
      const L = Lmin + (Lmax - Lmin) * Math.pow(r(), 0.7);
      let x, y;
      if (p.layout === 'pile' || p.layout === 'clusters') {
        const [ox, oy] = p.layout === 'pile' ? [W / 2, H / 2] : centers[(r() * centers.length) | 0];
        const sp = p.layout === 'pile' ? p.spread * 0.42 : p.spread * 0.16;
        const u = Math.max(1e-6, r()), d = Math.sqrt(-2 * Math.log(u)) * sp * (S / 2), a = r() * TAU;
        x = ox + Math.cos(a) * d; y = oy + Math.sin(a) * d;
      } else { x = r() * W; y = r() * H; }
      if (r() > dens(x, y)) continue;
      // reach while animating: half the body plus head swing / bending, plus the shadow
      const reach = L * 0.56 + L * p.thick * 0.5 + em;
      if (x < reach || y < reach || x > W - reach || y > H - reach) continue;
      if (!p.overlap && out.some((m) => Math.hypot(m.x - x, m.y - y) < (m.L + L) * 0.42)) continue;
      const rot = p.dir * RAD + (r() - 0.5) * TAU * (1 - p.align);
      out.push({
        x, y, L, rot,
        bend: (r() - 0.5) * 2 * p.bend * 1.6, // resting curl (radians over the body)
        tone: r(), gut: 0.6 + r() * 0.4,
        // animation: whole cycles per loop keep the sheet seamless
        active: r() < p.activity,
        cB: 1 + ((r() * p.rate) | 0), cH: 1 + ((r() * p.rate) | 0), cW: Math.max(1, Math.round(p.rate * 0.5 + r() * p.rate * 0.5)),
        phB: r() * TAU, phH: r() * TAU, phW: r() * TAU,
      });
    }
    return out;
  }

  /* spine of one maggot at loop time t: [{ x, y, a, nx, ny, hw }] from rear (0) to head (nseg).
     Small maggots (in px) get fewer spine points: they look the same and draw much faster */
  function spine(m, p, t) {
    const NSEG = m.L < 24 ? 8 : m.L < 60 ? 14 : 22;
    const amp = m.active ? 1 : 0.12, on = p.anim;
    const bendNow = m.bend + (on ? amp * p.twitch * 1.3 * snap(TAU * m.cB * t + m.phB, p.jerk) : 0);
    const head = on ? amp * p.headSwing * 1.1 * snap(TAU * m.cH * t + m.phH, p.jerk) : 0;
    const hw0 = m.L * p.thick * 0.5, pts = [];
    let x = 0, y = 0;
    for (let i = 0; i <= NSEG; i++) {
      const s = i / NSEG;
      // contraction wave running from the rear to the head: segments squeeze (shorter + fatter) in turn
      const wave = on ? amp * p.crawl * Math.sin(TAU * (1.4 * s - m.cW * t) + m.phW) : 0;
      const prof = s < 0.3 ? 0.78 + 0.22 * Math.sin((s / 0.3) * Math.PI * 0.5) : 1 - 0.68 * Math.pow((s - 0.3) / 0.7, 1.5);
      const a = m.rot + bendNow * (s - 0.5) + head * smoothstep(0.55, 1, s) * (s - 0.55) * 2.2;
      if (i) { const ds = (m.L / NSEG) * (1 - 0.1 * wave); x += Math.cos(a) * ds; y += Math.sin(a) * ds; }
      pts.push({ x, y, a, nx: -Math.sin(a), ny: Math.cos(a), hw: hw0 * prof * (1 + 0.14 * wave) });
    }
    // anchor the middle of the body on the maggot's spot
    const mid = pts[Math.round(NSEG * 0.45)], ox = m.x - mid.x, oy = m.y - mid.y;
    for (const q of pts) { q.x += ox; q.y += oy; }
    return pts;
  }

  /* fills the body outline along the spine with round ends (one path, so it is cheap);
     `f` = fraction of the half width, `add` = extra px all round, (dx, dy) = offset */
  function tube(c, pts, f, dx = 0, dy = 0, add = 0) {
    const n = pts.length - 1, R = (q) => Math.max(0.3, q.hw * f + add);
    c.beginPath();
    for (let i = 0; i <= n; i++) {
      const q = pts[i], r = R(q), x = q.x + q.nx * r + dx, y = q.y + q.ny * r + dy;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    const e = pts[n], s = pts[0];
    c.arc(e.x + dx, e.y + dy, R(e), e.a + Math.PI / 2, e.a - Math.PI / 2, true); // round head end
    for (let i = n; i >= 0; i--) { const q = pts[i], r = R(q); c.lineTo(q.x - q.nx * r + dx, q.y - q.ny * r + dy); }
    c.arc(s.x + dx, s.y + dy, R(s), s.a - Math.PI / 2, s.a + Math.PI / 2, true); // round rear end
    c.closePath();
    c.fill();
  }

  function drawMaggot(c, m, pts, p, k, light) {
    const [lx, ly] = light, n = pts.length - 1;
    const base = mix(U.hex(p.c1), U.hex(p.c2), m.tone * p.colorVar), edge = U.hex(p.edge), hi = U.hex(p.highlight);
    const avgHw = pts.reduce((s, q) => s + q.hw, 0) / pts.length;
    // level of detail by on-screen size: tiny maggots skip details nobody could see
    const small = avgHw < 2.2, tiny = avgHw < 1.2;
    // outline: a wider dark tube under the body
    if (p.outline > 0) {
      const ow = p.outline * k;
      c.fillStyle = css(mix(edge, [0, 0, 0], 0.7));
      tube(c, pts, 1, 0, 0, ow);
    }
    // cylinder shading: concentric strokes from the dark rim to the lit middle, nudged toward the light
    const K = tiny ? 2 : small ? 3 : avgHw < 4 ? 5 : 7;
    for (let j = 0; j < K; j++) {
      const f = 1 - (j / K) * 0.85, h = Math.sqrt(1 - Math.min(1, f * f * 0.92));
      const sh = (1 - f) * avgHw * 0.45 * p.lightAmt;
      c.fillStyle = css(mix(mix(base, edge, p.lightAmt * 0.85), base, Math.pow(h, 0.6)));
      tube(c, pts, f, lx * sh, ly * sh);
    }
    // gut: dark contents seen through the skin, in the rear two thirds
    if (p.gut > 0 && !tiny) {
      const g = U.hex(p.gutColor);
      c.lineCap = 'round'; c.lineJoin = 'round';
      for (const [w, a] of small ? [[0.4, 0.5]] : [[0.55, 0.25], [0.3, 0.55]]) {
        c.strokeStyle = css(g, a * p.gut * m.gut);
        c.lineWidth = Math.max(0.5, avgHw * w);
        c.beginPath();
        for (let i = Math.round(n * 0.12); i <= Math.round(n * 0.68); i++) {
          const q = pts[i], o = Math.sin(i * 0.9 + m.tone * 9) * q.hw * 0.12; // a slightly wandering line
          const x = q.x + q.nx * o, y = q.y + q.ny * o;
          i === Math.round(n * 0.12) ? c.moveTo(x, y) : c.lineTo(x, y);
        }
        c.stroke();
      }
    }
    // creases between the segments, bowed toward the head like rings on a tube
    if (p.creases > 0 && p.segments > 0 && !small) {
      c.strokeStyle = css(mix(edge, [0, 0, 0], 0.35), p.creases * 0.55);
      c.lineCap = 'round';
      c.lineWidth = Math.max(0.4, avgHw * 0.11);
      c.beginPath();
      for (let j = 1; j <= p.segments; j++) {
        const s = 0.04 + (j / (p.segments + 1)) * 0.9, fi = s * n, i = Math.min(n - 1, Math.floor(fi)), t = fi - i;
        const a = pts[i], b = pts[i + 1], x = lerp(a.x, b.x, t), y = lerp(a.y, b.y, t), hw = lerp(a.hw, b.hw, t) * 0.86, an = lerp(a.a, b.a, t);
        const nx = -Math.sin(an), ny = Math.cos(an), fx = Math.cos(an), fy = Math.sin(an);
        c.moveTo(x + nx * hw, y + ny * hw);
        c.quadraticCurveTo(x + fx * hw * 0.35, y + fy * hw * 0.35, x - nx * hw, y - ny * hw);
      }
      c.stroke();
    }
    // mouth hooks at the head, two spiracles on the blunt rear
    const hd = pts[n], hp = pts[n - 1], ha = Math.atan2(hd.y - hp.y, hd.x - hp.x), dark = U.hex(p.mouthColor);
    c.fillStyle = css(dark, 0.85);
    c.beginPath(); c.arc(hd.x - Math.cos(ha) * hd.hw * 0.2, hd.y - Math.sin(ha) * hd.hw * 0.2, Math.max(0.5, hd.hw * 0.45), 0, TAU); c.fill();
    if (small) { drawShine(c, pts, p, hi, avgHw, lx, ly, true); return; }
    c.strokeStyle = css(dark, 0.9); c.lineWidth = Math.max(0.4, hd.hw * 0.25);
    for (const sd of [-1, 1]) {
      c.beginPath();
      c.moveTo(hd.x, hd.y);
      c.lineTo(hd.x + Math.cos(ha + sd * 0.5) * hd.hw * 0.9, hd.y + Math.sin(ha + sd * 0.5) * hd.hw * 0.9);
      c.stroke();
    }
    const rr = pts[1], ra = pts[1].a;
    c.fillStyle = css(dark, 0.6);
    for (const sd of [-1, 1]) {
      c.beginPath();
      c.arc(rr.x - Math.sin(ra) * rr.hw * 0.38 * sd, rr.y + Math.cos(ra) * rr.hw * 0.38 * sd, Math.max(0.4, rr.hw * 0.16), 0, TAU);
      c.fill();
    }
    drawShine(c, pts, p, hi, avgHw, lx, ly, false);
  }

  /* wet highlight: a thin bright streak on the lit side (+ two glints on bigger maggots) */
  function drawShine(c, pts, p, hi, avgHw, lx, ly, small) {
    if (p.shine <= 0) return;
    const n = pts.length - 1, off = avgHw * 0.42;
    const amb = !lx && !ly; // ambient: a soft sheen along the top, no glints
    c.fillStyle = css(hi, p.shine * (amb ? 0.4 : 0.75));
    tube(c, pts.slice(Math.round(n * 0.08), Math.round(n * 0.85) + 1), 0.2, lx * off, ly * off);
    if (small || amb) return;
    c.fillStyle = css([255, 255, 255], p.shine * 0.9);
    for (const s of [0.25, 0.55]) {
      const q = pts[Math.round(n * s)];
      c.beginPath(); c.arc(q.x + lx * q.hw * 0.45, q.y + ly * q.hw * 0.45, Math.max(0.4, q.hw * 0.14), 0, TAU); c.fill();
    }
  }

  /* height: the same tube, gray rising toward the middle; creases pressed in */
  function drawHeight(c, pts, p) {
    const K = 8;
    for (let j = 0; j < K; j++) {
      const f = 1 - (j / K) * 0.9, h = Math.sqrt(1 - f * f * 0.95);
      const v = (40 + h * 215) | 0;
      c.fillStyle = `rgb(${v},${v},${v})`;
      tube(c, pts, f);
    }
    if (p.creases > 0 && p.segments > 0) {
      const n = pts.length - 1;
      c.strokeStyle = `rgba(0,0,0,${0.35 * p.creases})`;
      for (let j = 1; j <= p.segments; j++) {
        const q = pts[Math.round((0.04 + (j / (p.segments + 1)) * 0.9) * n)], nx = q.nx, ny = q.ny;
        c.lineWidth = Math.max(0.4, q.hw * 0.14);
        c.beginPath(); c.moveTo(q.x + nx * q.hw * 0.86, q.y + ny * q.hw * 0.86); c.lineTo(q.x - nx * q.hw * 0.86, q.y - ny * q.hw * 0.86); c.stroke();
      }
    }
  }

  /* soft blobs of `color` (low-res noise scaled up) for the ground variation */
  function noiseLayer(ctx, W, H, seed, freq, color, alpha) {
    const n = 96, c = U.canvas(n, n), g = c.getContext('2d'), img = g.createImageData(n, n), col = U.hex(color);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const o = (y * n + x) * 4, v = U.fractal('perlin', (x / n) * freq, (y / n) * freq, 0, 0, 4, 0.55, 'fbm', seed);
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = clamp(v * 1.4 - 0.3) * 255;
    }
    g.putImageData(img, 0, 0);
    ctx.globalAlpha = alpha; ctx.drawImage(c, 0, 0, W, H); ctx.globalAlpha = 1;
  }

  /* `fn(ctx)` drawn on its own layer and blurred. Soft layers are drawn at reduced resolution (blur and
     the bilinear upscale hide it), which keeps big blurs cheap. Returns a canvas to draw at (0, 0, W, H). */
  function blurLayer(W, H, blur, fn) {
    const ds = blur > 2 ? Math.min(6, blur / 1.5) : 1, w = Math.max(1, Math.round(W / ds)), h = Math.max(1, Math.round(H / ds));
    const sc = U.canvas(w, h), s = sc.getContext('2d');
    s.scale(w / W, h / H);
    fn(s);
    if (blur <= 0.3 || typeof s.filter !== 'string') return sc;
    const bc = U.canvas(w, h), b = bc.getContext('2d');
    b.filter = `blur(${blur / ds}px)`;
    b.drawImage(sc, 0, 0);
    return bc;
  }
  const drawLayer = (ctx, c, W, H, alpha) => { ctx.globalAlpha = alpha; ctx.drawImage(c, 0, 0, W, H); ctx.globalAlpha = 1; };

  /* layout and the (static) slime stain only depend on the settings and size, not on the loop time:
     tilesheet frames and frame sequences reuse them */
  const cache = { key: '', ms: null, slime: null };
  function cached(p, W, H) {
    const skip = { _t: 1, previewFrame: 1, showMask: 1, frames: 1, frameCount: 1 };
    const key = W + 'x' + H + JSON.stringify(p, (k, v) => (skip[k] ? undefined : v));
    if (cache.key !== key) Object.assign(cache, { key, ms: layout(p, W, H), slime: null });
    return cache;
  }

  const animOn = (p) => p.anim;
  const C = (c1, c2, edge, gutColor) => ({ c1, c2, edge, gutColor });

  U.register({
    id: 'maggots',
    name: 'Maggots',
    desc: 'Ground decals of maggots and grubs, scattered or in piles, with height map and looping twitch animation',
    uses: ['Infestation decals on corpses, food or floors in horror and survival games, animated as a looping flipbook or frame sequence.', 'Writhing creature sprites for gore particles and alien-biology effects.'],
    tags: ['Horror', 'Decals', 'Nature'],
    heightMap: true,
    // tilesheet mode: a seamless twitching loop
    animLoop: true,
    animate(p, f) { p._t = f.t; return p; },
    // frame sequence export: the same loop as separate PNGs (_f00, _f01 …)
    exportLayers: (p) => (p.frames ? Array.from({ length: Math.max(2, p.frameCount | 0) }, (_, i) => ({ id: 'frame' + i, suffix: 'f' + String(i).padStart(2, '0') })) : null),
    icon: U.icon('<path d="M4 15c2-4 6-4 8-2s5 2 7-1"/><path d="M6 8.5c1.5-1.5 4-1.5 5.5 0" /><path d="M14 19c1-1 3-1.2 4.5-.2"/><path d="M7.5 13.6v2.3M10.2 12.6v2.6M13 13.9v2.4M15.8 14.3v2.3"/>'),
    params: [
      { type: 'section', label: 'Maggots' },
      { key: 'layout', label: 'Layout', type: 'select', default: 'pile', options: [['scatter', 'Even scatter'], ['pile', 'Centered pile'], ['clusters', 'Several clusters']] },
      { key: 'count', label: 'Count', type: 'int', min: 1, max: 1500, default: 90 },
      { key: 'size', label: 'Length', type: 'range', min: 0.02, max: 0.6, step: 0.001, default: 0.11, tip: 'Body length, fraction of the short side' },
      { key: 'sizeVar', label: 'Size variation', type: 'range', min: 0, max: 0.9, step: 0.01, default: 0.4 },
      { key: 'spread', label: 'Spread', type: 'range', min: 0.1, max: 1.5, step: 0.01, default: 0.55, show: (p) => p.layout !== 'scatter', tip: 'Size of the pile / clusters' },
      { key: 'clusters', label: 'Clusters', type: 'int', min: 2, max: 12, default: 4, show: (p) => p.layout === 'clusters' },
      { key: 'overlap', label: 'Allow overlap', type: 'bool', default: true, tip: 'Off: maggots keep apart (fewer may fit)' },
      { key: 'falloff', label: 'Edge falloff', type: 'select', default: 'radial', options: [['radial', 'Radial (round)'], ['rect', 'Rectangular']], tip: 'Shape of the fade toward the texture edge' },
      { key: 'edgeMargin', label: 'Edge margin', type: 'range', min: 0, max: 0.3, step: 0.005, default: 0.04, tip: 'Empty border (fraction of the short side). Maggots never touch the edge, even while twitching' },
      { key: 'edgeFade', label: 'Edge fade', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.2, tip: 'Maggots thin out over this distance toward the margin' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 5 },
      { type: 'section', label: 'Noise mask', active: (p) => p.mask },
      { key: 'mask', label: 'Noise mask', type: 'bool', default: false, tip: 'Maggots only land where the noise allows: patches instead of an even spread' },
      { key: 'maskScale', label: 'Mask scale', type: 'range', min: 0.5, max: 12, step: 0.1, default: 2.5, show: useMask, tip: 'Noise features across the short side' },
      { key: 'maskCover', label: 'Coverage', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: useMask },
      { key: 'maskSoft', label: 'Mask softness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: useMask },
      { key: 'showMask', label: 'Show mask (preview)', type: 'bool', default: false, show: useMask, tip: 'Preview only: shows where maggots may land, incl. the edge fade' },
      { type: 'section', label: 'Body' },
      { key: 'thick', label: 'Thickness', type: 'range', min: 0.1, max: 0.45, step: 0.005, default: 0.24, tip: 'Width relative to the length' },
      { key: 'segments', label: 'Segments', type: 'int', min: 0, max: 16, default: 11, tip: 'Creases along the body' },
      { key: 'creases', label: 'Crease depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.segments > 0 },
      { key: 'bend', label: 'Resting curl', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'How bent the maggots lie' },
      { key: 'align', label: 'Alignment', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: '0 = random direction, 1 = all head the same way' },
      { key: 'dir', label: 'Direction', type: 'range', min: -180, max: 180, step: 1, default: -90, show: (p) => p.align > 0, tip: 'Where the heads point, -90 = up' },
      { type: 'section', label: 'Twitching', active: (p) => p.anim },
      { key: 'anim', label: 'Animate', type: 'bool', default: true, tip: 'Used by Tilesheet mode and the frame sequence export; a single frame shows the resting pose' },
      { key: 'activity', label: 'Active share', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, show: animOn, tip: 'Share of maggots that move a lot; the rest barely stir' },
      { key: 'twitch', label: 'Body bend', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: animOn, tip: 'How far the body curls back and forth' },
      { key: 'headSwing', label: 'Head swing', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: animOn, tip: 'Searching side-to-side motion of the head end' },
      { key: 'crawl', label: 'Contraction wave', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: animOn, tip: 'Segments squeeze in turn along the body (peristalsis)' },
      { key: 'jerk', label: 'Jerkiness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: animOn, tip: '0 = smooth wriggle, 1 = snaps between poses like a twitch' },
      { key: 'rate', label: 'Speed', type: 'int', min: 1, max: 6, default: 2, show: animOn, tip: 'Up to this many twitches per loop (each maggot picks its own whole number, so the loop stays seamless)' },
      { type: 'section', label: 'Color' },
      { key: 'c1', label: 'Body color A', type: 'color', default: '#f1e8d0' },
      { key: 'c2', label: 'Body color B', type: 'color', default: '#ddcda6' },
      { key: 'colorVar', label: 'Color variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8 },
      { key: 'edge', label: 'Shadow side color', type: 'color', default: '#a8936a' },
      { key: 'gut', label: 'Gut visibility', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Dark contents seen through the skin' },
      { key: 'gutColor', label: 'Gut color', type: 'color', default: '#4a3622', show: (p) => p.gut > 0 },
      { key: 'mouthColor', label: 'Mouth hooks / spiracles', type: 'color', default: '#2a1a10' },
      { type: 'section', label: 'Shading' },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'angled', options: [['angled', 'Angled (light angle)'], ['ambient', 'Ambient (soft, no direction)']], tip: 'Ambient: soft light from all around, like an overcast sky: no direction and no glints; bodies darken evenly toward their sides and the contact shadow sits right under them' },
      { key: 'light', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -135, show: (p) => p.lightMode !== 'ambient', tip: '-135 = light from top-left' },
      { key: 'lightAmt', label: 'Shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75 },
      { key: 'shine', label: 'Wet highlight', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55 },
      { key: 'highlight', label: 'Highlight color', type: 'color', default: '#fffbf0', show: (p) => p.shine > 0 },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 6, step: 0.1, default: 0, tip: 'px @ 512, for stylized looks' },
      { key: 'shadow', label: 'Contact shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'shadowSize', label: 'Shadow softness', type: 'range', min: 0, max: 20, step: 0.25, default: 3, show: (p) => p.shadow > 0, tip: 'px @ 512' },
      { key: 'shadowDist', label: 'Shadow offset', type: 'range', min: 0, max: 20, step: 0.25, default: 2, show: (p) => p.shadow > 0 && p.lightMode !== 'ambient', tip: 'px @ 512, away from the light' },
      { key: 'slime', label: 'Slime stain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Wet, darker stain where the maggots lie (does not move)' },
      { key: 'slimeColor', label: 'Slime color', type: 'color', default: '#5e4a2c', show: (p) => p.slime > 0 },
      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'alpha', options: [['alpha', 'Transparent (decal)'], ['ground', 'On ground color'], ['height', 'Height map']] },
      { key: 'ground', label: 'Ground color', type: 'color', default: '#4a2a22', show: (p) => p.output === 'ground' },
      { key: 'groundVar', label: 'Ground variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.output === 'ground' },
      { key: 'frames', label: 'Export frame sequence', type: 'bool', default: false, tip: 'Download the twitching loop as N separate PNGs (_f00, _f01 …) instead of one image. For a single flipbook texture use Tilesheet mode (above the presets)' },
      { key: 'frameCount', label: 'Frames', type: 'int', min: 2, max: 64, default: 8, show: (p) => p.frames, tip: 'Frames of one seamless loop' },
      { key: 'previewFrame', label: 'Preview frame', type: 'int', min: 0, max: 64, default: 0, show: (p) => p.frames, tip: 'Preview only: 0 = resting pose, otherwise shows that frame of the sequence' },
    ],
    presets: [
      { name: 'Maggot pile', group: 'Realistic', values: {} },
      { name: 'Scattered maggots', group: 'Realistic', values: { layout: 'scatter', count: 40, overlap: false, size: 0.09, slime: 0.1, seed: 12 } },
      { name: 'Writhing mass (dense)', group: 'Realistic', values: { count: 420, size: 0.07, spread: 0.7, sizeVar: 0.5, slime: 0.5, shadow: 0.6, rate: 3, seed: 21 } },
      { name: 'Clusters on a corpse', group: 'Realistic', values: { layout: 'clusters', clusters: 5, count: 260, size: 0.065, spread: 0.6, slime: 0.55, slimeColor: '#4a1e14', output: 'ground', ground: '#5a2a24', groundVar: 0.5, seed: 33 } },
      { name: 'Few large maggots', group: 'Realistic', values: { layout: 'scatter', count: 7, overlap: false, size: 0.3, sizeVar: 0.3, segments: 12, shadowSize: 6, shadowDist: 5, seed: 8 } },
      { name: 'Patchy infestation (mask)', group: 'Realistic', values: { layout: 'scatter', mask: true, maskScale: 3, maskCover: 0.4, count: 500, size: 0.06, slime: 0.4, seed: 17 } },
      { name: 'Mealworms', group: 'Realistic', values: Object.assign(C('#d4a24c', '#a8742c', '#6a4416', '#3a2410'), { thick: 0.16, segments: 13, creases: 0.75, gut: 0, shine: 0.7, mouthColor: '#3a2210', bend: 0.25, crawl: 0.25, slime: 0, seed: 4 }) },
      { name: 'Fat grubs', group: 'Realistic', values: Object.assign(C('#f4eee0', '#e6d6b4', '#b29c72', '#6a5034'), { layout: 'scatter', count: 14, overlap: false, size: 0.22, thick: 0.38, bend: 0.85, segments: 9, creases: 0.7, gut: 0.6, seed: 2 }) },
      { name: 'Twitchy (snappy loop)', group: 'Realistic', values: { jerk: 1, twitch: 0.8, headSwing: 0.9, rate: 4, activity: 1 } },
      { name: 'Cartoon worms', group: 'Stylized', values: Object.assign(C('#ffe7b0', '#ffd27a', '#d49a4a', '#000000'), { layout: 'scatter', count: 12, overlap: false, size: 0.24, gut: 0, creases: 0.6, segments: 6, outline: 3, shine: 0.8, lightAmt: 0.5, shadow: 0.35, shadowSize: 0, shadowDist: 4, slime: 0, seed: 6 }) },
      { name: 'Silhouettes (particles)', group: 'Stylized', values: Object.assign(C('#1a1612', '#1a1612', '#1a1612', '#1a1612'), { gut: 0, creases: 0, shine: 0, lightAmt: 0, shadow: 0, slime: 0, mouthColor: '#1a1612' }) },
      { name: 'Alien larvae (glowing)', group: 'Sci-fi', values: Object.assign(C('#b8ff7a', '#6ad83a', '#1f5a10', '#e0ff40'), { gut: 0.8, highlight: '#f0ffd0', shine: 0.8, slimeColor: '#4aa020', slime: 0.45, output: 'ground', ground: '#14181a', groundVar: 0.3, seed: 44 }) },
      { name: 'Void worms', group: 'Sci-fi', values: Object.assign(C('#4a3a6a', '#2a2040', '#0c0818', '#c070ff'), { thick: 0.18, segments: 14, gut: 0.9, highlight: '#e0c0ff', shine: 0.7, slimeColor: '#3a1a5a', slime: 0.4, jerk: 0.2, seed: 61 }) },
    ],
    render(ctx, W, H, p, opts) {
      opts = opts || {};
      const S = Math.min(W, H), k = S / 512;
      if (opts.preview && p.showMask && useMask(p)) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        ctx.drawImage(densityCanvas(p, W, H), 0, 0, W, H);
        return;
      }
      // loop time: tilesheet frame, a frame of the sequence export, the preview frame, or the resting pose
      const N = Math.max(2, p.frameCount | 0), fm = typeof opts.layer === 'string' && /^frame(\d+)$/.exec(opts.layer);
      const t = p._t != null ? p._t : fm ? +fm[1] / N : opts.preview && p.frames && p.previewFrame > 0 ? (Math.min(p.previewFrame, N) - 1) / N : 0;
      const C = cached(p, W, H), ms = C.ms, la = p.light * RAD;
      // ambient: no light direction (centered cylinder shading and contact shadow)
      const light = p.lightMode === 'ambient' ? [0, 0] : [Math.cos(la), Math.sin(la)];
      const bodies = ms.map((m) => spine(m, p, t));

      if (opts.height || p.output === 'height') {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        for (const pts of bodies) drawHeight(ctx, pts, p);
        return;
      }
      if (p.output === 'ground') {
        ctx.fillStyle = p.ground; ctx.fillRect(0, 0, W, H);
        if (p.groundVar > 0) {
          noiseLayer(ctx, W, H, (p.seed | 0) + 90, 5, '#000000', p.groundVar * 0.5);
          noiseLayer(ctx, W, H, (p.seed | 0) + 91, 14, '#ffffff', p.groundVar * 0.12);
        }
      }
      // slime: the resting pose, so the stain stays put while the maggots move
      if (p.slime > 0) {
        if (!C.slime) {
          const rest = Object.assign({}, p, { anim: false });
          C.slime = blurLayer(W, H, 6 * k, (s) => { s.fillStyle = p.slimeColor; for (const m of ms) tube(s, spine(m, rest, 0), 2.2); });
        }
        drawLayer(ctx, C.slime, W, H, p.slime * 0.7);
      }
      if (p.shadow > 0) {
        const sd = p.shadowDist * k;
        drawLayer(ctx, blurLayer(W, H, p.shadowSize * k, (s) => {
          s.fillStyle = '#000';
          for (const pts of bodies) tube(s, pts, 1.05, -light[0] * sd, -light[1] * sd);
        }), W, H, p.shadow);
      }
      for (let i = 0; i < ms.length; i++) drawMaggot(ctx, ms[i], bodies[i], p, k, light);
    },
  });
})();
