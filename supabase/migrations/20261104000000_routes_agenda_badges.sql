-- =====================================================================
-- Note 40 : routes plaisir notées, agenda moto, badges calculés par le serveur.
--
-- 1) Routes plaisir : une « belle route » (places, kind 'road') peut maintenant porter son
--    tracé (route_line, portion choisie sur un trajet ou tracée sur la carte) ; les avis des
--    routes se notent sur 4 critères (virages, revêtement, paysage, trafic) dont la moyenne
--    donne la note, et acceptent plusieurs photos. JAMAIS de critère de vitesse.
-- 2) Agenda : nouveaux types (balade caritative, bourse, café moto), lien, gratuit / payant,
--    organisateur ; validation légère par l'admin des événements publics (review_status :
--    publiés tout de suite pour les membres de confiance, sinon visibles des amis / invités /
--    membres du club en attendant) ; J'aime + discussion (comme les balades), photos après
--    l'événement ; événements passés archivés 1 an (au lieu de 24 h).
-- 3) Badges : user_badges écrits UNIQUEMENT par le serveur (check_badges), notification à
--    chaque badge obtenu. Jamais de badge lié à la vitesse, au chrono ou aux km en peu de temps.
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Routes plaisir
-- ---------------------------------------------------------------------
-- Tracé [[lat, lng], ...] simplifié par l'app (400 points au plus), longueur en mètres
alter table public.places
  add column route_line jsonb check (
    route_line is null
    or (jsonb_typeof(route_line) = 'array' and jsonb_array_length(route_line) between 2 and 400)
  ),
  add column route_length_m integer check (route_length_m between 100 and 500000);

alter table public.places add constraint places_route_line_road_only check (route_line is null or kind = 'road');

-- Critères d'une route (1 à 5, tous ou aucun) ; trafic : 5 = route tranquille
alter table public.place_reviews
  add column curves smallint check (curves between 1 and 5),
  add column surface smallint check (surface between 1 and 5),
  add column scenery smallint check (scenery between 1 and 5),
  add column traffic smallint check (traffic between 1 and 5),
  -- Photos en plus de photo_path (dossier de l'auteur dans le bucket photos)
  add column more_photos text[] not null default '{}' check (cardinality(more_photos) <= 3);

alter table public.place_reviews add constraint place_reviews_criteria_all_or_none
  check (num_nonnulls(curves, surface, scenery, traffic) in (0, 4));

grant update (curves, surface, scenery, traffic, more_photos) on public.place_reviews to authenticated;

-- Avis d'une route avec critères : la note est leur moyenne (calculée ici, pas par l'app)
create or replace function public.place_reviews_criteria()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if num_nonnulls(new.curves, new.surface, new.scenery, new.traffic) = 4 then
    new.rating := round((new.curves + new.surface + new.scenery + new.traffic) / 4.0);
  end if;
  if exists (select 1 from unnest(new.more_photos) p where p not like new.author_id::text || '/%' or char_length(p) > 300) then
    raise exception 'Photo invalide' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger place_reviews_criteria
  before insert or update on public.place_reviews
  for each row execute function public.place_reviews_criteria();

-- ---------------------------------------------------------------------
-- 2) Agenda
-- ---------------------------------------------------------------------
alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check
  check (kind in ('rassemblement', 'salon', 'sortie', 'circuit', 'concert', 'autre', 'balade', 'caritative', 'bourse', 'cafe'));

