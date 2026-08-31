import Link from "next/link";

import { PLATFORM_SPECS } from "@/lib/social/platforms";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/social/lifecycle";
import { cn } from "@/lib/utils";
import type { ContentListItem } from "@/lib/data/content";

/**
 * The week ahead.
 *
 * Seven columns on a wide screen and a list on a phone, because 90% of
 * Medosha's traffic is a phone and a seven-column grid on 390px is seven
 * unreadable columns. The same rows either way — this is one component with a
 * responsive layout rather than two components that will drift.
 *
 * Posts with no scheduled date are not on the grid at all. A draft has not
 * been given a day yet, and putting it on "today" would be inventing a
 * decision the user has not made.
 */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function ContentCalendar({
  posts,
  weekStart,
}: {
  posts: ContentListItem[];
  /** Midnight on the Sunday the grid begins. */
  weekStart: Date;
}) {
  const days = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + offset);
    return day;
  });

  const scheduled = posts.filter((post) => post.scheduled_for !== null);
  const unscheduled = posts.filter((post) => post.scheduled_for === null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-7">
        {days.map((day) => {
          const onThisDay = scheduled.filter((post) =>
            sameDay(new Date(post.scheduled_for!), day),
          );

          const isToday = sameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "rounded-xl border p-2",
                isToday && "border-brand bg-brand/5",
                // A day with nothing on it still takes its column on a wide
                // screen — an empty Wednesday is information — but collapses
                // on a phone, where seven empty cards is just scrolling.
                onThisDay.length === 0 && "hidden sm:block",
              )}
            >
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                {DAY_NAMES[day.getDay()]}{" "}
                <span className="tabular-nums">{day.getDate()}</span>
              </p>

              <div className="space-y-1.5">
                {onThisDay.map((post) => (
                  <CalendarCard key={post.id} post={post} />
                ))}
              </div>

              {onThisDay.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/60">—</p>
              ) : null}
            </div>
          );
        })}
      </div>

      {unscheduled.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold">
            Not scheduled
            <span className="ml-2 font-normal text-muted-foreground">
              {unscheduled.length}
            </span>
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {unscheduled.map((post) => (
              <CalendarCard key={post.id} post={post} expanded />
            ))}
          </div>
        </div>
      ) : null}

      {posts.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No AI posts yet. Open a property, a product or a project and choose
          &ldquo;Promote with AI&rdquo;.
        </p>
      ) : null}
    </div>
  );
}

function CalendarCard({
  post,
  expanded,
}: {
  post: ContentListItem;
  expanded?: boolean;
}) {
  return (
    <Link
      href={`/studio/content/${post.id}`}
      className="block rounded-lg border bg-background p-2 transition-colors hover:border-brand/60"
    >
      <span className="flex items-center gap-1.5">
        <span
          className={cn("size-1.5 shrink-0 rounded-full", STATUS_TONE[post.status])}
          aria-hidden
        />
        <span className="truncate text-[11px] text-muted-foreground">
          {STATUS_LABEL[post.status]}
        </span>
      </span>

      <p
        className={cn(
          "mt-0.5 text-xs font-medium",
          expanded ? "line-clamp-2" : "truncate",
        )}
      >
        {post.headline || post.brief}
      </p>

      {/* Platform names, not icons alone. An icon row is unreadable at this
          size and tells a screen reader nothing. */}
      {post.platforms.length > 0 ? (
        <p className="mt-1 truncate text-[10px] text-muted-foreground">
          {post.platforms
            .map((platform) => PLATFORM_SPECS[platform as keyof typeof PLATFORM_SPECS]?.label ?? platform)
            .join(" · ")}
        </p>
      ) : null}
    </Link>
  );
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Midnight on the Sunday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}
