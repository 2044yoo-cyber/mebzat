import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { Logo } from "@/components/layout/logo";

const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] =
  [
    {
      heading: "Explore",
      links: [
        { label: "Marketplace", href: "/marketplace" },
        { label: "Companies", href: "/companies" },
        { label: "Find suppliers", href: "/directory/supplier" },
        { label: "Find contractors", href: "/directory/contractor" },
        { label: "Join Medosha", href: "/signup" },
      ],
    },
    {
      heading: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Careers", href: "/careers" },
        { label: "Contact", href: "/contact" },
      ],
    },
    {
      heading: "Legal",
      links: [
        { label: "Privacy", href: "/privacy" },
        { label: "Terms", href: "/terms" },
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
              The professional network and marketplace for construction.
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
            <div key={column.heading} className="space-y-3">
              <h3 className="text-sm font-semibold">{column.heading}</h3>
              <ul className="space-y-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t pt-6 text-sm text-muted-foreground sm:flex-row">
          <p>&copy; {new Date().getFullYear()} Medosha. All rights reserved.</p>
          <p>Building the construction industry&apos;s digital ecosystem.</p>
        </div>
      </div>
    </footer>
  );
}
