"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { reinstateAccount, restrictAccount } from "@/app/admin/users/actions";
import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import type { Person } from "@/lib/admin/people";

/**
 * One account, and what an operator can do to it.
 *
 * Restricting asks for a reason before it will proceed. The account holder is
 * shown that sentence when they next try to publish, and "your account cannot
 * publish" with no reason is what makes somebody give up rather than appeal.
 */
export function PersonRow({ person }: { person: Person }) {
  const [busy, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");

  const restricted =
    person.restrictedUntil !== null && new Date(person.restrictedUntil) > new Date();

  function restrict() {
    start(async () => {
      const result = await restrictAccount(person.id, reason);
      if (result.ok) {
        setAsking(false);
        setReason("");
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    });
  }

  function reinstate() {
    start(async () => {
      const result = await reinstateAccount(person.id);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <li className="rounded-xl border p-3">
      <div className="flex items-center gap-3">
        <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
          <Image
            src={person.avatarUrl || AVATAR_PLACEHOLDER}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {person.fullName || person.companyName || person.username || "Unnamed"}
            {person.isAdmin && (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                admin
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {person.username ? `@${person.username}` : person.id}
          </p>
        </div>

        {restricted ? (
          <button
            type="button"
            onClick={reinstate}
            disabled={busy}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
          >
            <ShieldCheck className="size-3.5" />
            Reinstate
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setAsking((open) => !open)}
            disabled={busy || person.isAdmin}
            title={person.isAdmin ? "An administrator cannot be restricted from here" : undefined}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-40"
          >
            <ShieldAlert className="size-3.5" />
            Restrict
          </button>
        )}
      </div>

      {restricted && (
        <p className="mt-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900 dark:text-amber-200">
          Cannot publish until{" "}
          {new Date(person.restrictedUntil!).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
          {person.restrictionReason ? ` — ${person.restrictionReason}` : ""}
        </p>
      )}

      {asking && !restricted && (
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why? The account holder is shown this."
            autoFocus
            className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={restrict}
            disabled={busy || reason.trim().length === 0}
            className="rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Restrict for a week
          </button>
        </div>
      )}
    </li>
  );
}
