# The Medosha ecosystem

Medosha is a construction platform, not a single marketplace. This document
covers the modules added in phase 3 and how they hold together.

## Modules

| Module | Routes | Migration | Status |
| --- | --- | --- | --- |
| Marketplace | `/marketplace`, `/marketplace/[id]` | 0005 | Built |
| Companies | `/companies`, `/companies/[slug]` | 0006 | Built |
| Professionals | `/directory/[type]`, `/u/[username]` | 0001–0003 | Built |
| Projects | `/projects`, `/projects/[id]` | 0004 | Built |
| Messaging | `/messages` | 0007 | Built |
| Medosha AI | `/ai` | 0008 | Built |
| Price Exchange | `/price-exchange` | 0009 | Built |
| Community | `/community`, `/community/[id]` | 0010 | Built |
| Notifications | `/notifications` | 0009 + 0010 | Built |
| Services | `/services`, `/services/[id]` | 0011 | Built |
| Equipment Rental | `/equipment`, `/equipment/[id]` | 0011 | Built |
| Reviews | inline on every subject | 0011 | Built |
| Jobs | `/jobs`, `/jobs/[id]` | 0012 | Built |
| Events | `/events`, `/events/[id]` | 0012 | Built |
| Global Search | `/search`, header, hero | 0013 | Built |
| Multi-service accounts | `/dashboard/services` | 0014 | Built |
| Service analytics | `/dashboard/services/[id]/analytics` | 0014 | Built |
| Project marketplace | `/hire`, `/hire/[id]`, `/hire/new` | 0015 | Built |
| Reputation & badges | inline on profiles | 0016 | Schema only |
| Knowledge library | — | 0016 | Schema only |
| Team accounts | — | 0016 | Schema only |
| Properties / 3D map | `/city`, `/property/[id]`, `/property/new` | 0017 | Built |
| Learning | — | — | Not built |
| Quote Center | — | — | Not built |
| Admin | — | — | Not built |

## Homepage order

Fixed by product, and each section is **skipped rather than shown empty** — a
fresh install degrades to a shorter page instead of one full of placeholders.

1. Hero · 2. Search · 3. Featured Companies · 4. Featured Products ·
5. Featured Projects · 6. Medosha AI · 7. Construction Price Exchange ·
8. Trending Materials · 9. Professionals · 10. Equipment Rental ·
11. Latest Posts · 12. Customer Reviews · 13. Footer

Medosha AI is one band in the middle. The page leads with the marketplace, as
a construction platform should.

## Global search

One box, in the hero and the header. It searches **eleven** kinds through a
single `global_search()` RPC: products, companies, professionals, projects,
prices/materials, services, equipment, jobs, events, posts and hashtags.

Why one RPC and not eleven queries fanned out from the app: eleven round trips
to render one list is eleven chances to be slow, and Postgres can rank across
the tables in a way the client cannot. `per_kind` caps every branch so one
popular table cannot crowd the others out.

Ranking is a prefix match on the title (3.0) over a match anywhere (1.0), with
hashtags weighted highest on a prefix because typing `#con` means the tag.
`%` and `_` are escaped, so a wildcard typed into the box is a literal, not a
match-all.

**Medosha AI is always the last suggestion**, never the first: when the
catalogue has the answer, the catalogue should win.

The typeahead is a route (`/api/search`) rather than a server action, because
it fires on every keystroke — actions serialise behind the router and a stale
one cannot be abandoned, while a fetch can be cancelled by an AbortController
when the next character arrives.

## Design decisions worth knowing

**Denormalised counters, recomputed not incremented.** Like counts, comment
counts, bid aggregates, application counts and attendee counts all live on the
parent row and are recomputed *from the child rows* by trigger. A feed sorts
and pages on those counts, and a correlated subquery per row is what makes a
feed slow. Recomputing rather than adjusting means a double fire, a cascade
delete or a withdrawal cannot leave a count that disagrees with reality.

