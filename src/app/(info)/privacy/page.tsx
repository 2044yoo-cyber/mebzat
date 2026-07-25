import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Medosha collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">
        Last updated {new Date().getFullYear()}
      </p>
      <p className="leading-relaxed">
        This summary explains how Medosha handles your information. It is
        provided for transparency and will be expanded into a full policy as the
        platform grows.
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Information we collect</h2>
        <p className="leading-relaxed text-muted-foreground">
          Account details you provide (name, email, phone, and profile
          information), the content you publish (projects, products, images),
          and basic usage data needed to operate the service.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">How we use it</h2>
        <p className="leading-relaxed text-muted-foreground">
          To provide your account, display your public profile and listings,
          enable discovery and messaging, and keep the platform secure. We do
          not sell your personal information.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Your choices</h2>
        <p className="leading-relaxed text-muted-foreground">
          You can edit or delete your profile, projects, and products at any
          time. Public content you publish is visible to others until you remove
          it. To request account deletion, contact{" "}
          <a href="mailto:privacy@medosha.net" className="underline">
            privacy@medosha.net
          </a>
          .
        </p>
      </section>
    </article>
  );
}
