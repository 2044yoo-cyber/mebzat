/**
 * Storey icons.
 *
 * Drawn, not photographed and not a sprite sheet: each option is its own
 * component so it stays sharp at any size, follows currentColor into the
 * selected state, and can be reused anywhere a storey count needs a glyph.
 *
 * The geometry is procedural rather than ten hand-drawn paths. Ten separate
 * drawings would drift — a roof pitched slightly differently here, a door two
 * pixels wider there — and the row only reads as a set if the set is exactly
 * consistent. So one primitive takes the floor count and derives everything.
 *
 * Houses up to five storeys, apartment blocks above. That is the reference's
 * own break, and it is the right one: a pitched roof on a nine-storey tower
 * reads as a drawing mistake rather than a building.
 */

const W = 64;
const H = 72;

/** Ground line, and the height the body is allowed to occupy. */
const BASE = 66;
const BODY_TOP_HOUSE = 26;
const BODY_TOP_FLAT = 14;

export type StoreyIconProps = {
  /** Total storeys, 1 to 10. G+N is storeys = N + 1. */
  storeys: number;
  className?: string;
};

export function StoreyIcon({ storeys, className }: StoreyIconProps) {
  const n = Math.min(10, Math.max(1, Math.round(storeys)));
  const isTower = n >= 6;

  // A tower is narrower than a house at the same width, which is most of what
  // makes it read as a tower rather than a very tall cottage.
  const halfWidth = isTower ? 17 : 21;
  const left = W / 2 - halfWidth;
  const right = W / 2 + halfWidth;

  const top = isTower ? BODY_TOP_FLAT : BODY_TOP_HOUSE;
  const bodyHeight = BASE - top;
  const floorHeight = bodyHeight / n;

  // Floor divisions, excluding the ground line itself.
  const divisions = Array.from({ length: n - 1 }, (_, i) => BASE - (i + 1) * floorHeight);

  // Windows only while they can still be squares rather than smudges.
  const windowSize = Math.min(5, floorHeight * 0.42);
  const showWindows = isTower && windowSize >= 2.2;
  const columns = [-9, 0, 9];

  const doorWidth = 9;
  const doorHeight = Math.min(11, floorHeight * 0.7);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      focusable="false"
    >
      {/* Body */}
      <path d={`M ${left} ${BASE} L ${left} ${top} L ${right} ${top} L ${right} ${BASE}`} />

      {isTower ? (
        // Flat roof slab, overhanging slightly so the silhouette is not a
        // plain rectangle at a glance.
        <path d={`M ${left - 4} ${top} L ${right + 4} ${top} M ${left - 4} ${top} L ${left - 4} ${top - 5} L ${right + 4} ${top - 5} L ${right + 4} ${top}`} />
      ) : (
        <path d={`M ${left - 5} ${top} L ${W / 2} ${top - 14} L ${right + 5} ${top}`} />
      )}

      {/* Ground */}
      <path d={`M ${left - 6} ${BASE} L ${right + 6} ${BASE}`} />

      {/* Floors */}
      {divisions.map((y) => (
        <path key={y} d={`M ${left} ${y} L ${right} ${y}`} />
      ))}

      {/* Windows, on every floor above the ground one */}
      {showWindows &&
        divisions.map((y, row) =>
          columns.map((dx) => (
            <rect
              key={`${row}-${dx}`}
              x={W / 2 + dx - windowSize / 2}
              y={y + (floorHeight - windowSize) / 2}
              width={windowSize}
              height={windowSize}
              strokeWidth={1.5}
            />
          )),
        )}

      {/* Door, on the ground floor of every building */}
      <path
        d={`M ${W / 2 - doorWidth / 2} ${BASE} L ${W / 2 - doorWidth / 2} ${BASE - doorHeight} L ${W / 2 + doorWidth / 2} ${BASE - doorHeight} L ${W / 2 + doorWidth / 2} ${BASE}`}
        strokeWidth={1.5}
      />
    </svg>
  );
}

/** The ten choices, in the order the filter shows them. */
export const STOREY_OPTIONS = Array.from({ length: 10 }, (_, i) => ({
  /** What the database holds: a total storey count. */
  storeys: i + 1,
  /** How Ethiopian listings are written: ground plus N above. */
  code: `G+${i}`,
  label:
    i === 9 ? "10 Storey Apartment" : `${i + 1} Storey`,
}));
