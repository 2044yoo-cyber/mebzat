/** The server actions' Supabase client, in the Studio's browser checks: the same fake as the browser's. */
import { fakeClient } from "./collab_fake_supabase";

export async function createClient() {
  return fakeClient();
}
