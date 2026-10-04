import Link from "next/link";
import {
  Building2,
  Calculator,
  CalendarRange,
  Camera,
  ClipboardList,
  FileText,
  Layers,
  Palette,
  Ruler,
  Scale,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

import { QUICK_ACTIONS } from "@/lib/ai/quick-actions";

/**
 * Icons are mapped explicitly rather than looked up dynamically, so the bundle
 * only carries the twelve in use instead of the whole icon set.
 */
const ICONS: Record<string, LucideIcon> = {
  Building2,
  Calculator,
  CalendarRange,
  Camera,
  ClipboardList,
  FileText,
  Layers,
  Palette,
  Ruler,
  Scale,
  Store,
  Users,
};

export function QuickActionCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {QUICK_ACTIONS.map((action) => {
        const Icon = ICONS[action.icon] ?? Calculator;
        return (
          <Link
            key={action.title}
            href={`/ai?q=${encodeURIComponent(action.prompt)}&agent=${action.agent}`}
            className="group relative overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-lg"
          >
            <span
              aria-hidden
              className="absolute -top-12 -right-12 size-32 rounded-full bg-brand/5 transition-transform group-hover:scale-150"
            />
            <span className="relative flex size-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Icon className="size-5" />
            </span>
            <p className="relative mt-4 font-semibold">{action.title}</p>
            <p className="relative mt-1 text-sm text-muted-foreground">
              {action.description}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
