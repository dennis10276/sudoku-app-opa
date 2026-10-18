/* Sudoku voor opa – klassieke sudoku zonder reclame, met levels en punten. */
(() => {
'use strict';
const C = window.SudokuCore;
const playTracking = window.SudokuTracking;
const $ = id => document.getElementById(id);
const LS = { set: 'sudoku.settings', main: 'sudoku.game', daily: 'sudoku.dailyGames', done: 'sudoku.dailyDone', prog: 'sudoku.progress' };
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

const DEF = {
  sound: true, autoCheck: true, mistakeLimit: true, showTime: false,
  hlDup: true, hlArea: true, hlSame: true, autoNotes: true, hideUsed: true,
  theme: 'licht', size: 'normaal',
};
const S = Object.assign({}, DEF, load(LS.set, {}));
if (!(S.v >= 2)) { S.showTime = false; S.v = 2; store(LS.set, S); }   // levels update: timer off by default
const saveSettings = () => store(LS.set, S);

/* ================= helpers ================= */
function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function shuffle(a, rnd) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function fmtTime(s) {
  s = Math.max(0, s | 0);
  const h = (s / 3600) | 0, m = ((s % 3600) / 60) | 0, x = s % 60;
  const p = n => String(n).padStart(2, '0');
  return h ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
}
const fmtNum = n => Math.round(n || 0).toLocaleString('nl-NL');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAY_FMT = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
const MONTH_FMT = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const keyDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => dateKey(new Date());
const later = (fn, ms) => setTimeout(fn, ms);

/* ================= levels ================= */
// puzzles.js holds every puzzle as one list of levels, from easiest to hardest, rising very slowly.
// The letter after each puzzle only feeds the family overview; opa only ever sees his level number.
const BANDS = { e: 'easy', m: 'medium', h: 'hard', x: 'expert', M: 'master', X: 'extreme' };
const LEVEL_COUNT = LEVEL_DATA.length / 82;
const REPEAT_SPAN = Math.min(1000, LEVEL_COUNT);   // after the last level: the hardest ones again, rearranged
const MEDAL_EVERY = 50;
// Relabel digits, swap rows/columns inside bands, swap bands, maybe mirror: same puzzle, new look.
function transform(g, rnd) {
  const dm = [0].concat(shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd));
  const order = () => { const o = []; for (const b of shuffle([0, 1, 2], rnd)) for (const r of shuffle([0, 1, 2], rnd)) o.push(b * 3 + r); return o; };
  const ro = order(), co = order(), tr = rnd() < .5, out = new Array(81);
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) out[tr ? c * 9 + r : r * 9 + c] = dm[g[ro[r] * 9 + co[c]]];
  return out;
}
const entryAt = (data, k) => ({ puz: data.substr(k * 82, 81).split('').map(Number), letter: data[k * 82 + 81] });
function levelEntry(n) {
  if (n <= LEVEL_COUNT) { const e = entryAt(LEVEL_DATA, n - 1); return { puz: e.puz, band: BANDS[e.letter] || 'hard' }; }
  const e = entryAt(LEVEL_DATA, LEVEL_COUNT - REPEAT_SPAN + ((n - LEVEL_COUNT - 1) % REPEAT_SPAN));
  return { puz: transform(e.puz, mulberry(hashStr('level-' + n))), band: BANDS[e.letter] || 'extreme' };
}
const baseFor = n => 10 + Math.floor((Math.max(1, n) - 1) / 100);
// The daily challenge is a puzzle from around the player's own level, rearranged so it looks new.
function dailyEntry(key, playerLevel) {
  const h = hashStr('dag-' + key);
  const k = Math.max(0, Math.min(LEVEL_COUNT - 1, Math.min(playerLevel, LEVEL_COUNT) - 1 + (h % 41) - 20));
  const e = entryAt(LEVEL_DATA, k);
  return { puz: transform(e.puz, mulberry(h)), band: BANDS[e.letter] || 'easy' };
}

/* ================= state ================= */
let G = null;          // current game
let H = [];            // undo history
let sel = -1;          // selected cell
let notesMode = false;
let paused = false;
let screen = 'Home';
let returnTo = 'Home';

const P = Object.assign({ level: 1, best: {}, total: 0, fails: {}, wins: 0, bestWins: 0, played: 0 }, load(LS.prog, {}));
const saveProgress = () => store(LS.prog, P);
const dailyDone = load(LS.done, {});
const dailyGames = load(LS.daily, {});
const starsTotal = () => Object.values(P.best).reduce((n, b) => n + (b.t || 0), 0) + Object.values(dailyDone).reduce((n, d) => n + (d.stars || 0), 0);
const medals = () => Math.floor((P.level - 1) / MEDAL_EVERY);

function saveGame() {
  if (!G) return;
  G.sel = sel; G.notesMode = notesMode;
  const data = { G, H: H.slice(-300) };
  if (G.daily) {
    dailyGames[G.daily] = data;
    const keys = Object.keys(dailyGames).sort();
    while (keys.length > 12) delete dailyGames[keys.shift()];
    store(LS.daily, dailyGames);
  } else store(LS.main, data);
}
function savedMain() { const d = load(LS.main, null); return d && d.G && Array.isArray(d.G.val) ? d : null; }

// Fields used by the points system; older saved games get them on load.
function prepare(g) {
  if (!g.pts && !g.n && !g.daily) g.score = 0;   // a game from before the levels update starts counting points now
  if (!g.pts) g.pts = { num: 0, numPts: 0, streakPts: 0, units: 0, unitPts: 0, digits: 0, digitPts: 0 };
  if (g.streak == null) g.streak = 0;
  if (!g.run) g.run = [];
  if (!g.bestRun) g.bestRun = [];
  if (g.mtot == null) g.mtot = g.mistakes || 0;
  if (!g.base) g.base = g.n ? baseFor(g.n) : baseFor(P.level);
  if (!g.n && !g.daily) g.legacy = true;
  if (!g.unitDone) {
    g.unitDone = C.UNITS.map(u => u.every(j => g.val[j] === g.sol[j]) ? 1 : 0);
    g.digitDone = [0].concat([1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => g.val.filter((v, i) => v === d && g.sol[i] === d).length === 9 ? 1 : 0));
  }
  return g;
}

function newGame(n, daily = null) {
  endTracking('new_game');
  if (typeof n !== 'number' || !(n >= 1)) n = P.level;
  const e = daily ? dailyEntry(daily, P.level) : levelEntry(n);
  const sol = C.solve(e.puz, 1).solution;
  G = prepare({
    n: daily ? null : n, level: e.band, daily, puz: e.puz, sol, val: e.puz.slice(), notes: new Array(81).fill(0),
    playId: playTracking?.newRound(), base: baseFor(daily ? P.level : n),
    mistakes: 0, score: 0, time: 0, hints: 0, chances: 0,
    counted: false, won: false, lost: false,
    scored: new Array(81).fill(0), hinted: new Array(81).fill(0),
  });
  H = []; sel = -1; notesMode = false; paused = false;
  saveGame();
  openGame();
}
function resume(data) {
  endTracking('menu');
  G = prepare(data.G); H = data.H || []; sel = G.sel != null ? G.sel : -1; notesMode = !!G.notesMode; paused = false;
  openGame();
  if (G.lost) later(gameOverSheet, 250);
}
function restartGame() {
  endTracking('restart');
  G.playId = playTracking?.newRound();
  G.trackingStarted = false;
  G.val = G.puz.slice(); G.notes.fill(0); G.mistakes = 0; G.mtot = 0; G.score = 0; G.time = 0; G.hints = 0; G.chances = 0;
  G.won = false; G.lost = false; G.scored.fill(0); G.hinted.fill(0);
  G.pts = null; G.streak = 0; G.run = []; G.bestRun = []; G.unitDone = null; prepare(G);
  H = []; sel = -1; notesMode = false; paused = false;
  saveGame(); openGame();
}
// play a level: continue it if it is the one in progress
function playLevel(n) {
  const m = savedMain();
  if (G && !G.daily && G.n === n && !G.won) { openGame(); if (G.lost) later(gameOverSheet, 250); return; }
  if (m && m.G.n === n && !m.G.won) { resume(m); return; }
  newGame(n);
}

