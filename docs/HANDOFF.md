# Medosha — project handoff

A briefing for another engineer or model picking this up cold. It describes what
exists, what is verified, what is not, and where the open decisions are.

Written 13 August 2026. Head commit `3c9f8a3`.

---

## 1. What the product is

**Medosha** is a construction marketplace and professional network for Ethiopia,
plus **Berchuma Studio**, a parametric design and fabrication tool inside it.
Currency is ETB, units are metric, the market is Addis Ababa and regional cities.

The through-line the whole system is built around:

```
drawing or model  →  measured quantities  →  bill of quantities
                  →  priced from real data  →  editable estimate  →  quotation
```

Every number in that chain carries where it came from, and the UI says so.
"ETB 4,000/m" and "ETB 4,000/m, because you typed it" are different numbers to
somebody deciding whether to trust a total.

---

## 2. Stack

| | |
|---|---|
| Framework | Next.js **16.2.11**, App Router, Turbopack |
| React | 19.2.4, with the React Compiler lint |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` |
| Database | Supabase (PostgreSQL 16) with row-level security |
| 3D | three.js 0.185 + @react-three/fiber (no drei) |
| Payments | Chapa (Ethiopian PSP) |
| Auth | Supabase Auth |

**Version-specific gotchas that have already bitten:**

- Next 16 renamed `middleware.ts` → `proxy.ts`. Docs live in
  `node_modules/next/dist/docs/` and differ from what most training data says.
  Read them before writing framework code.
- The TS target is below ES2018, so the regex `s`/dotAll flag is unavailable.
  Use `[\s\S]` instead of `.` with `/s`.
- `@supabase/supabase-js` 2.110 requires a `Relationships` key on **every** table
  in the hand-authored `Database` type. One table without it fails the generic
  constraint and collapses the *entire* schema to `never` — and the errors
  surface in unrelated files, not the one at fault.

---

## 3. What is built

### 3.1 Platform

Feed, marketplace, companies, professionals, projects, property, jobs (post →
apply → hire → notify), search, messaging, and a dashboard. All backed by RLS
policies. 42 migrations.

### 3.2 Accounts, plans, credits, payments

- Plans, a credit wallet, and **fractional** credits (`numeric`, 3 dp), because
  a one-sentence question and a forty-page analysis are not the same cost.
- `holdCredits` → run → **commit at actual cost** → refund the difference, all in
  one transaction. A failed operation costs nothing.
- Chapa checkout with a unique `tx_ref` per attempt, server-side verification
  (the callback status is never trusted on its own), and idempotent webhooks via
  a unique `(provider, event_reference)` plus a `fulfilled_at` guard.
- Migrations `0037`–`0040`. Checks: `scripts/billing-check.ts`,
  `supabase/tests/credits.sql`.

### 3.3 Medosha AI

One ChatGPT-style chat. There is **no mode picker** — an intent router
(`src/lib/ai/intent.ts`) reads the request and dispatches internally, so the 13
former design tools are reachable without the user choosing a tool first. Their
functionality was moved, not deleted.

Retrieval (`src/lib/ai/context.ts`) pulls real rows for a question and injects
them as a labelled block the model is told is data, not instructions.

Architectural edits preserve original geometry unless the user explicitly asks
to change it.

### 3.4 Berchuma Studio — design and fabrication

- Parametric spec → geometry → parts → cut list, with a 3D editor.
- **Fabrication respects the selling unit.** 18.5 m of aluminium in 6 m stock is
  4 bars at ETB 4,000 = ETB 16,000. Never 18.5 × 4,000. This rule is the reason
  `unit` is non-optional throughout the pricing types.
- First-fit-decreasing bin packing for 1D linear stock and 2D board nesting,
  with kerf and end-trim.
- Openings (windows/doors) with sash, glass and interlock clearances.

### 3.5 Takeoff, BOQ and model import

- **IFC** (ISO 10303-21) parser: quantities, and real swept-solid geometry
  (`IfcExtrudedAreaSolid`, `IfcMappedItem`, placement-chain composition,
  ear-clipping triangulation). **DXF** parser for 2D.
- Measurement (`src/lib/takeoff/measure.ts`): gross/net area, openings, volume,
  perimeter, waste. Every `Quantity` carries its `formula`, `source`,
  `confidence` and contributing `elementIds`.
- **Provenance degrades to the weakest input** (`weakest()`): a calculation is
  only as good as its worst source. AI-estimated data is never presented as
  verified BIM information.
- BOQ with 23 sections (A–W). Trades: paint, masonry, concrete (1.54 dry
  factor), rebar. **Rebar never invents reinforcement** — an empty schedule
  produces a note, not a guess.
- A takeoff workspace with plan view, 3D view and an editable estimate.

### 3.6 The material price book (most recent work)

The owner supplied an Excel of 455 Ethiopian material prices. It became a
database, **not** a prompt and not fine-tuning data.

**Schema — `supabase/migrations/0041_material_price_book.sql`**

- `material_prices`, **append-only**. A price change is a new row, never an
  edit, so history survives to be charted.
- `price_data_status` enum, declared **weakest-first** so `order by data_status
  desc` *is* the order of trust:

  ```
  expired < educational_estimate < web_sourced < supplier_submitted < admin_verified
  ```

- `material_price_events` — every approval, edit, expiry, rejection, written by
  trigger. "Append-only" is only trustworthy if the exceptions are visible.
- RLS: reading is public; a member can only ever write `supplier_submitted`.
  That pin lives in the policy, not in application code where a second caller
  could forget it.
- `expire_stale_material_prices()` marks and never deletes, and exempts
  educational baselines — they were never current, so they cannot go stale.
- `price_search_terms()` splits digit-letter boundaries, so `"MDF 18mm"` finds a
  row whose specification reads `"18 mm"`.

**Seed — `0042_material_price_seed.sql`**, generated by
`scripts/build-price-seed.py`, idempotent: 439 planning baselines +
16 source-backed observations.

**Resolution — `src/lib/prices/`** (pure, no database):

> **Relevance first, then trust, then recency.**
>
> The brief asked for trust order. That is right, but it cannot be the *first*
> question — "which of these is most trustworthy" is meaningless until "is this
> even the material they asked about" has been answered. A verified price for
> 150 mm block is not a weaker answer to a 200 mm question, it is a wrong one.

City is a **preference applied after trust**, never a filter applied before it.
Nobody is told "no price" because they are in the wrong town.

**Integration:**

- AI: a new `prices` `ContextNeed`, retrieved **before** the product catalogue.
  Three outcomes, each with wording the model must use — verified, unverified
  (with caveat), and nothing found (an exact refusal sentence, plus a ban on
  filling the gap from training data). An unreachable database gets its own
  third state so it never reads as an empty book.
- BOQ: the price chain grew from four sources to six —
  `user > product > verified > market > reference > ai`. The book takes **two**
  rungs because its rows are two kinds of fact; collapsing them would either
  promote 439 unreviewed baselines above real listings or bury the verified
  prices beneath them.

---

## 4. How this codebase is verified

There is no test framework. Verification is **hand-written check scripts plus
mutation testing**: after writing a guard, deliberately break the code and
confirm the check fails. A check that passes against broken code is worse than
no check, because it is trusted.

`npm run doctor` runs everything:

| Suite | Checks |
|---|---|
| Berchuma core | 419 |
| Berchuma model contract | 64 |
| Billing (`billing-check.ts`) | 157 |
| AI router (`ai-router-check.ts`) | 147 |
| Fabrication (`fabrication-check.ts`) | 205 |
| Takeoff (`takeoff-check.ts`) | 106 |
| Import (`import-check.ts`) | 112 |
| Estimate (`estimate-check.ts`) | 92 |
| Price book (`price-book-check.ts`) | 81 |

Plus SQL suites run against a real PostgreSQL 16 (not a mock):
`supabase/tests/{credits,jobs,jobs-flow,berchuma-security,berchuma-publish,berchuma-quotes,price-book}.sql`.
`price-book.sql` is 39 checks and runs as `authenticated`, because running as
superuser bypasses RLS and reports that every policy works.

**Real defects mutation testing has caught in this project** (a sample, so the
value of continuing the practice is concrete):

- A webhook answered `200 duplicate` on a *failed* insert, telling Chapa to stop
  retrying a payment it had never recorded.
- `IfcSIUnit` attributes read one index to the right — every metre-file quantity
  came out 1000× too small.
- A ranged price display that read "ETB 5,100 – 9,000 per sheet" for MDF: true
  of the word, false of every product, because the span covered 6 mm to 18 mm.
- An `indexOf`-based ordering check that passed *most loudly* when the thing it
  guarded was deleted (`-1` is less than every real position).
- A regex using `\s` to check for a non-empty env value, which matched the first
  character of the *next line* — so a blank variable read as set.

---

## 5. What is NOT done

### 5.1 The price book's four screens

The data layer and every rule behind these is built and tested. The UI is not:

1. **Price Exchange reading the book.** The page still reads `price_listings`
   (supplier listings + bids, a genuinely different table). Needs the range,
   "latest verified", confidence, source count and status badge.
2. **Supplier submission form.** The database accepts and polices submissions;
   there is no screen to type one into.
3. **Admin verification page.** Approve / reject / edit / expire / compare /
   history. The audit trail already records all of it.
4. **Admin Excel upload with preview** (validate columns, detect duplicates,
   show old vs new, approve). Currently a Python script, not an upload screen.
   Needs a spreadsheet parser added as a dependency — `exceljs` is the likely
   pick; SheetJS's npm build is stale.

### 5.2 Elsewhere

- **Section planes and floor isolation** in the 3D viewer. Geometry and bounds
  exist; only the controls are missing.
- **Persistence** — imported models and estimates live only in the browser
  session. Needs a migration and a table.
- **Procurement and progress** — the tail of the chain past quotation.

### 5.3 Cannot be done as specified

**Revit `.rvt`, AutoCAD `.dwg`, SketchUp `.skp`** are closed formats requiring a
commercial licence (Autodesk Platform Services or the ODA SDK). IFC and DXF work
and are the open equivalents. This has been flagged repeatedly and is a
purchasing decision, not an engineering one.

---

## 6. Constraints on the working environment

These shape what "done" can mean here, and any suggestion should account for
them:

- **`git push` returns 403.** The GitHub App is read-only. Everything is
  delivered to the owner as a `.tar.gz`, extracted on Windows at
  `D:\websites\FREEDOM`. The repo history exists only in the sandbox and in
  those archives.
- **Supabase is unreachable from the sandbox** (host not in the egress
  allowlist). Migrations are validated against a local PostgreSQL 16 instead.
  **No server-side path has ever run against the owner's real database.**
- **No AI provider keys.** The router, chat and image generation are typechecked
  and built but have never made a real model call.
- **Playwright is not a project dependency**, so client React is compiled and
  typechecked but never exercised in a browser.
- **The owner has not confirmed migrations `0032`–`0042` are applied.** Until
  they are, treat the whole server-side layer as unproven.

---

## 7. Conventions worth keeping

- **Never invent a price.** If the book has nothing, say so in the exact agreed
  sentence. A wrong price is worse than no price — somebody orders against it.
- **Never present an estimate as a quotation**, and never present AI-estimated
  data as verified BIM information.
- **Respect the selling unit.** Bars, not metres. Sheets, not square metres.
- **A user's typed price is never silently replaced.** A professional who sets a
  rate to ETB 4,000, watches it snap back to 3,000, and has to set it again
  stops using the estimator that afternoon.
- **Don't ask the model to do arithmetic the software can do reliably.**
- Comments explain *why*, especially where a reasonable alternative was
  rejected. Several of the bugs above were found because writing the "why" down
  exposed that it was not true.

---

## 8. Where suggestions would be most useful

Ranked by how much they would change the plan:

1. **The four price-book screens** — order, scope, and whether the Price
   Exchange should merge reference prices with supplier listings in one table or
   keep them visibly separate. They are different kinds of fact and the current
   instinct is "separate", but that is a product call.
2. **Getting the server-side layer proven.** The largest block of unverified
   code. Is there a better path than "the owner clicks through it"? A staging
   Supabase project the sandbox could reach would change the economics of every
   remaining task.
3. **Expiry scheduling.** `expire_stale_material_prices()` exists but nothing
   calls it. pg_cron, an Edge Function, or an admin button?
4. **Confidence model.** Currently derived from status + sample size + age. A
   lone educational baseline is `low` and stays `low` however many agree, on the
   grounds that a baseline is not evidence. Reasonable, or too strict given 439
   of 455 seeded rows are baselines?
5. **Testing strategy.** Hand-written check scripts have found real bugs, but
   there is no browser testing at all and no CI. Worth introducing Vitest and
   Playwright, or is the current approach carrying its weight?
