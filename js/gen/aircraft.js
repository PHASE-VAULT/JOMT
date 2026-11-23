/* Planes & jets: billboard sprites of generic aircraft for distant particles and impostors, seen from
   below or from above (top-down), on a transparent background. Civilian (twin-engine airliner,
   four-engine jumbo, regional turboprop, light single-prop, business jet) and military classes (fighter,
   delta wing, stealth flying wing, bomber, transport, helicopter, attack helicopter). Every class is built
   from proportional parts (fuselage, swept wings, tail planes, fin, engine pods, props, rotors) in units of
   the fuselage length, so the shapes read right even a few pixels big. Generic shapes only: no real
   liveries or logos. Shading (angled light or ambient), simple liveries, contrails, navigation lights.
   Output: shaded color, white shaded (for tinting), flat silhouette or a white alpha mask. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp } = U;
  const RAD = Math.PI / 180, TAU = Math.PI * 2;

  /* class specs in fuselage lengths (nose at y = -0.5, tail at +0.5; x = to starboard).
     wing / ht (tail plane) / cn (canard): y = root leading edge, c = root chord, tc = tip chord, s = half span, sw = LE sweep (deg)
     vt (fin): h = height, c = root chord, tc = tip chord, sw = sweep. eng: f = share of the half span, len, d (diameter),
     fwd = share of the pod ahead of the wing, prop = prop diameter. */
  const TYPES = {
    airliner: { fw: 0.1, nose: 0.09, tail: 0.24, tailW: 0.018, wing: { y: -0.08, c: 0.21, tc: 0.045, s: 0.475, sw: 27, pos: 'low' }, ht: { y: 0.33, c: 0.1, tc: 0.04, s: 0.17, sw: 32 }, vt: { h: 0.17, c: 0.16, tc: 0.06, sw: 38 }, eng: [{ f: 0.34, len: 0.13, d: 0.055, fwd: 0.62 }], win: true },
    jumbo: { fw: 0.095, nose: 0.08, tail: 0.24, tailW: 0.016, hump: 0.33, wing: { y: -0.1, c: 0.23, tc: 0.05, s: 0.46, sw: 37, pos: 'low' }, ht: { y: 0.34, c: 0.1, tc: 0.04, s: 0.16, sw: 35 }, vt: { h: 0.15, c: 0.15, tc: 0.06, sw: 42 }, eng: [{ f: 0.28, len: 0.1, d: 0.045, fwd: 0.65 }, { f: 0.5, len: 0.095, d: 0.042, fwd: 0.6 }], win: true },
    regional: { fw: 0.1, nose: 0.1, tail: 0.25, tailW: 0.02, wing: { y: -0.08, c: 0.09, tc: 0.055, s: 0.5, sw: 3, pos: 'high' }, ht: { y: 0.42, c: 0.08, tc: 0.05, s: 0.15, sw: 18 }, tt: true, vt: { h: 0.17, c: 0.16, tc: 0.08, sw: 35 }, eng: [{ f: 0.3, len: 0.2, d: 0.05, fwd: 0.45, prop: 0.145 }], win: true, prop: true },
    cessna: { fw: 0.14, nose: 0.06, tail: 0.45, tailW: 0.03, wing: { y: -0.22, c: 0.17, tc: 0.12, s: 0.66, sw: 0, pos: 'high' }, ht: { y: 0.36, c: 0.12, tc: 0.08, s: 0.22, sw: 8 }, vt: { h: 0.2, c: 0.2, tc: 0.08, sw: 35 }, eng: [], noseProp: 0.24, strut: true, prop: true },
    bizjet: { fw: 0.11, nose: 0.13, tail: 0.3, tailW: 0.02, wing: { y: -0.02, c: 0.17, tc: 0.05, s: 0.44, sw: 28, pos: 'low' }, ht: { y: 0.4, c: 0.09, tc: 0.04, s: 0.15, sw: 32 }, tt: true, vt: { h: 0.17, c: 0.17, tc: 0.08, sw: 45 }, eng: [], rear: { y: 0.16, len: 0.17, d: 0.065 }, win: true },
    fighter: { fw: 0.075, intake: 0.125, nose: 0.2, tail: 0.12, tailW: 0.06, wing: { y: 0.02, c: 0.3, tc: 0.06, s: 0.33, sw: 42, pos: 'mid' }, ht: { y: 0.34, c: 0.15, tc: 0.05, s: 0.19, sw: 42 }, vt: { h: 0.2, c: 0.2, tc: 0.06, sw: 45 }, twin: true, lerx: true, canopy: [-0.36, -0.16], nozzle: 2, mil: true },
    delta: { fw: 0.08, intake: 0.115, nose: 0.2, tail: 0.1, tailW: 0.06, wing: { y: -0.2, c: 0.6, tc: 0.03, s: 0.36, sw: 56, pos: 'mid' }, cn: { y: -0.29, c: 0.08, tc: 0.03, s: 0.14, sw: 48 }, vt: { h: 0.2, c: 0.26, tc: 0.07, sw: 52 }, canopy: [-0.36, -0.18], nozzle: 1, mil: true },
    stealth: { wingOnly: true, mil: true },
    bomber: { fw: 0.065, nose: 0.08, tail: 0.25, tailW: 0.02, wing: { y: -0.06, c: 0.17, tc: 0.05, s: 0.58, sw: 36, pos: 'high' }, ht: { y: 0.36, c: 0.1, tc: 0.04, s: 0.2, sw: 36 }, vt: { h: 0.2, c: 0.17, tc: 0.07, sw: 38 }, eng: [{ f: 0.27, len: 0.1, d: 0.045, fwd: 0.6 }, { f: 0.5, len: 0.1, d: 0.045, fwd: 0.6 }], mil: true },
    transport: { fw: 0.13, nose: 0.08, tail: 0.3, tailW: 0.03, upsweep: true, wing: { y: -0.12, c: 0.13, tc: 0.08, s: 0.66, sw: 3, pos: 'high' }, ht: { y: 0.33, c: 0.12, tc: 0.07, s: 0.25, sw: 12 }, vt: { h: 0.25, c: 0.21, tc: 0.1, sw: 32 }, eng: [{ f: 0.22, len: 0.16, d: 0.05, fwd: 0.5, prop: 0.13 }, { f: 0.45, len: 0.16, d: 0.05, fwd: 0.5, prop: 0.13 }], prop: true, mil: true },
    helicopter: { heli: true, fw: 0.2, rotor: 0.52, stub: 0.1 },
    attack: { heli: true, fw: 0.11, rotor: 0.5, stub: 0.17, attack: true, mil: true },
  };
  const isHeli = (p) => p.type === 'helicopter' || p.type === 'attack';

  U.register({
    id: 'aircraft',
    name: 'Planes & Jets',
    desc: 'Billboard sprites of generic airliners, props, business jets, fighters, bombers and helicopters seen from below or above, with contrails and navigation lights',
    uses: [
      'Distant air traffic for skies: particles and billboard impostors of airliners and jets crossing the sky, with contrails, blinking navigation lights and a white output to tint in the engine.',
      'Military flyovers and background props for shooters, strategy and flight games: fighters, bombers, transports and helicopters as top-down sprites.',
    ],
    tags: ['Vehicles', 'Military', 'VFX'],
    aspect: '1:1',
    bg: 'checker',
    icon: U.icon('<path d="M12 2.5c.8 0 1.2 1 1.2 2.2v4.6l8 4.7v1.8l-8-2.4v4.2l2.3 1.8v1.4L12 20l-3.5.8v-1.4l2.3-1.8v-4.2l-8 2.4V14l8-4.7V4.7c0-1.2.4-2.2 1.2-2.2z"/>'),
    params: [
      { type: 'section', label: 'Aircraft' },
      { key: 'type', label: 'Type', type: 'select', default: 'airliner', options: [['airliner', 'Airliner (twin jet)'], ['jumbo', 'Jumbo jet (4 engines)'], ['regional', 'Regional turboprop'], ['cessna', 'Light plane (single prop)'], ['bizjet', 'Business jet'], ['fighter', 'Fighter jet'], ['delta', 'Delta-wing fighter'], ['stealth', 'Stealth flying wing'], ['bomber', 'Strategic bomber'], ['transport', 'Military transport'], ['helicopter', 'Helicopter'], ['attack', 'Attack helicopter']] },
      { key: 'view', label: 'View', type: 'select', default: 'below', options: [['below', 'From below'], ['top', 'From above']] },
      { key: 'size', label: 'Size', type: 'range', min: 0.1, max: 1, step: 0.01, default: 0.9, tip: 'How much of the image the aircraft (and its contrails) fills' },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: 0 },
      { key: 'sweepAdj', label: 'Wing sweep', type: 'range', min: -20, max: 20, step: 1, default: 0, show: (p) => !isHeli(p) && p.type !== 'stealth', tip: 'Degrees added to the class sweep' },
      { key: 'spanAdj', label: 'Wingspan', type: 'range', min: 0.7, max: 1.3, step: 0.01, default: 1, show: (p) => !isHeli(p) },
      { key: 'rotorBlur', label: 'Rotor blur', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75, show: isHeli, tip: '0 = still blades, 1 = a soft spinning disc' },

      { type: 'section', label: 'Livery' },
      { key: 'livery', label: 'Livery', type: 'select', default: 'tail', options: [['plain', 'Plain'], ['tail', 'Colored tail & engines'], ['stripe', 'Cheatline / spine stripe'], ['belly', 'Two-tone (belly)'], ['camo', 'Camouflage']] },
      { key: 'bodyColor', label: 'Body color', type: 'color', default: '#eceef1' },
      { key: 'wingColor', label: 'Wing color', type: 'color', default: '#b9bec6' },
      { key: 'accentColor', label: 'Accent color', type: 'color', default: '#2e5c9e', show: (p) => p.livery !== 'plain' },
      { key: 'glassColor', label: 'Cockpit glass', type: 'color', default: '#1d2733' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 3, show: (p) => p.livery === 'camo' },

      { type: 'section', label: 'Shading' },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'angled', options: [['angled', 'Angled (light angle)'], ['ambient', 'Ambient (soft, no direction)']], tip: 'Ambient: soft light from all around: fuselage and pods darken evenly toward their edges, no lit side' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -120, show: (p) => p.lightMode !== 'ambient', tip: 'Direction the light comes from in the image (-90 = from the top)' },
      { key: 'shade', label: 'Shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Strength of the rounded shading on fuselage, pods and wings' },
      { key: 'underside', label: 'Underside darkening', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.view !== 'top', tip: 'Seen from below, the plane is in its own shadow against the bright sky' },
      { key: 'details', label: 'Panel details', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Flap lines, inlets, exhausts and panel lines' },
      { key: 'flatten', label: 'Flatten (silhouette)', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.output === 'color' || p.output === 'white', tip: 'Blends the aircraft into one flat silhouette color: shading, livery and details fade out (contrails and lights stay). 1 = flat silhouette, e.g. for distant particles' },
      { key: 'flatColor', label: 'Silhouette color', type: 'color', default: '#15171c', show: (p) => p.flatten > 0 && p.output === 'color' },

      { type: 'section', label: 'Contrails & lights' },
      { key: 'contrails', label: 'Contrails', type: 'bool', default: false },
      { key: 'trailFrom', label: 'Trails from', type: 'select', default: 'engines', options: [['engines', 'Engines'], ['wingtips', 'Wingtips']], show: (p) => p.contrails },
      { key: 'trailLen', label: 'Trail length', type: 'range', min: 0.2, max: 6, step: 0.05, default: 2, show: (p) => p.contrails, tip: 'In aircraft lengths' },
      { key: 'trailWidth', label: 'Trail width', type: 'range', min: 0.2, max: 3, step: 0.05, default: 1, show: (p) => p.contrails },
      { key: 'trailFade', label: 'Trail fade', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.contrails, tip: 'How quickly the trail fades and spreads toward its end' },
      { key: 'trailOpacity', label: 'Trail opacity', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.8, show: (p) => p.contrails },
      { key: 'trailColor', label: 'Trail color', type: 'color', default: '#ffffff', show: (p) => p.contrails },
      { key: 'navLights', label: 'Navigation lights', type: 'bool', default: false, tip: 'Red (port / left) and green (starboard / right) wingtip lights, white tail light, red beacon' },
      { key: 'strobe', label: 'Strobes', type: 'bool', default: false, show: (p) => p.navLights, tip: 'Bright white flashes on the wingtips' },
      { key: 'lightSize', label: 'Light glow size', type: 'range', min: 0.2, max: 3, step: 0.05, default: 1, show: (p) => p.navLights },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Shaded color'], ['white', 'White shaded (for tinting)'], ['silhouette', 'Silhouette'], ['mask', 'White mask (alpha)']] },
      { key: 'silColor', label: 'Silhouette color', type: 'color', default: '#1b1e25', show: (p) => p.output === 'silhouette' },
    ],
    presets: [
      { name: 'Airliner from below', group: 'Civilian', values: {} },
      { name: 'Airliner with contrails', group: 'Civilian', aspect: '1:2', values: { contrails: true, trailLen: 2.6, size: 0.95 } },
      { name: 'Airliner from above', group: 'Civilian', values: { view: 'top', livery: 'stripe', lightAngle: -135 } },
      { name: 'Jumbo jet contrails', group: 'Civilian', aspect: '1:2', values: { type: 'jumbo', contrails: true, trailLen: 3, trailWidth: 0.8, size: 0.95, accentColor: '#9a2a2a' } },
      { name: 'Regional turboprop', group: 'Civilian', values: { type: 'regional', view: 'top', livery: 'tail', accentColor: '#2a8a5a', rotation: -30 } },
      { name: 'Light plane', group: 'Civilian', values: { type: 'cessna', view: 'top', livery: 'stripe', bodyColor: '#f2f2ee', wingColor: '#f2f2ee', accentColor: '#c0342a', rotation: 20 } },
      { name: 'Night airliner lights', group: 'Civilian', values: { navLights: true, strobe: true, output: 'silhouette', silColor: '#0c0e14', lightSize: 1.4 } },
      { name: 'Fighter jet', group: 'Military', values: { type: 'fighter', view: 'top', livery: 'plain', bodyColor: '#8b939c', wingColor: '#8b939c', glassColor: '#4a3a1a', lightAngle: -140 } },
      { name: 'Fighter from below', group: 'Military', values: { type: 'fighter', livery: 'belly', bodyColor: '#7d858e', wingColor: '#7d858e', accentColor: '#a4acb4', glassColor: '#4a3a1a' } },
      { name: 'Delta fighter', group: 'Military', values: { type: 'delta', view: 'top', livery: 'plain', bodyColor: '#9aa2aa', wingColor: '#9aa2aa', glassColor: '#3a3020', rotation: 35 } },
      { name: 'Camo fighter', group: 'Military', values: { type: 'fighter', view: 'top', livery: 'camo', bodyColor: '#6e7650', wingColor: '#6e7650', accentColor: '#4a4a34', glassColor: '#3a3020', seed: 9 } },
      { name: 'Stealth flying wing', group: 'Military', values: { type: 'stealth', view: 'top', livery: 'plain', bodyColor: '#3a3e44', wingColor: '#3a3e44', glassColor: '#121418', lightAngle: -150 } },
      { name: 'Bomber with contrails', group: 'Military', aspect: '1:2', values: { type: 'bomber', livery: 'plain', bodyColor: '#7e868c', wingColor: '#7e868c', contrails: true, trailLen: 2.5, size: 0.95 } },
      { name: 'Military transport', group: 'Military', values: { type: 'transport', view: 'top', livery: 'plain', bodyColor: '#6b7462', wingColor: '#6b7462', rotation: -20 } },
      { name: 'Helicopter', group: 'Military', values: { type: 'helicopter', view: 'top', livery: 'plain', bodyColor: '#5e6a4e', wingColor: '#5e6a4e', rotation: 25 } },
      { name: 'Distant airliner (flattened)', group: 'Civilian', aspect: '1:2', values: { flatten: 0.85, contrails: true, trailLen: 2.4, size: 0.95 } },
      { name: 'Distant fighter (flattened)', group: 'Military', values: { type: 'fighter', livery: 'plain', bodyColor: '#7c848c', wingColor: '#7c848c', flatten: 0.9 } },
      { name: 'Silhouette from below', group: 'Stylized', values: { output: 'silhouette', contrails: false } },
      { name: 'White sprite (tint)', group: 'Stylized', aspect: '1:2', values: { output: 'white', contrails: true, trailLen: 2.2 } },
      { name: 'Alpha mask jet', group: 'Stylized', values: { type: 'fighter', view: 'top', output: 'mask' } },
    ],
    render(ctx, W, H, p) {
      const T = TYPES[p.type] || TYPES.airliner, below = p.view !== 'top';
      const out = p.output, sil = out === 'silhouette' || out === 'mask', white = out === 'white';
      const silCol = out === 'mask' ? '#ffffff' : p.silColor;
      const col = (h) => (white ? [255, 255, 255] : U.hex(h));
      const body = col(p.bodyColor), wingC = col(p.wingColor), acc = col(p.accentColor), glass = white ? [70, 70, 70] : U.hex(p.glassColor);
      const liv = p.livery, amb = p.lightMode === 'ambient', K = p.shade;
      const rot = p.rotation * RAD;
      // light in local coordinates (x = starboard / along, y = aft / down)
      const la = p.lightAngle * RAD - rot;
      let lx = Math.cos(la);
      const ly = Math.sin(la);
      if (below) lx = -lx; // drawn mirrored
      const viewF = below ? 1 - p.underside * 0.45 : 1;
      const rgb = (c, f = 1) => `rgb(${clamp(c[0] * f * viewF, 0, 255) | 0},${clamp(c[1] * f * viewF, 0, 255) | 0},${clamp(c[2] * f * viewF, 0, 255) | 0})`;
      const S = Math.min(W, H);

      /* ---- geometry (local units) ---- */
      const spanK = p.spanAdj, swA = p.sweepAdj;
      const wingPts = (w, mirror, fwHalf) => { // one wing panel, root at the fuselage side
        const sw = (w.sw + (w === T.cn ? 0 : swA)) * RAD, s = w.s * (w === T.wing ? spanK : 1);
        const rx = fwHalf * 0.6, ty = w.y + (s - rx) * Math.tan(sw);
        const m = mirror ? -1 : 1;
        return [[rx * m, w.y], [s * m, ty], [s * m, ty + w.tc], [rx * m, w.y + w.c]];
      };
      const leAt = (w, x, fwHalf) => w.y + (Math.abs(x) - fwHalf * 0.6) * Math.tan((w.sw + swA) * RAD); // wing leading edge y at x
      const fwH = (T.fw || 0.1) / 2;

      // extents for fitting (local, before rotation)
      let ex0 = -0.55, ex1 = 0.55, ey0 = -0.55, ey1 = 0.55;
      if (T.wing) { ex1 = Math.max(ex1, T.wing.s * spanK + 0.02); ex0 = -ex1; }
      if (T.wingOnly) { ex1 = 0.64; ex0 = -0.64; ey0 = -0.26; ey1 = 0.28; }
      if (T.heli) { ex1 = T.rotor + 0.02; ex0 = -ex1; ey0 = Math.min(-0.55, -0.25 - T.rotor); }
      // contrail sources (local) and length
      const trails = [];
      const tl = p.contrails ? p.trailLen : 0;
      if (p.contrails) {
        if (p.trailFrom === 'wingtips' && T.wing) {
          const [, b, c] = wingPts(T.wing, false, fwH);
          trails.push([b[0], c[1], 0.02], [-b[0], c[1], 0.02]);
        } else if (T.wingOnly) { trails.push([0.12, 0.12, 0.04], [-0.12, 0.12, 0.04]); }
        else if (T.eng && T.eng.length) for (const e of T.eng) { const x = e.f * T.wing.s * spanK, y = leAt(T.wing, x, fwH) - e.len * e.fwd + e.len; trails.push([x, y, e.d], [-x, y, e.d]); }
        else if (T.rear) trails.push([fwH + T.rear.d * 0.5, T.rear.y + T.rear.len, T.rear.d], [-(fwH + T.rear.d * 0.5), T.rear.y + T.rear.len, T.rear.d]);
        else if (T.nozzle === 2) trails.push([0.025, 0.5, 0.04], [-0.025, 0.5, 0.04]);
        else trails.push([0, 0.5, 0.05]);
        ey1 += tl;
      }
      // fit: rotated bbox of the local extents
      const cs = Math.cos(rot), sn = Math.sin(rot);
      let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
      for (const [x, y] of [[ex0, ey0], [ex1, ey0], [ex0, ey1], [ex1, ey1]]) {
        const X = x * cs - y * sn, Y = x * sn + y * cs;
        bx0 = Math.min(bx0, X); bx1 = Math.max(bx1, X); by0 = Math.min(by0, Y); by1 = Math.max(by1, Y);
      }
      const sc = p.size * Math.min((W * 0.96) / (bx1 - bx0), (H * 0.96) / (by1 - by0));
      const cx = W / 2 - ((bx0 + bx1) / 2) * sc, cy = H / 2 - ((by0 + by1) / 2) * sc;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(below ? -sc : sc, sc);
      const px = 1 / sc; // one pixel in local units
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';

      /* ---- paint helpers ---- */
      const path = (pts) => { const P = new Path2D(); P.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) P.lineTo(pts[i][0], pts[i][1]); P.closePath(); return P; };
      // cylinder shading across the axis x0..x1 (local), light component `l` along that axis
      const cyl = (c, x0, y0, x1, y1, l, base = 1) => {
        if (sil) return silCol;
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        if (amb) { g.addColorStop(0, rgb(c, base * (1 - K * 0.35))); g.addColorStop(0.5, rgb(c, base * (1 + K * 0.06))); g.addColorStop(1, rgb(c, base * (1 - K * 0.35))); }
        else {
          const hl = clamp(0.5 + l * 0.32, 0.12, 0.88);
          g.addColorStop(0, rgb(c, base * (1 - K * (0.45 + 0.35 * l)))); g.addColorStop(hl, rgb(c, base * (1 + K * 0.12)));
          g.addColorStop(1, rgb(c, base * (1 - K * (0.45 - 0.35 * l))));
        }
        return g;
      };
      const flatF = (nl) => (sil ? 1 : amb ? 1 : 1 + K * 0.18 * nl); // flat panel facing the light by nl (-1..1)
      const fill = (P, style) => { ctx.fillStyle = sil ? silCol : style; ctx.fill(P); };
      const line = (pts, w, style) => { if (sil || p.details <= 0) return; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.strokeStyle = style; ctx.lineWidth = Math.max(w, px * 0.8); ctx.stroke(); };
      const ell = (x, y, rx, ry, a = 0) => { const P = new Path2D(); P.ellipse(x, y, Math.max(rx, 1e-4), Math.max(ry, 1e-4), a, 0, TAU); return P; };
      const capsule = (x, y0, y1, r) => { const P = new Path2D(); P.moveTo(x - r, y0 + r); P.arc(x, y0 + r, r, Math.PI, 0); P.lineTo(x + r, y1 - r * 0.6); P.ellipse(x, y1 - r * 0.6, r, r * 0.6, 0, 0, Math.PI); P.closePath(); return P; };
      const dark = (f) => `rgba(0,0,0,${f * p.details})`;
      const camo = (P) => { // blotches of the accent color clipped to a part
        if (sil || liv !== 'camo') return;
        ctx.save(); ctx.clip(P); ctx.fillStyle = rgb(acc, 1);
        const r = U.rng(p.seed | 0);
        for (let i = 0; i < 40; i++) { const x = (r() - 0.5) * 1.4, y = (r() - 0.5) * 1.1; ctx.beginPath(); ctx.ellipse(x, y, 0.04 + r() * 0.07, 0.03 + r() * 0.05, r() * 3, 0, TAU); ctx.fill(); }
        ctx.restore();
      };

      /* ---- contrails (behind everything) ---- */
      if (trails.length) {
        const tc = out === 'mask' ? [255, 255, 255] : sil ? U.hex(silCol) : U.hex(p.trailColor), a0 = p.trailOpacity * (out === 'silhouette' ? 0.5 : 1);
        let ti = 0;
        for (const [x, y, d] of trails) {
          ti++;
          const w0 = Math.max(d * 0.5, px * 1.2) * p.trailWidth, len = tl;
          for (const [wm, am] of [[2.6, 0.18], [1.6, 0.35], [1, 0.6]]) {
            const N = 24, L = [], R = [];
            for (let i = 0; i <= N; i++) {
              const t = i / N, ww = w0 * wm * (1 + t * (1.5 + p.trailFade * 4)) * (1 + 0.14 * U.perlin(t * 4 * len + 0.5, ti * 3.1 + wm, 0, 0, 11) * t) * (i === 0 ? 0.4 : 1);
              const s = 0.03 + t * len;
              L.push([x - ww, y + s]); R.push([x + ww, y + s]);
            }
            const g = ctx.createLinearGradient(0, y, 0, y + len + 0.03);
            const c = (a) => `rgba(${tc[0]},${tc[1]},${tc[2]},${a})`;
            g.addColorStop(0, c(0)); g.addColorStop(0.03 / (len + 0.03) + 0.02, c(a0 * am));
            g.addColorStop(clamp(1 - p.trailFade * 0.85, 0.08, 1), c(a0 * am * (1 - p.trailFade * 0.6)));
            g.addColorStop(1, c(0));
            ctx.fillStyle = g;
            ctx.fill(path(L.concat(R.reverse())));
          }
        }
      }

      const navPts = []; // [x, y, color]
      // flatten: the aircraft is drawn on its own layer and blended toward the silhouette color (contrails and lights stay)
      const ctx0 = ctx, flat = p.flatten > 0 && (out === 'color' || white) ? U.canvas(W, H) : null;
      if (flat) {
        ctx = flat.getContext('2d');
        ctx.setTransform(ctx0.getTransform());
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      }
      if (T.heli) drawHeliTop(); else if (T.wingOnly) drawFlyingWing(); else drawTop();
      if (flat) {
        const fc = white ? [255, 255, 255] : U.hex(p.flatColor), k = clamp(p.flatten, 0, 1), fx = flat.getContext('2d'), im = fx.getImageData(0, 0, W, H), d = im.data;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { d[i] += (fc[0] - d[i]) * k; d[i + 1] += (fc[1] - d[i + 1]) * k; d[i + 2] += (fc[2] - d[i + 2]) * k; }
        fx.putImageData(im, 0, 0);
        ctx = ctx0;
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(flat, 0, 0); ctx.restore();
      }

      /* ---- from above / below ---- */
      function drawTop() {
        const w = T.wing;
        const nose = T.nose, tailL = T.tail;
        // fuselage outline (right half, then mirrored); fighters widen at the intakes
        const R = [];
        for (let i = 0; i <= 10; i++) { const t = i / 10, y = -0.5 + t * nose; R.push([fwH * Math.sqrt(1 - (1 - t) * (1 - t)) * (T.intake ? 0.75 : 1), y]); }
        if (T.intake) { const iw = T.intake / 2; R.push([fwH, -0.5 + nose + 0.04], [iw, -0.5 + nose + 0.1], [iw, 0.5 - tailL - 0.02]); }
        R.push([T.intake ? T.intake / 2 : fwH, 0.5 - tailL]);
        R.push([T.tailW / 2, 0.5]);
        const fus = path(R.concat(R.slice().reverse().map(([x, y]) => [-x, y])));
        const ec = liv === 'tail' || liv === 'camo' ? acc : body;
        // engine pods under the wing (drawn first: the wing hides their back part from above)
        const pods = [];
        for (const e of T.eng || []) for (const m of [1, -1]) {
          const x = e.f * w.s * spanK * m, y0 = leAt(w, x, fwH) - e.len * e.fwd;
          pods.push({ x, y0, y1: y0 + e.len, r: e.d / 2, prop: e.prop });
        }
        const drawPods = () => {
          for (const q of pods) {
            const P = capsule(q.x, q.y0, q.y1, q.r);
            fill(P, cyl(ec, q.x - q.r, 0, q.x + q.r, 0, lx));
            if (!sil && p.details > 0) {
              if (below || q.prop) fill(ell(q.x, q.y0 + q.r * 0.35, q.r * 0.75, q.r * 0.3), dark(0.6));
              line([[q.x - q.r * 0.9, q.y1 - q.r * 0.6], [q.x + q.r * 0.9, q.y1 - q.r * 0.6]], px, dark(0.35));
            }
            if (q.prop) propDisc(q.x, q.y0 - 0.004, q.prop / 2);
          }
        };
        if (!below) drawPods();
        // wings
        for (const m of [false, true]) {
          const pts = wingPts(w, m, fwH), P = path(pts);
          const nl = (m ? -1 : 1) * lx * 0.25 - ly * 0.2;
          const g = sil ? silCol : ctx.createLinearGradient(0, w.y, 0, w.y + w.c);
          if (!sil) { g.addColorStop(0, rgb(wingC, flatF(nl) * (1 + K * 0.12))); g.addColorStop(0.35, rgb(wingC, flatF(nl))); g.addColorStop(1, rgb(wingC, flatF(nl) * (1 - K * 0.12))); }
          fill(P, g); camo(P);
          if (p.details > 0 && !sil && !T.mil) { // flap / aileron line and fairing
            const [a, b, c, d] = pts, f = 0.72;
            line([[lerp(a[0], d[0], f), lerp(a[1], d[1], f)], [lerp(b[0], c[0], f), lerp(b[1], c[1], f)]], px * 0.9, dark(0.25));
          }
          if (T.lerx) fill(path([[fwH * (m ? -1 : 1) * 0.9, -0.22], [(T.intake / 2 + 0.02) * (m ? -1 : 1), -0.02], [(T.intake / 2 + 0.05) * (m ? -1 : 1), w.y + 0.03], [fwH * (m ? -1 : 1), w.y + 0.03]]), rgb(wingC, flatF(nl)));
        }
        if (T.strut && below) for (const m of [1, -1]) line([[fwH * m, 0.02 - 0.22], [w.s * 0.45 * m, w.y + w.c * 0.4]], 0.012, rgb(wingC, 0.8));
        // tail planes / canards
        for (const tw of [T.ht, T.cn]) if (tw) for (const m of [false, true]) {
          const P = path(wingPts(tw, m, tw === T.ht && T.tt ? 0.01 : fwH));
          fill(P, rgb(tw === T.ht && (liv === 'tail') && T.tt ? acc : wingC, flatF((m ? -1 : 1) * lx * 0.25)));
          camo(P);
        }
        // fuselage
        fill(fus, cyl(body, -fwH * 1.2, 0, fwH * 1.2, 0, lx));
        camo(fus);
        if (!sil) {
          if (liv === 'stripe') { ctx.save(); ctx.clip(fus); ctx.fillStyle = rgb(acc, 1); ctx.fillRect(-fwH * 0.28, -0.5 + nose * 1.2, fwH * 0.56, 1 - nose * 1.2 - 0.02); ctx.restore(); }
          if (liv === 'belly' && below) { ctx.save(); ctx.clip(fus); ctx.fillStyle = cyl(acc, -fwH * 1.2, 0, fwH * 1.2, 0, lx); ctx.fillRect(-fwH * 0.7, -0.5, fwH * 1.4, 1); ctx.restore(); }
          if (liv === 'tail' && !T.mil) { ctx.save(); ctx.clip(fus); ctx.fillStyle = rgb(acc, 1); ctx.fillRect(-fwH * 2, 0.5 - tailL * 0.85, fwH * 4, 0.3); ctx.restore(); }
        }
        if (below) drawPods();
        if (T.rear) for (const m of [1, -1]) { // fuselage-mounted rear engines
          const x = (fwH + T.rear.d * 0.45) * m, P = capsule(x, T.rear.y, T.rear.y + T.rear.len, T.rear.d / 2);
          fill(P, cyl(ec, x - T.rear.d / 2, 0, x + T.rear.d / 2, 0, lx));
          if (p.details > 0 && !sil) line([[x - T.rear.d * 0.4, T.rear.y + T.rear.len * 0.85], [x + T.rear.d * 0.4, T.rear.y + T.rear.len * 0.85]], px, dark(0.4));
        }
        // fin seen edge-on (from above only) and T-tail on top
        if (!below) {
          const fins = T.twin ? [0.03, -0.03] : [0];
          const fy0 = 0.5 - T.vt.c * (T.twin ? 1.1 : 1.15), fy1 = 0.5 - 0.01;
          for (const fx of fins) {
            const P = path([[fx - 0.006, fy0], [fx + 0.006, fy0], [fx + (T.twin ? Math.sign(fx) * 0.02 : 0) + 0.008, fy1], [fx + (T.twin ? Math.sign(fx) * 0.02 : 0) - 0.008, fy1]]);
            fill(P, rgb(liv === 'tail' || liv === 'camo' ? acc : body, 1 + K * 0.1));
          }
          if (T.tt) for (const m of [false, true]) { const P = path(wingPts(T.ht, m, 0.01)); fill(P, rgb(liv === 'tail' ? acc : wingC, flatF((m ? -1 : 1) * lx * 0.25))); }
        }
        // cockpit / canopy / nose prop / nozzles
        if (!sil) {
          if (T.canopy) {
            if (!below) { const [a, b] = T.canopy, P = ell(0, (a + b) / 2, fwH * 0.62, (b - a) / 2); fill(P, cyl(glass, -fwH * 0.6, 0, fwH * 0.6, 0, lx, 1.3)); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill(ell(-lx * fwH * 0.22, (a + b) / 2 - 0.02, fwH * 0.12, (b - a) * 0.25)); }
          } else if (!below) {
            const y = -0.5 + nose * 0.55;
            fill(path([[-fwH * 0.55, y + 0.012], [fwH * 0.55, y + 0.012], [fwH * 0.4, y - 0.01], [-fwH * 0.4, y - 0.01]]), rgb(glass, 1));
          }
          if (T.nozzle && p.details > 0) for (const nx of T.nozzle === 2 ? [0.025, -0.025] : [0]) fill(ell(nx, 0.495, 0.022, 0.008), dark(0.8));
          if (T.mil && p.details > 0 && T.intake && below) for (const m of [1, -1]) fill(ell(m * T.intake * 0.38, -0.5 + nose + 0.09, 0.018, 0.01), dark(0.6));
        }
        if (T.noseProp) propDisc(0, -0.505, T.noseProp / 2);
        // nav light positions
        const [, b, c] = wingPts(w, false, fwH);
        navPts.push([b[0], (b[1] + c[1]) / 2, 'g'], [-b[0], (b[1] + c[1]) / 2, 'r'], [0, 0.5, 'w'], [0, 0.05, 'b']);
      }
      function propDisc(x, y, r) { // spinning prop seen edge-on (from above / below): a thin blurred bar
        if (sil) { ctx.fillStyle = silCol; ctx.globalAlpha = 0.5; ctx.fill(ell(x, y, r, Math.max(px, 0.006))); ctx.globalAlpha = 1; return; }
        const g = ctx.createLinearGradient(x - r, 0, x + r, 0);
        g.addColorStop(0, 'rgba(30,30,34,0)'); g.addColorStop(0.2, 'rgba(30,30,34,0.35)'); g.addColorStop(0.5, 'rgba(30,30,34,0.5)'); g.addColorStop(0.8, 'rgba(30,30,34,0.35)'); g.addColorStop(1, 'rgba(30,30,34,0)');
        ctx.fillStyle = g; ctx.fill(ell(x, y, r, Math.max(px * 0.8, 0.006)));
        fill(ell(x, y + 0.004, 0.012, 0.012), rgb(body, 0.8));
      }
      function drawFlyingWing() { // stealth bomber class: one swept wing with a sawtooth trailing edge
        const R = [[0, -0.25], [0.08, -0.22], [0.64, 0.12], [0.64, 0.16], [0.44, 0.04], [0.3, 0.18], [0.15, 0.05], [0, 0.17]];
        const P = path(R.concat(R.slice(1, -1).reverse().map(([x, y]) => [-x, y])));
        const g = sil ? silCol : ctx.createLinearGradient(0, -0.25, 0, 0.18);
        if (!sil) { g.addColorStop(0, rgb(body, 1 + K * 0.15)); g.addColorStop(0.5, rgb(body, 1)); g.addColorStop(1, rgb(body, 1 - K * 0.15)); }
        fill(P, g);
        if (!sil) { // center body hump, intakes, cockpit
          const hump = path([[0, -0.25], [0.11, -0.16], [0.13, 0.1], [0, 0.15], [-0.13, 0.1], [-0.11, -0.16]]);
          ctx.fillStyle = cyl(body, -0.13, 0, 0.13, 0, lx); ctx.globalAlpha = 0.9; ctx.fill(hump); ctx.globalAlpha = 1;
          if (!below) {
            fill(path([[-0.035, -0.19], [0.035, -0.19], [0.03, -0.165], [-0.03, -0.165]]), rgb(glass, 1));
            if (p.details > 0) for (const m of [1, -1]) fill(path([[m * 0.1, -0.08], [m * 0.17, -0.04], [m * 0.17, -0.02], [m * 0.1, -0.05]]), dark(0.6));
          }
        }
        navPts.push([0.64, 0.14, 'g'], [-0.64, 0.14, 'r'], [0, 0.17, 'w'], [0, 0, 'b']);
      }
      function drawHeliTop() {
        const a = T.attack;
        const pod = path([[0, -0.5], [fwH * 0.7, -0.47], [fwH, -0.36], [fwH, -0.12], [fwH * 0.6, 0.0], [0.022, 0.06], [0.014, 0.42], [-0.014, 0.42], [-0.022, 0.06], [-fwH * 0.6, 0.0], [-fwH, -0.12], [-fwH, -0.36], [-fwH * 0.7, -0.47]]);
        if (T.stub) for (const m of [1, -1]) {
          const P = path([[m * fwH * 0.8, -0.22], [m * (fwH + T.stub), -0.21], [m * (fwH + T.stub), -0.15], [m * fwH * 0.8, -0.14]]);
          fill(P, rgb(body, 0.95));
          if (a) for (const k of [0.45, 0.85]) fill(capsule(m * (fwH + T.stub * k), -0.27, -0.12, 0.016), cyl(body, m * (fwH + T.stub * k) - 0.016, 0, m * (fwH + T.stub * k) + 0.016, 0, lx, 0.8));
        }
        fill(path([[-0.09, 0.37], [0.09, 0.37], [0.09, 0.4], [-0.09, 0.4]]), rgb(body, 0.95)); // tail plane
        fill(pod, cyl(body, -fwH * 1.1, 0, fwH * 1.1, 0, lx)); camo(pod);
        if (!sil && !below) { const y = a ? -0.36 : -0.38; fill(ell(0, y, fwH * (a ? 0.6 : 0.8), a ? 0.12 : 0.1), cyl(glass, -fwH, 0, fwH, 0, lx, 1.4)); }
        // tail rotor edge-on
        line([[0.02, 0.36], [0.02, 0.46]], 0.006, 'rgba(30,30,34,0.6)');
        rotor(0, -0.25, T.rotor);
        navPts.push([fwH + (T.stub || 0), -0.18, 'g'], [-(fwH + (T.stub || 0)), -0.18, 'r'], [0, 0.42, 'w'], [0, 0.05, 'b']);
      }
      function rotor(x, y, r) { // blades + motion blur disc
        const bl = p.rotorBlur;
        if (bl > 0) {
          const g = ctx.createRadialGradient(x, y, r * 0.05, x, y, r);
          const c = sil ? U.hex(silCol) : [40, 42, 46];
          g.addColorStop(0, `rgba(${c},${0.35 * bl})`); g.addColorStop(0.85, `rgba(${c},${0.22 * bl})`); g.addColorStop(1, `rgba(${c},0)`);
          ctx.fillStyle = g; ctx.fill(ell(x, y, r, r));
        }
        const nb = 4, a0 = 0.35;
        for (let i = 0; i < nb; i++) {
          const a = a0 + (i / nb) * TAU, ca = Math.cos(a), sa = Math.sin(a);
          ctx.globalAlpha = 1 - bl * 0.8;
          const P = path([[x - sa * 0.012, y + ca * 0.012], [x + ca * r - sa * 0.012, y + sa * r + ca * 0.012], [x + ca * r + sa * 0.012, y + sa * r - ca * 0.012], [x + sa * 0.012, y - ca * 0.012]]);
          fill(P, rgb([40, 42, 46], 1));
          ctx.globalAlpha = 1;
        }
        fill(ell(x, y, 0.03, 0.03), rgb(body, 0.7));
      }

      /* ---- navigation lights (in local space, glow in pixels) ---- */
      if (p.navLights && (out === 'color' || out === 'silhouette')) {
        const g = Math.max(1.5, S * 0.012 * p.lightSize) * px;
        const C = { r: [255, 40, 30], g: [40, 255, 90], w: [255, 255, 250], b: [255, 30, 20] };
        for (const [x, y, k] of navPts) {
          const c = C[k], rr = k === 'b' ? g * 0.8 : g;
          const gr = ctx.createRadialGradient(x, y, 0, x, y, rr * 3);
          gr.addColorStop(0, `rgba(${c},1)`); gr.addColorStop(0.18, `rgba(${c},0.75)`); gr.addColorStop(0.45, `rgba(${c},0.18)`); gr.addColorStop(1, `rgba(${c},0)`);
          ctx.fillStyle = gr; ctx.fill(ell(x, y, rr * 3, rr * 3));
          ctx.fillStyle = `rgba(255,255,255,0.9)`; ctx.fill(ell(x, y, rr * 0.3, rr * 0.3));
          if (p.strobe && (k === 'r' || k === 'g')) {
            const sg = ctx.createRadialGradient(x, y, 0, x, y, rr * 7);
            sg.addColorStop(0, 'rgba(255,255,255,0.95)'); sg.addColorStop(0.12, 'rgba(255,255,255,0.5)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = sg; ctx.fill(ell(x, y, rr * 7, rr * 7));
            ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = rr * 0.25;
            ctx.beginPath(); ctx.moveTo(x - rr * 6, y); ctx.lineTo(x + rr * 6, y); ctx.moveTo(x, y - rr * 6); ctx.lineTo(x, y + rr * 6); ctx.stroke();
          }
        }
      }
      ctx.restore();
    },
  });
})();
