// Context-aware placeholder images for the seed dataset. Instead of random
// photos, each product/project/company maps to a descriptive keyword phrase,
// and the phrase becomes the prompt for a keyword image provider — so the
// image always matches the item and is never a random landscape/nature photo.
//
// Provider: pollinations.ai (keyword/prompt -> image). Deterministic: the URL
// carries a stable seed derived from the item + image index, so the same seed
// run always yields the same URLs (they stay cached/stable across reseeds).
// If nothing matches, we fall back to a branded local Medosha placeholder.

const PROVIDER = "https://image.pollinations.ai/prompt";

/** Branded local fallback (public/images/placeholder.svg) — used only when no
 * keyword mapping is found, never a random photo. */
export const BRAND_PLACEHOLDER = "/images/placeholder.svg";

function hash(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return h >>> 0;
}

function buildUrl(prompt: string, seed: number, w: number, h: number) {
  return `${PROVIDER}/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&nologo=true`;
}

// --- Product keyword mapping ----------------------------------------------
// Title-specific rules are checked first (top to bottom), then category
// defaults. Material-aware door/window rules come before the generic ones.

const PRODUCT_TITLE_RULES: [RegExp, string][] = [
  [/granite|countertop/i, "granite kitchen countertop"],
  [/marble/i, "polished marble floor"],
  [/porcelain|ceramic (floor )?tile|floor tile/i, "ceramic floor tiles"],
  [/vinyl|spc/i, "vinyl plank flooring"],
  [/hardwood|laminate floor/i, "hardwood wood flooring"],
  [/epoxy/i, "epoxy resin floor coating"],
  [/sink/i, "stainless steel kitchen sink"],
  [/wash basin|basin/i, "modern ceramic bathroom wash basin"],
  [/toilet|water closet/i, "modern white toilet"],
  [/shower/i, "modern shower set fixture"],
  [/faucet|mixer|\btap\b/i, "chrome kitchen faucet"],
  [/vanity/i, "bathroom vanity cabinet"],
  [/kitchen cabinet|modular kitchen|kitchen island|pantry/i, "modern kitchen cabinets"],
  [/wardrobe|closet/i, "wooden wardrobe closet"],
  [/dining table|table/i, "wooden dining table"],
  [/desk/i, "office desk furniture"],
  [/chair/i, "modern office chair"],
  [/sofa|lounge|couch/i, "luxury living room sofa"],
  [/bed( frame)?/i, "modern bed frame furniture"],
  [/bookshelf|shelf/i, "wooden bookshelf furniture"],
  [/aluminum (sliding )?door/i, "aluminum sliding door"],
  [/steel (security )?door/i, "steel security door"],
  [/glass door/i, "glass door"],
  [/upvc door/i, "upvc door"],
  [/\bdoor/i, "solid wooden door"], // \b so "outdoor" doesn't match
  [/aluminum (sliding )?window/i, "aluminum sliding window"],
  [/tempered glass|glass panel/i, "tempered glass window panel"],
  [/window/i, "modern building window"],
  [/corrugated|metal sheet|roof sheet/i, "corrugated metal roofing sheets"],
  [/waterproof|membrane/i, "roof waterproofing membrane"], // before roof
  [/truss/i, "steel roof truss"],
  [/roof tile|clay roof|\broof/i, "clay roof tiles"], // \b so "waterproof" doesn't match
  [/insulation/i, "thermal insulation roll"],
  [/primer|putty|coating|paint/i, "paint buckets and cans"],
  [/cement|portland/i, "stacked cement bags"],
  [/rebar|reinforc/i, "steel reinforcement bars rebar"],
  [/block|hcb|hollow/i, "concrete blocks"],
  [/sand|aggregate|gravel/i, "construction sand and gravel"],
  [/cable|wire/i, "electrical cables"],
  [/switch/i, "wall light switch"],
  [/socket|outlet/i, "electrical wall socket outlet"],
  [/distribution board|breaker|panel board/i, "electrical distribution board"],
  [/water tank|tank/i, "plastic water storage tank"],
  [/solar/i, "solar panels"],
  [/pipe|ppr|pvc/i, "pvc plumbing pipes"],
  [/led|light|lamp|chandelier|pendant/i, "modern ceiling light fixture"],
];

const PRODUCT_CATEGORY_DEFAULTS: Record<string, string> = {
  furniture: "modern furniture",
  kitchen: "modern kitchen sink",
  bathroom: "modern ceramic bathroom fixture",
  lighting: "modern ceiling light fixture",
  doors: "solid wooden door",
  windows: "modern building window",
  roofing: "roof tiles",
  paint: "paint buckets and cans",
  flooring: "ceramic floor tiles",
  electrical: "electrical supplies cables",
  "construction-materials": "stacked cement bags on pallet",
};

const PRODUCT_STYLE = "product photography, studio lighting, plain background";

