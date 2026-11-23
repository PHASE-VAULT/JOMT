/* Generator search: fuzzy matching over a generator's name (English and the current language), tags,
   description, use cases and hidden keywords (synonyms, things it can make, common misspellings).
   U.searchGen(gen, query) -> score (0 = no match). Every word of the query has to match something:
   exact word > word prefix ("plane" → planet) > substring > a typo-tolerant match (edit distance). */
(function () {
  'use strict';
  const U = window.UGTG;

  // hidden keywords per generator id: synonyms, uses, related objects (English; translations are searched too)
  U.KEYWORDS = {
    alien: 'artifact alien scifi sci-fi detail tech greeble panel ancient relic glyph',
    'blood-pool': 'blood pool puddle liquid gore horror decal wet',
    border: 'ui frame border panel window box outline hud menu',
    bricks: 'brick tiles wall masonry mortar ceramic tile floor bathroom kitchen',
    bullet: 'bullet round ammo cartridge shell casing brass weapon gun',
    button: 'ui button gui menu hud click',
    'camera-ui': 'camera overlay rec record recording camcorder bodycam cctv security drone viewfinder battery timecode hud ui',
    camo: 'camo camouflage military army pattern woodland digital desert',
    clouds: 'cloud clouds sky weather cumulus fog smoke',
    cobblestone: 'cobblestone cobbles stone street road pavement medieval',
    cookie: 'light cookie gobo spotlight projector shadow window lighting',
    crosshair: 'crosshair reticle aim cursor fps shooter sight',
    cursor: 'cursor mouse pointer arrow ui hand',
    'damage-vignette': 'damage vignette blood screen hurt hit pain overlay hud',
    debris: 'debris rubble shards broken glass shattered fragments rocks',
    dirt: 'dirt soil earth ground mud terrain',
    fence: 'fence chain link wire mesh picket lattice grid cage',
    flowfield: 'flowfield flow field vector lines streamlines pattern generative',
    gradient: 'gradient ramp color fade lut',
    graffiti: 'graffiti spray paint tag street art wall writing blood writing',
    grassCard: 'grass billboard card foliage vegetation plant alpha',
    treeImpostor: 'tree impostor billboard lod octahedral atlas forest foliage vegetation pine palm oak bush shrub',
    grass: 'grass lawn turf meadow field vegetation ground',
    gravel: 'gravel pebbles stones ground path rocks',
    grime: 'grime grunge dirt dirty overlay wear stain',
    healthbar: 'health bar hp progress bar loading ui hud meter stamina',
    hitmarker: 'hitmarker hit marker cross ui hud shooter',
    'ice-snow': 'ice snow frost frozen winter cold',
    impact: 'bullet impact hole decal crack hit damage',
    insect: 'insect insects bug bugs spider beetle fly ant cockroach butterfly sprite',
    leaves: 'leaves leaf branch branches twig foliage tree bush card cutout alpha needles pine spruce fir conifer fern frond palm ivy vine blossom berries bamboo twigs crown hedge',
    lensflare: 'lens flare sun glare bloom light',
    lightCone: 'light cone beam lamp spotlight volumetric glow',
    lightning: 'lightning bolt electric thunder storm spark',
    loader: 'loader loading spinner icon progress busy',
    maggots: 'maggots worms larvae horror gore bugs',
    mapgrid: 'map grid tactical coordinates military chart',
    marker: 'marker waypoint objective pin icon hud map',
    mask: 'mask overlay visor goggles binoculars helmet',
    bark: 'bark tree trunk wood log oak birch pine beech maple cherry palm redwood eucalyptus plane forest',
    material: 'wood marble rust material grain stone timber',
    polymer: 'polymer plastic rubber hard rubber pvc abs nylon kydex tpe gun grip frame stock handguard magazine mag holster rail cover recoil pad stipple stippling checkering knurl carbon fiber gear attachment furniture fde coyote',
    'metal-surface':'metal steel iron aluminium aluminum copper brass gold chrome brushed scratched rust patina sheet plate gunmetal gun weapon blued parkerized cerakote',
    moss: 'moss lichen green plant ground cover forest',
    mud: 'mud dirt soil wet ground earth puddle',
    flashFront: 'muzzle flash gun fire shot weapon front',
    flashSide: 'muzzle flash gun fire shot weapon side',
    noise: 'noise perlin worley fractal procedural cloud random',
    organ: 'heart organ health love anatomy',
    particle: 'particle sprite spark dust glow vfx effect',
    pattern: 'pattern dots stripes checker hexagon geometric tile repeat',
    paving: 'paving pavement sidewalk street tiles slabs road',
    planet: 'planet earth world globe moon mars space sphere star',
    planks: 'planks wood floor boards parquet timber deck',
    plaster: 'plaster concrete wall cement stucco',
    radialbar: 'radial bar circular progress ring gauge cooldown ui hud',
    rainbow: 'rainbow arc colors sky spectrum',
    redDot: 'red dot sight reticle holo optic aim',
    refraction: 'glass refraction normal distortion frosted window diffraction',
    rock: 'rock cliff stone boulder mountain granite',
    rotor: 'rotor blur helicopter propeller fan blades',
    'rubber-floor': 'rubber pvc vinyl floor gym linoleum',
    sand: 'sand beach desert dunes',
    scope: 'scope sniper rifle zoom optic reticle',
    scratches: 'scratches scratch wear damage scuff',
    shapebar: 'shape bar progress segmented health ui hud',
    shape: 'shape circle square polygon star ui icon',
    skyline: 'skyline city town buildings skyscraper urban background impostor horizon',
    solar: 'solar panel cells photovoltaic energy',
    splatter: 'splatter blood paint splash decal gore',
    symbol: 'symbol geometric sigil rune icon occult sign',
    tankReticle: 'tank reticle sight gunner military crosshair',
    'ui-background': 'ui background panel menu backdrop',
    vignette: 'vignette screen darken edges overlay',
    visor: 'visor crack cracked helmet glass broken screen',
    'water-normal': 'water normal waves ocean sea lake ripples river pool',
    'weapon-skin': 'weapon skin gun camo arcade pattern',
    // new generators
    fireSheet: 'fire flame flames burning campfire torch blaze inferno tilesheet animation vfx',
    smokeSheet: 'smoke puff steam vapor fog dust cloud tilesheet animation vfx',
    flyer: 'bird birds bat bats flock crow seagull gull swallow hawk flying animal particle tilesheet',
    mountains: 'mountain mountains range hills peaks alps landscape background impostor horizon terrain',
    aircraft: 'plane airplane aeroplane jet aircraft airliner fighter bomber military civilian sky billboard impostor',
    'blood-ui': 'blood stain ui menu horror smear splat drip blur',
    'proto-grid': 'prototype grid greybox graybox blockout level design dev developer texture checker debug layout',
    footprints: 'footprint footprints tracks trail paw boot shoe foot animal human prints steps',
    cobweb: 'cobweb spider web spiderweb webs cobwebs halloween corner haunted',
  };

  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const words = (s) => norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  // edit distance with early exit (small strings only)
  function dist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < best) best = cur[j];
      }
      if (best > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  // best match of one query word against a list of words, with a field weight
  function wordScore(q, list, weight, typos) {
    let best = 0;
    const tol = !typos ? 0 : q.length >= 7 ? 2 : q.length >= 4 ? 1 : 0;
    for (const w of list) {
      let s = 0;
      if (w === q) s = 1;
      else if (w.startsWith(q)) s = 0.85;
      else if (q.length >= 3 && w.includes(q)) s = 0.6;
      else if (tol) {
        // typo: compare with the word, or with its start when the query is a prefix with a typo ("eart", "plnet")
        const d = Math.min(dist(q, w, tol), w.length > q.length ? dist(q, w.slice(0, q.length), tol) : tol + 1);
        if (d <= tol) s = 0.45 - d * 0.1;
      }
      if (s > best) best = s;
      if (best === 1) break;
    }
    return best * weight;
  }

  const cache = new Map(); // gen id + language -> fields
  function fields(gen) {
    const key = gen.id + ':' + U.lang();
    let f = cache.get(key);
    if (!f) {
      const name = gen.name + ' ' + U.t(gen.name);
      // [words, weight, typo-tolerant]; the long texts only match exactly / by prefix / substring
      f = [
        [words(name + ' ' + gen.id.replace(/([a-z])([A-Z])/g, '$1 $2')), 3, true],
        [words((gen.tags || []).join(' ') + ' ' + (gen.tags || []).map((t) => U.t(t)).join(' ')), 2, true],
        [words(U.KEYWORDS[gen.id] || ''), 2.2, true],
        [words(gen.desc + ' ' + U.t(gen.desc) + ' ' + (gen.uses || []).join(' ') + ' ' + (gen.uses || []).map((u) => U.t(u)).join(' ')), 1, false],
      ];
      cache.set(key, f);
    }
    return f;
  }

  U.searchGen = (gen, query) => {
    const qs = words(query);
    if (!qs.length) return 1;
    let total = 0;
    for (const q of qs) {
      let best = 0;
      for (const [list, w, typos] of fields(gen)) best = Math.max(best, wordScore(q, list, w, typos));
      if (best <= 0) return 0; // every word has to match something
      total += best;
    }
    return total;
  };
})();
