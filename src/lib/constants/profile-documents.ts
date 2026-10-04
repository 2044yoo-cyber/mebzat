/**
 * Where a profile's CV and portfolio live.
 *
 * In its own module because a `"use server"` file may export nothing but async
 * functions — a constant beside the actions that use it fails the build with
 * "the module has no exports at all", which is a confusing way of saying that.
 */
export const PROFILE_DOCUMENTS_BUCKET = "profile-documents";

export type DocumentKind = "cv" | "portfolio";

/** Ten megabytes, matching the bucket's own limit set in 0086. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
