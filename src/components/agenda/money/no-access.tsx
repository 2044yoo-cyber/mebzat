import { Lock } from "lucide-react";

/**
 * Why this section is empty.
 *
 * Row-level security makes "there is no budget yet" and "you may not see the
 * budget" look identical: both are no rows. Saying the first when the second
 * is true sends somebody off to create a budget that already exists, and —
 * worse — teaches them the project has no cost control when it does.
 *
 * The permission is still enforced in the database. This only decides the
 * wording, from the same two functions the policies ask.
 */
export function NoMoneyAccess({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
      <Lock className="size-6 text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">{what} is not shared with you</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          Being on a project and seeing what it costs are two different
          permissions. Ask the client or an administrator to grant it in the
          project&rsquo;s directory.
        </p>
      </div>
    </div>
  );
}
