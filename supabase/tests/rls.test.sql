-- RLS e validação das ações (T3). Corre no Supabase local: `npx supabase start` e `npm run test:db`.
-- Jogadores: Ana (…a), Bruno (…b), Carla (…c) e Dina (…d, fora do jogo 1).
begin;
create extension if not exists pgtap with schema extensions;
select plan(61);

-- Fixtures, como postgres (sem RLS).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'bruno@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'carla@test.local'),
  ('00000000-0000-0000-0000-00000000000d', 'dina@test.local');
insert into public.players (id, name) values
  ('00000000-0000-0000-0000-00000000000a', 'Ana'),
  ('00000000-0000-0000-0000-00000000000b', 'Bruno'),
  ('00000000-0000-0000-0000-00000000000c', 'Carla'),
  ('00000000-0000-0000-0000-00000000000d', 'Dina');

-- Jogo 1: a correr, hoje é o dia 5 (noite 4). Jogo 2: em preparação. Jogo 3: acabado.
insert into public.games (id, start_date, status) overriding system value values
  (1, (now() at time zone 'Europe/Lisbon')::date - 4, 'running'),
  (2, (now() at time zone 'Europe/Lisbon')::date, 'prep'),
  (3, (now() at time zone 'Europe/Lisbon')::date - 11, 'finished');
insert into public.game_players (game_id, player_id) values
  (1, '00000000-0000-0000-0000-00000000000a'),
  (1, '00000000-0000-0000-0000-00000000000b'),
  (1, '00000000-0000-0000-0000-00000000000c'),
  (2, '00000000-0000-0000-0000-00000000000a'),
  (2, '00000000-0000-0000-0000-00000000000b'),
  (3, '00000000-0000-0000-0000-00000000000a'),
  (3, '00000000-0000-0000-0000-00000000000b');

-- Noites 1 a 3 do jogo 1, sem o trigger (que só aceita a noite atual).
-- Ana gastou os 3 ataques (o último no Bruno); Bruno gastou as 2 defesas e a bomba (na Ana);
-- Carla gastou os 2 Desaparecer.
alter table public.actions disable trigger validate_action;
insert into public.actions (game_id, night, player_id, type, target_id) values
  (1, 1, '00000000-0000-0000-0000-00000000000a', 'ATTACK', '00000000-0000-0000-0000-00000000000b'),
  (1, 2, '00000000-0000-0000-0000-00000000000a', 'ATTACK', '00000000-0000-0000-0000-00000000000c'),
  (1, 3, '00000000-0000-0000-0000-00000000000a', 'ATTACK', '00000000-0000-0000-0000-00000000000b'),
  (1, 1, '00000000-0000-0000-0000-00000000000b', 'DEFEND', null),
  (1, 2, '00000000-0000-0000-0000-00000000000b', 'DEFEND', null),
  (1, 3, '00000000-0000-0000-0000-00000000000b', 'BOMB', '00000000-0000-0000-0000-00000000000a'),
  (1, 1, '00000000-0000-0000-0000-00000000000c', 'VANISH', null),
  (1, 2, '00000000-0000-0000-0000-00000000000c', 'VANISH', null);
alter table public.actions enable trigger validate_action;

-- Noite 1 resolvida, noite 2 ainda não.
insert into public.nights (game_id, night, seed, resolved_at, summary) values
  (1, 1, 11, now(), '{"players": []}'),
  (1, 2, 12, null, null);
insert into public.ledger (game_id, night, player_id, delta, reason, target_id) values
  (1, 1, '00000000-0000-0000-0000-00000000000a', 10, 'ATTACK_SUCCESS', '00000000-0000-0000-0000-00000000000b'),
  (1, 1, '00000000-0000-0000-0000-00000000000b', -10, 'VICTIM', null),
  (3, 1, '00000000-0000-0000-0000-00000000000a', 10, 'ATTACK_SUCCESS', '00000000-0000-0000-0000-00000000000b'),
  (3, 1, '00000000-0000-0000-0000-00000000000b', -10, 'VICTIM', null);

-- Ranking final do ciclo acabado (3) e um ranking indevido num ciclo a correr (1), para a RLS o esconder.
insert into public.rankings (game_id, player_id, rank, points, successful_attacks) values
  (3, '00000000-0000-0000-0000-00000000000a', 1, 60, 1),
  (3, '00000000-0000-0000-0000-00000000000b', 2, 40, 0),
  (1, '00000000-0000-0000-0000-00000000000a', 1, 60, 1);

-- ── Ana ──────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);

