"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  updateProfile,
  type EditProfileState,
} from "@/app/(dashboard)/profile/edit/actions";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { CoverUpload } from "@/components/profile/cover-upload";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ACCOUNT_TYPES } from "@/lib/constants/account-types";
import { ORGANIZATION_ACCOUNT_TYPES } from "@/lib/validations/profile";
import type { AccountType, Profile } from "@/types/database.types";

const initialState: EditProfileState = {};

export function EditProfileForm({ profile }: { profile: Profile }) {
  const [state, formAction, pending] = useActionState(
    updateProfile,
    initialState,
  );
  const [accountType, setAccountType] = useState<AccountType>(
    profile.account_type ?? "individual",
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Profile updated");
    }
  }, [state.success]);

  const isOrganization = ORGANIZATION_ACCOUNT_TYPES.has(accountType);
  const displayName = profile.company_name || profile.full_name || "Unnamed";

  return (
    <div className="overflow-hidden rounded-2xl border">
      <CoverUpload userId={profile.id} coverUrl={profile.cover_url} />

      <div className="-mt-16 px-6 sm:-mt-20">
        <AvatarUpload
          userId={profile.id}
          avatarUrl={profile.avatar_url}
          displayName={displayName}
        />
      </div>

      <form action={formAction} className="space-y-4 p-6">
        <div className="space-y-2">
          <Label htmlFor="accountType">Account type</Label>
          <Select
            name="accountType"
            value={accountType}
            onValueChange={(value) => setAccountType(value as AccountType)}
          >
            <SelectTrigger id="accountType" className="w-full">
              <SelectValue placeholder="Choose account type" />
            </SelectTrigger>
            <SelectContent>
              {ACCOUNT_TYPES.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fullName">
            {isOrganization ? "Your name" : "Full name"}
          </Label>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={profile.full_name ?? ""}
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
            <Input
              id="companyName"
              name="companyName"
              defaultValue={profile.company_name ?? ""}
              required
            />
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
            defaultValue={profile.username ?? ""}
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
            <Input
              id="locationCity"
              name="locationCity"
              defaultValue={profile.location_city ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="locationCountry">Country</Label>
            <Input
              id="locationCountry"
              name="locationCountry"
              defaultValue={profile.location_country ?? ""}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={profile.phone ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="yearsExperience">Years of experience</Label>
            <Input
              id="yearsExperience"
              name="yearsExperience"
              type="number"
              min={0}
              max={80}
              defaultValue={profile.years_experience ?? ""}
            />
          </div>
        </div>

        {/* Off unless asked for. A number entered to receive a confirmation
            code used to be published on the public profile as a side effect of
            having entered it. */}
        <fieldset className="space-y-3 rounded-xl border p-4">
          <legend className="px-1 text-sm font-medium">
            What visitors can see
          </legend>
          <div className="flex min-h-11 items-start gap-3">
            <Checkbox
              id="showPhone"
              name="showPhone"
              defaultChecked={profile.show_phone}
              className="mt-1"
            />
            <div className="space-y-0.5">
              <Label htmlFor="showPhone" className="font-medium">
                Show my phone number on my profile
              </Label>
              <p className="text-xs text-muted-foreground">
                Anyone can see it, signed in or not. Leave it off and people
                reach you through Medosha messages instead.
              </p>
            </div>
          </div>
          <div className="flex min-h-11 items-start gap-3">
            <Checkbox
              id="showEmail"
              name="showEmail"
              defaultChecked={profile.show_email}
              className="mt-1"
            />
            <div className="space-y-0.5">
              <Label htmlFor="showEmail" className="font-medium">
                Show my email address on my profile
              </Label>
              <p className="text-xs text-muted-foreground">
                A published address is an address that gets scraped.
              </p>
            </div>
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            name="website"
            placeholder="https://example.com"
            defaultValue={profile.website ?? ""}
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
            defaultValue={profile.languages.join(", ")}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">Bio</Label>
          <Textarea
            id="bio"
            name="bio"
            rows={4}
            defaultValue={profile.bio ?? ""}
          />
          {state.fieldErrors?.bio && (
            <p className="text-sm text-destructive">{state.fieldErrors.bio}</p>
          )}
        </div>

        {state.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </form>
    </div>
  );
}
