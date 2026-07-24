"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, User as UserIcon } from "lucide-react";

import { signOut } from "@/app/(dashboard)/actions";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/profile", label: "My profile" },
];

export function DashboardNav({
  fullName,
  avatarUrl,
}: {
  fullName: string | null;
  avatarUrl: string | null;
}) {
  const pathname = usePathname();
  const initials = (fullName ?? "M")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full outline-none ring-brand focus-visible:ring-2">
              <Avatar className="size-8">
                <AvatarImage src={avatarUrl ?? undefined} alt={fullName ?? ""} />
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLinkItem render={<Link href="/profile" />}>
                <UserIcon className="size-4" /> My profile
              </DropdownMenuLinkItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => signOut()}
              >
                <LogOut className="size-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
