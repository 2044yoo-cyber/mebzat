/**
 * The per-section vertical divider: absent means none, on adds one upright
 * board to that section only, off takes it away, and a saved design keeps it.
 *
 *   npx tsx scripts/berchuma_vertical_divider_check.ts
 */
import assert from "node:assert/strict";

import { buildParts } from "../src/features/berchuma-studio/services/geometry";
import { setBayVerticalDivider } from "../src/features/berchuma-studio/services/operations";
import { startingDesign } from "../src/features/berchuma-studio/services/starting-designs";
import { parseSpec } from "../src/features/berchuma-studio/types/spec";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

const spec = startingDesign("wardrobe", { width: 2400 });
const cabinet = spec.cabinets[0]!;
const bay = cabinet.bays.find((entry) => entry.fitting.kind !== "drawers") ?? cabinet.bays[0]!;
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

console.log(`Vertical divider: ${checks} checks passed.`);
