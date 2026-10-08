-- =====================================================================
-- Mur : « J'aime » et commentaires sur les photos (app + version web)
-- - Lisibles par les membres connectés, comme les photos, sauf entre
--   deux membres qui se sont bloqués (dans un sens ou dans l'autre)
-- - Un « J'aime » par membre et par photo
-- - Commentaire supprimable par son auteur ou par le propriétaire de la photo
-- - Signalement possible (content_reports, target_type 'comment')
-- - Tout part en cascade avec la photo ou le compte
-- =====================================================================

-- ---------- J'aime ----------
create table public.wall_photo_likes (
  photo_id uuid not null references public.wall_photos (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);

create index wall_photo_likes_user_idx on public.wall_photo_likes (user_id);

alter table public.wall_photo_likes enable row level security;

create policy "wall_photo_likes: lecture membres connectés"
  on public.wall_photo_likes for select to authenticated
  using (not public.is_blocked_with(user_id));

create policy "wall_photo_likes: aimer"
  on public.wall_photo_likes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and not exists (
      select 1 from public.wall_photos w
      where w.id = photo_id and public.is_blocked_with(w.owner_id)
    )
  );

create policy "wall_photo_likes: retirer le sien"
  on public.wall_photo_likes for delete to authenticated
  using (user_id = (select auth.uid()));

revoke update on public.wall_photo_likes from anon, authenticated;

-- ---------- Commentaires ----------
create table public.wall_photo_comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.wall_photos (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index wall_photo_comments_photo_created_idx on public.wall_photo_comments (photo_id, created_at);
create index wall_photo_comments_author_idx on public.wall_photo_comments (author_id);

alter table public.wall_photo_comments enable row level security;

create policy "wall_photo_comments: lecture membres connectés"
  on public.wall_photo_comments for select to authenticated
  using (not public.is_blocked_with(author_id));

create policy "wall_photo_comments: commenter"
  on public.wall_photo_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and not exists (
      select 1 from public.wall_photos w
      where w.id = photo_id and public.is_blocked_with(w.owner_id)
    )
  );

-- L'auteur, ou le propriétaire de la photo (modération de son mur)
create policy "wall_photo_comments: suppression"
  on public.wall_photo_comments for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (
      select 1 from public.wall_photos w
      where w.id = photo_id and w.owner_id = (select auth.uid())
    )
  );

revoke update on public.wall_photo_comments from anon, authenticated;

-- ---------- Signalement des commentaires ----------
alter table public.content_reports drop constraint if exists content_reports_target_type_check;
alter table public.content_reports
  add constraint content_reports_target_type_check check (target_type in ('message', 'story', 'user', 'comment'));

-- ---------- Notification : commentaire sur ma photo ----------
-- Catégorie « friends » (réglage « Amis et commentaires »). Pas de notification pour ses propres
-- commentaires ni pour les « J'aime » (trop fréquents).
create or replace function public.wall_photo_comments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid;
begin
  select w.owner_id into owner from public.wall_photos w where w.id = new.photo_id;
  if owner is null or owner = new.author_id then
    return null;
  end if;
  perform public.send_push(array[owner], 'friends', 'Nouveau commentaire',
    public.username_of(new.author_id) || ' : ' || left(new.body, 120), jsonb_build_object('url', '/profile'));
  return null;
end;
$$;

revoke execute on function public.wall_photo_comments_notify() from public, anon, authenticated;

create trigger wall_photo_comments_notify
  after insert on public.wall_photo_comments
  for each row execute function public.wall_photo_comments_notify();