/* ================= board ================= */
const boardEl = $('board');
const popsEl = $('pops');
const cellEls = new Array(81);
(function buildBoard() {
  for (let b = 0; b < 9; b++) {
    const box = document.createElement('div'); box.className = 'box';
    for (let k = 0; k < 9; k++) {
      const r = ((b / 3) | 0) * 3 + ((k / 3) | 0), c = (b % 3) * 3 + (k % 3), i = r * 9 + c;
      const el = document.createElement('div'); el.className = 'cell'; el.dataset.i = i;
      el.innerHTML = '<span class="v"></span><div class="nt">' + '<i></i>'.repeat(9) + '</div>';
      el._v = el.firstChild; el._nt = el.lastChild; el._n = [...el._nt.children];
      cellEls[i] = el; box.appendChild(el);
    }
    boardEl.appendChild(box);
  }
})();
const pad = $('pad');
for (let d = 1; d <= 9; d++) {
  const b = document.createElement('button'); b.dataset.d = d; b.textContent = d; b.setAttribute('aria-label', 'Getal ' + d);
  pad.appendChild(b);
}

const isGiven = i => G.puz[i] !== 0;
const isLocked = i => isGiven(i) || (S.autoCheck && G.val[i] !== 0 && G.val[i] === G.sol[i]);
const isWrong = i => !isGiven(i) && G.val[i] !== 0 && G.val[i] !== G.sol[i];
const sees = (a, b) => C.ROW[a] === C.ROW[b] || C.COL[a] === C.COL[b] || C.BOX[a] === C.BOX[b];

