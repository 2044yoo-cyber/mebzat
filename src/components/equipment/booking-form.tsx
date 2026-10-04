"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarCheck } from "lucide-react";
import { toast } from "sonner";

import { requestBooking } from "@/app/equipment/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice } from "@/lib/utils";

/**
 * Requests a rental for a date range.
 *
 * The estimate shown here is indicative and computed the same way the server
 * does; the server recomputes it on submit, so a tampered form cannot set its
 * own price.
 */
export function BookingForm({
  equipmentId,
  currency,
  dailyRate,
  weeklyRate,
  monthlyRate,
  minDays,
  signedIn,
  isOwner,
  booked,
}: {
  equipmentId: string;
  currency: string;
  dailyRate: number | null;
  weeklyRate: number | null;
  monthlyRate: number | null;
  minDays: number;
  signedIn: boolean;
  isOwner: boolean;
  booked: { starts_on: string; ends_on: string }[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const days =
    from && to
      ? Math.round(
          (new Date(`${to}T00:00:00Z`).getTime() -
            new Date(`${from}T00:00:00Z`).getTime()) /
            86_400_000,
        ) + 1
      : 0;

  const estimate = (() => {
    if (days < 1) return null;
    const options = [
      dailyRate === null ? null : dailyRate * days,
      weeklyRate === null ? null : weeklyRate * Math.ceil(days / 7),
      monthlyRate === null ? null : monthlyRate * Math.ceil(days / 30),
    ].filter((value): value is number => value !== null);
    return options.length === 0 ? null : Math.min(...options);
  })();

  const clash = booked.some(
    (range) => from && to && from <= range.ends_on && to >= range.starts_on,
  );

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await requestBooking(equipmentId, from, to, note.trim());
      if (result.error) {
        setError(result.error);
        return;
      }
      setSent(true);
      toast.success("Request sent to the owner");
    });
  }

  if (isOwner) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        This is your listing. Booking requests arrive in your notifications.
      </p>
    );
  }

  if (!signedIn) {
    return (
      <Link
        href={`/login?redirect=${encodeURIComponent(`/equipment/${equipmentId}`)}`}
        className="block rounded-xl border p-4 text-center text-sm font-medium transition-colors hover:border-brand"
      >
        Sign in to request this equipment
      </Link>
    );
  }

  if (sent) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
        <p className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
          <CalendarCheck className="size-4" />
          Request sent
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          The owner will confirm or decline. You will get a notification either
          way.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="booking-from">From</Label>
          <Input
            id="booking-from"
            type="date"
            required
            min={today}
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setError(null);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="booking-to">To</Label>
          <Input
            id="booking-to"
            type="date"
            required
            min={from || today}
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setError(null);
            }}
          />
        </div>
      </div>

      {days > 0 && (
        <div className="rounded-xl bg-muted/50 p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {days} {days === 1 ? "day" : "days"}
            </span>
            <span className="font-semibold tabular-nums">
              {estimate === null
                ? "Rate on request"
                : formatPrice(estimate, currency)}
            </span>
          </div>
          {days < minDays && (
            <p className="mt-1 text-xs text-destructive">
              Minimum rental is {minDays} days.
            </p>
          )}
          {clash && (
            <p className="mt-1 text-xs text-destructive">
              Those dates overlap an existing booking.
            </p>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="booking-note">Note (optional)</Label>
        <Textarea
          id="booking-note"
          value={note}
          maxLength={500}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Site location, operator needed, delivery…"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={pending || days < 1 || days < minDays || clash}
      >
        {pending ? "Sending…" : "Request this equipment"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Requesting does not charge you. The owner confirms first.
      </p>
    </form>
  );
}
