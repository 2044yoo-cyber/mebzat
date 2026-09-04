"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Building2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

import { AiField } from "@/components/ai/writing/ai-field";
import { createProperty } from "@/app/property/actions";
import { LocationPicker } from "@/components/property/location-picker";
import { createClient } from "@/lib/supabase/client";
import {
  PhotoUploader,
  compressionSummary,
  type ListingPhoto,
} from "@/components/property/photo-uploader";
import {
  CONTACT_METHODS,
  SELLER_KINDS,
  type ContactMethod,
  type SellerKind,
} from "@/lib/property/listing";
import {
  DEFAULT_RADIUS,
  type LocationVisibility,
  type PrivacyRadius,
} from "@/lib/location/privacy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AMENITIES,
  FURNISHING,
  LISTING_KIND,
  PROPERTY_TYPE,
  PROPERTY_TYPE_GROUPS,
  isLandType,
} from "@/lib/constants/properties";
import { cn } from "@/lib/utils";
import type {
  Furnishing,
  ListingKind,
  PropertyType,
} from "@/types/database.types";

/**
 * The order the listing is built in.
 *
 * Photos first, deliberately. The form used to open on the location — the
 * part a seller has to look up, think about and get right — which is where
 * most of them stopped. Photos are the part already in their hand.
 */
/** Addis Ababa city centre — where the picker opens before anything is set. */
const DEFAULT_POSITION = { lat: 9.0192, lon: 38.7525 };

