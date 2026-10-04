import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url).pathname;
async function load(entry, db, mutate) {
  const result = await build({
    absWorkingDir: root, entryPoints: [entry], bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic', external: ['react', 'react-dom/server'],
    plugins: [{ name: 'check_dependencies', setup(builder) {
      builder.onResolve({ filter: /^next\/cache$|^@\/lib\/supabase\/server$/ }, ({ path }) => ({ path, namespace: 'mock' }));
      builder.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path === 'next/cache' ? 'export function revalidatePath() {}' : 'export async function createClient() { return globalThis.checkDb; }' }));
      if (mutate) builder.onLoad({ filter: /\.(ts|tsx)$/ }, ({ path }) => ({ contents: mutate(path, readFileSync(path, 'utf8')), loader: path.endsWith('.tsx') ? 'tsx' : 'ts' }));
    } }],
  });
  const compiled = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module: compiled, exports: compiled.exports, require, console, checkDb: db, structuredClone });
  return compiled.exports;
}
function database(user = { id: 'owner_medosha' }, readError = null) {
  const calls = [];
  return {
    calls, auth: { getUser: async () => ({ data: { user } }) },
    from(table) {
      const call = { table, filters: [] }; calls.push(call);
      const q = {
        select() { call.kind = 'select'; return q; },
        update(values) { call.kind = 'update'; call.values = values; return q; },
        upsert(values) { call.kind = 'upsert'; call.values = values; return q; },
        eq(...args) { call.filters.push(['eq', ...args]); return q; },
        in(...args) { call.filters.push(['in', ...args]); return q; },
        then(resolve) { return Promise.resolve({ data: call.kind === 'select' ? [{ id: 'existing_white', item: 'MDF 18mm melamine' }] : null, error: call.kind === 'select' ? readError : null }).then(resolve); },
      }; return q;
    },
  };
}
const actionPath = 'src/app/price-exchange/boards/actions.ts';
async function checkPublisher(mutate) {
  const db = database();
  const { publishBoardPrices } = await load(actionPath, db, mutate);
  assert.equal((await publishBoardPrices()).success, true);
  assert.ok(db.calls[0].filters.some(([op, column, value]) => op === 'eq' && column === 'supplier_id' && value === 'owner_medosha'));
  const writes = db.calls.filter((c) => c.kind !== 'select');
  assert.equal(writes.length, 4);
  assert.deepEqual(writes.map((c) => c.values.current_price), [5700, 10000, 11000, 2000]);
  assert.ok(writes[0].filters.some(([op, column, value]) => op === 'eq' && column === 'supplier_id' && value === 'owner_medosha'));
  for (const call of writes.slice(1)) {
    assert.equal(call.values.supplier_id, 'owner_medosha');
    assert.equal(call.values.unit, 'sheet');
    assert.equal(call.values.currency, 'ETB');
    assert.match(call.values.id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-8[a-f0-9]{3}-[a-f0-9]{12}$/);
  }
  const ids = writes.slice(1).map((c) => c.values.id);
  db.calls.length = 0;
  await publishBoardPrices();
  assert.deepEqual(db.calls.filter((c) => c.kind === 'upsert').map((c) => c.values.id), ids);
}
await checkPublisher();
const loggedOut = database(null);
assert.ok((await (await load(actionPath, loggedOut)).publishBoardPrices()).error);
assert.equal(loggedOut.calls.length, 0);
const failedRead = database(undefined, { message: 'offline' });
assert.ok((await (await load(actionPath, failedRead)).publishBoardPrices()).error);
assert.equal(failedRead.calls.length, 1);
await assert.rejects(checkPublisher((path, code) => path.endsWith('/boards/actions.ts') ? code.replaceAll('.eq("supplier_id", user.id)', '') : code));

// Run the material/area assertions against the real bundle and a broken area conversion.
await load('scripts/board-prices-check.ts');
await assert.rejects(load('scripts/board-prices-check.ts', null, (path, code) => path.endsWith('/services/costing.ts') ? code.replace('(cabinet.size.width * cabinet.size.height) / 1_000_000', '(cabinet.size.width * cabinet.size.height) / 1_000') : code));
await assert.rejects(load('scripts/board-prices-check.ts', null, (path, code) => path.endsWith('/types/catalogue.ts') ? code.replaceAll('fallbackRate: 5700', 'fallbackRate: 2450') : code));
console.log('PASS: publishing ownership, all four values, stable retry IDs, unauthenticated/read-error handling; ownership, area and price mutations rejected.');
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { CostPanel } = await load('src/features/berchuma-studio/components/pricing/cost-panel.tsx');
const cost = { currency: 'ETB', price: 11250, productionCost: 9000, margin: { percent: 25, amount: 2250 }, frontAreaSqm: 3, productionCostPerSqm: 3000, confidence: 0, sheets: [], productionDays: 1, manufacturable: true, subtotals: {}, lines: [], waste: { amount: 0 }, assumptions: [] };
const markup = renderToStaticMarkup(createElement(CostPanel, { cost, issues: [], assumptions: [] }));
assert.ok(markup.includes('Product front area') && markup.includes('3 m²'));
assert.ok(markup.includes('ETB 3,000 / m²'));
assert.ok(markup.includes('ETB 9,000'));
console.log('PASS: rendered cost panel shows area, per-m² cost and total.');
