-- =====================================================================
-- Distribution de l'app : page https://passeryder.fr/telecharger
-- Réglages publics (app_settings, écriture admin, Console › Fonctions › Distribution) :
--   distribution_mode  'test' (test fermé : groupe → activer le test → Google Play) ou 'public'
--   testers_group_url  groupe Google des testeurs
--   testing_optin_url  page « Devenir testeur » de Google Play
--   play_store_url     fiche Google Play (déjà présent)
-- Appliquée avec : npx supabase db push
-- =====================================================================

alter table public.app_settings
  add constraint app_settings_distribution_mode_check
  check (key <> 'distribution_mode' or value in ('test', 'public'));

insert into public.app_settings (key, value) values
  ('distribution_mode', 'test'),
  ('testers_group_url', 'https://groups.google.com/g/passeryder-testeurs'),
  ('testing_optin_url', 'https://play.google.com/apps/testing/com.passeryder.app')
on conflict (key) do nothing;
