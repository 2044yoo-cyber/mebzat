/**
 * Wardrobe internal drawers and open displays: real parts, the right doors.
 *
 *   npx tsx scripts/berchuma_display_check.ts
 *
 * Internal drawers sit behind full doors and leave the face clean; an open
 * display — a side unit, a centre niche, a zone of a bay — has no door, its
 * own shelves, back and board, and its light is bought by the metre. Every
 * panel of it is on the cut list and in the price. Old wardrobes build what
 * they always built, to the byte. The rules suggest, and never apply.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { buildCutList } from "../src/features/berchuma-studio/services/cutlist";
import { calculateCost } from "../src/features/berchuma-studio/services/costing";
import { kitchenExample, tvUnitExample, wardrobeExample } from "../src/features/berchuma-studio/services/examples";
import { buildExport } from "../src/features/berchuma-studio/services/exports";
import { buildParts, cabinetFronts, INTERNAL_DRAWER_SETBACK } from "../src/features/berchuma-studio/services/geometry";
import { rectsOverlap } from "../src/features/berchuma-studio/services/door-layout";
import { convertDisplay, displayRecommendations, facadeVariations } from "../src/features/berchuma-studio/services/display-ideas";
import {
  addNiche,
  addPartialOpening,
  addSideDisplay,
  addZone,
  displayEdgesOf,
  displayOfPart,
  displayRectOf,
  displaySnapTargetsOf,
  renameCabinet,
  resizeDisplayEdge,
  setBayDisplay,
  setBayFitting,
  setBayInternalDrawers,
  setBayWidth,
  setInternalDrawerOptions,
  setZoneHeight,
  setZoneKind,
  updateDisplay,
  zoneHeightsOf,
} from "../src/features/berchuma-studio/services/operations";
import { startingDesign, wardrobeShapeDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { findBoard } from "../src/features/berchuma-studio/types/catalogue";
import type { Part } from "../src/features/berchuma-studio/types/parts";
import { validateSpec, type DesignSpec } from "../src/features/berchuma-studio/types/spec";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

const partsOf = (spec: DesignSpec) => buildParts(spec).parts;
const ofBay = (spec: DesignSpec, cabinetId: string, bayId: string) => partsOf(spec).filter((part) => part.cabinetId === cabinetId && (part.bayId === bayId || part.bayId?.startsWith(`${bayId}-`)));
const strip = (parts: Part[]) => parts.map((part) => { const copy = { ...part }; delete copy.doorLeaf; return copy; });
const cost = (spec: DesignSpec) => calculateCost(spec, buildParts(spec)).productionCost;
const hardware = (spec: DesignSpec, kind: string) => buildParts(spec).hardware.filter((line) => line.hardware.kind === kind).reduce((sum, line) => sum + line.quantity, 0);
const ledMetres = (spec: DesignSpec) => buildParts(spec).hardware.filter((line) => line.note === "Open display lighting").reduce((sum, line) => sum + line.quantity, 0);

/** Every cut part is a row on the cut list: the same pieces, counted by board and size. */
function cutListHoldsEveryPanel(spec: DesignSpec, message: string) {
  const breakdown = buildParts(spec);
  const tally = (entries: { board: string; length: number; width: number; quantity: number }[]) => {
    const map = new Map<string, number>();
    for (const entry of entries) map.set(`${entry.board}|${entry.length}|${entry.width}`, (map.get(`${entry.board}|${entry.length}|${entry.width}`) ?? 0) + entry.quantity);
    return [...map.entries()].sort();
  };
  const cut = breakdown.parts.filter((part) => part.manufacture !== "purchased").map((part) => ({ board: part.board.id, length: part.length, width: part.width, quantity: part.quantity }));
  const rows = buildCutList(spec, breakdown).rows.map((row) => ({ board: row.boardId, length: row.length, width: row.width, quantity: row.quantity }));
  equal(tally(rows), tally(cut), `${message}: every panel is on the cut list, board, size and quantity`);
}

const white = findBoard("mdf-18-white")!;
const base = validateSpec(wardrobeExample()).spec;
const wardrobe = base.cabinets[0]!;

