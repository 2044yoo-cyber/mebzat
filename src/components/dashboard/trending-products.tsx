import Link from "next/link";
import { TrendingUp } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function TrendingProducts() {
  return (
    <Card className="p-5">
      <CardHeader className="p-0">
        <CardTitle>Trending construction products</CardTitle>
        <CardDescription>The marketplace is coming soon.</CardDescription>
      </CardHeader>
      <div className="mt-4 flex flex-col items-center gap-3 rounded-xl border border-dashed p-8 text-center">
        <TrendingUp className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Once the marketplace launches, popular materials and equipment
          will show up here.
        </p>
        <Link
          href="/products/new"
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Add a product
        </Link>
      </div>
    </Card>
  );
}
