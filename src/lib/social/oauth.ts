import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { PLATFORM_SPECS, type SocialPlatform } from "./platforms";

/**
 * Connecting a social account, for real.
 *
 * Official OAuth only. Medosha never sees a password, never asks for one, and
 * there is no field anywhere in this application that would accept one — a
 * screen asking for a Facebook password is a phishing page regardless of who
 * wrote it or why.
 *
 * ## What is written from documentation rather than from a live call
 *
 * Every endpoint, parameter and scope below comes from the platforms' own
 * published API contracts. None of it has been exercised against the live
 * services from here: that needs an approved app, which is paperwork with Meta
 * and TikTok rather than code. `scripts/social-doctor.ts` performs the live
 * checks on a machine that has the credentials, and it is the thing that
 * decides whether this is right — not my confidence in it.
 *
 * Where a platform's behaviour is version-sensitive, the version is a constant
 * at the top rather than buried in a URL, so moving to the next Graph API
 * release is one edit.
 */

/**
 * The Graph API version.
 *
 * Pinned, deliberately. An unversioned Graph URL silently follows Meta's
 * default, which changes, and the first sign is a publish that used to work
 * returning a parameter error at three in the morning.
 */
const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/* -------------------------------------------------------------------------- */
/* Scopes                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * What each platform is asked for.
 *
 * Deliberately minimal. Every scope here has to be justified in app review,
 * and asking for one Medosha does not use is both a slower review and a
 * broader grant than the user agreed to.
 *
 *   pages_show_list        — to list the Pages somebody manages, so they can
 *                            choose which one to post to.
 *   pages_manage_posts     — to publish to it.
 *   pages_read_engagement  — required alongside manage_posts by Meta.
 *   instagram_basic        — to find the Instagram account behind the Page.
 *   instagram_content_publish — to publish to it.
 *   business_management    — not requested. Medosha does not manage anybody's
 *                            business assets and does not want the liability.
 */
const SCOPES: Record<SocialPlatform, string[]> = {
  medosha: [],
  facebook: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"],
  instagram: [
    "pages_show_list",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_content_publish",
  ],
  tiktok: ["user.info.basic", "video.publish"],
};

/* -------------------------------------------------------------------------- */
/* Credentials                                                                */
/* -------------------------------------------------------------------------- */

type Credentials = { id: string; secret: string };

/**
 * The app's own credentials, or null when this deployment has none.
 *
 * Null is the ordinary case on a fresh install and is not an error: the
 * connection UI shows "not available yet" and names the variables. What must
 * never happen is a half-configured platform — an id with no secret produces
 * an OAuth redirect that fails at the token step, after the user has already
 * granted access, which is the most confusing possible place to fail.
 */
export function credentialsFor(platform: SocialPlatform): Credentials | null {
  if (platform === "facebook" || platform === "instagram") {
    const id = process.env.FACEBOOK_APP_ID?.trim();
    const secret = process.env.FACEBOOK_APP_SECRET?.trim();
    return id && secret ? { id, secret } : null;
  }

  if (platform === "tiktok") {
    const id = process.env.TIKTOK_CLIENT_KEY?.trim();
    const secret = process.env.TIKTOK_CLIENT_SECRET?.trim();
    return id && secret ? { id, secret } : null;
  }

  return null;
}

/**
 * Where the platform sends the browser back to.
 *
 * Must match the redirect URI registered with the platform *exactly*, down to
 * the trailing slash — this is the single commonest reason a first OAuth
 * attempt fails, and the error the platform returns says only "URL blocked".
 */
export function redirectUri(platform: SocialPlatform): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")
    .trim()
    .replace(/\/$/, "");
  return `${base}/api/social/callback/${platform}`;
}

