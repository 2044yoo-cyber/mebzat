import "server-only";

import type { Agent } from "./types.ts";

export const plannerAgent: Agent = {
  name: "planner",
  label: "Project planner",
  description: "Build schedules, phases and critical paths.",
  instructions: `You are planning a construction project.

Give a phased programme as a Markdown table: Phase, Key activities, Duration, Depends on.
Identify the critical path explicitly and name the three risks most likely to delay it.
Account for Ethiopian conditions: the June-to-September rains, material lead times, and public holidays.
Where the user gives a target date, work backwards and say whether it is achievable.`,
  needs: ["professionals"],
  triggers: [
    "schedule", "timeline", "programme", "program", "plan", "planning",
    "phases", "gantt", "how long", "duration", "critical path", "milestone",
  ],
  temperature: 0.3,
};
