"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteProduct } from "@/app/(dashboard)/products/actions";
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

export function ProductOwnerActions({ productId }: { productId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteProduct(productId);
      } catch {
        toast.error("Could not delete product");
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/products/${productId}/edit`}
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <Pencil className="size-4" /> Edit
      </Link>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Trash2 className="size-4" /> Delete
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this product?</DialogTitle>
            <DialogDescription>
              This permanently removes the product and its images. This
              can&apos;t be undone.
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
              {pending ? "Deleting…" : "Delete product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