// ---------------------------------------------------------------------------
// H — an old wardrobe project builds exactly what it always built.
// ---------------------------------------------------------------------------
// Fingerprints of what main built before any of this existed: parts, hardware,
// totals and cut list. A change here changes somebody's saved quote.
const fingerprint = (spec: DesignSpec) => {
  const breakdown = buildParts(spec);
  return createHash("sha256").update(JSON.stringify({ parts: strip(breakdown.parts), hardware: breakdown.hardware, totals: breakdown.totals, cut: buildCutList(spec, breakdown).rows })).digest("hex").slice(0, 16);
};
const OLD: Record<string, [() => DesignSpec, string]> = {
  "three-bay wardrobe": [() => wardrobeExample(), "0eb1c2ea7f5f915a"],
  "starting wardrobe": [() => startingDesign("wardrobe"), "f3f6822a54e6b7de"],
  "L-shaped wardrobe": [() => wardrobeShapeDesign({ shape: "l_shaped", walls: [2400, 1800], depth: 600, height: 2400 }), "91ca541ba47d49ca"],
  "kitchen": [() => kitchenExample(), "84440007294f88db"],
  "TV unit": [() => tvUnitExample(), "a604fe6c94f6fafe"],
};
for (const [name, [make, expected]] of Object.entries(OLD)) equal(fingerprint(make()), expected, `${name}: parts, hardware and cut list exactly as before`);
const saved = validateSpec(JSON.parse(JSON.stringify(wardrobeExample()))).spec;
ok(saved.cabinets.every((cabinet) => cabinet.bays.every((bay) => bay.display === undefined)) && saved.wardrobePlan === undefined, "an old saved wardrobe has no displays and no plan, and needs none");

// ---------------------------------------------------------------------------
// A — full-height doors, internal drawers behind one of them, a clean face.
// ---------------------------------------------------------------------------
const testA = addZone(base, wardrobe.id, "bay-1", "internal_drawers");
const aBay = testA.cabinets[0]!.bays[0]!;
equal(aBay.fitting.kind === "stack" && aBay.fitting.sections.map((section) => [section.kind, section.internal ?? false]), [["hanging", false], ["drawers", true]], "A: hanging over a bank of internal drawers");
equal(zoneHeightsOf(testA, wardrobe.id, "bay-1").at(-1)!.height, 460, "A: the drawer zone is 460 mm, as asked");
const aFronts = cabinetFronts(testA, testA.cabinets[0]!);
equal(aFronts.drawers.filter((front) => front.bayId === "bay-1"), [], "A: no drawer front on the wardrobe's face");
const aLeaves = aFronts.leaves.filter((leaf) => leaf.bayId === "bay-1");
equal(aLeaves.map((leaf) => [leaf.run, leaf.height]), [[0, 2260], [0, 2260]], "A: one run of doors over the whole bay, uninterrupted, both leaves the full 2260");
const inner = ofBay(testA, wardrobe.id, "bay-1").filter((part) => part.role === "drawer_front");
equal(inner.length, 2, "A: two inner drawer fronts");
ok(inner.every((part) => part.internal === true), "A: marked internal, so Show Inside keeps them and no handle is bought");
ok(inner.every((part) => part.placements.every((at) => at.z === INTERNAL_DRAWER_SETBACK)), "A: set back inside the carcass, behind the doors");
const aDoor = partsOf(testA).find((part) => part.bayId === "bay-1" && part.role === "door")!;
ok(aDoor.placements.every((at) => at.z < 0), "A: the doors stand in front of the carcass");
// Within a door gap of the doors' bottom edge: the lowest front stands on the
// carcass floor, the doors start a gap above it.
const doorGap = base.carcass.doorGap;
ok(inner.every((front) => front.placements.every((at) => aDoor.placements.some((door) => at.y >= door.y - doorGap && at.y + front.size.y <= door.y + aDoor.size.y))), "A: every inner front is behind the doors' height");
const doorSpan = { from: Math.min(...aDoor.placements.map((at) => at.x)), to: Math.max(...aDoor.placements.map((at) => at.x)) + aDoor.size.x };
ok(inner.every((front) => front.placements.every((at) => at.x >= doorSpan.from && at.x + front.size.x <= doorSpan.to)), "A: and across their width");
const packers = ofBay(testA, wardrobe.id, "bay-1").filter((part) => part.label.startsWith("Runner packer"));
equal(packers.map((part) => [part.quantity, part.size.x]), [[2, 18]], "A: a packer each side clears the hinges");
equal(hardware(testA, "drawer_runner"), hardware(base, "drawer_runner") + 2, "A: two more pairs of runners");
equal(hardware(testA, "handle"), hardware(base, "handle"), "A: no handle for an inner front");
ok(cost(testA) > cost(base), "A: the drawers are priced");
cutListHoldsEveryPanel(testA, "A");
// Internal drawers for a whole bay: the bay keeps its door.
const wholeInternal = setBayInternalDrawers(setBayFitting(base, wardrobe.id, "bay-3", { kind: "drawers", count: 4 }), wardrobe.id, "bay-3", true);
equal(cabinetFronts(wholeInternal, wholeInternal.cabinets[0]!).leaves.filter((leaf) => leaf.bayId === "bay-3").length, 2, "internal drawers in a whole bay: a pair of doors in front");
const exterior = setBayFitting(base, wardrobe.id, "bay-3", { kind: "drawers", count: 4 });
equal(cabinetFronts(exterior, exterior.cabinets[0]!).leaves.filter((leaf) => leaf.bayId === "bay-3").length, 0, "exterior drawers: no door over the drawer fronts");
// Depth and inner-front board are real.
const deeper = setInternalDrawerOptions(wholeInternal, { cabinetId: wardrobe.id, bayId: "bay-3" }, { boxDepth: 350, frontBoardId: "mdf-18-oak" });
ok(ofBay(deeper, wardrobe.id, "bay-3").filter((part) => part.role === "drawer_side" && part.label.startsWith("Drawer")).every((part) => part.length <= 350), "a 350 mm drawer depth makes boxes no deeper than 350");
ok(ofBay(deeper, wardrobe.id, "bay-3").filter((part) => part.role === "drawer_front").every((part) => part.board.id === "mdf-18-oak"), "the inner fronts' board is the one chosen");

