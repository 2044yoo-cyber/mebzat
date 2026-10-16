# Medosha audit, 16 October 2026

Branch `claude/last-job-stopping-point-ovz31u`. Nothing here was merged to `main`, deployed by hand, or run against production data.

## Read this first

The brief asked for up to 100 numbered items. This report has **100 slots, but only the items with evidence are marked as defects.** Where I did not or could not inspect something, the slot says **Unverified** and names what is missing. I did not invent defects to fill the count. The honest totals are in the summary table.

**What was inspected.** The repository source (routes, API routes, server actions, migrations and RLS, storage buckets, config), every `scripts/*check*` script that runs without a network, `tsc`, `eslint`, `next build`, and the Vercel status of the latest pushed commit.

**What was not inspected.** The live site https://www.medosha.net, a signed-in session, Supabase at runtime (so RLS was read, not exercised), Chapa payments, social publishing, email, and any phone or tablet. This session has no access to those. Items that depend on them are Unverified.

## Summary

Counted over the 100 slots at the bottom (one root cause per slot):

| Status | Slots |
| --- | --- |
| Confirmed defect, fixed (D1 to D6, D10, D11, plus the lint fix) | 9 |
| Confirmed defect, not fixed (D7, D8, D9) | 4 |
| Owner decision needed | 1 |
| Improvement | 4 |
| Missing feature (no CI) | 1 |
| Inspected, behaviour verified by a passing check | 14 |
| Inspected, no defect found | 8 |
| Unverified | 59 |

D1 to D11 below are the defects themselves; the slot table maps them to areas, so a defect can appear in more than one slot. The counts add to 100.

Verification actually run on the final tree (tsc, the checks named in each item, `npm run build`, results on the last commit) is in the last section.

---

## Confirmed defects

### D1. Vertical divider cuts through drawers and hanging rails (C, High, fixed)
- **Where.** `src/features/berchuma-studio/services/geometry.ts` (divider part), `operations.ts` `setBayVerticalDivider`, `components/editor/control-panel.tsx`.
- **Evidence.** A probe that switched the divider on in every section of the example designs and tested the part boxes for overlap found the divider colliding with `rail` (wardrobe hanging section), and with `drawer_back` and `drawer_base` (kitchen, vanity and TV unit drawer sections). Shelf sections had no collision.
- **Expected.** The divider only goes where nothing runs the full width of the section.
- **Actual.** It was added to the cut list and the 3D model through the drawer boxes and the rail.
- **Root cause.** The divider ignored the section's fitting.
- **Correction.** New `services/vertical-divider.ts`: `verticalDividerBlocker` (reason text) and `verticalDividerBuilt`. The operation refuses a blocked section, geometry builds only where allowed, and the panel shows why the control is disabled.
- **Compatibility.** A saved design that already has the divider set on a blocked section still opens. The divider is simply not built and the panel says so. Nothing is deleted from the saved file.
- **Re-test.** `berchuma_vertical_divider_check` (248 checks) covers refusal, saved-design reopen, no collision in every starting design, and split-shelf arithmetic (left + half = divider x, right starts after the divider, equal widths). 12 mutants, all caught. Commit `063a384`.
- **Risk.** Someone who liked a divider in a drawer section loses it from the cut list. That is the point, but it is a visible change.

### D2. Cutting plan: banding drawn from text that does not say which side (E, Medium, fixed)
- **Where.** `components/cutting-plan-preview.tsx`, new `services/banding-edges.ts`.
- **Evidence.** Crafted-panel render tests. A part with banding "Front" or "One end" says which kind of edge but not which of the two, and unknown text is not in the cut-list vocabulary.
- **Correction.** `bandedSides` reads only the exact vocabulary from `describeBanding`. "All four edges", "Front + back" and "Both ends" are drawn. A single front, back or end is listed as "not drawn: the cut list does not say which side". Unrecognised text is "not drawn: check the cut list". Rotated parts swap the sides.
- **Re-test.** `cutting_plan_check` (4,636 checks): exact red-line counts and positions, rotation, the vocabulary table, unknown text. Commit `e938074`.

