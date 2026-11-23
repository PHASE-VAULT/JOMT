/* Birds & Bats: distant flying silhouettes with a seamless wing-flap loop (tilesheet).
   The bird is a small 3D model (wings hinge at the shoulder and fold at the wrist, the hand
   sweeps back on the upstroke) projected straight from below or above (top-down only).
   Bird frame: X = right wing, Y = forward, Z = up; unit = one wing length. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, TAU } = U;
  const D2R = Math.PI / 180;
  const frac = (x) => x - Math.floor(x);

  // wing outlines in (s = along the span 0..1, c = chord, forward +), wrist position, fingers, body, beak
  const SHAPES = {
    crow: { lead: [[0, 0.1], [0.3, 0.13], [0.55, 0.13], [0.76, 0.09], [0.86, 0.03]], trail: [[0, -0.2], [0.3, -0.25], [0.6, -0.24], [0.76, -0.17], [0.86, -0.07]],
      wrist: 0.45, fing: { n: 5, s: 0.74, c0: 0.06, c1: -0.13, a0: 2, a1: -24, len: 0.25, w: 0.028 }, bl: 0.52, bw: 0.105, hr: 0.075, beak: 0.08, beakW: 0.035 },
    raptor: { lead: [[0, 0.12], [0.3, 0.16], [0.55, 0.15], [0.74, 0.1], [0.82, 0.05]], trail: [[0, -0.25], [0.25, -0.3], [0.5, -0.27], [0.7, -0.19], [0.82, -0.09]],
      wrist: 0.45, fing: { n: 6, s: 0.72, c0: 0.08, c1: -0.15, a0: 6, a1: -28, len: 0.25, w: 0.03 }, bl: 0.52, bw: 0.12, hr: 0.08, beak: 0.055, beakW: 0.035 },
    gull: { lead: [[0, 0.09], [0.25, 0.12], [0.45, 0.14], [0.7, 0.07], [1, -0.03]], trail: [[0, -0.11], [0.3, -0.13], [0.5, -0.13], [0.75, -0.1], [0.95, -0.05], [1, -0.03]],
      wrist: 0.45, bl: 0.48, bw: 0.095, hr: 0.068, beak: 0.07, beakW: 0.022 },
    swallow: { lead: [[0, 0.07], [0.3, 0.1], [0.5, 0.08], [0.8, 0], [1, -0.1]], trail: [[0, -0.1], [0.3, -0.12], [0.55, -0.12], [0.85, -0.12], [1, -0.1]],
      wrist: 0.35, bl: 0.36, bw: 0.07, hr: 0.06, beak: 0.02, beakW: 0.014 },
    generic: { lead: [[0, 0.1], [0.35, 0.13], [0.6, 0.1], [1, -0.02]], trail: [[0, -0.16], [0.4, -0.18], [0.7, -0.13], [1, -0.02]],
      wrist: 0.45, bl: 0.44, bw: 0.09, hr: 0.068, beak: 0.04, beakW: 0.02 },
    bat: { lead: [[0, 0.06], [0.33, 0.14], [0.55, 0.12], [0.8, 0.06], [1, 0]], trail: [[0, -0.3], [0.15, -0.22], [0.3, -0.28], [0.42, -0.1], [0.55, -0.22], [0.68, -0.05], [0.8, -0.14], [0.92, -0.02], [1, 0]],
      wrist: 0.33, bones: [[0.42, -0.1], [0.68, -0.05], [0.92, -0.02]], bl: 0.32, bw: 0.09, hr: 0.07, ears: true },
  };
  const TAILS = {
    none: [],
    short: [[-0.06, 0], [-0.07, -0.12], [0.07, -0.12], [0.06, 0]],
    wedge: [[-0.06, 0], [-0.085, -0.18], [0, -0.27], [0.085, -0.18], [0.06, 0]],
    round: [[-0.07, 0], [-0.1, -0.2], [-0.06, -0.28], [0, -0.3], [0.06, -0.28], [0.1, -0.2], [0.07, 0]],
    fan: [[-0.07, 0], [-0.17, -0.22], [-0.1, -0.28], [0, -0.3], [0.1, -0.28], [0.17, -0.22], [0.07, 0]],
    fork: [[-0.04, 0], [-0.13, -0.4], [-0.035, -0.16], [0, -0.14], [0.035, -0.16], [0.13, -0.4], [0.04, 0]],
    membrane: [[-0.2, 0.04], [-0.11, -0.12], [0, -0.17], [0.11, -0.12], [0.2, 0.04]],
  };
  // species presets for the Species select
  const SPECIES = {
    crow: { tail: 'round', tailLen: 1, fingers: 5, wingWidth: 1, sweep: 4, color: '#141414', color2: '#1e1e1e', tipColor: '#141414', tipAmt: 0, amplitude: 40, glide: 0.15, dihedral: 3, fold: 0.45, flaps: 2 },
    raptor: { tail: 'fan', tailLen: 1, fingers: 6, wingWidth: 1, sweep: 0, color: '#4e3420', color2: '#cdb48c', tipColor: '#22170e', tipAmt: 0.25, amplitude: 22, glide: 0.6, dihedral: 9, fold: 0.3, flaps: 1 },
    gull: { tail: 'short', tailLen: 1, fingers: 0, wingWidth: 1, sweep: 20, color: '#a2aab2', color2: '#f2f2f0', tipColor: '#121212', tipAmt: 0.22, amplitude: 34, glide: 0.45, dihedral: 7, fold: 0.55, flaps: 1 },
    swallow: { tail: 'fork', tailLen: 1.2, fingers: 0, wingWidth: 1, sweep: 32, color: '#18203c', color2: '#ece2d4', tipColor: '#18203c', tipAmt: 0, amplitude: 45, glide: 0.35, dihedral: 0, fold: 0.75, flaps: 2 },
    generic: { tail: 'wedge', tailLen: 1, fingers: 0, wingWidth: 1, sweep: 10, color: '#1c1c1c', color2: '#2a2a2a', tipColor: '#1c1c1c', tipAmt: 0, amplitude: 45, glide: 0.2, dihedral: 3, fold: 0.45, flaps: 2 },
    bat: { tail: 'membrane', tailLen: 1, fingers: 0, wingWidth: 1, sweep: 0, color: '#2c2320', color2: '#3c302a', tipColor: '#2c2320', tipAmt: 0, amplitude: 60, glide: 0, dihedral: 0, fold: 0.85, flaps: 2 },
  };
  const VIEWS = { below: [180, -90], top: [0, 90] }; // [yaw, pitch]: top-down only

  // piecewise-linear edge at span position s
  const edge = (pts, s) => {
    let i = 0;
    while (i < pts.length - 2 && s > pts[i + 1][0]) i++;
    const a = pts[i], b = pts[i + 1];
    return lerp(a[1], b[1], clamp((s - a[0]) / (b[0] - a[0] || 1)));
  };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const css = (c, k = 1) => `rgb(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0})`;

  function drawBird(ctx, p, cx, cy, sc, ph, roll) {
    const sp = SHAPES[p.species] || SHAPES.generic;
    const bs = p.bodySize, bl = sp.bl * bs, bw = sp.bw * bs, hr = sp.hr * bs, xs = bw * 0.6;
    const ww = p.wingWidth, wrist = sp.wrist;
    // flap: glide share of the cycle at the dihedral angle, then one wing beat (up first, fast downstroke)
    const u = frac(ph), g = p.glide;
    let th = p.dihedral * D2R, fold = 0, bob = 0;
    if (u >= g) {
      const v = (u - g) / (1 - g), w = v + p.skew * 0.12 * Math.sin(TAU * v); // skewed phase
      th += p.amplitude * D2R * Math.sin(TAU * w);
      const up = Math.cos(TAU * w); // > 0 while the wing rises
      fold = p.fold * Math.max(0, up) * (0.6 + 0.4 * Math.sin(Math.PI * v));
      bob = -Math.sin(TAU * w) * p.amplitude / 90 * 0.04;
    }
    const sweep = (p.sweep * D2R) * (1 + fold * 0.4) + fold * 0.9, bend = -fold * 0.9 + (p.amplitude > 0 && u >= g ? -0.15 * Math.sin(TAU * ((u - g) / (1 - g))) : 0);
    const handSpan = 1 - fold * 0.25;
    // camera
    const vw = VIEWS[p.view] || VIEWS.below, yaw = vw[0] * D2R, pitch = vw[1] * D2R;
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), spc = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const proj = (X, Y, Z) => {
      Z += bob;
      const x1 = X * cyw - Y * syw, y1 = X * syw + Y * cyw;
      const up = Z * cp + y1 * spc, dep = y1 * cp - Z * spc;
      const px = x1 * cr - up * sr, py = x1 * sr + up * cr;
      return [cx + px * sc, cy - py * sc, dep];
    };
    // wing point (s, c) -> 3D (right wing; side = -1 mirrors)
    const ct = Math.cos(th), st = Math.sin(th), cs = Math.cos(sweep), ss = Math.sin(sweep), cb = Math.cos(bend), sb = Math.sin(bend);
    const wrc = edge(sp.lead, wrist) * ww * 0.5 + edge(sp.trail, wrist) * ww * 0.5;
    const wpt = (s, c, side) => {
      c *= ww;
      let a, b, h = 0;
      if (s <= wrist) { a = s; b = c; }
      else {
        const da0 = (s - wrist) * handSpan, db0 = c - wrc;
        const da = da0 * cs + db0 * ss, db = -da0 * ss + db0 * cs; // hand swept back
        a = wrist + da * cb; h = da * sb; b = wrc + db;
      }
      const X = xs + a * ct - h * st, Z = a * st + h * ct;
      return proj(X * side, b, Z);
    };
    const parts = [];
    const C1 = U.hex(p.color), C2 = U.hex(p.color2), CT = U.hex(p.tipColor), shaded = p.look === 'shaded';
    const NS = 18;
    for (const side of [1, -1]) {
      const poly = [];
      for (let i = 0; i <= NS; i++) { const s = i / NS * sp.lead[sp.lead.length - 1][0]; poly.push(wpt(s, edge(sp.lead, s), side)); }
      for (let i = NS; i >= 0; i--) { const s = i / NS * sp.trail[sp.trail.length - 1][0]; poly.push(wpt(s, edge(sp.trail, s), side)); }
      // primaries (fingers)
      const fingers = [];
      const F = sp.fing, nf = F ? Math.min(p.fingers | 0, 8) : 0;
      for (let f = 0; f < nf; f++) {
        const q = nf > 1 ? f / (nf - 1) : 0.5, c0 = lerp(F.c0, F.c1, q), a = lerp(F.a0, F.a1, q) * D2R, L = F.len * (1 - Math.abs(q - 0.35) * 0.35);
        const wd = F.w / ww, dx = Math.cos(a), dy = Math.sin(a);
        fingers.push([wpt(F.s, c0 + wd, side), wpt(F.s + dx * L * 0.6, c0 + dy * L * 0.6 / ww + wd * 0.7, side), wpt(F.s + dx * L, c0 + dy * L / ww, side), wpt(F.s + dx * L * 0.6, c0 + dy * L * 0.6 / ww - wd * 0.7, side), wpt(F.s, c0 - wd, side)]);
      }
      // which face is visible: wing normal toward the camera?
      const n = [-Math.sin(th) * side, 0, Math.cos(th)];
      const ny1 = n[0] * syw, nz = n[2], ndep = ny1 * cp - nz * spc;
      const under = ndep > 0; // normal points away -> we see the underside
      let dep = 0;
      for (const q of poly) dep += q[2];
      dep /= poly.length;
      const tipPoly = [];
      if (p.tipAmt > 0) {
        const t0 = 1 - p.tipAmt, sl = sp.lead[sp.lead.length - 1][0], stl = sp.trail[sp.trail.length - 1][0];
        for (let i = 0; i <= 8; i++) { const s = lerp(t0 * sl, sl, i / 8); tipPoly.push(wpt(s, edge(sp.lead, s), side)); }
        for (let i = 8; i >= 0; i--) { const s = lerp(t0 * stl, stl, i / 8); tipPoly.push(wpt(s, edge(sp.trail, s), side)); }
      }
      const bones = shaded && sp.bones ? sp.bones.map(([s, c]) => [wpt(wrist, wrc / ww, side), wpt(s, c, side)]) : null;
      parts.push({ dep: dep + 0.001 * side, draw: () => {
        let col = under && shaded ? C2 : C1;
        const k = shaded ? (0.82 + 0.18 * Math.abs(nz)) * (1 - clamp(dep * 1.2, 0, 0.3)) : 1;
        ctx.fillStyle = css(col, k); ctx.strokeStyle = ctx.fillStyle;
        const path = (pts) => { ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); ctx.stroke(); };
        path(poly);
        const tipc = shaded || p.tipAmt > 0 ? css(CT, k) : null;
        if (tipc && fingers.length && p.tipAmt > 0) { ctx.fillStyle = tipc; ctx.strokeStyle = tipc; }
        for (const f of fingers) path(f);
        if (tipPoly.length) { ctx.fillStyle = css(CT, k); ctx.strokeStyle = ctx.fillStyle; path(tipPoly); }
        if (shaded) {
          // soft shading: darker toward the trailing edge / lighter leading edge
          const a = wpt(0.3, edge(sp.lead, 0.3), side), b = wpt(0.3, edge(sp.trail, 0.3), side);
          const gr = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
          gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.16)');
          ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = gr; ctx.beginPath();
          poly.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); ctx.restore();
          if (bones) { ctx.strokeStyle = css(col, k * 0.65); ctx.lineWidth = Math.max(0.6, sc * 0.008); for (const [q0, q1] of bones) { ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke(); } ctx.lineWidth = lw; }
        }
      } });
    }
    // body: chain of spheres from tail to head, tail plate, head, beak / ears
    const showBelly = spc < -0.2; // looking from below
    const bodyCol = showBelly && shaded ? C2 : C1;
    const body = [];
    for (let i = 0; i <= 10; i++) {
      const v = i / 10, Y = -bl * 0.5 + v * bl, r = bw * Math.pow(Math.sin(Math.PI * (0.12 + 0.76 * v)), 0.7);
      body.push([proj(0, Y, 0), r]);
    }
    const head = proj(0, bl * 0.5 + hr * 0.4, hr * 0.15), beakTip = sp.beak ? proj(0, bl * 0.5 + hr * 0.6 + sp.beak * bs, hr * 0.05) : null;
    const tl = TAILS[p.tail] || TAILS.none, tailPts = tl.map(([x, y]) => proj(x * bs, -bl * 0.42 + y * p.tailLen * bs, 0));
    let tdep = 0;
    for (const q of tailPts) tdep += q[2];
    parts.push({ dep: tailPts.length ? tdep / tailPts.length : 0, draw: () => {
      if (!tailPts.length) return;
      ctx.fillStyle = css(bodyCol, shaded ? 0.92 : 1); ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath(); tailPts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.fill(); ctx.stroke();
    } });
    parts.push({ dep: head[2] * 0.5, draw: () => {
      ctx.fillStyle = css(bodyCol); ctx.strokeStyle = ctx.fillStyle;
      for (const [q, r] of body) { ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(0.5, r * sc), 0, TAU); ctx.fill(); }
      ctx.beginPath(); ctx.arc(head[0], head[1], Math.max(0.5, hr * sc), 0, TAU); ctx.fill();
      if (shaded) {
        // highlight along the back / belly
        const m = body[5][0], r = bw * sc;
        const gr = ctx.createRadialGradient(m[0] - r * 0.3, m[1] - r * 0.4, 0, m[0], m[1], r * 2.2);
        gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.save(); ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = gr; ctx.fillRect(m[0] - r * 3, m[1] - r * 3, r * 6, r * 6); ctx.restore();
      }
      if (beakTip) {
        const dx = beakTip[0] - head[0], dy = beakTip[1] - head[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, w = sp.beakW * bs * sc;
        ctx.fillStyle = css(p.species === 'gull' && shaded ? [230, 190, 40] : bodyCol, shaded && p.species !== 'gull' ? 0.8 : 1);
        ctx.beginPath(); ctx.moveTo(head[0] + nx * w, head[1] + ny * w); ctx.lineTo(beakTip[0], beakTip[1]); ctx.lineTo(head[0] - nx * w, head[1] - ny * w); ctx.closePath(); ctx.fill();
      }
      if (sp.ears) {
        ctx.fillStyle = css(bodyCol);
        for (const s of [1, -1]) {
          const b0 = proj(s * hr * 0.25, bl * 0.5 + hr * 0.5, hr * 0.6), b1 = proj(s * hr * 0.75, bl * 0.5 + hr * 0.3, hr * 0.5), tip = proj(s * hr * 0.75, bl * 0.5 + hr * 0.9, hr * 1.7);
          ctx.beginPath(); ctx.moveTo(b0[0], b0[1]); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(b1[0], b1[1]); ctx.closePath(); ctx.fill();
        }
      }
    } });
    // painter's order: far parts first
    const lw = Math.max(0.75, sc * 0.012);
    ctx.lineWidth = lw; ctx.lineJoin = 'round';
    parts.sort((a, b) => b.dep - a.dep);
    for (const q of parts) q.draw();
  }

  U.register({
    id: 'flyer',
    name: 'Birds & Bats',
    desc: 'Distant birds and bats as looping wing-flap tilesheets: crows, gulls, swallows, raptors and bats seen from below or above',
    uses: ['Flock and ambient wildlife particles for skies, horror scenes and landscapes, e.g. circling crows, seagulls over the coast or bats at night.', 'Small animated flying-creature sprites for 2D games and backgrounds; the white + alpha output can be tinted in the engine.'],
    tags: ['Nature', 'VFX', 'Horror'],
    bg: 'checker',
    animLoop: true,
    animate(p, f) { p.time = (p.time || 0) + f.t; return p; },
    icon: U.icon('<path d="M2.5 9.5c2.2-.6 4.6.2 6.5 2.5L12 14l3-2c1.9-2.3 4.3-3.1 6.5-2.5-2.6.7-4.6 2.6-5.6 4.8L12 17.5l-3.9-3.2C7.1 12.1 5.1 10.2 2.5 9.5z"/><path d="M11 13.6l1-1.6 1 1.6"/>'),
    params: [
      { type: 'section', label: 'Creature' },
      { key: 'species', label: 'Species', type: 'select', default: 'crow', options: [['crow', 'Crow / raven'], ['gull', 'Seagull'], ['swallow', 'Swallow / swift'], ['generic', 'Generic bird'], ['raptor', 'Raptor (hawk / eagle)'], ['bat', 'Bat']],
        apply: (v, p) => Object.assign(p, SPECIES[v] || {}) },
      { key: 'view', label: 'View', type: 'select', default: 'below', options: [['below', 'From below'], ['top', 'From above']] },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: 0 },
      { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.9, tip: 'Wingspan as a share of the frame' },

      { type: 'section', label: 'Shape' },
      { key: 'wingWidth', label: 'Wing width', type: 'range', min: 0.5, max: 2, step: 0.01, default: 1 },
      { key: 'sweep', label: 'Wing sweep', type: 'range', min: -20, max: 60, step: 1, default: 4, tip: 'How far the hand (outer wing) is swept back' },
      { key: 'fingers', label: 'Finger feathers', type: 'int', min: 0, max: 8, default: 5, show: (p) => p.species === 'crow' || p.species === 'raptor', tip: 'Spread primary feathers at the wing tip' },
      { key: 'bodySize', label: 'Body size', type: 'range', min: 0.5, max: 2, step: 0.01, default: 1 },
      { key: 'tail', label: 'Tail', type: 'select', default: 'round', options: [['none', 'None'], ['short', 'Short, square'], ['wedge', 'Wedge'], ['round', 'Rounded'], ['fan', 'Fan'], ['fork', 'Forked'], ['membrane', 'Membrane (bat)']] },
      { key: 'tailLen', label: 'Tail length', type: 'range', min: 0.3, max: 2, step: 0.01, default: 1, show: (p) => p.tail !== 'none' },

      { type: 'section', label: 'Flight' },
      { key: 'flaps', label: 'Wing beats per loop', type: 'int', min: 1, max: 4, default: 2 },
      { key: 'amplitude', label: 'Flap amplitude', type: 'range', min: 0, max: 80, step: 1, default: 40, tip: 'Degrees the wings swing up and down' },
      { key: 'glide', label: 'Glide portion', type: 'range', min: 0, max: 0.9, step: 0.01, default: 0.15, tip: 'Share of each cycle spent gliding with still wings' },
      { key: 'dihedral', label: 'Glide angle', type: 'range', min: -20, max: 30, step: 1, default: 3, tip: 'Wing angle while gliding (positive = shallow V)' },
      { key: 'fold', label: 'Wrist fold', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'The outer wing folds back and down on the upstroke' },
      { key: 'skew', label: 'Fast downstroke', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'time', label: 'Time', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Moment of the loop shown in single-frame mode (in the tilesheet it is the start offset)' },

      { type: 'section', label: 'Look' },
      { key: 'look', label: 'Look', type: 'select', default: 'silhouette', options: [['silhouette', 'Silhouette (flat)'], ['shaded', 'Shaded (colors, underside)']] },
      { key: 'color', label: 'Color', type: 'color', default: '#141414', tip: 'Silhouette color / upper side' },
      { key: 'color2', label: 'Underside color', type: 'color', default: '#1e1e1e', show: (p) => p.look === 'shaded' },
      { key: 'tipColor', label: 'Wing tip color', type: 'color', default: '#141414' },
      { key: 'tipAmt', label: 'Wing tip size', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0, tip: 'Darker (or lighter) wing tips, e.g. black gull tips' },
      { key: 'blur', label: 'Distance blur', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Softens the edges like a far-away, slightly hazy bird' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color + alpha'], ['gray', 'Grayscale + alpha'], ['white', 'White + alpha (tint in engine)']] },
    ],
    presets: [
      { name: 'Crow from below', group: 'Realistic', values: { species: 'crow' } },
      { name: 'Seagull', group: 'Realistic', values: { species: 'gull', look: 'shaded' } },
      { name: 'Seagull silhouette', group: 'Realistic', values: { species: 'gull', look: 'silhouette', color: '#2a2e33', tipAmt: 0 } },
      { name: 'Swallow', group: 'Realistic', values: { species: 'swallow', look: 'shaded' } },
      { name: 'Hawk soaring', group: 'Realistic', values: { species: 'raptor', look: 'shaded', glide: 0.75 } },
      { name: 'Bat', group: 'Realistic', values: { species: 'bat', look: 'shaded' } },
      { name: 'Horror crows (dark)', group: 'Game-inspired', values: { species: 'crow', color: '#050505', amplitude: 50, flaps: 3, glide: 0 } },
      { name: 'Vulture circling', group: 'Game-inspired', values: { species: 'raptor', glide: 0.85, amplitude: 15, color: '#18120e', fingers: 7 } },
      { name: 'White + alpha (tint in engine)', group: 'Stylized', values: { species: 'crow', output: 'white' } },
    ],
    render(ctx, W, H, p) {
      const t = frac(p.time || 0);
      ctx.clearRect(0, 0, W, H);
      const bl = p.blur > 0 ? 1 + p.blur * 5 : 1;
      const cw = Math.max(4, Math.round(W / bl)), ch = Math.max(4, Math.round(H / bl));
      const c = bl > 1 ? U.canvas(cw, ch) : ctx.canvas, cx2 = bl > 1 ? c.getContext('2d') : ctx;
      // always exactly one creature per texture (one impostor / particle sprite)
      drawBird(cx2, p, cw / 2, ch / 2, Math.min(cw, ch) * 0.5 * p.size * 0.92, t * p.flaps, p.rotation * D2R);
      if (bl > 1) { ctx.imageSmoothingEnabled = true; ctx.drawImage(c, 0, 0, W, H); }
      if (p.output !== 'color') {
        const im = ctx.getImageData(0, 0, W, H), d = im.data, white = p.output === 'white';
        for (let i = 0; i < d.length; i += 4) {
          if (!d[i + 3]) continue;
          const l = white ? 255 : Math.min(255, (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11));
          d[i] = d[i + 1] = d[i + 2] = l;
        }
        ctx.putImageData(im, 0, 0);
      }
    },
  });
})();
