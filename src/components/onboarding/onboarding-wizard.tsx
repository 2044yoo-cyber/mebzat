"use client";

import { useActionState, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { ACCOUNT_TYPES } from "@/lib/constants/account-types";
import { ORGANIZATION_ACCOUNT_TYPES } from "@/lib/validations/onboarding";
import { cn } from "@/lib/utils";
import type { AccountType } from "@/types/database.types";

import {
  completeOnboarding,
  type OnboardingState,
} from "@/app/onboarding/actions";

const initialState: OnboardingState = {};

export function OnboardingWizard({
  defaultFullName,
}: {
  defaultFullName: string;
}) {
  const [step, setStep] = useState<0 | 1>(0);
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [state, formAction, pending] = useActionState(
    completeOnboarding,
    initialState,
  );

  const isOrganization = accountType
    ? ORGANIZATION_ACCOUNT_TYPES.has(accountType)
    : false;

  return (
    <div className="space-y-8">
      <Progress value={step === 0 ? 50 : 100} />

      {step === 0 && (
        <div className="space-y-6">
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-semibold tracking-tight">
              How do you work in construction?
            </h1>
            <p className="text-muted-foreground">
              Pick the option that best describes you.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {ACCOUNT_TYPES.map(({ value, label, description, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setAccountType(value);
                  setStep(1);
                }}
                className={cn(
                  "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors hover:border-brand hover:bg-brand/5",
                  accountType === value && "border-brand bg-brand/5",
                )}
              >
                <Icon className="size-5 text-brand" />
                <span className="font-medium">{label}</span>
                <span className="text-xs text-muted-foreground">
                  {description}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 1 && accountType && (
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => setStep(0)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> Change account type
          </button>

          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Tell us about {isOrganization ? "your organization" : "yourself"}
            </h1>
            <p className="text-muted-foreground">
              This appears on your public profile — you can always edit it
              later.
            </p>
          </div>

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="accountType" value={accountType} />

            <div className="space-y-2">
              <Label htmlFor="fullName">
                {isOrganization ? "Your name" : "Full name"}
              </Label>
              <Input
                id="fullName"
                name="fullName"
                defaultValue={defaultFullName}
                required
              />
              {state.fieldErrors?.fullName && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.fullName}
                </p>
              )}
            </div>

            {isOrganization && (
              <div className="space-y-2">
                <Label htmlFor="companyName">Company name</Label>
                <Input id="companyName" name="companyName" required />
                {state.fieldErrors?.companyName && (
                  <p className="text-sm text-destructive">
                    {state.fieldErrors.companyName}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                name="username"
                placeholder="jane-architect"
                required
              />
              {state.fieldErrors?.username && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.username}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="locationCity">City</Label>
                <Input id="locationCity" name="locationCity" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="locationCountry">Country</Label>
                <Input id="locationCountry" name="locationCountry" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" name="phone" type="tel" placeholder="+15551234567" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="yearsExperience">Years of experience</Label>
                <Input
                  id="yearsExperience"
                  name="yearsExperience"
                  type="number"
                  min={0}
                  max={80}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                name="website"
                placeholder="https://example.com"
              />
              {state.fieldErrors?.website && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.website}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="languages">Languages</Label>
              <Input
                id="languages"
                name="languages"
                placeholder="English, Amharic, French"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                name="bio"
                rows={4}
                placeholder="What do you do, and what makes your work stand out?"
              />
              {state.fieldErrors?.bio && (
                <p className="text-sm text-destructive">
                  {state.fieldErrors.bio}
                </p>
              )}
            </div>

            {state.error && (
              <p className="text-sm text-destructive">{state.error}</p>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? (
                "Finishing up…"
              ) : (
                <>
                  <Check className="size-4" /> Complete profile
                </>
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
