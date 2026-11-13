/* UI frames / borders. Sizes are in px at 512 and scale with the export resolution. */
(function () {
  'use strict';
  const U = window.UGTG;

  function frame(ctx, x, y, w, h, r, corner) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (corner === 'chamfer') {
      ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.lineTo(x + w, y + r); ctx.lineTo(x + w, y + h - r);
      ctx.lineTo(x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.lineTo(x, y + h - r); ctx.lineTo(x, y + r);
      ctx.closePath();
      return 2 * (w + h) - 8 * r + 4 * Math.SQRT2 * r;
    }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    return 2 * (w + h) - 8 * r + U.TAU * r;
  }

  /* Perimeter of the frame as clockwise line/arc segments (starting at the top edge), plus the
     arc-length position of each corner's midpoint. Lets dashes be placed by distance along the border. */
  function perimeter(x, y, w, h, r, corner) {
    r = corner === 'square' ? 0 : Math.max(0, Math.min(r, w / 2, h / 2));
    const segs = [], corners = [];
    const line = (x0, y0, x1, y1) => segs.push({ line: true, x0, y0, x1, y1, len: Math.hypot(x1 - x0, y1 - y0) });
    let P = 0;
    const add = () => { P += segs[segs.length - 1].len; };
    const cornerSeg = (cx, cy, a0, ax, ay, bx, by) => {
      if (r <= 0) { corners.push(P); return; }
      if (corner === 'chamfer') line(ax, ay, bx, by);
      else segs.push({ cx, cy, a0, a1: a0 + Math.PI / 2, len: (r * Math.PI) / 2 });
      corners.push(P + segs[segs.length - 1].len / 2);
      add();
    };
    line(x + r, y, x + w - r, y); add();
    cornerSeg(x + w - r, y + r, -Math.PI / 2, x + w - r, y, x + w, y + r);
    line(x + w, y + r, x + w, y + h - r); add();
    cornerSeg(x + w - r, y + h - r, 0, x + w, y + h - r, x + w - r, y + h);
    line(x + w - r, y + h, x + r, y + h); add();
    cornerSeg(x + r, y + h - r, Math.PI / 2, x + r, y + h, x, y + h - r);
    line(x, y + h - r, x, y + r); add();
    cornerSeg(x + r, y + r, Math.PI, x, y + r, x + r, y);
    return { segs: segs.filter((s) => s.len > 1e-6), corners, P };
  }

  // point at arc length s (0..P)
  function pointAt(per, s) {
    let acc = 0;
    for (const g of per.segs) {
      if (s <= acc + g.len) {
        const u = (s - acc) / g.len;
        if (g.line) return [g.x0 + (g.x1 - g.x0) * u, g.y0 + (g.y1 - g.y0) * u];
        const a = g.a0 + (g.a1 - g.a0) * u, rr = radiusOf(g);
        return [g.cx + Math.cos(a) * rr, g.cy + Math.sin(a) * rr];
      }
      acc += g.len;
    }
    return pointAt(per, 0);
  }
  const radiusOf = (g) => g.len / (Math.PI / 2);

  // add the stretch [s0, s0+len] of the border to the current path (wraps across the start)
  function emit(ctx, per, s0, len) {
    const P = per.P;
    s0 = ((s0 % P) + P) % P;
    let first = true;
    const span = (a, b) => {
      let acc = 0;
      for (const g of per.segs) {
        const t0 = Math.max(a, acc), t1 = Math.min(b, acc + g.len);
        if (t1 > t0) {
          const u0 = (t0 - acc) / g.len, u1 = (t1 - acc) / g.len;
          if (g.line) {
            const px = g.x0 + (g.x1 - g.x0) * u0, py = g.y0 + (g.y1 - g.y0) * u0;
            first ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            ctx.lineTo(g.x0 + (g.x1 - g.x0) * u1, g.y0 + (g.y1 - g.y0) * u1);
          } else {
            const rr = radiusOf(g), a0 = g.a0 + (g.a1 - g.a0) * u0, a1 = g.a0 + (g.a1 - g.a0) * u1;
            if (first) ctx.moveTo(g.cx + Math.cos(a0) * rr, g.cy + Math.sin(a0) * rr);
            ctx.arc(g.cx, g.cy, rr, a0, a1);
          }
          first = false;
        }
        acc += g.len;
      }
    };
    if (s0 + len > P) { span(s0, P); span(0, s0 + len - P); }
    else span(s0, s0 + len);
  }

  /* Corner-first layout: one element centered on every corner, then each side between two corners
     is filled with evenly spaced elements (equal gaps per side). dash = 0 means dots. */
  function cornerFirst(per, dash, gap, minStep) {
    const out = []; // [start, length] for dashes, [center] for dots
    const C = per.corners;
    for (let k = 0; k < C.length; k++) {
      const c = C[k], next = k + 1 < C.length ? C[k + 1] : C[0] + per.P;
      const D = next - c;
      if (dash > 0) {
        const a = Math.min(dash, D * 0.45);      // corner dash, never longer than half the side
        out.push([c - a / 2, a]);
        const L = D - a;                          // free length between the two corner dashes
        let n = Math.max(0, Math.round((L - gap) / (a + gap)));
        while (n > 0 && (L - n * a) / (n + 1) < gap * 0.5) n--;
        const g = (L - n * a) / (n + 1);
        for (let j = 0; j < n; j++) out.push([c + a / 2 + g + j * (a + g), a]);
      } else {
        out.push([c]);
        const n = Math.max(0, Math.round(D / minStep) - 1);
        for (let j = 1; j <= n; j++) out.push([c + (j * D) / (n + 1)]);
      }
    }
    return out;
  }

  const is = (...l) => (p) => l.includes(p.style);

  U.register({
    id: 'border',
    name: 'UI Border',
    desc: 'Pure frames: solid, dashed, dotted or double, rounded / chamfered / square corners',
    tags: ['UI'],
    icon: U.icon('<rect x="3.5" y="5.5" width="17" height="13" rx="3" stroke-dasharray="3 2.2"/>'),
    params: [
      { type: 'section', label: 'Border (px @ 512)' },
      { key: 'style', label: 'Style', type: 'select', default: 'solid', options: [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted'], ['double', 'Double']] },
      { key: 'thickness', label: 'Thickness', type: 'range', min: 1, max: 64, step: 0.5, default: 8 },
      { key: 'corner', label: 'Corners', type: 'select', default: 'round', options: [['round', 'Rounded'], ['chamfer', 'Chamfered'], ['square', 'Square']] },
      { key: 'radius', label: 'Corner size', type: 'range', min: 0, max: 256, step: 1, default: 32, show: (p) => p.corner !== 'square' },
      { key: 'inset', label: 'Inset from edge', type: 'range', min: 0, max: 128, step: 1, default: 12 },
      { key: 'dash', label: 'Dash length', type: 'range', min: 2, max: 128, step: 1, default: 24, show: is('dashed') },
      { key: 'gap', label: 'Gap', type: 'range', min: 1, max: 128, step: 1, default: 12, show: is('dashed', 'dotted') },
      { key: 'dgap', label: 'Line spacing', type: 'range', min: 1, max: 64, step: 0.5, default: 6, show: is('double') },
      { type: 'section', label: 'Colors' },
      { key: 'color', label: 'Border', type: 'color', default: '#e8e8e8' },
      { key: 'fill', label: 'Fill inside', type: 'bool', default: false },
      { key: 'fillColor', label: 'Fill', type: 'color', default: '#20232a', show: (p) => p.fill },
      { type: 'section', label: 'Glow', collapsed: true },
      { key: 'glow', label: 'Outer glow', type: 'bool', default: false },
      { key: 'glowSize', label: 'Glow size', type: 'range', min: 1, max: 64, step: 1, default: 16, show: (p) => p.glow },
      { key: 'glowColor', label: 'Glow color', type: 'color', default: '#ff8a3d', show: (p) => p.glow },
    ],
    presets: [
      // Realistic
      { name: 'Hairline frame', group: 'Realistic', values: { thickness: 2, corner: 'square', inset: 8, color: '#d8dce0' } },
      { name: 'Rounded card outline', group: 'Realistic', values: { thickness: 4, radius: 40, inset: 12, color: '#c9cfd8' } },
      { name: 'Bold square frame', group: 'Realistic', values: { thickness: 16, corner: 'square', inset: 10, color: '#f0f0f0' } },
      { name: 'Thick rounded frame', group: 'Realistic', values: { thickness: 28, radius: 72, inset: 16, color: '#e8e8e8' } },
      { name: 'Double rule frame', group: 'Realistic', values: { style: 'double', thickness: 4, dgap: 6, corner: 'square', inset: 12, color: '#e0e0e0' } },
      { name: 'Dashed outline', group: 'Realistic', values: { style: 'dashed', thickness: 6, dash: 22, gap: 12, radius: 24, inset: 14, color: '#cfd5dc' } },
      { name: 'Dotted outline', group: 'Realistic', values: { style: 'dotted', thickness: 8, gap: 10, radius: 32, inset: 14, color: '#d8dce0' } },
      { name: 'Chamfered frame', group: 'Realistic', values: { corner: 'chamfer', radius: 40, thickness: 6, inset: 12, color: '#d0d4d8' } },
      { name: 'Deep inset frame', group: 'Realistic', values: { thickness: 6, radius: 16, inset: 48, color: '#e6e6e6' } },
      { name: 'Soft glow frame', group: 'Realistic', values: { thickness: 5, radius: 28, inset: 30, color: '#ffffff', glow: true, glowSize: 18, glowColor: '#9fc4ff' } },
      // Stylized
      { name: 'Retro double', group: 'Stylized', values: { style: 'double', thickness: 6, dgap: 8, corner: 'square', inset: 14, color: '#ffcf5a' } },
      { name: 'Sticker dots', group: 'Stylized', values: { style: 'dotted', thickness: 14, gap: 8, radius: 80, inset: 18, color: '#ff7ab8' } },
      { name: 'Stitched seam', group: 'Stylized', values: { style: 'dashed', thickness: 4, dash: 14, gap: 10, radius: 36, inset: 26, color: '#e8d2a8' } },
      { name: 'Chunky toy frame', group: 'Stylized', values: { thickness: 40, radius: 140, inset: 24, color: '#5fd3ff' } },
      { name: 'Chalk double', group: 'Stylized', values: { style: 'double', thickness: 4, dgap: 10, radius: 6, inset: 20, color: '#f2f0e6' } },
      { name: 'Comic heavy frame', group: 'Stylized', values: { thickness: 22, corner: 'square', inset: 8, color: '#111111' } },
      // Game-inspired
      { name: 'Fantasy gold double frame', group: 'Game-inspired', values: { style: 'double', thickness: 7, dgap: 6, corner: 'chamfer', radius: 30, inset: 14, color: '#d8b060', glow: true, glowSize: 8, glowColor: '#7a5a1a' } },
      { name: 'Tactical chamfer frame', group: 'Game-inspired', values: { corner: 'chamfer', radius: 56, thickness: 4, inset: 14, color: '#c8ccbe' } },
      { name: 'Inventory slot frame', group: 'Game-inspired', values: { corner: 'square', thickness: 6, inset: 10, color: '#6b6f72' } },
      { name: 'MMO tooltip frame', group: 'Game-inspired', values: { style: 'double', thickness: 4, dgap: 5, radius: 14, inset: 12, color: '#b8a070' } },
      { name: 'Arcade dotted marquee', group: 'Game-inspired', values: { style: 'dotted', thickness: 22, gap: 12, radius: 40, inset: 20, color: '#ffe86a', glow: true, glowSize: 14, glowColor: '#ffb020' } },
      // Sci-fi
      { name: 'Neon cyan frame', group: 'Sci-fi', values: { thickness: 6, radius: 24, inset: 28, color: '#5ff4ff', glow: true, glowSize: 22, glowColor: '#00c8ff' } },
      { name: 'Holo chamfer frame', group: 'Sci-fi', values: { corner: 'chamfer', radius: 70, thickness: 5, inset: 22, color: '#9ff0ff', glow: true, glowSize: 12, glowColor: '#40a0ff' } },
      { name: 'Hazard dashes', group: 'Sci-fi', values: { style: 'dashed', corner: 'chamfer', radius: 36, thickness: 14, dash: 30, gap: 18, inset: 18, color: '#ffc21a' } },
      { name: 'Terminal green dashes', group: 'Sci-fi', values: { style: 'dashed', corner: 'square', thickness: 5, dash: 12, gap: 8, inset: 16, color: '#38ff7a', glow: true, glowSize: 10, glowColor: '#00ff5a' } },
      { name: 'Data-node dots', group: 'Sci-fi', values: { style: 'dotted', corner: 'chamfer', radius: 60, thickness: 10, gap: 18, inset: 20, color: '#b98cff', glow: true, glowSize: 10, glowColor: '#8a4dff' } },
    ],
    render(ctx, W, H, p) {
      const k = Math.min(W, H) / 512, t = p.thickness * k, ins = p.inset * k;
      const R = p.corner === 'square' ? 0 : p.radius * k;
      const at = (o) => [ins + o, ins + o, W - 2 * (ins + o), H - 2 * (ins + o), Math.max(0, R - o)];

      if (p.fill) {
        const [x, y, w, h, r] = at(0);
        if (w > 0 && h > 0) { frame(ctx, x, y, w, h, r, p.corner); ctx.fillStyle = p.fillColor; ctx.fill(); }
      }
      ctx.strokeStyle = p.color;
      if (p.glow) { ctx.shadowColor = p.glowColor; ctx.shadowBlur = p.glowSize * k; }

      const line = (o, lw) => {
        const [x, y, w, h, r] = at(o);
        if (w <= 0 || h <= 0) return;
        ctx.lineWidth = lw;
        if (p.style === 'dashed' || p.style === 'dotted') {
          const per = perimeter(x, y, w, h, r, p.corner);
          if (p.style === 'dashed') {
            ctx.beginPath();
            for (const [s, len] of cornerFirst(per, p.dash * k, p.gap * k)) emit(ctx, per, s, len);
            ctx.lineCap = 'butt';
            ctx.lineJoin = 'miter'; // square corners stay crisp "L" dashes
            ctx.stroke();
          } else {
            ctx.beginPath();
            for (const [s] of cornerFirst(per, 0, 0, lw + p.gap * k)) {
              const [px, py] = pointAt(per, ((s % per.P) + per.P) % per.P);
              ctx.moveTo(px + lw / 2, py);
              ctx.arc(px, py, lw / 2, 0, U.TAU);
            }
            ctx.fillStyle = p.color;
            ctx.fill();
          }
          return;
        }
        frame(ctx, x, y, w, h, r, p.corner);
        ctx.lineCap = 'butt';
        ctx.stroke();
      };
      if (p.style === 'double') { line(t / 2, t); line(t * 1.5 + p.dgap * k, t); }
      else line(t / 2, t);
    },
  });
})();
