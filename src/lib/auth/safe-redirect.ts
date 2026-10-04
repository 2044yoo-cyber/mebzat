/**
 * Somewhere on Medosha, and nowhere else.
 *
 * Where to go after signing in arrives in a query string, which means it
 * arrives from whoever wrote the link. Interpolating it into a redirect
 * unchecked is an open redirect: a value of `//evil.example` produces
 * `https://medosha.net//evil.example`, which browsers read as
 * protocol-relative and follow off-site — landing somebody on a stranger's
 * page moments after signing in, still trusting the flow they started. That is
 * a convincing way to phish a member.
 *
 * So: one leading slash, no second slash, no scheme, no backslash. Anything
 * else falls back.
 *
 * Written once and shared. The Google callback guarded its `next`; the
 * password sign-in redirected to whatever was in its hidden input, and the
 * hidden input came from the query string. Two implementations of one rule is
 * how the second one comes to be missing.
 */
export const DEFAULT_AFTER_SIGN_IN = "/dashboard";

export function safeRedirect(
  raw: string | null | undefined,
  fallback: string = DEFAULT_AFTER_SIGN_IN,
): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/")) return fallback;
  // `//host` is protocol-relative; `/\host` is the same trick with a
  // backslash, which some browsers normalise into a forward slash.
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (raw.includes("://")) return fallback;
  return raw;
}
