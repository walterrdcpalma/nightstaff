-- Salas contra bots (T11, RULES.md §1.2). Corre no Supabase local: `npm run test:db`.
-- Jogadores: Ana (…2a1, joga contra bots) e Bruno (…2b1, outra conta).
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000002a1', 'ana@bots.test'),
  ('00000000-0000-0000-0000-0000000002b1', 'bruno@bots.test');
insert into public.players (id, name) values
  ('00000000-0000-0000-0000-0000000002a1', 'Ana'),
  ('00000000-0000-0000-0000-0000000002b1', 'Bruno');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000002a1", "role": "authenticated"}', true);

-- ── Criar: de 2 a 11 bots, com nomes do staff; começa logo ────────────────────
select throws_ok($$select public.create_bots_room(1)$$, 'P0001', 'BOT_COUNT', 'com 1 bot não');
select throws_ok($$select public.create_bots_room(12)$$, 'P0001', 'BOT_COUNT', 'com 12 bots não');
select id as room, code from public.create_bots_room(3) \gset
select is((select kind || ':' || status from public.rooms where id = :room), 'bots:running', 'sala contra bots, já a decorrer');
select is((select admin_id from public.rooms where id = :room), '00000000-0000-0000-0000-0000000002a1'::uuid, 'a Ana é a admin');
select is(
  (select array_agg(p.name order by rp.joined_at) from public.room_players rp join public.players p on p.id = rp.player_id
   where rp.room_id = :room),
  '{Ana,"Bot Rececionista","Bot Porteiro","Bot Cozinheira"}', 'a Ana e 3 bots com nomes do staff');
select is((select count(*)::int from public.players where bot_room_id = :room), 3, 'os bots são jogadores só desta sala');
select id as game from public.games where room_id = :room \gset
select is((select count(*)::int from public.game_players where game_id = :game), 4, 'a partida tem os 4');
select is((select count(*)::int from public.rooms where id <> :room and kind = 'bots' and admin_id = auth.uid()), 0,
  'os pedidos recusados não criaram salas');

-- ── Noite aberta: a seguinte à última resolvida, a qualquer hora ─────────────
select ok(public.night_is_open(:game, 1), 'a noite 1 está aberta');
select ok(not public.night_is_open(:game, 2), 'a 2 ainda não');
select lives_ok(
  format($$insert into public.actions values (%s, 1, '00000000-0000-0000-0000-0000000002a1', 'DEFEND', null)$$, :game),
  'a Ana escolhe a noite 1');
reset role;
insert into public.nights (game_id, night, seed, resolved_at, summary) values (:game, 1, 1, now(), '{"players": [], "caught": []}');
set local role authenticated;
select ok(not public.night_is_open(:game, 1), 'resolvida a noite 1, fecha');
select ok(public.night_is_open(:game, 2), 'e abre a 2, sem esperar pela meia-noite');
select throws_ok(
  format($$insert into public.actions values (%s, 1, '00000000-0000-0000-0000-0000000002a1', 'STAY', null)$$, :game),
  'P0001', 'NIGHT_CLOSED', 'a noite 1 já não se muda');

-- ── Ninguém mais entra; não se cria nem se muda um bot ───────────────────────
select throws_ok(format($$select public.join_room('%s')$$, :'code'), 'P0001', 'ROOM_NOT_FOUND', 'não se entra com o código');
select throws_ok(format($$select public.start_room(%s)$$, :room), 'P0001', 'NOT_PEOPLE_ROOM', 'não tem Começar');
select throws_ok(format($$select public.leave_room(%s)$$, :room), 'P0001', 'ROOM_NOT_IN_LOBBY', 'não se sai a meio');
select throws_ok(
  format($$insert into public.players (id, name, bot_room_id) values (gen_random_uuid(), 'Bot Falso', %s)$$, :room),
  '42501', null, 'não se criam bots à mão');
with u as (update public.players set name = 'Bot Mau' where bot_room_id = :room returning 1)
select is(count(*)::int, 0, 'nem se mudam os nomes dos bots') from u;
select throws_ok(format($$update public.players set bot_room_id = %s where id = auth.uid()$$, :room),
  '42501', null, 'nem a Ana passa a bot');

-- ── Um bot nunca age por si: não cria salas nem entra nelas ─────────────────
reset role;
select id as bot from public.players where bot_room_id = :room limit 1 \gset
set local role authenticated;
select set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated"}', :'bot'), true);
select throws_ok($$select public.create_room()$$, 'P0001', 'NO_NAME', 'um bot não cria salas');
select throws_ok($$select public.create_bots_room(2)$$, 'P0001', 'NO_NAME', 'nem salas contra bots');
select throws_ok($$select public.join_room('ABCDEF')$$, 'P0001', 'NO_NAME', 'nem entra com um código');
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000002a1", "role": "authenticated"}', true);

-- ── Os bots não aparecem em mais lado nenhum ─────────────────────────────────
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000002b1", "role": "authenticated"}', true);
select is((select count(*)::int from public.players where bot_room_id is not null), 0, 'o Bruno não vê os bots da Ana');
select is((select count(*)::int from public.rooms), 0, 'nem a sala');
select lives_ok($$select public.create_bots_room(2)$$, 'o Bruno cria a sua sala contra bots');
select is((select array_agg(name order by name) from public.players where bot_room_id is not null),
  '{"Bot Porteiro","Bot Rececionista"}', 'e só vê os seus bots');

-- ── Reiniciar: começa logo outra partida, com os mesmos bots ─────────────────
reset role;
select public.finish_game(:game, 1, '[{"player_id": "00000000-0000-0000-0000-0000000002a1", "rank": 1, "points": 50, "successful_attacks": 0}]');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-0000000002a1", "role": "authenticated"}', true);
select is((select status from public.rooms where id = :room), 'finished', 'a sala acabou');
select lives_ok(format($$select public.restart_room(%s)$$, :room), 'a Ana reinicia');
select is((select status from public.rooms where id = :room), 'running', 'sem lobby: já está a decorrer');
select is((select count(*)::int from public.games where room_id = :room and status = 'running'), 1, 'com uma partida nova');
select is(
  (select count(*)::int from public.game_players gp join public.games g on g.id = gp.game_id
   where g.room_id = :room and g.status = 'running'),
  4, 'com os mesmos 3 bots');
select is((select count(*)::int from public.games where id = :game), 0, 'a partida anterior já não se vê');
select is((select count(*)::int from public.ledger where game_id = :game), 0, 'nem o meu ledger dela');

select * from finish();
rollback;
