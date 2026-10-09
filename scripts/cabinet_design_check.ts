/**
 * Cabinet Design: the studio presented as a cabinet tool, and what that added.
 *
 *   npx tsx scripts/cabinet_design_check.ts
 *
 * Templates that are real designs laid out to a measured space; the material
 * a design starts in; part IDs on the cut list; windows a kitchen keeps its
 * wall cabinets clear of; a project status that needs no migration; and the
 * rebrand, which renames what people read and leaves every id, route and
 * stored key as it was. The source checks are on code with its comments
 * stripped and, where a line could be satisfied by a sibling, scoped to the
 * function they are about.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CABINET_MATERIALS, CABINET_TEMPLATES, CABINET_TYPES, buildTemplate, findTemplate, templatesFor, withMaterial } from "../src/features/berchuma-studio/services/cabinet-templates";
import { buildCutList, cabinetCodes, partCode } from "../src/features/berchuma-studio/services/cutlist";
import { frontDrawing } from "../src/features/berchuma-studio/services/front-drawing";
import { buildParts, cabinetFronts } from "../src/features/berchuma-studio/services/geometry";
import { clearWindows, createKitchenDesign } from "../src/features/berchuma-studio/services/kitchen-setup";
import { partWorldBounds } from "../src/features/berchuma-studio/services/part-transform";
import { resizeCabinet } from "../src/features/berchuma-studio/services/operations";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { defaultJoints, jointsOf } from "../src/features/berchuma-studio/services/transport-modules";
import { DEFAULT_KITCHEN_SETUP, REFERENCE_KITCHEN_DETAILS, type KitchenWindow } from "../src/features/berchuma-studio/types/kitchen";
import { LIMITS, parseSpec, type DesignSpec } from "../src/features/berchuma-studio/types/spec";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

/** A file with its comments stripped, so a comment can never satisfy a check. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
/** One top-level function's text, to the brace that closes it. */
function functionText(source: string, name: string): string {
  const at = source.search(new RegExp(`function ${name}[(<]`));
  if (at === -1) return "";
  const end = source.slice(at).search(/\n\}(\n|$)/);
  return end === -1 ? source.slice(at) : source.slice(at, at + end + 2);
}

const main = (spec: DesignSpec) => [...spec.cabinets].filter((cabinet) => !cabinet.stackedOn && cabinet.kind !== "wall").sort((a, b) => b.size.width - a.size.width)[0]!;

// ---------------------------------------------------------------------------
// 1 — Every template is a design: built, validated, buildable, at any width.
// ---------------------------------------------------------------------------
ok(CABINET_TYPES.map((entry) => entry.type).join() === "wardrobe,kitchen,vanity,tv_unit,shoe,storage,office,custom", "the eight cabinet types, in order");
for (const type of CABINET_TYPES) ok(templatesFor(type.type).length >= 2, `${type.label}: at least two templates`);
ok(CABINET_TEMPLATES.length >= 30, `${CABINET_TEMPLATES.length} templates in all`);
equal(new Set(CABINET_TEMPLATES.map((entry) => entry.id)).size, CABINET_TEMPLATES.length, "template ids are unique");

for (const template of CABINET_TEMPLATES) {
  const category = CABINET_TYPES.find((entry) => entry.type === template.type)!;
  if (!template.build) {
    ok(template.type === "kitchen" && template.kitchen?.shape, `${template.id}: a kitchen preset, laid out by the kitchen setup`);
    continue;
  }
  for (const scale of [1, 1.5]) {
    const space = { ...category.space, width: Math.round(category.space.width * scale) };
    const spec = buildTemplate(template.id, space, { layout: template.layouts?.[0] })!;
    const breakdown = buildParts(spec);
    ok(breakdown.parts.length > 0, `${template.id} at ${space.width}: has parts`);
    ok(buildCutList(spec, breakdown).buildable, `${template.id} at ${space.width}: every part fits its sheet`);
    ok(spec.cabinets.every((cabinet) => cabinet.size.depth <= space.depth), `${template.id} at ${space.width}: no deeper than the space`);
  }
}

// The kitchen presets each name a shape the kitchen setup knows.
for (const template of templatesFor("kitchen")) ok(["straight", "l_shaped", "u_shaped", "g_shaped", "island"].includes(template.kitchen!.shape!), `${template.id}: a real kitchen shape`);

