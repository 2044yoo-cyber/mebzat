type SketchDatabaseError = { code?: string; message: string; hint?: string };

/** Turn Supabase's structured error into a useful, non-secret UI message. */
export function sketchSaveError(error: SketchDatabaseError): string {
  if (error.code === "42501") return "You do not have permission to save sketches to this project. Check that you are still a project member.";
  if (error.code === "23503") return "The project, plan, or profile linked to this sketch is no longer available. Reopen the plan and try again.";
  if (error.code === "23514") return "Some sketch information is invalid. Shorten the sketch title or check the selected source, then try again.";
  if (error.code === "42703") return "The sketch database needs an update before it can save. Please try again shortly or contact the site administrator.";
  if (["42P01", "PGRST205", "PGRST204"].includes(error.code ?? "")) return "The sketch database is not ready. The administrator needs to apply the Agenda plans migration.";
  const code = error.code ? ` (${error.code})` : "";
  return `Sketch save failed${code}: ${error.message.slice(0, 220)}`;
}
