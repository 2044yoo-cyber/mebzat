"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { phoneOtpSchema, phoneSchema } from "@/lib/validations/auth";

export function PhoneAuthForm({ next = "/dashboard" }: { next?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function sendCode(formData: FormData) {
    setError(null);
    const parsed = phoneSchema.safeParse({ phone: formData.get("phone") });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid phone number");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      phone: parsed.data.phone,
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setPhone(parsed.data.phone);
    setStep("code");
    toast.success("Code sent", { description: `We texted a code to ${parsed.data.phone}` });
  }

  async function verifyCode(formData: FormData) {
    setError(null);
    const parsed = phoneOtpSchema.safeParse({
      phone,
      token: formData.get("token"),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter the 6-digit code");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({
      phone: parsed.data.phone,
      token: parsed.data.token,
      type: "sms",
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    // The code is confirmed, so the badge can be brought into line with it.
    //
    // This is the *only* route to `phone_verified`: the column itself is
    // refused to API sessions by a trigger, and the function behind this reads
    // `auth.users.phone_confirmed_at` — which nothing in the browser can
    // write. Calling it here rather than trusting the client to set a flag is
    // the difference between a badge and a claim.
    //
    // Awaited but not fatal. A member who has genuinely confirmed their phone
    // is signed in either way, and the next call to this function — on their
    // next sign-in — settles it. Blocking the redirect on it would strand
    // somebody on a form for a database round trip they did not ask for.
    try {
      await supabase.rpc("sync_phone_verification");
    } catch {
      // Left for the next sign-in.
    }

    router.push(next);
    router.refresh();
  }

  if (step === "phone") {
    return (
      <form action={sendCode} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone number</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            placeholder="+15551234567"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending code…" : "Send code"}
        </Button>
      </form>
    );
  }

  return (
    <form action={verifyCode} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="token">Verification code</Label>
        <Input
          id="token"
          name="token"
          inputMode="numeric"
          maxLength={6}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <p className="text-sm text-muted-foreground">Sent to {phone}</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Verifying…" : "Verify & continue"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => setStep("phone")}
      >
        Use a different number
      </Button>
    </form>
  );
}
