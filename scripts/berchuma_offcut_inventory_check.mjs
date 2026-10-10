import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/0073_offcut_inventory.sql");
const service = read("src/features/berchuma-studio/services/offcuts.ts");
const page = read("src/app/studio/offcuts/page.tsx");
const component = read("src/features/berchuma-studio/components/offcut-inventory.tsx");
const types = read("src/types/database.types.ts");
const workspace = read("src/features/berchuma-studio/components/studio-workspace.tsx");

let passed = 0;
function check(name, condition) {
  assert.ok(condition, name);
  passed += 1;
}

check("offcut inventory is a dedicated persistent table", /create table if not exists public\.offcut_inventory/.test(migration));
check("inventory stores decimal millimetre dimensions", /thickness_mm numeric\(10, 2\)/.test(migration) && /length_mm numeric\(10, 2\)/.test(migration) && /width_mm numeric\(10, 2\)/.test(migration));
check("inventory is protected by row-level security", /enable row level security/.test(migration) && /using \(owner_id = \(select auth\.uid\(\)\)\)/.test(migration));
check("insert and update policies enforce the current account owner", /for insert[\s\S]*?with check \(owner_id = \(select auth\.uid\(\)\)\)/.test(migration) && /for update[\s\S]*?with check \(owner_id = \(select auth\.uid\(\)\)\)/.test(migration));
check("stock status is constrained to known workflow states", /'available', 'reserved', 'used', 'discarded'/.test(migration));
check("service derives ownership from the authenticated user", /auth\.getUser\(\)/.test(service) && /owner_id: user\.id/.test(service));
check("service validates positive finite dimensions and whole-number quantity", /Number\.isFinite\(value\) \|\| value <= 0/.test(service) && /Number\.isInteger\(input\.quantity\)/.test(service));
check("status and delete mutations include the authenticated owner filter", (service.match(/\.eq\("owner_id", user\.id\)/g) ?? []).length >= 2);
check("inventory form accepts precise decimal measurements", /step="any"/.test(component) && /thicknessMm: Number/.test(read("src/app/studio/offcuts/actions.ts")));
check("inventory page requires an authenticated account", /redirect\("\/login\?redirect=%2Fstudio%2Foffcuts"\)/.test(page));
check("inventory page clearly discloses stock-matching is a later step", /not yet automatically deducted/.test(page));
check("the Berchuma dashboard links to offcut inventory", /href="\/studio\/offcuts"/.test(workspace));
check("database types include the persistent inventory table", /offcut_inventory: \{[\s\S]*?thickness_mm: number;[\s\S]*?length_mm: number;[\s\S]*?width_mm: number;/.test(types));

console.log(`${passed} offcut inventory checks passed.`);
