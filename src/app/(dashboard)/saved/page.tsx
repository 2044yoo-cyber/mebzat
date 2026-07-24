import type { Metadata } from "next";
import { Bookmark } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Saved Projects" };

export default function SavedPage() {
  return (
    <ComingSoon
      icon={Bookmark}
      title="Saved projects are on the way"
      description="Soon you'll be able to bookmark projects, professionals, and products, and find them all here."
    />
  );
}
