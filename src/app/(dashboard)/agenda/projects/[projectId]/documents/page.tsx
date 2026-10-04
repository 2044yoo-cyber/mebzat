import { notFound } from "next/navigation";

import { DocumentShelf } from "@/components/agenda/site/document-shelf";
import { getDocuments, signedFileUrls } from "@/lib/data/agenda-site";
import { getAgendaProject } from "@/lib/data/agenda-projects";

export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  // A confidential document the viewer may not read is absent from this list
  // rather than shown locked: a row saying a contract exists is itself the
  // leak the confidentiality level is there to prevent.
  const documents = await getDocuments(projectId);
  const urls = await signedFileUrls(
    documents.flatMap((document) =>
      document.versions.map((version) => version.storagePath),
    ),
  );

  return (
    <DocumentShelf
      projectId={projectId}
      documents={documents}
      urls={Object.fromEntries(urls)}
    />
  );
}
