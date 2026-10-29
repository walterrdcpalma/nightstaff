-- T10, sugestões da revisão do #27.
-- 1. Uma partida é de quem a jogou (`game_players`), não de quem está agora na sala (RULES.md §4: o histórico
--    fica sempre consultável). Depois de Reiniciar, quem sai no lobby continua a ver as partidas que jogou, e
--    quem entra não vê as partidas onde não jogou. A sala (código, lobby) continua a ser de quem lá está.
-- 2. O `start_room` só começa salas de pessoas: as salas contra bots têm outro arranque (T11).

create function public.is_game_player(p_game_id bigint) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.game_players where game_id = p_game_id and player_id = (select auth.uid()))
$$;

-- Jogou alguma partida com `p_player_id`: vê-lhe o nome nessas partidas, mesmo depois de sair da sala.
create function public.shares_game(p_player_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.game_players mine join public.game_players other on other.game_id = mine.game_id
    where mine.player_id = (select auth.uid()) and other.player_id = p_player_id
  )
$$;
revoke execute on function public.is_game_player, public.shares_game from public, anon;

drop policy "os da sala leem" on public.games;
create policy "quem jogou lê" on public.games for select to authenticated
using (public.is_game_player(id));

drop policy "os da sala leem" on public.game_players;
create policy "quem jogou lê" on public.game_players for select to authenticated
using (public.is_game_player(game_id));

drop policy "os da sala leem resolvidas" on public.nights;
create policy "quem jogou lê resolvidas" on public.nights for select to authenticated
using (resolved_at is not null and public.is_game_player(game_id));

drop policy "os da sala leem no fim" on public.rankings;
create policy "quem jogou lê no fim" on public.rankings for select to authenticated
using (
  public.is_game_player(game_id)
  and exists (select 1 from public.games g where g.id = game_id and g.status = 'finished')
);

drop policy "lê o próprio e quem partilha uma sala" on public.players;
create policy "lê o próprio e quem partilha uma sala ou partida" on public.players for select to authenticated
using (id = (select auth.uid()) or public.shares_room(id) or public.shares_game(id));

drop function public.is_game_member(bigint);

create or replace function public.start_room(p_room_id bigint) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  room constant public.rooms := public.my_room_for_update(p_room_id);
  new_game bigint;
begin
  if room.admin_id <> (select auth.uid()) then
    raise exception 'NOT_ADMIN';
  end if;
  if room.kind <> 'people' then
    raise exception 'NOT_PEOPLE_ROOM';
  end if;
  if room.status <> 'lobby' then
    raise exception 'ROOM_NOT_IN_LOBBY';
  end if;
  if (select count(*) from public.room_players where room_id = room.id) < 3 then
    raise exception 'TOO_FEW_PLAYERS';
  end if;
  insert into public.games (room_id, start_date) values (room.id, (now() at time zone 'Europe/Lisbon')::date)
  returning id into new_game;
  insert into public.game_players (game_id, player_id)
  select new_game, rp.player_id from public.room_players rp where rp.room_id = room.id;
  update public.rooms set status = 'running' where id = room.id;
  return new_game;
end
$$;
