import type { Admin } from "./admin";
import { slugify } from "./fictional";

/** A business listing from any external source. Extend this to add new
 * importers — map each source's fields onto this shape and call
 * importBusinesses(). `ref` must be stable per business so re-imports update
 * the same row instead of creating duplicates. */
export type BusinessRecord = {
  ref: string;
  name: string;
  category?: string;
  description?: string;
  city?: string;
  country?: string;
  address?: string;
  website?: string;
  email?: string;
  phone?: string;
  logoUrl?: string;
  coverUrl?: string;
  employeesCount?: number;
  rating?: number;
};

/** Imports business listings as UNCLAIMED companies (no user account, no
 * owner). Keyed on (import_source, external_ref) so it is safe to re-run and
 * to extend with additional sources later. Owner-managed data is never
 * touched: this only writes rows tagged with the given source. */
export async function importBusinesses(
  admin: Admin,
  source: string,
  records: BusinessRecord[],
) {
  const importSource = source.startsWith("import:") ? source : `import:${source}`;
  const usedSlugs = new Set<string>();

  const rows = records.map((record) => {
    let slug = slugify(record.name) || record.ref;
    while (usedSlugs.has(slug)) slug = `${slug}-${usedSlugs.size + 1}`;
    usedSlugs.add(slug);

    return {
      slug,
      name: record.name,
      category: record.category ?? null,
      description: record.description ?? null,
      logo_url: record.logoUrl ?? null,
      cover_url: record.coverUrl ?? null,
      website: record.website ?? null,
      email: record.email ?? null,
      phone: record.phone ?? null,
      address: record.address ?? null,
      city: record.city ?? null,
      country: record.country ?? null,
      employees_count: record.employeesCount ?? null,
      rating: record.rating ?? null,
      // Imported businesses are always unclaimed and owner-less until claimed.
      is_claimed: false,
      verified: false,
      owner_id: null,
      import_source: importSource,
      external_ref: record.ref,
    };
  });

  const { error, count } = await admin
    .from("companies")
    .upsert(rows, {
      onConflict: "import_source,external_ref",
      count: "exact",
      // Never overwrite a business a user has since claimed.
      ignoreDuplicates: false,
    });

  if (error) throw new Error(`import ${importSource}: ${error.message}`);
  return count ?? rows.length;
}
