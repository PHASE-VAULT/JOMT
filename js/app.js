/* UGTG app shell: tabs, preview viewport, export, session persistence. */
(function () {
  'use strict';
  const U = window.UGTG;
  const $ = (s) => document.querySelector(s);
  const el = U.el;

  const ASPECTS = [['1:1', 1, 1], ['2:1', 2, 1], ['1:2', 1, 2], ['4:1', 4, 1], ['1:4', 1, 4], ['16:9', 16, 9], ['9:16', 9, 16]];
  const SIZES = [[16, '16'], [32, '32'], [64, '64'], [128, '128'], [256, '256'], [512, '512'], [1024, '1K'], [2048, '2K'], [4096, '4K'], [8192, '8K']];
  const FORMATS = { png: ['image/png', 'png', 'PNG'], jpeg: ['image/jpeg', 'jpg', 'JPG'], webp: ['image/webp', 'webp', 'WebP'] };
  const STORE = 'ugtg.session.v1';

  const S = { tabs: [], active: null, previewRes: 512, exportSize: 1024, format: 'png', hardPixels: true, tags: [] };
  const PIXEL_MAX = 128; // export sizes up to this offer "hard pixels" (pixel-art output)
  const HARD_FACTOR = 8; // supersampling used to pick crisp pixel colors
  let nextId = 1, refreshVis = null, lastBuf = null, lastInfo = {}, lastScale = 1, lastMs = 0, lastPreviewMs = 0;

  const cur = () => S.tabs.find((t) => t.id === S.active) || null;
  // tabs nobody renamed keep name = null and show the generator name in the current language
  const tabName = (t) => t.name || U.t(U.getGen(t.type).name) + (t.num > 1 ? ' ' + t.num : '');

  /* normal map mode: texturing generators can show / export a normal map derived from their output */
  // every Texturing generator unless it opts out with `normalMap: false`; others can opt in with `normalMap: true`
  const hasNormal = (gen) => !!gen && (gen.normalMap === true || (gen.normalMap !== false && (gen.tags || []).includes('Texturing')));
  const normalOn = (tab) => !!(tab && tab.normal && tab.normal.on && hasNormal(U.getGen(tab.type)));
  const newNormal = (gen, src) => ({ on: src ? !!src.on : false, params: Object.assign(U.normalDefaults(gen), src && src.params) });
  /* tilesheet mode: generators with an animate() hook render an N×N animation sheet */
  const hasSheet = (gen) => !!gen && typeof gen.animate === 'function';
  const sheetOn = (tab) => !!(tab && tab.sheet && tab.sheet.on && hasSheet(U.getGen(tab.type)));
  const newSheet = (src) => Object.assign(U.sheetDefaults(), src);

  /* aspect strings are "w:h"; besides the presets any custom ratio with sides 0.01–100 is allowed */
  const ASPECT_MAX = 100;
  function parseAspect(s) {
    const m = typeof s === 'string' && s.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
    if (!m) return null;
    const w = +m[1], h = +m[2];
    return w > 0 && h > 0 && w <= ASPECT_MAX && h <= ASPECT_MAX ? [w, h] : null;
  }
  const isPresetAspect = (s) => ASPECTS.some((a) => a[0] === s);

  // a generator with `fixedAspect` (e.g. '1:1') always renders at that ratio; the Aspect menu is locked for it
  const aspectOf = (tab) => U.getGen(tab.type).fixedAspect || tab.aspect;

  function dims(aspect, long) {
    const [w, h] = parseAspect(aspect) || [1, 1];
    return w >= h ? [long, Math.max(1, Math.round((long * h) / w))] : [Math.max(1, Math.round((long * w) / h)), long];
  }

  /* ---------- tabs ---------- */
  function createTab(type, src) {
    const gen = U.getGen(type);
    const n = S.tabs.filter((t) => t.type === type).length + 1;
    const tab = {
      id: nextId++,
      type,
      name: src ? U.t('{0} copy', tabName(src)) : null,
      num: n,
      params: src ? U.clone(src.params) : U.defaultsFor(gen.params),
      aspect: src ? src.aspect : gen.aspect || '1:1',
      view: src ? U.clone(src.view) : { zoom: 'fit', tile: false, bg: gen.bg || 'checker', sections: {} },
      dirty: src ? !!src.dirty : false, // changed since last export
      // name of the applied preset until a setting changes; a fresh tab starts on Default
      preset: src ? src.preset : gen.presets ? 'Default' : null,
      normal: newNormal(gen, src && src.normal),
      sheet: newSheet(src && U.clone(src.sheet)),
    };
    S.tabs.splice(src ? S.tabs.indexOf(src) + 1 : S.tabs.length, 0, tab);
    activate(tab.id);
  }

  function markDirty(tab) {
    if (!tab) return;
    record(tab);
    if (tab.dirty) return;
    tab.dirty = true;
    renderTabs();
  }

  /* ---------- undo / redo ----------
     Per-tab history of { params, aspect } snapshots, kept in memory only (not in the saved session).
     Changes that follow each other within BURST_MS (e.g. one slider drag) become a single step. */
  const HISTORY_MAX = 100, BURST_MS = 600;
  const history = new Map(); // tab id -> { undo: [], redo: [], last: string, burst: timer }
  const snap = (tab) => JSON.stringify({ params: tab.params, aspect: tab.aspect, normal: tab.normal && tab.normal.params, sheet: tab.sheet && { ...tab.sheet, on: undefined } });
  const hist = (tab) => {
    let h = history.get(tab.id);
    if (!h) { h = { undo: [], redo: [], last: snap(tab), burst: 0 }; history.set(tab.id, h); }
    return h;
  };

  function record(tab) {
    const h = hist(tab), now = snap(tab);
    if (now === h.last) return;
    if (!h.burst) {
      h.undo.push(h.last);
      if (h.undo.length > HISTORY_MAX) h.undo.shift();
      h.redo.length = 0;
    }
    clearTimeout(h.burst);
    h.burst = setTimeout(() => { h.burst = 0; }, BURST_MS);
    h.last = now;
    syncUndo();
  }

  function stepHistory(dir) {
    const tab = cur();
    if (!tab) return;
    const h = hist(tab), from = dir < 0 ? h.undo : h.redo, to = dir < 0 ? h.redo : h.undo;
    if (!from.length) return;
    clearTimeout(h.burst);
    h.burst = 0;
    to.push(snap(tab));
    const st = JSON.parse(from.pop());
    tab.preset = null;
    tab.params = st.params;
    tab.aspect = st.aspect;
    if (st.normal && tab.normal) tab.normal.params = st.normal;
    if (st.sheet && tab.sheet) tab.sheet = Object.assign(st.sheet, { on: tab.sheet.on }); // undo never flips the mode
    h.last = snap(tab);
    tab.dirty = true;
    renderTabs();
    syncChrome();
    buildPanel();
    renderPreview(1);
    save();
  }

  function syncUndo() {
    const tab = cur(), h = tab && hist(tab);
    $('#undoBtn').disabled = !h || !h.undo.length;
    $('#redoBtn').disabled = !h || !h.redo.length;
  }

  function closeTab(id, force) {
    const i = S.tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    if (!force && S.tabs[i].dirty) { confirmClose(S.tabs[i]); return; }
    S.tabs.splice(i, 1);
    history.delete(id);
    if (S.active === id) S.active = S.tabs.length ? S.tabs[Math.min(i, S.tabs.length - 1)].id : null;
    refreshAll();
  }

  function activate(id) {
    S.active = id;
    refreshAll();
  }

  function confirmClose(tab) {
    $('#closeText').textContent = U.t('"{0}" has changes that haven\'t been exported yet.', tabName(tab));
    $('#closeDialog').hidden = false;
    $('#closeExport').focus();
    const done = () => { $('#closeDialog').hidden = true; };
    $('#closeCancel').onclick = done;
    $('#closeDiscard').onclick = () => { done(); closeTab(tab.id, true); };
    $('#closeExport').onclick = async () => {
      done();
      if (S.active !== tab.id) activate(tab.id);
      if (await doExport(false)) closeTab(tab.id, true);
    };
  }

  function refreshAll() {
    renderTabs();
    syncChrome();
    if (cur()) {
      buildPanel();
      renderPreview(1);
    }
    syncPlayer();
    if (!cur()) requestAnimationFrame(() => fitTitles($('#welcomeGrid'))); // landing page just became visible
    save();
  }

  function renderTabs() {
    const bar = $('#tabs');
    bar.innerHTML = '';
    for (const t of S.tabs) {
      const gen = U.getGen(t.type);
      const b = el('div', 'tab' + (t.id === S.active ? ' active' : ''));
      b.title = U.t('{0} — double-click name to rename', U.t(gen.name));
      const ic = el('span', 'tab-icon');
      ic.innerHTML = gen.icon;
      const name = el('span', 'tab-name', tabName(t));
      if (t.dirty) b.classList.add('dirty');
      const x = el('button', 'tab-close', '×');
      x.type = 'button';
      x.title = U.t('Close tab');
      x.onclick = (e) => { e.stopPropagation(); closeTab(t.id); };
      b.onclick = () => { if (S.active !== t.id) activate(t.id); };
      b.onauxclick = (e) => { if (e.button === 1) closeTab(t.id); };
      name.ondblclick = (e) => { e.stopPropagation(); rename(t, name); };
      b.append(ic, name, x);
      bar.append(b);
      if (t.id === S.active) requestAnimationFrame(() => b.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    }
  }

  function rename(t, nameEl) {
    const inp = el('input', 'tab-rename');
    inp.value = tabName(t);
    nameEl.replaceWith(inp);
    inp.focus();
    inp.select();
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      if (ok && inp.value.trim() && inp.value.trim() !== tabName(t)) t.name = inp.value.trim().slice(0, 60);
      renderTabs();
      save();
    };
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
      e.stopPropagation();
    };
    inp.onblur = () => finish(true);
    inp.onclick = (e) => e.stopPropagation();
  }

  /* ---------- panel ---------- */
  let panelKey = '';
  function buildPanel() {
    const tab = cur(), gen = U.getGen(tab.type), nm = normalOn(tab), sm = sheetOn(tab);
    if (!tab.normal) tab.normal = newNormal(gen);
    if (!tab.sheet) tab.sheet = newSheet();
    $('#genName').textContent = U.t(gen.name) + (nm ? ' · ' + U.t('Normal map') : sm ? ' · ' + U.t('Tilesheet') : '');
    $('#genDesc').textContent = nm
      ? U.t(gen.normalDesc || 'Normal map derived from the texture: its brightness (or a channel) is used as height')
      : sm ? sheetDesc(tab)
      : U.t(gen.desc) + (gen.tileable ? ' · ' + U.t('tileable') : '');
    syncModeBar(tab, gen);
    const root = $('#controls');
    const scroll = root.scrollTop;
    root.innerHTML = '';
    tab.view.sections = tab.view.sections || {};
    if (nm) {
      // normal mode swaps the texture's settings for the normal map's own
      refreshVis = U.ui.build(root, U.NORMAL_PARAMS, tab.normal.params, { change: onNormalChange, collapsed: (tab.view.normalSections = tab.view.normalSections || {}), persist: save });
    } else if (sm) {
      // tilesheet mode adds a Tilesheet tab in front of the generator's own settings; the sh_* keys
      // are routed to tab.sheet so presets / reset of the generator leave them alone
      let lastKey = '';
      const vals = new Proxy(tab.params, {
        // sh__loop tells the Tilesheet settings that this generator loops (no build-up / fade settings)
        get: (t, k) => (k === 'sh__loop' ? !!gen.animLoop : typeof k === 'string' && k.startsWith('sh_') ? tab.sheet[k.slice(3)] : t[k]),
        set: (t, k, v) => { lastKey = String(k); if (lastKey.startsWith('sh_')) tab.sheet[lastKey.slice(3)] = v; else t[k] = v; return true; },
      });
      refreshVis = U.ui.build(root, U.SHEET_PARAMS.concat(gen.params), vals, {
        change: (rebuild) => (lastKey.startsWith('sh_') ? onSheetChange(rebuild, lastKey) : onParamChange(rebuild)),
        collapsed: tab.view.sections,
        persist: save,
      });
    } else {
      refreshVis = U.ui.build(root, gen.params, tab.params, { change: onParamChange, collapsed: tab.view.sections, persist: save });
    }
    const mk = tab.id + ':' + nm + ':' + sm; // switching tab or mode starts the panel at the top
    root.scrollTop = panelKey === mk ? scroll : 0;
    panelKey = mk;
    syncUndo();
    $('#randBtn').hidden = !gen.params.some((d) => d.type === 'seed' || (d.type === 'list' && d.item.some((i) => i.type === 'seed')));
    syncPresets();
    if (nm) $('#presetBar').hidden = true;
  }

  const sheetDesc = (tab) => U.getGen(tab.type).animLoop
    ? U.t('Seamless looping animation, {0} × {0} frames, left to right, top to bottom', tab.sheet.grid)
    : U.t('Animation of the effect forming and fading, {0} × {0} frames, left to right, top to bottom', tab.sheet.grid);

  /* the mode switch above the presets: Texture | Normal map, or Single frame | Tilesheet */
  /* the mode switch above the presets: the plain view plus every alternate mode the generator has
     (Normal map, Tilesheet). A generator can have both, e.g. insects: Texture | Normal map | Tilesheet. */
  function modesFor(gen) {
    const alt = [];
    if (hasNormal(gen)) alt.push(['normal', 'Normal map']);
    if (hasSheet(gen)) alt.push(['sheet', 'Tilesheet']);
    if (!alt.length) return null;
    return [['plain', hasNormal(gen) ? 'Texture' : 'Single frame']].concat(alt);
  }
  const modeOf = (tab) => (normalOn(tab) ? 'normal' : sheetOn(tab) ? 'sheet' : 'plain');

  function syncModeBar(tab, gen) {
    const modes = modesFor(gen), seg = $('#modeSeg');
    $('#modeBar').hidden = !modes;
    if (!modes) return;
    const curMode = modeOf(tab);
    seg.innerHTML = '';
    for (const [id, label] of modes) {
      const b = el('button', id === curMode ? 'on' : null, U.t(label));
      b.type = 'button';
      b.onclick = () => setMode(id);
      seg.append(b);
    }
    seg.title = modes.length === 2
      ? U.t('Switch between {0} and {1} (M)', U.t(modes[0][1]), U.t(modes[1][1]))
      : U.t('Switch the view mode (M cycles through them)');
  }

  // modes are exclusive: plain view, normal map or tilesheet
  function setMode(mode) {
    const tab = cur(), gen = tab && U.getGen(tab.type), modes = gen && modesFor(gen);
    if (!modes || !modes.some(([id]) => id === mode) || modeOf(tab) === mode) return;
    tab.normal.on = mode === 'normal';
    tab.sheet.on = mode === 'sheet';
    if (mode === 'sheet') tab.view.sections.__tab = 'Tilesheet';
    buildPanel();
    renderPreview(1);
    save();
  }
  // M: cycle through the modes
  function cycleMode() {
    const tab = cur(), modes = tab && modesFor(U.getGen(tab.type));
    if (!modes) return;
    const i = modes.findIndex(([id]) => id === modeOf(tab));
    setMode(modes[(i + 1) % modes.length][0]);
  }

  function onSheetChange(rebuild, key) {
    if (rebuild) buildPanel();
    else if (refreshVis) refreshVis();
    if (key === 'sh_grid') $('#genDesc').textContent = sheetDesc(cur());
    // playback settings only affect the preview player
    if (key === 'sh_play' || key === 'sh_fps' || key === 'sh_loop') syncPlayer();
    else { markDirty(cur()); scheduleRender(true); }
    save();
  }

  function onNormalChange(rebuild) {
    markDirty(cur());
    if (rebuild) buildPanel();
    else if (refreshVis) refreshVis();
    scheduleRender(true);
    save();
  }

  /* ---------- presets ----------
     gen.presets: [{ name, group, values, aspect? }], shown grouped in the panel's preset menu.
     The tab remembers the applied preset's name until any setting changes. */
  let presetGen = null, presetLang = '';
  function syncPresets() {
    const tab = cur(), gen = U.getGen(tab.type), list = gen.presets || [];
    $('#presetBar').hidden = !list.length;
    const sel = $('#presetSel');
    if (presetGen !== gen || presetLang !== U.lang()) {
      presetGen = gen;
      presetLang = U.lang();
      sel.innerHTML = '';
      // only shown while the settings don't match a preset; never pickable
      const none = el('option', null, U.t('Custom settings'));
      none.value = '';
      none.disabled = true;
      sel.append(none);
      const groups = new Map();
      list.forEach((p, i) => {
        const g = p.group || 'Presets';
        if (!groups.has(g)) { groups.set(g, el('optgroup')); groups.get(g).label = U.t(g); sel.append(groups.get(g)); }
        const o = el('option', null, U.t(p.name));
        o.value = i;
        groups.get(g).append(o);
      });
    }
    const i = list.findIndex((p) => p.name === tab.preset);
    sel.options[0].hidden = i >= 0;
    sel.value = i < 0 ? '' : String(i);
  }

  function applyPreset(i) {
    const tab = cur(), gen = tab && U.getGen(tab.type), list = (gen && gen.presets) || [];
    if (!list.length) return;
    const pr = list[U.mod(i, list.length)];
    tab.params = U.presetValues(gen, pr);
    if (pr.aspect) tab.aspect = pr.aspect;
    tab.preset = pr.name;
    markDirty(tab);
    syncChrome();
    buildPanel();
    renderPreview(1);
    save();
  }

  function stepPreset(dir) {
    const tab = cur(), list = (tab && U.getGen(tab.type).presets) || [];
    const i = list.findIndex((p) => p.name === tab.preset);
    // from custom settings, › goes to the first real preset (after Default)
    applyPreset(i < 0 ? (dir > 0 ? 1 : -1) : i + dir);
  }

  function onParamChange(rebuild) {
    cur().preset = null;
    syncPresets();
    markDirty(cur());
    if (rebuild) buildPanel();
    else if (refreshVis) refreshVis();
    scheduleRender(true);
    save();
  }

  /* ---------- rendering ---------- */
  function renderTab(tab, W, H, preview) {
    const gen = U.getGen(tab.type);
    if (sheetOn(tab)) return U.renderSheet(gen, tab.params, tab.sheet, W, H, { preview });
    const c = U.canvas(W, H);
    const info = gen.render(c.getContext('2d'), W, H, tab.params, { preview }) || {};
    if (normalOn(tab)) {
      // generators with `heightMap: true` render their own height map (e.g. impact decals without the smoke stain);
      // all others use the texture itself as height
      let src = c;
      if (gen.heightMap) { src = U.canvas(W, H); gen.render(src.getContext('2d'), W, H, tab.params, { preview, height: true }); }
      return { canvas: U.normalMap(src, tab.normal.params), info: Object.assign({}, info, { normal: true }) };
    }
    return { canvas: c, info };
  }

  // (a normal map is never reduced to hard pixel-art colors)
  const pixelExport = () => S.hardPixels && S.exportSize <= PIXEL_MAX && !normalOn(cur());
  // long side of the preview; "export" previews the real export size (capped for big sizes)
  const previewLong = () => (S.previewRes === 'export' ? Math.min(S.exportSize, 1024) : S.previewRes);

  /* render at the requested size; for small pixel-art exports, supersample and resolve each output
     pixel to one real color with hard alpha (no anti-aliased edges) */
  function renderOutput(tab, W, H, preview) {
    if (!pixelExport() || W > PIXEL_MAX || H > PIXEL_MAX) return renderTab(tab, W, H, preview);
    const f = HARD_FACTOR, big = renderTab(tab, W * f, H * f, preview);
    const sd = big.canvas.getContext('2d').getImageData(0, 0, W * f, H * f).data, BW = W * f;
    const out = U.canvas(W, H), oc = out.getContext('2d'), img = oc.createImageData(W, H), d = img.data;
    const votes = new Map();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let sum = 0, top = 0, pick = -1;
        votes.clear();
        for (let j = 0; j < f; j++) {
          for (let i = 0; i < f; i++) {
            const k = ((y * f + j) * BW + x * f + i) * 4, a = sd[k + 3];
            sum += a;
            if (a < 128) continue;
            // the most frequent exact color wins: solid regions repeat their color many times,
            // anti-aliased in-between shades are one-offs, so they never survive
            const key = (sd[k] << 16) | (sd[k + 1] << 8) | sd[k + 2];
            const n = (votes.get(key) || 0) + 1;
            votes.set(key, n);
            if (n > top) { top = n; pick = k; }
          }
        }
        if (sum / (f * f) < 128 || pick < 0) continue; // pixel is "off" unless the shape covers at least half of it
        const o = (y * W + x) * 4;
        d[o] = sd[pick]; d[o + 1] = sd[pick + 1]; d[o + 2] = sd[pick + 2]; d[o + 3] = 255;
      }
    }
    oc.putImageData(img, 0, 0);
    return { canvas: out, info: big.info };
  }

  function renderPreview(scale) {
    const tab = cur();
    if (!tab) return;
    const atExport = S.previewRes === 'export';
    const [W, H] = dims(aspectOf(tab), atExport ? previewLong() : Math.max(64, Math.round(S.previewRes * scale)));
    const t0 = performance.now();
    let res;
    try {
      res = atExport ? renderOutput(tab, W, H, true) : renderTab(tab, W, H, true);
    } catch (e) {
      console.error(e);
      toast(U.t('Render error: {0}', e.message));
      return;
    }
    const ms = performance.now() - t0;
    if (scale === 1) lastMs = ms;
    lastPreviewMs = ms;
    lastBuf = res.canvas;
    lastInfo = res.info;
    lastScale = scale;
    drawView();
    status();
    if (sheetOn(tab) !== !!player.timer) syncPlayer();
    else if (player.timer) drawPlayer();
  }

  // While dragging a slider on a slow generator, render a half-res draft, then refine when idle.
  let raf = 0, idle = 0;
  function scheduleRender(interactive) {
    if (!raf) {
      raf = requestAnimationFrame(() => {
        raf = 0;
        renderPreview(interactive && lastMs > 45 ? 0.5 : 1);
      });
    }
    clearTimeout(idle);
    idle = setTimeout(() => { if (lastScale < 1) renderPreview(1); }, 220);
  }

  function drawView() {
    const tab = cur();
    if (!tab || !lastBuf) return;
    const v = $('#view'), n = tab.view.tile ? 3 : 1, W = lastBuf.width, H = lastBuf.height;
    v.width = W * n;
    v.height = H * n;
    const g = v.getContext('2d');
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.drawImage(lastBuf, i * W, j * H);
    layoutView();
  }

  /* tilesheet preview player: plays the frames of the current preview sheet in a corner box */
  const player = { timer: 0, k: 0, gap: 0 };
  function syncPlayer() {
    const tab = cur(), on = sheetOn(tab) && tab.sheet.play;
    clearInterval(player.timer);
    player.timer = 0;
    $('#animBox').hidden = !on;
    if (!on) return;
    player.timer = setInterval(stepPlayer, 1000 / U.clamp(tab.sheet.fps, 1, 60));
    drawPlayer();
  }
  function stepPlayer() {
    const tab = cur();
    if (!sheetOn(tab) || !lastInfo.sheet) return;
    const N = lastInfo.sheet.n ** 2;
    if (player.gap > 0) { player.gap--; if (!player.gap) player.k = 0; }
    else if (player.k + 1 >= N) { player.gap = U.getGen(tab.type).animLoop ? 0 : Math.round(tab.sheet.loop * tab.sheet.fps); if (!player.gap) player.k = 0; }
    else player.k++;
    drawPlayer();
  }
  function drawPlayer() {
    const sh = lastInfo.sheet, c = $('#animView');
    if (!sh || !lastBuf) return;
    const N = sh.n * sh.n, k = Math.min(player.k, N - 1);
    if (c.width !== sh.fw || c.height !== sh.fh) { c.width = sh.fw; c.height = sh.fh; }
    const g = c.getContext('2d');
    g.clearRect(0, 0, sh.fw, sh.fh);
    if (!player.gap) g.drawImage(lastBuf, (k % sh.n) * sh.fw, Math.floor(k / sh.n) * sh.fh, sh.fw, sh.fh, 0, 0, sh.fw, sh.fh);
    $('#animLabel').textContent = player.gap ? U.t('pause · {0} fps', cur().sheet.fps) : U.t('Frame {0} / {1} · {2} fps', k + 1, N, cur().sheet.fps);
  }

  function viewScale(tab) {
    const [W, H] = dims(aspectOf(tab), previewLong()), n = tab.view.tile ? 3 : 1;
    if (tab.view.zoom === 'fit') {
      const vp = $('#viewport');
      return Math.max(0.05, Math.min((vp.clientWidth - 48) / (W * n), (vp.clientHeight - 48) / (H * n)));
    }
    return tab.view.zoom;
  }

  function layoutView() {
    const tab = cur();
    if (!tab) return;
    const [W, H] = dims(aspectOf(tab), previewLong()), n = tab.view.tile ? 3 : 1, s = viewScale(tab);
    const v = $('#view');
    v.style.width = W * n * s + 'px';
    v.style.height = H * n * s + 'px';
    v.classList.toggle('pixelated', (W * n * s) / v.width >= 2);
    $('#zoomLabel').textContent = Math.round(s * 100) + '%';
    $('#zoomFit').classList.toggle('on', tab.view.zoom === 'fit');
  }

  function setZoom(z) {
    const tab = cur();
    if (!tab) return;
    tab.view.zoom = z === 'fit' ? 'fit' : U.clamp(z, 0.05, 32);
    layoutView();
    save();
  }

  function status() {
    const tab = cur();
    if (!tab || !lastBuf) return;
    const [eW, eH] = dims(aspectOf(tab), S.exportSize);
    const parts = [U.t('Preview {0}', `${lastBuf.width}×${lastBuf.height}`), `${lastPreviewMs.toFixed(0)} ms`, U.t('Export {0}', `${eW}×${eH}`)];
    if (lastInfo.sheet) {
      const n = lastInfo.sheet.n;
      parts.push(U.t('{0} × {0} sheet · {1} frames of {2} @ export', n, n * n, `${Math.floor(eW / n)}×${Math.floor(eH / n)}`));
    }
    if (lastInfo.hotspot) parts.push(U.t('Hotspot @ export: {0}', `${Math.floor(lastInfo.hotspot[0] * eW)}, ${Math.floor(lastInfo.hotspot[1] * eH)}`));
    if (pixelExport()) parts.push(U.t('hard pixels'));
    if (lastInfo.normal) parts.push(U.t('normal map ({0})', tab.normal.params.yDir === 'dx' ? 'DirectX' : 'OpenGL'));
    if (lastInfo.text) parts.push(lastInfo.text.replace(/\b(bricks|cells|paths)\b/g, (w) => U.t(w)));
    $('#statusInfo').textContent = parts.join('  ·  ');
    $('#exportDims').textContent = `${eW} × ${eH} px`;
  }

  /* ---------- chrome / toolbar ---------- */
  function syncChrome() {
    const tab = cur();
    document.body.classList.toggle('empty', !tab);
    if (!tab) return;
    // custom ratio: the select shows "Custom…" and the w:h inputs appear next to it
    const fixed = U.getGen(tab.type).fixedAspect;
    $('#aspect').disabled = !!fixed;
    $('#aspect').title = fixed ? U.t('This generator always uses {0}', fixed) : '';
    const custom = !fixed && (!!tab.view.customAspect || !isPresetAspect(tab.aspect));
    $('#aspect').value = fixed ? fixed : custom ? 'custom' : tab.aspect;
    $('#aspCustom').hidden = !custom;
    if (custom) {
      const [w, h] = parseAspect(tab.aspect) || [1, 1];
      if (document.activeElement !== $('#aspW')) $('#aspW').value = w;
      if (document.activeElement !== $('#aspH')) $('#aspH').value = h;
    }
    $('#previewRes').value = String(S.previewRes);
    $('#tileBtn').classList.toggle('on', !!tab.view.tile);
    const vp = $('#viewport');
    vp.className = 'viewport bg-' + tab.view.bg;
    $('#animBox').className = 'anim-box bg-' + tab.view.bg; // tilesheet player uses the same background
    for (const b of document.querySelectorAll('#bgSeg button')) b.classList.toggle('on', b.dataset.bg === tab.view.bg);
    for (const b of document.querySelectorAll('#sizeSeg button')) b.classList.toggle('on', +b.dataset.size === S.exportSize);
    $('#hardRow').hidden = S.exportSize > PIXEL_MAX;
    $('#hardPixels').checked = S.hardPixels;
    $('#format').value = S.format;
    $('#exportBtn').textContent = U.t('Download {0}', FORMATS[S.format][2]);
  }

  function buildChrome() {
    const asp = $('#aspect');
    for (const [k] of ASPECTS) { const o = el('option', null, k); o.value = k; asp.append(o); }
    const co = el('option', null, U.t('Custom…'));
    co.value = 'custom';
    co.dataset.i18n = 'Custom…';
    asp.append(co);
    asp.onchange = () => {
      const t = cur();
      if (asp.value === 'custom') {
        // start from the current ratio; the inputs take over from here
        t.view.customAspect = true;
        syncChrome();
        $('#aspW').focus();
        $('#aspW').select();
        save();
        return;
      }
      t.view.customAspect = false;
      t.aspect = asp.value;
      markDirty(t);
      syncChrome();
      renderPreview(1);
      save();
    };
    const setCustom = () => {
      const t = cur(), w = +$('#aspW').value, h = +$('#aspH').value;
      const a = parseAspect(`${+w.toFixed(2)}:${+h.toFixed(2)}`);
      if (!t || !a) return; // incomplete / out of range while typing: keep the last valid ratio
      const s = `${a[0]}:${a[1]}`;
      if (s === t.aspect) return;
      t.aspect = s;
      markDirty(t);
      scheduleRender(true);
      save();
    };
    for (const id of ['#aspW', '#aspH']) {
      const inp = $(id);
      inp.oninput = setCustom;
      inp.onchange = () => { setCustom(); syncChrome(); }; // on blur, show the clamped / accepted value
      inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); };
    }
    $('#aspSwap').onclick = () => {
      const t = cur(), a = t && parseAspect(t.aspect);
      if (!a) return;
      t.aspect = `${a[1]}:${a[0]}`;
      markDirty(t);
      syncChrome();
      renderPreview(1);
      save();
    };

    $('#previewRes').onchange = (e) => {
      S.previewRes = e.target.value === 'export' ? 'export' : +e.target.value;
      renderPreview(1);
      save();
    };
    $('#hardPixels').onchange = (e) => {
      S.hardPixels = e.target.checked;
      if (S.previewRes === 'export') renderPreview(1);
      save();
    };

    const seg = $('#sizeSeg');
    for (const [v, l] of SIZES) {
      const b = el('button', null, l);
      b.type = 'button';
      b.dataset.size = v;
      if (v === 8192) b.title = '8K can take a while and needs a lot of memory';
      b.onclick = () => {
        S.exportSize = v;
        syncChrome();
        if (S.previewRes === 'export') renderPreview(1);
        status();
        save();
      };
      seg.append(b);
    }
    $('#format').onchange = (e) => { S.format = e.target.value; syncChrome(); save(); };

    for (const b of document.querySelectorAll('#bgSeg button')) {
      b.onclick = () => { const t = cur(); t.view.bg = b.dataset.bg; syncChrome(); save(); };
    }
    $('#tileBtn').onclick = toggleTile;
    $('#zoomIn').onclick = () => setZoom(viewScale(cur()) * 1.25);
    $('#zoomOut').onclick = () => setZoom(viewScale(cur()) / 1.25);
    $('#zoomFit').onclick = () => setZoom('fit');
    $('#zoom100').onclick = () => setZoom(1);

    $('#exportBtn').onclick = () => doExport(false);
    $('#copyBtn').onclick = () => doExport(true);
    $('#randBtn').onclick = randomize;
    $('#undoBtn').onclick = () => stepHistory(-1);
    $('#redoBtn').onclick = () => stepHistory(1);
    $('#dupBtn').onclick = () => cur() && createTab(cur().type, cur());
    $('#presetSel').onchange = (e) => { if (e.target.value !== '') applyPreset(+e.target.value); };
    $('#presetPrev').onclick = () => stepPreset(-1);
    $('#presetNext').onclick = () => stepPreset(1);
    $('#resetBtn').onclick = () => {
      const t = cur();
      if (normalOn(t)) {
        if (!confirm(U.t('Reset the normal map settings to defaults?'))) return;
        t.normal.params = U.normalDefaults(U.getGen(t.type));
        markDirty(t);
        buildPanel();
        renderPreview(1);
        save();
        return;
      }
      if (!t || !confirm(U.t('Reset all settings of this tab to defaults?'))) return;
      t.params = U.defaultsFor(U.getGen(t.type).params);
      t.preset = U.getGen(t.type).presets ? 'Default' : null;
      markDirty(t);
      buildPanel();
      renderPreview(1);
      save();
    };

    $('#addTab').onclick = openPicker;
    $('#picker').onclick = (e) => { if (e.target.id === 'picker') closePicker(); };
    $('#pickerClose').onclick = closePicker;

    const vp = $('#viewport');
    vp.addEventListener('wheel', (e) => {
      if (!cur()) return;
      e.preventDefault();
      setZoom(viewScale(cur()) * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    }, { passive: false });
    // drag to pan when zoomed in
    let drag = null;
    vp.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !cur() || e.target.closest('.welcome')) return;
      drag = { x: e.clientX, y: e.clientY, l: vp.scrollLeft, t: vp.scrollTop };
      vp.setPointerCapture(e.pointerId);
      vp.classList.add('grabbing');
    });
    vp.addEventListener('pointermove', (e) => {
      if (!drag) return;
      vp.scrollLeft = drag.l - (e.clientX - drag.x);
      vp.scrollTop = drag.t - (e.clientY - drag.y);
    });
    const end = () => { drag = null; vp.classList.remove('grabbing'); };
    vp.addEventListener('pointerup', end);
    vp.addEventListener('pointercancel', end);

    window.addEventListener('resize', () => { layoutView(); fitAllTitles(); });
    if (document.fonts) document.fonts.ready.then(fitAllTitles); // widths change once web fonts load
    document.addEventListener('keydown', onKey);
  }

  function toggleTile() {
    const t = cur();
    if (!t) return;
    t.view.tile = !t.view.tile;
    syncChrome();
    drawView();
    save();
  }

  function randomize() {
    const t = cur();
    if (!t) return;
    const roll = () => (Math.random() * 99999) | 0;
    for (const d of U.getGen(t.type).params) {
      if (d.type === 'seed') t.params[d.key] = roll();
      // seeds inside list items too (particle layers etc.)
      if (d.type === 'list') for (const it of t.params[d.key]) for (const sd of d.item) if (sd.type === 'seed') it[sd.key] = roll();
    }
    markDirty(t);
    buildPanel();
    renderPreview(1);
    save();
  }

  function onKey(e) {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (cur()) doExport(false);
      return;
    }
    // undo / redo, except inside text-like fields where the browser's own field undo applies
    const textField = e.target.tagName === 'TEXTAREA' || (e.target.tagName === 'INPUT' && /^(text|number|search)$/.test(e.target.type));
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !textField) {
      const k = e.key.toLowerCase();
      if (k === 'z' || k === 'y') {
        e.preventDefault();
        stepHistory(k === 'y' || e.shiftKey ? 1 : -1);
        return;
      }
    }
    if (e.key === 'Escape' && !$('#closeDialog').hidden) { $('#closeDialog').hidden = true; return; }
    if (e.key === 'Escape' && !$('#picker').hidden) { closePicker(); return; }
    if (!$('#closeDialog').hidden) return;
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key.toLowerCase()) {
      case 'n': openPicker(); break;
      case 't': toggleTile(); break;
      case 'r': randomize(); break;
      case 'm': cycleMode(); break;
      case 'f': setZoom('fit'); break;
      case '1': setZoom(1); break;
    }
  }

  /* ---------- picker / welcome ---------- */
  function genGrid(container, onPick) {
    container.innerHTML = '';
    for (const gen of U.generators) {
      const card = el('button', 'gen-card');
      card.type = 'button';
      const thumb = el('div', 'gen-thumb bg-' + (gen.bg || 'checker'));
      try {
        const [W, H] = dims(gen.aspect || '1:1', 128);
        const { canvas } = renderTab({ type: gen.id, params: U.defaultsFor(gen.params) }, W, H, true);
        thumb.append(canvas);
      } catch (e) { console.error(e); }
      const meta = el('div', 'gen-meta');
      const name = el('div', 'gen-name');
      const ic = el('span', 'gen-icon');
      ic.innerHTML = gen.icon;
      const title = el('span', 'gen-title', U.t(gen.name));
      title.title = U.t(gen.name);
      name.append(ic, title);
      // footer at the bottom of the card: tags left, TILEABLE chip right (keeps the title row free)
      const foot = el('div', 'gen-foot');
      foot.append(el('span', 'gen-tags', (gen.tags || []).map((t) => U.t(t)).join(' · ')));
      if (gen.tileable) foot.append(el('span', 'chip', U.t('Tileable')));
      meta.append(name, el('div', 'gen-desc', U.t(gen.desc)), foot);
      card.append(thumb, meta);
      card.dataset.tags = (gen.tags || []).join('|');
      card.onclick = () => onPick(gen.id);
      container.append(card);
    }
    filterGrid(container, false);
    requestAnimationFrame(() => fitTitles(container));
  }

  /* Card titles stay on one line so all cards line up. A title that doesn't fit (long translations)
     is scaled down to fit, but never below TITLE_MIN px; past that it ends in "…" (full name in the tooltip).
     Hidden cards / grids have no width yet and are fitted when they become visible. */
  const TITLE_MIN = 11;
  function fitTitles(grid) {
    if (!grid || !grid.offsetParent) return;
    for (const t of grid.querySelectorAll('.gen-card:not([hidden]) .gen-title')) {
      t.style.fontSize = '';
      if (!t.clientWidth || t.scrollWidth <= t.clientWidth + 0.5) continue;
      const base = parseFloat(getComputedStyle(t).fontSize);
      t.style.fontSize = Math.max(TITLE_MIN, Math.floor(base * (t.clientWidth / t.scrollWidth) * 4) / 4) + 'px';
    }
  }
  const fitAllTitles = () => { fitTitles($('#welcomeGrid')); fitTitles($('#pickerGrid')); };

  /* ---------- tag filter ----------
     Shared by the welcome grid and the picker: one tag at a time; a generator shows when it carries
     the selected tag (or nothing is selected). Cards animate in / out when the filter changes. */
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const matches = (card) => !S.tags.length || card.dataset.tags.split('|').some((t) => S.tags.includes(t));

  /* FLIP animation: remember where every visible card is (mid-animation positions included), apply the
     new filter in one go, then let staying cards glide from their old to their new place. Leaving cards
     are pinned (absolutely) where they were and fade out there, so the grid can re-flow immediately;
     new cards fade and scale in. Rapid clicks restart smoothly from the current on-screen state. */
  const EASE = 'cubic-bezier(0.22, 0.8, 0.24, 1)';
  function unpin(card) {
    clearTimeout(card._t);
    card._leaving = false;
    card.style.position = card.style.left = card.style.top = card.style.width = card.style.height = card.style.zIndex = '';
  }

  function filterGrid(grid, animate) {
    const cards = [...grid.children];
    if (!animate || reduceMotion() || !grid.offsetParent) {
      for (const c of cards) { c.getAnimations().forEach((a) => a.cancel()); unpin(c); c.hidden = !matches(c); }
      fitTitles(grid);
      return;
    }
    requestAnimationFrame(() => fitTitles(grid)); // cards that just appeared
    // First: on-screen boxes of everything currently visible (incl. cards still fading out)
    const gb = grid.getBoundingClientRect(), first = new Map();
    for (const c of cards) if (!c.hidden) first.set(c, c.getBoundingClientRect());
    for (const c of cards) { c.getAnimations().forEach((a) => a.cancel()); unpin(c); }

    // apply the filter: leaving cards are pinned at their old spot, out of the layout flow
    const leaving = [], entering = [], staying = [];
    for (const c of cards) {
      const show = matches(c), was = first.has(c);
      if (show && !was) { c.hidden = false; entering.push(c); }
      else if (show) staying.push(c);
      else if (was) leaving.push(c);
      else c.hidden = true;
    }
    for (const c of leaving) {
      const r = first.get(c);
      c._leaving = true;
      Object.assign(c.style, { position: 'absolute', left: r.left - gb.left + 'px', top: r.top - gb.top + 'px', width: r.width + 'px', height: r.height + 'px', zIndex: 0 });
    }

    // Last + Invert + Play
    for (const c of staying) {
      const a = first.get(c), b = c.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      c.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: EASE });
    }
    for (const c of leaving) {
      const anim = c.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.9)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
      const done = () => { if (!c._leaving) return; anim.cancel(); unpin(c); c.hidden = true; };
      anim.onfinish = done;
      c._t = setTimeout(done, 260); // fallback if the finish event is late (e.g. no frames while hidden)
    }
    entering.forEach((c, i) => {
      c.animate([{ opacity: 0, transform: 'translateY(10px) scale(0.92)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 90 + Math.min(i * 22, 180), easing: EASE, fill: 'backwards' });
    });
  }

  function syncTagBars() {
    for (const bar of document.querySelectorAll('.tag-bar')) {
      const grid = document.getElementById(bar.dataset.grid);
      for (const b of bar.querySelectorAll('.tag-chip')) b.classList.toggle('on', S.tags.includes(b.dataset.tag));
      const n = [...grid.children].filter(matches).length;
      bar.querySelector('.tag-count').textContent = S.tags.length ? U.t('{0} of {1}', n, grid.children.length) : U.t('All {0}', grid.children.length);
      bar.querySelector('.tag-reset').disabled = !S.tags.length;
    }
  }

  function setTags(tags) {
    S.tags = tags;
    for (const bar of document.querySelectorAll('.tag-bar')) filterGrid(document.getElementById(bar.dataset.grid), true);
    syncTagBars();
    save();
  }

  function buildTagBars() {
    const used = U.TAGS.filter((t) => U.generators.some((g) => (g.tags || []).includes(t)));
    for (const bar of document.querySelectorAll('.tag-bar')) {
      bar.innerHTML = '';
      const chips = el('div', 'tag-chips');
      for (const t of used) {
        const b = el('button', 'tag-chip', U.t(t));
        b.type = 'button';
        b.dataset.tag = t;
        b.title = U.t('Show only generators tagged {0} (click again to show all)', U.t(t));
        b.onclick = () => setTags(S.tags.includes(t) ? [] : [t]); // one tag at a time
        chips.append(b);
      }
      const reset = el('button', 'btn small ghost tag-reset', U.t('Reset filter'));
      reset.type = 'button';
      reset.onclick = () => setTags([]);
      bar.append(el('span', 'tag-label', U.t('Filter')), chips, el('span', 'tag-count'), reset);
    }
    syncTagBars();
  }

  let pickerBuilt = false;
  function openPicker() {
    if (!pickerBuilt) {
      genGrid($('#pickerGrid'), (id) => { closePicker(); createTab(id); });
      pickerBuilt = true;
      syncTagBars();
    }
    $('#picker').hidden = false;
    fitTitles($('#pickerGrid'));
  }
  function closePicker() { $('#picker').hidden = true; }

  /* ---------- export ---------- */
  function safeName(s) { return s.replace(/[^\p{L}\p{N}_\- ]+/gu, '').trim().replace(/\s+/g, '_') || 'texture'; }

  async function doExport(copy) {
    const tab = cur();
    if (!tab) return false;
    const [W, H] = dims(aspectOf(tab), S.exportSize);
    showBusy(U.t('Rendering {0}…', `${W} × ${H}`));
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20)));
    try {
      let { canvas } = renderOutput(tab, W, H, false);
      const fmt = copy ? FORMATS.png : FORMATS[S.format];
      if (fmt[0] === 'image/jpeg') {
        // JPEG has no alpha: flatten onto black
        const flat = U.canvas(W, H), g = flat.getContext('2d');
        g.fillStyle = '#000';
        g.fillRect(0, 0, W, H);
        g.drawImage(canvas, 0, 0);
        canvas = flat;
      }
      const blob = await new Promise((r) => canvas.toBlob(r, fmt[0], 0.95));
      if (!blob) throw new Error(U.t('the browser could not encode an image this large'));
      if (copy) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast(U.t(normalOn(tab) ? 'Copied {0} normal map PNG to clipboard' : 'Copied {0} PNG to clipboard', `${W}×${H}`));
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        const suffix = normalOn(tab) ? '_normal' : sheetOn(tab) ? `_sheet${tab.sheet.grid}x${tab.sheet.grid}` : '';
        a.download = `${safeName(tabName(tab))}${suffix}_${W}x${H}.${fmt[1]}`;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast(U.t('Exported {0}', a.download));
      }
      tab.dirty = false;
      renderTabs();
      save();
      return true;
    } catch (e) {
      console.error(e);
      toast(U.t(copy ? 'Copy failed: {0}' : 'Export failed: {0}', e.message));
      return false;
    } finally {
      hideBusy();
    }
  }

  function showBusy(text) { $('#busyText').textContent = text; $('#busy').hidden = false; }
  function hideBusy() { $('#busy').hidden = true; }

  let toastT = 0;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- persistence ---------- */
  let saveT = 0;
  function save() {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      try {
        localStorage.setItem(STORE, JSON.stringify({
          tabs: S.tabs, active: S.active, previewRes: S.previewRes, exportSize: S.exportSize, format: S.format, hardPixels: S.hardPixels, tags: S.tags,
        }));
      } catch (e) { /* storage unavailable: session just isn't remembered */ }
    }, 300);
  }

  function autoName(t, gen) {
    if (!t.name) return { name: null, num: t.num || 1 };
    const m = t.name.match(/^(.*?)(?: (\d+))?$/);
    return m[1] === gen.name ? { name: null, num: +(m[2] || 1) } : { name: t.name, num: t.num || 1 };
  }

  function load() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { d = null; }
    if (!d) return;
    if ([256, 512, 1024, 'export'].includes(d.previewRes)) S.previewRes = d.previewRes;
    if (typeof d.hardPixels === 'boolean') S.hardPixels = d.hardPixels;
    if (SIZES.some((s) => s[0] === d.exportSize)) S.exportSize = d.exportSize;
    if (FORMATS[d.format]) S.format = d.format;
    if (Array.isArray(d.tags)) S.tags = d.tags.filter((t) => U.TAGS.includes(t)).slice(0, 1);
    for (const t of d.tabs || []) {
      const gen = U.getGen(t.type);
      if (!gen) continue;
      const tab = {
        id: nextId++,
        type: t.type,
        ...autoName(t, gen),
        aspect: parseAspect(t.aspect) ? t.aspect : gen.aspect || '1:1',
        params: Object.assign(U.defaultsFor(gen.params), t.params),
        view: Object.assign({ zoom: 'fit', tile: false, bg: gen.bg || 'checker', sections: {} }, t.view),
        dirty: !!t.dirty,
        preset: typeof t.preset === 'string' ? t.preset : null,
        normal: newNormal(gen, t.normal),
        sheet: newSheet(t.sheet),
      };
      if (d.active === t.id) S.active = tab.id;
      S.tabs.push(tab);
    }
    if (!cur() && S.tabs.length) S.active = S.tabs[0].id;
  }

  /* ---------- landing hero: "Just One More <word>", the word is filled with generator output ---------- */
  function startHero() {
    const word = $('#heroWord');
    if (!word) return;
    const MINT = ['#5fe3b0', '#2c8f6c', '#16463a', '#9cf2cf'];
    // one word per generator; tileable generators fill the word with their own (mint) output
    const slides = [
      ['Texture', 'noise', { colorA: '#123d31', colorB: '#b6f7dc', scale: 3, contrast: 1.6 }],
      ['Pattern', 'pattern', { shape: 'hexagons', cols: 6, size: 0.82, fg: '#5fe3b0', bg: '#1d5a47' }],
      ['Noise', 'noise', { type: 'worley', colorA: '#0f3329', colorB: '#9cf2cf', scale: 4 }],
      ['Brick', 'bricks', { brick1: '#5fe3b0', brick2: '#2c8f6c', mortarColor: '#0f3329', grain: 0.2, chip: 0.15 }],
      ['Wood Grain', 'material', { material: 'wood', c1: '#9cf2cf', c2: '#2c8f6c', c3: '#16463a' }],
      ['Particle', 'noise', { mode: 'turbulence', colorA: '#0f3329', colorB: '#b6f7dc', scale: 3, contrast: 1.4 }],
      ['Camo', 'camo', { pattern: 'digital', pixels: 48, count: 4, c1: MINT[0], c2: MINT[1], c3: MINT[2], c4: MINT[3] }],
      ['Marble', 'material', { material: 'marble', c1: '#c9fbe6', c2: '#16463a', c3: '#5fe3b0' }],
      ['Crosshair', 'pattern', { shape: 'crosses', cols: 6, size: 0.7, line: 0.22, fg: '#9cf2cf', bg: '#1d5a47' }],
      ['Grime', 'grime', { mode: 'color', base: '#5fe3b0', dirt: '#0f3329' }],
      ['Muzzle Flash', 'noise', { mode: 'ridged', colorA: '#16463a', colorB: '#c9fbe6', scale: 3, contrast: 1.5 }],
      ['Detail Maps', 'noise', { type: 'cells', colorA: '#0d2b22', colorB: '#b6f7dc', scale: 5, contrast: 1.5 }],
      ['Scope', 'pattern', { shape: 'rings', cols: 5, size: 0.9, line: 0.18, fg: '#5fe3b0', bg: '#16463a' }],
      ['Rust', 'material', { material: 'rust', c1: '#2c8f6c', c2: '#9cf2cf', c3: '#5fe3b0' }],
      ['Scratch Map', 'scratches', { mode: 'color', color: '#c9fbe6', base: '#2c8f6c' }],
      ['Gradient', 'gradient', { preset: 'custom', stops: [{ pos: 0, color: '#16463a', alpha: 1 }, { pos: 1, color: '#9cf2cf', alpha: 1 }], angle: 90, repeat: 'mirror', scale: 0.5, dither: 0 }],
      ['Cursor', 'pattern', { shape: 'triangles', cols: 7, size: 0.8, fg: '#5fe3b0', bg: '#1d5a47' }],
      ['Splatter', 'pattern', { shape: 'dots', cols: 5, size: 0.75, stagger: true, fg: '#9cf2cf', bg: '#2c8f6c', modType: 'random', modMin: 0.2 }],
      ['Light Cookie', 'noise', { type: 'cells', colorA: '#0f3329', colorB: '#9cf2cf', scale: 4, contrast: 1.4 }],
      ['Rotor Blur', 'pattern', { shape: 'stripes', cols: 8, line: 0.45, dir: 'diag', fg: '#9cf2cf', bg: '#2c8f6c' }],
      ['UI Border', 'pattern', { shape: 'grid', cols: 6, line: 0.12, fg: '#9cf2cf', bg: '#2c8f6c' }],
      ['Grass', 'grass', { root: '#16463a', tip: '#9cf2cf', dry: '#5fe3b0', soil: '#0f3329', dryAmt: 0.2 }],
      ['Billboard', 'pattern', { shape: 'triangles', cols: 7, size: 0.85, fg: '#9cf2cf', bg: '#16463a' }],
      ['Light Cone', 'noise', { colorA: '#0f3329', colorB: '#c9fbe6', scale: 2, contrast: 1.3 }],
      ['Tank Reticle', 'pattern', { shape: 'crosses', cols: 5, size: 0.8, line: 0.14, fg: '#9cf2cf', bg: '#16463a' }],
      ['Flowfield', 'flowfield', { cols: 14, shape: 'dash', ratio: 0.25, fillColor: '#b6f7dc', bg: '#16463a' }],
      ['Graffiti', 'graffiti', { palette: 'custom', c1: '#5fe3b0', c2: '#9cf2cf', c3: '#2c8f6c', c4: '#b6f7dc', c5: '#16463a', outline: '#06150f', shadow: '#0f3329', overspray: 0, grunge: 0, distort: 0 }],
      ['Red Dot', 'redDot', { cSize: 5, ring: true, ringR: 80, ringW: 3, glow: 0.6, tint: '#5fe3b0' }],
      ['Vignette', 'vignette', { color: '#0f3329', intensity: 1, output: 'multiply', start: 0.2, width: 0.9 }],
      ['Mask', 'mask', { color: '#0f3329', opacity: 1, shape: 'ellipse', pair: true, w: 0.38, h: 0.34, gap: 0.46, feather: 18, output: 'overlay' }],
      ['Button', 'button', { top: '#5fe3b0', bottom: '#2c8f6c', outlineColor: '#06150f', margin: 2 }],
      ['Lightning', 'noise', { mode: 'ridged', colorA: '#0f3329', colorB: '#c9fbe6', scale: 2, contrast: 1.8 }],
      ['Shape', 'pattern', { shape: 'squares', cols: 5, size: 0.6, radius: 0.25, fg: '#5fe3b0', bg: '#16463a' }],
    ];
    const cache = [];
    const urlFor = (i) => {
      if (!cache[i]) {
        const [, type, over] = slides[i], gen = U.getGen(type);
        const params = Object.assign(U.defaultsFor(gen.params), over);
        cache[i] = renderTab({ type, params, aspect: '1:1' }, 180, 180, true).canvas.toDataURL();
      }
      return `url(${cache[i]})`;
    };

    let i = 0;
    word.style.backgroundImage = urlFor(0);
    word.textContent = slides[0][0];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    setInterval(() => {
      if (!document.body.classList.contains('empty') || document.hidden) return; // only while the landing page shows
      i = (i + 1) % slides.length;
      word.classList.add('out');
      setTimeout(() => {
        word.style.backgroundImage = urlFor(i);
        word.textContent = slides[i][0];
        word.classList.remove('out');
        word.classList.add('pre');          // jump below without transition…
        void word.offsetWidth;
        word.classList.remove('pre');       // …then slide up into place
      }, 330);
    }, 2600);
  }

  /* ---------- language ----------
     Flags in the top right corner; switching re-translates everything in place (tabs, panel, grids). */
  function buildLangBar() {
    const bar = $('#langBar');
    bar.innerHTML = '';
    for (const [code, name, flag] of U.LANGS) {
      const on = U.lang() === code;
      const b = el('button', 'lang-btn' + (on ? ' on' : ''));
      b.type = 'button';
      b.title = name;
      b.setAttribute('aria-label', name);
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML = flag;
      b.onclick = () => setLanguage(code);
      bar.append(b);
    }
  }

  function setLanguage(code) {
    if (code === U.lang()) return;
    U.setLang(code);
    U.applyI18n();
    buildLangBar();
    genGrid($('#welcomeGrid'), (id) => createTab(id));
    $('#pickerGrid').innerHTML = '';
    pickerBuilt = false; // rebuilt in the new language the next time it opens
    buildTagBars();
    renderTabs();
    syncChrome();
    if (cur()) { buildPanel(); status(); if (player.timer) drawPlayer(); }
  }

  /* ---------- boot ---------- */
  U.applyI18n();
  buildLangBar();
  buildChrome();
  genGrid($('#welcomeGrid'), (id) => createTab(id));
  startHero();
  load();
  filterGrid($('#welcomeGrid'), false); // apply the saved tag filter
  buildTagBars();
  // deep link: index.html#new=camo opens a fresh tab of that generator
  const hashType = (location.hash.match(/new=(\w+)/) || [])[1];
  if (hashType && U.getGen(hashType)) createTab(hashType);
  else refreshAll();
})();
