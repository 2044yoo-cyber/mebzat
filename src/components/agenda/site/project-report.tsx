"use client";

import { useState } from "react";
import { FileText, Sparkles } from "lucide-react";

import { ReportPanel } from "@/components/agenda/report-panel";
import { Figure } from "@/components/agenda/money/money-bits";
import { cn } from "@/lib/utils";

/**
 * Where a project actually is, on one screen.
 *
 * Hard numbers first, and the narrative second. The report writer that 0024's
 * Agenda already has is reused rather than rebuilt — it is given only the
 * records the reader can see, so a contractor without finance access gets a
 * summary that says the money was withheld rather than one that quietly omits
 * it and reads as complete.
 *
 * The money block is absent, not empty, when the viewer has no finance
 * permission. A row of dashes where the budget should be is a worse answer
 * than no row: it reads as a project with no budget.
 */

export type ReportFigures = {
  schedule: {
    activities: number;
    milestones: number;
    behind: number;
    reportedPercent: number | null;
  };
  quality: {
    openObservations: number;
    openPunchItems: number;
    failedInspections: number;
    punchProgress: number | null;
  };
  site: {
    dailyLogs: number;
    photos: number;
    hours: number;
    plantInUse: number | null;
  };
  questions: {
    openRfis: number;
    overdueRfis: number;
    pendingSubmittals: number;
  };
  money: {
    revisedBudget: number;
    remainingBudget: number;
    outstanding: number;
    retentionHeld: number;
    approvedChange: number;
    pendingChange: number;
    currency: string;
  } | null;
};

export function ProjectReport({
  projectId,
  figures,
}: {
  projectId: string;
  figures: ReportFigures;
}) {
  const [writing, setWriting] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Where this project is</h2>
        <button
          type="button"
          onClick={() => setWriting(true)}
          className="flex h-9 items-center gap-1.5 rounded-xl bg-brand px-3 text-sm font-medium text-brand-foreground transition-opacity hover:opacity-90"
        >
          <Sparkles className="size-3.5" />
          Write it up
        </button>
      </div>

      {writing && (
        <ReportPanel projectId={projectId} onClose={() => setWriting(false)} />
      )}

      <Block title="Programme">
        <Count label="Activities" value={figures.schedule.activities} />
        <Count label="Milestones" value={figures.schedule.milestones} />
        <Count
          label="Behind their dates"
          value={figures.schedule.behind}
          warn={figures.schedule.behind > 0}
        />
        <Count
          label="Reported built"
          value={figures.schedule.reportedPercent}
          suffix="%"
        />
      </Block>

      <Block title="Questions and approvals">
        <Count label="RFIs waiting" value={figures.questions.openRfis} />
        <Count
          label="RFIs overdue"
          value={figures.questions.overdueRfis}
          warn={figures.questions.overdueRfis > 0}
        />
        <Count
          label="Submittals with a reviewer"
          value={figures.questions.pendingSubmittals}
        />
      </Block>

      <Block title="Quality and safety">
        <Count
          label="Observations open"
          value={figures.quality.openObservations}
          warn={figures.quality.openObservations > 0}
        />
        <Count
          label="Punch items open"
          value={figures.quality.openPunchItems}
          warn={figures.quality.openPunchItems > 0}
        />
        <Count
          label="Inspections failed"
          value={figures.quality.failedInspections}
          warn={figures.quality.failedInspections > 0}
        />
        <Count
          label="Punch list done"
          value={figures.quality.punchProgress}
          suffix="%"
        />
      </Block>

      <Block title="On site">
        <Count label="Daily logs" value={figures.site.dailyLogs} />
        <Count label="Photographs" value={figures.site.photos} />
        <Count label="Hours recorded" value={figures.site.hours} />
        <Count label="Plant in use" value={figures.site.plantInUse} suffix="%" />
      </Block>

      {figures.money ? (
        <Block title="Money">
          <Figure
            label="Revised budget"
            amount={figures.money.revisedBudget}
            currency={figures.money.currency}
            tone="muted"
          />
          <Figure
            label="Remaining"
            amount={figures.money.remainingBudget}
            currency={figures.money.currency}
            tone="signed"
          />
          <Figure
            label="Outstanding to pay"
            amount={figures.money.outstanding}
            currency={figures.money.currency}
          />
          <Figure
            label="Retention held"
            amount={figures.money.retentionHeld}
            currency={figures.money.currency}
            tone="muted"
          />
          <Figure
            label="Change approved"
            amount={figures.money.approvedChange}
            currency={figures.money.currency}
            tone="muted"
          />
          <Figure
            label="Change being argued"
            amount={figures.money.pendingChange}
            currency={figures.money.currency}
            tone="muted"
          />
        </Block>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
          <FileText className="size-4 shrink-0" />
          The money on this project is not shared with you, so it is left out
          rather than shown as nothing.
        </div>
      )}
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-2xl border p-4">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
    </section>
  );
}

/**
 * One figure.
 *
 * Null prints an em dash rather than zero. "No activities have dates" and
 * "every activity is on time" are different facts, and a zero that means the
 * first is a number somebody will quote in a meeting.
 */
function Count({
  label,
  value,
  suffix = "",
  warn = false,
}: {
  label: string;
  value: number | null;
  suffix?: string;
  warn?: boolean;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-sm font-medium tabular-nums",
          warn && "text-amber-600 dark:text-amber-400",
        )}
      >
        {value === null ? "—" : `${value.toLocaleString()}${suffix}`}
      </p>
    </div>
  );
}
