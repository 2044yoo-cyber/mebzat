import type { Metadata } from "next";
import { CityExplorer } from "@/components/property/city-explorer";
import {
  FALLBACK_CITY,
  getCities,
  getCity,
  getPropertiesInViewport,
} from "@/lib/data/properties";
import { isListingKind, isPropertyType } from "@/lib/constants/properties";
import type { ListingKind, PropertyType } from "@/types/database.types";

export const metadata: Metadata = {
  title: "Explore properties in 3D — Addis Ababa",
  description:
    "Browse homes, apartments, commercial buildings, offices and land across Addis Ababa on an interactive 3D city map.",
};

export const dynamic = "force-dynamic";

/** The default city. Others are reached at /city/[slug]. */
const DEFAULT_CITY = "addis-ababa";

export default async function CityPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await props.searchParams;
  const get = (key: string) => (Array.isArray(sp[key]) ? sp[key][0] : sp[key]);

  const [cities, resolved] = await Promise.all([
    getCities(),
    getCity(DEFAULT_CITY),
  ]);

  // The map always renders. Without the cities row it opens on the built-in
  // Addis Ababa viewport with no pins, rather than 404-ing the homepage's
  // primary call to action.
  const city = resolved ?? FALLBACK_CITY;

  const types = (get("type")?.split(",") ?? []).filter(
    isPropertyType,
  ) as PropertyType[];
  const kindParam = get("kind");
  const kinds: ListingKind[] = isListingKind(kindParam) ? [kindParam] : [];

  const { properties } = await getPropertiesInViewport(
    {
      south: city.min_latitude ?? city.latitude - 0.2,
      north: city.max_latitude ?? city.latitude + 0.2,
      west: city.min_longitude ?? city.longitude - 0.2,
      east: city.max_longitude ?? city.longitude + 0.2,
    },
    {
      types: types.length ? types : undefined,
      kinds: kinds.length ? kinds : undefined,
      minPrice: Number(get("minPrice")) || undefined,
      maxPrice: Number(get("maxPrice")) || undefined,
      minBedrooms: Number(get("beds")) || undefined,
      minArea: Number(get("minArea")) || undefined,
      floors: Number(get("floors")) || undefined,
    },
  );

  return (
    <CityExplorer
      city={city}
      cities={cities}
      initialProperties={properties}
    />
  );
}
