"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  FolderKanban,
  UserRound,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";

export type NavProfile = {
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
};

/** Name shown in the nav. profiles has no display_name column, so the
 * fallback order collapses to full_name -> email. */
function resolveName(profile: NavProfile) {
  return profile.fullName?.trim() || profile.email || "Account";
}

function initialsFor(name: string) {
  const parts = name.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]);
  return (letters.join("") || name[0] || "M").toUpperCase();
}

const MENU_LINKS = [
  { href: "/profile", label: "My Profile", icon: UserRound },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "My Projects", icon: FolderKanban },
  { href: "/saved", label: "Saved Projects", icon: Bookmark },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: CircleHelp },
];

export function UserNav({
  initialProfile,
}: {
  // `undefined` = auth state not yet resolved on the server; `null` = signed out.
  initialProfile?: NavProfile | null;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<NavProfile | null>(
    initialProfile ?? null,
  );
  const [ready, setReady] = useState(initialProfile !== undefined);
  const [signingOut, setSigningOut] = useState(false);
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    const supabase = supabaseRef.current;
    let active = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!active) return;

      if (!session?.user) {
        setProfile(null);
        setReady(true);
        return;
      }

      // Show something immediately from the session, then enrich with the
      // profile row (name + avatar) without blocking the first paint.
      setProfile((prev) => ({
        fullName: prev?.fullName ?? null,
        email: session.user.email ?? prev?.email ?? null,
        avatarUrl: prev?.avatarUrl ?? null,
      }));
      setReady(true);

      const { data } = await supabase
        .from("profiles")
        .select("full_name, avatar_url")
        .eq("id", session.user.id)
        .single();
      if (!active) return;
      setProfile({
        fullName: data?.full_name ?? null,
        email: session.user.email ?? null,
        avatarUrl: data?.avatar_url ?? null,
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    // Browser sign-out clears the SSR cookies and fires onAuthStateChange,
    // so the nav flips to signed-out instantly without a page refresh.
    await supabaseRef.current.auth.signOut();
    router.push("/");
    router.refresh();
  }

  if (!ready) {
    return <Skeleton className="size-8 rounded-full" aria-hidden />;
  }

  if (!profile) {
    return (
      <>
        <Link
          href="/login"
          className={buttonVariants({ variant: "ghost" })}
        >
          Log in
        </Link>
        <Link href="/signup" className={buttonVariants()}>
          Join Medosha
        </Link>
      </>
    );
  }

  const name = resolveName(profile);
  const initials = initialsFor(name);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-brand">
        <Avatar className="size-8">
          <AvatarImage src={profile.avatarUrl ?? undefined} alt={name} />
          <AvatarFallback className="bg-brand text-brand-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
          {name}
        </span>
        <ChevronDown className="hidden size-4 text-muted-foreground sm:inline" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {/* GroupLabel reads MenuGroupContext, so Base UI throws
            "MenuGroupContext is missing" when it is rendered as a direct child
            of Content. The Group is the label's owner, not decoration. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
            <span className="truncate text-sm font-medium text-foreground">
              {name}
            </span>
            {profile.email && (
              <span className="truncate text-xs font-normal text-muted-foreground">
                {profile.email}
              </span>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {MENU_LINKS.map(({ href, label, icon: Icon }) => (
          <DropdownMenuLinkItem key={href} render={<Link href={href} />}>
            <Icon className="size-4" /> {label}
          </DropdownMenuLinkItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={signingOut}
          onClick={() => void handleSignOut()}
        >
          <LogOut className="size-4" /> Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
