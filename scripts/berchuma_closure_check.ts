/**
 * Handleless doors and Smart Closure Panels: what is cut is what is drawn.
 *
 *   npx tsx scripts/berchuma_closure_check.ts
 *
 * Every assertion reads the parts, the hardware, the cut list or the cost the
 * studio builds — the same lists the shop gets — never the code that made
 * them. A design saved before this existed must make exactly what it made.
 */
import assert from "node:assert/strict";

import { buildCutList } from "../src/features/berchuma-studio/services/cutlist";
import { calculateCost } from "../src/features/berchuma-studio/services/costing";
import { wardrobeExample } from "../src/features/berchuma-studio/services/examples";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { buildParts, cabinetFronts, closureReport, doorRunRegions } from "../src/features/berchuma-studio/services/geometry";
import { boxesOverlap, doorSwingConflict, subtractRects, HINGE_SIDE_CLEARANCE, FILLER_MAX, type ClosureBox } from "../src/features/berchuma-studio/services/closure-panels";
import { resetClosurePanelSize, setCabinetGrip, setClosurePanel, setClosureSettings, setDesignGrip, setFingerPull } from "../src/features/berchuma-studio/services/closure-operations";
import { cabinetCentres, closureJoins, explodedOffset } from "../src/features/berchuma-studio/services/exploded";
import { createKitchenDesign } from "../src/features/berchuma-studio/services/kitchen-setup";
import { setDoorSize } from "../src/features/berchuma-studio/services/operations";
import { resolveDesign } from "../src/features/berchuma-studio/services/resolve";
import { partWorldBounds } from "../src/features/berchuma-studio/services/part-transform";
import { DEFAULT_KITCHEN_SETUP } from "../src/features/berchuma-studio/types/kitchen";
import type { Part } from "../src/features/berchuma-studio/types/parts";
import { rectangularRoom } from "../src/features/berchuma-studio/types/room";
import { parseSpec, validateSpec, type DesignSpec, type FrontGrip } from "../src/features/berchuma-studio/types/spec";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

const on = (spec: DesignSpec) => setClosureSettings(spec, { enabled: true });
const parts = (spec: DesignSpec) => buildParts(spec).parts;
const doors = (spec: DesignSpec) => parts(spec).filter((part) => part.role === "door");
const closures = (spec: DesignSpec) => parts(spec).filter((part) => part.role === "closure");
const handleLines = (spec: DesignSpec) => buildParts(spec).hardware.filter((line) => line.hardware.id === "handle-bar");
const doorCount = (spec: DesignSpec) => doors(spec).reduce((total, part) => total + part.quantity, 0);
/** Every placed piece as the box it fills in the room, turned runs included, by id and index. */
const worldBox = (part: Part, at: Part["placements"][number]): ClosureBox => {
  const { min, max } = partWorldBounds(part, at);
  return { x: min.x, y: min.y, z: min.z, sx: max.x - min.x, sy: max.y - min.y, sz: max.z - min.z };
};
const boxes = (list: Part[]) => list.flatMap((part) => part.placements.map((at, index) => ({ id: `${part.id}#${index}`, part, box: worldBox(part, at) })));
const leafSizes = (spec: DesignSpec) => spec.cabinets.flatMap((cabinet) => cabinetFronts(spec, cabinet).leaves.map((leaf) => [Math.round(leaf.width), Math.round(leaf.height)]));

const wardrobe = validateSpec(wardrobeExample()).spec;
const cabinet = wardrobe.cabinets[0]!;
const handleDoors = doorCount(wardrobe);

// ---------------------------------------------------------------------------
// 1. A design saved before this existed makes exactly what it made.
// ---------------------------------------------------------------------------
equal(parts(setClosureSettings(setDesignGrip(wardrobe, "handle"), { enabled: false })), parts(wardrobe), "a standard handle, panels off, is the design as it was");
const reopenedOld = parseSpec(JSON.parse(JSON.stringify(wardrobe)));
ok(reopenedOld.ok && !reopenedOld.spec.doorHardware && !reopenedOld.spec.closurePanels, "an old saved design reopens without the new settings");
equal(parts(reopenedOld.ok ? reopenedOld.spec : wardrobe), parts(wardrobe), "and makes the same parts");
equal(handleLines(wardrobe)[0]?.quantity, handleDoors, "a handle per door, as before");
equal(closures(on(wardrobe)).length, 0, "a wall-to-wall wardrobe with handles needs no closure panel");

