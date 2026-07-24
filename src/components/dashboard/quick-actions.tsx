import Link from "next/link";
import {
  FolderKanban,
  HardHat,
  Map,
  Package,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

const ACTIONS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/projects/new", label: "Create Project", icon: FolderKanban },
  { href: "/products/new", label: "Add Product", icon: Package },
  { href: "/directory/supplier", label: "Find Suppliers", icon: Warehouse },
  { href: "/directory/contractor", label: "Find Contractors", icon: HardHat },
  { href: "/map", label: "View Map", icon: Map },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {ACTIONS.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex flex-col items-center gap-2 rounded-2xl border bg-card p-4 text-center transition-colors hover:border-brand hover:bg-brand/5"
        >
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand/10">
            <Icon className="size-5 text-brand" />
          </div>
          <span className="text-sm font-medium">{label}</span>
        </Link>
      ))}
    </div>
  );
}
