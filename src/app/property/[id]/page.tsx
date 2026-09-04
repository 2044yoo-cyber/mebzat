import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Bath,
  Bed,
  Building2,
  Calculator,
  Car,
  ClipboardList,
  Layers,
  Maximize,
  MapPin,
  Rotate3d,
  Sofa,
  Sparkles,
} from "lucide-react";

import { ContactCard } from "@/components/property/contact-card";
import { ListingBadges } from "@/components/property/listing-badges";
import { Neighbourhood } from "@/components/property/neighbourhood";
import { PublicLocation } from "@/components/property/public-location";
import { PropertyActions } from "@/components/property/property-actions";
import { AVATAR_PLACEHOLDER, PROJECT_PLACEHOLDER } from "@/lib/constants/placeholders";
import {
  FURNISHING,
  LISTING_KIND,
  PROPERTY_TYPE,
  isLandType,
} from "@/lib/constants/properties";
import {
  getPriceStats,
  getNearbyServices,
  getProperty,
  getPropertyLocation,
  getTravelTimes,
  getPropertyMedia,
  getPublicNearbyPlaces,
  isPropertySaved,
} from "@/lib/data/properties";
import { createClient } from "@/lib/supabase/server";
import { listToursFor } from "@/lib/tour/queries";
import { cn, formatPrice } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const property = await getProperty(id);
  if (!property) return { title: "Property not found" };

  const price =
    property.price === null
      ? "Price on request"
      : formatPrice(property.price, property.currency);

  return {
    title: `${property.title} — ${price}`,
    description:
      property.description?.slice(0, 160) ??
      `${PROPERTY_TYPE[property.property_type].label} ${LISTING_KIND[property.listing_kind].toLowerCase()} in ${property.neighbourhood ?? property.location_city ?? "Ethiopia"}.`,
    openGraph: {
      title: property.title,
      description: property.description?.slice(0, 160) ?? undefined,
      images: property.cover_image_url ? [property.cover_image_url] : undefined,
      type: "article",
    },
  };
}

/** Where each Medosha module helps once you own the place. */
const INTEGRATIONS = [
  {
    href: "/ai?agent=cost&q=",
    label: "Cost Estimator",
    blurb: "What renovating this would cost",
    icon: Calculator,
    prompt: "Estimate the renovation cost for ",
  },
  {
    href: "/ai?agent=boq&q=",
    label: "BOQ Generator",
    blurb: "A bill of quantities for the work",
    icon: ClipboardList,
    prompt: "Generate a preliminary BOQ for ",
  },
  {
    href: "/ai?agent=materials&q=",
    label: "Material Advisor",
    blurb: "What to specify and why",
    icon: Layers,
    prompt: "Recommend finishes and materials for ",
  },
  {
    href: "/ai?agent=companies&q=",
    label: "Supplier Finder",
    blurb: "Who can supply it nearby",
    icon: Building2,
    prompt: "Find suppliers and contractors for ",
  },
];

