-- Note 18 (suite) : la bienvenue arrive dans la même transaction que la création du membre de la
-- conversation (même now()) : elle comptait comme déjà lue. Le destinataire est marqué « lu
-- 1 s avant » pour qu'elle apparaisse non lue (pastille, gras). Appliquée avec : npx supabase db push

create or replace function public.send_welcome(p_user uuid, p_test boolean default false, p_body text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.welcome_settings;
  sender uuid := public.creator_user_id();
  pseudo text;
  conv uuid;
  msg uuid;
begin
  select * into s from public.welcome_settings where id;
  if s is null or sender is null or p_user is null or p_user = sender then
    return null;
  end if;
  if exists (select 1 from public.app_admins a where a.user_id = p_user) then
    return null;
  end if;
  if not exists (select 1 from public.profiles p where p.id = sender) then
    return null;
  end if;
  select p.username into pseudo from public.profiles p where p.id = p_user;
  if pseudo is null or public.is_blocked_between(sender, p_user) then
    return null;
  end if;

  if not p_test then
    if not s.enabled then
      return null;
    end if;
    -- Marqueur posé AVANT l'envoi : jamais deux bienvenues, même en cas d'appels simultanés
    insert into public.welcome_messages (user_id) values (p_user) on conflict do nothing;
    if not found then
      return null;
    end if;
  end if;

  select c.id into conv
  from public.conversations c
  join public.conversation_members a on a.conversation_id = c.id and a.user_id = sender
  join public.conversation_members b on b.conversation_id = c.id and b.user_id = p_user
  where c.kind = 'direct'
  limit 1;
  if conv is null then
    insert into public.conversations (kind) values ('direct') returning id into conv;
    -- Lu « juste avant » : la bienvenue (même instant que la création) compte comme non lue
    insert into public.conversation_members (conversation_id, user_id, last_read_at)
    values (conv, sender, now()), (conv, p_user, now() - interval '1 second');
  end if;

  -- Message normal (push + notification « message » par les triggers habituels)
  insert into public.messages (conversation_id, sender_id, body)
  values (conv, sender, left(replace(coalesce(nullif(trim(p_body), ''), s.body), '{pseudo}', pseudo), 2000))
  returning id into msg;
  -- Conversation existante (rattrapage) : non lue aussi
  update public.conversation_members set last_read_at = least(last_read_at, now() - interval '1 second')
  where conversation_id = conv and user_id = p_user;
  update public.conversation_reads set read_at = least(read_at, now() - interval '1 second')
  where conversation_id = conv and user_id = p_user;

  if not p_test then
    update public.welcome_messages set conversation_id = conv, message_id = msg where user_id = p_user;
  end if;
  return conv;
end;
$$;
