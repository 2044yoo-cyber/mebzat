"use client";

import { AlertTriangle, Check, CloudOff, Loader2, RotateCw } from "lucide-react";

import { THREAD_STATUSES, type ThreadStatus } from "@/lib/collab/model";
import type { StoreStatus } from "@/lib/collab/item-store";
import { cn } from "@/lib/utils";

import { useStudio, type Presence } from "./studio-context";

/** Saved / saving / not saved — and "saved" only once the server has said so. */
export function SaveStatus({ status, onRetry }: { status: StoreStatus; onRetry?: () => void }) {
  const { online } = useStudio();
  if (!online && status.state !== "saved") {
    return <span role="status" className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400"><CloudOff className="size-3.5" aria-hidden />Offline · {status.pending} unsaved</span>;
  }
  if (status.state === "saving") {
    return <span role="status" className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden />Saving…</span>;
  }
  if (status.state === "unsaved") {
    return (
      <span role="alert" className="inline-flex items-center gap-1.5 text-xs text-destructive">
        <AlertTriangle className="size-3.5" aria-hidden />
        <span className="max-w-56 truncate" title={status.error ?? undefined}>{status.error ?? "Not saved"}</span>
        {onRetry ? <button type="button" onClick={onRetry} className="inline-flex items-center gap-0.5 rounded px-1 font-medium underline"><RotateCw className="size-3" aria-hidden />Retry</button> : null}
      </span>
    );
  }
  return <span role="status" className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="size-3.5" aria-hidden />Saved</span>;
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("") || "?";
const hue = (id: string) => [...id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 360, 7);
export const personColor = (id: string) => `hsl(${hue(id)} 70% 45%)`;

export function Avatar({ id, name, url, size = 24 }: { id: string; name: string; url?: string | null; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- a profile picture from storage, already sized
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white" style={{ width: size, height: size, fontSize: size * 0.4, background: personColor(id) }}>{initials(name)}</span>
  );
}

/** Who else has this Studio open, and where. */
export function PresenceStack({ presence }: { presence: Presence[] }) {
  if (!presence.length) return null;
  return (
    <div className="flex items-center -space-x-1.5" aria-label={`${presence.length} other ${presence.length === 1 ? "person" : "people"} here`}>
      {presence.slice(0, 5).map((person) => (
        <span key={person.userId} title={`${person.name} · ${person.tab}`} className="rounded-full ring-2 ring-card">
          <Avatar id={person.userId} name={person.name} size={26} />
        </span>
      ))}
      {presence.length > 5 ? <span className="ml-2 text-xs text-muted-foreground">+{presence.length - 5}</span> : null}
    </div>
  );
}

export function ThreadStatusChip({ status, className }: { status: ThreadStatus; className?: string }) {
  const entry = THREAD_STATUSES.find((item) => item.value === status)!;
  return (
    <span className={cn(
      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
      entry.tone === "open" && "bg-blue-500/10 text-blue-700 dark:text-blue-300",
      entry.tone === "review" && "bg-violet-500/10 text-violet-700 dark:text-violet-300",
      entry.tone === "warn" && "bg-amber-500/15 text-amber-800 dark:text-amber-300",
      entry.tone === "done" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      className,
    )}>{entry.label}</span>
  );
}

export const pinColor = (status: ThreadStatus) => ({ open: "#1d4ed8", ready_for_review: "#7c3aed", changes_requested: "#d97706", resolved: "#059669", approved: "#059669" })[status];

export function when(iso: string) {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} h ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

export function ToolButton({ label, active, disabled, onClick, children, shortcut }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; shortcut?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-muted disabled:opacity-40", active && "bg-brand/15 text-brand")}
    >
      {children}
    </button>
  );
}
