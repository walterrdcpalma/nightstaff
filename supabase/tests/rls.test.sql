-- RLS por sala e validação das ações (T3, salas na T9). Corre no Supabase local: `npm run test:db`.
-- Jogadores: Ana (…a), Bruno (…b), Carla (…c), Dina (…d), Eva (…e) e Fábio (…f, conta nova sem nome).
-- Salas da Ana: 9001 (a decorrer, jogo 9101), 9002 (lobby) e 9003 (acabada, jogo 9003).
-- Sala da Dina e da Eva: 9004 (a decorrer, jogo 9104). Ninguém partilha sala com as duas.
begin;
create extension if not exists pgtap with schema extensions;
select plan(81);

-- Fixtures, como postgres (sem RLS). Ids altos para não chocar com as sequências.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'bruno@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'carla@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'dina@test.local'),
  ('00000000-0000-0000-0000-00000000000e', 'eva@test.local'),
  ('00000000-0000-0000-0000-00000000000f', 'fabio@test.local');
insert into public.players (id, name) values
  ('00000000-0000-0000-0000-00000000000a', 'Ana'),
  ('00000000-0000-0000-0000-00000000000b', 'Bruno'),
  ('00000000-0000-0000-0000-00000000000c', 'Carla'),
  ('00000000-0000-0000-0000-00000000000d', 'Dina'),
  ('00000000-0000-0000-0000-00000000000e', 'Eva');

insert into public.rooms (id, admin_id, status) overriding system value values
  (9001, '00000000-0000-0000-0000-00000000000a', 'running'),
  (9002, '00000000-0000-0000-0000-00000000000a', 'lobby'),
  (9003, '00000000-0000-0000-0000-00000000000a', 'finished'),
  (9004, '00000000-0000-0000-0000-00000000000d', 'running');
insert into public.room_players (room_id, player_id) values
  (9001, '00000000-0000-0000-0000-00000000000a'),
  (9001, '00000000-0000-0000-0000-00000000000b'),
  (9001, '00000000-0000-0000-0000-00000000000c'),
  (9002, '00000000-0000-0000-0000-00000000000a'),
  (9002, '00000000-0000-0000-0000-00000000000b'),
  (9003, '00000000-0000-0000-0000-00000000000a'),
  (9003, '00000000-0000-0000-0000-00000000000b'),
  (9004, '00000000-0000-0000-0000-00000000000d'),
  (9004, '00000000-0000-0000-0000-00000000000e');

-- Jogo 9101: hoje é a noite 4. Jogo 9103: acabado. Jogo 9104: hoje é a noite 4, na sala da Dina.
insert into public.games (id, room_id, start_date, status) overriding system value values
  (9101, 9001, (now() at time zone 'Europe/Lisbon')::date - 3, 'running'),
  (9103, 9003, (now() at time zone 'Europe/Lisbon')::date - 12, 'finished'),
  (9104, 9004, (now() at time zone 'Europe/Lisbon')::date - 3, 'running');
insert into public.game_players (game_id, player_id) values
  (9101, '00000000-0000-0000-0000-00000000000a'),
  (9101, '00000000-0000-0000-0000-00000000000b'),
  (9101, '00000000-0000-0000-0000-00000000000c'),
  (9103, '00000000-0000-0000-0000-00000000000a'),
  (9103, '00000000-0000-0000-0000-00000000000b'),
  (9104, '00000000-0000-0000-0000-00000000000d'),
  (9104, '00000000-0000-0000-0000-00000000000e');

-- Noites 1 a 3 do jogo 9101, sem o trigger (que só aceita a noite atual).
-- Ana gastou os 3 ataques (o último no Bruno); Bruno gastou as 2 defesas e a bomba (na Ana);
-- Carla gastou os 2 Desaparecer.
alter table public.actions disable trigger validate_action;
insert into public.actions (game_id, night, player_id, type, target_id) values
  (9101, 1, '00000000-0000-0000-0000-00000000000a', 'ATTACK', '00000000-0000-0000-0000-00000000000b'),
  (9101, 2, '00000000-0000-0000-0000-00000000000a', 'ATTACK', '00000000-0000-0000-0000-00000000000c'),
  (9101, 3, '00000000-0000-0000-0000-00000000000a', 'ATTACK', '00000000-0000-0000-0000-00000000000b'),
  (9101, 1, '00000000-0000-0000-0000-00000000000b', 'DEFEND', null),
  (9101, 2, '00000000-0000-0000-0000-00000000000b', 'DEFEND', null),
  (9101, 3, '00000000-0000-0000-0000-00000000000b', 'BOMB', '00000000-0000-0000-0000-00000000000a'),
  (9101, 1, '00000000-0000-0000-0000-00000000000c', 'VANISH', null),
  (9101, 2, '00000000-0000-0000-0000-00000000000c', 'VANISH', null),
  (9104, 1, '00000000-0000-0000-0000-00000000000d', 'DEFEND', null);
