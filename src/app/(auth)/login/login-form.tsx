"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

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

import { loginWithEmail, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/dashboard";
  const [state, formAction, pending] = useActionState(
    loginWithEmail,
    initialState,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>Log in to your Medosha account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <GoogleButton next={redirectTo} />

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
              <input type="hidden" name="redirect" value={redirectTo} />
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-muted-foreground underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
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
                {pending ? "Logging in…" : "Log in"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="phone">
            <PhoneAuthForm next={redirectTo} />
          </TabsContent>
        </Tabs>
      </CardContent>

      <p className="pb-6 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-foreground underline"
        >
          Sign up
        </Link>
      </p>
    </Card>
  );
}
