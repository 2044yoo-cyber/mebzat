import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Messages" };

export default function MessagesPage() {
  return (
    <ComingSoon
      icon={MessageSquare}
      title="Messaging is on the way"
      description="Soon you'll be able to chat in real time with professionals, companies, and suppliers across Medosha."
    />
  );
}
