"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Sends one product id to the server and follows where it points.
 *
 * That is the whole client side of taking money. No price, no plan, no credit
 * count, no provider key — the button knows the id of a row and nothing else,
 * and everything that decides what is charged happens on the server where it
 * cannot be edited in a console.
 *
 * The redirect is a full navigation rather than a router push because the
 * destination is Chapa's domain, and the router does not leave the app.
 */

export function PurchaseButton({
  productId,
  label,
  variant = "default",
  className,
}: {
  productId: string;
  label: string;
  variant?: "default" | "outline" | "secondary";
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });

      const payload = (await response.json()) as {
        checkoutUrl?: string;
        error?: string;
      };

      if (!response.ok || !payload.checkoutUrl) {
        // Whatever the server chose to say. In development that is the
        // provider's own complaint about our request; in production it is a
        // sentence for a member. Either way it is not invented here — a client
        // that rewrites the server's error is a client that hides the bug.
        setError(payload.error ?? "Checkout could not be started.");
        setBusy(false);
        return;
      }

      // Deliberately not clearing `busy`. The page is leaving, and a button
      // that springs back to life while the browser is navigating away invites
      // a second click and a second payment.
      window.location.href = payload.checkoutUrl;
    } catch {
      setError("Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button
        onClick={start}
        disabled={busy}
        variant={variant}
        className="w-full"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {busy ? "Opening payment…" : error ? "Try again" : label}
      </Button>
      {error ? (
        // Every attempt asks the server for a fresh transaction reference, so
        // pressing this again is a new payment and not a resumed one. Nothing
        // is left half-created by a failed attempt — the abandoned row is
        // marked failed and never reused.
        <p className="mt-2 text-xs break-words text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
