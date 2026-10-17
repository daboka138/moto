-- =====================================================================
-- Messages vocaux (note 19, point 5) : messagerie privée, groupes, balades
-- Fichier audio dans le bucket PRIVÉ « chat » (<uid>/voice-….webm|m4a), lisible seulement par les
-- membres de la conversation (même règle que les photos, via la RLS de public.messages).
-- Le texte du message reste « 🎤 Message vocal (0:12) » : aperçus, push, notifications, et les
-- anciennes versions de l'app l'affichent tel quel.
-- =====================================================================

alter table public.messages
  add column if not exists audio_path text check (char_length(audio_path) <= 300),
  add column if not exists audio_duration_ms integer check (audio_duration_ms between 0 and 130000);

-- Types audio acceptés dans le bucket chat (web : webm/opus ou mp4/aac ; Android : m4a)
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg'
]
where id = 'chat';

-- Le fichier doit être dans le dossier de l'expéditeur, un vocal ne se combine ni avec une photo
-- ni avec un trajet partagé
create or replace function public.messages_check_audio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.audio_path is null then
    new.audio_duration_ms := null;
    return new;
  end if;
  if split_part(new.audio_path, '/', 1) <> new.sender_id::text or split_part(new.audio_path, '/', 2) not like 'voice-%' then
    raise exception 'Fichier audio invalide' using errcode = 'P0001';
  end if;
  if new.image_path is not null or new.trip_share_id is not null then
    raise exception 'Un message vocal est envoyé seul' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_check_audio on public.messages;
create trigger messages_check_audio
  before insert on public.messages
  for each row execute function public.messages_check_audio();

-- Lecture des fichiers du chat : photos ET vocaux des messages visibles
drop policy if exists "chat (fichiers) : lecture par les membres de la conversation" on storage.objects;
create policy "chat (fichiers) : lecture par les membres de la conversation"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.messages m where m.image_path = storage.objects.name)
      or exists (select 1 from public.messages m where m.audio_path = storage.objects.name)
    )
  );

-- Un vocal ne se modifie pas
create or replace function public.edit_message(p_id uuid, p_body text)
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
  if m.created_at < now() - interval '1 hour' then
    raise exception 'Un message se modifie pendant 1 heure après l''envoi' using errcode = 'P0001';
  end if;
  if m.trip_share_id is not null or m.audio_path is not null then
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

-- Supprimer pour tout le monde : le vocal aussi (chemin renvoyé à l'app, qui efface le fichier)
create or replace function public.delete_message_for_all(p_id uuid)
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
  set body = null, image_path = null, audio_path = null, audio_duration_ms = null,
      trip_share_id = null, edited_at = null, deleted_at = now()
  where id = p_id;
  delete from public.message_reactions where message_id = p_id;
  return coalesce(m.image_path, m.audio_path);
end;
$$;

-- Balades purgées : photos ET vocaux de leur conversation à effacer du bucket
create or replace function public.purge_finished_rides()
returns table (image_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  ids uuid[];
begin
  select coalesce(array_agg(r.id), '{}') into ids
  from public.group_rides r
  where r.meeting_at is not null
    and coalesce(
          r.ended_at,
          greatest(r.meeting_at, coalesce(r.started_at, r.meeting_at))
            + make_interval(secs => coalesce(r.duration_s, 0))
        ) < now() - interval '1 hour';

  if cardinality(ids) = 0 then
    return;
  end if;

  return query
    select coalesce(m.image_path, m.audio_path)
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    where c.ride_id = any (ids) and (m.image_path is not null or m.audio_path is not null);

  delete from public.group_rides r where r.id = any (ids);
end;
$$;

revoke execute on function public.purge_finished_rides() from public, anon, authenticated;
grant execute on function public.purge_finished_rides() to service_role;
