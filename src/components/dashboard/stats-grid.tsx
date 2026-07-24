import Link from "next/link";
import {
  Eye,
  FolderKanban,
  MessageSquare,
  Star,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/database.types";

function StatCard({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  href?: string;
}) {
  const body = (
    <Card
      className={cn(
        "h-full gap-1 p-4",
        href && "transition-shadow hover:shadow-md",
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="size-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
    </Card>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function StatsGrid({
  profile,
  projectCount = 0,
}: {
  profile: Profile;
  projectCount?: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <StatCard
        icon={Eye}
        label="Profile views"
        value={profile.profile_views}
        href="/profile"
      />
      <StatCard icon={UserPlus} label="Followers" value={0} />
      <StatCard icon={Star} label="Reviews" value={0} />
      <StatCard icon={MessageSquare} label="Messages" value={0} />
      <StatCard
        icon={FolderKanban}
        label="Projects"
        value={projectCount}
        href={projectCount > 0 ? "/projects" : "/projects/new"}
      />
    </div>
  );
}
