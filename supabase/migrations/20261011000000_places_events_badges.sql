-- =====================================================================
-- Lot 3 : lieux motards (avis, notes), J'aime / commentaires des balades,
-- J'aime des stories, badges et défis (statistiques), événements.
-- Tout est lisible par les membres connectés (comme les profils), sauf
-- entre deux membres qui se sont bloqués. Tout part en cascade avec le compte.
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- ---------- Lieux motards ----------
create table public.places (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('biker_cafe', 'garage', 'viewpoint', 'road')),
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text check (char_length(description) <= 1000),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  photo_path text check (char_length(photo_path) <= 300),
  created_at timestamptz not null default now()
);

create index places_position_idx on public.places (latitude, longitude);
create index places_created_by_idx on public.places (created_by);

alter table public.places enable row level security;

create policy "places: lecture membres connectés"
  on public.places for select to authenticated
  using (not public.is_blocked_with(created_by));

create policy "places: ajout"
  on public.places for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "places: modification du sien"
  on public.places for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "places: suppression du sien"
  on public.places for delete to authenticated
  using (created_by = (select auth.uid()));

revoke update on public.places from anon, authenticated;
grant update (kind, name, description, photo_path) on public.places to authenticated;

-- Avis : une note (1 à 5) et un commentaire par membre et par lieu
create table public.place_reviews (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text check (char_length(body) <= 500),
  photo_path text check (char_length(photo_path) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, author_id)
);

create index place_reviews_author_idx on public.place_reviews (author_id);

create trigger place_reviews_set_updated_at
  before update on public.place_reviews
  for each row execute function public.set_updated_at();

alter table public.place_reviews enable row level security;

create policy "place_reviews: lecture membres connectés"
  on public.place_reviews for select to authenticated
  using (not public.is_blocked_with(author_id));

create policy "place_reviews: donner son avis"
  on public.place_reviews for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.places p where p.id = place_id)
  );

create policy "place_reviews: modifier le sien"
  on public.place_reviews for update to authenticated
  using (author_id = (select auth.uid()))
  with check (author_id = (select auth.uid()));

-- L'auteur, ou le créateur du lieu (modération de sa fiche)
create policy "place_reviews: suppression"
  on public.place_reviews for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.places p where p.id = place_id and p.created_by = (select auth.uid()))
  );

revoke update on public.place_reviews from anon, authenticated;
grant update (rating, body, photo_path) on public.place_reviews to authenticated;

-- ---------- Balades : J'aime et commentaires ----------
create table public.ride_likes (
  ride_id uuid not null references public.group_rides (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);

create index ride_likes_user_idx on public.ride_likes (user_id);

alter table public.ride_likes enable row level security;

create policy "ride_likes: lecture"
  on public.ride_likes for select to authenticated
  using (public.can_see_ride(ride_id) and not public.is_blocked_with(user_id));

create policy "ride_likes: aimer"
  on public.ride_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_see_ride(ride_id));

create policy "ride_likes: retirer le sien"
  on public.ride_likes for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.ride_likes from anon, authenticated;

create table public.ride_comments (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.group_rides (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index ride_comments_ride_created_idx on public.ride_comments (ride_id, created_at);
create index ride_comments_author_idx on public.ride_comments (author_id);

alter table public.ride_comments enable row level security;

create policy "ride_comments: lecture"
  on public.ride_comments for select to authenticated
  using (public.can_see_ride(ride_id) and not public.is_blocked_with(author_id));

create policy "ride_comments: commenter"
  on public.ride_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.can_see_ride(ride_id)
    and not exists (select 1 from public.group_rides r where r.id = ride_id and public.is_blocked_with(r.created_by))
  );

create policy "ride_comments: suppression"
  on public.ride_comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_ride_creator(ride_id));

revoke update on public.ride_comments from anon, authenticated;

