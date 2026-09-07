import { Suspense } from "react";

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ChevronLeft } from "lucide-react";

import { CalculatorPage } from "@/components/calculators/calculator-page";
import { CALCULATORS, calculatorBySlug, CALCULATOR_CATEGORIES } from "@/lib/calculators/registry";

/**
 * One route per calculator.
 *
 * `generateStaticParams` gives each of the forty-one its own build-time page
 * with its own title and description, which is what the brief wanted for search
 * traffic — /calculators/concrete is a real URL that renders on its own, not a
 * client-side tab on the hub.
 */
export function generateStaticParams() {
  return CALCULATORS.map((calculator) => ({ slug: calculator.slug }));
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const calculator = calculatorBySlug(slug);
  if (!calculator) return { title: "Calculator not found" };

  return {
    title: calculator.title,
    description: calculator.summary,
    keywords: calculator.keywords,
    alternates: { canonical: `/calculators/${calculator.slug}` },
    openGraph: {
      title: `${calculator.title} — Medosha`,
      description: calculator.summary,
      type: "website",
    },
  };
}

export default async function Page(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const calculator = calculatorBySlug(slug);
  if (!calculator) notFound();

  const category = CALCULATOR_CATEGORIES.find((one) => one.id === calculator.category);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 pb-[calc(var(--bottom-nav-h)+1.5rem)] sm:px-6 lg:pb-10">
      <Link
        href="/calculators"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        All calculators
      </Link>

      <header className="mb-6">
        {category && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {category.label}
          </p>
        )}
        <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{calculator.title}</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{calculator.summary}</p>
      </header>

      {/* `CalculatorPage` reads the query string, which a statically rendered
          route can only do inside a boundary. The fallback is the page without
          its seed values — the same form, a beat earlier. */}
      <Suspense fallback={<CalculatorPage slug={calculator.slug} />}>
        <CalculatorPage slug={calculator.slug} />
      </Suspense>
    </div>
  );
}
