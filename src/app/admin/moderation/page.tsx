import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle, Flag, ShieldAlert } from "lucide-react";

import { QueueRow } from "@/components/moderation/queue-row";
import { canAdmin } from "@/lib/auth/admin-areas";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Moderation" };
export const dynamic = "force-dynamic";

/**
 * The moderation queue.
 *
 * `notFound()` for a non-admin rather than a refusal page: whether Medosha has
 * a moderation console is not something an ordinary account needs to learn.
 *
 * The rows deliberately show no image and no post body. moderation_items does
 * not store the material — a table holding copies of what it rejected would be
 * a database full of exactly what it exists to keep off the platform — so a
 * moderator opens the content itself to judge it. What is shown here is the
 * case: who, what kind, which category, how confident the check was, how many
 * people reported it.
 */

type Tab = "review" | "reported" | "blocked" | "appeals";

const TABS: { id: Tab; label: string; icon: typeof Flag }[] = [
  { id: "review", label: "Pending", icon: AlertTriangle },
  { id: "reported", label: "Reported", icon: Flag },
  { id: "appeals", label: "Appeals", icon: ShieldAlert },
  { id: "blocked", label: "Blocked", icon: ShieldAlert },
];

export default async function ModerationQueuePage(props: {
  searchParams: Promise<{ tab?: string }>;
}) {
  if (!(await canAdmin("moderation"))) notFound();

  const { tab: raw } = await props.searchParams;
  const tab: Tab = (["review", "reported", "blocked", "appeals"] as const).includes(
    raw as Tab,
  )
    ? (raw as Tab)
    : "review";

  const supabase = await createClient();

  let query = supabase
    .from("moderation_items")
    .select(
      "id, content_type, content_id, user_id, status, category, reason, confidence, provider, model, report_count, appeal_status, created_at, reviewed_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (tab === "review") query = query.eq("status", "review");
  else if (tab === "blocked") query = query.eq("status", "blocked");
  else if (tab === "reported") query = query.gt("report_count", 0);
  else query = query.eq("appeal_status", "open");

  const { data, error } = await query;
  const items = data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-5 sm:px-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Moderation</h1>
        <p className="text-sm text-muted-foreground">
          Content held back from public view, and the decisions taken on it.
        </p>
      </header>

      {/* Scrolls horizontally on a phone rather than wrapping into two rows
          that push the queue below the fold. */}
      <nav className="-mx-3 flex gap-1 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <a
            key={id}
            href={`/admin/moderation?tab=${id}`}
            className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm transition-colors ${
              tab === id
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </a>
        ))}
      </nav>

      {error ? (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          The queue could not be loaded. The moderation migration may not be
          applied to this database yet.
        </p>
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nothing here.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
