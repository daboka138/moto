-- =====================================================================
-- Lot 2 : spots motards, événements, centre de notifications
-- Spots (table places) :
-- - Catégories : café/resto motard, point de vue, belle route, station essence,
--   garage/concession, parking moto
-- - Masqués automatiquement après 3 signalements (spot ou avis) ; l'auteur les voit encore
-- Événements :
-- - Type « balade » en plus ; invitations d'amis (event_invites)
-- - Rappel push la veille (pg_cron) ; suppression 24 h après la fin
-- Notifications :
-- - Table notifications (lisible / modifiable / supprimable par son destinataire seulement),
--   remplie par le serveur (triggers et fonctions), purgée après 60 jours
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- ---------- Helpers ----------
-- « dimanche 12 octobre » (les noms de jours / mois ne dépendent pas de la langue du serveur)
create or replace function public.fr_date(t timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select (array['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'])[extract(dow from t at time zone 'Europe/Paris')::int + 1]
    || ' ' || extract(day from t at time zone 'Europe/Paris')::int || ' '
    || (array['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'])[extract(month from t at time zone 'Europe/Paris')::int];
$$;

-- ---------- Spots ----------
alter table public.places drop constraint places_kind_check;
alter table public.places add constraint places_kind_check
  check (kind in ('biker_cafe', 'garage', 'viewpoint', 'road', 'fuel', 'parking'));
alter table public.places add column hidden_at timestamptz;
alter table public.place_reviews add column hidden_at timestamptz;

drop policy "places: lecture membres connectés" on public.places;
create policy "places: lecture membres connectés"
  on public.places for select to authenticated
  using (not public.is_blocked_with(created_by) and (hidden_at is null or created_by = (select auth.uid())));

drop policy "place_reviews: lecture membres connectés" on public.place_reviews;
create policy "place_reviews: lecture membres connectés"
  on public.place_reviews for select to authenticated
  using (not public.is_blocked_with(author_id) and (hidden_at is null or author_id = (select auth.uid())));

-- 3 signalements de membres différents : spot ou avis masqué (modération a posteriori)
create or replace function public.content_reports_auto_hide()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_type not in ('place', 'place_review') then
    return new;
  end if;
  if (select count(distinct r.reporter_id) from public.content_reports r
      where r.target_type = new.target_type and r.target_id = new.target_id) >= 3 then
    if new.target_type = 'place' then
      update public.places set hidden_at = now() where id = new.target_id and hidden_at is null;
    else
      update public.place_reviews set hidden_at = now() where id = new.target_id and hidden_at is null;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.content_reports_auto_hide() from public, anon, authenticated;

create trigger content_reports_auto_hide
  after insert on public.content_reports
  for each row execute function public.content_reports_auto_hide();

-- ---------- Événements ----------
alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check
  check (kind in ('rassemblement', 'salon', 'sortie', 'circuit', 'concert', 'autre', 'balade'));

-- Supprimés 24 h après leur fin ; renvoie les photos à effacer (Edge Function cleanup-rides)
create or replace function public.purge_old_events()
returns table (photo_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    delete from public.events e
    where coalesce(e.ends_at, e.starts_at + interval '1 day') < now() - interval '24 hours'
    returning e.photo_path;
end;
$$;

-- Invitations d'amis à un événement
create table public.event_invites (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  invited_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id),
  check (user_id <> invited_by)
);

create index event_invites_user_idx on public.event_invites (user_id);

alter table public.event_invites enable row level security;

create policy "event_invites: lecture"
  on public.event_invites for select to authenticated
  using (user_id = (select auth.uid()) or invited_by = (select auth.uid()));

-- Uniquement ses amis, pour un événement pas encore terminé
create policy "event_invites: inviter un ami"
  on public.event_invites for insert to authenticated
  with check (
    invited_by = (select auth.uid())
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = (select auth.uid()) and f.addressee_id = user_id)
          or (f.addressee_id = (select auth.uid()) and f.requester_id = user_id))
    )
    and exists (
      select 1 from public.events e
      where e.id = event_id and coalesce(e.ends_at, e.starts_at + interval '1 day') > now()
    )
    and not exists (select 1 from public.event_attendees a where a.event_id = event_invites.event_id and a.user_id = event_invites.user_id)
  );

