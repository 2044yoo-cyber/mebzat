/**
 * The per-section vertical divider: absent means none, on adds one upright
 * board to that section only, off takes it away, and a saved design keeps it.
 *
 *   npx tsx scripts/berchuma_vertical_divider_check.ts
 */
import assert from "node:assert/strict";

import { buildParts } from "../src/features/berchuma-studio/services/geometry";
import { partWorldBounds } from "../src/features/berchuma-studio/services/part-transform";
import { verticalDividerBlocker, verticalDividerBuilt } from "../src/features/berchuma-studio/services/vertical-divider";
import { setBayVerticalDivider } from "../src/features/berchuma-studio/services/operations";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { parseSpec } from "../src/features/berchuma-studio/types/spec";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

const spec = startingDesign("wardrobe", { width: 2400 });
const cabinet = spec.cabinets[0]!;
const bay = cabinet.bays.find((entry) => entry.fitting.kind === "shelves")!;
const dividers = (design: typeof spec) => buildParts(design).parts.filter((part) => part.role === "divider" && part.id.includes("vertical-divider-"));
const partIds = (design: typeof spec) => buildParts(design).parts.map((part) => part.id).sort();

// A bay built by hand, with no mention of the divider, has none.
ok(bay.verticalDivider === undefined || bay.verticalDivider === false, "a starting design has no divider set");
equal(dividers(spec).length, 0, "and draws no vertical divider");

// Absent and false are the same design.
const explicitOff = setBayVerticalDivider(spec, cabinet.id, bay.id, false);
equal(partIds(explicitOff), partIds(spec), "switching it off explicitly changes nothing");

// On: exactly one upright board, in that section only.
const on = setBayVerticalDivider(spec, cabinet.id, bay.id, true);
const found = dividers(on);
equal(found.length, 1, "on adds one vertical divider");
equal(found[0]!.bayId, bay.id, "in the section it was switched on for");
ok(partIds(on).length === partIds(spec).length + 1 || partIds(on).length > partIds(spec).length, "and one more panel is on the cut list");
equal(dividers(spec).length, 0, "the design it was made from is untouched");

// Off again removes it.
equal(dividers(setBayVerticalDivider(on, cabinet.id, bay.id, false)).length, 0, "switching it off takes the board away");

// Saved and reopened, it is still there; a design saved without it still opens.
const reopened = parseSpec(JSON.parse(JSON.stringify(on)));
ok(reopened.ok, "a design with a divider reopens");
if (reopened.ok) equal(dividers(reopened.spec).length, 1, "with its divider");
const old = parseSpec(JSON.parse(JSON.stringify(spec)));
ok(old.ok, "a design saved without the field still opens");
if (old.ok) equal(dividers(old.spec).length, 0, "with no divider");

// The divider stands only in a section whose fittings stop at the sides: a
// drawer box or hanging rail runs the full width and would pass through it.
const bayOf = (design: typeof spec, kind: string) => {
  for (const cab of design.cabinets) for (const entry of cab.bays) if (entry.fitting.kind === kind) return { cab, entry };
  return undefined;
};
const shelvesBay = bayOf(spec, "shelves")!;
equal(verticalDividerBlocker(shelvesBay.entry), null, "a shelf section has no blocker");
for (const [design, kind] of [["kitchen", "drawers"], ["wardrobe", "hanging"], ["wardrobe", "stack"], ["kitchen", "appliance"], ["kitchen", "open"]] as const) {
  const base = startingDesign(design, {});
  const found2 = bayOf(base, kind);
  ok(found2, `${design} has a ${kind} section to test`);
  if (!found2) continue;
  const { cab, entry } = found2;
  ok(verticalDividerBlocker(entry), `${kind} sections give a reason`);
  const tried = setBayVerticalDivider(base, cab.id, entry.id, true);
  equal(tried.cabinets.find((c) => c.id === cab.id)!.bays.find((b) => b.id === entry.id)!.verticalDivider ?? false, false, `${kind}: switching it on is refused`);
  equal(partIdsOf(tried), partIdsOf(base), `${kind}: the design is unchanged`);
  // A design saved with the divider already set on such a section is not built with it.
  const saved = JSON.parse(JSON.stringify(base));
  saved.cabinets.find((c: { id: string }) => c.id === cab.id).bays.find((b: { id: string }) => b.id === entry.id).verticalDivider = true;
  const parsed = parseSpec(saved);
  ok(parsed.ok, `${kind}: such a design still opens`);
  if (parsed.ok) {
    equal(verticalDividerBuilt(parsed.spec.cabinets.find((c) => c.id === cab.id)!.bays.find((b) => b.id === entry.id)!), false, `${kind}: its divider is not built`);
    equal(partIdsOf(parsed.spec), partIdsOf(base), `${kind}: and the parts are those of the design without it`);
  }
}
function partIdsOf(design: typeof spec) { return buildParts(design).parts.map((part) => part.id).sort(); }

