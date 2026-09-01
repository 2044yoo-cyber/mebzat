import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";

import {
  ContentCalendar,
  startOfWeek,
} from "@/components/social/content-calendar";
import { listContentPosts } from "@/lib/data/content";
import { autoPublishAvailable, enabledPlatforms, postingAllowance } from "@/lib/social/settings";
import { createClient } from "@/lib/supabase/server";
import { PLATFORM_SPECS } from "@/lib/social/platforms";

export const metadata: Metadata = {
  title: "AI content calendar",
  description: "Everything Medosha AI has written for you, and when it goes out.",
};

export const dynamic = "force-dynamic";

/**
 * The content calendar.
 *
 * Shows the allowance at the top, because the useful thing to know before
 * writing another post is whether you can publish it. The number comes from
 * `platform_settings` through the same function the generate route uses, so
 * the figure on the page and the figure the server enforces cannot disagree.
 */
export default async function ContentCalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/studio/content");

  const [posts, allowance, platforms, autoPublish] = await Promise.all([
    listContentPosts({ limit: 90 }),
    postingAllowance(user.id),
    enabledPlatforms(),
    autoPublishAvailable(),
  ]);

  const outside = platforms.filter((platform) => platform !== "medosha");

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="flex items-center gap-2 text-xl font-semibold">
          <CalendarDays className="size-5 text-brand" aria-hidden />
          AI content
        </h1>

        <p className="text-sm text-muted-foreground tabular-nums">
          {allowance.ok ? (
            <>
              {allowance.used} of {allowance.limit} posts published this week
            </>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">
              {allowance.reason}
            </span>
          )}
        </p>
      </div>

      {/* Said once, at the top, rather than discovered at the moment of
          publishing. A calendar full of scheduled posts on a site with no
          connected platforms is a calendar that will disappoint somebody. */}
      {outside.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Only Medosha&rsquo;s own feed is available on this site so far.
          Facebook, Instagram and TikTok need their app credentials configured
          by the site owner before they can be connected.
        </p>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">
          Available: Medosha,{" "}
          {outside.map((platform) => PLATFORM_SPECS[platform].label).join(", ")}.
          {!autoPublish
            ? " Automatic publishing is off, so scheduled posts wait for you."
            : null}
        </p>
      )}

      <div className="mt-6">
        <ContentCalendar posts={posts} weekStart={startOfWeek(new Date())} />
      </div>
    </div>
  );
}
