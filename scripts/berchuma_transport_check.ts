/**
 * Wardrobe transport modules: 1600 mm from the left, the rest in the last.
 *
 *   npx tsx scripts/berchuma_transport_check.ts
 *
 * A wardrobe wider than one module is made as several complete cabinets —
 * each with its own sides, top, bottom and back — joined on site through a
 * double side panel. The top cabinet is a separate assembly whose joints
 * follow the ones below. All of it is real parts: the extra panels are cut,
 * banded, priced, labelled by module and joined with counted connectors. The
 * facade is laid out on its own. Saved projects open exactly as they were.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { buildCutList } from "../src/features/berchuma-studio/services/cutlist";
import { calculateCost } from "../src/features/berchuma-studio/services/costing";
import { wardrobeExample } from "../src/features/berchuma-studio/services/examples";
import { assemblySheet } from "../src/features/berchuma-studio/services/exports";
import { buildParts, cabinetFronts } from "../src/features/berchuma-studio/services/geometry";
import { hydrateSpec } from "../src/features/berchuma-studio/services/hydrate";
import {
  addNiche,
  addTopCabinet,
  balanceLastModules,
  divideForTransport,
  lockJoint,
  moveJoint,
  removeTransport,
  resizeCabinet,
  setAlignTop,
  setBayInternalDrawers,
  setBayFitting,
  setConnector,
  snapJointToPartition,
  transportProposal,
  transportSnapTargetsOf,
  transportWarnings,
} from "../src/features/berchuma-studio/services/operations";
import { partWorldBounds } from "../src/features/berchuma-studio/services/part-transform";
import { startingDesign, wardrobeShapeDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { bayLayout, carcassInterior, connectorsPerJoint, defaultJoints, modulesOf } from "../src/features/berchuma-studio/services/transport-modules";
import type { Part } from "../src/features/berchuma-studio/types/parts";
import { validateSpec, type DesignSpec } from "../src/features/berchuma-studio/types/spec";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

const t = 18;
const widths = (spec: DesignSpec, id = spec.cabinets[0]!.id) => modulesOf(spec.cabinets.find((cabinet) => cabinet.id === id)!).map((module) => Math.round(module.width));
const of = (spec: DesignSpec, cabinetId: string, role: Part["role"]) => buildParts(spec).parts.filter((part) => part.cabinetId === cabinetId && part.role === role);
const area = (spec: DesignSpec) => Object.values(buildParts(spec).totals.areaByBoard).reduce((sum, value) => sum + value, 0);
const band = (spec: DesignSpec) => Object.values(buildParts(spec).totals.bandByEdge).reduce((sum, value) => sum + value, 0);
const connectors = (spec: DesignSpec) => buildParts(spec).hardware.filter((line) => line.hardware.kind === "connector");

/** No two cut boards share space — a double wall is two panels side by side, not one in another. */
function noClashes(spec: DesignSpec, message: string) {
  const boxes = buildParts(spec).parts.filter((part) => part.manufacture !== "purchased" && part.role !== "door" && part.role !== "drawer_front").flatMap((part) => part.placements.map((at) => ({ part, box: partWorldBounds(part, at) })));
  const clashes: string[] = [];
  for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
    const a = boxes[i]!.box;
    const b = boxes[j]!.box;
    const overlap = (Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x)) > 0.5 && (Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y)) > 0.5 && (Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z)) > 0.5;
    if (overlap) clashes.push(`${boxes[i]!.part.label} ∩ ${boxes[j]!.part.label}`);
  }
  equal(clashes.slice(0, 3), [], `${message}: no two boards in one place`);
}