### D3. Cutting plan: part IDs not tied to the cut list rows (E, Medium, fixed)
- **Where.** `services/cabinet-project.ts`.
- **Evidence.** The layout part carried no cut-list ID, so a panel on the sheet could not be matched to its row, and shared-sheet rows from different designs could repeat the same part ID.
- **Correction.** Layout parts carry `partId` and `banding` from their row. Rows from the second design onward are prefixed `n-` so IDs are unique across a shared sheet. The label on the sheet is `index · partId`.
- **Re-test.** `cutting_plan_check`: every layout ID exists in the exported rows, board, size and banding match including rotation, per-ID counts equal quantity, nothing omitted or duplicated, utilisation matches the panels, offcuts lie on existing sheets, a saved project reopens. Commit `e938074`.

### D4. Cutting plan: separate-sheet layouts reused sheet numbers (E, Low, fixed by reading, not reproduced)
- **Where.** `services/cabinet-project.ts`, the separate nesting branch.
- **Evidence.** By code reading, sheet numbers restarted at 1 per design. The branch is reached only when shared nesting fails or a board is missing from the stock catalogue, so I could not trigger it from a normal design. **Not reproduced.**
- **Correction.** A running offset keeps sheet numbers unique; `cutting_plan_check` asserts unique sheet numbers per board. Commit `e938074`.

### D5. Community post edit wrote a column that does not exist (H, High, fixed)
- **Where.** `src/app/community/actions.ts:147`.
- **Evidence.** The Vercel build failed with `Type 'string' is not assignable to type 'never'`. `edited_at` is in no migration; `posts` has `updated_at`.
- **Correction.** Write `updated_at`. Commit `362f10a`, build green afterward.

### D6. `verticalDivider` made the type check fail (J, High, fixed)
- **Where.** `src/features/berchuma-studio/types/spec.ts`.
- **Evidence.** `tsc` reported about 30 errors, "Property 'verticalDivider' is missing". Zod `.default()` makes the inferred output type required.
- **Correction.** `.optional()`. Commit `3bd8880`.

### D7. Lint: 24 errors remain (J, Medium, not fixed)
- **Evidence.** `npx eslint` reports 25 errors on this branch; I fixed the one in my own `construction-scene.tsx` (named value instead of an expression in a `useMemo` dependency list). The 24 left are:
  - 8 `react/no-unescaped-entities` in `ai-disclaimer`, `credits-policy`, `legal` (2), `marketplace-policy`, `user-content`, `designs/[slug]/cut-list`, `studio/offcuts` pages. Cosmetic: they render correctly.
  - 15 `react-hooks/refs` ("cannot access refs during render") in `house-designer/components/image-to-3d-importer.tsx`. These can show stale values.
  - 1 `react-hooks/set-state-in-effect` in `house-designer-workspace.tsx:284`.
  - 1 `react/no-unescaped-entities` in `image-to-3d-importer.tsx:745`.
- **Why not fixed.** The `image-to-3d-importer` refs are in code the owner wrote and need a behavioural check of the importer to change safely. I did not want to touch it without one.

