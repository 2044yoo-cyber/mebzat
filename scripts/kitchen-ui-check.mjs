import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const { createElement } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = new URL('../', import.meta.url).pathname;
async function load(entry, mutation) {
  let changed = false;
  const result = await build({ absWorkingDir: root, entryPoints: [entry], bundle: true, write: false,
    platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
    plugins: mutation ? [{ name: 'mutation', setup(builder) {
      builder.onLoad({ filter: /\.(ts|tsx)$/ }, ({ path }) => {
        const code = readFileSync(path, 'utf8');
        const next = path.endsWith(mutation[0]) ? code.replace(mutation[1], mutation[2]) : code;
        changed ||= next !== code;
        return { contents: next, loader: path.endsWith('.tsx') ? 'tsx' : 'ts' };
      });
    } }] : [],
  });
  if (mutation) assert.ok(changed, `Mutation matched: ${mutation[0]}`);
  const mod = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module: mod, exports: mod.exports, require, console, structuredClone, crypto: globalThis.crypto, process });
  return mod.exports;
}
await load('scripts/kitchen-check.ts');
for (const mutation of [
  ['/services/layout.ts', 'if (!options.kitchenFacing)', 'if (true)'],
  ['/services/geometry.ts', 'rotationY: rotation || undefined', 'rotationY: undefined'],
  ['/services/resolve.ts', '${cabinet.kind}:${cabinet.position.y}', '${cabinet.kind}'],
  ['/services/kitchen-setup.ts', 'if (options.topHeight > 0)', 'if (false)'],
  ['/services/kitchen-setup.ts', 'if (occupied) return spec;', 'if (false) return spec;'],
  ['/services/operations.ts', 'lower.position.y + lower.size.height + height > draft.kitchenSetup.roomHeight', 'false'],
  ['/types/kitchen.ts', 'input.roomDepth < 3040', 'input.roomDepth < 2900'],
]) await assert.rejects(load('scripts/kitchen-check.ts', mutation), undefined, `Broken ${mutation[0]} must fail`);

async function checkSetup(mutation) {
  const { KitchenSetup } = await load('src/features/berchuma-studio/components/kitchen-setup.tsx', mutation);
  const html = renderToStaticMarkup(createElement(KitchenSetup, { onStart() {} }));
  for (const text of ['Straight', 'L shape', 'U shape', 'G shape', 'With island', 'Back wall length', 'Room width / side wall', 'Ceiling height', 'Include upper cabinets', 'Extra top row', 'Create my kitchen']) assert.ok(html.includes(text), text);
  const invalid = renderToStaticMarkup(createElement(KitchenSetup, { initial: { roomHeight: 2100 }, onStart() {} }));
  assert.match(invalid, /role="alert"/);
  assert.match(invalid, /type="submit" disabled=""/);
}
await checkSetup();
await assert.rejects(checkSetup(['/components/kitchen-setup.tsx', 'disabled={!!error}', 'disabled={false}']));
// Assert entry-point wiring inside the relevant component bodies, excluding comments.
const clean = (path) => readFileSync(root + path, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
function checkWiring(transform = (s) => s) {
  const start = transform(clean('src/features/berchuma-studio/components/start-panel.tsx').split('export function StartPanel')[1]);
  assert.match(start, /chosen\?\.kind === "kitchen" \? <KitchenSetup[^>]*onStart=\{onStart\}/);
  const workspace = clean('src/features/berchuma-studio/components/studio-workspace.tsx');
  assert.match(workspace, /opening && opening.kind !== "kitchen" \? startingDesign\(/);
  const controls = clean('src/features/berchuma-studio/components/editor/control-panel.tsx');
  assert.match(controls, /<KitchenSetup[^>]*submitLabel="Replace kitchen layout"/);
  assert.match(controls, /onChange\(addKitchenUpper\(spec, selected.id\)\)/);
}
checkWiring();
assert.throws(() => checkWiring((s) => s.replace('onStart={onStart}', 'onStart={() => {}}')));
console.log('PASS: setup fields, invalid submission, entry points and editor controls; nine deliberate mutations rejected.');

await load('scripts/kitchen-detail-check.ts');
for (const mutation of [
  ['/services/kitchen-detail.ts', 'options.roomDepth - d.upperDepth', 'options.roomDepth - d.baseDepth'],
  ['/services/kitchen-detail.ts', 'offset: segment.offset,', 'offset: 0,'],
  ['/services/kitchen-detail.ts', 'const cornerFront = d.upperDepth + (spec.carcass.frontBoard ?? spec.carcass.board).thickness;', 'const cornerFront = 0;'],
  ['/services/kitchen-construction.ts', 'const opening = detail.fridgeHeight;', 'const opening = 100;'],
  ['/services/kitchen-construction.ts', 'const leafWidth = (frontWidth - leaves * gap) / leaves;', 'const leafWidth = frontWidth / leaves;'],
  ['/services/kitchen-construction.ts', 'const recess = 40;', 'const recess = 0;'],
  ['/services/kitchen-construction.ts', 'return hideCountertop ?', 'return false ?'],
  ['/services/geometry.ts', 'part.role === "rail" && part.manufacture !== "cut"', 'part.role === "rail"'],
  ['/types/spec.ts', 'spec.kitchenSetup?.details ? 200 : LIMITS.minWidth', 'LIMITS.minWidth'],
  ['/types/kitchen.ts', 'appliance.offset < other.offset + other.width', 'false'],
]) await assert.rejects(load('scripts/kitchen-detail-check.ts', mutation), undefined, `Detailed kitchen rejects broken ${mutation[0]}`);
async function checkApplianceForm(mutation) {
  const { KitchenSetup } = await load('src/features/berchuma-studio/components/kitchen-setup.tsx', mutation);
  const html = renderToStaticMarkup(createElement(KitchenSetup, { onStart() {} }));
  for (const role of ['fridge', 'sink', 'stove']) {
    assert.ok(html.includes(`aria-label="${role} wall"`));
    assert.ok(html.includes(`aria-label="${role} offset in cm"`));
    assert.ok(html.includes(`aria-label="${role} width in cm"`));
  }
  assert.ok(html.includes('Fridge clear height including ventilation'));
  const editor = clean('src/features/berchuma-studio/components/editor/design-editor.tsx');
  assert.match(editor, /const \[showCountertop, setShowCountertop\] = useState\(false\)/);
  assert.match(editor, /hideCountertop=\{spec.furnitureType === "kitchen" && !showCountertop\}/);
}
await checkApplianceForm();
await assert.rejects(checkApplianceForm(['/components/kitchen-setup.tsx', 'aria-label={`${role} ${key} in cm`}', 'aria-label="removed"']));
console.log('PASS: appliance setup and detailed construction; deliberate connection, placement, opening, alignment, plinth, visibility, pricing and validation mutations rejected.');
