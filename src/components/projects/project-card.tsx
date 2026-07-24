import Image from "next/image";
import Link from "next/link";
import { ImageOff, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BUILDING_TYPE_MAP } from "@/lib/constants/building-types";
import type { Project } from "@/types/database.types";

export type ProjectCardData = Pick<
  Project,
  | "id"
  | "title"
  | "cover_image_url"
  | "building_type"
  | "location_city"
  | "location_country"
  | "status"
>;

export function ProjectCard({ project }: { project: ProjectCardData }) {
  const buildingType = project.building_type
    ? BUILDING_TYPE_MAP[project.building_type]
    : null;
  const location = [project.location_city, project.location_country]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-4/3 bg-muted">
        {project.cover_image_url ? (
          <Image
            src={project.cover_image_url}
            alt={project.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" />
          </div>
        )}
        {project.status === "draft" && (
          <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium">
            Draft
          </span>
        )}
      </div>
      <div className="space-y-2 p-4">
        <h3 className="truncate font-medium">{project.title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {buildingType && (
            <Badge variant="secondary">{buildingType.label}</Badge>
          )}
          {location && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" /> {location}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