select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000a', 'ATTACK', '00000000-0000-0000-0000-00000000000c')$$,
  'P0001', 'QUOTA_EXHAUSTED', 'Visita sem quota: Ana já fez 3');
select throws_ok(
  $$insert into public.actions values (1, 3, '00000000-0000-0000-0000-00000000000a', 'STAY', null)$$,
  'P0001', 'NIGHT_CLOSED', 'não escolhe numa noite passada');
select throws_ok(
  $$insert into public.actions values (1, 5, '00000000-0000-0000-0000-00000000000a', 'STAY', null)$$,
  'P0001', 'NIGHT_CLOSED', 'não escolhe numa noite futura');
select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000a', 'BOMB', '00000000-0000-0000-0000-00000000000a')$$,
  'P0001', 'SELF_TARGET', 'não é alvo de si própria');
select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000a', 'BOMB', null)$$,
  'P0001', 'TARGET_REQUIRED', 'Reunião sem alvo');
select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000a', 'BOMB', '00000000-0000-0000-0000-00000000000d')$$,
  'P0001', 'UNKNOWN_TARGET', 'alvo que não está no ciclo');
select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000a', 'DEFEND', '00000000-0000-0000-0000-00000000000b')$$,
  'P0001', 'UNEXPECTED_TARGET', 'Segurança com alvo');
select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000a', 'SLEEP', null)$$,
  'P0001', 'UNKNOWN_TYPE', 'ação desconhecida');
select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000b', 'STAY', null)$$,
  '42501', null, 'não escolhe pelo Bruno');
select throws_ok(
  $$insert into public.actions values (2, 1, '00000000-0000-0000-0000-00000000000a', 'STAY', null)$$,
  'P0001', 'NIGHT_CLOSED', 'sem ações na preparação');
select throws_ok(
  $$insert into public.actions values (3, 9, '00000000-0000-0000-0000-00000000000a', 'STAY', null)$$,
  'P0001', 'NIGHT_CLOSED', 'sem ações num ciclo acabado');

select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000a', 'BOMB', '00000000-0000-0000-0000-00000000000b')$$,
  'P0001', 'SAME_TARGET', 'não ataca o Bruno duas noites seguidas');
select lives_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000a', 'BOMB', '00000000-0000-0000-0000-00000000000c')$$,
  'Ana escolhe Reunião de emergência na Carla');
select throws_ok(
  $$update public.actions set type = 'ATTACK' where night = 4$$,
  'P0001', 'QUOTA_EXHAUSTED', 'não muda para uma ação sem quota');
select lives_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000a', 'STAY', null)
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
select is((select array_agg(night)::int[] from public.nights), '{1}'::int[], 'só vê noites resolvidas');
select is((select count(*)::int from public.ledger where game_id = 1 and player_id <> auth.uid()), 0,
  'não vê pontos dos outros durante o ciclo');
select is((select sum(delta)::int from public.ledger where game_id = 1), 10, 'vê os seus pontos');
select is((select count(*)::int from public.ledger where game_id = 3 and player_id <> auth.uid()), 0,
  'nem no fim do ciclo vê o ledger dos outros (privado para sempre)');
select is((select count(*)::int from public.rankings where game_id = 3), 2, 'vê o ranking final de um ciclo acabado');
select is((select count(*)::int from public.rankings where game_id = 1), 0, 'não vê o ranking de um ciclo a correr');
select throws_ok(
  $$insert into public.rankings values (1, '00000000-0000-0000-0000-00000000000a', 1, 100, 9)$$,
  '42501', null, 'não escreve rankings');
-- Só os jogadores deste teste: o seed.sql pode ter outros.
select is((select count(*)::int from public.players where id in (
  '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b',
  '00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000d')), 4, 'vê todos os jogadores');
select is((select count(*)::int from public.game_players), 7, 'vê todas as inscrições');
select throws_ok(
  $$insert into public.ledger (game_id, night, player_id, delta, reason) values (1, 4, '00000000-0000-0000-0000-00000000000a', 100, 'X')$$,
  '42501', null, 'não escreve pontos');
select throws_ok(
  $$insert into public.nights (game_id, night, seed) values (1, 4, 1)$$,
  '42501', null, 'não escreve noites');
with u as (update public.games set status = 'finished' where id = 1 returning 1)
select is(count(*)::int, 0, 'não muda o estado do jogo') from u;
with u as (update public.players set name = 'Ana' where id <> auth.uid() returning 1)
select is(count(*)::int, 0, 'não muda os nomes') from u;

-- ── Bruno ────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated"}', true);

