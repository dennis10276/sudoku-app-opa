const { test } = require('node:test');
const assert = require('node:assert/strict');
const { app } = require('./harness.cjs');
const C = require('../core.js');

const empties = g => g.puz.flatMap((v, i) => v ? [] : [i]);
const put = (a, i, d) => { a.game.select(i); a.game.input(d); };

test('all puzzles form one gentle line: only singles up to level 1000, pairs from 1001, hardest at the end', () => {
  const a = app(), g = a.game, N = g.LEVEL_COUNT;
  assert.ok(N >= 3500);
  const tierAt = n => C.rate(g.levelEntry(n).puz).level;
  for (let n = 1; n <= 1000; n += 1) assert.equal(tierAt(n), 1, `level ${n} only needs singles`);
  assert.equal(tierAt(1001), 2, 'level 1001 is the first that needs a pair');
  for (let n = 1001; n <= 1400; n += 41) assert.ok(tierAt(n) <= 2, `level ${n} still doable`);
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
    if (prev != null) { assert.ok(avg >= prev - .35, `no drop at ${s}`); assert.ok(avg - prev <= 1.4, `no jump at ${s}: ${prev} → ${avg}`); }   // steepest step: into expert, ~level 1800
    prev = avg;
  }
  const clues = n => { let c = 0; for (let k = n; k < n + 50; k++) c += g.levelEntry(k).puz.filter(Boolean).length; return c / 50; };
  assert.ok(clues(1) > clues(500) && clues(500) > clues(1000));
  // ordered by how many squares can be filled straight away: 25 at level 1, falling to about 9 at level 1000
  const startFill = n => { const st = C.makeState(g.levelEntry(n).puz), can = new Set();
    for (let i = 0; i < 81; i++) if (!st.v[i] && C.POP[st.c[i]] === 1) can.add(i);
    for (let u = 0; u < 27; u++) for (let d = 1; d <= 9; d++) { const b = C.BIT(d); let pos = -1, k = 0, done = false;
      for (const j of C.UNITS[u]) { if (st.v[j] === d) { done = true; break; } if (!st.v[j] && (st.c[j] & b)) { k++; pos = j; } }
      if (!done && k === 1) can.add(pos); }
    return can.size; };
  assert.equal(startFill(1), 25);
  let last = 99;
  for (let n = 1; n <= 1000; n++) { const f = startFill(n); assert.ok(f <= last, `level ${n} not easier than level ${n - 1}`); last = f; }
  assert.ok(startFill(1000) >= 9);
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
  const sud = mode => ({ x: { app: 'sudoku', detail: { mode, build: 'sudoku-15' } } });
  const remote = url => url.includes('/players.json')
    ? { [A]: { name: 'Dennis' }, [B]: { name: 'dennis ' }, [D]: { name: 'DennisTEST' } }
    : url.includes(A) ? sud('L20|21') : url.includes(B) ? sud('D|25') : url.includes(D) ? sud('L900|900') : null;
  const a = app(remote);
  a.game.show('Home');
  await new Promise(r => setTimeout(r, 20));
  const rows = a.nodes.get('rankList').children.map(li => li.children.map(c => c.textContent).join(' ')).filter(r => !/Joop|Marianne|Frits|Lies/.test(r));
  assert.ok(rows[0].endsWith('Dennis level 25')); assert.ok(rows.some(r => r.endsWith('Jij level 1')));
  assert.match(a.nodes.get('rankNote').textContent, /^Nog \d+ levels? en je haalt \S+ in!$/);
});

test('players without a reported level yet still appear, and the ranking shows up', async () => {
  const A = 'a'.repeat(32);
  const remote = url => url.includes('/players.json') ? { [A]: { name: 'Opa' } } : url.includes(A) ? { x: { app: 'sudoku', detail: { build: 'sudoku-7' } } } : null;
  const a = app(remote);
  a.game.show('Home');
  await new Promise(r => setTimeout(r, 20));
  const rows = a.nodes.get('rankList').children.map(li => li.children.map(c => c.textContent).join(' '));
  assert.ok(rows.some(r => r.endsWith('Jij level 1'))); assert.ok(rows.some(r => r.endsWith('Opa level volgt')));
  assert.equal(a.nodes.get('homeRank').hidden, false);
});

