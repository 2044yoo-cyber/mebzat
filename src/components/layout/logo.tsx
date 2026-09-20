import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandIcon({ className }: { className?: string }) {
  return (
    <span className={cn("relative block size-8 shrink-0 overflow-hidden rounded-lg", className)}>
      <Image src="/medosha_logo_icon.svg" alt="" fill sizes="32px" />
    </span>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2 text-lg font-semibold tracking-tight",
        className,
      )}
    >
      <BrandIcon className="size-7" />
      Medosha
    </Link>
  );
}
