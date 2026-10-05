import type { Metadata } from "next";
import Link from "next/link";
import { Eye, GitFork, Plus, Sparkles } from "lucide-react";

import { FrontDrawing } from "@/features/berchuma-studio/components/front-drawing";
import { ProjectActions } from "@/features/berchuma-studio/components/public/project-actions";
import {
  CABINET_TYPES,
  buildTemplate,
  templatesFor,
  type CabinetType,
} from "@/features/berchuma-studio/services/cabinet-templates";
import {
  listOwnDesigns,
  listPublicDesigns,
  type DesignCard,
} from "@/features/berchuma-studio/services/designs";
import { frontDrawing } from "@/features/berchuma-studio/services/front-drawing";
import { PROJECT_STATUS_LABELS, designKinds } from "@/features/berchuma-studio/types/spec";

export const metadata: Metadata = {
  title: "Cabinet Template Gallery — Cabinet Design",
  description:
    "Cabinet designs and templates you can customize, with cut lists and prices from Ethiopian supplier rates.",
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
  searchParams: Promise<{ kind?: string; mine?: string; type?: string }>;
}) {
  const { kind, mine, type } = await searchParams;
  // Which category of templates the gallery shows. One at a time: each card
  // is a real design built for the category's usual space, and building all
  // of them for every visit would be most of the page's time.
  const templateType: CabinetType = CABINET_TYPES.some((entry) => entry.type === type) ? (type as CabinetType) : "wardrobe";
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
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {onlyMine ? "My Projects" : "Cabinet Template Gallery"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {onlyMine
              ? "All your cabinet designs, published or not."
              : "Cabinets designed on Medosha. Every one carries its own parts list and a price built from supplier rates — open any of them and remix it into your own."}
          </p>
        </div>
        {/* The way in was only ever shown on the empty state, so as soon as
            one design existed there was nothing on the page inviting a second.
            This is the Digital Marketplace tab's equivalent of "Post an item". */}
        <Link
          href="/studio"
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground sm:w-auto"
        >
          <Plus className="size-4" /> Design something
        </Link>
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

      {onlyMine ? null : <TemplateGallery type={templateType} />}

      {!onlyMine && designs.length > 0 ? <h2 className="text-sm font-medium">Published designs</h2> : null}
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
              ? "Any cabinet you design appears here, published or not."
              : "Design a cabinet and publish it — it will appear here and on the feed."}
          </p>
          <Link
            href="/studio"
            className="mt-3 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Open Cabinet Design
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

/**
 * The template gallery: every Cabinet Design template of one category, drawn
 * as the design it makes at the category's usual size. "Use Template" opens
 * the start steps on it, which ask for the space and lay it out to fit.
 */
function TemplateGallery({ type }: { type: CabinetType }) {
  const category = CABINET_TYPES.find((entry) => entry.type === type)!;
  return (
    <section className="space-y-3" aria-label="Cabinet templates">
      <h2 className="text-sm font-medium">Templates</h2>
      <nav className="flex flex-wrap gap-1.5" aria-label="Template categories">
        {CABINET_TYPES.map((entry) => (
          <Chip key={entry.type} href={`/designs?type=${entry.type}`} active={entry.type === type}>
            {entry.label}
          </Chip>
        ))}
      </nav>
      <div className="grid grid-cols-2 gap-3 @2xl/ws:grid-cols-4">
        {templatesFor(type).map((template) => {
          const spec = template.build ? buildTemplate(template.id, category.space, { layout: template.layouts?.[0] }) : null;
          return (
            <div key={template.id} className="flex flex-col rounded-xl border bg-card p-3">
              <div className="flex h-28 items-center justify-center rounded-lg bg-muted/30 p-2 text-foreground/70">
                {spec ? <FrontDrawing drawing={frontDrawing(spec)} className="h-full w-full" /> : <span className="text-xs text-muted-foreground">Laid out by the kitchen setup</span>}
              </div>
              <p className="mt-2 text-sm font-medium">{template.label}</p>
              <p className="text-[11px] leading-snug text-muted-foreground">{template.blurb}</p>
              <Link
                href={`/studio?template=${encodeURIComponent(template.id)}`}
                className="mt-2 inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
              >
                Use Template
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Card({ design }: { design: DesignCard }) {
  if (design.project) return <ProjectCard design={design} project={design.project} />;
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

/** One of your own designs: what it is, what it costs, where it is, and what to do with it. */
function ProjectCard({ design, project }: { design: DesignCard; project: NonNullable<DesignCard["project"]> }) {
  const modified = new Date(project.updatedAt);
  return (
    <div className="flex flex-col rounded-xl border bg-card p-3">
      <Link href={`/designs/${design.slug}`} className="block">
        <div className="flex h-28 items-center justify-center rounded-lg bg-muted/30 p-2 text-foreground/70">
          {design.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a stored render, already sized
            <img src={design.coverUrl} alt="" className="h-full w-full rounded object-cover" />
          ) : (
            <FrontDrawing drawing={project.drawing} className="h-full w-full" />
          )}
        </div>
        <p className="mt-2 line-clamp-2 text-sm font-medium">{design.title}</p>
      </Link>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {label(design.kind)}
        {project.width ? ` · ${Math.round(project.width)} × ${Math.round(project.height)} × ${Math.round(project.depth)} mm` : ""}
      </p>
      {project.material ? <p className="text-[11px] text-muted-foreground">{project.material}</p> : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="text-sm font-semibold tabular-nums">
          {design.estimatedCost === null ? "Not priced" : `${design.currency} ${Math.round(design.estimatedCost).toLocaleString("en-US")}`}
        </span>
        <span className="rounded-full border px-2 py-0.5 text-[10px]">{PROJECT_STATUS_LABELS[project.status]}</span>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Modified {modified.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
        {project.visibility !== "private" ? ` · ${project.visibility}` : ""}
      </p>
      <ProjectActions id={design.id} slug={design.slug} title={design.title} visibility={project.visibility} />
    </div>
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