function render() {
  if (!G) return;
  const sv = sel >= 0 ? G.val[sel] : 0;
  const dup = new Array(81).fill(false);
  if (S.hlDup) for (let i = 0; i < 81; i++) if (G.val[i]) for (const p of C.PEERS[i]) if (G.val[p] === G.val[i]) { dup[i] = true; break; }
  for (let i = 0; i < 81; i++) {
    const el = cellEls[i], v = G.val[i];
    let cls = 'cell';
    if (isGiven(i)) cls += ' given';
    else if (v && S.autoCheck && v !== G.sol[i]) cls += ' err';
    if (i === sel) cls += ' sel';
    else if (dup[i] && (sel < 0 || G.val[sel] === v || !isGiven(i) || dup[sel])) cls += ' dup';
    else if (sel >= 0 && S.hlSame && sv && v === sv) cls += ' same';
    else if (sel >= 0 && S.hlArea && sees(sel, i)) cls += ' rel';
    const keep = el.className.match(/ (pop|flash|hintcell|shake)/g);
    el.className = cls + (keep ? keep.join('') : '');
    const txt = v ? String(v) : '';
    if (el._v.textContent !== txt) el._v.textContent = txt;
    const n = v ? 0 : G.notes[i];
    el._nt.style.display = n ? '' : 'none';
    if (n) for (let d = 1; d <= 9; d++) {
      const on = n & (1 << (d - 1));
      const t = el._n[d - 1];
      t.textContent = on ? d : '';
      t.className = on && S.hlSame && sv === d ? 'hl' : '';
    }
  }
  renderPad(); renderInfo();
}
function renderPad() {
  const cnt = new Array(10).fill(0);
  for (let i = 0; i < 81; i++) { const v = G.val[i]; if (v && (!S.autoCheck || v === G.sol[i])) cnt[v]++; }
  for (const b of pad.children) b.classList.toggle('used', S.hideUsed && cnt[+b.dataset.d] >= 9);
  document.querySelector('[data-tool="notes"]').classList.toggle('on', notesMode);
  $('notesBadge').textContent = notesMode ? 'AAN' : 'UIT';
  document.body.classList.toggle('notesmode', notesMode);
}
let shownScore = 0;
function renderInfo() {
  $('gTitle').textContent = G.daily ? 'Uitdaging ' + DAY_FMT.format(keyDate(G.daily)).replace(/^\S+ /, '') : G.n ? `Level ${G.n}` : 'Oude puzzel';
  $('gMist').textContent = S.mistakeLimit ? `${G.mistakes}/3` : String(G.mistakes);
  $('gMistBox').classList.toggle('err', G.mistakes > 0);
  if (shownScore > G.score) shownScore = G.score;
  if (shownScore === G.score) $('gScore').textContent = fmtNum(G.score);
  $('gTime').textContent = fmtTime(G.time);
}
// score in the header counts up to the new value
let scoreTick = 0;
function countScore() {
  clearTimeout(scoreTick);
  const step = () => {
    if (!G) return;
    const diff = G.score - shownScore;
    if (diff <= 0) { shownScore = G.score; $('gScore').textContent = fmtNum(G.score); return; }
    shownScore += Math.max(1, Math.ceil(diff / 6));
    $('gScore').textContent = fmtNum(shownScore);
    const box = $('gScoreBox'); if (box) { box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump'); }
    scoreTick = later(step, 45);
  };
  scoreTick = later(step, 260);
}
function anim(i, cls, delay = 0) {
  const el = cellEls[i];
  later(() => {
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    later(() => el.classList.remove(cls), 1300);
  }, delay);
}

/* ---------- floating "+x" with the reason underneath ---------- */
// A new move replaces what is still showing, so popups never pile up when he plays fast.
let popTimers = [];
function pops(i, list) {
  popTimers.forEach(clearTimeout); popTimers = [];
  if (popsEl.querySelectorAll) popsEl.querySelectorAll('.popx').forEach(el => el.classList.add('out'));
  list.forEach((p, k) => {
    popTimers.push(later(() => {
      if (popsEl.querySelectorAll) popsEl.querySelectorAll('.popx').forEach(el => el.classList.add('out'));
      const el = document.createElement('div');
      el.className = 'popx p-' + p.kind;
      el.style.setProperty('--x', ((C.COL[i] + .5) / 9 * 100) + '%');
      el.style.setProperty('--y', ((C.ROW[i] + .5) / 9 * 100) + '%');
      el.innerHTML = `<b>${esc(p.big)}</b>${p.small ? `<span>${esc(p.small)}</span>` : ''}`;
      popsEl.appendChild(el);
      later(() => el.remove(), 1700);
    }, k * 650));
  });
}

/* ================= input ================= */
function select(i) {
  if (!G || paused) return;
  if (G.trackingStarted || G.counted) trackPlay();
  sel = i; render();
}
function snap(i) { return { i, v: G.val[i], n: G.notes[i] }; }
function trackingDetails() {
  if (!G) return {};
  if (!G.playId) G.playId = playTracking?.newRound();
  // mode tells the family overview which level is being played and how far opa has unlocked: "L37|38"
  // (a daily challenge is "D|38", an old puzzle "O|38").
  return { round: G.playId, build: 'sudoku-8', level: G.level, daily: !!G.daily,
    mode: `${G.daily ? 'D' : G.n ? 'L' + G.n : 'O'}|${P.level}`,
    progress: G.val.reduce((n, v, i) => n + (!G.puz[i] && v === G.sol[i] ? 1 : 0), 0),
    total: G.puz.filter(v => !v).length, score: G.score, gameSeconds: G.time,
    autoCheck: !!S.autoCheck, mistakeLimit: !!S.mistakeLimit };
}
function endTracking(reason) { playTracking?.state(trackingDetails()); playTracking?.stop(reason); }
function trackAction(name) { trackPlay(); playTracking?.action(name, trackingDetails()); }
function trackPlay() {
  if (!G || G.won || G.lost || paused || sheetOpen || screen !== 'Game' || !$('landing').hidden) return;
  const started = G.trackingStarted == null ? G.counted : G.trackingStarted;
  if (playTracking?.touch(!started, trackingDetails())) G.trackingStarted = true;
}
function startCounting() {
  trackPlay();
  if (G.counted) return;
  G.counted = true;
  if (!G.daily) { P.played++; saveProgress(); }
}
function clearPeerNotes(i, d, changes) {
  const bit = 1 << (d - 1);
  for (const p of C.PEERS[i]) if (G.notes[p] & bit) { changes.push(snap(p)); G.notes[p] &= ~bit; }
}
function input(d) {
  if (!G || G.won || G.lost || paused) return;
  if (sel < 0) { toast('Tik eerst op een vakje.'); return; }
  const i = sel;
  if (isLocked(i)) { if (!isGiven(i)) sound('tap'); return; }
  if (notesMode) {
    trackPlay();
    const changes = [snap(i)];
    if (G.val[i]) G.val[i] = 0;
    G.notes[i] ^= 1 << (d - 1);
    H.push(changes); playTracking?.action('note', trackingDetails()); sound('tap');
    render(); saveGame(); return;
  }
  if (G.val[i] === d) return;
  startCounting();
  const changes = [snap(i)];
  G.val[i] = d; G.notes[i] = 0;
  const wrong = d !== G.sol[i];
  playTracking?.action('input', trackingDetails());
  if (S.autoNotes && !(S.autoCheck && wrong)) clearPeerNotes(i, d, changes);
  H.push(changes);
  anim(i, 'pop');
  if (wrong) {
    const hadRun = G.streak;
    G.streak = 0; G.run = [];
    if (S.autoCheck) {
      G.mistakes++; G.mtot++;
      playTracking?.mistake();
      sound('err'); anim(i, 'shake');
      if (hadRun >= 2) pops(i, [{ big: 'Reeks voorbij', small: 'begin een nieuwe reeks', kind: 'grey' }]);
      render(); saveGame();
      if (S.mistakeLimit && G.mistakes >= 3) {
        G.lost = true;
        if (G.n) { P.fails[G.n] = (P.fails[G.n] || 0) + 1; P.wins = 0; saveProgress(); }
        endTracking('lost'); saveGame(); later(gameOverSheet, 650);
      }
      return;
    }
    sound('tap');
  } else award(i, false);
  render(); saveGame();
  checkFinished();
}
// Points for a correct number, plus every row/column/block or number it completes.
function award(i, viaHint) {
  const list = [], base = G.base;
  if (viaHint) list.push({ big: 'Hint', small: 'geen punten', kind: 'grey' });
  else if (!G.scored[i]) {
    G.scored[i] = 1;
    const k = ++G.streak;
    G.run.push(i); if (G.run.length > G.bestRun.length) G.bestRun = G.run.slice();
    const bonus = Math.min(20, 2 * (k - 1));
    G.pts.num++; G.pts.numPts += base; G.pts.streakPts += bonus; G.score += base + bonus;
    list.push({ big: '+' + (base + bonus), small: bonus ? `goed + reeks van ${k}` : 'goed', kind: bonus ? 'run' : 'num' });
  }
  let units = 0;
  for (const u of C.CELL_UNITS[i]) {
    if (G.unitDone[u] || !C.UNITS[u].every(j => G.val[j] === G.sol[j])) continue;
    G.unitDone[u] = 1; units++;
    G.pts.units++; G.pts.unitPts += 30; G.score += 30;
    list.push({ big: '+30', small: u < 9 ? 'Rij vol!' : u < 18 ? 'Kolom vol!' : 'Blok vol!', kind: 'unit' });
    C.UNITS[u].forEach(j => anim(j, 'flash', 40 * Math.max(Math.abs(C.ROW[j] - C.ROW[i]), Math.abs(C.COL[j] - C.COL[i]))));
  }
  const d = G.sol[i];
  if (!G.digitDone[d] && G.val.filter((v, j) => v === d && G.sol[j] === d).length === 9) {
    G.digitDone[d] = 1; G.pts.digits++; G.pts.digitPts += 50; G.score += 50;
    list.push({ big: '+50', small: `Alle ${d}-en!`, kind: 'gold' });
    G.sol.forEach((v, j) => v === d && anim(j, 'goldflash', 60));
  }
  pops(i, list);
  countScore();
  sound(units || list.some(p => p.kind === 'gold') ? 'unit' : 'tap');
}
function checkFinished() {
  if (G.val.some(v => !v)) return;
  if (G.val.every((v, i) => v === G.sol[i])) win();
  else toast('Bijna! Er staan nog een paar fouten in de puzzel.');
}
function undo() {
  if (!G || G.won || G.lost || paused) return;
  const ch = H.pop();
  if (!ch) { toast('Er is niets om ongedaan te maken.'); return; }
  trackPlay();
  for (let k = ch.length - 1; k >= 0; k--) { const c = ch[k]; G.val[c.i] = c.v; G.notes[c.i] = c.n; }
  sel = ch[0].i;
  playTracking?.action('undo', trackingDetails());
  sound('tap'); render(); saveGame();
}
function erase() {
  if (!G || G.won || G.lost || paused || sel < 0) return;
  const i = sel;
  if (isLocked(i)) return;
  if (!G.val[i] && !G.notes[i]) return;
  trackPlay();
  H.push([snap(i)]);
  if (G.val[i]) G.val[i] = 0; else G.notes[i] = 0;
  playTracking?.action('erase', trackingDetails());
  sound('tap'); render(); saveGame();
}
function toggleNotes() {
  if (!G || paused) return;
  notesMode = !notesMode; renderPad(); saveGame();
}

/* ---------- hint: fill in one cell and explain why ---------- */
const UNIT_TXT = u => u < 9 ? 'deze rij' : u < 18 ? 'deze kolom' : 'dit blok';
function findSingle(st, only) {
  const cands = i => st.c[i];
  const hiddenIn = (u, cell) => {
    for (let d = 1; d <= 9; d++) {
      const b = 1 << (d - 1); let pos = -1, n = 0, done = false;
      for (const j of C.UNITS[u]) { if (st.v[j] === d) { done = true; break; } if (!st.v[j] && (cands(j) & b)) { n++; pos = j; } }
      if (!done && n === 1 && (cell == null || pos === cell)) return { cell: pos, d, u };
    }
    return null;
  };
  const naked = i => !st.v[i] && C.POP[cands(i)] === 1 ? { cell: i, d: C.DIG(cands(i))[0], u: -1 } : null;
  if (only != null) {
    for (const u of [C.CELL_UNITS[only][2], C.CELL_UNITS[only][0], C.CELL_UNITS[only][1]]) { const h = hiddenIn(u, only); if (h) return h; }
    return naked(only);
  }
  for (const range of [[18, 27], [0, 18]]) for (let u = range[0]; u < range[1]; u++) { const h = hiddenIn(u); if (h) return h; }
  for (let i = 0; i < 81; i++) { const n = naked(i); if (n) return n; }
  return null;
}
function hint() {
  if (!G || G.won || G.lost || paused) return;
  const known = G.val.map((v, i) => v === G.sol[i] ? v : 0);
  const st = C.makeState(known);
  let target = null, msg = '';
  if (sel >= 0 && !isGiven(sel) && G.val[sel] !== G.sol[sel]) {
    const f = findSingle(st, sel);
    const d = G.sol[sel];
    target = { cell: sel, d, u: f ? f.u : -2 };
    if (isWrong(sel)) target.u = -3;
  } else {
    target = findSingle(st, null);
    if (!target) {
      let best = -1, bc = 10;
      for (let i = 0; i < 81; i++) if (!known[i] && C.POP[st.c[i]] < bc) { bc = C.POP[st.c[i]]; best = i; }
      if (best < 0) return;
      target = { cell: best, d: G.sol[best], u: -2 };
    }
  }
  const { cell, d, u } = target;
  if (u >= 0) msg = `In ${UNIT_TXT(u)} kan de ${d} alleen nog hier.`;
  else if (u === -1) msg = `In dit vakje past alleen nog de ${d}. De andere getallen staan al in dezelfde rij, kolom of hetzelfde blok.`;
  else if (u === -3) msg = `Dit getal klopt niet. Hier hoort een ${d}.`;
  else msg = `Hier hoort een ${d}.`;
  startCounting();
  const changes = [snap(cell)];
  G.val[cell] = d; G.notes[cell] = 0; G.hinted[cell] = 1; G.hints++;
  playTracking?.state(trackingDetails()); playTracking?.hint();
  if (S.autoNotes) clearPeerNotes(cell, d, changes);
  H.push(changes);
  sel = cell;
  if (u >= 0) C.UNITS[u].forEach((j, k) => j !== cell && anim(j, 'flash', 30 * k));
  anim(cell, 'hintcell'); anim(cell, 'pop');
  award(cell, true);
  render(); saveGame();
  toast(msg, 4200);
  checkFinished();
}

/* ================= win / lose ================= */
function win() {
  playTracking?.state(trackingDetails()); playTracking?.win();
  G.won = true; G.sel = sel = -1;
  const base = G.base;
  const R = {
    lvlBonus: 10 * base,
    noMis: G.mtot === 0 && !G.chances ? 10 * base : 0,
    noHint: G.hints === 0 ? 10 * base : 0,
  };
  G.score += R.lvlBonus + R.noMis + R.noHint;
  R.stars = R.noMis && R.noHint ? 3 : G.mtot <= 1 && !G.chances ? 2 : 1;
  R.grandBefore = P.total;
  R.medal = false;
  if (G.daily) {
    const prev = dailyDone[G.daily];
    R.record = !!prev && G.score > (prev.score || 0);
    P.total += Math.max(0, G.score - (prev ? prev.score || 0 : 0));
    dailyDone[G.daily] = { time: G.time, score: Math.max(G.score, prev ? prev.score || 0 : 0), stars: Math.max(R.stars, prev ? prev.stars || 0 : 0) };
    store(LS.done, dailyDone);
    delete dailyGames[G.daily]; store(LS.daily, dailyGames);
  } else if (G.n) {
    const prev = P.best[G.n];
    R.record = !!prev && G.score > prev.s;
    P.total += Math.max(0, G.score - (prev ? prev.s : 0));
    P.best[G.n] = { s: Math.max(G.score, prev ? prev.s : 0), t: Math.max(R.stars, prev ? prev.t : 0) };
    if (G.n === P.level) { P.level++; R.medal = G.n % MEDAL_EVERY === 0; }
    delete P.fails[G.n];
    P.wins++; P.bestWins = Math.max(P.bestWins, P.wins);
    store(LS.main, null);
  } else {
    P.total += G.score; R.record = false;
    store(LS.main, null);
  }
  saveProgress();
  G.result = R;
  render();
  for (let i = 0; i < 81; i++) anim(i, 'flash', 45 * (C.ROW[i] + C.COL[i]));
  later(() => sound('win'), 250);
  later(() => showReceipt(G, R), 1400);
}
function gameOverSheet() {
  if (!G || !G.lost) return;
  const canSkip = G.n && G.n === P.level && (P.fails[G.n] || 0) >= 2;
  sheet(`
    <div class="result-ic bad"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg></div>
    <h2>Spel voorbij</h2>
    <p>Je hebt 3 fouten gemaakt. Wil je verder spelen met een tweede kans?</p>
    <div class="btns">
      <button class="btn primary big" data-a="again">Tweede kans</button>
      <button class="btn" data-a="restart">Opnieuw beginnen</button>
      ${canSkip ? `<button class="btn" data-a="skip">Sla level ${G.n} over</button>` : ''}
      ${G.daily ? '<button class="btn ghost" data-a="cal">Naar de kalender</button>' : '<button class="btn ghost" data-a="home">Naar het begin</button>'}
    </div>`, {
    again: () => { G.lost = false; G.mistakes = 2; G.chances++; saveGame(); closeSheet(); trackAction('second_chance'); render(); },
    restart: () => { closeSheet(); restartGame(); },
    skip: () => { closeSheet(); skipLevel(); },
    cal: () => { closeSheet(); show('Daily'); },
    home: () => { closeSheet(); show('Home'); },
  }, { locked: true });
}
function skipLevel() {
  const n = G.n;
  if (n === P.level) { P.level++; delete P.fails[n]; saveProgress(); }
  store(LS.main, null); G = null;
  toast(`Level ${n} overgeslagen. Je kunt het later nog spelen.`, 3200);
  newGame(n + 1);
}

/* ================= the points receipt ================= */
const RC = { timers: [], steps: [], done: 0, open: false, ctx: null, parts: [], raf: 0 };
function rcLines(g, R) {
  const p = g.pts, b = g.base, user = [], lines = [];
  for (let i = 0; i < 81; i++) if (!g.puz[i]) user.push(i);
  const scored = user.filter(i => g.scored[i]);
  const rows = r => [0, 1, 2, 3, 4, 5, 6, 7, 8].map(c => r * 9 + c), cols = c => [0, 1, 2, 3, 4, 5, 6, 7, 8].map(r => r * 9 + c);
  if (p.num) lines.push({ ic: '✓', t: 'Getallen goed', s: `${p.num} × ${b} punten`, p: p.numPts, fx: () => rcFlash(scored, 'hb', 16, 520) });
  if (p.streakPts) lines.push({ ic: String(g.bestRun.length), t: 'Reeks-bonus', s: `langste reeks: ${g.bestRun.length} op rij`, p: p.streakPts, fx: () => rcFlash(g.bestRun, 'hy', 32, 520) });
  if (p.units) lines.push({ ic: '▦', t: 'Rij, kolom of blok vol', s: `${p.units} × 30 punten`, p: p.unitPts, fx: () => {
    for (let k = 0; k < 9; k++) { rcLater(() => rcFlash(rows(k), 'hg', 0, 260), k * 45); rcLater(() => rcFlash(cols(k), 'hg', 0, 260), 420 + k * 45); rcLater(() => rcFlash(C.UNITS[18 + k], 'hg', 0, 260), 840 + k * 45); }
  } });
  if (p.digits) lines.push({ ic: '9', t: 'Alle 9 van een getal', s: `${p.digits} × 50 punten`, p: p.digitPts, fx: () => {
    for (let d = 1; d <= 9; d++) rcLater(() => rcFlash(g.sol.flatMap((v, i) => v === d ? [i] : []), 'hy', 0, 300), (d - 1) * 95);
  } });
  lines.push({ ic: g.n ? String(g.n) : '✓', t: g.daily ? 'Uitdaging klaar' : 'Level klaar', s: '', p: R.lvlBonus, fx: () => $('rcMini').classList.add('gold') });
  lines.push({ ic: '★', t: 'Geen enkele fout', s: R.noMis ? '' : 'volgende keer!', p: R.noMis, b: 1 });
  lines.push({ ic: '★', t: 'Geen hints gebruikt', s: R.noHint ? '' : 'volgende keer!', p: R.noHint, b: 1 });
  return lines;
}
function rcLater(fn, ms) { RC.timers.push(later(fn, ms)); }
function rcFlash(list, cls, step, hold) {
  if (RC.done) return;
  const cells = $('rcMini')._cells; if (!cells) return;
  list.forEach((i, k) => rcLater(() => { cells[i].classList.add(cls); rcLater(() => cells[i].classList.remove(cls), hold); }, k * step));
}
function rcWhy(g, R) {
  if (R.stars === 3) return 'Geen fouten, geen hints!';
  if (!g.mtot && !g.chances) return 'Zonder hints krijg je 3 sterren.';
  if (R.stars === 2) return 'Eén foutje. Zonder fouten: 3 sterren!';
  return 'Met minder fouten verdien je meer sterren.';
}
function showReceipt(g, R) {
  closeSheet();
  RC.open = true; RC.done = 0; RC.timers.forEach(clearTimeout); RC.timers = [];
  const rc = $('receipt');
  // header
  const mini = $('rcMini'); mini.className = 'rc-mini'; mini.innerHTML = '';
  const boxes = [], cells = new Array(81);
  for (let b = 0; b < 9; b++) { const e = document.createElement('b'); mini.appendChild(e); boxes.push(e); }
  for (let i = 0; i < 81; i++) {
    const c = document.createElement('i'); c.textContent = g.sol[i]; if (!g.puz[i]) c.className = 'u';
    boxes[Math.floor(C.ROW[i] / 3) * 3 + Math.floor(C.COL[i] / 3)].appendChild(c); cells[i] = c;
  }
  mini._cells = cells;
  $('rcLv').textContent = g.daily ? 'Dagelijkse uitdaging' : g.n ? `Level ${g.n}` : 'Oude puzzel';
  $('rcTitle').textContent = R.medal ? 'Medaille!' : R.stars === 3 ? 'Prachtig!' : R.stars === 2 ? 'Goed zo!' : 'Opgelost!';
  const starsEl = $('rcStars');
  starsEl.innerHTML = [0, 1, 2].map(k => `<span class="rc-star${k < R.stars ? ' f' : ''}"><svg viewBox="0 0 24 24"><use href="#i-star"/></svg></span>`).join('');
  $('rcWhy').textContent = rcWhy(g, R); $('rcWhy').classList.remove('in');
  $('rcLines').innerHTML = ''; $('rcTot').textContent = '0'; $('rcRec').classList.remove('on');
  $('rcProg').classList.remove('in'); $('rcCta').classList.remove('in');
  $('rcGrand').textContent = fmtNum(R.grandBefore);
  // medal progress
  const target = Math.ceil(P.level / MEDAL_EVERY) * MEDAL_EVERY, left = target - P.level + 1;
  $('rcMedal').textContent = target;
  $('rcBar').style.width = '0%';
  const pctAfter = ((P.level - 1) % MEDAL_EVERY) / MEDAL_EVERY * 100;
  $('rcTogo').innerHTML = R.medal ? `<b>Je ${medals()}e medaille!</b> Op naar level ${target}.`
    : g.n || g.legacy ? `Nog <b>${left} ${left === 1 ? 'level' : 'levels'}</b> tot je medaille van level ${target}` : `Jij bent bij <b>level ${P.level}</b>`;
  $('rcNext').textContent = g.daily ? 'Naar de kalender' : `Speel level ${P.level}`;
  rc.hidden = false; rc.scrollTop = 0;
  // timeline
  const lines = rcLines(g, R);
  let total = 0;
  RC.steps = [];
  const step = (at, fn) => RC.steps.push({ at, fn, ran: false });
  [0, 1, 2].forEach(k => step(300 + k * 330, fast => {
    const s = starsEl.children[k]; s.classList.add('on');
    if (k < R.stars) { sound('star', k); if (!fast) burstAt(s, 22, .7); }
    if (k === 2) $('rcWhy').classList.add('in');
  }));
  let t = 1500;
  lines.forEach((L, k) => {
    step(t, fast => {
      const d = document.createElement('div');
      d.className = 'rc-line in' + (L.b ? ' bonus' : '') + (L.b && !L.p ? ' missed' : '');
      d.innerHTML = `<span class="rc-ic">${esc(L.ic)}</span><span class="rc-lt">${esc(L.t)}${L.s ? `<small>${esc(L.s)}</small>` : ''}</span><span class="rc-pts">${L.p ? '+' + fmtNum(L.p) : '–'}</span>`;
      $('rcLines').appendChild(d);
      if (!fast) { d.classList.add('now'); rcLater(() => d.classList.remove('now'), L.fx ? 900 : 500); L.fx && L.fx(); }
      else if (L.fx && k === lines.length - 3) $('rcMini').classList.add('gold');
      const from = total; total += L.p;
      if (L.p) {
        if (fast) $('rcTot').textContent = fmtNum(total);
        else { countUp($('rcTot'), from, total, 380); bump($('rcTot')); sound('line', k); if (L.b) burstAt(d.querySelector('.rc-ic'), 20, .55); }
      }
    });
    t += L.b ? 650 : L.fx ? 720 : 520;
  });
  step(t + 250, fast => {
    $('rcTot').textContent = fmtNum(total);
    if (R.record) $('rcRec').classList.add('on');
    $('rcProg').classList.add('in');
    $('rcBar').style.width = (R.medal ? 100 : pctAfter) + '%';
    if (fast) $('rcGrand').textContent = fmtNum(P.total);
    else { countUp($('rcGrand'), R.grandBefore, P.total, 1100); burstAt($('rcTot'), R.medal ? 140 : 70, R.medal ? 1.4 : 1.1); sound('win'); }
  });
  step(t + 1200, () => $('rcCta').classList.add('in'));
  RC.steps.forEach(s => rcLater(() => { if (!s.ran) { s.ran = true; s.fn(false); } }, s.at));
  burstAt(null, 90, 1.2);
}
// tapping the receipt skips straight to the end
function finishReceipt() {
  if (!RC.open || RC.done) return;
  RC.done = 1;
  RC.timers.forEach(clearTimeout); RC.timers = [];
  document.querySelectorAll('#rcMini i').forEach(c => c.classList.remove('hb', 'hg', 'hy'));
  RC.steps.forEach(s => { if (!s.ran) { s.ran = true; s.fn(true); } });
}
function closeReceipt() {
  finishReceipt();
  RC.open = false; $('receipt').hidden = true; RC.parts = [];
}
$('receipt').addEventListener('click', e => {
  const b = e.target.closest('[data-rc]');
  if (!b) { finishReceipt(); return; }
  sound('tap');
  const g = G; closeReceipt();
  if (b.dataset.rc === 'home') { show('Home'); return; }
  if (g && g.daily) show('Daily'); else playLevel(P.level);
});
function countUp(el, a, b, ms) {
  const t0 = Date.now();
  const f = () => { const k = Math.min(1, (Date.now() - t0) / ms); el.textContent = fmtNum(a + (b - a) * (1 - Math.pow(1 - k, 3))); if (k < 1) rcLater(f, 30); };
  f();
}
function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
// confetti in the app's own colours
function burstAt(el, n, force) {
  const cv = $('rcFx'); if (!cv.getContext || !RC.open) return;
  if (!RC.ctx) RC.ctx = cv.getContext('2d');
  const W = innerWidth, Hh = innerHeight, dpr = window.devicePixelRatio || 1;
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = Hh * dpr; RC.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  let x = W / 2, y = 120;
  if (el && el.getBoundingClientRect) { const r = el.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  const cols = ['#ffbf1f', '#ffffff', '#7fb0ff', '#23a065', '#ffd966'];
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = (1.5 + Math.random() * 5) * force;
    RC.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3.5, w: 4 + Math.random() * 5, c: cols[k % cols.length], r: Math.random() * 6, vr: (Math.random() - .5) * .4, l: 1, sq: Math.random() < .5 });
  }
  if (!RC.raf) RC.raf = requestAnimationFrame(confettiLoop);
}
function confettiLoop() {
  const cx = RC.ctx; RC.raf = 0;
  if (!cx) return;
  cx.clearRect(0, 0, innerWidth, innerHeight);
  RC.parts = RC.parts.filter(p => p.l > 0 && p.y < innerHeight + 20);
  for (const p of RC.parts) {
    p.vy += .16; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.l -= .007;
    cx.save(); cx.globalAlpha = Math.min(1, p.l * 2); cx.translate(p.x, p.y); cx.rotate(p.r); cx.fillStyle = p.c;
    if (p.sq) cx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); else { cx.beginPath(); cx.arc(0, 0, p.w / 2.6, 0, 7); cx.fill(); }
    cx.restore();
  }
  if (RC.parts.length && RC.open) RC.raf = requestAnimationFrame(confettiLoop);
  else cx.clearRect(0, 0, innerWidth, innerHeight);
}

