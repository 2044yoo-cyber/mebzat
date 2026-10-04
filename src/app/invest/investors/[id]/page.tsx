import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  Award,
  BadgeCheck,
  CalendarDays,
  MapPin,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { DemoBadge, DemoNotice } from "@/components/invest/demo-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PROJECT_PLACEHOLDER } from "@/lib/constants/placeholders";
import { INVEST_STAGE, compactBirr } from "@/lib/constants/invest";
import { getInvestor, getPositions } from "@/lib/data/invest";

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const investor = await getInvestor(id);
  return {
    title: investor ? `${investor.display_name} — Investor` : "Investor",
    robots: { index: false, follow: false },
  };
}

export default async function InvestorPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const investor = await getInvestor(id);
  if (!investor) notFound();

  const positions = await getPositions(investor.id);

  const active = positions.filter(
    (position) => position.project && position.project.stage !== "completed",
  );
  const completed = positions.filter(
    (position) => position.project?.stage === "completed",
  );
  const committed = positions.reduce(
    (total, position) => total + Number(position.amount),
    0,
  );

  const initials = investor.display_name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="container-page space-y-8 py-8">
      <header className="space-y-4">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/invest" className="hover:text-foreground">
            Medosha Invest
          </Link>
          <span aria-hidden>/</span>
          <Link href="/invest/investors" className="hover:text-foreground">
            Investors
          </Link>
        </nav>

        <div className="flex flex-wrap items-start gap-4">
          <Avatar className="size-20 shrink-0">
            {investor.avatar_url && (
              <AvatarImage src={investor.avatar_url} alt="" />
            )}
            <AvatarFallback className="text-xl">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {investor.display_name}
              </h1>
              {investor.verified && (
                <BadgeCheck className="size-5 text-brand" aria-label="Verified" />
              )}
              <DemoBadge demo={investor.is_demo} />
            </div>

            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {investor.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {investor.city}
                </span>
              )}
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                Investor since{" "}
                {new Date(investor.investor_since).toLocaleDateString("en-GB", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </p>

            {investor.interests.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {investor.interests.map((interest) => (
                  <li
                    key={interest}
                    className="rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
                  >
                    {interest}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <DemoNotice demo={investor.is_demo} />
      </header>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={<Wallet className="size-4" />}
          label="Portfolio value"
          value={compactBirr(Number(investor.portfolio_value))}
          accent
        />
        <Stat
          icon={<TrendingUp className="size-4" />}
          label="Projects backed"
          value={String(investor.projects_invested)}
        />
        <Stat
          icon={<TrendingUp className="size-4" />}
          label="Active"
          value={String(active.length)}
        />
        <Stat
          icon={<Award className="size-4" />}
          label="Completed"
          value={String(completed.length)}
        />
      </dl>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold tracking-tight">
          Investment history
        </h2>

        {positions.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
            No positions recorded.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {positions.length}{" "}
              {positions.length === 1 ? "position" : "positions"} ·{" "}
              {compactBirr(committed)} committed across them
            </p>

            <ul className="space-y-2">
              {positions.map((position) => {
                const project = position.project;
                if (!project) return null;
                return (
                  <li key={position.id}>
                    <Link
                      href={`/invest/${project.slug}`}
                      className="flex items-center gap-3 rounded-2xl border p-3 transition-colors hover:border-brand"
                    >
                      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                        <Image
                          src={project.hero_image_url || PROJECT_PLACEHOLDER}
                          alt=""
                          fill
                          sizes="56px"
                          className="object-cover"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium">
                            {project.title}
                          </span>
                          <DemoBadge demo={project.is_demo} size="sm" />
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {project.location} ·{" "}
                          {INVEST_STAGE[project.stage].label} ·{" "}
                          {Math.round(Number(project.construction_pct))}% built
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="font-semibold tabular-nums">
                          {compactBirr(
                            Number(position.amount),
                            project.currency,
                          )}
                        </p>
                        {project.expected_roi_pct !== null && (
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {Number(project.expected_roi_pct)}% expected
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        accent
          ? "rounded-2xl border border-brand/40 bg-brand/5 p-4"
          : "rounded-2xl border p-4"
      }
    >
      <dt className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd
        className={
          accent
            ? "mt-1 text-2xl font-semibold tracking-tight text-brand tabular-nums"
            : "mt-1 text-2xl font-semibold tracking-tight tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}
