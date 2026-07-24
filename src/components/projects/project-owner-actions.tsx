"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteProject } from "@/app/(dashboard)/projects/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ProjectOwnerActions({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteProject(projectId);
      } catch {
        toast.error("Could not delete project");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/projects/${projectId}/edit`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <Pencil className="size-4" /> Edit
      </Link>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={<Button variant="outline" size="sm" />}
        >
          <Trash2 className="size-4" /> Delete
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this project?</DialogTitle>
            <DialogDescription>
              This permanently removes the project and its images. This can&apos;t
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={handleDelete}
            >
              {pending ? "Deleting…" : "Delete project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
