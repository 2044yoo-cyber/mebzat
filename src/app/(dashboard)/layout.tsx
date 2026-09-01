import { DashboardNav } from "@/components/layout/dashboard-nav";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // No redirect here, and that is the change.
  //
  // This layout used to send every signed-out visitor to /login, which gated
  // the whole route group — including /products, /projects, /directory and
  // /map. Those are the pages somebody arrives on from a shared link, and they
  // are the reason anybody finds Medosha at all. Nobody decided they should
  // require an account; they were simply in this folder.
  //
  // Pages that genuinely need a session now say so themselves with
  // `requireViewer()`. That makes the decision visible on each page rather
  // than inherited from where a file happens to sit, and a new public page
  // added here is public by default instead of accidentally walled off.
  const profile = user
    ? (
        await supabase
          .from("profiles")
          .select("full_name, avatar_url")
          .eq("id", user.id)
          .single()
      ).data
    : null;

  return (
    <div className="flex min-h-full flex-col">
      <DashboardNav
        profile={
          user
            ? {
                fullName: profile?.full_name ?? null,
                email: user.email ?? null,
                avatarUrl: profile?.avatar_url ?? null,
              }
            : null
        }
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
