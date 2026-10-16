import type { Ctx } from "../context";
import { cyl, v3, type Shape } from "../geometry";
import { addQuantity, f2, round } from "../helpers";
import { planElectrical, type Fit, type RoomElectrical } from "../electrical-plan";
import { mergeRuns, runLength, runShapes, type Run } from "../service-routing";
import type { ServiceInfo } from "../types";

/**
 * Stage 9: electrical supply, distribution, conduits, boxes, outlets, earthing and detectors.
 *
 * The routes come from `planElectrical`, which reads the building: the board
 * stands in a riser cupboard on a wall, conduit is cast in the slabs and run up
 * the inside of the walls, and every box is set in a wall or a slab. This file
 * only turns that layout into components and quantities.
 */

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const ELECTRICAL = "electrical" as const;
const info = (role: ServiceInfo["role"], from: string, to: string, route: string): ServiceInfo => ({ system: ELECTRICAL, role, from, to, route });

export function generateElectrical(ctx: Ctx): void {
  const ground = ctx.ground;
  if (!ground) return;
  const plan = planElectrical(ctx);
  for (const u of plan.unresolved) ctx.warnings.push(`Electrical: ${u.where}: ${u.reason}`);
  if (!plan.cupboard) return;
  const cupboard = plan.cupboard;

  // --- Supply: meter outside, back to back with the board, through a sleeve in the wall ----------------
  let meterId: string | null = null;
  if (plan.entry) {
    const e = plan.entry;
    const meter = ctx.add({
      id: "elec:meter", name: "Utility meter box", kind: "meter-board", category: "electrical", subcategory: "Supply", stage: 9, level: ground, layer: "electrical", materialId: "switchgear", shapes: [e.meter.shape], source: "schematic", room: null,
      explode: { layerIndex: 0, dir: v3(e.meter.outward.x, e.meter.outward.y, 0) }, label: { text: "Meter", anchor: v3(e.meter.centre.x, e.meter.centre.y, e.meter.centre.z + 400) },
      note: "Stands on the outside face of the wall, directly behind the board. Position and rating are set by the supply authority.",
      service: info("equipment", "Utility supply", "Distribution board", "On the outside face of the wall, back to back with the board"),
    });
    meterId = meter.id;
    addQuantity(ctx, meter, { workItem: "electrical.meter", description: "Meter box", section: "Q", unit: "piece", value: 1, formula: "1 service position (example)", inputs: { count: 1 }, status: "assumed" });
    const service = ctx.add({
      id: "elec:service", name: "Service conduit, meter to board", kind: "supply-entry", category: "electrical", subcategory: "Supply", stage: 9, level: ground, layer: "electrical", materialId: "conduit", shapes: runShapes(e.service, false), repeated: { noun: "segment" },
      source: "schematic", concealed: true, parentId: meter.id, explode: { layerIndex: 2, dir: v3(e.meter.outward.x, e.meter.outward.y, 0) }, note: "Passes straight through the sleeve set in the wall when it was built.",
      service: info("route", "Meter", "Distribution board, ground floor", "Straight through a sleeve in the external wall"),
    });
    addQuantity(ctx, service, { workItem: "electrical.conduit", description: "Conduit", section: "Q", unit: "m", value: round(runLength(e.service) / 1000, 3), formula: `meter to board through the wall = ${f2(runLength(e.service) / 1000)} m`, inputs: { length: round(runLength(e.service), 0) }, status: "assumed" }, { allowance: { rule: "Bends, offsets and waste (example assumption)", percent: ctx.rules.allowances.conduit } });
    const rod = ctx.add({
      id: "elec:earth", name: "Earth electrode", kind: "earthing", category: "electrical", subcategory: "Earthing", stage: 9, level: ground, layer: "electrical", materialId: "earth", shapes: [cyl(e.rod.x, e.rod.y, e.rod.z - e.rod.len / 2 + 100, 8, e.rod.len, "z")],
      source: "schematic", concealed: true, parentId: meter.id, explode: { layerIndex: 1, dir: v3(0, 0, -1) }, note: "Rod length and the resistance to earth are verified by test; the figures here are examples.",
      service: info("equipment", "Earthing conductor", "Ground", "Driven into the ground outside the wall"),
    });
    addQuantity(ctx, rod, { workItem: "electrical.earth", description: "Earth rod and conductor", section: "Q", unit: "set", value: 1, formula: "1 electrode with conductor to the board", inputs: { count: 1 }, status: "assumed" });
    const earth = ctx.add({
      id: "elec:earth-conductor", name: "Earthing conductor, board to electrode", kind: "earthing-conductor", category: "electrical", subcategory: "Earthing", stage: 9, level: ground, layer: "electrical", materialId: "earth", shapes: runShapes(e.earth, false), repeated: { noun: "segment" },
      source: "schematic", concealed: true, parentId: rod.id, explode: { layerIndex: 2, dir: v3(e.meter.outward.x, e.meter.outward.y, 0) }, note: "Leaves the cupboard by its own sleeve, runs down the outside of the wall and across the soil to the electrode.",
      service: info("route", "Earth bar in the board", "Earth electrode", "Through a sleeve in the wall, down the outside face, then buried"),
    });
    addQuantity(ctx, earth, { workItem: "electrical.earth-conductor", description: "Earthing conductor", section: "Q", unit: "m", value: round(runLength(e.earth) / 1000, 3), formula: `Σ straight segments = ${f2(runLength(e.earth) / 1000)} m`, inputs: { length: round(runLength(e.earth), 0) }, status: "assumed" });
  }

  // --- A board on every storey, in the riser cupboard, and the conduit that leaves it -----------------------
  plan.boards.forEach((b, i) => {
    const level = b.level;
    const parent = level.index === 0 ? meterId : `elec:${level.index - 1}:board`;
    const board = ctx.add({
      id: `elec:${level.index}:board`, name: `Distribution board — ${level.name}`, kind: "distribution-board", category: "electrical", subcategory: "Distribution", stage: 9, level, layer: "electrical", materialId: "switchgear", shapes: [b.box],
      source: "schematic", room: cupboard.rooms[level.index] || null, explode: { layerIndex: 0, dir: v3(cupboard.frame.vx, cupboard.frame.vy, 0) },
      ...(level.index === 0 ? { label: { text: "Distribution board", anchor: v3(b.centre.x, b.centre.y, level.floorZ + ctx.rules.services.boardHeight + 400) } } : {}), parentId: parent,
      note: "Mounted on the wall inside the riser cupboard. Breakers and cables are sized by the electrical designer.",
      service: info("equipment", level.index === 0 ? "Meter" : `Board, ${ctx.levels[level.index - 1]!.name}`, "Circuits on this storey", "On the wall inside the riser cupboard"),
    });
    addQuantity(ctx, board, { workItem: "electrical.board", description: "Distribution board", section: "Q", unit: "piece", value: 1, formula: "1 board per storey", inputs: { count: 1 }, status: "assumed" });
    const r = plan.risers[i]!;
    const feeds: Run[] = [r.floor, r.ceiling];
    const feedLen = feeds.reduce((s, x) => s + runLength(x), 0);
    const trunks = ctx.add({
      id: `elec:${level.index}:trunks`, name: `Board feeds to the slabs — ${level.name}`, kind: "conduit", category: "electrical", subcategory: "Distribution", stage: 9, level, layer: "electrical", materialId: "conduit", shapes: feeds.flatMap((x) => runShapes(x, false)), repeated: { noun: "segment" },
      source: "schematic", concealed: true, parentId: board.id, explode: { layerIndex: 2, dir: v3(0, 0, 1) }, note: "Two conduits leave the board: one down into the floor slab for the switches and sockets, one up into the slab above for the ceiling lights.",
      service: info("route", `Board, ${level.name}`, "Floor slab and the slab above", "Inside the riser cupboard, through the opening cut in the slabs"),
    });
    addQuantity(ctx, trunks, { workItem: "electrical.conduit", description: "Conduit", section: "Q", unit: "m", value: round(feedLen / 1000, 3), formula: `Σ board feeds = ${f2(feedLen / 1000)} m`, inputs: { length: round(feedLen, 0) }, status: "assumed" }, { allowance: { rule: "Bends, offsets and waste (example assumption)", percent: ctx.rules.allowances.conduit } });
  });
  const risers = plan.risers.filter((r) => r.riser);
  if (risers.length) {
    const riserLen = risers.reduce((s, r) => s + runLength(r.riser!), 0);
    const riser = ctx.add({
      id: "elec:riser", name: "Electrical riser", kind: "conduit", category: "electrical", subcategory: "Distribution", stage: 9, level: null, storeyIndex: 0, layer: "electrical", materialId: "conduit", shapes: risers.flatMap((r) => runShapes(r.riser!, false)), repeated: { noun: "length" },
      source: "schematic", concealed: true, parentId: "elec:0:board", explode: { layerIndex: 2, dir: v3(0, 0, 1) }, note: "Rises through the sleeve left in each slab, inside the riser cupboard, from one board to the next.",
      service: info("route", "Board, ground floor", "Board, top floor", "Vertical, inside the riser cupboard, through the slab openings"),
    });
    addQuantity(ctx, riser, { workItem: "electrical.conduit", description: "Conduit", section: "Q", unit: "m", value: round(riserLen / 1000, 3), formula: `Σ riser lengths = ${f2(riserLen / 1000)} m`, inputs: { length: round(riserLen, 0) }, status: "assumed" }, { allowance: { rule: "Bends, offsets and waste (example assumption)", percent: ctx.rules.allowances.conduit } });
  }

  // --- Rooms ---------------------------------------------------------------------------------------------------
  for (const re of plan.rooms) room(ctx, re);
}

