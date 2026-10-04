-- Project Showcase: one portfolio for every kind of work, not just buildings.
--
-- 0004 built the projects table around a house: building_type, bedrooms,
-- floors. A joiner publishing a wardrobe, or a kitchen fitter publishing a
-- kitchen, had to leave most of the form blank and then look at "Bedrooms: —"
-- on their own project page.
--
-- The fix is a category and a bag of category-specific fields, not fourteen
-- new nullable columns and not fourteen new tables. A kitchen's countertop
-- material is meaningless to an electrician and there is no query that wants
-- to sort by it, so it does not deserve a column; what every category does
-- need is a title, a place, photographs and a description, and those stay
-- columns because everything reads them.

-- ---------------------------------------------------------------------------
-- The category
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.project_category as enum (
    'building_construction',
    'architecture',
    'interior_design',
    'kitchen',
    'furniture',
    'wardrobe',
    'joinery',
    'renovation',
    'finishing',
    'electrical',
    'plumbing',
    'landscaping',
    'construction_product',
    'other'
  );
exception when duplicate_object then null; end $$;

alter table public.projects
  add column if not exists category public.project_category
    not null default 'building_construction';

comment on column public.projects.category is
  'What kind of work this is. Decides which fields the form asks for and which the project page shows.';

-- Existing rows are building projects and stay building projects — that is
-- what the default gives them. Three building_type values name a category
-- outright, though, and a project already tagged "interior" is an interior
-- design project whatever the default says. Backfilled here rather than left
-- to a person to re-pick, because the information is already in the row.
--
-- Only rows that predate this column: `category is not distinct from` the
-- default would also catch a future row the user deliberately set to
-- building_construction, but at this point in the migration there are none.
update public.projects
set category = case building_type
  when 'interior' then 'interior_design'::public.project_category
  when 'landscape' then 'landscaping'::public.project_category
  when 'renovation' then 'renovation'::public.project_category
end
where building_type in ('interior', 'landscape', 'renovation');

create index if not exists projects_category_idx on public.projects (category);

-- ---------------------------------------------------------------------------
-- The category-specific fields
-- ---------------------------------------------------------------------------

-- One jsonb column rather than a column per category. What goes in it is
-- decided by src/lib/constants/project-categories.ts, which the server action
-- uses as an allow-list: a key that is not in the selected category's field
-- list never reaches this column, so it cannot fill up with junk from a
-- crafted form post.
--
-- Nothing here is queried or sorted on. The moment something is — "every
-- L-shaped kitchen in Addis" — it earns a column and a backfill, and this
-- column stops being where it lives.
alter table public.projects
  add column if not exists metadata jsonb not null default '{}'::jsonb;

comment on column public.projects.metadata is
  'Category-specific answers, keyed by the field ids in project-categories.ts. Display only; nothing queries it.';

do $$ begin
  alter table public.projects
    add constraint projects_metadata_is_object
    check (jsonb_typeof(metadata) = 'object');
exception when duplicate_object then null; end $$;

-- A bag with no shape still needs a ceiling. Without one, a form post is a way
-- to write a megabyte into somebody's row.
do $$ begin
  alter table public.projects
    add constraint projects_metadata_bounded
    check (pg_column_size(metadata) <= 8192);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists tags text[] not null default '{}'::text[];

comment on column public.projects.tags is
  'Skills or techniques used, free text. Shown on the project page.';

do $$ begin
  alter table public.projects
    add constraint projects_tags_bounded
    check (
      array_length(tags, 1) is null
      or (
        array_length(tags, 1) <= 20
        -- `<> all` is an array operator. The obvious spelling of "no tag is
        -- longer than 40" is a subquery over unnest(), and PostgreSQL refuses
        -- a subquery in a check constraint outright, so the total is bounded
        -- instead of each element.
        and '' <> all (tags)
        and char_length(array_to_string(tags, '')) <= 800
      )
    );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Two more things a project can be
-- ---------------------------------------------------------------------------

-- `draft` is unfinished; `private` is finished but not for the public;
-- `archived` is done with. They are all "not published", which is what the
-- select policy from 0004 already keys on:
--
--     using (status = 'published' or auth.uid() = owner_id)
--
-- so these two are owner-only from the moment they exist, without touching the
-- policy. Nothing in this migration may *use* the new labels — PostgreSQL
-- refuses to read an enum value added in the same transaction — which is why
-- there is no backfill and no constraint mentioning them here.
alter type public.project_status add value if not exists 'private';
alter type public.project_status add value if not exists 'archived';
