/**
 * A stand-in for Supabase, for the Collaborative Studio's browser checks.
 *
 * Both clients — the browser's and the server actions' — are this one, so
 * the real Studio screens and the real server actions run in the page. Rows
 * live in localStorage (shared by every tab of the check's browser), the
 * signed-in person is per tab (sessionStorage), and changes reach the other
 * tabs through a BroadcastChannel the way Supabase Realtime delivers them.
 *
 * The rules 0104 enforces in PostgreSQL are imitated here so the screens meet
 * the same refusals: Studio levels, revisions that must go up by one, the
 * database stamping who did what, thread numbers, and an update that row
 * security filters out affecting no rows rather than failing. The real rules
 * are tested where they live, in supabase/tests/collab-studio.sql; this is
 * only so the screens can be driven.
 *
 * Anything the Studio does not call throws, so a new query is noticed.
 */
type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;
type Result = { data: unknown; error: { message: string; code?: string } | null };

const KEY = "__collab_fake_db";
const bus = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("collab-fake") : null;

const load = (): Db => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Db; } catch { return {}; } };
const store = (db: Db) => localStorage.setItem(KEY, JSON.stringify(db));
export const currentUser = () => sessionStorage.getItem("__collab_user") ?? "";
const now = () => new Date().toISOString();

declare global {
  // `deaf`: this tab hears no realtime, as when live updates are paused.
  interface Window { __collab: { read: () => Db; write: (db: Db) => void; offline: boolean; deaf: boolean; changes: Row[] } }
}
window.__collab ??= { read: load, write: store, offline: false, deaf: false, changes: [] };

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

type Level = "owner" | "editor" | "commenter" | "viewer" | null;

export function levelOf(db: Db, user: string, project: string): Level {
  if (!user) return null;
  const owner = (db.agenda_projects ?? []).find((row) => row.id === project)?.owner_id === user;
  const member = (db.agenda_members ?? []).find((row) => row.project_id === project && row.user_id === user && row.status === "active");
  if (owner || (member && ["client", "administrator"].includes(String(member.role)))) return "owner";
  if (!member) return null;
  return ((db.collab_access ?? []).find((row) => row.project_id === project && row.user_id === user)?.level as Level) ?? "commenter";
}
const canEdit = (level: Level) => level === "owner" || level === "editor";
const canComment = (level: Level) => canEdit(level) || level === "commenter";

const COLLAB = new Set(["collab_boards", "collab_items", "collab_threads", "collab_comments", "collab_annotations", "collab_access", "collab_reads"]);
const REVISED = new Set(["collab_boards", "collab_items", "collab_threads", "collab_annotations"]);

function projectOf(db: Db, table: string, row: Row): string {
  if (row.project_id) return String(row.project_id);
  if (table === "agenda_projects") return String(row.id);
  return "";
}

/** May this person see the row? Row security, as 0104 and Agenda write it. */
function visible(db: Db, table: string, row: Row, user: string): boolean {
  if (table === "profiles") return true;
  if (table === "collab_reads") return row.user_id === user;
  if (table === "notifications") return row.user_id === user;
  const project = projectOf(db, table, row);
  if (!project) return true;
  return levelOf(db, user, project) !== null;
}

function refuseInsert(db: Db, table: string, row: Row, user: string): string | null {
  const level = levelOf(db, user, projectOf(db, table, row));
  if (table === "collab_boards" || table === "collab_items") return canEdit(level) ? null : "new row violates row-level security policy";
  if (table === "collab_threads" || table === "collab_annotations") return canComment(level) ? null : "new row violates row-level security policy";
  if (table === "collab_comments") return canComment(level) && row.author_id === user ? null : "new row violates row-level security policy";
  if (table === "collab_access") return level === "owner" ? null : "new row violates row-level security policy";
  if (table === "collab_reads") return row.user_id === user && level !== null ? null : "new row violates row-level security policy";
  if (table.startsWith("agenda_")) return level !== null ? null : "new row violates row-level security policy";
  return null;
}

function mayUpdate(db: Db, table: string, row: Row, user: string): boolean {
  const level = levelOf(db, user, projectOf(db, table, row));
  if (table === "collab_boards" || table === "collab_items") return canEdit(level);
  if (table === "collab_threads") return canComment(level);
  if (table === "collab_comments") return canComment(level) && row.author_id === user;
  if (table === "collab_annotations") return canComment(level) && (row.created_by === user || canEdit(level));
  if (table === "collab_access") return level === "owner";
  if (table === "collab_reads") return row.user_id === user;
  if (table.startsWith("agenda_")) return level !== null;
  return true;
}

