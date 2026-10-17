const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./harness.cjs');
const C = require('../core.js');

const empties = g => g.puz.flatMap((v, i) => v ? [] : [i]);
const put = (a, i, d) => { a.game.select(i); a.game.input(d); };

test('levels 1–1000 are doable and unique, harder levels come after 1000', () => {
  const a = app(), g = a.game;
  assert.ok(g.LEVEL_COUNT >= 1700);
  for (const n of [1, 2, 50, 200, 400, 401, 650, 700, 701, 850, 999, 1000]) {
    const e = g.levelEntry(n);
    assert.equal(C.solve(e.puz, 2).count, 1, `level ${n} unique`);
    assert.ok(C.rate(e.puz).level <= 2, `level ${n} doable`);
  }
  for (const n of [1001, 1200, 1500, g.LEVEL_COUNT, g.LEVEL_COUNT + 1, g.LEVEL_COUNT + 777]) {
    const e = g.levelEntry(n);
    assert.equal(C.solve(e.puz, 2).count, 1, `level ${n} unique`);
    assert.ok(C.rate(e.puz).level >= 3, `level ${n} hard`);
  }
  const clues = n => g.levelEntry(n).puz.filter(Boolean).length;
  assert.ok(clues(1) > clues(500) && clues(500) > clues(1000));
});

test('every correct number scores, runs add a growing bonus, a mistake resets the run', () => {
  const a = app(), g = a.game; g.newGame(1);
  const [x, y, z, w] = empties(g.G);
  put(a, x, g.G.sol[x]); assert.equal(g.G.score >= 10, true);
  const s1 = g.G.score; put(a, y, g.G.sol[y]);
  assert.equal(g.G.pts.streakPts, 2); assert.ok(g.G.score - s1 >= 12);
  put(a, z, g.G.sol[z] % 9 + 1); assert.equal(g.G.streak, 0); assert.equal(g.G.mistakes, 1);
  const s3 = g.G.score; put(a, w, g.G.sol[w]); assert.ok(g.G.score - s3 >= 10 && g.G.pts.streakPts === 2);
});

test('a clean finish gives three stars, unlocks the next level and adds to the total', () => {
  const a = app(), g = a.game; g.newGame(1);
  for (const i of empties(g.G)) put(a, i, g.G.sol[i]);
  const G = g.G, R = G.result;
  assert.equal(G.won, true); assert.equal(R.stars, 3);
  assert.equal(G.pts.num, empties(G).length);
  assert.equal(G.score, G.pts.numPts + G.pts.streakPts + G.pts.unitPts + G.pts.digitPts + R.lvlBonus + R.noMis + R.noHint);
  assert.equal(g.P.level, 2); assert.equal(g.P.best[1].t, 3); assert.equal(g.P.total, G.score);
  // replaying with a lower score never lowers the total
  g.newGame(1); g.hint();
  for (const i of empties(g.G)) if (g.G.val[i] !== g.G.sol[i]) put(a, i, g.G.sol[i]);
  assert.equal(g.G.result.stars, 2); assert.equal(g.P.best[1].t, 3); assert.equal(g.P.level, 2);
  assert.equal(g.P.total, Math.max(G.score, g.G.score));
});

test('hints give no points; after losing a level twice it may be skipped', () => {
  const a = app(), g = a.game; g.newGame(1);
  g.select(-1); const before = g.G.score; g.hint();
  assert.equal(g.G.pts.num, 0); assert.ok(g.G.score - before <= 80);
  for (let round = 0; round < 2; round++) {
    g.newGame(1);
    for (const i of empties(g.G).slice(0, 3)) put(a, i, g.G.sol[i] % 9 + 1);
    assert.equal(g.G.lost, true);
  }
  assert.equal(g.P.fails[1], 2);
});
