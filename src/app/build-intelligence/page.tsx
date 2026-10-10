import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  ChartNoAxesCombined,
  ClipboardList,
  House,
  MapPin,
  PackageSearch,
  ShieldCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Build Intelligence — Construction Costs, Materials & House Plans in Ethiopia",
  description:
    "Plan a building project in Ethiopia with Medosha: estimate construction costs, compare material listings, explore practical house designs and prepare a BOQ.",
  keywords: [
    "construction cost Ethiopia",
    "house construction budget Addis Ababa",
    "construction materials prices Ethiopia",
    "house plans Ethiopia",
    "bill of quantities calculator",
    "Medosha Build Intelligence",
  ],
  alternates: { canonical: "/build-intelligence" },
  openGraph: {
    title: "Medosha Build Intelligence",
    description:
      "Plan your next building project with construction calculators, material listings and house design tools for Ethiopia.",
    url: "/build-intelligence",
    type: "website",
  },
};

const tools = [
  {
    icon: Calculator,
    eyebrow: "01 · Estimate",
    title: "Estimate your construction budget",
    description:
      "Work from your floor area, number of storeys, finish level and your own material and labour rates. Review the assumptions before relying on the total.",
    href: "/calculators/construction-cost",
    action: "Open cost calculator",
  },
  {
    icon: PackageSearch,
    eyebrow: "02 · Compare",
    title: "Explore materials and supplier offers",
    description:
      "Browse construction materials, compare published offers and check the location, unit and availability stated by each seller.",
    href: "/price-exchange",
    action: "Explore price exchange",
  },
  {
    icon: ChartNoAxesCombined,
    eyebrow: "03 · Reference",
    title: "Check material reference prices",
    description:
      "Compare material rates by location, unit and specification, and see whether each figure is admin-verified, supplier-submitted, web-sourced or only an educational estimate.",
    href: "/material-price-radar",
    action: "Open material price radar",
  },
  {
    icon: House,
    eyebrow: "04 · Design",
    title: "Start planning your house",
    description:
      "Explore Medosha’s house design workspace to begin a layout and develop it into a more detailed project.",
    href: "/house-design",
    action: "Open house design",
  },
  {
    icon: ClipboardList,
    eyebrow: "05 · Prepare",
    title: "Build a bill of quantities",
    description:
      "Organise quantities and rates into a BOQ, then review what is included before sharing it with a contractor or quantity surveyor.",
    href: "/calculators/boq",
    action: "Open BOQ calculator",
  },
];

const steps = [
  {
    number: "1",
    title: "Set your project assumptions",
    description: "Choose the location, floor area, storeys and finish level.",
  },
  {
    number: "2",
    title: "Check real supplier offers",
    description: "Compare available listings and confirm current rates directly.",
  },
  {
    number: "3",
    title: "Review before you commit",
    description: "Keep contingency visible and ask a qualified professional to validate the estimate.",
  },
];

export default function BuildIntelligencePage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-5 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">Medosha</Link>
        <span className="mx-2">/</span>
        <span aria-current="page">Build Intelligence</span>
      </nav>

      <section className="relative overflow-hidden rounded-3xl border bg-card px-5 py-8 sm:px-9 sm:py-12">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Made for building in Ethiopia
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Plan your build with <span className="text-primary">more confidence.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Estimate costs, explore material offers, start a house layout and prepare a BOQ —
            in one place. Start free, use your own rates, and check the assumptions behind every estimate.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/calculators/construction-cost"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              Estimate my build <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/price-exchange"
              className="inline-flex min-h-11 items-center justify-center rounded-xl border px-5 py-3 text-sm font-semibold transition-colors hover:bg-muted"
            >
              Compare material offers
            </Link>
          </div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">
            Estimates are for early planning, not contractor quotations or certified engineering advice.
            Rates and availability should be verified before purchasing.
          </p>
        </div>
      </section>

      <section aria-labelledby="tools-heading" className="mt-10">
        <div className="mb-5">
          <p className="text-sm font-semibold text-primary">Your project toolkit</p>
          <h2 id="tools-heading" className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            From first budget to BOQ
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Use the tools you need now. You can move between them as your project becomes clearer.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {tools.map(({ icon: Icon, eyebrow, title, description, href, action }) => (
            <article key={href} className="flex h-full flex-col rounded-2xl border bg-card p-5 sm:p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{eyebrow}</p>
              <h3 className="mt-2 text-lg font-semibold">{title}</h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{description}</p>
              <Link href={href} className="mt-5 inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-primary hover:underline">
                {action} <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="workflow-heading" className="mt-10 rounded-2xl border bg-muted/30 p-5 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background">
            <ChartNoAxesCombined className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h2 id="workflow-heading" className="text-xl font-bold">A simple way to plan</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              A practical starting workflow, without pretending one estimate can replace a measured BOQ.
            </p>
          </div>
        </div>
        <ol className="mt-6 grid gap-5 sm:grid-cols-3">
          {steps.map((step) => (
            <li key={step.number} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background text-sm font-semibold">
                {step.number}
              </span>
              <div>
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-8 flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex gap-3">
          <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <div>
            <h2 className="font-semibold">Clear assumptions. Better decisions.</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Medosha keeps estimates separate from supplier quotations. Confirm specifications,
              delivery, tax and current prices with the supplier before making a commitment.
            </p>
          </div>
        </div>
        <Link href="/marketplace" className="inline-flex min-h-10 shrink-0 items-center gap-2 text-sm font-semibold text-primary hover:underline">
          Browse marketplace <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </main>
  );
}
