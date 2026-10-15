import { onWall, type Ctx, type LevelInfo } from "../context";
import { box, cyl, v3, type P2, type Shape } from "../geometry";
import { addQuantity, f2, round } from "../helpers";
import { freeRuns, longestFreeRun, manhattan, onEdge, roomLayout, wallBox, type Edge, type RoomLayout } from "../layout";
import { outwardSign } from "./foundation";

/** Stage 9: electrical supply, distribution, conduits, boxes, outlets, earthing and detectors. */

const CONDUIT = 20;
const SWITCH_H = 1200;
const SOCKET_H = 300;
const DB_H = 1500;

const SOCKETS: Record<string, number> = { bed: 4, living: 6, dining: 4, kitchen: 6, office: 4, circulation: 1, laundry: 3, bath: 1, wc: 0, store: 0, stair: 0, other: 2 };

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

type Point = { edge: Edge; t: number };

export function generateElectrical(ctx: Ctx): void {
  const ground = ctx.ground;
  if (!ground) return;
  const layouts = new Map<string, RoomLayout>();
  for (const room of ctx.rooms) layouts.set(room.id, roomLayout(ctx, room));

  // The distribution board stands in the ground-floor circulation room, with the others stacked over it.
  const hall = ctx.roomsOf(ground.levelId).find((r) => r.kind === "circulation") ?? ctx.roomsOf(ground.levelId)[0];
  if (!hall) return;
  const hallLayout = layouts.get(hall.id)!;
  const run = longestFreeRun(hallLayout, 300);
  if (!run) return;
  const dbPlan = onEdge(run.edge, (run.t0 + run.t1) / 2, 0);
  const dbEdge = run.edge;
  const dbT = (run.t0 + run.t1) / 2;

  // --- Supply: meter on the nearest outside wall, board, riser, earth rod ----
  const exteriors = ctx.wallsOf(ground.levelId).filter((w) => w.exterior);
  let meterAt: { wall: (typeof exteriors)[number]; s: number; d: number } | null = null;
  for (const wall of exteriors) {
    const s = Math.max(400, Math.min(wall.length - 400, (dbPlan.x - wall.start.x) * wall.ux + (dbPlan.y - wall.start.y) * wall.uy));
    const p = onWall(wall, s);
    const d = Math.hypot(p.x - dbPlan.x, p.y - dbPlan.y);
    if (!meterAt || d < meterAt.d) meterAt = { wall, s, d };
  }
  const out = meterAt ? (outwardSign(meterAt.wall) || -1) : -1;
  const meterPos = meterAt ? onWall(meterAt.wall, meterAt.s, out * (meterAt.wall.thickness / 2 + 80)) : { x: dbPlan.x, y: dbPlan.y };
  const meter = ctx.add({
    id: "elec:meter", name: "Utility meter box", kind: "meter-board", category: "electrical", subcategory: "Supply", stage: 9, level: ground, layer: "electrical", materialId: "switchgear",
    shapes: [box(meterPos.x, meterPos.y, DB_H, 350, 350, 450)], source: "schematic", room: null, explode: { layerIndex: 0, dir: v3(meterAt ? meterAt.wall.nx * out : 0, meterAt ? meterAt.wall.ny * out : -1, 0) },
    label: { text: "Meter", anchor: v3(meterPos.x, meterPos.y, DB_H + 400) }, note: "Position and rating are set by the supply authority.",
  });
  addQuantity(ctx, meter, { workItem: "electrical.meter", description: "Meter box", section: "Q", unit: "piece", value: 1, formula: "1 service position (example)", inputs: { count: 1 }, status: "assumed" });
  const rod = ctx.add({
    id: "elec:earth", name: "Earth electrode and conductor", kind: "earthing", category: "electrical", subcategory: "Earthing", stage: 9, level: ground, layer: "electrical", materialId: "earth",
    shapes: [cyl(meterPos.x + (meterAt ? meterAt.wall.nx * out * 300 : 0), meterPos.y + (meterAt ? meterAt.wall.ny * out * 300 : -300), -1200, 8, 2400, "z"), cyl(meterPos.x, meterPos.y, DB_H / 2 - 100, 3, DB_H - 200, "z")],
    source: "schematic", concealed: true, parentId: meter.id, explode: { layerIndex: 1, dir: v3(0, 0, -1) }, note: "Rod length and the resistance to earth are verified by test; the figures here are examples.",
  });
  addQuantity(ctx, rod, { workItem: "electrical.earth", description: "Earth rod and conductor", section: "Q", unit: "set", value: 1, formula: "1 electrode with conductor to the board", inputs: { count: 1 }, status: "assumed" });
  // Service conduit from the meter to the first board.
  const svc = manhattan([{ x: meterPos.x, y: meterPos.y, z: DB_H }, { x: meterPos.x, y: meterPos.y, z: 2300 }, { x: dbPlan.x, y: meterPos.y, z: 2300 }, { x: dbPlan.x, y: dbPlan.y, z: 2300 }, { x: dbPlan.x, y: dbPlan.y, z: DB_H + 200 }], 25);
  const service = ctx.add({
    id: "elec:service", name: "Service conduit, meter to board", kind: "supply-entry", category: "electrical", subcategory: "Supply", stage: 9, level: ground, layer: "electrical", materialId: "conduit", shapes: svc.shapes, repeated: { noun: "segment" },
    source: "schematic", concealed: true, parentId: meter.id, explode: { layerIndex: 2, dir: v3(0, 0, 1) }, note: "A straight schematic route; the real route follows the designer's drawing.",
  });
  addQuantity(ctx, service, { workItem: "electrical.conduit", description: "Conduit", section: "Q", unit: "m", value: round(svc.length / 1000, 3), formula: `Σ straight segments = ${f2(svc.length / 1000)} m`, inputs: { length: round(svc.length, 0) }, status: "assumed" }, { allowance: { rule: "Bends, offsets and waste (example assumption)", percent: ctx.rules.allowances.conduit } });

  const boardPlan = (level: LevelInfo): P2 => ({ x: dbPlan.x, y: dbPlan.y });
  const riserShapes: Shape[] = [];
  let riserLen = 0;
  const boardIds: string[] = [];
  const firstRoomId = new Map<string, string>();
  for (const level of ctx.levels) {
    const p = boardPlan(level);
    const board = ctx.add({
      id: `elec:${level.index}:board`, name: `Distribution board — ${level.name}`, kind: "distribution-board", category: "electrical", subcategory: "Distribution", stage: 9, level, layer: "electrical", materialId: "switchgear",
      shapes: [wallBox({ room: hall, level, clear: hallLayout.clear, edges: hallLayout.edges }, dbEdge, dbT, DB_H, 300, 400, 100)], source: "schematic", room: hall.name, explode: { layerIndex: 0, dir: v3(dbEdge.nx, dbEdge.ny, 0) },
      ...(level.index === 0 ? { label: { text: "Distribution board", anchor: v3(p.x, p.y, level.floorZ + DB_H + 400) } } : {}), parentId: level.index === 0 ? meter.id : `elec:${level.index - 1}:board`,
      note: "Breakers and cables are sized by the electrical designer.",
    });
    boardIds.push(board.id);
    addQuantity(ctx, board, { workItem: "electrical.board", description: "Distribution board", section: "Q", unit: "piece", value: 1, formula: "1 board per storey", inputs: { count: 1 }, status: "assumed" });
    if (level.index > 0) {
      const prev = ctx.levels[level.index - 1]!;
      const z0 = prev.floorZ + DB_H + 200;
      const z1 = level.floorZ + DB_H - 200;
      riserShapes.push(cyl(p.x + dbEdge.nx * 60, p.y + dbEdge.ny * 60, (z0 + z1) / 2, 25, z1 - z0, "z"));
      riserLen += z1 - z0;
    }
  }
  if (riserShapes.length) {
    const riser = ctx.add({
      id: "elec:riser", name: "Electrical riser", kind: "conduit", category: "electrical", subcategory: "Distribution", stage: 9, level: null, storeyIndex: 0, layer: "electrical", materialId: "conduit", shapes: riserShapes, repeated: { noun: "length" },
      source: "schematic", concealed: true, parentId: "elec:0:board", explode: { layerIndex: 2, dir: v3(0, 0, 1) }, note: "The riser passes through the slabs in a sleeve formed before the pour.",
    });
    addQuantity(ctx, riser, { workItem: "electrical.conduit", description: "Conduit", section: "Q", unit: "m", value: round(riserLen / 1000, 3), formula: `Σ riser lengths = ${f2(riserLen / 1000)} m`, inputs: { length: round(riserLen, 0) }, status: "assumed" }, { allowance: { rule: "Bends, offsets and waste (example assumption)", percent: ctx.rules.allowances.conduit } });
  }

  // --- Rooms ---------------------------------------------------------------
  for (const level of ctx.levels) {
    const rooms = ctx.roomsOf(level.levelId);
    const zc = level.ceilingZ + 150;
    let circuit = 0;
    for (const room of rooms) {
      const layout = layouts.get(room.id)!;
      const rid = `elec:${level.index}:${slug(room.name)}`;
      const light = room.centre;
      const grid = ctx.gridRef(level.levelId, light.x, light.y, 2500);
      const lift = (circuit % 8) * 25;
      circuit += 1;

      // Switch positions: beside the latch side of each door, on the inside.
      const switches: Point[] = [];
      for (const edge of layout.edges) for (const eo of edge.openings) {
        if (eo.opening.kind === "window") continue;
        const t = eo.t1 + 180 <= edge.length - 100 ? eo.t1 + 180 : Math.max(100, eo.t0 - 180);
        switches.push({ edge, t });
      }
      if (switches.length === 0 && layout.edges[0]) switches.push({ edge: layout.edges[0], t: layout.edges[0].length / 2 });
      // Sockets spread over the free wall runs, longest first.
      const want = SOCKETS[room.kind] ?? 2;
      const runs = layout.edges.flatMap((edge) => freeRuns(edge, 250, 400).map(([t0, t1]) => ({ edge, t0, t1 }))).sort((a, b) => (b.t1 - b.t0) - (a.t1 - a.t0));
      const sockets: Point[] = [];
      for (let k = 0; k < want && runs.length; k += 1) {
        const r = runs[k % runs.length]!;
        const pass = Math.floor(k / runs.length);
        const fractions = [0.5, 0.2, 0.8];
        sockets.push({ edge: r.edge, t: r.t0 + (r.t1 - r.t0) * fractions[pass % fractions.length]! });
      }
      const socketH = room.kind === "kitchen" ? 1100 : SOCKET_H;

      // Conduit: feed from the board to the light, drops to the switches, a chain along the walls to the sockets.
      const conduit: Shape[] = [];
      let conduitLen = 0;
      const add = (pts: { x: number; y: number; z: number }[]) => { const m = manhattan(pts, CONDUIT); conduit.push(...m.shapes); conduitLen += m.length; };
      const bp = boardPlan(level);
      add([{ x: bp.x + dbEdge.nx * 60, y: bp.y + dbEdge.ny * 60, z: level.floorZ + DB_H + 200 }, { x: bp.x + dbEdge.nx * 60, y: bp.y + dbEdge.ny * 60, z: zc + lift }, { x: light.x, y: bp.y + dbEdge.ny * 60, z: zc + lift }, { x: light.x, y: light.y, z: zc + lift }]);
      for (const s of switches) {
        const w = onEdge(s.edge, s.t, -40);
        add([{ x: light.x, y: light.y, z: zc + lift }, { x: w.x, y: light.y, z: zc + lift }, { x: w.x, y: w.y, z: zc + lift }, { x: w.x, y: w.y, z: level.floorZ + SWITCH_H + 60 }]);
      }
      let prev: P2 = bp;
      let prevZ = level.floorZ + DB_H - 200;
      sockets.forEach((s, k) => {
        const w = onEdge(s.edge, s.t, -40);
        const zs = level.floorZ + socketH;
        const pts = k === 0
          ? [{ x: prev.x + dbEdge.nx * 60, y: prev.y + dbEdge.ny * 60, z: prevZ }, { x: prev.x + dbEdge.nx * 60, y: prev.y + dbEdge.ny * 60, z: zs - 60 }, { x: w.x, y: prev.y + dbEdge.ny * 60, z: zs - 60 }, { x: w.x, y: w.y, z: zs - 60 }, { x: w.x, y: w.y, z: zs }]
          : [{ x: prev.x, y: prev.y, z: prevZ }, { x: prev.x, y: prev.y, z: zs - 60 }, { x: w.x, y: prev.y, z: zs - 60 }, { x: w.x, y: w.y, z: zs - 60 }, { x: w.x, y: w.y, z: zs }];
        add(pts);
        prev = w;
        prevZ = zs;
      });
      if (conduit.length) {
        const comp = ctx.add({
          id: `${rid}:conduit`, name: `Conduits — ${room.name}, ${level.name}`, kind: "conduit", category: "electrical", subcategory: "Conduits", stage: 9, level, layer: "electrical", materialId: "conduit", shapes: conduit, repeated: { noun: "segment" },
          source: "schematic", room: room.name, grid, concealed: true, parentId: `elec:${level.index}:board`, explode: { layerIndex: 3, dir: v3(0, 0, 1) },
          dims: { length: dim0(conduitLen) }, note: "Conduit runs in the ceiling void and in chases in the walls; chases in structural members need the engineer's approval.",
        });
        addQuantity(ctx, comp, { workItem: "electrical.conduit", description: "Conduit", section: "Q", unit: "m", value: round(conduitLen / 1000, 3), formula: `feed + ${switches.length} switch drops + ${sockets.length} socket chain = ${f2(conduitLen / 1000)} m`, inputs: { length: round(conduitLen, 0), switches: switches.length, sockets: sockets.length }, status: "assumed" },
          { allowance: { rule: "Bends, offsets and waste (example assumption)", percent: ctx.rules.allowances.conduit }, assumptions: ["Schematic route: straight runs along walls and the ceiling void."] });
        addQuantity(ctx, comp, { workItem: "electrical.cable", description: "Cable (single conductors)", section: "Q", unit: "m", value: round((conduitLen * 3) / 1000, 3), formula: `${f2(conduitLen / 1000)} m of conduit × 3 conductors (live, neutral, earth)`, inputs: { length: round(conduitLen, 0), conductors: 3 }, status: "assumed" },
          { allowance: { rule: "Cutting and terminations (example assumption)", percent: ctx.rules.allowances.conduit }, assumptions: ["Cable sizes depend on the circuit design and are not set here."] });
      }

      // Back boxes (concealed): one per fitting.
      const boxShapes: Shape[] = [box(light.x, light.y, zc + lift + 40, 90, 90, 60)];
      for (const s of switches) boxShapes.push(wallBox(layout, s.edge, s.t, SWITCH_H, 75, 75, 45, -30));
      for (const s of sockets) boxShapes.push(wallBox(layout, s.edge, s.t, socketH, 75, 75, 45, -30));
      const boxes = ctx.add({
        id: `${rid}:boxes`, name: `Back boxes — ${room.name}, ${level.name}`, kind: "junction-box", category: "electrical", subcategory: "Boxes", stage: 9, level, layer: "electrical", materialId: "electrical-box", shapes: boxShapes, repeated: { noun: "box" },
        source: "schematic", room: room.name, grid, concealed: true, parentId: `${rid}:conduit`, explode: { layerIndex: 4, dir: v3(0, 0, 1) },
      });
      addQuantity(ctx, boxes, { workItem: "electrical.box", description: "Back boxes and junction box", section: "Q", unit: "piece", value: boxShapes.length, formula: `1 light box + ${switches.length} switch + ${sockets.length} socket boxes`, inputs: { count: boxShapes.length }, status: "assumed" });

      // Visible fittings.
      const fitting = (id: string, name: string, kind: string, shapes: Shape[], workItem: string, description: string, layerIndex: number, stage: 9 | 12 = 9, extra: { note?: string } = {}) => {
        if (shapes.length === 0) return;
        const comp = ctx.add({ id: `${rid}:${id}`, name: `${name} — ${room.name}, ${level.name}`, kind, category: "electrical", subcategory: "Fittings", stage, level, layer: "electrical", materialId: "switchgear", shapes, repeated: { noun: name.toLowerCase().replace(/s$/, "") },
          source: "schematic", room: room.name, grid, parentId: `${rid}:boxes`, explode: { layerIndex: layerIndex, dir: v3(0, 0, 1) }, ...(extra.note ? { note: extra.note } : {}) });
        addQuantity(ctx, comp, { workItem, description, section: "Q", unit: "piece", value: shapes.length, formula: `${shapes.length} counted in ${room.name}`, inputs: { count: shapes.length }, status: "assumed" }, { assumptions: ["Quantity is an example layout, not an electrical design."] });
      };
      fitting("switches", "Switches", "switch-box", switches.map((s) => wallBox(layout, s.edge, s.t, SWITCH_H, 85, 85, 12)), "electrical.switch", "Light switches", 5, 9, { note: "Fixed at second fix, after painting." });
      fitting("sockets", "Sockets", "socket", sockets.map((s) => wallBox(layout, s.edge, s.t, socketH, 85, 85, 18)), "electrical.socket", "Socket outlets", 5, 9, { note: "Fixed at second fix, after painting." });
      const data = ["living", "office"].includes(room.kind) && sockets[0] ? [wallBox(layout, sockets[0].edge, Math.min(sockets[0].edge.length - 150, sockets[0].t + 250), SOCKET_H, 85, 85, 15)] : [];
      fitting("data", "Data outlets", "data-outlet", data, "electrical.data", "Data / TV outlets", 5, 9);
      const fans = ["bath", "wc", "kitchen"].includes(room.kind) && layout.edges.length ? (() => { const e = [...layout.edges].sort((a, b) => Number(!!b.wall?.exterior) - Number(!!a.wall?.exterior) || b.length - a.length)[0]!; return [wallBox(layout, e, e.length / 2, 2200, 200, 200, 90)]; })() : [];
      fitting("fan", "Extractor fans", "light-wall", fans, "electrical.fan", "Extractor fans", 5, 9);
      // Ceiling fittings arrive with the ceiling.
      fitting("lights", "Luminaires", "light-ceiling", [cyl(light.x, light.y, level.ceilingZ - 15, room.area > 15e6 ? 150 : 110, 30, "z")], "electrical.light", "Ceiling luminaires", 6, 12, { note: "Cut into the ceiling board and connected to the box above." });
      if (["circulation", "bed", "kitchen", "stair"].includes(room.kind)) {
        fitting("detector", room.kind === "kitchen" ? "Heat detectors" : "Smoke detectors", "detector", [cyl(light.x + 500, light.y + 500, level.ceilingZ - 20, 55, 40, "z")], room.kind === "kitchen" ? "electrical.heat-detector" : "electrical.smoke-detector", room.kind === "kitchen" ? "Heat detectors" : "Smoke detectors", 7, 12);
      }
      if (!firstRoomId.has(level.levelId)) firstRoomId.set(level.levelId, rid);
    }
  }
}

function dim0(length: number) {
  return { value: round(length, 0), unit: "mm" as const, status: "assumed" as const };
}
