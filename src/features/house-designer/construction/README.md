# Construction learning mode

An interactive, 18-stage construction simulator inside the House Designer: the **Learn** tab. It shows how a
three-storey house is built, from setting out to handover, as a true exploded 3D model, with the
quantity data a bill of quantities would need.

> **Illustrative learning model.** Dimensions, reinforcement and services are examples for teaching the order
> of work. They are not a structural, electrical, plumbing or architectural design, and nothing here is safe or
> ready to build.

## How it fits

- **Derived, never written back.** `buildConstructionModel(project, options, rules)` reads a `HouseProject` and
  returns a `ConstructionModel`. The project is not modified (checked by `scripts/construction_lab_check.ts`),
  and the schema is unchanged, so saving, loading and every existing tab behave as before.
- **Two sources.** The *Medosha Three-Storey Learning House* (`learning-house.ts`) is built in memory from
  configurable dimensions and is never saved over a user's house. "My project" reads the open project the same way.
- **Pure logic, thin UI.** `view.ts`, `explode.ts`, `quantities.ts`, `inspect.ts`, `draw-list.ts` and
  `label-layout.ts` are pure functions with checks. `components/construction-*.tsx` only draw them.

## Files

| File | What it does |
| --- | --- |
| `types.ts`, `stages.ts`, `catalogue.ts` | Vocabulary, the 18 lessons, ~170 component kinds with lesson text, materials |
| `learning-house.ts` | The sample project, its dimensions, `normalizeParams` (clamps and says why) |
| `context.ts`, `layout.ts`, `rooms.ts`, `helpers.ts` | Shared reading of levels, walls, openings and rooms; quantity builders |
| `generators/*.ts` | One generator per group of stages (see below) |
| `model.ts` | Runs the generators, returns the model |
| `view.ts` | What is visible for a stage, frame view, layers, isolation, cut-away |
| `explode.ts` | Temporary offsets for floors, categories and layers (zero is exactly assembled) |
| `quantities.ts` | Bill lines by work item, statuses, allowances kept apart, unpriced draft bill |
| `inspect.ts` | Everything the learning panel shows for a part or an instance of a part |
| `draw-list.ts` | The model as instance matrices for the renderer (a tipped pipe is turned by its fall) |
| `service-plan.ts`, `wet-room.ts` | Where the shafts and the riser cupboard stand, found against every storey; a wet room's fixtures and the pipes to them. A shaft is only taken where all of them can reach it |
| `service-routing.ts` | The shared routing: structure to avoid, runs with falls, pipes round a room's walls, slab layers for conduit, a route round obstacles, drains through ground beams |
| `electrical-plan.ts`, `plumbing-plan.ts` | The electrical and the plumbing installation as routes, read from the building. The generators draw these |
| `service-audit.ts` | Reads the finished model back: what each run is fixed to, and what it passes through |
| `roof-geometry.ts`, `slab-openings.ts`, `service-frame.ts` | The roof's eaves and gutters, what is cut through each slab, the frame a shaft is placed in |

## Stages and generators

