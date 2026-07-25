"use client";

import Link from "next/link";
import { useActionState } from "react";
import { BadgeCheck, Clock } from "lucide-react";

import { submitClaim, type ClaimState } from "@/app/companies/actions";
import { buttonVariants, Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const initialState: ClaimState = {};

export function ClaimForm({
  companyId,
  companySlug,
  companyName,
  defaultEmail,
}: {
  companyId: string;
  companySlug: string;
  companyName: string;
  defaultEmail: string;
}) {
  const action = submitClaim.bind(null, companyId);
  const [state, formAction, pending] = useActionState(action, initialState);

  if (state.status === "approved") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <BadgeCheck className="size-10 text-brand" />
          <CardTitle>You now manage {companyName}</CardTitle>
          <CardDescription>
            Your email matched the business record, so ownership was verified
            automatically. You can now edit the profile.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center gap-2">
          <Link
            href={`/companies/${companySlug}/edit`}
            className={buttonVariants()}
          >
            Manage business
          </Link>
          <Link
            href={`/companies/${companySlug}`}
            className={buttonVariants({ variant: "outline" })}
          >
            View profile
          </Link>
        </CardContent>
      </Card>
    );
  }

  if (state.status === "pending") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <Clock className="size-10 text-brand" />
          <CardTitle>Claim submitted</CardTitle>
          <CardDescription>
            Thanks — we&apos;ve received your claim for {companyName}. Our team
            reviews claims that can&apos;t be auto-verified, and you&apos;ll get
            access once it&apos;s approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Link
            href={`/companies/${companySlug}`}
            className={buttonVariants({ variant: "outline" })}
          >
            Back to business
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="roleAtCompany">Your role at the business</Label>
        <Input
          id="roleAtCompany"
          name="roleAtCompany"
          placeholder="Owner, Manager, Director…"
          required
        />
        {state.fieldErrors?.roleAtCompany && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.roleAtCompany}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactEmail">Business email</Label>
        <Input
          id="contactEmail"
          name="contactEmail"
          type="email"
          defaultValue={defaultEmail}
          required
        />
        <p className="text-xs text-muted-foreground">
          If this matches the email on the business listing, you&apos;ll be
          verified instantly.
        </p>
        {state.fieldErrors?.contactEmail && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.contactEmail}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="contactPhone">Phone (optional)</Label>
        <Input id="contactPhone" name="contactPhone" type="tel" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">Anything else? (optional)</Label>
        <Textarea
          id="message"
          name="message"
          rows={3}
          placeholder="Help us verify you're authorized to manage this business."
        />
      </div>
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Submitting…" : "Submit claim"}
      </Button>
    </form>
  );
}
