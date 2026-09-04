"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Ruler, X } from "lucide-react";
import { toast } from "sonner";

import {
  moderateQuarantinedImage,
  signQuarantinePreview,
} from "@/app/moderation/upload-actions";
import { createClient } from "@/lib/supabase/client";
import { sceneName } from "@/lib/tour/panorama-image";

/**
 * Adding a floor plan to a tour.
 *
 * The same quarantine → check → publish path as every other upload. A PDF has
 * nothing an image classifier can read, so it comes back `review` and waits
 * for a person — which is the right answer, and now a working state rather
 * than a dead end.
 */

export type DraftPlan = {
  key: string;
  title: string;
  /** A published URL, or a signed link into quarantine while in review. */
  url: string;
  mediaType: "image" | "pdf";
  width?: number | null;
  height?: number | null;
  pending?: boolean;
  quarantinePath?: string;
  moderationItemId?: string;
};

const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_SIZE = 25 * 1024 * 1024;
const MAX_PLANS = 20;

export function FloorPlanInput({
  userId,
  plans,
  onChange,
}: {
  userId: string;
  plans: DraftPlan[];
  onChange: (plans: DraftPlan[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    if (plans.length + files.length > MAX_PLANS) {
      toast.error(`You can add up to ${MAX_PLANS} plans.`);
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const added: DraftPlan[] = [];
    let held = 0;
    let refused = 0;

    for (const file of files) {
      if (!ACCEPTED.includes(file.type)) {
        toast.error(`${file.name} is not a JPEG, PNG, WebP or PDF.`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        toast.error(`${file.name} is over 25MB.`);
        continue;
      }

      const pdf = file.type === "application/pdf";
      const extension = pdf ? "pdf" : (file.name.split(".").pop() ?? "jpg");
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;

      const upload = await supabase.storage
        .from("moderation-quarantine")
        .upload(path, file, { contentType: file.type });

      if (upload.error) {
        toast.error(upload.error.message);
        continue;
      }

      const verdict = await moderateQuarantinedImage({
        quarantinePath: path,
        contentType: "floor_plan",
        publicBucket: "floor-plans",
      });

      if (verdict.status === "blocked") {
        refused += 1;
        continue;
      }

      const title = sceneName(file.name, plans.length + added.length);
      const mediaType: "image" | "pdf" = pdf ? "pdf" : "image";

      if (verdict.status === "safe" && verdict.publicUrl) {
        added.push({ key: crypto.randomUUID(), title, url: verdict.publicUrl, mediaType });
        continue;
      }

      held += 1;
      const preview = await signQuarantinePreview(path);
      if (!preview) {
        toast.error(`${file.name} was uploaded but cannot be shown yet.`);
        continue;
      }

      added.push({
        key: crypto.randomUUID(),
        title,
        url: preview,
        mediaType,
        pending: true,
        quarantinePath: path,
        moderationItemId: verdict.itemId,
      });
    }

    setBusy(false);
    if (added.length > 0) onChange([...plans, ...added]);

    if (refused > 0) {
      toast.error(
        refused === 1
          ? "One plan cannot be published because it violates Medosha's content guidelines."
          : `${refused} plans cannot be published because they violate Medosha's content guidelines.`,
      );
    }
    if (held > 0) {
      toast.info(
        held === 1
          ? "One plan is being reviewed. It is in your tour — visitors will see it once it is cleared."
          : `${held} plans are being reviewed. They are in your tour — visitors will see them once they are cleared.`,
      );
    }
  }

  return (
    <div className="space-y-2">
      {plans.map((plan) => (
        <div key={plan.key} className="flex items-center gap-3 rounded-xl border bg-card p-2">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {plan.mediaType === "pdf" ? (
              <FileText className="size-4" />
            ) : (
              <Ruler className="size-4" />
            )}
          </span>

          {plan.pending && (
            <span
              className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
              title="Only you can see this plan until it has been reviewed"
            >
              In review
            </span>
          )}

          <label className="min-w-0 flex-1">
            <span className="sr-only">Name of this plan</span>
            <input
              value={plan.title}
              onChange={(event) =>
                onChange(
                  plans.map((one) =>
                    one.key === plan.key ? { ...one, title: event.target.value } : one,
                  ),
                )
              }
              placeholder="Apartment 402"
              maxLength={80}
              className="w-full rounded-lg border-0 bg-transparent px-1 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </label>

          <button
            type="button"
            onClick={() => onChange(plans.filter((one) => one.key !== plan.key))}
            aria-label={`Remove ${plan.title || "this plan"}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg text-destructive hover:bg-muted"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || plans.length >= MAX_PLANS}
        className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        {busy ? <Loader2 className="size-5 animate-spin" /> : <Ruler className="size-5" />}
        {busy ? "Uploading…" : "Add a floor plan"}
        <span className="text-xs">JPEG, PNG, WebP or PDF, up to 25MB</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        multiple
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
