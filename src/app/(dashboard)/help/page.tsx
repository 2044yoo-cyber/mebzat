import type { Metadata } from "next";
import { CircleHelp } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Help" };

export default function HelpPage() {
  return (
    <ComingSoon
      icon={CircleHelp}
      title="Help center is on the way"
      description="Guides, FAQs, and support for getting the most out of Medosha will live here soon."
    />
  );
}