// ---------------------------------------------------------------------------
// 1 — The rule: 1600 mm modules from the left, the remainder last.
// ---------------------------------------------------------------------------
const rule: [number, number[]][] = [
  [1200, [1200]], [1400, [1400]], [1600, [1600]],
  [1800, [1600, 200]], [2000, [1600, 400]], [2200, [1600, 600]], [2400, [1600, 800]], [2600, [1600, 1000]], [2800, [1600, 1200]], [3000, [1600, 1400]], [3200, [1600, 1600]],
  [3400, [1600, 1600, 200]], [3600, [1600, 1600, 400]], [4000, [1600, 1600, 800]], [4400, [1600, 1600, 1200]], [4600, [1600, 1600, 1400]], [4800, [1600, 1600, 1600]],
];
for (const [width, expected] of rule) {
  const edges = [0, ...defaultJoints(width), width];
  equal(edges.slice(1).map((edge, index) => edge - edges[index]!), expected, `${width} → ${expected.join(" + ")}`);
}
equal(defaultJoints(1700), [1500], "a remainder too narrow to be a cabinet (100 mm) leaves the last module 200 mm — the one exception");

// ---------------------------------------------------------------------------
// 2–5 — A new 2400 wardrobe: two complete cabinets, a double wall between.
// ---------------------------------------------------------------------------
const fresh = startingDesign("wardrobe");
const wardrobe = fresh.cabinets[0]!;
equal(wardrobe.transport?.auto, true, "a new wardrobe is on the 1600 mm rule");
equal(widths(fresh), [1600, 800], "2400 → 1600 + 800, not three equal 800s");
const gables = of(fresh, wardrobe.id, "gable").sort((a, b) => a.placements[0]!.x - b.placements[0]!.x);
equal(gables.map((part) => [part.label, part.placements[0]!.x]), [["Base module 1 — left side", 0], ["Base module 1 — right side", 1582], ["Base module 2 — left side", 1600], ["Base module 2 — right side", 2382]], "four sides: each module its own left and right");
ok(gables[1]!.placements[0]!.x + t === gables[2]!.placements[0]!.x, "at the joint the two side panels stand directly against each other");
ok(!of(fresh, wardrobe.id, "divider").some((part) => part.placements.some((at) => at.x >= 1570 && at.x <= 1610)), "and no shared divider stands at the joint");
for (const role of ["top", "bottom"] as const) {
  equal(of(fresh, wardrobe.id, role).map((part) => [part.module?.name, part.placements[0]!.x, part.length]), [["Base module 1", 18, 1564], ["Base module 2", 1618, 764]], `each module has its own ${role}, between its own sides`);
}
const backs = of(fresh, wardrobe.id, "back");
ok(["Base module 1", "Base module 2"].every((name) => backs.some((part) => part.module?.name === name)), "each module has its own back");
ok(backs.every((part) => part.placements.every((at) => (part.module?.name === "Base module 1" ? at.x + part.size.x <= 1600 : at.x >= 1600))), "and no back panel crosses the joint");
const layout = bayLayout(wardrobe, t);
equal(layout.map((place) => place.module), [0, 0, 1], "the three bays sit in their modules: two in the first, one in the second");
equal(fresh.cabinets[0]!.bays.map((bay) => bay.fitting.kind), ["hanging", "stack", "shelves"], "the interior layout is kept");
noClashes(fresh, "2400 in two modules");
const ids = buildParts(fresh).parts.map((part) => part.id);
equal(ids.length, new Set(ids).size, "every part has its own id — four sides, not two named twice");
equal(carcassInterior(wardrobe, t), 2400 - t * (3 + 2), "the bays share the width less four sides and one divider: 2310");
equal(wardrobe.bays.reduce((sum, bay) => sum + bay.width, 0), carcassInterior(wardrobe, t), "and they fill it exactly");

// ---------------------------------------------------------------------------
// 17, 19 — The extra walls are real material, banding, price and hardware.
// ---------------------------------------------------------------------------
const single = removeTransport(fresh, wardrobe.id);
equal(widths(single), [2400], "one carcass when made as one");
equal(of(single, wardrobe.id, "gable").length, 2, "one carcass: two sides");
ok(area(fresh) > area(single), "the double wall uses more board");
ok(band(fresh) > band(single), "and more edge band — the second side's front edge");
ok(calculateCost(fresh, buildParts(fresh)).productionCost > calculateCost(single, buildParts(single)).productionCost, "and costs more");
const carcass = wardrobe.size.height - wardrobe.plinthHeight;
equal(connectorsPerJoint(2300), 7, "a 2300 mm joint takes seven connectors, one every 400 mm or so");
equal(connectors(fresh).map((line) => [line.hardware.id, line.quantity]), [["connector-confirmat", connectorsPerJoint(carcass)]], `confirmat screws up the ${carcass} mm joint, from inside`);
equal(connectors(setConnector(fresh, wardrobe.id, "bolt")).map((line) => line.hardware.id), ["connector-bolt"], "or connector bolts, if chosen");
equal(connectors(single), [], "no joint, no connectors");

