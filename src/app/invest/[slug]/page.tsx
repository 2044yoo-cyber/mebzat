import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  Building2,
  CalendarDays,
  Calculator,
  ClipboardList,
  FileText,
  HardHat,
  Layers,
  Lock,
  MapPin,
  MessageSquare,
  PenTool,
  Star,
  TrendingUp,
  Users,
} from "lucide-react";

import { DemoBadge, DemoNotice } from "@/components/invest/demo-badge";
import { FollowProjectButton } from "@/components/invest/follow-button";
import { FundingBar } from "@/components/invest/funding-bar";
import { InvestorCard } from "@/components/invest/investor-card";
import { PROJECT_PLACEHOLDER } from "@/lib/constants/placeholders";
import {
  INVEST_DOC_KIND,
  INVEST_MEDIA_KIND,
  INVEST_RISK,
  INVEST_STAGE,
} from "@/lib/constants/invest";
import {
  getInvestProject,
  getProjectDocuments,
  getProjectInvestors,
  getProjectMedia,
  getProjectUpdates,
  isFollowingProject,
} from "@/lib/data/invest";
import { cn } from "@/lib/utils";

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const project = await getInvestProject(slug);
  if (!project) return { title: "Project not found" };

  return {
    title: `${project.title} — ${project.location}`,
    description: project.summary ?? undefined,
    alternates: { canonical: `/invest/${project.slug}` },
    // A sample project has no business ranking as a real opportunity.
    robots: project.is_demo ? { index: false, follow: true } : undefined,
  };
}

