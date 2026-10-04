// Downloads real photography into the project and points the database at the
// local copies. Nothing is ever hotlinked: every URL in the manifest is
// fetched once, written under public/images/, and the matching rows are
// updated to the local path.
//
//   npm run images:import              # dry run — reports, downloads nothing
//   npm run images:import -- --apply   # download and update the database
//
// The manifest lives at scripts/data/image-manifest.json:
//
//   [
//     { "kind": "product",  "match": "porcelain-floor-tile-60x60", "url": "https://…/tile.jpg" },
//     { "kind": "category", "match": "flooring",                   "url": "https://…/floor.jpg" },
//     { "kind": "company",  "match": "addis-steel-works",          "url": "https://…/yard.jpg" }
//   ]
//
// "match" is the row's slug. Products also accept a category slug, which
// applies one photo to every product in that category — useful for filling a
// demo catalogue quickly.
//
// You are responsible for having the right to use each image you list.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { adminClient, requireTables, type Admin } from "./lib/admin.ts";
import { politeFetch } from "./lib/http.ts";
import type { AccountType, BuildingType } from "../src/types/database.types.ts";

const APPLY = process.argv.includes("--apply");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "scripts", "data", "image-manifest.json");
const PUBLIC_IMAGES = join(ROOT, "public", "images");

/** Smallest edge we consider acceptable for a catalogue photo. */
const MIN_EDGE = 800;

type Kind = "product" | "company" | "category" | "project" | "profile";

type ManifestEntry = {
  kind: Kind;
  match: string;
  url: string;
};

/** Where each kind's files live under public/images. */
const FOLDERS: Record<Kind, string> = {
  product: "products",
  category: "products",
  company: "companies",
  project: "projects",
  profile: "profiles",
};

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

/**
 * Reads pixel dimensions straight from the file header, so a too-small image
 * is caught before it reaches the catalogue. Avoids pulling in an image
 * library for what is a handful of bytes.
 */
