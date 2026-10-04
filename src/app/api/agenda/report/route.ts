import { NextResponse } from "next/server";

import {
  ProviderError,
  providerChain,
  streamCompletion,
} from "@/lib/ai/provider";
import {
  agendaLedger,
  agendaLogs,
  agendaOverview,
  agendaReminders,
  agendaTasks,
} from "@/lib/data/agenda";
import { createClient } from "@/lib/supabase/server";

/**
 * The Agenda assistant.
 *
 * Writes the report a project manager would write on a Friday afternoon and
 * usually does not: what happened, what is late, what is about to cost money.
 *
 * It is given the records the *reader* can see, not the records that exist.
 * The data layer runs under row-level security, so a contractor without
 * finance access gets a summary built from logs and tasks alone — and the
 * prompt is told the money was withheld rather than left to infer that
 * nothing was spent, which would be a confident lie.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RATE_LIMIT = 30;
const WINDOW_SECONDS = 60 * 60;

type Kind = "daily" | "weekly" | "progress" | "risks";

const BRIEF: Record<Kind, string> = {
  daily:
    "Write today's site summary. Three or four sentences. What was done, who was there, anything that went wrong.",
  weekly:
    "Write this week's report: progress, what slipped, what is due next week. Use short headed sections.",
  progress:
    "Write a progress report for the client. Plain language, no jargon, honest about delays.",
  risks:
    "List what is at risk: late tasks, missed logs, budget pressure, anything unresolved. Most urgent first.",
};

const SYSTEM = `You are the project assistant inside Medosha Agenda, a private site record for construction projects in Ethiopia.

You are writing for the people building the job — a client, a project manager, a contractor. Write the way a good site manager writes: short, specific, and about what actually happened.

Rules:
- Use only the records given. Never invent a delivery, a payment, a date or a name.
- If the records are thin, say so plainly: "Only two logs this week" is useful. Padding is not.
- Money: only mention figures that appear in the records. If the ledger was withheld, do not speculate about cost — say the financial records were not available to this reader.
- Delays are facts, not accusations. State what is late and by how long.
- Dates in day-month form. Amounts with their currency.
- No preamble, no sign-off, no offers to help further.`;

function line(label: string, value: unknown): string {
  return value === null || value === undefined || value === "" ? "" : `${label}: ${value}\n`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }

  let projectId = "";
  let kind: Kind = "weekly";
  try {
    const body = (await request.json()) as { projectId?: string; kind?: string };
    projectId = typeof body.projectId === "string" ? body.projectId : "";
    if (body.kind && body.kind in BRIEF) kind = body.kind as Kind;
  } catch {
    // Falls through to the 400 below.
  }

  if (!projectId) {
    return NextResponse.json({ error: "Which project?" }, { status: 400 });
  }

  // Membership is the gate. `agendaOverview` returns nothing to a non-member,
  // which is also what makes this endpoint safe to call with any id.
  const overview = await agendaOverview(projectId);
  if (!overview?.is_member) {
    return NextResponse.json(
      { error: "This Agenda is private." },
      { status: 403 },
    );
  }

  const { data: recent } = await supabase.rpc("ai_feature_requests_in_window", {
    feature_name: "agenda",
    window_seconds: WINDOW_SECONDS,
  });
  if (typeof recent === "number" && recent >= RATE_LIMIT) {
    return NextResponse.json(
      { error: `You've generated ${RATE_LIMIT} reports this hour. The limit resets shortly.` },
      { status: 429 },
    );
  }

  const [logs, tasks, ledger, reminders] = await Promise.all([
    agendaLogs(projectId, kind === "daily" ? 2 : 14),
    agendaTasks(projectId),
    // Returns empty for a reader without finance access — the row-level
    // policy, not a branch here.
    agendaLedger(projectId),
    agendaReminders(projectId),
  ]);

  let context = `Today is ${new Date().toISOString().slice(0, 10)}.\n\n## Site logs\n`;

  if (logs.length === 0) {
    context += "No site logs recorded.\n";
  } else {
    for (const log of logs) {
      context += `\n### ${log.log_date}\n`;
      context += line("Weather", log.weather);
      context += line("Workers present", log.workers_present);
      context += line("Work completed", log.work_completed);
      context += line("Materials delivered", log.materials_delivered);
      context += line("Equipment", log.equipment_used);
      context += line("Problems", log.problems);
      context += line("Safety", log.safety_issues);
      context += line("Visitors", log.visitors);
    }
  }

  context += `\n## Tasks (${tasks.length})\n`;
  const now = Date.now();
  for (const task of tasks.slice(0, 60)) {
    const late =
      task.due_at &&
      new Date(task.due_at).getTime() < now &&
      task.status !== "done" &&
      task.status !== "cancelled";
    context += `- ${task.title} — ${task.status}, ${task.priority}${
      task.due_at ? `, due ${task.due_at.slice(0, 10)}${late ? " (LATE)" : ""}` : ""
    }${task.assignee?.full_name ? `, assigned to ${task.assignee.full_name}` : ""}\n`;
  }

  context += `\n## Ledger\n`;
  if (!overview.can_view_finance) {
    context +=
      "WITHHELD. This reader does not have finance access. Do not discuss cost.\n";
  } else if (ledger.length === 0) {
    context += "No entries recorded.\n";
  } else {
    context += `Spent: ${overview.total_spent ?? 0}. Received: ${overview.total_received ?? 0}. Outstanding: ${overview.outstanding ?? 0}.\n`;
    for (const entry of ledger.slice(0, 50)) {
      context += `- ${entry.occurred_on} ${entry.kind} ${entry.direction === 1 ? "+" : "-"}${entry.amount} ${entry.currency} — ${entry.description} (${entry.status})\n`;
    }
  }

  if (reminders.length > 0) {
    context += `\n## Upcoming\n`;
    for (const reminder of reminders.slice(0, 20)) {
      context += `- ${reminder.due_at.slice(0, 10)} ${reminder.kind}: ${reminder.title}\n`;
    }
  }

  const startedAt = Date.now();

  const providers = providerChain();
  if (providers.length === 0) {
    return NextResponse.json(
      {
        error:
          "No AI provider is configured, so reports cannot be written. Your records are unaffected.",
      },
      { status: 503 },
    );
  }

  const messages = [
    { role: "system" as const, content: SYSTEM },
    { role: "user" as const, content: `${BRIEF[kind]}\n\n---\n\n${context}` },
  ];

  // Plain text rather than server-sent events: the caller renders one report
  // into one panel, so there is nothing for a framed protocol to carry.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let lastError: string | null = null;
      let wrote = false;

      for (const provider of providers) {
        try {
          for await (const chunk of streamCompletion(provider, {
            messages,
            temperature: 0.3,
            maxTokens: 1200,
            signal: request.signal,
          })) {
            if (chunk.type === "text") {
              wrote = true;
              controller.enqueue(encoder.encode(chunk.value));
            }
          }

          await supabase.from("ai_usage_logs").insert({
            user_id: user.id,
            feature: "agenda",
            provider: provider.name,
            model: provider.defaultModel,
            latency_ms: Date.now() - startedAt,
            ok: true,
          });

          controller.close();
          return;
        } catch (error) {
          if (request.signal.aborted) {
            controller.close();
            return;
          }

          lastError =
            error instanceof ProviderError
              ? `${error.provider} ${error.status}`
              : error instanceof Error
                ? error.message
                : "unknown";

          console.error(`[medosha:agenda] ${provider.name} failed:`, error);

          // Half a report from a provider that then died is worse than none:
          // the reader cannot tell where it stopped, and a truncated site
          // report reads as a complete one.
          if (wrote) break;
        }
      }

      await supabase.from("ai_usage_logs").insert({
        user_id: user.id,
        feature: "agenda",
        provider: "none",
        model: "none",
        latency_ms: Date.now() - startedAt,
        ok: false,
        error: lastError,
      });

      controller.enqueue(
        encoder.encode(
          wrote
            ? "\n\n[The report was cut short — the assistant stopped responding. Your records are unaffected.]"
            : "The assistant could not write that report. Your records are unaffected.",
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
