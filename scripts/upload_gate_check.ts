/**
 * No upload reaches a public bucket unchecked.
 *
 *   npx tsx scripts/upload_gate_check.ts
 *
 * The failure this guards against is silent and total: a component uploads
 * straight to a public bucket, the file is fetchable by URL the instant it
 * lands, and every moderation decision afterwards is about content the world
 * has already seen. Nothing errors. Nothing logs.
 */

import { readFileSync, existsSync } from "node:fs";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

const code = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

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
const INTEGRATED = ["src/components/profile/avatar-upload.tsx"];

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
  // writing the row regardless is the mistake this catches.
  check(
    `${file} writes the record only when safe`,
    /verdict\.status\s*!==\s*["'`]safe["'`]/.test(source) &&
      /verdict\.publicUrl/.test(source),
    "the public URL must come from the verdict, not from getPublicUrl",
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
  /split\(["'`]\/["'`]\)\[0\]/.test(action) && /!==\s*user\.id/.test(action),
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
  "publishing happens only after a safe verdict",
  /outcome\.status\s*!==\s*["'`]safe["'`]/.test(action) &&
    /publishApproved\(/.test(action),
  "the copy into the public bucket is the irreversible step",
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
  "src/components/profile/cover-upload.tsx",
  "src/components/products/product-images-input.tsx",
  "src/components/projects/project-images-input.tsx",
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
