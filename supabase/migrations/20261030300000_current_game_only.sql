-- Decisão do Walter (PR #29): uma partida são as 9 rondas, e só se vê a partida atual da sala, com as suas
-- rondas. As partidas anteriores deixam de se ver, mesmo para quem as jogou. Não se entra a meio (já era assim).
-- "Atual" = a partida mais recente da sala, enquanto a sala não voltar ao lobby: Reiniciar acaba-a e a
-- seguinte só começa no Começar. Vale para tudo o que é de uma partida: o jogo, os jogadores, as noites, o
-- ranking, as minhas ações e o meu ledger.

create or replace function public.is_game_player(p_game_id bigint) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.games g
    join public.rooms r on r.id = g.room_id
    join public.game_players gp on gp.game_id = g.id
    where g.id = p_game_id
      and gp.player_id = (select auth.uid())
      and r.status <> 'lobby'
      and g.id = (select max(latest.id) from public.games latest where latest.room_id = g.room_id)
  )
$$;
comment on function public.is_game_player(bigint) is
  'Jogo na partida atual da sala (a mais recente, com a sala fora do lobby). Só essa se vê.';

-- Nomes: de quem está numa sala comigo ou na minha partida atual.
create or replace function public.shares_game(p_player_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.game_players mine join public.game_players other on other.game_id = mine.game_id
    where mine.player_id = (select auth.uid()) and other.player_id = p_player_id and public.is_game_player(mine.game_id)
  )
$$;

-- As minhas ações e o meu ledger também só da partida atual.
drop policy "lê as suas" on public.actions;
create policy "lê as suas da partida atual" on public.actions for select to authenticated
using (player_id = (select auth.uid()) and public.is_game_player(game_id));

drop policy "lê os seus" on public.ledger;
create policy "lê os seus da partida atual" on public.ledger for select to authenticated
using (player_id = (select auth.uid()) and public.is_game_player(game_id));
