import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { ProjectForm } from "@/components/projects/project-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Create Project" };

export default async function NewProjectPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Showcase a project
        </h1>
        <p className="text-muted-foreground">
          Add photos and details to publish this project to your portfolio.
        </p>
      </div>
      <ProjectForm userId={user.id} />
    </div>
  );
}
