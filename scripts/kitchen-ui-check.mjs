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
  if (mutation && !changed) throw new Error(`Mutation target missing in ${mutation[0]}: ${mutation[1]}`);
  const mod = { exports: {} };
  vm.runInNewContext(result.outputFiles[0].text, { module: mod, exports: mod.exports, require, console, structuredClone, crypto: globalThis.crypto, process });
  return mod.exports;
}
// A broken copy must fail on its own account. A mutation whose text has gone from the source throws "Mutation target missing", which is the plan having drifted from
// the code and not the check noticing anything, so it is not accepted as a rejection.
const rejected = (promise, message) => assert.rejects(promise, (error) => !String(error?.message).startsWith('Mutation target missing'), message);
await load('scripts/kitchen-check.ts');
for (const mutation of [
  ['/services/layout.ts', 'if (!options.kitchenFacing)', 'if (true)'],
  ['/services/geometry.ts', 'rotationY: rotation || undefined', 'rotationY: undefined'],
  ['/services/resolve.ts', '${effectiveCabinet.kind}:${effectiveCabinet.position.y}', '${effectiveCabinet.kind}'],
  ['/services/kitchen-setup.ts', 'if (options.topHeight > 0)', 'if (false)'],
  ['/services/kitchen-setup.ts', 'if (occupied) return spec;', 'if (false) return spec;'],
  ['/services/operations.ts', 'lower.position.y + lower.size.height + height > draft.kitchenSetup.roomHeight', 'false'],
  ['/types/kitchen.ts', 'input.roomDepth < 3040', 'input.roomDepth < 2900'],
]) await rejected(load('scripts/kitchen-check.ts', mutation), `Broken ${mutation[0]} must fail`);

