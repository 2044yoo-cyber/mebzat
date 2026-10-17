# Building configurator, automatic BOQ and live estimate: audit, plan and result

Branch `claude/last-job-stopping-point-ovz31u`. Sections 1 to 5 are the audit run before any edit for this work; sections 6 to 10 are what was built, how it was checked, and what the verification found in the rest of the repository.

## 1. State of the checks before editing

| Check | Result | Cause |
| --- | --- | --- |
| `npx tsc --noEmit` | 3 errors | `freehand-canvas.tsx`, `house-designer-workspace.tsx`, `scripts/freehand_check.ts`: the sketch stroke type gained required `locked` and `kind` (commit `3f8fbeb` and earlier on this branch) and three places that build strokes were not updated |
| `npm run build` | **failed** at type checking | the same three errors |
| `npx eslint src scripts` | 24 errors, 23 warnings | all in files outside this work: `image-to-3d-importer.tsx` (refs read during render), `house-designer-workspace.tsx` (state set in an effect), legal pages, Berchuma components. None in `construction/` |
| `scripts/berchuma-check.ts` | 547 passed, **57 failed** | see section 2 |
| Regression sweep (52 checks) | 42 pass, 9 fail | the nine are Berchuma, calculator, layout and map checks; none is in the House Plan |
| `construction_lab_check` 17,370, `construction_services_check` 1,749, browser check 122 | pass | |

The three type errors were fixed first (they are one required field each), and the build is green again.

## 2. The 57 failing `berchuma-check` assertions

They are **not new regressions** and not from this work. Bisecting the history with the check run at each commit:

- At `1682540` (2026-09-12) the check passes: 559 checks.
- At `5b5d36b` ("Use recessed wardrobe plinth", 2026-09-10 in the author date, merged later) 16 assertions fail.
- At `73efb8c` ("Improve wardrobe construction system", 2026-09-12) 51 fail. Gable depth is 594 instead of 600, the example has three drawers and five door leaves where the check expects four and four, the back panel and cut list change.
- Later commits move the count between 50 and 60 (`848cc96` manual door count: 60; `ca799b1` legacy drawer fronts: 57).
- The check is not in `package.json` (its header names `npm run check:berchuma`, which does not exist) and not in CI, so nothing noticed.

So the wardrobe was deliberately redesigned and the hand-worked expectations were never updated. Each failing assertion has to be judged: stale expectation (the new arithmetic is right and the number in the check must be re-derived by hand) or a real defect. Done in the verification phase, with the result in the final report.

## 3. What exists and can be reused

| Need | Already there |
| --- | --- |
| 3D viewer, 18 stages, layers, explode, cut-away, isolate | `components/construction-lab.tsx`, `construction-scene.tsx`, `construction/view.ts`, `explode.ts`, `draw-list.ts` |
| A configurable building | `construction/learning-house.ts`: one three-storey house from a 5 × 3 column grid, `normalizeParams` clamps and says why |
| Components with quantities, status, allowance, formula | `construction/types.ts`, generators, `quantities.ts` (`aggregateQuantities`), `takeoff-handoff.ts` |
| Plumbing and electrical routes | `plumbing-plan.ts`, `electrical-plan.ts`, `wet-room.ts`, `service-audit.ts` (done in the previous piece of work) |
| Editable estimate arithmetic, "a typed price is never replaced" | `src/lib/pricing/estimate.ts`, `docs/ESTIMATE.md` |
| Spreadsheet writer, no dependency | `berchuma-studio/services/xlsx.ts` (`buildXlsx`) |
| Saving a plan to a project | `services/plan-store.ts` on `agenda_plans` (plan JSON, revision-checked), no migration needed |
| PDF | only `pdfjs-dist` for reading: **a small PDF writer is missing** |

## 4. What is missing

1. Four building templates and a real area model. Only the one house exists, and its grid is fixed.
2. Slab reinforcement is a flat lattice with one 1.6 m top bar over every beam line: no negative bars sized to the span, no edge or cantilever steel, no mesh in stair or roof slabs. Balconies are a loose box cast at stage 18, with a single railing line and no steel, no formwork.
3. The final stage is a raw blockwork box with a tan paint skin, not a finished modern house.
4. Reinforcement is never quantified (a rule: no steel from schematic bars). A preliminary estimate needs a stated ratio method.
5. Quantities are lines by work item. There is no by-floor, by-category, by-stage table, and no check for omissions or double counting.
6. The estimate mode says "not built yet": no rates, no labour, no contingency, no tax.
7. Configurations are not saved, and nothing exports to Excel or PDF.

