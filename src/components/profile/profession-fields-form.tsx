"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  detailFieldName,
  fieldsFor,
  isAnswered,
  type FieldValue,
  type ProfessionDetails,
  type ProfessionField,
} from "@/lib/profile/profession-fields";
import { cn } from "@/lib/utils";

/**
 * The questions that belong to one trade, rendered from the configuration.
 *
 * There is no contractor form and no architect form. This walks
 * `profession-fields.ts` and renders whatever it finds, so a new trade is an
 * entry in that file and nothing here changes.
 *
 * ## Why it re-renders as the trade changes
 *
 * The profession input lives in `TradeAndAreas` and is already controlled, so
 * this takes the current value as a prop rather than reading the form. Change
 * the trade and the questions change under it — which is the behaviour the
 * brief asks for, and is also the reason nothing is uncontrolled here: React
 * keeps a `defaultValue` from the trade you had a moment ago.
 *
 * ## Nothing you typed is thrown away
 *
 * Switching trade hides fields; it does not clear them. The values are held on
 * the server in `profession_details` and only the shown ones are posted, so
 * what an earlier trade asked stays where it was and comes back if you go
 * back. The form does not have to remember it, which is the point — a browser
 * tab that remembers is a browser tab that loses it on refresh.
 */
export function ProfessionFieldsForm({
  profession,
  details,
}: {
  profession: string;
  details: ProfessionDetails;
}) {
  const fields = fieldsFor([profession]);
  if (fields.length === 0) return null;

  const answered = fields.filter(
    (f) => f.required && isAnswered(f, details[f.id]),
  ).length;
  const requiredCount = fields.filter((f) => f.required).length;

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">What clients ask a {profession}</p>
        <span className="text-xs text-muted-foreground">
          {answered} of {requiredCount} answered
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        These are this trade&apos;s own questions. Change your profession and
        they change with it — nothing you have already filled in is deleted.
      </p>

      <div className="space-y-4">
        {fields.map((field) => (
          <FieldInput
            // Keyed on the trade as well as the id: two trades can ask the
            // same question with different options, and React would otherwise
            // keep the first one's DOM node and its stale choices.
            key={`${profession}:${field.id}`}
            field={field}
            value={details[field.id]}
          />
        ))}
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
}: {
  field: ProfessionField;
  value: FieldValue | undefined;
}) {
  const name = detailFieldName(field.id);
  const id = `detail-${field.id}`;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <Label htmlFor={field.type === "multi" ? undefined : id}>
          {field.label}
        </Label>
        {!field.required && (
          <span className="text-xs text-muted-foreground">Optional</span>
        )}
      </div>

      {field.type === "multi" ? (
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((option) => {
            const on = Array.isArray(value) && value.includes(option);
            return (
              <label
                key={option}
                className={cn(
                  "flex min-h-9 cursor-pointer items-center rounded-full border px-3 text-sm transition-colors",
                  on
                    ? "border-brand bg-brand text-brand-foreground"
                    : "hover:bg-muted",
                )}
              >
                <input
                  type="checkbox"
                  name={name}
                  value={option}
                  defaultChecked={on}
                  className="sr-only"
                />
                {option}
              </label>
            );
          })}
        </div>
      ) : field.type === "select" ? (
        <select
          id={id}
          name={name}
          defaultValue={typeof value === "string" ? value : ""}
          className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Not said</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : field.type === "boolean" ? (
        // Three states, not a tick box. A tick box has no way to say "I have
        // not answered this", so an unticked one counts as a completed "no"
        // and the bar fills itself in.
        <select
          id={id}
          name={name}
          defaultValue={value === true ? "yes" : value === false ? "no" : ""}
          className="min-h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
        >
          <option value="">Not said</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      ) : field.type === "textarea" ? (
        <Textarea
          id={id}
          name={name}
          rows={3}
          defaultValue={typeof value === "string" ? value : ""}
          placeholder={field.placeholder}
        />
      ) : (
        <Input
          id={id}
          name={name}
          // Never `type="number"`. It accepts "e", "+" and "-" and reports the
          // lot as empty, which is the bug the years-of-experience field was
          // fixed for; `inputMode` gets the phone keypad without it.
          type="text"
          inputMode={field.type === "number" ? "numeric" : undefined}
          defaultValue={
            typeof value === "string" || typeof value === "number"
              ? String(value)
              : ""
          }
          placeholder={field.placeholder}
        />
      )}

      {field.help && (
        <p className="text-xs text-muted-foreground">{field.help}</p>
      )}
    </div>
  );
}
