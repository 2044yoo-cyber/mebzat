"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Hammer, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

/**
 * Sending a design to a workshop.
 *
 * The cut list is not attached from the browser. It is rebuilt on the server
 * from the design's own spec and frozen into the request there, because a
 * client that supplies the parts list is a client that can supply a different
 * parts list from the one on the page.
 *
 * The workshop list loads only when this is opened. Most people reading a cut
 * list are reading it, not ordering from it.
 */

type Workshop = {
  id: string;
  name: string;
  city: string | null;
  verified: boolean;
  isClaimed: boolean;
};

export function QuoteRequest({
  designId,
  title,
}: {
  designId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [workshops, setWorkshops] = useState<Workshop[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [neededBy, setNeededBy] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || workshops !== null) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/studio/workshops");
        const payload = (await response.json()) as { workshops?: Workshop[] };
        if (!cancelled) setWorkshops(payload.workshops ?? []);
      } catch {
        if (!cancelled) setWorkshops([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, workshops]);

  const send = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/studio/designs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "quote",
          designId,
          companyId: chosen,
          note,
          neededBy: neededBy || null,
        }),
      });
      const payload = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || payload.error) {
        setError(payload.error ?? "That did not work.");
        return;
      }
      setSent(true);
    } catch {
      setError("The connection dropped. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
        <CheckCircle2 className="mt-0.5 size-4 text-emerald-600" aria-hidden />
        <div>
          <p className="text-sm font-medium">Sent to the workshop</p>
          <p className="mt-1 text-sm text-muted-foreground">
            They have this cut list exactly as it stands now — later edits to
            the design will not change what they were sent. Their reply arrives
            in your notifications.
          </p>
        </div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="rounded-xl border p-4">
        <p className="text-sm font-medium">Have it made</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Send this cut list to a joinery on Medosha and ask what they would
          charge to build it.
        </p>
        <Button className="mt-3 gap-1.5" onClick={() => setOpen(true)}>
          <Hammer className="size-4" aria-hidden />
          Ask a workshop for a quote
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border p-4">
      <p className="text-sm font-medium">Ask a workshop to quote</p>

      {workshops === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Finding workshops…
        </p>
      ) : workshops.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No joinery workshops are listed on Medosha yet. Once one is, this
          cut list can go straight to them.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs font-normal text-muted-foreground">
              Workshop
            </Label>
            <div className="max-h-48 space-y-1 overflow-y-auto">
              {workshops.map((workshop) => (
                <label
                  key={workshop.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm hover:bg-muted/50"
                >
                  <input
                    type="radio"
                    name="workshop"
                    checked={chosen === workshop.id}
                    onChange={() => setChosen(workshop.id)}
                    className="accent-primary"
                  />
                  <span className="min-w-0 flex-1 truncate">{workshop.name}</span>
                  {workshop.city ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {workshop.city}
                    </span>
                  ) : null}
                  {/* An unclaimed directory entry has nobody to notify. Saying
                      so is better than a request that silently goes nowhere. */}
                  {!workshop.isClaimed ? (
                    <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                      unclaimed
                    </span>
                  ) : null}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-3 @lg/ws:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="needed-by" className="text-xs font-normal text-muted-foreground">
                Needed by (optional)
              </Label>
              <input
                id="needed-by"
                type="date"
                value={neededBy}
                onChange={(event) => setNeededBy(event.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quote-note" className="text-xs font-normal text-muted-foreground">
              Anything they should know
            </Label>
            <textarea
              id="quote-note"
              rows={3}
              value={note}
              maxLength={2000}
              placeholder={`Fitting ${title.toLowerCase()} into an existing alcove — the wall is not square.`}
              onChange={(event) => setNote(event.target.value)}
              className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={send} disabled={busy || !chosen} className="gap-1.5">
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Hammer className="size-4" aria-hidden />
              )}
              Send the cut list
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </>
      )}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
