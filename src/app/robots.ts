import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/**
 * robots.txt.
 *
 * Everything public is crawlable. The disallowed paths are either private
 * (dashboard, messages, settings) or produce infinite crawl surface with
 * nothing durable behind it (search results, auth callbacks, API routes).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/auth/",
        "/search",
        "/dashboard",
        "/messages",
        "/notifications",
        "/settings",
        "/profile/edit",
        "/saved",
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
