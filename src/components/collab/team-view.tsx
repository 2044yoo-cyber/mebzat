"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Link2, Loader2, ShieldCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

import { roleLabel } from "@/lib/agenda/constants";
import { INVITE_DAYS, INVITE_ROLES, INVITE_USES, inviteUrl, LEVELS, type InviteRole, type Level } from "@/lib/collab/model";
import { inviteState, readInvites, type Invite } from "@/lib/collab/queries";
import { createClient } from "@/lib/supabase/client";

import { createInviteLink, revokeInviteLink, setAccess } from "@/app/(dashboard)/agenda/projects/[projectId]/collaborate/actions";

import { Avatar } from "./chrome";
import { useCan, useStudio } from "./studio-context";

/**
 * Who is in the Studio and what each person may do.
 *
 * People join through the project's own invitation (Directory), which goes
 * to a Medosha account by email, or through an invitation link the owner
 * makes here (0107): signed-in accounts only, expiring, for a set number of
 * people, withdrawable. Here the owner also sets each member's Studio level;
 * anybody not set is a commenter. Removing somebody from the project removes
 * them from the Studio in the same step.
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
      <p className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand" />Invitations go to a Medosha account by email, or by a link that needs a signed-in account. Members start as commenters; the project’s owner, client and administrators are owners. Every level is enforced by the database, not just this screen.</p>
      {allowed.manage ? <InviteLinks /> : null}
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

/** The owner's invitation links: make one, copy it once, withdraw it. */
function InviteLinks() {
  const studio = useStudio();
  const { projectId } = studio;
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [making, setMaking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState<{ url: string; copied: boolean } | null>(null);
  const [form, setForm] = useState<{ level: "editor" | "commenter" | "viewer"; role: InviteRole; days: 1 | 7 | 30; maxUses: 1 | 5 | 25; label: string }>({ level: "commenter", role: "employee", days: 7, maxUses: 1, label: "" });

  const load = useCallback(async () => setInvites(await readInvites(createClient(), projectId)), [projectId]);
  useEffect(() => {
    let live = true;
    readInvites(createClient(), projectId).then((list) => { if (live) setInvites(list); }, () => { if (live) setInvites([]); });
    return () => { live = false; };
  }, [projectId]);

  const create = async () => {
    setBusy("new");
    const result = await createInviteLink(projectId, { ...form, label: form.label || undefined });
    setBusy(null);
    if (!result.ok) { toast.error(result.error); return; }
    setMade({ url: inviteUrl(window.location.origin, result.token), copied: false });
    setMaking(false);
    await load();
  };
  const copy = async () => {
    if (!made) return;
    try { await navigator.clipboard.writeText(made.url); setMade({ ...made, copied: true }); } catch { toast.info("Select the link and copy it."); }
  };
  const revoke = async (id: string) => {
    setBusy(id);
    const result = await revokeInviteLink(projectId, id);
    setBusy(null);
    if (!result.ok) { toast.error(result.error); return; }
    toast.success("Link withdrawn. Anybody who already joined by it is still on the team.");
    await load();
  };

  const field = "mt-1 block h-9 w-full rounded-md border bg-background px-2 text-sm font-normal";
  return (
    <section aria-label="Invitation links" className="space-y-2 rounded-xl border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 items-center gap-1.5 text-sm font-semibold"><Link2 className="size-4 text-brand" />Invitation links</h3>
        {!making ? <button type="button" onClick={() => { setMaking(true); setMade(null); }} className="inline-flex min-h-9 items-center gap-1 rounded-lg border px-3 text-sm hover:border-brand">New link</button> : null}
      </div>
      {made ? (
        <div className="space-y-1.5 rounded-lg border border-brand/40 bg-brand/5 p-2.5" role="status">
          <p className="text-xs font-medium">Copy this link now — it is shown only once. Anybody signed in who has it can join, until it expires or is used up.</p>
          <div className="flex gap-1.5">
            <input readOnly value={made.url} aria-label="Link to send" onFocus={(event) => event.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 font-mono text-xs" />
            <button type="button" onClick={() => void copy()} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-brand px-3 text-sm font-medium text-brand-foreground">{made.copied ? <Check className="size-4" /> : <Copy className="size-4" />}{made.copied ? "Copied" : "Copy"}</button>
          </div>
        </div>
      ) : null}
      {making ? (
        <form aria-label="New invitation link" className="grid gap-2 rounded-lg bg-muted/30 p-2.5 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void create(); }}>
          <label className="text-xs font-medium">They can<select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value as typeof form.level })} className={field}><option value="viewer">View</option><option value="commenter">Comment</option><option value="editor">Edit</option></select></label>
          <label className="text-xs font-medium">Role on the project<select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as InviteRole })} className={field}>{INVITE_ROLES.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
          <label className="text-xs font-medium">Expires after<select value={form.days} onChange={(event) => setForm({ ...form, days: Number(event.target.value) as typeof form.days })} className={field}>{INVITE_DAYS.map((days) => <option key={days} value={days}>{days === 1 ? "1 day" : `${days} days`}</option>)}</select></label>
          <label className="text-xs font-medium">How many people<select value={form.maxUses} onChange={(event) => setForm({ ...form, maxUses: Number(event.target.value) as typeof form.maxUses })} className={field}>{INVITE_USES.map((uses) => <option key={uses} value={uses}>{uses === 1 ? "1 person" : `up to ${uses} people`}</option>)}</select></label>
          <label className="text-xs font-medium sm:col-span-2">Note for yourself (optional)<input value={form.label} maxLength={80} onChange={(event) => setForm({ ...form, label: event.target.value })} placeholder="e.g. Client review" className={field} /></label>
          {form.level === "editor" ? <p className="text-xs text-amber-700 sm:col-span-2 dark:text-amber-400">Whoever uses this link can change boards and drawings. Keep it to people you trust.</p> : null}
          <div className="flex gap-2 sm:col-span-2">
            <button type="submit" disabled={busy === "new"} className="inline-flex min-h-9 items-center gap-1 rounded-md bg-brand px-3 text-sm font-medium text-brand-foreground disabled:opacity-50">{busy === "new" ? <Loader2 className="size-4 animate-spin" /> : null}Make link</button>
            <button type="button" onClick={() => setMaking(false)} className="min-h-9 rounded-md border px-3 text-sm">Cancel</button>
          </div>
        </form>
      ) : null}
      {invites === null ? <p className="text-xs text-muted-foreground"><Loader2 className="mr-1 inline size-3.5 animate-spin" />Loading links…</p> : invites.length === 0 ? <p className="text-xs text-muted-foreground">No links yet. A link is the quickest way to bring in a client or consultant who already has, or will make, a Medosha account.</p> : (
        <ul className="divide-y rounded-lg border" aria-label="Links">
          {invites.map((invite) => {
            const state = inviteState(invite);
            return (
              <li key={invite.id} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{invite.label || `${LEVELS.find((level) => level.value === invite.level)?.label} link`}</p>
                  <p className="text-xs text-muted-foreground">{LEVELS.find((level) => level.value === invite.level)?.label} · {roleLabel(invite.role as InviteRole)} · used {invite.uses} of {invite.maxUses} · {state === "active" ? `expires ${new Date(invite.expiresAt).toLocaleDateString()}` : state === "revoked" ? "withdrawn" : state === "expired" ? "expired" : "used up"}</p>
                </div>
                {state === "active" ? (
                  <button type="button" onClick={() => void revoke(invite.id)} disabled={busy !== null} aria-label={`Withdraw ${invite.label || "link"}`} className="inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs text-destructive hover:border-destructive disabled:opacity-50">{busy === invite.id ? <Loader2 className="size-3.5 animate-spin" /> : null}Withdraw</button>
                ) : <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{state === "revoked" ? "Withdrawn" : state === "expired" ? "Expired" : "Used up"}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
