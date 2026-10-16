/**
 * The cantilever balconies in the construction model: a balcony is the floor slab carried out past
 * the edge beam and poured in one with it, with its steel, formwork and props at stage 5, its waterproofing,
 * screed and tiles at stage 13, and its render, railing and glass at stage 18.
 *
 *   npx tsx scripts/construction_balcony_check.ts
 *
 * Expected numbers are worked out here by hand from the balcony's own width and depth, the wall it comes out
 * of and the size of the frame: the reach past the slab edge, the volume, the formwork area, how far the top
 * bars run back over the beam, the length of railing. Every balcony of every building, at its example size
 * and at 200 m² a floor.
 */
import assert from "node:assert/strict";

import { BUILDING_TEMPLATES, buildBuilding, configForArea, defaultConfig, type BuiltBuilding } from "../src/features/house-designer/construction/building-config";
import { ASSUME } from "../src/features/house-designer/construction/context";
import { buildConstructionModel } from "../src/features/house-designer/construction/model";
import { auditReinforcement } from "../src/features/house-designer/construction/reinforcement-audit";
import { DEFAULT_OPTIONS, DEFAULT_RULES, type ComponentRecord, type ConstructionModel } from "../src/features/house-designer/construction/types";
import type { Shape } from "../src/features/house-designer/construction/geometry";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };
const near = (actual: number, expected: number, message: string, tolerance = 1e-6) => { assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} is not ${expected} (±${tolerance})`); checks += 1; };

type Cyl = Extract<Shape, { t: "cyl" }>;
type Prism = Extract<Shape, { t: "prism" }>;
type Box = Extract<Shape, { t: "box" }>;

const KERB = { width: 100, height: 150 };
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const modelOf = (building: BuiltBuilding): ConstructionModel => buildConstructionModel(building.project, { ...DEFAULT_OPTIONS, ...building.options }, DEFAULT_RULES);
/** The number of bars `spaced` puts between two lines at a spacing: as many as fit, spread evenly, one more than the gaps. */
const lines = (from: number, to: number, spacing: number) => (to <= from ? 1 : Math.max(1, Math.floor((to - from) / spacing)) + 1);
const quantity = (c: ComponentRecord, workItem: string, description?: string) => c.quantities.find((q) => q.workItem === workItem && (description === undefined || q.description === description))!;

const sizes = BUILDING_TEMPLATES.flatMap((template) => [
  { name: `${template} at its example size`, building: buildBuilding(defaultConfig(template)) },
  { name: `${template} at 200 m² a floor`, building: buildBuilding(configForArea(defaultConfig(template), 200).config) },
]);

let balconiesLooked = 0;
for (const { name, building } of sizes) {
  const { project, params } = building;
  const model = modelOf(building);
  const byId = (id: string) => model.components.find((c) => c.id === id);
  const get = (id: string) => { const c = byId(id); assert.ok(c, `${name}: ${id} is in the model`); return c!; };
  ok(model.components.filter((c) => c.kind === "balcony").length >= project.balconies.length, `${name}: a balcony slab for each balcony in the project`);
  equal(new Set(model.components.filter((c) => c.kind === "balcony").map((c) => c.sourceRef)).size, project.balconies.length, `${name}: and none for anything else`);
  ok(!model.components.some((c) => c.id.startsWith("ext:balcony") && c.layer === "concrete"), `${name}: the loose balcony box that used to be added at stage 18 is gone`);
  if (!project.balconies.length) continue;

  for (const balcony of project.balconies) {
    balconiesLooked += 1;
    const id = slug(balcony.id);
    const label = `${name}, ${balcony.id}`;
    const wall = project.walls.find((w) => w.id === balcony.wallId)!;
    ok(wall.start.y === 0 && wall.end.y === 0, `${label}: it comes out of a wall along the front, y = 0, so out is toward −y`);
    // How far out each part reaches, from the wall's centre line: the slab as cast, the face of the edge beam, the tip.
    const edge = Math.max(params.columnSize, params.beamWidth) / 2;
    const beamHalf = params.beamWidth / 2;
    const tip = wall.thickness / 2 + balcony.depth;
    const reach = tip - edge;
    const top = balcony.elevation;
    const bottom = top - balcony.thickness;
    const x0 = balcony.x - balcony.width / 2;
    const x1 = balcony.x + balcony.width / 2;
    near(balcony.elevation, project.levels[1]!.elevation, `${label}: the balcony is at the level of the floor it comes off`);

    // --- The concrete: poured with the floor slab, flush with it, from where the slab stops to the tip ----------------------------------
    // Where the floor slab is poured in two, at the grid line nearest the middle of the plan (the eastern one when two are as near), a balcony across that line is poured in two parts.
    const gridXs = project.structuralGrid.filter((g) => g.levelId === project.levels[0]!.id && g.axis === "x").map((g) => g.position);
    const middle = (Math.min(...project.levels[0]!.plan!.corners.map((c) => c.x)) + Math.max(...project.levels[0]!.plan!.corners.map((c) => c.x))) / 2;
    const cutAt = gridXs.reduce((best, x) => (Math.abs(x - middle) < Math.abs(best - middle) - 1e-9 || (Math.abs(Math.abs(x - middle) - Math.abs(best - middle)) < 1e-9 && x > best) ? x : best), gridXs[0]!);
    const straddles = x0 < cutAt - 1 && x1 > cutAt + 1;
    const parts = model.components.filter((c) => c.kind === "balcony" && c.sourceRef === balcony.id);
    equal(parts.length, straddles ? 2 : 1, `${label}: ${straddles ? `the balcony is over the pour joint at x = ${cutAt}, so it is poured in two parts` : "one balcony slab"}`);
    equal(parts[0]!.id, `frame:balcony:${id}`, `${label}: the first part is the balcony's own id`);
    for (const part of parts) {
      equal([part.kind, part.stage, part.layer, part.category], ["balcony", 5, "concrete", "frame"], `${label}: ${part.id} is cast at stage 5, with the frame`);
      const parent = byId(part.parentId ?? "");
      ok(parent && parent.kind === "slab" && parent.stage === 5, `${label}: it is part of a floor slab (${part.parentId})`);
      equal(part.pour, parent!.pour, `${label}: poured with the part of the floor slab it grows out of, in the same pour`);
      equal(part.storeyIndex, 0, `${label}: it belongs to the storey whose frame it is cast with, the one below the floor it carries`);
      const deck = part.shapes[0] as Prism;
      near(deck.z1, top, `${label}: the top of the balcony is the top of the floor`);
      near(deck.z0, bottom, `${label}: and its underside is its own thickness below that`);
      const parentSlab = parent!.shapes[0] as Prism;
      near(parentSlab.z1, deck.z1, `${label}: flush with the floor slab it comes out of`);
      ok(deck.z0 >= parentSlab.z0 - 1e-6, `${label}: no thicker than the floor slab (${parentSlab.z1 - parentSlab.z0} mm), so its soffit is not below the soffit of the slab`);
      near(Math.min(...parentSlab.poly.map((p) => p.y)), -edge, `${label}: and the floor slab stops where the balcony starts: no gap and no overlap`, 1e-6);
      ok(deck.poly.every((p) => (parent!.id.endsWith("west-zone") ? p.x <= cutAt + 1e-6 : parent!.id.endsWith("east-zone") ? p.x >= cutAt - 1e-6 : true)), `${label}: each part lies inside the zone of the slab it is poured with`);
    }
    const decks = parts.map((part) => part.shapes[0] as Prism);
    const ys = decks.flatMap((deck) => deck.poly.map((p) => p.y)); const xs = decks.flatMap((deck) => deck.poly.map((p) => p.x));
    equal([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)].map(Math.round), [x0, x1, -tip, -edge].map(Math.round), `${label}: in plan the deck is the balcony's width, from the edge of the slab as cast (${edge} mm out from the wall's centre line) to the tip (${tip} mm)`);
    const upstands = parts.flatMap((part) => part.shapes.slice(1) as Prism[]);
    ok(upstands.length >= 3 && upstands.every((u) => Math.abs(u.z0 - top) < 1e-9 && Math.abs(u.z1 - (top + KERB.height)) < 1e-9), `${label}: an upstand along the tip and each side (${upstands.length} pieces), each 150 mm high, standing on the slab`);
    near(upstands.reduce((sum, u) => sum + Math.abs(u.poly.reduce((a, p, i) => a + (p.x * u.poly[(i + 1) % u.poly.length]!.y - u.poly[(i + 1) % u.poly.length]!.x * p.y), 0)) / 2, 0), (balcony.width + 2 * (reach - KERB.width)) * KERB.width, `${label}: with the plan area of the three upstands, whole between the parts`, 1e-3);

    // Volume: the deck, and the upstand, each counted once, however many parts it is poured in.
    const slabVolume = (balcony.width * reach * balcony.thickness) * 1e-9;
    const kerbLength = balcony.width + 2 * (reach - KERB.width);
    const kerbVolume = (kerbLength * KERB.width * KERB.height) * 1e-9;
    const sumOf = (description: string) => parts.reduce((sum, part) => sum + (part.quantities.find((q) => q.workItem === "concrete.balcony" && q.description === description)?.value ?? 0), 0);
    near(sumOf("Balcony cantilever slab"), slabVolume, `${label}: the slab is width × reach × thickness = ${slabVolume.toFixed(4)} m³`, 1e-3 * parts.length);
    near(sumOf("Balcony upstand (kerb) round the outer edges"), kerbVolume, `${label}: and the upstand is its length × 100 × 150 mm = ${kerbVolume.toFixed(4)} m³`, 1e-3 * parts.length);
    ok(parts.every((part) => quantity(part, "concrete.balcony", "Balcony cantilever slab").status === "calculated" && quantity(part, "concrete.balcony", "Balcony upstand (kerb) round the outer edges").status === "assumed"), `${label}: the slab's figure is calculated and the upstand's, whose size is an assumption, says so`);
    equal(parts.reduce((sum, part) => sum + part.quantities.filter((q) => q.workItem === "concrete.balcony").length, 0), 2 * parts.length, `${label}: the concrete of a balcony is counted in two lines for each part and no more`);

    // --- The way out: a glazed door down to the floor in the room behind it ------------------------------------------------------------------------
    // (The Existing Building keeps its window over the entrance, as it always had: it is the first template and is not changed.)
    const behind = project.windows.filter((w) => w.wallId === balcony.wallId && w.offset >= x0 - wall.start.x - 1e-6 && w.offset + w.width <= x1 - wall.start.x + 1e-6);
    ok(behind.length >= 1, `${label}: there is an opening in the wall behind the balcony, inside its width`);
    if (building.config.template === "existing") ok(behind.every((w) => w.sillHeight >= 900), `${label}: the Existing Building's is a window, as before`);
    else {
      const doors = behind.filter((w) => w.sillHeight === 0 && w.height >= 2000);
      ok(doors.length >= 1, `${label}: one of them is glazed down to the floor, ${doors.map((d) => `${d.width} × ${d.height}`).join(", ")}: the way out onto the balcony`);
      ok(doors.every((d) => d.offset >= x0 - wall.start.x && d.offset + d.width <= x1 - wall.start.x), `${label}: and it opens onto the balcony, not past the end of it`);
    }

    // The Existing Building's balcony and the villa's left one are over the entrance door, and so shelter it: that is what their descriptions say.
    const shelters = project.doors.filter((d) => d.levelId === project.levels[0]!.id && d.wallId.endsWith(":c1") && d.type !== "passage" && d.offset >= x0 - wall.start.x && d.offset + d.width <= x1 - wall.start.x);
    if (building.config.template === "existing" || (building.config.template === "modern-villa" && balcony.id.endsWith(":left"))) ok(shelters.length === 1, `${label}: the entrance door is under it (${shelters.map((d) => d.id).join(", ")})`);

    // --- Top steel: from the tip, over the edge beam, and back into the slab 1.5 times the reach from the support -------------------------
    const topBars = get(`frame:balcony:${id}:top`);
    equal([topBars.stage, topBars.layer, topBars.kind], [5, "reinforcement", "slab-bars-top"], `${label}: the top steel is placed at stage 5`);
    const cover = ASSUME.rebarCover;
    const r = 6;
    const span = tip - beamHalf;
    const anchorage = Math.ceil((1.5 * span) / 50) * 50;
    const mains = (topBars.shapes as Cyl[]).filter((s) => s.t === "cyl" && s.axis === "y" && s.len > 600);
    const legs = (topBars.shapes as Cyl[]).filter((s) => s.t === "cyl" && s.axis === "z");
    const across = (topBars.shapes as Cyl[]).filter((s) => s.t === "cyl" && s.axis === "x");
    const half = balcony.width / 2 - cover - r;
    equal(mains.length, lines(-half, half, 150), `${label}: a main top bar every 150 mm across the width: ${lines(-half, half, 150)}`);
    equal(legs.length, mains.length, `${label}: each one turned down at the tip`);
    const nearEnd = Math.min(...mains.map((m) => m.c.y - m.len / 2));
    const farEnd = Math.max(...mains.map((m) => m.c.y + m.len / 2));
    ok(mains.every((m) => Math.abs(m.c.y - m.len / 2 + (tip - cover)) < 1e-6 && Math.abs(m.c.y + m.len / 2 - (anchorage - beamHalf)) < 1e-6), `${label}: every main bar runs from ${cover} mm short of the tip (${tip - cover} mm out) to ${anchorage} mm behind the beam's face, which is 1.5 times the ${Math.round(span)} mm it reaches from there, up to the next 50 mm (${nearEnd}..${farEnd})`);
    ok(farEnd > beamHalf && nearEnd < -beamHalf, `${label}: so the bars cross the edge beam, its whole width`);
    ok(anchorage >= 1.5 * span && anchorage < 1.5 * span + 50, `${label}: and the length behind the support is the 1.5 times the reach the rule asks for, less than 50 mm over`);
    ok(mains.every((m) => m.c.z + r <= top - cover + 1e-6 && m.c.z > top - balcony.thickness / 2), `${label}: they lie in the top of the slab, a cover under its surface`);
    ok(legs.every((l) => Math.abs(l.c.z + l.len / 2 - mains[0]!.c.z) < 1e-6 && l.len >= 30 && l.c.z - l.len / 2 >= bottom + cover - 1e-6), `${label}: each leg hangs from its bar and stays a cover above the soffit`);
    near(legs[0]!.len, mains[0]!.c.z - (bottom + cover + ASSUME.slabBar + 2), `${label}: and goes down as far as the slab allows: to a cover and a bottom bar above the soffit`, 1e-6);
    equal(across.length, lines(-anchorage + beamHalf + 100, tip - cover, 250), `${label}: and bars across them every 250 mm to hold them`);
    ok(across.every((a) => a.c.z < mains[0]!.c.z), `${label}: under them`);

    // The slab's own steel over the edge beam gives way where the balcony's is: no bar of the floor slab runs through the root of a balcony.
    const rootX0 = x0; const rootX1 = x1;
    const slabTop = model.components.filter((c) => c.id.startsWith(`frame:slab:${project.levels[1]!.id}:`) && c.kind === "slab-bars-top");
    ok(slabTop.length > 0, `${label}: the floor slab has its own top steel (${slabTop.map((c) => c.id).join(", ")})`);
    const through = (slabTop.flatMap((c) => c.shapes) as Cyl[]).filter((s) => {
      if (s.t !== "cyl") return false;
      if (s.axis === "y") return s.c.x > rootX0 && s.c.x < rootX1 && s.c.y - s.len / 2 < 400 && s.c.y + s.len / 2 > -400;
      if (s.axis === "x") return Math.abs(s.c.y) < 400 && s.c.x + s.len / 2 > rootX0 && s.c.x - s.len / 2 < rootX1;
      return false;
    });
    equal(through.length, 0, `${label}: no top bar of the floor slab runs through the root of the balcony, where the balcony's own bars are`);
    const alongBeam = (slabTop.flatMap((c) => c.shapes) as Cyl[]).filter((s) => s.t === "cyl" && s.axis === "y" && Math.abs(s.c.y) < 1000 && s.c.y - s.len / 2 < 0 && s.c.y + s.len / 2 > 0);
    ok(alongBeam.some((s) => s.c.x < rootX0) || alongBeam.some((s) => s.c.x > rootX1), `${label}: while the slab's top steel over the beam carries on beyond the width of the balcony`);

    // Exactly the legs of the floor slab at the root are gone: a bar of the slab is left out when it is within the width of the balcony and a cover beyond it, and nowhere else.
    {
      const without = modelOf({ ...building, project: { ...building.project, balconies: building.project.balconies.filter((b) => b.id !== balcony.id) } });
      const legsAt = (m: ConstructionModel) => (m.components.filter((c) => c.id.startsWith(`frame:slab:${project.levels[1]!.id}:`) && c.kind === "slab-bars-top").flatMap((c) => c.shapes) as Cyl[]).filter((s) => s.axis === "z");
      const lost = legsAt(without).filter((s) => s.c.x > x0 - 1 - ASSUME.rebarCover && s.c.x < x1 + 1 + ASSUME.rebarCover && Math.abs(s.c.y) < 400);
      equal(legsAt(model).length, legsAt(without).length - lost.length, `${label}: the floor slab loses ${lost.length} of its edge legs, those over the root of the balcony, and no others`);
      ok(lost.length > 0, `${label}: and there are some`);
      // Every other bar that goes is one that runs through the root; none disappears anywhere else.
      const allTop = (m: ConstructionModel) => m.components.filter((c) => c.id.startsWith(`frame:slab:${project.levels[1]!.id}:`) && c.kind === "slab-bars-top").flatMap((c) => c.shapes) as Cyl[];
      const keyOf = (b: Cyl) => [b.axis, Math.round(b.c.x), Math.round(b.c.y), Math.round(b.c.z), Math.round(b.len)].join(",");
      const kept = new Set(allTop(model).map(keyOf));
      const gone = allTop(without).filter((b) => !kept.has(keyOf(b)));
      const m = ASSUME.rebarCover + 2;
      const touches = (b: Cyl) => {
        const bx0 = b.c.x - (b.axis === "x" ? b.len / 2 : 0); const bx1 = b.c.x + (b.axis === "x" ? b.len / 2 : 0);
        const by0 = b.c.y - (b.axis === "y" ? b.len / 2 : 0); const by1 = b.c.y + (b.axis === "y" ? b.len / 2 : 0);
        return bx1 > x0 - m && bx0 < x1 + m && by1 > -400 - m && by0 < 400 + m;
      };
      ok(gone.length >= lost.length + 5, `${label}: ${gone.length} top bars of the floor slab are gone with the balcony: its ${lost.length} legs and more (the bars over the beam)`);
      // (The bars along the front beam that the mains rest on go with the mains, a beam length at a time: they are the ones left out of this.)
      equal(gone.filter((b) => b.axis !== "x" && !touches(b)).length, 0, `${label}: and every bar across the beam that goes ran through the root of the balcony; the bars beyond its width stay where they were`);
    }

    // Bottom steel and the bars of the upstand.
    const bottomBars = get(`frame:balcony:${id}:bottom`);
    const lattice = (bottomBars.shapes as Cyl[]).filter((s) => s.t === "cyl" && s.c.z < top);
    const upstandBars = (bottomBars.shapes as Cyl[]).filter((s) => s.t === "cyl" && s.c.z > top);
    equal(lattice.filter((s) => s.axis === "x").length, lines(-tip + cover + 1, -edge - cover - 1, 200), `${label}: bottom bars along the wall every 200 mm out to the tip`);
    equal(lattice.filter((s) => s.axis === "y").length, lines(x0 + cover + 1, x1 - cover - 1, 200), `${label}: and across it every 200 mm`);
    equal(upstandBars.length, 3, `${label}: and a bar along each of the three upstands, in the upstand`);
    ok(upstandBars.every((b) => b.c.z > top && b.c.z < top + KERB.height), `${label}: each one inside the 150 mm of it`);

    // --- Formwork and props -------------------------------------------------------------------------------------------------------------
    const form = get(`frame:balcony:${id}:form`);
    equal([form.stage, form.removedAfter, form.layer], [5, 5, "formwork"], `${label}: the formwork is there at stage 5 only`);
    const soffit = (balcony.width * reach) * 1e-6;
    const edges = ((balcony.width + 2 * reach) * (balcony.thickness + KERB.height)) * 1e-6;
    near(quantity(form, "formwork.balcony").value!, Math.round((soffit + edges) * 1e3) / 1e3, `${label}: formwork is the soffit ${soffit.toFixed(2)} m² and the three edges up to the top of the upstand ${edges.toFixed(2)} m²`, 1e-3);
    const deckBoard = form.shapes[0] as Prism;
    near(deckBoard.z1, bottom, `${label}: the deck is under the soffit`);
    near(deckBoard.z1 - deckBoard.z0, ASSUME.formworkPly, `${label}: one thickness of ply`);
    const props = get(`frame:balcony:${id}:props`);
    equal([props.stage, props.removedAfter, props.layer], [5, 5, "props"], `${label}: and so are the props`);
    const posts = props.shapes as Cyl[];
    ok(posts.length >= 2 * (reach > 1000 ? 2 : 1), `${label}: props in rows across the balcony (${posts.length})`);
    ok(posts.every((p) => Math.abs(p.c.z - p.len / 2 - ASSUME.naturalGround) < 1e-6 && Math.abs(p.c.z + p.len / 2 - (bottom - ASSUME.formworkPly)) < 1e-6), `${label}: each stands on the ground outside and ends under the deck`);
    ok(posts.every((p) => p.c.x > x0 && p.c.x < x1 && -p.c.y > edge && -p.c.y < tip), `${label}: all of them under the balcony`);
    const rowAtTip = posts.filter((p) => Math.abs(-p.c.y - (tip - 300)) < 1e-6).map((p) => p.c.x).sort((a, b) => a - b);
    ok(rowAtTip.length >= 2 && rowAtTip.every((x, i) => i === 0 || x - rowAtTip[i - 1]! <= 1000 + 1e-6), `${label}: a row of props near the tip, no more than 1 m apart along it`);

    // --- Stage 13: waterproofing, screed and tiles; stage 18: render, railing and glass -----------------------------------------------------
    const innerArea = ((balcony.width - 2 * KERB.width) * (reach - KERB.width)) * 1e-6;
    const waterproofing = get(`bal:${id}:waterproofing`); const screed = get(`bal:${id}:screed`); const adhesive = get(`bal:${id}:adhesive`); const tiles = get(`bal:${id}:tiles`);
    equal([waterproofing.stage, screed.stage, adhesive.stage, tiles.stage], [13, 13, 13, 13], `${label}: the floor is made at stage 13`);
    near(quantity(adhesive, "flooring.balcony-adhesive").value!, Math.round(innerArea * 1e3) / 1e3, `${label}: adhesive under the tiles over the same ${innerArea.toFixed(2)} m²`, 1e-3);
    near(quantity(tiles, "flooring.balcony").value!, Math.round(innerArea * 1e3) / 1e3, `${label}: tiles over the deck inside the upstand: ${innerArea.toFixed(2)} m²`, 1e-3);
    const upstandLength = (balcony.width - 2 * KERB.width) + 2 * (reach - KERB.width) + (balcony.width - 2 * KERB.width);
    near(quantity(waterproofing, "waterproofing.balcony").value!, Math.round((innerArea + (upstandLength * KERB.height) * 1e-6) * 1e3) / 1e3, `${label}: the membrane covers the deck and is turned up 150 mm round it`, 1e-3);
    const z = (c: ComponentRecord) => { const s = c.shapes[0] as Prism; return [s.z0, s.z1]; };
    near(z(waterproofing)[0]!, top, `${label}: the membrane lies on the slab`);
    near(z(screed)[0]!, z(waterproofing)[1]!, `${label}: the screed on the membrane`);
    near(z(adhesive)[0]!, z(screed)[1]!, `${label}: the adhesive on the screed`);
    near(z(adhesive)[1]! - z(adhesive)[0]!, ASSUME.tileAdhesive, `${label}: ${ASSUME.tileAdhesive} mm of it`);
    near(z(tiles)[0]!, z(adhesive)[1]!, `${label}: the tiles on the adhesive`);
    near(z(tiles)[1]! - z(tiles)[0]!, ASSUME.floorTile, `${label}: ${ASSUME.floorTile} mm of tile`);
    ok(z(tiles)[1]! < top + ASSUME.floorBuildUp, `${label}: and the top of the tiles is lower than the floor inside, so water does not run in`);
    const render = get(`ext:balcony:${id}:render`); const railing = get(`ext:balcony:${id}:railing`); const glass = get(`ext:balcony:${id}:glass`);
    equal([render.stage, railing.stage, glass.stage], [18, 18, 18], `${label}: the render, the railing and the glass go on last`);
    const railLength = (balcony.width - KERB.width) + 2 * (reach - 150);
    near(quantity(railing, "external.railing").value!, Math.round(railLength) / 1000, `${label}: railing along the tip and the two sides, on the upstand: ${(railLength / 1000).toFixed(2)} m`, 1e-3);
    const postsAt = railing.shapes.filter((shape): shape is Box => shape.t === "box" && shape.s.x === 50 && shape.s.y === 50);
    const insidePrism = (u: Prism, x: number, y: number) => { let inside = false; for (let i = 0, j = u.poly.length - 1; i < u.poly.length; j = i, i += 1) { const a = u.poly[i]!; const b = u.poly[j]!; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside; } return inside; };
    ok(postsAt.length >= 6 && postsAt.every((post) => upstands.some((u) => insidePrism(u, post.c.x, post.c.y))), `${label}: every railing post (${postsAt.length}) stands on the upstand`);
    ok(postsAt.every((post) => post.c.z - post.s.z / 2 <= top + KERB.height + 1e-6 && post.c.z + post.s.z / 2 >= top + KERB.height), `${label}: with its foot on the top of the upstand`);
    const height = balcony.railingHeight;
    const railTop = Math.max(...railing.shapes.map((s) => (s.t === "box" ? s.c.z + s.s.z / 2 : s.t === "prism" ? s.z1 : -Infinity)));
    near(railTop, top + height + 20, `${label}: the handrail is ${height} mm above the floor (and 20 mm for its own section)`, 1e-6);
    near(quantity(glass, "external.railing-glass").value!, Math.round((railLength * (height - KERB.height - 120)) / 1e3) / 1e3, `${label}: glass between the upstand and the handrail`, 1e-3);
    ok(glass.shapes.length >= 3, `${label}: panes between the posts (${glass.shapes.length})`);
    for (const piece of [render, railing, glass]) ok(piece.parentId !== null && model.components.some((c) => c.id === piece.parentId), `${label}: ${piece.id} hangs from something that is there`);

    // The balcony's own reinforcement is in its own concrete.
    const only: ConstructionModel = { ...model, components: model.components.filter((c) => c.id.startsWith(`frame:balcony:${id}`) || (c.kind === "slab" && c.id.startsWith(`frame:slab:${project.levels[1]!.id}:`))) };
    const audit = auditReinforcement(only);
    ok(audit.bars > 20, `${label}: the audit looked at the balcony's bars (${audit.bars})`);
    equal(audit.outside.map((f) => f.note), [], `${label}: every bar of the balcony is in its concrete`);
    // Walking up the stages: the structure is there from stage 5, the floor from 13, the railing from 18.
    const stageOf = (c: ComponentRecord) => c.stage;
    const own = model.components.filter((c) => c.id.includes(id) && /balcony/.test(c.id));
    equal(own.filter((c) => stageOf(c) < 5).length, 0, `${label}: nothing of it appears before stage 5`);
    equal([...new Set(own.map(stageOf))].sort((a, b) => a - b), [5, 13, 18], `${label}: it is built in three goes: the frame, the floor, the finish`);
  }
}
ok(balconiesLooked >= 8, `balconies were looked at (${balconiesLooked}): 1 + 1 + 2 each at two sizes`);

