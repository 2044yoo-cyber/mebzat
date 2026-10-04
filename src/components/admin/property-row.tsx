"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { restoreProperty, withdrawProperty } from "@/app/admin/properties/actions";
import { PROJECT_PLACEHOLDER } from "@/lib/constants/placeholders";
import type { AdminProperty } from "@/lib/admin/properties";

/**
 * One listing, and the two things an operator does to it.
 *
 * The title links to the public page, because the first thing anybody does
 * before withdrawing a listing is look at it.
 */
export function PropertyRow({ property }: { property: AdminProperty }) {
  const [busy, start] = useTransition();
  const withdrawn = property.status === "withdrawn";

  function act(action: () => Promise<{ ok: boolean; message: string }>) {
    start(async () => {
      const result = await action();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <li className="flex items-center gap-3 rounded-xl border p-3">
      <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
        <Image
          src={property.coverImageUrl || PROJECT_PLACEHOLDER}
          alt=""
          fill
          sizes="64px"
          className="object-cover"
        />
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href={`/property/${property.id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {property.title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {[
            property.ownerName,
            property.neighbourhood,
            property.price !== null
              ? `${property.currency} ${property.price.toLocaleString()}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <span className="hidden shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground sm:flex">
        <Eye className="size-3.5" />
        {property.viewCount}
      </span>

      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        {property.status.replace("_", " ")}
      </span>

      {withdrawn ? (
        <button
          type="button"
          onClick={() => act(() => restoreProperty(property.id))}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" />
          Restore
        </button>
      ) : (
        <button
          type="button"
          onClick={() => act(() => withdrawProperty(property.id))}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          <EyeOff className="size-3.5" />
          Withdraw
        </button>
      )}
    </li>
  );
}
