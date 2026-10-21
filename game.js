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

// New level list (epoch 3: level 1 has 25 empty squares, pairs from 1001): everyone starts again at level 1. Points, stars per level and
// the unfinished level puzzle go too; daily challenges and settings stay. Runs once per device.
const LEVELS_EPOCH = 3, EPOCH_KEY = 'sudoku.levelsEpoch';
if ((load(EPOCH_KEY, 1) || 1) < LEVELS_EPOCH) {
  store(LS.prog, null); store(LS.main, null); store('sudoku.rivals', {}); store('sudoku.ranking', null);
  store(EPOCH_KEY, LEVELS_EPOCH);
}
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
  return { round: G.playId, build: 'sudoku-15', level: G.level, daily: !!G.daily,
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
  later(() => refreshRanking(true), 3000);   // the new level reaches the database first, then fetch the ranking
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
  }, { locked: true, onX: () => { closeSheet(); show(G && G.daily ? 'Daily' : 'Home'); } });
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
  RC.open = true; RC.done = 0; RC.timers.forEach(clearTimeout); RC.timers = []; RC.passed = null;
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
  $('rcProg').classList.remove('in'); $('rcCta').classList.remove('in'); rc.classList.remove('rc-b');
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
    $('receipt').classList.add('rc-b');                  // second step: fold the lines away, show total + ranking
    $('rcProg').classList.add('in'); renderReceiptRank();
    $('rcBar').style.width = (R.medal ? 100 : pctAfter) + '%';
    if (fast) $('rcGrand').textContent = fmtNum(P.total);
    else { countUp($('rcGrand'), R.grandBefore, P.total, 1100); burstAt($('rcTot'), R.medal ? 140 : 70, R.medal ? 1.4 : 1.1); sound('win'); }
  });
  step(t + 1200, () => { $('rcCta').classList.add('in'); fitList($('receipt'), document.querySelector('#rcRank .rc-lb')); });
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
// Every window has a big ✕ in its top corner. A window that needs a choice (opt.locked) says with opt.onX
// what the ✕ does; otherwise it simply closes.
function sheet(html, actions = {}, opt = {}) {
  endTracking('menu');
  stopScan();
  const m = $('modal'), sh = m.firstElementChild;
  sh.innerHTML = '<button class="sheet-x" data-a="__x" aria-label="Sluiten"><svg viewBox="0 0 24 24"><use href="#i-x"/></svg></button><div class="grab"></div>' + html;
  actions = Object.assign({ __x: opt.onX || closeSheet }, actions);
  sh.onclick = e => {
    const b = e.target.closest('[data-a]');
    if (b && actions[b.dataset.a]) { sound('tap'); actions[b.dataset.a](b); }
  };
  sheetLocked = !!opt.locked;
  m.hidden = false; sheetOpen = true;
  sh.scrollTop = 0;
}
function closeSheet() { stopScan(); $('modal').hidden = true; sheetOpen = false; sheetLocked = false; }
let scanStop = null;                       // stops the camera of "Code scannen" while it runs
function stopScan() { if (scanStop) { const f = scanStop; scanStop = null; f(); } }
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

