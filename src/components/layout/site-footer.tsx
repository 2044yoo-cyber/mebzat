import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { I18nText } from "@/components/i18n/i18n-text";

const COLUMNS: { headingKey: string; links: { textKey: string; href: string }[] }[] =
  [
    {
      headingKey: "footer.explore",
      links: [
        { textKey: "navigation.marketplace", href: "/marketplace" },
        { textKey: "navigation.used-items", href: "/marketplace/used" },
        { textKey: "navigation.rental-items", href: "/marketplace/rental" },
        { textKey: "navigation.digital-marketplace", href: "/marketplace/digital" },
        { textKey: "navigation.companies", href: "/companies" },
        { textKey: "navigation.professionals", href: "/professionals" },
        { textKey: "navigation.supplier-finder", href: "/directory/supplier" },
        { textKey: "navigation.construction", href: "/directory/contractor" },
        { textKey: "common.signUp", href: "/signup" },
      ],
    },
    {
      headingKey: "footer.company",
      links: [
        { textKey: "footer.about", href: "/about" },
        { textKey: "footer.careers", href: "/careers" },
        { textKey: "footer.contact", href: "/contact" },
      ],
    },
    {
      headingKey: "footer.legal",
      links: [
        { textKey: "footer.privacy", href: "/privacy" },
        { textKey: "footer.terms", href: "/terms" },
      ],
    },
  ];

// Platform roots until official Medosha handles exist — resolvable, not 404.
const SOCIAL = [
  { label: "LinkedIn", href: "https://www.linkedin.com" },
  { label: "X", href: "https://x.com" },
  { label: "Instagram", href: "https://www.instagram.com" },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted-foreground">
              <I18nText textKey="footer.description" secondary />
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {SOCIAL.map(({ label, href }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {label}
                  <ArrowUpRight className="size-3" />
                </a>
              ))}
            </div>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.headingKey} className="space-y-3">
              <h3 className="text-sm font-semibold"><I18nText textKey={column.headingKey} /></h3>
              <ul className="space-y-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <I18nText textKey={link.textKey} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t pt-6 text-sm text-muted-foreground sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Medosha. <I18nText textKey="footer.rights" /></p>
          <p><I18nText textKey="footer.ecosystem" /></p>
        </div>
      </div>
    </footer>
  );
}
