"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  saveAgentProfile,
  type SaveResult,
} from "@/app/(dashboard)/profile/agent/actions";
import { ServiceAreaPicker } from "@/components/profile/service-area-picker";
import type { AreaOption } from "@/components/profile/trade-and-areas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_YEARS } from "@/lib/profile/experience";
import type { AgentProfile } from "@/types/database.types";

const initialState: SaveResult = {};

/**
 * An estate agent's own details.
 *
 * Short on purpose. The account already holds the name, the photograph, the
 * city and the phone number, and asking for them twice is how two versions of
 * somebody's number end up on one screen. What is here is what only an agent
 * has: the agency behind them, a licence, what they deal in, and the areas
 * they actually cover — which is the field somebody looking for a flat in
 * Ayat is searching by.
 */
export function AgentProfileForm({
  agent,
  areas,
  selectedAreas,
}: {
  agent: AgentProfile | null;
  areas: AreaOption[];
  selectedAreas: string[];
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: SaveResult, formData: FormData) =>
      saveAgentProfile(formData),
    initialState,
  );

  // Keyed on `savedAt`, not on a boolean: saving twice with no change in
  // between still has to say so, and a boolean that is already true fires no
  // effect the second time.
  useEffect(() => {
    if (state.savedAt) toast.success("Agent profile saved");
  }, [state.savedAt]);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-4 rounded-xl border p-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="agencyName">Agency</Label>
            <Input
              id="agencyName"
              name="agencyName"
              defaultValue={agent?.agency_name ?? ""}
              placeholder="The agency you work with, or your own name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="licenseNumber">Licence number</Label>
            <Input
              id="licenseNumber"
              name="licenseNumber"
              defaultValue={agent?.license_number ?? ""}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="yearsExperience">Years in property</Label>
            <Input
              id="yearsExperience"
              name="yearsExperience"
              type="number"
              inputMode="numeric"
              min={0}
              max={MAX_YEARS}
              defaultValue={agent?.years_experience ?? ""}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="specialisations">What you deal in</Label>
            <Input
              id="specialisations"
              name="specialisations"
              defaultValue={(agent?.specialisations ?? []).join(", ")}
              placeholder="Sales, Rentals, Land"
            />
            <p className="text-xs text-muted-foreground">
              Separated by commas.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPhone">Phone for enquiries</Label>
            <Input
              id="contactPhone"
              name="contactPhone"
              type="tel"
              defaultValue={agent?.contact_phone ?? ""}
              placeholder="Leave blank to use your account number"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactEmail">Email for enquiries</Label>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              defaultValue={agent?.contact_email ?? ""}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="about">About you</Label>
          <Textarea
            id="about"
            name="about"
            rows={4}
            defaultValue={agent?.about ?? ""}
            placeholder="How you work, and what you are known for."
          />
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <ServiceAreaPicker
          areas={areas}
          selected={selectedAreas}
          label="Areas you cover"
          help="This is what buyers and tenants search by. Pick everywhere you take listings, not just where your office is."
        />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save agent profile"}
      </Button>
    </form>
  );
}