// Settings fit on one screen: the display choices, then big buttons to the other pages (each with "Terug").
const swRow = (k, label, sub) => `<div class="set-row"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><button class="switch${S[k] ? ' on' : ''}" data-a="t-${k}" aria-label="${label}"></button></div>`;
const swActs = keys => Object.fromEntries(keys.map(k => ['t-' + k, b => { S[k] = !S[k]; b.classList.toggle('on', S[k]); saveSettings(); applySettings(); }]));
function settingsSheet() {
  const seg = (k, opts) => `<span class="seg">${opts.map(([v, n]) => `<button class="${S[k] === v ? 'on' : ''}" data-a="s-${k}-${v}">${n}</button>`).join('')}</span>`;
  const acts = swActs(['sound']);
  [['theme', ['licht', 'donker', 'auto']], ['size', ['normaal', 'groot']]].forEach(([k, vs]) => vs.forEach(v => {
    acts[`s-${k}-${v}`] = b => {
      S[k] = v; saveSettings(); applySettings();
      b.parentNode.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    };
  }));
  Object.assign(acts, {
    game: () => gameOptionsSheet(), marks: () => marksSheet(),
    rules: () => rulesSheet(true), points: () => pointsSheet(true),
    install: () => { closeSheet(); showLanding(true); },
    transfer: () => transferMenu(),
    reset: () => confirmSheet('Alles opnieuw beginnen?', 'Je gaat terug naar level 1. Alle punten, sterren en dagelijkse uitdagingen worden gewist. Dit kan niet ongedaan worden gemaakt.', 'Alles wissen', () => {
      Object.assign(P, { level: 1, best: {}, total: 0, fails: {}, wins: 0, bestWins: 0, played: 0 }); saveProgress();
      Object.keys(dailyDone).forEach(k => delete dailyDone[k]); store(LS.done, dailyDone);
      Object.keys(dailyGames).forEach(k => delete dailyGames[k]); store(LS.daily, dailyGames);
      store(LS.main, null); G = null;
      show('Home'); toast('Alles is gewist. Veel plezier bij level 1!');
    }, () => settingsSheet()),
    restartLvl: () => { closeSheet(); restartGame(); },
    close: closeSheet,
  });
  const inGame = screen === 'Game' && G && !G.won;
  const tile = (a, label, cls = '') => `<button class="set-tile ${cls}" data-a="${a}">${label}</button>`;
  sheet(`<h2>Instellingen</h2>
    <div class="set-group">
      <div class="set-row"><span>Cijfers</span>${seg('size', [['normaal', 'Groot'], ['groot', 'Extra groot']])}</div>
      <div class="set-row"><span>Kleur</span>${seg('theme', [['licht', 'Licht'], ['donker', 'Donker'], ['auto', 'Auto']])}</div>
      ${swRow('sound', 'Geluid')}
    </div>
    <div class="set-tiles">
      ${tile('game', 'Spel')}${tile('marks', 'Markeren')}
      ${tile('rules', 'Spelregels')}${tile('points', 'Punten')}
      ${tile('transfer', 'Overzetten')}${tile('reset', 'Alles wissen', 'danger')}
      ${inGame ? tile('restartLvl', 'Deze puzzel opnieuw', 'wide') : ''}
      ${IN_APP || isStandalone() ? '' : tile('install', 'Op beginscherm', 'wide')}
    </div>
    <div class="btns"><button class="btn primary big" data-a="close">Klaar</button></div>`, acts);
}
function gameOptionsSheet() {
  const keys = ['autoCheck', 'mistakeLimit', 'autoNotes', 'hideUsed', 'showTime'];
  sheet(`<h2>Spel</h2>
    <div class="set-group">
      ${swRow('autoCheck', 'Fouten meteen laten zien', 'Een fout getal wordt rood')}
      ${swRow('mistakeLimit', 'Maximaal 3 fouten', 'Na 3 fouten is het spel voorbij')}
      ${swRow('autoNotes', 'Notities vanzelf weghalen', 'Als je een getal invult')}
      ${swRow('hideUsed', 'Gebruikte getallen verbergen', 'Als een getal 9 keer is ingevuld')}
      ${swRow('showTime', 'Tijd tonen', 'Telt niet mee voor je punten')}
    </div>
    <div class="btns"><button class="btn primary big" data-a="back">‹ Terug</button></div>`, Object.assign(swActs(keys), { back: settingsSheet }));
}
function marksSheet() {
  const keys = ['hlArea', 'hlSame', 'hlDup'];
  sheet(`<h2>Markeren</h2>
    <div class="set-group">
      ${swRow('hlArea', 'Rij, kolom en blok', 'Rond het gekozen vakje')}
      ${swRow('hlSame', 'Dezelfde getallen')}
      ${swRow('hlDup', 'Dubbele getallen', 'Hetzelfde getal twee keer in een rij, kolom of blok')}
    </div>
    <div class="btns"><button class="btn primary big" data-a="back">‹ Terug</button></div>`, Object.assign(swActs(keys), { back: settingsSheet }));
}
function confirmSheet(title, text, okLabel, onOk, onNo) {
  sheet(`<h2>${title}</h2><p>${text}</p><div class="btns">
    <button class="btn danger big" data-a="ok">${okLabel}</button>
    <button class="btn big" data-a="no">Annuleren</button></div>`, {
    ok: () => { closeSheet(); onOk(); }, no: onNo || closeSheet,
  });
}
function pointsSheet(back) {
  const b = baseFor(P.level);
  sheet(`<h2>Zo verdien je punten</h2>
    <div class="pts-table">
      <div><span>Elk goed getal</span><b>+${b}</b></div>
      <div><span>Goed op rij: elke keer 2 extra</span><b>+2…20</b></div>
      <div><span>Rij, kolom of blok vol</span><b>+30</b></div>
      <div><span>Alle 9 van een getal</span><b>+50</b></div>
      <div><span>Level klaar</span><b>+${10 * b}</b></div>
      <div><span>Geen enkele fout</span><b>+${10 * b}</b></div>
      <div><span>Geen hints gebruikt</span><b>+${10 * b}</b></div>
    </div>
    <p class="pts-stars">★ opgelost · ★★ hooguit één fout<br>★★★ geen fouten en geen hints</p>
    <div class="btns"><button class="btn primary big" data-a="ok">${back ? '‹ Terug' : 'Begrepen'}</button></div>`, {
    ok: () => back ? settingsSheet() : closeSheet(),
  });
}
function rulesSheet(back, page = 1) {
  const done = () => back ? settingsSheet() : closeSheet();
  if (page === 1) sheet(`<h2>Spelregels <small>1/2</small></h2>
    <div class="rules">
      <p>Vul de lege vakjes met de getallen <b>1 tot en met 9</b>.</p>
      <p>Elk getal mag in elke <b>rij</b>, elke <b>kolom</b> en elk <b>blok</b> van 3×3 maar één keer voorkomen.</p>
      <p><b>Invullen:</b> tik op een vakje en daarna op een getal onderaan.</p>
      <p><b>Notities:</b> zet Notities aan voor kleine hulpgetallen. Tik nog eens op hetzelfde getal om het weg te halen.</p>
    </div>
    <div class="btns two"><button class="btn big" data-a="back">‹ ${back ? 'Terug' : 'Sluiten'}</button><button class="btn primary big" data-a="next">Verder ›</button></div>`,
    { back: done, next: () => rulesSheet(back, 2) });
  else sheet(`<h2>Spelregels <small>2/2</small></h2>
    <div class="rules">
      <p><b>Hint:</b> tik op Hint. Dan wordt een vakje voor je ingevuld, met uitleg.</p>
      <p><b>Fouten:</b> een fout getal wordt rood. Na 3 fouten is het spel voorbij, maar je kunt verder met een tweede kans. Lukt een level twee keer niet, dan mag je het overslaan.</p>
      <p><b>Levels:</b> elk level is een heel klein beetje moeilijker dan het vorige.</p>
    </div>
    <div class="btns two"><button class="btn big" data-a="prev">‹ Vorige</button><button class="btn primary big" data-a="ok">${back ? 'Klaar' : 'Begrepen'}</button></div>`,
    { prev: () => rulesSheet(back, 1), ok: done });
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
  if (name === 'Stats') { renderStats(); refreshRanking(false); }
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
document.querySelectorAll('[data-act="home"]').forEach(b => b.addEventListener('click', () => { sound('tap'); show('Home'); }));

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
$('homeRank').addEventListener('click', () => { sound('tap'); show('Stats'); });
$('homeDaily').addEventListener('click', () => { sound('tap'); calSel = todayKey(); calMonth = null; show('Daily'); });

/* ---------- ranking: which level the family is at ----------
   Everyone's Sudoku app reports "L<played>|<unlocked>" to the family database. Devices with the same
   name are one person (on an iPhone each home-screen app has its own code). Names come from the dashboard. */
const RANK_KEY = 'sudoku.ranking';
const rank = { rows: load(RANK_KEY, null), at: 0, busy: false };
const rankBase = () => String((window.SUDOKU_TRACKING || {}).databaseUrl || '').replace(/\/$/, '');
const normName = s => typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').toLowerCase() : '';
// levels reported before the current level list (build sudoku-14 and older) mean other puzzles: ignored
const FIRST_NEW_BUILD = 15;
const buildNo = b => { const m = typeof b === 'string' && /^sudoku-(\d+)$/.exec(b); return m ? Number(m[1]) : 0; };
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
      if (!people.has(id)) people.set(id, { names: [], keys: [], level: 0, plays: false });
      people.get(id).names.push(p.name.trim().slice(0, 20)); people.get(id).keys.push(key);
    }
    await Promise.all([...people.values()].flatMap(person => person.keys.map(async key => {
      const q = new URLSearchParams({ orderBy: '"start"', limitToLast: '40' });
      const recs = await (await fetch(`${base}/sessions/${key}.json?${q}`)).json();
      for (const r of Object.values(recs || {})) if (r && r.app === 'sudoku') {
        person.plays = true;
        if (buildNo(r.detail && r.detail.build) >= FIRST_NEW_BUILD) person.level = Math.max(person.level, levelFromMode(r.detail && r.detail.mode));
      }
    })));
    const me = playTracking?.deviceId;
    // people who play Sudoku but haven't reported a level yet (older app version) still appear, as "level volgt"
    rank.rows = [...people.values()].filter(p => p.plays || (me && p.keys.includes(me))).map(p => {
      const count = new Map(); p.names.forEach(n => count.set(n, (count.get(n) || 0) + 1));
      const name = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || (/^[A-Z][a-z]/.test(b) ? 1 : 0) - (/^[A-Z][a-z]/.test(a) ? 1 : 0))[0];
      return { name, level: p.level, me: !!me && p.keys.includes(me) };
    });
    store(RANK_KEY, rank.rows);
  } catch (e) { /* offline: keep showing the last known ranking */ }
  finally { rank.busy = false; renderRanking(); }
}
// Rivals keep opa's ranking lively: they stay close to opa's level, some a little ahead, some a little
// behind, with a small daily wobble, and never go backwards. They are worked out on this device only.
const RIVALS = [
  { name: 'Joop', f: 1.3, add: 2 }, { name: 'Marianne', f: 1.12, add: 1 },
  { name: 'Frits', f: 0.97, add: 0 }, { name: 'Lies', f: 0.85, add: -1 },
];
const RIVALS_KEY = 'sudoku.rivals';
function rivalLevels(myLevel) {
  const seen = load(RIVALS_KEY, {}) || {};
  const day = dateKey(new Date());
  const out = RIVALS.map((r, i) => {
    const wobble = (hashStr(day + r.name) % 5) - 2;                     // -2 … +2, changes once a day
    const target = Math.max(1, Math.round(myLevel * r.f + r.add + wobble * Math.min(1, myLevel / 10)));
    const level = Math.max(seen[r.name] || 1, target);
    seen[r.name] = level;
    return { name: r.name, level, me: false, rival: true };
  });
  store(RIVALS_KEY, seen);
  return out;
}
// the ranking with my own level taken from this device; null when there is nobody to compare with
function rankRows() {
  const rows = (rank.rows || []).map(r => Object.assign({}, r));
  let mine = rows.find(r => r.me);
  if (!mine) { mine = { name: 'Jij', level: 0, me: true }; rows.push(mine); }
  mine.level = Math.max(mine.level, P.level);
  // the rivals are there for opa: they always sit around opa's level, also on someone else's device
  const opa = rows.find(r => normName(r.name) === 'opa');
  if (opa && opa.level > 0) {
    const taken = new Set(rows.map(r => normName(r.name)));
    for (const r of rivalLevels(opa.level)) if (!taken.has(normName(r.name))) rows.push(r);
  }
  if (!rows.some(r => !r.me)) return null;
  rows.sort((a, b) => b.level - a.level || (a.me ? -1 : b.me ? 1 : 0));
  const crown = rows.filter(r => r.level > 0).length > 1 && rows.filter(r => r.level === rows[0].level).length === 1;
  return { rows, mine, crown };
}
// how a row is named: opa sees himself as "Aad"; anyone else sees "<name> (jij)"
function shownName(x) {
  if (!x.me) return x.name;
  if (normName(x.name) === 'opa') return 'Aad';
  return x.name === 'Jij' ? 'Jij' : x.name + ' (jij)';
}
// Nothing may need scrolling: while the box is too tall, take out the list row farthest from "me"
// (rivals before family). The rows stay in order; a gap is not shown.
const overflowing = e => !!e && typeof e.scrollHeight === 'number' && e.scrollHeight > e.clientHeight + 1;
function fitList(scroller, list, min = 3) {
  if (!scroller || !list || typeof scroller.scrollHeight !== 'number') return;
  const rows = () => [...list.children];
  let guard = 40;
  while (guard-- > 0 && overflowing(scroller) && rows().length > min) {
    const all = rows(), me = all.findIndex(li => li.classList.contains('me'));
    // farthest first; rivals before family; at the same distance the one below goes before the one to catch
    const far = all.map((li, i) => ({ li, d: Math.abs(i - me) + (li.classList.contains('real') ? 0 : 0.5) + (i > me ? 0.25 : 0) })).filter(x => !x.li.classList.contains('me'))
      .sort((a, b) => b.d - a.d)[0];
    if (!far) break;
    far.li.remove();
  }
}

