const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./harness.cjs');
const C = require('../core.js');

const empties = g => g.puz.flatMap((v, i) => v ? [] : [i]);
const put = (a, i, d) => { a.game.select(i); a.game.input(d); };

test('all puzzles form one gentle line: only easy thinking up to level 1000, hardest at the end', () => {
  const a = app(), g = a.game, N = g.LEVEL_COUNT;
  assert.ok(N >= 4000);
  const tierAt = n => C.rate(g.levelEntry(n).puz).level;
  for (let n = 1; n <= 1000; n += 37) assert.equal(tierAt(n), 1, `level ${n} only needs singles`);
  for (let n = 1001; n <= 1500; n += 41) assert.ok(tierAt(n) <= 2, `level ${n} still doable`);
  for (const n of [N - 50, N, N + 1, N + 999]) {
    const e = g.levelEntry(n);
    assert.equal(C.solve(e.puz, 2).count, 1, `level ${n} unique`);
    assert.ok(tierAt(n) >= 3, `level ${n} hard`);
  }
  // gentle: the average difficulty of each block of 200 levels never jumps
  let prev = null;
  for (let s = 1; s + 199 <= N; s += 200) {
    let sum = 0, k = 0;
    for (let n = s; n < s + 200; n += 10) { sum += tierAt(n); k++; }
    const avg = sum / k;
    if (prev != null) { assert.ok(avg >= prev - .35, `no drop at ${s}`); assert.ok(avg - prev <= 1.2, `no jump at ${s}: ${prev} → ${avg}`); }
    prev = avg;
  }
  const clues = n => g.levelEntry(n).puz.filter(Boolean).length;
  assert.ok(clues(1) > clues(500) && clues(500) > clues(1000));
});

test('the daily challenge is a puzzle from around the player level', () => {
  const a = app(), g = a.game;
  const e = g.dailyEntry('2026-10-17', 1);
  assert.equal(C.solve(e.puz, 2).count, 1);
  assert.equal(C.rate(e.puz).level, 1);
  assert.deepEqual(g.dailyEntry('2026-10-17', 1).puz, e.puz);
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

test('the ranking shows the family by level, one person per name, test devices left out', async () => {
  const A = 'a'.repeat(32), B = 'b'.repeat(32), D = 'd'.repeat(32);
  const sud = mode => ({ x: { app: 'sudoku', detail: { mode } } });
  const remote = url => url.includes('/players.json')
    ? { [A]: { name: 'Dennis' }, [B]: { name: 'dennis ' }, [D]: { name: 'DennisTEST' } }
    : url.includes(A) ? sud('L20|21') : url.includes(B) ? sud('D|25') : url.includes(D) ? sud('L900|900') : null;
  const a = app(remote);
  a.game.show('Home');
  await new Promise(r => setTimeout(r, 20));
  const rows = a.nodes.get('rankList').children.map(li => li.children.map(c => c.textContent).join(' '));
  assert.deepEqual(rows, ['👑 Dennis level 25', '2 Jij level 1']);
  assert.match(a.nodes.get('rankNote').textContent, /Nog 24 levels en je haalt Dennis in/);
});
