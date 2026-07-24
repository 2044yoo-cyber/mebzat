import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed p-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-brand/10">
        <Icon className="size-6 text-brand" />
      </div>
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="max-w-md text-muted-foreground">{description}</p>
      </div>
      <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
        <ArrowLeft className="size-4" /> Back to dashboard
      </Link>
    </div>
  );
}
