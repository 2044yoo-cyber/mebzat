/**
 * Supabase, for the creator-portfolio browser check.
 *
 * Rows live in localStorage, so every tab and every reload sees the same
 * data; the signed-in person is per tab (sessionStorage). Reads follow the
 * same visibility the real policies have — tested on PostgreSQL in
 * supabase/tests/portfolio-visibility.sql — and the query builder supports
 * exactly what src/lib/portfolio/sources.ts asks: select, eq, neq, the
 * cursor `or`, order, limit, and head counts.
 */
import { microseconds } from "../src/lib/portfolio/model";

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

const KEY = "__portfolio_db";
const load = (): Db => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Db; } catch { return {}; } };
export const currentUser = () => sessionStorage.getItem("__portfolio_user") ?? "";

declare global {
  interface Window { __portfolio: { offline: boolean; requests: { table: string; at: number }[] } }
}
window.__portfolio ??= { offline: false, requests: [] };

/** The read policy of each table, as the migrations write it. */
function visible(table: string, row: Row, user: string): boolean {
  switch (table) {
    case "projects": return row.status === "published" || row.owner_id === user;
    case "products": return row.status === "published" || row.owner_id === user;
    case "properties": return row.status !== "draft" || row.owner_id === user;
    case "equipment": return row.status === "published" || row.owner_id === user;
    case "services": return row.status === "published" || row.provider_id === user;
    case "designs": return row.visibility === "public" || row.visibility === "unlisted" || row.owner_id === user;
    case "tours": return row.visibility === "published" || row.visibility === "unlisted" || row.owner_id === user;
    case "posts": return row.status === "published" || row.author_id === user;
    case "jobs": return row.poster_id === user || (row.visibility === "public" && ["open", "filled", "closed"].includes(String(row.status)));
    case "invest_projects": return row.published === true || row.owner_id === user;
    case "profiles": return true;
    default: return false;
  }
}

const CURSOR = /^created_at\.lt\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.lt\.([0-9a-f-]+)\)$/;

class Query {
  private filters: ((row: Row) => boolean)[] = [];
  private sorts: { column: string; ascending: boolean }[] = [];
  private max = Infinity;
  private head = false;
  private counting = false;
  private one = false;
  constructor(private table: string, private columns: string) {}
  select(columns: string, options?: { count?: string; head?: boolean }) { this.columns = columns; this.counting = options?.count === "exact"; this.head = Boolean(options?.head); return this; }
  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  neq(column: string, value: unknown) { this.filters.push((row) => row[column] !== value && row[column] !== null && row[column] !== undefined); return this; }
  or(expression: string) {
    const match = CURSOR.exec(expression);
    if (!match) throw new Error(`fake supabase: unsupported or(${expression})`);
    const [, before, same, id] = match;
    this.filters.push((row) => {
      const at = microseconds(String(row.created_at));
      return at < microseconds(before!) || (at === microseconds(same!) && String(row.id) < id!);
    });
    return this;
  }
  order(column: string, options: { ascending: boolean }) { this.sorts.push({ column, ascending: options.ascending }); return this; }
  limit(count: number) { this.max = count; return this; }
  maybeSingle() { this.one = true; return this; }
  then<A, B = never>(resolve?: ((value: { data: unknown; error: { message: string } | null; count?: number | null }) => A | PromiseLike<A>) | null, reject?: ((reason: unknown) => B | PromiseLike<B>) | null) {
    return new Promise<{ data: unknown; error: { message: string } | null; count?: number | null }>((done) => setTimeout(() => {
      if (window.__portfolio.offline) { done({ data: null, error: { message: "Failed to fetch" } }); return; }
      if (!this.head) window.__portfolio.requests.push({ table: this.table, at: Date.now() });
      const user = currentUser();
      let rows = (load()[this.table] ?? []).filter((row) => visible(this.table, row, user) && this.filters.every((filter) => filter(row)));
      if (this.head) { done({ data: null, error: null, count: this.counting ? rows.length : null }); return; }
      for (const sort of [...this.sorts].reverse()) {
        rows = [...rows].sort((a, b) => {
          const x = sort.column === "created_at" ? microseconds(String(a.created_at)) : String(a[sort.column]);
          const y = sort.column === "created_at" ? microseconds(String(b.created_at)) : String(b[sort.column]);
          return (x < y ? -1 : x > y ? 1 : 0) * (sort.ascending ? 1 : -1);
        });
      }
      rows = rows.slice(0, this.max);
      done({ data: this.one ? rows[0] ?? null : rows, error: null });
    }, 20)).then(resolve, reject);
  }
}

export function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: currentUser() ? { id: currentUser(), email: "me@example.test" } : null }, error: null }) },
    from: (table: string) => new Query(table, "*"),
  };
}

export async function createClient() {
  return fakeClient();
}
