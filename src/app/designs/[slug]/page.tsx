import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList, Eye, GitFork, Lock, Pencil } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { DesignCanvas } from "@/features/berchuma-studio/components/public/design-canvas";
import { RemixButton } from "@/features/berchuma-studio/components/public/remix-button";
import {
  getDesign,
  listPublicDesigns,
  recordDesignView,
} from "@/features/berchuma-studio/services/designs";
import { buildParts } from "@/features/berchuma-studio/services/geometry";
import { buildCutList } from "@/features/berchuma-studio/services/cutlist";
import { allBays } from "@/features/berchuma-studio/types/spec";

/**
 * A design's permanent page.
 *
 * The URL is the product. Somebody sends this link to a joiner, a landlord or
 * a client, and it has to still work in a year — which is why the slug is
 * generated once and frozen by a database trigger rather than derived from a
 * title somebody may rename.
 *
 * The price shown is the one snapshotted at publish time, not a fresh
 * calculation. A link whose number moves because a supplier changed a rate on
 * Tuesday is a link nobody can quote from. What is derived live is everything
 * that follows from the design itself — the panel count, the sheets, the
 * days — because those do not move unless the design does.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const design = await getDesign(slug);
  if (!design) return { title: "Design not found" };

  const size = `${design.spec.envelope.width} × ${design.spec.envelope.height} × ${design.spec.envelope.depth} mm`;

  return {
    title: `${design.title} — Berchuma Studio`,
    description: `${label(design.kind)}, ${size}. Designed on Medosha with a full parts list and a price from Ethiopian supplier rates.`,
    // A private design must not be indexable even if the URL leaks; the page
    // itself is already gated by row-level security, this stops the summary
    // from surviving in a search index.
    robots: design.visibility === "public" ? undefined : { index: false },
    openGraph: design.coverUrl ? { images: [design.coverUrl] } : undefined,
  };
}

export default async function DesignPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const design = await getDesign(slug);

  if (!design) notFound();

  // Not awaited into the render path. A view counter that can fail must never
  // be the reason a page does not appear.
  if (!design.isOwner) void recordDesignView(design.id);

  const parts = buildParts(design.spec);
  const cutList = buildCutList(design.spec, parts);
  const bays = allBays(design.spec);
  const related = await listPublicDesigns({
    limit: 6,
    kind: design.kind,
    exclude: design.id,
  });

  const money = (value: number) =>
    `${design.currency} ${Math.round(value).toLocaleString("en-US")}`;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-3 @lg/ws:p-6">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{label(design.kind)}</Badge>
          {design.visibility !== "public" ? (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" aria-hidden />
              {design.visibility === "unlisted" ? "Unlisted" : "Private"}
            </Badge>
          ) : null}
          {design.isTemplate ? <Badge>Template</Badge> : null}
        </div>

        <h1 className="text-2xl font-semibold @lg/ws:text-3xl">{design.title}</h1>

        {design.prompt ? (
          <p className="text-sm text-muted-foreground">
            Asked for: “{design.prompt}”
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={design.owner.username ? `/u/${design.owner.username}` : "#"}
            className="flex items-center gap-2"
          >
            <Avatar className="size-8">
              <AvatarImage src={design.owner.avatarUrl ?? undefined} alt="" />
              <AvatarFallback>{design.owner.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{design.owner.name}</span>
          </Link>

          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Eye className="size-3.5" aria-hidden />
            {design.viewCount.toLocaleString("en-US")}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <GitFork className="size-3.5" aria-hidden />
            {design.remixCount.toLocaleString("en-US")} remixes
          </span>
        </div>

        {/* Attribution, stated rather than implied. A remix is a compliment,
            and the person who made the original should be visible on the page
            that took their work as a starting point. */}
        {design.parent ? (
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            Remixed from{" "}
            <Link href={`/designs/${design.parent.slug}`} className="underline">
              {design.parent.title}
            </Link>{" "}
            by {design.parent.ownerName}.
          </p>
        ) : null}
      </header>

      <DesignCanvas spec={design.spec} />

      <div className="grid gap-4 @2xl/ws:grid-cols-[1fr_280px]">
        <section className="space-y-4">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-medium">What it is</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm @lg/ws:grid-cols-4">
              <Fact
                label="Size"
                value={`${design.spec.envelope.width} × ${design.spec.envelope.height} × ${design.spec.envelope.depth} mm`}
              />
              <Fact label="Cabinets" value={String(design.spec.cabinets.length)} />
              <Fact label="Bays" value={String(bays.length)} />
              <Fact label="Panels" value={String(parts.totals.partCount)} />
              <Fact
                label="Sheets"
                value={String(
                  cutList.byBoard.reduce((sum, board) => sum + board.sheets, 0),
                )}
              />
            </dl>

            <ul className="mt-4 space-y-1 text-sm">
              <li>
                <span className="text-muted-foreground">Carcass: </span>
                {design.spec.carcass.board.label}
              </li>
              <li>
                <span className="text-muted-foreground">Back: </span>
                {design.spec.carcass.backBoard.label}
              </li>
              <li>
                <span className="text-muted-foreground">Edging: </span>
                {design.spec.carcass.edgeBand.label}
              </li>
              <li>
                <span className="text-muted-foreground">Finish: </span>
                {design.spec.finish.colour}, {design.spec.finish.sheen}
              </li>
            </ul>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-medium">Bay by bay</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {bays.map((bay, index) => (
                <li key={bay.id} className="flex justify-between gap-3">
                  <span>
                    <span className="text-muted-foreground">
                      Bay {index + 1}:{" "}
                    </span>
                    {describe(bay.fitting)}
                    {bay.door === "none"
                      ? ", open"
                      : `, ${bay.doorLeaves === 2 ? "pair of " : ""}${bay.door} ${bay.doorLeaves === 2 ? "doors" : "door"}`}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {Math.round(bay.width)} mm
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {design.spec.meta.assumptions.length > 0 ? (
            <div className="rounded-xl border border-dashed p-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Assumed, not measured
              </h2>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                {design.spec.meta.assumptions.map((line, index) => (
                  <li key={`${index}-${line}`}>· {line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <aside className="space-y-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Estimated when published
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {design.estimatedCost === null
                ? "—"
                : money(design.estimatedCost)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {design.priceConfidence === null || design.priceConfidence === 0
                ? "Estimated from catalogue rates — no matching supplier listings at the time."
                : `${Math.round(design.priceConfidence)}% of this came from live supplier listings.`}{" "}
              Remix it to price it at today’s rates.
            </p>
          </div>

          <div className="space-y-2">
            {/* Above the remix button on purpose. Somebody who has found a
                design they like wants to know what it costs to build before
                they want their own copy of it. */}
            <Link
              href={`/designs/${design.slug}/cut-list`}
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border px-4 text-sm font-medium hover:bg-muted"
            >
              <ClipboardList className="size-4" aria-hidden />
              Cut list and quote
            </Link>

            <RemixButton designId={design.id} title={design.title} />
            {design.isOwner ? (
              <Link
                href="/studio"
                className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border px-4 text-sm font-medium hover:bg-muted"
              >
                <Pencil className="size-4" aria-hidden />
                Open in Studio
              </Link>
            ) : null}
          </div>

          <p className="px-1 text-[11px] text-muted-foreground">
            A remix is your own private copy. The original keeps its
            attribution, and its author is told.
          </p>
        </aside>
      </div>

      {related.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-medium">More {label(design.kind)}s</h2>
          <div className="grid grid-cols-2 gap-3 @2xl/ws:grid-cols-3">
            {related.map((card) => (
              <Link
                key={card.id}
                href={`/designs/${card.slug}`}
                className="rounded-xl border bg-card p-3 hover:bg-muted/50"
              >
                <p className="line-clamp-2 text-sm font-medium">{card.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {card.estimatedCost === null
                    ? label(card.kind)
                    : `${card.currency} ${Math.round(card.estimatedCost).toLocaleString("en-US")}`}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Fact({ label: name, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{name}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function label(kind: string): string {
  const words = kind.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * "1 shelf", not "1 shelves".
 *
 * This is a page a customer reads before they pay for something, and a
 * stacked module described as "hanging over 1 shelves over 2 drawers" reads
 * as machine output rather than as a description of their wardrobe.
 */
function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function describe(fitting: { kind: string } & Record<string, unknown>): string {
  switch (fitting.kind) {
    case "shelves":
      return plural(Number(fitting.count), "shelf", "shelves");
    case "hanging":
      return fitting.rails === 2 ? "double hanging" : "hanging";
    case "drawers":
      // A bay counts its drawers in `count`; a stacked section counts them in
      // `drawers`, because a section already has a `count` meaning shelves.
      return plural(Number(fitting.count ?? fitting.drawers), "drawer", "drawers");
    case "stack": {
      // Listed top to bottom, the way the sections are stored and the way
      // somebody describes a wardrobe out loud. A stack summarised as "stack"
      // would tell a customer nothing about what they are buying.
      const sections = Array.isArray(fitting.sections) ? fitting.sections : [];
      const parts = sections.map((section) =>
        describe(section as { kind: string } & Record<string, unknown>),
      );
      return parts.length > 0 ? parts.join(" over ") : "open";
    }
    case "appliance":
      return `${String(fitting.appliance)} housing`;
    default:
      return "open";
  }
}
