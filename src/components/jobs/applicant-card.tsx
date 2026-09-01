"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  BadgeCheck,
  CalendarPlus,
  Check,
  FileText,
  Handshake,
  MapPin,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  hireApplicant,
  scheduleInterview,
  setApplicationStatus,
} from "@/app/jobs/actions";
import { MessageButton } from "@/components/messages/message-button";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { APPLICATION_STATUS_LABEL } from "@/lib/constants/community";
import { APPLICATION_PIPELINE, salaryPeriodLabel } from "@/lib/constants/jobs";
import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { ApplicationRow } from "@/lib/data/jobs";
import type { ApplicationStatus } from "@/types/database.types";

/**
 * One applicant, and everything the employer can do about them.
 *
 * The pipeline is a row of stages rather than a dropdown, because the useful
 * question is "where is this person" and a dropdown hides the answer behind a
 * click. Hiring is not one of those stages: it opens a small form, because it
 * agrees an amount and a start date and then creates a conversation, and a
 * one-click hire beside "shortlisted" would be far too easy to press.
 */

const MOVABLE: ApplicationStatus[] = [
  "reviewing",
  "shortlisted",
  "interviewing",
  "offered",
];

/**
 * Where a status sits in the pipeline, or -1 for the ones that leave it.
 * "Rejected" and "withdrawn" are not late stages, they are exits.
 */
function stageIndex(status: ApplicationStatus): number {
  return (APPLICATION_PIPELINE as readonly string[]).indexOf(status);
}

