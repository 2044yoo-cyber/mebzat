"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  approveItem,
  decideAppeal,
  removeItem,
  resolveReports,
} from "@/app/admin/moderation/actions";
import { Button } from "@/components/ui/button";

/**
 * One case in the queue.
 *
 * No thumbnail and no post body, because moderation_items does not hold them.
 * What a moderator gets here is the case file; judging the content means
 * opening the content. That is a deliberate cost — the alternative is a table
 * full of copies of the material this system exists to remove.
 */

export type QueueItem = {
  id: string;
  content_type: string;
  content_id: string | null;
  user_id: string | null;
  status: string;
  category: string | null;
  reason: string | null;
  confidence: number | null;
  provider: string | null;
  model: string | null;
  report_count: number;
  appeal_status: string;
  created_at: string;
  reviewed_at: string | null;
};

const CATEGORY_LABEL: Record<string, string> = {
  sexual_explicit: "Sexual / explicit",
  sexual_minors: "Sexual — minors",
  harassment: "Harassment",
  hate: "Hate speech",
  threats: "Threats",
  violence: "Violence",
  scam: "Scam",
  spam: "Spam",
  illegal: "Illegal",
  other: "Other",
};

export function QueueRow({ item }: { item: QueueItem }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);

  const critical = item.category === "sexual_minors";

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    start(async () => {
      const r = await fn();
      if (r.ok) toast.success(r.message);
      else toast.error(r.message);
    });
  }

  return (
    <li
      className={`rounded-xl border p-3 ${
        critical
          ? "border-destructive/40 bg-destructive/5"
          : "border-border bg-card"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="font-medium text-foreground">{item.content_type}</span>
        {item.category && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              critical
                ? "bg-destructive text-destructive-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {CATEGORY_LABEL[item.category] ?? item.category}
          </span>
        )}
        {item.report_count > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400">
            {item.report_count} report{item.report_count === 1 ? "" : "s"}
          </span>
        )}
        {item.appeal_status === "open" && (
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs text-brand">
            appeal open
          </span>
        )}
      </div>

      <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="inline">content </dt>
          <dd className="inline font-mono">{item.content_id ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline">author </dt>
          <dd className="inline font-mono">{item.user_id ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline">checked by </dt>
          <dd className="inline">
            {item.provider ?? "—"}
            {item.model ? ` / ${item.model}` : ""}
            {item.confidence !== null
              ? ` (${(item.confidence * 100).toFixed(0)}%)`
              : ""}
          </dd>
        </div>
        <div>
          <dt className="inline">raised </dt>
          <dd className="inline">
            {new Date(item.created_at).toLocaleString()}
          </dd>
        </div>
      </dl>

      {item.reason && (
        <p className="mt-1.5 text-xs text-muted-foreground">{item.reason}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!critical && item.status !== "safe" && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => run(() => approveItem(item.id))}
          >
            Approve
          </Button>
        )}
        {item.status !== "blocked" && (
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => setOpen((v) => !v)}
          >
            Remove
          </Button>
        )}
        {item.report_count > 0 && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => resolveReports(item.id))}
          >
            Resolve reports
          </Button>
        )}
        {item.appeal_status === "open" && (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run(() => decideAppeal(item.id, true, note))}
            >
              Grant appeal
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => run(() => decideAppeal(item.id, false, note))}
            >
              Deny
            </Button>
          </>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Reason — recorded on the strike and in the audit log."
            className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-2 text-sm outline-none focus:ring-2 focus:ring-brand/30"
          />
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || note.trim().length < 3}
            onClick={() => run(() => removeItem(item.id, note))}
          >
            Confirm removal
          </Button>
        </div>
      )}
    </li>
  );
}
