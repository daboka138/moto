-- =====================================================================
-- Passagers (« sac de sable ») dans les balades (note 19, point 6)
-- Chaque inscrit coche « 🏍️ J'ai une place passager » (offer) ou « 🎒 Je cherche une place » (seek).
-- La demande passe par un message privé pré-rempli ; le pilote accepte avec pair_ride_passenger
-- (passenger_partner rempli des deux côtés = place prise). Écritures par RPC uniquement.
-- =====================================================================

alter table public.group_ride_participants
  add column if not exists passenger text check (passenger in ('offer', 'seek')),
  add column if not exists passenger_partner uuid references public.profiles (id) on delete set null;

-- Nouveau type de notification : « @pilote t'emmène en passager »
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'like', 'comment', 'friend_request', 'friend_accepted', 'ride_invite', 'event_invite', 'event_response',
  'event_reminder', 'message', 'place_new', 'place_review', 'convoy', 'regroup', 'sos',
  'referral', 'club_request', 'club_accepted', 'reaction', 'group_added', 'passenger'
));

-- Je propose / cherche une place (null = rien). Défait une association en cours.
create or replace function public.set_ride_passenger(p_ride uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  partner uuid;
begin
  if p_mode is not null and p_mode not in ('offer', 'seek') then
    raise exception 'Choix inconnu' using errcode = 'P0001';
  end if;
  select passenger_partner into partner from public.group_ride_participants
  where ride_id = p_ride and user_id = me and status = 'joined' for update;
  if not found then
    raise exception 'Inscris-toi d''abord à la balade' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.group_rides r where r.id = p_ride and r.ended_at is not null) then
    raise exception 'Cette balade est terminée' using errcode = 'P0001';
  end if;
  if partner is not null then
    update public.group_ride_participants set passenger_partner = null
    where ride_id = p_ride and user_id = partner and passenger_partner = me;
  end if;
  update public.group_ride_participants set passenger = p_mode, passenger_partner = null
  where ride_id = p_ride and user_id = me;
end;
$$;

-- Le pilote (place proposée, libre) emmène un inscrit qui cherche une place
create or replace function public.pair_ride_passenger(p_ride uuid, p_seeker uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  ride_title text;
begin
  if not exists (
    select 1 from public.group_ride_participants
    where ride_id = p_ride and user_id = me and status = 'joined' and passenger = 'offer' and passenger_partner is null
  ) then
    raise exception 'Coche d''abord « J''ai une place passager » (place encore libre)' using errcode = 'P0001';
  end if;
  if p_seeker = me or not exists (
    select 1 from public.group_ride_participants
    where ride_id = p_ride and user_id = p_seeker and status = 'joined' and passenger = 'seek' and passenger_partner is null
  ) then
    raise exception 'Ce motard ne cherche plus de place' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(me, p_seeker) then
    raise exception 'Impossible avec ce membre' using errcode = 'P0001';
  end if;
  update public.group_ride_participants set passenger_partner = p_seeker where ride_id = p_ride and user_id = me;
  update public.group_ride_participants set passenger_partner = me where ride_id = p_ride and user_id = p_seeker;
  select title into ride_title from public.group_rides where id = p_ride;
  perform public.notify(p_seeker, 'passenger', me, 'ride', p_ride,
    public.username_of(me) || ' t''emmène en passager pour « ' || ride_title || ' » 🏍️', '/ride/' || p_ride);
  perform public.send_push(array[p_seeker], 'rides', ride_title,
    public.username_of(me) || ' t''emmène en passager 🏍️ (casque homologué et gants certifiés obligatoires)',
    jsonb_build_object('url', '/ride/' || p_ride));
end;
$$;

-- Un inscrit qui quitte la balade libère son pilote / son passager
create or replace function public.ride_participants_free_partner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.group_ride_participants set passenger_partner = null
  where ride_id = old.ride_id and passenger_partner = old.user_id;
  return null;
end;
$$;

drop trigger if exists ride_participants_free_partner on public.group_ride_participants;
create trigger ride_participants_free_partner
  after delete on public.group_ride_participants
  for each row execute function public.ride_participants_free_partner();

revoke all on function public.set_ride_passenger(uuid, text) from public, anon;
revoke all on function public.pair_ride_passenger(uuid, uuid) from public, anon;
grant execute on function public.set_ride_passenger(uuid, text) to authenticated;
grant execute on function public.pair_ride_passenger(uuid, uuid) to authenticated;