// Each reason names the fitting that is in the way.
const reasonFor = (design: "kitchen" | "wardrobe", kind: string) => verticalDividerBlocker(bayOf(startingDesign(design, {}), kind)!.entry) ?? "";
ok(/drawer/i.test(reasonFor("kitchen", "drawers")), "the drawer reason mentions drawers");
ok(/hanging rail/i.test(reasonFor("wardrobe", "hanging")), "the hanging reason mentions the rail");

// Switching it on for one section touches that section alone, even beside others that could take it.
{
  const shelving = startingDesign("shelving", {});
  const only = shelving.cabinets[0]!.bays[1]!;
  const one = setBayVerticalDivider(shelving, shelving.cabinets[0]!.id, only.id, true);
  equal(one.cabinets[0]!.bays.map((entry) => Boolean(entry.verticalDivider)), shelving.cabinets[0]!.bays.map((entry) => entry.id === only.id), "only the chosen section is marked");
  equal(buildParts(one).parts.filter((part) => part.id.includes("vertical-divider-")).length, 1, "and only one divider is built");
}

// With the divider on, nothing in the section is cut by it, for every starting design.
const overlaps = (a: ReturnType<typeof partWorldBounds>, b: ReturnType<typeof partWorldBounds>) =>
  a.min.x < b.max.x - 0.01 && a.max.x > b.min.x + 0.01 && a.min.y < b.max.y - 0.01 && a.max.y > b.min.y + 0.01 && a.min.z < b.max.z - 0.01 && a.max.z > b.min.z + 0.01;
let dividedSections = 0;
for (const kind of ["wardrobe", "kitchen", "shelving", "vanity", "tv_unit", "office_storage", "bookshelf"] as const) {
  const base = startingDesign(kind, {});
  for (const cab of base.cabinets) for (const entry of cab.bays) {
    const design = setBayVerticalDivider(base, cab.id, entry.id, true);
    const parts = buildParts(design).parts;
    const divider = parts.find((part) => part.id.endsWith(`vertical-divider-${entry.id}`));
    equal(Boolean(divider), verticalDividerBlocker(entry) === null, `${kind}/${entry.fitting.kind}: built exactly where allowed`);
    if (!divider) continue;
    dividedSections += 1;
    const box = partWorldBounds(divider, divider.placements[0]!);
    const hits = parts.filter((part) => part !== divider && part.cabinetId === cab.id && part.bayId === entry.id && part.placements.some((at) => overlaps(partWorldBounds(part, at), box)));
    equal(hits.map((part) => part.id), [], `${kind}/${entry.fitting.kind}: nothing passes through the divider`);

    // Shelves are cut into two pieces either side of the board, with no gap and no overlap.
    const shelf = parts.filter((part) => part.role === "shelf" && part.bayId === entry.id);
    const lefts = shelf.filter((part) => part.id.endsWith("-left"));
    const rights = shelf.filter((part) => part.id.endsWith("-right"));
    equal(shelf.length, lefts.length + rights.length, `${kind}: every shelf in the section is split`);
    equal(lefts.length, rights.length, `${kind}: as many right halves as left halves`);
    const t = divider.size.x;
    const dividerX = divider.placements[0]!.x;
    for (const left of lefts) {
      const right = rights.find((part) => part.id === left.id.replace(/-left$/, "-right"))!;
      ok(right, `${left.id} has its other half`);
      if (!right) continue;
      ok(Math.abs(left.placements[0]!.x + left.size.x - dividerX) < 1e-6, `${left.id} ends where the divider starts`);
      ok(Math.abs(right.placements[0]!.x - (dividerX + t)) < 1e-6, `${right.id} starts where the divider ends`);
      ok(Math.abs(right.size.x - left.size.x) < 1e-6, `${left.id}: both halves are the same width`);
    }
  }
}
ok(dividedSections >= 8, "the sweep reached shelf sections in several designs");

console.log(`Vertical divider: ${checks} checks passed.`);
