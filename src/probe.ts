import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
const c = createClient<Database>("http://x", "k");
export const q = c.from("projects").update({ cover_image_url: "x" });
