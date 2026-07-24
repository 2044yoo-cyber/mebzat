import type { Metadata } from "next";
import { Package } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Add Product" };

export default function NewProductPage() {
  return (
    <ComingSoon
      icon={Package}
      title="The marketplace is on the way"
      description="Soon you'll be able to list materials, equipment, and products for other construction professionals to discover and buy."
    />
  );
}
