-- =====================================================================
-- A) Base des futures fonctions payantes (RIEN de payant activé)
-- - app_features : une ligne par fonctionnalité (gratuit / premium / désactivé), lisible par
--   tous, modifiable UNIQUEMENT par l'admin (RLS + is_admin()). Bêta : tout est « free ».
-- - Plan d'un membre = user_entitlements (lifetime_premium, premium_until), écrit par le
--   serveur seulement ; my_plan() le résume, admin_set_premium() pour offrir le premium.
--   Un admin reste premium à vie.
-- - feature_allowed(clé, membre) : même règle que canUse() dans l'app, vérifiée côté serveur
--
-- B) Points de bon comportement (opt-in, désactivé par défaut, score privé par défaut)
-- - good_points_settings : activation + visibilité (profil, classement entre amis,
--   classement du département), écrit par set_good_points_settings()
-- - good_point_events : historique (jamais de position ni de vitesse), écrit par le serveur
--   seulement via award_points() : rien si le membre n'a pas activé, une seule fois par
--   (membre, type, référence), plafond de 100 points par jour (heure de Paris)
-- - Gains : km propres et trajet sans téléphone (record_trip_points, envoyés par l'app à la
--   fin d'une navigation, plafonnés) ; danger confirmé par un autre motard / confirmer un
--   danger (trigger sur road_report_votes) ; balade organisée avec 2 participants présents,
--   convoi mené jusqu'au bout (trigger fin de balade) ; regroupement rejoint (pg_cron,
--   positions live) ; spot bien noté par les autres (trigger sur place_reviews)
-- - JAMAIS de points liés à la vitesse ou au temps de parcours
-- - monthly_challenges : défi du mois (lisible par tous, écrit par l'admin)
-- - Classement : entre amis (réciproque, chacun doit l'avoir accepté) ou par département
--   (seulement si accepté) ; points du mois uniquement
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- ---------- A) Fonctionnalités ----------
create table public.app_features (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text check (char_length(description) <= 300),
  status text not null default 'free' check (status in ('free', 'premium', 'disabled')),
  sort integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.app_features enable row level security;

create policy "app_features: lecture par tous"
  on public.app_features for select to anon, authenticated
  using (true);

create policy "app_features: ajout par l'admin"
  on public.app_features for insert to authenticated
  with check ((select public.is_admin()));

create policy "app_features: modification par l'admin"
  on public.app_features for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "app_features: suppression par l'admin"
  on public.app_features for delete to authenticated
  using ((select public.is_admin()));

create trigger app_features_set_updated_at
  before update on public.app_features
  for each row execute function public.set_updated_at();

-- Bêta : tout gratuit. premium_offer = bouton « PasseRyder Premium » (caché tant qu'il est désactivé)
insert into public.app_features (key, name, description, status, sort) values
  ('good_points', 'Points de bon comportement', 'Points, niveaux, badges, défi du mois et classement entre amis', 'free', 10),
  ('loop', 'Fais-moi une boucle', 'Boucles proposées selon la durée et les virages', 'free', 20),
  ('route_weather', 'Météo sur le trajet', 'Prévisions le long de l’itinéraire et de la balade', 'free', 30),
  ('gpx', 'Import / export GPX', 'Importer un tracé, exporter un trajet ou une balade', 'free', 40),
  ('garage', 'Garage et carnet d’entretien', 'Compteur, autonomie, carnet et rappels d’entretien', 'free', 50),
  ('convoy_tools', 'Outils de convoi', 'Ouvreur, serre-file, check-in au RDV, point de regroupement', 'free', 60),
  ('premium_offer', 'Écran PasseRyder Premium', 'Affiche le bouton « PasseRyder Premium » dans Paramètres (gratuit = visible par tous)', 'disabled', 100);

/** Plan du membre : free / premium (+ date de fin, null = à vie) */
create or replace function public.my_plan()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'plan', case when public.has_premium() then 'premium' else 'free' end,
    'lifetime', coalesce((select e.lifetime_premium from public.user_entitlements e where e.user_id = (select auth.uid())), false),
    'until', (select e.premium_until from public.user_entitlements e where e.user_id = (select auth.uid()))
  );
$$;

revoke execute on function public.my_plan() from public, anon;
grant execute on function public.my_plan() to authenticated;

-- Même règle que canUse() dans l'app ; clé inconnue = autorisée (bêta)
create or replace function public.feature_allowed(p_key text, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case coalesce((select f.status from public.app_features f where f.key = p_key), 'free')
    when 'free' then true
    when 'premium' then public.has_premium(p_user)
    else false
  end;
$$;

revoke execute on function public.feature_allowed(text, uuid) from public, anon, authenticated;

-- Offrir / retirer le premium (testeurs). p_mode : 'lifetime', 'until' (avec p_until) ou 'free'
create or replace function public.admin_set_premium(p_user uuid, p_mode text, p_until timestamptz default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if exists (select 1 from public.app_admins a where a.user_id = p_user) then
    -- Un admin reste premium à vie
    p_mode := 'lifetime';
  end if;
  if p_mode = 'until' and (p_until is null or p_until <= now()) then
    raise exception 'Date de fin invalide' using errcode = 'P0001';
  end if;
  if p_mode not in ('lifetime', 'until', 'free') then
    raise exception 'Mode inconnu' using errcode = 'P0001';
  end if;
  insert into public.user_entitlements (user_id, lifetime_premium, premium_until, updated_at)
  values (p_user, p_mode = 'lifetime', case when p_mode = 'until' then p_until end, now())
  on conflict (user_id) do update
    set lifetime_premium = excluded.lifetime_premium, premium_until = excluded.premium_until, updated_at = now();
end;
$$;

revoke execute on function public.admin_set_premium(uuid, text, timestamptz) from public, anon;
grant execute on function public.admin_set_premium(uuid, text, timestamptz) to authenticated;

-- Liste des inscrits : + premium
drop function public.admin_users(text, integer, integer);

create function public.admin_users(p_query text default null, p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid,
  username text,
  avatar_path text,
  email text,
  created_at timestamptz,
  last_seen timestamptz,
  city text,
  platform text,
  suspended boolean,
  is_admin boolean,
  lifetime_premium boolean,
  premium_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
    select p.id, p.username, p.avatar_path, u.email::text, p.created_at,
      greatest(u.last_sign_in_at, ls.at),
      p.city,
      case
        when ls.user_agent is null then null
        when ls.user_agent ilike '%okhttp%' or ls.user_agent ilike '%android%' and ls.user_agent not ilike '%mozilla%' then 'Android'
        when ls.user_agent ilike '%mozilla%' then 'Web'
        else 'Autre'
      end,
      exists (select 1 from public.account_suspensions s where s.user_id = p.id),
      exists (select 1 from public.app_admins a where a.user_id = p.id),
      coalesce(e.lifetime_premium, false),
      e.premium_until
    from public.profiles p
    join auth.users u on u.id = p.id
    left join public.user_entitlements e on e.user_id = p.id
    left join lateral (
      select coalesce(s.refreshed_at, s.updated_at, s.created_at) as at, s.user_agent
      from auth.sessions s where s.user_id = p.id
      order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc nulls last
      limit 1
    ) ls on true
    where p_query is null or trim(p_query) = ''
       or p.username ilike '%' || trim(p_query) || '%'
       or u.email ilike '%' || trim(p_query) || '%'
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

revoke execute on function public.admin_users(text, integer, integer) from public, anon;
grant execute on function public.admin_users(text, integer, integer) to authenticated;

-- ---------- B) Points de bon comportement ----------
create table public.good_points_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  enabled boolean not null default false,
  show_on_profile boolean not null default false,
  friends_ranking boolean not null default false,
  department_ranking boolean not null default false,
  -- Département (01…95, 2A, 2B, 971…976), seulement pour le classement du département
  department text check (department ~ '^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$'),
  enabled_at timestamptz,
  updated_at timestamptz not null default now(),
  check (not department_ranking or department is not null)
);

alter table public.good_points_settings enable row level security;

create policy "good_points_settings: lecture des siens"
  on public.good_points_settings for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.good_points_settings from anon, authenticated;

create table public.good_point_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'clean_km', 'phone_free', 'danger_confirmed', 'danger_confirm', 'ride_organized', 'convoy_done', 'regroup', 'spot_rated', 'challenge'
  )),
  -- Trajet, signalement, balade, spot ou mois concerné (jamais de position)
  ref text not null check (char_length(ref) <= 120),
  points integer not null check (points >= 0),
  -- km propres pour clean_km, sinon 1
  qty numeric(8, 1) not null default 1 check (qty >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);

create index good_point_events_user_idx on public.good_point_events (user_id, created_at desc);

alter table public.good_point_events enable row level security;

create policy "good_point_events: lecture des siens"
  on public.good_point_events for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.good_point_events from anon, authenticated;

create table public.monthly_challenges (
  month text primary key check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  emoji text not null default '🎯' check (char_length(emoji) between 1 and 8),
  title text not null check (char_length(title) between 3 and 80),
  description text check (char_length(description) <= 300),
  -- Ce qui est compté pendant le mois (points = total des points du mois, bonus exclus)
  metric text not null check (metric in (
    'clean_km', 'phone_free', 'danger_confirmed', 'danger_confirm', 'ride_organized', 'convoy_done', 'regroup', 'spot_rated', 'points'
  )),
  goal integer not null check (goal between 1 and 100000),
  bonus integer not null default 50 check (bonus between 0 and 200),
  updated_at timestamptz not null default now()
);

alter table public.monthly_challenges enable row level security;

create policy "monthly_challenges: lecture membres connectés"
  on public.monthly_challenges for select to authenticated
  using (true);

create policy "monthly_challenges: ajout par l'admin"
  on public.monthly_challenges for insert to authenticated
  with check ((select public.is_admin()));

create policy "monthly_challenges: modification par l'admin"
  on public.monthly_challenges for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "monthly_challenges: suppression par l'admin"
  on public.monthly_challenges for delete to authenticated
  using ((select public.is_admin()));

create trigger monthly_challenges_set_updated_at
  before update on public.monthly_challenges
  for each row execute function public.set_updated_at();

insert into public.monthly_challenges (month, emoji, title, description, metric, goal, bonus) values
  ('2026-10', '🛡️', '200 km propres en octobre', 'Roule 200 km en navigation sans dépasser les limitations connues.', 'clean_km', 200, 50),
  ('2026-11', '⚠️', 'Confirme 5 dangers en novembre', 'Aide les autres : confirme 5 dangers encore présents sur ta route.', 'danger_confirm', 5, 50);

-- Début du jour et du mois, heure de Paris
create or replace function public.paris_day_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
$$;

create or replace function public.paris_month_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris';
$$;

-- Avancement du défi du mois d'un membre
create or replace function public.challenge_progress(p_user uuid, p_metric text)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(case
    when p_metric = 'points' then (select sum(e.points) from public.good_point_events e
      where e.user_id = p_user and e.kind <> 'challenge' and e.created_at >= public.paris_month_start())
    else (select sum(e.qty) from public.good_point_events e
      where e.user_id = p_user and e.kind = p_metric and e.created_at >= public.paris_month_start())
  end, 0);
$$;

revoke execute on function public.challenge_progress(uuid, text) from public, anon, authenticated;

-- Points gagnés (serveur uniquement). Renvoie les points accordés (0 : pas activé, déjà compté,
-- plafond atteint). Plafond : 100 points / jour (bonus du défi à part) ; confirmer un danger
-- et trajet sans téléphone : 5 fois par jour au plus.
create or replace function public.award_points(p_user uuid, p_kind text, p_ref text, p_points integer, p_qty numeric default 1)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  daily_cap constant integer := 100;
  today_pts integer;
  granted integer;
  ch public.monthly_challenges%rowtype;
begin
  if p_user is null
     or not exists (select 1 from public.good_points_settings s where s.user_id = p_user and s.enabled)
     or not public.feature_allowed('good_points', p_user) then
    return 0;
  end if;
  -- Un seul calcul à la fois par membre (plafond exact)
  perform pg_advisory_xact_lock(hashtext('good_points:' || p_user::text));
  if exists (select 1 from public.good_point_events e where e.user_id = p_user and e.kind = p_kind and e.ref = p_ref) then
    return 0;
  end if;
  if p_kind in ('danger_confirm', 'phone_free') and (
    select count(*) from public.good_point_events e
    where e.user_id = p_user and e.kind = p_kind and e.created_at >= public.paris_day_start()
  ) >= 5 then
    return 0;
  end if;
  if p_kind = 'challenge' then
    granted := greatest(p_points, 0);
  else
    select coalesce(sum(e.points), 0) into today_pts from public.good_point_events e
    where e.user_id = p_user and e.kind <> 'challenge' and e.created_at >= public.paris_day_start();
    granted := greatest(0, least(p_points, daily_cap - today_pts));
  end if;
  insert into public.good_point_events (user_id, kind, ref, points, qty)
  values (p_user, p_kind, left(p_ref, 120), granted, greatest(coalesce(p_qty, 1), 0));

  -- Défi du mois réussi : bonus, une fois
  if p_kind <> 'challenge' then
    select * into ch from public.monthly_challenges c where c.month = to_char(now() at time zone 'Europe/Paris', 'YYYY-MM');
    if found and public.challenge_progress(p_user, ch.metric) >= ch.goal then
      perform public.award_points(p_user, 'challenge', ch.month, ch.bonus, 1);
    end if;
  end if;
  return granted;
end;
$$;

revoke execute on function public.award_points(uuid, text, text, integer, numeric) from public, anon, authenticated;

-- Réglages (opt-in). Désactiver arrête les gains sans effacer l'historique (reset_good_points).
create or replace function public.set_good_points_settings(
  p_enabled boolean,
  p_show_on_profile boolean default false,
  p_friends_ranking boolean default false,
  p_department_ranking boolean default false,
  p_department text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  dept text := nullif(upper(trim(p_department)), '');
begin
  if me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if p_department_ranking and dept is null then
    raise exception 'Choisis ton département pour le classement du département' using errcode = 'P0001';
  end if;
  insert into public.good_points_settings (user_id, enabled, show_on_profile, friends_ranking, department_ranking, department, enabled_at)
  values (me, p_enabled, p_show_on_profile, p_friends_ranking, p_department_ranking, dept, case when p_enabled then now() end)
  on conflict (user_id) do update set
    enabled = excluded.enabled,
    show_on_profile = excluded.show_on_profile,
    friends_ranking = excluded.friends_ranking,
    department_ranking = excluded.department_ranking,
    department = excluded.department,
    enabled_at = case when excluded.enabled and not public.good_points_settings.enabled then now() else public.good_points_settings.enabled_at end,
    updated_at = now();
end;
$$;

revoke execute on function public.set_good_points_settings(boolean, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.set_good_points_settings(boolean, boolean, boolean, boolean, text) to authenticated;

create or replace function public.reset_good_points()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.good_point_events where user_id = (select auth.uid());
$$;

revoke execute on function public.reset_good_points() from public, anon;
grant execute on function public.reset_good_points() to authenticated;

-- Fin d'une navigation : km propres (sans dépasser une limitation connue) et trajet sans
-- toucher au téléphone en roulant. Mesuré par l'app (le serveur ne voit pas la vitesse) :
-- plafonné (1 point / 10 km propres, 40 points de km / jour, 1 000 km propres / jour,
-- 5 trajets sans téléphone / jour), en plus du plafond général de 100 points / jour.
create or replace function public.record_trip_points(p_trip text, p_km numeric, p_clean_km numeric, p_phone_free boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  km numeric := least(greatest(coalesce(p_km, 0), 0), 1500);
  clean numeric;
  today_km numeric;
  today_km_pts integer;
  total integer := 0;
begin
  if me is null or p_trip is null or char_length(p_trip) > 80 then
    return 0;
  end if;
  select coalesce(sum(e.qty), 0), coalesce(sum(e.points), 0) into today_km, today_km_pts from public.good_point_events e
  where e.user_id = me and e.kind = 'clean_km' and e.created_at >= public.paris_day_start();
  clean := round(least(greatest(coalesce(p_clean_km, 0), 0), km, greatest(1000 - today_km, 0)), 1);
  if clean >= 1 then
    total := total + public.award_points(me, 'clean_km', p_trip, least(floor(clean / 10)::int, greatest(40 - today_km_pts, 0)), clean);
  end if;
  if p_phone_free and km >= 5 then
    total := total + public.award_points(me, 'phone_free', p_trip, 5, 1);
  end if;
  return total;
end;
$$;

revoke execute on function public.record_trip_points(text, numeric, numeric, boolean) from public, anon;
grant execute on function public.record_trip_points(text, numeric, numeric, boolean) to authenticated;

-- Danger confirmé par un AUTRE motard : 10 points au signaleur, 2 points à celui qui confirme
create or replace function public.good_points_on_report_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
begin
  if new.vote <> 'still_there' then
    return null;
  end if;
  select r.created_by into author from public.road_reports r where r.id = new.report_id;
  if author is null or author = new.user_id then
    return null;
  end if;
  perform public.award_points(author, 'danger_confirmed', new.report_id::text, 10, 1);
  perform public.award_points(new.user_id, 'danger_confirm', new.report_id::text, 2, 1);
  return null;
end;
$$;

revoke execute on function public.good_points_on_report_vote() from public, anon, authenticated;

create trigger good_points_on_report_vote
  after insert or update of vote on public.road_report_votes
  for each row execute function public.good_points_on_report_vote();

-- Fin de balade (terminée par l'organisateur, après au moins 20 min) :
-- - organisateur : 20 points si au moins 2 autres participants étaient là (check-in au RDV,
--   ou localisés par le serveur pendant la balade)
-- - ouvreur et serre-file présents : 15 points (convoi mené jusqu'au bout)
create or replace function public.good_points_on_ride_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  present integer;
  p record;
begin
  if old.ended_at is not null or new.ended_at is null or new.started_at is null
     or new.ended_at - new.started_at < interval '20 minutes' then
    return null;
  end if;
  select count(*) into present
  from public.group_ride_participants gp
  where gp.ride_id = new.id and gp.status = 'joined' and gp.user_id <> new.created_by
    and (gp.checked_in_at is not null
         or exists (select 1 from public.convoy_tracking t where t.ride_id = new.id and t.user_id = gp.user_id));
  if present >= 2 then
    perform public.award_points(new.created_by, 'ride_organized', new.id::text, 20, 1);
  end if;
  for p in
    select gp.user_id from public.group_ride_participants gp
    where gp.ride_id = new.id and gp.status = 'joined' and gp.role in ('leader', 'sweeper')
      and (gp.checked_in_at is not null
           or exists (select 1 from public.convoy_tracking t where t.ride_id = new.id and t.user_id = gp.user_id))
  loop
    perform public.award_points(p.user_id, 'convoy_done', new.id::text, 15, 1);
  end loop;
  return null;
end;
$$;

revoke execute on function public.good_points_on_ride_end() from public, anon, authenticated;

create trigger good_points_on_ride_end
  after update of ended_at on public.group_rides
  for each row execute function public.good_points_on_ride_end();

-- Regroupement respecté : participant localisé à moins de 250 m du point de regroupement
-- après qu'il a été posé (pg_cron chaque minute, 5 points par regroupement)
create or replace function public.check_regroups()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  m record;
  v_ref text;
begin
  for r in
    select g.id, g.regroup_lat, g.regroup_lng, g.regroup_at from public.group_rides g
    where g.regroup_at is not null and g.regroup_lat is not null and g.regroup_at > now() - interval '3 hours'
      and public.ride_is_live(g)
  loop
    v_ref := r.id::text || ':' || floor(extract(epoch from r.regroup_at))::bigint;
    for m in
      select p.user_id from public.group_ride_participants p
      join public.live_positions l on l.user_id = p.user_id
      join public.good_points_settings s on s.user_id = p.user_id and s.enabled
      where p.ride_id = r.id and p.status = 'joined'
        and l.updated_at > r.regroup_at and l.updated_at > now() - interval '3 minutes'
        and public.geo_distance_m(l.latitude, l.longitude, r.regroup_lat, r.regroup_lng) <= 250
        and not exists (select 1 from public.good_point_events e where e.user_id = p.user_id and e.kind = 'regroup' and e.ref = v_ref)
    loop
      perform public.award_points(m.user_id, 'regroup', v_ref, 5, 1);
    end loop;
  end loop;
end;
$$;

revoke execute on function public.check_regroups() from public, anon, authenticated;

select cron.schedule('good-points-regroups', '* * * * *', $$ select public.check_regroups(); $$);

-- Spot bien noté : au moins 2 avis d'autres membres, moyenne ≥ 4 → 15 points au créateur
create or replace function public.good_points_on_place_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pl record;
  n integer;
  avg_rating numeric;
begin
  select p.id, p.created_by, p.hidden_at into pl from public.places p where p.id = new.place_id;
  if pl.id is null or pl.hidden_at is not null or pl.created_by = new.author_id then
    return null;
  end if;
  select count(*), avg(rv.rating) into n, avg_rating
  from public.place_reviews rv
  where rv.place_id = pl.id and rv.author_id <> pl.created_by and rv.hidden_at is null;
  if n >= 2 and avg_rating >= 4 then
    perform public.award_points(pl.created_by, 'spot_rated', pl.id::text, 15, 1);
  end if;
  return null;
end;
$$;

revoke execute on function public.good_points_on_place_review() from public, anon, authenticated;

create trigger good_points_on_place_review
  after insert or update of rating on public.place_reviews
  for each row execute function public.good_points_on_place_review();

-- ---------- Lecture ----------

-- Compteurs par type (km propres = somme, sinon nombre)
create or replace function public.good_points_counters(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k.kind, k.n), '{}'::jsonb)
  from (
    select e.kind, sum(e.qty) as n from public.good_point_events e where e.user_id = p_user group by e.kind
  ) k;
$$;

revoke execute on function public.good_points_counters(uuid) from public, anon, authenticated;

-- Mon écran « Mes points »
create or replace function public.my_good_points()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  st public.good_points_settings%rowtype;
  ch public.monthly_challenges%rowtype;
begin
  if me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  select * into st from public.good_points_settings s where s.user_id = me;
  select * into ch from public.monthly_challenges c where c.month = to_char(now() at time zone 'Europe/Paris', 'YYYY-MM');
  return jsonb_build_object(
    'settings', jsonb_build_object(
      'enabled', coalesce(st.enabled, false),
      'show_on_profile', coalesce(st.show_on_profile, false),
      'friends_ranking', coalesce(st.friends_ranking, false),
      'department_ranking', coalesce(st.department_ranking, false),
      'department', st.department
    ),
    'total', (select coalesce(sum(e.points), 0) from public.good_point_events e where e.user_id = me),
    'month', (select coalesce(sum(e.points), 0) from public.good_point_events e where e.user_id = me and e.created_at >= public.paris_month_start()),
    'today', (select coalesce(sum(e.points), 0) from public.good_point_events e
              where e.user_id = me and e.kind <> 'challenge' and e.created_at >= public.paris_day_start()),
    'daily_cap', 100,
    'counters', public.good_points_counters(me),
    'challenge', case when ch.month is null then null else jsonb_build_object(
      'month', ch.month, 'emoji', ch.emoji, 'title', ch.title, 'description', ch.description,
      'metric', ch.metric, 'goal', ch.goal, 'bonus', ch.bonus,
      'progress', public.challenge_progress(me, ch.metric),
      'done', exists (select 1 from public.good_point_events e where e.user_id = me and e.kind = 'challenge' and e.ref = ch.month)
    ) end,
    'history', (
      select coalesce(jsonb_agg(jsonb_build_object('kind', h.kind, 'points', h.points, 'qty', h.qty, 'at', h.created_at) order by h.created_at desc), '[]'::jsonb)
      from (select e.kind, e.points, e.qty, e.created_at from public.good_point_events e where e.user_id = me order by e.created_at desc limit 60) h
    )
  );
end;
$$;

revoke execute on function public.my_good_points() from public, anon;
grant execute on function public.my_good_points() to authenticated;

-- Niveau + badges d'un motard sur son profil : seulement s'il l'a rendu visible (null sinon)
create or replace function public.rider_good_points(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then null
    when p_user <> (select auth.uid()) and (
      public.is_blocked_between(p_user, (select auth.uid()))
      or not exists (select 1 from public.good_points_settings s where s.user_id = p_user and s.enabled and s.show_on_profile)
    ) then null
    when not exists (select 1 from public.good_points_settings s where s.user_id = p_user and s.enabled) then null
    else jsonb_build_object(
      'total', (select coalesce(sum(e.points), 0) from public.good_point_events e where e.user_id = p_user),
      'counters', public.good_points_counters(p_user),
      'visible', exists (select 1 from public.good_points_settings s where s.user_id = p_user and s.show_on_profile)
    )
  end;
$$;

revoke execute on function public.rider_good_points(uuid) from public, anon;
grant execute on function public.rider_good_points(uuid) to authenticated;

-- Classement du mois : 'friends' (moi + amis qui l'ont accepté) ou 'department' (même
-- département, accepté). Il faut l'avoir accepté soi-même pour voir celui des autres.
create or replace function public.good_points_ranking(p_scope text)
returns table (user_id uuid, username text, avatar_path text, points integer, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  mine public.good_points_settings%rowtype;
begin
  select * into mine from public.good_points_settings s where s.user_id = me and s.enabled;
  if not found then
    return;
  end if;
  if p_scope = 'friends' and not mine.friends_ranking then
    return;
  end if;
  if p_scope = 'department' and not mine.department_ranking then
    return;
  end if;
  if p_scope not in ('friends', 'department') then
    raise exception 'Classement inconnu' using errcode = 'P0001';
  end if;
  return query
    select s.user_id, p.username, p.avatar_path,
      (select coalesce(sum(e.points), 0)::int from public.good_point_events e
       where e.user_id = s.user_id and e.created_at >= public.paris_month_start()),
      s.user_id = me
    from public.good_points_settings s
    join public.profiles p on p.id = s.user_id
    where s.enabled
      and (s.user_id = me or not public.is_blocked_between(me, s.user_id))
      and case p_scope
        when 'friends' then s.friends_ranking and (s.user_id = me or public.are_friends(me, s.user_id))
        else s.department_ranking and s.department = mine.department
      end
    order by 4 desc, p.username
    limit 50;
end;
$$;

revoke execute on function public.good_points_ranking(text) from public, anon;
grant execute on function public.good_points_ranking(text) to authenticated;
