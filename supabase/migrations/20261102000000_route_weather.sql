-- Note 33 A : météo sur le trajet, source MET Norway (api.met.no, Locationforecast 2.0,
-- licences NLOD 2.0 / CC BY 4.0 : usage commercial gratuit, crédit « MET Norway » affiché).
-- - weather_cache : réponses de MET Norway par case de 0,1° (~10 km), gardées jusqu'à leur
--   « Expires » (conditions de MET : cache obligatoire, If-Modified-Since, User-Agent identifié).
--   Écrite et lue UNIQUEMENT par les Edge Functions `weather` et `ride-weather` (service_role) :
--   aucune règle RLS, aucun lien avec un membre (seulement des cases arrondies).
-- - Notification la veille au soir aux participants d'une balade si la météo prévue est mauvaise
--   (pg_cron « ride-weather » → Edge Function ride-weather → ride_weather_done), réglage
--   notification_prefs.weather (Paramètres › Notifications).

create table public.weather_cache (
  -- « 43.3,5.7 » (case de 0,1°)
  cell text primary key check (cell ~ '^-?[0-9]{1,2}\.[0-9],-?[0-9]{1,3}\.[0-9]$'),
  -- Heures compactes : [[heure unix, °C, mm/h, vent km/h, rafales km/h ou null, symbole, pas en h], ...]
  series jsonb not null,
  last_modified text,
  expires_at timestamptz not null,
  fetched_at timestamptz not null default now()
);

alter table public.weather_cache enable row level security;
-- Aucune règle : seules les Edge Functions (service_role) y accèdent.

-- Cases plus vieilles qu'un jour : effacées (pg_cron « weather-cache-cleanup »)
select cron.schedule(
  'weather-cache-cleanup',
  '41 3 * * *',
  $$ delete from public.weather_cache where expires_at < now() - interval '1 day' $$
);

-- ---------- Réglage : alerte météo la veille d'une balade ----------
alter table public.notification_prefs add column weather boolean not null default true;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'like', 'comment', 'friend_request', 'friend_accepted', 'ride_invite', 'event_invite', 'event_response',
  'event_reminder', 'message', 'place_new', 'place_review', 'convoy', 'regroup', 'sos',
  'referral', 'club_request', 'club_accepted', 'reaction', 'group_added', 'passenger', 'store_launch',
  'weather'
));

-- Balades de demain (heure de Paris) pas encore vérifiées : tracé (ou départ / étapes / arrivée)
create or replace function public.ride_weather_targets()
returns table (
  id uuid, title text, meeting_at timestamptz, duration_s integer, route jsonb,
  start_lat double precision, start_lng double precision, end_lat double precision, end_lng double precision,
  meeting_lat double precision, meeting_lng double precision, waypoints jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.title, r.meeting_at, r.duration_s, r.route,
         r.start_lat, r.start_lng, r.end_lat, r.end_lng, r.meeting_lat, r.meeting_lng, r.waypoints
  from public.group_rides r
  where r.meeting_at is not null
    and r.started_at is null
    and r.ended_at is null
    and (r.meeting_at at time zone 'Europe/Paris')::date = (now() at time zone 'Europe/Paris')::date + 1
    and not exists (select 1 from public.push_log l where l.key = 'ride-weather:' || r.id)
  order by r.meeting_at
  limit 200;
$$;

revoke execute on function public.ride_weather_targets() from public, anon, authenticated;
grant execute on function public.ride_weather_targets() to service_role;

-- Balade vérifiée (une seule fois) ; p_body non nul = météo mauvaise → notification + push aux
-- inscrits et à l'organisateur qui ont gardé le réglage « Météo de mes balades »
create or replace function public.ride_weather_done(p_ride uuid, p_body text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ride record;
  recipients uuid[];
begin
  insert into public.push_log (key) values ('ride-weather:' || p_ride) on conflict do nothing;
  if not found or p_body is null then
    return 0;
  end if;
  select r.id, r.title, r.created_by into ride from public.group_rides r where r.id = p_ride;
  if ride.id is null then
    return 0;
  end if;
  select coalesce(array_agg(distinct u.user_id), '{}') into recipients
  from (
    select p.user_id from public.group_ride_participants p where p.ride_id = p_ride and p.status = 'joined'
    union select ride.created_by
  ) u
  left join public.notification_prefs n on n.user_id = u.user_id
  where coalesce(n.weather, true);
  if cardinality(recipients) = 0 then
    return 0;
  end if;
  perform public.notify_many(recipients, 'weather', null, 'ride', p_ride,
    'Météo de demain pour « ' || ride.title || ' » : ' || p_body, '/ride/' || p_ride);
  perform public.send_push(recipients, 'rides', 'Météo de ta balade demain', ride.title || ' : ' || p_body,
    jsonb_build_object('url', '/ride/' || p_ride));
  return cardinality(recipients);
end;
$$;

revoke execute on function public.ride_weather_done(uuid, text) from public, anon, authenticated;
grant execute on function public.ride_weather_done(uuid, text) to service_role;

-- Tous les soirs à 17 h UTC (18 h en hiver, 19 h en été à Paris). La fonction ne fait que lire
-- des prévisions publiques et prévient une seule fois par balade : l'appeler n'expose rien.
select cron.schedule(
  'ride-weather',
  '0 17 * * *',
  $$
  select net.http_post(
    url := 'https://yfewldnhnnrzzscmfjsd.supabase.co/functions/v1/ride-weather',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
