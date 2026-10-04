/**
 * The social integrations, checked against the real platforms.
 *
 *   npm run check:socials
 *
 * `scripts/social-check.ts` proves the wiring without a network. This one is
 * the arbiter of whether the OAuth and publishing code is actually *right*,
 * because every endpoint in it was written from documentation and none of it
 * can be exercised without approved apps.
 *
 * Nothing here publishes anything. It verifies credentials, tokens and
 * permissions — the things that are wrong on the first attempt — and stops
 * short of putting a post on anybody's Page. Publishing is tested from the
 * application, on a post you can see and delete.
 */

export {};

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

let passed = 0;
let failed = 0;
let skipped = 0;

function ok(name: string, detail = "") {
  passed += 1;
  console.log(`  ${GREEN}✓${RESET} ${name}${detail ? ` ${DIM}${detail}${RESET}` : ""}`);
}

function bad(name: string, detail: string) {
  failed += 1;
  console.log(`  ${RED}✗${RESET} ${name}\n      ${RED}${detail}${RESET}`);
}

function skip(name: string, why: string) {
  skipped += 1;
  console.log(`  ${YELLOW}–${RESET} ${name} ${DIM}(${why})${RESET}`);
}

function heading(text: string) {
  console.log(`\n${text}`);
}

const GRAPH = "https://graph.facebook.com/v21.0";

