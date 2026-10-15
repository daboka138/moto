-- =====================================================================
-- Faire venir des motards
-- A) Invitations / parrainage
--   - invite_codes : un code unique par membre (créé avec le profil), lien passeryder.fr/i/CODE
--   - invite_info(code) : pseudo + photo de celui qui invite (page publique, appelée sans compte)
--   - referrals : UN seul parrain par compte (clé = filleul), créé quand le filleul termine son
--     profil (code envoyé dans les métadonnées d'inscription). Les deux deviennent amis tout de
--     suite (le filleul peut le retirer de ses amis).
--   - Qualifié à la 1re action du filleul (rejoindre une balade, ajouter un autre ami, signaler
--     un danger). Points (+30, si activés) donnés par pg_cron seulement quand le compte du
--     filleul a 7 jours (compte supprimé avant = rien) ; 10 filleuls récompensés par mois au plus.
--   - app_settings : réglages publics (lien Google Play, modifiable dans la console)
-- B) outings : récaps de sortie partagés (lien passeryder.fr/s/ID, lisibles par qui a le lien).
--   Tracé simplifié, départ / arrivée déjà coupés par l'app si demandé. JAMAIS de vitesse.
-- C) Clubs : clubs, club_members (fondateur / admin / membre, demandes), club_posts (mur),
--   balades et événements « au nom du club » (membres invités automatiquement),
--   recherche près de moi, page publique passeryder.fr/c/SLUG, signalements.
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- ---------- Réglages publics ----------
create table public.app_settings (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  value text not null check (char_length(value) <= 500),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create policy "app_settings: lecture par tous"
  on public.app_settings for select to anon, authenticated
  using (true);

create policy "app_settings: modification par l'admin"
  on public.app_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "app_settings: ajout par l'admin"
  on public.app_settings for insert to authenticated
  with check ((select public.is_admin()));

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings (key, value) values
  ('play_store_url', 'https://play.google.com/store/apps/details?id=com.passeryder.app');

-- ---------- Notifications : nouveaux types ----------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'like', 'comment', 'friend_request', 'friend_accepted', 'ride_invite', 'event_invite', 'event_response',
  'event_reminder', 'message', 'place_new', 'place_review', 'convoy', 'regroup', 'sos',
  'referral', 'club_request', 'club_accepted'
));

-- ---------- A) Codes d'invitation ----------
create table public.invite_codes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,10}$'),
  created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;

create policy "invite_codes: lecture du sien"
  on public.invite_codes for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.invite_codes from anon, authenticated;

-- 7 caractères sans 0/O/1/I/L (lisibles à l'oral et sur un QR imprimé)
create or replace function public.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  c text;
begin
  loop
    c := '';
    for i in 1..7 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.invite_codes x where x.code = c);
  end loop;
  return c;
end;
$$;

revoke execute on function public.new_invite_code() from public, anon, authenticated;

insert into public.invite_codes (user_id, code)
select p.id, public.new_invite_code() from public.profiles p
on conflict do nothing;

-- Page publique /i/CODE : seulement le pseudo et la photo
create or replace function public.invite_info(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('username', p.username, 'avatar_path', p.avatar_path)
  from public.invite_codes c
  join public.profiles p on p.id = c.user_id
  where c.code = upper(trim(p_code))
    and not exists (select 1 from public.account_suspensions s where s.user_id = p.id);
$$;

revoke execute on function public.invite_info(text) from public;
grant execute on function public.invite_info(text) to anon, authenticated;

-- ---------- A) Parrainage ----------
create table public.referrals (
  referee_id uuid primary key references public.profiles (id) on delete cascade,
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  check (referee_id <> referrer_id)
);

create index referrals_referrer_idx on public.referrals (referrer_id);

alter table public.referrals enable row level security;

create policy "referrals: lecture des siens"
  on public.referrals for select to authenticated
  using (referee_id = (select auth.uid()) or referrer_id = (select auth.uid()));

revoke insert, update, delete on public.referrals from anon, authenticated;

