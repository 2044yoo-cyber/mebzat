import { onWall, type Ctx, type LevelInfo, type OpeningFrame, type WallFrame } from "../context";
import { box, cyl, v3, type P2, type Shape } from "../geometry";
import { addQuantity, f2, f3, round } from "../helpers";
import { outwardSign } from "./foundation";

/**
 * Stage 14 (and the door coatings of stage 15): each opening becomes separate,
 * identifiable parts: the rough opening, the frame, the leaf or sash, the glass,
 * the hardware, the perimeter seal and, for windows, the sill.
 */

const FRAME = 50;
const LEAF = 40;
const CLEAR = 4;
const SEAL = 6;
const GLASS = 6;
const SASH = 40;
const SILL_DROP = 40;
const SILL_PROJECTION = 60;

/** A box in wall coordinates: `s0..s1` along the wall, `n0..n1` across it (positive to the left), `z0..z1` up. */
function wb(wall: WallFrame, base: number, s0: number, s1: number, n0: number, n1: number, z0: number, z1: number): Shape {
  const c = onWall(wall, (s0 + s1) / 2, (n0 + n1) / 2);
  const dx = Math.abs(wall.ux) > 0.999;
  const dy = Math.abs(wall.uy) > 0.999;
  if (dx) return box(c.x, c.y, base + (z0 + z1) / 2, s1 - s0, n1 - n0, z1 - z0);
  if (dy) return box(c.x, c.y, base + (z0 + z1) / 2, n1 - n0, s1 - s0, z1 - z0);
  return box(c.x, c.y, base + (z0 + z1) / 2, s1 - s0, n1 - n0, z1 - z0, Math.atan2(wall.uy, wall.ux));
}

export function generateOpenings(ctx: Ctx): void {
  for (const level of ctx.levels) {
    for (const wall of ctx.wallsOf(level.levelId)) {
      for (const o of wall.openings) opening(ctx, level, wall, o);
    }
  }
  // Coating the handrails and balustrades is a stage-15 item on a stage-6 component.
  for (const comp of ctx.components) {
    if (comp.kind !== "handrail" && comp.kind !== "balustrade") continue;
    const length = comp.quantities.find((q) => q.workItem === "metalwork.handrail")?.value;
    if (length == null) continue;
    addQuantity(ctx, comp, { workItem: "paint.metal", description: "Metal coating to handrails and balusters", section: "M", unit: "m²", value: round(length * 0.15, 3), formula: `${f2(length)} m × 0.15 m girth (example)`, inputs: { length, girth: 150 }, status: "assumed" }, { allowance: { rule: "Waste (example assumption)", percent: ctx.rules.allowances.paint } });
  }
}

