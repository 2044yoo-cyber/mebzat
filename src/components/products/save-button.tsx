"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";

import { toggleFavorite } from "@/app/marketplace/actions";
import { cn } from "@/lib/utils";

export function SaveButton({
  productId,
  initialFavorited,
  variant = "icon",
  className,
}: {
  productId: string;
  initialFavorited: boolean;
  variant?: "icon" | "labeled";
  className?: string;
}) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(initialFavorited);
  const [isPending, startTransition] = useTransition();

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !favorited;
    setFavorited(next); // optimistic

    startTransition(async () => {
      const result = await toggleFavorite(productId);
      if (result.requiresAuth) {
        setFavorited(false);
        router.push(`/login?redirect=/marketplace/${productId}`);
        return;
      }
      if (result.error) {
        setFavorited(!next); // roll back
        toast.error("Couldn't update your saved items");
        return;
      }
      setFavorited(result.favorited);
    });
  }

  if (variant === "labeled") {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-pressed={favorited}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-60",
          favorited
            ? "border-brand bg-brand/10 text-brand"
            : "border-border hover:bg-muted",
          className,
        )}
      >
        <Bookmark className={cn("size-4", favorited && "fill-current")} />
        {favorited ? "Saved" : "Save"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-pressed={favorited}
      aria-label={favorited ? "Remove from saved" : "Save product"}
      className={cn(
        "flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background disabled:opacity-60",
        favorited && "text-brand",
        className,
      )}
    >
      <Bookmark className={cn("size-4", favorited && "fill-current")} />
    </button>
  );
}