-- Profil créé (fin de l'inscription) : code d'invitation + parrainage éventuel
create or replace function public.profiles_after_insert_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  given text;
  sponsor uuid;
begin
  insert into public.invite_codes (user_id, code) values (new.id, public.new_invite_code()) on conflict do nothing;

  select upper(trim(u.raw_user_meta_data ->> 'invite_code')) into given from auth.users u where u.id = new.id;
  if given is null or given = '' then
    return new;
  end if;
  select c.user_id into sponsor from public.invite_codes c where c.code = given;
  if sponsor is null or sponsor = new.id or public.is_blocked_between(sponsor, new.id) then
    return new;
  end if;

  insert into public.referrals (referee_id, referrer_id) values (new.id, sponsor) on conflict do nothing;
  -- Amis tout de suite (le filleul peut retirer son parrain de ses amis)
  insert into public.friendships (requester_id, addressee_id, status, accepted_at)
  values (sponsor, new.id, 'accepted', now())
  on conflict do nothing;
  perform public.notify(sponsor, 'referral', new.id, 'user', new.id,
    new.username || ' s''est inscrit avec ton invitation 🎉 Vous êtes maintenant amis.', '/user/' || new.id);
  perform public.notify(new.id, 'referral', sponsor, 'user', sponsor,
    public.username_of(sponsor) || ' t''a invité : vous êtes maintenant amis. Tu peux le retirer de tes amis depuis son profil.',
    '/user/' || sponsor);
  perform public.send_push(array[sponsor], 'friends', 'Nouveau filleul 🎉',
    new.username || ' a rejoint PasseRyder avec ton invitation.', jsonb_build_object('url', '/user/' || new.id));
  return new;
end;
$$;

revoke execute on function public.profiles_after_insert_invite() from public, anon, authenticated;

create trigger profiles_after_insert_invite
  after insert on public.profiles
  for each row execute function public.profiles_after_insert_invite();

-- 1re action du filleul
create or replace function public.referral_qualify(p_user uuid, p_other uuid default null)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.referrals r set qualified_at = now()
  where r.referee_id = p_user and r.qualified_at is null
    and (p_other is null or p_other <> r.referrer_id);
$$;

revoke execute on function public.referral_qualify(uuid, uuid) from public, anon, authenticated;

create or replace function public.referral_on_ride_join()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'joined' then
    perform public.referral_qualify(new.user_id);
  end if;
  return null;
end;
$$;

create trigger referral_on_ride_join
  after insert or update of status on public.group_ride_participants
  for each row execute function public.referral_on_ride_join();

create or replace function public.referral_on_friendship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Ajouter un ami (autre que son parrain) : demande envoyée ou acceptée
  if tg_op = 'INSERT' then
    perform public.referral_qualify(new.requester_id, new.addressee_id);
  elsif new.status = 'accepted' and old.status = 'pending' then
    perform public.referral_qualify(new.addressee_id, new.requester_id);
    perform public.referral_qualify(new.requester_id, new.addressee_id);
  end if;
  return null;
end;
$$;

create trigger referral_on_friendship
  after insert or update of status on public.friendships
  for each row execute function public.referral_on_friendship();

create or replace function public.referral_on_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.referral_qualify(new.created_by);
  return null;
end;
$$;

create trigger referral_on_report
  after insert on public.road_reports
  for each row execute function public.referral_on_report();

revoke execute on function public.referral_on_ride_join(), public.referral_on_friendship(), public.referral_on_report()
  from public, anon, authenticated;

-- Points du parrain : nouveau type
alter table public.good_point_events drop constraint good_point_events_kind_check;
alter table public.good_point_events add constraint good_point_events_kind_check check (kind in (
  'clean_km', 'phone_free', 'danger_confirmed', 'danger_confirm', 'ride_organized', 'convoy_done', 'regroup', 'spot_rated',
  'challenge', 'referral'
));
alter table public.monthly_challenges drop constraint monthly_challenges_metric_check;
alter table public.monthly_challenges add constraint monthly_challenges_metric_check check (metric in (
  'clean_km', 'phone_free', 'danger_confirmed', 'danger_confirm', 'ride_organized', 'convoy_done', 'regroup', 'spot_rated',
  'points', 'referral'
));

-- Toutes les heures : filleuls qualifiés dont le compte a 7 jours → +30 au parrain
-- (10 filleuls récompensés par mois et par parrain au plus ; au-delà, rien)
create or replace function public.reward_referrals()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select rf.referee_id, rf.referrer_id from public.referrals rf
    join public.profiles p on p.id = rf.referee_id
    where rf.qualified_at is not null and rf.rewarded_at is null and p.created_at < now() - interval '7 days'
    order by rf.qualified_at
  loop
    if (select count(*) from public.referrals x
        where x.referrer_id = r.referrer_id and x.rewarded_at >= public.paris_month_start()) < 10 then
      perform public.award_points(r.referrer_id, 'referral', r.referee_id::text, 30, 1);
    end if;
    update public.referrals set rewarded_at = now() where referee_id = r.referee_id;
  end loop;
end;
$$;

revoke execute on function public.reward_referrals() from public, anon, authenticated;

select cron.schedule('referral-rewards', '17 * * * *', $$ select public.reward_referrals(); $$);

-- Mes filleuls (écran Inviter des potes)
create or replace function public.my_referrals()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'code', (select c.code from public.invite_codes c where c.user_id = (select auth.uid())),
    'count', (select count(*) from public.referrals r where r.referrer_id = (select auth.uid())),
    'qualified', (select count(*) from public.referrals r where r.referrer_id = (select auth.uid()) and r.qualified_at is not null),
    'referees', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'username', p.username, 'avatar_path', p.avatar_path,
        'qualified', r.qualified_at is not null, 'at', r.created_at) order by r.created_at desc)
      from public.referrals r join public.profiles p on p.id = r.referee_id
      where r.referrer_id = (select auth.uid())
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.my_referrals() from public, anon;
grant execute on function public.my_referrals() to authenticated;

