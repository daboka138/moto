-- =====================================================================
-- Adapter l'app au type de moto : catégories, moto principale, balades
-- filtrées, recherche de motards pour rouler ensemble.
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- ---------- Catégorie de moto + moto principale ----------
-- cyclo = 50 cm³, 125 = 125 cm³, a2 = moyenne cylindrée (permis A2),
-- big = gros cube, trail = trail / off-road
alter table public.motorcycles
  add column category text check (category in ('cyclo', '125', 'a2', 'big', 'trail')),
  add column is_main boolean not null default false;

-- Catégorie déduite de la cylindrée pour les motos existantes
update public.motorcycles set category = case
  when displacement_cc <= 50 then 'cyclo'
  when displacement_cc <= 125 then '125'
  when displacement_cc <= 700 then 'a2'
  else 'big'
end
where category is null and displacement_cc is not null;

-- Moto principale : la plus ancienne de chaque motard
update public.motorcycles m set is_main = true
where m.id in (select distinct on (owner_id) id from public.motorcycles order by owner_id, created_at);

create unique index motorcycles_one_main_per_owner on public.motorcycles (owner_id) where is_main;

-- Changer de moto principale en un appel (l'ancienne perd son statut d'abord)
create or replace function public.set_main_motorcycle(moto uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (select 1 from public.motorcycles m where m.id = moto and m.owner_id = (select auth.uid())) then
    raise exception 'Moto introuvable' using errcode = 'P0001';
  end if;
  update public.motorcycles set is_main = false
  where owner_id = (select auth.uid()) and is_main and id <> moto;
  update public.motorcycles set is_main = true where id = moto;
end;
$$;

revoke execute on function public.set_main_motorcycle(uuid) from public, anon;
grant execute on function public.set_main_motorcycle(uuid) to authenticated;

-- ---------- Profil : rythme et disponibilités (publics) ----------
alter table public.profiles
  add column pace text check (pace in ('cool', 'modere', 'soutenu')),
  add column availability text[] not null default '{}'
    check (availability <@ array['semaine', 'weekend']);

-- ---------- Balades : motos acceptées, rythme, type de route ----------
alter table public.group_rides
  add column categories text[] not null default array['cyclo', '125', 'a2', 'big', 'trail']
    check (cardinality(categories) >= 1 and categories <@ array['cyclo', '125', 'a2', 'big', 'trail']),
  add column pace text check (pace in ('cool', 'modere', 'soutenu')),
  add column surface text not null default 'asphalt' check (surface in ('asphalt', 'track', 'mixed'));

grant update (categories, pace, surface) on public.group_rides to authenticated;

-- ---------- Recherche de motards ----------
-- Opt-in : on n'apparaît dans la recherche que si on l'a activé.
-- Zone approximative (arrondie à ~5 km) lisible uniquement par son propriétaire ;
-- les autres ne reçoivent qu'une distance arrondie, via find_riders().
create table public.rider_discovery (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  discoverable boolean not null default false,
  area_lat double precision check (area_lat between -90 and 90),
  area_lng double precision check (area_lng between -180 and 180),
  updated_at timestamptz not null default now()
);

-- La zone est toujours arrondie côté serveur (0,05° ≈ 5 km)
create or replace function public.rider_discovery_round_area()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.area_lat is not null then new.area_lat = round((new.area_lat / 0.05)::numeric) * 0.05; end if;
  if new.area_lng is not null then new.area_lng = round((new.area_lng / 0.05)::numeric) * 0.05; end if;
  new.updated_at = now();
  return new;
end;
$$;

create trigger rider_discovery_round_area
  before insert or update on public.rider_discovery
  for each row execute function public.rider_discovery_round_area();

alter table public.rider_discovery enable row level security;

create policy "rider_discovery: propriétaire"
  on public.rider_discovery for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Recherche : profils publics + moto principale + distance arrondie au km.
-- Exclus : moi, les non-inscrits à la recherche, les motards en fantôme,
-- et ceux qui m'ont masqué leur position (exception « block »).
create or replace function public.find_riders(
  p_lat double precision,
  p_lng double precision,
  p_max_km integer default null,
  p_categories text[] default null,
  p_styles text[] default null,
  p_paces text[] default null,
  p_min_license_years integer default null,
  p_availability text[] default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  username text,
  avatar_path text,
  city text,
  bio text,
  riding_styles text[],
  pace text,
  availability text[],
  license_year smallint,
  moto_brand text,
  moto_model text,
  moto_cc smallint,
  moto_category text,
  distance_km integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select
      (select auth.uid()) as uid,
      round((p_lat / 0.05)::numeric) * 0.05 as lat,
      round((p_lng / 0.05)::numeric) * 0.05 as lng
  ),
  candidates as (
    select
      p.id, p.username, p.avatar_path, p.city, p.bio, p.riding_styles, p.pace, p.availability, p.license_year,
      m.brand, m.model, m.displacement_cc, m.category,
      6371 * acos(least(1, greatest(-1,
        cos(radians(me.lat)) * cos(radians(d.area_lat)) * cos(radians(d.area_lng) - radians(me.lng))
        + sin(radians(me.lat)) * sin(radians(d.area_lat))
      ))) as dist
    from public.profiles p
    join public.rider_discovery d on d.user_id = p.id and d.discoverable and d.area_lat is not null
    cross join me
    left join lateral (
      select mm.brand, mm.model, mm.displacement_cc, mm.category
      from public.motorcycles mm
      where mm.owner_id = p.id
      order by mm.is_main desc, mm.created_at
      limit 1
    ) m on true
    where me.uid is not null
      and p.id <> me.uid
      and coalesce((select lp.mode from public.location_privacy lp where lp.user_id = p.id), 'friends') <> 'ghost'
      and not exists (
        select 1 from public.location_privacy_rules r
        where r.owner_id = p.id and r.friend_id = me.uid and r.kind = 'block'
      )
  )
  select
    c.id, c.username, c.avatar_path, c.city, c.bio, c.riding_styles, c.pace, c.availability, c.license_year,
    c.brand, c.model, c.displacement_cc, c.category,
    greatest(1, round(c.dist))::integer
  from candidates c
  where (p_max_km is null or c.dist <= p_max_km)
    and (p_categories is null or c.category = any (p_categories))
    and (p_styles is null or c.riding_styles && p_styles)
    and (p_paces is null or c.pace = any (p_paces))
    and (p_min_license_years is null
         or (c.license_year is not null and extract(year from now())::integer - c.license_year >= p_min_license_years))
    and (p_availability is null or c.availability && p_availability)
  order by c.dist
  limit least(coalesce(p_limit, 50), 100);
$$;

revoke execute on function public.find_riders(double precision, double precision, integer, text[], text[], text[], integer, text[], integer)
  from public, anon;
grant execute on function public.find_riders(double precision, double precision, integer, text[], text[], text[], integer, text[], integer)
  to authenticated;
