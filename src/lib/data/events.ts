import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { EventKind, MedoshaEvent } from "@/types/database.types";

/** Reads for Events. */

export const PAGE_SIZE = 24;

export type EventRow = MedoshaEvent & {
  organizer: {
    id: string;
    username: string | null;
    full_name: string | null;
    company_name: string | null;
    avatar_url: string | null;
  } | null;
  company: { id: string; name: string; slug: string; logo_url: string | null } | null;
};

export type EventResult = {
  events: EventRow[];
  total: number;
  available: boolean;
};

const COLUMNS = `
  *,
  organizer:profiles!organizer_id(id, username, full_name, company_name, avatar_url),
  company:companies(id, name, slug, logo_url)
`;

export async function getEvents(options: {
  kind?: EventKind;
  city?: string;
  past?: boolean;
  page?: number;
  pageSize?: number;
} = {}): Promise<EventResult> {
  const { kind, city, past = false, page = 1, pageSize = PAGE_SIZE } = options;

  const supabase = await createClient();
  const now = new Date().toISOString();

  let builder = supabase
    .from("events")
    .select(COLUMNS, { count: "exact" })
    .eq("status", "published");

  // Upcoming reads forward from now; past reads backward, so the most
  // recently finished event is first in both cases.
  builder = past ? builder.lt("starts_at", now) : builder.gte("starts_at", now);

  if (kind) builder = builder.eq("kind", kind);
  if (city) builder = builder.eq("location_city", city);

  const from = (page - 1) * pageSize;
  const { data, count, error } = await builder
    .order("starts_at", { ascending: !past })
    .range(from, from + pageSize - 1);

  if (error) return { events: [], total: 0, available: false };

  return {
    events: (data ?? []) as unknown as EventRow[],
    total: count ?? 0,
    available: true,
  };
}

export async function getEvent(id: string): Promise<EventRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as EventRow;
}

/** The viewer's attendance status for an event, if they have one. */
export async function getMyAttendance(eventId: string, userId: string | null) {
  if (!userId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("event_attendees")
    .select("status")
    .eq("event_id", eventId)
    .eq("user_id", userId)
    .maybeSingle();

  return data?.status ?? null;
}

export async function getEventCities(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("location_city")
    .eq("status", "published")
    .limit(500);

  const cities = new Set<string>();
  for (const row of data ?? []) {
    if (row.location_city) cities.add(row.location_city);
  }
  return [...cities].sort();
}
