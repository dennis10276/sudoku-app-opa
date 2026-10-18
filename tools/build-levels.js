// Builds puzzles.js: every puzzle as one ordered list of levels, from easiest to hardest.
// node tools/build-levels.js
// Sources: tools/data/generated*.js and tools/data/extra.txt (own generator) and tools/data/collection.txt (free CC0 collection).
const fs = require('fs'), path = require('path');
const C = require('../core.js');
const here = f => path.join(__dirname, f);

// ---------- gather ----------
const src = [];
for (const f of ['data/generated.js', 'data/generated2.js']) {
  const gen = {}; new Function('out', fs.readFileSync(here(f), 'utf8').replace('const PUZZLES', 'out.P'))(gen);
  for (const s of Object.values(gen.P)) for (let i = 0; i < s.length; i += 81) src.push(s.substr(i, 81));
}
for (const line of fs.readFileSync(here('data/collection.txt'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([0-9.]{81}),/); if (m) src.push(m[1].replace(/\./g, '0'));
}
for (const line of fs.readFileSync(here('data/extra.txt'), 'utf8').split(/\r?\n/)) if (/^\d{81}$/.test(line)) src.push(line);
const uniq = [...new Set(src)];

// ---------- measure ----------
// For singles-solvable puzzles, how much choice is there at each step? Few options = harder to spot.
function singlesProfile(grid) {
  const st = C.makeState(grid);
  let steps = 0, tight = 0, hiddenOnly = 0, sumAvail = 0;
  for (;;) {
    const open = st.v.filter(v => !v).length; if (!open) break;
    const can = new Set(); let naked = 0;
    for (let i = 0; i < 81; i++) if (!st.v[i] && C.POP[st.c[i]] === 1) { can.add(i); naked++; }
    for (let u = 0; u < 27; u++) for (let d = 1; d <= 9; d++) {
      const b = C.BIT(d); let pos = -1, n = 0, done = false;
      for (const j of C.UNITS[u]) { if (st.v[j] === d) { done = true; break; } if (!st.v[j] && (st.c[j] & b)) { n++; pos = j; } }
      if (!done && n === 1) can.add(pos);
    }
    if (!can.size) return null;
    steps++; sumAvail += can.size; if (can.size <= 2) tight++; if (!naked) hiddenOnly++;
    const s = C.stepSingles(st); C.place(st, s.cell, s.digit);
  }
  return { avg: sumAvail / steps, tight, hiddenOnly };
}
const items = [];
for (const p of uniq) {
  const g = p.split('').map(Number);
  if (C.solve(g, 2).count !== 1) throw new Error('not unique: ' + p);
  const r = C.rate(g);
  const clues = g.filter(Boolean).length;
  let tier = r.level === 1 ? 1 : r.level === 2 ? 2 : r.level <= 4 ? 3 : (r.chains >= 3 || r.chainMax > 2 || r.level === 6) ? 5 : 4;
  let score, opts = null;
  if (tier === 1) { const sp = singlesProfile(g); opts = sp.avg; score = (45 - clues) * 1.0 + sp.tight * 0.35 + sp.hiddenOnly * 0.25 - sp.avg * 0.6; }
  else score = (45 - clues) + (r.chains || 0) * 2 + (r.level === 4 ? 8 : 0);   // inside the expert tier: X-wing/triples before XY-wings
  items.push({ p, tier, clues, score, opts, band: null });
}
const by = t => items.filter(x => x.tier === t).sort((a, b) => a.score - b.score);
const t1 = by(1), t2 = by(2), t3 = by(3), t4 = by(4), t5 = by(5);
console.log('pool', { singles: t1.length, pairs: t2.length, expert: t3.length, master: t4.length, extreme: t5.length });

// ---------- levels 1–1000 ----------
// Levels 1–1000 need only "one place / one number".
// Levels 1–EASY: made from collection puzzles by filling in numbers from the solution (more givens, still one
// solution). Level 1 has 25 empty squares, nearly all fillable straight away; a few more each level, up to where
// the collection's easiest puzzles start (~35 empty).
// Levels EASY+1–1000: the collection's singles puzzles in their gentle order (mostly fewer givens step by step),
// spread evenly so that level 1000 ends where you can fill about 6 squares at any moment.
const EASY = 150, EMPTY_FROM = 25, FIRST = 1000, UPTO = 2350;   // UPTO: how far into the singles list level 1000 reaches
const pick = new Set();
for (let k = EASY + 1; k <= FIRST; k++) pick.add(Math.round((k - EASY - 1) * (UPTO - 1) / (FIRST - EASY - 1)));
const fromList = [...pick].sort((a, b) => a - b).map(i => t1[i]);
if (fromList.length !== FIRST - EASY) throw new Error('pick');
const donors = t1.slice(0, UPTO).filter((x, i) => !pick.has(i));
const harder = t1.slice(UPTO);                                       // still singles, harder than level 1000
const EMPTY_TO = 81 - fromList[0].clues;
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const made = [];
for (let k = 1; k <= EASY; k++) {
  const d = donors.shift(); if (!d) throw new Error('not enough donor puzzles');
  const g = d.p.split('').map(Number), sol = C.solve(g, 2).solution;
  const empty = []; for (let i = 0; i < 81; i++) if (!g[i]) empty.push(i);
  for (let i = empty.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [empty[i], empty[j]] = [empty[j], empty[i]]; }
  const want = Math.min(empty.length, Math.round(EMPTY_FROM + (EMPTY_TO - EMPTY_FROM) * (k - 1) / (EASY - 1)));
  while (empty.length > want) { const i = empty.pop(); g[i] = sol[i]; }
  made.push({ p: g.join(''), tier: 1, clues: 81 - want, score: 0, band: null, made: true });
}
const chosen = made.concat(fromList);
console.log('levels 1-' + FIRST + ':', EASY, 'made easier,', FIRST - EASY, 'from the collection;', harder.length, 'harder singles left');
for (const k of [1, 50, 100, 150, 151, 200, 300, 500, 750, 1000]) {
  const g = chosen[k - 1].p.split('').map(Number);
  console.log('  level', k, 'empty', 81 - chosen[k - 1].clues, 'fillable at once', singlesProfile(g).avg.toFixed(1));
}

// ---------- order ----------
// One gentle line from easiest to hardest. Tiers follow each other, but every change of tier is a long
// crossfade: over L levels the share of the next kind of puzzle rises evenly from 0% to 100%, while the
// hardest puzzles of the easier tier are used up. Each tier is consumed easiest-first.
const tiers = [chosen.concat(harder), t2, t3, t4, t5];
const n = tiers.map(t => t.length), L = [0, 0, 0, 0];
L[3] = Math.min(n[3], 2 * n[4]);
L[2] = Math.min(2 * n[3] - L[3], n[2]);
L[1] = Math.min(2 * n[2] - L[2], n[1]);
const SKIP = 0;
// the first puzzle that needs a pair is level 1001
const FIRST_PAIR = FIRST + 1;
function order(L) {
  const levels = [];
  const pos = tiers.map(() => 0);
  const take = t => levels.push(tiers[t][pos[t]++]);
  for (let t = 0; t < 5; t++) {
    // this tier alone
    const alone = n[t] - (t ? L[t - 1] / 2 : 0) - (t < 4 ? L[t] / 2 : 0);
    for (let k = 0; k < Math.round(alone); k++) if (pos[t] < n[t]) take(t);
    if (t === 4) break;
    // crossfade to the next tier
    let usedNext = 0;
    for (let j = 0; j < L[t]; j++) {
      const want = Math.round((j + 1) * (j + 1) / (2 * L[t]));   // area under a straight 0→1 ramp
      if (usedNext < want && pos[t + 1] < n[t + 1]) { take(t + 1); usedNext++; }
      else if (pos[t] < n[t]) take(t); else { take(t + 1); usedNext++; }
    }
    while (pos[t] < n[t]) take(t);               // rounding leftovers
  }
  for (let t = 0; t < 5; t++) while (pos[t] < n[t]) take(t);
  return levels;
}
// the longest (gentlest) crossfade into pairs that still keeps the first pair at FIRST_PAIR or later
const firstPair = lv => lv.findIndex(x => x.tier > 1) + 1 - SKIP;
for (L[0] = Math.min(2 * n[1] - L[1], 1000); L[0] > 2 && firstPair(order(L)) < FIRST_PAIR; L[0]--);
console.log('crossfades', L);
const levels = order(L);
levels.splice(0, SKIP);
console.log('first pair at level', levels.findIndex(x => x.tier > 1) + 1);
levels.forEach((x, k) => { x.band = x.tier === 1 ? 'm' : 'hxMX'[x.tier - 2]; });
console.log('levels', levels.length);
for (let a = 1; a <= levels.length; a += 100) {
  const s = levels.slice(a - 1, a + 99);
  const t = [1, 2, 3, 4, 5].map(k => s.filter(x => x.tier === k).length);
  console.log(`${a}-${a + s.length - 1}: clues ${(s.reduce((n, x) => n + x.clues, 0) / s.length).toFixed(1)}  tiers ${t.join('/')}`);
}

// ---------- write ----------
const enc = list => list.map(x => x.p + x.band).join('');
const out = `/* Generated by tools/build-levels.js. Levels from easiest to hardest; every entry is 81 digits
   (0 = empty) plus one letter for the family overview: m medium, h hard, x expert, M master, X extreme. */
const LEVEL_DATA = '${enc(levels)}';
`;
fs.writeFileSync(path.join(__dirname, '..', 'puzzles.js'), out);
console.log('wrote puzzles.js', out.length, 'bytes');
