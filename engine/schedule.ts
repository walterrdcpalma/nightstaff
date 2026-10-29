// O que a `resolve-night` faz a seguir num ciclo (RULES.md §1, CLAUDE.md "Resolução da noite"). Funções puras.
import { CYCLE_DAYS, NIGHTS, addDays, cycleDay } from './cycle.ts';
import { validateAction } from './validateAction.ts';
import type { ValidationError } from './validateAction.ts';
import type { Action, GameState, PastAction, PlayerId } from './types.ts';

/** Mínimo de inscritos para o ciclo arrancar (RULES.md §1). */
export const MIN_PLAYERS = 3;

export interface CycleState {
  /** Dia 1 (preparação), `YYYY-MM-DD` em Lisboa. */
  startDate: string;
  status: 'prep' | 'running' | 'finished';
  /** Inscritos no ciclo. */
  players: number;
  /** Noites já resolvidas, seguidas a partir da 1. */
  resolvedNights: number;
}

export type Step =
  | { kind: 'START' }
  | { kind: 'POSTPONE'; startDate: string }
  | { kind: 'RESOLVE'; night: number }
  | { kind: 'FINISH' }
  | { kind: 'NEXT_CYCLE'; startDate: string };

/**
 * Próximo passo do ciclo mais recente em `today` (data de Lisboa), ou `null` se não há nada a fazer.
 * Aplica-se um passo de cada vez e volta-se a chamar até dar `null`: assim recupera noites em atraso.
 * - Preparação, a partir do dia 2: arranca com `MIN_PLAYERS` ou mais; senão, adia o dia 1 para o dia seguinte.
 *   Se o cron falhar vários dias, o arranque é tardio e as noites que já passaram resolvem-se logo, todos em STAY.
 * - A correr: a noite N resolve-se às 00:00 do dia N + 2 (a escolha é no dia N + 1). Depois da 9, acaba.
 * - Acabado: no dia a seguir à resolução (dia 12) cria o ciclo seguinte, que começa nesse dia.
 */
export function nextStep(game: CycleState, today: string): Step | null {
  const day = cycleDay(game.startDate, today);
  switch (game.status) {
    case 'prep':
      if (day < 2) return null;
      return game.players >= MIN_PLAYERS ? { kind: 'START' } : { kind: 'POSTPONE', startDate: addDays(game.startDate, 1) };
    case 'running': {
      if (game.resolvedNights >= NIGHTS) return { kind: 'FINISH' };
      const night = game.resolvedNights + 1;
      return day >= night + 2 ? { kind: 'RESOLVE', night } : null;
    }
    case 'finished':
      return day > CYCLE_DAYS ? { kind: 'NEXT_CYCLE', startDate: addDays(game.startDate, CYCLE_DAYS) } : null;
  }
}

/** Ação guardada, com a noite. */
export type StoredAction = PastAction;

export interface InvalidAction {
  night: number;
  action: Action;
  error: ValidationError | 'DUPLICATE';
}

export interface NightInput {
  state: GameState;
  /** Ações válidas da noite, para o `resolveNight`. Quem não tem ação fica com STAY. */
  actions: Action[];
  /** Ações inválidas desta noite, tratadas como STAY. */
  invalid: InvalidAction[];
}

/**
 * Prepara a resolução da noite `night` a partir das ações guardadas do ciclo (noites 1 a `night`).
 * Uma ação inválida não bloqueia a noite: fica de fora (STAY) e vem em `invalid`.
 * As quotas contam só as ações válidas das noites anteriores, validadas noite a noite.
 */
export function prepareNight(players: PlayerId[], stored: StoredAction[], night: number): NightInput {
  if (!Number.isInteger(night) || night < 1 || night > NIGHTS) {
    throw new RangeError(`Noite inválida: ${night} (esperado 1 a ${NIGHTS})`);
  }
  const past: PastAction[] = [];
  for (let n = 1; ; n++) {
    const state: GameState = { players, night: n, pastActions: [...past] };
    const actions: Action[] = [];
    const invalid: InvalidAction[] = [];
    const seen = new Set<PlayerId>();
    for (const s of stored.filter((a) => a.night === n)) {
      const action: Action = { playerId: s.playerId, type: s.type, targetId: s.targetId ?? null };
      const check = seen.has(s.playerId) ? { ok: false as const, error: 'DUPLICATE' as const } : validateAction(state, action);
      seen.add(s.playerId);
      if (check.ok) actions.push(action);
      else invalid.push({ night: n, action, error: check.error });
    }
    if (n === night) return { state, actions, invalid };
    past.push(...actions.map((a) => ({ ...a, night: n })));
  }
}