// ---------------------------------------------------------------------------
// 2 — Wardrobes laid out to the space: real door widths, the module rule kept.
// ---------------------------------------------------------------------------
for (const id of ["wardrobe-2-door", "wardrobe-3-door", "wardrobe-4-door", "wardrobe-sliding", "wardrobe-internal-drawers"]) {
  for (const width of [1200, 1600, 2000, 2400, 3000, 3200, 3600]) {
    const spec = buildTemplate(id, { width, height: 2400, depth: 600 }, {})!;
    const wardrobe = main(spec);
    equal(wardrobe.size.width, width, `${id} at ${width}: as wide as the space`);
    equal(wardrobe.size.height, 2400, `${id} at ${width}: as high as the space`);
    equal(spec.meta.corrections, [], `${id} at ${width}: nothing for the validator to correct`);
    equal(jointsOf(wardrobe), defaultJoints(width), `${id} at ${width}: transport modules on the 1600 mm rule`);
    ok(wardrobe.bays.every((bay) => bay.width <= LIMITS.wardrobeBayWidth), `${id} at ${width}: every bay within ${LIMITS.wardrobeBayWidth} mm`);
    const leaves = cabinetFronts(spec, wardrobe).leaves;
    if (id === "wardrobe-sliding") ok(wardrobe.bays.every((bay) => bay.door === "sliding" && bay.doorLeaves === 2), `${id} at ${width}: sliding doors in pairs`);
    else ok(leaves.every((leaf) => leaf.width <= LIMITS.hingedLeafWidth + 1), `${id} at ${width}: every hinged door ≤ ${LIMITS.hingedLeafWidth} mm (widest ${Math.round(Math.max(...leaves.map((leaf) => leaf.width)))})`);
  }
}
{
  // The template's own door count is kept where it fits.
  const doors = (id: string, width: number) => buildTemplate(id, { width, height: 2400, depth: 600 }, {})!.cabinets[0]!.bays.reduce((sum, bay) => sum + bay.doorLeaves, 0);
  equal(doors("wardrobe-2-door", 1200), 2, "a 2-door wardrobe at 1200 has two doors");
  equal(doors("wardrobe-3-door", 1200), 3, "a 3-door wardrobe at 1200 has three");
  equal(doors("wardrobe-4-door", 1600), 4, "a 4-door wardrobe at 1600 has four");
  const wide = buildTemplate("wardrobe-2-door", { width: 2400, height: 2400, depth: 600 }, {})!;
  ok(wide.meta.assumptions.some((line) => /Laid out with \d+ doors to suit 2400 mm/.test(line)), "where the count cannot fit, the design says what it did instead");
}
{
  const spec = buildTemplate("wardrobe-internal-drawers", { width: 2400, height: 2400, depth: 600 }, {})!;
  ok(buildParts(spec).parts.some((part) => part.role === "drawer_front" && part.internal), "internal drawers template: drawers behind the doors");
  // Height modules replaced the top-cabinet template: any wardrobe template
  // can be divided in height (scripts/height_modules_check.ts).
  ok(!findTemplate("wardrobe-top-cabinet"), "there is no special top-cabinet template any more");
  const top = buildTemplate("wardrobe-4-door", { width: 2400, height: 2700, depth: 600 }, { heights: [2100, 600] })!;
  const above = top.cabinets.find((cabinet) => cabinet.stackedOn);
  ok(above, "a wardrobe built in two height modules: an upper module stacked on it");
  equal(Math.round(main(top).size.height + above!.size.height), 2700, "and together they reach the ceiling");
  equal(jointsOf(above!), jointsOf(main(top)), "its width modules over the modules below");
  const side = buildTemplate("wardrobe-side-display", { width: 2400, height: 2400, depth: 600 }, {})!;
  equal(side.cabinets.reduce((sum, cabinet) => sum + cabinet.size.width, 0), 2400, "side display template: wardrobe and shelves fill the width");
  ok(side.cabinets.some((cabinet) => cabinet.bays.some((bay) => bay.display)), "and the shelves are an open display");
  const niche = buildTemplate("wardrobe-center-niche", { width: 2400, height: 2400, depth: 600 }, {})!;
  ok(main(niche).bays.some((bay) => bay.display?.style === "niche"), "centre niche template: a display niche in the wardrobe");
  const l = buildTemplate("wardrobe-l", { width: 2400, height: 2400, depth: 600 }, { layout: "l_shaped", walls: [2400, 1800] })!;
  equal(l.layout, "l_shaped", "L wardrobe template: an L");
  ok(templatesFor("wardrobe").filter((entry) => (entry.layouts ?? ["straight"]).includes("u_shaped")).map((entry) => entry.id).join() === "wardrobe-u", "a U layout offers the U template");
  equal(buildTemplate("wardrobe-4-door", { width: 2400, height: 2400, depth: 600 }, { priority: "decorative", ends: { leftEnd: "open", rightEnd: "wall" } })!.wardrobePlan, { priority: "decorative", leftEnd: "open", rightEnd: "wall" }, "priority and ends are carried into the design");
}
{
  // Other types fit their space.
  const tall = buildTemplate("shoe-tall", { width: 900, height: 2000, depth: 350 }, {})!;
  equal(main(tall).size.height, 2000, "tall shoe cabinet: to the height entered");
  equal(main(tall).size.depth, 350, "and the depth");
  const storage = buildTemplate("storage-cupboard", { width: 1800, height: 2100, depth: 450 }, {})!;
  equal(main(storage).size.width, 1800, "storage cupboard: the width entered");
  ok(buildTemplate("custom-sketch", { width: 1200, height: 900, depth: 500 }, {})!.sketchMode, "Sketch 3D template opens in sketch mode");
  equal(buildTemplate("no-such-template", { width: 1, height: 1, depth: 1 }, {}), null, "an unknown template builds nothing");
  equal(findTemplate("kitchen-l")?.build, undefined, "a kitchen template is not built here");
}

