-- T6b: o ledger é privado para sempre (RULES.md §4 v5: "só o próprio vê", também no histórico).
-- No dia 11 só o ranking final é público: calcula-o a resolve-night (finalRanking do engine/) e grava-o aqui.

create table public.rankings (
  game_id bigint not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  -- 1 = Funcionário do Mês. Sempre de 1 a N, sem posições repetidas (RULES.md §5).
  rank integer not null,
  points integer not null,
  successful_attacks integer not null,
  primary key (game_id, player_id),
  unique (game_id, rank)
);
alter table public.rankings enable row level security;

-- Todos leem o ranking de um ciclo acabado; durante o ciclo, ninguém.
create policy "todos leem no fim" on public.rankings for select to authenticated
using (exists (select 1 from public.games g where g.id = game_id and g.status = 'finished'));

-- Pontos: só os próprios, sempre. O ranking do dia 11 vem de `rankings`.
drop policy "lê os seus ou no fim" on public.ledger;
create policy "lê os seus" on public.ledger for select to authenticated
using (player_id = (select auth.uid()));

-- Acaba o ciclo e grava a seed do desempate e o ranking final numa só transação. Idempotente: se o
-- ciclo já não estiver a correr, não faz nada e devolve false.
create function public.finish_game(p_game_id bigint, p_seed integer, p_ranking jsonb) returns boolean
language plpgsql set search_path = ''
as $$
begin
  update public.games set status = 'finished', seed = p_seed where id = p_game_id and status = 'running';
  if not found then
    return false;
  end if;
  insert into public.rankings (game_id, player_id, rank, points, successful_attacks)
  select p_game_id, r.player_id, r.rank, r.points, r.successful_attacks
  from jsonb_to_recordset(p_ranking) as r (player_id uuid, rank integer, points integer, successful_attacks integer);
  return true;
end
$$;
revoke execute on function public.finish_game from public, anon, authenticated;

comment on function public.validate_action() is
  'Mesmas regras e códigos do validateAction (engine/). O SAME_TARGET olha para a ação gravada da noite '
  'anterior e o motor para a ação já validada (uma inválida passa a STAY). A diferença é irrelevante: '
  'este trigger não deixa gravar ações inválidas.';
