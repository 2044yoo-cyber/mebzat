import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  Banknote,
  BedDouble,
  Building2,
  CalendarCheck,
  Eye,
  Layers,
  MapPin,
  Palette,
  User,
} from "lucide-react";

import { ProjectOwnerActions } from "@/components/projects/project-owner-actions";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { BUILDING_TYPE_MAP } from "@/lib/constants/building-types";
import { createClient } from "@/lib/supabase/server";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (!project) {
    notFound();
  }

  const isOwner = project.owner_id === user.id;

  const [{ data: images }, { data: owner }] = await Promise.all([
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
  ]);

  if (!isOwner) {
    await supabase.rpc("increment_project_views", { project_id: id });
  }

  const buildingType = project.building_type
    ? BUILDING_TYPE_MAP[project.building_type]
    : null;
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
            {project.status === "draft" && (
              <Badge variant="secondary">Draft</Badge>
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
            {buildingType && (
              <DetailRow
                icon={Building2}
                label="Building type"
                value={buildingType.label}
              />
            )}
            {project.style && (
              <DetailRow icon={Palette} label="Style" value={project.style} />
            )}
            {typeof project.bedrooms === "number" && (
              <DetailRow
                icon={BedDouble}
                label="Bedrooms"
                value={String(project.bedrooms)}
              />
            )}
            {typeof project.floors === "number" && (
              <DetailRow
                icon={Layers}
                label="Floors"
                value={String(project.floors)}
              />
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
        </aside>
      </div>
    </div>
  );
}
