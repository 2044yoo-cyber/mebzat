import "server-only";

import type { PublishResult } from "./publishers";

/**
 * The actual calls to Facebook, Instagram and TikTok.
 *
 * Written from each platform's published contract. Not exercised against the
 * live services from here — that needs an approved app — so
 * `scripts/social-doctor.ts` is what decides whether these are right, run on a
 * machine that has the credentials.
 *
 * Everything here returns a `PublishResult` rather than throwing. A publish
 * run touches several platforms and one failing must not stop the others, so
 * the failure is a value the caller records, not an exception it has to catch.
 *
 * ## The rule about error text
 *
 * A platform's error body is written for a developer and frequently echoes the
 * request back — including the access token in the query string. None of it
 * reaches a user. Each function below maps the platform's code to a sentence
 * somebody can act on, and puts the raw body in the server log.
 */

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Publishing is slow — Instagram fetches the image itself — but not endless. */
const TIMEOUT_MS = 60_000;

type GraphError = {
  message?: string;
  code?: number;
  error_subcode?: number;
  type?: string;
};

/* -------------------------------------------------------------------------- */
/* Facebook                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A post on a Facebook Page.
 *
 * Two endpoints, chosen by whether there is a picture. `/photos` with a `url`
 * makes Facebook fetch the image and attach it; `/feed` posts text. Posting to
 * `/feed` with a `link` would give a link preview instead of a photo, which is
 * not what a property advertisement wants.
 */
export async function publishFacebook(input: {
  pageId: string;
  accessToken: string;
  message: string;
  imageUrl: string | null;
}): Promise<PublishResult> {
  const usePhoto = isPubliclyFetchable(input.imageUrl);

  const endpoint = usePhoto
    ? `${GRAPH}/${input.pageId}/photos`
    : `${GRAPH}/${input.pageId}/feed`;

  const body = new URLSearchParams(
    usePhoto
      ? {
          url: input.imageUrl!,
          caption: input.message,
          access_token: input.accessToken,
        }
      : { message: input.message, access_token: input.accessToken },
  );

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      post_id?: string;
      error?: GraphError;
    } | null;

    if (!response.ok || payload?.error) {
      return graphFailure("Facebook", payload?.error, response.status);
    }

    // `/photos` returns the photo id and `post_id`; `/feed` returns the post
    // id in `id`. The post id is the one that links to something a person can
    // read, so it wins where both exist.
    const id = payload?.post_id ?? payload?.id ?? null;

    return {
      ok: true,
      externalPostId: id,
      externalUrl: id ? `https://www.facebook.com/${id}` : null,
    };
  } catch (error) {
    return networkFailure("Facebook", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Instagram                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * An Instagram post, in the two steps the API requires.
 *
 *   1. Create a media container from an image URL and a caption.
 *   2. Publish that container.
 *
 * Between them the container has to finish processing. Instagram fetches the
 * image from *your* server, so this waits on something outside Medosha's
 * control — publishing a container that is still `IN_PROGRESS` fails, and
 * publishing one that is `ERROR` fails differently.
 *
 * There is no text-only post. A caption with no image cannot be published at
 * all, which is why this refuses early rather than letting the platform do it.
 */
export async function publishInstagram(input: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrl: string | null;
}): Promise<PublishResult> {
  if (!isPubliclyFetchable(input.imageUrl)) {
    return {
      ok: false,
      error:
        "Instagram needs an image at a public HTTPS address — it fetches the " +
        "picture from your site rather than receiving it. This post has no " +
        "such image.",
      code: "image_required",
      retryable: false,
    };
  }

  try {
    const created = await fetch(`${GRAPH}/${input.igUserId}/media`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: new URLSearchParams({
        image_url: input.imageUrl!,
        caption: input.caption,
        access_token: input.accessToken,
      }),
    });

    const container = (await created.json().catch(() => null)) as {
      id?: string;
      error?: GraphError;
    } | null;

    if (!created.ok || container?.error || !container?.id) {
      return graphFailure("Instagram", container?.error, created.status);
    }

    const ready = await waitForContainer(container.id, input.accessToken);
    if (!ready.ok) return ready;

    const published = await fetch(`${GRAPH}/${input.igUserId}/media_publish`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: new URLSearchParams({
        creation_id: container.id,
        access_token: input.accessToken,
      }),
    });

    const result = (await published.json().catch(() => null)) as {
      id?: string;
      error?: GraphError;
    } | null;

    if (!published.ok || result?.error || !result?.id) {
      return graphFailure("Instagram", result?.error, published.status);
    }

    return {
      ok: true,
      externalPostId: result.id,
      externalUrl: null,
    };
  } catch (error) {
    return networkFailure("Instagram", error);
  }
}

