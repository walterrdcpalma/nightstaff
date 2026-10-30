-- Expulsar jogadores do lobby (T22, RULES.md §1.1 v9). Corre no Supabase local: `npm run test:db`.
-- Jogadores: Ana (…4a1, admin do lobby), Bruno (…4b1), Carla (…4c1) e Duarte (…4d1). O Bruno está também numa
-- sala de pessoas a decorrer (admin: Duarte) e a Ana tem uma sala contra bots.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000004a1', 'ana@expulsar.test'),
  ('00000000-0000-0000-0000-0000000004b1', 'bruno@expulsar.test'),
  ('00000000-0000-0000-0000-0000000004c1', 'carla@expulsar.test'),
  ('00000000-0000-0000-0000-0000000004d1', 'duarte@expulsar.test');
insert into public.players (id, name) values
  ('00000000-0000-0000-0000-0000000004a1', 'Ana'),
  ('00000000-0000-0000-0000-0000000004b1', 'Bruno'),
  ('00000000-0000-0000-0000-0000000004c1', 'Carla'),
  ('00000000-0000-0000-0000-0000000004d1', 'Duarte');

set local role authenticated;
-- A sala a decorrer do Duarte, com o Bruno e a Carla.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004d1", "role": "authenticated"}', true);
select id as running, code as running_code from public.create_room() \gset
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004b1", "role": "authenticated"}', true);
select public.join_room(:'running_code');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004c1", "role": "authenticated"}', true);
select public.join_room(:'running_code');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004d1", "role": "authenticated"}', true);
select public.start_room(:running) as running_game \gset
-- O lobby da Ana, com o Bruno e a Carla.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004a1", "role": "authenticated"}', true);
select id as lobby, code as lobby_code from public.create_room() \gset
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004b1", "role": "authenticated"}', true);
select public.join_room(:'lobby_code');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004c1", "role": "authenticated"}', true);
select public.join_room(:'lobby_code');
-- A sala contra bots da Ana.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004a1", "role": "authenticated"}', true);
select id as bots from public.create_bots_room(2) \gset
reset role;
select id as bot from public.players where bot_room_id = :bots order by name limit 1 \gset
set local role authenticated;

-- ── Quem não pode ─────────────────────────────────────────────────────────────
-- A Carla não é a admin.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004c1", "role": "authenticated"}', true);
select throws_ok(format($$select public.kick_player(%s, '00000000-0000-0000-0000-0000000004b1')$$, :lobby),
  'P0001', 'NOT_ADMIN', 'um não-admin não expulsa');
-- O Duarte não está no lobby da Ana: para ele, a sala não existe.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004d1", "role": "authenticated"}', true);
select throws_ok(format($$select public.kick_player(%s, '00000000-0000-0000-0000-0000000004b1')$$, :lobby),
  'P0001', 'ROOM_NOT_FOUND', 'quem não está na sala não expulsa');
-- Com a partida a decorrer, a lista é fixa: nem o admin expulsa.
select throws_ok(format($$select public.kick_player(%s, '00000000-0000-0000-0000-0000000004b1')$$, :running),
  'P0001', 'ROOM_NOT_IN_LOBBY', 'numa sala a decorrer não se expulsa');
-- Nas salas contra bots não existe.
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004a1", "role": "authenticated"}', true);
select throws_ok(format($$select public.kick_player(%s, %L)$$, :bots, :'bot'),
  'P0001', 'NOT_PEOPLE_ROOM', 'numa sala contra bots não se expulsa');
-- O admin não se expulsa a si próprio.
select throws_ok(format($$select public.kick_player(%s, '00000000-0000-0000-0000-0000000004a1')$$, :lobby),
  'P0001', 'CANNOT_KICK_SELF', 'o admin não se expulsa');
-- Quem não está na sala não se expulsa.
select throws_ok(format($$select public.kick_player(%s, '00000000-0000-0000-0000-0000000004d1')$$, :lobby),
  'P0001', 'PLAYER_NOT_IN_ROOM', 'não se expulsa quem não está na sala');
-- Sem sessão, nem se chama.
reset role;
set local role anon;
select throws_ok(format($$select public.kick_player(%s, '00000000-0000-0000-0000-0000000004b1')$$, :lobby),
  '42501', null, 'o anon não chama a função');
reset role;
select is((select count(*)::int from public.room_players where room_id = :lobby), 3, 'ninguém saiu do lobby');

-- ── A Ana expulsa o Bruno ────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004a1", "role": "authenticated"}', true);
select lives_ok(format($$select public.kick_player(%s, '00000000-0000-0000-0000-0000000004b1')$$, :lobby),
  'a admin expulsa o Bruno');
-- A Ana já não vê o Bruno no lobby.
select is((select count(*)::int from public.room_players where room_id = :lobby), 2, 'o lobby fica com 2');

-- O Bruno já não vê a sala (a RLS deixa de lha mostrar).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004b1", "role": "authenticated"}', true);
select is((select count(*)::int from public.rooms where id = :lobby), 0, 'o Bruno já não vê a sala');
select is((select count(*)::int from public.room_players where room_id = :lobby), 0, 'nem quem lá está');
-- Mas a outra sala dele continua igual.
select is((select count(*)::int from public.rooms where id = :running), 1, 'a outra sala do Bruno continua');
reset role;
select is((select status from public.rooms where id = :running), 'running', 'a decorrer');
select is((select count(*)::int from public.room_players where room_id = :running), 3, 'com os 3');
select is((select count(*)::int from public.game_players where game_id = :running_game), 3, 'e a partida com os 3');
select is((select name from public.players where id = '00000000-0000-0000-0000-0000000004b1'), 'Bruno',
  'o Bruno continua a existir');
select is((select admin_id::text from public.rooms where id = :lobby), '00000000-0000-0000-0000-0000000004a1',
  'a Ana continua admin');

-- ── O Bruno volta a entrar com o código ──────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000004b1", "role": "authenticated"}', true);
select lives_ok(format($$select public.join_room(%L)$$, :'lobby_code'), 'o Bruno volta a entrar com o código');

select * from finish();
rollback;
