import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Marketplace Policy",
  description: "Rules for property, construction services, materials and digital products listed on Medosha.",
  robots: { index: true, follow: true },
};

const sections = [
  {
    "title": "1. Seller responsibilities",
    "body": [
      "Sellers must provide accurate descriptions, ownership or authorization information, prices, availability, condition, delivery terms and relevant limitations. Sellers must not post counterfeit, stolen, prohibited or misleading goods, fake reviews, fabricated credentials or property listings they are not authorized to offer."
    ]
  },
  {
    "title": "2. Buyer responsibilities",
    "body": [
      "Buyers should review listing details, verify seller identity and credentials where appropriate, inspect products or property, confirm measurements and delivery terms, and retain transaction records. Do not send sensitive payment credentials to sellers."
    ]
  },
  {
    "title": "3. Construction and professional services",
    "body": [
      "Confirm licensing, qualifications, insurance and scope directly with the provider where relevant. Agree on written specifications, milestones, material standards, acceptance criteria and payment terms before work begins. Medosha listings are not a substitute for independent due diligence or a signed construction contract."
    ]
  },
  {
    "title": "4. Digital products",
    "body": [
      "Digital-product listings should identify file format, dimensions, included deliverables, intended use, license scope, compatibility and known limitations. Buyers receive only the license stated in the listing; purchasing a file does not automatically transfer copyright or ownership. Sellers must have rights to distribute every included asset."
    ]
  },
  {
    "title": "5. Payments, disputes and moderation",
    "body": [
      "State clearly whether Medosha collects payments, facilitates transactions, or only introduces buyers and sellers. Do not imply escrow, buyer protection or guaranteed refunds unless those mechanisms are implemented and funded. Users can report fraud, unsafe listings or intellectual-property concerns through the support channel. Medosha may investigate, remove content or restrict accounts subject to applicable law."
    ]
  }
] as const;

export default function LegalPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 @lg/ws:px-8">
      <nav className="text-sm text-muted-foreground"><Link className="underline" href="/">Medosha</Link> / <Link className="underline" href="/legal">Legal &amp; Policies</Link></nav>
      <header className="space-y-2 border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Medosha · Policy draft</p>
        <h1 className="text-3xl font-bold tracking-tight">Marketplace Policy</h1>
        <p className="text-sm text-muted-foreground">Last updated: 11 October 2026 · Draft for review before launch</p>
        <p className="text-sm">Rules for property, construction services, materials and digital products listed on Medosha.</p>
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
