-- =====================================================================
-- Blocages, signalements, stories 24 h, messages privés et de balade.
-- Appliquée avec : npx supabase db push
-- (L'infrastructure propre à Supabase — bucket privé, temps réel, tâche
--  planifiée — est dans la migration suivante.)
-- =====================================================================

-- ---------- Blocages ----------
create table public.user_blocks (
  blocker_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.user_blocks enable row level security;

-- Je vois la liste des personnes que j'ai bloquées (pas celles qui m'ont bloqué)
create policy "user_blocks: lecture des miens"
  on public.user_blocks for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy "user_blocks: bloquer"
  on public.user_blocks for insert to authenticated
  with check (blocker_id = (select auth.uid()));

create policy "user_blocks: débloquer"
  on public.user_blocks for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- Usage interne : un blocage existe-t-il entre a et b (dans un sens ou dans l'autre) ?
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks x
    where (x.blocker_id = a and x.blocked_id = b) or (x.blocker_id = b and x.blocked_id = a)
  );
$$;

revoke execute on function public.is_blocked_between(uuid, uuid) from public, anon, authenticated;

-- Utilisable dans les policies : blocage entre moi et quelqu'un (ne renseigne sur personne d'autre)
create or replace function public.is_blocked_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_blocked_between((select auth.uid()), other);
$$;

revoke execute on function public.is_blocked_with(uuid) from public, anon;
grant execute on function public.is_blocked_with(uuid) to authenticated;

-- Bloquer quelqu'un supprime l'amitié et les demandes en cours
create or replace function public.user_blocks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.friendships f
  where (f.requester_id = new.blocker_id and f.addressee_id = new.blocked_id)
     or (f.requester_id = new.blocked_id and f.addressee_id = new.blocker_id);
  return null;
end;
$$;

create trigger user_blocks_after_insert
  after insert on public.user_blocks
  for each row execute function public.user_blocks_after_insert();

-- Plus de demande d'ami possible entre deux personnes bloquées
drop policy "friendships: envoi d'une demande" on public.friendships;
create policy "friendships: envoi d'une demande"
  on public.friendships for insert to authenticated
  with check (
    requester_id = (select auth.uid()) and status = 'pending' and accepted_at is null
    and not public.is_blocked_with(addressee_id)
  );

