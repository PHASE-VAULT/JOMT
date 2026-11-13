/* Motion-blurred rotor (helicopter / propeller). For every pixel the opacity is the time-weighted
   fraction of the blur window during which a blade covered it: the leading edge stays crisp, the
   trail fades with a falloff curve, and a full sweep turns into the familiar translucent disc. */
(function () {
  'use strict';
  const U = window.UGTG;
  const TAU = Math.PI * 2;

  // ∫ (1 - s/S)^p ds from a to b, 0 <= a <= b <= S
  const trail = (a, b, S, p) => (S / (p + 1)) * (Math.pow(1 - a / S, p + 1) - Math.pow(1 - b / S, p + 1));

  U.register({
    id: 'rotor',
    name: 'Rotor Blur',
    desc: 'Spinning helicopter / propeller blades with motion blur',
    tags: ['VFX', 'Vehicles'],
    bg: 'gray',
    icon: U.icon('<circle cx="12" cy="12" r="1.8"/><path d="M12 12L21 9.5M12 12L3 14.5"/><path d="M20.5 6.5A9 9 0 0 1 21 12M3.5 17.5A9 9 0 0 1 3 12" opacity=".5"/>'),
    params: [
      { type: 'section', label: 'Rotor' },
      { key: 'blades', label: 'Blades', type: 'int', min: 1, max: 10, default: 4 },
      { key: 'length', label: 'Blade length', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.95 },
      { key: 'chord', label: 'Blade width', type: 'range', min: 0.01, max: 0.4, step: 0.005, default: 0.07 },
      { key: 'taper', label: 'Taper', type: 'range', min: 0, max: 0.9, step: 0.01, default: 0.2 },
      { key: 'curve', label: 'Blade curve', type: 'range', min: -1, max: 1, step: 0.01, default: 0, tip: 'Scimitar / swept blades' },
      { key: 'hub', label: 'Hub size', type: 'range', min: 0, max: 0.4, step: 0.005, default: 0.07 },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: 20 },

      { type: 'section', label: 'Motion blur', active: (p) => p.blur > 0 || p.rings > 0 },
      { key: 'blur', label: 'Blur angle', type: 'range', min: 0, max: 350, step: 1, default: 75, tip: 'How far each blade sweeps during the exposure (degrees)' },
      { key: 'falloff', label: 'Trail falloff', type: 'range', min: 0, max: 6, step: 0.05, default: 1.5, tip: '0 = even smear, higher = sharp leading edge with a fading tail' },
      { key: 'density', label: 'Density', type: 'range', min: 0.2, max: 4, step: 0.01, default: 1.3, tip: 'Artistic boost for faint, fast blurs' },
      { key: 'dir', label: 'Spin direction', type: 'select', default: 'ccw', options: [['ccw', 'Counter-clockwise'], ['cw', 'Clockwise']] },
      { key: 'rings', label: 'Ring streaks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: 'ringScale', label: 'Ring frequency', type: 'int', min: 2, max: 80, default: 24, show: (p) => p.rings > 0 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 3, show: (p) => p.rings > 0 },

      { type: 'section', label: 'Look' },
      { key: 'bladeColor', label: 'Blade color', type: 'color', default: '#141414' },
      { key: 'tipStripe', label: 'Painted tips', type: 'bool', default: false },
      { key: 'tipColor', label: 'Tip color', type: 'color', default: '#e8c31a', show: (p) => p.tipStripe },
      { key: 'tipLen', label: 'Tip length', type: 'range', min: 0.01, max: 0.4, step: 0.005, default: 0.07, show: (p) => p.tipStripe },
      { key: 'hubColor', label: 'Hub color', type: 'color', default: '#2b2b2b', show: (p) => p.hub > 0 },
      { key: 'tilt', label: 'View tilt', type: 'range', min: 0.1, max: 1, step: 0.01, default: 1, tip: '1 = seen from straight above, lower = seen at an angle' },
      { key: 'bgMode', label: 'Background', type: 'select', default: 'transparent', options: [['transparent', 'Transparent'], ['color', 'Solid color']] },
      { key: 'bgColor', label: 'Background color', type: 'color', default: '#8fa3b0', show: (p) => p.bgMode === 'color' },
    ],
    presets: [
      // Realistic
      { name: 'Light helicopter (2 blades)', group: 'Realistic', values: { blades: 2, length: 0.96, chord: 0.07, taper: 0.1, hub: 0.06, blur: 70, falloff: 1.8, density: 3, rings: 0.2 } },
      { name: 'Utility helicopter (4 blades)', group: 'Realistic', values: { blades: 4, chord: 0.075, taper: 0.15, curve: 0.08, hub: 0.08, blur: 70, falloff: 1.6, density: 2.6, rings: 0.25 } },
      { name: 'Attack helicopter', group: 'Realistic', values: { blades: 4, chord: 0.065, taper: 0.1, hub: 0.09, blur: 55, falloff: 2.2, density: 2.8, rings: 0.15, bladeColor: '#202418', hubColor: '#2a2e22' } },
      { name: 'Heavy transport (7 blades)', group: 'Realistic', values: { blades: 7, chord: 0.08, taper: 0.1, hub: 0.12, blur: 45, falloff: 1.4, density: 2, rings: 0.3, tipStripe: true, tipLen: 0.04 } },
      { name: 'Tandem rotor (3 blades, painted tips)', group: 'Realistic', values: { blades: 3, chord: 0.09, taper: 0.05, hub: 0.07, blur: 70, falloff: 1.4, density: 2.4, rings: 0.2, tipStripe: true, tipLen: 0.06, bladeColor: '#2a2a2a' } },
      { name: 'Tail rotor (full disc)', group: 'Realistic', values: { blades: 4, length: 0.9, chord: 0.2, taper: 0, hub: 0.12, blur: 300, falloff: 0.4, density: 3, rings: 0.35, ringScale: 12, tipStripe: true, tipColor: '#e8e8e8', tipLen: 0.1 } },
      { name: 'Propeller plane (3 blades)', group: 'Realistic', values: { blades: 3, length: 0.9, chord: 0.2, taper: 0.45, curve: 0.15, hub: 0.15, blur: 160, falloff: 1, density: 3, rings: 0.3, tipStripe: true, tipLen: 0.08, hubColor: '#c8c8c8' } },
      { name: 'WWII fighter prop', group: 'Realistic', values: { blades: 4, length: 0.92, chord: 0.22, taper: 0.4, hub: 0.18, blur: 220, falloff: 0.8, density: 3.5, rings: 0.4, ringScale: 30, tipStripe: true, tipLen: 0.06, bladeColor: '#101010', hubColor: '#b02020' } },
      { name: 'Quadcopter prop', group: 'Realistic', values: { blades: 2, length: 0.95, chord: 0.18, taper: 0.6, curve: 0.35, hub: 0.12, blur: 140, falloff: 1.2, density: 3, rings: 0.15, bladeColor: '#d8d8d8', hubColor: '#202020' } },
      { name: 'Desk fan', group: 'Realistic', values: { blades: 5, length: 0.9, chord: 0.38, taper: 0, curve: 0.5, hub: 0.18, blur: 90, falloff: 0.8, density: 1, rings: 0, bladeColor: '#9fc6e8', hubColor: '#e8e8e8', bgMode: 'color', bgColor: '#e7ebee' } },
      { name: 'Ceiling fan (slow)', group: 'Realistic', values: { blades: 5, length: 0.95, chord: 0.2, taper: 0, hub: 0.14, blur: 25, falloff: 2, density: 1, rings: 0, bladeColor: '#6b4424', hubColor: '#c0a060' } },
      { name: 'Seen at an angle', group: 'Realistic', values: { blades: 4, chord: 0.08, hub: 0.07, blur: 70, falloff: 1.4, density: 3, rings: 0.25, tilt: 0.35 } },
      // Stylized
      { name: 'Cartoon spin disc', group: 'Stylized', values: { blades: 3, chord: 0.2, taper: 0, hub: 0.1, blur: 350, falloff: 0, density: 4, rings: 0.7, ringScale: 8, bladeColor: '#2a2a3a', hubColor: '#ff4a3a' } },
      { name: 'Speed-line streaks', group: 'Stylized', values: { blades: 2, chord: 0.16, taper: 0, hub: 0.06, blur: 330, falloff: 0.3, density: 4, rings: 0.85, ringScale: 50, seed: 9, bladeColor: '#202020' } },
      { name: 'Toon blades (no blur)', group: 'Stylized', values: { blades: 3, length: 0.9, chord: 0.2, taper: 0.5, curve: 0.3, hub: 0.15, blur: 0, rings: 0, bladeColor: '#ffc83a', hubColor: '#3a3a3a', tipStripe: true, tipColor: '#e23a2a', tipLen: 0.15 } },
      { name: 'Soft ghost blur', group: 'Stylized', values: { blades: 4, chord: 0.1, taper: 0.2, hub: 0.05, blur: 200, falloff: 3, density: 2, rings: 0, bladeColor: '#ffffff', hubColor: '#ffffff' } },
      // Game-inspired
      { name: 'Battlefield-style attack heli rotor', group: 'Game-inspired', values: { blades: 4, chord: 0.07, taper: 0.1, curve: 0.1, hub: 0.09, blur: 120, falloff: 1.2, density: 3.2, rings: 0.4, ringScale: 30, bladeColor: '#1c1f18' } },
      { name: 'Arma-style transport rotor', group: 'Game-inspired', values: { blades: 4, chord: 0.085, taper: 0.1, hub: 0.1, blur: 120, falloff: 1, density: 3, rings: 0.3, tipStripe: true, tipLen: 0.03, tilt: 0.6 } },
      { name: 'CoD-style Little Bird rotor', group: 'Game-inspired', values: { blades: 5, length: 0.9, chord: 0.06, taper: 0.1, hub: 0.07, blur: 80, falloff: 2, density: 2.8, rings: 0.2, bladeColor: '#101010' } },
      // Sci-fi
      { name: 'Ducted VTOL fan', group: 'Sci-fi', values: { blades: 10, length: 0.85, chord: 0.12, taper: 0, curve: 0.4, hub: 0.25, blur: 30, falloff: 2, density: 1.2, rings: 0, bladeColor: '#5a6470', hubColor: '#1c2026' } },
      { name: 'Energy rotor (cyan)', group: 'Sci-fi', values: { blades: 3, chord: 0.08, taper: 0.4, curve: 0.6, hub: 0.12, blur: 240, falloff: 2.5, density: 4, rings: 0.4, ringScale: 40, bladeColor: '#3af0ff', hubColor: '#e8ffff' } },
      { name: 'Alien turbine (violet)', group: 'Sci-fi', values: { blades: 6, length: 0.9, chord: 0.15, taper: 0.8, curve: -0.9, hub: 0.2, blur: 60, falloff: 3, density: 1.6, rings: 0.2, bladeColor: '#8a3aff', hubColor: '#2a0a4a', tipStripe: true, tipColor: '#ff7ae8', tipLen: 0.2 } },
      { name: 'Hover drone (neon tips)', group: 'Sci-fi', values: { blades: 2, chord: 0.14, taper: 0.5, curve: 0.3, hub: 0.1, blur: 300, falloff: 1.5, density: 3.5, rings: 0.3, bladeColor: '#1a1a22', hubColor: '#0a0a10', tipStripe: true, tipColor: '#3aff8c', tipLen: 0.12 } },
    ],
    render(ctx, W, H, p) {
      const Sz = Math.min(W, H), N = p.blades, Lr = p.length, sign = p.dir === 'cw' ? -1 : 1;
      const S = Math.max(1e-4, (p.blur * Math.PI) / 180), fp = p.falloff, norm = S / (fp + 1);
      const base = (p.rotation * Math.PI) / 180;
      const bc = U.hex(p.bladeColor), tc = U.hex(p.tipColor), hc = U.hex(p.hubColor), bg = U.hex(p.bgColor);
      const solidBg = p.bgMode === 'color';
      const px = 2 / Sz; // one pixel in normalized units (for edge anti-aliasing)
      U.pixels(ctx, W, H, (x, y, o) => {
        const nx = (x + 0.5 - W / 2) / (Sz / 2), ny = (y + 0.5 - H / 2) / (Sz / 2) / p.tilt;
        const r = Math.hypot(nx, ny);
        let a = 0, col = bc;
        if (r < Lr + px && r > 1e-6) {
          const th = Math.atan2(ny, nx), t = r / Lr;
          // blade half-width as an angle; chord is in world units so it narrows angularly with radius
          const c = p.chord * (1 - p.taper * t);
          const w = Math.atan(c / 2 / r);
          const bend = p.curve * t * t * 0.9;
          let cov = 0;
          for (let i = 0; i < N; i++) {
            const ai = base + (i * TAU) / N + bend;
            // angular lag behind the blade's current (leading) position, in the spin direction
            let d = sign * (ai - th);
            d = U.mod(d + w, TAU) - w;
            const lo = Math.max(0, d - w), hi = Math.min(S, d + w);
            if (hi > lo) cov += trail(lo, hi, S, fp) / norm;
          }
          a = U.clamp(cov * (p.blur > 0 ? p.density : 1));
          a *= 1 - U.smoothstep(Lr - px, Lr + px, r); // soft tip edge
          if (p.rings > 0) {
            const n = U.fractal('perlin', r * p.ringScale, 0.5, 0, 0, 2, 0.5, 'fbm', p.seed);
            a *= 1 - p.rings * U.smoothstep(0.35, 0.75, n);
          }
          if (p.tipStripe && r > Lr * (1 - p.tipLen)) col = tc;
        }
        if (p.hub > 0) {
          const hcov = 1 - U.smoothstep(p.hub - px, p.hub + px, r);
          if (hcov > 0) { a = U.screen(a, hcov); if (hcov > 0.5) col = hc; }
        }
        if (solidBg) {
          o[0] = bg[0] + (col[0] - bg[0]) * a; o[1] = bg[1] + (col[1] - bg[1]) * a; o[2] = bg[2] + (col[2] - bg[2]) * a;
        } else { o[0] = col[0]; o[1] = col[1]; o[2] = col[2]; o[3] = a * 255; }
      });
    },
  });
})();
