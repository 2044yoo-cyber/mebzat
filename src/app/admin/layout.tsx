import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  Building2,
  Flag,
  HardHat,
  LayoutDashboard,
  Package,
  Rotate3d,
  Ruler,
  Tags,
  UserCog,
  Users,
} from "lucide-react";

import { adminIdentity } from "@/lib/auth/admin-areas";
import type { AdminArea } from "@/types/database.types";

/**
 * The control room.
 *
 * One gate for every page under /admin, checked on the server. A page that
 * checks for itself is a page somebody will add without the check — and
 * `isAdmin` reads a column no session can write, so this is the whole of the
 * authorisation story rather than the first half of it.
 *
 * `notFound` rather than a redirect or a 403: a non-admin should not learn
 * that /admin exists. A 403 confirms the address is real.
 *
 * Every action behind these pages re-checks. A server action is a public
 * endpoint with a URL, and the fact that the only button pointing at it lives
 * behind this layout is not the gate.
 */

/** Every section, and the area it needs. `null` is the overview, which any
 * administrator may see. */
const SECTIONS: {
  href: string;
  label: string;
  icon: typeof Users;
  area: AdminArea | null;
}[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, area: null },
  { href: "/admin/users", label: "People", icon: Users, area: "users" },
  { href: "/admin/properties", label: "Properties", icon: Building2, area: "properties" },
  { href: "/admin/products", label: "Products", icon: Package, area: "products" },
  { href: "/admin/projects", label: "Projects", icon: HardHat, area: "projects" },
  { href: "/admin/tours", label: "3D & 360°", icon: Rotate3d, area: "tours" },
  { href: "/admin/moderation", label: "Moderation", icon: Flag, area: "moderation" },
  { href: "/admin/content", label: "Content", icon: Tags, area: "content" },
  { href: "/admin/prices", label: "Prices", icon: Ruler, area: "prices" },
  { href: "/admin/diagnostics", label: "Diagnostics", icon: Activity, area: "security" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const identity = await adminIdentity();
  if (!identity.isAdmin) notFound();

  // Only what this person can actually open. A menu entry that 404s is a menu
  // entry that reads like a fault — and hiding it is presentation, not
  // security: every page and every action checks for itself.
  const sections = SECTIONS.filter(
    (section) => section.area === null || identity.isOwner || identity.areas.includes(section.area),
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Medosha control room</h1>
        <p className="text-sm text-muted-foreground">
          The live platform. Everything here acts on the real records.
          {identity.isOwner ? " You are the main administrator." : ""}
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-1 border-b pb-2">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <section.icon className="size-4" />
            {section.label}
          </Link>
        ))}
        {identity.isOwner && (
          <Link
            href="/admin/team"
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <UserCog className="size-4" />
            Team
          </Link>
        )}
      </nav>

      {children}
    </div>
  );
}
