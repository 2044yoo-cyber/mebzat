"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AiField } from "@/components/ai/writing/ai-field";
import { createBrief, type BriefInput } from "@/app/hire/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BUDGET_KIND, CONTRACT_SHAPE } from "@/lib/constants/services";
import { cn } from "@/lib/utils";
import type {
  BudgetKind,
  ContractShape,
  ServiceCategory,
} from "@/types/database.types";

/**
 * Posts a project brief.
 *
 * The category and the required skills drive the matcher, so they are the one
 * part of the form that is not optional — a brief nobody is told about is a
 * brief nobody bids on.
 */

const EXAMPLES = [
  "Kitchen Renovation",
  "Wardrobe Installation",
  "Villa Construction",
  "Office Interior",
  "Hotel Flooring",
  "Electrical Installation",
  "Painting",
  "Roof Replacement",
];

export function BriefForm({ categories }: { categories: ServiceCategory[] }) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(categories[0]?.slug ?? "");
  const [subcategory, setSubcategory] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [contractShape, setContractShape] =
    useState<ContractShape>("supply_and_fit");
  const [budgetKind, setBudgetKind] = useState<BudgetKind>("range");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [locationCity, setLocationCity] = useState("Addis Ababa");
  const [startsOn, setStartsOn] = useState("");
  const [deadlineOn, setDeadlineOn] = useState("");
  const [bidsCloseOn, setBidsCloseOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const today = new Date().toISOString().slice(0, 10);
  const needsBudget = budgetKind !== "open";

  function toggleSkill(slug: string) {
    setSkills((current) =>
      current.includes(slug)
        ? current.filter((item) => item !== slug)
        : [...current, slug],
    );
  }

  function optionalNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const input: BriefInput = {
      title,
      description,
      category,
      subcategory,
      // The chosen category always counts as a required skill, so a client who
      // skips the extra chips still gets matched.
      requiredSkills: [...new Set([category, ...skills])].filter(Boolean),
      contractShape,
      budgetKind,
      budgetMin: needsBudget ? optionalNumber(budgetMin) : null,
      budgetMax: needsBudget ? optionalNumber(budgetMax) : null,
      locationCity,
      startsOn: startsOn || null,
      deadlineOn: deadlineOn || null,
      bidsCloseOn: bidsCloseOn || null,
    };

    startTransition(async () => {
      const result = await createBrief(input);
      if (result.error) {
        setError(result.error);
        return;
      }
      toast.success(
        result.invited
          ? `Published — ${result.invited} matching professionals notified`
          : "Project published",
      );
      if (result.id) router.push(`/hire/${result.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Section title="What needs doing?">
        <Field label="Project title" htmlFor="b-title">
          <Input
            id="b-title"
            required
            maxLength={200}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setError(null);
            }}
            placeholder="e.g. Fitted wardrobes for three bedrooms in Bole"
          />
        </Field>

        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              type="button"
              onClick={() => setTitle(example)}
              className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand hover:text-foreground"
            >
              {example}
            </button>
          ))}
        </div>

        <Field label="Describe the work" htmlFor="b-description">
          <AiField
            id="b-description"
            required
            surface="project"
            value={description}
            maxLength={5000}
            onValueChange={(next) => {
              setDescription(next);
              setError(null);
            }}
            placeholder="Rooms, sizes, materials you have in mind, what is already done, anything a bidder needs to price it properly."
            className="min-h-32"
          />
        </Field>
      </Section>

      <Section title="Who should see it?">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Main category" htmlFor="b-category">
            <select
              id="b-category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="h-9 w-full rounded-lg border bg-transparent px-2.5 text-sm"
            >
              {categories.map((entry) => (
                <option key={entry.id} value={entry.slug}>
                  {entry.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Subcategory" htmlFor="b-subcategory">
            <Input
              id="b-subcategory"
              value={subcategory}
              onChange={(event) => setSubcategory(event.target.value)}
              placeholder="Optional"
            />
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">
            Other trades that could bid
            <span className="ml-1 font-normal text-muted-foreground">
              (a wardrobe job might also suit interior designers)
            </span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {categories
              .filter((entry) => entry.slug !== category)
              .map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  aria-pressed={skills.includes(entry.slug)}
                  onClick={() => toggleSkill(entry.slug)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-sm transition-colors",
                    skills.includes(entry.slug)
                      ? "border-brand bg-brand text-brand-foreground"
                      : "hover:border-brand hover:bg-brand/5",
                  )}
                >
                  {entry.name}
                </button>
              ))}
          </div>
        </div>

        <p className="flex items-start gap-2 rounded-lg bg-brand/5 p-3 text-sm text-muted-foreground">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-brand" />
          When you publish, Medosha notifies the professionals whose services,
          budget, location and availability match — you do not have to find
          them.
        </p>
      </Section>

      <Section title="How is it contracted?">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CONTRACT_SHAPE) as ContractShape[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={contractShape === value}
              onClick={() => setContractShape(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                contractShape === value
                  ? "border-brand bg-brand text-brand-foreground"
                  : "hover:border-brand hover:bg-brand/5",
              )}
            >
              {CONTRACT_SHAPE[value]}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Budget">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(BUDGET_KIND) as BudgetKind[]).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={budgetKind === value}
              onClick={() => setBudgetKind(value)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                budgetKind === value
                  ? "border-brand bg-brand text-brand-foreground"
                  : "hover:border-brand hover:bg-brand/5",
              )}
            >
              {BUDGET_KIND[value]}
            </button>
          ))}
        </div>

        {needsBudget && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label={budgetKind === "fixed" ? "Budget (ETB)" : "From (ETB)"}
              htmlFor="b-min"
            >
              <Input
                id="b-min"
                type="number"
                min={0}
                step="any"
                value={budgetMin}
                onChange={(event) => {
                  setBudgetMin(event.target.value);
                  setError(null);
                }}
              />
            </Field>
            {budgetKind === "range" && (
              <Field label="Up to (ETB)" htmlFor="b-max">
                <Input
                  id="b-max"
                  type="number"
                  min={0}
                  step="any"
                  value={budgetMax}
                  onChange={(event) => setBudgetMax(event.target.value)}
                />
              </Field>
            )}
          </div>
        )}
      </Section>

      <Section title="Where and when">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="City" htmlFor="b-city">
            <Input
              id="b-city"
              value={locationCity}
              onChange={(event) => setLocationCity(event.target.value)}
            />
          </Field>
          <Field label="Bids close on" htmlFor="b-close">
            <Input
              id="b-close"
              type="date"
              min={today}
              value={bidsCloseOn}
              onChange={(event) => setBidsCloseOn(event.target.value)}
            />
          </Field>
          <Field label="Ideally starts" htmlFor="b-start">
            <Input
              id="b-start"
              type="date"
              min={today}
              value={startsOn}
              onChange={(event) => {
                setStartsOn(event.target.value);
                setError(null);
              }}
            />
          </Field>
          <Field label="Needs finishing by" htmlFor="b-deadline">
            <Input
              id="b-deadline"
              type="date"
              min={startsOn || today}
              value={deadlineOn}
              onChange={(event) => setDeadlineOn(event.target.value)}
            />
          </Field>
        </div>
      </Section>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          size="lg"
          disabled={
            pending || title.trim().length < 6 || description.trim().length < 20
          }
        >
          <Send className="size-4" />
          {pending ? "Publishing…" : "Publish and notify professionals"}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          onClick={() => router.push("/hire")}
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
