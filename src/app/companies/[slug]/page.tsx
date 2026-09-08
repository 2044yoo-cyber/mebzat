import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldQuestion } from "lucide-react";

import { CompanyHeader } from "@/components/companies/company-header";
import { CompanyTeam } from "@/components/companies/company-team";
import { ProfileServices } from "@/components/profile/profile-services";
import { ProfileStanding } from "@/components/profile/profile-standing";
import { ReviewCard } from "@/components/reviews/review-card";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getPublicCompany } from "@/lib/data/company-profile";
import { getReviews } from "@/lib/data/reviews";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const data = await getPublicCompany(slug);
  if (!data) return { title: "Business not found" };

  return {
    title: data.company.name,
    description:
      data.company.description?.slice(0, 155) ||
      `${data.company.name} on the Medosha business directory.`,
  };
}

export default async function CompanyProfilePage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const data = await getPublicCompany(slug);
  if (!data) notFound();

  const { company, rating, isOwner } = data;

  if (!isOwner) {
    const supabase = await createClient();
    await supabase.rpc("increment_company_views", { company_id: company.id });
  }

  const reviews = await getReviews("company", company.id, 10);
  const location = [company.address, company.city, company.country]
    .filter(Boolean)
    .join(", ");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: company.name,
    description: company.description ?? undefined,
    image: company.logo_url ?? company.cover_url ?? undefined,
    url: company.website ?? undefined,
    email: company.email ?? undefined,
    telephone: company.phone ?? undefined,
    address: location || undefined,
    // Only when there is something behind it. `companies.rating` was a column
    // nothing wrote, and this block published whatever an importer happened to
    // put there as a rating to search engines. An AggregateRating without a
    // reviewCount is also invalid structured data, so both come from the same
    // aggregate or neither is emitted.
    aggregateRating:
      rating.total > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: rating.average,
            reviewCount: rating.total,
            bestRating: 5,
            worstRating: 1,
          }
        : undefined,
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <CompanyHeader data={data} />

      {!company.is_claimed && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed bg-muted/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <ShieldQuestion className="mt-0.5 size-5 shrink-0 text-brand" />
            <div>
              <p className="font-medium">Is this your business?</p>
              <p className="text-sm text-muted-foreground">
                This listing
                {company.import_source ? " was imported and " : " "}
                hasn&apos;t been claimed yet. Claim it to manage the profile,
                add products and projects, and respond to customers.
              </p>
            </div>
          </div>
          <Link
            href={`/companies/${company.slug}/claim`}
            className={cn(buttonVariants(), "shrink-0")}
          >
            Claim this business
          </Link>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="services">
            Services{data.services.length > 0 && ` (${data.services.length})`}
          </TabsTrigger>
          <TabsTrigger value="reviews">
            Reviews{rating.total > 0 && ` (${rating.total})`}
          </TabsTrigger>
          <TabsTrigger value="team">
            Team{data.team.length > 0 && ` (${data.team.length})`}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <h2 className="text-sm font-medium text-muted-foreground">About</h2>
              <p className="whitespace-pre-line leading-relaxed">
                {company.description || "No description yet."}
              </p>
              {data.services.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    Services
                  </h2>
                  <ProfileServices
                    services={data.services.slice(0, 4)}
                    name={company.name}
                  />
                </div>
              )}
            </div>
            <div className="space-y-4">
              <ProfileStanding rating={rating} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="services" className="pt-4">
          <ProfileServices services={data.services} name={company.name} />
        </TabsContent>

        <TabsContent value="reviews" className="space-y-4 pt-4">
          <ProfileStanding rating={rating} />
          {reviews.length > 0 ? (
            <ul className="space-y-3">
              {reviews.map((review) => (
                <li key={review.id}>
                  <ReviewCard review={review} />
                </li>
              ))}
            </ul>
          ) : (
            rating.total > 0 && (
              <p className="text-sm text-muted-foreground">
                These reviews are on the service pages they were written about.
              </p>
            )
          )}
        </TabsContent>

        <TabsContent value="team" className="pt-4">
          <CompanyTeam team={data.team} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