// the line under a ranking: who is next to catch, or who is right behind
function rankNote(r) {
  const { rows, mine } = r;
  const known = rows.filter(x => x.me || x.level > 0);
  const ahead = known.filter(x => x.level > mine.level).sort((a, b) => a.level - b.level)[0];
  const behind = known.filter(x => !x.me && x.level < mine.level).sort((a, b) => b.level - a.level)[0];
  const lv = n => `${n} ${n === 1 ? 'level' : 'levels'}`;
  return ahead ? `Nog ${lv(ahead.level - mine.level)} en je haalt ${ahead.name} in!`
    : behind ? `Je staat bovenaan! ${behind.name} zit ${lv(mine.level - behind.level)} achter je.`
    : known.length > 1 ? 'Jullie staan gelijk!' : 'Het level van de anderen verschijnt zodra zij weer Sudoku spelen.';
}
// position marker: medals for the first three (once there is a level), then numbers
const rankPos = (r, i, x) => (x.level > 0 && i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1));
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

const andList = xs => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' en ' + xs[xs.length - 1] : xs.join('');
// Who did I pass since the last finished level? Remembered on this device as the names that were above me.
const RANK_SEEN = 'sudoku.rankSeen';
function passedSinceLast(r) {
  const above = r.rows.slice(0, r.rows.indexOf(r.mine)).map(x => normName(x.name));
  const before = load(RANK_SEEN, null);
  store(RANK_SEEN, above);
  if (!Array.isArray(before)) return [];
  const nowBelow = new Set(r.rows.slice(r.rows.indexOf(r.mine) + 1).map(x => normName(x.name)));
  return r.rows.filter(x => before.includes(normName(x.name)) && nowBelow.has(normName(x.name))).map(x => x.name);
}

