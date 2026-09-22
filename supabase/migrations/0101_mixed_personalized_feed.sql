-- Mixed source adapters + deterministic personalized Home ranking.
begin;

create table if not exists public.feed_interactions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  kind text not null check (kind in ('open', 'tour_view', 'share', 'source_save', 'contact', 'request_quote')),
  weight numeric not null,
  interaction_count integer not null default 1,
  last_interacted_at timestamptz not null default now(),
  primary key (user_id, post_id, kind)
);
create index if not exists feed_interactions_user_idx
  on public.feed_interactions(user_id, last_interacted_at desc);
alter table public.feed_interactions enable row level security;
create policy "Users read own feed interactions" on public.feed_interactions
  for select to authenticated using (user_id = auth.uid());

create or replace function public.feed_record_interaction(p_post uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  signal_weight numeric := case p_kind
    when 'open' then 1 when 'tour_view' then 3 when 'share' then 4 when 'source_save' then 5
    when 'contact' then 6 when 'request_quote' then 6 else null end;
begin
  if uid is null or signal_weight is null then return; end if;
  insert into public.feed_interactions(user_id, post_id, kind, weight)
  values (uid, p_post, p_kind, signal_weight)
  on conflict (user_id, post_id, kind) do update set
    interaction_count = public.feed_interactions.interaction_count + 1,
    weight = excluded.weight,
    last_interacted_at = now();
end;
$$;
grant execute on function public.feed_record_interaction(uuid, text) to authenticated;

create or replace function public.feed_store_source_signal(
  p_user uuid,p_entity_type text,p_entity uuid,p_kind text,p_weight numeric,p_remove boolean default false
) returns void language plpgsql security definer set search_path=public as $$
declare post uuid;
begin
  select id into post from public.feed_posts where entity_type=p_entity_type and entity_id=p_entity limit 1;
  if post is null then return; end if;
  if p_remove then
    delete from public.feed_interactions where user_id=p_user and post_id=post and kind=p_kind;
  else
    insert into public.feed_interactions(user_id,post_id,kind,weight)
    values(p_user,post,p_kind,p_weight)
    on conflict(user_id,post_id,kind) do update set weight=excluded.weight,
      interaction_count=public.feed_interactions.interaction_count+1,last_interacted_at=now();
  end if;
end $$;
revoke execute on function public.feed_store_source_signal(uuid,text,uuid,text,numeric,boolean)
from public,anon,authenticated;

create or replace function public.feed_property_save_signal() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  if tg_op='DELETE' then
    perform public.feed_store_source_signal(old.user_id,'property',old.property_id,'source_save',5,true);
    return old;
  end if;
  perform public.feed_store_source_signal(new.user_id,'property',new.property_id,'source_save',5,false);
  return new; end $$;
create trigger property_saves_feed_signal after insert or delete on public.property_saves
for each row execute function public.feed_property_save_signal();

create or replace function public.feed_product_save_signal() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  if tg_op='DELETE' then
    perform public.feed_store_source_signal(old.user_id,'product',old.product_id,'source_save',5,true);
    return old;
  end if;
  perform public.feed_store_source_signal(new.user_id,'product',new.product_id,'source_save',5,false);
  return new; end $$;
create trigger product_saves_feed_signal after insert or delete on public.product_favorites
for each row execute function public.feed_product_save_signal();

create or replace function public.feed_property_contact_signal() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  perform public.feed_store_source_signal(new.sender_id,'property',new.property_id,'contact',6,false);
  return new; end $$;
create trigger property_inquiry_feed_signal after insert on public.property_inquiries
for each row execute function public.feed_property_contact_signal();

create or replace function public.feed_design_quote_signal() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  perform public.feed_store_source_signal(new.requester_id,'design',new.design_id,'request_quote',6,false);
  return new; end $$;
create trigger design_quote_feed_signal after insert on public.manufacturing_requests
for each row execute function public.feed_design_quote_signal();
revoke execute on function public.feed_property_save_signal() from public,anon,authenticated;
revoke execute on function public.feed_product_save_signal() from public,anon,authenticated;
revoke execute on function public.feed_property_contact_signal() from public,anon,authenticated;
revoke execute on function public.feed_design_quote_signal() from public,anon,authenticated;

-- Lightweight adapters reference source rows; source records remain canonical.
create unique index if not exists feed_posts_source_once
  on public.feed_posts(entity_type, entity_id)
  where entity_type in ('property', 'project', 'product', 'price_listing');

create or replace function public.feed_upsert_source(
  p_entity_type text, p_entity_id uuid, p_visible boolean,
  p_kind public.feed_kind, p_topic public.feed_topic,
  p_owner uuid, p_company uuid, p_title text, p_body text,
  p_href text, p_label text, p_price numeric, p_currency text, p_unit text,
  p_city text, p_region text, p_tags text[], p_image text, p_published timestamptz
) returns void language plpgsql security definer set search_path = public as $$
declare
  post uuid;
  profile record;
begin
  perform pg_advisory_xact_lock(hashtext(p_entity_type), hashtext(p_entity_id::text));
  select id into post from public.feed_posts
   where entity_type = p_entity_type and entity_id = p_entity_id limit 1;
  if not p_visible then
    if post is not null then update public.feed_posts set status = 'hidden' where id = post; end if;
    return;
  end if;
  select full_name, company_name, avatar_url, location_city, location_country,
         verification_status, profession into profile
    from public.profiles where id = p_owner;
  if post is null then
    insert into public.feed_posts(
      kind, topic, title, body, author_id, company_id, author_key, author_name,
      author_role, author_avatar_url, author_verified, link_href, link_label,
      entity_type, entity_id, price_amount, price_currency, price_unit,
      city, region, tags, status, published_at
    ) values (
      p_kind, p_topic, p_title, p_body, p_owner, p_company, 'profile:' || p_owner,
      coalesce(profile.company_name, profile.full_name, 'Medosha member'), profile.profession,
      profile.avatar_url, profile.verification_status = 'verified', p_href, p_label,
      p_entity_type, p_entity_id, p_price, coalesce(p_currency, 'ETB'), p_unit,
      p_city, p_region, coalesce(p_tags, '{}'), 'published', coalesce(p_published, now())
    ) returning id into post;
  else
    update public.feed_posts set
      kind=p_kind, topic=p_topic, title=p_title, body=p_body, author_id=p_owner,
      company_id=p_company, link_href=p_href, link_label=p_label,
      price_amount=p_price, price_currency=coalesce(p_currency,'ETB'), price_unit=p_unit,
      city=p_city, region=p_region, tags=coalesce(p_tags,'{}'), status='published',
      updated_at=now()
    where id=post;
  end if;
  delete from public.feed_media where post_id=post;
  if p_image is not null and length(p_image) > 0 then
    insert into public.feed_media(post_id, kind, url, alt, position)
    values(post, 'image', p_image, p_title, 0);
  end if;
end;
$$;
revoke execute on function public.feed_upsert_source(text,uuid,boolean,public.feed_kind,
 public.feed_topic,uuid,uuid,text,text,text,text,numeric,text,text,text,text,text[],text,timestamptz)
from public,anon,authenticated;

create or replace function public.feed_sync_property() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  perform public.feed_upsert_source('property', new.id, new.status::text='available',
    'property','property',new.owner_id,new.company_id,new.title,new.description,
    '/property/'||new.id,'View property',new.price,new.currency,
    case when new.listing_kind::text in ('rent','lease') then new.price_period else 'total' end,
    new.location_city,new.location_country,
    array[new.property_type::text,new.listing_kind::text] || case when new.has_360 then array['360'] else '{}' end,
    new.cover_image_url,new.created_at); return new; end $$;
drop trigger if exists properties_feed_sync on public.properties;
create trigger properties_feed_sync after insert or update on public.properties
for each row execute function public.feed_sync_property();
revoke execute on function public.feed_sync_property() from public,anon,authenticated;

create or replace function public.feed_sync_project() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  perform public.feed_upsert_source('project',new.id,new.status::text='published',
    'progress','construction',new.owner_id,null,new.title,new.description,
    '/projects/'||new.id,'View project',new.budget,new.budget_currency,'project estimate',
    new.location_city,new.location_country,
    array_remove(array[new.building_type::text,new.style,'project'],null),new.cover_image_url,new.created_at);
  return new; end $$;
drop trigger if exists projects_feed_sync on public.projects;
create trigger projects_feed_sync after insert or update on public.projects
for each row execute function public.feed_sync_project();
revoke execute on function public.feed_sync_project() from public,anon,authenticated;

create or replace function public.feed_sync_product() returns trigger
language plpgsql security definer set search_path=public as $$
declare category text; k public.feed_kind; t public.feed_topic; begin
  select slug into category from public.product_categories where id=new.category_id;
  k := case when category='furniture' then 'furniture'::public.feed_kind
            when category='construction-materials' then 'material'::public.feed_kind
            else 'equipment'::public.feed_kind end;
  t := case when category in ('furniture','kitchen','bathroom','lighting') then 'design'::public.feed_topic
            else 'materials'::public.feed_topic end;
  perform public.feed_upsert_source('product',new.id,new.status::text='published',k,t,
    new.owner_id,null,new.title,new.description,'/marketplace/'||new.id,'View product',
    new.price,new.currency,new.unit,new.location_city,new.location_country,
    array_remove(array[category,new.brand,'marketplace'],null),new.cover_image_url,new.created_at);
  return new; end $$;
drop trigger if exists products_feed_sync on public.products;
create trigger products_feed_sync after insert or update on public.products
for each row execute function public.feed_sync_product();
revoke execute on function public.feed_sync_product() from public,anon,authenticated;

create or replace function public.feed_sync_price() returns trigger
language plpgsql security definer set search_path=public as $$ begin
  perform public.feed_upsert_source('price_listing',new.id,new.published,'price_update',
    case when new.sector::text in ('material','equipment') then 'materials'::public.feed_topic else 'design'::public.feed_topic end,
    new.supplier_id,new.company_id,new.item,new.specification,'/price-exchange/'||new.id,'View prices',
    new.current_price,new.currency,new.unit,new.location_city,new.location_country,
    array_remove(array[new.sector::text,new.category,new.brand,'price'],null),null,new.created_at);
  return new; end $$;
drop trigger if exists price_listings_feed_sync on public.price_listings;
create trigger price_listings_feed_sync after insert or update on public.price_listings
for each row execute function public.feed_sync_price();
revoke execute on function public.feed_sync_price() from public,anon,authenticated;

create or replace function public.feed_hide_deleted_source() returns trigger
language plpgsql security definer set search_path=public as $$
declare source_type text := case tg_table_name
  when 'properties' then 'property' when 'projects' then 'project'
  when 'products' then 'product' when 'price_listings' then 'price_listing' end;
begin
  update public.feed_posts set status='hidden',updated_at=now()
  where entity_type=source_type and entity_id=old.id;
  return old;
end $$;
create trigger properties_feed_delete after delete on public.properties
for each row execute function public.feed_hide_deleted_source();
create trigger projects_feed_delete after delete on public.projects
for each row execute function public.feed_hide_deleted_source();
create trigger products_feed_delete after delete on public.products
for each row execute function public.feed_hide_deleted_source();
create trigger prices_feed_delete after delete on public.price_listings
for each row execute function public.feed_hide_deleted_source();
revoke execute on function public.feed_hide_deleted_source() from public,anon,authenticated;

-- Backfill existing public records through the same adapter.
select public.feed_upsert_source('property',p.id,p.status::text='available','property','property',
 p.owner_id,p.company_id,p.title,p.description,'/property/'||p.id,'View property',p.price,p.currency,
 case when p.listing_kind::text in ('rent','lease') then p.price_period else 'total' end,
 p.location_city,p.location_country,array[p.property_type::text,p.listing_kind::text] ||
 case when p.has_360 then array['360'] else '{}'::text[] end,p.cover_image_url,p.created_at)
from public.properties p;
select public.feed_upsert_source('project',p.id,p.status::text='published','progress','construction',
 p.owner_id,null,p.title,p.description,'/projects/'||p.id,'View project',p.budget,p.budget_currency,
 'project estimate',p.location_city,p.location_country,array_remove(array[p.building_type::text,p.style,'project'],null),p.cover_image_url,p.created_at)
from public.projects p;
select public.feed_upsert_source('product',p.id,p.status::text='published',
 case when c.slug='furniture' then 'furniture'::public.feed_kind
      when c.slug='construction-materials' then 'material'::public.feed_kind
      else 'equipment'::public.feed_kind end,
 case when c.slug in ('furniture','kitchen','bathroom','lighting') then 'design'::public.feed_topic
      else 'materials'::public.feed_topic end,
 p.owner_id,null,p.title,p.description,'/marketplace/'||p.id,'View product',p.price,p.currency,p.unit,
 p.location_city,p.location_country,array_remove(array[c.slug,p.brand,'marketplace'],null),p.cover_image_url,p.created_at)
from public.products p left join public.product_categories c on c.id=p.category_id;
select public.feed_upsert_source('price_listing',p.id,p.published,'price_update',
 case when p.sector::text in ('material','equipment') then 'materials'::public.feed_topic else 'design'::public.feed_topic end,
 p.supplier_id,p.company_id,p.item,p.specification,'/price-exchange/'||p.id,'View prices',p.current_price,p.currency,p.unit,
 p.location_city,p.location_country,array_remove(array[p.sector::text,p.category,p.brand,'price'],null),null,p.created_at)
from public.price_listings p;

-- Personalized ranking. Interest is capped: behavior leads but never filters
-- discovery content out. Likes=3, saves=5, opens=1, 360=3, contact/quote=6.
create or replace function public.feed_page_personalized(
  p_limit integer default 12, p_now timestamptz default now(),
  p_after_score numeric default null, p_after_id uuid default null,
  p_kinds public.feed_kind[] default null, p_topics public.feed_topic[] default null,
  p_author_key text default null, p_saved_only boolean default false,
  p_following_only boolean default false, p_search text default null,
  p_seen_ids uuid[] default null, p_seed integer default 0,
  p_cooldown_hours integer default 168
) returns table (
  id uuid, kind public.feed_kind, topic public.feed_topic, title text, body text,
  author_id uuid, author_key text, author_name text, author_username text,
  author_role text, author_avatar_url text, author_location text,
  author_verified boolean, company_id uuid, link_href text, link_label text,
  entity_type text, entity_id uuid, price_amount numeric, price_currency text,
  price_unit text, price_change numeric, city text, region text, tags text[],
  like_count integer, comment_count integer, save_count integer, share_count integer,
  view_count integer, download_count integer, is_demo boolean,
  published_at timestamptz, media jsonb, files jsonb, viewer_liked boolean,
  viewer_saved boolean, viewer_follows boolean, seen boolean, score numeric
) language sql stable security invoker set search_path=public as $$
with viewer as (select auth.uid() uid),
me as (
  select pr.location_city,pr.primary_role,lower(coalesce(pr.profession,'')) profession
  from public.profiles pr where pr.id=(select uid from viewer)
),
seen_posts as (
  select v.post_id,v.seen_count,v.last_seen_at from public.feed_views v
  where v.user_id=(select uid from viewer)
  union all select s.id,1,p_now from unnest(coalesce(p_seen_ids,'{}'::uuid[])) s(id)
  where (select uid from viewer) is null
),
followed as (
  select f.author_key from public.feed_follows f where f.follower_id=(select uid from viewer)
), followed_profiles as (
  select f.target_id,f.target_type from public.follows f
  where f.follower_id=(select uid from viewer) and f.target_type in ('profile','company')
), raw_interest as (
  select p.topic,p.kind,3::numeric weight from public.feed_likes x
  join public.feed_posts p on p.id=x.post_id where x.user_id=(select uid from viewer)
  union all
  select p.topic,p.kind,5 from public.feed_saves x
  join public.feed_posts p on p.id=x.post_id where x.user_id=(select uid from viewer)
  union all
  select p.topic,p.kind,least(x.weight*x.interaction_count,12) from public.feed_interactions x
  join public.feed_posts p on p.id=x.post_id where x.user_id=(select uid from viewer)
  union all
  select p.topic,p.kind,least(v.seen_count,3)::numeric from public.feed_views v
  join public.feed_posts p on p.id=v.post_id where v.user_id=(select uid from viewer)
), interest as (
  select topic,kind,least(sum(weight),20)::numeric weight from raw_interest group by topic,kind
), scored as (
  select p.*,sp.seen_count sp_seen_count,sp.post_id is not null sp_seen,
    (case when sp.post_id is null then 2000
          when sp.last_seen_at < p_now-make_interval(hours=>greatest(p_cooldown_hours,1)) then 1000
          else 0 end
     +ln(1+p.like_count*3.0+p.comment_count*4.0+p.save_count*5.0+
             p.share_count*4.0+p.view_count*0.15)*6.0
     +22.0/(1+greatest(extract(epoch from (p_now-p.published_at)),0)/86400.0)^0.6
     +p.boost
     +coalesce((select i.weight from interest i where i.topic=p.topic and i.kind=p.kind),0)
     +case when exists(select 1 from followed f where f.author_key=p.author_key)
             or exists(select 1 from followed_profiles f where
               (f.target_type='profile' and f.target_id=p.author_id) or
               (f.target_type='company' and f.target_id=p.company_id)) then 14 else 0 end
     +case
       when (select primary_role::text from me)='agent' and p.kind in ('property','tour_360','investment','professional') then 9
       when (select primary_role::text from me)='seller' and p.kind in ('material','furniture','equipment','price_update') then 9
       when (select primary_role::text from me)='company' and p.topic in ('construction','materials') then 7
       when (select primary_role::text from me)='client' and p.kind in ('property','furniture','interior','ai_design') then 6
       when (select primary_role::text from me)='professional'
         and (select profession from me) ~ '(architect|design|interior)'
         and p.kind in ('architecture','interior','ai_design','furniture','floor_plan') then 9
       when (select primary_role::text from me)='professional'
         and (select profession from me) ~ '(contract|engineer|construction)'
         and p.topic in ('construction','materials','finance') then 9
       else 0 end
     +case when p.city is not null and p.city=(select location_city from me) then 5 else 0 end
     -least(coalesce(sp.seen_count,0),20)*6.0
     +((('x'||substr(md5(p.id::text||':'||p_seed::text),1,8))::bit(32)::bigint%1000)/1000.0)*6.0
    )::numeric(20,6) merit
  from public.feed_posts p left join seen_posts sp on sp.post_id=p.id
  where p.status='published'
    and (p_kinds is null or p.kind=any(p_kinds))
    and (p_topics is null or p.topic=any(p_topics))
    and (p_author_key is null or p.author_key=p_author_key)
    and (p_search is null or to_tsvector('simple',p.title||' '||coalesce(p.body,'')) @@ plainto_tsquery('simple',p_search)
         or p.tags && string_to_array(lower(p_search),' '))
    and (not p_saved_only or exists(select 1 from public.feed_saves x where x.post_id=p.id and x.user_id=(select uid from viewer)))
    and (not p_following_only or exists(select 1 from followed f where f.author_key=p.author_key)
         or exists(select 1 from followed_profiles f where
          (f.target_type='profile' and f.target_id=p.author_id) or (f.target_type='company' and f.target_id=p.company_id)))
    and not exists(select 1 from public.feed_hidden h where h.post_id=p.id and h.user_id=(select uid from viewer))
), ranked as (
  select s.*,(s.merit-least(greatest(row_number() over(partition by s.author_key order by s.merit desc,s.id desc)-1,0),10)*5)::numeric(20,6) final_score
  from scored s
)
select r.id,r.kind,r.topic,r.title,r.body,r.author_id,r.author_key,
 coalesce(pr.full_name,r.author_name),pr.username,r.author_role,
 coalesce(pr.avatar_url,r.author_avatar_url),r.author_location,r.author_verified,
 r.company_id,r.link_href,r.link_label,r.entity_type,r.entity_id,r.price_amount,
 r.price_currency,r.price_unit,r.price_change,r.city,r.region,r.tags,r.like_count,
 r.comment_count,r.save_count,r.share_count,r.view_count,r.download_count,r.is_demo,
 r.published_at,
 coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'url',m.url,
   'posterUrl',m.poster_url,'alt',m.alt,'label',m.label,'durationSeconds',m.duration_seconds,
   'width',m.width,'height',m.height) order by m.position,m.id)
   from public.feed_media m where m.post_id=r.id),'[]'::jsonb),
 coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'fileKind',f.file_kind,'name',f.name,
   'url',f.url,'sizeBytes',f.size_bytes,'downloadCount',f.download_count) order by f.position,f.id)
   from public.feed_files f where f.post_id=r.id),'[]'::jsonb),
 exists(select 1 from public.feed_likes x where x.post_id=r.id and x.user_id=(select uid from viewer)),
 exists(select 1 from public.feed_saves x where x.post_id=r.id and x.user_id=(select uid from viewer)),
 (exists(select 1 from followed f where f.author_key=r.author_key) or
  exists(select 1 from followed_profiles f where (f.target_type='profile' and f.target_id=r.author_id) or
   (f.target_type='company' and f.target_id=r.company_id))),r.sp_seen,r.final_score
from ranked r left join public.profiles pr on pr.id=r.author_id
where p_after_score is null or (r.final_score,r.id)<(p_after_score,coalesce(p_after_id,'00000000-0000-0000-0000-000000000000'::uuid))
order by r.final_score desc,r.id desc limit least(greatest(p_limit,1),40);
$$;
grant execute on function public.feed_page_personalized(integer,timestamptz,numeric,uuid,
 public.feed_kind[],public.feed_topic[],text,boolean,boolean,text,uuid[],integer,integer)
to anon,authenticated;

commit;
