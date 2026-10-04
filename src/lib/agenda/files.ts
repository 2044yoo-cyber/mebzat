/**
 * Where a project's files live, and what their paths look like.
 *
 * Client-safe on purpose. The uploader runs in the browser — an 8 MB phone
 * photograph routed through a server action is held in memory twice — so the
 * bucket name and the path shape cannot live beside the server-only reads, and
 * an earlier draft of this that did failed the build with `'server-only'
 * cannot be imported from a Client Component module`.
 *
 * Both halves of the rule are here, together: the uploader builds the path and
 * the action checks it, and they cannot come to disagree about what "inside
 * this project" means.
 */

/** The private bucket 0094 created. */
export const AGENDA_FILES_BUCKET = "agenda-files";

/**
 * The path a project's file takes inside the bucket.
 *
 * The first segment is the project id because that is what the storage policy
 * matches on — `(storage.foldername(name))[1]` is the only part of an object's
 * name a policy can cheaply reach, so the thing access is decided by has to be
 * first. Anything else is refused at upload.
 */
export function agendaFilePath(
  projectId: string,
  folder: string,
  fileName: string,
): string {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "bin";
  const safe = /^[a-z0-9]{1,8}$/.test(extension) ? extension : "bin";
  return `${projectId}/${folder}/${crypto.randomUUID()}.${safe}`;
}

/**
 * Whether a storage path belongs to this project.
 *
 * The storage policy already refuses an upload outside the member's own
 * project, so a row whose path says otherwise means the row and the object
 * disagree — which would leave a photograph on the wall that nobody can open.
 */
export function isInProject(storagePath: string, projectId: string): boolean {
  return storagePath.startsWith(`${projectId}/`);
}
