# Fabrication and pricing

How a description becomes a cut list, and a cut list becomes a price.

```
spec  →  profiles + glass + hardware  →  bars / sheets / panes  →  price  →  cost
```

| Stage | File |
| --- | --- |
| Opening spec (doors, windows, partitions) | `src/features/berchuma-studio/types/openings.ts` |
| Spec → parts | `src/features/berchuma-studio/services/openings.ts` |
| Lengths → bars | `src/features/berchuma-studio/services/linear-stock.ts` |
| Sheet parts → sheets | `src/features/berchuma-studio/services/nesting.ts` |
| Which price wins | `src/lib/pricing/resolve.ts` |

`npm run check:fabrication` — 205 checks, no database, no network.

## The calculation this exists to get right

A door needs 18.5 m of profile. Bars are 6 m at ETB 4,000.

```
Wrong:  18.5 × 4,000 = ETB 74,000
Right:      4 × 4,000 = ETB 16,000
```

And 4 is not `ceil(18.5 / 6)` either. Whether 18.5 m is three bars or six
depends entirely on the piece lengths:

- ten pieces of 1.85 m → **4 bars** (three per bar)
- six pieces of 3.084 m → **6 bars** (one per bar — two will never share)

Dividing is an estimate. Packing is the answer, so the engine packs.

Two consequences fabricators check first, and both are real:

- **A 6 m bar does not yield two 3 m pieces.** The blade takes 5 mm and the bar
  end is faced off. Four 3 m pieces are four bars, not two.
- **The stock length is chosen, not assumed.** A 2.9 m piece is 51% waste from a
  6 m bar and 3% from a 3 m bar.

Kerf, end trim, fabrication allowance and the available stock lengths are all
options — a supplier who only stocks 5.8 m bars gets a different answer.

A piece longer than any bar is **reported**, not dropped. The rest of the order
still packs around it.

## Openings

`buildOpening(spec)` turns *"2400 × 2100 black aluminium sliding door, clear
glass"* into every profile length, every pane and every roller — with the
reason for each hardware quantity in words, because the person checking will
disagree with one of them and needs to find it.

Every deduction is named in the source: sash clearance 3 mm a side, glass
clearance 3 mm, interlock overlap 20 mm, plus the frame and rebate sections from
the profile system. The AI's job is turning a sentence into a spec; from the
spec onwards it is subtraction, because a model that is 40 mm out produces a
door that does not close.

**Stated dimensions are authoritative.** 2437 is cut as 2437, never rounded to a
standard size. Unstated dimensions get a real standard size and are flagged as
estimated until someone confirms them.

## Which price wins

```
1. User edited          ← never silently replaced
2. Marketplace product  ← the listing they chose
3. Marketplace average  ← median, so one mis-keyed listing does not move it
4. AI suggested         ← labelled as an estimate
```

Every resolved price carries its source, and the alternatives are kept so
"reset to marketplace" is possible.

**Units are never converted silently.** A quantity in bars against a per-metre
price returns `null` rather than a number. A cost line that is missing gets
fixed; a cost line that is wrong by a factor of six gets signed.

Listings are grouped by unit before averaging — blending ETB 4,000/bar with
ETB 700/m gives ETB 2,350 of nothing — and `normaliseUnit` folds the ways people
actually type them (`m2`, `M²`, `sqm`, `sq.m` are one unit).
