import type { Metadata } from "next";

import { BUSINESS, legalOrTradingName } from "@/lib/legal/business";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Medosha.",
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 scroll-mt-20" id={slug(title)}>
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="space-y-2 leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function TermsPage() {
  return (
    <article className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Terms of Service
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated {new Date().getFullYear()} · {legalOrTradingName()}
        </p>
      </div>

      <p className="leading-relaxed">
        By using Medosha you agree to these terms. They are written to be
        readable rather than exhaustive, and they will be expanded as the
        platform matures.
      </p>

      <Section title="Eligibility and your account">
        <p>
          You must be able to form a binding agreement to create an account.
          You are responsible for the accuracy of your profile and listings,
          for anything published under your account, and for keeping your
          login secure.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Don&apos;t post misleading, unlawful, or infringing content, and
          don&apos;t misrepresent your identity, qualifications, products, or
          services. Don&apos;t use the platform to harass, scrape, or attack
          other members or the service itself. We may remove content or
          suspend accounts that break these rules.
        </p>
      </Section>

      <Section title="Content you publish">
        <p>
          You keep ownership of the photos, drawings, floor plans, 360°
          images, 3D models, and other files you upload. By publishing
          something publicly on Medosha, you give Medosha the licence needed
          to store it and display it back to you and to other members as part
          of the feature you used it for — nothing more.
        </p>
        <p>
          Before publishing content publicly, you confirm that you own it or
          have permission to upload and share it. This applies to public
          listings, portfolios, and marketplace content; it is not required
          for files kept private to your own project.
        </p>
      </Section>

      <Section title="Property listings">
        <p>
          Anyone publishing a property or rental listing is responsible for
          its accuracy — price, availability, condition, and description.
          Medosha does not verify that a listing is genuine or currently
          available unless a listing is explicitly marked as verified, and a
          listing not marked that way should not be assumed to be.
        </p>
      </Section>

      <Section title="Professional profiles">
        <p>
          A professional, company, or agent profile is a self-reported
          description of who you are and what you do. Medosha does not verify
          licences, certifications, or qualifications unless a profile is
          explicitly marked as verified — claims of a professional&apos;s own
          skill or credentials are theirs, not Medosha&apos;s.
        </p>
      </Section>

      <Section title="Marketplace and digital products">
        <p>
          Medosha connects buyers and sellers of materials, products, and
          digital goods. Transactions, quotes, and fulfilment are arranged
          directly between the parties; sellers are responsible for the
          accuracy of their listings, pricing, and for fulfilling what they
          sell. Digital products are subject to whatever licence the seller
          states on the listing.
        </p>
      </Section>

      <Section title="AI-generated content">
        <p>
          Medosha AI produces renderings, written answers, and other content
          from what you submit to it. AI-generated content may contain errors
          and should not be relied on as professional advice — verify
          important dimensions, materials, and technical details before
          acting on them.
        </p>
      </Section>

      <Section title="BOQ and cost estimates">
        <p>
          Bills of quantities and cost estimates produced by Medosha are for
          planning purposes. Quantities and costs may vary from actual
          construction requirements and current market prices. Verify with a
          qualified professional before construction or purchasing — Medosha
          does not promise a final or exact price.
        </p>
      </Section>

      <Section title="Intellectual property">
        <p>
          Medosha&apos;s own branding, design, and software remain
          Medosha&apos;s. You retain rights to the content you create and
          upload, subject to the licence described above. Don&apos;t upload
          content that infringes someone else&apos;s rights.
        </p>
      </Section>

      <Section title="Prohibited content and activity">
        <p>
          No unlawful, fraudulent, or infringing content; no impersonation of
          another person or business; no fake listings, reviews, or profiles
          presented as genuine; no attempts to circumvent moderation,
          security, or verification features.
        </p>
      </Section>

      <Section title="Suspension and removal">
        <p>
          We may remove content, suspend, or terminate an account that
          violates these terms, at our discretion and, where practical, with
          notice. You can also delete your own account at any time from
          Settings.
        </p>
      </Section>

      <Section title="Service availability">
        <p>
          Medosha is provided as-is and is under active development.
          Features, pricing, and availability may change, and the service may
          be interrupted for maintenance or by factors outside our control.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the extent permitted by law, Medosha is not liable for indirect
          or consequential losses arising from your use of the platform,
          including reliance on AI-generated content, cost estimates, or
          listings published by other members. Nothing here limits liability
          that cannot lawfully be limited.
        </p>
      </Section>

      <Section title="Changes to these terms">
        <p>
          These terms may be updated as the platform changes. The date at the
          top of this page is when it was last updated; continued use after a
          change means you accept the updated terms.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms can be sent to{" "}
          <a href={`mailto:${BUSINESS.contactEmail}`} className="underline">
            {BUSINESS.contactEmail}
          </a>
          .
        </p>
      </Section>
    </article>
  );
}