/** Triggers: stamps, numbers, guards. Returns an error message to refuse. */
function beforeWrite(db: Db, table: string, row: Row, old: Row | null, user: string): string | null {
  if (COLLAB.has(table) && table !== "collab_reads" && table !== "collab_access") {
    if (!old && "created_by" in row || (!old && ["collab_boards", "collab_items", "collab_threads", "collab_annotations"].includes(table))) row.created_by = user;
    if (["collab_boards", "collab_items"].includes(table)) row.updated_by = user;
    if (table === "collab_comments" && !old) row.author_id = user;
  }
  if (old && REVISED.has(table)) {
    const strip = (value: Row) => { const { last_activity_at: _a, updated_at: _b, ...rest } = value; void _a; void _b; return JSON.stringify(rest); };
    if (strip(row) !== strip(old)) {
      if (row.revision !== Number(old.revision) + 1) return "Somebody else changed this a moment ago. It has been reloaded.";
      row.updated_at = now();
    }
    if (row.project_id !== old.project_id) return "It cannot be moved to another project.";
  }
  if (table === "collab_threads") {
    const level = levelOf(db, user, String(row.project_id));
    if (!old) {
      const count = (db.collab_threads ?? []).filter((entry) => entry.project_id === row.project_id).length + 1;
      row.number = `C-${String(count).padStart(3, "0")}`;
      row.status = "open";
      if (!canEdit(level)) { row.assigned_to = null; row.task_id = null; }
      row.last_activity_at = now();
    } else {
      row.number = old.number;
      if (!canEdit(level)) {
        if (row.assigned_to !== old.assigned_to || row.task_id !== old.task_id) return "Only an editor assigns work.";
        if (row.status === "ready_for_review" && old.status !== "ready_for_review") return "Only an editor marks a correction ready for review.";
      }
      if (["resolved", "approved"].includes(String(row.status)) && !["resolved", "approved"].includes(String(old.status))) { row.resolved_by = user; row.resolved_at = now(); }
      else if (!["resolved", "approved"].includes(String(row.status))) { row.resolved_by = null; row.resolved_at = null; }
      if (row.status !== old.status || row.assigned_to !== old.assigned_to) row.last_activity_at = now();
    }
  }
  if (table === "collab_access") {
    const member = (db.agenda_members ?? []).find((entry) => entry.project_id === row.project_id && entry.user_id === row.user_id && ["invited", "active"].includes(String(entry.status)));
    if (!member) return "That person is not on this project.";
  }
  return null;
}

function afterWrite(db: Db, table: string, row: Row, old: Row | null) {
  if (table === "agenda_drawing_revisions" && !old) {
    const drawing = (db.agenda_drawings ?? []).find((entry) => entry.id === row.drawing_id);
    if (drawing) { drawing.current_revision_id = row.id; drawing.updated_at = now(); }
  }
  if (table === "collab_comments" && !old) {
    const thread = (db.collab_threads ?? []).find((entry) => entry.id === row.thread_id);
    if (thread) thread.last_activity_at = now();
    const reads = (db.collab_reads ??= []);
    const mine = reads.find((entry) => entry.user_id === row.author_id && entry.thread_id === row.thread_id);
    if (mine) mine.read_at = now(); else reads.push({ user_id: row.author_id, thread_id: row.thread_id, project_id: row.project_id, read_at: now() });
    if (thread) announce(db, "collab_threads", "UPDATE", thread);
  }
  if (table === "collab_threads") {
    (db.agenda_events ??= []).push({ id: crypto.randomUUID(), project_id: row.project_id, kind: "collab", title: `Comment ${String(row.number)} ${old ? String(row.status).replace(/_/g, " ") : "opened"}`, detail: row.title, actor_id: currentUser(), occurred_at: now(), created_at: now() });
  }
}

