import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Credits, Subscriptions & Refunds",
  description: "Draft rules for Medosha credits, subscriptions, failed AI tasks, billing and refunds.",
  robots: { index: true, follow: true },
};

const sections = [
  {
    "title": "1. Prices and confirmation",
    "body": [
      "Show the price, currency, quantity of credits, applicable taxes or fees, and any recurring subscription terms before checkout. A purchase should not be considered complete until the payment provider confirms it. Keep a receipt and transaction reference for each completed purchase."
    ]
  },
  {
    "title": "2. Credits",
    "body": [
      "Credits are an in-platform balance used for the specific features and rates shown at the time of use. Display the credit cost before the user confirms an action. Credits are not cash, are not interest-bearing and cannot be transferred or redeemed for cash except where required by law or expressly offered by Medosha. Never advertise a credit price until the actual rate is configured."
    ]
  },
  {
    "title": "3. Failed or incomplete operations",
    "body": [
      "If a paid operation fails before producing the promised result, Medosha should automatically return the charged credits or provide a clear support route to correct the balance. If a result is partially delivered, handle the complaint fairly and consistently with the displayed terms and applicable law. Do not charge twice for a single operation."
    ]
  },
  {
    "title": "4. Subscriptions and cancellation",
    "body": [
      "Before a recurring subscription starts, disclose its amount, billing interval, renewal date, included benefits, trial conditions if any, and cancellation steps. Users should be able to cancel future renewal without unreasonable friction. Cancellation normally stops future renewals; it does not automatically refund a completed billing period unless the displayed offer or applicable law says otherwise."
    ]
  },
  {
    "title": "5. Refund requests and disputes",
    "body": [
      "Provide a support process for duplicate payments, unauthorized charges, wrong amounts, missing credits and failed transactions. Assess requests under the law that applies and the specific product delivered. Nothing here removes mandatory consumer rights. For payment-provider disputes, ask the user for a transaction reference but never request their password, PIN or one-time code."
    ]
  },
  {
    "title": "6. Payment providers and price changes",
    "body": [
      "Payments may be handled by third-party providers such as a mobile-money or card provider only when actually integrated and disclosed at checkout. Provider terms may also apply. Give notice of material future price changes and obtain consent where required."
    ]
  }
] as const;

export default function LegalPage() {
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 @lg/ws:px-8">
      <nav className="text-sm text-muted-foreground"><Link className="underline" href="/">Medosha</Link> / <Link className="underline" href="/legal">Legal &amp; Policies</Link></nav>
      <header className="space-y-2 border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Medosha · Policy draft</p>
        <h1 className="text-3xl font-bold tracking-tight">Credits, Subscriptions & Refunds</h1>
        <p className="text-sm text-muted-foreground">Last updated: 11 October 2026 · Draft for review before launch</p>
        <p className="text-sm">Draft rules for Medosha credits, subscriptions, failed AI tasks, billing and refunds.</p>
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
