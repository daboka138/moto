-- Test de la migration « message de bienvenue » SUR LE SCHÉMA RÉEL, sans rien garder : tout se
-- passe dans une transaction qui se termine TOUJOURS par une erreur volontaire (« RAPPORT … »).
-- Usage : node scripts/dev/welcome-test.mjs (insère la migration ici).
begin;

-- @@MIGRATION@@

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
end $$;
create function pg_temp.new_member(x uuid) returns void language plpgsql as $$
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at, email_confirmed_at)
  values (x, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'welcometest-' || x || '@example.invalid', '{}'::jsonb, now(), now(), now());
end $$;
create function pg_temp.new_profile(x uuid) returns void language plpgsql as $$
begin
  insert into public.profiles (id, username, avatar_path) values (x, 'w' || left(replace(x::text, '-', ''), 12), x || '/a.jpg');
end $$;

do $t$
declare
  creator uuid := public.creator_user_id();
  u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid();
  conv uuid; n int; r text; j jsonb; j0 jsonb; report text := ''; name3 text; name0 text := public.username_of(creator);
begin
  report := report || E'\n' || case when creator is not null then '✓' else '✗' end || ' expéditeur = @' || coalesce(public.username_of(creator), '?');
  perform pg_temp.as_user(creator);
  j0 := public.admin_welcome();
  perform pg_temp.as_postgres();

  -- 1) Compte créé sans profil : rien ; profil créé (fin de l'inscription) : bienvenue
  perform pg_temp.new_member(u1);
  select count(*) into n from public.welcome_messages where user_id = u1;
  report := report || E'\n' || case when n = 0 then '✓' else '✗' end || ' 1 compte sans profil : rien';
  perform pg_temp.new_profile(u1);
  select w.conversation_id into conv from public.welcome_messages w where w.user_id = u1;
  select m.body into r from public.messages m where m.conversation_id = conv and m.sender_id = creator;
  report := report || E'\n' || case when conv is not null and r like 'Salut ' || (select username from public.profiles where id = u1) || ', bienvenue%' then '✓' else '✗' end
    || ' 1 bienvenue envoyée par le créateur, pseudo remplacé';
  select count(*) into n from public.conversations c join public.conversation_members m on m.conversation_id = c.id
  where c.id = conv and c.kind = 'direct' and m.user_id in (u1, creator);
  report := report || E'\n' || case when n = 2 then '✓' else '✗' end || ' 1 conversation privée créateur ↔ nouveau';
  select count(*) into n from public.notifications where user_id = u1 and type = 'message' and actor_id = creator;
  report := report || E'\n' || case when n = 1 then '✓' else '✗' end || ' 1 notification « message » chez le nouveau';
  select count(*) into n from public.conversation_reads cr join public.messages m on m.conversation_id = cr.conversation_id
  where cr.conversation_id = conv and cr.user_id = u1 and m.sender_id = creator and cr.read_at < m.created_at;
  report := report || E'\n' || case when n = 1 then '✓' else '✗' end || ' 1 bienvenue non lue chez le nouveau';

  -- 2) Jamais deux fois
  perform public.send_welcome(u1);
  select count(*) into n from public.messages where conversation_id = conv and sender_id = creator;
  report := report || E'\n' || case when n = 1 then '✓' else '✗' end || ' 2 deuxième envoi ignoré (' || n || ' message)';

  -- 3) Jamais à l'expéditeur
  report := report || E'\n' || case when public.send_welcome(creator) is null then '✓' else '✗' end || ' 3 pas au créateur lui-même';

  -- 4) Réponse : notification habituelle chez le créateur
  perform pg_temp.as_user(u1);
  insert into public.messages (conversation_id, sender_id, body) values (conv, u1, 'Merci !');
  perform pg_temp.as_postgres();
  select count(*) into n from public.notifications where user_id = creator and type = 'message' and actor_id = u1;
  report := report || E'\n' || case when n = 1 then '✓' else '✗' end || ' 4 réponse notifiée au créateur';

  -- 5) Désactivé : rien à l'inscription, rattrapage refusé ; réactivé : rattrapage
  update public.welcome_settings set enabled = false;
  perform pg_temp.new_member(u2);
  perform pg_temp.new_profile(u2);
  select count(*) into n from public.welcome_messages where user_id = u2;
  report := report || E'\n' || case when n = 0 then '✓' else '✗' end || ' 5 désactivé : pas de bienvenue';
  perform pg_temp.as_user(creator);
  begin
    perform public.admin_welcome_backfill();
    report := report || E'\n✗ 5 rattrapage accepté alors que désactivé';
  exception when others then report := report || E'\n✓ 5 rattrapage refusé : ' || sqlerrm;
  end;
  perform pg_temp.as_postgres();
  -- u4 bloque le créateur : jamais de bienvenue
  perform pg_temp.new_member(u4);
  perform pg_temp.new_profile(u4);
  insert into public.user_blocks (blocker_id, blocked_id) values (u4, creator);
  update public.welcome_settings set enabled = true;
  perform pg_temp.as_user(creator);
  j := public.admin_welcome();
  report := report || E'\n' || case when (j ->> 'pending')::int >= 1 then '✓' else '✗' end || ' 5 en attente : ' || (j ->> 'pending');
  n := public.admin_welcome_backfill();
  perform pg_temp.as_postgres();
  report := report || E'\n' || case when exists (select 1 from public.welcome_messages where user_id = u2) then '✓' else '✗' end
    || ' 5 rattrapage : ' || n || ' envoyé(s), dont le nouveau';
  report := report || E'\n' || case when not exists (select 1 from public.welcome_messages where user_id = u4) then '✓' else '✗' end
    || ' 5 rattrapage : rien à qui a bloqué le créateur';

  -- 6) Compteurs
  perform pg_temp.as_user(creator);
  j := public.admin_welcome();
  report := report || E'\n' || case when (j ->> 'replied')::int = (j0 ->> 'replied')::int + 1 and (j ->> 'sent')::int > (j0 ->> 'sent')::int then '✓' else '✗' end
    || ' 6 compteurs : envoyées ' || (j ->> 'sent') || ', réponses ' || (j ->> 'replied') || ', en attente ' || (j ->> 'pending');

  -- 7) Test : au compte de test, sans marqueur, texte en cours de saisie
  perform pg_temp.as_postgres();
  perform pg_temp.new_member(u3);
  perform pg_temp.new_profile(u3);
  name3 := (select username from public.profiles where id = u3);
  perform pg_temp.as_user(creator);
  perform public.admin_set_welcome(true, (j ->> 'body'), '@' || name3);
  conv := public.admin_welcome_test('Test pour {pseudo}');
  perform pg_temp.as_postgres();
  select count(*) into n from public.messages where conversation_id = conv and body = 'Test pour ' || name3;
  report := report || E'\n' || case when n = 1 then '✓' else '✗' end || ' 7 test reçu par le compte de test';
  perform pg_temp.as_user(creator);
  perform public.admin_set_welcome(true, (j ->> 'body'), name0);
  begin
    perform public.admin_welcome_test(null);
    report := report || E'\n✗ 7 test vers soi-même accepté';
  exception when others then report := report || E'\n✓ 7 test vers soi-même refusé : ' || sqlerrm;
  end;

  -- 8) Membre ordinaire : ni lecture ni modification des réglages, ni console, ni envoi
  perform pg_temp.as_user(u1);
  select count(*) into n from public.welcome_settings;
  report := report || E'\n' || case when n = 0 then '✓' else '✗' end || ' 8 réglages invisibles pour un membre';
  update public.welcome_settings set body = 'piraté';
  perform pg_temp.as_postgres();
  report := report || E'\n' || case when (select body from public.welcome_settings) <> 'piraté' then '✓' else '✗' end || ' 8 réglages non modifiables par un membre';
  perform pg_temp.as_user(u1);
  begin
    perform public.admin_welcome();
    report := report || E'\n✗ 8 console ouverte à un membre';
  exception when others then report := report || E'\n✓ 8 console refusée : ' || sqlerrm;
  end;
  begin
    perform public.send_welcome(u2, true, 'spam');
    report := report || E'\n✗ 8 send_welcome appelable par un membre';
  exception when others then report := report || E'\n✓ 8 send_welcome interdit : ' || sqlerrm;
  end;
  perform pg_temp.as_postgres();

  raise exception 'RAPPORT%', report;
end $t$;
