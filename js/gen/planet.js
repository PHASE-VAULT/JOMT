/* Planet / moon: a lit sphere for distance impostors and skyboxes. Surfaces are sampled from 3D noise
   on the sphere (no seams, no pole pinching): terran (ocean, land bands, ice caps), rocky / cratered
   (3D crater field, maria), gas giant (turbulent bands, storm), lava (glowing cracks), ice (blue
   fractures). Clouds, relief shading, phase lighting with a soft terminator, ambient, night-side
   city lights, atmosphere rim + outer glow, and optional rings in front of / behind the planet.
   Transparent background (or black). */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const RAD = Math.PI / 180;

  /* ---------- 3D gradient noise ---------- */
  const G3 = [[1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1], [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1]];
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const h3 = (x, y, z, s) => U.hash(x + Math.imul(z, 374761), y - Math.imul(z, 668265), s);
  const GX = G3.map((g) => g[0]), GY = G3.map((g) => g[1]), GZ = G3.map((g) => g[2]);
  // a shuffled permutation table + one random offset per seed: much cheaper than hashing every corner
  const PERM = (() => {
    const r = U.rng(90210), a = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; }
    const pm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) pm[i] = a[i & 255];
    return pm;
  })();
  const OFF = new Map();
  const offOf = (s) => { let o = OFF.get(s); if (!o) { o = [U.hash(s, 1, 7) * 4096, U.hash(s, 2, 7) * 4096, U.hash(s, 3, 7) * 4096]; OFF.set(s, o); } return o; };
  function perlin3(x, y, z, s) {
    const o = offOf(s);
    x += o[0]; y += o[1]; z += o[2];
    const Xf = Math.floor(x), Yf = Math.floor(y), Zf = Math.floor(z), fx = x - Xf, fy = y - Yf, fz = z - Zf;
    const X = Xf & 255, Y = Yf & 255, Z = Zf & 255;
    const u = fade(fx), v = fade(fy), w = fade(fz), gx = fx - 1, gy = fy - 1, gz = fz - 1;
    const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z, B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
    let q;
    q = PERM[AA] % 12; const n000 = GX[q] * fx + GY[q] * fy + GZ[q] * fz;
    q = PERM[BA] % 12; const n100 = GX[q] * gx + GY[q] * fy + GZ[q] * fz;
    q = PERM[AB] % 12; const n010 = GX[q] * fx + GY[q] * gy + GZ[q] * fz;
    q = PERM[BB] % 12; const n110 = GX[q] * gx + GY[q] * gy + GZ[q] * fz;
    q = PERM[AA + 1] % 12; const n001 = GX[q] * fx + GY[q] * fy + GZ[q] * gz;
    q = PERM[BA + 1] % 12; const n101 = GX[q] * gx + GY[q] * fy + GZ[q] * gz;
    q = PERM[AB + 1] % 12; const n011 = GX[q] * fx + GY[q] * gy + GZ[q] * gz;
    q = PERM[BB + 1] % 12; const n111 = GX[q] * gx + GY[q] * gy + GZ[q] * gz;
    const x00 = n000 + (n100 - n000) * u, x10 = n010 + (n110 - n010) * u, x01 = n001 + (n101 - n001) * u, x11 = n011 + (n111 - n011) * u;
    const y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }
  function fbm3(x, y, z, oct, s, ridged) {
    let a = 1, f = 1, sum = 0, nrm = 0;
    for (let o = 0; o < oct; o++) {
      let n = perlin3(x * f, y * f, z * f, s + o * 131);
      if (ridged) { n = 1 - Math.abs(n) * 1.6; n = n * n * 2 - 1; }
      sum += n * a; nrm += a; a *= 0.5; f *= 2;
    }
    return clamp((sum / nrm) * 0.85 + 0.5);
  }
  /* crater field: height offset at a point on the unit sphere (one cell layer) */
  function craters(x, y, z, f, density, s, rim = 1) {
    const X = x * f, Y = y * f, Z = z * f, cx = Math.floor(X), cy = Math.floor(Y), cz = Math.floor(Z);
    let h = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      const ix = cx + i, iy = cy + j, iz = cz + k;
      if (h3(ix, iy, iz, s) > density) continue;
      const px = ix + h3(ix, iy, iz, s + 1), py = iy + h3(ix, iy, iz, s + 2), pz = iz + h3(ix, iy, iz, s + 3);
      const r = 0.15 + 0.35 * h3(ix, iy, iz, s + 4), d = Math.hypot(X - px, Y - py, Z - pz) / r;
      if (d > 1.6) continue;
      // soft bowl + low, wide rim; depth varies per crater so they don't all look stamped in the same way
      const dep = 0.3 + 0.3 * h3(ix, iy, iz, s + 5);
      h += d < 1 ? -Math.pow(1 - d * d, 1.5) * dep : 0;
      h += Math.exp(-(((d - 1) / 0.3) ** 2)) * dep * 0.4 * rim; // rim
    }
    return h;
  }
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  const SURF = ['terran', 'rocky', 'gas', 'lava', 'ice'];

  U.register({
    id: 'planet',
    name: 'Planet',
    desc: 'Lit planets and moons: terran, cratered, gas giant, lava or ice, with clouds, atmosphere, phases and rings',
    uses: ['Distant planet impostors and skybox elements for space games and sci-fi scenes.', 'Planet icons for star maps, galaxy menus and level selection screens.'],
    tags: ['VFX', 'Nature', 'Sci-fi'],
    bg: 'black',
    icon: U.icon('<circle cx="12" cy="12" r="6.5"/><ellipse cx="12" cy="12" rx="10.5" ry="3.2" transform="rotate(-18 12 12)"/>'),
    params: [
      { type: 'section', label: 'Planet' },
      { key: 'surface', label: 'Surface', type: 'select', default: 'terran', options: [['terran', 'Terran (oceans + land)'], ['rocky', 'Rocky / cratered'], ['gas', 'Gas giant (bands)'], ['lava', 'Lava world'], ['ice', 'Ice world']], apply: (v, p) => { if ((v === 'rocky' || v === 'ice') && !(p.craters > 0)) p.craters = 0.6; }, },
      { key: 'size', label: 'Size', type: 'range', min: 0.2, max: 0.98, step: 0.005, default: 0.78, tip: 'Planet diameter as a fraction of the texture (leave room for atmosphere and rings)' },
      { key: 'scale', label: 'Feature scale', type: 'range', min: 0.3, max: 6, step: 0.05, default: 1.6 },
      { key: 'detail', label: 'Detail', type: 'int', min: 2, max: 8, default: 6 },
      { key: 'spin', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: 0, tip: 'Turns the planet around its axis' },
      { key: 'tilt', label: 'Axial tilt', type: 'range', min: -90, max: 90, step: 0.5, default: 18 },
      { key: 'relief', label: 'Relief', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: 'Shading from mountains and craters' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 11 },
      { type: 'section', label: 'Surface' },
      { key: 'sea', label: 'Sea level', type: 'range', min: 0, max: 1, step: 0.01, default: 0.52, show: (p) => p.surface === 'terran' },
      { key: 'ice', label: 'Polar ice', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: (p) => p.surface === 'terran' || p.surface === 'rocky' },
      { key: 'bands', label: 'Bands', type: 'range', min: 2, max: 30, step: 0.5, default: 9, show: (p) => p.surface === 'gas' },
      { key: 'turb', label: 'Turbulence', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: (p) => p.surface === 'gas' },
      { key: 'storm', label: 'Storm spot', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.surface === 'gas' },
      { key: 'craters', label: 'Craters', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Terran planets: only on land, water fills them', show: (p) => p.surface === 'rocky' || p.surface === 'ice' || p.surface === 'terran' },
      { key: 'craterDepth', label: 'Crater depth', type: 'range', min: 0, max: 3, step: 0.01, default: 1, show: (p) => (p.surface === 'rocky' || p.surface === 'ice' || p.surface === 'terran') && p.craters > 0, tip: '0 = flat (craters only change the color), 1 = default, higher = deep bowls with strong shading' },
      { key: 'craterRim', label: 'Rim height', type: 'range', min: 0, max: 3, step: 0.01, default: 1, show: (p) => (p.surface === 'rocky' || p.surface === 'ice' || p.surface === 'terran') && p.craters > 0, tip: 'Height of the raised walls around each crater' },
      { key: 'maria', label: 'Dark plains', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4, show: (p) => p.surface === 'rocky' },
      { key: 'cracks', label: 'Cracks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.surface === 'lava' || p.surface === 'ice' },
      { type: 'section', label: 'Color' },
      { key: 'c1', label: 'Color 1 (deep / low)', type: 'color', default: '#0a2a5a' },
      { key: 'c2', label: 'Color 2', type: 'color', default: '#1e5e9a' },
      { key: 'c3', label: 'Color 3', type: 'color', default: '#4a7a32' },
      { key: 'c4', label: 'Color 4', type: 'color', default: '#8a7a52' },
      { key: 'c5', label: 'Color 5 (high / ice)', type: 'color', default: '#f2f4f6' },
      { key: 'glowColor', label: 'Glow color', type: 'color', default: '#ff6a1a', show: (p) => p.surface === 'lava', tip: 'Emissive lava cracks' },
      { type: 'section', label: 'Clouds & night' },
      { key: 'clouds', label: 'Clouds', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
      { key: 'cloudColor', label: 'Cloud color', type: 'color', default: '#ffffff', show: (p) => p.clouds > 0 },
      { key: 'cloudScale', label: 'Cloud scale', type: 'range', min: 0.3, max: 6, step: 0.05, default: 2, show: (p) => p.clouds > 0 },
      { key: 'cities', label: 'City lights', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.lightMode !== 'ambient', tip: 'Lights on the night side (land only)' },
      { key: 'cityColor', label: 'Light color', type: 'color', default: '#ffc46a', show: (p) => p.cities > 0 && p.lightMode !== 'ambient' },
      { type: 'section', label: 'Lighting' },
      { key: 'lightMode', label: 'Light', type: 'select', default: 'angled', options: [['angled', 'Angled (light angle)'], ['ambient', 'Ambient (soft, no direction)']], tip: 'Ambient: soft light from all around: the whole disc is evenly lit with no night side (so no city lights), only a gentle darkening toward the limb; craters and relief shade evenly' },
      { key: 'lightAngle', label: 'Light direction', type: 'range', min: -180, max: 180, step: 1, default: 35, show: (p) => p.lightMode !== 'ambient', tip: 'Where the light comes from on screen (0 = right, 90 = top)' },
      { key: 'phase', label: 'Phase', type: 'range', min: 0, max: 180, step: 1, default: 55, show: (p) => p.lightMode !== 'ambient', tip: '0 = fully lit (light behind the viewer), 90 = half, 180 = backlit crescent' },
      { key: 'terminator', label: 'Terminator softness', type: 'range', min: 0.01, max: 0.6, step: 0.01, default: 0.12, show: (p) => p.lightMode !== 'ambient' },
      { key: 'ambient', label: 'Night side brightness', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.04, show: (p) => p.lightMode !== 'ambient' },
      { key: 'atm', label: 'Atmosphere', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.6 },
      { key: 'atmColor', label: 'Atmosphere color', type: 'color', default: '#5aa8ff', show: (p) => p.atm > 0 },
      { key: 'atmSize', label: 'Atmosphere thickness', type: 'range', min: 0.01, max: 0.4, step: 0.005, default: 0.06, show: (p) => p.atm > 0, tip: 'Fraction of the radius' },
      { type: 'section', label: 'Rings' },
      { key: 'rings', label: 'Rings', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'ringIn', label: 'Inner radius', type: 'range', min: 1.05, max: 2.5, step: 0.01, default: 1.3, show: (p) => p.rings > 0, tip: '× planet radius' },
      { key: 'ringOut', label: 'Outer radius', type: 'range', min: 1.1, max: 3, step: 0.01, default: 2.1, show: (p) => p.rings > 0 },
      { key: 'ringTilt', label: 'Ring opening', type: 'range', min: 2, max: 90, step: 0.5, default: 18, show: (p) => p.rings > 0, tip: '90 = seen from above (circle), small = nearly edge-on' },
      { key: 'ringColor', label: 'Ring color', type: 'color', default: '#d8c8a8', show: (p) => p.rings > 0 },
      { type: 'section', label: 'Output' },
      { key: 'bgBlack', label: 'Black background', type: 'bool', default: false, tip: 'Off: transparent background' },
    ],
    presets: [
      { name: 'Earth-like', group: 'Realistic', values: { cities: 0.3 } },
      { name: 'Moon', group: 'Realistic', values: { surface: 'rocky', c1: '#4a4a4a', c2: '#8a8a88', c3: '#2e2e30', c4: '#b0aea8', c5: '#d8d6d0', scale: 1.4, craters: 0.75, maria: 0.55, ice: 0, clouds: 0, atm: 0, phase: 70, ambient: 0.02, relief: 0.7 } },
      { name: 'Mars-like', group: 'Realistic', values: { surface: 'rocky', c1: '#5a2a14', c2: '#b05a2a', c3: '#6a3018', c4: '#d08a52', c5: '#f4ece4', scale: 1.6, craters: 0.35, maria: 0.4, ice: 0.18, clouds: 0.08, cloudColor: '#f0d8c0', atm: 0.35, atmColor: '#e8a07a', atmSize: 0.04 } },
      { name: 'Mercury-like', group: 'Realistic', values: { surface: 'rocky', c1: '#3a3634', c2: '#7a726a', c3: '#4a4440', c4: '#9a928a', c5: '#bab2aa', craters: 1, maria: 0.2, ice: 0, clouds: 0, atm: 0, relief: 0.8 } },
      { name: 'Venus-like (clouded)', group: 'Realistic', values: { surface: 'gas', c1: '#c8a060', c2: '#e8c888', c3: '#d8b070', c4: '#f0dca8', c5: '#fff0d0', bands: 6, turb: 0.8, storm: 0, clouds: 0.6, cloudColor: '#fff4dc', atm: 0.7, atmColor: '#ffd8a0' } },
      { name: 'Jupiter-like', group: 'Realistic', values: { surface: 'gas', c1: '#8a5a3a', c2: '#d8b890', c3: '#b8784a', c4: '#efe0c8', c5: '#a86a42', bands: 12, turb: 0.5, storm: 0.7, clouds: 0, atm: 0.3, atmColor: '#e8d0b0', phase: 40 } },
      { name: 'Saturn-like (rings)', group: 'Realistic', values: { surface: 'gas', size: 0.42, c1: '#b8986a', c2: '#e8d4a8', c3: '#c8a878', c4: '#f4e8c8', c5: '#d0b088', bands: 14, turb: 0.25, storm: 0, clouds: 0, atm: 0.25, atmColor: '#f0e0c0', rings: 0.85, ringIn: 1.25, ringOut: 2.25, ringTilt: 22, ringColor: '#dcc8a0', tilt: 10 } },
      { name: 'Neptune-like ice giant', group: 'Realistic', values: { surface: 'gas', c1: '#1a3a9a', c2: '#3a6ad8', c3: '#2a52b8', c4: '#6a9af0', c5: '#9ac0ff', bands: 7, turb: 0.35, storm: 0.45, clouds: 0.15, atm: 0.8, atmColor: '#6aa0ff' } },
      { name: 'Ocean world', group: 'Sci-fi', values: { sea: 0.85, c1: '#062448', c2: '#1a6a9a', c3: '#3a8a4a', clouds: 0.6, atm: 0.8 } },
      { name: 'Desert world', group: 'Sci-fi', values: { sea: 0.08, c1: '#2a3a5a', c2: '#3a5a7a', c3: '#c8965a', c4: '#e8c890', c5: '#f4e4c8', ice: 0.05, clouds: 0.12, cloudColor: '#f0e0c8', atm: 0.45, atmColor: '#f0b878' } },
      { name: 'Ice world', group: 'Sci-fi', values: { surface: 'ice', c1: '#5a8ab0', c2: '#c8e0f0', c3: '#e8f4fa', c4: '#ffffff', c5: '#2a6aa8', craters: 0.25, cracks: 0.6, clouds: 0.15, atm: 0.6, atmColor: '#a8d8ff' } },
      { name: 'Lava world', group: 'Sci-fi', values: { surface: 'lava', c1: '#120806', c2: '#2a1410', c3: '#3a1c14', c4: '#4a2a20', glowColor: '#ff5a10', cracks: 0.6, clouds: 0.15, cloudColor: '#4a3a34', atm: 0.6, atmColor: '#ff6a2a', ambient: 0.02 } },
      { name: 'Toxic world', group: 'Sci-fi', values: { surface: 'gas', c1: '#3a5a0a', c2: '#9ac82a', c3: '#5a8a1a', c4: '#d8f05a', c5: '#2a3a0a', bands: 8, turb: 0.9, storm: 0.3, atm: 1, atmColor: '#b8ff3a', atmSize: 0.1 } },
      { name: 'Alien jungle world', group: 'Sci-fi', values: { sea: 0.45, c1: '#1a0a3a', c2: '#4a2a8a', c3: '#7a2a8a', c4: '#c84a8a', c5: '#f0d0ff', clouds: 0.35, cloudColor: '#f0e0ff', atm: 0.9, atmColor: '#d07aff', cities: 0.2, cityColor: '#7affd8' } },
      { name: 'Dead red giant moon', group: 'Sci-fi', values: { surface: 'rocky', c1: '#3a0a0a', c2: '#8a2a1a', c3: '#2a0606', c4: '#c8584a', c5: '#e8b0a0', craters: 0.9, maria: 0.6, ice: 0, clouds: 0, atm: 0.2, atmColor: '#ff4a2a', phase: 110 } },
      { name: 'Crescent (backlit)', group: 'Stylized', values: { phase: 150, atm: 1.2, atmSize: 0.08, cities: 0.6 } },
      { name: 'Cartoon planet', group: 'Stylized', values: { detail: 3, scale: 1.1, c1: '#2a6ad8', c2: '#4a9af0', c3: '#4ac85a', c4: '#2a8a3a', c5: '#ffffff', relief: 0, terminator: 0.04, ambient: 0.18, clouds: 0.35, atm: 0.5 } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H), R = (S / 2) * p.size, cx = W / 2, cy = H / 2;
      const img = ctx.createImageData(W, H), d = img.data, seed = p.seed | 0;
      const C = [p.c1, p.c2, p.c3, p.c4, p.c5].map(U.hex), cloudC = U.hex(p.cloudColor), atmC = U.hex(p.atmColor), cityC = U.hex(p.cityColor), glowC = U.hex(p.glowColor), ringC = U.hex(p.ringColor);
      // light: screen x right, y up, z toward the viewer
      const la = p.lightAngle * RAD, ph = p.phase * RAD, L = [Math.sin(ph) * Math.cos(la), Math.sin(ph) * Math.sin(la), Math.cos(ph)];
      // ambient light (from all around): an evenly lit disc with no terminator / night side. City lights only
      // exist on the night side, so they are off; lava glows evenly; relief shades by cavity, not by direction
      const ambient = p.lightMode === 'ambient';
      const tz = p.tilt * RAD, sp = p.spin * RAD, ctz = Math.cos(tz), stz = Math.sin(tz), csp = Math.cos(sp), ssp = Math.sin(sp);
      const toPlanet = (x, y, z) => {
        // undo the axial tilt (around the view axis), then spin around the planet's own axis
        const x1 = x * ctz + y * stz, y1 = -x * stz + y * ctz;
        return [x1 * csp + z * ssp, y1, -x1 * ssp + z * csp];
      };
      const sc = p.scale, oct = p.detail;
      const rt = Math.max(0.02, Math.sin(p.ringTilt * RAD)), rct = Math.cos(p.ringTilt * RAD);

      /* albedo + emissive + height at planet-space point q */
      const surf = (q) => {
        const [x, y, z] = q;
        let col, emit = null, h = 0, land = 0;
        switch (p.surface) {
          case 'terran': {
            const w = fbm3(x * sc + 7, y * sc, z * sc, 2, seed + 5) - 0.5;
            h = fbm3(x * sc + w, y * sc + w, z * sc, oct, seed);
            if (h < p.sea) { const t = clamp(1 - (p.sea - h) / 0.18); col = mix3(C[0], C[1], t * t); }
            else {
              const t = clamp((h - p.sea) / Math.max(0.01, 1 - p.sea) * 2.2); land = 1;
              col = t < 0.5 ? mix3(C[2], C[3], t * 2) : mix3(C[3], C[4], clamp((t - 0.5) * 2) ** 2);
            }
            const coast = smoothstep(p.sea, p.sea + 0.04, h); // 0 in the water, 1 a little inland
            // relief height: a smooth, unwarped version of the terrain with flat oceans (the warped color
            // field would shade into streaks)
            h = Math.max(p.sea, fbm3(x * sc, y * sc, z * sc, Math.max(2, oct - 2), seed));
            // craters only on land (water fills / hides them), fading out at the coast
            if (p.craters > 0 && coast > 0) {
              const rim = p.craterRim ?? 1, cd = p.craterDepth ?? 1;
              const cr = (craters(x, y, z, sc * 3, p.craters * 0.5, seed + 21, rim) + craters(x, y, z, sc * 9, p.craters * 0.45, seed + 22, rim) * 0.3) * cd * coast;
              h += cr * 0.35;
              col = col.map((v, i) => v * (1 + cr * 0.12) + (C[3][i] - v) * clamp(cr) * 0.12);
            }
            break;
          }
          case 'rocky':
          case 'ice': {
            const n = fbm3(x * sc, y * sc, z * sc, oct, seed);
            col = mix3(C[0], C[1], n);
            if (p.surface === 'rocky' && p.maria > 0) { const m = smoothstep(0.55 - p.maria * 0.2, 0.65 - p.maria * 0.15, fbm3(x * sc * 0.5 + 3, y * sc * 0.5, z * sc * 0.5, 3, seed + 9)); col = mix3(col, C[2], m * 0.8); }
            if (p.surface === 'ice') { const c = fbm3(x * sc * 2, y * sc * 2, z * sc * 2, 4, seed + 13, true); const cr = smoothstep(0.75 - p.cracks * 0.25, 0.9, c); col = mix3(mix3(C[1], C[2], n), C[4], cr * 0.85); }
            h = n * 0.3;
            if (p.craters > 0) {
              // crater depth scales bowls and rims (rims also by their own height)
              const rim = p.craterRim ?? 1, cd = p.craterDepth ?? 1;
              const cr = (craters(x, y, z, sc * 3, p.craters * 0.5, seed + 21, rim) + craters(x, y, z, sc * 9, p.craters * 0.45, seed + 22, rim) * 0.3) * cd;
              h += cr * 0.35;
              col = col.map((v, i) => v * (1 + cr * 0.12) + (C[3][i] - v) * clamp(cr) * 0.12);
            }
            break;
          }
          case 'gas': {
            const t = fbm3(x * sc * 1.5, y * sc * 6, z * sc * 1.5, Math.min(oct, 5), seed + 3);
            let lat = y + (t - 0.5) * p.turb * 0.35 + (fbm3(x * 4, y * 18, z * 4, 3, seed + 4) - 0.5) * p.turb * 0.05;
            // storm: an oval vortex at a fixed spot
            if (p.storm > 0) {
              const sx = x - 0.55, sy = y + 0.28, sz = z - 0.78, ds = Math.hypot(sx / 0.22, sy / 0.11, sz / 0.22);
              if (ds < 1) { const s = (1 - ds) * p.storm; lat += Math.sin(ds * 9) * 0.03 * s; }
            }
            const b = 0.5 + 0.5 * Math.sin(lat * p.bands * Math.PI), b2 = 0.5 + 0.5 * Math.sin(lat * p.bands * 2.3 * Math.PI + 1.3);
            col = mix3(mix3(C[0], C[1], b), mix3(C[2], C[3], b2), 0.5 + (t - 0.5) * 0.6);
            if (p.storm > 0) {
              const ds = Math.hypot((x - 0.55) / 0.2, (y + 0.28) / 0.1, (z - 0.78) / 0.2);
              if (ds < 1) col = mix3(col, C[4], (1 - ds) * p.storm);
            }
            h = t * 0.1;
            break;
          }
          case 'lava': {
            const n = fbm3(x * sc, y * sc, z * sc, oct, seed);
            col = mix3(C[0], mix3(C[2], C[3], n), n);
            const c = fbm3(x * sc * 1.6, y * sc * 1.6, z * sc * 1.6, 5, seed + 17, true);
            const g = smoothstep(0.82 - p.cracks * 0.3, 0.95, c);
            emit = glowC.map((v) => v * g * 1.2);
            col = mix3(col, C[1], g * 0.5);
            h = n * 0.4 - g * 0.2;
            break;
          }
        }
        // polar ice
        if (p.ice > 0 && (p.surface === 'terran' || p.surface === 'rocky') && Math.abs(y) > 1 - p.ice * 0.55 - 0.12) {
          const lim = 1 - p.ice * 0.55 + (fbm3(x * 4, y * 4, z * 4, 3, seed + 31) - 0.5) * 0.15;
          const ic = smoothstep(lim - 0.03, lim + 0.03, Math.abs(y));
          col = mix3(col, C[4], ic); if (ic > 0.5) land = 0;
        }
        return { col, emit, h, land };
      };

      /* pass 1: surface, clouds and city lights for every pixel on the disc. The surface height goes into a
         buffer, so the relief shading (pass 2) compares neighbouring pixels instead of evaluating the
         whole surface a second time */
      const N = W * H, INS = new Uint8Array(N), HB = new Float32Array(N), COL = new Float32Array(N * 3);
      const EM = p.surface === 'lava' ? new Float32Array(N * 3) : null, CA = new Float32Array(N), CT = new Float32Array(N);
      const L0 = L[0], L1 = L[1], L2 = L[2];
      for (let py = 0, j = 0; py < H; py++) {
        for (let px = 0; px < W; px++, j++) {
          const x = (px + 0.5 - cx) / R, y = -(py + 0.5 - cy) / R, r2 = x * x + y * y;
          if (r2 >= 1) continue;
          const z = Math.sqrt(1 - r2), q = toPlanet(x, y, z), sf = surf(q), k3 = j * 3;
          INS[j] = 1; HB[j] = sf.h;
          COL[k3] = sf.col[0]; COL[k3 + 1] = sf.col[1]; COL[k3 + 2] = sf.col[2];
          if (EM && sf.emit) { EM[k3] = sf.emit[0]; EM[k3 + 1] = sf.emit[1]; EM[k3 + 2] = sf.emit[2]; }
          let land = sf.land;
          if (p.clouds > 0) {
            const cs = p.cloudScale, w = fbm3(q[0] * cs + 13, q[1] * cs, q[2] * cs, 2, seed + 41) - 0.5;
            const cn = fbm3(q[0] * cs * 1.5 + w, q[1] * cs * 2.2 + w, q[2] * cs * 1.5, 4, seed + 42);
            const ca = smoothstep(0.62 - p.clouds * 0.25, 0.8 - p.clouds * 0.2, cn) * Math.min(1, p.clouds * 1.4);
            CA[j] = ca; land *= 1 - ca;
          }
          if (p.cities > 0 && land > 0.5 && !ambient) {
            const night = 1 - smoothstep(-0.05, 0.15, x * L0 + y * L1 + z * L2);
            if (night > 0) {
              const cn = fbm3(q[0] * 30, q[1] * 30, q[2] * 30, 2, seed + 51), ct = fbm3(q[0] * 4, q[1] * 4, q[2] * 4, 2, seed + 52);
              CT[j] = smoothstep(0.62, 0.72, cn) * smoothstep(0.45, 0.6, ct) * p.cities * night;
            }
          }
        }
      }
      // height between pixel centres (bilinear); off the disc it falls back to the pixel's own height
      const hAt = (fx, fy, fb) => {
        const x0 = Math.floor(fx - 0.5), y0 = Math.floor(fy - 0.5), tx = fx - 0.5 - x0, ty = fy - 0.5 - y0;
        if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) return fb;
        const k = y0 * W + x0;
        if (!INS[k] || !INS[k + 1] || !INS[k + W] || !INS[k + W + 1]) return fb;
        const a = HB[k] + (HB[k + 1] - HB[k]) * tx, b = HB[k + W] + (HB[k + W + 1] - HB[k + W]) * tx;
        return a + (b - a) * ty;
      };

      /* pass 2: lighting, relief, clouds, lights, atmosphere, rings */
      const relief = p.relief > 0 && p.surface !== 'gas', e = 0.01;
      for (let py = 0, j = 0, i = 0; py < H; py++) {
        for (let px = 0; px < W; px++, j++, i += 4) {
          const x = (px + 0.5 - cx) / R, y = -(py + 0.5 - cy) / R, r2 = x * x + y * y, r = Math.sqrt(r2);
          let cr = 0, cg = 0, cb = 0, a = 0, planetZ = -1e9;
          if (INS[j]) {
            const z = Math.sqrt(1 - r2), nl = x * L0 + y * L1 + z * L2, k3 = j * 3;
            planetZ = z;
            // ambient: only a gentle darkening toward the limb (centre ≈ the lit side in angled mode)
            let shade = ambient ? 0.9 * Math.max(0.5, 1 - (1 - z * z) * 0.45) : smoothstep(-p.terminator, p.terminator, nl) * (0.35 + 0.65 * Math.max(0, nl));
            if (relief && ambient) {
              // ambient relief: lower than the surroundings (crater bowls, valleys) = darker, ridges a little brighter
              const s = e * R * 1.5, h0 = HB[j];
              const hm = (hAt(px + 0.5 + s, py + 0.5, h0) + hAt(px + 0.5 - s, py + 0.5, h0) + hAt(px + 0.5, py + 0.5 + s, h0) + hAt(px + 0.5, py + 0.5 - s, h0)) / 4;
              shade *= clamp(1 + (h0 - hm) * p.relief * 50, 0.5, 1.3);
            } else if (relief) {
              // relief: compare the height a little toward the light (the same step on the sphere, read from the buffer)
              const tx = L0 - x * nl, ty = L1 - y * nl, tzv = L2 - z * nl, tl = Math.hypot(tx, ty, tzv) || 1;
              const h2 = hAt(px + 0.5 + (tx / tl) * e * R, py + 0.5 - (ty / tl) * e * R, HB[j]);
              shade *= clamp(1 + (h2 - HB[j]) * p.relief * 40, 0.4, 1.6);
            }
            const lit = ambient ? shade : p.ambient + (1 - p.ambient) * shade; // no night side to brighten in ambient
            cr = COL[k3] * lit; cg = COL[k3 + 1] * lit; cb = COL[k3 + 2] * lit;
            const ca = CA[j];
            if (ca > 0) { cr = lerp(cr, cloudC[0] * lit, ca); cg = lerp(cg, cloudC[1] * lit, ca); cb = lerp(cb, cloudC[2] * lit, ca); }
            const ct = CT[j];
            if (ct > 0) { cr += cityC[0] * ct; cg += cityC[1] * ct; cb += cityC[2] * ct; }
            if (EM) {
              const night = 1 - smoothstep(-0.05, 0.15, nl), em = ambient ? 0.55 : 0.4 + 0.6 * night;
              cr += EM[k3] * em; cg += EM[k3 + 1] * em; cb += EM[k3 + 2] * em;
            }
            // atmosphere: fresnel rim, scattering on the lit side
            if (p.atm > 0) {
              const fres = Math.pow(1 - z, 3) * p.atm, sl = ambient ? 0.65 : smoothstep(-0.3, 0.5, nl), fk = fres * (0.15 + sl), hz = p.atm * 0.12 * sl * (1 - z);
              cr = lerp(cr + atmC[0] * fk, atmC[0], hz); cg = lerp(cg + atmC[1] * fk, atmC[1], hz); cb = lerp(cb + atmC[2] * fk, atmC[2], hz);
            }
            a = 1;
          } else if (p.atm > 0 && r < 1 + p.atmSize && r2 >= 1) {
            // outer glow beyond the limb, brighter where the limb faces the light
            const t = (r - 1) / p.atmSize, nl = (x / r) * L0 + (y / r) * L1;
            const g = Math.pow(1 - t, 2.2) * p.atm * (0.12 + (ambient ? 0.6 : smoothstep(-0.35, 0.45, nl + L2 * 0.3))); // ambient: even all round
            cr = atmC[0]; cg = atmC[1]; cb = atmC[2]; a = clamp(g);
          }
          // rings: plane through the center, tilted toward the viewer
          if (p.rings > 0) {
            const w = -y / rt, rr = Math.hypot(x, w);
            if (rr > p.ringIn && rr < p.ringOut) {
              const ringZ = -w * rct;
              const front = ringZ > planetZ || r2 >= 1;
              const behindPlanet = r2 < 1 && !front;
              if (!behindPlanet) {
                const t = (rr - p.ringIn) / (p.ringOut - p.ringIn);
                const band = 0.55 + 0.45 * Math.sin(t * 42 + Math.sin(t * 9) * 3) * (0.6 + 0.4 * U.hash(Math.floor(t * 60), 1, seed));
                let ra = p.rings * band * smoothstep(0, 0.06, t) * smoothstep(1, 0.9, t);
                if (Math.abs(t - 0.62) < 0.025) ra *= 0.15; // a gap
                // the planet's shadow on the far part of the rings: points behind the planet on the side away from the light
                const along = x * L0 + y * L1, perp = Math.hypot(x - L0 * along, y - L1 * along);
                const inShadow = !ambient && ringZ < 0 && along < 0 && perp < 1; // ambient: no planet shadow on the rings
                const rl = (inShadow ? 0.25 : 1) * (ambient ? 0.85 : 0.35 + 0.65 * Math.max(0.2, L2 * 0.5 + 0.5));
                const rr0 = ringC[0] * rl, rg0 = ringC[1] * rl, rb0 = ringC[2] * rl;
                // straight (un-premultiplied) color: over nothing the ring keeps its own color
                if (a <= 0) { cr = rr0; cg = rg0; cb = rb0; a = ra; }
                else { cr = lerp(cr, rr0, ra); cg = lerp(cg, rg0, ra); cb = lerp(cb, rb0, ra); a = a + ra * (1 - a); }
              }
            }
          }
          if (p.bgBlack) { d[i] = cr * a; d[i + 1] = cg * a; d[i + 2] = cb * a; d[i + 3] = 255; }
          else { d[i] = cr; d[i + 1] = cg; d[i + 2] = cb; d[i + 3] = a * 255; }
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  });
})();
