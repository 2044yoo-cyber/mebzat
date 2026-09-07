"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";

import { Check, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { saveCalculation } from "@/lib/actions/calculations";
import { createClient } from "@/lib/supabase/client";
import type { FormState } from "@/lib/calculators/validate";

/**
 * Naming a result and keeping it.
 *
 * Signed out, this is a link to sign in rather than a disabled button — the
 * brief was explicit that the calculators themselves must not require an
 * account, and a greyed-out control that never explains itself is worse than
 * an honest invitation.
 *
 * What gets stored is the **inputs**, not the answer. Re-running the calculator
 * over stored inputs always agrees with the calculator; a stored answer would
 * drift the first time a formula was corrected, leaving a number in the
 * database that the software could no longer reproduce.
 */
export function SaveControl({
  slug,
  state,
  headline,
}: {
  slug: string;
  state: FormState;
  headline: string;
}) {
  // Asked for on the client, not handed down from the page.
  //
  // The forty-one calculator routes are statically generated — that is what
  // gives each one a real indexable page — and reading a cookie on the server
  // would turn every one of them dynamic to decide the label on a single
  // button. The arithmetic does not need to know who you are; only this control
  // does, and it can find out for itself.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (live) setSignedIn(Boolean(data.user));
      })
      .catch(() => {
        if (live) setSignedIn(false);
      });
    return () => {
      live = false;
    };
  }, []);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  // Still asking. Nothing is shown rather than a button that might be about to
  // change its own label under the reader's finger.
  if (signedIn === null) return null;

  if (!signedIn) {
    return (
      <Link
        href={`/login?redirect=${encodeURIComponent(`/calculators/${slug}`)}`}
        className="inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-colors hover:bg-muted"
      >
        <Save className="size-4" />
        Sign in to save this
      </Link>
    );
  }

  if (saved) {
    return (
      <span className="inline-flex h-10 items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 text-sm font-medium">
        <Check className="size-4" />
        Saved.{" "}
        <Link href="/calculators/saved" className="underline">
          See your calculations
        </Link>
      </span>
    );
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="h-10">
        <Save className="size-4" />
        Save this calculation
      </Button>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        start(async () => {
          const inputs = Object.fromEntries(
            Object.entries(state).map(([key, entry]) => [key, { raw: entry.raw, unit: entry.unit }]),
          );
          const result = await saveCalculation({ slug, name, inputs, headline });
          if (result.ok) setSaved(true);
          else setError(result.error);
        });
      }}
      className="flex w-full flex-wrap items-start gap-2"
    >
      <label className="min-w-0 flex-1">
        <span className="sr-only">Name for this calculation</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Ground floor slab, block B"
          autoFocus
          className="h-10 w-full min-w-0 rounded-xl border bg-background px-3 text-sm"
        />
      </label>
      <Button type="submit" disabled={pending} className="h-10">
        {pending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="h-10">
        Cancel
      </Button>
      {error && (
        <p role="alert" className="w-full text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
