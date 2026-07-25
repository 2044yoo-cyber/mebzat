import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Medosha.",
};

export default function TermsPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">
        Terms of Service
      </h1>
      <p className="text-sm text-muted-foreground">
        Last updated {new Date().getFullYear()}
      </p>
      <p className="leading-relaxed">
        By using Medosha you agree to these terms. This summary will be
        expanded into a full agreement as the platform matures.
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Your account</h2>
        <p className="leading-relaxed text-muted-foreground">
          You are responsible for the accuracy of your profile and listings and
          for keeping your account secure. You must have the rights to any
          content you publish.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Acceptable use</h2>
        <p className="leading-relaxed text-muted-foreground">
          Don&apos;t post misleading, unlawful, or infringing content, and
          don&apos;t misrepresent your identity, products, or services. We may
          remove content or accounts that violate these terms.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Marketplace</h2>
        <p className="leading-relaxed text-muted-foreground">
          Medosha connects buyers and suppliers. Transactions, quotes, and
          fulfillment are arranged directly between the parties; suppliers are
          responsible for the accuracy of their listings and pricing.
        </p>
      </section>
    </article>
  );
}
