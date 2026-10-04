"use client";

import { useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { saveOpening } from "../../services/save-opening";
import type { OpeningSpec } from "../../types/openings";

/**
 * Keeping an opening.
 *
 * The name is asked for rather than taken from the reference, because "W-04"
 * is what it is called on the drawing and "Living room sliding door" is what
 * somebody will search their own list for six weeks later.
 *
 * Saving again updates the same record rather than making a second one — the
 * usual reason to press save twice is that something was changed, not that a
 * copy was wanted.
 */
export function SaveOpening({ spec }: { spec: OpeningSpec }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [designId, setDesignId] = useState<string | null>(null);

  async function save() {
    const name = title.trim() || spec.reference;
    setSaving(true);
    const result = await saveOpening({ designId: designId ?? undefined, spec, title: name });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    setDesignId(result.id);
    setOpen(false);
    toast.success(designId ? "Updated." : `Saved as “${name}”.`);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setTitle(spec.reference);
          setOpen(true);
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
      >
        {designId ? <Check className="size-4" /> : <Save className="size-4" />}
        {designId ? "Saved — save again" : "Save this opening"}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <label className="block">
        <span className="mb-1.5 block text-xs text-muted-foreground">Save as</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Living room sliding door"
          maxLength={160}
          autoFocus
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </label>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-foreground disabled:opacity-50"
        >
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Save
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        The dimensions, materials, glass, hardware and the cut list are all kept.
        Price is not — there is no rate for openings yet, so none is stored
        rather than one being invented.
      </p>
    </div>
  );
}
