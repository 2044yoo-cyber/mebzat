import {
  Armchair,
  Briefcase,
  Building2,
  CalendarDays,
  Hammer,
  Hash,
  Landmark,
  LineChart,
  MessageSquare,
  Package,
  Truck,
  UserRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { SearchKind } from "@/types/database.types";

/**
 * The icon for a search result's kind.
 *
 * A lookup table rather than a dynamic import per name: the set is fixed at
 * small and fixed, and importing them statically lets the bundler keep only
 * these.
 */
const ICONS: Record<SearchKind, LucideIcon> = {
  product: Package,
  company: Building2,
  professional: UserRound,
  project: Hammer,
  price: LineChart,
  service: Wrench,
  equipment: Truck,
  job: Briefcase,
  event: CalendarDays,
  post: MessageSquare,
  hashtag: Hash,
  investment: Landmark,
  design: Armchair,
};

export function SearchKindIcon({
  kind,
  className,
}: {
  kind: SearchKind;
  className?: string;
}) {
  const Icon = ICONS[kind] ?? Package;
  return <Icon className={className} aria-hidden />;
}
