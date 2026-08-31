/**
 * Why the Supabase CLI will not parse .env.local.
 *
 *   node scripts/env_doctor.mjs
 *
 * "failed to parse environment file" names the file and nothing else, which
 * leaves you reading a hundred lines of secrets looking for a stray quote.
 * This finds the line for you.
 *
 * ## It never prints a value
 *
 * Not a prefix, not a suffix, not a length where that would narrow a key. Every
 * report is a line number, a variable name and a description of the problem.
 * The one exception is a character that is itself the fault — a smart quote, a
 * stray backtick — which is shown as a Unicode code point rather than in
 * context, because you cannot fix an invisible character you cannot see named.
 *
 * Read-only. It changes nothing; it tells you what to change.
 */

import { readFileSync, existsSync } from "node:fs";

const FILE = process.argv[2] ?? ".env.local";

if (!existsSync(FILE)) {
  console.error(`\n  ${FILE} not found in ${process.cwd()}\n`);
  process.exit(1);
}

const raw = readFileSync(FILE);
const problems = [];
const warnings = [];

/* ---- Whole-file problems ------------------------------------------------ */

// A byte-order mark makes the first variable name literally "﻿KEY", which
// no parser recognises and no editor shows you.
if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) {
  problems.push({
    line: 1,
    name: "(file start)",
    problem: "UTF-8 byte-order mark (BOM) before the first variable",
    fix: "Re-save the file as UTF-8 without BOM. In VS Code: click the encoding in the status bar, 'Save with Encoding', 'UTF-8'.",
  });
}

const text = raw.toString("utf8").replace(/^﻿/, "");
const lines = text.split(/\r?\n/);

if (text.includes("\r\n")) {
  warnings.push(
    "The file uses Windows line endings (CRLF). Most parsers cope, but a value with a trailing \\r is a common cause of a key being rejected by an API.",
  );
}

/* ---- Line-by-line ------------------------------------------------------- */

/** Characters that look like quotes and are not. The commonest paste damage. */
const LOOKALIKES = {
  0x201c: "left double quotation mark",
  0x201d: "right double quotation mark",
  0x2018: "left single quotation mark",
  0x2019: "right single quotation mark",
  0x00ab: "left guillemet",
  0x00bb: "right guillemet",
  0x2013: "en dash",
  0x2014: "em dash",
  0x00a0: "non-breaking space",
};

let continuing = null;

