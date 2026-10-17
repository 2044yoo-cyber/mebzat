# Construction learning mode, building configurator, bill of quantities and cost estimate

An interactive, 18-stage construction simulator inside the House Designer (the **Learn** tab). Open it from the menu, **Construction → Construction 3D**, or at `/house-design?tab=learn`. It shows how a
building is built, from setting out to handover, as a true exploded 3D model; it reads the bill of quantities off
that model; and it prices the bill in Ethiopian birr from a price book you can edit, live.

> **Illustrative learning model.** Dimensions, reinforcement and services are examples for teaching the order
> of work. They are not a structural, electrical, plumbing or architectural design, and nothing here is safe or
> ready to build. Every rate that comes with the price book is an example assumption, not a quotation and not a
> market price.

## How it fits

- **Derived, never written back.** `buildConstructionModel(project, options, rules)` reads a `HouseProject` and
  returns a `ConstructionModel`. The project is not modified (checked by `scripts/construction_lab_check.ts`),
  and the schema is unchanged, so saving, loading and every existing tab behave as before.
- **Two sources.** The building made by the configurator (below) is built in memory from its settings and is
  never saved over a user's house. "My project" reads the open project the same way, and its bill and cost can be
  downloaded too.
- **Pure logic, thin UI.** Everything in this folder is a pure function with a check; `components/construction-*.tsx`,
  `estimate-panel.tsx` and `study-panel.tsx` only draw them.
- **Prices are not part of the building.** The estimate is a function of the bill and the price book. Changing a
  rate, a percentage or a tax works the estimate out again and does not build or draw the building again (the browser
  check counts model builds and compares the 3D scene to show it).

## The building configurator

`building-config.ts`. Four templates, the first being the building the mode started with, unchanged at its own size:

| Template | Floors (default) | Roof | Notes |
| --- | --- | --- | --- |
| Existing Building | 1–4 (3) | flat, 600 mm parapet | nine rooms a floor, dog-legged stair, entrance balcony |
| Modern House | 1–3 (2) | flat, 900 mm parapet | 1.5 m cantilever balcony over the entrance, open-plan ground floor |
| Modern Villa | 2–3 (2) | pitched, gable ends | two cantilever balconies, timber trusses, gutters |
| G+2 Building | 3 (fixed) | flat, 900 mm parapet | two apartments a floor round a central stair core |

Length, width, area per floor, total floor area, number of floors and floor-to-floor height are editable; the
structure (columns, beams, footings) is sized from the spans, and every size can still be typed over. Resizing changes
the real geometry: the grid, the rooms, the openings and the whole model are drawn again from the new numbers.
Areas are read off the geometry (`areasOf`): footprint, area per floor, gross floor area, balconies, total slab area,
and roof covering area (on the slope for a pitched roof, inside the parapet for a flat one).

## Files

| File | What it does |
| --- | --- |
| `types.ts`, `stages.ts`, `catalogue.ts` | Vocabulary, the 18 lessons, ~170 component kinds with lesson text, materials |
| `learning-house.ts`, `building-config.ts` | The parametric project; the four templates, sizes and areas |
| `context.ts`, `layout.ts`, `rooms.ts`, `helpers.ts`, `region.ts`, `slab-cast.ts` | Shared reading of levels, walls, openings, rooms; the slab as cast; polygon offsets; quantity builders |
| `generators/*.ts` | One generator per group of stages (see below) |
| `model.ts` | Runs the generators, then the reinforcement rule, returns the model |
| `view.ts`, `explode.ts`, `draw-list.ts`, `label-layout.ts` | What is visible for a stage, frame view, layers, isolation, cut-away; explode offsets; the model as instance matrices |
| `quantities.ts` | Bill lines by work item, with the parts each is the sum of; the floor each part is billed with |
| `boq.ts`, `boq-audit.ts` | The bill by section / floor / stage / category with stable references; the audit |
| `reinforcement-rule.ts`, `reinforcement-audit.ts` | Steel from kg per m³ of concrete; the check that every bar lies in its concrete |
| `price-book.ts`, `estimate.ts` | The price book and the estimate |
| `study.ts`, `report.ts`, `report-xlsx.ts`, `report-pdf.ts`, `pdf.ts` | Saved studies; the report's tables; the workbook; the PDF writer |
| `inspect.ts`, `takeoff-handoff.ts` | What the panel shows for a part; hand-off of net quantities to the takeoff page |
| `service-*.ts`, `electrical-plan.ts`, `plumbing-plan.ts`, `wet-room.ts` | The installation: routes, falls, shafts, audit |
| `roof-geometry.ts`, `slab-openings.ts`, `structure-data.ts` | Eaves and gutters; what is cut through each slab; footings and ground beams |

## Stages and generators

1–2 `site.ts` · 3 `foundation.ts` · 4 `ground-floor.ts` · 5 `frame.ts` (columns, beams, slabs, `slab-steel.ts`, `balcony.ts`) ·
6 `stairs.ts` (`stair-flight.ts`: flights are waist slabs) · 7 `masonry.ts` · 8 `roof.ts` (flat and pitched alternatives) ·
9 `electrical.ts` · 10 `plumbing.ts` · 11–13 and 15 `finishes.ts` · 14 `openings.ts` · 16 `joinery.ts` and 17 `furniture.ts` ·
18 `external.ts` (with `facade.ts`, `balcony.ts`).

