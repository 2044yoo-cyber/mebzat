import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Armchair,
  Building2,
  Boxes,
  FolderOpen,
  Layers,
  Paintbrush,
  PencilRuler,
  ImageUp,
  Ruler,
  Sparkles,
} from "lucide-react";
import { Cabinet } from "@/components/icons/cabinet";
import { listOwnDesigns } from "@/features/berchuma-studio/services/designs";

export const metadata: Metadata = {
  title: "Design | Medosha",
  description: "All Medosha design tools in one place: house plans, freehand sketching, cabinets, furniture, interiors and exteriors.",
};

const TOOLS = [
  {
    title: "House Design",
    description: "Draw floor plans, edit walls and rooms, and explore residential 3D.",
    href: "/house-design",
    icon: Building2,
    accent: "text-sky-500",
    tag: "Floor plan · 3D",
  },
  {
    title: "Image to 3D Floor Plan",
    description: "Import DXF CAD wall vectors, PDF pages or screenshots without AI. Verify lines and open editable 3D.",
    href: "/design/image-to-3d",
    icon: ImageUp,
    accent: "text-cyan-500",
    tag: "DXF · PDF · Image · 3D",
  },
  {
    title: "Cabinet Design",
    description: "Create kitchens, wardrobes, vanities and storage with dimensions and cut lists.",
    href: "/studio",
    icon: Cabinet,
    accent: "text-blue-500",
    tag: "Kitchen · Wardrobe",
  },
  {
    title: "Furniture Design",
    description: "Start custom furniture in the existing 3D cabinet and furniture editor.",
    href: "/studio?kind=custom",
    icon: Armchair,
    accent: "text-amber-500",
    tag: "Custom · 3D",
  },
  {
    title: "Sketch & Draw",
    description: "Open House Design to draw freehand plans or mark up drawings and PDFs.",
    href: "/house-design",
    icon: PencilRuler,
    accent: "text-violet-500",
    tag: "Freehand · Markup",
  },
  {
    title: "Interior Design",
    description: "Plan room layouts using the current house designer. Dedicated interior tools are coming later.",
    href: "/house-design",
    icon: Layers,
    accent: "text-emerald-500",
    tag: "Room layouts",
  },
  {
    title: "Exterior Design",
    description: "Work on residential house geometry and exterior views in House Design.",
    href: "/house-design",
    icon: Paintbrush,
    accent: "text-orange-500",
    tag: "House · Facade",
  },
] as const;

export default async function DesignPage() {
  // The cabinet gallery is the only design type with a shared, queryable
  // recent-project feed today. Do not fabricate house-plan recents.
  const recent = await listOwnDesigns(4).catch(() => []);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-36 pt-5 sm:px-6 sm:pt-8">
      <header className="space-y-2">
        <div className="flex items-center gap-2 text-brand">
          <Ruler className="size-6" />
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Design</h1>
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          One place to sketch, draw, model and continue your Medosha designs.
        </p>
      </header>

      <section aria-labelledby="continue-design" className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="continue-design" className="text-base font-semibold">Continue designing</h2>
          <Link href="/designs?mine=1" className="inline-flex items-center gap-1 text-xs font-medium text-brand">
            All saved cabinet designs <ArrowRight className="size-3.5" />
          </Link>
        </div>
        {recent.length ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {recent.map((design) => (
              <Link key={design.id} href={`/studio?design=${encodeURIComponent(design.slug)}`}
                className="flex min-h-20 items-center gap-3 rounded-xl border bg-background px-3 py-3 transition-colors hover:border-brand/60 hover:bg-muted/30">
                <FolderOpen className="size-6 shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{design.title}</p>
                  <p className="text-xs text-muted-foreground">Open saved design</p>
                </div>
                <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">No saved cabinet designs found yet.</p>
            <Link href="/studio" className="rounded-lg bg-brand px-3 py-2 text-xs font-semibold text-brand-foreground">Start a cabinet design</Link>
            <Link href="/house-design" className="rounded-lg border px-3 py-2 text-xs font-semibold">Open House Design</Link>
          </div>
        )}
      </section>

      <section aria-labelledby="design-tools">
        <h2 id="design-tools" className="mb-3 text-lg font-semibold">Choose what to design</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {TOOLS.map((tool) => (
            <Link key={tool.title} href={tool.href}
              className="group flex min-h-48 flex-col rounded-2xl border bg-card p-3.5 transition-all hover:border-brand/60 hover:shadow-md active:bg-muted/40 sm:p-5">
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted/70">
                <tool.icon className={`size-6 ${tool.accent}`} />
              </div>
              <h3 className="text-sm font-semibold sm:text-base">{tool.title}</h3>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{tool.description}</p>
              <div className="mt-4 flex items-center justify-between gap-1 text-[11px] text-muted-foreground">
                <span>{tool.tag}</span>
                <ArrowRight className="size-4 shrink-0 text-brand transition-transform group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap gap-2 border-t pt-5">
        <Link href="/designs" className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium hover:bg-muted">
          <Boxes className="size-4" /> Design gallery
        </Link>
        <Link href="/designs?mine=1" className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium hover:bg-muted">
          <FolderOpen className="size-4" /> My cabinet projects
        </Link>
        <Link href="/ai" className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-medium hover:bg-muted">
          <Sparkles className="size-4" /> Medosha AI
        </Link>
      </section>
    </main>
  );
}