alter table public.events
  add column link_url text check (link_url is null or (link_url ~* '^https?://' and char_length(link_url) <= 300)),
  -- Information seulement (aucun paiement dans l'app) : free = gratuit, paid = payant
  add column price_kind text check (price_kind in ('free', 'paid')),
  add column price_text text check (char_length(price_text) <= 60),
  -- Organisateur affiché (« Moto Club du Var ») ; le compte créateur reste created_by
  add column organizer_label text check (char_length(organizer_label) <= 80),
  -- Validation légère : les événements existants sont validés
  add column review_status text not null default 'approved' check (review_status in ('pending', 'approved', 'rejected')),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column review_note text check (char_length(review_note) <= 300);

create index events_review_pending_idx on public.events (created_at) where review_status = 'pending';

grant update (link_url, price_kind, price_text, organizer_label) on public.events to authenticated;

-- Qui voit un événement : validé = tous les membres ; en attente = créateur, admin, amis du
-- créateur, invités, inscrits, membres du club ; refusé = créateur et admin seulement
create or replace function public.can_see_event(p_id uuid, p_creator uuid, p_status text, p_club uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_status = 'approved' then true
    when p_creator = (select auth.uid()) then true
    when public.is_admin() then true
    when p_status = 'rejected' then false
    else (p_club is not null and public.is_club_member(p_club))
      or public.are_friends(p_creator, (select auth.uid()))
      or exists (select 1 from public.event_invites i where i.event_id = p_id and i.user_id = (select auth.uid()))
      or exists (select 1 from public.event_attendees a where a.event_id = p_id and a.user_id = (select auth.uid()))
  end;
$$;

revoke execute on function public.can_see_event(uuid, uuid, text, uuid) from public, anon;
grant execute on function public.can_see_event(uuid, uuid, text, uuid) to authenticated;

drop policy "events: lecture membres connectés" on public.events;
create policy "events: lecture membres connectés"
  on public.events for select to authenticated
  using (not public.is_blocked_with(created_by) and public.can_see_event(id, created_by, review_status, club_id));

-- À la création : publié tout de suite pour un admin ou un membre qui a déjà un événement
-- validé ; sinon en attente (l'admin est prévenu). L'app ne choisit jamais le statut.
create or replace function public.events_review_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.reviewed_at := null;
  new.reviewed_by := null;
  new.review_note := null;
  if public.is_admin()
     or exists (select 1 from public.events e where e.created_by = new.created_by and e.review_status = 'approved') then
    new.review_status := 'approved';
  else
    new.review_status := 'pending';
  end if;
  return new;
end;
$$;

revoke execute on function public.events_review_on_insert() from public, anon, authenticated;

create trigger events_review_on_insert
  before insert on public.events
  for each row execute function public.events_review_on_insert();

create or replace function public.events_review_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admins uuid[];
begin
  if new.review_status <> 'pending' then
    return null;
  end if;
  select coalesce(array_agg(a.user_id), '{}') into admins from public.app_admins a;
  perform public.notify_many(admins, 'event_review', new.created_by, 'event', new.id,
    public.username_of(new.created_by) || ' propose l''événement « ' || new.title || ' » : à valider', '/admin?tab=agenda');
  perform public.send_push(admins, 'admin', 'Événement à valider',
    '@' || public.username_of(new.created_by) || ' : « ' || new.title || ' »', jsonb_build_object('url', '/admin?tab=agenda'));
  return null;
end;
$$;

revoke execute on function public.events_review_notify() from public, anon, authenticated;

create trigger events_review_notify
  after insert on public.events
  for each row execute function public.events_review_notify();

-- Console › Agenda : file d'attente
create or replace function public.admin_event_queue()
returns table (
  id uuid,
  kind text,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  place_label text,
  photo_path text,
  link_url text,
  organizer_label text,
  created_at timestamptz,
  created_by uuid,
  username text,
  creator_events bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
    select e.id, e.kind, e.title, e.description, e.starts_at, e.ends_at, e.place_label, e.photo_path, e.link_url,
      e.organizer_label, e.created_at, e.created_by, p.username,
      (select count(*) from public.events x where x.created_by = e.created_by)
    from public.events e
    join public.profiles p on p.id = e.created_by
    where e.review_status = 'pending'
    order by e.starts_at
    limit 200;
end;
$$;

create or replace function public.admin_review_event(p_id uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  note text := nullif(left(trim(coalesce(p_note, '')), 300), '');
begin
  perform public.assert_admin();
  update public.events
  set review_status = case when p_approve then 'approved' else 'rejected' end,
      reviewed_at = now(), reviewed_by = (select auth.uid()), review_note = note
  where events.id = p_id
  returning events.created_by, events.title into e;
  if e.created_by is null then
    raise exception 'Événement introuvable' using errcode = 'P0001';
  end if;
  delete from public.notifications where type = 'event_review' and target_id = p_id and user_id in (select a.user_id from public.app_admins a);
  perform public.notify(e.created_by, 'event_review', null, 'event', p_id,
    case when p_approve
      then 'Ton événement « ' || e.title || ' » est validé : il est visible par tous les membres.'
      else 'Ton événement « ' || e.title || ' » n''a pas été validé' || coalesce(' : ' || note, '.') end,
    '/event/' || p_id);
end;
$$;

revoke execute on function public.admin_event_queue(), public.admin_review_event(uuid, boolean, text) from public, anon;
grant execute on function public.admin_event_queue(), public.admin_review_event(uuid, boolean, text) to authenticated;

-- Rappel la veille : jamais pour un événement refusé
create or replace function public.send_event_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  attendees uuid[];
begin
  for e in
    select * from public.events
    where starts_at > now() + interval '23 hours' and starts_at <= now() + interval '24 hours'
      and review_status <> 'rejected'
  loop
    insert into public.push_log (key) values ('event-reminder:' || e.id || ':' || e.starts_at) on conflict do nothing;
    if not found then
      continue;
    end if;
    select coalesce(array_agg(a.user_id), '{}') into attendees from public.event_attendees a where a.event_id = e.id;
    perform public.send_push(attendees, 'rides', 'Demain : ' || e.title,
      'Rendez-vous ' || public.fr_date(e.starts_at) || ' à ' || to_char(e.starts_at at time zone 'Europe/Paris', 'HH24"h"MI') || ' · ' || e.place_label,
      jsonb_build_object('url', '/event/' || e.id));
    perform public.notify_many(attendees, 'event_reminder', null, 'event', e.id,
      'Rappel : « ' || e.title || ' » demain à ' || to_char(e.starts_at at time zone 'Europe/Paris', 'HH24"h"MI'), '/event/' || e.id);
  end loop;
end;
$$;

-- J'aime et discussion (même composant que les balades)
create table public.event_likes (
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_likes_user_idx on public.event_likes (user_id);

alter table public.event_likes enable row level security;

create policy "event_likes: lecture"
  on public.event_likes for select to authenticated
  using (not public.is_blocked_with(user_id) and exists (select 1 from public.events e where e.id = event_id));

create policy "event_likes: aimer"
  on public.event_likes for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.events e where e.id = event_id));

create policy "event_likes: retirer le sien"
  on public.event_likes for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.event_likes from anon, authenticated;

create table public.event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index event_comments_event_created_idx on public.event_comments (event_id, created_at);
create index event_comments_author_idx on public.event_comments (author_id);

alter table public.event_comments enable row level security;

create policy "event_comments: lecture"
  on public.event_comments for select to authenticated
  using (not public.is_blocked_with(author_id) and exists (select 1 from public.events e where e.id = event_id));

create policy "event_comments: commenter"
  on public.event_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id and not public.is_blocked_with(e.created_by))
  );

-- L'auteur, ou l'organisateur (modération de sa fiche)
create policy "event_comments: suppression"
  on public.event_comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid()))
  );

