import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Legal & Policies",
  description: "Medosha's legal policies for platform use, privacy, AI tools, credits and marketplace activity.",
  robots: { index: true, follow: true },
};

const sections = [
  {
    "title": "Read the policies",
    "body": [
      "These draft policies describe the intended rules for using Medosha, a construction, property, design and digital-product platform. They must be checked against the live product before publication."
    ],
    "bullets": [
      "Terms of Service — /terms",
      "Privacy Policy — /privacy",
      "Credits, subscriptions and refunds — /credits-policy",
      "Marketplace rules — /marketplace-policy",
      "AI and construction estimate disclaimer — /ai-disclaimer",
      "User content, designs and intellectual property — /user-content"
    ]
  },
  {
    "title": "Before launch",
    "body": [
      "Medosha should identify its legal operating entity, verified business address, contact channel, data controller details, supported payment providers, refund workflow and complaint process. Do not publish invented company or contact details.",
      "Ethiopia's Personal Data Protection Proclamation No. 1321/2024 is an important compliance reference; the final privacy notice and data practices should be reviewed against the official text."
    ]
  },
  {
    "title": "Policy updates",
    "body": [
      "When a material policy changes, Medosha should publish the new version and effective date, and request renewed acceptance where legally required or where the change materially affects users."
    ]
  }
] as const;

export default function LegalPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 @lg/ws:px-8">
      <nav className="text-sm text-muted-foreground"><Link className="underline" href="/">Medosha</Link> / <Link className="underline" href="/legal">Legal &amp; Policies</Link></nav>
      <header className="space-y-2 border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Medosha · Policy draft</p>
        <h1 className="text-3xl font-bold tracking-tight">Legal & Policies</h1>
        <p className="text-sm text-muted-foreground">Last updated: 11 October 2026 · Draft for review before launch</p>
        <p className="text-sm">Medosha's legal policies for platform use, privacy, AI tools, credits and marketplace activity.</p>
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
