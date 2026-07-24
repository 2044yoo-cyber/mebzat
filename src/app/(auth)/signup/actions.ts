"use server";

import { headers } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { signUpSchema } from "@/lib/validations/auth";

export type SignUpState = {
  error?: string;
  fieldErrors?: Partial<Record<"fullName" | "email" | "password", string>>;
  status?: "confirm-email" | "signed-in";
};

export async function signUpWithEmail(
  _prevState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: SignUpState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof NonNullable<SignUpState["fieldErrors"]>;
      fieldErrors[key] = issue.message;
    }
    return { fieldErrors };
  }

  const { fullName, email, password } = parsed.data;
  const originHeader = (await headers()).get("origin");
  const origin = originHeader ?? process.env.NEXT_PUBLIC_SITE_URL!;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (data.session) {
    return { status: "signed-in" };
  }

  return { status: "confirm-email" };
}
