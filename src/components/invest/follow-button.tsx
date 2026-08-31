"use client";

import { useState, useTransition } from "react";
import { Bell, BellRing } from "lucide-react";
import { toast } from "sonner";

import { toggleFollowProject } from "@/app/invest/actions";
import { Button } from "@/components/ui/button";

/**
 * Follow a project to get its updates.
 *
 * Optimistic, and reverted on failure — the count beside it is what someone
 * reads to judge interest, so it must not drift from what the server did.
 */
export function FollowProjectButton({
  projectId,
  initialFollowing,
  followers,
}: {
  projectId: string;
  initialFollowing: boolean;
  followers: number;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [count, setCount] = useState(followers);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const wasFollowing = following;
    const previousCount = count;

    setFollowing(!wasFollowing);
    setCount(previousCount + (wasFollowing ? -1 : 1));

    startTransition(async () => {
      const result = await toggleFollowProject(projectId);
      if (result.error) {
        setFollowing(wasFollowing);
        setCount(previousCount);
        toast.error(result.error);
        return;
      }
      setFollowing(result.following);
      toast.success(
        result.following
          ? "Following. Updates will reach your notifications."
          : "Unfollowed.",
      );
    });
  }

  return (
    <Button
      variant={following ? "secondary" : "outline"}
      size="sm"
      disabled={pending}
      onClick={toggle}
      aria-pressed={following}
    >
      {following ? (
        <BellRing className="size-3.5" />
      ) : (
        <Bell className="size-3.5" />
      )}
      {following ? "Following" : "Follow"}
      {count > 0 && (
        <span className="text-muted-foreground tabular-nums">{count}</span>
      )}
    </Button>
  );
}
