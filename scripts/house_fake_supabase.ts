/**
 * A stand-in for the browser Supabase client, for the House Plan browser
 * checks. Tables live in localStorage, so a page reload — opening a saved plan
 * by its link — finds what was saved. Row-level security is not imitated:
 * `supabase/tests/agenda-plans.sql` tests that against real PostgreSQL.
 *
 * Only what the House Plan code calls is implemented, and anything else
 * throws, so a new query is noticed rather than silently answered.
 */
type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

const KEY = "__house_fake_db";
const USER = "00000000-0000-4000-8000-0000000000aa";

function load(): Db {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Db; } catch { return {}; }
}
function save(db: Db) {
  localStorage.setItem(KEY, JSON.stringify(db));
}
function uuid() {
  return crypto.randomUUID();
}

declare global {
  interface Window {
    __fakeDb: { read: () => Db; write: (db: Db) => void; log: { table: string; op: string }[]; fail: ((table: string, op: string) => boolean) | null };
  }
}
window.__fakeDb ??= { read: load, write: save, log: [], fail: null };

class Query implements PromiseLike<{ data: unknown; error: { message: string } | null }> {
  private op: "select" | "insert" | "update" = "select";
  private payload: Row | Row[] | null = null;
  private filters: ((row: Row) => boolean)[] = [];
  private sort: { column: string; ascending: boolean } | null = null;
  private max = Infinity;
  private one: "single" | "maybe" | null = null;
  private columns = "*";

  constructor(private table: string) {}

  select(columns = "*") { this.columns = columns; return this; }
  insert(payload: Row | Row[]) { this.op = "insert"; this.payload = payload; return this; }
  update(payload: Row) { this.op = "update"; this.payload = payload; return this; }
  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  neq(column: string, value: unknown) { this.filters.push((row) => row[column] !== value); return this; }
  is(column: string, value: unknown) { this.filters.push((row) => (row[column] ?? null) === value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(row[column])); return this; }
  order(column: string, options: { ascending?: boolean } = {}) { this.sort = { column, ascending: options.ascending ?? true }; return this; }
  limit(count: number) { this.max = count; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }

  then<A = { data: unknown; error: { message: string } | null }, B = never>(resolve?: ((value: { data: unknown; error: { message: string } | null }) => A | PromiseLike<A>) | null, reject?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return new Promise<{ data: unknown; error: { message: string } | null }>((done) => setTimeout(() => done(this.run()), 30)).then(resolve, reject);
  }

  private run(): { data: unknown; error: { message: string } | null } {
    window.__fakeDb.log.push({ table: this.table, op: this.op });
    if (window.__fakeDb.fail?.(this.table, this.op)) return { data: null, error: { message: "Failed to fetch" } };
    const db = load();
    const rows = (db[this.table] ??= []);
    let result: Row[];
    if (this.op === "insert") {
      const now = new Date().toISOString();
      result = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((item) => {
        const row: Row = { id: uuid(), created_at: now, updated_at: now, archived_at: null, ...item };
        if (this.table === "agenda_plans") row.revision ??= 1;
        if (this.table === "agenda_pins") {
          const count = rows.filter((other) => other.project_id === row.project_id).length + 1;
          row.number = `PIN-${String(count).padStart(3, "0")}`;
          row.status ??= "open";
        }
        if (this.table === "agenda_tasks") row.status ??= "todo";
        return row;
      });
      rows.push(...result);
      save(db);
    } else if (this.op === "update") {
      result = rows.filter((row) => this.filters.every((filter) => filter(row)));
      for (const row of result) Object.assign(row, this.payload, { updated_at: new Date().toISOString() });
      save(db);
    } else {
      result = rows.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.sort) {
        const { column, ascending } = this.sort;
        result = [...result].sort((a, b) => (String(a[column]) < String(b[column]) ? -1 : String(a[column]) > String(b[column]) ? 1 : 0) * (ascending ? 1 : -1));
      }
      result = result.slice(0, this.max);
    }
    const embed = /(\w+)\((\w+)\)/.exec(this.columns);
    const shaped = result.map((row) => {
      if (!embed) return { ...row };
      const [, table] = embed;
      const parent = (load()[table!] ?? []).find((item) => item.id === row.project_id);
      return { ...row, [table!]: parent ? { name: parent.name } : null };
    });
    if (this.one) {
      if (!shaped[0] && this.one === "single") return { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
      return { data: shaped[0] ?? null, error: null };
    }
    return { data: shaped, error: null };
  }
}

const files = new Map<string, string>();

export function createClient() {
  return {
    from: (table: string) => new Query(table),
    auth: { getUser: async () => ({ data: { user: { id: USER } } }) },
    storage: {
      from: () => ({
        upload: async (path: string, file: Blob) => {
          window.__fakeDb.log.push({ table: "storage", op: "upload" });
          const url = await new Promise<string>((done) => { const reader = new FileReader(); reader.onload = () => done(String(reader.result)); reader.readAsDataURL(file); });
          files.set(path, url);
          try { localStorage.setItem(`__house_fake_file:${path}`, url); } catch { /* too big to keep across a reload */ }
          return { data: { path }, error: null };
        },
        createSignedUrl: async (path: string) => ({ data: { signedUrl: files.get(path) ?? localStorage.getItem(`__house_fake_file:${path}`) }, error: null }),
        createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: files.get(path) ?? localStorage.getItem(`__house_fake_file:${path}`) })), error: null }),
      }),
    },
  };
}

export const FAKE_USER = USER;
