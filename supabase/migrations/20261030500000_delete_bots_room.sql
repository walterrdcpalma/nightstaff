-- T17: apagar a sala contra bots (RULES.md §1.2 v8). Só o admin, só numa sala contra bots, a qualquer momento
-- (a meio ou acabada). Nas salas com pessoas isto não existe. Migração só aditiva: uma função nova.
--
-- Apagar a sala apaga tudo o que era dela, numa só instrução (logo, numa só transação), pelas FKs `on delete
-- cascade` que já existem: rooms → games → game_players, actions, nights, ledger, rankings; rooms → room_players;
-- rooms → players.bot_room_id (os bots, e com eles as suas linhas). Não toca em outras salas nem na conta do
-- jogador (a pessoa não tem `bot_room_id`).
create function public.delete_bots_room(p_room_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  room constant public.rooms := public.my_room_for_update(p_room_id);
begin
  if room.admin_id <> (select auth.uid()) then
    raise exception 'NOT_ADMIN';
  end if;
  if room.kind <> 'bots' then
    raise exception 'NOT_BOTS_ROOM';
  end if;
  delete from public.rooms where id = room.id;
end
$$;
revoke execute on function public.delete_bots_room from public, anon;
