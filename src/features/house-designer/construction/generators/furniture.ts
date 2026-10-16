import { startingDesign } from "@/features/berchuma-studio/services/starting-designs";

import type { Ctx } from "../context";
import { box, cyl, v3, type Shape } from "../geometry";
import { addQuantity } from "../helpers";
import { roomLayout, wallBox, type Edge, type RoomLayout } from "../layout";
import { FLOOR_TOP, placeDesign, runsOf } from "./joinery";

/**
 * Stage 17: loose furniture and the final interior. It is movable equipment,
 * kept apart from the building works (`loose`), and grouped by storey and room
 * so it can be hidden or inspected on its own.
 */

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Part = { shape: Shape; name: string };

/** A box standing on the finished floor: `t` along the edge (centre), `inset` from the wall to the near face, sizes along / across / up, raised by `lift`. */
function item(layout: RoomLayout, edge: Edge, t: number, inset: number, along: number, across: number, high: number, lift = 0): Shape {
  return wallBox(layout, edge, t, FLOOR_TOP + lift + high / 2, along, high, across, inset);
}

export function generateFurniture(ctx: Ctx): void {
  const layouts = new Map<string, RoomLayout>();
  for (const room of ctx.rooms) layouts.set(room.id, roomLayout(ctx, room));
  for (const level of ctx.levels) {
    for (const room of ctx.roomsOf(level.levelId)) {
      const layout = layouts.get(room.id)!;
      const builtIn = runsOf(layout)[0]?.edge ?? null;
      const all = (id: string, name: string, kind: string, parts: Part[], workItem: string, description: string, count: number, layerIndex: number, loose = true, category: "furniture" | "joinery" = "furniture") => {
        if (parts.length === 0 || count === 0) return;
        const comp = ctx.add({
          id: `furn:${level.index}:${slug(room.name)}:${id}`, name: `${name} — ${room.name}, ${level.name}`, kind, category, subcategory: name, stage: 17, level, room: room.name, grid: ctx.gridRef(level.levelId, room.centre.x, room.centre.y, 2500),
          layer: "furniture", materialId: kind === "rug" ? "rug" : kind === "curtain" ? "curtain" : kind === "mattress" ? "mattress" : kind === "sofa" || kind === "armchair" ? "fabric" : "wood-furniture", shapes: parts.map((p) => p.shape),
          repeated: { noun: "part" }, instanceNames: parts.map((p) => p.name), source: "schematic", loose, explode: { layerIndex, dir: v3(0, 0, 1) },
          note: loose ? "Loose furniture: movable equipment, kept apart from the building works for estimating." : undefined,
        });
        addQuantity(ctx, comp, { workItem, description, section: "V", unit: "piece", value: count, formula: `${count} in ${room.name}`, inputs: { count }, status: "assumed" }, { assumptions: ["An example furnishing; not part of construction cost unless the project includes it."] });
      };

      if (room.kind === "bed") {
        const run = runsOf(layout, 400, builtIn ? [builtIn] : [])[0] ?? runsOf(layout, 400)[0];
        if (run) {
          const { edge } = run;
          const t = (run.t0 + run.t1) / 2;
          const parts: Part[] = [
            { shape: item(layout, edge, t, 0, 1500, 2000, 300), name: "Bed base" },
            { shape: item(layout, edge, t, 0, 1520, 60, 1000), name: "Headboard" },
          ];
          all("bed", "Bed base and headboard", "bed", parts, "furniture.bed", "Beds (base and headboard)", 1, 0);
          all("mattress", "Mattress and pillows", "mattress", [
            { shape: item(layout, edge, t, 60, 1450, 1940, 220, 300), name: "Mattress" },
            { shape: item(layout, edge, t - 350, 120, 600, 400, 120, 520), name: "Pillow" }, { shape: item(layout, edge, t + 350, 120, 600, 400, 120, 520), name: "Pillow" },
          ], "furniture.mattress", "Mattresses", 1, 1);
          const sides: Part[] = [t - 1000, t + 1000].map((tt, i) => ({ shape: item(layout, edge, tt, 0, 400, 400, 500), name: `Bedside table ${i + 1}` }));
          if (run.t0 < t - 1250 && run.t1 > t + 1250) all("bedside", "Bedside tables", "storage-unit", sides, "furniture.bedside", "Bedside tables", 2, 0);
          all("rug", "Rug", "rug", [{ shape: item(layout, edge, t, 600, 2200, 1800, 12), name: "Rug" }], "furniture.rug", "Rugs", 1, 0);
        }
      } else if (room.kind === "living") {
        const tvRun = runsOf(layout, 300)[0];
        if (tvRun) {
          const width = Math.floor(Math.min(1800, tvRun.t1 - tvRun.t0) / 50) * 50;
          if (width >= 900) placeDesign(ctx, { id: "tv", name: "TV unit", room, level, layout, spec: startingDesign("tv_unit", { width }), edge: tvRun.edge, tStart: (tvRun.t0 + tvRun.t1) / 2 + width / 2, stage: 17, category: "furniture", loose: true });
          const opposite = layout.edges.filter((e) => e.wall && e.nx * tvRun.edge.nx + e.ny * tvRun.edge.ny < -0.9).sort((a, b) => b.length - a.length)[0];
          if (opposite) {
            const mid = opposite.length / 2;
            all("sofa", "Sofa", "sofa", [
              { shape: item(layout, opposite, mid, 100, 2200, 900, 450), name: "Sofa seat" }, { shape: item(layout, opposite, mid, 100, 2200, 220, 450, 450), name: "Sofa back" },
              { shape: item(layout, opposite, mid - 1000, 100, 200, 900, 250, 450), name: "Sofa arm" }, { shape: item(layout, opposite, mid + 1000, 100, 200, 900, 250, 450), name: "Sofa arm" },
            ], "furniture.sofa", "Sofas", 1, 0);
            all("coffee", "Coffee table", "coffee-table", [{ shape: item(layout, opposite, mid, 1300, 1100, 600, 400), name: "Coffee table" }], "furniture.coffee-table", "Coffee tables", 1, 0);
            all("rug", "Rug", "rug", [{ shape: item(layout, opposite, mid, 1000, 2400, 1800, 12), name: "Rug" }], "furniture.rug", "Rugs", 1, 0);
            all("armchair", "Armchair", "armchair", [{ shape: item(layout, opposite, mid + 1600, 1500, 800, 800, 450), name: "Armchair seat" }, { shape: item(layout, opposite, mid + 1600, 1500, 800, 200, 450, 450), name: "Armchair back" }], "furniture.armchair", "Armchairs", 1, 0);
          }
        }
      } else if (room.kind === "dining") {
        const cx = room.centre.x;
        const cy = room.centre.y;
        const parts: Part[] = [
          { shape: box(cx, cy, FLOOR_TOP + 740, 1800, 900, 40), name: "Table top" },
          ...[[-800, -380], [800, -380], [-800, 380], [800, 380]].map(([dx, dy], i) => ({ shape: box(cx + dx!, cy + dy!, FLOOR_TOP + 360, 60, 60, 720), name: `Table leg ${i + 1}` })),
        ];
        all("table", "Dining table", "dining-table", parts, "furniture.dining-table", "Dining tables", 1, 0);
        const chairs: Part[] = [];
        for (const [dx, dy] of [[-600, -780], [0, -780], [600, -780], [-600, 780], [0, 780], [600, 780]] as const) {
          chairs.push({ shape: box(cx + dx, cy + dy, FLOOR_TOP + 450, 450, 450, 40), name: "Chair seat" }, { shape: box(cx + dx, cy + dy + Math.sign(dy) * 205, FLOOR_TOP + 700, 450, 40, 500), name: "Chair back" });
          for (const [lx, ly] of [[-190, -190], [190, -190], [-190, 190], [190, 190]] as const) chairs.push({ shape: cyl(cx + dx + lx, cy + dy + ly, FLOOR_TOP + 215, 20, 430, "z"), name: "Chair leg" });
        }
        all("chairs", "Dining chairs", "chair", chairs, "furniture.chair", "Dining chairs", 6, 1);
      } else if (room.kind === "office") {
        const run = runsOf(layout, 400, builtIn ? [builtIn] : [])[0] ?? runsOf(layout, 400)[0];
        if (run) {
          const t = (run.t0 + run.t1) / 2;
          all("desk", "Desk", "desk", [{ shape: item(layout, run.edge, t, 0, 1500, 700, 40, 710), name: "Desk top" }, { shape: item(layout, run.edge, t - 700, 50, 40, 600, 710), name: "Desk side" }, { shape: item(layout, run.edge, t + 700, 50, 40, 600, 710), name: "Desk side" }], "furniture.desk", "Desks", 1, 0);
          all("chair", "Office chair", "chair", [{ shape: item(layout, run.edge, t, 800, 500, 500, 60, 450), name: "Seat" }, { shape: item(layout, run.edge, t, 1020, 480, 60, 500, 500), name: "Back" }, { shape: item(layout, run.edge, t, 800, 60, 60, 450), name: "Post" }], "furniture.office-chair", "Office chairs", 1, 1);
        }
      } else if (room.kind === "bath" || room.kind === "wc") {
        const runs = runsOf(layout, 500);
        const mirrorRun = runs[0];
        if (mirrorRun) {
          all("mirror", "Mirror", "bathroom-accessory", [{ shape: wallBox(layout, mirrorRun.edge, (mirrorRun.t0 + mirrorRun.t1) / 2, 1500, 600, 900, 12), name: "Mirror" }], "furniture.mirror", "Mirrors", 1, 0, false);
        }
        const rail = runs.find((r) => r.edge !== mirrorRun?.edge) ?? runs[1];
        if (rail) all("towel", "Towel rail", "bathroom-accessory", [{ shape: wallBox(layout, rail.edge, (rail.t0 + rail.t1) / 2, 1300, 600, 30, 70), name: "Towel rail" }], "furniture.towel-rail", "Towel rails", 1, 1, false);
      }

      // Curtains at windows in the living and sleeping rooms.
      if (["bed", "living", "dining", "office"].includes(room.kind)) {
        const parts: Part[] = [];
        let sets = 0;
        for (const edge of layout.edges) for (const eo of edge.openings.filter((o) => o.opening.kind === "window")) {
          const w = eo.t1 - eo.t0 + 400;
          const mid = (eo.t0 + eo.t1) / 2;
          const rodZ = eo.opening.z1 + 200;
          parts.push({ shape: wallBox(layout, edge, mid, rodZ, w, 30, 30, 100), name: "Curtain rod" });
          for (const side of [-1, 1]) parts.push({ shape: wallBox(layout, edge, mid + (side * w) / 4, (rodZ + FLOOR_TOP + 150) / 2, w / 2 - 20, rodZ - FLOOR_TOP - 150, 40, 70), name: "Curtain panel" });
          sets += 1;
        }
        all("curtains", "Curtains", "curtain", parts, "furniture.curtain", "Curtain sets (rod and two panels)", sets, 2);
      }
    }
  }
}
