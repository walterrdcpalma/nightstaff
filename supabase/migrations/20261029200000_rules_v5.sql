-- T2d: regras v5 na BD (RULES.md §2 e §4).
-- 1. Ação VANISH (Desaparecer): quota 2, sem alvo.
-- 2. Não atacar a mesma pessoa duas noites seguidas (Visita e Reunião contam), como o `validateAction`.
-- 3. nights.summary público só com casa/fora e apanhados.

alter table public.actions drop constraint actions_type_check;
alter table public.actions add constraint actions_type_check
  check (type in ('STAY', 'DEFEND', 'ATTACK', 'BOMB', 'VANISH'));

-- Mesmas regras e códigos do `validateAction` (engine/validateAction.ts), mais o prazo.
-- A mensagem do erro é o código, para a app a traduzir.
create or replace function public.validate_action() returns trigger
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
  if new.type not in ('STAY', 'DEFEND', 'ATTACK', 'BOMB', 'VANISH') then
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
    -- O alvo da Visita ou Reunião do próprio jogador na noite anterior (RULES.md §2).
    if exists (
      select 1 from public.actions p
      where p.game_id = new.game_id and p.player_id = new.player_id and p.night = new.night - 1
        and p.type in ('ATTACK', 'BOMB') and p.target_id = new.target_id
    ) then
      raise exception 'SAME_TARGET';
    end if;
  elsif new.target_id is not null then
    raise exception 'UNEXPECTED_TARGET';
  end if;

  -- Quotas (RULES.md §2), contando as noites anteriores deste jogo.
  if new.type <> 'STAY' then
    select count(*) into used from public.actions
    where game_id = new.game_id and player_id = new.player_id and type = new.type and night < new.night;
    if used >= (
      select q from (values ('DEFEND', 2), ('ATTACK', 3), ('BOMB', 1), ('VANISH', 2)) as quotas (type, q)
      where quotas.type = new.type
    ) then
      raise exception 'QUOTA_EXHAUSTED';
    end if;
  end if;
  return new;
end
$$;

-- Resumos antigos (v4) para o formato público v5: casa/fora por jogador e a lista de apanhados
-- (os atacantes revelados pelas defesas). Tudo o resto sai do público.
update public.nights n
set summary = jsonb_build_object(
  'players', (
    select coalesce(jsonb_agg(jsonb_build_object('playerId', p->>'playerId', 'location', p->>'location') order by i), '[]'::jsonb)
    from jsonb_array_elements(n.summary->'players') with ordinality as t (p, i)
  ),
  'caught', (
    select coalesce(jsonb_agg(c order by c), '[]'::jsonb)
    from jsonb_array_elements(n.summary->'players') as t (p), jsonb_array_elements_text(p->'revealedAttackers') as r (c)
  )
)
where n.summary is not null and not n.summary ? 'caught';
