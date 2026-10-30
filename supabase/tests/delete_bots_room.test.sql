-- Apagar a sala contra bots (T17, RULES.md §1.2 v8). Corre no Supabase local: `npm run test:db`.
-- Jogadores: Ana (…3a1) e Bruno (…3b1), cada um com a sua sala contra bots, e os dois numa sala de pessoas
-- com a Carla (…3c1), a decorrer.
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000003a1', 'ana@apagar.test'),
  ('00000000-0000-0000-0000-0000000003b1', 'bruno@apagar.test'),
  ('00000000-0000-0000-0000-0000000003c1', 'carla@apagar.test');
insert into public.players (id, name) values
  ('00000000-0000-0000-0000-0000000003a1', 'Ana'),
  ('00000000-0000-0000-0000-0000000003b1', 'Bruno'),
  ('00000000-0000-0000-0000-0000000003c1', 'Carla');

set local role authenticated;
-- A sala de pessoas: a Ana é a admin; começa com os 3.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000003a1", "role": "authenticated"}', true);
select id as people, code as people_code from public.create_room() \gset
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000003b1", "role": "authenticated"}', true);
select public.join_room(:'people_code');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000003c1", "role": "authenticated"}', true);
select public.join_room(:'people_code');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000003a1", "role": "authenticated"}', true);
select public.start_room(:people) as people_game \gset
-- As salas contra bots: a Ana com 3 bots, o Bruno com 2.
select id as ana_room from public.create_bots_room(3) \gset
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000003b1", "role": "authenticated"}', true);
select id as bruno_room from public.create_bots_room(2) \gset

-- A sala da Ana a meio: uma ação, uma noite resolvida com ledger, e uma ação da noite 2.
reset role;
select id as ana_game from public.games where room_id = :ana_room \gset
select id as bruno_game from public.games where room_id = :bruno_room \gset
select id as ana_bot from public.players where bot_room_id = :ana_room order by name limit 1 \gset
insert into public.actions values (:ana_game, 1, '00000000-0000-0000-0000-0000000003a1', 'ATTACK', :'ana_bot');
insert into public.nights (game_id, night, seed, resolved_at, summary)
values (:ana_game, 1, 1, now(), '{"players": [], "caught": []}');
insert into public.ledger (game_id, night, player_id, delta, reason, target_id)
values (:ana_game, 1, '00000000-0000-0000-0000-0000000003a1', 10, 'ATTACK_SUCCESS', :'ana_bot');
insert into public.actions values (:ana_game, 2, :'ana_bot', 'STAY', null);
-- E na sala do Bruno e na de pessoas também há dados, que não podem mexer.
insert into public.actions values (:bruno_game, 1, '00000000-0000-0000-0000-0000000003b1', 'DEFEND', null);
insert into public.actions values (:people_game, 1, '00000000-0000-0000-0000-0000000003a1', 'DEFEND', null);
set local role authenticated;

-- ── Quem não pode ─────────────────────────────────────────────────────────────
-- O Bruno não está na sala da Ana: para ele, é como se não existisse.
select throws_ok(format($$select public.delete_bots_room(%s)$$, :ana_room), 'P0001', 'ROOM_NOT_FOUND',
  'o Bruno não apaga a sala da Ana');
-- Numa sala de pessoas: sem ser o admin, NOT_ADMIN; o admin, NOT_BOTS_ROOM.
select throws_ok(format($$select public.delete_bots_room(%s)$$, :people), 'P0001', 'NOT_ADMIN',
  'um não-admin não apaga a sala de pessoas');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000003a1", "role": "authenticated"}', true);
select throws_ok(format($$select public.delete_bots_room(%s)$$, :people), 'P0001', 'NOT_BOTS_ROOM',
  'nem o admin: nas salas com pessoas isto não existe');
-- Sem sessão, nem se chama.
reset role;
set local role anon;
select throws_ok(format($$select public.delete_bots_room(%s)$$, :ana_room), '42501', null, 'o anon não chama a função');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000003a1", "role": "authenticated"}', true);

-- ── A Ana apaga a sua sala, a meio ───────────────────────────────────────────
select lives_ok(format($$select public.delete_bots_room(%s)$$, :ana_room), 'a Ana apaga a sua sala a meio');

reset role;
select is((select count(*)::int from public.rooms where id = :ana_room), 0, 'a sala desapareceu');
select is((select count(*)::int from public.room_players where room_id = :ana_room), 0, 'e os seus jogadores');
select is((select count(*)::int from public.games where room_id = :ana_room), 0, 'e a partida');
select is((select count(*)::int from public.game_players where game_id = :ana_game), 0, 'e quem a jogava');
select is((select count(*)::int from public.actions where game_id = :ana_game), 0, 'e as ações');
select is((select count(*)::int from public.nights where game_id = :ana_game), 0, 'e as noites');
select is((select count(*)::int from public.ledger where game_id = :ana_game), 0, 'e o ledger');
select is((select count(*)::int from public.players where bot_room_id = :ana_room), 0, 'e os bots');
select is((select count(*)::int from public.players where id = :'ana_bot'), 0, 'nenhum bot da Ana ficou para trás');
select is((select name from public.players where id = '00000000-0000-0000-0000-0000000003a1'), 'Ana',
  'a Ana continua a existir');
select is((select count(*)::int from auth.users where id = '00000000-0000-0000-0000-0000000003a1'), 1, 'e a sua conta');

-- Nada mais mexeu.
select is((select status from public.rooms where id = :bruno_room), 'running', 'a sala do Bruno continua');
select is((select count(*)::int from public.players where bot_room_id = :bruno_room), 2, 'com os seus bots');
select is((select count(*)::int from public.actions where game_id = :bruno_game), 1, 'e as suas ações');
select is((select status from public.rooms where id = :people), 'running', 'a sala de pessoas continua');
select is((select count(*)::int from public.game_players where game_id = :people_game), 3, 'com os 3, a Ana incluída');
select is((select count(*)::int from public.actions where game_id = :people_game), 1, 'e a ação da Ana nela');

-- ── O Bruno apaga a sua, acabada ─────────────────────────────────────────────
select public.finish_game(:bruno_game, 1,
  '[{"player_id": "00000000-0000-0000-0000-0000000003b1", "rank": 1, "points": 50, "successful_attacks": 0}]');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000003b1", "role": "authenticated"}', true);
select lives_ok(format($$select public.delete_bots_room(%s)$$, :bruno_room), 'o Bruno apaga a sua sala acabada');
reset role;
select is((select count(*)::int from public.rankings where game_id = :bruno_game), 0, 'com o ranking');
select is((select count(*)::int from public.rooms where id = :people), 1, 'e a de pessoas continua lá');

select * from finish();
rollback;
