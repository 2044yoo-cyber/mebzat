import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CityExplorer } from "@/components/property/city-explorer";
import {
  getCities,
  getCity,
  getPropertiesInViewport,
} from "@/lib/data/properties";

/**
 * The same explorer, on another city.
 *
 * A route rather than a query parameter because a city is a place, and a link
 * to Bahir Dar's map should look like one.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const city = await getCity(slug);
  if (!city) return { title: "City not found" };

  return {
    title: `Explore properties in ${city.name}`,
    description: `Browse homes, apartments, commercial buildings and land across ${city.name} on an interactive 3D map.`,
  };
}

export default async function CitySlugPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;

  const [cities, city] = await Promise.all([getCities(), getCity(slug)]);
  if (!city) notFound();

  const { properties } = await getPropertiesInViewport({
    south: city.min_latitude ?? city.latitude - 0.2,
    north: city.max_latitude ?? city.latitude + 0.2,
    west: city.min_longitude ?? city.longitude - 0.2,
    east: city.max_longitude ?? city.longitude + 0.2,
  });

  return (
    <CityExplorer city={city} cities={cities} initialProperties={properties} />
  );
}
