-- Painel de administração da app (T23, RULES.md §7 v10). Corre no Supabase local: `npm run test:db`.
-- Jogadores: Ana (…5a1, admin da app, sem salas), Bruno (…5b1), Carla (…5c1) e Duarte (…5d1).
-- Salas: a do Bruno, de pessoas, a decorrer (com a Carla e o Duarte, uma noite resolvida, ações, ledger);
-- o lobby da Carla; a sala contra bots do Duarte, acabada (com ranking).
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000005a1', 'ana@painel.test'),
  ('00000000-0000-0000-0000-0000000005b1', 'bruno@painel.test'),
  ('00000000-0000-0000-0000-0000000005c1', 'carla@painel.test'),
  ('00000000-0000-0000-0000-0000000005d1', 'duarte@painel.test');
insert into public.players (id, name) values
  ('00000000-0000-0000-0000-0000000005a1', 'Ana'),
  ('00000000-0000-0000-0000-0000000005b1', 'Bruno'),
  ('00000000-0000-0000-0000-0000000005c1', 'Carla'),
  ('00000000-0000-0000-0000-0000000005d1', 'Duarte');
-- Como o Walter faz no SQL Editor (DEPLOY.md), pelo email.
insert into public.app_admins
select p.id from public.players p join auth.users u on u.id = p.id where u.email = 'ana@painel.test';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005b1", "role": "authenticated"}', true);
select id as running, code as running_code from public.create_room() \gset
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005c1", "role": "authenticated"}', true);
select public.join_room(:'running_code');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005d1", "role": "authenticated"}', true);
select public.join_room(:'running_code');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005b1", "role": "authenticated"}', true);
select public.start_room(:running) as running_game \gset
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005c1", "role": "authenticated"}', true);
select id as lobby from public.create_room() \gset
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005d1", "role": "authenticated"}', true);
select id as bots from public.create_bots_room(2) \gset

reset role;
select id as bots_game from public.games where room_id = :bots \gset
insert into public.actions values (:running_game, 1, '00000000-0000-0000-0000-0000000005b1', 'ATTACK',
  '00000000-0000-0000-0000-0000000005c1');
insert into public.nights (game_id, night, seed, resolved_at, summary)
values (:running_game, 1, 1, now(), '{"players": [], "caught": []}');
insert into public.ledger (game_id, night, player_id, delta, reason, target_id)
values (:running_game, 1, '00000000-0000-0000-0000-0000000005b1', 10, 'ATTACK_SUCCESS', '00000000-0000-0000-0000-0000000005c1');
select public.finish_game(:bots_game, 1,
  '[{"player_id": "00000000-0000-0000-0000-0000000005d1", "rank": 1, "points": 50, "successful_attacks": 0}]');

-- ── Quem é o admin da app ────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005a1", "role": "authenticated"}', true);
select is(public.is_app_admin(), true, 'a Ana é a admin da app');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005b1", "role": "authenticated"}', true);
select is(public.is_app_admin(), false, 'o Bruno não é');
select throws_ok($$select * from public.admin_list_rooms()$$, 'P0001', 'NOT_APP_ADMIN',
  'um jogador normal não vê o painel');
-- A tabela não se lê nem se escreve pela API, nem pela própria admin.
select throws_ok($$select * from public.app_admins$$, '42501', null, 'o Bruno não lê app_admins');
select throws_ok($$insert into public.app_admins values ('00000000-0000-0000-0000-0000000005b1')$$, '42501', null,
  'nem se põe lá');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005a1", "role": "authenticated"}', true);
select throws_ok($$delete from public.app_admins$$, '42501', null, 'nem a Ana mexe na tabela pela API');
reset role;
set local role anon;
select throws_ok($$select public.is_app_admin()$$, '42501', null, 'o anon não pergunta');
select throws_ok($$select * from public.admin_list_rooms()$$, '42501', null, 'nem vê o painel');
reset role;

-- ── O que a Ana vê no painel ─────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000005a1", "role": "authenticated"}', true);
select is((select count(*)::int from public.admin_list_rooms() where room_id in (:running, :lobby, :bots)), 3,
  'vê as salas de todos, sem estar em nenhuma');
select is((select row(kind, status, admin_name, players, resolved_nights)::text
           from public.admin_list_rooms() where room_id = :running),
  row('people', 'running', 'Bruno', array['Bruno', 'Carla', 'Duarte'], 1)::text,
  'a sala a decorrer: tipo, estado, admin, jogadores e noites resolvidas');
select is((select start_date from public.admin_list_rooms() where room_id = :running),
  (now() at time zone 'Europe/Lisbon')::date, 'com o dia da noite 1');
select isnt((select last_resolved_at from public.admin_list_rooms() where room_id = :running), null,
  'e a hora da última resolução');
select is((select code from public.admin_list_rooms() where room_id = :running), :'running_code', 'e o código');
select is((select row(status, admin_name, players, start_date)::text from public.admin_list_rooms() where room_id = :lobby),
  row('lobby', 'Carla', array['Carla'], null::date)::text, 'o lobby, sem partida');
select is((select row(kind, status, admin_name)::text from public.admin_list_rooms() where room_id = :bots),
  row('bots', 'finished', 'Duarte')::text, 'a sala contra bots, acabada');
select is((select cardinality(players) from public.admin_list_rooms() where room_id = :bots), 3, 'com os bots');
-- Só metadados: o resultado tem estas colunas e nenhuma outra (nada de ações, pontos, ledger nem rankings).
select is(pg_get_function_result('public.admin_list_rooms()'::regprocedure),
  'TABLE(room_id bigint, code text, kind text, status text, admin_name text, players text[], created_at timestamp with time zone, start_date date, resolved_nights integer, last_resolved_at timestamp with time zone)',
  'o painel só devolve metadados');

-- ── A Ana não ganha leitura direta das tabelas de jogo ───────────────────────
select is((select count(*)::int from public.rooms), 0, 'a Ana não lê as salas dos outros');
select is((select count(*)::int from public.room_players), 0, 'nem quem lá está');
select is((select count(*)::int from public.games), 0, 'nem as partidas');
select is((select count(*)::int from public.actions), 0, 'nem as ações');
select is((select count(*)::int from public.nights), 0, 'nem as noites');
select is((select count(*)::int from public.ledger), 0, 'nem o ledger');
select is((select count(*)::int from public.rankings), 0, 'nem os rankings');
select is((select count(*)::int from public.players), 1, 'dos jogadores, só se vê a si própria');

select * from finish();
rollback;