### D8. Nine checks are still red (J, Medium, not fixed)
- **Evidence.** The regression sweep (52 checks) was 33 pass / 19 fail at the start of this audit and is **42 pass / 9 fail** after the second pass (D12). Nine remain: `berchuma-check` (57 assertions), `berchuma_dimensions_check`, `berchuma_display_check`, `berchuma_doors_check`, `calculator_check` (1), `layout-check` (5), `map_check` (9), `studio_controls_check` (6), `berchuma_closure_check`.
- **What I established for each of the nine.**
  - `berchuma_closure_check`: encodes automatic end panels that the owner deliberately removed. Identical failure with my changes stashed. **Owner decision.**
  - `calculator_check`: the home page no longer renders `<CalculatorRail />` (removed in `dc51c4e`, the homepage redesign). The component still exists, unused. Owner decision, not a bug.
  - `berchuma_dimensions_check`: two things changed. Drawer fronts are now 201 mm with 25 mm gaps between them (the finger-gap work, `69cb526`, `badec66`) where the check expects 218 mm with none. More important, with the check's arithmetic corrected for the gaps, the wardrobe's middle column still sums to **2294 mm, not 2300**: the top drawer front ends at y 772 and the fixed shelf above starts at y 778, a 6 mm sliver that the dimension chain does not list. It may be an intended reveal; the old check treated "the chain adds up" as a rule. **Needs the owner's call** on whether the 6 mm is deliberate (then list it) or a rounding fault in the drawer band (then fix it). Not changed.
  - `berchuma_display_check`: compares a hash of the three-bay wardrobe's parts "exactly as before". The hash differs because of the deliberate geometry changes of 11 to 15 October. A golden hash cannot say whether anything is wrong; refreshing it means accepting the new output. Needs the owner.
  - `berchuma_doors_check`: after "prefer practical kitchen cabinet door widths" (`2612c65`) a 764 mm wall unit whose left leaf is set to 300 mm gets two more leaves of 204 and 252 mm instead of one of 379 mm. A 204 mm door is narrow; whether that is intended is unknown. Not changed.
  - `layout-check`: the five failures all test the note that fires when a wall is "barely longer than the corner". Since the dedicated corner modules (`08ba749`) the corner module shrinks instead, to keep a 300 mm run: probe of an L layout with wall A at 320, 400, 500, 800 and 1000 mm gives corner widths of 20, 100, 200, 500 and 600 mm and **no note at all**. A 20 mm wide corner module is not buildable. Whether a wall that short is a realistic input is the open question; not changed.
  - `map_check` (9) and `studio_controls_check` (6): regexes over CSS classes and component source for scrolling, sticky drawing and draft handling. They need a browser to say whether the behaviour is still right. Unverified.
  - `berchuma-check` (57): not diagnosed.
- **Why this matters.** Each red check hides whether a regression is inside it. Those marked "needs the owner" are decisions, not defects I can close.

### D9. Tarballs and patches committed to the repo root (I, Low, not fixed)
- **Evidence.** `git ls-files` lists `errorboundaries.patch`, `medoshafixes.patch`, `medoshamessaging.tar.gz`, `medoshaupdate.tar.gz`, `update.tar.gz`.
- **Why not fixed.** Deleting tracked files is the owner's call, and I did not open the archives to learn what they hold.

