-- Supports the progressive-profile flow: new users land straight on the
-- dashboard with an auto-generated username, and fill in the rest of their
-- profile (including account_type) later via /profile/edit.

-- Phone-only sign-ups have no auth.users.email, so profiles.email must be
-- nullable (this was missed in 0001 and would have broken phone signup).
alter table public.profiles alter column email drop not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
begin
  base := lower(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    split_part(coalesce(new.email, ''), '@', 1)
  ));
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := trim(both '-' from base);
  if base is null or length(base) < 1 then
    base := 'user';
  end if;
  base := left(base, 20);
  candidate := base || '-' || left(replace(new.id::text, '-', ''), 8);

  insert into public.profiles (id, email, full_name, username)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name', candidate);
  return new;
end;
$$;
