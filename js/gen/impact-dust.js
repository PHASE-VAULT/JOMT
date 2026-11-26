/* Impact dust: the residue an explosion leaves on the ground (grenades, mortar and shell hits, blasts, magic
   impacts). Built in polar layers around the blast point, all auto-fitted inside the texture:
     scorch   – a mottled soot center with an irregular outline and an optional heat-tinted edge,
     rays     – radial blast streaks of soot and dust shot outward (angular noise sets their length and
                strength, fine radial streak noise gives them texture),
     dust     – a cloudy powder deposit (pulverized concrete, soil, sand, snow...) that fades out with a
                broken edge,
     debris   – grains, pebbles and ash flakes thrown outward, stretched along the blast direction and
                thinning out with the distance,
     pits     – small shrapnel pockmarks,
     crater   – an optional shallow blast crater with a raised rim (height + baked light),
     focus    – blur / out of focus: everything, only the soft dust and soot (grains stay crisp) or only the
                debris, uniform or growing toward the rim (sharp center, defocused edge).
   Output: transparent decal, on a surface color, or a height map (normal map mode uses it). */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, smoothstep, hash } = U;
  const TAU = Math.PI * 2, RAD = Math.PI / 180, LN = 1024;

  // ground looks: soot, dust, debris, surface, heat edge
  const GROUND = {
    concrete: { soot: '#1b1916', dust: '#bdb7ab', debris: '#8d877c', surface: '#7f7b74', heat: '#5a3a22' },
    asphalt: { soot: '#0f0e0d', dust: '#8e8a84', debris: '#4a4744', surface: '#3a3937', heat: '#4a3020' },
    dirt: { soot: '#1a140e', dust: '#7a5c3e', debris: '#4e3a26', surface: '#5e4a36', heat: '#3a2414' },
    sand: { soot: '#2a231a', dust: '#d8c294', debris: '#a88e60', surface: '#c8b183', heat: '#6a4a2a' },
    snow: { soot: '#1e1c1b', dust: '#5a4a3c', debris: '#3c3028', surface: '#e8eef6', heat: '#4a3a30' },
    plaster: { soot: '#2a2622', dust: '#f1ede4', debris: '#d6d0c4', surface: '#cfc9bd', heat: '#6a4a30' },
  };

  /* clamped (not wrapping) box blur, three passes ≈ gaussian; r in px */
  function blurCh(a, W, H, r) {
    const out = Float32Array.from(a);
    r = Math.round(r);
    if (r < 1) return out;
    const t = new Float32Array(a.length), inv = 1 / (2 * r + 1), cl = (i, n) => (i < 0 ? 0 : i >= n ? n - 1 : i);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < H; y++) {
        const o = y * W; let sum = 0;
        for (let k = -r; k <= r; k++) sum += out[o + cl(k, W)];
        for (let x = 0; x < W; x++) { t[o + x] = sum * inv; sum += out[o + cl(x + r + 1, W)] - out[o + cl(x - r, W)]; }
      }
      for (let x = 0; x < W; x++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += t[cl(k, H) * W + x];
        for (let y = 0; y < H; y++) { out[y * W + x] = sum * inv; sum += t[cl(y + r + 1, H) * W + x] - t[cl(y - r, H) * W + x]; }
      }
    }
    return out;
  }

  U.register({
    id: 'impact-dust',
    name: 'Impact Dust',
    desc: 'Explosion residue decals: soot scorch, radial blast rays, powder dust, thrown debris, shrapnel pits and crater on concrete, asphalt, dirt, sand, snow or plaster',
    uses: [
      'Ground decals that a game spawns where grenades, mortars, rockets or spells hit: scorch, dust and debris left behind after the explosion.',
      'Battlefield and ruin dressing, blast marks on walls and floors, colored smoke grenade powder and stylized magic impact marks.',
    ],
    tags: ['Decals', 'Shooter', 'VFX'],
    bg: 'checker',
    normalMap: true,
    heightMap: true,
    normalDesc: 'Normal map from the residue\'s height: crater, raised rim, debris grains and pits; thin soot and dust stay flat',
    normalDefaults: { strength: 5, smooth: 0.5 },
    icon: U.icon('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5.3 5.3l2.8 2.8M15.9 15.9l2.8 2.8M18.7 5.3l-2.8 2.8M8.1 15.9l-2.8 2.8" opacity=".6"/><circle cx="18" cy="9" r=".6"/><circle cx="6.5" cy="15" r=".6"/><circle cx="15" cy="19" r=".5"/>'),
    params: [
      { type: 'section', label: 'Blast' },
      {
        key: 'ground', label: 'Ground', type: 'select', default: 'concrete',
        options: [['concrete', 'Concrete'], ['asphalt', 'Asphalt'], ['dirt', 'Dirt / soil'], ['sand', 'Sand'], ['snow', 'Snow'], ['plaster', 'Plaster / drywall']],
        apply: (v, p) => { const G = GROUND[v]; if (G) Object.assign(p, { sootColor: G.soot, dustColor: G.dust, debrisColor: G.debris, surface: G.surface, heatColor: G.heat }); },
        tip: 'Picks fitting soot, dust, debris and surface colors; tweak them afterwards',
      },
      { key: 'scale', label: 'Scale', type: 'range', min: 0.2, max: 1, step: 0.01, default: 1, tip: 'Size of the whole mark; 1 = fills the texture (minus the edge margin)' },
      { key: 'irregular', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'How lumpy and uneven the outlines are' },
      { key: 'directional', label: 'Directionality', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: '0 = round burst; higher pushes everything to one side (angled hit)' },
      { key: 'direction', label: 'Direction', type: 'range', min: -180, max: 180, step: 1, default: 90, show: (p) => p.directional > 0 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 7 },

      { type: 'section', label: 'Scorch' },
      { key: 'scorch', label: 'Scorch', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, tip: 'Darkness of the soot in the center' },
      { key: 'scorchSize', label: 'Scorch size', type: 'range', min: 0.05, max: 0.8, step: 0.01, default: 0.32, show: (p) => p.scorch > 0, tip: '× radius' },
      { key: 'scorchNoise', label: 'Soot breakup', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, show: (p) => p.scorch > 0 },
      { key: 'hole', label: 'Blown-clean center', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => p.scorch > 0, tip: 'The blast point itself is often swept lighter than the soot ring around it' },
      { key: 'heat', label: 'Heat tint', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => p.scorch > 0, tip: 'Brownish burnt band at the scorch edge' },

      { type: 'section', label: 'Blast rays' },
      { key: 'rays', label: 'Rays', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7 },
      { key: 'rayCount', label: 'Ray count', type: 'int', min: 3, max: 80, default: 22, show: (p) => p.rays > 0 },
      { key: 'rayLen', label: 'Ray length', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.92, show: (p) => p.rays > 0, tip: '× radius' },
      { key: 'raySharp', label: 'Ray sharpness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, show: (p) => p.rays > 0 },
      { key: 'streaks', label: 'Streak texture', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.rays > 0, tip: 'Fine radial streaks inside the rays and the dust' },

      { type: 'section', label: 'Dust' },
      { key: 'dust', label: 'Dust', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, tip: 'Pulverized material deposited around the blast' },
      { key: 'dustReach', label: 'Dust reach', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.85, show: (p) => p.dust > 0, tip: '× radius' },
      { key: 'dustNoise', label: 'Dust breakup', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.dust > 0 },
      { key: 'dustScale', label: 'Breakup scale', type: 'range', min: 1, max: 20, step: 0.1, default: 6, show: (p) => p.dust > 0 && p.dustNoise > 0 },

      { type: 'section', label: 'Debris' },
      { key: 'debris', label: 'Debris grains', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
      { key: 'debrisSize', label: 'Grain size', type: 'range', min: 0.2, max: 3, step: 0.01, default: 1, show: (p) => p.debris > 0 },
      { key: 'debrisReach', label: 'Grain reach', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.9, show: (p) => p.debris > 0, tip: '× radius' },
      { key: 'pits', label: 'Shrapnel pits', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'crater', label: 'Crater', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Shallow blast crater with a raised rim (height and shading)' },
      { key: 'craterSize', label: 'Crater size', type: 'range', min: 0.05, max: 0.6, step: 0.01, default: 0.2, show: (p) => p.crater > 0, tip: '× radius' },

      { type: 'section', label: 'Color' },
      { key: 'sootColor', label: 'Soot', type: 'color', default: GROUND.concrete.soot },
      { key: 'dustColor', label: 'Dust', type: 'color', default: GROUND.concrete.dust },
      { key: 'debrisColor', label: 'Debris', type: 'color', default: GROUND.concrete.debris },
      { key: 'heatColor', label: 'Heat tint', type: 'color', default: GROUND.concrete.heat, show: (p) => p.heat > 0 },
      { key: 'surface', label: 'Surface', type: 'color', default: GROUND.concrete.surface, tip: 'Base for "On surface color" and the crater walls' },

      { type: 'section', label: 'Focus', active: (p) => p.blur > 0 },
      { key: 'blur', label: 'Blur', type: 'range', min: 0, max: 40, step: 0.25, default: 0, tip: 'Out of focus: blur radius in px @ 512' },
      { key: 'blurTarget', label: 'Blur applies to', type: 'select', default: 'all', options: [['all', 'Everything'], ['soft', 'Dust, soot & rays (grains stay sharp)'], ['sharp', 'Debris & pits only']], show: (p) => p.blur > 0 },
      { key: 'focusFalloff', label: 'Edge defocus', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.blur > 0, tip: '0 = the same blur everywhere; 1 = sharp center, blur growing toward the rim' },
      { key: 'focusSize', label: 'Sharp center size', type: 'range', min: 0, max: 0.9, step: 0.01, default: 0.25, show: (p) => p.blur > 0 && p.focusFalloff > 0, tip: '× radius that stays in focus' },
      { type: 'section', label: 'Shading' },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'angled', options: [['angled', 'Angled (light angle)'], ['ambient', 'Ambient (soft, no direction)']] },
      { key: 'light', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -135, show: (p) => p.lightMode !== 'ambient' },
      { key: 'lightAmt', label: 'Shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7 },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'alpha', options: [['alpha', 'Transparent (decal)'], ['surface', 'On surface color'], ['height', 'Height map']] },
      { key: 'surfaceVar', label: 'Surface variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: (p) => p.output === 'surface' },
      { key: 'opacity', label: 'Opacity', type: 'range', min: 0.1, max: 1, step: 0.01, default: 1, show: (p) => p.output === 'alpha' },
      { key: 'margin', label: 'Edge margin', type: 'range', min: 0, max: 0.2, step: 0.005, default: 0.02, tip: 'Free border, fraction of the short side' },
    ],
    presets: [
      { name: 'Grenade on concrete', group: 'Explosions', values: {} },
      { name: 'Grenade on asphalt', group: 'Explosions', values: { ground: 'asphalt', dust: 0.5, rays: 0.8, seed: 12 } },
      { name: 'Grenade in dirt', group: 'Explosions', values: { ground: 'dirt', scorch: 0.7, dust: 0.85, dustReach: 0.95, debris: 0.8, debrisSize: 1.4, crater: 0.55, craterSize: 0.28, hole: 0.1, seed: 4 } },
      { name: 'Blast in sand', group: 'Explosions', values: { ground: 'sand', scorch: 0.55, scorchSize: 0.25, dust: 0.8, rays: 0.85, rayCount: 30, rayLen: 0.9, debris: 0.6, crater: 0.6, craterSize: 0.3, seed: 18 } },
      { name: 'Explosion in snow', group: 'Explosions', values: { ground: 'snow', scorch: 0.8, scorchSize: 0.35, dust: 0.9, dustReach: 0.9, dustNoise: 0.7, rays: 0.9, rayCount: 26, debris: 0.75, crater: 0.45, seed: 9 } },
      { name: 'Mortar crater', group: 'Explosions', values: { ground: 'dirt', scale: 1, scorch: 0.75, scorchSize: 0.4, dust: 0.9, debris: 0.9, debrisSize: 1.8, crater: 1, craterSize: 0.42, rays: 0.6, rayLen: 0.95, hole: 0, irregular: 0.7, seed: 31 } },
      { name: 'Wall blast (plaster)', group: 'Explosions', values: { ground: 'plaster', scorch: 0.9, scorchSize: 0.3, dust: 0.6, rays: 0.8, rayCount: 34, debris: 0.4, pits: 0.6, crater: 0.15, seed: 22 } },
      { name: 'Angled rocket hit', group: 'Explosions', values: { directional: 0.75, direction: 90, rays: 0.85, rayLen: 0.95, dust: 0.75, debris: 0.65, pits: 0.4, seed: 15 } },
      { name: 'Old blast mark (faded)', group: 'Explosions', values: { scorch: 0.45, heat: 0, dust: 0.35, rays: 0.5, debris: 0.15, pits: 0.2, crater: 0.1, opacity: 0.7, seed: 40 } },
      { name: 'Dust burst (no scorch)', group: 'Dust', values: { scorch: 0, dust: 1, dustReach: 0.95, dustNoise: 0.5, rays: 0.7, rayLen: 0.9, debris: 0.4, pits: 0, crater: 0, seed: 5 } },
      { name: 'Concrete dust cloud deposit', group: 'Dust', values: { ground: 'plaster', scorch: 0, dust: 0.95, dustNoise: 0.75, dustScale: 9, rays: 0.4, debris: 0.55, debrisSize: 0.7, pits: 0, crater: 0, seed: 27 } },
      { name: 'Flashbang mark', group: 'Dust', values: { scorch: 0.5, scorchSize: 0.16, hole: 0.5, heat: 0, dust: 0.3, dustReach: 0.5, rays: 0.6, rayLen: 0.45, rayCount: 18, debris: 0.1, pits: 0, crater: 0, seed: 3 } },
      { name: 'Smoke grenade residue (red)', group: 'Dust', values: { scorch: 0.25, scorchSize: 0.12, heat: 0, dust: 0.85, dustColor: '#c8322a', dustReach: 0.8, dustNoise: 0.65, rays: 0.5, debris: 0, pits: 0, crater: 0, seed: 11 } },
      { name: 'Smoke grenade residue (green)', group: 'Dust', values: { scorch: 0.25, scorchSize: 0.12, heat: 0, dust: 0.85, dustColor: '#3a9a3a', dustReach: 0.8, dustNoise: 0.65, rays: 0.5, debris: 0, pits: 0, crater: 0, seed: 13 } },
      { name: 'Ash pile', group: 'Dust', values: { scorch: 0.6, scorchSize: 0.5, scorchNoise: 0.8, hole: 0, heat: 0.15, dust: 0.8, dustColor: '#8a8580', rays: 0.15, debris: 0.7, debrisColor: '#2a2725', debrisReach: 0.6, pits: 0, crater: 0, seed: 19 } },
      { name: 'Out of focus blast', group: 'Focus', values: { blur: 6, blurTarget: 'all', seed: 7 } },
      { name: 'Soft dust, sharp grains', group: 'Focus', values: { blur: 6, blurTarget: 'soft', debris: 0.7, seed: 12 } },
      { name: 'Defocused edges', group: 'Focus', values: { blur: 16, focusFalloff: 1, focusSize: 0.2, rays: 0.85, seed: 18 } },
      { name: 'Plasma impact', group: 'Sci-fi', values: { sootColor: '#0b1020', heatColor: '#2a7aff', heat: 0.8, scorch: 0.9, scorchSize: 0.28, dust: 0.5, dustColor: '#9ab8d8', rays: 0.9, rayCount: 40, raySharp: 0.8, debris: 0.3, pits: 0.5, crater: 0.3, seed: 8 } },
      { name: 'Magic scorch (purple)', group: 'Sci-fi', values: { sootColor: '#1a0a24', heatColor: '#b040ff', heat: 0.9, scorch: 0.85, dust: 0.45, dustColor: '#c9a8e8', rays: 0.75, rayCount: 12, raySharp: 0.85, debris: 0.2, pits: 0, crater: 0, seed: 16 } },
    ],

    render(ctx, W, H, p, opts) {
      opts = opts || {};
      const height = !!opts.height || p.output === 'height';
      const S = Math.min(W, H), cx = W / 2, cy = H / 2, seed = p.seed | 0;
      const Rm = (S / 2) * (1 - p.margin * 2) * p.scale, k = S / 512;
      const C = { soot: U.hex(p.sootColor), dust: U.hex(p.dustColor), deb: U.hex(p.debrisColor), heat: U.hex(p.heatColor), surf: U.hex(p.surface) };
      const irr = p.irregular, dir = p.direction * RAD, dirA = p.directional;
      const ring = (u, period, oct, s) => U.fractal('perlin', u * period, 0.37, period, 0, oct, 0.5, 'fbm', s);

      /* ---------- angular lookup tables (outlines and rays) ---------- */
      const nRay = Math.max(3, p.rayCount | 0);
      const SC = new Float32Array(LN), DU = new Float32Array(LN), RL = new Float32Array(LN), RS = new Float32Array(LN), DR = new Float32Array(LN);
      const rnd = U.rng(seed);
      // individual rays: angle, width, length, strength
      const rays = [];
      for (let i = 0; i < nRay; i++) rays.push({ a: (i + (rnd() - 0.5) * 0.9) / nRay * TAU, w: (0.25 + rnd() * 0.75) * (TAU / nRay) * (1.2 - p.raySharp * 0.9), l: 0.45 + rnd() * 0.55, s: 0.4 + rnd() * 0.6 });
      for (let i = 0; i < LN; i++) {
        const u = i / LN, th = u * TAU;
        // directional bias: 1 + d on the blast side, 1 - d behind it
        const bias = 1 + dirA * 0.75 * Math.cos(th - dir);
        DR[i] = bias;
        SC[i] = p.scorchSize * (1 + irr * (ring(u, 5, 3, seed + 1) - 0.5) * 0.7) * (0.8 + 0.2 * bias);
        DU[i] = p.dustReach * (1 + irr * (ring(u, 4, 3, seed + 2) - 0.5) * 0.6) * (0.55 + 0.45 * bias);
        // rays: sum of gaussian lobes around each ray angle
        let rs = 0, rl = 0;
        for (const r of rays) {
          let d = Math.abs(th - r.a) % TAU; if (d > Math.PI) d = TAU - d;
          const g = Math.exp(-((d / r.w) ** 2));
          if (g * r.s > rs) { rs = g * r.s; rl = r.l; }
        }
        RS[i] = rs * (0.85 + 0.3 * ring(u, 30, 2, seed + 3));
        RL[i] = p.rayLen * (0.5 + 0.5 * rl) * bias;
      }
      const lut = (T, th) => { const f = ((th / TAU) % 1 + 1) % 1 * LN, i0 = Math.floor(f) % LN, t = f - Math.floor(f); return T[i0] + (T[(i0 + 1) % LN] - T[i0]) * t; };

      // debris & pit lattices (radius units); grain cell ~ 0.03 radius at size 1
      const gcell = 0.028 * p.debrisSize, pcell = 0.09;
      const N = W * H, Hh = new Float32Array(N), Ar = new Float32Array(N), Cr = new Float32Array(N), Cg = new Float32Array(N), Cb = new Float32Array(N);
      // soft layers (dust, rays, scorch, heat) are kept apart from the sharp ones (crater tint, debris, pits),
      // premultiplied, so either group can be blurred on its own; sharp over soft gives the same result as before
      const SA = new Float32Array(N), SR = new Float32Array(N), SG = new Float32Array(N), SB = new Float32Array(N);
      const KA = new Float32Array(N), KR = new Float32Array(N), KG = new Float32Array(N), KB = new Float32Array(N);
      const ds = p.dustScale;

      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const X = (x + 0.5 - cx) / Rm, Y = (y + 0.5 - cy) / Rm;
          const rr = Math.hypot(X, Y);
          if (rr > 1.05) { Ar[i] = 0; Hh[i] = 0.5; continue; }
          const th = Math.atan2(Y, X);
          // warped radius: lumpy outlines
          const wn = U.fractal('perlin', X * 3 + 9, Y * 3 + 9, 0, 0, 3, 0.5, 'fbm', seed + 4);
          const rw = rr * (1 + (wn - 0.5) * irr * 0.35);
          const bias = lut(DR, th);
          const grain = hash(x, y, seed + 5);
          // fine radial streaks: noise over (angle, log radius) stretched along the radius
          const st = U.fractal('perlin', (th / TAU) * 160, rr * 3, 160, 0, 3, 0.5, 'fbm', seed + 6);

          /* layers (alpha, color), composited bottom → top: dust, rays, scorch, heat, debris, pits */
          let a = 0, r = 0, g = 0, b = 0, h = 0.5;
          const over = (la, c) => {
            if (la <= 0) return;
            const na = la + a * (1 - la);
            r = (c[0] * la + r * a * (1 - la)) / na; g = (c[1] * la + g * a * (1 - la)) / na; b = (c[2] * la + b * a * (1 - la)) / na;
            a = na;
          };

          // dust deposit
          if (p.dust > 0) {
            // density falls off with the distance; the noise threshold follows it, so the deposit breaks into
            // clumps and specks toward its edge instead of fading out evenly
            const R = lut(DU, th), dens = 1 - smoothstep(0, R * 1.2, rw);
            const n = U.fractal('perlin', X * ds + 3, Y * ds + 3, 0, 0, 5, 0.55, 'fbm', seed + 7) + (st - 0.5) * p.streaks * 0.3 + (grain - 0.5) * 0.08;
            const thr = lerp(0.5, 1.02 - dens * 1.1, p.dustNoise);
            const brk = p.dustNoise > 0 ? smoothstep(thr - 0.05, thr + 0.05, n) : 1;
            const la = Math.pow(dens, 0.6 - p.dustNoise * 0.3) * brk * p.dust * (0.8 + 0.2 * grain) * 1.25;
            over(clamp(la), C.dust);
            h += la * 0.03;
          }
          // blast rays: soot near the center, fading to dust color outward
          if (p.rays > 0) {
            const rs = lut(RS, th), rl = lut(RL, th), sc0 = lut(SC, th) * 0.6;
            const along = clamp((rr - sc0) / Math.max(0.05, rl - sc0));
            const sharp = 0.5 + p.raySharp * 2;
            const la = Math.pow(rs, sharp) * (1 - smoothstep(0.55, 1, along)) * 1.3 * smoothstep(sc0 * 0.5, sc0 * 1.1 + 0.02, rr) * p.rays
              * (1 - p.streaks * 0.7 + p.streaks * 1.4 * smoothstep(0.35, 0.65, st)) * (0.8 + 0.4 * grain);
            const c = [lerp(C.soot[0], C.dust[0], along * 0.8), lerp(C.soot[1], C.dust[1], along * 0.8), lerp(C.soot[2], C.dust[2], along * 0.8)];
            over(clamp(la * (1 - along * 0.3)), c);
          }
          // scorch
          if (p.scorch > 0) {
            const R = lut(SC, th);
            const n = U.fractal('perlin', X * 7 + 1, Y * 7 + 1, 0, 0, 5, 0.55, 'fbm', seed + 8);
            const core = 1 - smoothstep(R * 0.45, R * (1.05 + p.scorchNoise * 0.25), rw + (n - 0.5) * p.scorchNoise * R * 0.9);
            const holeF = 1 - p.hole * 0.7 * (1 - smoothstep(R * 0.08, R * 0.45, rw + (n - 0.5) * R * 0.3));
            const mott = 1 - p.scorchNoise * 0.45 * smoothstep(0.45, 0.75, n);
            const la = core * p.scorch * holeF * mott * (0.9 + 0.1 * grain);
            over(clamp(la), C.soot);
            if (p.heat > 0) {
              const band = Math.exp(-(((rw - R * 0.95) / (R * 0.28)) ** 2)) * p.heat * (0.6 + 0.4 * n);
              over(clamp(band * 0.7), C.heat);
            }
          }
          // end of the soft group: store it, start the sharp group
          SA[i] = a; SR[i] = r * a; SG[i] = g * a; SB[i] = b * a;
          const softA = a;
          a = 0; r = 0; g = 0; b = 0;
          // crater: bowl with a raised rim
          if (p.crater > 0) {
            const cr = p.craterSize * (1 + irr * (wn - 0.5) * 0.4), q = rw / cr;
            const bowl = q < 1 ? -(1 - q * q) * 0.3 : 0, rim = Math.exp(-(((q - 1.05) / 0.28) ** 2)) * 0.08;
            h += (bowl + rim) * p.crater;
            if (q < 1.25) over(clamp((1 - smoothstep(0.9, 1.25, q)) * p.crater * 0.25 * (1 - softA)), C.surf);
          }
          // debris grains, stretched along the blast direction (radial), sparser outward
          if (p.debris > 0) {
            const ux = X / (rr || 1), uy = Y / (rr || 1);
            for (let pass = 0; pass < 2; pass++) {
              const cs = gcell * (pass ? 2.2 : 1), gx = X / cs, gy = Y / cs, xi = Math.floor(gx), yi = Math.floor(gy);
              const prob = p.debris * (pass ? 0.22 : 0.45) * (1 - smoothstep(p.debrisReach * 0.4, p.debrisReach * bias, rr)) * (0.3 + 0.7 * smoothstep(0, 0.25, rr));
              if (prob <= 0) continue;
              for (let j = yi - 1; j <= yi + 1; j++) for (let ii = xi - 1; ii <= xi + 1; ii++) {
                if (hash(ii, j, seed + 20 + pass) > prob) continue;
                const ox = ii + hash(ii, j, seed + 22 + pass), oy = j + hash(ii, j, seed + 24 + pass);
                const dx = gx - ox, dy = gy - oy;
                // radial / tangential components: grains stretched outward
                const pr = dx * ux + dy * uy, pt = -dx * uy + dy * ux;
                const sz = 0.18 + hash(ii, j, seed + 26 + pass) * 0.3, el = 1 + hash(ii, j, seed + 28) * 1.2;
                const d = Math.hypot(pr / el, pt) / sz;
                if (d < 1) {
                  const cov = clamp((1 - d) * sz * cs * Rm * 1.2);
                  const tone = 0.55 + hash(ii, j, seed + 30) * 0.55;
                  over(cov, [C.deb[0] * tone, C.deb[1] * tone, C.deb[2] * tone]);
                  h = Math.max(h, 0.5 + (1 - d * d) * 0.05 * (pass ? 1.5 : 1));
                }
              }
            }
          }
          // shrapnel pits: small dark pockmarks with a light chipped rim
          if (p.pits > 0) {
            const gx = X / pcell, gy = Y / pcell, xi = Math.floor(gx), yi = Math.floor(gy);
            const prob = p.pits * 0.55 * (1 - smoothstep(0.4, 0.95, rr)) * smoothstep(0.1, 0.3, rr);
            for (let j = yi - 1; j <= yi + 1; j++) for (let ii = xi - 1; ii <= xi + 1; ii++) {
              if (hash(ii, j, seed + 40) > prob) continue;
              const ox = ii + 0.2 + hash(ii, j, seed + 41) * 0.6, oy = j + 0.2 + hash(ii, j, seed + 42) * 0.6;
              const sz = 0.06 + hash(ii, j, seed + 43) * 0.1, d = Math.hypot(gx - ox, gy - oy) / sz;
              if (d < 1.8) {
                const hole = 1 - smoothstep(0.7, 1, d), chip = Math.exp(-(((d - 1.25) / 0.25) ** 2)) * 0.6;
                over(clamp(chip * 0.8), C.dust);
                over(clamp(hole), [C.soot[0] * 0.7, C.soot[1] * 0.7, C.soot[2] * 0.7]);
                h -= hole * 0.15;
              }
            }
          }
          KA[i] = a; KR[i] = r * a; KG[i] = g * a; KB[i] = b * a; Hh[i] = h;
        }
      }

      /* ---------- focus: blur one or both groups (uniform, or growing toward the rim) ---------- */
      if (p.blur > 0) {
        const br = p.blur * k, ff = p.focusFalloff;
        // blur amount per pixel: 1 = full radius
        const M = ff > 0 ? new Float32Array(N) : null;
        if (M) for (let y = 0, i = 0; y < H; y++) for (let x = 0; x < W; x++, i++) {
          const rr = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / Rm;
          M[i] = lerp(1, smoothstep(p.focusSize, Math.max(p.focusSize + 0.05, 1), rr), ff);
        }
        const focus = (chs) => {
          const full = chs.map((c) => blurCh(c, W, H, br));
          if (!M) return full;
          const half = chs.map((c) => blurCh(c, W, H, br * 0.4));
          return chs.map((c, n) => {
            const o = new Float32Array(N), F = full[n], Hf = half[n];
            for (let i = 0; i < N; i++) { const m = M[i]; o[i] = m < 0.5 ? lerp(c[i], Hf[i], m * 2) : lerp(Hf[i], F[i], (m - 0.5) * 2); }
            return o;
          });
        };
        if (p.blurTarget !== 'sharp') { const [a2, r2, g2, b2] = focus([SA, SR, SG, SB]); SA.set(a2); SR.set(r2); SG.set(g2); SB.set(b2); }
        if (p.blurTarget !== 'soft') {
          const [a2, r2, g2, b2, h2] = focus([KA, KR, KG, KB, Hh]); KA.set(a2); KR.set(r2); KG.set(g2); KB.set(b2); Hh.set(h2);
        }
      }
      // sharp group over the soft group -> straight (un-premultiplied) color
      for (let i = 0; i < N; i++) {
        const ka = KA[i], sa = SA[i], A = ka + sa * (1 - ka);
        Ar[i] = A;
        if (A > 1e-6) { Cr[i] = (KR[i] + SR[i] * (1 - ka)) / A; Cg[i] = (KG[i] + SG[i] * (1 - ka)) / A; Cb[i] = (KB[i] + SB[i] * (1 - ka)) / A; }
      }

      /* ---------- shading from the height, then output ---------- */
      const img = ctx.createImageData(W, H), o = img.data;
      const amb = p.lightMode === 'ambient', la = p.light * RAD, lx = amb ? 0 : Math.cos(la), ly = amb ? 0 : Math.sin(la);
      const hs = 18 * k, LA = p.lightAmt;
      const sv = U.coarseField(W, H, 160, (x, y) => U.fractal('perlin', (x / W) * 6, (y / H) * 6, 6, 6, 4, 0.5, 'fbm', seed + 50));
      for (let y = 0, i = 0; y < H; y++) {
        for (let x = 0; x < W; x++, i++) {
          const k4 = i * 4;
          if (height) { const v = clamp(Hh[i]) * 255; o[k4] = o[k4 + 1] = o[k4 + 2] = v; o[k4 + 3] = 255; continue; }
          const xl = x > 0 ? i - 1 : i, xr = x < W - 1 ? i + 1 : i, yu = y > 0 ? i - W : i, yd = y < H - 1 ? i + W : i;
          const dx = (Hh[xr] - Hh[xl]) * 0.5 * hs, dy = (Hh[yd] - Hh[yu]) * 0.5 * hs;
          const nl = Math.sqrt(dx * dx + dy * dy + 1);
          const shade = amb ? 1 / nl : 1 + (-(dx * lx + dy * ly) * 0.75) / nl;
          const L = 1 + (clamp(shade, 0.2, 1.8) - 1) * LA * 1.4;
          let a = Ar[i], r = Cr[i], g = Cg[i], b = Cb[i];
          if (p.output === 'surface') {
            const f = 1 + (sv[i] - 0.5) * p.surfaceVar * 0.5 + (hash(x, y, seed + 51) - 0.5) * p.surfaceVar * 0.12;
            r = lerp(C.surf[0] * f, r, a); g = lerp(C.surf[1] * f, g, a); b = lerp(C.surf[2] * f, b, a); a = 1;
            o[k4] = r * L; o[k4 + 1] = g * L; o[k4 + 2] = b * L; o[k4 + 3] = 255;
          } else {
            // lit relief (crater walls) also shows on bare ground: add a faint shade layer where the height moves
            const rel = p.crater > 0 ? clamp(Math.abs(L - 1) * 1.5) * (1 - a) * (1 - smoothstep(p.craterSize * 1.2, p.craterSize * 1.7, Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / Rm)) : 0;
            if (rel > 0) { const c = L > 1 ? 255 : 0, na = a + rel * 0.5 * (1 - a); r = (r * a + c * rel * 0.5 * (1 - a)) / na; g = (g * a + c * rel * 0.5 * (1 - a)) / na; b = (b * a + c * rel * 0.5 * (1 - a)) / na; a = na; }
            o[k4] = r * (a > 0 ? L : 1); o[k4 + 1] = g * (a > 0 ? L : 1); o[k4 + 2] = b * (a > 0 ? L : 1); o[k4 + 3] = clamp(a * p.opacity) * 255;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
