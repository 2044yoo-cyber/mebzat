import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { getProfileCompletion } from "@/lib/profile-completion";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database.types";

export function ProfileCompletionCard({ profile }: { profile: Profile }) {
  const { percent, missing } = getProfileCompletion(profile);

  if (percent >= 100) {
    return null;
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
          {missing.length > 0 && (
            <>Still missing: {missing.slice(0, 3).join(", ")}
              {missing.length > 3 ? ", and more" : ""}.{" "}
            </>
          )}
          A complete profile gets discovered more often in search and on the
          map.
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