// the ranking on the points receipt: a short list with me in it, and a cheer when I passed someone
function renderReceiptRank() {
  const box = $('rcRank'); if (!box) return;
  const r = rankRows();
  if (!r) { box.hidden = true; return; }
  if (RC.passed == null) RC.passed = passedSinceLast(r);
  box.replaceChildren();
  const at = r.rows.indexOf(r.mine);
  // everyone when it fits; otherwise the real family, me, and who is just ahead and just behind
  let show = r.rows.map((x, i) => i);
  if (show.length > 6) {
    const pick = new Set([at, at - 1, at + 1, at - 2].filter(i => i >= 0 && i < r.rows.length));
    r.rows.forEach((x, i) => { if (!x.rival && pick.size < 6) pick.add(i); });
    show = [...pick].sort((a, b) => a - b);
  }
  const head = el('p', 'rc-lb-head' + (RC.passed.length ? ' cheer' : ''),
    RC.passed.length ? `🎉 Je bent ${andList(RC.passed)} voorbij!` : '🏆 ' + rankNote(r));
  const list = el('ol', 'rc-lb');
  show.forEach(i => {
    const x = r.rows[i];
    const li = el('li', x.me ? 'me' + (RC.passed.length ? ' up' : '') : x.rival ? '' : 'real');
    li.append(el('span', 'pos', rankPos(r, i, x)), el('span', 'nm', shownName(x).replace(' (jij)', '')), el('span', 'lb-lv', x.level ? String(x.level) : '–'));
    list.appendChild(li);
  });
  box.append(head, list);
  box.hidden = false;
  fitList($('receipt'), list);
}