// ---------------------------------------------------------------------------
// 2. Handleless doors: the handle goes from the model, the drawing and the order.
// ---------------------------------------------------------------------------
for (const grip of ["push-to-open", "groove", "g-profile", "j-profile", "channel"] as FrontGrip[]) {
  const spec = setDesignGrip(wardrobe, grip);
  ok(doors(spec).every((door) => door.frontGrip === grip), `${grip}: every door says it is ${grip}`);
  equal(handleLines(spec).length, 0, `${grip}: no handle is ordered`);
}
const push = setDesignGrip(wardrobe, "push-to-open");
equal(leafSizes(push), leafSizes(wardrobe), "push-to-open doors keep their size");
equal(buildParts(push).hardware.find((line) => line.hardware.kind === "push_latch")?.quantity, handleDoors, "and a latch per door");

const groove = setDesignGrip(wardrobe, "groove");
equal(leafSizes(groove), leafSizes(wardrobe), "a grooved door keeps its size");
ok(doors(groove).every((door) => door.operations?.some((op) => /Route finger-pull groove 20 × 10 mm along the top edge/.test(op))), "and is routed, said on the part");
equal(closures(on(groove)).length, 0, "a groove leaves nothing open to close");
const deepGroove = setFingerPull(groove, { depth: 40 });
ok(doors(deepGroove).every((door) => door.grip!.depth <= door.size.z - 6), "a groove is never routed deeper than the door less 6 mm");
const groovedRows = buildCutList(groove, buildParts(groove)).rows.filter((row) => row.operations?.length);
ok(groovedRows.length > 0 && groovedRows.every((row) => /groove/.test(row.operations!.join(""))), "the cut list carries the routing with the door");

for (const grip of ["g-profile", "j-profile"] as const) {
  const spec = setDesignGrip(wardrobe, grip);
  const before = cabinetFronts(wardrobe, cabinet).leaves;
  const after = cabinetFronts(spec, cabinet).leaves;
  ok(after.every((leaf, index) => Math.abs(leaf.height - (before[index]!.height - 25)) < 0.01 && leaf.y === before[index]!.y), `${grip}: each door is cut 25 mm shorter at the top`);
  const line = buildParts(spec).hardware.find((entry) => entry.hardware.id === "handle-profile")!;
  const metres = Math.round(after.reduce((total, leaf) => total + leaf.width / 1000, 0) * 100) / 100;
  equal(line.quantity, handleDoors, `${grip}: a profile per door`);
  ok(line.note.includes(`${metres} m`), `${grip}: and the metres it is cut from (${metres} m)`);
  equal(closures(on(spec)).length, 0, `${grip}: the profile fills the gap — no masking panel`);
}