### The structure as built

- **Slabs** are cast out to the outer face of the frame (half the widest column or beam past the outline), in two pours
  at the grid line nearest the middle. Parapets stand on the cast edge, flush with it.
- **Reinforcement** lies inside its concrete and is checked (`reinforcement-audit.ts`): bars within their member and
  its cover, hooks and laps, top steel over supports (negative bars) with chairs, mesh round openings with trimmer bars.
- **Balconies** are cantilever slabs cast with the floor (stage 5: top bars run back 1.5 × the reach behind the beam face,
  bottom lattice, kerb, formwork and props to the ground); their waterproofing, screed and tiles are stage 13; render,
  paint, railing posts, handrail and glass are stage 18.
- **Stairs** are waist slabs with steps on them (a `profile` shape: a polygon in a vertical plane, extruded), reinforced
  along the waist.
- **Roof**: flat roof with membrane, protection, screed to falls, outlets, parapet with coping, rendered and painted
  inside and out; pitched roof with wall plates, trusses between blockwork gable walls, rafters with tails, fascia, gutter,
  battens, underlay, covering, ridge and barge boards.
- **Facade**: render and paint cover the walls and, flush with them, the faces of the columns and beams.

## Quantity rules

Every quantity item has: id, description, BOQ section, storey, room, material, dimensions, net quantity, unit,
formula, inputs, source geometry, status (`measured`, `calculated`, `assumed`, `review`, `missing`),
allowance (a separate field), assumptions and exclusions.

- **Concrete** is counted once: members are counted net of the concrete they share (columns whole; beams less
  columns and earlier beams; slabs less openings; the ground slab less pedestals; ground beams and pedestals less the
  footings they run into; the entrance steps less the columns and pedestals they are cast against). The check compares the
  total with the **exact volume of the union** of everything drawn (a grid of every distinct coordinate): they agree to
  within a few litres in 160–310 m³. Allowance 5 % is separate.
- **Reinforcement**: the weight of the bars drawn is never used as steel to order. By default the steel of each member is
  its concrete times a stated kg per m³ (footing 80, pedestal 200, ground beam 140, column 200, beam 150, slab 100, ground
  slab 25, stair 100, balcony 130, lintel 110), shared among its groups of bars in proportion to the bars drawn; every line
  is `assumed` and says so. An approved bar schedule (`ApprovedBar[]`, `π/4 · d² · 7850 kg/m × length × count`) decides the
  groups it covers. Switching the rule to *schedule only* leaves steel `missing` until one is approved. Ratios are editable
  in the quantities panel.
- **Masonry**: net wall area = wall between columns less openings, lintel zones and sills; blocks = area ÷ ((length + joint)
  × (height + joint)) = 12.5 per m² for 400 × 200 modules; mortar = net volume less block volume; breakage 5 % separate.
- **Plaster, paint, tiles, ceilings**: net room-face and floor areas, openings by the rule (`all` / `none` / over 0.5 m²);
  counts from tile and board size; waste separate.
- **Roof**: a flat roof on plan (inside the parapet); a pitched roof on the slope, `plan area ÷ cos(pitch)`.
- **Services**: conduit and pipe lengths from the drawn routes by system and diameter; counts for boxes, outlets, fixtures,
  valves, traps. **Joinery**: board area, edge banding in metres, hardware counts. **Loose furniture** is a separate list.

## The bill

`buildBill(model, options, scope, filter)`. Each line is the sum of its **parts**: one part for each item of each
component, with the floor, the stage and the category of that component. Every grouping (by section, floor, stage or
category) is a sum of the same parts, so every grouping adds up to the same lines. A line keeps its reference (`C.03`)
whichever part of the building is on show.

- **Floors.** Foundations, earthworks, the ground slab and the site are one group below the building; the roof, parapets
  and gables are one above it. The *floor structure* of a storey (its slab, the beams under it, its balconies) is billed with
  the floor it forms, and its bars, formwork and props with it. Everything else is billed with the storey it stands in.
- **The audit** (`auditBill`) reads the model back against the bill: every component built is in the bill, exempt with a
  stated reason (props, setting-out marks, temporary works), or carried by its parent (cabinet panels); no work is in the
  bill twice; no member has more concrete counted than drawn; every member that needs steel has it. The result shows in
  the quantities panel.

## The price book and the estimate

`price-book.ts`: 215 entries, one per kind of work in the bill (197 with a **material** and a **labour** rate in ETB, 18
*included* in another line's rate so that nothing is charged twice: the blocks and mortar of a wall are in the rate per m²
of wall, the tiles of a floor in the rate per m² of floor, the boards and channels of a ceiling in the rate per m² of
ceiling, spacers and chairs in the rate of the steel). Each rate has a figure (or none), a status (`assumed` example,
`entered` by you, `quoted` by a supplier), a source and a date. Rates are edited on the **Rates** tab.