-- Console : inscrits par invitation, top parrains
create or replace function public.admin_referral_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return jsonb_build_object(
    'invited', (select count(*) from public.referrals),
    'invited_30d', (select count(*) from public.referrals r where r.created_at > now() - interval '30 days'),
    'qualified', (select count(*) from public.referrals r where r.qualified_at is not null),
    'top', coalesce((
      select jsonb_agg(t order by t.n desc, t.username)
      from (
        select p.username, count(*) as n, count(*) filter (where r.qualified_at is not null) as qualified
        from public.referrals r join public.profiles p on p.id = r.referrer_id
        group by p.username
        order by count(*) desc, p.username
        limit 10
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_referral_stats() from public, anon;
grant execute on function public.admin_referral_stats() to authenticated;

-- ---------- B) Récaps de sortie partagés ----------
create table public.outings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Origine (trip:<id> / ride:<id>) : un seul récap par sortie, mis à jour si on repartage
  source text not null check (char_length(source) between 3 and 120),
  kind text not null check (kind in ('trip', 'loop', 'ride')),
  title text not null check (char_length(title) between 1 and 100),
  started_at timestamptz not null,
  distance_m integer not null check (distance_m between 0 and 5000000),
  duration_s integer not null check (duration_s between 0 and 864000),
  elevation_gain_m integer check (elevation_gain_m between 0 and 50000),
  participants integer check (participants between 0 and 10000),
  points integer check (points between 0 and 10000),
  badges text[] not null default '{}' check (cardinality(badges) <= 6),
  -- [[lat, lng], ...] simplifié ; départ et arrivée déjà coupés par l'app si hide_ends
  track jsonb not null check (jsonb_typeof(track) = 'array' and jsonb_array_length(track) between 2 and 600),
  hide_ends boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, source)
);

alter table public.outings enable row level security;

create policy "outings: lecture des siens"
  on public.outings for select to authenticated
  using (owner_id = (select auth.uid()));

create policy "outings: création"
  on public.outings for insert to authenticated
  with check (owner_id = (select auth.uid()));

create policy "outings: modification"
  on public.outings for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "outings: suppression"
  on public.outings for delete to authenticated
  using (owner_id = (select auth.uid()));

create trigger outings_set_updated_at
  before update on public.outings
  for each row execute function public.set_updated_at();

-- Page publique /s/ID (qui a le lien peut la voir)
create or replace function public.get_outing(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', o.id, 'kind', o.kind, 'title', o.title, 'started_at', o.started_at, 'distance_m', o.distance_m,
    'duration_s', o.duration_s, 'elevation_gain_m', o.elevation_gain_m, 'participants', o.participants,
    'points', o.points, 'badges', o.badges, 'track', o.track, 'hide_ends', o.hide_ends,
    'username', p.username, 'avatar_path', p.avatar_path
  )
  from public.outings o join public.profiles p on p.id = o.owner_id
  where o.id = p_id;
$$;

revoke execute on function public.get_outing(uuid) from public;
grant execute on function public.get_outing(uuid) to anon, authenticated;

-- ---------- C) Clubs ----------
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  name text not null check (char_length(trim(name)) between 3 and 60),
  description text check (char_length(description) <= 1000),
  logo_path text check (char_length(logo_path) <= 300),
  city text check (char_length(city) <= 80),
  -- Zone du club, arrondie à ~1 km (recherche « près de moi »)
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  join_policy text not null default 'open' check (join_policy in ('open', 'request')),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clubs_created_by_idx on public.clubs (created_by);

