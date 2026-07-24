"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { MailCheck } from "lucide-react";

import { GoogleButton } from "@/components/auth/google-button";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
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
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { signUpWithEmail, type SignUpState } from "./actions";

const initialState: SignUpState = {};

export default function SignUpPage() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    signUpWithEmail,
    initialState,
  );

  useEffect(() => {
    if (state.status === "signed-in") {
      router.push("/onboarding");
    }
  }, [state.status, router]);

  if (state.status === "confirm-email") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <MailCheck className="size-10 text-brand" />
          <CardTitle>Check your inbox</CardTitle>
          <CardDescription>
            We sent you a confirmation link. Click it to activate your
            account and finish setting up your profile.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>
          Join the largest network in construction.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <GoogleButton />

        <div className="flex items-center gap-3">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground">OR</span>
          <Separator className="flex-1" />
        </div>

        <Tabs defaultValue="email">
          <TabsList className="w-full">
            <TabsTrigger value="email" className="flex-1">
              Email
            </TabsTrigger>
            <TabsTrigger value="phone" className="flex-1">
              Phone
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email">
            <form action={formAction} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full name</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  autoComplete="name"
                  required
                />
                {state.fieldErrors?.fullName && (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.fullName}
                  </p>
                )}
              </div>
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
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                />
                {state.fieldErrors?.password && (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.password}
                  </p>
                )}
              </div>
              {state.error && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Creating account…" : "Create account"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="phone">
            <PhoneAuthForm />
          </TabsContent>
        </Tabs>
      </CardContent>

      <p className="pb-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-foreground underline">
          Log in
        </Link>
      </p>
    </Card>
  );
}
