import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { HouseDesignerWorkspace } from "@/features/house-designer/components/house-designer-workspace";
import { getNavProfile } from "@/lib/nav-profile";

export const metadata: Metadata = {
  title: "House Design",
  description: "Draw or verify a residential floor plan and generate a structured 3D house model.",
};

export default async function HouseDesignPage() {
  const profile = await getNavProfile();
  if (!profile) redirect(`/login?redirect=${encodeURIComponent("/house-design")}`);

  return <HouseDesignerWorkspace userId={profile.id} />;
}
