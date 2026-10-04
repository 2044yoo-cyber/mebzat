import Image from "next/image";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { salaryPeriodLabel } from "@/lib/constants/jobs";
import { AVATAR_PLACEHOLDER } from "@/lib/constants/placeholders";
import { formatRelativeTime } from "@/lib/utils";
import type { HireRow } from "@/lib/data/jobs";

/**
 * Working relationships that came out of a job.
 *
 * The same component serves both sides — the employer's list of who they hired
 * and the professional's list of who hired them — because the row is the same
 * agreement seen from two ends, and `viewerId` decides which name to show.
 */
export function HireList({
  hires,
  viewerId,
}: {
  hires: HireRow[];
  viewerId: string;
}) {
  if (hires.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-16 text-center">
        <p className="font-medium">Nobody hired yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Hiring an applicant records the agreement and opens a conversation
          with them.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {hires.map((hire) => {
        const employed = hire.employer_id === viewerId;
        const other = employed ? hire.professional : hire.employer;
        const name =
          other?.full_name ?? other?.company_name ?? "Medosha member";

        return (
          <li
            key={hire.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-5"
          >
            <Image
              src={other?.avatar_url || AVATAR_PLACEHOLDER}
              alt=""
              width={44}
              height={44}
              className="size-11 shrink-0 rounded-full border object-cover"
            />

            <div className="min-w-0 flex-1">
              <p className="font-medium leading-snug">
                {other?.username ? (
                  <Link href={`/u/${other.username}`} className="hover:underline">
                    {name}
                  </Link>
                ) : (
                  name
                )}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {employed ? "Hired for" : "Hired by them for"}{" "}
                {hire.job ? (
                  <Link href={`/jobs/${hire.job.id}`} className="hover:underline">
                    {hire.job.title}
                  </Link>
                ) : (
                  "a job that has since been removed"
                )}{" "}
                · {formatRelativeTime(hire.created_at)}
              </p>
              {hire.starts_on && (
                <p className="text-sm text-muted-foreground">
                  Starts {new Date(hire.starts_on).toLocaleDateString("en-GB")}
                </p>
              )}
            </div>

            {hire.agreed_amount !== null && (
              <p className="shrink-0 text-sm font-semibold tabular-nums">
                {hire.currency}{" "}
                {Number(hire.agreed_amount).toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
                {hire.amount_period ? (
                  <span className="ml-1 font-normal text-muted-foreground">
                    {salaryPeriodLabel(hire.amount_period)}
                  </span>
                ) : null}
              </p>
            )}

            {hire.conversation_id && (
              <Link
                href={`/messages/${hire.conversation_id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <MessageSquare className="size-4" />
                Messages
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
