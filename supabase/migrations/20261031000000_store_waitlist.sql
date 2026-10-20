-- =====================================================================
-- « Préviens-moi » quand l'appli sort sur iPhone (App Store) ou Android (Google Play public)
--
-- store_waitlist : une ligne par inscription et par plateforme
--   - membre connecté (user_id) : bandeau du Mur (web) ou Paramètres › Notifications ;
--     email_ok = accepte aussi UN email (adresse du compte)
--   - visiteur sans compte (email) : formulaire de passeryder.fr/telecharger, consentement obligatoire
--   notified_at = notification (onglet Notifs + push) envoyée, emailed_at = email envoyé :
--   chacun n'est prévenu qu'UNE fois. unsubscribed_at = désinscrit (lien de l'email ou réglage).
--   RLS : chacun lit seulement les siennes ; écritures par RPC ; totaux pour l'admin seulement.
-- Envoi : Console › Sorties stores → Edge Function store-launch (vérifie is_admin) →
--   store_launch_dispatch (service_role uniquement) puis emails Brevo un par un.
-- app_settings.app_store_url : lien App Store (vide tant que l'appli iPhone n'est pas sortie) ;
--   renseigné → bandeau « dispo sur l'App Store » sur le web iPhone et bouton sur /telecharger.
-- Purge : les inscriptions par email seul sont effacées 90 jours après l'envoi ou la désinscription.
-- Appliquée avec : npx supabase db push
-- =====================================================================

-- ---------- Lien App Store ----------
alter table public.app_settings
  add constraint app_settings_app_store_url_check
  check (key <> 'app_store_url' or value = '' or value like 'https://apps.apple.com/%');

insert into public.app_settings (key, value) values ('app_store_url', '')
on conflict (key) do nothing;

-- ---------- Inscriptions ----------
create table public.store_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete cascade,
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  platform text not null check (platform in ('ios', 'android')),
  email_ok boolean not null default false,
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  emailed_at timestamptz,
  unsubscribed_at timestamptz,
  -- membre (sans adresse stockée ici : celle du compte) OU visiteur (adresse + consentement)
  check ((user_id is not null and email is null) or (user_id is null and email is not null and email_ok))
);

create unique index store_waitlist_user_platform on public.store_waitlist (user_id, platform) where user_id is not null;
create unique index store_waitlist_email_platform on public.store_waitlist (lower(email), platform) where user_id is null;

alter table public.store_waitlist enable row level security;

create policy "store_waitlist: lecture des siennes"
  on public.store_waitlist for select to authenticated
  using (user_id = (select auth.uid()));

revoke insert, update, delete on public.store_waitlist from anon, authenticated;

