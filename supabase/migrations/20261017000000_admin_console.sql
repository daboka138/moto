-- =====================================================================
-- Console développeur (admin)
-- - app_admins : qui est admin. Aucune règle RLS pour les membres : personne ne peut s'y
--   ajouter. Ajout UNIQUEMENT côté serveur avec grant_admin(email) (SQL Editor / CLI), car la
--   confirmation d'email est désactivée sur le projet : un rôle donné automatiquement à une
--   adresse pourrait être volé par quelqu'un qui s'inscrit avec elle.
-- - is_admin() : security definer, utilisé par toutes les fonctions admin_* (sinon erreur)
-- - user_entitlements : premium (premium à vie pour l'admin), lisible par son seul titulaire,
--   écrit par le serveur uniquement. has_premium() pour le futur abonnement.
-- - Console : compteurs, inscriptions par jour, inscrits (pseudo, email, dates, ville,
--   plateforme), modération des contenus signalés, suspension de compte, SMS envoyés.
--   JAMAIS de position, trajet, message privé ni numéro de contact d'urgence.
-- - Push à l'admin à chaque inscription (désactivable dans la console)
-- Appliquée avec : npx supabase db push
-- =====================================================================

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  notify_signups boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create table public.user_entitlements (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  lifetime_premium boolean not null default false,
  premium_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_entitlements enable row level security;

create policy "user_entitlements: lecture du sien"
  on public.user_entitlements for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.user_entitlements from anon, authenticated;

-- Comptes suspendus (historique pour la console ; le blocage réel est auth.users.banned_until)
create table public.account_suspensions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  suspended_by uuid references auth.users (id) on delete set null,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now()
);

alter table public.account_suspensions enable row level security;
revoke all on public.account_suspensions from anon, authenticated;

-- Photos du mur signalables (modération des « posts »)
alter table public.content_reports drop constraint content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check
  check (target_type in ('message', 'story', 'user', 'comment', 'ride_comment', 'place', 'place_review', 'event', 'photo'));

-- ---------- Rôles ----------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins a where a.user_id = (select auth.uid()));
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function public.assert_admin() from public, anon, authenticated;

create or replace function public.has_premium(p_user uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_entitlements e
    where e.user_id = coalesce(p_user, (select auth.uid()))
      and (e.lifetime_premium or e.premium_until > now())
  );
$$;

revoke execute on function public.has_premium(uuid) from public, anon;
grant execute on function public.has_premium(uuid) to authenticated;

-- À lancer à la main (SQL Editor ou CLI) une fois le compte créé : admin + premium à vie
create or replace function public.grant_admin(p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then
    raise exception 'Aucun compte avec cet email' using errcode = 'P0001';
  end if;
  insert into public.app_admins (user_id) values (uid) on conflict do nothing;
  insert into public.user_entitlements (user_id, lifetime_premium) values (uid, true)
  on conflict (user_id) do update set lifetime_premium = true, updated_at = now();
  return uid;
end;
$$;

revoke execute on function public.grant_admin(text) from public, anon, authenticated;

-- ---------- Console : compteurs ----------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform public.assert_admin();
  with seen as (
    select u.id, greatest(u.last_sign_in_at, (select max(coalesce(s.refreshed_at, s.updated_at, s.created_at)) from auth.sessions s where s.user_id = u.id)) as at
    from auth.users u
  )
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'new_today', (select count(*) from public.profiles p where p.created_at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'),
    'new_7d', (select count(*) from public.profiles p where p.created_at > now() - interval '7 days'),
    'new_30d', (select count(*) from public.profiles p where p.created_at > now() - interval '30 days'),
    'active_24h', (select count(*) from seen where seen.at > now() - interval '24 hours'),
    'active_7d', (select count(*) from seen where seen.at > now() - interval '7 days'),
    'rides', (select count(*) from public.group_rides),
    'events', (select count(*) from public.events),
    'places', (select count(*) from public.places),
    'posts', (select count(*) from public.wall_photos),
    'suspended', (select count(*) from public.account_suspensions),
    'sms_today', (select count(*) from public.sms_log s where s.status = 'sent'
                   and s.created_at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'),
    'sms_7d', (select count(*) from public.sms_log s where s.status = 'sent' and s.created_at > now() - interval '7 days'),
    'sms_30d', (select count(*) from public.sms_log s where s.status = 'sent' and s.created_at > now() - interval '30 days'),
    'sms_errors_7d', (select count(*) from public.sms_log s where s.status = 'error' and s.created_at > now() - interval '7 days'),
    -- Inscriptions par jour, 30 derniers jours (heure de Paris), jours sans inscription compris
    'signups', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day)
      from generate_series((now() at time zone 'Europe/Paris')::date - 29, (now() at time zone 'Europe/Paris')::date, interval '1 day') as d(day)
      left join (
        select (p.created_at at time zone 'Europe/Paris')::date as day, count(*) as n
        from public.profiles p
        where p.created_at > now() - interval '31 days'
        group by 1
      ) c on c.day = d.day::date
    ),
    'notify_signups', (select a.notify_signups from public.app_admins a where a.user_id = (select auth.uid()))
  ) into result;
  return result;
