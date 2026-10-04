"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { Crown, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { removeAdminMember, saveAdminMember } from "@/app/admin/team/actions";
import { AreaCheckboxes } from "@/components/admin/area-checkboxes";
import { AREA_LABEL } from "@/lib/auth/admin-areas-shape";
import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import type { TeamMember } from "@/lib/admin/team";
import type { AdminArea } from "@/types/database.types";

/**
 * One administrator.
 *
 * The owner's row has no controls at all. There is exactly one owner — a
 * unique index enforces it — and the only safe way to change who that is runs
 * through the database, so offering a button here would be offering something
 * that cannot work.
 *
 * The ticks start from what is stored and are only sent when Save is pressed.
 * A checkbox that writes on every click means an owner adjusting three areas
 * publishes two intermediate grants nobody meant to exist.
 */
export function TeamMemberRow({ member }: { member: TeamMember }) {
  const [areas, setAreas] = useState<AdminArea[]>(member.areas);
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();

  const name = member.fullName ?? member.username ?? "Someone";
  const changed =
    areas.length !== member.areas.length ||
    areas.some((one) => !member.areas.includes(one));

  function save() {
    start(async () => {
      const result = await saveAdminMember(member.userId, areas);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  function remove() {
    start(async () => {
      const result = await removeAdminMember(member.userId);
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <li className="rounded-xl border p-3">
      <div className="flex items-center gap-3">
        <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted">
          <Image
            src={member.avatarUrl || AVATAR_PLACEHOLDER}
            alt=""
            fill
            sizes="40px"
            className="object-cover"
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            {name}
            {member.isOwner && (
              <span className="flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
                <Crown className="size-3" />
                Main administrator
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {member.isOwner
              ? "Every area, and the only person who can change this list"
              : member.areas.length === 0
                ? "No areas yet"
                : member.areas.map((one) => AREA_LABEL[one]).join(" · ")}
          </p>
        </div>

        {!member.isOwner && (
          <button
            type="button"
            onClick={() => setOpen((was) => !was)}
            className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
          >
            {open ? "Close" : "Change"}
          </button>
        )}
      </div>

      {open && !member.isOwner && (
        <div className="mt-3 space-y-3 border-t pt-3">
          <AreaCheckboxes
            value={areas}
            onChange={setAreas}
            disabled={busy}
            idPrefix={`member-${member.userId}`}
          />

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={busy || !changed}
              className="rounded-lg bg-brand px-4 py-1.5 text-xs font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setAreas(member.areas);
                setOpen(false);
              }}
              disabled={busy}
              className="rounded-lg border px-4 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="ml-auto flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              Remove
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
