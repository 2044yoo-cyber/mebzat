import { findHardware } from "../types/catalogue";
import type { HardwareLine } from "../types/parts";
import type { DesignSpec } from "../types/spec";

/**
 * The purchasable LED length for a design.
 *
 * Enabled lighting with an omitted or zero metre value means "light the
 * wardrobe", not "order nothing". In that case the continuous front width is
 * the only defensible default. Keeping this calculation outside the cost UI
 * lets the same purchased line drive the hardware schedule, price and export.
 */
export function ledStripMetres(spec: DesignSpec): number {
  if (!spec.lighting?.ledStrip) return 0;
  const requested = spec.lighting.metres ?? 0;
  const metres = requested > 0 ? requested : spec.envelope.width / 1000;
  return Math.max(0.1, Math.round(metres * 100) / 100);
}

/** The exact purchased lighting item shared by parts, cost and cut-list. */
export function ledHardwareLine(spec: DesignSpec): HardwareLine | null {
  const metres = ledStripMetres(spec);
  if (metres <= 0) return null;

  const hardware =
    spec.hardware.find((item) => item.id === "led-strip") ??
    findHardware("led-strip");
  if (!hardware) return null;

  return {
    hardware,
    quantity: metres,
    note: `${spec.lighting?.colourTemperature ?? 3000}K interior lighting`,
  };
}