/**
 * Waits for a media container to finish.
 *
 * Polls rather than sleeping a fixed time: a 200 KB JPEG is ready almost at
 * once and a large one is not, and a fixed wait is either too slow for the
 * common case or too short for the one that matters.
 */
async function waitForContainer(
  containerId: string,
  accessToken: string,
): Promise<{ ok: true } | (PublishResult & { ok: false })> {
  const deadline = Date.now() + 45_000;
  let delay = 1_000;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    // Backs off, capped. Ten requests a second at the start would be rate
    // limited before the image had finished downloading.
    delay = Math.min(delay * 1.6, 6_000);

    const response = await fetch(
      `${GRAPH}/${containerId}?fields=status_code,status&access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(15_000) },
    );

    const payload = (await response.json().catch(() => null)) as {
      status_code?: string;
      status?: string;
      error?: GraphError;
    } | null;

    if (payload?.status_code === "FINISHED") return { ok: true };

    if (payload?.status_code === "ERROR" || payload?.status_code === "EXPIRED") {
      console.error(
        `[medosha-social] instagram container ${payload.status_code}: ${payload.status ?? ""}`,
      );
      return {
        ok: false,
        error:
          "Instagram could not process the image. Check that it is a JPEG at a " +
          "public HTTPS address, under 8 MB, and with an aspect ratio between " +
          "4:5 and 1.91:1.",
        code: payload.status_code,
        retryable: false,
      };
    }
  }

  return {
    ok: false,
    error:
      "Instagram did not finish processing the image in time. The post was not " +
      "published; try again.",
    code: "container_timeout",
    // Genuinely worth retrying — this is usually a slow fetch, not a bad image.
    retryable: true,
  };
}

/* -------------------------------------------------------------------------- */
/* TikTok                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * A TikTok photo post.
 *
 * ## The thing that will surprise somebody
 *
 * Until a TikTok app passes audit, every post it creates is private to the
 * creator — TikTok enforces `SELF_ONLY` regardless of what is requested. The
 * post succeeds, the API returns success, and nobody else can see it.
 *
 * So this reports it. A "published" badge on a post that is invisible to the
 * account's followers is a lie the publish log would otherwise tell, and the
 * user would find out weeks later.
 */
export async function publishTikTok(input: {
  accessToken: string;
  caption: string;
  imageUrl: string | null;
  /** False until the site owner's app has passed TikTok's audit. */
  audited: boolean;
}): Promise<PublishResult> {
  if (!isPubliclyFetchable(input.imageUrl)) {
    return {
      ok: false,
      error:
        "TikTok needs an image at a public HTTPS address on a domain verified " +
        "with TikTok. This post has no such image.",
      code: "image_required",
      retryable: false,
    };
  }

  try {
    const response = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/content/init/",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${input.accessToken}`,
          "content-type": "application/json; charset=UTF-8",
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        body: JSON.stringify({
          post_info: {
            title: input.caption.slice(0, 90),
            description: input.caption.slice(0, 4000),
            // Asked for honestly. An unaudited app has this forced to
            // SELF_ONLY by TikTok whatever is sent.
            privacy_level: input.audited
              ? "PUBLIC_TO_EVERYONE"
              : "SELF_ONLY",
            disable_comment: false,
          },
          source_info: {
            source: "PULL_FROM_URL",
            photo_cover_index: 0,
            photo_images: [input.imageUrl],
          },
          post_mode: "DIRECT_POST",
          media_type: "PHOTO",
        }),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      data?: { publish_id?: string };
      error?: { code?: string; message?: string };
    } | null;

    const code = payload?.error?.code;

    if (!response.ok || (code && code !== "ok")) {
      console.error(
        `[medosha-social] tiktok init failed: ${JSON.stringify(payload?.error)}`,
      );
      return {
        ok: false,
        error: tikTokMessage(code, payload?.error?.message),
        code: code ?? `http_${response.status}`,
        retryable: code === "rate_limit_exceeded",
      };
    }

    const publishId = payload?.data?.publish_id ?? null;

    return {
      ok: true,
      externalPostId: publishId,
      externalUrl: null,
      // Not a failure, but the user has to know. Carried up so the publish log
      // records it beside the success.
      note: input.audited
        ? undefined
        : "Published privately. TikTok restricts unaudited apps to posts only " +
          "the creator can see — your followers cannot see this yet.",
    };
  } catch (error) {
    return networkFailure("TikTok", error);
  }
}

