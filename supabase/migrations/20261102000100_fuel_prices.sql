-- Note 33 B : prix des carburants en France, flux instantané officiel (data.economie.gouv.fr,
-- jeu « prix-des-carburants-en-france-flux-instantane-v2 », DGCCRF / ministère de l'Économie,
-- Licence Ouverte v2.0 Etalab : réutilisation libre, y compris commerciale, en citant la source).
-- - fuel_stations : une ligne par station (≈ 10 000), prix + date de chaque prix, horaires.
--   Mise à jour UNIQUEMENT par l'Edge Function `fuel-prices` (pg_cron toutes les 30 min, import
--   par fuel_import en service_role) ; lecture par tous (données publiques).
-- - RPC : fuel_stations_in_box (carte), fuel_stations_along (itinéraire), fuel_stations_near (recherche).
-- - motorcycle_garage.fuel_type : carburant de ma moto (privé, comme le reste du garage).

create table public.fuel_stations (
  id bigint primary key,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  address text check (char_length(address) <= 200),
  city text check (char_length(city) <= 100),
  cp text check (char_length(cp) <= 10),
  -- Prix en €/L (null = pas vendu) et date de chaque prix
  e10 numeric(5, 3), e10_at timestamptz,
  sp95 numeric(5, 3), sp95_at timestamptz,
  sp98 numeric(5, 3), sp98_at timestamptz,
  gazole numeric(5, 3), gazole_at timestamptz,
  e85 numeric(5, 3), e85_at timestamptz,
  gplc numeric(5, 3), gplc_at timestamptz,
  -- Carburants en rupture temporaire (« SP98 », « E10 »…)
  shortages text[] not null default '{}',
  -- Automate 24/24 (carte bancaire)
  automate24 boolean not null default false,
  -- Horaires par jour, lundi = 1 : {"1": [["07.00","20.00"]], "7": null (fermé)} ; null = inconnus
  hours jsonb,
  -- Dernier import où la station figurait (supprimée après 7 jours d'absence)
  seen_at timestamptz not null default now()
);

create index fuel_stations_lat_lon_idx on public.fuel_stations (lat, lon);

alter table public.fuel_stations enable row level security;

create policy "fuel_stations: lecture par tous"
  on public.fuel_stations for select to anon, authenticated
  using (true);

-- Suivi des imports (date affichée avec le crédit de la source)
create table public.fuel_imports (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  stations integer not null,
  changed integer not null
);

alter table public.fuel_imports enable row level security;

create policy "fuel_imports: lecture par tous"
  on public.fuel_imports for select to anon, authenticated
  using (true);

-- Import (Edge Function fuel-prices, service_role) : tableau de stations au format de la table.
-- Ne réécrit que les lignes qui changent ; efface les stations absentes depuis 7 jours.
create or replace function public.fuel_import(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
  total integer := jsonb_array_length(p_rows);
begin
  insert into public.fuel_stations as s (
    id, lat, lon, address, city, cp, e10, e10_at, sp95, sp95_at, sp98, sp98_at, gazole, gazole_at,
    e85, e85_at, gplc, gplc_at, shortages, automate24, hours, seen_at
  )
  select r.id, r.lat, r.lon, left(r.address, 200), left(r.city, 100), left(r.cp, 10),
         r.e10, r.e10_at, r.sp95, r.sp95_at, r.sp98, r.sp98_at, r.gazole, r.gazole_at,
         r.e85, r.e85_at, r.gplc, r.gplc_at, coalesce(r.shortages, '{}'), coalesce(r.automate24, false), r.hours, now()
  from jsonb_to_recordset(p_rows) as r (
    id bigint, lat double precision, lon double precision, address text, city text, cp text,
    e10 numeric, e10_at timestamptz, sp95 numeric, sp95_at timestamptz, sp98 numeric, sp98_at timestamptz,
    gazole numeric, gazole_at timestamptz, e85 numeric, e85_at timestamptz, gplc numeric, gplc_at timestamptz,
    shortages text[], automate24 boolean, hours jsonb
  )
  where r.lat between -90 and 90 and r.lon between -180 and 180
  on conflict (id) do update set
    lat = excluded.lat, lon = excluded.lon, address = excluded.address, city = excluded.city, cp = excluded.cp,
    e10 = excluded.e10, e10_at = excluded.e10_at, sp95 = excluded.sp95, sp95_at = excluded.sp95_at,
    sp98 = excluded.sp98, sp98_at = excluded.sp98_at, gazole = excluded.gazole, gazole_at = excluded.gazole_at,
    e85 = excluded.e85, e85_at = excluded.e85_at, gplc = excluded.gplc, gplc_at = excluded.gplc_at,
    shortages = excluded.shortages, automate24 = excluded.automate24, hours = excluded.hours, seen_at = now()
  where (s.lat, s.lon, s.address, s.city, s.cp, s.e10, s.e10_at, s.sp95, s.sp95_at, s.sp98, s.sp98_at,
         s.gazole, s.gazole_at, s.e85, s.e85_at, s.gplc, s.gplc_at, s.shortages, s.automate24, s.hours)
     is distinct from
        (excluded.lat, excluded.lon, excluded.address, excluded.city, excluded.cp, excluded.e10, excluded.e10_at,
         excluded.sp95, excluded.sp95_at, excluded.sp98, excluded.sp98_at, excluded.gazole, excluded.gazole_at,
         excluded.e85, excluded.e85_at, excluded.gplc, excluded.gplc_at, excluded.shortages, excluded.automate24, excluded.hours)
     or s.seen_at < now() - interval '1 day';
  get diagnostics n = row_count;
  delete from public.fuel_stations where seen_at < now() - interval '7 days';
  insert into public.fuel_imports (stations, changed) values (total, n);
  delete from public.fuel_imports where ran_at < now() - interval '7 days';
  return n;
end;
$$;

revoke execute on function public.fuel_import(jsonb) from public, anon, authenticated;
grant execute on function public.fuel_import(jsonb) to service_role;

-- Carte : stations d'une zone (300 max)
create or replace function public.fuel_stations_in_box(
  p_min_lat double precision, p_min_lon double precision, p_max_lat double precision, p_max_lon double precision
)
returns setof public.fuel_stations
language sql
stable
security invoker
set search_path = public
as $$
  select s.* from public.fuel_stations s
  where s.lat between p_min_lat and p_max_lat and s.lon between p_min_lon and p_max_lon
    and p_max_lat - p_min_lat <= 1 and p_max_lon - p_min_lon <= 1.5
  limit 300;
$$;
grant execute on function public.fuel_stations_in_box(double precision, double precision, double precision, double precision) to anon, authenticated;

-- Itinéraire : stations à moins de p_m mètres des points du tracé (même principe que danger_zones_along)
create or replace function public.fuel_stations_along(p_lat double precision[], p_lon double precision[], p_m integer default 2000)
returns setof public.fuel_stations
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (s.id) s.*
  from unnest(p_lat[1:3000], p_lon[1:3000]) as q(lat, lon)
  join public.fuel_stations s
    on s.lat between q.lat - least(p_m, 3000) / 110540.0 and q.lat + least(p_m, 3000) / 110540.0
   and s.lon between q.lon - least(p_m, 3000) / (111320.0 * cos(radians(q.lat)))
                 and q.lon + least(p_m, 3000) / (111320.0 * cos(radians(q.lat)))
  order by s.id
  limit 1500;
$$;
grant execute on function public.fuel_stations_along(double precision[], double precision[], integer) to anon, authenticated;

-- Recherche « Station » : les plus proches (rayon en km, 30 max)
create or replace function public.fuel_stations_near(p_lat double precision, p_lon double precision, p_km double precision default 15)
returns setof public.fuel_stations
language sql
stable
security invoker
set search_path = public
as $$
  select s.* from public.fuel_stations s
  where s.lat between p_lat - least(p_km, 50) / 110.54 and p_lat + least(p_km, 50) / 110.54
    and s.lon between p_lon - least(p_km, 50) / (111.32 * cos(radians(p_lat)))
                  and p_lon + least(p_km, 50) / (111.32 * cos(radians(p_lat)))
  order by power(s.lat - p_lat, 2) + power((s.lon - p_lon) * cos(radians(p_lat)), 2)
  limit 30;
$$;
grant execute on function public.fuel_stations_near(double precision, double precision, double precision) to anon, authenticated;

-- ---------- Carburant de ma moto (garage, privé) ----------
alter table public.motorcycle_garage
  add column fuel_type text check (fuel_type in ('e10', 'sp95', 'sp98', 'gazole', 'e85', 'gplc'));

-- ---------- Mise à jour toutes les 30 min ----------
-- La fonction ne fait que lire un flux public et ne repasse pas avant 10 min : l'appeler n'expose rien.
select cron.schedule(
  'fuel-prices',
  '7,37 * * * *',
  $$
  select net.http_post(
    url := 'https://yfewldnhnnrzzscmfjsd.supabase.co/functions/v1/fuel-prices',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
