import type { Ctx } from "../context";
import { cyl, v3 } from "../geometry";
import { addQuantity, f2, round } from "../helpers";
import { planPlumbing, type PlumbItem } from "../plumbing-plan";
import { runLength } from "../service-routing";
import type { ComponentRecord, ServiceInfo } from "../types";

/**
 * Stage 10: water supply, hot water, waste, soil and vent stacks, underground drains, chambers, rainwater.
 *
 * The routes come from `planPlumbing`, which reads the building: a service
 * shaft in each wet room, pipes along the wall faces inside a pre-wall duct,
 * waste falling to the stack, drains that find their way between the footings.
 * This file turns that layout into components and quantities, and adds the
 * rainwater, which has no fixture to serve.
 */

const SYSTEM_INFO: Record<string, ServiceInfo["system"]> = { cold: "cold", hot: "hot", waste: "waste", soil: "soil", vent: "vent", drain: "drain", rain: "rain", supply: "supply" };

const FITTING_KINDS = new Set(["valve", "trap", "cleanout", "floor-drain", "inspection-chamber"]);
const EQUIPMENT_KINDS = new Set(["pump", "water-tank", "water-heater", "wc", "water-meter"]);

function routeText(item: PlumbItem): string {
  switch (item.kind) {
    case "pipe-waste": return item.room && /bath|wc|shower/i.test(item.room) ? "Surface-fixed on clips along the wall inside the pre-wall duct, falling to the stack" : "Along the wall behind the units, falling to the stack";
    case "pipe-cold": return "Along the wall inside the duct (or behind the units), from the riser through an isolation valve";
    case "pipe-hot": return "Along the wall beside the cold pipe, from the heater to the fixtures";
    case "pipe-vent": return "Vertical, in the service shaft, to a tie into the stack under the slab above";
    case "drain-stack": return "Vertical, in the service shaft, through the opening in every slab and out above the roof";
    case "drain-horizontal": return "Buried, falling to the inspection chamber, between the footings and under the ground beams";
    case "riser": return item.id === "plumb:upfeed" ? "On stand-off clips up the outside face of the wall, over the parapet and across the roof" : item.id === "plumb:downfeed" ? "On supports across the roof, then down the shaft" : "Vertical, in the service shaft";
    case "water-entry": return "Buried, from the boundary to the pump";
    default: return item.runs.length ? "Along the wall" : "Fixed in place";
  }
}

export function generatePlumbing(ctx: Ctx): void {
  const ground = ctx.ground;
  const topLevel = ctx.top;
  if (!ground || !topLevel) return;
  const plan = planPlumbing(ctx);
  for (const u of plan.unresolved) ctx.warnings.push(`Plumbing: ${u.where}: ${u.reason}`);
  const made = new Map<string, ComponentRecord>();
  for (const item of plan.items) {
    const lengthMm = item.runs.reduce((s, r) => s + runLength(r), 0);
    const comp = ctx.add({
      id: item.id, name: item.name, kind: item.kind, category: "plumbing", subcategory: item.subcategory, stage: item.stage, level: item.level, ...(item.storeyIndex !== undefined ? { storeyIndex: item.storeyIndex } : {}), room: item.room,
      layer: "plumbing", materialId: item.materialId, shapes: item.shapes, ...(item.variant ? { variant: item.variant } : {}), ...(item.runs.length ? { repeated: { noun: "segment" } } : (item.count ?? 1) > 1 ? { repeated: { noun: item.kind === "trap" ? "trap" : "part" } } : {}),
      source: "schematic", parentId: item.parent && (made.has(item.parent) || plan.items.some((i) => i.id === item.parent)) ? item.parent : null, concealed: item.concealed, explode: { layerIndex: item.explodeLayer, dir: item.explodeDir ?? v3(0, 0, 1) },
      ...(item.label ? { label: { text: item.label.text, anchor: v3(item.label.anchor.x, item.label.anchor.y, item.label.anchor.z) } } : {}), ...(item.note ? { note: item.note } : {}),
      ...(item.runs.length ? { dims: { length: { value: round(lengthMm, 0), unit: "mm" as const, status: "assumed" as const } } } : {}),
      service: { system: SYSTEM_INFO[item.system] ?? "supply", role: item.runs.length ? "route" : FITTING_KINDS.has(item.kind) ? "fitting" : EQUIPMENT_KINDS.has(item.kind) ? "equipment" : "fitting", from: item.from, to: item.to, route: routeText(item) },
    });
    made.set(item.id, comp);
    quantities(ctx, plan, item, comp, lengthMm);
    if (item.clips?.length) {
      const clips = ctx.add({
        id: `${item.id}:clips`, name: `Clips and supports — ${item.name}`, kind: "pipe-clip", category: "plumbing", subcategory: "Supports", stage: item.stage, level: item.level, ...(item.storeyIndex !== undefined ? { storeyIndex: item.storeyIndex } : {}), room: item.room,
        layer: "plumbing", materialId: "pipe-clip", shapes: item.clips.map((c) => cyl(c.at.x, c.at.y, c.at.z, c.r + 4, 16, c.axis)), repeated: { noun: "clip" }, source: "schematic", parentId: item.id, concealed: item.concealed,
        explode: { layerIndex: item.explodeLayer + 1, dir: item.explodeDir ?? v3(0, 0, 1) }, note: "Fixed to the wall or the roof at regular intervals so the pipe cannot sag or move.",
        service: { system: SYSTEM_INFO[item.system] ?? "supply", role: "fitting", from: item.name, to: "Wall, duct or roof", route: "On the pipe it holds" },
      });
      addQuantity(ctx, clips, { workItem: "plumbing.clip", description: "Pipe clips and supports", section: "O", unit: "piece", value: item.clips.length, formula: `one every 800 mm along ${item.name} = ${item.clips.length}`, inputs: { count: item.clips.length }, status: "assumed" });
    }
  }
}

