"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CheckCircle2, Gavel } from "lucide-react";
import { toast } from "sonner";

import { AiField } from "@/components/ai/writing/ai-field";
import { submitBid, withdrawBid, type BidInput } from "@/app/hire/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BID_STATUS } from "@/lib/constants/services";
import { formatPrice } from "@/lib/utils";
import type { BriefBid } from "@/types/database.types";

/** Places or improves a bid, under one of the bidder's own services. */
export function BidForm({
  briefId,
  currency,
  budgetHint,
  signedIn,
  isClient,
  services,
  existing,
}: {
  briefId: string;
  currency: string;
  budgetHint: string | null;
  signedIn: boolean;
  isClient: boolean;
  services: { id: string; title: string }[];
  existing: BriefBid | null;
}) {
  const [price, setPrice] = useState(
    existing ? String(existing.price) : "",
  );
  const [priceNote, setPriceNote] = useState(existing?.price_note ?? "");
  const [timelineDays, setTimelineDays] = useState(
    existing?.timeline_days != null ? String(existing.timeline_days) : "",
  );
  const [canStartOn, setCanStartOn] = useState(existing?.can_start_on ?? "");
  const [teamSize, setTeamSize] = useState(
    existing?.team_size != null ? String(existing.team_size) : "",
  );
  const [proposal, setProposal] = useState(existing?.proposal ?? "");
  const [warrantyMonths, setWarrantyMonths] = useState(
    existing?.warranty_months != null ? String(existing.warranty_months) : "",
  );
  const [materialIncluded, setMaterialIncluded] = useState(
    existing?.material_included ?? true,
  );
  const [labourIncluded, setLabourIncluded] = useState(
    existing?.labour_included ?? true,
  );
  const [serviceId, setServiceId] = useState(existing?.service_id ?? "");

  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(
    existing !== null && existing.status !== "withdrawn",
  );
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);

  if (isClient) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        This is your project. Bids appear in the comparison table below.
      </p>
    );
  }

  if (!signedIn) {
    return (
      <Link
        href={`/login?redirect=${encodeURIComponent(`/hire/${briefId}`)}`}
        className="block rounded-xl border p-4 text-center text-sm font-medium transition-colors hover:border-brand"
      >
        Sign in to bid
      </Link>
    );
  }

  if (submitted && !editing) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
        <p className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          Bid {BID_STATUS[existing?.status ?? "submitted"].toLowerCase()}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          You bid {formatPrice(Number(price), currency)}. You can improve it
          until the client decides.
        </p>
        <div className="mt-3 flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Improve bid
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await withdrawBid(briefId);
                if (result.error) {
                  toast.error(result.error);
                  return;
                }
                setSubmitted(false);
                toast.success("Bid withdrawn");
              })
            }
          >
            Withdraw
          </Button>
        </div>
      </div>
    );
  }

  function optionalNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const input: BidInput = {
      price: Number(price),
      priceNote,
      timelineDays: optionalNumber(timelineDays),
      canStartOn: canStartOn || null,
      teamSize: optionalNumber(teamSize),
      proposal,
      warrantyMonths: optionalNumber(warrantyMonths),
      materialIncluded,
      labourIncluded,
      serviceId: serviceId || null,
    };

    startTransition(async () => {
      const result = await submitBid(briefId, input);
      if (result.error) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
      setEditing(false);
      toast.success("Bid submitted");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {services.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="bid-service">Bid under which service?</Label>
          <select
            id="bid-service"
            value={serviceId}
            onChange={(event) => setServiceId(event.target.value)}
            className="h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm"
          >
            <option value="">Not tied to a service</option>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.title}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            A win counts towards that service&rsquo;s record and analytics.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bid-price">Your price ({currency})</Label>
          <Input
            id="bid-price"
            type="number"
            min={0}
            step="any"
            required
            value={price}
            onChange={(event) => {
              setPrice(event.target.value);
              setError(null);
            }}
          />
          {budgetHint && (
            <p className="text-xs text-muted-foreground">{budgetHint}</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bid-timeline">Timeline (days)</Label>
          <Input
            id="bid-timeline"
            type="number"
            min={0}
            value={timelineDays}
            onChange={(event) => setTimelineDays(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bid-proposal">Proposal</Label>
        <AiField
          id="bid-proposal"
          required
          surface="service"
          value={proposal}
          maxLength={5000}
          onValueChange={(next) => {
            setProposal(next);
            setError(null);
          }}
          placeholder="How you would do it, what is included, why you."
          className="min-h-28"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="bid-start">Can start on</Label>
          <Input
            id="bid-start"
            type="date"
            min={today}
            value={canStartOn}
            onChange={(event) => setCanStartOn(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bid-team">Team size</Label>
          <Input
            id="bid-team"
            type="number"
            min={1}
            value={teamSize}
            onChange={(event) => setTeamSize(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bid-warranty">Warranty (months)</Label>
          <Input
            id="bid-warranty"
            type="number"
            min={0}
            value={warrantyMonths}
            onChange={(event) => setWarrantyMonths(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bid-note">Price note</Label>
          <Input
            id="bid-note"
            value={priceNote}
            onChange={(event) => setPriceNote(event.target.value)}
            placeholder="e.g. excludes transport"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={materialIncluded}
            onChange={(event) => setMaterialIncluded(event.target.checked)}
            className="size-4 rounded border"
          />
          Material included
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={labourIncluded}
            onChange={(event) => setLabourIncluded(event.target.checked)}
            className="size-4 rounded border"
          />
          Labour included
        </label>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          type="submit"
          size="lg"
          className="flex-1"
          disabled={
            pending || !price.trim() || proposal.trim().length < 20
          }
        >
          <Gavel className="size-4" />
          {pending ? "Submitting…" : editing ? "Update bid" : "Submit bid"}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
