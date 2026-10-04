// Builds scripts/data/image-manifest.json from freely-licensed image sources,
// so the demo catalogue can be filled with real construction photography
// instead of the branded placeholders.
//
//   npm run images:find              # search and write the manifest
//   npm run images:find -- --fresh   # ignore the cache and re-search
//
// Then review the manifest and run:
//
//   npm run images:import              # dry run
//   npm run images:import -- --apply   # download + point the database at them
//
// Two sources are tried in order: Wikimedia Commons, then Openverse. Both host
// freely-licensed media, and both rate-limit, so requests are throttled and
// retried with backoff, results are cached for a week, and a source that fails
// outright is skipped rather than ending the run.
//
// The licence and author of every picked file are recorded in the manifest.
// Check each file's terms before using it beyond a demo.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { politeFetch } from "./lib/http.ts";
import { cacheKey, readCache, writeCache } from "./lib/search-cache.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST = join(ROOT, "scripts", "data", "image-manifest.json");

const FRESH = process.argv.includes("--fresh");
const USER_AGENT = "Medosha demo image finder (construction marketplace demo)";

/** Minimum edge for a catalogue photo. */
const MIN_EDGE = 800;

/** Width requested from sources that can render a scaled copy. */
const TARGET_WIDTH = 1600;

/** Search terms per product category slug. */
const CATEGORY_QUERIES: Record<string, string> = {
  flooring: "ceramic floor tiles interior",
  kitchen: "modern kitchen cabinets interior",
  bathroom: "bathroom washbasin interior",
  lighting: "ceiling light fixture interior",
  doors: "wooden door building",
  windows: "aluminium window building facade",
  roofing: "roof tiles construction",
  paint: "paint cans painting wall",
  electrical: "electrical cables installation",
  "construction-materials": "cement bags construction site",
  furniture: "modern furniture sofa interior",
  plumbing: "plumbing pipes installation",
  solar: "solar panels roof",
  hardware: "hand tools hardware",
};

/** Search terms per company trade. */
const COMPANY_QUERIES: Record<string, string> = {
  architecture: "architecture office studio",
  contractor: "construction site crane",
  materials: "building materials warehouse",
  steel: "steel structure construction",
  engineering: "engineering construction drawings",
  developer: "modern office building exterior",
  interior: "furniture showroom interior",
  general: "construction workers building",
};

/** Search terms per project building type. */
const PROJECT_QUERIES: Record<string, string> = {
  residential: "modern residential house exterior",
  commercial: "commercial office building exterior",
  industrial: "industrial warehouse building",
  hospitality: "hotel building exterior",
  institutional: "school university building",
  mixed_use: "mixed use building city",
  landscape: "landscape garden design",
  interior: "modern interior design living room",
  renovation: "building renovation scaffolding",
  other: "modern architecture building",
};

/** One cover photo shared by every professional profile. */
const PROFILE_QUERIES: Record<string, string> = {
  all: "architecture construction cityscape",
};

type Candidate = {
  title: string;
  url: string;
  width: number;
  height: number;
  licence: string;
  author: string;
  source: "commons" | "openverse";
};

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function usable(url: string, width: number, height: number): boolean {
  return (
    width >= MIN_EDGE && height >= MIN_EDGE && /\.(jpe?g|png|webp)$/i.test(url)
  );
}

// --- Wikimedia Commons -----------------------------------------------------

type CommonsPage = {
  title?: string;
  imageinfo?: {
    url?: string;
    thumburl?: string;
    thumbwidth?: number;
    thumbheight?: number;
    width?: number;
    height?: number;
    extmetadata?: Record<string, { value?: string }>;
  }[];
};

async function searchCommons(query: string): Promise<Candidate[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: "6",
    gsrlimit: "12",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiurlwidth: String(TARGET_WIDTH),
    origin: "*",
  });

  const response = await politeFetch(
    `https://commons.wikimedia.org/w/api.php?${params}`,
    {
      headers: { "user-agent": USER_AGENT },
      onRetry: (attempt, wait, reason) =>
        console.log(
          `      commons ${reason} — waiting ${Math.round(wait / 1000)}s (attempt ${attempt})`,
        ),
    },
  );

  if (!response.ok) throw new Error(`commons HTTP ${response.status}`);

  const body = (await response.json()) as {
    query?: { pages?: Record<string, CommonsPage> };
  };

  return Object.values(body.query?.pages ?? {})
    .map((page): Candidate | null => {
      const info = page.imageinfo?.[0];
      if (!info?.url || !info.width || !info.height) return null;
      if (!usable(info.url, info.width, info.height)) return null;

      const useThumb =
        info.thumburl &&
        (info.thumbwidth ?? 0) >= MIN_EDGE &&
        (info.thumbheight ?? 0) >= MIN_EDGE;

      return {
        title: page.title ?? "",
        url: useThumb ? info.thumburl! : info.url,
        width: useThumb ? info.thumbwidth! : info.width,
        height: useThumb ? info.thumbheight! : info.height,
        licence: stripHtml(info.extmetadata?.LicenseShortName?.value ?? "unknown"),
        author: stripHtml(info.extmetadata?.Artist?.value ?? "unknown").slice(0, 80),
        source: "commons",
      };
    })
    .filter((c): c is Candidate => c !== null);
}