create table public.club_members (
  club_id uuid not null references public.clubs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('founder', 'admin', 'member')),
  status text not null default 'member' check (status in ('member', 'pending')),
  created_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

create index club_members_user_idx on public.club_members (user_id);

create table public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text check (char_length(body) <= 1000),
  photo_path text check (char_length(photo_path) <= 300),
  created_at timestamptz not null default now(),
  check (coalesce(char_length(trim(body)), 0) > 0 or photo_path is not null)
);

create index club_posts_club_idx on public.club_posts (club_id, created_at desc);

alter table public.group_rides add column club_id uuid references public.clubs (id) on delete set null;
alter table public.events add column club_id uuid references public.clubs (id) on delete set null;
create index group_rides_club_idx on public.group_rides (club_id) where club_id is not null;
create index events_club_idx on public.events (club_id) where club_id is not null;

create or replace function public.club_role(p_club uuid, p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role from public.club_members m where m.club_id = p_club and m.user_id = p_user and m.status = 'member';
$$;

revoke execute on function public.club_role(uuid, uuid) from public, anon, authenticated;

create or replace function public.is_club_admin(p_club uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.club_role(p_club, (select auth.uid())) in ('founder', 'admin'), false);
$$;

create or replace function public.is_club_member(p_club uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.club_role(p_club, (select auth.uid())) is not null;
$$;

revoke execute on function public.is_club_admin(uuid), public.is_club_member(uuid) from public, anon;
grant execute on function public.is_club_admin(uuid), public.is_club_member(uuid) to authenticated;

-- Slug unique tiré du nom, zone arrondie, colonnes protégées
create or replace function public.clubs_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  base text;
  candidate text;
  n integer := 1;
begin
  if new.latitude is not null and new.longitude is not null then
    new.latitude := round(new.latitude::numeric, 2);
    new.longitude := round(new.longitude::numeric, 2);
  else
    new.latitude := null;
    new.longitude := null;
  end if;
  if tg_op = 'INSERT' then
    if (select count(*) from public.clubs c where c.created_by = new.created_by) >= 5 then
      raise exception 'Tu as déjà créé 5 clubs' using errcode = 'P0001';
    end if;
    base := trim(both '-' from regexp_replace(public.fold_text(new.name), '[^a-z0-9]+', '-', 'g'));
    base := left(coalesce(nullif(base, ''), 'club'), 50);
    if char_length(base) < 3 then
      base := base || '-club';
    end if;
    candidate := base;
    while exists (select 1 from public.clubs c where c.slug = candidate) loop
      n := n + 1;
      candidate := base || '-' || n;
    end loop;
    new.slug := candidate;
    new.hidden_at := null;
    new.created_at := now();
  else
    new.slug := old.slug;
    new.created_by := old.created_by;
    if not public.is_admin() then
      new.hidden_at := old.hidden_at;
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.clubs_before_write() from public, anon, authenticated;

create trigger clubs_before_write
  before insert or update on public.clubs
  for each row execute function public.clubs_before_write();

create trigger clubs_set_updated_at
  before update on public.clubs
  for each row execute function public.set_updated_at();

create or replace function public.clubs_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.club_members (club_id, user_id, role, status) values (new.id, new.created_by, 'founder', 'member');
  return null;
end;
$$;

revoke execute on function public.clubs_after_insert() from public, anon, authenticated;

create trigger clubs_after_insert
  after insert on public.clubs
  for each row execute function public.clubs_after_insert();

alter table public.clubs enable row level security;

create policy "clubs: lecture"
  on public.clubs for select to authenticated
  using (hidden_at is null or created_by = (select auth.uid()) or (select public.is_admin()));

create policy "clubs: création"
  on public.clubs for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "clubs: modification par ses admins"
  on public.clubs for update to authenticated
  using (public.is_club_admin(id) or (select public.is_admin()))
  with check (public.is_club_admin(id) or (select public.is_admin()));

create policy "clubs: suppression par le fondateur"
  on public.clubs for delete to authenticated
  using (created_by = (select auth.uid()) or (select public.is_admin()));

alter table public.club_members enable row level security;

-- Membres visibles par tous ; demandes en attente : le demandeur et les admins du club
create policy "club_members: lecture"
  on public.club_members for select to authenticated
  using (status = 'member' or user_id = (select auth.uid()) or public.is_club_admin(club_id));

revoke insert, update, delete on public.club_members from anon, authenticated;

alter table public.club_posts enable row level security;

create policy "club_posts: lecture par les membres"
  on public.club_posts for select to authenticated
  using (public.is_club_member(club_id) and not public.is_blocked_with(author_id));

create policy "club_posts: publication par les membres"
  on public.club_posts for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_club_member(club_id));

create policy "club_posts: suppression par l'auteur ou un admin du club"
  on public.club_posts for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_club_admin(club_id));

