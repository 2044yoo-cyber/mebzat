import Link from "next/link";
import { Building2, HardHat, Star } from "lucide-react";

import { ContactButtons } from "@/components/professionals/contact-buttons";
import {
  VerifiedBadge,
  verificationLevelsOf,
  type VerifiableProfile,
} from "@/components/profile/verified-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/**
 * Who did this, and how to get them to do it again.
 *
 * The whole point of publishing finished work is that the person who did it
 * can be hired for the next one. The page used to end at a small avatar and
 * "View profile", which left somebody looking at a kitchen they liked to work
 * out for themselves that the name under it was for hire, what trade they
 * actually are, and whether anybody had rated them.
 *
 * The company is a separate line because it is a separate fact: a site
 * engineer's portfolio piece belongs to them *and* to the contractor, and
 * conflating the two would put one name on work the other did.
 */

export type ProjectProfessional = VerifiableProfile & {
  id: string;
  username: string | null;
  full_name: string | null;
  company_name: string | null;
  avatar_url: string | null;
  profession: string | null;
  base_area: string | null;
  location_city: string | null;
  years_experience: number | null;
  show_phone: boolean;
  phone: string | null;
};

export function ProjectProfessionalCard({
  professional,
  rating,
  reviewCount,
  projectsCompleted,
  company,
}: {
  professional: ProjectProfessional;
  rating: number | null;
  reviewCount: number;
  projectsCompleted: number;
  company: { slug: string; name: string } | null;
}) {
  const name =
    professional.full_name ||
    professional.company_name ||
    `@${professional.username ?? ""}`;
  const initials = name
    .replace(/^@/, "")
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const levels = verificationLevelsOf(professional);

  return (
    <section className="space-y-3 rounded-2xl border p-4">
      <p className="text-xs font-medium uppercase text-muted-foreground">
        Work by
      </p>

      <div className="flex gap-3">
        <Link href={`/u/${professional.username}`} className="shrink-0">
          <Avatar className="size-12">
            <AvatarImage src={professional.avatar_url ?? undefined} alt={name} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={`/u/${professional.username}`} className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-medium hover:underline">
              {name}
              {levels[0] && <VerifiedBadge level={levels[0]} showLabel={false} />}
            </p>
          </Link>
          {professional.profession && (
            <p className="flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <HardHat className="size-3.5 shrink-0" />
              {professional.profession}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {reviewCount > 0 ? (
              <span className="flex items-center gap-1 font-medium text-foreground">
                <Star className="size-3 fill-amber-400 text-amber-400" />
                {(rating ?? 0).toFixed(1)}
                <span className="font-normal text-muted-foreground">
                  ({reviewCount})
                </span>
              </span>
            ) : (
              <span>No reviews yet</span>
            )}
            {projectsCompleted > 0 && (
              <span>
                {projectsCompleted}{" "}
                {projectsCompleted === 1 ? "project" : "projects"} on Medosha
              </span>
            )}
            {(professional.base_area || professional.location_city) && (
              <span>
                Based in{" "}
                {professional.base_area ?? professional.location_city}
              </span>
            )}
          </div>
        </div>
      </div>

      {company && (
        <Link
          href={`/companies/${company.slug}`}
          className="flex items-center gap-2 rounded-xl border p-3 text-sm transition-colors hover:bg-muted/50"
        >
          <Building2 className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="text-muted-foreground">Built under </span>
            <span className="font-medium">{company.name}</span>
          </span>
        </Link>
      )}

      <ContactButtons
        username={professional.username}
        name={name}
        // Honoured here as everywhere: a number entered to receive a
        // confirmation code is not a number the owner published.
        phone={professional.show_phone ? professional.phone : null}
      />
    </section>
  );
}
