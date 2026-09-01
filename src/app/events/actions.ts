"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { AttendanceStatus } from "@/types/database.types";

export type EventResultMessage = { error?: string; ok?: boolean };

/**
 * Registers, marks interest, or cancels.
 *
 * Passing the same status you already hold cancels it, so one button can both
 * register and un-register without the caller tracking which it is.
 */
export async function setAttendance(
  eventId: string,
  status: AttendanceStatus,
): Promise<EventResultMessage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=/events/${eventId}`);

  const { data: event } = await supabase
    .from("events")
    .select("id, capacity, attendee_count, status")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) return { error: "That event no longer exists." };
  if (event.status !== "published") {
    return { error: "That event is not open for registration." };
  }

  const { data: existing } = await supabase
    .from("event_attendees")
    .select("status")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();

  // Pressing the button you are already on means "undo".
  if (existing?.status === status) {
    const { error } = await supabase
      .from("event_attendees")
      .delete()
      .eq("event_id", eventId)
      .eq("user_id", user.id);

    if (error) return { error: "Could not update your registration." };
    revalidatePath(`/events/${eventId}`);
    return { ok: true };
  }

  // Capacity is only a limit for registering; interest is unlimited.
  if (
    status === "registered" &&
    event.capacity !== null &&
    existing?.status !== "registered" &&
    event.attendee_count >= event.capacity
  ) {
    return { error: "This event is full." };
  }

  const { error } = await supabase
    .from("event_attendees")
    .upsert(
      { event_id: eventId, user_id: user.id, status },
      { onConflict: "event_id,user_id" },
    );

  if (error) return { error: "Could not update your registration." };

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}
