import { findBoard } from "../../features/berchuma-studio/types/catalogue";

/** Owner-supplied sheet prices, 12 September 2026. Shared with Studio. */
export const BOARD_PRICE_LIST = [
  ["mdf-18-white", "MDF laminate — any colour"],
  ["mdf-18-uv", "MDF UV"],
  ["mdf-18-solid-uv", "Solid UV"],
  ["mdf-6-white", "6 mm MDF"],
].map(([id, label]) => {
  const board = findBoard(id)!;
  return {
    label,
    item: board.priceKey,
    price: board.fallbackRate,
    specification: `${label}; ${board.thickness} mm; ${board.sheet.length} × ${board.sheet.width} mm; price per sheet.`,
  };
});
