"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

/**
 * The pieces every Agenda panel is built from.
 *
 * Each panel is the same shape — a list of records with a form that folds out
 * above it — so the shape lives here once. A site manager who has learned to
 * add a daily log has learned to add a ledger entry.
 */

export function PanelHeader({
  title,
  count,
  action,
  open,
  onToggle,
}: {
  title: string;
  count: number;
  action: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-medium">
        {title}
        <span className="ml-1.5 font-normal text-muted-foreground">{count}</span>
      </h2>
      <button
        type="button"
        onClick={onToggle}
        className="flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
      >
        {open ? <X className="size-3.5" /> : <Plus className="size-3.5" />}
        {open ? "Cancel" : action}
      </button>
    </div>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export const textareaClass =
  "min-h-20 w-full rounded-lg border bg-transparent p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** A form that submits through a server action and reports the outcome. */
export function ActionForm({
  submitLabel,
  onSubmit,
  onDone,
  children,
}: {
  submitLabel: string;
  onSubmit: () => Promise<{ error?: string }>;
  onDone: () => void;
  children: ReactNode;
}) {
  const [pending, start] = useTransition();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await onSubmit();
          if (result.error) {
            // The action has already turned the database's refusal into a
            // sentence; nothing raw reaches here.
            toast.error(result.error);
            return;
          }
          toast.success("Recorded");
          onDone();
        });
      }}
      className="space-y-3 rounded-2xl border p-4"
    >
      {children}
      <button
        type="submit"
        disabled={pending}
        className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending && <Loader2 className="size-4 animate-spin" />}
        {submitLabel}
      </button>
    </form>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

export function usePanel() {
  const [open, setOpen] = useState(false);
  return { open, setOpen, toggle: () => setOpen((value) => !value) };
}

/** A date, written the way a site record writes it. */
export function when(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function whenTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
