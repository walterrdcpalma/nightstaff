-- Revisão do #29: só uma pessoa (com nome) cria salas ou entra nelas; um bot nunca, mesmo que um dia houvesse
-- um caminho para agir com o id de um bot. Mesmo corpo de antes, com `bot_room_id is null` no `NO_NAME`
-- (como já tinha o `create_bots_room`).

create or replace function public.create_room() returns public.rooms
language plpgsql security definer set search_path = ''
as $$
declare
  me constant uuid := (select auth.uid());
  room public.rooms;
begin
  if not exists (select 1 from public.players where id = me and bot_room_id is null) then
    raise exception 'NO_NAME';
  end if;
  loop
    begin
      insert into public.rooms (admin_id) values (me) returning * into room;
      exit;
    exception when unique_violation then
      -- Código repetido: sorteia outro.
    end;
  end loop;
  insert into public.room_players (room_id, player_id) values (room.id, me);
  return room;
end
$$;

create or replace function public.join_room(p_code text) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  me constant uuid := (select auth.uid());
  room public.rooms;
begin
  if not exists (select 1 from public.players where id = me and bot_room_id is null) then
    raise exception 'NO_NAME';
  end if;
  select * into room from public.rooms where code = upper(btrim(p_code)) for update;
  -- Numa sala contra bots ninguém mais entra (RULES.md §1.2): para quem tenta, é como se não existisse.
  if not found or room.kind <> 'people' then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  if exists (select 1 from public.room_players where room_id = room.id and player_id = me) then
    return room.id;
  end if;
  if room.status <> 'lobby' then
    raise exception 'ROOM_NOT_IN_LOBBY';
  end if;
  insert into public.room_players (room_id, player_id) values (room.id, me);
  return room.id;
end
$$;
