"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { CheckCircle2, FileText, Loader2, Paperclip, X } from "lucide-react";
import { toast } from "sonner";

import { AiField } from "@/components/ai/writing/ai-field";
import {
  applyToJob,
  attachApplicationFile,
  withdrawApplication,
} from "@/app/jobs/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APPLICATION_STATUS_LABEL } from "@/lib/constants/community";
import { JOB_FILES_BUCKET, salaryPeriodLabel } from "@/lib/constants/jobs";
import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import { createClient } from "@/lib/supabase/client";
import type { ApplicantSnapshot } from "@/lib/data/jobs";
import type { JobApplication, JobFileKind } from "@/types/database.types";

/**
 * Applies for a job.
 *
 * The applicant is not asked to retype anything Medosha already knows. Their
 * name, city and years of experience come from the profile they have already
 * built and are shown as what the employer will see — not as editable fields,
 * because editing them here would create a second, divergent copy of a profile
 * that exists.
 *
 * What is asked for is what only this application can answer: why them, what
 * they would charge, and when they can start.
 */

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_FILES = 5;

function kindOf(file: File): JobFileKind {
  if (file.type.startsWith("image/")) return "image";
  if (/\.(dxf|dwg)$/i.test(file.name)) return "drawing";
  return "document";
}

export type ApplyFormProps = {
  jobId: string;
  currency: string;
  salaryPeriod: string;
  /** Project work asks for a proposal; a salaried role asks for a letter. */
  isProject: boolean;
  signedIn: boolean;
  isOwner: boolean;
  closed: boolean;
  existing: JobApplication | null;
  profile: ApplicantSnapshot | null;
};

