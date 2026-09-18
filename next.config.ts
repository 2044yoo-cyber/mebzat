import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseHost = supabaseUrl ? new URL(supabaseUrl).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    // Allow SVGs (the branded fallback placeholder, and any SVG a user
    // uploads as a company logo) but neutralize them: served as attachments
    // under a sandbox CSP that blocks scripts, per Next.js guidance.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      ...(supabaseHost
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHost,
              pathname: "/storage/v1/object/public/**",
            },
            // Signed objects from the private buckets. Agenda's site photos
            // live in one — a photograph of a client's building and its
            // progress is not something an unlisted URL is a permission for —
            // so they are served as `/object/sign/...` with an expiry, and the
            // optimiser has to be told that path exists as well as the public
            // one. Same host either way: this widens the path, not the origin.
            {
              protocol: "https" as const,
              hostname: supabaseHost,
              pathname: "/storage/v1/object/sign/**",
            },
          ]
        : []),
      // Placeholder image hosts used by the development seed dataset only:
      // pollinations serves context-matched images from a keyword prompt,
      // dicebear serves generated avatars. See scripts/lib/images.ts.
      { protocol: "https" as const, hostname: "image.pollinations.ai" },
      { protocol: "https" as const, hostname: "api.dicebear.com" },
    ],
  },
};

export default nextConfig;
