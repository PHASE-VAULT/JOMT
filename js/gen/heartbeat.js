/* Heartbeat monitor tilesheet: an ECG trace in the style of survival-horror status screens (green "fine",
   amber "caution", red "danger", purple "poison"), as a seamless loop.
   The trace is drawn on a "tape" coordinate s, measured in beats. Sweep mode: a bright head runs across the
   frame a whole number of times per loop, leaving a fading trail. Scroll mode: the head stays put and the
   tape slides left by a whole number of beats per loop. Per-beat variation (irregular rhythm, extra beats)
   is seeded by beat index and sweep number, both taken modulo the loop, so frame t = 1 equals frame t = 0. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, lerp, TAU } = U;
  const frac = (x) => x - Math.floor(x);
  const mod = (a, n) => ((a % n) + n) % n;
  const G = (x, c, w) => { const d = (x - c) / w; return Math.exp(-d * d); };
  const NOISE_F = [17, 29, 47, 71];

  // one beat, phase 0..1 -> height (R peak = 1): P wave, Q dip, R spike, S dip, T wave
  function beatShape(x, p, j) {
    const w = p.qrsWidth * j.wide, c = 0.5; // R peak in the middle of the beat
    return p.pWave * 0.14 * G(x, 0.3, 0.035)
      - p.qDepth * 0.1 * G(x, c - 0.028 * w, 0.009 * w)
      + p.rAmp * j.amp * G(x, c, 0.011 * w)
      - p.sDepth * 0.28 * G(x, c + 0.03 * w, 0.012 * w)
      + p.tWave * 0.28 * j.tw * G(x, 0.76, 0.055);
  }

  function makeWave(p) {
    const seed = p.seed | 0, irr = p.irregular, cache = new Map();
    const r0 = U.rng(seed * 31 + 7), ph = NOISE_F.map(() => r0() * TAU);
    const jit = (bi, pass) => {
      const key = bi * 64 + pass;
      let j = cache.get(key);
      if (j) return j;
      const r = U.rng(seed * 9973 + bi * 131 + pass * 7919 + 17);
      j = { amp: 1 + (r() - 0.5) * 1.1 * irr, shift: (r() - 0.5) * 0.16 * irr, tw: 1 + (r() - 0.5) * irr, wide: 1 };
      if (r() < irr * 0.25) { j.wide = 2.2; j.amp *= 0.75; j.tw *= -0.8; } // extra (ectopic) beat: wide, inverted T
      cache.set(key, j);
      return j;
    };
    // s: tape position in beats; period: beat indices repeat after this many beats; pass: sweep number
    return (s, period, pass) => {
      const bi = Math.floor(s), j = jit(mod(bi, period), pass);
      let v = beatShape(frac(s) - j.shift, p, j);
      if (p.noise > 0) {
        let n = 0;
        for (let k = 0; k < NOISE_F.length; k++) n += Math.sin(TAU * NOISE_F[k] * s + ph[k] + pass * 2.39 * (k + 1)) / (k + 1);
        v += n * p.noise * 0.06;
      }
      return v;
    };
  }

  U.register({
    id: 'heartbeat',
    name: 'Heartbeat Monitor',
    desc: 'Looping ECG heartbeat tilesheets: survival-horror status screen traces with fading trail, glow, grid and pixel look',
    uses: ['Animated "condition" / health status displays for survival-horror inventory screens and HUDs.', 'Hospital monitors, sci-fi med bays and lab screens as flipbook textures on in-game displays.'],
    tags: ['Horror', 'UI'],
    aspect: '1:1',
    bg: 'black',
    animLoop: true,
    animate(p, f) { p.time = (p.time || 0) + f.t; return p; },
    icon: U.icon('<path d="M2 13h4.5l1.5-3 2.5 8 3-14 2 9h6.5"/>'),
    params: [
      { type: 'section', label: 'Rhythm' },
      { key: 'mode', label: 'Trace', type: 'select', default: 'sweep', options: [['sweep', 'Sweep (head runs across, trail fades)'], ['scroll', 'Scroll (tape slides left)']] },
      { key: 'beats', label: 'Beats across', type: 'int', min: 1, max: 10, default: 1, tip: 'Heartbeats visible across the frame. With an odd count a peak sits in the middle' },
      { key: 'sweeps', label: 'Sweeps per loop', type: 'int', min: 1, max: 4, default: 1, show: (p) => p.mode === 'sweep', tip: 'How often the head crosses the frame per loop (whole steps so the loop stays seamless)' },
      { key: 'scrollBeats', label: 'Beats per loop', type: 'int', min: 1, max: 12, default: 3, show: (p) => p.mode === 'scroll', tip: 'How many beats slide past per loop (whole steps so the loop stays seamless)' },
      { key: 'headPos', label: 'Head position', type: 'range', min: 0.3, max: 1, step: 0.01, default: 0.88, show: (p) => p.mode === 'scroll' },
      { key: 'irregular', label: 'Irregularity', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Uneven beats: height and timing change from beat to beat, with occasional wide extra beats' },
      { key: 'noise', label: 'Jitter', type: 'range', min: 0, max: 1, step: 0.01, default: 0.05, tip: 'Fine shaky noise on the trace' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 3 },
      { key: 'time', label: 'Time', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, tip: 'Moment of the loop shown in single-frame mode (in the tilesheet it is the start offset)' },

      { type: 'section', label: 'Waveform' },
      { key: 'baseline', label: 'Baseline', type: 'range', min: 0.2, max: 0.9, step: 0.01, default: 0.62, tip: 'Vertical position of the flat line' },
      { key: 'amplitude', label: 'Amplitude', type: 'range', min: 0.05, max: 0.6, step: 0.01, default: 0.42, tip: 'Height of the main spike as a share of the frame' },
      { key: 'rAmp', label: 'Spike (QRS)', type: 'range', min: 0, max: 1.5, step: 0.01, default: 1, tip: '0 = flatline' },
      { key: 'qrsWidth', label: 'Spike width', type: 'range', min: 0.4, max: 3, step: 0.05, default: 1 },
      { key: 'qDepth', label: 'Q dip', type: 'range', min: 0, max: 2, step: 0.01, default: 1 },
      { key: 'sDepth', label: 'S dip', type: 'range', min: 0, max: 2, step: 0.01, default: 1 },
      { key: 'pWave', label: 'P wave', type: 'range', min: 0, max: 2, step: 0.01, default: 1 },
      { key: 'tWave', label: 'T wave', type: 'range', min: -1, max: 2, step: 0.01, default: 1 },

      { type: 'section', label: 'Trace' },
      { key: 'thickness', label: 'Thickness', type: 'range', min: 0.004, max: 0.06, step: 0.001, default: 0.018, tip: 'Line width as a share of the frame height' },
      { key: 'tail', label: 'Trail length', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.55, tip: 'Share of the width that stays visible behind the head' },
      { key: 'tailCurve', label: 'Trail falloff', type: 'range', min: 0.3, max: 4, step: 0.05, default: 1.4, tip: 'Above 1 the trail fades quickly behind the head, below 1 it lingers' },
      { key: 'afterglow', label: 'Afterglow', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0, tip: 'Faint copy of the older trace that stays on screen' },
      { key: 'gap', label: 'Erase gap', type: 'range', min: 0, max: 0.3, step: 0.005, default: 0.04, show: (p) => p.mode === 'sweep' && p.afterglow > 0, tip: 'Blank space in front of the head' },
      { key: 'headSize', label: 'Head dot', type: 'range', min: 0, max: 4, step: 0.05, default: 1.6, tip: 'Bright point at the writing head (relative to the line width)' },
      { key: 'lineColor', label: 'Line color', type: 'color', default: '#38ff6a' },
      { key: 'hotCore', label: 'Hot core', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, tip: 'Whiter, thinner line in the middle of the trace' },
      { key: 'glow', label: 'Glow', type: 'range', min: 0, max: 1.5, step: 0.01, default: 0.7 },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 0.01, max: 0.15, step: 0.005, default: 0.04, show: (p) => p.glow > 0 },

      { type: 'section', label: 'Screen' },
      { key: 'panel', label: 'Background', type: 'select', default: 'none', options: [['none', 'Transparent'], ['solid', 'Dark screen']] },
      { key: 'bgColor', label: 'Screen color', type: 'color', default: '#020a05', show: (p) => p.panel === 'solid' },
      { key: 'grid', label: 'Grid cells', type: 'int', min: 0, max: 24, default: 0, tip: 'Monitor grid: cells across the width (0 = off)' },
      { key: 'gridColor', label: 'Grid color', type: 'color', default: '#1d6a34', show: (p) => p.grid > 0 },
      { key: 'gridAlpha', label: 'Grid opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.grid > 0 },
      { key: 'scanlines', label: 'Scanlines', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Dark CRT lines across the image' },
      { key: 'scanSize', label: 'Scanline spacing', type: 'int', min: 2, max: 12, default: 3, show: (p) => p.scanlines > 0, tip: 'In output pixels' },
      { key: 'vignette', label: 'Vignette', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.panel === 'solid' },
      { key: 'pixels', label: 'Pixel grid', type: 'int', min: 0, max: 256, default: 0, tip: 'Renders on a coarse pixel grid with this many pixels across, like old console menus (0 = off)' },

      { type: 'section', label: 'Label', active: (p) => !!p.label },
      { key: 'label', label: 'Text', type: 'text', default: '', max: 16, tip: 'Status word on the screen, e.g. FINE, CAUTION, DANGER (empty = none)' },
      { key: 'labelPos', label: 'Position', type: 'select', default: 'tl', options: [['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right']], show: (p) => !!p.label },
      { key: 'labelSize', label: 'Size', type: 'range', min: 0.06, max: 0.3, step: 0.005, default: 0.14, show: (p) => !!p.label, tip: 'Share of the frame height' },
      { key: 'labelFont', label: 'Font', type: 'select', default: 'serif', options: [['serif', 'Serif'], ['sans', 'Sans'], ['mono', 'Mono']], show: (p) => !!p.label },
      { key: 'labelColor', label: 'Color', type: 'color', default: '#38ff6a', show: (p) => !!p.label },

      { type: 'section', label: 'Output' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Color + alpha'], ['additive', 'Color on black (additive)'], ['gray', 'Grayscale + alpha (tint in engine)']] },
      { key: 'brightness', label: 'Brightness', type: 'range', min: 0.2, max: 2, step: 0.01, default: 1 },
    ],
    presets: [
      { name: 'Fine (green)', group: 'Survival horror', values: {} },
      { name: 'Caution (amber)', group: 'Survival horror', values: { irregular: 0.2, noise: 0.1, lineColor: '#ffb21a', labelColor: '#ffb21a', tail: 0.5 } },
      { name: 'Danger (red)', group: 'Survival horror', values: { sweeps: 2, irregular: 0.55, noise: 0.25, amplitude: 0.36, lineColor: '#ff2a1e', labelColor: '#ff2a1e', tail: 0.45, tailCurve: 1.8, glow: 0.9 } },
      { name: 'Poison (purple)', group: 'Survival horror', values: { irregular: 0.35, noise: 0.35, tWave: -0.6, lineColor: '#c04cff', labelColor: '#c04cff', glow: 0.8 } },
      { name: 'Flatline', group: 'Survival horror', values: { rAmp: 0, pWave: 0, tWave: 0, qDepth: 0, sDepth: 0, noise: 0.12, lineColor: '#ff2a1e', tail: 0.8, tailCurve: 0.8 } },
      { name: 'Status screen (labelled)', group: 'Survival horror', values: { panel: 'solid', bgColor: '#030806', label: 'FINE', labelPos: 'tl', labelFont: 'serif', vignette: 0.5, scanlines: 0.25, afterglow: 0.08 } },
      { name: 'Danger screen (labelled)', group: 'Survival horror', values: { panel: 'solid', bgColor: '#0a0202', sweeps: 2, irregular: 0.55, noise: 0.25, amplitude: 0.36, lineColor: '#ff2a1e', label: 'DANGER', labelColor: '#ff2a1e', vignette: 0.6, scanlines: 0.3, afterglow: 0.06, glow: 0.9 } },
      { name: '32-bit console (pixel)', group: 'Retro', values: { pixels: 96, thickness: 0.03, glow: 0.4, hotCore: 0.3, headSize: 1.2, noise: 0 } },
      { name: 'CRT phosphor', group: 'Retro', values: { panel: 'solid', bgColor: '#010804', grid: 10, gridColor: '#1a5a2a', gridAlpha: 0.25, scanlines: 0.45, scanSize: 3, vignette: 0.7, afterglow: 0.12, tail: 0.75, tailCurve: 1, glow: 1 } },
      { name: 'Hospital monitor (scroll)', group: 'Realistic', values: { mode: 'scroll', beats: 2, scrollBeats: 4, panel: 'solid', bgColor: '#02060a', grid: 16, gridColor: '#145a3a', gridAlpha: 0.3, lineColor: '#3aff8a', tail: 0.85, tailCurve: 0.6, hotCore: 0.2, glow: 0.4, noise: 0.03 } },
      { name: 'Arrhythmia', group: 'Realistic', values: { mode: 'scroll', beats: 2, scrollBeats: 6, irregular: 0.8, noise: 0.08, tail: 0.85, tailCurve: 0.7, lineColor: '#ffe04a' } },
      { name: 'Sci-fi med bay', group: 'Sci-fi', values: { lineColor: '#3ce8ff', panel: 'solid', bgColor: '#020a12', grid: 12, gridColor: '#1a6a8a', gridAlpha: 0.3, glow: 1, hotCore: 0.7, afterglow: 0.1 } },
      { name: 'White (tint in engine)', group: 'Sci-fi', values: { output: 'gray', lineColor: '#ffffff', hotCore: 0 } },
    ],
    render(ctx, W, H, p) {
      const t = frac(p.time || 0), pixel = p.pixels > 0;
      const gw = pixel ? Math.max(8, p.pixels | 0) : W, gh = pixel ? Math.max(4, Math.round(gw * H / W)) : H;
      const fc = U.canvas(gw, gh), fx = fc.getContext('2d');
      const col = U.hex(p.lineColor), br = p.brightness;

      // ---- screen background ----
      if (p.panel === 'solid') {
        fx.fillStyle = p.bgColor; fx.fillRect(0, 0, gw, gh);
        if (p.vignette > 0) {
          const g = fx.createRadialGradient(gw / 2, gh / 2, Math.min(gw, gh) * 0.2, gw / 2, gh / 2, Math.hypot(gw, gh) * 0.6);
          g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${p.vignette * 0.85})`);
          fx.fillStyle = g; fx.fillRect(0, 0, gw, gh);
        }
      }
      if (p.grid > 0) {
        const cw = gw / p.grid, lw = Math.max(1, Math.round(gh / 256));
        fx.fillStyle = U.rgba(p.gridColor, p.gridAlpha);
        for (let i = 1; i < p.grid; i++) fx.fillRect(Math.round(i * cw - lw / 2), 0, lw, gh);
        for (let y = gh / 2 % cw; y < gh; y += cw) if (y > lw) fx.fillRect(0, Math.round(y - lw / 2), gw, lw);
      }

      // ---- trace geometry ----
      const wave = makeWave(p), bv = p.beats | 0, sweep = p.mode !== 'scroll';
      const sw = Math.max(1, p.sweeps | 0), kb = Math.max(1, p.scrollBeats | 0);
      const head = sweep ? frac(t * sw) : p.headPos;
      const tail = p.tail, ag = p.afterglow, gap = sweep ? p.gap : 0;
      // trail brightness for a sample `a` widths behind the head (-1 = not drawn)
      const trail = (a) => {
        if (a < 0) return -1;
        let v = a <= tail ? Math.pow(1 - a / tail, p.tailCurve) : 0;
        if (ag > 0 && (!sweep || a < 1 - gap)) v = Math.max(v, ag);
        return v;
      };
      // sample at u (0..1 across): { y, a (alpha), pass }
      const at = (u) => {
        let a, s, pass, period;
        if (sweep) {
          a = frac(head - u);
          pass = mod(Math.floor(t * sw - a + 1e-9), sw);
          s = u * bv; period = bv;
        } else {
          a = u <= head ? head - u : -1;
          s = u * bv + t * kb; pass = 0; period = kb;
        }
        return { y: gh * (p.baseline - p.amplitude * wave(s, period, pass)), a: trail(a), pass };
      };

      // ---- trace layer: full-strength line, then per-column trail mask ----
      const lc = U.canvas(gw, gh), lx = lc.getContext('2d');
      const lw = Math.max(1, p.thickness * gh);
      const N = gw * 2, pts = [];
      for (let i = 0; i <= N; i++) { const u = i / N; pts.push(Object.assign(at(u), { x: u * gw })); }
      const stroke = (style, width) => {
        lx.strokeStyle = style; lx.lineWidth = width; lx.lineJoin = 'round'; lx.lineCap = 'round';
        lx.beginPath();
        let open = false;
        for (let i = 0; i <= N; i++) {
          const q = pts[i];
          // break the line where nothing is drawn and where a new sweep meets the old one
          if (q.a <= 0) { open = false; continue; }
          if (i > 0 && pts[i - 1].pass !== q.pass) open = false;
          if (!open) { lx.moveTo(q.x, q.y); open = true; } else lx.lineTo(q.x, q.y);
        }
        lx.stroke();
      };
      stroke(p.lineColor, lw);
      if (p.hotCore > 0) {
        const hc = col.map((c) => Math.round(lerp(c, 255, 0.4 + 0.5 * p.hotCore)));
        stroke(`rgba(${hc[0]},${hc[1]},${hc[2]},${clamp(p.hotCore * 1.4)})`, Math.max(pixel ? 1 : 0.6, lw * (0.55 - 0.25 * p.hotCore)));
      }
      const img = lx.getImageData(0, 0, gw, gh), d = img.data;
      const colA = new Float32Array(gw);
      for (let x = 0; x < gw; x++) colA[x] = Math.max(0, at((x + 0.5) / gw).a);
      for (let y = 0, o = 0; y < gh; y++) {
        for (let x = 0; x < gw; x++, o += 4) {
          let a = d[o + 3];
          if (!a) continue;
          if (pixel) a = a > 100 ? 255 : 0; // crisp pixels
          d[o + 3] = a * colA[x];
        }
      }
      lx.putImageData(img, 0, 0);

      // head dot
      if (p.headSize > 0) {
        const hx = head * gw, hy = at(Math.min(head, 0.99999)).y, r = Math.max(pixel ? 1 : 0.8, lw * p.headSize);
        if (pixel) {
          lx.fillStyle = `rgb(${col.map((c) => Math.round(lerp(c, 255, 0.6))).join(',')})`;
          const rr = Math.max(1, Math.round(r * 0.7));
          lx.fillRect(Math.round(hx - rr / 2), Math.round(hy - rr / 2), rr, rr);
        } else {
          const g = lx.createRadialGradient(hx, hy, 0, hx, hy, r * 1.6);
          g.addColorStop(0, 'rgba(255,255,255,1)');
          g.addColorStop(0.35, `rgba(${col[0]},${col[1]},${col[2]},0.95)`);
          g.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
          lx.fillStyle = g; lx.beginPath(); lx.arc(hx, hy, r * 1.6, 0, TAU); lx.fill();
        }
      }

      // label (part of the screen, not the trail)
      if (p.label) {
        const fs = Math.max(pixel ? 5 : 6, p.labelSize * gh), m = fs * 0.45;
        const fam = p.labelFont === 'serif' ? 'Georgia, "Times New Roman", serif' : p.labelFont === 'mono' ? '"Courier New", monospace' : 'Arial, Helvetica, sans-serif';
        lx.font = `bold ${fs}px ${fam}`;
        lx.fillStyle = p.labelColor;
        lx.textAlign = p.labelPos[1] === 'l' ? 'left' : 'right';
        lx.textBaseline = p.labelPos[0] === 't' ? 'top' : 'bottom';
        lx.fillText(p.label, p.labelPos[1] === 'l' ? m : gw - m, p.labelPos[0] === 't' ? m : gh - m);
      }

      // glow: blurred copy of the trace underneath (quarter resolution)
      if (p.glow > 0) {
        const mw = Math.max(4, gw >> 2), mh = Math.max(4, gh >> 2), m = U.canvas(mw, mh), mx = m.getContext('2d');
        mx.drawImage(lc, 0, 0, mw, mh);
        const gi = mx.getImageData(0, 0, mw, mh), bl = U.blurRGBA(gi.data, mw, mh, Math.max(1, p.glowSize * mh * 2), false), gd = gi.data;
        for (let i = 0; i < gd.length; i += 4) {
          const a = bl[i + 3];
          gd[i + 3] = Math.min(255, a * 2.2);
          if (a > 0.01) { gd[i] = bl[i] * 255 / a; gd[i + 1] = bl[i + 1] * 255 / a; gd[i + 2] = bl[i + 2] * 255 / a; }
        }
        mx.putImageData(gi, 0, 0);
        fx.save();
        fx.imageSmoothingEnabled = true;
        fx.globalAlpha = Math.min(1, p.glow);
        if (p.panel === 'solid') fx.globalCompositeOperation = 'lighter';
        fx.drawImage(m, 0, 0, gw, gh);
        if (p.glow > 1) { fx.globalAlpha = p.glow - 1; fx.drawImage(m, 0, 0, gw, gh); }
        fx.restore();
      }
      fx.drawImage(lc, 0, 0);

      // ---- to output ----
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = !pixel;
      ctx.drawImage(fc, 0, 0, W, H);
      ctx.imageSmoothingEnabled = true;

      const out = p.output, scan = p.scanlines, ss = Math.max(2, p.scanSize | 0);
      if (out !== 'color' || br !== 1 || scan > 0) {
        const im = ctx.getImageData(0, 0, W, H), dd = im.data;
        for (let y = 0, i = 0; y < H; y++) {
          const sf = scan > 0 && (y % ss) >= ss / 2 ? 1 - scan * 0.8 : 1;
          for (let x = 0; x < W; x++, i += 4) {
            const f = br * sf;
            dd[i] = Math.min(255, dd[i] * f); dd[i + 1] = Math.min(255, dd[i + 1] * f); dd[i + 2] = Math.min(255, dd[i + 2] * f);
            const a = dd[i + 3] / 255;
            if (out === 'additive') { dd[i] *= a; dd[i + 1] *= a; dd[i + 2] *= a; dd[i + 3] = 255; }
            else if (out === 'gray') { const l = Math.min(255, (dd[i] * 0.3 + dd[i + 1] * 0.59 + dd[i + 2] * 0.11) * 1.25); dd[i] = dd[i + 1] = dd[i + 2] = l; }
          }
        }
        ctx.putImageData(im, 0, 0);
      }
    },
  });
})();
