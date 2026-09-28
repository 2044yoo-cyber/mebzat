import type { Metadata } from "next";

import { BUSINESS, legalOrTradingName } from "@/lib/legal/business";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Medosha collects, uses, and protects your information.",
};

/**
 * One section, so every entry below reads the same and none of them is a
 * bare wall of text with nothing to anchor a link to.
 */
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

export default function PrivacyPage() {
  return (
    <article className="space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Privacy Policy
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated {new Date().getFullYear()} · {legalOrTradingName()}
        </p>
      </div>

      <p className="leading-relaxed">
        This policy explains what Medosha collects, why, and what control you
        have over it. Medosha is under active development — features change,
        and this policy is updated as they do — but the plain intent behind it
        does not: we collect what the service needs to run, and nothing is
        sold.
      </p>

      <Section title="Account and profile information">
        <p>
          When you create an account we collect your name, email address, and
          phone number if you provide one. Your profile — a professional,
          company, agent, or seller profile — holds whatever you choose to add
          to it: profession, company details, service areas, languages, a
          bio, and similar. Fields you leave blank are not filled in with
          anything on your behalf.
        </p>
      </Section>

      <Section title="Content you upload">
        <p>
          Photographs, drawings, floor plans, 360° images, 3D models, digital
          products, and documents (a CV or portfolio, for instance) that you
          upload are stored so Medosha can display them back to you and, where
          you choose to publish them, to other members. You decide what stays
          private to a project and what is made public.
        </p>
      </Section>

      <Section title="Property and marketplace information">
        <p>
          Listings you publish — a property, a rental, a product, a service —
          carry the details you enter for them: price, location, condition,
          description, and images. Location on a public listing is shown at
          the area or neighbourhood level rather than as an exact address,
          unless you choose to add more.
        </p>
      </Section>

      <Section title="AI prompts and generated content">
        <p>
          Medosha AI reads the prompts and images you send it to produce a
          response — a rendering, a written answer, a cost estimate. Those
          prompts and the images or documents used to inform an answer are
          processed to generate the result and kept with your project history
          so you can return to it. They are not used to train a model outside
          of operating this feature.
        </p>
      </Section>

      <Section title="Usage and analytics information">
        <p>
          Basic technical data — pages visited, actions taken, device and
          browser type, and similar — is collected to keep the service
          working, find and fix problems, and understand which features are
          used. This is operational data, not a profile built for advertising.
        </p>
      </Section>

      <Section title="How your data is used">
        <p>
          To provide your account and the features you use it for: showing
          your public profile and listings, enabling search, messaging, and
          discovery, processing AI and estimation requests, and keeping the
          platform secure and working as intended.
        </p>
      </Section>

      <Section title="Third-party services">
        <p>
          Medosha runs on infrastructure providers for hosting, storage, and
          database services, and calls external AI providers to generate
          text, images, and estimates from what you submit to those features.
          These providers process data on Medosha&apos;s behalf to deliver the
          service — Medosha does not sell or share your data with third
          parties for their own marketing purposes.
        </p>
      </Section>

      <Section title="Data retention">
        <p>
          Account and content data is kept for as long as your account is
          active, so the service can keep working the way you left it. Once an
          account is deleted, its data is removed from the database; some
          uploaded files may take longer to be purged from storage, which is
          noted in the account deletion flow itself.
        </p>
      </Section>

      <Section title="Account and data deletion">
        <p>
          You can edit or delete individual projects, listings, and files at
          any time from your account. To delete your account entirely, use
          Delete Account in Settings, or contact{" "}
          <a href={`mailto:${BUSINESS.privacyEmail}`} className="underline">
            {BUSINESS.privacyEmail}
          </a>
          . Account deletion is permanent and cannot be undone.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Reasonable technical and organisational measures are used to
          protect your data — access controls, encrypted connections, and
          row-level database policies that restrict who can read or write
          what. Medosha does not hold any specific security certification at
          this stage, and this policy will not claim one it does not have.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can access, correct, export, or delete the personal information
          held about you. Most of this is available directly in your account
          settings; for anything that is not, write to{" "}
          <a href={`mailto:${BUSINESS.privacyEmail}`} className="underline">
            {BUSINESS.privacyEmail}
          </a>
          .
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this policy or your data can be sent to{" "}
          <a href={`mailto:${BUSINESS.privacyEmail}`} className="underline">
            {BUSINESS.privacyEmail}
          </a>
          . For general enquiries, see the{" "}
          <a href="/contact" className="underline">
            Contact
          </a>{" "}
          page.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          As Medosha adds features that touch data — new upload types, new AI
          capabilities — this policy is updated to describe them. The date at
          the top of this page is when it was last changed.
        </p>
      </Section>
    </article>
  );
}
