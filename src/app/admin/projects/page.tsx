import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { HardHat } from "lucide-react";

import { CatalogueRow } from "@/components/admin/catalogue-row";
import { listCatalogue } from "@/lib/admin/catalogue";
import { canAdmin } from "@/lib/auth/admin-areas";

export const metadata: Metadata = { title: "Projects — control room" };
export const dynamic = "force-dynamic";

/** The two states the table already has. Not an admin vocabulary of its own. */
const FILTERS = [
  { id: "all", label: "All" },
  { id: "published", label: "On the site" },
  { id: "draft", label: "Drafts" },
] as const;

export default async function AdminProjectsPage(props: {
  searchParams: Promise<{ show?: string }>;
}) {
  // The layout hides the menu entry; this is the gate. A page that trusts
  // the menu is a page anyone can open by typing the address.
  if (!(await canAdmin("projects"))) notFound();

  const { show } = await props.searchParams;
  const filter = FILTERS.find((one) => one.id === show)?.id ?? "all";

  const items = await listCatalogue(
    "projects",
    filter === "all" ? undefined : filter === "published",
  );
  if (!items) notFound();

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1">
        {FILTERS.map((one) => (
          <Link
            key={one.id}
            href={one.id === "all" ? "/admin/projects" : `/admin/projects?show=${one.id}`}
            className={
              filter === one.id
                ? "rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground"
                : "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            }
          >
            {one.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <HardHat className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Nothing here yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Design projects appear here as architects post them.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <CatalogueRow key={item.id} kind="projects" item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
