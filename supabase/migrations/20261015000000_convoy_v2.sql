-- =====================================================================
-- Convoi v2 (balade en cours) : alertes serveur, regroupement, pause, chute au groupe
-- - group_rides.convoy_gap_km : écart toléré (défaut 2 km), réglé par l'organisateur
-- - convoy_tracking + check_convoys() (pg_cron chaque minute) : un membre qui décroche
--   (> écart du motard le plus proche, arrêté > 2 min pendant que le groupe roule, plus de
--   position depuis > 3 min) → push à l'ouvreur et au serre-file (à défaut l'organisateur),
--   une fois par décrochage. Rien pour un membre en pause
-- - Point de regroupement (ouvreur ou organisateur) : push à tous avec l'itinéraire
-- - « Je fais une pause » (group_ride_participants.paused_until)
-- - SOS / chute pendant une balade en cours : alerte prioritaire à tout le groupe
-- Appliquée avec : npx supabase db push
-- =====================================================================

alter table public.group_rides
  add column convoy_gap_km real not null default 2 check (convoy_gap_km between 0.5 and 20),
  add column regroup_lat double precision check (regroup_lat between -90 and 90),
  add column regroup_lng double precision check (regroup_lng between -180 and 180),
  add column regroup_label text check (char_length(regroup_label) <= 120),
  add column regroup_at timestamptz;

grant update (convoy_gap_km) on public.group_rides to authenticated;

alter table public.group_ride_participants add column paused_until timestamptz;

-- Distance en mètres entre deux points (formule de haversine)
create or replace function public.geo_distance_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 2 * 6371000 * asin(least(1, sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  )));
$$;

-- Balade en cours (démarrée, pas terminée, démarrée il y a moins de 12 h)
create or replace function public.ride_is_live(r public.group_rides)
returns boolean
language sql
stable
set search_path = ''
as $$
  select r.started_at is not null and r.ended_at is null and r.started_at > now() - interval '12 hours';
$$;

-- ---------- Pause ----------
create or replace function public.set_ride_pause(p_ride uuid, p_minutes integer)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_until timestamptz := case when coalesce(p_minutes, 0) <= 0 then null else now() + make_interval(mins => least(p_minutes, 60)) end;
begin
  update public.group_ride_participants set paused_until = v_until
  where ride_id = p_ride and user_id = (select auth.uid()) and status = 'joined';
  if not found then
    raise exception 'Tu ne participes pas à cette balade' using errcode = 'P0001';
  end if;
  return v_until;
end;
$$;

revoke execute on function public.set_ride_pause(uuid, integer) from public, anon;
grant execute on function public.set_ride_pause(uuid, integer) to authenticated;

