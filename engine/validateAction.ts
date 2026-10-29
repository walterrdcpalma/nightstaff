import { QUOTAS } from './types.ts';
import type { Action, ActionType, GameState, PlayerId } from './types.ts';

export type ValidationError =
  | 'UNKNOWN_PLAYER'
  | 'UNKNOWN_TYPE'
  | 'TARGET_REQUIRED'
  | 'UNEXPECTED_TARGET'
  | 'SELF_TARGET'
  | 'UNKNOWN_TARGET'
  | 'QUOTA_EXHAUSTED';

export type ValidationResult = { ok: true } | { ok: false; error: ValidationError };

/** Quotas que o jogador ainda tem, contando as ações de `state.pastActions` (RULES.md §2). */
export function remainingQuota(state: GameState, playerId: PlayerId): Record<ActionType, number> {
  const remaining = { ...QUOTAS };
  for (const a of state.pastActions) {
    if (a.playerId === playerId) remaining[a.type]--;
  }
  return remaining;
}

/** Valida alvo e quota de uma ação, no momento de submeter (RULES.md §2). */
export function validateAction(state: GameState, action: Action): ValidationResult {
  const fail = (error: ValidationError): ValidationResult => ({ ok: false, error });

  if (!state.players.includes(action.playerId)) return fail('UNKNOWN_PLAYER');
  if (!Object.hasOwn(QUOTAS, action.type)) return fail('UNKNOWN_TYPE');

  if (action.type === 'ATTACK' || action.type === 'BOMB') {
    if (action.targetId == null) return fail('TARGET_REQUIRED');
    if (action.targetId === action.playerId) return fail('SELF_TARGET');
    if (!state.players.includes(action.targetId)) return fail('UNKNOWN_TARGET');
  } else if (action.targetId != null) {
    return fail('UNEXPECTED_TARGET');
  }

  if (remainingQuota(state, action.playerId)[action.type] <= 0) return fail('QUOTA_EXHAUSTED');
  return { ok: true };
}