// ---------------------------------------------------------------------------
// 3 — The material step: one board through carcass, fronts and interior.
// ---------------------------------------------------------------------------
ok(CABINET_MATERIALS.length >= 3 && CABINET_MATERIALS.every((board) => board.thickness === 18 && !board.id.startsWith("worktop")), "the material choices are the stocked 18 mm boards");
for (const board of CABINET_MATERIALS.slice(0, 4)) {
  const spec = buildTemplate("wardrobe-4-door", { width: 2400, height: 2400, depth: 600 }, { boardId: board.id })!;
  equal([spec.carcass.board.id, spec.carcass.frontBoard?.id, spec.carcass.interiorBoard?.id], [board.id, board.id, board.id], `${board.id}: carcass, fronts and interior`);
  // The 18 mm pieces: backs and drawer bases are thin board, the plinth its own.
  const rows = buildCutList(spec, buildParts(spec)).rows.filter((row) => row.thickness === 18 && !/plinth/i.test(row.label));
  ok(rows.length > 10 && rows.every((row) => row.boardId === board.id), `${board.id}: every 18 mm carcass and front row on the cut list is that board`);
}
equal(withMaterial(startingDesign("wardrobe"), "not-a-board"), startingDesign("wardrobe"), "an unknown board leaves the design alone");

// ---------------------------------------------------------------------------
// 4 — Part IDs: cabinet, module, part — unique on the list.
// ---------------------------------------------------------------------------
{
  const spec = startingDesign("wardrobe", { width: 2400 });
  const rows = buildCutList(spec, buildParts(spec)).rows;
  equal(new Set(rows.map((row) => row.partId)).size, rows.length, "every row has its own part ID");
  ok(rows.every((row) => /^[A-Z]{1,2}\d{2}(-M\d+)?-[A-Z]{2,3}\d*$/.test(row.partId)), `IDs read as cabinet-module-part: ${rows.slice(0, 4).map((row) => row.partId).join(", ")}`);
  ok(rows.some((row) => row.partId === "W01-M1-LS") && rows.some((row) => row.partId === "W01-M2-RS"), "W01-M1-LS — wardrobe 1, module 1, left side — and module 2's right side");
  ok(rows.every((row) => !row.module || row.partId.includes(`-M${row.module.match(/\d+/)![0]}-`)), "a module's pieces carry its number");
  ok(rows.every((row) => row.cabinet.startsWith("W01")), "and the cabinet column names it");
  const kitchen = createKitchenDesign({ ...DEFAULT_KITCHEN_SETUP, shape: "l_shaped" });
  const kitchenRows = buildCutList(kitchen, buildParts(kitchen)).rows;
  equal(new Set(kitchenRows.map((row) => row.partId)).size, kitchenRows.length, "a kitchen's part IDs are unique too");
  ok(kitchenRows.every((row) => row.partId.startsWith("K")), "and start with K");
  ok(kitchenRows.some((row) => row.cabinet.includes(",")), "a row gathering several cabinets' pieces lists them all");
  equal([...cabinetCodes(kitchen).values()].slice(0, 3), ["K01", "K02", "K03"], "cabinets numbered in design order");
  equal(["left side", "Right gable", "Top", "Fixed shelf", "Shelf"].map((label, index) => partCode({ role: (["gable", "gable", "top", "shelf", "shelf"] as const)[index]!, label })), ["LS", "RS", "TP", "FS", "SH"], "part codes");
}

