/**
 * The public profile shows real work, and no contact detail nobody offered.
 *
 *   npx tsx scripts/profile_check.ts
 *
 * ## What was wrong
 *
 * `/u/<username>` rendered `profiles.phone` to everybody who opened it. There
 * was no setting to stop it and no sign anywhere that it was happening, so a
 * number typed in to receive a confirmation code was published on a page a
 * search engine could index. That is the check this file exists for; the rest
 * guards the professional layer that was built and never reached the page —
 * services, portfolio, certificates, reviews and reputation all existed as
 * tables and queries while the profile showed a cover photo and a bio.
 *
 * The rule the brief states and this file enforces: no second user system.
 * Every section reads a table that was already there.
 */

import "./lib/allow-server-only.ts";

import { readFileSync } from "node:fs";

import {
  visibleContact,
  NO_RATING,
} from "../src/lib/data/professional-profile.ts";
import type { Profile } from "../src/types/database.types.ts";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/**
 * NOTE ON STRIPPING BLOCK COMMENTS
 *
 * `/\*` is only a comment opener when something that cannot be part of a token
 * precedes it. Without that guard the `/\*` inside a string literal — such as
 * `accept="image/\*"` — opens a comment that runs to the next real `*\/`,
 * silently deleting real code that no assertion can then see.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const migration = readFileSync(
  "supabase/migrations/0071_professional_profile.sql",
  "utf8",
).replace(/^\s*--.*$/gm, "");

// ---------------------------------------------------------------------------
// 1. Contact details
// ---------------------------------------------------------------------------

const withNumber = {
  phone: "+251911223344",
  email: "abel@example.com",
  show_phone: false,
  show_email: false,
} as unknown as Profile;

check(
  "a visitor sees no phone number by default",
  visibleContact(withNumber, false).phone === null,
  "the page used to render profiles.phone to everybody",
);
check(
  "nor an email address",
  visibleContact(withNumber, false).email === null,
);
check(
  "the owner still sees their own, so they can check what is published",
  visibleContact(withNumber, true).phone === withNumber.phone,
);
check(
  "and a visitor sees it once it is switched on",
  visibleContact({ ...withNumber, show_phone: true }, false).phone ===
    withNumber.phone,
);
check(
  "switching the phone on does not also publish the email",
  visibleContact({ ...withNumber, show_phone: true }, false).email === null,
  "one opt-in, one field",
);

check(
  "the column defaults to false in the database too",
  /show_phone boolean not null default false/.test(migration),
  "a default of true would publish every number that already exists",
);
check("and the email column with it", /show_email boolean not null default false/.test(migration));

{
  const form = code("src/components/profile/edit-profile-form.tsx");
  check(
    "the owner has a control for it",
    /name="showPhone"/.test(form),
    "a setting nobody can reach is a setting that is always off",
  );
  check("and for the email address", /name="showEmail"/.test(form));
  check(
    "the control reflects what is currently published",
    /defaultChecked=\{profile\.show_phone\}/.test(form),
  );
  check(
    "and says who can see it",
    /Anyone can see it, signed in or not/.test(form),
  );
}

{
  const action = code("src/app/(dashboard)/profile/edit/actions.ts");
  // An unticked checkbox is absent from the form data. Reading it as anything
  // other than "present and 'on'" turns a saved profile into a published
  // number. Verified against the markup base-ui actually renders: an input
  // with no `value` attribute, which a browser submits as "on".
  check(
    "an unticked box reads as off",
    /formData\.get\("showPhone"\) === "on"/.test(action),
  );
  check("and the same for email", /formData\.get\("showEmail"\) === "on"/.test(action));
  check(
    "the flags are written to the row",
    /show_phone: showPhone,/.test(action) && /show_email: showEmail,/.test(action),
  );
  check(
    "and the public page is rebuilt, so switching off takes effect",
    /revalidatePath\(`\/u\/\$\{username\}`\)/.test(action),
  );
}

{
  const display = code("src/components/profile/profile-display.tsx");
  check(
    "the older profile component obeys the same rule",
    /visibleContact\(profile, isOwner\)/.test(display) &&
      !/\{profile\.phone &&/.test(display),
    "it is one prop away from being dropped onto a public page",
  );
}

// ---------------------------------------------------------------------------
// 2. Standing
// ---------------------------------------------------------------------------

check(
  "the rating covers reviews left against the person",
  /r\.subject_type = 'professional' and r\.subject_id = p_user/.test(migration),
);
check(
  "and reviews of the services they provide",
  /r\.subject_type = 'service'/.test(migration) &&
    /s\.provider_id = p_user and s\.status = 'published'/.test(migration),
  "a service is somebody's work even when the review names the listing",
);
check(
  "an unpublished service does not count",
  !/select s\.id from public\.services s\s*\n\s*where s\.provider_id = p_user\s*\n\s*\)/.test(
    migration,
  ),
  "a rating anybody could raise with a listing they never published",
);
check(
  "reviews backed by a booking or a hire are counted apart",
  /count\(\*\) filter \(where m\.verified\)::bigint/.test(migration),
  "an average built only from unverified reviews is one a scammer manufactures",
);
check(
  "a profile with no reviews gets no rating",
  /coalesce\(avg\(m\.rating\), 0\)/.test(migration),
  "not a starting score",
);
check(
  "a signed-out visitor can read it",
  /grant execute on function public\.professional_reputation\(uuid\) to anon, authenticated;/.test(
    migration,
  ),
  "the rating is why somebody who arrived from a shared link stays",
);
check(
  "and it is revoked from everyone else first",
  /revoke all on function public\.professional_reputation\(uuid\) from public;/.test(
    migration,
  ),
);

check("an empty rating is empty", NO_RATING.total === 0 && NO_RATING.average === 0);

{
  const standing = code("src/components/profile/profile-standing.tsx");
  check(
    "nothing is invented when there are no reviews",
    /No reviews yet/.test(standing),
    "the brief's rule against fabricated history applies to a rating most",
  );
  check(
    "the verified count is shown beside the average",
    /backed by a booking or a hire/.test(standing),
  );
}

// ---------------------------------------------------------------------------
// 3. No second user system
// ---------------------------------------------------------------------------

{
  const loader = code("src/lib/data/professional-profile.ts");
  for (const [table, why] of [
    ["profiles", "the account"],
    ["services", "what they offer"],
    ["service_portfolio", "finished work"],
    ["service_certificates", "credentials"],
    ["follows", "followers"],
    ["projects", "published projects"],
  ] as const) {
    check(
      `the profile reads the existing ${table} table (${why})`,
      new RegExp(`\\.from\\("${table}"\\)`).test(loader),
    );
  }
  check(
    "the rating comes from the shared aggregate, not a query of its own",
    /\.rpc\("professional_reputation"/.test(loader),
    "two implementations is two numbers that disagree",
  );
  check(
    "no new table was invented for any of it",
    !/create table/i.test(migration),
    "the brief forbids a second user system",
  );
  check(
    "portfolio is not fetched when there are no services",
    /if \(serviceIds\.length > 0\)/.test(loader),
    "an empty `in` list is a query that returns everything",
  );
}

{
  const follow = code("src/components/profile/follow-button.tsx");
  check(
    "following reuses the community action",
    /toggleFollow\("profile", profileId\)/.test(follow),
    "a second follow table would be a second answer to who follows whom",
  );
  check(
    "a signed-out visitor is sent to sign in rather than shown an error",
    /if \(!signedIn\) \{/.test(follow),
  );
  check(
    "and a failed follow is put back",
    /setIsFollowing\(!optimistic\)/.test(follow),
    "an optimistic toggle that keeps a state the server refused is a lie",
  );
}

// ---------------------------------------------------------------------------
// 4. The page
// ---------------------------------------------------------------------------

{
  const page = code("src/app/u/[username]/page.tsx");
  // Counted, not merely found. Several of these appear on more than one tab,
  // so `ProfileStanding` deleted from the overview still matched the copy in
  // the reviews tab and the check went on passing.
  const expected: [string, number][] = [
    ["ProfileHeader", 1],
    // Overview, and again above the reviews themselves.
    ["ProfileStanding", 2],
    // Overview (trimmed to six) and the work tab in full.
    ["ProfilePortfolio", 2],
    ["ProfileServices", 1],
    // Overview and about.
    ["ProfileCredentials", 2],
    // Overview and work.
    ["ProfileProjects", 2],
  ];
  for (const [section, times] of expected) {
    const found = (page.match(new RegExp(`<${section}[\\s/>]`, "g")) ?? []).length;
    check(
      `the page renders ${section} on every tab that needs it`,
      found === times,
      `found ${found}, expected ${times}`,
    );
  }
  check(
    "views are counted for visitors and not for the owner",
    /if \(!isOwner\) \{[\s\S]{0,200}increment_profile_views/.test(page),
  );
  check(
    "the page describes itself from what the profile actually says",
    /data\.profile\.bio\?\.slice\(0, 155\)/.test(page),
  );
}

{
  const header = code("src/components/profile/profile-header.tsx");
  check(
    "the header shows the verification level, not a bare tick",
    /<VerifiedBadge level=\{level\} showLabel \/>/.test(header),
    "a tick with no noun beside it is read as more than it is",
  );
  check(
    "the level comes from what was actually verified",
    /verificationLevelOf\(profile\)/.test(header),
  );
  check(
    "contact details go through the visibility rule",
    /visibleContact\(profile, isOwner\)/.test(header),
  );
  check(
    "a visitor can message without needing a phone number",
    /<MessageButton[\s\n]/.test(header),
    "the alternative to publishing a number",
  );
  check("and follow", /<FollowButton[\s\n]/.test(header));
  check(
    "the owner is told when something is visible only to them",
    (header.match(/only you can see this/g) ?? []).length === 2,
    "once for the phone and once for the email — one copy covered for the other",
  );
  check(
    "the owner gets an edit link rather than a follow button",
    /isOwner \? \(/.test(header),
  );
}

{
  const credentials = code("src/components/profile/profile-credentials.tsx");
  check(
    "an unchecked certificate is labelled as self-declared",
    /Self-declared/.test(credentials),
    "a tick on a document nobody looked at claims something Medosha has not established",
  );
  check(
    "and only a checked one gets the tick",
    /credential\.verified \?/.test(credentials),
  );
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(`${DIM}profile: real work, and no contact detail nobody offered${RESET}`);
