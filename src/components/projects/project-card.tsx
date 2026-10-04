import Image from "next/image";
import Link from "next/link";
import { ImageOff, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  PROJECT_CATEGORY_MAP,
  isProjectCategory,
} from "@/lib/constants/project-categories";
import type { Project } from "@/types/database.types";

export type ProjectCardData = Pick<
  Project,
  | "id"
  | "title"
  | "cover_image_url"
  | "category"
  | "description"
  | "location_city"
  | "location_country"
  | "status"
>;

/** Everything that is not "published" is only ever seen by its owner. */
const HIDDEN_LABELS: Record<string, string> = {
  draft: "Draft",
  private: "Private",
  archived: "Archived",
};

export function ProjectCard({ project }: { project: ProjectCardData }) {
  // The category, not the building type. A wardrobe used to be labelled by a
  // column meant for houses, so it was either "Interior" or nothing at all.
  const category = isProjectCategory(project.category)
    ? PROJECT_CATEGORY_MAP[project.category]
    : null;
  const location = [project.location_city, project.location_country]
    .filter(Boolean)
    .join(", ");
  const hidden = HIDDEN_LABELS[project.status];

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
        {hidden && (
          <span className="absolute left-3 top-3 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium">
            {hidden}
          </span>
        )}
      </div>
      <div className="space-y-2 p-4">
        <h3 className="truncate font-medium">{project.title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          {category && <Badge variant="secondary">{category}</Badge>}
          {location && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" /> {location}
            </span>
          )}
        </div>
        {project.description && (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {project.description}
          </p>
        )}
      </div>
    </Link>
  );
}