// ---------------------------------------------------------------------------
// 3. A channel: the door is shorter, and the rail closes exactly the gap.
// ---------------------------------------------------------------------------
const channel = setDesignGrip(wardrobe, "channel");
const channelLeaves = cabinetFronts(channel, cabinet).leaves;
ok(channelLeaves.every((leaf, index) => Math.abs(leaf.height - (cabinetFronts(wardrobe, cabinet).leaves[index]!.height - 30)) < 0.01), "channel doors are cut 30 mm shorter");
equal(closures(channel).length, 0, "with closure panels off nothing is added");
ok(closureReport(channel).warnings.some((warning) => /openings? shows? the inside/.test(warning)), "but the open channel is said, not silently shown");
const channelOn = on(channel);
const rails = closures(channelOn);
const regions = doorRunRegions(channelOn, cabinet);
equal(rails.length, regions.length, "one finger-pull rail per door run");
const t = cabinet.size.height; void t;
for (const rail of rails) {
  ok(rail.closure!.kind === "rail", `${rail.label} is a finger-pull rail`);
  const region = regions.find((entry) => Math.abs(entry.x - rail.placements[0]!.x) < 0.01)!;
  equal(Math.round(rail.size.x), Math.round(region.width), `${rail.label} spans its bay`);
  const top = Math.max(...channelLeaves.filter((leaf) => leaf.bayId === region.bayId).map((leaf) => leaf.y + leaf.height));
  ok(Math.abs(rail.placements[0]!.y - top) < 0.01 && Math.abs(rail.placements[0]!.y + rail.size.y - region.top) < 0.01, `${rail.label} closes from the door top to the carcass top`);
  equal(rail.placements[0]!.z, 18, `${rail.label} stands 18 mm back, so a finger reaches the door edge`);
}
ok(!closureReport(channelOn).panels.some((panel) => panel.kind === "masking"), "nothing is left open beside the rails");
const shallow = on(setFingerPull(channel, { height: 40, depth: 0 }));
ok(closures(shallow).every((rail) => rail.placements[0]!.z === 0 && rail.size.y > closures(channelOn)[0]!.size.y), "the profile's height and set-back move the rail");

