/* Explosion & shockwave flipbook: a one-shot explosion on its own timeline (tilesheet mode with
   `animTimeline`: frame t runs 0 → 1). One volumetric cloud carries density and temperature: it bursts
   out with an ease-out expansion, hot pockets glow along a fire ramp (core → hot → mid → cool) and the
   temperature decays until only billowing smoke is left, which keeps growing, rises and breaks up while it
   fades. Around it: the initial flash, a shockwave ring with a sharp front and soft tail (a flat ellipse on
   the ground for ground bursts), sparks on ballistic arcs with streaks and cooling colors, dark debris
   chunks, and for ground bursts a dust skirt rolling out along the ground (mushroom: rising cap on a stem).
   Density, temperature and lighting are computed on a fixed grid (same look at every frame size) and
   upsampled; ring, flash, sparks and debris are drawn per pixel. Outputs: color + alpha, fire only
   (additive on black), smoke only (alpha layer to combine with the additive one), or the shockwave as a
   distortion normal map. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, smoothstep } = U;
  const TAU = Math.PI * 2, PER = U.perlin;

  // palettes: [core, hot, mid, cool, smoke, smoke shadow, sparks, shockwave, dust]
  const PAL = {
    classic: ['#fffbe8', '#ffd04a', '#ff7a1a', '#8a1e08', '#5a5450', '#1c1a19', '#ffc860', '#fff4e0', '#9a8a74'],
    fuel: ['#fff2c0', '#ffb020', '#f05a10', '#6a1404', '#2e2a28', '#0a0908', '#ffa040', '#ffe8c8', '#6a5a48'],
    white: ['#ffffff', '#fff6d8', '#ffc878', '#b45a28', '#9a9692', '#46423f', '#fff0c0', '#ffffff', '#b0a898'],
    chemical: ['#f4ffe0', '#b8ff50', '#40d020', '#0c4a10', '#3a4a34', '#101a0e', '#c8ff80', '#e8ffe0', '#7a8a64'],
    plasma: ['#ffffff', '#a8e0ff', '#3a8cff', '#1a1a8a', '#2a2e4a', '#08081a', '#9ad8ff', '#d8f0ff', '#6a7088'],
    magic: ['#fff0ff', '#ff90f0', '#b030ff', '#3a0a6a', '#3a2a4a', '#100818', '#ff9cf8', '#ffe0ff', '#7a6a8a'],
    dust: ['#fff8e8', '#e8d0a0', '#c8a070', '#8a6a48', '#b09a7a', '#5a4a38', '#e8d0a0', '#f8f0e0', '#b09a7a'],
  };
  const PKEYS = ['cCore', 'cHot', 'cMid', 'cCool', 'smokeColor', 'smokeShadow', 'sparkColor', 'shockColor', 'dustColor'];
  const setPal = (v, p) => { const c = PAL[v]; if (c) PKEYS.forEach((k, i) => { p[k] = c[i]; }); };
  const grounded = (p) => p.type === 'ground' || p.type === 'mushroom';

  U.register({
    id: 'explosion',
    name: 'Explosion & Shockwave',
    desc: 'One-shot explosion flipbooks: flash, fireball cooling into billowing smoke, shockwave ring, sparks, debris and ground dust; air bursts, ground blasts, mushroom clouds and pure shockwaves, realistic or toon',
    uses: ['Explosion, impact and shockwave flipbooks for particle systems: grenades, vehicles, artillery, magic and sci-fi blasts; fire (additive) and smoke (alpha) as separate layers, plus a shockwave distortion normal map.', 'Animated explosion sprites for 2D games, UI hit effects and stylized toon blasts.'],
    tags: ['VFX', 'Shooter', 'Military', 'Animation'],
    bg: 'checker',
    animTimeline: true,
    animate(p, f) { p.time = f.t; return p; },
    icon: U.icon('<path d="M12 2.5l1.8 4.6 4.6-2.2-1.6 4.8 4.7 1.3-4.3 2.4 2.6 4.3-4.9-.8-.4 4.6-2.5-3.9-2.5 3.9-.4-4.6-4.9.8 2.6-4.3L2.5 11l4.7-1.3-1.6-4.8 4.6 2.2z"/><circle cx="12" cy="12" r="2.4"/>'),
    params: [
      { type: 'section', label: 'Explosion' },
      { key: 'type', label: 'Type', type: 'select', default: 'air', options: [['air', 'Air burst (fireball)'], ['ground', 'Ground blast (dust skirt)'], ['mushroom', 'Mushroom cloud'], ['shock', 'Shockwave only']], tip: 'Ground types sit on a ground line in the lower part of the frame' },
      { key: 'size', label: 'Size', type: 'range', min: 0.3, max: 1, step: 0.01, default: 0.85, tip: 'Largest extent as a share of the frame' },
      { key: 'time', label: 'Time', type: 'range', min: 0, max: 1, step: 0.005, default: 0.16, tip: 'Moment of the explosion shown in single-frame mode (the tilesheet runs 0 → 1)' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 9 },

      { type: 'section', label: 'Timing' },
      { key: 'expand', label: 'Expansion time', type: 'range', min: 0.03, max: 0.6, step: 0.01, default: 0.18, tip: 'Share of the animation the fireball needs to reach full size (fast burst … slow swell)' },
      { key: 'fireLife', label: 'Fire duration', type: 'range', min: 0.03, max: 0.9, step: 0.01, default: 0.36, tip: 'How long the fire keeps glowing before it has cooled into smoke' },
      { key: 'smokeLife', label: 'Smoke duration', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.95, tip: 'When the smoke has dissipated completely' },

      { type: 'section', label: 'Fireball' },
      { key: 'fire', label: 'Fire', type: 'range', min: 0, max: 1, step: 0.01, default: 1, tip: '0 = no fire (dust / smoke burst, pure shockwave)' },
      { key: 'heat', label: 'Heat', type: 'range', min: 0.3, max: 1.6, step: 0.01, default: 1, show: (p) => p.fire > 0, tip: 'Peak temperature: more white-hot core, longer glowing pockets' },
      { key: 'scale', label: 'Billow scale', type: 'range', min: 1, max: 7, step: 0.05, default: 2.6, tip: 'Size of the billows: low = big round lumps, high = fine, turbulent detail' },
      { key: 'detail', label: 'Detail', type: 'int', min: 1, max: 5, default: 4 },
      { key: 'billowy', label: 'Billowy', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75, tip: '0 = soft, wispy; 1 = cauliflower lumps with creases' },
      { key: 'breakup', label: 'Break-up', type: 'range', min: 0, max: 2, step: 0.01, default: 1, tip: 'Ragged outline and holes; grows further while the smoke fades' },
      { key: 'boil', label: 'Boil', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'How much the billows churn and move over the animation' },
      { key: 'softness', label: 'Edge softness', type: 'range', min: 0.02, max: 0.8, step: 0.01, default: 0.22 },

      { type: 'section', label: 'Smoke' },
      { key: 'smoke', label: 'Smoke', type: 'range', min: 0, max: 1, step: 0.01, default: 0.85, tip: 'Opacity of the smoke the fire turns into' },
      { key: 'smokeGrow', label: 'Smoke growth', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'How much the cloud keeps expanding after the burst' },
      { key: 'smokeRise', label: 'Rising', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'How far the hot cloud rises over the animation (mushroom: height of the cap)' },
      { key: 'glow', label: 'Fire glow on smoke', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, tip: 'Smoke next to the fire is lit orange from inside' },
      { key: 'lightAngle', label: 'Light angle', type: 'range', min: -180, max: 180, step: 1, default: -110, tip: 'Direction the sky / sun light comes from (-90 = above)' },
      { key: 'dust', label: 'Ground dust', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: grounded, tip: 'Dust skirt rolling out along the ground' },

      { type: 'section', label: 'Shockwave & flash' },
      { key: 'shock', label: 'Shockwave', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Expanding ring (a flat ellipse along the ground for ground types)' },
      { key: 'shockWidth', label: 'Ring width', type: 'range', min: 0.005, max: 0.2, step: 0.005, default: 0.04, show: (p) => p.shock > 0 },
      { key: 'shockLife', label: 'Ring duration', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.3, show: (p) => p.shock > 0, tip: 'Time until the ring has reached the frame edge and faded' },
      { key: 'flash', label: 'Flash', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, tip: 'Bright initial flash in the first frames' },

      { type: 'section', label: 'Sparks & debris' },
      { key: 'sparks', label: 'Sparks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, tip: 'Glowing sparks flying out on arcs, cooling down' },
      { key: 'sparkSpeed', label: 'Spark speed', type: 'range', min: 0.1, max: 1.5, step: 0.01, default: 0.6, show: (p) => p.sparks > 0 || p.debris > 0 },
      { key: 'gravity', label: 'Gravity', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.5, show: (p) => p.sparks > 0 || p.debris > 0 },
      { key: 'debris', label: 'Debris', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Dark chunks thrown out of the blast' },
      { key: 'debrisColor', label: 'Debris color', type: 'color', default: '#1e1a17', show: (p) => p.debris > 0 },

      { type: 'section', label: 'Color' },
      { key: 'palette', label: 'Palette', type: 'select', default: 'classic', options: [['classic', 'Classic fire'], ['fuel', 'Fuel / napalm (black smoke)'], ['white', 'White-hot (bright smoke)'], ['chemical', 'Chemical green'], ['plasma', 'Plasma blue'], ['magic', 'Magic purple'], ['dust', 'Dust (no fire colors)'], ['custom', 'Custom']], apply: setPal },
      { key: 'style', label: 'Style', type: 'select', default: 'soft', options: [['soft', 'Soft (realistic)'], ['toon', 'Toon (bands, hard edge)']] },
      { key: 'bands', label: 'Bands', type: 'int', min: 2, max: 6, default: 4, show: (p) => p.style === 'toon' },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 0.3, step: 0.01, default: 0, show: (p) => p.style === 'toon', tip: 'Dark outline around the cloud' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#2a1a14', show: (p) => p.style === 'toon' && p.outline > 0 },
      { key: 'cCore', label: 'Core', type: 'color', default: PAL.classic[0] },
      { key: 'cHot', label: 'Hot', type: 'color', default: PAL.classic[1] },
      { key: 'cMid', label: 'Mid', type: 'color', default: PAL.classic[2] },
      { key: 'cCool', label: 'Cool', type: 'color', default: PAL.classic[3] },
      { key: 'smokeColor', label: 'Smoke', type: 'color', default: PAL.classic[4] },
      { key: 'smokeShadow', label: 'Smoke shadow', type: 'color', default: PAL.classic[5] },
      { key: 'sparkColor', label: 'Sparks', type: 'color', default: PAL.classic[6] },
      { key: 'shockColor', label: 'Shockwave', type: 'color', default: PAL.classic[7] },
      { key: 'dustColor', label: 'Dust', type: 'color', default: PAL.classic[8] },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color + alpha'], ['additive', 'Fire only (additive, black background)'], ['smoke', 'Smoke only (alpha layer)'], ['distortion', 'Shockwave distortion (normal map)']], tip: 'Fire + smoke as two layers: additive fire on top of the alpha-blended smoke. Distortion: the ring as a tangent-space normal map for refraction' },
      { key: 'yDir', label: 'Green channel', type: 'select', default: 'gl', options: [['gl', 'OpenGL (Y+)'], ['dx', 'DirectX (Y−)']], show: (p) => p.output === 'distortion' },
    ],
    presets: [
      { name: 'Fireball (air burst)', group: 'Realistic', values: {} },
      { name: 'Ground explosion', group: 'Realistic', values: { type: 'ground', size: 0.9, dust: 0.75, smokeRise: 0.45, debris: 0.45, sparks: 0.35, time: 0.18 } },
      { name: 'Grenade blast', group: 'Realistic', values: { type: 'ground', size: 0.8, expand: 0.08, fireLife: 0.12, heat: 1.1, scale: 3.4, smoke: 0.75, smokeGrow: 0.7, dust: 1, shock: 0.6, shockLife: 0.2, sparks: 0.6, sparkSpeed: 0.9, debris: 0.7, palette: 'white', ...pal('white'), time: 0.1 } },
      { name: 'Vehicle / fuel explosion', group: 'Realistic', values: { size: 0.95, expand: 0.25, fireLife: 0.45, heat: 1.2, palette: 'fuel', ...pal('fuel'), smoke: 1, smokeRise: 0.55, scale: 2.3, billowy: 0.9, sparks: 0.5, debris: 0.5, time: 0.22 } },
      { name: 'Napalm fireball', group: 'Realistic', values: { size: 0.95, expand: 0.35, fireLife: 0.6, heat: 1.3, palette: 'fuel', ...pal('fuel'), smoke: 1, smokeRise: 0.5, billowy: 0.95, scale: 2.1, shock: 0.15, sparks: 0.2, debris: 0, time: 0.3 } },
      { name: 'Mushroom cloud', group: 'Realistic', values: { type: 'mushroom', size: 1, expand: 0.3, fireLife: 0.5, heat: 1.4, smoke: 1, smokeRise: 0.8, smokeGrow: 0.7, dust: 0.8, shock: 0.8, shockLife: 0.4, flash: 1, sparks: 0, debris: 0, scale: 2.2, palette: 'white', ...pal('white'), time: 0.35 } },
      { name: 'Artillery impact', group: 'Realistic', values: { type: 'ground', size: 1, expand: 0.12, fireLife: 0.15, heat: 0.9, smoke: 0.9, smokeGrow: 0.8, smokeRise: 0.25, dust: 1, palette: 'classic', ...pal('classic'), smokeColor: '#6a6058', debris: 1, sparkSpeed: 1, sparks: 0.3, shock: 0.7, time: 0.14 } },
      { name: 'Dust impact (no fire)', group: 'Realistic', values: { type: 'ground', fire: 0, flash: 0.15, palette: 'dust', ...pal('dust'), smoke: 0.9, smokeGrow: 0.8, smokeRise: 0.15, dust: 1, shock: 0.25, sparks: 0, debris: 0.6, billowy: 0.55, breakup: 1.2, time: 0.2 } },
      { name: 'Smoke burst', group: 'Realistic', values: { fire: 0, flash: 0, palette: 'classic', ...pal('classic'), smokeColor: '#8a8682', smokeShadow: '#3a3836', smoke: 1, smokeGrow: 0.8, smokeRise: 0.3, shock: 0, sparks: 0, debris: 0, expand: 0.25, time: 0.3 } },
      { name: 'Shockwave ring', group: 'Shockwave', values: { type: 'shock', fire: 0, smoke: 0, shock: 1, shockWidth: 0.05, shockLife: 0.6, flash: 0.6, sparks: 0, debris: 0, time: 0.2 } },
      { name: 'Ground shockwave + dust', group: 'Shockwave', values: { type: 'ground', fire: 0, smoke: 0.4, smokeGrow: 1, smokeRise: 0, palette: 'dust', ...pal('dust'), dust: 1, shock: 1, shockWidth: 0.07, shockLife: 0.5, flash: 0.3, sparks: 0, debris: 0.3, time: 0.22 } },
      { name: 'Shockwave distortion (normal)', group: 'Shockwave', values: { type: 'shock', fire: 0, smoke: 0, shock: 1, shockWidth: 0.08, shockLife: 0.9, flash: 0, sparks: 0, debris: 0, output: 'distortion', time: 0.3 } },
      { name: 'Energy shockwave', group: 'Shockwave', values: { type: 'shock', fire: 0.4, heat: 0.8, smoke: 0, palette: 'plasma', ...pal('plasma'), shock: 1, shockWidth: 0.03, shockLife: 0.5, flash: 1, sparks: 0.5, sparkSpeed: 1.1, gravity: 0, debris: 0, expand: 0.06, fireLife: 0.1, time: 0.15 } },
      { name: 'Fire only (additive layer)', group: 'Layers', values: { output: 'additive', time: 0.14 } },
      { name: 'Smoke only (alpha layer)', group: 'Layers', values: { output: 'smoke', time: 0.3 } },
      { name: 'Toon explosion', group: 'Stylized', values: { style: 'toon', bands: 4, scale: 1.8, detail: 2, billowy: 1, breakup: 0.55, softness: 0.05, smoke: 0.9, smokeColor: '#6a6460', smokeShadow: '#3a3634', sparks: 0.3, debris: 0, shock: 0.6, shockWidth: 0.025, time: 0.2 } },
      { name: 'Toon explosion (outlined)', group: 'Stylized', values: { style: 'toon', bands: 3, outline: 0.12, scale: 1.6, detail: 2, billowy: 1, breakup: 0.45, softness: 0.05, smoke: 0.9, smokeColor: '#8a8480', smokeShadow: '#4a4644', sparks: 0, debris: 0, shock: 0.5, time: 0.2 } },
      { name: 'Cartoon dust poof', group: 'Stylized', values: { style: 'toon', bands: 3, type: 'ground', fire: 0, flash: 0, palette: 'dust', ...pal('dust'), smokeColor: '#efe2c8', smokeShadow: '#b49a74', scale: 1.7, detail: 2, billowy: 1, breakup: 0.4, softness: 0.05, smoke: 1, smokeRise: 0.1, dust: 0.9, shock: 0, sparks: 0, debris: 0, time: 0.25 } },
      { name: 'Plasma burst', group: 'Sci-fi & magic', values: { palette: 'plasma', ...pal('plasma'), heat: 1.3, fireLife: 0.4, smoke: 0.35, shock: 0.8, shockWidth: 0.025, sparks: 0.6, gravity: 0.1, debris: 0, time: 0.16 } },
      { name: 'Magic blast', group: 'Sci-fi & magic', values: { palette: 'magic', ...pal('magic'), heat: 1.2, fireLife: 0.45, smoke: 0.5, billowy: 0.4, breakup: 1.3, boil: 0.9, shock: 0.7, sparks: 0.7, sparkSpeed: 0.8, gravity: 0.15, debris: 0, time: 0.18 } },
      { name: 'Toxic explosion', group: 'Sci-fi & magic', values: { palette: 'chemical', ...pal('chemical'), heat: 1.1, fireLife: 0.35, smoke: 0.9, smokeRise: 0.25, smokeGrow: 0.8, billowy: 0.6, shock: 0.4, sparks: 0.3, debris: 0, time: 0.2 } },
    ],

    render(ctx, W, H, p) {
      const t = clamp(p.time || 0), S = Math.min(W, H), half = S / 2, cxp = W / 2, cyp = H / 2, seed = p.seed | 0;
      const type = p.type, gnd = type === 'ground' || type === 'mushroom', mush = type === 'mushroom', shockOnly = type === 'shock';
      const out = p.output, toon = p.style === 'toon';
      const Rmax = p.size * 0.95, gy = gnd ? 0.62 : 9; // ground line (units: half the short side, y down)

      /* ---- timeline ---- */
      const te = Math.max(0.02, p.expand), ex = 1 - Math.pow(1 - clamp(t / te), 3);
      const heat = p.fire * p.heat * Math.exp(-(Math.max(0, t - te * 0.2) / Math.max(0.03, p.fireLife)) * 2.3);
      const sl = Math.max(0.15, p.smokeLife), smokeAmt = p.smoke * smoothstep(0, te * 1.2, t) * (1 - smoothstep(sl * 0.45, sl, t));
      const dissolve = smoothstep(sl * 0.3, sl, t);
      const cloudOn = !shockOnly || p.fire > 0;
      const growS = 1 + p.smokeGrow * 0.75 * smoothstep(te, sl, t);
      let R = Rmax * (gnd ? 0.68 : 0.7) * (0.08 + 0.92 * ex) * growS;
      if (shockOnly) R *= 0.45;
      const rise = p.smokeRise * Math.pow(t, 1.3);
      let ccx = 0, ccy, sxc = 1, syc = 1;
      if (mush) { // the cap rises on its stem and flattens out
        const ht = (0.15 + 0.85 * smoothstep(0, 0.75, t)) * (0.35 + 0.65 * p.smokeRise);
        ccy = gy - R * 0.5 - ht * Rmax * 1.1; sxc = 1.15 + 0.25 * smoothstep(0.1, 0.6, t); syc = 0.62;
        R *= 0.85;
      } else if (gnd) { ccy = gy - R * 0.3 - rise * Rmax * 0.9; syc = 0.95; }
      else ccy = -rise * Rmax * 0.55;
      const stemW = R * 0.32;

      /* ---- noise ---- */
      const oct = p.detail | 0, bil = p.billowy, sc = p.scale, boil = p.boil * t * 2.2;
      const fbm = (x, y, s) => {
        let a = 1, sum = 0, nn = 0, f = 1;
        for (let o = 0; o < oct; o++) {
          const bx = boil * (o & 1 ? 1.3 : -0.9) * Math.sqrt(f), by = boil * (o & 1 ? -1.1 : 1.6) * Math.sqrt(f);
          const n = PER(x * f + bx, y * f + by, 0, 0, s + o * 1013);
          sum += lerp(n * 0.5, Math.abs(n) * 1.4 - 0.45, bil) * a; nn += a; a *= 0.5; f *= 2;
        }
        return sum / nn; // ~ -0.5 .. 0.5
      };

      /* ---- grid: cloud density D, temperature T, dust skirt Dk ---- */
      const cells = Math.min(S, 150), st = S / cells, gw = Math.ceil(W / st) + 2, gh = Math.ceil(H / st) + 2, GN = gw * gh;
      const D = new Float32Array(GN).fill(-1), T = new Float32Array(GN), Dk = new Float32Array(GN).fill(-1);
      const skirtOn = gnd && p.dust > 0;
      const ex2 = 1 - Math.pow(1 - clamp(t / (te * 1.8)), 3);
      const kR = Rmax * (0.3 + 1.05 * ex2) * (1 + 0.3 * p.smokeGrow * t), kH = Rmax * 0.13 * (0.4 + 0.9 * ex2) * (1 + 0.6 * t);
      const kFade = p.dust * (1 - smoothstep(0.25, Math.max(0.3, sl * 0.95), t));
      for (let j = 0; j < gh; j++) {
        for (let i = 0; i < gw; i++) {
          const x = (i * st - cxp) / half, y = (j * st - cyp) / half, k = j * gw + i;
          const edge = smoothstep(0.86, 1.0, Math.max(Math.abs(x) * (half / (W / 2)), Math.abs(y) * (half / (H / 2))));
          if (cloudOn && R > 1e-4) {
            const dx = (x - ccx) / (R * sxc), dy = (y - ccy) / (R * syc), d = Math.sqrt(dx * dx + dy * dy);
            let base = 1 - d * d;
            if (mush && y > ccy && y < gy) { // stem: a column from the ground up into the cap, flaring at the base
              const v = (y - ccy) / (gy - ccy), w = stemW * (0.75 + 0.9 * v * v), sb = (1 - (x / w) * (x / w)) * 0.95;
              const h = Math.max(0, 0.3 - Math.abs(sb - base)) / 0.3;
              base = Math.max(base, sb) + h * h * 0.07;
            }
            if (base > -0.7) {
              const n = fbm(((x - ccx) / R) * sc * 0.5, ((y - ccy) / R) * sc * 0.5, seed);
              let dd = base * 1.15 + n * (p.breakup * 1.5 + dissolve * 1.6) - 0.1 - dissolve * 0.55 - edge * 2;
              if (gnd) dd -= smoothstep(gy - 0.01, gy + 0.05, y) * 3;
              D[k] = dd;
              T[k] = heat * clamp((1 - d * 0.85) * 1.2 + n * 1.3 - (mush && y > ccy + R * syc * 0.6 ? 0.35 : 0));
            }
          }
          if (skirtOn) { // dust rolling out along the ground
            const sx = x / kR, hx = kH * (1.25 - 0.7 * Math.min(1, Math.abs(sx))), sy = (y - gy) / hx, b = 1 - sx * sx - sy * sy * 0.55;
            if (b > -0.6) {
              const n = fbm((x / kH) * sc * 0.3 + 17, ((y - gy) / kH) * sc * 0.3, seed + 333);
              let dd = b * 0.95 + n * (p.breakup * 1.7 + dissolve * 1.3) - 0.12 - edge * 2 - smoothstep(gy - 0.005, gy + 0.03, y) * 3;
              dd -= (1 - kFade) * 1.2;
              Dk[k] = dd;
            }
          }
        }
      }
      // lighting of the smoke / dust on the grid: light from the light angle, thick parts darker
      const la = (p.lightAngle * Math.PI) / 180, lx = Math.cos(la), ly = Math.sin(la), stp = Math.max(1, cells * 0.035);
      const atD = (A, i, j) => { const ii = Math.round(i), jj = Math.round(j); return ii < 0 || jj < 0 || ii >= gw || jj >= gh ? -1 : A[jj * gw + ii]; };
      const lightOf = (A) => {
        const L = new Float32Array(GN);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
          const k = j * gw + i;
          if (A[k] <= -0.3) continue;
          let occ = 0;
          for (let q = 1; q <= 4; q++) occ += clamp(atD(A, i + lx * stp * q, j + ly * stp * q) + 0.2) * (1.15 - q * 0.18);
          const gx = atD(A, i + 1, j) - atD(A, i - 1, j), gy2 = atD(A, i, j + 1) - atD(A, i, j - 1);
          const facing = clamp(0.5 - (gx * lx + gy2 * ly) * 1.6);
          L[k] = clamp(0.1 + 0.95 * facing - occ * 0.3 + 0.1);
        }
        return L;
      };
      const Lc = cloudOn ? lightOf(D) : null, Lk = skirtOn ? lightOf(Dk) : null;

      /* ---- per pixel ---- */
      const hx = U.hex, cC = [hx(p.cCore), hx(p.cHot), hx(p.cMid), hx(p.cCool)], sm = hx(p.smokeColor), sms = hx(p.smokeShadow);
      const spk = hx(p.sparkColor), shc = hx(p.shockColor), dc = hx(p.dustColor), olc = hx(p.outlineColor), dbc = hx(p.debrisColor);
      const fireLUT = U.ramp([[0, p.cCool], [0.35, p.cMid], [0.7, p.cHot], [1, p.cCore]]);
      const nb = Math.max(2, p.bands | 0), soft = toon ? 0.012 : Math.max(0.02, p.softness), dustS = U.hex(p.dustColor).map((v) => v * 0.45);
      const q = (v) => (toon ? Math.min(nb - 1, Math.floor(v * nb)) / (nb - 1) : v);
      // float buffers: premultiplied color (alpha-blended) and emission (added on top)
      const N = W * H, Ar = new Float32Array(N), Ag = new Float32Array(N), Ab = new Float32Array(N), Aa = new Float32Array(N);
      const Er = new Float32Array(N), Eg = new Float32Array(N), Eb = new Float32Array(N);
      const sample = (A, x, y) => {
        const fx = x / st, fy = y / st, i = Math.min(gw - 2, Math.floor(fx)), j = Math.min(gh - 2, Math.floor(fy)), tx = fx - i, ty = fy - j, o = j * gw + i;
        const a = A[o] + (A[o + 1] - A[o]) * tx, b = A[o + gw] + (A[o + gw + 1] - A[o + gw]) * tx;
        return a + (b - a) * ty;
      };
      const over = (k, r, g, b, a) => { const f = 1 - Aa[k]; Ar[k] += r * a * f; Ag[k] += g * a * f; Ab[k] += b * a * f; Aa[k] += a * f; }; // under what is there
      const ol = toon ? p.outline : 0, glow = p.glow;
      const smokeLayer = out === 'smoke';
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x;
        // dust skirt in front of the cloud's base
        if (skirtOn) {
          const d = sample(Dk, x, y);
          if (d > -ol) {
            let a = toon ? smoothstep(0.03, 0.05, d) : smoothstep(0, soft * 1.4, d);
            const l = q(sample(Lk, x, y));
            if (toon && ol > 0 && d < 0.04) { over(k, olc[0], olc[1], olc[2], 1); }
            else if (a > 0) over(k, lerp(dustS[0], dc[0], l), lerp(dustS[1], dc[1], l), lerp(dustS[2], dc[2], l), a * 0.95);
          }
        }
        if (!cloudOn) continue;
        const d = sample(D, x, y);
        if (d <= -ol) continue;
        const Tv = sample(T, x, y), e = smoothstep(0.1, 0.4, Tv);
        const cov = toon ? smoothstep(0.03, 0.05, d) : smoothstep(0, soft, d);
        if (toon && ol > 0 && d < 0.04 && (smokeAmt > 0.05 || e > 0.05)) { over(k, olc[0], olc[1], olc[2], 1); continue; }
        if (cov <= 0) continue;
        // smoke: shaded, lit orange from the fire inside
        const l = q(sample(Lc, x, y)), gl = glow * smoothstep(0.02, 0.3, Tv) * (1 - e);
        let r = lerp(sms[0], sm[0], l), g = lerp(sms[1], sm[1], l), b = lerp(sms[2], sm[2], l);
        r = lerp(r, cC[2][0] * 0.85, gl); g = lerp(g, cC[2][1] * 0.85, gl); b = lerp(b, cC[2][2] * 0.85, gl);
        const aS = Math.pow(cov, 0.7) * Math.min(1, smokeAmt * 1.15), aF = cov * e;
        if (smokeLayer) { if (aS > 0 || aF > 0) over(k, r, g, b, Math.max(aS, aF * Math.min(1, p.smoke * 1.5 + 0.2))); continue; }
        // fire: temperature ramp (toon: bands)
        const tv = toon ? Math.round(clamp(Tv) * (nb - 1)) / (nb - 1) : clamp(Tv);
        const j4 = ((tv * 255) | 0) * 4, fr = fireLUT[j4], fg = fireLUT[j4 + 1], fb = fireLUT[j4 + 2];
        if (out === 'additive') { Er[k] += fr * aF; Eg[k] += fg * aF; Eb[k] += fb * aF; continue; }
        const a = Math.max(aS, aF);
        if (a > 0) over(k, lerp(r, fr, e), lerp(g, fg, e), lerp(b, fb, e), a);
      }

      // shockwave ring: sharp front, soft tail; flat on the ground for ground types
      const tsl = Math.max(0.05, p.shockLife), ts = t / tsl, ringOn = p.shock > 0 && ts < 1;
      const Rr = Rmax * 1.02 * (1 - Math.pow(1 - clamp(ts), 2.2)), rA = p.shock * Math.pow(1 - clamp(ts), 1.4), rw = Math.max(0.004, p.shockWidth * (0.5 + ts));
      const ringY = gnd ? gy : 0, ringSq = gnd ? 0.26 : 1;
      const ringProf = (dist) => { const u = (dist - Rr) / rw; return u > 0 ? Math.exp(-u * u * 3) : Math.exp(-u * u * 0.45); };
      if (out === 'distortion') {
        const img = ctx.createImageData(W, H), o = img.data, gyS = p.yDir === 'dx' ? -1 : 1, ks = 0.12 / rw;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const ux = (x + 0.5 - cxp) / half, uy = (y + 0.5 - cyp) / half, ry = (uy - ringY) / ringSq, dist = Math.hypot(ux, ry), i = (y * W + x) * 4;
          let nx = 0, ny = 0;
          if (ringOn && dist > 1e-4) {
            const e = rw * 0.05, dh = (ringProf(dist + e) - ringProf(dist - e)) / (2 * e) * rA * rw * ks;
            nx = -dh * (ux / dist); ny = dh * (ry / dist) * gyS;
          }
          const l = 1 / Math.sqrt(nx * nx + ny * ny + 1);
          o[i] = (nx * l * 0.5 + 0.5) * 255; o[i + 1] = (ny * l * 0.5 + 0.5) * 255; o[i + 2] = (l * 0.5 + 0.5) * 255; o[i + 3] = 255;
        }
        ctx.putImageData(img, 0, 0);
        return;
      }
      const flashA = p.flash * Math.exp(-t / 0.035), rf = Rmax * (0.25 + 0.45 * p.flash) * (0.6 + 3 * t);
      if (!smokeLayer && (ringOn || flashA > 0.004)) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const ux = (x + 0.5 - cxp) / half, uy = (y + 0.5 - cyp) / half, k = y * W + x;
          if (ringOn) {
            const v = ringProf(Math.hypot(ux, (uy - ringY) / ringSq)) * rA;
            if (v > 0.003) {
              if (out === 'additive') { Er[k] += shc[0] * v * 0.7; Eg[k] += shc[1] * v * 0.7; Eb[k] += shc[2] * v * 0.7; }
              else { // screened over the image, adds coverage
                const a = v * 0.8, f = 1 - Aa[k];
                Ar[k] += shc[0] * a * f; Ag[k] += shc[1] * a * f; Ab[k] += shc[2] * a * f; Aa[k] += a * f;
                Er[k] += shc[0] * a * 0.35 * (1 - f); Eg[k] += shc[1] * a * 0.35 * (1 - f); Eb[k] += shc[2] * a * 0.35 * (1 - f);
              }
            }
          }
          if (flashA > 0.004) {
            const dd = Math.hypot(ux, uy - (gnd ? gy - 0.05 : 0)), q1 = dd / rf, q2 = dd / (rf * 0.22), g = flashA * (Math.exp(-q1 * q1 * 2.5) + 0.8 * Math.exp(-q2 * q2));
            Er[k] += cC[0][0] * g; Eg[k] += cC[0][1] * g; Eb[k] += cC[0][2] * g;
          }
        }
      }

      // sparks (emission, streaks) and debris (dark chunks), on ballistic arcs
      const rnd = U.rng(seed * 7 + 3), ox = 0, oy = gnd ? gy - 0.04 : 0, grav = p.gravity * 2.4;
      const plot = (cx, cy, x2, y2, w, fn) => { // soft segment: fn(k, coverage)
        const px0 = cxp + cx * half, py0 = cyp + cy * half, px1 = cxp + x2 * half, py1 = cyp + y2 * half, wp = Math.max(0.6, w * half);
        const x0 = Math.max(0, Math.floor(Math.min(px0, px1) - wp * 2)), x1 = Math.min(W - 1, Math.ceil(Math.max(px0, px1) + wp * 2));
        const y0 = Math.max(0, Math.floor(Math.min(py0, py1) - wp * 2)), y1 = Math.min(H - 1, Math.ceil(Math.max(py0, py1) + wp * 2));
        const vx = px1 - px0, vy = py1 - py0, vv = vx * vx + vy * vy || 1e-6;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          const h = clamp(((x + 0.5 - px0) * vx + (y + 0.5 - py0) * vy) / vv), dx = x + 0.5 - (px0 + vx * h), dy = y + 0.5 - (py0 + vy * h);
          const c = Math.exp(-(dx * dx + dy * dy) / (wp * wp));
          if (c > 0.01) fn(y * W + x, c, h);
        }
      };
      const traj = (a, v, delay, tt) => { const u = Math.max(0, tt - delay); return [ox + Math.cos(a) * v * u, oy + Math.sin(a) * v * u + 0.5 * grav * u * u]; };
      const nSp = Math.round(p.sparks * 140);
      for (let s = 0; s < nSp; s++) {
        const a = gnd ? -Math.PI * (0.08 + 0.84 * rnd()) : rnd() * TAU, v = p.sparkSpeed * Rmax * (0.9 + 1.8 * rnd()), life = 0.2 + 0.55 * rnd(), dl = rnd() * 0.04, w = 0.005 + 0.008 * rnd();
        if (t < dl || t > dl + life) continue;
        const age = (t - dl) / life, b = Math.pow(1 - age, 1.3) * (0.6 + 0.4 * rnd());
        const [x2, y2] = traj(a, v, dl, t), [x1, y1] = traj(a, v, dl, Math.max(dl, t - 0.035));
        if (gnd && y2 > gy) continue;
        const cr = lerp(spk[0], cC[3][0], age), cg = lerp(spk[1], cC[3][1], age), cb = lerp(spk[2], cC[3][2], age);
        if (smokeLayer) continue;
        plot(x1, y1, x2, y2, w, (k, c, h) => { const g = c * b * (0.35 + 0.65 * h); Er[k] += cr * g; Eg[k] += cg * g; Eb[k] += cb * g; if (out !== 'additive') { const f = 1 - Aa[k]; Aa[k] += g * 0.8 * f; Ar[k] += cr * g * 0.8 * f; Ag[k] += cg * g * 0.8 * f; Ab[k] += cb * g * 0.8 * f; } });
      }
      const nDb = Math.round(p.debris * 40);
      if (out !== 'additive') for (let s = 0; s < nDb; s++) {
        const a = gnd ? -Math.PI * (0.12 + 0.76 * rnd()) : rnd() * TAU, v = p.sparkSpeed * Rmax * (0.6 + 1.3 * rnd()), dl = rnd() * 0.03, sz = 0.006 + 0.012 * rnd();
        if (t < dl) continue;
        const [x2, y2] = traj(a, v, dl, t), [x1, y1] = traj(a, v, dl, Math.max(dl, t - 0.012));
        if (gnd && y2 > gy) continue;
        if (Math.hypot(x2 - ccx, (y2 - ccy) / syc) < R * 0.85) continue; // still inside the cloud
        const fade = 1 - smoothstep(0.55, 0.9, t);
        // chunks fly in front of everything: premultiplied "over"
        plot(x1, y1, x2, y2, sz, (k, c) => { const g = smoothstep(0.25, 0.6, c) * fade; if (g > 0) { const f = 1 - g; Ar[k] = Ar[k] * f + dbc[0] * g; Ag[k] = Ag[k] * f + dbc[1] * g; Ab[k] = Ab[k] * f + dbc[2] * g; Aa[k] = Aa[k] * f + g; Er[k] *= f; Eg[k] *= f; Eb[k] *= f; } });
      }

      /* ---- write ---- */
      const img = ctx.createImageData(W, H), o = img.data;
      for (let k = 0; k < N; k++) {
        const i = k * 4;
        if (out === 'additive') { o[i] = Math.min(255, Er[k]); o[i + 1] = Math.min(255, Eg[k]); o[i + 2] = Math.min(255, Eb[k]); o[i + 3] = 255; continue; }
        const a = Math.min(1, Aa[k]);
        // emission (flash, ring glow, sparks) brightens and adds coverage
        const em = Math.max(Er[k], Eg[k], Eb[k]) / 255, A = Math.min(1, a + em * (1 - a));
        if (A <= 0) continue;
        const r = (Ar[k] + Er[k]) / A, g = (Ag[k] + Eg[k]) / A, b = (Ab[k] + Eb[k]) / A;
        o[i] = Math.min(255, r); o[i + 1] = Math.min(255, g); o[i + 2] = Math.min(255, b); o[i + 3] = A * 255;
      }
      ctx.putImageData(img, 0, 0);
    },
  });

  function pal(v) { const o = {}; PKEYS.forEach((k, i) => { o[k] = PAL[v][i]; }); return o; }
})();