-- Rejoindre : club ouvert = membre tout de suite, sinon demande aux admins
create or replace function public.join_club(p_club uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  c public.clubs%rowtype;
  st text;
  admins uuid[];
begin
  select * into c from public.clubs where id = p_club and hidden_at is null;
  if not found or me is null then
    raise exception 'Club introuvable' using errcode = 'P0001';
  end if;
  if public.is_blocked_between(me, c.created_by) then
    raise exception 'Club introuvable' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.club_members m where m.club_id = p_club and m.user_id = me) then
    return (select m.status from public.club_members m where m.club_id = p_club and m.user_id = me);
  end if;
  st := case when c.join_policy = 'open' then 'member' else 'pending' end;
  insert into public.club_members (club_id, user_id, role, status) values (p_club, me, 'member', st);
  if st = 'pending' then
    select coalesce(array_agg(m.user_id), '{}') into admins from public.club_members m
    where m.club_id = p_club and m.status = 'member' and m.role in ('founder', 'admin');
    perform public.notify_many(admins, 'club_request', me, 'club', p_club,
      public.username_of(me) || ' demande à rejoindre « ' || c.name || ' »', '/club/' || p_club);
    perform public.send_push(admins, 'friends', c.name, public.username_of(me) || ' demande à rejoindre le club',
      jsonb_build_object('url', '/club/' || p_club));
  end if;
  return st;
end;
$$;

