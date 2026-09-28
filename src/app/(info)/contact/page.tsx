import type { Metadata } from "next";
import { Globe, Mail, MessagesSquare } from "lucide-react";

import { BUSINESS, legalOrTradingName } from "@/lib/legal/business";

export const metadata: Metadata = {
  title: "Contact",
  description: "Get in touch with the Medosha team.",
};

export default function ContactPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Contact us</h1>
      <p className="text-lg text-muted-foreground">
        Questions, feedback, or partnership ideas? We&apos;d love to hear from
        you.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <a
          href={`mailto:${BUSINESS.contactEmail}`}
          className="flex items-start gap-3 rounded-2xl border p-5 transition-colors hover:bg-muted/50"
        >
          <Mail className="mt-0.5 size-5 text-brand" />
          <div>
            <p className="font-medium">Email</p>
            <p className="text-sm text-muted-foreground">{BUSINESS.contactEmail}</p>
          </div>
        </a>
        <a
          href={`mailto:${BUSINESS.supportEmail}`}
          className="flex items-start gap-3 rounded-2xl border p-5 transition-colors hover:bg-muted/50"
        >
          <MessagesSquare className="mt-0.5 size-5 text-brand" />
          <div>
            <p className="font-medium">Support</p>
            <p className="text-sm text-muted-foreground">{BUSINESS.supportEmail}</p>
          </div>
        </a>
      </div>

      {/* The one piece of business information a beta legitimately has:
          who to write to, and how. `legalOrTradingName` says so honestly —
          it names the entity once one is registered, and says plainly that
          it isn't yet if it is not. */}
      <div className="flex items-start gap-3 rounded-2xl border border-dashed p-5 text-sm">
        <Globe className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">{legalOrTradingName()}</p>
          <p className="text-muted-foreground">
            {BUSINESS.country ?? "Registered country to be confirmed"} ·{" "}
            {BUSINESS.contactMethod} contact only, for now.
          </p>
        </div>
      </div>
    </article>
  );
}
