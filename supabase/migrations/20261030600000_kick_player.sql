-- T22: expulsar jogadores do lobby (RULES.md §1.1 v9). Só o admin, só numa sala de pessoas em lobby, e nunca a
-- si próprio. Quem é expulso sai da sala e, com o código, pode voltar a entrar (não há lista de banidos).
-- Migração só aditiva: uma função nova. Apaga só a linha de `room_players` desse jogador nessa sala: não toca na
-- conta, em outras salas nem em partidas (com a sala em lobby, a lista de jogadores ainda não está fixa).
create function public.kick_player(p_room_id bigint, p_player_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  room constant public.rooms := public.my_room_for_update(p_room_id);
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
  if p_player_id = room.admin_id then
    raise exception 'CANNOT_KICK_SELF';
  end if;
  delete from public.room_players where room_id = room.id and player_id = p_player_id;
  if not found then
    raise exception 'PLAYER_NOT_IN_ROOM';
  end if;
end
$$;
revoke execute on function public.kick_player from public, anon;
