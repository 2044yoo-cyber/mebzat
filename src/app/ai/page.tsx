import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MedoshaAi } from "@/components/ai/medosha-ai";
import { SketchWorkspace } from "@/components/ai/render/sketch-workspace";
import { AiStudio } from "@/components/ai/studio/studio";
import { findTool } from "@/lib/ai/studio";
import { createClient } from "@/lib/supabase/server";
import type { AiAgentName } from "@/types/database.types";

export const metadata: Metadata = {
  title: "Medosha AI",
  description:
    "One AI for your construction, property and design needs. Ask anything, or upload a photo, sketch or plan.",
};

const AGENTS: AiAgentName[] = [
  "construction", "materials", "marketplace", "companies", "professionals",
  "cost", "boq", "render", "drawings", "planner",
];

/**
 * Medosha AI.
 *
 * The unified conversation is what this page is now. Ask for a render, a cost
 * estimate, a material swap or the price of cement in the same box, with or
 * without a photograph, and the routing happens underneath.
 *
 * ## The tool workspaces did not go anywhere
 *
 * `?tool=` still opens the old studio, and every one of the fourteen image
 * tools still works exactly as it did. They came out of the sidebar because
 * making somebody choose between "Facade Designer" and "Material Replacer"
 * before they can start is the problem this change exists to fix — not because
 * the workspaces were bad. Somebody who wants the full control panel, a specific
 * model, four variations and a queue is better served there, and every link
 * into one keeps working.
 *
 * `?agent=` also still works, and pins the conversation to one assistant so a
 * Construction → BOQ link lands in the right place.
 */
export default async function AiPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    agent?: string;
    tool?: string;
    mode?: string;
  }>;
}) {
  const { q, agent, tool, mode } = await searchParams;

  // The assistant writes to per-user tables, so a session is required before
  // the chat renders rather than failing on the first question.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const target = q ? `/ai?q=${encodeURIComponent(q)}` : "/ai";
    redirect(`/login?redirect=${encodeURIComponent(target)}`);
  }

  // Only a real tool id opens the workspace. Anything else falls through to
  // the conversation, so a stale or mistyped link lands somewhere useful
  // instead of on an error.
  if (tool && findTool(tool)) {
    return <AiStudio initialPrompt={q} initialTool={tool} />;
  }

  // RLS gives the wallet row only to its owner, so no filter is needed.
  const { data: wallet } = await supabase
    .from("credit_wallets")
    .select("balance")
    .maybeSingle();

  // AI Sketch → 3D Render. A Medosha AI workspace, reached from the Medosha AI
  // menu, and deliberately not linked from Berchuma Studio — Studio edits
  // geometry, this renders pictures, and a menu entry in both would make them
  // look like the same feature.
  if (mode === "render") {
    return <SketchWorkspace initialBalance={wallet?.balance ?? null} />;
  }

  const pinned =
    agent && AGENTS.includes(agent as AiAgentName)
      ? (agent as AiAgentName)
      : undefined;

  return (
    <MedoshaAi
      initialPrompt={q}
      initialBalance={wallet?.balance ?? null}
      agent={pinned}
    />
  );
}
