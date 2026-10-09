import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, Calculator, FileImage, Grid2X2, PaintRoller, Ruler, Upload, WandSparkles } from "lucide-react";
import { ImageTo3DImporter } from "@/features/house-designer/components/image-to-3d-importer";

export const metadata: Metadata = {
  title: "Image to 3D Floor Plan | Medosha",
  description: "Import DXF CAD vectors, PDF pages and floor-plan screenshots without AI. Review geometry and build editable 3D house plans.",
};

/**
 * No paid vision AI is required. The first stage uses deterministic browser
 * line detection on images or selected PDF pages. Users must calibrate and
 * review candidates before opening editable wall geometry in House Design.
 * Direct straight DXF geometry import is available; complex opening recognition remains future work.
 */
export default function ImageTo3DPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-36 pt-6 sm:px-6">
      <div className="space-y-2">
        <Link href="/design" className="text-sm font-medium text-brand hover:underline">← Back to Design</Link>
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-brand/10 p-3 text-brand"><FileImage className="size-7" /></div>
          <div>
            <h1 className="text-2xl font-bold">Image to 3D Floor Plan</h1>
            <p className="text-sm text-muted-foreground">No AI required · Built on Medosha House Design</p>
          </div>
        </div>
      </div>

      <ImageTo3DImporter />

      <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold">Start with an existing floor plan</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Upload a DXF CAD drawing, screenshot, floor-plan image or PDF above. DXF imports real vector lines from selected CAD layers, including saved drawing units when available. For images and PDFs, select the page and calibrate a known measurement. Review and correct walls, then continue to the editable House Design plan and 3D view.
          If the drawing is too complex for line detection, the existing <strong>Upload floor plan</strong> reference workflow remains available.
        </p>
        <Link href="/house-design" className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 font-semibold text-brand-foreground hover:opacity-90">
          <Upload className="size-5" /> Open floor-plan importer <ArrowRight className="size-4" />
        </Link>
        <p className="text-xs text-muted-foreground">
          Straight wall candidates are detected without AI; DXF LINE and POLYLINE entities can now be imported directly. Missing or angled segments can be corrected manually. Curved CAD geometry, doors, windows and difficult scans still need verification.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Conversion workflow</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { icon: Upload, title: "1. Import", text: "Upload DXF for CAD vector walls, or use a PDF/image for line detection." },
            { icon: Ruler, title: "2. Set scale", text: "Use DXF drawing units when known; otherwise measure one known length." },
            { icon: Grid2X2, title: "3. Verify geometry", text: "Trace walls and confirm closed rooms, openings and dimensions." },
            { icon: Building2, title: "4. View 3D", text: "Generate an editable house model from the verified floor plan." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3 rounded-xl border bg-card p-3">
              <Icon className="mt-0.5 size-5 shrink-0 text-brand" />
              <div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border bg-card p-4 sm:p-6">
        <div className="flex items-center gap-2"><Calculator className="size-5 text-brand" /><h2 className="text-lg font-semibold">Future inspection & quantity estimates</h2></div>
        <p className="text-sm text-muted-foreground">
          After geometry and room dimensions are verified, the same floor plan can support
          measurements for finishing work and a bill of quantities.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Grid2X2 className="size-4 text-brand" /> Floor area (m²)</div>
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm"><Ruler className="size-4 text-brand" /> Floor tiles (m² + waste)</div>
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm"><PaintRoller className="size-4 text-brand" /> Paintable wall area (m²)</div>
          <div className="flex items-center gap-2 rounded-lg border p-3 text-sm"><WandSparkles className="size-4 text-brand" /> Material and labor estimates</div>
        </div>
        <p className="text-xs text-muted-foreground">
          Estimating requires confirmed room boundaries, wall height, door/window openings,
          material rates and waste allowances. Automatic takeoff from unverified uploads is not implemented yet.
        </p>
      </section>
    </main>
  );
}