// ---------------------------------------------------------------------------
// B — a white wardrobe, wood open shelves on its left.
// ---------------------------------------------------------------------------
const whiteWardrobe: DesignSpec = { ...base, carcass: { ...base.carcass, board: white, frontBoard: white, interiorBoard: white } };
const testB = addSideDisplay(whiteWardrobe, wardrobe.id, { side: "left", width: 450, shelves: 6, boardId: "mdf-18-oak" });
const side = testB.cabinets.find((cabinet) => cabinet.bays[0]?.display?.style === "side")!;
ok(side, "B: a side display unit is added");
equal([side.offset, testB.cabinets.find((cabinet) => cabinet.id === wardrobe.id)!.offset], [0, 450], "B: on the left, the wardrobe moved along to make room");
equal([side.size.height, side.plinthHeight, side.size.depth], [wardrobe.size.height, wardrobe.plinthHeight, wardrobe.size.depth], "B: as tall as the wardrobe, on its plinth, its depth");
const sideParts = partsOf(testB).filter((part) => part.cabinetId === side.id);
equal(sideParts.filter((part) => part.role === "door"), [], "B: no door on open shelves");
equal(sideParts.filter((part) => part.role === "shelf").reduce((sum, part) => sum + part.quantity, 0), 6, "B: six shelves");
ok(sideParts.filter((part) => ["gable", "top", "bottom", "shelf"].includes(part.role)).every((part) => part.board.id === "mdf-18-oak"), "B: its sides, top, bottom and shelves are oak");
ok(partsOf(testB).filter((part) => part.cabinetId === wardrobe.id && part.role === "door").every((part) => part.board.id === "mdf-18-white"), "B: the wardrobe's doors stay white");
ok((buildParts(testB).totals.areaByBoard["mdf-18-oak"] ?? 0) > 1, "B: oak is on the material estimate");
ok(cost(testB) > cost(whiteWardrobe), "B: and in the price");
cutListHoldsEveryPanel(testB, "B");
const shallow = updateDisplay(testB, { cabinetId: side.id, bayId: side.bays[0]!.id }, { back: false });
ok(!partsOf(shallow).some((part) => part.cabinetId === side.id && part.role === "back"), "B: back panel off — no back panel cut");
ok(buildExport({ spec: testB }).cutList.rows.some((row) => row.boardId === "mdf-18-oak" && row.label.startsWith("Display shelf")), "B: the export carries the oak shelves");

