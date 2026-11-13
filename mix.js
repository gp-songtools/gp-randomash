/* Randomash mix logic: genre catalogue helpers, pair clash scores, Surprise me,
   and the Lyria prompt template. No DOM access, so the same file runs in the
   browser (as a classic script, exposing window.Mix) and in Node (require). */
(function (root) {
  'use strict';

  const MOODS = ['melancholic', 'euphoric', 'tense', 'dreamy', 'nostalgic', 'aggressive', 'playful', 'sensual',
    'cinematic', 'hopeful', 'mysterious', 'triumphant', 'serene', 'gritty', 'bittersweet', 'hypnotic'];

  const KEY_FEELS = {
    major: 'in a bright major key',
    minor: 'in a minor key',
    modal: 'with modal harmony',
    ambiguous: 'with harmonically ambiguous chords'
  };

  /* Key roots. `ui` is the menu label; `major` / `minor` are the conventional spellings for that
     scale, written out in words for the English-only prompt. Modal and ambiguous use `major`. */
  const KEY_ROOTS = [
    { id: 'C',  ui: 'C',     major: 'C',       minor: 'C' },
    { id: 'Db', ui: 'C♯/D♭', major: 'D-flat',  minor: 'C-sharp' },
    { id: 'D',  ui: 'D',     major: 'D',       minor: 'D' },
    { id: 'Eb', ui: 'D♯/E♭', major: 'E-flat',  minor: 'E-flat' },
    { id: 'E',  ui: 'E',     major: 'E',       minor: 'E' },
    { id: 'F',  ui: 'F',     major: 'F',       minor: 'F' },
    { id: 'Gb', ui: 'F♯/G♭', major: 'F-sharp', minor: 'F-sharp' },
    { id: 'G',  ui: 'G',     major: 'G',       minor: 'G' },
    { id: 'Ab', ui: 'G♯/A♭', major: 'A-flat',  minor: 'G-sharp' },
    { id: 'A',  ui: 'A',     major: 'A',       minor: 'A' },
    { id: 'Bb', ui: 'A♯/B♭', major: 'B-flat',  minor: 'B-flat' },
    { id: 'B',  ui: 'B',     major: 'B',       minor: 'B' }
  ];
  const rootById = id => KEY_ROOTS.find(r => r.id === id);

  /* The seven modes, brightest to darkest, each with a one-word mood for the menu.
     `minorish` modes (flat third) use the minor spelling of the root, e.g. C-sharp Dorian. */
  const MODES = [
    { id: 'lydian',     name: 'Lydian',     mood: 'dreamy',      minorish: false },
    { id: 'ionian',     name: 'Ionian',     mood: 'bright',      minorish: false },
    { id: 'mixolydian', name: 'Mixolydian', mood: 'bluesy',      minorish: false },
    { id: 'dorian',     name: 'Dorian',     mood: 'soulful',     minorish: true },
    { id: 'aeolian',    name: 'Aeolian',    mood: 'melancholic', minorish: true },
    { id: 'phrygian',   name: 'Phrygian',   mood: 'tense',       minorish: true },
    { id: 'locrian',    name: 'Locrian',    mood: 'unstable',    minorish: true }
  ];
  const modeById = id => MODES.find(m => m.id === id);

  // Short label for history, e.g. "G♯/A♭ major", "D Dorian", "Dorian", "" when nothing specific.
  function keyLabel(key, root, mode) {
    const r = rootById(root), m = key === 'modal' && modeById(mode);
    if (m) return (r ? r.ui + ' ' : '') + m.name;
    return r ? r.ui + ' ' + key : '';
  }

  /* Key clause: feel alone when no root is chosen (Lyria picks the key), otherwise feel + root.
     With Modal, a chosen mode is named ("in D Dorian mode" / "in the Dorian mode"). */
  function keyClause(key, root, mode) {
    const r = rootById(root), m = key === 'modal' && modeById(mode);
    if (m) return r ? `in ${m.minorish ? r.minor : r.major} ${m.name} mode` : `in the ${m.name} mode`;
    if (!r) return KEY_FEELS[key] || KEY_FEELS.minor;
    if (key === 'major') return 'in ' + r.major + ' major';
    if (key === 'modal') return 'with modal harmony centered on ' + r.major;
    if (key === 'ambiguous') return 'with harmonically ambiguous chords centered on ' + r.major;
    return 'in ' + r.minor + ' minor';
  }

  const ARRANGEMENTS = {
    none: '',
    buildup: 'with a gradual build-up',
    drop: 'building to a big drop',
    stripped: 'stripped-down arrangement',
    loop: 'loop-friendly structure with a steady groove'
  };

  // Stem roles for "stems by separate generations". Each replaces the instrument list.
  const STEM_ROLES = [
    { id: 'drums', label: 'Drums', text: 'drums and percussion only, no bass, no chords, no melody' },
    { id: 'bass', label: 'Bass', text: 'bassline only, no drums, no chords, no melody' },
    { id: 'chords', label: 'Chords and pads', text: 'chords and pads only, no drums, no bass, no lead melody' },
    { id: 'melody', label: 'Melody', text: 'lead melody only, no drums, no bass, no chords' }
  ];

  const energyWord = e => e < 20 ? 'low' : e < 40 ? 'medium-low' : e < 60 ? 'medium' : e < 80 ? 'medium-high' : 'high';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  // Flatten the catalogue into an id -> genre map with family attached.
  function index(catalogue) {
    const byId = {}, list = [], near = {};
    for (const f of catalogue.families) {
      near[f.id] = f.near || [];
      for (const g of f.genres) {
        const x = Object.assign({ family: f.id, familyName: f.name }, g);
        byId[g.id] = x; list.push(x);
      }
    }
    NEAR = near;
    return { byId, list, near, families: catalogue.families };
  }

  // Family distance: same 0, neighbours (listed either way round) 0.5, otherwise 1.
  let NEAR = {};
  function famDist(a, b) {
    if (a.family === b.family) return 0;
    return ((NEAR[a.family] || []).includes(b.family) || (NEAR[b.family] || []).includes(a.family)) ? 0.5 : 1;
  }

  // Distance between two BPM ranges, allowing half/double-time compatibility. 0 = overlapping.
  function bpmGap(a, b) {
    const gap = (r, s) => Math.max(0, Math.max(r[0], s[0]) - Math.min(r[1], s[1]));
    const half = r => [r[0] / 2, r[1] / 2], dbl = r => [r[0] * 2, r[1] * 2];
    const direct = gap(a.bpm, b.bpm);
    const folded = Math.min(gap(half(a.bpm), b.bpm), gap(dbl(a.bpm), b.bpm)) + 6; // folding costs a little
    return clamp(Math.min(direct, folded) / 50, 0, 1);
  }

  /* Pair clash, 0..1. Mostly "how far apart are these two worlds", lifted by how
     assertive each genre is on its own. Tuned so that same-family pairs land
     roughly 0.1-0.4, neighbouring families 0.3-0.6, distant families 0.45-0.9. */
  let K = [1.2, 0.5, 0.22];
  function pairClash(a, b) {
    if (a.id === b.id) return 0;
    const dist = 0.30 * famDist(a, b)
      + 0.25 * bpmGap(a, b)
      + 0.20 * Math.abs(a.energy - b.energy)
      + 0.25 * Math.abs(a.acoustic - b.acoustic);
    return +clamp(K[0] * dist + K[1] * (a.clash + b.clash) / 2 - K[2], 0, 1).toFixed(3);
  }

  function mixClash(gs) {
    if (gs.length < 2) return 0;
    let s = 0, n = 0;
    for (let i = 0; i < gs.length; i++) for (let j = i + 1; j < gs.length; j++) { s += pairClash(gs[i], gs[j]); n++; }
    return +(s / n).toFixed(3);
  }

  // Weight for a clash score: full inside 0.4-0.7, tapering outside.
  function clashWeight(c) {
    if (c >= 0.4 && c <= 0.7) return 1;
    const d = c < 0.4 ? 0.4 - c : c - 0.7;
    return Math.exp(-(d * d) / (2 * 0.06 * 0.06)) * 0.6 + 0.02;
  }

  // Small seeded PRNG so Surprise me runs can be reproduced in tests.
  function rng(seed) {
    let t = (seed >>> 0) || 1;
    return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  }

  function pickWeighted(items, weights, rand) {
    const total = weights.reduce((a, b) => a + b, 0);
    let x = rand() * total;
    for (let i = 0; i < items.length; i++) { x -= weights[i]; if (x <= 0) return items[i]; }
    return items[items.length - 1];
  }

  /* Surprise me: pick a primary uniformly, then 1-2 partners weighted by clash.
     For a third genre the weight uses the average clash with both picks. */
  function surprise(idx, rand) {
    rand = rand || Math.random;
    const all = idx.list;
    const n = rand() < 0.5 ? 2 : 3;
    const picks = [all[Math.floor(rand() * all.length)]];
    while (picks.length < n) {
      const cands = all.filter(g => !picks.includes(g));
      const w = cands.map(g => clashWeight(mixClash(picks.concat(g))));
      picks.push(pickWeighted(cands, w, rand));
    }
    return picks.map(g => g.id);
  }

  function defaultTempo(g) { return Math.round((g.bpm[0] + g.bpm[1]) / 2); }

  // Pick instruments: 2 from the primary, 1 from each secondary (up to 5 total), no duplicates.
  function instrumentsFor(gs) {
    const out = [];
    const add = s => { if (s && !out.includes(s) && out.length < 5) out.push(s); };
    if (gs[0]) { add(gs[0].instruments[0]); add(gs[0].instruments[1]); }
    for (const g of gs.slice(1)) add(g.instruments[0]);
    if (gs.length === 1) add(gs[0].instruments[2]);
    return out;
  }

  const joinList = xs => xs.length <= 1 ? (xs[0] || '') : xs.length === 2 ? xs[0] + ' and ' + xs[1] : xs.slice(0, -1).join(', ') + ', and ' + xs[xs.length - 1];

  /* The prompt template:
     "{mood} {primary} track blended with {secondary} elements, {tempo} BPM, {energy} energy,
      {key feel}, featuring {instruments}, {arrangement}, instrumental, {length}, clean stereo mix."
     {length} is s.lengthText ("30 seconds" for clips, a full-song phrase for songs).
     Empty parts are dropped. `role` (a STEM_ROLES entry) swaps the instrument clause. */
  function composePrompt(idx, s, role) {
    const gs = (s.genres || []).map(id => idx.byId[id]).filter(Boolean);
    if (!gs.length) return '';
    const head = cap(s.mood || 'cinematic') + ' ' + gs[0].name + ' track'
      + (gs.length > 1 ? ' blended with ' + joinList(gs.slice(1).map(g => g.name)) + ' elements' : '');
    const parts = [head,
      Math.round(s.tempo) + ' BPM',
      energyWord(s.energy) + ' energy',
      keyClause(s.key, s.root, s.mode),
      role ? role.text : 'featuring ' + joinList(instrumentsFor(gs)),
      ARRANGEMENTS[s.arrangement] || '',
      'instrumental', s.lengthText || '30 seconds', 'clean stereo mix'];
    return parts.filter(Boolean).join(', ') + '.';
  }

  // Role prompt derived from an edited main prompt: replace the "featuring ..." clause if present.
  function rolePromptFrom(prompt, role) {
    // The instrument list itself contains commas, so cut up to the next clause the template adds after it.
    const re = /featuring .*?(?=, (?:with a gradual|building to|stripped-down|loop-friendly|instrumental)\b|\.\s*$)/i;
    if (re.test(prompt)) return prompt.replace(re, role.text);
    return prompt.replace(/\.\s*$/, '') + ', ' + role.text + '.';
  }

  function slug(s, max) {
    return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max || 48).replace(/-+$/, '') || 'mix';
  }

  const api = { MOODS, KEY_FEELS, KEY_ROOTS, MODES, keyClause, keyLabel, ARRANGEMENTS, STEM_ROLES, energyWord, index, bpmGap, pairClash, mixClash,
    clashWeight, setK: k => { K = k; }, rng, surprise, defaultTempo, instrumentsFor, composePrompt, rolePromptFrom, slug };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Mix = api;
})(typeof self !== 'undefined' ? self : this);
