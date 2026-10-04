import Image from "next/image";
import Link from "next/link";
import {
  Building2,
  Globe,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldQuestion,
  Star,
  Users,
} from "lucide-react";

import { MessageButton } from "@/components/messages/message-button";
import { FollowButton } from "@/components/profile/follow-button";
import {
  VerifiedBadge,
  companyVerificationLevelOf,
} from "@/components/profile/verified-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import type { PublicCompany } from "@/lib/data/company-profile";
import { cn } from "@/lib/utils";

/**
 * The top of a business page.
 *
 * The badge is the part that changed. `companies.verified` is set when an
 * admin approves somebody's claim to a directory listing, and the page drew a
 * bare tick for it — which anybody reading would take as "Medosha checked this
 * business". It now says what was actually established: ownership of the
 * listing, and explicitly not registration.
 *
 * Contact details stay public here, unlike on a personal profile. A directory
 * listing exists to be contacted, and the number on one is a business line
 * that was published to be rung — not a personal number somebody typed in to
 * receive a confirmation code.
 */
function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Users;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <Icon className="size-4 shrink-0" />
      <span className="font-medium text-foreground tabular-nums">{value}</span>
      {label}
    </div>
  );
}

export function CompanyHeader({ data }: { data: PublicCompany }) {
  const { company, rating, isOwner } = data;
  const location = [company.address, company.city, company.country]
    .filter(Boolean)
    .join(", ");
  const level = companyVerificationLevelOf(company);
  const backHere = `/companies/${company.slug}`;

  return (
    <div className="overflow-hidden rounded-2xl border">
      <div className="relative h-32 bg-muted sm:h-48">
        {company.cover_url && (
          <Image
            src={company.cover_url}
            alt=""
            fill
            sizes="(max-width: 1024px) 100vw, 64rem"
            className="object-cover"
            priority
          />
        )}
      </div>

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:gap-4">
            <div className="relative -mt-14 size-20 shrink-0 overflow-hidden rounded-2xl border-4 border-background bg-muted sm:-mt-20 sm:size-28">
              {company.logo_url ? (
                <Image
                  src={company.logo_url}
                  alt={company.name}
                  fill
                  sizes="112px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Building2 className="size-8" />
                </div>
              )}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {company.name}
                </h1>
                {level ? (
                  <VerifiedBadge level={level} showLabel />
                ) : (
                  <Badge variant="outline">Unclaimed</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {company.category && <span>{company.category}</span>}
                {location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" /> {location}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {isOwner ? (
              <Link
                href={`/companies/${company.slug}/edit`}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "w-full sm:w-auto",
                )}
              >
                <Pencil data-icon="inline-start" /> Edit business
              </Link>
            ) : company.is_claimed ? (
              <>
                <FollowButton
                  targetId={company.id}
                  targetType="company"
                  following={data.viewerFollows === true}
                  signedIn={data.viewerFollows !== null}
                  next={backHere}
                />
                <MessageButton
                  companyId={company.id}
                  subject={`Enquiry for ${company.name}`}
                  className="w-full sm:w-auto"
                />
              </>
            ) : (
              <Link
                href={`/companies/${company.slug}/claim`}
                className={cn(buttonVariants(), "w-full sm:w-auto")}
              >
                <ShieldQuestion data-icon="inline-start" /> Claim this business
              </Link>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-4">
          {rating.total > 0 && (
            <Stat
              icon={Star}
              value={rating.average.toFixed(1)}
              label={`from ${rating.total} ${rating.total === 1 ? "review" : "reviews"}`}
            />
          )}
          <Stat
            icon={Users}
            value={String(company.followers_count)}
            label={company.followers_count === 1 ? "follower" : "followers"}
          />
          {company.employees_count != null && (
            <Stat
              icon={Building2}
              value={String(company.employees_count)}
              label="employees"
            />
          )}
        </div>

        {(company.website || company.email || company.phone) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noreferrer noopener nofollow"
                className="flex items-center gap-1.5 hover:text-foreground hover:underline"
              >
                <Globe className="size-4 shrink-0" />
                <span className="max-w-[16rem] truncate">{company.website}</span>
              </a>
            )}
            {company.email && (
              <a
                href={`mailto:${company.email}`}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Mail className="size-4 shrink-0" />
                <span className="truncate">{company.email}</span>
              </a>
            )}
            {company.phone && (
              <a
                href={`tel:${company.phone}`}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Phone className="size-4 shrink-0" />
                {company.phone}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
