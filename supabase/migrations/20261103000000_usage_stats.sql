-- Note 39 : statistiques d'usage internes (console admin uniquement)
--
-- Vie privée :
-- - app_activity : un jour d'ouverture par membre et par plateforme (android / web), + le
--   département de la VILLE DU PROFIL (jamais de position). Sert aux actifs (jour / semaine / mois),
--   à la fidélité (cohortes) et au compteur « testeurs Play Store ». Aucune lecture possible par
--   l'app (RLS sans règle), uniquement des agrégats via admin_usage_stats(). Purge après 400 jours.
-- - usage_counts : compteurs ANONYMES par jour et par fonction (aucun identifiant).
-- - Comptes admin et comptes de test jamais comptés (stats_excluded).
-- - Aucun outil tiers, aucun suivi publicitaire.
-- Appliquée avec : npx supabase db push

-- ---------- Exclusions ----------
create or replace function public.stats_excluded(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is null
    or exists (select 1 from public.app_admins a where a.user_id = p_user)
    or exists (select 1 from auth.users u where u.id = p_user and public.is_test_email(u.email));
$$;

revoke all on function public.stats_excluded(uuid) from public, anon, authenticated;

-- ---------- Jours d'activité ----------
create table public.app_activity (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  platform text not null check (platform in ('android', 'ios', 'web')),
  department text check (department ~ '^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$'),
  primary key (user_id, day, platform)
);

create index app_activity_day_idx on public.app_activity (day);

alter table public.app_activity enable row level security;
-- Aucune règle : ni lecture ni écriture directe depuis l'app

-- Appelée par l'app à l'ouverture (une fois par jour)
create or replace function public.track_activity(p_platform text, p_department text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  dept text := nullif(upper(trim(p_department)), '');
begin
  if me is null or p_platform not in ('android', 'ios', 'web') then
    return;
  end if;
  if dept is not null and dept !~ '^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B|97[1-6])$' then
    dept := null;
  end if;
  if public.stats_excluded(me) then
    return;
  end if;
  insert into public.app_activity (user_id, day, platform, department)
  values (me, (now() at time zone 'Europe/Paris')::date, p_platform, dept)
  on conflict (user_id, day, platform) do update
    set department = coalesce(excluded.department, public.app_activity.department);
end;
$$;

revoke all on function public.track_activity(text, text) from public, anon;
grant execute on function public.track_activity(text, text) to authenticated;

-- ---------- Compteurs anonymes par fonction ----------
create table public.usage_counts (
  day date not null,
  feature text not null check (feature ~ '^[a-z_]{2,30}$'),
  n integer not null default 0,
  primary key (day, feature)
);

alter table public.usage_counts enable row level security;
-- Aucune règle

-- Interne : +1 pour une fonction (rien pour un admin / compte de test ; jamais bloquant)
create or replace function public.usage_bump(p_feature text, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.stats_excluded(p_user) then
    return;
  end if;
  insert into public.usage_counts (day, feature, n)
  values ((now() at time zone 'Europe/Paris')::date, p_feature, 1)
  on conflict (day, feature) do update set n = public.usage_counts.n + 1;
exception when others then
  raise warning 'usage_bump: %', sqlerrm;
end;
$$;

revoke all on function public.usage_bump(text, uuid) from public, anon, authenticated;

-- Fonctions utilisées sur le téléphone (navigation, boucle…) : liste fermée
create or replace function public.track_usage(p_feature text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_feature not in ('nav_start', 'loop', 'history', 'weather', 'fuel', 'search', 'homecoming',
                       'trip_share', 'outing_share', 'gpx_import', 'garage') then
    return;
  end if;
  perform public.usage_bump(p_feature, (select auth.uid()));
end;
$$;

revoke all on function public.track_usage(text) from public, anon;
grant execute on function public.track_usage(text) to authenticated;

-- Contenus : comptés par le serveur à la création (les balades / événements sont purgés après la fin)
create or replace function public.usage_count_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rec jsonb := to_jsonb(new);
begin
  if TG_ARGV[0] = 'message' and rec ->> 'kind' = 'system' then
    return null;
  end if;
  perform public.usage_bump(TG_ARGV[0], (rec ->> TG_ARGV[1])::uuid);
  return null;
end;
$$;

create trigger usage_ride_create after insert on public.group_rides
  for each row execute function public.usage_count_trigger('ride_create', 'created_by');
create trigger usage_message after insert on public.messages
  for each row execute function public.usage_count_trigger('message', 'sender_id');
create trigger usage_post after insert on public.wall_photos
  for each row execute function public.usage_count_trigger('post', 'owner_id');
create trigger usage_story after insert on public.stories
  for each row execute function public.usage_count_trigger('story', 'owner_id');
create trigger usage_danger_report after insert on public.road_reports
  for each row execute function public.usage_count_trigger('danger_report', 'created_by');
create trigger usage_event_create after insert on public.events
  for each row execute function public.usage_count_trigger('event_create', 'created_by');
create trigger usage_spot_create after insert on public.places
  for each row execute function public.usage_count_trigger('spot_create', 'created_by');
create trigger usage_place_review after insert on public.place_reviews
  for each row execute function public.usage_count_trigger('place_review', 'author_id');
create trigger usage_sos after insert on public.sos_events
  for each row execute function public.usage_count_trigger('sos', 'user_id');

-- Balade rejointe (pas l'organisateur, qui est inscrit à la création)
create or replace function public.usage_ride_join_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'joined' and (TG_OP = 'INSERT' or old.status is distinct from 'joined')
     and not exists (select 1 from public.group_rides r where r.id = new.ride_id and r.created_by = new.user_id) then
    perform public.usage_bump('ride_join', new.user_id);
  end if;
  return null;
end;
$$;

create trigger usage_ride_join after insert or update of status on public.group_ride_participants
  for each row execute function public.usage_ride_join_trigger();

-- Reprise de l'historique encore en base (90 jours) pour les contenus qui ne sont pas purgés
insert into public.usage_counts (day, feature, n)
select d, f, count(*)::integer from (
  select (m.created_at at time zone 'Europe/Paris')::date as d, 'message' as f, m.sender_id as u
    from public.messages m where m.created_at > now() - interval '90 days' and m.kind <> 'system'
  union all
  select (w.created_at at time zone 'Europe/Paris')::date, 'post', w.owner_id
    from public.wall_photos w where w.created_at > now() - interval '90 days'
  union all
  select (r.created_at at time zone 'Europe/Paris')::date, 'danger_report', r.created_by
    from public.road_reports r where r.created_at > now() - interval '90 days'
  union all
  select (s.created_at at time zone 'Europe/Paris')::date, 'sos', s.user_id
    from public.sos_events s where s.created_at > now() - interval '90 days'
  union all
  select (p.created_at at time zone 'Europe/Paris')::date, 'spot_create', p.created_by
    from public.places p where p.created_at > now() - interval '90 days'
  union all
  select (p.created_at at time zone 'Europe/Paris')::date, 'place_review', p.author_id
    from public.place_reviews p where p.created_at > now() - interval '90 days'
) x
where not public.stats_excluded(x.u)
group by d, f
on conflict (day, feature) do update set n = excluded.n;

-- Purge des jours d'activité (les compteurs anonymes sont gardés)
select cron.schedule('usage-stats-cleanup', '23 3 * * *',
  $$ delete from public.app_activity where day < (now() at time zone 'Europe/Paris')::date - 400; $$);

-- ---------- Console : tableau de bord ----------
create or replace function public.admin_usage_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'Europe/Paris')::date;
  days integer := case when p_days in (7, 30, 90) then p_days else 30 end;
  since date;
  tracking date;
  result jsonb;
begin
  perform public.assert_admin();
  since := today - days + 1;
  select min(day) into tracking from public.app_activity;

  with members as (
    select p.id, (p.created_at at time zone 'Europe/Paris')::date as signup_day
    from public.profiles p
    where not public.stats_excluded(p.id)
  ),
  period as (
    select d::date as day from generate_series(since, today, interval '1 day') d
  ),
  act as (
    select a.* from public.app_activity a where a.day >= least(since, today - 29)
  )
  select jsonb_build_object(
    'days', days,
    'since', since,
    'tracking_since', tracking,
    'users', (select count(*) from members),
    'new_period', (select count(*) from members where signup_day >= since),
    'dau', (select count(distinct user_id) from act where day = today),
    'wau', (select count(distinct user_id) from act where day > today - 7),
    'mau', (select count(distinct user_id) from act where day > today - 30),
    'active_period', (select count(distinct user_id) from act where day >= since),
    'testers_14d', (select count(distinct user_id) from act where platform = 'android' and day > today - 14),
    'platforms', (
      select jsonb_build_object(
        'android', count(*) filter (where has_android and not has_web),
        'web', count(*) filter (where has_web and not has_android),
        'both', count(*) filter (where has_android and has_web))
      from (
        select bool_or(platform = 'android') as has_android, bool_or(platform = 'web') as has_web
        from act where day >= since group by user_id
      ) x
    ),
    'daily', (
      select jsonb_agg(jsonb_build_object(
        'day', p.day,
        'android', (select count(distinct a.user_id) from act a where a.day = p.day and a.platform = 'android'),
        'web', (select count(distinct a.user_id) from act a where a.day = p.day and a.platform = 'web'),
        'active', (select count(distinct a.user_id) from act a where a.day = p.day),
        'signups', (select count(*) from members m where m.signup_day = p.day)
      ) order by p.day)
      from period p
    ),
    'weekly_signups', (
      select jsonb_agg(jsonb_build_object('week', w.week, 'count', w.n) order by w.week)
      from (
        select date_trunc('week', signup_day)::date as week, count(*) as n
        from members where signup_day >= since group by 1
      ) w
    ),
    'departments', (
      select coalesce(jsonb_agg(jsonb_build_object('department', x.dept, 'count', x.n) order by x.n desc, x.dept), '[]'::jsonb)
      from (
        select coalesce(last_dept, '?') as dept, count(*) as n
        from (
          select user_id, (array_agg(department order by day desc) filter (where department is not null))[1] as last_dept
          from act where day >= since group by user_id
        ) u
        group by 1
      ) x
    ),
    -- Fidélité : % revenus au moins une fois à partir de J+1 / J+7 / J+30, cohortes par semaine
    -- d'inscription (12 dernières semaines, seulement depuis le début du suivi des ouvertures)
    'retention', (
      select coalesce(jsonb_agg(c order by c ->> 'week'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'week', date_trunc('week', m.signup_day)::date,
          'size', count(*),
          'd1_n', count(*) filter (where m.signup_day + 1 <= today),
          'd1', count(*) filter (where m.signup_day + 1 <= today and exists (
            select 1 from public.app_activity a where a.user_id = m.id and a.day >= m.signup_day + 1)),
          'd7_n', count(*) filter (where m.signup_day + 7 <= today),
          'd7', count(*) filter (where m.signup_day + 7 <= today and exists (
            select 1 from public.app_activity a where a.user_id = m.id and a.day >= m.signup_day + 7)),
          'd30_n', count(*) filter (where m.signup_day + 30 <= today),
          'd30', count(*) filter (where m.signup_day + 30 <= today and exists (
            select 1 from public.app_activity a where a.user_id = m.id and a.day >= m.signup_day + 30))
        ) as c
        from members m
        where tracking is not null and m.signup_day >= tracking and m.signup_day > today - 84
        group by date_trunc('week', m.signup_day)
      ) r
    ),
    'features', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'feature', f.feature,
        'n7', f.n7, 'n30', f.n30, 'period', f.np) order by f.np desc, f.feature), '[]'::jsonb)
      from (
        select feature,
          sum(n) filter (where day > today - 7) as n7,
          sum(n) filter (where day > today - 30) as n30,
          sum(n) filter (where day >= since) as np
        from public.usage_counts
        where day >= least(since, today - 29)
        group by feature
      ) f
    ),
    'usage_daily', (
      select coalesce(jsonb_agg(jsonb_build_object('day', u.day, 'feature', u.feature, 'n', u.n) order by u.day), '[]'::jsonb)
      from public.usage_counts u where u.day >= since
    )
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_usage_stats(integer) from public, anon;
grant execute on function public.admin_usage_stats(integer) to authenticated;