/* ================= sheets ================= */
let sheetOpen = false, sheetLocked = false;
function sheet(html, actions = {}, opt = {}) {
  endTracking('menu');
  const m = $('modal'), sh = m.firstElementChild;
  sh.innerHTML = '<div class="grab"></div>' + html;
  sh.onclick = e => {
    const b = e.target.closest('[data-a]');
    if (b && actions[b.dataset.a]) { sound('tap'); actions[b.dataset.a](b); }
  };
  sheetLocked = !!opt.locked;
  m.hidden = false; sheetOpen = true;
  sh.scrollTop = 0;
}
function closeSheet() { $('modal').hidden = true; sheetOpen = false; sheetLocked = false; }
$('modal').addEventListener('click', e => { if (e.target.id === 'modal' && !sheetLocked) closeSheet(); });

// in-game menu: start this puzzle again or pick another level
function levelSheet(inGame) {
  const acts = {
    restart: () => { closeSheet(); restartGame(); },
    levels: () => { closeSheet(); show('Levels'); },
    play: () => { closeSheet(); playLevel(P.level); },
  };
  sheet(`<h2>${G && G.n ? `Level ${G.n}` : 'Sudoku'}</h2>
    <div class="lvl-list">
      ${inGame && G && !G.won ? '<button class="restart" data-a="restart"><svg viewBox="0 0 24 24" width="22" height="22"><use href="#i-undo"/></svg>Opnieuw beginnen</button>' : ''}
      <button data-a="play"><span>Speel level ${P.level}</span></button>
      <button data-a="levels"><span>Alle levels</span></button>
    </div>`, acts);
}

