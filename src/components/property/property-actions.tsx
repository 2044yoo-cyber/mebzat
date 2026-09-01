"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Bookmark, CheckCircle2, MessageSquare, Phone } from "lucide-react";
import { toast } from "sonner";

import {
  enquireAboutProperty,
  toggleSaveProperty,
} from "@/app/property/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Save, enquire, request a viewing, and call. */
export function PropertyActions({
  propertyId,
  ownerPhone,
  saved: initialSaved,
  signedIn,
  isOwner,
}: {
  propertyId: string;
  ownerPhone: string | null;
  saved: boolean;
  signedIn: boolean;
  isOwner: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [message, setMessage] = useState("");
  const [viewingOn, setViewingOn] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);

  if (isOwner) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        This is your listing. Enquiries arrive in your notifications.
      </p>
    );
  }

  function save() {
    if (!signedIn) return;
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = await toggleSaveProperty(propertyId);
      if (result.error) {
        setSaved(!next);
        toast.error(result.error);
      }
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await enquireAboutProperty(
        propertyId,
        message,
        viewingOn || undefined,
        phone || undefined,
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      setSent(true);
      toast.success("Enquiry sent to the seller");
    });
  }

  if (!signedIn) {
    return (
      <Link
        href={`/login?redirect=${encodeURIComponent(`/property/${propertyId}`)}`}
        className="block rounded-xl border p-4 text-center text-sm font-medium transition-colors hover:border-brand"
      >
        Sign in to enquire or save
      </Link>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          aria-pressed={saved}
          disabled={pending}
          onClick={save}
        >
          <Bookmark className={cn("size-4", saved && "fill-current")} />
          {saved ? "Saved" : "Save"}
        </Button>
        {ownerPhone && (
          <a
            href={`tel:${ownerPhone}`}
            className={cn(buttonVariants({ variant: "outline" }), "flex-1")}
          >
            <Phone className="size-4" />
            Call
          </a>
        )}
      </div>

      {sent ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
          <p className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4" />
            Enquiry sent
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            The seller will reply through Medosha messages.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="enquiry-message">Message the seller</Label>
            <Textarea
              id="enquiry-message"
              value={message}
              maxLength={2000}
              onChange={(event) => {
                setMessage(event.target.value);
                setError(null);
              }}
              placeholder="Is this still available? I'd like to know more about…"
              className="min-h-24"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="enquiry-date">Viewing date</Label>
              <Input
                id="enquiry-date"
                type="date"
                min={today}
                value={viewingOn}
                onChange={(event) => setViewingOn(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="enquiry-phone">Your phone</Label>
              <Input
                id="enquiry-phone"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="Optional"
              />
            </div>
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
            disabled={pending || message.trim().length < 5}
          >
            <MessageSquare className="size-4" />
            {pending ? "Sending…" : "Send enquiry"}
          </Button>
        </form>
      )}
    </div>
  );
}
