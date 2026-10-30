// Escolha da noite em cartas (T18): o estado de cada carta e os avatares dos alvos. Lógica pura, testada em
// cards.test.ts. As quotas vêm do engine/ (`QUOTAS` e `remainingQuota`): aqui só se desenham.
import { ACTION_TYPES, QUOTAS } from '../../../engine/index.ts';
import type { ActionType, LimitedActionType } from '../../../engine/index.ts';
import { ACTION_TEXT } from './help.ts';
import { ACTION_NAMES } from './today.ts';

export interface ActionCard {
  type: ActionType;
  /** Nome na app, com o ícone (RULES.md §2). */
  name: string;
  /** O que a ação faz, como na Ajuda. */
  text: string;
  /** Quota em pontinhos: `true` = por gastar. `null` na Folga (∞). */
  dots: boolean[] | null;
  /** Quota esgotada: a carta fica desligada, com o motivo. */
  disabled: boolean;
  reason: string | null;
  selected: boolean;
}

/** Motivo de uma carta desligada. */
export const QUOTA_EXHAUSTED_CARD_TEXT = 'Já a gastaste toda nesta partida.';

/** As cinco cartas, pela ordem da app, com a quota que me resta e a escolha atual realçada. */
export function actionCards(remaining: Record<LimitedActionType, number>, selected: ActionType): ActionCard[] {
  return ACTION_TYPES.map((type) => {
    const left = type === 'STAY' ? null : remaining[type];
    const disabled = left === 0;
    return {
      type,
      name: ACTION_NAMES[type],
      text: ACTION_TEXT[type],
      dots: type === 'STAY' ? null : Array.from({ length: QUOTAS[type] }, (_, i) => i < left!),
      disabled,
      reason: disabled ? QUOTA_EXHAUSTED_CARD_TEXT : null,
      selected: type === selected,
    };
  });
}

/** Cores dos avatares: fortes, com texto escuro por cima, e longe do perigo e da defesa do tema. */
export const AVATAR_COLORS = ['#F5C542', '#7FDBCA', '#FF9F6B', '#C3A6FF', '#9BE36B', '#FF8FC7', '#6FD3FF', '#F0E68C'] as const;

/** Cor estável do avatar, derivada do id do jogador (FNV-1a): a mesma em todos os ecrãs e browsers, sem a BD. */
export function avatarColor(id: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return AVATAR_COLORS[(hash >>> 0) % AVATAR_COLORS.length];
}

/** Inicial do avatar. Nos bots ("Bot Porteiro") é a do posto, senão seriam todos "B". */
export function avatarInitial(name: string): string {
  const words = name.trim().split(/\s+/);
  const word = words.length > 1 && words[0] === 'Bot' ? words[1] : words[0];
  return (Array.from(word)[0] ?? '?').toLocaleUpperCase('pt-PT');
}