// ---------------------------------------------------------------------------
// 18 — The cut list names each module's parts.
// ---------------------------------------------------------------------------
const rows = buildCutList(fresh, buildParts(fresh)).rows;
for (const name of ["Base module 1 — left side", "Base module 1 — right side", "Base module 1 — top", "Base module 1 — bottom", "Base module 2 — left side", "Base module 2 — right side", "Base module 2 — top", "Base module 2 — bottom"]) {
  ok(rows.some((row) => row.label === name && row.quantity === 1), `the cut list has ${name}`);
}
ok(rows.filter((row) => row.module).every((row) => row.label.startsWith(row.module!)), "every module part's row starts with its module");
const sheet = assemblySheet(fresh)!;
ok(sheet.rows.some((row) => row[1] === "Base module 1" && row[3] === 1600) && sheet.rows.some((row) => row[1] === "Base module 2" && row[3] === 800), "the export's Assembly sheet lists the modules and widths");
ok(sheet.rows.some((row) => typeof row[5] === "string" && row[5].startsWith(`${connectorsPerJoint(carcass)} × Confirmat`)), "and what joins them");
equal(assemblySheet(single), null, "a one-carcass design has no Assembly sheet");

// ---------------------------------------------------------------------------
// 2, 4, 6, 12 — The top cabinet: a separate assembly, joints aligned.
// ---------------------------------------------------------------------------
const withTop = addTopCabinet(fresh, wardrobe.id, 600);
const top = withTop.cabinets.find((cabinet) => cabinet.stackedOn === wardrobe.id)!;
equal(widths(withTop, top.id), [1600, 800], "the top cabinet: 1600 + 800, over the base's joint");
equal(of(withTop, top.id, "gable").map((part) => part.label).sort(), ["Top module 1 — left side", "Top module 1 — right side", "Top module 2 — left side", "Top module 2 — right side"], "with its own double wall");
const baseTop = of(withTop, wardrobe.id, "top");
const topBottom = of(withTop, top.id, "bottom");
ok(baseTop.length === 2 && topBottom.length === 2 && baseTop.every((part) => part.placements[0]!.y + t <= topBottom[0]!.placements[0]!.y), "the base's top and the top cabinet's bottom are separate boards, one on the other");
equal(of(withTop, top.id, "top").length + of(withTop, top.id, "back").length > 3, true, "and its own top and backs");
noClashes(withTop, "base and top in modules");
const moved = moveJoint(withTop, wardrobe.id, 0, 1500);
equal([widths(moved), widths(moved, top.id)], [[1500, 900], [1500, 900]], "moving the base joint to 1500 moves the top's with it");
equal(moved.cabinets[0]!.transport?.auto, false, "a joint set by hand takes the wardrobe off the rule");
equal(widths(moveJoint(withTop, top.id, 0, 1400), top.id), [1400, 1000], "moving it from the top cabinet moves the linked joint");
const unlinked = setAlignTop(withTop, wardrobe.id, false);
const separately = moveJoint(unlinked, wardrobe.id, 0, 1500);
equal([widths(separately), widths(separately, top.id)], [[1500, 900], [1600, 800]], "Align Top Modules off: the top keeps its own joints");
equal(connectors(withTop)[0]!.quantity, connectorsPerJoint(carcass) + 3, "the top's joint is joined too: three connectors up its 600 mm");

