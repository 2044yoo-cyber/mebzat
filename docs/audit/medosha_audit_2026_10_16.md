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
| Confirmed defect, fixed (D1 to D6, plus the lint fix) | 7 |
| Confirmed defect, not fixed (D7, D8, D9) | 4 |
| Owner decision needed | 1 |
| Improvement | 4 |
| Missing feature (no CI) | 1 |
| Inspected, behaviour verified by a passing check | 12 |
| Inspected, no defect found | 8 |
| Unverified | 63 |

D1 to D9 below are the defects themselves; the slot table maps them to areas, so a defect can appear in more than one slot. The counts add to 100.

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

### D8. 17 existing checks fail, and a further check fails after the owner's recent change (J, Medium, not fixed)
- **Evidence.** The sweep (`runall.sh`, 52 checks) gave 33 pass, 19 fail on this branch. The same 17 failed on the starting baseline, and `berchuma_closure_check` now fails too.
- **Failing:** `berchuma-ai-check` (1), `berchuma-check` (57), `berchuma_dimensions_check`, `berchuma_display_check`, `berchuma_doors_check`, `cabinet_design_check`, `calculator_check` (1), `freehand_check`, `house_commands_check`, `house_model_check`, `house_open_space_check`, `house_quick_edit_check`, `layout-check` (5), `map_check` (9), `room_topology_check`, `studio_controls_check` (6), `wall_group_check`, `berchuma_closure_check`.
- **What I established.**
  - `berchuma_closure_check` encodes automatic end panels that the owner deliberately removed. The failure is identical with my changes stashed. **Needs an owner decision**, not mine to rewrite.
  - `calculator_check`: the home page no longer renders `<CalculatorRail />` (removed in `dc51c4e`, the homepage redesign). The component still exists but nothing uses it. This looks like an owner decision, not a bug.
  - `wall_group_check`: the freehand fixture builds a plan with no corners, so the project fails `houseProjectSchema` with or without the move (empty slab and roof boundary). That points to the fixture, not the move command. Whether the app can produce such a plan is **unverified**.
  - The other failures I did not diagnose.
- **Why this matters.** Each red check hides whether a real regression is in there. I cannot call them defects or call them stale without a root cause for each.

### D9. Tarballs and patches committed to the repo root (I, Low, not fixed)
- **Evidence.** `git ls-files` lists `errorboundaries.patch`, `medoshafixes.patch`, `medoshamessaging.tar.gz`, `medoshaupdate.tar.gz`, `update.tar.gz`.
- **Why not fixed.** Deleting tracked files is the owner's call, and I did not open the archives to learn what they hold.

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
| B15–B20 | Other calculators | U | Not inspected individually |
| C21 | Vertical divider collisions | Fixed | D1 |
| C22 | Split shelf geometry | Verified | Arithmetic in `berchuma_vertical_divider_check` |
| C23 | Hinge door sizing | Verified | `berchuma_hinge_check` 6,113 pass |
| C24 | Closure / end panels | Owner decision | D8 |
| C25 | Saved designs load | Verified | divider and cutting plan checks reopen saved designs |
| C26 | Wall move on freehand plan | U | D8, fixture suspect |
| C27 | Room topology checks | U | D8, failing, undiagnosed |
| C28 | House model dimensions | U | D8, `house_model_check` 8000 vs 8200, undiagnosed |
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

## Files changed in this pass (all on `claude/last-job-stopping-point-ovz31u`)

| Commit | Content |
| --- | --- |
| `362f10a` | Community edit writes `updated_at` |
| `3bd8880` | `verticalDivider` optional in the schema |
| `e938074` | Cutting plan IDs, banding edges, sheet numbers; `banding-edges.ts`, `cutting_plan_check.ts` + 12 mutants |
| `063a384` | Divider only in shelf sections; `vertical-divider.ts`, updated check + 12 mutants |
| this commit | Construction scene lint fix; this report |

## Verification run on the final tree

- `npx tsc --noEmit`: clean.
- `npm run build`: passed at `063a384`. Re-run result for the last commit is stated in the final message.
- `npx eslint`: 25 errors before, 24 after my fix; the remaining ones are listed in D7.
- Checks, this branch: `cutting_plan_check` 4,636 pass, `construction_lab_check` 16,793 pass, `berchuma_vertical_divider_check` 248 pass, `berchuma_hinge_check` 6,113 pass, `i18n_check` pass. Regression sweep 33 pass / 19 fail; the 19 are D8.
- Mutation testing: both mutant plans for the divider and the cutting plan report all mutants caught.
- Vercel: "Deployment has completed" for `063a384`. There is no other CI to inspect.

## External verification still required

1. A signed-in pass over the live site on desktop and phone (navigation, mobile, accessibility, performance).
2. A Postgres run of the policies with a non-superuser `authenticated` role, per AGENTS.md.
3. A Chapa sandbox payment through checkout and webhook.
4. Owner decisions: the removed automatic end panels (`berchuma_closure_check`), the homepage calculator section, the committed tarballs.

## Recommended next batch

1. Diagnose each of the 17 older red checks one at a time (stale test or real regression) and record the answer here.
2. Fix the 15 `react-hooks/refs` errors in `image-to-3d-importer.tsx` behind a behavioural check.
3. Add a GitHub Actions workflow that runs `tsc`, `eslint`, and the checks that pass today, so a regression is caught before Vercel.
4. Run the RLS policy tests against Postgres 16.