function settingsSheet() {
  const sw = (k, label, sub) => `<div class="set-row"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><button class="switch${S[k] ? ' on' : ''}" data-a="t-${k}" aria-label="${label}"></button></div>`;
  const seg = (k, opts) => `<span class="seg">${opts.map(([v, n]) => `<button class="${S[k] === v ? 'on' : ''}" data-a="s-${k}-${v}">${n}</button>`).join('')}</span>`;
  const acts = {};
  Object.keys(DEF).forEach(k => {
    acts['t-' + k] = b => { S[k] = !S[k]; b.classList.toggle('on', S[k]); saveSettings(); applySettings(); };
  });
  [['theme', ['licht', 'donker', 'auto']], ['size', ['normaal', 'groot']]].forEach(([k, vs]) => vs.forEach(v => {
    acts[`s-${k}-${v}`] = b => {
      S[k] = v; saveSettings(); applySettings();
      b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    };
  }));
  acts.rules = () => rulesSheet(true);
  acts.points = () => pointsSheet(true);
  acts.install = () => { closeSheet(); showLanding(true); };
  acts.restartLvl = () => { closeSheet(); restartGame(); };
  acts.reset = () => confirmSheet('Alles opnieuw beginnen?', 'Je gaat terug naar level 1. Alle punten, sterren en dagelijkse uitdagingen worden gewist. Dit kan niet ongedaan worden gemaakt.', 'Alles wissen', () => {
    Object.assign(P, { level: 1, best: {}, total: 0, fails: {}, wins: 0, bestWins: 0, played: 0 }); saveProgress();
    Object.keys(dailyDone).forEach(k => delete dailyDone[k]); store(LS.done, dailyDone);
    Object.keys(dailyGames).forEach(k => delete dailyGames[k]); store(LS.daily, dailyGames);
    store(LS.main, null); G = null;
    show('Home'); toast('Alles is gewist. Veel plezier bij level 1!');
  });
  const inGame = screen === 'Game' && G && !G.won;
  sheet(`<h2>Instellingen</h2>
    <div class="set-group"><h4>Weergave</h4>
      <div class="set-row"><span>Grootte cijfers</span>${seg('size', [['normaal', 'Groot'], ['groot', 'Extra groot']])}</div>
      <div class="set-row"><span>Kleur</span>${seg('theme', [['licht', 'Licht'], ['donker', 'Donker'], ['auto', 'Auto']])}</div>
      ${sw('showTime', 'Tijd tonen', 'De tijd telt niet mee voor je punten')}
      ${sw('sound', 'Geluid')}
    </div>
    <div class="set-group"><h4>Spel</h4>
      ${sw('autoCheck', 'Fouten meteen laten zien', 'Een fout getal wordt rood')}
      ${sw('mistakeLimit', 'Maximaal 3 fouten', 'Na 3 fouten is het spel voorbij')}
      ${sw('autoNotes', 'Notities vanzelf weghalen', 'Als je een getal invult')}
      ${sw('hideUsed', 'Gebruikte getallen verbergen', 'Als een getal 9 keer is ingevuld')}
    </div>
    <div class="set-group"><h4>Markeren</h4>
      ${sw('hlArea', 'Rij, kolom en blok', 'Rond het gekozen vakje')}
      ${sw('hlSame', 'Dezelfde getallen')}
      ${sw('hlDup', 'Dubbele getallen', 'Als een getal twee keer in een rij, kolom of blok staat')}
    </div>
    <div class="set-group">
      ${inGame ? '<button class="set-row link" data-a="restartLvl">Deze puzzel opnieuw beginnen</button>' : ''}
      <button class="set-row link" data-a="points">Zo verdien je punten</button>
      <button class="set-row link" data-a="rules">Spelregels</button>
      <button class="set-row link" data-a="install">Op het beginscherm zetten</button>
      <button class="set-row link" data-a="reset" style="color:var(--err)">Alles opnieuw beginnen</button>
    </div>
    <div class="btns"><button class="btn primary big" data-a="close">Klaar</button></div>`, Object.assign(acts, { close: closeSheet }));
}
function confirmSheet(title, text, okLabel, onOk) {
  sheet(`<h2>${title}</h2><p>${text}</p><div class="btns">
    <button class="btn danger big" data-a="ok">${okLabel}</button>
    <button class="btn ghost" data-a="no">Annuleren</button></div>`, {
    ok: () => { closeSheet(); onOk(); }, no: closeSheet,
  });
}
function pointsSheet(back) {
  const b = baseFor(P.level);
  sheet(`<h2>Zo verdien je punten</h2>
    <div class="pts-table">
      <div><span>Elk goed getal</span><b>+${b}</b></div>
      <div><span>Goed op rij: elke keer 2 extra<small>tot 20 extra; een fout begint de reeks opnieuw</small></span><b>+2…20</b></div>
      <div><span>Rij, kolom of blok vol</span><b>+30</b></div>
      <div><span>Alle 9 van een getal ingevuld</span><b>+50</b></div>
      <div><span>Level klaar</span><b>+${10 * b}</b></div>
      <div><span>Geen enkele fout</span><b>+${10 * b}</b></div>
      <div><span>Geen hints gebruikt</span><b>+${10 * b}</b></div>
    </div>
    <p>Een getal dat een hint invult geeft geen punten. De tijd telt nooit mee.<br>
    <b>Sterren:</b> ★ opgelost · ★★ hooguit één fout · ★★★ geen fouten en geen hints.<br>
    Elke 100 levels zijn de getallen 1 punt meer waard.</p>
    <div class="btns"><button class="btn primary big" data-a="ok">${back ? 'Terug' : 'Begrepen'}</button></div>`, {
    ok: () => back ? settingsSheet() : closeSheet(),
  });
}
function rulesSheet(back) {
  sheet(`<h2>Spelregels</h2>
    <div class="rules">
      <p>Een sudoku heeft 9 rijen, 9 kolommen en 9 blokken van 3×3 vakjes.</p>
      <p>Vul de lege vakjes met de getallen <b>1 tot en met 9</b>. Elk getal mag in elke <b>rij</b>, elke <b>kolom</b> en elk <b>blok</b> maar één keer voorkomen.</p>
      <p><b>Invullen:</b> tik op een vakje en daarna op een getal onderaan.</p>
      <p><b>Notities:</b> zet Notities aan om kleine hulpgetallen in een vakje te zetten. Tik nog eens op hetzelfde getal om het weer weg te halen.</p>
      <p><b>Hint:</b> kies een leeg vakje en tik op Hint, of tik op Hint zonder vakje: dan wordt een makkelijk vakje voor je ingevuld, met uitleg.</p>
      <p><b>Fouten:</b> een fout getal wordt rood. Na 3 fouten is het spel voorbij, maar je kunt verder met een tweede kans. Lukt een level twee keer niet, dan mag je het overslaan.</p>
      <p><b>Levels:</b> elk level is een heel klein beetje moeilijker dan het vorige. Zo word je vanzelf steeds beter.</p>
    </div>
    <div class="btns"><button class="btn primary big" data-a="ok">${back ? 'Terug' : 'Begrepen'}</button></div>`, {
    ok: () => back ? settingsSheet() : closeSheet(),
  });
}

