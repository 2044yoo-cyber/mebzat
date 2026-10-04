import { notFound } from "next/navigation";

import { PhotoWall } from "@/components/agenda/site/photo-wall";
import { getSitePhotos, signedPhotoUrls } from "@/lib/data/agenda-site";
import { getAgendaProject } from "@/lib/data/agenda-projects";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const photos = await getSitePhotos(projectId);
  // Signed on the server. The bucket is private, so there is no public URL to
  // hand the browser, and signing in the client would mean shipping a second
  // round trip per photograph.
  const urls = await signedPhotoUrls(photos.map((photo) => photo.storagePath));

  return (
    <PhotoWall
      projectId={projectId}
      photos={photos}
      urls={Object.fromEntries(urls)}
    />
  );
}