export function ApplyForm({
  jobId,
  currency,
  salaryPeriod,
  isProject,
  signedIn,
  isOwner,
  closed,
  existing,
  profile,
}: ApplyFormProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [coverLetter, setCoverLetter] = useState(existing?.cover_letter ?? "");
  const [proposal, setProposal] = useState(existing?.proposal ?? "");
  const [cvUrl, setCvUrl] = useState(existing?.cv_url ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(
    existing?.portfolio_url ?? profile?.website ?? "",
  );
  const [salary, setSalary] = useState(
    existing?.expected_salary === null || existing?.expected_salary === undefined
      ? ""
      : String(existing.expected_salary),
  );
  const [availableFrom, setAvailableFrom] = useState(
    existing?.available_from ?? "",
  );
  const [availabilityNote, setAvailabilityNote] = useState(
    existing?.availability_note ?? "",
  );
  const [files, setFiles] = useState<
    { name: string; path: string; kind: JobFileKind; size: number }[]
  >([]);
  const [uploading, setUploading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(
    existing !== null && existing.status !== "withdrawn",
  );
  const [status, setStatus] = useState(existing?.status ?? "submitted");
  const [applicationId, setApplicationId] = useState(existing?.id ?? null);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (isOwner) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          This is your posting. Applications arrive in your notifications and on
          the applications page.
        </p>
        <Link
          href={`/jobs/${jobId}/applications`}
          className={buttonVariants({ className: "w-full" })}
        >
          See applications
        </Link>
      </div>
    );
  }

  if (closed && !applied) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        This job is no longer accepting applications.
      </p>
    );
  }

  if (!signedIn) {
    return (
      <div className="space-y-2">
        <Link
          href={`/login?redirect=${encodeURIComponent(`/jobs/${jobId}`)}`}
          className={buttonVariants({ size: "lg", className: "w-full" })}
        >
          Sign in to apply
        </Link>
        <p className="text-center text-xs text-muted-foreground">
          Your Medosha profile is your application. No CV needed.
        </p>
      </div>
    );
  }

  if (applied && !editing) {
    return (
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4">
        <p className="flex items-center gap-2 font-medium text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-4" />
          {APPLICATION_STATUS_LABEL[status] ?? "Submitted"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {status === "hired"
            ? "You have the job. The conversation with the employer is in your messages."
            : "The employer has it. You can update or withdraw it."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {status !== "hired" && (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                Update
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || !applicationId}
                onClick={() =>
                  startTransition(async () => {
                    if (!applicationId) return;
                    const result = await withdrawApplication(applicationId);
                    if (result.error) {
                      toast.error(result.error);
                      return;
                    }
                    setApplied(false);
                    toast.success("Application withdrawn");
                  })
                }
              >
                Withdraw
              </Button>
            </>
          )}
          <Link
            href="/jobs/applications"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            My applications
          </Link>
        </div>
      </div>
    );
  }

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (chosen.length === 0) return;

    if (files.length + chosen.length > MAX_FILES) {
      toast.error(`Up to ${MAX_FILES} files.`);
      return;
    }

    setUploading(true);
    const supabase = createClient();
    const added: typeof files = [];

    for (const file of chosen) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} is over 20 MB.`);
        continue;
      }
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${jobId}/${crypto.randomUUID()}-${safe}`;
      const { error: uploadError } = await supabase.storage
        .from(JOB_FILES_BUCKET)
        .upload(path, file, { contentType: file.type || undefined });

      if (uploadError) {
        toast.error(`${file.name}: ${uploadError.message}`);
        continue;
      }
      added.push({
        name: file.name,
        path,
        kind: kindOf(file),
        size: file.size,
      });
    }

    setFiles((current) => [...current, ...added]);
    setUploading(false);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // Snapshot before the transition: the fields stay editable while it runs.
    const pendingFiles = files;

    startTransition(async () => {
      const result = await applyToJob(jobId, {
        coverLetter: coverLetter.trim(),
        proposal: proposal.trim(),
        cvUrl: cvUrl.trim(),
        portfolioUrl: portfolioUrl.trim(),
        expectedSalary: salary.trim() ? Number(salary) : null,
        availableFrom: availableFrom || null,
        availabilityNote: availabilityNote.trim(),
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      const id = result.id ?? applicationId;
      if (id) {
        setApplicationId(id);
        // Files are recorded after the application exists, because the row
        // they hang off is what the policy checks.
        for (const file of pendingFiles) {
          await attachApplicationFile(id, {
            path: file.path,
            name: file.name,
            kind: file.kind,
            sizeBytes: file.size,
          });
        }
      }

      setApplied(true);
      setStatus("submitted");
      setEditing(false);
      setFiles([]);
      toast.success(editing ? "Application updated" : "Application sent");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {profile && (
        <div className="rounded-xl border bg-muted/40 p-3">
          <div className="flex items-center gap-2.5">
            <Image
              src={profile.avatarUrl || AVATAR_PLACEHOLDER}
              alt=""
              width={36}
              height={36}
              className="size-9 shrink-0 rounded-full border object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {profile.fullName ?? "Your profile"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[
                  profile.city,
                  profile.yearsExperience
                    ? `${profile.yearsExperience} years`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Add a city and your experience"}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            The employer sees this profile with your application.{" "}
            <Link href="/profile" className="underline">
              {profile.complete ? "Review it" : "Finish it first"}
            </Link>
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="apply-letter">
          {isProject ? "How you would approach it" : "Why you are a fit"}
        </Label>
        <AiField
          id="apply-letter"
          surface="professional"
          value={isProject ? proposal : coverLetter}
          maxLength={5000}
          onValueChange={(next) => {
            if (isProject) setProposal(next);
            else setCoverLetter(next);
            setError(null);
          }}
          placeholder={
            isProject
              ? "Your method, the sequence, what you would need from the client."
              : "Your relevant experience, in a few lines."
          }
          className="min-h-28"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="apply-salary">
          {isProject ? "Your price" : "Expected pay"} ({currency}{" "}
          {salaryPeriodLabel(salaryPeriod)})
        </Label>
        <Input
          id="apply-salary"
          type="number"
          min={0}
          step="any"
          value={salary}
          onChange={(event) => setSalary(event.target.value)}
          placeholder="Optional"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="apply-from">Can start</Label>
          <Input
            id="apply-from"
            type="date"
            value={availableFrom}
            onChange={(event) => setAvailableFrom(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="apply-note">Or in words</Label>
          <Input
            id="apply-note"
            maxLength={200}
            value={availabilityNote}
            onChange={(event) => setAvailabilityNote(event.target.value)}
            placeholder="Two weeks' notice"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="apply-cv">CV link</Label>
        <Input
          id="apply-cv"
          type="url"
          value={cvUrl}
          onChange={(event) => setCvUrl(event.target.value)}
          placeholder="Optional — https://…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="apply-portfolio">Portfolio link</Label>
        <Input
          id="apply-portfolio"
          type="url"
          value={portfolioUrl}
          onChange={(event) => setPortfolioUrl(event.target.value)}
          placeholder="Optional — https://…"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Attachments</Label>
        {files.length > 0 && (
          <ul className="space-y-1">
            {files.map((file) => (
              <li
                key={file.path}
                className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    setFiles((current) =>
                      current.filter((entry) => entry.path !== file.path),
                    )
                  }
                  className="text-muted-foreground transition-colors hover:text-destructive"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.dxf,image/jpeg,image/png,image/webp"
          onChange={upload}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading || files.length >= MAX_FILES}
          onClick={() => fileRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Paperclip className="size-4" />
          )}
          {uploading ? "Uploading…" : "Add a file"}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1" disabled={pending}>
          {pending ? "Sending…" : editing ? "Update application" : "Apply"}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
