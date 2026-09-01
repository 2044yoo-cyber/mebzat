/**
 * What a listing says about itself.
 *
 * Who is selling, how to reach them, what has been checked, and which icon
 * the map draws. Client-safe — these are labels and shapes, not permissions.
 */

// ---------------------------------------------------------------------------
// Who is selling
// ---------------------------------------------------------------------------

export type SellerKind =
  | "owner"
  | "agent"
  | "developer"
  | "broker"
  | "property_manager";

export const SELLER_KINDS: {
  value: SellerKind;
  label: string;
  emoji: string;
  /** What the buyer learns from it. */
  blurb: string;
}[] = [
  {
    value: "owner",
    label: "Owner",
    emoji: "🏠",
    blurb: "You own this property and can agree a price yourself.",
  },
  {
    value: "agent",
    label: "Agent",
    emoji: "🏢",
    blurb: "You are marketing it on behalf of the owner.",
  },
  {
    value: "developer",
    label: "Developer",
    emoji: "🏗",
    blurb: "You built it, or are building it.",
  },
  {
    value: "broker",
    label: "Broker",
    emoji: "🤝",
    blurb: "You introduce buyers and sellers for a commission.",
  },
  {
    value: "property_manager",
    label: "Property Manager",
    emoji: "🔑",
    blurb: "You manage it for the owner, usually a rental.",
  },
];

export function sellerBadge(kind: SellerKind | null) {
  if (!kind) return null;
  return SELLER_KINDS.find((entry) => entry.value === kind) ?? null;
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export type ListingBadge = {
  id: string;
  label: string;
  tone: "seller" | "verified" | "premium" | "demo";
  title: string;
};

/**
 * Every badge a listing carries.
 *
 * Deliberately keeps "verified seller" and "verified listing" apart: a
 * verified agent can still post a property nobody has been to see, and
 * collapsing the two would let the first vouch for the second.
 */
export function listingBadges({
  sellerKind,
  listingVerified,
  sellerVerified,
  isPremium,
  isCompany,
  isSample,
}: {
  sellerKind: SellerKind | null;
  listingVerified: boolean;
  sellerVerified: boolean;
  isPremium: boolean;
  isCompany?: boolean;
  /** Sample data placed to populate the marketplace. Never a real listing. */
  isSample?: boolean;
}): ListingBadge[] {
  const badges: ListingBadge[] = [];

  // First, always, and before anything else this listing might claim about
  // itself. Somebody scanning a grid of cards reads the first badge and stops;
  // a DEMO label after "Verified Agent" and "Premium" is a label that has
  // already failed. The database refuses the combination of sample and
  // verified (0043), so the two cannot appear together — but the ordering is
  // what makes it legible when a sample sits beside a real listing.
  if (isSample) {
    badges.push({
      id: "demo",
      label: "DEMO",
      tone: "demo",
      title:
        "Sample data used to demonstrate Medosha. Not a real property, not a real agent, and not for sale.",
    });
  }

  const seller = sellerBadge(sellerKind);
  if (seller) {
    badges.push({
      id: "seller",
      label: `${seller.emoji} ${seller.label}`,
      tone: "seller",
      title: seller.blurb,
    });
  }

  if (sellerVerified) {
    const who = isCompany
      ? "Company"
      : sellerKind === "developer"
        ? "Developer"
        : sellerKind === "agent"
          ? "Agent"
          : "Owner";
    badges.push({
      id: "seller-verified",
      label: `Verified ${who}`,
      tone: "verified",
      title: "Medosha has checked this seller's identity.",
    });
  }

  if (listingVerified) {
    badges.push({
      id: "listing-verified",
      label: "Verified Listing",
      tone: "verified",
      title: "Medosha has checked this listing against its documents.",
    });
  }

  if (isPremium) {
    badges.push({
      id: "premium",
      label: "Premium",
      tone: "premium",
      title: "A promoted listing. It appears higher in results.",
    });
  }

  return badges;
}

// ---------------------------------------------------------------------------
// Contact
// ---------------------------------------------------------------------------

export type ContactMethod = "call" | "whatsapp" | "message" | "email";

export const CONTACT_METHODS: { value: ContactMethod; label: string }[] = [
  { value: "call", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "message", label: "Medosha message" },
  { value: "email", label: "Email" },
];

/**
 * An Ethiopian mobile number in the form WhatsApp expects.
 *
 * People write 0911234567, +251911234567 and 251911234567 interchangeably.
 * wa.me accepts only the last, digits with no plus, so the leading zero is
 * swapped for the country code rather than stripped — dropping it produces a
 * number that dials someone else.
 */
export function whatsappNumber(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;

  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("251")) return digits;
  if (digits.startsWith("0")) return `251${digits.slice(1)}`;
  // A bare 9 digits is the local form without its zero.
  if (digits.length === 9) return `251${digits}`;
  return digits;
}

