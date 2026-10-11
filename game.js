/* Sudoku voor opa – klassieke sudoku zonder reclame. */
(() => {
'use strict';
const C = window.SudokuCore;
const playTracking = window.SudokuTracking;
const $ = id => document.getElementById(id);
const LS = { set: 'sudoku.settings', main: 'sudoku.game', daily: 'sudoku.dailyGames', stats: 'sudoku.stats', done: 'sudoku.dailyDone' };
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

const LEVELS = [
  { k: 'easy', n: 'Makkelijk', base: 15 },
  { k: 'medium', n: 'Gemiddeld', base: 25 },
  { k: 'hard', n: 'Moeilijk', base: 40 },
  { k: 'expert', n: 'Expert', base: 60 },
  { k: 'master', n: 'Meester', base: 80 },
  { k: 'extreme', n: 'Extreem', base: 100 },
];
const LV = Object.fromEntries(LEVELS.map((l, i) => [l.k, Object.assign({ i }, l)]));
const DEF = {
  sound: true, autoCheck: true, mistakeLimit: true, showTime: true,
  hlDup: true, hlArea: true, hlSame: true, autoNotes: true, hideUsed: true,
  theme: 'licht', size: 'normaal',
};
const S = Object.assign({}, DEF, load(LS.set, {}));
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
const fmtNum = n => (n || 0).toLocaleString('nl-NL');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAY_FMT = new Intl.DateTimeFormat('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
const MONTH_FMT = new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' });
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const keyDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => dateKey(new Date());

/* ================= puzzles ================= */
// A stored puzzle is reshuffled (digits relabelled, rows/columns swapped within bands, bands swapped,
// optionally mirrored). That keeps the puzzle and its difficulty intact but makes every game look new.
function makePuzzle(level, rnd) {
  const bank = PUZZLES[level], count = bank.length / 81;
  const idx = Math.floor(rnd() * count);
  const g = bank.substr(idx * 81, 81).split('').map(Number);
  const dm = [0].concat(shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rnd));
  const order = () => { const o = []; for (const b of shuffle([0, 1, 2], rnd)) for (const r of shuffle([0, 1, 2], rnd)) o.push(b * 3 + r); return o; };
  const ro = order(), co = order(), tr = rnd() < .5;
  const out = new Array(81);
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    const v = g[ro[r] * 9 + co[c]];
    out[tr ? c * 9 + r : r * 9 + c] = dm[v];
  }
  return out;
}
const DAILY_LEVEL = ['hard', 'easy', 'medium', 'medium', 'hard', 'medium', 'expert']; // zo, ma, di, wo, do, vr, za
const dailyLevel = key => DAILY_LEVEL[keyDate(key).getDay()];

/* ================= state ================= */
let G = null;          // current game
let H = [];            // undo history
let sel = -1;          // selected cell
let notesMode = false;
let paused = false;
let screen = 'Home';
let returnTo = 'Home';

const stats = load(LS.stats, {});
LEVELS.forEach(l => { stats[l.k] = Object.assign({ started: 0, won: 0, noMistake: 0, bestTime: 0, totalTime: 0, bestScore: 0, streak: 0, bestStreak: 0 }, stats[l.k] || {}); });
const saveStats = () => store(LS.stats, stats);
const dailyDone = load(LS.done, {});
const dailyGames = load(LS.daily, {});

function saveGame() {
  if (!G) return;
  G.sel = sel; G.notesMode = notesMode;
  const data = { G, H: H.slice(-300) };
  if (G.daily) {
    dailyGames[G.daily] = data;
    // keep only the most recent few unfinished daily games
    const keys = Object.keys(dailyGames).sort();
    while (keys.length > 12) delete dailyGames[keys.shift()];
    store(LS.daily, dailyGames);
  } else store(LS.main, data);
}
function savedMain() { const d = load(LS.main, null); return d && d.G && Array.isArray(d.G.val) ? d : null; }

function newGame(level, daily = null) {
  endTracking('new_game');
  if (!daily) abandonMain();
  const rnd = mulberry(daily ? hashStr('dag-' + daily) : (Math.random() * 4294967296) >>> 0);
  const puz = makePuzzle(level, rnd);
  const sol = C.solve(puz, 1).solution;
  G = {
    level, daily, puz, sol, val: puz.slice(), notes: new Array(81).fill(0), playId: playTracking?.newRound(),
    mistakes: 0, score: 0, time: 0, hints: 0, chances: 0,
    counted: false, won: false, lost: false,
    scored: new Array(81).fill(0), hinted: new Array(81).fill(0),
  };
  H = []; sel = -1; notesMode = false; paused = false;
  saveGame();
  openGame();
}
// starting a new game while one is unfinished ends the winning streak
function abandonMain() {
  const d = savedMain();
  if (d && d.G.counted && !d.G.won) { stats[d.G.level].streak = 0; saveStats(); }
  if (G && !G.daily) G = null;
}
function resume(data) {
  endTracking('menu');
  G = data.G; H = data.H || []; sel = G.sel != null ? G.sel : -1; notesMode = !!G.notesMode; paused = false;
  openGame();
  if (G.lost) setTimeout(gameOverSheet, 250);
}
function restartGame() {
  endTracking('restart');
  G.playId = playTracking?.newRound();
  G.trackingStarted = false;
  G.val = G.puz.slice(); G.notes.fill(0); G.mistakes = 0; G.score = 0; G.time = 0; G.hints = 0; G.chances = 0;
  G.won = false; G.lost = false; G.scored.fill(0); G.hinted.fill(0);
  H = []; sel = -1; notesMode = false; paused = false;
  saveGame(); openGame();
}

/* ================= board ================= */
const boardEl = $('board');
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
function renderInfo() {
  $('gTitle').textContent = G.daily ? DAY_FMT.format(keyDate(G.daily)).replace(/^\w+ /, '') : LV[G.level].n;
  $('gMist').textContent = S.mistakeLimit ? `${G.mistakes}/3` : String(G.mistakes);
  $('gMistBox').classList.toggle('err', G.mistakes > 0);
  $('gScore').textContent = fmtNum(G.score);
  $('gTime').textContent = fmtTime(G.time);
}
function anim(i, cls, delay = 0) {
  const el = cellEls[i];
  setTimeout(() => {
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 1300);
  }, delay);
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
  return { round: G.playId, build: 'sudoku-4', level: G.level, daily: !!G.daily,
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
  if (!G.daily) { stats[G.level].started++; saveStats(); }
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
  if (S.autoCheck && wrong) {
    G.mistakes++;
    playTracking?.mistake();
    sound('err'); anim(i, 'shake');
    render(); saveGame();
    if (S.mistakeLimit && G.mistakes >= 3) { G.lost = true; endTracking('lost'); saveGame(); setTimeout(gameOverSheet, 650); }
    return;
  }
  if (!wrong) placedCorrect(i, false);
  else sound('tap');
  render(); saveGame();
  checkFinished();
}
function placedCorrect(i, viaHint) {
  const base = LV[G.level].base;
  let units = 0;
  if (!viaHint && !G.scored[i]) { G.scored[i] = 1; G.score += base; }
  for (const u of C.CELL_UNITS[i]) {
    const cells = C.UNITS[u];
    if (cells.every(j => G.val[j] === G.sol[j])) {
      units++;
      if (!viaHint) G.score += base;
      cells.forEach(j => anim(j, 'flash', 40 * Math.max(Math.abs(C.ROW[j] - C.ROW[i]), Math.abs(C.COL[j] - C.COL[i]))));
    }
  }
  sound(units ? 'unit' : 'tap');
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
  placedCorrect(cell, true);
  render(); saveGame();
  toast(msg, 4200);
  checkFinished();
}

/* ================= win / lose ================= */
function win() {
  playTracking?.state(trackingDetails()); playTracking?.win();
  G.won = true; G.sel = sel = -1;
  const l = LV[G.level];
  let record = false;
  if (!G.daily) {
    const s = stats[G.level];
    s.won++; if (!G.mistakes && !G.chances) s.noMistake++;
    s.totalTime += G.time;
    if (!s.bestTime || G.time < s.bestTime) { record = s.won > 1; s.bestTime = G.time; }
    s.bestScore = Math.max(s.bestScore, G.score);
    s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak);
    saveStats();
    store(LS.main, null);
  } else {
    const prev = dailyDone[G.daily];
    if (!prev || G.time < prev.time) dailyDone[G.daily] = { time: G.time, score: G.score };
    store(LS.done, dailyDone);
    delete dailyGames[G.daily]; store(LS.daily, dailyGames);
  }
  render();
  for (let i = 0; i < 81; i++) anim(i, 'flash', 45 * (C.ROW[i] + C.COL[i]));
  setTimeout(() => sound('win'), 250);
  setTimeout(() => winSheet(record), 1300);
  void l;
}
function winSheet(record) {
  const daily = G.daily;
  sheet(`
    <div class="result-ic"><svg viewBox="0 0 24 24"><use href="#i-trophy"/></svg></div>
    <h2>${daily ? 'Uitdaging voltooid!' : 'Uitstekend!'}</h2>
    <div class="res-table">
      <div><span>${daily ? 'Dag' : 'Moeilijkheid'}</span><b>${daily ? esc(DAY_FMT.format(keyDate(daily))) : LV[G.level].n}</b></div>
      ${daily ? `<div><span>Moeilijkheid</span><b>${LV[G.level].n}</b></div>` : ''}
      <div><span>Tijd</span><b>${fmtTime(G.time)}${record ? '<span class="rec">Record!</span>' : ''}</b></div>
      <div><span>Score</span><b>${fmtNum(G.score)}</b></div>
      ${S.autoCheck ? `<div><span>Fouten</span><b>${G.mistakes}</b></div>` : ''}
    </div>
    <div class="btns">
      ${daily ? '<button class="btn primary big" data-a="cal">Naar de kalender</button>' : '<button class="btn primary big" data-a="new">Nieuw spel</button>'}
      <button class="btn ghost" data-a="home">Naar start</button>
    </div>`, {
    cal: () => { closeSheet(); show('Daily'); },
    new: () => { closeSheet(); levelSheet(false); },
    home: () => { closeSheet(); show('Home'); },
  }, { locked: true });
}
function gameOverSheet() {
  if (!G || !G.lost) return;
  sheet(`
    <div class="result-ic bad"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg></div>
    <h2>Spel voorbij</h2>
    <p>Je hebt 3 fouten gemaakt. Wil je verder spelen met een tweede kans?</p>
    <div class="btns">
      <button class="btn primary big" data-a="again">Tweede kans</button>
      <button class="btn" data-a="restart">Opnieuw beginnen</button>
      ${G.daily ? '<button class="btn ghost" data-a="cal">Naar de kalender</button>' : '<button class="btn ghost" data-a="new">Nieuw spel</button>'}
    </div>`, {
    again: () => { G.lost = false; G.mistakes = 2; G.chances++; saveGame(); closeSheet(); trackAction('second_chance'); render(); },
    restart: () => { closeSheet(); restartGame(); },
    cal: () => { closeSheet(); show('Daily'); },
    new: () => { closeSheet(); levelSheet(false); },
  }, { locked: true });
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

function levelSheet(inGame) {
  const dots = k => '<span class="dots">' + LEVELS.map((l, i) => `<i class="${i <= LV[k].i ? 'f' : ''}"></i>`).join('') + '</span>';
  const acts = {};
  LEVELS.forEach(l => { acts['l-' + l.k] = () => { closeSheet(); newGame(l.k); }; });
  acts.restart = () => { closeSheet(); restartGame(); };
  sheet(`<h2>Nieuw spel</h2>
    <div class="lvl-list">
      ${LEVELS.map(l => `<button data-a="l-${l.k}"><span>${l.n}</span>${dots(l.k)}</button>`).join('')}
      ${inGame && G && !G.won ? '<button class="restart" data-a="restart"><svg viewBox="0 0 24 24" width="22" height="22"><use href="#i-undo"/></svg>Opnieuw beginnen</button>' : ''}
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
  acts.install = () => { closeSheet(); showLanding(true); };
  acts.resetStats = () => confirmSheet('Statistieken wissen?', 'Alle statistieken worden op nul gezet. Dit kan niet ongedaan worden gemaakt.', 'Wissen', () => {
    LEVELS.forEach(l => Object.keys(stats[l.k]).forEach(x => { stats[l.k][x] = 0; }));
    saveStats(); renderStats(); toast('Statistieken gewist.');
  });
  sheet(`<h2>Instellingen</h2>
    <div class="set-group"><h4>Weergave</h4>
      <div class="set-row"><span>Grootte cijfers</span>${seg('size', [['normaal', 'Normaal'], ['groot', 'Groot']])}</div>
      <div class="set-row"><span>Kleur</span>${seg('theme', [['licht', 'Licht'], ['donker', 'Donker'], ['auto', 'Auto']])}</div>
      ${sw('showTime', 'Tijd tonen')}
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
      <button class="set-row link" data-a="rules">Spelregels</button>
      <button class="set-row link" data-a="install">Op het beginscherm zetten</button>
      <button class="set-row link" data-a="resetStats" style="color:var(--err)">Statistieken wissen</button>
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
function rulesSheet(back) {
  sheet(`<h2>Spelregels</h2>
    <div class="rules">
      <p>Een sudoku heeft 9 rijen, 9 kolommen en 9 blokken van 3×3 vakjes.</p>
      <p>Vul de lege vakjes met de getallen <b>1 tot en met 9</b>. Elk getal mag in elke <b>rij</b>, elke <b>kolom</b> en elk <b>blok</b> maar één keer voorkomen.</p>
      <p><b>Invullen:</b> tik op een vakje en daarna op een getal onderaan.</p>
      <p><b>Notities:</b> zet Notities aan om kleine hulpgetallen in een vakje te zetten. Tik nog eens op hetzelfde getal om het weer weg te halen.</p>
      <p><b>Hint:</b> kies een leeg vakje en tik op Hint, of tik op Hint zonder vakje: dan wordt een makkelijk vakje voor je ingevuld, met uitleg.</p>
      <p><b>Fouten:</b> een fout getal wordt rood. Na 3 fouten is het spel voorbij, maar je kunt verder met een tweede kans. Dit kan uit bij Instellingen.</p>
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
function sound(kind) {
  if (!S.sound || !AC) return;
  try {
    if (kind === 'tap') tone(880, .06, 'sine', .05);
    else if (kind === 'err') { tone(220, .18, 'triangle', .12); tone(180, .22, 'triangle', .1, .08); }
    else if (kind === 'unit') { tone(784, .12, 'sine', .07); tone(1047, .2, 'sine', .07, .08); }
    else if (kind === 'win') [523, 659, 784, 1047].forEach((f, k) => tone(f, .35, 'sine', .08, k * .13));
  } catch (e) {}
}

/* ================= screens ================= */
function show(name) {
  if (name !== 'Game') endTracking('menu');
  screen = name;
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr' + name));
  document.body.classList.toggle('tabs', name !== 'Game');
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  if (name !== 'Game') { if (G) saveGame(); paused = false; }
  if (name === 'Home') renderHome();
  if (name === 'Daily') renderDaily();
  if (name === 'Stats') renderStats();
  if (name === 'Game') relayout();
}
function openGame() {
  if (screen !== 'Game') returnTo = G.daily ? 'Daily' : 'Home';
  $('paused').hidden = true;
  show('Game'); render();
}
document.querySelectorAll('.tabbar button').forEach(b => b.addEventListener('click', () => { sound('tap'); show(b.dataset.tab); }));
document.querySelectorAll('[data-act="settings"]').forEach(b => b.addEventListener('click', () => { sound('tap'); settingsSheet(); }));

/* ---------- home ---------- */
function miniGrid() {
  const v = [5, 3, '', 6, '', 1, '', 9, 8];
  return '<div class="mini">' + v.map((x, k) => `<i class="${k === 4 ? 's' : k === 5 ? 'u' : (k === 3 || k === 1 || k === 7) ? 'r' : ''}">${x}</i>`).join('') + '</div>';
}
$('homeArt').innerHTML = miniGrid();
$('ldGrid').innerHTML = miniGrid();
function renderHome() {
  const tk = todayKey(), d = new Date();
  $('homeDailyDay').textContent = d.getDate();
  $('homeDailyDate').textContent = DAY_FMT.format(d);
  const go = $('homeDailyGo');
  go.classList.toggle('done', !!dailyDone[tk]);
  go.textContent = dailyDone[tk] ? '✓ Voltooid' : dailyGames[tk] ? 'Verder' : 'Spelen';
  const m = savedMain();
  const cont = $('homeContinue');
  if (m && !m.G.won) {
    cont.hidden = false;
    $('homeContinueSub').textContent = `${LV[m.G.level].n} · ${fmtTime(m.G.time)}`;
    $('homeNew').classList.remove('primary');
  } else { cont.hidden = true; $('homeNew').classList.add('primary'); }
}
$('homeContinue').addEventListener('click', () => {
  sound('tap');
  const m = savedMain();
  if (G && !G.daily && !G.won) openGame(); else if (m) resume(m); else levelSheet(false);
});
$('homeNew').addEventListener('click', () => { sound('tap'); levelSheet(false); });
$('homeDaily').addEventListener('click', () => { sound('tap'); calSel = todayKey(); calMonth = null; show('Daily'); });

/* ---------- daily ---------- */
let calMonth = null, calSel = null;
const MIN_MONTH = new Date(2026, 0, 1);
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
  const lv = LV[dailyLevel(calSel)].n, dn = dailyDone[calSel];
  info.innerHTML = `<b>${esc(DAY_FMT.format(keyDate(calSel)))}</b> · ${lv}` + (dn ? `<br>Voltooid in ${fmtTime(dn.time)} ✓` : '');
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
  newGame(dailyLevel(k), k);
});

/* ---------- stats ---------- */
let statLevel = 'easy';
function renderStats() {
  $('sChips').innerHTML = LEVELS.map(l => `<button data-l="${l.k}" class="${l.k === statLevel ? 'on' : ''}">${l.n}</button>`).join('');
  const s = stats[statLevel];
  const box = (label, val) => `<div class="stat"><span>${label}</span><b>${val}</b></div>`;
  const pct = s.started ? Math.round(100 * s.won / s.started) + '%' : '–';
  $('sBody').innerHTML = `
    <h3>Spellen</h3>
    <div class="stat-grid">${box('Gestart', s.started)}${box('Gewonnen', s.won)}${box('Winstpercentage', pct)}${box('Zonder fouten', s.noMistake)}</div>
    <h3>Tijd</h3>
    <div class="stat-grid">${box('Beste tijd', s.bestTime ? fmtTime(s.bestTime) : '–')}${box('Gemiddelde tijd', s.won ? fmtTime(s.totalTime / s.won) : '–')}</div>
    <h3>Reeks en score</h3>
    <div class="stat-grid">${box('Huidige reeks', s.streak)}${box('Beste reeks', s.bestStreak)}${box('Beste score', s.bestScore ? fmtNum(s.bestScore) : '–')}${box('Dagelijkse uitdagingen', Object.keys(dailyDone).length)}</div>`;
}
$('sChips').addEventListener('click', e => {
  const b = e.target.closest('button[data-l]'); if (!b) return;
  sound('tap'); statLevel = b.dataset.l; renderStats();
});

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
function relayout() {
  if (screen !== 'Game') return;
  const w = $('boardWrap');
  const cs = getComputedStyle(w);
  const aw = w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = w.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const size = Math.max(160, Math.min(aw, ah, 760));
  const cell = Math.floor((size - 14) / 9);
  document.documentElement.style.setProperty('--cs', cell + 'px');
}
if (window.ResizeObserver) new ResizeObserver(relayout).observe($('boardWrap'));
addEventListener('resize', relayout);
addEventListener('orientationchange', () => setTimeout(relayout, 250));
document.addEventListener('visibilitychange', () => { if (document.hidden && G) saveGame(); });
addEventListener('pagehide', () => { if (G) saveGame(); });
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
  const hasGame = !!savedMain() && !savedMain().G.won;
  $('ldPlay').textContent = hasGame ? 'Verder spelen' : 'Spelen';
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
  if (m && !m.G.won && !m.G.lost) { G = m.G; H = m.H || []; sel = G.sel != null ? G.sel : -1; notesMode = !!G.notesMode; }
  show('Home');
  if (!isStandalone()) showLanding(false);
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
// testing hook
window.__sudoku = { get G() { return G; }, set G(v) { G = v; }, get sel() { return sel; }, select, input, hint, undo, erase, toggleNotes, newGame, show, render, stats, S, win, levelSheet, settingsSheet, dailyDone };
boot();
})();