// ---------------------------------------------------------------------------
// 5 — Kitchen windows: no wall cabinet across one.
// ---------------------------------------------------------------------------
{
  const span = (spec: DesignSpec, wall: KitchenWindow["wall"]) => {
    const { parts } = buildParts(spec);
    return spec.cabinets.filter((cabinet) => cabinet.kind === "wall" && cabinet.runId?.includes(wall)).map((cabinet) => {
      const bounds = parts.filter((part) => part.cabinetId === cabinet.id).flatMap((part) => part.placements.map((at) => partWorldBounds(part, at)));
      return wall === "back" ? [Math.min(...bounds.map((b) => b.min.x)), Math.max(...bounds.map((b) => b.max.x))] : [Math.min(...bounds.map((b) => b.min.z)), Math.max(...bounds.map((b) => b.max.z))];
    });
  };
  for (const detailed of [false, true]) for (const shape of ["straight", "l_shaped", "u_shaped"] as const) {
    const setup = { ...DEFAULT_KITCHEN_SETUP, shape, ...(detailed ? { wallHeight: 1000, topHeight: 0, details: structuredClone(REFERENCE_KITCHEN_DETAILS) } : {}) };
    const windows: KitchenWindow[] = [{ wall: "back", offset: 1800, width: 1000 }, ...(shape === "straight" ? [] : [{ wall: "right" as const, offset: 1200, width: 800 }])];
    const plain = createKitchenDesign(setup);
    const clear = createKitchenDesign({ ...setup, windows });
    const name = `${detailed ? "detailed" : "simple"} ${shape}`;
    ok(clear.cabinets.filter((cabinet) => cabinet.kind === "wall").length < plain.cabinets.filter((cabinet) => cabinet.kind === "wall").length, `${name}: wall cabinets taken out for the window`);
    for (const window of windows) ok(span(clear, window.wall).every(([from, to]) => to! <= window.offset + 1 || from! >= window.offset + window.width - 1), `${name}: nothing hung across the ${window.wall} window`);
    ok(span(clear, "back").length > 0, `${name}: the rest of the back wall still has its cabinets`);
    equal(clear.cabinets.filter((cabinet) => cabinet.kind !== "wall").length, plain.cabinets.filter((cabinet) => cabinet.kind !== "wall").length, `${name}: base and tall cabinets untouched`);
    ok(clear.cabinets.every((cabinet) => !cabinet.stackedOn || clear.cabinets.some((other) => other.id === cabinet.stackedOn)), `${name}: nothing left standing on a removed cabinet`);
    ok(clear.meta.assumptions.some((line) => /No wall cabinets across the window/.test(line)), `${name}: and the design says so`);
    const none = createKitchenDesign({ ...setup, windows: [] });
    equal({ ...none, kitchenSetup: { ...none.kitchenSetup!, windows: undefined } }, { ...plain, kitchenSetup: { ...plain.kitchenSetup!, windows: undefined } }, `${name}: no windows, the same kitchen as before`);
  }
  const spec = createKitchenDesign({ ...DEFAULT_KITCHEN_SETUP, shape: "straight" });
  equal(clearWindows(spec, undefined), spec, "clearWindows without windows returns the design itself");
  const lofty = buildTemplate("wardrobe-4-door", { width: 2400, height: 3000, depth: 600 }, {})!;
  equal([main(lofty).size.height, lofty.meta.corrections], [2540, []], "in a 3000 mm room a wardrobe stops at 2540 mm, the longest gable a sheet gives — with nothing to correct");
  ok(lofty.meta.assumptions.some((line) => /Divide the height into modules, or choose a longer sheet/.test(line)), "and says how to fill the rest: height modules or a longer sheet");
  equal(buildTemplate("wardrobe-l", { width: 2400, height: 3000, depth: 600 }, { layout: "l_shaped" })!.meta.corrections, [], "an L wardrobe in a tall room is not over height either");
  // A top cabinet narrower than the cabinet it stands on, clear of the
  // window, still goes when the cabinet under it does.
  const top = spec.cabinets.find((cabinet) => cabinet.stackedOn)!;
  const under = spec.cabinets.find((cabinet) => cabinet.id === top.stackedOn)!;
  const [from, to] = span({ ...spec, cabinets: [under] }, "back")[0]!;
  const narrow = { ...spec, cabinets: spec.cabinets.map((cabinet) => (cabinet.id === top.id ? { ...cabinet, size: { ...cabinet.size, width: 300 }, bays: [{ ...cabinet.bays[0]!, width: 264, doorLeaves: 1 as const }] } : cabinet)) };
  // Narrowed, the top keeps one end of the cabinet under it (the back run is
  // laid from the right); the window goes at whichever end the top has left.
  const [topFrom] = span({ ...narrow, cabinets: [narrow.cabinets.find((cabinet) => cabinet.id === top.id)!] }, "back")[0]!;
  const window: KitchenWindow = { wall: "back", offset: Math.round(topFrom! > from! + 200 ? from! + 50 : to! - 150), width: 100 };
  ok(span({ ...narrow, cabinets: [narrow.cabinets.find((cabinet) => cabinet.id === top.id)!] }, "back").every(([a, b]) => b! <= window.offset || a! >= window.offset + window.width), "(the narrowed top cabinet is clear of the window itself)");
  ok(from! < window.offset && window.offset + window.width < to!, "(and the cabinet under it is not)");
  ok(!clearWindows(narrow, [window]).cabinets.some((cabinet) => cabinet.id === top.id), "a top cabinet goes with the cabinet it stands on");
}