/** Descriptive phrase for a product, or null when nothing maps. */
export function productPhrase(
  title: string,
  categorySlug: string,
): string | null {
  for (const [rule, phrase] of PRODUCT_TITLE_RULES) {
    if (rule.test(title)) return phrase;
  }
  return PRODUCT_CATEGORY_DEFAULTS[categorySlug] ?? null;
}

/** 3–5 matched images for a product. Falls back to the branded placeholder
 * (never a random photo) if no keyword maps. */
export function productImages(
  title: string,
  categorySlug: string,
  key: string,
  count: number,
): string[] {
  const phrase = productPhrase(title, categorySlug);
  if (!phrase) return Array.from({ length: count }, () => BRAND_PLACEHOLDER);
  const prompt = `${phrase}, ${PRODUCT_STYLE}`;
  return Array.from({ length: count }, (_, i) =>
    buildUrl(prompt, hash(`${key}|${phrase}|${i}`), 800, 800),
  );
}

// --- Project keyword mapping ----------------------------------------------

// Base phrases carry no style adjective — projectPhrase() prefixes the
// project's own style (Modern, Luxury, Minimalist…) so it isn't doubled.
const PROJECT_NOUN_RULES: [RegExp, string][] = [
  [/villa/i, "villa house exterior"],
  [/apartment|tower/i, "apartment building"],
  [/plaza|mall|showroom|commercial|office/i, "commercial building architecture"],
  [/lodge|hotel|hospitality/i, "hotel building"],
  [/estate|complex|residence|house/i, "residential house exterior"],
  [/pavilion/i, "architectural pavilion"],
];

const PROJECT_TYPE_DEFAULTS: Record<string, string> = {
  residential: "residential house exterior",
  commercial: "commercial building architecture",
  industrial: "industrial building",
  hospitality: "hotel building",
  institutional: "institutional building",
  mixed_use: "mixed use building",
  landscape: "landscape architecture garden design",
  interior: "interior design",
  renovation: "renovated building",
  other: "architecture building",
};

const PROJECT_STYLE = "architectural photography, high quality, daytime";

export function projectPhrase(
  title: string,
  buildingType: string,
  style: string,
): string {
  let base: string | null = null;
  for (const [rule, phrase] of PROJECT_NOUN_RULES) {
    if (rule.test(title)) {
      base = phrase;
      break;
    }
  }
  base ??= PROJECT_TYPE_DEFAULTS[buildingType] ?? "modern architecture building";
  // Prefix the design style (Modern, Luxury, Minimalist…) for variety.
  return `${style.toLowerCase()} ${base}`;
}

export function projectImages(
  title: string,
  buildingType: string,
  style: string,
  key: string,
  count: number,
): string[] {
  const prompt = `${projectPhrase(title, buildingType, style)}, ${PROJECT_STYLE}`;
  return Array.from({ length: count }, (_, i) =>
    buildUrl(prompt, hash(`${key}|proj|${i}`), 1200, 900),
  );
}

// --- Company keyword mapping ----------------------------------------------

const COMPANY_RULES: [RegExp, string][] = [
  [/architect|design/i, "modern architecture office interior"],
  [/interior|furniture/i, "furniture showroom interior"],
  [/steel/i, "steel warehouse industrial"],
  [/cement|material|supplier|trading/i, "building materials warehouse"],
  [/contractor|construction|builder/i, "construction site with cranes"],
  [/developer|real estate/i, "modern office building exterior"],
  [/engineering/i, "engineering office construction plans"],
];

const COMPANY_STYLE = "professional photography, high quality";

export function companyPhrase(category: string): string {
  for (const [rule, phrase] of COMPANY_RULES) {
    if (rule.test(category)) return phrase;
  }
  return "construction company office";
}

export function companyCover(category: string, key: string): string {
  const prompt = `${companyPhrase(category)}, ${COMPANY_STYLE}`;
  return buildUrl(prompt, hash(`${key}|cover`), 1200, 400);
}

/** Decorative profile cover — kept on-theme (architecture), never nature. */
export function architectureCover(key: string): string {
  const prompt = `modern construction architecture cityscape, ${COMPANY_STYLE}`;
  return buildUrl(prompt, hash(`${key}|usercover`), 1200, 400);
}

// --- Local assets --------------------------------------------------------
// These are files on disk (public/images/...), not provider URLs. They exist
// so migrate-images.ts can put a record back on a first-party image when the
// keyword mapping has nothing to offer.

export const COMPANY_PLACEHOLDER = "/images/placeholders/company.svg";
export const PRODUCT_PLACEHOLDER = "/images/placeholders/product.svg";
export const PROJECT_PLACEHOLDER = "/images/placeholders/project.svg";

const AVATAR_COUNT = 12;

/** One of the twelve local avatars, chosen deterministically from the key so
 * the same person keeps the same face across reseeds and reruns. */
export function avatarImage(key: string): string {
  const n = (hash(`${key}|avatar`) % AVATAR_COUNT) + 1;
  return `/images/avatars/avatar-${String(n).padStart(2, "0")}.svg`;
}
