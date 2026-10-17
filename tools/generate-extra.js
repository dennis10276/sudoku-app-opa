// Extra singles-only puzzles to smooth the start of the level ramp.
// node tools/generate-extra.js > tools/data/extra.txt
const { solve, rate } = require('../core.js');
let seed = +process.env.SEED || 4242;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function carve(target) {
  const sol = solve(new Array(81).fill(0), 1, rnd).solution, g = sol.slice();
  let clues = 81;
  for (const i of shuffle([...Array(41).keys()])) {
    if (clues <= target) break;
    const j = 80 - i, a = g[i], b = g[j]; g[i] = g[j] = 0;
    if (solve(g, 2).count === 1) clues -= i === j ? 1 : 2; else { g[i] = a; g[j] = b; }
  }
  return { g, clues };
}
const want = [[44, 46, 40], [41, 43, 60], [33, 35, 200]]; // [min, max, count]
for (const [lo, hi, n] of want) {
  let got = 0;
  while (got < n) {
    const { g, clues } = carve(lo + Math.floor(rnd() * (hi - lo + 1)));
    if (clues >= lo && clues <= hi && rate(g).level === 1) { console.log(g.join('')); got++; }
  }
}
