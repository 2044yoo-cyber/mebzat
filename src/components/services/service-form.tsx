"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";

import {
  createService,
  updateService,
  type ServiceInput,
} from "@/app/(dashboard)/dashboard/services/actions";
import { AiField } from "@/components/ai/writing/ai-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PRICING_GROUPS,
  SERVICE_SCOPE,
  SERVICE_SCOPES,
  WORK_STATUS,
  WORK_STATUSES,
  pricingNeedsFigure,
} from "@/lib/constants/services";
import { cn } from "@/lib/utils";
import type {
  ServiceCategory,
  ServicePricing,
  ServiceScope,
  WorkStatus,
} from "@/types/database.types";

/**
 * Add or edit one service.
 *
 * Every field in the product spec, grouped so a fifteen-minute form does not
 * read like a tax return. The scope toggles decide what a quote means, so they
 * sit with the price rather than in a details section.
 */

export type ServiceFormValues = Partial<ServiceInput> & { id?: string };

export function ServiceForm({
  categories,
  initial,
}: {
  categories: ServiceCategory[];
  initial?: ServiceFormValues;
}) {
  const router = useRouter();
  const editing = Boolean(initial?.id);

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [subcategory, setSubcategory] = useState(initial?.subcategory ?? "");

  const [pricing, setPricing] = useState<ServicePricing>(
    initial?.pricing ?? "per_m2",
  );
  const [priceFrom, setPriceFrom] = useState(
    initial?.priceFrom != null ? String(initial.priceFrom) : "",
  );
  const [priceTo, setPriceTo] = useState(
    initial?.priceTo != null ? String(initial.priceTo) : "",
  );
  const [unit, setUnit] = useState(initial?.unit ?? "");

  const [scope, setScope] = useState<ServiceScope>(
    initial?.scope ?? "supply_and_fit",
  );
  const [materialIncluded, setMaterialIncluded] = useState(
    initial?.materialIncluded ?? true,
  );
  const [labourIncluded, setLabourIncluded] = useState(
    initial?.labourIncluded ?? true,
  );

  const [minOrder, setMinOrder] = useState(
    initial?.minOrder != null ? String(initial.minOrder) : "",
  );
  const [maxCapacity, setMaxCapacity] = useState(
    initial?.maxCapacity != null ? String(initial.maxCapacity) : "",
  );
  const [capacityUnit, setCapacityUnit] = useState(initial?.capacityUnit ?? "");

  const [workStatus, setWorkStatus] = useState<WorkStatus>(
    initial?.workStatus ?? "available",
  );
  const [nextAvailableOn, setNextAvailableOn] = useState(
    initial?.nextAvailableOn ?? "",
  );
  const [leadTimeDays, setLeadTimeDays] = useState(
    initial?.leadTimeDays != null ? String(initial.leadTimeDays) : "",
  );
  const [completionDays, setCompletionDays] = useState(
    initial?.completionDays != null ? String(initial.completionDays) : "",
  );

  const [locationCity, setLocationCity] = useState(
    initial?.locationCity ?? "Addis Ababa",
  );
  const [serviceRadiusKm, setServiceRadiusKm] = useState(
    initial?.serviceRadiusKm != null ? String(initial.serviceRadiusKm) : "",
  );
  const [servesRemotely, setServesRemotely] = useState(
    initial?.servesRemotely ?? false,
  );

  const [yearsExperience, setYearsExperience] = useState(
    initial?.yearsExperience != null ? String(initial.yearsExperience) : "",
  );
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(initial?.whatsapp ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(
    initial?.coverImageUrl ?? "",
  );
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? "");
  const [acceptingWork, setAcceptingWork] = useState(
    initial?.acceptingWork ?? true,
  );

  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needsFigure = pricingNeedsFigure(pricing);

  function optionalNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const input: ServiceInput = {
      title,
      description,
      categoryId: categoryId || null,
      subcategory,
      pricing,
      priceFrom: needsFigure ? optionalNumber(priceFrom) : null,
      priceTo: needsFigure ? optionalNumber(priceTo) : null,
      unit,
      scope,
      materialIncluded,
      labourIncluded,
      minOrder: optionalNumber(minOrder),
      maxCapacity: optionalNumber(maxCapacity),
      capacityUnit,
      workStatus,
      nextAvailableOn: nextAvailableOn || null,
      leadTimeDays: optionalNumber(leadTimeDays),
      completionDays: optionalNumber(completionDays),
      locationCity,
      serviceRadiusKm: optionalNumber(serviceRadiusKm),
      servesRemotely,
      yearsExperience: optionalNumber(yearsExperience),
      phone,
      whatsapp,
      coverImageUrl: coverImageUrl.trim() || null,
      videoUrl: videoUrl.trim() || null,
      acceptingWork,
    };

    startTransition(async () => {
      const result = initial?.id
        ? await updateService(initial.id, input)
        : await createService(input);

      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(editing ? "Service saved" : "Service published");
      router.push("/dashboard/services");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section title="What do you offer?">
        <Field label="Service name" htmlFor="s-title">
          <Input
            id="s-title"
            required
            maxLength={200}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            placeholder="e.g. Wardrobe Manufacturing"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category" htmlFor="s-category">
            <select
              id="s-category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm"
            >
              <option value="">Choose a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Subcategory" htmlFor="s-subcategory">
            <Input
              id="s-subcategory"
              value={subcategory}
              onChange={(event) => setSubcategory(event.target.value)}
              placeholder="e.g. Sliding-door wardrobes"
            />
          </Field>
        </div>

        <Field label="Description" htmlFor="s-description">
          <AiField
            id="s-description"
            surface="service"
            context={title ? `Service: ${title}` : undefined}
            value={description}
            maxLength={5000}
            onValueChange={setDescription}
            placeholder="What is included, how you work, what makes it worth the price."
            className="min-h-28"
          />
        </Field>
      </Section>

      <Section title="Price">
        <Field label="How do you price this?" htmlFor="s-pricing">
          <select
            id="s-pricing"
            value={pricing}
            onChange={(event) =>
              setPricing(event.target.value as ServicePricing)
            }
            className="h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm"
          >
            {PRICING_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>

        {needsFigure ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="From (ETB)" htmlFor="s-from">
              <Input
                id="s-from"
                type="number"
                min={0}
                step="any"
                value={priceFrom}
                onChange={(event) => {
                  setPriceFrom(event.target.value);
                  setError(null);
                }}
              />
            </Field>
            <Field label="Up to (optional)" htmlFor="s-to">
              <Input
                id="s-to"
                type="number"
                min={0}
                step="any"
                value={priceTo}
                onChange={(event) => setPriceTo(event.target.value)}
              />
            </Field>
            <Field label="Unit label" htmlFor="s-unit">
              <Input
                id="s-unit"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="e.g. linear metre"
              />
            </Field>
          </div>
        ) : (
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            No figure is shown for this pricing method. Clients request a quote
            instead.
          </p>
        )}

        <div>
          <p className="mb-2 text-sm font-medium">What does the price cover?</p>
          <div className="flex flex-wrap gap-1.5">
            {SERVICE_SCOPES.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={scope === value}
                onClick={() => {
                  setScope(value);
                  // Keep the two booleans coherent with the scope, so a quote
                  // cannot say "supply and fit" and "labour only" at once.
                  setMaterialIncluded(value !== "labour_only");
                  setLabourIncluded(value !== "material_only");
                }}
                title={SERVICE_SCOPE[value].blurb}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                  scope === value
                    ? "border-brand bg-brand text-brand-foreground"
                    : "hover:border-brand hover:bg-brand/5",
                )}
              >
                {SERVICE_SCOPE[value].label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <Check
              label="Material included"
              checked={materialIncluded}
              onChange={setMaterialIncluded}
            />
            <Check
              label="Labour included"
              checked={labourIncluded}
              onChange={setLabourIncluded}
            />
          </div>
        </div>
      </Section>

      <Section title="Capacity">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Minimum order" htmlFor="s-min">
            <Input
              id="s-min"
              type="number"
              min={0}
              step="any"
              value={minOrder}
              onChange={(event) => {
                setMinOrder(event.target.value);
                setError(null);
              }}
              placeholder="e.g. 3"
            />
          </Field>
          <Field label="Maximum capacity" htmlFor="s-max">
            <Input
              id="s-max"
              type="number"
              min={0}
              step="any"
              value={maxCapacity}
              onChange={(event) => setMaxCapacity(event.target.value)}
              placeholder="e.g. 60"
            />
          </Field>
          <Field label="Capacity unit" htmlFor="s-capunit">
            <Input
              id="s-capunit"
              value={capacityUnit}
              onChange={(event) => setCapacityUnit(event.target.value)}
              placeholder="e.g. linear metres per month"
            />
          </Field>
        </div>
      </Section>

      <Section title="Availability">
        <div className="flex flex-wrap gap-1.5">
          {WORK_STATUSES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={workStatus === value}
              onClick={() => setWorkStatus(value)}
              title={WORK_STATUS[value].blurb}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                workStatus === value
                  ? "border-brand bg-brand/10"
                  : "hover:border-brand hover:bg-brand/5",
              )}
            >
              <span
                aria-hidden
                className={cn("size-2 rounded-full", WORK_STATUS[value].dot)}
              />
              {WORK_STATUS[value].label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Next available" htmlFor="s-next">
            <Input
              id="s-next"
              type="date"
              value={nextAvailableOn}
              onChange={(event) => setNextAvailableOn(event.target.value)}
            />
          </Field>
          <Field label="Can start within (days)" htmlFor="s-lead">
            <Input
              id="s-lead"
              type="number"
              min={0}
              value={leadTimeDays}
              onChange={(event) => setLeadTimeDays(event.target.value)}
            />
          </Field>
          <Field label="Typical completion (days)" htmlFor="s-completion">
            <Input
              id="s-completion"
              type="number"
              min={0}
              value={completionDays}
              onChange={(event) => setCompletionDays(event.target.value)}
            />
          </Field>
        </div>

        <Check
          label="Accepting new work"
          checked={acceptingWork}
          onChange={setAcceptingWork}
        />
      </Section>

      <Section title="Where you work">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Based in" htmlFor="s-city">
            <Input
              id="s-city"
              value={locationCity}
              onChange={(event) => setLocationCity(event.target.value)}
            />
          </Field>
          <Field label="Service radius (km)" htmlFor="s-radius">
            <Input
              id="s-radius"
              type="number"
              min={0}
              value={serviceRadiusKm}
              onChange={(event) => setServiceRadiusKm(event.target.value)}
              placeholder="How far you travel"
            />
          </Field>
          <div className="flex items-end pb-1">
            <Check
              label="Also works remotely"
              checked={servesRemotely}
              onChange={setServesRemotely}
            />
          </div>
        </div>
      </Section>

      <Section title="Credibility and contact">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Years of experience" htmlFor="s-years">
            <Input
              id="s-years"
              type="number"
              min={0}
              value={yearsExperience}
              onChange={(event) => setYearsExperience(event.target.value)}
            />
          </Field>
          <Field label="Phone" htmlFor="s-phone">
            <Input
              id="s-phone"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="For the Call button"
            />
          </Field>
          <Field label="WhatsApp (optional)" htmlFor="s-whatsapp">
            <Input
              id="s-whatsapp"
              type="tel"
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Cover image URL" htmlFor="s-cover">
            <Input
              id="s-cover"
              type="url"
              value={coverImageUrl}
              onChange={(event) => setCoverImageUrl(event.target.value)}
              placeholder="https://…"
            />
          </Field>
          <Field label="Video URL" htmlFor="s-video">
            <Input
              id="s-video"
              type="url"
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
              placeholder="https://…"
            />
          </Field>
        </div>

        <p className="text-sm text-muted-foreground">
          Portfolio pieces and certificates are added from the service page once
          it exists.
        </p>
      </Section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={pending || title.trim().length < 3}>
          <Save className="size-4" />
          {pending
            ? "Saving…"
            : editing
              ? "Save changes"
              : "Publish service"}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={() => router.push("/dashboard/services")}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 rounded-2xl border p-5">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border"
      />
      {label}
    </label>
  );
}