// ---------------------------------------------------------------------------
// 14, 15 — Modules are not the facade.
// ---------------------------------------------------------------------------
const leaves = cabinetFronts(fresh, fresh.cabinets[0]!).leaves.sort((a, b) => a.x - b.x);
const gaps = leaves.slice(1).map((leaf, index) => Math.round(leaf.x - (leaves[index]!.x + leaves[index]!.width)));
const atJoint = gaps[leaves.findIndex((leaf) => leaf.x + leaf.width > 1500 && leaf.x + leaf.width < 1600)]!;
const atDivider = gaps[leaves.findIndex((leaf) => leaf.x + leaf.width > 700 && leaf.x + leaf.width < 800)]!;
// Within the millimetre leaf widths are rounded to.
ok(Math.abs(atJoint - atDivider) <= 1, `the doors meet at the joint with the gap they have at a divider (${atJoint} / ${atDivider} mm) — the facade does not show the modules`);
ok(atJoint < 2 * t, "not the 40 mm a double wall would show if the doors stopped at it");
ok(leaves.every((leaf) => leaf.x + leaf.width <= 1600 - 2 || leaf.x >= 1600 + 2), "and every door is hung on one module");

// ---------------------------------------------------------------------------
// 8, 10, 11 — Small remainders, moving, snapping, locking.
// ---------------------------------------------------------------------------
const w1800 = startingDesign("wardrobe", { width: 1800 });
equal(widths(w1800), [1600, 200], "1800 → 1600 + 200");
equal(bayLayout(w1800.cabinets[0]!, t).filter((place) => place.module === 1).map((place) => place.width), [164], "the 200 mm module is a cabinet: its own two sides and a 164 mm opening");
noClashes(w1800, "1600 + 200");
const w2000 = startingDesign("wardrobe", { width: 2000 });
equal(widths(w2000), [1600, 400], "2000 → 1600 + 400, not 1000 + 1000");
equal(transportWarnings(w2000, w2000.cabinets[0]!.id), ["Final module is only 400 mm wide."], "and says the last module is only 400 mm");
equal(widths(balanceLastModules(w2000, w2000.cabinets[0]!.id)), [1000, 1000], "Adjust division evens the last two — only when asked");
const kept = lockJoint(w2000, w2000.cabinets[0]!.id, 0, true);
equal(transportWarnings(kept, kept.cabinets[0]!.id), [], "Keep 1600 + 400: said once");
equal(widths(moveJoint(kept, kept.cabinets[0]!.id, 0, 1200)), [1600, 400], "a locked joint does not move");
const snapped = snapJointToPartition(w2000, w2000.cabinets[0]!.id, 0);
const partitionAt = modulesOf(snapped.cabinets[0]!)[0]!.to;
// A partition as the bays stand with this joint taken out — where its two
// side panels then replace a divider.
const unjointed = structuredClone(w2000.cabinets[0]!);
delete unjointed.transport;
const unjointedLayout = bayLayout(unjointed, t);
const partitions = unjointedLayout.slice(0, -1).map((place, index) => (place.x + place.width + unjointedLayout[index + 1]!.x) / 2);
ok(partitions.some((centre) => Math.abs(centre - partitionAt) < 1) && Math.abs(partitionAt - 1600) < 50, `Snap to partition: onto the partition nearest 1600 (${Math.round(partitionAt)})`);
const targets = transportSnapTargetsOf(fresh, wardrobe.id);
ok(targets.includes(1200), "a joint snaps to the centre line");
ok(targets.some((value) => Math.abs(value - 800.5) < 1), "to a partition");
const resized = resizeCabinet(fresh, wardrobe.id, { width: 3600 });
equal(widths(resized), [1600, 1600, 400], "on the rule, a wardrobe widened to 3600 is 1600 + 1600 + 400");
equal(widths(resizeCabinet(moveJoint(fresh, wardrobe.id, 0, 1400), wardrobe.id, { width: 3000 })), [1400, 1600], "a joint set by hand stays where it was set");