`estimate.ts`, for every part of every line:

```
material = (net + allowance) × material rate        waste is bought
labour   = net × labour rate                        labour builds only the net
direct cost = Σ material + Σ labour
additional costs: each a % of materials, labour, direct cost or the running total, or a fixed sum (switchable)
subtotal    = direct + additional
contingency = subtotal × %
taxes       = (subtotal + contingency) × %           VAT 15 % by default (editable)
total       = subtotal + contingency + taxes
cost per m² = total ÷ gross floor area  (also per m² of slab, balconies included)
```

It says what it is: how much of the direct cost rests on example, entered and quoted rates, and on assumed quantities;
every line is flagged (example rate, quantity assumed, no price, no quantity, included in another); a rate left empty is
*missing*, not nothing — the line is listed as a problem and what it cost leaves the total. The cost is also taken by
section, floor, stage (with the cost up to the stage on show) and category; each adds up to the direct cost.

## Saved studies and documents

`study.ts`: a study keeps what was *set* (template and size, structure sizes, options, the rules the quantities follow,
the price book and the costs on top, the stage) under a name, in the browser's storage (and as a `.json` file to move
between devices). Opening one works the model, the bill and the estimate out again from those settings, figure for figure.
Nothing is written to the database: saving studies to an account would need a migration.

`report.ts` builds the tables once; `report-xlsx.ts` writes them as a workbook (summary, BOQ by section, floor, stage and
category, cost summary, cost by group, the priced bill, rates used, what could not be priced, assumptions, the whole price
book); `report-pdf.ts` and `pdf.ts` (a PDF written by hand: Helvetica, WinAnsi, tables that wrap and repeat their headings)
print the same tables. Downloads are named with underscores (`medosha_house_<name>_estimate.xlsx`).

## Real project geometry or schematic

| From the project's own geometry | Schematic illustration (labelled as such in the panel) |
| --- | --- |
| Walls, doors and windows, columns, beams, slab outlines and thickness, stair openings | Excavation, soil layers, spoil, working space |
| Stair geometry, footings, roof level, balconies | Reinforcement bars, spacers, chairs, mesh |
| Rooms (clear areas), site boundary | Formwork, props, construction joints |
| | Electrical and plumbing routes, fixtures, ceiling framing, plaster, tiles, paint, furniture, external works, the pitched roof's timber |

Cabinets, wardrobes, storage and the TV unit are real Berchuma parts: one 3D panel for every placement on the cutting list.

## Checks

```
node scripts/run_construction_checks.mjs              # every check below that needs no browser, four at a time
node scripts/run_construction_checks.mjs --browser    # and the three browser checks (npm run build first)
```

| Check | What it proves |
| --- | --- |
| `building_config_check.ts` | the four templates, sizes, areas, structure sizing, the Existing Building unchanged |
| `construction_lab_check.ts` | the model, timeline, explode, quantities, statuses, hand-off |
| `construction_rebar_check.ts`, `construction_balcony_check.ts`, `construction_roof_check.ts`, `construction_geometry_check.ts` | the structure as built (bars in concrete, cantilevers, closed roof, parapet, facade, geometry helpers) |
| `construction_services_check.ts` | the installation: nothing floats, nothing collides, falls, views |
| `construction_boq_check.ts` | the bill: parts add up in every grouping; floors; the audit finds each kind of fault; concrete against the exact union; steel by the rule |
| `construction_estimate_check.ts` | the estimate by hand on a small bill, then on the four buildings at three sizes; the price book covers every kind of work |
| `construction_export_check.ts` | studies saved, listed, replaced, opened identically; the workbook read back cell by cell; the PDF read by pdf.js |
| `construction_acceptance_check.ts` | four buildings × 150 and 200 m² × eighteen stages × the viewer's controls × the bill, the cost and the two documents |
| `construction_lab_browser_check.mjs` | a real browser at phone width: stages, controls, quantities, rates, a price change that does not rebuild, saving and opening, downloads |
| `construction_menu_browser_check.mjs`, and the menu rows in `navigation_check.ts` | the row under Construction in the phone's menu: listed near the top, big enough to press, in three languages, going to the learning view (by way of sign-in when signed out) |

Every check is mutation-tested: `node scripts/mutate.mjs "npx tsx scripts/<check>.ts" scripts/mutants/<plan>.json` breaks the
code on purpose and insists the check notices (plans: `construction_boq.json`, `construction_estimate.json`,
`construction_export.json`, `construction_acceptance.json`, `construction_rebar.json`, `construction_balcony.json`,
`construction_roof.json`, `construction_geometry.json`, `building_config.json`, `construction_lab.json`, `construction_services.json`).

## Still to do for a real bill and estimate

- Rates from a real source: the Price Exchange (`material_prices`) could supply them; until then the book's rates are examples.
- Approved reinforcement schedules (bar marks, diameters, lengths, numbers) and supplier quotations.
- Saving studies to an account (needs a migration, which needs approval) rather than the browser.
- Stair concrete is an idealised waist slab (marked for review); concave rooms are measured by their outline.
- Loose furniture is not priced; the estimate covers the building.
