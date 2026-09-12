import { redirect } from "next/navigation";

import { EditProfileForm } from "@/components/profile/edit-profile-form";
import { listAreas, serviceAreasFor } from "@/lib/data/professionals";
import { createClient } from "@/lib/supabase/server";

export default async function EditProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/dashboard");
  }

  const [areas, mine] = await Promise.all([
    listAreas(),
    serviceAreasFor(user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Edit profile
        </h1>
        <p className="text-muted-foreground">
          Keep your public profile up to date.
        </p>
      </div>
      <EditProfileForm
        profile={profile}
        areas={areas}
        serviceAreaSlugs={mine.map((a) => a.slug)}
      />
    </div>
  );
}
