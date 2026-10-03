import { propertyImageLabel } from "@/lib/property/sample-images";

export function PropertyImageNote({ src }: { src?: string | null }) {
  const label = propertyImageLabel(src);
  if (!label) return null;
  return <span title="Illustrative image, not a photograph of the listed property" className="pointer-events-none absolute bottom-2 left-2 max-w-[90%] rounded bg-black/75 px-1.5 py-1 text-[10px] leading-tight text-white">{label}</span>;
}
