import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Draft rules for accessing and using Medosha's construction, design, property and marketplace services.",
  robots: { index: true, follow: true },
};

const sections = [
  {
    "title": "1. Acceptance and eligibility",
    "body": [
      "By accessing Medosha, creating an account or using a feature, you agree to these Terms and the policies linked here. If you do not agree, do not use the affected service. You must have legal capacity to enter into the agreement; where a parent or guardian's permission is required, obtain it first."
    ]
  },
  {
    "title": "2. Accounts and security",
    "body": [
      "Provide accurate account information, keep login credentials secure, and promptly report suspected unauthorized access. You are responsible for activity performed through your account except where applicable law says otherwise. Medosha may request reasonable verification to protect users and prevent fraud."
    ]
  },
  {
    "title": "3. Permitted use",
    "body": [
      "Use Medosha lawfully and respectfully. Do not upload malware, infringe rights, misrepresent listings, manipulate reviews, scrape or disrupt the service, bypass access controls, or use the platform for fraud or unlawful discrimination. Do not submit content you have no right to share."
    ]
  },
  {
    "title": "4. Platform role",
    "body": [
      "Medosha provides digital tools and may host listings, user content, AI-assisted design features and digital products. Unless a listing explicitly says otherwise, Medosha does not itself guarantee the quality, safety, legality, availability or suitability of third-party goods, properties, services or professional work. Verify sellers, providers, specifications and terms before transacting."
    ]
  },
  {
    "title": "5. Fees, suspension and termination",
    "body": [
      "Paid features, credits and marketplace transactions are governed by the displayed price and Credits Policy at the time of purchase. We may restrict or suspend access for security, abuse, non-payment or material policy violations, subject to applicable law and any required notice or appeal process. You may stop using Medosha and request account closure through the available support channel."
    ]
  },
  {
    "title": "6. Disclaimers and liability",
    "body": [
      "Digital services may be interrupted, and AI-generated outputs or cost estimates can be inaccurate. To the extent permitted by applicable law, Medosha is not responsible for indirect loss arising from use of the service. Nothing in these Terms excludes liability or consumer rights that cannot legally be excluded."
    ]
  },
  {
    "title": "7. Governing law and disputes",
    "body": [
      "Applicable law and dispute procedures must be confirmed by legal counsel for Medosha's operating entity and target markets. Users should first contact Medosha to attempt an informal resolution; this does not remove statutory rights or access to competent authorities or courts."
    ]
  },
  {
    "title": "8. Changes and contact",
    "body": [
      "We may update these Terms as the service evolves. The effective date and material changes should be displayed here. Contact Medosha through the Contact page for questions or complaints."
    ]
  }
] as const;

export default function LegalPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 @lg/ws:px-8">
      <nav className="text-sm text-muted-foreground"><Link className="underline" href="/">Medosha</Link> / <Link className="underline" href="/legal">Legal &amp; Policies</Link></nav>
      <header className="space-y-2 border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Medosha · Policy draft</p>
        <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-muted-foreground">Last updated: 11 October 2026 · Draft for review before launch</p>
        <p className="text-sm">Draft rules for accessing and using Medosha's construction, design, property and marketplace services.</p>
      </header>
      <aside className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <strong>Important:</strong> This is a practical draft, not legal advice or a statement that Medosha has completed every compliance requirement. Have an Ethiopian-qualified lawyer review it against Medosha's actual company details, payment flows, data practices and applicable law before relying on it.
      </aside>
      <div className="space-y-6">
        {sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.body.map((paragraph) => <p key={paragraph} className="text-sm leading-7 text-muted-foreground">{paragraph}</p>)}
            {("bullets" in section) && section.bullets?.length ? <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}
          </section>
        ))}
      </div>
      <section className="rounded-lg border p-4 text-sm">
        Questions about this policy? Contact Medosha through the <Link className="underline" href="/contact">Contact page</Link>. Replace this route with a monitored legal/privacy email before launch.
      </section>
      <nav className="flex flex-wrap gap-3 border-t pt-5 text-sm">
        {["/legal","/terms","/privacy","/credits-policy","/marketplace-policy","/ai-disclaimer","/user-content"].map((href) => <Link className="underline" key={href} href={href}>{href === "/legal" ? "Legal hub" : href.slice(1).replaceAll("-"," ")}</Link>)}
      </nav>
    </main>
  );
}
