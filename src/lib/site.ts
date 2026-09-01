/**
 * The canonical origin, used by metadata, the sitemap and robots.txt.
 *
 * Read from the environment so a preview deployment does not advertise the
 * production URL — a canonical tag pointing at the wrong host is worse than
 * none at all. Vercel supplies VERCEL_PROJECT_PRODUCTION_URL without a scheme.
 */
export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

export const SITE_NAME = "Medosha";
export const SITE_DESCRIPTION =
  "Medosha connects every person and company in construction — architects, contractors, suppliers, and developers — in one platform.";
