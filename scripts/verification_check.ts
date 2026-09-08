/**
 * The verified badge is earned, and says what it means.
 *
 *   npx tsx scripts/verification_check.ts
 *
 * ## What was wrong
 *
 * `profiles.phone_verified` and `profiles.verification_status` were ordinary
 * columns under a policy that permits every column:
 *
 *   using (auth.uid() = id) with check (auth.uid() = id)
 *
 * so any signed-in member could `update profiles set phone_verified = true`
 * from the browser and wear the badge. `is_admin` and `restricted_until` were
 * already guarded this way; these two — the two the badge is drawn from — were
 * not.
 *
 * A badge anybody can grant themselves is worse than no badge. It makes the
 * honest ones meaningless, and it tells somebody deciding whether to send a
 * stranger money something untrue.
 */

import { readFileSync } from "node:fs";

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

const migrationRaw = readFileSync("supabase/migrations/0068_verification_integrity.sql", "utf8");
/**
 * SQL comments stripped.
 *
 * The file explains, in a comment, that the guard is `security invoker` and
 * why. A regex over the raw text therefore matched that sentence after the
 * code beneath it had been flipped to `definer` — the check passed on a guard
 * that could never fire, which is the exact failure it exists to catch.
 */
const migration = migrationRaw.replace(/^\s*--.*$/gm, "");
const badge = code("src/components/profile/verified-badge.tsx");
const otp = code("src/components/auth/phone-auth-form.tsx");

// ---------------------------------------------------------------------------
// 1. The column cannot be written from a browser
// ---------------------------------------------------------------------------

check("a trigger guards the badge columns", /create trigger prevent_verification_self_grant/.test(migration));
check("it refuses phone_verified", /new\.phone_verified is distinct from old\.phone_verified/.test(migration));
check("and verification_status", /new\.verification_status is distinct from old\.verification_status/.test(migration));
check("from API sessions specifically", /current_user in \('authenticated', 'anon'\)/.test(migration));

// As a definer the function runs as its owner, `current_user` could never be
// an API role, and the guard would read as protection while permitting
// everything. 0064 makes the same point about the admin flag.
{
  // The guard's own definition, not the file. `sync_phone_verification` is
  // legitimately `security definer` a few lines below.
  const guard = migration.slice(
    migration.indexOf("function public.prevent_verification_self_grant"),
    migration.indexOf("drop trigger if exists prevent_verification_self_grant"),
  );
  check(
    "the guard is security invoker, or it could never fire",
    /security invoker/.test(guard) && !/security definer/.test(guard),
  );
}
check("it fires before the write, not after", /before update on public\.profiles/.test(migration));

// ---------------------------------------------------------------------------
// 2. The only way in reads something the browser cannot forge
// ---------------------------------------------------------------------------

check("there is one function that can set it", /create or replace function public\.sync_phone_verification/.test(migration));
check("and it is security definer, so it can write past the guard", /security definer/.test(migration));

// The whole point. `profiles.phone` is typed by the member; only
// `auth.users.phone_confirmed_at` records a code actually confirmed.
check(
  "the badge is drawn from a confirmed code",
  /u\.phone_confirmed_at is not null/.test(migration),
);
check(
  "and never from the phone number on the profile",
  !/p\.phone is not null/.test(migration),
);
check("it only touches the caller's own row", /where p\.id = auth\.uid\(\)/.test(migration));
check("and refuses a caller who is not signed in", /raise exception 'sign in first'/.test(migration));

// A profile sitting in a review queue must not be demoted by a phone sync.
check(
  "a profile under review is left under review",
  /when p\.verification_status = 'pending' then p\.verification_status/.test(migration),
);

check("only members may call it", /grant execute on function public\.sync_phone_verification\(\) to authenticated;/.test(migration));
check("and it is revoked from everyone else first", /revoke all on function public\.sync_phone_verification\(\) from public;/.test(migration));

// ---------------------------------------------------------------------------
// 3. The OTP flow actually calls it
// ---------------------------------------------------------------------------

check("confirming a code syncs the badge", /supabase\.rpc\("sync_phone_verification"\)/.test(otp));
check("after the code is confirmed, not before", otp.indexOf("verifyOtp") < otp.indexOf("sync_phone_verification"));
// Somebody who has genuinely confirmed is signed in either way; the next
// sign-in settles it.
check("and a failure there does not block signing in", /catch \{/.test(otp));

// ---------------------------------------------------------------------------
// 4. The badge says what was checked
//
// A bare tick is read as an assurance whose strength the reader guesses, and
// they guess high. Medosha checks a phone.
// ---------------------------------------------------------------------------

check("the badge names the level", /label: "Phone verified"/.test(badge));
check("and does not claim identity was checked", !/label: "Verified",/.test(badge));
check("the stronger levels exist as labels, unearned", /identity:/.test(badge) && /business:/.test(badge));
check(
  "but only phone can currently be earned",
  /return profile\.phone_verified \? "phone" : null;/.test(badge),
);
check("the level is announced to a screen reader", /sr-only/.test(badge));
check("and explained on hover", /title=\{info\.detail\}/.test(badge));

// ---------------------------------------------------------------------------
// 5. The columns are still not in any writable surface
// ---------------------------------------------------------------------------

{
  const edit = code("src/app/(dashboard)/profile/edit/actions.ts");
  check(
    "the profile editor does not write the badge",
    !/phone_verified/.test(edit) && !/verification_status/.test(edit),
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
console.log(`${DIM}verification: the badge is earned, and says what it means${RESET}`);
