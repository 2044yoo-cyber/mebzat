"use client";

import Link from "next/link";
import { useActionState } from "react";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    initialState,
  );

  if (state.sent) {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <MailCheck className="size-10 text-brand" />
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            If an account exists for that email, we&apos;ve sent a link to
            reset your password.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
            {state.fieldErrors?.email && (
              <p className="text-sm text-destructive">
                {state.fieldErrors.email}
              </p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </CardContent>
      <p className="pb-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-foreground underline">
          Back to log in
        </Link>
      </p>
    </Card>
  );
}