// --- Openverse -------------------------------------------------------------

type OpenverseResult = {
  title?: string;
  url?: string;
  width?: number;
  height?: number;
  license?: string;
  license_version?: string;
  creator?: string;
};

/** Second source, used when Commons is rate-limited or down. */
async function searchOpenverse(query: string): Promise<Candidate[]> {
  const params = new URLSearchParams({
    q: query,
    // Only work that may be used commercially and modified, so the demo does
    // not accumulate assets that cannot be reused.
    license_type: "commercial,modification",
    page_size: "12",
    mature: "false",
  });

  const response = await politeFetch(
    `https://api.openverse.org/v1/images/?${params}`,
    {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      onRetry: (attempt, wait, reason) =>
        console.log(
          `      openverse ${reason} — waiting ${Math.round(wait / 1000)}s (attempt ${attempt})`,
        ),
    },
  );

  if (!response.ok) throw new Error(`openverse HTTP ${response.status}`);

  const body = (await response.json()) as { results?: OpenverseResult[] };

  return (body.results ?? [])
    .map((result): Candidate | null => {
      if (!result.url || !result.width || !result.height) return null;
      if (!usable(result.url, result.width, result.height)) return null;
      return {
        title: result.title ?? "",
        url: result.url,
        width: result.width,
        height: result.height,
        licence: [result.license, result.license_version]
          .filter(Boolean)
          .join(" ")
          .toUpperCase() || "unknown",
        author: (result.creator ?? "unknown").slice(0, 80),
        source: "openverse",
      };
    })
    .filter((c): c is Candidate => c !== null);
}

// --- Search with cache and fallback ----------------------------------------

const SOURCES: {
  name: "commons" | "openverse";
  search: (query: string) => Promise<Candidate[]>;
}[] = [
  { name: "commons", search: searchCommons },
  { name: "openverse", search: searchOpenverse },
];

/** Sources that have already failed hard; skipped for the rest of the run. */
const exhausted = new Set<string>();

/**
 * Finds one candidate for a query.
 *
 * Cached answers are reused. Otherwise each source is tried in turn: a source
 * that fails is recorded and skipped for the remainder of the run, so twenty
 * categories do not each pay the full retry cost against a source that is
 * already known to be refusing requests.
 */
async function findCandidate(query: string): Promise<Candidate | null> {
  if (!FRESH) {
    const cached = readCache<Candidate>(cacheKey("image", query));
    if (cached) return cached;
  }

  for (const source of SOURCES) {
    if (exhausted.has(source.name)) continue;

    try {
      const found = await source.search(query);
      const best = found[0];
      if (!best) continue;

      writeCache(cacheKey("image", query), best);
      return best;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      console.log(`      ${source.name} unavailable (${reason}) — trying next source`);
      exhausted.add(source.name);
    }
  }

  return null;
}

// --- Manifest --------------------------------------------------------------

type ManifestEntry = {
  kind: "category" | "company" | "project" | "profile";
  match: string;
  url: string;
  source: string;
  licence: string;
  author: string;
};

type Report = { found: number; cached: number; missing: number };

async function collect(
  kind: ManifestEntry["kind"],
  queries: Record<string, string>,
  entries: ManifestEntry[],
  report: Report,
): Promise<void> {
  for (const [slug, query] of Object.entries(queries)) {
    const wasCached = !FRESH && readCache<Candidate>(cacheKey("image", query)) !== null;
    const candidate = await findCandidate(query);

    if (!candidate) {
      report.missing += 1;
      console.log(`  – ${slug.padEnd(24)} no image found`);
      continue;
    }

    entries.push({
      kind,
      match: slug,
      url: candidate.url,
      source: `${candidate.source}: ${candidate.title}`,
      licence: candidate.licence,
      author: candidate.author,
    });

    if (wasCached) report.cached += 1;
    else report.found += 1;

    console.log(
      `  ✓ ${slug.padEnd(24)} ${candidate.width}x${candidate.height}  ${candidate.licence}  [${wasCached ? "cached" : candidate.source}]`,
    );
  }
}

async function main() {
  const entries: ManifestEntry[] = [];
  const report: Report = { found: 0, cached: 0, missing: 0 };

  console.log(
    FRESH
      ? "Searching (ignoring cache)…\n"
      : "Searching (cached results are reused)…\n",
  );

  console.log("Product categories");
  await collect("category", CATEGORY_QUERIES, entries, report);

  console.log("\nCompany trades");
  await collect("company", COMPANY_QUERIES, entries, report);

  console.log("\nProject building types");
  await collect("project", PROJECT_QUERIES, entries, report);

  console.log("\nProfessional profile covers");
  await collect("profile", PROFILE_QUERIES, entries, report);

  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, `${JSON.stringify(entries, null, 2)}\n`);

  console.log("\n─── Search report ───────────────");
  console.log(`  found (new)   ${report.found}`);
  console.log(`  from cache    ${report.cached}`);
  console.log(`  not found     ${report.missing}`);
  if (exhausted.size > 0) {
    console.log(`  unavailable   ${[...exhausted].join(", ")}`);
  }
  console.log(`\n✓ Wrote ${entries.length} entries to ${MANIFEST}`);
  console.log("  Review it, then: npm run images:import -- --apply");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
