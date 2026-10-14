-- Clean up the demonstration feed (0027) as it appears on the live site.
--
-- Three problems, all in the data rather than the code:
--
-- 1. Broken punctuation. The seed file is valid UTF-8, but it reached the
--    database through a client that read it as Windows-1252, so every em dash
--    shows as "â€”" and every "m²" as "mÂ²". Re-encoding the damaged text as
--    Windows-1252 recovers the original bytes, which are then read as UTF-8.
--    Only rows that contain a mojibake marker are touched, and a row that does
--    not survive the round trip (it holds a character Windows-1252 cannot
--    represent, so it was never double-encoded) is left exactly as it is.
--
-- 2. Downloads that do not download. Seven demo posts carried a file card
--    ("G+1 villa — bill of quantities.xlsx · 821 downloads") whose link was the
--    post's placeholder icon, an SVG. Nothing real was ever delivered. The
--    cards are removed; a demo post that wants a download needs a real file.
--
-- 3. Invented engagement. Demo posts showed 1.5k likes and 800 downloads that
--    nobody made. On a new platform that is the number a visitor checks first,
--    and once one is found to be invented none of the others are believed.
--    Counters on demo posts are recounted from real likes, saves, views and
--    comments; anything with no record behind it goes to zero.
--
-- Scoped to `is_demo` throughout. Idempotent: a second run finds nothing to
-- repair, no files to remove and counters already at their correct values.

create or replace function pg_temp.medosha_unmojibake(value text)
returns text
language plpgsql
as $$
declare
  repaired text;
begin
  if value is null or value !~ '(â€|Â|Ã)' then
    return value;
  end if;
  begin
    repaired := convert_from(convert_to(value, 'WIN1252'), 'UTF8');
  exception when others then
    return value;
  end;
  return repaired;
end;
$$;

update public.feed_posts
set
  title           = pg_temp.medosha_unmojibake(title),
  body            = pg_temp.medosha_unmojibake(body),
  author_name     = pg_temp.medosha_unmojibake(author_name),
  author_role     = pg_temp.medosha_unmojibake(author_role),
  author_location = pg_temp.medosha_unmojibake(author_location),
  link_label      = pg_temp.medosha_unmojibake(link_label),
  price_unit      = pg_temp.medosha_unmojibake(price_unit),
  city            = pg_temp.medosha_unmojibake(city),
  region          = pg_temp.medosha_unmojibake(region)
where is_demo
  and concat_ws(' ', title, body, author_name, author_role, author_location,
                link_label, price_unit, city, region) ~ '(â€|Â|Ã)';

update public.feed_media m
set
  alt   = pg_temp.medosha_unmojibake(m.alt),
  label = pg_temp.medosha_unmojibake(m.label)
from public.feed_posts p
where p.id = m.post_id
  and p.is_demo
  and concat_ws(' ', m.alt, m.label) ~ '(â€|Â|Ã)';

update public.feed_comments
set
  body        = pg_temp.medosha_unmojibake(body),
  author_name = pg_temp.medosha_unmojibake(author_name)
where is_demo
  and concat_ws(' ', body, author_name) ~ '(â€|Â|Ã)';

-- The download cards that pointed at placeholder artwork.
delete from public.feed_files f
using public.feed_posts p
where p.id = f.post_id
  and p.is_demo
  and f.url like '/images/feed/%.svg';

-- Counters are recounted from the rows that record real actions, so a like a
-- real member gave a demo post survives; only the invented part goes. Shares
-- and downloads have no such table, so nothing real can be lost by zeroing.
with actual as (
  select
    p.id,
    (select count(*) from public.feed_likes l    where l.post_id = p.id)::int as likes,
    (select count(*) from public.feed_saves s    where s.post_id = p.id)::int as saves,
    (select count(*) from public.feed_views v    where v.post_id = p.id)::int as views,
    (select count(*) from public.feed_comments c where c.post_id = p.id)::int as comments
  from public.feed_posts p
  where p.is_demo
)
update public.feed_posts p
set
  like_count     = a.likes,
  save_count     = a.saves,
  view_count     = a.views,
  comment_count  = a.comments,
  share_count    = 0,
  download_count = 0
from actual a
where p.id = a.id
  and (p.like_count, p.save_count, p.view_count, p.comment_count, p.share_count, p.download_count)
      is distinct from (a.likes, a.saves, a.views, a.comments, 0, 0);

update public.feed_comments c
set like_count = (select count(*) from public.feed_comment_likes l where l.comment_id = c.id)
where c.is_demo
  and c.like_count <> (select count(*) from public.feed_comment_likes l where l.comment_id = c.id);