// ---------------------------------------------------------------------------
// 6 — Project status lives in the spec: no migration, old designs are drafts.
// ---------------------------------------------------------------------------
{
  const old = JSON.parse(JSON.stringify(startingDesign("wardrobe")));
  delete old.meta.status;
  const read = parseSpec(old);
  ok(read.ok && read.spec.meta.status === undefined, "a design saved before status existed still parses, with no status");
  const ready = parseSpec({ ...old, meta: { ...old.meta, status: "in_production" } });
  ok(ready.ok && ready.spec.meta.status === "in_production", "a status survives the round trip");
  ok(!parseSpec({ ...old, meta: { ...old.meta, status: "shipped" } }).ok, "and an unknown one is refused");
  const drawing = frontDrawing(startingDesign("wardrobe", { width: 2400 }))!;
  equal([Math.round(drawing.width), drawing.boxes.some((box) => box.front)], [2400, true], "a project card's drawing is the design's own front, doors and all");
}

// A typed 782.5 mm has to reach the design, not just the box it was typed in.
{
  const typed = startingDesign("wardrobe", { width: 2437.5 });
  equal(typed.cabinets[0]!.size.width, 2437.5, "a new design keeps a half-millimetre width");
  equal(resizeCabinet(typed, typed.cabinets[0]!.id, { width: 2399.5 }).cabinets[0]!.size.width, 2399.5, "and so does a resize");
  equal(resizeCabinet(typed, typed.cabinets[0]!.id, { width: 2399.54 }).cabinets[0]!.size.width, 2399.5, "to a tenth of a millimetre");
  equal(buildTemplate("wardrobe-4-door", { width: 2437.5, height: 2400, depth: 600 }, {})!.cabinets[0]!.size.width, 2437.5, "a template too");
}

