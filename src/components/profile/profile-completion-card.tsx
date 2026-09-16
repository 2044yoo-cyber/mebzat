import Link from "next/link";
import { ArrowRight, CircleCheck } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { getProfileCompletion } from "@/lib/profile/completion";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database.types";

/**
 * How complete a profile is, and what is left.
 *
 * It used to return null at 100% — so the one moment the card had good news
 * was the moment it disappeared, and somebody who had just filled in the last
 * field saw the card vanish with no statement that they were done. Now it says
 * so, once, in a form that takes no more room than it has to.
 */
export function ProfileCompletionCard({ profile }: { profile: Profile }) {
  const { percent, missing, complete, audience } = getProfileCompletion(profile);

  if (complete) {
    return (
      <Card className="h-full justify-center p-5">
        <CardHeader className="gap-2 p-0">
          <CardTitle className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
            <CircleCheck className="size-5 shrink-0" /> Profile complete
          </CardTitle>
          <CardDescription>
            {audience === "organization"
              ? "Everything a client looks for is filled in."
              : "Everything an employer looks for is filled in."}{" "}
            You can still change any of it.
          </CardDescription>
          <Link
            href="/profile/edit"
            className={cn(
              buttonVariants({ size: "sm", variant: "outline" }),
              "w-fit",
            )}
          >
            Edit profile <ArrowRight className="size-4" />
          </Link>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="h-full justify-center p-5">
      <CardHeader className="gap-3 p-0">
        <div className="flex items-center justify-between">
          <CardTitle>Complete your profile</CardTitle>
          <span className="text-sm font-semibold text-brand">{percent}%</span>
        </div>
        <Progress value={percent} />
        <CardDescription>
          Still missing: {missing.slice(0, 3).join(", ")}
          {missing.length > 3 ? `, and ${missing.length - 3} more` : ""}. A
          complete profile gets discovered more often in search and on the map.
        </CardDescription>
        <Link
          href="/profile/edit"
          className={cn(buttonVariants({ size: "sm" }), "w-fit")}
        >
          Complete Profile <ArrowRight className="size-4" />
        </Link>
      </CardHeader>
    </Card>
  );
}
