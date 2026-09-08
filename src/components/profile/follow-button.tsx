"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { toggleFollow } from "@/app/community/actions";
import { Button } from "@/components/ui/button";

/**
 * Follow, on a profile.
 *
 * Calls the same `toggleFollow` the community feed uses rather than a second
 * action of its own — one follow, one row, whichever page created it.
 * `signedIn` decides between toggling and sending somebody to sign in, so a
 * visitor gets a login screen instead of an error.
 */
export function FollowButton({
  profileId,
  following,
  signedIn,
  next,
}: {
  profileId: string;
  following: boolean;
  signedIn: boolean;
  next: string;
}) {
  const [isFollowing, setIsFollowing] = useState(following);
  const [pending, start] = useTransition();
  const router = useRouter();

  function click() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    // Flipped first: a follow that waits on a round trip before showing
    // anything reads as a button that did not work, and gets pressed twice.
    const optimistic = !isFollowing;
    setIsFollowing(optimistic);

    start(async () => {
      const result = await toggleFollow("profile", profileId);
      if (result.error) {
        setIsFollowing(!optimistic);
        toast.error(result.error);
      }
    });
  }

  return (
    <Button
      onClick={click}
      disabled={pending}
      variant={isFollowing ? "secondary" : "default"}
      className="w-full"
    >
      {isFollowing ? (
        <>
          <UserCheck data-icon="inline-start" /> Following
        </>
      ) : (
        <>
          <UserPlus data-icon="inline-start" /> Follow
        </>
      )}
    </Button>
  );
}
