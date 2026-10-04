"use server";

import { safeRedirect } from "@/lib/auth/safe-redirect";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";

export type LoginState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
};

export async function loginWithEmail(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: LoginState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<LoginState["fieldErrors"]>;
      fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    return { error: "Incorrect email or password." };
  }

  // Guarded, not trusted. This value reaches the action through a hidden
  // input whose value came from the query string, so `?redirect=//evil.example`
  // would send somebody off Medosha the instant their password was accepted —
  // the moment they are least likely to look at the address bar. The Google
  // callback already checked its equivalent; this one did not.
  const redirectTo = formData.get("redirect");
  redirect(safeRedirect(typeof redirectTo === "string" ? redirectTo : null));
}
