import type { Metadata } from "next";
import Link from "next/link";
import { Eye, GitFork, Sparkles } from "lucide-react";

import {
  listOwnDesigns,
  listPublicDesigns,
  type DesignCard,
} from "@/features/berchuma-studio/services/designs";
import { designKinds } from "@/features/berchuma-studio/types/spec";

export const metadata: Metadata = {
  title: "Designs — Berchuma Studio",
  description:
    "Fitted furniture designed on Medosha, with parts lists and prices from Ethiopian supplier rates. Remix any of them.",
};

export const dynamic = "force-dynamic";

/**
 * The gallery.
 *
 * Public designs first, because the point of publishing is being found. A
 * signed-in member's own drafts sit underneath, which is the only place they
 * exist — a private design is invisible to `public_designs` by row-level
 * security, not by a filter written here.
 */
export default async function DesignsPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; mine?: string }>;
}) {
  const { kind, mine } = await searchParams;
  // `?mine=1` is what the sidebar's "My Projects" points at. It reuses this
  // page rather than adding a second one, because the member's own designs
  // were already loaded here — they were just below the fold.
  const onlyMine = mine === "1";
  const filter = designKinds.includes(kind as (typeof designKinds)[number])
    ? kind ?? null
    : null;

  const [published, own] = await Promise.all([
    onlyMine
      ? Promise.resolve([])
      : listPublicDesigns({ limit: 36, kind: filter }),
    listOwnDesigns(onlyMine ? 60 : 12),
  ]);
  const designs = onlyMine ? own : published;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-3 @lg/ws:p-6">
      <header>
        <h1 className="text-2xl font-semibold">
          {onlyMine ? "My designs" : "Designs"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {onlyMine
            ? "Everything you have designed in Berchuma Studio, published or not."
            : "Fitted furniture designed on Medosha. Every one carries its own parts list and a price built from supplier rates — open any of them and remix it into your own."}
        </p>
      </header>

      <nav className="flex flex-wrap gap-1.5">
        <Chip href="/designs" active={filter === null && !onlyMine}>
          All
        </Chip>
        <Chip href="/designs?mine=1" active={onlyMine}>
          Mine
        </Chip>
        {designKinds.map((entry) => (
          <Chip
            key={entry}
            href={`/designs?kind=${entry}`}
            active={filter === entry && !onlyMine}
          >
            {label(entry)}
          </Chip>
        ))}
      </nav>

      {designs.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 @2xl/ws:grid-cols-3">
          {designs.map((design) => (
            <Card key={design.id} design={design} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <Sparkles
            className="mx-auto size-6 text-muted-foreground/50"
            aria-hidden
          />
          <p className="mt-2 text-sm font-medium">
            {onlyMine
              ? "You have not designed anything yet"
              : filter
                ? `No published ${label(filter).toLowerCase()}s yet`
                : "Nothing published yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {onlyMine
              ? "Anything you design in Berchuma Studio appears here, published or not."
              : "Design something in Berchuma Studio and publish it — it will appear here and on the feed."}
          </p>
          <Link
            href="/studio"
            className="mt-3 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Open Berchuma Studio
          </Link>
        </div>
      )}

      {!onlyMine && own.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium">Yours</h2>
          <div className="grid grid-cols-2 gap-3 @2xl/ws:grid-cols-3">
            {own.map((design) => (
              <Card key={design.id} design={design} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Card({ design }: { design: DesignCard }) {
  return (
    <Link
      href={`/designs/${design.slug}`}
      className="flex flex-col rounded-xl border bg-card p-3 hover:bg-muted/50"
    >
      <p className="line-clamp-2 text-sm font-medium">{design.title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label(design.kind)}</p>

      <p className="mt-2 text-sm font-semibold tabular-nums">
        {design.estimatedCost === null
          ? "Not priced"
          : `${design.currency} ${Math.round(design.estimatedCost).toLocaleString("en-US")}`}
      </p>

      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Eye className="size-3" aria-hidden />
          {design.viewCount}
        </span>
        <span className="flex items-center gap-1">
          <GitFork className="size-3" aria-hidden />
          {design.remixCount}
        </span>
        {design.ownerName ? (
          <span className="ml-auto truncate">{design.ownerName}</span>
        ) : null}
      </div>
    </Link>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        active
          ? "rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          : "rounded-full border px-3 py-1.5 text-xs hover:bg-muted"
      }
    >
      {children}
    </Link>
  );
}

function label(kind: string): string {
  const words = kind.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
