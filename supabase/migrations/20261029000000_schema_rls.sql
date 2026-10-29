-- Night Staff: schema e RLS (CLAUDE.md "Dados"; RULES.md §1, §2 e §4).
-- Só o `authenticated` tem políticas: o `anon` não vê nada. Escritas em games, nights e ledger
-- são só da Edge Function (`service_role`, que ignora a RLS).

create table public.players (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null
);

create table public.games (
  id bigint generated always as identity primary key,
  -- Dia 1 (preparação) do ciclo, em hora de Lisboa.
  start_date date not null,
  status text not null default 'prep' check (status in ('prep', 'running', 'finished')),
  -- Seed do ciclo para o sorteio do desempate (RULES.md §5). Preenchida pela resolve-night.
  seed integer
);

create table public.game_players (
  game_id bigint not null references public.games (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  primary key (game_id, player_id)
);

create table public.actions (
  game_id bigint not null references public.games (id) on delete cascade,
  night smallint not null check (night between 1 and 9),
  player_id uuid not null references public.players (id) on delete cascade,
  type text not null check (type in ('STAY', 'DEFEND', 'ATTACK', 'BOMB')),
  target_id uuid references public.players (id) on delete cascade,
  primary key (game_id, night, player_id)
);

create table public.nights (
  game_id bigint not null references public.games (id) on delete cascade,
  night smallint not null check (night between 1 and 9),
  seed integer not null,
  resolved_at timestamptz,
  -- Resumo público (RULES.md §4). Sem pontos.
  summary jsonb,
  primary key (game_id, night)
);

create table public.ledger (
  id bigint generated always as identity primary key,
  game_id bigint not null references public.games (id) on delete cascade,
  night smallint not null check (night between 1 and 9),
  player_id uuid not null references public.players (id) on delete cascade,
  delta integer not null,
  reason text not null,
  -- Alvo da Visita ou Reunião do próprio jogador. Serve o confronto direto (RULES.md §5).
  target_id uuid references public.players (id) on delete cascade
);
create index ledger_game_player on public.ledger (game_id, player_id);

-- Noite em que se escolhe no instante `p_at`: o dia d do ciclo é a noite d − 1, com a data de
-- Lisboa (como `cyclePhase` no engine/). O prazo das 23:59 é a mudança de dia em Lisboa.
create function public.night_at(p_start_date date, p_at timestamptz) returns integer
language sql stable set search_path = ''
as $$ select (p_at at time zone 'Europe/Lisbon')::date - p_start_date $$;

-- A noite `p_night` do jogo está aberta agora: jogo a correr e é a noite atual.
create function public.night_is_open(p_game_id bigint, p_night integer) returns boolean
language sql stable set search_path = ''
as $$
  select exists (
    select 1 from public.games g
    where g.id = p_game_id and g.status = 'running' and public.night_at(g.start_date, now()) = p_night
  )
$$;

-- Mesmas regras e códigos do `validateAction` (engine/validateAction.ts), mais o prazo.
-- A mensagem do erro é o código, para a app a traduzir.
create function public.validate_action() returns trigger
language plpgsql set search_path = ''
as $$
declare
  used integer;
begin
  if tg_op = 'UPDATE' and (new.game_id, new.night, new.player_id) is distinct from (old.game_id, old.night, old.player_id) then
    raise exception 'KEY_CHANGED';
  end if;
  if not public.night_is_open(new.game_id, new.night) then
    raise exception 'NIGHT_CLOSED';
  end if;
  if not exists (select 1 from public.game_players where game_id = new.game_id and player_id = new.player_id) then
    raise exception 'UNKNOWN_PLAYER';
  end if;
  if new.type not in ('STAY', 'DEFEND', 'ATTACK', 'BOMB') then
    raise exception 'UNKNOWN_TYPE';
  end if;

  if new.type in ('ATTACK', 'BOMB') then
    if new.target_id is null then
      raise exception 'TARGET_REQUIRED';
    end if;
    if new.target_id = new.player_id then
      raise exception 'SELF_TARGET';
    end if;
    if not exists (select 1 from public.game_players where game_id = new.game_id and player_id = new.target_id) then
      raise exception 'UNKNOWN_TARGET';
    end if;
  elsif new.target_id is not null then
    raise exception 'UNEXPECTED_TARGET';
  end if;

  -- Quotas (RULES.md §2), contando as noites anteriores deste jogo.
  if new.type <> 'STAY' then
    select count(*) into used from public.actions
    where game_id = new.game_id and player_id = new.player_id and type = new.type and night < new.night;
    if used >= (select q from (values ('DEFEND', 2), ('ATTACK', 3), ('BOMB', 1)) as quotas (type, q) where quotas.type = new.type) then
      raise exception 'QUOTA_EXHAUSTED';
    end if;
  end if;
  return new;
end
$$;

create trigger validate_action before insert or update on public.actions
for each row execute function public.validate_action();

alter table public.players enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.actions enable row level security;
alter table public.nights enable row level security;
alter table public.ledger enable row level security;

create policy "todos leem" on public.players for select to authenticated using (true);
create policy "todos leem" on public.games for select to authenticated using (true);

-- Inscrição: todos leem; cada um entra ou sai só por si e só na preparação (RULES.md §1).
create policy "todos leem" on public.game_players for select to authenticated using (true);
create policy "entra na preparação" on public.game_players for insert to authenticated
with check (
  player_id = (select auth.uid())
  and exists (select 1 from public.games g where g.id = game_id and g.status = 'prep')
);
create policy "sai na preparação" on public.game_players for delete to authenticated
using (
  player_id = (select auth.uid())
  and exists (select 1 from public.games g where g.id = game_id and g.status = 'prep')
);

-- Ações: só as próprias, e só escreve na noite atual até às 23:59 de Lisboa. Não se apagam.
create policy "lê as suas" on public.actions for select to authenticated
using (player_id = (select auth.uid()));
create policy "escolhe na noite atual" on public.actions for insert to authenticated
with check (player_id = (select auth.uid()) and public.night_is_open(game_id, night));
create policy "muda na noite atual" on public.actions for update to authenticated
using (player_id = (select auth.uid()))
with check (player_id = (select auth.uid()) and public.night_is_open(game_id, night));

-- Noites: todos leem, depois de resolvida.
create policy "todos leem resolvidas" on public.nights for select to authenticated
using (resolved_at is not null);

-- Pontos: só os próprios; os de todos quando o ciclo acaba (dia 11).
create policy "lê os seus ou no fim" on public.ledger for select to authenticated
using (
  player_id = (select auth.uid())
  or exists (select 1 from public.games g where g.id = game_id and g.status = 'finished')
);