-- Position : un blocage masque toujours (même pendant une balade)
create or replace function public.can_view_location(target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  viewer uuid := auth.uid();
  privacy_mode text;
begin
  if viewer is null then
    return false;
  end if;
  if viewer = target then
    return true;
  end if;

  -- Blocage dans un sens ou dans l'autre : jamais visible
  if public.is_blocked_between(viewer, target) then
    return false;
  end if;

  -- Règle prioritaire : trajet de groupe en cours avec les deux participants
  if exists (
    select 1
    from public.group_ride_participants me
    join public.group_ride_participants them on them.ride_id = me.ride_id
    join public.group_rides r on r.id = me.ride_id
    where me.user_id = viewer and me.status = 'joined'
      and them.user_id = target and them.status = 'joined'
      and r.started_at is not null and r.started_at <= now()
      and r.ended_at is null
      and r.started_at > now() - interval '12 hours'
  ) then
    return true;
  end if;

  select p.mode into privacy_mode from public.location_privacy p where p.user_id = target;
  privacy_mode := coalesce(privacy_mode, 'friends');

  if privacy_mode = 'ghost' then
    return false;
  end if;

  if privacy_mode = 'selected' then
    return public.are_friends(target, viewer) and exists (
      select 1 from public.location_privacy_rules r
      where r.owner_id = target and r.friend_id = viewer and r.kind = 'allow'
    );
  end if;

  if exists (
    select 1 from public.location_privacy_rules r
    where r.owner_id = target and r.friend_id = viewer and r.kind = 'block'
  ) then
    return false;
  end if;

  if privacy_mode = 'everyone' then
    return true;
  end if;

  return public.are_friends(target, viewer);
end;
$$;

-- Recherche de motards : les personnes bloquées (dans un sens ou l'autre) n'apparaissent pas
create or replace function public.find_riders(
  p_lat double precision,
  p_lng double precision,
  p_max_km integer default null,
  p_categories text[] default null,
  p_styles text[] default null,
  p_paces text[] default null,
  p_min_license_years integer default null,
  p_availability text[] default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  username text,
  avatar_path text,
  city text,
  bio text,
  riding_styles text[],
  pace text,
  availability text[],
  license_year smallint,
  moto_brand text,
  moto_model text,
  moto_cc smallint,
  moto_category text,
  distance_km integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select
      (select auth.uid()) as uid,
      round((p_lat / 0.05)::numeric) * 0.05 as lat,
      round((p_lng / 0.05)::numeric) * 0.05 as lng
  ),
  candidates as (
    select
      p.id, p.username, p.avatar_path, p.city, p.bio, p.riding_styles, p.pace, p.availability, p.license_year,
      m.brand, m.model, m.displacement_cc, m.category,
      6371 * acos(least(1, greatest(-1,
        cos(radians(me.lat)) * cos(radians(d.area_lat)) * cos(radians(d.area_lng) - radians(me.lng))
        + sin(radians(me.lat)) * sin(radians(d.area_lat))
      ))) as dist
    from public.profiles p
    join public.rider_discovery d on d.user_id = p.id and d.discoverable and d.area_lat is not null
    cross join me
    left join lateral (
      select mm.brand, mm.model, mm.displacement_cc, mm.category
      from public.motorcycles mm
      where mm.owner_id = p.id
      order by mm.is_main desc, mm.created_at
      limit 1
    ) m on true
    where me.uid is not null
      and p.id <> me.uid
      and not public.is_blocked_between(p.id, me.uid)
      and coalesce((select lp.mode from public.location_privacy lp where lp.user_id = p.id), 'friends') <> 'ghost'
      and not exists (
        select 1 from public.location_privacy_rules r
        where r.owner_id = p.id and r.friend_id = me.uid and r.kind = 'block'
      )
  )
  select
    c.id, c.username, c.avatar_path, c.city, c.bio, c.riding_styles, c.pace, c.availability, c.license_year,
    c.brand, c.model, c.displacement_cc, c.category,
    greatest(1, round(c.dist))::integer
  from candidates c
  where (p_max_km is null or c.dist <= p_max_km)
    and (p_categories is null or c.category = any (p_categories))
    and (p_styles is null or c.riding_styles && p_styles)
    and (p_paces is null or c.pace = any (p_paces))
    and (p_min_license_years is null
         or (c.license_year is not null and extract(year from now())::integer - c.license_year >= p_min_license_years))
    and (p_availability is null or c.availability && p_availability)
  order by c.dist
  limit least(coalesce(p_limit, 50), 100);
$$;

-- ---------- Signalements de contenu (obligatoire pour les stores) ----------
create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('message', 'story', 'user')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'inappropriate', 'danger', 'other')),
  details text check (char_length(details) <= 500),
  created_at timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);

alter table public.content_reports enable row level security;

-- Chacun ne voit que ses propres signalements ; la modération se fait côté admin
create policy "content_reports: lecture des miens"
  on public.content_reports for select to authenticated
  using (reporter_id = (select auth.uid()));

create policy "content_reports: signaler"
  on public.content_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));

-- ---------- Stories 24 h ----------
create table public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  media_path text not null check (char_length(media_path) <= 300),
  media_type text not null check (media_type in ('image', 'video')),
  duration_s real check (duration_s > 0 and duration_s <= 30.5),
  caption text check (char_length(caption) <= 200),
  visibility text not null default 'friends' check (visibility in ('friends', 'everyone')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()
);

create index stories_active_idx on public.stories (expires_at, owner_id);

-- Heure et expiration fixées par le serveur ; vidéo de 30 s maximum
create or replace function public.stories_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.media_type = 'video' and new.duration_s is null then
    raise exception 'Durée de la vidéo manquante' using errcode = 'P0001';
  end if;
  if split_part(new.media_path, '/', 1) <> new.owner_id::text then
    raise exception 'Fichier hors de ton dossier' using errcode = 'P0001';
  end if;
  new.created_at = now();
  new.expires_at = now() + interval '24 hours';
  return new;
end;
$$;

create trigger stories_before_insert
  before insert on public.stories
  for each row execute function public.stories_before_insert();

