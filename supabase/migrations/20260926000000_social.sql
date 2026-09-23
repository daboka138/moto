-- =====================================================================
-- Profil social : identité privée, photo de couverture, mur de photos, compteurs
-- À coller dans Supabase : SQL Editor > New query > Run
-- (après 20260925000000_rides.sql)
-- =====================================================================

-- ---------- Identité privée ----------
-- Prénom et nom quittent la table profiles (lisible par tous les membres)
-- pour une table que seul son propriétaire peut lire.
-- Référence auth.users : l'identité est enregistrée avant le profil public.
create table public.profile_private (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  first_name text not null check (char_length(trim(first_name)) between 1 and 50),
  last_name text not null check (char_length(trim(last_name)) between 1 and 50),
  updated_at timestamptz not null default now()
);

-- Reprise des prénoms/noms existants, puis suppression des colonnes publiques
insert into public.profile_private (user_id, first_name, last_name)
select id, first_name, last_name from public.profiles;

alter table public.profiles
  drop column first_name,
  drop column last_name;

create trigger profile_private_set_updated_at
  before update on public.profile_private
  for each row execute function public.set_updated_at();

alter table public.profile_private enable row level security;

create policy "profile_private: lecture par son propriétaire"
  on public.profile_private for select to authenticated
  using (user_id = (select auth.uid()));

create policy "profile_private: création par son propriétaire"
  on public.profile_private for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "profile_private: modification par son propriétaire"
  on public.profile_private for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------- Photo de couverture ----------
alter table public.profiles
  add column cover_path text check (cover_path is null or char_length(cover_path) <= 300);

-- ---------- Mur de photos ----------
-- Fichiers dans le bucket "photos", dossier de l'utilisateur (policies déjà en place).
create table public.wall_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  path text not null check (char_length(path) <= 300),
  caption text check (char_length(caption) <= 300),
  created_at timestamptz not null default now()
);

create index wall_photos_owner_created_idx on public.wall_photos (owner_id, created_at desc);

alter table public.wall_photos enable row level security;

-- Comme les profils : visibles par les membres connectés
create policy "wall_photos: lecture membres connectés"
  on public.wall_photos for select to authenticated
  using (true);

-- Le fichier doit être dans le dossier de l'auteur : photos/<user_id>/...
create policy "wall_photos: ajout des siennes"
  on public.wall_photos for insert to authenticated
  with check (owner_id = (select auth.uid()) and split_part(path, '/', 1) = (select auth.uid())::text);

create policy "wall_photos: modification des siennes"
  on public.wall_photos for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "wall_photos: suppression des siennes"
  on public.wall_photos for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Seule la légende est modifiable
revoke update on public.wall_photos from anon, authenticated;
grant update (caption) on public.wall_photos to authenticated;

-- ---------- Compteurs du profil ----------
-- Nombres uniquement : la liste des amis d'un autre reste privée.
create or replace function public.profile_stats(target uuid)
returns table (photos integer, friends integer, rides integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.wall_photos w where w.owner_id = target)::integer,
    (select count(*) from public.friendships f
       where f.status = 'accepted' and target in (f.requester_id, f.addressee_id))::integer,
    (select count(*) from public.group_ride_participants p
       where p.user_id = target and p.status = 'joined')::integer;
$$;

revoke execute on function public.profile_stats(uuid) from public, anon;
grant execute on function public.profile_stats(uuid) to authenticated;