// ---------------------------------------------------------------------------
// C — two closed blocks, a narrow open niche between them, in an accent.
// ---------------------------------------------------------------------------
const twoBlocks = setBayFitting(base, wardrobe.id, "bay-2", { kind: "hanging", rails: 1, shelfAbove: true });
const testC = addNiche(twoBlocks, wardrobe.id, { width: 400, index: 2, boardId: "mdf-18-oak" });
const cBays = testC.cabinets[0]!.bays;
equal(cBays.map((bay) => bay.display?.style ?? "closed"), ["closed", "closed", "niche", "closed"], "C: the niche is a bay of its own between closed bays");
equal(cBays[2]!.width, 400, "C: 400 mm wide");
equal(cBays.reduce((sum, bay) => sum + bay.width, 0) + 5 * 18, 2400, "C: the wardrobe is still 2400 mm");
const cFronts = cabinetFronts(testC, testC.cabinets[0]!);
equal(cFronts.leaves.filter((leaf) => leaf.bayId === cBays[2]!.id), [], "C: no door over the niche");
ok(cFronts.leaves.filter((leaf) => leaf.bayId !== cBays[2]!.id).length >= 6, "C: the closed blocks keep their doors");
// A display bay whose saved door still says hinged — from an import, say —
// has no door all the same.
const stale = structuredClone(testC);
stale.cabinets[0]!.bays[2]!.door = "hinged";
equal(cabinetFronts(stale, stale.cabinets[0]!).leaves.filter((leaf) => leaf.bayId === cBays[2]!.id), [], "C: a display has no door whatever its door field says");
const nicheParts = ofBay(testC, wardrobe.id, cBays[2]!.id);
ok(nicheParts.some((part) => part.role === "shelf" && part.board.id === "mdf-18-oak" && part.quantity === 4), "C: four oak shelves");
ok(nicheParts.some((part) => part.label.startsWith("Display back") && part.board.id === "mdf-18-oak"), "C: an oak back in the niche");
equal(partsOf(testC).filter((part) => part.cabinetId === wardrobe.id && part.role === "divider").length, 3, "C: a divider each side of the niche — real partitions");
cutListHoldsEveryPanel(testC, "C");

// A niche keeps its width through later edits. The validator used to pull
// every wardrobe's bays a step towards equal on each edit, a rename included.
const renamed = renameCabinet(renameCabinet(testC, wardrobe.id, "Bedroom"), wardrobe.id, "Bedroom wardrobe");
equal(renamed.cabinets[0]!.bays.map((bay) => bay.width), cBays.map((bay) => bay.width), "C: two renames later the bays are the widths they were");
const typedWidth = setBayWidth(base, wardrobe.id, "bay-1", 600);
equal(renameCabinet(typedWidth, wardrobe.id, "Renamed").cabinets[0]!.bays.map((bay) => bay.width), typedWidth.cabinets[0]!.bays.map((bay) => bay.width), "a typed bay width survives the next edit");

// ---------------------------------------------------------------------------
// D — a partial-height opening.
// ---------------------------------------------------------------------------
const testD = addPartialOpening(base, wardrobe.id, "bay-3");
const dBay = testD.cabinets[0]!.bays[2]!;
const dZone = dBay.fitting.kind === "stack" ? dBay.fitting.sections.find((section) => section.kind === "display")! : null;
ok(dZone, "D: the bay is divided, an open display zone among closed ones");
const dRef = { cabinetId: wardrobe.id, bayId: "bay-3", sectionId: dZone!.id };
const dRect = displayRectOf(testD, dRef)!;
const dLeaves = cabinetFronts(testD, testD.cabinets[0]!).leaves.filter((leaf) => leaf.bayId === "bay-3");
equal(dLeaves.map((leaf) => leaf.run).sort(), [0, 0, 1, 1], "D: a pair of doors above it and a pair below");
ok(dLeaves.every((leaf) => !rectsOverlap(leaf, dRect)), "D: no door reaches over the open zone");
ok(ofBay(testD, wardrobe.id, "bay-3").some((part) => part.label.startsWith("Display shelf")), "D: its shelf is cut");
const dTaller = setZoneHeight(testD, wardrobe.id, "bay-3", dZone!.id, 700);
equal(displayRectOf(dTaller, dRef)!.height, 700, "D: the open zone set to exactly 700 mm high");
cutListHoldsEveryPanel(testD, "D");

