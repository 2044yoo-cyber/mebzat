"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const CLAIMED_TABS = [
  { key: "", label: "All" },
  { key: "false", label: "Unclaimed" },
  { key: "true", label: "Claimed" },
];

export function CompanyFilters({
  current,
}: {
  current: { q: string; claimed: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(current.q);

  function pushWith(updates: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("page");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          pushWith({ q: q.trim() || null });
        }}
        className="relative flex-1"
      >
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search businesses by name, category, or city…"
          className="pl-9"
          aria-label="Search businesses"
        />
      </form>
      <div className="flex items-center gap-1 rounded-full border p-1">
        {CLAIMED_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => pushWith({ claimed: tab.key || null })}
            aria-pressed={current.claimed === tab.key}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              current.claimed === tab.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