const DEFAULTS: Record<string, () => Row> = {
  collab_boards: () => ({ id: crypto.randomUUID(), description: null, layout: "free", settings: {}, sort_order: 0, revision: 1, archived_at: null, created_at: now(), updated_at: now() }),
  collab_items: () => ({ id: crypto.randomUUID(), parent_id: null, x: 0, y: 0, w: 0, h: 0, rotation: 0, z: 0, data: {}, drawing_id: null, storage_path: null, revision: 1, archived_at: null, created_at: now(), updated_at: now() }),
  collab_threads: () => ({ id: crypto.randomUUID(), drawing_id: null, revision_id: null, page: null, x: null, y: null, item_id: null, title: null, status: "open", assigned_to: null, task_id: null, revision: 1, resolved_by: null, resolved_at: null, archived_at: null, created_at: now(), updated_at: now() }),
  collab_comments: () => ({ id: crypto.randomUUID(), mentions: [], edited_at: null, archived_at: null, created_at: now() }),
  collab_annotations: () => ({ id: crypto.randomUUID(), page: null, thread_id: null, style: {}, revision: 1, archived_at: null, created_at: now(), updated_at: now() }),
  agenda_drawings: () => ({ id: crypto.randomUUID(), discipline: "architectural", current_revision_id: null, archived_at: null, created_at: now(), updated_at: now() }),
  agenda_drawing_revisions: () => ({ id: crypto.randomUUID(), status: "open", created_at: now() }),
  agenda_tasks: () => ({ id: crypto.randomUUID(), status: "todo", priority: "normal", description: null, assigned_to: null, due_at: null, started_at: null, completed_at: null, archived_at: null, created_at: now(), updated_at: now() }),
  agenda_approvals: () => ({ id: crypto.randomUUID(), created_at: now() }),
};

function announce(db: Db, table: string, event: "INSERT" | "UPDATE", row: Row) {
  window.__collab.changes.push({ table, event, id: row.id });
  bus?.postMessage({ table, event, row });
  for (const listener of localListeners) listener({ table, event, row });
}
const localListeners = new Set<(change: { table: string; event: string; row: Row }) => void>();

// ---------------------------------------------------------------------------
// The query builder
// ---------------------------------------------------------------------------

