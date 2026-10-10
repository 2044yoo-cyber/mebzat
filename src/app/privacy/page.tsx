import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Explains what personal data Medosha may process, why it is used, and the controls users should have.",
  robots: { index: true, follow: true },
};

const sections = [
  {
    "title": "1. Data we may process",
    "body": [
      "Depending on the features you use, Medosha may process account identifiers and contact details; profile and business information; messages and support requests; uploaded plans, images, renders and project files; listings, transactions and credit balances; device, log and security information; and preferences such as language. Only collect fields needed for a stated purpose."
    ]
  },
  {
    "title": "2. Purposes and legal basis",
    "body": [
      "Data may be used to operate accounts, save designs and projects, display listings, deliver purchases, process payments through chosen providers, provide support, secure the platform, prevent fraud and meet legal obligations. Where consent is required, obtain it clearly and allow withdrawal as required by law."
    ]
  },
  {
    "title": "3. AI features and uploaded files",
    "body": [
      "When you submit a prompt, drawing, image or project to an AI-enabled feature, the relevant content may be processed to produce the requested result. Before launch, disclose the actual AI providers, what data they receive, retention settings and whether content may be used to improve their services. Do not claim that uploads are never used for training unless provider contracts and configuration confirm it."
    ]
  },
  {
    "title": "4. Sharing and international transfers",
    "body": [
      "Data may be shared with service providers needed to host the site, store files, authenticate users, deliver AI features, process payments, send notifications and prevent abuse. Disclose actual providers and transfer safeguards before launch. Do not sell personal data as a business practice; any legally permitted sharing must be described accurately."
    ]
  },
  {
    "title": "5. Retention and security",
    "body": [
      "Keep personal data only as long as needed for the disclosed purposes, legal obligations, dispute handling and security. Apply access controls, secure credentials, backups, least-privilege permissions and incident response procedures. No online system can promise absolute security."
    ]
  },
  {
    "title": "6. Your choices and rights",
    "body": [
      "Subject to applicable law, users may request access to, correction of, or deletion of personal data; ask questions about processing; and withdraw consent where processing relies on consent. Provide a verified request channel and explain lawful exceptions, response periods and any identity checks."
    ]
  },
  {
    "title": "7. Children and changes",
    "body": [
      "Medosha is not intended to collect children's personal information without the required lawful basis and safeguards. This notice should be updated whenever actual data collection, providers or features change. The final policy must be reviewed against Ethiopia's Personal Data Protection Proclamation No. 1321/2024 and any other applicable laws."
    ]
  }
] as const;

export default function LegalPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 @lg/ws:px-8">
      <nav className="text-sm text-muted-foreground"><Link className="underline" href="/">Medosha</Link> / <Link className="underline" href="/legal">Legal &amp; Policies</Link></nav>
      <header className="space-y-2 border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Medosha · Policy draft</p>
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: 11 October 2026 · Draft for review before launch</p>
        <p className="text-sm">Explains what personal data Medosha may process, why it is used, and the controls users should have.</p>
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
