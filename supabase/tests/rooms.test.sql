-- Salas (T9, RULES.md §1 v6): criar, entrar com o código, sair, começar e reiniciar.
-- Corre no Supabase local: `npm run test:db`.
-- Jogadores: Ana (…1a1), Bruno (…1b1), Carla (…1c1), Dina (…1d1) e Fábio (…1f1, conta nova sem nome).
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000001a1', 'ana@rooms.test'),
  ('00000000-0000-0000-0000-0000000001b1', 'bruno@rooms.test'),
  ('00000000-0000-0000-0000-0000000001c1', 'carla@rooms.test'),
  ('00000000-0000-0000-0000-0000000001d1', 'dina@rooms.test'),
  ('00000000-0000-0000-0000-0000000001f1', 'fabio@rooms.test');
insert into public.players (id, name) values
  ('00000000-0000-0000-0000-0000000001a1', 'Ana'),
  ('00000000-0000-0000-0000-0000000001b1', 'Bruno'),
  ('00000000-0000-0000-0000-0000000001c1', 'Carla'),
  ('00000000-0000-0000-0000-0000000001d1', 'Dina');

-- Códigos: 6 caracteres, sem 0/O nem 1/I/L.
select is(
  (select count(*)::int from generate_series(1, 500) where public.new_room_code() !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  0, '500 códigos sorteados, todos com 6 caracteres sem letras ambíguas');

set local role authenticated;

-- ── Fábio ainda não escolheu o nome ──────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001f1", "role": "authenticated"}', true);
select throws_ok($$select public.create_room()$$, 'P0001', 'NO_NAME', 'sem nome não cria salas');
select throws_ok($$select public.join_room('ABCDEF')$$, 'P0001', 'NO_NAME', 'sem nome não entra em salas');

-- ── Ana cria a sala ──────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001a1", "role": "authenticated"}', true);
select id as room, code from public.create_room() \gset
select is((select status from public.rooms where id = :room), 'lobby', 'a sala nasce em lobby');
select is((select kind from public.rooms where id = :room), 'people', 'sala de pessoas');
select is((select admin_id from public.rooms where id = :room), '00000000-0000-0000-0000-0000000001a1'::uuid, 'quem cria é o admin');
select is((select count(*)::int from public.room_players where room_id = :room), 1, 'e o primeiro jogador');
select throws_ok(format($$select public.start_room(%s)$$, :room), 'P0001', 'TOO_FEW_PLAYERS', 'sozinha não começa');

-- ── Bruno entra com o código ─────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001b1", "role": "authenticated"}', true);
select is((select count(*)::int from public.rooms), 0, 'antes de entrar não vê a sala');
select is(public.join_room(lower(:'code') || '  '), :room::bigint, 'entra com o código em minúsculas e com espaços');
select is(public.join_room(:'code'), :room::bigint, 'entrar outra vez não faz nada');
select is((select count(*)::int from public.room_players where room_id = :room), 2, 'sem jogadores repetidos');
select is((select count(*)::int from public.rooms), 1, 'depois de entrar já vê a sala');
select throws_ok($$select public.join_room('ZZZZZZ')$$, 'P0001', 'ROOM_NOT_FOUND', 'código que não existe');
select throws_ok(format($$select public.start_room(%s)$$, :room), 'P0001', 'NOT_ADMIN', 'só o admin começa');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001a1", "role": "authenticated"}', true);
select throws_ok(format($$select public.start_room(%s)$$, :room), 'P0001', 'TOO_FEW_PLAYERS', 'com 2 não começa');

-- ── Carla entra; a Ana (admin) sai e o admin passa para o Bruno, que entrou há mais tempo ───
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001c1", "role": "authenticated"}', true);
select is(public.join_room(:'code'), :room::bigint, 'Carla entra');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001a1", "role": "authenticated"}', true);
select lives_ok(format($$select public.leave_room(%s)$$, :room), 'a admin sai no lobby');
select is((select count(*)::int from public.rooms), 0, 'depois de sair já não vê a sala');
select is(public.join_room(:'code'), :room::bigint, 'volta a entrar');
select is((select admin_id from public.rooms where id = :room), '00000000-0000-0000-0000-0000000001b1'::uuid,
  'o admin passou para o Bruno, que entrou antes da Carla');
select throws_ok(format($$select public.start_room(%s)$$, :room), 'P0001', 'NOT_ADMIN', 'a Ana já não é admin');

-- ── Dina, fora da sala ───────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001d1", "role": "authenticated"}', true);
select throws_ok(format($$select public.start_room(%s)$$, :room), 'P0001', 'ROOM_NOT_FOUND', 'quem não está na sala não a começa');
select throws_ok(format($$select public.leave_room(%s)$$, :room), 'P0001', 'ROOM_NOT_FOUND', 'nem sai dela');

-- ── Bruno começa: noite 1 aberta já, lista fixa ──────────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001b1", "role": "authenticated"}', true);
select public.start_room(:room) as game \gset
select is((select status from public.rooms where id = :room), 'running', 'a sala fica a decorrer');
select is((select start_date from public.games where id = :game), (now() at time zone 'Europe/Lisbon')::date,
  'a noite 1 é hoje');
select ok(public.night_is_open(:game, 1), 'a noite 1 está aberta logo depois de Começar');
select is((select count(*)::int from public.game_players where game_id = :game), 3, 'a partida tem os 3 jogadores');
select lives_ok(
  format($$insert into public.actions values (%s, 1, '00000000-0000-0000-0000-0000000001b1', 'DEFEND', null)$$, :game),
  'escolhe já a noite 1');
select throws_ok(format($$select public.start_room(%s)$$, :room), 'P0001', 'ROOM_NOT_IN_LOBBY', 'não começa duas vezes');
select throws_ok(format($$select public.restart_room(%s)$$, :room), 'P0001', 'ROOM_NOT_FINISHED', 'não reinicia a meio');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001c1", "role": "authenticated"}', true);
select throws_ok(format($$select public.leave_room(%s)$$, :room), 'P0001', 'ROOM_NOT_IN_LOBBY', 'não se sai a meio');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001d1", "role": "authenticated"}', true);
select throws_ok(format($$select public.join_room('%s')$$, :'code'), 'P0001', 'ROOM_NOT_IN_LOBBY', 'não se entra a meio');

-- ── Fim da partida (resolve-night) e reinício ────────────────────────────────
reset role;
insert into public.nights (game_id, night, seed, resolved_at, summary) values (:game, 1, 1, now(), '{"players": [], "caught": []}');
select public.finish_game(:game, 1,
  '[{"player_id": "00000000-0000-0000-0000-0000000001b1", "rank": 1, "points": 50, "successful_attacks": 0}]');
set local role authenticated;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001a1", "role": "authenticated"}', true);
select is((select status from public.rooms where id = :room), 'finished', 'a sala acabou');
select is((select count(*)::int from public.nights where game_id = :game), 1, 'acabada, a partida ainda se vê: as rondas');
select is((select count(*)::int from public.rankings where game_id = :game), 1, 'e o ranking final');
select throws_ok(format($$select public.restart_room(%s)$$, :room), 'P0001', 'NOT_ADMIN', 'só o admin reinicia');

-- Reiniciar acaba a partida: as partidas anteriores não se veem, nem para quem as jogou (decisão do Walter).
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001b1", "role": "authenticated"}', true);
select lives_ok(format($$select public.restart_room(%s)$$, :room), 'o admin reinicia');
select is((select status || ':' || code from public.rooms where id = :room), 'lobby:' || :'code', 'volta ao lobby, com o mesmo código');
select is((select count(*)::int from public.room_players where room_id = :room), 3, 'com os mesmos jogadores');
select is((select count(*)::int from public.games where room_id = :room), 0, 'a partida anterior já não se vê');
select is((select count(*)::int from public.nights where game_id = :game), 0, 'nem as suas rondas');
select is((select count(*)::int from public.rankings where game_id = :game), 0, 'nem o ranking');
select is((select count(*)::int from public.game_players where game_id = :game), 0, 'nem quem a jogou');
select is((select count(*)::int from public.actions where game_id = :game), 0, 'nem as minhas ações dessa partida');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001d1", "role": "authenticated"}', true);
select is(public.join_room(:'code'), :room::bigint, 'depois de reiniciar, entra gente nova');
select is((select count(*)::int from public.games where room_id = :room), 0, 'quem entra também não vê a partida anterior');

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001c1", "role": "authenticated"}', true);
select lives_ok(format($$select public.leave_room(%s)$$, :room), 'e sai quem quiser');
select is((select count(*)::int from public.rooms where id = :room), 0, 'quem saiu já não vê a sala');
select is((select count(*)::int from public.games where id = :game), 0, 'nem a partida que jogou');
select is((select count(*)::int from public.players where id = '00000000-0000-0000-0000-0000000001b1'), 0,
  'nem os nomes de quem jogou com ela');

-- ── O último a sair apaga a sala ─────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001d1", "role": "authenticated"}', true);
select id as solo from public.create_room() \gset
select lives_ok(format($$select public.leave_room(%s)$$, :solo), 'a admin sozinha sai');
reset role;
select is((select count(*)::int from public.rooms where id = :solo), 0, 'a sala vazia foi apagada');

-- ── Sala contra bots: ninguém mais entra ─────────────────────────────────────
insert into public.rooms (admin_id, kind) values ('00000000-0000-0000-0000-0000000001a1', 'bots') returning code as bots \gset
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000001b1", "role": "authenticated"}', true);
select throws_ok(format($$select public.join_room('%s')$$, :'bots'), 'P0001', 'ROOM_NOT_FOUND', 'não se entra numa sala contra bots');

-- ── Uma sala contra bots não começa pelo start_room (T11) ────────────────────
reset role;
insert into public.rooms (admin_id, kind) values ('00000000-0000-0000-0000-0000000001b1', 'bots') returning id as botsroom \gset
insert into public.room_players (room_id, player_id) values
  (:botsroom, '00000000-0000-0000-0000-0000000001a1'),
  (:botsroom, '00000000-0000-0000-0000-0000000001b1'),
  (:botsroom, '00000000-0000-0000-0000-0000000001c1');
set local role authenticated;
select throws_ok(format($$select public.start_room(%s)$$, :botsroom), 'P0001', 'NOT_PEOPLE_ROOM', 'sala contra bots');

-- ── Funções internas ─────────────────────────────────────────────────────────
select throws_ok($$select public.new_room_code()$$, '42501', null, 'authenticated não sorteia códigos');
select throws_ok(format($$select public.my_room_for_update(%s)$$, :room), '42501', null, 'nem chama a função interna');

select * from finish();
rollback;
