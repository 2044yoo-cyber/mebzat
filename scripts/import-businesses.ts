// Business Import demo/CLI. Imports publicly-available-style business
// listings as UNCLAIMED companies (no user account). Extensible: point it at
// a different JSON file, or add a new importer that maps another source's
// fields onto BusinessRecord and calls importBusinesses().
//
//   tsx --env-file=.env.local scripts/import-businesses.ts [path-to.json]
//   (default: scripts/data/businesses.sample.json)   or: npm run import:businesses
//
// Safe to re-run: rows are keyed on (import_source, external_ref).

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { adminClient, requireTables } from "./lib/admin";
import { importBusinesses, type BusinessRecord } from "./lib/import";

type ImportFile = { source: string; businesses: BusinessRecord[] };

async function main() {
  const file = process.argv[2] ?? "scripts/data/businesses.sample.json";
  const raw = await readFile(resolve(process.cwd(), file), "utf8");
  const parsed = JSON.parse(raw) as ImportFile;

  if (!parsed.source || !Array.isArray(parsed.businesses)) {
    throw new Error(
      `Invalid import file "${file}": expected { source, businesses[] }.`,
    );
  }

  const admin = adminClient();
  await requireTables(admin, ["companies"]);

  console.log(
    `Importing ${parsed.businesses.length} businesses from "${parsed.source}"…`,
  );
  const count = await importBusinesses(admin, parsed.source, parsed.businesses);
  console.log(`✓ Imported/updated ${count} unclaimed businesses.`);
  console.log("They appear under /companies with a 'Claim this business' CTA.");
}

main().catch((err) => {
  console.error("\nImport failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
