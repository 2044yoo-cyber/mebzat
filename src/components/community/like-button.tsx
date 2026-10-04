"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";

import { toggleLike } from "@/app/community/actions";
import { cn } from "@/lib/utils";

/**
 * The like toggle.
 *
 * Flips optimistically and reverts if the server disagrees: a like is cheap
 * and reversible, and waiting for a round trip makes the button feel broken.
 */
export function LikeButton({
  postId,
  count: initialCount,
  liked: initialLiked,
  signedIn,
}: {
  postId: string;
  count: number;
  liked: boolean;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function press() {
    if (!signedIn) {
      router.push(`/login?redirect=/community/${postId}`);
      return;
    }

    const next = !liked;
    setLiked(next);
    setCount((value) => value + (next ? 1 : -1));

    startTransition(async () => {
      const result = await toggleLike(postId);
      if (result.error) {
        setLiked(!next);
        setCount((value) => value + (next ? -1 : 1));
        toast.error(result.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={press}
      disabled={pending}
      aria-pressed={liked}
      aria-label={liked ? "Unlike this post" : "Like this post"}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2 py-1 text-sm transition-colors",
        liked
          ? "text-rose-500"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Heart className={cn("size-4", liked && "fill-current")} />
      {count}
    </button>
  );
}
