"use client";

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

import { resendConfirmation, type ResendState } from "./actions";

const initialState: ResendState = {};

export default function VerifyEmailPage() {
  const [state, formAction, pending] = useActionState(
    resendConfirmation,
    initialState,
  );

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <MailCheck className="size-10 text-brand" />
        <CardTitle>Confirm your email</CardTitle>
        <CardDescription>
          Click the link we sent you to activate your account. Didn&apos;t
          get it? Enter your email to resend it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.sent ? (
          <p className="text-center text-sm text-muted-foreground">
            Confirmation email sent — check your inbox.
          </p>
        ) : (
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Sending…" : "Resend confirmation email"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
