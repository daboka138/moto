-- =====================================================================
-- Messagerie v2 : accusés de lecture (désactivables), « reçu », réactions, modifier / supprimer
-- un message, conversations de groupe (admins, messages système), sourdine.
-- Compatible avec l'app déjà installée (anciennes requêtes inchangées).
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- ---------- A) Accusés de lecture ----------
-- Désactivés : je ne montre plus quand j'ai lu (last_read_at visible n'avance plus) et je ne vois
-- plus ceux des autres (my_conversations renvoie null ; l'app masque aussi) — comme WhatsApp.
alter table public.profile_private add column read_receipts boolean not null default true;

create function public.read_receipts_enabled(u uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.read_receipts from public.profile_private p where p.user_id = u), true);
$$;

-- Vraie position de lecture (compteurs de non-lus), lisible par moi seul. conversation_members.last_read_at
-- devient la date de lecture MONTRÉE aux autres (figée si mes accusés de lecture sont coupés).
create table public.conversation_reads (
  conversation_id uuid not null,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  -- Sourdine (privée : les autres membres ne savent pas qu'on les a mis en sourdine)
  muted_until timestamptz,
  primary key (conversation_id, user_id),
  foreign key (conversation_id, user_id) references public.conversation_members (conversation_id, user_id) on delete cascade
);

alter table public.conversation_reads enable row level security;

create policy "conversation_reads: lecture de la mienne"
  on public.conversation_reads for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.conversation_reads from anon, authenticated;

insert into public.conversation_reads (conversation_id, user_id, read_at)
select conversation_id, user_id, last_read_at from public.conversation_members;

create function public.conversation_members_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.conversation_reads (conversation_id, user_id, read_at)
  values (new.conversation_id, new.user_id, new.last_read_at)
  on conflict do nothing;
  return null;
end;
$$;

create trigger conversation_members_after_insert
  after insert on public.conversation_members
  for each row execute function public.conversation_members_after_insert();

-- Lecture (app récente ou ancienne) : position privée toujours à jour ; date visible seulement
-- si mes accusés de lecture sont actifs
create function public.conversation_members_before_read()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_read_at is distinct from old.last_read_at then
    insert into public.conversation_reads (conversation_id, user_id, read_at)
    values (new.conversation_id, new.user_id, new.last_read_at)
    on conflict (conversation_id, user_id) do update set read_at = greatest(public.conversation_reads.read_at, excluded.read_at);
    if not public.read_receipts_enabled(new.user_id) then
      new.last_read_at := old.last_read_at;
    end if;
  end if;
  return new;
end;
$$;

create trigger conversation_members_before_read
  before update of last_read_at on public.conversation_members
  for each row execute function public.conversation_members_before_read();

-- ---------- B) Membres : rôle (groupes), « reçu » ----------
alter table public.conversation_members
  add column role text not null default 'member' check (role in ('member', 'admin')),
  add column delivered_at timestamptz;

-- Chacun ne modifie que sa lecture et son « reçu » (jamais son rôle)
grant update (delivered_at) on public.conversation_members to authenticated;

-- ---------- C) Conversations de groupe ----------
alter table public.conversations drop constraint conversations_kind_check;
alter table public.conversations
  add constraint conversations_kind_check check (kind in ('direct', 'ride', 'group')),
  add column title text check (char_length(title) between 1 and 60),
  add column photo_path text check (char_length(photo_path) <= 300),
  add column created_by uuid references public.profiles (id) on delete set null,
  add constraint conversations_group_title_check check (kind <> 'group' or title is not null);

-- ---------- D) Messages : système, modifié, supprimé ----------
alter table public.messages
  add column kind text not null default 'user' check (kind in ('user', 'system')),
  add column edited_at timestamptz,
  add column deleted_at timestamptz;

alter table public.messages drop constraint messages_check;
alter table public.messages add constraint messages_check check (
  kind = 'system' or deleted_at is not null or trip_share_id is not null
  or coalesce(char_length(trim(body)), 0) > 0 or image_path is not null
);

