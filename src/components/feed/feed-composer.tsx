"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef } from "react";
import { Camera, Home, ImagePlus, Sparkles, Store } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * The prompt at the top of the feed.
 *
 * Camera first, gallery second — on a construction site the thing worth
 * posting is in front of you, and making people find it in a gallery
 * afterwards is how a photo never gets posted. The camera button opens the
 * capture directly, which on a phone means the shutter rather than a picker.
 *
 * The four shortcuts route to the surfaces that already exist. This is an
 * entry point, not a second create flow: there is one place to list a
 * property and one place to list a product, and both of them are better than
 * anything a composer could do inline.
 */
export function FeedComposer({
  signedIn,
  viewer,
}: {
  signedIn: boolean;
  viewer: { name: string; avatarUrl: string | null } | null;
}) {
  const router = useRouter();
  const camera = useRef<HTMLInputElement>(null);

  function start(href: string) {
    router.push(signedIn ? href : `/login?redirect=${encodeURIComponent(href)}`);
  }

  return (
    <div className="mb-3 border-b border-border bg-background px-3 py-3 @lg/ws:rounded-2xl @lg/ws:border">
      <div className="flex items-center gap-2.5">
        <Avatar size="lg" className="shrink-0">
          {viewer?.avatarUrl && <AvatarImage src={viewer.avatarUrl} alt="" />}
          <AvatarFallback>{initials(viewer?.name ?? "?")}</AvatarFallback>
        </Avatar>

        <button
          type="button"
          onClick={() => start("/community")}
          className="h-11 flex-1 rounded-full bg-muted px-4 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/70"
        >
          Share progress, ask a question…
        </button>

        {/* `capture` is a hint, not a guarantee — a desktop browser ignores it
            and shows a file picker, which is the right fallback. */}
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            // The redesign tool is the surface that takes a photograph of a
            // real space and does something with it, so a captured photo goes
            // there rather than into a post nobody asked for.
            start("/ai?tool=redesign");
          }}
        />

        <button
          type="button"
          onClick={() => camera.current?.click()}
          aria-label="Take a photo"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"
        >
          <Camera className="size-5" />
        </button>
      </div>

      <div className="mt-2.5 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Shortcut icon={Home} label="List property" onClick={() => start("/property/new")} />
        <Shortcut icon={Store} label="Sell" onClick={() => start("/products/new")} />
        <Shortcut icon={ImagePlus} label="Project" onClick={() => start("/projects/new")} />
        <Link
          href="/ai"
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <Sparkles className="size-4" />
          Ask AI
        </Link>
      </div>
    </div>
  );
}

function Shortcut({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Home;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
