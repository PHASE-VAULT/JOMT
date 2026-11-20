/* Mud & dirt: tileable soil ground. Mottled, bumpy soil with grit; clods (domed Worley lumps) and pebbles;
   dried-mud cracks (warped cell edges, the plates curl up at their edges); smooth, wet mud patches; water
   puddles in carved hollows (flat, tinted, reflecting the sky, with a wet shore); tire tracks running
   vertically (ruts with pushed-up berms and a chevron tread, wobbling with whole cycles so they tile;
   water collects in them); twigs and dead-leaf bits. Height in short-side units, lit by js/ground.js.
   Output: lit color, flat albedo or height map (also used by the normal map mode). */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;

  const CP = { dx: 0, dy: 0, k: 0 };
  function cellPt(x, y, px, py, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let bd = 1e9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = xi + i, cy = yi + j, wx = U.mod(cx, px), wy = U.mod(cy, py);
      const dx = x - (cx + 0.2 + 0.6 * U.hash(wx, wy, s)), dy = y - (cy + 0.2 + 0.6 * U.hash(wx, wy, s + 7919)), dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; CP.dx = dx; CP.dy = dy; CP.k = wx * 7919 + wy; }
    }
    return CP;
  }

  const LOOKS = {
    dirt: { soil: '#8a6e50', soil2: '#6e5640', mudColor: '#5e4834', pebbleColor: '#9a9080' },
    garden: { soil: '#4a3a2c', soil2: '#382c22', mudColor: '#3a2c20', pebbleColor: '#8a8070' },
    clay: { soil: '#a8603a', soil2: '#8a4a2c', mudColor: '#6a3420', pebbleColor: '#b09078' },
    forest: { soil: '#4e3e2e', soil2: '#3a2e22', mudColor: '#3a2e22', pebbleColor: '#7a7468' },
    mud: { soil: '#6e5840', soil2: '#5a4632', mudColor: '#4e3c2a', pebbleColor: '#7a7062' },
    dust: { soil: '#b8a488', soil2: '#a08c70', mudColor: '#6e5c46', pebbleColor: '#c0b4a0' },
  };

  U.register({
    id: 'mud',
    name: 'Mud & Dirt',
    desc: 'Tileable dirt, soil and mud with clods, pebbles, dried cracks, wet patches, puddles, tire tracks, twigs and height map',
    uses: ['Ground materials for dirt roads, fields, battlefields, trenches, construction sites and forest paths on terrain and level geometry, with a height map for the normal map mode.', 'Top-down dirt and mud tiles for 2D and isometric games and backgrounds.'],
    tags: ['Texturing', 'Nature', 'Military'],
    tileable: true,
    heightMap: true,
    icon: U.icon('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M8 3v18M15 3v18" opacity=".45"/><path d="M5 9l2 1.5L9.5 8M14 15l2.5 1.5 2-2.5"/><ellipse cx="11.5" cy="13" rx="2" ry="1.2"/>'),
    params: [
      { type: 'section', label: 'Soil' },
      { key: 'look', label: 'Look', type: 'select', default: 'dirt', options: [['dirt', 'Dry dirt'], ['garden', 'Garden soil'], ['clay', 'Clay'], ['forest', 'Forest floor'], ['mud', 'Wet mud'], ['dust', 'Dusty ground'], ['custom', 'Custom']],
        apply: (v, p) => { const s = LOOKS[v]; if (s) Object.assign(p, s); } },
      { key: 'soil', label: 'Soil color', type: 'color', default: LOOKS.dirt.soil },
      { key: 'soil2', label: 'Second color', type: 'color', default: LOOKS.dirt.soil2, tip: 'Mottling blends toward this color' },
      { key: 'mottle', label: 'Mottling', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55 },
      { key: 'mottleScale', label: 'Mottle scale', type: 'int', min: 1, max: 16, default: 4 },
      { key: 'bumps', label: 'Bumpiness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { key: 'bumpScale', label: 'Bump scale', type: 'int', min: 2, max: 24, default: 6, show: (p) => p.bumps > 0 },
      { key: 'grain', label: 'Grit', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },
      { type: 'section', label: 'Clods & pebbles', active: (p) => p.clods > 0 || p.pebbles > 0 },
      { key: 'clods', label: 'Clods', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Lumps of soil' },
      { key: 'clodScale', label: 'Clods across', type: 'int', min: 6, max: 60, default: 30, show: (p) => p.clods > 0 },
      { key: 'pebbles', label: 'Pebbles', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2 },
      { key: 'pebbleScale', label: 'Pebbles across', type: 'int', min: 8, max: 80, default: 34, show: (p) => p.pebbles > 0 },
      { key: 'pebbleColor', label: 'Pebble color', type: 'color', default: LOOKS.dirt.pebbleColor, show: (p) => p.pebbles > 0 },
      { type: 'section', label: 'Dried cracks', active: (p) => p.cracks > 0 },
      { key: 'cracks', label: 'Cracks', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Dried mud cracking into plates (not in wet mud)' },
      { key: 'crackScale', label: 'Plates across', type: 'int', min: 2, max: 24, default: 7, show: (p) => p.cracks > 0 },
      { key: 'crackWidth', label: 'Crack width', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.cracks > 0 },
      { key: 'curl', label: 'Curled edges', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.cracks > 0, tip: 'The plates bend up at their edges' },
      { type: 'section', label: 'Wet mud', active: (p) => p.mud > 0 || p.puddles > 0 },
      { key: 'mud', label: 'Wet mud', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Smooth, dark, glossy patches of wet mud' },
      { key: 'mudScale', label: 'Mud patch scale', type: 'int', min: 1, max: 10, default: 3, show: (p) => p.mud > 0 },
      { key: 'mudColor', label: 'Mud color', type: 'color', default: LOOKS.dirt.mudColor, show: (p) => p.mud > 0 || p.puddles > 0 },
      { key: 'puddles', label: 'Puddles', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: 'waterColor', label: 'Water color', type: 'color', default: '#4a4436', show: (p) => p.puddles > 0 },
      { key: 'reflection', label: 'Sky reflection', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.puddles > 0 },
      { type: 'section', label: 'Tire tracks', active: (p) => p.tracks > 0 },
      { key: 'tracks', label: 'Track depth', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Two ruts running from top to bottom (rotate the texture in the engine for other directions)' },
      { key: 'trackWidth', label: 'Track width', type: 'range', min: 0.03, max: 0.3, step: 0.005, default: 0.11, show: (p) => p.tracks > 0 },
      { key: 'trackGap', label: 'Track spacing', type: 'range', min: 0.1, max: 0.9, step: 0.01, default: 0.45, show: (p) => p.tracks > 0 },
      { key: 'tread', label: 'Tread pattern', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.tracks > 0 },
      { key: 'treadScale', label: 'Tread lugs', type: 'int', min: 4, max: 60, default: 22, show: (p) => p.tracks > 0 && p.tread > 0, tip: 'Tread lugs along the short side' },
      { type: 'section', label: 'Debris', active: (p) => p.twigs > 0 || p.leafBits > 0 },
      { key: 'twigs', label: 'Twigs', type: 'range', min: 0, max: 1, step: 0.01, default: 0.08 },
      { key: 'leafBits', label: 'Dead leaves', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'debrisColor', label: 'Debris color', type: 'color', default: '#6a5034', show: (p) => p.twigs > 0 || p.leafBits > 0 },
      ...U.groundLightParams({ shadow: 0.45, ao: 0.55, aoTip: 'Darkens dips, cracks and ruts' }),
    ],
    presets: [
      { name: 'Dry dirt', group: 'Realistic', values: {} },
      { name: 'Dirt road with tire tracks', group: 'Realistic', values: { tracks: 0.7, mud: 0.15, puddles: 0.15, clods: 0.25, pebbles: 0.35, twigs: 0 } },
      { name: 'Muddy tracks', group: 'Realistic', values: { look: 'mud', ...LOOKS.mud, tracks: 0.9, trackWidth: 0.13, mud: 0.75, puddles: 0.45, wet: 0.25, clods: 0.3, pebbles: 0.1, twigs: 0.05 } },
      { name: 'Wet mud', group: 'Realistic', values: { look: 'mud', ...LOOKS.mud, mud: 1, puddles: 0.3, bumps: 0.6, clods: 0.15, pebbles: 0.05, twigs: 0, wet: 0.3 } },
      { name: 'Puddles after rain', group: 'Realistic', values: { mud: 0.45, puddles: 0.55, reflection: 0.7, clods: 0.2, pebbles: 0.25, twigs: 0.05 } },
      { name: 'Dried cracked mud', group: 'Realistic', values: { look: 'custom', soil: '#9a8060', soil2: '#86694c', mudColor: '#4a3828', cracks: 0.85, crackScale: 7, crackWidth: 0.45, curl: 0.55, mud: 0, puddles: 0, clods: 0, pebbles: 0.05, twigs: 0, bumps: 0.2 } },
      { name: 'Cracked desert clay', group: 'Realistic', values: { look: 'clay', ...LOOKS.clay, soil: '#c08a5a', soil2: '#a8744a', cracks: 1, crackScale: 5, crackWidth: 0.6, curl: 0.7, mud: 0, puddles: 0, clods: 0, pebbles: 0, twigs: 0, bumps: 0.15, lightHeight: 30 } },
      { name: 'Plowed field', group: 'Realistic', values: { look: 'garden', ...LOOKS.garden, clods: 0.9, clodScale: 16, bumps: 0.7, bumpScale: 10, pebbles: 0.1, mud: 0.1, twigs: 0.05 } },
      { name: 'Garden soil', group: 'Realistic', values: { look: 'garden', ...LOOKS.garden, clods: 0.55, clodScale: 30, pebbles: 0.1, twigs: 0.15, leafBits: 0.1, mud: 0.1, puddles: 0 } },
      { name: 'Forest floor', group: 'Realistic', values: { look: 'forest', ...LOOKS.forest, clods: 0.2, pebbles: 0.1, twigs: 0.5, leafBits: 0.55, debrisColor: '#6a4a2a', mud: 0.15, puddles: 0 } },
      { name: 'Red clay', group: 'Realistic', values: { look: 'clay', ...LOOKS.clay, clods: 0.45, pebbles: 0.15, mud: 0.3, puddles: 0.1, waterColor: '#7a4a32' } },
      { name: 'Trench mud (WW1)', group: 'Realistic', values: { look: 'mud', ...LOOKS.mud, soil: '#4a4030', soil2: '#3a3226', mudColor: '#3e3428', waterColor: '#3a3628', mud: 0.85, puddles: 0.55, tracks: 0.4, trackWidth: 0.08, tread: 0.2, clods: 0.5, bumps: 0.8, twigs: 0.15, wet: 0.3 } },
      { name: 'Construction site', group: 'Realistic', values: { look: 'dust', ...LOOKS.dust, tracks: 0.85, trackWidth: 0.16, trackGap: 0.5, tread: 0.9, treadScale: 14, pebbles: 0.5, pebbleScale: 26, clods: 0.3, mud: 0, puddles: 0.1, waterColor: '#8a7a60', twigs: 0 } },
      { name: 'Dusty ground', group: 'Realistic', values: { look: 'dust', ...LOOKS.dust, bumps: 0.25, clods: 0.15, pebbles: 0.35, mud: 0, puddles: 0, twigs: 0.03, relief: 0.6 } },
      { name: 'Toon dirt', group: 'Stylized', values: { style: 'toon', look: 'custom', soil: '#a8805a', soil2: '#946c48', mudColor: '#6a4a30', grain: 0.1, mottle: 0.3, clods: 0.4, pebbles: 0.25, pebbleColor: '#c8bca8', twigs: 0, mud: 0, puddles: 0.15, waterColor: '#6a8aa8', ao: 0.25 } },
      { name: 'Hand-painted path', group: 'Stylized', values: { look: 'custom', soil: '#9a7450', soil2: '#7a5a3c', mottle: 0.85, mottleScale: 3, grain: 0.15, clods: 0.3, pebbles: 0.3, mud: 0.1, puddles: 0, twigs: 0.05, relief: 0.9, ao: 0.65 } },
      { name: 'Toxic swamp mud', group: 'Sci-fi', values: { look: 'custom', soil: '#4a4a2a', soil2: '#3a3a20', mudColor: '#2a3018', waterColor: '#6a8a1a', mud: 0.9, puddles: 0.5, reflection: 0.2, clods: 0.2, twigs: 0.1, wet: 0.3 } },
      { name: 'Alien soil', group: 'Sci-fi', values: { look: 'custom', soil: '#5a3a5a', soil2: '#442a46', mudColor: '#2a1a34', pebbleColor: '#7ae0d0', waterColor: '#3a8aa0', cracks: 0.5, crackScale: 9, clods: 0.3, pebbles: 0.3, mud: 0.2, puddles: 0.2, twigs: 0 } },
    ],
    render(ctx, W, H, p, opts) {
      const S = Math.min(W, H), N = W * H, seed = p.seed | 0;
      const per = (f) => [Math.max(1, Math.round((f * W) / S)), Math.max(1, Math.round((f * H) / S))];
      const [mpx, mpy] = per(p.mottleScale), [bpx, bpy] = per(p.bumpScale), [gpx, gpy] = per(150), [cpx, cpy] = per(p.clodScale), [ppx, ppy] = per(p.pebbleScale);
      const [kpx, kpy] = per(p.crackScale), [wpx, wpy] = per(p.mudScale), [qpx, qpy] = per(3), [tpx, tpy] = per(9), [lpx, lpy] = per(16);
      const soil = U.hex(p.soil), soil2 = U.hex(p.soil2), mudC = U.hex(p.mudColor), pebC = U.hex(p.pebbleColor), waterC = U.hex(p.waterColor), debC = U.hex(p.debrisColor);
      // tire tracks: ruts along v; widths and spacing in short-side units, converted to u
      const sw = S / W, hw = p.trackWidth * 0.5 * sw, gapU = p.trackGap * sw, treadN = Math.max(1, Math.round(p.treadScale * (H / S)));
      const ruts = p.tracks > 0 ? [0.5 - gapU / 2, 0.5 + gapU / 2] : [];
      const rutA = p.tracks * 0.012, bumpA = p.bumps * 0.014;
      const Hf = new Float32Array(N), wetMap = new Float32Array(N), flags = new Uint8Array(N);
      const img = ctx.createImageData(W, H), d = img.data;
      for (let y = 0, i = 0; y < H; y++) {
        const v = (y + 0.5) / H;
        for (let x = 0; x < W; x++, i++) {
          const u = (x + 0.5) / W, o = i * 4;
          const m = U.fractal('perlin', u * mpx, v * mpy, mpx, mpy, 4, 0.5, 'fbm', seed + 1), mt = clamp(0.5 + (m - 0.5) * 2 * p.mottle);
          let r = lerp(soil[0], soil2[0], mt), g = lerp(soil[1], soil2[1], mt), b = lerp(soil[2], soil2[2], mt);
          const base = p.bumps > 0 ? (U.fractal('perlin', u * bpx, v * bpy, bpx, bpy, 4, 0.5, 'fbm', seed + 2) - 0.5) * bumpA : 0;
          let h = base, wet = 0, fl = 0;
          // wet mud mask (smooths everything that sits in it)
          const mm = p.mud > 0 ? smoothstep(0.72 - p.mud * 0.45, 0.8 - p.mud * 0.45, U.fractal('perlin', u * wpx, v * wpy, wpx, wpy, 4, 0.5, 'fbm', seed + 11)) : 0;
          const rough = 1 - mm * 0.85; // detail kept in the mud
          // grit
          if (p.grain > 0) {
            const gc = U.worley(u * gpx, v * gpy, gpx, gpy, seed + 3);
            const f = 1 + ((gc.id - 0.5) * 0.45 - smoothstep(0.25, 0.75, gc.f1) * 0.15) * p.grain * rough;
            r *= f; g *= f; b *= f; h += (0.5 - gc.f1) * p.grain * 0.0015 * rough;
          }
          // clods: domed lumps with a slightly lighter, drier top
          if (p.clods > 0) {
            // irregular, crumbly lumps: a noisy radius and a soft foot so they merge into the soil
            const c = U.worley(u * cpx, v * cpy, cpx, cpy, seed + 5);
            if (c.id < p.clods * 0.85) {
              const nz = U.fractal('perlin', u * cpx * 3, v * cpy * 3, cpx * 3, cpy * 3, 2, 0.5, 'fbm', seed + 6);
              const rc = (0.3 + 0.3 * U.hash((c.id * 1e6) | 0, 1, seed)) * (0.7 + 0.6 * nz), t = 1 - c.f1 / rc;
              if (t > 0) {
                const prof = smoothstep(0, 0.6, t) * (0.75 + 0.25 * nz);
                h += prof * (rc / cpx) * 0.35 * rough;
                const f = 1 + prof * 0.08 * rough; r *= f; g *= f; b *= f;
              }
            }
          }
          // dried cracks: plates with curled-up edges, only where the ground is dry
          if (p.cracks > 0 && mm < 0.9) {
            const wx = (U.fractal('perlin', u * kpx * 2, v * kpy * 2, kpx * 2, kpy * 2, 2, 0.5, 'fbm', seed + 13) - 0.5) * 0.35;
            const wy = (U.fractal('perlin', u * kpx * 2, v * kpy * 2, kpx * 2, kpy * 2, 2, 0.5, 'fbm', seed + 14) - 0.5) * 0.35;
            const c = U.worley(u * kpx + wx, v * kpy + wy, kpx, kpy, seed + 15), e = c.f2 - c.f1;
            const w = 0.015 + 0.07 * p.crackWidth, k = p.cracks * (1 - mm);
            const crack = (1 - smoothstep(w * 0.55, w, e)) * k;
            const lip = (1 - smoothstep(w, w + 0.18, e)) * k;
            h += lip * p.curl * (0.25 / kpx) * 0.12 - crack * (0.25 / kpx) * 0.18;
            const f = (1 + (1 - crack) * 0.08 * k) * (1 - crack * 0.55); r *= f; g *= f; b *= f;
          }
          // pebbles
          if (p.pebbles > 0) {
            const c = cellPt(u * ppx, v * ppy, ppx, ppy, seed + 21), k = c.k;
            if (U.hash(k, 0, seed + 21) < p.pebbles * 0.45) {
              const a = U.hash(k, 1, seed) * Math.PI, el = 1 + U.hash(k, 2, seed) * 0.6, rad = 0.12 + 0.14 * U.hash(k, 3, seed);
              const ea = (c.dx * Math.cos(a) + c.dy * Math.sin(a)) / el, eb = -c.dx * Math.sin(a) + c.dy * Math.cos(a);
              const t = 1 - Math.hypot(ea, eb) / rad;
              if (t > 0) {
                const tone = 0.75 + 0.5 * U.hash(k, 4, seed), s = smoothstep(0, 0.12, t) * (1 - mm * 0.6);
                r = lerp(r, pebC[0] * tone, s); g = lerp(g, pebC[1] * tone, s); b = lerp(b, pebC[2] * tone, s);
                h += Math.sqrt(t) * (rad / ppx) * 0.55 * (1 - mm * 0.5); fl = 1;
              }
            }
          }
          // tire tracks: rut (with tread lugs), pushed-up berm beside it
          let inRut = 0;
          for (const c0 of ruts) {
            const c = c0 + Math.sin((v + U.hash(c0 * 100 | 0, 1, seed)) * Math.PI * 2) * 0.012 * sw; // one whole wobble per tile
            let du = u - c; du -= Math.round(du);
            const ax = Math.abs(du) / hw;
            if (ax < 1) {
              const prof = 1 - ax * ax * ax * ax;
              let dep = -rutA * prof;
              if (p.tread > 0) {
                const ph = v * treadN + ax * 0.45, t = ph - Math.floor(ph);
                dep += smoothstep(0.35, 0.45, t) * (1 - smoothstep(0.75, 0.85, t)) * rutA * 0.3 * p.tread * prof;
              }
              h = lerp(h, base * 0.4 + dep, prof * 0.9 + 0.1);
              inRut = Math.max(inRut, prof);
              const f = 1 - prof * 0.12; r *= f; g *= f; b *= f; // compacted soil is darker
            } else if (ax < 1.7) {
              h += Math.sin(((ax - 1) / 0.7) * Math.PI) * rutA * 0.3;
            }
          }
          // smooth wet mud
          if (mm > 0) {
            // smoothed out, with soft squelchy ripples that catch the wet highlight
            const sq = (U.fractal('perlin', u * cpx * 0.5, v * cpy * 0.5, Math.max(1, cpx >> 1), Math.max(1, cpy >> 1), 3, 0.5, 'fbm', seed + 12) - 0.5) * 0.004;
            h = lerp(h, base + (h - base) * 0.25 + sq, mm);
            r = lerp(r, mudC[0], mm * 0.8); g = lerp(g, mudC[1], mm * 0.8); b = lerp(b, mudC[2], mm * 0.8);
            wet = Math.max(wet, mm * 0.6);
          }
          if (inRut > 0 && p.mud > 0) wet = Math.max(wet, inRut * p.mud * 0.8);
          // debris: twigs and dead-leaf bits lying on top
          if (p.twigs > 0 && mm < 0.8) {
            const c = cellPt(u * tpx, v * tpy, tpx, tpy, seed + 31), k = c.k;
            if (U.hash(k, 0, seed + 31) < p.twigs * 0.45) {
              const a = U.hash(k, 1, seed + 31) * Math.PI, len = 0.25 + 0.3 * U.hash(k, 2, seed + 31), w = 0.02 + 0.025 * U.hash(k, 3, seed + 31);
              const al = c.dx * Math.cos(a) + c.dy * Math.sin(a), ac = -c.dx * Math.sin(a) + c.dy * Math.cos(a) - Math.sin(al * 6) * 0.015;
              const dd = Math.hypot(Math.max(0, Math.abs(al) - len), ac);
              if (dd < w) {
                const t = 1 - dd / w, tone = 0.7 + 0.5 * U.hash(k, 4, seed + 31);
                r = debC[0] * tone; g = debC[1] * tone; b = debC[2] * tone;
                h = Math.max(h, base) + Math.sqrt(t) * (w / tpx) * 1.2;
              }
            }
          }
          if (p.leafBits > 0 && mm < 0.8) {
            const c = cellPt(u * lpx, v * lpy, lpx, lpy, seed + 41), k = c.k;
            if (U.hash(k, 0, seed + 41) < p.leafBits * 0.6) {
              const a = U.hash(k, 1, seed + 41) * Math.PI * 2, len = 0.2 + 0.15 * U.hash(k, 2, seed + 41);
              const la = c.dx * Math.cos(a) + c.dy * Math.sin(a), lb = -c.dx * Math.sin(a) + c.dy * Math.cos(a);
              const t = 1 - Math.hypot(la / len, lb / (len * (0.45 - 0.25 * Math.abs(la) / len)));
              if (t > 0) {
                const tone = 0.65 + 0.7 * U.hash(k, 3, seed + 41), vein = Math.abs(lb) < len * 0.04 ? 0.8 : 1;
                const s = smoothstep(0, 0.1, t);
                r = lerp(r, debC[0] * tone * vein * 1.15, s); g = lerp(g, debC[1] * tone * vein, s); b = lerp(b, debC[2] * tone * vein * 0.8, s);
                h += s * (len / lpx) * 0.06;
              }
            }
          }
          // puddles: carved hollows (and ruts) filled with flat water
          if (p.puddles > 0) {
            const n = U.fractal('perlin', u * qpx, v * qpy, qpx, qpy, 4, 0.5, 'fbm', seed + 51), th = 0.71 - p.puddles * 0.22;
            const basin = smoothstep(th - 0.1, th + 0.06, n);
            h -= basin * 0.003;
            let water = smoothstep(th, th + 0.06, n);
            // water also collects in the deepest part of the ruts, in stretches that fade in and out
            if (inRut > 0) water = Math.max(water, smoothstep(0.55, 0.9, inRut) * smoothstep(th - 0.1, th - 0.01, n));
            if (water > 0) {
              const lvl = -0.003 - rutA * 0.7 * (inRut > 0 ? 1 : 0);
              h = lerp(h, Math.max(h, lvl), water);
              h = lerp(h, lvl, smoothstep(0.3, 0.7, water));
              // streaky sky reflection over dark, tinted water; shallow edges let the ground show through
              const sk = U.fractal('perlin', u * qpx * 2, v * qpy * 4, qpx * 2, qpy * 4, 3, 0.5, 'fbm', seed + 53);
              const sky = smoothstep(0.35, 0.75, sk) * p.reflection;
              const br = r * 0.55, bg = g * 0.55, bb = b * 0.55; // the bottom seen through the water
              const deep = smoothstep(0.15, 0.85, water);
              const wr = lerp(lerp(br, waterC[0], deep * 0.75), 200, sky * 0.55), wg = lerp(lerp(bg, waterC[1], deep * 0.75), 208, sky * 0.55), wb = lerp(lerp(bb, waterC[2], deep * 0.75), 222, sky * 0.55);
              const s = smoothstep(0.05, 0.5, water);
              r = lerp(r, wr * 1.2, s); g = lerp(g, wg * 1.2, s); b = lerp(b, wb * 1.2, s);
              if (water > 0.5) fl = 1;
            }
            wet = Math.max(wet, smoothstep(th - 0.08, th, n) * 0.7, water);
          }
          Hf[i] = h; wetMap[i] = wet; flags[i] = fl;
          d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
        }
      }
      U.groundFinish(ctx, img, Hf, W, H, p, { flags, wetMap, aoScale: 16, heightRef: Math.max(0.004, bumpA * 0.5 + rutA * 0.3 + p.clods * 0.006), shadowLen: 0.04, height: !!(opts && opts.height) });
    },
  });
})();