-- « Supprimer pour moi »
create table public.message_hidden (
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_id uuid not null references public.messages (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

alter table public.message_hidden enable row level security;

create policy "message_hidden: les miens"
  on public.message_hidden for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.message_hidden from anon, authenticated;

drop policy "messages: lecture par les membres" on public.messages;
create policy "messages: lecture par les membres"
  on public.messages for select to authenticated
  using (
    public.is_conversation_member(conversation_id)
    and not exists (select 1 from public.message_hidden h where h.message_id = id and h.user_id = (select auth.uid()))
  );

drop policy "messages: envoi" on public.messages;
create policy "messages: envoi"
  on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid()) and kind = 'user' and edited_at is null and deleted_at is null
    and public.can_post_message(conversation_id)
  );

-- Plus de suppression brute : « supprimer pour tout le monde » passe par delete_message_for_all
drop policy "messages: suppression des miens" on public.messages;

-- Fichiers du chat : chacun peut effacer les siens (suppression réelle d'une photo envoyée)
create policy "chat (fichiers) : suppression des miens"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- E) Réactions ----------
create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  -- null : réaction retirée (ligne gardée : le temps réel n'envoie que des mises à jour filtrées par RLS)
  emoji text check (emoji in ('❤️', '😂', '😮', '😢', '👍', '🔥', '🏍️')),
  updated_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create index message_reactions_conversation_idx on public.message_reactions (conversation_id);

alter table public.message_reactions enable row level security;

create policy "message_reactions: lecture par les membres"
  on public.message_reactions for select to authenticated
  using (public.is_conversation_member(conversation_id));

revoke insert, update, delete on public.message_reactions from anon, authenticated;

alter publication supabase_realtime add table public.message_reactions;

-- ---------- F) Notifications : nouveaux types ----------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'like', 'comment', 'friend_request', 'friend_accepted', 'ride_invite', 'event_invite', 'event_response',
  'event_reminder', 'message', 'place_new', 'place_review', 'convoy', 'regroup', 'sos',
  'referral', 'club_request', 'club_accepted', 'reaction', 'group_added'
));

-- ---------- G) Fonctions ----------

-- Membre en sourdine (pas de push ni de notification pour cette conversation)
create function public.is_muted(conv uuid, u uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select r.muted_until > now() from public.conversation_reads r
                   where r.conversation_id = conv and r.user_id = u), false);
$$;

