-- =====================================================================
-- Acceptation des conditions d'utilisation (CGU) et de la politique de confidentialité
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- Une ligne par version acceptée (historique conservé : preuve d'acceptation).
-- La version est la date des CGU publiées sur passeryder.fr/conditions (ex. 2026-09-27).
create table public.terms_acceptances (
  user_id uuid not null references auth.users (id) on delete cascade,
  version text not null check (char_length(version) between 1 and 20),
  accepted_at timestamptz not null default now(),
  primary key (user_id, version)
);

alter table public.terms_acceptances enable row level security;

-- Lecture de ses propres acceptations ; aucune écriture directe (date fixée par le serveur)
create policy "terms_acceptances: lecture des miennes"
  on public.terms_acceptances for select to authenticated
  using (user_id = (select auth.uid()));

-- Accepter une version (membre déjà inscrit, ou nouvelle version des CGU)
create or replace function public.accept_terms(p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Non connecté' using errcode = '28000';
  end if;
  insert into public.terms_acceptances (user_id, version)
  values (auth.uid(), p_version)
  on conflict (user_id, version) do nothing;
end;
$$;

revoke execute on function public.accept_terms(text) from public, anon;
grant execute on function public.accept_terms(text) to authenticated;

-- À l'inscription, l'app envoie la version acceptée dans les métadonnées du compte
-- (case cochée sur l'écran d'inscription) : l'acceptation est enregistrée en même
-- temps que le compte. Sans métadonnée valide, rien n'est fait (jamais d'échec d'inscription).
create or replace function public.record_signup_terms()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v text := left(nullif(trim(new.raw_user_meta_data ->> 'terms_version'), ''), 20);
begin
  if v is not null then
    insert into public.terms_acceptances (user_id, version, accepted_at)
    values (new.id, v, coalesce(new.created_at, now()))
    on conflict (user_id, version) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.record_signup_terms() from public, anon, authenticated;

create trigger on_auth_user_created_record_terms
  after insert on auth.users
  for each row execute function public.record_signup_terms();
