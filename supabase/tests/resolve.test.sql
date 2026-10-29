-- Escrita da resolve-night e pg_cron (T4, salas na T9). Corre no Supabase local: `npm run test:db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

select is((select schedule from cron.job where jobname = 'resolve-night'), '0 * * * *', 'pg_cron de hora a hora, ao minuto 0');
select hasnt_function('public', 'next_cycle', 'já não há ciclos automáticos');

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'resolve@test.local');
insert into public.players (id, name) values ('00000000-0000-0000-0000-0000000000aa', 'Ana');
insert into public.rooms (admin_id, status) values ('00000000-0000-0000-0000-0000000000aa', 'running') returning id as room \gset
insert into public.games (room_id, start_date) values (:room, '2026-01-01') returning id as game \gset

-- apply_night é idempotente.
select is(public.apply_night(:game, 1, 7, '{"players": []}', '[]'), true, 'grava a noite');
select is(public.apply_night(:game, 1, 8, '{"players": []}', '[]'), false, 'a segunda vez não faz nada');
select is((select seed from public.nights where game_id = :game and night = 1), 7, 'fica a primeira resolução');

-- finish_game acaba a partida e a sala e grava o ranking; é idempotente e recusa um ranking vazio.
select throws_ok(
  format($$select public.finish_game(%s, 1, '[]')$$, :game),
  'P0001', 'EMPTY_RANKING', 'não acaba a partida sem ranking');
select is((select status from public.games where id = :game), 'running', 'continua a decorrer');
select is(
  public.finish_game(:game, 77, '[{"player_id": "00000000-0000-0000-0000-0000000000aa", "rank": 1, "points": 52, "successful_attacks": 0}]'),
  true, 'acaba a partida');
select is((select status || ':' || seed from public.games where id = :game), 'finished:77', 'grava o estado e a seed');
select is((select status from public.rooms where id = :room), 'finished', 'a sala acaba com a partida');
select is((select points from public.rankings where game_id = :game), 52, 'grava o ranking');
select is(
  public.finish_game(:game, 78, '[{"player_id": "00000000-0000-0000-0000-0000000000aa", "rank": 1, "points": 0, "successful_attacks": 0}]'),
  false, 'a segunda vez não faz nada');

-- Só a service_role escreve; anon nem as funções do prazo vê.
set local role authenticated;
select throws_ok($$select public.apply_night(1, 2, 1, '{}', '[]')$$, '42501', null, 'authenticated não grava noites');
select throws_ok($$select public.finish_game(1, 1, '[]')$$, '42501', null, 'authenticated não acaba partidas');
reset role;
set local role anon;
select throws_ok($$select public.night_at('2026-01-01', now())$$, '42501', null, 'anon não chama night_at');

select * from finish();
rollback;