## 5. Plan

1. **Configurator** (`building-config.ts`): templates *Existing Building* (unchanged), *Modern House*, *Modern Villa*, *G+2 Building*, each a function from length, width, floors and floor height to a `HouseProject`. Footprint, area per floor, gross floor area and roof area are separate, defined numbers. Resizing rebuilds the geometry.
2. **Construction corrections**: cantilever slabs cast with the floor with negative bars anchored into the back span; slab and stair reinforcement and mesh; the roof; a finished final stage.
3. **BOQ** (`boq.ts`): per floor, category and stage, with a check that every modelled component is counted once.
4. **Pricing** (`pricing.ts`): an editable ETB rate book (material and labour per work item), additional costs, contingency, tax, totals, cost per m². Price edits recompute from the same model: geometry is not rebuilt.
5. **Save and export**: configurations saved in the browser and as a plan on a project; Excel and PDF of the BOQ and the cost report.
6. **Verification**: all four templates at 150 m² and 200 m², the services audit on each, regression checks, the Berchuma triage, CI.

Engineering note: every dimension, rate and ratio here is a stated example for learning and estimating. None is a structural design.


## 6. Result: what was built, and how it was checked

The plan in section 5 was carried out. The files are listed in `src/features/house-designer/construction/README.md`; this section is about the checks. It is opened from the menu, Construction → Construction 3D (`/house-design?tab=learn`): `navigation_check` checks the row and `construction_menu_browser_check` checks it as a phone shows it.

| Check | What it looks at | Checks |
| --- | --- | --- |
| `building_config_check` | four templates, sizes, areas, structure sizing | 804 |
| `construction_lab_check` | the model, timeline, explode, quantities, hand-off | 17,761 |
| `construction_lab_link_check` | the link from the plan | 10 |
| `construction_services_check` | the installation: nothing floats, collides, everything reaches | 1,756 |
| `construction_geometry_check` | geometry helpers | 30 |
| `construction_rebar_check` | bars in the concrete, stairs as waist slabs | 220 |
| `construction_balcony_check` | cantilever slabs | 694 |
| `construction_roof_check` | closed roof, parapet, frame faces | 864 |
| `construction_boq_check` | the bill: parts add up in every grouping, the audit finds each kind of fault, concrete against the exact union | 42,830 |
| `construction_estimate_check` | the estimate by hand, then four buildings at three sizes | 564 |
| `construction_export_check` | studies saved and reopened, the workbook read back cell by cell, the PDF read by pdf.js | 12,431 |
| `construction_acceptance_check` | four buildings × 150 and 200 m² × eighteen stages × every viewer control × the bill, the cost and the two documents | 4,766 |
| `building_config_browser_check`, `construction_lab_browser_check` | a real Chromium at phone width, against a production build | 45 and 182 |
| `construction_menu_browser_check` | the row under Construction in the phone's menu: listed near the top, 44 px to press, in three languages, going to the learning view (by way of sign-in when signed out) | 18 |

`node scripts/run_construction_checks.mjs` (`npm run check:construction`) runs the type check and every one of them four at a time; `--browser` adds the three browser checks. `.github/workflows/construction_checks.yml` runs it on every push and pull request that touches that code. Each check has a mutation plan in `scripts/mutants/` (`construction_*.json`, `building_config.json`) that breaks the code on purpose and insists the check notices.

## 7. The 57 failing `berchuma-check` assertions

Each was run against the code and judged, by hand, against the drawing. They were not new: 56 were expectations the wardrobe redesign and the owner's later decisions had overtaken, and **one was a real defect**. The check is green now (625 checks) and has a mutation plan (`scripts/mutants/berchuma_core.json`, 23 mutants, all caught).

