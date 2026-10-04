/**
 * Regenerate src/types/database.types.ts from a live schema.
 *
 *   node scripts/gen_database_types.mjs "postgresql://user@host:port/db"
 *
 * The file this replaces was maintained by hand. It described 14 tables while
 * the migrations had grown to 131, so every query against a newer table
 * resolved to `never` and roughly 850 type errors followed — none of them real
 * bugs, all of them one stale file. Generating it removes the possibility of
 * that drift: run this after adding a migration.
 *
 * Requires psql on PATH. The Supabase CLI's own `gen types` needs Docker,
 * which is not always available.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const DB = process.argv[2];
if (!DB) {
  console.error("usage: node scripts/gen_database_types.mjs <postgres-url>");
  process.exit(1);
}

const q = (sql) =>
  JSON.parse(
    execFileSync("psql", [DB, "-tAc", `select coalesce(json_agg(x), '[]') from (${sql}) x`], {
      encoding: "utf8",
      maxBuffer: 1 << 28,
    }).trim(),
  );

/* ------------------------------------------------------------------ names */

const pascal = (s) => s.split("_").filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("");
const quote = (s) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(s) ? s : JSON.stringify(s));

/* ------------------------------------------------------------------ types */

const SCALARS = new Map([
  ["bool", "boolean"],
  ["int2", "number"], ["int4", "number"], ["int8", "number"],
  ["float4", "number"], ["float8", "number"], ["numeric", "number"],
  ["json", "Json"], ["jsonb", "Json"],
]);

// Everything textual, temporal or otherwise serialized by PostgREST arrives as
// a string: uuid, date, timestamptz, interval, inet, citext, bytea, vector.
const tsType = (typname, typtype, elem, elemKind) => {
  if (typname.startsWith("_") || elem) {
    const inner = tsType(elem || typname.slice(1), elemKind || "b", null, null);
    return `${inner}[]`;
  }
  if (typtype === "e") return pascal(typname);
  return SCALARS.get(typname) ?? "string";
};

/* ------------------------------------------------------------------ query */

const enumRows = q(`
  select t.typname, e.enumlabel
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
  order by t.typname, e.enumsortorder`);

const cols = q(`
  select c.relname as tbl, c.relkind as kind, a.attname as col,
         not a.attnotnull as nullable,
         (a.atthasdef or a.attidentity <> '') as has_default,
         t.typname as typname, t.typtype as typtype,
         et.typname as elem, et.typtype as elem_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  join pg_type t on t.oid = a.atttypid
  left join pg_type et on et.oid = t.typelem and t.typcategory = 'A'
  where n.nspname = 'public' and c.relkind in ('r','p','v','m')
  order by c.relname, a.attnum`);

const fns = q(`
  select p.proname,
         pg_get_function_result(p.oid) as result,
         coalesce(json_agg(json_build_object(
           'name', pr.name, 'type', pr.type, 'has_default', pr.has_default
         ) order by pr.ord) filter (where pr.name is not null), '[]') as args
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  left join lateral (
    select a.ord,
           coalesce(p.proargnames[a.ord], 'arg' || a.ord) as name,
           format_type(a.oid, null) as type,
           a.ord > (p.pronargs - p.pronargdefaults) as has_default
    from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality as a(oid, ord)
    where coalesce(p.proargmodes[a.ord], 'i') in ('i','b')
  ) pr on true
  where n.nspname = 'public' and p.prokind = 'f'
    and pg_get_function_result(p.oid) <> 'trigger'
  group by p.oid, p.proname`);

/* ------------------------------------------------------------------ build */

const enums = new Map();
for (const { typname, enumlabel } of enumRows) {
  if (!enums.has(typname)) enums.set(typname, []);
  enums.get(typname).push(enumlabel);
}

const tables = new Map();
for (const c of cols) {
  if (!tables.has(c.tbl)) tables.set(c.tbl, { kind: c.kind, cols: [] });
  tables.get(c.tbl).cols.push(c);
}

const ARG_TS = (t) => {
  const base = t.replace(/\[\]$/, "").replace(/\(.*\)/, "").trim();
  const arr = t.endsWith("[]") ? "[]" : "";
  if (/^(bool|boolean)$/.test(base)) return "boolean" + arr;
  if (/^(smallint|integer|bigint|numeric|real|double precision)$/.test(base)) return "number" + arr;
  if (/^jsonb?$/.test(base)) return "Json" + arr;
  if (enums.has(base)) return pascal(base) + arr;
  return "string" + arr;
};

