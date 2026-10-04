/**
 * Quick actions shown on the landing page and above an empty chat.
 *
 * Client-safe: this is presentation data only, so it carries no provider or
 * database access and can be imported from a client component.
 */

import type { AiAgentName } from "@/types/database.types";

export type QuickAction = {
  agent: AiAgentName;
  title: string;
  description: string;
  /** Pre-filled question when the card is used as a starting point. */
  prompt: string;
  /** lucide-react icon name, resolved by the card component. */
  icon: string;
};

export const QUICK_ACTIONS: QuickAction[] = [
  {
    agent: "cost",
    title: "Construction Cost Estimator",
    description: "Budget a build with stated assumptions.",
    prompt: "Estimate the cost of a 200m² villa in Addis Ababa to a standard finish.",
    icon: "Calculator",
  },
  {
    agent: "boq",
    title: "AI BOQ Generator",
    description: "Draft a preliminary bill of quantities.",
    prompt: "Generate a preliminary BOQ for a 150m² two-storey residential house.",
    icon: "ClipboardList",
  },
  {
    agent: "materials",
    title: "Material Advisor",
    description: "Compare materials and specifications.",
    prompt: "Compare UPVC vs aluminium windows for a house in Addis Ababa.",
    icon: "Layers",
  },
  {
    agent: "marketplace",
    title: "Supplier Finder",
    description: "Find products and suppliers on Medosha.",
    prompt: "Find flooring suppliers in Addis Ababa.",
    icon: "Store",
  },
  {
    agent: "professionals",
    title: "Professional Finder",
    description: "Find architects, engineers and designers.",
    prompt: "Find architects near me who work on residential villas.",
    icon: "Users",
  },
  {
    agent: "planner",
    title: "Project Planner",
    description: "Phases, durations and the critical path.",
    prompt: "Generate a construction schedule for a 6-month villa build.",
    icon: "CalendarRange",
  },
  {
    agent: "render",
    title: "Interior Design Assistant",
    description: "Palettes, materials and furniture.",
    prompt: "Suggest modern interior colours for a living room with south-facing windows.",
    icon: "Palette",
  },
  {
    agent: "render",
    title: "Architecture Assistant",
    description: "Massing, orientation and facades.",
    prompt: "How should I orient and shade a villa in Addis Ababa for the climate?",
    icon: "Building2",
  },
  {
    agent: "render",
    title: "Rendering Assistant",
    description: "Write a prompt for a visualisation.",
    prompt: "Write a rendering prompt for a modern Ethiopian villa at golden hour.",
    icon: "Camera",
  },
  {
    agent: "drawings",
    title: "Drawing Analyzer",
    description: "Drawing types, conventions and reviews.",
    prompt: "What should a structural drawing set contain for a two-storey house?",
    icon: "FileText",
  },
  {
    agent: "drawings",
    title: "Building Code Assistant",
    description: "EBCS requirements and permits.",
    prompt: "What are the EBCS setback and height rules for a residential plot?",
    icon: "Scale",
  },
  {
    agent: "construction",
    title: "Construction Calculator",
    description: "Quantities, mixes and conversions.",
    prompt: "How many cement bags and how much sand for 10m³ of C-25 concrete?",
    icon: "Ruler",
  },
];

/** Prompts offered under the hero input. */
export const SUGGESTED_PROMPTS: string[] = [
  "Estimate the cost of a 200m² villa",
  "Find flooring suppliers in Addis Ababa",
  "Recommend kitchen cabinet materials",
  "Generate a preliminary BOQ",
  "Find architects near me",
  "Compare UPVC vs Aluminum windows",
  "Suggest modern interior colors",
  "Generate a construction schedule",
  "Create a material list",
  "Recommend lighting for a hotel",
];
