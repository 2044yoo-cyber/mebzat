"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "products", label: "Products", base: "/marketplace" },
  { key: "individual", label: "Professionals", base: "/directory/individual" },
  { key: "supplier", label: "Suppliers", base: "/directory/supplier" },
  { key: "company", label: "Companies", base: "/companies" },
] as const;

export function HeroSearch() {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const [term, setTerm] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = term.trim();
    router.push(q ? `${tab.base}?q=${encodeURIComponent(q)}` : tab.base);
  }

  return (
    <div className="w-full">
      <div
        role="tablist"
        aria-label="Search category"
        className="mb-2 flex flex-wrap gap-1"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab.key === t.key}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              tab.key === t.key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <form
        onSubmit={onSubmit}
        className="glass flex items-center gap-2 rounded-2xl border p-2 shadow-sm"
      >
        <Search className="ml-2 size-5 shrink-0 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={`Search ${tab.label.toLowerCase()}…`}
          aria-label={`Search ${tab.label}`}
          className="h-10 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="lg" className="shrink-0">
          Search
        </Button>
      </form>
    </div>
  );
}
