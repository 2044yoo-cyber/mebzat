import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Building2 } from "lucide-react";

import { canAdmin } from "@/lib/auth/admin-areas";
import { PropertyRow } from "@/components/admin/property-row";
import { listPropertiesForAdmin } from "@/lib/admin/properties";
import type { PropertyStatus } from "@/types/database.types";

export const metadata: Metadata = { title: "Properties — control room" };
export const dynamic = "force-dynamic";

/** The statuses the site already uses. Not an admin vocabulary of its own. */
const FILTERS: { id: PropertyStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "available", label: "Available" },
  { id: "draft", label: "Draft" },
  { id: "under_offer", label: "Under offer" },
  { id: "sold", label: "Sold" },
  { id: "rented", label: "Rented" },
  { id: "withdrawn", label: "Withdrawn" },
];

export default async function AdminPropertiesPage(props: {
  searchParams: Promise<{ status?: string }>;
}) {
  // The layout hides the menu entry; this is the gate. A page that trusts
  // the menu is a page anyone can open by typing the address.
  if (!(await canAdmin("properties"))) notFound();

  const { status } = await props.searchParams;
  const filter = FILTERS.find((one) => one.id === status)?.id;

  const properties = await listPropertiesForAdmin(
    filter && filter !== "all" ? filter : undefined,
  );
  if (!properties) notFound();

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap gap-1">
        {FILTERS.map((one) => (
          <Link
            key={one.id}
            href={one.id === "all" ? "/admin/properties" : `/admin/properties?status=${one.id}`}
            className={
              (filter ?? "all") === one.id
                ? "rounded-full bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground"
                : "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
            }
          >
            {one.label}
          </Link>
        ))}
      </nav>

      {properties.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Building2 className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">
            No {filter && filter !== "all" ? FILTERS.find((f) => f.id === filter)?.label.toLowerCase() : ""} properties
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Listings appear here as sellers post them.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {properties.map((property) => (
            <PropertyRow key={property.id} property={property} />
          ))}
        </ul>
      )}
    </div>
  );
}
