"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { acceptInvite } from "@/app/(dashboard)/projects/[id]/agenda/actions";

/** Accepting an invitation to a project's private record. */
export function AcceptInvite({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await acceptInvite(projectId);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("You are in.");
          router.refresh();
        })
      }
      className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
    >
      {pending && <Loader2 className="size-4 animate-spin" />}
      Accept and open the Agenda
    </button>
  );
}
