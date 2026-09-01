"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  Download,
  Heart,
  History,
  RotateCcw,
  Share2,
  Star,
  Trash2,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";

import {
  BUCKET_LABEL,
  bucketOf,
  duplicate,
  purge,
  remove,
  restore,
  toggleFavorite,
  toggleSaved,
  useHistory,
  type HistoryBucket,
  type HistoryEntry,
} from "@/lib/ai/image-history";
import { cn } from "@/lib/utils";

/**
 * The studio's right column.
 *
 * Everything generated in this browser, grouped by when. Favorites, saved
 * designs and deleted are filters over the same list rather than separate
 * stores, so an image cannot be in one and missing from another.
 *
 * `now` is captured once per render pass and passed down, rather than each
 * row reading the clock: bucketing is then a pure function of its inputs, and
 * a long list cannot straddle midnight halfway through rendering.
 */

const TABS: { id: HistoryBucket | "all"; label: string }[] = [
  { id: "all", label: "Recent" },
  { id: "favorites", label: "Favorites" },
  { id: "saved", label: "Saved" },
  { id: "deleted", label: "Deleted" },
];

export function HistoryPanel({
  onContinue,
}: {
  /** Loads an image back into the workspace to keep editing. */
  onContinue: (entry: HistoryEntry) => void;
}) {
  const entries = useHistory();
  const [tab, setTab] = useState<HistoryBucket | "all">("all");
  // One reading, at the top, for the whole render.
  const [now] = useState(() => Date.now());

  const groups = useMemo(() => {
    const live = entries.filter((entry) =>
      tab === "deleted" ? entry.deletedAt : !entry.deletedAt,
    );

    const filtered =
      tab === "favorites"
        ? live.filter((entry) => entry.favorite)
        : tab === "saved"
          ? live.filter((entry) => entry.saved)
          : live;

    if (tab !== "all") {
      return [{ label: BUCKET_LABEL[tab as HistoryBucket] ?? "All", items: filtered }];
    }

    const order: HistoryBucket[] = ["today", "yesterday", "week", "older"];
    return order
      .map((bucket) => ({
        label: BUCKET_LABEL[bucket],
        items: filtered.filter((entry) => bucketOf(entry, now) === bucket),
      }))
      .filter((group) => group.items.length > 0);
  }, [entries, tab, now]);

  const total = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <aside
      aria-label="Image history"
      className="flex h-full flex-col overflow-hidden"
    >
      <div className="flex shrink-0 flex-wrap gap-1 border-b p-2">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-pressed={tab === entry.id}
            className={cn(
              "rounded-lg px-2 py-1 text-xs transition-colors",
              tab === entry.id
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {total === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <History className="size-6 text-muted-foreground" />
            <p className="text-sm font-medium">Nothing here yet</p>
            <p className="max-w-[24ch] text-xs text-muted-foreground">
              Images you generate appear here, grouped by day.
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.label} className="mb-4">
              <p className="px-1 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {group.label}
              </p>
              <ul className="grid grid-cols-2 gap-2">
                {group.items.map((entry) => (
                  <li key={entry.id}>
                    <Card
                      entry={entry}
                      deleted={tab === "deleted"}
                      onContinue={onContinue}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}

function Card({
  entry,
  deleted,
  onContinue,
}: {
  entry: HistoryEntry;
  deleted: boolean;
  onContinue: (entry: HistoryEntry) => void;
}) {
  async function share() {
    const url = entry.url.startsWith("data:") ? null : entry.url;
    if (!url) {
      toast.error("This image only exists in this session. Download it first.");
      return;
    }
    try {
      if (navigator.share) {
        await navigator.share({ title: entry.prompt.slice(0, 60), url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      // A cancelled share is not an error worth reporting.
    }
  }

  return (
    <figure className="group relative overflow-hidden rounded-xl border bg-muted">
      {/* Provider URLs and data URLs both land here; neither benefits from
          the image optimiser, and a data URL cannot use it at all. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={entry.url}
        alt={entry.prompt}
        loading="lazy"
        className="aspect-square w-full object-cover"
      />

      {entry.ephemeral && (
        <span
          title="This image is not saved between reloads. Download it to keep it."
          className="absolute top-1 left-1 rounded-full bg-background/90 px-1.5 text-[9px] backdrop-blur"
        >
          session only
        </span>
      )}

      {entry.favorite && (
        <Heart className="absolute top-1 right-1 size-3.5 fill-rose-500 text-rose-500" />
      )}

      <figcaption className="absolute inset-x-0 bottom-0 flex flex-wrap gap-0.5 bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {deleted ? (
          <>
            <Action label="Restore" onClick={() => restore(entry.id)}>
              <RotateCcw className="size-3" />
            </Action>
            <Action label="Delete forever" onClick={() => purge(entry.id)}>
              <Trash2 className="size-3" />
            </Action>
          </>
        ) : (
          <>
            <Action label="Keep editing" onClick={() => onContinue(entry)}>
              <Wand2 className="size-3" />
            </Action>
            <Action
              label={entry.favorite ? "Unfavorite" : "Favorite"}
              onClick={() => toggleFavorite(entry.id)}
            >
              <Heart className="size-3" />
            </Action>
            <Action
              label={entry.saved ? "Unsave" : "Save design"}
              onClick={() => toggleSaved(entry.id)}
            >
              <Star className="size-3" />
            </Action>
            <Action label="Duplicate" onClick={() => duplicate(entry.id)}>
              <Copy className="size-3" />
            </Action>
            <Action label="Share" onClick={share}>
              <Share2 className="size-3" />
            </Action>
            <a
              href={entry.url}
              download={`medosha-${entry.id.slice(0, 8)}.png`}
              title="Download"
              aria-label="Download"
              className="flex size-6 items-center justify-center rounded bg-background/90 text-foreground backdrop-blur transition-colors hover:bg-background"
            >
              <Download className="size-3" />
            </a>
            <Action label="Delete" onClick={() => remove(entry.id)}>
              <Trash2 className="size-3" />
            </Action>
          </>
        )}
      </figcaption>
    </figure>
  );
}

function Action({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-6 items-center justify-center rounded bg-background/90 text-foreground backdrop-blur transition-colors hover:bg-background"
    >
      {children}
    </button>
  );
}
