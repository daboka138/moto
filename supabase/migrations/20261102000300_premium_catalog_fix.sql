-- Correction note 33 : le premium ne contient QUE des fonctions pas encore créées.
-- Toute la météo (résumé, alertes, pastille, détail 12 h, notification de la veille), le carburant,
-- les étapes et les boucles restent gratuits pour toujours : leurs clés sortent du catalogue et
-- ne passent plus par canUse (code de l'app). Catalogue fixé ici, jamais modifiable depuis l'app :
-- offline_maps, gpx, full_stats, multi_garage, supporter_badge.

delete from public.app_features where key in ('weather_detail', 'unlimited_stops', 'loop_advanced', 'route_weather');

update public.app_features set premium_planned = (key in ('offline_maps', 'gpx', 'full_stats', 'multi_garage', 'supporter_badge'));

update public.app_features
set name = 'Statistiques avancées', description = 'Statistiques détaillées et historique illimité des trajets (à créer)'
where key = 'full_stats';
update public.app_features set description = 'Télécharger une région (build 1.3.0, à créer)' where key = 'offline_maps';
update public.app_features set description = 'Carnet et rappels pour plusieurs motos (à créer)' where key = 'multi_garage';
update public.app_features set description = 'Badge sur le profil des membres premium (à créer)' where key = 'supporter_badge';

-- Le statut « premium » n'est possible que pour une fonction du catalogue
alter table public.app_features
  add constraint app_features_premium_only_planned check (status <> 'premium' or premium_planned);

-- Depuis l'app (console admin), seul le statut se change : catalogue, ajout et suppression = migrations
revoke insert, update, delete on public.app_features from anon, authenticated;
grant update (status) on public.app_features to authenticated;

-- Même garde côté serveur
create or replace function public.feature_allowed(p_key text, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case coalesce((select f.status from public.app_features f where f.key = p_key), 'free')
    when 'free' then true
    when 'premium' then not public.premium_is_active()
      or not coalesce((select f.premium_planned from public.app_features f where f.key = p_key), false)
      or public.has_premium(p_user)
    else false
  end;
$$;
revoke execute on function public.feature_allowed(text, uuid) from public, anon, authenticated;
