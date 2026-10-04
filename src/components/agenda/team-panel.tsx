"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Banknote, FileText, Loader2, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

import {
  inviteMember,
  updateMember,
} from "@/app/(dashboard)/projects/[id]/agenda/actions";
import {
  ActionForm,
  Field,
  PanelHeader,
  inputClass,
  usePanel,
  when,
} from "@/components/agenda/shared";
import {
  AGENDA_ROLES,
  roleLabel,
  type AgendaRole,
} from "@/lib/agenda/constants";
import type { AgendaMember } from "@/lib/data/agenda";
import { cn } from "@/lib/utils";

/**
 * Who is in the Agenda, and how much of it they see.
 *
 * The three permission switches are the brief's "clients control who can view".
 * They are editable only by the client, the project owner or an administrator —
 * and that is enforced by a database trigger, not by hiding the checkbox, so a
 * contractor who forges the request still cannot grant themselves the ledger.
 */
export function TeamPanel({
  projectId,
  members,
  isOwner,
  myUserId,
}: {
  projectId: string;
  members: AgendaMember[];
  isOwner: boolean;
  myUserId: string;
  myRole: AgendaRole;
}) {
  const router = useRouter();
  const panel = usePanel();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, start] = useTransition();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AgendaRole>("contractor");

  const suggested = AGENDA_ROLES.find((entry) => entry.value === role)?.suggests ?? {};

  function toggle(
    member: AgendaMember,
    field: "canViewFinance" | "canViewMeetings" | "canViewContracts",
    value: boolean,
  ) {
    setPendingId(member.id);
    start(async () => {
      const result = await updateMember({
        projectId,
        memberId: member.id,
        [field]: value,
      });
      setPendingId(null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <PanelHeader
        title="Team"
        count={members.length}
        action="Invite someone"
        open={panel.open}
        onToggle={panel.toggle}
      />

      {!isOwner && (
        <p className="rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
          Only the client can change who sees what on this project.
        </p>
      )}

      {panel.open && isOwner && (
        <ActionForm
          submitLabel="Send the invitation"
          onSubmit={() =>
            inviteMember({
              projectId,
              email,
              role,
              canViewFinance: suggested.finance ?? false,
              canViewMeetings: suggested.meetings ?? false,
              canViewContracts: suggested.contracts ?? false,
              canApprove: suggested.approve ?? false,
            })
          }
          onDone={() => {
            panel.setOpen(false);
            setEmail("");
            router.refresh();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Their Medosha email">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                className={inputClass}
                required
              />
            </Field>
            <Field label="Role">
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as AgendaRole)}
                className={inputClass}
              >
                {AGENDA_ROLES.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <p className="text-xs text-muted-foreground">
            {AGENDA_ROLES.find((entry) => entry.value === role)?.blurb} They
            will start with{" "}
            {[
              suggested.finance && "the ledger",
              suggested.meetings && "meeting notes",
              suggested.contracts && "contracts",
            ]
              .filter(Boolean)
              .join(", ") || "site logs and tasks only"}
            . You can change it after they accept.
          </p>
        </ActionForm>
      )}

      <ul className="space-y-2">
        {members.map((member) => (
          <li key={member.id} className="rounded-2xl border p-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-medium">
                {(member.user?.full_name ?? member.user?.username ?? "?")
                  .slice(0, 2)
                  .toUpperCase()}
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {member.user?.full_name ?? member.user?.username ?? "Member"}
                  {member.user_id === myUserId && (
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      you
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {roleLabel(member.role)}
                  {member.status !== "active" && ` · ${member.status}`}
                  {member.accepted_at && ` · joined ${when(member.accepted_at)}`}
                </p>
              </div>

              {pendingId === member.id && (
                <Loader2 className="size-4 animate-spin text-brand" />
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <Permission
                label="Ledger"
                icon={<Banknote className="size-3" />}
                on={member.can_view_finance}
                editable={isOwner}
                onChange={(value) => toggle(member, "canViewFinance", value)}
              />
              <Permission
                label="Meetings"
                icon={<Users className="size-3" />}
                on={member.can_view_meetings}
                editable={isOwner}
                onChange={(value) => toggle(member, "canViewMeetings", value)}
              />
              <Permission
                label="Contracts"
                icon={<FileText className="size-3" />}
                on={member.can_view_contracts}
                editable={isOwner}
                onChange={(value) => toggle(member, "canViewContracts", value)}
              />
              {member.can_approve && (
                <span className="flex items-center gap-1 rounded-full border border-brand/40 px-2 py-0.5 text-[11px] text-brand">
                  <ShieldCheck className="size-3" />
                  Can approve
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Permission({
  label,
  icon,
  on,
  editable,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  on: boolean;
  editable: boolean;
  onChange: (value: boolean) => void;
}) {
  const className = cn(
    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
    on
      ? "border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
      : "text-muted-foreground",
  );

  if (!editable) {
    return (
      <span className={className}>
        {icon}
        {label}
        {on ? "" : " — no"}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={cn(className, "hover:border-brand")}
    >
      {icon}
      {label}
      {on ? "" : " — no"}
    </button>
  );
}