export function ApplicantCard({
  application,
  currency,
  salaryPeriod,
  jobTitle,
  signedUrls,
}: {
  application: ApplicationRow;
  currency: string;
  salaryPeriod: string;
  jobTitle: string;
  signedUrls: Record<string, string>;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(application.status);
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<"none" | "interview" | "hire">("none");

  const [when, setWhen] = useState("");
  const [mode, setMode] = useState("Site visit");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");

  const [amount, setAmount] = useState(
    application.expected_salary === null
      ? ""
      : String(application.expected_salary),
  );
  const [startsOn, setStartsOn] = useState("");

  const applicant = application.applicant;
  const name =
    applicant?.full_name ?? applicant?.company_name ?? "Medosha member";
  const hired = application.hire !== null || status === "hired";
  const finished = hired || status === "rejected" || status === "withdrawn";

  function move(next: ApplicationStatus) {
    startTransition(async () => {
      const result = await setApplicationStatus(application.id, next);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setStatus(next);
      toast.success(`Moved to ${APPLICATION_STATUS_LABEL[next] ?? next}`);
      router.refresh();
    });
  }

  function arrange() {
    startTransition(async () => {
      const result = await scheduleInterview(application.id, {
        scheduledAt: when ? new Date(when).toISOString() : null,
        mode,
        location: place,
        note,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setStatus("interviewing");
      setPanel("none");
      toast.success("Interview proposed — they have been told");
      router.refresh();
    });
  }

  function hire() {
    startTransition(async () => {
      const result = await hireApplicant(application.id, {
        amount: amount.trim() ? Number(amount) : null,
        currency,
        period: salaryPeriod,
        startsOn: startsOn || null,
      });
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setStatus("hired");
      setPanel("none");
      toast.success(`${name} hired — a conversation is open in Messages`);
      router.refresh();
    });
  }

  return (
    <li
      className={cn(
        "rounded-2xl border bg-card p-5",
        hired && "border-emerald-500/40",
        status === "withdrawn" && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <Image
          src={applicant?.avatar_url || AVATAR_PLACEHOLDER}
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 rounded-full border object-cover"
        />

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 font-medium leading-snug">
            {applicant?.username ? (
              <Link href={`/u/${applicant.username}`} className="hover:underline">
                {name}
              </Link>
            ) : (
              name
            )}
            {applicant?.verification_status === "verified" && (
              <BadgeCheck className="size-4 text-brand" aria-label="Verified" />
            )}
          </p>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {applicant?.location_city && (
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" />
                {applicant.location_city}
              </span>
            )}
            {applicant?.years_experience ? (
              <span>{applicant.years_experience} years</span>
            ) : null}
            <span>Applied {formatRelativeTime(application.created_at)}</span>
          </div>
        </div>

        <span
          className={cn(
            "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
            hired
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {APPLICATION_STATUS_LABEL[status] ?? status}
        </span>
      </div>

      {(application.cover_letter || application.proposal) && (
        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {application.proposal || application.cover_letter}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        {application.expected_salary !== null && (
          <span>
            Asks{" "}
            <span className="font-medium tabular-nums">
              {currency}{" "}
              {Number(application.expected_salary).toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}
            </span>{" "}
            <span className="text-muted-foreground">
              {salaryPeriodLabel(salaryPeriod)}
            </span>
          </span>
        )}
        {(application.available_from || application.availability_note) && (
          <span className="text-muted-foreground">
            Available{" "}
            {application.available_from
              ? new Date(application.available_from).toLocaleDateString("en-GB")
              : application.availability_note}
          </span>
        )}
        {application.cv_url && (
          <a
            href={application.cv_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            CV
          </a>
        )}
        {application.portfolio_url && (
          <a
            href={application.portfolio_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline"
          >
            Portfolio
          </a>
        )}
      </div>

      {application.attachments.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {application.attachments.map((file) => {
            const href = signedUrls[file.url];
            return (
              <li key={file.id}>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm transition-colors hover:border-brand"
                  >
                    <FileText className="size-3.5" />
                    {file.name}
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm text-muted-foreground">
                    <FileText className="size-3.5" />
                    {file.name}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {application.interviews.length > 0 && (
        <div className="mt-3 rounded-lg border border-dashed p-3 text-sm">
          {application.interviews.map((interview) => (
            <p key={interview.id} className="text-muted-foreground">
              {interview.mode ?? "Interview"}
              {interview.scheduled_at
                ? ` · ${new Date(interview.scheduled_at).toLocaleString("en-GB")}`
                : " · time to be agreed"}
              {interview.location ? ` · ${interview.location}` : ""}
            </p>
          ))}
        </div>
      )}

      {!finished && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {MOVABLE.map((stage) => (
            <button
              key={stage}
              type="button"
              disabled={pending || stage === status}
              aria-pressed={stage === status}
              onClick={() => move(stage)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-sm transition-colors disabled:opacity-100",
                stage === status
                  ? "border-brand bg-brand text-brand-foreground"
                  : "hover:border-brand hover:bg-brand/5",
                // A stage already passed is dimmed rather than hidden, so the
                // path somebody took is still readable.
                stageIndex(stage) < stageIndex(status) && "text-muted-foreground",
              )}
            >
              {APPLICATION_STATUS_LABEL[stage] ?? stage}
            </button>
          ))}

          <span className="mx-1 h-5 w-px bg-border" aria-hidden />

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setPanel(panel === "interview" ? "none" : "interview")}
          >
            <CalendarPlus className="size-4" />
            Interview
          </Button>

          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => setPanel(panel === "hire" ? "none" : "hire")}
          >
            <Handshake className="size-4" />
            Hire
          </Button>

          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => move("rejected")}
          >
            <X className="size-4" />
            Not this time
          </Button>

          <div className="ml-auto">
            <MessageButton
              userId={application.applicant_id}
              contextType="job"
              contextId={application.job_id}
              subject={jobTitle}
              size="sm"
            />
          </div>
        </div>
      )}

      {hired && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <Check className="size-4" />
            Hired
          </p>
          {application.hire?.conversation_id && (
            <Link
              href={`/messages/${application.hire.conversation_id}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Open the conversation
            </Link>
          )}
        </div>
      )}

      {panel === "interview" && (
        <div className="mt-4 space-y-3 rounded-xl border p-4">
          <p className="text-sm font-medium">Propose an interview</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`when-${application.id}`}>When</Label>
              <Input
                id={`when-${application.id}`}
                type="datetime-local"
                value={when}
                onChange={(event) => setWhen(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`mode-${application.id}`}>How</Label>
              <Input
                id={`mode-${application.id}`}
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                placeholder="Site visit, office, video call"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`place-${application.id}`}>Where</Label>
              <Input
                id={`place-${application.id}`}
                value={place}
                onChange={(event) => setPlace(event.target.value)}
                placeholder="Bole, near Friendship — or a meeting link"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={`note-${application.id}`}>Anything to bring</Label>
              <Input
                id={`note-${application.id}`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Optional"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={arrange}>
              Send the invitation
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setPanel("none")}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {panel === "hire" && (
        <div className="mt-4 space-y-3 rounded-xl border border-brand/40 bg-brand/5 p-4">
          <p className="text-sm font-medium">Hire {name}</p>
          <p className="text-sm text-muted-foreground">
            This records the agreement, tells them, and opens a conversation
            between you. One opening on this job is filled.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`amount-${application.id}`}>
                Agreed {currency} {salaryPeriodLabel(salaryPeriod)}
              </Label>
              <Input
                id={`amount-${application.id}`}
                type="number"
                min={0}
                step="any"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`starts-${application.id}`}>Starts</Label>
              <Input
                id={`starts-${application.id}`}
                type="date"
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={hire}>
              <Handshake className="size-4" />
              {pending ? "Hiring…" : "Confirm the hire"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setPanel("none")}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