export default async function PropertyPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;

  const property = await getProperty(id);
  if (!property) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [media, location, publicPlaces, travel, services, stats, saved, tours] =
    await Promise.all([
    getPropertyMedia(property.id),
    getPropertyLocation(property.id),
    getPublicNearbyPlaces(property.id, 2),
    getTravelTimes(property.id),
    getNearbyServices(property.id),
    getPriceStats(
      property.property_type,
      property.listing_kind,
      property.location_city,
    ),
    isPropertySaved(property.id, user?.id ?? null),
    listToursFor({ propertyId: property.id, ownerId: property.owner_id }),
  ]);

  const land = isLandType(property.property_type);
  const photos = media.filter(
    (item) => item.kind === "photo" || item.kind === "floor_plan",
  );
  const gallery = property.cover_image_url
    ? [
        { id: "cover", url: property.cover_image_url, caption: property.title },
        ...photos,
      ]
    : photos;

  const sellerName =
    property.company?.name ??
    property.owner?.company_name ??
    property.owner?.full_name ??
    "Medosha member";

  const perM2 =
    property.price !== null && property.area_m2
      ? property.price / Number(property.area_m2)
      : null;

  const versusMarket =
    perM2 !== null && stats.averagePerM2
      ? ((perM2 - Number(stats.averagePerM2)) / Number(stats.averagePerM2)) * 100
      : null;

  const context = `${property.title} — a ${property.area_m2 ?? ""}m² ${PROPERTY_TYPE[property.property_type].label.toLowerCase()} in ${property.neighbourhood ?? property.location_city ?? "Addis Ababa"}`;

  // Schema.org so listings can surface as rich results.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: property.title,
    ...(property.description ? { description: property.description } : {}),
    ...(property.cover_image_url ? { image: [property.cover_image_url] } : {}),
    ...(property.price !== null
      ? {
          offers: {
            "@type": "Offer",
            price: property.price,
            priceCurrency: property.currency,
            availability: "https://schema.org/InStock",
          },
        }
      : {}),
    address: {
      "@type": "PostalAddress",
      addressLocality: property.location_city,
      addressCountry: property.location_country,
    },
    ...(property.area_m2
      ? {
          floorSize: {
            "@type": "QuantitativeValue",
            value: Number(property.area_m2),
            unitCode: "MTK",
          },
        }
      : {}),
    ...(property.bedrooms !== null ? { numberOfRooms: property.bedrooms } : {}),
  };

  return (
    <div className="container-page py-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <Link
        href="/city"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to the map
      </Link>

      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <div className="relative aspect-video overflow-hidden rounded-2xl bg-muted">
            <Image
              src={gallery[0]?.url || PROJECT_PLACEHOLDER}
              alt={property.title}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 62vw"
              className="object-cover"
            />
            <span className="absolute top-3 left-3 rounded-full bg-background/90 px-3 py-1 text-sm font-medium backdrop-blur">
              {LISTING_KIND[property.listing_kind]}
            </span>
            {/* The badge used to say a tour existed and give nobody a way to
                open it. It is the link now — and when there is no tour, the
                owner is the only person who can do anything about that, so
                they are the only one who sees the other half. */}
            {tours.length > 0 ? (
              <Link
                href={`/tour/${tours[0].id}`}
                className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-sm font-medium backdrop-blur transition-colors hover:bg-background"
              >
                <Rotate3d className="size-4" />
                {tours.length > 1 ? `${tours.length} 360° tours` : "Walk through in 360°"}
              </Link>
            ) : (
              user?.id === property.owner_id && (
                <Link
                  href={`/tours/new?property=${property.id}`}
                  className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-background/90 px-3 py-1 text-sm font-medium backdrop-blur transition-colors hover:bg-background"
                >
                  <Rotate3d className="size-4" />
                  Add a 360° tour
                </Link>
              )
            )}
          </div>

          {gallery.length > 1 && (
            <div className="grid grid-cols-4 gap-3">
              {gallery.slice(1, 5).map((item) => (
                <div
                  key={item.id}
                  className="relative aspect-square overflow-hidden rounded-xl bg-muted"
                >
                  <Image
                    src={item.url}
                    alt={item.caption ?? ""}
                    fill
                    sizes="20vw"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
          )}

          <header>
            <p className="text-sm text-muted-foreground">
              {PROPERTY_TYPE[property.property_type].label}
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">
              {property.title}
            </h1>

            {/* Who is selling, and what has been checked. The same component
                the map card and the search results use, so a listing cannot
                look verified in one place and not another. */}
            <ListingBadges
              className="mt-2"
              sellerKind={property.seller_kind}
              listingVerified={property.listing_verified}
              sellerVerified={property.owner?.verification_status === "verified"}
              isPremium={property.is_premium}
              isCompany={Boolean(property.company)}
              isSample={property.is_sample}
            />
            <p className="mt-2 flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="size-4" />
              {[property.neighbourhood, property.location_city, property.location_country]
                .filter(Boolean)
                .join(", ")}
              {property.hide_exact_location && (
                <span className="text-xs">(approximate)</span>
              )}
            </p>
          </header>

          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {!land && property.bedrooms !== null && (
              <Spec icon={<Bed className="size-4" />} label="Bedrooms" value={String(property.bedrooms)} />
            )}
            {!land && property.bathrooms !== null && (
              <Spec icon={<Bath className="size-4" />} label="Bathrooms" value={String(property.bathrooms)} />
            )}
            {property.area_m2 !== null && Number(property.area_m2) > 0 && (
              <Spec
                icon={<Maximize className="size-4" />}
                label="Built area"
                value={`${Number(property.area_m2).toLocaleString()} m²`}
              />
            )}
            {property.plot_area_m2 !== null && (
              <Spec
                icon={<Maximize className="size-4" />}
                label="Plot"
                value={`${Number(property.plot_area_m2).toLocaleString()} m²`}
              />
            )}
            {property.parking_spaces !== null && (
              <Spec icon={<Car className="size-4" />} label="Parking" value={String(property.parking_spaces)} />
            )}
            {property.furnishing && (
              <Spec
                icon={<Sofa className="size-4" />}
                label="Furnishing"
                value={FURNISHING[property.furnishing]}
              />
            )}
            {property.year_built !== null && (
              <Spec icon={<Building2 className="size-4" />} label="Built" value={String(property.year_built)} />
            )}
            {property.floors !== null && (
              <Spec icon={<Layers className="size-4" />} label="Floors" value={String(property.floors)} />
            )}
          </dl>

          {property.description && (
            <section>
              <h2 className="mb-2 text-lg font-semibold">About this property</h2>
              <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                {property.description}
              </p>
            </section>
          )}

          {property.amenities.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold">Amenities</h2>
              <ul className="flex flex-wrap gap-2">
                {property.amenities.map((amenity) => (
                  <li
                    key={amenity}
                    className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground"
                  >
                    {amenity}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Location, told to whoever is reading. The exact pin has already
              been redacted upstream unless this reader is entitled to it, so
              nothing sensitive reaches the browser from here. */}
          {location && (
            <PublicLocation
              latitude={location.latitude}
              longitude={location.longitude}
              radiusM={location.radius_m}
              visibility={location.visibility}
              isExact={location.is_exact}
              verified={location.verified}
              city={location.city}
              subCity={location.sub_city}
              neighbourhood={location.neighbourhood}
              landmark={location.landmark}
              cityCentre={
                property.city
                  ? {
                      latitude: property.city.latitude,
                      longitude: property.city.longitude,
                      name: property.city.name,
                    }
                  : null
              }
              places={publicPlaces}
              canRequestAccess={property.owner_id !== user?.id}
            />
          )}

          <Neighbourhood
            travel={travel}
            services={services}
            city={property.location_city}
          />

          {/* Contact goes last in the column and is repeated in the sticky
              sidebar: a buyer who has read the whole page is the one most
              likely to call, and making them scroll back up loses them. */}
          <ContactCard
            phone={property.contact_phone}
            phoneAlt={property.contact_phone_alt}
            whatsapp={property.contact_whatsapp ?? property.contact_phone}
            email={property.contact_email}
            preferred={property.preferred_contact}
            propertyTitle={property.title}
          />

          {/* Every property connects to the rest of Medosha. */}
          <section>
            <h2 className="mb-3 text-lg font-semibold">
              Plan the work on this property
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {INTEGRATIONS.map((entry) => (
                <Link
                  key={entry.label}
                  href={`${entry.href}${encodeURIComponent(entry.prompt + context)}`}
                  className="group flex items-center gap-3 rounded-2xl border p-4 transition-colors hover:border-brand hover:bg-brand/5"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
                    <entry.icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{entry.label}</span>
                    <span className="block text-sm text-muted-foreground">
                      {entry.blurb}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {[
                { href: "/directory/individual", label: "Find professionals" },
                { href: "/companies", label: "Find companies" },
                { href: "/marketplace", label: "Marketplace" },
                { href: "/price-exchange", label: "Live material prices" },
                { href: "/services", label: "Interior design services" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border px-3 py-1.5 text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-2xl border p-5">
            <p className="text-3xl font-semibold">
              {property.price === null
                ? "On request"
                : formatPrice(property.price, property.currency)}
              {property.price_period && (
                <span className="text-base font-normal text-muted-foreground">
                  {" "}
                  / {property.price_period}
                </span>
              )}
            </p>
            {property.price_negotiable && (
              <p className="text-sm text-muted-foreground">Negotiable</p>
            )}

            {perM2 !== null && (
              <p className="mt-1 text-sm text-muted-foreground">
                {formatPrice(Math.round(perM2), property.currency)} per m²
              </p>
            )}

            {versusMarket !== null && stats.sampleSize > 1 && (
              <p
                className={cn(
                  "mt-3 text-sm",
                  versusMarket > 0 ? "text-destructive" : "text-emerald-500",
                )}
              >
                {versusMarket > 0 ? "+" : ""}
                {versusMarket.toFixed(1)}% versus the average per m² for{" "}
                {PROPERTY_TYPE[property.property_type].label.toLowerCase()}s
                here ({stats.sampleSize} listings)
              </p>
            )}

            <div className="mt-5 border-t pt-5">
              <PropertyActions
                propertyId={property.id}
                ownerPhone={property.owner?.phone ?? null}
                saved={saved}
                signedIn={user !== null}
                isOwner={user?.id === property.owner_id}
              />
            </div>
          </div>

          <div className="rounded-2xl border p-5">
            <p className="text-xs text-muted-foreground">Listed by</p>
            <div className="mt-2 flex items-center gap-3">
              <Image
                src={property.company?.logo_url || property.owner?.avatar_url || AVATAR_PLACEHOLDER}
                alt=""
                width={44}
                height={44}
                className="size-11 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0">
                {property.company?.slug ? (
                  <Link
                    href={`/companies/${property.company.slug}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {sellerName}
                  </Link>
                ) : property.owner?.username ? (
                  <Link
                    href={`/u/${property.owner.username}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {sellerName}
                  </Link>
                ) : (
                  <span className="block truncate font-medium">{sellerName}</span>
                )}
                <span className="text-sm text-muted-foreground">
                  {property.view_count} views · {property.save_count} saved
                </span>
              </div>
            </div>
          </div>

          <Link
            href={`/ai?q=${encodeURIComponent(`Tell me about ${context}. Is the price fair?`)}`}
            className="flex items-center gap-3 rounded-2xl border border-dashed p-4 transition-colors hover:border-brand hover:bg-brand/5"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
              <Sparkles className="size-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">
                Ask the AI property assistant
              </span>
              <span className="block text-xs text-muted-foreground">
                Is this a fair price? What would it cost to renovate?
              </span>
            </span>
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Spec({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 font-medium">{value}</dd>
    </div>
  );
}