class Query implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private filters: ((row: Row) => boolean)[] = [];
  private sorts: { column: string; ascending: boolean }[] = [];
  private max = Infinity;
  private one: "single" | "maybe" | null = null;
  private columns = "*";
  private returning = false;
  private conflict: string[] = [];

  constructor(private table: string) {}
  select(columns = "*") { if (this.op !== "select") this.returning = true; this.columns = columns; return this; }
  insert(payload: Row | Row[]) { this.op = "insert"; this.payload = payload; return this; }
  update(payload: Row) { this.op = "update"; this.payload = payload; return this; }
  upsert(payload: Row | Row[], options: { onConflict?: string } = {}) { this.op = "upsert"; this.payload = payload; this.conflict = (options.onConflict ?? "id").split(","); return this; }
  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  is(column: string, value: unknown) { this.filters.push((row) => (row[column] ?? null) === value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(row[column])); return this; }
  order(column: string, options: { ascending?: boolean } = {}) { this.sorts.push({ column, ascending: options.ascending ?? true }); return this; }
  limit(count: number) { this.max = count; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  then<A = Result, B = never>(resolve?: ((value: Result) => A | PromiseLike<A>) | null, reject?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return new Promise<Result>((done, fail) => setTimeout(() => {
      if (window.__collab.offline) { fail(new TypeError("Failed to fetch")); return; }
      try { done(this.run()); } catch (error) { fail(error); }
    }, 15)).then(resolve, reject);
  }

  private shape(db: Db, row: Row): Row {
    if (this.columns === "*" || !this.columns.includes("(")) {
      if (this.columns === "*") return { ...row };
      const out: Row = {};
      for (const column of this.columns.split(",").map((part) => part.trim())) out[column] = row[column];
      return out;
    }
    const out: Row = {};
    for (const part of splitTop(this.columns)) {
      const embed = /^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/.exec(part.trim());
      if (!embed) { out[part.trim()] = row[part.trim()]; continue; }
      const [, alias, table] = embed;
      if (table === "profiles") out[alias ?? table] = (db.profiles ?? []).find((entry) => entry.id === row.user_id) ?? null;
      else if (table === "agenda_drawing_revisions") out[alias ?? table] = (db.agenda_drawing_revisions ?? []).filter((entry) => entry.drawing_id === row.id);
      else throw new Error(`fake supabase: no embed for ${table}`);
    }
    return out;
  }

  private run(): Result {
    const db = load();
    const user = currentUser();
    const rows = (db[this.table] ??= []);
    const match = (row: Row) => this.filters.every((filter) => filter(row));
    let result: Row[] = [];

    if (this.op === "select") {
      result = rows.filter((row) => visible(db, this.table, row, user) && match(row));
      for (const sort of [...this.sorts].reverse()) result.sort((a, b) => (String(a[sort.column] ?? "") < String(b[sort.column] ?? "") ? -1 : String(a[sort.column] ?? "") > String(b[sort.column] ?? "") ? 1 : 0) * (sort.ascending ? 1 : -1));
      if (this.sorts.some((sort) => ["z", "sort_order"].includes(sort.column))) { const key = this.sorts.find((sort) => ["z", "sort_order"].includes(sort.column))!.column; result.sort((a, b) => Number(a[key]) - Number(b[key])); }
      result = result.slice(0, this.max).map((row) => this.shape(db, row));
    } else if (this.op === "insert" || this.op === "upsert") {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload!];
      for (const payload of payloads) {
        const existing = this.op === "upsert" ? rows.find((row) => this.conflict.every((column) => row[column] === payload[column])) : undefined;
        if (existing) {
          if (!mayUpdate(db, this.table, existing, user)) return { data: null, error: { message: "new row violates row-level security policy" } };
          const next = { ...existing, ...payload };
          const refusal = beforeWrite(db, this.table, next, existing, user);
          if (refusal) return { data: null, error: { message: refusal } };
          Object.assign(existing, next);
          afterWrite(db, this.table, existing, next);
          result.push(existing);
          continue;
        }
        const row = { ...(DEFAULTS[this.table]?.() ?? { id: crypto.randomUUID() }), ...payload };
        // As 0104's trigger: the author is whoever is signed in, whatever was sent.
        if (this.table === "collab_comments") row.author_id = user;
        const denied = refuseInsert(db, this.table, row, user);
        if (denied) return { data: null, error: { message: denied, code: "42501" } };
        const refusal = beforeWrite(db, this.table, row, null, user);
        if (refusal) return { data: null, error: { message: refusal } };
        if (rows.some((entry) => entry.id !== undefined && entry.id === row.id)) return { data: null, error: { message: "duplicate key value violates unique constraint" } };
        rows.push(row);
        afterWrite(db, this.table, row, null);
        result.push(row);
      }
      store(db);
      for (const row of result) announce(db, this.table, "INSERT", row);
    } else {
      for (const row of rows.filter((entry) => match(entry) && visible(db, this.table, entry, user) && mayUpdate(db, this.table, entry, user))) {
        const next = { ...row, ...(this.payload as Row) };
        const refusal = beforeWrite(db, this.table, next, row, user);
        if (refusal) return { data: null, error: { message: refusal, code: refusal.startsWith("Somebody") ? "40001" : "P0001" } };
        Object.assign(row, next);
        afterWrite(db, this.table, row, next);
        result.push(row);
      }
      store(db);
      for (const row of result) announce(db, this.table, "UPDATE", row);
      if (!this.returning) return { data: null, error: null };
      result = result.map((row) => this.shape(db, row));
    }
    if (this.one === "single") return result.length === 1 ? { data: result[0], error: null } : { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } };
    if (this.one === "maybe") return { data: result[0] ?? null, error: null };
    return { data: result, error: null };
  }
}

function splitTop(columns: string): string[] {
  const parts: string[] = [];
  let depth = 0; let current = "";
  for (const char of columns) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) { parts.push(current); current = ""; } else current += char;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

type Handler = { kind: "postgres"; table: string; event: string; filter?: string; callback: (payload: { new: Row; eventType: string }) => void } | { kind: "presence"; callback: () => void };