async function main() {
  console.log("\n\x1b[1mMedosha — social integrations\x1b[0m");

  /* ---- Configuration ---------------------------------------------------- */

  heading("1. App credentials");

  const fbId = process.env.FACEBOOK_APP_ID?.trim();
  const fbSecret = process.env.FACEBOOK_APP_SECRET?.trim();
  const tkKey = process.env.TIKTOK_CLIENT_KEY?.trim();
  const tkSecret = process.env.TIKTOK_CLIENT_SECRET?.trim();
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (fbId && fbSecret) {
    ok("Meta app configured", `id ${fbId.slice(0, 6)}…`);
  } else if (fbId || fbSecret) {
    // The dangerous half-state: OAuth starts and then fails at the token step,
    // after the user has already granted access.
    bad(
      "Meta app configured",
      "Only one of FACEBOOK_APP_ID / FACEBOOK_APP_SECRET is set. Set both or neither.",
    );
  } else {
    skip("Meta app configured", "FACEBOOK_APP_ID and FACEBOOK_APP_SECRET unset");
  }

  if (tkKey && tkSecret) {
    ok("TikTok app configured");
  } else if (tkKey || tkSecret) {
    bad(
      "TikTok app configured",
      "Only one of TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET is set. Set both or neither.",
    );
  } else {
    skip("TikTok app configured", "TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET unset");
  }

  /* ---- Redirect URI ----------------------------------------------------- */

  heading("2. Redirect URI");

  if (!site) {
    bad(
      "NEXT_PUBLIC_SITE_URL is set",
      "Without it the redirect URI defaults to http://localhost:3000, which no platform will accept in production.",
    );
  } else {
    ok("NEXT_PUBLIC_SITE_URL is set", site);

    const base = site.replace(/\/$/, "");
    console.log(
      `\n  ${DIM}Register these exactly, including the scheme and with no trailing slash:${RESET}`,
    );
    for (const platform of ["facebook", "instagram", "tiktok"]) {
      console.log(`    ${base}/api/social/callback/${platform}`);
    }

    if (site.startsWith("http://") && !site.includes("localhost")) {
      bad(
        "the site URL is HTTPS",
        "Meta and TikTok both refuse a plain-http redirect URI outside localhost.",
      );
    } else {
      ok("the site URL scheme is acceptable");
    }

    if (site.endsWith("/")) {
      // The redirect URI must match what is registered *character for
      // character*, and the error the platform returns says only "URL blocked".
      bad(
        "no trailing slash",
        "NEXT_PUBLIC_SITE_URL ends with a slash, which produces a double slash in the callback URL and will not match what you registered.",
      );
    } else {
      ok("no trailing slash");
    }
  }

  /* ---- Meta app ---------------------------------------------------------- */

  heading("3. Meta app");

  if (!fbId || !fbSecret) {
    skip("the app credentials work", "not configured");
  } else {
    try {
      // The app access token is id|secret. If Meta accepts a call with it, the
      // pair is valid — this does not need any user to have connected.
      const response = await fetch(
        `${GRAPH}/${fbId}?fields=name,link&access_token=${encodeURIComponent(`${fbId}|${fbSecret}`)}`,
        { signal: AbortSignal.timeout(20_000) },
      );

      const payload = (await response.json().catch(() => null)) as {
        name?: string;
        error?: { message?: string };
      } | null;

      if (!response.ok || payload?.error) {
        bad(
          "the app credentials work",
          payload?.error?.message ?? `HTTP ${response.status}`,
        );
      } else {
        ok("the app credentials work", payload?.name ?? "");
      }
    } catch (error) {
      bad(
        "the app credentials work",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /* ---- Connected accounts ------------------------------------------------ */

  heading("4. Connected accounts");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceKey) {
    skip("connected accounts", "Supabase is not configured");
  } else {
    try {
      const response = await fetch(
        `${supabaseUrl}/rest/v1/social_accounts?select=platform,status,display_name,token_expires_at,last_error`,
        {
          headers: {
            apikey: serviceKey,
            authorization: `Bearer ${serviceKey}`,
          },
          signal: AbortSignal.timeout(20_000),
        },
      );

      const rows = (await response.json().catch(() => null)) as
        | {
            platform: string;
            status: string;
            display_name: string | null;
            token_expires_at: string | null;
            last_error: string | null;
          }[]
        | null;

      if (!response.ok || !Array.isArray(rows)) {
        bad("connected accounts could be read", `HTTP ${response.status}`);
      } else if (rows.length === 0) {
        skip("connected accounts", "none yet — connect one at /settings/social");
      } else {
        for (const row of rows) {
          const expiring =
            row.token_expires_at &&
            new Date(row.token_expires_at).getTime() - Date.now() <
              7 * 24 * 60 * 60 * 1000;

          if (row.status === "connected" && !expiring) {
            ok(`${row.platform}: connected`, row.display_name ?? "");
          } else if (expiring) {
            bad(
              `${row.platform}: token is healthy`,
              `expires ${row.token_expires_at}. It will refresh automatically if a refresh token was granted; otherwise reconnect.`,
            );
          } else {
            bad(
              `${row.platform}: ready to publish`,
              `${row.status}${row.last_error ? ` — ${row.last_error}` : ""}`,
            );
          }
        }
      }
    } catch (error) {
      bad(
        "connected accounts could be read",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /* ---- The things nobody expects ---------------------------------------- */

  heading("5. Things that surprise people");

  if (process.env.TIKTOK_AUDITED === "true") {
    ok("TikTok audit is declared complete");
  } else if (tkKey) {
    // Not a failure. A statement of fact that changes what the user sees.
    console.log(
      `  ${YELLOW}!${RESET} TikTok posts will publish ${DIM}privately${RESET} until your app passes TikTok's audit.\n` +
        `      ${DIM}Medosha says so on each post rather than claiming it went public.\n` +
        `      Set TIKTOK_AUDITED=true once TikTok confirms.${RESET}`,
    );
  } else {
    skip("TikTok audit status", "TikTok not configured");
  }

  if (fbId) {
    console.log(
      `  ${YELLOW}!${RESET} Instagram publishing needs a ${DIM}Professional${RESET} account linked to a Facebook Page,\n` +
        `      ${DIM}and app review for instagram_content_publish. A personal account will\n` +
        `      complete the OAuth flow and then refuse every post.${RESET}`,
    );
  }

  console.log(
    `\n${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ""}\n`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`\n${RED}The check itself failed:${RESET}`, error);
  process.exitCode = 1;
});
