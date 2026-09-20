import {
  detailsOf,
  fieldsFor,
  isAnswered,
  type FieldValue,
  type ProfessionField,
} from "@/lib/profile/profession-fields";
import type { Profile } from "@/types/database.types";

/**
 * What this trade said about itself, on the public profile.
 *
 * Only what was answered. A field left empty is not rendered as "—" and a
 * field belonging to a trade this person no longer practises is not rendered
 * at all: the answers stay in the column so changing trade loses nothing, and
 * the page shows the trade they actually do.
 *
 * The marketplace card is untouched and stays as it was — a name, a trade, a
 * rating and where they work. This is the detail you come to the full profile
 * for, which is the only place it fits.
 */
export function ProfessionDetails({ profile }: { profile: Profile }) {
  const stored = detailsOf(profile);
  const answered = fieldsFor([profile.profession]).filter((field) =>
    isAnswered(field, stored[field.id]),
  );

  if (answered.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        {profile.profession} details
      </h2>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {answered.map((field) => (
          <div key={field.id} className="space-y-1">
            <dt className="text-xs text-muted-foreground">{field.label}</dt>
            <dd className="text-sm">
              <Answer field={field} value={stored[field.id]} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Answer({
  field,
  value,
}: {
  field: ProfessionField;
  value: FieldValue | undefined;
}) {
  if (field.type === "multi" && Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {value.map((item) => (
          <span key={item} className="rounded-full border px-2 py-0.5 text-xs">
            {item}
          </span>
        ))}
      </span>
    );
  }
  if (field.type === "boolean") return <>{value === true ? "Yes" : "No"}</>;
  if (field.type === "textarea") {
    return <span className="whitespace-pre-line">{String(value)}</span>;
  }
  return <>{String(value)}</>;
}
