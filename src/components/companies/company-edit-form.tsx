"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import {
  updateCompany,
  type CompanyEditState,
} from "@/app/companies/actions";
import { SingleImageInput } from "@/components/companies/single-image-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Company } from "@/types/database.types";

const initialState: CompanyEditState = {};

export function CompanyEditForm({
  company,
  userId,
}: {
  company: Company;
  userId: string;
}) {
  const action = updateCompany.bind(null, company.id);
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.success) toast.success("Business updated");
  }, [state.success]);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label>Cover</Label>
        <SingleImageInput
          userId={userId}
          name="coverUrl"
          bucket="company-assets"
          initialUrl={company.cover_url}
          aspect="wide"
          label="Cover"
        />
      </div>
      <div className="space-y-2">
        <Label>Logo</Label>
        <SingleImageInput
          userId={userId}
          name="logoUrl"
          bucket="company-assets"
          initialUrl={company.logo_url}
          aspect="square"
          label="Logo"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">Business name</Label>
        <Input id="name" name="name" defaultValue={company.name} required />
        {state.fieldErrors?.name && (
          <p className="text-sm text-destructive">{state.fieldErrors.name}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Input
          id="category"
          name="category"
          defaultValue={company.category ?? ""}
          placeholder="Supplier, Contractor, Architecture firm…"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={5}
          defaultValue={company.description ?? ""}
        />
        {state.fieldErrors?.description && (
          <p className="text-sm text-destructive">
            {state.fieldErrors.description}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            name="website"
            defaultValue={company.website ?? ""}
            placeholder="https://example.com"
          />
          {state.fieldErrors?.website && (
            <p className="text-sm text-destructive">
              {state.fieldErrors.website}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={company.email ?? ""}
          />
          {state.fieldErrors?.email && (
            <p className="text-sm text-destructive">{state.fieldErrors.email}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" type="tel" defaultValue={company.phone ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="employeesCount">Employees</Label>
          <Input
            id="employeesCount"
            name="employeesCount"
            type="number"
            min={0}
            defaultValue={company.employees_count ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <Input id="address" name="address" defaultValue={company.address ?? ""} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" name="city" defaultValue={company.city ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">Country</Label>
          <Input id="country" name="country" defaultValue={company.country ?? ""} />
        </div>
      </div>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
