/* Blueprint: technical drawing sheets. Paper (color + darker edge, mottling, grain, stains, fold
   creases), a grid of minor / major lines (solid, dashed or dotted, over the whole sheet or inside the
   frame), an inset border (single, double or thick + thin) with optional zone markers (1 2 3 … / A B C …)
   and crop marks, a title block with title, subtitle and DRAWN / SCALE / SHEET / DWG NO fields, a notes
   list, scattered writings (custom text + typical annotations), technical sketches (flanges, plates,
   brackets) with center lines, hatching and dimension lines, tags (circle, hexagon, square, diamond,
   flag; numbers, letters, grid refs or detail callouts) with leader lines and a rubber stamp. Ink can
   wobble (hand-drawn) and wear off. Output: full color, ink only (transparent) or a white-on-black
   mask. Units are px @ 512 px short side. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep } = U;

  const FONTS = {
    mono: '"Consolas", "Cascadia Mono", "Courier New", monospace',
    sans: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif',
    narrow: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif',
    stencil: 'Impact, "Arial Narrow Bold", "Arial Narrow", sans-serif',
    hand: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
  };
  const PHRASES = ['SECTION A-A', 'SECTION B-B', 'DETAIL 3', 'DETAIL C', 'FRONT VIEW', 'SIDE VIEW', 'PLAN VIEW', 'TOP VIEW', 'ISO VIEW', 'NOT TO SCALE', 'TYP.', 'SEE NOTE 4', 'REV. B', 'ELEV. +2.40', 'Ø 42 H7', 'R 12', '4x M8 THRU', 'CHAMFER 2x45°', 'WELD ALL ROUND', 'MATCH LINE', 'CL', 'DATUM A', '⌀ 120 PCD', 'GRADE S355', 'FIELD VERIFY', 'HOLD', 'RAW EDGE', 'BOLT PATTERN', 'ACCESS PANEL', 'VENT', 'HATCH 02', 'FUEL LINE', 'SERVICE ONLY'];
  const NOTE_LINES = ['ALL DIMENSIONS IN MM', 'DO NOT SCALE DRAWING', 'REMOVE ALL BURRS AND SHARP EDGES', 'TOLERANCES ±0.1 UNLESS NOTED', 'MATERIAL: STEEL S235 JR', 'FINISH: PRIMER, GREY RAL 7001', 'BREAK EDGES 0.5 MAX', 'WELDS TO ISO 5817 C', 'THREADS TO ISO 965', 'SURFACE Ra 3.2', 'INSPECT BEFORE ASSEMBLY', 'TORQUE BOLTS TO 25 Nm'];
  const INITIALS = ['J.K.', 'M.R.', 'A.T.', 'S.L.', 'P.W.', 'E.H.', 'D.B.', 'C.V.'];
  const letters = (n) => { let s = ''; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };

  const isPaper = (p) => p.output === 'color';

  /* ---------- paper ---------- */
  function drawPaper(ctx, W, H, p, S, k) {
    const seed = p.seed | 0, img = ctx.createImageData(W, H), d = img.data;
    const A = U.hex(p.paperColor), B = U.hex(p.paperEdge), st = U.hex(p.stainColor);
    const mot = p.mottle > 0 ? U.coarseField(W, H, 40, (x, y) => U.fractal('perlin', (x / S) * 3, (y / S) * 3, 0, 0, 4, 0.55, 'fbm', seed + 11)) : null;
    const stn = p.stains > 0 ? U.coarseField(W, H, 90, (x, y) => U.fractal('perlin', (x / S) * 4.5, (y / S) * 4.5, 0, 0, 5, 0.55, 'fbm', seed + 23)) : null;
    const th = 0.78 - p.stains * 0.22;
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i++) {
        const nx = (x - W / 2) / (W / 2), ny = (y - H / 2) / (H / 2);
        const v = smoothstep(0.35, 1.45, Math.sqrt(nx * nx * 0.8 + ny * ny * 0.8)) * p.vignette;
        let r = A[0] + (B[0] - A[0]) * v, g = A[1] + (B[1] - A[1]) * v, b = A[2] + (B[2] - A[2]) * v;
        if (mot) { const f = 1 + (mot[i] - 0.5) * p.mottle * 0.55; r *= f; g *= f; b *= f; }
        if (stn) {
          const s = stn[i], m = smoothstep(th - 0.03, th + 0.02, s), ring = smoothstep(th - 0.012, th, s) * (1 - smoothstep(th, th + 0.02, s));
          const t = clamp(m * 0.55 + ring * 0.6) * p.stains;
          r += (st[0] - r) * t; g += (st[1] - g) * t; b += (st[2] - b) * t;
        }
        if (p.grain > 0) { const n = (U.hash(x, y, seed + 5) - 0.5) * p.grain * 46; r += n; g += n; b += n; }
        const o = i * 4;
        d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // fold creases: a light ridge and a soft shadow on one side
    if (p.folds > 0 && p.foldStrength > 0) {
      const w = 7 * k, a = p.foldStrength;
      const crease = (vertical, pos) => {
        const g = vertical ? ctx.createLinearGradient(pos - w, 0, pos + w, 0) : ctx.createLinearGradient(0, pos - w, 0, pos + w);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.42, `rgba(0,0,0,${0.22 * a})`);
        g.addColorStop(0.5, `rgba(255,255,255,${0.28 * a})`);
        g.addColorStop(0.6, `rgba(255,255,255,${0.06 * a})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        if (vertical) ctx.fillRect(pos - w, 0, 2 * w, H); else ctx.fillRect(0, pos - w, W, 2 * w);
      };
      const nx = p.folds, ny = Math.max(1, Math.round((p.folds * H) / W));
      for (let i = 1; i <= nx; i++) crease(true, (W * i) / (nx + 1));
      for (let i = 1; i <= ny; i++) crease(false, (H * i) / (ny + 1));
    }
  }

  /* ---------- layout ---------- */
  function frame(W, H, p, k) {
    const ins = p.inset * k, outer = { x0: ins, y0: ins, x1: W - ins, y1: H - ins };
    const zb = p.border !== 'none' && p.zones ? p.zoneW * k : 0;
    const inner = { x0: outer.x0 + zb, y0: outer.y0 + zb, x1: outer.x1 - zb, y1: outer.y1 - zb };
    return { outer, inner, zb };
  }

  /* drawing helpers bound to one ink context */
  function pen(c, p, k) {
    const lw = (m) => Math.max(0.5, p.inkW * k * m);
    const font = (size, bold) => `${bold === false ? 400 : p.font === 'hand' ? 400 : 700} ${Math.max(4, size)}px ${FONTS[p.font] || FONTS.mono}`;
    return {
      lw, font,
      line(x0, y0, x1, y1, m = 1, dash) {
        c.lineWidth = lw(m); c.setLineDash(dash || []);
        c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      },
      rect(x, y, w, h, m = 1) { c.lineWidth = lw(m); c.setLineDash([]); c.strokeRect(x, y, w, h); },
      circle(x, y, r, m = 1, dash) { c.lineWidth = lw(m); c.setLineDash(dash || []); c.beginPath(); c.arc(x, y, r, 0, U.TAU); c.stroke(); },
      text(t, x, y, size, align = 'center', base = 'middle', bold) {
        c.font = font(size, bold); c.textAlign = align; c.textBaseline = base;
        if ('letterSpacing' in c) c.letterSpacing = (p.letterSpacing * size) + 'px';
        c.fillText(t, x, y);
        return c.measureText(t).width;
      },
      measure(t, size, bold) { c.font = font(size, bold); if ('letterSpacing' in c) c.letterSpacing = (p.letterSpacing * size) + 'px'; return c.measureText(t).width; },
      center(x0, y0, x1, y1) { this.line(x0, y0, x1, y1, 0.45, [10 * k, 3 * k, 2 * k, 3 * k]); },
      arrow(x, y, ang, size) {
        if (p.dimEnds === 'tick') {
          const s = size * 0.6;
          c.lineWidth = lw(0.9); c.setLineDash([]);
          c.beginPath(); c.moveTo(x - Math.cos(ang + Math.PI / 4) * s, y - Math.sin(ang + Math.PI / 4) * s); c.lineTo(x + Math.cos(ang + Math.PI / 4) * s, y + Math.sin(ang + Math.PI / 4) * s); c.stroke();
          return;
        }
        if (p.dimEnds === 'dot') { c.beginPath(); c.arc(x, y, size * 0.28, 0, U.TAU); c.fill(); return; }
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - Math.cos(ang - 0.28) * size, y - Math.sin(ang - 0.28) * size);
        c.lineTo(x - Math.cos(ang + 0.28) * size, y - Math.sin(ang + 0.28) * size);
        c.closePath(); c.fill();
      },
    };
  }

  /* ---------- grid ---------- */
  function drawGrid(g, W, H, p, k, F) {
    if (!p.grid) return;
    const area = p.gridArea === 'inside' ? F.inner : { x0: 0, y0: 0, x1: W, y1: H };
    const S = Math.min(area.x1 - area.x0, area.y1 - area.y0), cs = S / Math.max(1, p.cells);
    if (cs < 1.5) return;
    g.save();
    g.beginPath(); g.rect(area.x0, area.y0, area.x1 - area.x0, area.y1 - area.y0); g.clip();
    g.strokeStyle = p.gridColor;
    g.lineCap = p.minorStyle === 'dotted' ? 'round' : 'butt';
    const ox = p.gridArea === 'inside' ? area.x0 : 0, oy = p.gridArea === 'inside' ? area.y0 : 0;
    const pass = (major) => {
      g.globalAlpha = major ? p.majorAlpha : p.minorAlpha;
      g.lineWidth = Math.max(0.4, (major ? p.majorW : p.minorW) * k);
      g.setLineDash(major || p.minorStyle === 'solid' ? [] : p.minorStyle === 'dashed' ? [4 * k, 3 * k] : [0.01, Math.max(2, 3 * k)]);
      g.beginPath();
      const M = Math.max(1, p.majorEvery | 0);
      for (let i = 0, x = ox; x <= area.x1 + 0.5; i++, x = ox + i * cs) {
        if ((i % M === 0) !== major) continue;
        const xx = Math.round(x) + 0.5; g.moveTo(xx, area.y0); g.lineTo(xx, area.y1);
      }
      for (let j = 0, y = oy; y <= area.y1 + 0.5; j++, y = oy + j * cs) {
        if ((j % M === 0) !== major) continue;
        const yy = Math.round(y) + 0.5; g.moveTo(area.x0, yy); g.lineTo(area.x1, yy);
      }
      g.stroke();
    };
    if (p.minorAlpha > 0) pass(false);
    if (p.majorAlpha > 0) pass(true);
    g.restore();
  }

  /* ---------- border, zones, crop marks ---------- */
  function drawBorder(c, P, W, H, p, k, F) {
    if (p.border === 'none') return;
    const { outer: o, inner: n } = F, bw = p.borderW;
    const R = (r, m) => P.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, m);
    if (p.border === 'double') { R(o, bw * 0.5); const g = p.doubleGap * k; R({ x0: o.x0 + g, y0: o.y0 + g, x1: o.x1 - g, y1: o.y1 - g }, bw * 0.5); }
    else if (p.border === 'heavy') { R(o, bw); const g = p.doubleGap * k; R({ x0: o.x0 - g, y0: o.y0 - g, x1: o.x1 + g, y1: o.y1 + g }, bw * 0.3); }
    else R(o, bw);
    if (F.zb > 0) {
      R(n, bw * 0.5);
      const nzx = Math.max(1, p.zoneCount | 0), nzy = Math.max(1, Math.round((nzx * (n.y1 - n.y0)) / (n.x1 - n.x0)));
      const size = F.zb * 0.55;
      for (let i = 0; i <= nzx; i++) {
        const x = n.x0 + ((n.x1 - n.x0) * i) / nzx;
        if (i > 0 && i < nzx) { P.line(x, o.y0, x, n.y0, 0.5); P.line(x, n.y1, x, o.y1, 0.5); }
        if (i < nzx) {
          const cx = x + (n.x1 - n.x0) / nzx / 2;
          P.text(String(i + 1), cx, (o.y0 + n.y0) / 2, size); P.text(String(i + 1), cx, (o.y1 + n.y1) / 2, size);
        }
      }
      for (let j = 0; j <= nzy; j++) {
        const y = n.y0 + ((n.y1 - n.y0) * j) / nzy;
        if (j > 0 && j < nzy) { P.line(o.x0, y, n.x0, y, 0.5); P.line(n.x1, y, o.x1, y, 0.5); }
        if (j < nzy) {
          const cy = y + (n.y1 - n.y0) / nzy / 2;
          P.text(letters(j), (o.x0 + n.x0) / 2, cy, size); P.text(letters(j), (o.x1 + n.x1) / 2, cy, size);
        }
      }
    }
    if (p.cropMarks) {
      const L = Math.min(p.inset * k * 0.7, 18 * k), gp = 3 * k;
      for (const [x, y, sx, sy] of [[o.x0, o.y0, -1, -1], [o.x1, o.y0, 1, -1], [o.x0, o.y1, -1, 1], [o.x1, o.y1, 1, 1]]) {
        P.line(x, y + sy * gp, x, y + sy * (gp + L), 0.5);
        P.line(x + sx * gp, y, x + sx * (gp + L), y, 0.5);
      }
    }
  }

  /* ---------- title block + notes (return their boxes as obstacles) ---------- */
  function titleBlock(c, P, p, k, F, rnd, knock) {
    if (!p.titleBlock || p.border === 'none') return null;
    const n = F.inner, iw = n.x1 - n.x0, ih = n.y1 - n.y0;
    const tw = Math.min(iw, Math.max(60 * k, iw * p.titleW)), rh = 18 * k * p.titleScale, rows = Math.max(2, p.titleRows | 0), th = Math.min(ih, rh * (rows + 0.6));
    const right = p.titlePos !== 'bl', x0 = right ? n.x1 - tw : n.x0, y0 = n.y1 - th;
    knock(x0, y0, tw, th);
    const bigH = rh * 1.6;
    c.save();
    P.rect(x0, y0, tw, th, p.borderW * 0.5);
    P.line(x0, y0 + bigH, x0 + tw, y0 + bigH, 0.5);
    const fs = rh * 0.42, small = rh * 0.28, padX = 4 * k;
    // title row
    c.save(); c.beginPath(); c.rect(x0, y0, tw, bigH); c.clip();
    const tsz = Math.min(bigH * 0.55, (tw * 0.9) / Math.max(1, P.measure(p.title || ' ', 100) / 100));
    P.text(p.title || '', x0 + tw / 2, y0 + bigH * 0.52, tsz);
    c.restore();
    const fields = [
      ['PROJECT', p.subtitle],
      ['DRAWN', p.drawn || INITIALS[Math.floor(rnd() * INITIALS.length)]], ['CHECKED', INITIALS[Math.floor(rnd() * INITIALS.length)]],
      ['SCALE', p.scaleText], ['DATE', `${String(1 + Math.floor(rnd() * 28)).padStart(2, '0')}.${String(1 + Math.floor(rnd() * 12)).padStart(2, '0')}.${String(70 + Math.floor(rnd() * 30))}`],
      ['SHEET', p.sheetText], ['DWG NO.', p.dwgNo],
    ];
    let fi = 0;
    for (let r = 0; r < rows - 1; r++) {
      const yy = y0 + bigH + r * rh, cells = r === 0 ? 1 : 2;
      if (r > 0) P.line(x0, yy, x0 + tw, yy, 0.5);
      for (let q = 0; q < cells && fi < fields.length; q++, fi++) {
        const cw = tw / cells, cx = x0 + q * cw;
        if (q > 0) P.line(cx, yy, cx, yy + rh, 0.5);
        const [lab, val] = fields[fi];
        c.save(); c.beginPath(); c.rect(cx, yy, cw, rh); c.clip();
        c.globalAlpha *= 0.75; P.text(lab, cx + padX, yy + rh * 0.3, small, 'left', 'middle', false); c.globalAlpha /= 0.75;
        P.text(val || '', cx + padX, yy + rh * 0.68, fs, 'left');
        c.restore();
      }
    }
    c.restore();
    return { x0, y0, x1: x0 + tw, y1: y0 + th };
  }

  function notesBlock(c, P, p, k, F, tb, rnd, knock) {
    if (!(p.noteLines > 0)) return null;
    const n = F.inner, size = 9 * k * p.textScale, lh = size * 1.45, w = tb ? tb.x1 - tb.x0 : (n.x1 - n.x0) * 0.4;
    const h = lh * (p.noteLines + 1.4), right = !tb || tb.x1 >= n.x1 - 1, x0 = tb ? tb.x0 : right ? n.x1 - w - 6 * k : n.x0 + 6 * k;
    const y1 = tb ? tb.y0 - 6 * k : n.y1 - 6 * k, y0 = y1 - h;
    if (y0 < n.y0) return null;
    knock(x0, y0, w, h);
    const pool = NOTE_LINES.slice();
    P.text('NOTES:', x0 + 4 * k, y0 + lh * 0.6, size * 1.1, 'left');
    for (let i = 0; i < p.noteLines; i++) {
      const t = pool.splice(Math.floor(rnd() * pool.length), 1)[0] || NOTE_LINES[i % NOTE_LINES.length];
      c.save(); c.beginPath(); c.rect(x0, y0, w, h); c.clip();
      P.text(`${i + 1}. ${t}`, x0 + 4 * k, y0 + lh * (1.6 + i), size, 'left', 'middle', false);
      c.restore();
    }
    return { x0, y0, x1: x0 + w, y1 };
  }

  /* ---------- free placement ---------- */
  function placer(area, boxes, rnd, padPx) {
    const free = (b) => b.x0 >= area.x0 && b.y0 >= area.y0 && b.x1 <= area.x1 && b.y1 <= area.y1 &&
      !boxes.some((o) => b.x0 < o.x1 + padPx && b.x1 > o.x0 - padPx && b.y0 < o.y1 + padPx && b.y1 > o.y0 - padPx);
    return (w, h, tries = 40) => {
      for (let t = 0; t < tries; t++) {
        const x = area.x0 + rnd() * Math.max(0, area.x1 - area.x0 - w), y = area.y0 + rnd() * Math.max(0, area.y1 - area.y0 - h);
        const b = { x0: x, y0: y, x1: x + w, y1: y + h };
        if (free(b)) { boxes.push(b); return b; }
      }
      return null;
    };
  }

  /* dimension line between (x0, y0) and (x1, y1), offset by `off` along the normal, with a value */
  function dimension(c, P, p, k, x0, y0, x1, y1, off, value) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
    if (L < 8 * k) return;
    const nx = -dy / L, ny = dx / L, ext = 3 * k;
    const ax = x0 + nx * off, ay = y0 + ny * off, bx = x1 + nx * off, by = y1 + ny * off, s = Math.sign(off) || 1;
    P.line(x0 + nx * 2 * k * s, y0 + ny * 2 * k * s, ax + nx * ext * s, ay + ny * ext * s, 0.4);
    P.line(x1 + nx * 2 * k * s, y1 + ny * 2 * k * s, bx + nx * ext * s, by + ny * ext * s, 0.4);
    P.line(ax, ay, bx, by, 0.45);
    const ang = Math.atan2(dy, dx), as = 6 * k;
    P.arrow(bx, by, ang, as); P.arrow(ax, ay, ang + Math.PI, as);
    const size = 8 * k * p.textScale, tx = (ax + bx) / 2 + nx * size * 0.75 * s, ty = (ay + by) / 2 + ny * size * 0.75 * s;
    c.save(); c.translate(tx, ty);
    let a = ang; if (a > Math.PI / 2 + 0.01 || a < -Math.PI / 2 - 0.01) a += Math.PI;
    c.rotate(a);
    P.text(value, 0, 0, size, 'center', 'middle', false);
    c.restore();
  }
  const dimVal = (px, k, p) => {
    const v = (px / k) * p.dimFactor;
    return v >= 100 ? String(Math.round(v / 5) * 5) : v >= 10 ? String(Math.round(v)) : v.toFixed(1);
  };

  /* ---------- technical sketches ---------- */
  function sketch(c, P, p, k, b, rnd, anchors) {
    const w = b.x1 - b.x0, h = b.y1 - b.y0, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const m = 14 * k; // room for dimensions inside the box
    const ix0 = b.x0 + m, iy0 = b.y0 + m * 0.6, ix1 = b.x1 - m, iy1 = b.y1 - m;
    const iw = ix1 - ix0, ih = iy1 - iy0;
    const kind = Math.floor(rnd() * 3), dimOn = rnd() < p.dims;
    const hatch = (path, ang) => {
      if (!p.hatch) return;
      c.save(); c.beginPath(); path(); c.clip();
      const step = 5 * k, R = Math.hypot(w, h);
      c.lineWidth = P.lw(0.35); c.setLineDash([]);
      c.beginPath();
      for (let t = -R; t <= R; t += step) {
        const ca = Math.cos(ang), sa = Math.sin(ang);
        c.moveTo(cx + ca * t - sa * R, cy + sa * t + ca * R); c.lineTo(cx + ca * t + sa * R, cy + sa * t - ca * R);
      }
      c.stroke(); c.restore();
    };
    if (kind === 0) {
      // flange: outer circle, bore, dashed bolt circle with holes, center lines
      const R = Math.min(iw, ih) / 2, ccx = (ix0 + ix1) / 2, ccy = (iy0 + iy1) / 2, r = R * (0.3 + rnd() * 0.15), bc = (R + r) / 2, nh = [4, 6, 8][Math.floor(rnd() * 3)];
      hatch(() => { c.arc(ccx, ccy, R, 0, U.TAU); c.arc(ccx, ccy, r, U.TAU, 0, true); }, Math.PI / 4);
      P.circle(ccx, ccy, R); P.circle(ccx, ccy, r, 0.8);
      P.circle(ccx, ccy, bc, 0.4, [8 * k, 3 * k, 2 * k, 3 * k]);
      for (let i = 0; i < nh; i++) { const a = (i / nh) * U.TAU + Math.PI / nh; P.circle(ccx + Math.cos(a) * bc, ccy + Math.sin(a) * bc, R * 0.07, 0.7); }
      P.center(ccx - R - 6 * k, ccy, ccx + R + 6 * k, ccy); P.center(ccx, ccy - R - 6 * k, ccx, ccy + R + 6 * k);
      if (dimOn) dimension(c, P, p, k, ccx - R, ccy + R, ccx + R, ccy + R, 9 * k, '⌀' + dimVal(2 * R, k, p));
      anchors.push([ccx + Math.cos(-0.8) * R, ccy + Math.sin(-0.8) * R]);
    } else if (kind === 1) {
      // plate: rectangle with chamfered corners, holes and a slot
      const ch = Math.min(iw, ih) * 0.12;
      const path = () => { c.moveTo(ix0 + ch, iy0); c.lineTo(ix1 - ch, iy0); c.lineTo(ix1, iy0 + ch); c.lineTo(ix1, iy1 - ch); c.lineTo(ix1 - ch, iy1); c.lineTo(ix0 + ch, iy1); c.lineTo(ix0, iy1 - ch); c.lineTo(ix0, iy0 + ch); c.closePath(); };
      if (rnd() < 0.5) hatch(path, -Math.PI / 4);
      c.lineWidth = P.lw(1); c.setLineDash([]); c.beginPath(); path(); c.stroke();
      const hr = Math.min(iw, ih) * 0.08;
      for (const [fx, fy] of [[0.2, 0.25], [0.8, 0.25], [0.2, 0.75], [0.8, 0.75]]) {
        const hx = ix0 + iw * fx, hy = iy0 + ih * fy;
        P.circle(hx, hy, hr, 0.7);
        P.center(hx - hr * 1.6, hy, hx + hr * 1.6, hy); P.center(hx, hy - hr * 1.6, hx, hy + hr * 1.6);
      }
      const sw = iw * 0.3, sh = hr * 1.2;
      c.lineWidth = P.lw(0.7); c.beginPath(); c.roundRect ? c.roundRect(cx - sw / 2, (iy0 + iy1) / 2 - sh / 2, sw, sh, sh / 2) : c.rect(cx - sw / 2, (iy0 + iy1) / 2 - sh / 2, sw, sh); c.stroke();
      if (dimOn) { dimension(c, P, p, k, ix0, iy1, ix1, iy1, 9 * k, dimVal(iw, k, p)); dimension(c, P, p, k, ix1, iy0, ix1, iy1, -9 * k, dimVal(ih, k, p)); }
      anchors.push([ix0 + iw * 0.8, iy0 + ih * 0.25]);
    } else {
      // bracket: L-profile with a fillet, bend line and holes
      const t = Math.min(iw, ih) * (0.18 + rnd() * 0.1), fr = t * 0.8;
      c.lineWidth = P.lw(1); c.setLineDash([]);
      const path = () => {
        c.moveTo(ix0, iy0); c.lineTo(ix0 + t, iy0); c.lineTo(ix0 + t, iy1 - t - fr);
        c.arcTo(ix0 + t, iy1 - t, ix0 + t + fr, iy1 - t, fr);
        c.lineTo(ix1, iy1 - t); c.lineTo(ix1, iy1); c.lineTo(ix0, iy1); c.closePath();
      };
      hatch(path, Math.PI / 4);
      c.beginPath(); path(); c.stroke();
      P.line(ix0 + t / 2, iy0, ix0 + t / 2, iy1, 0.4, [6 * k, 3 * k]);
      const hr = t * 0.22;
      P.circle(ix0 + t / 2, iy0 + ih * 0.25, hr, 0.7); P.circle(ix0 + iw * 0.75, iy1 - t / 2, hr, 0.7);
      if (dimOn) { dimension(c, P, p, k, ix0, iy1, ix1, iy1, 9 * k, dimVal(iw, k, p)); dimension(c, P, p, k, ix1, iy1 - t, ix1, iy1, -9 * k, dimVal(t, k, p)); }
      anchors.push([ix0 + t, iy0 + ih * 0.3]);
    }
    if (p.viewTitles && rnd() < 0.7) {
      const t = PHRASES[Math.floor(rnd() * 9)], size = 8.5 * k * p.textScale;
      const tw = P.text(t, cx, b.y1 - size * 0.2, size, 'center', 'bottom');
      P.line(cx - tw / 2, b.y1 + size * 0.05, cx + tw / 2, b.y1 + size * 0.05, 0.5);
    }
  }

  /* ---------- tags ---------- */
  function tagPath(c, shape, x, y, r) {
    c.beginPath();
    const poly = (n, rot) => { for (let i = 0; i < n; i++) { const a = rot + (i * U.TAU) / n; i ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); };
    switch (shape) {
      case 'hex': poly(6, 0); break;
      case 'square': c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); break;
      case 'diamond': poly(4, 0); break;
      case 'flag': c.moveTo(x - r * 1.1, y - r * 0.7); c.lineTo(x + r * 0.6, y - r * 0.7); c.lineTo(x + r * 1.2, y); c.lineTo(x + r * 0.6, y + r * 0.7); c.lineTo(x - r * 1.1, y + r * 0.7); c.closePath(); break;
      default: c.arc(x, y, r, 0, U.TAU);
    }
  }
  function tagLabel(p, i, rnd) {
    switch (p.tagText) {
      case 'letters': return letters(i);
      case 'grid': return letters(Math.floor(rnd() * 6)) + (1 + Math.floor(rnd() * 8));
      case 'detail': return String(i + 1);
      default: return String(i + 1);
    }
  }

  /* ---------- render ---------- */
  function render(ctx, W, H, p) {
    const S = Math.min(W, H), k = S / 512, rnd = U.rng((p.seed | 0) + 77);
    const F = frame(W, H, p, k);
    // ink goes on its own canvas (grid separately, so text and blocks can knock it out)
    const gridCv = U.canvas(W, H), gc = gridCv.getContext('2d');
    drawGrid(gc, W, H, p, k, F);
    const inkCv = U.canvas(W, H), c = inkCv.getContext('2d');
    const ink = p.inkColor, accent = p.accentOn ? p.accentColor : p.inkColor;
    c.strokeStyle = c.fillStyle = ink; c.lineJoin = 'round'; c.lineCap = 'butt';
    c.globalAlpha = p.inkAlpha;
    const P = pen(c, p, k);
    const knock = (x, y, w, h) => {
      if (!p.knockout) return;
      gc.save(); gc.globalCompositeOperation = 'destination-out'; gc.fillRect(x - 2 * k, y - 2 * k, w + 4 * k, h + 4 * k); gc.restore();
    };
    drawBorder(c, P, W, H, p, k, F);
    const boxes = [];
    const tb = titleBlock(c, P, p, k, F, rnd, knock);
    if (tb) boxes.push(tb);
    const nb = notesBlock(c, P, p, k, F, tb, rnd, knock);
    if (nb) boxes.push(nb);
    const area = p.border === 'none' ? { x0: 10 * k, y0: 10 * k, x1: W - 10 * k, y1: H - 10 * k } : { x0: F.inner.x0 + 8 * k, y0: F.inner.y0 + 8 * k, x1: F.inner.x1 - 8 * k, y1: F.inner.y1 - 8 * k };
    const place = placer(area, boxes, rnd, 6 * k);
    // sketches
    const anchors = [];
    for (let i = 0; i < p.shapes; i++) {
      const s = (70 + rnd() * 90) * k * p.shapeScale, asp = 0.7 + rnd() * 0.6;
      const b = place(s * asp, s, 30);
      if (!b) continue;
      sketch(c, P, p, k, b, rnd, anchors);
    }
    // writings: custom texts first, then annotation phrases
    const size = 10 * k * p.textScale;
    const texts = [p.text1, p.text2, p.text3].filter(Boolean);
    for (let i = 0; i < p.notes; i++) texts.push(PHRASES[Math.floor(rnd() * PHRASES.length)]);
    texts.forEach((t, i) => {
      const big = i < [p.text1, p.text2, p.text3].filter(Boolean).length, sz = big ? size * p.customScale : size;
      const tw = P.measure(t, sz) + 4 * k, b = place(tw, sz * 1.5, 30);
      if (!b) return;
      knock(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      P.text(t, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, sz);
      if (big || rnd() < 0.35) P.line(b.x0 + 2 * k, b.y1 - sz * 0.1, b.x1 - 2 * k, b.y1 - sz * 0.1, 0.5);
    });
    // tags with leader lines
    c.strokeStyle = c.fillStyle = accent;
    const tr = 9 * k * p.tagSize;
    for (let i = 0; i < p.tags; i++) {
      const b = place(tr * 2.6, tr * 2.6, 40);
      if (!b) continue;
      const x = (b.x0 + b.x1) / 2, y = (b.y0 + b.y1) / 2;
      knock(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      if (p.leaders) {
        let tx, ty;
        const a = anchors.length ? anchors[i % anchors.length] : null;
        if (a && Math.hypot(a[0] - x, a[1] - y) < S * 0.3) { tx = a[0]; ty = a[1]; }
        else { const ang = rnd() * U.TAU, d = tr * (3 + rnd() * 4); tx = clamp(x + Math.cos(ang) * d, area.x0, area.x1); ty = clamp(y + Math.sin(ang) * d, area.y0, area.y1); }
        const ang = Math.atan2(ty - y, tx - x), sx = x + Math.cos(ang) * tr * 1.05, sy = y + Math.sin(ang) * tr * 1.05;
        // a short shelf, then the leader to the target
        const kx = sx + Math.cos(ang) * tr * 0.6;
        P.line(sx, sy, kx, sy + Math.sin(ang) * tr * 0.6, 0.5);
        P.line(kx, sy + Math.sin(ang) * tr * 0.6, tx, ty, 0.5);
        if (p.dimEnds === 'arrow') P.arrow(tx, ty, Math.atan2(ty - sy, tx - kx), 5.5 * k); else { c.beginPath(); c.arc(tx, ty, 1.6 * k, 0, U.TAU); c.fill(); }
      }
      tagPath(c, p.tagShape, x, y, tr);
      if (p.tagFill) { c.save(); c.globalAlpha *= 0.18; c.fill(); c.restore(); }
      c.lineWidth = P.lw(0.8); c.setLineDash([]); c.stroke();
      const lab = tagLabel(p, i, rnd);
      if (p.tagText === 'detail') {
        P.line(x - tr, y, x + tr, y, 0.5);
        P.text(lab, x, y - tr * 0.42, tr * 0.7);
        P.text(letters(Math.floor(rnd() * 6)) + '-' + (1 + Math.floor(rnd() * 9)), x, y + tr * 0.45, tr * 0.5, 'center', 'middle', false);
      } else P.text(lab, x, y + tr * 0.04, tr * (lab.length > 2 ? 0.6 : 0.85));
    }
    // stamp
    if (p.stamp) {
      const sz = 22 * k * p.stampScale, tw = P.measure(p.stamp, sz) + sz, th = sz * 1.6;
      const b = place(tw, th, 40) || { x0: area.x0 + (area.x1 - area.x0 - tw) * rnd(), y0: area.y0 + (area.y1 - area.y0 - th) * rnd(), x1: 0, y1: 0 };
      c.save();
      c.translate(b.x0 + tw / 2, b.y0 + th / 2); c.rotate((rnd() - 0.5) * 0.4);
      c.strokeStyle = c.fillStyle = p.stampColor; c.globalAlpha = p.inkAlpha * p.stampAlpha;
      c.lineWidth = P.lw(2); c.setLineDash([]); c.strokeRect(-tw / 2, -th / 2, tw, th);
      c.lineWidth = P.lw(0.8); c.strokeRect(-tw / 2 + 3 * k, -th / 2 + 3 * k, tw - 6 * k, th - 6 * k);
      P.text(p.stamp, 0, sz * 0.05, sz);
      c.restore();
    }

    // ink = grid + drawing, then wobble / wear
    const all = U.canvas(W, H), ac = all.getContext('2d');
    ac.drawImage(gridCv, 0, 0); ac.drawImage(inkCv, 0, 0);
    let inkOut = all;
    const wp = { colorNoise: 0, brightNoise: 0, noiseType: 'perlin', noiseScale: 6, noiseDetail: 3, distort: p.wobble * 0.12, distortScale: 14, grunge: p.inkWear, grungeType: 'speckle', grungeScale: 18, edgeWear: 0, edgeWidth: 3, dirt: 0, scratches: 0, seed: p.seed | 0 };
    if (U.wearActive(wp)) inkOut = U.imageCanvas(U.wearApply(all, wp, U.wearFields(W, H, wp, S, null), { grunge: true }));

    if (p.output === 'mask') {
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
      const m = U.canvas(W, H), mc = m.getContext('2d');
      mc.drawImage(inkOut, 0, 0); mc.globalCompositeOperation = 'source-in'; mc.fillStyle = '#fff'; mc.fillRect(0, 0, W, H);
      ctx.drawImage(m, 0, 0);
      return;
    }
    if (isPaper(p)) drawPaper(ctx, W, H, p, S, k);
    if (isPaper(p) && p.inkBleed > 0) {
      ctx.save(); ctx.filter = `blur(${Math.max(0.5, 1.6 * k)}px)`; ctx.globalAlpha = p.inkBleed; ctx.drawImage(inkOut, 0, 0); ctx.restore();
    }
    ctx.drawImage(inkOut, 0, 0);
  }

  U.register({
    id: 'blueprint',
    name: 'Blueprint',
    desc: 'Technical drawing sheets: paper, grid, inset border with zones, title block, notes, writings, sketches, dimensions and tags',
    uses: ['Blueprint and schematic textures for props, briefing boards, terminals, workbenches and loading screens.', 'Engineering-sheet backgrounds and overlays for UI panels, menus and documents (ink-only and mask output).'],
    tags: ['UI', 'Texturing', 'Military'],
    aspect: '16:9',
    bg: 'gray',
    icon: U.icon('<rect x="3" y="4" width="18" height="16" rx="1"/><rect x="5" y="6" width="14" height="12" opacity=".5"/><path d="M13 14h6v4h-6zM8 9.5a2 2 0 1 0 0 .01"/>'),
    params: [
      { type: 'section', label: 'Paper' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Paper + ink'], ['ink', 'Ink only (transparent)'], ['mask', 'Mask (white ink on black)']] },
      { key: 'paperColor', label: 'Paper color', type: 'color', default: '#1f5296', show: isPaper },
      { key: 'paperEdge', label: 'Edge color', type: 'color', default: '#143a70', show: isPaper },
      { key: 'vignette', label: 'Edge darkening', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: isPaper },
      { key: 'mottle', label: 'Mottling', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: isPaper, tip: 'Uneven, cloudy print density' },
      { key: 'grain', label: 'Grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, show: isPaper },
      { key: 'stains', label: 'Stains', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: isPaper },
      { key: 'stainColor', label: 'Stain color', type: 'color', default: '#5b80b8', show: (p) => isPaper(p) && p.stains > 0 },
      { key: 'folds', label: 'Fold creases', type: 'int', min: 0, max: 6, default: 0, show: isPaper, tip: 'Creases across the long side; the short side gets a matching number' },
      { key: 'foldStrength', label: 'Crease strength', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: (p) => isPaper(p) && p.folds > 0 },
      { key: 'seed', label: 'Seed', type: 'seed', default: 3 },

      { type: 'section', label: 'Grid' },
      { key: 'grid', label: 'Grid', type: 'bool', default: true },
      { key: 'gridArea', label: 'Grid area', type: 'select', default: 'inside', options: [['inside', 'Inside the border'], ['full', 'Whole sheet']], show: (p) => p.grid },
      { key: 'cells', label: 'Cells', type: 'int', min: 2, max: 200, default: 40, show: (p) => p.grid, tip: 'Minor cells across the short side of the grid area' },
      { key: 'majorEvery', label: 'Major line every', type: 'int', min: 1, max: 20, default: 5, show: (p) => p.grid },
      { key: 'gridColor', label: 'Grid color', type: 'color', default: '#cfe0ff', show: (p) => p.grid },
      { key: 'minorW', label: 'Minor width', type: 'range', min: 0.25, max: 4, step: 0.05, default: 0.6, show: (p) => p.grid, tip: 'px @ 512' },
      { key: 'minorAlpha', label: 'Minor opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.16, show: (p) => p.grid },
      { key: 'minorStyle', label: 'Minor lines', type: 'select', default: 'solid', options: [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']], show: (p) => p.grid },
      { key: 'majorW', label: 'Major width', type: 'range', min: 0.25, max: 6, step: 0.05, default: 1, show: (p) => p.grid, tip: 'px @ 512' },
      { key: 'majorAlpha', label: 'Major opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.32, show: (p) => p.grid },
      { key: 'knockout', label: 'Clear grid behind text', type: 'bool', default: true, tip: 'Removes the grid under writings, tags, the notes and the title block' },

      { type: 'section', label: 'Border' },
      { key: 'border', label: 'Border', type: 'select', default: 'double', options: [['none', 'None'], ['single', 'Single line'], ['double', 'Double line'], ['heavy', 'Heavy + thin outer']] },
      { key: 'inset', label: 'Edge inset', type: 'range', min: 0, max: 120, step: 0.5, default: 22, show: (p) => p.border !== 'none', tip: 'Distance from the texture edge (px @ 512)' },
      { key: 'borderW', label: 'Line weight', type: 'range', min: 0.5, max: 8, step: 0.1, default: 2.2, show: (p) => p.border !== 'none', tip: 'Multiple of the ink width' },
      { key: 'doubleGap', label: 'Double line gap', type: 'range', min: 1, max: 20, step: 0.25, default: 4, show: (p) => p.border === 'double' || p.border === 'heavy', tip: 'px @ 512' },
      { key: 'zones', label: 'Zone markers', type: 'bool', default: true, show: (p) => p.border !== 'none', tip: 'Numbered / lettered band around the sheet' },
      { key: 'zoneCount', label: 'Zones across', type: 'int', min: 2, max: 16, default: 8, show: (p) => p.border !== 'none' && p.zones },
      { key: 'zoneW', label: 'Zone band width', type: 'range', min: 6, max: 40, step: 0.5, default: 14, show: (p) => p.border !== 'none' && p.zones, tip: 'px @ 512' },
      { key: 'cropMarks', label: 'Crop marks', type: 'bool', default: false, show: (p) => p.border !== 'none' },

      { type: 'section', label: 'Title block' },
      { key: 'titleBlock', label: 'Title block', type: 'bool', default: true, show: (p) => p.border !== 'none' },
      { key: 'titlePos', label: 'Position', type: 'select', default: 'br', options: [['br', 'Bottom right'], ['bl', 'Bottom left']], show: (p) => p.titleBlock && p.border !== 'none' },
      { key: 'titleW', label: 'Width', type: 'range', min: 0.15, max: 1, step: 0.01, default: 0.32, show: (p) => p.titleBlock && p.border !== 'none', tip: 'Fraction of the frame width' },
      { key: 'titleRows', label: 'Rows', type: 'int', min: 2, max: 5, default: 4, show: (p) => p.titleBlock && p.border !== 'none' },
      { key: 'titleScale', label: 'Size', type: 'range', min: 0.5, max: 2.5, step: 0.05, default: 1, show: (p) => p.titleBlock && p.border !== 'none' },
      { key: 'title', label: 'Title', type: 'text', default: 'MK-II DRIVE ASSEMBLY', max: 32, show: (p) => p.titleBlock && p.border !== 'none' },
      { key: 'subtitle', label: 'Project', type: 'text', default: 'PROJECT HALCYON', max: 32, show: (p) => p.titleBlock && p.border !== 'none' },
      { key: 'drawn', label: 'Drawn by', type: 'text', default: '', max: 16, show: (p) => p.titleBlock && p.border !== 'none', tip: 'Empty = random initials' },
      { key: 'scaleText', label: 'Scale', type: 'text', default: '1 : 20', max: 16, show: (p) => p.titleBlock && p.border !== 'none' },
      { key: 'sheetText', label: 'Sheet', type: 'text', default: '2 OF 7', max: 16, show: (p) => p.titleBlock && p.border !== 'none' },
      { key: 'dwgNo', label: 'Drawing no.', type: 'text', default: 'HX-0427-B', max: 16, show: (p) => p.titleBlock && p.border !== 'none' },
      { key: 'noteLines', label: 'Notes list', type: 'int', min: 0, max: 8, default: 4, tip: 'Numbered NOTES: lines above the title block' },

      { type: 'section', label: 'Writings' },
      { key: 'text1', label: 'Text 1', type: 'text', default: '', max: 32, tip: 'Your own writings, placed first and underlined' },
      { key: 'text2', label: 'Text 2', type: 'text', default: '', max: 32 },
      { key: 'text3', label: 'Text 3', type: 'text', default: '', max: 32 },
      { key: 'customScale', label: 'Own text size', type: 'range', min: 0.5, max: 4, step: 0.05, default: 1.6, show: (p) => !!(p.text1 || p.text2 || p.text3) },
      { key: 'notes', label: 'Annotations', type: 'int', min: 0, max: 40, default: 8, tip: 'Scattered typical labels (SECTION A-A, TYP., R 12 …)' },
      { key: 'font', label: 'Font', type: 'select', default: 'mono', options: [['mono', 'Monospace'], ['narrow', 'Technical (narrow)'], ['sans', 'Sans'], ['stencil', 'Stencil'], ['hand', 'Handwritten']] },
      { key: 'textScale', label: 'Text size', type: 'range', min: 0.5, max: 3, step: 0.05, default: 1 },
      { key: 'letterSpacing', label: 'Letter spacing', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.06 },
      { key: 'stamp', label: 'Stamp', type: 'text', default: '', max: 20, tip: 'Rubber stamp text, e.g. APPROVED or CLASSIFIED' },
      { key: 'stampColor', label: 'Stamp color', type: 'color', default: '#e0443a', show: (p) => !!p.stamp },
      { key: 'stampAlpha', label: 'Stamp opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75, show: (p) => !!p.stamp },
      { key: 'stampScale', label: 'Stamp size', type: 'range', min: 0.4, max: 3, step: 0.05, default: 1, show: (p) => !!p.stamp },

      { type: 'section', label: 'Drawings' },
      { key: 'shapes', label: 'Sketches', type: 'int', min: 0, max: 20, default: 4, tip: 'Flanges, plates and brackets with center lines' },
      { key: 'shapeScale', label: 'Sketch size', type: 'range', min: 0.4, max: 3, step: 0.05, default: 1, show: (p) => p.shapes > 0 },
      { key: 'hatch', label: 'Section hatching', type: 'bool', default: true, show: (p) => p.shapes > 0 },
      { key: 'dims', label: 'Dimensioning', type: 'range', min: 0, max: 1, step: 0.01, default: 0.8, show: (p) => p.shapes > 0, tip: 'Share of sketches with dimension lines' },
      { key: 'dimFactor', label: 'Dimension scale', type: 'range', min: 0.01, max: 20, step: 0.01, default: 2.5, show: (p) => p.shapes > 0 && p.dims > 0, tip: 'Units per px @ 512 shown in the dimension values' },
      { key: 'dimEnds', label: 'Line ends', type: 'select', default: 'arrow', options: [['arrow', 'Arrows'], ['tick', 'Architectural ticks'], ['dot', 'Dots']] },
      { key: 'viewTitles', label: 'View titles', type: 'bool', default: true, show: (p) => p.shapes > 0, tip: 'FRONT VIEW, SECTION A-A … under sketches' },

      { type: 'section', label: 'Tags' },
      { key: 'tags', label: 'Tags', type: 'int', min: 0, max: 40, default: 5 },
      { key: 'tagShape', label: 'Shape', type: 'select', default: 'circle', options: [['circle', 'Circle'], ['hex', 'Hexagon'], ['square', 'Square'], ['diamond', 'Diamond'], ['flag', 'Flag']], show: (p) => p.tags > 0 },
      { key: 'tagText', label: 'Tag text', type: 'select', default: 'numbers', options: [['numbers', 'Numbers'], ['letters', 'Letters'], ['grid', 'Grid refs (B4)'], ['detail', 'Detail callout (3 / A-5)']], show: (p) => p.tags > 0 },
      { key: 'tagSize', label: 'Tag size', type: 'range', min: 0.4, max: 3, step: 0.05, default: 1, show: (p) => p.tags > 0 },
      { key: 'tagFill', label: 'Filled tags', type: 'bool', default: false, show: (p) => p.tags > 0 },
      { key: 'leaders', label: 'Leader lines', type: 'bool', default: true, show: (p) => p.tags > 0, tip: 'Line from the tag to a sketch (or a nearby point)' },
      { key: 'accentOn', label: 'Accent color for tags', type: 'bool', default: false, show: (p) => p.tags > 0 },
      { key: 'accentColor', label: 'Accent color', type: 'color', default: '#ffd34a', show: (p) => p.tags > 0 && p.accentOn },

      { type: 'section', label: 'Ink' },
      { key: 'inkColor', label: 'Ink color', type: 'color', default: '#eef4ff' },
      { key: 'inkAlpha', label: 'Ink opacity', type: 'range', min: 0, max: 1, step: 0.01, default: 0.92 },
      { key: 'inkW', label: 'Ink width', type: 'range', min: 0.3, max: 5, step: 0.05, default: 1.3, tip: 'px @ 512' },
      { key: 'wobble', label: 'Hand-drawn wobble', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'inkWear', label: 'Worn ink', type: 'range', min: 0, max: 1, step: 0.01, default: 0, tip: 'Faded, broken lines' },
      { key: 'inkBleed', label: 'Ink bleed', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: isPaper, tip: 'Soft halo of the ink into the paper' },
    ],
    presets: [
      { name: 'Aged & folded', group: 'Realistic', values: { paperColor: '#2a5a94', paperEdge: '#16355e', mottle: 0.55, grain: 0.3, stains: 0.45, stainColor: '#7c9cc4', folds: 3, foldStrength: 0.7, inkWear: 0.3, inkBleed: 0.4, minorAlpha: 0.12, majorAlpha: 0.26 } },
      { name: 'Whiteprint (blue on white)', group: 'Realistic', values: { paperColor: '#f1f3f2', paperEdge: '#d9dedc', vignette: 0.5, mottle: 0.2, grain: 0.12, gridColor: '#3a68b0', inkColor: '#1d4a94', inkBleed: 0.15, minorAlpha: 0.12, majorAlpha: 0.25, stainColor: '#c9d3d6' } },
      { name: 'Diazo sepia', group: 'Realistic', values: { paperColor: '#e7dcc0', paperEdge: '#c6b48a', mottle: 0.4, grain: 0.25, stains: 0.3, stainColor: '#b89b62', gridColor: '#7a5a32', inkColor: '#4a2e14', inkBleed: 0.3, inkWear: 0.15, font: 'narrow', folds: 2, foldStrength: 0.45, minorAlpha: 0.12, majorAlpha: 0.22 } },
      { name: 'Engineering paper (green)', group: 'Realistic', values: { paperColor: '#e9f0e4', paperEdge: '#cfdac8', vignette: 0.3, mottle: 0.15, grain: 0.1, gridColor: '#5f9a6e', minorAlpha: 0.35, majorAlpha: 0.6, cells: 60, inkColor: '#22301f', inkBleed: 0.1, font: 'hand', wobble: 0.35, border: 'single', zones: false, titleRows: 3, tags: 3, notes: 5, stainColor: '#c8d4bf' } },
      { name: 'Military schematic', group: 'Realistic', values: { paperColor: '#3a4230', paperEdge: '#22281c', gridColor: '#c8cfa8', inkColor: '#e4e6cf', font: 'stencil', title: 'M-22 FIELD GENERATOR', subtitle: 'ORDNANCE DIV. 4', dwgNo: 'TM-9-2320', stamp: 'RESTRICTED', stampColor: '#d84a2a', tagShape: 'hex', tagText: 'grid', stains: 0.3, stainColor: '#545c44', inkWear: 0.2, folds: 2 } },
      { name: 'Classified dossier', group: 'Game-inspired', values: { stamp: 'CLASSIFIED', stampScale: 1.4, text1: 'PROJECT: NIGHTJAR', notes: 6, stains: 0.35, stainColor: '#5d7fb3', folds: 3, foldStrength: 0.6, inkWear: 0.25, tagText: 'detail' } },
      { name: 'Heist plan', group: 'Game-inspired', values: { paperColor: '#173b6e', paperEdge: '#0c2142', font: 'hand', wobble: 0.45, text1: 'VAULT', text2: 'GUARD ROUTE', text3: 'EXIT →', customScale: 2, accentOn: true, accentColor: '#ff5a4a', tags: 8, tagShape: 'circle', tagText: 'letters', tagSize: 1.3, shapes: 3, notes: 4, titleBlock: false, noteLines: 0, zones: false, border: 'single' } },
      { name: 'Dark navy terminal', group: 'Sci-fi', values: { paperColor: '#0b1f3a', paperEdge: '#050d1a', mottle: 0.2, grain: 0.15, gridColor: '#3cc8ff', minorAlpha: 0.14, majorAlpha: 0.3, inkColor: '#8fe6ff', inkBleed: 0.6, accentOn: true, accentColor: '#ffb43c', font: 'mono', tagShape: 'hex', tagText: 'grid' } },
      { name: 'Hologram schematic', group: 'Sci-fi', values: { paperColor: '#02131a', paperEdge: '#000507', vignette: 0.9, mottle: 0.1, grain: 0.25, gridColor: '#3cf2ff', minorStyle: 'dotted', minorAlpha: 0.4, majorAlpha: 0.25, inkColor: '#7ff8ff', inkBleed: 0.9, border: 'heavy', zones: false, cropMarks: true, tagShape: 'diamond', title: 'XR-7 REACTOR CORE', subtitle: 'ORBITAL YARD 3' } },
      { name: 'Sketchbook (hand-drawn)', group: 'Stylized', values: { paperColor: '#f4efe2', paperEdge: '#dcd2b8', mottle: 0.25, grain: 0.2, gridColor: '#8aa4c8', minorStyle: 'dotted', minorAlpha: 0.5, majorAlpha: 0, cells: 30, inkColor: '#2a2a33', font: 'hand', wobble: 0.6, inkBleed: 0.1, border: 'none', titleBlock: false, noteLines: 0, dimEnds: 'tick', tagShape: 'circle', stainColor: '#c8b88e', stains: 0.2 } },
      { name: 'Clean grid only', group: 'Simple', values: { border: 'none', titleBlock: false, noteLines: 0, notes: 0, shapes: 0, tags: 0, gridArea: 'full', inkBleed: 0, mottle: 0.15, grain: 0.1 } },
      { name: 'Frame + title only', group: 'Simple', values: { grid: false, notes: 0, shapes: 0, tags: 0, noteLines: 2 } },
      { name: 'Ink overlay (transparent)', group: 'Simple', values: { output: 'ink', inkColor: '#ffffff', gridColor: '#ffffff' } },
      { name: 'Post-apocalyptic salvage plan', group: 'Post-apocalyptic', values: { paperColor: '#3b4a5a', paperEdge: '#1e252c', mottle: 0.6, grain: 0.4, stains: 0.6, stainColor: '#6a5a42', folds: 4, foldStrength: 0.85, inkWear: 0.45, inkBleed: 0.35, wobble: 0.25, font: 'hand', text1: 'WATER PUMP — REBUILD', stamp: 'SCRAP', stampColor: '#c86a2a', minorAlpha: 0.1, majorAlpha: 0.2, gridColor: '#c8d0d8', inkColor: '#e8ece6' } },
    ],
    render,
  });
})();
