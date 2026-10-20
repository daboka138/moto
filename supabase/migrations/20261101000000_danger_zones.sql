-- Zones de danger « points noirs » (note 32), construites UNIQUEMENT à partir de vrais dangers routiers :
-- accidents corporels officiels (ONISR, data.gouv.fr, Licence Ouverte Etalab), regroupés par
-- scripts/danger-zones/build.mjs (au moins 3 accidents à moins de 150 m sur 5 ans, poids plus fort pour
-- les deux-roues motorisés et les accidents graves). LÉGAL (art. R413-15 du Code de la route) : jamais
-- de donnée de radar ni de contrôle, ni directement ni pour construire ces zones.
-- Aucune donnée personnelle : seulement un centre, un rayon, un type de route et un score.

create table if not exists public.danger_zones (
  id bigint generated always as identity primary key,
  source text not null default 'onisr' check (source in ('onisr')),
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  radius_m integer not null check (radius_m between 10 and 500),
  -- urban : en agglomération (zone annoncée ~300 m) ; rural : hors agglomération (~2 km) ; expressway : voie rapide (~4 km)
  road text not null check (road in ('urban', 'rural', 'expressway')),
  accidents integer not null,
  score real not null,
  created_at timestamptz not null default now()
);
create index if not exists danger_zones_lat_lon on public.danger_zones (lat, lon);

alter table public.danger_zones enable row level security;
drop policy if exists "danger_zones lisibles" on public.danger_zones;
create policy "danger_zones lisibles" on public.danger_zones for select to anon, authenticated using (true);
-- Écriture : uniquement par le script d'import (rôle postgres, API de gestion), aucune règle d'écriture

-- Table de chargement du script (vidée à chaque import), jamais lisible par l'app
create table if not exists public.danger_zones_import (
  lat double precision not null,
  lon double precision not null,
  radius_m integer not null,
  road text not null,
  accidents integer not null,
  score real not null
);
alter table public.danger_zones_import enable row level security;

-- Historique des imports : source et années affichées dans l'app (crédits)
create table if not exists public.danger_zone_imports (
  id bigint generated always as identity primary key,
  source text not null,
  years text not null,
  zones integer not null,
  accidents integer not null,
  imported_at timestamptz not null default now()
);
alter table public.danger_zone_imports enable row level security;
drop policy if exists "danger_zone_imports lisibles" on public.danger_zone_imports;
create policy "danger_zone_imports lisibles" on public.danger_zone_imports for select to anon, authenticated using (true);

-- Zones le long d'un itinéraire : points du tracé (tous les ~250 m) → zones à moins de p_m mètres de l'un
-- d'eux (cadre approché, l'app affine par projection sur le tracé). Respecte la RLS (security invoker).
create or replace function public.danger_zones_along(p_lat double precision[], p_lon double precision[], p_m integer default 250)
returns setof public.danger_zones
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (z.id) z.*
  from unnest(p_lat[1:3000], p_lon[1:3000]) as s(lat, lon)
  join public.danger_zones z
    on z.lat between s.lat - least(p_m, 1000) / 110540.0 and s.lat + least(p_m, 1000) / 110540.0
   and z.lon between s.lon - least(p_m, 1000) / (111320.0 * cos(radians(s.lat)))
                 and s.lon + least(p_m, 1000) / (111320.0 * cos(radians(s.lat)))
  order by z.id
  limit 3000;
$$;
grant execute on function public.danger_zones_along(double precision[], double precision[], integer) to anon, authenticated;
