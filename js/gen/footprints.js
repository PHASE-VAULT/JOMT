/* Footprints: footprint decals and trails of people and animals on a transparent background. Each print
   is drawn with canvas paths in its own local frame (length 1, toes up) into a depth canvas: red = how deep
   that part presses in (heel and ball deeper than the arch, tread lugs deeper than the grooves), green = the
   print's fade along the trail. Later prints overwrite earlier ones, like real overlapping steps. The depth
   is softened per surface, a raised rim is pushed up around it, and noise breaks prints apart (more toward
   the faded end for blood, ink and wet prints). Surfaces: mud (dark wet imprint, lighter rim), snow (blue
   shadows), sand (grainy, crumbly rim), wet prints on a floor (translucent, darker drying edge), bloody
   prints and ink stamps. Relief shading is ambient by default (or from a light angle). Output: color decal,
   white mask for tinting, on a ground color, or the height map (imprint lower, rim higher) for normal maps. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const RAD = Math.PI / 180;

  /* ---------- drawing helpers in the print's local frame ---------- */
  // smooth closed curve through points (Catmull-Rom as béziers)
  function blob(c, pts) {
    const n = pts.length;
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      c.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
    }
    c.closePath();
  }
  const ell = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };
  // tapered capsule from (x1, y1) radius r1 to (x2, y2) radius r2
  function cap(c, x1, y1, x2, y2, r1, r2) {
    const a = Math.atan2(y2 - y1, x2 - x1), n = a + Math.PI / 2;
    c.beginPath();
    c.arc(x1, y1, r1, n, n + Math.PI);
    c.arc(x2, y2, r2, n + Math.PI, n + Math.PI * 2);
    c.closePath();
  }
  // claw / talon: a pointed sliver from (x, y) along angle a
  function claw(c, x, y, a, len, w) {
    const cs = Math.cos(a), sn = Math.sin(a);
    c.beginPath();
    c.moveTo(x - sn * w, y + cs * w);
    c.quadraticCurveTo(x + cs * len * 0.6 - sn * w * 0.6, y + sn * len * 0.6 + cs * w * 0.6, x + cs * len, y + sn * len);
    c.quadraticCurveTo(x + cs * len * 0.6 + sn * w * 0.6, y + sn * len * 0.6 - cs * w * 0.6, x + sn * w, y - cs * w);
    c.closePath();
  }

  /* ---------- tread patterns, clipped to the sole by the caller ---------- */
  function tread(c, kind, D, f, rnd) {
    const deep = D(1), groove = D(0.28);
    if (kind === 'lug') { // staggered blocks, the classic boot lug
      c.fillStyle = deep;
      for (let r = 0, y = -0.47; y < 0.5; y += 0.082, r++) for (let x = -0.24 + (r & 1) * 0.045; x < 0.24; x += 0.09) { c.beginPath(); c.rect(x, y, 0.062, 0.05); c.fill(); }
    } else if (kind === 'chevron') {
      c.strokeStyle = deep; c.lineWidth = 0.034;
      for (let y = -0.5; y < 0.56; y += 0.075) { c.beginPath(); c.moveTo(-0.25, y + 0.05); c.lineTo(0, y); c.lineTo(0.25, y + 0.05); c.stroke(); }
    } else if (kind === 'waves') { // sneaker: wavy ribs and a pivot circle under the ball
      c.strokeStyle = groove; c.lineWidth = 0.018;
      for (let y = -0.5; y < 0.52; y += 0.045) { c.beginPath(); for (let x = -0.25; x <= 0.25; x += 0.02) { const yy = y + Math.sin(x * 40) * 0.012; x === -0.25 ? c.moveTo(x, yy) : c.lineTo(x, yy); } c.stroke(); }
      c.fillStyle = D(0.8); ell(c, -0.02, -0.2, 0.09, 0.09); c.fill();
      c.strokeStyle = groove; c.lineWidth = 0.014;
      for (let r = 0.025; r < 0.09; r += 0.025) { ell(c, -0.02, -0.2, r, r); c.stroke(); }
    } else if (kind === 'hex') { // sci-fi: hex cells with a deep core
      const s = 0.055, h = s * Math.sqrt(3);
      for (let j = -6; j <= 6; j++) for (let i = -4; i <= 4; i++) {
        const x = i * s * 1.5, y = j * h + (i & 1 ? h / 2 : 0);
        c.beginPath();
        for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; c.lineTo(x + Math.cos(a) * s * 0.78, y + Math.sin(a) * s * 0.78); }
        c.closePath(); c.fillStyle = deep; c.fill();
        ell(c, x, y, s * 0.25, s * 0.25); c.fillStyle = groove; c.fill();
      }
    } else if (kind === 'grid') {
      c.fillStyle = deep;
      for (let y = -0.5; y < 0.5; y += 0.05) for (let x = -0.25; x < 0.25; x += 0.05) { c.beginPath(); c.rect(x + 0.006, y + 0.006, 0.038, 0.038); c.fill(); }
    }
  }

  /* ---------- print shapes: (c, D, p, rnd) with D(v) = fill style for depth v; forward = -y ---------- */
  const solePath = (c) => blob(c, [[0, 0.5], [0.15, 0.46], [0.17, 0.3], [0.15, 0.16], [0.15, 0.02], [0.19, -0.16], [0.19, -0.32], [0.13, -0.45], [0, -0.5], [-0.12, -0.47], [-0.19, -0.36], [-0.2, -0.18], [-0.15, 0], [-0.13, 0.16], [-0.15, 0.3], [-0.14, 0.46]]);
  const grad = (c, D, stops) => { const g = c.createLinearGradient(0, 0.5, 0, -0.5); for (const [t, v] of stops) g.addColorStop(t, D(v)); return g; };
  function shoe(c, D, p, rnd, kind, sneaker) {
    const path = sneaker ? (c) => blob(c, [[0, 0.5], [0.13, 0.45], [0.15, 0.28], [0.14, 0.1], [0.17, -0.1], [0.18, -0.3], [0.12, -0.45], [0, -0.5], [-0.11, -0.47], [-0.17, -0.34], [-0.17, -0.16], [-0.12, 0.02], [-0.12, 0.2], [-0.13, 0.4]]) : solePath;
    path(c);
    c.fillStyle = grad(c, D, kind === 'none' || p.detail <= 0 ? [[0, 0.85], [0.3, 0.8], [0.45, 0.5], [0.7, 0.85], [1, 0.75]] : sneaker ? [[0, 0.6], [0.25, 0.55], [0.45, 0.38], [0.7, 0.58], [1, 0.5]] : [[0, 0.55], [0.27, 0.52], [0.33, 0.3], [0.5, 0.32], [0.56, 0.52], [1, 0.48]]);
    c.fill();
    if (kind !== 'none' && p.detail > 0) {
      c.save(); path(c); c.clip();
      c.globalAlpha = p.detail;
      tread(c, kind, D, 0, rnd);
      if (!sneaker) { c.fillStyle = D(0.38); c.beginPath(); c.rect(-0.3, 0.16, 0.6, 0.04); c.fill(); } // heel breast
      c.restore();
      c.strokeStyle = D(sneaker ? 0.78 : 0.7); c.lineWidth = 0.035; path(c); c.stroke(); // plain sole rim
    }
  }
  const SHAPES = {
    barefoot(c, D) {
      blob(c, [[0, 0.49], [0.1, 0.44], [0.13, 0.3], [0.13, 0.12], [0.16, -0.08], [0.16, -0.2], [0.1, -0.27], [-0.02, -0.29], [-0.13, -0.27], [-0.17, -0.17], [-0.12, -0.06], [-0.06, 0.08], [-0.08, 0.25], [-0.11, 0.38], [-0.07, 0.46]]);
      c.fillStyle = grad(c, D, [[0, 0.95], [0.2, 0.9], [0.42, 0.42], [0.6, 0.5], [0.72, 0.95], [0.8, 0.85]]); c.fill();
      c.fillStyle = D(0.88);
      for (const t of [[-0.115, -0.37, 0.062, 0.085, -0.1], [-0.015, -0.395, 0.036, 0.048, 0], [0.05, -0.38, 0.033, 0.044, 0.1], [0.105, -0.35, 0.03, 0.04, 0.2], [0.15, -0.305, 0.027, 0.034, 0.35]]) { ell(c, t[0], t[1], t[2], t[3], t[4]); c.fill(); }
    },
    boot(c, D, p, rnd) { shoe(c, D, p, rnd, p.tread, false); },
    sneaker(c, D, p, rnd) { shoe(c, D, p, rnd, p.tread === 'lug' ? 'waves' : p.tread, true); },
    heel(c, D) {
      blob(c, [[0, -0.5], [0.12, -0.46], [0.15, -0.3], [0.12, -0.12], [0.06, 0.02], [-0.04, 0.02], [-0.12, -0.12], [-0.15, -0.3], [-0.11, -0.46]]);
      c.fillStyle = grad(c, D, [[0.45, 0.4], [0.75, 0.85], [1, 0.7]]); c.fill();
      c.fillStyle = D(1); c.beginPath(); c.rect(-0.045, 0.37, 0.09, 0.075); c.fill();
    },
    dog(c, D, p, rnd, wolf) {
      const sy = wolf ? 1.12 : 1;
      c.save(); c.scale(1, sy);
      blob(c, [[-0.2, 0.06], [0, -0.01], [0.2, 0.06], [0.25, 0.2], [0.16, 0.33], [0.06, 0.3], [0, 0.36], [-0.06, 0.3], [-0.16, 0.33], [-0.25, 0.2]]);
      c.fillStyle = D(0.95); c.fill();
      const toes = wolf ? [[-0.24, -0.1, -0.3], [-0.085, -0.3, -0.08], [0.085, -0.3, 0.08], [0.24, -0.1, 0.3]] : [[-0.27, -0.1, -0.35], [-0.1, -0.27, -0.1], [0.1, -0.27, 0.1], [0.27, -0.1, 0.35]];
      c.fillStyle = D(0.9);
      for (const t of toes) { ell(c, t[0], t[1], 0.08, 0.11, t[2]); c.fill(); }
      c.fillStyle = D(0.75);
      for (const t of toes) { const a = t[2] - Math.PI / 2; claw(c, t[0] + Math.cos(a) * 0.12, t[1] + Math.sin(a) * 0.12, a, wolf ? 0.08 : 0.06, 0.022); c.fill(); }
      c.restore();
    },
    wolf(c, D, p, rnd) { SHAPES.dog(c, D, p, rnd, true); },
    cat(c, D) {
      blob(c, [[-0.24, 0.02], [-0.06, -0.03], [0.06, -0.03], [0.24, 0.02], [0.28, 0.18], [0.2, 0.32], [0.1, 0.27], [0, 0.34], [-0.1, 0.27], [-0.2, 0.32], [-0.28, 0.18]]);
      c.fillStyle = D(0.95); c.fill();
      c.fillStyle = D(0.88);
      for (const t of [[-0.3, -0.13, 0.08, 0.1, -0.3], [-0.11, -0.3, 0.085, 0.105, -0.1], [0.1, -0.33, 0.085, 0.105, 0.1], [0.3, -0.17, 0.08, 0.1, 0.35]]) { ell(c, t[0], t[1], t[2], t[3], t[4]); c.fill(); }
    },
    bear(c, D) { // hind foot: long sole, five toes in an arc, long claws
      blob(c, [[0, 0.5], [0.17, 0.45], [0.2, 0.25], [0.21, 0], [0.25, -0.17], [0.15, -0.23], [0, -0.21], [-0.15, -0.23], [-0.25, -0.16], [-0.2, 0], [-0.15, 0.25], [-0.13, 0.45]]);
      c.fillStyle = grad(c, D, [[0, 0.9], [0.4, 0.7], [0.75, 0.95]]); c.fill();
      const toes = [[-0.215, -0.29], [-0.11, -0.335], [0, -0.35], [0.11, -0.335], [0.22, -0.29]];
      for (const [x, y] of toes) { c.fillStyle = D(0.9); ell(c, x, y, 0.055, 0.065); c.fill(); c.fillStyle = D(0.7); claw(c, x, y - 0.06, -Math.PI / 2 + x * 0.8, 0.12, 0.02); c.fill(); }
    },
    bearFront(c, D) { // front paw: wide palm pad
      blob(c, [[-0.32, -0.1], [0, -0.15], [0.32, -0.1], [0.34, 0.04], [0.2, 0.12], [0, 0.1], [-0.2, 0.12], [-0.34, 0.04]]);
      c.fillStyle = D(0.95); c.fill();
      ell(c, 0.18, 0.3, 0.06, 0.06); c.fill();
      for (const [x, y] of [[-0.3, -0.24], [-0.15, -0.3], [0, -0.32], [0.15, -0.3], [0.3, -0.24]]) { c.fillStyle = D(0.9); ell(c, x, y, 0.06, 0.06); c.fill(); c.fillStyle = D(0.7); claw(c, x, y - 0.06, -Math.PI / 2 + x * 0.6, 0.12, 0.02); c.fill(); }
    },
    deer(c, D, p, rnd) { // cloven hoof: two pointed halves, sometimes dewclaws behind
      for (const s of [-1, 1]) {
        c.save(); c.scale(s, 1);
        blob(c, [[0.025, -0.48], [0.12, -0.3], [0.19, -0.02], [0.18, 0.26], [0.12, 0.4], [0.05, 0.38], [0.035, 0.1], [0.025, -0.2]]);
        c.fillStyle = grad(c, D, [[0.1, 0.8], [0.6, 0.9], [0.95, 1]]); c.fill();
        c.restore();
      }
      if (rnd() < 0.35 + p.variation * 0.3) { c.fillStyle = D(0.55); ell(c, -0.17, 0.55, 0.04, 0.05); c.fill(); ell(c, 0.17, 0.55, 0.04, 0.05); c.fill(); }
    },
    horse(c, D) { // shod hoof: shoe ring, hoof sole, frog, nail holes, open heels
      ell(c, 0, 0, 0.42, 0.48); c.fillStyle = D(0.98); c.fill();
      ell(c, 0, 0.05, 0.3, 0.35); c.fillStyle = D(0.5); c.fill();
      c.beginPath(); c.moveTo(0, -0.08); c.lineTo(0.15, 0.43); c.lineTo(-0.15, 0.43); c.closePath(); c.fillStyle = D(0.68); c.fill();
      c.beginPath(); c.rect(-0.13, 0.36, 0.26, 0.16); c.fillStyle = D(0.5); c.fill();
      c.fillStyle = D(0.62);
      for (const a of [-2.6, -2.25, -1.95, -1.19, -0.89, -0.54]) { ell(c, Math.cos(a) * 0.36, Math.sin(a) * 0.42, 0.022, 0.022); c.fill(); }
    },
    chicken(c, D) { // three forward toes, a short back toe, talons
      c.fillStyle = D(0.95);
      const o = [0, 0.2];
      for (const [a, l] of [[-90, 0.6], [-130, 0.46], [-50, 0.46], [90, 0.2]]) {
        const r = a * RAD, x = o[0] + Math.cos(r) * l, y = o[1] + Math.sin(r) * l;
        cap(c, o[0], o[1], x, y, 0.05, 0.03); c.fill();
        claw(c, x, y, r, 0.08, 0.025); c.fill();
      }
      ell(c, o[0], o[1], 0.075, 0.075); c.fill();
    },
    duck(c, D) { // webbed: three toes with scalloped webbing between them
      const o = [0, 0.38], tips = [[-122, 0.78], [-90, 0.86], [-58, 0.78]].map(([a, l]) => [o[0] + Math.cos(a * RAD) * l, o[1] + Math.sin(a * RAD) * l, a * RAD]);
      c.beginPath(); c.moveTo(o[0], o[1]);
      c.lineTo(tips[0][0], tips[0][1]);
      c.quadraticCurveTo((tips[0][0] + tips[1][0]) / 2, (tips[0][1] + tips[1][1]) / 2 + 0.3, tips[1][0], tips[1][1]);
      c.quadraticCurveTo((tips[1][0] + tips[2][0]) / 2, (tips[1][1] + tips[2][1]) / 2 + 0.3, tips[2][0], tips[2][1]);
      c.closePath(); c.fillStyle = D(0.6); c.fill();
      c.fillStyle = D(0.92);
      for (const t of tips) { cap(c, o[0], o[1], t[0], t[1], 0.05, 0.03); c.fill(); claw(c, t[0], t[1], t[2], 0.06, 0.022); c.fill(); }
      ell(c, o[0], o[1], 0.07, 0.08); c.fill();
    },
    rabbit(c, D) { // long, furry hind foot: no clear pads
      blob(c, [[0, -0.5], [0.12, -0.42], [0.14, -0.1], [0.12, 0.25], [0.08, 0.46], [0, 0.5], [-0.08, 0.46], [-0.12, 0.25], [-0.14, -0.1], [-0.12, -0.42]]);
      c.fillStyle = grad(c, D, [[0, 0.65], [0.5, 0.55], [0.85, 0.85]]); c.fill();
      c.fillStyle = D(0.8);
      c.fillStyle = D(0.95); for (const x of [-0.08, -0.027, 0.027, 0.08]) { ell(c, x, -0.4, 0.032, 0.07); c.fill(); }
    },
    rabbitFront(c, D) { ell(c, 0, 0, 0.13, 0.17); c.fillStyle = D(0.7); c.fill(); },
    raccoon(c, D, p, rnd, hind) { // hand-like: five long, spread fingers
      blob(c, hind ? [[-0.16, -0.06], [0, -0.1], [0.16, -0.06], [0.14, 0.2], [0.06, 0.44], [-0.06, 0.44], [-0.14, 0.2]] : [[-0.17, -0.05], [0, -0.09], [0.17, -0.05], [0.15, 0.12], [0, 0.17], [-0.15, 0.12]]);
      c.fillStyle = D(0.92); c.fill();
      for (const a of [-150, -118, -90, -62, -30]) {
        const r = a * RAD, x0 = Math.cos(r) * 0.12, y0 = Math.sin(r) * 0.1 - 0.04, l = a === -150 || a === -30 ? 0.24 : 0.32, x1 = x0 + Math.cos(r) * l, y1 = y0 + Math.sin(r) * l;
        c.fillStyle = D(0.72); cap(c, x0, y0, x1, y1, 0.05, 0.042); c.fill();
        c.fillStyle = D(0.9); ell(c, x1, y1, 0.058, 0.062); c.fill();
      }
    },
    raccoonHind(c, D, p, rnd) { SHAPES.raccoon(c, D, p, rnd, true); },
    dino(c, D) { // three massive toes with talons, a heel pad
      const o = [0, 0.22];
      c.fillStyle = D(0.95);
      ell(c, o[0], o[1] + 0.06, 0.16, 0.18); c.fill();
      for (const [a, l] of [[-90, 0.56], [-122, 0.46], [-58, 0.46]]) {
        const r = a * RAD, x = o[0] + Math.cos(r) * l, y = o[1] + Math.sin(r) * l;
        c.fillStyle = D(0.95); cap(c, o[0], o[1], x, y, 0.085, 0.06); c.fill();
        c.fillStyle = D(1); ell(c, o[0] + Math.cos(r) * l * 0.55, o[1] + Math.sin(r) * l * 0.55, 0.075, 0.075); c.fill(); // toe joint pad
        c.fillStyle = D(0.85); claw(c, x + Math.cos(r) * 0.04, y + Math.sin(r) * 0.04, r, 0.15, 0.045); c.fill();
      }
    },
  };

  // per kind: trail defaults and how the print is built. quad: front + hind print per step; w: print width / length
  const KINDS = {
    barefoot: { w: 0.36, stride: 2.3, gait: 1.4, toe: 8 }, boot: { w: 0.4, stride: 2.2, gait: 1.3, toe: 6 }, sneaker: { w: 0.36, stride: 2.3, gait: 1.35, toe: 6 },
    heel: { w: 0.3, stride: 2.2, gait: 0.3, toe: 4 }, dog: { w: 0.8, stride: 1.6, gait: 0.5, quad: 'dog', toe: 0 }, wolf: { w: 0.72, stride: 1.8, gait: 0.2, quad: 'wolf', toe: 0 },
    cat: { w: 0.85, stride: 1.5, gait: 0.35, quad: 'cat', toe: 0 }, bear: { w: 0.5, stride: 1.4, gait: 1.1, quad: 'bearFront', toe: -10 },
    deer: { w: 0.48, stride: 2.2, gait: 0.6, quad: 'deer', toe: 3 }, horse: { w: 0.9, stride: 1.9, gait: 0.5, quad: 'horse', toe: 3 },
    chicken: { w: 0.85, stride: 1.2, gait: 0.35, toe: -12 }, duck: { w: 0.95, stride: 1.1, gait: 0.6, toe: -15 },
    rabbit: { w: 0.32, stride: 2.6, gait: 1.2, quad: 'rabbitFront', toe: 0 }, raccoon: { w: 0.8, stride: 1.4, gait: 0.6, quad: 'raccoonHind', toe: 0 },
    dino: { w: 0.85, stride: 2.4, gait: 0.6, toe: -8 },
  };
  // surface looks (set when the surface changes): colors, softness, rim, depth, opacity
  const SURF = {
    mud: { color: '#2e2218', color2: '#5e4a36', soft: 0.25, rim: 0.6, depth: 0.75, opacity: 0.95, grain: 0.3 },
    snow: { color: '#8fa5cc', color2: '#f2f6fc', soft: 0.6, rim: 0.55, depth: 0.85, opacity: 0.9, grain: 0.06 },
    sand: { color: '#a8875a', color2: '#d9c49b', soft: 0.45, rim: 0.75, depth: 0.6, opacity: 0.9, grain: 0.4 },
    wet: { color: '#2a323a', color2: '#12171c', soft: 0.15, rim: 0, depth: 0.08, opacity: 0.7, grain: 0.2 },
    blood: { color: '#7a0a0c', color2: '#3c0405', soft: 0.1, rim: 0, depth: 0.1, opacity: 0.95, grain: 0.25 },
    ink: { color: '#16161a', color2: '#16161a', soft: 0, rim: 0, depth: 0.05, opacity: 1, grain: 0.5 },
  };
  const SCODE = { mud: 0, snow: 1, sand: 2, wet: 3, blood: 4, ink: 5 };

  // separable box blur (clamped edges), 2 passes; r in px; in place
  function blur(a, W, H, r) {
    r = Math.round(r);
    if (r < 1) return a;
    const tmp = new Float32Array(a.length), cs = new Float32Array(W), inv = 1 / (2 * r + 1);
    const cx = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);
    for (let n = 0; n < 2; n++) {
      for (let y = 0; y < H; y++) {
        const o = y * W; let s = 0;
        for (let k = -r; k <= r; k++) s += a[o + cx(k, W)];
        for (let x = 0; x < W; x++) { tmp[o + x] = s * inv; s += a[o + cx(x + r + 1, W)] - a[o + cx(x - r, W)]; }
      }
      cs.fill(0);
      for (let k = -r; k <= r; k++) { const row = cx(k, H) * W; for (let x = 0; x < W; x++) cs[x] += tmp[row + x]; }
      for (let y = 0; y < H; y++) {
        const o = y * W, ad = cx(y + r + 1, H) * W, sb = cx(y - r, H) * W;
        for (let x = 0; x < W; x++) { a[o + x] = cs[x] * inv; cs[x] += tmp[ad + x] - tmp[sb + x]; }
      }
    }
    return a;
  }

  /* trail layout in print lengths: [{ x, y, a, mirror, fade, kind, scale }] */
  function layout(p, rnd) {
    const K = KINDS[p.kind] || KINDS.boot, out = [], n = p.layout === 'single' ? 1 : Math.max(1, p.count);
    const turn = p.curve * 140 * RAD, sc = p.scatter, va = p.variation;
    let h = p.direction * RAD - turn / 2, x = 0, y = 0;
    for (let i = 0; i < n; i++) {
      const side = n === 1 ? 0 : i & 1 ? 1 : -1, nx = -Math.sin(h), ny = Math.cos(h); // side normal (right of heading)
      const off = side * p.gait * K.w * 0.5, j = () => (rnd() - 0.5) * 2;
      const fade = n === 1 ? 1 : 1 - p.fade * (i / (n - 1));
      const px = x + nx * off + j() * sc * 0.25, py = y + ny * off + j() * sc * 0.25;
      const a = h + side * K.toe * RAD + j() * sc * 0.3, s = 1 + j() * va * 0.08;
      const mirror = n === 1 ? p.foot === 'left' : side < 0;
      if (K.quad && n > 1) { // hind print lands behind / beside the front one
        const back = 0.42 + rnd() * 0.15 * (1 + va), sd = (0.06 + rnd() * 0.05) * side;
        out.push({ x: px - Math.cos(h) * back + nx * sd, y: py - Math.sin(h) * back + ny * sd, a: a + j() * 0.1, mirror, fade, kind: p.kind, scale: s * (p.kind === 'bear' ? 1 : 0.94) });
        out.push({ x: px, y: py, a, mirror, fade, kind: K.quad, scale: s * (p.kind === 'rabbit' ? 0.5 : 1) });
      } else out.push({ x: px, y: py, a, mirror, fade, kind: p.kind, scale: s });
      x += Math.cos(h) * p.stride; y += Math.sin(h) * p.stride;
      h += n > 1 ? turn / (n - 1) : 0;
    }
    return out;
  }

  const anyTread = (p) => p.kind === 'boot' || p.kind === 'sneaker';
  U.register({
    id: 'footprints',
    name: 'Footprints',
    desc: 'Footprint decals and trails of people and animals in mud, snow, sand, wet floors, blood or ink, with depth, rim, tread and a height map',
    uses: ['Ground decals for tracks and trails: boots in mud, animal tracks in snow, bloody shoe prints and wet footprints, with a height map for the normal map mode.', 'Stamps and paw prints for stylized UI, maps and posters.'],
    tags: ['Decals', 'Horror', 'Nature'],
    normalMap: true, // normal map mode from the print's own height (imprint lower, rim higher)
    heightMap: true,
    icon: U.icon('<path d="M8 3.5c1.6 0 2.4 1.8 2.2 4-.2 2-1 3.5-2.4 3.5S5.6 9.5 5.8 7.5C6 5 6.6 3.5 8 3.5z"/><ellipse cx="8" cy="13.6" rx="1.6" ry="1.4"/><path d="M16 9.5c1.6 0 2.4 1.8 2.2 4-.2 2-1 3.5-2.4 3.5s-2.2-1.5-2-3.5c.2-2.5.8-4 2.2-4z"/><ellipse cx="16" cy="19.6" rx="1.6" ry="1.4"/>'),
    params: [
      { type: 'section', label: 'Prints' },
      { key: 'kind', label: 'Foot', type: 'select', default: 'boot', options: [['barefoot', 'Bare foot'], ['boot', 'Boot'], ['sneaker', 'Sneaker'], ['heel', 'High heel'], ['dog', 'Dog'], ['wolf', 'Wolf'], ['cat', 'Cat'], ['bear', 'Bear'], ['deer', 'Deer (hoof)'], ['horse', 'Horse (shod)'], ['chicken', 'Chicken / bird'], ['duck', 'Duck (webbed)'], ['rabbit', 'Rabbit'], ['raccoon', 'Raccoon'], ['dino', 'Dinosaur / monster claw']], apply: (v, p) => { const k = KINDS[v]; if (k) { p.stride = k.stride; p.gait = k.gait; } }, tip: 'Also sets a typical step length and gait width' },
      { key: 'tread', label: 'Tread', type: 'select', default: 'lug', options: [['lug', 'Lug blocks'], ['chevron', 'Chevrons'], ['waves', 'Waves'], ['grid', 'Grid'], ['hex', 'Hex cells'], ['none', 'Smooth']], show: anyTread },
      { key: 'detail', label: 'Detail', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, show: anyTread, tip: 'How crisply the tread pattern shows' },
      { key: 'layout', label: 'Layout', type: 'select', default: 'trail', options: [['trail', 'Trail'], ['single', 'Single print']] },
      { key: 'foot', label: 'Foot side', type: 'select', default: 'right', options: [['right', 'Right'], ['left', 'Left']], show: (p) => p.layout === 'single' },
      { key: 'count', label: 'Steps', type: 'int', min: 2, max: 30, default: 4, show: (p) => p.layout === 'trail' },
      { key: 'stride', label: 'Step length', type: 'range', min: 0.5, max: 5, step: 0.05, default: 2.2, show: (p) => p.layout === 'trail', tip: 'Distance between steps, in print lengths' },
      { key: 'gait', label: 'Gait width', type: 'range', min: 0, max: 2, step: 0.01, default: 1.3, show: (p) => p.layout === 'trail', tip: 'Left / right offset of the steps, in print widths' },
      { key: 'curve', label: 'Path curvature', type: 'range', min: -1, max: 1, step: 0.01, default: 0, show: (p) => p.layout === 'trail' },
      { key: 'direction', label: 'Direction', type: 'range', min: -180, max: 180, step: 1, default: -90, tip: 'Walking direction (-90 = up); rotates a single print' },
      { key: 'size', label: 'Print size', type: 'range', min: 0.03, max: 0.95, step: 0.005, default: 0.2, tip: 'Print length relative to the texture; a fitted trail shrinks it when needed' },
      { key: 'fit', label: 'Fit trail into texture', type: 'bool', default: true, show: (p) => p.layout === 'trail', tip: 'Off: the trail keeps the print size and may run off the edges' },
      { key: 'scatter', label: 'Scatter', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Random offset and rotation per print' },
      { key: 'variation', label: 'Variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Size, depth and partial prints vary per step' },
      { key: 'fade', label: 'Fade along trail', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: (p) => p.layout === 'trail', tip: 'Later prints get fainter (and break up for blood, ink and wet prints)' },
      { key: 'smear', label: 'Slip / smear', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Prints dragged backwards a little, like slipping' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 5 },

      { type: 'section', label: 'Surface' },
      { key: 'surface', label: 'Surface', type: 'select', default: 'mud', options: [['mud', 'Mud imprint'], ['snow', 'Snow'], ['sand', 'Sand'], ['wet', 'Wet prints on a floor'], ['blood', 'Bloody prints'], ['ink', 'Ink / stamp']], apply: (v, p) => { const s = SURF[v]; if (s) Object.assign(p, s); }, tip: 'Sets colors, softness, rim, depth and grain for that surface' },
      { key: 'depth', label: 'Imprint depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75 },
      { key: 'rim', label: 'Raised rim', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Material pushed up around the print' },
      { key: 'soft', label: 'Edge softness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: 'grain', label: 'Grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Surface texture inside the print' },
      { key: 'broken', label: 'Broken prints', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Noise eats holes into the prints' },
      { key: 'color', label: 'Print color', type: 'color', default: '#2e2218', tip: 'Deep part of the imprint, or the color of wet / blood / ink prints' },
      { key: 'color2', label: 'Rim / edge color', type: 'color', default: '#5e4a36' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.95 },

      { type: 'section', label: 'Shading' },
      { key: 'shade', label: 'Relief shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Shading of the imprint walls and rim' },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'ambient', options: [['ambient', 'Ambient (soft, no direction)'], ['angled', 'Angled (light angle)']], show: (p) => p.shade > 0, tip: 'Ambient: walls darken evenly, no direction (best for decals the engine lights). Angled: lit from one side' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -135, show: (p) => p.shade > 0 && p.lightMode === 'angled' },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color decal (transparent)'], ['mask', 'White mask (for tinting)'], ['ground', 'On a ground color'], ['height', 'Height map']] },
      { key: 'groundColor', label: 'Ground color', type: 'color', default: '#6a543e', show: (p) => p.output === 'ground' },
    ],
    presets: [
      { name: 'Muddy boot trail', group: 'Realistic', values: { kind: 'boot', surface: 'mud', count: 4, direction: -70, curve: 0.15, seed: 3 } },
      { name: 'Bare feet on sand', group: 'Realistic', values: { kind: 'barefoot', surface: 'sand', count: 4, direction: -100, curve: -0.2, fade: 0.2, seed: 11 } },
      { name: 'Dog in snow', group: 'Realistic', values: { kind: 'dog', surface: 'snow', count: 6, direction: -60, curve: 0.3, scatter: 0.3, fade: 0.1, seed: 8 } },
      { name: 'Bloody shoe prints', group: 'Realistic', values: { kind: 'sneaker', surface: 'blood', count: 4, direction: -80, fade: 0.85, broken: 0.25, smear: 0.2, seed: 21 } },
      { name: 'Deer tracks', group: 'Realistic', values: { kind: 'deer', surface: 'mud', count: 6, direction: -110, curve: 0.2, seed: 4 } },
      { name: 'Bear tracks', group: 'Realistic', values: { kind: 'bear', surface: 'mud', count: 3, direction: -75, depth: 0.85, seed: 13 } },
      { name: 'Cat on the floor (wet)', group: 'Realistic', values: { kind: 'cat', surface: 'wet', count: 6, direction: -30, curve: -0.3, fade: 0.6, broken: 0.25, seed: 6 } },
      { name: 'Chicken scratch', group: 'Realistic', values: { kind: 'chicken', surface: 'mud', count: 7, direction: -95, scatter: 0.6, curve: 0.4, depth: 0.6, seed: 17 } },
      { name: 'Duck in mud', group: 'Realistic', values: { kind: 'duck', surface: 'mud', count: 5, direction: -80, color: '#262016', color2: '#4e4230', seed: 9 } },
      { name: 'Wolf tracks in snow', group: 'Realistic', values: { kind: 'wolf', surface: 'snow', count: 6, direction: -90, scatter: 0.15, seed: 23 } },
      { name: 'Horse in mud', group: 'Realistic', values: { kind: 'horse', surface: 'mud', count: 4, direction: -60, depth: 0.9, seed: 30 } },
      { name: 'Rabbit in snow', group: 'Realistic', values: { kind: 'rabbit', surface: 'snow', count: 4, direction: -90, seed: 14 } },
      { name: 'Raccoon by the creek', group: 'Realistic', values: { kind: 'raccoon', surface: 'mud', count: 4, direction: -120, color: '#3a2c1e', seed: 27 } },
      { name: 'Wet footprints on tiles', group: 'Realistic', values: { kind: 'barefoot', surface: 'wet', count: 4, direction: -90, fade: 0.7, seed: 19 } },
      { name: 'High heels in blood', group: 'Realistic', values: { kind: 'heel', surface: 'blood', count: 5, direction: -90, fade: 0.8, seed: 33 } },
      { name: 'Single boot print', group: 'Realistic', values: { kind: 'boot', surface: 'mud', layout: 'single', size: 0.9, direction: -90, scatter: 0, broken: 0.1 } },
      { name: 'Dinosaur', group: 'Stylized', values: { kind: 'dino', surface: 'mud', count: 3, direction: -80, depth: 1, rim: 0.8, color: '#3a2a1a', color2: '#6e5236', seed: 2 } },
      { name: 'Toon paw prints', group: 'Stylized', values: { kind: 'cat', surface: 'ink', count: 7, direction: -45, curve: 0.5, color: '#3a2a6a', color2: '#3a2a6a', grain: 0, broken: 0, scatter: 0.1, fade: 0, variation: 0, seed: 1 } },
      { name: 'Rubber stamp paw', group: 'Stylized', values: { kind: 'dog', surface: 'ink', layout: 'single', size: 0.85, color: '#b0182a', color2: '#b0182a', grain: 0.6, broken: 0.25 } },
      { name: 'Sci-fi boot', group: 'Sci-fi', values: { kind: 'boot', tread: 'hex', detail: 1, surface: 'sand', count: 3, direction: -90, color: '#3e434c', color2: '#9a9ea6', soft: 0.12, grain: 0.15, rim: 0.4, depth: 0.85, broken: 0.05, seed: 12 } },
    ],

    render(ctx, W, H, p, opts) {
      const heightOut = !!(opts && opts.height) || p.output === 'height', S = Math.min(W, H), N = W * H;
      const rnd = U.rng((p.seed | 0) * 97 + 13);
      /* 1. layout + fit */
      const L0 = p.size * S, prints = layout(p, rnd);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const q of prints) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
      const ext = 0.62; // print half extent around its center, in lengths
      let L = L0;
      if (p.layout === 'trail' && p.fit) L = Math.min(L0, (W * 0.94) / (x1 - x0 + ext * 2), (H * 0.94) / (y1 - y0 + ext * 2));
      const ox = W / 2 - ((x0 + x1) / 2) * L, oy = H / 2 - ((y0 + y1) / 2) * L;

      /* 2. depth canvas: R = depth, G = fade */
      const dc = U.canvas(W, H), c = dc.getContext('2d');
      for (const q of prints) {
        const dv = 1 - p.variation * 0.25 * rnd(); // depth varies per print; the fade goes into green
        const D = (v) => `rgb(${Math.round(clamp(v * dv) * 255)},${Math.round(q.fade * 255)},0)`;
        const sm = p.smear > 0 ? Math.round(2 + p.smear * 6) : 0, draw = SHAPES[q.kind] || SHAPES.boot;
        for (let k = sm; k >= 0; k--) { // smear copies first (pulled backwards, shallower), the print on top
          const back = sm ? (k / sm) * p.smear * 0.35 : 0, Dk = k ? (v) => D(v * (0.85 - 0.35 * (k / sm))) : D;
          c.save();
          c.translate(ox + (q.x - Math.cos(q.a) * back) * L, oy + (q.y - Math.sin(q.a) * back) * L);
          c.rotate(q.a + Math.PI / 2);
          c.scale(L * q.scale * (q.mirror ? -1 : 1), L * q.scale);
          draw(c, Dk, p, U.rng((p.seed | 0) + prints.indexOf(q) * 31));
          c.restore();
        }
      }
      const dd = c.getImageData(0, 0, W, H).data, Dp = new Float32Array(N), Fd = new Float32Array(N), Al = new Float32Array(N);
      for (let i = 0, k = 0; i < N; i++, k += 4) { const a = dd[k + 3] / 255; Dp[i] = (dd[k] / 255) * a; Fd[i] = (dd[k + 1] / 255) * a; Al[i] = a; }

      /* 3. soft walls, rim, fade field, erosion */
      const sc = SCODE[p.surface] == null ? 0 : SCODE[p.surface], imprint = sc <= 2;
      const Db = blur(Float32Array.from(Dp), W, H, L * (0.004 + p.soft * 0.035));
      const Rb = p.rim > 0 && imprint ? blur(Float32Array.from(Dp), W, H, L * 0.05) : null;
      const Ab = blur(Al, W, H, L * 0.05), Fb = blur(Fd, W, H, L * 0.05); // fade per pixel = blurred fade / blurred coverage
      const nE = U.coarseField(W, H, Math.min(400, Math.max(64, (S / L) * 10)), (x, y) => U.fractal('perlin', x / L * 3.2, y / L * 3.2, 0, 0, 4, 0.55, 'fbm', p.seed + 7));
      const gs = Math.max(1.2, L * 0.012); // grain size in px
      const nG = U.coarseField(W, H, Math.min(S / 1.2, S / gs), (x, y) => U.hash(Math.round(x / gs), Math.round(y / gs), p.seed + 3));
      const fadeErode = sc >= 3 ? 0.5 : 0.15;
      const Hh = new Float32Array(N), Rim = new Float32Array(N), Dd = new Float32Array(N), Ff = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const f = Ab[i] > 0.002 ? clamp(Fb[i] / Ab[i]) : 1, thr = p.broken * 0.55 + (1 - f) * fadeErode * p.fade + 0.02;
        const keep = smoothstep(thr - 0.1, thr + 0.1, nE[i] * 1.1 + (nG[i] - 0.5) * 0.08 * (sc >= 3 ? 2 : 1));
        const d = Db[i] * keep, rim = Rb ? clamp((Rb[i] * 1.3 - Db[i] * 1.6) * 2.5) * smoothstep(0.02, 0.15, Rb[i]) * keep : 0, fk = 0.45 + 0.55 * f;
        Dd[i] = d; Rim[i] = rim * p.rim * fk; Ff[i] = f;
        Hh[i] = 0.5 - d * fk * p.depth * 0.45 + Rim[i] * 0.12 * (0.4 + p.depth) + (nG[i] - 0.5) * 0.012 * p.grain;
      }
      const img = ctx.createImageData(W, H), o = img.data;
      if (heightOut) {
        for (let i = 0; i < N; i++) { const g = clamp(Hh[i]) * 255; o[i * 4] = o[i * 4 + 1] = o[i * 4 + 2] = g; o[i * 4 + 3] = 255; }
        ctx.putImageData(img, 0, 0);
        return;
      }

      /* 4. color */
      const c1 = U.hex(p.color), c2 = U.hex(p.color2), gc = U.hex(p.groundColor), out = p.output, op = p.opacity, gr = p.grain;
      const amb = p.lightMode !== 'angled', la = p.lightAngle * RAD, Lx = Math.cos(la) * 0.7071, Ly = Math.sin(la) * 0.7071, hs = L * 0.08 * p.shade;
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const d = Dd[i], rim = Rim[i], k = i * 4, f = Ff[i], dH = d * (0.45 + 0.55 * f);
          let a = 0, r = 0, g = 0, b = 0;
          if (d > 0.003 || rim > 0.003) {
            const n = nG[i] - 0.5;
            let sh = 1;
            if (hs > 0 && imprint) {
              const gx = (Hh[y * W + Math.min(W - 1, x + 1)] - Hh[y * W + Math.max(0, x - 1)]) * 0.5 * hs, gy = (Hh[Math.min(H - 1, y + 1) * W + x] - Hh[Math.max(0, y - 1) * W + x]) * 0.5 * hs;
              const nl = Math.sqrt(gx * gx + gy * gy + 1);
              sh = amb ? Math.max(0.45, 1 - (1 - 1 / nl) * 2.2) : clamp(1 + ((-gx * Lx - gy * Ly) / nl + 0.7071 / nl - 0.7071) / 0.7071 * 1.2, 0.35, 1.6);
            }
            if (imprint) { // mud / snow / sand: deep = print color, rim = rim color
              const t = smoothstep(0.05, 1, dH);
              r = lerp(c2[0], c1[0], t); g = lerp(c2[1], c1[1], t); b = lerp(c2[2], c1[2], t);
              const gk = 1 + n * gr * (sc === 1 ? 0.3 : 0.8);
              r *= sh * gk; g *= sh * gk; b *= sh * gk;
              a = clamp(smoothstep(0.01, 0.2, dH) * (sc === 1 ? 0.9 : 1) + rim * (sc === 1 ? 0.18 : 0.7));
            } else { // wet / blood / ink: only the contact areas print (tread lugs, pads), with a darker drying edge
              const fill = smoothstep(0.36, 0.46, d), edge = sc === 5 ? 0 : fill * (1 - smoothstep(0.46, 0.75, d));
              const t = clamp(edge * 0.8 + n * gr * 0.6 + 0.1);
              r = lerp(c1[0], c2[0], t); g = lerp(c1[1], c2[1], t); b = lerp(c1[2], c2[2], t);
              a = (sc === 3 ? fill * (0.55 + edge * 0.45) * (0.85 + n * gr * 0.5) : fill * (0.9 + edge * 0.1) * (1 + n * gr * 0.3)) * (0.35 + 0.65 * f);
            }
            a = clamp(a * op);
          }
          if (out === 'mask') { o[k] = o[k + 1] = o[k + 2] = 255; o[k + 3] = a * 255; }
          else if (out === 'ground') { o[k] = lerp(gc[0], r, a); o[k + 1] = lerp(gc[1], g, a); o[k + 2] = lerp(gc[2], b, a); o[k + 3] = 255; }
          else { o[k] = r; o[k + 1] = g; o[k + 2] = b; o[k + 3] = a * 255; }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