| # | Assertions | Cause | Verdict | What was done |
| --- | --- | --- | --- | --- |
| 1 | shelf width | an overlaid back (the default) takes nothing from the depth: 600 − 10 = 590; the old sum, 584, is an inset back | stale | both are asserted |
| 2–8 | drawer bases, leaves, fronts, no door over drawers, hinges, handles, runners | the example's bay 2 is a stack (open storage, hanging, **three** drawers) under **one** leaf of 1582 mm, so five leaves, 23 hinges (the short leaf takes three), five handles (drawers default to a finger gap) and three pairs of runners | stale | re-derived |
| 9–10 | back board, board area | the back is 6 mm HDF; 18.348 m² of walnut worked out part by part (gables 2.76, top and bottom 2.8368, dividers 2.7168, shelves 3.66272, drawer boxes 1.14816, four leaves 3.53584, the short leaf 1.22130, fronts 0.46629) | stale | the sum is in the check, and equals the sum of the parts per board |
| 11–14 | height cap, box, bay widths, long shelf | a wardrobe is capped at the plinth plus one 2440 mm sheet, 2540; a bay over 900 is divided, so the interior is 2400 − 2 × 18 − 3 × 18 = 2310 | stale | re-derived; a shelf too long for its board is still flagged (checked on a TV unit) |
| 15 | drawers for shelves is cheaper | the example's drawers are a section of a stack; the swap found none and priced one design twice | test error | the swap is made on the section, and the check proves it took the drawers out |
| 16, 18–19 | boards on the cut list, pieces | three boards (walnut, white back, black plinth); the two hanging rails are bought by the metre | stale | re-derived; the rails are on the hardware list, 1.504 m |
| 20–21 | version 1 opens as before | the hand-built example has never been validated, and validation makes its single 776 mm leaf a pair (a hinged leaf may be 600 mm) | stale | both sides go through validation; the rule is asserted on its own |
| 17, 22–26 | each drawer box shares a floor with its front, "a front at a different height from its box is screwed to the wrong drawer" | **the fronts were stacked up from the floor in the order the drawers are listed, top first**, so the first front stood at the bottom over the last box. Introduced by 69cb526 (11 Oct). With equal drawers only the numbering shows; with an unequal bank (the bottom drawer deeper) the 3D model and the cut list drew the tall front at the top over the short box, while the elevation, which reads the faces directly, drew it as declared at the bottom | **defect, fixed** | `drawerFaceRects` hands the fronts back in the order of their boxes; asserted for equal and unequal banks |
| 27 | a bigger share pushes the drawers down | measured the lowest edge, which is the floor whatever the shares are | stale | measures the top edge |
| 28–43 | legs at the corners, at the back, more of them, a design saved before legs, no plinth board, legs on the cut list | a wardrobe stands on a four-sided recessed plinth since the construction system (73efb8c); legs belong to the TV unit, the bookshelf, office storage and the kitchen; legs are bought, so they are on the hardware list and not on the cut list | stale | the legs checks run on a TV unit, the wardrobe's plinth is asserted on all four sides |
| 44–55 | editing one drawer | four drawers across a wardrobe's 1964 mm are 489 mm fronts; a front may be 90 to 280 mm, so validation repairs them to eight | stale | a chest of drawers (864 mm opening); counts and limits derived from `drawerCountRangeOf`; the heights plus the 3 mm gaps fill the opening |
| 56 | the cut-list page keys its checklist on its text | a new static checklist | tidied | keyed by position like the other lists, and an apostrophe that failed lint is escaped |

## 8. The other red checks