**One polymorphic reviews table**, not four. A rating is a rating whatever it
is about, the aggregate is the same query in every case, and a table per
subject would mean four copies of the one-per-user rule. Unique on
`(author_id, subject_type, subject_id)`: editing your review changes it rather
than adding a second vote.

**One follows table** spanning profiles, companies and hashtags. `target_id`
is deliberately not a foreign key because it points into three tables; the
alternative is three tables and a UNION in every query that spans them.

**Two notification tables, one tray.** Price events (0009) carry listing and
bid columns nothing else uses, so they keep their own table. `/notifications`
merges both and sorts by time.

**Hashtags are rows, not a `text[]`.** A tag page becomes an indexed lookup and
a trending list becomes one aggregate. They are parsed out of the title and
body by trigger, so a post and its tags cannot drift apart.

**Comments thread one level.** Deeper nesting is harder to read on a phone and
needs recursion in every query that renders it. The server returns them flat
and the component arranges them.

**Equipment carries three rates**, not one rate plus a period. Renters compare
weekly against daily, and deriving one from the other invents a discount the
owner never offered. The booking action picks whichever rate is cheapest for
the requested span — the one the renter would have worked out themselves — and
recomputes it server-side, so a tampered form cannot set its own price.

**Booking overlap** is `starts <= existing_end and ends >= existing_start`,
the only form that catches a booking wholly inside another one.

## Security

Every table has RLS. The pattern throughout: public reads for anything
published (comparison is the point of a marketplace), owner-only writes, and a
separate policy where a second party legitimately needs to update — a listing
owner accepting a bid, an employer moving an application through the pipeline.

Private by construction: bookings are visible only to renter and owner,
applications only to applicant and employer, notifications and watches only to
their owner.

Server actions validate before they reach the database — self-bids, self-
bookings and self-applications are refused, URLs must be `http(s)`, and prices
are clamped.

## SEO

`metadataBase` from `NEXT_PUBLIC_SITE_URL` (falling back to the Vercel
production URL), so a preview deployment never advertises the production host —
a canonical tag pointing at the wrong origin is worse than none.

`sitemap.ts` lists the static routes plus up to 2,000 records per type, each
query capped and each failure contributing nothing rather than taking the whole
file down. `robots.ts` disallows the private areas and `/search`, which is
infinite crawl surface with nothing durable behind it.

Detail pages carry Open Graph metadata; events additionally emit schema.org
`Event` JSON-LD.

## The service ecosystem

One account is never limited to one profession. A studio that also manufactures
wardrobes, prepares BOQs and supplies materials publishes each as a separate
service, and each behaves like an independent business: its own pricing (all
sixteen methods), scope, capacity, availability, portfolio, certificates,
contact channels and analytics.

`service_events` is an append-only log rather than a counter column per metric.
A counter cannot answer "how did views convert to quote requests last month";
the log can, and `service_analytics()` reads all twelve headline metrics in one
pass rather than a query per tile.

Work status (available / limited / busy / fully booked / offline) lives on the
service, the profile and the company, so a client's first question — "can you
start" — has an answer that is never a month stale.

## The project marketplace

`/hire`. A client posts a brief, `invite_matching_professionals()` notifies the
services it matches, professionals bid, and the client compares side by side.

Bids are visible only to the client and their own bidder. Publishing them all
would turn the marketplace into a race to undercut whoever bid last.

The comparison table is a table, not a stack of cards, because the point is
comparison and comparison needs aligned columns. It marks the best value in
each numeric column — cheapest, fastest, longest warranty, highest rated — since
those are what every client scans for first and none is obvious across eight
rows of different figures.

`match_professionals()` scores on trade (0.35), budget (0.20), location (0.15),
availability (0.15) and track record (0.15), and returns the reason with the
score. A marketplace that cannot explain its own ranking is one nobody trusts.

## Still to build

Learning, Quote Center and Admin have no tables and no routes. Reputation,
the knowledge library and team accounts have schema, triggers and functions
(0016) but no pages yet — reputation accrues correctly in the background, it
just is not displayed. Nothing links to any of them, so there are no dead
buttons.
