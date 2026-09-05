import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Building2,
  Flag,
  LayoutDashboard,
  Ruler,
  Tags,
  Users,
} from "lucide-react";

import { isAdmin } from "@/lib/auth/admin";

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

const SECTIONS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/users", label: "People", icon: Users },
  { href: "/admin/properties", label: "Properties", icon: Building2 },
  { href: "/admin/moderation", label: "Moderation", icon: Flag },
  { href: "/admin/content", label: "Content", icon: Tags },
  { href: "/admin/prices", label: "Prices", icon: Ruler },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!(await isAdmin())) notFound();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold">Medosha control room</h1>
        <p className="text-sm text-muted-foreground">
          The live platform. Everything here acts on the real records.
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-1 border-b pb-2">
        {SECTIONS.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <section.icon className="size-4" />
            {section.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
