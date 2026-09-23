-- =====================================================================
-- Amis, confidentialité de la position, positions en direct, trajets de groupe
-- À coller dans Supabase : SQL Editor > New query > Run
-- (après 20260923000000_profiles.sql)
--
-- Principe de sécurité : personne ne lit live_positions directement.
-- La policy SELECT appelle can_view_location(), qui applique toutes les règles
-- de confidentialité côté serveur. L'app ne peut pas les contourner.
-- =====================================================================

-- ---------- Amis ----------
-- Une ligne par paire : demande en attente (pending) ou amitié (accepted).
-- Refuser une demande, l'annuler ou retirer un ami = supprimer la ligne.
create table public.friendships (
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- Une seule ligne par paire, quel que soit le sens de la demande
create unique index friendships_pair_key
  on public.friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index friendships_addressee_idx on public.friendships (addressee_id);

create or replace function public.friendships_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'accepted' and old.status = 'pending' then
    new.accepted_at = now();
  end if;
  return new;
end;
$$;

create trigger friendships_set_accepted_at
  before update on public.friendships
  for each row execute function public.friendships_before_update();

alter table public.friendships enable row level security;

create policy "friendships: lecture des siennes"
  on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

create policy "friendships: envoi d'une demande"
  on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()) and status = 'pending' and accepted_at is null);

create policy "friendships: acceptation par le destinataire"
  on public.friendships for update to authenticated
  using (addressee_id = (select auth.uid()) and status = 'pending')
  with check (addressee_id = (select auth.uid()) and status = 'accepted');

create policy "friendships: suppression par l'un des deux"
  on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- Seul le statut est modifiable : impossible de changer les participants d'une demande
revoke update on public.friendships from anon, authenticated;
grant update (status) on public.friendships to authenticated;

-- Usage interne uniquement (n'est pas appelable depuis l'app)
create or replace function public.are_friends(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  );
$$;

revoke execute on function public.are_friends(uuid, uuid) from public, anon, authenticated;

-- ---------- Confidentialité de la position ----------
-- Pas de ligne = mode "friends" (confidentialité par défaut)
create table public.location_privacy (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  mode text not null default 'friends' check (mode in ('everyone', 'friends', 'selected', 'ghost')),
  -- Mode à retrouver en quittant le fantôme
  mode_before_ghost text not null default 'friends' check (mode_before_ghost in ('everyone', 'friends', 'selected')),
  updated_at timestamptz not null default now()
);

create trigger location_privacy_set_updated_at
  before update on public.location_privacy
  for each row execute function public.set_updated_at();

-- allow : amis cochés (mode "selected") ; block : exceptions (masqué même en mode "everyone"/"friends")
create table public.location_privacy_rules (
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  friend_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('allow', 'block')),
  primary key (owner_id, friend_id, kind),
  check (owner_id <> friend_id)
);

alter table public.location_privacy enable row level security;
alter table public.location_privacy_rules enable row level security;

-- Réglages visibles et modifiables uniquement par leur propriétaire
create policy "location_privacy: propriétaire"
  on public.location_privacy for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "location_privacy_rules: propriétaire"
  on public.location_privacy_rules for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ---------- Trajets de groupe ----------
-- Un trajet est "en cours" entre started_at et ended_at (12 h max par sécurité).
-- Les participants "joined" d'un trajet en cours se voient toujours, même en fantôme.
create table public.group_rides (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 80),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or (started_at is not null and ended_at >= started_at))
);

-- invited : invité par le créateur (uniquement ses amis) ; joined : a accepté de participer
create table public.group_ride_participants (
  ride_id uuid not null references public.group_rides (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'joined')),
  created_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);

create index group_ride_participants_user_idx on public.group_ride_participants (user_id);

-- Usage interne : l'utilisateur courant fait-il partie de ce trajet ?
create or replace function public.is_ride_member(ride uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_ride_participants p
    where p.ride_id = ride and p.user_id = (select auth.uid())
  ) or exists (
    select 1 from public.group_rides r
    where r.id = ride and r.created_by = (select auth.uid())
  );
$$;

create or replace function public.is_ride_creator(ride uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.group_rides r where r.id = ride and r.created_by = (select auth.uid()));
$$;

