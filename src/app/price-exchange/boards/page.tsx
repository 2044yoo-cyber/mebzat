import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BOARD_PRICE_LIST } from "@/lib/constants/board-price-list";
import { BoardPriceForm } from "./form";

export const metadata = { title: "Publish board prices" };

export default async function BoardPricesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/price-exchange/boards");
  const { data: profile } = await supabase.from("profiles")
    .select("full_name, username").eq("id", user.id).maybeSingle();

  return (
    <div className="mx-auto max-w-2xl space-y-5 p-4">
      <h1 className="text-2xl font-semibold">Publish board prices</h1>
      <p className="text-sm text-muted-foreground">
        Posting as <strong>{profile?.full_name ?? "your account"}{profile?.username ? ` (@${profile.username})` : ""}</strong>.
        These prices will be visible in Material Exchange. Existing matching sheet prices owned by this account will be updated.
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted"><tr><th className="p-3">Material</th><th className="p-3 text-right">ETB / sheet</th></tr></thead>
          <tbody>{BOARD_PRICE_LIST.map((row) => <tr key={row.item} className="border-t"><td className="p-3">{row.label}<p className="text-xs text-muted-foreground">{row.specification}</p></td><td className="p-3 text-right tabular-nums">{row.price.toLocaleString("en-US")}</td></tr>)}</tbody>
        </table>
      </div>
      <BoardPriceForm />
    </div>
  );
}
