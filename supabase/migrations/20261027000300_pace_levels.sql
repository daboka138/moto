-- =====================================================================
-- Niveaux / rythme des balades en vocabulaire motard, sans vitesse (note 19, point 7)
-- 🐢 Pépère · 😎 Tranquille · 🔥 Dynamique · 🏁 Arsouille
-- Les codes déjà stockés sont GARDÉS (aucune balade ni profil réécrit, les versions de l'app pas
-- encore mises à jour continuent de les lire) ; l'app les affiche avec les nouveaux noms :
--   rythme  : cool → Tranquille, modere → Dynamique, soutenu → Arsouille
--   niveau  : tranquille → Tranquille, dynamique → Dynamique, sportif → Arsouille
-- Seul nouveau code : « pepere » (Pépère), pour le rythme comme pour le niveau.
-- =====================================================================

alter table public.group_rides drop constraint if exists group_rides_level_check;
alter table public.group_rides add constraint group_rides_level_check
  check (level in ('pepere', 'tranquille', 'dynamique', 'sportif'));

alter table public.group_rides drop constraint if exists group_rides_pace_check;
alter table public.group_rides add constraint group_rides_pace_check
  check (pace in ('pepere', 'cool', 'modere', 'soutenu'));

alter table public.profiles drop constraint if exists profiles_pace_check;
alter table public.profiles add constraint profiles_pace_check
  check (pace in ('pepere', 'cool', 'modere', 'soutenu'));
