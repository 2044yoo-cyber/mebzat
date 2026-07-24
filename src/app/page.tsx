import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ACCOUNT_TYPES } from "@/lib/constants/account-types";

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,color-mix(in_oklch,var(--brand)_18%,transparent),transparent)]"
          />
          <div className="mx-auto max-w-4xl px-6 py-28 text-center">
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
              The construction industry, connected.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
              Medosha brings architects, contractors, suppliers, developers,
              and every trade in between onto one platform &mdash; discover
              nearby companies, showcase projects, and grow your network.
            </p>
            <div className="mt-10 flex items-center justify-center gap-3">
              <Link
                href="/signup"
                className={buttonVariants({ size: "lg" })}
              >
                Get started <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login"
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                Log in
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              Built for every corner of construction
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
              Whichever way you work in the industry, Medosha has a profile
              built for you.
            </p>

            <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {ACCOUNT_TYPES.map(({ value, label, description, icon: Icon }) => (
                <Card
                  key={value}
                  className="items-start gap-2 rounded-2xl p-5 transition-shadow hover:shadow-md"
                >
                  <Icon className="size-5 text-brand" />
                  <h3 className="font-medium">{label}</h3>
                  <p className="text-sm text-muted-foreground">
                    {description}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Ready to build your presence?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Create your free profile in minutes and start connecting with the
            construction industry near you.
          </p>
          <Link
            href="/signup"
            className={cn(buttonVariants({ size: "lg" }), "mt-8")}
          >
            Join Medosha <ArrowRight className="size-4" />
          </Link>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
