#!/usr/bin/env node
/**
 * The profile form saves against a database that stopped part-way.
 *
 *   node scripts/profile_columns_check.mjs
 *
 * ## Why this is not one of the SQL tests
 *
 * `supabase/tests/run.sh` applies every migration and then runs the test. That
 * is the right harness for a policy and the wrong one for 0100, whose entire
 * job is to be the safety net for a database that does *not* have every
 * migration. Under that harness, removing `company_size` from 0100 changes
 * nothing — 0086 still adds it — so a mutation of the thing being tested
 * passes, which is a check that proves nothing.
 *
 * So this builds the failing database instead: migrations up to 0085 and no
 * further, which is what production looked like when saving a profile answered
 *
 *   Could not find the 'company_size' column of 'profiles' in the schema cache
 *
 * then applies 0100 on its own and asks whether the form's columns are there.
 *
 * ## And then again on a database that has everything
 *
 * Because the other half of the contract is that it changes nothing. 0100 runs
 * twice more against the fully migrated database, and a row written before it
 * is read back afterwards: no dropped column, no reset default, no lost value.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const BIN = process.env.PG_BIN ?? "/usr/lib/postgresql/16/bin";
const SOCK = process.env.PG_SOCK ?? "/tmp/pgsock";
const PORT = process.env.PG_PORT ?? "5599";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

function psql(db, args) {
  return execFileSync(
    `${BIN}/psql`,
    ["-h", SOCK, "-p", PORT, "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-q", ...args],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
}

function query(db, sql) {
  return psql(db, ["-tAc", sql]).trim();
}

/** The columns the profile form posts that the initial schema did not have. */
const FORM_COLUMNS = [
  "company_size",
  "industry",
  "portfolio_link",
  "linkedin_url",
  "profession_details",
  "specialties",
  "base_area",
  "travel_radius_km",
  "serves_entire_city",
  "show_phone",
  "show_email",
  "profession",
  "work_status",
];

const DB = "medosha_cols";

/**
 * A database with the migrations up to `cutoff` and nothing after.
 *
 * Two cutoffs are used below, for two different reasons.
 *
 * **85** is the production case: the database that answered "could not find
 * the 'company_size' column", one migration short of the one that added it.
 *
 * **13** is the case that exercises every line. The areas block, the contact
 * toggles and the work-status enum all arrived between 0014 and 0078, so at a
 * cutoff of 85 they are already present and 0100's lines for them are no-ops —
 * which means a mutation deleting those lines passes. It is the same trap as a
 * second copy elsewhere in the file, with a migration playing the part of the
 * copy.
 */
function buildAt(cutoff) {
  psql("postgres", ["-c", `drop database if exists ${DB};`, "-c", `create database ${DB};`]);
  try {
    psql(DB, ["-f", "supabase/tests/bootstrap.sql"]);
  } catch {
    // The bootstrap prints notices for objects Supabase already provides; a
    // real failure here shows up as a missing table in the assertions below.
  }

  const migrations = readdirSync("supabase/migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrations) {
    if (Number(file.slice(0, 4)) > cutoff) continue;
    psql(DB, ["-f", `supabase/migrations/${file}`]);
  }
}

function columnsPresent() {
  return query(
    DB,
    `select string_agg(column_name, ',' order by column_name)
     from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name in (${FORM_COLUMNS.map((c) => `'${c}'`).join(",")})`,
  )
    .split(",")
    .filter(Boolean);
}

try {
  for (const cutoff of [85, 13]) {
    buildAt(cutoff);

    const missingBefore = FORM_COLUMNS.filter((c) => !columnsPresent().includes(c));
    check(
      `at ${cutoff}, the database really is missing what the form writes`,
      missingBefore.length > 0,
      "if it already has them, the rest of this pass is testing nothing",
    );

    // The migration, on its own, with nothing after the cutoff applied.
    psql(DB, ["-f", "supabase/migrations/0100_profile_form_columns.sql"]);

    const present = columnsPresent();
    for (const column of FORM_COLUMNS) {
      check(
        `at ${cutoff}, profiles.${column} exists afterwards`,
        present.includes(column),
        "the form writes it, so a save fails on it the moment company_size stops being the first one missing",
      );
    }
  }

  // The types, checked once — they do not depend on the cutoff.
  check(
    "the specialties column holds a list, not a string",
    query(
      DB,
      `select data_type from information_schema.columns
       where table_name = 'profiles' and column_name = 'specialties'`,
    ) === "ARRAY",
    "one string with commas in it is one specialty called 'Fit-out, Finishing'",
  );

  check(
    "the trade's answers are an object rather than a null",
    query(
      DB,
      `select is_nullable from information_schema.columns
       where table_name = 'profiles' and column_name = 'profession_details'`,
    ) === "NO",
    "code that reads it expects an object",
  );

  check(
    "company_size is text, which is what the form validates and writes",
    query(
      DB,
      `select data_type from information_schema.columns
       where table_name = 'profiles' and column_name = 'company_size'`,
    ) === "text",
    "the value is a band — '6–20 people' — and not a number",
  );

  check(
    "and work_status is the enum, not free text",
    query(
      DB,
      `select data_type from information_schema.columns
       where table_name = 'profiles' and column_name = 'work_status'`,
    ) === "USER-DEFINED",
  );

  // PostgREST answers from a cached schema, so a column added underneath it is
  // invisible until it reloads. Without this the migration works and the error
  // does not go away, which is indistinguishable from the migration failing.
  check(
    "PostgREST is told to reload its schema",
    /notify pgrst, 'reload schema';/.test(
      readFileSync("supabase/migrations/0100_profile_form_columns.sql", "utf8"),
    ),
  );

  // The other half: nothing already there is touched.
  psql(DB, [
    "-c",
    `insert into auth.users (id, email)
     values ('82000000-0000-4000-8000-000000000001', 'keep@example.test')
     on conflict (id) do nothing;`,
    "-c",
    `update public.profiles set full_name = 'Keep Me', bio = 'Existing bio',
       company_size = '6–20 people', languages = array['Amharic']
     where id = '82000000-0000-4000-8000-000000000001';`,
  ]);

  psql(DB, ["-f", "supabase/migrations/0100_profile_form_columns.sql"]);
  psql(DB, ["-f", "supabase/migrations/0100_profile_form_columns.sql"]);

  check(
    "running it again changes nothing that was already written",
    query(
      DB,
      `select full_name || '|' || bio || '|' || company_size || '|' ||
              array_to_string(languages, ',')
       from public.profiles
       where id = '82000000-0000-4000-8000-000000000001'`,
    ) === "Keep Me|Existing bio|6–20 people|Amharic",
    "a migration that has to be safe to re-run has to be safe to re-run twice",
  );

  psql("postgres", ["-c", `drop database ${DB};`]);
} catch (error) {
  failures.push(`the harness itself failed — ${error.message.slice(0, 400)}`);
}

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}profile columns: the form saves against a database that stopped early${RESET}`);
