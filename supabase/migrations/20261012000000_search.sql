-- =====================================================================
-- Recherche (onglet Mur / Profil) : motards par pseudo, balades, lieux, événements.
-- - Insensible aux majuscules et aux accents (fold_text), dès 2 caractères
-- - Motards : uniquement les champs publics du profil (pseudo, photo, ville, moto
--   principale) ; jamais de prénom / nom, jamais de position ; exclut les blocages
--   dans les deux sens
-- - Balades / lieux / événements : fonctions « security invoker » → les règles RLS
--   habituelles s'appliquent (balades privées invisibles, blocages…)
-- Appliquée avec : npx supabase db push
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- Minuscules sans accents (les pseudos n'ont pas d'accents, mais les noms de lieux si)
create or replace function public.fold_text(t text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select translate(
    lower(coalesce(t, '')),
    'àáâãäåāăąçćĉčďèéêëēĕėęěĝğíìîïĩīĭįıĵķĺļľłñńņňòóôõöøōŏőŕřśŝşšţťùúûüũūŭůűųŵýÿŷźżž',
    'aaaaaaaaaccccdeeeeeeeeeggiiiiiiiiijkllllnnnnooooooooorrssssttuuuuuuuuuuwyyyzzz'
  );
$$;

grant execute on function public.fold_text(text) to authenticated;

-- Motif LIKE « contient », jokers % et _ échappés
create or replace function public.search_pattern(q text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(public.fold_text(trim(q)), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

grant execute on function public.search_pattern(text) to authenticated;

-- Recherche « contient » rapide sur les pseudos
create index profiles_username_trgm_idx on public.profiles using gin (lower(username) extensions.gin_trgm_ops);

-- ---------- Motards ----------
-- relation : friend / incoming (il m'a demandé) / outgoing (j'ai demandé) / none
create or replace function public.search_riders(p_query text, p_limit integer default 30)
returns table (
  id uuid,
  username text,
  avatar_path text,
  city text,
  moto_brand text,
  moto_model text,
  relation text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (select public.fold_text(trim(p_query)) as text, public.search_pattern(p_query) as pattern)
  select
    p.id, p.username, p.avatar_path, p.city,
    m.brand, m.model,
    coalesce(
      (select case
                when f.status = 'accepted' then 'friend'
                when f.requester_id = (select auth.uid()) then 'outgoing'
                else 'incoming'
              end
       from public.friendships f
       where (f.requester_id = (select auth.uid()) and f.addressee_id = p.id)
          or (f.requester_id = p.id and f.addressee_id = (select auth.uid()))
       limit 1),
      'none'
    )
  from public.profiles p
  cross join q
  left join lateral (
    select mm.brand, mm.model from public.motorcycles mm
    where mm.owner_id = p.id
    order by mm.is_main desc, mm.created_at
    limit 1
  ) m on true
  where char_length(q.text) >= 2
    and (select auth.uid()) is not null
    and p.id <> (select auth.uid())
    and lower(p.username) like q.pattern
    and not public.is_blocked_with(p.id)
  order by
    (lower(p.username) = q.text) desc,
    (lower(p.username) like public.fold_text(trim(p_query)) || '%') desc,
    char_length(p.username),
    p.username
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

revoke execute on function public.search_riders(text, integer) from public, anon;
grant execute on function public.search_riders(text, integer) to authenticated;

-- ---------- Balades (à venir ou en cours, visibles selon la RLS) ----------
create or replace function public.search_rides(p_query text, p_limit integer default 30)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select r.id from public.group_rides r
  where char_length(public.fold_text(trim(p_query))) >= 2
    and r.ended_at is null
    and r.meeting_at > now() - interval '12 hours'
    and (public.fold_text(r.title) like public.search_pattern(p_query)
         or public.fold_text(r.meeting_label) like public.search_pattern(p_query)
         or public.fold_text(r.start_label) like public.search_pattern(p_query)
         or public.fold_text(r.end_label) like public.search_pattern(p_query))
  order by r.meeting_at
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

revoke execute on function public.search_rides(text, integer) from public, anon;
grant execute on function public.search_rides(text, integer) to authenticated;

-- ---------- Lieux motards ----------
create or replace function public.search_places(p_query text, p_limit integer default 30)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id from public.places p
  where char_length(public.fold_text(trim(p_query))) >= 2
    and (public.fold_text(p.name) like public.search_pattern(p_query)
         or public.fold_text(p.description) like public.search_pattern(p_query))
  order by (public.fold_text(p.name) like public.search_pattern(p_query)) desc, p.name
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

revoke execute on function public.search_places(text, integer) from public, anon;
grant execute on function public.search_places(text, integer) to authenticated;

-- ---------- Événements (pas encore terminés) ----------
create or replace function public.search_events(p_query text, p_limit integer default 30)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select e.id from public.events e
  where char_length(public.fold_text(trim(p_query))) >= 2
    and coalesce(e.ends_at, e.starts_at + interval '1 day') > now()
    and (public.fold_text(e.title) like public.search_pattern(p_query)
         or public.fold_text(e.place_label) like public.search_pattern(p_query))
  order by e.starts_at
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

revoke execute on function public.search_events(text, integer) from public, anon;
grant execute on function public.search_events(text, integer) to authenticated;
