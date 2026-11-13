/* UGTG param UI: builds controls from a generator's param definitions.
   Param def: { key, label, type: range|int|color|select|bool|seed|text|list|section, default, min, max, step,
                options, show(values, root), apply(value, values), collapsed, item (list), tip } */
(function () {
  'use strict';
  const U = window.UGTG;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  U.el = el;

  const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
  U.clone = clone;
  U.defaultsFor = (defs) => {
    const o = {};
    for (const d of defs) if (d.key) o[d.key] = clone(d.default);
    return o;
  };

  /* Full param set for a generator preset { name, group, values, aspect? }: defaults, then the preset's
     values. Values for params with an `apply` hook (a generator's own preset/material selects) are
     applied first, so a preset can start from one of those and override single values on top. */
  U.presetValues = (gen, preset) => {
    const v = U.defaultsFor(gen.params), pv = preset.values || {};
    const byKey = new Map(gen.params.filter((d) => d.key).map((d) => [d.key, d]));
    for (const k of Object.keys(pv)) if (!byKey.has(k)) console.warn(`preset "${preset.name}" (${gen.id}): unknown param "${k}"`);
    for (const d of gen.params) if (d.apply && d.key in pv) { v[d.key] = clone(pv[d.key]); d.apply(v[d.key], v); }
    for (const d of gen.params) {
      if (!d.key || !(d.key in pv) || d.apply) continue;
      const x = clone(pv[d.key]);
      // list items only need the fields that differ from the item defaults
      v[d.key] = d.type === 'list' && Array.isArray(x) ? x.map((it) => Object.assign(U.defaultsFor(d.item), it)) : x;
    }
    return v;
  };

  const decimals =(step) => { const s = String(step), i = s.indexOf('.'); return i < 0 ? 0 : s.length - i - 1; };
  const optList = (opts) => opts.map((o) => (Array.isArray(o) ? o : [o, o]));

  const CHEVRON = U.icon('<path d="M6 9l6 6 6-6"/>');
  const DICE = U.icon('<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>');
  U.ICONS = { dice: DICE };

  /* Does a visible control currently have an effect? Used to highlight section headings.
     A section can override this with `active: (values, root) => bool` when its "on" state is neutral. */
  function hasEffect(d, v) {
    switch (d.type) {
      case 'bool': return !!v;
      case 'seed': return false;
      case 'text': return !!v;
      case 'select': return !(v === 'none' && optList(d.options).some(([o]) => o === 'none'));
      case 'range':
      case 'int': return !(d.min <= 0 && +v === 0);
      case 'color': return true;
      case 'list': return Array.isArray(v) && v.some((it) => it.on !== false);
      default: return false;
    }
  }

  /* Top level of the inspector: every section is a tab in a bar at the top; only the selected
     section's controls are shown. Sections whose label mentions "output" always sit at the far
     right. The selected tab is remembered in hooks.collapsed.__tab (stored per editor tab). */
  const OUTPUT_RE = /\boutput\b/i;
  function buildTabs(container, defs, values, hooks) {
    const groups = [];
    for (const d of defs) {
      if (d.type === 'section') groups.push({ d, defs: [] });
      else {
        if (!groups.length) groups.push({ d: { type: 'section', label: 'General' }, defs: [] });
        groups[groups.length - 1].defs.push(d);
      }
    }
    // keep the definition order, but output sections move to the end
    const ordered = groups.filter((g) => !OUTPUT_RE.test(g.d.label)).concat(groups.filter((g) => OUTPUT_RE.test(g.d.label)));
    const bar = el('div', 'insp-tabs'), panes = el('div', 'insp-panes');
    container.append(bar, panes);
    const store = hooks.collapsed || {};
    for (const g of ordered) {
      g.btn = el('button', 'insp-tab', U.t(g.d.label));
      g.btn.type = 'button';
      g.pane = el('div', 'insp-pane section-body');
      g.refresh = build(g.pane, g.defs, values, hooks, values);
      g.btn.onclick = () => { store.__tab = g.d.label; if (hooks.persist) hooks.persist(); select(); container.scrollTop = 0; };
      bar.append(g.btn);
      panes.append(g.pane);
    }
    const visible = (g) => !g.d.show || g.d.show(values, values);
    function select() {
      const vis = ordered.filter(visible);
      const cur = vis.find((g) => g.d.label === store.__tab) || vis[0];
      for (const g of ordered) {
        const on = g === cur;
        g.btn.classList.toggle('on', on);
        g.pane.hidden = !on;
      }
    }
    const refresh = () => {
      for (const g of ordered) {
        g.refresh();
        g.btn.hidden = !visible(g);
        // accent marker: this section currently changes the result
        const fx = g.d.active ? !!g.d.active(values, values) : g.defs.some((d) => (!d.show || d.show(values, values)) && hasEffect(d, values[d.key]));
        g.btn.classList.toggle('fx', fx);
      }
      select();
    };
    refresh();
    return refresh;
  }

  function build(container, defs, values, hooks, rootVals) {
    // the top level becomes tabs; nested builds (list items) keep inline sections
    if (!rootVals && defs.some((d) => d.type === 'section')) return buildTabs(container, defs, values, hooks);
    rootVals = rootVals || values;
    const rows = [], subs = [], sections = [];
    let body = container, curSec = null;
    for (const d of defs) {
      if (d.type === 'section') {
        const sec = el('div', 'section');
        const id = d.label;
        const col = hooks.collapsed && id in hooks.collapsed ? hooks.collapsed[id] : !!d.collapsed;
        if (col) sec.classList.add('collapsed');
        const head = el('button', 'section-head');
        head.type = 'button';
        head.innerHTML = CHEVRON;
        head.append(el('span', null, U.t(d.label)));
        head.onclick = () => {
          const c = sec.classList.toggle('collapsed');
          if (hooks.collapsed) hooks.collapsed[id] = c;
          if (hooks.persist) hooks.persist();
        };
        body = el('div', 'section-body');
        sec.append(head, body);
        container.append(sec);
        rows.push({ d, row: sec });
        curSec = { d, el: sec, items: [] };
        sections.push(curSec);
        continue;
      }
      const row = control(d, values, hooks, rootVals, subs);
      body.append(row);
      rows.push({ d, row });
      if (curSec) curSec.items.push({ d, row });
    }
    const refresh = () => {
      for (const r of rows) if (r.d.show) r.row.hidden = !r.d.show(values, rootVals);
      for (const s of subs) s();
      // highlight sections that currently affect the result (hidden controls don't count)
      for (const s of sections) {
        const on = s.d.active ? !!s.d.active(values, rootVals) : s.items.some((it) => !it.row.hidden && hasEffect(it.d, values[it.d.key]));
        s.el.classList.toggle('active', on);
      }
    };
    refresh();
    return refresh;
  }

  function control(d, values, hooks, rootVals, subs) {
    const row = el('div', 'ctl ctl-' + d.type);
    if (d.tip) row.title = U.t(d.tip);
    const label = el('label', 'ctl-label', U.t(d.label));
    const commit = (v, rebuild) => {
      values[d.key] = v;
      if (d.apply) { d.apply(v, values); rebuild = true; }
      hooks.change(!!rebuild);
    };

    switch (d.type) {
      case 'range':
      case 'int': {
        const step = d.type === 'int' ? 1 : d.step || 0.01, dec = decimals(step);
        const head = el('div', 'ctl-head');
        const num = el('input', 'num');
        num.type = 'number'; num.step = step;
        const sl = el('input', 'slider');
        sl.type = 'range'; sl.min = d.min; sl.max = d.max; sl.step = step;
        const paint = (v) => {
          sl.value = v;
          num.value = (+v).toFixed(dec);
          sl.style.setProperty('--p', U.clamp((v - d.min) / (d.max - d.min)) * 100 + '%');
        };
        paint(values[d.key]);
        sl.oninput = () => { const v = +sl.value; paint(v); commit(v); };
        num.onchange = () => {
          let v = parseFloat(num.value);
          if (!isFinite(v)) v = d.default;
          v = U.clamp(v, d.min, d.max);
          if (d.type === 'int') v = Math.round(v);
          paint(v); commit(v);
        };
        sl.ondblclick = () => { paint(d.default); commit(d.default); };
        sl.title = U.t('Double-click to reset');
        head.append(label, num);
        row.append(head, sl);
        break;
      }
      case 'color': {
        const wrap = el('div', 'color-wrap');
        const inp = el('input');
        inp.type = 'color'; inp.value = values[d.key];
        const hex = el('input', 'hex');
        hex.value = values[d.key]; hex.spellcheck = false; hex.maxLength = 7;
        inp.oninput = () => { hex.value = inp.value; commit(inp.value); };
        hex.onchange = () => {
          let v = hex.value.trim();
          if (!v.startsWith('#')) v = '#' + v;
          if (/^#[0-9a-f]{6}$/i.test(v)) { v = v.toLowerCase(); inp.value = v; hex.value = v; commit(v); }
          else hex.value = values[d.key];
        };
        wrap.append(hex, inp);
        row.append(label, wrap);
        break;
      }
      case 'select': {
        const s = el('select');
        for (const [v, l] of optList(d.options)) { const o = el('option', null, U.t(String(l))); o.value = v; s.append(o); }
        s.value = values[d.key];
        const isNum = typeof d.default === 'number';
        s.onchange = () => commit(isNum ? +s.value : s.value);
        row.append(label, s);
        break;
      }
      case 'bool': {
        const sw = el('label', 'switch');
        const cb = el('input');
        cb.type = 'checkbox'; cb.checked = !!values[d.key];
        sw.append(cb, el('span', 'knob'));
        cb.onchange = () => commit(cb.checked);
        label.onclick = () => { cb.checked = !cb.checked; commit(cb.checked); };
        row.append(label, sw);
        break;
      }
      case 'text': {
        const inp = el('input', 'text-in');
        inp.type = 'text'; inp.value = values[d.key] || ''; inp.maxLength = d.max || 24; inp.spellcheck = false;
        if (d.placeholder) inp.placeholder = U.t(d.placeholder);
        inp.oninput = () => commit(inp.value);
        row.append(label, inp);
        break;
      }
      case 'seed': {
        const wrap = el('div', 'seed-wrap');
        const num = el('input', 'num');
        num.type = 'number'; num.value = values[d.key];
        const dice = el('button', 'icon-btn small');
        dice.type = 'button'; dice.title = U.t('Random seed'); dice.innerHTML = DICE;
        num.onchange = () => { const v = Math.round(+num.value) || 0; num.value = v; commit(v); };
        dice.onclick = () => { const v = (Math.random() * 99999) | 0; num.value = v; commit(v); };
        wrap.append(num, dice);
        row.append(label, wrap);
        break;
      }
      case 'list': {
        const items = values[d.key];
        const head = el('div', 'list-head');
        const add = el('button', 'btn small', '+ ' + U.t('Add {0}', U.t(d.itemLabel || 'Item')));
        add.type = 'button';
        add.disabled = items.length >= (d.max || 12);
        add.onclick = () => { items.push(U.defaultsFor(d.item)); hooks.change(true); };
        const fold = el('button', 'btn small ghost', U.t('Collapse all'));
        fold.type = 'button';
        fold.onclick = () => {
          const all = items.every((it) => it._collapsed);
          items.forEach((it) => { it._collapsed = !all; });
          hooks.change(true);
        };
        const btns = el('div', 'list-btns');
        btns.append(fold, add);
        head.append(label, btns);
        row.append(head);
        items.forEach((it, i) => {
          const card = el('div', 'list-item' + (it._collapsed ? ' collapsed' : ''));
          const ch = el('div', 'list-item-head');
          const title = el('button', 'list-item-title');
          title.type = 'button';
          title.title = U.t('Collapse / expand');
          title.innerHTML = CHEVRON;
          title.append(el('span', null, U.t(d.itemLabel || 'Item') + ' ' + (i + 1)));
          if (d.itemSummary) {
            const sum = el('span', 'list-item-sum', d.itemSummary(it));
            title.append(sum);
            subs.push(() => { sum.textContent = d.itemSummary(it); });
          }
          // UI-only state, stored on the item so it survives panel rebuilds and reloads
          title.onclick = () => { it._collapsed = card.classList.toggle('collapsed'); if (hooks.persist) hooks.persist(); };
          ch.append(title);
          const tools = el('div', 'list-tools');
          const mk = (txt, title, dis, fn) => {
            const b = el('button', 'mini', txt);
            b.type = 'button'; b.title = U.t(title); b.disabled = dis;
            b.onclick = () => { fn(); hooks.change(true); };
            tools.append(b);
          };
          mk('↑', 'Move up', i === 0, () => items.splice(i - 1, 0, items.splice(i, 1)[0]));
          mk('↓', 'Move down', i === items.length - 1, () => items.splice(i + 1, 0, items.splice(i, 1)[0]));
          mk('⧉', 'Duplicate', items.length >= (d.max || 12), () => items.splice(i + 1, 0, clone(it)));
          mk('✕', 'Remove', items.length <= 1, () => items.splice(i, 1));
          ch.append(tools);
          const body = el('div', 'list-item-body');
          subs.push(build(body, d.item, it, hooks, rootVals));
          card.append(ch, body);
          row.append(card);
        });
        break;
      }
    }
    return row;
  }

  U.ui = { build };
})();
