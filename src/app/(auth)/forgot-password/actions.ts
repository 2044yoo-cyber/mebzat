"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema } from "@/lib/validations/auth";

export type ForgotPasswordState = {
  error?: string;
  fieldErrors?: Partial<Record<"email", string>>;
  sent?: boolean;
};

export async function requestPasswordReset(
  _prevState: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const parsed = forgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return { fieldErrors: { email: parsed.error.issues[0]?.message } };
  }

  const originHeader = (await headers()).get("origin");
  const origin = originHeader ?? process.env.NEXT_PUBLIC_SITE_URL!;

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  // Always report success, regardless of outcome, to avoid leaking which
  // emails have accounts.
  return { sent: true };
}