-- ---------- Regroupement ----------
create or replace function public.set_regroup_point(p_ride uuid, p_lat double precision, p_lng double precision, p_label text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  r public.group_rides;
  recipients uuid[];
  label text := left(coalesce(nullif(trim(p_label), ''), 'Point de regroupement'), 120);
begin
  select * into r from public.group_rides where id = p_ride;
  if not found or not public.ride_is_live(r) then
    raise exception 'La balade n''est pas en cours' using errcode = 'P0001';
  end if;
  if r.created_by <> me and not exists (
    select 1 from public.group_ride_participants p
    where p.ride_id = p_ride and p.user_id = me and p.status = 'joined' and p.role = 'leader'
  ) then
    raise exception 'Seuls l''ouvreur et l''organisateur posent le regroupement' using errcode = 'P0001';
  end if;

  if p_lat is null then
    update public.group_rides set regroup_lat = null, regroup_lng = null, regroup_label = null, regroup_at = null where id = p_ride;
    return;
  end if;
  update public.group_rides
  set regroup_lat = p_lat, regroup_lng = p_lng, regroup_label = label, regroup_at = now()
  where id = p_ride;

  select coalesce(array_agg(p.user_id), '{}') into recipients
  from public.group_ride_participants p
  where p.ride_id = p_ride and p.status = 'joined' and p.user_id <> me;
  perform public.send_push(recipients, 'rides', '📍 Regroupement : ' || r.title,
    public.username_of(me) || ' pose un point de regroupement : ' || label || '. Touche pour l''itinéraire.',
    jsonb_build_object('url', '/?goLat=' || round(p_lat::numeric, 6) || '&goLng=' || round(p_lng::numeric, 6) ||
      '&goLabel=' || replace(replace('Regroupement · ' || label, '&', ' '), '?', ' ')));
end;
$$;

revoke execute on function public.set_regroup_point(uuid, double precision, double precision, text) from public, anon;
grant execute on function public.set_regroup_point(uuid, double precision, double precision, text) to authenticated;

-- ---------- Suivi du convoi par le serveur ----------
create table public.convoy_tracking (
  ride_id uuid not null references public.group_rides (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Dernier endroit où le motard a bougé de plus de 80 m
  anchor_lat double precision,
  anchor_lng double precision,
  anchor_at timestamptz,
  state text not null default 'ok' check (state in ('ok', 'paused', 'far', 'stopped', 'lost')),
  state_since timestamptz not null default now(),
  primary key (ride_id, user_id)
);

-- Écriture et lecture par le serveur uniquement (aucune règle pour les membres)
alter table public.convoy_tracking enable row level security;

create or replace function public.check_convoys()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  m record;
  watchers uuid[];
  new_state text;
  nearest double precision;
  stopped_s double precision;
  group_left boolean;
  detail text;
  url text;
begin
  for r in select g.* from public.group_rides g where public.ride_is_live(g) loop
    -- Points d'immobilité (position fraîche = moins de 3 min) : déplacés si le motard a bougé de plus de 80 m
    insert into public.convoy_tracking (ride_id, user_id, anchor_lat, anchor_lng, anchor_at)
    select r.id, p.user_id, l.latitude, l.longitude, now()
    from public.group_ride_participants p
    join public.live_positions l on l.user_id = p.user_id
    where p.ride_id = r.id and p.status = 'joined' and l.updated_at > now() - interval '3 minutes'
    on conflict (ride_id, user_id) do update
      set anchor_lat = excluded.anchor_lat, anchor_lng = excluded.anchor_lng, anchor_at = excluded.anchor_at
      where public.convoy_tracking.anchor_lat is null
         or public.geo_distance_m(public.convoy_tracking.anchor_lat, public.convoy_tracking.anchor_lng,
                                  excluded.anchor_lat, excluded.anchor_lng) > 80;

    -- Qui reçoit les alertes : ouvreur et serre-file, sinon l'organisateur
    select coalesce(array_agg(p.user_id), '{}') into watchers
    from public.group_ride_participants p
    where p.ride_id = r.id and p.status = 'joined' and p.role in ('leader', 'sweeper');
    if cardinality(watchers) = 0 then
      watchers := array[r.created_by];
    end if;

    for m in
      select p.user_id, l.latitude as lat, l.longitude as lng, l.updated_at,
        coalesce(l.updated_at > now() - interval '3 minutes', false) as fresh,
        coalesce(p.paused_until > now(), false) as paused,
        t.anchor_at, t.state as old_state
      from public.group_ride_participants p
      left join public.live_positions l on l.user_id = p.user_id
      left join public.convoy_tracking t on t.ride_id = r.id and t.user_id = p.user_id
      where p.ride_id = r.id and p.status = 'joined'
    loop
      detail := null;
      if m.paused then
        new_state := 'paused';
      elsif m.updated_at is null or m.updated_at < r.started_at then
        -- Jamais localisé pendant la balade (app fermée depuis le départ) : pas d'alerte
        new_state := 'ok';
      elsif not m.fresh then
        new_state := 'lost';
        detail := 'plus de réseau depuis ' || greatest(3, floor(extract(epoch from now() - m.updated_at) / 60))::int ||
          ' min (dernière position à ' || to_char(m.updated_at at time zone 'Europe/Paris', 'HH24"h"MI') || ')';
      else
        -- Motard le plus proche (positions fraîches des autres inscrits)
        select min(public.geo_distance_m(m.lat, m.lng, lo.latitude, lo.longitude)) into nearest
        from public.group_ride_participants o
        join public.live_positions lo on lo.user_id = o.user_id
        where o.ride_id = r.id and o.status = 'joined' and o.user_id <> m.user_id
          and lo.updated_at > now() - interval '3 minutes';
        stopped_s := extract(epoch from now() - coalesce(m.anchor_at, now()));
        -- Le groupe roule : quelqu'un a bougé dans la dernière minute et demie, à plus de 300 m
        select exists (
          select 1
          from public.group_ride_participants o
          join public.live_positions lo on lo.user_id = o.user_id
          join public.convoy_tracking ot on ot.ride_id = r.id and ot.user_id = o.user_id
          where o.ride_id = r.id and o.status = 'joined' and o.user_id <> m.user_id
            and lo.updated_at > now() - interval '3 minutes'
            and ot.anchor_at > now() - interval '90 seconds'
            and public.geo_distance_m(m.lat, m.lng, lo.latitude, lo.longitude) > 300
        ) into group_left;
        if nearest is null then
          new_state := 'ok';
        elsif stopped_s >= 120 and group_left then
          new_state := 'stopped';
          detail := 'arrêté depuis ' || floor(stopped_s / 60)::int || ' min alors que le groupe roule';
        elsif nearest > r.convoy_gap_km * 1000 then
          new_state := 'far';
          detail := 'à ' || replace(to_char(nearest / 1000, 'FM990.0'), '.', ',') || ' km derrière le groupe';
        else
          new_state := 'ok';
        end if;
      end if;

      if new_state is distinct from coalesce(m.old_state, 'ok') then
        insert into public.convoy_tracking (ride_id, user_id, state, state_since)
        values (r.id, m.user_id, new_state, now())
        on conflict (ride_id, user_id) do update set state = excluded.state, state_since = now();
        if new_state in ('far', 'stopped', 'lost') and m.lat is not null then
          url := '/?goLat=' || round(m.lat::numeric, 6) || '&goLng=' || round(m.lng::numeric, 6) ||
            '&goLabel=' || replace(replace(public.username_of(m.user_id), '&', ' '), '?', ' ');
          perform public.send_push(
            array(select w from unnest(watchers) w where w <> m.user_id),
            'rides',
            '⚠️ Convoi : ' || public.username_of(m.user_id) ||
              case new_state when 'lost' then ' a perdu le réseau' when 'stopped' then ' est arrêté' else ' a décroché' end,
            upper(left(detail, 1)) || substr(detail, 2) || '. Touche pour aller à sa position.',
            jsonb_build_object('url', url)
          );
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.check_convoys() from public, anon, authenticated;

select cron.schedule('convoy-check', '* * * * *', $$ select public.check_convoys(); $$);

-- ---------- SOS / chute pendant une balade : tout le groupe est prévenu ----------
create or replace function public.raise_sos(owner uuid, sos_kind text, lat double precision, lng double precision, only_contacts uuid[] default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  sos uuid;
  contact uuid;
  recipients uuid[] := '{}';
  who text := public.username_of(owner);
  what text := case sos_kind
    when 'fall' then 'Chute détectée, sans réponse de sa part'
    when 'homecoming' then 'N''est pas arrivé(e) à l''heure prévue (« Je rentre »)'
    else 'Demande d''aide'
  end;
  place text := case
    when lat is null then 'Position inconnue.'
    else 'Position : https://maps.google.com/?q=' || round(lat::numeric, 6) || ',' || round(lng::numeric, 6)
  end;
  ride record;
  group_members uuid[];
begin
  insert into public.sos_events (user_id, kind, latitude, longitude)
  values (owner, sos_kind, lat, lng) returning id into sos;

  -- Message dans la conversation privée (pas de 2e notification « message »)
  perform set_config('passeryder.sos_message', '1', true);
  for contact in
    select c.contact_id from public.emergency_contacts c
    where c.user_id = owner and not public.is_blocked_between(owner, c.contact_id)
      and (only_contacts is null or c.contact_id = any (only_contacts))
  loop
    recipients := recipients || contact;
    insert into public.messages (conversation_id, sender_id, body)
    values (public.direct_conversation_between(owner, contact), owner, '🆘 SOS — ' || what || '. ' || place);
  end loop;

  -- Balade en cours : message dans la conversation de la balade + alerte prioritaire au groupe
  if sos_kind in ('fall', 'manual') then
    for ride in
      select g.id, g.title, c.id as conversation_id
      from public.group_rides g
      join public.group_ride_participants p on p.ride_id = g.id and p.user_id = owner and p.status = 'joined'
      left join public.conversations c on c.ride_id = g.id
      where public.ride_is_live(g)
    loop
      if ride.conversation_id is not null then
        insert into public.messages (conversation_id, sender_id, body)
        values (ride.conversation_id, owner, '🆘 ' || what || '. ' || place);
      end if;
      select coalesce(array_agg(p.user_id), '{}') into group_members
      from public.group_ride_participants p
      where p.ride_id = ride.id and p.status = 'joined' and p.user_id <> owner
        and not (p.user_id = any (recipients))
        and not public.is_blocked_between(owner, p.user_id);
      perform public.send_push(group_members, 'sos',
        '🆘 ' || case sos_kind when 'fall' then 'Chute de ' else 'SOS de ' end || who || ' (' || ride.title || ')',
        what || '. Touche pour aller à sa position.',
        case when lat is null then jsonb_build_object('url', '/messages')
          else jsonb_build_object('url', '/?goLat=' || round(lat::numeric, 6) || '&goLng=' || round(lng::numeric, 6) ||
            '&goLabel=' || replace(replace('Position de ' || who, '&', ' '), '?', ' ')) end);
    end loop;
  end if;
  perform set_config('passeryder.sos_message', '0', true);

  perform public.send_push(recipients, 'sos', '🆘 SOS de ' || who, what || '. Touche pour voir sa position.',
    jsonb_build_object('url', '/sos/' || sos));
  return sos;
end;
$$;

revoke execute on function public.raise_sos(uuid, text, double precision, double precision, uuid[]) from public, anon, authenticated;
