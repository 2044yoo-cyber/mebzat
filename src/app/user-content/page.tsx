import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "User Content & Intellectual Property",
  description: "Clarifies ownership and permitted use of uploaded plans, designs, renders and digital products.",
  robots: { index: true, follow: true },
};

const sections = [
  {
    "title": "1. Your content",
    "body": [
      "As between you and Medosha, you retain rights you already own in content you upload, subject to third-party rights and any license you grant below. You are responsible for ensuring you have permission to upload plans, photographs, models, logos and other materials."
    ]
  },
  {
    "title": "2. Limited service license",
    "body": [
      "You grant Medosha a non-exclusive, worldwide license to host, store, reproduce, adapt as technically necessary, display and process your content only to operate, secure and provide the features you request, including generating outputs and showing listings you choose to publish. This license lasts only as needed for those purposes, subject to backups, legal obligations and the account deletion process."
    ]
  },
  {
    "title": "3. Public listings and sharing",
    "body": [
      "Content you choose to publish in a public listing or post may be viewed, shared or copied by other users. Do not publish confidential client drawings, private addresses or other restricted information unless you are authorized and accept the disclosure. Private project files should not become public without a deliberate user action."
    ]
  },
  {
    "title": "4. AI-generated outputs",
    "body": [
      "Ownership and licensing of generated outputs may depend on the input rights, applicable law and the terms of the relevant AI provider. Medosha does not promise that every output is unique, protectable by copyright or free of third-party rights. Review the applicable feature terms before commercial use."
    ]
  },
  {
    "title": "5. Digital product licenses",
    "body": [
      "Sellers must clearly state whether a digital product is for personal use, commercial use, modification, redistribution or resale. Unless a listing expressly grants broader rights, buyers may use the purchased file only as permitted by its stated license and may not resell or redistribute the source files."
    ]
  },
  {
    "title": "6. Rights complaints",
    "body": [
      "If you believe content infringes your rights, contact Medosha with the specific URL or listing, a description of the right involved and a way to reach you. Medosha should implement a documented review process, allow responses where appropriate and act in accordance with applicable law."
    ]
  }
] as const;

export default function LegalPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 @lg/ws:px-8">
      <nav className="text-sm text-muted-foreground"><Link className="underline" href="/">Medosha</Link> / <Link className="underline" href="/legal">Legal &amp; Policies</Link></nav>
      <header className="space-y-2 border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Medosha · Policy draft</p>
        <h1 className="text-3xl font-bold tracking-tight">User Content & Intellectual Property</h1>
        <p className="text-sm text-muted-foreground">Last updated: 11 October 2026 · Draft for review before launch</p>
        <p className="text-sm">Clarifies ownership and permitted use of uploaded plans, designs, renders and digital products.</p>
      </header>
      <aside className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
        <strong>Important:</strong> This is a practical draft, not legal advice or a statement that Medosha has completed every compliance requirement. Have an Ethiopian-qualified lawyer review it against Medosha's actual company details, payment flows, data practices and applicable law before relying on it.
      </aside>
      <div className="space-y-6">
        {sections.map((section) => (
          <section key={section.title} className="space-y-2">
            <h2 className="text-lg font-semibold">{section.title}</h2>
            {section.body.map((paragraph) => <p key={paragraph} className="text-sm leading-7 text-muted-foreground">{paragraph}</p>)}
            {section.bullets?.length ? <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-muted-foreground">{section.bullets.map((item) => <li key={item}>{item}</li>)}</ul> : null}
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