test('rivals stay close to opa, never go back and are shown like everyone else', async () => {
  let a;
  a = app(url => url.includes('/players.json') ? { [a.game.deviceId]: { name: 'Opa' } } : null);
  const g = a.game;
  g.P.level = 40; g.show('Home');
  await new Promise(r => setTimeout(r, 20)); g.show('Home');
  const levels = () => Object.fromEntries(a.nodes.get('rankList').children.map(li => [li.children[1].textContent, Number(li.children[2].textContent.replace('level ', ''))]));
  const first = levels();
  for (const name of ['Joop', 'Marianne', 'Frits', 'Lies']) assert.ok(Math.abs(first[name] - 40) <= 16, `${name} near opa`);
  assert.ok(first.Joop > 40 && first.Lies < 40);
  g.P.level = 20; g.show('Home');
  const later = levels();
  for (const name of ['Joop', 'Marianne', 'Frits', 'Lies']) assert.ok(later[name] >= first[name], `${name} never goes back`);
  assert.equal(a.nodes.get('homeRank').hidden, false);
});

test('on opa\'s phone he is called Aad, and the family is always on the receipt line', async () => {
  const C = 'c'.repeat(32);
  let a;
  const remote = url => url.includes('/players.json') ? { [a.game.deviceId]: { name: 'OPa' }, [C]: { name: 'Dennis' } }
    : url.includes(C) ? { x: { app: 'sudoku', detail: { mode: 'L90|90', build: 'sudoku-15' } } } : null;
  a = app(remote);
  a.game.P.level = 5; a.game.show('Home');
  await new Promise(r => setTimeout(r, 20));
  const names = a.nodes.get('rankList').children.map(li => li.children[1].textContent);
  assert.ok(names.includes('Aad')); assert.ok(names.includes('Dennis'));
  a.game.renderReceiptRank();
  const chips = a.nodes.get('rcRank').children.slice(1).map(c => c.textContent);
  assert.ok(chips.some(c => /Dennis 90$/.test(c)), chips.join(' | '));
  assert.ok(chips.some(c => /Aad 5$/.test(c)), chips.join(' | '));
  assert.equal(a.game.P.level, 5);
  assert.ok(chips.length <= 4);
});

test('on someone else\'s device the rivals sit around opa\'s level, not around mine', async () => {
  const A = 'a'.repeat(32);
  let a;
  const remote = url => url.includes('/players.json') ? { [a.game.deviceId]: { name: 'Dennis' }, [A]: { name: 'Opa' } }
    : url.includes(A) ? { x: { app: 'sudoku', detail: { mode: 'L30|30', build: 'sudoku-15' } } } : null;
  a = app(remote);
  a.game.P.level = 300; a.game.show('Home');
  await new Promise(r => setTimeout(r, 20)); a.game.show('Home');
  const lv = Object.fromEntries(a.nodes.get('rankList').children.map(li => [li.children[1].textContent, li.children[2].textContent]));
  for (const name of ['Joop', 'Marianne', 'Frits', 'Lies']) {
    const n = Number(lv[name].replace('level ', ''));
    assert.ok(Math.abs(n - 30) <= 12, `${name} ${n} near opa`);
  }
});

test('without a known level for opa there are no rivals', async () => {
  const a = app(() => null);
  a.game.P.level = 50; a.game.show('Home');
  await new Promise(r => setTimeout(r, 20));
  const list = a.nodes.get('rankList');
  const names = list ? list.children.map(li => li.children[1].textContent) : [];
  assert.ok(!names.some(n => /Joop|Marianne|Frits|Lies/.test(n)), names.join(','));
});

