"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { deleteJob, publishJob, setJobStatus } from "@/app/jobs/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/types/database.types";

/**
 * What an employer can do to a posting from the list.
 *
 * Deliberately not a dropdown of every status. A job has one obvious next move
 * — publish a draft, close a live role, reopen a closed one — and offering
 * "filled" as a manual choice would let it disagree with the hires that
 * actually filled it.
 */

const BADGE: Record<JobStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  open: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  filled: "bg-brand/10 text-brand",
  closed: "bg-muted text-muted-foreground",
};

const LABEL: Record<JobStatus, string> = {
  draft: "Draft",
  open: "Live",
  filled: "Filled",
  closed: "Closed",
};

export function JobStatusMenu({
  jobId,
  status,
}: {
  jobId: string;
  status: JobStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(work: () => Promise<{ error?: string }>, done: string) {
    startTransition(async () => {
      const result = await work();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      <span
        className={cn(
          "rounded-full px-2.5 py-1 text-xs font-medium",
          BADGE[status],
        )}
      >
        {LABEL[status]}
      </span>

      {status === "draft" && (
        <>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => publishJob(jobId), "Job published")}
          >
            Publish
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (
                !window.confirm(
                  "Delete this draft? Nothing has been published, so nobody has seen it.",
                )
              ) {
                return;
              }
              run(() => deleteJob(jobId), "Draft deleted");
            }}
          >
            Delete
          </Button>
        </>
      )}

      {(status === "open" || status === "filled") && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              () => setJobStatus(jobId, "closed"),
              "Closed to new applications",
            )
          }
        >
          Close
        </Button>
      )}

      {status === "closed" && (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setJobStatus(jobId, "open"), "Reopened")}
        >
          Reopen
        </Button>
      )}
    </div>
  );
}
