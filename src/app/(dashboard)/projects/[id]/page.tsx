import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Banknote,
  CalendarCheck,
  Eye,
  ListChecks,
  MapPin,
  Palette,
  Rotate3d,
  Tag,
  User,
} from "lucide-react";

import { ReportDialog } from "@/components/moderation/report-dialog";
import { ProjectOwnerActions } from "@/components/projects/project-owner-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  PROJECT_CATEGORY_MAP,
  displayValue,
  fieldsFor,
  isProjectCategory,
  type ProjectCategory,
} from "@/lib/constants/project-categories";
import { createClient } from "@/lib/supabase/server";
import { listToursFor } from "@/lib/tour/queries";

export async function generateMetadata(props: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("title")
    .eq("id", id)
    .single();
  return { title: data?.title ?? "Project" };
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm">{value}</p>
      </div>
    </div>
  );
}

export default async function ProjectDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await props.params;
  const supabase = await createClient();

  // Public. A project showcase is something somebody shares — a link in a
  // message, a post, a search result — and requiring an account to open it
  // turns every share into a dead end. The session is read only to decide
  // whether to offer the owner their edit controls.
  //
  // Row-level security still decides what `select` returns, so a private
  // project stays invisible whoever asks. This governs the page, not the data.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  const isOwner = Boolean(user) && project.owner_id === user!.id;

  const [{ data: images }, { data: owner }, tours] = await Promise.all([
    supabase
      .from("project_images")
      .select("id, url, caption")
      .eq("project_id", id)
      .order("position", { ascending: true }),
    supabase
      .from("profiles")
      .select("username, full_name, company_name, avatar_url")
      .eq("id", project.owner_id)
      .single(),
    // Owner-matched: tours.project_id carries no ownership check, so without
    // this a stranger's tour would be shown here as though the owner made it.
    listToursFor({ projectId: project.id, ownerId: project.owner_id }),
  ]);

  if (!isOwner) {
    await supabase.rpc("increment_project_views", { project_id: id });
  }

  const category: ProjectCategory | null = isProjectCategory(project.category)
    ? project.category
    : null;

  /**
   * The answers this project actually has, in the order its category asks for
   * them.
   *
   * Driven by the same spec the form renders from, so a field that is not part
   * of this category has no row here to leave empty — which is what put
   * "Bedrooms: —" on a kitchen. A field the category does ask for but the
   * author left blank is dropped too: a portfolio page is not a form, and a
   * list of dashes says nothing about the work.
   */
  const metadata = (project.metadata ?? {}) as Record<string, unknown>;
  const details = (category ? fieldsFor(category) : [])
    .map((field) => ({
      field,
      value: displayValue(
        field,
        field.source === "column"
          ? // buildingType is the form's name for it; the column is building_type.
            (project[
              (field.id === "buildingType"
                ? "building_type"
                : field.id) as keyof typeof project
            ] as unknown)
          : metadata[field.id],
      ),
    }))
    .filter((row): row is { field: (typeof row)["field"]; value: string } =>
      row.value !== null,
    );

  const location = [project.location_city, project.location_country]
    .filter(Boolean)
    .join(", ");
  const ownerName = owner?.company_name || owner?.full_name || "Unknown";
  const ownerInitials = ownerName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const gallery = images ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {project.title}
            </h1>
            {category && (
              <Badge variant="secondary">
                {PROJECT_CATEGORY_MAP[category]}
              </Badge>
            )}
            {project.status !== "published" && (
              <Badge variant="secondary">
                {project.status === "draft"
                  ? "Draft"
                  : project.status === "private"
                    ? "Private"
                    : "Archived"}
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {location && (
              <span className="flex items-center gap-1">
                <MapPin className="size-4" /> {location}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Eye className="size-4" /> {project.views} views
            </span>
          </div>
        </div>
        {isOwner && <ProjectOwnerActions projectId={project.id} />}
      </div>

      {gallery.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="relative aspect-4/3 overflow-hidden rounded-2xl border bg-muted sm:col-span-2">
            <Image
              src={gallery[0].url}
              alt={project.title}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 900px"
              className="object-cover"
            />
          </div>
          {gallery.slice(1).map((img) => (
            <div
              key={img.id}
              className="relative aspect-4/3 overflow-hidden rounded-2xl border bg-muted"
            >
              <Image
                src={img.url}
                alt={img.caption ?? project.title}
                fill
                sizes="(max-width: 640px) 100vw, 450px"
                className="object-cover"
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-muted-foreground">
          No images yet.
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {project.description && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                About this project
              </h2>
              <p className="text-sm leading-relaxed whitespace-pre-line">
                {project.description}
              </p>
            </div>
          )}

          {project.tags.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                Skills used
              </h2>
              <div className="flex flex-wrap gap-2">
                {project.tags.map((t) => (
                  <Badge key={t} variant="outline">
                    <Tag className="size-3" /> {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {project.materials.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">
                Materials
              </h2>
              <div className="flex flex-wrap gap-2">
                {project.materials.map((m) => (
                  <Badge key={m} variant="secondary">
                    {m}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-5">
          {owner?.username && (
            <Link
              href={`/u/${owner.username}`}
              className="flex items-center gap-3 rounded-2xl border p-4 transition-colors hover:bg-muted/50"
            >
              <Avatar className="size-10">
                <AvatarImage src={owner.avatar_url ?? undefined} alt={ownerName} />
                <AvatarFallback>{ownerInitials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{ownerName}</p>
                <p className="text-xs text-muted-foreground">View profile</p>
              </div>
            </Link>
          )}

          <div className="space-y-4 rounded-2xl border p-5">
            {details.map(({ field, value }) => (
              <DetailRow
                key={field.id}
                icon={ListChecks}
                label={field.label}
                value={value}
              />
            ))}
            {project.style && (
              <DetailRow icon={Palette} label="Style" value={project.style} />
            )}
            {typeof project.budget === "number" && (
              <DetailRow
                icon={Banknote}
                label="Budget"
                value={`${project.budget.toLocaleString()} ${project.budget_currency}`}
              />
            )}
            {project.completion_date && (
              <DetailRow
                icon={CalendarCheck}
                label="Completed"
                value={new Date(project.completion_date).toLocaleDateString(
                  undefined,
                  { year: "numeric", month: "long" },
                )}
              />
            )}
            {project.client && (
              <DetailRow icon={User} label="Client" value={project.client} />
            )}
          </div>

          {/* A portfolio is the surface people's photographs are lifted from,
              and until now it was the one surface with nowhere to say so.
              Not shown to the owner: nobody reports their own project. */}
          {!isOwner && (
            <ReportDialog
              contentType="project"
              contentId={project.id}
              ownerId={project.owner_id}
              variant="row"
            />
          )}
        </aside>
      </div>

      {(tours.length > 0 || isOwner) && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium">360° tours</h2>

          {tours.length === 0 ? (
            <Link
              href={`/tours/new?project=${project.id}`}
              className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
            >
              <Rotate3d className="size-4" />
              Add a 360° tour — a finished room says more than a photograph of it
            </Link>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {tours.map((tour) => (
                <li key={tour.id}>
                  <Link
                    href={`/tour/${tour.id}`}
                    className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50"
                  >
                    <Rotate3d className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{tour.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {tour.sceneCount} {tour.sceneCount === 1 ? "scene" : "scenes"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
