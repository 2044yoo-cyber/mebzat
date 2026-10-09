import type { HouseProject } from "../types/project";
import { planSnapshot } from "./plan-snapshot";

/** Browser-only export: the same native geometry used by Agenda snapshots. */
export async function exportPlanImage(project: HouseProject) {
  const snapshot = planSnapshot(project, project.levels[0]!.id);
  const url = URL.createObjectURL(
    new Blob([snapshot.svg], { type: "image/svg+xml" }),
  );
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    const scale = Math.min(2400 / snapshot.width, 2400 / snapshot.height);
    canvas.width = Math.max(1, Math.round(snapshot.width * scale));
    canvas.height = Math.max(1, Math.round(snapshot.height * scale));
    canvas
      .getContext("2d")!
      .drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value ? resolve(value) : reject(new Error("Image export failed")),
        "image/png",
      ),
    );
    const download = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = download;
    link.download = "medosha_plan.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(download), 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
export function printPlan(project: HouseProject) {
  const popup = window.open("", "_blank");
  if (!popup)
    throw new Error("Allow the print window, then choose Save as PDF.");
  const snapshot = planSnapshot(project, project.levels[0]!.id);
  popup.document.open();
  popup.document.write(
    `<!doctype html><html><head><title>Medosha plan</title><style>@page{size:A4 landscape;margin:12mm}body{margin:0}svg{width:100%;height:90vh}</style></head><body>${snapshot.svg}</body></html>`,
  );
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 250);
}
