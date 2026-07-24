import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2 text-lg font-semibold tracking-tight",
        className,
      )}
    >
      <span className="flex size-7 items-center justify-center rounded-lg bg-brand text-brand-foreground text-sm font-bold">
        M
      </span>
      Medosha
    </Link>
  );
}
