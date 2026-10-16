-- =====================================================================
-- Liens partenaires « Idées de balades » (écrans « Fais-moi une boucle » et création de balade)
-- Gérés UNIQUEMENT depuis la console admin (RLS is_admin), lisibles par tous (actifs seulement).
-- Zone : centre + rayon (null = partout) ; zone_label = texte affiché (« Marseille / Bouches-du-Rhône »).
-- clicks : compteur anonyme (un nombre, aucune donnée sur qui clique), via record_partner_click.
-- Appliquée avec : npx supabase db push
-- =====================================================================

create table public.partner_links (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 100),
  description text check (char_length(description) <= 200),
  url text not null check (url ~ '^https://[^\s]+$' and char_length(url) <= 500),
  image_url text check (image_url ~ '^https://[^\s]+$' and char_length(image_url) <= 500),
  zone_label text check (char_length(zone_label) <= 80),
  zone_lat double precision check (zone_lat between -90 and 90),
  zone_lng double precision check (zone_lng between -180 and 180),
  zone_radius_km integer check (zone_radius_km between 1 and 2000),
  active boolean not null default true,
  sort_order integer not null default 0,
  clicks bigint not null default 0,
  created_at timestamptz not null default now(),
  constraint partner_links_zone_check check ((zone_lat is null) = (zone_lng is null))
);

alter table public.partner_links enable row level security;

create policy "partner_links: lecture des liens actifs"
  on public.partner_links for select to anon, authenticated
  using (active or (select public.is_admin()));

create policy "partner_links: ajout par l'admin"
  on public.partner_links for insert to authenticated
  with check ((select public.is_admin()));

create policy "partner_links: modification par l'admin"
  on public.partner_links for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "partner_links: suppression par l'admin"
  on public.partner_links for delete to authenticated
  using ((select public.is_admin()));

-- Clic : +1, rien d'autre (pas d'utilisateur, pas d'heure, pas d'adresse IP)
create function public.record_partner_click(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.partner_links set clicks = clicks + 1 where id = p_id and active;
$$;

revoke all on function public.record_partner_click(uuid) from public;
grant execute on function public.record_partner_click(uuid) to anon, authenticated;

insert into public.partner_links (title, description, url, zone_label, zone_lat, zone_lng, zone_radius_km, sort_order) values
  ('Les 5 meilleurs spots moto autour de Marseille', 'Idées de balades par Holdfast',
   'https://www.holdfast.fr/les-5-meilleurs-spots-moto-autour-de-marseille/',
   'Marseille / Bouches-du-Rhône', 43.2965, 5.3698, 70, 0);
