import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserNav } from "@/components/layout/user-nav";
import { getNavProfile } from "@/lib/nav-profile";

export async function SiteHeader() {
  const initialProfile = await getNavProfile();

  return (
    <header className="glass sticky top-0 z-50 border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <UserNav initialProfile={initialProfile} />
        </nav>
      </div>
    </header>
  );
}
