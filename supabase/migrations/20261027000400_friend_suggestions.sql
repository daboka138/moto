-- =====================================================================
-- « Motards que tu pourrais connaître » dans le Mur (note 19, point 8)
-- Critères : amis d'amis, mêmes clubs, mêmes balades / événements, même ville (profil public),
-- même zone de découverte (seulement si les deux ont activé « Rouler ensemble »), même catégorie
-- de moto (petit bonus). JAMAIS de position : seulement la raison (« 3 amis en commun »).
-- Exclus : moi, amis et demandes en cours, blocages (dans les deux sens), mode fantôme, comptes
-- suspendus, ceux qui ont coupé « Apparaître dans les suggestions », ceux que j'ai écartés (✕).
-- =====================================================================

-- Réglage privé (Paramètres › Confidentialité), activé par défaut
alter table public.profile_private add column if not exists in_suggestions boolean not null default true;

create or replace function public.set_in_suggestions(p_enabled boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profile_private set in_suggestions = p_enabled where user_id = (select auth.uid());
$$;

-- « ✕ ne plus suggérer » : privé, propriétaire seulement
create table if not exists public.friend_suggestion_dismissals (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, target_id)
);

alter table public.friend_suggestion_dismissals enable row level security;

create policy "friend_suggestion_dismissals: propriétaire"
  on public.friend_suggestion_dismissals for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.friend_suggestions(p_limit integer default 15)
returns table (
  id uuid,
  username text,
  avatar_path text,
  moto_label text,
  mutual_friends integer,
  same_club boolean,
  shared_rides integer,
  same_city boolean,
  reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as uid),
  my_friends as (
    select case when f.requester_id = me.uid then f.addressee_id else f.requester_id end as fid
    from public.friendships f, me
    where f.status = 'accepted' and me.uid in (f.requester_id, f.addressee_id)
  ),
  linked as (
    -- amis et demandes en cours, dans les deux sens
    select case when f.requester_id = me.uid then f.addressee_id else f.requester_id end as uid
    from public.friendships f, me
    where me.uid in (f.requester_id, f.addressee_id)
  ),
  mutual as (
    select case when f.requester_id = mf.fid then f.addressee_id else f.requester_id end as uid, count(*)::integer as n
    from public.friendships f
    join my_friends mf on mf.fid in (f.requester_id, f.addressee_id)
    where f.status = 'accepted'
    group by 1
  ),
  clubs as (
    select distinct o.user_id as uid
    from public.club_members m
    join public.club_members o on o.club_id = m.club_id and o.status = 'member'
    join public.clubs c on c.id = m.club_id and c.hidden_at is null
    , me
    where m.user_id = me.uid and m.status = 'member'
  ),
  rides as (
    select o.user_id as uid, count(distinct o.ride_id)::integer as n
    from public.group_ride_participants m
    join public.group_ride_participants o on o.ride_id = m.ride_id and o.status = 'joined'
    , me
    where m.user_id = me.uid and m.status = 'joined'
    group by 1
  ),
  events as (
    select o.user_id as uid, count(distinct o.event_id)::integer as n
    from public.event_attendees m
    join public.event_attendees o on o.event_id = m.event_id
    , me
    where m.user_id = me.uid
    group by 1
  ),
  my_profile as (
    select nullif(public.fold_text(trim(p.city)), '') as city,
      (select mo.category from public.motorcycles mo where mo.owner_id = p.id and mo.is_main limit 1) as category
    from public.profiles p, me where p.id = me.uid
  ),
  my_area as (
    select d.area_lat, d.area_lng from public.rider_discovery d, me
    where d.user_id = me.uid and d.discoverable and d.area_lat is not null
  ),
  candidates as (
    select
      p.id, p.username, p.avatar_path,
      (select mo.brand || ' ' || mo.model from public.motorcycles mo where mo.owner_id = p.id order by mo.is_main desc, mo.created_at limit 1) as moto_label,
      coalesce(mu.n, 0) as mutual_friends,
      cl.uid is not null as same_club,
      coalesce(r.n, 0) as shared_rides,
      coalesce(e.n, 0) as shared_events,
      (mp.city is not null and public.fold_text(trim(p.city)) = mp.city) as same_city,
      exists (
        select 1 from public.rider_discovery d, my_area a
        where d.user_id = p.id and d.discoverable and d.area_lat is not null
          and abs(d.area_lat - a.area_lat) <= 0.3 and abs(d.area_lng - a.area_lng) <= 0.4
      ) as same_area,
      (mp.category is not null and exists (
        select 1 from public.motorcycles mo where mo.owner_id = p.id and mo.is_main and mo.category = mp.category
      )) as same_category
    from public.profiles p
    cross join me
    cross join my_profile mp
    left join mutual mu on mu.uid = p.id
    left join clubs cl on cl.uid = p.id
    left join rides r on r.uid = p.id
    left join events e on e.uid = p.id
    where p.id <> me.uid
      and me.uid is not null
      and not exists (select 1 from linked l where l.uid = p.id)
      and not exists (select 1 from public.friend_suggestion_dismissals x where x.user_id = me.uid and x.target_id = p.id)
      and not public.is_blocked_between(me.uid, p.id)
      and coalesce((select pp.in_suggestions from public.profile_private pp where pp.user_id = p.id), true)
      and coalesce((select lp.mode from public.location_privacy lp where lp.user_id = p.id), 'friends') <> 'ghost'
      and not exists (select 1 from auth.users u where u.id = p.id and u.banned_until is not null and u.banned_until > now())
  ),
  scored as (
    select c.*,
      c.mutual_friends * 3 + (case when c.same_club then 4 else 0 end) + least(c.shared_rides, 3) * 3
        + least(c.shared_events, 3) * 2 + (case when c.same_city then 2 else 0 end)
        + (case when c.same_area then 2 else 0 end) + (case when c.same_category then 1 else 0 end) as score
    from candidates c
  )
  select s.id, s.username, s.avatar_path, s.moto_label, s.mutual_friends, s.same_club, s.shared_rides, s.same_city,
    case
      when s.mutual_friends > 0 then s.mutual_friends || ' ami' || case when s.mutual_friends > 1 then 's' else '' end || ' en commun'
      when s.same_club then 'Même club'
      when s.shared_rides > 0 then 'Balade en commun'
      when s.shared_events > 0 then 'Même événement'
      when s.same_city then 'Même ville'
      when s.same_area then 'Roule près de chez toi'
      else 'Même catégorie de moto'
    end as reason
  from scored s
  where s.score >= 2
  order by s.score desc, random()
  limit least(greatest(coalesce(p_limit, 15), 1), 30);
$$;

revoke all on function public.friend_suggestions(integer) from public, anon;
revoke all on function public.set_in_suggestions(boolean) from public, anon;
grant execute on function public.friend_suggestions(integer) to authenticated;
grant execute on function public.set_in_suggestions(boolean) to authenticated;
