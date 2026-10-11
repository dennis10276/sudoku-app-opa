const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

// Run the actual game and tracker together; the DOM only supplies rendering surfaces.
function app() {
  let now = Date.parse('2026-10-11T10:00:00Z');
  const nodes = new Map(), intervals = [], saved = new Map(), records = new Map();
  function node() {
    return {
      children: [], dataset: {}, hidden: true, textContent: '', className: '', listeners: {},
      style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} }, clientWidth: 600, clientHeight: 600,
      addEventListener(k, fn) { this.listeners[k] = fn; }, setAttribute() {}, scrollIntoView() {},
      appendChild(n) { this.children.push(n); }, querySelector() { return node(); },
      get firstChild() { return this.children[0]; }, get firstElementChild() { return this.children[0]; },
      get lastChild() { return this.children.at(-1); },
      set innerHTML(value) {
        this.html = value;
        if (value.startsWith('<span class="v">')) {
          const notes = node(); notes.children = Array.from({ length: 9 }, node);
          this.children = [node(), notes];
        }
      }, get innerHTML() { return this.html || ''; }
    };
  }
  const get = id => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  get('modal').children.push(node());
  const context = vm.createContext({
    Date: class extends Date { static now() { return now; } }, Intl, crypto: webcrypto, AbortController,
    navigator: { onLine: true, standalone: true }, location: { protocol: 'https:' },
    localStorage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) },
    document: { hidden: false, body: node(), documentElement: node(), getElementById: get, createElement: node,
      querySelector: get, querySelectorAll: () => [], addEventListener() {} },
    setInterval(fn, ms) { intervals.push({ fn, ms }); }, setTimeout() { return 1; }, clearTimeout() {},
    requestAnimationFrame(fn) { fn(); }, getComputedStyle: () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0' }),
    addEventListener() {}, SUDOKU_TRACKING: { databaseUrl: 'https://example.firebasedatabase.app' },
    async fetch(url, options) { if (url.includes('/sessions/')) records.set(url, JSON.parse(options.body)); return { ok: true }; }
  });
  context.window = context; context.self = context;
  for (const file of ['core.js', 'puzzles.js', 'tracking.js', 'game.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  return {
    game: context.__sudoku, nodes, records,
    advance(seconds) { for (let i = 0; i < seconds; i++) { now += 1000; intervals.filter(x => x.ms === 1000).forEach(x => x.fn()); } },
    async flush() { await new Promise(r => setImmediate(r)); await context.SudokuTracking.flush(); }
  };
}
const blank = a => a.game.G.puz.findIndex(v => !v);

test('opening a Sudoku and selecting a cell do not count a puzzle; first number does', async () => {
  const a = app(); a.game.newGame('easy'); a.game.select(blank(a)); a.advance(10); await a.flush();
  assert.equal(a.records.size, 0);
  a.game.input(a.game.G.sol[a.game.sel]); a.advance(5); a.nodes.get('gPause').listeners.click(); await a.flush();
  const r = [...a.records.values()][0];
  assert.equal(r.games, 1); assert.equal(r.seconds, 5); assert.equal(r.level, 'easy'); assert.equal(r.active, false);
});

test('notes count one puzzle even before the normal game counter starts', async () => {
  const a = app(); a.game.newGame('hard'); a.game.select(blank(a)); a.game.toggleNotes();
  a.game.input(1); a.game.input(2); a.game.toggleNotes(); a.game.input(a.game.G.sol[a.game.sel]);
  a.nodes.get('gPause').listeners.click(); await a.flush();
  assert.equal([...a.records.values()].reduce((n, r) => n + r.games, 0), 1);
});

test('pause, menus and navigation stop tracking; resumed play does not count another puzzle', async () => {
  const a = app(); a.game.newGame('medium'); a.game.hint(); a.advance(4);
  a.nodes.get('gPause').listeners.click(); a.advance(30); await a.flush();
  assert.equal([...a.records.values()][0].seconds, 4);
  a.nodes.get('gResume').listeners.click(); a.game.select(blank(a)); a.advance(3);
  a.game.settingsSheet(); a.advance(30); await a.flush();
  assert.equal([...a.records.values()].reduce((n, r) => n + r.seconds, 0), 7);
  assert.equal([...a.records.values()].reduce((n, r) => n + r.games, 0), 1);
  assert.ok([...a.records.values()].every(r => r.active === false));
});

test('hints and a completed daily Sudoku reach the same compact summary', async () => {
  const a = app(); a.game.newGame('expert', '2026-10-11'); a.game.hint();
  const i = blank(a); a.game.G.val = a.game.G.sol.slice(); a.game.G.val[i] = 0;
  a.game.select(i); a.game.input(a.game.G.sol[i]); await a.flush();
  const r = [...a.records.values()][0];
  assert.equal(r.hints, 1); assert.equal(r.wins, 1); assert.equal(r.games, 1); assert.equal(r.daily, true); assert.equal(r.active, false);
});

test('three mistakes stop the session immediately at game over', async () => {
  const a = app(); a.game.newGame('easy');
  for (const i of a.game.G.puz.flatMap((v, i) => v ? [] : [i]).slice(0, 3)) {
    a.game.select(i); a.game.input(a.game.G.sol[i] % 9 + 1);
  }
  a.advance(20); await a.flush();
  const r = [...a.records.values()][0];
  assert.equal(a.game.G.lost, true); assert.equal(r.mistakes, 3); assert.equal(r.active, false); assert.equal(r.seconds, 0);
});

test('a saved game from before tracking resumes without counting as a new puzzle', async () => {
  const a = app(); a.game.newGame('easy'); a.game.G.counted = true;
  a.game.select(blank(a)); a.game.input(a.game.G.sol[a.game.sel]);
  a.game.show('Home'); await a.flush();
  assert.equal([...a.records.values()][0].games, 0);
});

test('restarting counts a new attempt and switching levels closes the previous session', async () => {
  const a = app(); a.game.newGame('easy'); a.game.hint();
  a.game.levelSheet(true);
  a.nodes.get('modal').firstElementChild.onclick({ target: { closest: () => ({ dataset: { a: 'restart' } }) } });
  a.game.hint(); a.game.newGame('hard'); a.game.hint(); a.game.show('Home'); await a.flush();
  const records = [...a.records.values()];
  assert.equal(records.length, 3); assert.equal(records.reduce((n, r) => n + r.games, 0), 3);
  assert.deepEqual(records.map(r => r.level), ['easy', 'easy', 'hard']);
  assert.ok(records.every(r => r.active === false));
});
