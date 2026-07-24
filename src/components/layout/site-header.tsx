import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="glass sticky top-0 z-50 border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
            Log in
          </Link>
          <Link href="/signup" className={buttonVariants()}>
            Join Medosha
          </Link>
        </nav>
      </div>
    </header>
  );
}
