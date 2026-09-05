"use client";

import { ADMIN_AREAS, AREA_HINT, AREA_LABEL } from "@/lib/auth/admin-areas-shape";
import type { AdminArea } from "@/types/database.types";

/**
 * What one administrator is allowed to touch.
 *
 * A tick per area rather than a role name. Roles read tidily until the day
 * somebody needs "reports and prices but not accounts", and then you either
 * invent a fourth role or give them too much — and giving them too much is
 * what always happens.
 *
 * "Everything" is a control over the ticks, not a twelfth permission: it sets
 * them all and clears them all, and holding all eleven is the same grant as
 * ticking them one at a time. Nothing is stored that says "everything", so a
 * new area added later does not silently land in somebody's hands.
 */
export function AreaCheckboxes({
  value,
  onChange,
  disabled = false,
  idPrefix,
}: {
  value: AdminArea[];
  onChange: (next: AdminArea[]) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const held = new Set(value);
  const all = held.size === ADMIN_AREAS.length;

  function toggle(area: AdminArea, on: boolean) {
    const next = new Set(held);
    if (on) next.add(area);
    else next.delete(area);
    onChange(ADMIN_AREAS.filter((one) => next.has(one)));
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs font-medium">
        <input
          type="checkbox"
          checked={all}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked ? [...ADMIN_AREAS] : [])}
          className="size-4 rounded border-input accent-brand"
        />
        Everything
      </label>

      <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
        {ADMIN_AREAS.map((area) => {
          const id = `${idPrefix}-${area}`;
          return (
            <label
              key={area}
              htmlFor={id}
              className="flex cursor-pointer items-start gap-2 rounded-lg px-1 py-1 transition-colors hover:bg-muted"
            >
              <input
                id={id}
                type="checkbox"
                checked={held.has(area)}
                disabled={disabled}
                onChange={(event) => toggle(area, event.target.checked)}
                className="mt-0.5 size-4 shrink-0 rounded border-input accent-brand"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium leading-tight">
                  {AREA_LABEL[area]}
                </span>
                <span className="block text-xs leading-tight text-muted-foreground">
                  {AREA_HINT[area]}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
