import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AI & Construction Disclaimer",
  description: "Important limits for AI-generated designs, BOQs, measurements, renders and construction estimates.",
  robots: { index: true, follow: true },
};

type PolicySection = { title: string; body: string[]; bullets?: string[] };

const sections: PolicySection[] = [
  {
    "title": "1. AI outputs are suggestions",
    "body": [
      "AI-generated designs, images, floor plans, text, specifications and recommendations may contain errors, omissions or unrealistic details. Similar prompts may produce different results. You are responsible for reviewing outputs before relying on them."
    ]
  },
  {
    "title": "2. BOQs and cost estimates",
    "body": [
      "Bills of quantities, cutting lists, material take-offs, prices and budgets are estimates based on the inputs, catalogue data, assumptions and supplier rates available at the time. Verify measurements, quantities, local prices, taxes, waste, labour, transport and site conditions with qualified professionals and current suppliers before ordering or building."
    ]
  },
  {
    "title": "3. Safety and professional review",
    "body": [
      "Do not use an AI output alone to approve structural design, electrical systems, fire safety, plumbing, foundations or other safety-critical work. Obtain review and sign-off from appropriately qualified professionals and the relevant authorities. A visual render is not proof that a design is buildable or code-compliant."
    ]
  },
  {
    "title": "4. User inputs and rights",
    "body": [
      "Only upload plans, photographs, recordings and other materials you are authorized to use. Remove personal or confidential information that is not needed. Processing of uploads by AI providers is described in the Privacy Policy."
    ]
  },
  {
    "title": "5. No guarantee",
    "body": [
      "To the extent permitted by law, AI features are provided as decision-support tools and are not a substitute for professional advice, site measurement, supplier confirmation or regulatory approval. Mandatory legal rights remain unaffected."
    ]
  }
] as const;

export default function LegalPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 @lg/ws:px-8">
      <nav className="text-sm text-muted-foreground"><Link className="underline" href="/">Medosha</Link> / <Link className="underline" href="/legal">Legal &amp; Policies</Link></nav>
      <header className="space-y-2 border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Medosha · Policy draft</p>
        <h1 className="text-3xl font-bold tracking-tight">AI & Construction Disclaimer</h1>
        <p className="text-sm text-muted-foreground">Last updated: 11 October 2026 · Draft for review before launch</p>
        <p className="text-sm">Important limits for AI-generated designs, BOQs, measurements, renders and construction estimates.</p>
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
