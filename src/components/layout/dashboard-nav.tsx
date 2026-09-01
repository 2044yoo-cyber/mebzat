"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserNav, type NavProfile } from "@/components/layout/user-nav";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Links everybody sees, and links that need an account.
 *
 * A signed-out visitor is shown what they can actually use. "Dashboard" and
 * "My profile" in the header of somebody with neither is an invitation to hit
 * a login wall, which is the experience this change exists to remove.
 */
const PUBLIC_LINKS = [
  { href: "/marketplace", label: "Marketplace" },
  { href: "/projects", label: "Projects" },
  { href: "/companies", label: "Companies" },
];

const MEMBER_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "My profile" },
];

export function DashboardNav({ profile }: { profile: NavProfile | null }) {
  const pathname = usePathname();
  const links = profile ? [...MEMBER_LINKS, ...PUBLIC_LINKS] : PUBLIC_LINKS;

  return (
    <header className="glass sticky top-0 z-50 border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-1 sm:flex">
            {links.map((link) => (
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
          {profile ? (
            <UserNav initialProfile={profile} />
          ) : (
            /* Prominent, and secondary to the content. Visible in the header
               without interrupting anything somebody is reading. "Join Medosha"
               rather than "Sign up" because it names what they get. */
            <>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "hidden sm:inline-flex",
                )}
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className={cn(buttonVariants({ size: "sm" }), "whitespace-nowrap")}
              >
                Join Medosha
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
