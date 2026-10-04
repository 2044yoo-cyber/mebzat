# Construction Price Exchange

A live pricing market that sits alongside the marketplace. The marketplace
sells things; the exchange tells you what they cost right now, who is
undercutting whom, and where the price has been.

Routes:

- `/price-exchange` — the market table, one sector at a time
- `/price-exchange/[id]` — one listing: history chart, bids, market comparison

The homepage links to it from a wide card between the featured products and the
Medosha AI section.

## Data model

Migration: `supabase/migrations/0009_price_exchange.sql`.

Materials, labour, furniture and project rates are **one table with a `sector`
column**, not four tables. They differ only in what the unit means, and
splitting them would mean four copies of every index, policy and trigger, plus
a UNION in any query that spans sectors. The sector-specific names exist as
views (`material_prices`, `labor_prices`, `furniture_prices`, `project_prices`,
`supplier_prices`), so those queries still work.

| Table | What it holds |
| --- | --- |
| `price_listings` | One published price. `current_price` is the supplier's figure; `lowest_bid` / `highest_bid` / `bid_count` are denormalised aggregates kept by trigger. |
| `price_bids` | A competing offer. Unique on `(listing_id, bidder_id)` — one open bid per supplier per listing, so improving an offer replaces it. |
| `price_history` | Append-only. Written by trigger on every price change. |
| `price_watchers` | Who follows which listing. |
| `price_notifications` | New bids and price moves, per user. |

### Triggers

- `record_price_change()` — on insert, writes the opening price to history. On
  a price change, writes the new point and notifies every watcher with
  `price_dropped` or `price_increased`.
- `refresh_listing_bids()` — recomputes the bid aggregates **from the open
  bids** rather than adjusting them incrementally, so a withdrawal or a
  rejection cannot leave the row wrong. On insert it also notifies the supplier
  being undercut plus the watchers, excluding the bidder.
- `sync_price_from_product()` — editing a linked marketplace product updates
  its listing, so a supplier maintains one number rather than two that can
  disagree.

### Functions

- `price_market_stats(category, unit)` → average, low, high, sample size across
  comparable listings.
- `price_trend(listing_id, days)` → one row per day, for the charts.

Both are `security definer` and granted to `anon` and `authenticated`.

## Security

Published prices and bids are readable by everyone, signed in or not — the
exchange only works if buyers can compare without an account. Writing is
restricted:

- a supplier may insert, update and delete only their own listings
- a bidder may insert and update only their own bids
- a listing owner gets a separate update policy so they can accept or reject
  bids without widening the bidder's policy
- watches and notifications are private to their owner

The server action refuses a self-bid and clamps the price to
`0 < price <= 1,000,000,000` before it reaches the database.

## Live updates

`price_listings` and `price_bids` are in the `supabase_realtime` publication.
The market table subscribes to both and merges patches **over** the
server-rendered rows, keyed by listing id, rather than replacing them — a
fresh navigation stays authoritative while live edits still show. Updates for
listings that are not on the current page are dropped.

## Reads

`src/lib/data/price-exchange.ts`. Filtering and sorting happen in Postgres
against the 0009 indexes, not over a fetched page — every filter combination
has to stay fast on the one screen that combines them. Page size is 50.

When the tables are missing, `getPrices()` returns `available: false` and the
page says the exchange is not set up yet, rather than rendering an empty market
as though it were real.

## Charts

`src/components/price-exchange/price-chart.tsx` draws plain SVG — a single line
does not justify a charting dependency. A **year** of points is fetched once on
the server and the 30- and 90-day ranges are windows over it, so switching
range costs no round trip. The "now" the window is measured from is passed in
from the server (`asOf`), which keeps the component pure for the React
compiler.

## Demo data

```bash
npm run seed:prices
```

See `scripts/seed-price-exchange.ts`. It mirrors published marketplace products
as material and furniture listings (linked by `product_id`), adds indicative
Ethiopian labour and project rates, back-fills ~40 history points across a
year, and places competing bids. History is written straight to `price_history`
rather than by moving `current_price` repeatedly, which would fire the
notification trigger on every step.

All figures are fictional demo data.
