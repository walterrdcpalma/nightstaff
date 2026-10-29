// O que a `resolve-night` faz a seguir numa partida a decorrer (RULES.md §1.1, CLAUDE.md "Resolução da noite").
// Funções puras.
import { NIGHTS, nightOn } from './cycle.ts';
import { validateAction } from './validateAction.ts';
import type { ValidationError } from './validateAction.ts';
import type { Action, GameState, PastAction, PlayerId } from './types.ts';

/** Mínimo de jogadores para o admin poder começar (RULES.md §1.1). A BD verifica-o no `start_room`. */
export const MIN_PLAYERS = 3;

export interface GameSchedule {
  /** Dia da noite 1 (o dia em que o admin carregou em Começar), `YYYY-MM-DD` em Lisboa. */
  startDate: string;
  /** Noites já resolvidas, seguidas a partir da 1. */
  resolvedNights: number;
}

export type Step = { kind: 'RESOLVE'; night: number } | { kind: 'FINISH' };

/**
 * Próximo passo de uma partida a decorrer em `today` (data de Lisboa), ou `null` se não há nada a fazer.
 * Aplica-se um passo de cada vez e volta-se a chamar até dar `null`: assim recupera noites em atraso.
 * - A noite N escolhe-se no dia N da partida e resolve-se às 00:00 seguintes.
 * - Depois da noite 9, acaba (resolução). Não há partida seguinte: o admin reinicia a sala, se quiser.
 */
export function nextStep(game: GameSchedule, today: string): Step | null {
  if (game.resolvedNights >= NIGHTS) return { kind: 'FINISH' };
  const night = game.resolvedNights + 1;
  return nightOn(game.startDate, today) > night ? { kind: 'RESOLVE', night } : null;
}

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
 * Prepara a resolução da noite `night` a partir das ações guardadas da partida (noites 1 a `night`).
 * Uma ação inválida não bloqueia a noite: fica de fora (STAY) e vem em `invalid`.
 * As quotas contam só as ações válidas das noites anteriores, validadas noite a noite.
 */
export function prepareNight(players: PlayerId[], stored: PastAction[], night: number): NightInput {
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