### D10. Floor finishes were measured to the wall centre-lines (B, Medium, fixed)
- **Where.** `src/features/house-designer/services/quantities.ts`, row `FIN-02` ("Floor finishes"), which feeds the takeoff hand-off.
- **Evidence.** A room's boundary runs along wall centre-lines: a native 4000 x 5000 room with 150 mm walls has a boundary of exactly 4000 x 5000. The row summed that polygon, so the room was 20.00 m² of floor finish; the floor between the wall faces is 3.85 x 4.85 = 18.67 m². Walls are drawn centred on the boundary, so half of every surrounding wall was being priced as floor.
- **Correction.** New `services/clear-inside.ts` moves each boundary edge inward by half the thickness of the wall standing on it (an edge with no wall stays put), and falls back to the boundary with `exact: false` when the walls would swallow the room. `FIN-02` uses it per room and per level.
- **Not changed.** The Measurements drawer still reports room size and area from the boundary (the owner's `house_measure_check` pins "27.30 m²"). That is a centre-line convention, and the BOQ row now differs from it on purpose.
- **Re-test.** `house_clear_inside_check` (14 checks: rectangle, either winding, walls of different thickness, open side, L shape, collinear point, room eaten by its walls, input not mutated, one level and two). 8 mutants, all caught. Commit `26a3eb3`.

### D11. Deleting a wall silently bent a locked neighbour (C, High, fixed)
- **Where.** `src/features/house-designer/services/model-commands.ts`, `deleteHouseSelections`, footprint branch.
- **Evidence.** In the default 8000 x 6500 house, lock the left wall and delete the top wall: nothing is blocked and the locked wall changes from (0, 6500)→(0, 0) to (0, 6500)→(8000, 0), a diagonal. Deleting a corner re-draws the wall that arrives at it, and the lock check only looked at linked joints, which are off by default.
- **Correction.** The delete is refused, with the plan returned unchanged, when the wall arriving at the deleted corner is locked. A locked wall on the other side of the deleted one is not touched and does not stop it.
- **Re-test.** Three new assertions in `house_commands_check` (plan unchanged, message, far side free) and a 3 mutant plan, all caught. Commit `26a3eb3`.

### D12. Nine house-plan and menu checks were stale, not the code (J, Medium, fixed)
`house_model_check`, `freehand_check`, `house_commands_check`, `house_quick_edit_check`, `house_open_space_check`, `room_topology_check`, `wall_group_check`, `berchuma-ai-check` and `cabinet_design_check` all failed because they encode behaviour the owner changed on purpose, each time with a commit that says so:
- A footprint corner moves only when that end of the wall is linked (`ac636a3`, `538dd07`, `ad0a387`); a group move touches only the selected walls (`d182d8d`). The checks now assert that rule, including the refusal message, instead of the old "neighbours follow".
- `freehand_check` measured a room's centre-line boundary as if it were the clear inside; it now measures clear inside with the D10 helper. Its depth tolerance is half a drawing unit because the bottom stroke is drawn from y 249 to 250.
- `wall_group_check` built a freehand plan on top of a footprint slab, which leaves the slab with an empty boundary and fails the schema; `applyFreehand` refuses that start ("Convert on a blank plan"), so the app cannot produce it. The fixture now starts from a blank floor.
- `berchuma-ai-check` expected the price key "MDF 18mm walnut"; the catalogue says "MDF 18mm melamine" since the 12 September price update (`5ac452f`). It now compares with the catalogue.
- `cabinet_design_check` looked for the old `berchuma` menu section and a Studio link in the menu bar; the menu was reorganised (`6b76718`, `b5e6c3a`). It now looks at the `cabinet-design` and `furniture-design` entries, and at the view-aware colour in `PartMesh`.
Every changed check has mutants that fail it (`house_model.json`, `freehand_inside.json`, `house_commands.json`, `house_quick_edit.json`, `house_open_space.json`, `room_topology_group_move.json`, `wall_group.json`, `berchuma_ai_price_key.json`, `cabinet_design_nav.json`). Two plans were trimmed of mutants that are equivalent for what the check exercises. Two mutants in the owner's existing `room_topology.json` plan now **survive** ("outside wall drags room corners again", "walls moved together not reconciled"): the code they break is no longer reached by moves in that check. Left as is. Commits `26a3eb3`, `52fff27` and the one after it.

---

## Improvements and missing features (not defects)

- **No CI.** There is no `.github/workflows`. The only automatic gate is the Vercel build, which runs type checking but not lint and not the 169 scripts. Missing feature.
- **Checks are not wired in.** `package.json` exposes 14 check scripts and has no `test` or `typecheck`. Improvement.
- **No Content-Security-Policy.** `next.config.ts` sets nosniff, frame deny and a referrer policy, and says a CSP was left out on purpose. Improvement.
- **No rate limiting** on the unauthenticated `GET` routes (`/api/search`, `/api/locations/search`, `/api/properties/*`, `/api/buildings/viewport`, `/api/feed`). They validate their inputs, and the signed-in AI routes hold credits first. Improvement; I did not test load.
- **`CalculatorRail` is dead code.** See D8.
- **Divider message for an open section** says it "mixes fittings", which is slightly off for an empty section. Improvement, wording only.
- **Missing feature:** the divider cannot go through drawers or hanging sections at all. A real product might offer a partial-height divider. That is a design decision.

## Inspected, no defect found

- **RLS.** My first scan listed ~50 tables as lacking RLS. That was a false positive of my own script: the migrations enable it in `do $$ ... foreach t ... execute format(...)` loops. I read `0097_account_roles.sql` (agent and seller profiles: public read, owner-only write) and confirmed it. I did not check each table's policies one by one.
- **Server actions.** Every action file I opened checks the caller: `requireViewer`, `canAdmin(area)`, or a `getUser()` inside the service it calls (`studio/offcuts` → `services/offcuts.ts`, owner filtered). Admin actions re-check the area. Account deletion uses the session id, never an argument.
- **Webhook.** `/api/billing/webhook/[provider]` reads the raw body, rejects a wrong signature, claims the event by a unique insert, and verifies with Chapa before granting anything. It accepts unsigned deliveries on purpose and documents why. Not a defect.
- **Cron route** uses a shared secret with `timingSafeEqual`.
- **Storage.** Every bucket insert I saw sets a size limit and a MIME allowlist.
- **Secrets.** No keys in tracked files; only `.env.example`. The service client is imported only by routes and server actions.
- **i18n.** `scripts/i18n_check.ts` passes: three complete catalogues, navigation coverage, persistence, selector.
- **`dangerouslySetInnerHTML`** is used for JSON-LD through `safeJsonLd` and for one font script.

---

## The 100 slots

Each slot is one root cause. "U" means Unverified and the reason is in the right-hand column.

| # | Area | Status | Reference or what is missing |
| --- | --- | --- | --- |
| A1 | Navigation on the live site | U | Needs live site access |
| A2 | Broken links crawl | U | Needs live site access |
| A3 | Auth redirects / session expiry | U | Needs a signed-in session |
| A4 | Route error boundaries | U | Not inspected |
| A5 | Loading states | U | Not inspected |
| A6 | 404 handling | U | Needs live site access |
| A7 | Build and type check | Fixed | D5, D6; `tsc` and build clean on final tree |
| A8 | Middleware (`src/proxy.ts`) | U | Not read |
| A9 | Env handling | No defect | `.env.example` only; `next.config.ts` tolerates a missing Supabase URL |
| A10 | Deployment status | Verified | Vercel reported "Deployment has completed" for `063a384` |
| B11 | Unit conversions | U | Not inspected |
| B12 | Calculator arithmetic | U | `calculator_check` 344 pass, 1 fail (see D8) |
| B13 | Calculator page reachable | Improvement | `CalculatorRail` dead code |
| B14 | Rounding rules | U | Not inspected |
| B15 | Floor finish quantity (house BOQ) | Fixed | D10 |
| B16–B20 | Other calculators | U | Not inspected individually |
| C21 | Vertical divider collisions | Fixed | D1 |
| C22 | Split shelf geometry | Verified | Arithmetic in `berchuma_vertical_divider_check` |
| C23 | Hinge door sizing | Verified | `berchuma_hinge_check` 6,113 pass |
| C24 | Closure / end panels | Owner decision | D8 |
| C25 | Saved designs load | Verified | divider and cutting plan checks reopen saved designs |
| C26 | Locked wall re-drawn by deleting its neighbour | Fixed | D11 |
| C27 | Room topology and group move | Verified | D12; `room_topology_check` 1,096 pass, `wall_group_check` pass |
| C28 | House model, quick edit, open space, freehand | Verified | D12; all four checks pass after aligning them with the linked-joint rule |
| C29 | Berchuma core | U | D8, `berchuma-check` 57 fail, undiagnosed |
| C30 | House Designer on mobile | Verified (partly) | `house_mobile_check` passes; construction lab browser check passed 96 checks when last run |
| D31 | Construction learning model | Verified | `construction_lab_check` 16,793 pass |
| D32 | Construction lab rendering | Verified | Playwright check, last run green; not re-run in this pass |
| D33 | Lab lint | Fixed | `use-memo` error removed |
| D34 | Takeoff hand-off | Verified | covered by `construction_lab_check` |
| D35–D40 | Other stages / generators | U | Not inspected beyond the checks above |
| E41 | Banding drawn without a side | Fixed | D2 |
| E42 | Part IDs vs cut list | Fixed | D3 |
| E43 | Sheet numbers, separate nesting | Fixed (not reproduced) | D4 |
| E44 | Utilisation and offcuts | Verified | `cutting_plan_check` |
| E45 | Cut list generation | Verified | `cut_list_check` passes |
| E46 | Board prices | Verified | `board-prices-check` passes |
| E47 | BOQ from agenda | U | Not inspected |
| E48 | Fabrication | Verified | `fabrication-check` passes |
| E49 | Offcut inventory auth | No defect | owner-filtered |
| E50 | Offcut inventory page lint | D7 | unescaped quote |
| F51–F60 | Marketplace and suppliers | U | Not inspected; needs data and a signed-in session |
| G61–G70 | Services, professionals, properties | U | Not inspected; property API routes validate ids and bounds |
| H71 | Community edit | Fixed | D5 |
| H72–H80 | Community, digital products | U | Not inspected |
| I81 | Server action auth | No defect | see above |
| I82 | Webhook integrity | No defect | see above |
| I83 | Cron secret | No defect | see above |
| I84 | RLS enabled | No defect | read, not exercised |
| I85 | Storage limits | No defect | read, not exercised |
| I86 | Secrets in repo | No defect | scan found none |
| I87 | CSP | Improvement | see above |
| I88 | Rate limits | Improvement | see above |
| I89 | Tarballs in repo | D9 | |
| I90 | RLS exercised on Postgres | U | needs a test database; I did not run one in this pass |
| J91 | Lint | D7 | 24 errors left |
| J92 | CI | Missing | no workflows |
| J93 | Test scripts wired | Improvement | |
| J94 | Red checks | D8 | |
| J95 | Accessibility audit | U | needs a browser pass |
| J96 | Performance / Lighthouse | U | needs the live site |
| J97 | Bundle size | U | not measured |
| J98 | Mobile layout beyond house designer | U | needs devices |
| J99 | Localization of new strings | U | `i18n_check` passes; the new strings in the construction lab and divider panel are English only; I did not check whether the app expects them translated |
| J100 | Release readiness | U | see "External verification" |

(The summary counts at the top roll the slots up by status. Slots grouped like "B15–B20" count as Unverified once per slot.)

---

## Files changed (all on `claude/last-job-stopping-point-ovz31u`)

| Commit | Content |
| --- | --- |
| `362f10a` | Community edit writes `updated_at` |
| `3bd8880` | `verticalDivider` optional in the schema |
| `e938074` | Cutting plan IDs, banding edges, sheet numbers; `banding-edges.ts`, `cutting_plan_check.ts` + 12 mutants |
| `063a384` | Divider only in shelf sections; `vertical-divider.ts`, updated check + 12 mutants |
| `d24f5f2`, `b62382b` | Construction scene lint fix; this report |
| `26a3eb3` | Floor finishes between wall faces (`clear-inside.ts`); deleting a wall no longer bends a locked neighbour; three checks aligned |
| `52fff27` | Four house-plan checks aligned with linked joints and one-shot group moves |
| next | `berchuma-ai-check` and `cabinet_design_check` aligned; this report updated |

## Verification run on the final tree

- `npx tsc --noEmit`: clean.
- `npx eslint`: 24 errors, 23 warnings (was 25 errors); the errors are the ones in D7.
- Regression sweep, 52 checks: **42 pass, 9 fail** (was 33 / 19 at the start of the audit). The nine are D8.
- Checks of this audit, run again on the final tree: `cutting_plan_check` 4,636, `construction_lab_check` 16,793, `berchuma_vertical_divider_check` 248, `house_clear_inside_check` 14, `berchuma_hinge_check` 6,113, `i18n_check` pass.
- Mutation testing: every plan added or changed in this audit reports all its mutants caught, except the two survivors in the owner's `room_topology.json` described under D12.
- `npm run build` and Vercel: see the final message for the last commit; a pending Vercel status is not a pass.

## External verification still required

1. A signed-in pass over the live site on desktop and phone (navigation, mobile, accessibility, performance).
2. A Postgres run of the policies with a non-superuser `authenticated` role, per AGENTS.md.
3. A Chapa sandbox payment through checkout and webhook.
4. Owner decisions: the removed automatic end panels (`berchuma_closure_check`), the homepage calculator section, the committed tarballs, the 6 mm sliver above the top drawer, the 204 mm wall-unit door, the corner module that shrinks without a note, whether to refresh the golden hash in `berchuma_display_check`.
5. A browser run for `map_check` and `studio_controls_check`.

## Recommended next batch

1. Diagnose `berchuma-check` (57 assertions), the largest red check left.
2. Fix the 15 `react-hooks/refs` errors in `image-to-3d-importer.tsx` behind a behavioural check.
3. Add a GitHub Actions workflow that runs `tsc`, `eslint` and the checks that pass today, so a regression is caught before Vercel.
4. Run the RLS policy tests against Postgres 16.
5. Decide D8's "needs the owner" items, then turn each answer into a check that cannot go stale (assert the rule, not the number).
