/**
 * No upload reaches a public bucket unchecked.
 *
 *   npx tsx scripts/upload_gate_check.ts
 *
 * The failure this guards against is silent and total: a component uploads
 * straight to a public bucket, the file is fetchable by URL the instant it
 * lands, and every moderation decision afterwards is about content the world
 * has already seen. Nothing errors. Nothing logs.
 *
 * What "checked" means has changed twice, and this file described the first
 * version until now. It is not "a moderator approved it" and it is not "a
 * classifier said safe". It is: the bytes passed through the server, which
 * looked at what they actually are, refused a clear violation, and applied the
 * author's watermark. Anything short of a refusal publishes — including an
 * image nothing could check, because not having looked at something is not a
 * reason to hold it.
 *
 * So the assertions below are about the URL. A component must render only a
 * URL the server handed back, because that is the one that cannot exist for
 * content the server refused.
 */

import { readFileSync, existsSync } from "node:fs";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

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
const code = (s: string) =>
  s.replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1").replace(/^\s*\/\/.*$/gm, "");

/** Public buckets a browser must never upload into directly. */
const PUBLIC_BUCKETS = [
  "avatars",
  "covers",
  "product-images",
  "project-images",
  "property-images",
  "company-assets",
];

/** Components already routed through quarantine. Each one added here is one
 * fewer place an unchecked image can reach the public web. */
const INTEGRATED = [
  "src/components/profile/avatar-upload.tsx",
  "src/components/profile/cover-upload.tsx",
  "src/components/products/product-images-input.tsx",
  "src/components/projects/project-images-input.tsx",
];

for (const file of INTEGRATED) {
  if (!existsSync(file)) {
    check(`${file} exists`, false, "the integration was removed or renamed");
    continue;
  }
  const source = code(readFileSync(file, "utf8"));

  // Scope to the upload call itself. A bucket name in a comment, a constant or
  // an unrelated download would satisfy a looser match while the call that
  // actually writes the file still points at a public bucket.
  const uploadTargets = [...source.matchAll(/storage\s*\.\s*from\(\s*["'`]([a-z-]+)["'`]\s*\)\s*\.\s*upload\(/g)]
    .map((m) => m[1]);

  check(
    `${file} uploads only to quarantine`,
    uploadTargets.length > 0 &&
      uploadTargets.every((b) => b === "moderation-quarantine"),
    uploadTargets.filter((b) => b !== "moderation-quarantine").join(", ") ||
      "no upload call found at all",
  );

  check(
    `${file} asks the server for a verdict`,
    /moderateQuarantinedImage\(/.test(source),
    "an upload that is never checked is an upload that is published",
  );

  // The gate is the condition, not the call. Calling the server and then
  // using the file regardless is the mistake this catches.
  //
  // This asked for the literal `verdict.status !== "safe"`, which is the rule
  // as it stood before `review` started publishing. No component has said that
  // for two changes now — they gate on the URL, which is stricter, because a
  // refused upload has no URL to render whatever its status says. The check
  // was failing while the code was right.
  check(
    `${file} acts only on a URL the server returned`,
    /!\s*verdict\.publicUrl/.test(source) && /verdict\.publicUrl/.test(source),
    "a component that proceeds without one is using a file nothing cleared",
  );

  check(
    `${file} never builds its own public URL`,
    !/getPublicUrl\(/.test(source),
    "a URL the client constructs bypasses the decision entirely",
  );
}

/* -------------------------------------------------------------------------- */
/* The shared action holds the line                                           */
/* -------------------------------------------------------------------------- */

const action = code(readFileSync("src/app/moderation/upload-actions.ts", "utf8"));

check(
  "the action verifies the caller owns the quarantine folder",
  // Scoped to the publish path. `signQuarantinePreview` further down the same
  // file makes the identical comparison for its own reasons, so the loose
  // match kept passing with the gate on the publish path removed entirely.
  /const owner = input\.quarantinePath\.split\(["'`]\/["'`]\)\[0\];[\s\S]{0,160}if \(owner !== user\.id\)/.test(
    action,
  ),
  "otherwise a caller can name somebody else's path and publish their file",
);
// The SIGNATURES table outlives the call that uses it, so matching the
// constant passes on code that no longer sniffs anything. Assert on the call
// and on the guard that acts upon its result.
check(
  "the action sniffs the real file type",
  /sniff\(\s*bytes\s*\)/.test(action) && /if\s*\(\s*!actual\s*\)/.test(action),
  "an accept= attribute is a picker hint, not a check",
);
check(
  "a clear violation is refused before anything is copied",
  /outcome\.status\s*===\s*["'`]blocked["'`]/.test(action) &&
    /publishApproved\(/.test(action),
  "the copy into the public bucket is the irreversible step",
);
// The regression this file exists to catch now runs the other way too: a
// pipeline that refuses ordinary photographs is as broken as one that
// publishes unchecked ones, and it is the failure people actually hit.
check(
  "and nothing else is",
  !/!\s*outcome\.itemId/.test(action),
  "requiring a moderation record made every upload fail when the table was unreachable",
);
check(
  "publishing does not depend on a record existing",
  /outcome\.itemId \?\? null/.test(action),
  "an ordinary image must publish whether or not its audit row could be written",
);
check(
  "a rejected file stays in quarantine",
  !/remove\(\s*\[\s*input\.quarantinePath\s*\]\s*\)[\s\S]{0,200}outcome/.test(action),
  "a moderator still has to be able to look at it",
);

/* -------------------------------------------------------------------------- */
/* Everything not yet integrated is named, not forgotten                      */
/* -------------------------------------------------------------------------- */

const REMAINING = [
  "src/components/companies/single-image-input.tsx",
  "src/components/property/property-form.tsx",
];

const stillDirect = REMAINING.filter((f) => {
  if (!existsSync(f)) return false;
  const s = code(readFileSync(f, "utf8"));
  return [...s.matchAll(/storage\s*\.\s*from\(\s*["'`]([a-z-]+)["'`]\s*\)\s*\.\s*upload\(/g)]
    .some((m) => PUBLIC_BUCKETS.includes(m[1]));
});

console.log(
  `\n  ${INTEGRATED.length} integrated, ${stillDirect.length} still uploading directly to a public bucket:`,
);
for (const f of stillDirect) console.log(`    · ${f}`);

if (failures.length > 0) {
  console.error(`\n${failures.length} failed:\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n${passed} passed, ${failures.length} failed\n`);
  process.exit(1);
}

console.log(`\n✓ ${passed} upload-gate checks passed\n`);
