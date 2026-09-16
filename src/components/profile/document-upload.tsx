"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  removeProfileDocument,
  saveProfileDocument,
} from "@/app/(dashboard)/profile/edit/document-actions";
import { Button } from "@/components/ui/button";
import {
  MAX_DOCUMENT_BYTES,
  PROFILE_DOCUMENTS_BUCKET,
  type DocumentKind,
} from "@/lib/constants/profile-documents";
import { createClient } from "@/lib/supabase/client";

/**
 * A CV, or a portfolio, kept on the profile and offered on every application.
 *
 * ## Why it does not sit inside the profile form
 *
 * The form is one `<form action={...}>` and a file is not a form field here —
 * the bytes go straight from the browser to storage, as they do for avatars
 * and project images, and what the server records is a path. Putting the
 * upload inside the form would mean either routing ten megabytes through a
 * server action or holding a file in state until somebody presses Save and
 * losing it if they do not. So it saves itself, immediately, and says so.
 *
 * ## The filename is kept separately from the path
 *
 * The stored path is a UUID, because two people called their CV `cv.pdf` and
 * one bucket holds both. The name the employer sees is the name the file had
 * when it was chosen, which is the one with their own name in it.
 */

const LABELS: Record<DocumentKind, { title: string; hint: string }> = {
  cv: {
    title: "Your CV",
    hint: "PDF or Word, up to 10 MB. Offered on every job you apply for — upload it once.",
  },
  portfolio: {
    title: "Portfolio file",
    hint: "A PDF of your work. Employers see it only if you offer it with an application.",
  },
};

export function DocumentUpload({
  userId,
  kind,
  filename,
  updatedAt,
}: {
  userId: string;
  kind: DocumentKind;
  filename: string | null;
  updatedAt: string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [current, setCurrent] = useState(filename);
  const [savedAt, setSavedAt] = useState(updatedAt);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  const labels = LABELS[kind];

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > MAX_DOCUMENT_BYTES) {
      toast.error(`${file.name} is over 10 MB.`);
      return;
    }

    setBusy(true);
    const supabase = createClient();
    // The folder is the profile id, because that is what the storage policy
    // reads. A UUID in front of the name keeps two people's cv.pdf apart.
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${userId}/${kind}-${crypto.randomUUID()}-${safe}`;

    const { error } = await supabase.storage
      .from(PROFILE_DOCUMENTS_BUCKET)
      .upload(path, file, { contentType: file.type || undefined });

    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }

    const result = await saveProfileDocument(kind, path, file.name);
    setBusy(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }
    setCurrent(file.name);
    setSavedAt(new Date().toISOString());
    toast.success(kind === "cv" ? "CV saved" : "Portfolio saved");
  }

  function remove() {
    setBusy(true);
    startTransition(async () => {
      const result = await removeProfileDocument(kind);
      setBusy(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setCurrent(null);
      setSavedAt(null);
      toast.success("Removed");
    });
  }

  return (
    <div className="space-y-2 rounded-xl border p-4">
      <p className="text-sm font-medium">{labels.title}</p>

      {current ? (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-2 text-sm">
          <FileText className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">{current}</span>
          {savedAt && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {new Date(savedAt).toLocaleDateString()}
            </span>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{labels.hint}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.doc,.docx,image/jpeg,image/png,image/webp"
        onChange={(event) => void choose(event)}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Upload className="size-4" />
          )}
          {current ? "Replace" : "Upload"}
        </Button>
        {current && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={remove}
          >
            <Trash2 className="size-4" /> Remove
          </Button>
        )}
      </div>

      {current && (
        <p className="text-xs text-muted-foreground">{labels.hint}</p>
      )}
    </div>
  );
}