select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000b', 'DEFEND', null)$$,
  'P0001', 'QUOTA_EXHAUSTED', 'Segurança sem quota: Bruno já fez 2');
select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000b', 'BOMB', '00000000-0000-0000-0000-00000000000c')$$,
  'P0001', 'QUOTA_EXHAUSTED', 'Reunião sem quota: Bruno já fez 1');
select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000b', 'ATTACK', '00000000-0000-0000-0000-00000000000a')$$,
  'P0001', 'SAME_TARGET', 'a Reunião da noite anterior na Ana também conta');
select lives_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000b', 'ATTACK', '00000000-0000-0000-0000-00000000000c')$$,
  'Bruno escolhe Visita surpresa à Carla');
select is((select count(*)::int from public.actions where player_id <> auth.uid()), 0,
  'Bruno não vê as ações da Ana, nem a desta noite');
select is((select count(*)::int from public.ledger where game_id = 1 and player_id <> auth.uid()), 0,
  'Bruno não vê os pontos da Ana');
with u as (update public.actions set type = 'STAY', target_id = null where player_id <> auth.uid() returning 1)
select is(count(*)::int, 0, 'Bruno não muda as ações da Ana') from u;

-- ── Dina (fora do jogo 1) ────────────────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated"}', true);

select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000d', 'STAY', null)$$,
  'P0001', 'UNKNOWN_PLAYER', 'quem não está inscrito não joga');
select throws_ok(
  $$insert into public.game_players values (1, '00000000-0000-0000-0000-00000000000d')$$,
  '42501', null, 'não entra num ciclo a correr');

-- ── Carla: Desaparecer e inscrição ───────────────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated"}', true);

select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000c', 'VANISH', '00000000-0000-0000-0000-00000000000a')$$,
  'P0001', 'UNEXPECTED_TARGET', 'Desaparecer não tem alvo');
select throws_ok(
  $$insert into public.actions values (1, 4, '00000000-0000-0000-0000-00000000000c', 'VANISH', null)$$,
  'P0001', 'QUOTA_EXHAUSTED', 'terceiro Desaparecer: Carla já fez 2');

select lives_ok(
  $$insert into public.game_players values (2, '00000000-0000-0000-0000-00000000000c')$$,
  'entra na preparação');
with d as (delete from public.game_players where game_id = 2 and player_id = auth.uid() returning 1)
select is(count(*)::int, 1, 'sai na preparação') from d;
select throws_ok(
  $$insert into public.game_players values (3, '00000000-0000-0000-0000-00000000000c')$$,
  '42501', null, 'não entra num ciclo acabado');
with d as (delete from public.game_players where game_id = 1 and player_id = auth.uid() returning 1)
select is(count(*)::int, 0, 'não sai a meio do ciclo') from d;
select throws_ok(
  $$insert into public.game_players values (2, '00000000-0000-0000-0000-00000000000d')$$,
  '42501', null, 'não inscreve outros');
with d as (delete from public.game_players where game_id = 2 and player_id <> auth.uid() returning 1)
select is(count(*)::int, 0, 'não tira outros') from d;

-- ── anon ─────────────────────────────────────────────────────────────────────
reset role;
set local role anon;
select is((select count(*)::int from public.actions), 0, 'anon não vê ações');
select is((select count(*)::int from public.ledger), 0, 'anon não vê pontos');
select is((select count(*)::int from public.players), 0, 'anon não vê jogadores');

-- ── Prazo: 23:59 de Lisboa, com as mudanças de hora ──────────────────────────
reset role;
select is(public.night_at('2026-07-01', '2026-07-10 22:59:59+00'), 9, 'verão: 23:59:59 em Lisboa ainda é a noite 9');
select is(public.night_at('2026-07-01', '2026-07-10 23:00:00+00'), 10, 'verão: 00:00 em Lisboa já é o dia seguinte');
select is(public.night_at('2026-12-01', '2026-12-10 23:59:59+00'), 9, 'inverno: 23:59:59 em Lisboa ainda é a noite 9');
select is(public.night_at('2026-12-01', '2026-12-11 00:00:00+00'), 10, 'inverno: 00:00 em Lisboa já é o dia seguinte');
select is(public.night_at('2026-10-20', '2026-10-24 23:30:00+00'), 5, 'fim de outubro: 00:30 de domingo em Lisboa');
select is(public.night_at('2026-03-20', '2026-03-29 23:00:00+00'), 10, 'fim de março: 00:00 de segunda em Lisboa');

select * from finish();
rollback;