1–2 `site.ts` · 3 `foundation.ts` · 4 `ground-floor.ts` · 5 `frame.ts` · 6 `stairs.ts` · 7 `masonry.ts` ·
8 `roof.ts` (flat and pitched alternatives) · 9 `electrical.ts` · 10 `plumbing.ts` ·
11–13 and 15 `finishes.ts` (plaster coats, ceilings, floors and tiles, paint) · 14 `openings.ts` ·
16 `joinery.ts` and 17 `furniture.ts` (cabinets from Berchuma's own `buildParts`) · 18 `external.ts`.

## The installation (stages 9 and 10)

The pipes and conduit are laid out from the building, never across the middle of a room.

- **Shafts.** Each wet room gets a shaft (300 × 300, floor to roof) against a wall, clear of beams, columns, doors and stairs on every storey. The soil stack, its vent and the cold riser stand in it, and every slab and the ground slab are opened for it. A shaft in a corner can send its pipes out of its front.
- **Plumbing.** Fixtures stand on the walls (on a pre-wall duct in a bathroom), only where their pipes can reach them. Waste falls to the stack (settings: 1 in 40, 1 in 60, 1 in 60, kept between 1 in 20 and 1 in 200); the stack goes down to a drain that falls round the footings and, where it must, through ground beams in sleeves cast into them. Roof tank, down-feeds, rising main, pump on its pad, rainwater from the real gutters and outlets.
- **Electrical.** The board stands in a riser cupboard on every storey. Conduit is cast in the floor slab to the foot of a wall and up a chase to the boxes, and in the slab above to each ceiling light and detector. Meter and earth electrode outside, through sleeves in the wall.
- **Builder's work** (`generators/service-structure.ts`): chases and wall sleeves at the blockwork stage, sleeves in ground beams at the foundation stage, flashing at the roof, shaft covers, cupboard doors, hatches and pre-wall ducts at the plaster stage.
- **Views.** Plumbing only, electrical only, combined, concealed installation, finished building, exploded installation, with a legend whose colours are the materials'. The explosion moves each installation as one piece, so no connection comes apart.
- **When it cannot be done** the plan says so in words (a warning that starts `Plumbing:` or `Electrical:`) and draws nothing through structure.
- **Settings** (`rules.services`): the falls, the heights of the cold and hot lanes, switches, sockets and the board.

## Real project geometry or schematic

| From the project's own geometry | Schematic illustration (labelled as such in the panel) |
| --- | --- |
| Walls (position, thickness, height), doors and windows (offset, width, height, sill) | Excavation, soil layers, spoil, working space |
| Columns, beams, slab outlines and thickness, stair openings | Reinforcement bars, spacers, chairs, mesh |
| Stair geometry (`stair-geometry.ts`), footings, roof level and thickness | Formwork, props, construction joints |
| Rooms (clear areas), site boundary, balconies where the project has them | Electrical and plumbing routes, fixtures, ceiling framing |
| | Plaster coats, tiles, paint, furniture, external works, the pitched roof's timber |

Cabinets, wardrobes, storage and the TV unit are real Berchuma parts: one 3D panel for every placement on
the cutting list.

## Quantity rules

Every quantity item has: id, description, BOQ section, storey, room, material, dimensions, net quantity, unit,
formula, inputs, source geometry, status (`measured`, `calculated`, `assumed`, `review`, `missing`),
allowance (a separate field), assumptions, exclusions, and empty cost fields. **No price is ever invented.**

- **Concrete** is counted once: `netVolumes` removes every overlap exactly (columns whole, each beam less the
  columns and earlier beams, slabs less stair openings, the ground slab less pedestals). Verified against an
  independent voxel union. Allowance 5 % is separate.
- **Reinforcement** has a weight only from an approved bar schedule (`ApprovedBar[]`): `π/4 · d² · 7850 kg/m × length × count`.
  Without one every steel line is `missing` and says what is needed. The drawn bars are never counted.
- **Masonry**: net wall area = wall between columns less openings, lintel zones and sills, plus openings the
  stated rule does not deduct. Blocks = area × 1 / ((length + joint) × (height + joint)) = 12.5 per m² for
  400 × 200 modules. Breakage 5 % is separate. Mortar = net volume less block volume (assumed full bedding).
- **Plaster, paint, tiles, ceilings**: net room-face and floor areas, openings by the rule
  (`all` / `none` / over 0.5 m²); counts from tile and board size; waste separate.
- **Roof**: a flat roof is measured on plan (it equals the surface); a pitched roof on the slope,
  `plan area ÷ cos(pitch)`.
- **Services**: conduit and pipe lengths from the drawn (straight) routes, by system and diameter; counts for
  boxes, outlets, fixtures, valves, traps. Cable = conduit × 3 conductors.
- **Joinery**: board area by board id, edge banding in metres, hardware from Berchuma's hardware list.
- **Loose furniture** is a separate list, outside the building quantities.

## Checks

```
npx tsx scripts/construction_lab_check.ts                      # model, timeline, explode, quantities
node scripts/mutate.mjs "npx tsx scripts/construction_lab_check.ts" scripts/mutants/construction_lab.json
npx tsx scripts/construction_services_check.ts                 # the installation: no floating, no collisions, falls, views
node scripts/mutate.mjs "npx tsx scripts/construction_services_check.ts" scripts/mutants/construction_services.json
npm run build && node scripts/construction_lab_browser_check.mjs   # real browser, 390 px
node scripts/mutate.mjs "node scripts/construction_lab_browser_check.mjs" scripts/mutants/construction_lab_browser.json
```

## Still to do for a real bill and estimate

- Rates: a price book with source and date for every rate; labour, equipment and overhead build-ups.
- Totals, contingency and tax, kept visibly apart from net work.
- Approved reinforcement schedules (bar marks, diameters, lengths, numbers) and supplier quotations.
- Concave rooms are measured by their outline and marked for review; column and beam faces are not plastered or
  painted separately; stair concrete uses a stepped idealisation (marked for review).
- Sheet optimisation and costing for joinery from the same cutting list.
- A balcony in the sample (the code reads project balconies, but the sample has none).
