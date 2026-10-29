-- T11: salas contra bots (RULES.md §1.2). Os bots são jogadores sem conta, só de uma sala: vivem em `players`
-- com `bot_room_id`, para as ações, o ledger, os rankings e os nomes funcionarem como com as pessoas.
-- O tempo não segue o relógio: a noite aberta é a seguinte à última resolvida, e acaba quando o jogador carrega
-- em ⏭️ Passar o dia (resolve-night com o JWT do jogador). A sala começa logo; ninguém mais entra.

-- 1. Bots em `players`. Um bot não tem conta: o `id` deixa de apontar para `auth.users`, e apagar uma conta
--    apaga o seu jogador por trigger (como fazia a FK).
alter table public.players drop constraint players_id_fkey;
alter table public.players add column bot_room_id bigint references public.rooms (id) on delete cascade;
comment on column public.players.bot_room_id is
  'Sala do bot (RULES.md §1.2); null nas pessoas. Um bot só existe nessa sala e não tem conta.';

create function public.delete_player() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.players where id = old.id;
  return old;
end
$$;
revoke execute on function public.delete_player from public, anon, authenticated;
create trigger delete_player after delete on auth.users for each row execute function public.delete_player();

-- Cada um cria e muda só o seu jogador, e nunca um bot.
drop policy "cria o próprio" on public.players;
create policy "cria o próprio" on public.players for insert to authenticated
with check (id = (select auth.uid()) and bot_room_id is null);
drop policy "muda o próprio nome" on public.players;
create policy "muda o próprio nome" on public.players for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()) and bot_room_id is null);

-- 2. Noite aberta: numa sala de pessoas, a do relógio (Lisboa); numa sala contra bots, a seguinte à última
--    resolvida, a qualquer hora.
create or replace function public.night_is_open(p_game_id bigint, p_night integer) returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.games g join public.rooms r on r.id = g.room_id
    where g.id = p_game_id and g.status = 'running'
      and (
        (r.kind = 'people' and p_night = public.night_at(g.start_date, now()))
        or (r.kind = 'bots' and p_night = 1 + (
          select count(*) from public.nights n where n.game_id = g.id and n.resolved_at is not null
        ))
      )
  )
$$;

-- 3. Começar uma partida com os jogadores da sala (interno: start_room, create_bots_room e restart_room).
create function public.begin_game(p_room_id bigint) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  new_game bigint;
begin
  insert into public.games (room_id, start_date) values (p_room_id, (now() at time zone 'Europe/Lisbon')::date)
  returning id into new_game;
  insert into public.game_players (game_id, player_id)
  select new_game, rp.player_id from public.room_players rp where rp.room_id = p_room_id;
  update public.rooms set status = 'running' where id = p_room_id;
  return new_game;
end
$$;
revoke execute on function public.begin_game from public, anon, authenticated;

create or replace function public.start_room(p_room_id bigint) returns bigint
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
  if (select count(*) from public.room_players where room_id = room.id) < 3 then
    raise exception 'TOO_FEW_PLAYERS';
  end if;
  return public.begin_game(room.id);
end
$$;

-- 4. Sala contra bots: o admin escolhe de 2 a 11 bots, com nomes do staff. Começa logo (ninguém mais entra).
create function public.create_bots_room(p_bots integer) returns public.rooms
language plpgsql security definer set search_path = ''
as $$
declare
  me constant uuid := (select auth.uid());
  staff constant text[] := array[
    'Rececionista', 'Porteiro', 'Cozinheira', 'Barman', 'Camareira', 'Paquete',
    'Governanta', 'Bagageiro', 'Sommelier', 'Jardineiro', 'Lavadeira'
  ];
  room public.rooms;
  bot uuid;
begin
  if not exists (select 1 from public.players where id = me and bot_room_id is null) then
    raise exception 'NO_NAME';
  end if;
  if p_bots is null or p_bots not between 2 and 11 then
    raise exception 'BOT_COUNT';
  end if;
  loop
    begin
      insert into public.rooms (admin_id, kind) values (me, 'bots') returning * into room;
      exit;
    exception when unique_violation then
      -- Código repetido: sorteia outro.
    end;
  end loop;
  insert into public.room_players (room_id, player_id) values (room.id, me);
  for i in 1..p_bots loop
    insert into public.players (id, name, bot_room_id) values (gen_random_uuid(), 'Bot ' || staff[i], room.id)
    returning id into bot;
    insert into public.room_players (room_id, player_id) values (room.id, bot);
  end loop;
  perform public.begin_game(room.id);
  select * into room from public.rooms where id = room.id;
  return room;
end
$$;
revoke execute on function public.create_bots_room from public, anon;

-- 5. Reiniciar: numa sala de pessoas volta ao lobby; numa sala contra bots começa logo outra partida, com os
--    mesmos bots (não há lobby: ninguém entra nem sai).
create or replace function public.restart_room(p_room_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  room constant public.rooms := public.my_room_for_update(p_room_id);
begin
  if room.admin_id <> (select auth.uid()) then
    raise exception 'NOT_ADMIN';
  end if;
  if room.status <> 'finished' then
    raise exception 'ROOM_NOT_FINISHED';
  end if;
  if room.kind = 'bots' then
    perform public.begin_game(room.id);
  else
    update public.rooms set status = 'lobby' where id = room.id;
  end if;
end
$$;
