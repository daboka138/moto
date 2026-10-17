-- =====================================================================
-- Note 17 :
--   A) app_settings.google_review ('on' / 'off') : bandeau « validation Google en cours » sur
--      passeryder.fr/telecharger, /i et /c (Console › Fonctions › Distribution)
--   B) Modifier un message : 1 h après l'envoi (au lieu de 15 min)
--   C) Répondre à un message : messages.reply_to_id (même conversation, vérifié côté serveur)
--   D) Fonds d'écran des conversations, PERSONNELS : chat_wallpapers (une ligne par conversation,
--      ou conversation_id null = toutes mes conversations), lisibles par leur seul propriétaire.
--      Photos dans le bucket PRIVÉ `wallpapers` (dossier <user_id>/, propriétaire seul).
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- ---------- A) Validation Google ----------
alter table public.app_settings
  add constraint app_settings_google_review_check
  check (key <> 'google_review' or value in ('on', 'off'));

insert into public.app_settings (key, value) values ('google_review', 'on')
on conflict (key) do nothing;

-- ---------- B) Modification pendant 1 h ----------
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

-- ---------- C) Répondre ----------
alter table public.messages
  add column reply_to_id uuid references public.messages (id) on delete set null;

create function public.messages_check_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reply_to_id is not null and not exists (
    select 1 from public.messages r where r.id = new.reply_to_id and r.conversation_id = new.conversation_id
  ) then
    raise exception 'Réponse à un message d''une autre conversation' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger messages_check_reply
  before insert on public.messages
  for each row execute function public.messages_check_reply();

-- ---------- D) Fonds d'écran ----------
create table public.chat_wallpapers (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- null : toutes mes conversations (celles sans fond à elles)
  conversation_id uuid references public.conversations (id) on delete cascade,
  kind text not null check (kind in ('preset', 'color', 'photo')),
  value text not null check (char_length(value) between 1 and 200),
  -- Assombrissement en % (0 = image telle quelle)
  dim smallint not null default 0 check (dim between 0 and 85),
  updated_at timestamptz not null default now(),
  constraint chat_wallpapers_unique unique nulls not distinct (user_id, conversation_id),
  constraint chat_wallpapers_value_format check (
    (kind = 'preset' and value ~ '^[a-z0-9-]{1,40}$')
    or (kind = 'color' and value ~ '^#[0-9a-fA-F]{6}$')
    or (kind = 'photo' and value ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$' and split_part(value, '/', 1) = user_id::text)
  )
);

alter table public.chat_wallpapers enable row level security;

create policy "chat_wallpapers: lecture des miens"
  on public.chat_wallpapers for select to authenticated
  using (user_id = (select auth.uid()));

create policy "chat_wallpapers: suppression des miens"
  on public.chat_wallpapers for delete to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update on public.chat_wallpapers from anon, authenticated;

-- Choisir un fond : une conversation (dont je suis membre) ou toutes (p_all) ; p_kind null = réinitialiser
create function public.set_chat_wallpaper(p_conversation uuid, p_kind text, p_value text, p_dim int, p_all boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if not p_all and (p_conversation is null or not public.is_conversation_member(p_conversation)) then
    raise exception 'Conversation introuvable' using errcode = 'P0001';
  end if;
  if p_all then
    -- Toutes mes conversations : un seul fond commun, les fonds par conversation sont retirés
    delete from public.chat_wallpapers where user_id = me;
    if p_kind is not null then
      insert into public.chat_wallpapers (user_id, conversation_id, kind, value, dim)
      values (me, null, p_kind, p_value, coalesce(p_dim, 0));
    end if;
  elsif p_kind is null then
    delete from public.chat_wallpapers where user_id = me and conversation_id = p_conversation;
  else
    insert into public.chat_wallpapers (user_id, conversation_id, kind, value, dim)
    values (me, p_conversation, p_kind, p_value, coalesce(p_dim, 0))
    on conflict (user_id, conversation_id)
    do update set kind = excluded.kind, value = excluded.value, dim = excluded.dim, updated_at = now();
  end if;
end;
$$;

revoke all on function public.set_chat_wallpaper(uuid, text, text, int, boolean) from public;
grant execute on function public.set_chat_wallpaper(uuid, text, text, int, boolean) to authenticated;

-- Bucket privé : chacun ne lit / n'écrit que son dossier
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wallpapers', 'wallpapers', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "wallpapers (fichiers) : lecture des miens"
  on storage.objects for select to authenticated
  using (bucket_id = 'wallpapers' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "wallpapers (fichiers) : envoi dans son dossier"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'wallpapers' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "wallpapers (fichiers) : suppression des miens"
  on storage.objects for delete to authenticated
  using (bucket_id = 'wallpapers' and (storage.foldername(name))[1] = (select auth.uid())::text);