class Channel {
  private handlers: Handler[] = [];
  private presence = new Map<string, Row[]>();
  private onChange = (change: { table: string; event: string; row: Row }) => this.deliver(change);
  private onMessage = (event: MessageEvent) => {
    const data = event.data as { table?: string; event?: string; row?: Row; presence?: { channel: string; key: string; state: Row | null } };
    if (data.presence) {
      if (data.presence.channel !== this.name) return;
      if (data.presence.state) this.presence.set(data.presence.key, [data.presence.state]); else this.presence.delete(data.presence.key);
      for (const handler of this.handlers) if (handler.kind === "presence") handler.callback();
      return;
    }
    if (data.table && data.row) this.deliver({ table: data.table, event: data.event ?? "UPDATE", row: data.row });
  };
  constructor(private name: string, private key: string) {}
  on(type: string, filter: { event: string; table?: string; filter?: string }, callback: (payload: { new: Row; eventType: string }) => void) {
    if (type === "presence") this.handlers.push({ kind: "presence", callback: callback as unknown as () => void });
    else this.handlers.push({ kind: "postgres", table: filter.table!, event: filter.event, filter: filter.filter, callback });
    return this;
  }
  subscribe(status?: (value: string) => void) {
    bus?.addEventListener("message", this.onMessage);
    localListeners.add(this.onChange);
    setTimeout(() => status?.("SUBSCRIBED"), 10);
    return this;
  }
  private deliver(change: { table: string; event: string; row: Row }) {
    if (window.__collab.deaf) return;
    const db = load();
    // Realtime respects row security: a row this person may not read is not sent.
    if (!visible(db, change.table, change.row, currentUser())) return;
    for (const handler of this.handlers) {
      if (handler.kind !== "postgres" || handler.table !== change.table) continue;
      if (handler.event !== "*" && handler.event !== change.event) continue;
      const [column, value] = (handler.filter ?? "").split("=eq.");
      if (column && change.row[column] !== value) continue;
      handler.callback({ new: change.row, eventType: change.event });
    }
  }
  presenceState() { return Object.fromEntries(this.presence); }
  track(state: Row) { this.presence.set(this.key, [state]); bus?.postMessage({ presence: { channel: this.name, key: this.key, state } }); return Promise.resolve("ok"); }
  send() { return Promise.resolve("ok"); }
  untrack() { bus?.postMessage({ presence: { channel: this.name, key: this.key, state: null } }); return Promise.resolve("ok"); }
  close() { void this.untrack(); bus?.removeEventListener("message", this.onMessage); localListeners.delete(this.onChange); }
}

// ---------------------------------------------------------------------------
// The client
// ---------------------------------------------------------------------------

const files = {
  upload: async (bucket: string, path: string, file: Blob) => {
    if (window.__collab.offline) return { data: null, error: { message: "Failed to fetch" } };
    const project = path.split("/")[0]!;
    if (levelOf(load(), currentUser(), project) === null) return { data: null, error: { message: "new row violates row-level security policy" } };
    const url = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); });
    localStorage.setItem(`__collab_file:${bucket}/${path}`, url);
    return { data: { path }, error: null };
  },
  url: (bucket: string, path: string) => {
    const project = path.split("/")[0]!;
    if (levelOf(load(), currentUser(), project) === null) return null;
    return localStorage.getItem(`__collab_file:${bucket}/${path}`);
  },
};

export function fakeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: currentUser() ? { id: currentUser() } : null }, error: null }) },
    from: (table: string) => new Query(table),
    rpc: async (name: string, args: Record<string, unknown>): Promise<Result> => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      const db = load();
      if (name === "collab_level") return { data: levelOf(db, currentUser(), String(args.target_project)), error: null };
      if (name === "agenda_next_number") {
        if (levelOf(db, currentUser(), String(args.target_project)) === null) return { data: null, error: { message: "You are not on this project." } };
        const counters = (db.agenda_counters ??= []);
        let counter = counters.find((row) => row.project_id === args.target_project && row.kind === args.record_kind);
        if (!counter) { counter = { project_id: args.target_project, kind: args.record_kind, next_value: 1 }; counters.push(counter); }
        const value = Number(counter.next_value);
        counter.next_value = value + 1;
        store(db);
        return { data: `${String(args.prefix)}-${String(value).padStart(Number(args.width ?? 3), "0")}`, error: null };
      }
      throw new Error(`fake supabase: no rpc ${name}`);
    },
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, file: Blob) => files.upload(bucket, path, file),
        createSignedUrl: async (path: string) => { const url = files.url(bucket, path); return url ? { data: { signedUrl: url }, error: null } : { data: null, error: { message: "Object not found" } }; },
        createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: files.url(bucket, path) ?? "" })), error: null }),
      }),
    },
    channel: (name: string, options?: { config?: { presence?: { key?: string } } }) => new Channel(name, options?.config?.presence?.key ?? currentUser()),
    removeChannel: async (channel: Channel) => { channel.close(); return "ok"; },
  };
}

export function createClient() { return fakeClient(); }
