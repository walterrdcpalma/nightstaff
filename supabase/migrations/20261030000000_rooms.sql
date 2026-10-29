-- T9: salas (RULES.md §1 v6). Cada sala tem uma partida de cada vez; os ciclos automáticos acabam.
-- Quem não está na sala não vê nada dela. Entrar, sair, começar e reiniciar só pelas funções abaixo.

-- 1. Os ciclos antigos saem (decisão do Walter): os jogos apagam ações, noites, ledger e rankings em cascata.
-- As contas e os `players` ficam.
delete from public.games;
drop function public.next_cycle(bigint, date);

-- 2. Jogadores: com o registo aberto, cada um cria o seu `players` no primeiro login, com o nome que escolher.
alter table public.players add constraint players_name_check
  check (name = btrim(name) and char_length(name) between 1 and 24);

-- 3. Salas.
-- Código de 6 caracteres sem letras ambíguas (sem 0/O nem 1/I/L), sorteado com `gen_random_uuid` (aleatório
-- forte: quem tem o código entra no lobby).
create function public.new_room_code() returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes constant bytea := uuid_send(gen_random_uuid());
  code text := '';
begin
  for i in 0..5 loop
    code := code || substr(alphabet, get_byte(bytes, i) % length(alphabet) + 1, 1);
  end loop;
  return code;
end
$$;

create table public.rooms (
  id bigint generated always as identity primary key,
  code text not null unique default public.new_room_code() check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$'),
  admin_id uuid not null references public.players (id) on delete cascade,
  -- `bots`: sala contra bots (RULES.md §1.2, T11). A resolve-night só trata das salas `people`.
  kind text not null default 'people' check (kind in ('people', 'bots')),
  -- Igual ao estado da partida mais recente; `lobby` antes de começar e depois de reiniciar.
  status text not null default 'lobby' check (status in ('lobby', 'running', 'finished')),
  created_at timestamptz not null default now()
);

create table public.room_players (
  room_id bigint not null references public.rooms (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  -- Ordem de entrada: se o admin sair, passa a admin quem entrou há mais tempo.
  joined_at timestamptz not null default clock_timestamp(),
  primary key (room_id, player_id)
);
create index room_players_player on public.room_players (player_id);

-- 4. Partidas: um jogo é uma partida de uma sala. A lista de jogadores (`game_players`) fixa-se no Começar.
alter table public.games add column room_id bigint not null references public.rooms (id) on delete cascade;
create index games_room on public.games (room_id);
alter table public.games drop constraint games_status_check;
alter table public.games add constraint games_status_check check (status in ('running', 'finished'));
alter table public.games alter column status set default 'running';
comment on column public.games.start_date is
  'Dia da noite 1 em Lisboa: o dia em que o admin carregou em Começar (RULES.md §1.1).';

-- A noite 1 é o dia do Começar; a noite N é o dia N e fecha às 00:00 de Lisboa.
create or replace function public.night_at(p_start_date date, p_at timestamptz) returns integer
language sql stable set search_path = ''
as $$ select (p_at at time zone 'Europe/Lisbon')::date - p_start_date + 1 $$;

-- 5. Quem pertence a quê. `security definer` para as políticas não se chamarem umas às outras em ciclo.
create function public.is_room_member(p_room_id bigint) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.room_players where room_id = p_room_id and player_id = (select auth.uid()))
$$;

create function public.is_game_member(p_game_id bigint) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.games g join public.room_players rp on rp.room_id = g.room_id
    where g.id = p_game_id and rp.player_id = (select auth.uid())
  )
$$;

create function public.shares_room(p_player_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.room_players mine join public.room_players other on other.room_id = mine.room_id
    where mine.player_id = (select auth.uid()) and other.player_id = p_player_id
  )
$$;

-- 6. RLS por sala. As regras de visibilidade v5 (ações e ledger só do próprio) não mudam.
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

drop policy "todos leem" on public.players;
create policy "lê o próprio e quem partilha uma sala" on public.players for select to authenticated
using (id = (select auth.uid()) or public.shares_room(id));
create policy "cria o próprio" on public.players for insert to authenticated
with check (id = (select auth.uid()));
create policy "muda o próprio nome" on public.players for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "os da sala leem" on public.rooms for select to authenticated
using (public.is_room_member(id));
create policy "os da sala leem" on public.room_players for select to authenticated
using (public.is_room_member(room_id));

drop policy "todos leem" on public.games;
create policy "os da sala leem" on public.games for select to authenticated
using (public.is_room_member(room_id));

drop policy "todos leem" on public.game_players;
drop policy "entra na preparação" on public.game_players;
drop policy "sai na preparação" on public.game_players;
create policy "os da sala leem" on public.game_players for select to authenticated
using (public.is_game_member(game_id));

