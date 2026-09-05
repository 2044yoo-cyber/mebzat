import type { AdminArea } from "@/types/database.types";

/**
 * The areas an administrator can be given, and how they read on screen.
 *
 * Separate from the gate beside it because the tick boxes are a client
 * component, and importing a value out of a `server-only` module pulls the
 * server Supabase client into the browser bundle. The list itself is not a
 * secret — it is eleven words — and the thing that must never reach the
 * browser is the *answer* to whether somebody holds one, which stays in
 * admin-areas.ts.
 *
 * This list is compared against the `admin_area` enum in 0064 by
 * scripts/admin_check.ts. A word here that PostgreSQL would refuse is a
 * checkbox that saves and then fails.
 */

export const ADMIN_AREAS = [
  "users",
  "properties",
  "products",
  "projects",
  "tours",
  "moderation",
  "content",
  "prices",
  "analytics",
  "security",
  "settings",
] as const;

export const AREA_LABEL: Record<AdminArea, string> = {
  users: "People",
  properties: "Properties",
  products: "Products",
  projects: "Projects",
  tours: "3D & 360°",
  moderation: "Moderation",
  content: "Content",
  prices: "Prices",
  analytics: "Analytics",
  security: "Security",
  settings: "Settings",
};

export const AREA_HINT: Record<AdminArea, string> = {
  users: "See accounts, restrict and reinstate them",
  properties: "Withdraw and restore listings",
  products: "Review and hide products",
  projects: "Review and hide projects",
  tours: "Review 360° tours and floor plans",
  moderation: "Work the report queue",
  content: "Homepage, categories, announcements",
  prices: "Verify and reject material prices",
  analytics: "See platform figures",
  security: "Admin activity and sign-in events",
  settings: "Platform settings",
};

