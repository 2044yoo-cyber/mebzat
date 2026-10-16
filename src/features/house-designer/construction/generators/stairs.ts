import { ASSUME, UP, dim, type Ctx } from "../context";
import { alongLine, box, boxAt, cyl, pointInPolygon, polygonArea, polygonBounds, prism, rectPoly, v3, type P2, type Shape } from "../geometry";
import { addQuantity, concreteQuantity, f2, f3, formworkQuantity, rebarQuantity, round } from "../helpers";
import { onPlan, stairGeometry, stairParams } from "../../services/stair-geometry";
import { offsetPolygon, clipToRegion } from "../region";
import { slabCastOutline } from "../slab-cast";
import { flightBars, flightForm, flightProps, flightShapes, flightSideArea, flightSoffitArea, straightFlight } from "./stair-flight";
import { lattice } from "./slab-steel";
import { stairOpenings as slabOpenings } from "../rooms";

/** Stage 6: stair flights and landings, slab openings, edge steel and protection. */

const WAIST = 150;

type Piece = { points: P2[]; level: number; landing: boolean };

export function generateStairs(ctx: Ctx): void {
  const approved = ctx.approved;
  for (const stair of ctx.project.stairs) {
    const level = ctx.level(stair.levelId);
    if (!level) continue;
    const params = stairParams(stair);
    const geo = stairGeometry(params);
    const riser = geo.riserHeight;
    const above = ctx.levels[level.index + 1];
    const pieces: Piece[] = geo.pieces.map((piece) => ({ points: piece.points.map((p) => onPlan(stair, p)), level: piece.level, landing: piece.landing }));
    const sid = stair.id.replace(/[^\w]+/g, "-");
    const title = `Stair ${level.name} → ${above?.name ?? "roof"}`;
    // Group into flights: a landing ends one flight and starts the next.
    const flights: Piece[][] = [[]];
    const landings: Piece[] = [];
    for (const piece of pieces.slice().sort((a, b) => a.level - b.level)) {
      if (piece.landing) { landings.push(piece); flights.push([]); } else flights[flights.length - 1]!.push(piece);
    }
    const flightsNonEmpty = flights.filter((f) => f.length > 0);
    const topOf = (piece: Piece) => stair.elevation + piece.level * riser;
    const body = (piece: Piece, thickness: number) => prism(piece.points, Math.max(stair.elevation, topOf(piece) - thickness), topOf(piece));
    const centroidOf = (piece: Piece): P2 => ({ x: piece.points.reduce((s, p) => s + p.x, 0) / piece.points.length, y: piece.points.reduce((s, p) => s + p.y, 0) / piece.points.length });

    const finishPlates: Shape[] = [];
    const formShapes: Shape[] = [];
    const propShapes: Shape[] = [];
    const formParts: { area: number; text: string }[] = [];
    const runOf = (flight: Piece[]) => Math.hypot(centroidOf(flight.at(-1)!).x - centroidOf(flight[0]!).x, centroidOf(flight.at(-1)!).y - centroidOf(flight[0]!).y) + params.treadDepth;
    flightsNonEmpty.forEach((flight, fi) => {
      // A straight flight is cast as a waist slab with steps on it; winders and curves are drawn as separate steps.
      // What the top of the flight runs into: the underside of the landing, or of the floor above when it is the last flight.
      const onward = pieces.find((p) => p.level === flight[flight.length - 1]!.level + 1);
      const zJoin = onward ? (onward.landing ? topOf(onward) - (WAIST + 50) : null) : level.soffitZ;
      const straight = straightFlight(flight, topOf, riser, params.treadDepth, params.stairWidth, WAIST, zJoin);
      const shapes: Shape[] = straight ? flightShapes(straight) : flight.map((piece) => body(piece, riser + WAIST));
      const concrete = ctx.add({
        id: `stairs:${sid}:flight-${fi + 1}`, name: `${title} — flight ${fi + 1}`, kind: "stair-flight", category: "stairs", subcategory: "Flights", stage: 6, level, layer: "concrete", materialId: "concrete",
        shapes, ...(straight ? {} : { repeated: { noun: "step" } }), source: "project", sourceRef: stair.id, grid: null, pour: 2 + 3 * level.index + 1,
        dims: { length: dim(round(straight ? Math.hypot(straight.treads * straight.going, straight.treads * straight.riser) : runOf(flight), 0), "mm", "calculated"), width: dim(params.stairWidth, "mm", "measured"), height: dim(round(riser, 1), "mm", "calculated", "Riser height"), thickness: dim(WAIST, "mm", "assumed", "Waist thickness is an example value") },
        explode: { layerIndex: 0, dir: UP },
        label: fi === 0 && level.index === 0 ? { text: "Stair flight", anchor: v3(centroidOf(flight[0]!).x, centroidOf(flight[0]!).y, topOf(flight[0]!) + 300) } : undefined,
      });
      if (straight) {
        const side = flightSideArea(straight);
        const v = side * (params.stairWidth / 1000);
        concreteQuantity(ctx, concrete, "concrete.stair", "Stair flights (waist slab and steps)", v, `side area ${f3(side)} m² (steps on a ${WAIST} mm waist, ${flight.length} treads) × width ${f3(params.stairWidth / 1000)} m = ${f3(v)} m³`, { treads: flight.length, riser: round(riser, 1), going: params.treadDepth, waist: WAIST, width: params.stairWidth }, "calculated", ["The waist (150 mm, measured at right angles to the slope) is an example value; the structural design sets it.", "The concrete is the exact outline of the steps and the sloping soffit."]);
      } else {
        const v = flight.reduce((sum, piece) => sum + polygonArea(piece.points) * (Math.min(riser + WAIST, topOf(piece) - stair.elevation)), 0) * 1e-9;
        concreteQuantity(ctx, concrete, "concrete.stair", "Stair flights (stepped idealisation)", v, `Σ tread area × (riser ${f3(riser / 1000)} + waist ${f3(WAIST / 1000)}) over ${flight.length} treads = ${f3(v)} m³`, { treads: flight.length, riser: round(riser, 1), waist: WAIST }, "review", ["Each step is a block one riser plus the waist deep: the real stair has a sloping soffit, so this slightly overstates the concrete.", "This flight is not straight, so its steps are drawn one by one. Confirm against the structural design."]);
      }
      flight.forEach((piece) => {
        finishPlates.push(prism(piece.points, topOf(piece), topOf(piece) + 15));
      });
      // Reinforcement: the main bars along the waist, tied by bars across, for a straight flight.
      const bars = straight ? flightBars(straight, ASSUME.rebarCover, 12, 150) : [];
      if (bars.length) {
        const rb = ctx.add({
          id: `stairs:${sid}:flight-${fi + 1}:bars`, name: `${title} — flight ${fi + 1} reinforcement (schematic)`, kind: "stair-rebar", category: "stairs", subcategory: "Reinforcement", stage: 6, level, layer: "reinforcement", materialId: "steel-bar",
          shapes: bars, repeated: { noun: "bar" }, source: "schematic", parentId: concrete.id, connectedIds: [concrete.id], explode: { layerIndex: 1, dir: UP },
          note: "Main bars lie along the waist a cover above the soffit, with bars across to hold them. Size and number come from the design.",
        });
        rebarQuantity(ctx, rb, "Stair flight reinforcement", approved);
      }
      // Formwork and props: the deck follows the sloping soffit of a straight flight; any other flight is formed under each step.
      if (straight) {
        formShapes.push(...flightForm(straight, 18));
        propShapes.push(...flightProps(straight, stair.elevation, 18));
        const area = flightSoffitArea(straight) + 2 * flightSideArea(straight);
        formParts.push({ area, text: `flight ${fi + 1}: soffit ${f2(flightSoffitArea(straight))} m² along the slope + two sides ${f2(2 * flightSideArea(straight))} m²` });
      } else {
        for (const piece of flight) formShapes.push(prism(piece.points, Math.max(stair.elevation, topOf(piece) - riser - WAIST) - 18, Math.max(stair.elevation, topOf(piece) - riser - WAIST)));
        const b0 = polygonBounds(flight[0]!.points);
        for (const x of [b0.minX + 150, b0.maxX - 150]) for (const y of [b0.minY + 150, b0.maxY - 150]) propShapes.push(cyl(x, y, (stair.elevation + topOf(flight[0]!) - WAIST) / 2, 30, Math.max(100, topOf(flight[0]!) - WAIST - stair.elevation), "z"));
        const area = flight.reduce((sum, piece) => sum + polygonArea(piece.points), 0) * 1e-6;
        formParts.push({ area, text: `flight ${fi + 1}: plan area of its steps ${f2(area)} m² (soffit drawn stepped)` });
      }
    });
    landings.forEach((piece, li) => {
      const area = polygonArea(piece.points);
      const concrete = ctx.add({
        id: `stairs:${sid}:landing-${li + 1}`, name: `${title} — landing`, kind: "stair-landing", category: "stairs", subcategory: "Landings", stage: 6, level, layer: "concrete", materialId: "concrete",
        shapes: [body(piece, WAIST + 50)], source: "project", sourceRef: stair.id, pour: 2 + 3 * level.index + 1, explode: { layerIndex: 0, dir: UP },
        dims: { area: dim(round(area * 1e-6, 2), "m²", "calculated"), thickness: dim(WAIST + 50, "mm", "assumed") },
      });
      const v = area * (WAIST + 50) * 1e-9;
      concreteQuantity(ctx, concrete, "concrete.stair", "Stair landings", v, `${f2(area * 1e-6)} m² × ${f3((WAIST + 50) / 1000)} m = ${f3(v)} m³`, { area: round(area * 1e-6, 3), thickness: WAIST + 50 }, "review", ["Landing slab thickness is an example value."]);
      // A landing is a small slab: bars each way near its underside, stopping a cover short of its edges.
      const bottomZ = topOf(piece) - (WAIST + 50);
      const region = offsetPolygon(piece.points, -ASSUME.rebarCover);
      const landingBars = [...lattice(region, [], "x", 150, bottomZ + ASSUME.rebarCover + 6, 6), ...lattice(region, [], "y", 150, bottomZ + ASSUME.rebarCover + 18, 6)];
      if (landingBars.length) {
        const lb = ctx.add({
          id: `stairs:${sid}:landing-${li + 1}:bars`, name: `${title} — landing reinforcement (schematic)`, kind: "stair-rebar", category: "stairs", subcategory: "Reinforcement", stage: 6, level, layer: "reinforcement", materialId: "steel-bar",
          shapes: landingBars, repeated: { noun: "bar" }, source: "schematic", parentId: concrete.id, connectedIds: [concrete.id], explode: { layerIndex: 1, dir: UP },
        });
        rebarQuantity(ctx, lb, "Stair landing reinforcement", approved);
      }
      // Deck under the landing, and a prop at each corner.
      formShapes.push(prism(piece.points, bottomZ - 18, bottomZ));
      const bl = polygonBounds(piece.points);
      for (const x of [bl.minX + 150, bl.maxX - 150]) for (const y of [bl.minY + 150, bl.maxY - 150]) propShapes.push(cyl(x, y, (stair.elevation + bottomZ - 18) / 2, 30, Math.max(100, bottomZ - 18 - stair.elevation), "z"));
      formParts.push({ area: area * 1e-6, text: `landing ${li + 1}: ${f2(area * 1e-6)} m²` });
    });
    // Finishes on treads and risers.
    const treadsArea = pieces.reduce((s, p) => s + polygonArea(p.points), 0) * 1e-6;
    const risers: Shape[] = [];
    const ordered = pieces.slice().sort((a, b) => a.level - b.level);
    ordered.forEach((piece, i) => {
      if (piece.landing && i > 0 && false) return;
      const prev = ordered[i - 1];
      const c = centroidOf(piece);
      const b = polygonBounds(piece.points);
      const target = prev ? centroidOf(prev) : { x: c.x, y: c.y + 1 };
      const dxn = target.x - c.x;
      const dyn = target.y - c.y;
      if (Math.abs(dyn) >= Math.abs(dxn)) risers.push(box(c.x, dyn >= 0 ? b.minY + 7.5 : b.maxY - 7.5, topOf(piece) - riser / 2, b.maxX - b.minX, 15, riser));
      else risers.push(box(dxn >= 0 ? b.minX + 7.5 : b.maxX - 7.5, c.y, topOf(piece) - riser / 2, 15, b.maxY - b.minY, riser));
    });
    const fin = ctx.add({
      id: `stairs:${sid}:finish`, name: `${title} — tread and riser finish`, kind: "stair-finish", category: "stairs", subcategory: "Finishes", stage: 6, level, layer: "tile", materialId: ctx.options.floorFinish === "stone" ? "tile-stone" : "tile-porcelain",
      shapes: [...finishPlates, ...risers], repeated: { noun: "tile" }, source: "schematic", parentId: `stairs:${sid}:flight-1`, explode: { layerIndex: 2, dir: UP },
      dims: { area: dim(round(treadsArea, 2), "m²", "calculated", "Treads and landings; riser faces are added in the quantity") },
    });
    const riserFace = (pieces.length) * (params.stairWidth) * riser * 1e-6;
    addQuantity(ctx, fin, { workItem: "flooring.stair", description: "Stair tread and riser finish", section: "K", unit: "m²", value: round(treadsArea + riserFace, 3), formula: `treads ${f2(treadsArea)} m² + risers ${pieces.length} × ${f3(params.stairWidth / 1000)} × ${f3(riser / 1000)} = ${f2(treadsArea + riserFace)} m²`, inputs: { treads: round(treadsArea, 3), risers: pieces.length, width: params.stairWidth }, status: "calculated" }, { allowance: { rule: "Tile cutting waste (example)", percent: ctx.rules.allowances.tiles }, assumptions: ["Riser faces taken as one flight width wide."] });

    // Handrail on the inner side of each flight and balustrade round the opening at the upper floor.
    const hand: Shape[] = [];
    const post: Shape[] = [];
    flightsNonEmpty.forEach((flight) => {
      const first = centroidOf(flight[0]!);
      const last = centroidOf(flight[flight.length - 1]!);
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      if (flight.length < 2) return;
      const mid = { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
      const run = Math.hypot(dx, dy);
      const rise = (flight.length - 1) * riser;
      const angle = Math.atan2(rise, run);
      const len = Math.hypot(run, rise);
      const z = (topOf(flight[0]!) + topOf(flight.at(-1)!)) / 2 + 900;
      // The side toward the other flight (the stair's centre line).
      const sideToCentre = Math.abs(dx) < 1 ? Math.sign(stair.x - mid.x) || 1 : Math.sign(stair.y - mid.y) || 1;
      if (Math.abs(dx) < 1) {
        const x = mid.x + sideToCentre * (params.stairWidth / 2 - 30);
        const rail = box(x, mid.y, z, 50, len, 40);
        (rail as { rx?: number }).rx = (dy >= 0 ? 1 : -1) * angle;
        hand.push(rail);
        for (let k = 0; k < flight.length; k += 3) { const c = centroidOf(flight[k]!); post.push(box(x, c.y, topOf(flight[k]!) + 450, 40, 40, 900)); }
      } else if (Math.abs(dy) < 1) {
        const y = mid.y + sideToCentre * (params.stairWidth / 2 - 30);
        const rail = box(mid.x, y, z, len, 50, 40);
        (rail as { ry?: number }).ry = -(dx >= 0 ? 1 : -1) * angle;
        hand.push(rail);
        for (let k = 0; k < flight.length; k += 3) { const c = centroidOf(flight[k]!); post.push(box(c.x, y, topOf(flight[k]!) + 450, 40, 40, 900)); }
      }
    });
    if (hand.length) {
      const hr = ctx.add({
        id: `stairs:${sid}:handrail`, name: `${title} — handrail`, kind: "handrail", category: "stairs", subcategory: "Handrail & balustrade", stage: 6, level, layer: "frame", materialId: "railing",
        shapes: hand, source: "schematic", parentId: `stairs:${sid}:flight-1`, explode: { layerIndex: 3, dir: UP }, dims: { height: dim(900, "mm", "assumed", "Height and strength come from the regulations") },
      });
      addQuantity(ctx, hr, { workItem: "metalwork.handrail", description: "Stair handrail", section: "I", unit: "m", value: round(hand.reduce((s, h) => s + (h.t === "box" ? Math.max(h.s.x, h.s.y) : 0), 0) / 1000, 2), formula: "Σ rail lengths along the flights", inputs: { rails: hand.length }, status: "assumed" }, { assumptions: ["Rail height 900 mm is an example."] });
      const posts = ctx.add({
        id: `stairs:${sid}:balustrade-posts`, name: `${title} — balustrade posts`, kind: "balustrade", category: "stairs", subcategory: "Handrail & balustrade", stage: 6, level, layer: "frame", materialId: "railing",
        shapes: post, repeated: { noun: "post" }, source: "schematic", parentId: `stairs:${sid}:flight-1`, explode: { layerIndex: 3, dir: UP },
      });
      addQuantity(ctx, posts, { workItem: "metalwork.balustrade-post", description: "Stair balustrade posts", section: "I", unit: "piece", value: post.length, formula: `${post.length} posts, one in every third step along the handrail`, inputs: { posts: post.length }, status: "assumed" }, { assumptions: ["A post every third step is an example."] });
    }
    // Stair formwork and props under the flights and landings (until struck).
    if (propShapes.length) ctx.add({ id: `stairs:${sid}:props`, name: `${title} — props and formwork`, kind: "prop", category: "stairs", subcategory: "Formwork & props", stage: 6, removedAfter: 6, level, layer: "props", materialId: "prop", shapes: propShapes, repeated: { noun: "prop" }, source: "schematic", explode: { layerIndex: 4, dir: UP } });
    const form = ctx.add({
      id: `stairs:${sid}:form`, name: `${title} — formwork`, kind: "slab-formwork", category: "stairs", subcategory: "Formwork & props", stage: 6, removedAfter: 6, level, layer: "formwork", materialId: "formwork",
      shapes: formShapes, source: "schematic", explode: { layerIndex: 3, dir: UP },
    });
    const formArea = formParts.reduce((sum, part) => sum + part.area, 0);
    formworkQuantity(ctx, form, "formwork.stair", "Formwork to stair flights and landings", formArea, formParts.map((part) => part.text).join("; ") + ` = ${f2(formArea)} m²`, { area: round(formArea, 3) }, formParts.every((part) => !/stepped/.test(part.text)) ? "calculated" : "review", ["The soffit of a straight flight is measured along the slope, with its two sides; a landing by its plan area."]);
  }

  // Openings in each slab: trimmer bars, edge bars and edge protection while the slab is open.
  for (const level of ctx.levels) {
    const holes = slabOpenings(ctx, level.index);
    holes.forEach((h, i) => {
      const slab = level.index; // the slab under this level
      const above = ctx.levels[level.index - 1];
      if (!above) return;
      const z0 = above.soffitZ;
      const z1 = level.floorZ;
      const zm = (z0 + z1) / 2;
      const trim: Shape[] = [];
      const t = 12;
      // Two bars along each side of the opening, reaching 500 mm past its ends but stopping short of the slab edge, so no bar is left in the air.
      const region = offsetPolygon(slabCastOutline(ctx, above.levelId), -ASSUME.rebarCover);
      const along = (a: P2, b: P2, z: number) => {
        for (const [t0, t1] of clipToRegion(a, b, region)) {
          const p = { x: a.x + (b.x - a.x) * t0, y: a.y + (b.y - a.y) * t0 };
          const q = { x: a.x + (b.x - a.x) * t1, y: a.y + (b.y - a.y) * t1 };
          const len = Math.hypot(q.x - p.x, q.y - p.y);
          if (len > 50) trim.push(Math.abs(q.y - p.y) < 1e-6 ? cyl((p.x + q.x) / 2, p.y, z, t / 2, len, "x") : cyl(p.x, (p.y + q.y) / 2, z, t / 2, len, "y"));
        }
      };
      for (const y of [h.y0 - 50, h.y1 + 50]) for (const z of [zm - 15, zm + 15]) along({ x: h.x0 - 500, y }, { x: h.x1 + 500, y }, z);
      for (const x of [h.x0 - 50, h.x1 + 50]) for (const z of [zm - 15, zm + 15]) along({ x, y: h.y0 - 500 }, { x, y: h.y1 + 500 }, z);
      // The bars belong to the slab the opening is cut in: the part of the floor slab that holds its centre.
      const slabHere = ctx.components.find((c) => c.kind === "slab" && c.id.startsWith(`frame:slab:${level.levelId}:`) && c.shapes.some((sh) => sh.t === "prism" && pointInPolygon({ x: (h.x0 + h.x1) / 2, y: (h.y0 + h.y1) / 2 }, sh.poly)));
      const tr = ctx.add({
        id: `stairs:opening:${level.levelId}:${i + 1}:trimmers`, name: `Stair opening trimmer bars (schematic) — ${level.name} slab`, kind: "slab-edge-bars", category: "frame", subcategory: "Reinforcement", stage: 6, level: above, layer: "reinforcement", materialId: "steel-bar",
        shapes: trim, repeated: { noun: "bar" }, source: "schematic", sourceRef: h.id, parentId: slabHere?.id ?? null, explode: { layerIndex: 2, dir: UP }, note: "Extra bars round an opening where specified; none is invented here.",
      });
      rebarQuantity(ctx, tr, "Slab opening trimmer bars", approved);
      // Edge protection round three sides while the opening is open.
      const post: Shape[] = [];
      const rails: Shape[] = [];
      const edges: [P2, P2][] = [[{ x: h.x0, y: h.y0 }, { x: h.x1, y: h.y0 }], [{ x: h.x1, y: h.y0 }, { x: h.x1, y: h.y1 }], [{ x: h.x1, y: h.y1 }, { x: h.x0, y: h.y1 }], [{ x: h.x0, y: h.y1 }, { x: h.x0, y: h.y0 }]];
      for (const [a, b] of edges) {
        rails.push(alongLine(a, b, 40, z1 + 1000, z1 + 1040), alongLine(a, b, 40, z1 + 500, z1 + 540));
        const n = Math.max(1, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / 1500));
        for (let k = 0; k <= n; k += 1) post.push(boxAt(a.x + ((b.x - a.x) * k) / n - 25, a.y + ((b.y - a.y) * k) / n - 25, z1, 50, 50, 1050));
      }
      ctx.add({
        id: `stairs:opening:${level.levelId}:${i + 1}:protection`, name: `Edge protection round the stair opening — ${level.name}`, kind: "balustrade", category: "stairs", subcategory: "Safety", stage: 6, removedAfter: 6, level, layer: "temporary", materialId: "temporary",
        shapes: [...rails, ...post], source: "schematic", sourceRef: h.id, explode: { layerIndex: 5, dir: UP }, note: "Temporary guard rails while the opening is open and before the permanent balustrade is fixed.",
      });
      void slab; void rectPoly; void prism;
    });
  }
}