end;
$$;

-- ---------- Console : inscrits ----------
create or replace function public.admin_users(p_query text default null, p_limit integer default 50, p_offset integer default 0)
returns table (
  id uuid,
  username text,
  avatar_path text,
  email text,
  created_at timestamptz,
  last_seen timestamptz,
  city text,
  platform text,
  suspended boolean,
  is_admin boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
    select p.id, p.username, p.avatar_path, u.email::text, p.created_at,
      greatest(u.last_sign_in_at, ls.at),
      p.city,
      case
        when ls.user_agent is null then null
        when ls.user_agent ilike '%okhttp%' or ls.user_agent ilike '%android%' and ls.user_agent not ilike '%mozilla%' then 'Android'
        when ls.user_agent ilike '%mozilla%' then 'Web'
        else 'Autre'
      end,
      exists (select 1 from public.account_suspensions s where s.user_id = p.id),
      exists (select 1 from public.app_admins a where a.user_id = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    left join lateral (
      select coalesce(s.refreshed_at, s.updated_at, s.created_at) as at, s.user_agent
      from auth.sessions s where s.user_id = p.id
      order by coalesce(s.refreshed_at, s.updated_at, s.created_at) desc nulls last
      limit 1
    ) ls on true
    where p_query is null or trim(p_query) = ''
       or p.username ilike '%' || trim(p_query) || '%'
       or u.email ilike '%' || trim(p_query) || '%'
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 200) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;

-- ---------- Console : contenus signalés (jamais les messages privés) ----------
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
      end,
      a.author,
      (select pa.username from public.profiles pa where pa.id = a.author),
      case r.t
        when 'place' then (select pl.hidden_at is not null from public.places pl where pl.id = r.id)
        when 'place_review' then (select pr.hidden_at is not null from public.place_reviews pr where pr.id = r.id)
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
      end as author
    ) a
    order by r.n desc, r.last desc
    limit 200;
end;
$$;

-- hide / unhide (spots, avis) ; delete (le contenu) ; dismiss (efface les signalements).
-- Photo supprimée : le fichier reste dans le stockage sans plus aucun lien (effacé avec le compte de l'auteur)
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
    else
      raise exception 'Masquage possible seulement pour les spots et les avis' using errcode = 'P0001';
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
    else raise exception 'Suppression impossible pour ce type (utilise la suspension pour un compte)' using errcode = 'P0001';
  end case;
  delete from public.content_reports where target_type = p_type and target_id = p_id;
end;
$$;

-- ---------- Suspension de compte ----------
create or replace function public.admin_suspend(p_user uuid, p_suspend boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if exists (select 1 from public.app_admins a where a.user_id = p_user) then
    raise exception 'Impossible de suspendre un admin' using errcode = 'P0001';
  end if;
  if p_suspend then
    update auth.users set banned_until = 'infinity' where id = p_user;
    -- Déconnexion immédiate : plus de renouvellement de session
    delete from auth.sessions where user_id = p_user;
    insert into public.account_suspensions (user_id, suspended_by, reason)
    values (p_user, (select auth.uid()), left(p_reason, 300))
    on conflict (user_id) do update set suspended_by = excluded.suspended_by, reason = excluded.reason, created_at = now();
  else
    update auth.users set banned_until = null where id = p_user;
    delete from public.account_suspensions where user_id = p_user;
  end if;
end;
$$;

create or replace function public.admin_set_signup_notify(p_on boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  update public.app_admins set notify_signups = p_on where user_id = (select auth.uid());
end;
$$;

revoke execute on function public.admin_stats(), public.admin_users(text, integer, integer), public.admin_reports(),
  public.admin_moderate(text, uuid, text), public.admin_suspend(uuid, boolean, text), public.admin_set_signup_notify(boolean)
  from public, anon;
grant execute on function public.admin_stats(), public.admin_users(text, integer, integer), public.admin_reports(),
  public.admin_moderate(text, uuid, text), public.admin_suspend(uuid, boolean, text), public.admin_set_signup_notify(boolean)
  to authenticated;

-- ---------- Push à l'admin à chaque inscription ----------
create or replace function public.notify_admins_signup()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  admins uuid[];
begin
  select coalesce(array_agg(a.user_id), '{}') into admins from public.app_admins a where a.notify_signups and a.user_id <> new.id;
  if cardinality(admins) > 0 then
    perform public.send_push(admins, 'admin', '🆕 Nouvel inscrit', '@' || new.username || ' vient de s''inscrire' ||
      coalesce(' (' || new.city || ')', '') || '.', jsonb_build_object('url', '/admin'));
  end if;
  return new;
end;
$$;

revoke execute on function public.notify_admins_signup() from public, anon, authenticated;

create trigger notify_admins_signup after insert on public.profiles
  for each row execute function public.notify_admins_signup();

-- Si le compte admin existe déjà (sinon : select public.grant_admin('passeryder@gmail.com') après sa création)
do $$
begin
  if exists (select 1 from auth.users where lower(email) = 'passeryder@gmail.com') then
    perform public.grant_admin('passeryder@gmail.com');
  end if;
end $$;
