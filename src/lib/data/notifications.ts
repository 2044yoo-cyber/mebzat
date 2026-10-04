import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * The notification tray.
 *
 * General notifications (0010) and price events (0009) live in separate tables
 * because price events carry listing and bid columns nothing else uses. They
 * are merged here into one list, sorted by time, so the tray is one feed.
 */

export type TrayItem = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  createdAt: string;
};

export async function getNotifications(limit = 30): Promise<TrayItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [general, price] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, kind, title, body, href, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase
      .from("price_notifications")
      .select("id, event, title, body, listing_id, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);

  const items: TrayItem[] = [
    ...(general.data ?? []).map((row) => ({
      id: row.id,
      kind: row.kind as string,
      title: row.title,
      body: row.body,
      href: row.href,
      read: row.read_at !== null,
      createdAt: row.created_at,
    })),
    ...(price.data ?? []).map((row) => ({
      id: row.id,
      kind: row.event as string,
      title: row.title,
      body: row.body,
      href: row.listing_id ? `/price-exchange/${row.listing_id}` : null,
      read: row.read_at !== null,
      createdAt: row.created_at,
    })),
  ];

  return items
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

/** Unread count across both tables, for the header badge. */
export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 0;

  const [general, price] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
    supabase
      .from("price_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null),
  ]);

  return (general.count ?? 0) + (price.count ?? 0);
}
