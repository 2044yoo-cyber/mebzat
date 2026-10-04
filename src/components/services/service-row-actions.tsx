"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BarChart3, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteService,
  setServiceStatus,
  setWorkStatus,
} from "@/app/(dashboard)/dashboard/services/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { WORK_STATUS, WORK_STATUSES } from "@/lib/constants/services";
import { cn } from "@/lib/utils";
import type { ListingStatus, WorkStatus } from "@/types/database.types";

/**
 * Per-service controls in the management list.
 *
 * Pausing archives rather than deletes: the analytics, portfolio and past bids
 * attached to a service stay meaningful, and a paused service can come back.
 * Deleting asks twice, because it cannot.
 */
export function ServiceRowActions({
  serviceId,
  status,
  workStatus: initialWork,
}: {
  serviceId: string;
  status: ListingStatus;
  workStatus: WorkStatus;
}) {
  const router = useRouter();
  const [work, setWork] = useState<WorkStatus>(initialWork);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const paused = status !== "published";

  function changeWork(next: WorkStatus) {
    const previous = work;
    setWork(next);
    startTransition(async () => {
      const result = await setWorkStatus(serviceId, next);
      if (result.error) {
        setWork(previous);
        toast.error(result.error);
        return;
      }
      toast.success(`Now ${WORK_STATUS[next].label.toLowerCase()}`);
      router.refresh();
    });
  }

  function togglePause() {
    startTransition(async () => {
      const result = await setServiceStatus(
        serviceId,
        paused ? "published" : "archived",
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(paused ? "Service resumed" : "Service paused");
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteService(serviceId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Service deleted");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={work}
        onChange={(event) => changeWork(event.target.value as WorkStatus)}
        disabled={pending}
        aria-label="Availability"
        className="h-8 rounded-lg border bg-transparent px-2 text-sm"
      >
        {WORK_STATUSES.map((value) => (
          <option key={value} value={value}>
            {WORK_STATUS[value].label}
          </option>
        ))}
      </select>

      {/* Navigation, so these are links wearing the button's clothes rather
          than buttons pretending to navigate. Base UI's Button asserts it is
          rendering a native <button>, which an anchor is not. */}
      <Link
        href={`/dashboard/services/${serviceId}/analytics`}
        className={buttonVariants({ size: "sm", variant: "outline" })}
      >
        <BarChart3 className="size-3.5" />
        Analytics
      </Link>

      <Link
        href={`/dashboard/services/${serviceId}/edit`}
        className={buttonVariants({ size: "sm", variant: "outline" })}
      >
        <Pencil className="size-3.5" />
        Edit
      </Link>

      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={togglePause}
      >
        {paused ? (
          <>
            <Play className="size-3.5" /> Resume
          </>
        ) : (
          <>
            <Pause className="size-3.5" /> Pause
          </>
        )}
      </Button>

      {confirming ? (
        <span className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={remove}
          >
            Delete for good
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(false)}
          >
            Cancel
          </Button>
        </span>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className={cn("text-muted-foreground")}
          onClick={() => setConfirming(true)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
