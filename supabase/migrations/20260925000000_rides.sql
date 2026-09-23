-- =====================================================================
-- Balades planifiées
-- À coller dans Supabase : SQL Editor > New query > Run
-- (après 20260924000000_friends_privacy.sql)
--
-- Une balade = un trajet de groupe (group_rides) enrichi. La règle de
-- l'étape précédente s'applique donc telle quelle : pendant la balade
-- (entre started_at et ended_at), les participants "joined" se voient
-- sur la carte, même en fantôme.
-- =====================================================================

alter table public.group_rides
  add column description text check (char_length(description) <= 1000),
  add column level text not null default 'tranquille' check (level in ('tranquille', 'dynamique', 'sportif')),
  add column visibility text not null default 'private' check (visibility in ('public', 'friends', 'private')),
  add column max_participants smallint check (max_participants between 2 and 100),
  add column meeting_at timestamptz,
  add column meeting_label text check (char_length(meeting_label) <= 200),
  add column meeting_lat double precision check (meeting_lat between -90 and 90),
  add column meeting_lng double precision check (meeting_lng between -180 and 180),
  add column start_label text check (char_length(start_label) <= 200),
  add column start_lat double precision check (start_lat between -90 and 90),
  add column start_lng double precision check (start_lng between -180 and 180),
  add column end_label text check (char_length(end_label) <= 200),
  add column end_lat double precision check (end_lat between -90 and 90),
  add column end_lng double precision check (end_lng between -180 and 180),
  -- Étapes : [{ "label": "...", "lat": 43.2, "lng": 5.4 }, ...]
  add column waypoints jsonb not null default '[]'
    check (jsonb_typeof(waypoints) = 'array' and jsonb_array_length(waypoints) <= 10),
  -- Tracé : [[lat, lng], ...]
  add column route jsonb check (route is null or (jsonb_typeof(route) = 'array' and jsonb_array_length(route) <= 2000)),
  add column distance_m integer check (distance_m >= 0),
  add column duration_s integer check (duration_s >= 0);

create index group_rides_meeting_at_idx on public.group_rides (meeting_at);

-- Le créateur peut modifier sa balade (hors organisateur et dates de création)
grant update (
  description, level, visibility, max_participants, meeting_at, meeting_label, meeting_lat, meeting_lng,
  start_label, start_lat, start_lng, end_label, end_lat, end_lng, waypoints, route, distance_m, duration_s
) on public.group_rides to authenticated;

-- ---------- Démarrage encadré ----------
-- Une balade planifiée ne peut démarrer qu'autour de son heure de regroupement
-- (2 h avant à 12 h après) et jamais dans le futur : les participants ne sont
-- visibles que le jour J.
create or replace function public.group_rides_check_start()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.started_at is not null
     and (tg_op = 'INSERT' or old.started_at is distinct from new.started_at) then
    if new.started_at > now() + interval '1 minute' then
      raise exception 'Une balade ne peut pas démarrer dans le futur' using errcode = 'P0001';
    end if;
    if new.meeting_at is not null
       and (new.started_at < new.meeting_at - interval '2 hours' or new.started_at > new.meeting_at + interval '12 hours') then
      raise exception 'La balade ne peut démarrer que le jour J, autour de l''heure de regroupement' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger group_rides_check_start
  before insert or update on public.group_rides
  for each row execute function public.group_rides_check_start();

-- ---------- Qui voit une balade ? ----------
-- publique : tout membre connecté ; amis : les amis de l'organisateur ;
-- privée : l'organisateur et les invités/participants.
create or replace function public.can_see_ride(ride uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_rides r
    where r.id = ride and (
      r.created_by = (select auth.uid())
      or r.visibility = 'public'
      or (r.visibility = 'friends' and public.are_friends(r.created_by, (select auth.uid())))
      or exists (
        select 1 from public.group_ride_participants p
        where p.ride_id = r.id and p.user_id = (select auth.uid())
      )
    )
  );
$$;

revoke execute on function public.can_see_ride(uuid) from public, anon;
grant execute on function public.can_see_ride(uuid) to authenticated;

drop policy "group_rides: lecture par les membres" on public.group_rides;

-- Le test direct sur created_by permet aussi de relire une balade juste créée
-- (insert ... returning), que can_see_ride() ne voit pas encore.
create policy "group_rides: lecture selon la visibilité"
  on public.group_rides for select to authenticated
  using (created_by = (select auth.uid()) or public.can_see_ride(id));

-- Participants : les membres voient tout le monde (invités compris),
-- les autres ne voient que les participants confirmés d'une balade qu'ils peuvent voir.
drop policy "group_ride_participants: lecture par les membres" on public.group_ride_participants;

create policy "group_ride_participants: lecture"
  on public.group_ride_participants for select to authenticated
  using (public.is_ride_member(ride_id) or (status = 'joined' and public.can_see_ride(ride_id)));

-- ---------- S'inscrire soi-même ----------
-- Balade publique, ou "amis" si je suis ami avec l'organisateur, et pas encore terminée.
-- Balade privée : uniquement sur invitation (l'invité passe son statut à "joined").
create or replace function public.can_join_ride(ride uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_rides r
    where r.id = ride
      and r.ended_at is null
      and (
        r.visibility = 'public'
        or (r.visibility = 'friends' and public.are_friends(r.created_by, (select auth.uid())))
      )
  );
$$;

revoke execute on function public.can_join_ride(uuid) from public, anon;
grant execute on function public.can_join_ride(uuid) to authenticated;

create policy "group_ride_participants: inscription"
  on public.group_ride_participants for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'joined' and public.can_join_ride(ride_id));

-- ---------- Nombre max de participants ----------
-- Vérifié côté serveur, avec verrou sur la balade pour éviter les inscriptions simultanées.
create or replace function public.group_ride_participants_check_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  capacity smallint;
  joined_count integer;
begin
  if new.status <> 'joined' or (tg_op = 'UPDATE' and old.status = 'joined') then
    return new;
  end if;
  select r.max_participants into capacity from public.group_rides r where r.id = new.ride_id for update;
  if capacity is not null then
    select count(*) into joined_count
    from public.group_ride_participants p
    where p.ride_id = new.ride_id and p.status = 'joined' and p.user_id <> new.user_id;
    if joined_count >= capacity then
      raise exception 'Cette balade est complète' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger group_ride_participants_check_capacity
  before insert or update on public.group_ride_participants
  for each row execute function public.group_ride_participants_check_capacity();
