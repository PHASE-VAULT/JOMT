/* Insects & spiders, flat top-down view with simple shading: spiders, beetles, flies, mosquitoes,
   butterflies, moths, cockroaches, ants and wasps. Head at the top. The body is built from head, thorax
   and abdomen segments; legs, wings, antennae, eyes, mandibles and a proboscis are added per type.
   The whole creature is laid out in unit space (body length about 1), measured, and scaled to fill the
   texture at any rotation. Every element is drawn through paint(color, height): in height mode
   (opts.height) the same drawing produces a height map for normal map mode (no drop shadow). */
(function () {
  'use strict';
  const U = window.UGTG;
  const TAU = Math.PI * 2, D2R = Math.PI / 180;

  // per type: everything a "type" switch sets (all of it stays editable)
  const TYPES = {
    spider: { headSize: 0, thoraxLen: 0.2, thoraxWidth: 0.17, abdomenLen: 0.3, abdomenWidth: 0.25, abdomenTip: 0.1, waist: 0.02,
      legs: '8', legLen: 1.05, legThick: 0.032, legSpread: 0, legBend: 0.6, legHair: 0.35,
      wings: 'none', antennae: 'none', eyes: 'spider', eyeSize: 1, eyeColor: '#0c0c0c', mandibles: 0.3, proboscis: 0,
      bodyColor: '#3b2e24', accentColor: '#7a6650', pattern: 'midline', patternAmt: 0.7, legColor: '#33281f', gloss: 0.25, hair: 0.35 },
    beetle: { headSize: 0.085, thoraxLen: 0.11, thoraxWidth: 0.16, abdomenLen: 0.3, abdomenWidth: 0.22, abdomenTip: 0.15, waist: 0,
      legs: '6', legLen: 0.6, legThick: 0.03, legSpread: 0, legBend: 0.55, legHair: 0,
      flapRate: 3, wings: 'elytra', wingLen: 1, wingWidth: 1, wingSpread: 0, wingAlpha: 1, veins: 0.15, wingColor: '#1e3a2a', wingColor2: '#0c1a12', wingPattern: 'plain',
      antennae: 'thin', antLen: 0.3, eyes: 'small', eyeSize: 1, eyeColor: '#101010', mandibles: 0.25, proboscis: 0,
      bodyColor: '#1a2620', accentColor: '#000000', pattern: 'none', patternAmt: 0.8, legColor: '#141a16', gloss: 0.75, hair: 0 },
    fly: { headSize: 0.1, thoraxLen: 0.13, thoraxWidth: 0.13, abdomenLen: 0.2, abdomenWidth: 0.15, abdomenTip: 0.35, waist: 0,
      legs: '6', legLen: 0.55, legThick: 0.016, legSpread: 0, legBend: 0.5, legHair: 0.3,
      flapRate: 4, wings: 'membrane', wingLen: 0.6, wingWidth: 0.22, wingSpread: 32, wingAlpha: 0.38, veins: 0.6, wingColor: '#c8d0d6', wingColor2: '#4a4a40', wingPattern: 'plain',
      antennae: 'short', antLen: 0.08, eyes: 'compound', eyeSize: 1, eyeColor: '#8e1c12', mandibles: 0, proboscis: 0,
      bodyColor: '#2c2c2c', accentColor: '#8a8a80', pattern: 'segments', patternAmt: 0.6, legColor: '#1c1c1c', gloss: 0.45, hair: 0.3 },
    mosquito: { headSize: 0.055, thoraxLen: 0.09, thoraxWidth: 0.075, abdomenLen: 0.34, abdomenWidth: 0.06, abdomenTip: 0.5, waist: 0.015,
      legs: '6', legLen: 1.15, legThick: 0.008, legSpread: 0, legBend: 0.25, legHair: 0,
      flapRate: 4, wings: 'narrow', wingLen: 0.6, wingWidth: 0.075, wingSpread: 14, wingAlpha: 0.32, veins: 0.5, wingColor: '#c6c8c4', wingColor2: '#5a5040', wingPattern: 'plain',
      antennae: 'feathered', antLen: 0.18, eyes: 'compound', eyeSize: 0.8, eyeColor: '#1c1c1c', mandibles: 0, proboscis: 0.32,
      bodyColor: '#4e4234', accentColor: '#c8bca4', pattern: 'segments', patternAmt: 0.7, legColor: '#3c3228', gloss: 0.3, hair: 0.1 },
    butterfly: { headSize: 0.055, thoraxLen: 0.1, thoraxWidth: 0.06, abdomenLen: 0.28, abdomenWidth: 0.05, abdomenTip: 0.35, waist: 0,
      legs: '6', legLen: 0.25, legThick: 0.01, legSpread: 0, legBend: 0.3, legHair: 0,
      flapRate: 1, wings: 'butterfly', wingLen: 1, wingWidth: 1, wingSpread: 0, wingAlpha: 1, veins: 0.7, wingColor: '#e8781a', wingColor2: '#16100c', wingPattern: 'monarch',
      antennae: 'clubbed', antLen: 0.5, eyes: 'compound', eyeSize: 0.6, eyeColor: '#1a1a1a', mandibles: 0, proboscis: 0,
      bodyColor: '#1e1a16', accentColor: '#ffffff', pattern: 'none', patternAmt: 0.6, legColor: '#1a1612', gloss: 0.2, hair: 0.45 },
    moth: { headSize: 0.06, thoraxLen: 0.11, thoraxWidth: 0.08, abdomenLen: 0.26, abdomenWidth: 0.07, abdomenTip: 0.3, waist: 0,
      legs: '6', legLen: 0.25, legThick: 0.012, legSpread: 0, legBend: 0.3, legHair: 0.3,
      flapRate: 1, wings: 'moth', wingLen: 0.85, wingWidth: 0.85, wingSpread: 0, wingAlpha: 1, veins: 0.35, wingColor: '#8f7a5e', wingColor2: '#4a3a2a', wingPattern: 'bands',
      antennae: 'feathered', antLen: 0.28, eyes: 'compound', eyeSize: 0.7, eyeColor: '#1a1410', mandibles: 0, proboscis: 0,
      bodyColor: '#6e5c46', accentColor: '#3a2e22', pattern: 'segments', patternAmt: 0.5, legColor: '#4a3c2c', gloss: 0.1, hair: 0.8 },
    roach: { headSize: 0.07, thoraxLen: 0.12, thoraxWidth: 0.17, abdomenLen: 0.34, abdomenWidth: 0.19, abdomenTip: 0.15, waist: 0,
      legs: '6', legLen: 0.7, legThick: 0.024, legSpread: 0.1, legBend: 0.45, legHair: 0.55,
      wings: 'leathery', wingLen: 0.72, wingWidth: 0.2, wingSpread: 4, wingAlpha: 0.92, veins: 0.35, wingColor: '#5a3216', wingColor2: '#2a160a', wingPattern: 'plain',
      antennae: 'thin', antLen: 1.25, eyes: 'small', eyeSize: 1, eyeColor: '#120a06', mandibles: 0, proboscis: 0,
      bodyColor: '#4a2a12', accentColor: '#c89a5a', pattern: 'none', patternAmt: 0.6, legColor: '#3e2410', gloss: 0.6, hair: 0 },
    ant: { headSize: 0.1, thoraxLen: 0.12, thoraxWidth: 0.06, abdomenLen: 0.17, abdomenWidth: 0.12, abdomenTip: 0.2, waist: 0.06,
      legs: '6', legLen: 0.7, legThick: 0.016, legSpread: 0, legBend: 0.4, legHair: 0,
      wings: 'none', antennae: 'elbowed', antLen: 0.38, eyes: 'small', eyeSize: 1, eyeColor: '#050505', mandibles: 0.18, proboscis: 0,
      bodyColor: '#2a1810', accentColor: '#000000', pattern: 'none', patternAmt: 0.6, legColor: '#24140c', gloss: 0.5, hair: 0.1 },
    wasp: { headSize: 0.085, thoraxLen: 0.12, thoraxWidth: 0.1, abdomenLen: 0.28, abdomenWidth: 0.13, abdomenTip: 0.6, waist: 0.03,
      legs: '6', legLen: 0.6, legThick: 0.015, legSpread: 0, legBend: 0.45, legHair: 0.1,
      flapRate: 4, wings: 'membrane', wingLen: 0.6, wingWidth: 0.15, wingSpread: 22, wingAlpha: 0.35, veins: 0.6, wingColor: '#c8b88a', wingColor2: '#4a3a1a', wingPattern: 'plain',
      antennae: 'thin', antLen: 0.32, eyes: 'compound', eyeSize: 0.75, eyeColor: '#1a1408', mandibles: 0.1, proboscis: 0,
      bodyColor: '#f2c21a', accentColor: '#141210', pattern: 'stripes', patternAmt: 1, legColor: '#c89a1a', gloss: 0.45, hair: 0.15 },
  };

  const hex2 = (c) => '#' + c.map((v) => Math.round(U.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  const shade = (hex, f) => hex2(U.hex(hex).map((v) => (f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  const dir = (a) => [Math.cos(a), Math.sin(a)];

  /* Flatten: blend every detail amount towards 0 and every color towards one silhouette color.
     _d (1 = full detail, 0 = flat) also fades the few fixed highlight colors used while drawing. */
  const mixHex = (a, b, t) => { const x = U.hex(a), y = U.hex(b); return hex2(x.map((v, i) => v + (y[i] - v) * t)); };
  function flattened(p) {
    const f = U.clamp(p.flatten || 0), d = 1 - f;
    if (f <= 0) return Object.assign({}, p, { _d: 1 });
    const q = Object.assign({}, p, { _d: d });
    for (const k of ['shading', 'gloss', 'hair', 'legHair', 'veins', 'patternAmt', 'outline']) q[k] = p[k] * d;
    for (const k of ['bodyColor', 'legColor', 'wingColor', 'wingColor2', 'accentColor', 'eyeColor']) q[k] = mixHex(p[k], p.flatColor, f);
    return q;
  }

  /* tapered egg / teardrop outline: tip > 0 narrows the bottom (y+) end */
  function segPath(c, cx, cy, rx, ry, tip, n = 64) {
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, s = Math.sin(a), f = 1 - tip * 0.92 * Math.pow(Math.max(0, s), 1.6);
      c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rx * f, cy + s * ry);
    }
    c.closePath();
  }

  U.register({
    id: 'insect',
    name: 'Insects & Spiders',
    desc: 'Top-down spiders, beetles, flies, mosquitoes, butterflies, moths, roaches, ants and wasps with simple shading and normal map',
    tags: ['Decals', 'Nature', 'VFX'],
    bg: 'checker',
    fixedAspect: '1:1',
    normalMap: true,
    heightMap: true,
    normalDesc: 'Normal map from the insect\'s own shape (body domes, legs, wings); the drop shadow is left out',
    normalDefaults: { strength: 6, smooth: 0.5 },
    // tilesheet mode: a seamless walk / wing-beat loop
    animLoop: true,
    animate(p, f) {
      p._anim = { t: f.t, walk: p.animWalk, flap: p.wings === 'none' ? 0 : p.animFlap, rate: p.flapRate, ant: p.animAntenna, cycles: p.walkCycles };
      return p;
    },
    icon: U.icon('<ellipse cx="12" cy="14.5" rx="3" ry="5"/><circle cx="12" cy="7.5" r="2"/><path d="M9 11L4 8M9 14H3.5M9.5 17L5 20.5M15 11l5-3M15 14h5.5M14.5 17l4.5 3.5M11 6L9 3M13 6l2-3"/>'),
    params: [
      { type: 'section', label: 'Creature' },
      {
        key: 'type', label: 'Type', type: 'select', default: 'spider',
        options: [['spider', 'Spider'], ['beetle', 'Beetle / bug'], ['fly', 'Fly'], ['mosquito', 'Mosquito'], ['butterfly', 'Butterfly'], ['moth', 'Moth'], ['roach', 'Cockroach'], ['ant', 'Ant'], ['wasp', 'Wasp / bee']],
        apply: (v, p) => Object.assign(p, TYPES[v] || {}),
      },
      { key: 'size', label: 'Size', type: 'range', min: 0.3, max: 1, step: 0.01, default: 0.95, tip: 'How much of the texture the creature fills (it is fitted automatically, at any rotation)' },
      { key: 'rotation', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: 0 },
      { key: 'pose', label: 'Pose variation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, tip: 'Small random differences between left and right legs, wings and antennae' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 3 },
      { key: 'flatten', label: 'Flatten (silhouette)', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Strips the detail: shading, gloss, hair, veins and patterns fade out and all colors blend into one silhouette color. 1 = flat silhouette, e.g. for particle systems' },
      { key: 'flatColor', label: 'Silhouette color', type: 'color', default: '#161412', show: (p) => p.flatten > 0 },

      { type: 'section', label: 'Body' },
      { key: 'headSize', label: 'Head size', type: 'range', min: 0, max: 0.2, step: 0.005, default: 0, tip: '0 = no separate head (spiders: head and thorax are one piece)' },
      { key: 'thoraxLen', label: 'Thorax length', type: 'range', min: 0.04, max: 0.3, step: 0.005, default: 0.2 },
      { key: 'thoraxWidth', label: 'Thorax width', type: 'range', min: 0.03, max: 0.3, step: 0.005, default: 0.17 },
      { key: 'abdomenLen', label: 'Abdomen length', type: 'range', min: 0.05, max: 0.5, step: 0.005, default: 0.3 },
      { key: 'abdomenWidth', label: 'Abdomen width', type: 'range', min: 0.02, max: 0.4, step: 0.005, default: 0.25 },
      { key: 'abdomenTip', label: 'Pointed tail', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: 'waist', label: 'Waist', type: 'range', min: 0, max: 0.15, step: 0.005, default: 0.02, tip: 'Thin stalk between thorax and abdomen (ants, wasps)' },
      { key: 'hair', label: 'Hair', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },

      { type: 'section', label: 'Legs' },
      { key: 'legs', label: 'Legs', type: 'select', default: '8', options: [['0', 'None'], ['6', '6 (insect)'], ['8', '8 (spider)']] },
      { key: 'legLen', label: 'Leg length', type: 'range', min: 0.1, max: 1.6, step: 0.01, default: 1.05, show: (p) => p.legs !== '0' },
      { key: 'legThick', label: 'Leg thickness', type: 'range', min: 0.004, max: 0.06, step: 0.001, default: 0.032, show: (p) => p.legs !== '0' },
      { key: 'legSpread', label: 'Leg pose', type: 'range', min: -1, max: 1, step: 0.01, default: 0, show: (p) => p.legs !== '0', tip: 'Negative = legs pulled forward, positive = swept back' },
      { key: 'legBend', label: 'Knee bend', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: (p) => p.legs !== '0' },
      { key: 'legHair', label: 'Leg spines / hair', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.legs !== '0' },

      { type: 'section', label: 'Wings' },
      { key: 'wings', label: 'Wings', type: 'select', default: 'none', options: [['none', 'None'], ['membrane', 'Clear membrane (fly, wasp)'], ['narrow', 'Narrow (mosquito)'], ['butterfly', 'Butterfly'], ['moth', 'Moth'], ['elytra', 'Hard shell (beetle)'], ['leathery', 'Leathery (cockroach)']] },
      { key: 'wingLen', label: 'Wing length', type: 'range', min: 0.2, max: 1.4, step: 0.01, default: 1, show: (p) => p.wings !== 'none' },
      { key: 'wingWidth', label: 'Wing width', type: 'range', min: 0.03, max: 1.4, step: 0.005, default: 1, show: (p) => p.wings !== 'none' },
      { key: 'wingSpread', label: 'Wing spread', type: 'range', min: -20, max: 80, step: 1, default: 0, show: (p) => p.wings !== 'none', tip: 'Angle away from the body (beetles: opens the shell)' },
      { key: 'wingAlpha', label: 'Wing opacity', type: 'range', min: 0.05, max: 1, step: 0.01, default: 1, show: (p) => p.wings !== 'none' },
      { key: 'veins', label: 'Veins', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.wings !== 'none' },
      { key: 'wingPattern', label: 'Wing pattern', type: 'select', default: 'plain', options: [['plain', 'Plain'], ['gradient', 'Gradient'], ['monarch', 'Dark border + spots'], ['eyespots', 'Eyespots'], ['bands', 'Bands'], ['spots', 'Spots (ladybug)']], show: (p) => p.wings !== 'none' },
      { key: 'wingColor', label: 'Wing color', type: 'color', default: '#e8781a', show: (p) => p.wings !== 'none' },
      { key: 'wingColor2', label: 'Wing color 2', type: 'color', default: '#16100c', show: (p) => p.wings !== 'none' && p.wingPattern !== 'plain' },

      { type: 'section', label: 'Head' },
      { key: 'antennae', label: 'Antennae', type: 'select', default: 'none', options: [['none', 'None'], ['thin', 'Thin'], ['short', 'Short stubs'], ['clubbed', 'Clubbed (butterfly)'], ['feathered', 'Feathered (moth, mosquito)'], ['elbowed', 'Elbowed (ant)']] },
      { key: 'antLen', label: 'Antenna length', type: 'range', min: 0.03, max: 1.6, step: 0.01, default: 0.3, show: (p) => p.antennae !== 'none' },
      { key: 'eyes', label: 'Eyes', type: 'select', default: 'spider', options: [['none', 'None'], ['compound', 'Compound (large)'], ['small', 'Small'], ['spider', 'Spider (8)']] },
      { key: 'eyeSize', label: 'Eye size', type: 'range', min: 0.3, max: 1.6, step: 0.01, default: 1, show: (p) => p.eyes !== 'none' },
      { key: 'eyeColor', label: 'Eye color', type: 'color', default: '#0c0c0c', show: (p) => p.eyes !== 'none' },
      { key: 'mandibles', label: 'Mandibles / fangs', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3 },
      { key: 'proboscis', label: 'Proboscis', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0, tip: 'Long sucking needle at the front (mosquito)' },

      { type: 'section', label: 'Color' },
      { key: 'bodyColor', label: 'Body color', type: 'color', default: '#3b2e24' },
      { key: 'pattern', label: 'Body pattern', type: 'select', default: 'midline', options: [['none', 'None'], ['stripes', 'Stripes (wasp)'], ['segments', 'Segment lines'], ['spots', 'Spots'], ['midline', 'Center stripe + chevrons (spider)']] },
      { key: 'patternAmt', label: 'Pattern strength', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, show: (p) => p.pattern !== 'none' },
      { key: 'accentColor', label: 'Pattern color', type: 'color', default: '#7a6650', show: (p) => p.pattern !== 'none' },
      { key: 'legColor', label: 'Leg color', type: 'color', default: '#33281f', show: (p) => p.legs !== '0' },
      { key: 'shading', label: 'Shading', type: 'range', min: 0, max: 1, step: 0.01, default: 0.65 },
      { key: 'gloss', label: 'Gloss', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
      { key: 'outline', label: 'Outline', type: 'range', min: 0, max: 0.02, step: 0.0005, default: 0, tip: 'Dark cartoon outline around the body parts' },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#000000', show: (p) => p.outline > 0 },

      // only shown in Tilesheet mode (the panel then has the sh_* settings)
      { type: 'section', label: 'Animation', show: (p) => p.sh_grid !== undefined },
      { key: 'animWalk', label: 'Leg movement', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, tip: 'Walking gait: tripod for insects, alternating sets of four for spiders' },
      { key: 'walkCycles', label: 'Steps per loop', type: 'int', min: 1, max: 4, default: 1, show: (p) => p.animWalk > 0 },
      { key: 'animFlap', label: 'Wing flap', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, tip: 'Flies and wasps sweep their wings; butterflies and moths fold them up; beetles flap the wings under an open shell' },
      { key: 'flapRate', label: 'Wing beats per loop', type: 'int', min: 1, max: 8, default: 3, show: (p) => p.animFlap > 0 },
      { key: 'animAntenna', label: 'Antenna twitch', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4 },

      { type: 'section', label: 'Shadow' },
      { key: 'shadow', label: 'Drop shadow', type: 'bool', default: true, tip: 'Soft shadow on the ground below (not in the normal map)' },
      { key: 'shadowAlpha', label: 'Opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.shadow },
      { key: 'shadowBlur', label: 'Softness', type: 'range', min: 0, max: 40, step: 0.5, default: 10, show: (p) => p.shadow, tip: 'px @ 512' },
      { key: 'shadowOff', label: 'Offset', type: 'range', min: 0, max: 40, step: 0.5, default: 8, show: (p) => p.shadow, tip: 'Down-right, px @ 512' },
    ],
    presets: [
      // spiders
      { name: 'House spider', group: 'Spiders', values: { type: 'spider' } },
      { name: 'Black widow', group: 'Spiders', values: { type: 'spider', abdomenLen: 0.34, abdomenWidth: 0.3, abdomenTip: 0, thoraxLen: 0.15, thoraxWidth: 0.13, legLen: 1.2, legThick: 0.022, bodyColor: '#0c0c0e', legColor: '#0a0a0c', pattern: 'spots', accentColor: '#c8141a', patternAmt: 0.9, gloss: 0.8, hair: 0, legHair: 0 } },
      { name: 'Tarantula', group: 'Spiders', values: { type: 'spider', legLen: 0.95, legThick: 0.055, thoraxLen: 0.2, abdomenLen: 0.28, abdomenWidth: 0.24, bodyColor: '#2a1e18', legColor: '#2a1e18', accentColor: '#c88a4a', pattern: 'none', hair: 1, legHair: 1, gloss: 0.05 } },
      { name: 'Wolf spider', group: 'Spiders', values: { type: 'spider', bodyColor: '#6a5640', legColor: '#5a4834', accentColor: '#2a2018', pattern: 'midline', hair: 0.6, legHair: 0.6, legThick: 0.036, legLen: 0.95 } },
      { name: 'Daddy longlegs', group: 'Spiders', values: { type: 'spider', thoraxLen: 0.1, thoraxWidth: 0.09, abdomenLen: 0.16, abdomenWidth: 0.12, legLen: 1.6, legThick: 0.007, legBend: 0.35, legHair: 0, hair: 0, pattern: 'none', bodyColor: '#8a7a64', legColor: '#5a4c3c', size: 1 } },
      // beetles & bugs
      { name: 'Ground beetle', group: 'Beetles & bugs', values: { type: 'beetle' } },
      { name: 'Ladybug', group: 'Beetles & bugs', values: { type: 'beetle', abdomenLen: 0.24, abdomenWidth: 0.24, abdomenTip: 0, thoraxWidth: 0.15, legLen: 0.42, antLen: 0.12, mandibles: 0, wingColor: '#d8160e', wingColor2: '#0a0a0a', wingPattern: 'spots', bodyColor: '#0c0c0c', legColor: '#0a0a0a', gloss: 0.85 } },
      { name: 'Scarab (iridescent)', group: 'Beetles & bugs', values: { type: 'beetle', wingColor: '#1c8a5a', wingColor2: '#0a3a6a', wingPattern: 'gradient', bodyColor: '#145a44', legColor: '#0e2a20', gloss: 0.95 } },
      { name: 'Stag beetle', group: 'Beetles & bugs', values: { type: 'beetle', headSize: 0.11, mandibles: 1, wingColor: '#3a1e10', bodyColor: '#24140a', legColor: '#1a0e08', legLen: 0.7, gloss: 0.6 } },
      { name: 'Beetle, wings open', group: 'Beetles & bugs', values: { type: 'beetle', wingSpread: 45 } },
      // flies
      { name: 'House fly', group: 'Flies & mosquitoes', values: { type: 'fly' } },
      { name: 'Green bottle fly', group: 'Flies & mosquitoes', values: { type: 'fly', bodyColor: '#1e7a52', accentColor: '#2aa874', pattern: 'none', gloss: 0.9, eyeColor: '#a8261a' } },
      { name: 'Horse fly', group: 'Flies & mosquitoes', values: { type: 'fly', abdomenLen: 0.26, abdomenWidth: 0.17, wingLen: 0.7, wingColor: '#8a7a64', wingAlpha: 0.5, eyeColor: '#3a8a3a', bodyColor: '#4a4034' } },
      { name: 'Mosquito', group: 'Flies & mosquitoes', values: { type: 'mosquito' } },
      { name: 'Tiger mosquito', group: 'Flies & mosquitoes', values: { type: 'mosquito', bodyColor: '#141414', accentColor: '#f0f0f0', pattern: 'stripes', patternAmt: 0.8, legColor: '#1a1a1a' } },
      // butterflies & moths
      { name: 'Monarch butterfly', group: 'Butterflies & moths', values: { type: 'butterfly' } },
      { name: 'Blue morpho', group: 'Butterflies & moths', values: { type: 'butterfly', wingColor: '#1a7ae8', wingColor2: '#0a0e1a', wingPattern: 'gradient', veins: 0.3 } },
      { name: 'Cabbage white', group: 'Butterflies & moths', values: { type: 'butterfly', wingColor: '#f2f0e6', wingColor2: '#2a2a2a', wingPattern: 'spots', veins: 0.15, bodyColor: '#3a3a36' } },
      { name: 'Peacock (eyespots)', group: 'Butterflies & moths', values: { type: 'butterfly', wingColor: '#a8261a', wingColor2: '#1a1aa0', wingPattern: 'eyespots', veins: 0.25 } },
      { name: 'Brown moth', group: 'Butterflies & moths', values: { type: 'moth' } },
      { name: 'Luna moth', group: 'Butterflies & moths', values: { type: 'moth', wingColor: '#bfe8a8', wingColor2: '#d8a04a', wingPattern: 'eyespots', bodyColor: '#e8f0d8', accentColor: '#c8d8b0', veins: 0.3, wingLen: 0.95, wingWidth: 0.95 } },
      // roaches, ants, wasps
      { name: 'American cockroach', group: 'Roaches, ants & wasps', values: { type: 'roach' } },
      { name: 'German cockroach', group: 'Roaches, ants & wasps', values: { type: 'roach', bodyColor: '#8a5a2a', wingColor: '#a8763a', wingColor2: '#4a2a10', legColor: '#7a4e22', abdomenLen: 0.28, wingLen: 0.62, pattern: 'none' } },
      { name: 'Black ant', group: 'Roaches, ants & wasps', values: { type: 'ant' } },
      { name: 'Red ant', group: 'Roaches, ants & wasps', values: { type: 'ant', bodyColor: '#8a2a12', legColor: '#6a2010' } },
      { name: 'Wasp', group: 'Roaches, ants & wasps', values: { type: 'wasp' } },
      { name: 'Honey bee', group: 'Roaches, ants & wasps', values: { type: 'wasp', waist: 0, abdomenTip: 0.35, abdomenWidth: 0.15, bodyColor: '#c88a1a', accentColor: '#2a1a0a', patternAmt: 0.85, hair: 0.8, legColor: '#3a2a12', wingColor: '#d8d0c0' } },
      // styles
      { name: 'Cartoon spider (outlined)', group: 'Stylized', values: { type: 'spider', outline: 0.008, gloss: 0.6, shading: 0.5, hair: 0, legHair: 0, bodyColor: '#3a2a5a', legColor: '#2a1e44', accentColor: '#8a6ac8' } },
      { name: 'Cartoon bug (outlined)', group: 'Stylized', values: { type: 'beetle', outline: 0.008, wingColor: '#3aa858', bodyColor: '#1a4a2a', gloss: 0.7, shading: 0.5 } },
    ],
    render(ctx, W, H, p, opts) {
      p = flattened(p);
      const height = !!(opts && opts.height);
      const rnd = U.rng(p.seed), S = Math.min(W, H);
      const jit = (amt) => (rnd() - 0.5) * 2 * amt * p.pose;
      const nLegs = +p.legs || 0;
      // tilesheet animation (see animate()): loop phase t in 0..1, everything periodic so the sheet loops
      const A = p._anim || null, T = A ? A.t : 0;
      const flapPh = A ? TAU * T * A.rate : 0, flapA = A ? A.flap * 0.6 * Math.sin(flapPh) : 0;

      /* ---------- layout in unit space (head at the top, y down) ---------- */
      const hR = p.headSize, tL = p.thoraxLen, tW = p.thoraxWidth, aL = p.abdomenLen, aW = p.abdomenWidth;
      const headY = 0, thY = hR + tL * 0.92, abY = thY + tL + p.waist + aL * 0.96;
      const front = hR > 0 ? headY - hR : thY - tL; // front-most body point (where antennae / fangs start)
      const pts = [[-aW, abY], [aW, abY + aL], [0, front], [tW, thY], [-tW, thY]]; // collected for fitting

      // legs: polylines, right side first, mirrored on the left
      const legs = [];
      if (nLegs) {
        const spider = nLegs === 8;
        const base = spider ? [-50, -18, 16, 46] : [-38, 4, 40];
        const ys = spider ? [-0.62, -0.2, 0.22, 0.62] : [-0.5, 0.05, 0.55];
        const segs = spider ? [0.3, 0.4, 0.3] : [0.34, 0.4, 0.26];
        for (const side of [1, -1]) {
          base.forEach((b, i) => {
            const jTh = jit(8), jBend = jit(0.15), jL = [jit(0.06), jit(0.06), jit(0.06)];
            const bendDir = b < -10 ? -1 : b > 10 ? 1 : 0.35;
            const build = (dDeg, lift, dBend) => {
              const th = (b + p.legSpread * 22 + jTh + dDeg) * D2R, bend = p.legBend * (spider ? 0.75 : 0.65) + jBend + dBend;
              let x = tW * 0.75, y = thY + ys[i] * tL * 0.8, a = th;
              const pl = [[x, y]];
              for (let s = 0; s < 3; s++) {
                const L = p.legLen * segs[s] * (spider && (i === 0 || i === 3) ? 1.08 : 1) * (1 + jL[s]) * lift;
                x += Math.cos(a) * L; y += Math.sin(a) * L;
                pl.push([x, y]);
                a += bendDir * bend * (s === 0 ? 1 : 0.45);
              }
              return pl.map(([lx, ly]) => [lx * side, ly]);
            };
            pts.push(...build(0, 1, 0)); // fit always uses the resting pose: no size jumps between frames
            if (A && A.walk > 0) {
              // alternating gait: tripod (insects) / alternating fours (spiders); legs lift (look shorter) on the forward swing
              const group = (i + (side > 0 ? 0 : 1)) % 2, ph = TAU * (T * A.cycles + group * 0.5);
              legs.push(build(A.walk * 18 * Math.sin(ph), 1 - A.walk * 0.1 * Math.max(0, -Math.cos(ph)), A.walk * 0.15 * Math.cos(ph)));
            } else legs.push(build(0, 1, 0));
          });
        }
        // spider pedipalps: two short feelers in front
        if (spider) {
          for (const side of [1, -1]) {
            const b = [tW * 0.35 * side, front + tL * 0.15], a = (-90 + side * 28 + jit(6) + (A ? A.ant * 10 * Math.sin(TAU * T * 2 + side) : 0)) * D2R;
            const m = [b[0] + Math.cos(a) * p.legLen * 0.1, b[1] + Math.sin(a) * p.legLen * 0.1];
            const a2 = a - side * 0.5;
            const e = [m[0] + Math.cos(a2) * p.legLen * 0.08, m[1] + Math.sin(a2) * p.legLen * 0.08];
            legs.push([b, m, e]); pts.push(e);
          }
        }
      }

      // antennae
      const ants = [];
      if (p.antennae !== 'none') {
        for (const side of [1, -1]) {
          const bx = side * Math.max(hR, tW * 0.4) * 0.4, by = front + (hR || tL) * 0.15;
          const twitch = A ? A.ant * 9 * Math.sin(TAU * T * 2 + side * 1.3) : 0;
          let a = (-90 + side * (p.antennae === 'elbowed' ? 20 : 30) + jit(10) + twitch) * D2R, L = p.antLen * (1 + jit(0.08));
          const pl = [[bx, by]];
          const n = 8;
          for (let i = 1; i <= n; i++) {
            if (p.antennae === 'elbowed' && i === 4) a += side * 70 * D2R; // the "elbow"
            else a += side * (p.antennae === 'thin' ? 4 : 2) * D2R; // gentle outward curve
            const [px, py] = pl[pl.length - 1];
            pl.push([px + Math.cos(a) * (L / n), py + Math.sin(a) * (L / n)]);
          }
          ants.push(pl); pts.push(pl[pl.length - 1]); // (the twitch is small; the fit margin below covers it)
        }
      }

      // wings: shapes in unit space, right side (mirrored)
      const wingL = p.wingLen, wingW = p.wingWidth, spread = p.wingSpread * D2R;
      if (p.wings === 'butterfly' || p.wings === 'moth') pts.push([wingL * 1.05, thY - wingL * 0.65], [-wingL * 1.05, thY - wingL * 0.65], [wingL * 0.9, thY + wingL * 0.8 * wingW]);
      if (p.wings === 'membrane' || p.wings === 'narrow' || p.wings === 'leathery') {
        const ex = A && p.wings !== 'leathery' ? [-A.flap * 0.6, 0, A.flap * 0.6] : [0];
        for (const e of ex) {
          const a = Math.PI / 2 - spread - e;
          pts.push([Math.cos(a) * wingL + tW * 0.3, thY + Math.sin(a) * wingL], [-Math.cos(a) * wingL - tW * 0.3, thY + Math.sin(a) * wingL]);
        }
      }
      if (p.wings === 'elytra' && spread > 0.05) { // membrane wings under the open shell
        const a = Math.PI / 2 - spread, len = aL * 2.4;
        pts.push([Math.cos(a) * len + aW * 0.75, thY + Math.sin(a) * len], [-Math.cos(a) * len - aW * 0.75, thY + Math.sin(a) * len]);
      }
      if (p.mandibles > 0) pts.push([0, front - 0.06 * p.mandibles - (p.mandibles > 0.7 ? 0.12 : 0)]);
      if (p.proboscis > 0) pts.push([0, front - p.proboscis]);

      /* ---------- fit: everything inside a circle, so any rotation fits ---------- */
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      const ccx = (minX + maxX) / 2, ccy = (minY + maxY) / 2;
      let rad = 0;
      for (const [x, y] of pts) rad = Math.max(rad, Math.hypot(x - ccx, y - ccy));
      const sc = (S * 0.47 * p.size) / Math.max(0.05, rad * (A ? 1.08 : 1.04) + p.legThick);

      /* ---------- drawing helpers ---------- */
      const L = U.canvas(W, H), c = L.getContext('2d');
      const gray = (v, a = 1) => { const g = Math.round(U.clamp(v) * 255); return `rgba(${g},${g},${g},${a})`; };
      const paint = (hex, h, a = 1) => (height ? gray(h, a) : U.rgba(hex, a));
      const sh = p.shading;
      c.translate(W / 2, H / 2);
      c.rotate(p.rotation * D2R);
      c.scale(sc, sc);
      c.translate(-ccx, -ccy);
      c.lineCap = 'round'; c.lineJoin = 'round';
      const px = 1 / sc; // one pixel in unit space

      // shaded body segment: light from the top left, gloss highlight, optional outline
      const segment = (cx, cy, rx, ry, tip, hex, dome = 0.42) => {
        dome *= 0.25 + 0.75 * p._d; // flattened creatures get flatter normals
        c.save();
        segPath(c, cx, cy, rx, ry, tip);
        c.save(); c.clip();
        c.translate(cx, cy); c.scale(rx, ry);
        const g = height ? c.createRadialGradient(0, -0.1, 0, 0, 0, 1.05) : c.createRadialGradient(-0.35, -0.4, 0, 0, 0, 1.15);
        if (height) { g.addColorStop(0, gray(0.5 + dome)); g.addColorStop(0.6, gray(0.5 + dome * 0.78)); g.addColorStop(1, gray(0.52)); }
        else { g.addColorStop(0, shade(hex, 1 + 0.4 * sh)); g.addColorStop(0.5, hex); g.addColorStop(1, shade(hex, 1 - 0.6 * sh)); }
        c.fillStyle = g; c.fillRect(-1.2, -1.2, 2.4, 2.4);
        if (!height && p.gloss > 0) {
          const s = c.createRadialGradient(-0.35, -0.45, 0, -0.35, -0.45, 0.45);
          s.addColorStop(0, `rgba(255,255,255,${0.55 * p.gloss})`); s.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = s; c.fillRect(-1.2, -1.2, 2.4, 2.4);
        }
        c.restore();
        if (p.outline > 0) { c.lineWidth = p.outline; c.strokeStyle = paint(p.outlineColor, 0.5); c.stroke(); }
        c.restore();
      };
      // fur: short strokes around a segment's outline
      const fur = (cx, cy, rx, ry, amt, hex) => {
        if (amt <= 0) return;
        const n = Math.round(40 + 160 * amt);
        for (let i = 0; i < n; i++) {
          const a = rnd() * TAU, r = 0.75 + rnd() * 0.3, len = (0.015 + rnd() * 0.04) * amt;
          const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r, oa = a + (rnd() - 0.5) * 0.8;
          c.strokeStyle = paint(rnd() < 0.5 ? shade(hex, 1.5) : shade(hex, 0.6), 0.6, 0.35 + rnd() * 0.4);
          c.lineWidth = Math.max(px * 0.8, 0.004);
          c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(oa) * len, y + Math.sin(oa) * len); c.stroke();
        }
      };
      // tapered jointed limb with a light ridge
      const limb = (pl, w0, w1, hex, hairAmt) => {
        for (let i = 1; i < pl.length; i++) {
          const t0 = (i - 1) / (pl.length - 1), t1 = i / (pl.length - 1);
          const wa = w0 + (w1 - w0) * t0, wb = w0 + (w1 - w0) * t1;
          c.lineWidth = Math.max(px, (wa + wb) / 2);
          c.strokeStyle = paint(shade(hex, 1 - 0.25 * sh), 0.7);
          c.beginPath(); c.moveTo(pl[i - 1][0], pl[i - 1][1]); c.lineTo(pl[i][0], pl[i][1]); c.stroke();
          if (!height && sh > 0) { // highlight ridge
            c.lineWidth = Math.max(px * 0.6, (wa + wb) * 0.18);
            c.strokeStyle = U.rgba(shade(hex, 1 + 0.6 * sh), 0.5);
            c.beginPath(); c.moveTo(pl[i - 1][0] - wa * 0.15, pl[i - 1][1] - wa * 0.15); c.lineTo(pl[i][0] - wb * 0.15, pl[i][1] - wb * 0.15); c.stroke();
          }
          if (hairAmt > 0) {
            const n = Math.round(6 * hairAmt * Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]) / 0.1);
            for (let k = 0; k < n; k++) {
              const t = rnd(), x = pl[i - 1][0] + (pl[i][0] - pl[i - 1][0]) * t, y = pl[i - 1][1] + (pl[i][1] - pl[i - 1][1]) * t;
              const ang = Math.atan2(pl[i][1] - pl[i - 1][1], pl[i][0] - pl[i - 1][0]) + (rnd() < 0.5 ? 1 : -1) * (0.6 + rnd() * 0.5);
              const len = wa * (0.8 + rnd() * 1.4) * hairAmt;
              c.lineWidth = Math.max(px * 0.7, wa * 0.12);
              c.strokeStyle = paint(hex, 0.66, 0.8);
              c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); c.stroke();
            }
          }
          if (i < pl.length - 1) { c.fillStyle = paint(shade(hex, 1 - 0.35 * sh), 0.72); c.beginPath(); c.arc(pl[i][0], pl[i][1], wb * 0.62, 0, TAU); c.fill(); } // joint
        }
      };
      const wingVeins = (ax, ay, len, ang, n, spreadA, a) => {
        if (p.veins <= 0) return;
        c.strokeStyle = paint(p.wingColor2, 0.58, a * p.veins);
        c.lineWidth = Math.max(px * 0.7, 0.004);
        for (let i = 0; i < n; i++) {
          const va = ang + (i / Math.max(1, n - 1) - 0.5) * spreadA, vl = len * (0.65 + 0.35 * Math.cos((i / Math.max(1, n - 1) - 0.5) * 2));
          c.beginPath(); c.moveTo(ax, ay);
          c.quadraticCurveTo(ax + Math.cos(ang) * vl * 0.5, ay + Math.sin(ang) * vl * 0.5, ax + Math.cos(va) * vl, ay + Math.sin(va) * vl);
          c.stroke();
        }
      };

      /* membrane / narrow / leathery wing: teardrop from the thorax, pointing back and out */
      // size: optional { len, w } override (the membrane wings under an open beetle shell)
      const flatWing = (side, kind, size) => {
        const bx = side * tW * 0.3, by = thY - tL * 0.15;
        const flap = kind === 'leathery' ? 0 : flapA; // sweep forward / back; foreshortened at the top of the stroke
        const a = Math.PI / 2 - side * (spread + jit(0.06) + flap), len = (size ? size.len : wingL) * (A && kind !== 'leathery' ? 1 - A.flap * 0.25 * (0.5 + 0.5 * Math.cos(flapPh)) : 1);
        const w = size ? size.w : kind === 'leathery' ? Math.max(wingW, aW * 0.9) : wingW;
        c.save();
        c.translate(bx, by); c.rotate(a - Math.PI / 2);
        c.beginPath();
        c.moveTo(0, 0);
        c.bezierCurveTo(side * w * 1.1, len * 0.15, side * w * 1.05, len * 0.85, side * w * 0.15, len);
        c.bezierCurveTo(-side * w * 0.25, len * 0.9, -side * w * 0.2, len * 0.3, 0, 0);
        c.closePath();
        const alpha = p.wingAlpha;
        if (height) { c.fillStyle = gray(kind === 'leathery' ? 0.66 : 0.57); c.fill(); }
        else {
          const g = c.createLinearGradient(0, 0, 0, len);
          g.addColorStop(0, U.rgba(shade(p.wingColor, kind === 'leathery' ? 0.85 : 1), alpha));
          g.addColorStop(1, U.rgba(p.wingPattern === 'gradient' ? p.wingColor2 : shade(p.wingColor, kind === 'leathery' ? 1.15 : 1.05), alpha * (kind === 'leathery' ? 1 : 0.85)));
          c.fillStyle = g; c.fill();
          if (kind !== 'leathery') { // iridescent sheen
            const s = c.createLinearGradient(-w, 0, w, len);
            s.addColorStop(0.3, 'rgba(255,255,255,0)'); s.addColorStop(0.5, `rgba(200,230,255,${0.18 * alpha * p._d})`); s.addColorStop(0.7, 'rgba(255,255,255,0)');
            c.fillStyle = s; c.fill();
          }
        }
        c.lineWidth = Math.max(px * 0.8, 0.004); c.strokeStyle = paint(p.wingColor2, 0.6, Math.min(1, alpha + 0.25)); c.stroke();
        c.save(); c.clip();
        wingVeins(0, 0, len, Math.PI / 2 + side * 0.08, kind === 'narrow' ? 3 : 5, side * 0.5, 0.8);
        c.restore();
        if (kind === 'narrow' && !height) { // scale fringe along the edge
          c.fillStyle = U.rgba(p.wingColor2, 0.35 * alpha);
          for (let i = 0; i < 18; i++) { const t = 0.1 + (i / 18) * 0.9; c.beginPath(); c.arc(side * w * 0.95 * Math.sin(t * Math.PI), t * len, 0.006, 0, TAU); c.fill(); }
        }
        c.restore();
      };

      /* butterfly / moth: fore- and hindwing per side with patterns */
      const bigWing = (side, fore, moth) => {
        const Lw = wingL, Ww = wingW;
        const bx = side * tW * 0.4, by = thY + (fore ? -tL * 0.35 : tL * 0.25);
        c.save();
        const fold = A ? 1 - A.flap * 0.85 * (0.5 + 0.5 * Math.sin(flapPh)) : 1; // wings rising: foreshortened from above
        c.translate(bx, by); c.scale(side * fold, 1); c.rotate((fore ? -1 : 0.6) * spread * 0.6);
        c.beginPath();
        c.moveTo(0, 0);
        if (fore) {
          if (moth) { // triangular, swept back
            c.quadraticCurveTo(Lw * 0.45, -Lw * 0.45 * Ww, Lw * 1.0, -Lw * 0.42 * Ww);
            c.quadraticCurveTo(Lw * 0.98, Lw * 0.05, Lw * 0.7, Lw * 0.32 * Ww);
            c.quadraticCurveTo(Lw * 0.35, Lw * 0.22, 0, Lw * 0.06);
          } else {
            c.quadraticCurveTo(Lw * 0.35, -Lw * 0.62 * Ww, Lw * 0.95, -Lw * 0.6 * Ww);
            c.quadraticCurveTo(Lw * 1.05, -Lw * 0.15 * Ww, Lw * 0.78, Lw * 0.12 * Ww);
            c.quadraticCurveTo(Lw * 0.42, Lw * 0.28 * Ww, 0, Lw * 0.06);
          }
        } else {
          c.quadraticCurveTo(Lw * 0.5, -Lw * 0.12 * Ww, Lw * (moth ? 0.62 : 0.7), Lw * 0.12 * Ww);
          c.quadraticCurveTo(Lw * (moth ? 0.72 : 0.82), Lw * 0.62 * Ww, Lw * 0.32, Lw * 0.72 * Ww);
          c.quadraticCurveTo(Lw * 0.05, Lw * 0.62 * Ww, 0, 0);
        }
        c.closePath();
        if (height) { c.fillStyle = gray(0.58); c.fill(); c.restore(); return; }
        const a = p.wingAlpha, base = fore ? p.wingColor : shade(p.wingColor, moth ? 0.9 : 1);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, Lw * 1.05);
        g.addColorStop(0, U.rgba(shade(base, p.wingPattern === 'gradient' ? 0.6 : 0.85), a));
        g.addColorStop(0.5, U.rgba(base, a));
        g.addColorStop(1, U.rgba(p.wingPattern === 'gradient' ? p.wingColor2 : shade(base, 1.08), a));
        c.fillStyle = g; c.fill();
        c.save(); c.clip();
        const pat = p.wingPattern, ink = (al) => U.rgba(p.wingColor2, al * a);
        if (pat === 'monarch') {
          c.lineWidth = Lw * 0.14; c.strokeStyle = ink(1); c.stroke(); // dark border
          c.fillStyle = `rgba(255,255,255,${0.9 * a * p._d})`;
          for (let i = 0; i < 14; i++) { // white dots in the border
            const t = i / 13, ang = fore ? -0.55 + t * 0.95 : 0.25 + t * 1.0, rr = Lw * (fore ? 0.93 : 0.66);
            c.beginPath(); c.arc(Math.cos(ang) * rr, Math.sin(ang) * rr * Ww, Lw * 0.018, 0, TAU); c.fill();
          }
        } else if (pat === 'eyespots') {
          const ex = fore ? Lw * 0.68 : Lw * 0.42, ey = fore ? -Lw * 0.32 * Ww : Lw * 0.38 * Ww, er = Lw * (fore ? 0.14 : 0.12);
          for (const [r, col] of [[1, mixHex('#f4e8c8', p.wingColor, 1 - p._d)], [0.72, p.wingColor2], [0.42, mixHex('#101010', p.wingColor, 1 - p._d)], [0.16, mixHex('#ffffff', p.wingColor, 1 - p._d)]]) {
            c.fillStyle = U.rgba(col, a); c.beginPath(); c.arc(ex, ey, er * r, 0, TAU); c.fill();
          }
        } else if (pat === 'bands') {
          c.strokeStyle = ink(0.75); c.lineWidth = Lw * 0.08;
          for (const r of [0.38, 0.7]) { c.beginPath(); c.arc(0, 0, Lw * r, -1.4, 1.6); c.stroke(); }
        } else if (pat === 'spots') {
          c.fillStyle = ink(0.9);
          const sp = fore ? [[0.78, -0.42], [0.5, -0.05]] : [[0.38, 0.3]];
          for (const [sx, sy] of sp) { c.beginPath(); c.arc(Lw * sx, Lw * sy * Ww, Lw * 0.07, 0, TAU); c.fill(); }
          if (fore) { c.beginPath(); c.arc(Lw * 0.95, -Lw * 0.55 * Ww, Lw * 0.16, 0, TAU); c.fill(); } // dark tip
        }
        wingVeins(0, 0, Lw * (fore ? 1 : 0.75), fore ? -0.25 : 0.55, 7, 1.3, 0.55);
        c.restore();
        c.lineWidth = Math.max(px, Lw * 0.008); c.strokeStyle = U.rgba(shade(p.wingColor2, 0.8), Math.min(1, a + 0.2)); c.stroke();
        c.restore();
      };

      /* beetle elytra: two hard shell halves over the abdomen, hinged at the thorax */
      const elytron = (side) => {
        const top = thY + tL * 0.75, bot = abY + aL * (1 - p.abdomenTip * 0.3), wid = aW * 1.04 * wingW;
        c.save();
        c.translate(0, top); c.rotate(-side * spread * 0.7); c.translate(0, -top);
        c.beginPath();
        c.moveTo(side * 0.004, top);
        c.bezierCurveTo(side * wid * 1.15, top, side * wid * 1.1, bot - (bot - top) * 0.2, side * 0.004, bot);
        c.closePath();
        c.save(); c.clip();
        const mid = (top + bot) / 2, len = (bot - top) / 2;
        c.translate(side * wid * 0.45, mid); c.scale(wid * 0.75, len);
        const g = height ? c.createRadialGradient(0, -0.1, 0, 0, 0, 1.2) : c.createRadialGradient(-0.4, -0.45, 0, 0, 0, 1.3);
        if (height) { g.addColorStop(0, gray(0.95)); g.addColorStop(0.7, gray(0.84)); g.addColorStop(1, gray(0.6)); }
        else {
          const b = p.wingColor, b2 = p.wingPattern === 'gradient' ? p.wingColor2 : shade(b, 1 - 0.65 * sh);
          g.addColorStop(0, shade(b, 1 + 0.45 * sh)); g.addColorStop(0.5, b); g.addColorStop(1, b2);
        }
        c.fillStyle = g; c.fillRect(-2, -2, 4, 4);
        c.restore();
        // pattern: ladybug spots
        if (p.wingPattern === 'spots') {
          c.save(); c.clip();
          const sr = new Array(4).fill(0).map((_, i) => [side * wid * (0.35 + (i % 2) * 0.3), top + (bot - top) * (0.22 + i * 0.2), wid * (0.16 + rnd() * 0.05)]);
          for (const [sx, sy, r] of sr) { c.fillStyle = paint(p.wingColor2, 0.9); c.beginPath(); c.arc(sx, sy, r, 0, TAU); c.fill(); }
          c.restore();
        }
        if (!height && p.gloss > 0) { // long specular streak
          c.save(); c.clip();
          const sx = side * wid * 0.32, s = c.createLinearGradient(sx - wid * 0.12, 0, sx + wid * 0.12, 0);
          s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(0.5, `rgba(255,255,255,${0.45 * p.gloss})`); s.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = s; c.fillRect(sx - wid * 0.12, top, wid * 0.24, (bot - top) * 0.7);
          c.restore();
        }
        c.lineWidth = Math.max(px, p.outline || 0.004); c.strokeStyle = paint(p.outline > 0 ? p.outlineColor : shade(p.wingColor, 0.35), 0.6, 0.9); c.stroke();
        c.restore();
      };

      /* ---------- draw, back to front ---------- */
      if (height) { const s = c.getTransform(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = gray(0.5); c.fillRect(0, 0, W, H); c.setTransform(s); }

      // legs under the body; butterflies and moths hold them under their big wings too
      const lw = p.legThick, bigWings = p.wings === 'butterfly' || p.wings === 'moth';
      const drawLegs = () => legs.forEach((pl, i) => limb(pl, lw * (i >= nLegs ? 0.8 : 1), lw * 0.45, p.legColor, p.legHair));
      if (bigWings) {
        drawLegs();
        for (const side of [1, -1]) { bigWing(side, false, p.wings === 'moth'); bigWing(side, true, p.wings === 'moth'); }
      } else drawLegs();
      for (const pl of ants) {
        const w0 = p.antennae === 'short' ? lw * 1.4 : Math.max(lw * 0.5, 0.006);
        limb(pl, w0, w0 * 0.6, p.legColor, 0);
        const [ex, ey] = pl[pl.length - 1];
        if (p.antennae === 'clubbed') { c.fillStyle = paint(p.legColor, 0.7); c.beginPath(); c.ellipse(ex, ey, w0 * 2.2, w0 * 3.2, Math.atan2(ey - pl[0][1], ex - pl[0][0]) + Math.PI / 2, 0, TAU); c.fill(); }
        if (p.antennae === 'feathered') {
          c.strokeStyle = paint(p.legColor, 0.62, 0.8); c.lineWidth = Math.max(px * 0.6, w0 * 0.35);
          for (let i = 1; i < pl.length; i++) {
            const a = Math.atan2(pl[i][1] - pl[i - 1][1], pl[i][0] - pl[i - 1][0]), len = p.antLen * 0.12 * (1 - i / pl.length * 0.6);
            for (const s of [1, -1]) { c.beginPath(); c.moveTo(pl[i][0], pl[i][1]); c.lineTo(pl[i][0] + Math.cos(a + s * 1.1) * len, pl[i][1] + Math.sin(a + s * 1.1) * len); c.stroke(); }
          }
        }
      }
      if (p.proboscis > 0) { c.strokeStyle = paint(p.legColor, 0.68); c.lineWidth = Math.max(px, lw * 0.9); c.beginPath(); c.moveTo(0, front + 0.01); c.lineTo(0, front - p.proboscis); c.stroke(); }

      // waist stalk
      if (p.waist > 0) { c.strokeStyle = paint(shade(p.bodyColor, 0.8), 0.75); c.lineWidth = Math.min(tW, aW) * 0.35; c.beginPath(); c.moveTo(0, thY + tL * 0.8); c.lineTo(0, abY - aL * 0.8); c.stroke(); }

      // abdomen + pattern
      segment(0, abY, aW, aL, p.abdomenTip, p.bodyColor);
      if (p.pattern !== 'none' && p.patternAmt > 0) {
        c.save(); segPath(c, 0, abY, aW, aL, p.abdomenTip); c.clip();
        const pa = p.patternAmt, ac = p.accentColor;
        if (p.pattern === 'stripes') {
          for (let i = 0; i < 4; i++) {
            const y = abY - aL * 0.45 + i * aL * 0.42;
            c.fillStyle = paint(ac, 0.62, pa); c.beginPath(); c.ellipse(0, y, aW * 1.2, aL * 0.11, 0, 0, TAU); c.fill();
          }
        } else if (p.pattern === 'segments') {
          c.lineWidth = Math.max(px, aL * 0.025);
          for (let i = 1; i < 6; i++) {
            const y = abY - aL + (i / 6) * aL * 2;
            c.strokeStyle = paint(ac, 0.6, 0.55 * pa); c.beginPath(); c.ellipse(0, y - aL * 0.08, aW * 1.05, aL * 0.12, 0, 0.15, Math.PI - 0.15); c.stroke();
          }
        } else if (p.pattern === 'spots') {
          c.fillStyle = paint(ac, 0.6, pa);
          c.beginPath(); // hourglass-ish mark + side spots
          c.ellipse(0, abY - aL * 0.15, aW * 0.18, aL * 0.2, 0, 0, TAU); c.ellipse(0, abY + aL * 0.25, aW * 0.14, aL * 0.14, 0, 0, TAU); c.fill();
          for (let i = 0; i < 4; i++) { const sx = (i % 2 ? 1 : -1) * aW * 0.55, sy = abY + (i < 2 ? -0.3 : 0.3) * aL; c.beginPath(); c.arc(sx, sy, aW * 0.09, 0, TAU); c.fill(); }
        } else if (p.pattern === 'midline') {
          c.fillStyle = paint(ac, 0.56, pa * 0.8);
          c.beginPath(); c.ellipse(0, abY - aL * 0.25, aW * 0.16, aL * 0.55, 0, 0, TAU); c.fill();
          c.strokeStyle = paint(ac, 0.56, pa * 0.8); c.lineWidth = aW * 0.07;
          for (let i = 0; i < 4; i++) { const y = abY + aL * (0.05 + i * 0.2); c.beginPath(); c.moveTo(-aW * 0.5 * (1 - i * 0.18), y - aL * 0.08); c.lineTo(0, y); c.lineTo(aW * 0.5 * (1 - i * 0.18), y - aL * 0.08); c.stroke(); }
        }
        c.restore();
      }
      fur(0, abY, aW, aL, p.hair, p.bodyColor);

      // wings that lie over the abdomen
      if (p.wings === 'elytra') {
        if (spread > 0.05) for (const side of [1, -1]) { // membrane wings peek out under an open shell
          c.save(); c.globalAlpha = 0.9;
          const old = p.wingColor; p.wingColor = mixHex('#d8d4c8', p.flatColor, 1 - p._d);
          flatWing(side, 'membrane', { len: aL * 2.4, w: aW * 0.75 });
          p.wingColor = old; c.restore();
        }
        elytron(1); elytron(-1);
      }
      if (p.wings === 'leathery') { flatWing(-1, 'leathery'); flatWing(1, 'leathery'); }

      // thorax (+ pronotum shield look for roaches/beetles via width), head
      segment(0, thY, tW, tL, 0, p.bodyColor, 0.4);
      fur(0, thY, tW, tL, p.hair * 1.1, p.bodyColor);
      if (p.wings === 'membrane' || p.wings === 'narrow') for (const side of [1, -1]) flatWing(side, p.wings);

      if (hR > 0) { segment(0, headY, hR * 1.05, hR, 0, shade(p.bodyColor, 0.92), 0.36); fur(0, headY, hR, hR, p.hair * 0.8, p.bodyColor); }

      // mandibles / fangs
      if (p.mandibles > 0) {
        const m = p.mandibles, big = m > 0.7;
        for (const side of [1, -1]) {
          const bx = side * (hR > 0 ? hR * 0.45 : tW * 0.3), by = front + 0.01;
          const len = 0.05 + m * (big ? 0.2 : 0.06);
          c.strokeStyle = paint(shade(p.bodyColor, 0.7), 0.72); c.lineWidth = Math.max(px, lw * (big ? 1.4 : 1.1));
          c.beginPath(); c.moveTo(bx, by);
          c.quadraticCurveTo(bx + side * len * 0.55, by - len * 0.7, bx - side * len * (big ? 0.15 : 0.35), by - len);
          c.stroke();
          if (big) { c.beginPath(); c.moveTo(bx + side * len * 0.35, by - len * 0.55); c.lineTo(bx + side * len * 0.05, by - len * 0.62); c.stroke(); } // tooth
        }
      }

      // eyes
      if (p.eyes !== 'none') {
        const es = p.eyeSize, eye = (x, y, rx, ry) => {
          c.fillStyle = paint(p.eyeColor, 0.8); c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill();
          if (!height) { c.fillStyle = `rgba(255,255,255,${(0.35 + 0.4 * p.gloss) * p._d})`; c.beginPath(); c.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.3, ry * 0.25, 0, 0, TAU); c.fill(); }
        };
        if (p.eyes === 'compound' && hR > 0) for (const s of [1, -1]) eye(s * hR * 0.62, headY - hR * 0.12, hR * 0.5 * es, hR * 0.62 * es);
        else if (p.eyes === 'small') for (const s of [1, -1]) eye(s * (hR || tW) * 0.68, (hR ? headY : front + tL * 0.2) - (hR || tL) * 0.25, (hR || tW) * 0.2 * es, (hR || tW) * 0.24 * es);
        else if (p.eyes === 'spider') {
          const ey = front + tL * 0.2, r = tW * 0.09 * es;
          for (const s of [1, -1]) {
            eye(s * tW * 0.12, ey, r * 1.3, r * 1.3);
            eye(s * tW * 0.3, ey + r * 0.6, r * 0.9, r * 0.9);
            eye(s * tW * 0.14, ey + r * 2.6, r * 0.8, r * 0.8);
            eye(s * tW * 0.34, ey + r * 2.4, r * 0.7, r * 0.7);
          }
        }
      }

      /* ---------- composite: drop shadow (color only), then the creature ---------- */
      const k = S / 512;
      if (!height && p.shadow && p.shadowAlpha > 0) {
        const far = W * 4;
        ctx.save();
        ctx.shadowColor = `rgba(0,0,0,${p.shadowAlpha})`; ctx.shadowBlur = p.shadowBlur * k;
        ctx.shadowOffsetX = p.shadowOff * k + far; ctx.shadowOffsetY = p.shadowOff * k;
        ctx.drawImage(L, -far, 0);
        ctx.restore();
      }
      ctx.drawImage(L, 0, 0);
    },
  });
})();
