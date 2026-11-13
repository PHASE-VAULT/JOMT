/* Light cone: the light shape a lamp throws onto a nearby surface, for emissive "fake light" textures
   (e.g. a desk lamp lighting the wall behind it). White intensity only, meant to be tinted in engine.
   Angular profile: full brightness inside the inner cone, fading to 0 at the outer cone; softness
   shapes that transition. Distance falloff: a curve that reaches 0 at the range, or physical
   inverse-square with a range window. */
(function () {
  'use strict';
  const U = window.UGTG;
  const DEG = Math.PI / 180;
  const isInv = (p) => p.falloffMode === 'inverse';

  U.register({
    id: 'lightCone',
    name: 'Light Cone',
    desc: 'Emissive light shape of a lamp on a nearby surface: inner / outer cone, softness, falloff',
    tags: ['Lighting', 'VFX'],
    bg: 'black',
    icon: U.icon('<path d="M9 3h6l-1 3h-4z"/><path d="M10 6L4 21h16L14 6"/>'),
    params: [
      { type: 'section', label: 'Source' },
      { key: 'srcX', label: 'Source X', type: 'range', min: 0, max: 1, step: 0.005, default: 0.5 },
      { key: 'srcY', label: 'Source Y', type: 'range', min: 0, max: 1, step: 0.005, default: 0.02 },
      { key: 'angle', label: 'Direction', type: 'range', min: -180, max: 180, step: 1, default: 90, tip: '0 = right, 90 = down, −90 = up' },
      { key: 'opening', label: 'Lamp opening', type: 'range', min: 0, max: 0.8, step: 0.005, default: 0.06, tip: 'Width of the lamp shade opening, in texture sizes. 0 = point source' },
      { key: 'mirror', label: 'Both directions (sconce)', type: 'bool', default: false, tip: 'Adds the same cone pointing the opposite way, like an up/down wall sconce' },
      { type: 'section', label: 'Cone' },
      { key: 'inner', label: 'Inner cone', type: 'range', min: 0, max: 179, step: 0.5, default: 40, tip: 'Full angle with full brightness' },
      { key: 'outer', label: 'Outer cone', type: 'range', min: 1, max: 179, step: 0.5, default: 90, tip: 'Full angle where the light reaches 0' },
      { key: 'softness', label: 'Edge softness', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, tip: '0 = stays bright until the outer cone, then a crisp edge. 1 = starts fading right at the inner cone' },
      { type: 'section', label: 'Falloff' },
      { key: 'falloffMode', label: 'Falloff', type: 'select', default: 'curve', options: [['curve', 'Curve to range'], ['inverse', 'Inverse square (physical)']] },
      { key: 'range', label: 'Range', type: 'range', min: 0.05, max: 2, step: 0.01, default: 1, tip: 'Distance where the light reaches 0. 1 = the texture size' },
      { key: 'falloff', label: 'Falloff curve', type: 'range', min: 0, max: 5, step: 0.01, default: 1.4, show: (p) => !isInv(p), tip: '0 = no falloff until the range, 1 = linear, higher = drops sooner' },
      { key: 'hotspot', label: 'Hotspot size', type: 'range', min: 0.005, max: 0.5, step: 0.005, default: 0.06, show: isInv, tip: 'Distance where inverse-square brightness starts to drop (avoids an infinite point)' },
      { type: 'section', label: 'Output' },
      { key: 'brightness', label: 'Brightness', type: 'range', min: 0.1, max: 4, step: 0.01, default: 1 },
      { key: 'gamma', label: 'Gamma', type: 'range', min: 0.3, max: 3, step: 0.01, default: 1 },
      { key: 'output', label: 'Output', type: 'select', default: 'black', options: [['black', 'White on black (emissive / additive)'], ['alpha', 'White + alpha']] },
      { key: 'dither', label: 'Dither (no banding)', type: 'bool', default: true, tip: 'Adds ±½ step of noise so smooth gradients don\'t band in 8 bit' },
    ],
    presets: [
      // Realistic
      { name: 'Desk lamp on wall', group: 'Realistic', values: { srcY: 0.02, angle: 90, opening: 0.1, inner: 50, outer: 105, softness: 0.55, range: 0.95, falloff: 1.3 } },
      { name: 'Desk lamp, close to wall', group: 'Realistic', values: { srcY: 0.04, angle: 90, opening: 0.12, inner: 70, outer: 140, softness: 0.6, range: 0.75, falloff: 1.8 } },
      { name: 'Wall sconce (up & down)', group: 'Realistic', values: { srcY: 0.5, angle: -90, mirror: true, opening: 0.08, inner: 30, outer: 80, softness: 0.55, range: 0.55, falloff: 1.4 } },
      { name: 'Wall sconce (down)', group: 'Realistic', values: { srcY: 0.15, angle: 90, opening: 0.1, inner: 40, outer: 95, softness: 0.5, range: 0.9, falloff: 1.5 } },
      { name: 'Wall washer (up)', group: 'Realistic', values: { srcY: 0.98, angle: -90, opening: 0.12, inner: 60, outer: 120, softness: 0.65, range: 1, falloff: 1.6 } },
      { name: 'Picture light', group: 'Realistic', values: { srcY: 0.02, angle: 90, opening: 0.4, inner: 90, outer: 150, softness: 0.7, range: 0.6, falloff: 1.8 } },
      { name: 'Ceiling downlight (physical)', group: 'Realistic', values: { srcY: 0.01, angle: 90, opening: 0.04, inner: 60, outer: 110, softness: 0.6, falloffMode: 'inverse', range: 1.1, hotspot: 0.08, brightness: 1.2 } },
      { name: 'Narrow spotlight', group: 'Realistic', values: { srcY: 0.02, angle: 90, opening: 0.02, inner: 14, outer: 30, softness: 0.4, range: 1.2, falloff: 0.7 } },
      { name: 'Theater spot (crisp)', group: 'Realistic', values: { srcY: 0.02, angle: 90, opening: 0.02, inner: 22, outer: 26, softness: 0.1, range: 1.3, falloff: 0.4 } },
      { name: 'Flashlight from the side', group: 'Realistic', values: { srcX: 0.02, srcY: 0.5, angle: 0, opening: 0.04, inner: 18, outer: 55, softness: 0.7, range: 1.1, falloff: 1.1 } },
      { name: 'Corner uplight', group: 'Realistic', values: { srcX: 0.08, srcY: 0.99, angle: -72, opening: 0.05, inner: 30, outer: 75, softness: 0.55, range: 1.2, falloff: 1.2 } },
      { name: 'Under-cabinet strip', group: 'Realistic', values: { srcY: 0, angle: 90, opening: 0.8, inner: 110, outer: 170, softness: 0.7, range: 0.5, falloff: 2 } },
      { name: 'Floodlight', group: 'Realistic', values: { srcY: 0.98, angle: -90, opening: 0.06, inner: 80, outer: 130, softness: 0.6, falloffMode: 'inverse', range: 1.4, hotspot: 0.12 } },
      { name: 'Street lamp on facade', group: 'Realistic', values: { srcY: 0.05, angle: 90, opening: 0.05, inner: 100, outer: 160, softness: 0.65, falloffMode: 'inverse', range: 1, hotspot: 0.1 } },
      // Stylized
      { name: 'Toon spotlight', group: 'Stylized', values: { srcY: 0.02, angle: 90, opening: 0.08, inner: 40, outer: 42, softness: 0, range: 1.5, falloff: 0, dither: false } },
      { name: 'Toon lamp', group: 'Stylized', values: { srcY: 0.02, angle: 90, opening: 0.08, inner: 50, outer: 52, softness: 0, range: 0.9, falloff: 0.35, dither: false } },
      { name: 'Soft painterly glow', group: 'Stylized', values: { srcY: 0.1, angle: 90, opening: 0.2, inner: 0, outer: 150, softness: 1, range: 0.9, falloff: 2.2 } },
      { name: 'Stage wash', group: 'Stylized', values: { srcY: 0.02, angle: 90, opening: 0.02, inner: 60, outer: 75, softness: 0.25, range: 1.4, falloff: 0.5 } },
      // Sci-fi
      { name: 'Tractor beam', group: 'Sci-fi', values: { srcY: 0.02, angle: 90, opening: 0.12, inner: 28, outer: 34, softness: 0.2, range: 1.5, falloff: 0.15, brightness: 1.2 } },
      { name: 'Scanner wedge', group: 'Sci-fi', values: { srcX: 0.02, srcY: 0.5, angle: 0, opening: 0, inner: 36, outer: 40, softness: 0.05, range: 1.1, falloff: 0.8, dither: false } },
      { name: 'Hologram emitter', group: 'Sci-fi', values: { srcY: 0.99, angle: -90, opening: 0.03, inner: 46, outer: 58, softness: 0.3, range: 0.9, falloff: 0.6 } },
      { name: 'Reactor vent (up & down)', group: 'Sci-fi', values: { srcY: 0.5, angle: -90, mirror: true, opening: 0.3, inner: 10, outer: 40, softness: 0.4, range: 0.6, falloff: 0.9, brightness: 1.3 } },
    ],
    render(ctx, W, H, p) {
      const S = Math.min(W, H);
      const sx = p.srcX * W, sy = p.srcY * H;
      const dx = Math.cos(p.angle * DEG), dy = Math.sin(p.angle * DEG);
      const hi = (Math.min(p.inner, p.outer) / 2) * DEG, ho = Math.max(hi + 1e-4, (p.outer / 2) * DEG);
      // apex behind the source so the cone is `opening` wide where it leaves the lamp
      const back = p.opening > 0 ? (p.opening * S * 0.5) / Math.tan(Math.max(ho, 0.5 * DEG)) : 0;
      const R = Math.max(1, p.range * S), hot = Math.max(0.5, p.hotspot * S);
      const sharp = Math.pow(2, U.lerp(-2.6, 1.4, p.softness)); // transition exponent
      const inv = isInv(p);

      // angular profile of one cone direction (cx, cy)
      const cone = (vx, vy, cx, cy) => {
        if (vx * cx + vy * cy <= 0) return 0; // behind the lamp opening
        const ax = vx + cx * back, ay = vy + cy * back; // from the apex
        const th = Math.acos(U.clamp((ax * cx + ay * cy) / (Math.hypot(ax, ay) || 1), -1, 1));
        if (th >= ho) return 0;
        if (th <= hi) return 1;
        const t = 1 - (th - hi) / (ho - hi); // 1 at inner, 0 at outer
        return Math.pow(t * t * (3 - 2 * t), sharp);
      };

      U.pixels(ctx, W, H, (px, py, o) => {
        const vx = px + 0.5 - sx, vy = py + 0.5 - sy;
        let a = cone(vx, vy, dx, dy);
        if (p.mirror) a = Math.max(a, cone(vx, vy, -dx, -dy));
        let v = 0;
        if (a > 0) {
          const d = Math.hypot(vx, vy);
          let f;
          if (d >= R) f = 0;
          else if (inv) {
            // inverse square, windowed so it reaches exactly 0 at the range
            const w = 1 - (d / R) ** 4;
            f = (w * w) / (1 + (d / hot) ** 2);
          } else f = p.falloff > 0 ? Math.pow(1 - d / R, p.falloff) : 1;
          v = Math.pow(Math.min(1, a * f * p.brightness), p.gamma);
        }
        let b = v * 255;
        if (p.dither && v > 0 && v < 1) b += U.hash(px, py, 77) - 0.5;
        b = U.clamp(b, 0, 255);
        if (p.output === 'alpha') { o[0] = o[1] = o[2] = 255; o[3] = b; }
        else { o[0] = o[1] = o[2] = b; }
      });
    },
  });
})();