revoke update on public.event_comments from anon, authenticated;

create or replace function public.notif_event_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
begin
  select created_by, title into e from public.events where id = new.event_id;
  perform public.notify(e.created_by, 'comment', new.author_id, 'event', new.event_id,
    public.username_of(new.author_id) || ' a commenté ton événement « ' || e.title || ' » : ' || left(new.body, 100), '/event/' || new.event_id);
  return new;
end;
$$;

revoke execute on function public.notif_event_comment() from public, anon, authenticated;

create trigger notif_event_comment after insert on public.event_comments
  for each row execute function public.notif_event_comment();

-- Photos partagées après l'événement (à partir du début), par les inscrits et l'organisateur
create table public.event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  photo_path text not null check (char_length(photo_path) <= 300),
  created_at timestamptz not null default now(),
  check (photo_path like author_id::text || '/%')
);

create index event_photos_event_idx on public.event_photos (event_id, created_at);
create index event_photos_author_idx on public.event_photos (author_id);

alter table public.event_photos enable row level security;

create policy "event_photos: lecture"
  on public.event_photos for select to authenticated
  using (not public.is_blocked_with(author_id) and exists (select 1 from public.events e where e.id = event_id));

create policy "event_photos: ajout"
  on public.event_photos for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.events e
      where e.id = event_id and e.starts_at <= now() and e.review_status <> 'rejected'
        and (e.created_by = (select auth.uid())
             or exists (select 1 from public.event_attendees a where a.event_id = e.id and a.user_id = (select auth.uid())))
    )
  );

