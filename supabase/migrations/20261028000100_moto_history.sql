-- Note 22 : « Histoire de la moto » (culture moto : premiers deux-roues, fiches des marques).
--
-- Contenu en base pour être corrigé / complété sans mise à jour de l'app (console › Histoire) :
--   history_chapters : chapitres (ex. « Les débuts du deux-roues »)
--   history_brands   : une fiche par marque (création, fondateurs, frise, modèles, anecdotes, aujourd'hui)
--   history_images   : images libres (Wikimedia Commons : domaine public, CC0, CC BY, CC BY-SA), stockées
--                      dans le bucket public `history`, avec auteur / licence / source (affichés sous l'image)
--   history_facts    : PRÉPARÉ pour plus tard (« Le saviez-vous ? » dans le Mur, quiz), rien ne s'en sert encore
-- Lecture : tout le monde (même sans compte : pages publiques possibles) ; masqué (hidden_at) = admin seulement.
-- Écriture : admin seulement (RLS is_admin()). Aucune donnée personnelle.

create table public.history_chapters (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  title text not null check (char_length(title) between 2 and 120),
  subtitle text check (char_length(subtitle) <= 200),
  -- Texte : paragraphes séparés par une ligne vide, « ## » = intertitre
  body text not null default '' check (char_length(body) <= 40000),
  -- Frise : [{ "year": "1817", "text": "…" }]
  timeline jsonb not null default '[]' check (jsonb_typeof(timeline) = 'array'),
  sort_order int not null default 0,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.history_brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  name text not null check (char_length(name) between 2 and 80),
  -- Pays (ISO 3166-1 alpha-2, ex. FR, IT) : drapeau et tri par pays
  country text not null check (country ~ '^[A-Z]{2}$'),
  founded_year int check (founded_year between 1800 and 2100),
  founded_place text check (char_length(founded_place) <= 120),
  founders text check (char_length(founders) <= 300),
  -- Phrase d'accroche (liste)
  tagline text check (char_length(tagline) <= 200),
  body text not null default '' check (char_length(body) <= 40000),
  timeline jsonb not null default '[]' check (jsonb_typeof(timeline) = 'array'),
  -- Modèles mythiques : [{ "name": "…", "year": "1969", "text": "…" }]
  models jsonb not null default '[]' check (jsonb_typeof(models) = 'array'),
  -- Anecdotes : ["…", "…"]
  anecdotes jsonb not null default '[]' check (jsonb_typeof(anecdotes) = 'array'),
  today text check (char_length(today) <= 4000),
  -- Ordre « les plus connues des motards français d'abord » (tri par défaut)
  sort_order int not null default 0,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.history_images (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid references public.history_chapters (id) on delete cascade,
  brand_id uuid references public.history_brands (id) on delete cascade,
  -- Chemin dans le bucket public `history`
  path text not null check (char_length(path) <= 200),
  caption text check (char_length(caption) <= 300),
  author text not null check (char_length(author) between 1 and 200),
  license text not null check (char_length(license) between 2 and 60),
  license_url text check (license_url ~ '^https://'),
  source_url text check (source_url ~ '^https://'),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  check ((chapter_id is null) <> (brand_id is null))
);
create index history_images_brand_idx on public.history_images (brand_id, sort_order);
create index history_images_chapter_idx on public.history_images (chapter_id, sort_order);

-- Plus tard : « Le saviez-vous ? » (Mur) et quiz. Structure seulement.
create table public.history_facts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references public.history_brands (id) on delete cascade,
  chapter_id uuid references public.history_chapters (id) on delete cascade,
  kind text not null check (kind in ('did_you_know', 'quiz')),
  body text not null check (char_length(body) between 5 and 1000),
  -- Quiz : { "choices": ["…"], "answer": 0 }
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object'),
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.history_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger history_chapters_touch before update on public.history_chapters
  for each row execute function public.history_touch();
create trigger history_brands_touch before update on public.history_brands
  for each row execute function public.history_touch();

alter table public.history_chapters enable row level security;
alter table public.history_brands enable row level security;
alter table public.history_images enable row level security;
alter table public.history_facts enable row level security;

create policy "history_chapters: lecture" on public.history_chapters for select to anon, authenticated
  using (hidden_at is null or (select public.is_admin()));
create policy "history_chapters: écriture admin" on public.history_chapters for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "history_brands: lecture" on public.history_brands for select to anon, authenticated
  using (hidden_at is null or (select public.is_admin()));
create policy "history_brands: écriture admin" on public.history_brands for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "history_images: lecture" on public.history_images for select to anon, authenticated
  using (true);
create policy "history_images: écriture admin" on public.history_images for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy "history_facts: lecture" on public.history_facts for select to anon, authenticated
  using (hidden_at is null or (select public.is_admin()));
create policy "history_facts: écriture admin" on public.history_facts for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- Storage : bucket public `history` (images libres, écriture admin) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('history', 'history', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "history: ajout par l'admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'history' and (select public.is_admin()));
create policy "history: modification par l'admin" on storage.objects for update to authenticated
  using (bucket_id = 'history' and (select public.is_admin()))
  with check (bucket_id = 'history' and (select public.is_admin()));
create policy "history: suppression par l'admin" on storage.objects for delete to authenticated
  using (bucket_id = 'history' and (select public.is_admin()));
