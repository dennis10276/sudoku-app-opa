const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

// Run the actual game and tracker together; the DOM only supplies rendering surfaces.
function app(remote = () => null, stored = {}) {
  let now = Date.parse('2026-10-11T10:00:00Z');
  const nodes = new Map(), intervals = [], saved = new Map(Object.entries(stored)), records = new Map();
  function node() {
    return {
      children: [], dataset: {}, hidden: true, textContent: '', className: '', listeners: {},
      style: { setProperty() {} }, classList: { toggle() {}, add() {}, remove() {} }, clientWidth: 600, clientHeight: 600,
      addEventListener(k, fn) { this.listeners[k] = fn; }, setAttribute() {}, scrollIntoView() {},
      appendChild(n) { this.children.push(n); }, append(...n) { this.children.push(...n); }, replaceChildren(...n) { this.children = n; }, querySelector() { return node(); },
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
    Date: class extends Date { static now() { return now; } }, Intl, crypto: webcrypto, AbortController, URLSearchParams,
    navigator: { onLine: true, standalone: true }, location: { protocol: 'https:' },
    localStorage: { getItem: k => saved.get(k), setItem: (k, v) => saved.set(k, v) },
    document: { hidden: false, body: node(), documentElement: node(), getElementById: get, createElement: node,
      querySelector: get, querySelectorAll: () => [], addEventListener() {} },
    setInterval(fn, ms) { intervals.push({ fn, ms }); }, setTimeout() { return 1; }, clearTimeout() {},
    requestAnimationFrame(fn) { fn(); }, getComputedStyle: () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0' }),
    addEventListener() {}, SUDOKU_TRACKING: { databaseUrl: 'https://example.firebasedatabase.app' },
    async fetch(url, options) {
      if (options && options.body && url.includes('/sessions/')) { records.set(url, JSON.parse(options.body)); return { ok: true }; }
      return { ok: true, json: async () => remote(url) };
    }
  });
  context.window = context; context.self = context;
  for (const file of ['core.js', 'puzzles.js', 'tracking.js', 'game.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  return {
    game: context.__sudoku, nodes, records,
    advance(seconds) { for (let i = 0; i < seconds; i++) { now += 1000; intervals.filter(x => x.ms === 1000).forEach(x => x.fn()); } },
    async flush() { await new Promise(r => setImmediate(r)); await context.SudokuTracking.flush(); }
  };
}
module.exports = { app };
