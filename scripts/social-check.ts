/**
 * The AI content engine, checked without a database or a model.
 *
 *   npx tsx scripts/social-check.ts
 *
 * The migration's own guarantees — token isolation, the publishing claim, the
 * idempotency key — are properties of PostgreSQL and are verified by applying
 * 0049 to a real server. What is checked here is everything above the
 * database: that the platform specs are honest about what each API needs, that
 * the generator cannot be talked into inventing a price, that the image rule
 * puts a real photograph ahead of a generated one, and that a token has no
 * path to the browser.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import {
  CONTENT_CATEGORIES,
  PLATFORM_SPECS,
  SOCIAL_PLATFORMS,
  canPublish,
  categoryLabel,
  connectionLabel,
  isSocialPlatform,
  type ConnectionState,
} from "../src/lib/social/platforms.ts";
import {
  AI_OPERATIONS,
  AI_OPERATION_IDS,
  isAiOperation,
} from "../src/lib/billing/operations.ts";
import {
  canApprove,
  canEdit,
  canPublishNow,
  canSchedule,
  memberMayMove,
  nextStep,
  STATUS_LABEL,
} from "../src/lib/social/lifecycle.ts";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * The file with its comments removed.
 *
 * Every "this must NOT appear" check needs this, and four of mine did not have
 * it. Well-commented code explains the property being asserted — `publishers.ts`
 * says "there is no code below that posts to a mock endpoint", `content.ts`
 * says why it does not write `.eq("owner_id", …)`, `post-review.tsx` says the
 * text is "not truncated" — and a grep for the forbidden word finds the
 * sentence promising not to use it.
 *
 * That failure is worse than noise: it is a check that reports a violation
 * precisely because the author documented the rule, so the way to make it pass
 * is to delete the explanation.
 *
 * Regex, not a parser. A `//` inside a string literal would be stripped
 * wrongly, but every use here is an absence check over source that has no such
 * string, and a real parser for a build-time assertion is not worth the
 * dependency.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/\s\/\/.*$/gm, " ");
}

const migration = readFileSync(
  "supabase/migrations/0049_ai_content_engine.sql",
  "utf8",
);

/* -------------------------------------------------------------------------- */
/* Reuse, not rebuild                                                         */
/* -------------------------------------------------------------------------- */

// The brief's hardest constraint. Every one of these would be a second copy of
// something Medosha already has.
check(
  "no second posts table",
  !/create table[^;]*\bsocial_posts\b/i.test(migration),
  "the community feed is `posts`; publishing to Medosha writes there",
);
check(
  "no second notification system",
  !/create table[^;]*notifications/i.test(migration),
);
check(
  "no second subscription or plan table",
  !/create table[^;]*(subscriptions|plans|user_plans)\b/i.test(migration),
);
check(
  "no second credit price table",
  !/create table[^;]*credit_costs/i.test(migration),
  "prices belong in ai_operation_costs, which already exists",
);
check(
  "gating is a row in the existing ai_operation_costs",
  /insert into public\.ai_operation_costs[\s\S]*'social\.post'/.test(migration),
);
check(
  "and it names a minimum plan",
  /'social\.post'[^)]*'pro'/.test(migration),
  "this is the ai_social_posts permission — a row, not a new column",
);
check(
  "RLS is enabled on every new table, never disabled",
  /enable row level security/.test(migration) &&
    !/disable row level security/.test(migration),
);
check(
  "the migration modifies no earlier migration's tables destructively",
  !/drop table|truncate|delete from public\.(posts|profiles|properties)/i.test(
    migration,
  ),
);

/* -------------------------------------------------------------------------- */
/* Tokens                                                                     */
/* -------------------------------------------------------------------------- */

// The single most damaging thing this feature could get wrong.
const accountsPolicies = migration.slice(
  migration.indexOf("---- social_accounts ---"),
  migration.indexOf("---- ai_content_posts ---"),
);

check(
  "social_accounts has no select policy for authenticated",
  !/create policy[^;]*on public\.social_accounts for select/i.test(accountsPolicies),
  "a select policy would return the access token in a JSON response",
);
check(
  "and no blanket `for all` policy either",
  !/create policy[^;]*on public\.social_accounts for all/i.test(accountsPolicies),
  "`for all` includes select",
);
check(
  "the browser-facing view exists",
  /create or replace view public\.social_accounts_public/.test(migration),
);
check(
  "and it selects no token column",
  (() => {
    const start = migration.indexOf("create or replace view public.social_accounts_public");
    const body = migration.slice(start, migration.indexOf("comment on view", start));
    return !/\baccess_token\b(?!\s+is not null)/.test(body) && !/\brefresh_token\b/.test(body);
  })(),
  "has_token is a boolean derived from it, which is not the same as returning it",
);
check(
  "the view is filtered to the caller",
  /from public\.social_accounts\s+where owner_id = auth\.uid\(\)/.test(migration),
  "a definer view's where clause is its entire access control",
);
// A column, not the word. The migration's comments say out loud that
// passwords are never collected, and the first version of this check flagged
// that sentence — proving only that grepping for a word finds the word.
check(
  "no column stores a social password",
  !/^\s+\w*password\w*\s+(text|varchar|character)/im.test(migration),
);

