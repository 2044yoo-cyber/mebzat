import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";

import { PersonRow } from "@/components/admin/person-row";
import { listPeople } from "@/lib/admin/people";

export const metadata: Metadata = { title: "People — control room" };
export const dynamic = "force-dynamic";

/**
 * The accounts on the platform.
 *
 * If there are none, that is what it says. Nothing is invented to make the
 * page look busy — an operator who sees three accounts should see three.
 */
export default async function AdminPeoplePage(props: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await props.searchParams;
  const people = await listPeople(q ?? "");
  if (!people) notFound();

  return (
    <div className="space-y-4">
      <form className="flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Name, handle or company"
          aria-label="Search people"
          className="min-w-0 flex-1 rounded-xl border bg-background px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-xl border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Search
        </button>
      </form>

      {people.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <Users className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">
            {q ? "Nobody matches that" : "No accounts yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {q
              ? "Try a different name or handle."
              : "People appear here as they sign up."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {people.map((person) => (
            <PersonRow key={person.id} person={person} />
          ))}
        </ul>
      )}
    </div>
  );
}
