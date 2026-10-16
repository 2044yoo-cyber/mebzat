import { polygonArea, profileVolume, type Shape } from "./geometry";
import { countedComponents, type QuantityScope } from "./quantities";
import type { ComponentRecord, ConstructionModel, ModelOptions } from "./types";

/**
 * Whether the bill leaves anything out or counts anything twice.
 *
 * The bill is built from the components of the model. This reads the model back against it: every component that is built is either in the bill,
 * is part of an assembly that is, or says why it is not; no work is in the bill twice; and the concrete counted is no more than the concrete drawn.
 */

/** Components that are built but are not bought: each says why it is not a line of its own. */
export const EXEMPT_KINDS: Readonly<Record<string, string>> = {
  prop: "Props are reusable equipment: their cost is in the rate for the formwork they carry.",
  "grid-line": "A setting-out reference: it has no material.",
  benchmark: "A setting-out reference: it has no material.",
  "building-footprint": "A setting-out mark on the ground: it has no material.",
  "excavation-boundary": "A setting-out mark on the ground: it has no material.",
  "access-area": "Temporary site area: counted with the site in the preliminaries.",
  "site-drainage": "Temporary drainage during the works: part of the preliminaries.",
  "construction-joint": "A planned stop between two pours: it has no material of its own.",
  "soil-layer": "A picture of the ground, not work: the excavation is counted in the earthworks.",
  "spoil-heap": "The soil taken out of the ground: counted in the excavation lines.",
};

/** Parts of an assembly whose quantity is on the assembly: the panels and fittings of a cabinet are counted in its schedule of boards and hardware. */
export const CARRIED_BY_PARENT: ReadonlySet<string> = new Set(["cabinet-panel", "cabinet-hardware"]);

export type BillAudit = {
  /** Components whose quantities count. */
  counted: number;
  withQuantities: number;
  exempt: { componentId: string; kind: string; reason: string }[];
  carried: { componentId: string; parentId: string }[];
  /** Built, not in the bill, not exempt and not part of an assembly that is. */
  omissions: { componentId: string; kind: string; name: string }[];
  /** The same work counted twice: two items from one piece of the project, with the same description, in the same room and the same place. */
  duplicates: { workItem: string; description: string; sourceGeometry: string; room: string | null; componentIds: string[] }[];
  /** The concrete counted against the concrete drawn, m³. The difference is where members overlap: the bill counts it once. */
  concrete: { drawn: number; counted: number; overlap: number; over: { componentId: string; counted: number; drawn: number }[] };
  /**
   * The steel in the bill against the rule that sets it, kg. With the ratio rule the steel of each member is its concrete times its ratio, shared out among
   * its bars: the sum of the lines must be that, and no member with a ratio may be left with none. With a schedule only, there is no expected figure.
   */
  reinforcement: { basis: "ratio" | "schedule"; expected: number | null; counted: number; unreinforced: string[]; withoutFigure: number };
  ok: boolean;
};

/** The volume of a shape, mm³. */
export function shapeVolume(shape: Shape): number {
  if (shape.t === "box") return shape.s.x * shape.s.y * shape.s.z;
  if (shape.t === "cyl") return Math.PI * shape.r * shape.r * shape.len;
  if (shape.t === "prism") return (polygonArea(shape.poly) - (shape.holes ?? []).reduce((sum, h) => sum + polygonArea(h), 0)) * (shape.z1 - shape.z0);
  return profileVolume(shape);
}

