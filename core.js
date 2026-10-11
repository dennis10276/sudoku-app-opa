// Shared Sudoku logic: solver, logical rater. Used by the generator (Node) and the game (browser).
(function (root) {
'use strict';
const ROW = [], COL = [], BOX = [], UNITS = [], PEERS = [], CELL_UNITS = [];
for (let i = 0; i < 81; i++) { ROW[i] = (i / 9) | 0; COL[i] = i % 9; BOX[i] = ((ROW[i] / 3) | 0) * 3 + ((COL[i] / 3) | 0); }
for (let u = 0; u < 27; u++) UNITS.push([]);
for (let i = 0; i < 81; i++) { UNITS[ROW[i]].push(i); UNITS[9 + COL[i]].push(i); UNITS[18 + BOX[i]].push(i); CELL_UNITS[i] = [ROW[i], 9 + COL[i], 18 + BOX[i]]; }
for (let i = 0; i < 81; i++) {
  const s = new Set();
  for (const u of CELL_UNITS[i]) for (const j of UNITS[u]) if (j !== i) s.add(j);
  PEERS[i] = [...s];
}
const BIT = d => 1 << (d - 1);
const ALL = 0x1ff;
const POP = []; for (let m = 0; m < 512; m++) { let c = 0, x = m; while (x) { c += x & 1; x >>= 1; } POP[m] = c; }
const DIG = m => { const r = []; for (let d = 1; d <= 9; d++) if (m & BIT(d)) r.push(d); return r; };
const sees = (a, b) => a !== b && (ROW[a] === ROW[b] || COL[a] === COL[b] || BOX[a] === BOX[b]);

/* ---------- backtracking solver (counts up to `limit` solutions) ---------- */
function solve(grid, limit = 2, rnd = null) {
  const g = grid.slice();
  const rows = new Array(9).fill(0), cols = new Array(9).fill(0), boxs = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) if (g[i]) {
    const b = BIT(g[i]);
    if ((rows[ROW[i]] | cols[COL[i]] | boxs[BOX[i]]) & b) return { count: 0, solution: null };
    rows[ROW[i]] |= b; cols[COL[i]] |= b; boxs[BOX[i]] |= b;
  }
  let count = 0, solution = null;
  function rec() {
    let best = -1, bestMask = 0, bestCnt = 10;
    for (let i = 0; i < 81; i++) if (!g[i]) {
      const m = ALL & ~(rows[ROW[i]] | cols[COL[i]] | boxs[BOX[i]]);
      const c = POP[m];
      if (c < bestCnt) { best = i; bestMask = m; bestCnt = c; if (c <= 1) break; }
    }
    if (best < 0) { count++; if (!solution) solution = g.slice(); return count >= limit; }
    if (!bestCnt) return false;
    let ds = DIG(bestMask);
    if (rnd) for (let k = ds.length - 1; k > 0; k--) { const j = Math.floor(rnd() * (k + 1)); [ds[k], ds[j]] = [ds[j], ds[k]]; }
    for (const d of ds) {
      const b = BIT(d);
      g[best] = d; rows[ROW[best]] |= b; cols[COL[best]] |= b; boxs[BOX[best]] |= b;
      if (rec()) return true;
      g[best] = 0; rows[ROW[best]] &= ~b; cols[COL[best]] &= ~b; boxs[BOX[best]] &= ~b;
    }
    return false;
  }
  rec();
  return { count, solution };
}

/* ---------- logical solver / rater ---------- */
// Levels: 1 singles, 2 locked candidates + pairs, 3 triples/quads + X-wing, 4 swordfish/XY-wing/XYZ-wing,
// 5 short contradiction chains, 6 needs more
function makeState(grid) {
  const v = grid.slice(), c = new Array(81).fill(0);
  for (let i = 0; i < 81; i++) if (!v[i]) {
    let m = ALL; for (const p of PEERS[i]) if (v[p]) m &= ~BIT(v[p]);
    c[i] = m;
  }
  return { v, c };
}
function place(st, i, d) {
  st.v[i] = d; st.c[i] = 0;
  const b = BIT(d); for (const p of PEERS[i]) st.c[p] &= ~b;
}
function elim(st, cells, mask) { let ch = false; for (const i of cells) if (!st.v[i] && (st.c[i] & mask)) { st.c[i] &= ~mask; ch = true; } return ch; }

// each step returns null or a description object
function stepSingles(st) {
  // full house / naked single first
  for (let i = 0; i < 81; i++) if (!st.v[i] && POP[st.c[i]] === 1) {
    const d = DIG(st.c[i])[0];
    return { tech: 'naked', cell: i, digit: d };
  }
  for (let u = 0; u < 27; u++) for (let d = 1; d <= 9; d++) {
    const b = BIT(d); let pos = -1, n = 0, done = false;
    for (const i of UNITS[u]) { if (st.v[i] === d) { done = true; break; } if (!st.v[i] && (st.c[i] & b)) { n++; pos = i; } }
    if (!done && n === 1) return { tech: 'hidden', cell: pos, digit: d, unit: u };
  }
  return null;
}
function combos(arr, k, start = 0, pre = [], out = []) {
  if (pre.length === k) { out.push(pre.slice()); return out; }
  for (let i = start; i < arr.length; i++) { pre.push(arr[i]); combos(arr, k, i + 1, pre, out); pre.pop(); }
  return out;
}
function stepLocked(st) {
  for (let b = 0; b < 9; b++) for (let d = 1; d <= 9; d++) {
    const bit = BIT(d), cells = UNITS[18 + b].filter(i => !st.v[i] && (st.c[i] & bit));
    if (cells.length < 2) continue;
    const r = ROW[cells[0]], c = COL[cells[0]];
    if (cells.every(i => ROW[i] === r) && elim(st, UNITS[r].filter(i => BOX[i] !== b), bit)) return true;
    if (cells.every(i => COL[i] === c) && elim(st, UNITS[9 + c].filter(i => BOX[i] !== b), bit)) return true;
  }
  for (let u = 0; u < 18; u++) for (let d = 1; d <= 9; d++) {
    const bit = BIT(d), cells = UNITS[u].filter(i => !st.v[i] && (st.c[i] & bit));
    if (cells.length < 2) continue;
    const bx = BOX[cells[0]];
    if (cells.every(i => BOX[i] === bx) && elim(st, UNITS[18 + bx].filter(i => !UNITS[u].includes(i)), bit)) return true;
  }
  return false;
}
function stepNakedSubset(st, k) {
  for (let u = 0; u < 27; u++) {
    const open = UNITS[u].filter(i => !st.v[i] && POP[st.c[i]] <= k);
    if (open.length < k) continue;
    for (const set of combos(open, k)) {
      let m = 0; for (const i of set) m |= st.c[i];
      if (POP[m] === k && elim(st, UNITS[u].filter(i => !set.includes(i)), m)) return true;
    }
  }
  return false;
}
function stepHiddenSubset(st, k) {
  for (let u = 0; u < 27; u++) {
    const pos = {}; const ds = [];
    for (let d = 1; d <= 9; d++) {
      const cells = UNITS[u].filter(i => !st.v[i] && (st.c[i] & BIT(d)));
      if (cells.length >= 1 && cells.length <= k) { pos[d] = cells; ds.push(d); }
    }
    if (ds.length < k) continue;
    for (const set of combos(ds, k)) {
      const cells = new Set(); for (const d of set) for (const i of pos[d]) cells.add(i);
      if (cells.size !== k) continue;
      let keep = 0; for (const d of set) keep |= BIT(d);
      let ch = false;
      for (const i of cells) if (st.c[i] & ~keep) { st.c[i] &= keep; ch = true; }
      if (ch) return true;
    }
  }
  return false;
}
function stepFish(st, k) {
  for (let d = 1; d <= 9; d++) {
    const bit = BIT(d);
    for (const dir of [0, 1]) {
      const lines = [];
      for (let l = 0; l < 9; l++) {
        const cells = UNITS[dir * 9 + l].filter(i => !st.v[i] && (st.c[i] & bit));
        if (cells.length >= 2 && cells.length <= k) lines.push({ l, cross: cells.map(i => dir ? ROW[i] : COL[i]) });
      }
      if (lines.length < k) continue;
      for (const set of combos(lines, k)) {
        const cross = new Set(); for (const x of set) for (const c of x.cross) cross.add(c);
        if (cross.size !== k) continue;
        const base = set.map(x => x.l);
        const targets = [];
        for (const c of cross) for (const i of UNITS[(1 - dir) * 9 + c]) if (!base.includes(dir ? COL[i] : ROW[i])) targets.push(i);
        if (elim(st, targets, bit)) return true;
      }
    }
  }
  return false;
}
function stepXYWing(st) {
  const bi = []; for (let i = 0; i < 81; i++) if (!st.v[i] && POP[st.c[i]] === 2) bi.push(i);
  for (const p of bi) {
    const [a, b] = DIG(st.c[p]);
    const wings = bi.filter(q => sees(p, q));
    for (const x of wings) for (const y of wings) {
      if (x >= y) continue;
      const mx = st.c[x], my = st.c[y];
      for (const [u, w] of [[a, b], [b, a]]) {
        // x has u+z, y has w+z
        if (!(mx & BIT(u)) || !(my & BIT(w))) continue;
        const zx = mx & ~BIT(u), zy = my & ~BIT(w);
        if (zx !== zy || POP[zx] !== 1 || (zx & st.c[p])) continue;
        const targets = []; for (let i = 0; i < 81; i++) if (i !== p && sees(i, x) && sees(i, y)) targets.push(i);
        if (elim(st, targets, zx)) return true;
      }
    }
  }
  return false;
}
function stepXYZWing(st) {
  for (let p = 0; p < 81; p++) {
    if (st.v[p] || POP[st.c[p]] !== 3) continue;
    const wings = PEERS[p].filter(q => !st.v[q] && POP[st.c[q]] === 2 && (st.c[q] & ~st.c[p]) === 0);
    for (let i = 0; i < wings.length; i++) for (let j = i + 1; j < wings.length; j++) {
      const x = wings[i], y = wings[j];
      if (st.c[x] === st.c[y] || (st.c[x] | st.c[y]) !== st.c[p]) continue;
      const z = st.c[x] & st.c[y];
      const targets = []; for (let t = 0; t < 81; t++) if (t !== p && sees(t, p) && sees(t, x) && sees(t, y)) targets.push(t);
      if (elim(st, targets, z)) return true;
    }
  }
  return false;
}
// Level 5: assume a candidate, follow singles; if that leads to a contradiction, the candidate is wrong.
function contradicts(st0, i, d) {
  const st = { v: st0.v.slice(), c: st0.c.slice() };
  place(st, i, d);
  for (;;) {
    for (let k = 0; k < 81; k++) if (!st.v[k] && !st.c[k]) return true;
    for (let u = 0; u < 27; u++) {
      let m = 0; for (const k of UNITS[u]) m |= st.v[k] ? BIT(st.v[k]) : st.c[k];
      if (m !== ALL) return true;
    }
    const s = stepSingles(st);
    if (!s) return false;
    place(st, s.cell, s.digit);
  }
}
function stepContradiction(st) {
  for (const maxC of [2, 3, 9]) for (let i = 0; i < 81; i++) {
    if (st.v[i] || POP[st.c[i]] > maxC || (maxC > 2 && POP[st.c[i]] <= maxC - 1)) continue;
    for (const d of DIG(st.c[i])) if (contradicts(st, i, d)) { st.c[i] &= ~BIT(d); st.chainMax = Math.max(st.chainMax || 0, maxC); st.chains = (st.chains || 0) + 1; return true; }
  }
  return false;
}
const TECHS = [
  [2, st => stepLocked(st)], [2, st => stepNakedSubset(st, 2)], [2, st => stepHiddenSubset(st, 2)],
  [3, st => stepNakedSubset(st, 3)], [3, st => stepHiddenSubset(st, 3)], [3, st => stepFish(st, 2)], [3, st => stepNakedSubset(st, 4)],
  [4, st => stepFish(st, 3)], [4, st => stepXYWing(st)], [4, st => stepXYZWing(st)], [4, st => stepHiddenSubset(st, 4)],
  [5, st => stepContradiction(st)],
];
function rate(grid) {
  const st = makeState(grid);
  let level = 1, naked = 0, hidden = 0;
  for (;;) {
    const s = stepSingles(st);
    if (s) { place(st, s.cell, s.digit); if (s.tech === 'naked') naked++; else hidden++; continue; }
    if (st.v.every(x => x)) return { level, naked, hidden, chains: st.chains || 0, chainMax: st.chainMax || 0 };
    let progressed = false;
    for (const [lv, fn] of TECHS) if (fn(st)) { level = Math.max(level, lv); progressed = true; break; }
    if (!progressed) return { level: 6, naked, hidden };
  }
}

const api = { ROW, COL, BOX, UNITS, PEERS, CELL_UNITS, BIT, POP, DIG, solve, rate, makeState, place, stepSingles };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SudokuCore = api;
})(typeof self !== 'undefined' ? self : this);
