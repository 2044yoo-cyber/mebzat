/**
 * The Studio page's server-side wiring that the browser harness stands in for.
 *
 *   npx tsx scripts/collab_wiring_check.ts
 *
 * The harness renders the Studio itself, so what the real page passes in is
 * not exercised there. These are the lines whose loss would quietly offer
 * (or withhold) something: read with comments stripped, scoped to the
 * function that has to say it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (value: unknown, message: string) => { assert.ok(value, message); checks += 1; };
const code = (source: string) => source.replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
/** From `start` to the next top-level `export`, so a sibling's line does not count. */
const scope = (source: string, start: string) => { const from = source.indexOf(start); assert.ok(from >= 0, `${start} not found`); const rest = source.slice(from + start.length); const next = rest.search(/\nexport /); return start + (next < 0 ? rest : rest.slice(0, next)); };

const page = scope(code(readFileSync("src/app/(dashboard)/agenda/projects/[projectId]/collaborate/page.tsx", "utf8")), "export default async function CollaboratePage");
ok(/supabase\.rpc\("agenda_can_approve", \{ target_project: projectId \}\)/.test(page), "the page asks the database whether this person may approve");
ok(/mayApprove=\{approve\.data === true\}/.test(page), "and passes exactly that to the Studio — nothing when the answer is missing");

const actions = code(readFileSync("src/app/(dashboard)/agenda/projects/[projectId]/collaborate/actions.ts", "utf8"));
const decide = scope(actions, "export async function decideRevision");
const asked = decide.search(/supabase\.rpc\("agenda_can_approve", \{ target_project: project \}\)/);
const refused = decide.search(/if \(mayApprove !== true\) return fail\(/);
const written = decide.search(/supabase\.from\("agenda_approvals"\)\.insert\(/);
ok(asked >= 0 && refused > asked && written > refused, "decideRevision asks and refuses before it writes an approval");
ok(!/\.upsert\(/.test(decide), "and never overwrites an earlier decision");
ok(/step: \(last\?\.step \?\? 0\) \+ 1/.test(decide), "each decision is the next step");

const review = code(readFileSync("src/components/collab/review-view.tsx", "utf8"));
ok(/\{studio\.mayApprove \? \(\s*<>\s*<button[^>]*onClick=\{\(\) => void decide\("approved"\)\}/.test(review), "the approve buttons are behind mayApprove");

console.log(`Studio wiring: ${checks} checks`);
