"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Bell, Check, CheckCheck, Loader2, Trash2, X } from "lucide-react";

import { useLanguage } from "@/components/i18n/language-provider";
import {
  markAllRead,
  markRead,
  removeNotification,
} from "@/app/notifications/actions";
import { relativeTime } from "@/lib/notifications/relative-time";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/**
 * The bell, and what opens under it.
 *
 * The bell used to be a `<Link href="/notifications">`. The page it went to is
 * still there and still works — this does not replace it, it replaces the trip
 * to it, which is the difference between glancing at what arrived and leaving
 * whatever you were doing.
 *
 * ## One component, two shapes
 *
 * Desktop gets a dropdown anchored under the bell; a phone gets a sheet that
 * covers the width of the screen. Both are the same list with the same
 * actions — the only difference is the positioning classes, because two
 * components would be two places for "mark read" to behave differently.
 *
 * ## Why it fetches its own rows
 *
 * The count comes from the server render, so the badge is right on first
 * paint. The rows are fetched when the panel opens, because a tray nobody
 * opens should not cost a query on every page load, and because what it shows
 * has to be current at the moment it is read rather than at the moment the
 * page was built.
 */

type TrayRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  readAt: string | null;
  createdAt: string;
};

export function NotificationPanel({
  viewerId,
  initialCount,
}: {
  viewerId: string;
  initialCount: number;
}) {
  const { t, language } = useLanguage();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"all" | "unread">("all");
  const [rows, setRows] = useState<TrayRow[] | null>(null);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const count = liveCount ?? initialCount;

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, href, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    setRows(
      (data ?? []).map((row) => ({
        id: row.id,
        kind: row.kind as string,
        title: row.title,
        body: row.body,
        href: row.href,
        readAt: row.read_at,
        createdAt: row.created_at,
      })),
    );
  }, [supabase]);

  // Recounted from the table rather than tracked as a delta, so the badge
  // cannot drift from what the panel shows.
  const recount = useCallback(async () => {
    const { count: fresh } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    if (typeof fresh === "number") setLiveCount(fresh);
  }, [supabase]);

  useEffect(() => {
    const channel = supabase
      .channel(`tray:${viewerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${viewerId}`,
        },
        () => {
          void recount();
          // Only while somebody is looking. Refetching a closed panel is a
          // query for a list nobody can see.
          if (open) void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, viewerId, open, load, recount]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const shown = (rows ?? []).filter((row) =>
    tab === "unread" ? row.readAt === null : true,
  );

  function readOne(id: string) {
    // Moved in the list before the server is asked, because a tray that waits
    // for a round trip to acknowledge a tap feels broken on a slow connection.
    setRows((current) =>
      (current ?? []).map((row) =>
        row.id === id && row.readAt === null
          ? { ...row, readAt: new Date().toISOString() }
          : row,
      ),
    );
    setLiveCount((current) => Math.max((current ?? initialCount) - 1, 0));
    startTransition(async () => {
      await markRead(id);
      void recount();
    });
  }

  function removeOne(id: string) {
    const removed = rows?.find((row) => row.id === id);
    setRows((current) => (current ?? []).filter((row) => row.id !== id));
    if (removed?.readAt === null) {
      setLiveCount((current) => Math.max((current ?? initialCount) - 1, 0));
    }
    startTransition(async () => {
      await removeNotification(id);
      void recount();
    });
  }

  function readEverything() {
    const now = new Date().toISOString();
    setRows((current) =>
      (current ?? []).map((row) => ({ ...row, readAt: row.readAt ?? now })),
    );
    setLiveCount(0);
    startTransition(async () => {
      await markAllRead();
      void recount();
    });
  }

  function follow(row: TrayRow) {
    if (row.readAt === null) readOne(row.id);
    setOpen(false);
    if (row.href) router.push(row.href);
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={
          count > 0
            ? t("common.notificationsUnread").replace("{count}", String(count))
            : t("navigation.notifications")
        }
        onClick={() => {
          // Fetched from the handler rather than an effect watching `open`.
          // The rows are wanted because somebody pressed the bell, and saying
          // that here is both clearer and one render cheaper than deriving it
          // from a state change afterwards.
          if (!open && rows === null) void load();
          setOpen((current) => !current);
        }}
        className="relative flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Bell className="size-4.5" />
        {count > 0 && (
          <span className="absolute top-0.5 right-0.5 flex min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-medium text-brand-foreground">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Catches the click that closes the panel. Transparent on desktop
              so the page underneath still reads as the page; dimmed on a phone,
              where the sheet is the whole screen. */}
          <button
            type="button"
            aria-label={t("common.close")}
            data-no-press
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-foreground/20 sm:bg-transparent"
          />

          <div
            role="dialog"
            aria-label={t("navigation.notifications")}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col rounded-t-2xl border bg-popover text-popover-foreground shadow-lg",
              // From `sm` it stops being a sheet and becomes a dropdown under
              // the bell.
              "sm:absolute sm:inset-auto sm:top-full sm:right-0 sm:mt-2 sm:max-h-[32rem] sm:w-96 sm:rounded-xl",
            )}
          >
            <header className="flex items-center gap-2 border-b px-3 py-2">
              <p className="flex-1 font-medium">
                {t("navigation.notifications")}
              </p>
              <button
                type="button"
                onClick={readEverything}
                disabled={count === 0}
                className="flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                <CheckCheck className="size-3.5" />
                {t("notifications.markAllRead")}
              </button>
              <button
                type="button"
                aria-label={t("common.close")}
                onClick={() => setOpen(false)}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted sm:hidden"
              >
                <X className="size-4" />
              </button>
            </header>

            <div
              role="tablist"
              aria-label={t("navigation.notifications")}
              className="flex gap-1 border-b px-2 py-1.5"
            >
              {(["all", "unread"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={tab === value}
                  onClick={() => setTab(value)}
                  className={cn(
                    "min-h-8 rounded-lg px-3 text-sm transition-colors",
                    tab === value
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60",
                  )}
                >
                  {value === "all"
                    ? t("notifications.tabAll")
                    : t("notifications.tabUnread")}
                  {value === "unread" && count > 0 && (
                    <span className="ml-1.5 text-xs text-brand">{count}</span>
                  )}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {rows === null ? (
                <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t("common.loading")}
                </p>
              ) : shown.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  {tab === "unread"
                    ? t("notifications.emptyUnread")
                    : t("notifications.empty")}
                </p>
              ) : (
                <ul className="divide-y">
                  {shown.map((row) => (
                    <li
                      key={row.id}
                      className={cn(
                        "group flex items-start gap-2 px-3 py-2.5",
                        row.readAt === null && "bg-brand/5",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-2 size-2 shrink-0 rounded-full",
                          row.readAt === null ? "bg-brand" : "bg-transparent",
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => follow(row)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span
                          className={cn(
                            "block truncate text-sm",
                            row.readAt === null
                              ? "font-semibold"
                              : "font-medium text-muted-foreground",
                          )}
                        >
                          {row.title}
                        </span>
                        {row.body && (
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {row.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {relativeTime(row.createdAt, language)}
                        </span>
                      </button>

                      <span className="flex shrink-0 items-center gap-0.5">
                        {row.readAt === null && (
                          <button
                            type="button"
                            aria-label={t("notifications.markRead")}
                            onClick={() => readOne(row.id)}
                            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          >
                            <Check className="size-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={t("notifications.remove")}
                          onClick={() => removeOne(row.id)}
                          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <footer className="border-t px-3 py-2">
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-sm text-brand hover:underline"
              >
                {t("notifications.seeAll")}
              </Link>
            </footer>
          </div>
        </>
      )}
    </div>
  );
}
