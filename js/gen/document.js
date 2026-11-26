/* Document: printed / typed / handwritten pages built from three text layers (title, subheadings,
   paragraphs). Each layer has its own style: real words (typewriter, book serif, monospace, narrow
   sans, handwriting) or a stylized stand-in (wavy lines, blocky "greeked" words with ascenders and
   descenders, flat bars, cursive scribble), its own font, size, color, bold / italic, letter case and
   alignment. Paragraphs flow in columns around pictures (halftone, photograph, engraving, chart,
   empty frame; inline or floating left / right, with captions). Paper can be ruled (lined notebook /
   grid). Edges: clean, rough, deckled, torn, burnt; folded corners and edge grime. Wear: yellowing,
   foxing spots, coffee rings and blot stains, fold lines, crumple, dirt, worn ink and ink bleed,
   paper grain. The sheet sits on a background with tilt and drop shadow, or is output transparent,
   as ink only or as a white-on-black ink mask.
   Sizes: text in pt as if the short side were an A4 page (210 mm); wear constants use u = short / 1050
   (0.2 mm on A4), so preview and export match at every resolution. */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp } = U;

  const FONTS = {
    typewriter: { f: '"Courier New", "Nimbus Mono PS", Courier, monospace', s: 1 },
    serif: { f: 'Georgia, "Times New Roman", "Nimbus Roman", serif', s: 1 },
    courier: { f: '"Cascadia Mono", Consolas, "Courier New", monospace', s: 0.95 },
    sans: { f: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif', s: 1.05 },
    grotesk: { f: 'system-ui, "Segoe UI", Roboto, Arial, sans-serif', s: 1 },
    stencil: { f: 'Impact, "Arial Narrow Bold", "Arial Narrow", sans-serif', s: 1 },
    hand: { f: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive', s: 0.95 },
  };
  const FONT_OPTS = [['typewriter', 'Typewriter'], ['serif', 'Book serif'], ['courier', 'Monospace'], ['sans', 'Narrow sans'], ['grotesk', 'Sans'], ['stencil', 'Poster / stencil'], ['hand', 'Handwritten']];
  const STYLE_OPTS = [['written', 'Written (real words)'], ['wavy', 'Stylized: wavy lines'], ['blocky', 'Stylized: blocky words'], ['bars', 'Stylized: bars'], ['scribble', 'Stylized: cursive scribble']];
  const SENT = ['The committee met on the third Tuesday of the month to review the outstanding accounts.', 'All parties agreed that the original survey markers had shifted since the last inspection.', 'Copies of the correspondence are held in the east reading room and may be requested in writing.', 'It was noted that the lower storeroom had taken on water during the spring thaw.', 'Further measurements will be taken once the weather allows safe access to the ridge.', 'The ledger shows a modest surplus, though several payments remain unconfirmed.', 'Witnesses described the signal lamp as steady and white, visible for nearly an hour.', 'No objection was raised to the proposed change in delivery schedule.', 'The enclosed map supersedes all earlier editions and should be filed accordingly.', 'Samples were sealed, labelled and sent by rail to the central laboratory for analysis.', 'A full inventory of the cabinet revealed two volumes missing from the second shelf.', 'The chairman thanked the members for their patience during a difficult season.', 'Readings at the northern station were consistently lower than those recorded in town.', 'Applicants are reminded that incomplete forms will be returned without review.', 'The bridge remains open to foot traffic but closed to carts until repairs are complete.', 'Several letters in the bundle bear the same unfamiliar seal and are undated.', 'Expenses for the expedition exceeded the original estimate by a small margin.', 'The board resolved to defer the matter until the next scheduled meeting.', 'Each entry has been checked against the station logbook and initialed by the clerk.', 'The western wing of the archive will be closed for cataloguing through the winter.', 'Our correspondent writes that the harbour was unusually quiet for the time of year.', 'Instructions for the care of bound records are attached as a separate sheet.', 'The figures given here are provisional and subject to correction.', 'Two copies of this notice should be kept, one posted and one retained on file.', 'Please return the signed receipt to this office at your earliest convenience.', 'The draft was read aloud, amended in two places, and approved without dissent.', 'Observers on the eastern slope reported a light frost before dawn on each of the four days.', 'Accounts held in the old currency will be converted at the published rate.'];
  const TITLES = ['Report of the Survey Committee', 'Minutes of the Quarterly Meeting', 'Notice to All Residents', 'Inventory of the East Archive', 'Field Notes, Northern Station', 'Statement of Accounts', 'Memorandum on the Storage of Records', 'Correspondence Received, Spring Term'];
  const SUBS = ['Background', 'Findings', 'Observations', 'Accounts', 'Recommendations', 'Correspondence', 'Remarks', 'Method of Survey', 'Matters Arising', 'Schedule', 'Notes on Sources', 'Appendix'];
  const CAPS = ['View from the eastern ridge.', 'The storeroom after the thaw.', 'Survey marker, north boundary.', 'Plan of the lower archive.', 'Sample site no. 4.', 'Harbour at low tide.', 'Station hut, looking west.', 'Detail of the seal.'];

  const isColor = (p) => p.output === 'color';
  const hasPaper = (p) => p.output === 'color' || p.output === 'sheet';
  const titleOn = (p) => !!p.tOn;
  const subsOn = (p) => p.sCount > 0 || /(^|\|)\s*#/.test(p.bText || '');

  /* ---------- small helpers ---------- */
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = U.hash(xi, yi, s), b = U.hash(xi + 1, yi, s), c = U.hash(xi, yi + 1, s), d = U.hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, o = 4) { let f = 1, a = 0.5, t = 0, n = 0; for (let i = 0; i < o; i++) { t += a * vnoise(x * f, y * f, s + i * 101); n += a; f *= 2; a *= 0.5; } return t / n; }
  const mixHex = (a, b, t) => { const A = U.hex(a), B = U.hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  const lum = (h) => { const [r, g, b] = U.hex(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  const roman = (n) => { let s = ''; for (const [v, r] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (n >= v) { s += r; n -= v; } return s; };
  const caseOf = (t, c) => (c === 'upper' ? t.toUpperCase() : c === 'lower' ? t.toLowerCase() : t);
  /* small canvas of fbm noise mapped to alpha by alphaFn(v); drawn scaled up for soft, resolution-free blotches */
  function noiseLayer(w, h, freq, seed, oct, alphaFn, color) {
    w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
    const c = U.canvas(w, h), x = c.getContext('2d'), id = x.createImageData(w, h), D = id.data, [r, g, b] = U.hex(color);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const v = fbm((i / w) * freq, (j / w) * freq, seed, oct), o = (j * w + i) * 4;
      D[o] = r; D[o + 1] = g; D[o + 2] = b; D[o + 3] = clamp(alphaFn(v, i, j)) * 255;
    }
    x.putImageData(id, 0, 0);
    return c;
  }

  /* ---------- the three text layers ---------- */
  // t = title, s = subheadings, b = paragraphs (captions use the paragraph layer, italic and smaller)
  function layerOf(p, k, S) {
    const F = FONTS[p[k + 'Font']] || FONTS.typewriter;
    return {
      style: p[k + 'Style'] || 'written', F, size: p[k + 'Size'] * S * 0.00168, color: p[k + 'Color'],
      bold: !!p[k + 'Bold'], ital: !!p[k + 'Italic'], kase: p[k + 'Case'], align: p[k + 'Align'],
      weight: p[k + 'Weight'], waveAmp: p[k + 'WaveAmp'], waveFreq: p[k + 'WaveFreq'],
    };
  }
  const fontStr = (Ly, size, ital) => `${ital || Ly.ital ? 'italic ' : ''}${Ly.bold ? 700 : 400} ${Math.max(1, size * Ly.F.s)}px ${Ly.F.f}`;

  /* ---------- text source ---------- */
  function source(p, rnd) {
    const title = (p.tText || '').trim() || TITLES[Math.floor(rnd() * TITLES.length)];
    const subs = (p.sText || '').split('|').map((s) => s.trim()).filter(Boolean);
    const raw = (p.bText || '').trim();
    const out = { title, subs: subs.length ? subs : null, custom: false };
    if (!raw) return out;
    // parts split by "|"; a part starting with "#" is a subheading
    const seq = raw.split('|').map((s) => s.trim()).filter(Boolean).map((s) => (s[0] === '#' ? { h: s.replace(/^#+\s*/, '') } : { p: s }));
    const paras = seq.filter((x) => x.p).map((x) => x.p);
    return Object.assign(out, { custom: true, seq, paras: paras.length ? paras : [SENT[0]], hasHeads: seq.some((x) => x.h) });
  }
  const makePara = (rnd) => { const n = 2 + Math.floor(rnd() * 4), a = []; for (let i = 0; i < n; i++) a.push(SENT[Math.floor(rnd() * SENT.length)]); return a.join(' '); };

  /* ---------- layout: returns positioned words, rules and picture boxes in sheet space ---------- */
  function layout(p, pw, ph, S, mctx) {
    const rnd = U.rng((p.seed | 0) * 7 + 1);
    const lays = { t: layerOf(p, 't', S), s: layerOf(p, 's', S), b: layerOf(p, 'b', S) };
    const B = lays.b, size = B.size, lh = size * p.bLeading;
    const m = (p.margin / 100) * Math.min(pw, ph);
    const top = m * p.marginTop, bottom = ph - m * 1.05, left = m, right = pw - m, cw = right - left;
    const cols = Math.max(1, p.columns | 0);
    const gut = cols > 1 ? Math.max(size * 1.2, (p.colGap / 100) * Math.min(pw, ph)) : 0, colW = (cw - gut * (cols - 1)) / cols;
    const items = [], floats = [];
    const cache = new Map();
    const meas = (t, font) => { const key = font + '|' + t; let v = cache.get(key); if (v === undefined) { mctx.font = font; v = mctx.measureText(t).width; cache.set(key, v); } return v; };
    const src = source(p, rnd);
    let colTop = top, col = 0, y = top, full = false;
    const colX = (c) => left + c * (colW + gut);
    const nextCol = () => { col++; y = colTop; if (col >= cols) full = true; };
    const baseOf = (yy, L, sz) => yy + (L - sz) / 2 + sz * 0.8;
    const push = (layer, t, x, yy, L, sz, ww, font, ital) => items.push({ type: 'word', layer, text: t, x, y: baseOf(yy, L, sz), w: ww, size: sz, font, ital });

    // free-standing block (title, captions): wraps inside [x0, x0 + w], up to maxLines
    function wrapBlock(layer, text, x0, w, yy, sz, L, align, maxLines, ital) {
      const Ly = lays[layer], font = fontStr(Ly, sz, ital), words = caseOf(text, Ly.kase).split(/\s+/).filter(Boolean), sp = meas(' ', font);
      let i = 0, n = 0;
      while (i < words.length && (!maxLines || n < maxLines)) {
        const line = []; let ws = 0;
        while (i < words.length) { const ww = meas(words[i], font), add = line.length ? sp + ww : ww; if (ws + add > w && line.length) break; line.push([words[i], ww]); ws += add; i++; }
        let x = align === 'center' ? x0 + (w - ws) / 2 : align === 'right' ? x0 + w - ws : x0;
        for (const [t, ww] of line) { push(layer, t, x, yy, L, sz, ww, font, ital); x += ww + sp; }
        yy += L; n++;
      }
      return yy;
    }
    function span(y0, y1) {
      let x0 = colX(col), x1 = x0 + colW;
      for (const f of floats) {
        if (f.col !== col || f.y1 <= y0 || f.y0 >= y1) continue;
        if (f.side === 'left') x0 = Math.max(x0, f.x1 + size * 1.2); else x1 = Math.min(x1, f.x0 - size * 1.2);
      }
      return [x0, x1];
    }
    // flowing block (paragraphs, subheadings): column breaks and floating pictures
    function flow(layer, text, L, indent) {
      const Ly = lays[layer], sz = Ly.size, font = fontStr(Ly, sz), words = caseOf(text, Ly.kase).split(/\s+/).filter(Boolean), sp = meas(' ', font);
      let i = 0, first = true;
      while (i < words.length) {
        if (y + L > bottom) { nextCol(); if (full) return false; }
        const [x0, x1] = span(y, y + L);
        if (x1 - x0 < size * 5) { y += L; continue; }
        const ind = first && indent ? sz * 2.2 : 0, avail = x1 - x0 - ind;
        const line = []; let ws = 0;
        while (i < words.length) { const ww = meas(words[i], font), add = line.length ? sp + ww : ww; if (ws + add > avail && line.length) break; line.push([words[i], ww]); ws += add; i++; }
        const last = i >= words.length;
        let x = x0 + ind, gap = sp;
        if (Ly.align === 'justify' && !last && line.length > 1) gap = sp + (avail - ws) / (line.length - 1);
        else if (Ly.align === 'center') x = x0 + (x1 - x0 - ws) / 2;
        else if (Ly.align === 'right') x = x1 - ws;
        for (const [t, ww] of line) { push(layer, t, x, y, L, sz, ww, font); x += ww + gap; }
        y += L; first = false;
      }
      return true;
    }

    // title spans every column
    if (p.tOn) {
      // shrink the title until it fits in its line limit, so no words are dropped
      const T = lays.t, maxL = Math.max(1, p.tMaxLines | 0), words = caseOf(src.title, T.kase).split(/\s+/).filter(Boolean);
      const linesAt = (sz) => {
        const font = fontStr(T, sz), sp = meas(' ', font);
        let n = 1, ws = 0;
        for (const wd of words) { const ww = meas(wd, font); if (ws && ws + sp + ww > cw) { n++; ws = ww; } else ws += (ws ? sp : 0) + ww; }
        return n;
      };
      let ts = T.size;
      for (let i = 0; i < 24 && linesAt(ts) > maxL; i++) ts *= 0.93;
      const L = ts * p.tLeading;
      y = wrapBlock('t', src.title, left, cw, y, ts, L, T.align, maxL);
      if (p.tRule) { y += lh * 0.25; items.push({ type: 'rule', x0: left, x1: right, y, t: Math.max(1, ts * 0.05 * p.tRuleW) }); y += lh * 0.5; }
      y += lh * p.tSpace;
      colTop = y;
    }
    // how many paragraphs fit (spreads subheadings and pictures evenly over the page when filling)
    const charW = meas('abcdefghijklmnopqrstuvwxyz', fontStr(B, size)) / 26;
    const avgChars = src.custom ? Math.max(1, src.paras.reduce((a, s) => a + s.length, 0) / src.paras.length) : 230;
    const linesPer = (avgChars * charW) / colW + 0.6;
    const est = p.fill ? Math.max(2, Math.floor((cols * (bottom - colTop)) / ((linesPer + p.paraGap) * lh))) : p.paragraphs;
    const spread = (n, off) => { const s = new Map(); for (let i = 0; i < n; i++) { const at = Math.max(off, Math.round(((i + off) * est) / (n + (off ? 1 : 0)))); s.set(at, (s.get(at) || 0) + 1); } return s; };
    const subAt = src.custom && src.hasHeads ? new Map() : spread(p.sCount | 0, 1);
    const picAt = spread(p.pics, p.pics > 0 ? 1 : 0);
    if (p.pics > 0 && est <= 2) { picAt.clear(); picAt.set(0, p.pics); }
    let subN = 0, picN = 0, ci = 0;

    function heading(text) {
      const Ly = lays.s, L = Ly.size * p.sLeading;
      if (y + L + lh * 3 > bottom && y > colTop) { nextCol(); if (full) return; }
      if (y > colTop + 1) y += lh * p.sSpace;
      flow('s', text, L, false);
      y += lh * p.sAfter;
    }
    const subLabel = (n) => {
      const name = src.subs ? src.subs[(n - 1) % src.subs.length] : SUBS[(n - 1 + ((p.seed | 0) % 5)) % SUBS.length];
      switch (p.sNumber) {
        case 'arabic': return `${n}. ${name}`;
        case 'roman': return `${roman(n)}. ${name}`;
        case 'letter': return `${String.fromCharCode(64 + ((n - 1) % 26) + 1)}. ${name}`;
        case 'section': return `§ ${n} ${name}`;
        default: return name;
      }
    };
    function picture() {
      picN++;
      let place = p.picPlace === 'mixed' ? ['inline', 'left', 'right', 'inline'][Math.floor(rnd() * 4)] : p.picPlace;
      if (cols > 2 && place !== 'inline') place = 'inline';
      const aspect = 0.55 + rnd() * 0.3;
      let w = place === 'inline' ? colW * p.picSize : colW * p.picSize * 0.62, h = w * aspect;
      const capS = size * 0.85, capH = p.captions ? capS * 1.35 * 2 + size * 0.4 : 0, colH = bottom - colTop;
      if (h + capH > colH * 0.8) { h = Math.max(size, colH * 0.8 - capH); w = h / aspect; }
      if (y + h + capH > bottom) { nextCol(); if (full) return; }
      if (y > colTop + 1 && place === 'inline') y += lh * 0.3;
      const x = place === 'right' ? colX(col) + colW - w : place === 'left' ? colX(col) : colX(col) + (colW - w) / 2;
      items.push({ type: 'pic', x, y, w, h, seed: (p.seed | 0) * 31 + picN * 977 });
      let yy = y + h + size * 0.5;
      if (p.captions) yy = wrapBlock('b', `Fig. ${picN}. ` + CAPS[Math.floor(rnd() * CAPS.length)], x, w, yy, capS, capS * 1.35, place === 'inline' ? 'center' : 'left', 2, true);
      if (place === 'inline') y = yy + lh * 0.6;
      else floats.push({ col, y0: y, y1: yy + size * 0.6, x0: x, x1: x + w, side: place });
    }
    const maxP = p.fill ? 600 : p.paragraphs;
    if (src.custom && src.hasHeads) {
      let n = 0;
      for (let r = 0; !full && n < maxP && r < 60; r++) {
        for (const blk of src.seq) {
          if (full || n >= maxP) break;
          if (blk.h) { heading(blk.h); continue; }
          if (picAt.has(n)) for (let q = picAt.get(n); q > 0 && !full; q--) picture();
          if (full || !flow('b', blk.p, lh, p.bIndent)) break;
          y += lh * p.paraGap; n++;
        }
        if (!p.fill) break;
      }
    } else {
      for (let n = 0; n < maxP && !full; n++) {
        if (subAt.has(n)) heading(subLabel(++subN));
        if (full) break;
        if (picAt.has(n)) for (let q = picAt.get(n); q > 0 && !full; q--) picture();
        if (full) break;
        if (!flow('b', src.custom ? src.paras[ci++ % src.paras.length] : makePara(rnd), lh, p.bIndent)) break;
        y += lh * p.paraGap;
      }
    }
    return { items, lays, size, lh, left, colTop };
  }

  /* ---------- pictures ---------- */
  function landscape(u, v, s) {
    const r1 = 0.36 + (fbm(u * 2.2, 1.3, s, 4) - 0.5) * 0.5, r2 = 0.6 + (fbm(u * 3.4, 7.7, s + 9, 4) - 0.5) * 0.32;
    let d;
    if (v < r1) d = 0.07 + v * 0.3 + (fbm(u * 3, v * 6, s + 3, 3) - 0.5) * 0.18;
    else if (v < r2) d = 0.42 + (v - r1) * 0.5 + (fbm(u * 9, v * 9, s + 5, 4) - 0.5) * 0.5;
    else d = 0.68 + (fbm(u * 14, v * 12, s + 7, 4) - 0.5) * 0.7;
    const su = 0.2 + U.hash(s, 1, 3) * 0.6, sv = 0.16 + U.hash(s, 2, 3) * 0.12, dx = u - su, dy = v - sv;
    if (v < r1 && dx * dx + dy * dy < 0.006) d = 0;
    return clamp(d);
  }
  function drawPicture(ctx, it, p, ink) {
    const w = Math.max(4, Math.round(it.w)), h = Math.max(4, Math.round(it.h));
    const c = U.canvas(w, h), x = c.getContext('2d'), s = it.seed | 0, unit = Math.max(1, w / 300), style = p.picStyle;
    if (style === 'placeholder') {
      x.fillStyle = ink; x.globalAlpha = 0.07; x.fillRect(0, 0, w, h);
      x.globalAlpha = 0.6; x.strokeStyle = ink; x.lineWidth = unit;
      x.beginPath(); x.moveTo(0, 0); x.lineTo(w, h); x.moveTo(w, 0); x.lineTo(0, h); x.stroke();
    } else if (style === 'chart') {
      const r = U.rng(s); x.strokeStyle = x.fillStyle = ink; x.lineWidth = unit * 1.2;
      const L = w * 0.1, B = h * 0.88, T = h * 0.08, R = w * 0.96;
      x.globalAlpha = 0.25;
      for (let i = 1; i <= 4; i++) { const yy = B - ((B - T) * i) / 4; x.beginPath(); x.moveTo(L, yy); x.lineTo(R, yy); x.stroke(); }
      x.globalAlpha = 1; x.beginPath(); x.moveTo(L, T); x.lineTo(L, B); x.lineTo(R, B); x.stroke();
      const n = 5 + Math.floor(r() * 5), bw = (R - L) / n;
      let v = 0.3 + r() * 0.4;
      for (let i = 0; i < n; i++) { v = clamp(v + (r() - 0.45) * 0.35, 0.1, 0.95); x.globalAlpha = i % 2 ? 0.55 : 0.85; x.fillRect(L + bw * i + bw * 0.18, B - (B - T) * v, bw * 0.64, (B - T) * v); }
      x.globalAlpha = 1;
    } else if (style === 'halftone') {
      const cell = Math.max(3, w / 70); x.fillStyle = ink;
      for (let cy = cell / 2; cy < h; cy += cell) for (let cx = cell / 2; cx < w; cx += cell) {
        const r = cell * 0.62 * Math.sqrt(landscape(cx / w, cy / h, s));
        if (r > 0.3) { x.beginPath(); x.arc(cx, cy, r, 0, U.TAU); x.fill(); }
      }
    } else {
      const id = x.createImageData(w, h), D = id.data, [R, G, B] = U.hex(ink), per = Math.max(3, w / 85);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const d = landscape(i / w, j / h, s);
        let a;
        if (style === 'engraving') { const off = Math.sin((i / per) * 0.35 + d * 2.5) * per * 0.35, f = (((j + off) / per) % 1 + 1) % 1; a = clamp(d * 0.5 * per - Math.abs(f - 0.5) * per + 0.5); }
        else a = clamp(d * 0.92 + (U.hash(i, j, s) - 0.5) * 0.12);
        const o = (j * w + i) * 4; D[o] = R; D[o + 1] = G; D[o + 2] = B; D[o + 3] = a * 255;
      }
      x.putImageData(id, 0, 0);
    }
    ctx.drawImage(c, it.x, it.y, it.w, it.h);
    if (p.frame) { ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, unit * 1.1); ctx.strokeRect(it.x, it.y, it.w, it.h); }
  }


  /* ---------- words (drawn in the style of their layer) ---------- */
  const ASC = /[bdfhklt0-9A-Z'"!?(){}[\]/|§]/, DESC = /[gjpqy,;]/;
  function drawWord(c, it, Ly, p, r) {
    const sz = it.size, w = it.w, x0 = it.x, xh = sz * 0.5;
    const by = it.y + (r() - 0.5) * p.wobble * sz * 0.22, rot = (r() - 0.5) * p.wobble * 0.05;
    if (Ly.style === 'written') {
      // whole-pixel baseline and no sub-pixel rotation: hinted (unrotated) and unhinted words otherwise differ in
      // weight at small sizes, so some words look bold
      c.save(); c.translate(x0, Math.round(by)); if (Math.abs(rot) * w >= 0.5) c.rotate(rot); c.font = it.font; c.fillText(it.text, 0, 0); c.restore();
      return;
    }
    const wt = Ly.weight * (Ly.bold ? 1.35 : 1);
    c.save(); c.translate(x0, by); c.rotate(rot);
    if (it.ital || Ly.ital) c.transform(1, 0, -0.22, 1, 0, 0); // slant the stand-in like italics
    if (Ly.style === 'blocky') {
      const n = it.text.length, cw = w / n, h0 = xh * Math.min(1.4, 0.7 + wt * 0.3);
      for (let i = 0; i < n; i++) {
        const ch = it.text[i];
        let a = -h0, b = 0;
        if (ASC.test(ch)) a = -sz * 0.72 * Math.min(1.25, 0.8 + wt * 0.2);
        if (DESC.test(ch)) b = sz * 0.22;
        if (/[.,:;]/.test(ch)) a = -h0 * 0.35;
        c.fillRect(i * cw, a, cw * 1.04, b - a);
      }
    } else if (Ly.style === 'bars') {
      const h = xh * 0.6 * wt, yy = -xh * 0.25 - h / 2;
      c.beginPath(); if (c.roundRect) c.roundRect(0, yy, w, h, h / 2); else c.rect(0, yy, w, h); c.fill();
    } else {
      c.lineWidth = sz * 0.1 * wt; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
      if (Ly.style === 'wavy') {
        const st = Math.max(0.6, sz * 0.06), ph = r() * U.TAU, f = (Ly.waveFreq * 3.2) / sz;
        for (let t = 0; t <= w; t += st) { const yy = -xh * 0.5 + Math.sin(t * f + ph) * xh * 0.45 * Ly.waveAmp; if (t) c.lineTo(t, yy); else c.moveTo(0, yy); }
      } else { // scribble: looping cursive, taller loops on ascender / descender letters
        const n = it.text.length, steps = Math.max(12, n * 18);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps, ch = it.text[Math.min(n - 1, Math.floor(t * n))], th = t * n * Ly.waveFreq * U.TAU, sn = Math.sin(th);
          let amp = xh * 0.42 * Ly.waveAmp;
          if ((sn > 0 && ASC.test(ch)) || (sn < 0 && DESC.test(ch))) amp *= 2.2;
          const px = t * w - Math.cos(th) * xh * 0.28 * Ly.waveAmp, py = -xh * 0.5 - sn * amp;
          if (s) c.lineTo(px, py); else c.moveTo(px, py);
        }
      }
      c.stroke();
    }
    c.restore();
  }

  /* ---------- sheet outline ---------- */
  function edgePoly(p, pw, ph, u) {
    const r = U.rng((p.seed | 0) * 13 + 5), pts = [], amt = p.edge === 'clean' ? 0 : p.edgeAmt;
    const [A, B, F, bite] = { clean: [0, 0, 1, 0], rough: [9, 2.5, 14, 0], deckled: [5, 9, 10, 0], torn: [34, 9, 5, 1], burnt: [55, 16, 3, 1.4] }[p.edge] || [0, 0, 1, 0];
    const ref = Math.min(pw, ph);
    const sides = [[0, 0, 1, 0, 0, 1, pw], [pw, 0, 0, 1, -1, 0, ph], [pw, ph, -1, 0, 0, -1, pw], [0, ph, 0, -1, 1, 0, ph]];
    sides.forEach(([sx, sy, dx, dy, nx, ny, len], si) => {
      const n = Math.max(40, Math.round((420 * len) / ref));
      let bl = 0, bd = 0, bi = 0;
      for (let j = 0; j < n; j++) {
        const s = j / n, q = (s * len) / ref;
        let d = amt * u * (A * fbm(q * F, si * 7.31, (p.seed | 0) + 17, 4) + B * r() * (0.4 + 0.6 * fbm(q * 40, si * 3.1, p.seed | 0, 2)));
        if (bite && amt) {
          if (bl <= 0 && r() < 0.004 * amt * bite) { bl = 3 + Math.floor(r() * 12); bi = bl; bd = (10 + r() * 35) * u * amt * bite; }
          if (bl > 0) { d += bd * Math.sin(Math.PI * (1 - bl / bi)); bl--; }
        }
        d = Math.min(d, Math.min(s, 1 - s) * len * 1.2 + amt * u * A * 0.4);
        pts.push([sx + dx * s * len + nx * d, sy + dy * s * len + ny * d]);
      }
    });
    return pts;
  }
  /* soft shadow cast inward from the outline (edge grime, scorch) */
  function innerShadow(d, path, pw, ph, color, blur) {
    if (blur <= 0) return;
    d.save(); d.clip(path); d.shadowColor = color; d.shadowBlur = blur;
    const q = new Path2D(); q.rect(-pw, -ph, pw * 3, ph * 3); q.addPath(path);
    d.fillStyle = '#000'; d.fill(q, 'evenodd'); d.restore();
  }

  /* ---------- render ---------- */
  function render(ctx, W, H, p) {
    const seed = p.seed | 0, S = Math.min(W, H);
    const ins = (p.inset / 512) * S;
    const pw = Math.max(8, Math.round(W - 2 * ins)), ph = Math.max(8, Math.round(H - 2 * ins));
    const u = Math.min(pw, ph) / 1050; // 0.2 mm on an A4 short side
    const area = (pw * ph) / (u * u * 1050 * 1485);
    const ink = p.bColor, age = p.ageColor, paper = p.paperColor, darkAge = mixHex(age, '#000000', 0.35);
    const nW = pw / u / 7, nH = ph / u / 7;

    const doc = U.canvas(pw, ph), d = doc.getContext('2d');
    const poly = edgePoly(p, pw, ph, u), path = new Path2D();
    poly.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
    const L = layout(p, pw, ph, Math.min(pw, ph), d);

    /* print layer: words, rules and pictures in their own colors */
    const pr = U.canvas(pw, ph), c = pr.getContext('2d');
    c.textBaseline = 'alphabetic';
    const rd = U.rng(seed * 3 + 11);
    for (const it of L.items) {
      if (it.type === 'word') { const Ly = L.lays[it.layer]; c.fillStyle = c.strokeStyle = Ly.color; c.globalAlpha = 1 - rd() * p.inkFade * 0.45; drawWord(c, it, Ly, p, rd); }
      else if (it.type === 'rule') { c.globalAlpha = 1; c.fillStyle = p.tColor; c.fillRect(it.x0, it.y, it.x1 - it.x0, it.t); }
      else { c.globalAlpha = 1; drawPicture(c, it, p, p.picColor); }
    }
    c.globalAlpha = 1;

    /* fold and crumple lines (shared by the ink wear and the paper shading) */
    const rc = U.rng(seed * 5 + 3), creases = [];
    const FOLD = [['h', 1 / 3], ['h', 2 / 3], ['v', 1 / 2], ['h', 1 / 2], ['v', 1 / 4], ['v', 3 / 4]];
    for (let i = 0; i < Math.min(6, p.creases | 0); i++) {
      const [o, f] = FOLD[i], j = (rc() - 0.5) * 0.03, t = (rc() - 0.5) * 0.025;
      creases.push(o === 'h' ? { a: [-10, ph * (f + j - t)], b: [pw + 10, ph * (f + j + t)], w: 1 } : { a: [pw * (f + j - t), -10], b: [pw * (f + j + t), ph + 10], w: 1 });
    }
    for (let i = 0; i < Math.round(p.crumple * 36 * Math.sqrt(area)); i++) {
      const cx = rc() * pw, cy = rc() * ph, a = rc() * Math.PI, l = (0.15 + rc() * 0.5) * Math.max(pw, ph);
      creases.push({ a: [cx - (Math.cos(a) * l) / 2, cy - (Math.sin(a) * l) / 2], b: [cx + (Math.cos(a) * l) / 2, cy + (Math.sin(a) * l) / 2], w: 0.35 + rc() * 0.4 });
    }
    const cpaths = creases.map((cr) => {
      const [ax, ay] = cr.a, [bx, by] = cr.b, nl = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / nl, ny = (bx - ax) / nl, q = new Path2D();
      for (let i = 0; i <= 30; i++) {
        const t = i / 30, o = (fbm(t * 6, ax * 0.01, seed + (i % 2), 2) - 0.5) * 6 * u;
        const x = ax + (bx - ax) * t + nx * o, y = ay + (by - ay) * t + ny * o;
        if (i) q.lineTo(x, y); else q.moveTo(x, y);
      }
      return { q, nx, ny, w: cr.w };
    });

    /* ink wear: rubbed off along folds, patchy fading, fine broken type */
    c.globalCompositeOperation = 'destination-out';
    for (const cp of cpaths) { c.lineWidth = (3 + p.inkFade * 6) * u * cp.w; c.strokeStyle = `rgba(0,0,0,${(0.35 + p.inkFade * 0.4) * cp.w})`; c.stroke(cp.q); }
    if (p.inkFade > 0) {
      const f = p.inkFade;
      c.drawImage(noiseLayer(nW, nH, 7, seed + 401, 5, (v) => clamp((v - (0.68 - f * 0.4)) * 3.2) * (0.25 + f * 0.75), '#000000'), 0, 0, pw, ph);
      const fw = (pw / u) * 0.32, fh = (ph / u) * 0.32;
      c.drawImage(noiseLayer(fw, fh, 90, seed + 409, 2, (v, i, j) => (U.hash(i, j, seed) < f * 0.35 ? clamp((v - 0.45) * 3) : 0), '#000000'), 0, 0, pw, ph);
    }
    c.globalCompositeOperation = 'destination-in';
    c.fill(path);
    c.globalCompositeOperation = 'source-over';

    /* ink only / mask: no paper */
    if (!hasPaper(p)) {
      const out = U.canvas(pw, ph), o = out.getContext('2d');
      if (p.inkBleed > 0) { o.save(); o.filter = `blur(${(p.inkBleed * 2.2 * u).toFixed(2)}px)`; o.globalAlpha = 0.25 + p.inkBleed * 0.45; o.drawImage(pr, 0, 0); o.restore(); }
      o.drawImage(pr, 0, 0);
      if (p.output === 'mask') { o.globalCompositeOperation = 'source-in'; o.fillStyle = '#fff'; o.fillRect(0, 0, pw, ph); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate((p.tilt * Math.PI) / 180); ctx.drawImage(out, -pw / 2, -ph / 2); ctx.restore();
      return;
    }

    /* paper */
    d.save(); d.clip(path);
    d.fillStyle = paper; d.fillRect(0, 0, pw, ph);
    { // fibers
      const r = U.rng(seed + 77), n = Math.round(p.grain * 700 * area);
      d.lineWidth = Math.max(0.5, u * 0.6);
      for (let i = 0; i < n; i++) {
        const x = r() * pw, y = r() * ph, a = r() * U.TAU, l = (6 + r() * 22) * u;
        d.strokeStyle = r() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.08)';
        d.beginPath(); d.moveTo(x, y); d.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); d.stroke();
      }
    }
    if (p.aging > 0) { // yellowing: overall tint, darker toward the edges, blotchy
      d.globalCompositeOperation = 'multiply';
      d.fillStyle = U.rgba(age, p.aging * 0.16); d.fillRect(0, 0, pw, ph);
      const g = d.createRadialGradient(pw / 2, ph / 2, Math.min(pw, ph) * 0.25, pw / 2, ph / 2, Math.hypot(pw, ph) * 0.55);
      g.addColorStop(0, U.rgba(age, 0)); g.addColorStop(1, U.rgba(age, p.aging * 0.45));
      d.fillStyle = g; d.fillRect(0, 0, pw, ph);
      d.imageSmoothingQuality = 'high';
      d.drawImage(noiseLayer(nW, nH, 5, seed + 211, 4, (v) => clamp((v - 0.42) * 2.4) * p.aging * 0.4, age), 0, 0, pw, ph);
      d.globalCompositeOperation = 'source-over';
    }
    if (p.ruling !== 'none') {
      d.strokeStyle = U.rgba(p.lineColor, 0.75); d.lineWidth = Math.max(1, u * 0.9);
      const off = (L.lh - L.size) / 2 + L.size * 0.92;
      for (let y = L.colTop + off; y < ph - u * 10; y += L.lh) { d.beginPath(); d.moveTo(0, y); d.lineTo(pw, y); d.stroke(); }
      if (p.ruling === 'grid') for (let x = L.left % L.lh; x < pw; x += L.lh) { d.beginPath(); d.moveTo(x, 0); d.lineTo(x, ph); d.stroke(); }
      else { d.strokeStyle = U.rgba(p.marginColor, 0.7); const mx = L.left * 0.72; d.beginPath(); d.moveTo(mx, 0); d.lineTo(mx, ph); d.stroke(); }
    }
    // ink onto paper: multiply when the ink is darker than the paper, else plain over (chalk, blueprint)
    const mult = lum(ink) < lum(paper), op = mult ? 'multiply' : 'source-over';
    d.globalCompositeOperation = op;
    if (p.inkBleed > 0) { d.save(); d.filter = `blur(${(p.inkBleed * 2.2 * u).toFixed(2)}px)`; d.globalAlpha = 0.25 + p.inkBleed * 0.45; d.drawImage(pr, 0, 0); d.restore(); d.globalCompositeOperation = op; }
    d.globalAlpha = mult ? 0.94 : 0.9; d.drawImage(pr, 0, 0); d.globalAlpha = 1;
    // stains: coffee rings and blots with a darker tide line
    d.globalCompositeOperation = 'multiply';
    { const r = U.rng(seed * 17 + 9);
      for (let i = 0; i < (p.stains | 0); i++) {
        const cx = pw * (0.08 + r() * 0.84), cy = ph * (0.08 + r() * 0.84);
        if (r() < 0.55) {
          const R = (140 + r() * 80) * u * p.stainSize;
          const g = d.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
          g.addColorStop(0, U.rgba(age, 0.03)); g.addColorStop(0.85, U.rgba(age, 0.09)); g.addColorStop(1, U.rgba(age, 0));
          d.fillStyle = g; d.beginPath(); d.arc(cx, cy, R, 0, U.TAU); d.fill();
          const a0 = r() * U.TAU, sw = Math.PI * (1.1 + r() * 0.9);
          for (let j = 0; j < 4; j++) {
            d.beginPath(); d.lineWidth = (2 + r() * 4) * u; d.strokeStyle = U.rgba(darkAge, 0.12 + r() * 0.18);
            d.arc(cx + (r() - 0.5) * 4 * u, cy + (r() - 0.5) * 4 * u, R * (0.95 + r() * 0.05), a0 + r() * 0.4, a0 + sw * (0.6 + r() * 0.4)); d.stroke();
          }
        } else {
          const R = (60 + r() * 160) * u * p.stainSize, q = new Path2D(), ss = r() * 999, sq = 0.7 + r() * 0.05;
          for (let j = 0; j <= 48; j++) {
            const a = (j / 48) * U.TAU, rr = R * (0.55 + fbm(Math.cos(a) * 1.5 + ss, Math.sin(a) * 1.5, seed, 3) * 0.9);
            if (j) q.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sq); else q.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * sq);
          }
          q.closePath();
          d.save(); d.filter = `blur(${(3 * u).toFixed(2)}px)`; d.fillStyle = U.rgba(age, 0.12 + r() * 0.12); d.fill(q); d.restore();
          d.globalCompositeOperation = 'multiply'; d.strokeStyle = U.rgba(darkAge, 0.22); d.lineWidth = 1.6 * u; d.stroke(q);
        }
      } }
    if (p.foxing > 0) { // reddish-brown age spots, partly clustered
      const r = U.rng(seed * 19 + 2), fx = mixHex(age, '#8a3a18', 0.45), n = Math.round(p.foxing * 260 * area), cl = [];
      for (let i = 0; i < 5; i++) cl.push([r() * pw, r() * ph]);
      for (let i = 0; i < n; i++) {
        let x, y;
        if (r() < 0.6) { const q = cl[i % 5]; x = q[0] + (r() + r() + r() - 1.5) * pw * 0.18; y = q[1] + (r() + r() + r() - 1.5) * ph * 0.14; }
        else { x = r() * pw; y = r() * ph; }
        const R = (1 + Math.pow(r(), 3) * 9) * u * 2, a = 0.25 + r() * 0.45, g = d.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, U.rgba(fx, a)); g.addColorStop(0.6, U.rgba(fx, a * 0.5)); g.addColorStop(1, U.rgba(fx, 0));
        d.fillStyle = g; d.beginPath(); d.arc(x, y, R, 0, U.TAU); d.fill();
      }
    }
    if (p.dirt > 0) { // smudges + specks
      const r = U.rng(seed * 23 + 4), dc = mixHex(age, '#1a1612', 0.7);
      for (let i = 0; i < Math.round(p.dirt * 7 * area); i++) {
        const x = r() * pw, y = r() * ph, R = (40 + r() * 140) * u, g = d.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, U.rgba(dc, 0.07 * p.dirt + 0.02)); g.addColorStop(1, U.rgba(dc, 0));
        d.fillStyle = g; d.save(); d.translate(x, y); d.scale(1, 0.5 + r() * 0.6); d.rotate(r() * 3); d.translate(-x, -y); d.beginPath(); d.arc(x, y, R, 0, U.TAU); d.fill(); d.restore();
      }
      d.fillStyle = U.rgba(dc, 0.55);
      for (let i = 0; i < Math.round(p.dirt * 1400 * area); i++) {
        const x = r() * pw, y = r() * ph, R = (0.25 + Math.pow(r(), 4) * 2.5) * u * 1.6;
        d.globalAlpha = 0.25 + r() * 0.6; d.beginPath(); d.arc(x, y, R, 0, U.TAU); d.fill();
      }
      d.globalAlpha = 1;
    }
    if (p.crumple > 0) { // broad light / dark undulation
      d.drawImage(noiseLayer(nW, nH, 6, seed + 505, 3, (v) => clamp((v - 0.5) * 2.2) * p.crumple * 0.2, '#000000'), 0, 0, pw, ph);
      d.globalCompositeOperation = 'source-over';
      d.drawImage(noiseLayer(nW, nH, 6, seed + 505, 3, (v) => clamp((0.5 - v) * 2.2) * p.crumple * 0.18, '#ffffff'), 0, 0, pw, ph);
    }
    d.globalCompositeOperation = 'source-over';
    for (const cp of cpaths) { // crease: soft shadow on one side, highlight on the other, thin dark core
      const fs = p.foldStrength;
      d.save(); d.translate(cp.nx * 2 * u, cp.ny * 2 * u); d.lineWidth = 7 * u * cp.w; d.strokeStyle = `rgba(0,0,0,${(0.07 * cp.w + 0.02) * fs})`; d.filter = `blur(${(2.5 * u).toFixed(2)}px)`; d.stroke(cp.q); d.restore();
      d.save(); d.translate(-cp.nx * 1.6 * u, -cp.ny * 1.6 * u); d.lineWidth = 3 * u * cp.w; d.strokeStyle = `rgba(255,255,255,${0.28 * cp.w * fs})`; d.filter = `blur(${(1.2 * u).toFixed(2)}px)`; d.stroke(cp.q); d.restore();
      d.lineWidth = Math.max(0.6, 0.8 * u); d.strokeStyle = U.rgba(darkAge, 0.28 * cp.w * fs); d.stroke(cp.q);
    }
    d.restore();
    if (p.edgeDark > 0) innerShadow(d, path, pw, ph, U.rgba(darkAge, 0.35 + p.edgeDark * 0.55), (18 + p.edgeDark * 90) * u);
    if (p.edge === 'burnt' && p.edgeAmt > 0) {
      innerShadow(d, path, pw, ph, U.rgba('#1d0f04', 0.6 + p.edgeAmt * 0.35), (8 + p.edgeAmt * 30) * u);
      innerShadow(d, path, pw, ph, U.rgba('#120804', 0.9), (2 + p.edgeAmt * 6) * u);
      d.save(); d.clip(path); d.strokeStyle = 'rgba(12,6,2,.9)'; d.lineWidth = (1.5 + p.edgeAmt * 3) * u; d.stroke(path); d.restore();
    }
    if (p.dogears > 0) { // folded corners: cut the corner off, lay the flap (paper back) over the page
      const r = U.rng(seed * 29 + 8), cs = [[0, 0, 1, 1], [pw, 0, -1, 1], [pw, ph, -1, -1], [0, ph, 1, -1]];
      for (let i = cs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cs[i], cs[j]] = [cs[j], cs[i]]; }
      const back = mixHex(mixHex(paper, age, 0.25 + p.aging * 0.2), '#000000', 0.04);
      for (let i = 0; i < Math.min(4, p.dogears | 0); i++) {
        const [cx, cy, sx, sy] = cs[i], s1 = (60 + r() * 90) * u * p.dogearSize, s2 = s1 * (0.7 + r() * 0.6);
        const A = [cx + sx * s1, cy], B = [cx, cy + sy * s2];
        d.globalCompositeOperation = 'destination-out';
        d.beginPath(); d.moveTo(cx - sx * 2, cy - sy * 2); d.lineTo(A[0] + sx, A[1] - sy * 2); d.lineTo(B[0] - sx * 2, B[1] + sy); d.closePath(); d.fill();
        const vx = B[0] - A[0], vy = B[1] - A[1], t = ((cx - A[0]) * vx + (cy - A[1]) * vy) / (vx * vx + vy * vy), fx = A[0] + vx * t, fy = A[1] + vy * t, C = [2 * fx - cx, 2 * fy - cy];
        d.globalCompositeOperation = 'source-over';
        d.save(); d.shadowColor = 'rgba(0,0,0,.28)'; d.shadowBlur = 10 * u; d.shadowOffsetX = sx * 3 * u; d.shadowOffsetY = sy * 3 * u;
        const g = d.createLinearGradient(fx, fy, C[0], C[1]); g.addColorStop(0, mixHex(back, '#000000', 0.08)); g.addColorStop(1, back);
        d.fillStyle = g; d.beginPath(); d.moveTo(A[0], A[1]); d.lineTo(C[0], C[1]); d.lineTo(B[0], B[1]); d.closePath(); d.fill(); d.restore();
        d.strokeStyle = 'rgba(0,0,0,.12)'; d.lineWidth = Math.max(0.6, 0.6 * u); d.beginPath(); d.moveTo(A[0], A[1]); d.lineTo(B[0], B[1]); d.stroke();
      }
    }
    d.globalCompositeOperation = 'source-over';
    if (p.grain > 0) { // per-pixel grain
      const id = d.getImageData(0, 0, pw, ph), D = id.data, amp = p.grain * 34;
      for (let i = 0, n = 0; i < D.length; i += 4, n++) {
        if (!D[i + 3]) continue;
        const g = (U.hash(n % pw, (n / pw) | 0, seed + 5) - 0.5) * amp;
        D[i] += g; D[i + 1] += g; D[i + 2] += g;
      }
      d.putImageData(id, 0, 0);
    }

    /* sheet onto the texture */
    if (isColor(p)) { ctx.fillStyle = p.bgColor; ctx.fillRect(0, 0, W, H); }
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.rotate((p.tilt * Math.PI) / 180);
    if (p.shadow > 0) { ctx.shadowColor = `rgba(0,0,0,${(0.55 * p.shadow).toFixed(3)})`; ctx.shadowBlur = (10 + p.shadow * 40) * u; ctx.shadowOffsetY = (2 + p.shadow * 10) * u; ctx.shadowOffsetX = p.shadow * 3 * u; }
    ctx.drawImage(doc, -pw / 2, -ph / 2);
    ctx.restore();
  }


  /* style controls shared by the three text layers; k = key prefix, d = defaults, on = layer visible */
  function layerParams(k, d, on) {
    const vis = (f) => (f ? (p) => on(p) && f(p) : on);
    const sty = (p) => p[k + 'Style'] !== 'written', wave = (p) => p[k + 'Style'] === 'wavy' || p[k + 'Style'] === 'scribble';
    return [
      { key: k + 'Style', label: 'Layer style', type: 'select', default: d.style || 'written', options: STYLE_OPTS, show: vis(), tip: 'Real words, or a stylized stand-in that keeps the word shapes and line lengths' },
      { key: k + 'Font', label: 'Font', type: 'select', default: d.font || 'typewriter', options: FONT_OPTS, show: vis(), tip: 'For stylized layers the font still sets the word widths' },
      { key: k + 'Size', label: 'Size', type: 'range', min: 3, max: 90, step: 0.5, default: d.size, show: vis(), tip: 'Point size, as if the short side were an A4 page (210 mm)' },
      { key: k + 'Color', label: 'Color', type: 'color', default: d.color || '#232120', show: vis() },
      { key: k + 'Bold', label: 'Bold', type: 'bool', default: !!d.bold, show: vis(), tip: 'Stylized layers get a heavier stroke' },
      { key: k + 'Italic', label: 'Italic', type: 'bool', default: !!d.italic, show: vis() },
      { key: k + 'Case', label: 'Letter case', type: 'select', default: d.kase || 'normal', options: [['normal', 'As written'], ['upper', 'UPPERCASE'], ['lower', 'lowercase']], show: vis() },
      { key: k + 'Align', label: 'Alignment', type: 'select', default: d.align || 'left', options: d.aligns || [['left', 'Left'], ['center', 'Centered'], ['right', 'Right']], show: vis() },
      { key: k + 'Weight', label: 'Stroke weight', type: 'range', min: 0.3, max: 2.5, step: 0.05, default: 1, show: vis(sty) },
      { key: k + 'WaveAmp', label: 'Wave height', type: 'range', min: 0.1, max: 1.6, step: 0.05, default: 0.7, show: vis(wave) },
      { key: k + 'WaveFreq', label: 'Wave frequency', type: 'range', min: 0.3, max: 2.5, step: 0.05, default: 1, show: vis(wave) },
    ];
  }
  const ALL = () => true;
  const BODY_ALIGNS = [['left', 'Left'], ['justify', 'Justified'], ['center', 'Centered'], ['right', 'Right']];

  const W_PRISTINE = { edge: 'clean', dogears: 0, edgeDark: 0, aging: 0, foxing: 0, stains: 0, creases: 0, crumple: 0, dirt: 0, inkFade: 0, inkBleed: 0.08, grain: 0.12 };
  // one font / style / color for every text layer (used by presets)
  const allLayers = (o) => { const r = {}; for (const k of ['t', 's', 'b']) for (const [n, v] of Object.entries(o)) r[k + n] = v; return r; };

  U.register({
    id: 'document',
    name: 'Document',
    desc: 'Pages with a title, subheadings and paragraphs, each typed, printed, handwritten or stylized (wavy / blocky), with pictures and pristine to worn, torn or burnt paper',
    uses: ['Paper props for game levels: letters, notes, reports, newspaper clippings, ledgers and diary pages on desks, walls and floors.', 'Document backgrounds and overlays for UI (journals, quest logs, menus), with ink only and mask output for decals.'],
    tags: ['Texturing', 'UI', 'Decals'],
    aspect: '1:1.414',
    bg: 'gray',
    icon: U.icon('<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4"/><path d="M9 9h4M9 12h7M9 15h7M9 18h5" opacity=".7"/>'),
    params: [
      { type: 'section', label: 'Sheet' },
      { key: 'output', label: 'Output', type: 'select', default: 'color', options: [['color', 'Sheet on background'], ['sheet', 'Sheet only (transparent)'], ['ink', 'Ink only (transparent)'], ['mask', 'Ink mask (white on black)']] },
      { key: 'paperColor', label: 'Paper color', type: 'color', default: '#efeae0', show: hasPaper },
      { key: 'bgColor', label: 'Background', type: 'color', default: '#3a3e45', show: isColor },
      { key: 'inset', label: 'Border around sheet', type: 'range', min: 0, max: 120, step: 0.5, default: 22, tip: 'px @ 512. 0 = the sheet fills the texture' },
      { key: 'tilt', label: 'Tilt', type: 'range', min: -10, max: 10, step: 0.1, default: 0, tip: 'Degrees' },
      { key: 'shadow', label: 'Drop shadow', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: hasPaper },
      { key: 'ruling', label: 'Ruling', type: 'select', default: 'none', options: [['none', 'None'], ['lined', 'Lined (notebook)'], ['grid', 'Grid']], show: hasPaper, tip: 'Lines follow the paragraph line spacing' },
      { key: 'lineColor', label: 'Ruling color', type: 'color', default: '#8fb0d4', show: (p) => hasPaper(p) && p.ruling !== 'none' },
      { key: 'marginColor', label: 'Margin line color', type: 'color', default: '#d0675e', show: (p) => hasPaper(p) && p.ruling === 'lined' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 4127 },

      { type: 'section', label: 'Layout' },
      { key: 'margin', label: 'Margins', type: 'range', min: 2, max: 25, step: 0.5, default: 11, tip: '% of the sheet short side' },
      { key: 'marginTop', label: 'Top margin', type: 'range', min: 0.2, max: 4, step: 0.05, default: 1, tip: 'Multiple of the side margin' },
      { key: 'columns', label: 'Columns', type: 'int', min: 1, max: 4, default: 1 },
      { key: 'colGap', label: 'Column gap', type: 'range', min: 1, max: 10, step: 0.1, default: 3.5, show: (p) => p.columns > 1, tip: '% of the sheet short side' },
      { key: 'wobble', label: 'Hand wobble', type: 'range', min: 0, max: 1, step: 0.01, default: 0.15, tip: 'Uneven baseline and slight rotation per word, on every layer' },

      { type: 'section', label: 'Title', active: titleOn },
      { key: 'tOn', label: 'Title', type: 'bool', default: true },
      { key: 'tText', label: 'Text', type: 'text', default: '', max: 120, placeholder: 'Random', show: titleOn },
      ...layerParams('t', { size: 22, bold: true, font: 'typewriter' }, titleOn),
      { key: 'tMaxLines', label: 'Max. lines', type: 'int', min: 1, max: 6, default: 3, show: titleOn },
      { key: 'tLeading', label: 'Line spacing', type: 'range', min: 0.8, max: 2, step: 0.05, default: 1.2, show: titleOn },
      { key: 'tRule', label: 'Line under title', type: 'bool', default: true, show: titleOn },
      { key: 'tRuleW', label: 'Line weight', type: 'range', min: 0.2, max: 4, step: 0.05, default: 1, show: (p) => titleOn(p) && p.tRule },
      { key: 'tSpace', label: 'Space after', type: 'range', min: 0, max: 6, step: 0.05, default: 0.6, show: titleOn, tip: 'In paragraph lines' },

      { type: 'section', label: 'Subheadings', active: subsOn },
      { key: 'sCount', label: 'Subheadings', type: 'int', min: 0, max: 12, default: 2, tip: 'Spread evenly between the paragraphs' },
      { key: 'sText', label: 'Texts', type: 'text', default: '', max: 400, placeholder: 'Background | Findings | Remarks', show: subsOn, tip: 'Empty = built-in names. "|" separates the subheadings; they repeat if there are more subheadings than texts' },
      { key: 'sNumber', label: 'Numbering', type: 'select', default: 'arabic', options: [['none', 'None'], ['arabic', '1. 2. 3.'], ['roman', 'I. II. III.'], ['letter', 'A. B. C.'], ['section', '§ 1 § 2']], show: subsOn },
      ...layerParams('s', { size: 14, bold: true, font: 'typewriter' }, subsOn),
      { key: 'sLeading', label: 'Line spacing', type: 'range', min: 0.8, max: 2.4, step: 0.05, default: 1.35, show: subsOn },
      { key: 'sSpace', label: 'Space before', type: 'range', min: 0, max: 4, step: 0.05, default: 0.4, show: subsOn, tip: 'In paragraph lines' },
      { key: 'sAfter', label: 'Space after', type: 'range', min: 0, max: 3, step: 0.05, default: 0.15, show: subsOn, tip: 'In paragraph lines' },

      { type: 'section', label: 'Paragraphs' },
      { key: 'bText', label: 'Own text', type: 'text', default: '', max: 4000, placeholder: 'Paragraph | # Heading | Paragraph', tip: 'Empty = built-in text. "|" starts a new paragraph; a part starting with # becomes a subheading (styled by the Subheadings tab)' },
      { key: 'fill', label: 'Fill the page', type: 'bool', default: true },
      { key: 'paragraphs', label: 'Paragraphs', type: 'int', min: 1, max: 40, default: 6, show: (p) => !p.fill },
      ...layerParams('b', { size: 11, align: 'justify', aligns: BODY_ALIGNS, font: 'typewriter' }, ALL),
      { key: 'bLeading', label: 'Line spacing', type: 'range', min: 1, max: 2.6, step: 0.05, default: 1.5 },
      { key: 'bIndent', label: 'Indent first lines', type: 'bool', default: true },
      { key: 'paraGap', label: 'Paragraph spacing', type: 'range', min: 0, max: 2.5, step: 0.05, default: 0.7, tip: 'In lines' },

      { type: 'section', label: 'Pictures', active: (p) => p.pics > 0 },
      { key: 'pics', label: 'Pictures', type: 'int', min: 0, max: 8, default: 1 },
      { key: 'picStyle', label: 'Style', type: 'select', default: 'halftone', options: [['halftone', 'Halftone print'], ['photo', 'Photograph'], ['engraving', 'Engraving'], ['chart', 'Bar chart'], ['placeholder', 'Empty frame']], show: (p) => p.pics > 0 },
      { key: 'picPlace', label: 'Placement', type: 'select', default: 'mixed', options: [['mixed', 'Mixed'], ['inline', 'Inline (full column)'], ['left', 'Float left'], ['right', 'Float right']], show: (p) => p.pics > 0, tip: 'Floating pictures have the paragraphs wrap around them' },
      { key: 'picSize', label: 'Size', type: 'range', min: 0.3, max: 1, step: 0.01, default: 0.75, show: (p) => p.pics > 0 },
      { key: 'picColor', label: 'Picture color', type: 'color', default: '#232120', show: (p) => p.pics > 0 },
      { key: 'captions', label: 'Captions', type: 'bool', default: true, show: (p) => p.pics > 0, tip: 'Set in the paragraph style, italic' },
      { key: 'frame', label: 'Frame line', type: 'bool', default: true, show: (p) => p.pics > 0 },

      { type: 'section', label: 'Edges' },
      { key: 'edge', label: 'Edge', type: 'select', default: 'rough', options: [['clean', 'Clean cut'], ['rough', 'Rough'], ['deckled', 'Deckled'], ['torn', 'Torn'], ['burnt', 'Burnt']] },
      { key: 'edgeAmt', label: 'Edge damage', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.edge !== 'clean' },
      { key: 'dogears', label: 'Folded corners', type: 'int', min: 0, max: 4, default: 1, show: hasPaper },
      { key: 'dogearSize', label: 'Corner fold size', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1, show: (p) => hasPaper(p) && p.dogears > 0 },
      { key: 'edgeDark', label: 'Edge grime', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: hasPaper },

      { type: 'section', label: 'Wear' },
      { key: 'aging', label: 'Yellowing', type: 'range', min: 0, max: 1, step: 0.01, default: 0.3, show: hasPaper },
      { key: 'ageColor', label: 'Age & stain color', type: 'color', default: '#8a6a3c', show: hasPaper },
      { key: 'foxing', label: 'Foxing spots', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, show: hasPaper, tip: 'Small reddish-brown age spots' },
      { key: 'stains', label: 'Stains', type: 'int', min: 0, max: 10, default: 1, show: hasPaper, tip: 'Coffee rings and blots' },
      { key: 'stainSize', label: 'Stain size', type: 'range', min: 0.3, max: 3, step: 0.05, default: 1, show: (p) => hasPaper(p) && p.stains > 0 },
      { key: 'creases', label: 'Fold lines', type: 'int', min: 0, max: 6, default: 2, tip: 'Letter folds in thirds, then halves and quarters' },
      { key: 'foldStrength', label: 'Fold strength', type: 'range', min: 0, max: 2, step: 0.01, default: 1, show: (p) => hasPaper(p) && p.creases > 0 },
      { key: 'crumple', label: 'Crumple', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
      { key: 'dirt', label: 'Dirt & specks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: hasPaper },
      { key: 'inkFade', label: 'Worn ink', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2, tip: 'Patchy fading, uneven strikes, broken type' },
      { key: 'inkBleed', label: 'Ink bleed', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, tip: 'Soft halo of the ink into the paper' },
      { key: 'grain', label: 'Paper grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: hasPaper },
    ],
    presets: [
      { name: 'Pristine memo', group: 'Condition', values: Object.assign({}, W_PRISTINE, { paperColor: '#f4f3ef', pics: 0, sCount: 1, shadow: 0.3 }, allLayers({ Color: '#1c1b1a' })) },
      { name: 'Office copy', group: 'Condition', values: { edge: 'clean', dogears: 0, edgeDark: 0.1, aging: 0.06, foxing: 0, stains: 0, creases: 2, crumple: 0, dirt: 0.12, inkFade: 0.1, inkBleed: 0.15, grain: 0.25, paperColor: '#f1f0ec' } },
      { name: 'Archive record', group: 'Condition', values: Object.assign({ edge: 'deckled', edgeAmt: 0.55, dogears: 1, edgeDark: 0.5, aging: 0.6, foxing: 0.6, stains: 2, creases: 3, crumple: 0.15, dirt: 0.35, inkFade: 0.32, inkBleed: 0.3, grain: 0.45, paperColor: '#e8dcc0', picColor: '#3b2a18', sNumber: 'roman' }, allLayers({ Font: 'serif', Color: '#3b2a18' })) },
      { name: 'Ruined', group: 'Condition', values: { edge: 'torn', edgeAmt: 0.8, dogears: 2, edgeDark: 0.65, aging: 0.75, foxing: 0.5, stains: 4, creases: 4, crumple: 0.7, dirt: 0.6, inkFade: 0.55, inkBleed: 0.5, grain: 0.55, tilt: -2.5 } },
      { name: 'Burnt letter', group: 'Condition', values: Object.assign({ edge: 'burnt', edgeAmt: 0.75, dogears: 0, edgeDark: 0.8, aging: 0.7, foxing: 0.3, stains: 1, creases: 2, crumple: 0.35, dirt: 0.5, inkFade: 0.4, inkBleed: 0.35, grain: 0.5, tOn: false, pics: 0, sCount: 0, bIndent: false, bAlign: 'left', bSize: 13, wobble: 0.45 }, allLayers({ Font: 'hand', Color: '#1f2a4a', Bold: false })) },
      { name: 'Handwritten notebook page', group: 'Style', values: Object.assign({ ruling: 'lined', bAlign: 'left', bIndent: false, wobble: 0.5, tRule: false, tSize: 17, sCount: 0, pics: 0, paperColor: '#f6f5f0', margin: 13, bLeading: 1.6 }, allLayers({ Font: 'hand', Color: '#1f3a8a', Bold: false })) },
      { name: 'Typed report, stylized body', group: 'Style', values: { bStyle: 'blocky', bColor: '#3a3836', bWeight: 0.8, sCount: 3, sCase: 'upper', tCase: 'upper', tAlign: 'center', pics: 1, picStyle: 'placeholder' } },
      { name: 'Greeked layout (blocky)', group: 'Style', values: Object.assign({}, W_PRISTINE, allLayers({ Style: 'blocky' }), { columns: 2, pics: 2, picStyle: 'placeholder', picColor: '#8a8f99', sCount: 3, bColor: '#8a8f99', sColor: '#4a4f59', tColor: '#4a4f59', paperColor: '#ffffff', bSize: 9 }) },
      { name: 'Wavy text page', group: 'Style', values: { bStyle: 'wavy', bWaveAmp: 0.6, bWaveFreq: 1.2, bWeight: 0.9, sStyle: 'bars', tStyle: 'bars', tWeight: 1.4, pics: 1, picStyle: 'engraving' } },
      { name: 'Cursive scribble letter', group: 'Style', values: Object.assign({ tOn: false, sCount: 0, pics: 0, bIndent: false, bAlign: 'left', bSize: 14, wobble: 0.4, paperColor: '#efe6d2', aging: 0.4, foxing: 0.3, creases: 2 }, allLayers({ Style: 'scribble', Font: 'hand', Color: '#2a2440', Bold: false })) },
      { name: 'Newspaper page', group: 'Style', values: Object.assign({ columns: 3, colGap: 2.5, bSize: 8, bLeading: 1.25, paraGap: 0.2, tSize: 40, tFont: 'stencil', tAlign: 'center', tBold: false, tMaxLines: 1, tRuleW: 2, sCount: 4, sNumber: 'none', sSize: 11, sAlign: 'center', pics: 3, picStyle: 'halftone', picPlace: 'inline', picSize: 1, paperColor: '#dcd8cb', aging: 0.35, foxing: 0, margin: 6, marginTop: 0.8, edge: 'clean', dogears: 0, creases: 1 }, { bFont: 'serif', sFont: 'serif', bColor: '#262626', sColor: '#111111', tColor: '#111111', picColor: '#262626' }) },
      { name: 'Carbon copy', group: 'Style', values: Object.assign({ paperColor: '#eeedf1', picColor: '#4a3a8a', inkBleed: 0.55, inkFade: 0.35, aging: 0.05, edge: 'clean', dogears: 0, stains: 0, foxing: 0, pics: 0 }, allLayers({ Color: '#4a3a8a' })) },
      { name: 'Ledger page', group: 'Style', values: Object.assign({ ruling: 'grid', lineColor: '#7fa88a', paperColor: '#e3ebd8', bAlign: 'left', bIndent: false, pics: 1, picStyle: 'chart', picColor: '#1e3123', sCount: 2, sNumber: 'letter', bColor: '#1e3123', sColor: '#7b2020', tColor: '#7b2020' }, { tFont: 'courier', sFont: 'courier', bFont: 'courier' }) },
      { name: 'Chalk on blackboard', group: 'Style', values: Object.assign({ paperColor: '#22262a', ageColor: '#0b0c0d', edge: 'clean', dogears: 0, aging: 0.1, foxing: 0, stains: 0, creases: 0, inkFade: 0.45, inkBleed: 0.4, bAlign: 'left', bIndent: false, pics: 0, wobble: 0.4, bColor: '#dcd8cc', sColor: '#f0e6c8', tColor: '#f0e6c8' }, allLayers({ Font: 'hand', Bold: false })) },
      { name: 'Full-bleed paper texture', group: 'Simple', values: { inset: 0, shadow: 0, edge: 'clean', dogears: 0, edgeDark: 0.25, tilt: 0 } },
      { name: 'Ink overlay (transparent)', group: 'Simple', values: { output: 'ink', inset: 0 } },
      { name: 'Ink mask', group: 'Simple', values: { output: 'mask', inset: 0 } },
    ],
    render,
  });
})();
