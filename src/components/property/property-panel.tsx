"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Bath,
  Bed,
  Building2,
  Calculator,
  Car,
  ClipboardList,
  ExternalLink,
  Layers,
  Loader2,
  Maximize,
  MapPin,
  MessageSquare,
  Phone,
  Rotate3d,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PROJECT_PLACEHOLDER } from "@/lib/constants/placeholders";
import { isRenderableSrc, safeImageSrc } from "@/lib/images/safe-src";
import {
  FURNISHING,
  LISTING_KIND,
  NEARBY_GROUPS,
  PLACE_KIND,
  PROPERTY_MEDIA_KIND,
  PROPERTY_TYPE,
  isLandType,
} from "@/lib/constants/properties";
import { cn, formatPrice } from "@/lib/utils";
import type {
  MapProperty,
  NearbyPlace,
  Property,
  PropertyMedia,
} from "@/types/database.types";

/**
 * The property panel.
 *
 * Opens over the map rather than navigating, because leaving the map means
 * losing the camera, the tiles the browser has cached and the user's place in
 * their search. Every property still has its own page for sharing and search
 * engines; this is the browsing path.
 *
 * It fetches on open. Nothing here can affect the map — a failure shows a
 * message inside the panel and the map carries on.
 */

type Detail = {
  // The route returns the joined row, so the panel can show the owner's phone
  // without a second request.
  property: Property & {
    owner: { phone: string | null; full_name: string | null } | null;
  };
  media: PropertyMedia[];
  nearby: NearbyPlace[];
};

export function PropertyPanel({
  summary,
  onClose,
}: {
  summary: MapProperty | null;
  onClose: () => void;
}) {
  if (!summary) return null;

  // Keyed on the property, so selecting another one remounts with clean state
  // instead of an effect clearing the previous property's detail — which would
  // briefly show one property's photos under another's title.
  return <PanelBody key={summary.id} summary={summary} onClose={onClose} />;
}

