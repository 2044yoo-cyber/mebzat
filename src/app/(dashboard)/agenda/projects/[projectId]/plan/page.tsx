import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin, PenLine, Plus } from "lucide-react";

import { getAgendaProject } from "@/lib/data/agenda-projects";
import { signedFileUrls } from "@/lib/data/agenda-site";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

/**
 * The project's floor plans, sketches and pins, from the Agenda side.
 *
 * Everything here opens in the House Plan at the exact place: a plan, a
 * sketch, or a pin — on the floor, the photo or the PDF page it was dropped
 * on. The drawings are edited there; this page is how a discussion gets back
 * to them.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getAgendaProject(projectId);
  if (!project) notFound();

  const supabase = await createClient();
  const [plans, sketches, pins] = await Promise.all([
    supabase.from("agenda_plans").select("id, title, updated_at").eq("project_id", projectId).is("archived_at", null).order("updated_at", { ascending: false }).limit(50),
    supabase.from("agenda_sketches").select("id, plan_id, title, source_kind, source_name, preview_path, updated_at").eq("project_id", projectId).is("archived_at", null).order("updated_at", { ascending: false }).limit(60),
    supabase.from("agenda_pins").select("id, number, plan_id, sketch_id, source_kind, source_name, source_level, source_page, title, measurement, status, task_id").eq("project_id", projectId).is("archived_at", null).order("created_at", { ascending: false }).limit(200),
  ]);
  const taskIds = (pins.data ?? []).flatMap((pin) => (pin.task_id ? [pin.task_id] : []));
  const tasks = taskIds.length ? (await supabase.from("agenda_tasks").select("id, status").in("id", taskIds)).data ?? [] : [];
  const status = new Map(tasks.map((task) => [task.id, task.status]));
  const previews = await signedFileUrls((sketches.data ?? []).flatMap((sketch) => (sketch.preview_path ? [sketch.preview_path] : [])));
  const planTitle = new Map((plans.data ?? []).map((plan) => [plan.id, plan.title]));

  const open = (pin: { id: string; plan_id: string | null; sketch_id: string | null }) =>
    pin.plan_id ? `/house-design?plan=${pin.plan_id}${pin.sketch_id ? `&sketch=${pin.sketch_id}` : ""}&pin=${pin.id}` : null;

  return (
    <div className="space-y-6 p-3 sm:p-5">
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Floor plans</h2>
          <Link href={`/house-design?project=${projectId}`} className="flex min-h-10 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-semibold text-brand-foreground"><Plus className="size-4" />New plan</Link>
        </div>
        {plans.data?.length ? (
          <ul className="divide-y rounded-xl border">
            {plans.data.map((plan) => (
              <li key={plan.id}>
                <Link href={`/house-design?plan=${plan.id}`} className="flex min-h-12 items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40">
                  <span className="truncate font-medium">{plan.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{new Date(plan.updated_at).toLocaleDateString()}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">No floor plan yet. Start one, measure the space, and it is saved here.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Pins</h2>
        {pins.data?.length ? (
          <ul className="divide-y rounded-xl border">
            {pins.data.map((pin) => {
              const href = open(pin);
              const where = pin.source_kind === "plan" ? `${planTitle.get(pin.plan_id ?? "") ?? "Plan"} · ${pin.source_level ?? ""}` : `${pin.source_name ?? pin.source_kind}${pin.source_page ? ` · page ${pin.source_page}` : ""}`;
              return (
                <li key={pin.id} className="flex items-center gap-2 px-3 py-2">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white", pin.status === "resolved" ? "bg-emerald-600" : "bg-rose-600")}>{pin.number.replace(/^PIN-0*/, "")}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{pin.number} · {pin.title}</span>
                    <span className="block truncate text-xs text-muted-foreground"><MapPin className="mr-0.5 inline size-3" />{where}{pin.measurement ? ` · ${pin.measurement}` : ""}{pin.task_id ? ` · task ${(status.get(pin.task_id) ?? "").replace("_", " ")}` : ""}</span>
                  </span>
                  {href ? <Link href={href} className="shrink-0 rounded-lg border px-3 py-2 text-xs font-medium hover:bg-muted">Open drawing</Link> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">No pins yet. Drop a pin on a plan, a photo or a PDF and it appears here.</p>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sketches</h2>
        {sketches.data?.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {sketches.data.map((sketch) => {
              const preview = sketch.preview_path ? previews.get(sketch.preview_path) : null;
              const href = sketch.plan_id ? `/house-design?plan=${sketch.plan_id}&sketch=${sketch.id}` : null;
              const body = (
                <>
                  {preview ? <Picture src={preview} alt="" className="h-28 w-full bg-white object-contain" /> : <span className="flex h-28 items-center justify-center bg-muted text-muted-foreground"><PenLine className="size-5" /></span>}
                  <span className="block truncate px-2 py-1.5 text-xs font-medium">{sketch.title}</span>
                </>
              );
              return href ? <Link key={sketch.id} href={href} className="overflow-hidden rounded-xl border hover:bg-muted/40">{body}</Link> : <div key={sketch.id} className="overflow-hidden rounded-xl border">{body}</div>;
            })}
          </div>
        ) : (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">No sketches yet.</p>
        )}
      </section>
    </div>
  );
}

/** A rendered page or a signed, short-lived URL: nothing for next/image to optimise or cache. */
function Picture(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" {...props} />;
}