function opening(ctx: Ctx, level: LevelInfo, wall: WallFrame, o: OpeningFrame): void {
  const base = level.floorZ;
  const t = wall.thickness;
  const half = t / 2;
  const w = o.width;
  const h = o.height;
  const room = wall.left && wall.right ? `${wall.left} / ${wall.right}` : wall.left ?? wall.right;
  const mid = onWall(wall, (o.s0 + o.s1) / 2);
  const grid = ctx.gridRef(level.levelId, mid.x, mid.y, 600);
  const out = outwardSign(wall) || 1;
  const id = `open:${o.id.replace(/[^\w]+/g, "-")}`;
  const isWindow = o.kind === "window";
  const kindWord = isWindow ? "Window" : o.kind === "passage" ? "Passage" : "Door";
  const nm = `${kindWord} ${o.ordinal + 1}`;
  const label = `${nm} — ${level.name}${room ? ` (${room})` : ""}`;
  const source = "project" as const;
  const common = { category: "openings" as const, stage: 14 as const, level, room, grid, source, sourceRef: o.id, dir: v3(wall.nx * out * -1, wall.ny * out * -1, 0) };
  const explodeDir = common.dir;
  const frameMaterial = isWindow ? "aluminium" : "frame-timber";

  // The rough opening, as a thin reveal lining.
  const reveal: Shape[] = [
    wb(wall, base, o.s0, o.s0 + 8, -half, half, o.z0, o.z1), wb(wall, base, o.s1 - 8, o.s1, -half, half, o.z0, o.z1),
    wb(wall, base, o.s0, o.s1, -half, half, o.z1 - 8, o.z1), ...(isWindow ? [wb(wall, base, o.s0, o.s1, -half, half, o.z0, o.z0 + 8)] : []),
  ];
  const opening = ctx.add({
    id: `${id}:opening`, name: `${label} — rough opening`, kind: isWindow ? "window-opening" : "door-opening", category: "openings", subcategory: "Openings", stage: 14, level, room, grid, layer: "frame", materialId: "lintel", shapes: reveal, repeated: { noun: "side" },
    source, sourceRef: o.id, explode: { layerIndex: 0, dir: explodeDir }, dims: { width: { value: w, unit: "mm", status: "measured" }, height: { value: h, unit: "mm", status: "measured" }, area: { value: round(w * h * 1e-6, 3), unit: "m²", status: "calculated" } },
    note: "The hole in the wall left for the frame, with a lintel over it.",
  });
  addQuantity(ctx, opening, { workItem: isWindow ? "openings.window-opening" : "openings.door-opening", description: `${kindWord} openings (builder's work)`, section: "I", unit: "piece", value: 1, formula: `1 opening ${w} × ${h} mm`, inputs: { width: w, height: h, area: round(w * h * 1e-6, 3) }, status: "measured" }, { sourceGeometry: `project:${o.id}` });

  // Frame.
  const frame: Shape[] = [
    wb(wall, base, o.s0, o.s0 + FRAME, -half + 10, half - 10, o.z0, o.z1), wb(wall, base, o.s1 - FRAME, o.s1, -half + 10, half - 10, o.z0, o.z1),
    wb(wall, base, o.s0 + FRAME, o.s1 - FRAME, -half + 10, half - 10, o.z1 - FRAME, o.z1),
  ];
  if (isWindow) frame.push(wb(wall, base, o.s0 + FRAME, o.s1 - FRAME, -half + 10, half - 10, o.z0, o.z0 + FRAME));
  const frameLen = isWindow ? 2 * (w + h) : 2 * h + w;
  const frameComp = ctx.add({
    id: `${id}:frame`, name: `${label} — frame`, kind: isWindow ? "window-frame" : "door-frame", category: "openings", subcategory: "Frames", stage: 14, level, room, grid, layer: "frame", materialId: frameMaterial, shapes: frame, repeated: { noun: "member" },
    source, sourceRef: o.id, parentId: opening.id, explode: { layerIndex: 1, dir: explodeDir }, dims: { width: { value: w, unit: "mm", status: "measured" }, height: { value: h, unit: "mm", status: "measured" } },
    note: "Fixed plumb and square, then sealed at the perimeter.",
  });
  addQuantity(ctx, frameComp, { workItem: isWindow ? "openings.window-frame" : "openings.door-frame", description: isWindow ? "Window frames" : "Door frames", section: "I", unit: "piece", value: 1, formula: `1 frame, perimeter ${f3(frameLen / 1000)} m`, inputs: { width: w, height: h, perimeter: frameLen }, status: "measured" }, { sourceGeometry: `project:${o.id}` });

  // Leaf or sash with glass.
  if (o.kind !== "passage") {
    const hingeAtStart = /left/i.test(o.swing);
    if (!isWindow) {
      const lw = w - 2 * FRAME - 2 * CLEAR;
      const lh = h - FRAME - 2 * CLEAR;
      const leaf = ctx.add({
        id: `${id}:leaf`, name: `${label} — door leaf`, kind: "door-leaf", category: "openings", subcategory: "Leaves", stage: 14, level, room, grid, layer: "frame", materialId: o.material.toLowerCase().includes("alumin") ? "aluminium" : "door-timber",
        shapes: [wb(wall, base, o.s0 + FRAME + CLEAR, o.s1 - FRAME - CLEAR, -LEAF / 2, LEAF / 2, o.z0 + CLEAR, o.z0 + CLEAR + lh)], source, sourceRef: o.id, parentId: frameComp.id, explode: { layerIndex: 2, dir: explodeDir },
        dims: { width: { value: lw, unit: "mm", status: "calculated" }, height: { value: lh, unit: "mm", status: "calculated" }, thickness: { value: LEAF, unit: "mm", status: "assumed" } }, note: `Swing: ${o.swing}. Shown closed.`,
      });
      addQuantity(ctx, leaf, { workItem: "openings.door-leaf", description: "Door leaves", section: "I", unit: "piece", value: 1, formula: `1 leaf ${f3(lw)} × ${f3(lh)} mm`, inputs: { width: lw, height: lh, area: round(lw * lh * 1e-6, 3) }, status: "calculated" }, { sourceGeometry: `project:${o.id}` });
      addQuantity(ctx, leaf, { workItem: "openings.door-leaf-area", description: "Door leaf area", section: "I", unit: "m²", value: round(lw * lh * 1e-6, 3), formula: `${f3(lw / 1000)} m × ${f3(lh / 1000)} m`, inputs: { width: lw, height: lh }, status: "calculated" });
      // Stage 15: timber coating, both faces.
      if (!o.material.toLowerCase().includes("alumin")) {
        const coat = ctx.add({
          id: `${id}:coating`, name: `${label} — leaf coating`, kind: "wood-coating", category: "finishes", subcategory: "Paint", stage: 15, level, room, grid, layer: "paint", materialId: "paint-int",
          shapes: [wb(wall, base, o.s0 + FRAME + CLEAR, o.s1 - FRAME - CLEAR, -LEAF / 2 - 1, -LEAF / 2, o.z0 + CLEAR, o.z0 + CLEAR + lh), wb(wall, base, o.s0 + FRAME + CLEAR, o.s1 - FRAME - CLEAR, LEAF / 2, LEAF / 2 + 1, o.z0 + CLEAR, o.z0 + CLEAR + lh)],
          source, sourceRef: o.id, parentId: leaf.id, explode: { layerIndex: 3, dir: explodeDir },
        });
        addQuantity(ctx, coat, { workItem: "paint.wood", description: "Wood coating to door leaves (both faces)", section: "M", unit: "m²", value: round(2 * lw * lh * 1e-6, 3), formula: `2 faces × ${f3(lw / 1000)} m × ${f3(lh / 1000)} m`, inputs: { width: lw, height: lh }, status: "calculated" }, { allowance: { rule: "Waste (example assumption)", percent: ctx.rules.allowances.paint }, assumptions: ["Edges and frames are not added."] });
      }
      // Hardware: three hinges and a lock set.
      const hs = hingeAtStart ? o.s0 + FRAME - 6 : o.s1 - FRAME + 6;
      const ls = hingeAtStart ? o.s1 - FRAME - CLEAR - 60 : o.s0 + FRAME + CLEAR + 60;
      const hp = (s: number): P2 => onWall(wall, s, 0);
      const hinges: Shape[] = [o.z0 + 200, (o.z0 + o.z1) / 2, o.z1 - 250].map((z) => cyl(hp(hs).x, hp(hs).y, base + z, 6, 90, "z"));
      const lockCentre = onWall(wall, ls, 0);
      const handle: Shape[] = [wb(wall, base, ls - 70, ls + 70, LEAF / 2, LEAF / 2 + 8, o.z0 + 1000, o.z0 + 1030), wb(wall, base, ls - 70, ls + 70, -LEAF / 2 - 8, -LEAF / 2, o.z0 + 1000, o.z0 + 1030), cyl(lockCentre.x, lockCentre.y, base + o.z0 + 1000, 8, 40, "z")];
      const hw = ctx.add({
        id: `${id}:hardware`, name: `${label} — hinges and lock`, kind: "door-hardware", category: "openings", subcategory: "Hardware", stage: 14, level, room, grid, layer: "frame", materialId: "hardware", shapes: [...hinges, ...handle], repeated: { noun: "part" },
        source, sourceRef: o.id, parentId: leaf.id, explode: { layerIndex: 4, dir: explodeDir }, note: "Hinges, lock and handle are hardware, counted separately from the leaf.",
      });
      addQuantity(ctx, hw, { workItem: "openings.door-hardware", description: "Door hardware sets (3 hinges, lock, handle)", section: "I", unit: "set", value: 1, formula: "1 set per leaf", inputs: { hinges: 3 }, status: "assumed" });
    } else {
      const gw = w - 2 * FRAME - 2 * SASH;
      const gh = h - 2 * FRAME - 2 * SASH;
      const sash: Shape[] = [
        wb(wall, base, o.s0 + FRAME, o.s0 + FRAME + SASH, -15, 15, o.z0 + FRAME, o.z1 - FRAME), wb(wall, base, o.s1 - FRAME - SASH, o.s1 - FRAME, -15, 15, o.z0 + FRAME, o.z1 - FRAME),
        wb(wall, base, o.s0 + FRAME + SASH, o.s1 - FRAME - SASH, -15, 15, o.z1 - FRAME - SASH, o.z1 - FRAME), wb(wall, base, o.s0 + FRAME + SASH, o.s1 - FRAME - SASH, -15, 15, o.z0 + FRAME, o.z0 + FRAME + SASH),
      ];
      const sashComp = ctx.add({
        id: `${id}:sash`, name: `${label} — sash`, kind: "window-frame", category: "openings", subcategory: "Sashes", stage: 14, level, room, grid, layer: "frame", materialId: "aluminium", shapes: sash, repeated: { noun: "member" },
        source, sourceRef: o.id, parentId: frameComp.id, explode: { layerIndex: 2, dir: explodeDir }, note: "The moving part of the window that holds the glass.",
      });
      addQuantity(ctx, sashComp, { workItem: "openings.window-sash", description: "Window sashes", section: "I", unit: "piece", value: 1, formula: "1 sash per window", inputs: { width: w - 2 * FRAME, height: h - 2 * FRAME }, status: "calculated" });
      const glass = ctx.add({
        id: `${id}:glass`, name: `${label} — glass`, kind: "window-glass", category: "openings", subcategory: "Glazing", stage: 14, level, room, grid, layer: "glass", materialId: "glass", shapes: [wb(wall, base, o.s0 + FRAME + SASH, o.s1 - FRAME - SASH, -GLASS / 2, GLASS / 2, o.z0 + FRAME + SASH, o.z1 - FRAME - SASH)],
        source, sourceRef: o.id, parentId: sashComp.id, explode: { layerIndex: 3, dir: explodeDir }, dims: { width: { value: gw, unit: "mm", status: "calculated" }, height: { value: gh, unit: "mm", status: "calculated" }, area: { value: round(gw * gh * 1e-6, 3), unit: "m²", status: "calculated" } },
        note: "Set on setting blocks with seals. Safety glass is required in some positions by regulation.",
      });
      addQuantity(ctx, glass, { workItem: "openings.glass", description: `Glass ${GLASS} mm (example)`, section: "I", unit: "m²", value: round(gw * gh * 1e-6, 3), formula: `${f3(gw / 1000)} m × ${f3(gh / 1000)} m`, inputs: { width: gw, height: gh, thickness: GLASS }, status: "calculated" }, { allowance: { rule: "Cutting and breakage (example assumption)", percent: 5 } });
      const handleS = o.s0 + FRAME + SASH + 60;
      const hw = ctx.add({
        id: `${id}:hardware`, name: `${label} — handle and stay`, kind: "door-hardware", category: "openings", subcategory: "Hardware", stage: 14, level, room, grid, layer: "frame", materialId: "hardware",
        shapes: [wb(wall, base, handleS - 25, handleS + 25, 15, 24, (o.z0 + o.z1) / 2 - 60, (o.z0 + o.z1) / 2 + 60), wb(wall, base, o.s1 - FRAME - 160, o.s1 - FRAME - 40, 15, 20, o.z0 + FRAME + 10, o.z0 + FRAME + 24)], repeated: { noun: "part" },
        source, sourceRef: o.id, parentId: sashComp.id, explode: { layerIndex: 4, dir: explodeDir },
      });
      addQuantity(ctx, hw, { workItem: "openings.window-hardware", description: "Window hardware sets", section: "I", unit: "set", value: 1, formula: "1 set per window", inputs: { parts: 2 }, status: "assumed" });
    }
  }

  // Perimeter seal on the outer and inner faces.
  const sealShapes: Shape[] = [];
  for (const sign of [-1, 1]) {
    const n0 = sign < 0 ? -half : half - SEAL;
    const n1 = sign < 0 ? -half + SEAL : half;
    sealShapes.push(
      wb(wall, base, o.s0, o.s0 + 4, n0, n1, o.z0, o.z1), wb(wall, base, o.s1 - 4, o.s1, n0, n1, o.z0, o.z1),
      wb(wall, base, o.s0, o.s1, n0, n1, o.z1 - 4, o.z1), ...(isWindow ? [wb(wall, base, o.s0, o.s1, n0, n1, o.z0, o.z0 + 4)] : []),
    );
  }
  const seal = ctx.add({
    id: `${id}:seal`, name: `${label} — perimeter seal`, kind: "window-seal", category: "openings", subcategory: "Seals", stage: 14, level, room, grid, layer: "frame", materialId: "seal", shapes: sealShapes, repeated: { noun: "bead" },
    source, sourceRef: o.id, parentId: frameComp.id, explode: { layerIndex: 5, dir: explodeDir }, note: "A continuous bead of sealant keeps water and air out at the joint between frame and wall.",
  });
  const sealLen = (isWindow ? 2 * (w + h) : 2 * h + w) * 2;
  addQuantity(ctx, seal, { workItem: "openings.seal", description: "Perimeter sealant (both faces)", section: "I", unit: "m", value: round(sealLen / 1000, 3), formula: `2 faces × frame perimeter ${f3((sealLen / 2) / 1000)} m`, inputs: { perimeter: sealLen / 2 }, status: "calculated" }, { allowance: { rule: "Waste (example assumption)", percent: 10 } });

  // Window sill.
  if (isWindow) {
    // A sill projects outwards past the wall face.
    const a = out > 0 ? -half : -half - SILL_PROJECTION;
    const b = out > 0 ? half + SILL_PROJECTION : half;
    const sillShapes: Shape[] = [wb(wall, base, o.s0 - 60, o.s1 + 60, a, b, o.z0 - SILL_DROP, o.z0)];
    const sillLen = w + 120;
    const sill = ctx.add({
      id: `${id}:sill`, name: `${label} — sill`, kind: "window-sill", category: "openings", subcategory: "Sills", stage: 14, level, room, grid, layer: "frame", materialId: "sill", shapes: sillShapes,
      source, sourceRef: o.id, parentId: frameComp.id, explode: { layerIndex: 6, dir: v3(0, 0, -1) }, note: "Projects past the wall face and is sloped with a drip, so water falls clear of the wall.",
    });
    addQuantity(ctx, sill, { workItem: "openings.sill", description: "Window sills", section: "I", unit: "m", value: round(sillLen / 1000, 3), formula: `opening ${f3(w / 1000)} m + 2 × 60 mm bearing`, inputs: { length: sillLen }, status: "calculated" });
  }
}
