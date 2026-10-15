/**
 * The creator portfolio's paging: several tables read newest-first, merged
 * into one stream, a page at a time, with nothing shown twice and nothing
 * skipped.
 *
 *   npx tsx scripts/portfolio_model_check.ts
 *
 * Driven against tables simulated the way PostgREST answers the queries in
 * src/lib/portfolio/sources.ts: owner's rows only, ordered by (created_at
 * desc, id desc), after the cursor, `limit` at a time.
 */
import assert from "node:assert/strict";

import { appendUnique, compareCards, decodeCursor, encodeCursor, isAfter, mergePage, microseconds, type Cursor, type PortfolioCard } from "../src/lib/portfolio/model";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const equal = <T>(actual: T, expected: T, message: string) => { assert.deepEqual(actual, expected, message); checks += 1; };

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const card = (source: PortfolioCard["source"], n: number, at: string): PortfolioCard => ({
  key: `${source}:${uuid(n)}`, source, id: uuid(n), title: `${source} ${n}`, subtitle: null, image: null,
  href: `/${source}/${n}`, createdAt: at, badge: null, price: null, stats: {},
});

/** A table as the database answers it: after the cursor, newest first, `limit` rows. */
function table(rows: PortfolioCard[]) {
  const ordered = [...rows].sort(compareCards);
  return (cursor: Cursor | null, limit: number) => {
    const after = ordered.filter((row) => isAfter(row, cursor));
    const cards = after.slice(0, limit);
    return { cards, full: cards.length === limit };
  };
}

/** Pages through a section to the end, as the screen does. */
function scroll(tables: ReturnType<typeof table>[], limit: number) {
  let shown: PortfolioCard[] = [];
  let cursor: Cursor | null = null;
  let pages = 0;
  for (;;) {
    const page = mergePage(tables.map((read) => read(cursor, limit)), limit, cursor);
    pages += 1;
    const before = shown.length;
    shown = appendUnique(shown, page.cards);
    ok(page.cards.length === 0 || shown.length === before + page.cards.length, `page ${pages} adds only cards not already shown`);
    if (page.done) break;
    assert.ok(page.next, "a page that is not the last says where the next starts");
    cursor = page.next;
    assert.ok(pages < 1000, "paging ends");
  }
  return { shown, pages };
}

// 1. Three tables, interleaved in time, read 5 at a time.
{
  const products = Array.from({ length: 13 }, (_, i) => card("product", i, new Date(Date.UTC(2026, 0, 1, 0, i * 7)).toISOString()));
  const properties = Array.from({ length: 4 }, (_, i) => card("property", 100 + i, new Date(Date.UTC(2026, 0, 1, 0, i * 11 + 3)).toISOString()));
  const equipment = Array.from({ length: 9 }, (_, i) => card("equipment", 200 + i, new Date(Date.UTC(2026, 0, 1, 0, i * 5 + 1)).toISOString()));
  const all = [...products, ...properties, ...equipment];
  const { shown, pages } = scroll([table(products), table(properties), table(equipment)], 5);
  equal(shown.length, all.length, "1: every row of every table is shown");
  equal(new Set(shown.map((c) => c.key)).size, all.length, "1: none twice");
  equal(shown.map((c) => c.key), [...all].sort(compareCards).map((c) => c.key), "1: newest first, across tables");
  equal(pages, Math.ceil(all.length / 5), "1: in as many pages as it takes, and no empty extra one");
}

// 2. Ties: rows made in the same instant, across and within tables.
{
  const at = "2026-03-01T09:00:00.123456+00:00";
  const a = [card("design", 5, at), card("design", 3, at), card("design", 9, at)];
  const b = [card("tour", 4, at), card("tour", 8, at)];
  const c = [card("post", 1, "2026-03-01T09:00:00.123457+00:00"), card("post", 2, "2026-03-01T09:00:00.123455+00:00")];
  const { shown } = scroll([table(a), table(b), table(c)], 2);
  equal(shown.length, 7, "2: rows sharing a timestamp are all shown, a page boundary through the middle of them");
  equal(new Set(shown.map((x) => x.key)).size, 7, "2: and none twice");
  equal(shown[0]!.key, `post:${uuid(1)}`, "2: one microsecond newer sorts first");
  equal(shown.at(-1)!.key, `post:${uuid(2)}`, "2: one microsecond older sorts last");
}

// 3. Timestamps as PostgreSQL writes them.
equal(microseconds("2026-10-15T10:00:00.12345+00:00") - microseconds("2026-10-15T10:00:00.1234+00:00"), 50, "3: microseconds count, not just milliseconds");
equal(microseconds("2026-10-15 13:00:00.5+03"), microseconds("2026-10-15T10:00:00.5Z"), "3: an hour offset written +03 is the same instant");
equal(microseconds("2026-10-15T13:00:00+0300"), microseconds("2026-10-15T10:00:00Z"), "3: so is +0300");

// 4. Cursors.
const cursor = { at: "2026-10-15T10:00:00.123456+00:00", id: uuid(7) };
equal(decodeCursor(encodeCursor(cursor)), cursor, "4: a cursor survives the trip to the browser and back");
equal([decodeCursor("nonsense"), decodeCursor(`2026-10-15T10:00:00Z|not-a-uuid`), decodeCursor(null), decodeCursor(42)], [null, null, null, null], "4: and a made-up one is refused");

// 5. Something added while somebody scrolls does not shift what they see.
{
  const rows = Array.from({ length: 10 }, (_, i) => card("project", i, new Date(Date.UTC(2026, 0, 1, i)).toISOString()));
  const live = [...rows];
  const read = (c: Cursor | null, limit: number) => table(live)(c, limit);
  const first = mergePage([read(null, 4)], 4, null);
  live.push(card("project", 99, new Date(Date.UTC(2027, 0, 1)).toISOString()));
  const second = mergePage([read(first.next, 4)], 4, first.next);
  ok(!second.cards.some((c) => first.cards.some((d) => d.key === c.key)), "5: a new row at the top does not repeat a card on the next page");
  equal(second.cards[0]!.key, `project:${uuid(5)}`, "5: the next page carries on where the last one stopped");
}

// 6. An empty section is done at once, without a cursor.
{
  const page = mergePage([{ cards: [], full: false }, { cards: [], full: false }], 12, null);
  equal([page.cards.length, page.done, page.next], [0, true, null], "6: an empty section is finished, with nothing to fetch next");
}

// 7. The same row arriving twice — two tables answering for it, or a page
//    that overlaps one already shown — is shown once.
{
  const x = card("product", 1, "2026-05-01T10:00:00+00:00");
  const y = card("product", 2, "2026-05-01T09:00:00+00:00");
  const z = card("product", 3, "2026-05-01T08:00:00+00:00");
  equal(mergePage([{ cards: [x, y], full: false }, { cards: [x], full: false }], 12, null).cards.map((c) => c.key), [x.key, y.key], "7: a row in two answers is merged once");
  equal(appendUnique([x, y], [y, z]).map((c) => c.key), [x.key, y.key, z.key], "7: a page overlapping what is shown adds only what is new");
}

console.log(`Portfolio paging: ${checks} checks — merged across tables, newest first, ties and microseconds, no repeats, no gaps`);
