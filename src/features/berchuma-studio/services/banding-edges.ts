/**
 * Which sides of a panel on the cutting plan carry edge banding.
 *
 * The cut list states banding in words (see `describeBanding`): "All four
 * edges", "Front + back", "Front + both ends", "One end", and so on. Front and
 * back are the two long edges (the ones that run along the part's length) and
 * the ends are the two short ones. The nester lays a panel with its length
 * along the sheet's x axis, and turns it a quarter turn when `rotated`.
 *
 * Only what the words fix is drawn. "Front" alone is one of the two long
 * edges, but the words do not say which one on the sheet, so it is reported as
 * ambiguous and left undrawn rather than guessed. Anything the cut list does
 * not say in these words is `recognised: false`: no side is drawn for it.
 */

export type BandedSides = {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
  /** Banding that is stated but whose position on the sheet is not fixed, in words. */
  ambiguous: string[];
  /** False when the text is not the cut list's own vocabulary. */
  recognised: boolean;
};

const NONE: BandedSides = { top: false, bottom: false, left: false, right: false, ambiguous: [], recognised: true };

export function bandedSides(banding: string, rotated: boolean): BandedSides {
  const text = banding.trim().toLowerCase();
  if (text === "" || text === "—" || text === "-") return { ...NONE };
  const tokens = text.split("+").map((token) => token.trim());
  let allFour = false;
  let longEdges = 0;
  let endEdges = 0;
  for (const token of tokens) {
    if (token === "all four edges") allFour = true;
    else if (token === "front" || token === "back") longEdges += 1;
    else if (token === "both ends") endEdges += 2;
    else if (token === "one end") endEdges += 1;
    else return { ...NONE, recognised: false };
  }
  if (allFour) {
    if (tokens.length !== 1) return { ...NONE, recognised: false };
    return { top: true, bottom: true, left: true, right: true, ambiguous: [], recognised: true };
  }
  if (longEdges > 2 || endEdges > 2) return { ...NONE, recognised: false };
  // Long edges run along the length: horizontal when laid as cut, vertical when turned.
  const sides: BandedSides = { ...NONE, ambiguous: [] };
  if (longEdges === 2) {
    if (rotated) { sides.left = true; sides.right = true; } else { sides.top = true; sides.bottom = true; }
  } else if (longEdges === 1) sides.ambiguous.push("one long edge");
  if (endEdges === 2) {
    if (rotated) { sides.top = true; sides.bottom = true; } else { sides.left = true; sides.right = true; }
  } else if (endEdges === 1) sides.ambiguous.push("one end");
  return sides;
}