-- Nom affiché d'une conversation pour les notifications (groupe / balade), null en privé
create function public.conversation_title(conv uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case c.kind when 'group' then c.title when 'ride' then coalesce(r.title, 'Balade') end
  from public.conversations c left join public.group_rides r on r.id = c.ride_id
  where c.id = conv;
$$;

-- Message système d'un groupe (« X a ajouté Y »)
create function public.group_system_message(conv uuid, actor uuid, body text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.messages (conversation_id, sender_id, body, kind)
  values (conv, actor, left(body, 2000), 'system');
$$;

-- Push et notifications : rien pour les messages système, rien pour les membres en sourdine,
-- titre = nom du groupe (ou de la balade)
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
  -- Messages SOS : notifiés par le SOS lui-même ; messages système : pas de push
  if current_setting('passeryder.sos_message', true) = '1' or new.kind = 'system' then
    return null;
  end if;
  select c.kind, public.conversation_title(c.id) as title into conv
  from public.conversations c where c.id = new.conversation_id;

  select coalesce(array_agg(m.user_id), '{}') into recipients
  from public.conversation_members m
  where m.conversation_id = new.conversation_id
    and m.user_id <> new.sender_id
    and not public.is_blocked_between(m.user_id, new.sender_id)
    and not public.is_muted(new.conversation_id, m.user_id);

  preview := case
    when new.trip_share_id is not null then '📍 Trajet partagé en direct'
    when new.body is not null then new.body
    else '📷 Photo'
  end;
  perform public.send_push(
    recipients,
    'messages',
    case when conv.kind = 'direct' then sender else conv.title end,
    case when conv.kind = 'direct' then preview else sender || ' : ' || preview end,
    jsonb_build_object('url', '/chat/' || new.conversation_id, 'conversationId', new.conversation_id)
  );
  return null;
end;
$$;

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
  select kind, public.conversation_title(id) as title into conv from public.conversations where id = new.conversation_id;
  -- Messages de SOS : déjà une notification « sos » ; balades : pas dans le centre ; système : non
  if conv.kind = 'ride' or new.kind = 'system' or current_setting('passeryder.sos_message', true) = '1' then
    return new;
  end if;
  for member in
    select m.user_id from public.conversation_members m
    where m.conversation_id = new.conversation_id and m.user_id <> new.sender_id
      and not public.is_muted(new.conversation_id, m.user_id)
  loop
    perform public.notify(member, 'message', new.sender_id, 'conversation', new.conversation_id,
      case when conv.kind = 'group' then conv.title || ' · ' else '' end
        || public.username_of(new.sender_id) || ' : ' || coalesce(left(new.body, 120), '📷 Photo'),
      '/chat/' || new.conversation_id);
  end loop;
  return new;
end;
$$;

-- Modifier son message (15 min après l'envoi)
create function public.edit_message(p_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if m.id is null or m.sender_id <> (select auth.uid()) or m.kind <> 'user' or m.deleted_at is not null then
    raise exception 'Tu ne peux pas modifier ce message' using errcode = 'P0001';
  end if;
  if m.created_at < now() - interval '15 minutes' then
    raise exception 'Un message se modifie pendant 15 minutes après l''envoi' using errcode = 'P0001';
  end if;
  if m.trip_share_id is not null then
    raise exception 'Ce message ne se modifie pas' using errcode = 'P0001';
  end if;
  if coalesce(char_length(trim(p_body)), 0) = 0 and m.image_path is null then
    raise exception 'Message vide' using errcode = 'P0001';
  end if;
  update public.messages
  set body = nullif(left(trim(p_body), 2000), ''), edited_at = now()
  where id = p_id;
end;
$$;

-- Supprimer pour tout le monde (1 h après l'envoi) : contenu effacé en base, « Message supprimé »
-- chez tous. Renvoie le chemin de la photo à effacer du stockage (fait par l'app, propriétaire).
create function public.delete_message_for_all(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if m.id is null or m.sender_id <> (select auth.uid()) or m.kind <> 'user' or m.deleted_at is not null then
    raise exception 'Tu ne peux pas supprimer ce message' using errcode = 'P0001';
  end if;
  if m.created_at < now() - interval '1 hour' then
    raise exception 'Un message se supprime pour tout le monde pendant 1 heure après l''envoi' using errcode = 'P0001';
  end if;
  update public.messages
  set body = null, image_path = null, trip_share_id = null, edited_at = null, deleted_at = now()
  where id = p_id;
  delete from public.message_reactions where message_id = p_id;
  return m.image_path;
end;
$$;

-- Supprimer pour moi
create function public.hide_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.messages m where m.id = p_id and public.is_conversation_member(m.conversation_id)) then
    raise exception 'Message introuvable' using errcode = 'P0001';
  end if;
  insert into public.message_hidden (user_id, message_id) values ((select auth.uid()), p_id) on conflict do nothing;
end;
$$;

-- Réagir : une réaction par personne et par message ; même emoji = retirer. Renvoie la réaction.
create function public.react_message(p_id uuid, p_emoji text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  m public.messages;
  current_emoji text;
  next_emoji text;
  title text;
begin
  select * into m from public.messages where id = p_id;
  if m.id is null or not public.is_conversation_member(m.conversation_id) or m.kind <> 'user' or m.deleted_at is not null then
    raise exception 'Réaction impossible' using errcode = 'P0001';
  end if;
  if p_emoji is not null and p_emoji not in ('❤️', '😂', '😮', '😢', '👍', '🔥', '🏍️') then
    raise exception 'Réaction inconnue' using errcode = 'P0001';
  end if;
  select r.emoji into current_emoji from public.message_reactions r where r.message_id = p_id and r.user_id = me;
  next_emoji := case when p_emoji is not distinct from current_emoji then null else p_emoji end;
  insert into public.message_reactions (message_id, user_id, conversation_id, emoji, updated_at)
  values (p_id, me, m.conversation_id, next_emoji, now())
  on conflict (message_id, user_id) do update set emoji = excluded.emoji, updated_at = now();

  -- Notification à l'auteur (pas pour soi, ni entre bloqués, ni en sourdine)
  if next_emoji is not null and m.sender_id <> me
     and not public.is_blocked_between(m.sender_id, me) and not public.is_muted(m.conversation_id, m.sender_id) then
    title := public.conversation_title(m.conversation_id);
    perform public.notify(m.sender_id, 'reaction', me, 'conversation', m.conversation_id,
      coalesce(title || ' · ', '') || public.username_of(me) || ' a réagi ' || next_emoji || ' : '
        || coalesce(left(m.body, 80), '📷 Photo'),
      '/chat/' || m.conversation_id);
    perform public.send_push(array[m.sender_id], 'messages', coalesce(title, public.username_of(me)),
      public.username_of(me) || ' a réagi ' || next_emoji || ' à ton message',
      jsonb_build_object('url', '/chat/' || m.conversation_id, 'conversationId', m.conversation_id));
  end if;
  return next_emoji;
end;
$$;

-- Sourdine d'une conversation : jusqu'à until (null = réactiver ; 'infinity' = toujours)
create function public.set_conversation_mute(p_conv uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_reads set muted_until = p_until
  where conversation_id = p_conv and user_id = (select auth.uid());
  if not found then raise exception 'Conversation introuvable' using errcode = 'P0001'; end if;
end;
$$;

-- ----- Groupes -----
create function public.assert_group_admin(conv uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.conversations c
    join public.conversation_members m on m.conversation_id = c.id
    where c.id = conv and c.kind = 'group' and m.user_id = (select auth.uid()) and m.role = 'admin'
  ) then
    raise exception 'Réservé aux admins du groupe' using errcode = 'P0001';
  end if;
end;
$$;

-- Membres ajoutables par moi : amis, sans blocage dans un sens ou dans l'autre
create function public.check_group_invitees(me uuid, users uuid[])
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  u uuid;
begin
  foreach u in array users loop
    if u = me then continue; end if;
    if public.is_blocked_between(me, u) then
      raise exception 'Impossible d''ajouter % à un groupe', public.username_of(u) using errcode = 'P0001';
    end if;
    if not public.are_friends(me, u) then
      raise exception 'Tu ne peux ajouter que tes amis (% n''en fait pas partie)', public.username_of(u) using errcode = 'P0001';
    end if;
  end loop;
end;
$$;

create function public.usernames_list(users uuid[])
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select string_agg('@' || p.username, ', ' order by p.username) from public.profiles p where p.id = any (users);
$$;

create function public.create_group(p_title text, p_photo_path text, p_members uuid[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  members uuid[];
  conv uuid;
  t text := trim(p_title);
begin
  if me is null then raise exception 'Connexion requise' using errcode = 'P0001'; end if;
  if coalesce(char_length(t), 0) not between 1 and 60 then
    raise exception 'Nom du groupe : 1 à 60 caractères' using errcode = 'P0001';
  end if;
  if p_photo_path is not null and split_part(p_photo_path, '/', 1) <> me::text then
    raise exception 'Photo hors de ton dossier' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(distinct u), '{}') into members from unnest(p_members) u where u is not null and u <> me;
  if cardinality(members) < 1 then raise exception 'Choisis au moins un ami' using errcode = 'P0001'; end if;
  if cardinality(members) > 49 then raise exception 'Un groupe compte 50 membres au plus' using errcode = 'P0001'; end if;
  perform public.check_group_invitees(me, members);

  insert into public.conversations (kind, title, photo_path, created_by) values ('group', t, p_photo_path, me)
  returning id into conv;
  insert into public.conversation_members (conversation_id, user_id, role) values (conv, me, 'admin');
  insert into public.conversation_members (conversation_id, user_id) select conv, u from unnest(members) u;
  perform public.group_system_message(conv, me, public.username_of(me) || ' a créé le groupe « ' || t || ' »');
  perform public.notify_many(members, 'group_added', me, 'conversation', conv,
    public.username_of(me) || ' t''a ajouté au groupe « ' || t || ' »', '/chat/' || conv);
  perform public.send_push(members, 'messages', t, public.username_of(me) || ' t''a ajouté au groupe',
    jsonb_build_object('url', '/chat/' || conv, 'conversationId', conv));
  return conv;
end;
$$;

create function public.add_group_members(p_conv uuid, p_members uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  added uuid[];
  t text;
begin
  perform public.assert_group_admin(p_conv);
  select coalesce(array_agg(distinct u), '{}') into added from unnest(p_members) u
  where u is not null and u <> me
    and not exists (select 1 from public.conversation_members m where m.conversation_id = p_conv and m.user_id = u);
  if cardinality(added) = 0 then return; end if;
  if (select count(*) from public.conversation_members m where m.conversation_id = p_conv) + cardinality(added) > 50 then
    raise exception 'Un groupe compte 50 membres au plus' using errcode = 'P0001';
  end if;
  perform public.check_group_invitees(me, added);
  insert into public.conversation_members (conversation_id, user_id) select p_conv, u from unnest(added) u;
  perform public.group_system_message(p_conv, me, public.username_of(me) || ' a ajouté ' || public.usernames_list(added));
  t := public.conversation_title(p_conv);
  perform public.notify_many(added, 'group_added', me, 'conversation', p_conv,
    public.username_of(me) || ' t''a ajouté au groupe « ' || t || ' »', '/chat/' || p_conv);
  perform public.send_push(added, 'messages', t, public.username_of(me) || ' t''a ajouté au groupe',
    jsonb_build_object('url', '/chat/' || p_conv, 'conversationId', p_conv));
end;
$$;

create function public.remove_group_member(p_conv uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  perform public.assert_group_admin(p_conv);
  if p_user = me then raise exception 'Pour partir, quitte le groupe' using errcode = 'P0001'; end if;
  delete from public.conversation_members where conversation_id = p_conv and user_id = p_user;
  if found then
    perform public.group_system_message(p_conv, me, public.username_of(me) || ' a retiré @' || public.username_of(p_user));
  end if;
end;
$$;

create function public.set_group_admin(p_conv uuid, p_user uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  perform public.assert_group_admin(p_conv);
  if p_user = me and not p_admin
     and (select count(*) from public.conversation_members m where m.conversation_id = p_conv and m.role = 'admin') <= 1 then
    raise exception 'Nomme un autre admin avant' using errcode = 'P0001';
  end if;
  update public.conversation_members set role = case when p_admin then 'admin' else 'member' end
  where conversation_id = p_conv and user_id = p_user and role <> case when p_admin then 'admin' else 'member' end;
  if found then
    perform public.group_system_message(p_conv, me,
      public.username_of(p_user) || case when p_admin then ' est maintenant admin' else ' n''est plus admin' end);
  end if;
end;
$$;

create function public.update_group(p_conv uuid, p_title text, p_photo_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  c public.conversations;
  t text := trim(p_title);
begin
  perform public.assert_group_admin(p_conv);
  select * into c from public.conversations where id = p_conv;
  if coalesce(char_length(t), 0) not between 1 and 60 then
    raise exception 'Nom du groupe : 1 à 60 caractères' using errcode = 'P0001';
  end if;
  if p_photo_path is not null and p_photo_path is distinct from c.photo_path and split_part(p_photo_path, '/', 1) <> me::text then
    raise exception 'Photo hors de ton dossier' using errcode = 'P0001';
  end if;
  update public.conversations set title = t, photo_path = p_photo_path where id = p_conv;
  if t is distinct from c.title then
    perform public.group_system_message(p_conv, me, public.username_of(me) || ' a renommé le groupe en « ' || t || ' »');
  end if;
  if p_photo_path is distinct from c.photo_path then
    perform public.group_system_message(p_conv, me, public.username_of(me) || ' a changé la photo du groupe');
  end if;
end;
$$;

create function public.leave_group(p_conv uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if not exists (select 1 from public.conversations c where c.id = p_conv and c.kind = 'group') then
    raise exception 'Ce n''est pas un groupe' using errcode = 'P0001';
  end if;
  delete from public.conversation_members where conversation_id = p_conv and user_id = me;
  if not found then return; end if;
  if not exists (select 1 from public.conversation_members m where m.conversation_id = p_conv) then
    delete from public.conversations where id = p_conv;
    return;
  end if;
  perform public.group_system_message(p_conv, me, public.username_of(me) || ' a quitté le groupe');
  -- Plus d'admin : le plus ancien membre le devient
  if not exists (select 1 from public.conversation_members m where m.conversation_id = p_conv and m.role = 'admin') then
    update public.conversation_members set role = 'admin'
    where (conversation_id, user_id) = (
      select m.conversation_id, m.user_id from public.conversation_members m
      where m.conversation_id = p_conv order by m.joined_at limit 1
    );
  end if;
end;
$$;

-- Liste des conversations : groupes (nom, photo, membres), sourdine, dernier message supprimé /
-- système ; date de lecture de l'autre seulement si mes accusés de lecture sont actifs
drop function public.my_conversations();
create function public.my_conversations()
returns table (
  id uuid, kind text, ride_id uuid, ride_title text,
  other_id uuid, other_username text, other_avatar_path text, other_last_read_at timestamptz, blocked boolean,
  last_body text, last_has_image boolean, last_sender_id uuid, last_at timestamptz, unread integer,
  title text, photo_path text, members_count integer, muted_until timestamptz, my_role text,
  last_kind text, last_deleted boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.kind, c.ride_id, r.title,
    o.user_id, op.username, op.avatar_path,
    case when public.read_receipts_enabled((select auth.uid())) then o.last_read_at end,
    coalesce(public.is_blocked_between(o.user_id, (select auth.uid())), false),
    lm.body, lm.image_path is not null, lm.sender_id, coalesce(lm.created_at, c.created_at),
    (select count(*) from public.messages x
       where x.conversation_id = c.id and x.sender_id <> (select auth.uid()) and x.kind = 'user'
         and x.created_at > coalesce(rd.read_at, me.last_read_at)
         and not exists (select 1 from public.message_hidden h where h.message_id = x.id and h.user_id = (select auth.uid())))::integer,
    c.title, c.photo_path,
    (select count(*) from public.conversation_members mm where mm.conversation_id = c.id)::integer,
    rd.muted_until, me.role,
    lm.kind, lm.deleted_at is not null
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join public.conversation_reads rd on rd.conversation_id = c.id and rd.user_id = me.user_id
  left join public.group_rides r on r.id = c.ride_id
  left join lateral (
    select m.user_id, m.last_read_at from public.conversation_members m
    where m.conversation_id = c.id and m.user_id <> (select auth.uid()) and c.kind = 'direct'
    limit 1
  ) o on true
  left join public.profiles op on op.id = o.user_id
  left join lateral (
    select x.body, x.image_path, x.sender_id, x.created_at, x.kind, x.deleted_at from public.messages x
    where x.conversation_id = c.id
      and not exists (select 1 from public.message_hidden h where h.message_id = x.id and h.user_id = (select auth.uid()))
    order by x.created_at desc limit 1
  ) lm on true
  where me.user_id = (select auth.uid())
    and (c.kind <> 'direct' or lm.created_at is not null or c.created_at > now() - interval '1 hour')
  order by coalesce(lm.created_at, c.created_at) desc;
$$;

-- Droits : fonctions internes non appelables directement
revoke all on function public.read_receipts_enabled(uuid) from public;
revoke all on function public.is_muted(uuid, uuid) from public;
revoke all on function public.conversation_title(uuid) from public;
revoke all on function public.group_system_message(uuid, uuid, text) from public;
revoke all on function public.assert_group_admin(uuid) from public;
revoke all on function public.check_group_invitees(uuid, uuid[]) from public;
revoke all on function public.usernames_list(uuid[]) from public;
revoke all on function public.conversation_members_after_insert() from public;
revoke all on function public.conversation_members_before_read() from public;

revoke all on function public.set_conversation_mute(uuid, timestamptz) from public;
grant execute on function public.set_conversation_mute(uuid, timestamptz) to authenticated;
revoke all on function public.edit_message(uuid, text) from public;
revoke all on function public.delete_message_for_all(uuid) from public;
revoke all on function public.hide_message(uuid) from public;
revoke all on function public.react_message(uuid, text) from public;
revoke all on function public.create_group(text, text, uuid[]) from public;
revoke all on function public.add_group_members(uuid, uuid[]) from public;
revoke all on function public.remove_group_member(uuid, uuid) from public;
revoke all on function public.set_group_admin(uuid, uuid, boolean) from public;
revoke all on function public.update_group(uuid, text, text) from public;
revoke all on function public.leave_group(uuid) from public;
revoke all on function public.my_conversations() from public;
grant execute on function public.edit_message(uuid, text) to authenticated;
grant execute on function public.delete_message_for_all(uuid) to authenticated;
grant execute on function public.hide_message(uuid) to authenticated;
grant execute on function public.react_message(uuid, text) to authenticated;
grant execute on function public.create_group(text, text, uuid[]) to authenticated;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.set_group_admin(uuid, uuid, boolean) to authenticated;
grant execute on function public.update_group(uuid, text, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
