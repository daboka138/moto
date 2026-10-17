-- =====================================================================
-- Note 18 : message de bienvenue automatique envoyé PAR le compte admin (créateur de l'appli)
--   - Envoyé côté serveur à la création du profil (= fin de l'inscription, app ET web), jamais
--     à la simple création du compte, jamais deux fois (welcome_messages = marqueur, 1 ligne
--     par membre), jamais au compte expéditeur ni à un admin.
--   - Message normal d'une conversation privée : push + notification « message » habituelles,
--     supprimable / blocable par le membre, sa réponse notifie l'admin comme d'habitude.
--   - app_settings.creator_user_id (public) = expéditeur ET badge « Créateur de PasseRyder ».
--   - welcome_settings (activé, texte avec {pseudo}, compte de test) : admin seulement (RLS).
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- ---------- Expéditeur = compte créateur ----------
insert into public.app_settings (key, value)
select 'creator_user_id', u.id::text from auth.users u where lower(u.email) = 'passeryder@gmail.com'
on conflict (key) do nothing;

create or replace function public.creator_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when s.value ~ '^[0-9a-f-]{36}$' then s.value::uuid end
  from public.app_settings s where s.key = 'creator_user_id';
$$;

-- ---------- Réglages (une seule ligne) ----------
create table public.welcome_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  -- Pseudo du compte qui reçoit « M'envoyer un test »
  test_username text check (test_username is null or char_length(test_username) <= 40),
  updated_at timestamptz not null default now()
);

alter table public.welcome_settings enable row level security;
revoke all on public.welcome_settings from anon, authenticated;
grant select, update on public.welcome_settings to authenticated;

create policy "welcome_settings: lecture par l'admin" on public.welcome_settings
  for select to authenticated using ((select public.is_admin()));
create policy "welcome_settings: modification par l'admin" on public.welcome_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

insert into public.welcome_settings (body) values (
$txt$Salut {pseudo}, bienvenue sur PasseRyder ! 🏍️

Moi c'est Dimitri, c'est moi qui ai créé l'appli. Merci de l'avoir téléchargée, ça me fait vraiment plaisir.

PasseRyder grandit petit à petit, et ce sont les premiers motards comme toi qui font vivre la commu. N'hésite pas à inviter tes potes (Profil › Inviter des potes), plus on est nombreux, plus c'est sympa sur la route 💪

Un bug, une idée, un truc pas clair ? Réponds-moi directement ici, je lis tous les messages. C'est grâce à vos retours que l'appli s'améliore.

Bonne route ! V ✌️$txt$);

-- ---------- Marqueur : une bienvenue par membre ----------
create table public.welcome_messages (
  user_id uuid primary key references auth.users (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  sent_at timestamptz not null default now()
);

alter table public.welcome_messages enable row level security;
revoke all on public.welcome_messages from anon, authenticated;

-- ---------- Envoi (interne : jamais appelable par l'app) ----------
-- p_test : envoi de test (ni réglage « activé », ni marqueur), p_body : texte à essayer.
-- Renvoie la conversation, ou null si rien n'est envoyé.
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
    insert into public.conversation_members (conversation_id, user_id) values (conv, sender), (conv, p_user);
  end if;

  -- Message normal (push + notification « message » par les triggers habituels)
  insert into public.messages (conversation_id, sender_id, body)
  values (conv, sender, left(replace(coalesce(nullif(trim(p_body), ''), s.body), '{pseudo}', pseudo), 2000))
  returning id into msg;

  if not p_test then
    update public.welcome_messages set conversation_id = conv, message_id = msg where user_id = p_user;
  end if;
  return conv;
end;
$$;

revoke all on function public.send_welcome(uuid, boolean, text) from public, anon, authenticated;

-- ---------- Fin de l'inscription (création du profil) ----------
create or replace function public.profiles_after_insert_welcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.send_welcome(new.id);
  exception when others then
    -- Jamais d'inscription bloquée par la bienvenue
    raise warning 'Bienvenue non envoyée à % : %', new.id, sqlerrm;
  end;
  return null;
end;
$$;

create trigger profiles_after_insert_welcome
  after insert on public.profiles
  for each row execute function public.profiles_after_insert_welcome();

-- ---------- Console (admin) ----------
create or replace function public.admin_welcome()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.welcome_settings;
  sender uuid := public.creator_user_id();
begin
  perform public.assert_admin();
  select * into s from public.welcome_settings where id;
  return jsonb_build_object(
    'enabled', s.enabled,
    'body', s.body,
    'test_username', s.test_username,
    'sender_username', (select p.username from public.profiles p where p.id = sender),
    'sent', (select count(*) from public.welcome_messages),
    'replied', (
      select count(*) from public.welcome_messages w
      where exists (
        select 1 from public.messages m
        where m.conversation_id = w.conversation_id and m.sender_id = w.user_id and m.created_at >= w.sent_at
      )
    ),
    'pending', (
      select count(*) from public.profiles p
      where p.id <> coalesce(sender, '00000000-0000-0000-0000-000000000000')
        and not exists (select 1 from public.welcome_messages w where w.user_id = p.id)
        and not exists (select 1 from public.app_admins a where a.user_id = p.id)
        and (sender is null or not public.is_blocked_between(sender, p.id))
    )
  );
end;
$$;

create or replace function public.admin_set_welcome(p_enabled boolean, p_body text, p_test_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if coalesce(char_length(trim(p_body)), 0) = 0 then
    raise exception 'Le message ne peut pas être vide' using errcode = 'P0001';
  end if;
  if char_length(p_body) > 2000 then
    raise exception 'Message trop long (2000 caractères max)' using errcode = 'P0001';
  end if;
  update public.welcome_settings
  set enabled = p_enabled,
      body = trim(p_body),
      test_username = nullif(trim(ltrim(coalesce(p_test_username, ''), '@')), ''),
      updated_at = now()
  where id;
end;
$$;

-- Test : au compte de test (jamais à l'expéditeur), texte en cours de saisie
create or replace function public.admin_welcome_test(p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
  conv uuid;
  wanted text;
begin
  perform public.assert_admin();
  select test_username into wanted from public.welcome_settings where id;
  if wanted is null then
    raise exception 'Indique d''abord le pseudo de ton compte de test' using errcode = 'P0001';
  end if;
  select p.id into target from public.profiles p where lower(p.username) = lower(wanted);
  if target is null then
    raise exception 'Aucun motard @% (compte de test)', wanted using errcode = 'P0001';
  end if;
  if target = public.creator_user_id() then
    raise exception 'Le compte de test doit être un autre compte que celui qui envoie' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.app_admins a where a.user_id = target) then
    raise exception 'Le compte de test ne doit pas être administrateur' using errcode = 'P0001';
  end if;
  conv := public.send_welcome(target, true, p_body);
  if conv is null then
    raise exception 'Envoi impossible (compte bloqué ?)' using errcode = 'P0001';
  end if;
  return conv;
end;
$$;

-- Inscrits existants sans bienvenue : envoi à tous (renvoie le nombre envoyé)
create or replace function public.admin_welcome_backfill()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  member uuid;
  sent integer := 0;
begin
  perform public.assert_admin();
  if not (select enabled from public.welcome_settings where id) then
    raise exception 'Active d''abord le message de bienvenue' using errcode = 'P0001';
  end if;
  for member in
    select p.id from public.profiles p
    where not exists (select 1 from public.welcome_messages w where w.user_id = p.id)
    order by p.created_at
  loop
    if public.send_welcome(member) is not null then
      sent := sent + 1;
    end if;
  end loop;
  return sent;
end;
$$;

revoke all on function public.creator_user_id() from public, anon;
grant execute on function public.creator_user_id() to authenticated;
revoke all on function public.admin_welcome() from public, anon;
revoke all on function public.admin_set_welcome(boolean, text, text) from public, anon;
revoke all on function public.admin_welcome_test(text) from public, anon;
revoke all on function public.admin_welcome_backfill() from public, anon;
grant execute on function public.admin_welcome() to authenticated;
grant execute on function public.admin_set_welcome(boolean, text, text) to authenticated;
grant execute on function public.admin_welcome_test(text) to authenticated;
grant execute on function public.admin_welcome_backfill() to authenticated;
