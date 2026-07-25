import type { Metadata } from "next";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Careers",
  description: "Help build the leading construction platform for Africa and beyond.",
};

export default function CareersPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Careers</h1>
      <p className="text-lg text-muted-foreground">
        We&apos;re building the platform the construction industry has been
        missing — and we&apos;re early.
      </p>
      <p className="leading-relaxed">
        Medosha is a small, product-focused team. We care about craft,
        performance, and shipping things people actually use. If you&apos;re an
        engineer, designer, or someone who knows the construction industry
        inside out, we&apos;d love to hear from you — even if there isn&apos;t a
        role posted yet.
      </p>
      <a
        href="mailto:careers@medosha.net"
        className={buttonVariants()}
      >
        Get in touch
      </a>
    </article>
  );
}
