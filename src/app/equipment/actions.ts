"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { BookingStatus, RentalPeriod } from "@/types/database.types";

export type BookingResult = { error?: string; ok?: boolean };

async function requireUser(returnTo: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(returnTo)}`);
  return { supabase, user };
}

/** Whole days between two dates, inclusive of both ends. */
function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Requests a rental.
 *
 * The quote is computed on the server from the listing's own rates: a price
 * posted by the browser is a price the renter chose.
 */
export async function requestBooking(
  equipmentId: string,
  startsOn: string,
  endsOn: string,
  note?: string,
): Promise<BookingResult> {
  const { supabase, user } = await requireUser(`/equipment/${equipmentId}`);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn)) {
    return { error: "Pick both dates." };
  }

  const days = daysBetween(startsOn, endsOn);
  if (Number.isNaN(days) || days < 1) {
    return { error: "The return date must be on or after the start date." };
  }
  if (days > 365) {
    return { error: "Rentals longer than a year need a direct arrangement." };
  }

  const { data: item } = await supabase
    .from("equipment")
    .select(
      "id, owner_id, daily_rate, weekly_rate, monthly_rate, currency, min_rental_days, available, status",
    )
    .eq("id", equipmentId)
    .maybeSingle();

  if (!item || item.status !== "published") {
    return { error: "That listing is no longer available." };
  }
  if (item.owner_id === user.id) {
    return { error: "You cannot book your own equipment." };
  }
  if (days < item.min_rental_days) {
    return { error: `This listing has a ${item.min_rental_days} day minimum.` };
  }

  // The database is the authority on double booking: two requests can pass a
  // client-side check at the same moment, and only this can see both.
  const { data: free } = await supabase.rpc("equipment_is_available", {
    target_equipment_id: equipmentId,
    from_date: startsOn,
    to_date: endsOn,
  });
  if (free === false) {
    return { error: "Those dates are already booked." };
  }

  // Whichever rate covers the period most cheaply for the renter, which is
  // also the one they would have worked out themselves.
  let period: RentalPeriod = "daily";
  let total: number | null = null;

  const daily = item.daily_rate === null ? null : Number(item.daily_rate) * days;
  const weekly =
    item.weekly_rate === null
      ? null
      : Number(item.weekly_rate) * Math.ceil(days / 7);
  const monthly =
    item.monthly_rate === null
      ? null
      : Number(item.monthly_rate) * Math.ceil(days / 30);

  for (const [candidate, amount] of [
    ["daily", daily],
    ["weekly", weekly],
    ["monthly", monthly],
  ] as const) {
    if (amount === null) continue;
    if (total === null || amount < total) {
      total = amount;
      period = candidate;
    }
  }

  const { error } = await supabase.from("equipment_bookings").insert({
    equipment_id: equipmentId,
    renter_id: user.id,
    starts_on: startsOn,
    ends_on: endsOn,
    period,
    quoted_total: total,
    currency: item.currency,
    note: note?.slice(0, 500) || null,
    status: "requested",
  });

  if (error) return { error: "Could not send that request." };

  revalidatePath(`/equipment/${equipmentId}`);
  return { ok: true };
}

/** The owner confirms, declines or closes out a booking. */
export async function setBookingStatus(
  bookingId: string,
  status: BookingStatus,
): Promise<BookingResult> {
  const { supabase } = await requireUser("/dashboard");

  const { error } = await supabase
    .from("equipment_bookings")
    .update({ status })
    .eq("id", bookingId);

  if (error) return { error: "Could not update that booking." };

  revalidatePath("/equipment");
  return { ok: true };
}
