/**
 * Where each label's box goes, so no two overlap and none leaves the view.
 * The anchor stays where the part is; the box moves, and a leader line joins
 * them. Labels that cannot be placed without covering another are left out.
 */

export type LabelAnchor = { id: string; text: string; x: number; y: number };
export type LabelBox = LabelAnchor & { bx: number; by: number; w: number; h: number };

const HEIGHT = 22;
const GAP = 4;

export const labelWidth = (text: string) => Math.min(168, 16 + text.length * 6.4);

const overlaps = (a: { bx: number; by: number; w: number; h: number }, b: { bx: number; by: number; w: number; h: number }) =>
  a.bx < b.bx + b.w + GAP && a.bx + a.w + GAP > b.bx && a.by < b.by + b.h + GAP && a.by + a.h + GAP > b.by;

export function layoutLabels(anchors: LabelAnchor[], width: number, height: number): LabelBox[] {
  const placed: LabelBox[] = [];
  const order = [...anchors].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  for (const anchor of order) {
    const w = labelWidth(anchor.text);
    const candidates: { bx: number; by: number }[] = [];
    for (let step = 0; step < 14; step += 1) {
      const lift = 26 + step * (HEIGHT + GAP);
      candidates.push({ bx: anchor.x + 22, by: anchor.y - lift }, { bx: anchor.x - 22 - w, by: anchor.y - lift }, { bx: anchor.x + 22, by: anchor.y + lift - 26 + 8 }, { bx: anchor.x - 22 - w, by: anchor.y + lift - 26 + 8 });
    }
    const spot = candidates.find((c) => {
      const box = { ...c, w, h: HEIGHT };
      return box.bx >= 0 && box.by >= 0 && box.bx + w <= width && box.by + HEIGHT <= height && !placed.some((p) => overlaps(box, p));
    });
    if (spot) placed.push({ ...anchor, bx: spot.bx, by: spot.by, w, h: HEIGHT });
  }
  return placed;
}