-- Qui peut voir une story (hors expiration, vérifiée dans la policy)
create or replace function public.can_see_story(owner uuid, story_visibility text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    owner = (select auth.uid())
    or (
      (select auth.uid()) is not null
      and not public.is_blocked_between(owner, (select auth.uid()))
      and (story_visibility = 'everyone' or public.are_friends(owner, (select auth.uid())))
    );
$$;

revoke execute on function public.can_see_story(uuid, text) from public, anon;
grant execute on function public.can_see_story(uuid, text) to authenticated;

alter table public.stories enable row level security;

-- Les stories expirées ne sont plus jamais renvoyées
create policy "stories: lecture des stories actives autorisées"
  on public.stories for select to authenticated
  using (expires_at > now() and public.can_see_story(owner_id, visibility));

create policy "stories: publication"
  on public.stories for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "stories: suppression de la sienne"
  on public.stories for delete to authenticated
  using (owner_id = (select auth.uid()));

revoke update on public.stories from anon, authenticated;

-- Vues
create table public.story_views (
  story_id uuid not null references public.stories (id) on delete cascade,
  viewer_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

alter table public.story_views enable row level security;

-- Je vois mes propres vues, et qui a vu MES stories
create policy "story_views: lecture"
  on public.story_views for select to authenticated
  using (
    viewer_id = (select auth.uid())
    or exists (select 1 from public.stories s where s.id = story_id and s.owner_id = (select auth.uid()))
  );

-- On ne marque « vue » qu'une story qu'on a le droit de voir (la RLS de stories s'applique)
create policy "story_views: marquer vue"
  on public.story_views for insert to authenticated
  with check (
    viewer_id = (select auth.uid())
    and exists (select 1 from public.stories s where s.id = story_id)
  );

-- ---------- Messages ----------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'ride')),
  ride_id uuid unique references public.group_rides (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  check ((kind = 'ride') = (ride_id is not null))
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text check (char_length(body) <= 2000),
  image_path text check (char_length(image_path) <= 300),
  created_at timestamptz not null default now(),
  check (coalesce(char_length(trim(body)), 0) > 0 or image_path is not null)
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

-- Usage interne : suis-je membre de cette conversation ?
create or replace function public.is_conversation_member(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversation_members m
    where m.conversation_id = conv and m.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- Puis-je écrire ici ? Membre, et en privé : pas de blocage entre nous
create or replace function public.can_post_message(conv uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_conversation_member(conv)
    and not exists (
      select 1
      from public.conversations c
      join public.conversation_members other on other.conversation_id = c.id and other.user_id <> (select auth.uid())
      where c.id = conv and c.kind = 'direct' and public.is_blocked_between(other.user_id, (select auth.uid()))
    );
$$;

revoke execute on function public.can_post_message(uuid) from public, anon;
grant execute on function public.can_post_message(uuid) to authenticated;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "conversations: lecture par les membres"
  on public.conversations for select to authenticated
  using (public.is_conversation_member(id));

create policy "conversation_members: lecture par les membres"
  on public.conversation_members for select to authenticated
  using (public.is_conversation_member(conversation_id));

-- Seule ma date de lecture est modifiable
create policy "conversation_members: ma date de lecture"
  on public.conversation_members for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.conversation_members from anon, authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;

create policy "messages: lecture par les membres"
  on public.messages for select to authenticated
  using (public.is_conversation_member(conversation_id));

create policy "messages: envoi"
  on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.can_post_message(conversation_id));

create policy "messages: suppression des miens"
  on public.messages for delete to authenticated
  using (sender_id = (select auth.uid()));

revoke update on public.messages from anon, authenticated;

-- Heure du dernier message + l'expéditeur a lu sa propre conversation
create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  update public.conversation_members set last_read_at = greatest(last_read_at, new.created_at)
  where conversation_id = new.conversation_id and user_id = new.sender_id;
  return null;
end;
$$;

create trigger messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

-- Heure du message fixée par le serveur
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at = now();
  if new.image_path is not null and split_part(new.image_path, '/', 1) <> new.sender_id::text then
    raise exception 'Photo hors de ton dossier' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

-- Conversation privée avec quelqu'un (créée au besoin). Refusée en cas de blocage.
create or replace function public.get_or_create_direct_conversation(other uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  conv uuid;
begin
  if me is null or other is null or other = me then
    raise exception 'Conversation impossible' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = other) then
    raise exception 'Motard introuvable' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(me, other) then
    raise exception 'Conversation impossible avec ce motard' using errcode = 'P0001';
  end if;

  select c.id into conv
  from public.conversations c
  join public.conversation_members a on a.conversation_id = c.id and a.user_id = me
  join public.conversation_members b on b.conversation_id = c.id and b.user_id = other
  where c.kind = 'direct'
  limit 1;

  if conv is null then
    insert into public.conversations (kind) values ('direct') returning id into conv;
    insert into public.conversation_members (conversation_id, user_id) values (conv, me), (conv, other);
  end if;
  return conv;
end;
$$;

revoke execute on function public.get_or_create_direct_conversation(uuid) from public, anon;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;

-- Conversation de groupe d'une balade : réservée à ses participants inscrits (et à l'organisateur)
create or replace function public.get_ride_conversation(ride uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  conv uuid;
begin
  if not exists (
    select 1 from public.group_rides r
    where r.id = ride and (
      r.created_by = me
      or exists (select 1 from public.group_ride_participants p where p.ride_id = r.id and p.user_id = me and p.status = 'joined')
    )
  ) then
    raise exception 'Réservé aux participants de la balade' using errcode = 'P0001';
  end if;

  select c.id into conv from public.conversations c where c.ride_id = ride;
  if conv is null then
    insert into public.conversations (kind, ride_id) values ('ride', ride) returning id into conv;
  end if;

  -- Membres = organisateur + participants inscrits
  insert into public.conversation_members (conversation_id, user_id)
  select conv, u from (
    select r.created_by as u from public.group_rides r where r.id = ride
    union
    select p.user_id from public.group_ride_participants p where p.ride_id = ride and p.status = 'joined'
  ) x
  on conflict do nothing;
  return conv;
end;
$$;

revoke execute on function public.get_ride_conversation(uuid) from public, anon;
grant execute on function public.get_ride_conversation(uuid) to authenticated;

-- Inscription / désistement : la conversation de la balade suit
create or replace function public.ride_participants_sync_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid;
begin
  if tg_op = 'DELETE' then
    select c.id into conv from public.conversations c where c.ride_id = old.ride_id;
    if conv is not null then
      delete from public.conversation_members m
      where m.conversation_id = conv and m.user_id = old.user_id
        and not exists (select 1 from public.group_rides r where r.id = old.ride_id and r.created_by = old.user_id);
    end if;
    return null;
  end if;
  if new.status = 'joined' then
    select c.id into conv from public.conversations c where c.ride_id = new.ride_id;
    if conv is not null then
      insert into public.conversation_members (conversation_id, user_id) values (conv, new.user_id)
      on conflict do nothing;
    end if;
  end if;
  return null;
end;
$$;

create trigger ride_participants_sync_conversation
  after insert or update or delete on public.group_ride_participants
  for each row execute function public.ride_participants_sync_conversation();

-- Liste de mes conversations, avec dernier message et nombre de non-lus
create or replace function public.my_conversations()
returns table (
  id uuid,
  kind text,
  ride_id uuid,
  ride_title text,
  other_id uuid,
  other_username text,
  other_avatar_path text,
  other_last_read_at timestamptz,
  blocked boolean,
  last_body text,
  last_has_image boolean,
  last_sender_id uuid,
  last_at timestamptz,
  unread integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id, c.kind, c.ride_id, r.title,
    o.user_id, op.username, op.avatar_path, o.last_read_at,
    coalesce(public.is_blocked_between(o.user_id, (select auth.uid())), false),
    lm.body, lm.image_path is not null, lm.sender_id, coalesce(lm.created_at, c.created_at),
    (select count(*) from public.messages x
       where x.conversation_id = c.id and x.sender_id <> (select auth.uid()) and x.created_at > me.last_read_at)::integer
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join public.group_rides r on r.id = c.ride_id
  left join lateral (
    select m.user_id, m.last_read_at from public.conversation_members m
    where m.conversation_id = c.id and m.user_id <> (select auth.uid()) and c.kind = 'direct'
    limit 1
  ) o on true
  left join public.profiles op on op.id = o.user_id
  left join lateral (
    select x.body, x.image_path, x.sender_id, x.created_at from public.messages x
    where x.conversation_id = c.id order by x.created_at desc limit 1
  ) lm on true
  where me.user_id = (select auth.uid())
    and (c.kind = 'ride' or lm.created_at is not null or c.created_at > now() - interval '1 hour')
  order by coalesce(lm.created_at, c.created_at) desc;
$$;

revoke execute on function public.my_conversations() from public, anon;
grant execute on function public.my_conversations() to authenticated;
