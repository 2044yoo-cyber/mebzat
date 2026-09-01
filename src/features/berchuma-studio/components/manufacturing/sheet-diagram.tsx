import type { BoardNesting, NestedSheet } from "../../services/nesting";

/**
 * One sheet, drawn to scale, with every part in the place it is cut from.
 *
 * This is the page a cutter puts on the saw. It is a server component and
 * plain SVG on purpose: no interactivity, no JavaScript, and it prints —
 * which is the state most of these end their life in.
 *
 * The viewBox is in millimetres, so a 2440 mm sheet is 2440 units wide and the
 * browser does the scaling. No conversion arithmetic means no conversion bugs.
 */

/** Millimetres of paper around the sheet, for the dimension labels. */
const MARGIN = 90;

export function SheetDiagram({
  nesting,
  sheet,
}: {
  nesting: BoardNesting;
  sheet: NestedSheet;
}) {
  const { length, width } = sheet;

  return (
    <figure className="break-inside-avoid">
      <svg
        viewBox={`${-MARGIN} ${-MARGIN} ${length + MARGIN * 2} ${width + MARGIN * 2}`}
        className="w-full"
        role="img"
        aria-label={`Sheet ${sheet.number} of ${nesting.sheets.length}, ${nesting.boardLabel}, ${sheet.placements.length} pieces, ${Math.round(sheet.utilisation * 100)} per cent used`}
      >
        {/* The sheet itself. */}
        <rect
          x={0}
          y={0}
          width={length}
          height={width}
          className="fill-muted/40 stroke-foreground/50"
          strokeWidth={4}
        />

        {sheet.placements.map((piece, index) => (
          <g key={`${piece.index}-${index}`}>
            <rect
              // SVG's y runs down and the sheet's runs up, so a piece at
              // y = 0 is drawn at the bottom. Flipping here rather than in the
              // packer keeps the packer's coordinates the ones a person would
              // measure with a tape from the bottom-left corner.
              x={piece.x}
              y={width - piece.y - piece.height}
              width={piece.width}
              height={piece.height}
              className="fill-background stroke-foreground/70"
              strokeWidth={3}
            />

            <text
              x={piece.x + piece.width / 2}
              y={width - piece.y - piece.height / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-foreground"
              // Scaled to the piece so a drawer side is still readable next to
              // a full-height gable, and clamped so a big panel's label does
              // not become a headline.
              fontSize={Math.max(
                26,
                Math.min(58, Math.min(piece.width, piece.height) * 0.3),
              )}
            >
              {piece.index}
            </text>

            {/* The size, only where it fits. A number printed across its own
                border is worse than no number. */}
            {piece.width > 260 && piece.height > 150 ? (
              <text
                x={piece.x + piece.width / 2}
                y={width - piece.y - piece.height / 2 + 46}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-muted-foreground"
                fontSize={30}
              >
                {Math.round(piece.rotated ? piece.height : piece.width)} ×{" "}
                {Math.round(piece.rotated ? piece.width : piece.height)}
                {piece.rotated ? " ↻" : ""}
              </text>
            ) : null}
          </g>
        ))}

        {/* Dimensions along the bottom and up the left. */}
        <text
          x={length / 2}
          y={width + 62}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={44}
        >
          {length} mm
        </text>
        <text
          x={-42}
          y={width / 2}
          textAnchor="middle"
          className="fill-muted-foreground"
          fontSize={44}
          transform={`rotate(-90 ${-42} ${width / 2})`}
        >
          {width} mm
        </text>
      </svg>

      <figcaption className="mt-1 text-center text-[11px] text-muted-foreground">
        Sheet {sheet.number} of {nesting.sheets.length} ·{" "}
        {sheet.placements.length}{" "}
        {sheet.placements.length === 1 ? "piece" : "pieces"} ·{" "}
        {Math.round(sheet.utilisation * 100)}% used
      </figcaption>
    </figure>
  );
}

/**
 * Every sheet for one board, with the totals a buyer needs.
 *
 * The offcut figure is the one that changed: it used to be a 15% allowance
 * typed into a constant, and it is now the share of the board actually bought
 * that no part is cut from. On the worked wardrobe the two disagree by a whole
 * sheet of HDF, in the direction that leaves a shop short.
 */
export function BoardSheets({ nesting }: { nesting: BoardNesting }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{nesting.boardLabel}</h3>
        <p className="text-xs text-muted-foreground">
          {nesting.sheets.length}{" "}
          {nesting.sheets.length === 1 ? "sheet" : "sheets"} of{" "}
          {nesting.sheet.length} × {nesting.sheet.width} mm ·{" "}
          {nesting.areaUsed} m² cut from {nesting.areaBought} m² ·{" "}
          {Math.round(nesting.offcut * 100)}% offcut
        </p>
      </div>

      {nesting.unplaced.length > 0 ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs">
          <p className="font-medium">
            {nesting.unplaced.length}{" "}
            {nesting.unplaced.length === 1 ? "piece does" : "pieces do"} not fit
            a sheet
          </p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {nesting.unplaced.map((piece) => (
              <li key={`${piece.index}-${piece.label}`}>
                · {piece.label} — {piece.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-4 @2xl/ws:grid-cols-2 print:grid-cols-2">
        {nesting.sheets.map((sheet) => (
          <SheetDiagram key={sheet.number} nesting={nesting} sheet={sheet} />
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Numbers match the cut list. Cuts run edge to edge in strips, which is
        how a panel saw works — take the horizontal cuts first, then the
        vertical ones within each strip. Allow {nesting.kerf} mm for the blade.
      </p>
    </section>
  );
}
