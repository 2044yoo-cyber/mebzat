import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, BellOff } from "lucide-react";

import { MarkAllReadButton } from "@/components/notifications/mark-all-read";
import { getNotifications } from "@/lib/data/notifications";
import { createClient } from "@/lib/supabase/server";
import { cn, formatRelativeTime } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Notifications",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/notifications");

  const items = await getNotifications(50);
  const unread = items.filter((item) => !item.read).length;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1">
        <div className="container-page py-10">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Bell className="size-4" /> Notifications
                </div>
                <h1 className="mt-1 text-3xl font-semibold tracking-tight">
                  {unread > 0 ? `${unread} unread` : "All caught up"}
                </h1>
              </div>
              {unread > 0 && <MarkAllReadButton />}
            </div>

            {items.length === 0 ? (
              <div className="mt-8 flex flex-col items-center gap-3 rounded-2xl border border-dashed p-16 text-center">
                <BellOff className="size-8 text-muted-foreground" />
                <p className="font-medium">Nothing here yet</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Messages, price changes, new bids, followers, reviews and
                  application updates land here.
                </p>
              </div>
            ) : (
              <ul className="mt-8 divide-y rounded-2xl border">
                {items.map((item) => {
                  const content = (
                    <span className="flex items-start gap-3 p-4">
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          item.read ? "bg-transparent" : "bg-brand",
                        )}
                        aria-label={item.read ? undefined : "Unread"}
                      />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block",
                            item.read ? "font-normal" : "font-medium",
                          )}
                        >
                          {item.title}
                        </span>
                        {item.body && (
                          <span className="mt-0.5 block truncate text-sm text-muted-foreground">
                            {item.body}
                          </span>
                        )}
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {formatRelativeTime(item.createdAt)}
                        </span>
                      </span>
                    </span>
                  );

                  return (
                    <li key={`${item.kind}-${item.id}`}>
                      {item.href ? (
                        <Link
                          href={item.href}
                          className="block transition-colors hover:bg-muted/50"
                        >
                          {content}
                        </Link>
                      ) : (
                        <div>{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
