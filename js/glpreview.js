/* Live WebGL refraction preview for normal-map generators (Glass & Refraction Normals, Water Normals).
   A small box in the corner of the viewport shows a background scene seen through the current normal
   map: UV offset by the normal's XY (refraction / distortion), optional chromatic split, a specular
   highlight and, for water, two copies scrolling against each other.
   A generator opts in with `glPreview: { isNormal(p), flipY(p), water? }`; the app calls
   U.glPreview.update(canvas, p, gen) after every preview render and U.glPreview.hide() otherwise.
   Preview settings are UI-only (not part of the texture) and remembered in localStorage. */
(function () {
  'use strict';
  const U = window.UGTG;
  const KEY = 'ugtg.glPreview';
  const TEX = 512;

  const BGS = [['tiles', 'Pool tiles'], ['scene', 'Landscape'], ['text', 'Text'], ['checker', 'Checker'], ['stripes', 'Stripes'], ['ui', 'UI panel']];
  const DEF = { bg: 'tiles', amt: 0.35, tile: 1, anim: true, spec: 0.6, chrom: 0.15, tint: 0.15 };

  let st = Object.assign({}, DEF);
  try { Object.assign(st, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* defaults */ }
  const store = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* not remembered */ } };

  let box = null, cv = null, gl = null, prog = null, texN = null, texB = null, loc = {}, raf = 0, t0 = 0;
  let bgDone = '', water = false, flip = 1, aspect = 1, visible = false, failed = false;
  const normCv = U.canvas(TEX, TEX);

  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*0.5+0.5;gl_Position=vec4(p,0.0,1.0);}';
  const FS = [
    'precision mediump float;',
    'varying vec2 v;',
    'uniform sampler2D uN,uB;',
    'uniform float uT,uAmt,uTile,uFlip,uSpec,uChrom,uTint,uWater,uAsp;',
    'vec3 nrm(vec2 q){vec3 n=texture2D(uN,q).xyz*2.0-1.0;n.y*=uFlip;return n;}',
    'void main(){',
    '  vec2 q=vec2(v.x,(1.0-v.y)*uAsp)*uTile;',
    '  vec3 n=nrm(q);',
    '  if(uWater>0.5){vec2 s=vec2(uT*0.031,uT*0.017);vec3 a=nrm(q+s);vec3 b=nrm(q*0.93-s*0.8+vec2(0.37,0.61));n=vec3(a.xy+b.xy,max(0.2,a.z*b.z));}',
    '  n=normalize(n);',
    '  vec2 off=vec2(n.x,-n.y)*uAmt*0.25;',
    '  vec2 b=vec2(v.x,1.0-v.y);',
    '  vec2 uv=b+off;',
    '  vec3 c;',
    '  if(uChrom>0.0){c=vec3(texture2D(uB,b+off*(1.0+uChrom)).r,texture2D(uB,uv).g,texture2D(uB,b+off*(1.0-uChrom)).b);}',
    '  else c=texture2D(uB,uv).rgb;',
    '  c=mix(c,c*vec3(0.78,0.93,1.0),uTint);',
    '  vec3 L=normalize(vec3(-0.45,0.55,0.7));vec3 H=normalize(L+vec3(0.0,0.0,1.0));',
    '  float sp=pow(max(dot(n,H),0.0),70.0)*uSpec*1.4;',
    '  float fr=pow(1.0-clamp(n.z,0.0,1.0),2.0)*uSpec*0.6;',
    '  gl_FragColor=vec4(c+vec3(sp+fr),1.0);',
    '}',
  ].join('\n');

  function initGL() {
    if (gl || failed) return !!gl;
    try { gl = cv.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false }); } catch (e) { gl = null; }
    if (!gl) { failed = true; return false; }
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { console.error(e); gl = null; failed = true; return false; }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const ap = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(ap);
    gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uN', 'uB', 'uT', 'uAmt', 'uTile', 'uFlip', 'uSpec', 'uChrom', 'uTint', 'uWater', 'uAsp']) loc[n] = gl.getUniformLocation(prog, n);
    const mk = (wrap) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      return t;
    };
    texN = mk(gl.REPEAT);
    texB = mk(gl.MIRRORED_REPEAT);
    gl.uniform1i(loc.uN, 0);
    gl.uniform1i(loc.uB, 1);
    return true;
  }

  /* background scenes, drawn once per choice with canvas 2D */
  function drawBg(kind) {
    const c = U.canvas(TEX, TEX), g = c.getContext('2d'), S = TEX;
    if (kind === 'tiles') {
      g.fillStyle = '#2a8fc0'; g.fillRect(0, 0, S, S);
      const n = 8, s = S / n;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        g.fillStyle = (i + j) % 5 === 0 ? '#41aedd' : '#3aa2d4';
        g.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      }
      g.strokeStyle = '#e8f6ff'; g.lineWidth = 3;
      for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, S); g.moveTo(0, i * s); g.lineTo(S, i * s); g.stroke(); }
      g.fillStyle = '#123a66'; g.fillRect(0, S * 0.74, S, s * 0.5);
    } else if (kind === 'scene') {
      const sky = g.createLinearGradient(0, 0, 0, S * 0.6);
      sky.addColorStop(0, '#3a6fc4'); sky.addColorStop(1, '#f2c48a');
      g.fillStyle = sky; g.fillRect(0, 0, S, S);
      g.fillStyle = '#fff2c8'; g.beginPath(); g.arc(S * 0.68, S * 0.38, S * 0.07, 0, U.TAU); g.fill();
      g.fillStyle = '#4b4f7a'; g.beginPath(); g.moveTo(0, S * 0.6);
      for (let x = 0; x <= S; x += 16) g.lineTo(x, S * 0.6 - Math.abs(Math.sin(x * 0.011) * 70 + Math.sin(x * 0.037) * 22));
      g.lineTo(S, S); g.lineTo(0, S); g.fill();
      g.fillStyle = '#2d5a3a'; g.fillRect(0, S * 0.6, S, S * 0.4);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
      for (let i = -8; i <= 16; i++) { g.beginPath(); g.moveTo(S / 2 + i * 8, S * 0.6); g.lineTo(S / 2 + i * 70, S); g.stroke(); }
      for (let k = 1; k < 8; k++) { const y = S * 0.6 + (S * 0.4) * Math.pow(k / 8, 1.8); g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
    } else if (kind === 'text') {
      g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, S, S);
      g.fillStyle = '#1b1d22'; g.textBaseline = 'top';
      const words = ['Just One', 'More', 'Texture', 'refraction', 'glass · water', 'distortion', 'normal map'];
      let y = 14;
      words.forEach((w, i) => { const fs = i % 3 === 1 ? 64 : 40; g.font = `${i % 2 ? 700 : 500} ${fs}px system-ui, sans-serif`; g.fillText(w, 18, y); y += fs * 1.12; });
    } else if (kind === 'checker') {
      const n = 8, s = S / n;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { g.fillStyle = (i + j) & 1 ? '#e9e9e9' : '#2b2d31'; g.fillRect(i * s, j * s, s, s); }
      g.fillStyle = '#e8423b'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.16, 0, U.TAU); g.fill();
    } else if (kind === 'stripes') {
      const cols = ['#f25f5c', '#ffe066', '#70c1b3', '#247ba0', '#50514f'];
      for (let i = 0; i < 20; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(i * S / 20, 0, S / 20 + 1, S); }
    } else {
      // UI panel: a HUD-like layout with readable shapes
      g.fillStyle = '#14181d'; g.fillRect(0, 0, S, S);
      g.fillStyle = '#22303a'; g.fillRect(24, 24, S - 48, 90);
      g.fillStyle = '#5fe3b0'; g.fillRect(40, 48, 260, 18); g.fillStyle = '#e3a35f'; g.fillRect(40, 78, 180, 14);
      g.fillStyle = '#eceeed'; g.font = '700 34px system-ui, sans-serif'; g.fillText('STATUS', 320, 84);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
        g.fillStyle = (i + j) % 3 ? '#26313b' : '#31424f'; g.fillRect(24 + i * 118, 140 + j * 118, 104, 104);
        g.strokeStyle = '#5fe3b0'; g.lineWidth = 2; g.strokeRect(24 + i * 118, 140 + j * 118, 104, 104);
      }
    }
    return c;
  }

  function build() {
    if (box) return;
    box = document.getElementById('glBox');
    if (!box) return;
    cv = document.getElementById('glView');
    // the box sits over the viewport: keep its clicks / drags away from the viewport's pan
    box.addEventListener('pointerdown', (e) => e.stopPropagation());
    box.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true });
    const ctl = box.querySelector('.gl-ctl');
    const row = (label, input) => { const r = U.el('label', 'gl-row'); r.append(U.el('span', null, U.t(label)), input); ctl.append(r); return input; };
    const sel = U.el('select');
    for (const [v, l] of BGS) { const o = U.el('option', null, U.t(l)); o.value = v; sel.append(o); }
    sel.value = st.bg;
    sel.onchange = () => { st.bg = sel.value; store(); draw(); };
    row('Background', sel);
    const range = (label, key, min, max, step) => {
      const r = U.el('input', 'slider');
      r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = st[key];
      const paint = () => r.style.setProperty('--p', ((st[key] - min) / (max - min)) * 100 + '%');
      paint();
      r.oninput = () => { st[key] = +r.value; paint(); store(); draw(); };
      r.ondblclick = () => { st[key] = DEF[key]; r.value = DEF[key]; paint(); store(); draw(); };
      row(label, r);
    };
    range('Distortion', 'amt', 0, 1.5, 0.01);
    range('Tiling', 'tile', 1, 6, 0.5);
    range('Highlight', 'spec', 0, 1.5, 0.01);
    range('Chromatic split', 'chrom', 0, 0.6, 0.01);
    range('Tint', 'tint', 0, 1, 0.01);
    const cb = U.el('input');
    cb.type = 'checkbox'; cb.checked = !!st.anim;
    cb.onchange = () => { st.anim = cb.checked; store(); loop(); };
    const animRow = row('Animate (water)', cb);
    animRow.parentNode.classList.add('gl-anim');
    const fold = box.querySelector('.gl-fold');
    fold.onclick = () => { box.classList.toggle('folded'); };
  }

  function draw(time) {
    if (!gl || !visible) return;
    if (bgDone !== st.bg) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, texB);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, drawBg(st.bg));
      bgDone = st.bg;
    }
    const w = cv.clientWidth * (window.devicePixelRatio || 1) | 0;
    if (w && cv.width !== w) { cv.width = w; cv.height = w; }
    gl.viewport(0, 0, cv.width, cv.height);
    const t = time != null ? (time - t0) / 1000 : 0;
    gl.uniform1f(loc.uT, water && st.anim ? t : 0);
    gl.uniform1f(loc.uAmt, st.amt);
    gl.uniform1f(loc.uTile, st.tile);
    gl.uniform1f(loc.uFlip, flip);
    gl.uniform1f(loc.uSpec, st.spec);
    gl.uniform1f(loc.uChrom, st.chrom);
    gl.uniform1f(loc.uTint, st.tint);
    gl.uniform1f(loc.uWater, water && st.anim ? 1 : 0);
    gl.uniform1f(loc.uAsp, aspect);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function loop() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (!visible || !water || !st.anim) { draw(); return; }
    if (!t0) t0 = performance.now();
    const step = (now) => {
      if (!visible || document.hidden) { raf = 0; return; }
      draw(now);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  U.glPreview = {
    /* src: the rendered normal map (any size; resampled to a square power-of-two texture) */
    update(src, p, gen) {
      build();
      if (!box) return;
      if (!visible) { box.hidden = false; visible = true; }
      if (!initGL()) { box.classList.add('nogl'); return; }
      const g = normCv.getContext('2d');
      g.imageSmoothingEnabled = true;
      g.clearRect(0, 0, TEX, TEX);
      g.drawImage(src, 0, 0, TEX, TEX);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texN);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, normCv);
      const cfg = gen.glPreview || {};
      flip = cfg.flipY && cfg.flipY(p) ? -1 : 1;
      water = !!cfg.water;
      aspect = src.width / src.height;
      box.classList.toggle('is-water', water);
      loop();
    },
    hide() {
      if (!box || !visible) return;
      visible = false;
      box.hidden = true;
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && visible) loop(); });
})();