/* -------------------------------------------------------------------------- */
/* Charging once                                                              */
/* -------------------------------------------------------------------------- */

check(
  "the master post carries the credit cost",
  /credits_spent/.test(migration) &&
    /create table if not exists public\.ai_content_posts[\s\S]*?credits_spent/.test(
      migration,
    ),
);
check(
  "the platform versions carry none",
  (() => {
    const start = migration.indexOf("create table if not exists public.ai_content_versions");
    const end = migration.indexOf("comment on table public.ai_content_versions");
    return !/credits/.test(migration.slice(start, end));
  })(),
  "a credits column here is how four platforms become four charges",
);

const route = readFileSync("src/app/api/social/generate/route.ts", "utf8");

check(
  "the route holds credits exactly once for the post",
  (route.match(/holdCredits\(AI_OPERATIONS\.socialPost/g) ?? []).length === 1,
);

// Call sites, not identifiers. The first version compared `indexOf` of the
// bare names and passed for the wrong reason: `generateContent` appears in the
// import block at the top of the file, so it was always "before" everything,
// and the check would have kept passing with the credits held afterwards.
const holdAt = route.indexOf("holdCredits(AI_OPERATIONS.socialPost");
const generateAt = route.indexOf("generateContent({");
const allowanceAt = route.indexOf("postingAllowance(");

check("the hold and the generation are both called", holdAt > -1 && generateAt > -1);
check(
  "credits are held before the model is called",
  holdAt < generateAt,
  "credits held after the call are credits somebody gets by disconnecting",
);
check(
  "the plan is checked before the model is called",
  holdAt < generateAt,
  "holdCredits is what checks min_plan",
);
check(
  "the posting limit is checked before credits are held",
  allowanceAt > -1 && allowanceAt < holdAt,
  "otherwise a member over their limit is charged in order to be refused",
);
check(
  "every failure path refunds",
  (route.match(/hold\.refund\(/g) ?? []).length >= 3,
);
check(
  "the image is a separate operation",
  /AI_OPERATIONS\.socialImage/.test(
    readFileSync("src/lib/social/images.ts", "utf8"),
  ),
);

check("social.post is a known operation", isAiOperation(AI_OPERATIONS.socialPost));
check("social.image is", isAiOperation(AI_OPERATIONS.socialImage));
check("social.schedule is", isAiOperation(AI_OPERATIONS.socialSchedule));
check(
  "every operation the migration prices is one the code knows",
  ["social.post", "social.image", "social.schedule"].every((operation) =>
    (AI_OPERATION_IDS as readonly string[]).includes(operation),
  ),
);

/* -------------------------------------------------------------------------- */
/* Grounding                                                                  */
/* -------------------------------------------------------------------------- */

const generate = readFileSync("src/lib/social/generate.ts", "utf8");

check(
  "the generator forbids inventing a price",
  /[Nn]ever invent a price/.test(generate),
);
check(
  "and names the specific fields",
  ["bedroom", "address", "amenity", "phone"].every((word) =>
    new RegExp(word, "i").test(generate),
  ),
);
check(
  "and says to omit rather than estimate a missing field",
  /leave it out\. Do not estimate it/.test(generate),
);
check(
  "a property post is grounded in the real row",
  /propertyPageContext/.test(generate),
  "the same reader the assistant uses, so RLS and location redaction apply",
);
check(
  "a project's budget is never given to the generator",
  /budget is deliberately not passed/i.test(generate),
  "a client's budget is not marketing copy",
);
check(
  "the generator is server-only",
  /^import "server-only";/m.test(generate),
);
check(
  "one model call produces every platform version",
  /Include exactly these platforms in "versions"/.test(generate),
);
check(
  "and the language of the brief is matched, not chosen",
  /Amharic/.test(generate),
);

/* -------------------------------------------------------------------------- */
/* The image rule                                                             */
/* -------------------------------------------------------------------------- */

const images = readFileSync("src/lib/social/images.ts", "utf8");

check(
  "a listing's own photograph is returned before anything else",
  images.indexOf("listing_photo") < images.indexOf("user_upload") &&
    images.indexOf("user_upload") < images.indexOf('origin: "ai_generated"'),
  "the order is the rule",
);
check(
  "a listing with photos never gets a generated image",
  /if \(listingImages\.length > 0 && listingImages\[0\]\)[\s\S]{0,300}?return \{[\s\S]{0,200}?listing_photo/.test(
    images,
  ),
  "the early return is what makes wantsGenerated unable to override a real photo",
);
check(
  "a generated image is labelled",
  /label: "AI-generated image"/.test(images),
);
check(
  "the database makes the label impossible to omit",
  /ai_content_image_origin_sane/.test(migration),
);
check(
  "an image failure does not throw away the post",
  /Failing the whole generation over an image/.test(images),
);

/* -------------------------------------------------------------------------- */
/* Platform honesty                                                           */
/* -------------------------------------------------------------------------- */

for (const platform of SOCIAL_PLATFORMS) {
  const spec = PLATFORM_SPECS[platform];

  check(`${platform}: target is under the hard limit`, spec.targetLength < spec.maxLength);
  check(`${platform}: has a voice`, spec.voice.length > 40);

  if (platform === "medosha") {
    check("medosha needs no credentials", spec.credentialVars.length === 0);
  } else {
    check(
      `${platform}: names the variables the server needs`,
      spec.credentialVars.length > 0,
    );
    check(
      `${platform}: states its requirements before connecting`,
      spec.requirements.length >= 2,
    );
    check(`${platform}: links the official docs`, spec.docs !== null);
  }
}

// The two facts most likely to be got wrong, and most expensive to discover
// after a user has connected.
check(
  "Instagram is marked as requiring an image",
  PLATFORM_SPECS.instagram.requiresImage,
  "the Content Publishing API has no text-only post",
);
check(
  "Instagram's requirements mention the Professional account",
  PLATFORM_SPECS.instagram.requirements.some((line) => /Professional/i.test(line)),
);
check(
  "and the Facebook Page link",
  PLATFORM_SPECS.instagram.requirements.some((line) => /Facebook Page/i.test(line)),
);
check(
  "and that Instagram fetches the image over HTTPS",
  PLATFORM_SPECS.instagram.requirements.some((line) => /HTTPS/i.test(line)),
  "a data URL cannot be published",
);
check(
  "TikTok's requirements mention the audit",
  PLATFORM_SPECS.tiktok.requirements.some((line) => /audit/i.test(line)),
  "before audit approval every post is private, whatever the UI says",
);
check(
  "Facebook's requirements say a Page, not a profile",
  PLATFORM_SPECS.facebook.requirements.some((line) => /personal profile is not/i.test(line)),
);

check(
  "Instagram's caption limit is the real one",
  PLATFORM_SPECS.instagram.maxLength === 2_200,
);
check(
  "Instagram gets more hashtags than Facebook",
  PLATFORM_SPECS.instagram.hashtagCount > PLATFORM_SPECS.facebook.hashtagCount,
  "otherwise the versions are the same post in four boxes",
);
check(
  "TikTok is the shortest",
  SOCIAL_PLATFORMS.every(
    (platform) =>
      platform === "tiktok" ||
      PLATFORM_SPECS.tiktok.targetLength <= PLATFORM_SPECS[platform].targetLength,
  ),
);
check(
  "Medosha is the longest",
  SOCIAL_PLATFORMS.every(
    (platform) =>
      platform === "medosha" ||
      PLATFORM_SPECS.medosha.targetLength >= PLATFORM_SPECS[platform].targetLength,
  ),
);

/* -------------------------------------------------------------------------- */
/* Availability                                                               */
/* -------------------------------------------------------------------------- */

const settings = readFileSync("src/lib/social/settings.ts", "utf8");

check(
  "a platform is offered only when the admin enabled it AND credentials exist",
  /admitted\.includes\(platform\) && hasCredentials\(platform\)/.test(settings),
  "an enabled platform with no app credentials is a Connect button leading to an error page",
);
check(
  "the default with no settings row is Medosha only",
  /\["medosha"\]/.test(settings),
);
// Scoped to the error branch of countPublished. The first version looked for
// MAX_SAFE_INTEGER anywhere in the file and passed on the admin branch's use
// of it — so the failing-open mutation survived.
const countBody = settings.slice(
  settings.indexOf("async function countPublished"),
);
check(
  "an unreadable allowance fails closed",
  /if \(error\) \{[\s\S]{0,240}?return Number\.MAX_SAFE_INTEGER;/.test(countBody),
  "a database error must not become an unlimited allowance",
);
check(
  "limits are read from platform_settings, not written in the file",
  !/weekLimit = \d+/.test(settings) && /readSettings/.test(settings),
);
check(
  "auto-publish is off unless the admin turned it on",
  /auto_publish_available[\s\S]*?===\s*true/.test(settings),
);
check(
  "and the schedule default is off",
  /auto_publish boolean not null default false/.test(migration),
);
check(
  "enabled_platforms ships as Medosha only",
  /'enabled_platforms',\s*\n\s*'\["medosha"\]'/.test(migration),
  "Facebook, Instagram and TikTok stay out until their app review is done",
);
check(
  "auto_publish_available ships false",
  /'auto_publish_available',\s*\n\s*'false'/.test(migration),
);
check(
  "the free plan gets no weekly posts",
  /"free": 0/.test(migration),
);

/* -------------------------------------------------------------------------- */
/* The status ladder                                                          */
/* -------------------------------------------------------------------------- */

// The scheduler's safety rests on this ordering: nothing below 'approved' is
// publishable, expressed as one comparison rather than a list to maintain.
const ladder = [
  "draft",
  "generating",
  "generated",
  "awaiting_approval",
  "approved",
  "scheduled",
  "publishing",
  "published",
];

const enumBlock = migration.slice(
  migration.indexOf("create type public.ai_content_status"),
  migration.indexOf("exception when duplicate_object then null; end $$;",
    migration.indexOf("create type public.ai_content_status")),
);

let previous = -1;
let ordered = true;
for (const status of ladder) {
  const at = enumBlock.indexOf(`'${status}'`);
  if (at === -1 || at < previous) ordered = false;
  previous = at;
}
check(
  "the status enum is declared weakest first",
  ordered,
  "`status >= 'approved'` is only meaningful if the order is the order of trust",
);
check(
  "the claim function refuses anything not scheduled",
  /and status = 'scheduled'/.test(migration),
);
check(
  "and anything not yet due",
  /and scheduled_for <= now\(\)/.test(migration),
);
check(
  "the claim is not callable by members",
  /revoke all on function public\.claim_scheduled_post/.test(migration),
  "a member who could claim their own post could skip the approval check",
);
check(
  "the publish log's idempotency key is unique",
  /unique \(idempotency_key\)/.test(migration),
);
check(
  "failed publishes do not consume the allowance",
  /and ok\b/.test(migration) &&
    /Failed attempts do not count against the limit/.test(migration),
);

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

const groups = new Set<string>(CONTENT_CATEGORIES.map((entry) => entry.group));
for (const group of ["Properties", "Construction", "Architecture", "Services", "Marketplace", "Company"]) {
  check(`categories cover ${group}`, groups.has(group));
}
check(
  "AI posting is not limited to construction",
  CONTENT_CATEGORIES.filter((entry) => entry.group === "Construction").length <
    CONTENT_CATEGORIES.length / 2,
);
check("an unknown category still has a label", categoryLabel("nonsense") === "Post");
check("a known one uses its own", categoryLabel("open_house") === "Open house");

/* -------------------------------------------------------------------------- */
/* Small surface                                                              */
/* -------------------------------------------------------------------------- */

check("isSocialPlatform accepts a platform", isSocialPlatform("instagram"));
check("and rejects anything else", !isSocialPlatform("twitter"));
check("and rejects a non-string", !isSocialPlatform(7));

const states: ConnectionState[] = [
  "not_configured",
  "disconnected",
  "connected",
  "permission_required",
  "expired",
  "revoked",
  "failed",
];
for (const state of states) {
  check(`${state} has a label`, connectionLabel(state).length > 0);
  check(
    `${state} publishes only when connected`,
    canPublish(state) === (state === "connected"),
  );
}

/* -------------------------------------------------------------------------- */
/* Nothing leaks                                                              */
/* -------------------------------------------------------------------------- */

for (const file of ["src/lib/social/platforms.ts"]) {
  const source = readFileSync(file, "utf8");
  check(
    `${file} reads no secret from the environment`,
    !/process\.env\.(FACEBOOK|INSTAGRAM|TIKTOK|XAI)_[A-Z_]*(SECRET|KEY|TOKEN)/.test(
      source,
    ),
    "this file is client-safe",
  );
}

check(
  "the route logs the technical detail rather than returning it",
  /console\.error/.test(route) && !/error: postError\.message/.test(route),
);

/* -------------------------------------------------------------------------- */
/* Phase 3 — the approval gate                                                */
/* -------------------------------------------------------------------------- */

const ALL_STATUSES = [
  "draft",
  "generating",
  "generated",
  "awaiting_approval",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "cancelled",
] as const;

for (const status of ALL_STATUSES) {
  check(`${status} has a label`, STATUS_LABEL[status].length > 0);
  check(`${status} has a next step`, nextStep(status).length > 10);
}

// The rule the whole feature rests on: nothing publishes without approval.
for (const status of ALL_STATUSES) {
  if (status === "approved" || status === "scheduled" || status === "failed") {
    continue;
  }
  check(
    `${status} cannot be published`,
    !canPublishNow(status),
    "only an approved post may go to a platform",
  );
}

check(
  "a draft cannot be scheduled",
  !canSchedule("draft"),
  "scheduling an unapproved post is the approval step defeated by another door",
);
check("an unapproved post cannot be scheduled", !canSchedule("awaiting_approval"));
check("an approved one can", canSchedule("approved"));

check("a published post cannot be edited", !canEdit("published"));
check("nor one mid-publish", !canEdit("publishing"));
check("a failed one can be", canEdit("failed"), "fixing the caption is often the fix");

check("a published post cannot be re-approved", !canApprove("published"));
check("a generated one can", canApprove("generated"));

// A member must never be able to declare something published.
for (const from of ALL_STATUSES) {
  check(
    `a member cannot move ${from} to published`,
    !memberMayMove(from, "published"),
    "that would mark a post as sent when it never left Medosha",
  );
  check(
    `a member cannot move ${from} to publishing`,
    !memberMayMove(from, "publishing"),
  );
}

/* -------------------------------------------------------------------------- */
/* Phase 3 — the publisher                                                    */
/* -------------------------------------------------------------------------- */

const publishers = readFileSync("src/lib/social/publishers.ts", "utf8");
const platformApi = readFileSync("src/lib/social/platform-api.ts", "utf8");
const oauth = readFileSync("src/lib/social/oauth.ts", "utf8");
const connectRoute = readFileSync(
  "src/app/api/social/connect/[platform]/route.ts",
  "utf8",
);
const callbackRoute = readFileSync(
  "src/app/api/social/callback/[platform]/route.ts",
  "utf8",
);
const publishRoute = readFileSync("src/app/api/social/publish/route.ts", "utf8");
const runPublishSourceEarly = readFileSync("src/lib/social/run-publish.ts", "utf8");

check(
  "Medosha publishes into the existing feed table",
  /\.from\("posts"\)/.test(publishers),
  "not a second posts table",
);
check(
  "no adapter fabricates a success",
  !/mock|fixture|pretend|simulat|fake/i.test(
    codeOnly(publishers) + codeOnly(platformApi),
  ),
  "a publish log full of successes that never happened is worse than an empty one",
);
check(
  "an unconfigured platform refuses and names the variables",
  /not set up on this site/.test(publishers) &&
    /credentialVars\.join/.test(publishers),
);
check(
  "and that refusal is not retryable",
  /code: "not_configured",\s*\n\s*retryable: false/.test(publishers),
  "waiting does not make an unconfigured app configured",
);
check(
  "a platform needing an image refuses without one",
  /image_required/.test(platformApi),
  "moved to platform-api.ts when the real calls were written",
);
check(
  "one adapter throwing does not stop the others",
  /adapter threw/.test(publishers),
);

check(
  "the publish route reads the status from the database",
  /post\.status !== "approved"/.test(publishRoute),
  "not from the request, and not from whether a button was enabled",
);
check(
  "and refuses an unapproved post",
  /has not been approved yet/.test(publishRoute),
);
// These live in `run-publish.ts` since the loop was extracted so the cron and
// the manual route share it. Checked there, below, under Phase 7.
check(
  "the publish route delegates to the shared loop",
  /runPublish\(\{/.test(publishRoute),
  "rather than carrying its own copy of the claim-then-call sequence",
);
check(
  "the log is written with the service role",
  /createServiceClient\(\)/.test(publishRoute),
  "social_publish_log grants members no insert policy — a log its subject can write is not a log",
);
check(
  "and the member's own client is still what reads the post",
  /const supabase = await createClient\(\)/.test(publishRoute),
  "ownership is decided by RLS, not by the service role",
);
check(
  "a failed attempt stays in the history",
  /never deleted/.test(runPublishSourceEarly),
);
check(
  "the posting limit is re-checked at publish time",
  /postingAllowance/.test(publishRoute),
  "a member can generate on Monday and publish on Friday",
);

/* -------------------------------------------------------------------------- */
/* Phase 3 — the actions                                                      */
/* -------------------------------------------------------------------------- */

const actions = readFileSync("src/lib/actions/content.ts", "utf8");

check(
  "approving records who and when",
  /approved_at:[\s\S]{0,80}approved_by: user\.id/.test(actions),
);
check(
  "editing after approval un-approves",
  /status: "awaiting_approval",[\s\S]{0,120}approved_at: null/.test(actions),
  "an approval of different words is not an approval of these",
);
check(
  "an edit marks the version edited",
  /edited: true/.test(actions),
  "so Regenerate can warn before throwing the work away",
);
check(
  "a schedule in the past is refused",
  /Choose a time in the future/.test(actions),
);
check(
  "auto-publish cannot be enabled when the site forbids it",
  /input\.autoPublish && siteAllows/.test(actions),
  "a stored true that does nothing is a checkbox that lies",
);
check(
  "posts per week cannot exceed the days chosen",
  /Math\.min\(\s*Math\.max\(1, Math\.round\(input\.postsPerWeek\)\),\s*days\.length,\s*\)/.test(
    actions,
  ),
  "5 posts a week on Monday and Friday is unsatisfiable",
);
check(
  "the actions do not re-implement ownership",
  !/\.eq\("owner_id"/.test(codeOnly(actions)),
  "RLS already applies it; a second copy is a second thing to get wrong",
);

/* -------------------------------------------------------------------------- */
/* Phase 3 — the UI                                                           */
/* -------------------------------------------------------------------------- */

const review = readFileSync("src/components/social/post-review.tsx", "utf8");

check(
  "every version is shown in full",
  !/line-clamp|truncate/.test(
    codeOnly(review.slice(review.indexOf("function VersionCard"))),
  ),
  "a preview that hides half the text gets approved without being read",
);
check(
  "a generated image is labelled in the preview",
  /AI-generated image/.test(review),
);
check(
  "and the label says not to present it as a photograph",
  /do\s*\n?\s*not present it as one/.test(review),
);
check(
  "Publish Now asks first",
  /Publish to the included platforms\?/.test(review),
  "everything else on that screen is reversible; this one is not",
);
check(
  "the caption length limit is shown while editing",
  /will reject this/.test(review),
);

const promote = readFileSync("src/components/social/promote-button.tsx", "utf8");
check(
  "the composer says the facts come from the record",
  /will not invent anything/.test(promote),
);
check(
  "and that one generation is one charge",
  /One generation, one charge/.test(promote),
);
check(
  "and that nothing publishes without review",
  /review everything before anything is published/.test(promote),
);
check(
  "the promote button is one component for every source type",
  /sourceType: "property" \| "product" \| "project"/.test(promote),
  "four near-identical composers is how one gets a fix the others never do",
);

/* -------------------------------------------------------------------------- */
/* Phase 7 — the scheduler                                                    */
/* -------------------------------------------------------------------------- */

const cron = readFileSync("src/app/api/cron/social/route.ts", "utf8");
const runPublishSource = readFileSync("src/lib/social/run-publish.ts", "utf8");

check(
  "the scheduler and the manual route share one publish loop",
  /runPublish\(/.test(cron) && /runPublish\(/.test(publishRoute),
  "two copies of the claim-then-call loop is two chances to double post",
);
check(
  "and neither has its own copy of it",
  (codeOnly(cron).match(/social_publish_log"\)\s*\n?\s*\.insert/g) ?? []).length === 0 &&
    (codeOnly(publishRoute).match(/social_publish_log"\)\s*\n?\s*\.insert/g) ?? [])
      .length === 0,
);

check(
  "the cron endpoint requires a secret",
  /CRON_SECRET/.test(cron),
);
check(
  "a missing secret closes the endpoint rather than opening it",
  /if \(!expected \|\| expected\.trim\(\)\.length === 0\) return false;/.test(cron),
  "an unprotected publishing endpoint would let anybody push every approved post live",
);
check(
  "the secret is compared in constant time",
  /timingSafeEqual/.test(cron),
);
check(
  "and the comparison cannot leak the secret's length",
  /createHash\("sha256"\)/.test(cron),
  "timingSafeEqual throws on a length mismatch, and the throw is itself a timing signal",
);
check(
  "an unauthorised call is not told why",
  /"Not found\."/.test(cron),
);

check(
  "the scheduler stops when the site forbids automatic publishing",
  cron.indexOf("autoPublishAvailable") < cron.indexOf("ai_content_posts"),
  "checked before the queue is read, not per post",
);
check(
  "it only considers scheduled posts",
  /\.eq\("status", "scheduled"\)/.test(cron),
  "a generated post nobody has approved must be invisible to it",
);
check(
  "and only ones that are due",
  /\.lte\("scheduled_for"/.test(cron),
);
check(
  "each post is claimed atomically before publishing",
  cron.indexOf("claim_scheduled_post") < cron.indexOf("await runPublish"),
);
check(
  "a lost claim publishes nothing",
  /if \(claimed !== true\)/.test(cron),
);
// The call, not the declaration. `checkMember` is defined lower in the same
// file, so matching the bare identifier passed even with the call replaced by
// a literal `{ ok: true }`.
check(
  "the plan and allowance are re-checked at publish time",
  /await checkMember\(supabase, post\.owner_id\)/.test(cron),
  "a post approved three weeks ago may belong to a lapsed plan",
);
check(
  "and the result is acted on",
  /if \(!gate\.ok\) \{/.test(cron),
);
check(
  "an unreadable allowance refuses rather than publishes",
  /week === null \|\| month === null/.test(cron),
  "publishing on an unknown allowance turns an outage into an unlimited plan",
);
check(
  "a missing plan limit reads as not permitted",
  /return 0;/.test(cron) && /must not read as\n\s*\/\/ unlimited/.test(cron),
);
check(
  "the schedule's own auto_publish is honoured",
  /schedule\?\.auto_publish/.test(cron),
  "site-wide availability is not the member asking for it",
);
check(
  "a batch cap stops one run going forever",
  /const BATCH = \d+/.test(cron),
);
check(
  "the scheduled time is the idempotency slot, not the clock",
  /slot: post\.scheduled_for/.test(cron),
  "a cron that runs twice for one slot must collide, not post twice",
);
check(
  "a manual publish uses the minute instead",
  /slot: new Date\(\)\.toISOString\(\)\.slice\(0, 16\)/.test(publishRoute),
);

check(
  "the shared loop claims before calling the platform",
  runPublishSource.indexOf('.from("social_publish_log")') <
    runPublishSource.indexOf("await publish({"),
);
check(
  "a duplicate claim is reported, not treated as a failure",
  /duplicate: true/.test(runPublishSource),
);
check(
  "a run of nothing but duplicates leaves the status alone",
  /if \(outcomes\.every\(\(outcome\) => outcome\.duplicate\)\) return null;/.test(
    runPublishSource,
  ),
  "marking it failed would turn a working safeguard into a red badge",
);
check(
  "the log writer is a separate parameter from the member client",
  /logger: Client;/.test(runPublishSource),
  "one client for both is how the member's client ends up writing a log it cannot write",
);

/* -------------------------------------------------------------------------- */
/* Phase 8 — admin                                                            */
/* -------------------------------------------------------------------------- */

const adminActions = readFileSync("src/lib/actions/admin-content.ts", "utf8");
const adminPage = readFileSync("src/app/admin/content/page.tsx", "utf8");

check(
  "every admin action checks isAdmin",
  (adminActions.match(/if \(!\(await isAdmin\(\)\)\) return DENIED;/g) ?? [])
    .length >= 4,
);
check(
  "the admin page 404s rather than explaining itself",
  /notFound\(\)/.test(adminPage) && !/403|forbidden/i.test(codeOnly(adminPage)),
  "a 403 confirms the route exists",
);
check(
  "prices are validated against the operations the code knows",
  /AI_OPERATION_IDS/.test(adminActions),
  "an arbitrary operation would create a priced row nothing ever charges",
);
check(
  "and plans against the plans that exist",
  /PLAN_ORDER/.test(adminActions),
);
check(
  "a limit must be given for every plan",
  /for \(const plan of PLAN_ORDER\)/.test(adminActions),
  "a partial map reads as zero for the plans left out",
);
check(
  "Medosha cannot be switched off",
  /\["medosha", \.\.\.platforms/.test(adminActions),
  "a site with no platforms is a content engine with nowhere to publish",
);
check(
  "credential presence is computed on the server",
  /hasCredentials\(platform\)/.test(adminPage),
  "hasCredentials reads environment variables, which must not reach the browser",
);
check(
  "and only the boolean crosses to the client",
  !/process\.env/.test(
    readFileSync("src/components/social/admin-controls.tsx", "utf8"),
  ),
);
check(
  "the admin screen says a switch alone does not enable a platform",
  /does not make it work/.test(
    readFileSync("src/components/social/admin-controls.tsx", "utf8"),
  ),
);
check(
  "and that automatic publishing still only sends approved posts",
  /only posts a person has already approved/i.test(
    readFileSync("src/components/social/admin-controls.tsx", "utf8"),
  ),
);

/* -------------------------------------------------------------------------- */
/* OAuth (Phases 4-6)                                                         */
/* -------------------------------------------------------------------------- */

check(
  "no password is ever collected",
  !/password/i.test(codeOnly(oauth) + codeOnly(connectRoute) + codeOnly(callbackRoute)),
  "a Medosha screen asking for a Facebook password is a phishing page",
);
check(
  "the Graph API version is pinned",
  /const GRAPH_VERSION = "v\d+\.\d+"/.test(oauth),
  "an unversioned Graph URL follows Meta's default, which moves",
);
check(
  "and pinned the same way in the publishing calls",
  /const GRAPH_VERSION = "v\d+\.\d+"/.test(platformApi),
);

// The CSRF defence. Without it, an attacker sends a logged-in Medosha user to
// the callback carrying the attacker's code, and every future post publishes
// to the attacker's Page.
check("the state parameter is signed", /createHmac/.test(oauth));
// Inside verifyState, not merely imported. The first version matched the
// import line and survived the signature being compared with `===`.
check(
  "and verified in constant time",
  /a\.length !== b\.length \|\| !timingSafeEqual\(a, b\)/.test(oauth),
  "a === on a signature leaks it a byte at a time through timing",
);
check(
  "the callback verifies the signature",
  /verifyState\(state\)/.test(callbackRoute),
);
check(
  "and matches the nonce against the cookie",
  /nonce !== parsed\.nonce/.test(callbackRoute),
  "a signed state alone does not prove the flow started in this browser",
);
check(
  "and refuses a state belonging to another user",
  /parsed\.userId !== user\.id/.test(callbackRoute),
  "this is the attack: attaching an attacker's Page to a victim's account",
);
check(
  "the nonce is single use",
  /jar\.delete\(STATE_COOKIE\)/.test(callbackRoute),
  "a nonce that survives its callback can be replayed",
);
check(
  "the nonce cookie is HttpOnly",
  /httpOnly: true/.test(connectRoute),
);
check(
  "and same-site",
  /sameSite: "lax"/.test(connectRoute),
);
check(
  "and secure in production",
  /secure: process\.env\.NODE_ENV === "production"/.test(connectRoute),
);
check(
  "and short-lived",
  /maxAge: 10 \* 60/.test(connectRoute),
);

check(
  "connecting requires the platform to be both enabled and configured",
  /!available\.includes\(platform\) \|\| !credentialsFor\(platform\)/.test(
    connectRoute,
  ),
);
// Both branches. The first version matched once and survived the Facebook
// branch being loosened, because TikTok's still had the pattern.
check(
  "a half-configured platform is treated as unconfigured",
  (oauth.match(/return id && secret \? \{ id, secret \} : null;/g) ?? []).length ===
    2,
  "an id with no secret fails at the token step, after the user has granted access",
);

check(
  "tokens are written with the service role",
  /createServiceClient\(\)/.test(callbackRoute),
);
// What the redirect actually carries. The first version of this check sliced
// the file from the first `return settings` — which is near the top, because
// the helper is used throughout — and so scanned almost everything, including
// the line that legitimately writes the token to the database.
//
// The real question is narrower: does any redirect back to the browser carry
// token material in its query string?
check(
  "no redirect carries a token",
  (callbackRoute.match(/settings\(`?[^)]*\)/g) ?? []).every(
    (call) => !/token|secret|code=\$/i.test(call),
  ),
  "a token in a redirect URL lands in browser history and the server access log",
);
check(
  "and the only things it does carry are status flags",
  (callbackRoute.match(/settings\("([^"]+)"\)/g) ?? []).every((call) =>
    /^settings\("(error|cancelled|connected|warning)[=\d\w]*"\)$/.test(call),
  ),
  (callbackRoute.match(/settings\("([^"]+)"\)/g) ?? []).join(" "),
);
check(
  "reconnecting replaces the grant rather than adding a row",
  /onConflict: "owner_id,platform,company_id"/.test(callbackRoute),
);
check(
  "a declined consent screen is not treated as an error",
  /cancelled=1/.test(callbackRoute),
  "they changed their mind, which is allowed",
);

check(
  "Facebook asks only for the scopes it uses",
  /pages_manage_posts/.test(oauth) && !/business_management/.test(codeOnly(oauth)),
  "an unused scope is a slower review and a broader grant than the user agreed to",
);
check(
  "Instagram asks for content publishing",
  /instagram_content_publish/.test(oauth),
);
check(
  "a personal Instagram account is detected at connection time",
  /Professional/.test(oauth) && /no instagram_business_account/.test(oauth),
  "otherwise the user finds out when their first scheduled post fails",
);
// Scoped to the Facebook exchange. `page.access_token` also appears in the
// Instagram one, so the unscoped version survived Facebook storing the user
// token instead.
const facebookExchange = oauth.slice(
  oauth.indexOf("async function exchangeFacebook"),
  oauth.indexOf("async function exchangeInstagram"),
);
check(
  "the Page token is stored, not the user token",
  /accessToken: page\.access_token,/.test(facebookExchange),
  "a user token expires in 60 days; a Page token derived from it does not",
);
check(
  "the short-lived token is exchanged for a long-lived one",
  /fb_exchange_token/.test(oauth),
  "a one-hour token means every scheduled post after the first hour fails",
);
check(
  "TikTok's ungranted publish scope is caught",
  /video\.publish/.test(oauth) && /did not grant permission to post/.test(oauth),
);

/* -------------------------------------------------------------------------- */
/* The publishing calls                                                       */
/* -------------------------------------------------------------------------- */

check(
  "Instagram publishes in two steps",
  /\/media`/.test(platformApi) && /media_publish/.test(platformApi),
  "the API has no single-call publish",
);
// The call, not the function. The first version matched the body of
// `waitForContainer`, which stays defined when its call site is removed — so
// publishing without waiting survived.
check(
  "and waits for the container to finish",
  /await waitForContainer\(container\.id, input\.accessToken\)/.test(platformApi),
  "publishing an IN_PROGRESS container fails",
);
check(
  "and stops if it is not ready",
  /if \(!ready\.ok\) return ready;/.test(platformApi),
);
check(
  "the wait knows what FINISHED means",
  /status_code === "FINISHED"/.test(platformApi),
);
check(
  "the container poll backs off",
  /delay \* 1\.6/.test(platformApi),
  "polling flat out gets rate-limited before the image has downloaded",
);
check(
  "a data URL is refused before it reaches a platform",
  /isPubliclyFetchable/.test(platformApi) &&
    /startsWith\("https:\/\/"\)/.test(platformApi),
  "Instagram and TikTok fetch the image; they cannot receive one",
);
check(
  "and so is localhost",
  /localhost/.test(platformApi),
  "the first thing a developer tests with, and the platform's error for it is useless",
);
check(
  "an expired token is named rather than dumped",
  /code === 190/.test(platformApi) && /Reconnect the account/.test(platformApi),
);
check(
  "a rate limit is marked retryable",
  /rate_limited/.test(platformApi) && /retryable: true/.test(platformApi),
);
check(
  "a timeout is NOT retryable",
  /retryable: !timedOut/.test(platformApi),
  "the request may have succeeded on the platform's side; retrying double-posts",
);
check(
  "TikTok's unaudited private posting is disclosed",
  /Published privately/.test(platformApi),
  "a published badge on a post nobody can see is a lie the log would tell",
);
check(
  "and audit is opt-in, defaulting to unaudited",
  /TIKTOK_AUDITED === "true"/.test(publishers),
  "claiming audit that has not happened publishes privately while saying public",
);
check(
  "raw platform error bodies go to the log, not to the user",
  /console\.error/.test(platformApi),
);
check(
  "the token is read once, with the service role",
  /createServiceClient\(\)/.test(publishers),
);
check(
  "and refreshed before publishing rather than after a failure",
  publishers.indexOf("refreshToken(request.platform") <
    publishers.indexOf("request.platform === \"facebook\""),
);
check(
  "a failed refresh marks the connection expired",
  /status: "expired"/.test(publishers),
);

/* -------------------------------------------------------------------------- */

if (failures.length > 0) {
  console.error(`\n${failures.length} failed:\n`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  console.error(`\n${passed} passed, ${failures.length} failed\n`);
  process.exit(1);
}

console.log(`\n✓ ${passed} social content checks passed\n`);
