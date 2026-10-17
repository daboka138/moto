-- Comptes de test (scripts/dev, adresses passeryder+test-…@gmail.com ou …@example.invalid) :
-- jamais comptés dans la console (Vue d'ensemble, inscriptions par jour, actifs, bienvenues).
-- Rappel CLAUDE.md : plus aucun compte de test en production sans l'accord de Dimitri.
-- Appliquée avec : npx supabase db push

create or replace function public.is_test_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_email ilike 'passeryder+test-%@gmail.com' or p_email ilike '%@example.invalid', false);
$$;

revoke all on function public.is_test_email(text) from public, anon;

CREATE OR REPLACE FUNCTION public.admin_stats()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  result jsonb;
begin
  perform public.assert_admin();
  with seen as (
    select u.id, greatest(u.last_sign_in_at, (select max(coalesce(s.refreshed_at, s.updated_at, s.created_at)) from auth.sessions s where s.user_id = u.id)) as at
    from auth.users u
    where not public.is_test_email(u.email)
  ),
  real_profiles as (
    select p.* from public.profiles p join auth.users u on u.id = p.id where not public.is_test_email(u.email)
  )
  select jsonb_build_object(
    'users', (select count(*) from real_profiles),
    'new_today', (select count(*) from real_profiles p where p.created_at >= date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'),
    'new_7d', (select count(*) from real_profiles p where p.created_at > now() - interval '7 days'),
    'new_30d', (select count(*) from real_profiles p where p.created_at > now() - interval '30 days'),
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
        from real_profiles p
        where p.created_at > now() - interval '31 days'
        group by 1
      ) c on c.day = d.day::date
    ),
    'notify_signups', (select a.notify_signups from public.app_admins a where a.user_id = (select auth.uid()))
  ) into result;
  return result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.admin_welcome()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.welcome_settings;
  sender uuid := public.creator_user_id();
begin
  perform public.assert_admin();
  select * into s from public.welcome_settings where id;
  return jsonb_build_object(
    'enabled', s.enabled,
    'body', s.body,
    'test_username', s.test_username,
    'sender_username', (select p.username from public.profiles p where p.id = sender),
    'sent', (select count(*) from public.welcome_messages w join auth.users u on u.id = w.user_id where not public.is_test_email(u.email)),
    'replied', (
      select count(*) from public.welcome_messages w
      join auth.users u on u.id = w.user_id
      where not public.is_test_email(u.email) and exists (
        select 1 from public.messages m
        where m.conversation_id = w.conversation_id and m.sender_id = w.user_id and m.created_at >= w.sent_at
      )
    ),
    'pending', (
      select count(*) from public.profiles p
      join auth.users u on u.id = p.id
      where not public.is_test_email(u.email) and p.id <> coalesce(sender, '00000000-0000-0000-0000-000000000000')
        and not exists (select 1 from public.welcome_messages w where w.user_id = p.id)
        and not exists (select 1 from public.app_admins a where a.user_id = p.id)
        and (sender is null or not public.is_blocked_between(sender, p.id))
    )
  );
end;
$function$;