function room(ctx: Ctx, re: RoomElectrical): void {
  const { level, room: r } = re;
  const rid = `elec:${level.index}:${slug(r.name)}`;
  const grid = ctx.gridRef(level.levelId, r.centre.x, r.centre.y, 2500);
  const boardId = `elec:${level.index}:board`;
  const floorRuns = mergeRuns(re.floorRuns);
  const ceilingRuns = mergeRuns(re.ceilingRuns);
  const wallRuns = mergeRuns(re.wallRuns);
  const conduit = [...floorRuns, ...ceilingRuns, ...wallRuns];
  const length = conduit.reduce((s, x) => s + runLength(x), 0);
  const switches = re.fits.filter((f) => f.kind === "switch");
  const sockets = re.fits.filter((f) => f.kind === "socket");
  if (conduit.length) {
    const comp = ctx.add({
      id: `${rid}:conduit`, name: `Conduits — ${r.name}, ${level.name}`, kind: "conduit", category: "electrical", subcategory: "Conduits", stage: 9, level, layer: "electrical", materialId: "conduit", shapes: conduit.flatMap((x) => runShapes(x, false)), repeated: { noun: "segment" },
      source: "schematic", room: r.name, grid, concealed: true, parentId: boardId, explode: { layerIndex: 3, dir: v3(0, 0, 1) }, dims: { length: { value: round(length, 0), unit: "mm", status: "assumed" } },
      note: "Cast in the floor slab to the foot of each wall, up the inside of the wall in a chase, and cast in the slab above to each ceiling light. No conduit crosses the room in the air or passes through a beam.",
      service: info("route", `Board, ${level.name}`, `${switches.length} switch(es), ${sockets.length} socket(s)${re.lightBox ? ", ceiling light" : ""}`, "Cast in the slabs, then in a chase up the inside of the wall"),
    });
    addQuantity(ctx, comp, { workItem: "electrical.conduit", description: "Conduit", section: "Q", unit: "m", value: round(length / 1000, 3), formula: `slab runs + wall chases + chains between boxes = ${f2(length / 1000)} m`, inputs: { length: round(length, 0), switches: switches.length, sockets: sockets.length }, status: "assumed" },
      { allowance: { rule: "Bends, offsets and waste (example assumption)", percent: ctx.rules.allowances.conduit }, assumptions: ["Illustrative routes: along the slab, up the wall chase."] });
    addQuantity(ctx, comp, { workItem: "electrical.cable", description: "Cable (single conductors)", section: "Q", unit: "m", value: round((length * 3) / 1000, 3), formula: `${f2(length / 1000)} m of conduit × 3 conductors (live, neutral, earth)`, inputs: { length: round(length, 0), conductors: 3 }, status: "assumed" },
      { allowance: { rule: "Cutting and terminations (example assumption)", percent: ctx.rules.allowances.conduit }, assumptions: ["Cable sizes depend on the circuit design and are not set here."] });
  }

  // Back boxes (concealed): one per fitting, one for the light, one for a detector.
  const boxShapes: Shape[] = [];
  if (re.lightBox) boxShapes.push(re.lightBox);
  if (re.detector) boxShapes.push(re.detector.box);
  for (const f of re.fits) boxShapes.push(f.backBox);
  if (boxShapes.length) {
    const boxes = ctx.add({
      id: `${rid}:boxes`, name: `Back boxes — ${r.name}, ${level.name}`, kind: "junction-box", category: "electrical", subcategory: "Boxes", stage: 9, level, layer: "electrical", materialId: "electrical-box", shapes: boxShapes, repeated: { noun: "box" },
      source: "schematic", room: r.name, grid, concealed: true, parentId: `${rid}:conduit`, explode: { layerIndex: 4, dir: v3(0, 0, 1) }, note: "Set in the wall, or flush with the underside of the slab for a light, so each can be opened without breaking anything.",
      service: info("fitting", "Conduit", "Switch, socket or luminaire", "Set in the wall or the soffit, at the end of its conduit"),
    });
    addQuantity(ctx, boxes, { workItem: "electrical.box", description: "Back boxes and junction box", section: "Q", unit: "piece", value: boxShapes.length, formula: `${re.lightBox ? 1 : 0} light box + ${re.detector ? 1 : 0} detector box + ${re.fits.length} wall boxes`, inputs: { count: boxShapes.length }, status: "assumed" });
  }

  const fitting = (id: string, name: string, kind: string, shapes: Shape[], workItem: string, description: string, layerIndex: number, stage: 9 | 12 = 9, extra: { note?: string; to?: string } = {}) => {
    if (shapes.length === 0) return;
    const comp = ctx.add({
      id: `${rid}:${id}`, name: `${name} — ${r.name}, ${level.name}`, kind, category: "electrical", subcategory: "Fittings", stage, level, layer: "electrical", materialId: "switchgear", shapes, repeated: { noun: name.toLowerCase().replace(/s$/, "") },
      source: "schematic", room: r.name, grid, parentId: `${rid}:boxes`, explode: { layerIndex, dir: v3(0, 0, 1) }, ...(extra.note ? { note: extra.note } : {}),
      service: info("fitting", `Back box in the ${stage === 12 ? "slab above" : "wall"}`, extra.to ?? name, stage === 12 ? "Fixed to the ceiling, connected to the box above" : "Fixed on the wall over its back box"),
    });
    addQuantity(ctx, comp, { workItem, description, section: "Q", unit: "piece", value: shapes.length, formula: `${shapes.length} counted in ${r.name}`, inputs: { count: shapes.length }, status: "assumed" }, { assumptions: ["Quantity is an example layout, not an electrical design."] });
  };
  const of = (kind: Fit["kind"]) => re.fits.filter((f) => f.kind === kind).map((f) => f.face);
  fitting("switches", "Switches", "switch-box", of("switch"), "electrical.switch", "Light switches", 5, 9, { note: "Fixed at second fix, after painting.", to: "Ceiling light" });
  fitting("sockets", "Sockets", "socket", of("socket"), "electrical.socket", "Socket outlets", 5, 9, { note: "Fixed at second fix, after painting." });
  fitting("data", "Data outlets", "data-outlet", of("data"), "electrical.data", "Data / TV outlets", 5, 9);
  fitting("fan", "Extractor fans", "light-wall", of("fan"), "electrical.fan", "Extractor fans", 5, 9);
  fitting("wall-lights", "Wall lights", "light-wall", of("wall-light"), "electrical.wall-light", "Wall lights", 6, 9, { note: "A room whose ceiling is taken by an opening (a stairwell) is lit from the wall." });
  // Ceiling fittings arrive with the ceiling, hung from the box above on a short flexible lead.
  if (re.lightPoint && re.lightBox) {
    const lp = re.lightPoint;
    const luminaire = cyl(lp.x, lp.y, level.ceilingZ - 15, r.area > 15e6 ? 150 : 110, 30, "z");
    const flex = cyl(lp.x, lp.y, (level.ceilingZ + (level.soffitZ - 50)) / 2, 6, level.soffitZ - 50 - level.ceilingZ, "z");
    fitting("lights", "Luminaires", "light-ceiling", [luminaire, flex], "electrical.light", "Ceiling luminaires", 6, 12, { note: "Cut into the ceiling board and connected to the box above by a short flexible lead." });
  }
  if (re.detector) {
    const d = re.detector;
    const head = cyl(d.at.x, d.at.y, level.ceilingZ - 20, 55, 40, "z");
    const lead = cyl(d.at.x, d.at.y, (level.ceilingZ + (level.soffitZ - 50)) / 2, 5, level.soffitZ - 50 - level.ceilingZ, "z");
    fitting("detector", d.kind === "heat" ? "Heat detectors" : "Smoke detectors", "detector", [head, lead], d.kind === "heat" ? "electrical.heat-detector" : "electrical.smoke-detector", d.kind === "heat" ? "Heat detectors" : "Smoke detectors", 7, 12);
  }
}
