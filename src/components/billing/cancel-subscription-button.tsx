"use client";

import { useState, useTransition } from "react";

import { cancelSubscription } from "@/app/(dashboard)/billing/actions";
import { Button } from "@/components/ui/button";

/**
 * Cancelling, with one confirmation and no dark patterns.
 *
 * The confirmation exists because the click is irreversible from here — turning
 * the renewal back on means paying again — not to talk anybody out of it. It
 * says what actually happens, including the part that is good news: access runs
 * to the end of the period already paid for.
 */

export function CancelSubscriptionButton({ endsOn }: { endsOn: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        Cancel renewal
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        Your plan stays active until {endsOn} and will not renew after that.
      </p>
      <div className="flex gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelSubscription();
              if (result.error) setError(result.error);
              else setConfirming(false);
            })
          }
        >
          {pending ? "Cancelling…" : "Yes, stop renewing"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => setConfirming(false)}
        >
          Keep it
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