alter table public.actions enable trigger validate_action;

-- Noite 1 resolvida, noite 2 ainda não. Na sala da Dina, a noite 1 também está resolvida.
insert into public.nights (game_id, night, seed, resolved_at, summary) values
  (9101, 1, 11, now(), '{"players": []}'),
  (9101, 2, 12, null, null),
  (9104, 1, 13, now(), '{"players": []}');
insert into public.ledger (game_id, night, player_id, delta, reason, target_id) values
  (9101, 1, '00000000-0000-0000-0000-00000000000a', 10, 'ATTACK_SUCCESS', '00000000-0000-0000-0000-00000000000b'),
  (9101, 1, '00000000-0000-0000-0000-00000000000b', -10, 'VICTIM', null),
  (9103, 1, '00000000-0000-0000-0000-00000000000a', 10, 'ATTACK_SUCCESS', '00000000-0000-0000-0000-00000000000b'),
  (9103, 1, '00000000-0000-0000-0000-00000000000b', -10, 'VICTIM', null),
  (9104, 1, '00000000-0000-0000-0000-00000000000d', 2, 'HOME_BONUS', null);

-- Ranking final da partida acabada (9103) e um ranking indevido numa a decorrer (9101), para a RLS o esconder.
insert into public.rankings (game_id, player_id, rank, points, successful_attacks) values
  (9103, '00000000-0000-0000-0000-00000000000a', 1, 60, 1),
  (9103, '00000000-0000-0000-0000-00000000000b', 2, 40, 0),
  (9101, '00000000-0000-0000-0000-00000000000a', 1, 60, 1);

-- ── Ana ──────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000a', 'ATTACK', '00000000-0000-0000-0000-00000000000c')$$,
  'P0001', 'QUOTA_EXHAUSTED', 'Visita sem quota: Ana já fez 3');
select throws_ok(
  $$insert into public.actions values (9101, 3, '00000000-0000-0000-0000-00000000000a', 'STAY', null)$$,
  'P0001', 'NIGHT_CLOSED', 'não escolhe numa noite passada');
select throws_ok(
  $$insert into public.actions values (9101, 5, '00000000-0000-0000-0000-00000000000a', 'STAY', null)$$,
  'P0001', 'NIGHT_CLOSED', 'não escolhe numa noite futura');
select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000a', 'BOMB', '00000000-0000-0000-0000-00000000000a')$$,
  'P0001', 'SELF_TARGET', 'não é alvo de si própria');
select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000a', 'BOMB', null)$$,
  'P0001', 'TARGET_REQUIRED', 'Reunião sem alvo');
select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000a', 'BOMB', '00000000-0000-0000-0000-00000000000d')$$,
  'P0001', 'UNKNOWN_TARGET', 'alvo que não está na partida');
select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000a', 'DEFEND', '00000000-0000-0000-0000-00000000000b')$$,
  'P0001', 'UNEXPECTED_TARGET', 'Segurança com alvo');
select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000a', 'SLEEP', null)$$,
  'P0001', 'UNKNOWN_TYPE', 'ação desconhecida');
select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000b', 'STAY', null)$$,
  '42501', null, 'não escolhe pelo Bruno');
select throws_ok(
  $$insert into public.actions values (9104, 4, '00000000-0000-0000-0000-00000000000a', 'STAY', null)$$,
  'P0001', 'NIGHT_CLOSED', 'sem ações numa partida de outra sala');
select throws_ok(
  $$insert into public.actions values (9103, 9, '00000000-0000-0000-0000-00000000000a', 'STAY', null)$$,
  'P0001', 'NIGHT_CLOSED', 'sem ações numa partida acabada');

select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000a', 'BOMB', '00000000-0000-0000-0000-00000000000b')$$,
  'P0001', 'SAME_TARGET', 'não ataca o Bruno duas noites seguidas');
select lives_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000a', 'BOMB', '00000000-0000-0000-0000-00000000000c')$$,
  'Ana escolhe Reunião de emergência na Carla');
select throws_ok(
  $$update public.actions set type = 'ATTACK' where night = 4$$,
  'P0001', 'QUOTA_EXHAUSTED', 'não muda para uma ação sem quota');
select lives_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000a', 'STAY', null)
    on conflict (game_id, night, player_id) do update set type = excluded.type, target_id = excluded.target_id$$,
  'muda a escolha para Folga (upsert)');
select is((select type from public.actions where night = 4), 'STAY', 'a escolha mudou');
select lives_ok(
  $$update public.actions set type = 'VANISH' where night = 4$$,
  'muda para Desaparecer');
