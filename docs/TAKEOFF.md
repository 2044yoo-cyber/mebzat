# Takeoff and BOQ

```
elements → measurements → trades → BOQ → marketplace match → price
```

| Stage | File |
| --- | --- |
| Element model + provenance | `src/lib/takeoff/model.ts` |
| Measurements, with formulas | `src/lib/takeoff/measure.ts` |
| Paint, masonry, concrete, rebar | `src/lib/takeoff/trades.ts` |
| Sections A–W, items, warnings | `src/lib/takeoff/boq.ts` |
| BOQ line → marketplace product | `src/lib/pricing/match.ts` |
| Which price wins | `src/lib/pricing/resolve.ts` |

`npm run check:takeoff` — 106 checks.

## The software does the arithmetic

The line is where the brief drew it: **AI extracts and interprets, the
application calculates.** A model reading a drawing and saying "18.40 m long,
3.00 m high, two doors" is doing what models are good at. The same model
answering "so the net area is 46.80 m²" is doing arithmetic unrepeatably, and
there is no way to check it short of doing the sum yourself.

So every quantity carries its own working:

```
18.40 × 3.00 − 8.40 = 46.80 m²
```

That string is on the takeoff sheet and on the BOQ line. "Why is this quantity
what it is" is answered by reading it.

## Provenance degrades, never improves

Every dimension records where it came from: `bim`, `user`, `drawing`,
`calculated`, `ai`. The rule that matters is that **a calculation is only as
good as its worst input** — a BIM length times an AI-estimated height is an
estimate, and `weakest()` enforces it so provenance cannot silently improve as
numbers pass through functions.

`calculated` is special: arithmetic over BIM values stays BIM-grade, arithmetic
touching one estimate becomes an estimate. Confidence is the minimum of the
inputs, not the product — a product would punish long chains and report
uncertainty that is not there.

The BOQ counts how many of its lines rest on an estimate and warns before
anybody tenders from it.

## Four trades, four ways to be wrong

| Trade | The mistake |
| --- | --- |
| Paint | Coats forgotten, openings not deducted, litres not rounded to tins |
| Masonry | A block size assumed when the drawing states another |
| Concrete | The 1.54 dry factor dropped — every pour under-ordered by a third |
| Rebar | **Invented** |

Blocks per m² is computed from the block's own face plus the joint, not looked
up — the table is where "12.5 per m²" comes from and it is true for one block
and one joint.

Reinforcement is the serious one. `rebarQuantity([])` returns nothing and says
the structural drawings are missing. A plausible schedule nobody specified gets
built, so it is never generated.

## Traceability, both ways

`elementIds` is threaded from measurement → item → bill, unchanged. That single
field is the whole chain:

- **Line → elements.** Click "Exterior painting, 683.4 m²" and the walls behind
  it are `item.elementIds` — including the openings that were deducted.
- **Element → lines.** `itemsForElement(boq, "WALL-104")` returns masonry,
  plaster and paint. Seeing one element in three lines is the check that catches
  something measured twice.

## Matching to the marketplace

`matchMaterial` scores a BOQ description against listings, and **refuses rather
than guessing**: below the threshold it returns "No exact Marketplace match" and
the closest candidates for a person to choose from.

Two things it gets right that a naive matcher does not:

- "200mm" and "200 mm" are the same thing (split on the digit-letter boundary),
  and `HCB` expands to `hollow concrete block`. Without both, the commonest line
  in an Ethiopian bill matches nothing.
- A **mismatched** number scores *negative*. 150 mm HCB is not a weaker match for
  200 mm HCB, it is the wrong product.
- A listing in the wrong unit is shown but never auto-selected — the same rule
  that stops the four-times-too-big quotation in `linear-stock.ts`.
