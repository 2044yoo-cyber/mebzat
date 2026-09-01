/**
 * The platforms a post can go to, and what each one needs.
 *
 * Client-safe: the connection UI, the platform picker and the preview all read
 * this. No keys, no endpoints, no tokens — those are server-side, in
 * `publishers.ts`.
 *
 * ## Requirements are stated, not discovered
 *
 * Every entry below carries `requirements`, and they are shown in the
 * connection UI before somebody clicks Connect rather than after the OAuth
 * round trip fails. This is not politeness. Instagram's Content Publishing API
 * needs a Professional account linked to a Facebook Page, inside a Meta app
 * that has passed review for `instagram_content_publish`. A user with a
 * personal Instagram account can complete the entire OAuth flow, see
 * "Connected", and get a permissions error on their first post — and the
 * honest place to tell them is the screen where they choose.
 */

export const SOCIAL_PLATFORMS = [
  "medosha",
  "facebook",
  "instagram",
  "tiktok",
] as const;

export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export type PlatformSpec = {
  id: SocialPlatform;
  label: string;
  /** How the generator should write for it. Also shown under the preview. */
  voice: string;
  /** Hard limit the platform enforces on caption length. */
  maxLength: number;
  /** What the generator should aim for, which is well under the limit. */
  targetLength: number;
  /** Hashtags that actually help here. Instagram is not Facebook. */
  hashtagCount: number;
  /** A post without a picture is not publishable on these. */
  requiresImage: boolean;
  /**
   * Environment variables the server needs before this platform can publish.
   *
   * Empty for Medosha, which is this application. A platform whose variables
   * are unset reports "Not configured" rather than offering a Connect button
   * that leads to a broken OAuth redirect.
   */
  credentialVars: string[];
  /** Told to the user before they connect. */
  requirements: string[];
  /** The official documentation, so nobody has to take my word for it. */
  docs: string | null;
};

export const PLATFORM_SPECS: Record<SocialPlatform, PlatformSpec> = {
  medosha: {
    id: "medosha",
    label: "Medosha",
    voice:
      "The full post for Medosha's own community feed. Longest of the four. " +
      "Include the detail a buyer or a contractor actually needs, and link " +
      "back to the listing, product or profile it is about.",
    maxLength: 20_000,
    targetLength: 900,
    hashtagCount: 4,
    requiresImage: false,
    credentialVars: [],
    requirements: [],
    docs: null,
  },

  facebook: {
    id: "facebook",
    label: "Facebook",
    voice:
      "A Facebook Page post. Room to explain: lead with the offer, give the " +
      "useful specifics in short paragraphs, finish with the call to action. " +
      "Hashtags are not the point here — a couple at most.",
    // Facebook's own limit is 63,206. The practical one is the "See more"
    // fold, which is where a post stops being read.
    maxLength: 63_206,
    targetLength: 700,
    hashtagCount: 3,
    requiresImage: false,
    credentialVars: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
    requirements: [
      "A Facebook Page you manage — publishing to a personal profile is not available through the API.",
      "A Meta app with pages_manage_posts and pages_read_engagement, approved through App Review.",
      "The Page must be connected by someone with a Page admin or content-creator role.",
    ],
    docs: "https://developers.facebook.com/docs/pages-api/posts",
  },

  instagram: {
    id: "instagram",
    label: "Instagram",
    voice:
      "An Instagram caption. The image carries the message, so the words are " +
      "short and concrete: a hook in the first line, one or two lines of " +
      "substance, then the hashtags. No paragraphs.",
    maxLength: 2_200,
    targetLength: 400,
    hashtagCount: 12,
    // Instagram's Content Publishing API has no text-only post. A caption
    // without a picture cannot be published at all, which is why this is true
    // and why the publisher refuses rather than the platform doing it later.
    requiresImage: true,
    credentialVars: ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
    requirements: [
      "An Instagram Professional account — Business or Creator. Personal accounts cannot publish through the API.",
      "The account must be linked to a Facebook Page.",
      "A Meta app approved for instagram_content_publish and instagram_basic.",
      "Every post needs an image or video. Instagram has no text-only post.",
      "The image must be reachable at a public HTTPS URL — Instagram fetches it from your server, so a data URL will not do.",
    ],
    docs: "https://developers.facebook.com/docs/instagram-platform/content-publishing",
  },

  tiktok: {
    id: "tiktok",
    label: "TikTok",
    voice:
      "A TikTok caption. Open with the hook — the first six words decide " +
      "whether anybody reads the rest. Then one line, then hashtags. Written " +
      "to be read over a video, not instead of one.",
    maxLength: 2_200,
    targetLength: 150,
    hashtagCount: 6,
    requiresImage: true,
    credentialVars: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    requirements: [
      "A TikTok developer app with the Content Posting API enabled.",
      "Audit approval from TikTok before posts become public — until then every post publishes as private to the creator's own account, whatever this UI says.",
      "video.publish scope, and the domain verified with TikTok.",
      "Photo posts need an image URL on a verified domain; video posts need a video file.",
    ],
    docs: "https://developers.tiktok.com/doc/content-sharing-guidelines",
  },
};

