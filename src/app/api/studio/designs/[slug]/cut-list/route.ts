import { buildExport } from "@/features/berchuma-studio/services/exports";
import { getDesign } from "@/features/berchuma-studio/services/designs";
import { marketRates } from "@/features/berchuma-studio/services/rates";

/**
 * The cut list, as a spreadsheet.
 *
 * A GET, so it is a link rather than a form — which means a workshop can be
 * sent the URL and download it directly, and the browser handles the save
 * dialog rather than a blob assembled in JavaScript.
 *
 * Nothing is stored. The workbook is built from the spec on every request,
 * which is what stops a stale file from being handed to a shop after the
 * design changed. Freezing a cut list is a real requirement, but it belongs to
 * the moment a job is ordered, not to a download button — and that copy is
 * taken in `manufacturing_requests.cut_list`.
 *
 * There is no authorisation check here beyond `getDesign`, and that is the
 * point: it returns null for a design the caller may not read, because
 * row-level security already decided.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const design = await getDesign(slug);

  if (!design) {
    return new Response("Not found", { status: 404 });
  }

  const rates = await marketRates();
  const bundle = buildExport({
    spec: design.spec,
    rates,
    preparedFor: design.owner.name,
    url: new URL(`/designs/${design.slug}`, request.url).toString(),
  });

  return new Response(bundle.workbook as BodyInit, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${bundle.stem}-cut-list.xlsx"`,
      "content-length": String(bundle.workbook.length),
      // Rebuilt per request, and it reflects supplier rates that move. A cached
      // copy would be a quote from last week wearing today's date.
      "cache-control": "no-store",
    },
  });
}