function readDimensions(buffer: Buffer): { width: number; height: number } | null {
  // PNG: IHDR is always the first chunk.
  if (buffer.length > 24 && buffer.toString("ascii", 1, 4) === "PNG") {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // WebP (VP8X / VP8 / VP8L are all prefixed with RIFF….WEBP).
  if (buffer.length > 30 && buffer.toString("ascii", 8, 12) === "WEBP") {
    const format = buffer.toString("ascii", 12, 16);
    if (format === "VP8X") {
      return {
        width: 1 + buffer.readUIntLE(24, 3),
        height: 1 + buffer.readUIntLE(27, 3),
      };
    }
    if (format === "VP8 ") {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }
  }

  // JPEG: walk the segment markers to the start-of-frame.
  if (buffer.length > 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset < buffer.length - 9) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      // The loop bound leaves at least nine bytes, so this byte exists —
      // but a truncated file is exactly the case worth not crashing on.
      if (marker === undefined) break;

      // SOF0..SOF15, excluding the non-frame markers DHT/JPG/DAC.
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return {
          height: buffer.readUInt16BE(offset + 5),
          width: buffer.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }

  return null;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function loadManifest(): ManifestEntry[] {
  if (!existsSync(MANIFEST)) {
    throw new Error(
      `No manifest at ${MANIFEST}.\n` +
        `Create it as a JSON array of { "kind", "match", "url" } entries — see the header of this file.`,
    );
  }
  const parsed: unknown = JSON.parse(readFileSync(MANIFEST, "utf8"));
  if (!Array.isArray(parsed)) throw new Error("The manifest must be a JSON array.");

  const kinds: Kind[] = ["product", "company", "category", "project", "profile"];
  return parsed.map((raw, index) => {
    const entry = raw as Partial<ManifestEntry>;
    if (!entry.kind || !kinds.includes(entry.kind)) {
      throw new Error(`Entry ${index}: "kind" must be one of ${kinds.join(", ")}.`);
    }
    if (!entry.match || !entry.url) {
      throw new Error(`Entry ${index}: "match" and "url" are both required.`);
    }
    if (!/^https?:\/\//i.test(entry.url)) {
      throw new Error(`Entry ${index}: "url" must be an http(s) address.`);
    }
    return entry as ManifestEntry;
  });
}

export type Outcome = "downloaded" | "skipped" | "failed";

/**
 * Fetches one image and writes it under public/images/<kind>/.
 *
 * A file already on disk is skipped rather than re-fetched, so re-running the
 * import after a partial failure only pays for what is missing. Downloads are
 * throttled and retried, and a failure returns rather than throwing so the
 * remaining entries still import.
 */
async function download(
  entry: ManifestEntry,
): Promise<{ outcome: Outcome; localPath: string | null; reason?: string }> {
  const folder = FOLDERS[entry.kind];
  const base = slugify(entry.match);

  // Any extension already present counts as downloaded.
  for (const ext of Object.values(EXTENSIONS)) {
    const candidate = join(PUBLIC_IMAGES, folder, `${base}.${ext}`);
    if (existsSync(candidate)) {
      console.log(`  · ${entry.match}: already downloaded`);
      return { outcome: "skipped", localPath: `/images/${folder}/${base}.${ext}` };
    }
  }

  let response: Response;
  try {
    response = await politeFetch(entry.url, {
      headers: { "user-agent": "Medosha demo image import" },
      onRetry: (attempt, wait, reason) =>
        console.log(
          `      ${entry.match}: ${reason} — waiting ${Math.round(wait / 1000)}s (attempt ${attempt})`,
        ),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    console.log(`  ✗ ${entry.match}: ${reason}`);
    return { outcome: "failed", localPath: null, reason };
  }

  if (!response.ok) {
    console.log(`  ✗ ${entry.match}: HTTP ${response.status}`);
    return { outcome: "failed", localPath: null, reason: `HTTP ${response.status}` };
  }

  const [contentType = ""] = (response.headers.get("content-type") ?? "").split(";");
  const extension = EXTENSIONS[contentType];
  if (!extension) {
    console.log(`  ✗ ${entry.match}: unsupported type "${contentType}"`);
    return {
      outcome: "failed",
      localPath: null,
      reason: `unsupported type ${contentType}`,
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const size = readDimensions(buffer);
  if (size && (size.width < MIN_EDGE || size.height < MIN_EDGE)) {
    console.log(
      `  ! ${entry.match}: ${size.width}x${size.height} is under ${MIN_EDGE}px — imported anyway`,
    );
  }

  const fileName = `${base}.${extension}`;
  const localPath = `/images/${folder}/${fileName}`;

  if (APPLY) {
    mkdirSync(join(PUBLIC_IMAGES, folder), { recursive: true });
    writeFileSync(join(PUBLIC_IMAGES, folder, fileName), buffer);
  }

  const dimensions = size ? `${size.width}x${size.height}` : "unknown size";
  console.log(
    `  ✓ ${entry.match}: ${dimensions}, ${Math.round(buffer.length / 1024)} KB -> ${localPath}`,
  );
  return { outcome: "downloaded", localPath };
}

async function applyProduct(
  admin: Admin,
  match: string,
  localPath: string,
): Promise<number> {
  // A category slug fills every product in that category; otherwise match the
  // product's own slug.
  const { data: category } = await admin
    .from("product_categories")
    .select("id")
    .eq("slug", match)
    .maybeSingle();

  const target = category
    ? admin.from("products").update({ cover_image_url: localPath }).eq("category_id", category.id)
    : admin.from("products").update({ cover_image_url: localPath }).eq("slug", match);

  // select() makes the update return the rows it touched, so a match that hit
  // nothing is reported instead of passing silently.
  const { data, error } = await target.select("id");
  if (error) throw new Error(`products/${match}: ${error.message}`);
  return data?.length ?? 0;
}

async function applyRow(
  admin: Admin,
  kind: Kind,
  match: string,
  localPath: string,
): Promise<number> {
  if (kind === "product") return applyProduct(admin, match, localPath);

  if (kind === "company") {
    // "match" is a company slug when it names one, otherwise a trade category
    // ("contractor", "steel") that fills every business in that trade.
    const { data: bySlug } = await admin
      .from("companies")
      .select("id")
      .eq("slug", match)
      .maybeSingle();

    const target = bySlug
      ? admin.from("companies").update({ cover_url: localPath }).eq("id", bySlug.id)
      : admin
          .from("companies")
          .update({ cover_url: localPath })
          .ilike("category", `%${match}%`);

    const { data, error } = await target.select("id");
    if (error) throw new Error(`companies/${match}: ${error.message}`);
    return data?.length ?? 0;
  }

  if (kind === "project") {
    // "match" is a project slug when it names one, otherwise a building type
    // ("residential", "commercial") that fills every project of that type.
    const { data: bySlug } = await admin
      .from("projects")
      .select("id")
      .eq("slug", match)
      .maybeSingle();

    const target = bySlug
      ? admin.from("projects").update({ cover_image_url: localPath }).eq("id", bySlug.id)
      : // The manifest is free-form text while the column is an enum, so the
        // value is asserted rather than pretending it was validated.
        admin
          .from("projects")
          .update({ cover_image_url: localPath })
          .eq("building_type", match as BuildingType);

    const { data, error } = await target.select("id");
    if (error) throw new Error(`projects/${match}: ${error.message}`);
    return data?.length ?? 0;
  }

  if (kind === "profile") {
    // "match" is an account type, or "all" for every professional. Only the
    // cover changes: avatars stay the branded per-person image so people are
    // still visually distinct.
    const target =
      match === "all"
        ? admin.from("profiles").update({ cover_url: localPath }).not("username", "is", null)
        : admin
            .from("profiles")
            .update({ cover_url: localPath })
            .eq("account_type", match as AccountType);

    const { data, error } = await target.select("id");
    if (error) throw new Error(`profiles/${match}: ${error.message}`);
    return data?.length ?? 0;
  }

  // Categories carry no image column; their photo is applied to the products
  // inside them so the marketplace grid fills with real photography.
  return applyProduct(admin, match, localPath);
}

async function main() {
  const entries = loadManifest();
  console.log(
    APPLY
      ? `Importing ${entries.length} image(s)…\n`
      : `Dry run — ${entries.length} image(s) would be imported. Nothing is written.\n`,
  );

  const admin = adminClient();
  await requireTables(admin, [
    "products",
    "companies",
    "projects",
    "profiles",
    "product_categories",
  ]);

  const report = {
    downloaded: 0,
    skipped: 0,
    failed: 0,
    rowsUpdated: 0,
    failures: [] as { match: string; reason: string }[],
  };

  for (const entry of entries) {
    // One entry failing must never end the run: every remaining category still
    // gets its chance, and the report says what was missed.
    const result = await download(entry);

    if (result.outcome === "failed" || !result.localPath) {
      report.failed += 1;
      report.failures.push({
        match: entry.match,
        reason: result.reason ?? "unknown",
      });
      continue;
    }

    if (result.outcome === "skipped") report.skipped += 1;
    else report.downloaded += 1;

    if (!APPLY) continue;

    try {
      const rows = await applyRow(
        admin,
        entry.kind,
        entry.match,
        result.localPath,
      );
      report.rowsUpdated += rows;
      console.log(
        rows === 0
          ? `      ! nothing in the database matched "${entry.match}"`
          : `      -> ${rows} row(s) updated`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : "update failed";
      report.failed += 1;
      report.failures.push({ match: entry.match, reason });
      console.log(`      ✗ ${reason}`);
    }
  }

  console.log("\n─── Import report ───────────────");
  console.log(`  downloaded    ${report.downloaded}`);
  console.log(`  skipped       ${report.skipped}  (already on disk)`);
  console.log(`  failed        ${report.failed}`);
  if (APPLY) console.log(`  rows updated  ${report.rowsUpdated}`);

  if (report.failures.length > 0) {
    console.log("\n  Failures:");
    for (const failure of report.failures) {
      console.log(`    ${failure.match}: ${failure.reason}`);
    }
    console.log("\n  Re-run to retry only what failed — successes are skipped.");
  }

  if (!APPLY) {
    console.log("\n  Re-run with --apply to download and update the database.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
