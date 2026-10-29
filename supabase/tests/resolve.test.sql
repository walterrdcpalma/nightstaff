-- Escrita da resolve-night e pg_cron (T4). Corre no Supabase local: `npm run test:db`.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select is((select schedule from cron.job where jobname = 'resolve-night'), '0 * * * *', 'pg_cron de hora a hora, ao minuto 0');

-- apply_night é idempotente.
insert into public.games (start_date, status) values ('2026-01-01', 'running') returning id as game \gset
select is(public.apply_night(:game, 1, 7, '{"players": []}', '[]'), true, 'grava a noite');
select is(public.apply_night(:game, 1, 8, '{"players": []}', '[]'), false, 'a segunda vez não faz nada');
select is((select seed from public.nights where game_id = :game and night = 1), 7, 'fica a primeira resolução');

-- next_cycle é idempotente.
select isnt(public.next_cycle(:game, '2026-01-12'), null, 'cria o ciclo seguinte');
select is(public.next_cycle(:game, '2026-01-12'), null, 'a segunda vez não faz nada');

-- Só a service_role escreve; anon nem as funções do prazo vê.
set local role authenticated;
select throws_ok($$select public.apply_night(1, 2, 1, '{}', '[]')$$, '42501', null, 'authenticated não grava noites');
select throws_ok($$select public.next_cycle(1, '2026-01-12')$$, '42501', null, 'authenticated não cria ciclos');
reset role;
set local role anon;
select throws_ok($$select public.night_at('2026-01-01', now())$$, '42501', null, 'anon não chama night_at');

select * from finish();
rollback;