const splitCols = (sig) => {
  const inner = sig.replace(/^TABLE\(/i, "").replace(/\)$/, "");
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of inner) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts
    .map((x) => x.trim().match(/^("[^"]+"|\w+)\s+(.+)$/))
    .filter(Boolean)
    .map((m) => ({ name: m[1].replace(/"/g, ""), type: m[2] }));
};

// `returns setof <table>` is a row set, not a scalar. Falling through to the
// scalar map turned it into string[], which is why material_price_lookup's
// caller was told it was mapping over strings.
const relationRow = (name) => {
  const rel = tables.get(name);
  if (!rel) return null;
  return `{ ${rel.cols
    .map((c) => `${quote(c.col)}: ${tsType(c.typname, c.typtype, c.elem, c.elem_kind)}${c.nullable ? " | null" : ""}`)
    .join("; ")} }`;
};

const RET_TS = (r) => {
  let s = r.replace(/^SETOF\s+/i, "");
  const setof = /^SETOF\s+/i.test(r);
  const rel = relationRow(s.replace(/^public\./, ""));
  if (rel) return setof ? `${rel}[]` : rel;
  if (/^TABLE\(/i.test(s)) {
    const c = splitCols(s);
    if (!c.length) return "Record<string, unknown>[]";
    return `{ ${c.map((x) => `${quote(x.name)}: ${ARG_TS(x.type)}`).join("; ")} }[]`;
  }
  if (/^(void)$/i.test(s)) return "undefined";
  const t = ARG_TS(s);
  return setof ? `${t}[]` : t;
};

const out = [];
out.push(`// GENERATED by scripts/gen_database_types.mjs — do not edit by hand.`);
out.push(`// Regenerate after changing supabase/migrations:`);
out.push(`//   node scripts/gen_database_types.mjs "$DATABASE_URL"`);
out.push(``);
out.push(`export type Json =`);
out.push(`  | string`);
out.push(`  | number`);
out.push(`  | boolean`);
out.push(`  | null`);
out.push(`  | { [key: string]: Json | undefined }`);
out.push(`  | Json[];`);
out.push(``);

for (const [name, labels] of [...enums].sort()) {
  out.push(`export type ${pascal(name)} =`);
  out.push(labels.map((l) => `  | ${JSON.stringify(l)}`).join("\n") + `;`);
  out.push(``);
}

const isView = (k) => k === "v" || k === "m";
const tableNames = [...tables].filter(([, v]) => !isView(v.kind)).map(([k]) => k).sort();
const viewNames = [...tables].filter(([, v]) => isView(v.kind)).map(([k]) => k).sort();

const rowBlock = (cols, mode) =>
  cols
    .map((c) => {
      const t = tsType(c.typname, c.typtype, c.elem, c.elem_kind);
      const nul = c.nullable ? " | null" : "";
      const opt =
        mode === "Update" || (mode === "Insert" && (c.has_default || c.nullable)) ? "?" : "";
      return `          ${quote(c.col)}${opt}: ${t}${nul};`;
    })
    .join("\n");

out.push(`export interface Database {`);
out.push(`  public: {`);
out.push(`    Tables: {`);
for (const t of tableNames) {
  const c = tables.get(t).cols;
  out.push(`      ${quote(t)}: {`);
  out.push(`        Row: {`); out.push(rowBlock(c, "Row")); out.push(`        };`);
  out.push(`        Insert: {`); out.push(rowBlock(c, "Insert")); out.push(`        };`);
  out.push(`        Update: {`); out.push(rowBlock(c, "Update")); out.push(`        };`);
  out.push(`        Relationships: [];`);
  out.push(`      };`);
}
out.push(`    };`);

out.push(`    Views: {`);
if (viewNames.length === 0) out.push(`      [_ in never]: never;`);
for (const v of viewNames) {
  const c = tables.get(v).cols;
  out.push(`      ${quote(v)}: {`);
  out.push(`        Row: {`); out.push(rowBlock(c, "Row")); out.push(`        };`);
  out.push(`        Relationships: [];`);
  out.push(`      };`);
}
out.push(`    };`);

out.push(`    Functions: {`);
const seen = new Set();
for (const f of fns.sort((a, b) => a.proname.localeCompare(b.proname))) {
  if (seen.has(f.proname)) continue; // overloads: first wins, args widen below
  seen.add(f.proname);
  const args = (typeof f.args === "string" ? JSON.parse(f.args) : f.args) ?? [];
  out.push(`      ${quote(f.proname)}: {`);
  if (args.length === 0) out.push(`        Args: Record<PropertyKey, never>;`);
  else {
    out.push(`        Args: {`);
    for (const a of args)
      out.push(
        `          ${quote(a.name)}${a.has_default ? "?" : ""}: ${ARG_TS(a.type)}${a.has_default ? " | null" : ""};`,
      );
    out.push(`        };`);
  }
  out.push(`        Returns: ${RET_TS(f.result)};`);
  out.push(`      };`);
}
out.push(`    };`);
out.push(`    Enums: {`);
for (const [name] of [...enums].sort()) out.push(`      ${quote(name)}: ${pascal(name)};`);
out.push(`    };`);
out.push(`    CompositeTypes: {`);
out.push(`      [_ in never]: never;`);
out.push(`    };`);
out.push(`  };`);
out.push(`}`);
out.push(``);



/* ---------------------------------------------------------------- aliases */

// The application imports ~100 names directly from this module. Most resolve
// to a table Row or an enum by name; the rest are the row shape of a
// `returns table(...)` function, which has no Row anywhere to point at.
//
// Keeping these here rather than in a hand-edited tail is the whole point:
// the previous file drifted because the aliases and the schema were
// maintained separately.

const singular = (s) =>
  s.endsWith("ies") ? s.slice(0, -3) + "y"
  : /(?:ses|xes|ches|shes)$/.test(s) ? s.slice(0, -2)
  : s.endsWith("s") && !s.endsWith("ss") ? s.slice(0, -1)
  : s;

// Names whose spelling does not follow from the schema object's own name.
const ENUM_ALIAS = {
  AiAgentName: "ai_agent",
  FeedKindName: "feed_kind",
  FeedTopicName: "feed_topic",
  FeedFileKindName: "feed_file_kind",
};
const RELATION_ALIAS = {
  MedoshaEvent: "events",           // Event would shadow the DOM global
  SocialAccountPublic: "social_accounts_public",
  // Callers spell these with a Row/Entry/Item suffix where the bare singular
  // would read as the domain object rather than one record of it.
  AgendaMemberRow: "agenda_members",
  CreditLedgerEntry: "credit_ledger",
  MaterialPriceRow: "material_prices",
  ServicePortfolioItem: "service_portfolio",
  SocialPublishLogEntry: "social_publish_log",
};
// Row shapes of table-returning functions.
const FUNCTION_ROW = {
  // A nearby_places table exists, but callers use this name for the result of
  // places_near_property(), which carries distance_km and omits the columns
  // the table has. The function wins: it is what getNearbyPlaces returns.
  NearbyPlace: "places_near_property",
  PropertyLocation: "property_location",
  SearchResult: "global_search",
  MapProperty: "properties_in_viewport",
  ProfessionalMatch: "match_professionals",
  InvestOverview: "invest_overview",
  ConversationSummary: "list_conversations",
};

out.push(`/* ---------------------------------------------------------------- */`);
out.push(`/* Aliases the application imports by name.                          */`);
out.push(`/* ---------------------------------------------------------------- */`);
out.push(``);

const relByPascal = new Map();
for (const [name, v] of tables) {
  const where = isView(v.kind) ? "Views" : "Tables";
  relByPascal.set(pascal(name), [where, name]);
  relByPascal.set(pascal(singular(name)), [where, name]);
}

for (const [alias, en] of Object.entries(ENUM_ALIAS))
  out.push(`export type ${alias} = Database["public"]["Enums"][${JSON.stringify(en)}];`);
for (const [alias, rel] of Object.entries(RELATION_ALIAS)) {
  const hit = relByPascal.get(pascal(singular(rel))) ?? relByPascal.get(pascal(rel));
  if (hit) out.push(`export type ${alias} = Database["public"]["${hit[0]}"][${JSON.stringify(hit[1])}]["Row"];`);
}
out.push(``);

// Every relation also gets its singular PascalCase name, which is what the
// application actually imports (Job, Property, Payment, ...). Update variants
// only where a caller asks for one.
const EXPLICIT_UPDATE = new Set(["profiles"]);
const claimed = new Set([
  ...Object.keys(ENUM_ALIAS),
  ...Object.keys(RELATION_ALIAS),
  ...Object.keys(FUNCTION_ROW),
]);
for (const [pas, [where, rel]] of [...relByPascal].sort()) {
  if (pas !== pascal(singular(rel))) continue;
  if (claimed.has(pas)) continue;
  out.push(`export type ${pas} = Database["public"]["${where}"][${JSON.stringify(rel)}]["Row"];`);
  if (EXPLICIT_UPDATE.has(rel))
    out.push(`export type ${pas}Update = Database["public"]["${where}"][${JSON.stringify(rel)}]["Update"];`);
}
out.push(``);

// `returns table(...)` gives the exact column list. Columns are emitted
// non-null: these are read paths whose SQL coalesces, and the callers were
// written against non-null. A null here is a bug in the function, not a
// case the page is expected to handle.

for (const [alias, fname] of Object.entries(FUNCTION_ROW)) {
  const f = fns.find((x) => x.proname === fname);
  if (!f || !/^TABLE\(/i.test(f.result)) { console.error(`  ! ${alias}: ${fname} is not table-returning`); continue; }
  const c = splitCols(f.result);
  if (!c.length) { console.error(`  ! ${alias}: could not parse ${f.result}`); continue; }
  out.push(`/** Row of public.${fname}(). */`);
  out.push(`export type ${alias} = {`);
  for (const x of c) out.push(`  ${quote(x.name)}: ${ARG_TS(x.type)};`);
  out.push(`};`);
}
out.push(``);

writeFileSync("src/types/database.types.ts", out.join("\n"));

console.log(`tables=${tableNames.length} views=${viewNames.length} enums=${enums.size} functions=${seen.size}`);
