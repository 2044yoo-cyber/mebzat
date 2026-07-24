import type { Metadata } from "next";
import { Map } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Map" };

export default function MapPage() {
  return (
    <ComingSoon
      icon={Map}
      title="The Medosha map is on the way"
      description="Soon you'll be able to discover architects, suppliers, and contractors near you, with filters for distance, rating, and availability."
    />
  );
}