drop policy "todos leem resolvidas" on public.nights;
create policy "os da sala leem resolvidas" on public.nights for select to authenticated
using (resolved_at is not null and public.is_game_member(game_id));

drop policy "todos leem no fim" on public.rankings;
create policy "os da sala leem no fim" on public.rankings for select to authenticated
using (
  public.is_game_member(game_id)
  and exists (select 1 from public.games g where g.id = game_id and g.status = 'finished')
);

-- 7. Funções da sala, para quem tem sessão. Os erros são códigos, para a app os traduzir.
-- Cada uma bloqueia a linha da sala, para entrar, sair e começar não se cruzarem.

-- Cria uma sala de pessoas em lobby; quem a cria é o admin e o primeiro jogador.
create function public.create_room() returns public.rooms
language plpgsql security definer set search_path = ''
as $$
declare
  me constant uuid := (select auth.uid());
  room public.rooms;
begin
  if not exists (select 1 from public.players where id = me) then
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

-- Entra com o código (maiúsculas ou minúsculas), só em lobby. Se já lá estiver, não faz nada.
create function public.join_room(p_code text) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  me constant uuid := (select auth.uid());
  room public.rooms;
begin
  if not exists (select 1 from public.players where id = me) then
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

-- Sala de que eu sou jogador, bloqueada; senão, ROOM_NOT_FOUND (quem não está na sala não sabe se ela existe).
create function public.my_room_for_update(p_room_id bigint) returns public.rooms
language plpgsql security definer set search_path = ''
as $$
declare
  room public.rooms;
begin
  select * into room from public.rooms where id = p_room_id for update;
  if not found or not exists (
    select 1 from public.room_players where room_id = p_room_id and player_id = (select auth.uid())
  ) then
    raise exception 'ROOM_NOT_FOUND';
  end if;
  return room;
end
$$;

-- Sai, só em lobby. Se for o admin, passa a admin quem entrou há mais tempo; se não sobrar ninguém, a sala
-- é apagada (com o histórico das partidas anteriores).
create function public.leave_room(p_room_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me constant uuid := (select auth.uid());
  room constant public.rooms := public.my_room_for_update(p_room_id);
  heir uuid;
begin
  if room.status <> 'lobby' then
    raise exception 'ROOM_NOT_IN_LOBBY';
  end if;
  delete from public.room_players where room_id = room.id and player_id = me;
  if room.admin_id = me then
    select player_id into heir from public.room_players where room_id = room.id order by joined_at, player_id limit 1;
    if heir is null then
      delete from public.rooms where id = room.id;
    else
      update public.rooms set admin_id = heir where id = room.id;
    end if;
  end if;
end
$$;

-- Começa a partida: só o admin, em lobby e com 3 ou mais jogadores (MIN_PLAYERS no engine/). A noite 1 abre
-- já e fecha às 23:59 de hoje (Lisboa). A lista de jogadores fica fixa. Devolve o id do jogo.
create function public.start_room(p_room_id bigint) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  room constant public.rooms := public.my_room_for_update(p_room_id);
  new_game bigint;
begin
  if room.admin_id <> (select auth.uid()) then
    raise exception 'NOT_ADMIN';
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

-- Reinicia uma sala acabada: volta ao lobby, com o mesmo código e os mesmos jogadores. As partidas
-- anteriores ficam no histórico.
create function public.restart_room(p_room_id bigint) returns void
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
  update public.rooms set status = 'lobby' where id = room.id;
end
$$;

-- 8. Fim da partida: acaba também a sala. Recusa um ranking vazio (sugestão da revisão do #25), para
-- nunca haver uma partida acabada sem ranking por engano.
create or replace function public.finish_game(p_game_id bigint, p_seed integer, p_ranking jsonb) returns boolean
language plpgsql set search_path = ''
as $$
declare
  game_room bigint;
begin
  if jsonb_array_length(p_ranking) = 0 then
    raise exception 'EMPTY_RANKING';
  end if;
  update public.games set status = 'finished', seed = p_seed where id = p_game_id and status = 'running'
  returning games.room_id into game_room;
  if not found then
    return false;
  end if;
  update public.rooms set status = 'finished' where id = game_room;
  insert into public.rankings (game_id, player_id, rank, points, successful_attacks)
  select p_game_id, r.player_id, r.rank, r.points, r.successful_attacks
  from jsonb_to_recordset(p_ranking) as r (player_id uuid, rank integer, points integer, successful_attacks integer);
  return true;
end
$$;

-- `anon` não chama nada. As funções de pertença servem as políticas; `new_room_code` e
-- `my_room_for_update` são só internas.
revoke execute on function public.new_room_code, public.my_room_for_update from public, anon, authenticated;
revoke execute on function public.is_room_member, public.is_game_member, public.shares_room from public, anon;
revoke execute on function public.create_room, public.join_room, public.leave_room, public.start_room,
  public.restart_room from public, anon;
