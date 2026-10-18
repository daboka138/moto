-- Note 26 : taille réelle de l'image d'une actu (mesurée par l'Edge Function fetch-news sur le
-- début du fichier). L'app affiche une grande image seulement si elle fait au moins 600 px de
-- large (jamais agrandie), sinon une vignette à côté du titre, et rien sans image.

alter table public.news_items
  add column image_width int check (image_width is null or image_width > 0),
  add column image_height int check (image_height is null or image_height > 0);

-- Le type renvoyé change : on recrée la fonction
drop function public.news_feed(int);

create function public.news_feed(p_limit int default 30)
returns table (
  id uuid,
  source_name text,
  site_url text,
  url text,
  title text,
  summary text,
  image_url text,
  image_width int,
  image_height int,
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
  select n.id, s.name, s.site_url, n.url, n.title, n.summary, n.image_url, n.image_width, n.image_height, n.published_at,
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