-- Quitter (ou annuler sa demande). Le fondateur ne peut pas quitter : il supprime le club.
create or replace function public.leave_club(p_club uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.club_role(p_club, (select auth.uid())) = 'founder' then
    raise exception 'Le fondateur ne peut pas quitter son club : supprime-le, ou nomme un autre admin avant' using errcode = 'P0001';
  end if;
  delete from public.club_members where club_id = p_club and user_id = (select auth.uid());
end;
$$;

-- Admin du club : accepter / refuser une demande
create or replace function public.club_decide(p_club uuid, p_user uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
begin
  if not public.is_club_admin(p_club) then
    raise exception 'Réservé aux admins du club' using errcode = '42501';
  end if;
  delete from public.notifications where type = 'club_request' and target_id = p_club and actor_id = p_user;
  if p_accept then
    update public.club_members set status = 'member' where club_id = p_club and user_id = p_user and status = 'pending';
    if found then
      select name into c from public.clubs where id = p_club;
      perform public.notify(p_user, 'club_accepted', (select auth.uid()), 'club', p_club,
        'Bienvenue dans « ' || c.name || ' » !', '/club/' || p_club);
      perform public.send_push(array[p_user], 'friends', c.name, 'Ta demande est acceptée, bienvenue au club !',
        jsonb_build_object('url', '/club/' || p_club));
    end if;
  else
    delete from public.club_members where club_id = p_club and user_id = p_user and status = 'pending';
  end if;
end;
$$;

-- Retirer un membre : un admin retire un membre, le fondateur retire aussi un admin
create or replace function public.club_remove_member(p_club uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mine text := public.club_role(p_club, (select auth.uid()));
  theirs text := (select m.role from public.club_members m where m.club_id = p_club and m.user_id = p_user);
begin
  if mine not in ('founder', 'admin') or theirs = 'founder' or (theirs = 'admin' and mine <> 'founder') then
    raise exception 'Action non autorisée' using errcode = '42501';
  end if;
  delete from public.club_members where club_id = p_club and user_id = p_user;
end;
$$;

-- Fondateur : nommer / retirer un admin
create or replace function public.club_set_role(p_club uuid, p_user uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.club_role(p_club, (select auth.uid())) <> 'founder' or p_role not in ('admin', 'member') then
    raise exception 'Réservé au fondateur du club' using errcode = '42501';
  end if;
  update public.club_members set role = p_role
  where club_id = p_club and user_id = p_user and status = 'member' and role <> 'founder';
end;
$$;

revoke execute on function public.join_club(uuid), public.leave_club(uuid), public.club_decide(uuid, uuid, boolean),
  public.club_remove_member(uuid, uuid), public.club_set_role(uuid, uuid, text) from public, anon;
grant execute on function public.join_club(uuid), public.leave_club(uuid), public.club_decide(uuid, uuid, boolean),
  public.club_remove_member(uuid, uuid), public.club_set_role(uuid, uuid, text) to authenticated;

-- Balade / événement au nom du club : réservé à ses admins, membres invités automatiquement
create or replace function public.club_content_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.club_id is not null and coalesce(public.club_role(new.club_id, new.created_by), '') not in ('founder', 'admin') then
    raise exception 'Seuls les admins du club peuvent publier en son nom' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger group_rides_club_check before insert or update of club_id on public.group_rides
  for each row execute function public.club_content_before_insert();
create trigger events_club_check before insert or update of club_id on public.events
  for each row execute function public.club_content_before_insert();

create or replace function public.club_invite_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.club_id is null then
    return null;
  end if;
  if tg_table_name = 'group_rides' then
    insert into public.group_ride_participants (ride_id, user_id, status)
    select new.id, m.user_id, 'invited' from public.club_members m
    where m.club_id = new.club_id and m.status = 'member' and m.user_id <> new.created_by
    on conflict do nothing;
  else
    insert into public.event_invites (event_id, user_id, invited_by)
    select new.id, m.user_id, new.created_by from public.club_members m
    where m.club_id = new.club_id and m.status = 'member' and m.user_id <> new.created_by
    on conflict do nothing;
  end if;
  return null;
end;
$$;

revoke execute on function public.club_content_before_insert(), public.club_invite_members() from public, anon, authenticated;

create trigger group_rides_club_invite after insert on public.group_rides
  for each row execute function public.club_invite_members();
create trigger events_club_invite after insert on public.events
  for each row execute function public.club_invite_members();

-- Recherche : par nom et/ou près d'un point (distance en km, zone arrondie)
create or replace function public.search_clubs(p_query text default null, p_lat double precision default null, p_lng double precision default null)
returns table (
  id uuid, slug text, name text, logo_path text, city text, join_policy text, members bigint,
  distance_km integer, my_status text, my_role text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.slug, c.name, c.logo_path, c.city, c.join_policy,
    (select count(*) from public.club_members m where m.club_id = c.id and m.status = 'member'),
    case when p_lat is not null and c.latitude is not null
      then round(public.geo_distance_m(p_lat, p_lng, c.latitude, c.longitude) / 1000)::int end,
    me.status, case when me.status = 'member' then me.role end
  from public.clubs c
  left join public.club_members me on me.club_id = c.id and me.user_id = (select auth.uid())
  where c.hidden_at is null
    and not public.is_blocked_between(c.created_by, (select auth.uid()))
    and (p_query is null or trim(p_query) = ''
         or public.fold_text(c.name) like '%' || public.fold_text(trim(p_query)) || '%'
         or public.fold_text(coalesce(c.city, '')) like '%' || public.fold_text(trim(p_query)) || '%')
  order by (me.status = 'member') desc nulls last,
    case when p_lat is not null and c.latitude is not null then public.geo_distance_m(p_lat, p_lng, c.latitude, c.longitude) end nulls last,
    7 desc
  limit 50;
$$;

revoke execute on function public.search_clubs(text, double precision, double precision) from public, anon;
grant execute on function public.search_clubs(text, double precision, double precision) to authenticated;

-- Page publique /c/SLUG
create or replace function public.club_public(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'name', c.name, 'description', c.description, 'logo_path', c.logo_path,
    'city', c.city, 'join_policy', c.join_policy,
    'members', (select count(*) from public.club_members m where m.club_id = c.id and m.status = 'member'),
    'founder', public.username_of(c.created_by)
  )
  from public.clubs c
  where c.slug = lower(trim(p_slug)) and c.hidden_at is null;
$$;

revoke execute on function public.club_public(text) from public;
grant execute on function public.club_public(text) to anon, authenticated;

-- ---------- Modération : clubs et messages du mur des clubs ----------
alter table public.content_reports drop constraint content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check
  check (target_type in ('message', 'story', 'user', 'comment', 'ride_comment', 'place', 'place_review', 'event', 'photo',
    'club', 'club_post'));

-- 3 signalements : spot, avis ou club masqué automatiquement
create or replace function public.content_reports_auto_hide()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.target_type not in ('place', 'place_review', 'club') then
    return new;
  end if;
  if (select count(distinct r.reporter_id) from public.content_reports r
      where r.target_type = new.target_type and r.target_id = new.target_id) >= 3 then
    if new.target_type = 'place' then
      update public.places set hidden_at = now() where id = new.target_id and hidden_at is null;
    elsif new.target_type = 'club' then
      update public.clubs set hidden_at = now() where id = new.target_id and hidden_at is null;
    else
      update public.place_reviews set hidden_at = now() where id = new.target_id and hidden_at is null;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.admin_reports()
returns table (
  target_type text,
  target_id uuid,
  reports bigint,
  reasons text[],
  last_at timestamptz,
  excerpt text,
  author_id uuid,
  author_username text,
  hidden boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
    with r as (
      select c.target_type as t, c.target_id as id, count(*) as n, array_agg(distinct c.reason) as why, max(c.created_at) as last
      from public.content_reports c
      where c.target_type <> 'message'
      group by c.target_type, c.target_id
    )
    select r.t, r.id, r.n, r.why, r.last,
      case r.t
        when 'place' then (select pl.name || coalesce(' — ' || left(pl.description, 120), '') from public.places pl where pl.id = r.id)
        when 'place_review' then (select repeat('★', pr.rating) || coalesce(' ' || left(pr.body, 160), '') from public.place_reviews pr where pr.id = r.id)
        when 'event' then (select e.title from public.events e where e.id = r.id)
        when 'photo' then (select coalesce(w.caption, 'Photo du mur') from public.wall_photos w where w.id = r.id)
        when 'comment' then (select left(wc.body, 200) from public.wall_photo_comments wc where wc.id = r.id)
        when 'ride_comment' then (select left(rc.body, 200) from public.ride_comments rc where rc.id = r.id)
        when 'story' then (select coalesce(st.caption, 'Story') from public.stories st where st.id = r.id)
        when 'user' then (select '@' || pu.username from public.profiles pu where pu.id = r.id)
        when 'club' then (select cl.name || coalesce(' — ' || left(cl.description, 120), '') from public.clubs cl where cl.id = r.id)
        when 'club_post' then (select coalesce(left(cp.body, 200), 'Photo') from public.club_posts cp where cp.id = r.id)
      end,
      a.author,
      (select pa.username from public.profiles pa where pa.id = a.author),
      case r.t
        when 'place' then (select pl.hidden_at is not null from public.places pl where pl.id = r.id)
        when 'place_review' then (select pr.hidden_at is not null from public.place_reviews pr where pr.id = r.id)
        when 'club' then (select cl.hidden_at is not null from public.clubs cl where cl.id = r.id)
        else false
      end
    from r
    cross join lateral (
      select case r.t
        when 'place' then (select pl.created_by from public.places pl where pl.id = r.id)
        when 'place_review' then (select pr.author_id from public.place_reviews pr where pr.id = r.id)
        when 'event' then (select e.created_by from public.events e where e.id = r.id)
        when 'photo' then (select w.owner_id from public.wall_photos w where w.id = r.id)
        when 'comment' then (select wc.author_id from public.wall_photo_comments wc where wc.id = r.id)
        when 'ride_comment' then (select rc.author_id from public.ride_comments rc where rc.id = r.id)
        when 'story' then (select st.owner_id from public.stories st where st.id = r.id)
        when 'user' then r.id
        when 'club' then (select cl.created_by from public.clubs cl where cl.id = r.id)
        when 'club_post' then (select cp.author_id from public.club_posts cp where cp.id = r.id)
      end as author
    ) a
    order by r.n desc, r.last desc
    limit 200;
end;
$$;

create or replace function public.admin_moderate(p_type text, p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_action = 'dismiss' then
    delete from public.content_reports where target_type = p_type and target_id = p_id;
    return;
  end if;
  if p_action in ('hide', 'unhide') then
    if p_type = 'place' then
      update public.places set hidden_at = case when p_action = 'hide' then now() end where id = p_id;
    elsif p_type = 'place_review' then
      update public.place_reviews set hidden_at = case when p_action = 'hide' then now() end where id = p_id;
    elsif p_type = 'club' then
      update public.clubs set hidden_at = case when p_action = 'hide' then now() end where id = p_id;
    else
      raise exception 'Masquage possible seulement pour les spots, les avis et les clubs' using errcode = 'P0001';
    end if;
    return;
  end if;
  if p_action <> 'delete' then
    raise exception 'Action inconnue' using errcode = 'P0001';
  end if;
  case p_type
    when 'place' then delete from public.places where id = p_id;
    when 'place_review' then delete from public.place_reviews where id = p_id;
    when 'event' then delete from public.events where id = p_id;
    when 'photo' then delete from public.wall_photos where id = p_id;
    when 'comment' then delete from public.wall_photo_comments where id = p_id;
    when 'ride_comment' then delete from public.ride_comments where id = p_id;
    when 'story' then delete from public.stories where id = p_id;
    when 'club' then delete from public.clubs where id = p_id;
    when 'club_post' then delete from public.club_posts where id = p_id;
    else raise exception 'Suppression impossible pour ce type (utilise la suspension pour un compte)' using errcode = 'P0001';
  end case;
  delete from public.content_reports where target_type = p_type and target_id = p_id;
end;
$$;
