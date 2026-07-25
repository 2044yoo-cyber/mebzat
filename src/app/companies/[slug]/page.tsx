import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  Globe,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldQuestion,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { getCompanyBySlug } from "@/lib/data/companies";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const company = await getCompanyBySlug(slug);
  if (!company) return { title: "Business not found" };
  return {
    title: company.name,
    description:
      company.description?.slice(0, 155) ||
      `${company.name} on the Medosha business directory.`,
  };
}

export default async function CompanyProfilePage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const company = await getCompanyBySlug(slug);
  if (!company) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOwner = Boolean(user && company.owner_id === user.id);

  if (!isOwner) {
    await supabase.rpc("increment_company_views", { company_id: company.id });
  }

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
    aggregateRating:
      company.rating != null
        ? { "@type": "AggregateRating", ratingValue: company.rating }
        : undefined,
  };

  const stats = [
    company.employees_count != null
      ? { label: "Employees", value: company.employees_count }
      : null,
    { label: "Projects", value: company.projects_completed },
    { label: "Followers", value: company.followers_count },
  ].filter(Boolean) as { label: string; value: number }[];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="overflow-hidden rounded-2xl border">
        <div className="relative h-40 bg-muted sm:h-56">
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
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-end">
            <div className="relative -mt-16 size-24 shrink-0 overflow-hidden rounded-2xl border-4 border-background bg-muted sm:-mt-20 sm:size-28">
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
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {company.name}
                </h1>
                {company.verified && (
                  <BadgeCheck className="size-5 text-brand" />
                )}
                {company.is_claimed ? (
                  <Badge variant="secondary">Claimed</Badge>
                ) : (
                  <Badge variant="outline">Unclaimed</Badge>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {company.category && <span>{company.category}</span>}
                {location && (
                  <span className="flex items-center gap-1">
                    <MapPin className="size-3.5" /> {location}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isOwner ? (
              <Link
                href={`/companies/${company.slug}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil className="size-4" /> Edit business
              </Link>
            ) : !company.is_claimed ? (
              <Link
                href={`/companies/${company.slug}/claim`}
                className={buttonVariants()}
              >
                <ShieldQuestion className="size-4" /> Claim this business
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {/* Unclaimed notice */}
      {!company.is_claimed && (
        <div className="mt-6 flex flex-col items-start gap-3 rounded-2xl border border-dashed bg-muted/40 p-5 sm:flex-row sm:items-center sm:justify-between">
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

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-sm font-medium text-muted-foreground">About</h2>
          <p className="whitespace-pre-line leading-relaxed">
            {company.description || "No description yet."}
          </p>

          {stats.length > 0 && (
            <div className="grid grid-cols-3 gap-3 pt-2">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-xl border p-4">
                  <p className="text-2xl font-semibold">
                    {stat.value.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-2xl border p-5 text-sm">
          <h2 className="font-medium">Contact</h2>
          {company.website && (
            <a
              href={company.website}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <Globe className="size-4 shrink-0" />
              <span className="truncate">{company.website}</span>
            </a>
          )}
          {company.email && (
            <a
              href={`mailto:${company.email}`}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
            >
              <Mail className="size-4 shrink-0" />
              <span className="truncate">{company.email}</span>
            </a>
          )}
          {company.phone && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Phone className="size-4 shrink-0" /> {company.phone}
            </div>
          )}
          {location && (
            <div className="flex items-start gap-2 text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" /> {location}
            </div>
          )}
          {company.employees_count != null && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="size-4 shrink-0" /> {company.employees_count}{" "}
              employees
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
