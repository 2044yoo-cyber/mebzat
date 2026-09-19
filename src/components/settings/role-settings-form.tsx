"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { setRoles } from "@/app/(dashboard)/settings/role-actions";
import { ROLES } from "@/lib/profile/roles";
import { cn } from "@/lib/utils";
import type { MedoshaRole } from "@/types/database.types";

/**
 * How you use Medosha, changeable.
 *
 * More than one may be ticked. The brief asked only that a first choice not
 * lock somebody in, and an array was already the storage — so allowing two is
 * a checkbox rather than a system, and an architect who also sells fittings
 * does not have to pick which of the two Medosha is allowed to know about.
 *
 * Unticking a role hides its screens and keeps its record. Nothing is deleted.
 */
export function RoleSettingsForm({
  initialRoles,
  initialPrimary,
}: {
  initialRoles: MedoshaRole[];
  initialPrimary: MedoshaRole;
}) {
  const [selected, setSelected] = useState<MedoshaRole[]>(initialRoles);
  const [primary, setPrimary] = useState<MedoshaRole>(initialPrimary);
  const [pending, start] = useTransition();

  function toggle(role: MedoshaRole) {
    setSelected((current) =>
      current.includes(role)
        ? current.filter((r) => r !== role)
        : [...current, role],
    );
  }

  return (
    <form
      action={(formData) =>
        start(async () => {
          const result = await setRoles(formData);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Saved");
        })
      }
      className="space-y-3"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {ROLES.map((role) => {
          const Icon = role.icon;
          const on = selected.includes(role.value);
          return (
            <label
              key={role.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                on ? "border-brand bg-brand/5" : "hover:bg-muted",
              )}
            >
              <input
                type="checkbox"
                name="roles"
                value={role.value}
                checked={on}
                onChange={() => toggle(role.value)}
                className="mt-1 size-4 rounded border"
              />
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  on ? "text-brand" : "text-muted-foreground",
                )}
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{role.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {role.blurb}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {selected.length > 1 && (
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Which one you lead with
          </span>
          <select
            name="primary"
            value={primary}
            onChange={(event) => setPrimary(event.target.value as MedoshaRole)}
            className="h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {ROLES.filter((role) => selected.includes(role.value)).map(
              (role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ),
            )}
          </select>
        </label>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || selected.length === 0}
          className="flex h-9 items-center gap-2 rounded-xl bg-brand px-3.5 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending && <Loader2 className="size-4 animate-spin" />}
          Save
        </button>
        <p className="text-xs text-muted-foreground">
          Unticking one hides its screens and keeps everything you filled in.
        </p>
      </div>
    </form>
  );
}
