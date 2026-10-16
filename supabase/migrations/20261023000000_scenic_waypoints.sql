-- =====================================================================
-- Cols et routes réputés (« Fais-moi une boucle » : points de passage choisis en priorité)
-- Gérés UNIQUEMENT depuis la console admin (RLS is_admin), lisibles par tous (actifs seulement).
-- Coordonnées POSÉES SUR LA ROUTE (sinon la boucle ne peut pas y passer).
-- Appliquée avec : npx supabase db push
-- =====================================================================

create table public.scenic_waypoints (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  region text not null default '' check (char_length(region) <= 60),
  kind text not null default 'col' check (kind in ('col', 'road', 'viewpoint')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index scenic_waypoints_position_idx on public.scenic_waypoints (latitude, longitude);

alter table public.scenic_waypoints enable row level security;

create policy "scenic_waypoints: lecture des actifs (anon)"
  on public.scenic_waypoints for select to anon
  using (active);

create policy "scenic_waypoints: lecture des actifs (membres, tout pour l'admin)"
  on public.scenic_waypoints for select to authenticated
  using (active or (select public.is_admin()));

create policy "scenic_waypoints: ajout par l'admin"
  on public.scenic_waypoints for insert to authenticated
  with check ((select public.is_admin()));

create policy "scenic_waypoints: modification par l'admin"
  on public.scenic_waypoints for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "scenic_waypoints: suppression par l'admin"
  on public.scenic_waypoints for delete to authenticated
  using ((select public.is_admin()));

-- Marseille : points recalés sur la route par Valhalla /locate (le col de Bertagne est sur une piste : D2)
insert into public.scenic_waypoints (name, region, kind, latitude, longitude) values
  ('Col de la Gineste', 'Marseille', 'col', 43.24026, 5.45776),
  ('Route des Crêtes', 'Marseille', 'road', 43.18467, 5.56435),
  ('Col de l''Espigoulier', 'Marseille', 'col', 43.31629, 5.65917),
  ('Col de Bertagne (D2)', 'Marseille', 'col', 43.31395, 5.67448),
  ('Sainte-Baume (D80)', 'Marseille', 'road', 43.33561, 5.75520),
  ('Calanques / Cassis (descente de la Gineste)', 'Marseille', 'viewpoint', 43.23046, 5.52181);
