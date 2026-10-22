-- =====================================================================
-- Note 41 : nom affiché + changement de pseudo.
-- - profiles.display_name : facultatif, 30 caractères (40 pour un admin), emojis permis ; filtré (insultes,
--   imitation de l'équipe : « passeryder », « admin », « créateur »… réservés aux admins).
-- - Pseudo : unique sans tenir compte de la casse (index existant), 3-20 caractères
--   [A-Za-z0-9_.] (contrainte existante), pseudos réservés interdits, 1 changement / 30 jours.
--   Tout est vérifié ici par trigger : l'app ne fait qu'afficher les erreurs.
-- - Tout le reste (amitiés, messages, invitations, mentions, liens) est lié par id : un
--   changement de pseudo ne casse rien. Les codes d'invitation ne dépendent pas du pseudo.
-- - username_of() (textes des notifications et des push) : nom affiché s'il existe, sinon @pseudo.
-- - search_riders : trouve aussi par nom affiché.
-- Appliquée avec : npx supabase db push
-- =====================================================================

alter table public.profiles
  add column display_name text check (display_name is null or char_length(display_name) between 1 and 40),
  add column username_changed_at timestamptz;

-- Texte replié pour les filtres : minuscules, sans accents, chiffres « leet » remplacés
create or replace function public.fold_for_filter(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select translate(public.fold_text(coalesce(t, '')), '01345@$', 'oieasas');
$$;

-- Insultes et propos haineux (mots entiers pour les mots courts, partout pour les longs)
create or replace function public.contains_insult(t text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  f text := public.fold_for_filter(t);
  joined text := regexp_replace(f, '[^a-z]', '', 'g');
  tokens text[] := regexp_split_to_array(regexp_replace(f, '[^a-z]+', ' ', 'g'), ' ');
  long_words text[] := array['connard', 'connasse', 'salope', 'salaud', 'encule', 'batard', 'bougnoul', 'youpin', 'hitler',
    'pouffiasse', 'tapette', 'negro', 'niquer', 'niquetamere', 'tamere', 'fillsdepute', 'filsdepute', 'enfoire',
    'pedale', 'trouduc', 'grognasse', 'bicot', 'sale arabe', 'salenoir'];
  short_words text[] := array['pute', 'putain', 'pd', 'fdp', 'ntm', 'nazi', 'bite', 'cul', 'merde', 'pede', 'nique', 'chatte',
    'couille', 'couilles', 'con', 'conne', 'cons', 'tg', 'ss', 'kkk', 'viol', 'violeur', 'negre', 'negres'];
  w text;
begin
  foreach w in array long_words loop
    if position(replace(w, ' ', '') in joined) > 0 then
      return true;
    end if;
  end loop;
  return tokens && short_words;
end;
$$;

-- Pseudos réservés à l'équipe (repliés, sans « . » ni « _ » ni chiffres)
create or replace function public.username_reserved(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with x as (select regexp_replace(public.fold_for_filter(p), '[^a-z]', '', 'g') as s)
  select x.s in ('admin', 'administrateur', 'administrator', 'support', 'moderateur', 'moderatrice', 'moderation', 'modo',
                 'officiel', 'official', 'staff', 'equipe', 'team', 'root', 'system', 'systeme', 'createur', 'contact',
                 'aide', 'help', 'securite', 'sos', 'null', 'undefined', 'anonyme', 'bot', 'info', 'noreply', 'service')
      or x.s like '%passeryder%' or x.s like '%passerider%' or x.s like 'admin%' or x.s like '%moderat%'
      or x.s like '%officiel%' or x.s like 'support%'
  from x;
$$;

-- Nom affiché : rien qui imite l'équipe (sauf pour un admin)
create or replace function public.display_name_reserved(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  with x as (select regexp_replace(public.fold_for_filter(p), '[^a-z]', '', 'g') as s)
  select x.s like '%passeryder%' or x.s like '%passerider%' or x.s like '%admin%' or x.s like '%createur%'
      or x.s like '%moderat%' or x.s like '%officiel%' or x.s like '%support%' or x.s like '%equipe%'
  from x;
$$;

revoke execute on function public.contains_insult(text), public.username_reserved(text), public.display_name_reserved(text)
  from public, anon;
grant execute on function public.contains_insult(text), public.username_reserved(text), public.display_name_reserved(text)
  to authenticated;

create or replace function public.profiles_check_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admin boolean := public.is_admin();
begin
  -- Nom affiché : espaces nettoyés, vide = aucun
  new.display_name := nullif(regexp_replace(trim(coalesce(new.display_name, '')), '\s+', ' ', 'g'), '');
  if new.display_name is not null then
    if new.display_name ~ '[[:cntrl:]]' or new.display_name ~ '^@' then
      raise exception 'Nom affiché invalide' using errcode = 'P0001';
    end if;
    -- 30 caractères (40 pour un admin : « Dimitri · Créateur de PasseRyder »)
    if char_length(new.display_name) > (case when admin then 40 else 30 end) then
      raise exception 'Nom affiché : 30 caractères au plus' using errcode = 'P0001';
    end if;
    if public.contains_insult(new.display_name) then
      raise exception 'Ce nom affiché n''est pas accepté (propos insultants)' using errcode = 'P0001';
    end if;
    if not admin and public.display_name_reserved(new.display_name)
       and (tg_op = 'INSERT' or new.display_name is distinct from old.display_name) then
      raise exception 'Ce nom affiché est réservé à l''équipe PasseRyder' using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if not admin and public.username_reserved(new.username) then
      raise exception 'Ce pseudo est réservé' using errcode = 'P0001';
    end if;
    if public.contains_insult(new.username) then
      raise exception 'Ce pseudo n''est pas accepté (propos insultants)' using errcode = 'P0001';
    end if;
    new.username_changed_at := null;
    return new;
  end if;

  -- Pseudo inchangé (au-delà de la casse : simple retouche permise sans délai)
  if new.username = old.username then
    new.username_changed_at := old.username_changed_at;
    return new;
  end if;
  if lower(new.username) = lower(old.username) then
    new.username_changed_at := old.username_changed_at;
    return new;
  end if;
  if not admin then
    if public.username_reserved(new.username) then
      raise exception 'Ce pseudo est réservé' using errcode = 'P0001';
    end if;
    if old.username_changed_at is not null and old.username_changed_at > now() - interval '30 days' then
      raise exception 'Tu as déjà changé de pseudo le %. Prochain changement possible le %.',
        to_char(old.username_changed_at at time zone 'Europe/Paris', 'DD/MM/YYYY'),
        to_char((old.username_changed_at + interval '30 days') at time zone 'Europe/Paris', 'DD/MM/YYYY')
        using errcode = 'P0001';
    end if;
  end if;
  if public.contains_insult(new.username) then
    raise exception 'Ce pseudo n''est pas accepté (propos insultants)' using errcode = 'P0001';
  end if;
  new.username_changed_at := now();
  return new;
end;
$$;

revoke execute on function public.profiles_check_names() from public, anon, authenticated;

create trigger profiles_check_names
  before insert or update of username, display_name on public.profiles
  for each row execute function public.profiles_check_names();

-- Disponibilité en direct (écran Modifier mon profil) :
-- ok | same (le mien) | invalid | reserved | insult | taken | wait (délai de 30 jours)
create or replace function public.username_status(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  mine record;
  u text := trim(coalesce(p_username, ''));
begin
  if me is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  select p.username, p.username_changed_at into mine from public.profiles p where p.id = me;
  if mine.username is not null and lower(mine.username) = lower(u) then
    return jsonb_build_object('status', 'same');
  end if;
  if u !~ '^[A-Za-z0-9_.]{3,20}$' then
    return jsonb_build_object('status', 'invalid');
  end if;
  if not public.is_admin() and public.username_reserved(u) then
    return jsonb_build_object('status', 'reserved');
  end if;
  if public.contains_insult(u) then
    return jsonb_build_object('status', 'insult');
  end if;
  if exists (select 1 from public.profiles p where lower(p.username) = lower(u) and p.id <> me) then
    return jsonb_build_object('status', 'taken');
  end if;
  if mine.username is not null and not public.is_admin()
     and mine.username_changed_at is not null and mine.username_changed_at > now() - interval '30 days' then
    return jsonb_build_object('status', 'wait', 'next', mine.username_changed_at + interval '30 days');
  end if;
  return jsonb_build_object('status', 'ok');
end;
$$;

revoke execute on function public.username_status(text) from public, anon;
grant execute on function public.username_status(text) to authenticated;

-- Mon prochain changement de pseudo possible (null = maintenant)
create or replace function public.next_username_change()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select case when p.username_changed_at > now() - interval '30 days' and not public.is_admin()
    then p.username_changed_at + interval '30 days' end
  from public.profiles p where p.id = (select auth.uid());
$$;

revoke execute on function public.next_username_change() from public, anon;
grant execute on function public.next_username_change() to authenticated;

-- Textes des notifications / push : « Dimitri » si nom affiché, sinon « @pseudo »
create or replace function public.username_of(u uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.display_name, '@' || p.username, 'Un motard') from public.profiles p where p.id = u;
$$;

-- (note 40 : '@' en double dans le push « Événement à valider »)
create or replace function public.events_review_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admins uuid[];
begin
  if new.review_status <> 'pending' then
    return null;
  end if;
  select coalesce(array_agg(a.user_id), '{}') into admins from public.app_admins a;
  perform public.notify_many(admins, 'event_review', new.created_by, 'event', new.id,
    public.username_of(new.created_by) || ' propose l''événement « ' || new.title || ' » : à valider', '/admin?tab=agenda');
  perform public.send_push(admins, 'admin', 'Événement à valider',
    public.username_of(new.created_by) || ' : « ' || new.title || ' »', jsonb_build_object('url', '/admin?tab=agenda'));
  return null;
end;
$$;

-- Recherche de motards : pseudo OU nom affiché
create index profiles_display_name_trgm_idx on public.profiles
  using gin (public.fold_text(coalesce(display_name, '')) extensions.gin_trgm_ops);

drop function public.search_riders(text, integer);
create function public.search_riders(p_query text, p_limit integer default 30)
returns table (
  id uuid,
  username text,
  display_name text,
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
    p.id, p.username, p.display_name, p.avatar_path, p.city,
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
    and (lower(p.username) like q.pattern or public.fold_text(coalesce(p.display_name, '')) like q.pattern)
    and not public.is_blocked_with(p.id)
  order by
    (lower(p.username) = q.text or public.fold_text(coalesce(p.display_name, '')) = q.text) desc,
    (lower(p.username) like q.text || '%' or public.fold_text(coalesce(p.display_name, '')) like q.text || '%') desc,
    char_length(p.username),
    p.username
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

revoke execute on function public.search_riders(text, integer) from public, anon;
grant execute on function public.search_riders(text, integer) to authenticated;