// ---------------------------------------------------------------------------
// 7 — The rebrand: what people read changed; ids and routes did not.
// ---------------------------------------------------------------------------
{
  const nav = code("src/lib/workspace/navigation.ts");
  const section = nav.slice(nav.indexOf('id: "berchuma"'), nav.indexOf('id: "property"'));
  ok(/label: "Cabinet Design"/.test(section) && /icon: Cabinet,/.test(section) && !/Armchair/.test(section), "the section is Cabinet Design with a cabinet icon, no chair");
  ok(/hint: "Design cabinets and get a price"/.test(section) && /hint: "All your cabinet designs"/.test(section) && /hint: "Cabinet designs and templates you can customize"/.test(section), "the three rows say what they are for");
  ok(/id: "berchuma-studio"[\s\S]*href: "\/studio"/.test(section) && /href: "\/designs\?mine=1"/.test(section) && /href: "\/designs",/.test(section), "ids and routes unchanged");
  const menu = code("src/components/shell/menu-bar.tsx");
  ok(/<Cabinet className=/.test(menu) && !/<Armchair/.test(menu), "the menu bar's Studio link has the cabinet icon");
  const i18n = code("src/lib/i18n/translations.ts");
  ok(/berchuma: "Cabinet Design"/.test(i18n) && /berchuma: "ካቢኔት ዲዛይን"/.test(i18n) && /berchuma: "Dizaayinii Kaabineetii"/.test(i18n) && !/Berchuma Studio|በርቹማ ስቱዲዮ|Istuudiyoo Berchuma/.test(i18n), "English, Amharic and Oromo all say Cabinet Design");
  for (const path of ["src/app/studio/page.tsx", "src/app/designs/page.tsx", "src/app/studio/error.tsx", "src/app/api/studio/design/route.ts", "src/features/berchuma-studio/services/exports.ts"]) {
    ok(!/"[^"]*Berchuma Studio[^"]*"|>[^<]*Berchuma Studio/.test(code(path)), `${path}: no "Berchuma Studio" left for anyone to read`);
  }
}