export default async function InvestProjectPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const project = await getInvestProject(slug);
  if (!project) notFound();

  const [updates, documents, media, investors, following] = await Promise.all([
    getProjectUpdates(project.id),
    getProjectDocuments(project.id),
    getProjectMedia(project.id),
    getProjectInvestors(project.id),
    isFollowingProject(project.id),
  ]);

  const risk = INVEST_RISK[project.risk_level];
  const stage = INVEST_STAGE[project.stage];

  // The AI already knows the platform; this is the sentence that tells it
  // which development the question is about.
  const aiContext = `${project.title}, a ${project.property_type ?? "development"} in ${project.location}, ${project.city}, with a funding goal of ${project.currency} ${Number(project.funding_goal).toLocaleString()} over ${project.duration_months ?? "?"} months`;

  return (
    <div className="container-page space-y-8 py-8">
      {/* ---- Hero ---------------------------------------------------- */}
      <header className="space-y-4">
        <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Link href="/invest" className="hover:text-foreground">
            Medosha Invest
          </Link>
          <span aria-hidden>/</span>
          <span className="text-foreground">{project.title}</span>
        </nav>

        <div className="relative aspect-[21/9] overflow-hidden rounded-3xl border bg-muted">
          <Image
            src={project.hero_image_url || PROJECT_PLACEHOLDER}
            alt=""
            fill
            priority
            sizes="(min-width: 1280px) 1100px, 100vw"
            className="object-cover"
          />
          <div className="absolute inset-x-4 top-4 flex flex-wrap items-start gap-2">
            <DemoBadge demo={project.is_demo} />
            <span className="rounded-full bg-background/90 px-2.5 py-1 text-xs font-medium backdrop-blur">
              {stage.label} · {stage.blurb}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight">
              {project.title}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-muted-foreground">
              <MapPin className="size-4" />
              {project.location} · {project.city}
              {project.property_type && ` · ${project.property_type}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FollowProjectButton
              projectId={project.id}
              initialFollowing={following}
              followers={project.follower_count}
            />
            <Link
              href={`/ai?q=${encodeURIComponent(`Summarise this development and estimate its construction cost: ${aiContext}`)}`}
              className="flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-medium transition-colors hover:border-brand"
            >
              <Calculator className="size-3.5" />
              Ask AI
            </Link>
          </div>
        </div>

        {project.summary && (
          <p className="max-w-3xl text-balance text-lg text-muted-foreground">
            {project.summary}
          </p>
        )}

        <DemoNotice demo={project.is_demo} />
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-8">
          {/* ---- Scorecard ------------------------------------------- */}
          <section className="rounded-2xl border p-5">
            <h2 className="mb-4 font-medium">Project scorecard</h2>

            <FundingBar
              raised={project.funding_raised}
              goal={project.funding_goal}
              currency={project.currency}
              construction={project.construction_pct}
            />

            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Score
                icon={<TrendingUp className="size-3.5" />}
                label="Expected ROI"
                value={
                  project.expected_roi_pct === null
                    ? "—"
                    : `${Number(project.expected_roi_pct)}%`
                }
              />
              <Score
                icon={<Users className="size-3.5" />}
                label="Investors"
                value={project.investor_count.toLocaleString()}
              />
              <Score
                icon={<CalendarDays className="size-3.5" />}
                label="Duration"
                value={
                  project.duration_months
                    ? `${project.duration_months} months`
                    : "—"
                }
              />
              <Score
                icon={<Star className="size-3.5" />}
                label="Developer rating"
                value={
                  project.developer_rating === null
                    ? "—"
                    : Number(project.developer_rating).toFixed(1)
                }
              />
            </dl>

            <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-4 text-sm">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                  risk.chip,
                )}
              >
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", risk.dot)}
                />
                {risk.label}
              </span>
              <span className="text-muted-foreground">{risk.blurb}</span>
              {project.estimated_completion && (
                <span className="ml-auto text-muted-foreground">
                  Estimated completion{" "}
                  <time dateTime={project.estimated_completion}>
                    {new Date(project.estimated_completion).toLocaleDateString(
                      "en-GB",
                      { month: "long", year: "numeric" },
                    )}
                  </time>
                </span>
              )}
            </div>
          </section>

          {project.description && (
            <section>
              <h2 className="mb-2 font-medium">About this development</h2>
              <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">
                {project.description}
              </p>
            </section>
          )}

          {/* ---- Updates --------------------------------------------- */}
          <section>
            <h2 className="mb-3 font-medium">Construction updates</h2>
            {updates.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                No updates published yet. Following the project puts new ones in
                your notifications.
              </p>
            ) : (
              <ol className="space-y-3">
                {updates.map((update) => (
                  <li key={update.id} className="rounded-2xl border p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-medium">{update.title}</h3>
                      <time
                        dateTime={update.published_on}
                        className="text-xs text-muted-foreground"
                      >
                        {new Date(update.published_on).toLocaleDateString(
                          "en-GB",
                          { day: "numeric", month: "short", year: "numeric" },
                        )}
                      </time>
                    </div>
                    {update.body && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {update.body}
                      </p>
                    )}
                    {update.construction_pct !== null && (
                      <p className="mt-2 text-xs text-muted-foreground tabular-nums">
                        Construction at {Math.round(Number(update.construction_pct))}%
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* ---- Media ----------------------------------------------- */}
          {media.length > 0 && (
            <section>
              <h2 className="mb-3 font-medium">Gallery</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {media.map((item) => (
                  <figure
                    key={item.id}
                    className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted"
                  >
                    <Image
                      src={item.url}
                      alt={item.caption ?? ""}
                      fill
                      sizes="240px"
                      className="object-cover"
                    />
                    <figcaption className="absolute bottom-1 left-1 rounded-full bg-background/90 px-2 py-0.5 text-[10px] backdrop-blur">
                      {INVEST_MEDIA_KIND[item.kind].label}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </section>
          )}

          {/* ---- Investors ------------------------------------------- */}
          {investors.length > 0 && (
            <section>
              <h2 className="mb-3 font-medium">Backers</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {investors.map((investor) => (
                  <InvestorCard key={investor.id} investor={investor} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ---- Sidebar ----------------------------------------------- */}
        <aside className="space-y-5">
          <section className="rounded-2xl border p-4">
            <h2 className="mb-3 text-sm font-medium">Who is building it</h2>
            <dl className="space-y-3 text-sm">
              <Party
                icon={<Building2 className="size-3.5" />}
                role="Developer"
                name={project.developer_name}
                href={
                  project.developer_company_id
                    ? `/companies?q=${encodeURIComponent(project.developer_name ?? "")}`
                    : undefined
                }
              />
              <Party
                icon={<PenTool className="size-3.5" />}
                role="Architect"
                name={project.architect_name}
              />
              <Party
                icon={<HardHat className="size-3.5" />}
                role="Contractor"
                name={project.contractor_name}
              />
            </dl>
          </section>

          <section className="rounded-2xl border p-4">
            <h2 className="mb-3 text-sm font-medium">Documents</h2>
            {documents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No documents listed.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {documents.map((document) => (
                  <li
                    key={document.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">
                        {document.title || INVEST_DOC_KIND[document.kind]}
                      </span>
                    </span>
                    {document.available && document.url ? (
                      <a
                        href={document.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs font-medium text-brand hover:underline"
                      >
                        Open
                      </a>
                    ) : (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="size-3" />
                        Not uploaded
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Everything this development touches elsewhere on Medosha. */}
          <section className="rounded-2xl border p-4">
            <h2 className="mb-3 text-sm font-medium">Explore around it</h2>
            <div className="space-y-1.5">
              <Cross
                icon={<Calculator className="size-3.5" />}
                label="Estimate the build cost"
                href={`/ai?agent=cost&q=${encodeURIComponent(`Estimate the construction cost of ${aiContext}`)}`}
              />
              <Cross
                icon={<ClipboardList className="size-3.5" />}
                label="Generate a BOQ"
                href={`/ai?agent=boq&q=${encodeURIComponent(`Generate a preliminary BOQ for ${aiContext}`)}`}
              />
              <Cross
                icon={<Layers className="size-3.5" />}
                label="Material prices"
                href="/price-exchange"
              />
              <Cross
                icon={<Building2 className="size-3.5" />}
                label="Suppliers and contractors"
                href="/companies"
              />
              <Cross
                icon={<Users className="size-3.5" />}
                label="Architects and engineers"
                href="/directory/individual"
              />
              <Cross
                icon={<MapPin className="size-3.5" />}
                label={`Properties in ${project.location}`}
                href={`/city?q=${encodeURIComponent(project.location)}`}
              />
              <Cross
                icon={<MessageSquare className="size-3.5" />}
                label="Message the developer"
                href="/messages"
              />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Score({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function Party({
  icon,
  role,
  name,
  href,
}: {
  icon: React.ReactNode;
  role: string;
  name: string | null;
  href?: string;
}) {
  if (!name) return null;
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {role}
      </dt>
      <dd className="mt-0.5 font-medium">
        {href ? (
          <Link href={href} className="hover:text-brand hover:underline">
            {name}
          </Link>
        ) : (
          name
        )}
      </dd>
    </div>
  );
}

function Cross({
  icon,
  label,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      <span className="text-brand">{icon}</span>
      <span className="truncate">{label}</span>
    </Link>
  );
}