function quantities(ctx: Ctx, plan: ReturnType<typeof planPlumbing>, item: PlumbItem, comp: ComponentRecord, lengthMm: number): void {
  const pipes = ctx.rules.allowances.pipes;
  const allow = { rule: "Fittings and waste (example assumption)", percent: pipes };
  const m = round(lengthMm / 1000, 3);
  const dia = item.diameter ?? 20;
  switch (item.kind) {
    case "drain-stack": {
      const bottom = plan.stacks.find((s) => s.shaft && plan.items.find((i) => i.id === item.id) && Math.abs(s.centre.x - ((item.runs[0]!.points[0]!.x))) < 1 && Math.abs(s.centre.y - item.runs[0]!.points[0]!.y) < 1)?.bottom ?? item.runs[0]!.points[0]!.z;
      const roofTop = plan.roofTop;
      const below = Math.max(0, roofTop - bottom) / 1000;
      addQuantity(ctx, comp, { workItem: "plumbing.pipe.soil-110", description: "Soil and vent stack, 110 mm", section: "O", unit: "m", value: round(below, 3), formula: `stack from ${f2(bottom / 1000)} m to roof level ${f2(roofTop / 1000)} m`, inputs: { bottom, roof: roofTop }, status: "assumed" }, { allowance: allow });
      addQuantity(ctx, comp, { workItem: "plumbing.pipe.vent-110", description: "Vent extension above roof, 110 mm", section: "O", unit: "m", value: 0.7, formula: "terminal 700 mm above the roof surface", inputs: { height: 700 }, status: "assumed" });
      return;
    }
    case "rain-downpipe":
      addQuantity(ctx, comp, { workItem: "plumbing.pipe.rain-90", description: "Rainwater downpipe, 90 mm", section: "O", unit: "m", value: m, formula: `${item.runs.length} downpipes, outlet to ground = ${f2(m)} m`, inputs: { length: round(lengthMm, 0), count: item.runs.length }, status: "assumed" }, { allowance: { rule: "Brackets and fittings (example assumption)", percent: ctx.rules.allowances.pipes } });
      return;
    case "drain-horizontal":
      if (item.system === "rain") {
        addQuantity(ctx, comp, { workItem: "plumbing.pipe.storm-100", description: "Storm drain, 100 mm", section: "O", unit: "m", value: m, formula: `downpipe base to the soakaway = ${f2(m)} m`, inputs: { length: round(lengthMm, 0) }, status: "assumed" }, { allowance: allow, exclusions: ["Soakaway or connection to the public storm drain"] });
        return;
      }
      addQuantity(ctx, comp, { workItem: "plumbing.pipe.drain-110", description: "Underground drain, 110 mm", section: "O", unit: "m", value: m, formula: `stack to chambers = ${f2(m)} m`, inputs: { length: round(lengthMm, 0), diameter: 110 }, status: "assumed" }, { allowance: allow, exclusions: ["Excavation", "Granular bed and surround", "Connection to sewer or septic system"] });
      return;
    case "inspection-chamber":
      if (item.system === "rain") {
        addQuantity(ctx, comp, { workItem: "plumbing.soakaway", description: "Soakaway pits (example)", section: "O", unit: "piece", value: item.count ?? 1, formula: `${item.count ?? 1} pit(s) at the end of the storm drain`, inputs: { count: item.count ?? 1 }, status: "assumed" });
        return;
      }
      addQuantity(ctx, comp, { workItem: "plumbing.chamber", description: "Inspection chambers", section: "O", unit: "piece", value: item.count ?? 2, formula: `${item.count ?? 2} chambers on this drain`, inputs: { count: item.count ?? 2 }, status: "assumed" });
      return;
    case "cleanout":
      addQuantity(ctx, comp, { workItem: "plumbing.cleanout", description: "Cleanouts", section: "O", unit: "piece", value: 1, formula: "1 at the stack base", inputs: { count: 1 }, status: "assumed" });
      return;
    case "pipe-waste":
      addQuantity(ctx, comp, { workItem: "plumbing.pipe.waste-50", description: "Waste pipe, 50 mm (110 mm for WCs)", section: "O", unit: "m", value: m, formula: `fixtures to stack = ${f2(m)} m`, inputs: { length: round(lengthMm, 0) }, status: "assumed" }, { allowance: allow });
      return;
    case "pipe-vent":
      addQuantity(ctx, comp, { workItem: "plumbing.pipe.vent-50", description: "Vent pipe, 50 mm", section: "O", unit: "m", value: m, formula: `branch vent up the shaft = ${f2(m)} m`, inputs: { length: round(lengthMm, 0), diameter: 50 }, status: "assumed" }, { allowance: allow });
      return;
    case "trap":
      addQuantity(ctx, comp, { workItem: "plumbing.trap", description: "Traps", section: "O", unit: "piece", value: item.count ?? 1, formula: `${item.count ?? 1} water-seal traps`, inputs: { count: item.count ?? 1 }, status: "assumed" });
      return;
    case "floor-drain":
      addQuantity(ctx, comp, { workItem: "plumbing.floor-drain", description: "Floor drains", section: "O", unit: "piece", value: item.count ?? 1, formula: `${item.count ?? 1} shower drain(s)`, inputs: { count: item.count ?? 1 }, status: "assumed" });
      return;
    case "valve":
      addQuantity(ctx, comp, { workItem: "plumbing.valve", description: "Isolation valves", section: "O", unit: "piece", value: 1, formula: "1 per room branch", inputs: { count: 1 }, status: "assumed" });
      return;
    case "water-heater":
      addQuantity(ctx, comp, { workItem: "sanitary.heater", description: "Water heaters", section: "P", unit: "piece", value: 1, formula: "1 per wet room with hot water", inputs: { count: 1 }, status: "assumed" });
      return;
    case "pipe-hot":
      addQuantity(ctx, comp, { workItem: "plumbing.pipe.hot-20", description: "Hot-water pipe, 20 mm", section: "O", unit: "m", value: m, formula: `heater to fixtures = ${f2(m)} m`, inputs: { length: round(lengthMm, 0), diameter: 20 }, status: "assumed" }, { allowance: allow, assumptions: ["Insulation of hot pipes is a separate item and is not counted here."] });
      return;
    case "pipe-cold":
      addQuantity(ctx, comp, { workItem: "plumbing.pipe.cold-20", description: "Cold-water pipe, 20 mm", section: "O", unit: "m", value: m, formula: `branch from the riser to the fixtures = ${f2(m)} m`, inputs: { length: round(lengthMm, 0), diameter: 20 }, status: "assumed" }, { allowance: allow });
      return;
    case "riser":
    case "water-entry":
      addQuantity(ctx, comp, { workItem: "plumbing.pipe.cold-25", description: "Mains and rising main, 25 mm", section: "O", unit: "m", value: m, formula: `${item.name} = ${f2(m)} m`, inputs: { length: round(lengthMm, 0), diameter: dia }, status: "assumed" }, { allowance: allow });
      return;
    case "wc": {
      const kinds = new Map<string, number>();
      const room = plan.rooms.find((r) => `plumb:${r.level.index}:${r.room.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}:fixtures` === item.id);
      for (const f of room?.fixtures ?? []) kinds.set(f.kind, (kinds.get(f.kind) ?? 0) + 1);
      for (const [kind, count] of kinds) {
        const desc = kind === "wc" ? "WC pan with cistern" : kind === "basin" ? "Wash basin with tap" : kind === "shower" ? "Shower tray with mixer and head" : "Sink or washing machine stubs";
        addQuantity(ctx, comp, { workItem: `sanitary.${kind}`, description: desc, section: "P", unit: "piece", value: count, formula: `${count} in ${item.room ?? "the room"}`, inputs: { count }, status: "assumed" }, { assumptions: ["The fixture set is an example layout; the real set comes from the brief."] });
      }
      return;
    }
    case "water-tank":
      addQuantity(ctx, comp, { workItem: "plumbing.tank", description: "Water storage tank with stand", section: "O", unit: "piece", value: 1, formula: "1 tank (example)", inputs: { count: 1 }, status: "assumed" });
      return;
    case "pump":
      addQuantity(ctx, comp, { workItem: "plumbing.pump", description: "Booster pump", section: "O", unit: "piece", value: 1, formula: "1 pump (example)", inputs: { count: 1 }, status: "assumed" });
      return;
    case "water-meter":
      addQuantity(ctx, comp, { workItem: "plumbing.meter", description: "Water meter and boundary valve", section: "O", unit: "set", value: 1, formula: "1 at the boundary", inputs: { count: 1 }, status: "assumed" });
      return;
    default:
      return;
  }
}
