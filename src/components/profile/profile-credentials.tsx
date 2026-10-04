import { Award, BadgeCheck } from "lucide-react";

import type { ProfileCredential } from "@/lib/data/professional-profile";

/**
 * Certificates and licences.
 *
 * `verified` on the row means a moderator has seen the document, and only that
 * case gets the tick. An uploaded certificate nobody has looked at is listed
 * as what it is — a claim — because a badge on an unchecked document says
 * something Medosha has not established, and the person reading it is deciding
 * whether to hand over money.
 */
export function ProfileCredentials({
  credentials,
}: {
  credentials: ProfileCredential[];
}) {
  if (credentials.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">
        Certificates and licences
      </h2>
      <ul className="space-y-2">
        {credentials.map((credential) => (
          <li
            key={credential.id}
            className="flex items-start gap-3 rounded-xl border p-3"
          >
            <Award className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                {credential.name}
                {credential.verified ? (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-normal text-emerald-600 dark:text-emerald-500"
                    title="A moderator has seen this document."
                  >
                    <BadgeCheck className="size-3.5" /> Checked
                  </span>
                ) : (
                  <span
                    className="text-xs font-normal text-muted-foreground"
                    title="Uploaded by its holder. Medosha has not checked it."
                  >
                    Self-declared
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {[
                  credential.issuer,
                  credential.issued_on
                    ? new Date(credential.issued_on).getFullYear().toString()
                    : null,
                  credential.serviceTitle || null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