// ---------------------------------------------------------------------------
// 9, 13 — Old and small wardrobes: divided only when asked; layouts kept.
// ---------------------------------------------------------------------------
const saved = JSON.parse(readFileSync("scripts/data/berchuma_saved_wardrobes.json", "utf8")) as Record<string, DesignSpec>;
const reopened = validateSpec(JSON.parse(JSON.stringify(saved["starting wardrobe 2400"]))).spec;
equal([reopened.cabinets[0]!.transport, widths(reopened)], [undefined, [2400]], "a saved wardrobe opens as the one carcass it was");
const proposal = transportProposal(validateSpec(wardrobeExample()).spec, "wardrobe");
equal(proposal.widths, [1600, 800], "and is offered 1600 + 800");
const twoBays = setBayFitting(validateSpec(JSON.parse(JSON.stringify(saved["starting wardrobe 2400"]))).spec, reopened.cabinets[0]!.id, reopened.cabinets[0]!.bays[2]!.id, { kind: "drawers", count: 3 });
const divided = divideForTransport(twoBays, twoBays.cabinets[0]!.id);
equal(divided.cabinets[0]!.bays.map((bay) => bay.fitting.kind), ["hanging", "stack", "drawers"], "dividing it keeps every bay and its contents");
noClashes(divided, "a saved wardrobe divided");
const w1500 = startingDesign("wardrobe", { width: 1500 });
equal(widths(w1500), [1500], "1500 stays one module by default");
equal(widths(divideForTransport(w1500, w1500.cabinets[0]!.id, [900])), [900, 600], "Divide for Transport by hand: 900 + 600");
const narrowOnly = divideForTransport(validateSpec(wardrobeExample()).spec, "wardrobe", [2000]);
equal(narrowOnly.cabinets[0]!.bays.length, 4, "a module none of the bays falls in is given a bay like its neighbour, not left empty");
noClashes(narrowOnly, "a module given its own bay");

// ---------------------------------------------------------------------------
// 9 — Displays, drawers and L-shaped runs inside modules.
// ---------------------------------------------------------------------------
const niche = addNiche(fresh, wardrobe.id, { width: 400, index: 2 });
const nicheBay = niche.cabinets[0]!.bays.find((bay) => bay.display)!;
equal(cabinetFronts(niche, niche.cabinets[0]!).leaves.filter((leaf) => leaf.bayId === nicheBay.id), [], "an open niche in a module has no door");
noClashes(niche, "a niche in a module");
const internal = setBayInternalDrawers(setBayFitting(fresh, wardrobe.id, wardrobe.bays[2]!.id, { kind: "drawers", count: 3 }), wardrobe.id, wardrobe.bays[2]!.id, true);
ok(of(internal, wardrobe.id, "drawer_front").every((part) => part.internal || part.module?.name !== "Base module 2"), "internal drawers in module 2 stay behind its doors");
noClashes(internal, "internal drawers in a module");
const l = validateSpec(wardrobeShapeDesign({ shape: "l_shaped", walls: [3400, 2400], depth: 600, height: 2400 })).spec;
equal(l.cabinets.map((cabinet) => cabinet.transport), [undefined, undefined], "a turned run is not divided by itself — its corner end needs a joint placed for it");
let lDivided = l;
for (const cabinet of l.cabinets) lDivided = divideForTransport(lDivided, cabinet.id);
noClashes(lDivided, "an L-shaped wardrobe divided by hand");

// ---------------------------------------------------------------------------
// New designs from the model are made in modules too.
// ---------------------------------------------------------------------------
const generated = hydrateSpec({ ...JSON.parse(JSON.stringify(validateSpec(wardrobeExample()).spec)), cabinets: validateSpec(wardrobeExample()).spec.cabinets.map((cabinet) => ({ ...cabinet, transport: undefined })) }, "a 2.4 m wardrobe");
ok(generated.ok && widths(generated.spec) .join("+") === "1600+800", "a wardrobe the model designs is made 1600 + 800");

console.log(`Berchuma transport modules: ${checks} checks — 1600 + remainder, a double wall at every joint, each module a whole cabinet, the top cabinet aligned, connectors counted, every panel cut and priced, the facade its own`);