/* ================= toast ================= */
let toastT = 0;
function toast(msg, ms = 2400) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}

/* ================= sound ================= */
let AC = null;
function unlockAudio() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch (e) {}
}
function tone(f, dur, type, vol, when) {
  const t = AC.currentTime + (when || 0);
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'sine'; o.frequency.value = f;
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur + .05);
}
const SCALE = [523, 587, 659, 698, 784, 880, 988, 1047];
function sound(kind, k = 0) {
  if (!S.sound || !AC) return;
  try {
    if (kind === 'tap') tone(880, .06, 'sine', .05);
    else if (kind === 'err') { tone(220, .18, 'triangle', .12); tone(180, .22, 'triangle', .1, .08); }
    else if (kind === 'unit') { tone(784, .12, 'sine', .07); tone(1047, .2, 'sine', .07, .08); }
    else if (kind === 'star') { tone(SCALE[2 + k * 2], .22, 'triangle', .08); tone(SCALE[4 + k], .3, 'sine', .05, .05); }
    else if (kind === 'line') tone(SCALE[Math.min(7, k)], .12, 'sine', .07);
    else if (kind === 'win') [523, 659, 784, 1047].forEach((f, j) => tone(f, .35, 'sine', .08, j * .13));
  } catch (e) {}
}

/* ================= screens ================= */
function show(name) {
  if (name !== 'Game') endTracking('menu');
  screen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr' + name));
  document.body.classList.toggle('tabs', name !== 'Game');
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  if (name !== 'Game') { if (G && !G.won) saveGame(); paused = false; }
  if (name === 'Home') renderHome();
  if (name === 'Levels') renderLevels();
  if (name === 'Daily') renderDaily();
  if (name === 'Stats') renderStats();
  if (name === 'Game') relayout();
}
function openGame() {
  if (screen !== 'Game') returnTo = G.daily ? 'Daily' : 'Home';
  $('paused').hidden = true;
  shownScore = G.score;
  show('Game'); render();
}
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => { sound('tap'); show(b.dataset.tab); }));
document.querySelectorAll('[data-act="settings"]').forEach(b => b.addEventListener('click', () => { sound('tap'); settingsSheet(); }));

/* ---------- home ---------- */
function miniGrid() {
  const v = [5, 3, '', 6, '', 1, '', 9, 8];
  return '<div class="mini">' + v.map((x, k) => `<i class="${k === 4 ? 's' : k === 5 ? 'u' : (k === 3 || k === 1 || k === 7) ? 'r' : ''}">${x}</i>`).join('') + '</div>';
}
$('ldGrid').innerHTML = miniGrid();
const filledOf = g => g.val.reduce((n, v, i) => n + (!g.puz[i] && v === g.sol[i] ? 1 : 0), 0);
function renderHome() {
  const tk = todayKey(), d = new Date();
  $('homeDailyDay').textContent = d.getDate();
  $('homeDailyDate').textContent = DAY_FMT.format(d);
  const go = $('homeDailyGo');
  go.classList.toggle('done', !!dailyDone[tk]);
  go.textContent = dailyDone[tk] ? '✓ Klaar' : dailyGames[tk] ? 'Verder' : 'Spelen';
  $('homeLevel').textContent = P.level;
  $('homeScore').textContent = fmtNum(P.total);
  $('homeStars').textContent = fmtNum(starsTotal());
  $('homeMedals').textContent = medals();
  const target = Math.ceil(P.level / MEDAL_EVERY) * MEDAL_EVERY, left = target - P.level + 1;
  $('homeMedal').textContent = target;
  $('homeBar').style.width = (((P.level - 1) % MEDAL_EVERY) / MEDAL_EVERY * 100) + '%';
  $('homeTogo').innerHTML = `Nog <b>${left} ${left === 1 ? 'level' : 'levels'}</b> tot je ${medals() ? 'volgende ' : ''}medaille`;
  const m = savedMain();
  const busy = m && !m.G.won && (m.G.counted || m.G.n !== P.level) ? m.G : null;
  const sub = $('homePlaySub'), next = $('homeNext');
  if (busy) {
    $('homePlayTxt').textContent = busy.n ? `Verder met level ${busy.n}` : 'Verder met je puzzel';
    sub.hidden = false; sub.textContent = `${filledOf(busy)} van ${busy.puz.filter(v => !v).length} vakjes ingevuld`;
    next.hidden = busy.n === P.level;
    $('homeNextTxt').textContent = `Speel level ${P.level}`;
  } else {
    $('homePlayTxt').textContent = `Speel level ${P.level}`;
    sub.hidden = true; next.hidden = true;
  }
  renderRanking(); refreshRanking(false);
}
$('homePlay').addEventListener('click', () => {
  sound('tap');
  const m = savedMain();
  if (G && !G.daily && !G.won && m && m.G.n === G.n) { openGame(); if (G.lost) later(gameOverSheet, 250); }
  else if (m && !m.G.won) resume(m);
  else playLevel(P.level);
});
$('homeNext').addEventListener('click', () => { sound('tap'); newGame(P.level); });
$('homeDaily').addEventListener('click', () => { sound('tap'); calSel = todayKey(); calMonth = null; show('Daily'); });

