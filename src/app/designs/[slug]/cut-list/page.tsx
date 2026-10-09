import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { siteUrl } from "@/lib/site";

/**
 * The bare host, for a line that is printed and taken to a workshop.
 *
 * Derived from NEXT_PUBLIC_SITE_URL rather than written out, because this line
 * ends up on paper: a hardcoded domain on a cut list outlives the deployment
 * that produced it, and somebody types it in a year later and lands nowhere.
 */
function host(): string {
  return siteUrl().replace(/^https?:\/\//, "");
}
import { ArrowLeft, FileSpreadsheet } from "lucide-react";

import { BoardSheets } from "@/features/berchuma-studio/components/manufacturing/sheet-diagram";
import { PrintButton } from "@/features/berchuma-studio/components/public/print-button";
import { QuoteRequest } from "@/features/berchuma-studio/components/public/quote-request";
import { getDesign } from "@/features/berchuma-studio/services/designs";
import { buildCutList } from "@/features/berchuma-studio/services/cutlist";
import { buildProjectCutList } from "@/features/berchuma-studio/services/cabinet-project";
import { buildExport } from "@/features/berchuma-studio/services/exports";
import { buildParts } from "@/features/berchuma-studio/services/geometry";
import { marketRates } from "@/features/berchuma-studio/services/rates";
import { allBays } from "@/features/berchuma-studio/types/spec";
import type { CutList } from "@/features/berchuma-studio/services/cutlist";

/**
 * The shop sheet.
 *
 * This is the page a joiner works from, so it is designed for paper first: it
 * prints to A4 without a sidebar, without navigation, and with the table
 * headers repeating on every page. There is no PDF generator behind it, and
 * that is a decision rather than an omission — the browser already has one,
 * it renders the fonts and the page breaks correctly, and "Save as PDF" from
 * the print dialog produces a better document than anything worth writing
 * here would.
 *
 * The numbers are recomputed on every load from the design's own spec, so a
 * design edited this morning cannot be cut from a list printed last week.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const design = await getDesign(slug);
  return {
    title: design ? `Cut list — ${design.title}` : "Cut list",
    robots: { index: false },
  };
}

export default async function CutListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const design = await getDesign(slug);
  if (!design) notFound();

  // A manufacturing project consists of independent cabinetry designs. The
  // old single-design preview would silently exclude every added wardrobe and
  // vanity, even though the XLSX route now includes them. Show the same full
  // production list on screen and on paper.
  if (design.spec.projectItems?.length) {
    let combined: ReturnType<typeof buildProjectCutList> | null = null;
    let problem: string | null = null;
    try {
      combined = buildProjectCutList(design.spec);
    } catch (error) {
      problem = error instanceof Error ? error.message : "The project cannot be cut yet.";
    }
    return (
      <main className="mx-auto max-w-5xl space-y-5 p-3 @lg/ws:p-6 print:max-w-none print:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link href={`/studio?design=${encodeURIComponent(design.slug)}`}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <ArrowLeft className="size-4" aria-hidden /> Edit project
          </Link>
          {combined ? <a href={`/api/studio/designs/${design.slug}/cut-list`}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
            <FileSpreadsheet className="size-4" aria-hidden /> Download combined Excel
          </a> : null}
          <PrintButton />
        </div>
        <header className="border-b pb-3">
          <h1 className="text-xl font-semibold">Combined cabinet cut list — {design.title}</h1>
          <p className="text-sm text-muted-foreground">
            {design.spec.projectItems.length + 1} independent cabinet designs ·
            materials and specifications retained per design
          </p>
        </header>
        {problem ? <div role="alert" className="rounded-lg border border-destructive p-4 text-sm">
          {problem}. Fix the affected cabinet in the project editor, then export again.
        </div> : combined ? (
          <>
            <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Cabinet designs" value={String(combined.designs)} />
              <Stat label="Cut pieces" value={String(combined.pieces)} />
              <Stat label="Board materials" value={String(combined.sheets.length)} />
            </section>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse text-xs">
                <thead><tr className="border-b text-left">
                  <th className="p-2">Design</th><th className="p-2">Part ID</th>
                  <th className="p-2">Cabinet</th><th className="p-2">Part</th>
                  <th className="p-2">Board</th><th className="p-2">L × W × T (mm)</th>
                  <th className="p-2">Qty</th><th className="p-2">Banding</th>
                </tr></thead>
                <tbody>{combined.rows.map((row, index) => <tr key={index} className="border-b">
                  <td className="p-2">{row.design}</td><td className="p-2">{row.partId}</td>
                  <td className="p-2">{row.cabinet}</td><td className="p-2">{row.label}</td>
                  <td className="p-2">{row.board}</td>
                  <td className="p-2">{row.length} × {row.width} × {row.thickness}</td>
                  <td className="p-2">{row.quantity}</td><td className="p-2">{row.banding}</td>
                </tr>)}</tbody>
              </table>
            </div>
            <section className="space-y-2">
              <h2 className="font-semibold">Board totals</h2>
              <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">
                <thead><tr className="border-b text-left">
                  <th className="p-2">Board</th><th className="p-2">Pieces</th>
                  <th className="p-2">Area</th><th className="p-2">Sheets</th>
                </tr></thead>
                <tbody>{combined.sheets.map(board => <tr key={board.board} className="border-b">
                  <td className="p-2">{board.board}</td><td className="p-2">{board.pieces}</td>
                  <td className="p-2">{board.area} m²</td><td className="p-2">{board.sheets}</td>
                </tr>)}</tbody>
              </table></div>
              <p className="text-xs text-muted-foreground">
                Matching material sheets are shared across designs when nesting reduces
                the sheet count. Total saved versus separate plans:{" "}
                {combined.sheets.reduce((sum, board) => sum + board.separateSheets - board.sheets, 0)} sheets.
                The Excel file includes exact cutting positions, hardware schedules,
                and per-design summaries. Other materials remain separate.
              </p>
            </section>
          </>
        ) : null}
      </main>
    );
  }

  // Whether it can be cut at all, before anything is priced.
  //
  // `buildExport` throws for a design with a panel too big for any stocked
  // sheet, and this page used to call it and nothing else — so the whole page
  // returned a 500 and the reader got "Something went wrong" with a reference
  // number. The information needed to explain it was already computed and
  // thrown away with the exception: `buildCutList` records exactly which
  // pieces will not fit and why, and the sheet diagram has known how to show
  // that for as long as it has existed. Asking first is the whole fix.
  const parts = buildParts(design.spec);
  const draft = buildCutList(design.spec, parts);

  if (!draft.buildable) {
    return <CannotBeCut design={design} cutList={draft} />;
  }

  const rates = await marketRates();
  const { cutList, cost } = buildExport({
    spec: design.spec,
    rates,
    preparedFor: design.owner.name,
  });

  const money = (value: number) =>
    `${cost.currency} ${Math.round(value).toLocaleString("en-US")}`;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5 p-3 @lg/ws:p-6 print:max-w-none print:px-2 print:py-0">
      {/* Everything in here is screen furniture, and none of it belongs on
          a sheet of paper going to a workshop. */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link
          href={`/designs/${design.slug}`}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:underline"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to the design
        </Link>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a
            href={`/api/studio/designs/${design.slug}/cut-list`}
            className="flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            <FileSpreadsheet className="size-4" aria-hidden />
            Excel
          </a>
          <PrintButton />
        </div>
      </div>

      <header className="space-y-1 border-b pb-3">
        <h1 className="text-xl font-semibold">{design.title}</h1>
        <p className="text-sm text-muted-foreground">
          {design.spec.envelope.width} × {design.spec.envelope.height} ×{" "}
          {design.spec.envelope.depth} mm · {allBays(design.spec).length} bays ·{" "}
          {design.spec.finish.colour}, {design.spec.finish.sheen}
        </p>
        <p className="text-xs text-muted-foreground">
          Cut list produced {new Date().toLocaleDateString("en-GB")} for{" "}
          {design.owner.name} · {host()}/designs/{design.slug}
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 @lg/ws:grid-cols-4">
        <Stat label="Panels" value={String(cutList.totals.pieces)} />
        <Stat label="Board" value={`${cutList.totals.area} m²`} />
        <Stat label="Banding" value={`${cutList.totals.bandMetres} m`} />
        <Stat label="Shop days" value={String(cost.productionDays)} />
      </section>

      {cutList.byBoard.map((board) => (
        <section key={board.boardId} className="break-inside-avoid">
          <h2 className="mb-2 text-sm font-medium">
            {board.boardLabel}
            <span className="ml-2 font-normal text-muted-foreground">
              {board.pieces} pieces · {board.area} m² · {board.sheets}{" "}
              {board.sheets === 1 ? "sheet" : "sheets"}
            </span>
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              {/* `thead` repeats on every printed page in every browser that
                  has ever supported printing a table. A shop sheet whose
                  second page has no headers is a shop sheet somebody misreads. */}
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">#</th>
                  <th className="py-1.5 pr-2 font-medium">Part ID</th>
                  <th className="py-1.5 pr-2 font-medium">Part</th>
                  <th className="py-1.5 pr-2 font-medium">Cabinet / module</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Length</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Width</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Qty</th>
                  <th className="py-1.5 pr-2 font-medium">Edge banding</th>
                  <th className="py-1.5 font-medium">Grain</th>
                </tr>
              </thead>
              <tbody>
                {board.rows.map((row) => (
                  <tr key={row.index} className="border-b last:border-b-0">
                    <td className="py-1.5 pr-2 tabular-nums text-muted-foreground">
                      {row.index}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-xs whitespace-nowrap">{row.partId}</td>
                    <td className="py-1.5 pr-2">{row.label}</td>
                    <td className="py-1.5 pr-2 text-xs text-muted-foreground">{[row.cabinet, row.module].filter(Boolean).join(" · ")}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {row.length}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {row.width}
                    </td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {row.quantity}
                    </td>
                    <td className="py-1.5 pr-2">{row.banding}</td>
                    <td className="py-1.5">
                      {row.grainLocked ? "Do not rotate" : "Any"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      {/* The layout. This is the page that replaces "about 9 sheets" with a
          picture of where each panel comes from. */}
      <section className="space-y-6">
        <h2 className="text-sm font-medium">Sheet layout</h2>
        {cutList.byBoard.map((board) => (
          <BoardSheets key={board.boardId} nesting={board.nesting} />
        ))}
      </section>

      <section className="break-inside-avoid">
        <h2 className="mb-2 text-sm font-medium">Hardware</h2>
        <ul className="space-y-1 text-sm">
          {cost.lines
            .filter((line) => line.group === "hardware")
            .map((line) => (
              <li key={line.id} className="flex justify-between gap-3 border-b py-1.5">
                <span>
                  {line.label}
                  {line.note ? (
                    <span className="text-muted-foreground"> — {line.note}</span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums">
                  {line.quantity} {line.unit}
                </span>
              </li>
            ))}
        </ul>
      </section>

      <section className="break-inside-avoid rounded-lg border p-3 print:rounded-none">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Estimated price</span>
          <span className="text-lg font-semibold tabular-nums">
            {money(cost.price)}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {money(cost.productionCost)} to make plus {cost.margin.percent}%
          margin. {Math.round(cost.confidence)}% of it is priced from live
          supplier listings; the rest is estimated from catalogue rates. This is
          an estimate produced from a design, not a quotation.
        </p>
      </section>

      {cutList.notes.length > 0 ? (
        <section className="break-inside-avoid text-xs text-muted-foreground">
          <h2 className="mb-1 text-sm font-medium text-foreground">Notes</h2>
          <ul className="space-y-1">
            {/* Keyed on position as well as text. The notes are free-form
                sentences with no id in the data model, and two of them can
                legitimately read the same — the validator emits one repair note
                per affected cabinet. Deduplicating at the source fixed the
                cause; this makes the list safe regardless of what reaches it. */}
            {cutList.notes.map((note, index) => (
              <li key={`${index}-${note}`}>· {note}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="print:hidden">
        <QuoteRequest designId={design.id} title={design.title} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-2.5 print:rounded-none">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

/**
 * What to show when the design cannot be cut.
 *
 * Not an error page. Nothing has gone wrong with the software: somebody has
 * designed a cabinet with a panel bigger than any sheet the yard stocks, which
 * is a thing a designer is allowed to do and a thing a workshop needs telling
 * about. So it names the pieces, says why each one will not fit, and sends
 * them back to the editor to make it smaller — which is the only action that
 * helps, and was previously behind a reference number and a Try again button
 * that did the same thing twice.
 */
function CannotBeCut({
  design,
  cutList,
}: {
  design: { slug: string; title: string };
  cutList: CutList;
}) {
  const stuck = cutList.byBoard.flatMap((board) =>
    board.nesting.unplaced.map((piece) => ({
      board: board.boardLabel,
      ...piece,
    })),
  );

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-3 @lg/ws:p-6">
      <Link
        href={`/designs/${design.slug}`}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to the design
      </Link>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{design.title}</h1>
        <p className="text-sm text-muted-foreground">
          This design cannot be cut from the sheets the yard stocks, so there is
          no cut list to print yet.
        </p>
      </header>

      {stuck.length > 0 && (
        <section className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <h2 className="text-sm font-medium">
            {stuck.length === 1
              ? "One piece will not fit a sheet"
              : `${stuck.length} pieces will not fit a sheet`}
          </h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {stuck.map((piece) => (
              <li key={`${piece.board}-${piece.index}-${piece.label}`}>
                · {piece.label} in {piece.board} — {piece.reason}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-muted-foreground">
        Make the piece smaller, or split the cabinet into two, and the cut list
        will come back on its own.
      </p>

      <Link
        href={`/studio?design=${design.slug}`}
        className="inline-flex h-10 items-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground"
      >
        Open in the studio
      </Link>
    </div>
  );
}
