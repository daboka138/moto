-- =====================================================================
-- Profils motards + motos + bucket photos
-- À coller dans Supabase : SQL Editor > New query > Run
-- =====================================================================

-- ---------- Profils ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null check (char_length(trim(first_name)) between 1 and 50),
  last_name text not null check (char_length(trim(last_name)) between 1 and 50),
  username text not null check (username ~ '^[A-Za-z0-9_.]{3,20}$'),
  avatar_path text not null,
  bio text check (char_length(bio) <= 500),
  riding_styles text[] not null default '{}'
    check (riding_styles <@ array['balade', 'sportive', 'road_trip', 'piste', 'off_road']),
  license_year smallint check (license_year between 1950 and 2100),
  city text check (char_length(city) <= 80),
  interests text[] not null default '{}' check (cardinality(interests) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pseudo unique sans tenir compte de la casse
create unique index profiles_username_key on public.profiles (lower(username));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- Motos ----------
create table public.motorcycles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  brand text not null check (char_length(trim(brand)) between 1 and 50),
  model text not null check (char_length(trim(model)) between 1 and 50),
  year smallint check (year between 1900 and 2100),
  displacement_cc smallint check (displacement_cc between 1 and 3000),
  color text check (char_length(color) <= 30),
  photo_path text,
  created_at timestamptz not null default now()
);

create index motorcycles_owner_id_idx on public.motorcycles (owner_id);

-- ---------- RLS ----------
-- Les profils et motos sont visibles par les membres connectés (appli communautaire),
-- mais chacun ne modifie que les siens.
alter table public.profiles enable row level security;
alter table public.motorcycles enable row level security;

create policy "profiles: lecture membres connectés"
  on public.profiles for select to authenticated
  using (true);

create policy "profiles: création du sien"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);

create policy "profiles: modification du sien"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy "motorcycles: lecture membres connectés"
  on public.motorcycles for select to authenticated
  using (true);

create policy "motorcycles: création des siennes"
  on public.motorcycles for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy "motorcycles: modification des siennes"
  on public.motorcycles for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy "motorcycles: suppression des siennes"
  on public.motorcycles for delete to authenticated
  using ((select auth.uid()) = owner_id);

-- ---------- Storage : bucket photos ----------
-- Bucket public en lecture (les photos s'affichent via URL publique, chemins non devinables).
-- Écriture limitée au dossier de l'utilisateur : photos/<user_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy "photos: lecture de son dossier"
  on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos: upload dans son dossier"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos: modification dans son dossier"
  on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "photos: suppression dans son dossier"
  on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