-- Membre connecté : s'inscrire / se désinscrire (réglage), avec ou sans email
create or replace function public.set_store_waitlist(p_platform text, p_on boolean, p_email_ok boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Non connecté' using errcode = '42501';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'Plateforme inconnue' using errcode = 'P0001';
  end if;
  if p_on then
    insert into public.store_waitlist (user_id, platform, email_ok)
    values (me, p_platform, coalesce(p_email_ok, false))
    on conflict (user_id, platform) where user_id is not null
    do update set unsubscribed_at = null, email_ok = excluded.email_ok;
  else
    -- La ligne est gardée (notified_at / emailed_at) : se réinscrire ne renvoie jamais un 2e avis
    update public.store_waitlist set unsubscribed_at = coalesce(unsubscribed_at, now())
    where user_id = me and platform = p_platform;
  end if;
end;
$$;

revoke all on function public.set_store_waitlist(text, boolean, boolean) from public, anon;
grant execute on function public.set_store_waitlist(text, boolean, boolean) to authenticated;

-- Visiteur sans compte (passeryder.fr/telecharger) : consentement obligatoire
create or replace function public.join_store_waitlist_email(p_email text, p_platform text, p_consent boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
begin
  if p_consent is not true then
    raise exception 'Coche la case pour accepter l''email' using errcode = 'P0001';
  end if;
  if p_platform not in ('ios', 'android') then
    raise exception 'Plateforme inconnue' using errcode = 'P0001';
  end if;
  if char_length(e) > 254 or e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Adresse email invalide' using errcode = 'P0001';
  end if;
  -- Garde-fou contre les envois en masse du formulaire
  if (select count(*) from public.store_waitlist where user_id is null and created_at > now() - interval '1 hour') >= 300 then
    raise exception 'Trop d''inscriptions en ce moment, réessaie plus tard' using errcode = 'P0001';
  end if;
  insert into public.store_waitlist (email, platform, email_ok)
  values (e, p_platform, true)
  on conflict (lower(email), platform) where user_id is null
  do update set unsubscribed_at = null, email_ok = true;
end;
$$;

revoke all on function public.join_store_waitlist_email(text, text, boolean) from public;
grant execute on function public.join_store_waitlist_email(text, text, boolean) to anon, authenticated;

-- Lien de désinscription de l'email (passeryder.fr/desinscription?t=…) : renvoie la plateforme, ou null
create or replace function public.unsubscribe_store_waitlist(p_token uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  update public.store_waitlist set unsubscribed_at = coalesce(unsubscribed_at, now())
  where unsubscribe_token = p_token
  returning platform;
$$;

revoke all on function public.unsubscribe_store_waitlist(uuid) from public;
grant execute on function public.unsubscribe_store_waitlist(uuid) to anon, authenticated;

-- ---------- Notifications : nouveau type ----------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'like', 'comment', 'friend_request', 'friend_accepted', 'ride_invite', 'event_invite', 'event_response',
  'event_reminder', 'message', 'place_new', 'place_review', 'convoy', 'regroup', 'sos',
  'referral', 'club_request', 'club_accepted', 'reaction', 'group_added', 'passenger', 'store_launch'
));

-- ---------- Console › Sorties stores ----------
create or replace function public.admin_store_launch()
returns table (
  platform text, subscribers bigint, members bigint, emails bigint, notified bigint, emailed bigint, unsubscribed bigint,
  pending bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
  select p.platform,
    count(w.id) filter (where w.unsubscribed_at is null),
    count(w.id) filter (where w.unsubscribed_at is null and w.user_id is not null),
    count(w.id) filter (where w.unsubscribed_at is null and w.email_ok),
    count(w.id) filter (where w.notified_at is not null),
    count(w.id) filter (where w.emailed_at is not null),
    count(w.id) filter (where w.unsubscribed_at is not null),
    -- restent à prévenir : comptes sans notification + adresses pas encore écrites (dédoublonnées)
    count(w.id) filter (where w.unsubscribed_at is null and w.user_id is not null and w.notified_at is null)
      + (select count(*) from public.store_launch_email_targets(p.platform) t
         where t.user_id is null or t.user_id not in (
           select w3.user_id from public.store_waitlist w3
           where w3.platform = p.platform and w3.user_id is not null and w3.notified_at is null and w3.unsubscribed_at is null))
  from (values ('ios'), ('android')) as p (platform)
  left join public.store_waitlist w on w.platform = p.platform
  group by p.platform
  order by p.platform desc;
end;
$$;

revoke all on function public.admin_store_launch() from public, anon;
grant execute on function public.admin_store_launch() to authenticated;

-- Emails encore à envoyer : adresse du compte ou du formulaire, une fois par adresse
create or replace function public.store_launch_email_targets(p_platform text)
returns table (id uuid, user_id uuid, email text, unsubscribe_token uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (lower(t.email)) t.id, t.user_id, t.email, t.unsubscribe_token
  from (
    select w.id, w.user_id, coalesce(w.email, u.email::text) as email, w.unsubscribe_token, w.created_at
    from public.store_waitlist w
    left join auth.users u on u.id = w.user_id
    where w.platform = p_platform and w.email_ok and w.emailed_at is null and w.unsubscribed_at is null
  ) t
  where t.email is not null
    -- déjà écrit à cette adresse pour cette plateforme (autre ligne) : pas de 2e email
    and not exists (
      select 1 from public.store_waitlist w2
      left join auth.users u2 on u2.id = w2.user_id
      where w2.platform = p_platform and w2.emailed_at is not null
        and lower(coalesce(w2.email, u2.email::text)) = lower(t.email)
    )
  order by lower(t.email), t.created_at;
$$;

revoke all on function public.store_launch_email_targets(text) from public, anon, authenticated;

-- Envoi (Edge Function store-launch, après vérification de is_admin) :
-- notification + push aux membres pas encore prévenus (une fois : notified_at), puis renvoie les
-- emails à envoyer (adresse du compte ou du formulaire, dédoublonnée). p_test = l'admin seul,
-- sans rien marquer. Les emails sont marqués un par un par la fonction (claim_store_email).
create or replace function public.store_launch_dispatch(p_platform text, p_test_user uuid default null)
returns table (id uuid, email text, unsubscribe_token uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  link text;
  label text := case p_platform when 'ios' then 'iPhone' else 'Android' end;
  store text := case p_platform when 'ios' then 'l''App Store' else 'Google Play' end;
  store_name text := case p_platform when 'ios' then 'App Store' else 'Google Play' end;
  msg text;
  members uuid[];
begin
  if p_platform not in ('ios', 'android') then
    raise exception 'Plateforme inconnue' using errcode = 'P0001';
  end if;
  select s.value into link from public.app_settings s
  where s.key = case p_platform when 'ios' then 'app_store_url' else 'play_store_url' end;
  if coalesce(link, '') = '' then
    raise exception 'Renseigne d''abord le lien %', store_name using errcode = 'P0001';
  end if;
  msg := '📱 PasseRyder est dispo sur ' || label || ' ! Télécharge-la sur ' || store || ', ton compte reste le même.';

  if p_test_user is not null then
    members := array[p_test_user];
  else
    with done as (
      update public.store_waitlist w set notified_at = now()
      where w.platform = p_platform and w.user_id is not null and w.notified_at is null and w.unsubscribed_at is null
      returning w.user_id
    )
    select coalesce(array_agg(distinct d.user_id), '{}') into members from done d;
  end if;

  perform public.notify_many(members, 'store_launch', null, 'store', null, msg, link);
  perform public.send_push(members, 'app', 'PasseRyder est dispo sur ' || label || ' !',
    'Télécharge-la sur ' || store || ', ton compte reste le même.', jsonb_build_object('url', link));

  if p_test_user is not null then
    return query select null::uuid, u.email::text, null::uuid from auth.users u where u.id = p_test_user and u.email is not null;
    return;
  end if;

  return query select t.id, t.email, t.unsubscribe_token from public.store_launch_email_targets(p_platform) t;
end;
$$;

-- Avant chaque email : marque la ligne (et ses doublons d'adresse) ; false = déjà envoyé ou désinscrit
create or replace function public.claim_store_email(p_id uuid, p_sent boolean default true)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not p_sent then
    -- Envoi raté : remis en attente pour un prochain clic
    update public.store_waitlist set emailed_at = null where id = p_id;
    return true;
  end if;
  update public.store_waitlist set emailed_at = now()
  where id = p_id and emailed_at is null and unsubscribed_at is null;
  return found;
end;
$$;

revoke all on function public.store_launch_dispatch(text, uuid) from public, anon, authenticated;
revoke all on function public.claim_store_email(uuid, boolean) from public, anon, authenticated;
grant execute on function public.store_launch_dispatch(text, uuid) to service_role;
grant execute on function public.claim_store_email(uuid, boolean) to service_role;

-- ---------- Purge (RGPD) ----------
select cron.schedule('store-waitlist-cleanup', '41 4 * * *', $$
  delete from public.store_waitlist
  where user_id is null and coalesce(emailed_at, unsubscribed_at) < now() - interval '90 days'
$$);
