import type { Metadata } from "next";
import { MessageSquare } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";
import { requireViewer } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  // The account area, not a public page. Nothing here leaks — it is a
  // placeholder — but a visitor landing on "Messages" with no account is
  // shown a feature they cannot have. Ask them to join instead.
  await requireViewer("/messages");

  return (
    <ComingSoon
      icon={MessageSquare}
      title="Messaging is on the way"
      description="Soon you'll be able to chat in real time with professionals, companies, and suppliers across Medosha."
    />
  );
}