// the ranking card on the start screen
function renderRanking() {
  if (RC.open) renderReceiptRank();
  if (screen === 'Stats') renderStats();
  const box = $('homeRank'); if (!box) return;
  const ranked = rankRows();
  if (!ranked) { box.hidden = true; fitHome(); return; }
  const { rows, crown } = ranked;
  const list = $('rankList'); list.replaceChildren();
  // everyone real always stays on the list; rivals fill it up to six places
  const keep = new Set(rows.map((r, i) => (r.rival ? -1 : i)).filter(i => i >= 0));
  rows.forEach((r, i) => { if (keep.size < 6 && r.rival) keep.add(i); });
  rows.forEach((r, i) => {
    if (!keep.has(i)) return;
    const li = el('li', (r.me ? 'me ' : r.rival ? '' : 'real ') + (i === 0 ? 'first' : ''));
    li.append(el('span', 'pos', i === 0 && crown ? '👑' : String(i + 1)), el('span', 'nm', shownName(r)),
      el('span', 'rk-lv' + (r.level ? '' : ' unknown'), r.level ? `level ${r.level}` : 'level volgt'));
    list.appendChild(li);
  });
  $('rankNote').textContent = rankNote(ranked);
  box.hidden = false;
  fitHome();
}
// the start screen shrinks step by step until it fits: compact top block, fewer ranking rows, no extra line
function fitHome() {
  const body = document.querySelector('.home-body');
  if (!body || screen !== 'Home' || !body.classList) return;
  body.classList.remove('c1', 'c2', 'c3');
  const list = $('rankList');
  if (overflowing(body)) body.classList.add('c1');
  fitList(body, list, 3);
  if (overflowing(body)) body.classList.add('c2');
  fitList(body, list, 2);
  if (overflowing(body)) body.classList.add('c3');
}
addEventListener('resize', () => { if (screen === 'Home') renderRanking(); });

/* ---------- levels ---------- */
let lvPage = null;
const PAGE = 25;          // 5 × 5 tiles fill the screen; two pages per medal (every 50 levels)
function renderLevels() {
  const maxPage = Math.floor((P.level - 1) / PAGE) + 1;   // pages that hold unlocked levels, plus the next one
  if (lvPage == null || lvPage > maxPage) lvPage = Math.floor((P.level - 1) / PAGE);
  $('lvRange').textContent = `Level ${lvPage * PAGE + 1}–${(lvPage + 1) * PAGE}`;
  $('lvPrev').disabled = lvPage <= 0; $('lvNext').disabled = lvPage >= maxPage;
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
}
$('lvPrev').addEventListener('click', () => { if (lvPage > 0) { sound('tap'); lvPage--; renderLevels(); } });
$('lvNext').addEventListener('click', () => { sound('tap'); lvPage++; renderLevels(); });
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

/* ---------- ranking screen (the "Ranglijst" tab); your own numbers are one tap away ---------- */
function renderStats() {
  const body = $('sBody');
  body.replaceChildren();
  const r = rankRows();
  let list = null;
  if (r) {
    const top = Math.max(1, ...r.rows.map(x => x.level || 0));
    list = el('ol', 'lb');
    r.rows.forEach((x, i) => {
      const li = el('li', (x.me ? 'me' : x.rival ? '' : 'real') + (i < 3 && x.level > 0 ? ' top' + (i + 1) : ''));
      li.style.setProperty('--w', Math.round(100 * (x.level || 0) / top) + '%');
      const lv = el('span', 'lb-lv'); lv.append(el('small', null, 'level'), el('b', null, x.level ? String(x.level) : '–'));
      li.append(el('span', 'pos', rankPos(r, i, x)), el('span', 'nm', shownName(x)), lv);
      list.appendChild(li);
    });
    body.append(list, el('p', 'lb-note', rankNote(r)));
  } else {
    body.append(el('p', 'lb-note', 'De ranglijst verschijnt zodra de anderen ook Sudoku spelen.'));
  }
  const mine = el('button', 'btn my-btn', 'Jouw cijfers');
  mine.addEventListener('click', () => { sound('tap'); myNumbersSheet(); });
  body.appendChild(mine);
  if (list) fitList(body, list);
}
function myNumbersSheet() {
  const best = Object.values(P.best);
  const box = (label, val, cls = '') => `<div class="stat ${cls}"><span>${label}</span><b>${val}</b></div>`;
  sheet(`<h2>Jouw cijfers</h2>
    <div class="stat-grid">${box('Totaalscore', fmtNum(P.total))}${box('Huidig level', P.level)}${box('Sterren', fmtNum(starsTotal()), 'gold')}${box('Medailles', medals(), 'gold')}
    ${box('Drie sterren', best.filter(b => b.t === 3).length)}${box('Gewonnen op rij', P.wins)}${box('Langste reeks', P.bestWins)}${box('Uitdagingen', Object.keys(dailyDone).length)}</div>
    <div class="btns"><button class="btn primary big" data-a="close">Sluiten</button></div>`, { close: closeSheet });
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
  try { if (window.SudokuApp) window.SudokuApp.setBars(dark ? '#15191f' : '#ffffff'); } catch (e) {}
  if (G && screen === 'Game') render();
}
if (darkMQ && darkMQ.addEventListener) darkMQ.addEventListener('change', applySettings);

/* ================= landing page ================= */
const IN_APP = /SudokuApp\//.test(navigator.userAgent || '');          // the Android app (WebView)
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IS_ANDROID = /Android/.test(navigator.userAgent || '');
const isStandalone = () => IN_APP || window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
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

/* ================= move progress to another device =================
   The progress travels inside a link (#overzetten=…): levels, stars, points, daily challenges, settings and
   the device code for the family overview, so the new device continues as the same player. */