revoke execute on function public.is_ride_member(uuid) from public, anon;
revoke execute on function public.is_ride_creator(uuid) from public, anon;
grant execute on function public.is_ride_member(uuid) to authenticated;
grant execute on function public.is_ride_creator(uuid) to authenticated;

alter table public.group_rides enable row level security;
alter table public.group_ride_participants enable row level security;

create policy "group_rides: lecture par les membres"
  on public.group_rides for select to authenticated
  using (created_by = (select auth.uid()) or public.is_ride_member(id));

create policy "group_rides: création"
  on public.group_rides for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "group_rides: modification par le créateur"
  on public.group_rides for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "group_rides: suppression par le créateur"
  on public.group_rides for delete to authenticated
  using (created_by = (select auth.uid()));

-- Le créateur ne peut changer que le titre et les horaires
revoke update on public.group_rides from anon, authenticated;
grant update (title, started_at, ended_at) on public.group_rides to authenticated;

create policy "group_ride_participants: lecture par les membres"
  on public.group_ride_participants for select to authenticated
  using (public.is_ride_member(ride_id));

-- Le créateur s'inscrit lui-même (joined) ou invite un de ses amis (invited).
-- Personne ne peut être ajouté comme "joined" sans son accord.
create or replace function public.can_add_ride_participant(ride uuid, participant uuid, participant_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_ride_creator(ride) and (
    (participant = (select auth.uid()) and participant_status = 'joined')
    or (participant_status = 'invited' and public.are_friends((select auth.uid()), participant))
  );
$$;

revoke execute on function public.can_add_ride_participant(uuid, uuid, text) from public, anon;
grant execute on function public.can_add_ride_participant(uuid, uuid, text) to authenticated;

create policy "group_ride_participants: ajout par le créateur"
  on public.group_ride_participants for insert to authenticated
  with check (public.can_add_ride_participant(ride_id, user_id, status));

create policy "group_ride_participants: l'invité accepte"
  on public.group_ride_participants for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and status = 'joined');

create policy "group_ride_participants: départ ou retrait"
  on public.group_ride_participants for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_ride_creator(ride_id));

revoke update on public.group_ride_participants from anon, authenticated;
grant update (status) on public.group_ride_participants to authenticated;

-- ---------- Règle de visibilité ----------
-- L'utilisateur connecté peut-il voir la position de target ?
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

  -- everyone / friends : les exceptions (block) s'appliquent
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

revoke execute on function public.can_view_location(uuid) from public, anon;
grant execute on function public.can_view_location(uuid) to authenticated;

-- L'utilisateur connecté participe-t-il à un trajet de groupe en cours ?
-- (l'app continue alors d'envoyer sa position même en fantôme)
create or replace function public.in_active_group_ride()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_ride_participants p
    join public.group_rides r on r.id = p.ride_id
    where p.user_id = (select auth.uid()) and p.status = 'joined'
      and r.started_at is not null and r.started_at <= now()
      and r.ended_at is null
      and r.started_at > now() - interval '12 hours'
  );
$$;

revoke execute on function public.in_active_group_ride() from public, anon;
grant execute on function public.in_active_group_ride() to authenticated;

-- ---------- Positions en direct ----------
create table public.live_positions (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  speed_kmh real check (speed_kmh >= 0 and speed_kmh < 500),
  heading real,
  accuracy_m real,
  updated_at timestamptz not null default now()
);

create index live_positions_updated_at_idx on public.live_positions (updated_at);

-- updated_at toujours fixé par le serveur
create trigger live_positions_set_updated_at
  before insert or update on public.live_positions
  for each row execute function public.set_updated_at();

alter table public.live_positions enable row level security;

create policy "live_positions: lecture selon la confidentialité"
  on public.live_positions for select to authenticated
  using (user_id = (select auth.uid()) or public.can_view_location(user_id));

create policy "live_positions: écriture de la sienne"
  on public.live_positions for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "live_positions: mise à jour de la sienne"
  on public.live_positions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "live_positions: suppression de la sienne"
  on public.live_positions for delete to authenticated
  using (user_id = (select auth.uid()));
