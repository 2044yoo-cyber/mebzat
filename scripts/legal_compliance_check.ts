/**
 * The MVP legal and compliance foundation: real pages, one source of
 * business contact information, one demo badge, one disclaimer, one
 * ownership confirmation, and an account deletion that only ever deletes
 * the account that asked for it.
 *
 *   npx tsx scripts/legal_compliance_check.ts
 *
 * ## What this file is careful about
 *
 * The account deletion action is the one piece of this brief where a bug is
 * not a broken label — it is either a stranger's account being deletable, or
 * a "successful" deletion that quietly leaves the account intact. Both are
 * asserted on call syntax, not on the presence of a name, and comments are
 * stripped first so a sentence describing the rule cannot satisfy a check for
 * the rule itself.
 */

import { readFileSync, existsSync } from "node:fs";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
const failures: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed += 1;
  else failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

/** Comments stripped, so prose describing a rule cannot satisfy a check for it. */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/(^|[\s;,{(=])\/\*[\s\S]*?\*\//g, "$1")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** Only the body of one function, so a sibling cannot answer for it. */
function fn(source: string, opener: string): string {
  const start = source.indexOf(opener);
  if (start === -1) return "";
  let depth = 0;
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

// ---------------------------------------------------------------------------
// 1–2. Privacy Policy and Terms of Service
// ---------------------------------------------------------------------------

{
  const privacy = code("src/app/(info)/privacy/page.tsx");
  const REQUIRED_PRIVACY_SECTIONS = [
    "Account and profile information",
    "Content you upload",
    "Property and marketplace information",
    "AI prompts and generated content",
    "Usage and analytics information",
    "How your data is used",
    "Third-party services",
    "Data retention",
    "Account and data deletion",
    "Security",
    "Your rights",
    "Contact",
    "Changes to this policy",
  ];
  for (const heading of REQUIRED_PRIVACY_SECTIONS) {
    check(`privacy covers "${heading}"`, privacy.includes(heading));
  }
  check(
    "privacy does not claim a security certification it does not have",
    !/ISO\s?27001|SOC\s?2|GDPR[- ]compliant|PCI[- ]DSS/i.test(privacy),
    "an invented certification is worse than none",
  );
  check(
    "the privacy page reads the centralised contact address, not a literal",
    /BUSINESS\.privacyEmail/.test(privacy) && !/"privacy@medosha\.net"/.test(privacy),
  );

  const terms = code("src/app/(info)/terms/page.tsx");
  // JSX wraps prose across lines, so whitespace is collapsed before matching
  // sentences that would otherwise be broken by wherever prettier put a
  // line break.
  const termsFlat = terms.replace(/\s+/g, " ");
  const REQUIRED_TERMS_SECTIONS = [
    "Eligibility and your account",
    "Acceptable use",
    "Content you publish",
    "Property listings",
    "Professional profiles",
    "Marketplace and digital products",
    "AI-generated content",
    "BOQ and cost estimates",
    "Intellectual property",
    "Prohibited content and activity",
    "Suspension and removal",
    "Service availability",
    "Limitation of liability",
    "Changes to these terms",
    "Contact",
  ];
  for (const heading of REQUIRED_TERMS_SECTIONS) {
    check(`terms covers "${heading}"`, terms.includes(heading));
  }
  check(
    "terms names the exact upload ownership confirmation",
    /confirm that you own it or have permission to upload and share it/.test(
      termsFlat,
    ),
  );
  check(
    "terms does not promise engineering advice or exact prices",
    !/certified engineering advice/i.test(termsFlat) &&
      /may contain errors/.test(termsFlat) &&
      /Verify with a qualified professional/.test(termsFlat),
  );
  check(
    "terms does not claim listings or professionals are verified by default",
    /unless a listing is explicitly marked as verified/.test(termsFlat) &&
      /unless a profile is explicitly marked as verified/.test(termsFlat),
  );
}

// ---------------------------------------------------------------------------
// 3. One centralised business/contact config
// ---------------------------------------------------------------------------

{
  const business = code("src/lib/legal/business.ts");
  check(
    "the business config exists and exports one BUSINESS object",
    /export const BUSINESS = \{/.test(business),
  );
  check(
    "unknown legal fields are null placeholders, not invented",
    /legalName: null as string \| null/.test(business) &&
      /country: null as string \| null/.test(business),
    "a guessed legal name or country is a claim nobody has made",
  );

  const contact = code("src/app/(info)/contact/page.tsx");
  check(
    "the contact page reads the shared config rather than its own literals",
    /BUSINESS\.contactEmail/.test(contact) &&
      /BUSINESS\.supportEmail/.test(contact) &&
      !/"hello@medosha\.net"/.test(contact) &&
      !/"support@medosha\.net"/.test(contact),
  );
}

// ---------------------------------------------------------------------------
// 4. One DemoBadge, not markup duplicated per card
// ---------------------------------------------------------------------------

{
  check(
    "a shared DemoBadge component exists",
    existsSync("src/components/ui/demo-badge.tsx"),
  );
  const badge = code("src/components/ui/demo-badge.tsx");
  check(
    "it renders nothing when there is nothing to disclose",
    /if \(!demo\) return null;/.test(badge),
    "a real listing must never carry a demo badge by omission",
  );
  check(
    "it offers both a card-corner pill and an inline text label",
    /variant === "text"/.test(badge) && /rounded-full border border-transparent bg-amber-500/.test(badge),
  );

  const product = code("src/components/products/product-card.tsx");
  check(
    "the product card uses the shared badge rather than its own pill",
    /<DemoBadge$/m.test(product) || /<DemoBadge\s/.test(product),
  );
  check(
    "and no longer hand-rolls one",
    !/bg-amber-500 px-2 py-0\.5 text-\[10px\] font-semibold tracking-wide text-amber-950 uppercase/.test(
      product,
    ),
  );

  const feed = code("src/components/feed/feed-card.tsx");
  check(
    "the feed card uses the shared badge for its inline label too",
    /<DemoBadge variant="text"/.test(feed),
  );
}

// ---------------------------------------------------------------------------
// 5. AI and BOQ disclaimers, unobtrusive and in the right places
// ---------------------------------------------------------------------------

{
  check(
    "a shared ContentDisclaimer component exists",
    existsSync("src/components/shared/content-disclaimer.tsx"),
  );
  const disclaimer = code("src/components/shared/content-disclaimer.tsx");
  check(
    "it is a small inline note, not a dialog",
    !/Dialog|Modal/.test(disclaimer),
    "the brief is explicit: not a large modal every time",
  );
  check(
    "it reads the two disclaimer strings from the translation catalogue",
    /legal\.aiDisclaimer/.test(disclaimer) && /legal\.boqDisclaimer/.test(disclaimer),
  );

  const PLACES: [string, string][] = [
    ["src/components/ai/ai-chat.tsx", "the AI chat panel"],
    ["src/components/ai/medosha-ai.tsx", "the full-screen AI panel"],
    ["src/components/ai/studio/image-workspace.tsx", "the image studio's results"],
    ["src/components/ai/studio/redesign-workspace.tsx", "the redesign comparison"],
    ["src/components/calculators/boq-calculator.tsx", "the BOQ calculator"],
    ["src/components/calculators/results-panel.tsx", "every calculator's results"],
  ];
  for (const [path, label] of PLACES) {
    check(`${label} shows the disclaimer`, /<ContentDisclaimer\b/.test(code(path)));
  }
}

// ---------------------------------------------------------------------------
// 6. Upload ownership confirmation, required on public-publish forms only
// ---------------------------------------------------------------------------

{
  check(
    "a shared OwnershipConfirmation component exists",
    existsSync("src/components/shared/ownership-confirmation.tsx"),
  );
  const confirmation = code("src/components/shared/ownership-confirmation.tsx");
  check(
    "it is an actually required field, not a decoration",
    /required$/m.test(confirmation) || /required\s/.test(confirmation),
    "the checkbox has to block submission or it confirms nothing",
  );
  check(
    "it posts under one stable field name",
    /name="ownershipConfirmed"/.test(confirmation),
  );

  const property = code("src/components/property/property-form.tsx");
  check(
    "a public property listing requires it before publishing",
    /<OwnershipConfirmation/.test(property),
  );

  const product = code("src/components/products/product-form.tsx");
  check(
    "a marketplace product — including a digital product — requires it too",
    /<OwnershipConfirmation/.test(product),
  );
}

// ---------------------------------------------------------------------------
// 7. Account deletion: real, self-only, and never faked
// ---------------------------------------------------------------------------

{
  const action = code(
    "src/app/(dashboard)/settings/delete-account-actions.ts",
  );
  const deleteFn = fn(action, "export async function deleteAccount");

  check(
    "the account deleted is read from the caller's own session",
    /const viewer = await requireViewer\(/.test(deleteFn),
    "if the id came from anywhere else, a crafted request could target somebody else's account",
  );
  check(
    "and that id, not a posted one, is what is deleted",
    /admin\.auth\.admin\.deleteUser\(viewer\.id\)/.test(deleteFn),
  );
  check(
    "the service-role client is the one used — RLS does not reach auth.users",
    /createServiceClient\(\)/.test(deleteFn),
  );
  check(
    "a failed deletion is reported as a failure, not redirected as a success",
    /if \(error\) \{[\s\S]{0,220}?return \{/.test(deleteFn),
    "reaching the redirect on a failure path is what 'faking successful deletion' looks like in code",
  );
  check(
    "success is the only path that reaches the redirect",
    deleteFn.indexOf("redirect(") > deleteFn.lastIndexOf("return {"),
  );
  check(
    "signing out happens only once the account is actually gone",
    deleteFn.indexOf("admin.auth.admin.deleteUser") <
      deleteFn.indexOf("auth.signOut()"),
    "signing out first and failing after would leave someone logged out of an account that still exists",
  );

  const ui = code("src/components/settings/delete-account-section.tsx");
  check(
    "deleting requires a second, explicit confirmation",
    /disabled=\{!understood \|\| pending\}/.test(ui),
    "a single click on a destructive button is the accidental-deletion report waiting to happen",
  );
  check(
    "the dialog says the deletion is permanent",
    /legal\.deleteAccountWarning/.test(ui),
  );
  check(
    "and it is honest that uploaded files are not yet part of the cleanup",
    /may take\s+longer to be fully removed from storage/.test(ui.replace(/\s+/g, " ")),
    "claiming a clean sweep this action cannot yet perform would be the same failure the brief warns against",
  );

  const settings = code("src/app/(dashboard)/settings/page.tsx");
  check(
    "Delete Account is reachable from Settings",
    /<DeleteAccountSection/.test(settings),
  );
}

// ---------------------------------------------------------------------------
// 8. Footer legal links — reused, not duplicated
// ---------------------------------------------------------------------------

{
  const footer = code("src/components/layout/site-footer.tsx");
  check(
    "the footer links to Privacy, Terms and Contact",
    /footer\.privacy.*href: "\/privacy"/.test(footer) &&
      /footer\.terms.*href: "\/terms"/.test(footer) &&
      /footer\.contact.*href: "\/contact"/.test(footer),
  );
  check(
    "there is exactly one SiteFooter component",
    !existsSync("src/components/layout/site-footer-2.tsx") &&
      !existsSync("src/components/layout/footer.tsx"),
    "a second footer is the one thing this brief explicitly says not to build",
  );
}

// ---------------------------------------------------------------------------
// 9. The new UI strings exist in all three languages
// ---------------------------------------------------------------------------

{
  const translations = readFileSync("src/lib/i18n/translations.ts", "utf8");
  const KEYS = [
    "sampleData",
    "aiDisclaimer",
    "boqDisclaimer",
    "uploadOwnership",
    "deleteAccount:",
    "deleteAccountWarning",
    "deleteAccountConfirm",
  ];
  for (const key of KEYS) {
    const count = (translations.match(new RegExp(key.replace(":", "\\s*:"), "g")) ?? [])
      .length;
    check(
      `"${key.replace(":", "")}" is defined for English, Amharic and Afaan Oromo`,
      count === 3,
      `found ${count} — one entry per language, no more and no fewer`,
    );
  }
}

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.log(`\n${RED}${failures.length} failed${RESET}`);
  for (const failure of failures) console.log(`  ${RED}✗${RESET} ${failure}`);
  console.log(`${GREEN}${passed} passed${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}${passed} passed, 0 failed${RESET}`);
console.log(
  `${DIM}legal: pages, one demo badge, one disclaimer, and a deletion that only ever deletes your own account${RESET}`,
);