create policy "event_photos: suppression"
  on public.event_photos for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.events e where e.id = event_id and e.created_by = (select auth.uid()))
  );

revoke update on public.event_photos from anon, authenticated;

-- 12 photos au plus par membre et par événement
create or replace function public.event_photos_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.event_photos p where p.event_id = new.event_id and p.author_id = new.author_id) >= 12 then
    raise exception 'Tu as déjà partagé 12 photos de cet événement' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke execute on function public.event_photos_limit() from public, anon, authenticated;

create trigger event_photos_limit before insert on public.event_photos
  for each row execute function public.event_photos_limit();

-- Événements passés : archivés 1 an, puis supprimés avec leurs photos (Edge Function cleanup-rides)
create or replace function public.purge_old_events()
returns table (photo_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
    select p.photo_path from public.event_photos p
    join public.events e on e.id = p.event_id
    where coalesce(e.ends_at, e.starts_at + interval '1 day') < now() - interval '365 days';
  return query
    delete from public.events e
    where coalesce(e.ends_at, e.starts_at + interval '1 day') < now() - interval '365 days'
    returning e.photo_path;
end;
$$;

-- Signalements : photos et commentaires d'événements
alter table public.content_reports drop constraint content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check
  check (target_type in ('message', 'story', 'user', 'comment', 'ride_comment', 'place', 'place_review', 'event', 'photo',
    'club', 'club_post', 'news_comment', 'event_comment', 'event_photo'));

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
        when 'event_comment' then (select left(ec.body, 200) from public.event_comments ec where ec.id = r.id)
        when 'event_photo' then (select 'Photo de « ' || e.title || ' »' from public.event_photos ep join public.events e on e.id = ep.event_id where ep.id = r.id)
        when 'photo' then (select coalesce(w.caption, 'Photo du mur') from public.wall_photos w where w.id = r.id)
        when 'comment' then (select left(wc.body, 200) from public.wall_photo_comments wc where wc.id = r.id)
        when 'ride_comment' then (select left(rc.body, 200) from public.ride_comments rc where rc.id = r.id)
        when 'news_comment' then (select left(nc.body, 200) from public.news_comments nc where nc.id = r.id)
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
        when 'event_comment' then (select ec.author_id from public.event_comments ec where ec.id = r.id)
        when 'event_photo' then (select ep.author_id from public.event_photos ep where ep.id = r.id)
        when 'photo' then (select w.owner_id from public.wall_photos w where w.id = r.id)
        when 'comment' then (select wc.author_id from public.wall_photo_comments wc where wc.id = r.id)
        when 'ride_comment' then (select rc.author_id from public.ride_comments rc where rc.id = r.id)
        when 'news_comment' then (select nc.author_id from public.news_comments nc where nc.id = r.id)
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
    when 'event_comment' then delete from public.event_comments where id = p_id;
    when 'event_photo' then delete from public.event_photos where id = p_id;
    when 'photo' then delete from public.wall_photos where id = p_id;
    when 'comment' then delete from public.wall_photo_comments where id = p_id;
    when 'ride_comment' then delete from public.ride_comments where id = p_id;
    when 'news_comment' then delete from public.news_comments where id = p_id;
    when 'story' then delete from public.stories where id = p_id;
    when 'club' then delete from public.clubs where id = p_id;
    when 'club_post' then delete from public.club_posts where id = p_id;
    else raise exception 'Suppression impossible pour ce type (utilise la suspension pour un compte)' using errcode = 'P0001';
  end case;
  delete from public.content_reports where target_type = p_type and target_id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Badges (serveur uniquement)
-- ---------------------------------------------------------------------
alter table public.rider_stats
  add column rides_organized integer not null default 0,
  add column dangers_confirmed integer not null default 0,
  add column events_attended integer not null default 0,
  add column roads_rated integer not null default 0;

-- Une seule fois par objet (balade, danger, événement) : jamais compté deux fois
create table public.rider_counted (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('ride_organized', 'danger_confirmed', 'event_attended')),
  ref uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, ref)
);

alter table public.rider_counted enable row level security;
-- Aucune règle : rien n'est lisible ni modifiable depuis l'app
revoke all on public.rider_counted from anon, authenticated;

