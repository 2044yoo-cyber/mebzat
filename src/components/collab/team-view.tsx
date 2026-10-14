"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { LEVELS, type Level } from "@/lib/collab/model";

import { setAccess } from "@/app/(dashboard)/agenda/projects/[projectId]/collaborate/actions";

import { Avatar } from "./chrome";
import { useCan, useStudio } from "./studio-context";

/**
 * Who is in the Studio and what each person may do.
 *
 * People join through the project's own invitation (Directory): an invitation
 * goes to a Medosha account by email and is accepted by that person — there
 * are no open links. Here the owner sets each member's Studio level; anybody
 * not set is a commenter. Removing somebody from the project removes them
 * from the Studio in the same step.
 */
export function TeamView() {
  const studio = useStudio();
  const allowed = useCan();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const change = async (userId: string, level: Exclude<Level, "owner">) => {
    setBusy(userId);
    const result = await setAccess(studio.projectId, { userId, level });
    setBusy(null);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("Access updated.");
    router.refresh();
  };
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">Team and access</h2>
        {allowed.manage ? <Link href={`/agenda/projects/${studio.projectId}/directory`} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-foreground"><UserPlus className="size-4" />Invite to the project</Link> : null}
      </div>
      <dl className="grid gap-2 sm:grid-cols-2">
        {LEVELS.map((level) => (
          <div key={level.value} className="rounded-lg border p-2.5"><dt className="text-sm font-semibold">{level.label}</dt><dd className="text-xs text-muted-foreground">{level.summary}</dd></div>
        ))}
      </dl>
      <p className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />Invitations go to a Medosha account by email and must be accepted. Members start as commenters; the project’s owner, client and administrators are owners. Every level is enforced by the database, not just this screen.</p>
      <ul className="divide-y rounded-xl border" aria-label="Members">
        {studio.members.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center gap-3 p-3">
            <Avatar id={member.id} name={member.name} url={member.avatarUrl} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{member.name}{member.id === studio.me.id ? " (you)" : ""}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">{member.role.replace(/_/g, " ")}{member.handle ? ` · @${member.handle}` : ""}</p>
            </div>
            {member.level === "owner" || !allowed.manage ? (
              <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{LEVELS.find((level) => level.value === member.level)?.label}</span>
            ) : (
              <span className="flex items-center gap-1.5">
                {busy === member.id ? <Loader2 className="size-4 animate-spin" /> : null}
                <select aria-label={`Studio access for ${member.name}`} value={member.level} disabled={busy !== null} onChange={(event) => void change(member.id, event.target.value as Exclude<Level, "owner">)} className="h-9 rounded-md border bg-background px-2 text-sm">
                  {LEVELS.filter((level) => level.value !== "owner").map((level) => <option key={level.value} value={level.value}>{level.label}</option>)}
                </select>
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