export function PropertyForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("apartment");
  const [listingKind, setListingKind] = useState<ListingKind>("sale");
  const [price, setPrice] = useState("");
  const [pricePeriod, setPricePeriod] = useState("month");
  const [negotiable, setNegotiable] = useState(false);
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [area, setArea] = useState("");
  const [plotArea, setPlotArea] = useState("");
  const [floors, setFloors] = useState("");
  const [parking, setParking] = useState("");
  const [yearBuilt, setYearBuilt] = useState("");
  const [furnishing, setFurnishing] = useState<Furnishing | "">("");
  const [neighbourhood, setNeighbourhood] = useState("");
  const [locationCity, setLocationCity] = useState("Addis Ababa");
  const [address, setAddress] = useState("");
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [visibility, setVisibility] =
    useState<LocationVisibility>("approximate");
  const [radius, setRadius] = useState<PrivacyRadius>(DEFAULT_RADIUS);
  const [subCity, setSubCity] = useState("");
  const [landmark, setLandmark] = useState("");
  const [street, setStreet] = useState("");
  const [woreda, setWoreda] = useState("");
  const [condominium, setCondominium] = useState("");
  const [photos, setPhotos] = useState<ListingPhoto[]>([]);
  const [sellerKind, setSellerKind] = useState<SellerKind | "">("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactPhoneAlt, setContactPhoneAlt] = useState("");
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [preferredContact, setPreferredContact] = useState<ContactMethod>("call");
  const [describing, setDescribing] = useState(false);
  const [buildingName, setBuildingName] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const land = isLandType(propertyType);
  const renting = listingKind === "rent" || listingKind === "lease";

  function toggleAmenity(value: string) {
    setAmenities((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  /** Empty stays null rather than becoming 0, which would be a claim. */
  function optionalNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  /**
   * Puts the photos in the bucket and returns what to record.
   *
   * Before the listing, not after. A server action cannot receive a Blob, so
   * the browser has to do this — and doing it first means a listing is never
   * created that its photos then fail to join. If an upload fails, nothing has
   * been written to the database yet and the seller can try again with their
   * form still filled in.
   */
  async function uploadPhotos(): Promise<
    | { ok: true; paths: string[]; media: NonNullable<Parameters<typeof createProperty>[0]["photos"]> }
    | { ok: false; message: string }
  > {
    if (photos.length === 0) return { ok: true, paths: [], media: [] };

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, message: "Sign in again to upload photos." };

    // The bucket's insert policy checks the first folder segment against
    // auth.uid(), so the user's id has to lead the path. The second segment is
    // a draft id rather than the property's, which does not exist yet.
    const draft = crypto.randomUUID();
    const paths: string[] = [];
    const media: NonNullable<Parameters<typeof createProperty>[0]["photos"]> = [];

    for (const [index, photo] of photos.entries()) {
      const extension = photo.blob.type === "image/png" ? "png" : photo.blob.type === "image/jpeg" ? "jpg" : "webp";
      const path = `${user.id}/${draft}/${index}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("property-images")
        .upload(path, photo.blob, { contentType: photo.blob.type, upsert: true });

      if (uploadError) {
        console.error("UPLOAD LISTING PHOTO ERROR:", uploadError);
        // Whatever went up before this one comes back down, so a failed
        // attempt leaves nothing behind in the bucket.
        if (paths.length > 0) {
          await supabase.storage.from("property-images").remove(paths);
        }
        return {
          ok: false,
          message: `Could not upload ${photo.name}: ${uploadError.message}`,
        };
      }

      paths.push(path);
      const {
        data: { publicUrl },
      } = supabase.storage.from("property-images").getPublicUrl(path);

      media.push({
        url: publicUrl,
        width: photo.width,
        height: photo.height,
        bytes: photo.bytes,
        blurDataUrl: photo.blurDataUrl,
      });
    }

    return { ok: true, paths, media };
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const uploaded = await uploadPhotos();
      if (!uploaded.ok) {
        setError(uploaded.message);
        return;
      }

      const result = await createProperty({
        title,
        description,
        propertyType,
        listingKind,
        price: optionalNumber(price),
        pricePeriod: renting ? pricePeriod : null,
        priceNegotiable: negotiable,
        bedrooms: land ? null : optionalNumber(bedrooms),
        bathrooms: land ? null : optionalNumber(bathrooms),
        areaM2: optionalNumber(area),
        plotAreaM2: optionalNumber(plotArea),
        floors: optionalNumber(floors),
        parkingSpaces: optionalNumber(parking),
        yearBuilt: optionalNumber(yearBuilt),
        furnishing: furnishing || null,
        address,
        neighbourhood,
        locationCity,
        latitude: position.lat,
        longitude: position.lon,
        subCity,
        landmark,
        street,
        buildingName,
        woreda,
        condominiumName: condominium,
        sellerKind: sellerKind || undefined,
        contactPhone,
        contactPhoneAlt,
        contactWhatsapp,
        contactEmail,
        preferredContact,
        locationVisibility: visibility,
        privacyRadiusM: radius,
        amenities,
        coverImageUrl: coverUrl.trim() || null,
        photos: uploaded.media,
      });

      // A listing that was never created leaves its photos orphaned in the
      // bucket, so they are removed. When `id` is set the listing exists and
      // the photos belong to it, even if `error` also carries a warning about
      // attaching them.
      if (result.error && !result.id) {
        if (uploaded.paths.length > 0) {
          await createClient()
            .storage.from("property-images")
            .remove(uploaded.paths);
        }
        setError(result.error);
        return;
      }

      if (result.error) toast.warning(result.error);
      else toast.success("Property listed");
      if (result.id) router.push(`/property/${result.id}`);
    });
  }

  // The wizard enforced these by refusing to advance. On one page nothing
  // refuses to advance, so they become the condition on the button — dropping
  // them would have quietly made a listing publishable with no photo and no
  // seller, which is a validation change dressed up as a layout change.
  const missing: string[] = [];
  if (photos.length === 0) missing.push("a photo");
  if (title.trim().length < 4) missing.push("a title");
  if (sellerKind === "") missing.push("who is listing it");
  const ready = missing.length === 0;

  return (
    <form onSubmit={submit} className="space-y-8">
      {/* ---- 1. Photos ---------------------------------------------- */}
      {(
        <Section title="Start with the photos">
          <p className="-mt-1 mb-3 text-sm text-muted-foreground">
            The part you already have. Everything else is easier once the
            listing has a face — and photos are checked on this device, so a
            dark one is caught while you are still in the room.
          </p>
          <PhotoUploader
            photos={photos}
            onChange={setPhotos}
          />
        </Section>
      )}

      {(
        <>
      <Section title="What are you listing?">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(LISTING_KIND) as ListingKind[]).map((value) => (
            <Chip
              key={value}
              active={listingKind === value}
              onClick={() => setListingKind(value)}
            >
              {LISTING_KIND[value]}
            </Chip>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {PROPERTY_TYPE_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="mb-1.5 text-xs text-muted-foreground">
                {group.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.types.map((value) => (
                  <Chip
                    key={value}
                    active={propertyType === value}
                    onClick={() => setPropertyType(value)}
                  >
                    {PROPERTY_TYPE[value].label}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="The basics">
        <Field label="Title" htmlFor="p-title">
          <Input
            id="p-title"
            required
            maxLength={200}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            placeholder="e.g. Bole 3-bedroom apartment with parking"
          />
        </Field>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={describing}
            onClick={async () => {
              setDescribing(true);
              try {
                const response = await fetch("/api/property/describe-location", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    city: locationCity,
                    subCity,
                    woreda,
                    neighbourhood,
                    landmark,
                    street,
                    propertyType: PROPERTY_TYPE[propertyType].label,
                    listingKind: LISTING_KIND[listingKind],
                  }),
                });

                if (!response.ok || !response.body) {
                  const payload = (await response.json().catch(() => ({}))) as {
                    error?: string;
                  };
                  toast.error(payload.error ?? "Could not write that.");
                  return;
                }

                // Streamed into the field, appended to whatever is there —
                // never over the top of what the seller already wrote.
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let out = "";
                const prefix = description.trim() ? `${description.trim()}\n\n` : "";
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  out += decoder.decode(value, { stream: true });
                  setDescription(prefix + out);
                }
              } catch {
                toast.error("The assistant could not be reached.");
              } finally {
                setDescribing(false);
              }
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:border-brand disabled:opacity-50"
          >
            <Sparkles className="size-3.5 text-brand" />
            {describing ? "Writing…" : "Suggest a location paragraph"}
          </button>
          <span className="text-xs text-muted-foreground">
            Uses only the places you named. Edit or delete it freely.
          </span>
        </div>

        <Field label="Description" htmlFor="p-description">
          <AiField
            id="p-description"
            surface="property"
            context={title ? `Property: ${title}` : undefined}
            value={description}
            maxLength={5000}
            onValueChange={setDescription}
            placeholder="Condition, finishes, what is included, why someone would want it."
            className="min-h-32"
          />
        </Field>

        <Field label="Cover image URL" htmlFor="p-cover">
          <Input
            id="p-cover"
            type="url"
            value={coverUrl}
            onChange={(event) => setCoverUrl(event.target.value)}
            placeholder="https://… (optional)"
          />
        </Field>
      </Section>

      {/* ---- Who is selling ---------------------------------------- */}
      <Section title="Who are you?">
        <p className="-mt-1 mb-2 text-sm text-muted-foreground">
          Buyers ask this first, because it changes who can actually agree a
          price. Required.
        </p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {SELLER_KINDS.map((entry) => (
            <label
              key={entry.value}
              className={cn(
                "flex cursor-pointer items-start gap-2.5 rounded-xl border p-2.5 transition-colors",
                sellerKind === entry.value
                  ? "border-brand bg-brand/5"
                  : "hover:border-brand/40",
              )}
            >
              <input
                type="radio"
                name="seller_kind"
                checked={sellerKind === entry.value}
                onChange={() => setSellerKind(entry.value)}
                className="mt-0.5 size-4"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {entry.emoji} {entry.label}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {entry.blurb}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      {/* ---- How to reach you --------------------------------------- */}
      <Section title="How buyers reach you">
        <p className="-mt-1 mb-2 text-sm text-muted-foreground">
          These belong to the listing, not your account — the number to call
          about a house is often not the one you signed up with. Numbers are
          hidden behind a tap on the public page, so scrapers do not get them
          for free.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Phone" htmlFor="p-phone">
            <Input
              id="p-phone"
              type="tel"
              value={contactPhone}
              onChange={(event) => setContactPhone(event.target.value)}
              placeholder="0911 234 567"
            />
          </Field>
          <Field label="Second phone (optional)" htmlFor="p-phone2">
            <Input
              id="p-phone2"
              type="tel"
              value={contactPhoneAlt}
              onChange={(event) => setContactPhoneAlt(event.target.value)}
            />
          </Field>
          <Field label="WhatsApp (optional)" htmlFor="p-wa">
            <Input
              id="p-wa"
              type="tel"
              value={contactWhatsapp}
              onChange={(event) => setContactWhatsapp(event.target.value)}
              placeholder="Leave blank to use your phone number"
            />
          </Field>
          <Field label="Email (optional)" htmlFor="p-email">
            <Input
              id="p-email"
              type="email"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Preferred way to be contacted" htmlFor="p-preferred">
          <select
            id="p-preferred"
            value={preferredContact}
            onChange={(event) =>
              setPreferredContact(event.target.value as ContactMethod)
            }
            className="h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm"
          >
            {CONTACT_METHODS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
      </Section>
        </>
      )}

      {(
      <Section title="Price">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={`Price (ETB)`} htmlFor="p-price">
            <Input
              id="p-price"
              type="number"
              min={0}
              step="any"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              placeholder="Leave blank for on request"
            />
          </Field>

          {renting && (
            <Field label="Per" htmlFor="p-period">
              <select
                id="p-period"
                value={pricePeriod}
                onChange={(event) => setPricePeriod(event.target.value)}
                className="h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm"
              >
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
            </Field>
          )}

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={negotiable}
                onChange={(event) => setNegotiable(event.target.checked)}
                className="size-4 rounded border"
              />
              Negotiable
            </label>
          </div>
        </div>
      </Section>

      )}

      {(
        <>
      <Section title="Details">
        <div className="grid gap-3 sm:grid-cols-3">
          {/* Land has no bedrooms or bathrooms, so asking would be noise. */}
          {!land && (
            <>
              <Field label="Bedrooms" htmlFor="p-beds">
                <Input
                  id="p-beds"
                  type="number"
                  min={0}
                  value={bedrooms}
                  onChange={(event) => setBedrooms(event.target.value)}
                />
              </Field>
              <Field label="Bathrooms" htmlFor="p-baths">
                <Input
                  id="p-baths"
                  type="number"
                  min={0}
                  value={bathrooms}
                  onChange={(event) => setBathrooms(event.target.value)}
                />
              </Field>
            </>
          )}

          {!land && (
            <Field label="Built area (m²)" htmlFor="p-area">
              <Input
                id="p-area"
                type="number"
                min={0}
                step="any"
                value={area}
                onChange={(event) => setArea(event.target.value)}
              />
            </Field>
          )}

          <Field label="Plot area (m²)" htmlFor="p-plot">
            <Input
              id="p-plot"
              type="number"
              min={0}
              step="any"
              value={plotArea}
              onChange={(event) => setPlotArea(event.target.value)}
            />
          </Field>

          {!land && (
            <>
              <Field label="Floors" htmlFor="p-floors">
                <Input
                  id="p-floors"
                  type="number"
                  min={0}
                  value={floors}
                  onChange={(event) => setFloors(event.target.value)}
                />
              </Field>
              <Field label="Parking spaces" htmlFor="p-parking">
                <Input
                  id="p-parking"
                  type="number"
                  min={0}
                  value={parking}
                  onChange={(event) => setParking(event.target.value)}
                />
              </Field>
              <Field label="Year built" htmlFor="p-year">
                <Input
                  id="p-year"
                  type="number"
                  min={1800}
                  max={2100}
                  value={yearBuilt}
                  onChange={(event) => setYearBuilt(event.target.value)}
                />
              </Field>
              <Field label="Furnishing" htmlFor="p-furnish">
                <select
                  id="p-furnish"
                  value={furnishing}
                  onChange={(event) =>
                    setFurnishing(event.target.value as Furnishing | "")
                  }
                  className="h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm"
                >
                  <option value="">Not specified</option>
                  {(Object.keys(FURNISHING) as Furnishing[]).map((value) => (
                    <option key={value} value={value}>
                      {FURNISHING[value]}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>
      </Section>

      {!land && (
        <Section title="Amenities">
          <div className="flex flex-wrap gap-1.5">
            {AMENITIES.map((amenity) => (
              <Chip
                key={amenity}
                active={amenities.includes(amenity)}
                onClick={() => toggleAmenity(amenity)}
              >
                {amenity}
              </Chip>
            ))}
          </div>
        </Section>
      )}

        </>
      )}

      {(
      <Section title="Location">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="City" htmlFor="p-city">
            <Input
              id="p-city"
              value={locationCity}
              onChange={(event) => setLocationCity(event.target.value)}
            />
          </Field>
          <Field label="Neighbourhood" htmlFor="p-hood">
            <Input
              id="p-hood"
              value={neighbourhood}
              onChange={(event) => setNeighbourhood(event.target.value)}
              placeholder="e.g. Bole, CMC, Kazanchis"
            />
          </Field>
          <Field label="Address" htmlFor="p-address">
            <Input
              id="p-address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Woreda" htmlFor="p-woreda">
            <Input
              id="p-woreda"
              value={woreda}
              onChange={(event) => setWoreda(event.target.value)}
              placeholder="e.g. Woreda 03"
            />
          </Field>
          <Field label="Condominium or site name" htmlFor="p-condo">
            <Input
              id="p-condo"
              value={condominium}
              onChange={(event) => setCondominium(event.target.value)}
              placeholder="e.g. Ayat Condominium"
            />
          </Field>
          <Field label="Sub city" htmlFor="p-subcity">
            <Input
              id="p-subcity"
              value={subCity}
              onChange={(event) => setSubCity(event.target.value)}
              placeholder="e.g. Bole, Yeka, Kirkos"
            />
          </Field>
          <Field label="Street" htmlFor="p-street">
            <Input
              id="p-street"
              value={street}
              onChange={(event) => setStreet(event.target.value)}
              placeholder="Optional — e.g. Cameroon Street"
            />
          </Field>
          <Field label="Building name" htmlFor="p-building">
            <Input
              id="p-building"
              value={buildingName}
              onChange={(event) => setBuildingName(event.target.value)}
              placeholder="Optional — e.g. Rosewood Tower"
            />
          </Field>
          <Field label="Nearest landmark" htmlFor="p-landmark">
            <Input
              id="p-landmark"
              value={landmark}
              onChange={(event) => setLandmark(event.target.value)}
              placeholder="Optional — e.g. near Edna Mall"
            />
          </Field>
        </div>

        <div className="mt-4">
          <LocationPicker
            latitude={position.lat}
            longitude={position.lon}
            visibility={visibility}
            radius={radius}
            onChange={(lat, lon) => setPosition({ lat, lon })}
            onVisibilityChange={setVisibility}
            onRadiusChange={setRadius}
            onPlaceSelected={(place) => {
              // A chosen result fills the text fields too, so the pin and the
              // written address cannot end up describing different places.
              if (place.city) setLocationCity(place.city);
              if (place.neighbourhood) setNeighbourhood(place.neighbourhood);
            }}
          />
        </div>
      </Section>

      )}

      {(
        <Section title="Check it over">
          <div className="space-y-3">
            {photos[0] && (
              <div className="overflow-hidden rounded-2xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photos[0].preview}
                  alt=""
                  className="aspect-[16/9] w-full object-cover"
                />
              </div>
            )}

            <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              <Review label="Title" value={title || "—"} />
              <Review
                label="Type"
                value={`${PROPERTY_TYPE[propertyType].label} · ${LISTING_KIND[listingKind]}`}
              />
              <Review
                label="Price"
                value={price ? `${Number(price).toLocaleString("en-ET")} ETB` : "—"}
              />
              <Review
                label="Where"
                value={[neighbourhood, subCity, locationCity].filter(Boolean).join(", ") || "—"}
              />
              <Review
                label="You are"
                value={
                  SELLER_KINDS.find((entry) => entry.value === sellerKind)?.label ?? "—"
                }
              />
              <Review label="Photos" value={`${photos.length}`} />
              <Review
                label="Map shows"
                value={
                  visibility === "exact"
                    ? "Your exact pin"
                    : visibility === "approximate"
                      ? `A ${radius >= 1000 ? `${radius / 1000} km` : `${radius} m`} circle`
                      : "The neighbourhood name only"
                }
              />
            </dl>

            {compressionSummary(photos) && (
              <p className="text-xs text-muted-foreground">
                {compressionSummary(photos)}
              </p>
            )}

            {photos.length === 0 && (
              <p className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                No photos. Listings without them are largely ignored — go back
                and add one, even a phone snap.
              </p>
            )}
          </div>
        </Section>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {/* One button, at the bottom, where somebody who has filled the page in
          expects to find it. */}
      <div className="flex flex-wrap items-center gap-3 border-t pt-6">
        <Button type="submit" size="lg" disabled={pending || !ready}>
          <Building2 className="size-4" />
          {pending ? "Publishing…" : "Publish listing"}
        </Button>

        <Button
          type="button"
          size="lg"
          variant="ghost"
          onClick={() => router.push("/city")}
        >
          Cancel
        </Button>

        {/* Named, not implied. A greyed-out button that does not say what it
            wants is a dead end somebody stares at. */}
        {!ready && (
          <p className="text-sm text-muted-foreground">
            Still needs {missing.join(", ")}.
          </p>
        )}
      </div>

    </form>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 font-medium">{value}</dd>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "hover:border-brand hover:bg-brand/5",
      )}
    >
      {children}
    </button>
  );
}
