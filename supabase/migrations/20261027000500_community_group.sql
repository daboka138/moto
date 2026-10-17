-- =====================================================================
-- Groupes publics + groupe communauté officiel (note 19, point 9)
-- - conversations.is_public : groupe rejoignable sans invitation (join_public_group), sans limite
--   de 50 membres ; pas de push à chaque message (centre de notifications seulement, regroupé)
-- - is_official : le groupe « PasseRyder – On construit l'appli ensemble 🛠️ », créé ici au nom de
--   @admin (app_settings.creator_user_id), qui en est admin et ne peut pas le quitter
-- - pinned_message_id : message épinglé (règles), posé par un admin du groupe
-- - modération : un admin du groupe efface n'importe quel message (moderate_group_message) et
--   retire un membre (remove_group_member, existant) ; signalement : content_reports « message »
-- =====================================================================

alter table public.conversations
  add column if not exists is_public boolean not null default false,
  add column if not exists is_official boolean not null default false,
  add column if not exists pinned_message_id uuid references public.messages (id) on delete set null;

alter table public.conversations add constraint conversations_public_group_check
  check (not is_public or kind = 'group');

create unique index if not exists conversations_one_official on public.conversations ((true)) where is_official;

-- ---------- Rejoindre un groupe public ----------
create or replace function public.join_public_group(p_conv uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  c public.conversations;
begin
  if me is null then raise exception 'Connexion requise' using errcode = 'P0001'; end if;
  select * into c from public.conversations where id = p_conv;
  if c.id is null or c.kind <> 'group' or not c.is_public then
    raise exception 'Groupe introuvable' using errcode = 'P0001';
  end if;
  if c.created_by is not null and public.is_blocked_between(me, c.created_by) then
    raise exception 'Impossible de rejoindre ce groupe' using errcode = 'P0001';
  end if;
  insert into public.conversation_members (conversation_id, user_id) values (p_conv, me) on conflict do nothing;
  return p_conv;
end;
$$;

-- Carte « Rejoins le groupe de la commu » : groupe officiel, nombre de membres, suis-je dedans
create or replace function public.official_group()
returns table (id uuid, title text, members_count integer, joined boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.title,
    (select count(*) from public.conversation_members m where m.conversation_id = c.id)::integer,
    exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.user_id = (select auth.uid()))
  from public.conversations c
  where c.is_official
  limit 1;
$$;

-- ---------- Message épinglé ----------
create or replace function public.pin_group_message(p_conv uuid, p_message uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_group_admin(p_conv);
  if p_message is not null and not exists (
    select 1 from public.messages m where m.id = p_message and m.conversation_id = p_conv and m.deleted_at is null
  ) then
    raise exception 'Message introuvable' using errcode = 'P0001';
  end if;
  update public.conversations set pinned_message_id = p_message where id = p_conv;
end;
$$;

-- ---------- Modération : un admin du groupe efface un message ----------
create or replace function public.moderate_group_message(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  m public.messages;
begin
  select * into m from public.messages where id = p_id;
  if m.id is null or m.kind <> 'user' or m.deleted_at is not null then
    raise exception 'Message introuvable' using errcode = 'P0001';
  end if;
  perform public.assert_group_admin(m.conversation_id);
  update public.messages
  set body = null, image_path = null, audio_path = null, audio_duration_ms = null,
      trip_share_id = null, edited_at = null, deleted_at = now()
  where id = p_id;
  delete from public.message_reactions where message_id = p_id;
  update public.conversations set pinned_message_id = null where id = m.conversation_id and pinned_message_id = p_id;
end;
$$;

-- ---------- Groupes existants : pas de limite de 50 pour un groupe public ----------
create or replace function public.add_group_members(p_conv uuid, p_members uuid[])
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
  if not (select c.is_public from public.conversations c where c.id = p_conv)
     and (select count(*) from public.conversation_members m where m.conversation_id = p_conv) + cardinality(added) > 50 then
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

-- Le créateur ne quitte pas le groupe officiel (sinon l'admin passerait au plus ancien membre)
create or replace function public.leave_group(p_conv uuid)
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
  if exists (select 1 from public.conversations c where c.id = p_conv and c.is_official and c.created_by = me) then
    raise exception 'Le créateur reste dans le groupe officiel' using errcode = 'P0001';
  end if;
  delete from public.conversation_members where conversation_id = p_conv and user_id = me;
  if not found then return; end if;
  if not exists (select 1 from public.conversation_members m where m.conversation_id = p_conv) then
    delete from public.conversations where id = p_conv;
    return;
  end if;
  -- Groupe public : pas de message système à chaque départ
  if not (select c.is_public from public.conversations c where c.id = p_conv) then
    perform public.group_system_message(p_conv, me, public.username_of(me) || ' a quitté le groupe');
  end if;
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

-- Push : rien pour les groupes publics (trop de messages), le centre de notifications suffit
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
  select c.kind, c.is_public, public.conversation_title(c.id) as title into conv
  from public.conversations c where c.id = new.conversation_id;
  if conv.is_public then
    return null;
  end if;

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

revoke all on function public.join_public_group(uuid) from public, anon;
revoke all on function public.official_group() from public, anon;
revoke all on function public.pin_group_message(uuid, uuid) from public, anon;
revoke all on function public.moderate_group_message(uuid) from public, anon;
grant execute on function public.join_public_group(uuid) to authenticated;
grant execute on function public.official_group() to authenticated;
grant execute on function public.pin_group_message(uuid, uuid) to authenticated;
grant execute on function public.moderate_group_message(uuid) to authenticated;

-- ---------- Le groupe officiel, au nom de @admin ----------
do $$
declare
  creator uuid := public.creator_user_id();
  conv uuid;
  rules uuid;
begin
  if creator is null or not exists (select 1 from public.profiles p where p.id = creator) then
    raise notice 'Pas de compte créateur (app_settings.creator_user_id) : groupe officiel non créé';
    return;
  end if;
  if exists (select 1 from public.conversations c where c.is_official) then
    return;
  end if;
  insert into public.conversations (kind, title, created_by, is_public, is_official)
  values ('group', 'PasseRyder – On construit l''appli ensemble 🛠️', creator, true, true)
  returning id into conv;
  insert into public.conversation_members (conversation_id, user_id, role) values (conv, creator, 'admin');
  insert into public.messages (conversation_id, sender_id, body)
  values (conv, creator,
    E'📌 Bienvenue dans le groupe de la commu PasseRyder !\n'
    || E'Ici, on construit l''appli ensemble : donne ton avis, propose des idées, signale des bugs 🛠️\n\n'
    || E'Règles simples :\n'
    || E'1. Respect : pas d''insultes ni d''attaques perso.\n'
    || E'2. Pas de pub ni de spam.\n'
    || E'3. Pas de police, de radars ni de contrôles (interdit en France).\n'
    || E'4. Un bug ? Dis sur quel écran, ce que tu faisais et ton téléphone.\n\n'
    || E'Un message gênant ? Appui long › Signaler. Merci et bonne route 🏍️')
  returning id into rules;
  update public.conversations set pinned_message_id = rules where id = conv;
end;
$$;
