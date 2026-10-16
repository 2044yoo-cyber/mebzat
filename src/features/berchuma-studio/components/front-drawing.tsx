export { frontDrawing, type FrontDrawingData } from "../services/front-drawing";
// The SVG on its own, for pages that are handed a drawing rather than a
// spec: importing it does not bring the geometry engine into the bundle.
export { FrontDrawing } from "./front-drawing-view";
