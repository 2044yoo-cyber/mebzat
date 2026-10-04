import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { HouseDesignerWorkspace } from "@/features/house-designer/components/house-designer-workspace";
import { getNavProfile } from "@/lib/nav-profile";

export const metadata: Metadata = {
  title: "House Plan",
  description: "Record a floor plan with exact measurements, sketch on drawings and photos, and discuss it on the project's Agenda.",
};

// A uuid, or nothing: whatever else arrives in the address is ignored rather
// than handed to a query.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: string | string[] | undefined) => (typeof value === "string" && UUID.test(value) ? value : null);

export default async function HouseDesignPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const profile = await getNavProfile();
  if (!profile) {
    const query = new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString();
    redirect(`/login?redirect=${encodeURIComponent(`/house-design${query ? `?${query}` : ""}`)}`);
  }

  return <HouseDesignerWorkspace userId={profile.id} planId={id(params.plan)} projectId={id(params.project)} pinId={id(params.pin)} />;
}