function PanelBody({
  summary,
  onClose,
}: {
  summary: MapProperty;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState(false);
  const [activeImage, setActiveImage] = useState(0);

  const id = summary.id;

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(`/api/properties/${id}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = (await response.json()) as Detail & { error?: string };
        if (!data.property) throw new Error(data.error ?? "not found");
        setDetail(data);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("[medosha:panel] detail failed:", error);
          setFailed(true);
        }
      }
    })();

    return () => controller.abort();
  }, [id]);

  // Escape closes, which is what a panel over a map should do.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The summary is already on screen from the marker, so the panel shows real
  // content immediately and fills in the rest — no empty skeleton.
  const property = detail?.property;
  const land = isLandType(summary.property_type);
  const images = (detail?.media ?? []).filter(
    (item) => item.kind === "photo" || item.kind === "floor_plan",
  );
  // Filtered rather than substituted. A source `next/image` cannot render
  // throws, and a throw here takes the whole explorer down — the map, the
  // list, the filters and the search with it. Dropping the entry shows the
  // listing with one fewer photo; keeping it shows nothing at all.
  //
  // Filtered rather than replaced with a placeholder because this is a
  // gallery: a strip of identical placeholders is worse than a shorter strip.
  // The main image below falls back to one, since an empty frame there would
  // read as a broken card.
  const gallery = (
    summary.cover_image_url
      ? [{ id: "cover", url: summary.cover_image_url, caption: summary.title, kind: "photo" as const }, ...images]
      : images
  ).filter((item) => isRenderableSrc(item.url));

  const tours = (detail?.media ?? []).filter(
    (item) => item.kind === "panorama_360" || item.kind === "virtual_tour",
  );
  const videos = (detail?.media ?? []).filter(
    (item) => item.kind === "video" || item.kind === "drone_video",
  );

  const context = `${summary.title}, a ${summary.area_m2 ?? ""}m² ${PROPERTY_TYPE[
    summary.property_type
  ].label.toLowerCase()} in ${summary.neighbourhood ?? "Addis Ababa"}`;

  async function share() {
    const url = `${window.location.origin}/property/${summary.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: summary.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch {
      // A cancelled share is not an error worth reporting.
    }
  }

  return (
    <aside
      role="dialog"
      aria-label={summary.title}
      className="flex h-full w-full flex-col overflow-hidden border-l bg-background"
    >
      <div className="relative shrink-0">
        <div className="relative aspect-[4/3] bg-muted">
          <Image
            src={safeImageSrc(gallery[activeImage]?.url, PROJECT_PLACEHOLDER)}
            alt={summary.title}
            fill
            sizes="420px"
            className="object-cover"
            // Blurred placeholder while the full image decodes.
            placeholder="empty"
          />

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur transition-colors hover:bg-background"
          >
            <X className="size-4" />
          </button>

          <span className="absolute top-3 left-3 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur">
            {LISTING_KIND[summary.listing_kind]}
          </span>

          {tours.length > 0 && (
            <span className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur">
              <Rotate3d className="size-3.5" />
              360° tour
            </span>
          )}
        </div>

        {gallery.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto p-2">
            {gallery.slice(0, 8).map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveImage(index)}
                aria-label={`Image ${index + 1}`}
                className={cn(
                  "relative size-14 shrink-0 overflow-hidden rounded-lg border-2 transition-colors",
                  activeImage === index ? "border-brand" : "border-transparent",
                )}
              >
                <Image src={item.url} alt="" fill sizes="56px" className="object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-5 p-4">
          <header>
            <p className="text-2xl font-semibold">
              {summary.price === null
                ? "Price on request"
                : formatPrice(summary.price, summary.currency)}
              {summary.price_period && (
                <span className="text-base font-normal text-muted-foreground">
                  {" "}/ {summary.price_period}
                </span>
              )}
            </p>
            <h2 className="mt-1 font-medium leading-snug">{summary.title}</h2>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="size-3.5" />
              {summary.neighbourhood ?? PROPERTY_TYPE[summary.property_type].label}
            </p>
          </header>

          <dl className="grid grid-cols-3 gap-2">
            {!land && summary.bedrooms !== null && (
              <Spec icon={<Bed className="size-3.5" />} label="Beds" value={String(summary.bedrooms)} />
            )}
            {!land && summary.bathrooms !== null && (
              <Spec icon={<Bath className="size-3.5" />} label="Baths" value={String(summary.bathrooms)} />
            )}
            {summary.area_m2 !== null && Number(summary.area_m2) > 0 && (
              <Spec
                icon={<Maximize className="size-3.5" />}
                label="Built"
                value={`${Number(summary.area_m2).toLocaleString()} m²`}
              />
            )}
            {property?.plot_area_m2 != null && (
              <Spec
                icon={<Maximize className="size-3.5" />}
                label="Land"
                value={`${Number(property.plot_area_m2).toLocaleString()} m²`}
              />
            )}
            {property?.parking_spaces != null && (
              <Spec icon={<Car className="size-3.5" />} label="Garage" value={String(property.parking_spaces)} />
            )}
            {property?.year_built != null && (
              <Spec icon={<Building2 className="size-3.5" />} label="Built" value={String(property.year_built)} />
            )}
          </dl>

          {/* Actions stay visible above the fold, because they are the point. */}
          <div className="grid grid-cols-2 gap-2">
            <Action
              icon={<MessageSquare className="size-4" />}
              label="Message"
              href={`/property/${summary.id}#enquire`}
            />
            {property?.owner?.phone ? (
              <Action icon={<Phone className="size-4" />} label="Call" href={`tel:${property.owner.phone}`} external />
            ) : (
              <Action icon={<Phone className="size-4" />} label="Call" href={`/property/${summary.id}`} />
            )}
            <button
              type="button"
              onClick={share}
              className="flex items-center justify-center gap-2 rounded-xl border py-2 text-sm font-medium transition-colors hover:border-brand"
            >
              <Share2 className="size-4" />
              Share
            </button>
            <Action
              icon={<ExternalLink className="size-4" />}
              label="Full page"
              href={`/property/${summary.id}`}
            />
          </div>

          {failed && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-muted-foreground">
              Full details could not load. The summary above is accurate, and
              the full page still works.
            </p>
          )}

          {!detail && !failed && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Loading details…
            </p>
          )}

          {property?.description && (
            <section>
              <h3 className="mb-1.5 text-sm font-medium">Description</h3>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {property.description}
              </p>
            </section>
          )}

          {property && property.amenities.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium">Amenities</h3>
              <ul className="flex flex-wrap gap-1.5">
                {property.amenities.map((amenity) => (
                  <li key={amenity} className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    {amenity}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {property?.furnishing && (
            <p className="text-sm text-muted-foreground">
              {FURNISHING[property.furnishing]}
            </p>
          )}

          {/* Media the schema accepts but has no viewer for yet is listed
              rather than hidden, so an owner who uploaded it can see it
              landed. */}
          {(tours.length > 0 || videos.length > 0) && (
            <section>
              <h3 className="mb-2 text-sm font-medium">Tours and video</h3>
              <ul className="space-y-1.5">
                {[...tours, ...videos].map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Rotate3d className="size-3.5" />
                      {PROPERTY_MEDIA_KIND[item.kind].label}
                    </span>
                    {PROPERTY_MEDIA_KIND[item.kind].ready ? (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-brand hover:underline"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">Viewer coming</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {detail && detail.nearby.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-medium">What&rsquo;s nearby</h3>
              <div className="space-y-2">
                {NEARBY_GROUPS.map((group) => {
                  const matches = detail.nearby.filter((place) =>
                    group.kinds.includes(place.kind),
                  );
                  if (matches.length === 0) return null;

                  return (
                    <div key={group.label}>
                      <p className="text-xs text-muted-foreground">{group.label}</p>
                      <ul className="mt-1 space-y-1">
                        {matches.slice(0, 3).map((place) => (
                          <li key={place.id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                aria-hidden
                                className="size-2 shrink-0 rounded-full"
                                style={{ backgroundColor: PLACE_KIND[place.kind].colour }}
                              />
                              <span className="truncate">{place.name}</span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {place.distance_km < 1
                                ? `${Math.round(place.distance_km * 1000)} m`
                                : `${place.distance_km} km`}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* The connection to the rest of Medosha, in context. */}
          <section>
            <h3 className="mb-2 text-sm font-medium">Plan work on this property</h3>
            <div className="grid grid-cols-2 gap-2">
              <Tool icon={<Calculator className="size-3.5" />} label="Cost estimate" href={`/ai?agent=cost&q=${encodeURIComponent(`Estimate renovation cost for ${context}`)}`} />
              <Tool icon={<ClipboardList className="size-3.5" />} label="BOQ" href={`/ai?agent=boq&q=${encodeURIComponent(`Generate a BOQ for ${context}`)}`} />
              <Tool icon={<Layers className="size-3.5" />} label="Materials" href={`/ai?agent=materials&q=${encodeURIComponent(`Recommend materials for ${context}`)}`} />
              <Tool icon={<Building2 className="size-3.5" />} label="Suppliers" href="/companies" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {[
                { href: "/directory/individual", label: "Professionals" },
                { href: "/marketplace", label: "Marketplace" },
                { href: "/price-exchange", label: "Prices" },
                { href: "/services", label: "Services" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-full border px-2.5 py-1 text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </section>

          <Link
            href={`/ai?q=${encodeURIComponent(`Is the price fair for ${context}?`)}`}
            className="flex items-center gap-2.5 rounded-xl border border-dashed p-3 transition-colors hover:border-brand hover:bg-brand/5"
          >
            <Sparkles className="size-4 shrink-0 text-brand" />
            <span className="text-sm">
              <span className="block font-medium">Ask the AI assistant</span>
              <span className="block text-xs text-muted-foreground">
                Is this a fair price? What would it cost to renovate?
              </span>
            </span>
          </Link>
        </div>
      </div>
    </aside>
  );
}

function Spec({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2 text-center">
      <dt className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

function Action({
  icon,
  label,
  href,
  external,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
  external?: boolean;
}) {
  const className =
    "flex items-center justify-center gap-2 rounded-xl border py-2 text-sm font-medium transition-colors hover:border-brand";

  if (external) {
    return (
      <a href={href} className={className}>
        {icon}
        {label}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {icon}
      {label}
    </Link>
  );
}

function Tool({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-1.5 rounded-lg border p-2 text-xs font-medium transition-colors hover:border-brand hover:bg-brand/5"
    >
      <span className="text-brand">{icon}</span>
      {label}
    </Link>
  );
}
