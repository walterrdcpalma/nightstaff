import { ACTION_TYPES, QUOTAS } from './types.ts';
import type { Action, GameState, LimitedActionType, PlayerId } from './types.ts';

export type ValidationError =
  | 'UNKNOWN_PLAYER'
  | 'UNKNOWN_TYPE'
  | 'TARGET_REQUIRED'
  | 'UNEXPECTED_TARGET'
  | 'SELF_TARGET'
  | 'UNKNOWN_TARGET'
  | 'SAME_TARGET'
  | 'QUOTA_EXHAUSTED';

export type ValidationResult = { ok: true } | { ok: false; error: ValidationError };

/** Quotas que o jogador ainda tem, contando as ações de `state.pastActions` (RULES.md §2). STAY não tem quota. */
export function remainingQuota(state: GameState, playerId: PlayerId): Record<LimitedActionType, number> {
  const remaining = { ...QUOTAS };
  for (const a of state.pastActions) {
    if (a.playerId === playerId && a.type !== 'STAY') remaining[a.type]--;
  }
  return remaining;
}

/**
 * Alvo da Visita ou Reunião do jogador na noite anterior, se houve. Não o pode atacar outra vez esta noite
 * (RULES.md §2). Uma noite sem ataque pelo meio volta a permitir.
 */
export function previousTarget(state: GameState, playerId: PlayerId): PlayerId | null {
  const a = state.pastActions.find((p) => p.playerId === playerId && p.night === state.night - 1);
  return a && (a.type === 'ATTACK' || a.type === 'BOMB') ? (a.targetId ?? null) : null;
}

/** Valida alvo e quota de uma ação, no momento de submeter (RULES.md §2). */
export function validateAction(state: GameState, action: Action): ValidationResult {
  const fail = (error: ValidationError): ValidationResult => ({ ok: false, error });

  if (!state.players.includes(action.playerId)) return fail('UNKNOWN_PLAYER');
  if (!ACTION_TYPES.includes(action.type)) return fail('UNKNOWN_TYPE');

  if (action.type === 'ATTACK' || action.type === 'BOMB') {
    if (action.targetId == null) return fail('TARGET_REQUIRED');
    if (action.targetId === action.playerId) return fail('SELF_TARGET');
    if (!state.players.includes(action.targetId)) return fail('UNKNOWN_TARGET');
    if (action.targetId === previousTarget(state, action.playerId)) return fail('SAME_TARGET');
  } else if (action.targetId != null) {
    return fail('UNEXPECTED_TARGET');
  }

  if (action.type !== 'STAY' && remainingQuota(state, action.playerId)[action.type] <= 0) {
    return fail('QUOTA_EXHAUSTED');
  }
  return { ok: true };
}
