import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Building2, MapPin, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { Company } from "@/types/database.types";

export type CompanyCardData = Pick<
  Company,
  | "id"
  | "slug"
  | "name"
  | "category"
  | "city"
  | "country"
  | "logo_url"
  | "cover_url"
  | "is_claimed"
  | "verified"
  | "rating"
  | "projects_completed"
>;

export function CompanyCard({ company }: { company: CompanyCardData }) {
  const location = [company.city, company.country].filter(Boolean).join(", ");

  return (
    <Link
      href={`/companies/${company.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md"
    >
      <div className="relative h-24 bg-muted">
        {company.cover_url && (
          <Image
            src={company.cover_url}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, 33vw"
            className="object-cover"
          />
        )}
        {!company.is_claimed && (
          <span className="absolute right-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium backdrop-blur">
            Unclaimed
          </span>
        )}
      </div>
      <div className="flex flex-1 gap-3 p-4">
        <div className="relative -mt-8 size-14 shrink-0 overflow-hidden rounded-xl border-2 border-background bg-muted">
          {company.logo_url ? (
            <Image
              src={company.logo_url}
              alt={company.name}
              fill
              sizes="56px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <Building2 className="size-5" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <h3 className="truncate font-medium">{company.name}</h3>
            {company.verified && (
              <BadgeCheck className="size-4 shrink-0 text-brand" />
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {company.category && (
              <Badge variant="secondary">{company.category}</Badge>
            )}
            {company.rating != null && (
              <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                <Star className="size-3 fill-current text-amber-500" />
                {company.rating.toFixed(1)}
              </span>
            )}
          </div>
          {location && (
            <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
              <MapPin className="size-3" /> {location}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
