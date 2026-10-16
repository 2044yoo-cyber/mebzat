import type { Ctx } from "./context";
import type { Shape } from "./geometry";
import { f2, f3, round, STEEL_DENSITY } from "./helpers";
import type { ComponentRecord, QuantityItem } from "./types";

/**
 * The weight of reinforcement in the bill.
 *
 * The bars drawn in 3D are an illustration: their spacings and diameters are examples, so their weight is not the weight of steel to order, and it
 * is never taken as such. A bar schedule, when there is one, decides. Without one, the rule here estimates the steel of each member of the structure
 * from a typical weight of steel for each cubic metre of its concrete (`rules.reinforcement.ratios`), and every line it fills in says so: an assumed
 * figure, the ratio used, and that the structural design replaces it.
 *
 * A member's steel is the volume of its concrete times its ratio. It is shared out among the groups of bars that belong to it (main bars, stirrups, top
 * bars and so on) in the proportion of the bars drawn, so the groups add up to the member and nothing is counted twice or left out.
 */

/** Mass of a bar shape, kg, from its own dimensions: a cylinder by its radius and length; a box by its length and the section of its other two sides. */
export function barWeightKg(shape: Shape): number {
  if (shape.t === "cyl") return Math.PI * shape.r * shape.r * 1e-6 * (shape.len / 1000) * STEEL_DENSITY;
  if (shape.t !== "box") return 0;
  const sides = [shape.s.x, shape.s.y, shape.s.z].sort((a, b) => b - a);
  const d = (sides[1]! + sides[2]!) / 2;
  return (Math.PI / 4) * (d / 1000) ** 2 * (sides[0]! / 1000) * STEEL_DENSITY;
}

const isSteel = (c: ComponentRecord) => c.layer === "reinforcement" && c.materialId.startsWith("steel");

/** The concrete members the bars belong to: one concrete component, or all the parts of a balcony poured in several. */
function memberKey(c: ComponentRecord): string {
  return c.kind === "balcony" && c.sourceRef ? `balcony:${c.sourceRef}` : c.id;
}

export function applyReinforcementRule(ctx: Ctx): void {
  const rule = ctx.rules.reinforcement;
  if (rule.basis !== "ratio") return;
  const byId = new Map(ctx.components.map((c) => [c.id, c]));
  // Concrete members and their volumes, by work item.
  const members = new Map<string, { workItem: string; volume: number; parts: ComponentRecord[] }>();
  for (const c of ctx.components) {
    if (c.layer !== "concrete") continue;
    const items = c.quantities.filter((q) => q.workItem.startsWith("concrete.") && q.unit === "m³" && q.value !== null);
    if (!items.length) continue;
    const key = memberKey(c);
    const m = members.get(key) ?? { workItem: items[0]!.workItem, volume: 0, parts: [] };
    m.volume += items.reduce((sum, q) => sum + q.value!, 0);
    m.parts.push(c);
    members.set(key, m);
  }
  // The groups of bars of each member.
  const bars = new Map<string, ComponentRecord[]>();
  for (const c of ctx.components) {
    if (!isSteel(c) || !c.parentId) continue;
    let parent = byId.get(c.parentId);
    // A group of bars hangs from its member, or from something that does: follow it up to the concrete.
    for (let guard = 0; parent && parent.layer !== "concrete" && guard < 5; guard += 1) parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    if (!parent) continue;
    const key = memberKey(parent);
    bars.set(key, [...(bars.get(key) ?? []), c]);
  }
  // A member that carries its own steel line, with no bars of its own drawn (a lintel), is its own group.
  for (const [key, member] of members) for (const part of member.parts) if (part.quantities.some((q) => q.workItem.startsWith("steel.") && q.unit === "kg")) bars.set(key, [...(bars.get(key) ?? []), part]);
  for (const [key, groups] of bars) {
    const member = members.get(key);
    if (!member) continue;
    const ratio = rule.ratios[member.workItem];
    const weights = groups.map((g) => g.shapes.reduce((sum, s) => sum + barWeightKg(s), 0));
    const drawn = weights.reduce((a, b) => a + b, 0);
    groups.forEach((group, i) => {
      const item = group.quantities.find((q) => q.workItem.startsWith("steel.") && q.unit === "kg");
      // A bar schedule has already given this group its weight.
      if (!item || item.value !== null) return;
      if (ratio === undefined) {
        item.formula = `No steel ratio is set for ${member.workItem}: set one in the reinforcement rule, or give the bar schedule.`;
        return;
      }
      const share = drawn > 0 ? weights[i]! / drawn : 1 / groups.length;
      const kg = member.volume * ratio * share;
      fill(item, kg, `${f3(member.volume)} m³ of ${member.workItem.replace("concrete.", "")} concrete × ${ratio} kg/m³ × ${f2(share * 100)} % of the member's bars (${f2(weights[i]!)} kg of the ${f2(drawn)} kg drawn) = ${f2(kg)} kg`, { volume: round(member.volume, 4), ratio, share: round(share, 4), member: member.workItem }, ctx.rules.allowances.steel, ratio, member.workItem);
    });
  }
}

function fill(item: QuantityItem, kg: number, formula: string, inputs: Record<string, number | string>, allowancePercent: number, ratio: number, workItem: string): void {
  item.value = round(kg, 2);
  item.formula = formula;
  item.inputs = inputs;
  item.status = "assumed";
  item.allowance = { rule: "Laps and cutting waste (example assumption)", percent: allowancePercent };
  item.assumptions = [
    `An estimate, not a bar schedule: ${ratio} kg of steel for each m³ of ${workItem.replace("concrete.", "")} concrete is a typical figure (an example). The structural design replaces it.`,
    "The member's steel is shared among its groups of bars in the proportion of the bars drawn. The weight of the bars drawn is not itself used.",
  ];
}
