# Building configurator, automatic BOQ and live estimate: audit and plan

Branch `claude/last-job-stopping-point-ovz31u`. Audit run before any edit for this work.

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