select throws_ok(
  $$update public.actions set night = 3 where night = 4$$,
  'P0001', 'KEY_CHANGED', 'não muda a noite de uma ação');
select throws_ok(
  $$update public.actions set type = 'STAY', target_id = null where night = 1$$,
  'P0001', 'NIGHT_CLOSED', 'não muda uma noite passada (nem recupera quota)');
with d as (delete from public.actions returning 1)
select is(count(*)::int, 0, 'não apaga ações') from d;

select is((select count(*)::int from public.actions), 4, 'vê as suas 4 ações');
select is((select count(*)::int from public.actions where player_id <> auth.uid()), 0, 'não vê ações dos outros');
select is((select array_agg(game_id || ':' || night)::text[] from public.nights), '{9101:1}'::text[],
  'só vê noites resolvidas, e só das suas salas');
select is((select count(*)::int from public.ledger where game_id = 9101 and player_id <> auth.uid()), 0,
  'não vê pontos dos outros durante a partida');
select is((select sum(delta)::int from public.ledger where game_id = 9101), 10, 'vê os seus pontos');
select is((select count(*)::int from public.ledger where game_id = 9103 and player_id <> auth.uid()), 0,
  'nem no fim da partida vê o ledger dos outros (privado para sempre)');
select is((select count(*)::int from public.rankings where game_id = 9103), 2, 'vê o ranking final de uma partida acabada');
select is((select count(*)::int from public.rankings where game_id = 9101), 0, 'não vê o ranking de uma partida a decorrer');
select throws_ok(
  $$insert into public.rankings values (9101, '00000000-0000-0000-0000-00000000000a', 1, 100, 9)$$,
  '42501', null, 'não escreve rankings');
select is((select array_agg(name order by name) from public.players), '{Ana,Bruno,Carla}',
  'vê só os jogadores com quem partilha uma sala (e a si própria)');
select is((select array_agg(id order by id)::int[] from public.rooms), '{9001,9002,9003}', 'vê só as suas salas');
select is((select count(*)::int from public.room_players), 7, 'vê os jogadores das suas salas');
select is((select array_agg(id order by id)::int[] from public.games), '{9101,9103}', 'vê só as partidas das suas salas');
select is((select count(*)::int from public.game_players), 5, 'vê os jogadores das suas partidas');
select is((select count(*)::int from public.ledger where game_id = 9104), 0, 'não vê nada do ledger de outra sala');
with u as (update public.rooms set status = 'finished', admin_id = auth.uid() returning 1)
select is(count(*)::int, 0, 'não muda salas diretamente') from u;
select throws_ok(
  $$insert into public.room_players values (9004, '00000000-0000-0000-0000-00000000000a')$$,
  '42501', null, 'não entra numa sala diretamente (só com join_room)');
select throws_ok(
  $$insert into public.game_players values (9101, '00000000-0000-0000-0000-00000000000d')$$,
  '42501', null, 'não mexe na lista de jogadores de uma partida');
select throws_ok(
  $$insert into public.ledger (game_id, night, player_id, delta, reason) values (9101, 4, '00000000-0000-0000-0000-00000000000a', 100, 'X')$$,
  '42501', null, 'não escreve pontos');
select throws_ok(
  $$insert into public.nights (game_id, night, seed) values (9101, 4, 1)$$,
  '42501', null, 'não escreve noites');
with u as (update public.games set status = 'finished' where id = 9101 returning 1)
select is(count(*)::int, 0, 'não muda o estado da partida') from u;
with u as (update public.players set name = 'Ana' where id <> auth.uid() returning 1)
select is(count(*)::int, 0, 'não muda os nomes') from u;

-- ── Bruno ────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);

select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000b', 'DEFEND', null)$$,
  'P0001', 'QUOTA_EXHAUSTED', 'Segurança sem quota: Bruno já fez 2');
select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000b', 'BOMB', '00000000-0000-0000-0000-00000000000c')$$,
  'P0001', 'QUOTA_EXHAUSTED', 'Reunião sem quota: Bruno já fez 1');
select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000b', 'ATTACK', '00000000-0000-0000-0000-00000000000a')$$,
  'P0001', 'SAME_TARGET', 'a Reunião da noite anterior na Ana também conta');
select lives_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000b', 'ATTACK', '00000000-0000-0000-0000-00000000000c')$$,
  'Bruno escolhe Visita surpresa à Carla');
select is((select count(*)::int from public.actions where player_id <> auth.uid()), 0,
  'Bruno não vê as ações da Ana, nem a desta noite');
select is((select count(*)::int from public.ledger where game_id = 9101 and player_id <> auth.uid()), 0,
  'Bruno não vê os pontos da Ana');
with u as (update public.actions set type = 'STAY', target_id = null where player_id <> auth.uid() returning 1)
select is(count(*)::int, 0, 'Bruno não muda as ações da Ana') from u;