export function whatsappHref(raw: string, message?: string): string | null {
  const number = whatsappNumber(raw);
  if (!number) return null;
  const text = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${number}${text}`;
}

export function telHref(raw: string): string {
  return `tel:${raw.replace(/[^\d+]/g, "")}`;
}

// ---------------------------------------------------------------------------
// Map markers
// ---------------------------------------------------------------------------

export type PropertyTypeName =
  | "house"
  | "villa"
  | "apartment"
  | "condominium"
  | "land"
  | "commercial"
  | "office"
  | "warehouse"
  | "shop"
  | "other";

/**
 * The marker for a property type.
 *
 * Drawn as an inline SVG data URL rather than a fetched image: a map with 300
 * pins would otherwise make 300 requests for six distinct icons, and each one
 * is a chance for a blank marker on a bad connection.
 */
export const MARKER_ICONS: Record<string, { emoji: string; label: string; colour: string }> = {
  house: { emoji: "🏠", label: "House", colour: "#2563eb" },
  villa: { emoji: "🏡", label: "Villa", colour: "#2563eb" },
  apartment: { emoji: "🏢", label: "Apartment", colour: "#7c3aed" },
  condominium: { emoji: "🏘", label: "Condominium", colour: "#7c3aed" },
  land: { emoji: "🌍", label: "Land", colour: "#16a34a" },
  commercial: { emoji: "🏬", label: "Commercial", colour: "#ea580c" },
  office: { emoji: "🏛", label: "Office", colour: "#0891b2" },
  warehouse: { emoji: "🏭", label: "Warehouse", colour: "#64748b" },
  shop: { emoji: "🛍", label: "Shop", colour: "#ea580c" },
  other: { emoji: "📍", label: "Property", colour: "#2563eb" },
};

type MarkerIcon = { emoji: string; label: string; colour: string };

/** Never undefined: an unknown type falls back to the generic pin. */
const FALLBACK_MARKER: MarkerIcon = MARKER_ICONS.other ?? {
  emoji: "📍",
  label: "Property",
  colour: "#2563eb",
};

export function markerFor(type: string | null): MarkerIcon {
  return MARKER_ICONS[type ?? "other"] ?? FALLBACK_MARKER;
}

/** A pin, as an SVG data URL the map can use directly. */
export function markerDataUrl(type: string | null, premium = false): string {
  const marker = markerFor(type);
  const ring = premium ? '<circle cx="16" cy="16" r="15" fill="none" stroke="#f59e0b" stroke-width="2"/>' : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="42" viewBox="0 0 34 42">
    <path d="M17 41C17 41 32 25.5 32 16A15 15 0 1 0 2 16c0 9.5 15 25 15 25z" fill="${marker.colour}" stroke="white" stroke-width="2"/>
    <circle cx="17" cy="16" r="9" fill="white" opacity="0.95"/>
    <text x="17" y="21" font-size="11" text-anchor="middle">${marker.emoji}</text>
    ${ring}
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

/** What the browser will accept, HEIC included. */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export const MAX_PHOTOS = 30;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

/** The longest edge a listing photo is stored at. */
export const PHOTO_MAX_EDGE = 2000;
export const THUMB_MAX_EDGE = 400;

export type PhotoIssue = {
  level: "error" | "warn";
  message: string;
};

/**
 * What is wrong with a photo, judged from the pixels alone.
 *
 * Runs in the browser before anything is uploaded, so a dark or tiny photo is
 * caught while the seller is still standing in the room and can take another —
 * which is the only moment the advice is useful. Nothing here blocks the
 * upload; a bad photo of the right house still beats no photo.
 */
export function judgePhoto({
  width,
  height,
  brightness,
  sharpness,
}: {
  width: number;
  height: number;
  /** Mean luma, 0-255. */
  brightness: number;
  /** Mean absolute Laplacian. Low means soft or out of focus. */
  sharpness: number;
}): { score: number; issues: PhotoIssue[] } {
  const issues: PhotoIssue[] = [];
  let score = 100;

  const edge = Math.max(width, height);
  if (edge < 800) {
    issues.push({ level: "error", message: "Too small — under 800px. It will look blurred on a phone." });
    score -= 40;
  } else if (edge < 1200) {
    issues.push({ level: "warn", message: "A little small. 1600px or more looks noticeably better." });
    score -= 15;
  }

  if (brightness < 55) {
    issues.push({ level: "warn", message: "Very dark. Open the curtains or turn the lights on." });
    score -= 20;
  } else if (brightness > 215) {
    issues.push({ level: "warn", message: "Overexposed — the windows are blown out." });
    score -= 15;
  }

  if (sharpness < 4) {
    issues.push({ level: "warn", message: "Looks soft or out of focus." });
    score -= 20;
  }

  const ratio = width / height;
  if (ratio < 0.5 || ratio > 2.6) {
    issues.push({ level: "warn", message: "An unusual shape. It will be cropped in the gallery." });
    score -= 10;
  }

  // A photo with a hard problem never reads as merely "Usable". Deductions
  // alone let a 400px image land on 60 — the same score as a slightly dark
  // one — and the seller reasonably concludes it will do.
  if (issues.some((issue) => issue.level === "error")) {
    score = Math.min(score, 35);
  }

  return { score: Math.max(0, Math.min(100, score)), issues };
}

export function qualityLabel(score: number): { label: string; tone: string } {
  if (score >= 85) return { label: "Good", tone: "text-emerald-600 dark:text-emerald-400" };
  if (score >= 60) return { label: "Usable", tone: "text-muted-foreground" };
  if (score >= 40) return { label: "Weak", tone: "text-amber-600 dark:text-amber-400" };
  return { label: "Poor", tone: "text-rose-600 dark:text-rose-400" };
}