/* ---------- ranking: which level the family is at ----------
   Everyone's Sudoku app reports "L<played>|<unlocked>" to the family database. Devices with the same
   name are one person (on an iPhone each home-screen app has its own code). Names come from the dashboard. */
const RANK_KEY = 'sudoku.ranking';
const rank = { rows: load(RANK_KEY, null), at: 0, busy: false };
const rankBase = () => String((window.SUDOKU_TRACKING || {}).databaseUrl || '').replace(/\/$/, '');
const normName = s => typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').toLowerCase() : '';
const levelFromMode = m => { const x = typeof m === 'string' && /^(?:L\d{1,5}|D|O)\|(\d{1,5})$/.exec(m); return x ? Number(x[1]) : 0; };
async function refreshRanking(force) {
  const base = rankBase();
  if (!base || typeof fetch !== 'function' || rank.busy || (!force && Date.now() - rank.at < 5 * 60000)) return;
  rank.busy = true; rank.at = Date.now();
  try {
    const players = await (await fetch(`${base}/players.json`)).json();
    const people = new Map();
    for (const [key, p] of Object.entries(players || {})) {
      if (!/^[a-f0-9]{32}$/.test(key) || !p || typeof p.name !== 'string' || !p.name.trim() || /test/i.test(p.name)) continue;
      const id = normName(p.name);
      if (!people.has(id)) people.set(id, { names: [], keys: [], level: 0 });
      people.get(id).names.push(p.name.trim().slice(0, 20)); people.get(id).keys.push(key);
    }
    await Promise.all([...people.values()].flatMap(person => person.keys.map(async key => {
      const q = new URLSearchParams({ orderBy: '"start"', limitToLast: '40' });
      const recs = await (await fetch(`${base}/sessions/${key}.json?${q}`)).json();
      for (const r of Object.values(recs || {})) if (r && r.app === 'sudoku') person.level = Math.max(person.level, levelFromMode(r.detail && r.detail.mode));
    })));
    const me = playTracking?.deviceId;
    rank.rows = [...people.values()].filter(p => p.level > 0 || (me && p.keys.includes(me))).map(p => {
      const count = new Map(); p.names.forEach(n => count.set(n, (count.get(n) || 0) + 1));
      const name = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || (/^[A-Z][a-z]/.test(b) ? 1 : 0) - (/^[A-Z][a-z]/.test(a) ? 1 : 0))[0];
      return { name, level: p.level, me: !!me && p.keys.includes(me) };
    });
    store(RANK_KEY, rank.rows);
  } catch (e) { /* offline: keep showing the last known ranking */ }
  finally { rank.busy = false; renderRanking(); }
}
function renderRanking() {
  const box = $('homeRank'); if (!box) return;
  let rows = (rank.rows || []).map(r => Object.assign({}, r));
  // my own level is always the one on this device
  let mine = rows.find(r => r.me);
  if (!mine) { mine = { name: 'Jij', level: 0, me: true }; rows.push(mine); }
  mine.level = Math.max(mine.level, P.level);
  const others = rows.filter(r => !r.me);
  if (!others.length) { box.hidden = true; return; }
  rows.sort((a, b) => b.level - a.level || (a.me ? -1 : b.me ? 1 : 0));
  const list = $('rankList'); list.replaceChildren();
  rows.slice(0, 6).forEach((r, i) => {
    const li = document.createElement('li');
    li.className = (r.me ? 'me ' : '') + (i === 0 ? 'first' : '');
    const pos = document.createElement('span'); pos.className = 'pos'; pos.textContent = i === 0 ? '👑' : String(i + 1);
    const name = document.createElement('span'); name.className = 'nm'; name.textContent = r.me ? `${r.name === 'Jij' ? 'Jij' : r.name + ' (jij)'}` : r.name;
    const lv = document.createElement('span'); lv.className = 'rk-lv'; lv.textContent = `level ${r.level}`;
    li.append(pos, name, lv); list.appendChild(li);
  });
  const ahead = rows.filter(r => r.level > mine.level).sort((a, b) => a.level - b.level)[0];
  const behind = rows.filter(r => !r.me && r.level < mine.level).sort((a, b) => b.level - a.level)[0];
  $('rankNote').textContent = ahead ? `Nog ${ahead.level - mine.level} ${ahead.level - mine.level === 1 ? 'level' : 'levels'} en je haalt ${ahead.name} in!`
    : behind ? `Je staat bovenaan! ${behind.name} zit ${mine.level - behind.level} ${mine.level - behind.level === 1 ? 'level' : 'levels'} achter je.`
    : 'Jullie staan gelijk!';
  box.hidden = false;
}

/* ---------- levels ---------- */
let lvPage = null;
const PAGE = 50;
function renderLevels() {
  const maxPage = Math.floor((P.level - 1) / PAGE) + 1;   // pages that hold unlocked levels, plus the next one
  if (lvPage == null || lvPage > maxPage) lvPage = Math.floor((P.level - 1) / PAGE);
  const chips = [];
  for (let p = 0; p <= maxPage; p++) chips.push(`<button data-p="${p}" class="${p === lvPage ? 'on' : ''}">${p * PAGE + 1}–${(p + 1) * PAGE}</button>`);
  $('lvChips').innerHTML = chips.join('');
  const m = savedMain(), busyN = m && !m.G.won ? m.G.n : null;
  let html = '';
  for (let n = lvPage * PAGE + 1; n <= (lvPage + 1) * PAGE; n++) {
    const b = P.best[n], open = n <= P.level, st = b ? b.t : 0;
    const cls = ['lv', open ? '' : 'locked', n === P.level ? 'cur' : '', b ? 'done' : '', n % MEDAL_EVERY === 0 ? 'medal' : ''].join(' ');
    html += `<button class="${cls}" data-n="${n}" ${open ? '' : 'disabled'} aria-label="Level ${n}">
      ${open ? `<b>${n}</b>` : `<svg viewBox="0 0 24 24"><use href="#i-lock"/></svg><b>${n}</b>`}
      <span class="lv-st">${[0, 1, 2].map(k => `<i class="${k < st ? 'f' : ''}"></i>`).join('')}</span>
      ${busyN === n ? '<em>bezig</em>' : ''}</button>`;
  }
  $('lvGrid').innerHTML = html;
  const on = $('lvChips').querySelector('.on'); if (on && on.scrollIntoView) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}
$('lvChips').addEventListener('click', e => { const b = e.target.closest('button[data-p]'); if (!b) return; sound('tap'); lvPage = +b.dataset.p; renderLevels(); });
$('lvGrid').addEventListener('click', e => {
  const b = e.target.closest('button[data-n]'); if (!b || b.disabled) return;
  sound('tap'); playLevel(+b.dataset.n);
});