// ---------------------------------------------------------------------------
// 4. Several widths: panels only where needed, no overlaps, no duplicates.
// ---------------------------------------------------------------------------
for (const width of [900, 1600, 2400, 3200]) {
  for (const grip of ["handle", "channel"] as FrontGrip[]) {
    const spec = on(setDesignGrip(validateSpec(startingDesign("wardrobe", { width })).spec, grip));
    const all = parts(spec);
    const closureParts = all.filter((part) => part.role === "closure");
    if (grip === "handle") equal(closureParts.length, 0, `${width} mm wardrobe with handles: no panels`);
    else ok(closureParts.length > 0, `${width} mm channel wardrobe: rails`);
    equal(new Set(closureParts.map((part) => part.id)).size, closureParts.length, `${width} ${grip}: every panel once`);
    for (const placed of resolveDesign(spec).cabinets) {
      const mine = boxes(all.filter((part) => part.cabinetId === placed.cabinet.id));
      for (const panel of mine.filter((entry) => entry.part.role === "closure")) {
        const hit = mine.find((other) => other.id !== panel.id && boxesOverlap(other.box, panel.box));
        ok(!hit, `${width} ${grip}: ${panel.part.label} overlaps ${hit?.part.label ?? "nothing"}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Doors still open: the swing rule, and every panel against every door.
// ---------------------------------------------------------------------------
const leaf = { x: 100, y: 0, width: 400, height: 700, leaf: 0, leaves: 1, style: "hinged", thickness: 18, maxAngle: 110 };
ok(doorSwingConflict({ x: 100 - HINGE_SIDE_CLEARANCE + 1 - 18, y: 0, z: -18, sx: 18, sy: 700, sz: 600 }, [leaf]), "a panel flush with the door, 1 mm from its hinge edge, is in the way");
ok(!doorSwingConflict({ x: 100 - HINGE_SIDE_CLEARANCE - 18, y: 0, z: -18, sx: 18, sy: 700, sz: 600 }, [leaf]), `from ${HINGE_SIDE_CLEARANCE} mm it is clear`);
ok(!doorSwingConflict({ x: 100 + 400 + 1, y: 0, z: -18, sx: 18, sy: 700, sz: 600 }, [leaf]), "beside the opening edge a flush panel is clear");
ok(doorSwingConflict({ x: 300, y: 0, z: -300, sx: 18, sy: 700, sz: 100 }, [leaf]), "a panel standing proud in the door's arc is hit");
ok(!doorSwingConflict({ x: 300, y: 0, z: -300, sx: 18, sy: 700, sz: 100 }, [{ ...leaf, style: "sliding" }]), "a sliding door sweeps nothing");
ok(!doorSwingConflict({ x: 300, y: 800, z: -300, sx: 18, sy: 100, sz: 100 }, [leaf]), "nor above its own height");

const kitchen = validateSpec(createKitchenDesign(DEFAULT_KITCHEN_SETUP)).spec;
for (const [name, spec] of [["kitchen", on(kitchen)], ["channel kitchen", on(setDesignGrip(kitchen, "channel"))], ["channel wardrobe", channelOn]] as const) {
  const report = closureReport(spec);
  for (const placed of resolveDesign(spec).cabinets) {
    const fronts = cabinetFronts(spec, placed.cabinet);
    const swing = fronts.leaves.map((entry) => ({ ...entry, thickness: 18, maxAngle: 110 }));
    for (const panel of report.panels.filter((entry) => entry.cabinetId === placed.cabinet.id)) {
      equal(doorSwingConflict(panel.box, swing), null, `${name}: ${panel.label} lets every door open`);
      if (panel.kind === "rail" || panel.kind === "masking") ok(panel.box.z >= 0, `${name}: ${panel.label} is behind the doors`);
    }
  }
}

// ---------------------------------------------------------------------------
// 6. Exposed gaps: a door made smaller leaves an opening, and it is closed.
// ---------------------------------------------------------------------------
const ref = { cabinetId: cabinet.id, bayId: cabinet.bays[0]!.id, run: 0, leaf: 0 };
const auto = cabinetFronts(wardrobe, cabinet).leaves.find((entry) => entry.bayId === ref.bayId && entry.leaf === 0)!;
const narrowed = on(setDoorSize(wardrobe, ref, { height: auto.height - 300 }).spec);
const masking = closureReport(narrowed).panels.filter((panel) => panel.kind === "masking");
equal(masking.length, 1, "a door 300 mm shorter leaves one opening, closed by one masking panel");
// The door gave up 300 mm; its gap and the top board's 18 mm edge were never the inside.
equal(Math.round(masking[0]!.height), 300 + wardrobe.carcass.doorGap - wardrobe.carcass.board.thickness, `the masking panel is the opening (${Math.round(masking[0]!.width)} × ${Math.round(masking[0]!.height)} mm)`);
{
  const region = doorRunRegions(narrowed, cabinet).find((entry) => entry.bayId === ref.bayId)!;
  const fronts = cabinetFronts(narrowed, cabinet);
  const covers = [...fronts.leaves, ...masking.map((panel) => ({ x: panel.box.x, y: panel.box.y, width: panel.box.sx, height: panel.box.sy }))];
  const left = subtractRects({ x: region.x, y: region.floor, width: region.width, height: region.top - region.floor }, covers).filter((rect) => rect.width >= 6 && rect.height >= 6);
  equal(left.length, 0, "with the panel in, nothing of the inside shows");
}

// ---------------------------------------------------------------------------
// 7. Ends, fillers, ceiling, kickboards, an island's back.
// ---------------------------------------------------------------------------
const kitchenReport = closureReport(on(kitchen)).panels;
ok(kitchenReport.filter((panel) => panel.kind === "decorative_end").length >= 2, "wall units beside the hood gap get end panels");
ok(!kitchenReport.some((panel) => panel.kind === "filler"), "a run filled wall to wall has no filler");
ok(kitchenReport.filter((panel) => panel.kind === "bottom").length === kitchen.cabinets.filter((entry) => entry.kind !== "wall" && entry.plinthHeight > 0).length, "a kickboard under every base unit on legs");
{
  const legs = parts(on(kitchen)).filter((part) => part.role === "leg");
  const kick = parts(on(kitchen)).filter((part) => part.closure?.kind === "bottom");
  for (const board of kick) {
    for (const leg of legs.filter((entry) => entry.cabinetId === board.cabinetId)) {
      for (const at of leg.placements) ok(!boxesOverlap(worldBox(board, board.placements[0]!), worldBox(leg, at)), "the kickboard stands in front of the legs");
    }
  }
}
// A gap to the wall: a filler up to FILLER_MAX, an end panel beyond.
for (const [gap, kind] of [[50, "filler"], [FILLER_MAX + 50, "end"]] as const) {
  const spec = on(structuredClone(wardrobe));
  spec.runs = spec.runs.map((run) => ({ ...run, length: run.length + gap }));
  const right = closureReport(spec).panels.filter((panel) => panel.id.endsWith("-right"));
  ok(right.some((panel) => panel.kind === kind || (kind === "end" && panel.kind === "decorative_end")), `a ${gap} mm gap to the wall gets a ${kind}`);
  if (kind === "filler") equal(Math.round(right.find((panel) => panel.kind === "filler")!.width), gap, "the filler is the gap");
}
// Up to the ceiling.
{
  const roomy = on(structuredClone(wardrobe));
  roomy.room = { ...rectangularRoom(), ceilingHeight: cabinet.size.height + 300 };
  const top = closureReport(roomy).panels.find((panel) => panel.kind === "top");
  ok(top && Math.round(top.height) === 300 && Math.round(top.width) === Math.round(cabinet.size.width), "a 300 mm gap to the ceiling is closed across the wardrobe");
  roomy.room = { ...rectangularRoom(), ceilingHeight: cabinet.size.height + 900 };
  ok(!closureReport(roomy).panels.some((panel) => panel.kind === "top"), "a 900 mm gap is a space, not a closure");
}
// An island: its back and both ends, meeting without overlap.
{
  const island = on(structuredClone(kitchen));
  const base = island.cabinets.find((entry) => entry.kind === "base")!;
  island.cabinets = [{ ...base, id: "island-1", label: "Island", kind: "island", runId: undefined, offset: undefined, position: { x: 0, y: 0, z: 3000 } }];
  const report = closureReport(validateSpec(island).spec).panels.filter((panel) => panel.cabinetId === "island-1");
  const kinds = report.map((panel) => panel.kind).sort();
  ok(kinds.includes("rear") && kinds.filter((kind) => kind.endsWith("end")).length === 2, `an island gets a rear panel and two ends (${kinds.join(", ")})`);
  for (const panel of report) for (const other of report) if (panel !== other) ok(!boxesOverlap(panel.box, other.box), `${panel.kind} and ${other.kind} meet without overlapping`);
  const rearPanel = report.find((panel) => panel.kind === "rear")!;
  ok(report.filter((panel) => panel.kind.endsWith("end")).every((end) => Math.abs(end.box.z + end.box.sz - (rearPanel.box.z + rearPanel.box.sz)) < 0.01), "the end panels run back over the rear panel's edge, so the corner is closed");
}

// Two cabinets a small gap apart: one filler between them, made once.
{
  const pair = on(structuredClone(wardrobe));
  const second = { ...structuredClone(cabinet), id: "second", label: "Second wardrobe", offset: cabinet.size.width + 40 };
  pair.cabinets = [{ ...cabinet, offset: 0 }, second];
  pair.runs = pair.runs.map((run) => ({ ...run, length: cabinet.size.width * 2 + 40 }));
  const between = closureReport(validateSpec(pair).spec).panels.filter((panel) => panel.kind === "filler");
  equal(between.length, 1, "a 40 mm gap between two cabinets gets one filler, not two");
  equal(Math.round(between[0]!.width), 40, "the width of the gap");
}
// An end beside a hinge: flush with the doors only if the hinge has its
// clearance. The first leaf is hinged on its left, so the left end is beside one.
{
  const exposed = on(structuredClone(wardrobe));
  exposed.wardrobePlan = { priority: "balanced", leftEnd: "open", rightEnd: "wall" };
  const roomy = closureReport(exposed).panels.find((panel) => panel.id.endsWith("-left"))!;
  equal(roomy.kind, "decorative_end", `a ${exposed.carcass.doorGap} mm door gap leaves the hinge its ${HINGE_SIDE_CLEARANCE} mm: flush with the doors`);
  ok(roomy.box.z < 0, "and it comes forward to the door face");
  // The first door widened by hand to 1 mm from the cabinet's edge: its hinge
  // now needs the room a flush panel would take.
  const leftRef = { cabinetId: cabinet.id, bayId: cabinet.bays[0]!.id, run: 0, leaf: 0 };
  const firstLeaf = cabinetFronts(exposed, cabinet).leaves[0]!;
  const widened = setDoorSize(exposed, leftRef, { x: 1, width: firstLeaf.width + firstLeaf.x - 1 });
  equal(widened.problem, null, "a door can be widened to 1 mm from the edge");
  ok(cabinetFronts(widened.spec, widened.spec.cabinets[0]!).leaves[0]!.x === 1, "and is");
  const set = closureReport(widened.spec).panels.find((panel) => panel.id.endsWith("-left"))!;
  equal(set.kind, "end", "1 mm from a hinge edge is too close: the end panel is set back to the carcass");
  ok(set.box.z >= 0, "behind the door's swing");
  // The same 1 mm beside the door's opening edge is clear: that edge swings away.
  const rightRef = { cabinetId: cabinet.id, bayId: cabinet.bays.at(-1)!.id, run: 0, leaf: cabinetFronts(exposed, cabinet).leaves.filter((entry) => entry.bayId === cabinet.bays.at(-1)!.id).length - 1 };
  const lastLeaf = cabinetFronts(exposed, cabinet).leaves.at(-1)!;
  const openSide = structuredClone(exposed);
  openSide.wardrobePlan = { priority: "balanced", leftEnd: "wall", rightEnd: "open" };
  // Grown to the right: with a partner on its left, a width alone grows a leaf leftwards.
  const reached = setDoorSize(openSide, rightRef, { x: lastLeaf.x, width: cabinet.size.width - 1 - lastLeaf.x });
  equal(reached.problem, null, "the last door reaches 1 mm from the right edge");
  const rightPanel = closureReport(reached.spec).panels.find((panel) => panel.id.endsWith("-right"))!;
  equal(rightPanel.kind, lastLeaf.leaves === 1 ? "decorative_end" : "end", "beside the last door's own edge the end panel follows that door's hinge");
  const open = on(structuredClone(wardrobe));
  open.wardrobePlan = { priority: "balanced", leftEnd: "wall", rightEnd: "open" };
  ok(closureReport(open).panels.some((panel) => panel.id.endsWith("-right") && panel.kind.endsWith("end")), "a wardrobe whose right end stands in the room gets an end panel there");
  ok(!closureReport(open).panels.some((panel) => panel.id.endsWith("-left")), "and none against the wall");
}
// A wall unit is gripped from below.
{
  const kitchenChannel = on(setDesignGrip(kitchen, "channel"));
  const wallUnit = kitchenChannel.cabinets.find((entry) => entry.kind === "wall")!;
  const plain = cabinetFronts(kitchen, wallUnit).leaves[0]!;
  const cut = cabinetFronts(kitchenChannel, wallUnit).leaves[0]!;
  ok(Math.abs(cut.y - (plain.y + 30)) < 0.01 && Math.abs(cut.y + cut.height - (plain.y + plain.height)) < 0.01, "a wall unit's channel door is cut short at the bottom");
  const rail = closureReport(kitchenChannel).panels.find((panel) => panel.cabinetId === wallUnit.id && panel.kind === "rail")!;
  ok(rail && Math.abs(rail.box.y + rail.box.sy - cut.y) < 0.01, "and its rail is under the door");
}
// A grooved door and a plain one of the same size are two rows: one goes to the router.
{
  const mixed = structuredClone(wardrobe);
  mixed.cabinets[0]!.bays[0]!.frontGrip = "groove";
  const rows = buildCutList(mixed, buildParts(mixed)).rows.filter((row) => /-DR\d*$/.test(row.partId));
  const grooved = rows.filter((row) => row.operations?.some((op) => /groove/.test(op)));
  const plain = rows.filter((row) => !row.operations?.length);
  ok(grooved.length > 0 && plain.length > 0, "grooved and plain doors are listed apart");
  equal(grooved.reduce((total, row) => total + row.quantity, 0), doors(mixed).filter((door) => door.frontGrip === "groove").reduce((total, door) => total + door.quantity, 0), "every grooved door, and only those, on the grooved rows");
}
// Choosing a grip for the design sets every door, a cabinet's own choice included.
equal(new Set(doors(setDesignGrip(setCabinetGrip(wardrobe, cabinet.id, "groove"), "handle")).map((door) => door.frontGrip)), new Set<FrontGrip | undefined>(["handle"]), "a design set to handles takes a grooved cabinet with it");
// A cabinet's own grip wins over the design's.
equal(new Set(doors(setCabinetGrip(setDesignGrip(wardrobe, "push-to-open"), cabinet.id, "groove")).map((door) => door.frontGrip)), new Set<FrontGrip | undefined>(["groove"]), "a cabinet set to groove in a push-to-open design is grooved");
equal(new Set(doors(setCabinetGrip(setCabinetGrip(setDesignGrip(wardrobe, "push-to-open"), cabinet.id, "groove"), cabinet.id, null)).map((door) => door.frontGrip)), new Set<FrontGrip | undefined>(["push-to-open"]), "and follows the design again when its own is cleared");

// ---------------------------------------------------------------------------
// 8. Each panel on, off, hidden, sized by hand — and refused where it cannot go.
// ---------------------------------------------------------------------------
const first = rails[0]!.closure!.id;
const off = setClosurePanel(channelOn, first, { enabled: false });
equal(closures(off).length, rails.length - 1, "a panel switched off is not made");
ok(!buildCutList(off, buildParts(off)).rows.some((row) => row.label === rails[0]!.label && closures(off).length === 0), "nor cut");
const hidden = setClosurePanel(channelOn, first, { hidden: true });
equal(closures(hidden).length, rails.length, "a hidden panel is still made");
ok(closures(hidden).find((part) => part.closure!.id === first)!.closure!.hidden, "and marked hidden, for the 3D view only");
const resized = setClosurePanel(channelOn, first, { width: 500 });
equal(resized.closurePanels!.sizing, "manual", "typing a size switches to manual sizing");
equal(Math.round(closures(resized).find((part) => part.closure!.id === first)!.size.x), 500, "and the panel takes it");
equal(closures(resetClosurePanelSize(resized, first)).find((part) => part.closure!.id === first)!.size.x, rails[0]!.size.x, "Reset puts it back");
ok(closures(setClosureSettings(resized, { sizing: "auto" })).find((part) => part.closure!.id === first)!.size.x === rails[0]!.size.x, "automatic sizing ignores the typed size");
const tooBig = setClosurePanel(channelOn, first, { width: 5000 });
ok(closureReport(tooBig).warnings.some((warning) => /larger than a sheet|into /.test(warning)), "a size that cannot be cut or fitted is refused with a reason");
{
  const exposed = on(structuredClone(wardrobe));
  exposed.runs = exposed.runs.map((run) => ({ ...run, length: run.length + 400 }));
  const end = closureReport(exposed).panels.find((panel) => panel.id.endsWith("-right") && panel.kind.endsWith("end"))!;
  ok(end, "an exposed end has a panel");
  const proud = setClosurePanel(exposed, end.id, { width: end.width + 400 });
  ok(closureReport(proud).warnings.some((warning) => /in the way of door|hinge side/.test(warning)), "an end panel pulled out into a door's swing is refused");
}

// ---------------------------------------------------------------------------
// 9. The cut list, the sheets and the price count each panel once.
// ---------------------------------------------------------------------------
for (const spec of [channelOn, on(kitchen)]) {
  const breakdown = buildParts(spec);
  const list = buildCutList(spec, breakdown);
  const made = breakdown.parts.filter((part) => part.role === "closure");
  const listed = list.rows.filter((row) => /^[A-Z]\d+-(FPR|MK|FL|EP|SC|TC|KB|RC)\d*$/.test(row.partId.replace(/-M\d+/, "")));
  // Each kind under its own code, so the shop can tell a rail from a filler.
  const codes: Record<string, string> = { "Finger-pull rail": "FPR", "Masking panel": "MK", "Filler panel": "FL", "Decorative end panel": "EP", "Side cover panel": "SC", "Top closure panel": "TC", "Bottom closure (kickboard)": "KB", "Rear closure panel": "RC" };
  for (const row of listed) {
    const code = codes[row.label.split(" — ")[0]!];
    ok(code && new RegExp(`-${code}\\d*$`).test(row.partId), `${row.label} is listed as ${code} (${row.partId})`);
  }
  equal(listed.reduce((total, row) => total + row.quantity, 0), made.reduce((total, part) => total + part.quantity, 0), `${spec.title}: every closure panel is on the cut list once`);
  const area = Math.round(made.reduce((total, part) => total + part.length * part.width * part.quantity / 1e6, 0) * 1000) / 1000;
  ok(Math.abs(listed.reduce((total, row) => total + row.area, 0) - area) < 0.01, `${spec.title}: and their area is the cut list's`);
  // The panels' board is priced: by area, as the cost engine does without a nesting.
  const plain = spec === channelOn ? setClosureSettings(channel, { enabled: false }) : kitchen;
  const boardArea = (breakdownOf: ReturnType<typeof buildParts>) => Object.values(breakdownOf.totals.areaByBoard).reduce((total, value) => total + value, 0);
  ok(Math.abs(boardArea(breakdown) - boardArea(buildParts(plain)) - area) < 0.01, `${spec.title}: the board area grows by exactly the panels' area`);
  const priced = calculateCost(spec, breakdown).subtotals;
  const unpriced = calculateCost(plain, buildParts(plain)).subtotals;
  // Priced by the sheet: three narrow rails can ride in a wardrobe's offcut,
  // a kitchen's worth of end panels and kickboards cannot.
  ok(spec === channelOn ? priced.material >= unpriced.material : priced.material > unpriced.material, `${spec.title}: and the material cost follows (${Math.round(unpriced.material)} → ${Math.round(priced.material)})`);
}
ok(buildCutList(channelOn, buildParts(channelOn)).rows.every((row) => row.partId.length > 0), "every row is named");

// ---------------------------------------------------------------------------
// 10. Saved and reopened: the settings and the parts come back the same.
// ---------------------------------------------------------------------------
const saved = setCabinetGrip(setClosurePanel(setClosurePanel(on(setFingerPull(setDesignGrip(wardrobe, "channel"), { height: 34 })), first, { hidden: true }), rails[1]!.closure!.id, { enabled: false }), cabinet.id, "channel");
const reopened = parseSpec(JSON.parse(JSON.stringify(saved)));
ok(reopened.ok, "a design with the new settings reopens");
if (reopened.ok) {
  equal(reopened.spec.doorHardware, saved.doorHardware, "with its door hardware");
  equal(reopened.spec.closurePanels, saved.closurePanels, "and its closure panel settings");
  equal(parts(reopened.spec), parts(saved), "and makes the same parts");
  equal(buildCutList(reopened.spec, buildParts(reopened.spec)).rows, buildCutList(saved, buildParts(saved)).rows, "and the same cut list");
}

// ---------------------------------------------------------------------------
// 11. The exploded and connection views.
// ---------------------------------------------------------------------------
{
  const all = parts(channelOn);
  const centres = cabinetCentres(all);
  const door = all.find((part) => part.role === "door")!;
  const offset = explodedOffset(door, door.placements[0]!, centres.get(door.cabinetId!)!, 1);
  ok(offset.z < 0 && offset.x === 0, "a door comes forward");
  const leftGable = all.find((part) => part.id.endsWith("/gable-left"))!;
  ok(explodedOffset(leftGable, leftGable.placements[0]!, centres.get(leftGable.cabinetId!)!, 1).x < 0, "the left side goes left");
  ok(explodedOffset(door, door.placements[0]!, centres.get(door.cabinetId!)!, 0).z === 0, "and nothing moves when it is assembled");
  const joins = closureJoins(all);
  equal(joins.length, all.filter((part) => part.closure).length, "a joint for every closure panel");
  ok(joins.every((join) => all.some((part) => part.id === join.fixedTo)), "each fixed to a part that exists");
}

console.log(`Handleless doors and Smart Closure Panels: ${checks} checks passed.`);
