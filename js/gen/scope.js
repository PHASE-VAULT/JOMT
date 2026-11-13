/* Scope overlay: modular reticle (lines, posts, center element, hash marks, BDC, extras),
   lens mask and housing ring. Presets fill the reticle params; everything stays editable.
   Units are px at 512 and scale with the export size. */
(function () {
  'use strict';
  const U = window.UGTG;

  // reticle defaults; presets start from these and override
  const BASE = {
    lines: true, lineExtent: 1, lineGap: 0, lineTop: true, thickness: 2, scale: 1,
    posts: 'none', postStart: 0.35, postEnd: 1, postW: 10, postOffsetY: 0, postSides: 'all', postPoint: false,
    center: 'none', centerSize: 40, centerThick: 4, dotSize: 6, ringTicks: false, centerStack: 0,
    hash: false, hashStyle: 'ticks', hashAxes: 'both', hashGap: 0, hashSpacing: 12, hashCount: 10, hashLen: 6, majorEvery: 5, majorLen: 14, hashNumbers: false,
    bdc: 'none', bdcStem: false, bdcCount: 4, bdcStart: 40, bdcSpacing: 30, bdcGrowth: 0.15, bdcWidth: 60, bdcNumbers: false, bdcFirst: 4, bdcStep: 1,
    sideMarkers: 0, prism: false, rangefinder: false,
    color: '#0b0b0b', accent: '#ffffff', // white accent = tint it in-engine (multiply)
    hashAccent: false, glow: false, glowSize: 8,
  };
  const PRESETS = {
    duplex: { posts: 'flat' },
    fine: {},
    mildot: { hash: true, hashStyle: 'dots', hashSpacing: 36, hashCount: 5, majorEvery: 0 },
    pu: { lines: false, posts: 'flat', postSides: 'sidesBottom', postPoint: true, postStart: 0.14, postW: 9 },
    german4: { lineTop: false, posts: 'flat', postSides: 'sidesBottom', postPoint: true, postW: 12 },
    ta01: { lineExtent: 0.45, lineGap: 4, center: 'dot', dotSize: 3, bdc: 'dots', bdcCount: 4, bdcStart: 12, bdcSpacing: 7, bdcGrowth: 0.1 },
    ta11: { lines: false, center: 'triangle', centerSize: 13, bdc: 'ticks', bdcStem: true, bdcCount: 4, bdcStart: 22, bdcSpacing: 13, bdcGrowth: 0.1, bdcWidth: 9 },
    acog: { lines: false, center: 'chevron', centerSize: 26, bdc: 'stadia', bdcStem: true, bdcCount: 4, bdcStart: 34, bdcSpacing: 30, bdcWidth: 64 },
    prism: { lines: false, center: 'circledot', centerSize: 9, centerThick: 3, dotSize: 3, prism: true, bdc: 'dots', bdcCount: 3, bdcStart: 22, bdcSpacing: 9, bdcGrowth: 0, hashAccent: true },
    pso: { lines: false, center: 'chevron', centerSize: 12, centerStack: 3, hash: true, hashAxes: 'h', hashSpacing: 22, hashCount: 5, hashLen: 7, majorEvery: 0, rangefinder: true, color: '#ffffff', hashAccent: true },
    ff: { posts: 'flat', postStart: 0.42, postW: 8, hash: true, hashAccent: true, hashSpacing: 8, hashCount: 8, hashLen: 5, majorEvery: 0, bdc: 'stadia', bdcCount: 3, bdcStart: 90, bdcSpacing: 16, bdcGrowth: 0, bdcWidth: 30 },
    hamr: { lines: false, center: 'horseshoe', centerSize: 12, centerThick: 3, dotSize: 2.5, hash: true, hashAxes: 'h', hashGap: 16, hashSpacing: 22, hashCount: 3, hashLen: 12, majorEvery: 0, bdc: 'ticks', bdcStem: true, bdcCount: 6, bdcStart: 18, bdcSpacing: 16, bdcGrowth: 0.05, bdcWidth: 12, bdcNumbers: true, bdcFirst: 3, bdcStep: 1 },
    bravo: { lines: false, center: 'circle', centerSize: 11, centerThick: 4, sideMarkers: 3, bdc: 'ticks', bdcStem: true, bdcCount: 6, bdcStart: 18, bdcSpacing: 17, bdcGrowth: 0.04, bdcWidth: 16, bdcNumbers: true, bdcFirst: 3, bdcStep: 1 },
    tac30: { lines: false, center: 'circledot', centerSize: 26, centerThick: 4, dotSize: 2 },
    hhs: { lines: false, center: 'circledot', centerSize: 40, centerThick: 3, dotSize: 4, ringTicks: true },
    mk4: { posts: 'tapered', postStart: 0.5, postW: 7, hash: true, hashAccent: true, hashSpacing: 9, hashCount: 20, hashLen: 5, majorEvery: 5, majorLen: 10, hashNumbers: true },
    elcan: { posts: 'flat', postStart: 0.4, postW: 5, lineGap: 3, center: 'dot', dotSize: 2.5, rangefinder: true },
    vudu: { lines: false, hash: true, hashAccent: true, hashSpacing: 12, hashCount: 6, hashLen: 6, majorEvery: 0 },
    atacr: { posts: 'tapered', postStart: 0.62, postW: 8, postSides: 'sides', lineExtent: 0.62, hash: true, hashAccent: true, hashSpacing: 8, hashCount: 25, hashLen: 4, majorEvery: 5, majorLen: 9, hashNumbers: true },
    valday: { posts: 'hollow', postStart: 0.55, postW: 8, hash: true, hashStyle: 'dots', hashSpacing: 7, hashCount: 20, majorEvery: 0 },
  };

  const DEFAULT_PRESET = 'valday';
  const DEFAULTS = Object.assign({}, BASE, PRESETS[DEFAULT_PRESET]); // new tabs + start-screen preview
  const has = (key, ...l) => (p) => l.includes(p[key]);
  const P = (key, label, type, def, extra) => Object.assign({ key, label, type, default: def }, extra);
  const R = (key, label, min, max, step, extra) => P(key, label, 'range', BASE[key], Object.assign({ min, max, step }, extra));

  U.register({
    id: 'scope',
    name: 'Scope',
    desc: 'Scope overlay: reticle presets, lens mask, housing ring',
    tags: ['UI', 'Shooter'],
    bg: 'gray',
    icon: U.icon('<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v6M12 14.5v6M3.5 12h6M14.5 12h6"/><circle cx="12" cy="12" r=".8" fill="currentColor"/>'),
    params: [
      { type: 'section', label: 'Reticle (px @ 512)' },
      {
        key: 'preset', label: 'Preset', type: 'select', default: DEFAULT_PRESET,
        options: [['custom', 'Custom'], ['duplex', 'Duplex'], ['fine', 'Fine crosshair'], ['mildot', 'Mil-dot'], ['pu', 'PU (Russian posts)'], ['german4', 'German #4'],
          ['ta01', 'TA01-style'], ['ta11', 'TA11-style'], ['acog', 'Chevron + stadia'], ['prism', 'Prism arc'], ['pso', 'PSO-style'], ['ff', 'FFP 3-12'],
          ['hamr', 'HAMR-style'], ['bravo', 'Bravo-style'], ['tac30', 'Red circle-dot'], ['hhs', 'Holo ring + ticks'], ['mk4', 'Mil-hash tactical'],
          ['elcan', 'Elcan-style'], ['vudu', 'Simple hash'], ['atacr', 'Needle posts + hash'], ['valday', 'Hollow posts + dots']],
        apply: (v, p) => { if (PRESETS[v]) Object.assign(p, BASE, PRESETS[v]); },
      },
      { key: 'reticleOnly', label: 'Reticle only (no lens/mask/housing)', type: 'bool', default: false, tip: 'Transparent output with just the sight, clipped to the lens circle' },
      P('color', 'Line color', 'color', BASE.color),
      P('accent', 'Accent / illuminated', 'color', BASE.accent, { tip: 'White by default so it can be multiplied with any color in-engine' }),
      R('thickness', 'Line thickness', 0.5, 12, 0.5),
      R('scale', 'Reticle scale', 0.3, 3, 0.01),
      P('glow', 'Illumination glow', 'bool', BASE.glow, { tip: 'Glow on accent-colored parts' }),
      R('glowSize', 'Glow size', 1, 40, 0.5, { show: (p) => p.glow }),

      { type: 'section', label: 'Crosshair lines', collapsed: true },
      P('lines', 'Thin crosshair', 'bool', BASE.lines),
      R('lineExtent', 'Extent', 0.05, 1, 0.01, { show: (p) => p.lines }),
      R('lineGap', 'Center gap', 0, 100, 0.5, { show: (p) => p.lines }),
      P('lineTop', 'Top line', 'bool', BASE.lineTop, { show: (p) => p.lines }),

      { type: 'section', label: 'Posts', collapsed: true },
      P('posts', 'Posts', 'select', 'flat', { options: [['none', 'None'], ['flat', 'Flat'], ['tapered', 'Needle / tapered'], ['hollow', 'Hollow']] }),
      P('postSides', 'Sides', 'select', BASE.postSides, { options: [['all', 'All four'], ['sidesBottom', 'Left, right, bottom'], ['sides', 'Left, right']], show: (p) => p.posts !== 'none' }),
      R('postStart', 'Post start', 0.02, 0.95, 0.01, { show: (p) => p.posts !== 'none' }),
      R('postEnd', 'Post end', 0.05, 1, 0.01, { show: (p) => p.posts !== 'none', tip: 'Where the posts stop, as a fraction of the distance from the center to the image edge; 1 = the very edge of the image' }),
      R('postW', 'Post thickness', 2, 40, 0.5, { show: (p) => p.posts !== 'none' }),
      R('postOffsetY', 'Side posts offset', -40, 40, 0.25, { show: (p) => p.posts !== 'none', tip: 'Moves the left and right posts up (negative) or down (positive), px @ 512. PU-style reticles sit the side posts just below the tip of the bottom post' }),
      P('postPoint', 'Pointed bottom post', 'bool', BASE.postPoint, { show: (p) => p.posts !== 'none' && p.postSides === 'sidesBottom' }),

      { type: 'section', label: 'Center', collapsed: true },
      P('center', 'Center element', 'select', BASE.center, {
        options: [['none', 'None'], ['dot', 'Dot'], ['circle', 'Circle'], ['circledot', 'Circle + dot'], ['horseshoe', 'Horseshoe + dot'], ['chevron', 'Chevron'], ['triangle', 'Triangle']],
      }),
      R('centerSize', 'Size', 2, 120, 0.5, { show: (p) => !['none', 'dot'].includes(p.center) }),
      R('centerThick', 'Line thickness', 0.5, 16, 0.5, { show: has('center', 'circle', 'circledot', 'horseshoe', 'chevron') }),
      R('dotSize', 'Dot size', 0.5, 30, 0.5, { show: has('center', 'dot', 'circledot', 'horseshoe') }),
      P('ringTicks', 'Ring ticks', 'bool', BASE.ringTicks, { show: has('center', 'circle', 'circledot') }),
      P('centerStack', 'Extra chevrons', 'int', BASE.centerStack, { min: 0, max: 4, show: has('center', 'chevron') }),

      { type: 'section', label: 'Hash marks', collapsed: true },
      P('hash', 'Hash marks', 'bool', BASE.hash),
      P('hashStyle', 'Style', 'select', BASE.hashStyle, { options: [['ticks', 'Ticks'], ['dots', 'Dots']], show: (p) => p.hash }),
      P('hashAxes', 'Axes', 'select', BASE.hashAxes, { options: [['both', 'Both'], ['h', 'Horizontal'], ['v', 'Vertical']], show: (p) => p.hash }),
      R('hashGap', 'Center gap', 0, 200, 0.5, { show: (p) => p.hash, tip: 'Where the hash line starts, measured from the center: keeps the center reticle clear. Marks inside the gap are left out' }),
      R('hashSpacing', 'Spacing', 2, 80, 0.5, { show: (p) => p.hash }),
      P('hashCount', 'Marks per side', 'int', BASE.hashCount, { min: 1, max: 40, show: (p) => p.hash }),
      R('hashLen', 'Tick length', 1, 40, 0.5, { show: (p) => p.hash && p.hashStyle === 'ticks' }),
      P('majorEvery', 'Major every', 'int', BASE.majorEvery, { min: 0, max: 10, show: (p) => p.hash && p.hashStyle === 'ticks', tip: '0 = no major ticks' }),
      R('majorLen', 'Major length', 1, 60, 0.5, { show: (p) => p.hash && p.hashStyle === 'ticks' && p.majorEvery > 0 }),
      P('hashNumbers', 'Numbers on majors', 'bool', BASE.hashNumbers, { show: (p) => p.hash && p.hashStyle === 'ticks' && p.majorEvery > 0 }),
      P('hashAccent', 'Use accent color', 'bool', BASE.hashAccent, { tip: 'Hash marks and BDC in the accent color' }),

      { type: 'section', label: 'Bullet drop (BDC)', collapsed: true },
      P('bdc', 'BDC', 'select', BASE.bdc, { options: [['none', 'None'], ['stadia', 'Stadia lines'], ['ticks', 'Ticks'], ['dots', 'Dots']] }),
      P('bdcStem', 'Vertical stem', 'bool', BASE.bdcStem, { show: (p) => p.bdc !== 'none' }),
      P('bdcCount', 'Count', 'int', BASE.bdcCount, { min: 1, max: 12, show: (p) => p.bdc !== 'none' }),
      R('bdcStart', 'Start below center', 0, 200, 0.5, { show: (p) => p.bdc !== 'none' }),
      R('bdcSpacing', 'Spacing', 2, 80, 0.5, { show: (p) => p.bdc !== 'none' }),
      R('bdcGrowth', 'Spacing growth', 0, 0.5, 0.01, { show: (p) => p.bdc !== 'none' }),
      R('bdcWidth', 'Width', 2, 160, 0.5, { show: has('bdc', 'stadia', 'ticks') }),
      P('bdcNumbers', 'Range numbers', 'bool', BASE.bdcNumbers, { show: has('bdc', 'stadia', 'ticks') }),
      P('bdcFirst', 'First number', 'int', BASE.bdcFirst, { min: 0, max: 20, show: (p) => p.bdc !== 'none' && p.bdcNumbers }),
      P('bdcStep', 'Number step', 'int', BASE.bdcStep, { min: 1, max: 5, show: (p) => p.bdc !== 'none' && p.bdcNumbers }),

      { type: 'section', label: 'Extras', collapsed: true },
      P('sideMarkers', 'Side triangles', 'int', BASE.sideMarkers, { min: 0, max: 6 }),
      P('prism', 'Prism arc + brackets', 'bool', BASE.prism),
      P('rangefinder', 'Rangefinder scale', 'bool', BASE.rangefinder),

      { type: 'section', label: 'Lens' },
      { key: 'lens', label: 'Lens size', type: 'range', min: 0.3, max: 1, step: 0.01, default: 0.86 },
      { key: 'soft', label: 'Edge softness', type: 'range', min: 0, max: 0.4, step: 0.01, default: 0.04, show: (p) => !p.reticleOnly },
      { key: 'vignette', label: 'Inner shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, show: (p) => !p.reticleOnly },
      { key: 'maskColor', label: 'Mask color', type: 'color', default: '#000000', show: (p) => !p.reticleOnly },
      { key: 'tintAmt', label: 'Lens tint', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0, show: (p) => !p.reticleOnly },
      { key: 'tint', label: 'Tint color', type: 'color', default: '#3c6e8f', show: (p) => !p.reticleOnly && p.tintAmt > 0 },

      { type: 'section', label: 'Housing', collapsed: true, show: (p) => !p.reticleOnly },
      { key: 'housing', label: 'Housing ring', type: 'bool', default: true },
      { key: 'housingW', label: 'Ring width', type: 'range', min: 2, max: 120, step: 0.5, default: 26, show: (p) => p.housing },
      { key: 'housingColor', label: 'Ring color', type: 'color', default: '#2b2a26', show: (p) => p.housing },
      { key: 'housingShade', label: 'Bevel', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => p.housing },
    ].map((d) => (d.key && d.key in DEFAULTS ? Object.assign(d, { default: DEFAULTS[d.key] }) : d)),
    presets: [
      // Realistic: real-world optic types, built on the internal reticle presets
      { name: 'Hunting duplex', group: 'Realistic', values: { preset: 'duplex', thickness: 1.5, postW: 8, tintAmt: 0.06, tint: '#7a9fb0', housingColor: '#1c1c1c', housingW: 34 } },
      { name: 'German #4 illuminated', group: 'Realistic', values: { preset: 'german4', center: 'dot', dotSize: 5, accent: '#ff2a12', glow: true, glowSize: 10, housingColor: '#242424', tintAmt: 0.05, tint: '#c9a76a' } },
      { name: 'Mil-dot sniper', group: 'Realistic', values: { preset: 'mildot', thickness: 1.5, tintAmt: 0.1, tint: '#4a7fa6', vignette: 0.7, housingColor: '#2e3a2a' } },
      { name: 'Red dot optic', group: 'Realistic', values: { preset: 'custom', lines: false, posts: 'none', hash: false, center: 'dot', dotSize: 12, accent: '#ff2410', glow: true, glowSize: 16, lens: 0.62, soft: 0.02, vignette: 0.3, tintAmt: 0.14, tint: '#5aa0c8', housingW: 70, housingColor: '#1e1e1e', housingShade: 0.7 } },
      // Mosin-Nagant PU 3.5x: three thin posts, no crosshair. The pointed bottom post's tip is the aim point and sits
      // level with the top edge of the side posts (side posts offset down by half their thickness); small field of view, warm aged glass, strong edge darkening, thick blued tube
      { name: 'Mosin PU 3.5x', group: 'Realistic', values: { preset: 'pu', postStart: 0.05, postW: 5, postOffsetY: 2.5, color: '#0a0a0a', lens: 0.78, soft: 0.06, vignette: 0.75, tintAmt: 0.16, tint: '#c8a86a', maskColor: '#000000', housingColor: '#1a1b1a', housingW: 40, housingShade: 0.6 } },
      { name: 'Holographic sight', group: 'Realistic', values: { preset: 'hhs', accent: '#ff3a24', glow: true, glowSize: 6, lens: 0.72, vignette: 0.2, tintAmt: 0.08, tint: '#c0a060', housingW: 48, housingColor: '#2a2a2a' } },

      // Stylized
      { name: 'Vintage brass', group: 'Stylized', values: { preset: 'fine', thickness: 1.5, color: '#2a1a0a', maskColor: '#140d06', tintAmt: 0.3, tint: '#b88a4a', vignette: 0.8, soft: 0.1, housingColor: '#b8862e', housingW: 40, housingShade: 0.8 } },
      { name: 'Blueprint', group: 'Stylized', values: { preset: 'ff', color: '#e8f4ff', accent: '#ffffff', maskColor: '#0b2a4f', tintAmt: 0.6, tint: '#1a4f8a', vignette: 0.25, housing: false } },
      { name: 'Night vision', group: 'Stylized', values: { preset: 'tac30', color: '#b6ffb0', accent: '#d8ffd0', glow: true, glowSize: 10, lines: true, lineGap: 34, lineExtent: 0.6, thickness: 1.5, tintAmt: 0.6, tint: '#2aff4a', maskColor: '#000000', vignette: 0.9, soft: 0.12, housingColor: '#1a1a1a' } },
      { name: 'Cel-shaded toy', group: 'Stylized', values: { preset: 'duplex', thickness: 4, postW: 18, color: '#1a1a2a', center: 'circle', centerSize: 22, centerThick: 5, accent: '#ff3a6a', maskColor: '#1a1a2a', vignette: 0, soft: 0, tintAmt: 0.2, tint: '#8fe0ff', housingColor: '#ffcc22', housingW: 40, housingShade: 0.15 } },

      // Game-inspired (general look only)
      { name: 'Tarkov-style PSO-1', group: 'Game-inspired', values: { preset: 'pso', scale: 1.3, color: '#151515', accent: '#ff5a1a', glow: true, glowSize: 5, tintAmt: 0.18, tint: '#d89a3a', vignette: 0.75, housingColor: '#22261c', housingW: 36 } },
      { name: 'Tarkov-style TA01 ACOG', group: 'Game-inspired', values: { preset: 'ta01', scale: 2.4, thickness: 2.5, dotSize: 4, accent: '#ff2a1a', glow: true, glowSize: 6, lens: 0.7, tintAmt: 0.12, tint: '#c8a050', housingW: 54, housingColor: '#2a2824' } },
      { name: 'Tarkov-style Valday PS-320', group: 'Game-inspired', values: { accent: '#ff3020', hashAccent: true, glow: true, glowSize: 4, tintAmt: 0.12, tint: '#a08a50', housingColor: '#2c2f28', housingW: 30 } },
      { name: 'CS-style AWP scope', group: 'Game-inspired', values: { preset: 'fine', thickness: 1.5, lens: 1, soft: 0.02, vignette: 0.35, housing: false } },
      { name: 'Valorant-style Operator', group: 'Game-inspired', values: { preset: 'fine', thickness: 1.5, lineGap: 14, center: 'dot', dotSize: 7, accent: '#5affe6', glow: true, glowSize: 6, maskColor: '#0e1114', tintAmt: 0.12, tint: '#3ad6c0', vignette: 0.4, housingColor: '#e8e3d8', housingW: 18, housingShade: 0.3 } },
      { name: 'CoD-style sniper', group: 'Game-inspired', values: { preset: 'ff', thickness: 1.5, center: 'dot', dotSize: 6, accent: '#ff2a1a', glow: true, glowSize: 6, tintAmt: 0.18, tint: '#5a8aa8', vignette: 0.75, housingColor: '#141414', housingW: 30 } },
      { name: 'Battlefield-style PKS-07', group: 'Game-inspired', values: { preset: 'pu', postW: 7, rangefinder: true, color: '#0a0a0a', tintAmt: 0.2, tint: '#c8a860', vignette: 0.6, housingColor: '#26281e', housingW: 34 } },
      { name: 'R6-style ACOG', group: 'Game-inspired', values: { preset: 'acog', accent: '#ff2a1a', glow: true, glowSize: 8, lens: 0.74, tintAmt: 0.1, tint: '#c0a060', housingW: 50, housingColor: '#1c1c1c' } },
      { name: 'Apex-style digital threat', group: 'Game-inspired', values: { preset: 'tac30', centerSize: 34, centerThick: 3, dotSize: 3, ringTicks: true, accent: '#ff1e1e', glow: true, glowSize: 18, tintAmt: 0.4, tint: '#2a0a0a', lens: 0.7, housingW: 54, housingColor: '#2c2c30', housingShade: 0.6 } },
      { name: 'PUBG-style 8x', group: 'Game-inspired', values: { preset: 'mk4', center: 'dot', dotSize: 5, accent: '#ff2a1a', hashAccent: false, glow: true, glowSize: 6, tintAmt: 0.1, tint: '#8aa0a8', housingColor: '#1e1e1e' } },
      { name: 'Halo-style sniper', group: 'Game-inspired', values: { preset: 'custom', lines: true, lineGap: 40, lineExtent: 0.8, thickness: 1.5, posts: 'none', hash: false, center: 'circle', centerSize: 30, centerThick: 2, ringTicks: true, rangefinder: true, color: '#9ad8ff', accent: '#9ad8ff', glow: true, glowSize: 8, maskColor: '#060c14', tintAmt: 0.35, tint: '#1a5a8a', vignette: 0.5, housingColor: '#3a4450', housingW: 22 } },
      { name: 'Doom-style precision bolt', group: 'Game-inspired', values: { preset: 'ta11', accent: '#ff6a1a', hashAccent: true, glow: true, glowSize: 10, sideMarkers: 2, maskColor: '#140202', tintAmt: 0.3, tint: '#8a1a0a', vignette: 0.7, housingColor: '#3a2a22', housingW: 40, housingShade: 0.8 } },

      // Sci-fi
      { name: 'Holo HUD (reticle only)', group: 'Sci-fi', values: { preset: 'prism', reticleOnly: true, accent: '#40e8ff', color: '#40e8ff', glow: true, glowSize: 10, lens: 0.9 } },
      { name: 'Plasma rifle optic', group: 'Sci-fi', values: { preset: 'hamr', color: '#c0a0ff', accent: '#ff40ff', hashAccent: true, glow: true, glowSize: 12, maskColor: '#0a0018', tintAmt: 0.35, tint: '#4a1a8a', vignette: 0.6, housingColor: '#2a2a40', housingW: 30, housingShade: 0.9 } },
      { name: 'Alien bio-optic', group: 'Sci-fi', values: { preset: 'bravo', color: '#8aff4a', accent: '#c8ff3a', hashAccent: true, glow: true, glowSize: 14, maskColor: '#0c0612', tintAmt: 0.4, tint: '#3a8a1a', vignette: 0.8, soft: 0.15, housingColor: '#3a1a4a', housingW: 50, housingShade: 1 } },
      { name: 'Orbital targeting', group: 'Sci-fi', values: { preset: 'vudu', hashCount: 12, hashSpacing: 16, hashLen: 4, majorEvery: 4, majorLen: 12, hashNumbers: true, center: 'circle', centerSize: 14, centerThick: 2, accent: '#ffd23a', glow: true, glowSize: 6, maskColor: '#020a0a', tintAmt: 0.3, tint: '#0a6a6a', vignette: 0.4, housingColor: '#1a2a2a', housingW: 16 } },
    ],

    render(ctx, W, H, p) {
      const S = Math.min(W, H), k = S / 512, cx = W / 2, cy = H / 2, Rl = (p.lens * S) / 2, TAU = U.TAU;
      const sc = k * p.scale, t = Math.max(0.5, p.thickness * k);

      const only = p.reticleOnly;
      if (!only && p.tintAmt > 0) {
        ctx.fillStyle = U.rgba(p.tint, p.tintAmt);
        ctx.beginPath(); ctx.arc(cx, cy, Rl, 0, TAU); ctx.fill();
      }

      const layer = (color) => {
        const c = U.canvas(W, H), g = c.getContext('2d');
        g.translate(cx, cy);
        g.fillStyle = g.strokeStyle = color;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `600 ${Math.max(6, 11 * sc)}px system-ui, sans-serif`;
        return { c, g };
      };
      const main = layer(p.color), acc = layer(p.accent), hashL = p.hashAccent ? acc : main;
      // posts that reach past the lens get their own layer: under the lens mask + housing like the rest of the
      // reticle, but not clipped to the lens circle in reticle-only mode (there they run to the image edge)
      const postsOut = p.posts !== 'none' && p.postEnd * (Math.max(W, H) / 2) > Rl, postL = postsOut ? layer(p.color) : main;
      const hl = (g, x0, x1, y, th) => g.fillRect(x0, y - th / 2, x1 - x0, th);
      const vl = (g, y0, y1, x, th) => g.fillRect(x - th / 2, y0, th, y1 - y0);
      const disc = (g, x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };

      /* thin crosshair */
      if (p.lines) {
        const g = main.g, E = p.lineExtent * Rl, gap = p.lineGap * sc;
        hl(g, -E, -gap, 0, t); hl(g, gap, E, 0, t); vl(g, gap, E, 0, t);
        if (p.lineTop) vl(g, -E, -gap, 0, t);
      }

      /* posts */
      if (p.posts !== 'none') {
        // postEnd is a fraction of the distance from the center to the image edge in the post's direction
        // (1 = the very edge of the image; a pixel of overshoot so nothing anti-aliases at the border)
        const g = postL.g, ps = p.postStart * Rl, pw = p.postW * k;
        const post = (ang, start, style) => {
          const edge = Math.abs(Math.cos(ang)) > 0.5 ? W / 2 : H / 2, end = p.postEnd * edge + (p.postEnd >= 1 ? 1 : 0);
          if (end - start < 0.5) return; // nothing left between start and end
          g.save();
          if (Math.abs(Math.cos(ang)) > 0.5) g.translate(0, p.postOffsetY * k); // left / right posts only
          g.rotate(ang);
          const tl = Math.min(pw * 4, Math.max(0, end - start) * 0.5);
          g.beginPath();
          if (style === 'tapered') {
            g.moveTo(start, 0); g.lineTo(start + tl, -pw / 2); g.lineTo(end, -pw / 2); g.lineTo(end, pw / 2); g.lineTo(start + tl, pw / 2); g.closePath(); g.fill();
          } else if (style === 'hollow') {
            g.lineWidth = Math.max(0.5, t * 0.8); g.strokeRect(start, -pw / 2, end - start, pw);
          } else { g.rect(start, -pw / 2, end - start, pw); g.fill(); }
          g.restore();
        };
        post(0, ps, p.posts); post(Math.PI, ps, p.posts);
        if (p.postSides !== 'sides') {
          if (p.postPoint && p.postSides === 'sidesBottom') post(Math.PI / 2, 0, 'tapered');
          else post(Math.PI / 2, ps, p.posts);
        }
        if (p.postSides === 'all') post(-Math.PI / 2, ps, p.posts);
      }

      /* hash marks (with their own axis line) */
      if (p.hash) {
        const g = hashL.g, sp = p.hashSpacing * sc, n = p.hashCount, ext = sp * n, th = Math.max(0.5, t * 0.8);
        const gap = Math.min(p.hashGap * sc, ext); // the axis line starts this far from the center
        const doH = p.hashAxes !== 'v', doV = p.hashAxes !== 'h';
        if (p.hashStyle === 'ticks') {
          if (doH) { hl(g, -ext, -gap, 0, th); hl(g, gap, ext, 0, th); }
          if (doV) { vl(g, -ext, -gap, 0, th); vl(g, gap, ext, 0, th); }
        }
        for (let i = 1; i <= n; i++) {
          const d = i * sp, major = p.majorEvery > 0 && i % p.majorEvery === 0;
          if (d < gap - 0.01) continue; // culled: inside the center gap
          for (const s of [-1, 1]) {
            if (p.hashStyle === 'dots') {
              const r = Math.max(t * 1.1, 2.6 * sc);
              if (doH) disc(g, s * d, 0, r);
              if (doV) disc(g, 0, s * d, r);
              continue;
            }
            const L = (major ? p.majorLen : p.hashLen) * sc;
            if (doH) vl(g, -L / 2, L / 2, s * d, th);
            if (doV) hl(g, -L / 2, L / 2, s * d, th);
            if (major && p.hashNumbers) {
              if (doH) g.fillText(String(i), s * d, -L / 2 - 8 * sc);
              if (doV && s > 0) g.fillText(String(i), L / 2 + 10 * sc, s * d);
            }
          }
        }
      }

      /* bullet drop compensator */
      if (p.bdc !== 'none') {
        const g = hashL.g, ys = [];
        for (let i = 0; i < p.bdcCount; i++) ys.push((p.bdcStart + p.bdcSpacing * i * (1 + p.bdcGrowth * i)) * sc);
        const last = ys[ys.length - 1];
        if (p.bdcStem) vl(g, p.bdcStart * sc - (p.bdc === 'stadia' ? p.bdcStart * sc : 0), Math.min(Rl, last + 14 * sc), 0, t);
        ys.forEach((y, i) => {
          if (p.bdc === 'dots') { disc(g, 0, y, Math.max(t * 0.9, 2 * sc)); return; }
          const w = (p.bdc === 'stadia' ? p.bdcWidth * (1 - i / (p.bdcCount + 1)) : p.bdcWidth) * sc;
          hl(g, -w / 2, w / 2, y, p.bdc === 'stadia' ? t * 1.4 : t);
          if (p.bdcNumbers) {
            g.textAlign = 'left';
            g.fillText(String(p.bdcFirst + i * p.bdcStep), w / 2 + 5 * sc, y);
            g.textAlign = 'center';
          }
        });
      }

      /* center element */
      {
        const g = acc.g, cs = p.centerSize * sc, ct = Math.max(0.5, p.centerThick * sc), dr = (p.dotSize * sc) / 2;
        g.lineWidth = ct;
        switch (p.center) {
          case 'dot': disc(g, 0, 0, dr); break;
          case 'circle':
          case 'circledot':
            g.beginPath(); g.arc(0, 0, cs, 0, TAU); g.stroke();
            if (p.ringTicks) { const tl = cs * 0.3; hl(g, cs, cs + tl, 0, ct); hl(g, -cs - tl, -cs, 0, ct); vl(g, cs, cs + tl, 0, ct); vl(g, -cs - tl, -cs, 0, ct); }
            if (p.center === 'circledot') disc(g, 0, 0, dr);
            break;
          case 'horseshoe':
            g.beginPath(); g.arc(0, 0, cs, Math.PI / 2 + 0.75, Math.PI / 2 - 0.75 + TAU); g.stroke();
            disc(g, 0, 0, dr);
            break;
          case 'chevron': {
            const chev = (y0, size) => {
              const w = size * 0.85, off = ct / 2 / (w / Math.hypot(w, size)); // miter tip lands on y0
              g.beginPath(); g.moveTo(-w, y0 + size + off); g.lineTo(0, y0 + off); g.lineTo(w, y0 + size + off); g.stroke();
            };
            g.lineJoin = 'miter'; g.miterLimit = 10;
            chev(0, cs);
            for (let i = 1; i <= p.centerStack; i++) chev(cs * (0.9 + i * 1.1), cs * 0.75);
            break;
          }
          case 'triangle':
            g.beginPath(); g.moveTo(0, 0); g.lineTo(cs * 0.6, cs); g.lineTo(-cs * 0.6, cs); g.closePath(); g.fill();
            break;
        }
      }

      /* extras */
      if (p.sideMarkers > 0) {
        const g = hashL.g, sz = 5 * sc;
        for (let i = 1; i <= p.sideMarkers; i++) {
          for (const s of [-1, 1]) {
            const x = s * (20 + i * 30) * sc;
            g.beginPath(); g.moveTo(x - s * sz, 0); g.lineTo(x + s * sz * 0.6, -sz); g.lineTo(x + s * sz * 0.6, sz); g.closePath(); g.fill();
          }
        }
      }
      if (p.prism) {
        /* Prism-style: thick top arc, two short bottom arc segments, thin side brackets on the same
           circle, and wing dots next to the center. All concentric with the aim point. */
        const g = acc.g, pr = 58 * sc, lw = 8 * sc, bt = Math.max(1, 2.4 * sc), deg = Math.PI / 180;
        const seg = (a0, a1) => { g.beginPath(); g.arc(0, 0, pr, a0 * deg, a1 * deg); g.stroke(); };
        g.lineWidth = lw; g.lineCap = 'butt';
        seg(-90 - 58, -90 + 58);          // top arc
        seg(90 + 34, 90 + 58);            // bottom-left segment
        seg(90 - 58, 90 - 34);            // bottom-right segment
        const bx = pr + lw / 2 - bt / 2;  // brackets sit on the arc's outer edge
        const top = pr * Math.sin(-26 * deg), bot = pr * Math.sin(26 * deg);
        for (const s of [-1, 1]) {
          const x = s * bx, inward = (len) => [Math.min(x, x - s * len), Math.max(x, x - s * len)];
          vl(g, top, bot, x, bt);
          hl(g, ...inward(9 * sc), top + bt / 2, bt);
          hl(g, ...inward(9 * sc), bot - bt / 2, bt);
          hl(g, ...inward(16 * sc), 0, bt);  // longer center tick pointing at the aim point
          disc(g, s * 24 * sc, 0, Math.max(1, 2.2 * sc)); // wing dots beside the center ring
        }
      }
      if (p.rangefinder) {
        const g = main.g, x0 = -Rl * 0.72, x1 = -Rl * 0.2, y0 = Rl * 0.5, h = Rl * 0.16, th = Math.max(0.5, t * 0.8);
        hl(g, x0, x1, y0, th);
        g.lineWidth = th;
        g.beginPath();
        for (let i = 0; i <= 40; i++) {
          const f = i / 40, x = x0 + (x1 - x0) * f, y = y0 - h * (0.15 + 0.85 / (1 + f * 6));
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
        const labels = [2, 4, 6, 8, 10];
        labels.forEach((n, i) => {
          const x = x0 + ((x1 - x0) * (i + 0.5)) / labels.length;
          vl(g, y0, y0 + 5 * sc, x, th);
          g.fillText(String(n), x, y0 + 13 * sc);
        });
      }

      /* composite: main lines, then accent (optionally glowing) */
      ctx.save();
      if (only) { ctx.beginPath(); ctx.arc(cx, cy, Rl, 0, TAU); ctx.clip(); } // the mask normally hides the overshoot
      ctx.drawImage(main.c, 0, 0);
      if (postsOut && !only) ctx.drawImage(postL.c, 0, 0);
      if (p.glow) {
        ctx.save();
        ctx.shadowColor = p.accent; ctx.shadowBlur = p.glowSize * k;
        ctx.drawImage(acc.c, 0, 0); ctx.drawImage(acc.c, 0, 0);
        ctx.restore();
      }
      ctx.drawImage(acc.c, 0, 0);
      ctx.restore();
      if (only) { if (postsOut) ctx.drawImage(postL.c, 0, 0); return; }

      /* lens mask: opaque outside, soft edge, inner shadow */
      const m = U.canvas(W, H), mg = m.getContext('2d');
      mg.fillStyle = p.maskColor; mg.fillRect(0, 0, W, H);
      mg.globalCompositeOperation = 'destination-out';
      const hole = mg.createRadialGradient(cx, cy, Rl * (1 - p.soft), cx, cy, Rl + 0.5);
      hole.addColorStop(0, 'rgba(0,0,0,1)'); hole.addColorStop(1, 'rgba(0,0,0,0)');
      mg.fillStyle = hole; mg.beginPath(); mg.arc(cx, cy, Rl + 1, 0, TAU); mg.fill();
      if (p.vignette > 0) {
        mg.globalCompositeOperation = 'source-over';
        const v = mg.createRadialGradient(cx, cy, Rl * 0.55, cx, cy, Rl);
        v.addColorStop(0, U.rgba(p.maskColor, 0)); v.addColorStop(1, U.rgba(p.maskColor, p.vignette));
        mg.fillStyle = v; mg.beginPath(); mg.arc(cx, cy, Rl, 0, TAU); mg.fill();
      }
      ctx.drawImage(m, 0, 0);

      /* housing ring with a simple bevel */
      if (p.housing) {
        const hw = p.housingW * k, base = U.hex(p.housingColor);
        const shade = (f) => `rgb(${base.map((c) => Math.round(U.clamp(c * f, 0, 255))).join(',')})`;
        const gr = ctx.createRadialGradient(cx, cy, Rl, cx, cy, Rl + hw);
        gr.addColorStop(0, shade(1 + p.housingShade * 1.2));
        gr.addColorStop(0.18, shade(1));
        gr.addColorStop(0.7, shade(1 - p.housingShade * 0.35));
        gr.addColorStop(1, shade(1 - p.housingShade * 0.7));
        ctx.strokeStyle = gr; ctx.lineWidth = hw;
        ctx.beginPath(); ctx.arc(cx, cy, Rl + hw / 2, 0, TAU); ctx.stroke();
      }
    },
  });
})();
