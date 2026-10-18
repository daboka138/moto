-- Note 24 : « Actu moto » dans le Mur.
-- Les articles viennent des flux RSS publics de sites d'actualité moto, récupérés toutes les 3 h
-- par l'Edge Function `fetch-news` (pg_cron). On ne garde JAMAIS l'article : titre, 1-2 phrases du
-- résumé fourni par le flux, source, date, lien vers le site d'origine, image seulement si le flux
-- en donne une. Rien sur la police, les contrôles, les radars ou les retraits de permis (filtré
-- par la fonction). Gardés 30 jours.

-- ---------- Sources ----------
create table public.news_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 60),
  feed_url text not null unique check (feed_url ~ '^https?://'),
  site_url text check (site_url is null or site_url ~ '^https?://'),
  enabled boolean not null default true,
  sort_order int not null default 0,
  last_fetch_at timestamptz,
  last_status text,
  last_new int,
  created_at timestamptz not null default now()
);

alter table public.news_sources enable row level security;

create policy "news_sources: lecture"
  on public.news_sources for select to authenticated
  using (true);

create policy "news_sources: admin"
  on public.news_sources for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- Articles ----------
create table public.news_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.news_sources (id) on delete cascade,
  guid text not null,
  url text not null check (url ~ '^https?://'),
  title text not null check (char_length(title) between 1 and 300),
  summary text check (summary is null or char_length(summary) <= 400),
  image_url text check (image_url is null or image_url ~ '^https://'),
  published_at timestamptz not null,
  fetched_at timestamptz not null default now(),
  hidden_at timestamptz,
  unique (source_id, guid)
);

create index news_items_published_idx on public.news_items (published_at desc);

alter table public.news_items enable row level security;

-- Membres : articles non masqués des sources actives ; admin : tout
create policy "news_items: lecture"
  on public.news_items for select to authenticated
  using (
    public.is_admin()
    or (
      hidden_at is null
      and exists (select 1 from public.news_sources s where s.id = source_id and s.enabled)
    )
  );

-- Écriture : uniquement l'Edge Function (service_role) ; l'admin peut masquer
create policy "news_items: admin"
  on public.news_items for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke insert, delete on public.news_items from anon, authenticated;
revoke update on public.news_items from anon, authenticated;
grant update (hidden_at) on public.news_items to authenticated;

-- ---------- J'aime ----------
create table public.news_likes (
  news_id uuid not null references public.news_items (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (news_id, user_id)
);

create index news_likes_user_idx on public.news_likes (user_id);

alter table public.news_likes enable row level security;

create policy "news_likes: lecture"
  on public.news_likes for select to authenticated
  using (true);

create policy "news_likes: aimer"
  on public.news_likes for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "news_likes: retirer"
  on public.news_likes for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.news_likes from anon, authenticated;

-- ---------- Commentaires ----------
create table public.news_comments (
  id uuid primary key default gen_random_uuid(),
  news_id uuid not null references public.news_items (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index news_comments_news_created_idx on public.news_comments (news_id, created_at);
create index news_comments_author_idx on public.news_comments (author_id);

alter table public.news_comments enable row level security;

create policy "news_comments: lecture"
  on public.news_comments for select to authenticated
  using (not public.is_blocked_with(author_id));

create policy "news_comments: commenter"
  on public.news_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.news_items n where n.id = news_id and n.hidden_at is null)
  );

-- Suppression : l'auteur, ou un admin (modération)
create policy "news_comments: suppression"
  on public.news_comments for delete to authenticated
  using (author_id = (select auth.uid()) or public.is_admin());

revoke update on public.news_comments from anon, authenticated;

-- ---------- Compteurs pour le Mur ----------
-- Derniers articles (14 jours max) avec la source, les J'aime et les commentaires
create or replace function public.news_feed(p_limit int default 30)
returns table (
  id uuid,
  source_name text,
  site_url text,
  url text,
  title text,
  summary text,
  image_url text,
  published_at timestamptz,
  likes bigint,
  liked_by_me boolean,
  comments bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select n.id, s.name, s.site_url, n.url, n.title, n.summary, n.image_url, n.published_at,
    (select count(*) from public.news_likes l where l.news_id = n.id),
    exists (select 1 from public.news_likes l where l.news_id = n.id and l.user_id = (select auth.uid())),
    (select count(*) from public.news_comments c where c.news_id = n.id)
  from public.news_items n
  join public.news_sources s on s.id = n.source_id
  where n.hidden_at is null and s.enabled and n.published_at > now() - interval '14 days'
  order by n.published_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke execute on function public.news_feed(int) from public, anon;
grant execute on function public.news_feed(int) to authenticated;

-- ---------- Sources de départ (flux vérifiés le 18/10/2026) ----------
insert into public.news_sources (name, feed_url, site_url, enabled, sort_order) values
  ('Le Repaire des Motards', 'https://www.lerepairedesmotards.com/rss/actu.xml', 'https://www.lerepairedesmotards.com', true, 1),
  ('Motoservices', 'https://www.motoservices.com/lastnews.rss', 'https://www.motoservices.com', true, 2),
  ('Moto Magazine', 'https://www.motomag.com/rss', 'https://www.motomag.com', true, 3),
  ('Motoplanete', 'https://www.motoplanete.com/rss.xml', 'https://www.motoplanete.com', true, 4),
  -- Surtout des communiqués (réglementation, manifestations) : désactivé au départ
  ('FFMC', 'https://www.ffmc.asso.fr/spip.php?page=backend', 'https://www.ffmc.asso.fr', false, 5);

-- ---------- Modération : commentaires d'actus signalables ----------
alter table public.content_reports drop constraint content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check
  check (target_type in ('message', 'story', 'user', 'comment', 'ride_comment', 'place', 'place_review', 'event', 'photo',
    'club', 'club_post', 'news_comment'));

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

-- ---------- Récupération toutes les 3 h ----------
-- La fonction ne fait que lire des flux publics (avec un délai minimum entre deux passages) :
-- l'appeler n'expose rien.
select cron.schedule(
  'fetch-moto-news',
  '17 */3 * * *',
  $$
  select net.http_post(
    url := 'https://yfewldnhnnrzzscmfjsd.supabase.co/functions/v1/fetch-news',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