export function auditBill(model: ConstructionModel, options: ModelOptions = model.options, scope: QuantityScope = "all"): BillAudit {
  const components = countedComponents(model, options, scope);
  const byId = new Map(model.components.map((c) => [c.id, c]));
  const exempt: BillAudit["exempt"] = [];
  const carried: BillAudit["carried"] = [];
  const omissions: BillAudit["omissions"] = [];
  let withQuantities = 0;
  const hasQuantities = (c: ComponentRecord | undefined): boolean => !!c && c.quantities.length > 0;
  for (const c of components) {
    if (hasQuantities(c)) { withQuantities += 1; continue; }
    // Edge protection and the like that comes down again: temporary works are priced in the preliminaries.
    if (c.layer === "temporary") { exempt.push({ componentId: c.id, kind: c.kind, reason: "Temporary works: priced in the preliminaries." }); continue; }
    const reason = EXEMPT_KINDS[c.kind];
    if (reason) { exempt.push({ componentId: c.id, kind: c.kind, reason }); continue; }
    if (CARRIED_BY_PARENT.has(c.kind)) {
      let parent = c.parentId ? byId.get(c.parentId) : undefined;
      while (parent && !hasQuantities(parent)) parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      if (parent) { carried.push({ componentId: c.id, parentId: parent.id }); continue; }
    }
    omissions.push({ componentId: c.id, kind: c.kind, name: c.name });
  }

  // The same work twice: two items for one piece of the project, one description, one room, one storey, and the same shape in the same place. (Two walls of one length
  // have the same words in their formulas, but they are not in the same place.)
  const seen = new Map<string, string[]>();
  const first = new Map<string, { workItem: string; description: string; sourceGeometry: string; room: string | null }>();
  const signatures = new Map<string, string>();
  const signatureOf = (c: ComponentRecord): string => { let s = signatures.get(c.id); if (s === undefined) { s = JSON.stringify(c.shapes, (_k, v) => (typeof v === "number" ? Math.round(v) : v)); signatures.set(c.id, s); } return s; };
  for (const c of components) for (const item of c.quantities) {
    if (item.sourceGeometry === "schematic") continue;
    const key = [item.workItem, item.description, item.sourceGeometry, item.room ?? "", item.formula, c.storeyId ?? "", signatureOf(c)].join("|");
    seen.set(key, [...(seen.get(key) ?? []), c.id]);
    first.set(key, { workItem: item.workItem, description: item.description, sourceGeometry: item.sourceGeometry, room: item.room });
  }
  const duplicates = [...seen].filter(([, ids]) => ids.length > 1).map(([key, ids]) => ({ ...first.get(key)!, componentIds: [...new Set(ids)] }));

  // Concrete: what is counted against what is drawn, member by member.
  let drawn = 0;
  let counted = 0;
  const over: BillAudit["concrete"]["over"] = [];
  for (const c of components) {
    const items = c.quantities.filter((q) => q.workItem.startsWith("concrete.") && q.unit === "m³" && q.value !== null);
    if (!items.length) continue;
    const own = c.shapes.reduce((sum, s) => sum + shapeVolume(s), 0) * 1e-9;
    const mine = items.reduce((sum, q) => sum + q.value!, 0);
    drawn += own;
    counted += mine;
    if (mine > own + 0.0005) over.push({ componentId: c.id, counted: Math.round(mine * 1e4) / 1e4, drawn: Math.round(own * 1e4) / 1e4 });
  }
  const concrete = { drawn: Math.round(drawn * 1e3) / 1e3, counted: Math.round(counted * 1e3) / 1e3, overlap: Math.round((drawn - counted) * 1e3) / 1e3, over };

  // Steel: the lines against the rule. Each steel line is followed up to the concrete member it belongs to.
  const rule = model.rules.reinforcement;
  const keyOfMember = (c: ComponentRecord): string => (c.kind === "balcony" && c.sourceRef ? `balcony:${c.sourceRef}` : c.id);
  const steelItems = components.flatMap((c) => c.quantities.filter((q) => q.workItem.startsWith("steel.") && q.unit === "kg"));
  const steelCounted = steelItems.reduce((sum, q) => sum + (q.value ?? 0), 0);
  const steelOfMember = new Map<string, number>();
  for (const c of components) {
    const kg = c.quantities.filter((q) => q.workItem.startsWith("steel.") && q.unit === "kg").reduce((sum, q) => sum + (q.value ?? 0), 0);
    if (!kg) continue;
    let owner: ComponentRecord | undefined = c;
    for (let guard = 0; owner && owner.layer !== "concrete" && guard < 5; guard += 1) owner = owner.parentId ? byId.get(owner.parentId) : undefined;
    if (owner) steelOfMember.set(keyOfMember(owner), (steelOfMember.get(keyOfMember(owner)) ?? 0) + kg);
  }
  const unreinforced: string[] = [];
  let expected: number | null = null;
  if (rule.basis === "ratio") {
    expected = 0;
    const members = new Map<string, { workItem: string; volume: number; first: string }>();
    for (const c of components) {
      const concreteItems = c.quantities.filter((q) => q.workItem.startsWith("concrete.") && q.unit === "m³" && q.value !== null);
      if (c.layer !== "concrete" || !concreteItems.length) continue;
      const m = members.get(keyOfMember(c)) ?? { workItem: concreteItems[0]!.workItem, volume: 0, first: c.id };
      m.volume += concreteItems.reduce((sum, q) => sum + q.value!, 0);
      members.set(keyOfMember(c), m);
    }
    for (const [key, m] of members) {
      const ratio = rule.ratios[m.workItem];
      if (ratio === undefined) continue;
      expected += m.volume * ratio;
      // (A member with no concrete to speak of, one inside another, has no steel either.)
      if (m.volume > 0.001 && !steelOfMember.get(key)) unreinforced.push(m.first);
    }
  }
  const reinforcement = { basis: rule.basis, expected: expected === null ? null : Math.round(expected * 100) / 100, counted: Math.round(steelCounted * 100) / 100, unreinforced, withoutFigure: steelItems.filter((q) => q.value === null).length };
  return { counted: components.length, withQuantities, exempt, carried, omissions, duplicates, concrete, reinforcement, ok: omissions.length === 0 && duplicates.length === 0 && over.length === 0 && unreinforced.length === 0 };
}