// ---------------------------------------------------------------------------
// 8 — The new controls are wired, by call syntax.
// ---------------------------------------------------------------------------
{
  const start = code("src/features/berchuma-studio/components/start-panel.tsx");
  ok(/<CabinetStart onStart=\{onStart\}[^>]*initialTemplate=\{initialTemplate\}/.test(start), "the start panel hosts the cabinet start, template and all");
  ok(/<OpeningPanel/.test(start) && /<PlanEditor/.test(start) && /<ImageToDesign/.test(start), "and keeps the photo, window and plan routes");
  const wizard = code("src/features/berchuma-studio/components/cabinet-start.tsx");
  const steps = functionText(wizard, "stepsFor");
  ok(/kitchen"\) return \["type", "template", "material"\]/.test(steps) && /wardrobe"\) return \["type", "space", "layout", "template", "review"\]/.test(steps) && /return \["type", "space", "template", "material"\]/.test(steps), "type → space → layout → template → review for a wardrobe (material and modules with its size), material last for the rest");
  ok(/onStart=\{\(spec\) => onStart\(withMaterial\(spec, boardId\)\)\}/.test(wizard), "a kitchen gets the chosen material");
  ok(/const spec = template \? build\(template, boardId\) : null;\s*if \(spec\) onStart\(spec\);/.test(wizard), "Create builds the chosen template in the chosen board");

  const model = code("src/features/berchuma-studio/components/viewer/model.tsx");
  const colour = functionText(model, "colourFor");
  ok(/surface === "material" \? materialColour\(part\.board, spec\) : accentColour\(part, spec\) \?\? boardColour\(part\.board, spec\)/.test(colour), "Material view draws each board in its own decor; Model view stays white");
  ok(/color=\{colourFor\(part, spec, surface\)\}/.test(functionText(model, "PartMesh")), "and every part mesh is coloured for the chosen view");
  ok(/surface=\{surface\}/.test(model), "the model hands the view to its parts");
  const editor = code("src/features/berchuma-studio/components/editor/design-editor.tsx");
  ok(/<SurfaceToggle value=\{surface\} onChange=\{setSurface\}[^>]*\/>/.test(editor) && /<Model[\s\S]{0,200}surface=\{surface\}/.test(editor), "the editor has the Model / Material toggle and passes it on");
  ok(/<QuickAction label="Duplicate" onClick=\{\(\) => onChange\(duplicateCabinet\(spec, selected\.id\)\)\}/.test(editor), "quick action: Duplicate");
  ok(/label="Delete"[\s\S]{0,200}onChange\(removeCabinet\(spec, selected\.id\)\)/.test(editor), "quick action: Delete");
  ok(/label="Move" pressed=\{movePad\}/.test(editor) && /view === "solid" && selected && movePad \?/.test(editor), "quick action: Move shows and hides the move pad");
  ok(/querySelector<HTMLInputElement>\('\[data-editor-panel\] input\[aria-label="Width in mm"\]'\)/.test(editor) && /data-editor-panel/.test(editor.replace(/querySelector[^\n]*/g, "")), "quick action: Resize goes to the cabinet's own width box");

  const field = functionText(code("src/features/berchuma-studio/components/ui/length-field.tsx"), "LengthInput");
  ok(/decimals = unit === "mm" \? 1 : 0/.test(field) && /Math\.round\(next \* factor\) \/ factor/.test(field), "lengths keep one decimal, counts none");
  // Scoped to the commit: the arrow keys parse the draft the same way, and a
  // match there would pass with the commit broken.
  const commitText = field.slice(field.indexOf("const commit = () => {"), field.indexOf("const clean = "));
  ok(/const next = Number\(draft\.replace\(",", "\."\)\);/.test(commitText), "a comma is read as a decimal point when the value is committed");
  const lockField = functionText(code("src/features/berchuma-studio/components/ui/length-field.tsx"), "LengthField");
  ok(/disabled=\{locked\}[\s\S]*type="range"[\s\S]*disabled=\{locked\}/.test(lockField) || (/<LengthInput[^>]*disabled=\{locked\}/.test(lockField) && /type="range"[^>]*disabled=\{locked\}/.test(lockField)), "a locked dimension disables both the box and the slider");

  const transport = code("src/features/berchuma-studio/components/editor/transport-panel.tsx");
  ok(/onChange\(divideForTransport\(spec, owner\.id\)\)\}><RotateCcw className="size-3" \/>Reset to Recommended/.test(transport), "Reset to Recommended puts the 1600 mm rule back");

  const route = code("src/app/api/studio/designs/route.ts");
  ok(/await deleteDesign\(body\.designId\)/.test(route) && /await renameDesign\(body\.designId,/.test(route) && /await duplicateDesign\(body\.designId\)/.test(route), "My Projects' rename, duplicate and delete are routed");
  const designs = code("src/features/berchuma-studio/services/designs.ts");
  const remove = functionText(designs.replace(/export async function/g, "function"), "deleteDesign");
  ok(/row\.visibility !== "private"\) return \{ ok: false/.test(remove) && /from\("manufacturing_requests"\)[\s\S]*if \(count\) return \{ ok: false/.test(remove), "a published design, or one sent to a workshop, is not deleted");
  ok(remove.indexOf('if (row.visibility !== "private")') < remove.indexOf('.delete()'), "and both are checked before the delete");
  const dup = functionText(designs.replace(/export async function/g, "function"), "duplicateDesign");
  ok(/saveDesign\(\{ spec: \{/.test(dup) && !/designId/.test(dup.slice(dup.indexOf("saveDesign("))), "a duplicate is a new design, not a version of the old one");
  const studio = code("src/app/studio/page.tsx");
  const workspace = code("src/features/berchuma-studio/components/studio-workspace.tsx");
  // Saved projects must reopen their own editor state, not the previous one.
  ok(studio.includes('key={editing ? `saved:${editing.designId}`'),
    "switching from dashboard to a saved project remounts the design controller");
  ok(studio.includes('if (design && !editing)') &&
    studio.includes('Could not open this cabinet design'),
    "an unreadable saved design shows an explanation instead of an empty picker");
  ok(workspace.includes('href={`/studio?design=${encodeURIComponent(project.slug)}`}') &&
    workspace.includes('aria-label={`Continue design: ${project.title}`}'),
    "each recent project card links to the saved design with accessible resume text");

  ok(/findTemplate\(template\)/.test(studio) && /\{ kind: templateKind, template: chosenTemplate\.id \}/.test(studio), "/studio?template= opens the start steps on that template");
  const gallery = code("src/app/designs/page.tsx");
  ok(/href=\{`\/studio\?template=\$\{encodeURIComponent\(template\.id\)\}`\}/.test(functionText(gallery, "TemplateGallery")), "the gallery's Use Template goes there");
  ok(/<ProjectActions id=\{design\.id\}/.test(functionText(gallery, "ProjectCard")) && /PROJECT_STATUS_LABELS\[project\.status\]/.test(functionText(gallery, "ProjectCard")), "a project card shows its status and its actions");
  const bar = code("src/features/berchuma-studio/components/publish-bar.tsx");
  ok(/const spec: DesignSpec = \{ \.\.\.design, meta: \{ \.\.\.design\.meta, status \} \};/.test(bar), "the status chosen is saved with the design");
}

console.log(`Cabinet Design: ${checks} checks — templates laid out to the space, materials, part IDs, kitchen windows, project status, rebrand and wiring`);
