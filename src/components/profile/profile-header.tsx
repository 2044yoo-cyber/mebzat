import Link from "next/link";
import {
  Briefcase,
  Eye,
  Globe,
  Languages,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Star,
  Users,
} from "lucide-react";

import { MessageButton } from "@/components/messages/message-button";
import { FollowButton } from "@/components/profile/follow-button";
import {
  VerifiedBadge,
  verificationLevelOf,
} from "@/components/profile/verified-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ACCOUNT_TYPE_MAP } from "@/lib/constants/account-types";
import {
  visibleContact,
  type PublicProfile,
} from "@/lib/data/professional-profile";
import { cn } from "@/lib/utils";

/**
 * The top of a public profile.
 *
 * Everything above the fold is either something the person put there or
 * something Medosha has actually checked. The badge names the level it
 * verified rather than showing a bare tick — a tick with no noun beside it is
 * read as an assurance whose strength the reader guesses, and they guess high.
 *
 * Contact details are shown because their owner said to show them. Rendering
 * `profile.phone` to everybody, which is what this page used to do, published
 * a number somebody had typed in to receive a confirmation code.
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

export function ProfileHeader({ data }: { data: PublicProfile }) {
  const { profile, rating, isOwner } = data;
  const accountType = profile.account_type
    ? ACCOUNT_TYPE_MAP[profile.account_type]
    : null;
  const displayName = profile.company_name || profile.full_name || "Unnamed";
  const initials = displayName
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const level = verificationLevelOf(profile);
  const contact = visibleContact(profile, isOwner);
  const backHere = profile.username ? `/u/${profile.username}` : "/";

  return (
    <div className="overflow-hidden rounded-2xl border">
      <div
        className="h-32 bg-muted sm:h-48"
        style={
          profile.cover_url
            ? {
                backgroundImage: `url(${profile.cover_url})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:gap-4">
            <Avatar className="-mt-14 size-20 border-4 border-background bg-background sm:-mt-20 sm:size-28">
              <AvatarImage src={profile.avatar_url ?? undefined} alt={displayName} />
              <AvatarFallback className="text-xl sm:text-2xl">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                  {displayName}
                </h1>
                {level && <VerifiedBadge level={level} showLabel />}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {profile.username && <span>@{profile.username}</span>}
                {accountType && (
                  <Badge variant="secondary">{accountType.label}</Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {isOwner ? (
              <Link
                href="/profile/edit"
                className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto")}
              >
                <Pencil data-icon="inline-start" /> Edit profile
              </Link>
            ) : (
              <>
                <FollowButton
                  targetId={profile.id}
                  following={data.viewerFollows === true}
                  signedIn={data.viewerFollows !== null}
                  next={backHere}
                />
                <MessageButton
                  userId={profile.id}
                  subject={`About your work, ${displayName}`}
                  className="w-full sm:w-auto"
                />
              </>
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
            value={String(data.followers)}
            label={data.followers === 1 ? "follower" : "followers"}
          />
          {data.services.length > 0 && (
            <Stat
              icon={Briefcase}
              value={String(data.services.length)}
              label={data.services.length === 1 ? "service" : "services"}
            />
          )}
          {typeof profile.years_experience === "number" && (
            <Stat
              icon={Briefcase}
              value={String(profile.years_experience)}
              label="years of experience"
            />
          )}
          {isOwner && (
            <Stat
              icon={Eye}
              value={String(profile.profile_views)}
              label="profile views"
            />
          )}
        </div>

        {(profile.location_city ||
          profile.website ||
          contact.phone ||
          contact.email ||
          profile.languages.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
            {(profile.location_city || profile.location_country) && (
              <span className="flex items-center gap-1.5">
                <MapPin className="size-4 shrink-0" />
                {[profile.location_city, profile.location_country]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            )}
            {profile.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noreferrer noopener nofollow"
                className="flex items-center gap-1.5 hover:text-foreground hover:underline"
              >
                <Globe className="size-4 shrink-0" />
                <span className="max-w-[16rem] truncate">{profile.website}</span>
              </a>
            )}
            {contact.phone && (
              <a
                href={`tel:${contact.phone}`}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Phone className="size-4 shrink-0" />
                {contact.phone}
                {isOwner && !profile.show_phone && (
                  <span className="text-xs">(only you can see this)</span>
                )}
              </a>
            )}
            {contact.email && (
              <a
                href={`mailto:${contact.email}`}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <Mail className="size-4 shrink-0" />
                {contact.email}
                {isOwner && !profile.show_email && (
                  <span className="text-xs">(only you can see this)</span>
                )}
              </a>
            )}
            {profile.languages.length > 0 && (
              <span className="flex items-center gap-1.5">
                <Languages className="size-4 shrink-0" />
                {profile.languages.join(", ")}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
