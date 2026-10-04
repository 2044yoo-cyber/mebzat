/**
 * Content safety, checked where it can be checked without a network.
 *
 *   npx tsx scripts/moderation_check.ts
 *
 * The properties below are the ones whose failure is silent. A moderation
 * system that fails open still renders an upload form, still shows "Checking
 * your content…", and still publishes everything — it looks exactly like one
 * that works. So the checks are mostly about what happens when something goes
 * wrong, rather than about the happy path.
 */

import { readFileSync } from "node:fs";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const provider = readFileSync("src/lib/moderation/provider.ts", "utf8");
const service = readFileSync("src/lib/moderation/service.ts", "utf8");
const types = readFileSync("src/lib/moderation/types.ts", "utf8");
const video = readFileSync("src/lib/moderation/video.ts", "utf8");
const strikes = readFileSync("src/lib/moderation/strikes.ts", "utf8");
const sql = readFileSync("supabase/migrations/0052_moderation.sql", "utf8");
// 0052 declared the publish gate; 0076 replaced it. Both files stay on disk,
// so a check that reads only the first keeps asserting a constraint the
// database no longer has.
const later = readFileSync(
  "supabase/migrations/0076_review_after_posting.sql",
  "utf8",
);

/** Comments stripped, so a check never matches the prose explaining itself. */
/**
 * NOTE ON STRIPPING BLOCK COMMENTS
 *
 * `/\*` is only treated as a comment opener when something that cannot be part
 * of a token precedes it. Without that guard the `/\*` inside a string literal
 * — `accept="image/\*"` is the common one — opens a comment that runs to the
 * next real `*\/`, silently deleting everything between. In this repository
 * that was 109 files and, in one case, 3,497 characters of real markup.
 *
 * Checks read the stripped text, so anything swallowed is code no assertion can
 * see: the check passes because the thing it was looking for is not there to
 * disagree with, which is worse than the check not existing.
 */
const code = (source: string) =>
  source.replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

/* -------------------------------------------------------------------------- */
/* Not having looked is not a finding                                         */
/* -------------------------------------------------------------------------- */

