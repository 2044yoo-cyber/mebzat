import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PortfolioFeed, type Professional } from "@/components/portfolio/portfolio-feed";
import { ProfileHero } from "@/components/portfolio/profile-hero";
import { ACCOUNT_TYPE_MAP } from "@/lib/constants/account-types";
import { encodeCursor, isSectionId, PAGE_SIZE, SECTIONS, type SectionId } from "@/lib/portfolio/model";
import { countSections, readSectionPage } from "@/lib/portfolio/sources";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My profile" };

/**
 * The Projects tab: the signed-in person's own profile, and below it
 * everything they have made on Medosha — projects, listings, files, designs,
 * posts, services — read from the tables those features keep, under their
 * own session. Nothing here is a second copy of any of it.
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/projects");

  const query = await searchParams;
  const requested = typeof query.view === "string" ? query.view : null;
  const view = isSectionId(requested) ? requested : "all";

  const [{ data: profile }, counts] = await Promise.all([
    supabase.from("profiles")
      .select("full_name, company_name, username, profession, specialties, account_type, location_city, location_country, bio, avatar_url, cover_url, years_experience, languages, work_status, portfolio_link, cv_path")
      .eq("id", user.id).maybeSingle(),
    countSections(supabase, user.id),
  ]);

  // The first section with anything in it, read now so the first screen has
  // cards rather than a spinner; the rest load as they are scrolled to.
  const first: SectionId | undefined = view === "all" ? SECTIONS.map((section) => section.id).find((id) => counts[id] > 0) : view;
  const initial = first && counts[first] > 0
    ? await readSectionPage(supabase, user.id, first, null, PAGE_SIZE).then((page) => ({ section: first, cards: page.cards, cursor: encodeCursor(page.next), done: page.done })).catch(() => null)
    : null;

  const name = profile?.company_name || profile?.full_name || profile?.username || user.email?.split("@")[0] || "Your profile";
  const professional: Professional = {
    profession: profile?.profession ?? null,
    specialties: profile?.specialties ?? [],
    yearsExperience: profile?.years_experience ?? null,
    languages: profile?.languages ?? [],
    workStatus: profile?.work_status ?? null,
    portfolioLink: profile?.portfolio_link ?? null,
    hasCv: Boolean(profile?.cv_path),
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <ProfileHero
        profile={{
          name,
          username: profile?.username ?? null,
          profession: profile?.profession || (profile?.account_type ? ACCOUNT_TYPE_MAP[profile.account_type]?.label ?? null : null),
          specialties: profile?.specialties ?? [],
          location: [profile?.location_city, profile?.location_country].filter(Boolean).join(", ") || null,
          bio: profile?.bio ?? null,
          avatarUrl: profile?.avatar_url ?? null,
          coverUrl: profile?.cover_url ?? null,
        }}
        stats={[
          { label: "Posts", value: counts.designs },
          { label: "Projects", value: counts.projects },
          { label: "Listings", value: counts.marketplace },
          { label: "Digital", value: counts.digital },
        ]}
      />
      <PortfolioFeed owner={user.id} counts={counts} professional={professional} initialView={view} initialSlice={initial} />
    </div>
  );
}