async function checkSetup(mutation) {
  const { KitchenSetup } = await load('src/features/berchuma-studio/components/kitchen-setup.tsx', mutation);
  const html = renderToStaticMarkup(createElement(KitchenSetup, { onStart() {} }));
  for (const text of ['Straight', 'L shape', 'U shape', 'G shape', 'With island', 'Back wall length', 'Room width / side wall', 'Ceiling height', 'Include upper cabinets', 'Extra top row', 'Create my kitchen']) assert.ok(html.includes(text), text);
  const invalid = renderToStaticMarkup(createElement(KitchenSetup, { initial: { roomHeight: 2100 }, onStart() {} }));
  assert.match(invalid, /role="alert"/);
  assert.match(invalid, /type="submit" disabled=""/);
}
await checkSetup();
await rejected(checkSetup(['/components/kitchen-setup.tsx', 'disabled={!!error}', 'disabled={false}']));
// Assert entry-point wiring inside the relevant component bodies, excluding comments.
const clean = (path) => readFileSync(root + path, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
function checkWiring(transform = (s) => s) {
  // The start panel hands what is made to the cabinet start wizard (64779aa), and the wizard shows the kitchen's own setup for a kitchen and starts the design with it.
  const start = transform(clean('src/features/berchuma-studio/components/start-panel.tsx').split('export function StartPanel')[1]);
  assert.match(start, /<CabinetStart onStart=\{onStart\}/);
  const wizard = transform(clean('src/features/berchuma-studio/components/cabinet-start.tsx'));
  assert.match(wizard, /type === "kitchen" \? \(\s*<KitchenSetup[^>]*onStart=\{\(spec\) => onStart\(withMaterial\(spec, boardId\)\)\}/);
  // A link that names a kitchen, or a gallery template, goes through the setup; only a plain kind and width start a design at once.
  const workspace = transform(clean('src/features/berchuma-studio/components/studio-workspace.tsx'));
  assert.match(workspace, /opening && opening\.kind !== "kitchen" && !opening\.template\s*\? startingDesign\(/);
  const controls = transform(clean('src/features/berchuma-studio/components/editor/control-panel.tsx'));
  assert.match(controls, /<KitchenSetup[^>]*submitLabel="Replace kitchen layout"/);
  assert.match(controls, /onChange\(addKitchenUpper\(spec, selected.id\)\)/);
  assert.match(controls, /title="CORNER"/);
  assert.match(controls, /\[selectedCornerId\]: event\.target\.value as CornerKind/);
}
checkWiring();
assert.throws(() => checkWiring((s) => s.replace('<CabinetStart onStart={onStart}', '<CabinetStart onStart={() => {}}')));
assert.throws(() => checkWiring((s) => s.replace('onStart={(spec) => onStart(withMaterial(spec, boardId))}', 'onStart={() => {}}')));
assert.throws(() => checkWiring((s) => s.replace('type === "kitchen" ? (', 'type === "wardrobe" ? (')));
for (const [from, to] of [
  ['opening.kind !== "kitchen"', 'opening.kind !== "wardrobe"'],
  ['!opening.template', 'true'],
  ['submitLabel="Replace kitchen layout"', 'submitLabel="Replace"'],
  ['onChange(addKitchenUpper(spec, selected.id))', 'onChange(spec)'],
  ['title="CORNER"', 'title="TURN"'],
  ['[selectedCornerId]: event.target.value as CornerKind', '[selectedCornerId]: "blind" as CornerKind'],
]) assert.throws(() => checkWiring((s) => s.replace(from, to)), undefined, `Wiring rejects ${from}`);
console.log('PASS: setup fields, invalid submission, entry points and editor controls; the deliberate mutations are rejected.');

await load('scripts/kitchen-detail-check.ts');
for (const mutation of [
  ['/services/kitchen-detail.ts', 'options.roomDepth - d.upperDepth', 'options.roomDepth - d.baseDepth'],
  ['/services/kitchen-detail.ts', 'options.roomWidth - rearCorners * d.upperDepth', 'options.roomWidth'],
  ['/services/corners.ts', 'return [...base, ...base.map((corner): CornerBlock => ({', 'return [...base, ...base.slice(0, 0).map((corner): CornerBlock => ({'],
  ['/services/kitchen-detail.ts', 'offset: segment.offset,', 'offset: 0,'],
  ['/services/kitchen-detail.ts', 'const cornerFront = d.upperDepth + (spec.carcass.frontBoard ?? spec.carcass.board).thickness;', 'const cornerFront = 0;'],
  ['/services/kitchen-construction.ts', 'const opening = detail.fridgeHeight;', 'const opening = 100;'],
  ['/services/kitchen-construction.ts', 'const leafWidth = (width - 2 * gap) / 2;', 'const leafWidth = width / 2;'],
  ['/services/kitchen-construction.ts', 'cabinet.zekolo?.setback ?? 40', 'cabinet.zekolo?.setback ?? 0'],
  ['/services/kitchen-construction.ts', 'return hideCountertop ?', 'return false ?'],
  ['/services/geometry.ts', 'part.role === "rail" && part.manufacture !== "cut"', 'part.role === "rail"'],
  ['/types/spec.ts', 'spec.kitchenSetup?.details ? 200 : LIMITS.minWidth', 'LIMITS.minWidth'],
  ['/types/kitchen.ts', 'appliance.offset < other.offset + other.width', 'false'],
  ['/types/kitchen.ts', 'const chosen = clear[0];', 'const chosen = undefined;'],
]) await rejected(load('scripts/kitchen-detail-check.ts', mutation), `Detailed kitchen rejects broken ${mutation[0]}`);
async function checkApplianceForm(mutation) {
  const { KitchenSetup } = await load('src/features/berchuma-studio/components/kitchen-setup.tsx', mutation);
  // Where the appliances go is chosen in "Sketch with Plan" (9ab5dbf). "Auto Kitchen", which a new kitchen starts in, places them itself and says so.
  const automatic = renderToStaticMarkup(createElement(KitchenSetup, { onStart() {} }));
  assert.ok(!automatic.includes('aria-label="fridge wall"'));
  assert.ok(automatic.includes('Automatic layout keeps the fridge at an outer run end'));
  const html = renderToStaticMarkup(createElement(KitchenSetup, { initial: { placementMode: 'plan' }, onStart() {} }));
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
await rejected(checkApplianceForm(['/components/kitchen-setup.tsx', 'aria-label={`${role} ${key} in cm`}', 'aria-label="removed"']));
await rejected(checkApplianceForm(['/components/kitchen-setup.tsx', 'settings.placementMode === "plan" ? <fieldset', 'true ? <fieldset']));
await rejected(checkApplianceForm(['/components/kitchen-setup.tsx', 'settings.placementMode === "plan" ? <fieldset', 'false ? <fieldset']));
console.log('PASS: appliance setup and detailed construction; deliberate connection, placement, opening, alignment, plinth, visibility, pricing and validation mutations rejected.');

await load('scripts/wardrobe_shape_check.ts');
for (const mutation of [
  ['/services/resolve.ts', '!!spec.kitchenSetup ||', '!!spec.kitchenSetup &&'],
  ['/services/starting-designs.ts', 'return "l_corner";', 'return "diagonal";'],
  ['/services/layout.ts', 'const leftKind = cornerKinds?.["corner-left"] ?? cornerKind;', 'const leftKind = cornerKind;'],
  ['/services/layout.ts', 'const rightKind = cornerKinds?.["corner-right"] ?? cornerKind;', 'const rightKind = cornerKind;'],
  ['/services/layout.ts', 'const kind = cornerKinds?.["corner-ab"] ?? cornerKind;', 'const kind = cornerKind;'],
  ['/services/corners.ts', 'if (corner.kind === "hanging") {', 'if (false) {'],
  ['/services/geometry.ts', 'if (joinsWardrobeCorner) {', 'if (false) {'],
  ['/services/corners.ts', 'const exteriorRight = wardrobeShelving && corner.id !== "corner-left";', 'const exteriorRight = false;'],
]) await rejected(load('scripts/wardrobe_shape_check.ts', mutation), `Wardrobe orientation rejects broken ${mutation[0]}`);
for (const mutation of [
  ['/services/kitchen-setup.ts', 'spec.cornerKind = "blind";', 'spec.cornerKind = "l_corner";'],
  ['/services/kitchen-detail.ts', 'spec.cornerKind = "blind";', 'spec.cornerKind = "l_corner";'],
]) await rejected(load(mutation[0].includes('detail') ? 'scripts/kitchen-detail-check.ts' : 'scripts/kitchen-check.ts', mutation), `Kitchen corner default rejects broken ${mutation[0]}`);
console.log('PASS: dedicated wardrobe and kitchen corner defaults, editing and hardware; the deliberate mutations are rejected.');