create table public.user_badges (
  user_id uuid not null references public.profiles (id) on delete cascade,
  badge_id text not null check (char_length(badge_id) <= 40),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index user_badges_recent_idx on public.user_badges (user_id, unlocked_at desc);

alter table public.user_badges enable row level security;

-- Vitrine publique du profil (comme rider_stats) ; écriture par le serveur uniquement
create policy "user_badges: lecture membres connectés"
  on public.user_badges for select to authenticated
  using (not public.is_blocked_with(user_id));

revoke insert, update, delete on public.user_badges from anon, authenticated;

-- Catalogue (mêmes identifiants que src/lib/badges.ts)
create or replace function public.badge_label(p_id text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_id
    when 'km-100' then 'Premiers tours de roue'
    when 'km-1000' then 'Mille bornes'
    when 'km-5000' then 'Grand rouleur'
    when 'km-10000' then 'Bouffeur de bitume'
    when 'km-25000' then 'Tour du monde en vue'
    when 'rides-1' then 'Première balade'
    when 'rides-5' then 'Habitué du groupe'
    when 'rides-10' then 'Pilier des sorties'
    when 'rides-25' then 'Capitaine de route'
    when 'rides-50' then 'Légende des balades'
    when 'passes-1' then 'Premier col'
    when 'passes-5' then 'Grimpeur'
    when 'passes-10' then 'Chasseur de cols'
    when 'passes-25' then 'Roi de la montagne'
    when 'streak-4' then 'Régulier'
    when 'streak-12' then 'Fidèle au guidon'
    when 'streak-26' then 'Toute l’année'
    when 'organizer-1' then 'Organisateur'
    when 'guide-5' then 'Guide'
    when 'sentinel-10' then 'Sentinelle'
    when 'critic-5' then 'Critique routier'
    when 'party-3' then 'Fêtard'
    when 'mechanic' then 'Mécano'
    when 'founder' then 'Membre fondateur'
    else p_id
  end;
$$;

-- Usage interne : badge obtenu (notification sauf rattrapage silencieux)
create or replace function public.award_badge(p_user uuid, p_badge text, p_silent boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_badges (user_id, badge_id) values (p_user, p_badge) on conflict do nothing;
  if not found then
    return false;
  end if;
  if not p_silent then
    perform public.notify(p_user, 'badge', null, 'badge', null, 'Nouveau badge : ' || public.badge_label(p_badge) || ' 🎉', '/badges');
  end if;
  return true;
end;
$$;

revoke execute on function public.award_badge(uuid, text, boolean) from public, anon, authenticated;

-- Carnet à jour : moto principale avec au moins un entretien noté depuis 12 mois, au moins un
-- rappel, et aucun rappel dépassé (km ou date) — même calcul que check_maintenance_reminders
create or replace function public.garage_up_to_date(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with main as (
    select m.id from public.motorcycles m where m.owner_id = p_user and m.is_main limit 1
  )
  select exists (select 1 from main)
    and exists (select 1 from public.maintenance_records r join main on main.id = r.motorcycle_id
                where r.done_on >= current_date - interval '12 months')
    and exists (select 1 from public.maintenance_plans p join main on main.id = p.motorcycle_id)
    and not exists (
      select 1 from public.maintenance_plans p
      join main on main.id = p.motorcycle_id
      left join public.motorcycle_garage g on g.motorcycle_id = p.motorcycle_id
      where (p.every_km is not null and p.base_km is not null and g.odometer_km is not null
             and p.base_km + p.every_km - g.odometer_km <= 0)
         or (p.due_on is not null and p.due_on < current_date)
         or (p.due_on is null and p.every_months is not null
             and (p.base_on + make_interval(months => p.every_months))::date < current_date)
    );
$$;

revoke execute on function public.garage_up_to_date(uuid) from public, anon, authenticated;

-- Calcule et attribue tous les badges mérités. Renvoie le nombre de nouveaux badges.
create or replace function public.check_badges(p_user uuid, p_silent boolean default false)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.rider_stats;
  roads integer;
  added integer := 0;
  b record;
begin
  if p_user is null then
    return 0;
  end if;
  -- Routes notées (avec critères) : compte réel, gardé dans les statistiques pour la progression
  select count(*) into roads from public.place_reviews r join public.places p on p.id = r.place_id
  where r.author_id = p_user and p.kind = 'road' and r.curves is not null;
  insert into public.rider_stats (user_id) values (p_user) on conflict do nothing;
  update public.rider_stats set roads_rated = roads where user_id = p_user and roads_rated <> roads;
  select * into s from public.rider_stats where user_id = p_user;

  for b in
    select x.id, x.ok from (values
      ('km-100', s.total_km >= 100), ('km-1000', s.total_km >= 1000), ('km-5000', s.total_km >= 5000),
      ('km-10000', s.total_km >= 10000), ('km-25000', s.total_km >= 25000),
      ('rides-1', s.rides_done >= 1), ('rides-5', s.rides_done >= 5), ('rides-10', s.rides_done >= 10),
      ('rides-25', s.rides_done >= 25), ('rides-50', s.rides_done >= 50),
      ('passes-1', s.passes_count >= 1), ('passes-5', s.passes_count >= 5), ('passes-10', s.passes_count >= 10),
      ('passes-25', s.passes_count >= 25),
      ('streak-4', s.best_week_streak >= 4), ('streak-12', s.best_week_streak >= 12), ('streak-26', s.best_week_streak >= 26),
      ('organizer-1', exists (select 1 from public.group_rides g where g.created_by = p_user) or s.rides_organized >= 1),
      ('guide-5', s.rides_organized >= 5),
      ('sentinel-10', s.dangers_confirmed >= 10),
      ('critic-5', roads >= 5),
      ('party-3', s.events_attended >= 3),
      ('founder', exists (select 1 from public.founding_members f where f.user_id = p_user))
    ) as x (id, ok)
    where x.ok and not exists (select 1 from public.user_badges u where u.user_id = p_user and u.badge_id = x.id)
  loop
    if public.award_badge(p_user, b.id, p_silent) then
      added := added + 1;
    end if;
  end loop;
  -- Mécano : calcul plus lourd, seulement s'il manque encore
  if not exists (select 1 from public.user_badges u where u.user_id = p_user and u.badge_id = 'mechanic')
     and public.garage_up_to_date(p_user) then
    if public.award_badge(p_user, 'mechanic', p_silent) then
      added := added + 1;
    end if;
  end if;
  return added;
end;
$$;

revoke execute on function public.check_badges(uuid, boolean) from public, anon, authenticated;

-- Pour l'app : revérifie MES badges (rien n'est écrit sans être mérité). Renvoie les nouveaux.
create or replace function public.refresh_my_badges()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return 0;
  end if;
  return public.check_badges((select auth.uid()));
end;
$$;

revoke execute on function public.refresh_my_badges() from public, anon;
grant execute on function public.refresh_my_badges() to authenticated;

-- Statistiques : chaque sortie revérifie les badges
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
  perform public.check_badges(uid);
end;
$$;

-- Compteur unique (balade organisée, danger confirmé, événement) puis badges
create or replace function public.bump_rider_counter(p_user uuid, p_kind text, p_ref uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.rider_counted (user_id, kind, ref) values (p_user, p_kind, p_ref) on conflict do nothing;
  if not found then
    return;
  end if;
  insert into public.rider_stats (user_id) values (p_user) on conflict do nothing;
  update public.rider_stats set
    rides_organized = rides_organized + case when p_kind = 'ride_organized' then 1 else 0 end,
    dangers_confirmed = dangers_confirmed + case when p_kind = 'danger_confirmed' then 1 else 0 end,
    events_attended = events_attended + case when p_kind = 'event_attended' then 1 else 0 end,
    updated_at = now()
  where user_id = p_user;
  perform public.check_badges(p_user);
end;
$$;

revoke execute on function public.bump_rider_counter(uuid, text, uuid) from public, anon, authenticated;

-- Première balade créée : badge Organisateur
create or replace function public.badges_on_ride_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.check_badges(new.created_by);
  return null;
end;
$$;

revoke execute on function public.badges_on_ride_created() from public, anon, authenticated;

create trigger badges_on_ride_created after insert on public.group_rides
  for each row execute function public.badges_on_ride_created();

-- Balade organisée (Guide) : terminée avec au moins un autre participant présent
-- (check-in au RDV ou localisé pendant la balade, comme les points)
create or replace function public.badges_on_ride_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.ended_at is not null or new.ended_at is null or new.started_at is null then
    return null;
  end if;
  if exists (
    select 1 from public.group_ride_participants gp
    where gp.ride_id = new.id and gp.status = 'joined' and gp.user_id <> new.created_by
      and (gp.checked_in_at is not null
           or exists (select 1 from public.convoy_tracking t where t.ride_id = new.id and t.user_id = gp.user_id))
  ) then
    perform public.bump_rider_counter(new.created_by, 'ride_organized', new.id);
  end if;
  return null;
end;
$$;

revoke execute on function public.badges_on_ride_end() from public, anon, authenticated;

create trigger badges_on_ride_end after update of ended_at on public.group_rides
  for each row execute function public.badges_on_ride_end();

-- Danger confirmé par un AUTRE motard (Sentinelle) : une fois par signalement
create or replace function public.badges_on_report_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  author uuid;
begin
  if new.vote <> 'still_there' then
    return null;
  end if;
  select r.created_by into author from public.road_reports r where r.id = new.report_id;
  if author is null or author = new.user_id then
    return null;
  end if;
  perform public.bump_rider_counter(author, 'danger_confirmed', new.report_id);
  return null;
end;
$$;

revoke execute on function public.badges_on_report_vote() from public, anon, authenticated;

create trigger badges_on_report_vote
  after insert or update of vote on public.road_report_votes
  for each row execute function public.badges_on_report_vote();

-- Route notée (Critique routier)
create or replace function public.badges_on_place_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.curves is not null then
    perform public.check_badges(new.author_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.badges_on_place_review() from public, anon, authenticated;

create trigger badges_on_place_review
  after insert or update of curves on public.place_reviews
  for each row execute function public.badges_on_place_review();

-- Carnet d'entretien (Mécano)
create or replace function public.badges_on_garage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.check_badges(new.owner_id);
  return null;
end;
$$;

revoke execute on function public.badges_on_garage() from public, anon, authenticated;

create trigger badges_on_maintenance_record after insert or update on public.maintenance_records
  for each row execute function public.badges_on_garage();
create trigger badges_on_maintenance_plan after insert or update on public.maintenance_plans
  for each row execute function public.badges_on_garage();
create trigger badges_on_garage_odometer after update of odometer_km on public.motorcycle_garage
  for each row execute function public.badges_on_garage();

-- Membre fondateur
create or replace function public.badges_on_founder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.award_badge(new.user_id, 'founder', true);
  return null;
end;
$$;

revoke execute on function public.badges_on_founder() from public, anon, authenticated;

create trigger badges_on_founder after insert on public.founding_members
  for each row execute function public.badges_on_founder();

-- Événements terminés (Fêtard) : chaque heure, les inscrits « J'y vais » des événements validés
-- finis depuis moins de 7 jours
create or replace function public.count_finished_events()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
begin
  for a in
    select at.user_id, e.id from public.events e
    join public.event_attendees at on at.event_id = e.id and at.status = 'going'
    where e.review_status = 'approved'
      and coalesce(e.ends_at, e.starts_at + interval '6 hours') < now()
      and coalesce(e.ends_at, e.starts_at + interval '6 hours') > now() - interval '7 days'
      and not exists (select 1 from public.rider_counted c where c.user_id = at.user_id and c.kind = 'event_attended' and c.ref = e.id)
  loop
    perform public.bump_rider_counter(a.user_id, 'event_attended', a.id);
  end loop;
end;
$$;

revoke execute on function public.count_finished_events() from public, anon, authenticated;

select cron.schedule('events-finished', '27 * * * *', $$ select public.count_finished_events(); $$);

-- Notifications : nouveaux types
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'like', 'comment', 'friend_request', 'friend_accepted', 'ride_invite', 'event_invite', 'event_response',
  'event_reminder', 'message', 'place_new', 'place_review', 'convoy', 'regroup', 'sos',
  'referral', 'club_request', 'club_accepted', 'reaction', 'group_added', 'passenger', 'store_launch',
  'weather', 'badge', 'event_review'
));

-- Rattrapage silencieux : badges déjà mérités par les membres actuels (sans notification)
do $$
declare
  u record;
begin
  for u in
    select user_id from public.rider_stats
    union select user_id from public.founding_members
    union select created_by from public.group_rides
  loop
    perform public.check_badges(u.user_id, true);
  end loop;
end;
$$;
