import { UP, type Ctx, type LevelInfo } from "../context";
import { box, cyl, v3, type P2, type Shape } from "../geometry";
import { addQuantity, f2, round } from "../helpers";
import { planElectrical } from "../electrical-plan";
import { DUCT_HEIGHT, local, type Frame, type Riser } from "../service-plan";
import { planPlumbing } from "../plumbing-plan";
import { atEdge } from "../service-routing";
import type { ServiceInfo } from "../types";

/**
 * What the building has to do for its services, and the covers that hide them.
 *
 * Stage 7 (blockwork): the chases cut in the walls for conduit, and the
 * sleeves left in the walls where a pipe or a conduit goes straight through.
 * Stage 10: the flashing round each stack where it leaves the roof.
 * Stage 11 (plaster): the covers that close the shafts, the cupboard and the
 * pre-wall ducts, each with the hatch that keeps a valve or a rodding eye
 * reachable. Everything is read from the same plans the pipes and conduits
 * are drawn from, so a chase ends at its box, a sleeve sits on its pipe and a
 * cover stands on the shaft it closes.
 */

const COVER_T = 18;
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const info = (system: ServiceInfo["system"], role: ServiceInfo["role"], from: string, to: string, route: string): ServiceInfo => ({ system, role, from, to, route });

/** The extent of a rectangle along a local frame's `u` and `v` axes. */
function extentIn(f: Frame, rect: { x0: number; y0: number; x1: number; y1: number }) {
  const corners: P2[] = [{ x: rect.x0, y: rect.y0 }, { x: rect.x1, y: rect.y0 }, { x: rect.x1, y: rect.y1 }, { x: rect.x0, y: rect.y1 }];
  const us = corners.map((p) => (p.x - f.origin.x) * f.ux + (p.y - f.origin.y) * f.uy);
  const vs = corners.map((p) => (p.x - f.origin.x) * f.vx + (p.y - f.origin.y) * f.vy);
  return { u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs) };
}

/** A thin panel standing on a local frame: `u` across, `v` out, from `z0` to `z1`. */
function panel(f: Frame, u0: number, u1: number, v: number, thickness: number, z0: number, z1: number): Shape {
  const c = local(f, (u0 + u1) / 2, v);
  return box(c.x, c.y, (z0 + z1) / 2, u1 - u0, thickness, z1 - z0, Math.atan2(f.uy, f.ux));
}

