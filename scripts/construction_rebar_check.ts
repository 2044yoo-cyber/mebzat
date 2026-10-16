/**
 * The reinforcement and the stairs in the construction model: every bar is in
 * the concrete, the top steel reaches as far as the span says, the slab is cast to
 * the outer face of the frame, and a flight of stairs is a waist slab with steps.
 *
 *   npx tsx scripts/construction_rebar_check.ts
 *
 * Expected numbers are worked out here by hand from the grid and the stair's own
 * dimensions: the reach of a top bar from the panel beside it, the area of a flight
 * from its risers, goings and waist, the formwork from the slope. Bars are tested
 * against the concrete the finished building has, by a method that shares no code with
 * the generators.
 */
import assert from "node:assert/strict";

import { BUILDING_TEMPLATES, buildBuilding, configForArea, defaultConfig } from "../src/features/house-designer/construction/building-config";
import { Ctx } from "../src/features/house-designer/construction/context";
import { lattice, panelSpan, supportSteel, type BeamLine } from "../src/features/house-designer/construction/generators/slab-steel";
import { flightPolygon, flightSideArea, flightSoffitArea, footOf, soffitAt, wedgeLength } from "../src/features/house-designer/construction/generators/stair-flight";
import { profile, profileVolume, type P2, type Shape } from "../src/features/house-designer/construction/geometry";
import { buildConstructionModel } from "../src/features/house-designer/construction/model";
import { auditReinforcement } from "../src/features/house-designer/construction/reinforcement-audit";
import { rectRegion } from "../src/features/house-designer/construction/region";
import { slabCastOutline } from "../src/features/house-designer/construction/slab-cast";
import { DEFAULT_OPTIONS, DEFAULT_RULES, type ComponentRecord, type ConstructionModel } from "../src/features/house-designer/construction/types";
import { stairParams } from "../src/features/house-designer/services/stair-geometry";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };
const near = (actual: number, expected: number, message: string, tolerance = 1e-6) => { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not ${expected} (±${tolerance})`); checks += 1; };

const distanceToSegment = (p: P2, a: P2, b: P2): number => {
  const dx = b.x - a.x; const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

type Cyl = Extract<Shape, { t: "cyl" }>;
type Box = Extract<Shape, { t: "box" }>;
type Profile = Extract<Shape, { t: "profile" }>;

// ---------------------------------------------------------------------------
// 1. The audit finds what it should: a bar is in the concrete or it is reported
// ---------------------------------------------------------------------------
{
  const component = (id: string, kind: string, layer: ComponentRecord["layer"], materialId: string, shapes: Shape[]) => ({ id, name: id, kind, layer, materialId, shapes }) as unknown as ComponentRecord;
  const concrete = (id: string, shapes: Shape[]) => component(id, "slab", "concrete", "concrete", shapes);
  const bars = (id: string, shapes: Shape[], kind = "beam-bars") => component(id, kind, "reinforcement", "steel-bar", shapes);
  const bar = (x: number, y: number, z: number, len: number, axis: "x" | "y" | "z" = "x"): Shape => ({ t: "cyl", c: { x, y, z }, r: 8, len, axis });
  const model = (...components: ComponentRecord[]) => ({ components }) as unknown as ConstructionModel;
  const beam: Shape = { t: "box", c: { x: 2000, y: 0, z: 100 }, s: { x: 4000, y: 300, z: 200 } };

  equal(auditReinforcement(model(concrete("c", [beam]), bars("b", [bar(2000, 0, 100, 3600)]))).outside.length, 0, "a bar well inside a beam is fine");
  const poking = auditReinforcement(model(concrete("c", [beam]), bars("b", [bar(2300, 0, 100, 4600)])));
  equal(poking.outside.length, 1, "a bar that runs 300 mm out of the end of its beam is reported");
  ok(poking.outside[0]!.at.x > 4000 && poking.outside[0]!.at.x <= 4100, `at the first point past the end (${poking.outside[0]!.at.x})`);
  equal(auditReinforcement(model(concrete("c", [beam]), bars("b", [bar(2000, 0, 100, 3600)], "spacer"))).bars, 0, "spacers and chairs are not bars, and are not looked at");
  equal(auditReinforcement(model(concrete("c", [beam]), bars("b", [bar(2300, 0, 100, 4600)], "spacer"))).outside.length, 0, "whatever they do");

  // Two members that meet are one lump of concrete: a column bar runs on up through the slab it meets.
  const column: Shape = { t: "box", c: { x: 0, y: 0, z: 1000 }, s: { x: 300, y: 300, z: 2000 } };
  const slabOver: Shape = { t: "prism", poly: [{ x: -1000, y: -1000 }, { x: 1000, y: -1000 }, { x: 1000, y: 1000 }, { x: -1000, y: 1000 }], z0: 2000, z1: 2200 };
  equal(auditReinforcement(model(concrete("col", [column]), concrete("slab", [slabOver]), bars("b", [bar(0, 0, 1500, 1400, "z")], "column-bars"))).outside.length, 0, "a column bar rising through the slab over it is in concrete all the way");
  equal(auditReinforcement(model(concrete("col", [column]), concrete("slab", [slabOver]), bars("b", [bar(0, 0, 1500, 2000, "z")], "column-bars"))).outside.length, 1, "and one that comes out of the top of the slab is not");

  // A bar across an opening cut in a slab is in the air over it.
  const holed: Shape = { t: "prism", poly: [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { x: 0, y: 3000 }], z0: 0, z1: 200, holes: [[{ x: 1000, y: 1000 }, { x: 2000, y: 1000 }, { x: 2000, y: 2000 }, { x: 1000, y: 2000 }]] };
  equal(auditReinforcement(model(concrete("s", [holed]), bars("b", [bar(2000, 1500, 100, 3600)], "slab-bars-bottom"))).outside.length, 1, "a bar across the opening in a slab is reported");
  equal(auditReinforcement(model(concrete("s", [holed]), bars("b", [bar(500, 1500, 100, 800), bar(3000, 1500, 100, 1800)], "slab-bars-bottom"))).outside.length, 0, "the parts either side of it are fine");

  // A flight seen from the side: a bar above the sloping top is out, one below it is in.
  const triangle = profile({ x: 0, y: 0 }, { x: 1, y: 0 }, [{ s: 0, z: 0 }, { s: 1000, z: 0 }, { s: 1000, z: 500 }], 200);
  const inside = auditReinforcement(model(concrete("p", [triangle]), bars("b", [bar(750, 0, 100, 400)], "stair-rebar")));
  equal(inside.outside.length, 0, "a bar below the sloping top of a profile is inside it");
  const above = auditReinforcement(model(concrete("p", [triangle]), bars("b", [bar(250, 0, 400, 300)], "stair-rebar")));
  equal(above.outside.length, 1, "and one above the slope is outside");
  const across = auditReinforcement(model(concrete("p", [triangle]), bars("b", [bar(750, 0, 100, 600, "y")], "stair-rebar")));
  equal(across.outside.length, 1, "and one that runs out of the side of its thickness is outside");
  // A tilted bar is followed along its length.
  const tilted: Box = { t: "box", c: { x: 500, y: 0, z: 100 }, s: { x: 1000, y: 12, z: 12 }, ry: -Math.atan2(100, 500) };
  ok(auditReinforcement(model(concrete("p", [triangle]), bars("b", [tilted], "stair-rebar"))).samples >= 10, "a tilted bar is walked along its length");
  // A bar drawn as a box is a bar like any other, not a lump of concrete: one hanging in the air over a beam is reported.
  const floating: Box = { t: "box", c: { x: 2000, y: 0, z: 900 }, s: { x: 1000, y: 12, z: 12 } };
  equal(auditReinforcement(model(concrete("c", [beam]), bars("b", [floating]))).outside.length, 1, "a bar drawn as a box, in the air above a beam, is reported");
  equal(auditReinforcement(model(concrete("c", [beam]), bars("b", [{ ...floating, c: { x: 2000, y: 0, z: 100 } }]))).outside.length, 0, "and the same bar lowered into the beam is not");
  // A flight turned 45° in plan. Its bounding box in plan is much bigger than the flight, so a bar beside it is in the box but not in the concrete.
  const diagonal = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  const turned = profile({ x: 0, y: 0 }, diagonal, [{ s: 0, z: 0 }, { s: 1000, z: 0 }, { s: 1000, z: 500 }], 200);
  const beside = (w: number): Shape => ({ t: "cyl", c: { x: diagonal.x * 750 + diagonal.y * w, y: diagonal.y * 750 - diagonal.x * w, z: 100 }, r: 8, len: 100, axis: "z" });
  equal(auditReinforcement(model(concrete("p", [turned]), bars("b", [beside(50)], "stair-rebar"))).outside.length, 0, "a bar 50 mm to one side of the middle of a 200 mm thick flight, turned 45° in plan, is in it");
  equal(auditReinforcement(model(concrete("p", [turned]), bars("b", [beside(-50)], "stair-rebar"))).outside.length, 0, "and 50 mm to the other side");
  equal(auditReinforcement(model(concrete("p", [turned]), bars("b", [beside(300)], "stair-rebar"))).outside.length, 1, "but one 300 mm to the side is beside it, in the air, though inside the box that holds the flight in plan");
  equal(auditReinforcement(model(concrete("p", [turned]), bars("b", [beside(-300)], "stair-rebar"))).outside.length, 1, "on either side");
}

// ---------------------------------------------------------------------------
// 2. Lines across a slab: the bars stop at the edge and at an opening
// ---------------------------------------------------------------------------
{
  const region = rectRegion({ x0: 0, y0: 0, x1: 4000, y1: 3000 });
  const hole = rectRegion({ x0: 1000, y0: 1000, x1: 2000, y1: 2000 });
  const x = lattice(region, [hole], "x", 500, 100, 5) as Cyl[];
  // Six lines, a millimetre in from the edges and 599.6 mm apart: four run whole, the two that meet the opening (y = 1200.2 and 1799.8) are cut in two.
  equal(x.length, 8, "six lines across a slab with an opening: four whole bars and two cut in two");
  equal(x.filter((bar) => Math.abs(bar.len - 4000) < 1e-6).length, 4, "the whole ones run the full 4 m");
  equal(x.filter((bar) => Math.abs(bar.len - 1000) < 1e-6).length + x.filter((bar) => Math.abs(bar.len - 2000) < 1e-6).length, 4, "and the cut ones are 1 m and 2 m, either side of the opening");
  ok(x.every((bar) => bar.axis === "x" && bar.c.z === 100 && bar.r === 5), "all along x, at the height and radius asked for");
  // Along y: eight lines 571 mm apart, a millimetre in from the sides; the two at x = 1143 and 1714 meet the opening and are cut into 1 m pieces either side of it.
  const y = lattice(region, [hole], "y", 500, 100, 5) as Cyl[];
  equal([y.length, y.filter((bar) => Math.abs(bar.len - 3000) < 1e-6).length, y.filter((bar) => Math.abs(bar.len - 1000) < 1e-6).length], [10, 6, 4], "the same the other way: six whole bars 3 m long and four pieces 1 m long");
  ok(y.every((bar) => bar.axis === "y"), "along y");
  const ell: P2[] = [{ x: 0, y: 0 }, { x: 4000, y: 0 }, { x: 4000, y: 2000 }, { x: 2000, y: 2000 }, { x: 2000, y: 4000 }, { x: 0, y: 4000 }];
  const inL = lattice(ell, [], "x", 500, 0, 5) as Cyl[];
  ok(inL.every((bar) => bar.c.x - bar.len / 2 >= -1.0001 && bar.c.x + bar.len / 2 <= (bar.c.y < 2000 ? 4001 : 2001)), "in an L-shaped slab no bar goes out of the L");
}

// ---------------------------------------------------------------------------
// 3. The slab is cast out to the outer face of the frame
// ---------------------------------------------------------------------------
const existing = buildBuilding({ template: "existing" });
{
  const ctx = new Ctx(existing.project, DEFAULT_OPTIONS, DEFAULT_RULES);
  const cast = slabCastOutline(ctx, existing.project.levels[1]!.id);
  const xs = cast.map((p) => p.x); const ys = cast.map((p) => p.y);
  // The columns are 300 mm and the beams 250 mm, standing on the outline: the widest half is 150 mm.
  equal([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], [-150, 12150, -150, 9150], "the slab of the Existing Building runs 150 mm past the outline, to the outer face of its 300 mm columns");
  const wide = buildBuilding({ template: "modern-house" });
  const ctxWide = new Ctx(wide.project, DEFAULT_OPTIONS, DEFAULT_RULES);
  const castWide = slabCastOutline(ctxWide, wide.project.levels[1]!.id);
  const half = Math.max(wide.params.columnSize, wide.params.beamWidth) / 2;
  near(Math.max(...castWide.map((p) => p.x)) - Math.min(...castWide.map((p) => p.x)), wide.config.length + 2 * half, "and a bigger frame casts the slab out by half of its own columns");
}

// ---------------------------------------------------------------------------
// 4. Top steel over the supports, worked out by hand for the grid of the Existing Building
// ---------------------------------------------------------------------------
{
  const gx = [0, 4000, 8000, 10400, 12000];
  const gy = [0, 4500, 9000];
  const beams: BeamLine[] = [];
  for (const y of gy) for (let i = 0; i + 1 < gx.length; i += 1) beams.push({ start: { x: gx[i]!, y }, end: { x: gx[i + 1]!, y }, width: 250 });
  for (const x of gx) for (let j = 0; j + 1 < gy.length; j += 1) beams.push({ start: { x, y: gy[j]! }, end: { x, y: gy[j + 1]! }, width: 250 });
  const zone = rectRegion({ x0: 0, y0: 0, x1: 12000, y1: 9000 }, 150);
  const steel = supportSteel({ beams, zone, outline: zone, holes: [], spacing: 200, zTop: 3155, zBottomBars: 3055, cover: 40, r: 5, thickness: 200 });
  const mains = steel.mains as Cyl[];

  // How far the next beam is, either side: the panel span the reach is taken from.
  near(panelSpan(beams[0]!, beams, 1)!, 4500, "the beam along the front has the next one 4.5 m behind it");
  equal(panelSpan(beams[0]!, beams, -1), null, "and none in front");
  // A beam running along y has its left, side +1, toward -x.
  near(panelSpan(beams.find((b) => b.start.x === 8000 && b.end.x === 8000 && b.start.y === 0)!, beams, 1)!, 4000, "the beam at 8.0 m, along y, has the one at 4.0 m 4.0 m to its left");
  near(panelSpan(beams.find((b) => b.start.x === 8000 && b.end.x === 8000 && b.start.y === 0)!, beams, -1)!, 2400, "and the one at 10.4 m 2.4 m to its right");

  // The next support is a beam that runs parallel and alongside this one: not one at an angle, and not one with no part opposite this one.
  {
    const a: BeamLine = { start: { x: 0, y: 0 }, end: { x: 5000, y: 0 }, width: 250 };
    const next: BeamLine = { start: { x: 0, y: 4500 }, end: { x: 5000, y: 4500 }, width: 250 };
    near(panelSpan(a, [a, next], 1)!, 4500, "a beam 4.5 m away in front of the whole of this one is the next support");
    const slanted: BeamLine = { start: { x: 500, y: 1500 }, end: { x: 3500, y: 3000 }, width: 250 };
    near(panelSpan(a, [a, next, slanted], 1)!, 4500, "a beam across at an angle, with its middle 2.25 m away, is not");
    const beyond: BeamLine = { start: { x: 5200, y: 1000 }, end: { x: 7000, y: 1000 }, width: 250 };
    near(panelSpan(a, [a, next, beyond], 1)!, 4500, "nor is a parallel one that starts 200 mm past the end of this one, with no part of it opposite");
    const brush: BeamLine = { start: { x: 4800, y: 1000 }, end: { x: 7000, y: 1000 }, width: 250 };
    near(panelSpan(a, [a, next, brush], 1)!, 4500, "nor one that is opposite for only 200 mm of its length");
    const lap: BeamLine = { start: { x: 4600, y: 1000 }, end: { x: 7000, y: 1000 }, width: 250 };
    near(panelSpan(a, [a, next, lap], 1)!, 1000, "but one that is opposite for 400 mm of it is, 1 m away");
    equal(panelSpan(a, [a, next, lap], -1), null, "and it is not on the other side of this beam");
  }

  // The reach of the bars is a third of the panel span on each side of a support, at least 600 mm; at the edge of the slab the bar stops a cover
  // short of it (the slab is cast 150 mm past the beam, less 40 mm).
  const along = (axis: "x" | "y", line: number, others: number[]) => mains.filter((m) => {
    const lo = (axis === "x" ? m.c.x : m.c.y) - m.len / 2; const hi = (axis === "x" ? m.c.x : m.c.y) + m.len / 2;
    return m.axis === axis && lo <= line + 1 && hi >= line - 1 && !others.some((o) => o !== line && lo < o && hi > o);
  });
  const expectX: Record<number, number> = { 0: 110 + 1200, 4000: 1200 + 1200, 8000: 1200 + 720, 10400: 720 + 600, 12000: 110 + 600 };
  for (const x of gx) {
    const group = along("x", x, gx);
    equal(group.length, 44, `the beams at x = ${x}: 44 top bars across them, 22 over each of the two lengths between columns`);
    ok(group.every((m) => Math.abs(m.len - expectX[x]!) < 1e-6), `and each reaches ${expectX[x]} mm: ${[...new Set(group.map((m) => Math.round(m.len)))].join(", ")}`);
  }
  const expectY: Record<number, number> = { 0: 110 + 1350, 4500: 1350 + 1350, 9000: 110 + 1350 };
  const countY: Record<number, number> = { 0: 56, 4500: 56, 9000: 56 };
  for (const y of gy) {
    const group = along("y", y, gy);
    equal(group.length, countY[y]!, `the beams at y = ${y}: ${countY[y]} top bars across them`);
    ok(group.every((m) => Math.abs(m.len - expectY[y]!) < 1e-6), `and each reaches ${expectY[y]} mm: ${[...new Set(group.map((m) => Math.round(m.len)))].join(", ")}`);
  }
  equal(mains.length, 44 * 5 + 56 * 3, "no other top bars");
  // A leg is turned down at every bar that is cut short by the edge of the slab, and at no other: 2 × 44 + 2 × 56.
  const hooks = steel.hooks as Cyl[];
  equal(hooks.length, 2 * 44 + 2 * 56, "a leg turned down at each bar that ends at the edge of the slab");
  ok(hooks.every((h) => h.axis === "z" && Math.abs(h.c.z + h.len / 2 - (h.len === 95 ? 3155 - 10 : 3155)) < 1e-6), "hanging from the bar, upright");
  equal([...new Set(hooks.map((h) => h.len))].sort((a, b) => a - b), [95, 105], "105 mm in the upper layer, 95 mm in the lower (200 mm slab, 40 mm cover, two 10 mm layers)");
  // The two layers: bars across the beams along x are in the lower one, across the beams along y in the upper.
  ok(mains.filter((m) => m.axis === "y").every((m) => Math.abs(m.c.z - (3155 - 10)) < 1e-6) && mains.filter((m) => m.axis === "x").every((m) => Math.abs(m.c.z - 3155) < 1e-6), "the bars that cross each other are not at one height");
  // Bars along each beam across the width the top bars reach, 250 mm apart, a 50 mm in from the end of the reach: 1 + (reach − 100) ÷ 250, rounded down, for each of the 22 beams.
  // Along y, x = 0: reach 1310 gives 5 each of 2 beams; x = 4000: 2400 gives 10; 8000: 1920 gives 8; 10400: 1320 gives 5; 12000: 710 gives 3. Along x, y = 0: 1460 gives 6 each of 4 beams; 4500: 2700 gives 11; 9000: 6.
  equal(steel.distribution.length, 2 * (5 + 10 + 8 + 5 + 3) + 4 * (6 + 11 + 6), "the bars along the beams that the top bars rest on: 62 along y and 92 along x");
  // A chair every metre along each beam, a 400 mm in from each end: 4 on a 4.5 m or 4.0 m beam, 2 on a 2.4 m or 1.6 m one.
  equal(steel.chairs.length, 10 * 4 + 3 * (4 + 4 + 2 + 2), "and the chairs under the top steel: 40 on the beams along y, 36 on those along x");

  // An opening in the slab stops the bars that would run into it, a cover short.
  const stairwell = rectRegion({ x0: 8000, y0: 5000, x1: 10400, y1: 8000 });
  const cut = supportSteel({ beams, zone, outline: zone, holes: [stairwell], spacing: 200, zTop: 3155, zBottomBars: 3055, cover: 40, r: 5, thickness: 200 });
  const into = (cut.mains as Cyl[]).filter((m) => { const x0 = m.c.x - (m.axis === "x" ? m.len / 2 : 0); const x1 = m.c.x + (m.axis === "x" ? m.len / 2 : 0); const y0 = m.c.y - (m.axis === "y" ? m.len / 2 : 0); const y1 = m.c.y + (m.axis === "y" ? m.len / 2 : 0); return x1 > 8000 + 1 && x0 < 10400 - 1 && y1 > 5000 + 1 && y0 < 8000 - 1; });
  equal(into.length, 0, "no top bar runs through the stairwell");
}

// ---------------------------------------------------------------------------
// 5. Every bar of every building is in concrete
// ---------------------------------------------------------------------------
const sizes = BUILDING_TEMPLATES.flatMap((template) => [
  { name: `${template} at its example size`, config: defaultConfig(template) },
  { name: `${template} at 200 m² a floor`, config: configForArea(defaultConfig(template), 200).config },
]);
{
  for (const { name, config } of sizes) {
    const building = buildBuilding(config);
    const model = buildConstructionModel(building.project, { ...DEFAULT_OPTIONS, ...building.options }, DEFAULT_RULES);
    const audit = auditReinforcement(model);
    equal(audit.outside.map((f) => f.note).slice(0, 3), [], `${name}: every bar is in the concrete (${audit.bars} bars, ${audit.samples} points looked at)`);
    ok(audit.bars > 5000, `${name}: and the audit really looked at bars`);
    const kinds = new Set(model.components.filter((c) => c.layer === "reinforcement" && c.kind !== "spacer").map((c) => c.kind));
    for (const kind of ["column-bars", "column-stirrups", "beam-bars", "beam-stirrups", "slab-bars-bottom", "slab-bars-top", "floor-mesh", "stair-rebar", "footing-rebar", "starter-bars", "slab-edge-bars"]) ok(kinds.has(kind), `${name}: ${kind} is in the model`);
  }
}

// ---------------------------------------------------------------------------
// 6. The model: support bars in the beams, mesh that keeps clear of the shafts
// ---------------------------------------------------------------------------
const model = buildConstructionModel(existing.project, { ...DEFAULT_OPTIONS, ...existing.options }, DEFAULT_RULES);
const byId = (id: string) => model.components.find((c) => c.id === id)!;
{
  // The ground-floor beam along the front between the first two columns: 4 m centre to centre, 300 mm columns, so 3.7 m clear.
  const beamBars = byId("frame:ground-floor-beam-x-A1-2:bars");
  const cyls = beamBars.shapes as Cyl[];
  equal(cyls.length, 3 + 2 + 4, "a beam has three bars at the bottom, two at the top, and four more at the top over its two ends");
  const support = cyls.filter((c) => Math.abs(c.len - 1360) < 1e-6);
  // 100 mm into the column past its centre line, 150 mm to the face, and a third of the 3.7 m clear span (1110 mm) into the beam.
  equal(support.length, 4, "the four are 1360 mm long: 100 into the column, 150 to its face, 1110 (0.3 of 3.7 m) into the beam");
  const starts = support.map((c) => Math.round(c.c.x - c.len / 2)).sort((a, b) => a - b);
  equal(starts, [-100, -100, 2740, 2740], "one pair from 100 mm behind the column centre at each end");
  const topOfBeam = Math.max(...cyls.map((c) => c.c.z));
  ok(support.every((c) => Math.abs(c.c.z - (topOfBeam - 36)) < 1e-6), "36 mm below the two bars that run the whole length");
  equal(cyls.filter((c) => Math.abs(c.len - 3900) < 1e-6).length, 5, "which are the length of the beam less the 50 mm at each end: 3.9 m");

  // A leg turned down stands at the outer edge of the slab as cast, a cover in: nowhere else, not at the joint between the two pours or at an opening.
  const ctx = new Ctx(existing.project, DEFAULT_OPTIONS, DEFAULT_RULES);
  const legsOf = new Map<string, number>();
  for (const c of model.components.filter((x) => x.kind === "slab-bars-top")) {
    const cast = slabCastOutline(ctx, c.storeyId!);
    const slabName = c.id.split(":")[2]!;
    for (const shape of c.shapes) {
      if (shape.t !== "cyl" || shape.axis !== "z") continue;
      legsOf.set(slabName, (legsOf.get(slabName) ?? 0) + 1);
      const edge = Math.min(...cast.map((p, i) => distanceToSegment({ x: shape.c.x, y: shape.c.y }, p, cast[(i + 1) % cast.length]!)));
      if (edge > 46) assert.fail(`${c.id}: a leg stands ${Math.round(edge)} mm from the edge of the slab, at (${Math.round(shape.c.x)}, ${Math.round(shape.c.y)})`);
    }
  }
  // The roof slab has no stairwell: its legs are the 200 of the unit case above, split between the two pours without losing or doubling one. The floors lose the few the stairwell cuts off.
  equal(legsOf.get("roof"), 2 * 44 + 2 * 56, "the roof slab has a leg at each of the 200 bars that end at its edge, over its two pours");
  ok([...legsOf].filter(([name]) => name !== "roof").every(([, n]) => n >= 180 && n <= 200), `and the floors have nearly as many (${[...legsOf].map(([name, n]) => `${name} ${n}`).join(", ")})`);

  // The ground slab's mesh: bars stop short of the columns that come up through it and of the shafts.
  const mesh = byId("ground:mesh");
  const meshBars = mesh.shapes as Cyl[];
  ok(meshBars.length > 100, `the mesh is bars each way (${meshBars.length})`);
  const slab = byId("ground:slab").shapes[0] as Extract<Shape, { t: "prism" }>;
  ok((slab.holes ?? []).length >= 8, `in a slab with a hole for each of its pedestals and shafts (${slab.holes?.length})`);
  const inHole = meshBars.filter((bar) => (slab.holes ?? []).some((hole) => {
    const xs = hole.map((p) => p.x); const ys = hole.map((p) => p.y);
    const x0 = bar.c.x - (bar.axis === "x" ? bar.len / 2 : 0); const x1 = bar.c.x + (bar.axis === "x" ? bar.len / 2 : 0);
    const y0 = bar.c.y - (bar.axis === "y" ? bar.len / 2 : 0); const y1 = bar.c.y + (bar.axis === "y" ? bar.len / 2 : 0);
    return x1 > Math.min(...xs) && x0 < Math.max(...xs) && y1 > Math.min(...ys) && y0 < Math.max(...ys);
  }));
  equal(inHole.length, 0, "and no mesh bar passes through any of those holes");
}

// ---------------------------------------------------------------------------
// 7. A flight of stairs: a waist slab with steps, worked out from its risers, goings and waist
// ---------------------------------------------------------------------------
{
  const stair = existing.project.stairs[0]!;
  const params = stairParams(stair);
  const R = params.height / params.risers;
  const T = params.treadDepth;
  const width = params.stairWidth;
  const waist = 150;
  const slab = existing.params.slabThickness;
  // 3.2 m floor to floor: 19 risers of 168.4 mm; the dog-leg has 18 treads, one of them the landing, so 17 in two flights of 9 and 8.
  equal([params.risers, Math.round(R * 10) / 10], [19, 168.4], "19 risers of 168.4 mm for the 3.2 m storey");
  const flights = [9, 8];
  const cosT = T / Math.hypot(T, R);
  const tv = waist / cosT;
  const foot = (tv * T) / R;
  const mainArea = (n: number) => R * T * (n * (n + 1) / 2) - ((R / (2 * T)) * ((n * T) ** 2 - foot ** 2) - tv * (n * T - foot));
  const wedgeArea = () => { const h = R - (waist + 50) + tv; return (h * h * T) / (2 * R); };
  near(slab, 200, "the suspended slab the stair runs up into is 200 mm", 1e-9);
  let formworkTotal = 0;
  flights.forEach((n, i) => {
    const flight = byId(`stairs:ground-floor-stair:flight-${i + 1}`);
    const shapes = flight.shapes as Profile[];
    equal(shapes.map((s) => s.t), ["profile", "profile"], `flight ${i + 1} is a profile for the steps and the waist, and another for the wedge under what it runs into`);
    const expected = (mainArea(n) + wedgeArea()) * width;
    near(shapes.reduce((sum, s) => sum + profileVolume(s), 0), expected, `flight ${i + 1} (${n} treads): the steps on a 150 mm waist, and the wedge, have the volume worked out from the risers and goings`, 1);
    const quantity = flight.quantities.find((q) => q.workItem === "concrete.stair")!;
    near(quantity.value!, Math.round(expected * 1e-9 * 1e4) / 1e4, `and the quantity is that volume in m³`, 1e-4);
    equal(quantity.status, "calculated", "a calculated figure, because the outline is exact");
    near(shapes[0]!.thickness, width, "extruded across the width of the flight");
    // The soffit leaves the floor a little way up the flight and runs on to meet the underside of what it runs into.
    const nominal = { origin: shapes[0]!.origin, dir: shapes[0]!.dir, width, treads: n, going: T, riser: R, waist, zBase: shapes[0]!.poly[0]!.z, zJoin: i === 0 ? shapes[0]!.poly[0]!.z + (n + 1) * R - (waist + 50) : existing.project.levels[0]!.elevation + 3000 };
    near(footOf(nominal), foot, `flight ${i + 1}: the soffit meets the floor ${Math.round(foot)} mm up the flight`, 1e-6);
    near(soffitAt(nominal, n * T), nominal.zBase + n * R - tv, "and is one waist under the line through the inner corners of the steps at the top");
    near(wedgeLength(nominal), ((R - (waist + 50) + tv) * T) / R, "it runs on 238 mm under the landing or the slab to meet its underside");
    near(flightSideArea(nominal) * 1e6, mainArea(n) + wedgeArea(), "the side view of the flight has the worked-out area", 1e-3);
    equal(flightPolygon(nominal).length, 2 * n + 3, `${2 * n + 3} corners: the foot of the first riser, where the soffit leaves the floor, the end of the soffit, and two for each of the ${n} treads`);
    // Formwork: the soffit along the slope, and the two sides.
    const run = n * T + wedgeLength(nominal) - foot;
    const rise = nominal.zJoin - nominal.zBase;
    near(flightSoffitArea(nominal), (Math.hypot(run, rise) * width) * 1e-6, "the soffit is measured along the slope", 1e-6);
    formworkTotal += (Math.hypot(run, rise) * width * 1e-6) + 2 * (mainArea(n) + wedgeArea()) * 1e-6;
  });
  // The landing: a 2 m × 1 m slab, 200 mm thick, with bars each way near its underside; its formwork is its plan area.
  const landing = byId("stairs:ground-floor-stair:landing-1");
  const landingPrism = landing.shapes[0] as Extract<Shape, { t: "prism" }>;
  near(landingPrism.z1 - landingPrism.z0, waist + 50, "the landing is 200 mm thick");
  formworkTotal += 2.0;
  const form = byId("stairs:ground-floor-stair:form").quantities.find((q) => q.workItem === "formwork.stair")!;
  near(form.value!, Math.round(formworkTotal * 1e3) / 1e3, "the stair's formwork is the two soffits and four sides along the slope, and the landing", 1e-3);
  const landingBars = byId("stairs:ground-floor-stair:landing-1:bars").shapes as Cyl[];
  ok(landingBars.length > 10 && landingBars.every((b) => b.c.z > landingPrism.z0 + 40 && b.c.z < landingPrism.z1 - 40), `bars each way in the landing, a cover above its underside and below its top (${landingBars.length})`);
  // The props stand on the floor and end under the deck, not in the concrete: below the soffit by the thickness of the ply.
  {
    const flightsOf = [1, 2].map((i) => {
      const shapes = byId(`stairs:ground-floor-stair:flight-${i}`).shapes as Profile[];
      const n = flights[i - 1]!;
      return { origin: shapes[0]!.origin, dir: shapes[0]!.dir, width, treads: n, going: T, riser: R, waist, zBase: shapes[0]!.poly[0]!.z, zJoin: i === 1 ? shapes[0]!.poly[0]!.z + (n + 1) * R - (waist + 50) : existing.project.levels[0]!.elevation + 3000 };
    });
    const props = byId("stairs:ground-floor-stair:props").shapes as Cyl[];
    let under = 0;
    for (const prop of props) {
      const top = prop.c.z + prop.len / 2;
      const f = flightsOf.find((candidate) => {
        const dx = prop.c.x - candidate.origin.x; const dy = prop.c.y - candidate.origin.y;
        const s = dx * candidate.dir.x + dy * candidate.dir.y; const across = dx * candidate.dir.y - dy * candidate.dir.x;
        return Math.abs(across) < width / 2 && s > footOf(candidate) && s < candidate.treads * T;
      });
      if (!f) continue;
      const s = (prop.c.x - f.origin.x) * f.dir.x + (prop.c.y - f.origin.y) * f.dir.y;
      near(top, soffitAt(f, s) - 18 / (T / Math.hypot(T, R)), "a prop under a flight ends at the underside of the deck, which is under the soffit by the ply", 0.01);
      near(prop.c.z - prop.len / 2, existing.project.levels[0]!.elevation, "and stands on the floor", 0.01);
      under += 1;
    }
    equal(under, 6, "the props under the treads: two rows under the first flight (where the deck is more than 100 mm above the floor) and two under the second, a pair in each row");
    // The main bars lie a cover above the soffit, measured at right angles to the slope.
    const bar = (byId("stairs:ground-floor-stair:flight-1:bars").shapes as Shape[]).find((x) => x.t === "box") as Box;
    const f = flightsOf[0]!;
    // From a cover and 60 mm past where the soffit leaves the floor, to 50 mm into the wedge.
    const sMid = (footOf(f) + 40 + 60 + f.treads * T + 50) / 2;
    const along = (bar.c.x - f.origin.x) * f.dir.x + (bar.c.y - f.origin.y) * f.dir.y;
    near(along, sMid, "a main bar of the first flight is centred half way along it", 1);
    near(bar.c.z, soffitAt(f, along) + (40 + 6) / (T / Math.hypot(T, R)), "a cover (40 mm, and half the 12 mm bar) above the soffit, at right angles to the slope", 0.01);
  }
  // Seven main bars a flight, 150 mm apart across the 1 m, and the bars across them.
  const mainBars = (byId("stairs:ground-floor-stair:flight-1:bars").shapes as Shape[]).filter((s) => s.t === "box") as Box[];
  equal(mainBars.length, 7, "seven main bars along each flight, 150 mm apart across its metre");
  ok(mainBars.every((b) => b.ry !== undefined && Math.abs(b.ry + Math.atan2(R, T)) < 1e-9), "tilted to the slope of the steps");
}

console.log(`Construction reinforcement and stairs: ${checks} checks passed.`);