// This section asserted the opposite until now, and the opposite was wrong in
// a way that made the product unusable: with no classifier key set, every
// upload on the platform resolved to `review`, and the setup help said so —
// "every upload goes to review rather than being published".
//
// Nothing is loosened by the change. With no provider there is no verdict, so
// nothing was being blocked before either; the difference is only whether
// ordinary work is held in front of a moderator first. What must still hold is
// that a *positive* finding is acted on, and that is the section below.
check(
  "no provider configured publishes rather than queueing",
  /if \(!provider\) \{[\s\S]{0,900}status: "safe"/.test(code(service)),
  "an install with no key sent every photograph to a queue nobody was going to empty",
);
check(
  "and records why it was not checked",
  /status: "safe",[\s\S]{0,160}reason: "no moderation provider configured"/.test(
    code(service),
  ),
  "a row that does not say it was unchecked cannot be found and re-checked later",
);
check(
  "a text check that throws does not hold the upload",
  /catch[\s\S]{0,400}status: "safe"[\s\S]{0,160}text check unavailable/.test(
    code(service),
  ),
  "an outage is not evidence about the content",
);
check(
  "an image check that throws does not hold the upload",
  /catch[\s\S]{0,400}status: "safe"[\s\S]{0,160}image check unavailable/.test(
    code(service),
  ),
);
check(
  "nothing checkable publishes, with the reason recorded",
  /verdicts\.length === 0[\s\S]{0,400}status: "safe"[\s\S]{0,200}nothing checkable/.test(
    code(service),
  ),
);

// The regression the brief names. A moderation record is an audit trail, not a
// permission slip: when it cannot be written, ordinary content still goes out.
check(
  "a failed record write returns the real verdict",
  // The whole statement, in a short window. `status: verdict.status` alone
  // also appears in the *success* return a few lines below, inside 200
  // characters of this one — so the loose version of this check passed with
  // the failure branch mutated straight back to a flat "review".
  /could not record decision[\s\S]{0,120}return \{ status: verdict\.status, category: verdict\.category \};/.test(
    code(service),
  ),
  "returning a flat 'review' with no id made the upload path refuse every image",
);
check(
  "so a blocked image is still refused when its record fails",
  // Asserted through the caller, because that is where the decision is: the
  // service hands back the verdict and `upload-actions` is what acts on it.
  /outcome\.status === "blocked"/.test(
    code(readFileSync("src/app/moderation/upload-actions.ts", "utf8")),
  ),
  "refusing is the safety-critical direction and it still fails closed",
);
check(
  "and publication no longer requires an id at all",
  !/!\s*outcome\.itemId/.test(
    code(readFileSync("src/app/moderation/upload-actions.ts", "utf8")),
  ),
);
check(
  "publishApproved runs without a record",
  // Both scoped. `itemId: string | null` is also `audit()`'s second parameter,
  // and `if (itemId) {` guards the record *update* further down as well, so
  // either loose match survived a mutation of the one that matters.
  /itemId: string \| null,\n  quarantinePath: string,/.test(code(service)) &&
    /if \(itemId\) \{\s*const \{ data: item \} = await client/.test(code(service)),
  "otherwise the fix stops at the caller and the publish step refuses anyway",
);
check(
  "and still watermarks when there is no record to read the author from",
  /fallback\?: \{ userId: string \| null; contentType: ContentKind \}/.test(
    code(service),
  ),
  "a published image with no mark is the watermark feature silently off",
);

// The setup help is read by an operator deciding whether anything is wrong.
check(
  "the setup help describes what actually happens now",
  !/every upload goes to review/.test(provider),
  "it told operators the opposite of what the code does",
);
check(
  "and the console says so where an operator will see it",
  /isModerationConfigured\(\)/.test(
    readFileSync("src/app/admin/moderation/page.tsx", "utf8"),
  ),
  "an empty queue looks the same whether nothing was flagged or nothing was checked",
);

/* -------------------------------------------------------------------------- */
/* The three flows the product has                                            */
/* -------------------------------------------------------------------------- */

// Normal, suspicious, reported. The section above is about the first one; this
// is about the other two still working, because a change that makes everything
// publish is trivially achieved by breaking the classifier entirely.
check(
  "a positive finding above the block threshold still blocks",
  /if \(confidence >= blockThreshold\(\)\) return "blocked";/.test(code(provider)),
  "the whole point of publishing the unchecked is that the checked is still acted on",
);
check(
  "a finding between the thresholds still flags for a person",
  /if \(confidence >= reviewThreshold\(\)\) return "review";/.test(code(provider)),
);
check(
  "and the worst verdict still wins when several checks ran",
  /RANK\[candidate\.status\] > RANK\[worstSoFar\.status\]/.test(code(service)),
  "a clean photograph with a solicitation in the caption is not clean",
);
check(
  "safe still ranks below every other verdict",
  /safe: 0,/.test(code(service)),
  "if safe outranked anything, a single clean check would override a finding",
);

// The reported flow, which the brief splits into low-risk and high-risk. This
// is 0076's behaviour and it already matches; these assert it stays that way.
check(
  "one report does not hide anything",
  /moderation_hide_threshold\(\)\s*\n?returns integer language sql immutable as \$\$ select 3 \$\$/.test(
    later,
  ),
  "a single person must not be able to take somebody's work down",
);
check(
  "unless it names something that cannot wait",
  /moderation_hides_on_first\([\s\S]{0,200}'sexual_minors', 'sexual_explicit', 'illegal', 'threats'/.test(
    later,
  ),
);
check(
  "hiding is reversible, not a delete",
  /set hidden_at = now\(\),/.test(later) && !/delete from public\.moderation_items/.test(later),
  "nothing is destroyed on the say-so of a report",
);
check(
  "and the file goes back to quarantine rather than staying fetchable",
  /hideReported\(/.test(readFileSync("src/app/moderation/actions.ts", "utf8")),
  "a page holds the URL, not a join, so clearing a flag hides nothing on its own",
);

/* -------------------------------------------------------------------------- */
/* Uncertainty reviews rather than blocks                                     */
/* -------------------------------------------------------------------------- */

check(
  "there is a block threshold and a lower review threshold",
  /blockThreshold/.test(provider) && /reviewThreshold/.test(provider),
);
check(
  "the block threshold is high by default",
  /Number\.isFinite\(raw\)[\s\S]{0,80}: 0\.9/.test(code(provider)),
  "a false block silences somebody with no recourse until an appeal is read",
);
check(
  "scores between the thresholds go to review",
  /if \(confidence >= blockThreshold\(\)\) return "blocked";[\s\S]{0,120}if \(confidence >= reviewThreshold\(\)\) return "review";/.test(
    code(provider),
  ),
);

/* -------------------------------------------------------------------------- */
/* The category that is never automatic                                       */
/* -------------------------------------------------------------------------- */

check(
  "suspected content involving minors never resolves to safe in code",
  /if \(category === "sexual_minors"\) return "review";/.test(code(provider)),
);
check(
  "it is checked before any other category",
  code(provider).indexOf('category === "sexual_minors"') <
    code(provider).indexOf("confidence >= blockThreshold"),
);
check(
  "and at a far lower bar in images",
  /minors >= 0\.15/.test(code(provider)),
  "a false review costs a wait; the other error does not bear thinking about",
);
check(
  "the database refuses it too",
  /constraint csam_never_safe check \([\s\S]{0,120}sexual_minors[\s\S]{0,60}safe/.test(
    sql,
  ),
  "no code path, moderator action or appeal can mark it safe",
);
check(
  "it is not offered as a report dropdown option",
  !/id: "sexual_minors"/.test(types),
  "that case needs escalation, not filing alongside spam",
);

/* -------------------------------------------------------------------------- */
/* Published means cleared                                                    */
/* -------------------------------------------------------------------------- */

// 0076 moved the line. `review` publishes and is looked at afterwards, because
// holding back everything a classifier was unsure about held back mostly
// innocent work — and held back everything on a day no classifier was
// configured. What must stay unrepresentable is publishing something a check
// *refused*, or something no check has seen.
//
// These three read the old shape and kept passing after the application had
// changed around them. `publishApproved` still carried `item.status !==
// "safe"`, so the upload path stopped refusing a review verdict, asked this to
// publish it, and got null — the seller was still stuck and nothing said so.
check(
  "a public path requires a cleared or in-review status",
  /constraint public_path_requires_review_or_safe check \([\s\S]{0,90}status in \('safe', 'review'\)/.test(
    later,
  ),
  "makes published-after-being-refused unrepresentable, not merely avoided",
);
check(
  "and blocked is not one of them",
  !/status in \('safe', 'review', 'blocked'\)/.test(later) &&
    !/status in \('safe', 'review', 'pending'\)/.test(later),
);
check(
  "publishing asks the one function that decides",
  /isPublishable\(item\.status as ModerationStatus\)\) return null;/.test(
    code(service),
  ),
  "a second copy of the rule is the one that goes stale",
);
check(
  "and that function admits safe and review, and nothing else",
  /return status === "safe" \|\| status === "review";/.test(code(types)),
);
check(
  "the quarantine bucket is private",
  /'moderation-quarantine',\s*\n\s*'moderation-quarantine',\s*\n\s*false,/.test(sql),
  "a URL to an unreviewed upload must not be a way to see it",
);
check(
  "quarantine reads are scoped to the owner's folder",
  /bucket_id = 'moderation-quarantine'\s*\n\s*and \(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/.test(
    sql,
  ),
);

/* -------------------------------------------------------------------------- */
/* Members cannot moderate themselves                                         */
/* -------------------------------------------------------------------------- */

// There must be no insert or update policy on moderation_items for members.
const itemPolicies = (sql.match(/create policy "[^"]+"\n  on public\.moderation_items for (\w+)/g) ?? [])
  .map((line) => line.split("for ")[1]);
check(
  "members have no insert policy on moderation items",
  !itemPolicies.includes("insert"),
  "otherwise somebody inserts their own row marked safe",
);
check(
  "only moderators may update them",
  /create policy "moderators update moderation items"/.test(sql) &&
    !/create policy "members update/.test(sql),
);
check(
  "the audit trail has no update or delete policy",
  !/on public\.moderation_audit for (update|delete)/.test(sql),
  "an audit trail that can be edited is not one",
);
check(
  "a review decision must name its reviewer",
  /constraint moderation_reviewed_has_reviewer/.test(sql),
);
check(
  "one report per person per item",
  /unique \(item_id, reporter_id\)/.test(sql),
  "otherwise one motivated person can manufacture a queue entry",
);

/* -------------------------------------------------------------------------- */
/* A report re-reviews rather than unpublishes                                */
/* -------------------------------------------------------------------------- */

check(
  "reporting sends cleared content back to review",
  /status = case when status = 'safe' then 'review'/.test(sql),
);
check(
  "and never straight to blocked",
  !/then 'blocked'/.test(sql),
  "one person's opinion must not be able to unpublish somebody's work",
);

/* -------------------------------------------------------------------------- */
/* Strikes are graduated, and never automatic                                 */
/* -------------------------------------------------------------------------- */

check(
  "a first minor violation is a warning",
  /if \(priorCount === 0\) return "warning";/.test(code(strikes)),
);
check(
  "severe categories skip the warning",
  /const severe =[\s\S]{0,160}sexual_minors[\s\S]{0,120}priorCount === 0 \? "restricted" : "suspended"/.test(
    code(strikes),
  ),
);
check(
  "a strike must name who issued it",
  /issuedBy: string;/.test(strikes) && !/issuedBy\?: /.test(strikes),
  "a strike nobody signed is one nobody can be asked to justify",
);
check(
  "restrictions expire",
  /expires_at: expires/.test(code(strikes)) && /RESTRICTION_DAYS/.test(strikes),
);

/* -------------------------------------------------------------------------- */
/* Video is never published unchecked                                         */
/* -------------------------------------------------------------------------- */

check(
  "there is no stub frame extractor",
  /let extractFrames: FrameExtractor \| null = null;/.test(code(video)),
  "a stub returning no frames would look like a check that found nothing wrong",
);
check(
  "no frames means review",
  /frames\.length === 0[\s\S]{0,140}"review"/.test(code(video)),
);
check(
  "one bad frame fails the video",
  /if \(outcome\.status === "blocked"\) return outcome;/.test(code(video)),
);

/* -------------------------------------------------------------------------- */
/* Secrets and content stay where they belong                                 */
/* -------------------------------------------------------------------------- */

for (const [name, source] of [
  ["provider", provider],
  ["service", service],
  ["video", video],
  ["strikes", strikes],
] as const) {
  check(`${name} is server-only`, /^import "server-only";/m.test(source));
}
check(
  "the shared types are NOT server-only",
  !/^import "server-only";/m.test(types),
  "components render these labels",
);
check(
  "no moderation key is NEXT_PUBLIC",
  !/NEXT_PUBLIC[A-Z_]*MODERATION|NEXT_PUBLIC[A-Z_]*OPENAI/.test(provider),
);
check(
  "the audit detail stores scores, not content",
  /detail: \{[\s\S]{0,220}confidence[\s\S]{0,120}\}/.test(code(service)) &&
    !/detail: \{[\s\S]{0,220}text[\s\S]{0,40}:/.test(code(service)),
  "a table of what it rejected would be a table of exactly that material",
);
// The function body only. Slicing to end-of-file catches the type declarations
// below it, where a `category` field is entirely legitimate — the property is
// about what the *member reads*, not what the module contains.
const messageBody = (() => {
  const stripped = code(types);
  const start = stripped.indexOf("export function uploadMessage");
  const end = stripped.indexOf("\n}", start);
  return stripped.slice(start, end);
})();

check(
  "the member-facing message reveals no score or rule",
  messageBody.length > 100 &&
    !/confidence|score|threshold|category/i.test(messageBody),
  "a score shown to the person who tripped it is a dial they can tune against",
);

/* -------------------------------------------------------------------------- */
/* The generative model is not the safety judge                               */
/* -------------------------------------------------------------------------- */

check(
  "moderation does not call an image-generation model",
  !/images\/generations|images\/edits|grok-imagine|grok-2-image/.test(provider),
  "a model optimised to produce plausible output is not calibrated to judge",
);
check(
  "it calls a purpose-built moderation endpoint",
  /v1\/moderations/.test(provider),
);
check(
  "the provider is configurable, not hard-coded",
  /MODERATION_PROVIDER/.test(provider) && /PROVIDERS: ModerationProvider\[\]/.test(provider),
);

/* -------------------------------------------------------------------------- */
/* Nothing existing was weakened                                              */
/* -------------------------------------------------------------------------- */

check(
  "the migration drops no existing table or policy of another feature",
  !/drop table|drop schema/i.test(sql) &&
    !/drop policy if exists "[^"]*" on (public\.(profiles|projects|products|companies))/i.test(sql),
);
check(
  "it disables no row-level security",
  !/disable row level security/i.test(sql),
);
check(
  "it adds columns without rewriting profiles",
  /alter table public\.profiles\s*\n\s*add column if not exists/.test(sql),
);

/* -------------------------------------------------------------------------- */
/* Nothing public reaches a public bucket unchecked                            */
/*                                                                             */
/* The failure this catches is silent and total: an upload that writes straight */
/* to a public bucket is published the instant it lands, whatever the row       */
/* around it says. The file has a URL, and a URL is the whole of what published */
/* means to anybody who has it. Four of these were open — property listings,    */
/* project images, company logos and the ones below — while the moderation      */
/* system they bypassed sat complete beside them.                               */
/* -------------------------------------------------------------------------- */

import { readdirSync as readDir, statSync as statOf } from "node:fs";
import { join as joinPath } from "node:path";

/** Buckets that anybody can read without a signed URL. */
const PUBLIC_BUCKETS = [
  "property-images",
  "project-images",
  "product-images",
  "company-logos",
  "company-covers",
  "avatars",
  "covers",
  "panoramas",
  "floor-plans",
];

function walkAll(dir: string): string[] {
  return readDir(dir).flatMap((entry) => {
    const full = joinPath(dir, entry);
    return statOf(full).isDirectory() ? walkAll(full) : [full];
  });
}

const sources = walkAll("src").filter(
  (path) => path.endsWith(".ts") || path.endsWith(".tsx"),
);

for (const path of sources) {
  const source = readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/^\s*\/\/.*$/gm, "");

  // An upload call naming a public bucket directly. The moderation service is
  // allowed to do this — publishApproved is the one thing that may, and it
  // only runs after a safe verdict.
  const uploads = [...source.matchAll(/\.from\("([a-z-]+)"\)\s*\n?\s*\.upload\(/g)];
  if (uploads.length === 0) continue;
  if (path.endsWith("lib/moderation/service.ts")) continue;

  for (const match of uploads) {
    const bucket = match[1];
    if (!PUBLIC_BUCKETS.includes(bucket)) continue;
    check(
      `${path} does not upload straight into the public bucket ${bucket}`,
      false,
      bucket,
    );
  }
}

// And the components that were opened up must actually call the service.
for (const path of [
  "src/components/property/property-form.tsx",
  "src/components/projects/project-images-input.tsx",
  "src/components/companies/single-image-input.tsx",
  "src/components/products/product-images-input.tsx",
]) {
  const source = readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/^\s*\/\/.*$/gm, "");
  check(
    `${path} quarantines before it publishes`,
    /\.from\("moderation-quarantine"\)\s*\n?\s*\.upload\(/.test(source),
  );
  check(
    `${path} asks for a verdict`,
    /moderateQuarantinedImage\(/.test(source),
  );
  check(
    `${path} publishes only the url the verdict returned`,
    /verdict\.publicUrl/.test(source),
  );
}

// Reporting has to be reachable. The dialog existed, fully built, mounted
// nowhere — which is the same as not existing to the person trying to use it.
for (const path of [
  "src/app/property/[id]/page.tsx",
  "src/app/marketplace/[id]/page.tsx",
]) {
  const source = readFileSync(path, "utf8");
  // The trailing character class matters: /<ReportDialog/ alone also matches
  // <ReportDialogAnything, so renaming the component away would have passed.
  check(`${path} offers a way to report`, /<ReportDialog[\s/>]/.test(source));
}

/* -------------------------------------------------------------------------- */

if (failures.length > 0) {
  console.error(`\n${failures.length} failed:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passed} passed, ${failures.length} failed\n`);
  process.exit(1);
}

console.log(`\n✓ ${passed} moderation checks passed\n`);