// ---------------------------------------------------------------------------
// E — an open display with LED lighting.
// ---------------------------------------------------------------------------
const nicheRef = { cabinetId: wardrobe.id, bayId: cBays[2]!.id };
const lit = updateDisplay(testC, nicheRef, { lighting: "shelf" });
const leds = ofBay(lit, wardrobe.id, cBays[2]!.id).filter((part) => part.role === "led");
equal(leds.map((part) => [part.quantity, part.length, part.manufacture]), [[4, 376, "purchased"]], "E: a strip under each of the four shelves, the niche's width less its sockets");
equal(ledMetres(lit), 1.5, "E: 1.5 m of LED strip bought");
ok(cost(lit) > cost(testC), "E: and priced");
ok(!buildCutList(lit, buildParts(lit)).rows.some((row) => /LED/.test(row.label)), "E: the strip is bought, not cut");
equal(ofBay(updateDisplay(testC, nicheRef, { lighting: "vertical" }), wardrobe.id, cBays[2]!.id).filter((part) => part.role === "led").map((part) => part.quantity), [2], "E: vertical — a strip up each side");
equal(ledMetres(updateDisplay(lit, nicheRef, { lighting: "off" })), 0, "E: off — none bought");

// ---------------------------------------------------------------------------
// F — an open display closed again: its doors come back exactly.
// ---------------------------------------------------------------------------
const opened = setBayDisplay(base, wardrobe.id, "bay-3", { boardId: "mdf-18-oak" });
equal(cabinetFronts(opened, opened.cabinets[0]!).leaves.filter((leaf) => leaf.bayId === "bay-3"), [], "F: open — no doors");
const closedAgain = setBayDisplay(opened, wardrobe.id, "bay-3", null);
equal(strip(partsOf(closedAgain).filter((part) => part.role === "door")), strip(partsOf(base).filter((part) => part.role === "door")), "F: closed — the same doors as before, to the part");
const zoneClosed = setZoneKind(testD, wardrobe.id, "bay-3", dZone!.id, "door");
ok(cabinetFronts(zoneClosed, zoneClosed.cabinets[0]!).leaves.filter((leaf) => leaf.bayId === "bay-3").every((leaf) => leaf.run === 0), "F: a zone closed again — one run of doors over the bay");
const roundTrip = convertDisplay(testC, nicheRef, "partial");
ok(roundTrip.ref?.sectionId && displayRectOf(roundTrip.spec, roundTrip.ref), "a niche turned into a partial opening is selected as one");

// ---------------------------------------------------------------------------
// G — every shelf and panel is on the cut list (above), and in the export.
// ---------------------------------------------------------------------------
for (const [name, spec] of Object.entries({ "all of them": addSideDisplay(addPartialOpening(updateDisplay(testC, nicheRef, { lighting: "top" }), wardrobe.id, cBays[0]!.id), wardrobe.id, { side: "right", shelves: 5 }) })) {
  cutListHoldsEveryPanel(spec, `G, ${name}`);
  const bundle = buildExport({ spec });
  equal(bundle.cutList.rows.reduce((sum, row) => sum + row.quantity, 0), buildParts(spec).parts.filter((part) => part.manufacture !== "purchased").reduce((sum, part) => sum + part.quantity, 0), `G, ${name}: the export counts every piece`);
}

