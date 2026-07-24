import Link from "next/link";
import { MapPin } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function NearbySuppliersMap() {
  return (
    <Card className="overflow-hidden p-0">
      <div
        aria-hidden
        className="relative h-32 bg-muted [background-image:radial-gradient(circle,color-mix(in_oklch,var(--foreground)_12%,transparent)_1px,transparent_1px)] [background-size:16px_16px]"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg">
            <MapPin className="size-5" />
          </div>
        </div>
      </div>
      <CardHeader className="gap-2 p-5">
        <CardTitle>Nearby suppliers</CardTitle>
        <CardDescription>
          Map-based discovery is coming soon — find suppliers, contractors,
          and more near you.
        </CardDescription>
        <Link
          href="/map"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
        >
          View map
        </Link>
      </CardHeader>
    </Card>
  );
}