-- ---------- Stories : J'aime (les réponses partent en message privé) ----------
create table public.story_likes (
  story_id uuid not null references public.stories (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);

create index story_likes_user_idx on public.story_likes (user_id);

alter table public.story_likes enable row level security;

-- Le propriétaire de la story voit qui a aimé ; chacun voit ses propres J'aime
create policy "story_likes: lecture"
  on public.story_likes for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.stories s where s.id = story_id and s.owner_id = (select auth.uid()))
  );

-- La sous-requête passe par la RLS des stories : on n'aime que ce qu'on peut voir
create policy "story_likes: aimer"
  on public.story_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.stories s where s.id = story_id));

create policy "story_likes: retirer le sien"
  on public.story_likes for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.story_likes from anon, authenticated;

-- ---------- Événements et rassemblements ----------
create table public.events (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('rassemblement', 'salon', 'sortie', 'circuit', 'concert', 'autre')),
  title text not null check (char_length(trim(title)) between 3 and 100),
  description text check (char_length(description) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  place_label text not null check (char_length(place_label) between 1 and 200),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  photo_path text check (char_length(photo_path) <= 300),
  max_attendees integer check (max_attendees between 2 and 100000),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at),
  check (ends_at is null or ends_at <= starts_at + interval '14 days')
);

create index events_starts_at_idx on public.events (starts_at);
create index events_created_by_idx on public.events (created_by);

alter table public.events enable row level security;

create policy "events: lecture membres connectés"
  on public.events for select to authenticated
  using (not public.is_blocked_with(created_by));

create policy "events: création"
  on public.events for insert to authenticated
  with check (created_by = (select auth.uid()) and starts_at > now() - interval '1 day');

create policy "events: modification du sien"
  on public.events for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy "events: suppression du sien"
  on public.events for delete to authenticated
  using (created_by = (select auth.uid()));

revoke update on public.events from anon, authenticated;
grant update (kind, title, description, starts_at, ends_at, place_label, latitude, longitude, photo_path, max_attendees)
  on public.events to authenticated;

-- going : j'y vais ; interested : intéressé
create table public.event_attendees (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status text not null default 'going' check (status in ('going', 'interested')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_attendees_user_idx on public.event_attendees (user_id);

alter table public.event_attendees enable row level security;

create policy "event_attendees: lecture"
  on public.event_attendees for select to authenticated
  using (not public.is_blocked_with(user_id));

create policy "event_attendees: inscription"
  on public.event_attendees for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.events e where e.id = event_id));

create policy "event_attendees: changer son statut"
  on public.event_attendees for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "event_attendees: désinscription"
  on public.event_attendees for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid()))
  );

revoke update on public.event_attendees from anon, authenticated;
grant update (status) on public.event_attendees to authenticated;