At the start of this work nine checks were red (section 1). Sweeping all 133 check scripts of the repository then found more that nobody had been running. `ai-router-check`, `freehand_mutation_check`, `image_import_check`, `kitchen-ui-check`, `layout-check`, `price-surfaces-check`, `touch_feedback_check`, `tour_check` and `used_items_check` are red on `main` (e3416e0) as well as on this branch; `project_showcase_check` is red only here (after the owner's ed8c399 on this branch), `berchuma_hinge_check` only after the drawer fix in section 7, and `wall_joins_mutation_check` passed on `main` only because the check it drives, `freehand_check`, was red there and so every mutant counted as noticed. Each was looked at, judged against the code, and either brought up to date or fixed; two are left red because they are the owner's to decide. What was found:

| Check | Cause | Verdict | What was done |
| --- | --- | --- | --- |
| `berchuma_closure_check` | the owner stopped making end panels on their own (d82c64d, bfe2292: "side cover panels are optional add-ons, not automatic closures") | stale | the end assertions say an exposed end stays bare wherever the hinge is; mutation plan repaired |
| `berchuma_dimensions_check` | fronts are 201 mm with a 25 mm finger gap (they were 218); and **the dimension chain read a finger-gapped bank as three fronts and two spaces** | stale, and a **defect, fixed** in `interior-dimensions.ts` | a bank up to a 40 mm gap is one block; the 6 mm reveal legacy sizing leaves above the top front is counted as what it is |
| `berchuma_display_check` | six golden fingerprints, valid until 69cb526 (11 Oct) gave every drawer bank a finger gap; they moved again with door sizing, the depth rule and the fix above | stale | recorded afresh with the history beside them; the cut-list comparison is in whole millimetres; a handle test that could no longer fail now can |
| `berchuma_doors_check` | a wall unit's doors are 300 mm by preference, so 764 mm is three leaves of 252; typing 300 takes 48 from the neighbour: 300, 204, 252 | stale | re-derived |
| `berchuma_hinge_check` | (not in the earlier sweep) the legacy fronts are the same three rectangles in the other order | stale | compared bottom-up |
| `project_showcase_check` | (not in the earlier sweep; green on `main`) the Projects tab became the person's own profile and everything they have made (ed8c399), and no longer has the old page that selected a project's category and description. Behind it, "selects the category" was a pattern for the word between *any* two quotation marks, which matched the code between one string and the next | stale, and a **weak assertion, fixed** | the columns are read from the query itself (the portfolio's `select`, the project entry of `sources.ts`) and compared as names; three mutants, all caught (one was not before) |
| `calculator_check` | the home page stopped placing the calculators rail when it was matched to the blue construction reference (dc51c4e) | stale | the assertion is replaced by a note; navigation, sitemap and hub still reach every calculator |
| `ai-router-check` | (not in the earlier sweep) the Design section was regrouped: the studio is the Cabinet Design row, "Saved Cabinet Designs", "Design Gallery"; "AI Cost Estimator", "AI BOQ Generator" | stale | rows asserted with their hrefs; mutation plan added |
| `map_check` (9) | the shell is translated, the start panel and studio flow with the page, and the bottom control sheet is gone | 7 stale, **1 rule broken** | the sketch toolbar's list was capped at `30dvh` inside the workspace, which the check forbids; it is `max-h-60`. Mutation plan added |
| `studio_controls_check` (6) | the design tab opens first and flows, the drawing is sticky, a new project clears the draft | 5 stale, **1 real**: the corner "Number of shelves" was a raw number input (`Number("")` is 0, so it cannot be emptied), the pattern the check forbids | now the editor's own `Stepper`. Mutation plan added |
| `price-surfaces-check` (2) | the guard on the price queue moved from `is_admin` to the control room's `canAdmin("prices")` (0558dfe); it was renamed, never removed | stale | the guard is read where it is, one function at a time (`requireAdmin`, then `verifyPrice` and `rejectPrice` each calling it before they write), and the page answers a non-administrator with `notFound()`; six mutants |
| `used_items_check` (2) | the sign in form sanitises `redirect` and `next` together, and the card shows the shared `DemoBadge` from `is_sample` instead of the word "Sample" | stale | the call and the badge are asserted where they are, with the hidden input that carries the sanitised value; five mutants |
| `touch_feedback_check` (4) | the rail was given words (40b33e8) and a language (bacce6d): names come from `t(navigationKey(id))`, a section's target is a column rather than a fixed 44 px box, the unbuilt row's chip is translated | stale | the names are asserted as written, the target height is worked out from its icon, gap, one line of label and padding (44.35 px, fails under 44), the home badge is 44 px; nine mutants |
| `image_import_check` (1) | the scan takes the walls-only choice as well as the polarity | stale | pinned with both, and the scan after a crop, which was never looked at, too; four mutants |
| `kitchen-ui-check` | a kitchen is started from the cabinet start wizard (64779aa) and asks for appliance positions only in "Sketch with Plan" (9ab5dbf). **Worse behind it: a mutation whose text had left the source threw "Mutation matched", which `assert.rejects` counted as the check noticing**, so four of its mutations had not been applied for a while and a fifth was not noticed at all | stale, and a **harness fault, fixed** | a missing target is an error of its own and is not accepted as a rejection; the four are pointed at the code as it is, and the three that then survived are killed by new assertions in `wardrobe_shape_check` and `kitchen-detail-check` (corners that no run hosts, the gable of a diagonal corner, a corner's own kind, the two doors over the fridge); eleven mutants |
| `freehand_check`, `wall_joins_mutation_check`, `freehand_mutation_check` | the locked-stroke branch (3f8fbeb, bf2ab8c) had no test, and both mutation scripts had drifted from the code (the first occurrence of `if (horizontal.length) mean.y` became the locked branch, `if (tolerance > 0)` the squaring block, three more targets were gone) | untested rule, scripts stale | locked walls stay put, a corner at a locked wall's end stays on its line, loose walls in a row share one line; the script breaks 19 rules and every one is caught |
| `profile_columns_check` | **not red**: it applies the migrations to a running PostgreSQL 16 and the sweep had none (the harness says so: "Connection refused") | environment | passes (34) against the server `supabase/tests/run.sh` starts; the runner runs it when a server answers and says so when it does not |
| `tour_check` (1) | `next.config.ts` lets `next/image` fetch signed storage URLs since Agenda's site photos (311dbff); the tour's check says it must not, because the optimiser keeps a copy that outlives the signature | **left red** | a decision for the owner (below) |
| `layout-check` (5) | the L-corner solver clamps the corner to `wall − 300 mm` (e202ac5, ed619bf), so a short wall shrinks the corner instead of being reported: 700 mm gives a 400 × 600 corner, 320 mm gives **20 mm**, with no note | **left red** | a decision for the owner: a corner narrower than the run it meets is not a corner |

Still red after this work, run by `node scripts/run_repository_checks.mjs` (`npm run check:repository`, and `.github/workflows/repository_checks.yml` on every pull request): `layout-check` and `tour_check`, each a decision for the owner and listed in the runner with its reason. Not run by it: the five browser checks (`font_check`, `house_layout_check`, `house_project_check`, `house_sketch_check`, `house_touch_check`; the four house plan ones time out waiting for the "Run →" control, at `2cff67d` as well as now), and `profile_columns_check` where no PostgreSQL server answers.

`repository_checks.yml` was run the way the job runs it, in a fresh clone of the committed tree with `npm ci` and no database: 125 checks, 123 pass, the two above are red, none fail. It has not run on GitHub yet. Pull request workflows do not start for a pull request that conflicts with its base (#22 does), and a manual run needs the file on `main`; the `construction checks` workflow did run there, on two pushes, and passed both times.

## 9. Found and left for the owner

None of these was changed, because each is the owner's design to decide.

1. **L corners on short walls** (above).
2. **Legs bought and legs drawn.** A 2400 mm TV unit draws 8 legs (four corners and a pair per 900 mm) and the hardware list buys 12 (a leg every 500 mm, front and back). Two rules for one thing; the list is never short of the drawing, which is what `berchuma-check` asserts.
3. **The example wardrobe is not valid by the studio's own rules.** Its bay 2 has one 776 mm leaf; a hinged leaf may be 600 mm, so every design that is opened or made is given a pair. `wardrobeExample()` is used only by the checks, so it was left alone.
4. **A typed drawer height is not kept exactly.** Typing 270 for the bottom of four drawers gives 253: the editor scales every height, the one typed included, to fill the opening.
5. **Legacy sizing leaves a 6 mm reveal above the top front** (the faces' two 3 mm gaps), and **fractional front heights** (201.33 mm in the model, 201 on the cut list). Both are what saved designs have always produced, and changing them changes saved quotes.
6. **A manually sized door may leave a 204 mm neighbour**, under the 250 mm the automatic layout keeps.
7. **Dead code after the end-panel decision**: the `end` and `decorative_end` kinds, their labels and the hinge-clearance rule in `closure-panels.ts`; and `CalculatorRail`, which no page places.
8. **`next/image` and signed URLs.** Agenda's site photos are served from a private bucket as signed URLs through `next/image` (`photo-wall.tsx`, no `unoptimized`), which needed `/storage/v1/object/sign/**` in `next.config.ts`. The tour's check forbids that path: the optimiser caches by URL and serves the copy from `/_next/image` with no authorisation, so a copy of a site photograph can outlive the signature that protected it. Either the photo wall renders with a plain `<img>` (as the tour does for a pending room) or the exposure is accepted; the check stays red until one is chosen.
9. **Closure panels never stand in front of the carcass.** The door swing in `closure-panels.ts` (`doorProud`, `doorSwingConflict`) only matters to a panel with a negative `z`, and since end panels stopped being made automatically no panel kind has one, so the thickness a hinged door contributes to the swing test cannot change any result. It is working code that nothing reaches.

## 10. How the golden fingerprints moved

`berchuma_display_check` pins what six designs build. They were recorded at e230482 (5 October) and held through every commit after it until **69cb526 (11 October, "Implement front grip geometry, hardware counts and consistent drawer gaps")**, which changed all six: the three saved wardrobes the check opens, the kitchen and the TV unit, as well as the example. Each later change moved them again (door sizing 82ab9ad, which keeps the old sizing for designs saved before it; the depth rule a37d17c; the order of the fronts). Fingerprints at the commits that mattered are in the commit message of the refresh. A design saved before 11 October reopens with fronts of a different height and a finger gap: a deliberate decision, but one that nothing recorded.
