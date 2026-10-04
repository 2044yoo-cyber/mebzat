"use client";

import Image from "next/image";
import Link from "next/link";
import { useTransition } from "react";
import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { publishItem, unpublishItem } from "@/app/admin/products/actions";
import { catalogueHref, type CatalogueItem, type CatalogueKind } from "@/lib/admin/catalogue-shape";
import { PROJECT_PLACEHOLDER } from "@/lib/constants/placeholders";

/**
 * One product or design project, and the one thing an operator does to it.
 *
 * The title links to the public page. Nobody takes a listing down without
 * looking at it first, and a row that cannot be opened means a second tab and
 * a search.
 */
export function CatalogueRow({
  kind,
  item,
}: {
  kind: CatalogueKind;
  item: CatalogueItem;
}) {
  const [busy, start] = useTransition();

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
          src={item.coverImageUrl || PROJECT_PLACEHOLDER}
          alt=""
          fill
          sizes="64px"
          className="object-cover"
        />
      </div>

      <div className="min-w-0 flex-1">
        <Link
          href={catalogueHref(kind, item)}
          className="block truncate text-sm font-medium hover:underline"
        >
          {item.title}
        </Link>
        <p className="truncate text-xs text-muted-foreground">
          {[item.ownerName, item.detail].filter(Boolean).join(" · ")}
        </p>
      </div>

      <span className="hidden shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground sm:flex">
        <Eye className="size-3.5" />
        {item.views}
      </span>

      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        {item.published ? "on the site" : "draft"}
      </span>

      {item.published ? (
        <button
          type="button"
          onClick={() => act(() => unpublishItem(kind, item.id))}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          <EyeOff className="size-3.5" />
          Take down
        </button>
      ) : (
        <button
          type="button"
          onClick={() => act(() => publishItem(kind, item.id))}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" />
          Publish
        </button>
      )}
    </li>
  );
}
