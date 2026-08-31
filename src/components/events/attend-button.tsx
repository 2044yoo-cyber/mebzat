"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarCheck, Star } from "lucide-react";
import { toast } from "sonner";

import { setAttendance } from "@/app/events/actions";
import { Button } from "@/components/ui/button";
import type { AttendanceStatus } from "@/types/database.types";

/**
 * Register or mark interest.
 *
 * Pressing the state you are already in cancels it, which the action handles;
 * the button just reflects whatever comes back.
 */
export function AttendButton({
  eventId,
  current,
  signedIn,
  isOrganizer,
  full,
  registrationUrl,
}: {
  eventId: string;
  current: AttendanceStatus | null;
  signedIn: boolean;
  isOrganizer: boolean;
  full: boolean;
  registrationUrl: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<AttendanceStatus | null>(current);
  const [pending, startTransition] = useTransition();

  if (isOrganizer) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        You are organising this event.
      </p>
    );
  }

  if (!signedIn) {
    return (
      <Link
        href={`/login?redirect=${encodeURIComponent(`/events/${eventId}`)}`}
        className="block rounded-xl border p-4 text-center text-sm font-medium transition-colors hover:border-brand"
      >
        Sign in to register
      </Link>
    );
  }

  function press(next: AttendanceStatus) {
    const previous = status;
    // The action treats a repeat press as "undo", so mirror that here.
    setStatus(previous === next ? null : next);

    startTransition(async () => {
      const result = await setAttendance(eventId, next);
      if (result.error) {
        setStatus(previous);
        toast.error(result.error);
        return;
      }
      toast.success(
        previous === next
          ? "Removed"
          : next === "registered"
            ? "You are registered"
            : "Marked as interested",
      );
      router.refresh();
    });
  }

  const registered = status === "registered";

  return (
    <div className="space-y-2">
      <Button
        size="lg"
        className="w-full"
        variant={registered ? "outline" : "default"}
        disabled={pending || (full && !registered)}
        onClick={() => press("registered")}
      >
        <CalendarCheck className="size-4" />
        {registered ? "Registered — cancel" : full ? "Event full" : "Register"}
      </Button>

      <Button
        size="lg"
        variant="ghost"
        className="w-full"
        disabled={pending}
        onClick={() => press("interested")}
      >
        <Star
          className={status === "interested" ? "size-4 fill-current" : "size-4"}
        />
        {status === "interested" ? "Interested" : "Mark interested"}
      </Button>

      {registrationUrl && (
        <a
          href={registrationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block pt-1 text-center text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Organiser&rsquo;s registration page
        </a>
      )}
    </div>
  );
}
