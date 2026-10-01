-- =====================================================================
-- Sécurité et notifications :
--  - contacts d'urgence (membres de l'app ; les numéros de téléphone restent sur le téléphone)
--  - SOS (manuel, chute, « Je rentre » expiré) : message + notification aux contacts
--  - mode « Je rentre » : alerte automatique si je ne suis pas arrivé à l'heure (pg_cron)
--  - notifications push (jetons Expo, préférences par type), envoyées par Postgres à
--    l'API Expo Push (pg_net) : messages, demandes d'ami, invitations et rappels de balade,
--    SOS, dangers signalés près de moi
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- ---------- Envoi des notifications ----------

create table public.push_tokens (
  token text primary key check (char_length(token) between 10 and 200),
  user_id uuid not null references public.profiles (id) on delete cascade,
  updated_at timestamptz not null default now()
);

create index push_tokens_user_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create policy "push_tokens: lecture des miens"
  on public.push_tokens for select to authenticated
  using (user_id = (select auth.uid()));

-- Le téléphone enregistre son jeton (repris s'il appartenait à un autre compte sur ce téléphone)
create or replace function public.register_push_token(push_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Non connecté' using errcode = 'P0001';
  end if;
  insert into public.push_tokens (token, user_id) values (push_token, auth.uid())
  on conflict (token) do update set user_id = excluded.user_id, updated_at = now();
  -- 5 téléphones max par compte : les plus anciens partent
  delete from public.push_tokens t
  where t.user_id = auth.uid()
    and t.token not in (
      select x.token from public.push_tokens x where x.user_id = auth.uid() order by x.updated_at desc limit 5
    );
end;
$$;

create or replace function public.unregister_push_token(push_token text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_tokens where token = push_token and user_id = auth.uid();
$$;

revoke execute on function public.register_push_token(text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- Préférences par type (pas de ligne = tout activé). Les SOS ne se désactivent pas.
create table public.notification_prefs (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  messages boolean not null default true,
  rides boolean not null default true,
  friends boolean not null default true,
  dangers boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy "notification_prefs: lecture des miennes"
  on public.notification_prefs for select to authenticated
  using (user_id = (select auth.uid()));

create policy "notification_prefs: création des miennes"
  on public.notification_prefs for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "notification_prefs: modification des miennes"
  on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Notifications déjà envoyées par les tâches planifiées (pas de doublon)
create table public.push_log (
  key text primary key,
  created_at timestamptz not null default now()
);

alter table public.push_log enable row level security;

-- Usage interne : envoie une notification aux téléphones de ces membres, selon leurs préférences.
-- category = messages | rides | friends | dangers | sos (aussi le canal Android)
create or replace function public.send_push(recipients uuid[], category text, p_title text, p_body text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch jsonb;
begin
  -- L'API Expo accepte 100 notifications par requête
  for batch in
    select jsonb_agg(m.msg)
    from (
      select
        jsonb_build_object(
          'to', t.token,
          'title', left(p_title, 100),
          'body', left(p_body, 300),
          'data', coalesce(p_data, '{}'::jsonb) || jsonb_build_object('type', category),
          'sound', 'default',
          'priority', 'high',
          'channelId', category
        ) as msg,
        (row_number() over () - 1) / 100 as grp
      from public.push_tokens t
      left join public.notification_prefs p on p.user_id = t.user_id
      where t.user_id = any (recipients)
        and case category
          when 'messages' then coalesce(p.messages, true)
          when 'rides' then coalesce(p.rides, true)
          when 'friends' then coalesce(p.friends, true)
          when 'dangers' then coalesce(p.dangers, true)
          else true
        end
    ) m
    group by m.grp
  loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := batch,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  end loop;
exception when others then
  -- Une notification ratée ne doit jamais bloquer l'action (message, SOS…)
  raise warning 'send_push: %', sqlerrm;
end;
$$;

revoke execute on function public.send_push(uuid[], text, text, text, jsonb) from public, anon, authenticated;

create or replace function public.username_of(u uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce('@' || p.username, 'Un motard') from public.profiles p where p.id = u;
$$;

revoke execute on function public.username_of(uuid) from public, anon, authenticated;

-- ---------- Notifications : nouveaux messages ----------
create or replace function public.messages_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv record;
  recipients uuid[];
  sender text := public.username_of(new.sender_id);
  preview text;
begin
  -- Messages SOS : notifiés par le SOS lui-même
  if current_setting('passeryder.sos_message', true) = '1' then
    return null;
  end if;
  select c.kind, r.title into conv
  from public.conversations c left join public.group_rides r on r.id = c.ride_id
  where c.id = new.conversation_id;

  select coalesce(array_agg(m.user_id), '{}') into recipients
  from public.conversation_members m
  where m.conversation_id = new.conversation_id
    and m.user_id <> new.sender_id
    and not public.is_blocked_between(m.user_id, new.sender_id);

  preview := case
    when new.trip_share_id is not null then '📍 Trajet partagé en direct'
    when new.body is not null then new.body
    else '📷 Photo'
  end;
  perform public.send_push(
    recipients,
    'messages',
    case when conv.kind = 'ride' then coalesce(conv.title, 'Balade') else sender end,
    case when conv.kind = 'ride' then sender || ' : ' || preview else preview end,
    jsonb_build_object('url', '/chat/' || new.conversation_id, 'conversationId', new.conversation_id)
  );
  return null;
end;
$$;

create trigger messages_notify
  after insert on public.messages
  for each row execute function public.messages_notify();

-- ---------- Notifications : amis ----------
create or replace function public.friendships_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.send_push(array[new.addressee_id], 'friends', 'Demande d''ami',
      public.username_of(new.requester_id) || ' veut t''ajouter en ami', jsonb_build_object('url', '/friends'));
  elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
    perform public.send_push(array[new.requester_id], 'friends', 'Nouvel ami',
      public.username_of(new.addressee_id) || ' a accepté ta demande', jsonb_build_object('url', '/user/' || new.addressee_id));
  end if;
  return null;
end;
$$;

create trigger friendships_notify
  after insert or update on public.friendships
  for each row execute function public.friendships_notify();

-- ---------- Notifications : invitations et rappels de balade ----------
create or replace function public.ride_invite_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ride record;
begin
  if new.status <> 'invited' then
    return null;
  end if;
  select r.title, r.created_by, r.meeting_at into ride from public.group_rides r where r.id = new.ride_id;
  perform public.send_push(array[new.user_id], 'rides', 'Invitation à une balade',
    public.username_of(ride.created_by) || ' t''invite : ' || ride.title ||
      coalesce(' (' || to_char(ride.meeting_at at time zone 'Europe/Paris', 'DD/MM à HH24"h"MI') || ')', ''),
    jsonb_build_object('url', '/ride/' || new.ride_id));
  return null;
end;
$$;

create trigger group_ride_participants_notify
  after insert on public.group_ride_participants
  for each row execute function public.ride_invite_notify();

-- Rappel 1 h avant le RDV aux inscrits (tâche planifiée toutes les 5 min)
create or replace function public.send_ride_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ride record;
  recipients uuid[];
begin
  for ride in
    select r.id, r.title, r.meeting_at, r.meeting_label
    from public.group_rides r
    where r.meeting_at between now() + interval '50 minutes' and now() + interval '65 minutes'
      and r.ended_at is null
  loop
    insert into public.push_log (key) values ('ride-reminder:' || ride.id) on conflict do nothing;
    if not found then
      continue;
    end if;
    select coalesce(array_agg(p.user_id), '{}') into recipients
    from public.group_ride_participants p where p.ride_id = ride.id and p.status = 'joined';
    perform public.send_push(recipients, 'rides', 'Balade dans 1 h : ' || ride.title,
      'RDV à ' || to_char(ride.meeting_at at time zone 'Europe/Paris', 'HH24"h"MI') ||
        coalesce(' · ' || ride.meeting_label, ''),
      jsonb_build_object('url', '/ride/' || ride.id));
  end loop;
end;
$$;

revoke execute on function public.send_ride_reminders() from public, anon, authenticated;

-- ---------- Notifications : danger signalé près de moi ----------
-- Membres dont la position a été mise à jour il y a moins de 15 min, à moins de 3 km
create or replace function public.road_reports_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
  label text := case new.type
    when 'accident' then '💥 Accident'
    when 'gravel' then '🪨 Gravillons'
    when 'oil' then '🛢️ Huile sur la route'
    when 'roadworks' then '🚧 Travaux'
    when 'object' then '📦 Objet sur la route'
    when 'animal' then '🦌 Animal sur la route'
    when 'traffic_jam' then '🚗 Bouchon'
    when 'stopped_vehicle' then '🚙 Véhicule arrêté'
    else '⚠️ Danger'
  end;
begin
  select coalesce(array_agg(l.user_id), '{}') into recipients
  from public.live_positions l
  where l.user_id <> new.created_by
    and l.updated_at > now() - interval '15 minutes'
    and abs(l.latitude - new.latitude) < 0.03
    and abs(l.longitude - new.longitude) < 0.045
    and 2 * 6371000 * asin(sqrt(
          power(sin(radians(new.latitude - l.latitude) / 2), 2) +
          cos(radians(l.latitude)) * cos(radians(new.latitude)) * power(sin(radians(new.longitude - l.longitude) / 2), 2)
        )) < 3000
    and not public.is_blocked_between(l.user_id, new.created_by);
  perform public.send_push(recipients, 'dangers', label || ' signalé près de toi', 'Prudence : à moins de 3 km de ta position.',
    jsonb_build_object('url', '/', 'reportId', new.id));
  return null;
end;
$$;

create trigger road_reports_notify
  after insert on public.road_reports
  for each row execute function public.road_reports_notify();

-- ---------- Contacts d'urgence (membres de l'app, uniquement des amis) ----------
create table public.emergency_contacts (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  contact_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, contact_id),
  check (user_id <> contact_id)
);

create index emergency_contacts_contact_idx on public.emergency_contacts (contact_id);

alter table public.emergency_contacts enable row level security;

create policy "emergency_contacts: lecture des miens"
  on public.emergency_contacts for select to authenticated
  using (user_id = (select auth.uid()));

create policy "emergency_contacts: ajout"
  on public.emergency_contacts for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "emergency_contacts: retrait"
  on public.emergency_contacts for delete to authenticated
  using (user_id = (select auth.uid()));

-- Seulement un ami, 10 contacts max
create or replace function public.emergency_contacts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.are_friends(new.user_id, new.contact_id) then
    raise exception 'Seuls tes amis peuvent être contacts d''urgence' using errcode = 'P0001';
  end if;
  if (select count(*) from public.emergency_contacts c where c.user_id = new.user_id) >= 10 then
    raise exception '10 contacts d''urgence maximum' using errcode = 'P0001';
  end if;
  new.created_at = now();
  return new;
end;
$$;

create trigger emergency_contacts_before_insert
  before insert on public.emergency_contacts
  for each row execute function public.emergency_contacts_before_insert();

-- Qui m'a choisi comme contact d'urgence ? (pour le savoir et pouvoir refuser)
create or replace function public.my_emergency_contact_of()
returns table (user_id uuid, username text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.avatar_path
  from public.emergency_contacts c join public.profiles p on p.id = c.user_id
  where c.contact_id = auth.uid();
$$;

-- Ne plus être contact d'urgence de quelqu'un
create or replace function public.leave_emergency_contact(owner uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.emergency_contacts where user_id = owner and contact_id = auth.uid();
$$;

revoke execute on function public.my_emergency_contact_of() from public, anon;
revoke execute on function public.leave_emergency_contact(uuid) from public, anon;
grant execute on function public.my_emergency_contact_of() to authenticated;
grant execute on function public.leave_emergency_contact(uuid) to authenticated;

-- ---------- SOS ----------
create table public.sos_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('manual', 'fall', 'homecoming')),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index sos_events_user_idx on public.sos_events (user_id, created_at desc);

alter table public.sos_events enable row level security;

-- Lisible par l'auteur et par ses contacts d'urgence ; écriture uniquement par les fonctions
create policy "sos_events: auteur et contacts"
  on public.sos_events for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.emergency_contacts c
      where c.user_id = sos_events.user_id and c.contact_id = (select auth.uid())
    )
  );

-- Conversation privée entre deux membres, créée au besoin (usage interne, sans session)
create or replace function public.direct_conversation_between(a uuid, b uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid;
begin
  select c.id into conv
  from public.conversations c
  join public.conversation_members x on x.conversation_id = c.id and x.user_id = a
  join public.conversation_members y on y.conversation_id = c.id and y.user_id = b
  where c.kind = 'direct'
  limit 1;
  if conv is null then
    insert into public.conversations (kind) values ('direct') returning id into conv;
    insert into public.conversation_members (conversation_id, user_id) values (conv, a), (conv, b);
  end if;
  return conv;
end;
$$;

revoke execute on function public.direct_conversation_between(uuid, uuid) from public, anon, authenticated;

-- Usage interne : enregistre le SOS, écrit à chaque contact d'urgence et le notifie
create or replace function public.raise_sos(owner uuid, sos_kind text, lat double precision, lng double precision)
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
begin
  insert into public.sos_events (user_id, kind, latitude, longitude)
  values (owner, sos_kind, lat, lng) returning id into sos;

  -- Message dans la conversation privée (pas de 2e notification « message »)
  perform set_config('passeryder.sos_message', '1', true);
  for contact in
    select c.contact_id from public.emergency_contacts c
    where c.user_id = owner and not public.is_blocked_between(owner, c.contact_id)
  loop
    recipients := recipients || contact;
    insert into public.messages (conversation_id, sender_id, body)
    values (public.direct_conversation_between(owner, contact), owner, '🆘 SOS — ' || what || '. ' || place);
  end loop;
  perform set_config('passeryder.sos_message', '0', true);

  perform public.send_push(recipients, 'sos', '🆘 SOS de ' || who, what || '. Touche pour voir sa position.',
    jsonb_build_object('url', '/sos/' || sos));
  return sos;
end;
$$;

revoke execute on function public.raise_sos(uuid, text, double precision, double precision) from public, anon, authenticated;

-- SOS lancé depuis l'app (bouton SOS ou chute sans réponse). 5 par 10 minutes au plus.
create or replace function public.trigger_sos(sos_kind text, lat double precision, lng double precision)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or sos_kind not in ('manual', 'fall') then
    raise exception 'SOS impossible' using errcode = 'P0001';
  end if;
  if (select count(*) from public.sos_events s where s.user_id = auth.uid() and s.created_at > now() - interval '10 minutes') >= 5 then
    raise exception 'Trop d''alertes d''un coup : réessaie dans quelques minutes' using errcode = 'P0001';
  end if;
  return public.raise_sos(auth.uid(), sos_kind, lat, lng);
end;
$$;

-- « Je vais bien » après un SOS : les contacts sont prévenus
create or replace function public.resolve_sos(sos uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipients uuid[];
  contact uuid;
begin
  update public.sos_events set resolved_at = now()
  where id = sos and user_id = auth.uid() and resolved_at is null;
  if not found then
    return;
  end if;
  select coalesce(array_agg(c.contact_id), '{}') into recipients
  from public.emergency_contacts c
  where c.user_id = auth.uid() and not public.is_blocked_between(auth.uid(), c.contact_id);
  perform set_config('passeryder.sos_message', '1', true);
  foreach contact in array recipients loop
    insert into public.messages (conversation_id, sender_id, body)
    values (public.direct_conversation_between(auth.uid(), contact), auth.uid(), '✅ Fausse alerte : tout va bien.');
  end loop;
  perform set_config('passeryder.sos_message', '0', true);
  perform public.send_push(recipients, 'sos', '✅ ' || public.username_of(auth.uid()) || ' va bien',
    'L''alerte SOS est levée.', jsonb_build_object('url', '/sos/' || sos));
end;
$$;

revoke execute on function public.trigger_sos(text, double precision, double precision) from public, anon;
revoke execute on function public.resolve_sos(uuid) from public, anon;
grant execute on function public.trigger_sos(text, double precision, double precision) to authenticated;
grant execute on function public.resolve_sos(uuid) to authenticated;

-- ---------- Mode « Je rentre » ----------
create table public.homecomings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  destination_label text not null check (char_length(destination_label) between 1 and 200),
  dest_latitude double precision not null check (dest_latitude between -90 and 90),
  dest_longitude double precision not null check (dest_longitude between -180 and 180),
  deadline timestamptz not null,
  -- Dernière position envoyée par l'app (app ouverte)
  last_latitude double precision check (last_latitude between -90 and 90),
  last_longitude double precision check (last_longitude between -180 and 180),
  last_at timestamptz,
  status text not null default 'active' check (status in ('active', 'arrived', 'cancelled', 'alerted')),
  sos_id uuid references public.sos_events (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Un seul « Je rentre » actif à la fois
create unique index homecomings_one_active on public.homecomings (user_id) where status = 'active';
create index homecomings_deadline_idx on public.homecomings (deadline) where status = 'active';

alter table public.homecomings enable row level security;

create policy "homecomings: lecture des miens"
  on public.homecomings for select to authenticated
  using (user_id = (select auth.uid()));

create policy "homecomings: création"
  on public.homecomings for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "homecomings: mise à jour du mien"
  on public.homecomings for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.homecomings from anon, authenticated;
grant update (deadline, last_latitude, last_longitude, status) on public.homecomings to authenticated;

-- Heure limite entre maintenant et +24 h ; un « Je rentre » terminé ne reprend pas ;
-- seul le serveur passe en « alerted »
create or replace function public.homecomings_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.status = 'active';
    new.created_at = now();
    new.sos_id = null;
  elsif old.status <> 'active' then
    raise exception 'Ce « Je rentre » est terminé' using errcode = 'P0001';
  end if;
  if new.status = 'alerted' and current_user in ('authenticated', 'anon') then
    raise exception 'Statut réservé au serveur' using errcode = 'P0001';
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or new.deadline is distinct from old.deadline)
     and (new.deadline < now() + interval '1 minute' or new.deadline > now() + interval '24 hours') then
    raise exception 'Heure d''arrivée entre maintenant et dans 24 h' using errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' or new.last_latitude is distinct from old.last_latitude or new.last_longitude is distinct from old.last_longitude then
    new.last_at = case when new.last_latitude is null then null else now() end;
  end if;
  return new;
end;
$$;

create trigger homecomings_before_write
  before insert or update on public.homecomings
  for each row execute function public.homecomings_before_write();

-- Tâche planifiée : rappel 10 min avant l'heure, puis alerte aux contacts si rien n'a bougé
create or replace function public.check_homecomings()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h record;
  sos uuid;
begin
  for h in
    select * from public.homecomings
    where status = 'active' and deadline between now() and now() + interval '10 minutes'
  loop
    insert into public.push_log (key) values ('homecoming-soon:' || h.id || ':' || h.deadline) on conflict do nothing;
    if found then
      perform public.send_push(array[h.user_id], 'sos', 'Bientôt l''heure limite',
        'Tu n''es pas encore arrivé(e) à ' || h.destination_label || '. Prolonge si besoin, sinon tes contacts seront prévenus à ' ||
          to_char(h.deadline at time zone 'Europe/Paris', 'HH24"h"MI') || '.',
        jsonb_build_object('url', '/homecoming'));
    end if;
  end loop;

  for h in
    select hc.*, l.latitude as live_lat, l.longitude as live_lng, l.updated_at as live_at
    from public.homecomings hc
    left join public.live_positions l on l.user_id = hc.user_id
    where hc.status = 'active' and hc.deadline < now()
  loop
    -- Dernière position connue : la plus récente des deux
    if h.last_latitude is not null and (h.live_at is null or h.last_at >= h.live_at) then
      sos := public.raise_sos(h.user_id, 'homecoming', h.last_latitude, h.last_longitude);
    else
      sos := public.raise_sos(h.user_id, 'homecoming', h.live_lat, h.live_lng);
    end if;
    update public.homecomings set status = 'alerted', sos_id = sos where id = h.id;
    perform public.send_push(array[h.user_id], 'sos', 'Alerte envoyée à tes contacts',
      'Tu n''es pas arrivé(e) à l''heure. Si tout va bien, ouvre l''app pour les rassurer.',
      jsonb_build_object('url', '/sos/' || sos));
  end loop;
end;
$$;

revoke execute on function public.check_homecomings() from public, anon, authenticated;

-- ---------- Tâches planifiées ----------
select cron.schedule('safety-homecomings', '* * * * *', $$ select public.check_homecomings(); $$);
select cron.schedule('push-ride-reminders', '*/5 * * * *', $$ select public.send_ride_reminders(); $$);
select cron.schedule(
  'safety-cleanup',
  '17 3 * * *',
  $$
  delete from public.push_log where created_at < now() - interval '7 days';
  delete from public.sos_events where created_at < now() - interval '30 days';
  delete from public.homecomings where status <> 'active' and created_at < now() - interval '7 days';
  $$
);
