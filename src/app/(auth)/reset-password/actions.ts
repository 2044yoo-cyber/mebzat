"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { resetPasswordSchema } from "@/lib/validations/auth";

export type ResetPasswordState = {
  error?: string;
  fieldErrors?: Partial<Record<"password" | "confirmPassword", string>>;
};

export async function updatePassword(
  _prevState: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const parsed = resetPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    const fieldErrors: ResetPasswordState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<
        ResetPasswordState["fieldErrors"]
      >;
      fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Your reset link has expired. Request a new one." };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/dashboard");
}
