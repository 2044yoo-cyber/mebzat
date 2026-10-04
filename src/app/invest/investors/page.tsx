import Link from "next/link";
import type { Metadata } from "next";
import { Users } from "lucide-react";

import { DemoNotice } from "@/components/invest/demo-badge";
import { InvestorCard } from "@/components/invest/investor-card";
import { getInvestors } from "@/lib/data/invest";

export const metadata: Metadata = {
  title: "Investors — Medosha Invest",
  description: "Members backing development projects on Medosha.",
  alternates: { canonical: "/invest/investors" },
  robots: { index: false, follow: true },
};

export default async function InvestorsPage() {
  const { investors, available } = await getInvestors(48);
  const allDemo = investors.every((investor) => investor.is_demo);

  return (
    <div className="container-page space-y-6 py-8">
      <header className="space-y-3">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/invest" className="hover:text-foreground">
            Medosha Invest
          </Link>
          <span aria-hidden>/</span>
          <span className="text-foreground">Investors</span>
        </nav>

        <h1 className="text-3xl font-semibold tracking-tight">Investors</h1>
        <p className="max-w-2xl text-muted-foreground">
          Every Medosha member can become an investor. A profile shows what
          someone backs and what they are interested in — never their identity
          beyond what they publish.
        </p>

        <DemoNotice demo={allDemo && investors.length > 0} />
      </header>

      {!available ? (
        <Empty body="The investment tables have not been created on this database. Apply migrations 0019 and 0020, in that order." />
      ) : investors.length === 0 ? (
        <Empty body="No investor profiles yet." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {investors.map((investor) => (
            <InvestorCard key={investor.id} investor={investor} />
          ))}
        </div>
      )}
    </div>
  );
}

function Empty({ body }: { body: string }) {
  return (
    <div className="rounded-2xl border border-dashed p-12 text-center">
      <Users className="mx-auto size-7 text-muted-foreground" />
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        {body}
      </p>
    </div>
  );
}
