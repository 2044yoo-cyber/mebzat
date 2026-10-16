import Link from "next/link";
import { MapPin, Pencil } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

import { ShareProfileButton } from "./share-profile-button";

export type HeroProfile = {
  name: string;
  username: string | null;
  profession: string | null;
  specialties: string[];
  location: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl: string | null;
};

const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors";

/**
 * The top of the signed-in person's own profile: who they are, what they
 * do, and how much they have put on Medosha — every number counted from
 * their own rows, none estimated.
 */
export function ProfileHero({ profile, stats }: { profile: HeroProfile; stats: { label: string; value: number }[] }) {
  const initials = profile.name.split(/\s+/).map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <section aria-label="Profile" className="relative overflow-hidden rounded-2xl border bg-card">
      {profile.coverUrl ? (
        // The cover, faded into the card so the words over it stay readable.
        // An <img>, not a CSS background: a URL written into a style is a
        // way to write CSS, and this one is whatever the profile holds.
        <div aria-hidden className="absolute inset-y-0 right-0 w-full opacity-60 @2xl/ws:w-3/5">
          {/* eslint-disable-next-line @next/next/no-img-element -- any host a cover was uploaded to */}
          <img src={profile.coverUrl} alt="" loading="eager" decoding="async" className="size-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-card via-card/80 to-card/10" />
        </div>
      ) : (
        <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-brand/15 via-transparent to-transparent" />
      )}
      <div className="relative space-y-4 p-4 @lg/ws:p-6">
        <div className="flex flex-col gap-4 @xl/ws:flex-row @xl/ws:items-start">
          <Avatar className="size-20 shrink-0 border-2 border-background bg-brand text-brand-foreground @lg/ws:size-24">
            <AvatarImage src={profile.avatarUrl ?? undefined} alt={profile.name} />
            <AvatarFallback className="bg-brand text-2xl font-semibold text-brand-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="break-words text-2xl font-semibold tracking-tight">{profile.name}</h1>
            {profile.username ? <p className="text-sm text-muted-foreground">@{profile.username}</p> : null}
            {profile.profession ? <p className="text-sm">{profile.profession}</p> : null}
            {profile.location ? <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="size-4 shrink-0" aria-hidden />{profile.location}</p> : null}
            {profile.bio ? <p className="line-clamp-3 max-w-2xl whitespace-pre-line text-sm text-muted-foreground">{profile.bio}</p> : null}
            {profile.specialties.length ? (
              <ul aria-label="Skills" className="flex flex-wrap gap-1.5 pt-1">
                {profile.specialties.slice(0, 8).map((skill) => <li key={skill} className="rounded-full border border-brand/40 bg-background/60 px-2.5 py-0.5 text-xs">{skill}</li>)}
              </ul>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2 @xl/ws:flex-col">
            <Link href="/profile/edit" className={cn(button, "border-brand text-brand hover:bg-brand/10")}><Pencil className="size-4" aria-hidden />Edit profile</Link>
            <ShareProfileButton username={profile.username} name={profile.name} className={cn(button, "bg-background/70 hover:border-brand/60")} />
          </div>
        </div>
        <dl className="grid grid-cols-4 divide-x rounded-xl border bg-background/60 backdrop-blur-sm @2xl/ws:max-w-xl">
          {stats.map((stat) => (
            <div key={stat.label} className="flex min-w-0 flex-col items-center px-1 py-2.5 text-center">
              <dd className="text-lg font-semibold tabular-nums">{stat.value}</dd>
              <dt className="w-full truncate text-[11px] text-muted-foreground @sm/ws:text-xs">{stat.label}</dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
