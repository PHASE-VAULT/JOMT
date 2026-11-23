/* Cobweb: spider webs and cobwebs as transparent decals. Orb webs (frame threads, radial spokes, a capture
   spiral with a free zone and a hub, gaps, sag and torn, dangling threads), corner cobwebs (threads spanned
   between two walls, cross-links and a dense sheet near the corner), funnel / sheet webs (a silky sheet with
   a dark retreat) and messy dusty cobwebs (tangled, sagging threads, silk bundles, hanging strands).
   "Anchor to edges" snaps the outer threads exactly onto the chosen texture edges or corners (the thread
   runs on past the border, so it is cut by the edge and attaches seamlessly to a wall, door frame or room
   corner); free vertices get mooring lines that fade out, or run to the nearest allowed edge. Dust clumps,
   a dusty haze, dew drops with a glint and a glow (laser webs) on top. Output: color, white + alpha for
   tinting, or on a background color. Everything is relative to the texture size and seeded. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp } = U;
  const TAU = Math.PI * 2;

  // allowed border sides per anchor mode, and the corner for corner modes
  const SIDES = { none: '', tl: 'tl', tr: 'tr', bl: 'bl', br: 'br', top: 't', bottom: 'b', left: 'l', right: 'r', sides: 'lr', all: 'tblr' };
  const HUB = { none: [0.5, 0.5], tl: [0.3, 0.28], tr: [0.7, 0.28], bl: [0.3, 0.72], br: [0.7, 0.72], top: [0.5, 0.38], bottom: [0.5, 0.62], left: [0.38, 0.5], right: [0.62, 0.5], sides: [0.5, 0.45], all: [0.5, 0.45] };
  const isCorner = (a) => a.length === 2 && a !== 'sides';
  // corner webs: which corners a mode covers (edge modes take both corners of that edge)
  const cornerList = (m) => ({ tl: ['tl'], tr: ['tr'], bl: ['bl'], br: ['br'], top: ['tl', 'tr'], bottom: ['bl', 'br'], left: ['tl', 'bl'], right: ['tr', 'br'], sides: ['tl', 'tr'], all: ['tl', 'tr', 'bl', 'br'] })[m] || ['tl'];

  // ray from (x, y) along (dx, dy) to the texture border: [t, side]
  function rayBox(x, y, dx, dy, W, H) {
    let t = Infinity, s = '';
    if (dx < -1e-9) { const k = -x / dx; if (k < t) { t = k; s = 'l'; } }
    if (dx > 1e-9) { const k = (W - x) / dx; if (k < t) { t = k; s = 'r'; } }
    if (dy < -1e-9) { const k = -y / dy; if (k < t) { t = k; s = 't'; } }
    if (dy > 1e-9) { const k = (H - y) / dy; if (k < t) { t = k; s = 'b'; } }
    return [t, s];
  }
  // snap a point exactly onto a border side
  const snap = (x, y, s, W, H) => (s === 'l' ? [0, y] : s === 'r' ? [W, y] : s === 't' ? [x, 0] : s === 'b' ? [x, H] : [x, y]);
  // ray vs closed polygon (distance to the nearest edge hit)
  function rayPoly(x, y, dx, dy, V) {
    let best = Infinity;
    for (let i = 0; i < V.length; i++) {
      const a = V[i], b = V[(i + 1) % V.length], ex = b.x - a.x, ey = b.y - a.y, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((a.x - x) * ey - (a.y - y) * ex) / den, u = ((a.x - x) * dy - (a.y - y) * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t < best) best = t;
    }
    return best;
  }
  const bez = (T, t) => { const m = 1 - t; return [m * m * T.x1 + 2 * m * t * T.cx + t * t * T.x2, m * m * T.y1 + 2 * m * t * T.cy + t * t * T.y2]; };

  /* web builders: push threads with G.add(x1, y1, x2, y2, kind, opts) */
  function orbWeb(G) {
    const { p, W, H, S, rnd, add, dangle, allowed } = G, hx = p.cx * W, hy = p.cy * H, irr = p.irregular, sides = SIDES[p.anchor] || '';
    // frame vertices: on an allowed edge they snap to it, otherwise they float at the web size
    const nF = p.frames, base = rnd() * TAU, V = [];
    for (let i = 0; i < nF; i++) {
      const th = base + (i / nF) * TAU + (rnd() - 0.5) * irr * (TAU / nF) * 0.8, dx = Math.cos(th), dy = Math.sin(th), [t, s] = rayBox(hx, hy, dx, dy, W, H);
      if (allowed(s)) { const [x, y] = snap(hx + dx * t, hy + dy * t, s, W, H); V.push({ x, y, th, anch: true }); }
      else { const r = Math.min(t * 0.9, p.size * S * 0.5 * (0.85 + 0.3 * rnd())); V.push({ x: hx + dx * r, y: hy + dy * r, th, anch: false }); }
    }
    if (isCorner(sides)) { // one frame thread runs right into the corner pixel
      const cx = sides[1] === 'l' ? 0 : W, cy = sides[0] === 't' ? 0 : H, th = Math.atan2(cy - hy, cx - hx);
      let k = 0, bd = 9;
      V.forEach((v, i) => { const d = Math.abs(Math.atan2(Math.sin(v.th - th), Math.cos(v.th - th))); if (d < bd) { bd = d; k = i; } });
      V[k] = { x: cx, y: cy, th, anch: true };
    }
    V.sort((a, b) => U.mod(a.th - base, TAU) - U.mod(b.th - base, TAU));
    for (let i = 0; i < V.length; i++) { const a = V[i], b = V[(i + 1) % V.length]; add(a.x, a.y, b.x, b.y, 'frame', { hub: [hx, hy], inward: 0.06 + 0.1 * irr * rnd(), sagK: 0.1 }); }
    for (const v of V) { // moorings for the free vertices
      if (v.anch) continue;
      if (!sides) { const l = S * (0.08 + 0.22 * rnd()); add(v.x, v.y, v.x + Math.cos(v.th) * l, v.y + Math.sin(v.th) * l, 'moor', { fade: true }); continue; }
      // otherwise run to the nearest allowed edge, shifted a little along it (stays exactly on the edge)
      let best = null, bd = Infinity, bs = '';
      for (const s of sides) { const q = snap(clamp(v.x, 0, W), clamp(v.y, 0, H), s, W, H), d = Math.hypot(q[0] - v.x, q[1] - v.y); if (d < bd) { bd = d; best = q; bs = s; } }
      if (best) {
        const j = (rnd() - 0.5) * S * 0.1, vert = bs === 'l' || bs === 'r';
        add(v.x, v.y, vert ? best[0] : clamp(best[0] + j, 0, W), vert ? clamp(best[1] + j, 0, H) : best[1], 'moor', { sagK: 0.1 });
      }
    }
    // torn holes
    const holes = [];
    for (let i = 0, n = Math.round(p.broken * 4); i < n; i++) { const a = rnd() * TAU, r = p.size * S * 0.5 * (0.3 + 0.5 * rnd()); holes.push([hx + Math.cos(a) * r, hy + Math.sin(a) * r, p.size * S * (0.06 + 0.1 * rnd()) * (0.5 + p.broken)]); }
    const inHole = (x, y) => holes.some((h) => Math.hypot(x - h[0], y - h[1]) < h[2]);
    // spokes to the frame
    const m = p.spokes, b2 = rnd() * TAU, D = [], R = [];
    for (let j = 0; j < m; j++) {
      const ph = b2 + (j / m) * TAU + (rnd() - 0.5) * irr * (TAU / m) * 0.6, dx = Math.cos(ph), dy = Math.sin(ph);
      let r = rayPoly(hx, hy, dx, dy, V);
      if (!isFinite(r)) r = rayBox(hx, hy, dx, dy, W, H)[0] * 0.9;
      D.push([dx, dy]); R.push(r);
      // cut by a hole or broken: the inner part stays, the rest dangles
      let cut = 1;
      for (let u = 0.15; u < 1; u += 0.05) if (inHole(hx + dx * r * u, hy + dy * r * u)) { cut = u; break; }
      if (cut === 1 && rnd() < p.broken * 0.15) cut = 0.3 + 0.6 * rnd();
      add(hx, hy, hx + dx * r * cut, hy + dy * r * cut, 'spoke', { sagK: 0.02 });
      if (cut < 1) { dangle(hx + dx * r * cut, hy + dy * r * cut, S * (0.02 + 0.08 * rnd())); if (rnd() < 0.5) dangle(hx + dx * r, hy + dy * r, S * (0.02 + 0.1 * rnd())); }
    }
    // capture spiral from the outside in, stopping at the free zone
    const K = p.rings, total = K * m, fo = 0.94, fi = Math.min(0.85, p.hubGap + 0.05), jit = ((fo - fi) / K) * 0.35 * irr;
    let prev = null;
    for (let s = 0; s <= total; s++) {
      const j = s % m, f = fo - ((fo - fi) * s) / total + (rnd() - 0.5) * jit, x = hx + D[j][0] * R[j] * f, y = hy + D[j][1] * R[j] * f;
      if (prev) {
        const mx = (x + prev[0]) / 2, my = (y + prev[1]) / 2;
        if (inHole(mx, my) || rnd() < p.broken * 0.3) { if (rnd() < 0.25) dangle(prev[0], prev[1], S * (0.01 + 0.04 * rnd())); }
        else add(prev[0], prev[1], x, y, 'cap', { hub: [hx, hy], inward: 0.03, sagK: 0.15 });
      }
      prev = [x, y];
    }
    // hub: a tight irregular spiral and a few cross threads
    const rh = fi * 0.55 * (R.reduce((a, b) => a + b, 0) / m);
    prev = null;
    for (let s = 0, n = Math.round(m * 2.5); s <= n; s++) {
      const j = s % m, f = 1 - s / n, x = hx + D[j][0] * rh * f * (0.85 + 0.3 * rnd()), y = hy + D[j][1] * rh * f * (0.85 + 0.3 * rnd());
      if (prev) add(prev[0], prev[1], x, y, 'hub', {});
      prev = [x, y];
    }
    return { hx, hy, r: p.size * S * 0.5 };
  }

  function cornerWeb(G) {
    const { p, W, H, S, rnd, add, dangle, T } = G;
    const list = cornerList(p.anchor);
    const R = p.size * S * (list.length > 1 ? 0.5 : 0.75), irr = p.irregular;
    for (const c of list) {
      const cx = c[1] === 'l' ? 0 : W, cy = c[0] === 't' ? 0 : H, sx = cx ? -1 : 1, sy = cy ? -1 : 1, n = Math.round(p.density / list.length), i0 = T.length;
      for (let k = 0; k < 7; k++) { // guide threads out of the corner
        const an = ((k + 0.5) / 7) * Math.PI / 2 + (rnd() - 0.5) * 0.2 * irr, l = R * (0.55 + 0.45 * rnd());
        add(cx, cy, cx + sx * Math.cos(an) * l, cy + sy * Math.sin(an) * l, 'spoke', { sagK: 0.05 });
      }
      for (let k = 0; k < n * 0.55; k++) { // threads spanned between the two walls (end points on the edges)
        const d1 = R * (0.04 + 0.96 * Math.pow(rnd(), 2.1)), d2 = clamp(d1 * (0.55 + rnd() * 0.9) + (rnd() - 0.5) * R * 0.2 * irr, R * 0.03, R * 1.1);
        add(cx + sx * d1, cy, cx, cy + sy * d2, 'cap', { hub: [cx, cy], inward: -0.04 - 0.08 * rnd(), sagK: 0.18 });
      }
      const mine = T.slice(i0);
      for (let k = 0; k < n * 1.3; k++) { // cross-links between threads (a tangled sheet)
        const A = mine[(rnd() * mine.length) | 0], B = mine[(rnd() * mine.length) | 0];
        if (A === B) continue;
        const pa = bez(A, 0.1 + 0.8 * rnd()), pb = bez(B, 0.1 + 0.8 * rnd()), nT = T.length;
        add(pa[0], pa[1], pb[0], pb[1], 'link', { sagK: 0.2 });
        if (T.length > nT) mine.push(T[nT]); // later links can hang on earlier ones
      }
      for (let k = 0; k < n * 1.2; k++) { // dense silk sheet near the corner
        const an = rnd() * Math.PI / 2, r = R * 0.45 * Math.pow(rnd(), 1.4), x = cx + sx * Math.cos(an) * r, y = cy + sy * Math.sin(an) * r, b = rnd() * TAU, l = R * (0.03 + 0.1 * rnd());
        add(x, y, x + Math.cos(b) * l, y + Math.sin(b) * l, 'sheet', { sagK: 0.1 });
      }
      for (let k = 0; k < n * 0.06 * (0.3 + p.sag + p.broken); k++) { const A = mine[(rnd() * mine.length) | 0], q = bez(A, rnd()); dangle(q[0], q[1], S * (0.03 + 0.15 * rnd() * (0.5 + p.sag))); }
    }
    return null;
  }

  function funnelWeb(G) {
    const { p, W, H, S, rnd, add, allowed, extras } = G, hx = p.cx * W, hy = p.cy * H, Rs = p.size * S * 0.5, irr = p.irregular, sides = SIDES[p.anchor] || '';
    const shape = (th) => 1 + 0.25 * irr * Math.sin(th * 3 + 1) + 0.15 * Math.sin(th * 5 + 2);
    const ptAt = (th, f) => [hx + Math.cos(th) * Rs * f * shape(th), hy + Math.sin(th) * Rs * f * shape(th) * 0.72];
    const mouth = [hx + Rs * 0.25, hy + Rs * 0.08], mr = Rs * 0.13;
    for (let i = 0; i < p.density * 4; i++) { // sheet: short chords inside the outline, denser toward the mouth
      const th = rnd() * TAU, f = Math.pow(rnd(), 0.6) * 0.95, [x, y] = ptAt(th, f), b = th + Math.PI / 2 + (rnd() - 0.5) * 1.6, l = Rs * (0.04 + 0.14 * rnd()) * (0.5 + f);
      add(x, y, x + Math.cos(b) * l, y + Math.sin(b) * l * 0.72, 'sheet', { sagK: 0.05 });
    }
    for (let i = 0; i < p.density * 0.07; i++) { // threads converging into the retreat
      const th = rnd() * TAU, [x, y] = ptAt(th, 0.3 + 0.3 * rnd()), tw = 0.9 + rnd() * 0.9;
      add(x, y, mouth[0] + Math.cos(th + tw) * mr, mouth[1] + Math.sin(th + tw) * mr * 0.8, 'spoke', { sagK: 0.04 });
    }
    for (let i = 0; i < 4; i++) { // rim of the funnel
      const s = 1 + i * 0.25;
      for (let k = 0; k < 18; k++) { const a0 = (k / 18) * TAU, a1 = ((k + 1) / 18) * TAU; add(mouth[0] + Math.cos(a0) * mr * s, mouth[1] + Math.sin(a0) * mr * s * 0.8, mouth[0] + Math.cos(a1) * mr * s, mouth[1] + Math.sin(a1) * mr * s * 0.8, 'cap', {}); }
    }
    extras.push({ hole: true, x: mouth[0], y: mouth[1], r: mr });
    // scaffold above / to the anchors
    for (let i = 0; i < Math.max(6, p.frames * 2); i++) {
      const th = rnd() * TAU, [x, y] = ptAt(th, 0.95), dx = Math.cos(th) + (rnd() - 0.5) * 0.6, dy = Math.sin(th) - 0.6 - rnd() * 0.4, dl = Math.hypot(dx, dy), [t, s] = rayBox(x, y, dx / dl, dy / dl, W, H);
      if (sides && allowed(s)) { const q = snap(x + (dx / dl) * t, y + (dy / dl) * t, s, W, H); add(x, y, q[0], q[1], 'moor', { sagK: 0.05 }); }
      else add(x, y, x + (dx / dl) * Math.min(t, S * 0.25), y + (dy / dl) * Math.min(t, S * 0.25), 'moor', { fade: true });
    }
    return null;
  }

  function messyWeb(G) {
    const { p, W, H, S, rnd, add, dangle, allowed, T } = G, hx = p.cx * W, hy = p.cy * H, Rm = p.size * S * 0.5, sides = SIDES[p.anchor] || '';
    const edgePt = () => { // random point on an allowed edge (snapped)
      const s = sides[(rnd() * sides.length) | 0];
      return s === 't' ? [rnd() * W, 0] : s === 'b' ? [rnd() * W, H] : s === 'l' ? [0, rnd() * H] : [W, rnd() * H];
    };
    for (let i = 0; i < p.density; i++) {
      let x1, y1;
      if (sides && rnd() < 0.45) {
        [x1, y1] = edgePt();
        if (isCorner(sides)) { const near = Math.pow(rnd(), 1.5) * Rm * 1.6; if (y1 === 0 || y1 === H) x1 = sides[1] === 'l' ? near : W - near; else y1 = sides[0] === 't' ? near : H - near; }
      } else { const a = rnd() * TAU, r = Rm * Math.sqrt(rnd()); x1 = hx + Math.cos(a) * r; y1 = hy + Math.sin(a) * r * 0.8; }
      const a = rnd() * TAU, l = S * (0.05 + 0.4 * rnd() * rnd() + 0.1 * rnd());
      let x2 = x1 + Math.cos(a) * l, y2 = y1 + Math.sin(a) * l;
      const towards = Math.hypot(x2 - hx, y2 - hy) > Rm * 1.2; // keep the tangle together
      if (towards) { x2 = lerp(x2, hx, 0.5); y2 = lerp(y2, hy, 0.5); }
      add(x1, y1, x2, y2, rnd() < 0.12 ? 'bundle' : 'messy', { sagK: 0.15 + 0.5 * rnd() });
    }
    const n0 = T.length;
    for (let k = 0; k < p.density * 0.12 * (0.4 + p.sag); k++) { const A = T[(rnd() * n0) | 0], q = bez(A, rnd()); dangle(q[0], q[1], S * (0.04 + 0.2 * rnd() * (0.5 + p.sag))); }
    return null;
  }

  U.register({
    id: 'cobweb',
    name: 'Cobweb',
    desc: 'Spider webs and cobwebs: orb, corner, funnel and messy dusty webs that can anchor exactly to the texture edges, with sag, tears, dust and dew',
    uses: ['Transparent decals for room corners, doorways, windows, crates and ruins in horror and fantasy levels; "Anchor to edges" lets the web attach seamlessly to a wall corner or door frame.', 'Halloween UI, posters and stylized props; white + alpha output for tinting in the engine.'],
    tags: ['Decals', 'Horror', 'Nature'],
    bg: 'black',
    icon: U.icon('<path d="M12 12L3 3M12 12l9-9M12 12v9M12 12L3 15M12 12l9 3"/><path d="M7 7.5c3-1.5 7-1.5 10 0M8.5 9c2-1 5-1 7 0M5 13.5c1 2 2.5 4 7 5 4.5-1 6-3 7-5" opacity=".6"/>'),
    params: [
      { type: 'section', label: 'Web' },
      { key: 'type', label: 'Web type', type: 'select', default: 'orb', options: [['orb', 'Orb web'], ['corner', 'Corner cobweb'], ['funnel', 'Funnel / sheet web'], ['messy', 'Messy dusty cobweb']] },
      { key: 'anchor', label: 'Anchor to edges', type: 'select', default: 'none', options: [['none', 'Free (no anchors)'], ['tl', 'Top-left corner'], ['tr', 'Top-right corner'], ['bl', 'Bottom-left corner'], ['br', 'Bottom-right corner'], ['top', 'Top edge'], ['bottom', 'Bottom edge'], ['left', 'Left edge'], ['right', 'Right edge'], ['sides', 'Left and right edges'], ['all', 'All four sides (doorway)']], apply: (v, p) => { const h = HUB[v]; if (h) { p.cx = h[0]; p.cy = h[1]; } }, tip: 'Outer threads begin exactly at these texture edges / corners, so the web attaches seamlessly to a wall corner or door frame. Also moves the hub to a fitting spot' },
      { key: 'cx', label: 'Hub X', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.type !== 'corner' },
      { key: 'cy', label: 'Hub Y', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.type !== 'corner' },
      { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 1.4, step: 0.01, default: 0.9, tip: 'Reach of the free (unanchored) parts' },
      { key: 'frames', label: 'Anchor threads', type: 'int', min: 3, max: 12, default: 6, show: (p) => p.type === 'orb' || p.type === 'funnel', tip: 'Frame corners around the web' },
      { key: 'spokes', label: 'Spokes', type: 'int', min: 5, max: 80, default: 28, show: (p) => p.type === 'orb' },
      { key: 'rings', label: 'Spiral turns', type: 'int', min: 3, max: 90, default: 30, show: (p) => p.type === 'orb', tip: 'Turns of the sticky capture spiral' },
      { key: 'hubGap', label: 'Free zone', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.14, show: (p) => p.type === 'orb', tip: 'Open ring around the hub without capture threads' },
      { key: 'density', label: 'Thread count', type: 'int', min: 10, max: 800, default: 140, show: (p) => p.type !== 'orb' },
      { key: 'irregular', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
      { key: 'sag', label: 'Sag', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Threads droop under gravity' },
      { key: 'broken', label: 'Broken / torn', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1, tip: 'Gaps, torn holes and dangling threads' },
      { key: 'stray', label: 'Stray threads', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15 },
      { key: 'width', label: 'Thread width', type: 'range', min: 0.2, max: 6, step: 0.05, default: 1, tip: 'px at 1024 px (scales with the texture)' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 4 },

      { type: 'section', label: 'Dust & dew', active: (p) => p.dust > 0 || p.dew > 0 },
      { key: 'dust', label: 'Dust', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1, tip: 'Dust clumps, thicker greyish threads and a dusty haze' },
      { key: 'dustColor', label: 'Dust color', type: 'color', default: '#a39d92', show: (p) => p.dust > 0 },
      { key: 'dew', label: 'Dew drops', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Droplets beaded along the threads, with a glint' },
      { key: 'dewSize', label: 'Drop size', type: 'range', min: 0.2, max: 3, step: 0.05, default: 1, show: (p) => p.dew > 0 },

      { type: 'section', label: 'Color' },
      { key: 'color', label: 'Thread color', type: 'color', default: '#eeeeec' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.85 },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Soft halo around the threads (magic or laser webs)' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color (transparent)'], ['white', 'White + alpha (for tinting)'], ['ground', 'On a background color']] },
      { key: 'bgColor', label: 'Background color', type: 'color', default: '#1e2124', show: (p) => p.output === 'ground' },
    ],
    presets: [
      { name: 'Classic orb web', group: 'Realistic', values: {} },
      { name: 'Corner cobweb', group: 'Realistic', values: { type: 'corner', anchor: 'tl', size: 1.2, density: 130, sag: 0.35, dust: 0.3, broken: 0.2 } },
      { name: 'Top-right corner cobweb', group: 'Realistic', values: { type: 'corner', anchor: 'tr', size: 1.05, density: 110, sag: 0.5, dust: 0.45, broken: 0.35, seed: 9 } },
      { name: 'Dusty attic', group: 'Realistic', values: { type: 'messy', anchor: 'top', cx: 0.5, cy: 0.35, size: 1, density: 220, sag: 0.7, broken: 0.4, dust: 0.85, color: '#d4d0c6', opacity: 0.8, seed: 12 } },
      { name: 'Dewy morning web', group: 'Realistic', values: { anchor: 'none', spokes: 32, rings: 36, dew: 0.85, dewSize: 1.1, sag: 0.35, broken: 0.05, dust: 0, seed: 7 } },
      { name: 'Torn haunted web', group: 'Realistic', values: { anchor: 'all', cx: 0.5, cy: 0.45, spokes: 26, rings: 24, broken: 0.65, sag: 0.55, irregular: 0.6, dust: 0.45, color: '#d8d6d0', seed: 13 } },
      { name: 'Doorway web (all edges)', group: 'Realistic', values: { anchor: 'all', cx: 0.5, cy: 0.45, frames: 8, spokes: 34, rings: 40, sag: 0.25, broken: 0.08, seed: 21 } },
      { name: 'Garden spider (between posts)', group: 'Realistic', values: { anchor: 'sides', cx: 0.5, cy: 0.48, frames: 6, spokes: 30, rings: 34, hubGap: 0.1, irregular: 0.25, sag: 0.2, broken: 0.04, dust: 0, seed: 3 } },
      { name: 'Web hanging from the top', group: 'Realistic', values: { anchor: 'top', cx: 0.5, cy: 0.42, size: 0.95, spokes: 24, rings: 26, sag: 0.45, broken: 0.25, dust: 0.25, seed: 30 } },
      { name: 'Funnel web', group: 'Realistic', values: { type: 'funnel', anchor: 'top', cx: 0.5, cy: 0.6, size: 1.1, density: 160, irregular: 0.5, dust: 0.25, seed: 5 } },
      { name: 'Ceiling corners', group: 'Realistic', values: { type: 'corner', anchor: 'top', size: 0.9, density: 160, sag: 0.4, dust: 0.35, broken: 0.25, seed: 18 } },
      { name: 'Hanging cobweb strands', group: 'Realistic', values: { type: 'messy', anchor: 'top', cx: 0.5, cy: 0.2, size: 0.8, density: 90, sag: 1, broken: 0.7, dust: 0.6, seed: 41 } },
      { name: 'Toon web', group: 'Stylized', values: { anchor: 'none', spokes: 10, rings: 7, hubGap: 0.12, irregular: 0, sag: 0.45, broken: 0, stray: 0, dust: 0, width: 5, color: '#ffffff', opacity: 1, seed: 2 } },
      { name: 'Halloween corner (toon)', group: 'Stylized', values: { anchor: 'tl', spokes: 8, rings: 6, hubGap: 0.05, irregular: 0.1, sag: 0.5, broken: 0, stray: 0, dust: 0, width: 4.5, color: '#ffffff', opacity: 1, seed: 6 } },
      { name: 'Ghostly cobweb', group: 'Stylized', values: { type: 'messy', anchor: 'tr', size: 1, density: 150, sag: 0.6, dust: 0.2, glow: 0.6, color: '#bfe8ff', opacity: 0.7, seed: 16 } },
      { name: 'Sci-fi laser web', group: 'Sci-fi', values: { anchor: 'all', cx: 0.5, cy: 0.5, frames: 6, spokes: 16, rings: 14, hubGap: 0.1, irregular: 0.05, sag: 0, broken: 0, stray: 0, dust: 0, width: 1.6, color: '#ff2a4a', opacity: 1, glow: 0.8, seed: 8 } },
      { name: 'Energy net', group: 'Sci-fi', values: { anchor: 'none', spokes: 12, rings: 10, hubGap: 0.05, irregular: 0, sag: 0, broken: 0.1, stray: 0, dust: 0, width: 1.2, color: '#3ad8ff', opacity: 1, glow: 1, seed: 19 } },
    ],

    render(ctx, W, H, p) {
      const S = Math.min(W, H), K = S / 1024, rnd = U.rng((p.seed | 0) * 131 + 7);
      // anchored sides; a corner web always anchors to both walls of each of its corners
      const sides = p.type === 'corner' ? [...new Set(cornerList(p.anchor).join(''))].join('') : SIDES[p.anchor] || '';
      const T = [], extras = [];
      const allowed = (s) => !!s && sides.includes(s);
      const wb = p.width * K;
      const KW = { frame: 1.5, moor: 1.35, spoke: 1.15, cap: 0.85, hub: 0.9, link: 0.7, sheet: 0.5, messy: 0.75, bundle: 2.4, dangle: 0.8 };
      const KA = { frame: 1, moor: 0.95, spoke: 1, cap: 0.85, hub: 0.9, link: 0.7, sheet: 0.55, messy: 0.65, bundle: 0.35, dangle: 0.75 };
      // keep threads off the edges that are not anchors (the anchored ones are crossed on purpose)
      const mg = 2 + wb * 4, fx = (x) => (x < mg && !allowed('l') ? mg : x > W - mg && !allowed('r') ? W - mg : x), fy = (y) => (y < mg && !allowed('t') ? mg : y > H - mg && !allowed('b') ? H - mg : y);
      const add = (x1, y1, x2, y2, kind, o) => {
        x1 = fx(x1); y1 = fy(y1); x2 = fx(x2); y2 = fy(y2);
        const len = Math.hypot(x2 - x1, y2 - y1);
        if (len < 0.5) return;
        let cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
        if (o.hub) { cx += (o.hub[0] - cx) * o.inward; cy += (o.hub[1] - cy) * o.inward; }
        cy += len * p.sag * (o.sagK || 0) * (0.7 + 0.6 * rnd());
        const vw = kind === 'messy' ? 0.5 + rnd() : 0.85 + 0.3 * rnd();
        T.push({ x1, y1, cx: fx(cx), cy: fy(cy), x2, y2, len, kind, w: wb * KW[kind] * vw, a: KA[kind] * (0.75 + 0.25 * rnd()), fade: !!o.fade });
      };
      const dangle = (x, y, l) => { const sw = (rnd() - 0.5) * l * 0.5; x = fx(x); y = fy(y); l = Math.min(l, Math.max(0, fy(y + l) - y)); if (l < 1) return; T.push({ x1: x, y1: y, cx: fx(x + sw), cy: y + l * 0.5, x2: fx(x + sw * 0.4), y2: y + l, len: l, kind: 'dangle', w: wb * KW.dangle, a: KA.dangle, fade: false }); };
      const G = { p, W, H, S, rnd, add, dangle, allowed, T, extras };
      const info = (p.type === 'corner' ? cornerWeb : p.type === 'funnel' ? funnelWeb : p.type === 'messy' ? messyWeb : orbWeb)(G);
      // stray threads across the web
      const hx = p.cx * W, hy = p.cy * H, rr = p.size * S * 0.5;
      for (let i = 0, n = Math.round(p.stray * 14); i < n; i++) {
        const a = rnd() * TAU, r = rr * Math.sqrt(rnd()), x = (info ? info.hx : hx) + Math.cos(a) * r, y = (info ? info.hy : hy) + Math.sin(a) * r, b = rnd() * TAU, l = S * (0.05 + 0.25 * rnd());
        add(x, y, x + Math.cos(b) * l, y + Math.sin(b) * l, rnd() < 0.5 ? 'link' : 'messy', { sagK: 0.3 });
        if (rnd() < 0.3) dangle(x, y, S * (0.02 + 0.06 * rnd()));
      }

      const col = U.hex(p.color), dcol = U.hex(p.dustColor), dust = p.dust, op = p.opacity;
      const tc = col.map((c, i) => Math.round(lerp(c, dcol[i], dust * 0.55)));
      const css = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
      const ext = (x, y, dx, dy) => { // run past the border so an anchored thread is cut cleanly by the edge
        const on = x <= 0.01 || y <= 0.01 || x >= W - 0.01 || y >= H - 0.01, l = Math.hypot(dx, dy) || 1;
        return on ? [x + (dx / l) * 4, y + (dy / l) * 4] : null;
      };
      const stroke = (c, list, color, wk, ak) => {
        c.lineCap = 'round';
        for (const t of list) {
          const w = t.w * wk * (1 + dust * 0.8), a = t.a * ak * op * (w < 0.7 ? w / 0.7 : 1);
          c.lineWidth = Math.max(0.7, w);
          if (t.fade) { const g = c.createLinearGradient(t.x1, t.y1, t.x2, t.y2); g.addColorStop(0, css(color, a)); g.addColorStop(1, css(color, 0)); c.strokeStyle = g; }
          else c.strokeStyle = css(color, a);
          c.beginPath();
          const e1 = ext(t.x1, t.y1, t.x1 - t.cx, t.y1 - t.cy), e2 = ext(t.x2, t.y2, t.x2 - t.cx, t.y2 - t.cy);
          if (e1) { c.moveTo(e1[0], e1[1]); c.lineTo(t.x1, t.y1); } else c.moveTo(t.x1, t.y1);
          c.quadraticCurveTo(t.cx, t.cy, t.x2, t.y2);
          if (e2) c.lineTo(e2[0], e2[1]);
          c.stroke();
        }
      };

      const out = p.output, white = out === 'white';
      if (out === 'ground') { ctx.fillStyle = p.bgColor; ctx.fillRect(0, 0, W, H); }
      else ctx.clearRect(0, 0, W, H);
      // funnel retreat: dark hole
      for (const e of extras) if (e.hole && !white) {
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 1.4);
        g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.7, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.r * 1.4, e.r * 1.15, 0, 0, TAU); ctx.fill();
      }
      // glow and dusty haze: a blurred copy of the threads underneath
      const haze = dust * 0.8, glow = p.glow;
      if (glow > 0 || haze > 0.05) {
        const gc = U.canvas(W, H), g = gc.getContext('2d');
        stroke(g, T, glow > 0 ? col : dcol, glow > 0 ? 2.5 + glow * 3 : 4, 1);
        ctx.save();
        ctx.globalAlpha = clamp(glow > 0 ? 0.6 + glow * 0.4 : haze);
        ctx.filter = `blur(${Math.max(1, S * (glow > 0 ? 0.004 + glow * 0.008 : 0.006))}px)`;
        ctx.drawImage(gc, 0, 0);
        if (glow > 0.5) { ctx.filter = `blur(${S * 0.02 * glow}px)`; ctx.drawImage(gc, 0, 0); }
        ctx.restore();
      }
      stroke(ctx, T, glow > 0.3 ? col.map((c) => Math.round(lerp(c, 255, 0.55))) : tc, 1, 1);

      // dust clumps along the threads
      if (dust > 0) {
        for (const t of T) {
          const n = Math.floor((t.len / S) * dust * (t.kind === 'messy' || t.kind === 'bundle' || t.kind === 'dangle' ? 40 : 18) + rnd());
          for (let k = 0; k < n; k++) {
            const u = rnd(), [x, y] = bez(t, u), m = 1 - u, tx = 2 * m * (t.cx - t.x1) + 2 * u * (t.x2 - t.cx), ty = 2 * m * (t.cy - t.y1) + 2 * u * (t.y2 - t.cy), r = Math.max(0.6, S * 0.0026 * (0.5 + dust) * (0.3 + rnd() * rnd() * 2.2));
            ctx.fillStyle = css(dcol, (0.18 + 0.32 * rnd()) * op);
            ctx.beginPath(); ctx.ellipse(x, y, r * (1.6 + rnd() * 2), r * (0.6 + rnd() * 0.4), Math.atan2(ty, tx), 0, TAU); ctx.fill(); // fluff stretched along the thread
            if (rnd() < 0.5) { // fluffy fibers
              ctx.strokeStyle = css(dcol, 0.35 * op); ctx.lineWidth = Math.max(0.5, wb * 0.5);
              ctx.beginPath(); const a = rnd() * TAU, l = r * (2 + rnd() * 3); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.5 + l * 0.3, x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
            }
          }
        }
      }
      // dew drops: a clear bead with a bright rim, a dark lower edge and a glint
      if (p.dew > 0) {
        const sp = (S * 0.016 * p.dewSize) / (0.35 + p.dew);
        for (const t of T) {
          if (t.fade || t.kind === 'sheet' || t.kind === 'bundle') continue;
          const n = Math.floor(t.len / sp);
          for (let k = 0; k < n; k++) {
            if (rnd() > 0.35 + p.dew * 0.65) continue;
            const [x, y] = bez(t, (k + 0.2 + rnd() * 0.6) / n), r = Math.max(0.7, S * 0.0024 * p.dewSize * (0.45 + rnd() * rnd() * 1.6));
            const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
            g.addColorStop(0, `rgba(255,255,255,${0.25 * op})`); g.addColorStop(0.65, `rgba(225,232,240,${0.35 * op})`); g.addColorStop(0.9, `rgba(255,255,255,${0.75 * op})`); g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
            if (!white) { ctx.strokeStyle = `rgba(20,28,36,${0.35 * op})`; ctx.lineWidth = Math.max(0.5, r * 0.18); ctx.beginPath(); ctx.arc(x, y, r * 0.88, 0.2, Math.PI - 0.2); ctx.stroke(); }
            if (r > 1.2) { ctx.fillStyle = `rgba(255,255,255,${0.95 * op})`; ctx.beginPath(); ctx.arc(x - r * 0.33, y - r * 0.36, r * 0.26, 0, TAU); ctx.fill(); }
          }
        }
      }
      if (white) { // white + alpha: keep the coverage only
        const img = ctx.getImageData(0, 0, W, H), d = img.data;
        for (let i = 0; i < d.length; i += 4) { d[i] = d[i + 1] = d[i + 2] = 255; }
        ctx.putImageData(img, 0, 0);
      }
    },
  });
})();