test('the transfer code is short and brings level, stars, dailies, settings and the device key across', async () => {
  const a = app(() => null);
  const g = a.game;
  Object.assign(g.P, { level: 13, total: 15400, wins: 3, bestWins: 6, played: 15 });
  for (let n = 1; n <= 12; n++) g.P.best[n] = { s: 900 + n, t: n % 4 === 0 ? 2 : 3 };
  const today = new Date(), key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const d1 = key(today), d0 = key(new Date(today.getTime() - 3 * 86400000));
  g.dailyDone[d1] = { time: 300, score: 2000, stars: 3 }; g.dailyDone[d0] = { time: 400, score: 1000, stars: 2 };
  g.S.theme = 'donker'; g.S.sound = false;
  const code = await g.packProgress();
  assert.ok(code.length < 140, `code length ${code.length}`);
  assert.equal(g.transferCode('https://x/sudoku-app-opa/#overzetten=' + code), code);
  const d = await g.unpackProgress(code);
  assert.equal(d.P.level, 13); assert.equal(d.P.total, 15400); assert.equal(d.P.bestWins, 6); assert.equal(d.P.played, 15);
  assert.equal(Object.keys(d.P.best).length, 12); assert.equal(d.P.best[4].t, 2); assert.equal(d.P.best[5].t, 3);
  assert.equal(d.done[d1].stars, 3); assert.equal(d.done[d0].stars, 2);
  assert.equal(d.S.theme, 'donker'); assert.equal(d.S.sound, false); assert.equal(d.S.autoCheck, true); assert.equal(d.S.v, 2);
  assert.match(String(d.key || ''), /^([a-f0-9]{32})?$/);
});

test('levels reported before the new level list are ignored in the ranking', async () => {
  const A = 'a'.repeat(32), B = 'b'.repeat(32);
  const remote = url => url.includes('/players.json') ? { [A]: { name: 'Dennis' }, [B]: { name: 'Opa' } }
    : url.includes(A) ? { x: { app: 'sudoku', detail: { mode: 'L13|13', build: 'sudoku-14' } }, y: { app: 'sudoku', detail: { mode: 'L2|3', build: 'sudoku-15' } } }
    : url.includes(B) ? { x: { app: 'sudoku', detail: { mode: 'L40|40', build: 'sudoku-12' } } } : null;
  const a = app(remote);
  a.game.show('Home');
  await new Promise(r => setTimeout(r, 20));
  const rows = a.nodes.get('rankList').children.map(li => li.children.map(c => c.textContent).join(' '));
  assert.ok(rows.some(r => r.endsWith('Dennis level 3')), rows.join(' | '));
  assert.ok(rows.some(r => r.endsWith('Opa level volgt')), rows.join(' | '));
});

test('a code from before the new level list is refused', async () => {
  const a = app(() => null);
  await assert.rejects(a.game.unpackProgress('2X5X0X0X0X0XX' + 'X1000X2'), /old/);
  await assert.rejects(a.game.unpackProgress('jeyJ2IjoxfQ'), /old/);
});

test('the new level list sends everyone back to level 1 once; daily challenges and settings stay', () => {
  const before = {
    'sudoku.progress': JSON.stringify({ level: 13, best: { 1: { s: 900, t: 3 } }, total: 15400, fails: {}, wins: 3, bestWins: 6, played: 15 }),
    'sudoku.dailyDone': JSON.stringify({ '2026-10-10': { time: 300, score: 2000, stars: 3 } }),
    'sudoku.settings': JSON.stringify({ theme: 'donker', v: 2 }),
    'sudoku.rivals': JSON.stringify({ Joop: 20 }),
  };
  const a = app(() => null, before);
  assert.equal(a.game.P.level, 1); assert.equal(a.game.P.total, 0); assert.deepEqual(Object.keys(a.game.P.best), []);
  assert.equal(a.game.dailyDone['2026-10-10'].stars, 3);
  assert.equal(a.game.S.theme, 'donker');
  // once: progress made after the reset stays
  const later = app(() => null, { 'sudoku.levelsEpoch': '3', 'sudoku.progress': JSON.stringify({ level: 4, best: {}, total: 900 }) });
  assert.equal(later.game.P.level, 4);
});