/* ---------- daily ---------- */
let calMonth = null, calSel = null;
const MIN_MONTH = new Date(2026, 0, 1);
const starStr = n => '★'.repeat(n) + '☆'.repeat(3 - n);
function renderDaily() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (!calSel) calSel = todayKey();
  if (!calMonth) { const s = keyDate(calSel); calMonth = new Date(s.getFullYear(), s.getMonth(), 1); }
  const y = calMonth.getFullYear(), mo = calMonth.getMonth();
  $('dMonth').textContent = MONTH_FMT.format(calMonth);
  $('dPrev').disabled = calMonth <= MIN_MONTH;
  $('dNext').disabled = y > today.getFullYear() || (y === today.getFullYear() && mo >= today.getMonth());
  const days = new Date(y, mo + 1, 0).getDate();
  const lead = (new Date(y, mo, 1).getDay() + 6) % 7;
  let html = '<span></span>'.repeat(lead), done = 0;
  for (let d = 1; d <= days; d++) {
    const dt = new Date(y, mo, d), k = dateKey(dt);
    const cls = [k === todayKey() ? 'today' : '', dailyDone[k] ? 'done' : '', dailyGames[k] ? 'busy' : '', k === calSel ? 'sel' : ''].join(' ');
    if (dailyDone[k]) done++;
    html += `<button class="${cls}" data-k="${k}" ${dt > today ? 'disabled' : ''}>${d}</button>`;
  }
  $('dGrid').innerHTML = html;
  $('dTrophyTxt').textContent = `${done} van ${days}`;
  $('dTrophy').classList.toggle('won', done === days);
  const inMonth = calSel && keyDate(calSel).getMonth() === mo && keyDate(calSel).getFullYear() === y;
  const info = $('dInfo'), btn = $('dPlay');
  if (!inMonth) { info.innerHTML = 'Kies een dag in de kalender.'; btn.hidden = true; return; }
  btn.hidden = false;
  const dn = dailyDone[calSel];
  info.innerHTML = `<b>${esc(DAY_FMT.format(keyDate(calSel)))}</b>` + (dn ? `<br>Klaar: ${fmtNum(dn.score)} punten <span class="gold">${starStr(dn.stars || 1)}</span>` : '<br>Een puzzel die past bij jouw level');
  btn.firstElementChild.textContent = dn ? 'Nog een keer spelen' : dailyGames[calSel] ? 'Verder spelen' : 'Spelen';
  btn.classList.toggle('primary', !dn);
}
$('dGrid').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]'); if (!b || b.disabled) return;
  sound('tap'); calSel = b.dataset.k; renderDaily();
});
$('dPrev').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); sound('tap'); renderDaily(); });
$('dNext').addEventListener('click', () => { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); sound('tap'); renderDaily(); });
$('dPlay').addEventListener('click', () => {
  sound('tap');
  const k = calSel; if (!k) return;
  if (G && G.daily === k && !G.won) { openGame(); return; }
  if (dailyGames[k] && !dailyGames[k].G.won) { if (G && G.daily) saveGame(); resume(dailyGames[k]); return; }
  if (G && G.daily && G.daily !== k) saveGame();
  newGame(P.level, k);
});

/* ---------- stats ---------- */
function renderStats() {
  const best = Object.values(P.best);
  const box = (label, val, cls = '') => `<div class="stat ${cls}"><span>${label}</span><b>${val}</b></div>`;
  const three = best.filter(b => b.t === 3).length;
  $('sBody').innerHTML = `
    <div class="stat-hero"><span>Totaalscore</span><b>${fmtNum(P.total)}</b></div>
    <h3>Levels</h3>
    <div class="stat-grid">${box('Huidig level', P.level)}${box('Uitgespeeld', best.length)}${box('Sterren', fmtNum(starsTotal()), 'gold')}${box('Medailles', medals(), 'gold')}</div>
    <h3>Goed bezig</h3>
    <div class="stat-grid">${box('Drie sterren', three)}${box('Gewonnen op rij', P.wins)}${box('Langste reeks', P.bestWins)}${box('Dagelijkse uitdagingen', Object.keys(dailyDone).length)}</div>`;
}

/* ---------- game controls ---------- */
boardEl.addEventListener('pointerdown', e => {
  const c = e.target.closest('.cell'); if (!c) return;
  e.preventDefault(); unlockAudio();
  select(+c.dataset.i);
});
pad.addEventListener('click', e => { const b = e.target.closest('button[data-d]'); if (b) input(+b.dataset.d); });
document.querySelectorAll('.tool').forEach(b => b.addEventListener('click', () => {
  ({ undo, erase, notes: toggleNotes, hint })[b.dataset.tool]();
}));
$('gBack').addEventListener('click', () => { sound('tap'); show(returnTo); });
function setPaused(p) {
  if (p) endTracking('pause');
  if (!G || G.won) return;
  paused = p; $('paused').hidden = !p;
}
$('gPause').addEventListener('click', () => { sound('tap'); setPaused(!paused); });
$('gResume').addEventListener('click', () => { sound('tap'); setPaused(false); });

document.addEventListener('keydown', e => {
  if (RC.open) { if (e.key === 'Enter' || e.key === ' ') { if (!RC.done) finishReceipt(); else $('rcNext').click(); } return; }
  if (screen !== 'Game' || sheetOpen || !G) return;
  const k = e.key;
  if (k >= '1' && k <= '9') { input(+k); e.preventDefault(); return; }
  if (k === 'Backspace' || k === 'Delete' || k === '0') { erase(); e.preventDefault(); return; }
  if (k === 'n' || k === 'N') { toggleNotes(); return; }
  if ((k === 'z' || k === 'Z') && (e.ctrlKey || e.metaKey)) { undo(); e.preventDefault(); return; }
  if (k === 'h' || k === 'H') { hint(); return; }
  const mv = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[k];
  if (mv) {
    e.preventDefault();
    if (sel < 0) { select(40); return; }
    let r = C.ROW[sel], c = C.COL[sel];
    if (mv === -9) r = (r + 8) % 9; else if (mv === 9) r = (r + 1) % 9; else if (mv === -1) c = (c + 8) % 9; else c = (c + 1) % 9;
    select(r * 9 + c);
  }
});

/* ---------- timer ---------- */
setInterval(() => {
  const playing = screen === 'Game' && G && !G.won && !G.lost && !paused && !sheetOpen && !document.hidden && $('landing').hidden;
  if (G) playTracking?.state(trackingDetails());
  playTracking?.tick(!!playing);
  if (!playing) return;
  G.time++;
  $('gTime').textContent = fmtTime(G.time);
  if (G.time % 5 === 0) saveGame();
}, 1000);

/* ---------- layout ---------- */
const BOARD_EXTRA = 18;   // outer border 2×3px + box gaps 2×3px + cell gaps 6×1px
function relayout() {
  if (screen !== 'Game') return;
  const w = $('boardWrap');
  const cs = getComputedStyle(w);
  const aw = w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = w.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const size = Math.max(160, Math.min(aw, ah, 780));
  const cell = Math.floor((size - BOARD_EXTRA) / 9);
  document.documentElement.style.setProperty('--cs', cell + 'px');
}
if (window.ResizeObserver) new ResizeObserver(relayout).observe($('boardWrap'));
addEventListener('resize', relayout);
addEventListener('orientationchange', () => setTimeout(relayout, 250));
document.addEventListener('visibilitychange', () => { if (document.hidden && G && !G.won) saveGame(); });
addEventListener('pagehide', () => { if (G && !G.won) saveGame(); });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
document.addEventListener('pointerdown', unlockAudio, { capture: true });

/* ---------- settings ---------- */
const darkMQ = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function applySettings() {
  const dark = S.theme === 'donker' || (S.theme === 'auto' && darkMQ && darkMQ.matches);
  document.body.classList.toggle('dark', dark);
  document.body.classList.toggle('groot', S.size === 'groot');
  document.body.classList.toggle('notime', !S.showTime);
  document.body.classList.toggle('nomist', !S.autoCheck);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#15191f' : '#ffffff');
  if (G && screen === 'Game') render();
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', applySettings);

/* ================= landing page ================= */
const isStandalone = () => window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
function showLanding(scrollToInstall) {
  endTracking('menu');
  closeSheet();
  const ld = $('landing');
  const m = savedMain(), hasGame = !!m && !m.G.won;
  $('ldPlay').textContent = hasGame ? 'Verder spelen' : P.level > 1 ? `Speel level ${P.level}` : 'Spelen';
  $('ldPlay2').textContent = $('ldPlay').textContent;
  $('ldResume').hidden = !hasGame;
  ld.hidden = false; ld.scrollTop = 0;
  if (scrollToInstall) requestAnimationFrame(() => $('ldInstall').scrollIntoView({ block: 'start' }));
}
function hideLanding() {
  unlockAudio();
  $('landing').hidden = true;
  if (screen === 'Game') relayout(); else show(screen);
}
$('ldPlay').addEventListener('click', hideLanding);
$('ldPlay2').addEventListener('click', hideLanding);

/* ================= boot ================= */
function boot() {
  applySettings();
  const m = savedMain();
  if (m && !m.G.won && !m.G.lost) { G = prepare(m.G); H = m.H || []; sel = G.sel != null ? G.sel : -1; notesMode = !!G.notesMode; }
  show('Home');
  if (!isStandalone()) showLanding(false);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
// testing hook
window.__sudoku = { get G() { return G; }, set G(v) { G = v; }, get sel() { return sel; }, select, input, hint, undo, erase, toggleNotes, newGame, playLevel, show, render, P, S, win, levelSheet, settingsSheet, dailyDone, finishReceipt, closeReceipt, levelEntry, baseFor, LEVEL_COUNT, dailyEntry };
boot();
})();