lines.forEach((line, index) => {
  const number = index + 1;
  const trimmed = line.trim();

  if (continuing !== null) {
    if (/["']\s*$/.test(trimmed)) continuing = null;
    return;
  }

  if (trimmed === "" || trimmed.startsWith("#")) return;

  // A line with no '=' is either a comment missing its '#' or the overflow of
  // an unquoted multi-line value above it.
  if (!line.includes("=")) {
    problems.push({
      line: number,
      name: "(no variable)",
      problem: "line has no '=' and is not a comment",
      fix: "Either prefix it with '#' to make it a comment, delete it, or join it to the line above and wrap the whole value in double quotes.",
    });
    return;
  }

  const eq = line.indexOf("=");
  const rawName = line.slice(0, eq);
  const rawValue = line.slice(eq + 1);
  const name = rawName.trim();

  // Spaces around '='. The Supabase CLI is stricter here than Next is, which is
  // exactly how a file that runs the app fails the CLI.
  if (rawName !== name) {
    problems.push({
      line: number,
      name,
      problem:
        rawName.endsWith(" ") || rawName.endsWith("\t")
          ? "space before '='"
          : "leading whitespace before the variable name",
      fix: `Write it as ${name}=… with no space on either side of '='.`,
    });
  }
  if (/^[ \t]/.test(rawValue)) {
    problems.push({
      line: number,
      name,
      problem: "space after '='",
      fix: `Write it as ${name}=… with no space after '='. If the value genuinely starts with a space, wrap it in double quotes.`,
    });
  }

  // `export FOO=bar` is shell, not dotenv.
  if (/^export\s+/i.test(name)) {
    problems.push({
      line: number,
      name,
      problem: "starts with 'export', which is shell syntax",
      fix: "Remove the leading 'export '.",
    });
  }

  const bareName = name.replace(/^export\s+/i, "");

  if (bareName && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(bareName)) {
    const offenders = [...bareName]
      .filter((ch) => !/[A-Za-z0-9_]/.test(ch))
      .map((ch) => `'${ch}' (U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")})`);
    problems.push({
      line: number,
      name: bareName,
      problem: `invalid character in variable name: ${[...new Set(offenders)].join(", ")}`,
      fix: "Names may contain only letters, digits and underscores, and may not start with a digit.",
    });
  }

  // Quote lookalikes anywhere on the line. Pasting a key from a web page is how
  // a curly quote gets in, and it is invisible in most editors.
  const found = new Map();
  for (const ch of line) {
    const cp = ch.codePointAt(0);
    if (LOOKALIKES[cp]) found.set(cp, LOOKALIKES[cp]);
  }
  if (found.size > 0) {
    problems.push({
      line: number,
      name: bareName,
      problem: `contains characters that look like quotes or spaces but are not: ${[...found]
        .map(([cp, label]) => `${label} (U+${cp.toString(16).toUpperCase().padStart(4, "0")})`)
        .join(", ")}`,
      fix: "Retype the quotes and spaces by hand rather than pasting them. This is usually copy-paste damage from a web page.",
    });
  }

  // Unbalanced quotes: a value that opens a quote and never closes it swallows
  // every line after it, which is why one bad line can make the whole file
  // unparseable.
  const value = rawValue.trim();
  const opensDouble = value.startsWith('"') && !/^".*"$/.test(value);
  const opensSingle = value.startsWith("'") && !/^'.*'$/.test(value);

  if (opensDouble || opensSingle) {
    problems.push({
      line: number,
      name: bareName,
      problem: `value opens with ${opensDouble ? "a double" : "a single"} quote that is never closed on this line`,
      fix: "Close the quote at the end of the value, or remove both quotes. Everything after this line is being read as part of this value.",
    });
    continuing = number;
  }

  // An odd number of unescaped double quotes inside an otherwise-quoted value.
  const doubles = (value.match(/(?<!\\)"/g) ?? []).length;
  if (doubles % 2 === 1 && !opensDouble) {
    problems.push({
      line: number,
      name: bareName,
      problem: "odd number of double quotes in the value",
      fix: 'Escape any quote that is part of the value as \\" , or wrap the whole value in single quotes.',
    });
  }

  if (bareName && value === "") {
    warnings.push(`Line ${number}: ${bareName} has an empty value.`);
  }
});

if (continuing !== null) {
  problems.push({
    line: continuing,
    name: "(unterminated)",
    problem: "a quote opened here is never closed anywhere in the file",
    fix: "Close it. Everything below this line is being swallowed into one value, which is why the whole file fails to parse.",
  });
}

/* ---- Duplicates --------------------------------------------------------- */

const seen = new Map();
lines.forEach((line, index) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
  const name = trimmed.slice(0, trimmed.indexOf("=")).trim().replace(/^export\s+/i, "");
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return;
  seen.set(name, [...(seen.get(name) ?? []), index + 1]);
});

for (const [name, at] of seen) {
  if (at.length > 1) {
    warnings.push(
      `${name} is defined ${at.length} times (lines ${at.join(", ")}). The last one wins, which is rarely what somebody intends.`,
    );
  }
}

/* ---- Report ------------------------------------------------------------- */

const rule = "─".repeat(70);
console.log(`\n${rule}\n  ${FILE} — ${lines.length} lines, ${seen.size} variables\n${rule}`);

if (problems.length === 0) {
  console.log("\n  No parse-breaking problem found.\n");
  console.log("  If the Supabase CLI still refuses the file, the next thing to");
  console.log("  check is whether it is reading a different one: the CLI looks");
  console.log("  for .env by default, and --env-file points it elsewhere.\n");
} else {
  console.log(`\n  ${problems.length} problem${problems.length === 1 ? "" : "s"} to fix:\n`);
  for (const p of problems.sort((a, b) => a.line - b.line)) {
    console.log(`  line ${p.line}  ${p.name}`);
    console.log(`     ✗ ${p.problem}`);
    console.log(`     → ${p.fix}\n`);
  }
}

if (warnings.length > 0) {
  console.log(`${rule}\n  Worth a look, but not fatal:\n`);
  for (const w of warnings) console.log(`  · ${w}`);
  console.log();
}

console.log(`${rule}`);
console.log("  No value from this file has been printed, and none will be.");
console.log(`${rule}\n`);

process.exit(problems.length > 0 ? 1 : 0);
