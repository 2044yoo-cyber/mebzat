import type { Metadata } from "next";
import { Mail, MessagesSquare } from "lucide-react";

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
          href="mailto:hello@medosha.net"
          className="flex items-start gap-3 rounded-2xl border p-5 transition-colors hover:bg-muted/50"
        >
          <Mail className="mt-0.5 size-5 text-brand" />
          <div>
            <p className="font-medium">Email</p>
            <p className="text-sm text-muted-foreground">hello@medosha.net</p>
          </div>
        </a>
        <a
          href="mailto:support@medosha.net"
          className="flex items-start gap-3 rounded-2xl border p-5 transition-colors hover:bg-muted/50"
        >
          <MessagesSquare className="mt-0.5 size-5 text-brand" />
          <div>
            <p className="font-medium">Support</p>
            <p className="text-sm text-muted-foreground">support@medosha.net</p>
          </div>
        </a>
      </div>
    </article>
  );
}
