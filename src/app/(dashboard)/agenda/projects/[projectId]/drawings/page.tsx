import { notFound } from "next/navigation";

import { DrawingRegister } from "@/components/agenda/site/drawing-register";
import { getDrawings, signedFileUrls } from "@/lib/data/agenda-site";
import { getAgendaProject } from "@/lib/data/agenda-projects";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const drawings = await getDrawings(projectId);
  // Signed on the server, in one call for every revision on the register: the
  // bucket is private, and signing per sheet would be a round trip each.
  const urls = await signedFileUrls(
    drawings.flatMap((drawing) =>
      drawing.revisions.map((revision) => revision.storagePath),
    ),
  );

  return (
    <DrawingRegister
      projectId={projectId}
      drawings={drawings}
      urls={Object.fromEntries(urls)}
    />
  );
}