/**
 * The connection states a platform card can be in.
 *
 * Five, not three, and the extra two are the ones that save a support email.
 * "Not configured" is the site owner's problem — no app credentials on the
 * server — and showing a user a Connect button for it wastes their time.
 * "Permission required" is the user's problem and has a specific fix.
 */
export type ConnectionState =
  | "not_configured"
  | "disconnected"
  | "connected"
  | "permission_required"
  | "expired"
  | "revoked"
  | "failed";

export function connectionLabel(state: ConnectionState): string {
  switch (state) {
    case "not_configured":
      return "Not available yet";
    case "disconnected":
      return "Connect";
    case "connected":
      return "Connected";
    case "permission_required":
      return "Permission required";
    case "expired":
      return "Reconnect";
    case "revoked":
      return "Access revoked";
    case "failed":
      return "Publishing failed";
  }
}

/** Whether a post can actually be sent in this state. */
export function canPublish(state: ConnectionState): boolean {
  return state === "connected";
}

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return (
    typeof value === "string" &&
    (SOCIAL_PLATFORMS as readonly string[]).includes(value)
  );
}

/**
 * The categories a post can be about.
 *
 * The generator is told which one applies so it writes like somebody who
 * knows the trade. Deliberately wider than construction — the brief listed
 * properties, architecture, services, marketplace and company news, and a
 * generator that only knows about concrete writes a bad post about a vanity
 * unit.
 */
export const CONTENT_CATEGORIES = [
  { id: "property_sale", label: "Property for sale", group: "Properties" },
  { id: "property_rent", label: "Rental listing", group: "Properties" },
  { id: "new_development", label: "New development", group: "Properties" },
  { id: "open_house", label: "Open house", group: "Properties" },
  { id: "price_announcement", label: "Price announcement", group: "Properties" },
  { id: "property_comparison", label: "Property comparison", group: "Properties" },

  { id: "construction_tip", label: "Construction tip", group: "Construction" },
  { id: "materials", label: "Materials", group: "Construction" },
  { id: "building_costs", label: "Building costs", group: "Construction" },
  { id: "project_update", label: "Project update", group: "Construction" },
  { id: "educational", label: "Educational post", group: "Construction" },

  { id: "architecture_project", label: "Architecture project", group: "Architecture" },
  { id: "design_concept", label: "Design concept", group: "Architecture" },
  { id: "render_showcase", label: "Render showcase", group: "Architecture" },
  { id: "before_after", label: "Before and after", group: "Architecture" },
  { id: "interior_design", label: "Interior design", group: "Architecture" },

  { id: "service_promotion", label: "Service promotion", group: "Services" },
  { id: "contractor", label: "Contractor", group: "Services" },
  { id: "finishing", label: "Finishing and fit-out", group: "Services" },

  { id: "product", label: "Product", group: "Marketplace" },
  { id: "equipment", label: "Equipment", group: "Marketplace" },

  { id: "company_announcement", label: "Company announcement", group: "Company" },
  { id: "achievement", label: "Achievement", group: "Company" },
  { id: "promotion", label: "Promotion or offer", group: "Company" },
] as const;

export type ContentCategory = (typeof CONTENT_CATEGORIES)[number]["id"];

export function categoryLabel(id: string): string {
  return CONTENT_CATEGORIES.find((entry) => entry.id === id)?.label ?? "Post";
}