-- Places limitées (verrou sur l'événement contre les inscriptions simultanées) ; pas d'inscription à un événement fini
create or replace function public.event_attendees_check()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ev record;
  going integer;
begin
  select e.max_attendees, coalesce(e.ends_at, e.starts_at + interval '1 day') as ends
  into ev from public.events e where e.id = new.event_id for update;
  if ev.ends < now() then
    raise exception 'Cet événement est terminé' using errcode = 'P0001';
  end if;
  if new.status <> 'going' or (tg_op = 'UPDATE' and old.status = 'going') or ev.max_attendees is null then
    return new;
  end if;
  select count(*) into going from public.event_attendees a
  where a.event_id = new.event_id and a.status = 'going' and a.user_id <> new.user_id;
  if going >= ev.max_attendees then
    raise exception 'Cet événement est complet' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger event_attendees_check
  before insert or update on public.event_attendees
  for each row execute function public.event_attendees_check();

-- Événements supprimés 30 jours après leur fin ; renvoie les photos à effacer (Edge Function cleanup-rides)
create or replace function public.purge_old_events()
returns table (photo_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    delete from public.events e
    where coalesce(e.ends_at, e.starts_at + interval '1 day') < now() - interval '30 days'
    returning e.photo_path;
end;
$$;

revoke execute on function public.purge_old_events() from public, anon, authenticated;
grant execute on function public.purge_old_events() to service_role;

-- ---------- Signalements : nouveaux contenus ----------
alter table public.content_reports drop constraint if exists content_reports_target_type_check;
alter table public.content_reports
  add constraint content_reports_target_type_check
  check (target_type in ('message', 'story', 'user', 'comment', 'ride_comment', 'place', 'place_review', 'event'));

-- ---------- Badges et défis : statistiques ----------
-- Publiques (badges du profil) : uniquement des totaux. Le détail des cols passés reste privé.
-- Écriture uniquement par le serveur (record_trip, fin de balade).
create table public.rider_stats (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  total_km numeric(10, 1) not null default 0,
  trips integer not null default 0,
  rides_done integer not null default 0,
  passes_count integer not null default 0,
  -- Mois en cours (défis) : remis à zéro au changement de mois
  month text not null default to_char(now() at time zone 'Europe/Paris', 'YYYY-MM'),
  month_km numeric(10, 1) not null default 0,
  month_rides integer not null default 0,
  month_passes integer not null default 0,
  -- Régularité : semaines consécutives avec au moins une sortie
  last_week date,
  week_streak integer not null default 0,
  best_week_streak integer not null default 0,
  active_weeks integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.rider_stats enable row level security;

create policy "rider_stats: lecture membres connectés"
  on public.rider_stats for select to authenticated
  using (not public.is_blocked_with(user_id));

revoke insert, update, delete on public.rider_stats from anon, authenticated;

create table public.rider_passes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  osm_id bigint not null,
  name text not null check (char_length(name) <= 120),
  latitude double precision not null,
  longitude double precision not null,
  elevation_m integer,
  first_at timestamptz not null default now(),
  primary key (user_id, osm_id)
);

alter table public.rider_passes enable row level security;

create policy "rider_passes: lecture des siens"
  on public.rider_passes for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.rider_passes from anon, authenticated;

-- Usage interne : ajoute une sortie aux statistiques
create or replace function public.bump_rider_stats(uid uuid, km numeric, rides integer, passes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  this_month text := to_char(now() at time zone 'Europe/Paris', 'YYYY-MM');
  this_week date := date_trunc('week', now() at time zone 'Europe/Paris')::date;
begin
  insert into public.rider_stats (user_id) values (uid) on conflict do nothing;
  update public.rider_stats s set
    total_km = s.total_km + km,
    trips = s.trips + case when km > 0 then 1 else 0 end,
    rides_done = s.rides_done + rides,
    passes_count = s.passes_count + passes,
    month = this_month,
    month_km = case when s.month = this_month then s.month_km else 0 end + km,
    month_rides = case when s.month = this_month then s.month_rides else 0 end + rides,
    month_passes = case when s.month = this_month then s.month_passes else 0 end + passes,
    week_streak = case
      when s.last_week = this_week then s.week_streak
      when s.last_week = this_week - 7 then s.week_streak + 1
      else 1 end,
    best_week_streak = greatest(s.best_week_streak, case
      when s.last_week = this_week then s.week_streak
      when s.last_week = this_week - 7 then s.week_streak + 1
      else 1 end),
    active_weeks = s.active_weeks + case when s.last_week is distinct from this_week then 1 else 0 end,
    last_week = this_week,
    updated_at = now()
  where s.user_id = uid;
end;
$$;

revoke execute on function public.bump_rider_stats(uuid, numeric, integer, integer) from public, anon, authenticated;

-- Fin d'une navigation (app) : km parcourus et cols franchis (trouvés dans OpenStreetMap).
-- 1500 km au plus par trajet, 30 cols au plus.
create or replace function public.record_trip(p_km numeric, p_passes jsonb default '[]')
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  km numeric := greatest(0, least(coalesce(p_km, 0), 1500));
  added integer := 0;
  pass jsonb;
begin
  if me is null then
    raise exception 'Non connecté' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_passes) = 'array' then
    for pass in select value from jsonb_array_elements(p_passes) limit 30 loop
      insert into public.rider_passes (user_id, osm_id, name, latitude, longitude, elevation_m)
      values (
        me,
        (pass ->> 'id')::bigint,
        left(coalesce(nullif(pass ->> 'name', ''), 'Col'), 120),
        (pass ->> 'lat')::double precision,
        (pass ->> 'lng')::double precision,
        nullif(pass ->> 'ele', '')::numeric::integer
      )
      on conflict do nothing;
      if found then
        added := added + 1;
      end if;
    end loop;
  end if;
  if km > 0 or added > 0 then
    perform public.bump_rider_stats(me, round(km, 1), 0, added);
  end if;
  return added;
end;
$$;

revoke execute on function public.record_trip(numeric, jsonb) from public, anon;
grant execute on function public.record_trip(numeric, jsonb) to authenticated;

-- Balade faite : comptée pour les inscrits quand l'organisateur la termine, ou quand une
-- balade démarrée (depuis plus de 30 min) est supprimée sans avoir été terminée.
create or replace function public.count_ride_done(ride uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  p record;
begin
  for p in select gp.user_id from public.group_ride_participants gp where gp.ride_id = ride and gp.status = 'joined' loop
    perform public.bump_rider_stats(p.user_id, 0, 1, 0);
  end loop;
end;
$$;

revoke execute on function public.count_ride_done(uuid) from public, anon, authenticated;

create or replace function public.group_rides_count_done()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.ended_at is null and new.ended_at is not null and new.started_at is not null then
      perform public.count_ride_done(new.id);
    end if;
    return new;
  end if;
  if old.started_at is not null and old.ended_at is null and old.started_at < now() - interval '30 minutes' then
    perform public.count_ride_done(old.id);
  end if;
  return old;
end;
$$;

revoke execute on function public.group_rides_count_done() from public, anon, authenticated;

create trigger group_rides_count_done_update
  after update of ended_at on public.group_rides
  for each row execute function public.group_rides_count_done();

create trigger group_rides_count_done_delete
  before delete on public.group_rides
  for each row execute function public.group_rides_count_done();

-- ---------- Notifications ----------
create or replace function public.ride_comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ride record;
begin
  select r.created_by, r.title into ride from public.group_rides r where r.id = new.ride_id;
  if ride.created_by is null or ride.created_by = new.author_id then
    return null;
  end if;
  perform public.send_push(array[ride.created_by], 'rides', 'Commentaire sur ' || ride.title,
    public.username_of(new.author_id) || ' : ' || left(new.body, 120), jsonb_build_object('url', '/ride/' || new.ride_id));
  return null;
end;
$$;

revoke execute on function public.ride_comments_notify() from public, anon, authenticated;

create trigger ride_comments_notify
  after insert on public.ride_comments
  for each row execute function public.ride_comments_notify();

create or replace function public.story_likes_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select s.owner_id into owner from public.stories s where s.id = new.story_id;
  if owner is null or owner = new.user_id then
    return null;
  end if;
  perform public.send_push(array[owner], 'friends', 'J''aime sur ta story',
    public.username_of(new.user_id) || ' aime ta story ❤️', jsonb_build_object('url', '/story/' || owner));
  return null;
end;
$$;

revoke execute on function public.story_likes_notify() from public, anon, authenticated;

create trigger story_likes_notify
  after insert on public.story_likes
  for each row execute function public.story_likes_notify();

create or replace function public.place_reviews_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  place record;
begin
  select p.created_by, p.name into place from public.places p where p.id = new.place_id;
  if place.created_by is null or place.created_by = new.author_id then
    return null;
  end if;
  perform public.send_push(array[place.created_by], 'friends', 'Nouvel avis sur ' || place.name,
    public.username_of(new.author_id) || ' : ' || repeat('★', new.rating) || coalesce(' ' || left(new.body, 100), ''),
    jsonb_build_object('url', '/place/' || new.place_id));
  return null;
end;
$$;

revoke execute on function public.place_reviews_notify() from public, anon, authenticated;

create trigger place_reviews_notify
  after insert on public.place_reviews
  for each row execute function public.place_reviews_notify();