export function generateServiceStructure(ctx: Ctx): void {
  const ground = ctx.ground;
  if (!ground) return;
  const electrical = planElectrical(ctx);
  const plumbing = planPlumbing(ctx);

  // --- Stage 7: chases ---------------------------------------------------------------------------------
  const chasesByLevel = new Map<number, typeof electrical.chases>();
  for (const chase of electrical.chases) chasesByLevel.set(chase.level, [...(chasesByLevel.get(chase.level) ?? []), chase]);
  for (const [levelIndex, list] of chasesByLevel) {
    const level = ctx.levels[levelIndex];
    if (!level) continue;
    const shapes: Shape[] = list.map((c) => {
      // The groove runs from the wall face 55 mm into it; the conduit sits in it, 35 mm in.
      const centre = { x: c.at.x + c.nx * 7.5, y: c.at.y + c.ny * 7.5 };
      return box(centre.x, centre.y, (c.z0 + c.z1) / 2, 40, 55, c.z1 - c.z0, Math.atan2(c.uy, c.ux));
    });
    const length = list.reduce((s, c) => s + (c.z1 - c.z0), 0);
    const comp = ctx.add({
      id: `svc:chases:${levelIndex}`, name: `Wall chases for conduit — ${level.name}`, kind: "wall-chase", category: "electrical", subcategory: "Builder's work", stage: 7, level, layer: "electrical", materialId: "mortar", shapes, repeated: { noun: "chase" },
      source: "schematic", concealed: true, explode: { layerIndex: 3, dir: UP }, note: "Cut in the blockwork when the wall is built, or chased after, to the width and depth of the conduit. The conduit is fixed in it and the chase is made good before plastering.",
      service: info("electrical", "structure", "Floor slab, at the foot of the wall", "Back boxes for switches and sockets", "Vertical groove in the inside face of the wall"),
    });
    addQuantity(ctx, comp, { workItem: "masonry.chase", description: "Chasing blockwork for conduit", section: "F", unit: "m", value: round(length / 1000, 3), formula: `${list.length} chases, ${f2(length / 1000)} m in all`, inputs: { count: list.length, length: round(length, 0) }, status: "assumed" }, { assumptions: ["Chase depth and the limits on chasing in load-bearing walls come from the structural designer."] });
  }

  // --- Stage 7: sleeves -----------------------------------------------------------------------------------
  const beamSleeves = plumbing.sleeves.filter((s) => s.host === "ground-beam");
  if (beamSleeves.length) {
    const comp = ctx.add({
      id: "svc:beam-sleeves", name: "Sleeves cast into the ground beams", kind: "beam-sleeve", category: "plumbing", subcategory: "Builder's work", stage: 3, level: null, storeyIndex: -1, layer: "plumbing", materialId: "pvc", shapes: beamSleeves.map((s) => cyl(s.x, s.y, s.z, s.diameter / 2, s.length, s.axis)), repeated: { noun: "sleeve" },
      source: "schematic", concealed: true, explode: { layerIndex: 1, dir: v3(0, 0, -1) }, note: "Set in the beam's formwork before the concrete is poured, in the middle of its depth, so that the drain passes through without cutting the beam. Where and how large comes from the structural designer.",
      service: info("drain", "structure", "Foul drain", "Foul drain, other side of the beam", "Straight through the beam, at right angles, in the middle of its depth"),
    });
    addQuantity(ctx, comp, { workItem: "plumbing.beam-sleeve", description: "Sleeves through ground beams", section: "C", unit: "piece", value: beamSleeves.length, formula: `${beamSleeves.length} drain crossings of ground beams`, inputs: { count: beamSleeves.length }, status: "assumed" });
  }
  const sleeves = [...(electrical.entry?.sleeves ?? []), ...plumbing.sleeves.filter((s) => s.host !== "ground-beam")];
  if (sleeves.length) {
    const comp = ctx.add({
      id: "svc:sleeves", name: "Sleeves through the walls", kind: "wall-sleeve", category: "electrical", subcategory: "Builder's work", stage: 7, level: ground, layer: "electrical", materialId: "pvc", shapes: sleeves.map((s) => cyl(s.x, s.y, s.z, s.diameter / 2 + 4, s.length, s.axis)), repeated: { noun: "sleeve" },
      source: "schematic", concealed: true, explode: { layerIndex: 3, dir: UP }, note: "A short length of pipe set in the wall as it is built, so that a pipe or conduit can pass through later without breaking the blockwork.",
      service: info("electrical", "structure", "Inside of the building", "Outside of the building", "Straight through the wall"),
    });
    addQuantity(ctx, comp, { workItem: "electrical.sleeve", description: "Wall sleeves", section: "F", unit: "piece", value: sleeves.length, formula: `${sleeves.length} sleeves set in the walls`, inputs: { count: sleeves.length }, status: "assumed" });
  }

  // --- Stage 10: flashing where each stack leaves the roof -------------------------------------------------
  if (plumbing.stacks.length) {
    const boots = plumbing.stacks.map((s) => cyl(s.centre.x, s.centre.y, plumbing.roofTop + 75, 90, 150, "z"));
    const comp = ctx.add({
      id: "svc:roof-boots", name: "Flashing round the stacks at the roof", kind: "pipe-boot", category: "plumbing", subcategory: "Roof penetrations", stage: 10, level: ctx.top, layer: "plumbing", materialId: "flashing", shapes: boots, repeated: { noun: "boot" },
      source: "schematic", explode: { layerIndex: 5, dir: UP }, note: "The roof covering is dressed up to the pipe and sealed under this collar, so that water cannot run down the pipe into the shaft.",
      service: info("soil", "structure", "Soil and vent stack", "Roof covering", "Collar round the pipe where it leaves the roof"),
    });
    addQuantity(ctx, comp, { workItem: "plumbing.boot", description: "Roof flashing collars", section: "O", unit: "piece", value: boots.length, formula: `1 per stack = ${boots.length}`, inputs: { count: boots.length }, status: "assumed" });
  }

  // --- Stage 11: covers over the shafts, with a hatch at the foot of the stack ---------------------------
  const closing = (riser: Riser, system: ServiceInfo["system"], what: string, idBase: string, role: string) => {
    const e = extentIn(riser.frame, riser.housing);
    for (const level of ctx.levels) {
      const z0 = level.floorZ;
      const z1 = level.ceilingZ;
      const comp = ctx.add({
        id: `${idBase}:${level.index}`, name: `${what} — ${level.name}`, kind: "shaft-cover", category: system === "electrical" ? "electrical" : "plumbing", subcategory: "Covers", stage: 11, level, layer: system === "electrical" ? "electrical" : "plumbing", materialId: "gypsum",
        shapes: [panel(riser.frame, e.u0, e.u1, e.v1 + COVER_T / 2, COVER_T, z0, z1)], source: "schematic", room: riser.rooms[level.index] ?? null, explode: { layerIndex: 6, dir: v3(riser.frame.vx, riser.frame.vy, 0) },
        note: `Closes the front of the ${role} so that the room has a flat wall. ${level.index === 0 && system !== "electrical" ? "The hatch at the foot gives access to the rodding eye on the stack." : "A removable panel keeps the services reachable."}`,
        service: info(system, "structure", `${role[0]!.toUpperCase()}${role.slice(1)}`, "Room", "Panel across the front, skimmed and painted with the wall"),
      });
      addQuantity(ctx, comp, { workItem: "plumbing.shaft-cover", description: "Service covers", section: "J", unit: "m²", value: round(((e.u1 - e.u0) * (z1 - z0)) * 1e-6, 3), formula: `${f2((e.u1 - e.u0) / 1000)} m wide × ${f2((z1 - z0) / 1000)} m high`, inputs: { width: round(e.u1 - e.u0, 0), height: round(z1 - z0, 0) }, status: "assumed" });
    }
  };
  for (const [i, shaft] of plumbing.shafts.entries()) {
    closing(shaft, "soil", shaft.name, `svc:cover:${i + 1}`, "service shaft");
    const e = extentIn(shaft.frame, shaft.housing);
    const hatchAt = local(shaft.frame, (e.u0 + e.u1) / 2, e.v1 + COVER_T + 2);
    const hatch = ctx.add({
      id: `svc:hatch:${i + 1}`, name: `Access hatch to the rodding eye — ${shaft.name}`, kind: "access-panel", category: "plumbing", subcategory: "Covers", stage: 11, level: ground, layer: "plumbing", materialId: "ceiling-steel",
      shapes: [box(hatchAt.x, hatchAt.y, ground.floorZ + 300, Math.min(250, e.u1 - e.u0 - 40), 4, 300, Math.atan2(shaft.frame.uy, shaft.frame.ux))], source: "schematic", room: shaft.rooms[0] ?? null,
      explode: { layerIndex: 7, dir: v3(shaft.frame.vx, shaft.frame.vy, 0) }, note: "A removable panel in the cover, at the height of the cleanout on the stack.",
      service: info("soil", "structure", "Room", "Cleanout at the foot of the stack", "Hatch in the shaft cover"),
    });
    addQuantity(ctx, hatch, { workItem: "plumbing.access-hatch", description: "Access hatches", section: "O", unit: "piece", value: 1, formula: "1 per stack", inputs: { count: 1 }, status: "assumed" });
  }
  if (electrical.cupboard) closing(electrical.cupboard, "electrical", "Riser cupboard door", "svc:cupboard", "electrical riser cupboard");

  // --- Stage 11: the pre-wall ducts in the wet rooms ------------------------------------------------------
  for (const wr of plumbing.rooms) {
    if (!wr.ducted || !wr.duct.length || wr.ductDepth <= 0) continue;
    const level: LevelInfo = wr.level;
    const shapes: Shape[] = [];
    let area = 0;
    for (const d of wr.duct) {
      const a = atEdge(d.edge, d.t0, wr.ductDepth + COVER_T / 2);
      const b = atEdge(d.edge, d.t1, wr.ductDepth + COVER_T / 2);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      shapes.push(box((a.x + b.x) / 2, (a.y + b.y) / 2, level.floorZ + DUCT_HEIGHT / 2, len, COVER_T, DUCT_HEIGHT, Math.atan2(d.edge.uy, d.edge.ux)));
      area += len * DUCT_HEIGHT * 1e-6;
    }
    const comp = ctx.add({
      id: `svc:duct:${level.index}:${slug(wr.room.name)}`, name: `Pre-wall duct — ${wr.room.name}, ${level.name}`, kind: "pre-wall-duct", category: "plumbing", subcategory: "Covers", stage: 11, level, layer: "plumbing", materialId: "gypsum", shapes, repeated: { noun: "panel" },
      source: "schematic", room: wr.room.name, explode: { layerIndex: 6, dir: v3(0, 0, 1) }, note: "A board face on a light frame, standing off the wall, which hides the pipes and carries the fixtures. The cistern, basin and shower fittings are fixed through it to the frame.",
      service: info("waste", "structure", "Pipes along the wall", "Fixtures", "Standing off the wall by the pipe depth"),
    });
    addQuantity(ctx, comp, { workItem: "plumbing.duct", description: "Pre-wall duct panels", section: "J", unit: "m²", value: round(area, 3), formula: `${wr.duct.length} runs of ${f2(DUCT_HEIGHT / 1000)} m high = ${f2(area)} m²`, inputs: { runs: wr.duct.length, height: DUCT_HEIGHT }, status: "assumed" });
  }
}
