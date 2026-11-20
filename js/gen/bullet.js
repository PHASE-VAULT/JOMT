/* Bullet / ammunition round, side view, transparent background.
   The round is a surface of revolution: a radius profile r(u) along its length (u in mm, base at 0) built
   from parts — case (rim, extractor groove / belt, body, shoulder, neck; straight pistol case; shotgun hull
   with brass head, plastic tube and crimp) and projectile (ogive nose with flat tip, hollow point, boat tail,
   cannelure, painted / polymer / soft-point tip; Foster slug; ball / pellet).
   The profile is sampled into a table (3 samples per pixel along the axis, slightly blurred so edges get
   small fillets). Per pixel the normal comes from the profile slope and the position across the cylinder,
   plus small surface details (ribs, crimp folds, petals, dents) that are radial offsets d(u, angle). The
   same geometry gives the color shading (diffuse, tinted metal specular with anisotropic streaks, studio
   reflection, rim light) and the height map for normal map mode (radius dome + details). */
(function () {
  'use strict';
  const U = window.UGTG;
  const { clamp, smoothstep, lerp } = U;
  const D2R = Math.PI / 180;

  /* ---------- materials: albedo (0..255), metalness, roughness, how anisotropic (brushed / drawn) ---------- */
  const MATS = {
    brass: { label: 'Brass', c: [208, 164, 82], metal: 1, rough: 0.3, aniso: 1 },
    nickel: { label: 'Nickel-plated', c: [212, 212, 208], metal: 1, rough: 0.2, aniso: 0.6 },
    copper: { label: 'Copper jacket', c: [200, 114, 68], metal: 1, rough: 0.28, aniso: 0.45 },
    steelCu: { label: 'Copper-washed steel', c: [170, 104, 70], metal: 1, rough: 0.42, aniso: 0.35 },
    lacqGreen: { label: 'Steel, green lacquer', c: [96, 104, 66], metal: 0.15, rough: 0.3, aniso: 0.15 },
    lacqGrey: { label: 'Steel, grey polymer coat', c: [112, 114, 108], metal: 0.1, rough: 0.5, aniso: 0.1 },
    steel: { label: 'Bare steel', c: [158, 160, 164], metal: 1, rough: 0.38, aniso: 0.8 },
    aluminum: { label: 'Aluminum', c: [196, 198, 202], metal: 1, rough: 0.4, aniso: 0.7 },
    lead: { label: 'Lead', c: [128, 130, 136], metal: 0.6, rough: 0.72, aniso: 0 },
    gold: { label: 'Gold (stylized)', c: [252, 196, 60], metal: 1, rough: 0.24, aniso: 0.3 },
    custom: { label: 'Custom color' },
  };
  // hot-loop helpers live at module level (one function identity for every render keeps V8 from deoptimizing)
  const rAtI = (A, f) => { const i = f | 0, t = f - i; return A[i] + (A[i + 1] - A[i]) * t; };
  const grid2 = (G, nu, fu, fp) => {
    const i = fu | 0, j = fp | 0, tu = fu - i, tp = fp - j, k = j * nu + i;
    const a = G[k] + (G[k + 1] - G[k]) * tu, b = G[k + nu] + (G[k + nu + 1] - G[k + nu]) * tu;
    return a + (b - a) * tp;
  };
  const pow10 = (x) => { const x2 = x * x, x4 = x2 * x2, x8 = x4 * x4; return x8 * x2; };
  const MAT_OPTS = Object.keys(MATS).map((k) => [k, MATS[k].label]);
  const matOf = (key, color, metal) => {
    const m = MATS[key] || MATS.brass;
    if (key === 'custom') return { c: U.hex(color), metal: clamp(metal), rough: 0.35, aniso: 0.5 * clamp(metal) };
    return { c: m.c.slice(), metal: m.metal, rough: m.rough, aniso: m.aniso };
  };

  /* ---------- geometry: profile r(u), material id m(u), detail offsets d(u, phi), all in mm ---------- */
  function geometry(p) {
    const part = p.part, shot = p.caseType === 'shotgun', straight = p.caseType === 'straight';
    const hasCase = part !== 'bullet';
    const hasBullet = part === 'bullet' || (part === 'round' && !shot);
    const spent = part === 'case' && !!p.spent;
    const mats = [null];
    const add = (m) => (mats.push(m), mats.length - 1);
    const caseM = hasCase ? add(matOf(p.caseMat, p.caseColor, p.caseMetal)) : 0;
    const hullM = hasCase && shot ? add({ c: U.hex(p.hullColor), metal: 0, rough: 0.42, aniso: 0.1 }) : 0;

    /* ----- case ----- */
    const CL = Math.max(1, p.caseLen), rimR = p.rimD / 2, rimT = Math.min(p.rimThick, CL * 0.3), headR = p.headD / 2;
    const ch = Math.min(0.3, rimT * 0.3) * (rimR / 5); // base chamfer
    const G = { shStart: CL * 0.7, shLen: 0, neckStart: CL }; // shoulder info (anneal, residue, dent)
    let caseR = () => 0;
    if (hasCase && shot) {
      const hullR = p.hullD / 2, bH = clamp(p.brassH, rimT + 1, CL * 0.8), cL = Math.min(p.crimpLen, CL * 0.3);
      const ringU = bH - 1.6, rr = 1.1 * (hullR / 10), roll = p.crimp === 'roll';
      caseR = (u) => {
        if (u < ch) return rimR - ch + u;
        if (u < rimT) return rimR;
        if (u < bH) { const q = (u - ringU) / 0.45; return headR - (Math.abs(q) < 1 ? 0.14 * Math.sqrt(1 - q * q) : 0); }
        const t = (u - (CL - cL)) / cL;
        if (t <= 0) return hullR;
        if (spent) return hullR * (1 + 0.035 * t * t); // opened crimp: flares out a little
        if (roll) { // rounded lip, with the small groove of the roll crimp in front of it
          const q = clamp((u - (CL - rr * 1.6)) / (rr * 1.6)), g = Math.abs(t - 0.15) < 0.15 ? 0.2 * Math.sin(((t - 0) / 0.3) * Math.PI) : 0;
          return hullR - g - rr * 1.6 * (1 - Math.sqrt(1 - q * q)) * 0.9;
        }
        const q = clamp((u - (CL - rr)) / rr); // star crimp: folds in, edge rounded over
        return hullR * (1 - 0.11 * t * t) - rr * (1 - Math.sqrt(1 - q * q));
      };
      G.hull = { hullR, bH, cL, roll };
      G.shStart = CL - cL; G.neckStart = CL - cL;
    } else if (hasCase) {
      const groove = p.rimType !== 'rimmed', belted = p.rimType === 'belted';
      const nkR = p.neckD / 2, shR = p.shoulderD / 2;
      const grooveR = Math.min(rimR, headR) * 0.875, gw = rimT * 0.85, bev = (headR - grooveR) * 1.4;
      let x = rimT;
      if (groove) x += gw + bev;
      const beltEnd = belted ? x + 5.2 * (headR / 6.5) : x, bodyR0 = belted ? headR - 0.32 * (headR / 6.5) : headR;
      const neckStart = straight ? CL : CL - Math.min(p.neckLen, CL * 0.4);
      const shLen = straight ? 0 : Math.max(0.05, shR - nkR) / Math.tan(clamp(p.shoulderAngle, 5, 80) * D2R);
      const shStart = Math.max(beltEnd + 0.5, neckStart - shLen);
      Object.assign(G, { shStart, shLen: neckStart - shStart, neckStart });
      caseR = (u) => {
        if (u < ch) return rimR - ch + u;
        if (u < rimT) return rimR;
        if (groove) {
          if (u < rimT + gw) return grooveR;
          if (u < rimT + gw + bev) return grooveR + ((u - rimT - gw) / bev) * (headR - grooveR);
        } else if (u < rimT + 0.35) return lerp(rimR, headR, 0.5); // rimmed: small fillet in front of the rim
        if (u < beltEnd) return headR;
        if (straight) return lerp(bodyR0, nkR, (u - beltEnd) / Math.max(0.1, CL - beltEnd));
        if (u < shStart) return lerp(bodyR0, shR, (u - beltEnd) / Math.max(0.1, shStart - beltEnd));
        if (u < neckStart) return shR + ((nkR - shR) * (u - shStart)) / Math.max(0.01, neckStart - shStart);
        return nkR;
      };
    }

    /* ----- projectile ----- */
    const ball = p.nose === 'ball', slug = p.nose === 'slug', hollow = p.nose === 'hollow';
    const R = p.bulletD / 2, BL = ball ? p.bulletD : Math.max(p.bulletLen, 0.5);
    const ub = part === 'bullet' ? 0 : p.oal - BL; // base of the projectile along the round
    const Lo = Math.max(0.05, Math.min(p.ogiveLen, BL * 0.97)), mp = clamp(p.meplat, 0, 0.95), og = clamp(p.ogive);
    const rho = (R * R + Lo * Lo) / (2 * R);
    const tipOn = hasBullet && !ball && p.tip !== 'none', tipL = Math.min(p.tipLen, BL * 0.9), tipInset = p.tip === 'soft' || p.tip === 'polymer';
    const bulM = hasBullet ? add(matOf(p.bulletMat, p.bulletColor, p.bulletMetal)) : 0;
    const tipM = tipOn
      ? add(p.tip === 'soft' ? matOf('lead') : { c: U.hex(p.tipColor), metal: 0, rough: p.tip === 'polymer' ? 0.16 : 0.4, aniso: 0 })
      : 0;
    const btL = Math.min(p.btLen, BL - Lo), btT = Math.tan(p.btAngle * D2R), bch = Math.min(0.15, R * 0.04);
    const cann = p.cannelure, cw = 0.25 * R, cd = 0.035 * R;
    const nose = (xt) => { // radius at distance xt from the tip, 0..Lo
      const t = xt / Lo;
      const cone = t, tang = (Math.sqrt(Math.max(0, rho * rho - (Lo - xt) * (Lo - xt))) + R - rho) / R, ell = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
      const f = og < 0.5 ? lerp(cone, tang, og * 2) : lerp(tang, ell, og * 2 - 1);
      return R * (mp + (1 - mp) * clamp(f));
    };
    const bulletR = (x) => {
      if (x < 0 || x > BL) return 0;
      if (ball) return Math.sqrt(Math.max(0, R * R - (x - R) * (x - R)));
      const xt = BL - x;
      let r = R;
      if (btL > 0 && x < btL) r = R - (btL - x) * btT;
      r = Math.min(r, R - bch + x);
      if (xt < Lo) r = Math.min(r, nose(xt));
      if (tipOn && tipInset && xt < tipL) r *= 0.975;
      if (cann > 0 && Math.abs(x - cann) < cw / 2) { const q = (x - cann) / (cw / 2); r -= cd * Math.sqrt(1 - q * q); }
      return r;
    };

    /* ----- whole round ----- */
    const L = part === 'bullet' ? BL : part === 'case' || shot ? CL : Math.max(CL, p.oal);
    const rAt = (u) => {
      if (u < 0 || u > L) return 0;
      if (hasCase && u <= CL) return caseR(u);
      return hasBullet ? bulletR(u - ub) : 0;
    };
    const mAt = (u) => {
      if (u < 0 || u > L) return 0;
      if (hasCase && u <= CL) return shot && u >= G.hull.bH ? hullM : caseM;
      if (!hasBullet) return 0;
      return tipOn && BL - (u - ub) < tipL ? tipM : bulM;
    };

    /* ----- surface details: radial offsets in mm at (u, phi), phi = angle around the axis (0 = facing the viewer) ----- */
    const dets = [];
    if (hasCase && shot) {
      const { hullR, bH, cL } = G.hull;
      if (p.ribs > 0) {
        const n = p.ribs, a = 0.07 * (hullR / 10);
        dets.push([bH, CL, (u, ph) => a * Math.cos(ph * n) * smoothstep(bH, bH + 1.5, u) * smoothstep(CL - cL * 0.2, CL - cL, u)]);
      }
      if (!G.hull.roll || spent) {
        const n = p.folds, a = (spent ? 0.5 : 0.32) * (hullR / 10);
        dets.push([CL - cL, CL, (u, ph) => { const t = clamp((u - (CL - cL)) / cL); return -a * Math.pow(t, 1.3) * pow10(0.5 + 0.5 * Math.cos(ph * n + 0.4)); }]);
      }
    }
    if (hasBullet && hollow) {
      const z = Lo * 0.45, a = 0.06 * R;
      dets.push([ub + BL - z, ub + BL, (u, ph) => { const xt = ub + BL - u; return -a * (1 - xt / z) * pow10(0.5 + 0.5 * Math.cos(ph * 6 + 0.25)) ** 1.4; }]);
    }
    if (hasBullet && slug) {
      const a = 0.045 * R, x1 = BL - Lo * 0.55;
      dets.push([ub + 0.6, ub + x1, (u, ph) => { const x = u - ub; return -a * smoothstep(0.35, 0.85, 0.5 + 0.5 * Math.cos(ph * 12 + x * 0.22)) * smoothstep(0.6, 1.6, x) * smoothstep(x1, x1 - 1.5, x); }]);
    }
    if (spent && !shot) {
      const mz = Math.min(4, CL * 0.15), a = (0.03 + 0.06 * p.dent) * headR, s = p.seed;
      dets.push([CL - mz, CL, (u, ph) => smoothstep(CL - mz, CL, u) * a * (U.value(ph * 2.2 + 7, 0.5, 0, 0, s) - 0.25)]);
    }
    if (spent && p.dent > 0) { // ejection dent on the shoulder / upper body
      const u0 = shot ? CL * 0.55 : straight ? CL * 0.62 : G.shStart + G.shLen * 0.3, wu = 0.11 * CL, a = p.dent * headR * 0.16;
      dets.push([u0 - wu * 2.5, u0 + wu * 2.5, (u, ph) => { const a1 = (u - u0) / wu, b1 = (ph + 0.55) / 0.45; return -a * Math.exp(-a1 * a1 - b1 * b1); }]);
    }
    const nD = dets.length, dA = dets.map((e) => e[0]), dB = dets.map((e) => e[1]), dF = dets.map((e) => e[2]);
    const detail = (u, ph) => { let d = 0; for (let k = 0; k < nD; k++) if (u >= dA[k] && u <= dB[k]) d += dF[k](u, ph); return d; };
    const zone = (u) => dets.some(([a, b]) => u >= a && u <= b);

    let Rmax = 0;
    for (let i = 0; i <= 2000; i++) Rmax = Math.max(Rmax, rAt((i / 2000) * L));
    return { L, rAt, mAt, detail, zone, mats, Rmax, CL, G, spent, shot, straight, hasCase, caseM };
  }

  const isRound = (p) => p.part === 'round';
  const hasCase = (p) => p.part !== 'bullet';
  const isShot = (p) => hasCase(p) && p.caseType === 'shotgun';
  const isCart = (p) => hasCase(p) && p.caseType !== 'shotgun';
  const isBottle = (p) => hasCase(p) && p.caseType === 'bottleneck';
  const hasBullet = (p) => p.part === 'bullet' || (p.part === 'round' && p.caseType !== 'shotgun');
  const ogiveNose = (p) => hasBullet(p) && p.nose !== 'ball';
  const isSpent = (p) => p.part === 'case' && p.spent;
  const realistic = (p) => p.style === 'real';

  U.register({
    id: 'bullet',
    name: 'Bullet / Round',
    desc: 'Side-view ammunition rounds in rifle, pistol and shotgun calibers with metal shading and normal map',
    uses: ['Item icons and inventory sprites for ammunition in shooters and survival games, e.g. ammo counters, loot cards and shop screens.', 'Flat cards for cartridges and shell props in low-poly scenes, lit through the normal map.'],
    tags: ['Shooter', 'Military', 'UI'],
    aspect: '4:1',
    normalMap: true,
    heightMap: true,
    normalDesc: 'Normal map from the round\'s own shape: the cylinder profile plus grooves, ribs, crimp folds and dents',
    normalDefaults: { strength: 6, smooth: 0.5 },
    icon: U.icon('<path d="M2.5 9h11.5l3.6 1c2 .6 3.9 1.3 3.9 2s-1.9 1.4-3.9 2L14 15H2.5z"/><path d="M4 9v6M14 9v6"/>'),
    params: [
      { type: 'section', label: 'Round' },
      { key: 'part', label: 'Show', type: 'select', default: 'round', options: [['round', 'Complete round'], ['case', 'Casing only'], ['bullet', 'Projectile only']] },
      { key: 'caseType', label: 'Case type', type: 'select', default: 'bottleneck', options: [['bottleneck', 'Bottleneck (rifle)'], ['straight', 'Straight (pistol)'], ['shotgun', 'Shotgun shell']], show: hasCase },
      { key: 'spent', label: 'Fired (spent)', type: 'bool', default: false, show: (p) => p.part === 'case', tip: 'Powder residue at the mouth, a slightly dented mouth, an opened crimp on shotgun shells' },
      { key: 'angle', label: 'Rotation', type: 'range', min: -180, max: 180, step: 1, default: 0, tip: '0 = tip to the right, -90 = tip up' },
      { key: 'fill', label: 'Size', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.92, tip: 'How much of the image the round fills (it always fits)' },

      { type: 'section', label: 'Case (mm)', show: hasCase },
      { key: 'caseLen', label: 'Case length', type: 'range', min: 8, max: 120, step: 0.1, default: 44.7, show: hasCase },
      { key: 'rimType', label: 'Rim', type: 'select', default: 'rimless', options: [['rimless', 'Rimless (extractor groove)'], ['rimmed', 'Rimmed'], ['rebated', 'Rebated'], ['belted', 'Belted']], show: isCart },
      { key: 'rimD', label: 'Rim diameter', type: 'range', min: 4, max: 26, step: 0.01, default: 9.6, show: hasCase },
      { key: 'rimThick', label: 'Rim thickness', type: 'range', min: 0.5, max: 3, step: 0.01, default: 1.14, show: hasCase },
      { key: 'headD', label: 'Head diameter', type: 'range', min: 4, max: 26, step: 0.01, default: 9.58, show: hasCase, tip: 'Body diameter just above the rim / groove (brass head on shotgun shells)' },
      { key: 'shoulderD', label: 'Shoulder diameter', type: 'range', min: 3, max: 24, step: 0.01, default: 9.0, show: isBottle },
      { key: 'shoulderAngle', label: 'Shoulder angle', type: 'range', min: 8, max: 60, step: 0.5, default: 23, show: isBottle, tip: 'Half-angle of the shoulder to the case axis (degrees)' },
      { key: 'neckD', label: 'Neck / mouth diameter', type: 'range', min: 2, max: 24, step: 0.01, default: 6.43, show: isCart },
      { key: 'neckLen', label: 'Neck length', type: 'range', min: 1, max: 25, step: 0.1, default: 5.1, show: isBottle },
      { key: 'caseMat', label: 'Material', type: 'select', default: 'brass', options: MAT_OPTS, show: hasCase },
      { key: 'caseColor', label: 'Color', type: 'color', default: '#c9a04e', show: (p) => hasCase(p) && p.caseMat === 'custom' },
      { key: 'caseMetal', label: 'Metallic', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: (p) => hasCase(p) && p.caseMat === 'custom' },
      { key: 'anneal', label: 'Annealing stain', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: isBottle, tip: 'Bluish-brown discoloration on neck and shoulder, typical of military rifle brass' },

      { type: 'section', label: 'Shotgun hull', show: isShot },
      { key: 'hullD', label: 'Hull diameter', type: 'range', min: 8, max: 24, step: 0.01, default: 20.2, show: isShot },
      { key: 'brassH', label: 'Brass head height', type: 'range', min: 3, max: 30, step: 0.1, default: 8, show: isShot, tip: 'Low brass ~8 mm, high brass ~19 mm' },
      { key: 'hullColor', label: 'Hull color', type: 'color', default: '#b3261e', show: isShot },
      { key: 'ribs', label: 'Ribs', type: 'int', min: 0, max: 80, default: 0, show: isShot, tip: 'Ribs along the plastic hull (0 = smooth)' },
      { key: 'crimp', label: 'Crimp', type: 'select', default: 'star', options: [['star', 'Star (folded)'], ['roll', 'Roll']], show: isShot },
      { key: 'folds', label: 'Folds', type: 'int', min: 4, max: 12, default: 6, show: (p) => isShot(p) && (p.crimp === 'star' || isSpent(p)) },
      { key: 'crimpLen', label: 'Crimp length', type: 'range', min: 1, max: 12, step: 0.1, default: 5.5, show: isShot },

      { type: 'section', label: 'Projectile (mm)', show: hasBullet },
      { key: 'nose', label: 'Type', type: 'select', default: 'ogive', options: [['ogive', 'Ogive (FMJ / soft point)'], ['hollow', 'Hollow point'], ['slug', 'Shotgun slug (ribbed)'], ['ball', 'Ball / pellet']], show: hasBullet },
      { key: 'bulletD', label: 'Diameter', type: 'range', min: 2, max: 22, step: 0.01, default: 5.7, show: hasBullet },
      { key: 'bulletLen', label: 'Length', type: 'range', min: 2, max: 70, step: 0.1, default: 19, show: ogiveNose },
      { key: 'oal', label: 'Overall length (round)', type: 'range', min: 10, max: 160, step: 0.1, default: 57.4, show: (p) => isRound(p) && hasBullet(p), tip: 'Total length of the loaded round; sets how deep the projectile sits in the case' },
      { key: 'ogiveLen', label: 'Nose length', type: 'range', min: 0.2, max: 40, step: 0.1, default: 11.5, show: ogiveNose },
      { key: 'ogive', label: 'Nose shape', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, show: ogiveNose, tip: '0 = cone, 0.5 = tangent ogive (spitzer), 1 = round nose' },
      { key: 'meplat', label: 'Flat tip', type: 'range', min: 0, max: 0.95, step: 0.01, default: 0.06, show: ogiveNose, tip: 'Tip flat (meplat) as a fraction of the diameter' },
      { key: 'btLen', label: 'Boat tail length', type: 'range', min: 0, max: 12, step: 0.1, default: 2.2, show: ogiveNose, tip: 'Tapered base (0 = flat base). Only visible on the bare projectile' },
      { key: 'btAngle', label: 'Boat tail angle', type: 'range', min: 2, max: 20, step: 0.5, default: 9, show: (p) => ogiveNose(p) && p.btLen > 0 },
      { key: 'cannelure', label: 'Cannelure position', type: 'range', min: 0, max: 40, step: 0.1, default: 0, show: ogiveNose, tip: 'Crimp groove, distance from the projectile base (0 = none)' },
      { key: 'bulletMat', label: 'Material', type: 'select', default: 'copper', options: MAT_OPTS, show: hasBullet },
      { key: 'bulletColor', label: 'Color', type: 'color', default: '#c8724a', show: (p) => hasBullet(p) && p.bulletMat === 'custom' },
      { key: 'bulletMetal', label: 'Metallic', type: 'range', min: 0, max: 1, step: 0.01, default: 1, show: (p) => hasBullet(p) && p.bulletMat === 'custom' },
      { key: 'tip', label: 'Tip', type: 'select', default: 'none', options: [['none', 'None'], ['paint', 'Painted tip'], ['soft', 'Exposed lead (soft point)'], ['polymer', 'Polymer tip']], show: ogiveNose },
      { key: 'tipLen', label: 'Tip length', type: 'range', min: 0.5, max: 20, step: 0.1, default: 5, show: (p) => ogiveNose(p) && p.tip !== 'none' },
      { key: 'tipColor', label: 'Tip color', type: 'color', default: '#3d7d35', show: (p) => ogiveNose(p) && (p.tip === 'paint' || p.tip === 'polymer'), tip: 'Green = steel core, red / orange = tracer, black = armor piercing, silver = incendiary' },

      { type: 'section', label: 'Shading' },
      { key: 'style', label: 'Style', type: 'select', default: 'real', options: [['real', 'Realistic'], ['toon', 'Toon (cel bands)'], ['flat', 'Flat']] },
      { key: 'lightAngle', label: 'Light direction', type: 'range', min: -180, max: 180, step: 1, default: -115, tip: '-90 = light from the top, -135 = top-left' },
      { key: 'lightElev', label: 'Light height', type: 'range', min: 5, max: 85, step: 1, default: 40, show: (p) => p.style !== 'flat', tip: 'Low = grazing light, high = light from the front' },
      { key: 'ambient', label: 'Ambient', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, show: (p) => p.style !== 'flat' },
      { key: 'specular', label: 'Specular', type: 'range', min: 0, max: 2, step: 0.01, default: 1 },
      { key: 'rough', label: 'Roughness (× material)', type: 'range', min: 0.3, max: 2.5, step: 0.01, default: 1, show: (p) => p.style !== 'flat' },
      { key: 'reflect', label: 'Reflections', type: 'range', min: 0, max: 1, step: 0.01, default: 0.7, show: realistic, tip: 'Studio environment reflected by the metal: bright band towards the light, dark band in the middle' },
      { key: 'aniso', label: 'Brushed streaks', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5, show: realistic, tip: 'Anisotropic highlight stretched along the length, with fine drawing marks (mostly brass)' },
      { key: 'rimLight', label: 'Rim light', type: 'range', min: 0, max: 1, step: 0.01, default: 0, show: (p) => p.style !== 'flat' },
      { key: 'rimColor', label: 'Rim light color', type: 'color', default: '#ffffff', show: (p) => p.style !== 'flat' && p.rimLight > 0 },

      { type: 'section', label: 'Outline' },
      { key: 'outlineW', label: 'Outline (px @ 256)', type: 'range', min: 0, max: 12, step: 0.25, default: 0 },
      { key: 'outlineColor', label: 'Outline color', type: 'color', default: '#1c140a', show: (p) => p.outlineW > 0 },

      { type: 'section', label: 'Wear' },
      { key: 'wear', label: 'Tarnish / grime', type: 'range', min: 0, max: 1, step: 0.01, default: 0 },
      { key: 'grain', label: 'Surface grain', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35, tip: 'Fine streaky brightness variation along the length (drawing marks)' },
      { key: 'residue', label: 'Powder residue', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6, show: isSpent },
      { key: 'dent', label: 'Dent', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25, show: isSpent, tip: 'Ejection dent on the shoulder / body, plus a slightly uneven mouth' },
      { key: 'seed', label: 'Seed', type: 'seed', default: 3 },
    ],
    presets: [
      // rifle
      { name: '5.56x45 NATO M855 (green tip)', group: 'Rifle', aspect: '4:1', values: { bulletLen: 23, ogiveLen: 13, btLen: 2.6, tip: 'paint', tipLen: 5, tipColor: '#3d7d35' } },
      { name: '7.62x39 (lacquered steel case)', group: 'Rifle', aspect: '4:1', values: { caseLen: 38.7, rimD: 11.35, rimThick: 1.5, headD: 11.35, shoulderD: 10.07, shoulderAngle: 26, neckD: 8.6, neckLen: 6.7, caseMat: 'lacqGreen', bulletD: 7.92, bulletLen: 26.8, oal: 56, ogiveLen: 14, ogive: 0.4, meplat: 0.06, btLen: 3.2, btAngle: 7, bulletMat: 'steelCu' } },
      { name: '7.62x51 NATO M80 ball', group: 'Rifle', aspect: '4:1', values: { caseLen: 51.18, rimD: 11.94, rimThick: 1.37, headD: 11.94, shoulderD: 11.53, shoulderAngle: 20, neckD: 8.72, neckLen: 7.7, bulletD: 7.82, bulletLen: 28.5, oal: 71.1, ogiveLen: 16, ogive: 0.45, meplat: 0.05, btLen: 3.6, btAngle: 9, cannelure: 8.9, anneal: 0.55 } },
      { name: '7.62x51 tracer (red tip)', group: 'Rifle', aspect: '4:1', values: { caseLen: 51.18, rimD: 11.94, rimThick: 1.37, headD: 11.94, shoulderD: 11.53, shoulderAngle: 20, neckD: 8.72, neckLen: 7.7, bulletD: 7.82, bulletLen: 30, oal: 71.1, ogiveLen: 16, ogive: 0.45, meplat: 0.05, btLen: 0, cannelure: 10.4, tip: 'paint', tipLen: 6.5, tipColor: '#d23a1c' } },
      { name: '.308 Win soft point (nickel)', group: 'Rifle', aspect: '4:1', values: { caseLen: 51.18, rimD: 11.94, rimThick: 1.37, headD: 11.94, shoulderD: 11.53, shoulderAngle: 20, neckD: 8.72, neckLen: 7.7, caseMat: 'nickel', bulletD: 7.82, bulletLen: 27, oal: 71.1, ogiveLen: 14, ogive: 0.6, meplat: 0.2, btLen: 0, cannelure: 7.4, tip: 'soft', tipLen: 3.5 } },
      { name: '.300 Win Mag (belted, polymer tip)', group: 'Rifle', aspect: '4:1', values: { caseLen: 66.55, rimType: 'belted', rimD: 13.03, rimThick: 1.35, headD: 13.03, shoulderD: 12.42, shoulderAngle: 25, neckD: 8.45, neckLen: 6.7, bulletD: 7.82, bulletLen: 35, oal: 84.8, ogiveLen: 21, ogive: 0.42, meplat: 0, btLen: 4, tip: 'polymer', tipLen: 5, tipColor: '#c8261e' } },
      // pistol
      { name: '9x19mm FMJ', group: 'Pistol', aspect: '2:1', values: { caseType: 'straight', caseLen: 19.15, rimD: 9.96, rimThick: 1.27, headD: 9.93, neckD: 9.65, bulletD: 9.01, bulletLen: 15.6, oal: 29.7, ogiveLen: 8.6, ogive: 0.8, meplat: 0.2, btLen: 0 } },
      { name: '9x19mm JHP (nickel case)', group: 'Pistol', aspect: '2:1', values: { caseType: 'straight', caseLen: 19.15, rimD: 9.96, rimThick: 1.27, headD: 9.93, neckD: 9.65, caseMat: 'nickel', nose: 'hollow', bulletD: 9.01, bulletLen: 14.8, oal: 29.2, ogiveLen: 6.5, ogive: 0.75, meplat: 0.42, btLen: 0 } },
      { name: '.45 ACP FMJ', group: 'Pistol', aspect: '2:1', values: { caseType: 'straight', caseLen: 22.8, rimD: 12.19, rimThick: 1.24, headD: 12.09, neckD: 12.01, bulletD: 11.48, bulletLen: 17, oal: 32.4, ogiveLen: 9.5, ogive: 0.85, meplat: 0.25, btLen: 0 } },
      { name: '.357 Magnum JSP (rimmed)', group: 'Pistol', aspect: '2:1', values: { caseType: 'straight', rimType: 'rimmed', caseLen: 32.77, rimD: 11.18, rimThick: 1.5, headD: 9.63, neckD: 9.63, caseMat: 'nickel', bulletD: 9.07, bulletLen: 15.3, oal: 40, ogiveLen: 7.5, ogive: 0.65, meplat: 0.45, btLen: 0, cannelure: 8.3, tip: 'soft', tipLen: 3.2 } },
      // shotgun
      { name: '12 gauge buckshot (red)', group: 'Shotgun', aspect: '2:1', values: { caseType: 'shotgun', caseLen: 65, rimD: 22.3, rimThick: 1.5, headD: 20.7, ribs: 36, folds: 6 } },
      { name: '12 gauge slug (green)', group: 'Shotgun', aspect: '2:1', values: { caseType: 'shotgun', caseLen: 65, rimD: 22.3, rimThick: 1.5, headD: 20.7, hullColor: '#2f7a3a', brassH: 12, crimp: 'roll', crimpLen: 4 } },
      { name: '12 gauge birdshot (blue)', group: 'Shotgun', aspect: '2:1', values: { caseType: 'shotgun', caseLen: 65, rimD: 22.3, rimThick: 1.5, headD: 20.7, hullColor: '#2a52a8', folds: 8 } },
      { name: '12 gauge high brass (black)', group: 'Shotgun', aspect: '2:1', values: { caseType: 'shotgun', caseLen: 65, rimD: 22.3, rimThick: 1.5, headD: 20.7, hullColor: '#222222', brassH: 19, folds: 8, caseMat: 'nickel' } },
      // heavy
      { name: '.50 BMG M33 ball', group: 'Heavy', aspect: '4:1', values: { caseLen: 99.3, rimD: 20.4, rimThick: 2.1, headD: 20.4, shoulderD: 18.1, shoulderAngle: 15, neckD: 14.2, neckLen: 15, bulletD: 12.98, bulletLen: 58.4, oal: 138.4, ogiveLen: 32, ogive: 0.42, meplat: 0.04, btLen: 8, btAngle: 8, cannelure: 19.6 } },
      { name: '.50 BMG M8 API (silver tip)', group: 'Heavy', aspect: '4:1', values: { caseLen: 99.3, rimD: 20.4, rimThick: 2.1, headD: 20.4, shoulderD: 18.1, shoulderAngle: 15, neckD: 14.2, neckLen: 15, bulletD: 12.98, bulletLen: 58.4, oal: 138.4, ogiveLen: 32, ogive: 0.42, meplat: 0.04, btLen: 8, btAngle: 8, cannelure: 19.6, tip: 'paint', tipLen: 9, tipColor: '#b9bdc2' } },
      { name: '.338 Lapua Magnum', group: 'Heavy', aspect: '4:1', values: { caseLen: 69.2, rimD: 14.93, rimThick: 1.52, headD: 14.91, shoulderD: 14.4, shoulderAngle: 20, neckD: 9.38, neckLen: 8.2, bulletD: 8.61, bulletLen: 39.5, oal: 93.5, ogiveLen: 23, ogive: 0.42, meplat: 0.03, btLen: 5, btAngle: 8 } },
      // spent cases and loose parts
      { name: 'Spent 5.56 casing', group: 'Spent / parts', aspect: '4:1', values: { part: 'case', spent: true, anneal: 0.3 } },
      { name: 'Spent 9mm casing', group: 'Spent / parts', aspect: '2:1', values: { part: 'case', spent: true, caseType: 'straight', caseLen: 19.15, rimD: 9.96, rimThick: 1.27, headD: 9.93, neckD: 9.65, dent: 0.1 } },
      { name: 'Spent 7.62x39 steel casing', group: 'Spent / parts', aspect: '4:1', values: { part: 'case', spent: true, caseLen: 38.7, rimD: 11.35, rimThick: 1.5, headD: 11.35, shoulderD: 10.07, shoulderAngle: 26, neckD: 8.6, neckLen: 6.7, caseMat: 'lacqGreen', residue: 0.75 } },
      { name: 'Spent 12 gauge hull', group: 'Spent / parts', aspect: '2:1', values: { part: 'case', spent: true, caseType: 'shotgun', caseLen: 67, rimD: 22.3, rimThick: 1.5, headD: 20.7, ribs: 36, dent: 0.15 } },
      { name: 'Ejected casing (tilted)', group: 'Spent / parts', aspect: '1:1', values: { part: 'case', spent: true, angle: -35, anneal: 0.3, fill: 0.85 } },
      { name: '9mm FMJ projectile', group: 'Spent / parts', aspect: '2:1', values: { part: 'bullet', bulletD: 9.01, bulletLen: 15.6, ogiveLen: 8.6, ogive: 0.8, meplat: 0.2, btLen: 0 } },
      { name: '5.56 M855 projectile', group: 'Spent / parts', aspect: '4:1', values: { part: 'bullet', bulletLen: 23, ogiveLen: 13, btLen: 2.6, tip: 'paint', tipLen: 5, tipColor: '#3d7d35', cannelure: 11.2 } },
      { name: '12 gauge Foster slug', group: 'Spent / parts', aspect: '1:1', values: { part: 'bullet', nose: 'slug', bulletD: 18.4, bulletLen: 18, ogiveLen: 7.5, ogive: 1, meplat: 0.45, btLen: 0, bulletMat: 'lead', fill: 0.8 } },
      { name: 'Buckshot pellet (00)', group: 'Spent / parts', aspect: '1:1', values: { part: 'bullet', nose: 'ball', bulletD: 8.4, bulletMat: 'lead', fill: 0.8 } },
      { name: 'Vertical round (ammo counter)', group: 'Spent / parts', aspect: '1:4', values: { angle: -90, bulletLen: 23, ogiveLen: 13, btLen: 2.6, tip: 'paint', tipLen: 5, tipColor: '#3d7d35' } },
      // stylized
      { name: 'Cartoon gold bullet', group: 'Stylized', aspect: '2:1', values: { caseType: 'straight', caseLen: 24, rimD: 13, rimThick: 1.6, headD: 12.6, neckD: 12.2, caseMat: 'gold', bulletD: 11.6, bulletLen: 21, oal: 38, ogiveLen: 13, ogive: 0.7, meplat: 0.08, btLen: 0, style: 'toon', outlineW: 3, outlineColor: '#2a1806', rimLight: 0.35, rimColor: '#fff3c4' } },
      { name: 'Flat icon (rifle round)', group: 'Stylized', aspect: '4:1', values: { style: 'flat', outlineW: 2.5, outlineColor: '#1a1a1a' } },
      { name: 'Toon shotgun shell', group: 'Stylized', aspect: '2:1', values: { caseType: 'shotgun', caseLen: 65, rimD: 22.3, rimThick: 1.5, headD: 20.7, hullColor: '#d8322a', folds: 6, style: 'toon', outlineW: 3, outlineColor: '#26100c', rimLight: 0.25 } },
    ],

    render(ctx, W, H, p, opts) {
      const heightOut = !!(opts && opts.height);
      const Gm = geometry(p);
      const { L, mats } = Gm;
      const img = ctx.createImageData(W, H), d = img.data;
      const put = () => ctx.putImageData(img, 0, 0);
      if (heightOut) for (let i = 3; i < d.length; i += 4) d[i] = 255; // black, opaque background = lowest height
      if (!(L > 0) || !(Gm.Rmax > 0)) return put();

      /* ----- fit the rotated round into the image ----- */
      const th = p.angle * D2R, ca = Math.cos(th), sa = Math.sin(th), Rm = Gm.Rmax;
      // the outline is part of the fit in both outputs, so the height map lines up with the color image
      const owFit = p.outlineW > 0 ? (p.outlineW * Math.min(W, H)) / 256 : 0, ow = heightOut ? 0 : owFit;
      const bw = Math.abs(L * ca) + Math.abs(2 * Rm * sa), bh = Math.abs(L * sa) + Math.abs(2 * Rm * ca);
      const sc = clamp(p.fill, 0.05, 1) * Math.min((W - 2 * owFit - 2) / bw, (H - 2 * owFit - 2) / bh); // px per mm
      if (!(sc > 0)) return put();

      /* ----- profile tables: 3 samples per px along the axis ----- */
      const ds = 1 / (3 * sc), pad = (owFit + 3) / sc, u0 = -pad;
      const N = Math.ceil((L + 2 * pad) / ds) + 3;
      const Rp = new Float32Array(N), M = new Uint8Array(N), F = new Uint8Array(N);
      for (let i = 0; i < N; i++) {
        const u = u0 + i * ds;
        Rp[i] = Gm.rAt(u) * sc; M[i] = Gm.mAt(u); F[i] = Gm.zone(u) ? 1 : 0;
      }
      // small fillets on the outer corners: two box blurs (≈ tent), radius ~1% of the diameter
      const rb = Math.max(1, Math.round((0.02 * Rm) / ds));
      {
        const tmp = new Float32Array(N), n = 2 * rb + 1;
        const box = (src, dst) => {
          let sum = 0;
          for (let k = -rb; k <= rb; k++) sum += src[Math.min(N - 1, Math.max(0, k))];
          for (let i = 0; i < N; i++) { dst[i] = sum / n; sum += src[Math.min(N - 1, i + rb + 1)] - src[Math.max(0, i - rb)]; }
        };
        const orig = Float32Array.from(Rp);
        box(Rp, tmp); box(tmp, Rp);
        for (let i = 0; i < N; i++) if (Rp[i] > orig[i]) Rp[i] = orig[i]; // round outer corners only: nothing grows past the silhouette (sharp tips, ball ends)
      }
      // ambient occlusion in grooves: higher profile on both sides
      const AO = new Float32Array(N), wS = Math.max(2, Math.round((0.5 * (Rm / 5)) / ds)), aoD = 0.3 * (Rm / 5) * sc;
      for (let i = 0; i < N; i++) {
        let ml = 0, mr = 0;
        for (let k = 1; k <= wS; k++) { const a = Rp[Math.max(0, i - k)], b = Rp[Math.min(N - 1, i + k)]; if (a > ml) ml = a; if (b > mr) mr = b; }
        AO[i] = 1 - 0.55 * clamp((Math.min(ml, mr) - Rp[i]) / aoD);
      }
      // dilated profile for the outline
      let Rd = null;
      if (ow > 0) {
        Rd = new Float32Array(N).fill(-1);
        const k = Math.ceil(ow * 3);
        for (let i = 0; i < N; i++) {
          if (Rp[i] <= 0) continue;
          for (let j = Math.max(0, i - k); j <= Math.min(N - 1, i + k); j++) {
            const du = (j - i) / 3, e = Rp[i] + Math.sqrt(Math.max(0, ow * ow - du * du));
            if (e > Rd[j]) Rd[j] = e;
          }
        }
      }
      const RmaxPx = Rm * sc;

      /* ----- shading constants ----- */
      const style = p.style, la = p.lightAngle * D2R, le = p.lightElev * D2R;
      const Lx = Math.cos(la) * Math.cos(le), Ly = Math.sin(la) * Math.cos(le), Lz = Math.sin(le);
      const l2x = Math.cos(la), l2y = Math.sin(la);
      let Hx = Lx, Hy = Ly, Hz = Lz + 1; { const m = Math.hypot(Hx, Hy, Hz); Hx /= m; Hy /= m; Hz /= m; }
      const amb = p.ambient, spk = p.specular, refl = p.reflect, anS = p.aniso, rimL = p.rimLight, rimC = U.hex(p.rimColor).map((v) => v / 255);
      const oc = U.hex(p.outlineColor), seed = p.seed | 0;
      const MT = mats.map((m) => m && { c: m.c.map((v) => v / 255), metal: m.metal, rough: m.rough, aniso: m.aniso });
      // fine drawing marks around the circumference (fixed angle = lines along the length)
      const NS = 512, streak = new Float32Array(NS);
      for (let k = 0; k < NS; k++) streak[k] = U.value(k * 0.45, 1.5, 0, 0, seed + 11) * 0.6 + U.value(k * 0.09, 4.5, 0, 0, seed + 12) * 0.4;
      const { CL, G, spent } = Gm;
      const wear = p.wear, grain = p.grain, anneal = p.anneal, residue = p.residue, roughMul = p.rough;
      // wear noise (tarnish, residue, annealing edge) on a coarse (u, angle) grid, interpolated per pixel
      const ws = 0.45 * Rm, useN = wear > 0 || spent || anneal > 0;
      const gs = ws / 5, NGU = Math.ceil(L / gs) + 2, NGP = Math.ceil((Math.PI * Rm) / gs) + 2;
      const NG = useN ? new Float32Array(NGU * NGP) : null;
      if (useN) for (let j = 0; j < NGP; j++) for (let i = 0; i < NGU; i++) NG[j * NGU + i] = U.fractal('perlin', (i * gs) / ws, (j * gs) / ws, 0, 0, 3, 0.5, 'fbm', seed);
      const gF = 3.1 / (Rm / 5), hasCaseG = Gm.hasCase, caseMI = Gm.caseM;
      const anA = G.shStart - 0.7 * (CL - G.neckStart), anB = G.shStart + G.shLen * 0.6;
      const bottle = Gm.hasCase && p.caseType === 'bottleneck' && !Gm.shot;
      const resZone = Gm.shot ? CL * 0.3 : bottle ? CL - G.shStart + G.shLen : CL * 0.35;
      const sub = [-1.125, -0.375, 0.375, 1.125];
      const iU = (L / 2 - u0) * sc * 3; // table index of the image center


      const cx = W / 2, cy = H / 2, vLim = RmaxPx + ow + 2;

      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
          const vpx = -dx * sa + dy * ca, av = Math.abs(vpx);
          if (av > vLim) continue;
          const fi = (dx * ca + dy * sa) * 3 + iU;
          if (fi < 2 || fi > N - 3) continue;
          let cov = 0, covO = 0;
          for (let k = 0; k < 4; k++) {
            const f = fi + sub[k], r = rAtI(Rp, f);
            if (r > 0) cov += clamp(r - av + 0.5) * Math.min(1, r * 2);
            if (Rd) { const e = rAtI(Rd, f); if (e > 0) covO += clamp(e - av + 0.5); }
          }
          cov *= 0.25; covO = Rd ? Math.max(cov, covO * 0.25) : cov;
          if (covO <= 0.002) continue;
          const o = (y * W + x) * 4;

          let cr = 0, cg = 0, cb = 0;
          if (cov > 0) {
            const i0 = Math.round(fi);
            const r = Math.max(1e-3, rAtI(Rp, fi)), slope = (Rp[i0 + 1] - Rp[i0 - 1]) * 1.5;
            const s = clamp(vpx / r, -1, 1), ph = Math.asin(s), u = u0 + fi * ds; // u in mm
            let dd = 0, ddu = 0, ddp = 0;
            if (F[i0]) {
              const eu = 0.04, ep = 0.01;
              dd = Gm.detail(u, ph);
              ddu = (Gm.detail(u + eu, ph) - dd) / eu;
              ddp = (Gm.detail(u, ph + ep) - dd) / ep;
            }
            if (heightOut) {
              const re = r + dd * sc, h = Math.sqrt(Math.max(0, re * re - vpx * vpx)) / RmaxPx;
              const v = Math.round(cov * (0.06 + 0.94 * clamp(h)) * 255);
              d[o] = d[o + 1] = d[o + 2] = v;
              continue;
            }
            // body-frame normal (axis, across, toward viewer)
            const cphi = Math.sqrt(Math.max(0, 1 - s * s)), kk = ddp / (r / sc);
            let na = -(slope + ddu), nv = s - kk * cphi, nz = cphi + kk * s;
            { const m = 1 / Math.sqrt(na * na + nv * nv + nz * nz); na *= m; nv *= m; nz *= m; }
            const nx = na * ca - nv * sa, ny = na * sa + nv * ca;
            const mt = MT[M[i0]] || MT[1];
            let ar = mt.c[0], ag = mt.c[1], ab = mt.c[2], metal = mt.metal, rough = mt.rough * roughMul, an = mt.aniso;

            // surface noise: tarnish, residue, annealing, grain
            const n1 = useN ? grid2(NG, NGU, clamp(u / gs, 0, NGU - 1.001), clamp(((ph + 1.5707963) * Rm) / gs, 0, NGP - 1.001)) : 0.5;
            if (grain > 0) {
              const g = 1 + grain * 0.12 * U.value(u * gF * 0.3, ph * (r / sc) * gF * 2.5, 0, 0, seed + 5);
              ar *= g; ag *= g; ab *= g;
            }
            const caseHere = hasCaseG && u <= CL;
            if (bottle && caseHere && anneal > 0 && M[i0] === caseMI) {
              const a = anneal * smoothstep(anA, anB, u) * (0.75 + 0.5 * (n1 - 0.5));
              const t = clamp(a) * 0.55;
              ar = ar * (1 - t) + 0.36 * t; ag = ag * (1 - t) + 0.25 * t; ab = ab * (1 - t) + 0.33 * t;
            }
            if (wear > 0) {
              const w = clamp(wear * 1.2 * smoothstep(0.38, 0.68, n1 + wear * 0.2)) * 0.85;
              ar = lerp(ar, ar * 0.55 + 0.05, w); ag = lerp(ag, ag * 0.48 + 0.04, w); ab = lerp(ab, ab * 0.38 + 0.03, w);
              rough += w * 0.35; an *= 1 - w;
            }
            if (spent && caseHere && residue > 0) {
              const z0 = smoothstep(CL - resZone, CL, u), z = z0 * Math.sqrt(z0);
              const t = clamp(residue * z * (0.6 + 1.1 * (n1 - 0.5))) * 0.92;
              ar = lerp(ar, 0.11, t); ag = lerp(ag, 0.095, t); ab = lerp(ab, 0.08, t);
              metal *= 1 - t; rough = lerp(rough, 0.8, t); an *= 1 - t;
            }
            rough = clamp(rough, 0.05, 1);
            const ao = lerp(1, AO[i0], 0.85);
            const ndl = nx * Lx + ny * Ly + nz * Lz;

            if (style === 'flat') {
              const hl = spk > 0 && ndl > 0.93 ? 0.28 * Math.min(1, spk) : 0;
              cr = lerp(ar, 1, hl); cg = lerp(ag, 1, hl); cb = lerp(ab, 1, hl);
            } else {
              // anisotropic normal for the highlight: drop part of the along-axis component
              const ak = style === 'real' ? anS * an * 0.85 * na : 0;
              let sx = nx - ak * ca, sy = ny - ak * sa, sz = nz;
              { const m = 1 / Math.sqrt(sx * sx + sy * sy + sz * sz); sx *= m; sy *= m; sz *= m; }
              const nh = Math.max(0, sx * Hx + sy * Hy + sz * Hz);
              const ex = Math.pow(2, 1.5 + 9 * (1 - rough));
              let spec = Math.pow(nh, ex) * (0.15 + 1.6 * (1 - rough) * (1 - rough));
              const sid = Math.min(NS - 1, Math.max(0, ((ph / Math.PI + 0.5) * (NS - 1)) | 0));
              if (style === 'real') spec *= Math.max(0, 1 + anS * an * 1.4 * streak[sid]);
              const rim = rimL > 0 ? rimL * Math.pow(1 - Math.max(0, nz), 2.5) : 0;
              if (style === 'toon') {
                const band = ndl > 0.45 ? 1 : ndl > 0.0 ? 0.74 : 0.52;
                const lit = band * (0.8 + 0.2 * amb) * ao;
                const hs = spec * spk > 0.3 ? 0.55 : 0;
                const sm = metal > 0.5 ? 0.5 : 0.85;
                cr = ar * lit + hs * lerp(1, ar, 1 - sm); cg = ag * lit + hs * lerp(1, ag, 1 - sm); cb = ab * lit + hs * lerp(1, ab, 1 - sm);
                const rh = rim > 0.18 ? rimL * 0.7 : 0;
                cr += rimC[0] * rh; cg += rimC[1] * rh; cb += rimC[2] * rh;
              } else {
                const diff = Math.max(0, (ndl + 0.15) / 1.15);
                // studio environment: reflect the view vector, compare with the light direction in the image
                const rx = 2 * sz * sx, ry = 2 * sz * sy, e2 = rx * l2x + ry * l2y;
                const env = 0.03 + 0.97 * smoothstep(0.02 - rough * 0.4, 0.7 + rough * 0.2, e2) + 0.35 * smoothstep(-0.5, -0.97, e2);
                // metal: albedo-tinted reflections and highlight
                const kM = amb * 0.4 * ao + diff * 0.45 * ao + refl * env * 0.95, sTm = spk * spec * 1.5;
                const mr = ar * kM + sTm * (ar * 0.6 + 0.4), mg = ag * kM + sTm * (ag * 0.6 + 0.4), mb = ab * kM + sTm * (ab * 0.6 + 0.4);
                // dielectric (lacquer, paint, plastic): white highlight, fresnel reflection
                const f1 = 1 - Math.max(0, nz), f2 = f1 * f1, fr = 0.04 + 0.96 * f2 * f2 * f1, kd = amb * ao + diff * 0.82 * ao;
                const wsp = spk * spec * 0.5 + refl * env * (fr * 0.7 + 0.04) * (1 - rough);
                cr = lerp(ar * kd + wsp, mr, metal); cg = lerp(ag * kd + wsp, mg, metal); cb = lerp(ab * kd + wsp, mb, metal);
                cr += rimC[0] * rim; cg += rimC[1] * rim; cb += rimC[2] * rim;
              }
            }
          } else if (heightOut) continue;

          // composite the shape over its outline
          const A = Math.max(cov, covO), wO = A - cov;
          d[o] = clamp((cr * cov + (oc[0] / 255) * wO) / A) * 255;
          d[o + 1] = clamp((cg * cov + (oc[1] / 255) * wO) / A) * 255;
          d[o + 2] = clamp((cb * cov + (oc[2] / 255) * wO) / A) * 255;
          d[o + 3] = Math.round(A * 255);
        }
      }
      put();
    },
  });
})();
