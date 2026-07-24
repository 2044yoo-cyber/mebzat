"use server";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type ResendState = {
  sent?: boolean;
  error?: string;
};

const emailSchema = z.string().trim().email();

export async function resendConfirmation(
  _prevState: ResendState,
  formData: FormData,
): Promise<ResendState> {
  const parsed = emailSchema.safeParse(formData.get("email"));

  if (!parsed.success) {
    return { error: "Enter a valid email" };
  }

  const supabase = await createClient();
  await supabase.auth.resend({ type: "signup", email: parsed.data });

  return { sent: true };
}
