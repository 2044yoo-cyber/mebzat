import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { AdminControls } from "@/components/social/admin-controls";
import { isAdmin } from "@/lib/auth/admin";
import { hasCredentials } from "@/lib/social/settings";
import { SOCIAL_PLATFORMS } from "@/lib/social/platforms";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "AI content settings",
};

export const dynamic = "force-dynamic";

/**
 * The operator's settings for AI posting.
 *
 * `notFound()` rather than a "you are not an admin" page: whether a Medosha
 * deployment has an admin console at all is not information a member needs,
 * and a 403 confirms the route exists.
 *
 * The page is only a form. Every value it writes is enforced server-side by
 * something else — the credit gate, the posting allowance, the scheduler — so
 * a member who somehow reached this screen still could not grant themselves
 * anything by editing the HTML.
 */
export default async function AdminContentPage() {
  if (!(await isAdmin())) notFound();

  const supabase = await createClient();

  const [costs, settings] = await Promise.all([
    supabase
      .from("ai_operation_costs")
      .select("*")
      .order("operation", { ascending: true }),
    supabase.from("platform_settings").select("key, value"),
  ]);

  const byKey = new Map(
    (settings.data ?? []).map((row) => [row.key, row.value]),
  );

  const limitFor = (key: string): Record<string, number> => {
    const value = byKey.get(key);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, number>;
    }
    return {};
  };

  const enabled = Array.isArray(byKey.get("enabled_platforms"))
    ? (byKey.get("enabled_platforms") as string[])
    : ["medosha"];

  // Read on the server, because `hasCredentials` looks at environment
  // variables and those must not reach the browser. Only the boolean crosses.
  const configured = Object.fromEntries(
    SOCIAL_PLATFORMS.map((platform) => [platform, hasCredentials(platform)]),
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <h1 className="flex items-center gap-2 text-xl font-semibold">
        <ShieldCheck className="size-5 text-brand" aria-hidden />
        AI content settings
      </h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        Prices, plan permissions and posting limits. Every change takes effect
        on the next request — nothing here needs a deploy.
      </p>

      <AdminControls
        costs={costs.data ?? []}
        limits={{
          weekly_post_limit: limitFor("weekly_post_limit"),
          monthly_post_limit: limitFor("monthly_post_limit"),
          included_posts_per_month: limitFor("included_posts_per_month"),
          max_connected_accounts: limitFor("max_connected_accounts"),
        }}
        enabled={enabled}
        autoPublish={byKey.get("auto_publish_available") === true}
        configured={configured}
      />
    </div>
  );
}