-- L'invité refuse, ou celui qui a invité retire l'invitation
create policy "event_invites: suppression"
  on public.event_invites for delete to authenticated
  using (user_id = (select auth.uid()) or invited_by = (select auth.uid()));

-- Inscrit (j'y vais / intéressé) : l'invitation n'a plus lieu d'être
create or replace function public.event_attendees_clear_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.event_invites where event_id = new.event_id and user_id = new.user_id;
  return new;
end;
$$;

revoke execute on function public.event_attendees_clear_invite() from public, anon, authenticated;

create trigger event_attendees_clear_invite
  after insert on public.event_attendees
  for each row execute function public.event_attendees_clear_invite();

-- ---------- Notifications ----------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null check (type in (
    'like', 'comment', 'friend_request', 'friend_accepted', 'ride_invite', 'event_invite', 'event_response',
    'event_reminder', 'message', 'place_new', 'place_review', 'convoy', 'regroup', 'sos'
  )),
  actor_id uuid references public.profiles (id) on delete cascade,
  -- Élément concerné : photo, ride, story, user, event, place, conversation, sos
  target_type text not null check (char_length(target_type) <= 20),
  target_id uuid,
  body text not null check (char_length(body) <= 300),
  -- Écran à ouvrir au toucher (même lien que la notification push)
  url text not null check (char_length(url) <= 300),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

create policy "notifications: lecture des miennes"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notifications: marquer les miennes"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "notifications: supprimer les miennes"
  on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Pastille en temps réel (RLS appliquée par Supabase Realtime)
alter publication supabase_realtime add table public.notifications;

-- Usage interne : une notification (rien pour soi-même ni entre membres bloqués)
create or replace function public.notify(
  p_user uuid, p_type text, p_actor uuid, p_target_type text, p_target_id uuid, p_body text, p_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user is null or p_user = p_actor then
    return;
  end if;
  if p_actor is not null and public.is_blocked_between(p_user, p_actor) then
    return;
  end if;
  -- Messages : une seule notification non lue par conversation, mise à jour
  if p_type = 'message' then
    update public.notifications
    set body = left(p_body, 300), actor_id = p_actor, created_at = now()
    where user_id = p_user and type = 'message' and target_id = p_target_id and read_at is null;
    if found then
      return;
    end if;
  end if;
  insert into public.notifications (user_id, type, actor_id, target_type, target_id, body, url)
  values (p_user, p_type, p_actor, p_target_type, p_target_id, left(p_body, 300), left(p_url, 300));
end;
$$;

create or replace function public.notify_many(
  p_users uuid[], p_type text, p_actor uuid, p_target_type text, p_target_id uuid, p_body text, p_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  u uuid;
begin
  foreach u in array coalesce(p_users, '{}') loop
    perform public.notify(u, p_type, p_actor, p_target_type, p_target_id, p_body, p_url);
  end loop;
end;
$$;

revoke execute on function public.notify(uuid, text, uuid, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.notify_many(uuid[], text, uuid, text, uuid, text, text) from public, anon, authenticated;

-- Tout marquer comme lu (p_ids null) ou seulement certaines
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null and (p_ids is null or id = any (p_ids));
$$;

-- Notification push touchée : les notifications du même lien sont lues
create or replace function public.mark_notifications_read_by_url(p_url text)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and read_at is null and url = p_url;
$$;

revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
revoke execute on function public.mark_notifications_read_by_url(text) from public, anon;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.mark_notifications_read_by_url(text) to authenticated;

-- ---------- Triggers : likes, commentaires ----------
create or replace function public.notif_wall_photo_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select owner_id into owner from public.wall_photos where id = new.photo_id;
  perform public.notify(owner, 'like', new.user_id, 'photo', new.photo_id,
    public.username_of(new.user_id) || ' a liké ta photo', '/profile?photo=' || new.photo_id);
  if owner <> new.user_id and not public.is_blocked_between(owner, new.user_id) then
    perform public.send_push(array[owner], 'friends', 'Nouveau J''aime', public.username_of(new.user_id) || ' a liké ta photo ❤️',
      jsonb_build_object('url', '/profile?photo=' || new.photo_id));
  end if;
  return new;
end;
$$;

create trigger notif_wall_photo_like after insert on public.wall_photo_likes
  for each row execute function public.notif_wall_photo_like();

create or replace function public.notif_wall_photo_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify((select owner_id from public.wall_photos where id = new.photo_id), 'comment', new.author_id, 'photo', new.photo_id,
    public.username_of(new.author_id) || ' a commenté ta photo : ' || left(new.body, 120), '/profile?photo=' || new.photo_id);
  return new;
end;
$$;

create trigger notif_wall_photo_comment after insert on public.wall_photo_comments
  for each row execute function public.notif_wall_photo_comment();

create or replace function public.notif_ride_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select created_by, title into r from public.group_rides where id = new.ride_id;
  perform public.notify(r.created_by, 'like', new.user_id, 'ride', new.ride_id,
    public.username_of(new.user_id) || ' aime ta balade « ' || r.title || ' »', '/ride/' || new.ride_id);
  return new;
end;
$$;

create trigger notif_ride_like after insert on public.ride_likes
  for each row execute function public.notif_ride_like();

create or replace function public.notif_ride_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  select created_by, title into r from public.group_rides where id = new.ride_id;
  perform public.notify(r.created_by, 'comment', new.author_id, 'ride', new.ride_id,
    public.username_of(new.author_id) || ' a commenté ta balade « ' || r.title || ' » : ' || left(new.body, 100), '/ride/' || new.ride_id);
  return new;
end;
$$;

create trigger notif_ride_comment after insert on public.ride_comments
  for each row execute function public.notif_ride_comment();

create or replace function public.notif_story_like()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select owner_id into owner from public.stories where id = new.story_id;
  perform public.notify(owner, 'like', new.user_id, 'story', new.story_id,
    public.username_of(new.user_id) || ' a liké ta story', '/story/' || owner);
  return new;
end;
$$;

create trigger notif_story_like after insert on public.story_likes
  for each row execute function public.notif_story_like();

-- ---------- Amis ----------
create or replace function public.notif_friendship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.notify(new.addressee_id, 'friend_request', new.requester_id, 'user', new.requester_id,
      public.username_of(new.requester_id) || ' veut t''ajouter en ami', '/user/' || new.requester_id);
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    delete from public.notifications
    where user_id = new.addressee_id and type = 'friend_request' and target_id = new.requester_id;
    perform public.notify(new.requester_id, 'friend_accepted', new.addressee_id, 'user', new.addressee_id,
      public.username_of(new.addressee_id) || ' a accepté ta demande d''ami', '/user/' || new.addressee_id);
  elsif tg_op = 'DELETE' and old.status = 'pending' then
    delete from public.notifications
    where user_id = old.addressee_id and type = 'friend_request' and target_id = old.requester_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger notif_friendship after insert or update or delete on public.friendships
  for each row execute function public.notif_friendship();

-- ---------- Invitations à une balade ----------
create or replace function public.notif_ride_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if tg_op = 'INSERT' and new.status = 'invited' then
    select created_by, title, meeting_at into r from public.group_rides where id = new.ride_id;
    perform public.notify(new.user_id, 'ride_invite', r.created_by, 'ride', new.ride_id,
      'Tu as été invité(e) à la balade « ' || r.title || ' » ' || public.fr_date(r.meeting_at), '/ride/' || new.ride_id);
  elsif tg_op = 'DELETE' or new.status <> 'invited' then
    -- Acceptée ou refusée : plus de boutons Accepter / Refuser
    delete from public.notifications
    where user_id = coalesce(new.user_id, old.user_id) and type = 'ride_invite' and target_id = coalesce(new.ride_id, old.ride_id);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger notif_ride_invite after insert or update of status or delete on public.group_ride_participants
  for each row execute function public.notif_ride_invite();

-- ---------- Événements ----------
create or replace function public.notif_event_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
begin
  if tg_op = 'INSERT' then
    select title, starts_at into e from public.events where id = new.event_id;
    perform public.notify(new.user_id, 'event_invite', new.invited_by, 'event', new.event_id,
      public.username_of(new.invited_by) || ' t''invite à « ' || e.title || ' » ' || public.fr_date(e.starts_at), '/event/' || new.event_id);
    if not public.is_blocked_between(new.user_id, new.invited_by) then
      perform public.send_push(array[new.user_id], 'rides', 'Invitation à un événement',
        public.username_of(new.invited_by) || ' t''invite à « ' || e.title || ' »', jsonb_build_object('url', '/event/' || new.event_id));
    end if;
  else
    delete from public.notifications where user_id = old.user_id and type = 'event_invite' and target_id = old.event_id;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger notif_event_invite after insert or delete on public.event_invites
  for each row execute function public.notif_event_invite();

-- Quelqu'un répond à mon événement (j'y vais / intéressé)
create or replace function public.notif_event_response()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  verb text := case new.status when 'going' then ' va à ' else ' est intéressé(e) par ' end;
begin
  if tg_op = 'UPDATE' and old.status = new.status then
    return new;
  end if;
  select created_by, title into e from public.events where id = new.event_id;
  perform public.notify(e.created_by, 'event_response', new.user_id, 'event', new.event_id,
    public.username_of(new.user_id) || verb || 'ton événement « ' || e.title || ' »', '/event/' || new.event_id);
  if e.created_by <> new.user_id and new.status = 'going' and not public.is_blocked_between(e.created_by, new.user_id) then
    perform public.send_push(array[e.created_by], 'rides', e.title,
      public.username_of(new.user_id) || ' participe à ton événement', jsonb_build_object('url', '/event/' || new.event_id));
  end if;
  return new;
end;
$$;

create trigger notif_event_response after insert or update of status on public.event_attendees
  for each row execute function public.notif_event_response();

-- Rappel la veille (toutes les heures : événements qui commencent dans 23 à 24 h)
create or replace function public.send_event_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  attendees uuid[];
begin
  for e in
    select * from public.events
    where starts_at > now() + interval '23 hours' and starts_at <= now() + interval '24 hours'
  loop
    insert into public.push_log (key) values ('event-reminder:' || e.id || ':' || e.starts_at) on conflict do nothing;
    if not found then
      continue;
    end if;
    select coalesce(array_agg(a.user_id), '{}') into attendees from public.event_attendees a where a.event_id = e.id;
    perform public.send_push(attendees, 'rides', 'Demain : ' || e.title,
      'Rendez-vous ' || public.fr_date(e.starts_at) || ' à ' || to_char(e.starts_at at time zone 'Europe/Paris', 'HH24"h"MI') || ' · ' || e.place_label,
      jsonb_build_object('url', '/event/' || e.id));
    perform public.notify_many(attendees, 'event_reminder', null, 'event', e.id,
      'Rappel : « ' || e.title || ' » demain à ' || to_char(e.starts_at at time zone 'Europe/Paris', 'HH24"h"MI'), '/event/' || e.id);
  end loop;
end;
$$;

revoke execute on function public.send_event_reminders() from public, anon, authenticated;

-- ---------- Messages privés (une notification par conversation, lue en ouvrant le chat) ----------
create or replace function public.notif_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv record;
  member uuid;
begin
  select kind into conv from public.conversations where id = new.conversation_id;
  -- Messages de SOS : déjà une notification « sos »
  if conv.kind <> 'direct' or current_setting('passeryder.sos_message', true) = '1' then
    return new;
  end if;
  for member in
    select m.user_id from public.conversation_members m
    where m.conversation_id = new.conversation_id and m.user_id <> new.sender_id
  loop
    perform public.notify(member, 'message', new.sender_id, 'conversation', new.conversation_id,
      public.username_of(new.sender_id) || ' : ' || coalesce(left(new.body, 120), '📷 Photo'), '/chat/' || new.conversation_id);
  end loop;
  return new;
end;
$$;

create trigger notif_message after insert on public.messages
  for each row execute function public.notif_message();

create or replace function public.notif_message_read()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications set read_at = now()
  where user_id = new.user_id and type = 'message' and target_id = new.conversation_id and read_at is null;
  return new;
end;
$$;

create trigger notif_message_read after update of last_read_at on public.conversation_members
  for each row execute function public.notif_message_read();

-- ---------- Spots ----------
create or replace function public.notif_place_new()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_many(
    array(
      select case when f.requester_id = new.created_by then f.addressee_id else f.requester_id end
      from public.friendships f
      where f.status = 'accepted' and (f.requester_id = new.created_by or f.addressee_id = new.created_by)
    ),
    'place_new', new.created_by, 'place', new.id,
    public.username_of(new.created_by) || ' a ajouté un spot : ' || new.name, '/place/' || new.id);
  return new;
end;
$$;

create trigger notif_place_new after insert on public.places
  for each row execute function public.notif_place_new();

create or replace function public.notif_place_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  select created_by, name into p from public.places where id = new.place_id;
  perform public.notify(p.created_by, 'place_review', new.author_id, 'place', new.place_id,
    public.username_of(new.author_id) || ' a noté ton spot « ' || p.name || ' » ' || repeat('★', new.rating), '/place/' || new.place_id);
  return new;
end;
$$;

create trigger notif_place_review after insert on public.place_reviews
  for each row execute function public.notif_place_review();

revoke execute on function public.notif_wall_photo_like(), public.notif_wall_photo_comment(), public.notif_ride_like(),
  public.notif_ride_comment(), public.notif_story_like(), public.notif_friendship(), public.notif_ride_invite(),
  public.notif_event_invite(), public.notif_event_response(), public.notif_message(), public.notif_message_read(),
  public.notif_place_new(), public.notif_place_review() from public, anon, authenticated;

-- ---------- Tâches planifiées ----------
select cron.schedule('event-reminders', '7 * * * *', $$ select public.send_event_reminders(); $$);
select cron.schedule('notifications-cleanup', '37 3 * * *', $$ delete from public.notifications where created_at < now() - interval '60 days'; $$);

-- ---------- Convoi, regroupement, SOS : aussi dans le centre de notifications ----------
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
  perform public.notify_many(recipients, 'regroup', me, 'ride', p_ride,
    public.username_of(me) || ' pose un point de regroupement : ' || label || ' (« ' || r.title || ' »)',
    '/?goLat=' || round(p_lat::numeric, 6) || '&goLng=' || round(p_lng::numeric, 6) ||
      '&goLabel=' || replace(replace('Regroupement · ' || label, '&', ' '), '?', ' '));
end;
$$;

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
          perform public.notify_many(array(select w from unnest(watchers) w where w <> m.user_id), 'convoy', m.user_id, 'ride', r.id,
            'Convoi « ' || r.title || ' » : ' || public.username_of(m.user_id) || ' ' || detail, url);
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

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
    perform public.notify(contact, 'sos', owner, 'sos', sos, '🆘 SOS de ' || who || ' : ' || what, '/sos/' || sos);
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
      perform public.notify_many(group_members, 'sos', owner, 'ride', ride.id,
        '🆘 ' || case sos_kind when 'fall' then 'Chute de ' else 'SOS de ' end || who || ' (' || ride.title || ')',
        case when lat is null then '/messages'
          else '/?goLat=' || round(lat::numeric, 6) || '&goLng=' || round(lng::numeric, 6) ||
            '&goLabel=' || replace(replace('Position de ' || who, '&', ' '), '?', ' ') end);
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
