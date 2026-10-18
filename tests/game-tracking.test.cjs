const { test } = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('./harness.cjs');
const blank = a => a.game.G.puz.findIndex(v => !v);

test('opening a Sudoku and selecting a cell do not count a puzzle; first number does', async () => {
  const a = app(); a.game.newGame(1); a.game.select(blank(a)); a.advance(10); await a.flush();
  assert.equal(a.records.size, 0);
  a.game.input(a.game.G.sol[a.game.sel]); a.advance(5); a.nodes.get('gPause').listeners.click(); await a.flush();
  const r = [...a.records.values()][0];
  assert.equal(r.detail.reason, 'pause'); assert.equal(r.detail.actions.input, 1); assert.equal(r.detail.progress, 1); assert.equal(r.detail.initial, 0);
  assert.equal(r.games, 1); assert.equal(r.seconds, 5); assert.equal(r.level, 'easy'); assert.equal(r.active, false);
});

test('notes count one puzzle even before the normal game counter starts', async () => {
  const a = app(); a.game.newGame(800); a.game.select(blank(a)); a.game.toggleNotes();
  a.game.input(1); a.game.input(2); a.game.toggleNotes(); a.game.input(a.game.G.sol[a.game.sel]);
  a.nodes.get('gPause').listeners.click(); await a.flush();
  assert.equal([...a.records.values()].reduce((n, r) => n + r.games, 0), 1);
});

test('pause, menus and navigation stop tracking; resumed play does not count another puzzle', async () => {
  const a = app(); a.game.newGame(500); a.game.hint(); a.advance(4);
  a.nodes.get('gPause').listeners.click(); a.advance(30); await a.flush();
  assert.equal([...a.records.values()][0].seconds, 4);
  a.nodes.get('gResume').listeners.click(); a.game.select(blank(a)); a.advance(3);
  a.game.settingsSheet(); a.advance(30); await a.flush();
  assert.equal([...a.records.values()].reduce((n, r) => n + r.seconds, 0), 7);
  assert.equal([...a.records.values()].reduce((n, r) => n + r.games, 0), 1);
  assert.ok([...a.records.values()].every(r => r.active === false));
});

test('hints and a completed daily Sudoku reach the same compact summary', async () => {
  const a = app(); a.game.newGame(1, '2026-10-11'); a.game.hint();
  const i = blank(a); a.game.G.val = a.game.G.sol.slice(); a.game.G.val[i] = 0;
  a.game.select(i); a.game.input(a.game.G.sol[i]); await a.flush();
  const r = [...a.records.values()][0];
  assert.equal(r.detail.reason, 'won'); assert.equal(r.detail.progress, r.detail.total); assert.equal(r.detail.actions.hint, 1);
  assert.equal(r.hints, 1); assert.equal(r.wins, 1); assert.equal(r.games, 1); assert.equal(r.daily, true); assert.equal(r.active, false);
});

test('three mistakes stop the session immediately at game over', async () => {
  const a = app(); a.game.newGame(1);
  for (const i of a.game.G.puz.flatMap((v, i) => v ? [] : [i]).slice(0, 3)) {
    a.game.select(i); a.game.input(a.game.G.sol[i] % 9 + 1);
  }
  a.advance(20); await a.flush();
  const r = [...a.records.values()][0];
  assert.equal(r.detail.reason, 'lost'); assert.equal(r.detail.lastAction, 'mistake'); assert.equal(r.detail.actions.input, 3); assert.equal(r.detail.actions.mistake, 3);
  assert.equal(a.game.G.lost, true); assert.equal(r.mistakes, 3); assert.equal(r.active, false); assert.equal(r.seconds, 0);
});

test('a saved game from before tracking resumes without counting as a new puzzle', async () => {
  const a = app(); a.game.newGame(1); a.game.G.counted = true;
  a.game.select(blank(a)); a.game.input(a.game.G.sol[a.game.sel]);
  a.game.show('Home'); await a.flush();
  assert.equal([...a.records.values()][0].games, 0);
});

test('restarting counts a new attempt and switching levels closes the previous session', async () => {
  const a = app(); a.game.newGame(1); a.game.hint();
  a.game.levelSheet(true);
  a.nodes.get('modal').firstElementChild.onclick({ target: { closest: () => ({ dataset: { a: 'restart' } }) } });
  const hardLevel = Array.from({ length: a.game.LEVEL_COUNT }, (_, i) => i + 1).find(n => a.game.levelEntry(n).band === 'hard');
  a.game.hint(); a.game.newGame(hardLevel); a.game.hint(); a.game.show('Home'); await a.flush();
  const records = [...a.records.values()];
  assert.equal(records.length, 3); assert.equal(records.reduce((n, r) => n + r.games, 0), 3);
  assert.deepEqual(records.map(r => r.level), ['easy', 'easy', 'hard']);
  assert.ok(records.every(r => r.active === false));
  assert.deepEqual(records.map(r => r.detail.reason), ['restart', 'new_game', 'menu']);
  assert.equal(new Set(records.map(r => r.detail.round)).size, 3);
});

test('the family overview learns which level is played and how far opa has come', async () => {
  const a = app(); a.game.newGame(1); a.game.select(blank(a)); a.game.input(a.game.G.sol[a.game.sel]);
  a.nodes.get('gPause').listeners.click(); await a.flush();
  const r = [...a.records.values()][0];
  assert.equal(r.detail.mode, 'L1|1'); assert.equal(r.detail.build, 'sudoku-11');
});