-- ── Dina (outra sala): não vê nada das salas da Ana ─────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);

select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000d', 'STAY', null)$$,
  'P0001', 'NIGHT_CLOSED', 'não joga numa partida de uma sala onde não está');
select is((select array_agg(name order by name) from public.players), '{Dina,Eva}', 'não vê os jogadores da Ana');
select is((select array_agg(id)::int[] from public.rooms), '{9004}', 'não vê as salas da Ana');
select is((select count(*)::int from public.room_players where room_id <> 9004), 0, 'nem quem lá está');
select is((select array_agg(id)::int[] from public.games), '{9104}', 'não vê as partidas da Ana');
select is((select count(*)::int from public.game_players where game_id <> 9104), 0, 'nem os seus jogadores');
select is((select array_agg(game_id || ':' || night)::text[] from public.nights), '{9104:1}'::text[],
  'não vê os resumos das noites da Ana');
select is((select count(*)::int from public.rankings), 0, 'não vê o ranking da Ana, nem com a partida acabada');
select is((select count(*)::int from public.actions), 1, 'vê só a sua ação');
select is((select sum(delta)::int from public.ledger), 2, 'vê só o seu ledger');

-- ── Carla: Desaparecer ───────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);

select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000c', 'VANISH', '00000000-0000-0000-0000-00000000000a')$$,
  'P0001', 'UNEXPECTED_TARGET', 'Desaparecer não tem alvo');
select throws_ok(
  $$insert into public.actions values (9101, 4, '00000000-0000-0000-0000-00000000000c', 'VANISH', null)$$,
  'P0001', 'QUOTA_EXHAUSTED', 'terceiro Desaparecer: Carla já fez 2');


-- ── Fábio: conta nova, ainda sem nome ────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000f", "role": "authenticated"}', true);

select is((select array_agg(name) from public.players), null, 'antes de escolher o nome, não vê ninguém');
select throws_ok(
  $$insert into public.players values ('00000000-0000-0000-0000-00000000000f', '   ')$$,
  '23514', null, 'nome vazio não');
select throws_ok(
  $$insert into public.players values ('00000000-0000-0000-0000-00000000000f', 'Um nome comprido demais para a casa')$$,
  '23514', null, 'nome com mais de 24 caracteres não');
select throws_ok(
  $$insert into public.players values ('00000000-0000-0000-0000-00000000000e', 'Falsa Eva')$$,
  '42501', null, 'não cria o jogador de outra conta');
select lives_ok(
  $$insert into public.players values ('00000000-0000-0000-0000-00000000000f', 'Fábio')$$,
  'escolhe o nome no primeiro login');
with u as (update public.players set name = 'Fabinho' returning name)
select is(array_agg(name), '{Fabinho}', 'muda o próprio nome, e só esse') from u;
select is((select count(*)::int from public.rooms), 0, 'sem salas, não vê nenhuma');

-- ── anon ─────────────────────────────────────────────────────────────────────
reset role;
set local role anon;
select is((select count(*)::int from public.actions), 0, 'anon não vê ações');
select is((select count(*)::int from public.ledger), 0, 'anon não vê pontos');
select is((select count(*)::int from public.players), 0, 'anon não vê jogadores');
select is((select count(*)::int from public.rooms), 0, 'anon não vê salas');
select throws_ok($$select public.create_room()$$, '42501', null, 'anon não cria salas');
select throws_ok($$select public.join_room('ABCDEF')$$, '42501', null, 'anon não entra em salas');

-- ── Prazo: 23:59 de Lisboa, com as mudanças de hora ──────────────────────────
reset role;
select is(public.night_at((now() at time zone 'Europe/Lisbon')::date, now()), 1, 'a noite 1 é o dia do Começar');
select is(public.night_at('2026-07-02', '2026-07-10 22:59:59+00'), 9, 'verão: 23:59:59 em Lisboa ainda é a noite 9');
select is(public.night_at('2026-07-02', '2026-07-10 23:00:00+00'), 10, 'verão: 00:00 em Lisboa já é o dia seguinte');
select is(public.night_at('2026-12-02', '2026-12-10 23:59:59+00'), 9, 'inverno: 23:59:59 em Lisboa ainda é a noite 9');
select is(public.night_at('2026-12-02', '2026-12-11 00:00:00+00'), 10, 'inverno: 00:00 em Lisboa já é o dia seguinte');
select is(public.night_at('2026-10-21', '2026-10-24 23:30:00+00'), 5, 'fim de outubro: 00:30 de domingo em Lisboa');
select is(public.night_at('2026-03-21', '2026-03-29 23:00:00+00'), 10, 'fim de março: 00:00 de segunda em Lisboa');

select * from finish();
rollback;
