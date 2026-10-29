-- T4: escrita atómica da resolve-night e pg_cron de hora a hora (CLAUDE.md "Resolução da noite").

-- Grava uma noite resolvida e o seu ledger numa só transação. Idempotente: se a noite já estiver
-- resolvida, não faz nada e devolve false.
create function public.apply_night(p_game_id bigint, p_night integer, p_seed integer, p_summary jsonb, p_ledger jsonb)
returns boolean
language plpgsql set search_path = ''
as $$
begin
  insert into public.nights (game_id, night, seed, resolved_at, summary)
  values (p_game_id, p_night, p_seed, now(), p_summary)
  on conflict (game_id, night) do update
    set seed = excluded.seed, resolved_at = excluded.resolved_at, summary = excluded.summary
    where public.nights.resolved_at is null;
  if not found then
    return false;
  end if;
  insert into public.ledger (game_id, night, player_id, delta, reason, target_id)
  select p_game_id, p_night, e.player_id, e.delta, e.reason, e.target_id
  from jsonb_to_recordset(p_ledger) as e (player_id uuid, delta integer, reason text, target_id uuid);
  return true;
end
$$;

-- Cria o ciclo seguinte em preparação, com os mesmos inscritos. Idempotente: se já houver um ciclo
-- depois de `p_game_id`, não faz nada e devolve null.
create function public.next_cycle(p_game_id bigint, p_start_date date) returns bigint
language plpgsql set search_path = ''
as $$
declare
  new_id bigint;
begin
  perform pg_advisory_xact_lock(p_game_id);
  if exists (select 1 from public.games where id > p_game_id) then
    return null;
  end if;
  insert into public.games (start_date) values (p_start_date) returning id into new_id;
  insert into public.game_players (game_id, player_id)
  select new_id, player_id from public.game_players where game_id = p_game_id;
  return new_id;
end
$$;

-- Só a resolve-night (service_role) escreve. As funções do prazo ficam para quem tem sessão,
-- porque as políticas de `actions` as usam.
revoke execute on function public.apply_night, public.next_cycle from public, anon, authenticated;
revoke execute on function public.night_at, public.night_is_open from public, anon;

-- De hora a hora, ao minuto 0: apanha as 00:00 de Lisboa no verão e no inverno. A função converte a
-- hora para Lisboa e só faz o que ainda falta. O URL do projeto e a chave service_role vêm do Vault
-- (segredos `project_url` e `service_role_key`, criados à mão em cada projeto; nunca no código).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'resolve-night',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/resolve-night',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  )
  $$
);