function tikTokMessage(code: string | undefined, message: string | undefined): string {
  switch (code) {
    case "spam_risk_too_many_posts":
      return "TikTok has rate-limited this account for today. Try tomorrow.";
    case "spam_risk_user_banned_from_posting":
      return "TikTok has blocked this account from posting.";
    case "url_ownership_unverified":
      return (
        "The image's domain is not verified with TikTok. Add and verify the " +
        "domain in the TikTok developer console."
      );
    case "privacy_level_option_mismatch":
      return "TikTok rejected the privacy setting for this account.";
    case "access_token_invalid":
    case "scope_not_authorized":
      return "TikTok access has expired or was not granted. Reconnect the account.";
    default:
      return `TikTok refused the post${message ? `: ${message}` : "."}`;
  }
}

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Whether a platform can fetch this image.
 *
 * Both Instagram and TikTok download the picture from a URL rather than
 * accepting an upload, so a `data:` URL, a `blob:`, a relative path or a
 * `http://localhost` address cannot work — and each fails differently and
 * confusingly at the platform end. Checked here, once, where the message can
 * say what is actually wrong.
 */
function isPubliclyFetchable(url: string | null): boolean {
  if (!url) return false;
  if (!url.startsWith("https://")) return false;

  try {
    const host = new URL(url).hostname;
    // A publicly-resolvable host. `localhost` and private ranges are exactly
    // what a developer's first test produces, and the platform's error for it
    // is unhelpful.
    if (host === "localhost" || host.endsWith(".local")) return false;
    if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Maps a Graph error to something a user can act on. */
function graphFailure(
  platform: string,
  error: GraphError | undefined,
  status: number,
): PublishResult & { ok: false } {
  console.error(
    `[medosha-social] ${platform} graph error ${status}: ${JSON.stringify(error)}`,
  );

  const code = error?.code;

  // 190 is an invalid or expired token; 200 and 10 are permission problems;
  // 4 and 17 are rate limits. These are the ones worth naming — everything
  // else gets the platform's own message, which is usually adequate.
  if (code === 190) {
    return {
      ok: false,
      error: `${platform} access has expired. Reconnect the account in Settings.`,
      code: "token_expired",
      retryable: false,
    };
  }

  if (code === 200 || code === 10 || code === 3) {
    return {
      ok: false,
      error:
        `${platform} refused the post for want of a permission. The app may not ` +
        `yet be approved for publishing, or the account may not have granted it.`,
      code: "permission_denied",
      retryable: false,
    };
  }

  if (code === 4 || code === 17 || code === 32 || code === 613) {
    return {
      ok: false,
      error: `${platform} is rate-limiting this account. Try again later.`,
      code: "rate_limited",
      retryable: true,
    };
  }

  return {
    ok: false,
    error: `${platform} refused the post${error?.message ? `: ${error.message}` : "."}`,
    code: code ? String(code) : `http_${status}`,
    retryable: status >= 500,
  };
}

function networkFailure(
  platform: string,
  error: unknown,
): PublishResult & { ok: false } {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[medosha-social] ${platform} network failure: ${message}`);

  const timedOut = /abort|timeout/i.test(message);

  return {
    ok: false,
    error: timedOut
      ? `${platform} took too long to answer. The post may or may not have gone out — check the account before retrying.`
      : `Medosha could not reach ${platform}. Try again.`,
    code: timedOut ? "timeout" : "network",
    // A timeout is deliberately NOT retryable: the request may have succeeded
    // on the platform's side, and retrying would double-post. The idempotency
    // key stops that within a slot, but a human should look first.
    retryable: !timedOut,
  };
}