/* -------------------------------------------------------------------------- */
/* CSRF state                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The `state` parameter, signed.
 *
 * Without it, anybody can send a logged-in Medosha user to the callback URL
 * with their *own* authorization code and silently attach their social account
 * to that user's Medosha account — after which the victim's posts publish to
 * the attacker's Page. That is a real, well-known attack on OAuth callbacks,
 * and the defence is that the callback must only accept a state it issued.
 *
 * Signed with the app secret rather than stored in a table: it needs to
 * survive one redirect and nothing else, and a row in a database for thirty
 * seconds of lifetime is a row that needs cleaning up forever.
 */
export function signState(payload: {
  platform: SocialPlatform;
  userId: string;
  nonce: string;
}): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function verifyState(
  state: string,
): { platform: string; userId: string; nonce: string } | null {
  const [body, signature] = state.split(".");
  if (!body || !signature) return null;

  const expected = sign(body);

  // Constant time, and length-safe: both sides are hex digests of a fixed
  // width, so a mismatch cannot be read from how long the comparison took.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function sign(body: string): string {
  // The secret used to sign is Medosha's own, not a platform's: a platform
  // secret can be rotated by somebody else, and a state that stops verifying
  // mid-rotation logs everybody out of a flow they were halfway through.
  const secret =
    process.env.OAUTH_STATE_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    "";
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}

/* -------------------------------------------------------------------------- */
/* Authorize                                                                  */
/* -------------------------------------------------------------------------- */

