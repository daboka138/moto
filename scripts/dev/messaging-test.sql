-- Test de la migration messagerie v2 SUR LE SCHÉMA RÉEL, sans rien garder : tout se passe dans
-- une transaction qui se termine TOUJOURS par une erreur volontaire (« RAPPORT … »), donc annulée.
-- Usage : node scripts/dev/messaging-test.mjs (charge .env.supabase, insère la migration ici).
begin;

-- @@MIGRATION@@

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
end $$;

do $t$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); d uuid := gen_random_uuid();
  conv uuid; msg uuid; r text; n int; t timestamptz; report text := '';
  procedure_ok boolean;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
  select x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'msgtest-' || x || '@example.invalid', '{}'::jsonb, now(), now(), now()
  from unnest(array[a, b, c, d]) x;
  insert into public.profiles (id, username, avatar_path)
  select x, 't' || left(replace(x::text, '-', ''), 12), x || '/a.jpg' from unnest(array[a, b, c, d]) x;
  insert into public.profile_private (user_id, first_name, last_name) select x, 'T', 'T' from unnest(array[a, b, c, d]) x;
  insert into public.friendships (requester_id, addressee_id, status) values (a, b, 'accepted'), (a, c, 'accepted'), (a, d, 'accepted');
  insert into public.user_blocks (blocker_id, blocked_id) values (d, a); -- d a bloqué a

  -- 1) Groupe avec un membre qui m'a bloqué : refusé
  perform pg_temp.as_user(a);
  begin
    perform public.create_group('Test', null, array[b, d]);
    report := report || E'\n✗ 1 groupe avec un bloqué accepté';
  exception when others then report := report || E'\n✓ 1 bloqué : ' || sqlerrm;
  end;

  -- 2) Création du groupe
  conv := public.create_group('Les potes', null, array[b, c]);
  select count(*) into n from public.conversation_members where conversation_id = conv;
  report := report || E'\n' || case when n = 3 then '✓' else '✗' end || ' 2 groupe créé, membres = ' || n;
  select count(*) into n from public.conversation_members where conversation_id = conv and user_id = a and role = 'admin';
  report := report || E'\n' || case when n = 1 then '✓' else '✗' end || ' 2 créateur admin';

  -- 3) Message de a
  insert into public.messages (conversation_id, sender_id, body) values (conv, a, 'salut') returning id into msg;
  -- 4) Message « système » forgé par un membre : refusé
  begin
    insert into public.messages (conversation_id, sender_id, body, kind) values (conv, a, 'faux', 'system');
    report := report || E'\n✗ 4 message système forgé accepté';
  exception when others then report := report || E'\n✓ 4 message système forgé refusé';
  end;

  -- 5) b voit le message système + salut, réagit (re-tap = retirer)
  perform pg_temp.as_user(b);
  select count(*) into n from public.messages where conversation_id = conv;
  report := report || E'\n' || case when n = 2 then '✓' else '✗' end || ' 5 b voit ' || n || ' messages';
  r := public.react_message(msg, '🔥');
  r := coalesce(r, '∅') || ' puis ' || coalesce(public.react_message(msg, '🔥'), '∅') || ' puis ' || coalesce(public.react_message(msg, '❤️'), '∅');
  report := report || E'\n' || case when r = '🔥 puis ∅ puis ❤️' then '✓' else '✗' end || ' 5 réactions : ' || r;
  begin
    perform public.react_message(msg, '💩');
    report := report || E'\n✗ 5 emoji hors liste accepté';
  exception when others then report := report || E'\n✓ 5 emoji hors liste refusé';
  end;

  -- 6) b ne peut ni modifier le message de a, ni se nommer admin, ni ajouter des membres
  begin
    perform public.edit_message(msg, 'pirate');
    report := report || E'\n✗ 6 b a modifié le message de a';
  exception when others then report := report || E'\n✓ 6 modif par un autre refusée';
  end;
  begin
    update public.conversation_members set role = 'admin' where conversation_id = conv and user_id = b;
    report := report || E'\n✗ 6 b s''est nommé admin';
  exception when others then report := report || E'\n✓ 6 rôle non modifiable : ' || sqlerrm;
  end;
  begin
    perform public.add_group_members(conv, array[d]);
    report := report || E'\n✗ 6 b (non admin) a ajouté un membre';
  exception when others then report := report || E'\n✓ 6 ajout par non-admin refusé';
  end;

  -- 7) a modifie (15 min) : « modifié »
  perform pg_temp.as_user(a);
  perform public.edit_message(msg, 'salut édité');
  select count(*) into n from public.messages where id = msg and body = 'salut édité' and edited_at is not null;
  report := report || E'\n' || case when n = 1 then '✓' else '✗' end || ' 7 message modifié';

  -- 8) b le supprime pour lui seul : a le voit toujours
  perform pg_temp.as_user(b);
  perform public.hide_message(msg);
  select count(*) into n from public.messages where id = msg;
  report := report || E'\n' || case when n = 0 then '✓' else '✗' end || ' 8 masqué pour b (b voit ' || n || ')';
  perform pg_temp.as_user(a);
  select count(*) into n from public.messages where id = msg;
  report := report || E'\n' || case when n = 1 then '✓' else '✗' end || ' 8 a le voit encore';

  -- 9) a le supprime pour tout le monde : contenu effacé en base, réactions supprimées
  perform public.delete_message_for_all(msg);
  perform pg_temp.as_admin();
  select count(*) into n from public.messages where id = msg and body is null and image_path is null and deleted_at is not null;
  report := report || E'\n' || case when n = 1 then '✓' else '✗' end || ' 9 contenu effacé en base';
  select count(*) into n from public.message_reactions where message_id = msg;
  report := report || E'\n' || case when n = 0 then '✓' else '✗' end || ' 9 réactions effacées';

  -- 10) Accusés de lecture coupés chez b : sa date visible ne bouge plus, sa vraie lecture si
  update public.profile_private set read_receipts = false where user_id = b;
  select last_read_at into t from public.conversation_members where conversation_id = conv and user_id = b;
  perform pg_temp.as_user(b);
  update public.conversation_members set last_read_at = now() + interval '1 minute' where conversation_id = conv and user_id = b;
  perform pg_temp.as_admin();
  select count(*) into n from public.conversation_members where conversation_id = conv and user_id = b and last_read_at = t;
  report := report || E'\n' || case when n = 1 then '✓' else '✗' end || ' 10 date de lecture de b masquée';
  select count(*) into n from public.conversation_reads where conversation_id = conv and user_id = b and read_at > t;
  report := report || E'\n' || case when n = 1 then '✓' else '✗' end || ' 10 vraie lecture de b enregistrée';

  -- 11) Sourdine de b : invisible pour a
  perform pg_temp.as_user(b);
  perform public.set_conversation_mute(conv, 'infinity');
  update public.conversation_members set delivered_at = now() where conversation_id = conv and user_id = b;
  perform pg_temp.as_user(a);
  select count(*) into n from public.conversation_reads where conversation_id = conv and user_id = b;
  report := report || E'\n' || case when n = 0 then '✓' else '✗' end || ' 11 sourdine de b invisible pour a';
  select count(*) into n from public.conversation_members where conversation_id = conv and user_id = b and delivered_at is not null;
  report := report || E'\n' || case when n = 1 then '✓' else '✗' end || ' 11 « reçu » de b visible';

  -- 12) c quitte : message système ; a renomme ; a nomme b admin
  perform pg_temp.as_user(c);
  perform public.leave_group(conv);
  perform pg_temp.as_user(a);
  perform public.update_group(conv, 'Les potes du 13', null);
  perform public.set_group_admin(conv, b, true);
  perform pg_temp.as_admin();
  select count(*) into n from public.messages where conversation_id = conv and kind = 'system';
  report := report || E'\n' || case when n = 4 then '✓' else '✗' end || ' 12 messages système = ' || n
    || ' (' || (select string_agg(body, ' | ' order by created_at) from public.messages where conversation_id = conv and kind = 'system') || ')';

  -- 13) Liste des conversations de a (groupe avec son nom) ; anciennes requêtes de l'app
  perform pg_temp.as_user(a);
  select count(*) into n from public.my_conversations() x where x.id = conv and x.kind = 'group' and x.title = 'Les potes du 13' and x.members_count = 2;
  report := report || E'\n' || case when n = 1 then '✓' else '✗' end || ' 13 my_conversations : groupe';
  select count(*) into n from public.conversation_members where conversation_id = conv;
  report := report || E'\n' || case when n = 2 then '✓' else '✗' end || ' 13 lecture directe des membres (ancienne app)';

  -- 14) Message direct a ↔ b : toujours possible ; push sans erreur
  conv := public.get_or_create_direct_conversation(b);
  insert into public.messages (conversation_id, sender_id, body) values (conv, a, 'coucou');
  report := report || E'\n✓ 14 message privé envoyé';

  perform pg_temp.as_admin();
  raise exception 'RAPPORT%', report;
end
$t$;

rollback;