// ---------------------------------------------------------------------------
// A balcony with no wall to come out of is put where its rectangle says; one that does not reach past the slab is part of the slab
// ---------------------------------------------------------------------------
{
  const building = buildBuilding({ template: "modern-house" });
  const base = modelOf(building);
  const balcony = building.project.balconies[0]!;
  const withoutWall = modelOf({ ...building, project: { ...building.project, balconies: [{ ...balcony, wallId: "no-such-wall" }] } });
  const get = (m: ConstructionModel, id: string) => m.components.find((c) => c.id === id)!;
  const id = `frame:balcony:${slug(balcony.id)}`;
  const a = get(base, id).shapes[0] as Prism; const b = get(withoutWall, id).shapes[0] as Prism;
  const box = (p: Prism) => [Math.min(...p.poly.map((q) => q.x)), Math.max(...p.poly.map((q) => q.x)), Math.min(...p.poly.map((q) => q.y)), Math.max(...p.poly.map((q) => q.y))].map(Math.round);
  equal(box(b), box(a), "a balcony whose wall is missing is cast in the same place: out is away from the middle of the plan");

  const shallow = modelOf({ ...building, project: { ...building.project, balconies: [{ ...balcony, depth: 200 }] } });
  equal(shallow.components.filter((c) => /balcony/.test(c.id)).length, 0, "a balcony that reaches less than 300 mm past the slab is not a cantilever, and nothing is made for it");
  const narrow = modelOf({ ...building, project: { ...building.project, balconies: [{ ...balcony, width: 500 }] } });
  equal(narrow.components.filter((c) => /balcony/.test(c.id)).length, 0, "nor is one narrower than 600 mm");
  // The beam the top bars run over is the one under the wall: a wider beam elsewhere in the storey does not lengthen them.
  {
    const lower = building.project.levels[0]!.id;
    const wide = { ...building.project, structuralBeams: building.project.structuralBeams.map((b) => (b.levelId === lower && !(b.start.y === 0 && b.end.y === 0) ? { ...b, width: 400 } : b)) };
    const m = modelOf({ ...building, project: wide });
    const bars = (get(m, `${id}:top`).shapes as Cyl[]).filter((s) => s.axis === "y" && s.len > 600);
    // The beam under the wall keeps its own width; the slab is cast out to half the widest member of the storey, now the 400 mm beams.
    const beamHalf = building.params.beamWidth / 2;
    const tipOut = building.project.walls.find((w) => w.id === balcony.wallId)!.thickness / 2 + balcony.depth;
    const back = Math.ceil((1.5 * (tipOut - beamHalf)) / 50) * 50 - beamHalf;
    ok(bars.every((s) => Math.abs(s.c.y + s.len / 2 - back) < 1e-6), `the top bars run back ${back + beamHalf} mm behind the face of the ${2 * beamHalf} mm beam under the wall, not behind the 400 mm beams elsewhere (${Math.max(...bars.map((s) => s.c.y + s.len / 2))})`);
    near(Math.max(...(get(m, id).shapes[0] as Prism).poly.map((p) => p.y)), -Math.max(building.params.columnSize, 400) / 2, "and the slab is cast out to half of the widest member, where the balcony begins");
  }
  // And one made deeper reaches further, with the steel running back further: the numbers follow the balcony.
  const deeper = modelOf({ ...building, project: { ...building.project, balconies: [{ ...balcony, depth: balcony.depth + 600 }] } });
  const ys = (m: ConstructionModel) => (get(m, id).shapes[0] as Prism).poly.map((p) => p.y);
  near(Math.min(...ys(deeper)), Math.min(...ys(base)) - 600, "a balcony 600 mm deeper reaches 600 mm further out");
  const farEnd = (m: ConstructionModel) => Math.max(...(get(m, `${id}:top`).shapes as Cyl[]).filter((s) => s.axis === "y" && s.len > 600).map((s) => s.c.y + s.len / 2));
  ok(farEnd(deeper) > farEnd(base) + 800, `and its top bars run back further into the slab (${farEnd(base)} to ${farEnd(deeper)} mm)`);
  void (undefined as unknown as Box);
}

console.log(`Construction balconies: ${checks} checks passed.`);
