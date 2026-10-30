-- T23: painel de administração da app (RULES.md §7 v10). Uma conta, a do Walter, vê todas as salas, só com
-- metadados: código, tipo, estado, admin da sala, nomes dos jogadores, datas e a noite em curso. Nunca ações,
-- pontos, ledger nem rankings. Só vê: não altera nada.
-- Migração só aditiva: uma tabela e duas funções novas. Nenhuma política RLS muda: a única porta é a
-- `admin_list_rooms()`, e o admin da app continua a ler as tabelas de jogo como qualquer jogador.

-- Quem é o admin da app. RLS ligada e nenhuma política: ninguém a lê nem escreve pela API. O email não vai no
-- código: o Walter insere a linha à mão em cada projeto, no SQL Editor (DEPLOY.md).
create table public.app_admins (
  player_id uuid primary key references public.players (id) on delete cascade
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

-- Sou o admin da app? Para o web mostrar (ou não) o botão do painel. Para os outros, `false`.
create function public.is_app_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.app_admins where player_id = (select auth.uid()));
$$;

-- Todas as salas, uma linha por sala, só com metadados. A partida é a atual (a mais recente), e só fora do lobby:
-- depois de Reiniciar, a sala volta ao lobby sem partida. `resolved_nights` serve para o web calcular a noite em
-- curso, como nas outras salas (`openNight` nas de pessoas, `botsNight` nas de bots).
create function public.admin_list_rooms()
returns table (
  room_id bigint,
  code text,
  kind text,
  status text,
  admin_name text,
  players text[],
  created_at timestamptz,
  start_date date,
  resolved_nights integer,
  last_resolved_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'NOT_APP_ADMIN';
  end if;
  return query
  select r.id, r.code, r.kind, r.status, a.name,
    coalesce((select array_agg(p.name order by rp.joined_at, p.name)
              from public.room_players rp join public.players p on p.id = rp.player_id
              where rp.room_id = r.id), '{}'),
    r.created_at, g.start_date,
    (select count(*)::int from public.nights n where n.game_id = g.id),
    (select max(n.resolved_at) from public.nights n where n.game_id = g.id)
  from public.rooms r
  join public.players a on a.id = r.admin_id
  left join lateral (
    select gg.id, gg.start_date from public.games gg
    where gg.room_id = r.id and r.status <> 'lobby'
    order by gg.id desc limit 1
  ) g on true
  order by r.created_at desc, r.id desc;
end
$$;

revoke execute on function public.is_app_admin, public.admin_list_rooms from public, anon;
