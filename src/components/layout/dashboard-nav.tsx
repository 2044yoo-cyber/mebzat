"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserNav, type NavProfile } from "@/components/layout/user-nav";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/projects", label: "Projects" },
  { href: "/profile", label: "My profile" },
];

export function DashboardNav({ profile }: { profile: NavProfile }) {
  const pathname = usePathname();

  return (
    <header className="glass sticky top-0 z-50 border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 sm:flex">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                  pathname === link.href && "bg-muted text-foreground",
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <UserNav initialProfile={profile} />
        </div>
      </div>
    </header>
  );
}
