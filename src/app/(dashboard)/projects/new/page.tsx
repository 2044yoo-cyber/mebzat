import type { Metadata } from "next";
import { FolderKanban } from "lucide-react";

import { ComingSoon } from "@/components/dashboard/coming-soon";

export const metadata: Metadata = { title: "Create Project" };

export default function NewProjectPage() {
  return (
    <ComingSoon
      icon={FolderKanban}
      title="Project showcases are on the way"
      description="Soon you'll be able to publish projects with photos, drawings, and progress updates to showcase your work across Medosha."
    />
  );
}