// ---------------------------------------------------------------------------
// Selecting, resizing and snapping a display.
// ---------------------------------------------------------------------------
const shelfPart = nicheParts.find((part) => part.role === "shelf")!;
equal(displayOfPart(testC, shelfPart), nicheRef, "a tap on a niche's shelf selects the niche");
equal(displayOfPart(testD, ofBay(testD, wardrobe.id, "bay-3").find((part) => part.label.startsWith("Display shelf"))!), dRef, "a tap on a zone's shelf selects the zone");
equal(displayOfPart(base, partsOf(base).find((part) => part.role === "shelf")!), null, "an ordinary shelf selects nothing");
equal(displayEdgesOf(testC, nicheRef), ["left", "right"], "a niche resizes sideways");
equal(displayEdgesOf(testD, dRef), ["top", "bottom"], "a zone resizes up and down");
const nicheRect = displayRectOf(testC, nicheRef)!;
const wider = resizeDisplayEdge(testC, nicheRef, "right", { ...nicheRect, width: 500 });
equal(wider.cabinets[0]!.bays.map((bay) => bay.width), [cBays[0]!.width, cBays[1]!.width, 500, cBays[3]!.width - 100], "pulling the niche's right edge: the niche 500, only the bay beyond it gives way");
const targets = displaySnapTargetsOf(testC, nicheRef);
ok(targets.x.includes(1200 - 200) && targets.x.includes(1200 + 200), "a niche's edges snap to where it would be centred");
ok(targets.x.includes(0) && targets.x.includes(2400), "and to the wardrobe's edges");
const zoneTargets = displaySnapTargetsOf(testD, dRef);
ok(zoneHeightsOf(testD, wardrobe.id, "bay-3").every((zone) => zoneTargets.y.includes(zone.floor)), "a zone's edges snap to the zone boundaries");

// ---------------------------------------------------------------------------
// The rules: suggestions, never forced.
// ---------------------------------------------------------------------------
const planned = (spec: DesignSpec, plan: Partial<NonNullable<DesignSpec["wardrobePlan"]>>): DesignSpec => ({ ...spec, wardrobePlan: { priority: "balanced", leftEnd: "wall", rightEnd: "wall", ...plan } });
equal(displayRecommendations(planned(base, { priority: "storage", leftEnd: "open" })), [], "maximum storage: nothing suggested");
const balanced = displayRecommendations(planned(base, {}));
equal(balanced[0]?.question, "Add a centre display niche?", "a 2400 mm wardrobe, balanced: a centre niche first");
ok(!balanced.some((idea) => idea.id.startsWith("side-")), "both ends against walls: no side shelves suggested");
ok(displayRecommendations(planned(base, { leftEnd: "open" })).some((idea) => idea.id === "side-left"), "the left end open to the room: side shelves there suggested");
ok(balanced.every((idea) => idea.spec !== base) && partsOf(base).every((part) => part.cabinetId === wardrobe.id), "suggesting changes nothing until applied");
const decorative = displayRecommendations(planned(base, { priority: "decorative" }));
ok(decorative[0]!.spec.cabinets[0]!.bays.some((bay) => bay.display?.boardId === "mdf-18-white"), "decorative: the niche in an accent board — white against walnut");
equal(displayRecommendations(planned(balanced[0]!.spec, {})), [], "balanced allows one opening: once it is there, nothing more is suggested");
const narrow = validateSpec(wardrobeShapeDesign({ shape: "straight", walls: [1200], depth: 600, height: 2400 } as never)).spec;
equal(displayRecommendations(planned(narrow, {})), [], "a 1200 mm wardrobe stays closed");
equal(displayRecommendations(planned(narrow, { rightEnd: "open" })), [], "even with an open end, unless decorative");
ok(displayRecommendations(planned(narrow, { priority: "decorative", rightEnd: "open" })).every((idea) => idea.id.startsWith("side-")), "a narrow decorative wardrobe: at most side shelves at an open end");
const options = facadeVariations(planned(base, { leftEnd: "open", rightEnd: "open", priority: "decorative" }));
equal(options.map((option) => option.id), ["closed", "side-left", "niche", "side-right", "partial"], "five facades: closed, left shelves, centre niche, right shelves, partial");
ok(options.every((option) => validateSpec(JSON.parse(JSON.stringify(option.spec))).spec), "every facade is a valid design");
equal(facadeVariations(planned(base, {})).map((option) => option.id), ["closed", "niche", "partial"], "against walls: no side options");
const wide = validateSpec(wardrobeShapeDesign({ shape: "straight", walls: [4200], depth: 600, height: 2400 } as never)).spec;
ok(facadeVariations(planned(wide, { priority: "decorative" })).some((option) => option.id === "two-niches"), "a very wide wardrobe may have two niches");
ok(facadeVariations(planned(testC, {}))[0]!.spec.cabinets[0]!.bays.every((bay) => !bay.display), "the closed option takes the niche back out");

console.log(`Berchuma open displays: ${checks} checks — internal drawers behind clean doors, side shelves, a centre niche, a partial opening, LED, closed again, every panel cut, old designs unchanged, rules that suggest`);