/** Where to send the browser to begin. */
export function authorizeUrl(
  platform: SocialPlatform,
  state: string,
): string | null {
  const credentials = credentialsFor(platform);
  if (!credentials) return null;

  if (platform === "facebook" || platform === "instagram") {
    const params = new URLSearchParams({
      client_id: credentials.id,
      redirect_uri: redirectUri(platform),
      state,
      scope: SCOPES[platform].join(","),
      response_type: "code",
    });
    return `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`;
  }

  if (platform === "tiktok") {
    const params = new URLSearchParams({
      client_key: credentials.id,
      redirect_uri: redirectUri(platform),
      state,
      scope: SCOPES[platform].join(","),
      response_type: "code",
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* Token exchange                                                             */
/* -------------------------------------------------------------------------- */

export type ConnectedAccount = {
  externalId: string;
  displayName: string;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scopes: string[];
  /** The Facebook Page an Instagram account posts through. */
  pageId: string | null;
  /**
   * Set when the grant completed but the account cannot actually publish.
   *
   * A personal Instagram account will finish OAuth and then refuse every
   * publish. Detecting it here means the connection card says "permission
   * required" with the fix, rather than the user discovering it when their
   * first scheduled post fails.
   */
  problem: string | null;
};

export class OAuthError extends Error {
  readonly userMessage: string;
  constructor(userMessage: string, technical: string) {
    super(technical);
    this.name = "OAuthError";
    this.userMessage = userMessage;
  }
}

/** Exchanges the authorization code for something Medosha can publish with. */
export async function exchangeCode(
  platform: SocialPlatform,
  code: string,
): Promise<ConnectedAccount> {
  if (platform === "facebook") return exchangeFacebook(code);
  if (platform === "instagram") return exchangeInstagram(code);
  if (platform === "tiktok") return exchangeTikTok(code);

  throw new OAuthError(
    "That platform cannot be connected.",
    `no exchange for ${platform}`,
  );
}

/* ---- Meta ---------------------------------------------------------------- */

/**
 * The user token, upgraded to a long-lived one.
 *
 * A short-lived token lasts about an hour. Storing it means every scheduled
 * post after the first hour fails, so the exchange for a 60-day token is not
 * an optimisation — it is what makes scheduling work at all.
 */
async function metaUserToken(
  platform: SocialPlatform,
  code: string,
): Promise<{ token: string; credentials: Credentials }> {
  const credentials = credentialsFor(platform);
  if (!credentials) {
    throw new OAuthError(
      "Facebook is not configured on this site.",
      "no credentials",
    );
  }

  const shortLived = await graph("/oauth/access_token", {
    client_id: credentials.id,
    client_secret: credentials.secret,
    redirect_uri: redirectUri(platform),
    code,
  });

  const short = (shortLived as { access_token?: string }).access_token;
  if (!short) {
    throw new OAuthError(
      "Facebook did not return an access token. Try connecting again.",
      JSON.stringify(shortLived).slice(0, 300),
    );
  }

  const longLived = await graph("/oauth/access_token", {
    grant_type: "fb_exchange_token",
    client_id: credentials.id,
    client_secret: credentials.secret,
    fb_exchange_token: short,
  });

  const token = (longLived as { access_token?: string }).access_token ?? short;
  return { token, credentials };
}

type Page = {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
};

/**
 * The Pages somebody manages.
 *
 * The Page access token that comes back here is the one publishing uses, and
 * it is *not* the user token. A Page token derived from a long-lived user
 * token does not expire, which is why `expiresAt` is null for Facebook — and
 * why using the user token to post would break in sixty days.
 */
async function metaPages(userToken: string): Promise<Page[]> {
  const response = await graph("/me/accounts", {
    access_token: userToken,
    fields: "id,name,access_token,picture{url}",
  });

  const pages = (response as { data?: Page[] }).data;
  return Array.isArray(pages) ? pages : [];
}

async function exchangeFacebook(code: string): Promise<ConnectedAccount> {
  const { token } = await metaUserToken("facebook", code);
  const pages = await metaPages(token);
  const page = pages[0];

  if (!page) {
    throw new OAuthError(
      "No Facebook Page was found on that account. Medosha publishes to a Page, " +
        "not to a personal profile — create a Page, or connect an account that manages one.",
      "no pages returned",
    );
  }

  return {
    externalId: page.id,
    displayName: page.name,
    avatarUrl: page.picture?.data?.url ?? null,
    // The Page token, not the user token. See `metaPages`.
    accessToken: page.access_token,
    refreshToken: null,
    // Page tokens from a long-lived user token do not expire.
    expiresAt: null,
    scopes: SCOPES.facebook,
    pageId: page.id,
    problem:
      pages.length > 1
        ? `${pages.length} Pages are available; Medosha connected "${page.name}". Disconnect and reconnect to change it.`
        : null,
  };
}

async function exchangeInstagram(code: string): Promise<ConnectedAccount> {
  const { token } = await metaUserToken("instagram", code);
  const pages = await metaPages(token);

  if (pages.length === 0) {
    throw new OAuthError(
      "No Facebook Page was found. An Instagram Professional account publishes " +
        "through the Page it is linked to, so the Page has to be connected too.",
      "no pages returned",
    );
  }

  // The Instagram account hangs off the Page, not off the user.
  for (const page of pages) {
    const linked = await graph(`/${page.id}`, {
      access_token: token,
      fields: "instagram_business_account{id,username,profile_picture_url}",
    });

    const account = (
      linked as {
        instagram_business_account?: {
          id?: string;
          username?: string;
          profile_picture_url?: string;
        };
      }
    ).instagram_business_account;

    if (account?.id) {
      return {
        externalId: account.id,
        displayName: account.username ?? page.name,
        avatarUrl: account.profile_picture_url ?? null,
        accessToken: page.access_token,
        refreshToken: null,
        expiresAt: null,
        scopes: SCOPES.instagram,
        pageId: page.id,
        problem: null,
      };
    }
  }

  // Every Page checked and none had an Instagram account behind it. This is
  // the personal-account case, and it is worth naming precisely: the user has
  // done everything the screen asked and it still will not work.
  throw new OAuthError(
    "No Instagram Professional account is linked to your Facebook Page. " +
      "Instagram's publishing API does not work with personal accounts — switch " +
      "the account to Business or Creator in the Instagram app, link it to your " +
      "Page, then connect again.",
    "no instagram_business_account on any page",
  );
}

/** A Graph API call. Throws with the platform's own message where there is one. */
async function graph(
  path: string,
  params: Record<string, string>,
): Promise<unknown> {
  const url = `${GRAPH}${path}?${new URLSearchParams(params)}`;

  const response = await fetch(url, {
    // A connection flow that hangs leaves the user on a blank page.
    signal: AbortSignal.timeout(20_000),
  });

  const payload = (await response.json().catch(() => null)) as {
    error?: { message?: string; type?: string; code?: number };
  } | null;

  if (!response.ok || payload?.error) {
    const message = payload?.error?.message ?? `HTTP ${response.status}`;
    throw new OAuthError(
      `Facebook refused the request: ${message}`,
      `${path} → ${message}`,
    );
  }

  return payload;
}

/* ---- TikTok -------------------------------------------------------------- */

async function exchangeTikTok(code: string): Promise<ConnectedAccount> {
  const credentials = credentialsFor("tiktok");
  if (!credentials) {
    throw new OAuthError(
      "TikTok is not configured on this site.",
      "no credentials",
    );
  }

  // TikTok's token endpoint takes form-encoded values, not JSON, and returns
  // the token at the top level rather than under `data` — unlike the rest of
  // its v2 API, which is the sort of inconsistency worth a comment.
  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(20_000),
    body: new URLSearchParams({
      client_key: credentials.id,
      client_secret: credentials.secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri("tiktok"),
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    open_id?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    throw new OAuthError(
      `TikTok refused the connection: ${payload?.error_description ?? `HTTP ${response.status}`}`,
      JSON.stringify(payload).slice(0, 300),
    );
  }

  const granted = (payload.scope ?? "").split(",").filter(Boolean);

  // A user can untick a scope on TikTok's consent screen. Without
  // `video.publish` the connection completes and can never post, so it is
  // recorded as a problem rather than as a working connection.
  const canPublish = granted.includes("video.publish");

  let displayName = "TikTok account";
  let avatarUrl: string | null = null;

  try {
    const info = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=display_name,avatar_url",
      {
        headers: { authorization: `Bearer ${payload.access_token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    const user = (await info.json().catch(() => null)) as {
      data?: { user?: { display_name?: string; avatar_url?: string } };
    } | null;
    displayName = user?.data?.user?.display_name ?? displayName;
    avatarUrl = user?.data?.user?.avatar_url ?? null;
  } catch {
    // The name is decoration. A connection that works but is labelled
    // "TikTok account" is better than a failed connection.
  }

  return {
    externalId: payload.open_id ?? "tiktok",
    displayName,
    avatarUrl,
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt: payload.expires_in
      ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
      : null,
    scopes: granted,
    pageId: null,
    problem: canPublish
      ? null
      : "TikTok did not grant permission to post. Reconnect and leave the posting permission ticked.",
  };
}

/* -------------------------------------------------------------------------- */
/* Refresh                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Refreshes a token that is close to expiry.
 *
 * Only TikTok needs it: Meta Page tokens derived from a long-lived user token
 * do not expire, and a refresh call for them would be a request that can only
 * fail. Returning null for those is the correct answer, not a gap.
 */
export async function refreshToken(
  platform: SocialPlatform,
  refresh: string,
): Promise<{ accessToken: string; refreshToken: string | null; expiresAt: string | null } | null> {
  if (platform !== "tiktok") return null;

  const credentials = credentialsFor("tiktok");
  if (!credentials) return null;

  const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(20_000),
    body: new URLSearchParams({
      client_key: credentials.id,
      client_secret: credentials.secret,
      grant_type: "refresh_token",
      refresh_token: refresh,
    }),
  });

  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  } | null;

  if (!response.ok || !payload?.access_token) return null;

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? refresh,
    expiresAt: payload.expires_in
      ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
      : null,
  };
}

/** The scopes a platform is asked for, for the connection screen. */
export function scopesFor(platform: SocialPlatform): string[] {
  return SCOPES[platform];
}

/** Everything the connection card needs, with no secrets in it. */
export function connectionInfo(platform: SocialPlatform) {
  const spec = PLATFORM_SPECS[platform];
  return {
    platform,
    label: spec.label,
    configured: credentialsFor(platform) !== null,
    requirements: spec.requirements,
    docs: spec.docs,
    scopes: SCOPES[platform],
    redirectUri: redirectUri(platform),
  };
}