const TRANSFER = '#overzetten=';
const b64url = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64url = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/')); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
/* The code is kept short so its QR code stays easy to scan from a screen:
   "2" + fields joined by "X" (all other characters are 0-9 a-z), or "3" + the same text deflated in base64url.
   Fields: device key (hex) · level · total · wins · best streak · played · stars per level ("0"–"3" from level 1)
   · daily challenges of the last 120 days (3-char day number + stars) · settings. Scores per level are not
   carried over (they only matter when replaying a level). The last field is the level-list epoch: codes from
   before the new level list (other epoch, or the older "j"/"z" full-JSON codes) are refused. */
const B36 = n => Math.max(0, Math.round(Number(n) || 0)).toString(36);
const DAY0 = Date.UTC(2024, 0, 1), DAY = 86400000;
const dayNum = k => { const [y, m, d] = k.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - DAY0) / DAY); };
const dayKey = n => { const d = new Date(DAY0 + n * DAY); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };
const SET_BOOLS = Object.keys(DEF).filter(k => typeof DEF[k] === 'boolean');
const SET_OPTS = { theme: ['licht', 'donker', 'auto'], size: ['normaal', 'groot'] };
function progressText() {
  const key = playTracking?.deviceId || (load('patience.sharing.v1', {}) || {}).key || '';
  const top = Object.keys(P.best).map(Number).filter(n => n > 0).reduce((a, n) => Math.max(a, n), 0);
  let stars = '';
  for (let n = 1; n <= top; n++) stars += P.best[n] ? String(Math.min(3, Math.max(0, P.best[n].t || 0))) : '0';
  const today = dayNum(todayKey());
  const daily = Object.keys(dailyDone).filter(k => /^\d{4}-\d\d-\d\d$/.test(k)).map(k => [dayNum(k), dailyDone[k]])
    .filter(([n]) => n >= 0 && n > today - 120 && n < 46656).sort((x, y) => x[0] - y[0])
    .map(([n, d]) => n.toString(36).padStart(3, '0') + Math.min(3, Math.max(0, (d && d.stars) || 0))).join('');
  const bits = SET_BOOLS.reduce((m, k, i) => m | (S[k] ? 1 << i : 0), 0);
  const set = B36(bits) + Object.keys(SET_OPTS).map(k => Math.max(0, SET_OPTS[k].indexOf(S[k]))).join('');
  return [/^[a-f0-9]{32}$/.test(key) ? key : '', B36(P.level), B36(P.total), B36(P.wins), B36(P.bestWins), B36(P.played), stars, daily, set, String(LEVELS_EPOCH)].join('X');
}
async function packProgress() {
  const text = progressText();
  let best = '2' + text;
  if (window.CompressionStream) {
    try { const z = '3' + b64url(await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw'))); if (z.length < best.length) best = z; } catch (e) {}
  }
  return best;
}
function parseProgressText(text) {
  const f = text.split('X');
  if (f.length < 9) throw new Error('bad');
  if (Number(f[9]) !== LEVELS_EPOCH) throw new Error('old');   // made before the new level list
  const num = x => { const n = parseInt(x || '0', 36); return Number.isFinite(n) ? n : 0; };
  const best = {};
  [...f[6]].forEach((c, i) => { if (c !== '0') best[i + 1] = { s: 0, t: Math.min(3, Number(c) || 0) }; });
  const done = {};
  for (let i = 0; i + 4 <= f[7].length; i += 4) done[dayKey(parseInt(f[7].slice(i, i + 3), 36))] = { time: 0, score: 0, stars: Number(f[7][i + 3]) || 0 };
  const bits = num(f[8].slice(0, -2)), opts = f[8].slice(-2);
  const settings = { v: 2 };
  SET_BOOLS.forEach((k, i) => { settings[k] = !!(bits & (1 << i)); });
  Object.keys(SET_OPTS).forEach((k, i) => { settings[k] = SET_OPTS[k][Number(opts[i])] || DEF[k]; });
  const level = Math.max(1, num(f[1]));
  return { v: 1, key: f[0] || null, done, S: settings,
    P: { level, best, total: num(f[2]), fails: {}, wins: num(f[3]), bestWins: num(f[4]), played: num(f[5]) } };
}
async function unpackProgress(code) {
  let d;
  if (code[0] === '2') d = parseProgressText(code.slice(1));
  else if (code[0] === '3') d = parseProgressText(new TextDecoder().decode(await pipe(unb64url(code.slice(1)), new DecompressionStream('deflate-raw'))));
  else throw new Error('old');                                  // full-JSON codes are from before the new level list
  if (!d || d.v !== 1 || !d.P || !(d.P.level >= 1) || typeof d.P.best !== 'object') throw new Error('bad');
  return d;
}
function loadScript(src) {
  return new Promise((ok, fail) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = fail; document.head.appendChild(el); });
}
function transferMenu() {
  const canScan = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  sheet(`<h2>Voortgang overzetten</h2>
    <p>Speel verder op een ander apparaat met je level, punten en sterren.</p>
    <div class="btns">
      <button class="btn primary big" data-a="scan">Hierheen halen<small>${canScan ? 'code van het andere apparaat scannen' : 'link van het andere apparaat plakken'}</small></button>
      <button class="btn big" data-a="show">Naar een ander apparaat<small>code op dit apparaat tonen</small></button>
      <button class="btn ghost" data-a="close">Annuleren</button>
    </div>`, { scan: scanSheet, show: transferSheet, close: closeSheet });
}
// the code from a transfer link, a bare code, or null
function transferCode(text) {
  const t = String(text || '').trim();
  const i = t.indexOf(TRANSFER);
  const code = i >= 0 ? t.slice(i + TRANSFER.length) : t;
  return /^[zj23][A-Za-z0-9_-]{8,}$/.test(code) ? code : null;
}
const SCAN_VERSION = 3;
async function scanSheet() {
  const canScan = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  sheet(`<h2>Code scannen</h2>
    <p>Kies op het andere apparaat bij Instellingen → <b>Voortgang overzetten</b> → <b>Naar een ander apparaat</b>. Houd de telefoon zo dat de QR-code het kader vult.</p>
    ${canScan ? '<div class="scan"><video playsinline muted autoplay></video><i></i></div><p class="scan-msg" id="scanMsg">Camera starten…</p>' : ''}
    <div class="paste"><input id="pasteLink" type="text" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="…of plak hier de link"><button class="btn" data-a="paste">Gebruiken</button></div>
    <div class="btns"><button class="btn ghost" data-a="close">Annuleren</button></div>
    <p class="scan-ver">scanner ${SCAN_VERSION}</p>`, {
    paste: () => {
      const code = transferCode($('pasteLink').value);
      if (code) importCode(code); else toast('Dat is geen overzet-link.');
    },
    close: closeSheet,
  });
  if (!canScan) return;
  const video = document.querySelector('.scan video'), msg = $('scanMsg');
  let stream = null, alive = true, raf = 0;
  scanStop = () => { alive = false; cancelAnimationFrame(raf); if (stream) stream.getTracks().forEach(t => t.stop()); video.srcObject = null; };
  const myStop = scanStop;
  // two readers: the phone's own (BarcodeDetector, when there is one) and jsQR; they take turns, because the
  // phone's reader can claim to work and still find nothing
  let detector = null;
  try { if (window.BarcodeDetector && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; }
  try {
    const [media] = await Promise.all([
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false }),
      window.jsQR ? null : loadScript('jsqr.js?v=1').catch(() => {}),
    ]);
    stream = media;
    if (!alive || scanStop !== myStop) { stream.getTracks().forEach(t => t.stop()); return; }
    const track = stream.getVideoTracks()[0];
    try { const caps = track.getCapabilities ? track.getCapabilities() : {}; if (caps.focusMode && caps.focusMode.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch (e) {}
    video.srcObject = stream; await video.play().catch(() => {});
    msg.textContent = 'Richt de camera op de QR-code.';
  } catch (e) {
    if (scanStop === myStop) scanStop = null;
    if (stream) stream.getTracks().forEach(t => t.stop());
    if (!alive) return;
    msg.textContent = e && e.name === 'NotAllowedError' ? 'Geen toegang tot de camera. Sta de camera toe, of plak de link hieronder.' : 'De camera werkt hier niet. Plak de link hieronder.';
    document.querySelector('.scan').hidden = true;
    return;
  }
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  let last = 0, busy = false, round = 0;
  const found = text => {
    const code = transferCode(text);
    if (!code) { msg.textContent = 'Dit is niet de goede code. Gebruik de code bij Voortgang overzetten.'; return; }
    sound('tap'); stopScan(); importCode(code);
  };
  // jsQR on the middle of the picture at full sharpness, a closer look, and now and then the whole picture
  const CROPS = [0.8, 0.55, 0.8, 1];
  const readJsQR = () => {
    const vw = video.videoWidth, vh = video.videoHeight;
    const f = CROPS[round++ % CROPS.length];
    const sw = f === 1 ? vw : Math.min(vw, vh) * f, sh = f === 1 ? vh : sw;
    const sx = (vw - sw) / 2, sy = (vh - sh) / 2;
    const k = Math.min(1, 900 / Math.max(sw, sh));
    canvas.width = Math.round(sw * k); canvas.height = Math.round(sh * k);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' });
    return r && r.data;
  };
  let turn = 0, tries = 0;
  const tick = async t => {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    if (busy || t - last < 90 || video.readyState < 2 || !video.videoWidth) return;
    last = t; busy = true;
    try {
      let text = null;
      if (detector && turn++ % 2 === 0) {
        try { const codes = await detector.detect(video); text = codes.length ? codes[0].rawValue : null; } catch (e) { detector = null; }
      } else if (window.jsQR) text = readJsQR();
      if (text && alive) found(text);
      else if (++tries === 60) msg.textContent = 'Nog niet gelukt? Iets dichterbij of verder weg houden, of scan de code met de gewone camera-app.';
    } catch (e) { /* try again next frame */ } finally { busy = false; }
  };
  raf = requestAnimationFrame(tick);
}
async function transferSheet() {
  sheet(`<h2>Voortgang overzetten</h2><p>Even geduld…</p>`, {});
  const link = location.origin + location.pathname + TRANSFER + await packProgress();
  let qr = '';
  try {
    if (!window.qrcode) await loadScript('qrcode.js?v=1');
    const q = window.qrcode(0, 'M'); q.addData(link); q.make();
    qr = q.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  } catch (e) { qr = ''; }
  sheet(`<h2>Voortgang overzetten</h2>
    <p>Kies op je andere telefoon bij Instellingen → Voortgang overzetten → <b>Hierheen halen</b> en scan deze code, of stuur jezelf de link. Daar ga je verder op <b>level ${P.level}</b> met ${fmtNum(P.total)} punten.</p>
    ${qr ? `<div class="qr">${qr}</div>` : '<p>De link is te lang voor een QR-code; kopieer of deel de link.</p>'}
    <div class="btns">
      ${navigator.share ? '<button class="btn primary big" data-a="share">Link delen</button>' : ''}
      <button class="btn${navigator.share ? '' : ' primary big'}" data-a="copy">Link kopiëren</button>
      <button class="btn ghost" data-a="close">Klaar</button>
    </div>`, {
    share: () => navigator.share({ title: 'Sudoku voortgang', url: link }).catch(() => {}),
    copy: () => (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => toast('Link gekopieerd.'), () => toast('Kopiëren lukte niet.')),
    close: closeSheet,
  });
}
async function importFromLink() {
  if (!String(location.hash || '').startsWith(TRANSFER)) return;
  const code = location.hash.slice(TRANSFER.length);
  history.replaceState(null, '', location.pathname + location.search);
  importCode(code, true);
}
async function importCode(code, fromLink) {
  let d;
  try { d = await unpackProgress(code); } catch (e) { toast(e && e.message === 'old' ? 'Deze code is van vóór de nieuwe levels. Maak op het andere apparaat een nieuwe code.' : 'Deze overzet-link werkt niet. Maak een nieuwe.', 4500); return; }
  const lower = d.P.level < P.level;
  sheet(`<h2>Voortgang overzetten?</h2>
    <p>Hier verder gaan op <b>level ${d.P.level}</b> met ${fmtNum(d.P.total)} punten.${lower ? ` Let op: dit apparaat staat nu verder, op level ${P.level}.` : ''}</p>
    <div class="btns">${fromLink && IS_ANDROID && !IN_APP ? `<a class="btn primary big" href="intent://overzetten/${code}#Intent;scheme=sudokuopa;package=nl.dennis.sudoku;end">In de Android-app openen</a><button class="btn" data-a="ok">Hier in de browser overzetten</button>` : '<button class="btn primary big" data-a="ok">Overzetten</button>'}<button class="btn ghost" data-a="no">Niet doen</button></div>`, {
    ok: () => {
      store(LS.prog, d.P); store(LS.done, d.done || {});
      if (d.S && typeof d.S === 'object') store(LS.set, Object.assign({}, DEF, d.S));
      if (d.key && /^[a-f0-9]{32}$/.test(d.key)) store('patience.sharing.v1', { key: d.key });
      store(LS.main, null); store(RANK_KEY, null);
      location.reload();
    },
    no: closeSheet,
  });
}

/* ---------- the Android app ----------
   A small APK (android/) that shows this game full screen. The link to it is deliberately tiny and is not
   shown on iPhones or inside the app itself. */
const APK = 'sudoku.apk';
async function androidSheet() {
  const url = new URL(APK, location.href).href;
  let qr = '';
  if (!IS_ANDROID) {
    try {
      if (!window.qrcode) await loadScript('qrcode.js?v=1');
      const q = window.qrcode(0, 'M'); q.addData(url); q.make();
      qr = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (e) { qr = ''; }
  }
  sheet(`<h2>Sudoku-app voor Android</h2>
    <p>${IS_ANDROID ? 'Download de app (150 kB) en open het bestand.' : 'Scan de code met je Android-telefoon, download de app (150 kB) en open het bestand.'}
    Vraagt de telefoon om toestemming om apps te installeren, sta dat dan één keer toe.</p>
    ${qr ? `<div class="qr">${qr}</div>` : ''}
    <p>Je voortgang neem je mee via Instellingen → <b>Voortgang overzetten</b>.</p>
    <div class="btns">${IS_ANDROID ? `<a class="btn primary big" href="${APK}" download="Sudoku.apk">App downloaden</a>` : ''}<button class="btn ghost" data-a="close">Sluiten</button></div>`, {
    close: closeSheet,
  });
}
$('ldAndroid').hidden = IS_IOS || IN_APP;
$('ldAndroid').addEventListener('click', androidSheet);
// the app's back button: close a sheet, then go back to the start screen, then leave the app
window.__appBack = () => {
  if (sheetOpen && !sheetLocked) { closeSheet(); return true; }
  if (!$('receipt').hidden) return true;                // the receipt has its own button
  if (screen !== 'Home') { show('Home'); return true; }
  return false;
};

/* ================= boot ================= */
function boot() {
  applySettings();
  const m = savedMain();
  if (m && !m.G.won && !m.G.lost) { G = prepare(m.G); H = m.H || []; sel = G.sel != null ? G.sel : -1; notesMode = !!G.notesMode; }
  show('Home');
  if (!isStandalone()) showLanding(false);
  importFromLink();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
// testing hook
window.__sudoku = { RC, myNumbersSheet, gameOverSheet, packProgress, unpackProgress, transferCode, get deviceId() { return playTracking?.deviceId; }, get G() { return G; }, set G(v) { G = v; }, get sel() { return sel; }, select, input, hint, undo, erase, toggleNotes, newGame, playLevel, show, render, P, S, win, levelSheet, settingsSheet, dailyDone, finishReceipt, closeReceipt, renderReceiptRank, levelEntry, baseFor, LEVEL_COUNT, dailyEntry };
boot();
})();
