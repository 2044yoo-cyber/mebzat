import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ReviewCard } from "@/components/reviews/review-card";
import { ProfileCredentials } from "@/components/profile/profile-credentials";
import { ProfileHeader } from "@/components/profile/profile-header";
import { ProfilePortfolio } from "@/components/profile/profile-portfolio";
import { ProfileServices } from "@/components/profile/profile-services";
import { ProfileStanding } from "@/components/profile/profile-standing";
import { ProfileProjects } from "@/components/projects/profile-projects";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPublicProfile } from "@/lib/data/professional-profile";
import { getReviews } from "@/lib/data/reviews";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata(props: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await props.params;
  const data = await getPublicProfile(username);
  if (!data) return { title: `@${username}` };

  const name =
    data.profile.company_name || data.profile.full_name || `@${username}`;
  const trade = data.services[0]?.category?.name;
  const where = data.profile.location_city;

  // Written from what the profile actually says. A description that promises a
  // rating the page does not have is the search result people bounce off.
  const description =
    data.profile.bio?.slice(0, 155) ||
    [trade, where && `in ${where}`, "on Medosha"].filter(Boolean).join(" ");

  return {
    title: `${name} · @${username}`,
    description,
    openGraph: {
      title: `${name} on Medosha`,
      description,
      images: data.profile.avatar_url ? [data.profile.avatar_url] : undefined,
    },
  };
}

export default async function PublicProfilePage(props: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await props.params;
  const data = await getPublicProfile(username);

  if (!data) notFound();

  const { profile, isOwner } = data;
  const displayName = profile.company_name || profile.full_name || `@${username}`;

  if (!isOwner) {
    const supabase = await createClient();
    await supabase.rpc("increment_profile_views", { profile_id: profile.id });
  }

  // Reviews left against the person directly. Reviews of their services live
  // on the service pages, where the thing being reviewed is named.
  const reviews = await getReviews("professional", profile.id, 10);

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-10">
        <ProfileHeader data={data} />

        <Tabs defaultValue="overview">
          {/* Scrollable rather than wrapped: five tabs at 44px each do not fit
              across a 375px phone, and a second row of tabs reads as a second
              navigation. */}
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="work">Work</TabsTrigger>
            <TabsTrigger value="services">
              Services{data.services.length > 0 && ` (${data.services.length})`}
            </TabsTrigger>
            <TabsTrigger value="reviews">
              Reviews{data.rating.total > 0 && ` (${data.rating.total})`}
            </TabsTrigger>
            <TabsTrigger value="about">About</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 pt-4">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                {profile.bio && (
                  <section className="space-y-2">
                    <h2 className="text-sm font-medium text-muted-foreground">
                      About
                    </h2>
                    <p className="text-sm leading-relaxed whitespace-pre-line">
                      {profile.bio}
                    </p>
                  </section>
                )}
                <ProfilePortfolio
                  portfolio={data.portfolio.slice(0, 6)}
                  name={displayName}
                />
              </div>
              <div className="space-y-4">
                <ProfileStanding rating={data.rating} />
                <ProfileCredentials credentials={data.credentials} />
              </div>
            </div>
            <ProfileProjects ownerId={profile.id} includeDrafts={isOwner} />
          </TabsContent>

          <TabsContent value="work" className="space-y-6 pt-4">
            <ProfilePortfolio portfolio={data.portfolio} name={displayName} />
            <ProfileProjects ownerId={profile.id} includeDrafts={isOwner} />
          </TabsContent>

          <TabsContent value="services" className="pt-4">
            <ProfileServices services={data.services} name={displayName} />
          </TabsContent>

          <TabsContent value="reviews" className="space-y-4 pt-4">
            <ProfileStanding rating={data.rating} />
            {reviews.length > 0 ? (
              <ul className="space-y-3">
                {reviews.map((review) => (
                  <li key={review.id}>
                    <ReviewCard review={review} />
                  </li>
                ))}
              </ul>
            ) : (
              data.rating.total > 0 && (
                <p className="text-sm text-muted-foreground">
                  {displayName}&apos;s reviews are on the service pages they were
                  written about.
                </p>
              )
            )}
          </TabsContent>

          <TabsContent value="about" className="space-y-6 pt-4">
            <section className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">About</h2>
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {profile.bio || `${displayName} has not written a bio yet.`}
              </p>
            </section>
            <ProfileCredentials credentials={data.credentials} />
          </TabsContent>
        </Tabs>
      </main>
      <SiteFooter />
    </div>
  );
}
