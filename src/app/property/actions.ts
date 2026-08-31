"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { DEFAULT_RADIUS, PRIVACY_RADII } from "@/lib/location/privacy";
import { reportFailure } from "@/lib/supabase/errors";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import type {
  Furnishing,
  ListingKind,
  PropertyType,
} from "@/types/database.types";

export type PropertyResult = { error?: string; id?: string };

async function requireUser(returnTo: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirect=${encodeURIComponent(returnTo)}`);
  return { supabase, user };
}

export type PropertyInput = {
  title: string;
  description?: string;
  propertyType: PropertyType;
  listingKind: ListingKind;
  price?: number | null;
  pricePeriod?: string | null;
  priceNegotiable?: boolean;
  bedrooms?: number | null;
  bathrooms?: number | null;
  areaM2?: number | null;
  plotAreaM2?: number | null;
  floors?: number | null;
  parkingSpaces?: number | null;
  yearBuilt?: number | null;
  furnishing?: Furnishing | null;
  address?: string;
  neighbourhood?: string;
  locationCity?: string;
  latitude: number;
  longitude: number;
  hideExactLocation?: boolean;
  subCity?: string;
  landmark?: string;
  street?: string;
  buildingName?: string;
  locationVisibility?: "exact" | "approximate" | "neighbourhood";
  privacyRadiusM?: number;
  woreda?: string;
  condominiumName?: string;
  sellerKind?: "owner" | "agent" | "developer" | "broker" | "property_manager";
  contactPhone?: string;
  contactPhoneAlt?: string;
  contactWhatsapp?: string;
  contactEmail?: string;
  preferredContact?: "call" | "whatsapp" | "message" | "email";
  amenities?: string[];
  coverImageUrl?: string | null;
  publish?: boolean;
  /**
   * Photos already uploaded to the `property-images` bucket, in display order.
   *
   * Uploaded by the browser before this runs, because a server action cannot
   * receive a Blob. The rows in `property_media` are written here so the
   * listing and its photos land in one request — a client that writes them
   * separately can leave a listing with no photos if the user closes the tab.
   */
  photos?: { url: string; width?: number; height?: number; bytes?: number; blurDataUrl?: string }[];
};

/**
 * Creates a listing.
 *
 * A rental with no period would be ambiguous and a sale with one would be
 * wrong, so the period is normalised here rather than trusting the form — the
 * database has the same check, and this turns it into a readable message.
 */
export async function createProperty(
  input: PropertyInput,
): Promise<PropertyResult> {
  const { supabase, user } = await requireUser("/property/new");

  const title = input.title.trim();
  if (title.length < 4) return { error: "Give the listing a title." };
  if (title.length > 200) return { error: "That title is too long." };

  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    return { error: "Pick the location on the map." };
  }
  if (Math.abs(input.latitude) > 90 || Math.abs(input.longitude) > 180) {
    return { error: "That location is not on the map." };
  }

  const price = input.price ?? null;
  if (price !== null && (!Number.isFinite(price) || price < 0)) {
    return { error: "Enter a valid price." };
  }

  const renting = input.listingKind === "rent" || input.listingKind === "lease";
  const pricePeriod = renting ? (input.pricePeriod || "month") : null;

  // Slugs are unique per owner, so a suffix only has to disambiguate against
  // this seller's own listings.
  const base = slugify(title).slice(0, 60) || "property";
  const { data: existing } = await supabase
    .from("properties")
    .select("slug")
    .eq("owner_id", user.id)
    .like("slug", `${base}%`);

  const taken = new Set((existing ?? []).map((row) => row.slug));
  let slug = base;
  let suffix = 2;
  while (taken.has(slug)) slug = `${base}-${suffix++}`;

  // Attach to a city when the coordinates fall inside one, so the map can
  // group listings without the seller choosing from a list.
  const { data: cities } = await supabase
    .from("cities")
    .select("id, min_latitude, max_latitude, min_longitude, max_longitude");

  const cityId =
    (cities ?? []).find(
      (city) =>
        city.min_latitude !== null &&
        city.max_latitude !== null &&
        city.min_longitude !== null &&
        city.max_longitude !== null &&
        input.latitude >= city.min_latitude &&
        input.latitude <= city.max_latitude &&
        input.longitude >= city.min_longitude &&
        input.longitude <= city.max_longitude,
    )?.id ?? null;

  const { data, error } = await supabase
    .from("properties")
    .insert({
      owner_id: user.id,
      city_id: cityId,
      title,
      slug,
      description: input.description?.trim() || null,
      property_type: input.propertyType,
      listing_kind: input.listingKind,
      price,
      price_period: pricePeriod,
      price_negotiable: input.priceNegotiable ?? false,
      bedrooms: input.bedrooms ?? null,
      bathrooms: input.bathrooms ?? null,
      area_m2: input.areaM2 ?? null,
      plot_area_m2: input.plotAreaM2 ?? null,
      floors: input.floors ?? null,
      parking_spaces: input.parkingSpaces ?? null,
      year_built: input.yearBuilt ?? null,
      furnishing: input.furnishing ?? null,
      address: input.address?.trim() || null,
      neighbourhood: input.neighbourhood?.trim() || null,
      location_city: input.locationCity?.trim() || null,
      latitude: input.latitude,
      longitude: input.longitude,
      sub_city: input.subCity?.trim() || null,
      landmark: input.landmark?.trim() || null,
      street: input.street?.trim() || null,
      building_name: input.buildingName?.trim() || null,
      woreda: input.woreda?.trim() || null,
      condominium_name: input.condominiumName?.trim() || null,
      // Who is selling. Left null rather than guessed when unanswered: a wrong
      // badge is the fact a buyer decides how to negotiate on.
      seller_kind: input.sellerKind ?? null,
      contact_phone: input.contactPhone?.trim() || null,
      contact_phone_alt: input.contactPhoneAlt?.trim() || null,
      contact_whatsapp: input.contactWhatsapp?.trim() || null,
      contact_email: input.contactEmail?.trim() || null,
      preferred_contact: input.preferredContact ?? "call",
      // Approximate by default. A seller who wants their door public has to
      // say so; the safer setting should never be the one you have to find.
      location_visibility: input.locationVisibility ?? "approximate",
      // Anything outside the offered set is refused by a check constraint, so
      // a bad value is a failed insert rather than a wrong-sized circle.
      privacy_radius_m: PRIVACY_RADII.includes(
        input.privacyRadiusM as (typeof PRIVACY_RADII)[number],
      )
        ? input.privacyRadiusM
        : DEFAULT_RADIUS,
      amenities: input.amenities ?? [],
      cover_image_url: input.coverImageUrl || null,
      status: input.publish === false ? "draft" : "available",
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      error: reportFailure(
        "CREATE LISTING ERROR",
        error,
        "Could not create that listing.",
      ),
    };
  }

  // The photos, now that there is a listing to attach them to.
  //
  // After the insert rather than before, because `property_media.property_id`
  // is a foreign key and there is no id until the row exists.
  //
  // A separate statement, too, and that part is not obvious: the media table's
  // insert policy checks `exists (select 1 from properties where id = ...)`,
  // and a data-modifying CTE's new row is invisible to the rest of the same
  // statement. Folding these two inserts into one `with created as (...)` looks
  // tidier and is refused by row-level security for a property that plainly
  // exists.
  //
  // The cover is whatever the seller put first.
  const photos = input.photos ?? [];
  if (photos.length > 0) {
    const { error: mediaError } = await supabase.from("property_media").insert(
      photos.map((photo, index) => ({
        property_id: data.id,
        kind: "photo" as const,
        url: photo.url,
        position: index,
        width: photo.width ?? null,
        height: photo.height ?? null,
        size_bytes: photo.bytes ?? null,
        blur_data_url: photo.blurDataUrl ?? null,
      })),
    );

    if (mediaError) {
      // The listing exists and the photos do not. Deleting the listing would
      // throw away everything the seller typed over six steps to recover from
      // a failure in the last hundred milliseconds of it — so the listing
      // stays, and they are told which half succeeded. The photos are still in
      // the bucket and can be attached by editing.
      const detail = reportFailure(
        "CREATE LISTING PHOTOS ERROR",
        mediaError,
        "The listing was created, but its photos could not be attached. Edit the listing to add them.",
      );
      revalidatePath("/city");
      return { id: data.id, error: detail };
    }

    // The first photo becomes the cover when the seller has not named one, so
    // a listing with photos never shows an empty card.
    if (!input.coverImageUrl && photos[0]) {
      await supabase
        .from("properties")
        .update({ cover_image_url: photos[0].url })
        .eq("id", data.id);
    }
  }

  revalidatePath("/city");
  return { id: data.id };
}

/** Saves or unsaves a listing. */
export async function toggleSaveProperty(
  propertyId: string,
): Promise<PropertyResult> {
  const { supabase, user } = await requireUser(`/property/${propertyId}`);

  const { data: existing } = await supabase
    .from("property_saves")
    .select("property_id")
    .eq("property_id", propertyId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("property_saves")
        .delete()
        .eq("property_id", propertyId)
        .eq("user_id", user.id)
    : await supabase
        .from("property_saves")
        .insert({ property_id: propertyId, user_id: user.id });

  if (error) {
    return {
      error: reportFailure(
        "SAVE PROPERTY ERROR",
        error,
        "Could not update your saved list.",
      ),
    };
  }

  revalidatePath(`/property/${propertyId}`);
  return {};
}

/** Sends an enquiry, optionally requesting a viewing date. */
export async function enquireAboutProperty(
  propertyId: string,
  message: string,
  viewingOn?: string,
  phone?: string,
): Promise<PropertyResult> {
  const { supabase, user } = await requireUser(`/property/${propertyId}`);

  const body = message.trim();
  if (body.length < 5) return { error: "Write a short message first." };

  const { data: property } = await supabase
    .from("properties")
    .select("owner_id, status")
    .eq("id", propertyId)
    .maybeSingle();

  if (!property) return { error: "That listing no longer exists." };
  if (property.owner_id === user.id) {
    return { error: "This is your own listing." };
  }

  const { error } = await supabase.from("property_inquiries").upsert(
    {
      property_id: propertyId,
      sender_id: user.id,
      message: body.slice(0, 2000),
      viewing_requested_on: viewingOn || null,
      phone: phone?.slice(0, 40) || null,
    },
    { onConflict: "property_id,sender_id" },
  );

  if (error) {
    return {
      error: reportFailure(
        "PROPERTY ENQUIRY ERROR",
        error,
        "Could not send that enquiry.",
      ),
    };
  }

  revalidatePath(`/property/${propertyId}`);
  return {};
}
